// @vitest-environment jsdom
// A window laid out from its resdata.inc entry (ResWindow, hud/resWindow.ts): the frame, and each control at its rect.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { ResWindow, resRect } from '../src/world/hud/resWindow';
import type { ResLayout } from '../src/world/hud/resWindow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** APP_CHANGENAME (resdata.inc:23181-23226): "WndTile00.tga" tiled, 224 x 128. */
const CHANGE_NAME: ResLayout = {
  title: 'Change Name', width: 224, height: 128, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [26, 18, 192, 32], text: 'Please input the new name.' },
    { kind: 'button', id: 'WIDC_OK', rect: [24, 68, 96, 88], picture: 'ButtOk.tga', label: 'OK' },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [110, 68, 182, 88], picture: 'ButtCancel.tga', label: 'Cancel' },
    { kind: 'edit', id: 'WIDC_EDIT_CHANGENAME', rect: [24, 42, 188, 62], tile: 'WndEditTile00.tga', maxLength: 16 },
  ],
};

afterEach(() => document.body.replaceChildren());

describe('ResWindow', () => {
  it('turns resdata.inc rects (left, top, right, bottom) into left, top, width, height', () => {
    expect(resRect([24, 42, 188, 62])).toEqual({ left: 24, top: 42, width: 164, height: 20 });
  });

  it('places each control at its rect: the static\'s text, the picture buttons, the edit in its tiles', () => {
    const window = new ResWindow(CHANGE_NAME, art);
    document.body.append(window.element);
    window.open();
    expect(window.isOpen).toBe(true);
    expect(window.frame.element.querySelector('.hud-window-title')!.textContent).toBe('Change Name');
    expect(window.control('WIDC_STATIC1').textContent).toBe('Please input the new name.');
    const ok = window.button('WIDC_OK');
    expect([ok.style.left, ok.style.top, ok.style.width, ok.style.height]).toEqual(['24px', '68px', '72px', '20px']);
    expect(ok.style.backgroundImage).toContain('/assets/ui/buttok.png');
    expect(ok.getAttribute('aria-label')).toBe('OK');
    const input = window.input('WIDC_EDIT_CHANGENAME');
    expect(input.maxLength).toBe(16);
    const box = input.parentElement!;
    expect([box.style.left, box.style.top, box.style.width]).toEqual(['24px', '42px', '164px']);
    // 20 tiles of 8 across, 2 down: the nine pieces' corners and edges
    expect(box.querySelector('.hud-edit-tiles')!.children.length).toBe(6);
    expect(() => window.control('WIDC_NOPE')).toThrow();
  });

  it('runs onClose once as it closes, and its modal backdrop hides', () => {
    const window = new ResWindow(CHANGE_NAME, art);
    document.body.append(window.element);
    const onClose = vi.fn();
    window.onClose = onClose;
    window.open();
    expect(window.modal!.isShown).toBe(true);
    window.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.modal!.isShown).toBe(false);
    window.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
