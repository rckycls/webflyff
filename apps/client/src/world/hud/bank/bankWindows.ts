// The bank's windows (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §1; A-bank.md §3, §4), each laid
// out from its resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndBank          APP_COMMON_BANK 396     resdata.inc:10679-10798   "WndCommonBank.tga" (one picture), 528 x 256, "Bank": three
//                                                                       tab controls of one "Item" tab, each an item grid of 4 x 5
//                                                                       cells of 32 px over its 42 slots with a scroll bar
//                                                                       (WndBank.cpp:59-86, WndItemCtrl.cpp:1454-1479), the penya
//                                                                       as a plain number (:31-34), a coin to drag it (CWndGold),
//                                                                       and WndCommonBankNotUse.tga at alpha 50 over a bank not
//                                                                       usable (:26-45, :122)
//   CWndConfirmBank   APP_CONFIRM_BANK 256    resdata.inc:28095-28160   272 x 160, "Bank Password": the PIN, OK, Cancel, Change PIN
//   CWndBankPassword  APP_BANK_PASSWORD 248   resdata.inc:26835-26927   272 x 208, "Bank PIN:": Old, New, Confirm, OK, Cancel
//
// The windows draw and report presses and drops; bank/bankHud.ts holds the rules and sends the packets. On a landscape phone
// the bank is a panel beside the bag (style.css) showing one bank at a time, chosen by its tabs, and taps replace drags.

import type { InventoryItem } from '@flyffweb/protocol';
import { BANK_COUNT } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../art';
import { themeUrl } from '../art';
import { place } from '../button';
import { ResWindow, textScrollBar } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import { tabStrip } from '../tiles';
import { isPhone } from '../numpad';
import { BAG_DRAG, PENYA_DRAG } from '../trade/tradeWindows';
import { itemIconOf } from '../../pets/petStatus';

const EDIT = 'WndEditTile00.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter: 72 });

/** The drag of a bank's item (`"<bank>:<object id>"`) and of a bank's penya (`"<bank>"`): the coin, `CWndGold`. */
export const BANK_DRAG = 'application/x-flyff-bank';
export const BANK_PENYA_DRAG = 'application/x-flyff-bank-penya';

/** The three tab controls' ids (the third is named `_3` in the original). */
const GRIDS = ['WIDC_BANK_0', 'WIDC_BANK_1', 'WIDC_BANK_3'] as const;

/** APP_COMMON_BANK (resdata.inc:10679-10798). The covers are last: drawn over the bank they cover. */
export const BANK: ResLayout = {
  title: 'Bank', width: 528, height: 256, texture: 'WndCommonBank.tga',
  controls: [
    { kind: 'custom', id: 'WIDC_BANK_0', rect: [12, 10, 172, 190] },
    { kind: 'custom', id: 'WIDC_BANK_1', rect: [184, 10, 344, 190] },
    { kind: 'custom', id: 'WIDC_BANK_3', rect: [354, 10, 514, 190] },
    { kind: 'static', id: 'WIDC_BANKGOLD_0', rect: [70, 198, 152, 214], text: '0' },
    { kind: 'static', id: 'WIDC_BANKGOLD_1', rect: [240, 198, 324, 214], text: '0' },
    { kind: 'static', id: 'WIDC_BANKGOLD_2', rect: [410, 198, 492, 214], text: '0' },
    { kind: 'custom', id: 'WIDC_BANKGO_0', rect: [42, 196, 63, 217] },
    { kind: 'custom', id: 'WIDC_BANKGO_1', rect: [212, 196, 233, 217] },
    { kind: 'custom', id: 'WIDC_BANKGO_2', rect: [382, 196, 403, 217] },
    { kind: 'custom', id: 'WIDC_CUSTOM4', rect: [12, 2, 156, 216] },
    { kind: 'custom', id: 'WIDC_CUSTOM5', rect: [184, 2, 328, 216] },
    { kind: 'custom', id: 'WIDC_CUSTOM6', rect: [352, 2, 496, 216] },
  ],
};

