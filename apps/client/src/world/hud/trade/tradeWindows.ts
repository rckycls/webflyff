// The player trade's windows (2026-11-10, docs/superpowers/specs/2026-11-10-trade-research.md §2-§5), each laid out from its
// resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndTrade         APP_TRADE 1009          resdata.inc:21942-22004   "WndTrade.tga" (one picture), 352 x 288, "Trade": the
//                                                                       names, the penya, OK (theirs), Cancel, OK (mine); the
//                                                                       two 5 x 5 grids made in code (WndField.cpp:9007-9008)
//   CWndTradeCtrl     10001 / 10002           _Interface/WndTradeCtrl.cpp:48-174  25 slots of 32 px, 3 px in; the count of a
//                                                                       stack in blue at the bottom right; a drop on mine
//   CWndConfirmTrade  APP_CONFIRM_TRADE 259   resdata.inc:28047-28084   "WndTile06.tga", 272 x 160, "Trade": "%s wants to
//                                                                       trade.", "Would you like to trade?", OK, Cancel
//   CWndTradeConfirm  APP_TRADE_CONFIRM 292   resdata.inc:2024-2054     "WndTile08.tga", 288 x 128, "Confirm Trade": the
//                                                                       question, Yes, No
//   CWndTradeGold     APP_TRADE_GOLD 116      resdata.inc:11228-11278   "WndTile09.tga", 240 x 128, WBS_MODAL: the question,
//                                                                       "Penya:" or "Number:", the edit, OK, Cancel
//
// The windows draw and report presses; tradeHud.ts holds the rules and sends the packets.

import type { InventoryItem } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import { itemIconOf } from '../../pets/petStatus';

const EDIT = 'WndEditTile00.tga';
const ok = (id: string, rect: ResControl['rect'], label = 'OK'): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtOk.tga', label, quarter: 72 });
const cancel = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 });

/** The grids' places: CRect( 5, 25 + 15, 5 + 32 * 5 + 5, 25 + 32 * 5 + 5 + 15 ) and the same at 175 (WndField.cpp:9007-9008). */
const GRID_YOU: ResControl['rect'] = [5, 40, 170, 205];
const GRID_I: ResControl['rect'] = [175, 40, 340, 205];

/** APP_TRADE (resdata.inc:21942-22004). WIDC_CLEAR is hidden in V15 (`__CSC_VER11_1`, WndField.cpp:9031-9038). */
export const TRADE: ResLayout = {
  title: 'Trade', width: 352, height: 288, texture: 'WndTrade.tga',
  controls: [
    { kind: 'custom', id: 'GRID_YOU', rect: GRID_YOU },
    { kind: 'custom', id: 'GRID_I', rect: GRID_I },
    ok('WIDC_OK_YOU', [20, 232, 92, 252], 'Their OK'),
    ok('WIDC_OK_I', [248, 232, 320, 252]),
    cancel('WIDC_CANCEL', [136, 232, 208, 252]),
    { kind: 'static', id: 'WIDC_STATIC1', rect: [10, 10, 114, 30] },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [228, 10, 328, 30] },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [64, 208, 162, 228] },
    { kind: 'button', id: 'WIDC_CLEAR', rect: [308, 208, 335, 228], picture: 'ButtClearGold.tga', label: 'Clear penya', quarter: 27 },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [230, 208, 328, 228] },
  ],
};

/** APP_CONFIRM_TRADE (resdata.inc:28047-28084): WIDC_STATIC2 gets `TID_GAME_FROM` with the name (OnSetName). */
export const CONFIRM_TRADE: ResLayout = {
  title: 'Trade', width: 272, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [22, 56, 244, 76], text: 'Would you like to trade?' },
    ok('WIDC_OK', [40, 92, 112, 112]),
    cancel('WIDC_CANCEL', [136, 92, 208, 112]),
    { kind: 'static', id: 'WIDC_STATIC2', rect: [22, 24, 244, 44] },
  ],
};

