import { expect, it, vi } from 'vitest';
import { fitSize } from '../src/site/receiptPicture';
import { priceText, VipApi } from '../src/site/vipApi';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('keeps the token from the login and sends it, with a new request id, with every request', async () => {
  const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => (url === '/api/account/login' ? json(200, { account: 'tester1', csrf: 'tok' }) : json(201, { id: 7 })));
  let n = 0;
  const api = new VipApi(fetchFn as unknown as typeof fetch, () => `id-${++n}`);
  await expect(api.login('tester1', 'pw')).resolves.toEqual({ ok: true, value: 'tester1' });
  await expect(api.send({ tier: 2, reference: 'GC 123', receipt: 'AAAA' })).resolves.toEqual({ ok: true, value: 7 });
  await api.send({ tier: 2, reference: 'GC 124', receipt: 'AAAA' });
  const [url, init] = fetchFn.mock.calls[1]!;
  expect(url).toBe('/api/vip/requests');
  expect(init?.method).toBe('POST');
  expect((init?.headers as Record<string, string>)['X-Site-Token']).toBe('tok');
  expect(JSON.parse(String(init?.body))).toEqual({ tier: 2, reference: 'GC 123', receipt: 'AAAA', requestId: 'id-1' });
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
  await expect(api.send({ tier: 1, reference: 'x', receipt: '' })).resolves.toEqual(answer);
});

it('says unreachable when the service gives no answer, and no session when it refuses one', async () => {
  const api = new VipApi((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
  await expect(api.data()).resolves.toEqual({ ok: false, error: 'unreachable' });
  await expect(new VipApi((async () => json(401, { error: 'session' })) as unknown as typeof fetch).session()).resolves.toBeUndefined();
});

it('shows prices in dollars, cents only when there are some', () => {
  expect([priceText(200), priceText(1000), priceText(450), priceText(1)]).toEqual(['$2', '$10', '$4.50', '$0.01']);
});

it('scales a receipt down to 2000 px on its long side, never up', () => {
  expect(fitSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  expect(fitSize(1080, 2400)).toEqual({ width: 900, height: 2000 });
  expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
});
