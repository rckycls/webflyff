// @vitest-environment jsdom
// custom (owner 2026-11-19): the Awaken window (items/awakenWindow.ts, docs/superpowers/specs/2026-11-19-awaken-window-design.md):
// its slots and their rules, the cost, the awakening panel, the Yes/No box with "Don't ask again", the packet and its lock.

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import type { ClientText } from '../src/world/gameData';
import { AWAKEN_COST, AwakenWindow } from '../src/world/items/awakenWindow';
import type { AwakenHost } from '../src/world/items/awakenWindow';
import { itemProp, newVagrant } from './helpers/ownState';

const NULL_ID = 0xffffffff;
const SWORD_AWAKENING = 0x08cfa184b0041400n; // STR +20, Attack Speed +15%, Max. HP +250 (itemTooltip.test.ts)
const PROPS = new Map<number, WebItemProp>([
  [600, itemProp({ id: 600, kind2: 7, kind3: 18, part: 2, name: 'Suit', icon: 'items/suit.png' })],
  [610, itemProp({ id: 610, kind2: 8, kind3: 0, part: 8, name: 'Cloth', icon: 'items/cloth.png' })],
  [500, itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10, name: 'Sword', icon: 'items/sword.png' })],
  [26461, itemProp({ id: 26461, kind2: 19, kind3: 0, part: -1, name: 'Scroll of Awakening', icon: 'items/awake.png' })],
  [26462, itemProp({ id: 26462, kind2: 19, kind3: 0, part: -1, name: 'Scroll of Reversion', icon: 'items/rev.png' })],
]);
const texts = new Map<string, ClientText>(Object.entries({
  TID_TOOLTIP_STR: 'STR', TID_TOOLTIP_ATKSPEED: 'Attack Speed', TID_TOOLTIP_MAXHP: 'Max. HP',
}).map(([id, text]) => [id, { id, text, color: 0xffffffff }]));

afterEach(() => document.body.replaceChildren());

function rig() {
  const own = newVagrant();
  own.gold = 1_000_000;
  own.inventory!.set(3, { objectId: 3, itemId: 600, count: 1 });
  own.inventory!.set(4, { objectId: 4, itemId: 610, count: 1 });
  own.inventory!.set(5, { objectId: 5, itemId: 26461, count: 2 });
  own.inventory!.set(6, { objectId: 6, itemId: 26462, count: 1 });
  own.inventory!.set(7, { objectId: 7, itemId: 500, count: 1, randomOption: SWORD_AWAKENING });
  const reserved = new Map<number, number>();
  const said: string[] = [];
  const sent: number[][] = [];
  let now = 1000;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: AwakenHost = {
    own: () => own, props: PROPS, texts, say: (tid) => void said.push(tid), sayText: (text) => void said.push(text),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    openBag: () => {},
    sendAwaken: (item, awake, reversion) => void sent.push([item, awake, reversion]),
    now: () => now,
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
  };
  const awaken = new AwakenWindow(host);
  const win = (): HTMLElement => layer.querySelector<HTMLElement>('.hud-awaken')!;
  const box = (): HTMLElement | null => {
    const found = layer.querySelector<HTMLElement>('.hud-awaken-confirm');
    return found !== null && found.closest('[hidden]') === null && !found.hidden ? found : null;
  };
  return {
    own, host, awaken, reserved, said, sent, layer, win, box,
    advance: (ms: number) => { now += ms; },
    control: (id: string) => win().querySelector<HTMLElement>(`[data-control="${id}"]`)!,
    press: () => win().querySelector<HTMLButtonElement>('[data-control="WIDC_AWAKEN"] button')!.click(),
    lines: () => [...win().querySelectorAll('[data-control="WIDC_LINES"] .hud-awaken-line')].map((line) => line.textContent),
    bagChanged: () => { own.inventoryRevision++; awaken.update(); },
  };
}

