// 2026-11-15 (Guild Siege, B3): the rules of Frankie's and Donaris's windows (guildCombat/guildCombatRules.ts).
import { describe, expect, it } from 'vitest';
import { GcTid, bidRefusal, countdownParts, joinRefusal, ownRank, penyaNotice, statusRankRed } from '../src/world/guildCombat/guildCombatRules';

describe('bidRefusal (WndGuildCombat1to1.cpp:670-718)', () => {
  it('a guild that has bid must bid more than it has', () => {
    expect(bidRefusal(200, 200, 100)).toBe(GcTid.MORE_CURRENT_REQUEST);
    expect(bidRefusal(150, 200, 100)).toBe(GcTid.MORE_CURRENT_REQUEST);
    expect(bidRefusal(201, 200, 100)).toBeNull();
  });

  it('a first bid must reach the minimum', () => {
    expect(bidRefusal(99, 0, 100)).toBe(GcTid.LIMIT_MIN);
    expect(bidRefusal(100, 0, 100)).toBeNull();
    expect(bidRefusal(0, 0, 100)).toBe(GcTid.LIMIT_MIN);
  });
});

describe('statusRankRed (WndField.cpp:16562-16575, the 12 of the owner)', () => {
  it('is red only past the 12th place', () => {
    expect(statusRankRed(12)).toBe(false);
    expect(statusRankRed(13)).toBe(true);
    expect(statusRankRed(1)).toBe(false);
  });
});

describe('joinRefusal (WndField.cpp:17031-17065)', () => {
  it('a vagrant cannot join', () => {
    expect(joinRefusal(true)).toBe(GcTid.NOTENTER_VAGRANT);
    expect(joinRefusal(false)).toBeNull();
  });
});

describe('ownRank (DPClient.cpp:6904-6910)', () => {
  it('is the 1-based place by the name without case, 0 with none', () => {
    expect(ownRank(['Alpha', 'Bravo', 'Charlie'], 'bravo')).toBe(2);
    expect(ownRank(['Alpha'], 'Zulu')).toBe(0);
    expect(ownRank(['Alpha'], '')).toBe(0);
  });
});

describe('penyaNotice (DPClient.cpp:7106-7187)', () => {
  it('the guild master\'s results', () => {
    expect(penyaNotice('guild', 0, 5000, 0)).toEqual({ tid: GcTid.JACKPOT, penya: 5000n });
    expect(penyaNotice('guild', 1, 700, 0)).toEqual({ tid: GcTid.JACKPOT_CANCEL, penya: 700n });
    expect(penyaNotice('guild', 2, 0, 0)).toEqual({ tid: GcTid.WINNER_NOT_GUILD, penya: null });
  });

  it('result 3 is the overflow: LIMIT2 past an int, LIMIT1 when the own penya could not hold it', () => {
    expect(penyaNotice('guild', 3, 3_000_000_000n, 0)).toEqual({ tid: GcTid.JACKPOT_LIMIT2, penya: null });
    expect(penyaNotice('guild', 3, 1_000_000_000, 1_500_000_000)).toEqual({ tid: GcTid.JACKPOT_LIMIT1, penya: null });
    expect(penyaNotice('guild', 3, 10, 10)).toBeNull();
  });

  it('the best player\'s results', () => {
    expect(penyaNotice('player', 0, 9, 0)).toEqual({ tid: GcTid.MVP_PENYA, penya: 9n });
    expect(penyaNotice('player', 1, 0, 0)).toEqual({ tid: GcTid.NOT_MVP, penya: null });
    expect(penyaNotice('player', 2, 3_000_000_000n, 0)).toEqual({ tid: GcTid.JACKPOT_LIMIT2, penya: null });
  });
});

describe('countdownParts', () => {
  it('splits seconds into days, hours, minutes and seconds', () => {
    expect(countdownParts(90_061)).toEqual({ day: 1, hour: 1, minute: 1, second: 1 });
    expect(countdownParts(59)).toEqual({ day: 0, hour: 0, minute: 0, second: 59 });
    expect(countdownParts(-5)).toEqual({ day: 0, hour: 0, minute: 0, second: 0 });
  });
});
