// @vitest-environment jsdom
// A radio button drawn with `ButtRadio.bmp` (Piece 7 M4): `CTheme::RenderWndButton_6Texture` (`ITheme.cpp:1418-1535`)
// picks one of six 14 x 14 frames.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { radioButton, radioFrame } from '../src/world/hud/radio';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

afterEach(() => {
  document.body.replaceChildren();
});

describe('the radio button', () => {
  it('picks the frame of RenderWndButton_6Texture: 0/1 unchecked, 2/3 checked or pressed, 4/5 disabled', () => {
    const frame = (checked: boolean, disabled: boolean, highlighted: boolean, pressed: boolean) =>
      radioFrame({ checked, disabled, highlighted, pressed });
    expect([
      frame(false, false, true, false), frame(false, false, false, false),
      frame(true, false, true, false), frame(true, false, false, false), frame(false, false, false, true),
      frame(false, true, false, false), frame(true, true, false, false), frame(false, true, false, true),
    ]).toEqual([0, 1, 2, 3, 3, 4, 5, 5]);
  });

  it('shows its label, its checked and disabled states, and calls its press', () => {
    const press = vi.fn();
    const radio = radioButton(document, art, 'Sequentially', { left: 316, top: 54, width: 114, height: 16 }, press);
    document.body.append(radio.element);
    expect(radio.element.textContent).toBe('Sequentially');
    expect(radio.element.getAttribute('aria-checked')).toBe('false');
    radio.checked = true;
    expect([radio.checked, radio.element.getAttribute('aria-checked'), radio.element.dataset.frame]).toEqual([true, 'true', '3']);
    radio.element.click();
    expect(press).toHaveBeenCalledTimes(1);
    radio.disabled = true;
    expect([radio.element.disabled, radio.element.dataset.frame]).toEqual([true, '5']);
    expect(radio.element.style.left).toBe('316px');
  });
});
