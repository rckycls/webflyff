// @vitest-environment jsdom
// The jewel windows (2026-11-10, items/jewelWindows.ts): Create Jewels (CWndExtraction) and Jewel Setting (CWndSmeltJewel),
// their slots, refusals, packets and answers (docs/superpowers/specs/2026-11-10-jewels-research.md §2-§3).

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp, WebUltimate } from '@flyffweb/formats';
import { JewelWindows } from '../src/world/items/jewelWindows';
import type { JewelHost } from '../src/world/items/jewelWindows';
import { itemProp, newVagrant } from './helpers/ownState';

const PROPS = new Map<number, WebItemProp>([
  [500, itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, name: 'Historic Sword', icon: 'items/sword.png', referStat1: 0, limitLevel: 75 })],
  [501, itemProp({ id: 501, kind1: 1, kind2: 2, kind3: 3, name: 'Low Sword', icon: 'items/low.png', referStat1: 0, limitLevel: 30 })],
  [502, itemProp({ id: 502, kind1: 1, kind2: 2, kind3: 3, name: 'Ultimate Sword', icon: 'items/ult.png', referStat1: 2, limitLevel: 75 })],
  [2032, itemProp({ id: 2032, kind2: 19, name: 'Ruby', icon: 'items/ruby.png' })],
  [2045, itemProp({ id: 2045, kind2: 19, name: 'Ruby (ATK)', icon: 'items/ruby02.png' })],
  [2036, itemProp({ id: 2036, kind2: 19, name: 'Moonstone', icon: 'items/moon.png' })],
]);
const ULTIMATE: WebUltimate = {
  abilities: [], levelGems: [{ jewel: 2032, min: 71, max: 85 }],
  descriptions: { jewel: '#b#cff0000ff Jewel Composing #nb#nc\r\nJewel setting is possible.', extraction: 'Create Jewel' },
};
const TEXTS: Record<string, string> = {
  TID_GAME_EXTRACTION_SUCCESS: 'You have created %s %d.', TID_GAME_EXTRACTION_FAILED: 'Jewel creation failed.',
  TID_GAME_EXTRACTION_ERROR: 'You have no space in your inventory. Please make space and try again!',
  TID_GAME_SMELTJEWEL_SUCCESS: 'Jewel creation succeeded!', TID_GAME_SMELTJEWEL_FAIL: 'Jewel creation failed!',
};

afterEach(() => document.body.replaceChildren());

function rig(mobile = false) {
  const own = newVagrant();
  [[3, 500, 1], [4, 501, 1], [5, 502, 1], [6, 2032, 3], [7, 2036, 2]]
    .forEach(([objectId, itemId, count]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: count! }));
  own.inventory!.set(5, { objectId: 5, itemId: 502, count: 1, abilityOption: 8, ultimate: [2045, 0, 0] });
  const reserved = new Map<number, number>();
  const said: string[] = [], alerts: string[] = [], sounds: Array<string | number> = [], sent: unknown[][] = [];
  let bagOpened = false;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: JewelHost = {
    own: () => own, props: PROPS, ultimate: () => ULTIMATE, text: (tid) => TEXTS[tid] ?? tid,
    alert: (text) => void alerts.push(text), say: (tid) => void said.push(tid),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    sound: (file) => void sounds.push(file), soundId: (id) => void sounds.push(id),
    sendMakeGem: (weapon) => void sent.push(['makeGem', weapon]),
    sendSetGem: (weapon, jewel) => void sent.push(['setGem', weapon, jewel]),
    mobile: () => mobile, openBag: () => { bagOpened = true; },
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
  };
  return { own, host, reserved, said, alerts, sounds, sent, layer, windows: new JewelWindows(host), bagOpened: () => bagOpened };
}

const start = (root: ParentNode, cls: string) => root.querySelector<HTMLButtonElement>(`.${cls} [data-control="WIDC_START"]`)!;

