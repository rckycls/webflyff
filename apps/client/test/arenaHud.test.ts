// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, B5): the arena's HUD (hud/guildCombat/arenaHud.ts; docs/guild-siege/research/A-client.md §4.1,
// §4.3, §3.2): the count-down, the guild and player boards, the own-guild list, the "be ready" lines, the state lines and
// captions of GC_GCSTATE, the music, and the per-kill line of GC_LOG_REALTIME.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GuildCombatMessage } from '@flyffweb/protocol';
import {
  ArenaHud, ArenaState, cutName, guildBoardRows, ownGuildRows, playerBoardRows, siegeClockText,
} from '../src/world/hud/guildCombat/arenaHud';
import type { ArenaHudHost, ArenaStateHost } from '../src/world/hud/guildCombat/arenaHud';
import { attackAble } from '../src/world/combat/attackLoop';
import { isSiegeTarget, siegeSideOf } from '../src/world/combat/siege';
import { GuildCombatBook } from '../src/world/guildCombat/guildCombatBook';
import { GcState } from '../src/world/guildCombat/guildCombatRules';
import { addedPlayer, gameDataOf, moverFrom } from './helpers/movers';

const T = 'guildCombat' as const;
type Body = GuildCombatMessage extends infer M ? (M extends { type: string } ? Omit<M, 'type'> : never) : never;
const msg = (m: Body): GuildCombatMessage => ({ type: T, ...m } as GuildCombatMessage);

const TEXTS: Record<string, string> = {
  TID_GAME_GUILDCOMBAT_MAINTENANCE: 'Maintenance Schedule', TID_GAME_GUILDCOMBAT_WAR: 'Start Combat',
  TID_GAME_GUILDCOMBAT_WAR_END: 'End combat', TID_GAME_GUILDCOMBAT_EXIT_MSG: 'Teleporting to Flaris',
  TID_GAME_GUILDCOMBAT_PLAYER_MAKEUP_FINISH: 'Time for organizing line up and preparation for Guild Siege.',
  TID_GAME_GUILDCOMBAT_JOIN_LIMIT_TIME: 'Time Limit', TID_GAME_GUILDCOMBAT_JOIN_NOW: 'Guild Siege mode is now available.',
  TID_GAME_GUILDCOMBAT_NOW_PLAYER_MAKEUP: 'From now on, you can organize the entry of guild siege.',
  TID_GAME_GUILDCOMBAT_MAINTENANCE2: 'Combat starts right after server maintenance. Prepare for war!',
  TID_GAME_GUILDCOMBAT_RATE: 'Current rank:', TID_GAME_GUILDCOMBAT_PERSON_RATE: 'Individual rank:',
  TID_GAME_GUILDCOMBAT_JOIN_READY: 'Gain entrance when one of your guild mates dies.', TID_GAME_GUILDCOMBAT_JOIN_READY2: 'Be ready!',
};

