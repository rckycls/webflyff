// @vitest-environment jsdom
// The item NPC windows (2026-11-11, items/itemNpcWindows.ts; docs/superpowers/specs/2026-11-11-item-npc-windows-research.md):
// their slots, refusals, packets and answers, as Neuz runs them.

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp, WebUltimate } from '@flyffweb/formats';
import { ItemNpcWindows } from '../src/world/items/itemNpcWindows';
import type { NpcWindowHost, NpcWindowPacket } from '../src/world/items/npcWindowKit';
import { repairCost } from '../src/world/items/repairWindow';
import { itemProp, newVagrant } from './helpers/ownState';

const PROPS = new Map<number, WebItemProp>([
  [57, itemProp({ id: 57, kind1: 1, kind2: 2, kind3: 2, name: 'Blue Jade Sword', icon: 'items/jade.png', referStat1: 0, limitLevel: 75, endurance: 1000, cost: 5000 })],
  [58, itemProp({ id: 58, kind1: 1, kind2: 2, kind3: 2, name: 'Unique Sword', icon: 'items/uniq.png', referStat1: 1, limitLevel: 75 })],
  [20148, itemProp({ id: 20148, kind1: 1, kind2: 2, kind3: 2, name: "Lusaka's Sword", icon: 'items/lus.png', referStat1: 2, limitLevel: 75 })],
  [600, itemProp({ id: 600, kind1: 2, kind2: 7, kind3: 18, name: 'Suit', icon: 'items/suit.png', endurance: 500, cost: 999 })],
  [2034, itemProp({ id: 2034, kind2: 17, kind3: 119, name: 'Shining Oricalkum', icon: 'items/ori2.png' })],
  [2035, itemProp({ id: 2035, kind2: 17, kind3: 119, name: 'Sunstone', icon: 'items/sun.png' })],
  [2036, itemProp({ id: 2036, kind2: 17, kind3: 61, name: 'Moonstone', icon: 'items/moon.png' })],
  [2032, itemProp({ id: 2032, kind2: 17, kind3: 102, name: 'Ruby', icon: 'items/ruby.png' })],
  [2033, itemProp({ id: 2033, kind2: 17, kind3: 102, name: 'Topaz', icon: 'items/topaz.png' })],
  [2040, itemProp({ id: 2040, kind2: 17, kind3: 102, name: 'Ruby (HP)', icon: 'items/ruby01.png' })],
  [2045, itemProp({ id: 2045, kind2: 17, kind3: 102, name: 'Ruby (ATK)', icon: 'items/ruby02.png' })],
  [2800, itemProp({ id: 2800, kind1: 4, kind2: 14, kind3: 0, part: -1, name: 'Potion', icon: 'items/potion.png' })],
]);
const ULTIMATE: WebUltimate = {
  abilities: [{ dst: 35, jewels: [{ jewel: 2032, ability: 2040, values: [1] }] }, { dst: 83, jewels: [{ jewel: 2032, ability: 2045, values: [1] }] }],
  levelGems: [{ jewel: 2033, min: 60, max: 70 }, { jewel: 2032, min: 71, max: 85 }],
  descriptions: { mixJewel: 'Shining Oricalkum Creation', removeJewel: 'Ultimate Weapon Jewel Removal', changeUnique: 'Unique Weapon Conversion' },
};
const TEXTS: Record<string, string> = {
  TID_TOOLTIP_DST_HP_MAX: '#NAME?', TID_TOOLTIP_DST_ATKPOWER: '#NAME?', TID_TOOLTIP_DST_ADJDEF: '#NAME?',
  TID_TOOLTIP_DST_HP_MAX_ALT: '', TID_TOOLTIP_DEFENCE: 'Defense', TID_TOOLTIP_ATKPOWER: 'Attack',
  TID_GAME_CHANGEWEAPON_UNIQUE: 'Upgrade to a Unique Weapon', TID_GAME_CHANGEWEAPON_ULTIMATE: 'Upgrade to an Ultimate Weapon',
};

