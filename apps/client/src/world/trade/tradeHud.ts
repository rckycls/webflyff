// The player trade's windows joined to its state and the session (2026-11-10, docs/superpowers/specs/2026-11-10-trade-
// research.md), in one place so that the world screen only routes messages and presses to it:
//
//   CWndWorld MMI_TRADE                 _Interface/WndWorld.cpp:5251-5358   a request open or a trade: TID_GAME_YETTRADE; else
//                                                                           CONFIRMTRADE and TID_GAME_TRADEREQUEST
//   CWndConfirmTrade::OnChildNotify     _Interface/WndField.cpp:8854-8873   OK: TRADE if the asker is in view; Cancel, close:
//                                                                           CONFIRMTRADECANCEL
//   CWndTrade::OnInitialUpdate          WndField.cpp:9005-9049              centred; an NPC shop open: closed at once
//   CWndTrade::OnChildNotify            WndField.cpp:9059-9135              a drop on a grid, OK (TRADEOK), Cancel (TRADECANCEL,
//                                                                           the window stays); nothing while the final box is up
//   CWndTrade::~CWndTrade               WndField.cpp:8958-8962              every close sends TRADECANCEL
//   CWndTradeCtrl::OnDropIcon           _Interface/WndTradeCtrl.cpp:108-174  (tradeState.ts `dropAction`)
//   CWndTradeGold::OnChildNotify        WndField.cpp:8493-8541              the count (TRADEPUT) or the penya (TRADEPUTGOLD)
//   CWndTradeGold::Process              WndField.cpp:8444-8455              its item put in meanwhile: the box closes
//   CWndTradeConfirm::OnChildNotify     WndField.cpp:8928-8945              Yes TRADECONFIRM; No, close: TRADECANCEL; nothing
//                                                                           once waiting (`bMsg`)

import type { InventoryItem, MessageOf, TradeMessage } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { ConfirmTradeWindow, TradeConfirmWindow, TradeGoldWindow, TradeWindow } from '../hud/trade/tradeWindows';
import type { TradeCell } from '../hud/trade/tradeWindows';
import type { ItemContainer, TradeSlot } from './itemContainer';
import { TradeState, blockLine, dropAction, penyaText, quantityOf } from './tradeState';
import type { TradeEvent } from './tradeState';

/** What the trade sends (`WorldSession`'s). */
export interface TradeHudSession {
  sendConfirmTrade(targetId: number): void;
  sendConfirmTradeCancel(askerId: number): void;
  sendTrade(askerId: number): void;
  sendTradePut(slot: number, itemType: number, itemObjectId: number, count: number): void;
  sendTradeOk(): void;
  sendTradeCancel(mode?: number): void;
  sendTradePutGold(gold: number): void;
  sendTradeConfirm(): void;
  /** BLOCK `gu` with the own name and the asker's (`SendBlock`). */
  sendTradeBlock(gu: number, askerName: string): void;
}

export interface TradeHudScreen {
  session: TradeHudSession;
  ownObjectId(): number;
  ownPlayerId(): number;
  ownName(): string;
  /** A mover's name, '' for one not in view (`prj.GetMover( objid )`). */
  nameOf(objectId: number): string;
  /** The own bag (null before it is read) and penya. */
  ownItems(): ReadonlyMap<number, InventoryItem> | null;
  ownGold(): number;
  prop(itemId: number): WebItemProp | undefined;
  /** A line of the HUD's messages (`PutString`). */
  say(text: string, color: number): void;
  /** `OpenMessageBox( text )`. */
  box(text: string): void;
  /** `CreateApplet( APP_INVENTORY )`: the bag opened (TRADE opens it with the trade window). */
  openInventory(): void;
  /** An NPC shop is open (the trade window closes itself, :9043-9047). */
  npcShopOpen(): boolean;
  /** The own penya changed by the trade (`AddGold( n, FALSE )`). */
  addOwnGold(delta: number): void;
  /** TRADECONSENT's moves on the own bag (`CVTInfo::TradeConsent`). */
  consent(mine: ReadonlyArray<TradeSlot | null>, theirs: ReadonlyArray<TradeSlot | null>, partner: ItemContainer, gold: number): void;
  /** The bag drawn again (the items in the trade are faded, their counts less the traded). */
  refreshBag(): void;
  /** An item's tooltip over `anchor` in the trade window, or none. */
  showTooltip(item: InventoryItem | null, anchor: HTMLElement | null): void;
}

const WHITE = 0xffffffff;

/** What the quantity box is for: an item's count for a slot, or the penya. */
type GoldTarget = { kind: 'item'; slot: number; objectId: number } | { kind: 'gold' };