describe('AwakenWindow (custom 2026-11-19)', () => {
  it('opens empty: title Awaken, rows Item / Awakening / Reversion ->, money 0, an empty panel', () => {
    const r = rig();
    r.awaken.open();
    expect(r.awaken.isOpen).toBe(true);
    expect(r.win().querySelector('.hud-window-title')!.textContent).toBe('Awaken');
    expect(['WIDC_STATIC1', 'WIDC_STATIC2', 'WIDC_STATIC3'].map((id) => r.control(id).textContent))
      .toEqual(['Item', 'Awakening', 'Reversion ->']);
    expect(r.control('WIDC_STATIC9').textContent).toBe('0');
    expect(r.lines()).toEqual([]);
    expect(r.win().querySelector('[data-control="WIDC_AWAKEN"] button')!.textContent).toBe('Awaken');
  });

  it('take routes by kind: the item, then the Scroll of Awakening and the Reversion; scrolls wait for an item', () => {
    const r = rig();
    r.awaken.open();
    r.awaken.take(5); // a scroll before the item: nothing
    expect(r.reserved.size).toBe(0);
    r.awaken.take(3);
    r.awaken.take(5);
    r.awaken.take(6);
    expect([...r.reserved.keys()]).toEqual([3, 5, 6]);
    expect([...r.win().querySelectorAll<HTMLImageElement>('.hud-res-slot img')].map((img) => img.alt))
      .toEqual(['Suit', 'Scroll of Awakening', 'Scroll of Reversion']);
    // a new item empties the scrolls
    r.awaken.take(7);
    expect([...r.reserved.keys()]).toEqual([7]);
  });

  it('refuses a fashion item (Cannot be done.) and a worn one (unequip first)', () => {
    const r = rig();
    r.awaken.open();
    r.awaken.take(4);
    expect(r.said).toEqual(['TID_GAME_INVALID_TARGET_ITEM']);
    r.own.equipmentObjectIds.push(3);
    r.awaken.take(3);
    expect(r.said).toEqual(['TID_GAME_INVALID_TARGET_ITEM', 'TID_GAME_EQUIPPUT']);
    expect(r.reserved.size).toBe(0);
  });

  it('the cost 50,000 with an item in; the panel: Not awakened for the suit, the three lines for the sword', () => {
    const r = rig();
    r.awaken.open();
    r.awaken.take(3);
    expect(AWAKEN_COST).toBe(50000);
    expect(r.control('WIDC_STATIC9').textContent).toBe('50,000');
    expect(r.lines()).toEqual(['Not awakened']);
    r.awaken.take(7);
    expect(r.lines()).toEqual(['STR +20', 'Attack Speed +15%', 'Max. HP +250']);
  });

  it('Awaken asks first with the not-awakened text; Yes sends the item and the scroll, never the Reversion', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5, 6]) r.awaken.take(id);
    r.press();
    expect(r.sent).toEqual([]);
    expect(r.box()!.querySelector('[data-control="WIDC_TEXT1"]')!.textContent)
      .toBe('Awaken this item? It uses 1 Scroll of Awakening and 50,000 Penya.');
    const check = r.box()!.querySelector<HTMLElement>('[role="checkbox"]')!;
    expect(check.textContent).toBe("Don't ask again");
    expect(check.getAttribute('aria-checked')).toBe('false');
    r.box()!.querySelector<HTMLElement>('[data-control="WIDC_YES"]')!.click();
    expect(r.sent).toEqual([[3, 5, NULL_ID]]);
    expect(r.box()).toBeNull();
    expect(r.awaken.isOpen).toBe(true); // the window stays for the next roll
  });

  it('No sends nothing', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5]) r.awaken.take(id);
    r.press();
    r.box()!.querySelector<HTMLElement>('[data-control="WIDC_NO"]')!.click();
    expect(r.sent).toEqual([]);
    expect(r.box()).toBeNull();
  });

  it('an awakened sword needs the Reversion; with it the replace text, and the Reversion is sent', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [7, 5]) r.awaken.take(id);
    r.press();
    expect(r.said).toEqual(['TID_GAME_AWAKE_OR_BLESSEDNESS01']);
    expect(r.box()).toBeNull();
    r.awaken.take(6);
    r.press();
    expect(r.box()!.querySelector('[data-control="WIDC_TEXT1"]')!.textContent).toBe(
      "Replace this item's awakening? It uses 1 Scroll of Reversion, 1 Scroll of Awakening and 50,000 Penya. The current awakening is lost.");
    r.box()!.querySelector<HTMLElement>('[data-control="WIDC_YES"]')!.click();
    expect(r.sent).toEqual([[7, 5, 6]]);
  });

  it("Don't ask again ticked with Yes: the next Awaken sends at once; a reopened window asks again", () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5]) r.awaken.take(id);
    r.press();
    r.box()!.querySelector<HTMLElement>('[role="checkbox"]')!.click();
    expect(r.box()!.querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('true');
    r.box()!.querySelector<HTMLElement>('[data-control="WIDC_YES"]')!.click();
    r.own.inventory!.set(3, { objectId: 3, itemId: 600, count: 1, randomOption: SWORD_AWAKENING });
    r.own.inventory!.set(6, { objectId: 6, itemId: 26462, count: 1 });
    r.bagChanged(); // the answer: the suit awakened, which ends the lock
    r.awaken.take(6);
    r.press();
    expect(r.box()).toBeNull();
    expect(r.sent).toEqual([[3, 5, NULL_ID], [3, 5, 6]]);
    r.awaken.close();
    r.awaken.open();
    for (const id of [3, 5, 6]) r.awaken.take(id);
    r.advance(2000);
    r.awaken.update();
    r.press();
    expect(r.box()).not.toBeNull();
    expect(r.box()!.querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('locked after a send: another press sends nothing until the awakening changes or 2 s pass', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5]) r.awaken.take(id);
    r.press();
    r.box()!.querySelector<HTMLElement>('[role="checkbox"]')!.click();
    r.box()!.querySelector<HTMLElement>('[data-control="WIDC_YES"]')!.click();
    expect(r.sent).toHaveLength(1);
    const button = r.win().querySelector<HTMLButtonElement>('[data-control="WIDC_AWAKEN"] button')!;
    expect(button.disabled).toBe(true);
    r.press();
    expect(r.sent).toHaveLength(1);
    r.advance(1999);
    r.awaken.update();
    r.press();
    expect(r.sent).toHaveLength(1);
    r.advance(1);
    r.awaken.update();
    expect(button.disabled).toBe(false);
    r.press(); // the suit is still not awakened (no answer came): the same packet again
    expect(r.sent).toEqual([[3, 5, NULL_ID], [3, 5, NULL_ID]]);
  });

  it('missing pieces are said and nothing is sent: no item, no Scroll of Awakening, under 50,000 Penya', () => {
    const r = rig();
    r.awaken.open();
    r.press();
    r.awaken.take(3);
    r.press();
    r.awaken.take(5);
    r.own.gold = AWAKEN_COST - 1;
    r.press();
    expect(r.said).toEqual(['Put an item to awaken in the window.', 'Put a Scroll of Awakening in the window.', 'TID_GAME_LACKMONEY']);
    expect(r.sent).toEqual([]);
    expect(r.box()).toBeNull();
  });

  it('a scroll stack gone from the bag empties its slot and lets its hold go', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5, 6]) r.awaken.take(id);
    r.own.inventory!.delete(6);
    r.bagChanged();
    expect([...r.reserved.keys()]).toEqual([3, 5]);
    expect(r.control('WIDC_STATIC7').parentElement!.hasAttribute('data-filled')).toBe(false);
    r.own.inventory!.set(5, { objectId: 5, itemId: 26461, count: 1 }); // one used: the slot stays
    r.bagChanged();
    expect([...r.reserved.keys()]).toEqual([3, 5]);
  });

  it('closing lets every hold go and closes the box', () => {
    const r = rig();
    r.awaken.open();
    for (const id of [3, 5]) r.awaken.take(id);
    r.press();
    r.awaken.close();
    expect(r.reserved.size).toBe(0);
    expect(r.box()).toBeNull();
    expect(r.awaken.isOpen).toBe(false);
  });
});
