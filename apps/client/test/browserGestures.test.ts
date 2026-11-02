import { describe, expect, it } from 'vitest';
import { blockBrowserGestures } from '../src/world/browserGestures';

describe('game browser defaults', () => {
  it('blocks zoom and double-click defaults without swallowing game events or ordinary scrolling', () => {
    const surface = new EventTarget();
    const keys = new EventTarget();
    const release = blockBrowserGestures(surface as HTMLElement, keys);
    let doubleClicks = 0;
    surface.addEventListener('dblclick', () => doubleClicks++);
    for (const type of ['dblclick', 'gesturestart', 'gesturechange']) {
      const event = new Event(type, { cancelable: true });
      surface.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(doubleClicks).toBe(1);
    const pinch = Object.assign(new Event('wheel', { cancelable: true }), { ctrlKey: true });
    surface.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    const scroll = new Event('wheel', { cancelable: true });
    surface.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    const zoomKey = Object.assign(new Event('keydown', { cancelable: true }), { ctrlKey: true, key: '+' });
    keys.dispatchEvent(zoomKey);
    expect(zoomKey.defaultPrevented).toBe(true);
    release();
    const after = new Event('gesturestart', { cancelable: true });
    surface.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
