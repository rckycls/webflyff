// Redeem codes (2026-11-20): the rules of vip.sql's usp_WebCodeCheck / usp_WebCodeRedeem / usp_AdminCodeAdd /
// usp_AdminCodeMailSend, on the memory store the route tests and the demo use, and the SQL store's answer table.
import { beforeEach, expect, it } from 'vitest';
import type { NewCode } from '../src/codes/codeStore';
import { REFUSALS } from '../src/codes/sqlCodeStore';
import { MemoryCodeStore } from './support/memoryCodeStore';
import { MemoryVipStore } from './support/memoryVipStore';

const DAY = 86_400_000;
const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;
let now = Date.UTC(2026, 10, 20, 0, 0, 0);
let vip: MemoryVipStore;
let codes: MemoryCodeStore;

beforeEach(() => {
  now = Date.UTC(2026, 10, 20, 0, 0, 0);
  vip = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }, { account: 'tester2', passwordHash: 'y' }], () => now);
  codes = new MemoryCodeStore(vip, [
    { account: 'tester1', idPlayer: '0000001', name: 'Alpha' },
    { account: 'tester1', idPlayer: '0000003', name: 'Gamma', playTime: 50 },
    { account: 'tester2', idPlayer: '0000002', name: 'Beta' },
  ], () => now);
});

async function make(over: Partial<NewCode> = {}): Promise<number> {
  const added = await codes.add({
    label: 'Test', kind: 'E', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: iso(now + 30 * DAY),
    items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }], keys: ['WELCOME1'], accounts: [], admin: 'Poreotix', ...over,
  });
  if (!('id' in added)) throw new Error(`not added: ${added.refused}`);
  return added.id;
}

const redeem = (account: string, key: string, requestId: string, confirm = false, idPlayer = account === 'tester1' ? '0000001' : '0000002') =>
  codes.redeem({ account, key, requestId, idPlayer, characterName: 'Alpha', address: '203.0.113.5', confirm });

it('checks and redeems an everyone item code once per account', async () => {
  await make();
  const check = await codes.check('tester1', 'WELCOME1');
  expect(check).toMatchObject({ ok: true, replaces: false, offer: { label: 'Test', items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }] } });
  const done = await redeem('tester1', 'WELCOME1', 'r1');
  expect(done).toMatchObject({ ok: true, repeat: false });
  const pending = await codes.pending(50, 0);
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ account: 'tester1', idPlayer: '0000001', items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }] });
  expect(await redeem('tester1', 'WELCOME1', 'r2')).toMatchObject({ ok: false, refused: 'mine' });
  expect(await codes.check('tester1', 'WELCOME1')).toMatchObject({ ok: false, refused: 'mine' });
});

it('answers the same request id with the first answer, and keeps one use', async () => {
  await make();
  const first = await redeem('tester1', 'WELCOME1', 'r1');
  const again = await redeem('tester1', 'WELCOME1', 'r1');
  expect(first.ok && again.ok).toBe(true);
  if (!first.ok || !again.ok) return;
  expect(again).toMatchObject({ repeat: true, useId: first.useId });
  expect(await codes.pending(50, 0)).toHaveLength(1);
});

it('stops an everyone code at its cap', async () => {
  await make({ maxUses: 1 });
  expect(await redeem('tester1', 'WELCOME1', 'r1')).toMatchObject({ ok: true });
  expect(await redeem('tester2', 'WELCOME1', 'r2')).toMatchObject({ ok: false, refused: 'claimed' });
});

it('lets each one-use key go once, and one key per account per batch', async () => {
  await make({ kind: 'K', keys: ['ONEUSEKEY1', 'ONEUSEKEY2'] });
  expect(await redeem('tester1', 'ONEUSEKEY1', 'r1')).toMatchObject({ ok: true });
  expect(await redeem('tester2', 'ONEUSEKEY1', 'r2')).toMatchObject({ ok: false, refused: 'key_used' });
  expect(await redeem('tester1', 'ONEUSEKEY2', 'r3')).toMatchObject({ ok: false, refused: 'mine' });
  expect(await redeem('tester2', 'ONEUSEKEY2', 'r4')).toMatchObject({ ok: true });
});

it('gives an only-these code only to the listed accounts', async () => {
  await make({ kind: 'L', accounts: ['TESTER1'] });
  expect(await redeem('tester2', 'WELCOME1', 'r1')).toMatchObject({ ok: false, refused: 'not_listed' });
  expect(await redeem('tester1', 'WELCOME1', 'r2')).toMatchObject({ ok: true });
});

it('refuses a code turned off, one past its end, and a key nobody made', async () => {
  const id = await make();
  await codes.save(id, 'Test', iso(now + 30 * DAY), false);
  expect(await redeem('tester1', 'WELCOME1', 'r1')).toMatchObject({ ok: false, refused: 'inactive' });
  await codes.save(id, 'Test', iso(now + DAY), true);
  now += 2 * DAY;
  expect(await redeem('tester1', 'WELCOME1', 'r2')).toMatchObject({ ok: false, refused: 'expired' });
  expect(await redeem('tester1', 'NOSUCHKEY', 'r3')).toEqual({ ok: false, refused: 'unknown', offer: null, vip: null });
});

