// custom (owner 2026-11-16, "do something like this": RaGEZONE's "Fully working pet filter Wakazaki Style", 2011): the Pet
// Filter. V15 has none (a pick-up pet takes every drop its owner may take, `CAIPet::SubItemLoot`, _AIInterface/AIPet.cpp).
// As the Wakazaki one: 19 checks in five groups, and a checked one is a kind the pet does NOT pick up
// (docs/superpowers/plans/2026-11-16-pet-filter.md). Auto Play's looting skips the same items.
//
// The checks, their bits (the post's `defineFilter.h`, FILTER_HPFOOD 1 ... FILTER_APIECARD 262144) and their labels (its
// resdata) are the post's. Its rules are kept, with three of its slips fixed: the FP food's `dwItemKind1 == IK3_DRINK` and
// the quest items' `dwItemKind2 == IK3_GEM` compared the wrong kind (so never matched); the weapons' checks read only
// `dwReferStat1`, which a buff pet shares (PET_VIS 1), so they now ask for a weapon; Blue Set Items asks for a suit or a
// helmet, gauntlets or boots (IK2_ARMOR, IK2_ARMORETC), not a fashion item. The World server has the same rules in
// `_Common/PetFilter.h` (the outer repo's patch); keep the two the same, bit for bit.

/** The checks, in the window's groups. */
export const PET_FILTER_CHECKS = [
  'hpFood', 'mpFood', 'fpFood', 'bWeapon', 'gWeapon', 'bSet', 'gSet', 'necklace', 'earring', 'ring', 'egg', 'sunstone',
  'moonstone', 'quest', 'eleCard', 'card4', 'card7', 'cardB', 'cardA',
] as const;
export type PetFilterCheck = typeof PET_FILTER_CHECKS[number];

/** A check's bit: the post's FILTER_* value, `1 << index`. */
export function petFilterBit(check: PetFilterCheck): number {
  return 1 << PET_FILTER_CHECKS.indexOf(check);
}

/** Nothing left behind: V15's behaviour, and the default. */
export const PET_FILTER_NONE = 0;
/** Every check's bit. */
export const PET_FILTER_ALL = (1 << PET_FILTER_CHECKS.length) - 1;

/** What the window shows for each check (the post's IDS_RESDATA_INC_008807 to 008851). */
export const PET_FILTER_LABELS: Readonly<Record<PetFilterCheck, string>> = {
  hpFood: 'HP Food', mpFood: 'MP Food', fpFood: 'FP Food',
  bWeapon: 'Blue Weapons', gWeapon: 'Green Weapons', bSet: 'Blue Set Items', gSet: 'Green Set Items',
  necklace: 'Necklace', earring: 'Earring', ring: 'Ring',
  egg: 'Egg', sunstone: 'Sunstone', moonstone: 'Moonstone', quest: 'Quest Items',
  eleCard: 'Element Card', card4: '4% Cards', card7: '7% Cards', cardB: 'B Cards', cardA: 'A Cards',
};

// Resource/defineItemkind.h
const IK1_WEAPON = 1, IK1_ARMOR = 2;
const IK2_ARMOR = 7, IK2_ARMORETC = 8, IK2_POTION = 12, IK2_FOOD = 14, IK2_GEM = 16;
const IK3_SHIELD = 16, IK3_REFRESHER = 25, IK3_EARRING = 27, IK3_NECKLACE = 28, IK3_RING = 29, IK3_DRINK = 35;
const IK3_ELECARD = 37, IK3_QUEST = 43;
/** `dwReferStat1`: WEAPON_GENERAL, WEAPON_UNIQUE, ARMOR_SET (defineItemkind.h). */
const WEAPON_GENERAL = 0, WEAPON_UNIQUE = 1, ARMOR_SET = 3;

