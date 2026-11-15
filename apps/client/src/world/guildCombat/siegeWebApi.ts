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

/**
 * Asks for the weekly answer at start and every 5 min, one call in flight, 3 s each; a failure keeps the last good answer.
 * The screen stops and starts it at each world change: a start within 5 min of the last call waits for the rest of them
 * (the answer and its expiry kept), so a teleport asks nothing (final review, Minor 4).
 */
export class SiegeWeeklyFeed {
  private last: SiegeWeekly | null = null;
  /** When the last call went out, on `now`'s clock. */
  private lastFetchAt = -Infinity;
  private interval: ReturnType<typeof setInterval> | undefined;
  private wait: ReturnType<typeof setTimeout> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight = false;

  constructor(private readonly options: SiegeWeeklyFeedOptions = {}) {}

  private now(): number { return (this.options.now ?? Date.now)(); }

  start(): void {
    if (this.running) return;
    this.running = true;
    const every = (): void => {
      void this.fetchOnce();
      this.interval = setInterval(() => { void this.fetchOnce(); }, WEEKLY_EVERY_MS);
    };
    const since = this.now() - this.lastFetchAt;
    if (since >= WEEKLY_EVERY_MS) every();
    else this.wait = setTimeout(() => { this.wait = undefined; every(); }, WEEKLY_EVERY_MS - since);
    this.armExpiry();
  }

  stop(): void {
    this.running = false;
    if (this.interval !== undefined) clearInterval(this.interval);
    if (this.wait !== undefined) clearTimeout(this.wait);
    if (this.expiry !== undefined) clearTimeout(this.expiry);
    this.interval = this.wait = this.expiry = undefined;
  }

  /** The last good answer, null when there is none or it has expired. */
  current(now: number): SiegeWeekly | null {
    return this.last !== null && now < expiresAtOf(this.last) ? this.last : null;
  }

  private async fetchOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.lastFetchAt = this.now();
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

// 2026-11-15 (Guild Siege, C2): the website's ranking (`GET /api/siege/ranking?board=player|guild&span=week|all`) for the
// owner's Siege Ranking window.

export type RankBoard = 'player' | 'guild';
export type RankSpan = 'week' | 'all';

/** A row of the website's ranking: a player (name, job, guild) or a guild (wins, sieges). */
export interface SiegeRankRow {
  rank: number;
  name: string;
  job?: number;
  guild?: string;
  wins?: number;
  sieges?: number;
  points: number;
}

export const RANKING_URL = '/api/siege/ranking';
export const RANKING_TIMEOUT_MS = 3000;
export const RANKING_REUSE_MS = 60_000;

const optionalNumber = (value: unknown): boolean => value === undefined || (typeof value === 'number' && Number.isFinite(value));

/** Whether a parsed body is a well-formed answer: anything else counts as unavailable. */
export function isSiegeRanking(body: unknown): body is { rows: SiegeRankRow[]; checkedAt: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { rows, checkedAt } = body as Record<string, unknown>;
  if (typeof checkedAt !== 'string' || !Array.isArray(rows)) return false;
  return rows.every((row) => {
    if (typeof row !== 'object' || row === null) return false;
    const r = row as Record<string, unknown>;
    return typeof r.rank === 'number' && typeof r.name === 'string' && typeof r.points === 'number'
      && optionalNumber(r.job) && optionalNumber(r.wins) && optionalNumber(r.sieges)
      && (r.guild === undefined || typeof r.guild === 'string');
  });
}

export interface SiegeRankingCacheOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
}

/** Asks for a ranking board when it is opened, 3 s at most, and reuses each board+span's answer for 60 s. */
export class SiegeRankingCache {
  private readonly kept = new Map<string, { at: number; rows: SiegeRankRow[] }>();
  private readonly inFlight = new Map<string, Promise<SiegeRankRow[] | null>>();

  constructor(private readonly options: SiegeRankingCacheOptions = {}) {}

  /** The rows, or null when the website is unavailable (a bad answer, an error status, a time-out). */
  load(board: RankBoard, span: RankSpan): Promise<SiegeRankRow[] | null> {
    const key = `${board}|${span}`;
    const now = (this.options.now ?? Date.now)();
    const kept = this.kept.get(key);
    if (kept !== undefined && now - kept.at < RANKING_REUSE_MS) return Promise.resolve(kept.rows);
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;
    const call = this.fetchRows(board, span).then((rows) => {
      if (rows !== null) this.kept.set(key, { at: now, rows });
      return rows;
    }).finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, call);
    return call;
  }

  private async fetchRows(board: RankBoard, span: RankSpan): Promise<SiegeRankRow[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? RANKING_TIMEOUT_MS);
    try {
      const fetcher = this.options.fetcher ?? ((url, init) => fetch(url, init));
      const response = await fetcher(`${RANKING_URL}?board=${board}&span=${span}`, { signal: controller.signal });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return isSiegeRanking(body) ? body.rows : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
