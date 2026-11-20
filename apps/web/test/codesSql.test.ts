// Redeem codes (2026-11-20, docs/superpowers/specs/2026-11-20-vip-codes-design.md): vip.sql's code tables and
// procedures cannot run here (no SQL Server), so their text is checked, as vipSql.test.ts does for the rest.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('../sql/vip.sql', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const grants = [...sql.matchAll(/GRANT EXECUTE ON OBJECT::dbo\.(\w+) TO \[(\w+)\]/g)].map((m) => [m[1]!, m[2]!] as const);

/** The text of one procedure, from its CREATE to the next GO. */
function body(name: string): string {
  const start = sql.indexOf(`CREATE PROCEDURE dbo.${name}\n`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('\nGO\n', start);
  return sql.slice(start, end);
}

it('makes the code tables only when missing', () => {
  for (const table of ['WEB_CODE', 'WEB_CODE_ITEM', 'WEB_CODE_KEY', 'WEB_CODE_ACCOUNT', 'WEB_CODE_USE', 'WEB_CODE_SENT']) {
    expect(sql, table).toContain(`IF OBJECT_ID(N'dbo.${table}', N'U') IS NULL`);
  }
});

it('keeps one use per account per code and one answer per request id', () => {
  expect(sql).toMatch(/UNIQUE \(codeId, account\)/);
  expect(sql).toMatch(/UNIQUE \(account, requestId\)/);
  expect(sql).toMatch(/keyText varchar\(32\) NOT NULL CONSTRAINT \w+ UNIQUE/);
});

it('locks the key, the code and the VIP rows inside the redeem transaction', () => {
  const redeem = body('usp_WebCodeRedeem');
  expect(redeem).toContain('SET XACT_ABORT ON');
  expect(redeem).toContain('WEB_CODE_KEY WITH (UPDLOCK, HOLDLOCK)');
  expect(redeem).toContain('WEB_CODE WITH (UPDLOCK, HOLDLOCK)');
  expect(redeem).toContain('WEB_VIP WITH (UPDLOCK, HOLDLOCK)');
  const repeat = redeem.indexOf('requestId = @requestId');
  const begin = redeem.indexOf('BEGIN TRANSACTION');
  expect(repeat).toBeGreaterThan(0);
  expect(begin).toBeGreaterThan(repeat);
});

it('reads lists as xml, never STRING_SPLIT', () => {
  const add = body('usp_AdminCodeAdd');
  expect(add).toContain('@keys xml');
  expect(add).toContain('@accounts xml');
  expect(add).toContain('.nodes(');
  const code = sql.replace(/--[^\n]*/g, ''); // the comments may name it
  expect(code).not.toMatch(/STRING_SPLIT/i);
});

it('gives the site only check, redeem and its character lookup, and only the panel writes mail', () => {
  const site = grants.filter(([p, login]) => login === 'flyffweb_site' && p.startsWith('usp_WebCode')).map(([p]) => p).sort();
  expect(site).toEqual(['usp_WebCodeCharacter', 'usp_WebCodeCheck', 'usp_WebCodeRedeem']);
  expect(grants.filter(([p]) => p === 'usp_AdminCodeMailSend')).toEqual([['usp_AdminCodeMailSend', 'flyffweb_admin']]);
  for (const name of ['usp_AdminCodeAdd', 'usp_AdminCodeList', 'usp_AdminCodeGet', 'usp_AdminCodeKeys', 'usp_AdminCodeSave',
    'usp_AdminCodeUses', 'usp_AdminCodePending', 'usp_AdminCodePendingOne', 'usp_AdminCodeMarkDelivered']) {
    expect(grants.filter(([p]) => p === name), name).toEqual([[name, 'flyffweb_admin']]);
  }
});

it('sends a code mail once, keyed on the use, as the gift boxes are', () => {
  const send = body('usp_AdminCodeMailSend');
  expect(send).toContain('WEB_CODE_SENT WITH (UPDLOCK, HOLDLOCK)');
  expect(send).toContain("@serverindex = '51'");
  expect(send).toContain("@iGu = 'A1'");
});

it('mails a bound code\'s items with the game\'s binds flag (owner 2026-11-20: "Bound (can\'t trade)")', () => {
  expect(sql).toContain("IF COL_LENGTH(N'dbo.WEB_CODE', N'bound') IS NULL");
  expect(body('usp_AdminCodeAdd')).toContain('@bound bit');
  expect(body('usp_AdminCodeList')).toContain('c.bound');
  expect(body('usp_AdminCodePending')).toContain('c.bound');
  expect(body('usp_AdminCodePendingOne')).toContain('c.bound');
  expect(body('usp_WebCodeCheck')).toContain('@bound AS bound');
  // CItemElem::binds = 0x02 (_Common/Item.h:119): IsBinds() then blocks trade, drop, post, private shop, guild bank
  // (EXEC takes no expression: the flag goes through a variable)
  const send = body('usp_AdminCodeMailSend');
  expect(send).toContain('SET @flag = CASE WHEN @bound = 1 THEN 2 ELSE 0 END');
  expect(send).toContain('@byFlag = @flag');
});
