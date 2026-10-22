import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { DEFAULT_LIMITS, parseConfig } from '../src/config';

/** The shape of `gateway.config.example.json` (Task 9 commits the file itself). */
function example() {
  return {
    listen: { host: '0.0.0.0', port: 8090 },
    allowedOrigins: ['http://localhost:5174', 'http://192.168.100.159:5174'],
    trustedProxies: [] as string[],
    sendClientAddr: true,
    routes: {
      '172.31.238.55:23000': { host: '127.0.0.1', port: 23000, role: 'certifier' },
      '172.31.238.55:28000': { host: '127.0.0.1', port: 28000, role: 'login' },
      '172.31.238.55:5400': { host: '127.0.0.1', port: 5400, role: 'cache' },
    } as Record<string, unknown>,
  };
}

it('has the limits of the global constraints as its defaults', () => {
  expect(DEFAULT_LIMITS).toEqual({
    maxPacketBytes: 16384,
    maxPacketsPerSecond: 100,
    maxConnectionsPerAddress: 32,
    maxNewConnectionsPerAddressPerMinute: 60,
    maxConnections: 1000,
    maxServerBodyBytes: 1048576,
    connectTimeoutMs: 10000,
    pingIntervalMs: 30000,
    pongTimeoutMs: 60000,
    maxHeldPackets: 4,
  });
});

it('fills in the default limits when the file has none', () => {
  const config = parseConfig(example());
  expect(config).toEqual({ ...example(), limits: DEFAULT_LIMITS });
});

it('takes the limits it is given and defaults the rest', () => {
  const config = parseConfig({ ...example(), limits: { maxPacketsPerSecond: 5, connectTimeoutMs: 250 } });
  expect(config.limits).toEqual({ ...DEFAULT_LIMITS, maxPacketsPerSecond: 5, connectTimeoutMs: 250 });
});

it('takes the total cap and the per-minute limit like any other limit', () => {
  const config = parseConfig({ ...example(), limits: { maxConnections: 5, maxNewConnectionsPerAddressPerMinute: 2 } });
  expect(config.limits).toEqual({ ...DEFAULT_LIMITS, maxConnections: 5, maxNewConnectionsPerAddressPerMinute: 2 });
  expect(() => parseConfig({ ...example(), limits: { maxConnections: 0 } })).toThrow(
    'limits.maxConnections must be a whole number from 1 to 9007199254740991',
  );
});

it('does not hand out the shared defaults object to be changed', () => {
  const config = parseConfig(example());
  config.limits.maxPacketBytes = 1;
  expect(DEFAULT_LIMITS.maxPacketBytes).toBe(16384);
});

it('names the missing top-level field', () => {
  const { routes: _routes, ...withoutRoutes } = example();
  expect(() => parseConfig(withoutRoutes)).toThrow(/routes/);
  expect(() => parseConfig(null)).toThrow(/config/);
  expect(() => parseConfig('{}')).toThrow(/config/);
});

it('accepts only a dotted IPv4 address to listen on, because the gateway listens on IPv4 only', () => {
  for (const host of ['::', '::1', 'localhost', '0.0.0.256', '']) {
    expect(() => parseConfig({ ...example(), listen: { host, port: 8090 } }), host).toThrow(/listen\.host/);
  }
  expect(parseConfig({ ...example(), listen: { host: '127.0.0.1', port: 0 } }).listen).toEqual({
    host: '127.0.0.1', port: 0,
  });
});

