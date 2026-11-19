// Redeem codes (2026-11-20): a use's items go by in-game mail right after the redeem, and the VIP job sends whatever
// is still waiting; never twice, never lost.
import { beforeEach, expect, it } from 'vitest';
import { codeMailText, codeMailTitle, deliverCodeUses, deliverOne } from '../src/codes/codeDelivery';
import { MemoryCodeStore } from './support/memoryCodeStore';
import { MemoryVipStore } from './support/memoryVipStore';

const NOW = Date.UTC(2026, 10, 20);
const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;
const log = { lines: [] as string[], info(line: string) { this.lines.push(line); }, warn(line: string) { this.lines.push(`warn: ${line}`); } };
let codes: MemoryCodeStore;
let useId: number;

beforeEach(async () => {
  log.lines.length = 0;
  const vip = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }, { account: 'tester2', passwordHash: 'y' }], () => NOW);
  codes = new MemoryCodeStore(vip, [{ account: 'tester1', idPlayer: '0000001', name: 'Alpha' }], () => NOW);
  await codes.add({
    label: 'Launch "week"', kind: 'E', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: iso(NOW + 86_400_000),
    items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }], keys: ['WELCOME2026'], accounts: [], admin: 'Poreotix',
  });
  const done = await codes.redeem({ account: 'tester1', key: 'WELCOME2026', requestId: 'r1', idPlayer: '0000001', characterName: 'Alpha', address: '203.0.113.5', confirm: false });
  if (!done.ok) throw new Error('not redeemed');
  useId = done.useId;
});

it('names the mail after the use and the code', () => {
  expect(codeMailTitle(7)).toBe('Code reward #7');
  expect(codeMailText('Launch')).toBe('From code "Launch". Collect within 15 days.');
  expect(codeMailText('x'.repeat(300))).toHaveLength(255);
});

it('mails each stack right after the redeem and marks the use delivered, once', async () => {
  await deliverOne({ admin: codes, mail: codes }, log, useId);
  expect(codes.mails.map((m) => [m.idPlayer, m.itemId, m.count, m.title])).toEqual([
    ['0000001', 10206, 5, `Code reward #${useId}`], ['0000001', 4805, 2, `Code reward #${useId}`],
  ]);
  expect(await codes.pending(50, 0)).toHaveLength(0);
  await deliverOne({ admin: codes, mail: codes }, log, useId);
  expect(await deliverCodeUses({ admin: codes, mail: codes }, log)).toEqual({ sent: 0, waiting: 0 });
  expect(codes.mails).toHaveLength(2);
});

it('leaves a use whose mail failed for the job, which sends it later', async () => {
  codes.failing.add('sendUse');
  await deliverOne({ admin: codes, mail: codes }, log, useId);
  expect(log.lines.some((l) => l.startsWith('warn: code: use'))).toBe(true);
  expect(await codes.pending(50, 0)).toHaveLength(1);
  codes.failing.delete('sendUse');
  expect(await deliverCodeUses({ admin: codes, mail: codes }, log)).toEqual({ sent: 1, waiting: 0 });
  expect(codes.mails).toHaveLength(2);
});

it('keeps a use waiting while the account has no character', async () => {
  codes.characters.length = 0;
  expect(await deliverCodeUses({ admin: codes, mail: codes }, log)).toEqual({ sent: 0, waiting: 1 });
  expect(await codes.pending(50, 0)).toHaveLength(1);
});

it('never throws: a failing page read is one warning', async () => {
  codes.failing.add('pending');
  expect(await deliverCodeUses({ admin: codes, mail: codes }, log)).toEqual({ sent: 0, waiting: 0 });
  codes.failing.add('pendingOne');
  await deliverOne({ admin: codes, mail: codes }, log, useId);
  expect(log.lines.filter((l) => l.startsWith('warn:'))).toHaveLength(2);
});
