// @vitest-environment jsdom
// 2026-11-15 (item tooltip gaps): what the item tooltip reads beyond the item: the own bag items' ends (`m_dwKeepTime`,
// made `now + t` as an item comes, ObjSerialize.cpp:110-119; UI_KEEPTIME, MoverParam.cpp:4027-4032), the cool-down left
// (CCooltimeMgr), the world's names and tax (`setTooltipWorld`), and the comparison tooltips on screen (CToolTip's sub 1
// and sub 2, tooltip.cpp:432-499).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { newVagrantOwn } from '@flyffweb/testkit';
import { OwnState } from '../src/world/OwnState';
import { InventoryWindow } from '../src/world/hud/inventoryWindow';
import { createComparison, ownTooltipContext, positionItemComparison, setTooltipWorld } from '../src/world/hud/itemDetails';
import { ItemCooldowns } from '../src/world/items/premiumItems';
import { STARTER_EQUIPMENT, SUIT, itemProp, ownAdded, ownGameData } from './helpers/ownState';

afterEach(() => {
  setTooltipWorld({});
  document.body.replaceChildren();
});

const T0 = 1_700_000_000;

function ownWith(items: InventoryItem[], clock: () => number): OwnState {
  const own = { ...newVagrantOwn(), inventory: items };
  return new OwnState(ownGameData(), ownAdded(1, own), STARTER_EQUIPMENT, () => false, clock);
}

describe('OwnState.keepEndOf: a bag item\'s own end, in time_null() seconds', () => {
  it('the seconds left as it came, added to the clock then; none for an item with no time', () => {
    let now = T0;
    const own = ownWith([{ objectId: 3, itemId: 901, count: 1, keepTime: 600 }, { objectId: 4, itemId: 902, count: 1 }], () => now);
    expect(own.keepEndOf(3)).toBe(T0 + 600);
    expect(own.keepEndOf(4)).toBeUndefined();
    now += 100;
    // a new item (CREATEITEM), then UI_KEEPTIME's minutes from now (a ticket's first use)
    own.apply({ type: 'createItem', itemType: 0, item: { objectId: 0, itemId: 903, count: 1, keepTime: 60 }, stacks: [{ objectId: 5, count: 1 }] }, own.objectId);
    expect(own.keepEndOf(5)).toBe(T0 + 160);
    own.apply({ type: 'updateItem', itemType: 0, objectId: 4, param: 11, value: 30, time: 0 }, own.objectId);
    expect(own.keepEndOf(4)).toBe(T0 + 100 + 30 * 60);
    // gone with the item
    own.apply({ type: 'updateItem', itemType: 0, objectId: 3, param: 0, value: 0, time: 0 }, own.objectId);
    expect(own.keepEndOf(3)).toBeUndefined();
  });
});

describe('ItemCooldowns.left: the ms its group still waits (CCooltimeMgr::GetTime - g_tmCurrent)', () => {
  it('from the use, 0 once past, 0 with no group', () => {
    const food = itemProp({ id: 900, name: 'Cake', kind1: 3, kind2: 14, kind3: 30, part: -1, cooldownMs: 90_000 });
    const cooldowns = new ItemCooldowns();
    expect(cooldowns.left(food, 0)).toBe(0);
    cooldowns.start(food, 1000);
    expect(cooldowns.left(food, 31_000)).toBe(60_000);
    expect(cooldowns.left({ ...food, id: 999 }, 31_000)).toBe(60_000); // the group's, not the item's
    expect(cooldowns.left(food, 91_000)).toBe(0);
    expect(cooldowns.left(itemProp({ id: 1, name: 'Stone', kind2: 15, part: -1 }), 31_000)).toBe(0);
  });
});

describe('ownTooltipContext with the world (setTooltipWorld)', () => {
  it('gives the bag item\'s end, its cool-down, the names and the tax', () => {
    const own = ownWith([{ objectId: 3, itemId: 901, count: 1, keepTime: 600 }], () => T0);
    const tax = { sales: 0.05, purchase: 0.07 };
    setTooltipWorld({
      cooldownLeft: (itemId) => (itemId === 901 ? 5000 : 0), guildName: (id) => (id === 7 ? 'Lions' : undefined),
      playerName: (id) => (id === 8 ? 'Juliet' : undefined), tax: () => tax,
    });
    const ctx = ownTooltipContext(own, own.inventory!.get(3)!, 'inventory');
    expect(ctx).toMatchObject({ keepEnd: T0 + 600, cooldownLeft: 5000, tax });
    expect([ctx.guildName?.(7), ctx.playerName?.(8)]).toEqual(['Lions', 'Juliet']);
    // a shop's item is not the bag's: no end of the bag's
    expect(ownTooltipContext(own, { objectId: 3, itemId: 901, count: 1 }, 'shop').keepEnd).toBeUndefined();
  });
});

