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

/** ULTIMATE (`CDPClient::OnUltimate`): its state and result, which the Ultimate windows the browser lacks would show. */
export function readUltimate(r: ArReader): MessageOf<'ultimate'> {
  const state = r.u8();
  const result = r.i32();
  return { type: 'ultimate', state, result };
}
