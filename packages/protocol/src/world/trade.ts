// The player trade's packets (2026-11-10, docs/superpowers/specs/2026-11-10-trade-research.md §7), both ways. The reads
// copy Neuz's handlers, the writes its senders; the server's writers are `CUser::Add*` (`WORLDSERVER/User.cpp:798-908`).
//
//   snapshots   CDPClient::OnTrade               Neuz/DPClient.cpp:2517-2544   TRADE 0x0007: u_long idPlayer, the other's
//                                                                            CItemContainer (own.ts `readItemContainer`)
//               OnConfirmTrade                   :2546-2602                    CONFIRMTRADE 0x0022: nothing (the asker is
//                                                                            the snapshot's object)
//               OnConfirmTradeCancel             :2604-2607                    CONFIRMTRADECANCEL 0x0023: nothing
//               OnTradePut                       :2610-2623                    TRADEPUT 0x0008: BYTE slot, type, id; short n
//               OnTradePutError                  :2625-2629                    TRADEPUTERROR 0x0005: nothing
//               OnTradePull                      :2631-2642                    TRADEPULL 0x0009: BYTE slot
//               OnTradePutGold                   :2644-2669                    TRADEPUTGOLD 0x0020: DWORD penya
//               OnTradeCancel                    :2729-2763                    TRADECANCEL 0x000b: u_long idPlayer, int mode
//               OnTradelastConfirmOk             :2765-2793                    TRADELASTCONFIRMOK 0x002c: nothing
//               OnTradeOk                        :2795-2819                    TRADEOK 0x000a: nothing
//               OnTradeConsent                   :2821-2835                    TRADECONSENT 0x000c: nothing
//               OnTradelastConfirm               :2837-2852                    TRADELASTCONFIRM 0x002b: nothing
//   senders     SendTrade ... SendTradeConfirm   :9411-9469, SendTradeOk :2693-2696

import type { ArReader } from '../ar/ArReader';
import { readItemContainer } from './own';
import { clientPacket } from './packet';
import type { InventoryItem } from './types';

/** The trade's packet types, client to world (`Source/_Network/MsgHdr.h:155-164`). */
export const TradePacket = {
  TRADECONFIRM: 0x00ff002f,
  TRADE: 0x00ff00a0,
  TRADEPUT: 0x00ff00a1,
  TRADEPULL: 0x00ff00a2,
  TRADEOK: 0x00ff00a3,
  TRADECANCEL: 0x00ff00a4,
  TRADEPUTGOLD: 0x00ff00a5,
  CONFIRMTRADE: 0x00ff00a7,
  CONFIRMTRADECANCEL: 0x00ff00a8,
} as const;

/** The trade's snapshot types (`MsgHdr.h:887-936`). */
export const TradeMessageType = {
  TRADEPUTERROR: 0x0005,
  TRADE: 0x0007,
  TRADEPUT: 0x0008,
  TRADEPULL: 0x0009,
  TRADEOK: 0x000a,
  TRADECANCEL: 0x000b,
  TRADECONSENT: 0x000c,
  TRADEPUTGOLD: 0x0020,
  CONFIRMTRADE: 0x0022,
  CONFIRMTRADECANCEL: 0x0023,
  TRADELASTCONFIRM: 0x002b,
  TRADELASTCONFIRMOK: 0x002c,
} as const;

/** `MAX_TRADE` (`_Common/ProjectCmn.h:11`): the slots of each side. */
export const MAX_TRADE = 25;

/**
 * The trade's snapshots. The object each is about is the snapshot's object ID: the partner for `trade`, the asker for
 * `confirmTrade`, the player who acted for `tradePut`, `tradePull`, `tradePutGold`, `tradeOk`, `tradeCancel` (`NULL_ID`
 * when the final exchange failed) and `tradeLastConfirmOk`.
 */
export type TradeMessage =
  /** `playerId` the accepting player's `idPlayer`; `slots` and `items` the partner's whole inventory. */
  | { type: 'trade'; playerId: number; slots: number[]; items: InventoryItem[] }
  | { type: 'confirmTrade' }
  | { type: 'confirmTradeCancel' }
  | { type: 'tradePut'; slot: number; itemType: number; itemObjectId: number; count: number }
  | { type: 'tradePutError' }
  | { type: 'tradePull'; slot: number }
  | { type: 'tradePutGold'; gold: number }
  | { type: 'tradeCancel'; playerId: number; mode: number }
  | { type: 'tradeOk' }
  | { type: 'tradeConsent' }
  | { type: 'tradeLastConfirm' }
  | { type: 'tradeLastConfirmOk' };

export function readTrade(r: ArReader): TradeMessage {
  const playerId = r.u32();
  const { slots, items } = readItemContainer(r);
  return { type: 'trade', playerId, slots, items };
}

export function readTradePut(r: ArReader): TradeMessage {
  const slot = r.u8(), itemType = r.u8(), itemObjectId = r.u8();
  return { type: 'tradePut', slot, itemType, itemObjectId, count: r.i16() };
}

export const readTradePull = (r: ArReader): TradeMessage => ({ type: 'tradePull', slot: r.u8() });
export const readTradePutGold = (r: ArReader): TradeMessage => ({ type: 'tradePutGold', gold: r.u32() });

export function readTradeCancel(r: ArReader): TradeMessage {
  const playerId = r.u32();
  return { type: 'tradeCancel', playerId, mode: r.i32() };
}

