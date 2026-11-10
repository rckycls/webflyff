import { expect, it, vi } from 'vitest';
import { SignUpApi } from '../src/site/signUpApi';

const form = { account: 'hero_01', password: 'abc12345', email: '', website: '', ticket: 't1' };
const answering = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

it.each([
  [201, { ok: true }, { ok: true }],
  [409, { error: 'taken' }, { ok: false, error: 'taken' }],
  [400, { error: 'invalid', field: 'email' }, { ok: false, error: 'invalid', field: 'email' }],
  [400, { error: 'invalid', field: 'nonsense' }, { ok: false, error: 'invalid' }],
  [400, { error: 'ticket' }, { ok: false, error: 'ticket' }],
  [429, { error: 'too_many' }, { ok: false, error: 'too_many' }],
  [429, { error: 'paused' }, { ok: false, error: 'paused' }],
  [403, { error: 'forbidden' }, { ok: false, error: 'forbidden' }],
  [500, { error: 'server' }, { ok: false, error: 'server' }],
  [500, {}, { ok: false, error: 'server' }],
  [413, { error: 'size' }, { ok: false, error: 'server' }],
  [502, 'not json', { ok: false, error: 'server' }],
])('maps %i %j', async (status, body, answer) => {
  const fetchFn = answering(status, body);
  await expect(new SignUpApi(fetchFn as unknown as typeof fetch).send(form)).resolves.toEqual(answer);
});

it('posts the form as JSON to /api/sign-up', async () => {
  const fetchFn = answering(201, { ok: true });
  await new SignUpApi(fetchFn as unknown as typeof fetch).send(form);
  const [url, init] = fetchFn.mock.calls[0]!;
  expect(url).toBe('/api/sign-up');
  expect(init?.method).toBe('POST');
  expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  expect(JSON.parse(String(init?.body))).toEqual(form);
});

it('says unreachable when fetch throws', async () => {
  const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  await expect(new SignUpApi(fetchFn as unknown as typeof fetch).send(form)).resolves.toEqual({ ok: false, error: 'unreachable' });
});

it('gets a ticket, or none', async () => {
  const good = answering(200, { ticket: 'abc.def.ghi' });
  await expect(new SignUpApi(good as unknown as typeof fetch).ticket()).resolves.toBe('abc.def.ghi');
  expect(good.mock.calls[0]![0]).toBe('/api/sign-up/ticket');
  await expect(new SignUpApi(answering(429, { error: 'too_many' }) as unknown as typeof fetch).ticket()).resolves.toBeUndefined();
  await expect(new SignUpApi(answering(200, { ticket: 7 }) as unknown as typeof fetch).ticket()).resolves.toBeUndefined();
  const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  await expect(new SignUpApi(down as unknown as typeof fetch).ticket()).resolves.toBeUndefined();
});
