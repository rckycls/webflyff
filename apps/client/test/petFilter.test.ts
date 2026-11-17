// custom (owner 2026-11-16): the Pet Filter's rules (items/petFilter.ts), the Wakazaki pet filter's checks on V15's items.

import { describe, expect, it } from 'vitest';
import {
  PET_FILTER_ALL, PET_FILTER_CHECKS, PET_FILTER_KEY, PET_FILTER_LABELS, PET_FILTER_NONE, clampPetFilter, loadPetFilter,
  petFilterBit, petFilterBlocks, petFilterMatches, savePetFilter,
} from '../src/world/items/petFilter';
import type { PetFilterCheck, PetFilterItem } from '../src/world/items/petFilter';

/**
 * V15 items' kinds and `dwReferStat1` (Resource/propItem.txt through the converter). The ids are V15's where a check reads
 * the id (eggs, stones, cards); the others are placeholders.
 */
const item = (id: number, kind1: number, kind2: number, kind3: number, referStat1?: number): PetFilterItem =>
  (referStat1 === undefined ? { id, kind1, kind2, kind3 } : { id, kind1, kind2, kind3, referStat1 });
const ITEMS: ReadonlyArray<[name: string, item: PetFilterItem, check: PetFilterCheck | null]> = [
  ['Penya', item(12, 0, 0, 0), null],
  ['Pizza', item(2401, 3, 14, 30), 'hpFood'],
  ['Gray Pill', item(2525, 3, 14, 59), 'hpFood'],
  ['Fourth Refresher', item(2504, 3, 11, 25), 'mpFood'],
  ['VitalDrink 300', item(2519, 3, 12, 35), 'fpFood'],
  ['Antidote Potion', item(2521, 3, 12, 26), 'fpFood'],
  ['Wooden Sword', item(21, 1, 2, 201, 0), 'bWeapon'],
  ['Guardian Sword', item(5000, 1, 2, 201, 1), 'gWeapon'],
  ["Lusaka's Sword", item(5100, 1, 2, 201, 2), null],
  ['Police Club', item(30, 1, 2, 201), null],
  ['Cotton Suit', item(500, 2, 7, 1), 'bSet'],
  ['Pike Helmet', item(501, 2, 8, 2), 'bSet'],
  ['Parmil Suit', item(502, 2, 7, 18, 3), 'gSet'],
  ['Parmil Boots', item(503, 2, 8, 20, 3), 'gSet'],
  ['a shield', item(504, 2, 7, 16), null],
  ['Santa Suit (M)', item(505, 2, 9, 3), null],
  ['Tiny Tanuki (a buff pet, PET_VIS 1)', item(21032, 3, 28, 100, 1), null],
  ['Gore Necklace +1', item(2600, 3, 13, 28), 'necklace'],
  ['Demol Earring +1', item(2601, 3, 13, 27), 'earring'],
  ['Vigorring +1', item(2602, 3, 13, 29), 'ring'],
  ['Egg', item(21029, 3, 28, 120), 'egg'],
  ['White Tiger Cage', item(21039, 3, 28, 120), null],
  ['Sunstone', item(2035, 3, 17, 119), 'sunstone'],
  ['Shining Oricalkum', item(2034, 3, 17, 119), 'sunstone'],
  ['Event Sunstone', item(2082, 3, 17, 119), 'sunstone'],
  ['Sunstone Piece', item(26481, 5, 19, 50), 'sunstone'],
  ['Moonstone', item(2036, 3, 17, 61), 'moonstone'],
  ['Event Moonstone', item(2083, 3, 17, 61), 'moonstone'],
  ['Moonstone Piece', item(26482, 5, 19, 50), 'moonstone'],
  ['Twinkle Stone', item(3000, 3, 16, 34), 'quest'],
  ['Small Burudeng Tooth', item(3100, 5, 19, 43), 'quest'],
  ['Yellow Giftbox', item(3200, 5, 19, 34), null],
  ['Flame Card', item(3206, 3, 17, 37), 'eleCard'],
  ['Volcano Card(4%)', item(3207, 3, 17, 62), 'card4'],
  ['Vacuum Card(4%)', item(3227, 3, 17, 62), 'card4'],
  ['Volcano Card(7%)', item(3208, 3, 17, 62), 'card7'],
  ['Earthquake Card(7%)', item(3223, 3, 17, 62), 'card7'],
  ['Volcano Card(2%)', item(3204, 3, 17, 62), null],
  ['Fire Card (B)', item(26596, 3, 17, 63), 'cardB'],
  ['Land Card (B)', item(26612, 3, 17, 63), 'cardB'],
  ['Fire Card (A)', item(26597, 3, 17, 63), 'cardA'],
  ['Land Card (A)', item(26613, 3, 17, 63), 'cardA'],
  ['Fire Card (C)', item(26595, 3, 17, 63), null],
];

