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
];

it('makes only usp_Admin procedures', () => {
  const made = [...code.matchAll(/\b(?:CREATE|ALTER)\s+PROCEDURE\s+dbo\.(\w+)/gi)].map((m) => m[1]!);
  expect(made.length).toBeGreaterThan(0);
  for (const name of made) expect(name).toMatch(/^usp_Admin\w+$/);
  for (const name of PROCEDURES) expect(made).toContain(name);
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