describe('the comparison tooltips on screen', () => {
  const rect = (x: number, y: number, w: number, h: number): DOMRect =>
    ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) }) as DOMRect;
  /** A box measured at `w` x `h` where its style puts it. */
  const box = (w: number, h: number): HTMLElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0, w, h);
    document.body.append(el);
    return el;
  };
  const anchor = (x: number, y: number): HTMLElement => {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => rect(x, y, 32, 32);
    document.body.append(el);
    return el;
  };

  it('each sub tooltip right of the one before, frames touching, its bottom level with the main one\'s', () => {
    Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
    const main = box(200, 150), sub1 = box(220, 100), sub2 = box(210, 300);
    positionItemComparison(main, [sub1, sub2], anchor(100, 500), document);
    expect([main.style.left, main.style.top]).toEqual(['100px', `${500 - 150 - 10}px`]);
    expect([sub1.style.left, sub1.style.top]).toEqual(['300px', `${500 - 100 - 10}px`]);
    expect([sub2.style.left, sub2.style.top]).toEqual(['520px', `${500 - 300 - 10}px`]);
  });

  it('the main one pulled left so the row stays on the screen; a tall one kept 8 px from the top', () => {
    Object.assign(window, { innerWidth: 800, innerHeight: 350 });
    const main = box(200, 150), sub1 = box(220, 400);
    positionItemComparison(main, [sub1], anchor(700, 300), document);
    expect(main.style.left).toBe(`${800 - 420 - 8}px`);
    expect(sub1.style.left).toBe(`${800 - 220 - 8}px`);
    expect(sub1.style.top).toBe('8px');
  });

  it('the bag: a bag sword shows the sword held right of it; the held one, and an item not gear, show none', () => {
    // the right hand (PARTS_RWEAPON 10) holds object 44, at inventory position 42 + 10
    const inventorySlots = Array.from({ length: 73 }, (_, i) => (i < 42 ? i : i === 52 ? 44 : 0xffffffff));
    const inventory = [{ objectId: 3, itemId: 21, count: 1, abilityOption: 5 }, { objectId: 4, itemId: 502, count: 1 }, { objectId: 44, itemId: 21, count: 1 }];
    const texts = new Map([['TID_GAME_EQUIPED_ITEM', { id: 'TID_GAME_EQUIPED_ITEM', text: 'Equipped', color: 0 }]]);
    const data = ownGameData({ texts });
    const own = new OwnState(data, ownAdded(1, { ...newVagrantOwn(), inventory, inventorySlots }), STARTER_EQUIPMENT, () => false, () => T0);
    const ui = new InventoryWindow({ url: (key: string) => key, sheets: null }, data, {
      use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn(),
    });
    document.body.append(ui.frame.element);
    ui.toggle(own);
    const hover = (selector: string): void => { ui.frame.element.querySelector(selector)!.dispatchEvent(new MouseEvent('mouseenter')); };
    const compare = (): string[][] => [...ui.frame.element.querySelectorAll('.inventory-compare')]
      .map((box) => [...box.querySelectorAll('.hud-item-tooltip-line')].slice(0, 2).map((line) => line.textContent ?? ''));
    hover('[data-bag-slot="3"]');
    expect(ui.frame.element.querySelectorAll('.inventory-details')).toHaveLength(1);
    expect(compare()).toEqual([['[ Equipped ]', 'Wooden Sword']]);
    hover('[data-equipment-part="10"]');
    expect(compare()).toEqual([]);
    hover('[data-bag-slot="4"]'); // a suit, with no suit worn
    expect(compare()).toEqual([]);
  });

  it('createComparison: a tooltip of the worn item, "[ Equipped ]" on top, marked as a sub tooltip', () => {
    const own = ownWith([{ objectId: 3, itemId: 503, count: 1 }], () => T0);
    const worn = { objectId: 44, itemId: 502, count: 1 };
    const art = { url: (key: string) => key } as never;
    const data = { texts: new Map([['TID_GAME_EQUIPED_ITEM', { id: 'TID_GAME_EQUIPED_ITEM', text: 'Equipped', color: 0 }]]), itemProps: new Map([[502, SUIT]]) };
    const subs = createComparison(document, art, data, [worn], (item) => ownTooltipContext(own, item, 'inventory'));
    expect(subs).toHaveLength(1);
    expect(subs[0]!.classList.contains('hud-item-tooltip-sub')).toBe(true);
    const lines = [...subs[0]!.querySelectorAll('.hud-item-tooltip-line')].map((line) => line.textContent);
    expect(lines.slice(0, 2)).toEqual(['[ Equipped ]', 'Cotton Suit']);
  });
});
