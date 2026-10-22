import { afterEach, expect, it } from 'vitest';
import { WebSocket, type ClientOptions } from 'ws';
import { bytesToHex, encodeGatewayClientAddr } from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServer, type FakeFlyffServerOptions } from '@flyffweb/testkit';
import { DEFAULT_LIMITS, type GatewayConfig, type Limits } from '../src/config';
import { startGateway, type Gateway } from '../src/server';

const ORIGIN = 'http://app.test';
const CERTIFIER = '172.31.238.55:23000';
const LOGIN = '172.31.238.55:28000';

// Everything a test opens is closed here, newest first: browsers, then the gateway, then the fake server.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Browser {
  ws: WebSocket;
  /** Binary messages received so far. */
  messages: Uint8Array[];
  /** The code the connection was closed with. */
  closed: Promise<number>;
}

interface Setup {
  fake: FakeFlyffServer;
  gateway: Gateway;
  /** What the gateway wrote to its log. */
  logs: string[];
  url(path: string): string;
  /** Connects to `/connect/<route>` as a browser from the allowed origin, and resolves once the WebSocket is open. */
  browser(route?: string, options?: ClientOptions): Promise<Browser>;
}

interface SetupOptions extends Partial<Pick<GatewayConfig, 'trustedProxies' | 'sendClientAddr'>> {
  limits?: Partial<Limits>;
  fake?: FakeFlyffServerOptions;
}

/** A fake server, and a gateway whose certifier and login routes lead to it. */
async function setup(options: SetupOptions = {}): Promise<Setup> {
  const fake = await startFakeFlyffServer(options.fake);
  cleanups.push(() => fake.close());
  const logs: string[] = [];
  const gateway = await startGateway(
    {
      listen: { host: '127.0.0.1', port: 0 },
      allowedOrigins: [ORIGIN],
      trustedProxies: options.trustedProxies ?? [],
      sendClientAddr: options.sendClientAddr ?? false,
      routes: {
        [CERTIFIER]: { host: '127.0.0.1', port: fake.port, role: 'certifier' },
        [LOGIN]: { host: '127.0.0.1', port: fake.port, role: 'login' },
      },
      limits: { ...DEFAULT_LIMITS, ...options.limits },
    },
    { info: (line) => { logs.push(line); } },
  );
  cleanups.push(() => gateway.close());

  const url = (path: string) => `ws://127.0.0.1:${gateway.port}${path}`;
  return {
    fake,
    gateway,
    logs,
    url,
    async browser(route = LOGIN, clientOptions = {}) {
      const ws = new WebSocket(url(`/connect/${route}`), { origin: ORIGIN, ...clientOptions });
      cleanups.push(async () => { ws.terminate(); });
      const messages: Uint8Array[] = [];
      ws.on('message', (data: Buffer) => messages.push(new Uint8Array(data)));
      const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      return { ws, messages, closed };
    },
  };
}

/** The HTTP status the gateway answers an upgrade request with, when it does not upgrade. */
function refusedWith(url: string, options: ClientOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode!);
    });
    ws.once('open', () => {
      ws.terminate();
      reject(new Error('the gateway accepted the upgrade'));
    });
    ws.once('error', reject);
  });
}

const keepAlive = new Uint8Array([0x18, 0, 0, 0]);
const closeLines = (logs: string[]) => logs.filter((line) => line.startsWith('close '));

it.each([
  ['no Origin header', undefined],
  ['an Origin that is not listed', 'http://evil.test'],
  ['an Origin that is listed but for a trailing slash', `${ORIGIN}/`],
])('answers an upgrade with 403, and connects nowhere, for %s', async (_name, origin) => {
  const t = await setup();
  await expect(refusedWith(t.url(`/connect/${LOGIN}`), { origin })).resolves.toBe(403);
  expect(t.fake.connections).toBe(0);
  expect(t.logs).toEqual([]);
});

