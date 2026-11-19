// The NPC shop's buy and sell boxes of a drag (2026-11-20, mouse-drag-ui), desktop only (the phone keeps the shop's
// select + Buy/Sell buttons):
//
//   CWndInventory::OnChildNotify    _Interface/WndField.cpp:1757-1807  a shop item dragged into the bag: enough penya (or
//                                                                     Red Chips) for one, else a box; then CWndConfirmBuy
//   CWndConfirmBuy                  _Interface/WndShop.cpp:259-656     APP_CONFIRM_BUY_ = APP_CONFIRM_BUYEX
//                                                                     (resdata.inc:3113): the count from 1, + - Max, the cost
//                                                                     of them all; OK checks, then SendBuyItem
//   CWndShop::OnChildNotify         WndShop.cpp:847-925                a bag item dropped on the shop: a quest item refused, a
//                                                                     worn one says TID_GAME_EQUIPTRADE, a charged one warns
//                                                                     first (CWndWarning), else CWndConfirmSell
//   CWndWarning                     WndShop.cpp:25-62                  APP_WARNING (resdata.inc:25770): OK opens the sell box
//   CWndConfirmSell                 WndShop.cpp:66-256                 APP_CONFIRM_SELL (resdata.inc:11153): the count box
//                                                                     filled with the whole stack, the sale price of them all;
//                                                                     OK sells; it goes once the item is in use (Process)

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { keptCount } from './dropWindows';
import { ResWindow } from './resWindow';
import type { ResControl, ResLayout } from './resWindow';

const EDIT = 'WndEditTile00.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });

/** APP_CONFIRM_BUYEX "WndTile03.tga" 272 x 176 (resdata.inc:3113-3212); texts IDS_RESDATA_INC_000368-000389. */
export const CONFIRM_BUY: ResLayout = {
  title: 'Purchase Confirmation', width: 272, height: 176,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC', rect: [50, 12, 210, 30], text: 'Do you want to buy?' },
    { kind: 'edit', id: 'WIDC_CONTROL2', rect: [90, 42, 188, 60], tile: EDIT, maxLength: 5 },
    { kind: 'static', id: 'WIDC_CONTROL1', rect: [26, 40, 82, 58], text: 'Qty' },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [26, 64, 82, 84], text: 'Cost' },
    button('WIDC_OK', [44, 108, 116, 128], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [148, 108, 220, 128], 'ButtCancel.tga', 'Cancel'),
    // ButItemPlus/Minus.BMP are 56 x 16 (four states of 14), ButItemMax.BMP 128 x 16
    button('WIDC_PLUS', [198, 44, 214, 60], 'ButItemPlus.BMP', 'One more', 14),
    button('WIDC_MINUS', [216, 44, 232, 60], 'ButItemMinus.BMP', 'One less', 14),
    button('WIDC_MAX', [198, 64, 230, 80], 'ButItemMax.BMP', 'Max', 32),
    { kind: 'static', id: 'WIDC_STATIC2', rect: [92, 68, 192, 84] },
  ],
};

/** APP_CONFIRM_SELL "WndTile02.tga" 272 x 176 (resdata.inc:11153-11227); texts IDS_RESDATA_INC_001092-001107. */
export const CONFIRM_SELL: ResLayout = {
  title: 'Selling Confirm', width: 272, height: 176,
  controls: [
    button('WIDC_OK', [40, 104, 112, 124], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [132, 104, 204, 124], 'ButtCancel.tga', 'Cancel'),
    { kind: 'static', id: 'WIDC_STATIC', rect: [44, 12, 188, 28], text: 'Really sell this item?' },
    { kind: 'static', id: 'WIDC_CONTROL1', rect: [8, 40, 52, 60], text: 'Quantity' },
    { kind: 'edit', id: 'WIDC_EDITSELL', rect: [80, 40, 224, 60], tile: EDIT, maxLength: 10 },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 68, 72, 88], text: 'Selling Price:' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [80, 68, 204, 88] },
  ],
};

/** APP_WARNING "WndTile02.tga" 320 x 144 (resdata.inc:25770-25810); texts IDS_RESDATA_INC_003478-003487. */
export const SELL_WARNING: ResLayout = {
  title: 'Confirm Selling Premium Item', width: 320, height: 144,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [24, 18, 296, 38], text: 'This is a Premium Item. Are you sure?' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [24, 40, 294, 56], text: 'Once it is sold, it cannot be recovered.' },
    button('WIDC_OK', [72, 70, 144, 90], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [166, 70, 238, 90], 'ButtCancel.tga', 'Cancel'),
  ],
};

