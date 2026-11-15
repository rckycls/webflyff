// 2026-11-15 (Guild Siege, B5): the siege's rules in its arena, WI_WORLD_GUILDWAR 202 (docs/guild-siege/research/A-client.md
// §4.4). Where players of two guilds may hit each other, who is not drawn, and the colours of the names.
//
//   CMover::IsGuildCombatTarget  _Common/MoverAttack.cpp:1992-2011  both movers' m_nGuildCombatState 1 and two guilds; the
//                                                                   server also asks for WAR_WAR_STATE (:1995-2002)
//   CMover::IsAttackAble         _Common/Mover.cpp:6590-6596        with EVE_GUILDCOMBAT, in world 202 only
//   CMover::ProcessETC           _Common/Mover.cpp:3321-3368        in 202 a fighter sees only fighters, a waiting entrant
//                                                                   only the players on a line-up: the others are neither
//                                                                   drawn (GCWAR_RENDER_SKIP_MODE) nor clicked
//                                                                   (GCWAR_NOT_CLICK_MODE)
//   CWndWorld::IsGCStatusPlayerWar _Interface/WndWorld.cpp:3880-3906 a player's status in the line-ups (GC_WARPLAYERLIST)
//   CMover::RenderName           _Common/MoverRender.cpp:1236-1245  in 202 the name green for the own guild, white else;
//                                                     :1580-1596   the guild line the same (the master's stays yellow),
//                                                                   and a defender's pink from MAINTENANCE_STATE on
//
// EVE_GUILDCOMBAT (`//GUILDCOMBAT` of WorldServer.ini, `CDPClient::OnFlyffEvent`) is taken as on, as EVE_18 is for the Arena
// (combat/arena.ts): the owner runs the siege.

import type { GuildCombatBook } from '../guildCombat/guildCombatBook';
import { GcState, MoverGcState, SIEGE } from '../guildCombat/guildCombatRules';
import type { Mover } from '../WorldState';

/** The own side of `IsGuildCombatTarget`: the world the own mover is in, its guild and its combat state. */
export interface SiegeOwn { worldId: number; guildId: number; combatState: number }
/** The target's side: its guild and its combat state (`m_nGuildCombatState`). */
export interface SiegeOther { guildId: number; combatState: number }

/**
 * `IsGuildCombatTarget` where `IsAttackAble` asks it (world 202 only), with the server's war-state check: the war is on
 * (WAR_WAR_STATE 104), both movers fight (state 1), both have a guild, and the guilds differ.
 */
export function isSiegeTarget(own: SiegeOwn, target: SiegeOther, warState: number): boolean {
  return own.worldId === SIEGE.worldId && warState === GcState.WAR_WAR
    && own.combatState === MoverGcState.FIGHTING && target.combatState === MoverGcState.FIGHTING
    && own.guildId !== 0 && target.guildId !== 0 && own.guildId !== target.guildId;
}

/** What `attackAble` reads of the siege for the own mover (`ArenaSide.siege`): its guild, its state, the war's, the others'. */
export interface SiegeSide {
  guildId: number;
  combatState: number;
  warState: number;
  /** A mover's `m_nGuildCombatState`. */
  stateOf(target: Mover): number;
}

/** The siege side of the own mover in world `worldId`, from the book; none outside 202 (the rule is never asked there). */
export function siegeSideOf(
  worldId: number, own: Mover | undefined, book: Pick<GuildCombatBook, 'warState' | 'combatStateOf'>,
): SiegeSide | undefined {
  if (worldId !== SIEGE.worldId || own === undefined) return undefined;
  return {
    guildId: own.added.player?.guildId ?? 0, combatState: book.combatStateOf(own.objectId), warState: book.warState,
    stateOf: (target) => book.combatStateOf(target.objectId),
  };
}

