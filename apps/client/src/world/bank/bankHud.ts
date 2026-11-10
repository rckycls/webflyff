// The bank's windows joined to its rules and the session (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md
// §1; A-bank.md), so that the world screen only routes messages, presses and the frame to it:
//
//   CWndWorld MMI_BANKING               _Interface/WndWorld.cpp:5451-5536   the checks, then OPENBANKWND( NULL_ID, 0 )
//   CDPClient::OnBankWindow             Neuz/DPClient.cpp:3031-3055         the bank and PIN windows go; mode 0 the set-PIN window,
//                                                                           else the enter-PIN window
//   CWndConfirmBank::OnChildNotify      _Interface/WndBank.cpp:475-524      OK: 4 digits -> CONFIRMBANK, else TID_DIAG_0025;
//                                                                           Change PIN; Cancel
//   CWndBankPassword::OnChildNotify     WndBank.cpp:613-688                 the three checks, then CHANGEBANKPASS
//   CDPClient::OnChangeBankPass         DPClient.cpp:3085-3111              1: the enter-PIN window; 0: the change window, "Wrong"
//   CDPClient::OnConfirmBankPass        DPClient.cpp:3113-3136              1: the bag and the bank; 0: the PIN window, "Wrong"
//   CWndBank::OnInitialUpdate           WndBank.cpp:47-123                  beside the bag; closes itself with a trade, shop open
//   CWndBank::OnChildNotify             WndBank.cpp:185-389                 drops on a grid (bankDropAction)
//   CWndInventory::OnChildNotify        _Interface/WndField.cpp:1863-1950   a bank's item or penya dropped on the bag
//   CWndTradeGold::OnChildNotify        WndField.cpp:8545-8730              the count's box: APP_BANK, APP_GOLD, APP_COMMON_BANK
//   ~CWndBank                           WndBank.cpp:20-24                   CLOSEBANKWND, the count's box goes
//   CWndWorld::Process                  WndWorld.cpp:8313-8337              any move: the bank, the box, the bag and the PIN
//                                                                           windows close, CLOSEBANKWND again
//   CDPClient::OnErrorBankIsFull        DPClient.cpp:3026-3029              TID_GAME_SLOTFULL

import type { BankMessage, InventoryItem } from '@flyffweb/protocol';
import {
  BANK_COUNT, BANK_NPC, encodeChangeBankPass, encodeCloseBankWnd, encodeConfirmBank, encodeGetGoldBank, encodeGetItemBank,
  encodeOpenBankWnd, encodePutGoldBank, encodePutGoldBankToBank, encodePutItemBank, encodePutItemBankToBank,
} from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { AmountBox } from '../hud/amountBox';
import { BankPasswordWindow, BankWindow, ConfirmBankWindow } from '../hud/bank/bankWindows';
import type { BankDrop } from '../hud/bank/bankWindows';
import type { WindowFrame } from '../hud/frame';
import type { BankBook } from './bankBook';

const WHITE = 0xffffffff;
/** `APP_INVENTORY`'s width (resdata.inc:19776): the bank goes 2.525 of it to the left of a bag on the right half. */
const BAG_WIDTH = 240;

/** What the bank needs of the world screen. */
export interface BankHudScreen {
  send(bytes: Uint8Array): void;
  /** A line of the HUD's messages (`PutString`). */
  say(text: string, color: number): void;
  /** `OpenMessageBox( text )`. */
  box(text: string): void;
  /** The own banks, bag and penya (null before the own character came). */
  bank(): BankBook | null;
  bagItems(): ReadonlyMap<number, InventoryItem> | null;
  ownGold(): number;
  /** The bag object is worn (`IsEquip`). */
  worn(objectId: number): boolean;
  prop(itemId: number): WebItemProp | undefined;
  /** A Common Bank timer runs (`IsCommBank`: SM_BANK15, SM_BANK30, SM_BANK001). */
  commonBank(): boolean;
  /** The trade window and the NPC shop are open (the menu's checks and `OnInitialUpdate`'s). */
  tradeOpen(): boolean;
  npcShopOpen(): boolean;
  /** `CreateApplet( APP_INVENTORY )`, and the bag's frame for the placing. */
  openInventory(): void;
  closeInventory(): void;
  inventoryFrame(): WindowFrame | null;
  /** An item's tooltip over `anchor` in `host`, or none. */
  showTooltip(item: InventoryItem | null, anchor: HTMLElement | null, host: HTMLElement): void;
}

