// The personal shop's packets (2026-11-10, personal-shop research §5): the player's own shop ("vendor") and its chat
// room, both ways. The reads copy Neuz's handlers; the writes copy its senders.
//
//   snapshots   CDPClient::OnPVendorOpen          Neuz/DPClient.cpp:13798-13844   PVENDOR_OPEN 0x0042: the title (MAX_VENDORNAME)
//               OnPVendorClose                    :13846-13933                    PVENDOR_CLOSE 0x0043: BYTE clear title
//               OnRegisterPVendorItem             :13952-13961                    REGISTER_PVENDOR_ITEM 0x0044: BYTE slot,
//                                                                               BYTE type, BYTE object id, short count, int price
//               OnPVendorItem                     :13998-14062                    PVENDOR_ITEM 0x0045: BYTE n, n x (BYTE slot,
//                                                                               CItemElem, int count, int price), BOOL room open
//               OnPVendorItemNum                  :13963-13996                    PVENDOR_ITEM_NUM 0x0046: BYTE slot, short
//                                                                               left, the buyer (MAX_PLAYER, __MOD_VENDOR)
//               OnUnregisterPVendorItem           :13935-13950                    UNREGISTER_PVENDOR_ITEM 0x0047: BYTE slot
//               OnChatting                        :15054-15166                    CHATTING 0x007b: BYTE kind, then its fields
//   senders     SendPVendorOpen ... SendBuyPVendorItem   :13756-13796
//               SendEnterChattingRoom ... SendCloseChattingRoom   :15028-15052
//   server      CUser::AddPVendorItem ... (WORLDSERVER/User.cpp:922-975, :5406-5447, :6384-6505)

import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { chatBytes } from './chat';
import { readInventoryItem } from './own';
import { clientPacket } from './packet';
import type { InventoryItem } from './types';

/** The client's shop packet types (`Source/_Network/MsgHdr.h:166-171, :528-536`). */
export const VendorPacket = {
  PVENDOR_OPEN: 0x00ff00a9,
  PVENDOR_CLOSE: 0x00ff00aa,
  REGISTER_PVENDOR_ITEM: 0x00ff00ab,
  QUERY_PVENDOR_ITEM: 0x00ff00ac,
  BUY_PVENDOR_ITEM: 0x00ff00ad,
  UNREGISTER_PVENDOR_ITEM: 0x00ff00ae,
  ENTERCHTTING: 0xf000b054,
  CHATTING: 0xf000b055,
  OPENCHATTINGROOM: 0xf000b058,
  CLOSECHATTINGROOM: 0xf000b059,
} as const;

/** The shop's snapshot types (`MsgHdr.h:963-968, :1029`). */
export const VendorMessageType = {
  PVENDOR_OPEN: 0x0042,
  PVENDOR_CLOSE: 0x0043,
  REGISTER_PVENDOR_ITEM: 0x0044,
  PVENDOR_ITEM: 0x0045,
  PVENDOR_ITEM_NUM: 0x0046,
  UNREGISTER_PVENDOR_ITEM: 0x0047,
  CHATTING: 0x007b,
} as const;

/** The kinds of SNAPSHOTTYPE_CHATTING (`MsgHdr.h:1492-1497`). */
export const ChattingKind = {
  ENTERMEMBER: 0,
  NEWCHATTING: 1,
  DELETECHATTING: 2,
  REMOVEMEMBER: 3,
  CHATTING: 4,
  CHATTINGROOMSTATE: 5,
} as const;

/** `MAX_VENDITEM` (`_Common/ProjectCmn.h:12`): the server's slots, and the bound of every slot read. */
export const MAX_VENDITEM = 30;
/** `MAX_VENDOR_REVISION` (`ProjectCmn.h:41`): the slots the V8+ shop window shows and the server registers. */
export const MAX_VENDOR_REVISION = 20;
/** `MAX_VENDORNAME` (`ProjectCmn.h:14`): the title's buffer. */
export const MAX_VENDORNAME = 48;
/** `MAX_PLAYER` (`_Network/CmnHdr.h:486`), the buyer's name; `MAX_NAME` (`_Common/Mover.h:32`), a chat member's. */
const MAX_PLAYER = 42;
const MAX_NAME = 64;
/** `CChatting::m_idMember[MAX_CHATTINGMEMBER]` (`_Common/Chatting.h:7`): more is not a room. */
export const MAX_CHATTINGMEMBER = 512;
/** `sChat[1024]` (DPClient.cpp:15126-15129). */
const CHAT_BUFFER = 1024;

/** An item of a shop as PVENDOR_ITEM gives it: its slot, the item (a copy), the count up for sale and the unit price. */
export interface VendorItem {
  slot: number;
  item: InventoryItem;
  count: number;
  cost: number;
}

export interface ChattingMember {
  playerId: number;
  name: string;
}

