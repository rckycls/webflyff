// The upgrade cursor's rules (2026-11-05, docs/superpowers/specs/2026-11-05-buffs-premium-research.md §5): a material
// double-clicked in the bag starts it, and the next item clicked is its target.
//
//   Function                              File:lines                            what
//   CWndInventory::OnChildNotify          _Interface/WndField.cpp:2351-2398     the materials that start it
//   CWndItemCtrl::OnLButtonDown           _Interface/WndItemCtrl.cpp:852-922    the smelt safety box
//   CWndInventory::RunUpgrade             WndField.cpp:13284-13572              each material's target and refusals
//   CWndInventory::Process                WndField.cpp:1664-1745                4 s on, the packet of each
//   CItemElem::IsDiceRefineryAble ...     _Common/Item.cpp:359-380, 694-742     the targets' kinds

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';

/** What a material sends: ENCHANT, ULTIMATE_ENCHANTWEAPON, PIERCING, RANDOMSCROLL or DO_USE_ITEM_TARGET. */
export type UpgradeKind = 'enchant' | 'ultimate' | 'piercing' | 'randomScroll' | 'target';

/** `IK3_ELECARD` 37, `IK3_PIERDICE` 61, `IK3_SOCKETCARD` 62 and 2 63, `IK3_RANDOM_SCROLL` 101, `IK3_ENCHANT` 119. */
const IK3_ELECARD = 37, IK3_PIERDICE = 61, IK3_SOCKETCARD = 62, IK3_SOCKETCARD2 = 63, IK3_RANDOM_SCROLL = 101, IK3_ENCHANT = 119;
/** `IK3_SHIELD` 16, `IK3_SUIT` 18; `IK2_WEAPON_DIRECT` 2, `_MAGIC` 3, `IK2_ARMOR` 7, `_ARMORETC` 8, `IK2_JEWELRY` 13. */
const IK3_SHIELD = 16, IK3_SUIT = 18;
const IK2_WEAPON_DIRECT = 2, IK2_WEAPON_MAGIC = 3, IK2_ARMOR = 7, IK2_ARMORETC = 8, IK2_JEWELRY = 13;
const IK1_WEAPON = 1;
/** `EXT_ITEM`: an item used on another (`IsNeedTarget`). */
const EXT_ITEM = 21;
/** `II_GEN_MAT_ORICHALCUM02`, the Ultimate gem; Sunstone (ORICHALCUM01 and its _1); Moonstone (and its _1). */
const ULTIMATE_GEM = 2034;
const SUNSTONES: ReadonlySet<number> = new Set([2035, 2082]);
const MOONSTONES: ReadonlySet<number> = new Set([2036, 2083]);
/** `II_GEN_TOO_COL_NORMAL`: the collector (`IsCollector( TRUE )`). */
const COLLECTOR = 26452;
/** `WEAPON_ULTIMATE` (`dwReferStat1`). */
const WEAPON_ULTIMATE = 2;
/** `MAX_PIERCING_SUIT` 4, `MAX_PIERCING_WEAPON` 10 (`_Network/CmnHdr.h:561-563`). */
const MAX_PIERCING_SUIT = 4;
const MAX_PIERCING_WEAPON = 10;
/**
 * The element cards by element (`SAI79` FIRE 1, WATER 2, ELECTRICITY 3, EARTH 5, WIND 4), each pair the weak card and the
 * one RunUpgrade takes: FLAME 3206, RIVER 3211, GENERATOR 3216, DESERT 3221, CYCLON 3226.
 */
const CARD_ELEMENT: ReadonlyMap<number, number> = new Map([
  [3205, 1], [3206, 1], [3210, 2], [3211, 2], [3215, 3], [3216, 3], [3220, 5], [3221, 5], [3225, 4], [3226, 4],
]);
const TAKEN_CARDS: ReadonlySet<number> = new Set([3206, 3211, 3216, 3221, 3226]);
/** The protection scrolls whose buff spares the box: SMELPROT 10464, SMELPROT3 10488, SMELPROT4 26473. */
const SMELPROT = 10464, SMELPROT3 = 10488, SMELPROT4 = 26473;

/** What double-clicking `prop` starts: the upgrade cursor's kind, or null for an item that is not a material. */
export function upgradeKindOf(prop: WebItemProp): UpgradeKind | null {
  if (prop.id === ULTIMATE_GEM) return 'ultimate';
  if (prop.kind3 === IK3_ELECARD || prop.kind3 === IK3_ENCHANT || prop.kind3 === IK3_PIERDICE) return 'enchant';
  if (prop.kind3 === IK3_SOCKETCARD || prop.kind3 === IK3_SOCKETCARD2) return 'piercing';
  if (prop.kind3 === IK3_RANDOM_SCROLL) return 'randomScroll';
  if (prop.exeTarget === EXT_ITEM) return 'target';
  return null;
}

/** `IsDiceRefineryAble`: armour and weapons. */
const diceRefinable = (p: WebItemProp): boolean =>
  p.kind2 === IK2_ARMOR || p.kind2 === IK2_WEAPON_MAGIC || p.kind2 === IK2_WEAPON_DIRECT || p.kind2 === IK2_ARMORETC;
