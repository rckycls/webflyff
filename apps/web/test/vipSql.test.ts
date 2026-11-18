// vip.sql cannot run here (no SQL Server): its text is checked. Each login gets EXECUTE on its own procedures only, no
// procedure builds SQL from text, and the tiers are seeded at $2 / $4 / $6 / $10 without overwriting the owner's.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('../sql/vip.sql', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const procedures = [...sql.matchAll(/^CREATE PROCEDURE dbo\.(\w+)/gm)].map((m) => m[1]!);
const grants = [...sql.matchAll(/GRANT EXECUTE ON OBJECT::dbo\.(\w+) TO \[(\w+)\]/g)].map((m) => [m[1]!, m[2]!] as const);

it('gives the site the usp_Web* procedures and the panel the usp_Admin* ones, each once, and nothing else', () => {
  expect(procedures.length).toBeGreaterThan(10);
  for (const name of procedures) {
    const login = name.startsWith('usp_Admin') ? 'flyffweb_admin' : 'flyffweb_site';
    expect(grants.filter(([p]) => p === name), name).toEqual([[name, login]]);
  }
  expect(grants).toHaveLength(procedures.length);
  expect(sql).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE|ALTER|CONTROL)/i);
});

it('builds no SQL from text', () => {
  expect(sql).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE\s*\(/i);
});

it('seeds VIP 1-4 at $2, $4, $6 and $10 (P115, P230, P345, P575) only where a level is missing', () => {
  expect(sql).toContain("(VALUES (1, N'VIP 1', 200, 11500), (2, N'VIP 2', 400, 23000), (3, N'VIP 3', 600, 34500), (4, N'VIP 4', 1000, 57500))");
  expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_TIER t WHERE t.level = v.level)');
});

it('checks the pending limit and the used reference under key locks in the insert\'s transaction', () => {
  const add = sql.slice(sql.indexOf('CREATE PROCEDURE dbo.usp_WebVipRequestAdd'), sql.indexOf('\nGO', sql.indexOf('CREATE PROCEDURE dbo.usp_WebVipRequestAdd')));
  expect(add).toContain('BEGIN TRANSACTION');
  expect(add.match(/WITH \(UPDLOCK, HOLDLOCK\)/g)).toHaveLength(2);
  expect(add).toContain("status IN ('P', 'A')");
});

it('forgets only the receipts of requests rejected over @days ago, giving their files', () => {
  const at = sql.indexOf('CREATE PROCEDURE dbo.usp_AdminVipForgetReceipts');
  const forget = sql.slice(at, sql.indexOf('\nGO', at));
  expect(forget).toContain('OUTPUT deleted.receiptFile');
  expect(forget).toContain("WHERE status = 'R' AND receiptFile IS NOT NULL AND decidedAt < DATEADD(day, -@days, SYSUTCDATETIME())");
});

// 2026-11-19 (VIP perks): the website keeps the VIP letter in step with WEB_VIP and sends a gift box per paid month.
const body = (name: string): string => {
  const at = sql.indexOf(`CREATE PROCEDURE dbo.${name}`);
  expect(at, name).toBeGreaterThanOrEqual(0);
  return sql.slice(at, sql.indexOf('\nGO', at));
};
const VIP_OR_PLAYER = 'CAST(m_chLoginAuthority AS binary(1)) IN (0x46, 0x41, 0x42, 0x43, 0x45)';

it('has the VIP perks procedures, in ACCOUNT_DBF and CHARACTER_01_DBF', () => {
  for (const name of [
    'usp_AdminVipGive', 'usp_AdminVipLetterAccounts', 'usp_AdminVipAdopt', 'usp_AdminVipSyncLetters', 'usp_AdminVipGiftsPending',
    'usp_AdminVipGiftMarkSent', 'usp_AdminVipGiftItems', 'usp_AdminVipGiftItemSet', 'usp_AdminVipGiftLog',
    'usp_AdminVipCharacterLetters', 'usp_AdminVipClearCharacterLetters', 'usp_AdminVipGiftSend',
  ]) expect(procedures, name).toContain(name);
  const characters = sql.indexOf('USE [CHARACTER_01_DBF]');
  expect(characters).toBeGreaterThan(0);
  for (const name of ['usp_AdminVipCharacterLetters', 'usp_AdminVipClearCharacterLetters', 'usp_AdminVipGiftSend']) {
    expect(sql.indexOf(`CREATE PROCEDURE dbo.${name}`), name).toBeGreaterThan(characters);
  }
  expect(sql).toContain('CREATE TABLE dbo.WEB_VIP_GIFT (');
  expect(sql).toContain('CREATE TABLE dbo.WEB_VIP_GIFT_ITEM (');
  expect(sql).toContain('CREATE TABLE dbo.WEB_VIP_GIFT_SENT (');
});

