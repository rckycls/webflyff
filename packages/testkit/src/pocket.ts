// 2026-11-17 (extra bag): the pockets' snapshots as the world server writes them (`CUser::AddPocketAttribute`,
// `AddPocketAddItem`, `AddPocketRemoveItem`, `WORLDSERVER/User.cpp:3588-3640`), in the order of the readers
// (`@flyffweb/protocol` world/pocket.ts). All are about the own player.

import { ArWriter, PocketMessageType } from '@flyffweb/protocol';
import type { InventoryItem } from '@flyffweb/protocol';
import { writeItemElem } from './world';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** POCKET_ATTRIBUTE: attribute 0 (expired, data 1 or 0) or 1 (avail, data the seconds), the pocket. */
export const writePocketAttribute = (selfId: number, attribute: number, pocket: number, data: number): ScriptMessage =>
  scripted(selfId, PocketMessageType.POCKET_ATTRIBUTE, new ArWriter().i32(attribute).i32(pocket).i32(data));

/** POCKET_ADD_ITEM: the pocket and the item that went in (its count the count moved). */
export function writePocketAddItem(selfId: number, pocket: number, item: InventoryItem): ScriptMessage {
  const w = new ArWriter().i32(pocket);
  writeItemElem(w, item);
  return scripted(selfId, PocketMessageType.POCKET_ADD_ITEM, w);
}

/** POCKET_REMOVE_ITEM: the pocket, the object and the count taken out. */
export const writePocketRemoveItem = (selfId: number, pocket: number, objectId: number, count: number): ScriptMessage =>
  scripted(selfId, PocketMessageType.POCKET_REMOVE_ITEM, new ArWriter().i32(pocket).i32(objectId).i16(count));
