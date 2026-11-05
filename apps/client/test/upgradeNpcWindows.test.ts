// @vitest-environment jsdom
// The Upgrade Specialist's Piercing and Safe Upgrade windows (2026-11-05, items/upgradeNpcWindows.ts): their slots and
// rows, the packets, and the safe upgrade's 2 s run and its answers.

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { PiercingWindow, SmeltSafetyWindow, isPierceAble } from '../src/world/items/upgradeNpcWindows';
import type { UpgradeNpcHost } from '../src/world/items/upgradeNpcWindows';
import { itemProp, newVagrant } from './helpers/ownState';

const NULL_ID = 0xffffffff;
const PROPS = new Map<number, WebItemProp>([
  [600, itemProp({ id: 600, kind2: 7, kind3: 18, part: 2, name: 'Suit', icon: 'items/suit.png' })],
  [500, itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10, name: 'Sword', icon: 'items/sword.png' })],
  [2035, itemProp({ id: 2035, kind2: 19, kind3: 0, part: -1, name: 'Sunstone', icon: 'items/sun.png' })],
  [2036, itemProp({ id: 2036, kind2: 19, kind3: 0, part: -1, name: 'Moonstone', icon: 'items/moon.png' })],
  [10464, itemProp({ id: 10464, kind2: 19, kind3: 0, part: -1, name: 'Scroll of SProtect', icon: 'items/sprot.png' })],
  [10465, itemProp({ id: 10465, kind2: 19, kind3: 0, part: -1, name: 'Scroll of GProtect', icon: 'items/gprot.png' })],
  [10468, itemProp({ id: 10468, kind2: 19, kind3: 0, part: -1, name: 'Scroll of Smelting', icon: 'items/smelt.png' })],
  [2800, itemProp({ id: 2800, kind2: 14, kind3: 0, part: -1, name: 'Potion' })],
]);

afterEach(() => document.body.replaceChildren());

function rig() {
  const own = newVagrant();
  own.gold = 1_000_000;
  [[3, 600, 1], [4, 500, 1], [5, 2035, 5], [6, 2036, 3], [7, 10464, 2], [8, 10465, 2], [9, 10468, 1], [10, 2800, 3]]
    .forEach(([objectId, itemId, count]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: count! }));
  const reserved = new Map<number, number>();
  const said: string[] = [];
  const sent: unknown[][] = [];
  const asked: Array<{ tid: string; ok: () => void }> = [];
  let now = 1000, die = false, effect = false;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: UpgradeNpcHost = {
    own: () => own, props: PROPS, text: (tid) => tid, say: (tid) => void said.push(tid),
    ask: (tid, ok) => void asked.push({ tid, ok }),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    dieFlag: (on) => { die = on; }, openBag: () => {}, effect: (on) => { effect = on; },
    sendPiercingSize: (...args) => void sent.push(['piercingSize', ...args]),
    sendSmeltSafety: (...args) => void sent.push(['smeltSafety', ...args]),
    now: () => now,
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
  };
  return {
    own, host, reserved, said, sent, asked, layer, die: () => die, effect: () => effect,
    advance: (ms: number) => { now += ms; },
  };
}

describe('isPierceAble (Item.cpp:694-741)', () => {
  it('a suit to 4 sockets, a weapon or a shield to 10, nothing else', () => {
    expect(isPierceAble(PROPS.get(600)!, 3, true)).toBe(true);
    expect(isPierceAble(PROPS.get(600)!, 4, true)).toBe(false);
    expect(isPierceAble(PROPS.get(500)!, 9, true)).toBe(true);
    expect(isPierceAble(PROPS.get(2800)!, 0, true)).toBe(false);
  });
});

