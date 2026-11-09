// 2026-11-10 (personal-shop): the shop's rules, its two keypads and its state, against Neuz's code
// (docs/superpowers/specs/2026-11-10-personal-shop-research.md).
import { describe, expect, it } from 'vitest';
import type { AddedMover } from '@flyffweb/protocol';
import { BuyPad, SellPad } from '../src/world/vendor/vendorKeypad';
import { VendorBook } from '../src/world/vendor/vendorBook';
import {
  canPutUp, checkShopName, openGoldOk, priceColor, registerGoldOk, slotName, slotPoint, vendorGold, withCommas,
} from '../src/world/vendor/vendorRules';

describe('the shop rules', () => {
  it('places the 20 slots in two columns, 36 px apart (WndVendorCtrl.cpp:172-180)', () => {
    expect(slotPoint(0)).toEqual({ x: 20, y: 68 });
    expect(slotPoint(1)).toEqual({ x: 240, y: 68 });
    expect(slotPoint(19)).toEqual({ x: 240, y: 68 + 9 * 36 });
  });

  it('colours a price by its size (WndVendorCtrl.cpp:142-152)', () => {
    expect(priceColor(99_999)).toBe(0xff000000);
    expect(priceColor(100_000)).toBe(0xff009900);
    expect(priceColor(1_000_000)).toBe(0xff3333ff);
    expect(priceColor(10_000_000)).toBe(0xffff6600);
    expect(priceColor(100_000_000)).toBe(0xffcc0303);
    expect(priceColor(1_000_000_000)).toBe(0xff990099);
    expect(withCommas(2_100_000_000)).toBe('2,100,000,000');
  });

  it("cuts a slot's name past 108 px with dots, an upgrade as +N", () => {
    const width = (text: string): number => text.length * 6;
    expect(slotName('Sword', 3, width)).toBe('Sword +3');
    expect(slotName('A very long item name here', 0, width)).toBe('A very long item n...');
  });

  it('refuses quest, expired, held and worn items', () => {
    const item = { objectId: 3, count: 1 };
    expect(canPutUp(item, 1, false, false)).toBe(true);
    expect(canPutUp(item, 43, false, false)).toBe(false);
    expect(canPutUp({ ...item, flag: 1 }, 1, false, false)).toBe(false);
    expect(canPutUp(item, 1, true, false)).toBe(false);
    expect(canPutUp(item, 1, false, true)).toBe(false);
  });

  it("checks the bag's penya and the prices as Neuz's int does", () => {
    const slots = [{ objectId: 1, count: 10, cost: 100 }, null];
    expect(vendorGold(5_000, slots)).toBe(6_000);
    expect(openGoldOk(0, [])).toBe(false);
    expect(openGoldOk(5_000, slots)).toBe(true);
    expect(openGoldOk(0, [{ objectId: 1, count: 1, cost: 2_100_000_000 }])).toBe(false);
    expect(registerGoldOk(5_000, slots, 1_000, 2)).toBe(true);
    expect(registerGoldOk(5_000, slots, 1_000_000_000, 3)).toBe(false);
    // int wrap: 30,000 x 100,000 is negative in 32 bits, so the total is under 0
    expect(openGoldOk(10, [{ objectId: 1, count: 30_000, cost: 100_000 }])).toBe(false);
  });

  it('checks the name: banned words, the word filter, 6 to 32 bytes', () => {
    const none = (text: string): string => text;
    expect(checkShopName('  Cheap potions  ', ['gm'], none)).toEqual({ ok: true, name: 'Cheap potions' });
    expect(checkShopName('GM shop here', ['gm'], none)).toEqual({ ok: false, box: 'TID_DIAG_0020' });
    expect(checkShopName('short', [], none)).toEqual({ ok: false, box: 'TID_DIAG_0011' });
    expect(checkShopName('x'.repeat(33), [], none)).toEqual({ ok: false, box: 'TID_DIAG_0011' });
    expect(checkShopName('bad word shop', [], (text) => text.replace('bad', '***'))).toEqual({ ok: true, name: '*** word shop' });
  });
});