/** The snapshot readers of the trade, for `WORLD_READERS`. */
export const TRADE_READERS: ReadonlyArray<[number, (r: ArReader) => TradeMessage]> = [
  [TradeMessageType.TRADE, readTrade],
  [TradeMessageType.CONFIRMTRADE, () => ({ type: 'confirmTrade' })],
  [TradeMessageType.CONFIRMTRADECANCEL, () => ({ type: 'confirmTradeCancel' })],
  [TradeMessageType.TRADEPUT, readTradePut],
  [TradeMessageType.TRADEPUTERROR, () => ({ type: 'tradePutError' })],
  [TradeMessageType.TRADEPULL, readTradePull],
  [TradeMessageType.TRADEPUTGOLD, readTradePutGold],
  [TradeMessageType.TRADECANCEL, readTradeCancel],
  [TradeMessageType.TRADEOK, () => ({ type: 'tradeOk' })],
  [TradeMessageType.TRADECONSENT, () => ({ type: 'tradeConsent' })],
  [TradeMessageType.TRADELASTCONFIRM, () => ({ type: 'tradeLastConfirm' })],
  [TradeMessageType.TRADELASTCONFIRMOK, () => ({ type: 'tradeLastConfirmOk' })],
];

/** Whether a world message is one of the trade's. */
export function isTradeMessage(message: { type: string }): message is TradeMessage {
  return TRADE_TYPES.has(message.type);
}
const TRADE_TYPES: ReadonlySet<string> = new Set([
  'trade', 'confirmTrade', 'confirmTradeCancel', 'tradePut', 'tradePutError', 'tradePull', 'tradePutGold', 'tradeCancel',
  'tradeOk', 'tradeConsent', 'tradeLastConfirm', 'tradeLastConfirmOk',
]);

// --- the client's packets ---

/** `SendConfirmTrade( pTrader )` (`DPClient.cpp:9421-9429`): the menu's Trade, the asked player's object ID. */
export const encodeConfirmTrade = (targetId: number): Uint8Array =>
  clientPacket(TradePacket.CONFIRMTRADE).u32(targetId).toBytes();

/** `SendConfirmTradeCancel( objid )` (:9431-9436): the request's Cancel, the asker's object ID. */
export const encodeConfirmTradeCancel = (askerId: number): Uint8Array =>
  clientPacket(TradePacket.CONFIRMTRADECANCEL).u32(askerId).toBytes();

/** `SendTrade( pTrader )` (:9411-9419): the request's OK, the asker's object ID. */
export const encodeTrade = (askerId: number): Uint8Array => clientPacket(TradePacket.TRADE).u32(askerId).toBytes();

/** `SendTradePut( i, nItemType, nId, ItemNum = 1 )` (:9438-9443). */
export const encodeTradePut = (slot: number, itemType: number, itemObjectId: number, count = 1): Uint8Array =>
  clientPacket(TradePacket.TRADEPUT).u8(slot).u8(itemType).u8(itemObjectId).i16(count).toBytes();

/** `SendTradePull( i )` (:9445-9450): kept for completeness; Neuz never calls it. */
export const encodeTradePull = (slot: number): Uint8Array => clientPacket(TradePacket.TRADEPULL).u8(slot).toBytes();

/** `SendTradeOk()` (:2693-2696): the type alone. */
export const encodeTradeOk = (): Uint8Array => clientPacket(TradePacket.TRADEOK).toBytes();

/** `SendTradeCancel( nMode = 0 )` (:9459-9464). */
export const encodeTradeCancel = (mode = 0): Uint8Array => clientPacket(TradePacket.TRADECANCEL).i32(mode).toBytes();

/** `SendTradePutGold( dwGold )` (:9452-9457). */
export const encodeTradePutGold = (gold: number): Uint8Array =>
  clientPacket(TradePacket.TRADEPUTGOLD).u32(gold).toBytes();

/** `SendTradeConfirm()` (:9466-9469): the final box's Yes, the type alone. */
export const encodeTradeConfirm = (): Uint8Array => clientPacket(TradePacket.TRADECONFIRM).toBytes();

/** For the pretend servers: a client packet of the trade after its type, by the encoders' parameter names. */
export type TradeRequestPacket =
  | { type: 'confirmTradeRequest'; targetId: number }
  | { type: 'confirmTradeCancelRequest'; askerId: number }
  | { type: 'tradeRequest'; askerId: number }
  | { type: 'tradePutRequest'; slot: number; itemType: number; itemObjectId: number; count: number }
  | { type: 'tradePullRequest'; slot: number }
  | { type: 'tradeOkRequest' }
  | { type: 'tradeCancelRequest'; mode: number }
  | { type: 'tradePutGoldRequest'; gold: number }
  | { type: 'tradeConfirmRequest' };

export function readTradeRequestPacket(packetType: number, r: ArReader): TradeRequestPacket | null {
  switch (packetType) {
    case TradePacket.CONFIRMTRADE:
      return { type: 'confirmTradeRequest', targetId: r.u32() };
    case TradePacket.CONFIRMTRADECANCEL:
      return { type: 'confirmTradeCancelRequest', askerId: r.u32() };
    case TradePacket.TRADE:
      return { type: 'tradeRequest', askerId: r.u32() };
    case TradePacket.TRADEPUT: {
      const slot = r.u8(), itemType = r.u8(), itemObjectId = r.u8();
      return { type: 'tradePutRequest', slot, itemType, itemObjectId, count: r.i16() };
    }
    case TradePacket.TRADEPULL:
      return { type: 'tradePullRequest', slot: r.u8() };
    case TradePacket.TRADEOK:
      return { type: 'tradeOkRequest' };
    case TradePacket.TRADECANCEL:
      return { type: 'tradeCancelRequest', mode: r.i32() };
    case TradePacket.TRADEPUTGOLD:
      return { type: 'tradePutGoldRequest', gold: r.u32() };
    case TradePacket.TRADECONFIRM:
      return { type: 'tradeConfirmRequest' };
    default:
      return null;
  }
}
