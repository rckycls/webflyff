// custom (owner 2026-11-19, VIP perks): the bag's VIP buttons, for VIP1-VIP4 only (the World server checks the letter).
// Not in V15: the outer repo's patches/2026-11-19-vip-bag-buttons.patch adds them (`CDPSrvr::OnVipSortInventory`,
// `CDPSrvr::OnVipPerinConvert`, `CUser::AddVipInventorySort`). A World server without the patch ignores both packets.

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';

/**
 * VIP_SORT_INVENTORY: sort the main bag by item kind, part, job and item (the removed __BB_INVENTORY_SORT's order), empty
 * slots after them. Nothing more: the server answers with SNAPSHOTTYPE_VIP_INVENTORY_SORT.
 */
export function encodeVipSortInventory(): Uint8Array {
  return clientPacket(PacketType.VIP_SORT_INVENTORY).toBytes();
}

/**
 * VIP_PERIN_CONVERT: as many Perins as the penya buys at 100,000,000 each (as many as the bag takes), the rest kept.
 * Nothing more: the new Perins and penya come back as the usual CREATEITEM and gold messages.
 */
export function encodeVipPerinConvert(): Uint8Array {
  return clientPacket(PacketType.VIP_PERIN_CONVERT).toBytes();
}

/** The bag's new order after the VIP sort (`CUser::AddVipInventorySort`). */
export type VipBagMessage = { type: 'vipInventorySort'; slots: number[] };

/** SNAPSHOTTYPE_VIP_INVENTORY_SORT 0x8870: a BYTE count, then each slot's object id (`m_apIndex`), NULL_ID for an empty one. */
export const VIP_INVENTORY_SORT = 0x8870;

export function readVipInventorySort(r: ArReader): VipBagMessage {
  const count = r.u8();
  return { type: 'vipInventorySort', slots: Array.from({ length: count }, () => r.u32()) };
}
