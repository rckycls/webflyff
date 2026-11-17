// custom (owner 2026-11-17): Auto Play's weekly hours on the public web service: GET /api/autoplay and POST
// /api/autoplay/tick, behind the site's account session (vip/siteVip.ts, vip/autoPlayUsage.ts).
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hashPassword, PREREG_OFF } from '@flyffweb/protocol';
import type { AccountStore } from '../src/accountStore';
import { SessionBook } from '../src/admin/sessions';
import { HourlyLimit } from '../src/hourlyLimit';
import { RefusalLog } from '../src/refusalLog';
import { createWebServer } from '../src/server';
import { SiegeCache } from '../src/siege';
import { SignUpBook } from '../src/signUpBook';
import { StatusCache } from '../src/status';
import { TicketBook } from '../src/ticket';
import { AutoPlayUsage } from '../src/vip/autoPlayUsage';
import { siteVipRoutes } from '../src/vip/siteVip';
import { VipFiles } from '../src/vip/vipFiles';
import { testConfig } from './support/adminDeps';
import { MemoryVipStore, siteView } from './support/memoryVipStore';

const ORIGIN = testConfig.siteOrigin;
const servers: Server[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const accountStore: AccountStore = {
  create: async () => 1, onlineCount: async () => 0,
  siegeWeekly: async () => ({ champion: null, mvp: null, endedAt: null, expiresAt: null }), siegeRanking: async () => [],
};

async function start(options: { autoPlay?: boolean } = {}) {
  let now = new Date(2026, 10, 18, 10).getTime();
  const clock = () => now;
  const log = { info: () => {}, warn: () => {} };
  const memory = new MemoryVipStore([
    { account: 'tester1', passwordHash: hashPassword('password-one') },
    { account: 'tester2', passwordHash: hashPassword('password-two') },
  ], clock);
  const view = siteView(memory);
  // tester2 is VIP4 (no limit); everyone else normal
  const store = { ...view, mine: async (account: string) => ({
    vip: account === 'tester2' ? { level: 4, name: 'VIP4', endsAt: '2026-12-31T00:00:00.000Z' } : null, requests: [],
  }) };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'autoplay-site-'));
  dirs.push(dir);
  const routes = siteVipRoutes({
    config: testConfig, vip: { uploadsDir: dir, maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 }, store, files: new VipFiles(dir), log,
    sessions: new SessionBook(clock, 60 * 60_000, 12 * 3_600_000),
    loginFailsByAddress: new HourlyLimit(10, clock), loginFailsByAccount: new HourlyLimit(10, clock), loginsByAccount: new HourlyLimit(20, clock), requestsByAccount: new HourlyLimit(6, clock),
    ...(options.autoPlay === false ? {} : { autoPlay: new AutoPlayUsage(path.join(dir, 'autoplay-usage.json'), clock) }),
  });
  const server = createWebServer({
    config: testConfig, store: accountStore, log, refusals: new RefusalLog(log),
    tickets: new TicketBook(testConfig.ticketSecret, clock),
    attempts: new HourlyLimit(20, clock), createdByAddress: new HourlyLimit(3, clock), createdInAll: new HourlyLimit(60, clock),
    ticketsByAddress: new HourlyLimit(60, clock), siege: new SiegeCache(accountStore, clock),
    status: new StatusCache(async () => ({ online: true, players: 0, checkedAt: '2026-11-16T00:00:00.000Z' }), clock),
    signUps: new SignUpBook(undefined, log), prereg: () => PREREG_OFF, vip: routes,
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: (server.address() as AddressInfo).port, setNow: (ms: number) => { now = ms; }, later: (ms: number) => { now += ms; } };
}

interface Reply { status: number; body: any }

function call(port: number, method: string, url: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed: unknown;
        try { parsed = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')); } catch { parsed = undefined; }
        resolve({ status: res.statusCode!, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const post = (port: number, url: string, body: unknown, headers: Record<string, string> = {}) =>
  call(port, 'POST', url, { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, JSON.stringify(body));

/** Logs in and returns the headers a POST needs (the cookie and the CSRF token). */
async function session(port: number, account = 'tester1', password = 'password-one'): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/account/login',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { csrf: string };
        const cookie = String(res.headers['set-cookie']).split(';')[0]!;
        resolve({ Cookie: cookie, 'X-Site-Token': body.csrf });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify({ account, password }));
  });
}

it('without a session: 401 for the status and for a tick', async () => {
  const { port } = await start();
  expect((await call(port, 'GET', '/api/autoplay')).status).toBe(401);
  expect((await post(port, '/api/autoplay/tick', {})).status).toBe(401);
});

it('a normal account: 14 h a week, nothing used yet, the next Monday as the reset', async () => {
  const { port } = await start();
  const headers = await session(port);
  const answer = await call(port, 'GET', '/api/autoplay', { Cookie: headers.Cookie! });
  expect(answer.status).toBe(200);
  expect(answer.body).toEqual({ usedMin: 0, limitMin: 14 * 60, resetsAt: new Date(2026, 10, 23).toISOString() });
});

it('a tick adds a minute (it needs the CSRF token); the next one the time since', async () => {
  const { port, later } = await start();
  const headers = await session(port);
  expect((await post(port, '/api/autoplay/tick', {}, { Cookie: headers.Cookie! })).status).toBe(403);
  expect((await post(port, '/api/autoplay/tick', {}, headers)).body.usedMin).toBe(1);
  later(60_000);
  expect((await post(port, '/api/autoplay/tick', {}, headers)).body).toMatchObject({ usedMin: 2, limitMin: 840 });
});

it('a VIP4 account has no limit', async () => {
  const { port } = await start();
  const headers = await session(port, 'tester2', 'password-two');
  expect((await call(port, 'GET', '/api/autoplay', { Cookie: headers.Cookie! })).body.limitMin).toBeNull();
});

it('without the usage book (an old set-up): 404 off, so the game plays on without a limit', async () => {
  const { port } = await start({ autoPlay: false });
  const headers = await session(port);
  expect((await call(port, 'GET', '/api/autoplay', { Cookie: headers.Cookie! })).body).toEqual({ error: 'off' });
});

it('a tick carries the running time: two 30 s parts make one minute (owner bug 2026-11-18)', async () => {
  const { port, later } = await start();
  const headers = await session(port);
  expect((await post(port, '/api/autoplay/tick', { ms: 30_000 }, headers)).body.usedMin).toBe(0);
  later(30_000);
  expect((await post(port, '/api/autoplay/tick', { ms: 30_000 }, headers)).body.usedMin).toBe(1);
});
