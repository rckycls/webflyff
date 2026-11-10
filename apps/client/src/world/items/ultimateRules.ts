// The jewel windows' rules (2026-11-10, docs/superpowers/specs/2026-11-10-jewels-research.md): what Create Jewels and Jewel
// Setting take, the jewel a weapon breaks into, the socket a jewel goes in, and the set jewels' stats the tooltip shows.
//
//   CWndExtraction::OnDropIcon      _Interface/WndField.cpp:19763-19792   a general weapon of level 60+, or a unique one
//   CWndSmeltJewel::OnDropIcon      WndField.cpp:20300-20363              an Ultimate weapon, then one of the five jewels
//   CWndSmeltJewel::InitializeJewel WndField.cpp:20464-20520              the usable socket
//   CUltimateWeapon::GetGemKind     _Common/UltimateWeapon.cpp:104-115    the jewel by the weapon's level (LEVEL_GEM)
//   CUltimateWeapon::GetDestParamUltimate / GetDST  :838-910             the set jewels' stats (ABILITY)

import type { WebItemProp, WebUltimate } from '@flyffweb/formats';

/** II_GEN_MAT_DIAMOND, EMERALD, SAPPHIRE, RUBY, TOPAZ (Resource/defineItem.h:880-884). */
export const JEWELS: ReadonlySet<number> = new Set([2029, 2030, 2031, 2032, 2033]);
/** IK1_WEAPON; IK2_WEAPON_DIRECT, _MAGIC (defineItemkind.h). */
const IK1_WEAPON = 1;
const IK2_WEAPON_DIRECT = 2;
const IK2_WEAPON_MAGIC = 3;
/** `dwReferStat1`: WEAPON_GENERAL, WEAPON_UNIQUE, WEAPON_ULTIMATE (defineItemkind.h:232-234). */
const WEAPON_GENERAL = 0;
const WEAPON_UNIQUE = 1;
const WEAPON_ULTIMATE = 2;
/** The least level of a general weapon Create Jewels takes. */
const CREATE_LEVEL = 60;

export const isJewel = (itemId: number): boolean => JEWELS.has(itemId);

/** `ItemProp::IsUltimate` (_Common/ProjectCmn.h:368-376): a weapon whose `dwReferStat1` is WEAPON_ULTIMATE. */
export function isUltimate(prop: WebItemProp): boolean {
  return (prop.kind2 === IK2_WEAPON_DIRECT || prop.kind2 === IK2_WEAPON_MAGIC) && prop.referStat1 === WEAPON_ULTIMATE;
}

/** Create Jewels' slot: a weapon, general from level 60 or unique. */
export function canCreateJewels(prop: WebItemProp): boolean {
  if (prop.kind1 !== IK1_WEAPON) return false;
  const stat = prop.referStat1 ?? WEAPON_GENERAL;
  return (stat === WEAPON_GENERAL && (prop.limitLevel ?? 0) >= CREATE_LEVEL) || stat === WEAPON_UNIQUE;
}

/** The jewel a weapon of `level` breaks into, or null (NULL_ID) for a level no LEVEL_GEM row holds. */
export function gemKind(level: number, ultimate: WebUltimate | undefined): number | null {
  return ultimate?.levelGems.find((row) => level <= row.max && level >= row.min)?.jewel ?? null;
}

/** The socket the next jewel goes in: the count of set jewels while it is below the open sockets', else -1. */
export function usableSocket(sockets: readonly number[]): number {
  const set = sockets.filter((jewel) => jewel !== 0).length;
  return set < sockets.length ? set : -1;
}

/**
 * The set jewels' stats as [DST, value], in rising DST order (the C++ `map<int, int>`): each ability jewel counted up to
 * the first empty socket, its value for that count, and one DST's values added up. The ability jewel's DST is its
 * ABILITY block's (the propItem row's `dwReferStat2`, which GetDST looks the block up by).
 */
export function ultimateDestParams(sockets: readonly number[], ultimate: WebUltimate | undefined): Array<[number, number]> {
  if (ultimate === undefined) return [];
  const counts = new Map<number, number>();
  for (const jewel of sockets) {
    if (jewel === 0) break;
    counts.set(jewel, (counts.get(jewel) ?? 0) + 1);
  }
  const sums = new Map<number, number>();
  for (const [ability, count] of counts) {
    for (const block of ultimate.abilities) {
      const row = block.jewels.find((each) => each.ability === ability);
      if (row === undefined) continue;
      sums.set(block.dst, (sums.get(block.dst) ?? 0) + (row.values[count - 1] ?? 0));
      break;
    }
  }
  return [...sums].sort(([a], [b]) => a - b);
}
