// The Guild Siege's constants and rules on the client (2026-11-15, docs/guild-siege/research/A-client.md §3.3).
//
//   CGuildCombat states   _Common/guildcombat.h  (`m_nState`: OPEN 0, CLOSE 1, WAR 2, COMPLET_CLOSE 3, GM_CLOSE 4)
//   war states            the same file          (`m_nGCState`: NOTENTER 100 ... WAR_TELEPORT 107)
//   trophies              _Common/MoverRender.cpp:1600-1612  (only in CLOSE_STATE; the MVP before the winning guild)

import type { GuildCombatBook } from './guildCombatBook';

/** `CGuildCombat::m_nState` and `m_nGCState`, the numbers the wire carries. */
export const GcState = {
  OPEN: 0, CLOSE: 1, WAR: 2, COMPLET_CLOSE: 3, GM_CLOSE: 4,
  NOTENTER: 100, NOTENTER_COUNT: 101, ENTER: 102, MAINTENANCE: 103, WAR_WAR: 104, WAR_CLOSE: 105, WAR_CLOSE_WAIT: 106,
  WAR_TELEPORT: 107,
} as const;

/** `m_nGuildCombatState` of a mover: 1 fighting (`DPClient.cpp:2043`), 2 waiting or entered as an observer. */
export const MoverGcState = { NONE: 0, FIGHTING: 1, WAITING: 2 } as const;

/** The siege's rules as the owner set them (plan, Global Constraints). */
export const SIEGE = {
  maxGuilds: 12, minGuilds: 3, maxJoinMembers: 10, maxWarPlayers: 5, lives: 6, guildLevel: 50, fighterLevel: 30,
  minBid: 100_000_000, openTimes: ['06:52', '18:52'], worldId: 202,
} as const;

export type Trophy = 'winner' | 'best';

/**
 * The picture by a name (`RenderName`, `MoverRender.cpp:1600-1612`): only while the siege is closed (`CLOSE_STATE`) and
 * only for a player with a guild; the best player's wins over the winning guild's.
 */
export function trophyOf(book: Pick<GuildCombatBook, 'state' | 'bestPlayerId' | 'winGuildId'>, playerId: number, guildId: number): Trophy | null {
  if (book.state !== GcState.CLOSE || guildId === 0) return null;
  if (book.bestPlayerId === playerId) return 'best';
  if (book.winGuildId === guildId) return 'winner';
  return null;
}