describe('the Pet Filter checks (the Wakazaki pet filter)', () => {
  it('has its 19 checks with its FILTER_* bits and its labels', () => {
    expect(PET_FILTER_CHECKS).toHaveLength(19);
    expect(petFilterBit('hpFood')).toBe(1);
    expect(petFilterBit('ring')).toBe(512);
    expect(petFilterBit('quest')).toBe(8192);
    expect(petFilterBit('card4')).toBe(32768);
    expect(petFilterBit('cardA')).toBe(262144);
    expect(PET_FILTER_ALL).toBe(0x7ffff);
    expect(PET_FILTER_LABELS.card4).toBe('4% Cards');
    expect(PET_FILTER_LABELS.bSet).toBe('Blue Set Items');
  });

  it.each(ITEMS)('%s is taken in by its check only', (_name, it_, check) => {
    expect(PET_FILTER_CHECKS.filter((c) => petFilterMatches(c, it_))).toEqual(check === null ? [] : [check]);
  });
});

describe('petFilterBlocks', () => {
  it('leaves nothing behind by default (V15), and picks up penya and an unknown item whatever is checked', () => {
    for (const [, it_] of ITEMS) expect(petFilterBlocks(PET_FILTER_NONE, it_)).toBe(false);
    expect(petFilterBlocks(PET_FILTER_ALL, ITEMS[0]![1])).toBe(false);
    expect(petFilterBlocks(PET_FILTER_ALL, undefined)).toBe(false);
  });

  it('leaves an item behind when a check that takes it in is checked', () => {
    const ring = item(2602, 3, 13, 29);
    expect(petFilterBlocks(petFilterBit('ring'), ring)).toBe(true);
    expect(petFilterBlocks(PET_FILTER_ALL & ~petFilterBit('ring'), ring)).toBe(false);
    // the post's FP food check: IK2_POTION or IK3_DRINK; Soju (IK2_FOOD, IK3_DRINK) under HP and FP food both
    const soju = item(2530, 3, 14, 35);
    expect(petFilterBlocks(petFilterBit('fpFood'), soju)).toBe(true);
    expect(petFilterBlocks(petFilterBit('hpFood'), soju)).toBe(true);
  });
});

describe('the kept filter', () => {
  it('reads a whole number within the 19 bits, anything else as nothing left behind', () => {
    expect(clampPetFilter(0x8200)).toBe(0x8200);
    expect(clampPetFilter(0x7ffff)).toBe(0x7ffff);
    expect(clampPetFilter(0x80000)).toBe(PET_FILTER_NONE);
    expect(clampPetFilter(-1)).toBe(PET_FILTER_NONE);
    expect(clampPetFilter(1.5)).toBe(PET_FILTER_NONE);
    expect(clampPetFilter('3')).toBe(PET_FILTER_NONE);
  });

  it('is one setting of the browser, for every character, and survives a blocked or broken store', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(loadPetFilter(storage)).toBe(PET_FILTER_NONE);
    savePetFilter(storage, 0x8200);
    expect(store.get(PET_FILTER_KEY)).toBe(String(0x8200));
    expect(loadPetFilter(storage)).toBe(0x8200);
    store.set(PET_FILTER_KEY, 'junk');
    expect(loadPetFilter(storage)).toBe(PET_FILTER_NONE);
    expect(loadPetFilter(null)).toBe(PET_FILTER_NONE);
    const throwing = { getItem: (): string => { throw new Error('blocked'); }, setItem: (): void => { throw new Error('blocked'); } };
    expect(loadPetFilter(throwing)).toBe(PET_FILTER_NONE);
    expect(() => savePetFilter(throwing, 1)).not.toThrow();
  });
});
