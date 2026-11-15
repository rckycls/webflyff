// custom (owner 2026-11-16): the loot filter. V15 has none (no filter in Neuz or the World server; a pick-up pet takes
// every drop its owner may take, `CAIPet::SubItemLoot`, _AIInterface/AIPet.cpp:105-170). The player checks the kinds
// of item their pick-up pet and Auto Play may pick up (docs/superpowers/plans/2026-11-16-pet-loot-filter.md).
//
// The groups come from what V15's monsters drop (`DropItem`/`DropKind` in Resource/propMoverEx.inc) and are read from
// the item's three kinds (Resource/defineItemkind.h). The World server has the same rules in `_Common/PetLootFilter.h`
// (the outer repo's patch); keep the two the same, bit for bit.

/** The filter's groups, in the window's order; a group's bit is `1 << index`. */
export const LOOT_KINDS = ['penya', 'potions', 'weapons', 'armour', 'jewellery', 'materials', 'quest', 'other'] as const;
export type LootKind = typeof LOOT_KINDS[number];

/** What the window shows for each group. */
export const LOOT_KIND_LABELS: Readonly<Record<LootKind, string>> = {
  penya: 'Penya',
  potions: 'Potions and food',
  weapons: 'Weapons',
  armour: 'Armour',
  jewellery: 'Jewellery',
  materials: 'Upgrade materials',
  quest: 'Quest items',
  other: 'Other',
};

/** Every group checked: V15's behaviour, and the default. */
export const LOOT_ALL = (1 << LOOT_KINDS.length) - 1;

// Resource/defineItemkind.h
const IK1_GOLD = 0, IK1_WEAPON = 1, IK1_ARMOR = 2;
const IK2_REFRESHER = 11, IK2_POTION = 12, IK2_JEWELRY = 13, IK2_FOOD = 14, IK2_GEM = 16, IK2_MATERIAL = 17;
const IK3_GEM = 34, IK3_QUEST = 43, IK3_PILL = 59;

/** An item's three kinds (`ItemProp::dwItemKind1..3`). */
export interface ItemKinds {
  kind1: number;
  kind2: number;
  kind3: number;
}

/**
 * The group of an item. The first rule that fits wins:
 * penya (`IK1_GOLD`); potions and food (`IK2_REFRESHER`, `IK2_POTION`, `IK2_FOOD`, `IK3_PILL`, as Auto Play's pots);
 * weapons (`IK1_WEAPON`); armour (`IK1_ARMOR`: suits, helmets, gauntlets, boots, shields, clothes);
 * jewellery (`IK2_JEWELRY`: rings, necklaces, earrings); upgrade materials (`IK2_MATERIAL`: cards, moonstones,
 * sunstones, jewels); quest items (`IK2_GEM`, `IK3_GEM`, `IK3_QUEST`: the monster parts quests ask for);
 * other (everything else: scrolls, keys, boxes, eggs ...).
 */
export function lootKindOf(item: ItemKinds): LootKind {
  const { kind1, kind2, kind3 } = item;
  if (kind1 === IK1_GOLD) return 'penya';
  if (kind2 === IK2_REFRESHER || kind2 === IK2_POTION || kind2 === IK2_FOOD || kind3 === IK3_PILL) return 'potions';
  if (kind1 === IK1_WEAPON) return 'weapons';
  if (kind1 === IK1_ARMOR) return 'armour';
  if (kind2 === IK2_JEWELRY) return 'jewellery';
  if (kind2 === IK2_MATERIAL) return 'materials';
  if (kind2 === IK2_GEM || kind3 === IK3_GEM || kind3 === IK3_QUEST) return 'quest';
  return 'other';
}

export function lootBit(kind: LootKind): number {
  return 1 << LOOT_KINDS.indexOf(kind);
}

/** Whether `mask` lets the item be picked up. An item the data does not know counts as "other". */
export function lootAllowed(mask: number, item: ItemKinds | undefined): boolean {
  return (mask & lootBit(item === undefined ? 'other' : lootKindOf(item))) !== 0;
}

/** Any stored value as a mask: a whole number within the groups' bits, else every group. */
export function clampLootMask(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LOOT_ALL ? value : LOOT_ALL;
}
