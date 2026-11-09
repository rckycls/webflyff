// @vitest-environment jsdom
// The item boxes as Neuz's own windows (2026-11-05, items/confirmBoxes.ts): the box a text asks in, its answers, and the
// rules of each.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmBoxes, boxOf } from '../src/world/items/confirmBoxes';

afterEach(() => document.body.replaceChildren());

function rig(bagOpen = true) {
  const layer = document.createElement('div');
  document.body.append(layer);
  let bag = bagOpen;
  const boxes = new ConfirmBoxes({ url: (key) => `/assets/${key}`, sheets: null }, () => layer, () => bag, document);
  const shown = (): HTMLElement | undefined => [...layer.querySelectorAll<HTMLElement>('.hud-res-window')].find((w) => !w.hidden);
  const press = (label: string): void => shown()!.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click();
  return { boxes, shown, press, setBag: (open: boolean) => { bag = open; } };
}

describe('ConfirmBoxes', () => {
  it('picks the box by the text, as Neuz picks the class', () => {
    expect(boxOf('TID_GAME_REGARDLESS_USE')).toBe('commItem');
    expect(boxOf('TID_GAME_TICKET_DESC')).toBe('commItem');
    expect(boxOf('TID_TOOLTIP_RESTATE_STR_CONFIRM')).toBe('restate');
    expect(boxOf('TID_GAME_RESTATE_INT_LOW_CONFIRM')).toBe('restate');
    expect(boxOf('TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL')).toBe('smeltSafety');
    expect(boxOf('TID_GAME_RANDOMSCROLL_CONFIRM1')).toBe('randomScroll');
    expect(boxOf('TID_GAME_FUNNYCOIN_ASKUSE')).toBe('funnyCoin');
    expect(boxOf('TID_GAME_REGARDLESS_USE01')).toBe('confirmVis');
  });

  it('APP_COMMITEM_DIALOG: "Use Item", its words in the disabled edit, OK and Cancel', () => {
    const r = rig();
    const ok = vi.fn(), closed = vi.fn();
    r.boxes.open('commItem', 'Use now?', { ok, closed });
    expect(r.shown()!.querySelector('.hud-window-title')!.textContent).toBe('Use Item');
    expect(r.shown()!.querySelector('.hud-res-edit-words')!.textContent).toBe('Use now?');
    r.press('OK');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(r.boxes.isOpen).toBe(false);
  });

  it('gives a close for the box it opened, which does nothing once another box took its place (pets review)', () => {
    const r = rig();
    const close = r.boxes.open('confirmVis', 'Delete the Bead of STR? ', { ok: vi.fn() });
    close();
    expect(r.boxes.isOpen).toBe(false);
    const stale = r.boxes.open('confirmVis', 'first', { ok: vi.fn() });
    r.boxes.open('commItem', 'second', { ok: vi.fn() });
    stale();
    expect(r.boxes.openKind).toBe('commItem');
  });

  it('a new box replaces the one open, which goes without its answers (SAFE_DELETE)', () => {
    const r = rig();
    const first = { ok: vi.fn(), closed: vi.fn() };
    r.boxes.open('commItem', 'first', first);
    r.boxes.open('funnyCoin', 'Would you like to use 1000 Coin?', { ok: vi.fn() });
    expect(first.closed).not.toHaveBeenCalled();
    expect(r.boxes.openKind).toBe('funnyCoin');
    expect(r.shown()!.querySelector('.hud-window-title')!.textContent).toBe('Confirm');
    expect(r.shown()!.querySelector('[aria-label="Yes"]')).not.toBeNull();
  });

  it('the Re-Stat and smelt safety boxes answer only while the bag is open; the close button answers nothing', () => {
    const r = rig(false);
    const ok = vi.fn(), cancel = vi.fn(), closed = vi.fn();
    r.boxes.open('smeltSafety', 'Item can be destroyed...', { ok, cancel, closed });
    expect(r.shown()!.querySelector('.hud-window-title')!.textContent).toBe('Confirm Upgrade');
    r.press('Yes');
    expect(ok).not.toHaveBeenCalled();
    expect(r.boxes.isOpen).toBe(true);
    r.setBag(true);
    r.press('No');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
    r.boxes.open('restate', 'All character stats will be reset.  Continue?', { ok, cancel, closed });
    r.shown()!.querySelector<HTMLElement>('.hud-window-close')!.click();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(2);
    expect(ok).not.toHaveBeenCalled();
  });

  it('APP_CONFIRM_ENTER: modal, titled "OK", a scroll bar, and Enter is OK', () => {
    const r = rig();
    const ok = vi.fn();
    r.boxes.open('confirmVis', 'Would you like to activate the Scroll of Awakening Protection?', { ok });
    const shown = r.shown()!;
    expect(shown.querySelector('.hud-window-title')!.textContent).toBe('OK');
    expect(shown.closest('.hud-modal')).not.toBeNull();
    expect(shown.querySelector('.hud-res-scroll [aria-label="Scroll up"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ok).toHaveBeenCalledTimes(1);
    expect(r.boxes.isOpen).toBe(false);
  });
});