const OWN_ID = 500, OWN_OBJ = 9000, OWN_GUILD = 7, RIVAL_GUILD = 8;
const GUILD_NAMES = ['Alpha', 'Bakers', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
/** 12 guilds, the own (Bakers) eighth by points. */
const twelve = (): GuildCombatMessage => msg({
  sub: 'guildPrecedence', guilds: GUILD_NAMES.map((name, i) => ({ has: true as const, name, points: name === 'Bakers' ? 3 : 100 - i * 5 })),
});
/** 25 players in two guilds, the own one 15th. */
const players = (): GuildCombatMessage => msg({
  sub: 'playerPrecedence',
  guilds: [
    Array.from({ length: 13 }, (_, i) => ({ playerId: 700 + i, points: 60 - i * 2 })),
    [...Array.from({ length: 11 }, (_, i) => ({ playerId: 800 + i, points: 59 - i * 2 })), { playerId: OWN_ID, points: 1 }],
  ],
});

interface Said { lines: Array<[string, number]>; chat: Array<[string, number]>; captions: string[]; music: Array<[number, number]> }
function stateHost(world: { id: number; rank: number | null }, said: Said): ArenaStateHost {
  return {
    worldId: () => world.id, ownGuildRank: () => world.rank, text: (tid) => TEXTS[tid] ?? '',
    line: (text, color) => said.lines.push([text, color]), chat: (text, color) => said.chat.push([text, color]),
    caption: (text) => said.captions.push(text), music: (id, loops) => said.music.push([id, loops]),
    guildName: (id) => ({ [OWN_GUILD]: 'Bakers', [RIVAL_GUILD]: 'Alpha' } as Record<number, string>)[id],
  };
}
const said = (): Said => ({ lines: [], chat: [], captions: [], music: [] });

function hudHost(compact = false): ArenaHudHost & { compactNow: boolean } {
  const host = {
    compactNow: compact,
    worldId: () => 202, ownPlayerId: () => OWN_ID, ownName: () => 'Webby', ownGuildName: () => 'Bakers',
    nameOf: (id: number) => (id === OWN_ID ? 'Webby' : `P${id}`), hpOf: (id: number) => (id === OWN_ID ? 0.5 : null),
    compact: () => host.compactNow, text: (tid: string) => TEXTS[tid] ?? '',
  };
  return host;
}

let layer: HTMLElement;
const huds: ArenaHud[] = [];
function make(book: GuildCombatBook, state: ArenaState, host = hudHost()): ArenaHud {
  const hud = new ArenaHud(host, book, state, document);
  layer.append(hud.element);
  huds.push(hud);
  return hud;
}
const rows = (hud: ArenaHud, board: 'guild' | 'player') =>
  [...hud.element.querySelectorAll(`[data-board="${board}"] .hud-siege-row`)] as HTMLElement[];
const textOf = (row: Element) => [...row.children].map((c) => c.textContent).join('|');

beforeEach(() => {
  document.body.replaceChildren();
  layer = document.createElement('div');
  document.body.append(layer);
});
afterEach(() => { for (const hud of huds.splice(0)) hud.dispose(); });

describe('the texts', () => {
  it('a name keeps 5 characters, and "..." from 5 on (GetStrCut, WndWorld.cpp:1291-1302)', () => {
    expect(cutName('Bakers')).toBe('Baker...');
    expect(cutName('Bravo')).toBe('Bravo...');
    expect(cutName('Echo')).toBe('Echo');
    expect(cutName('')).toBe('');
  });
  it('the count-down is "%s %.2d:%.2d:%.2d" and goes at 0 (WndWorld.cpp:1163-1197)', () => {
    expect(siegeClockText('End combat', 1_799_500)).toBe('End combat 00:29:59');
    expect(siegeClockText('Time Limit', 3_725_000)).toBe('Time Limit 01:02:05');
    expect(siegeClockText('Time Limit', 999)).toBeNull();
    expect(siegeClockText('Time Limit', -5)).toBeNull();
  });
});

describe('the boards (WndWorld.cpp:1248-1458)', () => {
  it('the desktop guild board lists all 12 guilds, the highest first, the own guild light blue', () => {
    const book = new GuildCombatBook();
    book.apply(twelve(), 0);
    const { rows: list, own } = guildBoardRows(book.guildRanks, 'Bakers');
    expect(list).toHaveLength(12);
    expect(own).toBeNull();
    expect(list[0]).toMatchObject({ rank: ' 1', name: 'Alpha...', points: '100', color: 0xffffff99 });
    expect(list[11]).toMatchObject({ rank: '12', name: 'Baker...', points: '3', color: 0xff9ed3ff, own: true });
  });
  it('a tie shares the rank: the later rows of it have none; a guild with no entrants is left out', () => {
    const { rows: list } = guildBoardRows([
      { has: true, name: 'A', points: 5 }, { has: false }, { has: true, name: 'B', points: 5 }, { has: true, name: 'C', points: 2 },
    ], '');
    // the multimap's reverse order: of two at 5 points the later one comes first
    expect(list.map((r) => [r.rank, r.name])).toEqual([[' 1', 'B'], ['  ', 'A'], [' 2', 'C']]);
  });
  it('the player board shows the top 10, then the own row after a gap when the own player is lower', () => {
    const book = new GuildCombatBook();
    book.apply(players(), 0);
    const nameOf = (id: number) => (id === OWN_ID ? 'Webby' : `P${id}`);
    const board = playerBoardRows(book.playerRanks, OWN_ID, nameOf, 'Webby');
    expect(board.rows).toHaveLength(10);
    expect(board.rows[0]).toMatchObject({ rank: ' 1', name: 'P700', points: '60' });
    expect(board.rows[1]).toMatchObject({ rank: ' 2', name: 'P800', points: '59' });
    expect(board.own).toMatchObject({ rank: '25', name: 'Webby...', points: '1', color: 0xff9ed3ff });
    // the own player in the top 10: no extra row
    const top = playerBoardRows([[{ playerId: OWN_ID, points: 9 }, { playerId: 2, points: 3 }]], OWN_ID, nameOf, 'Webby');
    expect(top.own).toBeNull();
    expect(top.rows[0]).toMatchObject({ name: 'Webby...', color: 0xff9ed3ff });
    // not on the board at all: rank 0 and 0 points; an empty board: none
    expect(playerBoardRows([[{ playerId: 2, points: 3 }]], OWN_ID, nameOf, 'Webby').own).toMatchObject({ rank: ' 0', points: '0' });
    expect(playerBoardRows([], OWN_ID, nameOf, 'Webby').own).toBeNull();
  });
  it('the HUD draws them at (width - 150, 200), the player board 50 px under the last guild row', () => {
    const book = new GuildCombatBook();
    book.apply(twelve(), 0);
    book.apply(players(), 0);
    const hud = make(book, new ArenaState(book, stateHost({ id: 202, rank: 4 }, said())));
    hud.update(0);
    const guild = hud.element.querySelector('[data-board="guild"]') as HTMLElement;
    const player = hud.element.querySelector('[data-board="player"]') as HTMLElement;
    expect([guild.style.right, guild.style.top, guild.style.width, guild.style.height]).toEqual(['10px', '190px', '150px', `${15 * 16}px`]);
    expect(player.style.top).toBe(`${190 + 15 * 16 + 26}px`);
    expect(rows(hud, 'guild')).toHaveLength(12);
    expect(rows(hud, 'player')).toHaveLength(11); // the top 10 and the own row
    expect(textOf(rows(hud, 'player')[10]!)).toBe('25|Webby...|1');
    expect(guild.querySelector('.hud-siege-title')!.textContent).toBe('Current rank:');
    expect(player.querySelector('.hud-siege-title')!.textContent).toBe('Individual rank:');
  });
  it('on the phone (350 px tall or less) each board shows the top 5 and the own row, and folds on a tap of its title', () => {
    const book = new GuildCombatBook();
    book.apply(twelve(), 0);
    book.apply(players(), 0);
    const hud = make(book, new ArenaState(book, stateHost({ id: 202, rank: 4 }, said())), hudHost(true));
    hud.update(0);
    expect(hud.element.dataset.compact).toBe('true');
    expect(rows(hud, 'guild')).toHaveLength(6);
    expect(textOf(rows(hud, 'guild')[5]!)).toBe('12|Baker...|3');
    expect(rows(hud, 'player')).toHaveLength(6);
    expect(textOf(rows(hud, 'player')[5]!)).toBe('25|Webby...|1');
    const title = hud.element.querySelector('[data-board="guild"] .hud-siege-title') as HTMLButtonElement;
    expect(title.tagName).toBe('BUTTON');
    expect(title.getAttribute('aria-expanded')).toBe('true');
    title.click();
    hud.update(10);
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(rows(hud, 'guild').filter((r) => !r.hidden)).toHaveLength(0);
    expect(rows(hud, 'player').filter((r) => !r.hidden)).toHaveLength(6);
    title.click();
    hud.update(20);
    expect(rows(hud, 'guild').filter((r) => !r.hidden)).toHaveLength(6);
  });
  it('only in 202', () => {
    const book = new GuildCombatBook();
    book.apply(twelve(), 0);
    const host = { ...hudHost(), worldId: () => 1 };
    const hud = make(book, new ArenaState(book, stateHost({ id: 1, rank: 4 }, said())), host);
    hud.update(0);
    expect((hud.element.querySelector('[data-board="guild"]') as HTMLElement).hidden).toBe(true);
  });
});

describe('the own-guild list (WndWorld.cpp:1461-1618)', () => {
  const lists = new Map([[OWN_ID, [{ id: OWN_ID, status: 1 }, { id: 501, status: 1 }, { id: 502, status: 0 }, { id: 503, status: 0 }]]]);
  const status = { joinIndex: 2, players: [{ playerId: OWN_ID, lives: 6 }, { playerId: 501, lives: 2 }, { playerId: 502, lives: 3 }, { playerId: 503, lives: 0 }] };
  it('lives are shown as max(n-1, 0); the next to go in green after a gap, the dead grey after one; D for a defender', () => {
    const list = ownGuildRows(status, lists, OWN_ID, (id) => (id === OWN_ID ? 'Webby' : `Mate${id}`), (id) => (id === OWN_ID ? 0.5 : null));
    expect(list.rows.map((r) => r.lives)).toEqual(['5', '1', '2', '0']);
    expect(list.rows.map((r) => r.number)).toEqual([' 1', ' 2', ' 3', ' 4']);
    expect(list.rows.map((r) => r.color)).toEqual([0xff9ed3ff, 0xffffff99, 0xff00cb00, 0xffcbcbcb]);
    expect(list.rows.map((r) => r.gapBefore)).toEqual([false, false, true, true]);
    expect(list.rows.map((r) => r.defender)).toEqual([true, false, false, false]);
    expect(list.rows[0]!.name).toBe('Webby...');
    // the HP bar: 60 px, its fill inset 1 px (DeflateRect); none for a member not in view
    expect(list.rows.map((r) => r.hp)).toEqual([28, 0, 0, 0]);
    expect(list.ownNext).toBe(false);
  });
  it('the own player next to go in, with lives, during the war: the two yellow "be ready" lines', () => {
    const book = new GuildCombatBook();
    book.apply(msg({ sub: 'gcState', state: GcState.WAR, warState: GcState.WAR_WAR }), 0);
    book.apply(msg({ sub: 'warPlayerList', guilds: [{ defenderId: 501, members: [{ playerId: 501, status: 1 }, { playerId: OWN_ID, status: 0 }] }] }), 0);
    book.apply(msg({ sub: 'guildStatus', joinIndex: 1, players: [{ playerId: 501, lives: 6 }, { playerId: OWN_ID, lives: 6 }] }), 0);
    const hud = make(book, new ArenaState(book, stateHost({ id: 202, rank: 4 }, said())));
    hud.update(0);
    const ready = hud.element.querySelector('.hud-siege-ready') as HTMLElement;
    expect(ready.hidden).toBe(false);
    expect(ready.textContent).toContain('Gain entrance when one of your guild mates dies.');
    expect(ready.textContent).toContain('Be ready!');
    const list = hud.element.querySelector('.hud-siege-guild') as HTMLElement;
    expect(list.hidden).toBe(false);
    expect(list.querySelector('.hud-siege-title')!.textContent).toBe('Bakers');
    expect([list.style.left, list.style.top, list.style.height]).toEqual(['5px', '120px', `${4 * 16}px`]);
    // the war over: the lines go
    book.apply(msg({ sub: 'gcState', state: GcState.COMPLET_CLOSE, warState: GcState.WAR_CLOSE }), 0);
    hud.update(1000);
    expect(ready.hidden).toBe(true);
  });
  it('is drawn in any world, but only for a player on a line-up', () => {
    const book = new GuildCombatBook();
    book.apply(msg({ sub: 'guildStatus', joinIndex: 0, players: [{ playerId: OWN_ID, lives: 6 }] }), 0);
    const host = { ...hudHost(), worldId: () => 1 };
    const hud = make(book, new ArenaState(book, stateHost({ id: 1, rank: 4 }, said())), host);
    hud.update(0);
    const list = hud.element.querySelector('.hud-siege-guild') as HTMLElement;
    expect(list.hidden).toBe(true);
    book.apply(msg({ sub: 'warPlayerList', guilds: [{ defenderId: 9, members: [{ playerId: OWN_ID, status: 0 }] }] }), 0);
    hud.update(1000);
    expect(list.hidden).toBe(false);
  });
});

describe('the state messages and the count-down (DPClient.cpp:7647-7808)', () => {
  const feed = (book: GuildCombatBook, state: ArenaState, m: GuildCombatMessage, now = 0) => { book.apply(m, now); state.apply(m, now); };

  it('in 202: the maintenance line, then the war\'s music and caption, then "End combat"; nothing of it elsewhere', () => {
    for (const worldId of [202, 1]) {
      const book = new GuildCombatBook(), s = said();
      const state = new ArenaState(book, stateHost({ id: worldId, rank: 4 }, s));
      feed(book, state, msg({ sub: 'gcState', state: GcState.WAR, warState: GcState.MAINTENANCE }));
      feed(book, state, msg({ sub: 'gcState', state: GcState.WAR, warState: GcState.WAR_WAR }));
      feed(book, state, msg({ sub: 'gcState', state: GcState.COMPLET_CLOSE, warState: GcState.WAR_CLOSE }));
      if (worldId === 202) {
        expect(s.lines).toEqual([['Combat starts right after server maintenance. Prepare for war!', 0xffffffff]]);
        expect(s.music).toEqual([[16, 0]]); // BGM_BA_CRISIS, forever (PlayMusic( BGM_BA_CRISIS, 0 ))
        expect(s.captions).toEqual(['Start Combat', 'End combat']);
      } else {
        expect([s.lines, s.music, s.captions]).toEqual([[], [], []]);
      }
    }
  });

  it('the line-up\'s opening tells the master of a guild that applied, in any world', () => {
    for (const [rank, requested, lines] of [[0, true, 1], [1, true, 0], [0, false, 0], [null, true, 0]] as const) {
      const book = new GuildCombatBook(), s = said();
      const state = new ArenaState(book, stateHost({ id: 1, rank }, s));
      feed(book, state, msg({ sub: 'isRequest', requested }));
      feed(book, state, msg({ sub: 'gcState', state: GcState.CLOSE, warState: GcState.NOTENTER_COUNT }));
      expect(s.lines.map(([text]) => text)).toEqual(lines === 1 ? ['From now on, you can organize the entry of guild siege.'] : []);
    }
  });

  it('WAR_CLOSE_WAIT forgets the application; WAR_TELEPORT stops the count-down and empties the line-ups (202 only)', () => {
    const book = new GuildCombatBook();
    const state = new ArenaState(book, stateHost({ id: 202, rank: 4 }, said()));
    feed(book, state, msg({ sub: 'isRequest', requested: true }));
    feed(book, state, msg({ sub: 'warPlayerList', guilds: [{ defenderId: 9, members: [{ playerId: OWN_ID, status: 1 }] }] }));
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 60_000, nextState: GcState.WAR_TELEPORT }));
    expect(state.clockText(0)).toBe('Teleporting to Flaris 00:01:00');
    feed(book, state, msg({ sub: 'gcState', state: GcState.COMPLET_CLOSE, warState: GcState.WAR_CLOSE_WAIT }));
    expect(book.requested).toBe(false);
    feed(book, state, msg({ sub: 'gcState', state: GcState.CLOSE, warState: GcState.WAR_TELEPORT }));
    expect(state.clockText(0)).toBeNull();
    expect(book.warPlayers.size).toBe(0);
  });

  it('the labels: the three war ones in 202 only; ENTER for the master or a kingpin of a guild that applied; another keeps the clock', () => {
    const book = new GuildCombatBook();
    const world = { id: 202, rank: 1 as number | null };
    const state = new ArenaState(book, stateHost(world, said()));
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 300_000, nextState: GcState.WAR_WAR }));
    expect(state.clockText(0)).toBe('Maintenance Schedule 00:05:00');
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 1_800_000, nextState: GcState.WAR_CLOSE }));
    expect(state.clockText(0)).toBe('End combat 00:30:00');
    // a label Neuz does not show: the clock stays
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 5_000, nextState: GcState.NOTENTER_COUNT }));
    expect(state.clockText(0)).toBe('End combat 00:30:00');
    world.id = 1;
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 60_000, nextState: GcState.WAR_TELEPORT }));
    expect(state.clockText(0)).toBe('End combat 00:30:00');
    // ENTER: not without the application
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 120_000, nextState: GcState.ENTER }));
    expect(state.clockText(0)).toBe('End combat 00:30:00');
    feed(book, state, msg({ sub: 'isRequest', requested: true }));
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 120_000, nextState: GcState.ENTER }));
    expect(state.clockText(0)).toBe('Time for organizing line up and preparation for Guild Siege. 00:02:00');
    // a captain is not told
    world.rank = 2;
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 1_000_000, nextState: GcState.ENTER }));
    expect(state.clockText(0)).toBe('Time for organizing line up and preparation for Guild Siege. 00:02:00');
    // the clock runs on the screen's time
    expect(state.clockText(61_000)).toBe('Time for organizing line up and preparation for Guild Siege. 00:00:59');
  });

  it('GC_ENTERTIME (the book\'s ENTER label) is "Time Limit" with its line, only for a guild that applied, in any world', () => {
    const book = new GuildCombatBook(), s = said();
    const state = new ArenaState(book, stateHost({ id: 1, rank: 4 }, s));
    feed(book, state, msg({ sub: 'enterTime', msLeft: 600_000 }));
    expect(state.clockText(0)).toBeNull();
    expect(s.lines).toEqual([]);
    feed(book, state, msg({ sub: 'isRequest', requested: true }));
    feed(book, state, msg({ sub: 'enterTime', msLeft: 600_000 }));
    expect(book.countdown?.label).toBe(GcState.ENTER);
    expect(state.clockText(0)).toBe('Time Limit 00:10:00');
    expect(s.lines).toEqual([['Guild Siege mode is now available.', 0xffffffff]]);
  });

  it('an ordinary world clears the count-down; 202 keeps it (DPClient.cpp:2303-2310)', () => {
    const book = new GuildCombatBook();
    const state = new ArenaState(book, stateHost({ id: 1, rank: 4 }, said()));
    feed(book, state, msg({ sub: 'isRequest', requested: true }));
    feed(book, state, msg({ sub: 'enterTime', msLeft: 600_000 }));
    state.enterWorld(202);
    expect(state.clockText(0)).toBe('Time Limit 00:10:00');
    state.enterWorld(1);
    expect(state.clockText(0)).toBeNull();
  });

  it('the HUD draws the clock centred at y 110, and hides it at 0', () => {
    const book = new GuildCombatBook();
    const state = new ArenaState(book, stateHost({ id: 202, rank: 4 }, said()));
    feed(book, state, msg({ sub: 'nextTimeState', msLeft: 3_000, nextState: GcState.WAR_CLOSE }));
    const hud = make(book, state);
    hud.update(0);
    const clock = hud.element.querySelector('.hud-siege-clock') as HTMLElement;
    expect(clock.hidden).toBe(false);
    expect(clock.textContent).toBe('End combat 00:00:03');
    hud.update(3_000);
    expect(clock.hidden).toBe(true);
  });
});

