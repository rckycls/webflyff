// The upgrade cursor's packets (2026-11-05, docs/superpowers/specs/2026-11-05-buffs-premium-research.md §5): the
// inventory's upgrade mode sends one of these 4 s after the target item is clicked (`CWndInventory::Process`,
// `_Interface/WndField.cpp:1664-1745`), each its type and two inventory object ids:
//
//   CDPClient::SendEnchant                 Neuz/DPClient.cpp:14780   ENCHANT 0xf000b024: target, material
//   CDPClient::SendPiercing                DPClient.cpp:14806        PIERCING 0xf000b025: target, card
//   CDPClient::SendRandomScroll            DPClient.cpp:14772        RANDOMSCROLL 0xf000d00d: target, scroll
//   CDPClient::SendDoUseItemTarget         DPClient.cpp:10232        DO_USE_ITEM_TARGET 0x70000004: material, target
//   CDPClient::SendUltimateEnchantWeapon   DPClient.cpp:16379        ULTIMATE_ENCHANTWEAPON 0xf000f113: weapon, gem
//
// and the Ultimate gem's answer, ULTIMATE 0x0100 (`CUser::AddUltimate`): `BYTE state, int result`.
//
// 2026-11-10 (docs/superpowers/specs/2026-11-10-jewels-research.md §5): the jewel windows' two packets,
//
//   CDPClient::SendUltimateMakeGem         DPClient.cpp:16347        ULTIMATE_MAKEGEM 0xf000f111: weapon (Create Jewels)
//   CDPClient::SendUltimateSetGem          DPClient.cpp:16363        ULTIMATE_SETGEM 0xf000f114: weapon, jewel (Jewel Setting)
//
// and their answers in ULTIMATE: MAKEGEM's with the jewels' count after the result (`AddUltimateMakeGem`, User.cpp:7821).
//
// 2026-11-11 (docs/superpowers/specs/2026-11-11-item-npc-windows-research.md): the rest of the jewel menu and the Repair
// window,
//
//   CDPClient::SendUltimateMakeItem        DPClient.cpp:16281        ULTIMATE_MAKEITEM 0xf000f110: ten ids (Shining Oricalkum)
//   CDPClient::SendUltimateTransWeapon     DPClient.cpp:16299        ULTIMATE_TRANSWEAPON 0xf000f112: weapon, two stones
//   CDPClient::SendUltimateRemoveGem       DPClient.cpp:16316        ULTIMATE_REMOVEGEM 0xf000f115: weapon, Moonstone
//   CDPClient::SendRepairItem              DPClient.cpp:14150        REPAIRITEM 0x00ff00b5: a BYTE count, BYTE ids

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

function checkId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id >= 73) throw new RangeError('invalid inventory index');
}

function two(type: number, first: number, second: number): Uint8Array {
  checkId(first);
  checkId(second);
  return clientPacket(type).u32(first).u32(second).toBytes();
}

/** Sunstone, Moonstone, an element card: the target, then the material. */
export const encodeEnchant = (targetId: number, materialId: number): Uint8Array => two(PacketType.ENCHANT, targetId, materialId);
/** A socket card: the target, then the card. */
export const encodePiercing = (targetId: number, cardId: number): Uint8Array => two(PacketType.PIERCING, targetId, cardId);
/** A random scroll: the target, then the scroll. */
export const encodeRandomScroll = (targetId: number, scrollId: number): Uint8Array =>
  two(PacketType.RANDOMSCROLL, targetId, scrollId);
/** An item that needs a target item (`IsNeedTarget`): the material first, then the target. */
export const encodeDoUseItemTarget = (materialId: number, targetId: number): Uint8Array =>
  two(PacketType.DO_USE_ITEM_TARGET, materialId, targetId);
/** The Ultimate gem: the weapon, then the gem. */
export const encodeUltimateEnchantWeapon = (weaponId: number, gemId: number): Uint8Array =>
  two(PacketType.ULTIMATE_ENCHANTWEAPON, weaponId, gemId);

/** Create Jewels: the weapon to break into jewels. */
export function encodeUltimateMakeGem(weaponId: number): Uint8Array {
  checkId(weaponId);
  return clientPacket(PacketType.ULTIMATE_MAKEGEM).u32(weaponId).toBytes();
}
/** Jewel Setting: the Ultimate weapon, then the jewel. */
export const encodeUltimateSetGem = (weaponId: number, jewelId: number): Uint8Array =>
  two(PacketType.ULTIMATE_SETGEM, weaponId, jewelId);

/** `MAX_JEWEL` (_Common/UltimateWeapon.h:12): Create Shining Oricalkum's ten slots. */
export const MAX_JEWEL = 10;
/** `MAX_REPAIRINGITEM` (_Common/ProjectCmn.h:13): the Repair window's slots. */
export const MAX_REPAIRINGITEM = 25;

/**
 * 2026-11-11: Create Shining Oricalkum (`CDPClient::SendUltimateMakeItem`, DPClient.cpp:16281-16289): its ten slots as
 * ten object ids, `ar.Write( pdwItemId, sizeof(OBJID) * MAX_JEWEL )`.
 */
