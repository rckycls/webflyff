// Which game servers answer (admin panel spec §5.5) and whether character edits are open (§4.3): the Database server
// keeps characters in memory and the World server keeps the online flags, so rename, penya, move, delete and undo run
// only while none of the Database ports and no World port answers.

import type { AdminDeps } from './adminServer';
import type { ServerName } from './config';

export interface ServerState { name: ServerName; ports: number[]; up: 'up' | 'down' | 'partial' }

export async function readServers(deps: AdminDeps): Promise<ServerState[]> {
  return Promise.all(deps.config.admin.servers.map(async (server) => {
    const answers = await Promise.all(server.ports.map((port) => deps.probe(server.host, port)));
    const open = answers.filter(Boolean).length;
    const up: ServerState['up'] = open === answers.length ? 'up' : open === 0 ? 'down' : 'partial';
    return { name: server.name, ports: server.ports, up };
  }));
}

/** Open when every Database and World port is closed; `seen` says what the probe found, for the page and the log. */
export async function characterEditsOpen(deps: AdminDeps): Promise<{ open: boolean; seen: string }> {
  const servers = (await readServers(deps)).filter((s) => s.name === 'Database' || s.name === 'World');
  const seen = servers.map((s) => `${s.name} ${s.up === 'down' ? 'down' : 'up'}`).join(', ');
  return { open: servers.every((s) => s.up === 'down'), seen };
}
