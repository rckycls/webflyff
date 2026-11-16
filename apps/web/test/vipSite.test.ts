// Support / VIP on the public web service: the player login, the page's data, sending a request with a receipt, and the
// receipt route, against the memory store and a temporary uploads folder.

import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hashPassword } from '@flyffweb/protocol';
import type { AccountStore } from '../src/accountStore';
import { SessionBook } from '../src/admin/sessions';
import { HourlyLimit } from '../src/hourlyLimit';
import { RefusalLog } from '../src/refusalLog';
import { createWebServer } from '../src/server';
import { SiegeCache } from '../src/siege';
import { StatusCache } from '../src/status';
import { TicketBook } from '../src/ticket';
import { readReference, siteVipRoutes } from '../src/vip/siteVip';
import { VipFiles } from '../src/vip/vipFiles';
import { testConfig } from './support/adminDeps';
import { MemoryVipStore, siteView } from './support/memoryVipStore';
import { PNG_BASE64 } from './support/vipPictures';

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

async function start(options: { vip?: boolean; maxPending?: number } = {}) {
  let now = 1_763_000_000_000;
  const clock = () => now;
  const lines: string[] = [];
  const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const store = new MemoryVipStore([
    { account: 'tester1', passwordHash: hashPassword('password-one') },
    { account: 'tester2', passwordHash: hashPassword('password-two') },
    { account: 'banned1', passwordHash: hashPassword('password-ban'), banned: true },
  ], clock);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-site-'));
  dirs.push(dir);
  const files = new VipFiles(dir);
  const routes = options.vip === false ? undefined : siteVipRoutes({
    config: testConfig, vip: { uploadsDir: dir, maxPendingPerAccount: options.maxPending ?? 3 }, store: siteView(store), files, log,
    sessions: new SessionBook(clock, 60 * 60_000, 12 * 3_600_000),
    loginFailsByAddress: new HourlyLimit(10, clock), loginFailsByAccount: new HourlyLimit(10, clock), loginsByAccount: new HourlyLimit(20, clock), requestsByAccount: new HourlyLimit(6, clock),
  });
  const server = createWebServer({
    config: testConfig, store: accountStore, log, refusals: new RefusalLog(log),
    tickets: new TicketBook(testConfig.ticketSecret, clock),
    attempts: new HourlyLimit(20, clock), createdByAddress: new HourlyLimit(3, clock), createdInAll: new HourlyLimit(60, clock),
    ticketsByAddress: new HourlyLimit(60, clock), siege: new SiegeCache(accountStore, clock),
    status: new StatusCache(async () => ({ online: true, players: 0, checkedAt: '2026-11-16T00:00:00.000Z' }), clock),
    vip: routes,
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: (server.address() as AddressInfo).port, store, dir, lines, setNow: (ms: number) => { now = ms; } };
}

interface Reply { status: number; headers: IncomingHttpHeaders; body: any; raw: Buffer }

function call(port: number, method: string, url: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed: unknown;
        try { parsed = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')); } catch { parsed = undefined; }
        resolve({ status: res.statusCode!, headers: res.headers, body: parsed, raw });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const post = (port: number, url: string, body: unknown, headers: Record<string, string> = {}) =>
  call(port, 'POST', url, { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, JSON.stringify(body));

async function logIn(port: number, account = 'tester1', password = 'password-one') {
  const answer = await post(port, '/api/account/login', { account, password });
  expect(answer.status).toBe(200);
  const cookie = String(answer.headers['set-cookie']).split(';')[0]!;
  return { cookie, csrf: answer.body.csrf as string, headers: { Cookie: cookie, 'X-Site-Token': answer.body.csrf as string } };
}

let ids = 0;
const sendRequest = (port: number, headers: Record<string, string>, body: Record<string, unknown> = {}) =>
  post(port, '/api/vip/requests', { tier: 2, reference: 'GC 1234 5678', receipt: PNG_BASE64, requestId: `r${++ids}`, ...body }, headers);

it('answers 503 off for every Support / VIP address while the vip section is missing', async () => {
  const { port } = await start({ vip: false });
  for (const url of ['/api/vip', '/api/account/session', '/api/vip/qr/1']) expect((await call(port, 'GET', url)).body).toEqual({ error: 'off' });
  expect((await post(port, '/api/account/login', {})).status).toBe(503);
});

it('logs a player in with the game account and password, in any case, and refuses wrong ones and bans', async () => {
  const { port, lines } = await start();
  const wrong = await post(port, '/api/account/login', { account: 'tester1', password: 'nope' });
  expect(wrong).toMatchObject({ status: 400, body: { error: 'wrong' } });
  expect((await post(port, '/api/account/login', { account: 'nobody', password: 'password-one' })).body).toEqual({ error: 'wrong' });
  expect((await post(port, '/api/account/login', { account: 'banned1', password: 'password-ban' }))).toMatchObject({ status: 403, body: { error: 'banned' } });
  const ok = await post(port, '/api/account/login', { account: ' TESTER1 ', password: 'password-one' });
  expect(ok.status).toBe(200);
  expect(ok.body.account).toBe('tester1');
  expect(String(ok.headers['set-cookie'])).toMatch(/^__Host-flyff=[\w-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\/$/);
  const cookie = String(ok.headers['set-cookie']).split(';')[0]!;
  expect((await call(port, 'GET', '/api/account/session', { Cookie: cookie })).body).toEqual({ account: 'tester1', csrf: ok.body.csrf });
  // the log never holds a password
  expect(lines.join('\n')).not.toContain('password-one');
  expect(lines).toContain('vip 127.0.0.1 tester1 login ok');
});

it('waits after 10 wrong passwords for one account, or from one address', async () => {
  const { port } = await start();
  for (let i = 0; i < 10; i++) await post(port, '/api/account/login', { account: 'tester2', password: `wrong-${i}` });
  expect((await post(port, '/api/account/login', { account: 'tester2', password: 'password-two' })).body).toEqual({ error: 'too_many' });
});

it('waits after 20 logins of one account in an hour', async () => {
  const { port } = await start();
  for (let i = 0; i < 20; i++) expect((await post(port, '/api/account/login', { account: 'tester1', password: 'password-one' })).status).toBe(200);
  expect((await post(port, '/api/account/login', { account: 'tester1', password: 'password-one' })).body).toEqual({ error: 'too_many' });
  expect((await post(port, '/api/account/login', { account: 'tester2', password: 'password-two' })).status).toBe(200);
});

it('refuses a login from another site, and one that is not JSON', async () => {
  const { port } = await start();
  expect((await post(port, '/api/account/login', { account: 'tester1', password: 'password-one' }, { Origin: 'https://evil.example' })).status).toBe(403);
  expect((await call(port, 'POST', '/api/account/login', { 'Content-Type': 'text/plain', Origin: ORIGIN }, 'x')).status).toBe(415);
});

it('gives the tiers and the QRs that are on to everyone, and "me" only with a session', async () => {
  const { port, store } = await start();
  store.tierRows[3]!.on = false;
  await store.addQr({ label: 'GCash', accountName: 'R. C.', note: 'Send the exact amount', imageFile: 'a'.repeat(32) + '.png', on: true, order: 2 });
  await store.addQr({ label: 'Hidden', accountName: 'x', note: '', imageFile: 'b'.repeat(32) + '.png', on: false, order: 1 });
  const open = await call(port, 'GET', '/api/vip');
  expect(open.body.tiers).toEqual([
    { level: 1, name: 'VIP 1', priceCents: 200 }, { level: 2, name: 'VIP 2', priceCents: 400 }, { level: 3, name: 'VIP 3', priceCents: 600 },
  ]);
  expect(open.body.qrs).toEqual([{ id: 1, label: 'GCash', accountName: 'R. C.', note: 'Send the exact amount', image: '/api/vip/qr/1' }]);
  expect(open.body.me).toBeUndefined();
  expect(open.headers['cache-control']).toBe('no-store');
  const { headers } = await logIn(port);
  const mine = await call(port, 'GET', '/api/vip', { Cookie: headers.Cookie });
  expect(mine.body.me).toEqual({ account: 'tester1', vip: null, requests: [] });
  // an off QR's picture is never served
  expect((await call(port, 'GET', '/api/vip/qr/2')).status).toBe(404);
});

it('takes a request with a receipt: Processing, the picture stored under a random name, served only to its owner', async () => {
  const { port, dir, lines } = await start();
  const { headers } = await logIn(port);
  const sent = await sendRequest(port, headers);
  expect(sent).toMatchObject({ status: 201, body: { id: 1 } });
  const stored = readdirSync(path.join(dir, 'receipts'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatch(/^[0-9a-f]{32}\.png$/);
  const mine = await call(port, 'GET', '/api/vip', { Cookie: headers.Cookie });
  expect(mine.body.me.requests).toEqual([expect.objectContaining({
    id: 1, level: 2, name: 'VIP 2', priceCents: 400, reference: 'GC 1234 5678', status: 'P', reason: null, receipt: '/api/vip/receipt/1',
  })]);
  const own = await call(port, 'GET', '/api/vip/receipt/1', { Cookie: headers.Cookie });
  expect(own.status).toBe(200);
  expect(own.headers['content-type']).toBe('image/png');
  expect(own.headers['x-content-type-options']).toBe('nosniff');
  expect(own.headers['content-security-policy']).toBe("default-src 'none'");
  expect(own.raw.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
  const other = await logIn(port, 'tester2', 'password-two');
  expect((await call(port, 'GET', '/api/vip/receipt/1', { Cookie: other.cookie })).status).toBe(404);
  expect((await call(port, 'GET', '/api/vip/receipt/1')).status).toBe(401);
  expect(lines).toContain('vip 127.0.0.1 tester1 request 1 tier 2');
});

it('refuses a request without a session, without the token, or from another site, before reading its body', async () => {
  const { port, dir } = await start();
  const { headers } = await logIn(port);
  expect((await sendRequest(port, {})).body).toEqual({ error: 'session' });
  expect((await sendRequest(port, { Cookie: headers.Cookie })).status).toBe(403);
  expect((await sendRequest(port, { ...headers, 'X-Site-Token': 'x'.repeat(43) })).status).toBe(403);
  expect((await sendRequest(port, { ...headers, Origin: 'https://evil.example' })).status).toBe(403);
  expect(readdirSync(path.join(dir, 'receipts'))).toEqual([]);
});

it('refuses a receipt that is not a picture, a bad reference or tier, and a second send of one request id', async () => {
  const { port, dir } = await start();
  const { headers } = await logIn(port);
  const page = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  expect((await sendRequest(port, headers, { receipt: `data:image/png;base64,${page}` })).body).toEqual({ error: 'invalid', field: 'receipt' });
  expect((await sendRequest(port, headers, { reference: '<b>' })).body).toEqual({ error: 'invalid', field: 'reference' });
  expect((await sendRequest(port, headers, { tier: 7 })).body).toEqual({ error: 'invalid', field: 'tier' });
  expect((await sendRequest(port, headers, { tier: '2' })).body).toEqual({ error: 'invalid', field: 'tier' });
  expect(readdirSync(path.join(dir, 'receipts'))).toEqual([]);
  expect((await sendRequest(port, headers, { requestId: 'same' })).status).toBe(201);
  expect((await sendRequest(port, headers, { requestId: 'same', reference: 'OTHER-1' })).body).toEqual({ error: 'repeat' });
});

it('refuses a reference already on a processing or approved request, however it is typed; a rejected one frees it', async () => {
  const { port, store, dir } = await start();
  const { headers } = await logIn(port);
  expect((await sendRequest(port, headers, { reference: 'ABC-123 456' })).status).toBe(201);
  const other = await logIn(port, 'tester2', 'password-two');
  expect((await sendRequest(port, other.headers, { reference: 'abc 123456' })).body).toEqual({ error: 'reference', max: 3 });
  expect(readdirSync(path.join(dir, 'receipts'))).toHaveLength(1);
  await store.reject(1, 'Poreotix', 'Blurry picture');
  expect((await sendRequest(port, other.headers, { reference: 'abc 123456' })).status).toBe(201);
});

it('allows 3 requests processing at once per account', async () => {
  const { port } = await start();
  const { headers } = await logIn(port);
  for (const reference of ['REF-0001', 'REF-0002', 'REF-0003']) expect((await sendRequest(port, headers, { reference })).status).toBe(201);
  expect((await sendRequest(port, headers, { reference: 'REF-0004' })).body).toEqual({ error: 'too_many', max: 3 });
});

it('shows the live VIP, and none once its end time has passed', async () => {
  const { port, store, setNow } = await start();
  const { headers } = await logIn(port);
  await sendRequest(port, headers);
  const approved = await store.approve(1, 'Poreotix');
  expect(approved).toEqual({ result: 'ok', level: 2, endsAt: '2025-12-13T02:13:20Z' });
  const mine = await call(port, 'GET', '/api/vip', { Cookie: headers.Cookie });
  expect(mine.body.me.vip).toEqual({ level: 2, name: 'VIP 2', endsAt: '2025-12-13T02:13:20Z' });
  expect(mine.body.me.requests[0]).toMatchObject({ status: 'A', vipEndsAt: '2025-12-13T02:13:20Z' });
  // a month later the session is long gone: a new login sees no VIP
  setNow(Date.parse('2025-12-13T02:13:21Z'));
  const later = await logIn(port);
  expect((await call(port, 'GET', '/api/vip', { Cookie: later.cookie })).body.me.vip).toBeNull();
});

it('logs out: the session ends', async () => {
  const { port } = await start();
  const { headers } = await logIn(port);
  expect((await post(port, '/api/account/logout', {}, headers)).status).toBe(200);
  expect((await call(port, 'GET', '/api/account/session', { Cookie: headers.Cookie })).status).toBe(401);
});

it('reads a reference as the receipt shows it, with a key of its letters and digits in capitals', () => {
  expect(readReference('  gc  1234-5678 ')).toEqual({ reference: 'gc 1234-5678', key: 'GC12345678' });
  for (const bad of ['', 'abc', '--1234', 'a'.repeat(41), 'abc<1234>', 'abc_1234', 42]) expect(readReference(bad)).toBeUndefined();
});
