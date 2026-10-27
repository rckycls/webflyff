import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer, resolveConfig } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { devGatewayProxy, isSamePageUpgrade } from '../devGatewayProxy';

const VM_GATEWAY = 'ws://192.168.100.141:8090';
const LOAD_LIMIT_MS = 30_000;

describe('devGatewayProxy: the environment', () => {
  it('does nothing without GATEWAY_PROXY, whatever else is set, so the e2e tests keep their closed gateway address', () => {
    expect(devGatewayProxy({}, 5174)).toBeUndefined();
    expect(devGatewayProxy({ VITE_GATEWAY_URL: 'ws://127.0.0.1:9' }, 5174)).toBeUndefined();
    // A shell that sets a variable to nothing is the same as one that does not set it.
    expect(devGatewayProxy({ GATEWAY_PROXY: '' }, 5174)).toBeUndefined();
  });

  it('forwards /connect/ upgrades to the gateway, with the dev port in the fixed Origin, and lets the page connect to itself', () => {
    const result = devGatewayProxy({ GATEWAY_PROXY: VM_GATEWAY }, 5174);
    expect(result?.define).toEqual({ 'import.meta.env.VITE_GATEWAY_URL': '""' });
    const entries = Object.entries(result?.proxy ?? {});
    expect(entries.map(([prefix]) => prefix)).toEqual(['/connect/']);
    const options = entries[0]![1];
    expect(options.target).toBe(VM_GATEWAY);
    expect(options.ws).toBe(true);
    // Lower case: the proxy merges these headers over the request's own, whose names are lower case, and a differently
    // spelt `Origin` would be sent next to the page's instead of in place of it.
    expect(options.headers).toEqual({ origin: 'http://localhost:5174' });
    expect(devGatewayProxy({ GATEWAY_PROXY: VM_GATEWAY }, 6000)?.proxy['/connect/']?.headers).toEqual({ origin: 'http://localhost:6000' });
  });

  it('takes an empty VITE_GATEWAY_URL for not set, since empty is what the page is given', () => {
    expect(devGatewayProxy({ GATEWAY_PROXY: VM_GATEWAY, VITE_GATEWAY_URL: '' }, 5174)).toBeDefined();
  });

  it('stops with one sentence naming both settings when both are set', () => {
    const both = { GATEWAY_PROXY: VM_GATEWAY, VITE_GATEWAY_URL: 'ws://192.168.100.141:8090' };
    expect(() => devGatewayProxy(both, 5174)).toThrow(/GATEWAY_PROXY.*VITE_GATEWAY_URL|VITE_GATEWAY_URL.*GATEWAY_PROXY/);
    expect(() => devGatewayProxy(both, 5174)).toThrow(/only GATEWAY_PROXY/);
    expect(() => devGatewayProxy(both, 5174)).toThrow(/VM/);
  });

  it.each([
    ['http://192.168.100.141:8090', 'a scheme other than ws:// and wss://'],
    ['192.168.100.141:8090', 'no scheme'],
    ['ws://192.168.100.141', 'no port'],
    ['wss://gateway.example.com', 'no port, even where it is the default one'],
    ['ws://:8090', 'no host'],
    ['ws://192.168.100.141:0', 'port 0'],
    ['ws://192.168.100.141:99999', 'a port past 65535'],
    ['ws://192.168.100.141:80x', 'a port that is not a number'],
    ['ws://192.168.100.141:8090/connect', 'a path'],
    ['ws://user@192.168.100.141:8090', 'a user name'],
    ['not an address', 'text'],
  ])('stops with the expected form for %s (%s)', (value) => {
    expect(() => devGatewayProxy({ GATEWAY_PROXY: value }, 5174)).toThrow(/GATEWAY_PROXY must look like ws:\/\/192\.168\.100\.141:8090/);
    expect(() => devGatewayProxy({ GATEWAY_PROXY: value }, 5174)).toThrow(value);
  });

  it.each([
    ['wss://gateway.example.com:443', 'wss://gateway.example.com:443'],
    ['ws://[::1]:8090', 'ws://[::1]:8090'],
    ['ws://localhost:8090/', 'ws://localhost:8090'],
    ['WS://GATEWAY.example.com:8090', 'ws://gateway.example.com:8090'],
  ])('accepts %s', (value, target) => {
    expect(devGatewayProxy({ GATEWAY_PROXY: value }, 5174)?.proxy['/connect/']?.target).toBe(target);
  });
});