it('names the route and the field of a route that is wrong', () => {
  const routes = example().routes;
  routes['172.31.238.55:23000'] = { host: '127.0.0.1', port: 'x', role: 'certifier' };
  expect(() => parseConfig({ ...example(), routes })).toThrow(/routes\["172.31.238.55:23000"\]\.port/);

  const badRole = example().routes;
  badRole['a:1'] = { host: '127.0.0.1', port: 1, role: 'gateway' };
  expect(() => parseConfig({ ...example(), routes: badRole })).toThrow(/routes\["a:1"\]\.role/);

  const noHost = example().routes;
  noHost['a:1'] = { port: 1, role: 'login' };
  expect(() => parseConfig({ ...example(), routes: noHost })).toThrow(/routes\["a:1"\]\.host/);

  const outOfRange = example().routes;
  outOfRange['a:1'] = { host: 'h', port: 65536, role: 'login' };
  expect(() => parseConfig({ ...example(), routes: outOfRange })).toThrow(/routes\["a:1"\]\.port/);
});

it('names the list entry that is wrong', () => {
  expect(() => parseConfig({ ...example(), allowedOrigins: ['http://a', 5] })).toThrow(/allowedOrigins\[1\]/);
  expect(() => parseConfig({ ...example(), allowedOrigins: 'http://a' })).toThrow(/allowedOrigins/);
  // The gateway sees IPv4 peers only, so a proxy listed in any other form could never match.
  expect(() => parseConfig({ ...example(), trustedProxies: ['127.0.0.1', '::1'] })).toThrow(/trustedProxies\[1\]/);
  expect(parseConfig({ ...example(), trustedProxies: ['127.0.0.1'] }).trustedProxies).toEqual(['127.0.0.1']);
});

it('wants sendClientAddr to be a boolean', () => {
  expect(() => parseConfig({ ...example(), sendClientAddr: 'yes' })).toThrow(/sendClientAddr/);
  expect(parseConfig({ ...example(), sendClientAddr: false }).sendClientAddr).toBe(false);
});

it('names the limit that is not a usable number', () => {
  expect(() => parseConfig({ ...example(), limits: { maxPacketBytes: '16384' } })).toThrow(/limits\.maxPacketBytes/);
  expect(() => parseConfig({ ...example(), limits: { connectTimeoutMs: 0 } })).toThrow(/limits\.connectTimeoutMs/);
  expect(() => parseConfig({ ...example(), limits: { pingIntervalMs: 1.5 } })).toThrow(/limits\.pingIntervalMs/);
  expect(() => parseConfig({ ...example(), limits: [] })).toThrow(/limits/);
  // Holding nothing is a valid (strict) setting.
  expect(parseConfig({ ...example(), limits: { maxHeldPackets: 0 } }).limits.maxHeldPackets).toBe(0);
});

it('caps the timer limits at the largest delay Node honours, because a longer one fires after 1 ms', () => {
  const LARGEST = 2147483647;
  for (const name of ['connectTimeoutMs', 'pingIntervalMs', 'pongTimeoutMs'] as const) {
    expect(parseConfig({ ...example(), limits: { [name]: LARGEST } }).limits[name], name).toBe(LARGEST);
    expect(() => parseConfig({ ...example(), limits: { [name]: LARGEST + 1 } }), name).toThrow(new RegExp(`limits\.${name}`));
  }
  // Only timers have that cap.
  expect(parseConfig({ ...example(), limits: { maxServerBodyBytes: 2 ** 40 } }).limits.maxServerBodyBytes).toBe(2 ** 40);
});

it('names a limit that does not exist, because a misspelt one would silently leave the default in force', () => {
  expect(() => parseConfig({ ...example(), limits: { maxPacketsPerSec: 5 } })).toThrow(/limits\.maxPacketsPerSec/);
  expect(() => parseConfig({ ...example(), limits: { maxPacketBytes: 100, extra: 1 } })).toThrow(/limits\.extra/);
  expect(() => parseConfig({ ...example(), limits: { toString: 1 } })).toThrow(/limits\.toString/);
});

it('reads the committed example config, which holds the same values as the shape above', () => {
  const file = fileURLToPath(new URL('../gateway.config.example.json', import.meta.url));
  expect(parseConfig(JSON.parse(readFileSync(file, 'utf8')))).toEqual({ ...example(), limits: DEFAULT_LIMITS });
});
