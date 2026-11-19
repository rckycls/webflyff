// Redeem codes (2026-11-20): the panel's Codes view (VIP tab): making codes, listing them, their keys and uses,
// turning them off; every change in the Log tab, never a key.

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { CODE_ACTIONS } from '../src/admin/actions/codes';
import { VipFiles } from '../src/vip/vipFiles';
import { testContext, testDeps } from './support/adminDeps';
import { MemoryCodeStore } from './support/memoryCodeStore';
import { MemoryVipStore } from './support/memoryVipStore';

const DAY = 86_400_000;
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const CATALOG = [
  { id: 10206, name: 'Remantis Laccotte', packMax: 99, upgradable: false },
  { id: 21, name: 'Wooden Sword', packMax: 1, upgradable: true },
];

function setUp(withCodes = true) {
  let deps: ReturnType<typeof testDeps>;
  const vipStore = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }, { account: 'tester2', passwordHash: 'y' }], () => deps.now());
  const codes = new MemoryCodeStore(vipStore, [{ account: 'tester1', idPlayer: '0000001', name: 'Alpha' }], () => deps.now());
  const dir = mkdtempSync(path.join(os.tmpdir(), 'codes-admin-'));
  dirs.push(dir);
  deps = testDeps({ actions: CODE_ACTIONS, catalog: CATALOG as never });
  deps.vip = { store: vipStore, files: new VipFiles(dir), ...(withCodes ? { codes } : {}) };
  return { deps, codes, ctx: testContext(deps) };
}

type S = ReturnType<typeof setUp>;
const act = async (name: keyof typeof CODE_ACTIONS, body: Record<string, unknown>, s: S): Promise<{ status: number; body: any }> => CODE_ACTIONS[name](body, s.ctx, s.deps);
const ahead = (s: S, days: number): string => new Date(s.deps.now() + days * DAY).toISOString();
const everyone = (s: S, over: Record<string, unknown> = {}) => ({
  label: 'Launch week', vipLevel: 2, vipDays: 7, items: [{ itemId: 10206, count: 20 }], kind: 'E', expiresAt: ahead(s, 30), ...over,
});

it('answers 503 off without the codes', async () => {
  const s = setUp(false);
  expect((await act('codes.list', {}, s)).status).toBe(503);
});

it('makes an everyone code with the owner\'s own word, lists it named, and logs it without the key', async () => {
  const s = setUp();
  const made = await act('codes.add', everyone(s, { word: 'launch-2026', maxUses: 100 }), s);
  expect(made).toMatchObject({ status: 200, body: { ok: true, keys: ['LAUNCH2026'] } });
  const list = await act('codes.list', {}, s);
  expect(list.body.rows[0]).toMatchObject({
    label: 'Launch week', kind: 'E', vipLevel: 2, vipDays: 7, maxUses: 100, uses: 0, firstKey: 'LAUNCH2026', on: true,
    items: [{ itemId: 10206, count: 20, name: 'Remantis Laccotte' }],
  });
  const row = s.deps.store.log.at(-1)!;
  expect(row).toMatchObject({ action: 'codes.add', result: 'ok' });
  expect(`${row.before}${row.after}`).not.toContain('LAUNCH2026');
});

it('makes a batch of one-use codes as XXXX-XXXX-XXXX-XXXX, and lists their keys', async () => {
  const s = setUp();
  const made = await act('codes.add', everyone(s, { kind: 'K', count: 3, vipLevel: 0, vipDays: 0 }), s);
  expect(made.status).toBe(200);
  expect(made.body.keys).toHaveLength(3);
  for (const key of made.body.keys) expect(key).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const keys = await act('codes.keys', { id: made.body.id }, s);
  expect(keys.body.rows.map((k: { key: string }) => k.key)).toEqual(made.body.keys);
  expect(`${s.deps.store.log.at(-1)!.before}${s.deps.store.log.at(-1)!.after}`).not.toContain(made.body.keys[0].replace(/-/g, ''));
});

it('refuses a code that gives nothing, a count over the stack, an unknown item, and a bad end time', async () => {
  const s = setUp();
  expect(await act('codes.add', everyone(s, { vipLevel: 0, vipDays: 0, items: [] }), s)).toMatchObject({ status: 400, body: { field: 'items' } });
  expect(await act('codes.add', everyone(s, { items: [{ itemId: 21, count: 2 }] }), s)).toMatchObject({ status: 400, body: { field: 'items', message: expect.stringContaining('Wooden Sword stacks to 1') } });
  expect(await act('codes.add', everyone(s, { items: [{ itemId: 99999, count: 1 }] }), s)).toMatchObject({ status: 400, body: { field: 'items' } });
  expect(await act('codes.add', everyone(s, { expiresAt: ahead(s, -1) }), s)).toMatchObject({ status: 400, body: { field: 'expiresAt' } });
  expect(await act('codes.add', everyone(s, { expiresAt: ahead(s, 400) }), s)).toMatchObject({ status: 400, body: { field: 'expiresAt' } });
  expect(await act('codes.add', everyone(s, { vipDays: 0 }), s)).toMatchObject({ status: 400, body: { field: 'vipDays' } });
  expect(await act('codes.add', everyone(s, { kind: 'K', count: 501 }), s)).toMatchObject({ status: 400, body: { field: 'count' } });
});

it('names an unknown account of an only-these code, and a word already taken', async () => {
  const s = setUp();
  expect(await act('codes.add', everyone(s, { kind: 'L', accounts: 'tester1\nnobody9' }), s))
    .toMatchObject({ status: 400, body: { field: 'accounts', message: expect.stringContaining('nobody9') } });
  expect((await act('codes.add', everyone(s, { kind: 'L', accounts: 'tester1, tester2' }), s)).status).toBe(200);
  expect((await act('codes.add', everyone(s, { word: 'TAKEN1' }), s)).status).toBe(200);
  expect(await act('codes.add', everyone(s, { word: 'taken-1' }), s)).toMatchObject({ status: 400, body: { field: 'word', message: expect.stringContaining('TAKEN1') } });
});

it('turns a code off and changes its label and end, logged; shows its uses', async () => {
  const s = setUp();
  const made = await act('codes.add', everyone(s, { word: 'OFFSOON' }), s);
  await s.codes.redeem({ account: 'tester1', key: 'OFFSOON', requestId: 'r1', idPlayer: '0000001', characterName: 'Alpha', address: '203.0.113.5', confirm: false });
  const saved = await act('codes.save', { id: made.body.id, label: 'Launch (ended)', expiresAt: ahead(s, 5), on: false }, s);
  expect(saved).toMatchObject({ status: 200, body: { ok: true } });
  expect(s.deps.store.log.at(-1)).toMatchObject({ action: 'codes.save', result: 'ok' });
  expect((await act('codes.get', { id: made.body.id }, s)).body.code).toMatchObject({ label: 'Launch (ended)', on: false });
  expect((await act('codes.uses', { id: made.body.id }, s)).body.rows).toMatchObject([{ account: 'tester1', characterName: 'Alpha', vipLevel: 2 }]);
  expect((await act('codes.save', { id: 999, label: 'x', expiresAt: ahead(s, 5), on: true }, s)).status).toBe(404);
});
