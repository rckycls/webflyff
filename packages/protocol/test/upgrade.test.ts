// The upgrade cursor's packets (2026-11-05): Sunstone and Moonstone, the element and socket cards, the random scrolls,
// the items that need a target item, and the Ultimate gem (`Neuz/DPClient.cpp`: SendEnchant :14780, SendPiercing :14806,
// SendRandomScroll :14772, SendDoUseItemTarget :10232, SendUltimateEnchantWeapon :16379), and ULTIMATE's answer.

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeDoUseItemTarget,
  encodeEnchant, encodePiercing, encodePiercingSize, encodeRandomScroll, encodeSmeltSafety, encodeUltimateEnchantWeapon, readBundle,
  encodeUltimateMakeGem, encodeUltimateSetGem, UltimateResult, UltimateState,
  encodeRepairItem, encodeUltimateMakeItem, encodeUltimateRemoveGem, encodeUltimateTransWeapon,
  encodePiercingRemove, encodeRemoveAttribute,
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

describe('the jewel windows\' packets (2026-11-10, jewels research §5)', () => {
  const words = (bytes: Uint8Array): number[] => {
    const r = new ArReader(bytes);
    const out: number[] = [];
    while (r.remaining() > 0) out.push(r.u32());
    return out;
  };

  it('ULTIMATE_MAKEGEM: the weapon (SendUltimateMakeGem, DPClient.cpp:16347-16352)', () => {
    expect(words(encodeUltimateMakeGem(12))).toEqual([NULL_ID, 0xf000f111, 12]);
    expect(decodeWorldPacket(encodeUltimateMakeGem(12))).toEqual({ type: 'ultimateMakeGem', weaponId: 12 });
    expect(() => encodeUltimateMakeGem(73)).toThrow();
  });

  it('ULTIMATE_SETGEM: the weapon, then the jewel (SendUltimateSetGem, :16363-16369)', () => {
    expect(words(encodeUltimateSetGem(12, 4))).toEqual([NULL_ID, 0xf000f114, 12, 4]);
    expect(decodeWorldPacket(encodeUltimateSetGem(12, 4))).toEqual({ type: 'ultimateSetGem', weaponId: 12, jewelId: 4 });
    expect(() => encodeUltimateSetGem(12, -1)).toThrow();
    expect([PacketType.ULTIMATE_MAKEGEM, PacketType.ULTIMATE_SETGEM]).toEqual([0xf000f111, 0xf000f114]);
  });

  it('ULTIMATE MAKEGEM carries the count after the result (AddUltimateMakeGem, User.cpp:7821-7831)', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(3);
    w.u32(0x1234).u16(MessageType.ULTIMATE).u8(UltimateState.MAKEGEM).i32(UltimateResult.SUCCESS).i32(5);
    w.u32(0x1234).u16(MessageType.ULTIMATE).u8(UltimateState.SETGEM).i32(UltimateResult.FAILED);
    w.u32(0x1234).u16(MessageType.DEFINEDTEXT1).i32(2205);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'ultimate', state: 3, result: 0, count: 5 },
      { type: 'ultimate', state: 4, result: 1 },
      expect.objectContaining({ type: 'definedText' }),
    ]);
  });

  it('the states and results are MsgHdr.h:1585-1590 and UltimateWeapon.h:19', () => {
    expect(UltimateState).toEqual({ MAKEITEM: 1, TRANSWEAPON: 2, MAKEGEM: 3, SETGEM: 4, REMOVEGEM: 5, ENCHANTWEAPON: 6 });
    expect(UltimateResult).toEqual({ SUCCESS: 0, FAILED: 1, CANCEL: 2, ISULTIMATE: 3, INVENTORY: 4, ISNOTULTIMATE: 5 });
  });
});

