// @vitest-environment jsdom
// The item tooltip's place (2026-11-05, the owner: a tooltip far from its item, and a thin one wrapping over many lines
// for the items at the bag's right): measured at its own width before it is placed, then kept on the screen.

import { afterEach, describe, expect, it } from 'vitest';
import { positionItemDetails } from '../src/world/hud/itemDetails';

/** A rect of `w` x `h` at (`x`, `y`). */
const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) }) as DOMRect;

/**
 * A tooltip that lays out as a browser would: its natural width (`natural`) and height only when it is measured at its
 * own size (`width: max-content`), else squeezed to `squeezed` x 400 (min-content, wrapped line by line).
 */
function tooltip(natural: { w: number; h: number }, squeezed = 40): HTMLElement {
  const el = document.createElement('div');
  el.style.right = 'calc(100% + 12px)';
  el.getBoundingClientRect = () => {
    const left = parseFloat(el.style.left) || 0, top = parseFloat(el.style.top) || 0;
    return el.style.width === 'max-content' ? rect(left, top, natural.w, natural.h) : rect(left, top, squeezed, 400);
  };
  document.body.append(el);
  return el;
}

const anchor = (x: number, y: number): HTMLElement => {
  const el = document.createElement('button');
  el.getBoundingClientRect = () => rect(x, y, 32, 32);
  document.body.append(el);
  return el;
};

afterEach(() => document.body.replaceChildren());

describe('positionItemDetails', () => {
  it('measures the tooltip at its own width, so an item at the right gets a whole tooltip, kept on the screen', () => {
    Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
    const tip = tooltip({ w: 228, h: 150 });
    positionItemDetails(tip, anchor(1240, 400), document);
    expect(tip.style.width).toBe('max-content');
    expect(tip.style.right).toBe('auto');
    expect(tip.style.left).toBe(`${1280 - 228 - 8}px`);
    // above the item, 10 px clear of it
    expect(tip.style.top).toBe(`${400 - 150 - 10}px`);
  });

  it('under the item when there is no room above, and never past the bottom', () => {
    Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
    const tip = tooltip({ w: 200, h: 150 });
    positionItemDetails(tip, anchor(300, 60), document);
    expect([tip.style.left, tip.style.top]).toEqual(['300px', `${60 + 32 + 10}px`]);
    const tall = tooltip({ w: 200, h: 690 });
    positionItemDetails(tall, anchor(300, 60), document);
    expect(tall.style.top).toBe(`${720 - 690 - 8}px`);
    const taller = tooltip({ w: 200, h: 900 });
    positionItemDetails(taller, anchor(300, 60), document);
    expect(taller.style.top).toBe('8px');
  });
});
