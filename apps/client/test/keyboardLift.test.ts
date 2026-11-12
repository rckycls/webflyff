// @vitest-environment jsdom
// 2026-11-12 (owner): the text box typed in on a phone kept above the soft keyboard (world/keyboardLift.ts).

import { afterEach, describe, expect, it } from 'vitest';
import { FALLBACK_COVER, KeyboardLift, isTextField } from '../src/world/keyboardLift';

const LAYER_HEIGHT = 400;

/** The visual viewport: its height shrinks by the keyboard's, and the browser may pan it (`offsetTop`). */
class FakeViewport extends EventTarget {
  height = LAYER_HEIGHT;
  offsetTop = 0;
}

/** How far the layer is slid up, read back from its transform. */
const shiftOf = (layer: HTMLElement): number => {
  const match = /translateY\((-?[\d.]+)px\)/.exec(layer.style.transform);
  return match === null ? 0 : -Number(match[1]);
};

/** A layer 400 px high at the top of the page, and a box in it at `top` to `bottom` (as laid out, unslid). */
function setup(options: { coarse?: boolean; top?: number; bottom?: number; tag?: 'input' | 'textarea' } = {}) {
  const { coarse = true, top = 340, bottom = 370, tag = 'input' } = options;
  const view = Object.assign(new EventTarget(), {
    matchMedia: (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }),
  }) as unknown as Window;
  const viewport = new FakeViewport();
  const layer = document.createElement('div');
  Object.defineProperty(layer, 'clientHeight', { value: LAYER_HEIGHT });
  layer.getBoundingClientRect = () => new DOMRect(0, -shiftOf(layer), 800, LAYER_HEIGHT);
  const field = document.createElement(tag);
  field.getBoundingClientRect = () => new DOMRect(10, top - shiftOf(layer), 200, bottom - top);
  const other = document.createElement('button');
  layer.append(field, other);
  document.body.append(layer);
  const lift = new KeyboardLift(layer, view, viewport);
  return { layer, field, other, viewport, lift };
}

afterEach(() => {
  document.body.replaceChildren();
});

/** The player's tap on `field`: its press, then the focus it gives. */
const tap = (field: HTMLElement): void => {
  field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  field.focus();
};

describe('KeyboardLift (2026-11-12: the box typed in stays above a phone keyboard)', () => {
  it('lifts the tapped box over where the keyboard is taken to be before the browser says, then over the real one', () => {
    const { layer, field, viewport, lift } = setup();
    tap(field);
    lift.update();
    // the keyboard taken to cover the bottom 55%: the box's bottom 8 px above 45% of the layer
    const fallbackTop = LAYER_HEIGHT * (1 - FALLBACK_COVER);
    expect(field.getBoundingClientRect().bottom).toBeCloseTo(fallbackTop - 8, 0);
    expect(layer.hasAttribute('data-keyboard-lift')).toBe(true);
    // the keyboard up: the visual viewport 150 px high, the box's bottom 8 px above it
    viewport.height = 150;
    lift.update();
    expect(field.getBoundingClientRect().bottom).toBe(142);
    expect(lift.lifted).toBe(370 - 142);
    // the browser panned the visual viewport 50 px down: less lift
    viewport.offsetTop = 50;
    lift.update();
    expect(field.getBoundingClientRect().bottom).toBe(192);
  });

  it('goes back down when the keyboard closes with the box still focused (Back on Android), up again when it reopens', () => {
    const { layer, field, viewport, lift } = setup();
    field.focus();
    viewport.height = 160;
    lift.update();
    expect(lift.lifted).toBeGreaterThan(0);
    viewport.height = LAYER_HEIGHT;
    lift.update();
    expect(lift.lifted).toBe(0);
    expect(layer.style.transform).toBe('');
    viewport.height = 160;
    lift.update();
    expect(field.getBoundingClientRect().bottom).toBe(152);
  });

  it('puts the layer back when the box loses the focus, or to a button', () => {
    const { layer, field, other, viewport, lift } = setup();
    field.focus();
    viewport.height = 150;
    lift.update();
    other.focus();
    lift.update();
    expect(lift.lifted).toBe(0);
    expect(layer.style.transform).toBe('');
    expect(layer.hasAttribute('data-keyboard-lift')).toBe(false);
    field.focus();
    lift.update();
    field.blur();
    lift.update();
    expect(lift.lifted).toBe(0);
  });

  it('leaves a box already above the keyboard where it is, and never slides a box\'s top out of sight', () => {
    const high = setup({ top: 40, bottom: 70 });
    high.field.focus();
    high.viewport.height = 150;
    high.lift.update();
    expect(high.lift.lifted).toBe(0);
    document.body.replaceChildren();
    // a box 200 px tall in a 150 px view: its top kept 8 px under the top of what is seen
    const tall = setup({ top: 180, bottom: 380, tag: 'textarea' });
    tall.field.focus();
    tall.viewport.height = 150;
    tall.lift.update();
    expect(tall.field.getBoundingClientRect().top).toBe(8);
  });

  it('does nothing with a mouse (no soft keyboard)', () => {
    const { field, viewport, lift } = setup({ coarse: false });
    field.focus();
    viewport.height = 150;
    lift.update();
    expect(lift.lifted).toBe(0);
  });

  it('leaves a box focused without a tap (a window that focuses its box as it opens) until a keyboard shows', () => {
    const { field, viewport, lift } = setup();
    field.focus();
    lift.update();
    expect(lift.lifted).toBe(0);
    viewport.height = 150;
    lift.update();
    expect(field.getBoundingClientRect().bottom).toBe(142);
    // a press elsewhere, then a focus: no tap on the box either
    const other = setup();
    other.other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    other.field.focus();
    other.lift.update();
    expect(other.lift.lifted).toBe(0);
  });

  it('follows the focus by itself, a frame later', async () => {
    const { field, lift } = setup();
    tap(field);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lift.lifted).toBeGreaterThan(0);
    lift.dispose();
    expect(lift.lifted).toBe(0);
  });

  it('knows the boxes a keyboard types into', () => {
    const input = (type: string) => Object.assign(document.createElement('input'), { type });
    expect(isTextField(input('text'))).toBe(true);
    expect(isTextField(input('number'))).toBe(true);
    expect(isTextField(input('password'))).toBe(true);
    expect(isTextField(input('checkbox'))).toBe(false);
    expect(isTextField(input('button'))).toBe(false);
    expect(isTextField(Object.assign(input('text'), { readOnly: true }))).toBe(false);
    expect(isTextField(document.createElement('textarea'))).toBe(true);
    expect(isTextField(document.createElement('button'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
