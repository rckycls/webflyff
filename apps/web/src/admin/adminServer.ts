// The admin panel's own HTTP server (admin panel spec §5.1, §5.3), on 127.0.0.1:8092 behind Caddy's admin site:
//
// - `GET /`, `/panel.css`, `/panel.js`, `/js/<name>.js`: the page, from a fixed list of files in apps/web/admin read at
//   start (nothing else is served, so no path can reach another file);
// - `GET /api/session`: `{user, csrf}` for the cookie's live session, or 401 `session`;
// - `POST /api/login` `{user, password, code}`; `POST /api/logout`;
// - `POST /api/<action>` for the names in `deps.actions` (status, accounts.*, characters.*, items.*, sends.*, log.*, vip.*);
// - `GET /vip/receipt/<id>`, `/vip/qr/<id>`: a VIP request's receipt or a payment QR, for a live session only.
//
// Every POST: JSON (415), at most 16 KB (413; `vip.qrAdd` with a live session: a 5 MB picture), Origin = admin.origin (403). Every POST but login: a live session from the
// `__Host-admin` cookie (401) and X-Admin-Token = its CSRF token (403). Every write also carries a `requestId` taken
// once per session (400 without one, 409 `repeat` for a second time), so a double click cannot act twice.
// Every answer has the panel's security headers and `Cache-Control: no-store`.

import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolveClientAddress } from '@flyffweb/protocol';
import type { WebConfig } from '../config';
import type { Logger } from '../log';
import { readBody } from '../server';
import type { HttpAnswer } from '../signUpHandler';
import type { AdminConfig } from './config';
import type { AdminCredentials } from './credentials';
import type { AdminStore, LogEntry, LogResult } from './adminStore';
import type { CatalogItem } from './itemCatalog';
import type { LoginGuard } from './loginGuard';
import type { PageCache } from './pageCache';
import { verifyAdminPassword } from './password';
import type { AdminSession, SessionBook } from './sessions';
import type { PortState } from './serverState';
import { matchTotp } from './totp';
import { MAX_IMAGE_BODY_BYTES } from '../vip/images';
import type { VipFiles } from '../vip/vipFiles';
import type { VipAdminStore } from '../vip/vipStore';

export interface AdminContext { session: AdminSession; address: string }

export type ActionHandler = (body: Record<string, unknown>, ctx: AdminContext, deps: AdminDeps) => Promise<HttpAnswer>;

export interface AdminDeps {
  config: WebConfig & { admin: AdminConfig };
  credentials: AdminCredentials;
  store: AdminStore;
  sessions: SessionBook;
  guard: LoginGuard;
  log: Logger;
  now: () => number;
  /** How `host:port` answers: open, closed (refused) or unknown (no clear answer); serverState.ts's probeState in the service. */
  probe: (host: string, port: number) => Promise<PortState>;
  catalog: CatalogItem[];
  actions: Record<string, ActionHandler>;
  /** The Accounts and Characters lists' pages, kept a short time (pageCache.ts). */
  pages: PageCache;
  /** Support / VIP's store and pictures; `undefined` while it is off (web.config.json has no good vip section). */
  vip?: { store: VipAdminStore; files: VipFiles };
}

export const ADMIN_BODY_LIMIT = 16 * 1024;
export const ADMIN_COOKIE = '__Host-admin';
export const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
  + "form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const SECURITY_HEADERS = {
  'Content-Security-Policy': ADMIN_CSP,
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

/** Actions that only read: they need no request id. Everything else is a write. */
const READ_ACTIONS = [
  'status', 'accounts.search', 'accounts.page', 'accounts.get', 'characters.search', 'characters.page', 'characters.get',
  'sends.list', 'vip.requests', 'vip.tiers', 'vip.qrs', 'vip.giftItems', 'vip.giftLog',
];
/** The one action that carries a picture: a bigger body, read only with a live session. */
const UPLOAD_ACTION = 'vip.qrAdd';
const READ_PREFIXES = ['items.', 'log.'];

