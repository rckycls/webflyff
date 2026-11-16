// @vitest-environment jsdom
// 2026-11-17: the extra bag's model, rules and window (pocket/pocketBook.ts, pocket/pocketRules.ts, pocket/pocketHud.ts;
// docs/2026-11-17-extra-bag-research.md).

import { describe, expect, it } from 'vitest';
import { decodeWorldPacket } from '@flyffweb/protocol';
import type { InventoryItem, OwnPocket } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { PocketBook } from '../src/world/pocket/pocketBook';
import {
  IK3_POCKET, IK3_QUEST, bagToIcon, bagToPocket, iconTooltip, pocketToBag, pocketToPocket, tapBagItem,
} from '../src/world/pocket/pocketRules';
import type { PocketAction, PocketContext } from '../src/world/pocket/pocketRules';
import { PocketHud } from '../src/world/pocket/pocketHud';
import type { PocketHudScreen } from '../src/world/pocket/pocketHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_TOOLTIP_BAG_TIME', { text: '%d Days %d Hours %d Minutes left', color: 0xffffffff, textId: 1 }],
  ['TID_TOOLTIP_BAG_INFO', { text: 'Place the Extra Bag icon here.', color: 0xffffffff, textId: 2 }],
  ['TID_GAME_ALREADY_USE', { text: 'You are already using an Extra Bag.', color: 0xffffffff, textId: 3 }],
  ['TID_GAME_EQUIPPUT', { text: 'Please unequip the item first.', color: 0xffff0000, textId: 4 }],
]) as unknown as Texts;

const STACK = 2800, SWORD = 21, QUEST = 900, BAG_30 = 26477;
const props = new Map<number, Partial<WebItemProp>>([
  [STACK, { id: STACK, name: 'Potion', packMax: 99, kind3: 0 }],
  [SWORD, { id: SWORD, name: 'Sword', packMax: 1, kind3: 0 }],
  [QUEST, { id: QUEST, name: 'Quest thing', packMax: 1, kind3: IK3_QUEST }],
  [BAG_30, { id: BAG_30, name: 'Extra Bag (30 days)', packMax: 99, kind3: IK3_POCKET, skillTime: 2592000 } as Partial<WebItemProp>],
]);
const prop = (itemId: number): WebItemProp | undefined => props.get(itemId) as WebItemProp | undefined;
const packMax = (itemId: number): number => props.get(itemId)?.packMax ?? 1;
const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const NOW = 1_800_000_000;
const pocket0: OwnPocket = { pocket: 0, expired: false, secondsLeft: null, slots: ids(6), items: [{ objectId: 1, itemId: STACK, count: 50 }] };

function book(extra: OwnPocket[] = []): PocketBook {
  return new PocketBook([pocket0, ...extra], NOW);
}

function ctx(pockets: PocketBook, bag: InventoryItem[] = [], worn: number[] = []): PocketContext {
  return { pockets, bagItems: new Map(bag.map((item) => [item.objectId, item])), worn: (id) => worn.includes(id), prop };
}

function sent(action: PocketAction): unknown {
  if (action.kind !== 'send') throw new Error(`not a packet: ${action.kind}`);
  return decodeWorldPacket(action.bytes);
}

describe('PocketBook (CPocketController)', () => {
  it('keeps the ADD_OBJ pockets by position; pocket 0 never expires; a missing pocket is not there', () => {
    const b = book([{ pocket: 2, expired: true, secondsLeft: -5, slots: ids(24), items: [{ objectId: 23, itemId: SWORD, count: 1 }] }]);
    expect(b.cells(0)).toEqual([null, { objectId: 1, itemId: STACK, count: 50 }, null, null, null, null]);
    expect([0, 1, 2].map((p) => b.usable(p))).toEqual([true, false, false]);
    expect([0, 1, 2].map((p) => b.exists(p))).toEqual([true, false, true]);
    expect(b.cells(2)[23]?.itemId).toBe(SWORD);
    expect(b.secondsLeft(0, NOW)).toBeNull();
    expect(b.hasItems()).toBe(true);
  });

  it('POCKET_ATTRIBUTE avail makes a new pocket for its seconds, expired closes it and keeps its items; avail again starts anew', () => {
    const b = book();
    b.attribute(1, 1, 86400, NOW);
    expect(b.usable(1)).toBe(true);
    expect(b.secondsLeft(1, NOW + 400)).toBe(86000);
    b.add(1, { objectId: 9, itemId: SWORD, count: 1 }, packMax);
    b.attribute(0, 1, 1, NOW + 86401);
    expect(b.usable(1)).toBe(false);
    expect(b.cells(1)[0]?.itemId).toBe(SWORD);
    // an expired pocket takes and gives nothing (IsAvailable)
    b.add(1, { objectId: 9, itemId: SWORD, count: 1 }, packMax);
    b.remove(1, 0, 1);
    expect(b.cells(1).filter((c) => c !== null)).toHaveLength(1);
    b.attribute(1, 1, 3600, NOW + 90000);
    expect(b.usable(1)).toBe(true);
    expect(b.secondsLeft(1, NOW + 90000)).toBe(3600);
    expect(b.cells(1)[0]?.itemId).toBe(SWORD);
  });

  it('POCKET_ADD_ITEM stacks first then the first empty position; POCKET_REMOVE_ITEM counts down or empties', () => {
    const b = book();
    b.add(0, { objectId: 30, itemId: STACK, count: 60 }, packMax);
    expect(b.cells(0).map((c) => c?.count ?? 0)).toEqual([11, 99, 0, 0, 0, 0]);
    b.remove(0, 1, 9);
    expect(b.item(0, 1)?.count).toBe(90);
    b.remove(0, 0, 11);
    expect(b.item(0, 0)).toBeUndefined();
  });
});

