import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import type { AccountStore } from '../src/accountStore';
import type { WebConfig } from '../src/config';
import { loadStatus, probePort, StatusCache, withTimeout } from '../src/status';
import type { StatusAnswer } from '../src/status';

const servers: Server[] = [];
async function listening(): Promise<number> {
  const server = createServer((socket) => socket.destroy());
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}
/** A port nothing listens on: one that was listened on and closed. */
async function closedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const server of servers.splice(0)) server.close();
});

const configWith = (certifier: number, login: number) =>
  ({ servers: { certifier: { host: '127.0.0.1', port: certifier }, login: { host: '127.0.0.1', port: login } } }) as WebConfig;
const storeCounting = (onlineCount: () => Promise<number>): AccountStore => ({ create: async () => 1, onlineCount });

it('is online with the count when both ports answer', async () => {
  const answer = await loadStatus(configWith(await listening(), await listening()), storeCounting(async () => 7));
  expect(answer).toEqual({ online: true, players: 7, checkedAt: expect.any(String) });
  expect(new Date(answer.checkedAt).toISOString()).toBe(answer.checkedAt);
});

it('is offline when a port is closed', async () => {
  expect((await loadStatus(configWith(await listening(), await closedPort()), storeCounting(async () => 0))).online).toBe(false);
  expect((await loadStatus(configWith(await closedPort(), await listening()), storeCounting(async () => 0))).online).toBe(false);
});

it('answers players: null when the count fails', async () => {
  const answer = await loadStatus(configWith(await listening(), await listening()), storeCounting(async () => { throw new Error('db down'); }));
  expect(answer).toMatchObject({ online: true, players: null });
});

it('answers players: null when the count hangs past 2 s', async () => {
  const started = Date.now();
  const answer = await loadStatus(configWith(await listening(), await listening()), storeCounting(() => new Promise<number>(() => {})));
  expect(answer).toMatchObject({ online: true, players: null });
  const took = Date.now() - started;
  expect(took).toBeGreaterThanOrEqual(1900);
  expect(took).toBeLessThan(3500);
}, 6000);

it('probes a port: true when it answers, false when refused', async () => {
  await expect(probePort('127.0.0.1', await listening(), 1000)).resolves.toBe(true);
  await expect(probePort('127.0.0.1', await closedPort(), 1000)).resolves.toBe(false);
});

it('times out a promise', async () => {
  vi.useFakeTimers();
  const late = withTimeout(new Promise<number>(() => {}), 2000);
  const caught = late.catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(1999);
  let settled = false;
  void caught.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await caught).toMatch(/2000/);
  await expect(withTimeout(Promise.resolve(5), 2000)).resolves.toBe(5);
});

it('shares one load for 30 s', async () => {
  let now = 0;
  let loads = 0;
  const answer: StatusAnswer = { online: true, players: 1, checkedAt: 'x' };
  const cache = new StatusCache(async () => { loads += 1; return answer; }, () => now);
  const got = await Promise.all([cache.get(), cache.get(), cache.get()]);
  expect(got).toEqual([answer, answer, answer]);
  expect(loads).toBe(1);
  now = 30_000;
  await cache.get();
  expect(loads).toBe(1);
  now = 30_001;
  await cache.get();
  expect(loads).toBe(2);
});

it('does not keep a load that failed', async () => {
  let fail = true;
  const cache = new StatusCache(async () => {
    if (fail) throw new Error('x');
    return { online: false, players: 0, checkedAt: 'y' };
  }, () => 0);
  await expect(cache.get()).rejects.toThrow('x');
  fail = false;
  await expect(cache.get()).resolves.toMatchObject({ checkedAt: 'y' });
});