export function isReadAction(name: string): boolean {
  return READ_ACTIONS.includes(name) || READ_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const REQUEST_TIMEOUT_MS = 10_000;
const PAGE_DIR = new URL('../../admin/', import.meta.url);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
};

/** The page's files by the path they are served at: index.html, panel.css, panel.js and js/*.js, read once. */
function readPageFiles(): Map<string, { type: string; body: Buffer }> {
  const files = new Map<string, { type: string; body: Buffer }>();
  const add = (path: string, file: URL) => {
    const ext = file.pathname.slice(file.pathname.lastIndexOf('.'));
    try {
      files.set(path, { type: TYPES[ext]!, body: readFileSync(file) });
    } catch {
      // a file not written yet: not served
    }
  };
  add('/', new URL('index.html', PAGE_DIR));
  add('/panel.css', new URL('panel.css', PAGE_DIR));
  add('/panel.js', new URL('panel.js', PAGE_DIR));
  let scripts: string[] = [];
  try {
    scripts = readdirSync(new URL('js/', PAGE_DIR)).filter((name) => /^[a-z][a-zA-Z0-9]*\.js$/.test(name));
  } catch {
    scripts = [];
  }
  for (const name of scripts) add(`/js/${name}`, new URL(`js/${name}`, PAGE_DIR));
  return files;
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string | string[]> = {}, close = false): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...extra,
    ...(close ? { Connection: 'close' } : {}),
  });
  res.end(text);
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

