// 2026-11-15 (item tooltip gaps): the tax an item tooltip's shop prices count (CTax, Source/_Common/Tax.cpp:96-160;
// CContinent::GetContinent and GetArea, Continent.cpp:256-343): where the player stands, the rates of its area, and the
// items no tax applies to.

import { describe, expect, it } from 'vitest';
import { TaxBook, taxApplies, taxArea, tooltipTax } from '../src/world/items/tax';

/** Two continents of Madrigal as data/worldMap.json holds them: Flaris (1) and Darkon 1-2 (241), ascending id. */
const CONTINENTS = [
  { id: 1, map: 5, ring: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]] as Array<[number, number]> },
  { id: 241, map: 1, ring: [[200, 0], [300, 0], [300, 100], [200, 100], [200, 0]] as Array<[number, number]> },
];
const MADRIGAL = 1, GUILD_WAR = 202, ARENA = 208;

describe('taxArea: the area of the player (CContinent::GetArea( pMover ))', () => {
  it('in Madrigal, the continent its outline holds: east up to 15, west from 240; none outside every outline', () => {
    expect(taxArea(MADRIGAL, { x: 50.7, z: 50.2 }, CONTINENTS)).toBe(15);
    expect(taxArea(MADRIGAL, { x: 250, z: 50 }, CONTINENTS)).toBe(240);
    expect(taxArea(MADRIGAL, { x: 150, z: 50 }, CONTINENTS)).toBe(0);
  });

  it('the Arena is Darkon 1-2 (west), the guild war world Flaris (east), any other world none', () => {
    expect(taxArea(ARENA, { x: 150, z: 50 }, CONTINENTS)).toBe(240);
    expect(taxArea(GUILD_WAR, { x: 150, z: 50 }, CONTINENTS)).toBe(15);
    expect(taxArea(7, { x: 50, z: 50 }, CONTINENTS)).toBe(0);
  });
});

describe('TaxBook: TAX_ALLINFO kept as CTax keeps it', () => {
  it('the rates of an area, nTaxRate * 0.1f * 0.1f; 0 before any came', () => {
    const book = new TaxBook();
    expect(book.rates(15)).toEqual({ sales: 0, purchase: 0 });
    book.apply({ type: 'taxInfo', continents: [
      { continent: 15, guildId: 9, rates: [{ kind: 0, rate: 5 }, { kind: 1, rate: 7 }, { kind: 2, rate: 1000 }] },
      { continent: 240, guildId: 0xffffffff, rates: [{ kind: 0, rate: 0 }, { kind: 1, rate: 20 }] },
    ] });
    const f = (n: number): number => Math.fround(Math.fround(n * Math.fround(0.1)) * Math.fround(0.1));
    expect(book.rates(15)).toEqual({ sales: f(5), purchase: f(7) });
    expect(book.rates(240)).toEqual({ sales: 0, purchase: f(20) });
    expect(book.rates(0)).toEqual({ sales: 0, purchase: 0 });
  });
});

describe('taxApplies and tooltipTax (CTax::IsApplyTaxRate)', () => {
  it('every item but perin, the red chip and the two awakening scrolls', () => {
    expect([1, 26456, 26460, 26461, 20024].map(taxApplies)).toEqual([true, false, false, false, false]);
  });

  it('the rates where the player stands, null off every continent', () => {
    const book = new TaxBook();
    book.apply({ type: 'taxInfo', continents: [{ continent: 240, guildId: 1, rates: [{ kind: 0, rate: 10 }, { kind: 1, rate: 10 }] }] });
    expect(tooltipTax(book, MADRIGAL, { x: 250, z: 50 }, CONTINENTS)).toEqual(book.rates(240));
    expect(tooltipTax(book, MADRIGAL, { x: 150, z: 50 }, CONTINENTS)).toBeNull();
    expect(tooltipTax(book, MADRIGAL, { x: 250, z: 50 }, undefined)).toBeNull();
  });
});
