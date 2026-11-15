// The Guild Siege API for the game client: `GET /api/siege/weekly` (the latest weekly winner and MVP) and
// `GET /api/siege/ranking?board=player|guild&span=week|all`. Each answer is kept 60 s per key and shared by every
// visitor; a SQL failure, or no answer within 2 s, is `503 {error:'unavailable'}`. Times are PH time sent as text with
// `+08:00` (a SQL datetime is local PH time; `Z` would be wrong).

import type { AccountStore } from './accountStore';
import type { HttpAnswer } from './signUpHandler';
import { withTimeout } from './status';

export interface SiegeWeekly {
  champion: { guildId: number; name: string } | null;
  mvp: { playerId: number; name: string } | null;
  endedAt: string | null;
  expiresAt: string | null;
}
export interface SiegeRankRow { rank: number; name: string; job?: number; guild?: string; wins?: number; sieges?: number; points: number }
export interface SiegeRanking { rows: SiegeRankRow[]; checkedAt: string }

export const SIEGE_TTL_MS = 60_000;
export const SIEGE_TIMEOUT_MS = 2000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const PH_OFFSET_MS = 8 * 3600 * 1000;

/** `endedAt` + 7 days, as `YYYY-MM-DDTHH:mm:ss+08:00`; null when `endedAt` is null or not a time. */
export function weekAfter(endedAt: string | null): string | null {
  if (endedAt === null) return null;
  const at = Date.parse(endedAt);
  if (Number.isNaN(at)) return null;
  return `${new Date(at + WEEK_MS + PH_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/** The answers of the two siege queries, each kept `ttlMs` by key (`weekly`, `player:week`, `guild:all`, ...). */
export class SiegeCache {
  private readonly kept = new Map<string, { answer: unknown; at: number }>();
  private readonly loading = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: Pick<AccountStore, 'siegeWeekly' | 'siegeRanking'>,
    private readonly now: () => number,
    private readonly ttlMs = SIEGE_TTL_MS,
  ) {}

  weekly(): Promise<SiegeWeekly> {
    return this.cached('weekly', async () => {
      const answer = await this.store.siegeWeekly();
      return { ...answer, expiresAt: answer.expiresAt ?? weekAfter(answer.endedAt) };
    });
  }

  ranking(board: 'player' | 'guild', week: boolean): Promise<SiegeRanking> {
    return this.cached(`${board}:${week ? 'week' : 'all'}`, async () => ({
      rows: await this.store.siegeRanking(board, week),
      checkedAt: new Date(this.now()).toISOString(),
    }));
  }

  /** One answer per key for `ttlMs`; callers that ask while it loads share the load. A failed load is not kept. */
  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.kept.get(key);
    if (hit !== undefined && this.now() - hit.at <= this.ttlMs) return Promise.resolve(hit.answer as T);
    let loading = this.loading.get(key) as Promise<T> | undefined;
    if (loading === undefined) {
      loading = withTimeout(load(), SIEGE_TIMEOUT_MS).then(
        (answer) => {
          this.kept.set(key, { answer, at: this.now() });
          this.loading.delete(key);
          return answer;
        },
        (error: unknown) => {
          this.loading.delete(key);
          throw error;
        },
      );
      this.loading.set(key, loading);
    }
    return loading;
  }
}

const UNAVAILABLE: HttpAnswer = { status: 503, body: { error: 'unavailable' } };

export async function handleSiegeWeekly(deps: { siege: SiegeCache }): Promise<HttpAnswer> {
  try {
    return { status: 200, body: { ...(await deps.siege.weekly()) } };
  } catch {
    return UNAVAILABLE;
  }
}

export async function handleSiegeRanking(query: URLSearchParams, deps: { siege: SiegeCache }): Promise<HttpAnswer> {
  const board = query.get('board');
  const span = query.get('span');
  if ((board !== 'player' && board !== 'guild') || (span !== 'week' && span !== 'all')) return { status: 400, body: { error: 'bad_request' } };
  try {
    return { status: 200, body: { ...(await deps.siege.ranking(board, span === 'week')) } };
  } catch {
    return UNAVAILABLE;
  }
}