/** One audit row, begun and ended at once (logins). A database error only warns: it never blocks a login. */
async function logOnce(deps: AdminDeps, entry: LogEntry, result: LogResult, after: string): Promise<void> {
  try {
    await deps.store.logEnd(await deps.store.logBegin(entry), result, after);
  } catch (error) {
    deps.log.warn(`admin: audit row for ${entry.action} not written: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
  }
}

export function createAdminServer(deps: AdminDeps): Server {
  const { config } = deps;
  const page = readPageFiles();
  /** The last authenticator step a login used: a code works once. */
  let lastStep = -1;

  const login = async (body: Record<string, unknown>, address: string, res: ServerResponse): Promise<void> => {
    const verdict = deps.guard.check(address);
    if (verdict !== 'ok') {
      deps.log.warn(`admin: login ${address} refused: ${verdict}`);
      send(res, 429, { error: 'too_many' });
      return;
    }
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    // every check runs, whatever fails first, so the time taken does not tell which one it was
    const nameOk = sameText(user.toLowerCase(), deps.credentials.user.toLowerCase());
    const passwordOk = verifyAdminPassword(password, deps.credentials.passwordHash);
    const step = matchTotp(deps.credentials.totpSecret, code, deps.now());
    const codeOk = step !== undefined && step > lastStep;
    if (!(nameOk && passwordOk && codeOk)) {
      deps.guard.fail(address);
      deps.log.info(`admin: login ${address} failed`);
      await logOnce(deps, { admin: '-', address, action: 'login_failed', before: JSON.stringify({ nameOk, passwordOk, codeOk }) }, 'refused', '');
      send(res, 400, { error: 'wrong' });
      return;
    }
    lastStep = step;
    deps.guard.succeed(address);
    const session = deps.sessions.create(deps.credentials.user);
    deps.log.info(`admin: login ${address} ok`);
    await logOnce(deps, { admin: session.user, address, action: 'login', before: '' }, 'ok', '');
    send(res, 200, { user: session.user, csrf: session.csrf }, {
      'Set-Cookie': `${ADMIN_COOKIE}=${session.id}; Secure; HttpOnly; SameSite=Strict; Path=/`,
    });
  };

  /** A receipt or a QR picture, for a live session; 404 for anything that is not there. */
  const sendPicture = async (req: IncomingMessage, res: ServerResponse, kind: 'receipt' | 'qr', id: number): Promise<void> => {
    if (deps.sessions.get(cookieValue(req, ADMIN_COOKIE)) === undefined) {
      send(res, 401, { error: 'session' });
      return;
    }
    const vip = deps.vip;
    let file: { bytes: Buffer; mime: string } | undefined;
    if (vip !== undefined && id <= 2_147_483_647) {
      const name = kind === 'receipt' ? (await vip.store.request(id))?.receiptFile : (await vip.store.qrList()).find((q) => q.id === id)?.imageFile;
      // a rejected request's picture may be deleted already (null)
      if (name !== undefined && name !== null) file = await vip.files.read(kind === 'receipt' ? 'receipts' : 'qr', name);
    }
    if (file === undefined) {
      send(res, 404, { error: 'not_found' });
      return;
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': file.mime, 'Content-Length': file.bytes.length, 'Content-Disposition': 'inline' });
    res.end(file.bytes);
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? '/').split('?')[0]!;
    const address = resolveClientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], config.trustedProxies) ?? 'unknown';

    if (req.method === 'GET') {
      if (path === '/api/session') {
        const session = deps.sessions.get(cookieValue(req, ADMIN_COOKIE));
        if (session === undefined) send(res, 401, { error: 'session' });
        else send(res, 200, { user: session.user, csrf: session.csrf });
        return;
      }
      const picture = /^\/vip\/(receipt|qr)\/([1-9]\d{0,9})$/.exec(path);
      if (picture !== null) {
        await sendPicture(req, res, picture[1] as 'receipt' | 'qr', Number(picture[2]));
        return;
      }
      const file = page.get(path);
      if (file === undefined) {
        send(res, 404, { error: 'not_found' });
        return;
      }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': file.type, 'Content-Length': file.body.length });
      res.end(file.body);
      return;
    }

    const name = path.startsWith('/api/') ? path.slice('/api/'.length) : '';
    const known = name === 'login' || name === 'logout' || Object.hasOwn(deps.actions, name);
    if (req.method !== 'POST' || !known) {
      send(res, 404, { error: 'not_found' });
      return;
    }
    if (req.headers['content-type']?.toLowerCase().startsWith('application/json') !== true) {
      send(res, 415, { error: 'type' });
      return;
    }
    const upload = name === UPLOAD_ACTION && deps.sessions.get(cookieValue(req, ADMIN_COOKIE), false) !== undefined;
    const limit = upload ? MAX_IMAGE_BODY_BYTES : ADMIN_BODY_LIMIT;
    const { body: raw, whole } = await readBody(req, limit);
    if (!whole || raw.length > limit) {
      send(res, 413, { error: 'size' }, {}, true);
      res.once('finish', () => req.socket.destroy());
      return;
    }
    if (req.headers.origin !== config.admin.origin) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw.toString('utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      send(res, 400, { error: 'invalid' });
      return;
    }

    if (name === 'login') {
      await login(body, address, res);
      return;
    }
    const sessionId = cookieValue(req, ADMIN_COOKIE);
    // the page's timed refreshes say X-Admin-Background: 1 and do not count as use (the 30-minute idle logout)
    const background = req.headers['x-admin-background'] === '1' && isReadAction(name);
    const session = deps.sessions.get(sessionId, !background);
    if (session === undefined) {
      send(res, 401, { error: 'session' });
      return;
    }
    const token = req.headers['x-admin-token'];
    if (typeof token !== 'string' || !sameText(token, session.csrf)) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    if (name === 'logout') {
      deps.sessions.destroy(session.id);
      send(res, 200, { ok: true }, { 'Set-Cookie': `${ADMIN_COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return;
    }
    if (!isReadAction(name)) {
      const requestId = body.requestId;
      if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) {
        send(res, 400, { error: 'invalid', field: 'requestId' });
        return;
      }
      if (!deps.sessions.claimRequest(session, requestId)) {
        send(res, 409, { error: 'repeat' });
        return;
      }
    }
    const answer = await deps.actions[name]!(body, { session, address }, deps);
    send(res, answer.status, answer.body);
  };

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      deps.log.warn(`admin: request error: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
      if (!res.headersSent) send(res, 500, { error: 'server' });
      else res.destroy();
    });
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = REQUEST_TIMEOUT_MS;
  return server;
}