export type VendorMessage =
  | { type: 'pvendorOpen'; title: string }
  /** `byClearTitle`: 1 when the shop shut (to all in range), 0 to a buyer who left (the title stays). */
  | { type: 'pvendorClose'; clearTitle: boolean }
  | { type: 'registerPVendorItem'; slot: number; itemType: number; objectId: number; count: number; cost: number }
  | { type: 'unregisterPVendorItem'; slot: number }
  | { type: 'pvendorItems'; items: VendorItem[]; chatting: boolean }
  | { type: 'pvendorItemNum'; slot: number; left: number; buyer: string }
  | { type: 'chattingEnter'; member: ChattingMember }
  | { type: 'chattingNew'; members: ChattingMember[] }
  | { type: 'chattingDelete' }
  | { type: 'chattingRemove'; playerId: number }
  | { type: 'chattingLine'; playerId: number; text: string }
  | { type: 'chattingState'; open: boolean };

function slotOf(r: ArReader, max = MAX_VENDITEM): number {
  const at = r.position(), slot = r.u8();
  if (slot >= max) throw new ProtocolError(`vendor slot ${slot} outside ${max}`, at);
  return slot;
}

// --- snapshots ---

export const readPVendorOpen = (r: ArReader): VendorMessage => ({ type: 'pvendorOpen', title: r.string(MAX_VENDORNAME) });

export const readPVendorClose = (r: ArReader): VendorMessage => ({ type: 'pvendorClose', clearTitle: r.u8() !== 0 });

export function readRegisterPVendorItem(r: ArReader): VendorMessage {
  const slot = slotOf(r), itemType = r.u8(), objectId = r.u8(), count = r.i16(), cost = r.i32();
  return { type: 'registerPVendorItem', slot, itemType, objectId, count, cost };
}

export const readUnregisterPVendorItem = (r: ArReader): VendorMessage => ({ type: 'unregisterPVendorItem', slot: slotOf(r) });

/**
 * PVENDOR_ITEM: `OnPVendorItem` keeps each item at its slot (`apItemVd[iIndex]`); a slot past MAX_VENDITEM or given twice is
 * not a shop. `CItemElem::Serialize` here carries the item's own id, which `readInventoryItem` keeps as `objectId`.
 */
export function readPVendorItems(r: ArReader): VendorMessage {
  const count = r.u8();
  if (count > MAX_VENDITEM) throw new ProtocolError(`${count} vendor items`, r.position() - 1);
  const items: VendorItem[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const at = r.position();
    const slot = slotOf(r);
    if (seen.has(slot)) throw new ProtocolError(`vendor slot ${slot} twice`, at);
    seen.add(slot);
    const item = readInventoryItem(r);
    const extra = r.i32(); // ar >> nExtra
    const cost = r.i32(); // ar >> m_nCost
    items.push({ slot, item, count: extra, cost });
  }
  const chatting = r.i32() !== 0; // ar >> g_Chatting.m_bState
  return { type: 'pvendorItems', items, chatting };
}

export function readPVendorItemNum(r: ArReader): VendorMessage {
  const slot = slotOf(r), left = r.i16();
  return { type: 'pvendorItemNum', slot, left, buyer: r.string(MAX_PLAYER) };
}

function readMembers(r: ArReader): ChattingMember[] {
  const at = r.position(), count = r.i32();
  if (count < 0 || count > MAX_CHATTINGMEMBER) throw new ProtocolError(`${count} chat members`, at);
  return Array.from({ length: count }, () => {
    const playerId = r.u32();
    return { playerId, name: r.string(MAX_NAME) };
  });
}

/** CHATTING: one message, its kind first (`OnChatting`, DPClient.cpp:15054-15166). */
export function readChatting(r: ArReader): VendorMessage {
  const at = r.position(), kind = r.u8();
  switch (kind) {
    case ChattingKind.ENTERMEMBER: {
      const playerId = r.u32();
      return { type: 'chattingEnter', member: { playerId, name: r.string(MAX_NAME) } };
    }
    case ChattingKind.NEWCHATTING:
      return { type: 'chattingNew', members: readMembers(r) };
    case ChattingKind.DELETECHATTING:
      return { type: 'chattingDelete' };
    case ChattingKind.REMOVEMEMBER:
      return { type: 'chattingRemove', playerId: r.u32() };
    case ChattingKind.CHATTING: {
      const playerId = r.u32();
      return { type: 'chattingLine', playerId, text: r.string(CHAT_BUFFER) };
    }
    case ChattingKind.CHATTINGROOMSTATE:
      return { type: 'chattingState', open: r.i32() !== 0 };
    default:
      throw new ProtocolError(`chatting kind ${kind}`, at);
  }
}

// --- senders ---

function integer(value: number, min: number, max: number, what: string): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`Invalid ${what}.`);
}

/** `SendPVendorOpen( szVendor )`: the title as typed (WndVendor.cpp:792). */
export function encodePVendorOpen(title: string): Uint8Array {
  const bytes = chatBytes(title, MAX_VENDORNAME - 1);
  return clientPacket(VendorPacket.PVENDOR_OPEN).i32(bytes.length).bytes(bytes).toBytes();
}

/** `SendPVendorClose( objidVendor )`: the own id for the seller, the seller's for a buyer. */
export const encodePVendorClose = (vendorId: number): Uint8Array =>
  clientPacket(VendorPacket.PVENDOR_CLOSE).u32(vendorId).toBytes();

