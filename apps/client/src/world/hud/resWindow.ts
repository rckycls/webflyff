// A window laid out from its `Resource/resdata.inc` entry (2026-11-05, the item windows in Neuz's look): the frame
// (`WindowFrame`: tiled, or one picture), and its controls at their rects, drawn as Neuz's controls draw them. The windows
// built on it (itemWindowViews.ts, upgradeWindows.ts) give their entry as data and wire what their class does. The rules
// are the research's (docs/superpowers/specs/2026-11-05-ui-fixes-research.md §2.0).
//
//   resdata.inc                       APP_* "<picture>" <tiled> <width> <height> <style> ..., then each control:
//                                     WTYPE_* WIDC_* "<picture>" <tiled> <left> <top> <right> <bottom> <style> ...
//   CWndBase::AdditionalSkinTexture   _Interface/WndBase.cpp:2524-2620   a tiled control: the nine edit pieces, every 8 px,
//                                                                       16 px short of the right with a scroll bar
//   CWndStatic::OnDraw                _Interface/WndControl.cpp:54-205   a plain static's title blue 0xff2e70a9 at (2, 2), a
//                                                                       group box's white at (4, 4), each drawn twice (x, x+1)
//   CWndText                          WndControl.cpp:2545-2603           black words 6 px in (15 more off the right with a
//                                                                       scroll bar)
//   CWndEdit                          _Interface/WndEditCtrl.cpp:1317-1326  3 px in left, top and right; wraps at any letter
//   CWndScrollBar                     WndControl.cpp:1599-1793           ButtVScrUp/Down 16 x 16 at the ends, ButtVScrBar
//                                                                       stretched, the thumb PUp + PBar + PDown
//   CWndComboBox                      WndControl.cpp:4668-4910           an edit, ButtQuickListDn at its right 20 px, a list
//                                                                       under it
//   CWndButton (a picture)            ITheme.cpp:1336-1414               the picture's four states (`pictureButton`)

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
  /**
   * WTYPE_STATIC: a plain one (style 0x2220000) its blue title; a group box (0x2220001, `group`) its tiles, white title; a
   * picture one (0x2220002, `picture`) its picture at its own size from the top left.
   */
  | { kind: 'static'; id: string; rect: ResRect; text?: string; group?: string; picture?: string }
  /** WTYPE_TEXT: a tiled box whose black words wrap 6 px in; `scroll` with a scroll bar (WBS_VSCROLL). */
  | { kind: 'text'; id: string; rect: ResRect; text?: string; tile?: string; scroll?: boolean }
  /**
   * WTYPE_BUTTON with a picture of four states side by side, `quarter` px each (72 for ButtOk and its kind): a state is
   * drawn at its own size from the rect's top left, so the button is never wider than a quarter.
   */
  | { kind: 'button'; id: string; rect: ResRect; picture: string; label: string; quarter?: number }
  /** WTYPE_EDITCTRL: a text field in its tiled box; `readOnly` a disabled one showing its words (CWndCommItemDlg). */
  | { kind: 'edit'; id: string; rect: ResRect; tile?: string; maxLength?: number; readOnly?: boolean }
  /** WTYPE_COMBOBOX: an edit with its drop button and a list of choices under it. */
  | { kind: 'combo'; id: string; rect: ResRect; tile?: string; maxLength?: number }
  /** WTYPE_CUSTOM (or a place the class draws in, `OnDraw`): an area the window fills itself. */
  | { kind: 'custom'; id: string; rect: ResRect; tile?: string }
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

/** `m_ptDeflateRect( 6, 6 )`: a text's words inside its box; with a scroll bar 15 px more off the right. */
const TEXT_INSET = 6;
const SCROLL_TEXT_RIGHT = 15;
/** `VSCROLL_WIDTH`: the scroll bar's width, its arrows 16 x 16 (ButtVScrUp.tga, four states in 64 x 16). */
const SCROLL = 16;
/** The thumb's least height (`WndControl.cpp:1611-1647`), and a line's pitch in the browser's font (14 px). */
const THUMB_MIN = 6;
const LINE = 14;
/** The combo box's drop button: its right 20 px, ButtQuickListDn.tga's frames 14 x 12. */
const DROP_WIDTH = 20;
const DROP_QUARTER = 14;
/** The combo box's list with no rows: 100 px tall (`WndControl.cpp:4686-4690`). */
const EMPTY_LIST = 100;

/** A combo box's parts: its field, and the list `setChoices` fills. */
interface Combo {
  input: HTMLInputElement;
  popup: HTMLElement;
  rows: HTMLElement;
}

/**
 * A window built from its entry. `control(id)` is a control's element (the input of an edit or a combo box, the words of a
 * static or a text, the area of a custom or a list); `button(id)` a button. `open` shows it centred (`MoveParentCenter`),
 * with its backdrop when modal; `close` hides it and runs `onClose`.
 */
export class ResWindow {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop | null;
  /** Runs once each time the window closes, by its button, Escape or `close`. */
  onClose: () => void = () => {};
  private readonly controls = new Map<string, HTMLElement>();
  private readonly combos = new Map<string, Combo>();
  private readonly scrollBars: Array<() => void> = [];

