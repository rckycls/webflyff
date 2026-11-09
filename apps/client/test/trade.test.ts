// 2026-11-10: the player trade's rules on the client (trade research §2-§6): CItemContainer::Add and TradeConsent, the
// handlers' state, the drop rules and the quantity box.
import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import {
  containerAdd, containerIsFull, freshContainer, tradeConsent,
} from '../src/world/trade/itemContainer';
import type { ItemContainer } from '../src/world/trade/itemContainer';
import { TradeState, blockLine, dropAction, penyaText, quantityOf } from '../src/world/trade/tradeState';
import type { TradeContext } from '../src/world/trade/tradeState';

const PACK: Record<number, number> = { 21: 1, 2029: 9999, 500: 100 };
const packMax = (itemId: number): number => PACK[itemId] ?? 1;

/** An inventory as the server keeps one: 42 bag positions on their own objects, 31 empty parts. */
function bag(items: InventoryItem[]): ItemContainer {
  const c = freshContainer(42);
  c.slots.push(...Array.from({ length: 31 }, () => 0xffffffff));
  for (const item of items) c.items.set(item.objectId, item);
  return c;
}

describe('CItemContainer::Add', () => {
  it('tops up the stacks of the same kind in position order, then fills the first empty positions', () => {
    const c = bag([
      { objectId: 0, itemId: 500, count: 95 },
      { objectId: 1, itemId: 500, count: 40, flag: 2 }, // another flag: not the same kind
      { objectId: 3, itemId: 500, count: 99 },
    ]);
    expect(containerAdd(c, { objectId: 30, itemId: 500, count: 210 }, packMax)).toBe(true);
    expect(c.items.get(0)?.count).toBe(100);
    expect(c.items.get(1)?.count).toBe(40);
    expect(c.items.get(3)?.count).toBe(100);
    // 210 - 5 - 1 = 204: a full stack on the first empty position (2), the rest on the next (4)
    expect(c.items.get(2)).toEqual({ objectId: 2, itemId: 500, count: 100 });
    expect(c.items.get(4)).toEqual({ objectId: 4, itemId: 500, count: 100 });
    expect(c.items.get(5)).toEqual({ objectId: 5, itemId: 500, count: 4 });
  });

  it('puts an item that does not stack on the first empty position, and follows a moved position', () => {
    const c = bag([{ objectId: 0, itemId: 21, count: 1 }]);
    c.slots[1] = 7; c.slots[7] = 1; // positions 1 and 7 swapped (MOVEITEM)
    expect(containerAdd(c, { objectId: 12, itemId: 21, count: 1, abilityOption: 3 }, packMax)).toBe(true);
    expect(c.items.get(7)).toEqual({ objectId: 7, itemId: 21, count: 1, abilityOption: 3 });
  });

  it('refuses when it is full (IsFull)', () => {
    const c = bag(Array.from({ length: 42 }, (_, i) => ({ objectId: i, itemId: 21, count: 1 })));
    expect(containerIsFull(c, { objectId: 0, itemId: 21, count: 1 }, 1, packMax)).toBe(true);
    expect(containerAdd(c, { objectId: 50, itemId: 21, count: 1 }, packMax)).toBe(false);
  });
});

describe('CVTInfo::TradeConsent', () => {
  it('moves the own traded items out, the partner\'s in, and the own to the partner', () => {
    const own = bag([
      { objectId: 0, itemId: 2029, count: 77 },
      { objectId: 1, itemId: 21, count: 1, abilityOption: 5 },
      { objectId: 2, itemId: 500, count: 10 },
    ]);
    const partner = bag([
      { objectId: 0, itemId: 500, count: 100 },
      { objectId: 4, itemId: 21, count: 1 },
    ]);
    const mine = Array.from({ length: 25 }, () => null) as Array<{ objectId: number; count: number } | null>;
    const theirs = [...mine];
    mine[0] = { objectId: 0, count: 7 }; // 7 of the 77
    mine[3] = { objectId: 1, count: 1 };
    mine[4] = { objectId: 2, count: 10 }; // the whole stack
    theirs[2] = { objectId: 0, count: 30 };
    theirs[6] = { objectId: 4, count: 1 };
    tradeConsent(own, mine, partner, theirs, packMax);
    // own: 70 left of the 77; the +5 sword (1) and the 10 (2) gone; then, in the partner's slot order, its 30 of 500 on the
    // first empty position (1) and its sword on the next (2)
    expect([...own.items.values()].sort((a, b) => a.objectId - b.objectId)).toEqual([
      { objectId: 0, itemId: 2029, count: 70 },
      { objectId: 1, itemId: 500, count: 30 },
      { objectId: 2, itemId: 21, count: 1 },
    ]);
    // partner: 70 of 500 left; its sword (4) gone; then the given container: 7 of 2029 on the first empty position (1), the
    // +5 sword on the next (2), the 10 of 500 onto its 70
    expect([...partner.items.values()].sort((a, b) => a.objectId - b.objectId)).toEqual([
      { objectId: 0, itemId: 500, count: 80 },
      { objectId: 1, itemId: 2029, count: 7 },
      { objectId: 2, itemId: 21, count: 1, abilityOption: 5 },
    ]);
  });
});

