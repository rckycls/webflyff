// A window laid out from its `Resource/resdata.inc` entry (2026-11-05, the item windows in Neuz's look): the frame
// (`WindowFrame`: tiled, or one picture), and its controls at their rects, drawn as Neuz's controls draw them. The windows
// built on it (itemWindowViews.ts, upgradeWindows.ts) give their entry as data and wire what their class does.
//
//   resdata.inc                       APP_* "<picture>" <tiled> <width> <height> <style> ..., then each control:
//                                     WTYPE_* WIDC_* "<picture>" <tiled> <left> <top> <right> <bottom> <style> ...
//   CWndBase::AdditionalSkinTexture   _Interface/WndBase.cpp:2524-2619   a tiled control: the nine edit pieces, every 8 px
//   CWndStatic::OnDraw                _Interface/WndControl.cpp          a static's text at its top left, in its colour
//   CWndButton (a picture)            ITheme.cpp:1336-1414               the picture's four states (`pictureButton`)
//   CWndEdit                          _Interface/WndEditCtrl.cpp         the text 3 px in (`hud-res-edit`)
//   CWndText                          _Interface/WndControl.cpp          its text inside 4 4 8 10 of its tiled box

import type { UiArt } from './art';
import { themeUrl } from './art';
import { pictureButton, place } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import type { FrameLayout } from './frame';
import { ModalBackdrop } from './modal';
import { EDIT, editTiles } from './tiles';

/** A rect as resdata.inc writes it: left, top, right, bottom in the client area. */
export type ResRect = readonly [left: number, top: number, right: number, bottom: number];

/** A resdata.inc rect as a `ControlRect`. */
export function resRect([left, top, right, bottom]: ResRect): ControlRect {
  return { left, top, width: right - left, height: bottom - top };
}

/** One control of a resdata.inc entry. `id` is its WIDC_* name; `tile` its nine-piece picture when tiled. */
export type ResControl =
  /** WTYPE_STATIC: its text (or none) at its top left; a tiled one is a box of edit pieces, a picture one its picture. */
  | { kind: 'static'; id: string; rect: ResRect; text?: string; tile?: string; picture?: string; align?: 'left' | 'center' }
  /** WTYPE_TEXT: a tiled box whose text wraps inside 4 4 8 10. */
  | { kind: 'text'; id: string; rect: ResRect; text?: string; tile?: string }
  /** WTYPE_BUTTON with a picture of four states side by side. */
  | { kind: 'button'; id: string; rect: ResRect; picture: string; label: string }
  /** WTYPE_EDITCTRL: a text field in its tiled box. */
  | { kind: 'edit'; id: string; rect: ResRect; tile?: string; maxLength?: number }
  /** WTYPE_CUSTOM: an area the window draws in itself. */
  | { kind: 'custom'; id: string; rect: ResRect }
  /** WTYPE_LISTBOX: rows of text in a tiled box, one chosen. */
  | { kind: 'list'; id: string; rect: ResRect; tile?: string };

/** A window's entry: its title (`IDS_RESDATA_INC_*` resolved), size, frame and controls. */
export interface ResLayout {
  title: string;
  width: number;
  height: number;
  /** The whole window's picture when not tiled (`bTile` 0); none for the tiled frame. */
  texture?: string;
  /** WBS_MODAL windows hold every press and key while open. */
  modal?: boolean;
  controls: readonly ResControl[];
  /** The frame's options beyond the entry's (a phone's scale). */
  frame?: Partial<FrameLayout>;
}

/** The inside of a WTYPE_TEXT's box (`CWndBase::SetWndRect` of a control with a frame: 4 4 8 10). */
const TEXT_INSET = { left: 4, top: 4, right: 8, bottom: 10 } as const;

/**
 * A window built from its entry. `control(id)` is a control's element (the input of an edit, the text of a static or a
 * text, the area of a custom or a list); `button(id)` a button. `open` shows it centred (`MoveParentCenter`), with its
 * backdrop when modal; `close` hides it and runs `onClose`.
 */
export class ResWindow {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop | null;
  /** Runs once each time the window closes, by its button, Escape or `close`. */
  onClose: () => void = () => {};
  private readonly controls = new Map<string, HTMLElement>();

