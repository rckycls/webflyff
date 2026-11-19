// Starts Support / VIP next to the site (2026-11-16). It never takes the site down: a bad `vip` section or an uploads
// folder that cannot be made only writes `vip: off: <reason>`, and /api/vip answers 503 `off`. Without a `vip`
// section nothing is said: it is off. The panel's VIP tab needs the admin section too. With it, rejected requests' receipt
// pictures are deleted `deleteRejectedAfterDays` days after the rejection (checked a minute after start, then every 6 hours).
// 2026-11-19 (VIP perks): with the admin section, the VIP job (vipPerksJob.ts) runs a minute after start, then every
// 5 minutes: the in-game VIP letters follow the VIP list, and the gift boxes go out by in-game mail.
// 2026-11-20 (redeem codes): with the admin section, /api/codes/* (codes/siteCodes.ts) and the code mails.

import path from 'node:path';
import { SessionBook } from '../admin/sessions';
import { deliverOne } from '../codes/codeDelivery';
import type { CodeAdminStore, CodeMailStore, CodeSiteStore } from '../codes/codeStore';
import { CODE_FAILS_PER_ADDRESS_HOUR, CODE_FAILS_PER_HOUR, CODE_REDEEMS_PER_HOUR, codeRoutes } from '../codes/siteCodes';
import type { CodeRoutes } from '../codes/siteCodes';
import { sqlCodeAdminStore, sqlCodeMailStore, sqlCodeSiteStore } from '../codes/sqlCodeStore';
import type { AdminConfig } from '../admin/config';
import type { WebConfig } from '../config';
import { HourlyLimit } from '../hourlyLimit';
import type { Logger } from '../log';
import type { VipRoutes } from '../server';
import { AutoPlayUsage } from './autoPlayUsage';
import { siteVipRoutes } from './siteVip';
import { sqlVipCharacterStore } from './sqlVipCharacterStore';
import { sqlVipAdminStore, sqlVipSiteStore } from './sqlVipStore';
import { VipFiles } from './vipFiles';
import { VipPerksJob } from './vipPerksJob';
import type { VipAdminStore, VipCharacterStore, VipSiteStore } from './vipStore';
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
  /** `codes` (2026-11-20): the panel's Codes view. */
  admin: { store: VipAdminStore; files: VipFiles; codes?: CodeAdminStore } | undefined;
  close(): Promise<void>;
}

export interface VipStores {
  site(): Closable<VipSiteStore>;
  admin(login: AdminConfig['sql']): Closable<VipAdminStore>;
  /** 2026-11-19: the VIP job's CHARACTER_01_DBF side (the SQL one when not given). */
  characters?(login: AdminConfig['sql']): Closable<VipCharacterStore>;
  /** 2026-11-20 (redeem codes): the code stores (the SQL ones when not given). */
  codeSite?(): Closable<CodeSiteStore>;
  codeAdmin?(login: AdminConfig['sql']): Closable<CodeAdminStore>;
  codeMail?(login: AdminConfig['sql']): Closable<CodeMailStore>;
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
  // 2026-11-20 (redeem codes): only with the admin section, whose login writes the code mails
  let codeSite: Closable<CodeSiteStore> | undefined;
  let codeAdmin: Closable<CodeAdminStore> | undefined;
  let codeMail: Closable<CodeMailStore> | undefined;
  let codes: CodeRoutes | undefined;
  if (admin !== undefined && config.admin !== undefined) {
    const login = config.admin.sql;
    codeSite = stores.codeSite?.() ?? sqlCodeSiteStore(config.sql);
    codeAdmin = stores.codeAdmin?.(login) ?? sqlCodeAdminStore(config.sql, login);
    codeMail = stores.codeMail?.(login) ?? sqlCodeMailStore(config.sql, login);
    const delivery = { admin: codeAdmin, mail: codeMail };
    codes = codeRoutes({
      store: codeSite, log,
      failsByAccount: new HourlyLimit(CODE_FAILS_PER_HOUR, now),
      failsByAddress: new HourlyLimit(CODE_FAILS_PER_ADDRESS_HOUR, now),
      redeemsByAccount: new HourlyLimit(CODE_REDEEMS_PER_HOUR, now),
      deliver: (useId) => deliverOne(delivery, log, useId),
    });
  }
  const routes = siteVipRoutes({
    codes,
    config, vip, store: site, files, log,
    sessions: new SessionBook(now, PLAYER_SESSION_IDLE_MS, PLAYER_SESSION_MAX_MS),
    loginFailsByAddress: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now),
    loginFailsByAccount: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now),
    loginsByAccount: new HourlyLimit(LOGINS_PER_HOUR, now),
    requestsByAccount: new HourlyLimit(REQUESTS_PER_HOUR, now),
    // custom (owner 2026-11-17): Auto Play's weekly hours, in the VIP uploads folder the service already writes to
    // (C:\flyff-web\vip-uploads\autoplay-usage.json on the VPS)
    autoPlay: new AutoPlayUsage(path.join(vip.uploadsDir, 'autoplay-usage.json'), now),
  });
  log.info(`vip: on, pictures in ${vip.uploadsDir}${admin === undefined ? ' (no admin section: nobody can approve)' : ''}`);
  const timers: NodeJS.Timeout[] = [];
  if (admin !== undefined && vip.deleteRejectedAfterDays > 0) {
    const sweep = () => { void forgetOldReceipts(vip, admin, files, log); };
    timers.push(setTimeout(sweep, RECEIPT_SWEEP_FIRST_MS).unref(), setInterval(sweep, RECEIPT_SWEEP_EVERY_MS).unref());
  }
  // 2026-11-19 (VIP perks): the VIP job, with the panel's login (it reaches CHARACTER_01_DBF too)
  let characters: Closable<VipCharacterStore> | undefined;
  let job: VipPerksJob | undefined;
  if (admin !== undefined && config.admin !== undefined) {
    const login = config.admin.sql;
    characters = stores.characters?.(login) ?? sqlVipCharacterStore(config.sql, login);
    job = new VipPerksJob({ admin, characters, ...(codeAdmin !== undefined && codeMail !== undefined ? { codes: { admin: codeAdmin, mail: codeMail } } : {}) }, log);
    job.start();
  }
  return {
    routes,
    admin: admin === undefined ? undefined : { store: admin, files, ...(codeAdmin === undefined ? {} : { codes: codeAdmin }) },
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      job?.stop();
      await Promise.all([site.close(), admin?.close(), characters?.close(), codeSite?.close(), codeAdmin?.close(), codeMail?.close()]);
    },
  };
}
