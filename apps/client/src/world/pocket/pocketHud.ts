// The Backpack's window joined to its rules and the session (2026-11-17, docs/2026-11-17-extra-bag-research.md §3, §4), so
// that the world screen only routes the presses, the drops and the frame to it:
//
//   CWndBagEx::OnInitialUpdate     _Interface/WndBagEx.cpp:142-185   refused with the trade, a mail read, an NPC shop, the guild
//                                                                    bank or a private shop open; opens centred
//   CWndBagEx::OnDropIcon ...      WndBagEx.cpp:220-500              the drops (pocket/pocketRules.ts)
//   CWndInventory::OnChildNotify   _Interface/WndField.cpp:1918-1977 a pocket's item on the bag
//   CWndTradeGold (APP_BAG_EX)     WndField.cpp:8529-8542            the count's box
//   CDPClient::OnPocketAttribute   Neuz/DPClient.cpp:17313-17325     the window redrawn (InitItem)
//   CWndBank / CWndShop / CWndVendor / CWndGuildBank / CWndTrade / CWndPost ::OnInitialUpdate   the Backpack closes

import type { InventoryItem } from '@flyffweb/protocol';
import { POCKET_COUNT } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { AmountBox } from '../hud/amountBox';
import { BagExWindow } from '../hud/pocket/bagExWindow';
import type { PocketDrop } from '../hud/pocket/bagExWindow';
import type { PocketBook } from './pocketBook';
import { bagToIcon, bagToPocket, iconTooltip, pocketToBag, pocketToPocket, tapBagItem } from './pocketRules';
import type { PocketAction, PocketContext } from './pocketRules';

const WHITE = 0xffffffff;

/** What the Backpack needs of the world screen. */
export interface PocketHudScreen {
  send(bytes: Uint8Array): void;
  /** A line of the HUD's messages (`PutString`). */
  say(text: string, color: number): void;
  /** `OpenMessageBox( text )`. */
  box(text: string): void;
  /** The own pockets and bag (null before the own character came). */
  pockets(): PocketBook | null;
  bagItems(): ReadonlyMap<number, InventoryItem> | null;
  /** The bag object is worn (`IsEquip`). */
  worn(objectId: number): boolean;
  prop(itemId: number): WebItemProp | undefined;
  /** The count of a bag item another window holds (`GetExtra`). */
  reserved(objectId: number): number;
  /** The own clock (`time_null()` seconds). */
  now(): number;
  /** The windows the Backpack does not open beside: the trade, a mail read, an NPC shop, the guild bank, a private shop. */
  refused(): boolean;
  /** The phone's bag, opened with the Backpack (the taps go between them). */
  openInventory(): void;
  /** An item's tooltip over `anchor` in `host`, or none. */
  showTooltip(item: InventoryItem | null, anchor: HTMLElement | null, host: HTMLElement): void;
  /** A tooltip of words over `anchor` in `host`, or none. */
  showText(text: string | null, anchor: HTMLElement | null, host: HTMLElement): void;
}

