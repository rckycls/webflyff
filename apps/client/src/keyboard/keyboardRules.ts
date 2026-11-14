// 2026-11-14 (owner): "an ingame floating keyboard whenever there is a need of typing ... so we dont launch the phone keyboard
// anymore". The rules of that keyboard, with no page in them (floatingKeyboard.ts draws it and types into the boxes): its
// key pages, Shift and Caps, what a key does to a box's text, the number pads, and where it stands on the screen.
//
// Neuz has no such keyboard (a PC game, typed on the PC's). Its letters are the PC's (ASCII): the server's names, chat and
// titles take nothing else.

/** What a key of the keyboard does. */
export type KeyAction =
  | { readonly kind: 'char'; readonly char: string }
  | { readonly kind: 'shift' }
  | { readonly kind: 'caps' }
  | { readonly kind: 'back' }
  | { readonly kind: 'space' }
  | { readonly kind: 'enter' }
  | { readonly kind: 'page'; readonly page: KeyPage }
  /** The number pads: all of it away (C), the most the box takes (Max), 00 and 000 as the shop's keypad has them. */
  | { readonly kind: 'clear' }
  | { readonly kind: 'max' };

/** A key: its action and how many letter keys wide it stands (1 when not said). */
export interface Key {
  readonly action: KeyAction;
  readonly width?: number;
}

/** The pages of the keyboard: the letters, two of numbers and signs, and the number pad of a box that takes digits only. */
export type KeyPage = 'letters' | 'symbols' | 'more' | 'digits';

/** The Shift key: off, on for the next letter only (`once`). Caps is its own key, kept apart (`KeyboardState.caps`). */
export type ShiftState = 'off' | 'once';

const char = (c: string): Key => ({ action: { kind: 'char', char: c } });
const chars = (row: string): Key[] => [...row].map(char);

const BACK: Key = { action: { kind: 'back' }, width: 1.5 };
const SHIFT: Key = { action: { kind: 'shift' }, width: 1.5 };
const CAPS: Key = { action: { kind: 'caps' } };
const ENTER: Key = { action: { kind: 'enter' }, width: 2.5 };
const SPACE: Key = { action: { kind: 'space' }, width: 4 };

/**
 * The rows of each page. Letters: QWERTY, Caps before A, Shift and Backspace by Z to M, then the numbers page, '-', the space,
 * '.' and Enter. The two pages of signs hold the 32 ASCII signs between them.
 */
export const PAGES: Readonly<Record<Exclude<KeyPage, 'digits'>, readonly (readonly Key[])[]>> = {
  letters: [
    chars('qwertyuiop'),
    [CAPS, ...chars('asdfghjkl')],
    [SHIFT, ...chars('zxcvbnm'), BACK],
    [{ action: { kind: 'page', page: 'symbols' }, width: 1.5 }, char('-'), SPACE, char('.'), ENTER],
  ],
  symbols: [
    chars('1234567890'),
    chars('-/:;()$&@"'),
    [{ action: { kind: 'page', page: 'more' }, width: 1.5 }, ...chars('.,?!\''), BACK],
    [{ action: { kind: 'page', page: 'letters' }, width: 1.5 }, char('_'), SPACE, char('@'), ENTER],
  ],
  more: [
    chars('[]{}#%^*+='),
    chars('_\\|~<>`'),
    [{ action: { kind: 'page', page: 'symbols' }, width: 1.5 }, ...chars('.,?!\''), BACK],
    [{ action: { kind: 'page', page: 'letters' }, width: 1.5 }, char('-'), SPACE, char('/'), ENTER],
  ],
};

/**
 * The rows of the number pad of a box that takes digits only (an amount, a PIN): the shop's keypad (hud/numpad.ts
 * `COUNT_KEYS`), four across: the digits, Backspace, C (all of it away), 00, and with Enter in the last corner. A box with a
 * most (`max`, an amount) has Max and 000 too; one without (a PIN) a wide 0 and Enter.
 */
