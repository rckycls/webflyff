import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { readInventoryItem } from './own';
import type { GroundItem, MessageOf } from './types';
import { PacketType } from '../constants';
import type { Vec3 } from '../constants';
import { clientPacket } from './packet';

function index(r: ArReader, max: number): number {
  const at = r.position(), value = r.u8();
  if (value >= max) throw new ProtocolError(`item index ${value} outside ${max}`, at);
  return value;
}
/** CUser::AddCreateItem / CDPClient::OnCreateItem: item type, CItemElem, count, BYTE ids[], short nums[]. */
export function readCreateItem(r: ArReader): MessageOf<'createItem'> {
  const itemType = r.u8();
  const item = readInventoryItem(r);
  const count = index(r, 43);
  const ids = Array.from({ length: count }, () => index(r, 73));
  const stacks = ids.map((objectId) => {
    const count = r.i16();
    if (count < 0) throw new ProtocolError('negative item stack', r.position() - 2);
    return { objectId, count };
  });
  return { type: 'createItem', itemType, item, stacks };
}
/**
 * SNAPSHOTTYPE_UPDATE_ITEM_EX (`MsgHdr.h:1219`, `CDPClient::OnUpdateItemEx`, `Neuz/DPClient.cpp:3194-3207`): `BYTE id`,
 * `char cParam` (only `UI_RANDOMOPTITEMID` 10 does anything, `CMover::UpdateItemEx`), `__int64 iValue`. An inventory item.
 */
export function readUpdateItemEx(r: ArReader): MessageOf<'updateItemEx'> {
  return { type: 'updateItemEx', objectId: index(r, 73), param: r.u8(), value: r.i64() };
}
/** V15 PETVIS always appends dwTime, even for ordinary stack updates. UI_NUM=0; UI_COOLTIME=8 also sets count. */
export function readUpdateItem(r: ArReader): MessageOf<'updateItem'> {
  return { type: 'updateItem', itemType: r.u8(), objectId: index(r, 73), param: r.u8(), value: r.u32(), time: r.u32() };
}
/** Positions, not item object IDs (CItemContainer::Swap). */
export function readMoveItem(r: ArReader): MessageOf<'moveItem'> {
  return { type: 'moveItem', itemType: r.u8(), source: index(r, 42), destination: index(r, 42) };
}
/** EQUIP_INFO has three padding bytes after byFlag on x86 (12 bytes total). */
export function readEquipItem(r: ArReader): MessageOf<'equipItem'> {
  const objectId = index(r, 73);
  r.u32(); // guild id
  const equip = r.u8() !== 0, itemId = r.u32(), option = r.i32(), flag = r.u8();
  r.bytes(3);
  const part = r.i32();
  if (part < -1 || part >= 31) throw new ProtocolError('invalid equipment part', r.position() - 4);
  return { type: 'equipItem', objectId, equip, itemId, option, flag, part };
}
/** CItem::Serialize = CCtrl::Serialize + CItemElem::Serialize (ObjSerialize.cpp). */
export function readGroundItem(r: ArReader): GroundItem {
  r.u8();
  const index = r.u32(), scale = Math.fround(r.u16() / 100), pos = r.vec3(), angle = Math.fround(r.i16() / 10);
  r.u32(); // CCtrl world object id; the bundle identifies it
  const item = readInventoryItem(r);
  return { index, scale, pos, angle, item };
}

function checkId(id: number, max = 73): void {
  if (!Number.isInteger(id) || id < 0 || id >= max) throw new RangeError('invalid inventory index');
}
/**
 * CDPClient::SendDoUseItem (`DPClient.cpp:10860-10866`): MAKELONG(ITYPE_ITEM=0, inventory object id), the target (the
 * focused mover, `NULL_ID` with none: `WndField.cpp:2131-2134`, 2026-11-05), `nPart` (the prop's `dwParts`: 13 for a
 * ride, -1 for an item that is not worn), and under `__HACK_1023` the prop's `fFlightSpeed` (-1 for `=`), which the
 * server compares exactly with a ride's (Piece 7 M5).
 */
export function encodeUseItem(objectId: number, part = -1, flightSpeed = -1, targetId = 0xffffffff): Uint8Array {
  checkId(objectId);
  if (!Number.isInteger(part) || part < -1 || part >= 31) throw new RangeError('invalid part');
  if (!Number.isInteger(targetId) || targetId < 0 || targetId > 0xffffffff) throw new RangeError('invalid target');
  return clientPacket(PacketType.DOUSEITEM).u32(objectId * 65536).u32(targetId).i32(part).f32(flightSpeed).toBytes();
}
/** SendDoEquip (`DPClient.cpp:9336-9342`), with the `__HACK_1023` float: the prop's `fFlightSpeed`, -1 for `=`. */
export function encodeEquipItem(objectId: number, part = -1, flightSpeed = -1): Uint8Array {
  checkId(objectId);
  if (!Number.isInteger(part) || part < -1 || part >= 31) throw new RangeError('invalid part');
  return clientPacket(PacketType.DOEQUIP).u32(objectId).i32(part).f32(flightSpeed).toBytes();
}
export function encodeMoveItem(source: number, destination: number): Uint8Array {
  checkId(source, 42); checkId(destination, 42);
  return clientPacket(0x00ff0006).u8(0).u8(source).u8(destination).toBytes();
}
/** SendDropItem: DWORD ITYPE_ITEM, inventory object id, short count, D3DXVECTOR3. */
export function encodeDropItem(objectId: number, count: number, pos: Vec3): Uint8Array {
  checkId(objectId);
  if (!Number.isInteger(count) || count < 1 || count > 32767 || !pos.every(Number.isFinite)) throw new RangeError('invalid drop');
  return clientPacket(0x00ff0007).u32(0).u32(objectId).i16(count).vec3(pos).toBytes();
}
/** CWndRevival::OnChildNotify sends a header; the server locates and consumes II_SYS_SYS_SCR_RESURRECTION. */
export const encodeRevival = (): Uint8Array => clientPacket(0x00ff00c0).toBytes();
