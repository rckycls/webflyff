// @vitest-environment jsdom
// The Scroll of Return's village window (Piece 7 M3): CWndSelectVillage, APP_COMM_SELECTVIL, WndSelectVillage.cpp:60-132.

import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { SelectVillageWindow } from '../src/world/hud/selectVillageWindow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const radios = (w: SelectVillageWindow): HTMLButtonElement[] =>
  [...w.frame.element.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const press = (w: SelectVillageWindow, key: string): void =>
  w.frame.element.querySelector<HTMLButtonElement>(`[data-button="${key}"]`)!.click();

afterEach(() => {
  document.body.replaceChildren();
});

describe('SelectVillageWindow (CWndSelectVillage)', () => {
  it('Flaris is checked first, the labels and places are the layout\'s', () => {
    const w = new SelectVillageWindow(art, document);
    w.open(() => {});
    expect(w.frame.element.querySelector('.hud-window-title, [data-title]')?.textContent ?? w.frame.element.textContent)
      .toContain('Choose the Village to Return');
    expect(w.frame.element.textContent).toContain('Choose the Village');
    expect(radios(w).map((r) => r.textContent)).toEqual(['Flaris', 'Sain City', 'Darken City']);
    expect(radios(w).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios(w).map((r) => [r.style.left, r.style.top])).toEqual([['8px', '28px'], ['8px', '46px'], ['8px', '64px']]);
    // a checked radio shows frame 3 of ButtRadio.bmp, an unchecked one frame 1 (CTheme::RenderWndButton_6Texture)
    expect(radios(w)[0]!.dataset.frame).toBe('3');
    expect(radios(w)[1]!.dataset.frame).toBe('1');
  });

  it('OK sends the checked village and closes', () => {
    const w = new SelectVillageWindow(art, document);
    const chosen: number[] = [];
    w.open((select) => chosen.push(select));
    radios(w)[1]!.click();
    expect(radios(w).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    press(w, 'ok');
    expect(chosen).toEqual([1]);
    expect(w.isOpen).toBe(false);
    // open again: Flaris again (OnInitialUpdate's SetCheck)
    w.open((select) => chosen.push(select));
    press(w, 'ok');
    expect(chosen).toEqual([1, 0]);
  });

  it('Cancel sends nothing', () => {
    const w = new SelectVillageWindow(art, document);
    const chosen: number[] = [];
    w.open((select) => chosen.push(select));
    radios(w)[2]!.click();
    press(w, 'cancel');
    expect(chosen).toEqual([]);
    expect(w.isOpen).toBe(false);
  });
});
