// The `admin` section of web.config.json (admin panel spec §5.2). parseWebConfig catches what this throws: a bad
// section keeps the panel off and the site running.

import { hostPort, integer, ipv4, list, object, onlyKeys, text } from '../configHelpers';
import type { HostPort } from '../configHelpers';

export type ServerName = 'Account' | 'Certifier' | 'Database' | 'Core' | 'Login' | 'Cache' | 'World';

export interface GameServer { name: ServerName; host: string; ports: number[] }

/** The 7 game servers in start order, with the ports they listen on (deploy/Common.ps1's list; World = 3000 + key 101). */
export const DEFAULT_PORTS: Readonly<Record<ServerName, readonly number[]>> = Object.freeze({
  Account: [12000],
  Certifier: [23000],
  Database: [7000, 24000, 7200],
  Core: [4000, 4001, 4002],
  Login: [28000],
  Cache: [5400],
  World: [3101],
});

const SERVER_NAMES = Object.keys(DEFAULT_PORTS) as ServerName[];

export interface AdminConfig {
  /** Always 127.0.0.1: Caddy is the only way in. */
  listen: HostPort;
  /** The panel's own address as a browser sends it in Origin: `https://admin.osflyff.online`. */
  origin: string;
  /** The SQL login `flyffweb_admin`; the host, port and databases are the `sql` section's. */
  sql: { user: string; password: string };
  /** admin-login.json: the one admin's name, password hash and authenticator key. */
  credentialsFile: string;
  sessionIdleMinutes: number;
  sessionMaxHours: number;
  servers: GameServer[];
  gateway: HostPort;
  /** FlyffWeb's converted game data (index.json), for the item list. */
  assetsDir: string;
}

const KEYS = [
  'listen', 'origin', 'sql', 'credentialsFile', 'sessionIdleMinutes', 'sessionMaxHours', 'serverHost', 'ports', 'gateway',
  'assetsDir',
] as const;

/**
 * An https origin, scheme and host (and port) only. Test runs may use `http://127.0.0.1:<port>` or
 * `http://localhost:<port>`, and only while the panel listens on 127.0.0.1 (which it always does).
 */
function adminOrigin(value: unknown, path: string): string {
  const raw = text(value, path);
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    url = undefined;
  }
  const loopback = url?.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url === undefined || url.origin !== raw || (url.protocol !== 'https:' && !loopback)) {
    throw new Error(`${path} must be the panel's https address as a browser sends it, such as https://admin.osflyff.online`);
  }
  return raw;
}

function ports(value: unknown, path: string): number[] {
  const given = list(value, path, (item, itemPath) => integer(item, itemPath, 1, 65535));
  if (given.length === 0) throw new Error(`${path} must list at least one port`);
  return given;
}

function servers(serverHost: unknown, given: unknown): GameServer[] {
  const host = serverHost === undefined ? '127.0.0.1' : text(serverHost, 'admin.serverHost');
  const overrides = given === undefined ? {} : object(given, 'admin.ports');
  onlyKeys(overrides, SERVER_NAMES, 'admin.ports');
  return SERVER_NAMES.map((name) => ({
    name,
    host,
    ports: overrides[name] === undefined ? [...DEFAULT_PORTS[name]] : ports(overrides[name], `admin.ports.${name}`),
  }));
}

export function parseAdminConfig(value: unknown): AdminConfig {
  const root = object(value, 'admin');
  onlyKeys(root, KEYS, 'admin');
  const listen = object(root.listen, 'admin.listen');
  const host = ipv4(listen.host, 'admin.listen.host');
  if (host !== '127.0.0.1') throw new Error('admin.listen.host must be 127.0.0.1: only Caddy may reach the panel');
  const sql = object(root.sql, 'admin.sql');
  return {
    listen: { host, port: integer(listen.port, 'admin.listen.port', 1, 65535) },
    origin: adminOrigin(root.origin, 'admin.origin'),
    sql: { user: text(sql.user, 'admin.sql.user'), password: text(sql.password, 'admin.sql.password') },
    credentialsFile: text(root.credentialsFile, 'admin.credentialsFile'),
    sessionIdleMinutes: root.sessionIdleMinutes === undefined ? 30 : integer(root.sessionIdleMinutes, 'admin.sessionIdleMinutes', 1, 240),
    sessionMaxHours: root.sessionMaxHours === undefined ? 12 : integer(root.sessionMaxHours, 'admin.sessionMaxHours', 1, 24),
    servers: servers(root.serverHost, root.ports),
    gateway: root.gateway === undefined ? { host: '127.0.0.1', port: 8090 } : hostPort(root.gateway, 'admin.gateway'),
    assetsDir: root.assetsDir === undefined ? 'dist/assets' : text(root.assetsDir, 'admin.assetsDir'),
  };
}