/** APP_CONFIRM_BANK (resdata.inc:28095-28160). */
export const CONFIRM_BANK: ResLayout = {
  title: 'Bank Password', width: 272, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [36, 12, 228, 36], text: 'Enter Bank PIN' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [28, 48, 96, 68], text: 'PIN' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [100, 48, 232, 68], tile: EDIT, maxLength: 4 },
    button('WIDC_OK', [8, 92, 80, 112], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [92, 92, 164, 112], 'ButtCancel.tga', 'Cancel'),
    button('WIDC_CHANGE_PASS', [180, 92, 252, 112], 'ButtChange.bmp', 'Change PIN'),
  ],
};

/** APP_BANK_PASSWORD (resdata.inc:26835-26927). EDIT1 is 4 px wider than the other two in the original. */
export const BANK_PASSWORD: ResLayout = {
  title: 'Bank PIN:', width: 272, height: 208,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [56, 10, 224, 30], text: 'Set/Change Bank PIN' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [16, 44, 108, 64], text: 'Old PIN:' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [114, 44, 246, 64], tile: EDIT, maxLength: 4 },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [16, 72, 106, 92], text: 'New PIN' },
    { kind: 'edit', id: 'WIDC_EDIT2', rect: [114, 72, 242, 92], tile: EDIT, maxLength: 4 },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [16, 100, 104, 120], text: 'Confirm PIN' },
    { kind: 'edit', id: 'WIDC_EDIT3', rect: [114, 100, 242, 120], tile: EDIT, maxLength: 4 },
    button('WIDC_OK', [48, 136, 120, 156], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [144, 136, 216, 156], 'ButtCancel.tga', 'Cancel'),
  ],
};

/** The grid inside its tab control: 4 px in, 4 columns x 5 rows of 32 px shown, the scroll bar after them, the tab strip under. */
const CELL = 32;
const COLUMNS = 4;
const ROWS = 5;
const GRID_LEFT = 4;
const PAGE_HEIGHT = 162;
const TAB_WIDTH = 160;
const TAB_TOP = 160;
/** The cover's alpha, 50 of 255 (`WndBank.cpp:26-45`). */
const COVER_ALPHA = 50 / 255;

/** What a bank's grid shows. */
export interface BankView {
  usable: boolean[];
  /** Each bank's filled items, packed in position order (`BankBook.packed`). */
  items: InventoryItem[][];
  gold: number[];
  prop(itemId: number): WebItemProp | undefined;
}

/** What a drop on a bank's grid carries. */
export type BankDrop =
  | { kind: 'bagItem'; objectId: number }
  | { kind: 'bagPenya' }
  | { kind: 'bankItem'; from: number; objectId: number }
  | { kind: 'bankPenya'; from: number };

/** A password field: shown as dots (`EBS_PASSWORD`), the phone's number keyboard, 4 digits (the port's cap). */
function pinField(input: HTMLInputElement, label: string): void {
  input.type = 'password';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.enterKeyHint = 'done';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', label);
}