it('gives the letter on approve and Give VIP, only over a player or VIP letter, and queues one gift', () => {
  for (const name of ['usp_AdminVipApprove', 'usp_AdminVipGive']) {
    const text = body(name);
    expect(text, name).toContain(VIP_OR_PLAYER);
    expect(text, name).toMatch(/UPDATE dbo\.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = /);
    expect(text, name).toContain('INSERT dbo.WEB_VIP_GIFT (');
  }
  expect(body('usp_AdminVipGive')).toContain('IF @gift = 1');
});

it('compares letters as bytes everywhere (a lower-case letter is past P), never as text', () => {
  for (const name of ['usp_AdminVipApprove', 'usp_AdminVipGive', 'usp_AdminVipLetterAccounts', 'usp_AdminVipSyncLetters',
    'usp_AdminVipCharacterLetters', 'usp_AdminVipClearCharacterLetters']) {
    const text = body(name);
    expect(text, name).toMatch(/AS binary\(1\)\) IN \(/);
    // a comparison against a quoted letter (setting one, `SET m_chAuthority = 'F'`, is fine)
    expect(text, name).not.toMatch(/(WHERE|AND|OR)\s+[\w.]*Authority\s*(=|<>|IN)\s*\(?'/);
  }
});

it('adopts a hand-set VIP letter only for an account with no WEB_VIP row at all, for 30 days, logged', () => {
  const adopt = body('usp_AdminVipAdopt');
  expect(adopt).toContain('IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @account)');
  expect(adopt).toContain('DATEADD(day, 30, @now)');
  expect(adopt).toContain("INSERT dbo.WEB_ADMIN_LOG (admin, address, action, account, result, before, after, endedAt)");
  expect(adopt).not.toContain('WEB_VIP_GIFT');
});

it('sends a gift once: the sent mark is checked first and written with the mails, into server index 51', () => {
  const send = body('usp_AdminVipGiftSend');
  const check = send.indexOf('IF EXISTS (SELECT 1 FROM dbo.WEB_VIP_GIFT_SENT');
  expect(check).toBeGreaterThan(0);
  expect(send.indexOf('EXEC dbo.MAIL_STR')).toBeGreaterThan(check);
  expect(send).toContain('BEGIN TRANSACTION');
  expect(send).toContain("'51'");
  expect(send).toContain('INSERT dbo.WEB_VIP_GIFT_SENT (');
  expect(send).toContain("isblock <> 'D'");
  expect(send).toContain('ORDER BY CASE WHEN MultiServer > 0 THEN 0 ELSE 1 END, TotalPlayTime DESC, m_idPlayer');
  expect(body('usp_AdminVipGiftMarkSent')).toContain('AND sentAt IS NULL');
});

it('lets the site read the latest gift', () => {
  expect(body('usp_WebVipMine')).toContain('FROM dbo.WEB_VIP_GIFT');
});

it('final review fixes: pages the pending gifts, ends a VIP, adopts once, and the sync takes no update lock first', () => {
  expect(body('usp_AdminVipGiftsPending')).toContain('AND id > @afterId');
  const end = body('usp_AdminVipEnd');
  expect(end).toContain(VIP_OR_PLAYER);
  expect(end).toContain("items = 'cancelled'");
  expect(grants).toContainEqual(['usp_AdminVipEnd', 'flyffweb_admin']);
  expect(sql).toContain('CREATE TABLE dbo.WEB_VIP_ADOPTED (');
  const adopt = body('usp_AdminVipAdopt');
  expect(adopt).toContain('IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_ADOPTED WITH (UPDLOCK, HOLDLOCK) WHERE account = @account)');
  expect(body('usp_AdminVipSyncLetters')).not.toContain('UPDLOCK');
});