/** `IsAttackAble`'s player branch for the siege: the target's guild (`m_idGuild`) and state against the own side. */
export function siegeAllows(worldId: number, side: SiegeSide | undefined, target: Mover): boolean {
  if (side === undefined) return false;
  return isSiegeTarget({ worldId, guildId: side.guildId, combatState: side.combatState },
    { guildId: target.added.player?.guildId ?? 0, combatState: side.stateOf(target) }, side.warState);
}

/** The line-ups as the book keeps them (`m_mapGC_GuildStatus`): each guild's members by its defender's id. */
export type WarPlayers = ReadonlyMap<number, ReadonlyArray<{ id: number; status: number }>>;

/** Each line-up's statuses by player, made once a line-up (the book gives a new map with each GC_WARPLAYERLIST). */
const statusIndex = new WeakMap<WarPlayers, Map<number, number>>();

/**
 * `IsGCStatusPlayerWar( idPlayer )`: -2 when there is no line-up at all, -1 for a player on none, else its status there
 * (1 fighting, 0 waiting or out of lives). The first line-up that has the player answers, as Neuz's loop.
 */
export function warStatusOf(warPlayers: WarPlayers, playerId: number): number {
  if (warPlayers.size === 0) return -2;
  let index = statusIndex.get(warPlayers);
  if (index === undefined) {
    index = new Map();
    for (const members of warPlayers.values()) for (const { id, status } of members) if (!index.has(id)) index.set(id, status);
    statusIndex.set(warPlayers, index);
  }
  return index.get(playerId) ?? -1;
}

/**
 * `ProcessETC`'s choice for another player: `ownState` is the own status in the line-ups (`warStatusOf`), the target's
 * `combatState` its status there and `listed` whether it is on one. A fighter (1) hides whoever does not fight; a waiting
 * entrant (0) hides the players on no line-up; a spectator (-1, or -2 with no line-up known) hides no one.
 */
export function siegeHidden(ownState: number, target: { combatState: number; listed: boolean }): boolean {
  if (ownState === 1) return !target.listed || target.combatState !== 1;
  if (ownState === 0) return !target.listed;
  return false;
}

/** Whether the player `targetId` is hidden from the own player `ownId` in world `worldId` (202 only; never oneself). */
export function siegeHides(worldId: number, warPlayers: WarPlayers, ownId: number, targetId: number): boolean {
  if (worldId !== SIEGE.worldId || ownId === targetId) return false;
  const target = warStatusOf(warPlayers, targetId);
  return siegeHidden(warStatusOf(warPlayers, ownId), { combatState: target, listed: target >= 0 });
}

/** `COLOR_GUILDCOMBAT` and `COLOR_PLAYER` (`Source/_Common/Mover.h:34`, `:40`). */
const COLOR_GUILDCOMBAT = 0xff00ff00;
const COLOR_PLAYER = 0xffffffff;
/** The defender's guild line (`MoverRender.cpp:1590-1596`). */
export const SIEGE_DEFENDER_COLOR = 0xfffea8ff;

/**
 * The name's colour in the siege (`bOtherColor`, `MoverRender.cpp:1236-1245`): in 202, when both the own player and the
 * other have a guild, green for the own guild and white for any other; null elsewhere (the usual colours). It beats the
 * party's and the PK colours (:1403-1406).
 */
export function siegeNameColor(ownGuildId: number, otherGuildId: number, worldId: number): number | null {
  if (worldId !== SIEGE.worldId || ownGuildId === 0 || otherGuildId === 0) return null;
  return ownGuildId === otherGuildId ? COLOR_GUILDCOMBAT : COLOR_PLAYER;
}

/**
 * The defender's guild line (`MoverRender.cpp:1590-1596`): pink, in any world, for a player who is a line-up's defender
 * (`GetGCStatusDefender`) while `m_nGCState >= MAINTENANCE_STATE`; null otherwise.
 */
export function siegeDefenderLine(isDefender: boolean, gcState: number): number | null {
  return isDefender && gcState >= GcState.MAINTENANCE ? SIEGE_DEFENDER_COLOR : null;
}
