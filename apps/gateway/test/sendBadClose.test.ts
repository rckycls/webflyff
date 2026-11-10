import { afterEach, expect, it } from 'vitest';
import { startFakeFlyffServer } from '@flyffweb/testkit';
import { sendBadClose } from '../scripts/sendBadClose';
import { DEFAULT_LIMITS } from '../src/config';
import { startGateway } from '../src/server';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function gatewayTo(role: 'certifier' | 'login') {
  const fake = await startFakeFlyffServer();
  cleanups.push(() => fake.close());
  const gateway = await startGateway({
    listen: { host: '127.0.0.1', port: 0 },
    allowedOrigins: ['http://localhost:5174'],
    trustedProxies: [],
    sendClientAddr: false,
    routes: { '172.31.238.55:23000': { host: '127.0.0.1', port: fake.port, role } },
    limits: DEFAULT_LIMITS,
  }, { info: () => {} });
  cleanups.push(() => gateway.close());
  return { url: `ws://127.0.0.1:${gateway.port}`, fake };
}

it('sees the gateway refuse the packet with 4006 on a certifier route', async () => {
  const { url, fake } = await gatewayTo('certifier');
  await expect(sendBadClose(url, '172.31.238.55:23000', 'http://localhost:5174')).resolves.toEqual({ closed: 4006 });
  expect(fake.received).toEqual([]);
});

it('tells a refused origin and a route that let the packet through', async () => {
  const certifier = await gatewayTo('certifier');
  await expect(sendBadClose(certifier.url, '172.31.238.55:23000', 'http://evil.example')).resolves.toEqual({ refusedUpgrade: 403 });
  const login = await gatewayTo('login');
  await expect(sendBadClose(login.url, '172.31.238.55:23000', 'http://localhost:5174', 1500)).resolves.toMatchObject({ error: expect.stringContaining('stayed open') });
});
