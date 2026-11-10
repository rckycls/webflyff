// The personal shop's windows (2026-11-10, docs/superpowers/specs/2026-11-10-personal-shop-research.md §2-§4). On the
// desktop each is its resdata.inc entry (vendorLayouts.ts) as Neuz draws it; on a landscape phone each is a panel in the
// look of the phone's bag and NPC shop (text 14 px or more, taps in place of drags, number fields for the phone keyboard).
//
//   CWndVendor / CWndVendorCtrl   _Interface/WndVendor.cpp, WndVendorCtrl.cpp   the shop and its 20 slots
//   CWndRegVend                   _Interface/WndRegVend.cpp                     the quantity and price keypad
//   CWndVendorBuy                 _Interface/WndVendorBuy.cpp                   the buy keypad
//   CWndVendorMessage             WndVendor.cpp:507-765                         the chat room

import type { InventoryItem } from '@flyffweb/protocol';
import type { UiArt } from '../art';
import { cssRgb, themeUrl } from '../art';
import { place } from '../button';
import { WindowFrame } from '../frame';
import { ResWindow } from '../resWindow';
import { BUY, CHAT, PAD_KEYS, SELL, VENDOR } from './vendorLayouts';
import { BuyPad, SellPad } from '../../vendor/vendorKeypad';
import type { PadKey } from '../../vendor/vendorKeypad';
import { VENDOR_SLOTS, priceColor, slotName, slotPoint, withCommas } from '../../vendor/vendorRules';

/** What a slot shows: the item (its icon and name), the count up for sale and the unit price. */
export interface SlotView {
  item: InventoryItem;
  name: string;
  icon: string | null;
  stacks: boolean;
  count: number;
  cost: number;
  expired: boolean;
}

export interface VendorWindowActions {
  /** OK with the name typed. */
  ok(name: string): void;
  /** Cancel or the close button: the owner decides (a box while the own shop is open). */
  cancel(): void;
  reset(): void;
  chat(): void;
  /** A bag item dropped on a slot (the desktop's drag). */
  drop(slot: number, objectId: number): void;
  /** A right click on a filled slot (the seller's `SendUnregisterPVendorItem`). */
  remove(slot: number): void;
  /** A double click on a filled slot (a buyer's `CWndVendorBuy`), a tap on the phone. */
  buy(slot: number): void;
  /** The item's tooltip (APP_VENDOR: with the price) over `anchor`, or none. */
  tooltip(slot: number | null, anchor: HTMLElement | null): void;
}

const PHONE = '(max-width: 1000px) and (pointer: coarse)';
/** 2026-11-10: the phone's keypad sheets, wide enough for the numpad beside the values (a landscape phone has ~360 px above the bar). */
const PHONE_SHEET = { sellWidth: 540, buyWidth: 480, height: 290 };
export const isPhone = (doc: Document): boolean => doc.defaultView?.matchMedia?.(PHONE).matches === true;

/** The slot font: `m_pFontText` (Verdana 9 points, 12 px); the measure for the 108 px cut. */
const SLOT_FONT = '12px Verdana, sans-serif';

/** A plain button of the phone panels. */
function textButton(doc: Document, label: string, press: () => void, name?: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (name !== undefined) button.dataset.vendorButton = name;
  button.addEventListener('click', press);
  return button;
}

/**
 * The shop window, `CWndVendor`: the seller's set-up (the name, OK, Cancel, Reset, Chat, drops on the slots, right clicks
 * off them) or a buyer's view of another's shop (the title shown, OK and Cancel hidden, double clicks to buy).
 */
export class VendorWindow {
  readonly frame: WindowFrame;
  readonly element: HTMLElement;
  readonly phone: boolean;
  /** The seller's own shop (true) or another's. */
  own = true;
  private slots: (SlotView | null)[] = [];
  private readonly res: ResWindow | null;
  private readonly name: HTMLInputElement;
  private readonly okButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly slotArea: HTMLElement;
  private readonly measure: CanvasRenderingContext2D | null;
  /** The phone's chosen empty slot for the next bag item. */
  chosen: number | null = null;
  private hint: HTMLElement | null = null;
  private carrying = false;