export function encodeUltimateMakeItem(itemIds: readonly number[]): Uint8Array {
  if (itemIds.length !== MAX_JEWEL) throw new RangeError(`${itemIds.length} slots, not ${MAX_JEWEL}`);
  const w = clientPacket(PacketType.ULTIMATE_MAKEITEM);
  for (const id of itemIds) {
    checkId(id);
    w.u32(id);
  }
  return w.toBytes();
}

/** 2026-11-11: Create Unique / Ultimate Weapon (`SendUltimateTransWeapon`, :16299-16306): the weapon, then the two stones. */
export function encodeUltimateTransWeapon(weaponId: number, gem1Id: number, gem2Id: number): Uint8Array {
  checkId(weaponId);
  checkId(gem1Id);
  checkId(gem2Id);
  return clientPacket(PacketType.ULTIMATE_TRANSWEAPON).u32(weaponId).u32(gem1Id).u32(gem2Id).toBytes();
}

/** 2026-11-11: Remove Jewel (`SendUltimateRemoveGem`, :16316-16322): the Ultimate weapon, then the Moonstone. */
export const encodeUltimateRemoveGem = (weaponId: number, gemId: number): Uint8Array =>
  two(PacketType.ULTIMATE_REMOVEGEM, weaponId, gemId);

/**
 * 2026-11-11: the Repair window (`CDPClient::SendRepairItem`, DPClient.cpp:14150-14190): a BYTE count, then each item to
 * repair as a BYTE object id. Neuz sends only the items worn below their endurance and not at their repair limit, and
 * nothing at all when none is (TID_GAME_REPAIR_NO): the caller filters, and an empty list is an error here.
 */
export function encodeRepairItem(objectIds: readonly number[]): Uint8Array {
  if (objectIds.length === 0 || objectIds.length > MAX_REPAIRINGITEM) throw new RangeError(`${objectIds.length} items to repair`);
  const w = clientPacket(PacketType.REPAIRITEM).u8(objectIds.length);
  for (const id of objectIds) {
    checkId(id);
    w.u8(id);
  }
  return w.toBytes();
}

/** ULTIMATE's states (`MsgHdr.h:1585-1590`). */
export const UltimateState = { MAKEITEM: 1, TRANSWEAPON: 2, MAKEGEM: 3, SETGEM: 4, REMOVEGEM: 5, ENCHANTWEAPON: 6 } as const;
/** ULTIMATE's results (`CUltimateWeapon`'s enum, `_Common/UltimateWeapon.h:19`). */
export const UltimateResult = { SUCCESS: 0, FAILED: 1, CANCEL: 2, ISULTIMATE: 3, INVENTORY: 4, ISNOTULTIMATE: 5 } as const;

/** An inventory object id, or NULL_ID for none (the last fields of PIERCING_SIZE and SMELT_SAFETY). */
function checkIdOrNull(id: number): void {
  if (id !== 0xffffffff) checkId(id);
}

/**
 * 2026-11-05: the Upgrade Specialist's piercing (`CDPClient::SendPiercingSize`, `DPClient.cpp:14824-14831`): the item, the
 * Moonstone, and the GProtect or NULL_ID.
 */
export function encodePiercingSize(itemId: number, moonstoneId: number, protectId: number): Uint8Array {
  checkId(itemId);
  checkId(moonstoneId);
  checkIdOrNull(protectId);
  return clientPacket(PacketType.PIERCING_SIZE).u32(itemId).u32(moonstoneId).u32(protectId).toBytes();
}

/**
 * 2026-11-05: one safe upgrade (`CDPClient::SendSmeltSafety`, `DPClient.cpp:18740-18746`): the item, the material, the
 * protection scroll, and the smelting scroll or NULL_ID.
 */
export function encodeSmeltSafety(itemId: number, materialId: number, scrollId: number, smeltingId: number): Uint8Array {
  checkId(itemId);
  checkId(materialId);
  checkId(scrollId);
  checkIdOrNull(smeltingId);
  return clientPacket(PacketType.SMELT_SAFETY).u32(itemId).u32(materialId).u32(scrollId).u32(smeltingId).toBytes();
}

/** SMELT_SAFETY (`CDPClient::OnSmeltSafety`, `DPClient.cpp:18748-18783`): its result byte. */
export function readSmeltSafety(r: ArReader): MessageOf<'smeltSafety'> {
  return { type: 'smeltSafety', result: r.u8() };
}

/**
 * ULTIMATE (`CDPClient::OnUltimateWeapon`, DPClient.cpp:11577-11655): its state and result; MAKEGEM's also the count of
 * jewels made (`OnUltimateMakeGem`, :11624-11633).
 */
export function readUltimate(r: ArReader): MessageOf<'ultimate'> {
  const state = r.u8();
  const result = r.i32();
  if (state === UltimateState.MAKEGEM) return { type: 'ultimate', state, result, count: r.i32() };
  return { type: 'ultimate', state, result };
}
