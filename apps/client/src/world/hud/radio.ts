// A radio button drawn with `ButtRadio.bmp` (Piece 7 M4: the party window's modes), as `CWndButton` draws a radio with a
// texture:
//
//   CTheme::RenderWndButtonRadio     _Interface/ITheme.cpp:1561-1575   the picture, then the title at x = width / 6 + 2,
//                                                                       centred in height
//   CTheme::RenderWndButton_6Texture ITheme.cpp:1418-1535               six frames side by side (84 x 14: six of 14 x 14):
//                                                                       enabled, neither checked nor pressed, 0 lit or 1;
//                                                                       checked or pressed, 2 lit or 3; disabled, 4, or 5
//                                                                       checked or pressed
//
// The style sheet draws the lit and pressed frames (`:hover`, `:active`) from the frame this sets (`data-frame`).

import { themeUrl } from './art';
import type { UiArt } from './art';
import { place } from './button';
import type { ControlRect } from './button';

/** One frame of `ButtRadio.bmp`. */
const FRAME = 14;

/** The frame `RenderWndButton_6Texture` draws. */
export function radioFrame(state: { checked: boolean; disabled: boolean; highlighted: boolean; pressed: boolean }): number {
  const on = state.checked || state.pressed;
  if (state.disabled) return on ? 5 : 4;
  if (on) return state.highlighted ? 2 : 3;
  return state.highlighted ? 0 : 1;
}

export interface RadioButton {
  readonly element: HTMLButtonElement;
  checked: boolean;
  disabled: boolean;
}

/**
 * 2026-11-09: a radio or check whose picture is the whole button, six frames of `frame` px side by side (the chat's tabs,
 * ButtChatChat.BMP's 46 x 17; Lock, System; ButtWndLock.tga's 15 x 14), as `RenderWndButtonRadio` / `Check` draw one:
 * the frame `radioFrame` picks at the rect's top left, and the title at `frame + 2`, past a button no wider than a
 * frame, so not seen (ITheme.cpp:1533-1575). With `label`, the title is drawn beside the frame (the filter's checks, a
 * ButtCheck.bmp frame of 14). The style sheet picks the frame (`.hud-six-frame`, `data-frame`, `--hud-frame`).
 */
export function sixFrameButton(
  doc: Document, art: UiArt, picture: string, frame: number, rect: ControlRect,
  options: { role: 'radio' | 'checkbox'; name: string; label?: string; tooltip?: string }, press: () => void,
): RadioButton {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = 'hud-six-frame';
  element.tabIndex = -1;
  element.setAttribute('role', options.role);
  element.setAttribute('aria-label', options.name);
  if (options.tooltip !== undefined) element.title = options.tooltip;
  element.addEventListener('mousedown', (event) => event.preventDefault());
  place(element, rect);
  element.style.setProperty('--hud-frame', `${frame}px`);
  const box = doc.createElement('span');
  box.className = 'hud-six-frame-picture';
  box.style.width = `${Math.min(frame, rect.width)}px`;
  box.style.backgroundImage = themeUrl(art, picture);
  element.append(box);
  if (options.label !== undefined) {
    const title = doc.createElement('span');
    title.className = 'hud-radio-label';
    title.style.left = `${frame + 2}px`;
    title.textContent = options.label;
    element.append(title);
    element.toggleAttribute('data-labelled', true);
  }
  element.addEventListener('click', press);
  let checked = false;
  const draw = (): void => {
    element.setAttribute('aria-checked', String(checked));
    element.dataset.frame = String(radioFrame({ checked, disabled: element.disabled, highlighted: false, pressed: false }));
  };
  draw();
  return {
    element,
    get checked() { return checked; },
    set checked(value: boolean) { checked = value; draw(); },
    get disabled() { return element.disabled; },
    set disabled(value: boolean) { element.disabled = value; draw(); },
  };
}

export function radioButton(doc: Document, art: UiArt, label: string, rect: ControlRect, press: () => void): RadioButton {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = 'hud-radio';
  element.tabIndex = -1;
  element.setAttribute('role', 'radio');
  element.addEventListener('mousedown', (event) => event.preventDefault());
  place(element, rect);
  const box = doc.createElement('span');
  box.className = 'hud-radio-box';
  box.style.backgroundImage = themeUrl(art, 'ButtRadio.bmp');
  const title = doc.createElement('span');
  title.className = 'hud-radio-label';
  title.style.left = `${FRAME + 2}px`;
  title.textContent = label;
  element.append(box, title);
  element.addEventListener('click', press);
  let checked = false;
  const draw = (): void => {
    element.setAttribute('aria-checked', String(checked));
    element.dataset.frame = String(radioFrame({ checked, disabled: element.disabled, highlighted: false, pressed: false }));
  };
  draw();
  return {
    element,
    get checked() { return checked; },
    set checked(value: boolean) { checked = value; draw(); },
    get disabled() { return element.disabled; },
    set disabled(value: boolean) { element.disabled = value; draw(); },
  };
}
