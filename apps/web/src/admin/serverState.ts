// Which game servers answer (admin panel spec §5.5) and whether character edits are open (§4.3): the Database server
// keeps characters in memory and the World server keeps the online flags, so rename, penya, move, delete and undo run
// only while every Database port and the World port clearly refuse a connection. A port that does not answer at all
// (a timeout, a wrong host, a firewall) is "unknown", and unknown keeps the edits locked: the lock never fails open.

import { connect } from 'node:net';
import type { AdminDeps } from './adminServer';
import type { ServerName } from './config';

export type PortState = 'open' | 'closed' | 'unknown';

/**
 * How long a probe waits. Windows answers a refused connection to a closed local port only after its SYN retries
 * (about 2 seconds), so a shorter wait would call every stopped server "unknown".
 */
export const LOCK_PROBE_TIMEOUT_MS = 3000;

/** 'open' when `host:port` takes a connection, 'closed' when it is refused (ECONNREFUSED), else 'unknown'. */
export function probeState(host: string, port: number, timeoutMs = LOCK_PROBE_TIMEOUT_MS): Promise<PortState> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (state: PortState) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(state);
    };
    const timer = setTimeout(() => done('unknown'), timeoutMs);
    socket.once('connect', () => done('open'));
    socket.once('error', (error: NodeJS.ErrnoException) => done(error.code === 'ECONNREFUSED' ? 'closed' : 'unknown'));
  });
}

export interface ServerState { name: ServerName; ports: number[]; up: 'up' | 'down' | 'partial' | 'unknown' }

export async function readServers(deps: AdminDeps): Promise<ServerState[]> {
  return Promise.all(deps.config.admin.servers.map(async (server) => {
    const states = await Promise.all(server.ports.map((port) => deps.probe(server.host, port)));
    let up: ServerState['up'] = 'partial';
    if (states.some((s) => s === 'unknown')) up = 'unknown';
    else if (states.every((s) => s === 'open')) up = 'up';
    else if (states.every((s) => s === 'closed')) up = 'down';
    return { name: server.name, ports: server.ports, up };
  }));
}

/** The lock seen in `servers`: open only when the Database and the World are both clearly down. */
export function lockFrom(servers: ServerState[]): { open: boolean; seen: string } {
  const watched = servers.filter((s) => s.name === 'Database' || s.name === 'World');
  const seen = watched.map((s) => `${s.name} ${s.up === 'partial' ? 'up' : s.up}`).join(', ');
  return { open: watched.length > 0 && watched.every((s) => s.up === 'down'), seen };
}

/** Probes now; `seen` says what the probe found, for the page and the log. */
export async function characterEditsOpen(deps: AdminDeps): Promise<{ open: boolean; seen: string }> {
  return lockFrom(await readServers(deps));
}