/** APP_TRADE_CONFIRM (resdata.inc:2024-2054): WIDC_STATIC1 gets `TID_DIAG_0083` (OnInitialUpdate, WndField.cpp:8890-8906). */
export const TRADE_CONFIRM: ResLayout = {
  title: 'Confirm Trade', width: 288, height: 128,
  controls: [
    { kind: 'button', id: 'WIDC_YES', rect: [56, 70, 128, 90], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [142, 70, 214, 90], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
    { kind: 'text', id: 'WIDC_STATIC1', rect: [34, 8, 240, 62] },
  ],
};

/** APP_TRADE_GOLD (resdata.inc:11228-11278), WBS_MODAL (`CWndTradeGold::Initialize`, WndField.cpp:8475-8478). */
export const TRADE_GOLD: ResLayout = {
  title: 'Move Items', width: 240, height: 128, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC', rect: [36, 12, 192, 29] },
    { kind: 'edit', id: 'WIDC_EDIT', rect: [100, 36, 196, 56], tile: EDIT, maxLength: 10 },
    ok('WIDC_OK', [40, 68, 112, 88]),
    cancel('WIDC_CANCEL', [124, 68, 196, 88]),
    { kind: 'static', id: 'WIDC_CONTROL1', rect: [24, 36, 92, 52] },
  ],
};

/** `MAX_TRADE`, 5 a row, 32 px apart, 3 px inside the grid (`SetWndRect`'s `DeflateRect( 3, 3 )`). */
const SLOTS = 25;
const CELL = 32;
const INSET = 3;

/** The drag types the own grid takes: a bag item (inventoryWindow.ts) and the bag's penya (`CWndGold`). */
export const BAG_DRAG = 'application/x-flyff-inventory';
export const PENYA_DRAG = 'application/x-flyff-penya';

/** What a trade slot shows: its item, its catalog row, the count traded. */
export interface TradeCell {
  item: InventoryItem;
  prop: WebItemProp | undefined;
  count: number;
}

/** CWndTrade with its two CWndTradeCtrl. */
export class TradeWindow {
  readonly window: ResWindow;
  /** A bag item or the penya dropped on the own grid's `slot`. */
  onDrop: (slot: number, what: { objectId: number } | { gold: true }) => void = () => {};
  onOk: () => void = () => {};
  onCancel: () => void = () => {};
  /** A slot pressed or hovered: its tooltip (null to hide it). */
  onHover: (side: 'mine' | 'theirs', slot: number, anchor: HTMLElement | null) => void = () => {};
  private readonly cells: Record<'mine' | 'theirs', HTMLElement[]>;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(TRADE, art, doc);
    window.frame.element.classList.add('hud-trade');
    window.button('WIDC_CLEAR').hidden = true;
    window.button('WIDC_OK_I').addEventListener('click', () => this.onOk());
    window.button('WIDC_CANCEL').addEventListener('click', () => this.onCancel());
    for (const [id, side] of [['WIDC_STATIC1', 'their-name'], ['WIDC_STATIC2', 'my-name'], ['WIDC_STATIC3', 'their-penya'],
      ['WIDC_STATIC4', 'my-penya']] as const) {
      // on the static's box: the phone lays the boxes out (style.css)
      window.control(id).parentElement!.dataset.trade = side;
    }
    this.cells = { theirs: this.grid(window.control('GRID_YOU'), 'theirs'), mine: this.grid(window.control('GRID_I'), 'mine') };
    const mine = window.control('GRID_I');
    mine.addEventListener('dragover', (event) => {
      const types = event.dataTransfer?.types ?? [];
      if (types.includes(BAG_DRAG) || types.includes(PENYA_DRAG)) event.preventDefault();
    });
    mine.addEventListener('drop', (event) => {
      const cell = (event.target as Element | null)?.closest?.<HTMLElement>('[data-trade-slot]');
      const data = event.dataTransfer;
      if (cell === null || cell === undefined || data === null) return;
      event.preventDefault();
      const slot = Number(cell.dataset.tradeSlot);
      if (data.types.includes(PENYA_DRAG)) this.onDrop(slot, { gold: true });
      else if (data.types.includes(BAG_DRAG)) this.onDrop(slot, { objectId: Number(data.getData(BAG_DRAG)) });
    });
    this.window = window;
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  /** The 25 slots of a grid, at `x * 32, y * 32` inside its 3 px border (`CWndTradeCtrl::OnDraw`). */
  private grid(area: HTMLElement, side: 'mine' | 'theirs'): HTMLElement[] {
    area.classList.add('hud-trade-grid');
    area.dataset.side = side;
    area.setAttribute('aria-label', side === 'mine' ? 'Your trade items' : 'Their trade items');
    const cells: HTMLElement[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const cell = this.doc.createElement('div');
      cell.className = 'hud-trade-cell';
      cell.dataset.tradeSlot = String(i);
      cell.style.left = `${INSET + (i % 5) * CELL}px`;
      cell.style.top = `${INSET + Math.trunc(i / 5) * CELL}px`;
      cell.addEventListener('mouseenter', () => { if (cell.dataset.filled !== undefined) this.onHover(side, i, cell); });
      cell.addEventListener('mouseleave', () => this.onHover(side, i, null));
      cell.addEventListener('click', () => { if (cell.dataset.filled !== undefined) this.onHover(side, i, cell); });
      area.append(cell);
      cells.push(cell);
    }
    return cells;
  }