const OWN_ID = 9, OTHER_ID = 40, OWN_PLAYER = 70001;
function ctx(requestOpen = false): TradeContext {
  return {
    ownObjectId: OWN_ID, ownPlayerId: OWN_PLAYER, nameOf: (id) => (id === OTHER_ID ? 'Webby' : id === OWN_ID ? 'Me' : ''),
    requestOpen: () => requestOpen,
  };
}
const opened = (): TradeState => {
  const t = new TradeState();
  t.apply(OTHER_ID, { type: 'trade', playerId: OWN_PLAYER, slots: Array.from({ length: 73 }, (_, i) => (i < 42 ? i : 0xffffffff)),
    items: [{ objectId: 5, itemId: 2029, count: 50 }] }, ctx());
  return t;
};

describe('TradeState (the handlers)', () => {
  it('shows the request, or refuses with BLOCK 5 when a trade or a request is open', () => {
    expect(new TradeState().apply(OTHER_ID, { type: 'confirmTrade' }, ctx())).toEqual([{ kind: 'request', askerId: OTHER_ID, name: 'Webby' }]);
    expect(new TradeState().apply(OTHER_ID, { type: 'confirmTrade' }, ctx(true))).toEqual([{ kind: 'refuse', gu: 5, askerName: 'Webby' }]);
    expect(opened().apply(OTHER_ID, { type: 'confirmTrade' }, ctx())).toEqual([{ kind: 'refuse', gu: 5, askerName: 'Webby' }]);
    expect(new TradeState().apply(77, { type: 'confirmTrade' }, ctx())).toEqual([]);
    expect(new TradeState().apply(OWN_ID, { type: 'confirmTradeCancel' }, ctx())).toEqual([{ kind: 'line', tid: 'TID_GAME_TRADECANCEL' }]);
  });

  it('opens with the partner and follows both sides: items, penya, OKs', () => {
    const t = opened();
    expect(t.open).toBe(true);
    expect(t.partnerName).toBe('Webby');
    expect(t.apply(OWN_ID, { type: 'tradePut', slot: 2, itemType: 0, itemObjectId: 7, count: 3 }, ctx())).toEqual([{ kind: 'changed' }]);
    expect(t.extraOf(7)).toBe(3);
    t.apply(OTHER_ID, { type: 'tradePut', slot: 0, itemType: 0, itemObjectId: 5, count: 20 }, ctx());
    expect(t.itemAt('theirs', 0, null)).toEqual({ objectId: 5, itemId: 2029, count: 50 });
    expect(t.theirs.slots[0]).toEqual({ objectId: 5, count: 20 });
    // an object the partner lacks is not put (GetItemId)
    expect(t.apply(OTHER_ID, { type: 'tradePut', slot: 1, itemType: 0, itemObjectId: 6, count: 1 }, ctx())).toEqual([]);
    expect(t.apply(OWN_ID, { type: 'tradePutGold', gold: 1000 }, ctx())).toEqual([{ kind: 'ownGold', delta: -1000 }, { kind: 'changed' }]);
    t.apply(OTHER_ID, { type: 'tradePutGold', gold: 5 }, ctx());
    expect([t.mine.gold, t.theirs.gold]).toEqual([1000, 5]);
    expect(t.apply(OTHER_ID, { type: 'tradeOk' }, ctx())).toEqual([
      { kind: 'changed' }, { kind: 'line', tid: 'TID_GAME_TRADEACCPET', args: ['Webby'] },
    ]);
    expect(t.theirs.ok).toBe(true);
    expect(t.apply(0xffffffff, { type: 'tradeLastConfirm' }, ctx())).toEqual([{ kind: 'lastConfirm' }, { kind: 'changed' }]);
    expect(t.mine.ok && t.confirming).toBe(true);
    expect(t.apply(OTHER_ID, { type: 'tradeLastConfirmOk' }, ctx())).toEqual([
      { kind: 'line', tid: 'TID_GAME_FINALCOMFIRM', args: ['Webby'], colorTid: 'TID_GAME_TRADEACCPET' },
    ]);
    expect(t.apply(OWN_ID, { type: 'tradeLastConfirmOk' }, ctx())).toEqual([{ kind: 'waitApproval' }]);
    const events = t.apply(0xffffffff, { type: 'tradeConsent' }, ctx());
    expect(events.map((e) => e.kind)).toEqual(['consent', 'closed']);
    expect(events[0]).toMatchObject({ gold: 5, mine: expect.arrayContaining([{ objectId: 7, count: 3 }]) });
    expect(t.open).toBe(false);
  });

  it('cancels with the box of its mode, and closes silently when the partner leaves', () => {
    const t = opened();
    expect(t.apply(OTHER_ID, { type: 'tradeCancel', playerId: 70002, mode: 0 }, ctx())).toEqual([
      { kind: 'closed' }, { kind: 'box', tid: 'TID_DIAG_0003' },
    ]);
    expect(opened().apply(OTHER_ID, { type: 'tradeCancel', playerId: 70002, mode: 1 }, ctx())).toEqual([
      { kind: 'closed' }, { kind: 'box', tid: 'TID_DIAG_0002' },
    ]);
    expect(opened().apply(OWN_ID, { type: 'tradeCancel', playerId: OWN_PLAYER, mode: 1 }, ctx())).toEqual([{ kind: 'closed' }]);
    const u = opened();
    expect(u.removed(77)).toEqual([]);
    expect(u.removed(OTHER_ID)).toEqual([{ kind: 'closed' }]);
    expect(u.open).toBe(false);
    expect(new TradeState().apply(OWN_ID, { type: 'tradePutError' }, ctx())).toEqual([{ kind: 'box', tid: 'TID_DIAG_0054' }]);
  });

  it('says the asked side\'s refusals (OnBlock)', () => {
    expect(blockLine({ type: 'block', gu: 3, name: 'Webby' })).toEqual({ kind: 'line', tid: 'TID_GAME_TRADEDENY', args: ['Webby'] });
    expect(blockLine({ type: 'block', gu: 5, name: 'Webby' })).toEqual({ kind: 'line', tid: 'TID_GAME_YETTRADE' });
    expect(blockLine({ type: 'block', gu: 8, name: 'Webby' })).toEqual({ kind: 'line', tid: 'TID_GAME_TRADELIMITPC' });
    expect(blockLine({ type: 'block', gu: 7, name: 'Webby' })).toBeNull();
  });
});