it.each([
  ['a path that is not /connect/', '/'],
  ['a route with no port', '/connect/172.31.238.55'],
  ['a route with a path behind it', `/connect/${LOGIN}/more`],
  ['a route that is not valid percent-encoding', '/connect/%zz:1'],
])('answers an upgrade with 404 for %s', async (_name, path) => {
  const t = await setup();
  await expect(refusedWith(t.url(path), { origin: ORIGIN })).resolves.toBe(404);
});

it('answers a request that is not an upgrade with 404', async () => {
  const t = await setup();
  const response = await fetch(`http://127.0.0.1:${t.gateway.port}/connect/${LOGIN}`);
  expect(response.status).toBe(404);
  await response.arrayBuffer();
});

it('answers an upgrade with 400 when the player\'s address cannot be told', async () => {
  const t = await setup({ trustedProxies: ['127.0.0.1'] });
  const headers = { 'X-Forwarded-For': 'not-an-address' };
  await expect(refusedWith(t.url(`/connect/${LOGIN}`), { origin: ORIGIN, headers })).resolves.toBe(400);
  expect(t.fake.connections).toBe(0);
});

it('takes the route percent-encoded, and ignores a query string', async () => {
  const t = await setup();
  const encoded = await t.browser(encodeURIComponent(LOGIN));
  encoded.ws.send(keepAlive);
  const withQuery = await t.browser(`${LOGIN}?cache=1`);
  withQuery.ws.send(keepAlive);
  await t.fake.waitForBodies(2);
  expect(t.fake.crcErrors).toBe(0);
});

it('accepts the upgrade for a route that is not in the table, then closes it with 4003', async () => {
  const t = await setup();
  const browser = await t.browser('9.9.9.9:23000');
  await expect(browser.closed).resolves.toBe(4003);
  expect(t.fake.connections).toBe(0);
  expect(t.logs).toEqual([]);
});

it('closes the connection over the per-address limit with 4007, and takes a new one when a slot is free again', async () => {
  const t = await setup({ limits: { maxConnectionsPerAddress: 2 } });
  const first = await t.browser();
  await t.browser();
  const third = await t.browser();
  await expect(third.closed).resolves.toBe(4007);

  first.ws.close(1000);
  await expect.poll(() => closeLines(t.logs).length).toBe(1); // the slot is given back before the line is written
  const fourth = await t.browser();
  fourth.ws.send(keepAlive);
  await t.fake.waitForBodies(1);
  expect(fourth.ws.readyState).toBe(WebSocket.OPEN);
});

it('closes with 4004 on the packet that goes over maxPacketsPerSecond', async () => {
  // Room to hold all six, so that it is the rate, not the packets held before the protocol ID, that ends it.
  const t = await setup({ limits: { maxPacketsPerSecond: 5, maxHeldPackets: 10 } });
  const browser = await t.browser();
  for (let n = 1; n <= 6; n++) browser.ws.send(new Uint8Array([0xfc, n, 0, 0]));
  await expect(browser.closed).resolves.toBe(4004);
  await expect.poll(() => closeLines(t.logs)[0]).toMatch(/^close 127\.0\.0\.1 172\.31\.238\.55:28000 code=4004 up=\d+ down=0$/);
  expect(t.fake.received.length).toBeLessThanOrEqual(5); // the sixth never went through
});

it.each([
  ['relays a packet of 16384 bytes', 16384, undefined],
  ['closes with 4004, from the relay, on a packet one byte over', 16385, 4004],
  ['closes with 1009, from the WebSocket library, on a longer packet', 16386, 1009],
])('%s', async (_name, size, code) => {
  const t = await setup();
  const browser = await t.browser();
  browser.ws.send(new Uint8Array(size));
  if (code === undefined) {
    await t.fake.waitForBodies(1);
    expect(t.fake.received[0]!.byteLength).toBe(size);
    return;
  }
  await expect(browser.closed).resolves.toBe(code);
  await expect.poll(() => closeLines(t.logs)).toEqual([`close 127.0.0.1 ${LOGIN} code=${code} up=0 down=0`]);
  expect(t.fake.received).toEqual([]);
});

