// The player trade's state on the client (2026-11-10, docs/superpowers/specs/2026-11-10-trade-research.md §2-§6): Neuz's
// `CVTInfo` of the two players as the client keeps them, and what its handlers do with the world's trade messages. The
// windows (tradeHud.ts) draw it and act on the events.
//
//   CDPClient::OnConfirmTrade        Neuz/DPClient.cpp:2546-2602   a trade or a request open: BLOCK 5; else the request
//   CDPClient::OnConfirmTradeCancel  :2604-2607                    TID_GAME_TRADECANCEL in the chat
//   CDPClient::OnTrade               :2517-2544                    the partner's inventory kept, the windows opened
//   CDPClient::OnTradePut / Pull     :2610-2642                    a slot of either side (TradeSetItem / TradeClearItem)
//   CDPClient::OnTradePutError       :2625-2629                    TID_DIAG_0054 in a box
//   CDPClient::OnTradePutGold        :2644-2669                    the penya of a side; the own taken off the inventory's
//   CDPClient::OnTradeOk             :2795-2819                    an OK checked; the partner's says TID_GAME_TRADEACCPET
//   CDPClient::OnTradelastConfirm    :2837-2852                    both OKs checked, the final box
//   CDPClient::OnTradelastConfirmOk  :2765-2793                    the own Yes: wait; the partner's: TID_GAME_FINALCOMFIRM
//   CDPClient::OnTradeConsent        :2821-2835                    CVTInfo::TradeConsent, the windows closed
//   CDPClient::OnTradeCancel         :2729-2763                    cleared, closed, TID_DIAG_0003 (or 0002 for mode 1)
//   CDPClient::OnRemoveObj           :1676-1708                    the partner gone: every trade window closed, no message
//   CDPClient::OnBlock               :8336-8392                    gu 3, 4, 5, 8: the asked side refused

import type { InventoryItem, MessageOf, TradeMessage } from '@flyffweb/protocol';
import { MAX_TRADE } from '@flyffweb/protocol';
import type { ItemContainer, TradeSlot } from './itemContainer';
import { BAG_POSITIONS } from './itemContainer';

/** What the windows do after a message (`kind`), in order. */
export type TradeEvent =
  /** A line in the chat, `PutString( text, NULL, GetTextColor( colorTid ?? tid ) )`, `%s` filled with `args`. */
  | { kind: 'line'; tid: string; args?: string[]; colorTid?: string }
  /** `OpenMessageBox( text )`. */
  | { kind: 'box'; tid: string }
  /** The asked side: open `CWndConfirmTrade` for the asker. */
  | { kind: 'request'; askerId: number; name: string }
  /** The asked side refuses on its own: `SendBlock( gu, myName, askerName )`. */
  | { kind: 'refuse'; gu: number; askerName: string }
  /** TRADE: the inventory and the trade window open. */
  | { kind: 'opened' }
  /** Something the trade window draws changed. */
  | { kind: 'changed' }
  /** The own penya in the trade, taken off the inventory's (`AddGold( -dwGold, FALSE )`). */
  | { kind: 'ownGold'; delta: number }
  /** TRADELASTCONFIRM: the final box opens. */
  | { kind: 'lastConfirm' }
  /** The own Yes went through: the final box says TID_GAME_WAITCOMFIRM and hides its buttons (`bMsg`). */
  | { kind: 'waitApproval' }
  /** TRADECONSENT: the moves to make (`CVTInfo::TradeConsent`). */
  | { kind: 'consent'; mine: Array<TradeSlot | null>; theirs: Array<TradeSlot | null>; partner: ItemContainer; gold: number }
  /** The trade ended: the trade window, the final box and the quantity box close. */
  | { kind: 'closed' };

/** One side of the trade: its 25 slots (`m_apItem_VT`) and its penya (`m_dwTradeGold`), and whether it pressed OK. */
export interface TradeSide {
  slots: Array<TradeSlot | null>;
  gold: number;
  ok: boolean;
}

/** The own player and the world as the handlers see them. */
export interface TradeContext {
  ownObjectId: number;
  ownPlayerId: number;
  /** A mover's name (`GetName()`), '' for one not in view. */
  nameOf(objectId: number): string;
  /** The asked side's open windows (`OnConfirmTrade`'s checks): the request window. */
  requestOpen(): boolean;
  /** 2026-11-10: the Summon Angel window is open (BLOCK 8, DPClient.cpp:2589-2595). */
  summonAngelOpen?(): boolean;
}

const emptySide = (): TradeSide => ({ slots: Array.from({ length: MAX_TRADE }, () => null), gold: 0, ok: false });

/** The partner's inventory as TRADE sends it: its items by object ID and `m_apIndex`. */
function containerOf(message: MessageOf<'trade'>): ItemContainer {
  return { items: new Map(message.items.map((item) => [item.objectId, item])), slots: [...message.slots], positions: BAG_POSITIONS };
}

