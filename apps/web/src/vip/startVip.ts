// Starts Support / VIP next to the site (2026-11-16). It never takes the site down: a bad `vip` section or an uploads
// folder that cannot be made only writes `vip: off: <reason>`, and /api/vip answers 503 `off`. Without a `vip`
// section nothing is said: it is off. The panel's VIP tab needs the admin section too. With it, rejected requests' receipt
// pictures are deleted `deleteRejectedAfterDays` days after the rejection (checked a minute after start, then every 6 hours).

import path from 'node:path';
import { SessionBook } from '../admin/sessions';
import type { AdminConfig } from '../admin/config';
import type { WebConfig } from '../config';
import { HourlyLimit } from '../hourlyLimit';
import type { Logger } from '../log';
import type { VipRoutes } from '../server';
import { AutoPlayUsage } from './autoPlayUsage';
import { siteVipRoutes } from './siteVip';
import { sqlVipAdminStore, sqlVipSiteStore } from './sqlVipStore';
import { VipFiles } from './vipFiles';
import type { VipAdminStore, VipSiteStore } from './vipStore';
import type { VipConfig } from './vipConfig';

/** A player's site session: 60 minutes without a request, 12 hours at most. */
export const PLAYER_SESSION_IDLE_MS = 60 * 60_000;
export const PLAYER_SESSION_MAX_MS = 12 * 3_600_000;
/** Failed logins in an hour, from one address and for one account. */
export const LOGIN_FAILS_PER_HOUR = 10;
/** Logins of one account in an hour. */
export const LOGINS_PER_HOUR = 20;
/** Requests one account may send in an hour (each also needs its own reference). */
export const REQUESTS_PER_HOUR = 6;
/** When old rejected receipts are looked for: a minute after start, then every 6 hours. */
export const RECEIPT_SWEEP_FIRST_MS = 60_000;
export const RECEIPT_SWEEP_EVERY_MS = 6 * 3_600_000;

type Closable<T> = T & { close(): Promise<void> };

export interface StartedVip {
  routes: VipRoutes | undefined;
  admin: { store: VipAdminStore; files: VipFiles } | undefined;
  close(): Promise<void>;
}

export interface VipStores {
  site(): Closable<VipSiteStore>;
  admin(login: AdminConfig['sql']): Closable<VipAdminStore>;
}

/**
 * Deletes the receipt pictures of requests rejected more than `vip.deleteRejectedAfterDays` days ago (the requests stay,
 * without a picture). Never throws: a failure is one log line, and the next sweep tries again.
 */
export async function forgetOldReceipts(vip: VipConfig, store: VipAdminStore, files: VipFiles, log: Logger): Promise<number> {
  if (vip.deleteRejectedAfterDays <= 0) return 0;
  try {
    const names = await store.forgetReceipts(vip.deleteRejectedAfterDays);
    for (const name of names) await files.remove('receipts', name);
    if (names.length > 0) log.info(`vip: deleted ${names.length} receipt picture(s) of requests rejected over ${vip.deleteRejectedAfterDays} days ago`);
    return names.length;
  } catch (error) {
    log.warn(`vip: old receipts not deleted: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
    return 0;
  }
}

export function startVip(config: WebConfig, log: Logger, now: () => number, stores: VipStores = {
  site: () => sqlVipSiteStore(config.sql),
  admin: (login) => sqlVipAdminStore(config.sql, login),
}): StartedVip {
  const off: StartedVip = { routes: undefined, admin: undefined, close: async () => undefined };
  if (config.vipProblem !== undefined) {
    log.warn(`vip: off: ${config.vipProblem}`);
    return off;
  }
  const vip = config.vip;
  if (vip === undefined) return off;
  let files: VipFiles;
  try {
    files = new VipFiles(vip.uploadsDir);
  } catch (error) {
    log.warn(`vip: off: cannot make ${vip.uploadsDir}: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
    return off;
  }
  const site = stores.site();
  const admin = config.admin === undefined ? undefined : stores.admin(config.admin.sql);
  const routes = siteVipRoutes({
    config, vip, store: site, files, log,
    sessions: new SessionBook(now, PLAYER_SESSION_IDLE_MS, PLAYER_SESSION_MAX_MS),
    loginFailsByAddress: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now),
    loginFailsByAccount: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now),
    loginsByAccount: new HourlyLimit(LOGINS_PER_HOUR, now),
    requestsByAccount: new HourlyLimit(REQUESTS_PER_HOUR, now),
    // custom (owner 2026-11-17): Auto Play's weekly hours, beside the VIP uploads (C:\flyff-web\autoplay-usage.json)
    autoPlay: new AutoPlayUsage(path.join(path.dirname(vip.uploadsDir), 'autoplay-usage.json'), now),
  });
  log.info(`vip: on, pictures in ${vip.uploadsDir}${admin === undefined ? ' (no admin section: nobody can approve)' : ''}`);
  const timers: NodeJS.Timeout[] = [];
  if (admin !== undefined && vip.deleteRejectedAfterDays > 0) {
    const sweep = () => { void forgetOldReceipts(vip, admin, files, log); };
    timers.push(setTimeout(sweep, RECEIPT_SWEEP_FIRST_MS).unref(), setInterval(sweep, RECEIPT_SWEEP_EVERY_MS).unref());
  }
  return {
    routes,
    admin: admin === undefined ? undefined : { store: admin, files },
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      await Promise.all([site.close(), admin?.close()]);
    },
  };
}
