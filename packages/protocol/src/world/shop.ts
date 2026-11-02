import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { readInventoryItem } from './own';
import type { InventoryItem } from './types';
import { clientPacket } from './packet';

export interface ShopMessage { type: 'shopStock'; tabs: InventoryItem[][] }
/** OnOpenShopWnd: four CItemContainer<CItemElem> containers of 100 positions each (ProjectCmn.h). */
export function readShop(r: ArReader): ShopMessage {
  const tabs: InventoryItem[][] = [];
  for (let tab = 0; tab < 4; tab++) {
    const positions = Array.from({ length: 100 }, () => r.u32());
    if (positions.some((id) => id !== 0xffffffff && id >= 100)) throw new ProtocolError('Invalid vendor position', r.position());
    const count = r.u8(), items = new Map<number, InventoryItem>();
    if (count > 100) throw new ProtocolError('Too many vendor items', r.position());
    for (let i = 0; i < count; i++) {
      const id = r.u8();
      if (id >= 100 || items.has(id)) throw new ProtocolError('Invalid vendor item index', r.position());
      const item = readInventoryItem(r, id); if (item.itemId !== 0) items.set(id, item);
    }
    r.bytes(400); // object indexes
    tabs.push([...items.values()]);
  }
  return { type: 'shopStock', tabs };
}
function integer(value: number, max: number, min = 0): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError('Invalid shop quantity or slot.');
}
export const encodeOpenShop = (npcId: number): Uint8Array => clientPacket(0xff00b1).u32(npcId).toBytes();
export const encodeCloseShop = (): Uint8Array => clientPacket(0xff00b2).toBytes();
export function encodeBuyItem(tab: number, id: number, count: number, itemId: number): Uint8Array {
  integer(tab, 3); integer(id, 99); integer(count, 32767, 1); integer(itemId, 0xfffffffe, 1);
  return clientPacket(0xff00b3).u8(tab).u8(id).i16(count).u32(itemId).toBytes();
}
export function encodeSellItem(id: number, count: number): Uint8Array {
  integer(id, 72); integer(count, 32767, 1);
  return clientPacket(0xff00b4).u8(id).i16(count).toBytes();
}
