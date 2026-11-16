// Support / VIP on the public web service (behind Caddy's /api/*), 2026-11-16. Payments are made outside the site, by
// QR; a player sends the receipt and the reference number, and an admin approves or rejects it in the panel.
//
// - `GET /api/account/session`: `{account, csrf}` for the cookie's live session, or 401 `session`;
// - `POST /api/account/login` `{account, password}`: the game account, checked as the game's login checks it;
//   `POST /api/account/logout`;
// - `GET /api/vip`: the tiers and QRs that are on, and `me` (the live VIP and the last 20 requests) when logged in;
// - `GET /api/vip/qr/<id>`: a QR picture (only one that is on);
// - `POST /api/vip/requests` `{tier, reference, receipt, requestId}`: a new request (receipt = base64 picture);
// - `GET /api/vip/receipt/<id>`: the receipt of one of the player's own requests.
//
// Every POST: Origin = siteOrigin (403), JSON (415), a size limit (413). Every POST but login: a live session from the
// `__Host-flyff` cookie (401) and X-Site-Token = its CSRF token (403); these are checked from the headers before a
// big body is read. Login: 10 failures an hour from one address, or for one account, or 20 logins of one account, and
// it waits (429). Requests: a
// request id taken once per session (409 repeat), 6 an hour per account (429), at most `maxPendingPerAccount`
// processing (409 too_many), a reference not used by a processing or approved request (409 reference).
//
// One log line per login and request: `vip <address> <account> <what>`. Never a password, a hash or a picture.

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hashPassword, normalizeAccount } from '@flyffweb/protocol';
import type { SessionBook } from '../admin/sessions';
import type { WebConfig } from '../config';
import type { HourlyLimit } from '../hourlyLimit';
import type { Logger } from '../log';
import { readBody } from '../server';
import { MAX_IMAGE_BODY_BYTES, readImageField } from './images';
import type { VipConfig } from './vipConfig';
import type { VipFiles } from './vipFiles';
import type { VipSiteStore } from './vipStore';

export const SITE_COOKIE = '__Host-flyff';
export const SITE_TOKEN_HEADER = 'x-site-token';
const LOGIN_BODY_LIMIT = 1024;

export interface SiteVipDeps {
  config: WebConfig;
  vip: VipConfig;
  store: VipSiteStore;
  files: VipFiles;
  sessions: SessionBook;
  /** Failed logins of one address, and of one account, in an hour. */
  loginFailsByAddress: HourlyLimit;
  loginFailsByAccount: HourlyLimit;
  /** Logins of one account in an hour (each makes a session kept in memory). */
  loginsByAccount: HourlyLimit;
  /** Requests sent by one account in an hour. */
  requestsByAccount: HourlyLimit;
  log: Logger;
}

const JSON_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}, close = false): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...JSON_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...extra,
    ...(close ? { Connection: 'close' } : {}),
  });
  res.end(text);
}

/** Answers before the body was read: the connection closes after it, so the rest of the body is never taken. */
function refuseUnread(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  send(res, status, body, {}, true);
  res.once('finish', () => req.socket.destroy());
}

function sendImage(res: ServerResponse, file: { bytes: Buffer; mime: string }): void {
  res.writeHead(200, {
    'Content-Type': file.mime,
    'Content-Length': file.bytes.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Disposition': 'inline',
  });
  res.end(file.bytes);
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseObject(raw: Buffer): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** One word of printable ASCII for a log line. */
const logWord = (text: string): string => text.replace(/[^\x21-\x7e]/g, '?').slice(0, 32) || '-';

/**
 * A reference number as the receipt shows it: 4 to 40 letters, digits, spaces and dashes, starting with a letter or a
 * digit. Its key is its letters and digits in capitals: the same payment typed with or without spaces is one key.
 */
export function readReference(value: unknown): { reference: string; key: string } | undefined {
  if (typeof value !== 'string') return undefined;
  const reference = value.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/.test(reference)) return undefined;
  const key = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return key.length >= 4 ? { reference, key } : undefined;
}