  constructor(readonly layout: ResLayout, private readonly art: UiArt, private readonly doc: Document = document) {
    const frame = new WindowFrame(layout.title, art, {
      width: layout.width, height: layout.height, texture: layout.texture, mobileScale: 1, fitWhole: true, ...layout.frame,
    }, doc);
    frame.element.classList.add('hud-res-window');
    frame.onClose = () => {
      this.modal?.hide();
      for (const combo of this.combos.values()) combo.popup.hidden = true;
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

  /** A text's or a static's words (`SetString`); a text's scroll bar is redrawn. */
  setText(id: string, text: string): void {
    this.control(id).textContent = text;
    this.refreshScrollBars();
  }

  /** A text's words with their colours (`AddParsingString`'s #b #c ... codes, as spans); its scroll bar is redrawn. */
  setContent(id: string, ...nodes: Array<Node | string>): void {
    this.control(id).replaceChildren(...nodes);
    this.refreshScrollBars();
  }

  /** A combo box's choices (`AddString`), in order; picking one puts it in the field and hides the list. */
  setChoices(id: string, choices: readonly string[]): void {
    const combo = this.combos.get(id);
    if (combo === undefined) throw new Error(`no combo box ${id} in ${this.layout.title}`);
    combo.rows.replaceChildren(...choices.map((choice) => {
      const row = this.doc.createElement('div');
      row.setAttribute('role', 'option');
      row.textContent = choice;
      row.addEventListener('click', () => {
        combo.input.value = choice;
        combo.popup.hidden = true;
        combo.input.focus();
      });
      return row;
    }));
    // (rows + 1) * (font + 3) + 8, or 100 px with none (`AddString`, :4809-4815)
    combo.popup.style.height = `${choices.length === 0 ? EMPTY_LIST : (choices.length + 1) * (LINE + 3) + 8}px`;
  }

  /** Shows it centred (or at `at`), over a backdrop when modal. */
  open(at: { x: number; y: number } | 'center' = 'center'): void {
    this.modal?.show();
    this.frame.open(at);
    this.refreshScrollBars();
  }

  close(): void {
    if (this.frame.isOpen) this.frame.close();
  }

  dispose(): void {
    this.onClose = () => {};
    this.close();
    this.element.remove();
  }

  private refreshScrollBars(): void {
    for (const draw of this.scrollBars) draw();
  }

  /** A tiled box at the control's rect (`columns` of 8 px across, all of it unless a scroll bar takes the right 16). */
  private box(className: string, control: { id: string; rect: ResRect }, tile?: string, scroll = false): HTMLElement {
    const rect = resRect(control.rect);
    const element = this.doc.createElement('div');
    element.className = className;
    place(element, rect);
    element.dataset.control = control.id;
    if (tile !== undefined) {
      const columns = Math.trunc((rect.width - (scroll ? SCROLL : 0)) / EDIT);
      element.append(editTiles(this.doc, this.art, columns, Math.trunc(rect.height / EDIT), tile));
    }
    return element;
  }

  private build(control: ResControl): HTMLElement {
    const rect = resRect(control.rect);
    const doc = this.doc;
    switch (control.kind) {
      case 'static': {
        const element = this.box(control.group === undefined ? 'hud-res-static' : 'hud-res-static is-group', control, control.group);
        if (control.picture !== undefined) {
          element.classList.add('is-picture');
          element.style.backgroundImage = themeUrl(this.art, control.picture);
        }
        const text = doc.createElement('span');
        text.className = 'hud-res-static-text';
        text.textContent = control.text ?? '';
        element.append(text);
        this.controls.set(control.id, text);
        return element;
      }
      case 'text': {
        const scroll = control.scroll === true;
        const element = this.box('hud-res-text', control, control.tile, scroll);
        const text = doc.createElement('div');
        text.className = 'hud-res-text-body';
        place(text, {
          left: TEXT_INSET, top: TEXT_INSET,
          width: rect.width - 2 * TEXT_INSET - (scroll ? SCROLL_TEXT_RIGHT : 0), height: rect.height - 2 * TEXT_INSET,
        });
        text.textContent = control.text ?? '';
        element.append(text);
        if (scroll) element.append(this.scrollBar(text, rect));
        this.controls.set(control.id, text);
        return element;
      }
      case 'button': {
        const quarter = control.quarter ?? rect.width;
        const button = pictureButton(doc, this.art, control.picture, { ...rect, width: Math.min(rect.width, quarter) }, quarter, () => {});
        button.dataset.control = control.id;
        button.setAttribute('aria-label', control.label);
        this.controls.set(control.id, button);
        return button;
      }
      case 'edit': {
        const element = this.box('hud-res-edit', control, control.tile);
        if (control.readOnly === true) {
          // a disabled CWndEdit: its words, wrapped at any letter, no caret
          const words = doc.createElement('div');
          words.className = 'hud-res-edit-words';
          element.append(words);
          this.controls.set(control.id, words);
          return element;
        }
        element.append(this.field(control.id, control.maxLength));
        return element;
      }
      case 'combo': {
        const element = this.box('hud-res-edit hud-res-combo', control, control.tile);
        const input = this.field(control.id, control.maxLength);
        input.style.right = `${DROP_WIDTH + 3}px`;
        input.style.width = 'auto';
        const drop = pictureButton(doc, this.art, 'ButtQuickListDn.tga', {
          left: rect.width - DROP_WIDTH, top: 0, width: DROP_QUARTER, height: 12,
        }, DROP_QUARTER, () => { list.hidden = !list.hidden; });
        drop.classList.add('hud-res-combo-drop');
        drop.setAttribute('aria-label', 'Show the list');
        const list = doc.createElement('div');
        list.className = 'hud-res-combo-list';
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        // the list hangs under the field, over the controls below it (a popup of the window)
        place(list, { left: 0, top: rect.height, width: rect.width, height: EMPTY_LIST });
        list.append(editTiles(doc, this.art, Math.trunc(rect.width / EDIT), Math.trunc(EMPTY_LIST / EDIT)));
        const rows = doc.createElement('div');
        rows.className = 'hud-res-combo-rows';
        list.append(rows);
        input.addEventListener('pointerdown', () => { list.hidden = !list.hidden; });
        element.append(input, drop, list);
        this.combos.set(control.id, { input, popup: list, rows });
        return element;
      }
      case 'custom': {
        const element = this.box('hud-res-custom', control, control.tile);
        this.controls.set(control.id, element);
        return element;
      }
      case 'list': {
        const element = this.box('hud-res-list', control, control.tile);
        const rows = doc.createElement('div');
        rows.className = 'hud-res-list-rows';
        rows.setAttribute('role', 'listbox');
        place(rows, { left: 3, top: 3, width: rect.width - 6, height: rect.height - 6 });
        element.append(rows);
        this.controls.set(control.id, rows);
        return element;
      }
    }
  }

  /** An edit's text field, 3 px in; the game hears none of its keys while it is typed in. */
  private field(id: string, maxLength?: number): HTMLInputElement {
    const input = this.doc.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (maxLength !== undefined) input.maxLength = maxLength;
    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.addEventListener('keyup', (event) => event.stopPropagation());
    this.controls.set(id, input);
    return input;
  }

  /**
   * A text's scroll bar on its right 16 px: the arrows at its ends (a line a press), ButtVScrBar stretched between, and the
   * thumb (PUp, PBar stretched, PDown) only while the words are more than fit. The wheel and a finger scroll the words.
   */
  private scrollBar(text: HTMLElement, rect: ControlRect): HTMLElement {
    const doc = this.doc;
    const height = Math.trunc(rect.height / 4) * 4;
    const bar = doc.createElement('div');
    bar.className = 'hud-res-scroll';
    place(bar, { left: rect.width - SCROLL, top: 0, width: SCROLL, height });
    bar.style.backgroundImage = themeUrl(this.art, 'ButtVScrBar.bmp');
    const arrow = (picture: string, top: number, step: number): HTMLButtonElement => {
      const button = pictureButton(doc, this.art, picture, { left: 0, top, width: SCROLL, height: SCROLL }, SCROLL, () => {
        text.scrollTop += step;
        draw();
      });
      button.classList.add('hud-res-scroll-arrow');
      return button;
    };
    const up = arrow('ButtVScrUp.tga', 0, -LINE);
    up.setAttribute('aria-label', 'Scroll up');
    const down = arrow('ButtVScrDown.tga', height - SCROLL, LINE);
    down.setAttribute('aria-label', 'Scroll down');
    const thumb = doc.createElement('div');
    thumb.className = 'hud-res-scroll-thumb';
    for (const [picture, part] of [['ButtVScrPUp.bmp', 'top'], ['ButtVScrPBar.bmp', 'middle'], ['ButtVScrPDown.bmp', 'bottom']] as const) {
      const piece = doc.createElement('div');
      piece.dataset.part = part;
      piece.style.backgroundImage = themeUrl(this.art, picture);
      thumb.append(piece);
    }
    bar.append(up, down, thumb);
    const track = height - 2 * SCROLL;
    const draw = (): void => {
      const total = text.scrollHeight, shown = text.clientHeight;
      thumb.hidden = total <= shown || shown <= 0;
      if (thumb.hidden) return;
      const size = Math.max(THUMB_MIN, Math.round((track * shown) / total));
      const top = SCROLL + Math.round(((track - size) * text.scrollTop) / Math.max(1, total - shown));
      thumb.style.top = `${top}px`;
      thumb.style.height = `${size}px`;
    };
    text.classList.add('is-scrolled');
    text.addEventListener('scroll', draw);
    // the thumb dragged: the words follow it
    thumb.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY, startTop = text.scrollTop;
      const size = thumb.offsetHeight || THUMB_MIN;
      const move = (e: PointerEvent): void => {
        const range = Math.max(1, track - size);
        text.scrollTop = startTop + ((e.clientY - startY) * (text.scrollHeight - text.clientHeight)) / range;
        draw();
      };
      const up = (): void => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); };
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
    });
    this.scrollBars.push(draw);
    return bar;
  }
}