/** `IK3_BCHARM`, `IK3_RCHARM`, `IK3_ARROW` (Resource/defineItemkind.h:134-136); II_SYS_SYS_SCR_PERIN, II_CHP_RED (defineItem.h). */
const IK3_BCHARM = 55, IK3_RCHARM = 56, IK3_ARROW = 60;
const II_SYS_SYS_SCR_PERIN = 26456, II_CHP_RED = 26460;
/** `MAX_BUY_ITEMCOUNT` (WndShop.cpp:436). */
const MAX_BUY = 99;
/** A buy's total is kept under `INT_MAX` (OnChangeBuyCount, WndShop.cpp:345-351). */
const INT_MAX = 0x7fffffff;

/**
 * The most one buy takes (`__MAX_BUY_ITEM9999`, WndShop.cpp:447-466, :481-500): 9999 for the charms, the arrows and the Red
 * Chip; 21 Perins; 99 else.
 */
export function buyMost(prop: Pick<WebItemProp, 'id' | 'kind3'> | undefined): number {
  if (prop === undefined) return MAX_BUY;
  if (prop.kind3 === IK3_BCHARM || prop.kind3 === IK3_RCHARM || prop.kind3 === IK3_ARROW || prop.id === II_CHP_RED) return 9999;
  if (prop.id === II_SYS_SYS_SCR_PERIN) return 21;
  return MAX_BUY;
}

/** `OnChangeBuyCount` (WndShop.cpp:299-369): the count, one less while the total passes INT_MAX, and that total. */
export function buyTotal(count: number, unit: number): { count: number; total: number } {
  let n = Math.max(0, Math.trunc(count));
  if (n * unit > INT_MAX) n -= 1;
  return { count: n, total: n * unit };
}

/** What the buy box asks the shop: the price of one now (0: gone), the shop's stock of it, and the buy. */
export interface BuyTarget {
  prop: WebItemProp | undefined;
  unit(): number;
  stock(): number;
  /** OK, with the count; its checks and boxes are the shop's (`OnOK`, WndShop.cpp:556-656). */
  ok(count: number): void;
}

/** What the sell box asks the shop: the bag item now (gone: undefined), whether it is in use, its sale price each, the sale. */
export interface SellTarget {
  item(): InventoryItem | undefined;
  inUse(): boolean;
  unit(): number;
  ok(count: number): void;
}