describe('PiercingWindow (CWndPiercing)', () => {
  it('the item, a Moonstone and a GProtect in their slots, the cost; OK asks, then PIERCING_SIZE, and it closes', () => {
    const r = rig();
    const piercing = new PiercingWindow(r.host);
    piercing.open();
    expect(r.effect()).toBe(true);
    const window = r.layer.querySelector<HTMLElement>('.hud-piercing')!;
    expect(window.querySelector('.hud-window-title')!.textContent).toBe('Piercing');
    piercing.take(6); // a Moonstone before the item: nothing
    expect(r.reserved.size).toBe(0);
    piercing.take(10); // a potion cannot be pierced
    expect(r.said).toEqual(['TID_PIERCING_POSSIBLE']);
    piercing.take(3);
    piercing.take(6);
    expect([...r.reserved.keys()]).toEqual([3, 6]);
    expect(window.querySelector('[data-control="WIDC_STATIC9"]')!.textContent).toBe('100,000');
    expect([...window.querySelectorAll<HTMLImageElement>('.hud-res-slot img')].map((img) => img.alt)).toEqual(['Suit', 'Moonstone']);
    window.querySelector<HTMLElement>('[data-control="WIDC_OK"]')!.click();
    expect(r.asked.map((a) => a.tid)).toEqual(['TID_PIERCING_ERROR_NOTICE']);
    r.asked[0]!.ok();
    expect(r.sent).toEqual([['piercingSize', 3, 6, NULL_ID]]);
    expect(piercing.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
    expect(r.effect()).toBe(false);
  });

  it('a worn item is refused; a drop on the Moonstone slot takes only a Moonstone', () => {
    const r = rig();
    r.own.equipmentObjectIds[2] = 3;
    const piercing = new PiercingWindow(r.host);
    piercing.open();
    piercing.take(3);
    expect(r.said).toEqual(['TID_GAME_EQUIPPUT']);
    piercing.take(4);
    piercing.takeAt(1, 7);
    expect(r.said).toEqual(['TID_GAME_EQUIPPUT', 'TID_SBEVE_NOTUSEITEM']);
    piercing.takeAt(2, 8);
    piercing.takeAt(1, 6);
    r.layer.querySelector<HTMLElement>('.hud-piercing [data-control="WIDC_OK"]')!.click();
    r.asked[0]!.ok();
    expect(r.sent).toEqual([['piercingSize', 4, 6, 8]]);
  });
});

describe('SmeltSafetyWindow (CWndSmeltSafety)', () => {
  it('Safe Upgrade: the target, the rows filled a piece at a time, START sends a row 2 s on; the answer moves the row on', () => {
    const r = rig();
    const safety = new SmeltSafetyWindow(r.host);
    safety.open('normal');
    expect(r.die()).toBe(true);
    const window = r.layer.querySelector<HTMLElement>('.hud-smelt-safety')!;
    expect(window.querySelector('.hud-window-title')!.textContent).toBe('TID_GAME_SMELTSAFETY_NORMAL');
    expect(window.style.width).toBe('336px'); // NORMAL is 32 px wider, for the smelting column
    safety.take(5); // a Sunstone is not a target
    expect(r.said).toEqual(['TID_GAME_SMELT_SAFETY_ERROR01']);
    safety.take(4);
    expect(window.querySelector('[data-control="WIDC_NOW_GRADE"]')!.textContent).toBe('0');
    expect(window.querySelector<HTMLInputElement>('input')!.value).toBe('10');
    safety.take(7); // SProtect before a Sunstone: "Missing reagent: Sunstone."
    expect(r.said.at(-1)).toBe('TID_GAME_SMELT_SAFETY_ERROR03');
    safety.take(5);
    safety.take(5);
    safety.take(7);
    safety.take(9);
    expect(r.reserved.get(5)).toBe(2);
    expect([r.reserved.get(7), r.reserved.get(9)]).toEqual([1, 1]);
    window.querySelector<HTMLElement>('[data-control="WIDC_BUTTON_START"]')!.click();
    safety.step();
    expect(r.sent).toEqual([]);
    r.advance(2001);
    safety.step();
    expect(r.sent).toEqual([['smeltSafety', 4, 5, 7, 9]]);
    expect(r.reserved.get(5)).toBe(1);
    expect(r.reserved.has(7)).toBe(false);
    r.own.inventory!.set(4, { ...r.own.inventory!.get(4)!, abilityOption: 1 });
    safety.onResult(1);
    expect(window.querySelector<HTMLElement>('[data-control="RESULT0"]')!.dataset.result).toBe('success');
    expect(window.querySelector('[data-control="WIDC_NOW_GRADE"]')!.textContent).toBe('1');
    // no SProtect for the second row: the run stops itself
    r.advance(2001);
    safety.step();
    expect(r.sent).toHaveLength(1);
    window.querySelector<HTMLElement>('[data-control="WIDC_BUTTON_START"]')!.click();
    expect(r.said.at(-1)).toBe('TID_GAME_SMELT_SAFETY_ERROR08');
    safety.close();
    expect(r.reserved.size).toBe(0);
    expect(r.die()).toBe(false);
  });

  it('Shift fills a column from the stack (the materials to 10, the scrolls to the materials) and empties the unused (2026-11-05)', () => {
    const r = rig();
    const safety = new SmeltSafetyWindow(r.host);
    safety.open('normal');
    safety.take(4);
    safety.take(5, true); // five Sunstones: five rows
    expect(r.reserved.get(5)).toBe(5);
    safety.take(7, true); // two SProtects for five rows: two
    expect(r.reserved.get(7)).toBe(2);
    safety.take(5, true); // no Sunstone left: nothing
    expect(r.reserved.get(5)).toBe(5);
    const window = r.layer.querySelector<HTMLElement>('.hud-smelt-safety')!;
    const dblclick = (control: string, shiftKey: boolean): void => {
      window.querySelector(`[data-control="${control}"]`)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, shiftKey }));
    };
    dblclick('MATERIAL3', false); // one out: four rows
    expect(r.reserved.get(5)).toBe(4);
    dblclick('MATERIAL0', true); // every unused material out, the scrolls trimmed with them
    expect(r.reserved.has(5)).toBe(false);
    expect(r.reserved.has(7)).toBe(false);
  });

  it('Safe Piercing: Moonstone and GProtect, no smelting column; START with too little gold is refused', () => {
    const r = rig();
    const safety = new SmeltSafetyWindow(r.host);
    safety.open('piercing');
    const window = r.layer.querySelector<HTMLElement>('.hud-smelt-safety')!;
    expect(window.style.width).toBe('304px');
    expect(window.querySelector('[data-control="SCROLL2_0"]')).toBeNull();
    // its placeholder icons show before a target, at alpha 75
    expect(window.querySelector<HTMLElement>('[data-control="MATERIAL0"]')!.querySelector<HTMLElement>('.hud-res-slot')!.style.opacity)
      .toBe(String(75 / 255));
    safety.take(4); // the sword: up to 10 sockets
    expect(window.querySelector<HTMLInputElement>('input')!.value).toBe('10');
    safety.take(6);
    safety.take(8);
    r.own.gold = 50_000;
    window.querySelector<HTMLElement>('[data-control="WIDC_BUTTON_START"]')!.click();
    expect(r.said).toEqual(['TID_GAME_LACKMONEY']);
    r.own.gold = 500_000;
    window.querySelector<HTMLElement>('[data-control="WIDC_BUTTON_START"]')!.click();
    r.advance(2001);
    safety.step();
    expect(r.sent).toEqual([['smeltSafety', 4, 6, 8, NULL_ID]]);
    // a refusal (0) changes nothing: the run waits for STOP
    safety.onResult(0);
    expect(window.querySelector<HTMLElement>('[data-control="RESULT0"]')!.dataset.result).toBe('');
  });
});
