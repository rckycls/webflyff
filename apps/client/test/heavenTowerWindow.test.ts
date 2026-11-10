// @vitest-environment jsdom
// The Forsaken Tower window (2026-11-10, hud/heavenTowerWindow.ts): CWndHeavenTower and its entrance box
// (_Interface/WndField.cpp:21592-21862; docs/superpowers/specs/2026-11-10-arena-tower-research.md §4).

import { afterEach, describe, expect, it } from 'vitest';
import { FLOOR_COSTS, HEAVEN_TOWER, HeavenTowerWindow } from '../src/world/hud/heavenTowerWindow';
import type { HeavenTowerHost } from '../src/world/hud/heavenTowerWindow';
import { art } from './helpers/petData';

const TEXTS: Record<string, string> = {
  TID_TOOLTIP_HEAVENTOWER: 'The Forsaken Tower',
  TID_GAME_HEAVETOWER_FLOOR01: 'Enter Floor B1. (Monster Level 62-72)',
  TID_GAME_HEAVETOWER_FLOOR02: 'Enter Floor B2. (Monster Level 74-84)',
  TID_GAME_HEAVETOWER_FLOOR03: 'Enter Floor B3. (Monster Level 86-96)',
  TID_GAME_HEAVETOWER_FLOOR04: 'Enter Floor B4. (Monster Level 98-108)',
  TID_GAME_HEAVETOWER_FLOOR05: 'Enter Floor B5. (Monster Level 110-120)',
  TID_GAME_HEAVETOWER_FLOOR06: 'Enter Floor B6. (Secret Room)',
  TID_GAME_HEAVETOWER_FLOOR07: 'Do not Enter.',
  TID_GAME_HEAVETOWER_FLOOR01_MSG: 'You need to pay %d penya to enter floor B1.',
  TID_GAME_HEAVETOWER_FLOOR03_MSG: 'You need to pay %d penya to enter floor B3.',
  TID_GAME_HEAVETOWER_FLOOR05_MSG: 'You need to pay %d penya to enter floor B5.',
  TID_GAME_HEAVETOWER_FLOOR06_MSG: 'You cannot enter a private area.',
};

afterEach(() => document.body.replaceChildren());

function rig() {
  const said: string[] = [], sent: number[] = [];
  let box: { text: string; ok: () => void } | null = null;
  const host: HeavenTowerHost = {
    text: (tid) => TEXTS[tid] ?? '',
    say: (tid) => void said.push(tid),
    confirm: (text, ok) => { box = { text, ok }; },
    send: (floor) => void sent.push(floor),
  };
  const window = new HeavenTowerWindow(host, art, document);
  document.body.append(window.element);
  const rows = (): HTMLElement[] => [...window.element.querySelectorAll<HTMLElement>('[data-floor]')];
  return { window, said, sent, rows, box: () => box };
}

describe('the Forsaken Tower window (CWndHeavenTower)', () => {
  it('is APP_HEAVEN_TOWER laid out as InitWnd leaves it: 80 px wider, as tall as its seven lines', () => {
    expect(HEAVEN_TOWER.title).toBe('Enter Forsaken Tower');
    expect(HEAVEN_TOWER.width).toBe(304 + 80);
    // 7 lines of 15 px + 10 (the list), + the text's 100, + 60
    expect(HEAVEN_TOWER.height).toBe(7 * 15 + 10 + 100 + 60);
    expect(FLOOR_COSTS).toEqual([10000, 30000, 50000, 70000, 100000]);
  });

  it('opens with the description and the seven lines "%d. %s"; a second open says TID_GAME_WND_OVERLAPED', () => {
    const r = rig();
    r.window.open();
    expect(r.window.isOpen).toBe(true);
    expect(r.window.element.textContent).toContain('The Forsaken Tower');
    expect(r.rows().map((row) => row.textContent)).toEqual([
      '1. Enter Floor B1. (Monster Level 62-72)', '2. Enter Floor B2. (Monster Level 74-84)',
      '3. Enter Floor B3. (Monster Level 86-96)', '4. Enter Floor B4. (Monster Level 98-108)',
      '5. Enter Floor B5. (Monster Level 110-120)', '6. Enter Floor B6. (Secret Room)', '7. Do not Enter.',
    ]);
    r.window.open();
    expect(r.said).toEqual(['TID_GAME_WND_OVERLAPED']);
  });

  it('a floor asks with its cost; OK sends the floor and closes the window', () => {
    const r = rig();
    r.window.open();
    r.rows()[2]!.click();
    expect(r.rows()[2]!.dataset.chosen).toBe('');
    expect(r.box()!.text).toBe('You need to pay 50000 penya to enter floor B3.');
    expect(r.sent).toEqual([]);
    r.box()!.ok();
    expect(r.sent).toEqual([3]);
    expect(r.window.isOpen).toBe(false);
  });

  it('floor B5 costs 100000; B6 says it is private and OK sends nothing; "Do not Enter." closes', () => {
    const r = rig();
    r.window.open();
    r.rows()[4]!.click();
    expect(r.box()!.text).toBe('You need to pay 100000 penya to enter floor B5.');
    r.rows()[5]!.click();
    expect(r.box()!.text).toBe('You cannot enter a private area.');
    r.box()!.ok();
    expect(r.sent).toEqual([]);
    expect(r.window.isOpen).toBe(true);
    r.rows()[6]!.click();
    expect(r.window.isOpen).toBe(false);
    expect(r.sent).toEqual([]);
  });
});
