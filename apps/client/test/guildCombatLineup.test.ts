// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, B4): the start-point window (hud/guildCombat/startPointWindow.ts; A-client.md §2.4).
import { describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { StartPointWindow } from '../src/world/hud/guildCombat/startPointWindow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const make = (sent: number[]): StartPointWindow => {
  const w = new StartPointWindow(art, document, () => 'After %d, you enter %s.');
  w.onSelect = (map) => sent.push(map);
  return w;
};

describe('StartPointWindow', () => {
  it('sends the picked area at once, and sends it again at the time-out', () => {
    const sent: number[] = [];
    const w = make(sent);
    w.open(99, 10, 1000);
    w.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON3"]')!.click();
    expect(sent).toEqual([2]);
    w.tick(5000);
    expect(w.isOpen).toBe(true);
    w.tick(11_000);
    expect(sent).toEqual([2, 2]);
    expect(w.isOpen).toBe(false);
  });

  it('the start-point window sends 99 at the time-out when none was picked', () => {
    const sent: number[] = [];
    const w = make(sent);
    w.open(99, 10, 0);
    w.tick(9999);
    expect(sent).toEqual([]);
    w.tick(10_000);
    expect(sent).toEqual([99]);
    expect(w.isOpen).toBe(false);
  });

  it('counts down in whole seconds (left/1000 + 1) with Random or the area number', () => {
    const w = make([]);
    w.open(99, 10, 0);
    expect(w.element.textContent).toContain('After 11, you enter Random.');
    w.tick(2500);
    expect(w.element.textContent).toContain('After 8, you enter Random.');
    w.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON1"]')!.click();
    w.tick(2600);
    expect(w.element.textContent).toContain('you enter 1.');
  });
});
