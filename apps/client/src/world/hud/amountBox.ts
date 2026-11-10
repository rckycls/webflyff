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
      textButton(doc, 'OK', () => this.ok(Math.max(1, Math.min(this.pad.count, this.max))), 'ok'),
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

  /** "Item" with "Move how many items?" / "Number:", or "Penya" with its two lines; the amount set to all of it (`max`). */
  open(title: string, question: string, label: string, max: number): void {
    this.max = max;
    if (this.desktop !== null) {
      this.desktop.open(title, question, label, max);
      return;
    }
    const sheet = this.sheet!;
    this.pad = new CountPad(max);
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
