// 2026-11-14 (owner): "an ingame floating keyboard whenever there is a need of typing, whether its logging in, input name or
// changing name, change titles etc, everything that needs typing ... so we dont launch the phone keyboard anymore".
//
// One keyboard for the page (the lobby and the world), on a touch screen only (`watchTouch`, the joystick's rule): every
// text box of the game (an <input> that takes typing, a <textarea>) gets `inputmode="none"`, so the phone's keyboard never
// comes up, and keeps the real focus, so it shows its text, its caret and its password dots as ever. While a box has the
// focus this keyboard floats over the game, drawn as a V15 window (WndTile00-11, ButtWndExit), placed where it does not
// cover the box (keyboardRules.ts `placeKeyboard`), and moved by its title bar. Its own line shows the text and the caret
// (dots for a password) for a box it covers all the same. A box that takes digits only (an amount, a PIN) gets the number
// pad instead.
//
// What a key does is what the PC's key does in that box: a letter is typed over the selection (the box's `maxlength`
// kept) and the box hears an `input` event; Enter is a keydown Enter on the box (the chat sends its line, a dialog
// answers), and if the box does nothing with it: a new line in a textarea, the next box for `enterkeyhint="next"`, the
// form's submit (the login). The box losing the focus, or the keyboard's X, closes it. A real keyboard typing in the box
// (an iPad's, or a test's) puts it away until the box is tapped again.
//
// `?keyboard=readonly` on the page's address makes the boxes read-only as well (for a browser that would still bring its
// own keyboard or bar up for `inputmode="none"`: then the box draws no caret, the keyboard's line does); `?keyboard=off`
// leaves the phone's keyboard as it was.

import { themeKey } from '../world/hud/art';
import { KeyRepeat, KeyboardState, PAGES, backspace, digitRows, insert, placeKeyboard, rulesOf, shownText } from './keyboardRules';
import type { BoxRules, EditState, Key, KeyAction } from './keyboardRules';

export type TextBox = HTMLInputElement | HTMLTextAreaElement;

/** How the phone's own keyboard is kept away: `inputmode="none"` (the caret stays the box's), or read-only boxes too. */
export type KeepAway = 'inputmode' | 'readonly';

/** The input types typed in: a keyboard comes up for them. */
const TYPED = new Set(['', 'text', 'password', 'search', 'email', 'url', 'tel', 'number']);

/** Whether `target` is a box this keyboard types in: a text input or a textarea, neither disabled nor read-only by the page's will. */
export function isTypedBox(target: EventTarget | null): target is TextBox {
  if (target === null || typeof (target as Element).tagName !== 'string') return false;
  const element = target as Element;
  const tag = element.tagName.toUpperCase();
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
  const box = element as TextBox;
  if (box.disabled) return false;
  // a box made read-only by this keyboard (`?keyboard=readonly`) is still typed in
  if (box.readOnly && (box as HTMLElement).dataset.kbReadonly === undefined) return false;
  return tag === 'TEXTAREA' || TYPED.has(((box as HTMLInputElement).getAttribute('type') ?? '').toLowerCase());
}

/** The box's `inputmode` as its page gave it, kept before the keyboard put "none" there. */
const pageInputMode = (box: TextBox): string => box.dataset.kbInputmode ?? box.getAttribute('inputmode') ?? '';

/** Puts "none" in the box's `inputmode` (and, for `readonly`, makes it read-only), keeping what the page had there. */
export function keepAway(box: TextBox, how: KeepAway): void {
  // a page that sets its inputmode after the keyboard put "none" there (a PIN field made numeric once built) is heard again
  const mode = box.getAttribute('inputmode');
  if (mode !== 'none' || box.dataset.kbInputmode === undefined) box.dataset.kbInputmode = mode === 'none' ? '' : mode ?? '';
  if (mode !== 'none') box.setAttribute('inputmode', 'none');
  if (how === 'readonly' && !box.readOnly) {
    box.readOnly = true;
    box.dataset.kbReadonly = '';
  }
}

