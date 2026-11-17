// The web service's HTTP server (website spec §3.4), behind Caddy's `/api/*` on 127.0.0.1:8091:
//
// - `GET /api/sign-up/ticket`: `200 {ticket}`, or `429 {error:'too_many'}` past the tickets an address may have an hour;
//   with the browser's `fw_id` cookie when it has none yet (a random ID, for the pre-registration cap, signUpBook.ts);
// - `POST /api/sign-up`: `handleSignUp`, with at most 1025 bytes of the body read (more is a 413, answered without
//   reading the rest);
// - `GET /api/status`: the shared status;
// - `GET /api/siege/weekly` and `GET /api/siege/ranking?board=&span=`: the Guild Siege answers (siege.ts);
// - `/api/account/*` and `/api/vip*`: Support / VIP (vip/siteVip.ts), or `503 {error:'off'}` without web.config.json's
//   `vip` section;
// - anything else: `404 {error:'not_found'}`.
//
// Every answer is JSON with `Cache-Control: no-store`, and no CORS headers: only the site's own pages may call it.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { resolveClientAddress } from '@flyffweb/protocol';
import type { HourlyLimit } from './hourlyLimit';
import { BROWSER_COOKIE, BROWSER_ID } from './signUpBook';
import { handleSignUp, MAX_BODY_BYTES } from './signUpHandler';
import type { SignUpDeps } from './signUpHandler';
import { handleSiegeRanking, handleSiegeWeekly } from './siege';
import type { SiegeCache } from './siege';
import type { StatusCache } from './status';

/** Support / VIP's routes (vip/siteVip.ts): true when it answered. */
export type VipRoutes = (req: IncomingMessage, res: ServerResponse, path: string, address: string) => Promise<boolean>;

export type WebServerDeps = SignUpDeps & { status: StatusCache; siege: SiegeCache; ticketsByAddress: HourlyLimit; vip?: VipRoutes };

/** Slow clients get this long to send a request (Caddy sends it at once). */
const REQUEST_TIMEOUT_MS = 10_000;
/** How long a browser keeps its `fw_id`: 400 days, the most browsers keep a cookie. */
const BROWSER_COOKIE_SECONDS = 400 * 24 * 3600;

/** The browser's `fw_id` cookie, or '' when it sent none (or one the service never gives). */
export function browserIdOf(cookieHeader: string | undefined): string {
  for (const part of (cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== BROWSER_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (BROWSER_ID.test(value)) return value;
  }
  return '';
}

function send(res: ServerResponse, status: number, body: unknown, close = false, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(close ? { Connection: 'close' } : {}),
  });
  res.end(text);
}

/** The body, or its first `limit + 1` bytes once it is longer than `limit` (the rest is never read). Also the panel's. */
export function readBody(req: IncomingMessage, limit: number): Promise<{ body: Buffer; whole: boolean }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (whole: boolean) => {
      if (done) return;
      done = true;
      req.off('data', onData);
      resolve({ body: Buffer.concat(chunks).subarray(0, limit + 1), whole });
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > limit) {
        req.pause();
        finish(false);
      }
    };
    req.on('data', onData);
    req.once('end', () => finish(true));
    req.once('close', () => finish(false));
    req.once('error', () => finish(false));
  });
}

export function createWebServer(deps: WebServerDeps): Server {
  const { config, log } = deps;

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? '/').split('?')[0];
    const address = resolveClientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], config.trustedProxies) ?? 'unknown';

    if (path === '/api/sign-up/ticket' && req.method === 'GET') {
      if (!deps.ticketsByAddress.allows(address)) {
        deps.refusals.note(`ticket ${address} too_many`, `ticket ${address} too_many`);
        send(res, 429, { error: 'too_many' });
        return;
      }
      deps.ticketsByAddress.add(address);
      // Only the sign-up paths get it back; HttpOnly, so no page script can read or change it
      const cookie: Record<string, string> = browserIdOf(req.headers.cookie) !== '' ? {} : {
        'Set-Cookie': `${BROWSER_COOKIE}=${randomBytes(16).toString('base64url')}; Path=/api/sign-up; Max-Age=${BROWSER_COOKIE_SECONDS}; ` +
          `HttpOnly; SameSite=Strict${config.siteOrigin.startsWith('https:') ? '; Secure' : ''}`,
      };
      send(res, 200, { ticket: deps.tickets.issue() }, false, cookie);
      return;
    }
    if (path === '/api/sign-up' && req.method === 'POST') {
      const { body, whole } = await readBody(req, MAX_BODY_BYTES);
      const answer = await handleSignUp({
        address, origin: req.headers.origin, contentType: req.headers['content-type'], body, browser: browserIdOf(req.headers.cookie),
      }, deps);
      // a body left unread: the connection closes after the answer, so its rest is never taken
      send(res, answer.status, answer.body, !whole);
      if (!whole) res.once('finish', () => req.socket.destroy());
      return;
    }
    if (path === '/api/status' && req.method === 'GET') {
      send(res, 200, await deps.status.get());
      return;
    }
    if (path === '/api/siege/weekly' && req.method === 'GET') {
      const answer = await handleSiegeWeekly(deps);
      send(res, answer.status, answer.body);
      return;
    }
    if (path === '/api/siege/ranking' && req.method === 'GET') {
      const answer = await handleSiegeRanking(new URL(req.url ?? '/', 'http://localhost').searchParams, deps);
      send(res, answer.status, answer.body);
      return;
    }
    if (path.startsWith('/api/account/') || path === '/api/vip' || path.startsWith('/api/vip/') || path === '/api/autoplay' || path.startsWith('/api/autoplay/')) {
      if (deps.vip === undefined) {
        send(res, 503, { error: 'off' });
        return;
      }
      if (await deps.vip(req, res, path, address)) return;
    }
    send(res, 404, { error: 'not_found' });
  };

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      log.warn(`request error: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
      if (!res.headersSent) send(res, 500, { error: 'server' });
      else res.destroy();
    });
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = REQUEST_TIMEOUT_MS;
  return server;
}
