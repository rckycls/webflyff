// A button drawn with a theme picture, as `CWndButton` draws one with a texture: `CTheme::RenderWndButton`
// (`_Interface/ITheme.cpp`) hands it to `RenderWndButton_4Texture` (:1336-1414), which cuts the picture in four side by
// side and draws one quarter at the button's top left at its own size: the first while the pointer is over the button
// (highlighted), the second at rest, the third pressed (or checked), the fourth disabled. The style sheet picks the
// quarter (`.hud-picture-button`, by `--hud-quarter`, the quarter's width).

import { themeUrl } from './art';
import type { UiArt } from './art';

/** A control's rectangle in its window's client area, in CSS pixels (resdata.inc's, or the one the C++ creates it with). */
export interface ControlRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Places a control's element at `rect` in its window's client area. */
export function place(element: HTMLElement, rect: ControlRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/**
 * A button at `rect` drawn with the theme picture `picture`, whose quarters are `quarter` px wide. It takes no focus (a
 * press gives it none, and it is out of the tab order), so Space and Enter never press it again: Neuz's buttons are
 * pressed with the pointer only.
 */
export function pictureButton(
  doc: Document, art: UiArt, picture: string, rect: ControlRect, quarter: number, press: () => void,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'hud-picture-button';
  button.tabIndex = -1;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  place(button, rect);
  button.style.backgroundImage = themeUrl(art, picture);
  button.style.setProperty('--hud-quarter', `${quarter}px`);
  button.addEventListener('click', press);
  return button;
}
