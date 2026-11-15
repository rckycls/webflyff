import { describe, expect, it } from 'vitest';
import { LOOT_ALL, LOOT_KINDS, clampLootMask, lootAllowed, lootBit, lootKindOf } from '../src/world/items/lootFilter';

// Kinds of real V15 drops (Resource/propItem.txt), as the tally of propMoverEx.inc's DropItem lines found them.
const DROPS: Array<[string, number, number, number, string]> = [
  ['II_GOLD_SEED1', 0, 0, 0, 'penya'],
  ['II_GEN_REF_REF_FIRST', 3, 11, 25, 'potions'],
  ['II_GEN_POT_DRI_VITAL100', 3, 12, 35, 'potions'],
  ['II_GEN_FOO_COO_MEATSKEWER', 3, 14, 31, 'potions'],
  ['II_GEN_FOO_PIL_YELLOW', 3, 14, 59, 'potions'],
  ['II_WEA_SWO_KEHIN', 1, 2, 2, 'weapons'],
  ['II_WEA_WAN_NEFUME', 1, 3, 6, 'weapons'],
  ['II_ARM_M_MER_SUIT0101', 2, 7, 18, 'armour'],
  ['II_ARM_M_MER_BOOTS0101', 2, 8, 20, 'armour'],
  ['II_ARM_ARM_SHI_LIGHT', 2, 7, 16, 'armour'],
  ['II_GEN_JEW_RIN_STRRING', 3, 13, 29, 'jewellery'],
  ['II_GEN_JEW_NEC_FPNECKLACE', 3, 13, 28, 'jewellery'],
  ['II_GEN_MAT_ELE_FLAME', 3, 17, 37, 'materials'],
  ['II_GEN_MAT_MOONSTONE', 3, 17, 61, 'materials'],
  ['II_GEN_MAT_ORICHALCUM01', 3, 17, 119, 'materials'],
  ['II_GEN_MAT_DIAMOND', 3, 17, 102, 'materials'],
  ['II_GEN_GEM_GEM_TWINKLESTONE', 3, 16, 34, 'quest'],
  ['II_SYS_SYS_QUE_RUBY01', 5, 19, 34, 'quest'],
  ['II_SYS_SYS_SCR_AWAKECANCEL', 5, 19, 50, 'other'],
  ['II_SYS_SYS_KEY_COPPER', 5, 19, -1, 'other'],
  ['II_PET_EGG', 3, 28, 120, 'other'],
];

describe('lootKindOf', () => {
  it.each(DROPS)('%s is %s', (_name, kind1, kind2, kind3, group) => {
    expect(lootKindOf({ kind1, kind2, kind3 })).toBe(group);
  });
});

describe('lootAllowed', () => {
  const ring = { kind1: 3, kind2: 13, kind3: 29 };
  it('takes everything with every group checked', () => {
    for (const [, kind1, kind2, kind3] of DROPS) expect(lootAllowed(LOOT_ALL, { kind1, kind2, kind3 })).toBe(true);
  });
  it('skips an unchecked group', () => {
    expect(lootAllowed(LOOT_ALL & ~lootBit('jewellery'), ring)).toBe(false);
    expect(lootAllowed(lootBit('jewellery'), ring)).toBe(true);
  });
  it('counts an unknown item as other', () => {
    expect(lootAllowed(lootBit('other'), undefined)).toBe(true);
    expect(lootAllowed(LOOT_ALL & ~lootBit('other'), undefined)).toBe(false);
  });
  it('has the bits the server reads: penya 1 ... other 128', () => {
    expect(LOOT_KINDS.map(lootBit)).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
    expect(LOOT_ALL).toBe(0xff);
  });
});

describe('clampLootMask', () => {
  it('keeps a mask in range and falls back to every group', () => {
    expect(clampLootMask(5)).toBe(5);
    expect(clampLootMask(0)).toBe(0);
    expect(clampLootMask(256)).toBe(LOOT_ALL);
    expect(clampLootMask(-1)).toBe(LOOT_ALL);
    expect(clampLootMask(1.5)).toBe(LOOT_ALL);
    expect(clampLootMask('3')).toBe(LOOT_ALL);
    expect(clampLootMask(undefined)).toBe(LOOT_ALL);
  });
});