export class TradeState {
  /** The partner's object ID (`m_vtInfo.GetOther()`), or null with no trade. */
  partnerId: number | null = null;
  partnerName = '';
  partner: ItemContainer | null = null;
  mine: TradeSide = emptySide();
  theirs: TradeSide = emptySide();
  /** The final box is open (`APP_TRADE_CONFIRM`); `waiting` once the own Yes went through (`bMsg`). */
  confirming = false;
  waiting = false;

  get open(): boolean {
    return this.partnerId !== null;
  }

  /** The own traded count of an object (`GetExtra()`), 0 for one not in the trade. */
  extraOf(objectId: number): number {
    for (const slot of this.mine.slots) if (slot?.objectId === objectId) return slot.count;
    return 0;
  }

  /** The item in a side's slot: the own from `own`, the partner's from its inventory. */
  itemAt(side: 'mine' | 'theirs', slot: number, own: ReadonlyMap<number, InventoryItem> | null): InventoryItem | undefined {
    const at = this[side].slots[slot];
    if (at === null || at === undefined) return undefined;
    return side === 'mine' ? own?.get(at.objectId) : this.partner?.items.get(at.objectId);
  }

  /** The first free own slot (the phone's tap, which has no slot under a pointer), or -1. */
  firstFreeSlot(): number {
    return this.mine.slots.findIndex((slot) => slot === null);
  }

  /** `TradeClear` on both sides. */
  clear(): void {
    this.partnerId = null;
    this.partnerName = '';
    this.partner = null;
    this.mine = emptySide();
    this.theirs = emptySide();
    this.confirming = false;
    this.waiting = false;
  }

  /** A world message about `objectId`; the events for the windows. */
  apply(objectId: number, message: TradeMessage, ctx: TradeContext): TradeEvent[] {
    switch (message.type) {
      case 'confirmTrade': {
        const name = ctx.nameOf(objectId);
        if (name === '') return []; // `prj.GetMover( objid )` not in view
        // a trade or a request already open: BLOCK 5 (:2569-2581)
        if (this.open || ctx.requestOpen()) return [{ kind: 'refuse', gu: 5, askerName: name }];
        // 2026-11-10: the Summon Angel window open: BLOCK 8 (:2589-2595)
        if (ctx.summonAngelOpen?.() === true) return [{ kind: 'refuse', gu: 8, askerName: name }];
        return [{ kind: 'request', askerId: objectId, name }];
      }
      case 'confirmTradeCancel':
        return [{ kind: 'line', tid: 'TID_GAME_TRADECANCEL' }];
      case 'trade': {
        const name = ctx.nameOf(objectId);
        if (name === '') return []; // `IsValidObj( pTrader )`
        this.clear();
        this.partnerId = objectId;
        this.partnerName = name;
        this.partner = containerOf(message);
        return [{ kind: 'opened' }, { kind: 'changed' }];
      }
      case 'tradePut': {
        if (!this.open) return [];
        const own = objectId === ctx.ownObjectId;
        // `TradeSetItem( nId, i, nItemNum )`: only an item the side has (GetItemId); the slot index is the server's
        if (message.slot >= MAX_TRADE) return [];
        if (!own && this.partner?.items.has(message.itemObjectId) !== true) return [];
        (own ? this.mine : this.theirs).slots[message.slot] = { objectId: message.itemObjectId, count: message.count };
        return [{ kind: 'changed' }];
      }
      case 'tradePull': {
        if (!this.open || message.slot >= MAX_TRADE) return [];
        (objectId === ctx.ownObjectId ? this.mine : this.theirs).slots[message.slot] = null;
        return [{ kind: 'changed' }];
      }
      case 'tradePutError':
        return [{ kind: 'box', tid: 'TID_DIAG_0054' }];
      case 'tradePutGold': {
        if (!this.open) return [];
        if (objectId === ctx.ownObjectId) {
          this.mine.gold = message.gold;
          return [{ kind: 'ownGold', delta: -message.gold }, { kind: 'changed' }];
        }
        this.theirs.gold = message.gold;
        return [{ kind: 'changed' }];
      }
      case 'tradeOk': {
        if (!this.open) return [];
        if (objectId === ctx.ownObjectId) {
          this.mine.ok = true;
          return [{ kind: 'changed' }];
        }
        this.theirs.ok = true;
        return [{ kind: 'changed' }, { kind: 'line', tid: 'TID_GAME_TRADEACCPET', args: [this.partnerName] }];
      }
      case 'tradeLastConfirm': {
        // the box opens whatever the window (:2839-2840); the OKs are checked when it is there
        this.confirming = true;
        this.waiting = false;
        if (this.open) { this.mine.ok = true; this.theirs.ok = true; }
        return [{ kind: 'lastConfirm' }, { kind: 'changed' }];
      }
      case 'tradeLastConfirmOk': {
        if (objectId === ctx.ownObjectId) {
          if (!this.confirming) return [];
          this.waiting = true;
          return [{ kind: 'waitApproval' }];
        }
        if (!this.open) return [];
        return [{ kind: 'line', tid: 'TID_GAME_FINALCOMFIRM', args: [this.partnerName], colorTid: 'TID_GAME_TRADEACCPET' }];
      }
      case 'tradeConsent': {
        // `TradeConsent` does nothing without the partner (:132-135)
        if (!this.open || this.partner === null) return [];
        const consent: TradeEvent = {
          kind: 'consent', mine: this.mine.slots, theirs: this.theirs.slots, partner: this.partner, gold: this.theirs.gold,
        };
        this.clear();
        return [consent, { kind: 'closed' }];
      }
      case 'tradeCancel': {
        this.clear();
        const events: TradeEvent[] = [{ kind: 'closed' }];
        if (message.mode !== 0) {
          if (message.playerId !== ctx.ownPlayerId) events.push({ kind: 'box', tid: 'TID_DIAG_0002' });
        } else {
          events.push({ kind: 'box', tid: 'TID_DIAG_0003' });
        }
        return events;
      }
    }
  }

