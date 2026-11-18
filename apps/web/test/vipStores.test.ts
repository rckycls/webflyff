// 2026-11-19 (VIP perks): the memory stores follow apps/web/sql/vip.sql's rules for letters and gift boxes, so the VIP
// job's tests (vipPerksJob.test.ts) stand for the SQL ones.
import { describe, expect, it } from 'vitest';
import { MemoryVipCharacters, MemoryVipStore } from './support/memoryVipStore';

const NOW = Date.UTC(2026, 10, 19, 12);
const setUp = () => {
  const store = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }, { account: 'gm1', passwordHash: 'x' }], () => NOW);
  store.accountLetters.set('gm1', 'P');
  return store;
};
const request = async (store: MemoryVipStore, account: string, level: number): Promise<number> => {
  const added = await store.addRequest({ account, level, currency: 'USD', reference: `R${account}${level}`, referenceKey: `R${account}${level}`, receiptFile: 'r.png', address: '1.2.3.4', maxPending: 3 });
  if (!('id' in added)) throw new Error('refused');
  return added.id;
};

describe('approve and Give VIP', () => {
  it('approve gives the letter and queues one gift box for that request', async () => {
    const store = setUp();
    const id = await request(store, 'tester1', 3);
    expect(await store.approve(id, 'owner')).toMatchObject({ result: 'ok', level: 3 });
    expect(store.accountLetters.get('tester1')).toBe('C');
    expect(await store.pendingGifts(50)).toEqual([expect.objectContaining({ account: 'tester1', level: 3, requestId: id })]);
  });

  it('Give VIP with the tick off queues no gift; an unknown account or a bad level is refused', async () => {
    const store = setUp();
    expect(await store.give('tester1', 2, 3, false, 'owner')).toMatchObject({ result: 'ok', level: 2 });
    expect(store.accountLetters.get('tester1')).toBe('B');
    expect(await store.pendingGifts(50)).toEqual([]);
    expect(await store.give('nobody', 2, 3, true, 'owner')).toEqual({ result: 'unknown' });
    expect(await store.give('tester1', 5, 3, true, 'owner')).toEqual({ result: 'invalid' });
    expect(await store.give('tester1', 1, 0, true, 'owner')).toEqual({ result: 'invalid' });
  });

  it('keeps a staff letter when a GM has VIP', async () => {
    const store = setUp();
    await store.give('gm1', 4, 30, true, 'owner');
    expect(store.accountLetters.get('gm1')).toBe('P');
    expect(await store.syncLetters()).toEqual([]);
    expect(store.accountLetters.get('gm1')).toBe('P');
  });
});

describe('letters', () => {
  it('adopts a hand-set letter only without any WEB_VIP row, for 30 days, logged', async () => {
    const store = setUp();
    expect(await store.adopt('tester1', 3)).toBe(true);
    expect(await store.adopt('tester1', 4)).toBe(false);
    expect(store.vips.get('tester1')).toEqual({ level: 3, endsAt: NOW + 30 * 86_400_000 });
    expect(store.auditRows).toEqual([expect.objectContaining({ action: 'vip.adopt', account: 'tester1' })]);
    expect(await store.pendingGifts(50)).toEqual([]);
  });

  it('syncs letters to the live VIP and back to F once it ends', async () => {
    let now = NOW;
    const store = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => now);
    await store.give('tester1', 1, 1, false, 'owner');
    store.accountLetters.set('tester1', 'F');
    expect(await store.syncLetters()).toEqual([{ account: 'tester1', before: 'F', after: 'A' }]);
    now += 2 * 86_400_000;
    expect(await store.syncLetters()).toEqual([{ account: 'tester1', before: 'A', after: 'F' }]);
    expect(await store.letterAccounts()).toEqual([]);
  });
});

describe('gift boxes', () => {
  it('sends to the online character, else the most played one, never a deleted one; once per gift', async () => {
    const characters = new MemoryVipCharacters([
      { idPlayer: '0000001', account: 'tester1', name: 'Alt', letter: 'F', online: false, playTime: 10, deleted: false },
      { idPlayer: '0000002', account: 'tester1', name: 'Main', letter: 'F', online: false, playTime: 900, deleted: false },
      { idPlayer: '0000003', account: 'tester1', name: 'Gone', letter: 'F', online: false, playTime: 5000, deleted: true },
    ]);
    const gift = { id: 7, account: 'tester1', level: 1, requestId: 1, createdAt: '2026-11-19T12:00:00Z' };
    const items = [{ level: 1, slot: 1, itemId: 10206, count: 10 }, { level: 1, slot: 2, itemId: 4805, count: 5 }];
    expect(await characters.sendGift(gift, items, 'VIP 1 gift', 'Thanks')).toEqual({ result: 1, idPlayer: '0000002', characterName: 'Main' });
    expect(characters.mails).toHaveLength(2);
    expect(await characters.sendGift(gift, items, 'VIP 1 gift', 'Thanks')).toEqual({ result: 2, idPlayer: '0000002', characterName: 'Main' });
    expect(characters.mails).toHaveLength(2);
    characters.rows[0]!.online = true;
    expect(await characters.sendGift({ ...gift, id: 8 }, items, 'VIP 1 gift', 'Thanks')).toMatchObject({ result: 1, idPlayer: '0000001' });
  });

  it('waits when the account has no character', async () => {
    const characters = new MemoryVipCharacters([]);
    const gift = { id: 9, account: 'tester1', level: 1, requestId: null, createdAt: '2026-11-19T12:00:00Z' };
    expect(await characters.sendGift(gift, [{ level: 1, slot: 1, itemId: 10206, count: 1 }], 't', 'x')).toEqual({ result: 0, idPlayer: null, characterName: null });
    expect(characters.mails).toEqual([]);
  });

  it('starts with five item stacks per tier, and saves or empties a slot', async () => {
    const store = setUp();
    const items = await store.giftItems();
    expect(items.filter((i) => i.level === 1).map((i) => [i.itemId, i.count])).toEqual([[10206, 10], [10207, 10], [10208, 10], [4805, 5], [10431, 1]]);
    expect(items.filter((i) => i.level === 4).map((i) => i.count)).toEqual([50, 50, 50, 20, 5]);
    expect(await store.saveGiftItem({ level: 1, slot: 6, itemId: 2800, count: 3 })).toBe(true);
    expect(await store.saveGiftItem({ level: 1, slot: 1, itemId: 10206, count: 0 })).toBe(true);
    expect((await store.giftItems()).filter((i) => i.level === 1).map((i) => i.slot)).toEqual([2, 3, 4, 5, 6]);
    expect(await store.saveGiftItem({ level: 1, slot: 7, itemId: 2800, count: 3 })).toBe(false);
  });

  it('marks a gift sent once, and the site sees the latest one', async () => {
    const store = setUp();
    await store.give('tester1', 2, 30, true, 'owner');
    const [gift] = await store.pendingGifts(50);
    expect(await store.markGiftSent(gift!.id, '0000002', 'Main', '10206x20')).toBe(true);
    expect(await store.markGiftSent(gift!.id, '0000002', 'Main', '10206x20')).toBe(false);
    expect(await store.pendingGifts(50)).toEqual([]);
    expect((await store.mine('tester1')).gift).toEqual({ level: 2, createdAt: '2026-11-19T12:00:00Z', sentAt: '2026-11-19T12:00:00Z', characterName: 'Main' });
    expect((await store.giftLog(10))[0]).toMatchObject({ account: 'tester1', characterName: 'Main', items: '10206x20', createdBy: 'owner' });
  });
});
