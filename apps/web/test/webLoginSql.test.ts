// 2026-11-15 (Guild Siege, final review Minor 6): the siege procedures of web-login.sql leave deleted characters out. A
// character's deletion is soft (CHARACTER_TBL.isblock = 'D', Database.sql's CHARACTER_STR 'D1'), so every join of the
// rankings and the weekly MVP to CHARACTER_TBL carries the null-safe filter.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('../sql/web-login.sql', import.meta.url)), 'utf8');
const procedure = (name: string): string => {
  const start = sql.indexOf(`ALTER PROCEDURE dbo.${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('\nGO', start));
};
const characterJoins = (body: string): string[] =>
  // the ON line and the lines of its condition that follow (each starting with AND)
  [...body.matchAll(/INNER JOIN dbo\.CHARACTER_TBL c ON [^\n]*(?:\n\s+AND [^\n]*)*/g)].map((m) => m[0]);

it('the player ranking and the weekly MVP skip deleted characters (isblock D, null-safe)', () => {
  for (const name of ['usp_WebSiegeRankingPlayer', 'usp_WebSiegeWeekly']) {
    const joins = characterJoins(procedure(name));
    expect(joins.length, name).toBeGreaterThan(0);
    for (const join of joins) expect(join, name).toContain("ISNULL(c.isblock, '') <> 'D'");
  }
});
