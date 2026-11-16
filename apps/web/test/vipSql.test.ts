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

it('seeds VIP 1-4 at $2, $4, $6 and $10 only where a level is missing', () => {
  expect(sql).toContain("(VALUES (1, N'VIP 1', 200), (2, N'VIP 2', 400), (3, N'VIP 3', 600), (4, N'VIP 4', 1000))");
  expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_TIER t WHERE t.level = v.level)');
});

it('checks the pending limit and the used reference under key locks in the insert\'s transaction', () => {
  const add = sql.slice(sql.indexOf('CREATE PROCEDURE dbo.usp_WebVipRequestAdd'), sql.indexOf('\nGO', sql.indexOf('CREATE PROCEDURE dbo.usp_WebVipRequestAdd')));
  expect(add).toContain('BEGIN TRANSACTION');
  expect(add.match(/WITH \(UPDLOCK, HOLDLOCK\)/g)).toHaveLength(2);
  expect(add).toContain("status IN ('P', 'A')");
});
