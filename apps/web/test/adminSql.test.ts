import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('../sql/admin-login.sql', import.meta.url)), 'utf8');
// the text the server runs: comments taken out, so a word in a comment cannot pass or fail a check
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const PROCEDURES = [
  'usp_AdminLogBegin', 'usp_AdminLogEnd', 'usp_AdminLogRead', 'usp_AdminRecentLogins', 'usp_AdminAccountSearch',
  'usp_AdminAccountGet', 'usp_AdminSetPassword', 'usp_AdminSetEmail', 'usp_AdminSetLoginAuthority', 'usp_AdminSetBlockTime',
  'usp_AdminSetCharacterAuthority', 'usp_AdminCharacterSearch', 'usp_AdminCharacterGet', 'usp_AdminOnlineList',
  'usp_AdminCharacterRename', 'usp_AdminCharacterSetGold', 'usp_AdminCharacterMove', 'usp_AdminCharacterDelete',
  'usp_AdminCharacterUndelete', 'usp_AdminItemSend', 'usp_AdminItemSendList', 'usp_AdminItemSendCancel',
  // 2026-11-17: the paged lists and one character's authority letter
  'usp_AdminAccountPage', 'usp_AdminCharacterPage', 'usp_AdminCharacterAuthority',
];

/** A procedure's text in admin-login.sql, comments taken out. */
function procedure(name: string): string {
  const at = code.search(new RegExp(`CREATE\\s+PROCEDURE\\s+dbo\\.${name}\\b`, 'i'));
  expect(at).toBeGreaterThanOrEqual(0);
  return code.slice(at, code.indexOf('\nGO', at));
}

it('takes the VIP letters and refuses every other letter, compared as bytes (a lower-case one would be past P)', () => {
  for (const name of ['usp_AdminSetLoginAuthority', 'usp_AdminSetCharacterAuthority', 'usp_AdminCharacterAuthority']) {
    const text = procedure(name);
    expect(text).toContain('CAST(@authority AS binary(1)) NOT IN (0x46, 0x41, 0x42, 0x43, 0x45, 0x4A, 0x4C, 0x4D, 0x4E, 0x4F, 0x50)');
    expect(text).toContain('SELECT -1 AS changed');
  }
  expect(procedure('usp_AdminCharacterAuthority')).toMatch(/WHERE m_idPlayer = @idPlayer AND serverindex = '01'/);
});

it('pages with OFFSET / FETCH and gives the total, in both lists', () => {
  for (const name of ['usp_AdminAccountPage', 'usp_AdminCharacterPage']) {
    const text = procedure(name);
    expect(text).toMatch(/@total int OUTPUT/);
    expect(text).toMatch(/SELECT @total = COUNT\(\*\)/);
    expect(text).toMatch(/OFFSET @offset ROWS FETCH NEXT @count ROWS ONLY/);
    expect(text).toMatch(/IF @count IS NULL OR @count < 1 OR @count > 50 SET @count = 10/);
  }
  // the character lists carry each character's own letter
  for (const name of ['usp_AdminCharacterPage', 'usp_AdminCharacterSearch', 'usp_AdminCharacterGet', 'usp_AdminOnlineList']) {
    expect(procedure(name)).toMatch(/m_chAuthority AS authority/);
  }
});

it('checks the new procedures in admin-check.sql, 10 PASS lines', () => {
  const check = readFileSync(fileURLToPath(new URL('../sql/admin-check.sql', import.meta.url)), 'utf8');
  for (const name of ['usp_AdminAccountPage', 'usp_AdminCharacterPage', 'usp_AdminCharacterAuthority', 'usp_AdminSetLoginAuthority', 'usp_AdminSetCharacterAuthority']) {
    expect(check).toContain(name);
  }
  expect([...check.matchAll(/PRINT 'PASS (\d+):/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

it('makes only usp_Admin procedures', () => {
  const made = [...code.matchAll(/\b(?:CREATE|ALTER)\s+PROCEDURE\s+dbo\.(\w+)/gi)].map((m) => m[1]!);
  expect(made.length).toBeGreaterThan(0);
  for (const name of made) expect(name).toMatch(/^usp_Admin\w+$/);
  for (const name of PROCEDURES) expect(made).toContain(name);
  // undo-delete refuses while a live character has taken the name
  expect(code).toContain("SELECT 'name_taken' AS result");
});

it('grants EXECUTE on those procedures and usp_CreateNewAccount, and nothing else', () => {
  const grants = [...code.matchAll(/\bGRANT\b[^\n]*/gi)].map((m) => m[0].trim());
  expect(grants.length).toBeGreaterThanOrEqual(PROCEDURES.length + 1);
  for (const grant of grants) {
    expect(grant).toMatch(/^GRANT EXECUTE ON OBJECT::dbo\.(usp_Admin\w+|usp_CreateNewAccount) TO \[flyffweb_admin\]$/);
  }
  for (const name of [...PROCEDURES, 'usp_CreateNewAccount']) {
    expect(grants).toContain(`GRANT EXECUTE ON OBJECT::dbo.${name} TO [flyffweb_admin]`);
  }
  expect(code).not.toMatch(/\bGRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALTER|CONTROL|REFERENCES|TAKE)/i);
  expect(code).not.toMatch(/\bsp_addrolemember\b|\bALTER\s+ROLE\b|\bALTER\s+SERVER\s+ROLE\b/i);
});

it('builds no SQL from text', () => {
  expect(code).not.toMatch(/\bEXEC(UTE)?\s*\(/i);
  expect(code).not.toMatch(/sp_executesql/i);
});

it('escapes LIKE wildcards in every prefix search', () => {
  const likes = [...code.matchAll(/\bLIKE\s+([^\s]+)/gi)].map((m) => m[1]!);
  expect(likes.length).toBeGreaterThan(0);
  for (const pattern of likes) expect(pattern).toMatch(/^@\w*(pattern|Pattern|Like)\b|^'ADMIN%'$/);
});
