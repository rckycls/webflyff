// The VIP perks' numbers (2026-11-19, docs/superpowers/specs/2026-11-19-vip-perks-design.md): the shop discount and the
// death EXP rule. The World server's _Common/VipPerks.h holds the same numbers and is checked against the same table.
import { describe, expect, it } from 'vitest';
import { PERIN_ITEM_ID, SETTABLE_AUTHORITIES, VIP_SHOP_PERCENT, vipDeathExpFactor, vipLevelOf, vipShopPrice } from '../src';

describe('vipLevelOf', () => {
  it('reads VIP1-VIP4 from A, B, C, E (letters or char codes), and 0 for anything else, lower case too', () => {
    expect([vipLevelOf('A'), vipLevelOf('B'), vipLevelOf('C'), vipLevelOf('E'), vipLevelOf('F'), vipLevelOf('P'), vipLevelOf(0x41), vipLevelOf('a')])
      .toEqual([1, 2, 3, 4, 0, 0, 1, 0]);
  });
});

describe('vipShopPrice', () => {
  it('takes 5, 10, 15 or 20 whole percent off, in integers', () => {
    expect(VIP_SHOP_PERCENT).toEqual([0, 5, 10, 15, 20]);
    expect([0, 1, 2, 3, 4].map((v) => vipShopPrice(1000, 250, 1, v))).toEqual([1000, 950, 900, 850, 800]);
    expect(vipShopPrice(999, 249, 1, 4)).toBe(800);
  });

  it('never discounts Perin', () => {
    expect(PERIN_ITEM_ID).toBe(26456);
    expect(vipShopPrice(100_000_000, 25_000_000, PERIN_ITEM_ID, 4)).toBe(100_000_000);
  });

  it('keeps the full price when the VIP price would be at or below what an NPC pays back', () => {
    expect(vipShopPrice(10, 9, 1, 4)).toBe(10);
    expect(vipShopPrice(10, 8, 1, 4)).toBe(10);
    expect(vipShopPrice(10, 7, 1, 4)).toBe(8);
    expect(vipShopPrice(1, 1, 1, 4)).toBe(1);
  });

  it('gives no discount for an unknown level', () => {
    expect(vipShopPrice(1000, 250, 1, 5)).toBe(1000);
    expect(vipShopPrice(1000, 250, 1, -1)).toBe(1000);
  });
});

describe('vipDeathExpFactor', () => {
  it('halves the loss for VIP1-2, takes none for VIP3-4, and leaves chaotic players and others as they are', () => {
    expect([vipDeathExpFactor(1, false), vipDeathExpFactor(2, false), vipDeathExpFactor(3, false), vipDeathExpFactor(4, false), vipDeathExpFactor(0, false), vipDeathExpFactor(4, true)])
      .toEqual([0.5, 0.5, 0, 0, 1, 1]);
  });
});

it('no longer lets the panel set VIP letters by hand (they come from the VIP tab)', () => {
  for (const letter of ['A', 'B', 'C', 'E']) expect(SETTABLE_AUTHORITIES).not.toContain(letter);
});