  constructor(readonly layout: ResLayout, private readonly art: UiArt, private readonly doc: Document = document) {
    const frame = new WindowFrame(layout.title, art, {
      width: layout.width, height: layout.height, texture: layout.texture, mobileScale: 1, fitWhole: true, ...layout.frame,
    }, doc);
    frame.element.classList.add('hud-res-window');
    frame.onClose = () => {
      this.modal?.hide();
      this.onClose();
    };
    for (const control of layout.controls) frame.body.append(this.build(control));
    this.frame = frame;
    this.modal = layout.modal === true ? new ModalBackdrop(frame, doc) : null;
  }

  /** What goes in the windows' layer: the backdrop with the window in it, or the window. */
  get element(): HTMLElement {
    return this.modal?.element ?? this.frame.element;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** A control's element by its WIDC_* name; throws for one the entry lacks (a typo in a window's wiring). */
  control<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.controls.get(id);
    if (element === undefined) throw new Error(`no control ${id} in ${this.layout.title}`);
    return element as T;
  }

  button(id: string): HTMLButtonElement {
    return this.control<HTMLButtonElement>(id);
  }

  input(id: string): HTMLInputElement {
    return this.control<HTMLInputElement>(id);
  }

  /** Shows it centred (or at `at`), over a backdrop when modal. */
  open(at: { x: number; y: number } | 'center' = 'center'): void {
    this.modal?.show();
    this.frame.open(at);
  }

  close(): void {
    if (this.frame.isOpen) this.frame.close();
  }

  dispose(): void {
    this.onClose = () => {};
    this.close();
    this.element.remove();
  }

  private build(control: ResControl): HTMLElement {
    const rect = resRect(control.rect);
    const doc = this.doc;
    const box = (className: string, tile?: string): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      place(element, rect);
      if (tile !== undefined) {
        element.append(editTiles(doc, this.art, Math.trunc(rect.width / EDIT), Math.trunc(rect.height / EDIT), tile));
      }
      element.dataset.control = control.id;
      return element;
    };
    switch (control.kind) {
      case 'static': {
        const element = box('hud-res-static', control.tile);
        if (control.picture !== undefined) {
          element.style.backgroundImage = themeUrl(this.art, control.picture);
          element.classList.add('hud-res-picture');
        }
        const text = doc.createElement('span');
        text.className = 'hud-res-static-text';
        if (control.align === 'center') text.classList.add('is-centred');
        text.textContent = control.text ?? '';
        element.append(text);
        this.controls.set(control.id, text);
        return element;
      }
      case 'text': {
        const element = box('hud-res-text', control.tile);
        const text = doc.createElement('div');
        text.className = 'hud-res-text-body';
        place(text, {
          left: TEXT_INSET.left, top: TEXT_INSET.top,
          width: rect.width - TEXT_INSET.left - TEXT_INSET.right, height: rect.height - TEXT_INSET.top - TEXT_INSET.bottom,
        });
        text.textContent = control.text ?? '';
        element.append(text);
        this.controls.set(control.id, text);
        return element;
      }
      case 'button': {
        const button = pictureButton(doc, this.art, control.picture, rect, rect.width, () => {});
        button.dataset.control = control.id;
        button.setAttribute('aria-label', control.label);
        this.controls.set(control.id, button);
        return button;
      }
      case 'edit': {
        const element = box('hud-res-edit', control.tile);
        const input = doc.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        if (control.maxLength !== undefined) input.maxLength = control.maxLength;
        // the window's keys are the field's while it is typed in: no game hotkey hears them
        input.addEventListener('keydown', (event) => event.stopPropagation());
        input.addEventListener('keyup', (event) => event.stopPropagation());
        element.append(input);
        this.controls.set(control.id, input);
        return element;
      }
      case 'custom': {
        const element = box('hud-res-custom');
        this.controls.set(control.id, element);
        return element;
      }
      case 'list': {
        const element = box('hud-res-list', control.tile);
        const rows = doc.createElement('div');
        rows.className = 'hud-res-list-rows';
        rows.setAttribute('role', 'listbox');
        place(rows, { left: 2, top: 2, width: rect.width - 4, height: rect.height - 4 });
        element.append(rows);
        this.controls.set(control.id, rows);
        return element;
      }
    }
  }
}
