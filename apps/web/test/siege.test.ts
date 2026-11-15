import { afterEach, expect, it, vi } from 'vitest';
import type { AccountStore } from '../src/accountStore';
import { handleSiegeRanking, handleSiegeWeekly, SiegeCache } from '../src/siege';
import type { SiegeRankRow, SiegeWeekly } from '../src/siege';

afterEach(() => vi.useRealTimers());

const weekly: SiegeWeekly = {
  champion: { guildId: 12, name: 'Bakbak' },
  mvp: { playerId: 345, name: 'Rocky' },
  endedAt: '2026-11-14T20:41:09+08:00',
  expiresAt: null,
};
const rows: SiegeRankRow[] = [{ rank: 1, name: 'Bakbak', wins: 2, sieges: 3, points: 90 }];

function fake(overrides: Partial<Pick<AccountStore, 'siegeWeekly' | 'siegeRanking'>> = {}) {
  const store = {
    siegeWeekly: vi.fn(async () => weekly),
    siegeRanking: vi.fn(async (_board: 'player' | 'guild', _week: boolean) => rows),
    ...overrides,
  };
  return store;
}
const cacheOf = (store: ReturnType<typeof fake>, now: () => number = () => 0) => new SiegeCache(store, now);

it('weekly route returns the store answer with expiresAt = endedAt + 7 days', async () => {
  const answer = await handleSiegeWeekly({ siege: cacheOf(fake()) });
  expect(answer).toEqual({ status: 200, body: { ...weekly, expiresAt: '2026-11-21T20:41:09+08:00' } });
});

it('weekly answer with no siege is all null', async () => {
  const none: SiegeWeekly = { champion: null, mvp: null, endedAt: null, expiresAt: null };
  const answer = await handleSiegeWeekly({ siege: cacheOf(fake({ siegeWeekly: async () => none })) });
  expect(answer).toEqual({ status: 200, body: none });
});

it('endedAt is sent as ISO with +08:00, never Z', async () => {
  const answer = await handleSiegeWeekly({ siege: cacheOf(fake()) });
  const body = answer.body as unknown as SiegeWeekly;
  expect(body.endedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00$/);
  expect(body.expiresAt).toMatch(/\+08:00$/);
  expect(JSON.stringify(body)).not.toContain('Z"');
});

it('ranking route rejects board=x and span=y with 400', async () => {
  const siege = cacheOf(fake());
  expect(await handleSiegeRanking(new URLSearchParams('board=x&span=all'), { siege })).toEqual({ status: 400, body: { error: 'bad_request' } });
  expect(await handleSiegeRanking(new URLSearchParams('board=guild&span=y'), { siege })).toEqual({ status: 400, body: { error: 'bad_request' } });
  expect(await handleSiegeRanking(new URLSearchParams(''), { siege })).toEqual({ status: 400, body: { error: 'bad_request' } });
});

it('ranking answer is cached 60 s per board+span; a failed load is not kept', async () => {
  let now = 1000;
  const store = fake();
  const siege = cacheOf(store, () => now);
  const ask = (q: string) => handleSiegeRanking(new URLSearchParams(q), { siege });
  const first = await ask('board=guild&span=all');
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ rows, checkedAt: expect.any(String) });
  await ask('board=guild&span=all');
  expect(store.siegeRanking).toHaveBeenCalledTimes(1);
  expect(store.siegeRanking).toHaveBeenLastCalledWith('guild', false);
  await ask('board=player&span=week');
  expect(store.siegeRanking).toHaveBeenCalledTimes(2);
  expect(store.siegeRanking).toHaveBeenLastCalledWith('player', true);
  now += 61_000;
  await ask('board=guild&span=all');
  expect(store.siegeRanking).toHaveBeenCalledTimes(3);

  let fail = true;
  const flaky = fake({ siegeRanking: vi.fn(async () => { if (fail) throw new Error('db down'); return rows; }) });
  const cache = cacheOf(flaky);
  const askFlaky = () => handleSiegeRanking(new URLSearchParams('board=player&span=all'), { siege: cache });
  expect(await askFlaky()).toEqual({ status: 503, body: { error: 'unavailable' } });
  fail = false;
  expect((await askFlaky()).status).toBe(200);
  expect(flaky.siegeRanking).toHaveBeenCalledTimes(2);
});

it('a SQL failure on the weekly route is 503 unavailable', async () => {
  const answer = await handleSiegeWeekly({ siege: cacheOf(fake({ siegeWeekly: async () => { throw new Error('x'); } })) });
  expect(answer).toEqual({ status: 503, body: { error: 'unavailable' } });
});

it('store slower than 2 s gives 503 unavailable', async () => {
  vi.useFakeTimers();
  const siege = cacheOf(fake({ siegeRanking: () => new Promise<SiegeRankRow[]>(() => {}), siegeWeekly: () => new Promise<SiegeWeekly>(() => {}) }));
  const ranking = handleSiegeRanking(new URLSearchParams('board=guild&span=week'), { siege });
  const week = handleSiegeWeekly({ siege });
  await vi.advanceTimersByTimeAsync(2100);
  expect(await ranking).toEqual({ status: 503, body: { error: 'unavailable' } });
  expect(await week).toEqual({ status: 503, body: { error: 'unavailable' } });
});
