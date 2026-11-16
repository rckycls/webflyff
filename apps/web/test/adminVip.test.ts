// The panel's VIP tab: approve and reject (with the log), the QRs (with their pictures), the tiers; and the panel's
// picture routes and upload limit.

import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { priceCents, VIP_ACTIONS } from '../src/admin/actions/vip';
import { createAdminServer } from '../src/admin/adminServer';
import { VipFiles } from '../src/vip/vipFiles';
import { TEST_PASSWORD, testContext, testDeps } from './support/adminDeps';
import { MemoryVipStore } from './support/memoryVipStore';
import { PNG_BASE64 } from './support/vipPictures';

const ORIGIN = 'https://admin.play.example.com';
const dirs: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setUp(withVip = true) {
  let deps: ReturnType<typeof testDeps>;
  const vipStore = new MemoryVipStore([], () => deps.now());
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-admin-'));
  dirs.push(dir);
  const files = new VipFiles(dir);
  deps = testDeps({ actions: VIP_ACTIONS });
  if (withVip) deps.vip = { store: vipStore, files };
  return { deps, vipStore, files, dir, ctx: testContext(deps) };
}

type S = ReturnType<typeof setUp>;
const act = async (name: keyof typeof VIP_ACTIONS, body: Record<string, unknown>, s: S): Promise<{ status: number; body: any }> => VIP_ACTIONS[name](body, s.ctx, s.deps);

async function pending(s: S, account = 'tester1', level = 2, reference = `REF-${Math.random().toString(36).slice(2, 10)}`) {
  const receiptFile = await s.files.save('receipts', Buffer.from(PNG_BASE64, 'base64'), 'png');
  const added = await s.vipStore.addRequest({ account, level, reference, referenceKey: reference.replace(/-/g, '').toUpperCase(), receiptFile, address: '203.0.113.9', maxPending: 3 });
  if (!('id' in added)) throw new Error('not added');
  return added.id;
}

const DAY = 86_400_000;

it('answers 503 off while Support / VIP is off', async () => {
  const s = setUp(false);
  expect((await act('vip.requests', { status: 'P' }, s))).toMatchObject({ status: 503, body: { error: 'off' } });
});

it('lists the queue oldest first with the receipt address, and approves: VIP for one month from now, logged', async () => {
  const s = setUp();
  const first = await pending(s, 'tester1', 2);
  await pending(s, 'tester2', 4);
  const queue = await act('vip.requests', { status: 'P' }, s);
  expect(queue.body.rows.map((r: { account: string }) => r.account)).toEqual(['tester1', 'tester2']);
  expect(queue.body.rows[0]).toMatchObject({ id: first, level: 2, priceCents: 400, status: 'P', receipt: `/vip/receipt/${first}`, vipLevel: null });
  expect(queue.body.rows[0].receiptFile).toBeUndefined();

  const done = await act('vip.approve', { id: first }, s);
  expect(done).toMatchObject({ status: 200, body: { ok: true, level: 2, endsAt: '2025-12-13T02:13:20Z' } });
  expect(await s.vipStore.mine('tester1')).toMatchObject({ vip: { level: 2, endsAt: '2025-12-13T02:13:20Z' } });
  const row = (await s.vipStore.request(first))!;
  expect(row).toMatchObject({ status: 'A', decidedBy: 'Poreotix', vipEndsAt: '2025-12-13T02:13:20Z' });
  expect(s.deps.store.log.at(-1)).toMatchObject({ admin: 'Poreotix', action: 'vip.approve', account: 'tester1', result: 'ok' });
  // a second approve, or a reject after it, is refused
  expect((await act('vip.approve', { id: first }, s)).status).toBe(409);
  expect((await act('vip.reject', { id: first, reason: 'x' }, s)).status).toBe(409);
});

it('adds a month to the end of the same tier while it runs; another tier starts now, for a month', async () => {
  const s = setUp();
  await act('vip.approve', { id: await pending(s, 'tester1', 2) }, s);
  s.deps.setNow(s.deps.now() + 10 * DAY);
  // the same tier: from its end (Dec 13) one more month
  expect((await act('vip.approve', { id: await pending(s, 'tester1', 2) }, s)).body.endsAt).toBe('2026-01-13T02:13:20Z');
  // another tier while VIP 2 runs: VIP 4 from now (Nov 23), one month; VIP 2's days left end
  expect((await act('vip.approve', { id: await pending(s, 'tester1', 4) }, s)).body).toMatchObject({ level: 4, endsAt: '2025-12-23T02:13:20Z' });
  // after it ended, the same tier starts from now again
  s.deps.setNow(Date.parse('2026-02-01T00:00:00Z'));
  expect((await act('vip.approve', { id: await pending(s, 'tester1', 4) }, s)).body.endsAt).toBe('2026-03-01T00:00:00Z');
});

it('rejects only with a reason the player sees, and logs it', async () => {
  const s = setUp();
  const id = await pending(s);
  expect((await act('vip.reject', { id, reason: '   ' }, s)).body).toMatchObject({ error: 'invalid', field: 'reason' });
  expect((await act('vip.reject', { id, reason: 'x'.repeat(201) }, s)).body.field).toBe('reason');
  expect((await act('vip.reject', { id, reason: 'No payment with this reference came in.' }, s)).status).toBe(200);
  expect((await s.vipStore.mine('tester1')).requests[0]).toMatchObject({ status: 'R', reason: 'No payment with this reference came in.' });
  expect(s.deps.store.log.at(-1)).toMatchObject({ action: 'vip.reject', account: 'tester1', result: 'ok' });
  expect((await act('vip.approve', { id }, s)).status).toBe(409);
  expect((await act('vip.approve', { id: 999 }, s)).status).toBe(404);
});

