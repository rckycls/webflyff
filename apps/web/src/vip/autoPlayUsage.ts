// custom (owner 2026-11-17): Auto Play's weekly hours, counted here per game account, not in the browser (so clearing the
// site's data, another browser or a phone does not start the week again). The game ticks once a minute while its farm
// bot or Support mode runs (`POST /api/autoplay/tick`, siteVip.ts); each tick adds the time since the account's last tick,
// at most 70 s (two tabs ticking in turn count the time once), and a first tick a minute. The week starts on Monday 00:00
// of the server's own clock. The hours by VIP level: normal 14, VIP1 24, VIP2 36, VIP3 48, VIP4 no limit (owner).
// Kept in one small JSON file in the VIP uploads folder (`C:\flyff-web\vip-uploads\autoplay-usage.json` on the VPS), rewritten whole on
// each tick (a temporary file, then a rename). Nobody's password, only account names and milliseconds.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** A tick adds at most this much (ms): the game ticks every 60 s; a later one counts only this. */
export const TICK_MAX_MS = 70_000;
/** A first tick (or one after a pause) counts one minute (ms). */
export const TICK_MS = 60_000;
const DAY_MS = 86_400_000;

/** The weekly minutes for a VIP level (0 normal); null: no limit. */
export function limitMinutes(vipLevel: number): number | null {
  if (vipLevel >= 4) return null;
  if (vipLevel === 3) return 48 * 60;
  if (vipLevel === 2) return 36 * 60;
  if (vipLevel === 1) return 24 * 60;
  return 14 * 60;
}

/** Monday 00:00 (the server's local time) of the week `now` is in. */
export function weekStart(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const sinceMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - sinceMonday);
  return day.getTime();
}

/** The Monday after `week` (a DST-safe 7 days on, at 00:00 local). */
function nextWeek(week: number): number {
  const day = new Date(week + 7 * DAY_MS + DAY_MS / 2);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

interface Entry { usedMs: number; lastTick: number }
interface Saved { week: number; accounts: Record<string, Entry> }

export interface UsageStatus { usedMs: number; weekStart: number; resetsAt: number }

export class AutoPlayUsage {
  private week = 0;
  private accounts = new Map<string, Entry>();

  constructor(private readonly file: string | undefined, private readonly now: () => number) {
    if (file === undefined) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Saved;
      if (typeof saved.week === 'number' && saved.accounts !== null && typeof saved.accounts === 'object') {
        this.week = saved.week;
        for (const [account, entry] of Object.entries(saved.accounts)) {
          if (typeof entry?.usedMs === 'number' && typeof entry.lastTick === 'number') this.accounts.set(account, { ...entry });
        }
      }
    } catch {
      // no file yet, or one that cannot be read: start empty
    }
  }

  status(account: string): UsageStatus {
    this.roll();
    return this.answer(this.accounts.get(account.toLowerCase())?.usedMs ?? 0);
  }

  /**
   * Running time of Auto Play: `ms`, what the game measured since its last tick (a minute, or the part-minute at a stop,
   * 2026-11-18), at most a minute, and never more than the real time since the account's last tick when that was within
   * 70 s (two tabs count the time once). An old game sends none, or a bad one: a minute, as before.
   */
  tick(account: string, ms?: number): UsageStatus {
    this.roll();
    const now = this.now(), key = account.toLowerCase();
    const entry = this.accounts.get(key);
    const since = entry === undefined ? Infinity : now - entry.lastTick;
    const carried = ms !== undefined && Number.isFinite(ms) && ms >= 0 ? Math.min(ms, TICK_MS) : TICK_MS;
    const add = since >= 0 && since <= TICK_MAX_MS ? Math.min(carried, since) : carried;
    const next = { usedMs: (entry?.usedMs ?? 0) + add, lastTick: now };
    this.accounts.set(key, next);
    this.save();
    return this.answer(next.usedMs);
  }

  private answer(usedMs: number): UsageStatus {
    return { usedMs, weekStart: this.week, resetsAt: nextWeek(this.week) };
  }

  /** A new week: everyone's hours again. */
  private roll(): void {
    const week = weekStart(this.now());
    if (week === this.week) return;
    this.week = week;
    this.accounts.clear();
    this.save();
  }

  private save(): void {
    if (this.file === undefined) return;
    const saved: Saved = { week: this.week, accounts: Object.fromEntries(this.accounts) };
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(saved));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // a full disk or a locked file: the hours are kept in memory until the next write works
    }
  }
}