describe('the item NPC windows\' packets (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md)', () => {
  const words = (bytes: Uint8Array): number[] => {
    const r = new ArReader(bytes);
    const out: number[] = [];
    while (r.remaining() >= 4) out.push(r.u32());
    return out;
  };

  it('ULTIMATE_MAKEITEM: the ten slots as ten object ids (SendUltimateMakeItem, DPClient.cpp:16281-16289)', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(words(encodeUltimateMakeItem(ids))).toEqual([NULL_ID, 0xf000f110, ...ids]);
    expect(decodeWorldPacket(encodeUltimateMakeItem(ids))).toEqual({ type: 'ultimateMakeItem', itemIds: ids });
    expect(() => encodeUltimateMakeItem([1, 2, 3])).toThrow();
    expect(() => encodeUltimateMakeItem([...ids.slice(0, 9), 73])).toThrow();
  });

  it('ULTIMATE_TRANSWEAPON: the weapon, then the two stones (SendUltimateTransWeapon, :16299-16306)', () => {
    expect(words(encodeUltimateTransWeapon(12, 4, 5))).toEqual([NULL_ID, 0xf000f112, 12, 4, 5]);
    expect(decodeWorldPacket(encodeUltimateTransWeapon(12, 4, 5)))
      .toEqual({ type: 'ultimateTransWeapon', weaponId: 12, gem1Id: 4, gem2Id: 5 });
    expect(() => encodeUltimateTransWeapon(12, 4, -1)).toThrow();
  });

  it('ULTIMATE_REMOVEGEM: the weapon, then the Moonstone (SendUltimateRemoveGem, :16316-16322)', () => {
    expect(words(encodeUltimateRemoveGem(12, 4))).toEqual([NULL_ID, 0xf000f115, 12, 4]);
    expect(decodeWorldPacket(encodeUltimateRemoveGem(12, 4))).toEqual({ type: 'ultimateRemoveGem', weaponId: 12, gemId: 4 });
    expect([PacketType.ULTIMATE_MAKEITEM, PacketType.ULTIMATE_TRANSWEAPON, PacketType.ULTIMATE_REMOVEGEM])
      .toEqual([0xf000f110, 0xf000f112, 0xf000f115]);
  });

  it('PIERCINGREMOVE and REMOVE_ATTRIBUTE: the item (DPClient.cpp:14760-14765, :14734-14739)', () => {
    expect(words(encodePiercingRemove(9))).toEqual([NULL_ID, 0xf000f809, 9]);
    expect(words(encodeRemoveAttribute(9))).toEqual([NULL_ID, 0xf000d00b, 9]);
    expect(decodeWorldPacket(encodePiercingRemove(9))).toEqual({ type: 'piercingRemove', itemId: 9 });
    expect(decodeWorldPacket(encodeRemoveAttribute(9))).toEqual({ type: 'removeAttribute', itemId: 9 });
  });

  it('REMOVE_ATTRIBUTE 0x0122: a BOOL (AddRemoveAttribute, User.cpp:7813-7821)', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2);
    w.u32(0x1234).u16(MessageType.REMOVE_ATTRIBUTE).i32(1);
    w.u32(0x1234).u16(MessageType.REMOVE_ATTRIBUTE).i32(0);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'removeAttribute', success: true }, { type: 'removeAttribute', success: false },
    ]);
  });

  it('REPAIRITEM: a BYTE count, then each object id as a BYTE (SendRepairItem, DPClient.cpp:14150-14190)', () => {
    const bytes = encodeRepairItem([3, 40, 72]);
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32(), r.u8(), r.u8(), r.u8(), r.u8()]).toEqual([NULL_ID, 0x00ff00b5, 3, 3, 40, 72]);
    r.expectEnd();
    expect(decodeWorldPacket(bytes)).toEqual({ type: 'repairItem', objectIds: [3, 40, 72] });
    expect(() => encodeRepairItem([])).toThrow(); // Neuz sends nothing with no item to repair
    expect(() => encodeRepairItem(Array.from({ length: 26 }, (_, i) => i))).toThrow(); // MAX_REPAIRINGITEM 25
  });
});