describe('isSamePageUpgrade: the dev server stands in for the gateway\'s origin check', () => {
  it('accepts the page\'s own address, as the browser reached the dev server', () => {
    expect(isSamePageUpgrade('http://192.168.100.161:5174', '192.168.100.161:5174')).toBe(true);
    expect(isSamePageUpgrade('http://localhost:5174', 'localhost:5174')).toBe(true);
    expect(isSamePageUpgrade('http://[::1]:5174', '[::1]:5174')).toBe(true);
  });

  it('refuses an origin that is not the host the request went to', () => {
    expect(isSamePageUpgrade('https://evil.example', '192.168.100.161:5174')).toBe(false);
    expect(isSamePageUpgrade('http://192.168.100.7:5174', '192.168.100.161:5174')).toBe(false);
    expect(isSamePageUpgrade('https://192.168.100.161:5174', '192.168.100.161:5174')).toBe(false);
  });

  it('refuses a missing origin or host', () => {
    expect(isSamePageUpgrade(undefined, '192.168.100.161:5174')).toBe(false);
    expect(isSamePageUpgrade('http://192.168.100.161:5174', undefined)).toBe(false);
    expect(isSamePageUpgrade(undefined, undefined)).toBe(false);
    expect(isSamePageUpgrade('', '')).toBe(false);
  });

  it('refuses a host and an origin that differ in the port', () => {
    expect(isSamePageUpgrade('http://192.168.100.161:5174', '192.168.100.161:5175')).toBe(false);
    expect(isSamePageUpgrade('http://192.168.100.161', '192.168.100.161:5174')).toBe(false);
  });

  it('refuses a host name that is not an address, as the dev server does for the page (DNS rebinding)', () => {
    // An attacker's page at http://evil.example:5174, with evil.example pointed at this PC, is "the same page".
    expect(isSamePageUpgrade('http://evil.example:5174', 'evil.example:5174')).toBe(false);
    expect(isSamePageUpgrade('http://app.localhost:5174', 'app.localhost:5174')).toBe(true);
  });

  it('is what the proxy asks first, for a request with headers', () => {
    const bypass = devGatewayProxy({ GATEWAY_PROXY: VM_GATEWAY }, 5174)!.proxy['/connect/']!.bypass!;
    const ask = (headers: Record<string, string>) => bypass({ headers } as never, undefined, {} as never);
    expect(ask({ origin: 'http://192.168.100.161:5174', host: '192.168.100.161:5174' })).toBeUndefined();
    // `false` is how the proxy is told to end the request itself, unforwarded.
    expect(ask({ origin: 'https://evil.example', host: '192.168.100.161:5174' })).toBe(false);
    expect(ask({ host: '192.168.100.161:5174' })).toBe(false);
  });
});

