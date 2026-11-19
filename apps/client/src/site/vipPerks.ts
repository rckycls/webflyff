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
    // custom (owner 2026-11-19): the bag's two VIP buttons (hud/inventoryWindow.ts vipTools)
    'Bag sort and Penya to Perin buttons',
  ];
}

export interface GiftStatus { level: number; createdAt: string; sentAt: string | null; characterName: string | null; cancelled?: boolean }

/**
 * The "Your VIP" panel's gift line, or null without any box. The game deletes a mail 15 days after it was sent
 * (`post.cpp`), so a sent box says to collect it in time.
 */
export function giftLine(gift: GiftStatus | null | undefined): string | null {
  if (gift === null || gift === undefined) return null;
  if (gift.cancelled === true) return `Your VIP ${gift.level} gift box was cancelled.`;
  if (gift.sentAt === null) return `Your VIP ${gift.level} gift box is waiting: it goes by in-game mail to your character within 5 minutes once you have one.`;
  const when = new Date(gift.sentAt);
  const day = Number.isNaN(when.getTime()) ? gift.sentAt : when.toLocaleDateString();
  return `Your VIP ${gift.level} gift box was sent to ${gift.characterName ?? 'your character'} on ${day}: collect it from your in-game mail within 15 days.`;
}
