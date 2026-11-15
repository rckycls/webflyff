// The quantity box of the bank and the mail (2026-11-10, bank-mail research §1.4, §2.2): Neuz uses the trade's `CWndTradeGold`
// ("Move Items", APP_TRADE_GOLD, modal) for a stack's count and the penya (`WndBank.cpp:230-275`, `WndField.cpp:1893-1947`,
// :14327-14348). On the desktop it is the trade's port as it is (`TradeGoldWindow`); on a landscape phone a sheet with the
// shop's in-game number pad (numpad.ts), the owner's choice for amounts, in place of the phone keyboard. A future guild bank
// can use it too.

import type { UiArt } from './art';
import { withCommas } from '../vendor/vendorRules';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';
import { COUNT_KEYS, CountPad, dropTyping, isPhone, numpad, textButton, valueBox } from './numpad';
import { TradeGoldWindow } from './trade/tradeWindows';
import { quantityOf } from '../trade/tradeState';

/** The phone sheet: the value and its buttons beside a four-column pad. */
const SHEET = { width: 480, height: 290 };

export class AmountBox {
  /** OK with the amount: `atoi`, at least 1, at most the `max` it opened with (`CWndTradeGold::OnChildNotify`, :8493-8504). */
  onOk: (amount: number) => void = () => {};
  /** Closed, by OK, Cancel, Escape or `close`. */
  onClose: () => void = () => {};
  readonly modal: ModalBackdrop;
  private readonly desktop: TradeGoldWindow | null;
  private readonly sheet: { frame: WindowFrame; value: HTMLElement; caption: HTMLElement; question: HTMLElement } | null;
  private pad = new CountPad(0);
  private max = 0;
  private min = 1;

  constructor(art: UiArt, private readonly doc: Document = document) {
    if (!isPhone(doc)) {
      const box = new TradeGoldWindow(art, doc);
      box.onOk = (text) => this.ok(quantityOf(text, this.max));
      box.window.onClose = () => this.onClose();
      this.desktop = box;
      this.sheet = null;
      this.modal = box.window.modal!;
      return;
    }
    this.desktop = null;
    const frame = new WindowFrame('Move Items', art, { width: SHEET.width, height: SHEET.height, mobileScale: 1, fitWhole: true }, doc);
    frame.element.classList.add('hud-amount-box');
    frame.body.classList.add('vendor-sheet');
    const question = doc.createElement('p');
    question.className = 'hud-amount-question';
    const box = valueBox(doc, 'Number:', 'amount');
    const side = doc.createElement('div');
    side.className = 'vendor-sheet-side';
    const buttons = doc.createElement('div');
    buttons.className = 'vendor-sheet-buttons';
    buttons.append(
      textButton(doc, 'OK', () => this.ok(Math.max(this.min, Math.min(this.pad.count, this.max))), 'ok'),
      textButton(doc, 'Cancel', () => this.close(), 'cancel'),
    );
    side.append(question, box.row, buttons);
    frame.body.append(side, numpad(doc, COUNT_KEYS, 4, (key) => { this.pad.press(key); this.draw(); }));
    frame.element.tabIndex = -1;
    frame.onClose = () => { this.modal.hide(); this.onClose(); };
    this.sheet = { frame, value: box.value, caption: box.row.firstElementChild as HTMLElement, question };
    this.modal = new ModalBackdrop(frame, doc);
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.desktop?.element ?? this.modal.element;
  }

  get isOpen(): boolean {
    return this.desktop?.isOpen ?? this.sheet?.frame.isOpen ?? false;
  }

  /**
   * "Item" with "Move how many items?" / "Number:", or "Penya" with its two lines; the amount set to all of it (`max`), at
   * least `min` (the mail's penya may be 0). `start`: what it opens with in place of all of it (a field's pad, `padField`).
   */
  open(title: string, question: string, label: string, max: number, min = 1, start = max): void {
    this.max = max;
    this.min = min;
    if (this.desktop !== null) {
      this.desktop.open(title, question, label, start);
      return;
    }
    const sheet = this.sheet!;
    this.pad = new CountPad(max, start);
    sheet.frame.setTitle(title || 'Move Items');
    sheet.question.textContent = question;
    sheet.caption.textContent = label;
    this.modal.show();
    sheet.frame.open('center');
    this.draw();
    dropTyping(this.doc, sheet.frame.element);
  }

  close(): void {
    if (this.desktop !== null) this.desktop.close();
    else if (this.sheet?.frame.isOpen === true) this.sheet.frame.close();
  }

  private ok(amount: number): void {
    if (!this.isOpen) return;
    this.onOk(amount);
    this.close();
  }

  private draw(): void {
    if (this.sheet !== null) this.sheet.value.textContent = withCommas(this.pad.count);
  }
}

/** What a phone amount field's pad asks, read at each tap. */
export interface PadAsk {
  /** The most it takes, and the least (0 by default). */
  max: number;
  min?: number;
  /** The caption by the number ("Penya:" by default). */
  label?: string;
  /** The sheet's title (the field's window's by default) and its line over the number (none by default). */
  title?: string;
  question?: string;
}

/** The one pad the phone's amount fields share: it is modal, so one is up at a time. */
const fieldPads = new WeakMap<Document, AmountBox>();

/**
 * 2026-11-16 (owner: "every amount uses the in-game number pad, like the bank and mail"): on a phone, an amount field takes
 * the bank's and the mail's number pad in place of the floating keyboard's digit keys. The field is read-only there; a tap
 * opens the pad with what the field holds, and OK writes the amount in and tells the field (`input`, `change`), as typing
 * would, so its own rules (a clamp, a price drawn again) run as before. `ask` gives the limits at the tap, or null for no pad.
 * Nothing on the desktop, where the field is typed. True when the field got the pad.
 */
export function padField(input: HTMLInputElement, art: UiArt, doc: Document, ask: () => PadAsk | null): boolean {
  if (!isPhone(doc)) return false;
  input.readOnly = true;
  input.dataset.numberPad = '';
  input.addEventListener('click', () => {
    const wanted = ask();
    if (wanted === null) return;
    let box = fieldPads.get(doc);
    if (box === undefined) {
      box = new AmountBox(art, doc);
      fieldPads.set(doc, box);
    }
    if (box.isOpen) return;
    // in the windows' layer of the field's window (past a modal's backdrop), where the bank's pad is
    const owner = input.closest<HTMLElement>('.hud-window');
    let layer = owner?.parentElement ?? null;
    if (layer?.classList.contains('hud-modal') === true) layer = layer.parentElement;
    if (layer !== null && box.element.parentElement !== layer) layer.append(box.element);
    const max = Math.max(0, Math.trunc(wanted.max));
    const min = Math.min(Math.max(0, wanted.min ?? 0), max);
    const held = Number.parseInt(input.value.replace(/\D/g, ''), 10);
    box.onOk = (amount) => {
      if (!input.isConnected) return;
      input.value = String(amount);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    box.onClose = () => {};
    box.open(wanted.title ?? owner?.getAttribute('aria-label') ?? '', wanted.question ?? '', wanted.label ?? 'Penya:', max, min,
      Number.isFinite(held) ? Math.max(min, held) : min);
  });
  return true;
}