const idFrom = (path: string, prefix: string): number | undefined => {
  const rest = path.slice(prefix.length);
  if (!/^[1-9]\d{0,9}$/.test(rest)) return undefined;
  const id = Number(rest);
  return id <= 2_147_483_647 ? id : undefined;
};

/** The routes as one handler: true when it answered `path`. */
export function siteVipRoutes(deps: SiteVipDeps): (req: IncomingMessage, res: ServerResponse, path: string, address: string) => Promise<boolean> {
  const { config, store, files, sessions, log } = deps;
  const sessionOf = (req: IncomingMessage) => sessions.get(cookieValue(req, SITE_COOKIE));

  const login = async (req: IncomingMessage, res: ServerResponse, address: string): Promise<void> => {
    if (req.headers.origin !== config.siteOrigin) return refuseUnread(req, res, 403, { error: 'forbidden' });
    if (req.headers['content-type']?.toLowerCase().startsWith('application/json') !== true) return refuseUnread(req, res, 415, { error: 'type' });
    const { body: raw, whole } = await readBody(req, LOGIN_BODY_LIMIT);
    if (!whole || raw.length > LOGIN_BODY_LIMIT) return refuseUnread(req, res, 413, { error: 'size' });
    const body = parseObject(raw);
    const account = typeof body?.account === 'string' ? normalizeAccount(body.account) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (account === '' || account.length > 32 || !/^[\x21-\x7e]+$/.test(account) || password === '' || password.length > 64) {
      send(res, 400, { error: 'wrong' });
      return;
    }
    if (!deps.loginFailsByAddress.allows(address) || !deps.loginFailsByAccount.allows(account) || !deps.loginsByAccount.allows(account)) {
      log.info(`vip ${address} ${logWord(account)} login too_many`);
      send(res, 429, { error: 'too_many' });
      return;
    }
    const found = await store.login(account, hashPassword(password));
    if (found.result === 'wrong') {
      deps.loginFailsByAddress.add(address);
      deps.loginFailsByAccount.add(account);
      log.info(`vip ${address} ${logWord(account)} login wrong`);
      send(res, 400, { error: 'wrong' });
      return;
    }
    if (found.result === 'banned') {
      log.info(`vip ${address} ${logWord(found.account)} login banned`);
      send(res, 403, { error: 'banned' });
      return;
    }
    deps.loginsByAccount.add(account);
    const session = sessions.create(found.account);
    log.info(`vip ${address} ${logWord(found.account)} login ok`);
    send(res, 200, { account: session.user, csrf: session.csrf }, {
      'Set-Cookie': `${SITE_COOKIE}=${session.id}; Secure; HttpOnly; SameSite=Strict; Path=/`,
    });
  };

  /** A POST's session, checked from its headers; `undefined` when it was refused (the answer is sent). */
  const postSession = (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.origin !== config.siteOrigin) return void refuseUnread(req, res, 403, { error: 'forbidden' });
    if (req.headers['content-type']?.toLowerCase().startsWith('application/json') !== true) return void refuseUnread(req, res, 415, { error: 'type' });
    const session = sessionOf(req);
    if (session === undefined) return void refuseUnread(req, res, 401, { error: 'session' });
    const token = req.headers[SITE_TOKEN_HEADER];
    if (typeof token !== 'string' || !sameText(token, session.csrf)) return void refuseUnread(req, res, 403, { error: 'forbidden' });
    return session;
  };

  const sendRequest = async (req: IncomingMessage, res: ServerResponse, address: string): Promise<void> => {
    const session = postSession(req, res);
    if (session === undefined) return;
    const account = session.user;
    const { body: raw, whole } = await readBody(req, MAX_IMAGE_BODY_BYTES);
    if (!whole || raw.length > MAX_IMAGE_BODY_BYTES) {
      log.info(`vip ${address} ${logWord(account)} request size`);
      return refuseUnread(req, res, 413, { error: 'size' });
    }
    const body = parseObject(raw);
    if (body === undefined) return send(res, 400, { error: 'invalid' });
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) return send(res, 400, { error: 'invalid', field: 'requestId' });
    if (!sessions.claimRequest(session, requestId)) return send(res, 409, { error: 'repeat' });
    const tier = body.tier;
    if (typeof tier !== 'number' || !Number.isInteger(tier) || tier < 1 || tier > 9) return send(res, 400, { error: 'invalid', field: 'tier' });
    const reference = readReference(body.reference);
    if (reference === undefined) return send(res, 400, { error: 'invalid', field: 'reference' });
    const image = readImageField(body.receipt);
    if ('problem' in image) return send(res, image.problem === 'too_big' ? 413 : 400, { error: image.problem === 'too_big' ? 'size' : 'invalid', field: 'receipt' });
    if (!deps.requestsByAccount.allows(account)) {
      log.info(`vip ${address} ${logWord(account)} request too_many_sends`);
      return send(res, 429, { error: 'slow_down' });
    }
    deps.requestsByAccount.add(account);

    const receiptFile = await files.save('receipts', image.bytes, image.type);
    let added;
    try {
      added = await store.addRequest({
        account, level: tier, reference: reference.reference, referenceKey: reference.key, receiptFile, address,
        maxPending: deps.vip.maxPendingPerAccount,
      });
    } catch (error) {
      await files.remove('receipts', receiptFile);
      throw error;
    }
    if ('refused' in added) {
      await files.remove('receipts', receiptFile);
      log.info(`vip ${address} ${logWord(account)} request refused:${added.refused}`);
      if (added.refused === 'tier') return send(res, 400, { error: 'invalid', field: 'tier' });
      return send(res, 409, { error: added.refused === 'too_many' ? 'too_many' : 'reference', max: deps.vip.maxPendingPerAccount });
    }
    log.info(`vip ${address} ${logWord(account)} request ${added.id} tier ${tier}`);
    send(res, 201, { id: added.id });
  };

  return async (req, res, path, address) => {
    if (req.method === 'GET') {
      if (path === '/api/account/session') {
        const session = sessionOf(req);
        if (session === undefined) send(res, 401, { error: 'session' });
        else send(res, 200, { account: session.user, csrf: session.csrf });
        return true;
      }
      if (path === '/api/vip') {
        const session = sessionOf(req);
        const [tiers, qrs, me] = await Promise.all([store.tiers(), store.qrs(), session === undefined ? undefined : store.mine(session.user)]);
        send(res, 200, {
          tiers,
          qrs: qrs.map((qr) => ({ ...qr, image: `/api/vip/qr/${qr.id}` })),
          maxPending: deps.vip.maxPendingPerAccount,
          ...(session === undefined || me === undefined ? {} : {
            me: { account: session.user, vip: me.vip, requests: me.requests.map((r) => ({ ...r, receipt: `/api/vip/receipt/${r.id}` })) },
          }),
        });
        return true;
      }
      if (path.startsWith('/api/vip/qr/')) {
        const id = idFrom(path, '/api/vip/qr/');
        const name = id === undefined ? undefined : await store.qrImage(id);
        const file = name === undefined ? undefined : await files.read('qr', name);
        if (file === undefined) send(res, 404, { error: 'not_found' });
        else sendImage(res, file);
        return true;
      }
      if (path.startsWith('/api/vip/receipt/')) {
        const session = sessionOf(req);
        if (session === undefined) {
          send(res, 401, { error: 'session' });
          return true;
        }
        const id = idFrom(path, '/api/vip/receipt/');
        const name = id === undefined ? undefined : await store.receipt(id, session.user);
        const file = name === undefined ? undefined : await files.read('receipts', name);
        if (file === undefined) send(res, 404, { error: 'not_found' });
        else sendImage(res, file);
        return true;
      }
      return false;
    }
    if (req.method !== 'POST') return false;
    if (path === '/api/account/login') {
      await login(req, res, address);
      return true;
    }
    if (path === '/api/account/logout') {
      const session = postSession(req, res);
      if (session === undefined) return true;
      sessions.destroy(session.id);
      send(res, 200, { ok: true }, { 'Set-Cookie': `${SITE_COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return true;
    }
    if (path === '/api/vip/requests') {
      await sendRequest(req, res, address);
      return true;
    }
    return false;
  };
}
