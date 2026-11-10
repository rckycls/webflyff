// 2026-11-10: the jewel windows' rules (docs/superpowers/specs/2026-11-10-jewels-research.md §2-§4).
import { describe, expect, it } from 'vitest';
import type { WebItemProp, WebUltimate } from '@flyffweb/formats';
import {
  JEWELS, canCreateJewels, gemKind, isJewel, isUltimate, ultimateDestParams, usableSocket,
} from '../src/world/items/ultimateRules';

const prop = (fields: Partial<WebItemProp>): WebItemProp => ({ id: 1, name: 'x', kind1: 1, kind2: 2, kind3: 0, ...fields } as WebItemProp);

const ULTIMATE: WebUltimate = {
  abilities: [
    { dst: 35, jewels: [{ jewel: 2033, ability: 2041, values: [228, 455, 683, 910, 1365] }, { jewel: 2032, ability: 2040, values: [455, 910, 1365, 1820, 2730] }] },
    { dst: 83, jewels: [{ jewel: 2033, ability: 2046, values: [13, 25, 38, 50, 75] }, { jewel: 2032, ability: 2045, values: [25, 50, 75, 100, 150] }] },
    { dst: 81, jewels: [{ jewel: 2033, ability: 2056, values: [5, 10, 15, 20, 30] }] },
  ],
  levelGems: [{ jewel: 2033, min: 60, max: 70 }, { jewel: 2032, min: 71, max: 85 }, { jewel: 2029, min: 120, max: 120 }],
  descriptions: {},
};

describe('the jewel rules', () => {
  it('Create Jewels takes a general weapon of level 60 or more, or a unique one (CWndExtraction::OnDropIcon, :19763-19792)', () => {
    expect(canCreateJewels(prop({ referStat1: 0, limitLevel: 60 }))).toBe(true);
    expect(canCreateJewels(prop({ referStat1: 0, limitLevel: 59 }))).toBe(false);
    expect(canCreateJewels(prop({ referStat1: 1, limitLevel: 15 }))).toBe(true);
    expect(canCreateJewels(prop({ referStat1: 2, limitLevel: 75 }))).toBe(false);
    expect(canCreateJewels(prop({ kind1: 2, referStat1: 1 }))).toBe(false);
  });

  it('the jewel a weapon breaks into goes by its level (GetGemKind, UltimateWeapon.cpp:104-115)', () => {
    expect(gemKind(60, ULTIMATE)).toBe(2033);
    expect(gemKind(85, ULTIMATE)).toBe(2032);
    expect(gemKind(120, ULTIMATE)).toBe(2029);
    expect(gemKind(100, ULTIMATE)).toBeNull();
  });

  it('Jewel Setting takes an Ultimate weapon and one of the five jewels (CWndSmeltJewel::OnDropIcon, :20300-20363)', () => {
    expect(isUltimate(prop({ kind2: 2, referStat1: 2 }))).toBe(true);
    expect(isUltimate(prop({ kind2: 3, referStat1: 2 }))).toBe(true);
    expect(isUltimate(prop({ kind2: 7, referStat1: 2 }))).toBe(false);
    expect(isUltimate(prop({ kind2: 2, referStat1: 1 }))).toBe(false);
    expect([...JEWELS]).toEqual([2029, 2030, 2031, 2032, 2033]);
    expect(isJewel(2032)).toBe(true);
    expect(isJewel(2040)).toBe(false);
  });

  it('the usable socket is the count of set jewels while some are empty (InitializeJewel, :20464-20520)', () => {
    expect(usableSocket([])).toBe(-1);
    expect(usableSocket([0, 0])).toBe(0);
    expect(usableSocket([2041, 0, 0])).toBe(1);
    expect(usableSocket([2041, 2046])).toBe(-1);
  });

  it('the set jewels\' stats: counted up to the first empty socket, by DST in rising order (GetDestParamUltimate, :838-881)', () => {
    expect(ultimateDestParams([2046, 2041, 2041, 0, 2046], ULTIMATE)).toEqual([[35, 455], [83, 13]]);
    // two jewels of one DST add up
    expect(ultimateDestParams([2045, 2046, 2056], ULTIMATE)).toEqual([[81, 5], [83, 25 + 13]]);
    expect(ultimateDestParams([], ULTIMATE)).toEqual([]);
    expect(ultimateDestParams([2041], undefined)).toEqual([]);
  });
});
