// The upgrade cursor's packets (2026-11-05): Sunstone and Moonstone, the element and socket cards, the random scrolls,
// the items that need a target item, and the Ultimate gem (`Neuz/DPClient.cpp`: SendEnchant :14780, SendPiercing :14806,
// SendRandomScroll :14772, SendDoUseItemTarget :10232, SendUltimateEnchantWeapon :16379), and ULTIMATE's answer.

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeDoUseItemTarget,
  encodeEnchant, encodePiercing, encodePiercingSize, encodeRandomScroll, encodeSmeltSafety, encodeUltimateEnchantWeapon, readBundle,
} from '../src';

const fields = (bytes: Uint8Array): number[] => {
  const r = new ArReader(bytes);
  const out = [r.u32(), r.u32(), r.u32(), r.u32()];
  r.expectEnd();
  return out;
};

describe('the upgrade packets', () => {
  it('each is its type and two object ids, in Neuz\'s order', () => {
    expect(fields(encodeEnchant(12, 3))).toEqual([NULL_ID, 0xf000b024, 12, 3]);
    expect(fields(encodePiercing(12, 4))).toEqual([NULL_ID, 0xf000b025, 12, 4]);
    expect(fields(encodeRandomScroll(12, 5))).toEqual([NULL_ID, 0xf000d00d, 12, 5]);
    // the material first, then the target
    expect(fields(encodeDoUseItemTarget(6, 12))).toEqual([NULL_ID, 0x70000004, 6, 12]);
    expect(fields(encodeUltimateEnchantWeapon(12, 7))).toEqual([NULL_ID, 0xf000f113, 12, 7]);
    expect([PacketType.ENCHANT, PacketType.PIERCING, PacketType.RANDOMSCROLL, PacketType.DO_USE_ITEM_TARGET, PacketType.ULTIMATE_ENCHANTWEAPON])
      .toEqual([0xf000b024, 0xf000b025, 0xf000d00d, 0x70000004, 0xf000f113]);
  });

  it('are named by decodeWorldPacket', () => {
    expect(decodeWorldPacket(encodeEnchant(12, 3))).toEqual({ type: 'enchant', targetId: 12, materialId: 3 });
    expect(decodeWorldPacket(encodeDoUseItemTarget(6, 12))).toEqual({ type: 'doUseItemTarget', materialId: 6, targetId: 12 });
  });

  it('refuse an object id outside the inventory', () => {
    for (const id of [-1, 73, 0.5]) expect(() => encodeEnchant(id, 3)).toThrow();
  });

  it('ULTIMATE is read (state, result), so a bundle goes on after it', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2);
    w.u32(0x1234).u16(MessageType.ULTIMATE).u8(6).i32(1);
    w.u32(0x1234).u16(MessageType.DEFINEDTEXT1).i32(2205);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value.type)).toEqual(['ultimate', 'definedText']);
    expect(result.messages[0]!.value).toEqual({ type: 'ultimate', state: 6, result: 1 });
  });
});

describe('the Upgrade Specialist\'s packets (2026-11-05)', () => {
  const words = (bytes: Uint8Array): number[] => {
    const r = new ArReader(bytes);
    const out: number[] = [];
    while (r.remaining() > 0) out.push(r.u32());
    return out;
  };

  it('PIERCING_SIZE: the item, the Moonstone, the GProtect or NULL_ID (SendPiercingSize, DPClient.cpp:14824-14831)', () => {
    expect(words(encodePiercingSize(12, 3, 4))).toEqual([NULL_ID, 0xf000d008, 12, 3, 4]);
    expect(words(encodePiercingSize(12, 3, NULL_ID))).toEqual([NULL_ID, 0xf000d008, 12, 3, NULL_ID]);
    expect(() => encodePiercingSize(NULL_ID, 3, 4)).toThrow();
  });

  it('SMELT_SAFETY: the item, the material, the protection, the smelting scroll or NULL_ID (SendSmeltSafety, :18740-18746)', () => {
    expect(words(encodeSmeltSafety(12, 3, 4, 5))).toEqual([NULL_ID, 0x70007000, 12, 3, 4, 5]);
    expect(words(encodeSmeltSafety(12, 3, 4, NULL_ID))).toEqual([NULL_ID, 0x70007000, 12, 3, 4, NULL_ID]);
    expect(() => encodeSmeltSafety(12, NULL_ID, 4, 5)).toThrow();
  });

  it('SMELT_SAFETY 0x9900 is read (a byte), so a bundle goes on after it', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2);
    w.u32(0x1234).u16(MessageType.SMELT_SAFETY).u8(2);
    w.u32(0x1234).u16(MessageType.DEFINEDTEXT1).i32(2205);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'smeltSafety', result: 2 }, expect.objectContaining({ type: 'definedText' })]);
  });
});
