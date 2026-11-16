// 2026-11-17: the extra bag's packets (docs/2026-11-17-extra-bag-research.md §5), both ways. The reads copy Neuz's
// handlers, the writes its senders; the server's writers are `CUser::AddPocket*` (`WORLDSERVER/User.cpp:3588-3640`).
//
//   snapshots   CDPClient::OnPocketAttribute    Neuz/DPClient.cpp:17313-17325  POCKET_ATTRIBUTE 0x0200: int attribute
//                                                                              (0 expired, 1 avail), int pocket, int data
//               CDPClient::OnPocketAddItem      :17327-17336                   POCKET_ADD_ITEM 0x0201: int pocket, CItemElem
//               CDPClient::OnPocketRemoveItem   :17338-17346                   POCKET_REMOVE_ITEM 0x0202: int pocket, int item,
//                                                                              short count
//   senders     CDPClient::SendAvailPocket      :11033-11038                   AVAIL_POCKET 0x70000006: int pocket, int item
//               CDPClient::SendMoveItem_Pocket  :11040-11045                   MOVE_ITEM_POCKET 0x70000007: int from, int item,
//                                                                              short count, int to

import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';
import { readInventoryItem } from './own';
import type { InventoryItem } from './types';

export type { OwnPocket } from './types';

/** The pockets' packet types, client to world (`Source/_Network/MsgHdr.h:677-678`). */
export const PocketPacket = {
  AVAIL_POCKET: 0x70000006,
  MOVE_ITEM_POCKET: 0x70000007,
} as const;

/** The pockets' snapshot types (`MsgHdr.h:1209-1211`). */
export const PocketMessageType = {
  POCKET_ATTRIBUTE: 0x0200,
  POCKET_ADD_ITEM: 0x0201,
  POCKET_REMOVE_ITEM: 0x0202,
} as const;

/** `MAX_POCKET` (`_Common/pocket.h:31`). */
export const POCKET_COUNT = 3;
/** Each pocket's slots: `POCKET_SLOT_SIZE_0` 6, `POCKET_SLOT_SIZE_1_2` 24 (`pocket.h:32-33`). */
export const POCKET_SLOTS: readonly number[] = [6, 24, 24];
/** The main bag in `MOVE_ITEM_POCKET` (`nPocket < 0`, `CMover::GetItemId2`, `Mover.cpp:11694-11699`). */
export const BAG_POCKET = -1;
/** `CPocketController::expired`, `avail` (`pocket.h:69`). */
export const PocketAttribute = { EXPIRED: 0, AVAIL: 1 } as const;

export type PocketMessage =
  /** `SetAttribute( attribute, pocket, data )`: expired sets `m_bExpired` to data, avail opens it for `data` seconds. */
  | { type: 'pocketAttribute'; attribute: number; pocket: number; data: number }
  /** `m_Pocket.Add( pocket, &item )`: stacks first, then the first empty position (the item's own id is not used). */
  | { type: 'pocketAddItem'; pocket: number; item: InventoryItem }
  /** `m_Pocket.RemoveAtId( pocket, item, count )`: the count down, or the item gone. */
  | { type: 'pocketRemoveItem'; pocket: number; objectId: number; count: number };

export function readPocketAttribute(r: ArReader): PocketMessage {
  const attribute = r.i32(), pocket = r.i32();
  return { type: 'pocketAttribute', attribute, pocket, data: r.i32() };
}

export function readPocketAddItem(r: ArReader): PocketMessage {
  const pocket = r.i32();
  return { type: 'pocketAddItem', pocket, item: readInventoryItem(r) };
}

export function readPocketRemoveItem(r: ArReader): PocketMessage {
  const pocket = r.i32(), objectId = r.i32();
  return { type: 'pocketRemoveItem', pocket, objectId, count: r.i16() };
}

/** The snapshot readers of the pockets, for `WORLD_READERS`. */
export const POCKET_READERS: ReadonlyArray<[number, (r: ArReader) => PocketMessage]> = [
  [PocketMessageType.POCKET_ATTRIBUTE, readPocketAttribute],
  [PocketMessageType.POCKET_ADD_ITEM, readPocketAddItem],
  [PocketMessageType.POCKET_REMOVE_ITEM, readPocketRemoveItem],
];

const POCKET_TYPES: ReadonlySet<string> = new Set(['pocketAttribute', 'pocketAddItem', 'pocketRemoveItem']);

/** Whether a world message is one of the pockets'. */
export function isPocketMessage(message: { type: string }): message is PocketMessage {
  return POCKET_TYPES.has(message.type);
}

// --- the client's packets ---

/** `SendAvailPocket( nPocket, nItem )`: open pocket 1 or 2 with the Extra Bag of bag object `objectId`. */
export const encodeAvailPocket = (pocket: number, objectId: number): Uint8Array =>
  clientPacket(PocketPacket.AVAIL_POCKET).i32(pocket).i32(objectId).toBytes();

/** `SendMoveItem_Pocket( nPocket1, nItem, nNum, nPocket2 )`: `count` of object `objectId` from `from` to `to` (-1 the bag). */
export const encodeMoveItemPocket = (from: number, objectId: number, count: number, to: number): Uint8Array =>
  clientPacket(PocketPacket.MOVE_ITEM_POCKET).i32(from).i32(objectId).i16(count).i32(to).toBytes();

/** For the pretend servers: a client packet of the pockets after its type. */
export type PocketRequestPacket =
  | { type: 'availPocketRequest'; pocket: number; objectId: number }
  | { type: 'moveItemPocketRequest'; from: number; objectId: number; count: number; to: number };

export function readPocketRequestPacket(packetType: number, r: ArReader): PocketRequestPacket | null {
  switch (packetType) {
    case PocketPacket.AVAIL_POCKET: {
      const pocket = r.i32();
      return { type: 'availPocketRequest', pocket, objectId: r.i32() };
    }
    case PocketPacket.MOVE_ITEM_POCKET: {
      const from = r.i32(), objectId = r.i32(), count = r.i16();
      return { type: 'moveItemPocketRequest', from, objectId, count, to: r.i32() };
    }
    default:
      return null;
  }
}