afterEach(() => document.body.replaceChildren());

function rig(mobile = false) {
  const own = newVagrant();
  own.gold = 10_000;
  const items: Array<[number, number, number, Record<string, unknown>?]> = [
    [3, 57, 1, { hitPoint: 400 }], [4, 58, 1, { abilityOption: 10 }], [5, 20148, 1, { ultimate: [2040, 2045, 0] }], [6, 600, 1, { resist: 1, resistOption: 3, piercing: [9001, 0] }],
    [7, 2034, 2], [8, 2035, 6], [9, 2036, 6], [10, 2032, 2], [11, 2033, 1], [12, 2800, 3], [13, 20148, 1],
  ];
  for (const [objectId, itemId, count, extra] of items) own.inventory!.set(objectId, { objectId, itemId, count, ...extra });
  const reserved = new Map<number, number>();
  const said: string[] = [], alerts: string[] = [], sent: NpcWindowPacket[] = [];
  let bagOpened = false, die = false;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: NpcWindowHost = {
    own: () => own, props: PROPS, ultimate: () => ULTIMATE, text: (tid) => TEXTS[tid] ?? tid,
    alert: (text) => void alerts.push(text), say: (tid) => void said.push(tid),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    dieFlag: (on) => { die = on; },
    send: (packet) => void sent.push(packet),
    mobile: () => mobile, bagOpen: () => bagOpened, openBag: () => { bagOpened = true; }, closeBag: () => { bagOpened = false; },
    bagRect: () => null,
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
  };
  let busy: string | null = null;
  const windows = new ItemNpcWindows(host, {
    cards: () => new Map([[9001, [{ dst: 1, adj: 3 }]]]), repairBusy: () => busy,
  });
  return { own, host, reserved, said, alerts, sent, layer, windows, bagOpened: () => bagOpened, die: () => die, setBusy: (tid: string | null) => { busy = tid; } };
}

const button = (root: ParentNode, cls: string, id: string) => root.querySelector<HTMLButtonElement>(`.${cls} [data-control="${id}"]`)!;

describe('Create Shining Oricalkum (CWndMixJewel)', () => {
  it('opens with the bag and its die flag; stones go to their rows; START sends the ten; success opens the confirm', () => {
    const r = rig();
    const mix = r.windows.jewels.mix;
    expect(mix.open()).toBe(true);
    expect(r.bagOpened()).toBe(true); // CreateApplet( APP_INVENTORY ) (WndWorld.cpp:4951)
    expect(r.die()).toBe(true);
    expect(r.layer.querySelector('.hud-mix-jewel .hud-window-title')!.textContent).toBe('Sunstone & Moonstone Use.');
    expect(r.windows.take(12)).toBe('refused'); // a potion: TID_SBEVE_NOTUSEITEM
    expect(r.windows.take(8)).toBe('taken');
    expect(mix.state.slots.slice(0, 5)).toEqual([8, null, null, null, null]);
    mix.drop(5, 9, true); // a Moonstone with Shift fills its row
    expect(mix.state.slots.slice(5)).toEqual([9, 9, 9, 9, 9]);
    mix.drop(6, 8, false); // a Sunstone on the Moonstones' row: ignored
    for (let i = 1; i < 5; i++) mix.drop(i, 8, false);
    expect(r.reserved.get(8)).toBe(5);
    expect(button(r.layer, 'hud-mix-jewel', 'WIDC_START').disabled).toBe(false);
    button(r.layer, 'hud-mix-jewel', 'WIDC_START').click();
    expect(r.sent).toEqual([{ type: 'makeItem', itemIds: [8, 8, 8, 8, 8, 9, 9, 9, 9, 9] }]);
    expect(button(r.layer, 'hud-mix-jewel', 'WIDC_START').disabled).toBe(true);
    r.windows.onUltimate({ state: 1, result: 0 });
    expect(r.reserved.size).toBe(0);
    expect(r.layer.querySelector<HTMLElement>('.hud-mix-jewel-confirm')!.hidden).toBe(false);
    expect(r.layer.querySelector('.hud-mix-jewel-confirm')!.textContent).toContain('TID_GAME_MIXJEWEL_SUCCESS');
  });

  it('a stack held whole says "Too many Gems."; a full bag says so; a failure closes it', () => {
    const r = rig();
    const mix = r.windows.jewels.mix;
    mix.open();
    r.own.inventory!.set(11, { objectId: 11, itemId: 2035, count: 1 });
    mix.drop(0, 11, false);
    mix.drop(1, 11, false);
    expect(r.alerts).toEqual(['TID_GAME_SUMMONANGEL_ERROR1']);
    r.windows.onUltimate({ state: 1, result: 4 });
    expect(r.alerts.at(-1)).toBe('TID_GAME_EXTRACTION_ERROR');
    expect(mix.isOpen).toBe(true);
    r.windows.onUltimate({ state: 1, result: 1 });
    expect(mix.isOpen).toBe(false);
    expect(r.die()).toBe(false);
  });
});