  /** The names, the penya, the OKs and the slots (`CWndTrade::OnDraw`, :8964-9003). */
  draw(state: {
    theirName: string; myName: string; theirGold: string; myGold: string; theirOk: boolean; myOk: boolean;
    mine: ReadonlyArray<TradeCell | null>; theirs: ReadonlyArray<TradeCell | null>;
  }): void {
    const w = this.window;
    w.setText('WIDC_STATIC1', state.theirName);
    w.setText('WIDC_STATIC2', state.myName);
    w.setText('WIDC_STATIC3', state.theirGold);
    w.setText('WIDC_STATIC4', state.myGold);
    // an OK pressed is checked and disabled, which draws its fourth state (`RenderWndButton_4Texture`, ITheme.cpp:1352)
    w.button('WIDC_OK_YOU').disabled = state.theirOk;
    w.button('WIDC_OK_I').disabled = state.myOk;
    w.button('WIDC_OK_YOU').dataset.checked = String(state.theirOk);
    w.button('WIDC_OK_I').dataset.checked = String(state.myOk);
    this.fill(this.cells.theirs, state.theirs);
    this.fill(this.cells.mine, state.mine);
  }

  private fill(cells: HTMLElement[], slots: ReadonlyArray<TradeCell | null>): void {
    cells.forEach((cell, i) => {
      const slot = slots[i] ?? null;
      cell.replaceChildren();
      if (slot === null) {
        delete cell.dataset.filled;
        cell.removeAttribute('aria-label');
        return;
      }
      cell.dataset.filled = '';
      const name = slot.prop?.name ?? `Item ${slot.item.itemId}`;
      cell.setAttribute('aria-label', `${name} ×${slot.count}`);
      const icon = itemIconOf(slot.item, slot.prop);
      if (icon !== null) {
        const img = this.doc.createElement('img');
        img.src = this.art.url(icon);
        img.alt = '';
        cell.append(img);
        // an expired item tinted ARGB( 255, 255, 100, 100 ) (Render2, WndTradeCtrl.cpp:63-64): a red multiplied in its shape
        if (((slot.item.flag ?? 0) & 0x01) !== 0) {
          const tint = this.doc.createElement('i');
          tint.className = 'hud-trade-expired';
          const url = `url(${JSON.stringify(this.art.url(icon))})`;
          tint.style.setProperty('-webkit-mask-image', url);
          tint.style.setProperty('mask-image', url);
          cell.append(tint);
        }
      }
      // a stack's count, the traded one (`IsUsingItem` ? GetExtra() : m_nItemNum), blue 0xff1010ff (:79-92)
      if ((slot.prop?.packMax ?? 1) > 1) {
        const count = this.doc.createElement('span');
        count.textContent = String(slot.count);
        cell.append(count);
      }
    });
  }

  /** While the final box is open the window takes no press, its close box neither (OnChildNotify, :9061-9065). */
  setLocked(locked: boolean): void {
    this.frame.element.classList.toggle('is-locked', locked);
    this.frame.escapeCloses = !locked;
    const close = this.frame.element.querySelector<HTMLButtonElement>('.hud-window-close');
    if (close !== null) close.disabled = locked;
  }
}

