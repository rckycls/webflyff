// Redeem codes (2026-11-20): POST /api/codes/check and /api/codes/redeem on the public web service, on the player's
// site session (the game opens it at login), against the memory stores.

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
import { codeRoutes } from '../src/codes/siteCodes';
import type { NewCode } from '../src/codes/codeStore';
import { HourlyLimit } from '../src/hourlyLimit';
import { RefusalLog } from '../src/refusalLog';
import { createWebServer } from '../src/server';
import { SiegeCache } from '../src/siege';
import { SignUpBook } from '../src/signUpBook';
import { StatusCache } from '../src/status';
import { TicketBook } from '../src/ticket';
import { siteVipRoutes } from '../src/vip/siteVip';
import { VipFiles } from '../src/vip/vipFiles';
import { testConfig } from './support/adminDeps';
import { MemoryCodeStore } from './support/memoryCodeStore';
import { MemoryVipStore, siteView } from './support/memoryVipStore';

const ORIGIN = testConfig.siteOrigin;
const DAY = 86_400_000;
const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;
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

async function start(options: { codes?: boolean; deliver?: (useId: number) => Promise<void>; addressFails?: number } = {}) {
  const now = Date.UTC(2026, 10, 20);
  const clock = () => now;
  const lines: string[] = [];
  const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const vip = new MemoryVipStore([
    { account: 'tester1', passwordHash: hashPassword('password-one') },
    { account: 'tester2', passwordHash: hashPassword('password-two') },
  ], clock);
  const codes = new MemoryCodeStore(vip, [
    { account: 'tester1', idPlayer: '0000001', name: 'Alpha' },
    { account: 'tester2', idPlayer: '0000002', name: 'Beta' },
  ], clock);
  const delivered: number[] = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'code-site-'));
  dirs.push(dir);
  const routes = siteVipRoutes({
    config: testConfig, vip: { uploadsDir: dir, maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 }, store: siteView(vip), files: new VipFiles(dir), log,
    sessions: new SessionBook(clock, 60 * 60_000, 12 * 3_600_000),
    loginFailsByAddress: new HourlyLimit(10, clock), loginFailsByAccount: new HourlyLimit(10, clock), loginsByAccount: new HourlyLimit(20, clock), requestsByAccount: new HourlyLimit(6, clock),
    ...(options.codes === false ? {} : {
      codes: codeRoutes({
        store: codes, log,
        failsByAccount: new HourlyLimit(10, clock), failsByAddress: new HourlyLimit(options.addressFails ?? 30, clock), redeemsByAccount: new HourlyLimit(30, clock),
        deliver: options.deliver ?? (async (useId) => { delivered.push(useId); }),
      }),
    }),
  });
  const server = createWebServer({
    config: testConfig, store: accountStore, log, refusals: new RefusalLog(log),
    tickets: new TicketBook(testConfig.ticketSecret, clock),
    attempts: new HourlyLimit(20, clock), createdByAddress: new HourlyLimit(3, clock), createdInAll: new HourlyLimit(60, clock),
    ticketsByAddress: new HourlyLimit(60, clock), siege: new SiegeCache(accountStore, clock),
    status: new StatusCache(async () => ({ online: true, players: 0, checkedAt: '2026-11-16T00:00:00.000Z' }), clock),
    signUps: new SignUpBook(undefined, log), prereg: () => PREREG_OFF,
    vip: routes,
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const make = async (over: Partial<NewCode> = {}) => {
    const added = await codes.add({
      label: 'Launch', kind: 'E', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: iso(now + 30 * DAY),
      items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }], keys: ['WELCOME2026'], accounts: [], admin: 'Poreotix', ...over,
    });
    if (!('id' in added)) throw new Error(added.refused);
    return added.id;
  };
  return { port: (server.address() as AddressInfo).port, vip, codes, lines, delivered, make, now };
}

interface Reply { status: number; body: any }

function post(port: number, url: string, body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: url, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode!, body: raw === '' ? undefined : JSON.parse(raw) });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

async function logIn(port: number, account = 'tester1', password = 'password-one'): Promise<Record<string, string>> {
  const answer = await new Promise<{ cookie: string; csrf: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/account/login', headers: { 'Content-Type': 'application/json', Origin: ORIGIN } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ cookie: String(res.headers['set-cookie']).split(';')[0]!, csrf: JSON.parse(Buffer.concat(chunks).toString('utf8')).csrf }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ account, password }));
  });
  return { Cookie: answer.cookie, 'X-Site-Token': answer.csrf };
}

const check = (port: number, headers: Record<string, string>, code: string) => post(port, '/api/codes/check', { code }, headers);
let ids = 0;
const redeem = (port: number, headers: Record<string, string>, code: string, more: Record<string, unknown> = {}) =>
  post(port, '/api/codes/redeem', { code, character: 1, requestId: `r${++ids}`, confirm: false, ...more }, headers);

it('answers 503 off while codes are off', async () => {
  const { port } = await start({ codes: false });
  const headers = await logIn(port);
  expect(await check(port, headers, 'WELCOME2026')).toEqual({ status: 503, body: { error: 'off' } });
});

it('needs the session, the site origin and the CSRF token', async () => {
  const { port } = await start();
  expect((await check(port, {}, 'WELCOME2026')).status).toBe(401);
  const headers = await logIn(port);
  expect((await check(port, { ...headers, Origin: 'https://evil.example' }, 'WELCOME2026')).status).toBe(403);
  expect((await check(port, { Cookie: headers.Cookie! }, 'WELCOME2026')).status).toBe(403);
});