describe('Create Unique / Ultimate Weapon (CWndChangeWeapon)', () => {
  it('Unique: a general weapon of 60+, Shining Oricalkum, its level’s jewel; START sends weapon, jewel, Oricalkum', () => {
    const r = rig();
    const change = r.windows.jewels.change;
    expect(change.openAs('unique')).toBe(true);
    expect(r.layer.querySelector('.hud-change-weapon .hud-window-title')!.textContent).toBe('Upgrade to a Unique Weapon');
    expect(change.openAs('ultimate')).toBe(false); // either type open: TID_GAME_CHANGE_NOWUSING
    expect(r.said).toEqual(['TID_GAME_CHANGE_NOWUSING']);
    expect(r.windows.take(12)).toBe('pass'); // a potion is used as it would be
    r.windows.take(10); // a jewel before the weapon: ignored
    r.windows.take(4); // a unique sword in the Unique window: ignored
    expect(change.state.slots).toEqual([null, null, null]);
    r.windows.take(3);
    r.windows.take(11); // Topaz is 60-70; a level 75 sword takes a Ruby
    r.windows.take(10);
    r.windows.take(7);
    expect(change.state.slots).toEqual([3, 7, 10]);
    button(r.layer, 'hud-change-weapon', 'WIDC_START').click();
    expect(r.sent).toEqual([{ type: 'transWeapon', weaponId: 3, gem1Id: 10, gem2Id: 7 }]);
    r.windows.onUltimate({ state: 2, result: 1 });
    expect(r.alerts).toEqual(['TID_GAME_CGWEAPON_FAILED']);
    expect(change.state.slots).toEqual([null, null, null]);
    expect(r.reserved.size).toBe(0);
    r.windows.onUltimate({ state: 2, result: 2 }); // cancel closes it
    expect(change.isOpen).toBe(false);
  });

  it('Ultimate: a unique weapon at +10 or more; the bag closing leaves it open', () => {
    const r = rig();
    const change = r.windows.jewels.change;
    change.openAs('ultimate');
    r.windows.take(3); // a general sword: ignored
    r.windows.take(4);
    expect(change.state.slots[0]).toBe(4);
    r.windows.bagClosed();
    expect(change.isOpen).toBe(true);
    r.windows.dismiss();
    expect(change.isOpen).toBe(false);
  });
});