export function digitRows(hasMax: boolean): readonly (readonly Key[])[] {
  const top = [chars('789'), chars('456'), chars('123')];
  return [
    [...top[0]!, { action: { kind: 'back' } }],
    [...top[1]!, { action: { kind: 'clear' } }],
    [...top[2]!, hasMax ? { action: { kind: 'max' } } : char('00')],
    hasMax ? [char('0'), char('00'), char('000'), { action: { kind: 'enter' } }]
      : [{ ...char('0'), width: 2 }, { action: { kind: 'enter' }, width: 2 }],
  ];
}

/** What the keyboard knows of a box: its kind, and the rules its text keeps. */
export interface BoxRules {
  /** Letters, or digits only (the number pad). */
  readonly digits: boolean;
  /** Its letters drawn as dots (a password, a PIN). */
  readonly secret: boolean;
  /** A text of several lines (a textarea): Enter gives a new line when the box does nothing with it. */
  readonly multiline: boolean;
  /** The most letters it takes (`maxlength`); -1 for no most. */
  readonly maxLength: number;
  /** The highest number a digits box takes (`max`), when it has one. */
  readonly max?: number;
}

/** The text of a box and its selection (`selectionStart`, `selectionEnd`: the same for a caret). */
export interface EditState {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/** What a box is to the keyboard, from its attributes (`inputmode` as the page gave it, before the keyboard's own). */
export function rulesOf(box: {
  tagName: string; type?: string; inputMode?: string; pattern?: string; maxLength?: number; max?: string;
}): BoxRules {
  const multiline = box.tagName.toUpperCase() === 'TEXTAREA';
  const type = (box.type ?? '').toLowerCase();
  const mode = (box.inputMode ?? '').toLowerCase();
  const digits = !multiline && (type === 'number' || mode === 'numeric' || mode === 'decimal' || mode === 'tel' ||
    /^\[0-9\][*+]$|^\\d[*+]$/.test(box.pattern ?? ''));
  const parsed = Number.parseInt(box.max ?? '', 10);
  return {
    digits,
    secret: type === 'password',
    multiline,
    maxLength: typeof box.maxLength === 'number' && box.maxLength >= 0 ? box.maxLength : -1,
    ...(digits && Number.isFinite(parsed) ? { max: parsed } : {}),
  };
}

const clampIndex = (state: EditState): { start: number; end: number } => {
  const length = state.value.length;
  const start = Math.max(0, Math.min(length, Math.min(state.start, state.end)));
  const end = Math.max(start, Math.min(length, Math.max(state.start, state.end)));
  return { start, end };
};

/** The text a box would have with `text` typed over its selection: cut to its most letters, digits only on a number box. */
export function insert(state: EditState, text: string, rules: BoxRules): EditState {
  const { start, end } = clampIndex(state);
  let typed = rules.digits ? text.replace(/[^0-9]/g, '') : rules.multiline ? text : text.replace(/[\r\n]/g, '');
  if (rules.maxLength >= 0) {
    const room = rules.maxLength - (state.value.length - (end - start));
    typed = typed.slice(0, Math.max(0, room));
  }
  if (typed === '' && start === end) return state;
  let value = state.value.slice(0, start) + typed + state.value.slice(end);
  let caret = start + typed.length;
  if (rules.digits) {
    // a number box: no 0 before the number, never over its most (the shop's keypad, CountPad)
    const trimmed = value.replace(/^0+(?=\d)/, '');
    caret -= value.length - trimmed.length;
    value = trimmed;
    if (rules.max !== undefined && Number(value) > rules.max) {
      value = String(rules.max);
      caret = value.length;
    }
  }
  return { value, start: Math.max(0, caret), end: Math.max(0, caret) };
}

/** Backspace: the selection away, else the letter before the caret. */
export function backspace(state: EditState): EditState {
  const { start, end } = clampIndex(state);
  if (start !== end) return { value: state.value.slice(0, start) + state.value.slice(end), start, end: start };
  if (start === 0) return { value: state.value, start: 0, end: 0 };
  return { value: state.value.slice(0, start - 1) + state.value.slice(start), start: start - 1, end: start - 1 };
}

/** The shift and the page the keyboard stands on, and what a key press makes of them. */
export class KeyboardState {
  page: KeyPage = 'letters';
  shift: ShiftState = 'off';
  caps = false;

  /** Letters are written big: Caps, or Shift for one letter (Caps and Shift together: small, as on a PC). */
  get upper(): boolean {
    return this.caps !== (this.shift === 'once');
  }