export class TradeHud {
  readonly state = new TradeState();
  readonly window: TradeWindow;
  readonly request: ConfirmTradeWindow;
  readonly confirm: TradeConfirmWindow;
  readonly gold: TradeGoldWindow;
  private askerId: number | null = null;
  private goldTarget: GoldTarget | null = null;
  /** The world left: the window closes with no TRADECANCEL (the session is gone). */
  private quiet = false;

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: TradeHudScreen, doc: Document = document) {
    this.window = new TradeWindow(art, doc);
    this.request = new ConfirmTradeWindow(art, doc);
    this.confirm = new TradeConfirmWindow(art, doc);
    this.gold = new TradeGoldWindow(art, doc);

    this.window.onDrop = (slot, what) => this.drop(slot, what);
    this.window.onOk = () => { if (!this.confirm.isOpen) screen.session.sendTradeOk(); };
    this.window.onCancel = () => { if (!this.confirm.isOpen) screen.session.sendTradeCancel(); };
    this.window.onHover = (side, slot, anchor) => {
      const item = anchor === null ? undefined : this.state.itemAt(side, slot, screen.ownItems());
      screen.showTooltip(item ?? null, item === undefined ? null : anchor);
    };
    // the destructor's TRADECANCEL, whatever closed the window (:8958-8962); the server drops it once the trade is over
    this.window.window.onClose = () => {
      screen.showTooltip(null, null);
      if (!this.quiet) screen.session.sendTradeCancel();
      this.gold.close();
    };

    this.request.onOk = () => {
      const askerId = this.askerId;
      this.askerId = null;
      if (askerId !== null && screen.nameOf(askerId) !== '') screen.session.sendTrade(askerId);
    };
    this.request.onCancel = () => {
      const askerId = this.askerId;
      this.askerId = null;
      if (askerId !== null) screen.session.sendConfirmTradeCancel(askerId);
    };

    this.confirm.onYes = () => { if (!this.state.waiting) screen.session.sendTradeConfirm(); };
    this.confirm.onNo = () => { if (!this.state.waiting) screen.session.sendTradeCancel(); };
    this.confirm.onClosed = () => { if (!this.state.waiting) screen.session.sendTradeCancel(); };

    this.gold.onOk = (text) => this.goldOk(text);
    this.gold.window.onClose = () => { this.goldTarget = null; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.window.frame.element, this.request.window.element, this.confirm.window.element, this.gold.element];
  }

  /** The trade window is open (`GetWndBase( APP_TRADE )`): the bag's items are not used nor moved. */
  get windowOpen(): boolean {
    return this.window.frame.isOpen;
  }

  /** The own traded count of a bag object (`GetExtra()`), 0 for one not in the trade. */
  extraOf(objectId: number): number {
    return this.state.open ? this.state.extraOf(objectId) : 0;
  }

  private text(tid: string): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text ?? '', color: entry?.color ?? WHITE };
  }

  private line(tid: string, args?: string[], colorTid?: string): void {
    const { text } = this.text(tid);
    if (text === '') return;
    this.screen.say(args === undefined ? text : formatText(text, args), this.text(colorTid ?? tid).color);
  }

  /** The menu's Trade (`MMI_TRADE`, WndWorld.cpp:5251-5358), for a player in view. */
  requestTrade(targetId: number): void {
    // the bank, mail, beauty shop, summon angel and repair windows of the checks are not the browser's
    if (this.request.isOpen || this.windowOpen) {
      this.line('TID_GAME_YETTRADE');
      return;
    }
    this.screen.session.sendConfirmTrade(targetId);
    this.line('TID_GAME_TRADEREQUEST', [this.screen.nameOf(targetId)]);
  }

  /** A world message of the trade, about `objectId`. */
  handle(objectId: number, message: TradeMessage): void {
    const events = this.state.apply(objectId, message, {
      ownObjectId: this.screen.ownObjectId(), ownPlayerId: this.screen.ownPlayerId(),
      nameOf: (id) => this.screen.nameOf(id), requestOpen: () => this.request.isOpen,
    });
    this.run(events);
  }

  /** BLOCK from the core: the asked side's refusals of the trade (`OnBlock`, gu 3, 4, 5, 8). */
  onBlock(message: MessageOf<'block'>): void {
    const event = blockLine(message);
    if (event !== null) this.run([event]);
  }

  /** DEL_OBJ: the partner gone (`OnRemoveObj`, :1676-1708). */
  removed(objectId: number): void {
    this.run(this.state.removed(objectId));
  }

  /** The world left: every trade window closed with no packet (the session is gone). */
  reset(): void {
    this.state.clear();
    this.askerId = null;
    this.request.dismiss();
    this.confirm.dismiss();
    this.gold.close();
    if (this.window.frame.isOpen) {
      this.quiet = true;
      this.window.frame.close();
      this.quiet = false;
    }
  }

  private run(events: readonly TradeEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'line':
          this.line(event.tid, event.args, event.colorTid);
          break;
        case 'box': {
          const { text } = this.text(event.tid);
          if (text !== '') this.screen.box(text);
          break;
        }
        case 'request':
          this.askerId = event.askerId;
          this.request.open(formatText(this.text('TID_GAME_FROM').text || '%s wants to trade.', [event.name]));
          break;
        case 'refuse':
          this.screen.session.sendTradeBlock(event.gu, event.askerName);
          break;
        case 'opened':
          this.screen.openInventory();
          // a web box, NPC shop, bank, guild bank or vendor open: the window closes at once (:9043-9047), which cancels
          if (this.screen.npcShopOpen()) {
            this.screen.session.sendTradeCancel();
            break;
          }
          if (!this.window.frame.isOpen) this.window.window.open();
          this.window.setLocked(false);
          break;
        case 'changed':
          this.draw();
          break;
        case 'ownGold':
          this.screen.addOwnGold(event.delta);
          break;
        case 'lastConfirm':
          this.confirm.open(this.text('TID_DIAG_0083').text || 'Do you accept the trade?');
          this.window.setLocked(true);
          break;
        case 'waitApproval':
          this.confirm.setWaiting(true, this.text('TID_GAME_WAITCOMFIRM').text || 'You need to wait for approval.');
          break;
        case 'consent':
          this.screen.consent(event.mine, event.theirs, event.partner, event.gold);
          break;
        case 'closed':
          this.confirm.dismiss();
          this.gold.close();
          this.window.setLocked(false);
          if (this.window.frame.isOpen) this.window.frame.close();
          this.screen.refreshBag();
          break;
      }
    }
  }

  /** `CWndTrade::OnDraw`: the names, the penya with commas, the OKs, both grids. */
  draw(): void {
    const s = this.state;
    const own = this.screen.ownItems();
    const cells = (side: 'mine' | 'theirs'): Array<TradeCell | null> => s[side].slots.map((slot, i) => {
      const item = s.itemAt(side, i, own);
      return slot === null || item === undefined ? null : { item, prop: this.screen.prop(item.itemId), count: slot.count };
    });
    this.window.draw({
      theirName: s.partnerName, myName: this.screen.ownName(), theirGold: penyaText(s.theirs.gold), myGold: penyaText(s.mine.gold),
      theirOk: s.theirs.ok, myOk: s.mine.ok, mine: cells('mine'), theirs: cells('theirs'),
    });
    // the quantity box goes once its item is in the trade (`Process`)
    const target = this.goldTarget;
    if (target?.kind === 'item' && s.extraOf(target.objectId) > 0) this.gold.close();
    this.screen.refreshBag();
  }

  /** A drop on the own grid (`CWndTradeCtrl::OnDropIcon`). */
  drop(slot: number, what: { objectId: number } | { gold: true }): void {
    const action = dropAction(
      this.state, slot,
      'gold' in what ? { gold: this.screen.ownGold() } : { objectId: what.objectId, item: this.screen.ownItems()?.get(what.objectId) },
      this.gold.isOpen,
    );
    switch (action.kind) {
      case 'none':
        return;
      case 'put':
        this.screen.session.sendTradePut(action.slot, 0, action.objectId, 1);
        return;
      case 'quantity':
        this.goldTarget = { kind: 'item', slot: action.slot, objectId: action.objectId };
        this.gold.open('Item', this.text('TID_GAME_MOVECOUNT').text || 'Move how many items?',
          this.text('TID_GAME_NUMCOUNT').text || 'Number:', action.count);
        return;
      case 'gold':
        this.goldTarget = { kind: 'gold' };
        this.gold.open('Penya', this.text('TID_GAME_MOVEPENYA').text || 'How many do you want to move?',
          this.text('TID_GAME_PENYACOUNT').text || 'Penya:', action.gold);
        return;
    }
  }

  /** The phone's tap on a bag item while trading: the first free own slot takes it (no pointer to aim a drop with). */
  tapItem(objectId: number): void {
    const slot = this.state.firstFreeSlot();
    if (slot >= 0) this.drop(slot, { objectId });
  }

  /** The phone's tap on the penya: the penya box (the drag of the sack). */
  tapPenya(): void {
    const slot = this.state.firstFreeSlot();
    this.drop(slot < 0 ? 0 : slot, { gold: true });
  }

  /** The quantity box's OK (:8513-8541). */
  private goldOk(text: string): void {
    const target = this.goldTarget;
    this.goldTarget = null;
    if (target === null || !this.state.open) return;
    if (target.kind === 'gold') {
      const n = quantityOf(text, this.screen.ownGold());
      if (n > 0) this.screen.session.sendTradePutGold(n);
      return;
    }
    const item = this.screen.ownItems()?.get(target.objectId);
    if (item === undefined) return;
    this.screen.session.sendTradePut(target.slot, 0, target.objectId, quantityOf(text, item.count));
  }
}
