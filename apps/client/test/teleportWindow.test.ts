// @vitest-environment jsdom
// custom (owner 2026-11-19): the Teleport window (hud/teleportWindow.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { TELEPORT_LAYOUT, TeleportWindow } from '../src/world/hud/teleportWindow';
import type { TeleportHost } from '../src/world/hud/teleportWindow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

interface Fake extends TeleportHost {
  letter: string;
  penya: number;
  said: string[];
  tids: string[];
  sent: number[];
}

function opened(letter = 'F', penya = 1_000_000): { window: TeleportWindow; host: Fake; rows: HTMLElement[] } {
  const host: Fake = {
    letter, penya, said: [], tids: [], sent: [],
    authorization() { return this.letter.charCodeAt(0); },
    gold() { return this.penya; },
    say(text) { this.said.push(text); },
    sayTid(tid) { this.tids.push(tid); },
    send(place) { this.sent.push(place); },
  };
  const window = new TeleportWindow(host, art);
  document.body.append(window.element);
  window.open();
  return { window, host, rows: [...window.window.control('WIDC_LISTBOX1').querySelectorAll<HTMLElement>('[role="option"]')] };
}

/** A row's press: the window takes a click only after a press of its own (the phone's ghost click). */
function press(window: TeleportWindow, row: HTMLElement): void {
  window.window.frame.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  row.click();
}

const apply = (window: TeleportWindow): void => window.window.button('WIDC_APPLY').click();

describe('the Teleport window', () => {
  it('lists the 14 places, the VIP ones starred, Flaris chosen, its map and line, the price and Apply', () => {
    const { window, rows } = opened();
    expect(window.window.frame.element.querySelector('.hud-window-title')!.textContent).toBe('Teleport');
    expect([TELEPORT_LAYOUT.width, TELEPORT_LAYOUT.height]).toEqual([448, 336]);
    expect(rows.map((r) => r.querySelector('.teleport-name')!.textContent)).toEqual([
      'Flaris', 'Saint Morning', 'Darkon', 'Darkon 1', 'Darkon 3', 'Shaduwar', 'Garden of Rhisis', 'Mars Dungeon',
      'Dekane Mine', 'Ivillis Temple', 'Dead Wilderness', 'Volcane', 'Aminus Dungeon', 'Aminus Dungeon (Hero)',
    ]);
    expect(rows.map((r) => r.hasAttribute('data-vip'))).toEqual([false, false, false, ...Array(11).fill(true)]);
    // a regular player sees the VIP places locked
    expect(rows.map((r) => r.hasAttribute('data-locked'))).toEqual([false, false, false, ...Array(11).fill(true)]);
    expect(rows[0]!.getAttribute('aria-selected')).toBe('true');
    expect(window.window.control('WIDC_STATIC1').textContent).toBe('Flaris');
    expect(window.window.control('WIDC_CUSTOM1').style.backgroundImage).toContain('world_flaris');
    expect(window.window.control('WIDC_TEXT1').textContent).toContain('Madrigal\'s first town');
    expect(window.window.control('WIDC_STATIC2').textContent).toBe('10,000 Penya');
    expect(window.window.button('WIDC_APPLY').dataset.word).toBe('Apply');
    expect(window.window.frame.overBag).toBe(true);
  });

  it('shows a chosen place: its name, its region map with the landing point, and "VIP only" to a regular player', () => {
    const { window, rows } = opened();
    press(window, rows[5]!);
    expect(rows[5]!.getAttribute('aria-selected')).toBe('true');
    expect(rows[0]!.getAttribute('aria-selected')).toBe('false');
    expect(window.window.control('WIDC_STATIC1').textContent).toBe('Shaduwar');
    const picture = window.window.control('WIDC_CUSTOM1');
    expect(picture.style.backgroundImage).toContain('world_harmonin');
    const marker = picture.querySelector<HTMLElement>('.teleport-marker')!;
    expect(marker.style.left).toMatch(/%$/);
    expect(marker.style.top).toMatch(/%$/);
    expect(window.window.control('WIDC_TEXT1').textContent).toContain('VIP only');
  });

  it('refuses a VIP place to a regular player and sends nothing', () => {
    const { window, host, rows } = opened('F');
    press(window, rows[11]!);
    apply(window);
    expect(host.said).toEqual(['Only VIP players can teleport there.']);
    expect(host.sent).toEqual([]);
    expect(window.isOpen).toBe(true);
  });

  it('sends a VIP1 player\'s VIP place, and closes once the teleport starts (owner 2026-11-20)', () => {
    const { window, host, rows } = opened('A');
    expect(rows.some((r) => r.hasAttribute('data-locked'))).toBe(false);
    expect(window.window.control('WIDC_TEXT1').textContent).not.toContain('VIP only');
    press(window, rows[11]!);
    apply(window);
    expect(host.sent).toEqual([11]);
    // open, waiting for the World's move; a second press sends nothing
    expect(window.isOpen).toBe(true);
    expect(window.window.frame.element.hasAttribute('data-sending')).toBe(true);
    apply(window);
    expect(host.sent).toEqual([11]);
    window.moved();
    expect(window.isOpen).toBe(false);
  });

  it('stays open when the World refuses (no move): Apply works again after 2 s, and a late move does not close it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T00:00:00Z'));
    const { window, host, rows } = opened('F');
    press(window, rows[1]!);
    apply(window);
    vi.advanceTimersByTime(1_999);
    apply(window);
    expect(host.sent).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(window.window.frame.element.hasAttribute('data-sending')).toBe(false);
    apply(window);
    expect(host.sent).toEqual([1, 1]);
    // a move long after the last press is no teleport of the window's: it stays
    vi.advanceTimersByTime(10_000);
    window.moved();
    expect(window.isOpen).toBe(true);
    // a move with no press at all neither
    window.close();
    window.open();
    window.moved();
    expect(window.isOpen).toBe(true);
  });

  it('refuses under 10,000 Penya with V15\'s line, and sends 10,000', () => {
    const poor = opened('F', 9_999);
    press(poor.window, poor.rows[1]!);
    apply(poor.window);
    expect(poor.host.tids).toEqual(['TID_GAME_LACKMONEY']);
    expect(poor.host.sent).toEqual([]);
    document.body.replaceChildren();
    const exact = opened('F', 10_000);
    press(exact.window, exact.rows[2]!);
    apply(exact.window);
    expect(exact.host.sent).toEqual([2]);
  });

  it('ignores a click that came with the opening tap, and opens again on the place picked last', () => {
    const { window, rows } = opened();
    rows[3]!.click(); // no press on the window since it opened: the phone's ghost click
    expect(window.window.control('WIDC_STATIC1').textContent).toBe('Flaris');
    press(window, rows[1]!);
    window.close();
    window.open();
    expect(window.window.control('WIDC_STATIC1').textContent).toBe('Saint Morning');
    window.toggle();
    expect(window.isOpen).toBe(false);
    window.toggle();
    expect(window.isOpen).toBe(true);
  });
});
