import { describe, expect, it } from 'vitest';
import { CHIP_VENDOR, II_CHP_RED, chipCost, chipsFreeSlot, chipsHeld, isChipVendor, opensShop } from '../src/world/hud/chipShop';
import { itemProp } from './helpers/ownState';

describe('the Red Chip merchant (2026-11-15)', () => {
  it('a shop opens at a penya vendor (type 0, or none) and at the chip vendor (type 1) alone', () => {
    expect(II_CHP_RED).toBe(26460); expect(CHIP_VENDOR).toBe(1);
    const npc = (vendorType?: number) => ({ key: 'k', name: 'N', ...(vendorType === undefined ? {} : { vendorType }) });
    expect([undefined, 0, 1, 2].map((type) => opensShop(npc(type)))).toEqual([true, true, true, false]);
    expect(opensShop(undefined)).toBe(true);
    expect([undefined, 0, 1, 2].map((type) => isChipVendor(npc(type)))).toEqual([false, false, true, false]);
  });

  it("GetChipCost: dwReferValue1, -1 when the row gives none", () => {
    expect(chipCost(itemProp({ id: 1, referValue1: 10000 }))).toBe(10000);
    expect(chipCost(itemProp({ id: 1 }))).toBe(-1);
    expect(chipCost(undefined)).toBe(-1);
  });

  it('GetAtItemNum( II_CHP_RED ): all the stacks', () => {
    expect(chipsHeld([
      { objectId: 3, itemId: II_CHP_RED, count: 9999 }, { objectId: 1, itemId: 2800, count: 5 },
      { objectId: 8, itemId: II_CHP_RED, count: 1 },
    ])).toBe(10000);
    expect(chipsHeld([])).toBe(0);
  });

  it("OnBuyChipItem's full bag: a stack's worth or more goes on; less, only when the first chip stack is used up", () => {
    const bag = [{ objectId: 9, itemId: II_CHP_RED, count: 100 }, { objectId: 4, itemId: II_CHP_RED, count: 3000 }];
    expect(chipsFreeSlot(bag, 9999, 9999)).toBe(true);
    expect(chipsFreeSlot([], 10000, 9999)).toBe(true);
    // the first stack is object 4's (GetAtId order), not the bag order's first
    expect(chipsFreeSlot(bag, 3000, 9999)).toBe(true);
    expect(chipsFreeSlot(bag, 2999, 9999)).toBe(false);
    expect(chipsFreeSlot(bag, 100, 9999)).toBe(false);
    expect(chipsFreeSlot([], 1, 9999)).toBe(false);
  });
});
