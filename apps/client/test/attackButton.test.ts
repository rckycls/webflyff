// @vitest-environment jsdom
// The touch Attack button's let-go (Piece 7 M2, plan Decisions 4): with a wand or a bow it is held to charge.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttackButton } from '../src/world/hud/attackButton';

const touch = (type: string): Event => Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
  pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('AttackButton: the let-go (Piece 7 M2)', () => {
  it('pointerup and pointercancel call the release callback once, after a press', () => {
    const pressed = vi.fn();
    const released = vi.fn();
    const button = new AttackButton(pressed, document, { onRelease: released });
    document.body.append(button.element);
    button.update(true);
    button.element.dispatchEvent(touch('pointerdown'));
    expect([pressed.mock.calls.length, released.mock.calls.length]).toEqual([1, 0]);
    button.element.dispatchEvent(touch('pointerup'));
    button.element.dispatchEvent(touch('pointercancel'));
    expect(released).toHaveBeenCalledTimes(1);
    button.element.dispatchEvent(touch('pointerdown'));
    button.element.dispatchEvent(touch('pointercancel'));
    expect(released).toHaveBeenCalledTimes(2);
    button.dispose();
  });

  it("another finger's let-go does not release a held button (Piece 7 M5, Review Focus 5)", () => {
    const pressed = vi.fn();
    const released = vi.fn();
    const button = new AttackButton(pressed, document, { onRelease: released });
    document.body.append(button.element);
    button.update(true);
    button.element.dispatchEvent(touch('pointerdown'));
    // the stick's thumb, or a tap on another button, lifts: its pointerup bubbles to the document
    document.body.dispatchEvent(Object.assign(touch('pointerup'), { pointerId: 2 }));
    document.body.dispatchEvent(Object.assign(touch('pointercancel'), { pointerId: 3 }));
    expect(released).not.toHaveBeenCalled();
    document.body.dispatchEvent(touch('pointerup')); // its own finger, off the button
    expect(released).toHaveBeenCalledTimes(1);
    button.dispose();
  });

  it('a disabled button presses nothing and releases nothing; a click is a press and its let-go', () => {
    const pressed = vi.fn();
    const released = vi.fn();
    const button = new AttackButton(pressed, document, { onRelease: released });
    document.body.append(button.element);
    button.element.dispatchEvent(touch('pointerdown'));
    button.element.dispatchEvent(touch('pointerup'));
    expect([pressed.mock.calls.length, released.mock.calls.length]).toEqual([0, 0]);
    button.update(true);
    button.element.click();
    expect([pressed.mock.calls.length, released.mock.calls.length]).toEqual([1, 1]);
    button.dispose();
  });
});

describe('AttackButton: a let-go off the button (final review, Important 3)', () => {
  it('a let-go anywhere on the page ends the press, also once the button went disabled under the finger', () => {
    const released = vi.fn();
    const button = new AttackButton(() => {}, document, { onRelease: released });
    document.body.append(button.element);
    button.update(true);
    button.element.dispatchEvent(touch('pointerdown'));
    button.update(false); // the target died mid-press: the screen disables the button
    document.body.dispatchEvent(touch('pointerup'));
    expect(released).toHaveBeenCalledTimes(1);
    // no press under way: a let-go elsewhere is nothing
    document.body.dispatchEvent(touch('pointerup'));
    expect(released).toHaveBeenCalledTimes(1);
    button.dispose();
  });
});

/** `event` as an input event the page was given at `timeStamp` ms (`Event.timeStamp`). */
const stamped = (event: Event, timeStamp: number): Event => Object.defineProperty(event, 'timeStamp', { value: timeStamp });

describe('AttackButton: the times of its press and let-go (the phone wand e2e under load)', () => {
  it('hands each the time of the event that made it, as the canvas presses are timed, not the time its handler ran', () => {
    const pressed = vi.fn();
    const released = vi.fn();
    const button = new AttackButton(pressed, document, { onRelease: released });
    document.body.append(button.element);
    button.update(true);
    button.element.dispatchEvent(stamped(touch('pointerdown'), 1000));
    document.body.dispatchEvent(stamped(touch('pointerup'), 1900));
    expect([pressed.mock.calls, released.mock.calls]).toEqual([[[1000]], [[1900]]]);
    // a key's click (detail 0: not a touch's own click) is a press and its let-go at the click's time
    button.element.dispatchEvent(stamped(new MouseEvent('click', { bubbles: true, detail: 0 }), 3000));
    expect([pressed.mock.calls.at(-1), released.mock.calls.at(-1)]).toEqual([[3000], [3000]]);
    button.dispose();
  });
});
