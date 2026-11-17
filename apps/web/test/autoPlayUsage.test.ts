// custom (owner 2026-11-17): Auto Play's weekly hours, counted on the server per account (src/vip/autoPlayUsage.ts).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutoPlayUsage, limitMinutes, weekStart } from '../src/vip/autoPlayUsage';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A local time (the server's own clock, as the week is Monday 00:00 server time). */
const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();

describe('limitMinutes: the owner\'s hours (2026-11-17)', () => {
  it('normal 14 h, VIP1 24 h, VIP2 36 h, VIP3 48 h, VIP4 no limit', () => {
    expect([0, 1, 2, 3, 4].map(limitMinutes)).toEqual([14 * 60, 24 * 60, 36 * 60, 48 * 60, null]);
    expect(limitMinutes(9)).toBeNull();
    expect(limitMinutes(-1)).toBe(14 * 60);
  });
});

describe('weekStart: Monday 00:00 server time', () => {
  it('a Wednesday and the Monday itself fall in the week that began that Monday; Sunday night in the one before', () => {
    // 2026-11-16 is a Monday
    expect(weekStart(at(2026, 11, 18, 15, 30))).toBe(at(2026, 11, 16));
    expect(weekStart(at(2026, 11, 16, 0, 0))).toBe(at(2026, 11, 16));
    expect(weekStart(at(2026, 11, 22, 23, 59))).toBe(at(2026, 11, 16));
    expect(weekStart(at(2026, 11, 23, 0, 0))).toBe(at(2026, 11, 23));
  });
});

describe('AutoPlayUsage', () => {
  function book(start: number) {
    let now = start;
    const dir = mkdtempSync(path.join(os.tmpdir(), 'autoplay-usage-'));
    dirs.push(dir);
    const file = path.join(dir, 'autoplay-usage.json');
    const usage = new AutoPlayUsage(file, () => now);
    return { usage, file, dir, tick: (ms: number) => { now += ms; }, setNow: (ms: number) => { now = ms; } };
  }

  it('the first tick counts a minute; the next ones the time since, at most 70 s', () => {
    const { usage, tick } = book(at(2026, 11, 18, 10));
    expect(usage.tick('tester1').usedMs).toBe(60_000);
    tick(60_000);
    expect(usage.tick('tester1').usedMs).toBe(120_000);
    tick(30 * 60_000); // a pause: the next tick counts one minute, not the gap
    expect(usage.tick('tester1').usedMs).toBe(180_000);
  });

  it('two tabs of one account ticking in turn count the time once, not twice', () => {
    const { usage, tick } = book(at(2026, 11, 18, 10));
    usage.tick('tester1');
    for (let i = 0; i < 10; i++) { tick(30_000); usage.tick('tester1'); }
    expect(usage.status('tester1').usedMs).toBe(60_000 + 10 * 30_000);
  });

  it('accounts are apart; names are kept in lower case', () => {
    const { usage } = book(at(2026, 11, 18, 10));
    usage.tick('Tester1');
    expect(usage.status('tester1').usedMs).toBe(60_000);
    expect(usage.status('tester2').usedMs).toBe(0);
  });

  it('Monday 00:00 starts the week again; resetsAt is the next Monday', () => {
    const { usage, setNow } = book(at(2026, 11, 22, 23, 58));
    usage.tick('tester1');
    expect(usage.status('tester1').resetsAt).toBe(at(2026, 11, 23));
    setNow(at(2026, 11, 23, 0, 1));
    expect(usage.status('tester1').usedMs).toBe(0);
    expect(usage.tick('tester1').usedMs).toBe(60_000);
  });

  it('kept in its file: a new book on the same file knows the week', () => {
    const { usage, file, setNow } = book(at(2026, 11, 18, 10));
    usage.tick('tester1');
    const again = new AutoPlayUsage(file, () => at(2026, 11, 18, 11));
    expect(again.status('tester1').usedMs).toBe(60_000);
    expect(JSON.parse(readFileSync(file, 'utf8')).week).toBe(at(2026, 11, 16));
    setNow(at(2026, 11, 25));
    expect(new AutoPlayUsage(file, () => at(2026, 11, 25)).status('tester1').usedMs).toBe(0);
  });

  it('an unreadable file starts empty; no file at all works in memory', () => {
    const { dir } = book(at(2026, 11, 18, 10));
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{not json');
    expect(new AutoPlayUsage(bad, () => at(2026, 11, 18)).status('x').usedMs).toBe(0);
    const memory = new AutoPlayUsage(undefined, () => at(2026, 11, 18));
    expect(memory.tick('x').usedMs).toBe(60_000);
  });
});
