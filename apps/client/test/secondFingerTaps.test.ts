// @vitest-environment jsdom
// 2026-11-20 (owner, "make every window button work with a second finger while walking"): a second finger's tap, which a
// phone makes no click of while the first is down, clicks the element itself (hud/secondFingerTaps.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_CLICK_WAIT_MS, TAP_MS, watchSecondFingerTaps } from '../src/world/hud/secondFingerTaps';

/** A finger's pointer event at (x, y), `after` ms on the page's clock. */
function finger(type: string, id: number, x = 10, y = 10, at = 0): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id }, timeStamp: { value: at } });
  return event;
}

let stop: () => void = () => {};
let world: HTMLCanvasElement;
let button: HTMLButtonElement;
let clicks: number;

beforeEach(() => {
  vi.useFakeTimers();
  world = document.createElement('canvas');
  button = document.createElement('button');
  button.innerHTML = '<span class="icon"></span>';
  clicks = 0;
  button.addEventListener('click', () => { clicks++; });
  document.body.append(world, button);
  // jsdom lays nothing out: the element under a point is the button, unless a test says otherwise
  document.elementFromPoint = () => button;
  stop = watchSecondFingerTaps(document);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** The joystick's finger down on the world. */
const walk = (): void => { world.dispatchEvent(finger('pointerdown', 1, 100, 200)); };

describe('watchSecondFingerTaps', () => {
  it("clicks what a second finger tapped while the first walks, once the browser's own click did not come", () => {
    walk();
    button.dispatchEvent(finger('pointerdown', 2, 10, 10, 1000));
    button.dispatchEvent(finger('pointerup', 2, 11, 10, 1080));
    expect(clicks).toBe(0);
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(clicks).toBe(1);
  });

  it("clicks the element pressed, inside a button too (the click bubbles to it)", () => {
    const icon = button.querySelector('span')!;
    document.elementFromPoint = () => icon;
    walk();
    icon.dispatchEvent(finger('pointerdown', 2));
    icon.dispatchEvent(finger('pointerup', 2));
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(clicks).toBe(1);
  });

  it('makes no click of a lone tap (the browser clicks it), nor of a press on the world', () => {
    button.dispatchEvent(finger('pointerdown', 2));
    button.dispatchEvent(finger('pointerup', 2));
    walk();
    world.dispatchEvent(finger('pointerdown', 3));
    world.dispatchEvent(finger('pointerup', 3));
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(clicks).toBe(0);
  });

  it('makes none of a long press, a slide, a lift off the element, or a cancelled press', () => {
    walk();
    button.dispatchEvent(finger('pointerdown', 2, 10, 10, 0));
    button.dispatchEvent(finger('pointerup', 2, 10, 10, TAP_MS + 1));
    button.dispatchEvent(finger('pointerdown', 3, 10, 10));
    button.dispatchEvent(finger('pointerup', 3, 40, 10));
    document.elementFromPoint = () => world;
    button.dispatchEvent(finger('pointerdown', 4));
    button.dispatchEvent(finger('pointerup', 4));
    document.elementFromPoint = () => button;
    button.dispatchEvent(finger('pointerdown', 5));
    button.dispatchEvent(finger('pointercancel', 5));
    button.dispatchEvent(finger('pointerup', 5));
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(clicks).toBe(0);
  });

  it('puts the focus in a text box rather than clicking it', () => {
    const box = document.createElement('input');
    document.body.append(box);
    document.elementFromPoint = () => box;
    walk();
    box.dispatchEvent(finger('pointerdown', 2));
    box.dispatchEvent(finger('pointerup', 2));
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(document.activeElement).toBe(box);
  });

  it('stops watching when told', () => {
    stop();
    walk();
    button.dispatchEvent(finger('pointerdown', 2));
    button.dispatchEvent(finger('pointerup', 2));
    vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
    expect(clicks).toBe(0);
  });
});