export class PocketHud {
  readonly window: BagExWindow;
  readonly amount: AmountBox;
  private pending: ((count: number) => Uint8Array | null) | null = null;
  private drawn = -1;
  private drawnText = '';
  /** The bag icon whose tooltip is up, to keep its time current. */
  private hovered: { pocket: number; anchor: HTMLElement } | null = null;

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: PocketHudScreen, doc: Document = document) {
    this.window = new BagExWindow(art, doc);
    this.amount = new AmountBox(art, doc);
    const host = (): HTMLElement => this.window.frame.element;
    this.window.onDrop = (pocket, what) => this.dropOnPocket(pocket, what);
    this.window.onDropIcon = (pocket, objectId) => this.run(this.withContext((ctx) => bagToIcon(pocket, objectId, ctx)));
    this.window.onTapItem = (pocket, objectId) => this.dropOnBag(pocket, objectId);
    this.window.onHover = (pocket, objectId, anchor) => {
      const item = objectId === null ? undefined : screen.pockets()?.item(pocket, objectId);
      screen.showTooltip(item ?? null, item === undefined ? null : anchor, host());
    };
    this.window.onIconHover = (pocket, anchor) => {
      this.hovered = pocket === null || anchor === null ? null : { pocket, anchor };
      this.showIconTip();
    };
    this.window.window.onClose = () => {
      screen.showTooltip(null, null, host());
      this.hovered = null;
      screen.showText(null, null, host());
      this.amount.close();
    };
    this.amount.onOk = (count) => {
      const send = this.pending;
      this.pending = null;
      const bytes = send?.(count) ?? null;
      if (bytes !== null) screen.send(bytes);
    };
    this.amount.onClose = () => { this.pending = null; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.window.frame.element, this.amount.element];
  }

  /** The Backpack is open (`GetWndBase( APP_BAG_EX )`). */
  get isOpen(): boolean {
    return this.window.frame.isOpen;
  }

  private text(tid: string, fallback: string): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text || fallback, color: entry?.color ?? WHITE };
  }

  /** The Start menu's Backpack, its slot or B: closes it, or opens it centred (not beside the refusing windows). */
  toggle(): void {
    if (this.isOpen) { this.window.frame.close(); return; }
    if (this.screen.refused()) return;
    // the phone's taps go between the bag and the Backpack: the bag opens with it
    if (this.window.phone) this.screen.openInventory();
    this.window.show(0);
    this.window.window.open();
    this.drawn = -1;
    this.update();
  }

  /** Closed by a window that opened (the bank, an NPC shop, a private shop, the guild bank, the trade, the post). */
  close(): void {
    if (this.isOpen) this.window.frame.close();
  }

  /** Every frame while open: drawn again when the pockets changed or a bag icon's line did (Neuz draws live). */
  update(): void {
    if (!this.isOpen) return;
    const pockets = this.screen.pockets();
    if (pockets === null) return;
    const now = this.screen.now();
    const iconText = [1, 2].map((pocket) => iconTooltip(pocket, pockets, now, (tid, fallback) => this.text(tid, fallback).text));
    const joined = iconText.join('\n');
    if (pockets.revision !== this.drawn || joined !== this.drawnText) {
      this.drawn = pockets.revision;
      this.drawnText = joined;
      this.window.draw({
        cells: Array.from({ length: POCKET_COUNT }, (_, i) => pockets.cells(i)),
        usable: Array.from({ length: POCKET_COUNT }, (_, i) => pockets.usable(i)),
        iconText,
        prop: (itemId) => this.screen.prop(itemId),
      });
      if (this.hovered !== null) this.showIconTip();
    }
  }

  private showIconTip(): void {
    const pockets = this.screen.pockets();
    const host = this.window.frame.element;
    if (this.hovered === null || pockets === null) { this.screen.showText(null, null, host); return; }
    const text = iconTooltip(this.hovered.pocket, pockets, this.screen.now(), (tid, fallback) => this.text(tid, fallback).text);
    this.screen.showText(text, this.hovered.anchor, host);
  }

  private context(): PocketContext | null {
    const pockets = this.screen.pockets();
    if (pockets === null) return null;
    return {
      pockets, bagItems: this.screen.bagItems(), worn: (id) => this.screen.worn(id), prop: (itemId) => this.screen.prop(itemId),
    };
  }

  private withContext(rule: (ctx: PocketContext) => PocketAction): PocketAction {
    const ctx = this.context();
    return ctx === null || !this.isOpen ? { kind: 'none' } : rule(ctx);
  }

  /** A drop on pocket `target`'s grid; any open count box goes first. */
  dropOnPocket(target: number, drop: PocketDrop): void {
    this.amount.close();
    if (drop.kind === 'bagItem') {
      // a stack with a part in a trade or a shop (`GetExtra() != 0`) does nothing
      const item = this.screen.bagItems()?.get(drop.objectId);
      if (item !== undefined && item.count > 1 && this.screen.reserved(drop.objectId) > 0) return;
      this.run(this.withContext((ctx) => bagToPocket(target, drop.objectId, ctx)));
    } else {
      this.run(this.withContext((ctx) => pocketToPocket(drop.from, drop.objectId, target, ctx)));
    }
  }

  /** A pocket's item dropped on the bag (or tapped on the phone): out of the pocket. */
  dropOnBag(from: number, objectId: number): void {
    this.amount.close();
    this.run(this.withContext((ctx) => pocketToBag(from, objectId, ctx)));
  }

  /** The phone's tap on a bag item: into the pocket shown, or an Extra Bag opening it. */
  tapBagItem(objectId: number): void {
    this.amount.close();
    const item = this.screen.bagItems()?.get(objectId);
    if (item !== undefined && item.count > 1 && this.screen.reserved(objectId) > 0) return;
    this.run(this.withContext((ctx) => tapBagItem(this.window.shownPocket, objectId, ctx)));
  }

  private run(action: PocketAction): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'line': {
        const { text, color } = this.text(action.tid, action.tid === 'TID_GAME_EQUIPPUT'
          ? 'Please unequip the item first.' : 'You cannot move that Quest Item to your Extra Bag.');
        this.screen.say(text, color);
        return;
      }
      case 'box':
        this.screen.box(this.text(action.tid, 'You are already using an Extra Bag.').text.replace(/\\n/g, '\n'));
        return;
      case 'send':
        this.screen.send(action.bytes);
        return;
      case 'ask':
        this.pending = action.send;
        this.amount.open('Move Items', this.text('TID_GAME_MOVECOUNT', 'Move how many items?').text,
          this.text('TID_GAME_NUMCOUNT', 'Number:').text, action.max);
        return;
    }
  }

  /** The world left: the window and its box closed. */
  reset(): void {
    this.pending = null;
    this.amount.close();
    this.close();
  }
}
