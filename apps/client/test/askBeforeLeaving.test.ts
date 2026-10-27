// @vitest-environment jsdom
// The question the browser asks before the page is closed, reloaded or navigated away while the world is open: a
// `beforeunload` listener that cancels the event. What the browser shows is its own text, so only the cancelling is tested.

import { afterEach, describe, expect, it } from 'vitest';
import { askBeforeLeaving } from '../src/world/askBeforeLeaving';

const removers: Array<() => void> = [];
afterEach(() => {
  for (const remove of removers.splice(0)) remove();
});

/** What the browser dispatches on the window when the page is about to go. */
function leaving(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('askBeforeLeaving', () => {
  it('asks the browser to confirm: the page\'s beforeunload is cancelled', () => {
    expect(leaving().defaultPrevented).toBe(false);
    removers.push(askBeforeLeaving(window));
    expect(leaving().defaultPrevented).toBe(true);
  });

  it('sets returnValue too, which older Chrome, Edge and Safari ask for', () => {
    removers.push(askBeforeLeaving(window));
    const event = new Event('beforeunload', { cancelable: true }) as Event & { returnValue: unknown };
    // jsdom's plain Event has no beforeunload-style returnValue; this one records what the listener assigned
    let assigned: unknown = 'not assigned';
    Object.defineProperty(event, 'returnValue', { configurable: true, get: () => assigned, set: (value: unknown) => { assigned = value; } });
    window.dispatchEvent(event);
    expect(assigned).toBe('');
  });

  it('stops asking once the remove function has run, and may be removed again', () => {
    const remove = askBeforeLeaving(window);
    expect(leaving().defaultPrevented).toBe(true);
    remove();
    expect(leaving().defaultPrevented).toBe(false);
    expect(() => remove()).not.toThrow();
    expect(leaving().defaultPrevented).toBe(false);
  });

  it('asks on the window it is given, and only there', () => {
    const other = new EventTarget();
    removers.push(askBeforeLeaving(other));
    expect(leaving().defaultPrevented).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    other.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