describe('Remove Jewel (CWndRemoveJewel)', () => {
  it('an Ultimate weapon with sockets and a Moonstone; the jewels and their stats; START sends and closes', () => {
    const r = rig();
    const remove = r.windows.jewels.removeJewel;
    remove.open();
    r.windows.take(10); // a Ruby is a material but not a Moonstone
    expect(r.said).toEqual(['TID_GAME_REMOVE_JEWEL_ERROR1']);
    r.windows.take(9);
    r.own.inventory!.set(13, { objectId: 13, itemId: 20148, count: 1 }); // no socket open
    r.windows.take(13);
    expect(r.said.at(-1)).toBe('TID_GAME_REMOVE_JEWEL_ERROR2');
    r.windows.take(5);
    expect(remove.state).toEqual({ weapon: 5, moonstone: 9 });
    const window = r.layer.querySelector<HTMLElement>('.hud-remove-jewel')!;
    // the families' names; "#NAME?" in the English texts is the DST's name instead
    const stats = [...window.querySelectorAll('.hud-remove-jewel-stat')].map((s) => s.textContent);
    expect(stats[0]).not.toBe('#NAME?');
    expect(stats[0]!.length).toBeGreaterThan(0);
    expect(stats[2]).toBe('');
    button(r.layer, 'hud-remove-jewel', 'WIDC_START').click();
    expect(r.sent).toEqual([{ type: 'removeGem', weaponId: 5, gemId: 9 }]);
    expect(remove.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
  });
});

describe('Remove Element upgrading (CWndRemoveAttribute)', () => {
  it('an item with an element upgrade; START asks; YES sends; TRUE says so and closes both', () => {
    const r = rig();
    const remove = r.windows.removeAttribute;
    remove.open();
    r.windows.take(3); // a sword with no element upgrade: a box
    expect(r.alerts).toEqual(['TID_GAME_REMOVE_ERROR']);
    expect(r.windows.take(12)).toBe('pass');
    r.windows.take(6);
    expect(remove.state.item).toBe(6);
    button(r.layer, 'hud-remove-attribute', 'WIDC_START').click();
    expect(remove.state.confirmOpen).toBe(true);
    expect(r.layer.querySelector('.hud-remove-attribute-confirm')!.textContent).toContain('TID_GAME_REMOVE_ATTRIBUTE');
    button(r.layer, 'hud-remove-attribute-confirm', 'WIDC_YES').click();
    expect(r.sent).toEqual([{ type: 'removeAttribute', itemId: 6 }]);
    expect(remove.state.confirmOpen).toBe(true); // the box stays
    remove.onResult(true);
    expect(r.alerts.at(-1)).toBe('TID_GAME_REMOVE_ATTRIBUTE_CONFIRM');
    expect(remove.isOpen).toBe(false);
    expect(remove.state.confirmOpen).toBe(false);
  });
});

describe('Remove a Pierced Card (CWndRemovePiercing)', () => {
  it('a pierced item with a card; its cards’ stats; START sends and closes', () => {
    const r = rig();
    const remove = r.windows.removePiercing;
    remove.open();
    r.windows.take(3); // a sword with no card
    expect(r.said).toEqual(['TID_GAME_REMOVE_PIERCING_ERROR_EX']);
    r.windows.take(6);
    const window = r.layer.querySelector<HTMLElement>('.hud-remove-piercing')!;
    expect(window.querySelector('[data-control="WIDC_STATIC_PIERCING1"]')!.textContent).toContain('+3');
    // a suit has four sockets: rows 5-10 red
    expect(window.querySelectorAll('[data-unused]')).toHaveLength(6);
    button(r.layer, 'hud-remove-piercing', 'WIDC_START').click();
    expect(r.sent).toEqual([{ type: 'piercingRemove', itemId: 6 }]);
    expect(remove.isOpen).toBe(false);
  });
});

describe('the Repair window (CWndRepairItem)', () => {
  it('the cost formula: the endurance lost in percent times dwCost / 1000 + 1 (WndRepairItem.cpp:139-140)', () => {
    expect(repairCost(400, 1000, 5000)).toBe(60 * 6);
    expect(repairCost(-1, 1000, 999)).toBe(100);
  });

  it('refused while busy; a worn item adds its cost; refusals; OK sends the worn ones; moving closes it and the bag', () => {
    const r = rig();
    const repair = r.windows.repair;
    r.setBusy('TID_GAME_REPAIR_TAKEBANK');
    expect(repair.open()).toBe(false);
    expect(r.said).toEqual(['TID_GAME_REPAIR_TAKEBANK']);
    r.setBusy(null);
    expect(repair.open()).toBe(true);
    expect(r.bagOpened()).toBe(true);
    expect(repair.open()).toBe(false);
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_STILL');
    expect(r.windows.take(3)).toBe('taken'); // the double-click: TID_GAME_REPAIR_NOTUSE
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_NOTUSE');
    repair.drop(0, 12); // a potion
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_DONOT');
    repair.drop(0, 6); // the suit has no hit point lost... it has none at all: 0 of 500
    expect(repair.state.cells[0]).toBe(6);
    expect(repair.state.cost).toBe(100 * 1);
    repair.drop(1, 3);
    expect(repair.state.cost).toBe(100 + 60 * 6);
    expect(r.layer.querySelector('.hud-repair [data-control="WIDC_STATIC3"]')!.textContent).toBe('460');
    r.own.equipmentObjectIds[0] = 13;
    repair.drop(2, 13);
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_EQUIP');
    button(r.layer, 'hud-repair', 'WIDC_OK').click();
    expect(r.sent).toEqual([{ type: 'repair', objectIds: [6, 3] }]);
    expect(repair.isOpen).toBe(true); // OK leaves it open
    r.windows.dismiss();
    expect(repair.isOpen).toBe(false);
    expect(r.bagOpened()).toBe(false);
    expect(r.reserved.size).toBe(0);
  });

  it('not enough Penya, full endurance, and nothing left to repair', () => {
    const r = rig();
    const repair = r.windows.repair;
    repair.open();
    r.own.gold = 100;
    repair.drop(0, 3);
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_NOTENOUGHPENYA');
    r.own.inventory!.set(3, { ...r.own.inventory!.get(3)!, hitPoint: 1000 });
    repair.drop(0, 3);
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_FULLENDURANCE');
    r.own.gold = 10_000;
    repair.drop(0, 6);
    r.own.inventory!.set(6, { ...r.own.inventory!.get(6)!, hitPoint: 500 }); // repaired meanwhile
    button(r.layer, 'hud-repair', 'WIDC_OK').click();
    expect(r.said.at(-1)).toBe('TID_GAME_REPAIR_NO');
    expect(r.sent).toEqual([]);
  });

  it('a phone taps an item into the first empty cell', () => {
    const r = rig(true);
    r.windows.repair.open();
    expect(r.windows.tapItem(6)).toBe('taken');
    expect(r.windows.repair.state.cells[0]).toBe(6);
  });
});

describe('the GM ResistItem window (CWndUpgradeBase, APP_TEST)', () => {
  it('opens with the bag; its first slot takes armour or a weapon by a drop, not a worn one; a premium element is refused', () => {
    const r = rig();
    const resist = r.windows.resistItem;
    expect(resist.slot).toBeNull();
    resist.open();
    expect(r.layer.querySelector('.hud-resist-item .hud-window-title')!.textContent).toBe('Upgrade');
    expect(r.windows.take(3)).toBe('pass'); // the double-click goes nowhere near it
    resist.drop(12); // a potion: ignored
    expect(resist.slot).toBeNull();
    r.own.inventory!.set(13, { objectId: 13, itemId: 20148, count: 1, resistSMItemId: 26453 });
    resist.drop(13);
    expect(r.alerts).toEqual(['TID_GAME_NOTUPGRADE']);
    r.own.equipmentObjectIds[0] = 4;
    resist.drop(4);
    expect(r.said).toEqual(['TID_GAME_EQUIPPUT']);
    resist.drop(3);
    expect(resist.slot).toBe(3);
    expect(r.reserved.get(3)).toBe(1);
    r.windows.bagClosed();
    expect(resist.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
  });
});