// Resource/defineItem.h: the items the post names
const II_PET_EGG = 21029;
/** II_GEN_MAT_ORICHALCUM01, 02, 01_1, II_SYS_SYS_SCR_SCRAPORICHALCUM. */
const SUNSTONES: ReadonlySet<number> = new Set([2035, 2034, 2082, 26481]);
/** II_GEN_MAT_MOONSTONE, MOONSTONE_1, II_SYS_SYS_SCR_SCRAPMOONSTONE. */
const MOONSTONES: ReadonlySet<number> = new Set([2036, 2083, 26482]);
/** II_GEN_MAT_ELE_MAGMA, FLOOD, STORM, THUNDER, MOUNTAIN: V15's "... Card(4%)". */
const CARDS_4: ReadonlySet<number> = new Set([3207, 3212, 3227, 3217, 3222]);
/** II_GEN_MAT_ELE_EARTHQUAKE, LIGHTING, VACCUM, OCEAN, VOLCANO: V15's "... Card(7%)". */
const CARDS_7: ReadonlySet<number> = new Set([3223, 3218, 3228, 3213, 3208]);
/** II_GEN_MAT_ELE_CANDLEB, RAINATKB, BREEZEATKB, SPARKATKB, SANDATKB: "Fire Card (B)" ... */
const CARDS_B: ReadonlySet<number> = new Set([26596, 26600, 26604, 26608, 26612]);
/** II_GEN_MAT_ELE_SANDATKA, SPARKATKA, BREEZEATKA, RAINATKA, CANDLEA: "Land Card (A)" ... */
const CARDS_A: ReadonlySet<number> = new Set([26613, 26609, 26605, 26601, 26597]);

/** What the rules read of an item (`ItemProp`): its id, three kinds and `dwReferStat1` (none for `=`). */
export interface PetFilterItem {
  id: number;
  kind1: number;
  kind2: number;
  kind3: number;
  referStat1?: number;
}

/** Whether `check` takes in the item. */
export function petFilterMatches(check: PetFilterCheck, item: PetFilterItem): boolean {
  const { id, kind1, kind2, kind3, referStat1 } = item;
  switch (check) {
    case 'hpFood': return kind2 === IK2_FOOD;
    case 'mpFood': return kind3 === IK3_REFRESHER;
    case 'fpFood': return kind2 === IK2_POTION || kind3 === IK3_DRINK;
    case 'bWeapon': return kind1 === IK1_WEAPON && referStat1 === WEAPON_GENERAL;
    case 'gWeapon': return kind1 === IK1_WEAPON && referStat1 === WEAPON_UNIQUE;
    case 'bSet': return kind1 === IK1_ARMOR && (kind2 === IK2_ARMOR || kind2 === IK2_ARMORETC) && kind3 !== IK3_SHIELD && referStat1 !== ARMOR_SET;
    case 'gSet': return kind1 === IK1_ARMOR && referStat1 === ARMOR_SET;
    case 'necklace': return kind3 === IK3_NECKLACE;
    case 'earring': return kind3 === IK3_EARRING;
    case 'ring': return kind3 === IK3_RING;
    case 'egg': return id === II_PET_EGG;
    case 'sunstone': return SUNSTONES.has(id);
    case 'moonstone': return MOONSTONES.has(id);
    case 'quest': return kind2 === IK2_GEM || kind3 === IK3_QUEST;
    case 'eleCard': return kind3 === IK3_ELECARD;
    case 'card4': return CARDS_4.has(id);
    case 'card7': return CARDS_7.has(id);
    case 'cardB': return CARDS_B.has(id);
    case 'cardA': return CARDS_A.has(id);
  }
}

/**
 * Whether the filter leaves the item on the ground: any checked check that takes it in (the post's `b1 = FALSE`). Penya and
 * an item the data does not know are always picked up.
 */
export function petFilterBlocks(mask: number, item: PetFilterItem | undefined): boolean {
  if (mask === PET_FILTER_NONE || item === undefined) return false;
  return PET_FILTER_CHECKS.some((check) => (mask & petFilterBit(check)) !== 0 && petFilterMatches(check, item));
}

/** Any stored value as a mask: a whole number within the checks' bits, else nothing left behind. */
export function clampPetFilter(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= PET_FILTER_ALL ? value : PET_FILTER_NONE;
}

/** The browser's one setting, for every character, as the post kept it in Neuz.ini ("Petfilter"). */
export const PET_FILTER_KEY = 'flyffweb.petFilter';

/** The kept filter, or nothing left behind where there is none or the browser blocks storage. */
export function loadPetFilter(storage: Pick<Storage, 'getItem'> | null): number {
  try {
    const raw = storage?.getItem(PET_FILTER_KEY);
    return raw === null || raw === undefined ? PET_FILTER_NONE : clampPetFilter(Number(raw));
  } catch {
    return PET_FILTER_NONE;
  }
}

/** Keeps the filter; a browser that blocks storage keeps it for this visit only. */
export function savePetFilter(storage: Pick<Storage, 'setItem'> | null, mask: number): void {
  try {
    storage?.setItem(PET_FILTER_KEY, String(clampPetFilter(mask)));
  } catch {
    // storage full or blocked: the filter still holds until the page closes
  }
}
