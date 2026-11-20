import { expect, it } from 'vitest';
import { DISCORD_RETRY_MS, DISCORD_TTL_MS, DiscordCache, loadDiscord, parseDiscordConfig } from '../src/discord';
import type { DiscordAnswer } from '../src/discord';

const config = { code: 'abc', url: 'https://discord.gg/abc' };

it.each([
  'https://discord.gg/abc', 'https://discord.com/invite/abc', 'discord.gg/abc', 'abc', ' https://discord.gg/abc/ ',
])('takes the invite %s', (invite) => {
  expect(parseDiscordConfig({ invite })).toEqual(config);
});

it('keeps a vanity code with dashes', () => {
  expect(parseDiscordConfig({ invite: 'https://discord.gg/os-flyff' })).toEqual({ code: 'os-flyff', url: 'https://discord.gg/os-flyff' });
});

it.each([
  [{ invite: 'https://evil.com/abc' }], [{ invite: 'a' }], [{ invite: 'bad code!' }], [{ invite: '' }], [{}], ['abc'],
  [{ invite: 'https://discord.gg/abc?x=1' }],
])('refuses %j', (value) => {
  expect(() => parseDiscordConfig(value)).toThrow(/^discord/);
});

/** A fetch that answers `status` with `body` and keeps the URLs it was asked. */
function fakeFetch(status: number, body: unknown, asked: string[] = []): typeof fetch {
  return (async (url: string | URL) => {
    asked.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

it('reads the name and both numbers', async () => {
  const asked: string[] = [];
  const answer = await loadDiscord(config, fakeFetch(200, {
    guild: { name: 'OSFlyff' }, approximate_presence_count: 42, approximate_member_count: 310,
  }, asked));
  expect(answer).toEqual({ url: 'https://discord.gg/abc', name: 'OSFlyff', online: 42, members: 310 });
  expect(asked).toEqual(['https://discord.com/api/v10/invites/abc?with_counts=true']);
});

it('is invalid when Discord does not know the invite', async () => {
  expect(await loadDiscord(config, fakeFetch(404, { message: 'Unknown Invite', code: 10006 }))).toBe('invalid');
});

const noNumbers: DiscordAnswer = { url: 'https://discord.gg/abc', name: null, online: null, members: null };

it.each([
  ['a 500', fakeFetch(500, {})],
  ['a 429', fakeFetch(429, { retry_after: 5 })],
  ['bad numbers', fakeFetch(200, { approximate_presence_count: 'x', approximate_member_count: -1 })],
  ['no JSON', (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch],
  ['a network error', (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch],
])('keeps the link without numbers on %s', async (_, fetchFn) => {
  expect(await loadDiscord(config, fetchFn)).toEqual(noNumbers);
});

it('gives up after the timeout', async () => {
  const hanging = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as unknown as typeof fetch;
  expect(await loadDiscord(config, hanging, 20)).toEqual(noNumbers);
});

const full: DiscordAnswer = { url: 'https://discord.gg/abc', name: 'OSFlyff', online: 42, members: 310 };

function cacheOf(answers: (DiscordAnswer | 'invalid')[]) {
  let now = 0;
  let loads = 0;
  const warnings: string[] = [];
  const cache = new DiscordCache(async () => answers[Math.min(loads++, answers.length - 1)]!, () => now,
    { info: () => {}, warn: (line) => warnings.push(line) });
  return { cache, warnings, loads: () => loads, at: (t: number) => { now = t; } };
}

it('keeps a full answer 10 minutes, shared by every caller', async () => {
  const c = cacheOf([full]);
  expect(await Promise.all([c.cache.get(), c.cache.get()])).toEqual([full, full]);
  expect(c.loads()).toBe(1);
  c.at(DISCORD_TTL_MS);
  await c.cache.get();
  expect(c.loads()).toBe(1);
  c.at(DISCORD_TTL_MS + 1);
  await c.cache.get();
  expect(c.loads()).toBe(2);
});

it('asks again after 1 minute when the numbers were missing', async () => {
  const c = cacheOf([noNumbers, full]);
  expect(await c.cache.get()).toEqual(noNumbers);
  c.at(DISCORD_RETRY_MS + 1);
  expect(await c.cache.get()).toEqual(full);
  expect(c.loads()).toBe(2);
});

it('is off for an invalid invite, warned once', async () => {
  const c = cacheOf(['invalid']);
  expect(await c.cache.get()).toBe('off');
  c.at(DISCORD_TTL_MS + 1);
  expect(await c.cache.get()).toBe('off');
  c.at(2 * DISCORD_TTL_MS + 2);
  expect(await c.cache.get()).toBe('off');
  expect(c.loads()).toBe(3);
  expect(c.warnings).toEqual(['discord: invite is invalid or expired; the home page shows no Discord button']);
});

it('warns again once a fixed invite breaks again', async () => {
  const c = cacheOf(['invalid', full, 'invalid']);
  await c.cache.get();
  c.at(DISCORD_TTL_MS + 1);
  expect(await c.cache.get()).toEqual(full);
  c.at(2 * DISCORD_TTL_MS + 2);
  await c.cache.get();
  expect(c.warnings).toHaveLength(2);
});
