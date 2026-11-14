// The Status tab (admin panel spec §5.5): the 7 servers, the gateway, SQL Server, who is online, and the lock line.
// While the World server is not up the online flags are stale (they are cleared only when it starts), so no list.

import type { ActionHandler } from '../adminServer';
import type { CharacterRow } from '../adminStore';
import { lockFrom, readServers } from '../serverState';
import { reply } from './fields';

const status: ActionHandler = async (_body, _ctx, deps) => {
  const [servers, gateway, sql] = await Promise.all([
    readServers(deps),
    deps.probe(deps.config.admin.gateway.host, deps.config.admin.gateway.port),
    deps.store.sqlAlive().catch(() => false),
  ]);
  const lock = lockFrom(servers);
  const stale = servers.find((s) => s.name === 'World')?.up !== 'up';
  let online: CharacterRow[] | null = null;
  if (sql && !stale) online = await deps.store.onlineCharacters().catch(() => null);
  return reply(200, {
    servers, gateway: gateway === 'open', sql, stale, online, players: online === null ? null : online.length,
    charactersOpen: lock.open, lockSeen: lock.seen,
  });
};

export const STATUS_ACTIONS: Record<'status', ActionHandler> = { status };