/** CWndBank with its three CWndItemCtrl. */
export class BankWindow {
  readonly window: ResWindow;
  /** A drop on bank `bank`'s grid (`CWndBank::OnChildNotify`'s WIN_ITEMDROP, WndBank.cpp:185-389). */
  onDrop: (bank: number, what: BankDrop) => void = () => {};
  /** The phone's tap on a bank's item (take it out) or on a bank's penya. */
  onTapItem: (bank: number, objectId: number) => void = () => {};
  onTapPenya: (bank: number) => void = () => {};
  /** A slot hovered (or tapped on the desktop): its tooltip, null to hide it. */
  onHover: (bank: number, objectId: number | null, anchor: HTMLElement | null) => void = () => {};
  readonly phone: boolean;
  private readonly grids: HTMLElement[] = [];
  private readonly scrolls: Array<{ draw(): void }> = [];
  private readonly covers: HTMLElement[] = [];
  private readonly coins: HTMLElement[] = [];
  private readonly phoneTabs: HTMLElement;
  /** The bank the phone shows. */
  private shown = 0;
  private usable: boolean[] = [true, false, false];

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(BANK, art, doc);
    window.frame.element.classList.add('hud-bank');
    this.phone = isPhone(doc);
    for (let bank = 0; bank < BANK_COUNT; bank++) {
      const area = window.control(GRIDS[bank]!);
      area.classList.add('hud-bank-tab');
      area.dataset.bank = String(bank);
      const grid = doc.createElement('div');
      grid.className = 'hud-bank-grid';
      grid.dataset.bank = String(bank);
      grid.setAttribute('role', 'list');
      grid.setAttribute('aria-label', `Bank ${bank + 1}`);
      place(grid, { left: GRID_LEFT, top: 0, width: COLUMNS * CELL, height: ROWS * CELL });
      const scroll = textScrollBar(doc, art, grid, { left: 0, top: 0, width: GRID_LEFT + 137 + 16, height: PAGE_HEIGHT });
      scroll.element.classList.add('hud-bank-scroll');
      const strip = tabStrip(doc, art, TAB_WIDTH, ['Item'], 0);
      place(strip, { left: 0, top: TAB_TOP, width: TAB_WIDTH, height: 20 });
      area.append(grid, scroll.element, strip);
      this.grids.push(grid);
      this.scrolls.push(scroll);
      this.acceptDrops(area, bank);

      const gold = window.control(`WIDC_BANKGOLD_${bank}`).parentElement!;
      gold.dataset.bankGold = String(bank);
      gold.addEventListener('click', () => { if (this.phone && this.usable[bank] === true) this.onTapPenya(bank); });
      const coin = window.control(`WIDC_BANKGO_${bank}`);
      coin.classList.add('hud-bank-coin');
      coin.dataset.bankCoin = String(bank);
      coin.setAttribute('aria-label', `Penya of bank ${bank + 1}`);
      coin.draggable = !this.phone;
      coin.addEventListener('dragstart', (event) => {
        if (this.usable[bank] !== true) { event.preventDefault(); return; }
        event.dataTransfer?.setData(BANK_PENYA_DRAG, String(bank));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      coin.addEventListener('click', () => { if (this.phone && this.usable[bank] === true) this.onTapPenya(bank); });
      this.coins.push(coin);

      const cover = window.control(`WIDC_CUSTOM${4 + bank}`);
      cover.classList.add('hud-bank-cover');
      cover.style.backgroundImage = themeUrl(art, 'WndCommonBankNotUse.tga');
      cover.style.opacity = String(COVER_ALPHA);
      this.covers.push(cover);
    }
    // the phone's choice of the bank it shows (one panel at a time beside the bag)
    this.phoneTabs = doc.createElement('div');
    this.phoneTabs.className = 'hud-bank-phone-tabs';
    this.phoneTabs.setAttribute('role', 'tablist');
    for (let bank = 0; bank < BANK_COUNT; bank++) {
      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.dataset.bankTab = String(bank);
      tab.setAttribute('role', 'tab');
      tab.textContent = `Bank ${bank + 1}`;
      tab.addEventListener('click', () => this.show(bank));
      this.phoneTabs.append(tab);
    }
    window.frame.body.prepend(this.phoneTabs);
    this.window = window;
    this.show(0);
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  /** The phone's shown bank (the own one when the bank opens). */
  show(bank: number): void {
    this.shown = bank;
    this.window.frame.element.dataset.shownBank = String(bank);
    for (const tab of this.phoneTabs.children) tab.setAttribute('aria-selected', String((tab as HTMLElement).dataset.bankTab === String(bank)));
  }

  /** A bank's grid takes a bag item, the bag's penya, another bank's item or penya; a disabled bank takes nothing. */
  private acceptDrops(area: HTMLElement, bank: number): void {
    const types = [BAG_DRAG, PENYA_DRAG, BANK_DRAG, BANK_PENYA_DRAG];
    area.addEventListener('dragover', (event) => {
      if (this.usable[bank] !== true) return;
      if ((event.dataTransfer?.types ?? []).some((type) => types.includes(type))) event.preventDefault();
    });
    area.addEventListener('drop', (event) => {
      const data = event.dataTransfer;
      if (data === null || this.usable[bank] !== true) return;
      if (data.types.includes(BAG_DRAG)) {
        event.preventDefault();
        this.onDrop(bank, { kind: 'bagItem', objectId: Number(data.getData(BAG_DRAG)) });
      } else if (data.types.includes(PENYA_DRAG)) {
        event.preventDefault();
        this.onDrop(bank, { kind: 'bagPenya' });
      } else if (data.types.includes(BANK_DRAG)) {
        event.preventDefault();
        const [from, objectId] = data.getData(BANK_DRAG).split(':').map(Number);
        this.onDrop(bank, { kind: 'bankItem', from: from ?? -1, objectId: objectId ?? -1 });
      } else if (data.types.includes(BANK_PENYA_DRAG)) {
        event.preventDefault();
        this.onDrop(bank, { kind: 'bankPenya', from: Number(data.getData(BANK_PENYA_DRAG)) });
      }
    });
  }

  /** `CWndBank::OnDraw` and its item controls: each bank's items packed, its penya, its cover when not usable. */
  draw(view: BankView): void {
    this.usable = [...view.usable];
    for (let bank = 0; bank < BANK_COUNT; bank++) {
      const usable = view.usable[bank] === true;
      this.window.setText(`WIDC_BANKGOLD_${bank}`, String(view.gold[bank] ?? 0));
      this.covers[bank]!.hidden = usable;
      this.coins[bank]!.dataset.usable = String(usable);
      const grid = this.grids[bank]!;
      grid.dataset.usable = String(usable);
      grid.closest<HTMLElement>('.hud-bank-tab')!.dataset.usable = String(usable);
      this.fill(grid, bank, view.items[bank] ?? [], usable, view.prop);
      this.scrolls[bank]!.draw();
    }
  }

  private fill(grid: HTMLElement, bank: number, items: InventoryItem[], usable: boolean, prop: BankView['prop']): void {
    const top = grid.scrollTop;
    // the 42 slots, the filled ones first (packed): an empty cell is still a place to drop on
    const cells = Array.from({ length: 42 }, (_, i) => {
      const cell = this.doc.createElement('div');
      cell.className = 'hud-bank-cell';
      cell.setAttribute('role', 'listitem');
      const item = items[i];
      if (item === undefined) return cell;
      const itemProp = prop(item.itemId);
      cell.dataset.objectId = String(item.objectId);
      cell.dataset.itemId = String(item.itemId);
      cell.setAttribute('aria-label', `${itemProp?.name ?? `Item ${item.itemId}`} ×${item.count}`);
      const icon = itemIconOf(item, itemProp);
      if (icon !== null) {
        const img = this.doc.createElement('img');
        img.src = this.art.url(icon);
        img.alt = '';
        cell.append(img);
        // an expired item tinted ARGB( a, 255, 100, 100 ) (WndItemCtrl.cpp:345-361)
        if (((item.flag ?? 0) & 0x01) !== 0) {
          const tint = this.doc.createElement('i');
          tint.className = 'hud-trade-expired';
          const url = `url(${JSON.stringify(this.art.url(icon))})`;
          tint.style.setProperty('-webkit-mask-image', url);
          tint.style.setProperty('mask-image', url);
          cell.append(tint);
        }
      }
      // a stack's count at the bottom right (`dwPackMax > 1`, :704-716)
      if ((itemProp?.packMax ?? 1) > 1) {
        const count = this.doc.createElement('span');
        count.textContent = String(item.count);
        cell.append(count);
      }
      cell.draggable = usable && !this.phone;
      cell.addEventListener('dragstart', (event) => {
        if (!usable) { event.preventDefault(); return; }
        this.onHover(bank, null, null);
        event.dataTransfer?.setData(BANK_DRAG, `${bank}:${item.objectId}`);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('mouseenter', () => { if (!this.phone) this.onHover(bank, item.objectId, cell); });
      cell.addEventListener('mouseleave', () => this.onHover(bank, null, null));
      cell.addEventListener('click', () => {
        if (this.phone) { if (usable) this.onTapItem(bank, item.objectId); }
        else this.onHover(bank, item.objectId, cell);
      });
      return cell;
    });
    grid.replaceChildren(...cells);
    grid.scrollTop = top;
  }
}

/** CWndConfirmBank: the PIN, OK, Cancel, Change PIN. */
export class ConfirmBankWindow {
  readonly window: ResWindow;
  onOk: (pin: string) => void = () => {};
  onChange: () => void = () => {};
  private readonly input: HTMLInputElement;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(CONFIRM_BANK, art, doc);
    window.frame.element.classList.add('hud-bank-pin');
    const input = window.input('WIDC_EDIT1');
    pinField(input, 'Bank PIN');
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.onOk(input.value); }
    });
    window.button('WIDC_OK').addEventListener('click', () => this.onOk(input.value));
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    window.button('WIDC_CHANGE_PASS').addEventListener('click', () => this.onChange());
    this.input = input;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** Opened centred, the field empty and focused (`OnInitialUpdate`, WndBank.cpp:425-442). */
  open(): void {
    this.input.value = '';
    this.window.open();
    this.input.focus();
  }

  /** The field cleared (a PIN not of 4 digits, :496-505). */
  clear(): void {
    this.input.value = '';
  }

  close(): void {
    this.window.close();
  }
}

/** CWndBankPassword: Old, New and Confirm PIN, in mode 0 (the first time: Old is "0000") or 1 (a change). */
export class BankPasswordWindow {
  readonly window: ResWindow;
  onOk: (old: string, fresh: string, confirm: string) => void = () => {};
  private readonly inputs: [HTMLInputElement, HTMLInputElement, HTMLInputElement];
  mode = 1;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(BANK_PASSWORD, art, doc);
    window.frame.element.classList.add('hud-bank-pin', 'hud-bank-password');
    this.inputs = [window.input('WIDC_EDIT1'), window.input('WIDC_EDIT2'), window.input('WIDC_EDIT3')];
    const labels = ['Old PIN', 'New PIN', 'Confirm PIN'];
    this.inputs.forEach((input, i) => {
      pinField(input, labels[i]!);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); this.submit(); }
      });
    });
    window.button('WIDC_OK').addEventListener('click', () => this.submit());
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** Mode 0: Old filled with "0000", the focus on New; mode 1: all empty, the focus on Old (WndBank.cpp:563-571). */
  open(mode: number): void {
    this.mode = mode;
    this.reset();
    this.window.open();
    this.inputs[mode === 0 ? 1 : 0].focus();
  }

  /** Old back to its start, New and Confirm cleared (`TID_DIAG_0025`'s reset, :630-645). */
  reset(): void {
    this.inputs[0].value = this.mode === 0 ? '0000' : '';
    this.clearNew();
  }

  /** New and Confirm cleared, Old kept (`TID_DIAG_0022`, :646-656). */
  clearNew(): void {
    this.inputs[1].value = '';
    this.inputs[2].value = '';
  }

  close(): void {
    this.window.close();
  }

  private submit(): void {
    this.onOk(this.inputs[0].value, this.inputs[1].value, this.inputs[2].value);
  }
}
