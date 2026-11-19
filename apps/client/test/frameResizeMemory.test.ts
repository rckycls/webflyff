// @vitest-environment jsdom
// 2026-11-20 (mouse-drag-ui): a captioned WBS_THICKFRAME window's edges (the Message window, the Navigator), the most an
// edge gives (AdjustMaxRect), and the windows' kept places (regInfo.dat, windowMemory.ts).
import { describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { WindowFrame, rememberWindows, resizeRect } from '../src/world/hud/frame';
import { WINDOW_RECTS_KEY, WindowMemory } from '../src/world/hud/windowMemory';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

function layer(width = 800, height = 600): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  document.body.append(element);
  return element;
}

const pointer = (type: string, x: number, y: number): MouseEvent =>
  new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true });

describe('captioned resizable windows (2026-11-20)', () => {
  it('keeps the most size from the edge that did not move (AdjustMaxRect)', () => {
    const old = { left: 300, top: 0, width: 144, height: 160 };
    const room = { width: 800, height: 600 }, least = { width: 96, height: 112 }, most = { width: 192, height: 208 };
    expect(resizeRect(old, 7, -40, 40, room, least, most)).toEqual({ left: 268, top: 0, width: 176, height: 192 });
    expect(resizeRect(old, 7, -200, 200, room, least, most)).toEqual({ left: 252, top: 0, width: 192, height: 208 });
    expect(resizeRect(old, 4, 200, 0, room, least, most)).toEqual({ left: 300, top: 0, width: 192, height: 160 });
    expect(resizeRect(old, 4, -200, 0, room, least, most)).toEqual({ left: 300, top: 0, width: 96, height: 160 });
  });

  it("drags a captioned window's edge (the Message window showed the cursors only), its title still moves it", () => {
    const frame = new WindowFrame('Message - Lead', art, { width: 336, height: 288, resize: { width: 160, height: 160 } });
    const onResize = vi.fn();
    frame.onResize = onResize;
    layer().append(frame.element);
    frame.open({ x: 0, y: 0 });
    // the bottom edge's band
    frame.element.dispatchEvent(pointer('pointerdown', 100, 286));
    window.dispatchEvent(pointer('pointermove', 100, 286 + 40));
    window.dispatchEvent(pointer('pointerup', 100, 286 + 40));
    expect(onResize).toHaveBeenLastCalledWith(336, 320);
    // a press in the title bar below its top edge's 6 px moves it
    const title = frame.element.querySelector('.hud-window-title')!;
    title.dispatchEvent(pointer('pointerdown', 100, 10));
    window.dispatchEvent(pointer('pointermove', 140, 40));
    window.dispatchEvent(pointer('pointerup', 140, 40));
    expect(frame.position).toEqual({ x: 40, y: 30 });
    expect(frame.size).toEqual({ width: 336, height: 320 });
  });
});

describe('kept window places (regInfo.dat)', () => {
  it('keeps a place per key with the screen size, read back only on the same size', () => {
    let screen = '1280x720';
    const memory = new WindowMemory(window.localStorage, () => screen);
    memory.save('APP_INVENTORY', { x: 10, y: -5 });
    expect(memory.load('APP_INVENTORY')).toEqual({ screen: '1280x720', x: 10, y: 0 });
    screen = '1920x1080';
    expect(memory.load('APP_INVENTORY')).toBeNull();
    // a blocked storage: nothing kept, nothing thrown
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    const none = new WindowMemory(blocked, () => screen);
    expect(() => none.save('APP_INVENTORY', { x: 1, y: 1 })).not.toThrow();
    expect(none.load('APP_INVENTORY')).toBeNull();
    window.localStorage.removeItem(WINDOW_RECTS_KEY);
  });

  it('a remembered window opens where it closed, a resizable one at its size too', () => {
    rememberWindows(document, window.localStorage);
    const parent = layer();
    const bag = new WindowFrame('Inventory', art, { width: 240, height: 464 });
    bag.rememberAs = 'APP_INVENTORY';
    parent.append(bag.element);
    bag.open({ x: 500, y: 80 });
    expect(bag.position).toEqual({ x: 500, y: 80 });
    bag.close();
    bag.open({ x: 500, y: 80 });
    expect(bag.position).toEqual({ x: 500, y: 80 });
    bag.element.style.left = '120px'; bag.element.style.top = '40px';
    bag.close();
    bag.open({ x: 500, y: 80 });
    expect(bag.position).toEqual({ x: 120, y: 40 });
    bag.close();
    const nav = new WindowFrame('Navigator', art, {
      width: 144, height: 160, resize: { width: 96, height: 112 }, resizeMax: { width: 192, height: 208 },
    });
    nav.rememberAs = 'APP_NAVIGATOR';
    parent.append(nav.element);
    nav.open({ x: 600, y: 0 });
    nav.setSize(176, 192);
    nav.close();
    const again = new WindowFrame('Navigator', art, {
      width: 144, height: 160, resize: { width: 96, height: 112 }, resizeMax: { width: 192, height: 208 },
    });
    again.rememberAs = 'APP_NAVIGATOR';
    parent.append(again.element);
    again.open({ x: 9999, y: 0 });
    expect(again.size).toEqual({ width: 176, height: 192 });
    expect(again.position).toEqual({ x: 600, y: 0 });
    // a window with no key opens where it is told
    const box = new WindowFrame('Box', art, { width: 100, height: 100 });
    parent.append(box.element);
    box.open({ x: 5, y: 6 });
    box.element.style.left = '50px';
    box.close();
    box.open({ x: 5, y: 6 });
    expect(box.position).toEqual({ x: 5, y: 6 });
    again.close();
    window.localStorage.removeItem(WINDOW_RECTS_KEY);
  });
});
