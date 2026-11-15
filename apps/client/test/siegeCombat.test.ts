// 2026-11-15 (Guild Siege, B5): the siege's rules in world 202 (combat/siege.ts; docs/guild-siege/research/A-client.md §4.4):
// the PvP rule (`IsGuildCombatTarget`, MoverAttack.cpp:1992-2011), the hiding (`CMover::ProcessETC`, Mover.cpp:3321-3368),
// the name and guild-line colours (`RenderName`, MoverRender.cpp:1236-1245, :1580-1596), and the book's movers forgotten on
// a world change.
import { describe, expect, it } from 'vitest';
import { attackAble } from '../src/world/combat/attackLoop';
import {
  SIEGE_DEFENDER_COLOR, isSiegeTarget, siegeDefenderLine, siegeHidden, siegeHides, siegeNameColor, warStatusOf,
} from '../src/world/combat/siege';
import { GuildCombatBook } from '../src/world/guildCombat/guildCombatBook';
import { GcState } from '../src/world/guildCombat/guildCombatRules';
import { guildLine, nameTagOf } from '../src/world/render/nameTags';
import { addedPlayer, gameDataOf, moverFrom } from './helpers/movers';

const WAR_WAR = GcState.WAR_WAR;

describe('isSiegeTarget (IsGuildCombatTarget, MoverAttack.cpp:1992-2011; IsAttackAble, Mover.cpp:6590-6596)', () => {
  const own = { worldId: 202, guildId: 7, combatState: 1 };
  const target = { guildId: 8, combatState: 1 };
  it('is true in 202 at WAR_WAR for two fighters of two guilds', () => {
    expect(isSiegeTarget(own, target, WAR_WAR)).toBe(true);
  });
  it('is false when any one condition fails', () => {
    // the world is not 202
    expect(isSiegeTarget({ ...own, worldId: 1 }, target, WAR_WAR)).toBe(false);
    expect(isSiegeTarget({ ...own, worldId: 208 }, target, WAR_WAR)).toBe(false);
    // the war state is not WAR_WAR (104)
    for (const state of [GcState.MAINTENANCE, GcState.WAR_CLOSE, GcState.ENTER, GcState.WAR_TELEPORT]) {
      expect(isSiegeTarget(own, target, state)).toBe(false);
    }
    // a combat state is not 1 (0 none, 2 waiting)
    for (const combatState of [0, 2]) {
      expect(isSiegeTarget({ ...own, combatState }, target, WAR_WAR)).toBe(false);
      expect(isSiegeTarget(own, { ...target, combatState }, WAR_WAR)).toBe(false);
    }
    // a guild id is 0
    expect(isSiegeTarget({ ...own, guildId: 0 }, target, WAR_WAR)).toBe(false);
    expect(isSiegeTarget(own, { ...target, guildId: 0 }, WAR_WAR)).toBe(false);
    expect(isSiegeTarget({ ...own, guildId: 0 }, { ...target, guildId: 0 }, WAR_WAR)).toBe(false);
    // the same guild
    expect(isSiegeTarget(own, { ...target, guildId: 7 }, WAR_WAR)).toBe(false);
  });
});

describe('attackAble with the siege side (the attack loop, the attack button and the skills)', () => {
  const data = gameDataOf({});
  const rival = (guildId: number, guildCombatState: number) =>
    moverFrom(addedPlayer(50, { guildId, guildCombatState }, { pos: [1290, 85, 1280] }), data);
  const side = (warState: number, worldId = 202, guildId = 7, combatState = 1) => ({
    worldId, pos: [1288, 85, 1280] as [number, number, number],
    siege: { guildId, combatState, warState, stateOf: (m: { added: { player?: { guildCombatState?: number } } }) => m.added.player?.guildCombatState ?? 0 },
  });
  it('another guild\'s fighter is attackable in the war, nobody else', () => {
    expect(attackAble(rival(8, 1), new Map(), false, side(WAR_WAR))).toBe(true);
    expect(attackAble(rival(7, 1), new Map(), false, side(WAR_WAR))).toBe(false);
    expect(attackAble(rival(8, 2), new Map(), false, side(WAR_WAR))).toBe(false);
    expect(attackAble(rival(8, 1), new Map(), false, side(GcState.MAINTENANCE))).toBe(false);
    expect(attackAble(rival(8, 1), new Map(), false, side(WAR_WAR, 1))).toBe(false);
    expect(attackAble(rival(8, 1), new Map(), false, side(WAR_WAR, 202, 7, 2))).toBe(false);
    // no siege side: the Arena's rule alone, as before
    expect(attackAble(rival(8, 1), new Map(), false, { worldId: 202, pos: [1288, 85, 1280] })).toBe(false);
  });
});

describe('the line-up status (IsGCStatusPlayerWar, WndWorld.cpp:3880-3906)', () => {
  const lists = new Map([[11, [{ id: 11, status: 1 }, { id: 12, status: 0 }]], [21, [{ id: 21, status: 1 }]]]);
  it('-2 with no line-up at all, -1 for a player on none, else the member\'s status', () => {
    expect(warStatusOf(new Map(), 11)).toBe(-2);
    expect(warStatusOf(lists, 99)).toBe(-1);
    expect(warStatusOf(lists, 11)).toBe(1);
    expect(warStatusOf(lists, 12)).toBe(0);
    expect(warStatusOf(lists, 21)).toBe(1);
  });
});

