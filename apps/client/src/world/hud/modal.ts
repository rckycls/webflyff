// A window that holds the game's input while it is open, as Neuz's windows do in two ways:
//
// - WBS_MODAL (`CWndRevival`, `CWndMessageBox`): the window keeps the focus, a press elsewhere gives no other window any
//   (`CWndBase::WindowRootProc`, _Interface/WndBase.cpp:963-967), and `CNeuzApp::MsgProc` takes no key for the game
//   (Neuz/Neuz.cpp:1253-1309: it returns before the key table, so neither the hotkeys nor Escape's order run). Here a
//   backdrop over the windows' layer, under the window, takes every press, and every key is held (`ModalBackdrop`).
// - `CNeuzApp::KillWindow` (Neuz.cpp:1495-1524), which gives the stat points' confirm box every key while it is open: the
//   box holds the keydowns itself, with `holdKey`.
//
// A held key is stopped at the window's capture, before the game's handlers (the task bar's, the status window's, the
// moves', the windows' Escape) hear it. The task bar's F1 to F9 stay out of the browser's hands (F5 would reload the
// page), as the bar keeps them.

import type { WindowFrame } from './frame';

/** The keys the task bar takes from the browser (F1 to F9, `TaskBar`). */
const BAR_KEYS = /^F[1-9]$/;

/** The presses the backdrop keeps from the page when they land on it, beside the window. */
const PRESSES = ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'contextmenu'] as const;

/** Holds a key: none of the game's handlers hears it, and the browser keeps none of the task bar's. */
export function holdKey(event: KeyboardEvent): void {
  event.stopImmediatePropagation();
  if (event.type === 'keydown' && BAR_KEYS.test(event.key)) event.preventDefault();
}

/**
 * The backdrop of a WBS_MODAL window. Its `element`, with the window's frame in it, goes in the windows' layer; it covers
 * the layer (`.hud-modal`, over the other windows and the task bar), hidden until `show`. A press on it, where the world or
 * another window lies under it, goes nowhere; a press in the window is the window's, as ever. While shown, every key is
 * held. The window calls `show` before it opens its frame (which is then placed on the shown backdrop) and `hide` as it
 * closes; `onChange` hears both.
 */
export class ModalBackdrop {
  readonly element: HTMLElement;
  onChange?: (shown: boolean) => void;
  private readonly doc: Document;

  constructor(frame: WindowFrame, doc: Document = document) {
    this.doc = doc;
    const element = doc.createElement('div');
    element.className = 'hud-modal';
    element.hidden = true;
    element.append(frame.element);
    for (const type of PRESSES) {
      element.addEventListener(type, (event) => {
        if (event.target === element) event.stopPropagation();
      });
    }
    this.element = element;
  }

  get isShown(): boolean {
    return !this.element.hidden;
  }

  /** The width of the windows' layer the backdrop covers, in CSS pixels (0 before it is laid out). */
  get layerWidth(): number {
    return this.element.parentElement?.clientWidth ?? 0;
  }

  show(): void {
    if (this.isShown) return;
    this.element.hidden = false;
    this.listen(true);
    this.onChange?.(true);
  }

  hide(): void {
    if (!this.isShown) return;
    this.element.hidden = true;
    this.listen(false);
    this.onChange?.(false);
  }

  private listen(on: boolean): void {
    const view = this.doc.defaultView ?? window;
    for (const type of ['keydown', 'keyup'] as const) {
      if (on) view.addEventListener(type, this.hold, true);
      else view.removeEventListener(type, this.hold, true);
    }
  }

  /** This backdrop's own listener: two open at once (the log-out box, then a death) each hold the keys until they hide. */
  private readonly hold = (event: KeyboardEvent): void => holdKey(event);
}