/** The three boxes; one is open at a time (`SAFE_DELETE` of the last one first). */
export class ShopConfirmWindows {
  readonly buy: ResWindow;
  readonly sell: ResWindow;
  readonly warning: ResWindow;
  private buying: BuyTarget | null = null;
  private selling: SellTarget | null = null;
  private stack = 0;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.buy = this.make(CONFIRM_BUY, 'hud-confirm-buy');
    this.sell = this.make(CONFIRM_SELL, 'hud-confirm-sell');
    this.warning = this.make(SELL_WARNING, 'hud-sell-warning');
    const count = this.buy.input('WIDC_CONTROL2');
    count.inputMode = 'numeric';
    count.setAttribute('aria-label', 'Buy quantity');
    // EN_CHANGE: atoi, at least 0, at most the most (WndShop.cpp:503-529)
    count.addEventListener('input', () => this.setBuyCount(Number.parseInt(count.value, 10) || 0, true));
    count.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.buyOk(); } });
    this.buy.button('WIDC_PLUS').addEventListener('click', () => this.setBuyCount(this.buyCount() + 1));
    this.buy.button('WIDC_MINUS').addEventListener('click', () => this.setBuyCount(Math.max(1, this.buyCount() - 1)));
    this.buy.button('WIDC_MAX').addEventListener('click', () => this.setBuyCount(buyMost(this.buying?.prop)));
    this.buy.button('WIDC_OK').addEventListener('click', () => this.buyOk());
    this.buy.button('WIDC_CANCEL').addEventListener('click', () => this.buy.close());
    const sold = this.sell.input('WIDC_EDITSELL');
    sold.inputMode = 'numeric';
    sold.setAttribute('aria-label', 'Sell quantity');
    sold.addEventListener('input', () => this.drawSell());
    sold.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.sellOk(); } });
    this.sell.button('WIDC_OK').addEventListener('click', () => this.sellOk());
    this.sell.button('WIDC_CANCEL').addEventListener('click', () => this.sell.close());
    this.warning.button('WIDC_OK').addEventListener('click', () => {
      const target = this.selling;
      this.warning.close();
      if (target !== null) this.showSell(target);
    });
    this.warning.button('WIDC_CANCEL').addEventListener('click', () => this.warning.close());
  }

  private make(layout: ResLayout, className: string): ResWindow {
    const box = new ResWindow(layout, this.art, this.doc);
    box.frame.element.classList.add('hud-shop-confirm', className);
    box.frame.element.setAttribute('role', 'dialog');
    return box;
  }

  private place(layer: Element): void {
    for (const box of [this.buy, this.sell, this.warning]) {
      if (box.element.parentElement !== layer) layer.append(box.element);
    }
  }

  /** A shop item dropped in the bag: the buy box, its count 1 (`Initialize`, WndShop.cpp:371-414), centred. */
  openBuy(target: BuyTarget, layer: Element): void {
    this.close();
    this.place(layer);
    this.buying = target;
    this.buy.open();
    this.setBuyCount(1);
    const input = this.buy.input('WIDC_CONTROL2');
    input.focus({ preventScroll: true });
    input.select();
  }

  /** A bag item dropped on the shop: the premium warning first when `charged`, else the sell box. */
  openSell(target: SellTarget, layer: Element, charged: boolean): void {
    this.close();
    this.place(layer);
    this.selling = target;
    if (charged) this.warning.open();
    else this.showSell(target);
  }

  private showSell(target: SellTarget): void {
    const item = target.item();
    if (item === undefined) return;
    this.selling = target;
    this.stack = item.count;
    const input = this.sell.input('WIDC_EDITSELL');
    input.value = String(item.count);
    this.sell.open();
    this.drawSell();
    input.focus({ preventScroll: true });
    input.select();
  }

  private buyCount(): number {
    return Number.parseInt(this.buy.input('WIDC_CONTROL2').value, 10) || 0;
  }

  /** `OnChangeBuyCount`: the edit (when it differs) and the total; `typed` keeps what the player typed when it is the same. */
  private setBuyCount(wanted: number, typed = false): void {
    const target = this.buying;
    if (target === null) return;
    const most = buyMost(target.prop);
    const { count, total } = buyTotal(Math.min(Math.max(0, wanted), most), target.unit());
    const input = this.buy.input('WIDC_CONTROL2');
    if (!typed || (Number.parseInt(input.value, 10) || 0) !== count) input.value = String(count);
    this.buy.setText('WIDC_STATIC2', total.toLocaleString('en-US'));
  }

  private buyOk(): void {
    if (!this.buy.isOpen) return;
    const target = this.buying, count = this.buyCount();
    this.buy.close();
    target?.ok(count);
  }

  /** `CWndConfirmSell::OnDraw` (WndShop.cpp:86-153): the count kept to the stack, and the price of them all. */
  private drawSell(): void {
    const target = this.selling;
    if (target === null) return;
    const input = this.sell.input('WIDC_EDITSELL');
    const kept = keptCount(input.value, this.stack);
    if (kept !== input.value) input.value = kept;
    const total = Math.max(1, target.unit()) * (Number.parseInt(kept, 10) || 0);
    this.sell.setText('WIDC_STATIC2', target.item() === undefined ? '0' : total.toLocaleString('en-US'));
  }

  /** OK: `atoi`, sold when not 0 (WndShop.cpp:230-255). */
  private sellOk(): void {
    if (!this.sell.isOpen) return;
    const target = this.selling;
    const count = Number.parseInt(keptCount(this.sell.input('WIDC_EDITSELL').value, this.stack), 10) || 0;
    this.sell.close();
    if (count > 0) target?.ok(count);
  }

  /** Each frame: the sell boxes go once the item is in use or gone (`Process`, `__DROP_CONFIRM_BUG`, WndShop.cpp:77-85). */
  check(): void {
    const target = this.selling;
    if (target === null || !(this.sell.isOpen || this.warning.isOpen)) return;
    if (target.item() === undefined || target.inUse()) {
      this.sell.close();
      this.warning.close();
    }
  }

  get isOpen(): boolean {
    return this.buy.isOpen || this.sell.isOpen || this.warning.isOpen;
  }

  close(): void {
    for (const box of [this.buy, this.sell, this.warning]) box.close();
  }

  dispose(): void {
    for (const box of [this.buy, this.sell, this.warning]) box.dispose();
  }
}