describe('siegeHidden (CMover::ProcessETC, Mover.cpp:3321-3368)', () => {
  const fighter = { combatState: 1, listed: true };
  const waiting = { combatState: 0, listed: true };
  const spectator = { combatState: -1, listed: false };
  it('a fighter hides everyone who is not fighting', () => {
    expect(siegeHidden(1, fighter)).toBe(false);
    expect(siegeHidden(1, waiting)).toBe(true);
    expect(siegeHidden(1, spectator)).toBe(true);
  });
  it('a waiting entrant hides the players on no line-up', () => {
    expect(siegeHidden(0, fighter)).toBe(false);
    expect(siegeHidden(0, waiting)).toBe(false);
    expect(siegeHidden(0, spectator)).toBe(true);
  });
  it('a spectator (on no line-up, or with none known) hides no one', () => {
    for (const own of [-1, -2]) for (const target of [fighter, waiting, spectator]) expect(siegeHidden(own, target)).toBe(false);
  });
  it('siegeHides reads the line-ups, only in 202, never the own player', () => {
    const lists = new Map([[11, [{ id: 11, status: 1 }, { id: 12, status: 0 }]]]);
    expect(siegeHides(202, lists, 11, 12)).toBe(true);
    expect(siegeHides(202, lists, 11, 99)).toBe(true);
    expect(siegeHides(202, lists, 11, 11)).toBe(false);
    expect(siegeHides(202, lists, 12, 99)).toBe(true);
    expect(siegeHides(202, lists, 12, 11)).toBe(false);
    expect(siegeHides(202, lists, 99, 12)).toBe(false);
    expect(siegeHides(1, lists, 11, 12)).toBe(false);
  });
});

describe('siegeNameColor and siegeDefenderLine (MoverRender.cpp:1236-1245, :1580-1596)', () => {
  it('in 202 with both guilds: green for the own guild, white for any other; else none', () => {
    expect(siegeNameColor(7, 7, 202)).toBe(0xff00ff00);
    expect(siegeNameColor(7, 8, 202)).toBe(0xffffffff);
    expect(siegeNameColor(0, 8, 202)).toBeNull();
    expect(siegeNameColor(7, 0, 202)).toBeNull();
    expect(siegeNameColor(7, 7, 1)).toBeNull();
  });
  it('a defender\'s guild line is pink from MAINTENANCE on, in any world', () => {
    expect(SIEGE_DEFENDER_COLOR).toBe(0xfffea8ff);
    for (const state of [GcState.MAINTENANCE, GcState.WAR_WAR, GcState.WAR_CLOSE, GcState.WAR_TELEPORT]) {
      expect(siegeDefenderLine(true, state)).toBe(0xfffea8ff);
    }
    expect(siegeDefenderLine(true, GcState.ENTER)).toBeNull();
    expect(siegeDefenderLine(true, GcState.NOTENTER_COUNT)).toBeNull();
    expect(siegeDefenderLine(false, GcState.WAR_WAR)).toBeNull();
  });
  it('the siege colour beats the party\'s on the name; the guild line: the master\'s yellow, else the siege colour, the defender\'s pink over both', () => {
    const data = gameDataOf({});
    const colors = { general: 0xfff0f0f0, chaotic: 0xff010203, ready: 0xff040506 };
    const mover = moverFrom(addedPlayer(1, { name: 'Rocky', playerId: 1, pkPropensity: 3 }), data);
    const tag = nameTagOf(mover, undefined, colors, new Map(), () => true, [], () => undefined, () => null, () => 0xff00ff00);
    expect(tag?.color).toBe(0xff00ff00);
    expect(nameTagOf(mover, undefined, colors, new Map(), () => true, [], () => undefined, () => null, () => null)?.color).toBe(0xff010203);
    const logo = () => 'logo';
    expect(guildLine({ name: 'A', logo: 0, master: false }, logo, { name: 0xff00ff00, defender: null }).color).toBe(0xff00ff00);
    expect(guildLine({ name: 'A', logo: 0, master: true }, logo, { name: 0xff00ff00, defender: null }).color).toBe(0xffffff99);
    expect(guildLine({ name: 'A', logo: 0, master: true }, logo, { name: 0xffffffff, defender: 0xfffea8ff }).color).toBe(0xfffea8ff);
    expect(guildLine({ name: 'A', logo: 0, master: false }, logo).color).toBe(0xffffffff);
  });
});

describe('the book on a world change (B2 review, carried)', () => {
  it('forgets every mover\'s USERSTATE, so a stale 1 cannot fire the instant revive or the PvP rule in the next world', () => {
    const book = new GuildCombatBook();
    book.apply({ type: 'guildCombat', sub: 'userState', moverId: 12, state: 1 }, 0);
    book.apply({ type: 'guildCombat', sub: 'userState', moverId: 13, state: 2 }, 0);
    book.forgetMovers();
    expect(book.combatStateOf(12)).toBe(0);
    expect(book.combatStateOf(13)).toBe(0);
  });
  it('a new line-up redraws the tags (the defender\'s pink guild line)', () => {
    const book = new GuildCombatBook();
    const events = book.apply({ type: 'guildCombat', sub: 'warPlayerList', guilds: [{ defenderId: 9, members: [{ playerId: 9, status: 1 }] }] }, 0);
    expect(events.some((e) => e.kind === 'tags')).toBe(true);
  });
});