  /** DEL_OBJ: the partner gone closes every trade window, with no message (`OnRemoveObj`, :1676-1708). */
  removed(objectId: number): TradeEvent[] {
    if (objectId !== this.partnerId) return [];
    this.clear();
    return [{ kind: 'closed' }];
  }
}

/**
 * `CDPClient::OnBlock` (:8336-8392), the trade's lines: 3 TID_GAME_TRADEDENY and 4 TID_GAME_REPAIR_NOTTRADE with the name
 * (4 in TRADEDENY's colour), 5 TID_GAME_YETTRADE, 8 TID_GAME_TRADELIMITPC; none for the others.
 */
export function blockLine(message: MessageOf<'block'>): TradeEvent | null {
  switch (message.gu) {
    case 3: return { kind: 'line', tid: 'TID_GAME_TRADEDENY', args: [message.name] };
    case 4: return { kind: 'line', tid: 'TID_GAME_REPAIR_NOTTRADE', args: [message.name], colorTid: 'TID_GAME_TRADEDENY' };
    case 5: return { kind: 'line', tid: 'TID_GAME_YETTRADE' };
    case 8: return { kind: 'line', tid: 'TID_GAME_TRADELIMITPC' };
    default: return null;
  }
}

/** What a drop on the own grid does (`CWndTradeCtrl::OnDropIcon`, `WndTradeCtrl.cpp:108-174`). */
export type DropAction =
  | { kind: 'none' }
  /** The quantity box for a stack (`m_nItemNum > 1`), preset to the whole stack. */
  | { kind: 'quantity'; slot: number; objectId: number; count: number }
  /** TRADEPUT of one. */
  | { kind: 'put'; slot: number; objectId: number }
  /** The penya box, preset to all the own penya (only while the own trade penya is 0). */
  | { kind: 'gold'; gold: number };

/** ITEM_EXPIRED: `CItemElem::expired` (`_Common/Item.h:119`). */
const EXPIRED = 0x01;

/**
 * A drop on the own grid's `slot`: an item (`objectId`) or the penya (`gold`, the own penya). Nothing while the quantity
 * box or the final box is open, for an expired item, or on a taken slot; a stack asks its count first.
 */
export function dropAction(
  state: TradeState, slot: number, what: { objectId: number; item: InventoryItem | undefined } | { gold: number },
  boxOpen: boolean,
): DropAction {
  if (!state.open || boxOpen || state.confirming || slot < 0 || slot >= MAX_TRADE) return { kind: 'none' };
  if ('gold' in what) return state.mine.gold === 0 ? { kind: 'gold', gold: what.gold } : { kind: 'none' };
  const item = what.item;
  if (item === undefined || ((item.flag ?? 0) & EXPIRED) !== 0) return { kind: 'none' };
  if (state.mine.slots[slot] !== null) return { kind: 'none' };
  if (item.count > 1) return { kind: 'quantity', slot, objectId: what.objectId, count: item.count };
  return { kind: 'put', slot, objectId: what.objectId };
}

/**
 * The quantity box's OK (`CWndTradeGold::OnChildNotify`, `WndField.cpp:8493-8541`): `_ttoi` of the field, at least 1,
 * at most `max` (the stack, or the own penya). 0 when `max` is 0 (no penya: nothing sent).
 */
export function quantityOf(text: string, max: number): number {
  const parsed = Number.parseInt(text.trim(), 10);
  let n = Number.isFinite(parsed) ? parsed : 0;
  if (n < 1) n = 1;
  if (n > max) n = max;
  return n;
}

/** The penya as the trade window writes it (`OnDraw`, :8979-8998): a comma every three digits. */
export function penyaText(gold: number): string {
  const digits = String(Math.trunc(gold));
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  return (negative ? '-' : '') + body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