describe('Create Jewels (CWndExtraction)', () => {
  it('opens once (a second time says TID_GAME_WND_OVERLAPED), with its description', () => {
    const r = rig();
    r.windows.extraction.open();
    const window = r.layer.querySelector<HTMLElement>('.hud-jewel-extraction')!;
    expect(window.querySelector('.hud-window-title')!.textContent).toBe('Create Jewels');
    expect(window.textContent).toContain('Create Jewel');
    r.windows.extraction.open();
    expect(r.said).toEqual(['TID_GAME_WND_OVERLAPED']);
    expect(r.bagOpened()).toBe(false); // the desktop: Neuz does not open the bag
  });

  it('takes a general weapon of level 60+ by a double-click; a low one is ignored, a jewel refused by the bag', () => {
    const r = rig();
    r.windows.extraction.open();
    expect(start(r.layer, 'hud-jewel-extraction').disabled).toBe(true);
    expect(r.windows.take(4)).toBe(true); // a weapon: SetWeapon, which ignores the level 30 one
    expect(r.windows.extraction.slot).toBeNull();
    expect(r.windows.take(6)).toBe(false); // not a weapon: the bag says TID_SBEVE_NOTUSEITEM
    expect(r.windows.take(3)).toBe(true);
    expect(r.windows.extraction.slot).toBe(3);
    expect(r.reserved.get(3)).toBe(1);
    expect(start(r.layer, 'hud-jewel-extraction').disabled).toBe(false);
    r.windows.take(5); // the slot is full
    expect(r.windows.extraction.slot).toBe(3);
  });

  it('START sends the weapon once; success names the jewel and its count and empties the slot', () => {
    const r = rig();
    r.windows.extraction.open();
    r.windows.take(3);
    start(r.layer, 'hud-jewel-extraction').click();
    start(r.layer, 'hud-jewel-extraction').click();
    expect(r.sent).toEqual([['makeGem', 3]]);
    expect(start(r.layer, 'hud-jewel-extraction').disabled).toBe(true);
    r.windows.onUltimate({ state: 3, result: 0, count: 2 });
    expect(r.alerts).toEqual(['You have created Ruby 2.']);
    expect(r.windows.extraction.slot).toBeNull();
    expect(r.reserved.size).toBe(0);
    expect(r.windows.extraction.isOpen).toBe(true);
  });

  it('a full bag enables START again; a failure says so and closes', () => {
    const r = rig();
    r.windows.extraction.open();
    r.windows.take(3);
    start(r.layer, 'hud-jewel-extraction').click();
    r.windows.onUltimate({ state: 3, result: 4, count: 0 });
    expect(r.alerts.at(-1)).toBe('You have no space in your inventory. Please make space and try again!');
    expect(start(r.layer, 'hud-jewel-extraction').disabled).toBe(false);
    start(r.layer, 'hud-jewel-extraction').click();
    r.windows.onUltimate({ state: 3, result: 1, count: 0 });
    expect(r.alerts.at(-1)).toBe('Jewel creation failed.');
    expect(r.windows.extraction.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
  });

  it('closes with the bag; a phone opens the bag with it', () => {
    const r = rig(true);
    r.windows.extraction.open();
    expect(r.bagOpened()).toBe(true);
    r.windows.bagClosed();
    expect(r.windows.extraction.isOpen).toBe(false);
  });
});

describe('Jewel Setting (CWndSmeltJewel)', () => {
  it('a phone\'s tap puts the Ultimate weapon in; its sockets drawn set, usable and closed', () => {
    const r = rig(true);
    r.windows.setting.open();
    expect(r.windows.tapItem(3)).toBe(false); // not Ultimate, not a jewel
    expect(r.windows.tapItem(5)).toBe(true);
    expect(r.windows.setting.state).toEqual({ weapon: 5, jewels: [2045, 0, 0], usable: 1, jewel: null, running: false });
    const sockets = [...r.layer.querySelectorAll<HTMLElement>('.hud-jewel-setting [data-socket]')].map((s) => s.dataset.socket);
    expect(sockets).toEqual(['set', 'usable', 'open', 'closed', 'closed']);
    expect(start(r.layer, 'hud-jewel-setting').disabled).toBe(true);
  });

  it('the bag\'s double-click puts a jewel in the usable socket only with a weapon; not the weapon itself', () => {
    const r = rig();
    r.windows.setting.open();
    expect(r.windows.take(6)).toBe(true); // SetJewel with no weapon: nothing
    expect(r.windows.setting.state.jewel).toBeNull();
    expect(r.windows.take(5)).toBe(false); // the weapon goes in by a drop only
    r.windows.setting.setWeapon(5);
    r.windows.take(6);
    expect(r.windows.setting.state).toMatchObject({ jewels: [2045, 2032, 0], jewel: 6 });
    expect(r.reserved.get(6)).toBe(1);
    expect(start(r.layer, 'hud-jewel-setting').disabled).toBe(false);
    // a double-click on the usable socket takes it out
    r.layer.querySelectorAll<HTMLElement>('.hud-jewel-setting [data-socket]')[1]!.dispatchEvent(new MouseEvent('dblclick'));
    expect(r.windows.setting.state).toMatchObject({ jewels: [2045, 0, 0], jewel: null });
    expect(r.reserved.has(6)).toBe(false);
  });

  it('START plays its sound, turns for 26 steps, then sends the weapon and the jewel; success closes it', () => {
    const r = rig();
    r.windows.setting.open();
    r.windows.setting.setWeapon(5);
    r.windows.setting.setJewel(6);
    r.windows.setting.step(0);
    start(r.layer, 'hud-jewel-setting').click();
    expect(r.sounds).toEqual(['PcSkillD-Counter01.wav']);
    expect(r.windows.setting.state.running).toBe(true);
    r.windows.take(6); // nothing goes in while it turns
    let frames = 0;
    for (; frames < 400 && r.sent.length === 0; frames++) r.windows.setting.step(((frames + 1) * 1000) / 60 + 0.01);
    expect(r.sent).toEqual([['setGem', 5, 6]]);
    // the first step after 27 frames (count > 25), each next after delay + 1: 27 + Σ (d + 1) for d = 24..0, 5.9 s at 60 fps
    expect(frames).toBe(27 + 325);
    r.windows.onUltimate({ state: 4, result: 0 });
    expect(r.alerts).toEqual(['Jewel creation succeeded!']);
    expect(r.sounds.at(-1)).toBe(14);
    expect(r.windows.setting.isOpen).toBe(false);
    expect(r.reserved.size).toBe(0);
  });

  it('a failure says so and reads the sockets again, the window open', () => {
    const r = rig();
    r.windows.setting.open();
    r.windows.setting.setWeapon(5);
    r.windows.setting.setJewel(6);
    r.windows.onUltimate({ state: 4, result: 1 });
    expect(r.alerts).toEqual(['Jewel creation failed!']);
    expect(r.windows.setting.state).toMatchObject({ weapon: 5, jewels: [2045, 0, 0], jewel: null });
    expect(r.windows.setting.isOpen).toBe(true);
  });
});