describe('the registration keypad (CWndRegVend)', () => {
  it('starts on the stack and 0, the price focused for one item', () => {
    expect(new SellPad(5).values).toEqual(['5', '0']);
    expect(new SellPad(5).focus).toBe(0);
    expect(new SellPad(1).focus).toBe(1);
  });

  it('types digits, 00 and 000, Min, Max and Backspace into the focused field', () => {
    const pad = new SellPad(20);
    pad.focus = 1;
    for (const key of ['1', '5', '000'] as const) pad.press(key);
    expect(pad.values[1]).toBe('15000');
    pad.press('back');
    expect(pad.values[1]).toBe('1500');
    pad.press('max');
    expect(pad.values[1]).toBe('2100000000');
    pad.press('min');
    expect(pad.values[1]).toBe('1');
    pad.focus = 0;
    pad.press('escape');
    expect(pad.values[0]).toBe('0');
    pad.press('7');
    expect(pad.values[0]).toBe('7');
    pad.press('max');
    expect(pad.values[0]).toBe('20');
  });

  it('appends to the start value, as Neuz does on the first digit', () => {
    const pad = new SellPad(5);
    pad.press('3');
    expect(pad.values[0]).toBe('53');
    expect(pad.result()).toBeNull(); // the price is 0
    pad.focus = 1;
    pad.press('9');
    expect(pad.result()).toEqual({ count: 5, cost: 9 }); // 53 cut to the stack
  });

  it('calculates: 12 * 3 =', () => {
    const pad = new SellPad(1);
    pad.press('escape');
    pad.press('1'); pad.press('2'); pad.press('*'); pad.press('3'); pad.press('=');
    expect(pad.values[1]).toBe('36');
  });

  it('refuses 00 on 0 and past 9 digits, caps the price at INT_MAX', () => {
    const pad = new SellPad(1);
    pad.press('00');
    expect(pad.values[1]).toBe('0');
    for (const key of ['9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9'] as const) pad.press(key);
    expect(pad.values[1]).toBe('9999999999');
    expect(pad.result()).toEqual({ count: 1, cost: 2_147_483_647 });
  });
});

describe('the buy keypad (CWndVendorBuy)', () => {
  it('starts on all the slot holds, caps at it, and totals', () => {
    const pad = new BuyPad(12, 250);
    expect(pad.count).toBe(12);
    expect(pad.total).toBe(3_000);
    pad.press('escape');
    pad.press('5');
    expect(pad.count).toBe(5);
    pad.press('000');
    expect(pad.count).toBe(12);
    pad.press('min');
    expect(pad.total).toBe(250);
  });
});