describe('a kill (GC_LOG_REALTIME, DPClient.cpp:7514-7592)', () => {
  it('one white line in the chat, in Neuz\'s English format; an unknown guild is "?"', () => {
    const book = new GuildCombatBook(), s = said();
    const state = new ArenaState(book, stateHost({ id: 202, rank: 4 }, s));
    const kill = (atkGuildId: number) => msg({
      sub: 'logRealtime', atkGuildId, defGuildId: RIVAL_GUILD, atkName: 'Webby', defName: 'Rival', atkPlayerId: OWN_ID,
      defPlayerId: 701, point: 3, diffGuild: true, master: false, defender: false, lastLife: false,
    });
    state.apply(kill(OWN_GUILD), 0);
    state.apply(kill(99), 0);
    expect(s.chat).toEqual([
      ['[Bakers][Webby] has killed [Alpha][Rival] and has gained 3 points.', 0xffffffff],
      ['[?][Webby] has killed [Alpha][Rival] and has gained 3 points.', 0xffffffff],
    ]);
  });
});

describe('login mid-siege (Review Focus 1)', () => {
  it('login at warState 104 with USERSTATE 1 brings up the HUD and the PvP rule', () => {
    // the movers of the JOIN: the own one and a rival fighter whose ADD_OBJ carries its state 1 (m_nGuildCombatState)
    const data = gameDataOf({});
    const self = moverFrom(addedPlayer(OWN_OBJ, { self: true, playerId: OWN_ID, guildId: OWN_GUILD }, { pos: [1288, 85, 1280] }), data);
    const rival = moverFrom(addedPlayer(9301, { playerId: 701, guildId: RIVAL_GUILD, guildCombatState: 1 }, { pos: [1290, 85, 1280] }), data);
    const movers = new Map([[OWN_OBJ, self], [9301, rival]]);
    // the JOIN's siege messages reach the book and the state before any HUD exists (the world is still loading); the
    // book falls back on the ADD_OBJ's state, as the world screen's does
    const book = new GuildCombatBook((id) => movers.get(id)?.added.player?.guildCombatState ?? 0);
    const s = said();
    const state = new ArenaState(book, stateHost({ id: 202, rank: 4 }, s));
    state.enterWorld(202);
    for (const m of [
      msg({ sub: 'isRequest', requested: true }),
      msg({ sub: 'gcState', state: GcState.WAR, warState: GcState.WAR_WAR }),
      msg({ sub: 'nextTimeState', msLeft: 1_800_000, nextState: GcState.WAR_CLOSE }),
      msg({ sub: 'userState', moverId: OWN_OBJ, state: 1 }),
      msg({ sub: 'warPlayerList', guilds: [
        { defenderId: OWN_ID, members: [{ playerId: OWN_ID, status: 1 }] }, { defenderId: 701, members: [{ playerId: 701, status: 1 }] },
      ] }),
      msg({ sub: 'guildStatus', joinIndex: 0, players: [{ playerId: OWN_ID, lives: 6 }] }),
      twelve(), players(),
    ]) { book.apply(m, 0); state.apply(m, 0); }
    // the world on screen: its HUD made afterwards, from the book and the state alone
    const hud = make(book, state);
    hud.update(1_000);
    expect((hud.element.querySelector('.hud-siege-clock') as HTMLElement).textContent).toBe('End combat 00:29:59');
    expect(rows(hud, 'guild')).toHaveLength(12);
    expect(rows(hud, 'player')).toHaveLength(11);
    expect((hud.element.querySelector('.hud-siege-guild') as HTMLElement).hidden).toBe(false);
    // the PvP rule from the book: the own mover's USERSTATE, the rival's ADD_OBJ state and the war state
    const side = siegeSideOf(202, self, book);
    expect(side).toMatchObject({ guildId: OWN_GUILD, combatState: 1, warState: GcState.WAR_WAR });
    expect(isSiegeTarget({ worldId: 202, guildId: OWN_GUILD, combatState: side!.combatState }, { guildId: RIVAL_GUILD, combatState: 1 }, book.warState)).toBe(true);
    expect(attackAble(rival, new Map(), false, { worldId: 202, pos: self.act.body.pos, siege: side })).toBe(true);
    expect(siegeSideOf(1, self, book)).toBeUndefined();
  });
});
