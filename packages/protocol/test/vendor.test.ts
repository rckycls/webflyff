// 2026-11-10: the personal shop's packets (world/vendor.ts) against the world server's writers (testkit/vendor.ts) and
// the senders' byte layouts (Neuz/DPClient.cpp:13756-13796, :15028-15052).
import { describe, expect, it } from 'vitest';
import {
  ArReader, ProtocolError, VendorMessageType, VendorPacket, WORLD_READERS, decodeWorldPacket, encodeBuyPVendorItem,
  encodeChatting, encodeCloseChattingRoom, encodeEnterChattingRoom, encodeOpenChattingRoom, encodePVendorClose,
  encodePVendorOpen, encodeQueryPVendorItem, encodeRegisterPVendorItem, encodeUnregisterPVendorItem,
} from '../src/index';
import {
  writeChattingDelete, writeChattingEnter, writeChattingLine, writeChattingNew, writeChattingRemove, writeChattingState,
  writePVendorClose, writePVendorItemNum, writePVendorItems, writePVendorOpen, writeRegisterPVendorItem,
  writeUnregisterPVendorItem,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';

const read = (message: ScriptMessage): unknown => {
  const reader = WORLD_READERS.get(message.type);
  if (reader === undefined) throw new Error(`no reader for ${message.type}`);
  const r = new ArReader(message.fields);
  const value = reader(r, { objectId: message.objectId, playerObjectId: 1 });
  r.expectEnd();
  return value;
};

describe('the shop snapshots', () => {
  it('reads the title, the close and the own slots', () => {
    expect(read(writePVendorOpen(7, 'Cheap potions'))).toEqual({ type: 'pvendorOpen', title: 'Cheap potions' });
    expect(read(writePVendorClose(7, true))).toEqual({ type: 'pvendorClose', clearTitle: true });
    expect(read(writePVendorClose(7, false))).toEqual({ type: 'pvendorClose', clearTitle: false });
    expect(read(writeRegisterPVendorItem(7, 3, 12, 5, 1500))).toEqual({
      type: 'registerPVendorItem', slot: 3, itemType: 0, objectId: 12, count: 5, cost: 1500,
    });
    expect(read(writeUnregisterPVendorItem(7, 19))).toEqual({ type: 'unregisterPVendorItem', slot: 19 });
    expect(read(writePVendorItemNum(7, 2, 0, 'Buyer'))).toEqual({ type: 'pvendorItemNum', slot: 2, left: 0, buyer: 'Buyer' });
  });

  it("reads a shop's items with their counts, prices and the room state", () => {
    const items = [
      { slot: 0, item: { objectId: 4, itemId: 2800, count: 20 }, count: 10, cost: 120 },
      { slot: 13, item: { objectId: 9, itemId: 21, count: 1, abilityOption: 3 }, count: 1, cost: 2_000_000_000 },
    ];
    expect(read(writePVendorItems(7, items, true))).toEqual({ type: 'pvendorItems', items, chatting: true });
    expect(read(writePVendorItems(7, [], false))).toEqual({ type: 'pvendorItems', items: [], chatting: false });
  });

  it('refuses a slot past MAX_VENDITEM or given twice', () => {
    expect(() => read(writeRegisterPVendorItem(7, 30, 1, 1, 1))).toThrow(ProtocolError);
    const twice = [
      { slot: 1, item: { objectId: 4, itemId: 2800, count: 1 }, count: 1, cost: 1 },
      { slot: 1, item: { objectId: 5, itemId: 2800, count: 1 }, count: 1, cost: 1 },
    ];
    expect(() => read(writePVendorItems(7, twice, false))).toThrow(ProtocolError);
  });

  it("reads the chat room's six kinds", () => {
    const members = [{ playerId: 500, name: 'Webby' }, { playerId: 600, name: 'Seller' }];
    expect(read(writeChattingNew(1, members))).toEqual({ type: 'chattingNew', members });
    expect(read(writeChattingEnter(1, members[0]!))).toEqual({ type: 'chattingEnter', member: members[0] });
    expect(read(writeChattingDelete(1))).toEqual({ type: 'chattingDelete' });
    expect(read(writeChattingRemove(1, 600))).toEqual({ type: 'chattingRemove', playerId: 600 });
    expect(read(writeChattingLine(1, 600, 'hello'))).toEqual({ type: 'chattingLine', playerId: 600, text: 'hello' });
    expect(read(writeChattingState(1, false))).toEqual({ type: 'chattingState', open: false });
  });

  it('registers every reader', () => {
    for (const type of Object.values(VendorMessageType)) expect(WORLD_READERS.has(type)).toBe(true);
  });
});

describe('the shop senders', () => {
  const head = (bytes: Uint8Array, type: number): ArReader => {
    const r = new ArReader(bytes);
    r.u32(); // DPID_UNKNOWN
    expect(r.u32()).toBe(type);
    return r;
  };

  it('write the fields as Neuz does', () => {
    let r = head(encodePVendorOpen('My shop name'), VendorPacket.PVENDOR_OPEN);
    expect(r.string(48)).toBe('My shop name'); r.expectEnd();
    r = head(encodePVendorClose(77), VendorPacket.PVENDOR_CLOSE);
    expect(r.u32()).toBe(77); r.expectEnd();
    r = head(encodeRegisterPVendorItem(19, 41, 3, 2_147_483_647), VendorPacket.REGISTER_PVENDOR_ITEM);
    expect([r.u8(), r.u8(), r.u8(), r.i16(), r.i32()]).toEqual([19, 0, 41, 3, 2_147_483_647]); r.expectEnd();
    r = head(encodeUnregisterPVendorItem(4), VendorPacket.UNREGISTER_PVENDOR_ITEM);
    expect(r.u8()).toBe(4); r.expectEnd();
    r = head(encodeQueryPVendorItem(88), VendorPacket.QUERY_PVENDOR_ITEM);
    expect(r.u32()).toBe(88); r.expectEnd();
    r = head(encodeBuyPVendorItem(88, 2, 2800, 7), VendorPacket.BUY_PVENDOR_ITEM);
    expect([r.u32(), r.u8(), r.u32(), r.i16()]).toEqual([88, 2, 2800, 7]); r.expectEnd();
    r = head(encodeEnterChattingRoom(600), VendorPacket.ENTERCHTTING);
    expect(r.u32()).toBe(600); r.expectEnd();
    r = head(encodeChatting('hi there'), VendorPacket.CHATTING);
    expect(r.string(1024)).toBe('hi there'); r.expectEnd();
    head(encodeOpenChattingRoom(), VendorPacket.OPENCHATTINGROOM).expectEnd();
    head(encodeCloseChattingRoom(), VendorPacket.CLOSECHATTINGROOM).expectEnd();
  });

  it('refuse what the server would not take', () => {
    expect(() => encodeRegisterPVendorItem(20, 1, 1, 1)).toThrow(RangeError);
    expect(() => encodeRegisterPVendorItem(0, 1, 0, 1)).toThrow(RangeError);
    expect(() => encodeRegisterPVendorItem(0, 1, 1, 0)).toThrow(RangeError);
    expect(() => encodeBuyPVendorItem(1, 0, 2800, 0)).toThrow(RangeError);
    expect(() => encodePVendorOpen('')).toThrow(RangeError);
  });

  it('are read back by the pretend servers', () => {
    expect(decodeWorldPacket(encodeBuyPVendorItem(88, 2, 2800, 7))).toEqual({ type: 'buyPVendorItem', vendorId: 88, slot: 2, itemId: 2800, count: 7 });
    expect(decodeWorldPacket(encodePVendorOpen('A fine shop'))).toEqual({ type: 'pvendorOpenRequest', title: 'A fine shop' });
    expect(decodeWorldPacket(encodeRegisterPVendorItem(1, 5, 2, 99))).toEqual({
      type: 'registerPVendorItemRequest', slot: 1, itemType: 0, objectId: 5, count: 2, cost: 99,
    });
    expect(decodeWorldPacket(encodeCloseChattingRoom())).toEqual({ type: 'closeChattingRoom' });
  });
});
