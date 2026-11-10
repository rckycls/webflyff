// @vitest-environment jsdom
// The Summon Angel window (2026-11-10, world/angel/summonAngelWindow.ts): CWndSummonAngel's layout, slots, rates, START and
// its let-go (docs/superpowers/specs/2026-11-10-summon-angel-research.md §2-§4).

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { SummonAngelWindow } from '../src/world/angel/summonAngelWindow';
import type { SummonAngelHost } from '../src/world/angel/summonAngelWindow';
import { itemProp, newVagrant } from './helpers/ownState';

const PROPS = new Map<number, WebItemProp>([
  [2035, itemProp({ id: 2035, kind2: 17, name: 'Sunstone', icon: 'items/sun.png' })],
  [2036, itemProp({ id: 2036, kind2: 17, name: 'Moonstone', icon: 'items/moon.png' })],
  [500, itemProp({ id: 500, kind1: 1, name: 'Sword', icon: 'items/sword.png' })],
]);
const TEXTS: Record<string, string> = {
  TID_GAME_REDANGEL_RATE: 'Red Angel', TID_GAME_BLUEANGEL_RATE: 'Blue Angel', TID_GAME_GREENANGEL_RATE: 'Green Angel',
  TID_GAME_WHITEANGEL_INFO1: 'With a white Angel,', TID_GAME_SUMMONANGEL_ERROR1: 'Too many Gems.',
  TID_GAME_SUMMONANGEL_ERROR2: 'You need at least 3 Sunstones and 3 Moonstones to summon an Angel.',
};

afterEach(() => document.body.replaceChildren());

function rig(options: { mobile?: boolean; bag?: { x: number; y: number; width: number } | null } = {}) {
  const own = newVagrant();
  [[3, 2035, 4], [4, 2036, 2], [5, 500, 1]]
    .forEach(([objectId, itemId, count]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: count! }));
  const reserved = new Map<number, number>();
  const alerts: string[] = [], sent: string[] = [];
  let die = false, bag = false;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: SummonAngelHost = {
    own: () => own, props: PROPS, text: (tid) => TEXTS[tid] ?? tid,
    questText: () => '#b#cff0000ff Confession#nb#nc\r\nYou need the power of Angel for your confession.',
    alert: (text) => void alerts.push(text),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    dieFlag: (on) => { die = on; },
    sendCreateAngel: (text) => void sent.push(text),
    openBag: () => { bag = true; }, closeBag: () => { bag = false; },
    bagRect: () => (options.bag === undefined ? { x: 600, y: 40, width: 200 } : options.bag),
    mobile: () => options.mobile === true,
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
  };
  return { own, reserved, alerts, sent, layer, window: new SummonAngelWindow(host), die: () => die, bag: () => bag };
}

const el = (root: ParentNode, selector: string) => root.querySelector<HTMLElement>(selector)!;
const rate = (root: ParentNode, id: string) => el(root, `[data-control="${id}"] .hud-res-static-text`).textContent;
const dragDrop = (target: HTMLElement, objectId: number, shiftKey = false) => {
  const data = new Map([['application/x-flyff-inventory', String(objectId)]]);
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { types: [...data.keys()], getData: (t: string) => data.get(t) ?? '' } });
  Object.defineProperty(event, 'shiftKey', { value: shiftKey });
  target.dispatchEvent(event);
};