describe('the drops and the quantity box', () => {
  it('asks the count of a stack, puts a single item, takes the penya once, and refuses the rest', () => {
    const t = opened();
    const one = { objectId: 3, item: { objectId: 3, itemId: 21, count: 1 } };
    const stack = { objectId: 4, item: { objectId: 4, itemId: 2029, count: 12 } };
    expect(dropAction(t, 0, one, false)).toEqual({ kind: 'put', slot: 0, objectId: 3 });
    expect(dropAction(t, 1, stack, false)).toEqual({ kind: 'quantity', slot: 1, objectId: 4, count: 12 });
    expect(dropAction(t, 0, one, true)).toEqual({ kind: 'none' }); // the box open
    expect(dropAction(t, 0, { objectId: 3, item: { objectId: 3, itemId: 21, count: 1, flag: 1 } }, false)).toEqual({ kind: 'none' });
    expect(dropAction(t, 0, { gold: 900 }, false)).toEqual({ kind: 'gold', gold: 900 });
    t.apply(OWN_ID, { type: 'tradePut', slot: 0, itemType: 0, itemObjectId: 8, count: 1 }, ctx());
    expect(dropAction(t, 0, one, false)).toEqual({ kind: 'none' }); // a taken slot
    expect(t.firstFreeSlot()).toBe(1);
    t.apply(OWN_ID, { type: 'tradePutGold', gold: 10 }, ctx());
    expect(dropAction(t, 2, { gold: 900 }, false)).toEqual({ kind: 'none' }); // only while the own penya is 0
    expect(dropAction(new TradeState(), 0, one, false)).toEqual({ kind: 'none' });
  });

  it('reads the count as _ttoi, at least 1, at most the stack', () => {
    expect(quantityOf('5', 12)).toBe(5);
    expect(quantityOf('0', 12)).toBe(1);
    expect(quantityOf('abc', 12)).toBe(1);
    expect(quantityOf('300', 12)).toBe(12);
    expect(quantityOf('7x', 12)).toBe(7);
    expect(quantityOf('5', 0)).toBe(0);
  });

  it('writes the penya with commas', () => {
    expect(penyaText(0)).toBe('0');
    expect(penyaText(999)).toBe('999');
    expect(penyaText(81913416)).toBe('81,913,416');
  });
});