it('refuses a badly typed code without counting a try', async () => {
  const { port, make } = await start();
  await make();
  const headers = await logIn(port);
  for (let i = 0; i < 12; i++) expect(await check(port, headers, 'ab')).toEqual({ status: 400, body: { error: 'format' } });
  expect((await check(port, headers, 'welcome-2026')).status).toBe(200);
});

it('waits after 10 unknown codes for an account, and after the address limit for anyone there', async () => {
  const { port, make } = await start({ addressFails: 12 });
  await make();
  const one = await logIn(port);
  for (let i = 0; i < 10; i++) expect((await check(port, one, `NOPE${i}AAA`)).status).toBe(404);
  expect(await check(port, one, 'WELCOME2026')).toEqual({ status: 429, body: { error: 'too_many' } });
  const two = await logIn(port, 'tester2', 'password-two');
  for (let i = 0; i < 2; i++) expect((await check(port, two, `NOPE${i}BBB`)).status).toBe(404);
  expect((await check(port, two, 'WELCOME2026')).status).toBe(429);
});

it('checks, redeems and delivers once; the same press again gets the first answer', async () => {
  const { port, make, delivered, lines } = await start();
  await make();
  const headers = await logIn(port);
  const checked = await check(port, headers, 'WELCOME2026');
  expect(checked).toMatchObject({ status: 200, body: { ok: true, replaces: false, offer: { label: 'Launch', items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }] } } });
  const done = await redeem(port, headers, 'WELCOME2026', { requestId: 'press-1' });
  expect(done).toMatchObject({ status: 200, body: { ok: true, repeat: false } });
  expect(delivered).toEqual([done.body.useId]);
  const again = await redeem(port, headers, 'WELCOME2026', { requestId: 'press-1' });
  expect(again).toMatchObject({ status: 200, body: { ok: true, repeat: true, useId: done.body.useId } });
  expect(delivered).toHaveLength(1);
  expect(await redeem(port, headers, 'WELCOME2026')).toMatchObject({ status: 409, body: { error: 'mine' } });
  expect(lines.join('\n')).not.toContain('WELCOME2026');
  expect(lines.some((l) => /^code 127\.0\.0\.1 tester1 1 ok$/.test(l))).toBe(true);
});

it('refuses a character that is not the account\'s, and the code stays unused', async () => {
  const { port, make, codes } = await start();
  await make();
  const headers = await logIn(port);
  expect(await redeem(port, headers, 'WELCOME2026', { character: 2 })).toMatchObject({ status: 409, body: { error: 'character' } });
  expect(codes.useRows).toHaveLength(0);
  expect((await redeem(port, headers, 'WELCOME2026', { character: 1 })).status).toBe(200);
});

it('refuses a lower VIP code with both dates, and replaces a lower VIP only with the confirm', async () => {
  const { port, make, vip, now } = await start();
  await make({ vipLevel: 1, vipDays: 30, items: [], keys: ['VIPONE'] });
  await make({ vipLevel: 3, vipDays: 7, items: [], keys: ['VIPTHREE'] });
  const headers = await logIn(port);
  vip.setVip('tester1', 4, now + 10 * DAY);
  expect(await redeem(port, headers, 'VIPONE')).toMatchObject({
    status: 409, body: { error: 'lower_vip', vip: { level: 4, endsAt: iso(now + 10 * DAY) }, offer: { vipLevel: 1, expiresAt: iso(now + 30 * DAY) } },
  });
  vip.setVip('tester1', 1, now + 10 * DAY);
  expect(await redeem(port, headers, 'VIPTHREE')).toMatchObject({ status: 409, body: { error: 'confirm', vip: { level: 1 } } });
  expect(await redeem(port, headers, 'VIPTHREE', { confirm: true })).toMatchObject({ status: 200, body: { vip: { level: 3, endsAt: iso(now + 7 * DAY) } } });
});

it('answers ok even when the mail cannot be written now (the VIP job retries it)', async () => {
  const { port, make } = await start({ deliver: async () => { throw new Error('SQL down'); } });
  await make();
  const headers = await logIn(port);
  expect((await redeem(port, headers, 'WELCOME2026')).status).toBe(200);
});

it('answers before the mail is written (a slow mail write never turns a used code into "can\'t reach")', async () => {
  let finish = () => {};
  const { port, make } = await start({ deliver: () => new Promise<void>((resolve) => { finish = resolve; }) });
  await make();
  const headers = await logIn(port);
  const answer = await Promise.race([
    redeem(port, headers, 'WELCOME2026'),
    new Promise<Reply>((resolve) => setTimeout(() => resolve({ status: 0, body: 'no answer' }), 2000)),
  ]);
  finish();
  expect(answer).toMatchObject({ status: 200, body: { ok: true } });
});

it('limits every redeem press of an account, refused ones too, to 30 an hour', async () => {
  const { port, make } = await start();
  await make();
  const headers = await logIn(port);
  expect((await redeem(port, headers, 'WELCOME2026')).status).toBe(200);
  for (let i = 0; i < 29; i++) expect((await redeem(port, headers, 'WELCOME2026')).body.error).toBe('mine');
  expect(await redeem(port, headers, 'WELCOME2026')).toEqual({ status: 429, body: { error: 'too_many' } });
});

it('refuses a bad body', async () => {
  const { port } = await start();
  const headers = await logIn(port);
  expect(await redeem(port, headers, 'WELCOME2026', { character: 'x' })).toMatchObject({ status: 400, body: { error: 'invalid', field: 'character' } });
  expect(await redeem(port, headers, 'WELCOME2026', { requestId: '' })).toMatchObject({ status: 400, body: { error: 'invalid', field: 'requestId' } });
  expect(await redeem(port, headers, 'WELCOME2026', { confirm: 'yes' })).toMatchObject({ status: 400, body: { error: 'invalid', field: 'confirm' } });
});
