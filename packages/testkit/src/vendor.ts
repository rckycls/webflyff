// 2026-11-10: the personal shop's messages as the world server writes them (personal-shop research §5,
// `WORLDSERVER/User.cpp:922-975, :5406-5447, :6384-6505`), in the order of the readers (`@flyffweb/protocol` world/vendor.ts).

import { ArWriter, ChattingKind, VendorMessageType } from '@flyffweb/protocol';
import type { ChattingMember, VendorItem } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';
import { writeItemElem } from './world';

const scripted = (objectId: number, type: number, w: ArWriter): ScriptMessage => ({ objectId, type, fields: w.toBytes() });

/** PVENDOR_OPEN: `CUserMng::AddPVendorOpen` (:5406-5416), the seller's title to all in range. */
export const writePVendorOpen = (sellerId: number, title: string): ScriptMessage =>
  scripted(sellerId, VendorMessageType.PVENDOR_OPEN, new ArWriter().string(title));

/** PVENDOR_CLOSE: 1 to all in range when the shop shuts (:5418-5428); 0 to a buyer who left (`AddPVendorClose`, :940-947). */
export const writePVendorClose = (sellerId: number, clearTitle: boolean): ScriptMessage =>
  scripted(sellerId, VendorMessageType.PVENDOR_CLOSE, new ArWriter().u8(clearTitle ? 1 : 0));

/** REGISTER_PVENDOR_ITEM: `AddRegisterPVendorItem` (:931-938), to the seller. */
export const writeRegisterPVendorItem = (sellerId: number, slot: number, objectId: number, count: number, cost: number): ScriptMessage =>
  scripted(sellerId, VendorMessageType.REGISTER_PVENDOR_ITEM, new ArWriter().u8(slot).u8(0).u8(objectId).i16(count).i32(cost));

/** UNREGISTER_PVENDOR_ITEM: `AddUnregisterPVendorItem` (:922-929), to the seller. */
export const writeUnregisterPVendorItem = (sellerId: number, slot: number): ScriptMessage =>
  scripted(sellerId, VendorMessageType.UNREGISTER_PVENDOR_ITEM, new ArWriter().u8(slot));

/** PVENDOR_ITEM: `AddPVendorItem` (:949-975): the filled slots, each item, its count and price, and the room's state. */
export function writePVendorItems(sellerId: number, items: readonly VendorItem[], chatting: boolean): ScriptMessage {
  const w = new ArWriter().u8(items.length);
  for (const entry of items) {
    w.u8(entry.slot);
    writeItemElem(w, entry.item);
    w.i32(entry.count).i32(entry.cost);
  }
  w.i32(chatting ? 1 : 0);
  return scripted(sellerId, VendorMessageType.PVENDOR_ITEM, w);
}

/** PVENDOR_ITEM_NUM: `CUserMng::AddPVendorItemNum` (:5431-5447): the slot, what is left, the buyer. */
export const writePVendorItemNum = (sellerId: number, slot: number, left: number, buyer: string): ScriptMessage =>
  scripted(sellerId, VendorMessageType.PVENDOR_ITEM_NUM, new ArWriter().u8(slot).i16(left).string(buyer));

const chatting = (objectId: number, kind: number, w: ArWriter = new ArWriter()): ScriptMessage => {
  const head = new ArWriter().u8(kind).bytes(w.toBytes());
  return scripted(objectId, VendorMessageType.CHATTING, head);
};

/** CHATTING_NEWCHATTING: `AddNewChatting` (:6397-6427), every member. */
export function writeChattingNew(objectId: number, members: readonly ChattingMember[]): ScriptMessage {
  const w = new ArWriter().i32(members.length);
  for (const member of members) w.u32(member.playerId).string(member.name);
  return chatting(objectId, ChattingKind.NEWCHATTING, w);
}
export const writeChattingEnter = (objectId: number, member: ChattingMember): ScriptMessage =>
  chatting(objectId, ChattingKind.ENTERMEMBER, new ArWriter().u32(member.playerId).string(member.name));
export const writeChattingDelete = (objectId: number): ScriptMessage => chatting(objectId, ChattingKind.DELETECHATTING);
export const writeChattingRemove = (objectId: number, playerId: number): ScriptMessage =>
  chatting(objectId, ChattingKind.REMOVEMEMBER, new ArWriter().u32(playerId));
export const writeChattingLine = (objectId: number, playerId: number, text: string): ScriptMessage =>
  chatting(objectId, ChattingKind.CHATTING, new ArWriter().u32(playerId).string(text));
export const writeChattingState = (objectId: number, open: boolean): ScriptMessage =>
  chatting(objectId, ChattingKind.CHATTINGROOMSTATE, new ArWriter().i32(open ? 1 : 0));
