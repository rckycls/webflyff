// The two keypads of the personal shop (2026-11-10, personal-shop research §2.3, §3.3): Neuz's own, not the trade's
// quantity box. Each is the class's state and its key handling, so the desktop's buttons and keys and the phone's field
// share them.
//
//   CWndRegVend   _Interface/WndRegVend.cpp:32-58 (SetItem), :142-270 (the buttons), :360-500 (ProcessCalc, OnChar)
//   CWndVendorBuy _Interface/WndVendorBuy.cpp:35-60 (OnInitialUpdate), :94-216 (the buttons, OK), :241-312 (OnChar)

import { MAX_PRICE } from './vendorRules';

/** A key of the pads: a digit, 00, 000, Min, Max, the calculator's, Backspace (8) and Escape (27). */
export type PadKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000'
  | 'min' | 'max' | '+' | '-' | '*' | '/' | '=' | 'back' | 'escape';

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** `atoi`: the leading digits, 0 for none. */
const atoi = (text: string): number => {
  const match = /^\s*([+-]?\d+)/.exec(text);
  return match === null ? 0 : Number.parseInt(match[1]!, 10) | 0;
};

/** The registration keypad, `CWndRegVend`: Quantity (focus 0) and Unit Price (focus 1). */
export class SellPad {
  /** `WIDC_SELLNUM` and `WIDC_SELLPRI`'s titles. */
  readonly values: [string, string];
  focus: 0 | 1;
  private first = true;
  private calc = { value: 0, op: '' };

  /** `SetItem`: the stack's count and 0; the price focused for a single item. */
  constructor(readonly stack: number) {
    this.values = [String(stack), '0'];
    this.focus = stack <= 1 ? 1 : 0;
  }

  /** A press on a button or a typed key, into the focused field. */
  press(key: PadKey): void {
    const focus = this.focus;
    const str = this.values[focus];
    switch (key) {
      case '=': {
        if (this.first) {
          const i = this.process(atoi(str));
          this.values[focus] = String(i < 0 ? 2_100_000_000 : i);
          this.first = false;
          this.calc.value = 0;
        }
        return;
      }
      case '00': case '000':
        // refused on "0", and when it would pass 9 digits (:216-243)
        if (str !== '0' && (str + key).length <= 9) this.values[focus] = str + key;
        return;
      case 'min': this.values[focus] = '1'; return;
      case 'max': this.values[focus] = String(focus === 0 ? this.stack : 2_100_000_000); return;
      default: this.onChar(key);
    }
  }

  /** `OnChar` (:383-500). */
  private onChar(key: PadKey): void {
    const focus = this.focus;
    let str = this.values[focus];
    if (key === 'escape') {
      this.first = false;
      this.calc.value = 0;
      this.values[focus] = '0';
      return;
    }
    if (key === '+' || key === '-' || key === '*' || key === '/') {
      if (this.first && this.calc.value !== 0) {
        str = String(this.process(atoi(str)));
        this.values[focus] = str;
        this.calc.value = 0;
      }
      this.first = false;
      this.calc.value = atoi(str);
      this.calc.op = key;
      return;
    }
    if (key === 'back') {
      this.values[focus] = str.length > 1 ? str.slice(0, -1) : '0';
      return;
    }
    if (!DIGITS.has(key)) return;
    if (!this.first) {
      str = '0';
      this.first = true;
    }
    if (str !== '0') {
      if (str.length <= 9) str += key;
    } else str = key;
    this.values[focus] = str;
  }

  /** `ProcessCalc` in `int`: a division by 0 gives 0 here (Neuz would stop). */
  private process(num: number): number {
    const value = this.calc.value;
    switch (this.calc.op) {
      case '*': return Math.imul(value, num);
      case '/': return num === 0 ? 0 : Math.trunc(value / num) | 0;
      case '+': return (value + num) | 0;
      case '-': return (value - num) | 0;
      default: return 0;
    }
  }

  /**
   * OK (:272-296): the count (under 1 nothing; over the stack the stack) and the price (64 bits, capped at INT_MAX; under 1
   * nothing). Null when nothing is sent.
   */
  result(): { count: number; cost: number } | null {
    let count = atoi(this.values[0]);
    if (count < 1) return null;
    if (count > this.stack) count = this.stack;
    const digits = /^\s*\d+/.exec(this.values[1])?.[0] ?? '0';
    const cost = Math.min(Number(digits.trim()), MAX_PRICE);
    if (!(cost >= 1)) return null;
    return { count, cost };
  }
}

/** The buy keypad, `CWndVendorBuy`: the quantity, capped to what the slot holds. */
export class BuyPad {
  value: string;
  private first = true;

  /** `OnInitialUpdate`: all the slot holds. */
  constructor(readonly max: number, readonly cost: number) {
    this.value = String(max);
  }

  press(key: PadKey): void {
    const str = this.value;
    switch (key) {
      case '00': case '000':
        if (str !== '0') this.value = str + key;
        break;
      case 'min': this.value = '1'; break;
      case 'max': this.value = String(this.max); break;
      case 'escape': this.first = false; this.value = '0'; break;
      case 'back': this.value = str.length > 1 ? str.slice(0, -1) : '0'; break;
      default:
        if (DIGITS.has(key)) {
          let next = this.first ? str : '0';
          this.first = true;
          next = next !== '0' ? next + key : key;
          this.value = next;
        }
    }
    // the count cut to the slot's (:176-184, :299-307)
    if (atoi(this.value) > this.max) this.value = String(this.max);
  }

  get count(): number {
    return atoi(this.value);
  }

  /** `WIDC_STATIC5`: the total, the price times the count, in `int`. */
  get total(): number {
    return Math.imul(this.cost, this.count);
  }
}