describe('the Backpack\'s drops (CWndBagEx, CWndInventory)', () => {
  const bag: InventoryItem[] = [
    { objectId: 3, itemId: SWORD, count: 1 }, { objectId: 4, itemId: STACK, count: 30 }, { objectId: 5, itemId: QUEST, count: 1 },
    { objectId: 6, itemId: BAG_30, count: 2 },
  ];

  it('a bag item into pocket 0: one goes at once (count 1), a stack asks, the count kept between 1 and the stack', () => {
    const b = book();
    expect(sent(bagToPocket(0, 3, ctx(b, bag)))).toEqual({ type: 'moveItemPocketRequest', from: -1, objectId: 3, count: 1, to: 0 });
    const ask = bagToPocket(0, 4, ctx(b, bag));
    if (ask.kind !== 'ask') throw new Error('no ask');
    expect(ask.max).toBe(30);
    expect(decodeWorldPacket(ask.send(99)!)).toEqual({ type: 'moveItemPocketRequest', from: -1, objectId: 4, count: 30, to: 0 });
    expect(decodeWorldPacket(ask.send(0)!)).toMatchObject({ count: 1 });
  });

  it('refuses a worn item, a quest item, and anything on a pocket not in use', () => {
    const b = book();
    expect(bagToPocket(0, 3, ctx(b, bag, [3]))).toEqual({ kind: 'line', tid: 'TID_GAME_EQUIPPUT' });
    expect(bagToPocket(0, 5, ctx(b, bag))).toEqual({ kind: 'line', tid: 'TID_GAME_ERROR_DONT_MOVE_QUEST_ITEM_TO_BAG_EX' });
    expect(bagToPocket(1, 3, ctx(b, bag))).toEqual({ kind: 'none' });
  });

  it('pocket to pocket needs both in use, and its own grid does nothing; pocket to bag needs the pocket in use', () => {
    const b = book([{ pocket: 1, expired: false, secondsLeft: 600, slots: ids(24), items: [{ objectId: 2, itemId: SWORD, count: 1 }] }]);
    expect(sent(pocketToPocket(1, 2, 0, ctx(b)))).toEqual({ type: 'moveItemPocketRequest', from: 1, objectId: 2, count: 1, to: 0 });
    expect(pocketToPocket(0, 1, 0, ctx(b))).toEqual({ kind: 'none' });
    expect(pocketToPocket(0, 1, 2, ctx(b))).toEqual({ kind: 'none' });
    expect(pocketToBag(0, 1, ctx(b)).kind).toBe('ask');
    expect(sent(pocketToBag(1, 2, ctx(b)))).toEqual({ type: 'moveItemPocketRequest', from: 1, objectId: 2, count: 1, to: -1 });
    b.attribute(0, 1, 1, NOW);
    expect(pocketToBag(1, 2, ctx(b))).toEqual({ kind: 'none' });
  });

  it('an Extra Bag on bag icon 1 or 2 opens it; on one in use the box; anything else nothing', () => {
    const b = book();
    expect(sent(bagToIcon(2, 6, ctx(b, bag)))).toEqual({ type: 'availPocketRequest', pocket: 2, objectId: 6 });
    expect(bagToIcon(1, 3, ctx(b, bag))).toEqual({ kind: 'none' });
    b.attribute(1, 2, 60, NOW);
    expect(bagToIcon(2, 6, ctx(b, bag))).toEqual({ kind: 'box', tid: 'TID_GAME_ALREADY_USE' });
  });

  it('the phone\'s tap: into the shown pocket in use; on a closed one an Extra Bag opens it, anything else nothing', () => {
    const b = book();
    expect(sent(tapBagItem(1, 6, ctx(b, bag)))).toEqual({ type: 'availPocketRequest', pocket: 1, objectId: 6 });
    expect(tapBagItem(1, 3, ctx(b, bag))).toEqual({ kind: 'none' });
    expect(sent(tapBagItem(0, 3, ctx(b, bag)))).toMatchObject({ type: 'moveItemPocketRequest', to: 0 });
    b.attribute(1, 1, 60, NOW);
    expect(tapBagItem(1, 6, ctx(b, bag)).kind).toBe('ask'); // an Extra Bag stack stored as an item in the open pocket
  });

  it('the icon tooltip: the time left short (whole minutes), or the "place the icon" line', () => {
    const b = book();
    const text = (tid: string, fallback: string): string => texts.get(tid)?.text ?? fallback;
    expect(iconTooltip(1, b, NOW, text)).toBe('Place the Extra Bag icon here.');
    b.attribute(1, 1, 30 * 86400, NOW);
    expect(iconTooltip(1, b, NOW + 30, text)).toBe('29d23h left');
    expect(iconTooltip(1, b, NOW + 30 * 86400 - 125, text)).toBe('2m left');
    expect(iconTooltip(1, b, NOW + 30 * 86400 - 10, text)).toBe('0m left');
  });
});