/** Gives the box back what its page had (a mouse or a real keyboard is in use). */
export function giveBack(box: TextBox): void {
  const mode = box.dataset.kbInputmode;
  if (mode === undefined) return;
  if (mode === '') box.removeAttribute('inputmode');
  else box.setAttribute('inputmode', mode);
  delete box.dataset.kbInputmode;
  if (box.dataset.kbReadonly !== undefined) {
    box.readOnly = false;
    delete box.dataset.kbReadonly;
  }
}

/** What the keyboard reads of the box's rules: its kind from the page's `inputmode`, not the keyboard's "none". */
export function boxRules(box: TextBox): BoxRules {
  const input = box.tagName.toUpperCase() === 'INPUT' ? box as HTMLInputElement : null;
  return rulesOf({
    tagName: box.tagName,
    type: input?.getAttribute('type') ?? '',
    inputMode: pageInputMode(box),
    pattern: input?.getAttribute('pattern') ?? '',
    maxLength: box.maxLength,
    max: input?.getAttribute('max') ?? '',
  });
}

/** The box's text and selection (a number box has none: the caret at its end). */
function stateOf(box: TextBox): EditState {
  const value = box.value;
  let start: number | null = null, end: number | null = null;
  try { start = box.selectionStart; end = box.selectionEnd; } catch { /* a number box */ }
  return { value, start: start ?? value.length, end: end ?? start ?? value.length };
}

/** The words of a box for the keyboard's title: its label, its name for a screen reader, its placeholder. */
export function labelOf(box: TextBox): string {
  const aria = box.getAttribute('aria-label');
  if (aria) return aria;
  const label = box.labels?.[0];
  const text = (label?.querySelector('.label') ?? label)?.textContent?.trim();
  if (text) return text.replace(/:$/, '');
  return box.getAttribute('placeholder') ?? box.getAttribute('title')?.split('.')[0] ?? '';
}

/** The face of Enter: the box's `enterkeyhint` (Neuz's Enter has no face of its own). */
const ENTER_FACES: Record<string, string> = { next: 'Next', go: 'Go', send: 'Send', done: 'Done', search: 'Search', previous: 'Back' };

/** What a key shows. */
function faceOf(action: KeyAction, enter: string): string {
  switch (action.kind) {
    case 'char': return action.char;
    case 'space': return 'Space';
    case 'shift': return '⇧';
    case 'caps': return 'Caps';
    case 'back': return '⌫';
    case 'enter': return enter;
    case 'clear': return 'C';
    case 'max': return 'Max';
    case 'page': return action.page === 'letters' ? 'ABC' : action.page === 'symbols' ? '?123' : '#+=';
  }
}

/** A key's name for a screen reader, where its face is a sign. */
const NAMES: Partial<Record<KeyAction['kind'], string>> = { shift: 'Shift', back: 'Backspace', clear: 'Clear', space: 'Space' };

/** The room kept clear around the box typed in and from the screen's edges (CSS px). */
const MARGIN = 4;
/** How often an open keyboard looks whether its box is still there and focused (ms). */
const WATCH_MS = 200;

export interface FloatingKeyboardOptions {
  /** Whether the player is on a touch screen now (`watchTouch`). */
  touch: () => boolean;
  /** How the phone's keyboard is kept away (`inputmode` by default). */
  keepAway?: KeepAway;
  /** The page's asset store, for the V15 frame's pictures; the keyboard is drawn plain without them. */
  art?: () => Promise<{ url(key: string): string | null }>;
}

export class FloatingKeyboard {
  /** The layer over the page (the screen's safe area) the keyboard floats in. */
  readonly layer: HTMLElement;
  /** The keyboard: its frame, title, line and keys. */
  readonly element: HTMLElement;
  private readonly title: HTMLElement;
  private readonly line: { before: HTMLElement; selected: HTMLElement; after: HTMLElement; text: HTMLElement };
  private readonly keys: HTMLElement;
  private readonly view: Window;
  private readonly how: KeepAway;
  private readonly state = new KeyboardState();
  private readonly repeat: KeyRepeat;
  private box: TextBox | null = null;
  private rules: BoxRules = rulesOf({ tagName: 'INPUT' });
  /** The page drawn on the keys and with which Shift, so a press that changes neither draws nothing. */
  private drawn = '';
  /** The keyboard has typed in the box since it took the focus: a `change` goes to it as it leaves. */
  private changed = false;
  /** Put away by a real keyboard typing in the box: until the box is tapped again or another box is focused. */
  private away = false;
  /** Where the player dragged the keyboard to (layer px), kept while it stays open. */
  private dragged: { left: number; top: number } | null = null;
  private drag: { pointerId: number; dx: number; dy: number } | null = null;
  private watchId: number | null = null;
  private observer: MutationObserver | null = null;

