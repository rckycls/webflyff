// The web service's settings file, `web.config.json` (website spec §3.4): kept outside the repo and the served folders.
// A bad or missing value stops the service at start, naming its key, as the gateway's settings do.

import { DEFAULT_RESERVED_NAMES, normalizeIPv4 } from '@flyffweb/protocol';
import type { ReservedNames } from '@flyffweb/protocol';

export interface HostPort { host: string; port: number }

export interface WebLimits {
  /** Sign-up requests of one address in any hour. */
  attemptsPerHour: number;
  /** Accounts made from one address in any hour. */
  createdPerHourPerAddress: number;
  /** Accounts made in all in any hour; past it, sign-ups are paused. */
  createdPerHour: number;
  /** Form tickets given to one address in any hour. */
  ticketsPerHourPerAddress: number;
}

export const DEFAULT_WEB_LIMITS: WebLimits = Object.freeze({
  attemptsPerHour: 20,
  createdPerHourPerAddress: 3,
  createdPerHour: 60,
  ticketsPerHourPerAddress: 60,
});

export interface WebConfig {
  listen: HostPort;
  /** The site's own address, `https://play.example.com`: the only `Origin` allowed to post a sign-up. */
  siteOrigin: string;
  /** Direct peers (IPv4) whose `X-Forwarded-For` is believed: Caddy, `127.0.0.1`. */
  trustedProxies: string[];
  sql: {
    host: string; port: number; user: string; password: string; accountDatabase: string; characterDatabase: string;
    trustServerCertificate: boolean;
  };
  /** The key the form tickets are signed with: 32 characters or more. */
  ticketSecret: string;
  /** The ports whose answer means the game is online. */
  servers: { certifier: HostPort; login: HostPort };
  limits: WebLimits;
  reservedNames: ReservedNames;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as JsonObject;
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
  if (typeof value !== 'string' || normalizeIPv4(value) !== value) throw new Error(`${path} must be a dotted IPv4 address`);
  return value;
}

function list<T>(value: unknown, path: string, entry: (item: unknown, itemPath: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);
  return value.map((item, i) => entry(item, `${path}[${i}]`));
}

function hostPort(value: unknown, path: string): HostPort {
  const at = object(value, path);
  return { host: text(at.host, `${path}.host`), port: integer(at.port, `${path}.port`, 1, 65535) };
}

/** An http(s) origin as a browser sends it: scheme, host and port only, no path or trailing slash. */
function origin(value: unknown, path: string): string {
  const raw = text(value, path);
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    url = undefined;
  }
  if (url === undefined || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== raw) {
    throw new Error(`${path} must be the site's address as a browser sends it in Origin, such as https://play.example.com`);
  }
  return raw;
}

function limits(value: unknown): WebLimits {
  if (value === undefined) return { ...DEFAULT_WEB_LIMITS };
  const given = object(value, 'limits');
  for (const name of Object.keys(given)) {
    if (!Object.hasOwn(DEFAULT_WEB_LIMITS, name)) throw new Error(`limits.${name} is not a limit of the web service`);
  }
  const result = { ...DEFAULT_WEB_LIMITS };
  for (const name of Object.keys(DEFAULT_WEB_LIMITS) as (keyof WebLimits)[]) {
    if (given[name] !== undefined) result[name] = integer(given[name], `limits.${name}`, 1);
  }
  return result;
}

function reservedNames(value: unknown): ReservedNames {
  if (value === undefined) return DEFAULT_RESERVED_NAMES;
  const given = object(value, 'reservedNames');
  // compared with the normalized (lower-case) account
  const names = (key: 'exact' | 'prefixes') =>
    list(given[key], `reservedNames.${key}`, (item, path) => text(item, path).trim().toLowerCase());
  return { exact: names('exact'), prefixes: names('prefixes') };
}

/** Checks a `web.config.json`'s contents and returns them, with the limits and reserved names it leaves out set to the defaults. */
export function parseWebConfig(json: unknown): WebConfig {
  const root = object(json, 'config');
  const listen = object(root.listen, 'listen');
  const sql = object(root.sql, 'sql');
  const servers = object(root.servers, 'servers');
  if (typeof sql.trustServerCertificate !== 'boolean') throw new Error('sql.trustServerCertificate must be true or false');
  const ticketSecret = text(root.ticketSecret, 'ticketSecret');
  if (ticketSecret.length < 32) throw new Error('ticketSecret must be at least 32 characters long');
  return {
    listen: { host: ipv4(listen.host, 'listen.host'), port: integer(listen.port, 'listen.port', 1, 65535) },
    siteOrigin: origin(root.siteOrigin, 'siteOrigin'),
    trustedProxies: list(root.trustedProxies, 'trustedProxies', ipv4),
    sql: {
      host: text(sql.host, 'sql.host'),
      port: integer(sql.port, 'sql.port', 1, 65535),
      user: text(sql.user, 'sql.user'),
      password: text(sql.password, 'sql.password'),
      accountDatabase: text(sql.accountDatabase, 'sql.accountDatabase'),
      characterDatabase: text(sql.characterDatabase, 'sql.characterDatabase'),
      trustServerCertificate: sql.trustServerCertificate,
    },
    ticketSecret,
    servers: { certifier: hostPort(servers.certifier, 'servers.certifier'), login: hostPort(servers.login, 'servers.login') },
    limits: limits(root.limits),
    reservedNames: reservedNames(root.reservedNames),
  };
}
