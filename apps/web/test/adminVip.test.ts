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

async function pending(s: S, account = 'tester1', level = 2, reference = `REF-${Math.random().toString(36).slice(2, 10)}`, currency: 'USD' | 'PHP' = 'USD') {
  const receiptFile = await s.files.save('receipts', Buffer.from(PNG_BASE64, 'base64'), 'png');
  const added = await s.vipStore.addRequest({ account, level, currency, reference, referenceKey: reference.replace(/-/g, '').toUpperCase(), receiptFile, address: '203.0.113.9', maxPending: 3 });
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
  await pending(s, 'tester2', 4, 'GC-0042', 'PHP');
  const queue = await act('vip.requests', { status: 'P' }, s);
  expect(queue.body.rows.map((r: { account: string }) => r.account)).toEqual(['tester1', 'tester2']);
  expect(queue.body.rows[0]).toMatchObject({ id: first, level: 2, currency: 'USD', priceCents: 400, status: 'P', receipt: `/vip/receipt/${first}`, vipLevel: null });
  expect(queue.body.rows[1]).toMatchObject({ level: 4, currency: 'PHP', priceCents: 57500 });
  expect(queue.body.rows[0].receiptFile).toBeUndefined();
  expect(queue.body.rows[0].hasReceipt).toBeUndefined();

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
  // once its picture was deleted (30 days later) the list has no receipt address and the picture is gone
  s.deps.setNow(s.deps.now() + 31 * DAY);
  await s.vipStore.forgetReceipts(30);
  expect((await act('vip.requests', { status: 'R' }, s)).body.rows[0]).toMatchObject({ id, receipt: null });
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

it('changes a tier\'s name, prices and on/off; prices are dollars and pesos to the cent, no peso price is US$ only', async () => {
  const s = setUp();
  expect((await act('vip.tierSave', { level: 1, name: 'VIP 1', price: '2.5', pricePhp: '120', on: false }, s)).status).toBe(200);
  expect(s.vipStore.tierRows[0]).toEqual({ level: 1, name: 'VIP 1', priceCents: 250, pricePhpCents: 12000, on: false });
  expect((await act('vip.tierSave', { level: 1, name: 'VIP 1', price: '2.5', pricePhp: '', on: true }, s)).status).toBe(200);
  expect(s.vipStore.tierRows[0]!.pricePhpCents).toBeNull();
  expect((await act('vip.tierSave', { level: 1, name: 'VIP 1', price: '2.5', pricePhp: 'abc', on: true }, s)).body.field).toBe('pricePhp');
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

// --- 2026-11-19 (VIP perks): Give VIP, the gift box contents and the gift log -----------------------------------------

function perksSetUp() {
  let deps: ReturnType<typeof testDeps>;
  const vipStore = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => deps.now());
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-admin-'));
  dirs.push(dir);
  const files = new VipFiles(dir);
  deps = testDeps({
    actions: VIP_ACTIONS,
    catalog: [{ id: 10206, name: 'Remantis Laccotte', packMax: 99, upgradable: false }, { id: 2800, name: 'Lollipop', packMax: 9999, upgradable: false }],
  });
  deps.vip = { store: vipStore, files };
  return { deps, vipStore, files, dir, ctx: testContext(deps) };
}

it('Give VIP: refuses a bad level, a bad number of days or an unknown account; gives, logged, with or without a box', async () => {
  const s = perksSetUp();
  expect(await act('vip.give', { account: 'tester1', level: 5, days: 30, gift: true }, s)).toMatchObject({ status: 400, body: { field: 'level' } });
  expect(await act('vip.give', { account: 'tester1', level: 1, days: 0, gift: true }, s)).toMatchObject({ status: 400, body: { field: 'days' } });
  expect(await act('vip.give', { account: 'tester1', level: 1, days: 30 }, s)).toMatchObject({ status: 400, body: { field: 'gift' } });
  expect(await act('vip.give', { account: 'nobody', level: 1, days: 30, gift: true }, s)).toMatchObject({ status: 404 });
  const given = await act('vip.give', { account: 'tester1', level: 2, days: 3, gift: false }, s);
  expect(given).toMatchObject({ status: 200, body: { ok: true, level: 2 } });
  expect(given.body.endsAt).toMatch(/Z$/);
  expect(await s.vipStore.pendingGifts(10)).toEqual([]);
  await act('vip.give', { account: 'tester1', level: 2, days: 30, gift: true }, s);
  expect(await s.vipStore.pendingGifts(10)).toHaveLength(1);
  // the unknown account's try is in the log too, refused
  expect(s.deps.store.log.filter((r) => r.action === 'vip.give').map((r) => r.result)).toEqual(['refused', 'ok', 'ok']);
});

it('gift box contents: lists them; refuses an unknown item, a count over the stack, a bad slot; saves and empties, logged', async () => {
  const s = perksSetUp();
  const list = await act('vip.giftItems', {}, s);
  expect(list.body.rows.filter((r: { level: number }) => r.level === 1)).toHaveLength(5);
  expect(await act('vip.giftItemSave', { level: 1, slot: 6, itemId: 999999, count: 1 }, s)).toMatchObject({ status: 400, body: { field: 'itemId' } });
  expect(await act('vip.giftItemSave', { level: 1, slot: 6, itemId: 10206, count: 100 }, s)).toMatchObject({ status: 400, body: { field: 'count' } });
  expect(await act('vip.giftItemSave', { level: 1, slot: 7, itemId: 10206, count: 1 }, s)).toMatchObject({ status: 400, body: { field: 'slot' } });
  expect(await act('vip.giftItemSave', { level: 1, slot: 6, itemId: 2800, count: 500 }, s)).toMatchObject({ status: 200, body: { ok: true } });
  expect(await act('vip.giftItemSave', { level: 1, slot: 1, itemId: 0, count: 0 }, s)).toMatchObject({ status: 200 });
  const after = (await act('vip.giftItems', {}, s)).body.rows.filter((r: { level: number }) => r.level === 1);
  expect(after.map((r: { slot: number; name: string }) => [r.slot, r.name])).toEqual([[2, null], [3, null], [4, null], [5, null], [6, 'Lollipop']]);
  expect(s.deps.store.log.filter((r) => r.action === 'vip.giftItem')).toHaveLength(2);
});

it('gift log: the latest boxes with the character they went to', async () => {
  const s = perksSetUp();
  await act('vip.give', { account: 'tester1', level: 1, days: 30, gift: true }, s);
  const [gift] = await s.vipStore.pendingGifts(10);
  await s.vipStore.markGiftSent(gift!.id, '0000002', 'Main', '10206x10');
  const log = await act('vip.giftLog', {}, s);
  expect(log.body.rows[0]).toMatchObject({ account: 'tester1', level: 1, characterName: 'Main', items: '10206x10' });
});

it('End VIP: refuses an unknown account, ends a live VIP now (logged), and says when there was none', async () => {
  const s = perksSetUp();
  expect(await act('vip.end', { account: 'nobody' }, s)).toMatchObject({ status: 404 });
  await act('vip.give', { account: 'tester1', level: 1, days: 30, gift: true }, s);
  expect(await act('vip.end', { account: 'tester1' }, s)).toMatchObject({ status: 200, body: { ok: true, cancelled: 1 } });
  expect(await act('vip.end', { account: 'tester1' }, s)).toMatchObject({ status: 409 });
  expect(s.deps.store.log.filter((r) => r.action === 'vip.end').map((r) => r.result)).toEqual(['refused', 'ok', 'refused']);
});