  constructor(private readonly art: UiArt, private readonly actions: VendorWindowActions, private readonly doc: Document = document) {
    this.phone = isPhone(doc);
    this.measure = doc.createElement('canvas').getContext('2d');
    if (this.measure !== null) this.measure.font = SLOT_FONT;
    if (!this.phone) {
      const res = new ResWindow({ ...VENDOR, frame: { mobileScale: 1, fitWhole: true } }, art, doc);
      this.res = res;
      this.frame = res.frame;
      this.element = res.element;
      this.name = res.input('WIDC_EDIT1');
      this.okButton = res.button('WIDC_OK');
      this.cancelButton = res.button('WIDC_CANCEL');
      this.resetButton = res.button('WIDC_RESET');
      this.okButton.addEventListener('click', () => this.actions.ok(this.name.value));
      this.cancelButton.addEventListener('click', () => this.actions.cancel());
      this.resetButton.addEventListener('click', () => this.actions.reset());
      res.button('WIDC_CHAT').addEventListener('click', () => this.actions.chat());
      this.name.addEventListener('keydown', (event) => { if (event.key === 'Enter') this.actions.ok(this.name.value); });
      this.slotArea = res.control('SLOTS');
      this.slotArea.classList.add('vendor-slots');
      this.slotArea.addEventListener('dragover', (event) => {
        if (!this.own || event.dataTransfer?.types.includes('application/x-flyff-inventory') !== true) return;
        event.preventDefault();
        this.markCarried(this.slotAt(event));
      });
      this.slotArea.addEventListener('dragleave', () => this.markCarried(null));
      this.slotArea.addEventListener('drop', (event) => {
        this.markCarried(null);
        const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
        const slot = this.slotAt(event, true);
        if (!this.own || !Number.isFinite(id) || slot === null) return;
        event.preventDefault();
        this.actions.drop(slot, id);
      });
    } else {
      this.res = null;
      const frame = new WindowFrame(VENDOR.title, art, { width: VENDOR.width, height: VENDOR.height }, doc);
      this.frame = frame;
      this.element = frame.element;
      const body = frame.body;
      body.classList.add('vendor-phone');
      const head = doc.createElement('div');
      head.className = 'vendor-phone-head';
      const label = doc.createElement('label');
      label.textContent = 'Shop Name';
      this.name = doc.createElement('input');
      this.name.type = 'text';
      this.name.maxLength = 47;
      this.name.enterKeyHint = 'done';
      this.name.autocomplete = 'off';
      this.name.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') this.actions.ok(this.name.value); });
      this.name.addEventListener('keyup', (event) => event.stopPropagation());
      label.append(this.name);
      const buttons = doc.createElement('div');
      buttons.className = 'vendor-phone-buttons';
      this.okButton = textButton(doc, 'Open', () => this.actions.ok(this.name.value), 'ok');
      this.cancelButton = textButton(doc, 'Cancel', () => this.actions.cancel(), 'cancel');
      this.resetButton = textButton(doc, 'Reset', () => this.actions.reset(), 'reset');
      buttons.append(this.okButton, this.cancelButton, this.resetButton, textButton(doc, 'Chat', () => this.actions.chat(), 'chat'));
      head.append(label, buttons);
      this.hint = doc.createElement('p');
      this.hint.className = 'vendor-phone-hint';
      this.slotArea = doc.createElement('div');
      this.slotArea.className = 'vendor-phone-slots';
      this.slotArea.setAttribute('role', 'list');
      body.append(head, this.hint, this.slotArea);
    }
    this.frame.element.classList.add('hud-vendor');
    // the close button is Cancel (WIDC_CANCEL or WTBID_CLOSE, WndVendor.cpp:380-392): it asks first while the own shop is open
    this.frame.element.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      if (target?.closest('.hud-window-close') === null || target === null) return;
      event.stopPropagation();
      this.actions.cancel();
    }, true);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** The window as a seller's (own) or a buyer's: the name field, OK and Cancel (`SetVendor`, WndVendor.cpp:49-69). */
  setMode(own: boolean, title: string): void {
    this.own = own;
    this.chosen = null;
    this.name.value = title;
    this.name.disabled = !own;
    this.okButton.hidden = !own;
    this.cancelButton.hidden = !own;
    // Neuz leaves Reset on a buyer's window (Process only hides it while the own shop is open), where it would take the
    // buyer's own items off: hidden here
    this.resetButton.hidden = !own;
    this.frame.element.dataset.vendorMode = own ? 'seller' : 'buyer';
    this.draw();
  }

  /** The window's title (`SetTitle`): "Private Shop", or "Private Shop(Shop is opening)" once open. */
  setTitle(text: string): void {
    this.frame.setTitle(text);
  }

  /** The own shop opened: the name field off (`OnPVendorOpen`), Reset hidden (`Process`), OK hidden. */
  setOpen(open: boolean): void {
    if (this.own) this.name.disabled = open;
    this.resetButton.hidden = open || !this.own;
    if (open) this.okButton.hidden = true;
    // Escape asks too while open: the window is only shut through the box
    this.frame.escapeCloses = !open;
    this.frame.element.toggleAttribute('data-vendor-open', open);
    this.draw();
  }

  /** OK hidden while the box asks, shown again on its Cancel (WndVendor.cpp:377-378, :797-805). */
  showOk(shown: boolean): void {
    if (this.own) this.okButton.hidden = !shown;
  }

  setSlots(slots: readonly (SlotView | null)[]): void {
    this.slots = [...slots];
    this.draw();
  }

  /** The phone's hint line under the buttons. */
  setHint(text: string): void {
    if (this.hint !== null) this.hint.textContent = text;
  }

  get typedName(): string {
    return this.name.value;
  }

  private width(text: string): number {
    return this.measure?.measureText(text).width ?? text.length * 6;
  }

  /** The slot under a drag point: the 180 x 32 rect of each slot (WndVendorCtrl.cpp:335-342); `empty` only a free one. */
  private slotAt(event: DragEvent, empty = false): number | null {
    const box = this.slotArea.getBoundingClientRect();
    const scale = box.width / 435 || 1;
    const x = (event.clientX - box.left) / scale + 5, y = (event.clientY - box.top) / scale + 60;
    for (let i = 0; i < VENDOR_SLOTS; i++) {
      const at = slotPoint(i);
      if (x >= at.x && x < at.x + 180 && y >= at.y && y < at.y + 32) return empty && this.slots[i] ? null : i;
    }
    return null;
  }

  /** `WndPosMark.tga` on the slot under a carried item (WndVendorCtrl.cpp:184-193). */
  private markCarried(slot: number | null): void {
    this.carrying = slot !== null;
    for (const mark of this.slotArea.querySelectorAll<HTMLElement>('[data-slot]')) {
      mark.classList.toggle('is-carried-over', Number(mark.dataset.slot) === slot);
    }
  }

  private draw(): void {
    if (this.phone) this.drawPhone();
    else this.drawDesktop();
  }

  /** `CWndVendorCtrl::OnDraw` (WndVendorCtrl.cpp:157-233): each slot's icon, name, price and count. */
  private drawDesktop(): void {
    const doc = this.doc;
    this.slotArea.replaceChildren();
    for (let i = 0; i < VENDOR_SLOTS; i++) {
      const at = slotPoint(i);
      const cell = doc.createElement('div');
      cell.className = 'vendor-slot';
      cell.dataset.slot = String(i);
      place(cell, { left: at.x - 5, top: at.y - 60, width: 180, height: 32 });
      cell.style.setProperty('--vendor-mark', themeUrl(this.art, 'WndPosMark.tga'));
      const view = this.slots[i] ?? null;
      if (view !== null) {
        cell.classList.add('is-filled');
        cell.setAttribute('aria-label', `${view.name} x${view.count}, ${withCommas(view.cost)} penya`);
        if (view.icon !== null) {
          const icon = doc.createElement('img');
          icon.className = 'vendor-slot-icon';
          icon.src = this.art.url(view.icon);
          icon.alt = '';
          icon.draggable = false;
          if (view.expired) icon.classList.add('is-expired');
          cell.append(icon);
        }
        const name = doc.createElement('span');
        name.className = 'vendor-slot-name';
        name.textContent = slotName(view.name, view.item.abilityOption ?? 0, (text) => this.width(text));
        const price = doc.createElement('span');
        price.className = 'vendor-slot-price';
        price.textContent = withCommas(view.cost);
        price.style.color = cssRgb(priceColor(view.cost));
        cell.append(name, price);
        if (view.stacks) {
          const count = doc.createElement('span');
          count.className = 'vendor-slot-count';
          count.textContent = String(view.count);
          cell.append(count);
        }
        cell.addEventListener('mouseenter', () => this.actions.tooltip(i, cell));
        cell.addEventListener('mouseleave', () => this.actions.tooltip(null, null));
        // a right click takes it off (OnRButtonUp), a double click buys (OnLButtonDblClk, not on the own shop)
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          if (this.own) this.actions.remove(i);
        });
        cell.addEventListener('dblclick', () => { if (!this.own) this.actions.buy(i); });
      }
      this.slotArea.append(cell);
    }
    if (this.carrying) this.markCarried(null);
  }

  /** The phone's list: a row a slot, tapped to choose a free one (seller), take one off (seller) or buy (buyer). */
  private drawPhone(): void {
    const doc = this.doc;
    const open = this.frame.element.hasAttribute('data-vendor-open');
    this.slotArea.replaceChildren();
    for (let i = 0; i < VENDOR_SLOTS; i++) {
      const view = this.slots[i] ?? null;
      if (view === null && !this.own) continue;
      const row = doc.createElement('div');
      row.className = 'vendor-phone-row';
      row.dataset.slot = String(i);
      row.setAttribute('role', 'listitem');
      const icon = doc.createElement('span');
      icon.className = 'vendor-phone-icon';
      if (view?.icon) {
        const image = doc.createElement('img');
        image.src = this.art.url(view.icon);
        image.alt = '';
        icon.append(image);
      }
      const text = doc.createElement('span');
      text.className = 'vendor-phone-text';
      const name = doc.createElement('span');
      name.className = 'vendor-slot-name';
      const price = doc.createElement('span');
      price.className = 'vendor-slot-price';
      if (view !== null) {
        row.classList.add('is-filled');
        name.textContent = `${view.name}${(view.item.abilityOption ?? 0) > 0 ? ` +${view.item.abilityOption}` : ''}${view.stacks ? ` x${view.count}` : ''}`;
        price.textContent = `${withCommas(view.cost)} penya`;
        price.style.color = cssRgb(priceColor(view.cost));
      } else {
        name.textContent = open ? 'Empty' : 'Empty: tap, then tap a bag item';
        row.classList.toggle('is-chosen', this.chosen === i);
      }
      text.append(name, price);
      row.append(icon, text);
      if (view !== null && this.own && !open) {
        row.append(textButton(doc, 'Remove', () => this.actions.remove(i), 'remove'));
      }
      row.addEventListener('click', (event) => {
        if ((event.target as Element).closest('button') !== null) return;
        if (view !== null) {
          if (!this.own) this.actions.buy(i);
          return;
        }
        if (this.own && !open) {
          this.chosen = this.chosen === i ? null : i;
          this.draw();
        }
      });
      this.slotArea.append(row);
    }
  }

  /** The place the phone's bag tap goes: the chosen free slot, else the first free one. */
  freeSlot(): number | null {
    if (this.chosen !== null && this.slots[this.chosen] == null) return this.chosen;
    for (let i = 0; i < VENDOR_SLOTS; i++) if (this.slots[i] == null) return i;
    return null;
  }

  open(at: { x: number; y: number } | 'center'): void {
    if (this.res !== null) this.res.open(at);
    else this.frame.open(at);
  }

  close(): void {
    this.frame.close();
  }
}