/** What a drop asks: nothing, a line, a packet at once, or the count's box first (its title, lines, all of it, the packet). */
export type BankAction =
  | { kind: 'none' }
  | { kind: 'line'; tid: string }
  | { kind: 'send'; bytes: Uint8Array }
  | { kind: 'ask'; penya: boolean; max: number; send: (amount: number) => Uint8Array | null };

/** What a drop is weighed against. */
export interface BankDropContext {
  bank: BankBook;
  bagItems: ReadonlyMap<number, InventoryItem> | null;
  gold: number;
  worn(objectId: number): boolean;
}

/**
 * A drop on bank `target`'s grid (`CWndBank::OnChildNotify`, WndBank.cpp:185-389) and the count box's OK
 * (`CWndTradeGold`, WndField.cpp:8545-8566, 8693-8730). A bank-to-bank move needs both banks usable, as the grid's taking part
 * does; the caller checks the target.
 */
export function bankDropAction(target: number, drop: BankDrop, ctx: BankDropContext): BankAction {
  switch (drop.kind) {
    case 'bagItem': {
      const item = ctx.bagItems?.get(drop.objectId);
      if (item === undefined) return { kind: 'none' };
      // dragged from the equipment: not one selected bag item (:215-220)
      if (ctx.worn(drop.objectId)) return { kind: 'line', tid: 'TID_GAME_EQUIPPUT' };
      if (item.count > 1) {
        return {
          kind: 'ask', penya: false, max: item.count,
          // the item still there, the count at most its stack (:8554-8566)
          send: (n) => {
            const now = ctx.bagItems?.get(drop.objectId);
            return now === undefined ? null : encodePutItemBank(target, drop.objectId, Math.min(n, now.count));
          },
        };
      }
      return { kind: 'send', bytes: encodePutItemBank(target, drop.objectId, 1) };
    }
    case 'bagPenya':
      // all the bag's penya; sent even when it comes to 0 (:8545-8553)
      return { kind: 'ask', penya: true, max: ctx.gold, send: (n) => encodePutGoldBank(target, Math.min(n, ctx.gold)) };
    case 'bankItem': {
      // a drop on its own grid does nothing (CWndItemCtrl::OnDropIcon, WndItemCtrl.cpp:1213-1227)
      if (drop.from === target) return { kind: 'none' };
      const item = ctx.bank.item(drop.from, drop.objectId);
      if (item === undefined) return { kind: 'none' };
      if (item.count > 1) {
        return {
          kind: 'ask', penya: false, max: item.count,
          send: (n) => {
            const now = ctx.bank.item(drop.from, drop.objectId);
            return now === undefined ? null : encodePutItemBankToBank(drop.from, target, drop.objectId, Math.min(n, now.count));
          },
        };
      }
      return { kind: 'send', bytes: encodePutItemBankToBank(drop.from, target, drop.objectId, 1) };
    }
    case 'bankPenya': {
      // the coin on its own bank's grid still moves (source = target: the server adds and takes the same, :1182-1275)
      const max = ctx.bank.gold[drop.from] ?? 0;
      return {
        kind: 'ask', penya: true, max,
        send: (n) => { const m = Math.min(n, ctx.bank.gold[drop.from] ?? 0); return m > 0 ? encodePutGoldBankToBank(drop.from, target, m) : null; },
      };
    }
  }
}

/** A bank's item or penya dropped on the bag (`CWndInventory::OnChildNotify`, WndField.cpp:1863-1950; the box's APP_GOLD). */
export function bagDropAction(from: { bank: number; objectId?: number }, ctx: BankDropContext): BankAction {
  if (from.objectId === undefined) {
    const max = ctx.bank.gold[from.bank] ?? 0;
    return {
      kind: 'ask', penya: true, max,
      send: (n) => { const m = Math.min(n, ctx.bank.gold[from.bank] ?? 0); return m > 0 ? encodeGetGoldBank(from.bank, m) : null; },
    };
  }
  const objectId = from.objectId;
  const item = ctx.bank.item(from.bank, objectId);
  if (item === undefined) return { kind: 'none' };
  if (item.count > 1) {
    return {
      kind: 'ask', penya: false, max: item.count,
      send: (n) => {
        const now = ctx.bank.item(from.bank, objectId);
        return now === undefined ? null : encodeGetItemBank(from.bank, objectId, Math.min(n, now.count));
      },
    };
  }
  return { kind: 'send', bytes: encodeGetItemBank(from.bank, objectId, 1) };
}

