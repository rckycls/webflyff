// @vitest-environment jsdom
// 2026-11-15 (owner, "the screen is moving to the right when opening a keyboard"): the game's screen never scrolls
// (hud/scrollPin.ts): the page and the world's own layers are put back at 0; a window's list keeps its scroll.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinScroll } from '../src/world/hud/scrollPin';

/** An element whose scroll can be set and read (jsdom lays nothing out, so it keeps no scroll of its own). */
function scrollable(element: HTMLElement): HTMLElement {
  let left = 0, top = 0;
  Object.defineProperty(element, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v; } });
  Object.defineProperty(element, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('pinScroll', () => {
  function world() {
    const root = scrollable(document.createElement('div'));
    root.className = 'world';
    const hud = scrollable(document.createElement('div'));
    hud.className = 'world-hud';
    const list = scrollable(document.createElement('div'));
    list.className = 'hud-post-list';
    const input = document.createElement('input');
    hud.append(list, input);
    root.append(hud);
    document.body.append(root);
    return { root, hud, list, input };
  }

  it('a scroll of the world or its HUD layer goes back to 0; a window\'s list keeps its own', () => {
    const { root, hud, list } = world();
    const pin = pinScroll(root);
    root.scrollLeft = 40;
    root.dispatchEvent(new Event('scroll'));
    hud.scrollTop = 25;
    hud.dispatchEvent(new Event('scroll'));
    list.scrollTop = 80;
    list.dispatchEvent(new Event('scroll'));
    expect([root.scrollLeft, hud.scrollTop, list.scrollTop]).toEqual([0, 0, 80]);
    pin.dispose();
    root.scrollLeft = 40;
    root.dispatchEvent(new Event('scroll'));
    expect(root.scrollLeft).toBe(40);
  });

  it('a text box focused: the page and the layers back at 0 at once', () => {
    const { root, hud, input } = world();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 30 });
    const pin = pinScroll(root);
    root.scrollLeft = 12;
    hud.scrollLeft = 9;
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect([root.scrollLeft, hud.scrollLeft]).toEqual([0, 0]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    pin.dispose();
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 });
  });
});