/** CWndConfirmTrade: the asked side's window. */
export class ConfirmTradeWindow {
  readonly window: ResWindow;
  onOk: () => void = () => {};
  /** Cancel, or the close box (`WTBID_CLOSE`), or Escape. */
  onCancel: () => void = () => {};
  private answered = false;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(CONFIRM_TRADE, art, doc);
    window.frame.element.classList.add('hud-trade-request');
    window.button('WIDC_OK').addEventListener('click', () => { this.answered = true; this.onOk(); window.close(); });
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    window.onClose = () => {
      if (!this.answered) this.onCancel();
      this.answered = false;
    };
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `OnSetName` (:8811-8819), then centred across, 70 px from the top (`OnInitialUpdate`, :8823-8831). */
  open(line: string): void {
    this.window.setText('WIDC_STATIC2', line);
    const layer = this.window.frame.element.parentElement;
    this.window.open({ x: Math.trunc(((layer?.clientWidth ?? 0) - CONFIRM_TRADE.width) / 2), y: 70 });
  }

  /** Closed by the game (the partner's window opened, the world left): no answer sent. */
  dismiss(): void {
    this.answered = true;
    this.window.close();
  }
}

/** CWndTradeConfirm: the final box. */
export class TradeConfirmWindow {
  readonly window: ResWindow;
  onYes: () => void = () => {};
  onNo: () => void = () => {};
  /** The close box: TRADECANCEL, and the box goes (CWndNeuz closes on WTBID_CLOSE). */
  onClosed: () => void = () => {};
  private quiet = false;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(TRADE_CONFIRM, art, doc);
    window.frame.element.classList.add('hud-trade-confirm');
    window.button('WIDC_YES').addEventListener('click', () => this.onYes());
    window.button('WIDC_NO').addEventListener('click', () => this.onNo());
    window.onClose = () => {
      if (!this.quiet) this.onClosed();
      this.quiet = false;
    };
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** Yes and No shown, the question (OnInitialUpdate, :8890-8906), centred (`MoveParentCenter`). */
  open(question: string): void {
    this.setWaiting(false, question);
    this.window.open();
  }

  /** `bMsg`: the box says `text`, its buttons hidden, and takes no press, its close box neither (:2765-2784, :8930-8933). */
  setWaiting(waiting: boolean, text: string): void {
    this.window.setText('WIDC_STATIC1', text);
    this.window.button('WIDC_YES').hidden = waiting;
    this.window.button('WIDC_NO').hidden = waiting;
    this.window.frame.escapeCloses = !waiting;
    const close = this.window.frame.element.querySelector<HTMLButtonElement>('.hud-window-close');
    if (close !== null) close.disabled = waiting;
  }

  /** Closed by the game (TRADECANCEL, TRADECONSENT, the partner gone). */
  dismiss(): void {
    if (!this.window.isOpen) return;
    this.quiet = true;
    this.window.close();
  }
}

/** CWndTradeGold: the count of a stack, or the penya. */
export class TradeGoldWindow {
  readonly window: ResWindow;
  /** OK or Enter, with the field's text. */
  onOk: (text: string) => void = () => {};
  private readonly input: HTMLInputElement;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(TRADE_GOLD, art, doc);
    window.frame.element.classList.add('hud-trade-gold');
    const input = window.input('WIDC_EDIT');
    // the phone's number keyboard; Enter is EN_RETURN
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', 'Amount');
    // the box is modal: its backdrop holds every keydown (modal.ts `holdKey`), so Enter is heard as its keypress too
    for (const type of ['keydown', 'keypress'] as const) {
      input.addEventListener(type, (event) => {
        if (event.key === 'Enter') { event.preventDefault(); this.submit(); }
      });
    }
    window.button('WIDC_OK').addEventListener('click', () => this.submit());
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    this.input = input;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /**
   * Titled "Penya" or "Item" with its two lines (WndField.cpp:9087-9116), the field preset to `preset` and focused, OK the
   * default (`OnInitialUpdate`, :8459-8473); centred (`MoveParentCenter`).
   */
  open(title: string, question: string, label: string, preset: number): void {
    this.window.frame.setTitle(title);
    this.window.setText('WIDC_STATIC', question);
    this.window.setText('WIDC_CONTROL1', label);
    this.input.value = String(Math.min(preset, 0x7fffffff));
    this.window.open();
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this.window.close();
  }

  /** OK first, then the box goes (its close forgets what it was for). */
  private submit(): void {
    if (!this.window.isOpen) return;
    this.onOk(this.input.value);
    this.window.close();
  }
}