  constructor(private readonly doc: Document, private readonly options: FloatingKeyboardOptions) {
    this.view = doc.defaultView ?? window;
    this.how = options.keepAway ?? 'inputmode';
    this.repeat = new KeyRepeat(this.view);
    const layer = this.layer = doc.createElement('div');
    layer.className = 'floating-keyboard-layer';
    const element = this.element = doc.createElement('div');
    element.className = 'floating-keyboard';
    element.hidden = true;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', 'Keyboard');
    const frame = doc.createElement('div');
    frame.className = 'floating-keyboard-frame';
    frame.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) {
      const tile = doc.createElement('span');
      tile.style.backgroundImage = `var(--kb-wndtile${String(i).padStart(2, '0')}, none)`;
      frame.append(tile);
    }
    const title = this.title = doc.createElement('div');
    title.className = 'floating-keyboard-title';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'floating-keyboard-close';
    close.tabIndex = -1;
    close.setAttribute('aria-label', 'Close the keyboard');
    const line = doc.createElement('div');
    line.className = 'floating-keyboard-line';
    const text = doc.createElement('div');
    text.className = 'floating-keyboard-text';
    const before = doc.createElement('span'), selected = doc.createElement('span'), after = doc.createElement('span');
    selected.className = 'floating-keyboard-selected';
    const caret = doc.createElement('span');
    caret.className = 'floating-keyboard-caret';
    text.append(before, selected, caret, after);
    line.append(text);
    this.line = { before, selected, after, text };
    const keys = this.keys = doc.createElement('div');
    keys.className = 'floating-keyboard-keys';
    element.append(frame, title, close, line, keys);
    layer.append(element);
    (doc.body ?? doc.documentElement).append(layer);

