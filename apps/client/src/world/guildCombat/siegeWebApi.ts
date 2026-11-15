// 2026-11-15 (Guild Siege, C1): the website's weekly answer (`GET /api/siege/weekly`, apps/web/src/siege.ts), the same
// origin as /play. It feeds the owner's "Weekly Champion" and "Weekly MVP" marks by a player's name (custom, not in Neuz).

/** The answer of `/api/siege/weekly`; times are ISO text with `+08:00`. */
export interface SiegeWeekly {
  champion: { guildId: number; name: string } | null;
  mvp: { playerId: number; name: string } | null;
  endedAt: string | null;
  expiresAt: string | null;
}

export type WeeklyBadge = 'weeklyMvp' | 'weeklyChampion';

export const WEEKLY_URL = '/api/siege/weekly';
export const WEEKLY_EVERY_MS = 5 * 60_000;
export const WEEKLY_TIMEOUT_MS = 3000;
/** setTimeout's longest delay. */
const MAX_TIMER_MS = 2 ** 31 - 1;

const expiresAtOf = (weekly: SiegeWeekly): number => {
  if (weekly.expiresAt === null) return Infinity;
  const at = Date.parse(weekly.expiresAt);
  return Number.isNaN(at) ? Infinity : at;
};

const isId = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

/** Whether a parsed body is a well-formed answer: anything else counts as a failed fetch. */
export function isSiegeWeekly(body: unknown): body is SiegeWeekly {
  if (typeof body !== 'object' || body === null) return false;
  const { champion, mvp, expiresAt } = body as Record<string, unknown>;
  const champion_ok = champion === null || (typeof champion === 'object' && champion !== undefined && isId((champion as Record<string, unknown>).guildId));
  const mvp_ok = mvp === null || (typeof mvp === 'object' && mvp !== undefined && isId((mvp as Record<string, unknown>).playerId));
  const expires_ok = expiresAt === null || (typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt)));
  return champion_ok && mvp_ok && expires_ok;
}

/** A player's mark: the weekly MVP's beats the champion guild's; nothing without an answer, or after `expiresAt`. */
export function badgeOf(weekly: SiegeWeekly | null, playerId: number, guildId: number, now: number): WeeklyBadge | null {
  if (weekly === null || now >= expiresAtOf(weekly)) return null;
  if (weekly.mvp !== null && weekly.mvp.playerId === playerId) return 'weeklyMvp';
  if (weekly.champion !== null && guildId !== 0 && weekly.champion.guildId === guildId) return 'weeklyChampion';
  return null;
}

export interface SiegeWeeklyFeedOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  /** The answer changed or expired: the tags are drawn again. */
  onChange?: () => void;
  timeoutMs?: number;
}

/** Asks for the weekly answer at start and every 5 min, one call in flight, 3 s each; a failure keeps the last good answer. */
export class SiegeWeeklyFeed {
  private last: SiegeWeekly | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight = false;

  constructor(private readonly options: SiegeWeeklyFeedOptions = {}) {}

  private now(): number { return (this.options.now ?? Date.now)(); }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.fetchOnce();
    this.interval = setInterval(() => { void this.fetchOnce(); }, WEEKLY_EVERY_MS);
  }

  stop(): void {
    this.running = false;
    if (this.interval !== undefined) clearInterval(this.interval);
    if (this.expiry !== undefined) clearTimeout(this.expiry);
    this.interval = this.expiry = undefined;
  }

  /** The last good answer, null when there is none or it has expired. */
  current(now: number): SiegeWeekly | null {
    return this.last !== null && now < expiresAtOf(this.last) ? this.last : null;
  }

  private async fetchOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? WEEKLY_TIMEOUT_MS);
    try {
      const fetcher = this.options.fetcher ?? ((url, init) => fetch(url, init));
      const response = await fetcher(WEEKLY_URL, { signal: controller.signal });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (!isSiegeWeekly(body)) return;
      if (!this.running) return;
      const changed = JSON.stringify(body) !== JSON.stringify(this.last);
      this.last = body;
      this.armExpiry();
      if (changed) this.options.onChange?.();
    } catch {
      // keep the last good answer
    } finally {
      clearTimeout(timer);
      this.inFlight = false;
    }
  }

  /** Redraws the tags when the answer runs out. */
  private armExpiry(): void {
    if (this.expiry !== undefined) clearTimeout(this.expiry);
    this.expiry = undefined;
    if (this.last === null) return;
    const wait = expiresAtOf(this.last) - this.now();
    if (!Number.isFinite(wait) || wait <= 0) return;
    this.expiry = setTimeout(() => { this.expiry = undefined; this.options.onChange?.(); }, Math.min(wait + 1, MAX_TIMER_MS));
  }
}
