// 2026-11-10: the player trade's packets (trade research §7), read as Neuz's handlers read them and written as its
// senders write them.
import { describe, expect, it } from 'vitest';
import {
  NULL_ID, TradeMessageType, TradePacket, WORLD_READERS, decodeWorldPacket, encodeConfirmTrade, encodeConfirmTradeCancel,
  encodeTrade, encodeTradeCancel, encodeTradeConfirm, encodeTradeOk, encodeTradePull, encodeTradePut, encodeTradePutGold,
  isTradeMessage, readBundle,
} from '../src/index';
import {
  encodeBundle, writeConfirmTrade, writeConfirmTradeCancel, writeTrade, writeTradeCancel, writeTradeConsent,
  writeTradeLastConfirm, writeTradeLastConfirmOk, writeTradeOk, writeTradePull, writeTradePut, writeTradePutError,
  writeTradePutGold,
} from '@flyffweb/testkit';

const SELF = 9;
const OTHER = 40;

describe('the trade snapshots', () => {
  it('reads TRADE with the partner inventory, and each other trade snapshot', () => {
    const items = [
      { objectId: 0, itemId: 21, count: 1 },
      { objectId: 3, itemId: 2029, count: 77, flag: 2 },
    ];
    const bundle = encodeBundle(0xffffff00, SELF, [
      writeTrade(OTHER, 70002, items),
      writeConfirmTrade(OTHER),
      writeConfirmTradeCancel(SELF),
      writeTradePut(OTHER, 4, 3, 10),
      writeTradePutError(SELF),
      writeTradePull(OTHER, 4),
      writeTradePutGold(OTHER, 2_000_000_000),
      writeTradeCancel(NULL_ID, 70001),
      writeTradeCancel(OTHER, 70002, 1),
      writeTradeOk(OTHER),
      writeTradeConsent(),
      writeTradeLastConfirm(),
      writeTradeLastConfirmOk(SELF),
    ]);
    const result = readBundle(bundle, WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    const trade = result.messages[0]!;
    expect(trade.objectId).toBe(OTHER);
    expect(trade.value).toMatchObject({ type: 'trade', playerId: 70002, items });
    if (trade.value.type !== 'trade') throw new Error('not a trade');
    expect(trade.value.slots.slice(0, 42)).toEqual(Array.from({ length: 42 }, (_, i) => i));
    expect(trade.value.slots.slice(42)).toEqual(Array.from({ length: 31 }, () => NULL_ID));
    expect(result.messages.slice(1).map((m) => [m.objectId, m.value])).toEqual([
      [OTHER, { type: 'confirmTrade' }],
      [SELF, { type: 'confirmTradeCancel' }],
      [OTHER, { type: 'tradePut', slot: 4, itemType: 0, itemObjectId: 3, count: 10 }],
      [SELF, { type: 'tradePutError' }],
      [OTHER, { type: 'tradePull', slot: 4 }],
      [OTHER, { type: 'tradePutGold', gold: 2_000_000_000 }],
      [NULL_ID, { type: 'tradeCancel', playerId: 70001, mode: 0 }],
      [OTHER, { type: 'tradeCancel', playerId: 70002, mode: 1 }],
      [OTHER, { type: 'tradeOk' }],
      [NULL_ID, { type: 'tradeConsent' }],
      [NULL_ID, { type: 'tradeLastConfirm' }],
      [SELF, { type: 'tradeLastConfirmOk' }],
    ]);
    for (const type of Object.values(TradeMessageType)) expect(WORLD_READERS.has(type)).toBe(true);
    for (const message of result.messages) expect(isTradeMessage(message.value)).toBe(true);
    expect(isTradeMessage({ type: 'chat' })).toBe(false);
  });
});

describe("the client's trade packets", () => {
  it('writes each as its sender does, and reads it back for the pretend servers', () => {
    const cases: Array<[Uint8Array, number, number[], object]> = [
      [encodeConfirmTrade(OTHER), TradePacket.CONFIRMTRADE, [OTHER, 0, 0, 0], { type: 'confirmTradeRequest', targetId: OTHER }],
      [encodeConfirmTradeCancel(OTHER), TradePacket.CONFIRMTRADECANCEL, [OTHER, 0, 0, 0], { type: 'confirmTradeCancelRequest', askerId: OTHER }],
      [encodeTrade(OTHER), TradePacket.TRADE, [OTHER, 0, 0, 0], { type: 'tradeRequest', askerId: OTHER }],
      [encodeTradePut(2, 0, 7, 300), TradePacket.TRADEPUT, [2, 0, 7, 0x2c, 0x01],
        { type: 'tradePutRequest', slot: 2, itemType: 0, itemObjectId: 7, count: 300 }],
      [encodeTradePut(3, 0, 8), TradePacket.TRADEPUT, [3, 0, 8, 1, 0], { type: 'tradePutRequest', slot: 3, itemType: 0, itemObjectId: 8, count: 1 }],
      [encodeTradePull(5), TradePacket.TRADEPULL, [5], { type: 'tradePullRequest', slot: 5 }],
      [encodeTradeOk(), TradePacket.TRADEOK, [], { type: 'tradeOkRequest' }],
      [encodeTradeCancel(), TradePacket.TRADECANCEL, [0, 0, 0, 0], { type: 'tradeCancelRequest', mode: 0 }],
      [encodeTradePutGold(1234), TradePacket.TRADEPUTGOLD, [0xd2, 0x04, 0, 0], { type: 'tradePutGoldRequest', gold: 1234 }],
      [encodeTradeConfirm(), TradePacket.TRADECONFIRM, [], { type: 'tradeConfirmRequest' }],
    ];
    for (const [bytes, type, fields, decoded] of cases) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(0, true)).toBe(0xffffffff); // DPID_UNKNOWN
      expect(view.getUint32(4, true)).toBe(type);
      expect([...bytes.slice(8)]).toEqual(fields);
      expect(decodeWorldPacket(bytes)).toEqual(decoded);
    }
  });
});
