import { expect, it, vi } from 'vitest';
import { fitSize } from '../src/site/receiptPicture';
import { countryCurrency, priceText, tierPrice, VipApi } from '../src/site/vipApi';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('keeps the token from the login and sends it, with a new request id, with every request', async () => {
  const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => (url === '/api/account/login' ? json(200, { account: 'tester1', csrf: 'tok' }) : json(201, { id: 7 })));
  let n = 0;
  const api = new VipApi(fetchFn as unknown as typeof fetch, () => `id-${++n}`);
  await expect(api.login('tester1', 'pw')).resolves.toEqual({ ok: true, value: 'tester1' });
  await expect(api.send({ tier: 2, currency: 'PHP', reference: 'GC 123', receipt: 'AAAA' })).resolves.toEqual({ ok: true, value: 7 });
  await api.send({ tier: 2, currency: 'USD', reference: 'GC 124', receipt: 'AAAA' });
  const [url, init] = fetchFn.mock.calls[1]!;
  expect(url).toBe('/api/vip/requests');
  expect(init?.method).toBe('POST');
  expect((init?.headers as Record<string, string>)['X-Site-Token']).toBe('tok');
  expect(JSON.parse(String(init?.body))).toEqual({ tier: 2, currency: 'PHP', reference: 'GC 123', receipt: 'AAAA', requestId: 'id-1' });
  expect(JSON.parse(String(fetchFn.mock.calls[2]![1]?.body)).requestId).toBe('id-2');
});

it.each([
  [400, { error: 'wrong' }, { ok: false, error: 'wrong' }],
  [403, { error: 'banned' }, { ok: false, error: 'banned' }],
  [409, { error: 'too_many', max: 3 }, { ok: false, error: 'too_many', max: 3 }],
  [409, { error: 'reference', max: 3 }, { ok: false, error: 'reference', max: 3 }],
  [400, { error: 'invalid', field: 'receipt' }, { ok: false, error: 'invalid', field: 'receipt' }],
  [503, { error: 'off' }, { ok: false, error: 'off' }],
  [403, {}, { ok: false, error: 'forbidden' }],
  [502, 'not json', { ok: false, error: 'server' }],
])('maps %i %j', async (status, body, answer) => {
  const api = new VipApi((async () => json(status, body)) as unknown as typeof fetch);
  await expect(api.send({ tier: 1, currency: 'USD', reference: 'x', receipt: '' })).resolves.toEqual(answer);
});

it('says unreachable when the service gives no answer, and no session when it refuses one', async () => {
  const api = new VipApi((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
  await expect(api.data()).resolves.toEqual({ ok: false, error: 'unreachable' });
  await expect(new VipApi((async () => json(401, { error: 'session' })) as unknown as typeof fetch).session()).resolves.toBeUndefined();
});

it('shows prices in dollars or pesos, cents only when there are some', () => {
  expect([priceText(200), priceText(1000), priceText(450), priceText(1)]).toEqual(['$2', '$10', '$4.50', '$0.01']);
  expect([priceText(11500, 'PHP'), priceText(23050, 'PHP'), priceText(115000, 'PHP')]).toEqual(['₱115', '₱230.50', '₱1,150']);
});

it('picks pesos for the Philippines by time zone or language, US dollars anywhere else', () => {
  expect(countryCurrency('Asia/Manila', ['en-US'])).toBe('PHP');
  expect(countryCurrency('Asia/Dubai', ['en-PH', 'en'])).toBe('PHP');
  expect(countryCurrency('Asia/Singapore', ['fil-ph'])).toBe('PHP');
  expect(countryCurrency('America/New_York', ['en-US', 'en'])).toBe('USD');
  expect(countryCurrency(undefined, [])).toBe('USD');
});

it("gives a tier's peso price in pesos, and its dollar price when it has no peso price or dollars are picked", () => {
  const tier = { level: 1, name: 'VIP 1', priceCents: 200, pricePhpCents: 11500 };
  expect(tierPrice(tier, 'PHP')).toEqual({ cents: 11500, currency: 'PHP' });
  expect(tierPrice(tier, 'USD')).toEqual({ cents: 200, currency: 'USD' });
  expect(tierPrice({ ...tier, pricePhpCents: null }, 'PHP')).toEqual({ cents: 200, currency: 'USD' });
});

it('scales a receipt down to 2000 px on its long side, never up', () => {
  expect(fitSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  expect(fitSize(1080, 2400)).toEqual({ width: 900, height: 2000 });
  expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
});

// 2026-11-20 (redeem codes): the Redeem Code window's two calls
const OFFER = { codeId: 3, label: 'Launch', vipLevel: 1, vipDays: 30, expiresAt: '2026-12-15T00:00:00Z', items: [] };

it('checks a code and reads the offer, the live VIP and whether it replaces it', async () => {
  const api = new VipApi((async () => json(200, { ok: true, offer: OFFER, vip: { level: 1, endsAt: '2026-11-30T00:00:00Z' }, replaces: false })) as unknown as typeof fetch);
  await expect(api.codeCheck('WELCOME2026')).resolves.toEqual({ ok: true, value: { offer: OFFER, vip: { level: 1, endsAt: '2026-11-30T00:00:00Z' }, replaces: false } });
});

it('keeps the offer and the live VIP of a refused code', async () => {
  const api = new VipApi((async () => json(409, { error: 'lower_vip', offer: OFFER, vip: { level: 4, endsAt: '2026-11-30T00:00:00Z' } })) as unknown as typeof fetch);
  await expect(api.codeCheck('VIPONE')).resolves.toEqual({ ok: false, error: 'lower_vip', offer: OFFER, vip: { level: 4, endsAt: '2026-11-30T00:00:00Z' } });
  const unknown = new VipApi((async () => json(404, { error: 'unknown' })) as unknown as typeof fetch);
  await expect(unknown.codeCheck('NOPE1234')).resolves.toEqual({ ok: false, error: 'unknown' });
});

it('sends a redeem with the code, the character, the request id and the confirm, and the site token', async () => {
  const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => (url === '/api/account/login'
    ? json(200, { account: 'tester1', csrf: 'tok' })
    : json(200, { ok: true, useId: 9, offer: OFFER, vip: null, repeat: false })));
  const api = new VipApi(fetchFn as unknown as typeof fetch);
  await api.login('tester1', 'pw');
  await expect(api.codeRedeem('WELCOME2026', 1, 'press-1', true)).resolves.toEqual({ ok: true, value: { useId: 9, offer: OFFER, vip: null, repeat: false } });
  const [url, init] = fetchFn.mock.calls[1]!;
  expect(url).toBe('/api/codes/redeem');
  expect(JSON.parse(String(init?.body))).toEqual({ code: 'WELCOME2026', character: 1, requestId: 'press-1', confirm: true });
  expect((init?.headers as Record<string, string>)['X-Site-Token']).toBe('tok');
  const offline = new VipApi((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
  await expect(offline.codeRedeem('WELCOME2026', 1, 'press-2', false)).resolves.toEqual({ ok: false, error: 'unreachable' });
});
