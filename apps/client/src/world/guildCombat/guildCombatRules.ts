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

// --- Frankie's and Donaris's windows (2026-11-15, B3; A-client.md §2.1-2.8, §3.2) ---

/** The texts' numbers (`textId` of the TID_*, `Resource/textClient.inc`) the siege's windows refuse and answer with. */
export const GcTid = {
  /** TID_GAME_GUILDCOMBAT1TO1_MORE_CURRENT_REQUEST "You require more Penya to apply." */
  MORE_CURRENT_REQUEST: 3424,
  /** TID_GAME_GUILDCOMBAT1TO1_LIMIT_MIN "Apply with the minimum Application Fee or higher." */
  LIMIT_MIN: 3425,
  /** TID_GAME_GUILDCOMBAT1TO1_MORE_REQUEST "You have applied with %d Penya. Do you wish to add %d Penya?" */
  MORE_REQUEST: 3426,
  /** TID_GAME_GUILDCOMBAT_NOTENTER_VAGRANT */
  NOTENTER_VAGRANT: 3000,
  /** TID_GAME_GUILDCOMBAT_REQUESTEND "Guild Siege is closed." */
  REQUESTEND: 2967,
  JACKPOT: 2943, JACKPOT_CANCEL: 2944, JACKPOT_LIMIT1: 2941, JACKPOT_LIMIT2: 2942, WINNER_NOT_GUILD: 2962,
  MVP_PENYA: 2964, NOT_MVP: 2963,
  /** The line-up window (B4): TID_GAME_GUILDCOMBAT_* of `Resource/defineText.h:1734-1801`. */
  JOIN_MESSAGE: 2948, PLAYER_MAKEUP: 2973, REMAKE_MAKEUP: 2991, CANNOT_MAKEUP: 2992, LIMIT_LEVEL_NOTICE: 2993, NOT_GUILD_MEMBER: 2994,
  ALREADY_ENTRY: 2995, NOT_ASSIGN_DEFENDER: 2996, HAVENOT_PLAYER: 2997, HAVENOT_MASTER: 2998, MASTER_NOT_ASSIGN_DEFENDER: 2999,
  OFFER_INFO: 3013, SELECTION_MAX: 3014,
} as const;

/**
 * The refusal of an offer (`CWndGuildCombat1to1Offer::OnChildNotify`, `WndGuildCombat1to1.cpp:670-718`): a guild that has
 * bid must bid more than it has; one that has not must bid the minimum. null: the bid is fine (the confirm box follows).
 */
export function bidRefusal(bid: number, ownBid: number, minBid: number): number | null {
  if (ownBid !== 0 && bid <= ownBid) return GcTid.MORE_CURRENT_REQUEST;
  if (ownBid === 0 && bid < minBid) return GcTid.LIMIT_MIN;
  return null;
}

/** `WIDC_STATIC5`: the own place is red when it is past the guilds that fight (`8 < nRate`, here 12, `WndField.cpp:16562-16575`). */
export function statusRankRed(rank: number): boolean {
  return rank > SIEGE.maxGuilds;
}

/** The join confirm's Yes (`WndField.cpp:17031-17065`): a vagrant (`IsBaseJob`) is refused. */
export function joinRefusal(jobIsVagrant: boolean): number | null {
  return jobIsVagrant ? GcTid.NOTENTER_VAGRANT : null;
}

/**
 * The own place in the application list (`DPClient.cpp:6904-6910`): 1-based, by the guild's name compared without case;
 * 0 when the guild has not applied or has no name.
 */
export function ownRank(guildNames: readonly string[], ownGuildName: string): number {
  if (ownGuildName === '') return 0;
  const at = guildNames.findIndex((name) => name.toLowerCase() === ownGuildName.toLowerCase());
  return at + 1;
}

/** `INT_MAX`, the limit of the own penya. */
const INT_MAX = 2_147_483_647n;

/** What GC_GETPENYAGUILD / GC_GETPENYAPLAYER answer with (`DPClient.cpp:7106-7187`): the text's number and its `%I64d` argument. */
export function penyaNotice(kind: 'guild' | 'player', result: number, penya: number | bigint, ownGold: number): { tid: number; penya: bigint | null } | null {
  const amount = BigInt(penya);
  if (kind === 'guild') {
    if (result === 0) return { tid: GcTid.JACKPOT, penya: amount };
    if (result === 1) return { tid: GcTid.JACKPOT_CANCEL, penya: amount };
    if (result === 2) return { tid: GcTid.WINNER_NOT_GUILD, penya: null };
  } else {
    if (result === 0) return { tid: GcTid.MVP_PENYA, penya: amount };
    if (result === 1) return { tid: GcTid.NOT_MVP, penya: null };
  }
  // the overflow: the prize is more than an int, or more than the own penya can hold
  if (amount > INT_MAX) return { tid: GcTid.JACKPOT_LIMIT2, penya: null };
  if (BigInt(ownGold) + amount > INT_MAX) return { tid: GcTid.JACKPOT_LIMIT1, penya: null };
  return null;
}


// --- The line-up window (2026-11-15, B4; A-client.md §2.3) ---

/** A guild member as the line-up's add check sees it; null: the picked player is not in the guild. */
export interface LineupMember { playerId: number; level: number }

/**
 * The add check (`WndField.cpp:16153-16205`): the text's number, null when the member may be added. The list stops at
 * `maxJoin`, the server's limit (`DPSrvr.cpp:5274`); Neuz's `maxJoin < size` lets one more in (`:16161`), which the server drops.
 */
export function lineupAddRefusal(member: LineupMember | null, list: readonly number[], maxJoin: number): number | null {
  if (list.length >= maxJoin) return GcTid.SELECTION_MAX;
  if (member === null) return GcTid.NOT_GUILD_MEMBER;
  if (member.level < SIEGE.fighterLevel) return GcTid.LIMIT_LEVEL_NOTICE;
  if (list.includes(member.playerId)) return GcTid.ALREADY_ENTRY;
  return null;
}

/** Complete's checks, in Neuz's order (`:16287-16345`; the state check between them is the hud's): defender 0 is none. */
export function lineupFinishRefusal(list: readonly number[], defenderId: number, masterOrKingpinIds: readonly number[]): number | null {
  if (defenderId === 0) return GcTid.NOT_ASSIGN_DEFENDER;
  if (list.length === 0) return GcTid.HAVENOT_PLAYER;
  if (!list.some((id) => masterOrKingpinIds.includes(id))) return GcTid.HAVENOT_MASTER;
  return null;
}

/** Select Defender (`:16348-16369`): the guild master cannot defend when more than one entrant is listed. */
export function defenderRefusal(memberId: number, masterId: number, listSize: number): number | null {
  return memberId === masterId && listSize > 1 ? GcTid.MASTER_NOT_ASSIGN_DEFENDER : null;
}

/** The band behind an entrant's row (`:16075-16087`): the first `maxWar` rows start, the rest are reserves. */
export function lineupBand(index: number, maxWar: number): 'blue' | 'red' {
  return index < maxWar ? 'blue' : 'red';
}

/** The start-point window's pick sent at the time-out: 99 (random) when none was picked (`:16713-16722`). */
export const NO_AREA = 99;