/** A keypad's buttons wired to `press` (`OnChildNotify`'s switch). */
function wirePad(res: ResWindow, press: (key: PadKey) => void): void {
  for (const control of res.layout.controls) {
    const key = PAD_KEYS.get(control.id);
    if (key !== undefined) res.button(control.id).addEventListener('click', () => press(key as PadKey));
  }
}

/** The typed keys of the pads (`OnChar`): digits, Backspace, Escape and, for the registration, + - * / and =. */
function keyOf(event: KeyboardEvent, calculator: boolean): PadKey | null {
  if (/^[0-9]$/.test(event.key)) return event.key as PadKey;
  if (event.key === 'Backspace') return 'back';
  if (calculator && ['+', '-', '*', '/'].includes(event.key)) return event.key as PadKey;
  if (calculator && event.key === '=') return '=';
  return null;
}

/**
 * A value of a phone sheet: its caption over its number (with commas). With `choose`, a button that a tap makes the one the
 * numpad types into (Neuz's click on Quantity or Unit Price, WndRegVend.cpp:115-136); else a plain output. Never a text
 * field: the phone keyboard does not come up (2026-11-10, the owner: the numpad in its place).
 */
function valueBox(doc: Document, label: string, name: string, choose?: () => void): { row: HTMLElement; value: HTMLElement } {
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
type NumpadKey = readonly [face: string, key: PadKey, name?: string];

/**
 * The registration's keys, as CWndRegVend has them (resdata.inc:12278-): the digits, 00, 000, Min, Max, the calculator's
 * + - * / = and Backspace (`OnChar` 8), five to a row.
 */
const SELL_KEYS: readonly NumpadKey[] = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['\u00f7', '/', 'Divide'], ['\u232b', 'back', 'Backspace'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['\u00d7', '*', 'Times'], ['Min', 'min'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['\u2212', '-', 'Minus'], ['Max', 'max'],
  ['0', '0'], ['00', '00'], ['000', '000'], ['+', '+', 'Plus'], ['=', '=', 'Equals'],
];
/** The buy keypad's keys, as CWndVendorBuy has them (resdata.inc:12977-): the digits, 00, 000, Min, Max, and Backspace and
 * Escape (`OnChar` 8 and 27, here C), four to a row. */
const BUY_KEYS: readonly NumpadKey[] = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['\u232b', 'back', 'Backspace'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['Min', 'min'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['Max', 'max'],
  ['0', '0'], ['00', '00'], ['000', '000'], ['C', 'escape', 'Clear'],
];

/** The phone's in-game numpad: Neuz's keypad keys, sized for a finger, in place of the phone keyboard. */
function numpad(doc: Document, keys: readonly NumpadKey[], columns: number, press: (key: PadKey) => void): HTMLElement {
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

/** A sheet opening takes the focus from any text field (the shop's name), so the phone keyboard goes away. */
function dropTyping(doc: Document, sheet: HTMLElement): void {
  const active = doc.activeElement;
  if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
  sheet.focus({ preventScroll: true });
}

/**
 * `CWndRegVend` (APP_VENDOREX_SELL): Quantity and Unit Price, typed with its keypad or the keys, the arrow on the focused
 * one; OK hands the pad's result to `submit`.
 */
export class SellPadWindow {
  readonly frame: WindowFrame;
  readonly element: HTMLElement;
  pad: SellPad = new SellPad(1);
  private readonly res: ResWindow | null;
  private readonly arrow: HTMLElement | null = null;
  private fields: [HTMLElement, HTMLElement] | null = null;
  slot = -1;
  objectId = -1;

  constructor(art: UiArt, private readonly submit: (result: { count: number; cost: number } | null) => void, private readonly doc: Document = document) {
    if (!isPhone(doc)) {
      const res = new ResWindow({ ...SELL, frame: { mobileScale: 1, fitWhole: true } }, art, doc);
      this.res = res;
      this.frame = res.frame;
      this.element = res.element;
      wirePad(res, (key) => { this.pad.press(key); this.draw(); });
      res.button('WIDC_OK').addEventListener('click', () => this.submit(this.pad.result()));
      res.button('WIDC_CANCEL').addEventListener('click', () => this.close());
      // a click on Quantity or Unit Price focuses it (OnLButtonUp, WndRegVend.cpp:115-136)
      for (const [id, focus] of [['WIDC_SELLNUM', 0], ['WIDC_SELLPRI', 1]] as const) {
        res.control(id).parentElement?.addEventListener('click', () => { this.pad.focus = focus; this.draw(); });
      }
      // WndVenderArrowEx.tga 4 px up-left of the focused field (:60-66, :72-91)
      const arrow = doc.createElement('div');
      arrow.className = 'vendor-pad-arrow';
      arrow.style.backgroundImage = themeUrl(art, 'WndVenderArrowEx.tga');
      res.frame.body.append(arrow);
      this.arrow = arrow;
      res.frame.element.tabIndex = -1;
      res.frame.element.addEventListener('keydown', (event) => this.onKey(event));
    } else {
      this.res = null;
      // 2026-11-10 (the owner): the phone's sheet has the keypad as an in-game numpad, and no text field: Quantity and Unit
      // Price are tapped to choose the one it types into, as Neuz's are clicked
      const frame = new WindowFrame(SELL.title, art, { width: PHONE_SHEET.sellWidth, height: PHONE_SHEET.height, mobileScale: 1, fitWhole: true }, doc);
      this.frame = frame;
      this.element = frame.element;
      frame.body.classList.add('vendor-sheet');
      const count = valueBox(doc, 'Quantity', 'quantity', () => { this.pad.focus = 0; this.draw(); });
      const price = valueBox(doc, 'Unit Price', 'price', () => { this.pad.focus = 1; this.draw(); });
      this.fields = [count.value, price.value];
      const side = doc.createElement('div');
      side.className = 'vendor-sheet-side';
      const buttons = doc.createElement('div');
      buttons.className = 'vendor-sheet-buttons';
      buttons.append(textButton(doc, 'OK', () => this.submit(this.pad.result()), 'ok'), textButton(doc, 'Cancel', () => this.close(), 'cancel'));
      side.append(count.row, price.row, buttons);
      frame.body.append(side, numpad(doc, SELL_KEYS, 5, (key) => { this.pad.press(key); this.draw(); }));
      // a hardware keyboard's keys still type, as on the desktop
      frame.element.tabIndex = -1;
      frame.element.addEventListener('keydown', (event) => this.onKey(event));
    }
    this.frame.element.classList.add('hud-vendor-sell');
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** `SetItem` and `OnInitialUpdate`: the stack's count and 0, centred over the shop (`MoveParentCenter`). */
  open(slot: number, objectId: number, stack: number): void {
    this.slot = slot;
    this.objectId = objectId;
    this.pad = new SellPad(stack);
    if (this.res !== null) this.res.open('center');
    else this.frame.open('center');
    this.draw();
    dropTyping(this.doc, this.frame.element);
  }

  close(): void {
    this.frame.close();
  }

  private onKey(event: KeyboardEvent): void {
    if ((event.target as Element).closest('input') !== null) return;
    const key = keyOf(event, true);
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); this.submit(this.pad.result()); return; }
    if (event.key === 'Escape') { event.preventDefault(); this.pad.press('escape'); this.draw(); return; }
    if (key === null) return;
    event.preventDefault();
    this.pad.press(key);
    this.draw();
  }

  private draw(): void {
    if (this.res !== null) {
      this.res.setText('WIDC_SELLNUM', withCommas(Number(this.pad.values[0])));
      this.res.setText('WIDC_SELLPRI', withCommas(Number(this.pad.values[1])));
      // m_pt[focus]: the field's top left less 4 px each way
      const top = this.pad.focus === 0 ? 8 : 32;
      if (this.arrow !== null) place(this.arrow, { left: 86 - 4, top: top - 4, width: 128, height: 24 });
    } else if (this.fields !== null) {
      for (const [focus, field] of this.fields.entries()) {
        field.textContent = withCommas(Number(this.pad.values[focus as 0 | 1]));
        field.setAttribute('aria-pressed', String(this.pad.focus === focus));
      }
    }
    this.frame.element.dataset.focus = String(this.pad.focus);
  }
}

/** `CWndVendorBuy` (APP_VENDOREX_BUY): Quantity (all the slot holds), Price, Total Cost; OK hands the count to `submit`. */
export class BuyPadWindow {
  readonly frame: WindowFrame;
  readonly element: HTMLElement;
  pad: BuyPad = new BuyPad(1, 0);
  slot = -1;
  private readonly res: ResWindow | null;
  private field: HTMLElement | null = null;
  private price: HTMLElement | null = null;
  private total: HTMLElement | null = null;

  constructor(art: UiArt, private readonly submit: (count: number) => void, private readonly doc: Document = document) {
    if (!isPhone(doc)) {
      const res = new ResWindow({ ...BUY, frame: { mobileScale: 1, fitWhole: true } }, art, doc);
      this.res = res;
      this.frame = res.frame;
      this.element = res.element;
      wirePad(res, (key) => { this.pad.press(key); this.draw(); });
      res.button('WIDC_OK').addEventListener('click', () => this.submit(this.pad.count));
      res.button('WIDC_CANCEL').addEventListener('click', () => this.close());
      res.frame.element.tabIndex = -1;
      res.frame.element.addEventListener('keydown', (event) => this.onKey(event));
    } else {
      this.res = null;
      // 2026-11-10 (the owner): the phone's sheet has the keypad as an in-game numpad, and no text field
      const frame = new WindowFrame(BUY.title, art, { width: PHONE_SHEET.buyWidth, height: PHONE_SHEET.height, mobileScale: 1, fitWhole: true }, doc);
      this.frame = frame;
      this.element = frame.element;
      frame.body.classList.add('vendor-sheet');
      const count = valueBox(doc, 'Quantity', 'quantity');
      const price = valueBox(doc, 'Price', 'price');
      const total = valueBox(doc, 'Total Cost', 'total');
      this.field = count.value;
      this.price = price.value;
      this.total = total.value;
      const side = doc.createElement('div');
      side.className = 'vendor-sheet-side';
      const buttons = doc.createElement('div');
      buttons.className = 'vendor-sheet-buttons';
      buttons.append(textButton(doc, 'OK', () => this.submit(this.pad.count), 'ok'), textButton(doc, 'Cancel', () => this.close(), 'cancel'));
      side.append(count.row, price.row, total.row, buttons);
      frame.body.append(side, numpad(doc, BUY_KEYS, 4, (key) => { this.pad.press(key); this.draw(); }));
      frame.element.tabIndex = -1;
      frame.element.addEventListener('keydown', (event) => this.onKey(event));
    }
    this.frame.element.classList.add('hud-vendor-buy');
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  open(slot: number, max: number, cost: number): void {
    this.slot = slot;
    this.pad = new BuyPad(max, cost);
    if (this.res !== null) this.res.open('center');
    else this.frame.open('center');
    this.draw();
    dropTyping(this.doc, this.frame.element);
  }

  close(): void {
    this.frame.close();
  }

  /** The keys (`OnChar`): digits, Backspace, Escape; Enter is OK. */
  private onKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); this.submit(this.pad.count); return; }
    if (event.key === 'Escape') { event.preventDefault(); this.pad.press('escape'); this.draw(); return; }
    const key = keyOf(event, false);
    if (key === null) return;
    event.preventDefault();
    this.pad.press(key);
    this.draw();
  }

  private draw(): void {
    if (this.res !== null) {
      this.res.setText('WIDC_BUYNUM', withCommas(this.pad.count));
      this.res.setText('WIDC_STATIC4', withCommas(this.pad.cost));
      this.res.setText('WIDC_STATIC5', withCommas(this.pad.total));
    } else {
      if (this.field !== null) this.field.textContent = withCommas(this.pad.count);
      if (this.price !== null) this.price.textContent = withCommas(this.pad.cost);
      if (this.total !== null) this.total.textContent = withCommas(this.pad.total);
    }
  }
}

/** A line of the chat room's texts: words and their colour (`#cAARRGGBB ... #nc`). */
export interface ChatPiece {
  text: string;
  color: number;
}

/**
 * `CWndVendorMessage` (APP_VENDOREX_CHAT): the Dialog tab (and the seller's Information tab), the users, the line and
 * Send. Placed at the layout's right, 110 px down, then centred on the shop (WndVendor.cpp:572-576).
 */
export class VendorChatWindow {
  readonly frame: WindowFrame;
  readonly element: HTMLElement;
  private readonly res: ResWindow | null;
  private readonly tabs: HTMLElement;
  private readonly panes: [HTMLElement, HTMLElement];
  private readonly tabButtons: [HTMLButtonElement, HTMLButtonElement];
  private readonly users: HTMLElement;
  private readonly input: HTMLInputElement;
  private owner = false;
  private tab = 0;
  onSend: (text: string) => void = () => {};
  onClosed: () => void = () => {};

  constructor(art: UiArt, private readonly texts: (id: string, english: string) => string, private readonly doc: Document = document) {
    const phone = isPhone(doc);
    const send = (): void => {
      const text = this.input.value;
      if (text.trim() === '') return;
      this.onSend(text);
      this.input.value = '';
    };
    if (!phone) {
      const res = new ResWindow({ ...CHAT, frame: { mobileScale: 1, fitWhole: true } }, art, doc);
      this.res = res;
      this.frame = res.frame;
      this.element = res.element;
      this.input = res.input('WIDC_EDIT1');
      res.button('WIDC_BUTTON1').addEventListener('click', send);
      this.users = res.control('WIDC_LISTBOX1');
      this.tabs = res.control('WIDC_TABCTRL1');
    } else {
      this.res = null;
      const frame = new WindowFrame(CHAT.title, art, { width: CHAT.width, height: CHAT.height }, doc);
      this.frame = frame;
      this.element = frame.element;
      frame.body.classList.add('vendor-chat-phone');
      this.tabs = doc.createElement('div');
      this.users = doc.createElement('div');
      this.users.className = 'vendor-chat-users';
      this.input = doc.createElement('input');
      this.input.type = 'text';
      this.input.maxLength = 1019;
      this.input.enterKeyHint = 'send';
      this.input.addEventListener('keyup', (event) => event.stopPropagation());
      const line = doc.createElement('div');
      line.className = 'vendor-chat-line';
      line.append(this.input, textButton(doc, 'Send', send, 'send'));
      frame.body.append(this.tabs, this.users, line);
    }
    this.input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') send();
    });
    this.tabs.classList.add('vendor-chat-tabs');
    const pane = (): HTMLElement => {
      const element = doc.createElement('div');
      element.className = 'vendor-chat-pane';
      element.setAttribute('role', 'log');
      return element;
    };
    this.panes = [pane(), pane()];
    const tabButton = (index: number, label: string): HTMLButtonElement => {
      const button = textButton(doc, label, () => this.show(index), index === 0 ? 'dialog' : 'information');
      button.className = 'vendor-chat-tab';
      return button;
    };
    // TID_APP_DIALOG "Dialog", TID_APP_INFOMATION "Information" (WndVendor.cpp:556, :565)
    this.tabButtons = [tabButton(0, texts('TID_APP_DIALOG', 'Dialog')), tabButton(1, texts('TID_APP_INFOMATION', 'Information'))];
    const strip = doc.createElement('div');
    strip.className = 'vendor-chat-strip';
    strip.append(...this.tabButtons);
    this.tabs.append(...this.panes, strip);
    this.frame.element.classList.add('hud-vendor-chat');
    this.frame.onClose = () => this.onClosed();
    this.show(0);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** `m_nIsOwner`: the seller's window has the Information tab. */
  open(owner: boolean): void {
    this.owner = owner;
    this.tabButtons[1].hidden = !owner;
    if (!owner) this.show(0);
    if (this.res !== null) this.res.open('center');
    else this.frame.open('center');
  }

  close(): void {
    this.frame.close();
  }

  toggle(): void {
    if (this.frame.isOpen) this.frame.element.hidden = !this.frame.element.hidden;
  }

  private show(index: number): void {
    this.tab = index;
    this.panes.forEach((pane, i) => { pane.hidden = i !== index; });
    this.tabButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }

  /** `AddMessage` (WndVendor.cpp:664-694): "name" + TID_GAME_FROM3 + " :" in red (oneself) or blue, the line under it. */
  addMessage(from: string, text: string, own: boolean): void {
    this.add(0, [{ text: `${from}${this.texts('TID_GAME_FROM3', '')} :`, color: own ? 0xffff0000 : 0xff0000ff }], `  ${text}`);
  }

  /** The seller's Information tab: comings and goings in red, sales in blue (`AddChattingMemver`, `WriteBuyInfo`). */
  addInfo(text: string, color: number): void {
    if (!this.owner) return;
    this.add(1, [{ text, color }]);
  }

  setUsers(names: readonly string[]): void {
    this.users.replaceChildren(...names.map((name) => {
      const row = this.doc.createElement('div');
      row.setAttribute('role', 'option');
      row.textContent = name;
      return row;
    }));
  }

  private add(pane: number, pieces: readonly ChatPiece[], next?: string): void {
    const element = this.panes[pane]!;
    const line = this.doc.createElement('div');
    line.className = 'vendor-chat-text';
    for (const piece of pieces) {
      const span = this.doc.createElement('span');
      span.textContent = piece.text;
      span.style.color = cssRgb(piece.color);
      line.append(span);
    }
    element.append(line);
    if (next !== undefined) {
      const words = this.doc.createElement('div');
      words.className = 'vendor-chat-text';
      words.textContent = next;
      element.append(words);
    }
    element.scrollTop = element.scrollHeight; // SetMaxScrollPos
  }

  get shownTab(): number {
    return this.tab;
  }
}
