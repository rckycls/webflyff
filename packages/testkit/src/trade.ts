// 2026-11-10: the player trade's snapshots as the world server writes them (`CUser::AddTrade` ... `AddTradeCancel`,
// `WORLDSERVER/User.cpp:798-908`; trade research §7), in the order of the readers (`@flyffweb/protocol` world/trade.ts).

import { ArWriter, NULL_ID, TradeMessageType } from '@flyffweb/protocol';
import type { InventoryItem } from '@flyffweb/protocol';
import { writeItemContainer } from './world';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/**
 * TRADE (`CUser::AddTrade`, :798-808): about the partner, the accepting player's `idPlayer`, then the partner's inventory
 * (`items` in rising object ID order; the bag's positions hold their own slot).
 */
export function writeTrade(partnerId: number, acceptingPlayerId: number, items: readonly InventoryItem[]): ScriptMessage {
  const w = new ArWriter().u32(acceptingPlayerId);
  writeItemContainer(w, items);
  return scripted(partnerId, TradeMessageType.TRADE, w);
}

/** CONFIRMTRADE (`AddComfirmTrade`, :810-817): about the asker. */
export const writeConfirmTrade = (askerId: number): ScriptMessage => scripted(askerId, TradeMessageType.CONFIRMTRADE);

/** CONFIRMTRADECANCEL (`AddComfirmTradeCancel`, :819-826). */
export const writeConfirmTradeCancel = (objectId: number): ScriptMessage =>
  scripted(objectId, TradeMessageType.CONFIRMTRADECANCEL);

/** TRADEPUT (`AddTradePut`, :850-858): about the player who put the item; its slot, type, object ID and count. */
export const writeTradePut = (putterId: number, slot: number, itemObjectId: number, count: number, itemType = 0): ScriptMessage =>
  scripted(putterId, TradeMessageType.TRADEPUT, new ArWriter().u8(slot).u8(itemType).u8(itemObjectId).i16(count));

/** TRADEPUTERROR (`AddTradePutError`, :860-867): about the own player. */
export const writeTradePutError = (ownId: number): ScriptMessage => scripted(ownId, TradeMessageType.TRADEPUTERROR);

/** TRADEPULL (`AddTradePull`, :869-877). */
export const writeTradePull = (pullerId: number, slot: number): ScriptMessage =>
  scripted(pullerId, TradeMessageType.TRADEPULL, new ArWriter().u8(slot));

/** TRADEPUTGOLD (`AddTradePutGold`, :879-888). */
export const writeTradePutGold = (putterId: number, gold: number): ScriptMessage =>
  scripted(putterId, TradeMessageType.TRADEPUTGOLD, new ArWriter().u32(gold));

/** TRADECANCEL (`AddTradeCancel`, :899-908): about the canceller (`NULL_ID` for a failed exchange), its idPlayer, the mode. */
export const writeTradeCancel = (objectId: number, playerId: number, mode = 0): ScriptMessage =>
  scripted(objectId, TradeMessageType.TRADECANCEL, new ArWriter().u32(playerId).i32(mode));

/** TRADEOK (`AddTradeOk`, `WORLDSERVER/User.h:272`): about the player who pressed OK first. */
export const writeTradeOk = (objectId: number): ScriptMessage => scripted(objectId, TradeMessageType.TRADEOK);

/** TRADECONSENT (`AddTradeConsent`, `User.h:273`): about `NULL_ID`. */
export const writeTradeConsent = (): ScriptMessage => scripted(NULL_ID, TradeMessageType.TRADECONSENT);

/** TRADELASTCONFIRM (`AddTradelastConfirm`, `User.h:274`): about `NULL_ID`; both pressed OK. */
export const writeTradeLastConfirm = (): ScriptMessage => scripted(NULL_ID, TradeMessageType.TRADELASTCONFIRM);

/** TRADELASTCONFIRMOK (`AddTradelastConfirmOk`, `User.h:275`): about the player who pressed Yes first. */
export const writeTradeLastConfirmOk = (objectId: number): ScriptMessage =>
  scripted(objectId, TradeMessageType.TRADELASTCONFIRMOK);