    // a press on the keyboard never takes the focus from the box (nor selects, zooms or scrolls), and is not the game's (the
    // camera, the joystick, a window under it)
    element.addEventListener('pointerdown', this.onPointerDown);
    const keep = (event: Event): void => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
    element.addEventListener('mousedown', keep);
    element.addEventListener('touchstart', keep, { passive: false });
    element.addEventListener('contextmenu', keep);
    element.addEventListener('click', (event) => event.stopPropagation());
    this.view.addEventListener('pointermove', this.onPointerMove);
    this.view.addEventListener('pointerup', this.onPointerUp);
    this.view.addEventListener('pointercancel', this.onPointerUp);
    this.view.addEventListener('resize', this.onResize);
    doc.addEventListener('pointerdown', this.onPagePressCapture, true);
    doc.addEventListener('pointerdown', this.onPagePress);
    doc.addEventListener('focusin', this.onFocusIn, true);
    doc.addEventListener('focusout', this.onFocusOut, true);
    doc.addEventListener('keydown', this.onRealKey, true);
    doc.addEventListener('input', this.onRealInput, true);
    doc.addEventListener('selectionchange', this.onSelection);
    if (options.touch()) this.watchBoxes();
    void options.art?.().then((store) => this.skin(store)).catch(() => {});
  }

  /** The box typed in now; null while the keyboard is closed. */
  get target(): TextBox | null {
    return this.box;
  }

  /** Whether the keyboard is shown. */
  get shown(): boolean {
    return !this.element.hidden;
  }

  /** The page the keys stand on ('letters', 'symbols', 'more' or 'digits'). */
  get page(): string {
    return this.state.page;
  }

  /**
   * Presses a key (what a finger on it does): types in the box, or changes the keyboard's Shift, Caps or page. The
   * keyboard's own presses go through here; so do the tests'.
   */
  press(action: KeyAction): void {
    const box = this.box;
    if (box === null) return;
    const result = this.state.press(action);
    if (result !== null) {
      if ('type' in result) this.edit((state) => insert(state, result.type, this.rules), 'insertText', result.type);
      else if (result.do === 'back') this.edit(backspace, 'deleteContentBackward');
      else if (result.do === 'clear') this.edit(() => ({ value: '', start: 0, end: 0 }), 'deleteContent');
      else if (result.do === 'max' && this.rules.max !== undefined) {
        const value = String(this.rules.max);
        this.edit(() => ({ value, start: value.length, end: value.length }), 'insertReplacementText', value);
      } else if (result.do === 'enter') this.enter(box);
    }
    if (this.box !== null) this.draw();
  }

  dispose(): void {
    this.close();
    this.observer?.disconnect();
    this.view.removeEventListener('pointermove', this.onPointerMove);
    this.view.removeEventListener('pointerup', this.onPointerUp);
    this.view.removeEventListener('pointercancel', this.onPointerUp);
    this.view.removeEventListener('resize', this.onResize);
    this.doc.removeEventListener('pointerdown', this.onPagePressCapture, true);
    this.doc.removeEventListener('pointerdown', this.onPagePress);
    this.doc.removeEventListener('focusin', this.onFocusIn, true);
    this.doc.removeEventListener('focusout', this.onFocusOut, true);
    this.doc.removeEventListener('keydown', this.onRealKey, true);
    this.doc.removeEventListener('input', this.onRealInput, true);
    this.doc.removeEventListener('selectionchange', this.onSelection);
    this.layer.remove();
  }

  /** The V15 window's pictures, once the page's asset store is in. */
  private skin(store: { url(key: string): string | null }): void {
    const pictures = [...Array.from({ length: 12 }, (_, i) => `WndTile${String(i).padStart(2, '0')}.tga`), 'ButtWndExit.tga'];
    const urls = pictures.map((picture) => store.url(themeKey(picture)));
    if (urls.some((url) => !url)) return;
    pictures.forEach((picture, i) => {
      this.element.style.setProperty(`--kb-${picture.split('.')[0]!.toLowerCase()}`, `url(${JSON.stringify(urls[i])})`);
    });
    this.element.dataset.skinned = '';
  }

  /** Every text box put in the page from now on gets `inputmode="none"` (a touch screen's), and those already there. */
  private watchBoxes(): void {
    if (this.observer !== null || typeof MutationObserver === 'undefined') return;
    const root = this.doc.body ?? this.doc.documentElement;
    const stampAll = (node: ParentNode): void => {
      for (const box of node.querySelectorAll('input, textarea')) if (isTypedBox(box)) keepAway(box, this.how);
    };
    stampAll(root);
    this.observer = new MutationObserver((records) => {
      if (!this.options.touch()) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (isTypedBox(node)) keepAway(node, this.how);
          else if ((node as Element).firstElementChild !== null) stampAll(node as Element);
        }
      }
    });
    this.observer.observe(root, { childList: true, subtree: true });
  }

  /** Before a finger's press gives a box the focus: the box gets "none" first, so no phone keyboard comes up for it. */
  private readonly onPagePressCapture = (event: Event): void => {
    const target = event.target;
    if (!isTypedBox(target)) return;
    if ((event as PointerEvent).pointerType === 'touch' || this.options.touch()) {
      keepAway(target, this.how);
      this.watchBoxes();
    }
  };

  /**
   * A press on the page, once its own handlers have had it: on the box typed in, the keyboard back if a real keyboard put it
   * away; anywhere else that keeps no focus (`preventDefault`), the box let go, as a PC's mouse press does (iOS keeps the focus).
   */
  private readonly onPagePress = (event: Event): void => {
    const box = this.box;
    if (box === null) return;
    const target = event.target as Node | null;
    if (target !== null && this.layer.contains(target)) return;
    if (target === box) {
      if (this.away) { this.away = false; this.show(); }
      return;
    }
    if (event.defaultPrevented || isTypedBox(target)) return;
    box.blur();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!isTypedBox(target)) {
      if (this.box !== null && target !== this.box) this.close();
      return;
    }
    if (!this.options.touch()) {
      giveBack(target);
      this.close();
      return;
    }
    keepAway(target, this.how);
    this.watchBoxes();
    this.open(target);
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    if (event.target !== this.box) return;
    // the focus may go on to another box (its focusin comes next) or to nothing
    this.view.setTimeout(() => this.check(), 0);
  };

  /** A real keyboard typing in the box (an iPad's, a test's): this one goes away until the box is tapped again. */
  private readonly onRealKey = (event: KeyboardEvent): void => {
    if (!event.isTrusted || event.target !== this.box || this.away) return;
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
    this.putAway();
  };

  private readonly onRealInput = (event: Event): void => {
    if (event.target !== this.box) return;
    const type = (event as InputEvent).inputType ?? '';
    if (event.isTrusted && !this.away && !/Paste|Drop|Cut|history/.test(type)) this.putAway();
    else this.drawLine();
  };

  private readonly onSelection = (): void => {
    if (this.box !== null && this.shown) this.drawLine();
  };

  private readonly onResize = (): void => {
    if (this.box !== null && this.shown) this.place();
  };

  /** The keyboard for `box`: its page, its title and Enter's face, placed clear of it. */
  private open(box: TextBox): void {
    if (this.box !== box) {
      this.leave();
      this.box = box;
      this.rules = boxRules(box);
      this.state.reset(this.rules.digits);
      this.changed = false;
      this.drawn = '';
    }
    this.away = false;
    this.show();
  }

  private show(): void {
    const box = this.box;
    if (box === null) return;
    this.title.textContent = labelOf(box) || 'Keyboard';
    this.element.hidden = false;
    this.draw();
    this.place();
    if (this.watchId === null) this.watch();
  }

  private putAway(): void {
    this.away = true;
    this.element.hidden = true;
    this.repeat.stop();
  }

  /** Closed: the box typed in forgotten (it hears its `change`). */
  close(): void {
    this.leave();
    this.box = null;
    this.away = false;
    this.dragged = null;
    this.drag = null;
    this.repeat.stop();
    this.element.hidden = true;
    if (this.watchId !== null) this.view.clearInterval(this.watchId);
    this.watchId = null;
  }

  /** The box left: a `change` for what the keyboard typed in it, as a PC's box has one when it loses the focus. */
  private leave(): void {
    const box = this.box;
    if (box === null || !this.changed) return;
    this.changed = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** The box still has the focus, is in the page and seen; else the keyboard closes. */
  check(): void {
    const box = this.box;
    if (box === null) return;
    const hidden = this.inLayout() && box.getClientRects().length === 0;
    if (!box.isConnected || this.doc.activeElement !== box || box.disabled || hidden) {
      if (box.isConnected && this.doc.activeElement === box) box.blur();
      this.close();
    }
  }

  /** Whether the page lays out (a test's page has none: no box has a rectangle there). */
  private inLayout(): boolean {
    return this.layer.getClientRects().length > 0;
  }

  /** While open, now and then: the box still there and focused (a window closed over it gives no focusout everywhere). */
  private watch(): void {
    this.watchId = this.view.setInterval(() => this.check(), WATCH_MS);
  }

  /** `change` applied to the box: its text and caret set, an `input` event for its own listeners. */
  private edit(change: (state: EditState) => EditState, inputType: string, data?: string): void {
    const box = this.box;
    if (box === null) return;
    const before = stateOf(box);
    const after = change(before);
    if (after.value === before.value && after.start === before.start && after.end === before.end) return;
    box.value = after.value;
    try { box.setSelectionRange(after.start, after.end); } catch { /* a number box has no selection */ }
    if (after.value === before.value) return;
    this.changed = true;
    let event: Event;
    try { event = new InputEvent('input', { bubbles: true, inputType, data: data ?? null }); }
    catch { event = new Event('input', { bubbles: true }); }
    box.dispatchEvent(event);
  }

  /**
   * Enter: a keydown Enter on the box, as a PC's key (its own handler sends the chat's line, answers the dialog); unheeded,
   * a new line in a textarea, the next box for `enterkeyhint="next"`, or the form's submit (the login's).
   */
  private enter(box: TextBox): void {
    const init: KeyboardEventInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const heeded = !box.dispatchEvent(new KeyboardEvent('keydown', init));
    if (!heeded && this.box === box && box.isConnected) {
      if (box.tagName.toUpperCase() === 'TEXTAREA') this.edit((state) => insert(state, '\n', this.rules), 'insertLineBreak');
      else if (!(box.getAttribute('enterkeyhint') === 'next' && this.focusNext(box))) {
        const form = (box as HTMLInputElement).form;
        if (form !== null) submitForm(form);
      }
    }
    box.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  /** The focus on the next text box of the same form or window; false when there is none. */
  private focusNext(box: TextBox): boolean {
    const scope: ParentNode = (box as HTMLInputElement).form ?? box.closest('.hud-window, .screen, [role="dialog"]') ?? this.doc;
    const laidOut = this.inLayout();
    const boxes = [...scope.querySelectorAll('input, textarea')].filter((other): other is TextBox =>
      isTypedBox(other) && (other === box || !laidOut || other.getClientRects().length > 0));
    const next = boxes[boxes.indexOf(box) + 1];
    if (next === undefined) return false;
    next.focus();
    return true;
  }

  /** The keys of the page and Shift the keyboard stands on, and its line. */
  private draw(): void {
    const enter = ENTER_FACES[this.box?.getAttribute('enterkeyhint') ?? ''] ?? 'Enter';
    const key = `${this.state.page}|${this.state.upper}|${this.state.shift}|${this.state.caps}|${enter}|${this.rules.max ?? ''}`;
    if (key !== this.drawn) {
      this.drawn = key;
      const rows = this.state.page === 'digits' ? digitRows(this.rules.max !== undefined) : PAGES[this.state.page];
      this.element.dataset.page = this.state.page;
      this.element.style.setProperty('--kb-columns', this.state.page === 'digits' ? '4' : '10');
      this.keys.replaceChildren(...rows.map((row) => {
        const element = this.doc.createElement('div');
        element.className = 'floating-keyboard-row';
        element.append(...row.map((k) => this.keyButton(k, enter)));
        return element;
      }));
    }
    this.drawLine();
  }

  private keyButton(key: Key, enter: string): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.className = 'floating-keyboard-key';
    const { action } = key;
    let face = faceOf(action, enter);
    if (action.kind === 'char' && /^[a-z]$/.test(action.char) && this.state.upper) face = face.toUpperCase();
    button.textContent = face;
    button.dataset.key = action.kind === 'char' ? action.char : action.kind === 'page' ? `page-${action.page}` : action.kind;
    const name = NAMES[action.kind];
    if (name !== undefined) button.setAttribute('aria-label', name);
    if (key.width !== undefined) button.style.setProperty('--w', String(key.width));
    if (action.kind === 'shift') button.setAttribute('aria-pressed', String(this.state.shift === 'once'));
    if (action.kind === 'caps') button.setAttribute('aria-pressed', String(this.state.caps));
    if (action.kind !== 'char' && action.kind !== 'space') button.dataset.wide = '';
    keyActions.set(button, action);
    return button;
  }

  /** The keyboard's line: the box's text (dots for a password), the caret, the selection. */
  private drawLine(): void {
    const box = this.box;
    if (box === null) return;
    const { value, start, end } = stateOf(box);
    const lo = Math.min(start, end), hi = Math.max(start, end);
    this.line.before.textContent = shownText(value.slice(0, lo), this.rules);
    this.line.selected.textContent = shownText(value.slice(lo, hi), this.rules);
    this.line.after.textContent = shownText(value.slice(hi), this.rules);
    // the caret kept in sight on a long line
    const text = this.line.text;
    const caretAt = this.line.before.offsetWidth + this.line.selected.offsetWidth;
    if (caretAt - text.scrollLeft > text.clientWidth - 8) text.scrollLeft = caretAt - text.clientWidth + 8;
    else if (caretAt < text.scrollLeft + 8) text.scrollLeft = Math.max(0, caretAt - 8);
  }

  /** The keyboard put clear of the box (or where the player dragged it), within the screen's safe area. */
  private place(): void {
    const box = this.box;
    if (box === null) return;
    const layer = this.layer.getBoundingClientRect();
    const screen = { width: layer.width || this.view.innerWidth, height: layer.height || this.view.innerHeight };
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight };
    let at: { left: number; top: number };
    if (this.dragged !== null) at = this.clamp(this.dragged, screen, size);
    else {
      const rect = box.getBoundingClientRect();
      at = placeKeyboard(screen, size, { left: rect.left - layer.left, top: rect.top - layer.top, width: rect.width, height: rect.height }, MARGIN);
    }
    this.element.style.left = `${Math.round(at.left)}px`;
    this.element.style.top = `${Math.round(at.top)}px`;
  }

  private clamp(at: { left: number; top: number }, screen: { width: number; height: number }, size: { width: number; height: number }) {
    return {
      left: Math.max(0, Math.min(at.left, screen.width - size.width)),
      top: Math.max(0, Math.min(at.top, screen.height - size.height)),
    };
  }

  /** A finger on the keyboard: a key pressed (Backspace held repeats), the X closes, the title bar drags. */
  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== undefined && event.button > 0) return;
    const target = event.target as Element | null;
    if (target?.closest?.('.floating-keyboard-close') != null) {
      const box = this.box;
      this.close();
      box?.blur();
      return;
    }
    const button = target?.closest?.('.floating-keyboard-key') as HTMLButtonElement | null;
    const action = button === null ? undefined : keyActions.get(button);
    if (action !== undefined) {
      button!.dataset.down = '';
      if (action.kind === 'back') this.repeat.start(() => this.press(action));
      else this.press(action);
      return;
    }
    if (target?.closest?.('.floating-keyboard-title, .floating-keyboard-frame') != null || target === this.element) {
      const rect = this.element.getBoundingClientRect(), layer = this.layer.getBoundingClientRect();
      this.drag = { pointerId: event.pointerId ?? 0, dx: event.clientX - (rect.left - layer.left), dy: event.clientY - (rect.top - layer.top) };
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    const layer = this.layer.getBoundingClientRect();
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight };
    this.dragged = this.clamp({ left: event.clientX - drag.dx, top: event.clientY - drag.dy },
      { width: layer.width || this.view.innerWidth, height: layer.height || this.view.innerHeight }, size);
    this.element.style.left = `${Math.round(this.dragged.left)}px`;
    this.element.style.top = `${Math.round(this.dragged.top)}px`;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.repeat.stop();
    for (const down of this.keys.querySelectorAll('[data-down]')) delete (down as HTMLElement).dataset.down;
    if (this.drag !== null && (event.pointerId ?? 0) === this.drag.pointerId) this.drag = null;
  };
}

