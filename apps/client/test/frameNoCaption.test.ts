// @vitest-environment jsdom
// 2026-11-09: the window frame's options for the chat (docs/superpowers/specs/2026-11-09-chat-desktop-research.md §1): a
// window with no WBS_CAPTION, its own tile set, its client area 4 4 6 6 in, moved by any free part, its edges dragged.
import { describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { WindowFrame, setLayoutBottom } from '../src/world/hud/frame';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

function layer(width = 800, height = 450): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  document.body.append(element);
  return element;
}

const pointer = (type: string, x: number, y: number): MouseEvent =>
  new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true });

const chatFrame = (): WindowFrame => new WindowFrame('Chatting', art, {
  width: 528, height: 128, mobileScale: 1, caption: false, tiles: 'WndTile3', insets: [4, 4, 6, 6],
  resize: { width: 464, height: 48 }, closeButton: false,
});

describe('WindowFrame with no caption (CWndChat)', () => {
  it('has no title bar, its client area 4 4 6 6 in, and the WndTile300 to WndTile311 frame', () => {
    const frame = chatFrame();
    expect(frame.element.querySelector('.hud-window-title')).toBeNull();
    expect(frame.element.querySelector('.hud-window-close')).toBeNull();
    expect(frame.element.getAttribute('aria-label')).toBe('Chatting');
    expect([frame.body.style.left, frame.body.style.top, frame.body.style.width, frame.body.style.height])
      .toEqual(['4px', '4px', '518px', '118px']);
    const tiles = [...frame.element.querySelectorAll<HTMLElement>('.hud-window-frame > div')];
    expect(tiles[0]!.style.backgroundImage).toContain('/assets/ui/wndtile300.png');
    expect(tiles.at(-1)!.style.backgroundImage).toContain('/assets/ui/wndtile311.png');
  });

  it('moves by a press on any free part, not on a control; the move lock keeps it still', () => {
    const frame = chatFrame();
    layer().append(frame.element);
    frame.open({ x: 100, y: 100 });
    const button = document.createElement('button');
    frame.body.append(button);
    frame.body.dispatchEvent(pointer('pointerdown', 200, 150));
    window.dispatchEvent(pointer('pointermove', 230, 120));
    window.dispatchEvent(pointer('pointerup', 230, 120));
    expect(frame.position).toEqual({ x: 130, y: 70 });
    button.dispatchEvent(pointer('pointerdown', 240, 130));
    window.dispatchEvent(pointer('pointermove', 300, 200));
    window.dispatchEvent(pointer('pointerup', 300, 200));
    expect(frame.position).toEqual({ x: 130, y: 70 });
    frame.movable = false;
    frame.body.dispatchEvent(pointer('pointerdown', 200, 150));
    window.dispatchEvent(pointer('pointermove', 260, 200));
    window.dispatchEvent(pointer('pointerup', 260, 200));
    expect(frame.position).toEqual({ x: 130, y: 70 });
  });

  it('drags an edge in 16 px steps, the frame laid again and the owner told the new size', () => {
    const frame = chatFrame();
    const onResize = vi.fn();
    frame.onResize = onResize;
    layer().append(frame.element);
    frame.open({ x: 0, y: 0 });
    // the right edge's band, 6 px in (GetResizeDir)
    frame.element.dispatchEvent(pointer('pointerdown', 526, 60));
    window.dispatchEvent(pointer('pointermove', 526 + 37, 60));
    window.dispatchEvent(pointer('pointerup', 526 + 37, 60));
    expect(frame.element.style.width).toBe('560px');
    expect(frame.body.style.width).toBe('550px');
    expect(onResize).toHaveBeenLastCalledWith(560, 128);
    const tiles = [...frame.element.querySelectorAll<HTMLElement>('.hud-window-frame > div')];
    expect(tiles.find((tile) => tile.dataset.tile === '2')!.style.left).toBe('544px');
    // the move lock does not stop the edges (it takes WBS_MOVE away, not WBS_THICKFRAME)
    frame.movable = false;
    frame.element.dispatchEvent(pointer('pointerdown', 2, 60));
    window.dispatchEvent(pointer('pointermove', 2 + 48, 60));
    window.dispatchEvent(pointer('pointerup', 2 + 48, 60));
    expect(frame.position.x).toBe(48);
    expect(frame.element.style.width).toBe('512px');
  });

  it('a window put at the bottom goes back onto the task bar when the bar takes its room', () => {
    const frame = chatFrame();
    const parent = layer();
    parent.append(frame.element);
    frame.open({ x: 0, y: Number.MAX_SAFE_INTEGER });
    expect(frame.position).toEqual({ x: 0, y: 450 - 128 });
    setLayoutBottom(parent, 48);
    expect(frame.position).toEqual({ x: 0, y: 450 - 48 - 128 });
  });
});