// The real thing: this client's own Vite config, started on a free port, with a tiny ws server standing in for the gateway.
// Starting Vite and bundling its config take a moment, a long one when `npm test` has every core busy: the default 5 s is too short.
describe('the dev server with GATEWAY_PROXY set', { timeout: LOAD_LIMIT_MS }, () => {
  const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
  let fake: WebSocketServer;
  let dev: ViteDevServer;
  let devPort: number;
  const arrivals: { url: string | undefined; origins: string[] }[] = [];

  async function freePort(): Promise<number> {
    const probe = createHttpServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return port;
  }

  // Connects as a page would and says how that ended: the status of a refused upgrade, or 'open'.
  async function connect(path: string, origin: string | undefined): Promise<number | 'open'> {
    const socket = new WebSocket(`ws://127.0.0.1:${devPort}${path}`, origin === undefined ? {} : { origin });
    const outcome = await new Promise<number | 'open'>((resolve) => {
      socket.once('open', () => resolve('open'));
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      socket.once('error', () => resolve(0));
    });
    if (outcome === 'open') {
      socket.close();
      await once(socket, 'close');
    } else {
      socket.terminate();
    }
    return outcome;
  }

  beforeAll(async () => {
    fake = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(fake, 'listening');
    fake.on('connection', (_socket, request) => {
      const origins = request.rawHeaders.flatMap((name, i) => (name.toLowerCase() === 'origin' ? [request.rawHeaders[i + 1]!] : []));
      arrivals.push({ url: request.url, origins });
    });
    vi.stubEnv('GATEWAY_PROXY', `ws://127.0.0.1:${(fake.address() as AddressInfo).port}`);
    vi.stubEnv('VITE_GATEWAY_URL', undefined);
    devPort = await freePort();
    dev = await createServer({
      configFile,
      logLevel: 'silent',
      clearScreen: false,
      // Loopback only, on the free port; nothing else of the client's config is changed.
      server: { host: '127.0.0.1', port: devPort, strictPort: true },
      // Nothing to scan for the dependency optimizer: the test needs the proxy, not the client's modules.
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await dev.listen();
  }, LOAD_LIMIT_MS);

  afterAll(async () => {
    await dev?.close();
    for (const client of fake?.clients ?? []) client.terminate();
    await new Promise<void>((resolve) => (fake ? fake.close(() => resolve()) : resolve()));
    vi.unstubAllEnvs();
  }, LOAD_LIMIT_MS);

  it('forwards a page\'s own upgrade with the fixed Origin and the path unchanged, and closes any other before the gateway sees it', async () => {
    expect(await connect('/connect/172.31.238.55:23000', 'http://evil.example')).toBe(404);
    expect(await connect('/connect/172.31.238.55:23000', undefined)).toBe(404);
    expect(await connect('/connect/172.31.238.55:23000', `http://127.0.0.1:${devPort + 1}`)).toBe(404);
    expect(arrivals).toEqual([]);

    expect(await connect('/connect/172.31.238.55:23000', `http://127.0.0.1:${devPort}`)).toBe('open');
    // Exactly one Origin, the fixed one: the page's own would not be in the gateway's allowedOrigins.
    expect(arrivals).toEqual([{ url: '/connect/172.31.238.55:23000', origins: ['http://localhost:5174'] }]);
  });

  it('carries the messages both ways', async () => {
    fake.once('connection', (socket) => socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary })));
    const socket = new WebSocket(`ws://127.0.0.1:${devPort}/connect/172.31.238.55:28000`, { origin: `http://127.0.0.1:${devPort}` });
    await once(socket, 'open');
    const echoed = once(socket, 'message');
    socket.send(new Uint8Array([0xfc, 1, 2, 3]));
    const [data, isBinary] = await echoed;
    expect(isBinary).toBe(true);
    expect([...new Uint8Array(data as Buffer)]).toEqual([0xfc, 1, 2, 3]);
    socket.close();
    await once(socket, 'close');
  });

  it('gives the page an empty VITE_GATEWAY_URL, which config.ts reads as the page\'s own address', async () => {
    const module = await (await fetch(`http://127.0.0.1:${devPort}/src/config.ts`)).text();
    expect(module).toMatch(/VITE_GATEWAY_URL"?\s*[:=]\s*""/);
  });

  it('leaves a build alone: the setting is for the dev server only', async () => {
    const built = await resolveConfig({ configFile, logLevel: 'silent' }, 'build');
    expect(built.server.proxy).toBeUndefined();
    expect(Object.keys(built.define ?? {})).not.toContain('import.meta.env.VITE_GATEWAY_URL');
  });
});