describe('PocketHud (the window and its controller)', () => {
  function hud(bag: InventoryItem[], refused = false) {
    const pockets = book();
    const sentBytes: Uint8Array[] = [];
    const boxes: string[] = [];
    const screen: PocketHudScreen = {
      send: (bytes) => sentBytes.push(bytes), say: () => {}, box: (text) => boxes.push(text), pockets: () => pockets,
      bagItems: () => new Map(bag.map((item) => [item.objectId, item])), worn: () => false, prop, reserved: () => 0,
      now: () => NOW, refused: () => refused, openInventory: () => {}, showTooltip: () => {}, showText: () => {},
    };
    const h = new PocketHud(art, texts, screen, document);
    document.body.append(...h.elements);
    return { h, pockets, sentBytes, boxes };
  }

  it('opens with the three grids by position, the closed pockets covered; redraws on a change', () => {
    const { h, pockets } = hud([]);
    h.toggle();
    expect(h.isOpen).toBe(true);
    const el = h.window.frame.element;
    expect(el.querySelectorAll('.hud-bagex-grid[data-pocket="0"] .hud-bagex-cell')).toHaveLength(6);
    expect(el.querySelectorAll('.hud-bagex-grid[data-pocket="1"] .hud-bagex-cell')).toHaveLength(24);
    expect(el.querySelector('.hud-bagex-grid[data-pocket="0"] .hud-bagex-cell:nth-child(2)')?.getAttribute('data-item-id')).toBe(String(STACK));
    expect([...el.querySelectorAll<HTMLElement>('.hud-bagex-cover')].map((c) => c.hidden)).toEqual([false, false]);
    pockets.attribute(1, 1, 3600, NOW);
    h.update();
    expect([...el.querySelectorAll<HTMLElement>('.hud-bagex-cover')].map((c) => c.hidden)).toEqual([true, false]);
    expect(el.querySelector('.hud-bagex-icon[data-pocket="1"]')?.getAttribute('aria-label')).toBe('1h left');
    h.toggle();
    expect(h.isOpen).toBe(false);
  });

  it('does not open beside the refusing windows', () => {
    const { h } = hud([], true);
    h.toggle();
    expect(h.isOpen).toBe(false);
  });

  it('a stack dropped on a grid opens the count box; its OK sends the count', () => {
    const { h, sentBytes } = hud([{ objectId: 4, itemId: STACK, count: 30 }]);
    h.toggle();
    h.dropOnPocket(0, { kind: 'bagItem', objectId: 4 });
    expect(h.amount.isOpen).toBe(true);
    h.amount.onOk(12);
    expect(sentBytes.map((b) => decodeWorldPacket(b))).toEqual([{ type: 'moveItemPocketRequest', from: -1, objectId: 4, count: 12, to: 0 }]);
  });

  it('an Extra Bag on an icon in use opens the message box', () => {
    const { h, pockets, boxes, sentBytes } = hud([{ objectId: 6, itemId: BAG_30, count: 1 }]);
    pockets.attribute(1, 2, 60, NOW);
    h.toggle();
    h.window.onDropIcon(2, 6);
    expect(boxes).toEqual(['You are already using an Extra Bag.']);
    h.window.onDropIcon(1, 6);
    expect(sentBytes.map((b) => decodeWorldPacket(b))).toEqual([{ type: 'availPocketRequest', pocket: 1, objectId: 6 }]);
  });
});
