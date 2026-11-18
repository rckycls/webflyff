// custom (owner 2026-11-19, VIP perks): the bag's VIP buttons. The World server's patch 2026-11-19-vip-bag-buttons
// (outer repo) adds PACKETTYPE_VIP_SORT_INVENTORY 0x8fff0102 and PACKETTYPE_VIP_PERIN_CONVERT 0x8fff0103 (no body), and
// answers a sort with SNAPSHOTTYPE_VIP_INVENTORY_SORT 0x8870: a BYTE count, then each bag slot's object id (m_apIndex).
import { describe, expect, it } from 'vitest';
import { encodeBundle } from '@flyffweb/testkit';
import { ArReader, ArWriter, PacketType, WORLD_READERS, decodeWorldPacket, encodeVipPerinConvert, encodeVipSortInventory, readBundle } from '../src';

const body = (bytes: Uint8Array, type: number): ArReader => {
  const r = new ArReader(bytes);
  expect(r.u32()).toBe(0xffffffff); // DPID_UNKNOWN
  expect(r.u32()).toBe(type);
  return r;
};

describe('the VIP bag buttons', () => {
  it('sends the sort and the Perin convert with no body', () => {
    expect(PacketType.VIP_SORT_INVENTORY).toBe(0x8fff0102);
    expect(PacketType.VIP_PERIN_CONVERT).toBe(0x8fff0103);
    body(encodeVipSortInventory(), 0x8fff0102).expectEnd();
    body(encodeVipPerinConvert(), 0x8fff0103).expectEnd();
    expect(decodeWorldPacket(encodeVipSortInventory())).toEqual({ type: 'vipSortInventory' });
    expect(decodeWorldPacket(encodeVipPerinConvert())).toEqual({ type: 'vipPerinConvert' });
  });

  it('reads the new bag order (SNAPSHOTTYPE_VIP_INVENTORY_SORT 0x8870)', () => {
    const w = new ArWriter();
    w.u8(4);
    for (const id of [7, 2, 0xffffffff, 9]) w.u32(id);
    const result = readBundle(encodeBundle(PacketType.SNAPSHOT, 9, [{ objectId: 9, type: 0x8870, fields: w.toBytes() }]), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'vipInventorySort', slots: [7, 2, 0xffffffff, 9] }]);
  });
});
