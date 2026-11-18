// 2026-11-19 (VIP perks): what the VIP page's tier cards and "Your VIP" line say (src/site/vipPerks.ts).
import { describe, expect, it } from 'vitest';
import { giftLine, tierPerks } from '../src/site/vipPerks';

describe('tierPerks', () => {
  it('lists the star, the Auto Play hours, the gift box, the shop discount and the death rule', () => {
    expect(tierPerks(1, 24)).toEqual([
      'Bronze star by your name', 'Auto Play 24 h a week', 'Gift box every month', '5% off NPC shops', 'Half EXP lost on death',
      'Bag sort and Penya to Perin buttons',
    ]);
    const four = tierPerks(4, null).join(' | ');
    expect(four).toContain('20% off NPC shops');
    expect(four).toContain('No EXP lost on death');
    expect(four).toContain('no weekly limit');
    expect(tierPerks(3, 48)).toContain('No EXP lost on death');
  });
});

describe('giftLine', () => {
  it('says where the latest box went (and that mail is kept 15 days), or that it is waiting', () => {
    expect(giftLine(null)).toBeNull();
    const sent = giftLine({ level: 2, createdAt: '2026-11-19T12:00:00Z', sentAt: '2026-11-19T12:03:00Z', characterName: 'Main' })!;
    expect(sent).toMatch(/^Your VIP 2 gift box was sent to Main on /);
    expect(sent).toMatch(/collect it from your in-game mail within 15 days\.$/);
    expect(giftLine({ level: 2, createdAt: '2026-11-19T12:00:00Z', sentAt: null, characterName: null }))
      .toBe('Your VIP 2 gift box is waiting: it goes by in-game mail to your character within 5 minutes once you have one.');
    expect(giftLine({ level: 2, createdAt: '2026-11-19T12:00:00Z', sentAt: '2026-11-19T12:03:00Z', characterName: null, cancelled: true }))
      .toBe('Your VIP 2 gift box was cancelled.');
  });
});