it('terminates a browser that does not answer pings, and with it the TCP connection (a phone that fell asleep)', async () => {
  const t = await setup({ limits: { pingIntervalMs: 50, pongTimeoutMs: 150 } });
  const browser = await t.browser(LOGIN, { autoPong: false });
  await expect(browser.closed).resolves.toBe(1006);
  // The server end of the TCP connection went too, so the certifier or login server does not keep the session.
  await expect.poll(() => t.fake.connectionsClosed).toBe(1);
  expect(t.fake.connections).toBe(1);
  await expect.poll(() => closeLines(t.logs)).toEqual([`close 127.0.0.1 ${LOGIN} code=1006 up=0 down=0`]);
});

it('keeps a browser that answers its pings, well past the pong timeout', async () => {
  const t = await setup({ limits: { pingIntervalMs: 10, pongTimeoutMs: 300 } });
  const browser = await t.browser();
  let pings = 0;
  await new Promise<void>((resolve) => browser.ws.on('ping', () => { if (++pings === 40) resolve(); })); // 400 ms and more
  expect(browser.ws.readyState).toBe(WebSocket.OPEN);
  expect(t.fake.connectionsClosed).toBe(0);
});

it('sends the address in X-Forwarded-For to the certifier when the direct peer is a trusted proxy', async () => {
  const t = await setup({ trustedProxies: ['127.0.0.1'], sendClientAddr: true });
  await t.browser(CERTIFIER, { headers: { 'X-Forwarded-For': '10.0.0.7' } });
  await t.fake.waitForBodies(1);
  expect(bytesToHex(t.fake.received[0]!)).toBe(bytesToHex(encodeGatewayClientAddr('10.0.0.7')));
});

it('sends the peer\'s own address, and ignores X-Forwarded-For, when the peer is not a trusted proxy', async () => {
  const t = await setup({ sendClientAddr: true });
  await t.browser(CERTIFIER, { headers: { 'X-Forwarded-For': '10.0.0.7' } });
  await t.fake.waitForBodies(1);
  expect(bytesToHex(t.fake.received[0]!)).toBe(bytesToHex(encodeGatewayClientAddr('127.0.0.1')));
});

it('logs one line when a connection opens and one when it closes, and never what the packets hold', async () => {
  const t = await setup({ fake: { onBody: (body, reply) => reply(body) } });
  const browser = await t.browser();
  const body = new Uint8Array([0xfc, 0, 0, 0, ...Buffer.from('SECRETHASH')]); // 14 bytes
  browser.ws.send(body);
  await expect.poll(() => browser.messages.length).toBe(1); // it went to the server and came back
  browser.ws.close(1000);
  await expect.poll(() => t.logs.length).toBe(2);

  expect(t.logs).toEqual([`open 127.0.0.1 ${LOGIN}`, `close 127.0.0.1 ${LOGIN} code=1000 up=14 down=14`]);
  const hex = bytesToHex(Buffer.from('SECRETHASH'));
  for (const line of t.logs) {
    expect(line).not.toContain('SECRETHASH');
    expect(line.toLowerCase()).not.toContain(hex);
    expect(line).not.toContain(Buffer.from('SECRETHASH').toString('base64'));
  }
});

it('stops accepting, ends the open connections and their TCP sides on close, and can be closed twice', async () => {
  const t = await setup();
  const browser = await t.browser();
  browser.ws.send(keepAlive);
  await t.fake.waitForBodies(1);

  await Promise.all([t.gateway.close(), t.gateway.close()]);
  await expect(browser.closed).resolves.toBe(1006);
  await expect.poll(() => t.fake.connectionsClosed).toBe(1);
  await expect(refusedWith(t.url(`/connect/${LOGIN}`), { origin: ORIGIN })).rejects.toThrow(/ECONNREFUSED/);
  expect(closeLines(t.logs)).toHaveLength(1);
});
