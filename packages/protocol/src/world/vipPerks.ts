// The VIP perks' numbers (2026-11-19, the owner's picks, docs/superpowers/specs/2026-11-19-vip-perks-design.md): the
// NPC shop discount and how much of the death EXP loss a VIP keeps. The World server's `_Common/VipPerks.h` (outer repo
// patch 2026-11-19-vip-perks) does the same sums in the same integers; both are checked against the same table.

import { Authority } from './authority';

/** II_SYS_SYS_SCR_PERIN: bought for 100,000,000 penya and sold back for as much, so never discounted. */
export const PERIN_ITEM_ID = 26456;

/** Whole percent off an NPC shop's penya price, by VIP level (0 = not VIP). */
export const VIP_SHOP_PERCENT = Object.freeze([0, 5, 10, 15, 20] as const);

const VIP_LETTERS: readonly string[] = [Authority.VIP1, Authority.VIP2, Authority.VIP3, Authority.VIP4];

/** The VIP level of an authority letter (or its char code): A 1, B 2, C 3, E 4, anything else 0. Lower case is not VIP. */
export function vipLevelOf(authority: number | string): 0 | 1 | 2 | 3 | 4 {
  const letter = typeof authority === 'string' ? authority.charAt(0) : String.fromCharCode(authority);
  return (VIP_LETTERS.indexOf(letter) + 1) as 0 | 1 | 2 | 3 | 4;
}

/**
 * An NPC shop's penya price for one unit, as a VIP pays it: `cost - floor(cost * percent / 100)`. The full `cost` stays
 * for Perin, for an unknown level, and whenever the VIP price would be at or below `sellBack` (what an NPC pays for one
 * unit), so nobody makes penya by buying and selling back.
 */
export function vipShopPrice(cost: number, sellBack: number, itemId: number, vipLevel: number): number {
  const percent = VIP_SHOP_PERCENT[vipLevel as 0 | 1 | 2 | 3 | 4];
  if (percent === undefined || percent === 0 || itemId === PERIN_ITEM_ID) return cost;
  const price = cost - Math.floor((cost * percent) / 100);
  return price <= sellBack ? cost : price;
}

/** How much of the EXP lost on death a player loses: half for VIP1-2, none for VIP3-4; all for others and chaotic ones. */
export function vipDeathExpFactor(vipLevel: number, chaotic: boolean): number {
  if (chaotic) return 1;
  if (vipLevel === 1 || vipLevel === 2) return 0.5;
  if (vipLevel === 3 || vipLevel === 4) return 0;
  return 1;
}
