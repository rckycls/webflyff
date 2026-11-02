// The one rule for "the player plays with a finger" (`watchTouch`), which the joystick, the client's attack button, its
// Start menu's size and its landscape cover follow.

import { describe, expect, it, vi } from 'vitest';
import { watchTouch } from '../src/input/touch';

/** A window whose main pointer is a finger (`coarse`) or a mouse, with listeners. */
function view(coarse: boolean | undefined, fine = false): Window {
  const target = new EventTarget();
  const matchMedia = coarse === undefined ? undefined : (query: string) => ({
    matches: (coarse && query === '(pointer: coarse)') || (fine && query === '(any-pointer: fine)'),
  });
  return Object.assign(target, { matchMedia }) as unknown as Window;
}

const press = (pointerType: string): Event => Object.assign(new Event('pointerdown'), { pointerType });

describe('watchTouch', () => {
  it('keeps phone controls after keyboard input and compatibility mouse events without a fine pointer', () => {
    const page = view(true);
    const changed = vi.fn();
    const isTouch = watchTouch(page, changed);
    page.dispatchEvent(new Event('keydown'));
    expect(isTouch()).toBe(true);
    page.dispatchEvent(press('mouse'));
    page.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse' }));
    expect(isTouch()).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    isTouch.dispose();
  });
  it('starts with desktop controls on a hybrid computer with a mouse', () => {
    const page = view(true, true);
    const isTouch = watchTouch(page);
    expect(isTouch()).toBe(false);
    page.dispatchEvent(press('touch'));
    expect(isTouch()).toBe(true);
    page.dispatchEvent(press('mouse'));
    expect(isTouch()).toBe(false);
    isTouch.dispose();
  });
  it('returns to desktop controls when a mouse or keyboard is used after a touch', () => {
    const page = view(false);
    const changed = vi.fn();
    const isTouch = watchTouch(page, changed);
    page.dispatchEvent(press('touch'));
    expect(isTouch()).toBe(true);
    page.dispatchEvent(press('mouse'));
    expect(isTouch()).toBe(false);
    page.dispatchEvent(press('touch'));
    page.dispatchEvent(new Event('keydown'));
    expect(isTouch()).toBe(false);
    isTouch.dispose();
  });
  it('is true where the main pointer is a finger, and a first touch there changes nothing', () => {
    const page = view(true);
    const onFirstTouch = vi.fn();
    const isTouch = watchTouch(page, onFirstTouch);
    expect(isTouch()).toBe(true);
    page.dispatchEvent(press('touch'));
    expect(onFirstTouch).not.toHaveBeenCalled();
    isTouch.dispose();
  });

  it('elsewhere is false until the first touch, which it tells once; a mouse or a pen press does not count', () => {
    const page = view(false);
    const onFirstTouch = vi.fn();
    const isTouch = watchTouch(page, onFirstTouch);
    expect(isTouch()).toBe(false);
    page.dispatchEvent(press('mouse'));
    page.dispatchEvent(press('pen'));
    expect(isTouch()).toBe(false);
    page.dispatchEvent(press('touch'));
    expect(isTouch()).toBe(true);
    page.dispatchEvent(press('touch'));
    expect(onFirstTouch).toHaveBeenCalledTimes(1);
    isTouch.dispose();
  });

  it('a browser without matchMedia counts as no touch screen until touched', () => {
    const page = view(undefined);
    const isTouch = watchTouch(page);
    expect(isTouch()).toBe(false);
    page.dispatchEvent(press('touch'));
    expect(isTouch()).toBe(true);
  });

  it('dispose stops listening: a later touch is not heard', () => {
    const page = view(false);
    const onFirstTouch = vi.fn();
    const isTouch = watchTouch(page, onFirstTouch);
    isTouch.dispose();
    page.dispatchEvent(press('touch'));
    expect(isTouch()).toBe(false);
    expect(onFirstTouch).not.toHaveBeenCalled();
  });
});
