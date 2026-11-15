// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, B2): the siege book (guildCombat/guildCombatBook.ts), the trophy rule and the instant revive.
import { describe, expect, it } from 'vitest';
import type { GuildCombatMessage } from '@flyffweb/protocol';
import { GuildCombatBook } from '../src/world/guildCombat/guildCombatBook';
import { GcState, SIEGE, trophyOf } from '../src/world/guildCombat/guildCombatRules';
import { ReviveWindow } from '../src/world/hud/reviveWindow';
import type { UiArt } from '../src/world/hud/art';

const T = 'guildCombat' as const;
const gcState = (state: number, warState: number): GuildCombatMessage => ({ type: T, sub: 'gcState', state, warState });

describe('GuildCombatBook', () => {
  it('has the client defaults: CLOSE, WAR_CLOSE, no winner, no best player', () => {
    const book = new GuildCombatBook();
    expect([book.state, book.warState, book.winGuildId, book.bestPlayerId]).toEqual([GcState.CLOSE, GcState.WAR_CLOSE, 0, 0]);
  });

  it('GC_GCSTATE at login sets state and warState', () => {
    const book = new GuildCombatBook();
    const events = book.apply(gcState(GcState.WAR, GcState.WAR_WAR), 1000);
    expect([book.state, book.warState]).toEqual([2, 104]);
    expect(events.some((e) => e.kind === 'tags')).toBe(true);
  });

  it('winGuild and bestPlayer set the trophy owners; isRequest sets requested', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'winGuild', combatIndex: 4, winGuildId: 77, winCount: 3 }, 0);
    book.apply({ type: T, sub: 'bestPlayer', playerId: 501 }, 0);
    book.apply({ type: T, sub: 'isRequest', requested: true }, 0);
    expect([book.winGuildId, book.winCount, book.bestPlayerId, book.requested]).toEqual([77, 3, 501, true]);
  });

  it('USERSTATE sets one mover\'s combat state, and only that mover\'s', () => {
    const book = new GuildCombatBook();
    const events = book.apply({ type: T, sub: 'userState', moverId: 12, state: 1 }, 0);
    expect(book.combatStateOf(12)).toBe(1);
    expect(book.combatStateOf(13)).toBe(0);
    expect(events).toContainEqual({ kind: 'userState', moverId: 12, state: 1 });
    book.forget(12);
    expect(book.combatStateOf(12)).toBe(0);
  });

  it('combatStateOf falls back to the mover\'s own state from ADD_OBJ', () => {
    const book = new GuildCombatBook((id) => (id === 5 ? 2 : 0));
    expect(book.combatStateOf(5)).toBe(2);
    book.apply({ type: T, sub: 'userState', moverId: 5, state: 0 }, 0);
    expect(book.combatStateOf(5)).toBe(0);
  });

  it('keeps the arrival time of every count-down', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'nextTimeState', msLeft: 30_000, nextState: GcState.WAR }, 5_000);
    expect(book.countdown).toEqual({ label: GcState.WAR, endsAt: 35_000 });
    book.apply({ type: T, sub: 'enterTime', msLeft: 10_000 }, 6_000);
    expect(book.countdown).toEqual({ label: GcState.ENTER, endsAt: 16_000 });
  });

  it('keeps the line-ups, the own list, the boards, the log and the points', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'warPlayerList', guilds: [{ defenderId: 9, members: [{ playerId: 9, status: 1 }, { playerId: 8, status: 0 }] }] }, 0);
    expect(book.warPlayers.get(9)).toEqual([{ id: 9, status: 1 }, { id: 8, status: 0 }]);
    book.apply({ type: T, sub: 'warPlayerList', guilds: [] }, 0);
    expect(book.warPlayers.size).toBe(0);
    book.apply({ type: T, sub: 'guildStatus', joinIndex: 5, players: [{ playerId: 9, lives: 6 }] }, 0);
    expect(book.guildStatus).toEqual({ joinIndex: 5, players: [{ playerId: 9, lives: 6 }] });
    book.apply({ type: T, sub: 'guildPrecedence', guilds: [{ has: true, name: 'A', points: 3 }, { has: false }] }, 0);
    expect(book.guildRanks).toHaveLength(2);
    book.apply({ type: T, sub: 'playerPrecedence', guilds: [[{ playerId: 1, points: 2 }]] }, 0);
    expect(book.playerRanks).toEqual([[{ playerId: 1, points: 2 }]]);
    book.apply({ type: T, sub: 'playerPoint', players: [{ playerId: 1, job: 2, point: 3 }] }, 0);
    expect(book.playerPoints).toEqual([{ playerId: 1, job: 2, point: 3 }]);
    const entry = { atkGuildId: 1, defGuildId: 2, atkPlayerId: 3, defPlayerId: 4, point: 5, diffGuild: true, master: false, defender: false, lastLife: false };
    book.apply({ type: T, sub: 'log', entries: [entry] }, 0);
    expect(book.log).toEqual([entry]);
    book.apply({ type: T, sub: 'logRealtime', ...entry, atkName: 'x', defName: 'y' }, 0);
    expect(book.log).toHaveLength(2);
  });
});

describe('SIEGE', () => {
  it('holds the plan\'s values', () => {
    expect(SIEGE).toEqual({
      maxGuilds: 12, minGuilds: 3, maxJoinMembers: 10, maxWarPlayers: 5, lives: 6, guildLevel: 50, fighterLevel: 30,
      minBid: 100_000_000, openTimes: ['06:52', '18:52'], worldId: 202,
    });
  });
});

describe('trophyOf', () => {
  const book = (state: number, win: number, best: number) => {
    const b = new GuildCombatBook();
    b.apply(gcState(state, GcState.WAR_CLOSE), 0);
    b.apply({ type: T, sub: 'winGuild', combatIndex: 1, winGuildId: win, winCount: 1 }, 0);
    b.apply({ type: T, sub: 'bestPlayer', playerId: best }, 0);
    return b;
  };
  it('best beats winner; none outside CLOSE_STATE; none without a guild', () => {
    const closed = book(GcState.CLOSE, 77, 501);
    expect(trophyOf(closed, 501, 77)).toBe('best');
    expect(trophyOf(closed, 502, 77)).toBe('winner');
    expect(trophyOf(closed, 502, 78)).toBeNull();
    expect(trophyOf(closed, 501, 0)).toBeNull();
    expect(trophyOf(closed, 502, 0)).toBeNull();
    for (const state of [GcState.OPEN, GcState.WAR, GcState.COMPLET_CLOSE, GcState.GM_CLOSE]) {
      expect(trophyOf(book(state, 77, 501), 501, 77)).toBeNull();
    }
  });
});

describe('the instant revive (DPClient.cpp:2043-2045)', () => {
  const art: UiArt = { url: () => '', sheets: null };
  const died = [{ kind: 'died' }] as never;
  it('own death with combat state 1 sends REVIVAL_TO_LODESTAR and opens no revive window', () => {
    const sent: string[] = [];
    const revive = new ReviveWindow(art, new Map(), () => void sent.push('REVIVAL_TO_LODESTAR'));
    let state = 1;
    revive.instantRevive = () => state === 1;
    revive.play(died);
    expect(sent).toEqual(['REVIVAL_TO_LODESTAR']);
    expect(revive.isOpen).toBe(false);
    state = 0;
    revive.play(died);
    expect(revive.isOpen).toBe(true);
    expect(sent).toHaveLength(1);
    revive.dispose();
  });
});