describe('the Summon Angel window (CWndSummonAngel)', () => {
  it('opens the bag and itself beside it, "Angel Window" with its text, the rates 100 / 0 / 0 and the die flag on', () => {
    const r = rig();
    r.window.open();
    const frame = el(r.layer, '.hud-summon-angel');
    expect(frame.querySelector('.hud-window-title')!.textContent).toBe('Angel Window');
    expect(frame.textContent).toContain('You need the power of Angel for your confession.');
    expect(frame.textContent).toContain('Red Angel');
    expect(frame.querySelectorAll('[data-angel-slot]')).toHaveLength(20);
    expect([rate(frame, 'WIDC_STATIC_RED'), rate(frame, 'WIDC_STATIC_BLUE'), rate(frame, 'WIDC_STATIC_GREEN')]).toEqual(['100.0', '0.0', '0.0']);
    expect(r.bag()).toBe(true);
    expect(r.die()).toBe(true);
    // the bag's left edge (600) is past half the window's width (232): the window goes at its left
    expect(frame.style.left).toBe('136px');
  });

  it('the bag\'s double-click puts a stone in the first empty slot of its row; other items are not taken', () => {
    const r = rig();
    r.window.open();
    expect(r.window.take(3)).toBe(true);
    expect(r.window.take(4)).toBe(true);
    expect(r.window.take(5)).toBe(false); // the bag refuses it as a use (TID_GAME_TRADELIMITUSING)
    expect(r.window.slotIds[0]).toBe(3);
    expect(r.window.slotIds[10]).toBe(4);
    expect(r.reserved.get(3)).toBe(1);
    const frame = el(r.layer, '.hud-summon-angel');
    expect([rate(frame, 'WIDC_STATIC_RED'), rate(frame, 'WIDC_STATIC_BLUE'), rate(frame, 'WIDC_STATIC_GREEN')]).toEqual(['94.0', '4.0', '2.0']);
    expect(el(frame, '[data-angel-slot="0"]').hasAttribute('data-filled')).toBe(true);
    expect(el(frame, '[data-angel-slot="0"] img').getAttribute('src')).toBe('/assets/items/sun.png');
  });

  it('a stack with no free piece is not taken by the double-click, and a drop says "Too many Gems."', () => {
    const r = rig();
    r.window.open();
    r.window.take(4);
    r.window.take(4);
    expect(r.window.take(4)).toBe(false);
    dragDrop(el(r.layer, '[data-angel-slot="15"]'), 4);
    expect(r.alerts).toEqual(['Too many Gems.']);
  });

  it('a drop puts one piece in that slot; Shift fills the row; the other row takes nothing', () => {
    const r = rig();
    r.window.open();
    dragDrop(el(r.layer, '[data-angel-slot="3"]'), 3);
    expect(r.window.slotIds[3]).toBe(3);
    dragDrop(el(r.layer, '[data-angel-slot="12"]'), 3);
    expect(r.window.slotIds[12]).toBeNull();
    dragDrop(el(r.layer, '[data-angel-slot="7"]'), 3, true);
    expect(r.window.slotIds.slice(0, 10)).toEqual([3, 3, 3, 3, null, null, null, null, null, null]);
    expect(r.reserved.get(3)).toBe(4);
  });

  it('a slot\'s double-click takes its piece out; on a phone a tap does', () => {
    const r = rig();
    r.window.open();
    r.window.take(3);
    el(r.layer, '[data-angel-slot="0"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(r.window.slotIds[0]).toBeNull();
    expect(r.reserved.get(3)).toBeUndefined();
    const phone = rig({ mobile: true });
    phone.window.open();
    phone.window.tapItem(4);
    el(phone.layer, '[data-angel-slot="10"]').click();
    expect(phone.window.slotIds[10]).toBeNull();
  });

  it('START with fewer than 3 stones says ERROR2; with 3 sends CREATEANGEL once and lets everything go', () => {
    const r = rig();
    r.window.open();
    r.window.take(3);
    r.window.take(4);
    el(r.layer, '[data-control="WIDC_START"]').click();
    expect(r.alerts).toEqual(['You need at least 3 Sunstones and 3 Moonstones to summon an Angel.']);
    r.window.take(3);
    el(r.layer, '[data-control="WIDC_START"]').click();
    expect(r.sent).toEqual(['3D2DD4D1DD']);
    expect(r.window.slotIds.every((id) => id === null)).toBe(true);
    expect(r.reserved.size).toBe(0);
    expect(r.window.isOpen).toBe(true); // Neuz keeps it open for another summon
  });

  it('RESET lets everything go; CANCEL closes, lets go and turns the die flag off; a move closes the bag too', () => {
    const r = rig();
    r.window.open();
    r.window.take(3);
    el(r.layer, '[data-control="WIDC_RESET"]').click();
    expect(r.window.slotIds[0]).toBeNull();
    r.window.take(3);
    el(r.layer, '[data-control="WIDC_CANCEL"]').click();
    expect(r.window.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
    expect(r.die()).toBe(false);
    expect(r.bag()).toBe(true);
    r.window.open();
    r.window.dismiss();
    expect(r.window.isOpen).toBe(false);
    expect(r.bag()).toBe(false);
  });
});
