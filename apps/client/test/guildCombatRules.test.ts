// 2026-11-15 (Guild Siege, B3): the rules of Frankie's and Donaris's windows (guildCombat/guildCombatRules.ts).
import { describe, expect, it } from 'vitest';
import {
  GcTid, SIEGE, bidRefusal, defenderRefusal, joinRefusal, lineupAddRefusal, lineupBand, lineupFinishRefusal, ownRank, parseBid, penyaNotice,
  statusRankRed,
} from '../src/world/guildCombat/guildCombatRules';

const RICH = 2_147_483_647;

describe('bidRefusal (WndGuildCombat1to1.cpp:670-718)', () => {
  it('a guild that has bid must bid more than it has', () => {
    expect(bidRefusal(200, 200, 100, RICH)).toBe(GcTid.MORE_CURRENT_REQUEST);
    expect(bidRefusal(150, 200, 100, RICH)).toBe(GcTid.MORE_CURRENT_REQUEST);
    expect(bidRefusal(201, 200, 100, RICH)).toBeNull();
  });

  it('a first bid must reach the minimum', () => {
    expect(bidRefusal(99, 0, 100, RICH)).toBe(GcTid.LIMIT_MIN);
    expect(bidRefusal(100, 0, 100, RICH)).toBeNull();
    expect(bidRefusal(0, 0, 100, RICH)).toBe(GcTid.LIMIT_MIN);
  });

  // final review, Important 1: the u32 on the wire would wrap a bid over 2^32, and the server drops one over INT_MAX
  it('a bid over INT_MAX is refused with the siege\'s not-enough-penya text (eveschool.cpp:853-881)', () => {
    expect(bidRefusal(5_000_000_000, 0, 100_000_000, RICH)).toBe(GcTid.REQUEST_NOTPENYA);
    expect(bidRefusal(2_147_483_648, 0, 100_000_000, RICH)).toBe(GcTid.REQUEST_NOTPENYA);
    expect(bidRefusal(4_000_000_000, 2_000_000_000, 100_000_000, 2_000_000_000)).toBe(GcTid.REQUEST_NOTPENYA);
  });

  it('a bid over the own penya and the own current bid is refused; INT_MAX itself is fine when affordable', () => {
    expect(bidRefusal(300, 100, 50, 199)).toBe(GcTid.REQUEST_NOTPENYA);
    expect(bidRefusal(299, 100, 50, 199)).toBeNull();
    expect(bidRefusal(150_000_000, 0, 100_000_000, 149_999_999)).toBe(GcTid.REQUEST_NOTPENYA);
    expect(bidRefusal(2_147_483_647, 0, 100_000_000, 2_147_483_647)).toBeNull();
    expect(bidRefusal(2_147_483_647, 1_000_000_000, 100_000_000, 1_147_483_647)).toBeNull();
  });
});

describe('parseBid (the offer\'s field)', () => {
  it('reads every digit, the commas and other marks skipped; none is 0', () => {
    expect(parseBid('1,000,000')).toBe(1_000_000);
    expect(parseBid('100000000')).toBe(100_000_000);
    expect(parseBid(' 5 000 ')).toBe(5000);
    expect(parseBid('5,000,000,000')).toBe(5_000_000_000);
    expect(parseBid('')).toBe(0);
    expect(parseBid('abc')).toBe(0);
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

describe('the line-up window (WndField.cpp:16153-16369; B4)', () => {
  const lv40 = { playerId: 7, level: 40 };

  it('refuses at the server limit, not Neuz off-by-one', () => {
    const nine = [1, 2, 3, 4, 5, 6, 8, 9, 10];
    expect(lineupAddRefusal(lv40, nine.slice(0, 8), 10)).toBeNull();
    expect(lineupAddRefusal(lv40, nine, 10)).toBeNull();
    expect(lineupAddRefusal(lv40, [...nine, 11], 10)).toBe(GcTid.SELECTION_MAX);
  });

  it('refuses level 29, a non-member and one already listed', () => {
    expect(lineupAddRefusal({ playerId: 7, level: 29 }, [], 10)).toBe(GcTid.LIMIT_LEVEL_NOTICE);
    expect(lineupAddRefusal({ playerId: 7, level: 30 }, [], 10)).toBeNull();
    expect(lineupAddRefusal(null, [], 10)).toBe(GcTid.NOT_GUILD_MEMBER);
    expect(lineupAddRefusal(lv40, [3, 7], 10)).toBe(GcTid.ALREADY_ENTRY);
  });

  it('Complete: defender first, then an empty list, then a master or kingpin', () => {
    expect(lineupFinishRefusal([1, 2], 0, [1])).toBe(GcTid.NOT_ASSIGN_DEFENDER);
    expect(lineupFinishRefusal([], 5, [1])).toBe(GcTid.HAVENOT_PLAYER);
    expect(lineupFinishRefusal([2, 3], 3, [1])).toBe(GcTid.HAVENOT_MASTER);
    expect(lineupFinishRefusal([2, 1], 2, [1])).toBeNull();
  });

  it('the guild master cannot defend when more than one entrant is listed', () => {
    expect(defenderRefusal(1, 1, 2)).toBe(GcTid.MASTER_NOT_ASSIGN_DEFENDER);
    expect(defenderRefusal(1, 1, 1)).toBeNull();
    expect(defenderRefusal(2, 1, 5)).toBeNull();
  });

  it('the first SIEGE.maxWarPlayers rows are drawn blue, the rest red', () => {
    const bands = Array.from({ length: 8 }, (_, i) => lineupBand(i, SIEGE.maxWarPlayers));
    expect(bands).toEqual(['blue', 'blue', 'blue', 'blue', 'blue', 'red', 'red', 'red']);
  });
});
