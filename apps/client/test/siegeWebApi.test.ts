import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiegeWeeklyFeed, badgeOf } from '../src/world/guildCombat/siegeWebApi';
import type { SiegeWeekly } from '../src/world/guildCombat/siegeWebApi';

const T0 = Date.parse('2026-11-15T12:00:00+08:00');
const weekly = (over: Partial<SiegeWeekly> = {}): SiegeWeekly => ({
  champion: { guildId: 7, name: 'Alpha' }, mvp: { playerId: 42, name: 'Rocky' },
  endedAt: '2026-11-15T10:00:00+08:00', expiresAt: '2026-11-22T10:00:00+08:00', ...over,
});
const answer = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe('SiegeWeeklyFeed', () => {
  it('fetches at world entry and every 5 min; one call in flight; 3 s timeout', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>((_, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))); });
    const feed = new SiegeWeeklyFeed({ fetcher: fetcher as never, now: () => Date.now() });
    feed.start();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('/api/siege/weekly');
    await vi.advanceTimersByTimeAsync(2900);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(signal!.aborted).toBe(true); // 3 s
    fetcher.mockImplementation(() => new Promise<Response>(() => {})); // a hanging one: still one in flight
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetcher.mock.calls.length).toBe(2);
    feed.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher.mock.calls.length).toBe(2);
  });

  it('keeps only one call in flight while the last has not settled', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const feed = new SiegeWeeklyFeed({ fetcher: fetcher as never, now: () => Date.now(), timeoutMs: 10 * 60_000 });
    feed.start();
    await vi.advanceTimersByTimeAsync(12 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    feed.stop();
  });

  it('a failed fetch keeps the last good answer until it expires', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(answer(weekly())).mockResolvedValue(answer({ error: 'unavailable' }, false));
    const onChange = vi.fn();
    const feed = new SiegeWeeklyFeed({ fetcher: fetcher as never, now: () => Date.now(), onChange });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.current(Date.now())?.mvp?.playerId).toBe(42);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(feed.current(Date.now())?.mvp?.playerId).toBe(42);
    expect(feed.current(Date.parse('2026-11-22T10:00:01+08:00'))).toBeNull();
    feed.stop();
  });

  it('calls onChange when the answer changes and when it expires', async () => {
    const onChange = vi.fn();
    const soon = weekly({ expiresAt: new Date(T0 + 60_000).toISOString() });
    const feed = new SiegeWeeklyFeed({ fetcher: (async () => answer(soon)) as never, now: () => Date.now(), onChange });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(feed.current(Date.now())).toBeNull();
    feed.stop();
  });

  it('a network error or a throwing fetch is no answer', async () => {
    const feed = new SiegeWeeklyFeed({ fetcher: (async () => { throw new Error('down'); }) as never, now: () => Date.now() });
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.current(Date.now())).toBeNull();
    feed.stop();
  });
});

describe('badgeOf', () => {
  const at = Date.parse('2026-11-16T00:00:00+08:00');
  it('gives the MVP its mark, the champion guild its mark, others none', () => {
    expect(badgeOf(weekly(), 42, 0, at)).toBe('weeklyMvp');
    expect(badgeOf(weekly(), 1, 7, at)).toBe('weeklyChampion');
    expect(badgeOf(weekly(), 1, 8, at)).toBeNull();
    expect(badgeOf(weekly(), 1, 0, at)).toBeNull();
  });
  it('a weekly MVP in the champion guild shows only the MVP mark', () => {
    expect(badgeOf(weekly(), 42, 7, at)).toBe('weeklyMvp');
  });
  it('is nothing after expiresAt, and without an answer', () => {
    const after = Date.parse('2026-11-22T10:00:01+08:00');
    expect(badgeOf(weekly(), 42, 7, after)).toBeNull();
    expect(badgeOf(null, 42, 7, at)).toBeNull();
    expect(badgeOf(weekly({ champion: null, mvp: null }), 42, 7, at)).toBeNull();
  });
});