describe('the shop state (CVTInfo, g_Chatting)', () => {
  const SELF = 100, SELLER = 200;
  const player = (objectId: number, shopTitle: string): AddedMover => ({
    objectId, index: 11, pos: [0, 0, 0], angle: 0, isPlayer: true, scale: 1, motion: 0, hitPoint: 1, state: 1, stateFlag: 0,
    belligerence: 0, sfxId: 0, player: { shopTitle } as never,
  } as AddedMover);
  const bag = new Map([[7, { itemId: 2800, count: 20 }], [8, { itemId: 21, count: 1 }]]);
  const itemOf = (id: number) => bag.get(id);

  it('keeps titles from ADD_OBJ, PVENDOR_OPEN and PVENDOR_CLOSE', () => {
    const book = new VendorBook();
    expect(book.added(player(SELLER, 'Potions!'))).toEqual([{ kind: 'title', objectId: SELLER, title: 'Potions!' }]);
    expect(book.apply(SELLER, { type: 'pvendorClose', clearTitle: true }, SELF, itemOf)).toEqual([{ kind: 'title', objectId: SELLER, title: '' }]);
    book.apply(SELLER, { type: 'pvendorOpen', title: 'Again' }, SELF, itemOf);
    expect(book.titles.get(SELLER)).toBe('Again');
    // a buyer who left: the title stays
    expect(book.apply(SELLER, { type: 'pvendorClose', clearTitle: false }, SELF, itemOf)).toEqual([]);
    expect(book.titles.get(SELLER)).toBe('Again');
    expect(book.removed(SELLER)).toEqual([{ kind: 'title', objectId: SELLER, title: '' }]);
  });

  it("holds the own slots, opens, saves and reloads them", () => {
    const book = new VendorBook();
    const register = { type: 'registerPVendorItem', slot: 2, itemType: 0, objectId: 7, count: 10, cost: 50 } as const;
    expect(book.apply(SELLER, register, SELF, itemOf)).toEqual([]); // another mover's: not ours
    expect(book.apply(SELF, register, SELF, itemOf)).toEqual([{ kind: 'ownSlot', slot: 2, objectId: 7, held: true }]);
    expect(book.isVendor).toBe(true);
    expect(book.apply(SELF, { type: 'pvendorOpen', title: 'My shop' }, SELF, itemOf)).toContainEqual({ kind: 'ownOpened' });
    expect(book.ownOpen(SELF)).toBe(true);
    // a sale of 4: the line's numbers
    expect(book.apply(SELF, { type: 'pvendorItemNum', slot: 2, left: 6, buyer: 'Bob' }, SELF, itemOf)).toEqual([
      { kind: 'itemNum', sellerId: SELF, slot: 2, left: 6, buyer: 'Bob', sold: 4, itemId: 2800, total: 200 },
    ]);
    expect(book.own[2]).toEqual({ objectId: 7, count: 6, cost: 50 });
    book.save(itemOf);
    const closed = book.apply(SELF, { type: 'pvendorClose', clearTitle: true }, SELF, itemOf);
    expect(closed).toContainEqual({ kind: 'ownSlot', slot: 2, objectId: 7, held: false });
    expect(closed.find((e) => e.kind === 'ownClosed')).toMatchObject({ title: 'My shop' });
    expect(book.isVendor).toBe(false);
    expect(book.reload(itemOf)).toEqual([{ slot: 2, objectId: 7, count: 6, cost: 50 }]);
    // the stack shrank under the saved count: dropped
    expect(book.reload(() => ({ itemId: 2800, count: 2 }))).toEqual([]);
    expect(book.saved[2]).toBeNull();
  });

  it('browses a shop, follows its sales, and closes with it', () => {
    const book = new VendorBook();
    const items = [{ slot: 1, item: { objectId: 3, itemId: 2800, count: 20 }, count: 5, cost: 10 }];
    expect(book.apply(SELLER, { type: 'pvendorItems', items, chatting: true }, SELF, itemOf)).toEqual([{ kind: 'browse', sellerId: SELLER, chatting: true }]);
    expect(book.browsed?.items[1]?.count).toBe(5);
    book.apply(SELLER, { type: 'pvendorItemNum', slot: 1, left: 0, buyer: 'Ann' }, SELF, itemOf);
    expect(book.browsed?.items[1]).toBeNull();
    expect(book.apply(SELLER, { type: 'pvendorClose', clearTitle: true }, SELF, itemOf)).toContainEqual({ kind: 'browseClosed', sellerId: SELLER });
    expect(book.browsed).toBeNull();
  });

  it('keeps the chat room: members, lines by name, leaving', () => {
    const book = new VendorBook();
    book.apply(SELF, { type: 'chattingNew', members: [{ playerId: 1, name: 'Seller' }] }, SELF, itemOf);
    expect(book.apply(SELF, { type: 'chattingEnter', member: { playerId: 2, name: 'Buyer' } }, SELF, itemOf)).toContainEqual({ kind: 'chatEnter', name: 'Buyer' });
    expect(book.apply(SELF, { type: 'chattingLine', playerId: 2, text: 'hi' }, SELF, itemOf)).toEqual([{ kind: 'chatLine', name: 'Buyer', text: 'hi' }]);
    expect(book.apply(SELF, { type: 'chattingLine', playerId: 9, text: 'who' }, SELF, itemOf)).toEqual([]);
    expect(book.apply(SELF, { type: 'chattingRemove', playerId: 2 }, SELF, itemOf)).toContainEqual({ kind: 'chatLeave', name: 'Buyer' });
    expect([...book.members.values()]).toEqual(['Seller']);
  });
});