/** What each key button presses. */
const keyActions = new WeakMap<HTMLButtonElement, KeyAction>();

/** A form's implicit submission (Enter in one of its boxes): its first submit button clicked, else the form submitted. */
function submitForm(form: HTMLFormElement): void {
  const button = [...form.elements].find((element): element is HTMLButtonElement | HTMLInputElement =>
    (element instanceof HTMLButtonElement && element.type === 'submit') ||
    (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image')));
  if (button !== undefined) {
    if (!button.disabled) button.click();
    return;
  }
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** The page's keyboard from the address: `?keyboard=off` none, `?keyboard=readonly` read-only boxes, else `inputmode`. */
export function keyboardChoice(search: string): KeepAway | 'off' {
  const choice = new URLSearchParams(search).get('keyboard');
  return choice === 'off' ? 'off' : choice === 'readonly' ? 'readonly' : 'inputmode';
}

/** Puts the page's floating keyboard in (main.ts), unless the address says `?keyboard=off`. */
export function installFloatingKeyboard(doc: Document, options: FloatingKeyboardOptions & { search?: string }): FloatingKeyboard | null {
  const choice = keyboardChoice(options.search ?? doc.defaultView?.location.search ?? '');
  if (choice === 'off') return null;
  return new FloatingKeyboard(doc, { ...options, keepAway: choice });
}