it('refuses a whole lower-VIP code for a higher VIP, but an item-only code works', async () => {
  vip.setVip('tester1', 4, now + 10 * DAY);
  await make({ vipLevel: 1, vipDays: 30, keys: ['VIPONE'] });
  const refused = await redeem('tester1', 'VIPONE', 'r1');
  expect(refused).toMatchObject({ ok: false, refused: 'lower_vip', vip: { level: 4, endsAt: iso(now + 10 * DAY) }, offer: { vipLevel: 1, expiresAt: iso(now + 30 * DAY) } });
  expect(await codes.pending(50, 0)).toHaveLength(0);
  await make({ keys: ['ITEMSONLY'] });
  expect(await redeem('tester1', 'ITEMSONLY', 'r2')).toMatchObject({ ok: true });
});

it('replaces a lower VIP only with the confirm, and keeps what it replaced', async () => {
  vip.setVip('tester1', 1, now + 20 * DAY);
  const id = await make({ vipLevel: 3, vipDays: 7, items: [], keys: ['VIPTHREE'] });
  expect(await codes.check('tester1', 'VIPTHREE')).toMatchObject({ ok: true, replaces: true, vip: { level: 1 } });
  expect(await redeem('tester1', 'VIPTHREE', 'r1')).toMatchObject({ ok: false, refused: 'confirm' });
  expect(await redeem('tester1', 'VIPTHREE', 'r2', true)).toMatchObject({ ok: true, vip: { level: 3, endsAt: iso(now + 7 * DAY) } });
  expect(vip.liveVipOf('tester1')).toEqual({ level: 3, endsAt: now + 7 * DAY });
  expect(vip.letterOf('tester1')).toBe('C');
  const [use] = await codes.uses(id, 100);
  expect(use).toMatchObject({ replacedLevel: 1, replacedEndsAt: iso(now + 20 * DAY), vipLevel: 3, deliveredAt: iso(now) });
});

it('adds the days to the same VIP level while it runs', async () => {
  vip.setVip('tester1', 2, now + 5 * DAY);
  await make({ vipLevel: 2, vipDays: 7, keys: ['VIPTWO'] });
  expect(await redeem('tester1', 'VIPTWO', 'r1')).toMatchObject({ ok: true, vip: { level: 2, endsAt: iso(now + 12 * DAY) } });
});

it('mails each stack once to the redeeming character, else to another of the account', async () => {
  await make();
  const done = await redeem('tester1', 'WELCOME1', 'r1');
  if (!done.ok) throw new Error('not redeemed');
  const use = (await codes.pendingOne(done.useId))!;
  expect(await codes.sendUse(use, 'Code reward #1', 'text')).toMatchObject({ result: 1, idPlayer: '0000001' });
  expect(codes.mails.map((m) => [m.idPlayer, m.itemId, m.count])).toEqual([['0000001', 10206, 5], ['0000001', 4805, 2]]);
  expect(await codes.sendUse(use, 'Code reward #1', 'text')).toMatchObject({ result: 2 });
  expect(codes.mails).toHaveLength(2);
  codes.characters[0]!.deleted = true;
  expect(await codes.sendUse({ ...use, id: 99 }, 'Code reward #99', 'text')).toMatchObject({ result: 1, idPlayer: '0000003' });
});

it('refuses a taken key and an unknown account when making a code', async () => {
  await make();
  expect(await codes.add({
    label: 'Again', kind: 'E', vipLevel: 1, vipDays: 3, maxUses: null, expiresAt: iso(now + DAY), items: [], keys: ['WELCOME1'], accounts: [], admin: 'Poreotix',
  })).toEqual({ refused: 'key_taken', detail: 'WELCOME1' });
  expect(await codes.add({
    label: 'Few', kind: 'L', vipLevel: 1, vipDays: 3, maxUses: null, expiresAt: iso(now + DAY), items: [], keys: ['FEWONLY'], accounts: ['tester1', 'nobody9'], admin: 'Poreotix',
  })).toEqual({ refused: 'unknown_account', detail: 'nobody9' });
});

it('maps the SQL answers to the nine refusals', () => {
  expect(REFUSALS).toEqual({
    [-1]: 'unknown', [-2]: 'expired', [-3]: 'inactive', [-4]: 'claimed', [-5]: 'key_used', [-6]: 'mine', [-7]: 'not_listed', [-8]: 'lower_vip', [-9]: 'confirm',
  });
});

it('keeps a code bound, shows it in the offer and the list, and mails its items bound (owner 2026-11-20)', async () => {
  const id = await make({ bound: true, keys: ['BOUND1'] });
  await make({ keys: ['LOOSE1'] });
  expect(await codes.check('tester1', 'BOUND1')).toMatchObject({ ok: true, offer: { bound: true } });
  expect(await codes.check('tester1', 'LOOSE1')).toMatchObject({ ok: true, offer: { bound: false } });
  expect((await codes.list()).find((c) => c.id === id)).toMatchObject({ bound: true });
  const done = await redeem('tester1', 'BOUND1', 'r1');
  if (!done.ok) throw new Error('not redeemed');
  const use = (await codes.pendingOne(done.useId))!;
  expect(use.bound).toBe(true);
  await codes.sendUse(use, 'Code reward #1', 'text');
  expect(codes.mails.every((m) => m.bound)).toBe(true);
});