/** `IsEleRefineryAble`: a suit and weapons. */
const eleRefinable = (p: WebItemProp): boolean =>
  p.kind3 === IK3_SUIT || p.kind2 === IK2_WEAPON_MAGIC || p.kind2 === IK2_WEAPON_DIRECT;

/** `IsPierceAble( card's kind3 )`: a suit takes the suit cards (up to 4 sockets), a shield or weapon the others (10). */
function pierceable(target: WebItemProp, sockets: number, cardKind: number): boolean {
  if (target.kind3 === IK3_SUIT) return sockets <= MAX_PIERCING_SUIT && cardKind === IK3_SOCKETCARD;
  if (target.kind3 === IK3_SHIELD || target.kind2 === IK2_WEAPON_DIRECT || target.kind2 === IK2_WEAPON_MAGIC) {
    return sockets <= MAX_PIERCING_WEAPON && cardKind === IK3_SOCKETCARD2;
  }
  return false;
}

/** RunUpgrade's refusal of `target` (its prop and its bag item) for `material`: a TID said as a line, or null to go on. */
export function upgradeRefusal(material: WebItemProp, target: WebItemProp, item: InventoryItem): string | null {
  const kind = upgradeKindOf(material);
  if (kind === 'piercing') {
    const sockets = item.piercing ?? [];
    if (!pierceable(target, sockets.length, material.kind3)) return 'TID_PIERCING_POSSIBLE_ITEM';
    if (sockets.every((card) => card !== 0)) return 'TID_PIERCING_ERROR_NOPIERCING';
    return null;
  }
  if (material.kind3 === IK3_ELECARD) {
    if (!eleRefinable(target)) return 'TID_GAME_NOTEQUALITEM';
    const element = CARD_ELEMENT.get(material.id) ?? 0;
    if ((item.resist ?? 0) !== 0 && item.resist !== element) return 'TID_UPGRADE_ERROR_TWOELEMENT';
    if (!TAKEN_CARDS.has(material.id)) return 'TID_UPGRADE_ERROR_WRONGUPLEVEL';
    return null;
  }
  if (kind === 'ultimate') return target.referStat1 === WEAPON_ULTIMATE ? null : 'TID_GAME_NOTEQUALITEM';
  if (material.kind3 === IK3_ENCHANT) return diceRefinable(target) ? null : 'TID_GAME_NOTEQUALITEM';
  if (kind === 'randomScroll') {
    return target.kind1 === IK1_WEAPON || target.kind2 === IK2_ARMOR || target.kind2 === IK2_ARMORETC
      ? null : 'TID_GAME_RANDOMSCROLL_ERROR';
  }
  if (material.kind3 === IK3_PIERDICE && MOONSTONES.has(material.id)) {
    return target.id === COLLECTOR || target.kind2 === IK2_JEWELRY ? null : 'TID_GAME_NOTEQUALITEM';
  }
  return null;
}

/**
 * The smelt safety box before RunUpgrade (`CWndSmeltSafetyConfirm`, WndItemCtrl.cpp:852-922): from +3 (an element's +3)
 * without the protection scroll's buff on, its TID; null to go on. `hasBuff` tells an item buff of that id is on.
 */
export function safetyConfirm(
  material: WebItemProp, target: WebItemProp, item: InventoryItem, hasBuff: (itemId: number) => boolean,
): string | null {
  const ao = item.abilityOption ?? 0, rao = item.resistOption ?? 0;
  if (SUNSTONES.has(material.id) && ao >= 3 && diceRefinable(target) && !hasBuff(SMELPROT)) return 'TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL';
  if (material.id === ULTIMATE_GEM && target.referStat1 === WEAPON_ULTIMATE && !hasBuff(SMELPROT3)) {
    return 'TID_GAME_SMELT_SAFETY_CONFIRM_HIGHEST';
  }
  if (MOONSTONES.has(material.id) && ao >= 3 && target.kind2 === IK2_JEWELRY && !hasBuff(SMELPROT4)) {
    return 'TID_GAME_SMELT_SAFETY_CONFIRM_ACCESSARY';
  }
  if (material.kind3 === IK3_ELECARD && rao >= 3 && eleRefinable(target) && !hasBuff(SMELPROT)) return 'TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL';
  return null;
}

/** The packet a wait's end sends, and its two ids in their order (DO_USE_ITEM_TARGET: the material first). */
export interface UpgradeSend {
  packet: 'enchant' | 'ultimateEnchantWeapon' | 'piercing' | 'randomScroll' | 'doUseItemTarget';
  first: number;
  second: number;
}

/** `CWndInventory::Process` (:1664-1745): the packet for `kind`, the material at `materialId` on the target at `targetId`. */
export function upgradeSend(kind: UpgradeKind, materialId: number, targetId: number): UpgradeSend {
  switch (kind) {
    case 'enchant': return { packet: 'enchant', first: targetId, second: materialId };
    case 'ultimate': return { packet: 'ultimateEnchantWeapon', first: targetId, second: materialId };
    case 'piercing': return { packet: 'piercing', first: targetId, second: materialId };
    case 'randomScroll': return { packet: 'randomScroll', first: targetId, second: materialId };
    case 'target': return { packet: 'doUseItemTarget', first: materialId, second: targetId };
  }
}
