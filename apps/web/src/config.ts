// The web service's settings file, `web.config.json` (website spec §3.4): kept outside the repo and the served folders.
// A bad or missing value stops the service at start, naming its key, as the gateway's settings do. The one exception is
// the `admin` section (admin/config.ts): a bad one only keeps the panel off, so the panel never takes the site down.

import { DEFAULT_RESERVED_NAMES } from '@flyffweb/protocol';
import type { ReservedNames } from '@flyffweb/protocol';
import { parseAdminConfig } from './admin/config';
import type { AdminConfig } from './admin/config';
import { hostPort, integer, ipv4, list, object, text } from './configHelpers';
import { parseVipConfig } from './vip/vipConfig';
import type { VipConfig } from './vip/vipConfig';
import type { HostPort } from './configHelpers';

export type { HostPort } from './configHelpers';

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
  /** The admin panel's settings; `undefined` when the section is missing or bad (then `adminProblem` says why). */
  admin: AdminConfig | undefined;
  /** Why a given `admin` section was not taken: the panel stays off, the site runs. */
  adminProblem: string | undefined;
  /** Support / VIP's settings; `undefined` when the section is missing or bad (then `vipProblem` says why). */
  vip: VipConfig | undefined;
  /** Why a given `vip` section was not taken: Support / VIP stays off, the site runs. */
  vipProblem: string | undefined;
}

/** The `admin` section, or the reason it cannot be used. A missing section is no problem: the panel is simply off. */
function adminSection(value: unknown): { admin: AdminConfig | undefined; adminProblem: string | undefined } {
  if (value === undefined) return { admin: undefined, adminProblem: undefined };
  try {
    return { admin: parseAdminConfig(value), adminProblem: undefined };
  } catch (error) {
    return { admin: undefined, adminProblem: (error as Error).message };
  }
}

/** The `vip` section, or the reason it cannot be used; a missing one keeps Support / VIP off. */
function vipSection(value: unknown): { vip: VipConfig | undefined; vipProblem: string | undefined } {
  if (value === undefined) return { vip: undefined, vipProblem: undefined };
  try {
    return { vip: parseVipConfig(value), vipProblem: undefined };
  } catch (error) {
    return { vip: undefined, vipProblem: (error as Error).message };
  }
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
    ...adminSection(root.admin),
    ...vipSection(root.vip),
  };
}