/** `SendRegisterPVendorItem( iIndex, 0, (BYTE)objId, nNum, nCost )` (WndRegVend.cpp:347). */
export function encodeRegisterPVendorItem(slot: number, objectId: number, count: number, cost: number): Uint8Array {
  integer(slot, 0, MAX_VENDOR_REVISION - 1, 'shop slot'); integer(objectId, 0, 255, 'item');
  integer(count, 1, 32767, 'quantity'); integer(cost, 1, 0x7fffffff, 'price');
  return clientPacket(VendorPacket.REGISTER_PVENDOR_ITEM).u8(slot).u8(0).u8(objectId).i16(count).i32(cost).toBytes();
}

export function encodeUnregisterPVendorItem(slot: number): Uint8Array {
  integer(slot, 0, MAX_VENDITEM - 1, 'shop slot');
  return clientPacket(VendorPacket.UNREGISTER_PVENDOR_ITEM).u8(slot).toBytes();
}

export const encodeQueryPVendorItem = (vendorId: number): Uint8Array =>
  clientPacket(VendorPacket.QUERY_PVENDOR_ITEM).u32(vendorId).toBytes();

/** `SendBuyPVendorItem( objidVendor, nItem, dwItemId, nNum )` (WndVendorBuy.cpp:205). */
export function encodeBuyPVendorItem(vendorId: number, slot: number, itemId: number, count: number): Uint8Array {
  integer(slot, 0, MAX_VENDITEM - 1, 'shop slot'); integer(count, 1, 32767, 'quantity');
  return clientPacket(VendorPacket.BUY_PVENDOR_ITEM).u32(vendorId).u8(slot).u32(itemId).i16(count).toBytes();
}

/** `SendEnterChattingRoom( m_idPlayer )`: the room is the seller's player id. */
export const encodeEnterChattingRoom = (roomId: number): Uint8Array =>
  clientPacket(VendorPacket.ENTERCHTTING).u32(roomId).toBytes();

/** `SendChatting( szChat )` (WndVendor.cpp:616-654): under 1020 bytes. */
export function encodeChatting(text: string): Uint8Array {
  const bytes = chatBytes(text, 1019);
  return clientPacket(VendorPacket.CHATTING).i32(bytes.length).bytes(bytes).toBytes();
}

export const encodeOpenChattingRoom = (): Uint8Array => clientPacket(VendorPacket.OPENCHATTINGROOM).toBytes();
export const encodeCloseChattingRoom = (): Uint8Array => clientPacket(VendorPacket.CLOSECHATTINGROOM).toBytes();

/** For the pretend servers: a shop packet the browser sent, after its type, or null for another type. */
export type VendorRequestPacket =
  | { type: 'pvendorOpenRequest'; title: string }
  | { type: 'pvendorCloseRequest'; vendorId: number }
  | { type: 'registerPVendorItemRequest'; slot: number; itemType: number; objectId: number; count: number; cost: number }
  | { type: 'unregisterPVendorItemRequest'; slot: number }
  | { type: 'queryPVendorItem'; vendorId: number }
  | { type: 'buyPVendorItem'; vendorId: number; slot: number; itemId: number; count: number }
  | { type: 'enterChattingRoom'; roomId: number }
  | { type: 'chattingRequest'; text: string }
  | { type: 'openChattingRoom' }
  | { type: 'closeChattingRoom' };

export function readVendorRequestPacket(packetType: number, r: ArReader): VendorRequestPacket | null {
  switch (packetType) {
    case VendorPacket.PVENDOR_OPEN: return { type: 'pvendorOpenRequest', title: r.string(MAX_VENDORNAME) };
    case VendorPacket.PVENDOR_CLOSE: return { type: 'pvendorCloseRequest', vendorId: r.u32() };
    case VendorPacket.REGISTER_PVENDOR_ITEM: {
      const slot = r.u8(), itemType = r.u8(), objectId = r.u8(), count = r.i16(), cost = r.i32();
      return { type: 'registerPVendorItemRequest', slot, itemType, objectId, count, cost };
    }
    case VendorPacket.UNREGISTER_PVENDOR_ITEM: return { type: 'unregisterPVendorItemRequest', slot: r.u8() };
    case VendorPacket.QUERY_PVENDOR_ITEM: return { type: 'queryPVendorItem', vendorId: r.u32() };
    case VendorPacket.BUY_PVENDOR_ITEM: {
      const vendorId = r.u32(), slot = r.u8(), itemId = r.u32(), count = r.i16();
      return { type: 'buyPVendorItem', vendorId, slot, itemId, count };
    }
    case VendorPacket.ENTERCHTTING: return { type: 'enterChattingRoom', roomId: r.u32() };
    case VendorPacket.CHATTING: return { type: 'chattingRequest', text: r.string(CHAT_BUFFER) };
    case VendorPacket.OPENCHATTINGROOM: return { type: 'openChattingRoom' };
    case VendorPacket.CLOSECHATTINGROOM: return { type: 'closeChattingRoom' };
    default: return null;
  }
}