it('adds a QR with its picture, changes it, and deletes it with its file', async () => {
  const s = setUp();
  const fields = { label: 'GCash', accountName: 'R. C.', note: 'Exact amount please', on: true, order: 1 };
  expect((await act('vip.qrAdd', { ...fields, image: Buffer.from('<svg/>').toString('base64') }, s)).body.field).toBe('image');
  expect((await act('vip.qrAdd', { ...fields, label: '' }, s)).body.field).toBe('label');
  expect((await act('vip.qrAdd', { ...fields, order: 0, image: PNG_BASE64 }, s)).body.field).toBe('order');
  const added = await act('vip.qrAdd', { ...fields, image: PNG_BASE64 }, s);
  expect(added.body).toEqual({ ok: true, id: 1 });
  expect(readdirSync(path.join(s.dir, 'qr'))).toHaveLength(1);
  const list = await act('vip.qrs', {}, s);
  expect(list.body.rows).toEqual([expect.objectContaining({ id: 1, label: 'GCash', on: true, order: 1, image: '/vip/qr/1' })]);
  expect(list.body.rows[0].imageFile).toBeUndefined();
  expect((await act('vip.qrSave', { id: 1, ...fields, on: false, order: 3 }, s)).status).toBe(200);
  expect(await s.vipStore.qrs()).toEqual([]);
  expect((await act('vip.qrDelete', { id: 1 }, s)).status).toBe(200);
  expect(readdirSync(path.join(s.dir, 'qr'))).toEqual([]);
  expect(s.deps.store.log.map((r) => r.action)).toEqual(['vip.qrAdd', 'vip.qrSave', 'vip.qrDelete']);
});

it('changes a tier\'s name, price and on/off; prices are dollars to the cent', async () => {
  const s = setUp();
  expect((await act('vip.tierSave', { level: 1, name: 'VIP 1', price: '2.5', on: false }, s)).status).toBe(200);
  expect(s.vipStore.tierRows[0]).toEqual({ level: 1, name: 'VIP 1', priceCents: 250, on: false });
  expect((await act('vip.tierSave', { level: 1, name: 'VIP 1', price: '-1', on: true }, s)).body.field).toBe('price');
  expect((await act('vip.tierSave', { level: 8, name: 'VIP 8', price: 1, on: true }, s)).status).toBe(404);
  expect([priceCents(2), priceCents('10.00'), priceCents('4.50'), priceCents('0'), priceCents('1.234'), priceCents('abc')]).toEqual([200, 1000, 450, undefined, undefined, undefined]);
});

// --- the panel's server ---------------------------------------------------------------------------------------------

interface Reply { status: number; headers: IncomingHttpHeaders; body: any; raw: Buffer }

function call(port: number, method: string, url: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed: unknown;
        try { parsed = JSON.parse(raw.toString('utf8')); } catch { parsed = undefined; }
        resolve({ status: res.statusCode!, headers: res.headers, body: parsed, raw });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: undefined, raw: Buffer.alloc(0) }));
    req.end(body);
  });
}

async function startPanel(s: S) {
  const server = createAdminServer(s.deps);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const login = await call(port, 'POST', '/api/login', { 'Content-Type': 'application/json', Origin: ORIGIN },
    JSON.stringify({ user: 'Poreotix', password: TEST_PASSWORD, code: s.deps.code() }));
  const cookie = String(login.headers['set-cookie']).split(';')[0]!;
  return { port, cookie, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie, 'X-Admin-Token': login.body.csrf as string } };
}

it('serves a receipt and a QR picture only to a live panel session', async () => {
  const s = setUp();
  const id = await pending(s);
  const { port, cookie } = await startPanel(s);
  expect((await call(port, 'GET', `/vip/receipt/${id}`)).status).toBe(401);
  const picture = await call(port, 'GET', `/vip/receipt/${id}`, { Cookie: cookie });
  expect(picture.status).toBe(200);
  expect(picture.headers['content-type']).toBe('image/png');
  expect(picture.headers['content-security-policy']).toContain("default-src 'none'");
  expect((await call(port, 'GET', '/vip/receipt/999', { Cookie: cookie })).status).toBe(404);
  expect((await call(port, 'GET', '/vip/receipt/../../web.config.json', { Cookie: cookie })).status).toBe(404);
});

it('takes a QR picture over 16 KB only in vip.qrAdd with a live session', async () => {
  const s = setUp();
  const { port, headers } = await startPanel(s);
  const big = Buffer.alloc(40_000);
  Buffer.from(PNG_BASE64, 'base64').copy(big);
  const body = JSON.stringify({ label: 'Maya', accountName: 'R. C.', on: true, order: 2, image: big.toString('base64'), requestId: 'q1' });
  expect((await call(port, 'POST', '/api/vip.qrAdd', headers, body)).body).toEqual({ ok: true, id: 1 });
  // without a session the 16 KB limit holds
  const { Cookie: _c, ...noSession } = headers;
  expect((await call(port, 'POST', '/api/vip.qrAdd', noSession, body)).status).toBe(413);
  // and in every other action
  expect((await call(port, 'POST', '/api/vip.qrSave', headers, body)).status).toBe(413);
});
