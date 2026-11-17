// Starts the admin panel next to the public web service (admin panel spec §5.1-5.2). The panel never takes the site
// down: a bad `admin` section, a missing or bad admin-login.json, or a port it cannot listen on only writes
// `admin: panel off: <reason>` and leaves 8092 closed. Without an `admin` section nothing is said: the panel is off.

import type { Server } from 'node:http';
import type { WebConfig } from '../config';
import type { Logger } from '../log';
import { LOCK_PROBE_TIMEOUT_MS, probeState } from './serverState';
import { createAdminServer } from './adminServer';
import type { ActionHandler, AdminDeps } from './adminServer';
import type { AdminStore } from './adminStore';
import { readCredentials } from './credentials';
import type { AdminCredentials } from './credentials';
import type { CatalogItem } from './itemCatalog';
import { LoginGuard } from './loginGuard';
import { PageCache } from './pageCache';
import { SessionBook } from './sessions';

const oneLine = (error: unknown) => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

/** The panel's server once it listens, or `undefined` when it stays off. */
export async function startAdmin(
  config: WebConfig,
  log: Logger,
  makeStore: () => AdminStore,
  catalog: CatalogItem[],
  actions: Record<string, ActionHandler> = {},
  vip?: AdminDeps['vip'],
): Promise<Server | undefined> {
  const off = (reason: string): undefined => {
    log.warn(`admin: panel off: ${reason}`);
    return undefined;
  };
  if (config.adminProblem !== undefined) return off(config.adminProblem);
  const admin = config.admin;
  if (admin === undefined) return undefined;

  let credentials: AdminCredentials;
  try {
    credentials = readCredentials(admin.credentialsFile);
  } catch (error) {
    return off(`cannot use ${admin.credentialsFile}: ${oneLine(error)} (run npm run admin:setup)`);
  }

  const now = () => Date.now();
  const server = createAdminServer({
    config: { ...config, admin },
    credentials,
    store: makeStore(),
    sessions: new SessionBook(now, admin.sessionIdleMinutes * 60_000, admin.sessionMaxHours * 3_600_000),
    guard: new LoginGuard(now),
    log,
    now,
    probe: (host, port) => probeState(host, port, LOCK_PROBE_TIMEOUT_MS),
    catalog,
    actions,
    pages: new PageCache(now),
    vip,
  });
  const listened = await new Promise<boolean>((resolve) => {
    server.once('error', (error: Error) => {
      log.warn(`admin: panel off: cannot listen on ${admin.listen.host}:${admin.listen.port}: ${oneLine(error)}`);
      resolve(false);
    });
    server.listen(admin.listen.port, admin.listen.host, () => resolve(true));
  });
  if (!listened) return undefined;
  log.info(`admin: listening ${admin.listen.host}:${admin.listen.port}`);
  return server;
}
