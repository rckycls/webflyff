import { normalizeIPv4 } from './clientAddress';

export interface RouteTarget {
  /** Where the server really listens. */
  host: string;
  port: number;
  role: 'certifier' | 'login' | 'cache';
}

export interface Limits {
  /** The largest body a browser may send. */
  maxPacketBytes: number;
  maxPacketsPerSecond: number;
  /** Open connections of one player address. */
  maxConnectionsPerAddress: number;
  /** New connections of one player address in any 60 seconds. */
  maxNewConnectionsPerAddressPerMinute: number;
  /** Open connections in all. */
  maxConnections: number;
  /** The largest body a server may send. */
  maxServerBodyBytes: number;
  connectTimeoutMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
  /** How many browser packets are kept until the server's protocol ID arrives. */
  maxHeldPackets: number;
}

export const DEFAULT_LIMITS: Limits = Object.freeze({
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

export interface GatewayConfig {
  listen: { host: string; port: number };
  /** `Origin` values allowed to open a WebSocket. */
  allowedOrigins: string[];
  /** Direct peers (IPv4) whose `X-Forwarded-For` header is believed. */
  trustedProxies: string[];
  /** Advertised `address:port` to where the server really is. */
  routes: Record<string, RouteTarget>;
  /** Whether certifier routes get the player's real address (spec section 5). */
  sendClientAddr: boolean;
  limits: Limits;
}

const ROLES: readonly RouteTarget['role'][] = ['certifier', 'login', 'cache'];

/** Node fires a timer set for more than this many milliseconds (2^31 - 1, about 24.8 days) after 1 ms instead. */
const MAX_TIMER_MS = 2147483647;
const TIMER_LIMITS: ReadonlySet<keyof Limits> = new Set(['connectTimeoutMs', 'pingIntervalMs', 'pongTimeoutMs']);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown, path: string): JsonObject {
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function integer(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${path} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function ipv4(value: unknown, path: string): string {
  if (typeof value !== 'string' || normalizeIPv4(value) !== value) {
    throw new Error(`${path} must be a dotted IPv4 address, because the gateway uses IPv4 only`);
  }
  return value;
}

function list<T>(value: unknown, path: string, entry: (item: unknown, itemPath: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);
  return value.map((item, i) => entry(item, `${path}[${i}]`));
}

function route(value: unknown, path: string): RouteTarget {
  const target = object(value, path);
  const role = target.role;
  if (!ROLES.includes(role as RouteTarget['role'])) {
    throw new Error(`${path}.role must be one of ${ROLES.join(', ')}`);
  }
  return {
    host: text(target.host, `${path}.host`),
    port: integer(target.port, `${path}.port`, 1, 65535),
    role: role as RouteTarget['role'],
  };
}

/**
 * Checks the contents of a `gateway.config.json` and returns them, with the limits it leaves out set to
 * `DEFAULT_LIMITS`. A value of the wrong shape, or a limit the gateway does not have, throws an `Error` that names
 * its path in the file, for example `routes["172.31.238.55:23000"].port`.
 */
export function parseConfig(json: unknown): GatewayConfig {
  const root = object(json, 'config');
  const listen = object(root.listen, 'listen');
  const routes = object(root.routes, 'routes');
  if (typeof root.sendClientAddr !== 'boolean') throw new Error('sendClientAddr must be true or false');

  const limitValues = root.limits === undefined ? {} : object(root.limits, 'limits');
  // A misspelt limit would otherwise leave the default in force without a word.
  for (const name of Object.keys(limitValues)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, name)) throw new Error(`limits.${name} is not a limit of the gateway`);
  }
  const limits: Limits = { ...DEFAULT_LIMITS };
  for (const name of Object.keys(DEFAULT_LIMITS) as Array<keyof Limits>) {
    if (limitValues[name] === undefined) continue;
    // Holding no packets at all is a valid setting; every other limit needs at least 1.
    const min = name === 'maxHeldPackets' ? 0 : 1;
    limits[name] = integer(limitValues[name], `limits.${name}`, min, TIMER_LIMITS.has(name) ? MAX_TIMER_MS : undefined);
  }

  return {
    listen: { host: ipv4(listen.host, 'listen.host'), port: integer(listen.port, 'listen.port', 0, 65535) },
    allowedOrigins: list(root.allowedOrigins, 'allowedOrigins', text),
    trustedProxies: list(root.trustedProxies, 'trustedProxies', ipv4),
    routes: Object.fromEntries(
      Object.entries(routes).map(([key, value]) => [key, route(value, `routes[${JSON.stringify(key)}]`)]),
    ),
    sendClientAddr: root.sendClientAddr,
    limits,
  };
}
