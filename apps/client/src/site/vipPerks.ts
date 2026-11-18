// 2026-11-19 (VIP perks): what the VIP page says each tier gives, and where the latest gift box went
// (docs/superpowers/specs/2026-11-19-vip-perks-design.md §6). The shop discount and the death rule are the shared numbers
// (packages/protocol vipPerks.ts, the World server's VipPerks.h); the Auto Play hours come with the tiers from the site.

import { VIP_SHOP_PERCENT, vipDeathExpFactor } from '@flyffweb/protocol';

const STARS = ['Bronze', 'Silver', 'Gold', 'Purple'];

/** The tier card's lines, in order. `autoPlayHours`: the weekly hours, null for no limit. */
export function tierPerks(level: number, autoPlayHours: number | null): string[] {
  const star = STARS[level - 1];
  const percent = VIP_SHOP_PERCENT[level as 0 | 1 | 2 | 3 | 4] ?? 0;
  const death = vipDeathExpFactor(level, false);
  return [
    ...(star === undefined ? [] : [`${star} star by your name`]),
    autoPlayHours === null ? 'Auto Play with no weekly limit' : `Auto Play ${autoPlayHours} h a week`,
    'Gift box every month',
    ...(percent > 0 ? [`${percent}% off NPC shops`] : []),
    ...(death === 0 ? ['No EXP lost on death'] : death < 1 ? ['Half EXP lost on death'] : []),
  ];
}

export interface GiftStatus { level: number; createdAt: string; sentAt: string | null; characterName: string | null }

/** The "Your VIP" panel's gift line, or null without any box. */
export function giftLine(gift: GiftStatus | null | undefined): string | null {
  if (gift === null || gift === undefined) return null;
  if (gift.sentAt === null) return `Your VIP ${gift.level} gift box is on its way: it goes to your character within 5 minutes (check your in-game mail).`;
  const when = new Date(gift.sentAt);
  const day = Number.isNaN(when.getTime()) ? gift.sentAt : when.toLocaleDateString();
  return `Your VIP ${gift.level} gift box was sent to ${gift.characterName ?? 'your character'} on ${day} (check your in-game mail).`;
}