/** `isdigit2` over the PIN (WndBank.cpp:475-512): 4 characters, all digits. */
export const pinValid = (pin: string): boolean => /^[0-9]{4}$/.test(pin);

/**
 * `CWndBankPassword`'s OK checks, in order (WndBank.cpp:613-688): the three lengths, new = confirm, all digits. `reset` says
 * what the window clears: every field (`all`) or New and Confirm (`new`).
 */
export function passwordCheck(old: string, fresh: string, confirm: string): { tid: string; reset: 'all' | 'new' } | null {
  if (old.length !== 4 || fresh.length !== 4 || confirm.length !== 4) return { tid: 'TID_DIAG_0025', reset: 'all' };
  if (fresh !== confirm) return { tid: 'TID_DIAG_0022', reset: 'new' };
  if (!pinValid(old) || !pinValid(fresh) || !pinValid(confirm)) return { tid: 'TID_DIAG_0025', reset: 'all' };
  return null;
}

export class BankHud {
  readonly window: BankWindow;
  readonly confirm: ConfirmBankWindow;
  readonly password: BankPasswordWindow;
  readonly amount: AmountBox;
  /** The scroll the bank was opened with (`m_dwId`, `m_dwItemId`), `BANK_NPC` at an NPC. */
  private scroll = { id: BANK_NPC, item: 0 };
  private pending: ((amount: number) => Uint8Array | null) | null = null;
  /** The bank closed by the game: no CLOSEBANKWND (the world left). */
  private quiet = false;
  private drawn = -1;
  private drawnCommon: boolean | null = null;

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: BankHudScreen, doc: Document = document) {
    this.window = new BankWindow(art, doc);
    this.confirm = new ConfirmBankWindow(art, doc);
    this.password = new BankPasswordWindow(art, doc);
    this.amount = new AmountBox(art, doc);

    this.window.onDrop = (bank, what) => this.dropOnBank(bank, what);
    this.window.onTapItem = (bank, objectId) => this.dropOnBag({ bank, objectId });
    this.window.onTapPenya = (bank) => this.dropOnBag({ bank });
    this.window.onHover = (bank, objectId, anchor) => {
      const item = objectId === null ? undefined : this.screen.bank()?.item(bank, objectId);
      screen.showTooltip(item ?? null, item === undefined ? null : anchor, this.window.frame.element);
    };
    // ~CWndBank: CLOSEBANKWND whatever closed it, and the count's box goes
    this.window.window.onClose = () => {
      screen.showTooltip(null, null, this.window.frame.element);
      this.amount.close();
      if (!this.quiet) screen.send(encodeCloseBankWnd());
    };

    this.confirm.onOk = (pin) => {
      if (!pinValid(pin)) {
        this.confirm.clear();
        this.box('TID_DIAG_0025', 'Password should have 4 digits. Please try again.');
        return;
      }
      screen.send(encodeConfirmBank(pin, this.scroll.id, this.scroll.item));
    };
    // Change PIN: the change window in mode 1 (Neuz loses the scroll's ids here; they are kept, research §3 decision 2)
    this.confirm.onChange = () => {
      this.confirm.close();
      this.password.open(1);
    };
    this.password.onOk = (old, fresh, again) => {
      const refused = passwordCheck(old, fresh, again);
      if (refused !== null) {
        if (refused.reset === 'all') this.password.reset(); else this.password.clearNew();
        this.box(refused.tid, refused.tid === 'TID_DIAG_0022'
          ? 'Your new password is different from the password you confirmed. Please try again.'
          : 'Password should have 4 digits. Please try again.');
        return;
      }
      screen.send(encodeChangeBankPass(old, fresh, this.scroll.id, this.scroll.item));
    };

    this.amount.onOk = (amount) => {
      const send = this.pending;
      this.pending = null;
      const bytes = send?.(amount) ?? null;
      if (bytes !== null) screen.send(bytes);
    };
    this.amount.onClose = () => { this.pending = null; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.window.frame.element, this.confirm.window.element, this.password.window.element, this.amount.element];
  }

  /** The bank window is open (`GetWndBase( APP_COMMON_BANK )`). */
  get isOpen(): boolean {
    return this.window.frame.isOpen;
  }

  /** The bank or one of its PIN windows is open (the "already using the bank" checks). */
  get busy(): boolean {
    return this.isOpen || this.confirm.isOpen || this.password.isOpen;
  }

  private text(tid: string, fallback: string): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text || fallback, color: entry?.color ?? WHITE };
  }

  private line(tid: string, fallback: string): void {
    const { text, color } = this.text(tid, fallback);
    this.screen.say(text, color);
  }

  private box(tid: string, fallback: string): void {
    this.screen.box(this.text(tid, fallback).text.replace(/\\n/g, '\n'));
  }

  /** The NPC menu's Deposit (`MMI_BANKING`, WndWorld.cpp:5451-5536). */
  request(): void {
    if (this.screen.tradeOpen()) { this.line('TID_GAME_TRADENOBANK', 'You cannot trade items when using the bank.'); return; }
    if (this.screen.npcShopOpen()) { this.line('TID_GAME_BANKNOTRADE', 'You cannot use the bank while trading'); return; }
    if (this.busy) { this.line('TID_GAME_BANKSTILLUSING', 'You are already using the bank.'); return; }
    // the repair, guild bank, beauty shop and summon angel windows of the checks are not the browser's; a chaotic player's
    // refusal is the server's (it answers nothing)
    this.screen.send(encodeOpenBankWnd());
  }

  /** The Scroll of Private Custody used (DPClient.cpp:10519-10523): OPENBANKWND with its object and item ids. */
  useScroll(objectId: number, itemId: number): void {
    this.screen.send(encodeOpenBankWnd(objectId, itemId));
  }

  /** A bank snapshot; the banks' contents are the own state's (OwnState), redrawn by `update`. */
  handle(message: BankMessage): void {
    switch (message.type) {
      case 'bankWindow':
        // OnBankWindow: the bank and its PIN windows go (the bank's close sends CLOSEBANKWND)
        this.closeAll();
        this.scroll = { id: message.scrollId, item: message.scrollItem };
        if (message.mode === 0) this.password.open(0); else this.confirm.open();
        return;
      case 'confirmBankPass':
        this.confirm.close();
        this.password.close();
        if (message.mode === 1) { this.openBank(); return; }
        this.scroll = { id: message.scrollId, item: message.scrollItem };
        this.confirm.open();
        this.box('TID_DIAG_0028', 'Wrong password.  Please try again.');
        return;
      case 'changeBankPass':
        this.confirm.close();
        this.password.close();
        this.scroll = { id: message.scrollId, item: message.scrollItem };
        if (message.mode === 1) { this.confirm.open(); return; }
        this.password.open(1);
        this.box('TID_DIAG_0028', 'Wrong password.  Please try again.');
        return;
      case 'bankIsFull':
        this.line('TID_GAME_SLOTFULL', 'Your inventory is full.');
        return;
      default:
        return;
    }
  }

  /** CONFIRMBANKPASS 1: the bag opens, then the bank beside it (WndBank.cpp:111-120); not with a trade or shop open (:53-57). */
  private openBank(): void {
    this.screen.openInventory();
    if (this.screen.tradeOpen() || this.screen.npcShopOpen()) {
      // the window would destroy itself at once, and its destructor tell the server
      this.screen.send(encodeCloseBankWnd());
      return;
    }
    const bag = this.screen.inventoryFrame();
    const layer = this.window.frame.element.parentElement;
    const own = this.screen.bank()?.slot ?? 0;
    this.window.show(own);
    if (bag !== null && bag.isOpen && !this.window.phone) {
      const at = bag.position;
      const x = at.x > (layer?.clientWidth ?? 0) / 2 ? at.x - Math.trunc(BAG_WIDTH * 2.525) : at.x + BAG_WIDTH;
      this.window.window.open({ x, y: at.y });
    } else this.window.window.open();
    this.drawn = -1;
    this.update();
  }

  /** Every frame while open: drawn again when the banks, the bag or the Common Bank changed (Neuz draws live). */
  update(): void {
    if (!this.isOpen) return;
    const bank = this.screen.bank();
    if (bank === null) return;
    const common = this.screen.commonBank();
    if (bank.revision === this.drawn && common === this.drawnCommon) return;
    this.drawn = bank.revision;
    this.drawnCommon = common;
    this.window.draw({
      usable: Array.from({ length: BANK_COUNT }, (_, i) => bank.usable(i, common)),
      items: Array.from({ length: BANK_COUNT }, (_, i) => bank.packed(i)),
      gold: [...bank.gold],
      prop: (itemId) => this.screen.prop(itemId),
    });
  }

  private context(): BankDropContext | null {
    const bank = this.screen.bank();
    if (bank === null) return null;
    return { bank, bagItems: this.screen.bagItems(), gold: this.screen.ownGold(), worn: (id) => this.screen.worn(id) };
  }

  /** A drop on bank `target`'s grid; any open count box goes first (:211). */
  dropOnBank(target: number, drop: BankDrop): void {
    const ctx = this.context();
    if (ctx === null || !this.isOpen) return;
    const common = this.screen.commonBank();
    if (!ctx.bank.usable(target, common)) return;
    if ((drop.kind === 'bankItem' || drop.kind === 'bankPenya') && !ctx.bank.usable(drop.from, common)) return;
    this.amount.close();
    this.run(bankDropAction(target, drop, ctx));
  }

  /** A bank's item or penya dropped on the bag (or tapped on the phone): out of the bank. */
  dropOnBag(from: { bank: number; objectId?: number }): void {
    const ctx = this.context();
    if (ctx === null || !this.isOpen || !ctx.bank.usable(from.bank, this.screen.commonBank())) return;
    this.amount.close();
    this.run(bagDropAction(from, ctx));
  }

  /** The phone's tap on a bag item: into the bank shown (the own one when the shown one is not usable). */
  tapItem(objectId: number): void {
    this.dropOnBank(this.phoneTarget(), { kind: 'bagItem', objectId });
  }

  /** The phone's tap on the bag's penya. */
  tapPenya(): void {
    this.dropOnBank(this.phoneTarget(), { kind: 'bagPenya' });
  }

  private phoneTarget(): number {
    const bank = this.screen.bank();
    const shown = Number(this.window.frame.element.dataset.shownBank ?? '0');
    return bank !== null && bank.usable(shown, this.screen.commonBank()) ? shown : bank?.slot ?? 0;
  }

  private run(action: BankAction): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'line':
        this.line(action.tid, 'Please unequip the item first.');
        return;
      case 'send':
        this.screen.send(action.bytes);
        return;
      case 'ask': {
        this.pending = action.send;
        const question = action.penya
          ? this.text('TID_GAME_MOVEPENYA', 'How many do you want to move?').text
          : this.text('TID_GAME_MOVECOUNT', 'Move how many items?').text;
        const label = action.penya ? this.text('TID_GAME_PENYACOUNT', 'Penya:').text : this.text('TID_GAME_NUMCOUNT', 'Number:').text;
        this.amount.open('Move Items', question, label, action.max);
        return;
      }
    }
  }

  /**
   * The player moved, or accepted a duel (WndWorld.cpp:8313-8337, WndDuelConfirm.cpp:177-201): the bank (and CLOSEBANKWND once
   * more, as `SendCloseBankWnd` follows its destruction), the count's box, the bag and the PIN windows close.
   */
  moved(): void {
    if (!this.busy && !this.amount.isOpen) return;
    const wasOpen = this.isOpen;
    this.amount.close();
    this.confirm.close();
    this.password.close();
    if (wasOpen) {
      this.window.frame.close();
      this.screen.send(encodeCloseBankWnd());
      this.screen.closeInventory();
    }
  }

  /** The bag closed: the bank goes with it (`CWndInventory::OnDestroy`, WndField.cpp:1103-1105). */
  bagClosed(): void {
    if (this.isOpen) this.window.frame.close();
  }

  private closeAll(): void {
    this.amount.close();
    this.confirm.close();
    this.password.close();
    if (this.isOpen) this.window.frame.close();
  }

  private closeQuietly(): void {
    this.quiet = true;
    this.window.frame.close();
    this.quiet = false;
  }

  /** The world left: every bank window closed with no packet (the session is gone). */
  reset(): void {
    this.pending = null;
    this.amount.close();
    this.confirm.close();
    this.password.close();
    if (this.isOpen) this.closeQuietly();
  }
}