  /** Back to the start for a new box: its first page, no Shift (Caps is kept, as a PC's). */
  reset(digits: boolean): void {
    this.page = digits ? 'digits' : 'letters';
    this.shift = 'off';
  }

  /**
   * A key pressed: the text it types (`''` for none) or what else it asks of the box. Shift, Caps and the page keys change
   * the keyboard only. A letter typed with Shift once lets go of Shift.
   */
  press(action: KeyAction): { type: string } | { do: 'back' | 'enter' | 'clear' | 'max' } | null {
    switch (action.kind) {
      case 'char': {
        const letter = /^[a-z]$/.test(action.char);
        const typed = letter && this.upper ? action.char.toUpperCase() : action.char;
        if (letter) this.shift = 'off';
        return { type: typed };
      }
      case 'space': return { type: ' ' };
      case 'shift': this.shift = this.shift === 'once' ? 'off' : 'once'; return null;
      case 'caps': this.caps = !this.caps; this.shift = 'off'; return null;
      case 'page': this.page = action.page; this.shift = 'off'; return null;
      case 'back': return { do: 'back' };
      case 'enter': return { do: 'enter' };
      case 'clear': return { do: 'clear' };
      case 'max': return { do: 'max' };
    }
  }
}

/** What a box shows on the keyboard's own line: dots for a secret box, a mark for each new line. */
export function shownText(value: string, rules: BoxRules): string {
  if (rules.secret) return '•'.repeat(value.length);
  return value.replace(/\n/g, '↵');
}

/** A rectangle on the screen, in CSS px. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const overlap = (a: Rect, b: Rect): number => {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
};

/**
 * Where the keyboard stands (its top left) on a screen `screen` big, so as not to cover the box typed in (`box`): at the
 * bottom in the middle, else at the top, else in a corner; when every place covers it, the one that covers least (the
 * keyboard's own line shows the text). `margin` is kept from the screen's edges and around the box.
 */
export function placeKeyboard(screen: { width: number; height: number }, size: { width: number; height: number }, box: Rect | null,
  margin = 4): { left: number; top: number } {
  const width = Math.min(size.width, screen.width), height = Math.min(size.height, screen.height);
  const middle = Math.round((screen.width - width) / 2);
  const right = Math.max(0, screen.width - width - margin);
  const bottom = Math.max(0, screen.height - height - margin);
  const top = Math.min(margin, bottom);
  const places = [
    { left: middle, top: bottom }, { left: middle, top }, { left: right, top: bottom }, { left: margin, top: bottom },
    { left: right, top }, { left: margin, top },
  ];
  if (box === null) return places[0]!;
  const around: Rect = { left: box.left - margin, top: box.top - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
  let best = places[0]!, least = Infinity;
  for (const place of places) {
    const covered = overlap({ ...place, width, height }, around);
    if (covered === 0) return place;
    if (covered < least) { least = covered; best = place; }
  }
  return best;
}

/** How long Backspace is held before it repeats, and how often it repeats then (ms). */
export const REPEAT_DELAY = 400;
export const REPEAT_EVERY = 60;

/**
 * A held key that repeats (Backspace): `start` presses once, again after `REPEAT_DELAY`, then each `REPEAT_EVERY` until
 * `stop`. The timers are the page's, given (`setTimeout`/`setInterval`), so a test can run them.
 */
export class KeyRepeat {
  private delay: unknown = null;
  private every: unknown = null;

  constructor(private readonly timers: Timers = globalThis) {}

  get held(): boolean {
    return this.delay !== null || this.every !== null;
  }

  start(press: () => void): void {
    this.stop();
    press();
    this.delay = this.timers.setTimeout(() => {
      this.delay = null;
      this.every = this.timers.setInterval(press, REPEAT_EVERY);
    }, REPEAT_DELAY);
  }

  stop(): void {
    if (this.delay !== null) this.timers.clearTimeout(this.delay as never);
    if (this.every !== null) this.timers.clearInterval(this.every as never);
    this.delay = null;
    this.every = null;
  }
}

/** The page's timers (a window's, or the tests'). */
export interface Timers {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: never): void;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: never): void;
}
