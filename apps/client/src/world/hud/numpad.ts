// The phone's in-game number pad and its sheet pieces (2026-11-10). First the personal shop's (the owner: "the numpad in
// place of the phone keyboard", hud/vendor/vendorWindows.ts); taken out here so that the bank's and the mail's amounts use the
// same pad (bank-mail). The shop's own keys and keypads stay in the shop's files.

import type { PadKey } from '../vendor/vendorKeypad';

/** The rule every phone layout of the HUD follows (style.css's coarse-pointer blocks). */
export const PHONE = '(max-width: 1000px) and (pointer: coarse)';
export const isPhone = (doc: Document): boolean => doc.defaultView?.matchMedia?.(PHONE).matches === true;

/** A plain button of the phone panels; `name` goes in `data-<attribute>` (the shop's tests find theirs by it). */
export function textButton(doc: Document, label: string, press: () => void, name?: string, attribute = 'button'): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (name !== undefined) button.dataset[attribute] = name;
  button.addEventListener('click', press);
  return button;
}

/**
 * A value of a phone sheet: its caption over its number (with commas). With `choose`, a button that a tap makes the one the
 * numpad types into (Neuz's click on Quantity or Unit Price, WndRegVend.cpp:115-136); else a plain output. Never a text
 * field: the phone keyboard does not come up (2026-11-10, the owner: the numpad in its place).
 */
export function valueBox(doc: Document, label: string, name: string, choose?: () => void): { row: HTMLElement; value: HTMLElement } {
  const row = doc.createElement('div');
  row.className = 'vendor-sheet-value';
  const caption = doc.createElement('span');
  caption.textContent = label;
  let value: HTMLElement;
  if (choose !== undefined) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.addEventListener('click', choose);
    value = button;
  } else value = doc.createElement('output');
  value.dataset.field = name;
  value.setAttribute('aria-label', label);
  row.append(caption, value);
  return { row, value };
}

/** A key of the phone's numpad: its face, the pad key it presses and a name for a screen reader. */
export type NumpadKey = readonly [face: string, key: PadKey, name?: string];

/** The count keys, as the shop's buy keypad has them (`CWndVendorBuy`): the digits, 00, 000, Min, Max, Backspace, Clear. */
export const COUNT_KEYS: readonly NumpadKey[] = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['⌫', 'back', 'Backspace'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['Min', 'min'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['Max', 'max'],
  ['0', '0'], ['00', '00'], ['000', '000'], ['C', 'escape', 'Clear'],
];

/** The phone's in-game numpad: Neuz's keypad keys, sized for a finger, in place of the phone keyboard. */
export function numpad(doc: Document, keys: readonly NumpadKey[], columns: number, press: (key: PadKey) => void): HTMLElement {
  const pad = doc.createElement('div');
  pad.className = 'vendor-numpad';
  pad.style.setProperty('--numpad-columns', String(columns));
  for (const [face, key, name] of keys) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = face;
    button.dataset.padKey = key;
    if (name !== undefined) button.setAttribute('aria-label', name);
    // the press does not take the focus from the sheet (its keys stay the hardware keyboard's)
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => press(key));
    pad.append(button);
  }
  return pad;
}

/** A sheet opening takes the focus from any text field, so the phone keyboard goes away. */
export function dropTyping(doc: Document, sheet: HTMLElement): void {
  const active = doc.activeElement;
  if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
  sheet.focus({ preventScroll: true });
}

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/**
 * The amount of the quantity box (`CWndTradeGold`) typed on the numpad: it opens with all of it, chosen, as Neuz's field opens
 * selected (`OnInitialUpdate`, WndField.cpp:8459-8473), so the first digit replaces it and the next ones follow; Min, Max,
 * Backspace and Clear as the shop's buy keypad has them; never above `max`.
 */
export class CountPad {
  value: string;
  private fresh = true;

  constructor(readonly max: number) {
    this.value = String(max);
  }

  press(key: PadKey): void {
    const fresh = this.fresh;
    this.fresh = false;
    switch (key) {
      case 'min': this.value = '1'; break;
      case 'max': this.value = String(this.max); break;
      case 'escape': this.value = '0'; break;
      case 'back': this.value = fresh || this.value.length <= 1 ? '0' : this.value.slice(0, -1); break;
      case '00': case '000':
        if (!fresh && this.value !== '0') this.value += key;
        break;
      default:
        if (!DIGITS.has(key)) return;
        this.value = fresh || this.value === '0' ? key : this.value + key;
    }
    if (this.count > this.max) this.value = String(this.max);
  }

  get count(): number {
    return Number.parseInt(this.value, 10) || 0;
  }
}
