// The guild's packets (2026-11-10, docs/superpowers/specs/2026-11-10-guild-research.md §4 and its appendix B): the reads
// copy Neuz's handlers, the writes its senders. The core's messages arrive as whole packets (the cache server only strips
// the DPID); the world's as snapshots.
//
//   snapshots  CDPClient::OnGuildInvite        Neuz/DPClient.cpp:13121-13143  GUILD_INVITE 0x9a: idGuild, idInviter
//              OnSetGuild                      :12689-12745                   SET_GUILD 0x9b (objid = the mover): idGuild
//              OnCreateGuild                   :12516-12581                   CREATE_GUILD 0x9c: idMaster, idGuild, master's
//                                                                             name (MAX_PLAYER), guild name (MAX_G_NAME)
//              OnDestroyGuild                  :12583-12615                   DESTROY_GUILD 0x9d: master's name, idGuild
//              OnGuild                         :12617-12686                   GUILD 0x9e: idGuild, CGuild (whole)
//              OnAllGuilds                     :13145-13148                   ALL_GUILDS 0x9f: CGuildMng (short) + CGuildRank
//              OnGuildLogo                     :13254-13265                   GUILD_LOGO 0xfb: idGuild, logo
//              OnGuildContribution             :13278-13296                   GUILD_CONTRIBUTION 0xfc: CONTRIBUTION_CHANGED_INFO
//              OnGuildNotice                   :13368-13387                   GUILD_NOTICE 0xfd: idGuild, notice (128)
//              OnGuildAuthority                :13389-13406                   GUILD_AUTHORITY 0xfe: 5 DWORDs (the own guild)
//              OnGuildPenya                    :13408-13428                   GUILD_PENYA 0xff: rank, penya (the own guild)
//              OnGuildRealPenya                :13430-13452                   GUILD_REAL_PENYA 0xd5: guild penya, own rank
//              OnSetWar (DPClientGuildWar.cpp) :179-190                       SET_WAR 0x7a (objid = the mover): idWar
//              OnWar (DPClientGuildWar.cpp)    :193-226                       WAR 0xda: idWar, CGuildWar
//   direct     OnGuild                         :12617                         GUILD 0xffffff30 (to a member who just joined)
//              OnAddGuildMember                :12747-12799                   ADD_GUILD_MEMBER: GUILD_MEMBER_INFO, idGuild, name
//              OnRemoveGuildMember             :12801-12838                   REMOVE_GUILD_MEMBER: idPlayer, idGuild
//              OnGuildMemberLv                 :12878-12918                   GUILD_MEMBER_LEVEL: idPlayer, rank
//              OnGuildClass                    :12920-12941                   GUILD_CLASS: idPlayer, class
//              OnChgMaster                     :12943-12982                   CHG_MASTER: old master, new master
//              OnGuildNickName                 :12984-13005                   GUILD_NICKNAME: idPlayer, nickname (MAX_G_NAME)
//              OnGuildMemberLogin              :13008-13039                   GUILD_GAMELOGIN: BYTE login, idPlayer, multi
//              OnGuldMyGameJoin                :13041-13097                   GUILD_GAMEJOIN: n, n ids, n multis
//              OnGuildError                    :13099-13119                   GUILD_ERROR: int error
//              OnGuildSetName                  :13454-13476                   GUILD_SETNAME: idGuild, name (MAX_G_NAME)
//              (no handler)                                                    GUILD_MSG_CONTROL: read past (`CORESERVER/DPCacheSrvr.cpp:1927-1935`)
//   senders    SendGuildInvite ... SendGuildRank   DPClient.cpp:12472-13246, SendQuerySetGuildName :15789, SendQueryPlayerData :13491
//
// `CGuild::Serialize` (`_Common/guild.cpp:409-477`), `CGuildMember::Serialize` (:266-292), `CGuildVote::Serialize`
// (:114-143), `CGuildRank::Serialize` (`_Common/guild.h:551-585`), `CGuildWar::Serialize` (`_Common/guildwar.cpp:41-61`).

import type { ArReader } from '../ar/ArReader';
import { decodeText } from '../text';
import type { ArWriter } from '../ar/ArWriter';
import { clientPacket } from './packet';

/** The guild's packet types (`Source/_Network/MsgHdr.h:20, :316-328, :382-383, :456-458, :472-482, :582`). */
export const GuildPacket = {
  QUERYSETGUILDNAME: 0x00000010,
  GUILD: 0xffffff30,
  DESTROY_GUILD: 0xffffff32,
  ADD_GUILD_MEMBER: 0xffffff33,
  REMOVE_GUILD_MEMBER: 0xffffff34,
  GUILD_INVITE: 0xffffff35,
  IGNORE_GUILD_INVITE: 0xffffff36,
  GUILD_CHAT: 0xffffff39,
  GUILD_MEMBER_LEVEL: 0xffffff3a,
  GUILD_CLASS: 0xffffff74,
  GUILD_NICKNAME: 0xffffff75,
  NW_GUILDLOGO: 0xf000b010,
  NW_GUILDCONTRIBUTION: 0xf000b011,
  NW_GUILDNOTICE: 0xf000b012,
  GUILD_MSG_CONTROL: 0xf000b023,
  GUILD_AUTHORITY: 0xf000b026,
  GUILD_PENYA: 0xf000b027,
  GUILD_GAMELOGIN: 0xf000b029,
  GUILD_GAMEJOIN: 0xf000b030,
  GUILD_SETNAME: 0xf000b032,
  GUILD_ERROR: 0xf000b035,
  CHG_MASTER: 0xf000f000,
  QUERY_PLAYER_DATA2: 0xf000f807,
} as const;

/** The guild's snapshot types (`MsgHdr.h:1028, :1061-1066, :1167-1176`). */
export const GuildMessageType = {
  SET_WAR: 0x007a,
  GUILD_INVITE: 0x009a,
  SET_GUILD: 0x009b,
  CREATE_GUILD: 0x009c,
  DESTROY_GUILD: 0x009d,
  GUILD: 0x009e,
  ALL_GUILDS: 0x009f,
  GUILD_REAL_PENYA: 0x00d5,
  WAR: 0x00da,
  GUILD_LOGO: 0x00fb,
  GUILD_CONTRIBUTION: 0x00fc,
  GUILD_NOTICE: 0x00fd,
  GUILD_AUTHORITY: 0x00fe,
  GUILD_PENYA: 0x00ff,
} as const;

/** `_Common/guild.h:20-30`: the buffers' sizes, terminator included. */
export const MAX_GM_ALIAS = 48;
export const MAX_GM_LEVEL = 5;
export const MAX_G_NAME = 48;
export const MAX_BYTE_NOTICE = 128;
const MAX_PLAYER = 42;
const MAX_BYTE_VOTETITLE = 26;
const MAX_BYTE_VOTEQUESTION = 171;
const MAX_BYTE_VOTESELECT = 21;
/** `CGuildRank::RANK_END` (`guild.h:446-449`) and `sizeof(GUILD_RANKING)` (`guild.h:452-462`: 4 + 17 + 33 + 2 pad + 4 x 5). */
export const GUILD_RANK_LISTS = 8;
const GUILD_RANKING_BYTES = 76;
/** `MAX_RANK_LIST` (`guild.h:428`): a list holds 20 rows at most. */
const MAX_RANK_LIST = 20;
/** `MAX_GM_SIZE` (`guild.h:22`) and the client's login array (`DPClient.h`, 200). */
const MAX_GM_SIZE = 128;

/** One member of `CGuildMember` (`guild.h:181-200`). Job, level, sex and the log-in state come from the player data. */
export interface GuildMemberEntry {
  playerId: number;
  pay: number;
  /** `m_nGiveGold`: the penya given to the guild. */
  giveGold: number;
  /** `m_dwGivePxpCount`: the points given. */
  givePxp: number;
  win: number;
  lose: number;
  /** `m_nMemberLv`: the rank, GUD_MASTER 0 .. GUD_ROOKIE 4. */
  rank: number;
  selectedVote: number;
  surrender: number;
  /** `m_nClass`: 0..2 inside the rank. */
  rankClass: number;
  /** `m_szAlias`: the nickname. */
  alias: string;
}

/** The short `CGuild` (`bDesc`): what every client keeps of every guild. */
export interface GuildSummary {
  guildId: number;
  masterId: number;
  level: number;
  name: string;
  logo: number;
  /** `m_nGoldGuild`: the guild fund (the guild bank's penya). */
  gold: number;
  win: number;
  lose: number;
  surrender: number;
}

export interface GuildVoteEntry {
  voteId: number;
  completed: boolean;
  title: string;
  question: string;
  choices: Array<{ text: string; count: number }>;
}

export interface GuildQuestEntry {
  questId: number;
  state: number;
  guildId: number;
}

/** The whole `CGuild` (the own guild). */
export interface GuildWhole extends GuildSummary {
  /** `m_adwPower[5]`: the rights per rank (PF_* bits). */
  power: number[];
  /** `m_adwPenya[5]`: the salary per rank. */
  penya: number[];
  notice: string;
  contributionPxp: number;
  enemyGuildId: number;
  members: GuildMemberEntry[];
  votes: GuildVoteEntry[];
  quests: GuildQuestEntry[];
}

/** One row of `GUILD_RANKING`. */
export interface GuildRankRow {
  logo: number;
  name: string;
  master: string;
  win: number;
  lose: number;
  surrender: number;
  averageLevel: number;
  winPoint: number;
}

export interface GuildRanking {
  version: number;
  /** R1..R8 (`guild.h:436-449`): strongest, most wins, most losses, most surrenders, unity, funds, average level, play. */
  lists: GuildRankRow[][];
}

/** `CONTRIBUTION_CHANGED_INFO` (`guild.cpp:55-67`). */
export interface GuildContribution {
  guildId: number;
  playerId: number;
  /** The member's totals after the gift. */
  pxpCount: number;
  penya: number;
  /** The guild's points and fund after it. */
  guildPxpCount: number;
  guildPenya: number;
  guildLevel: number;
}

/** One side of `CGuildWar` (`WAR_ENTRY`, `guildwar.h`). */
export interface GuildWarEntry {
  guildId: number;
  size: number;
  surrender: number;
  dead: number;
  absent: number;
}

export interface GuildWarState {
  warId: number;
  declared: GuildWarEntry;
  accepted: GuildWarEntry;
  /** `m_nFlag`: '0' wartime .. '9' the end (a char). */
  flag: number;
  /** `m_time`: the start, seconds since 1970 (a 32-bit `time_t`). */
  start: number;
}

export type GuildMessage =
  | { type: 'guildInvite'; guildId: number; inviterId: number }
  | { type: 'setGuild'; guildId: number }
  | { type: 'createGuild'; masterId: number; guildId: number; masterName: string; name: string }
  | { type: 'destroyGuild'; masterName: string; guildId: number }
  | { type: 'guildWhole'; guild: GuildWhole }
  | { type: 'allGuilds'; lastId: number; guilds: GuildSummary[]; ranking: GuildRanking }
  | { type: 'guildLogo'; guildId: number; logo: number }
  | { type: 'guildContribution'; info: GuildContribution }
  | { type: 'guildNotice'; guildId: number; notice: string }
  | { type: 'guildAuthority'; power: number[] }
  | { type: 'guildPenya'; rank: number; penya: number }
  | { type: 'guildRealPenya'; gold: number; rank: number }
  | { type: 'setWar'; warId: number }
  | { type: 'guildWar'; war: GuildWarState }
  // the core's (direct packets)
  | { type: 'guildMemberAdded'; playerId: number; multiNo: number; guildId: number; name: string }
  | { type: 'guildMemberRemoved'; playerId: number; guildId: number }
  | { type: 'guildMemberLevel'; playerId: number; rank: number }
  | { type: 'guildClass'; playerId: number; rankClass: number }
  | { type: 'guildMasterChanged'; oldMasterId: number; newMasterId: number }
  | { type: 'guildNickname'; playerId: number; alias: string }
  | { type: 'guildMemberLogin'; login: number; playerId: number; multiNo: number }
  | { type: 'guildGameJoin'; playerIds: number[]; multiNos: number[] }
  | { type: 'guildError'; error: number }
  | { type: 'guildSetName'; guildId: number; name: string }
  | { type: 'guildMsgControl' };

/** The guild's direct packets (not in a snapshot); GUILD comes both ways, marked `direct` here. */
export type GuildDirectMessage =
  | ({ type: 'guildWhole'; guild: GuildWhole; direct: true })
  | Extract<GuildMessage, { type: 'guildMemberAdded' | 'guildMemberRemoved' | 'guildMemberLevel' | 'guildClass' | 'guildMasterChanged' | 'guildNickname' | 'guildMemberLogin' | 'guildGameJoin' | 'guildError' | 'guildSetName' | 'guildMsgControl' }>;

/** The rank values (`Resource/defineJob.h:146-150`). */
export const GuildRank = { MASTER: 0, KINGPIN: 1, CAPTAIN: 2, SUPPORTER: 3, ROOKIE: 4 } as const;

/** The rights bits (`_Common/guild.h:38-45`). */
export const GuildPower = {
  MEMBERLEVEL: 0x01,
  LEVEL: 0x02,
  INVITATION: 0x04,
  PENYA: 0x08,
  ITEM: 0x10,
  GUILDHOUSE_FURNITURE: 0x20,
  GUILDHOUSE_UPKEEP: 0x40,
} as const;

// --- the structures ---

/** A NUL-ended `char[n]` written raw. */
function fixedText(r: ArReader, size: number): string {
  const bytes = r.bytes(size);
  const end = bytes.indexOf(0);
  return decodeText(end < 0 ? bytes : bytes.subarray(0, end));
}

function readGuildMember(r: ArReader): GuildMemberEntry {
  const playerId = r.u32(), pay = r.i32(), giveGold = r.i32(), givePxp = r.u32();
  const win = r.i16(), lose = r.i16(), rank = r.u8();
  const selectedVote = r.u32(), surrender = r.i32(), rankClass = r.i32();
  return { playerId, pay, giveGold, givePxp, win, lose, rank, selectedVote, surrender, rankClass, alias: r.string(MAX_GM_ALIAS) };
}

function readGuildSummary(r: ArReader): GuildSummary {
  const guildId = r.u32(), masterId = r.u32(), level = r.i32();
  const name = r.string(MAX_G_NAME);
  const logo = r.u32(), gold = r.u32();
  return { guildId, masterId, level, name, logo, gold, win: r.i32(), lose: r.i32(), surrender: r.i32() };
}

const dwords = (r: ArReader, n: number): number[] => Array.from({ length: n }, () => r.u32());

function readGuildVote(r: ArReader): GuildVoteEntry {
  const voteId = r.u32(), completed = r.u8() === 1;
  const title = r.string(MAX_BYTE_VOTETITLE), question = r.string(MAX_BYTE_VOTEQUESTION);
  const choices = Array.from({ length: 4 }, () => ({ text: r.string(MAX_BYTE_VOTESELECT), count: r.u8() }));
  return { voteId, completed, title, question, choices };
}

/** The whole `CGuild` after its summary. */
export function readGuildWhole(r: ArReader): GuildWhole {
  const summary = readGuildSummary(r);
  const power = dwords(r, MAX_GM_LEVEL), penya = dwords(r, MAX_GM_LEVEL);
  const notice = r.string(MAX_BYTE_NOTICE);
  const contributionPxp = r.u32();
  const level = r.i32();
  const enemyGuildId = r.u32();
  const memberCount = r.i16();
  if (memberCount < 0 || memberCount > MAX_GM_SIZE) throw new RangeError(`Invalid guild member count ${memberCount}.`);
  const members = Array.from({ length: memberCount }, () => readGuildMember(r));
  const voteCount = r.i16();
  if (voteCount < 0 || voteCount > MAX_GM_SIZE) throw new RangeError(`Invalid guild vote count ${voteCount}.`);
  const votes = Array.from({ length: voteCount }, () => readGuildVote(r));
  const questCount = r.u8();
  const quests = Array.from({ length: questCount }, () => ({ questId: r.i32(), state: r.i32(), guildId: r.u32() }));
  return { ...summary, level, power, penya, notice, contributionPxp, enemyGuildId, members, votes, quests };
}

function readGuildRanking(r: ArReader): GuildRanking {
  const version = r.u32();
  const totals = Array.from({ length: GUILD_RANK_LISTS }, () => r.i32());
  const lists = totals.map((total) => {
    if (total < 0 || total > MAX_RANK_LIST) throw new RangeError(`Invalid guild ranking count ${total}.`);
    return Array.from({ length: total }, () => {
      const logo = r.i32();
      const name = fixedText(r, 17);
      const master = fixedText(r, 33);
      r.bytes(GUILD_RANKING_BYTES - 4 - 17 - 33 - 20);
      return { logo, name, master, win: r.i32(), lose: r.i32(), surrender: r.i32(), averageLevel: r.f32(), winPoint: r.i32() };
    });
  });
  return { version, lists };
}

function readWarEntry(r: ArReader): GuildWarEntry {
  return { guildId: r.u32(), size: r.i32(), surrender: r.i32(), dead: r.i32(), absent: r.i32() };
}

// --- snapshots ---

export const readGuildInvite = (r: ArReader): GuildMessage => ({ type: 'guildInvite', guildId: r.u32(), inviterId: r.u32() });
export const readSetGuild = (r: ArReader): GuildMessage => ({ type: 'setGuild', guildId: r.u32() });

export function readCreateGuild(r: ArReader): GuildMessage {
  const masterId = r.u32(), guildId = r.u32();
  const masterName = r.string(MAX_PLAYER);
  return { type: 'createGuild', masterId, guildId, masterName, name: r.string(MAX_G_NAME) };
}

export function readDestroyGuild(r: ArReader): GuildMessage {
  const masterName = r.string(MAX_PLAYER);
  return { type: 'destroyGuild', masterName, guildId: r.u32() };
}

/** GUILD: `ar >> idGuild`, then the whole `CGuild` (whose own id comes again first). */
export function readGuild(r: ArReader): Extract<GuildMessage, { type: 'guildWhole' }> {
  r.u32();
  return { type: 'guildWhole', guild: readGuildWhole(r) };
}

export function readAllGuilds(r: ArReader): GuildMessage {
  const lastId = r.u32();
  const count = r.i32();
  if (count < 0 || count > 0xffff) throw new RangeError(`Invalid guild count ${count}.`);
  const guilds = Array.from({ length: count }, () => readGuildSummary(r));
  return { type: 'allGuilds', lastId, guilds, ranking: readGuildRanking(r) };
}

export function readGuildLogo(r: ArReader): GuildMessage {
  const guildId = r.u32();
  return { type: 'guildLogo', guildId, logo: r.u32() };
}

export function readGuildContribution(r: ArReader): GuildMessage {
  const guildId = r.u32(), playerId = r.u32(), pxpCount = r.u32(), penya = r.u32();
  const guildPxpCount = r.u32(), guildPenya = r.u32(), guildLevel = r.u16();
  return { type: 'guildContribution', info: { guildId, playerId, pxpCount, penya, guildPxpCount, guildPenya, guildLevel } };
}

export function readGuildNotice(r: ArReader): GuildMessage {
  const guildId = r.u32();
  return { type: 'guildNotice', guildId, notice: r.string(MAX_BYTE_NOTICE) };
}

export const readGuildAuthority = (r: ArReader): GuildMessage => ({ type: 'guildAuthority', power: dwords(r, MAX_GM_LEVEL) });
export const readGuildPenya = (r: ArReader): GuildMessage => ({ type: 'guildPenya', rank: r.u32(), penya: r.u32() });
export const readGuildRealPenya = (r: ArReader): GuildMessage => ({ type: 'guildRealPenya', gold: r.i32(), rank: r.i32() });
export const readSetWar = (r: ArReader): GuildMessage => ({ type: 'setWar', warId: r.u32() });

/** WAR: `ar >> idWar`, then `CGuildWar` (its id again, the two sides raw, the flag char, the 32-bit start). */
export function readGuildWar(r: ArReader): GuildMessage {
  r.u32();
  const warId = r.u32();
  const declared = readWarEntry(r), accepted = readWarEntry(r);
  const flag = r.u8();
  return { type: 'guildWar', war: { warId, declared, accepted, flag, start: r.i32() } };
}

export const GUILD_READERS: ReadonlyArray<readonly [number, (r: ArReader) => GuildMessage]> = [
  [GuildMessageType.GUILD_INVITE, readGuildInvite],
  [GuildMessageType.SET_GUILD, readSetGuild],
  [GuildMessageType.CREATE_GUILD, readCreateGuild],
  [GuildMessageType.DESTROY_GUILD, readDestroyGuild],
  [GuildMessageType.GUILD, readGuild],
  [GuildMessageType.ALL_GUILDS, readAllGuilds],
  [GuildMessageType.GUILD_LOGO, readGuildLogo],
  [GuildMessageType.GUILD_CONTRIBUTION, readGuildContribution],
  [GuildMessageType.GUILD_NOTICE, readGuildNotice],
  [GuildMessageType.GUILD_AUTHORITY, readGuildAuthority],
  [GuildMessageType.GUILD_PENYA, readGuildPenya],
  [GuildMessageType.GUILD_REAL_PENYA, readGuildRealPenya],
  [GuildMessageType.SET_WAR, readSetWar],
  [GuildMessageType.WAR, readGuildWar],
];

const GUILD_TYPES = new Set<string>([
  'guildInvite', 'setGuild', 'createGuild', 'destroyGuild', 'guildWhole', 'allGuilds', 'guildLogo', 'guildContribution',
  'guildNotice', 'guildAuthority', 'guildPenya', 'guildRealPenya', 'setWar', 'guildWar', 'guildMemberAdded',
  'guildMemberRemoved', 'guildMemberLevel', 'guildClass', 'guildMasterChanged', 'guildNickname', 'guildMemberLogin',
  'guildGameJoin', 'guildError', 'guildSetName', 'guildMsgControl',
]);

/** Whether a world message is the guild's. */
export function isGuildMessage(message: { type: string }): message is GuildMessage {
  return GUILD_TYPES.has(message.type);
}

// --- direct packets (from the core) ---

/** A direct guild packet after its type, or null for another type. Each reads its whole body. */
export function readGuildPacket(packetType: number, r: ArReader): GuildDirectMessage | null {
  switch (packetType) {
    case GuildPacket.GUILD:
      return { ...readGuild(r), direct: true };
    case GuildPacket.ADD_GUILD_MEMBER: {
      // GUILD_MEMBER_INFO raw (`guild.h:243-260`): idPlayer, BYTE nMultiNo, 3 pad bytes
      const playerId = r.u32(), multiNo = r.u8();
      r.bytes(3);
      const guildId = r.u32();
      return { type: 'guildMemberAdded', playerId, multiNo, guildId, name: r.string(MAX_PLAYER) };
    }
    case GuildPacket.REMOVE_GUILD_MEMBER:
      return { type: 'guildMemberRemoved', playerId: r.u32(), guildId: r.u32() };
    case GuildPacket.GUILD_MEMBER_LEVEL:
      return { type: 'guildMemberLevel', playerId: r.u32(), rank: r.i32() };
    case GuildPacket.GUILD_CLASS:
      return { type: 'guildClass', playerId: r.u32(), rankClass: r.i32() };
    case GuildPacket.CHG_MASTER:
      return { type: 'guildMasterChanged', oldMasterId: r.u32(), newMasterId: r.u32() };
    case GuildPacket.GUILD_NICKNAME: {
      const playerId = r.u32();
      return { type: 'guildNickname', playerId, alias: r.string(MAX_G_NAME) };
    }
    case GuildPacket.GUILD_GAMELOGIN:
      return { type: 'guildMemberLogin', login: r.u8(), playerId: r.u32(), multiNo: r.u32() };
    case GuildPacket.GUILD_GAMEJOIN: {
      const count = r.i32();
      if (count < 0 || count > 200) throw new RangeError(`Invalid guild login count ${count}.`);
      const playerIds = dwords(r, count);
      return { type: 'guildGameJoin', playerIds, multiNos: dwords(r, count) };
    }
    case GuildPacket.GUILD_ERROR:
      return { type: 'guildError', error: r.i32() };
    case GuildPacket.GUILD_SETNAME: {
      const guildId = r.u32();
      return { type: 'guildSetName', guildId, name: r.string(MAX_G_NAME) };
    }
    case GuildPacket.GUILD_MSG_CONTROL:
      r.bytes(r.remaining());
      return { type: 'guildMsgControl' };
    default:
      return null;
  }
}

/** The direct packet type of a direct guild message, for the session to hand it on as the friends' are. */
export function guildPacketTypeOf(message: GuildDirectMessage): number {
  switch (message.type) {
    case 'guildWhole': return GuildPacket.GUILD;
    case 'guildMemberAdded': return GuildPacket.ADD_GUILD_MEMBER;
    case 'guildMemberRemoved': return GuildPacket.REMOVE_GUILD_MEMBER;
    case 'guildMemberLevel': return GuildPacket.GUILD_MEMBER_LEVEL;
    case 'guildClass': return GuildPacket.GUILD_CLASS;
    case 'guildMasterChanged': return GuildPacket.CHG_MASTER;
    case 'guildNickname': return GuildPacket.GUILD_NICKNAME;
    case 'guildMemberLogin': return GuildPacket.GUILD_GAMELOGIN;
    case 'guildGameJoin': return GuildPacket.GUILD_GAMEJOIN;
    case 'guildError': return GuildPacket.GUILD_ERROR;
    case 'guildSetName': return GuildPacket.GUILD_SETNAME;
    case 'guildMsgControl': return GuildPacket.GUILD_MSG_CONTROL;
  }
}

// --- the client's packets ---

const characters = new Map(Array.from({ length: 256 }, (_, byte) => [decodeText(Uint8Array.of(byte)), byte]));

/**
 * `CAr::WriteString` of a guild text in the game's code page (windows-1252, as the chat's): at most `max` bytes, no control
 * character but the notice's line breaks. The windows check the rules first; this only refuses what cannot be sent.
 */
function guildString(w: ArWriter, text: string, max: number, lineBreaks = false): ArWriter {
  if (text.length > max) throw new RangeError(`Enter at most ${max} characters.`);
  const bytes = Uint8Array.from(Array.from(text, (character) => {
    const byte = characters.get(character);
    const control = byte === undefined || byte < 0x20 || byte === 0x7f;
    if (control && !(lineBreaks && (character === '\n' || character === '\r'))) {
      throw new RangeError('This character cannot be sent in the game text encoding.');
    }
    return byte ?? 0;
  }));
  return w.i32(bytes.length).bytes(bytes);
}

/** `SendGuildInvite( objid )` (`DPClient.cpp:12472-12477`): the player menu's "Invite to join guild". */
export const encodeGuildInvite = (targetObjectId: number): Uint8Array =>
  clientPacket(GuildPacket.GUILD_INVITE).u32(targetObjectId).toBytes();

/** `SendIgnoreGuildInvite( idPlayer )` (:12479-12484): never called by the V15 client; here for the pretend servers. */
export const encodeIgnoreGuildInvite = (inviterId: number): Uint8Array =>
  clientPacket(GuildPacket.IGNORE_GUILD_INVITE).u32(inviterId).toBytes();

/**
 * `SendAddGuildMember( idMaster, info, bGM )` (:12501-12507): the invite window's YES. `info` is GUILD_MEMBER_INFO written
 * raw (8 bytes: the own id, `nMultiNo` 100 by default, 3 pad bytes); `bGM` is not written.
 */
export const encodeAddGuildMember = (inviterId: number, ownId: number, multiNo = 100): Uint8Array =>
  clientPacket(GuildPacket.ADD_GUILD_MEMBER).u32(inviterId).u32(ownId).u8(multiNo).u8(0).u8(0).u8(0).toBytes();

/** `SendRemoveGuildMember( idMaster, idPlayer )` (:12509-12514): "Leave Guild" on a member (the own id: leave). */
export const encodeRemoveGuildMember = (ownId: number, playerId: number): Uint8Array =>
  clientPacket(GuildPacket.REMOVE_GUILD_MEMBER).u32(ownId).u32(playerId).toBytes();

/** `SendDestroyGuild( idMaster )` (:12493-12499): the disband window's YES. */
export const encodeDestroyGuild = (ownId: number): Uint8Array =>
  clientPacket(GuildPacket.DESTROY_GUILD).u32(ownId).toBytes();

/** `SendGuildMemberLv( idMaster, idPlayer, nMemberLv )` (:13151-13156): the new rank. */
export const encodeGuildMemberLevel = (ownId: number, playerId: number, rank: number): Uint8Array =>
  clientPacket(GuildPacket.GUILD_MEMBER_LEVEL).u32(ownId).u32(playerId).i32(rank).toBytes();

/** `SendGuildClass( idMaster, idPlayer, nFlag )` (:13158-13167): the flag FIRST (1 up, 0 down). */
export const encodeGuildClass = (ownId: number, playerId: number, up: boolean): Uint8Array =>
  clientPacket(GuildPacket.GUILD_CLASS).u8(up ? 1 : 0).u32(ownId).u32(playerId).toBytes();

/** `SendGuildNickName( idPlayer, strNickName )` (:13169-13176). */
export function encodeGuildNickname(ownId: number, playerId: number, nickname: string): Uint8Array {
  return guildString(clientPacket(GuildPacket.GUILD_NICKNAME).u32(ownId).u32(playerId), nickname, MAX_G_NAME - 1).toBytes();
}

/** `SendChgMaster( idPlayer, idPlayer2 )` (:13246-13252). */
export const encodeChgMaster = (ownId: number, newMasterId: number): Uint8Array =>
  clientPacket(GuildPacket.CHG_MASTER).u32(ownId).u32(newMasterId).toBytes();

/** `SendGuildAuthority( uGuildId, dwAuthority )` (:13213-13221): the own id, the guild, the five DWORDs raw. */
export function encodeGuildAuthority(ownId: number, guildId: number, power: readonly number[]): Uint8Array {
  const w = clientPacket(GuildPacket.GUILD_AUTHORITY).u32(ownId).u32(guildId);
  for (let i = 0; i < MAX_GM_LEVEL; i++) w.u32(power[i] ?? 0);
  return w.toBytes();
}

/** `SendGuilPenya( uGuildId, dwType, dwPenya )` (:13223-13229): the salary of a rank. */
export const encodeGuildPenya = (ownId: number, guildId: number, rank: number, penya: number): Uint8Array =>
  clientPacket(GuildPacket.GUILD_PENYA).u32(ownId).u32(guildId).u32(rank).u32(penya).toBytes();

/** `SendGuildSetName( szName )` (:13231-13237): the own id, the own guild, the name. */
export function encodeGuildSetName(ownId: number, guildId: number, name: string): Uint8Array {
  return guildString(clientPacket(GuildPacket.GUILD_SETNAME).u32(ownId).u32(guildId), name, MAX_G_NAME - 1).toBytes();
}

/** `SendQuerySetGuildName( szName, nId )` (:15789-15795): the rename scroll's object id first (`BYTE`), then the name. */
export function encodeQuerySetGuildName(itemObjectId: number, name: string): Uint8Array {
  return guildString(clientPacket(GuildPacket.QUERYSETGUILDNAME).u8(itemObjectId), name, MAX_G_NAME - 1).toBytes();
}

/** `SendGuildLogo( dwLogo )` (:13178-13183). */
export const encodeGuildLogo = (logo: number): Uint8Array => clientPacket(GuildPacket.NW_GUILDLOGO).u32(logo).toBytes();

/** `SendGuildContribution( cbPxpCount, nGold, cbItemFlag )` (:13190-13201). */
export const encodeGuildContribution = (pxpCount: number, gold: number, itemFlag: number): Uint8Array =>
  clientPacket(GuildPacket.NW_GUILDCONTRIBUTION).u8(pxpCount).i32(gold).u8(itemFlag).toBytes();

/** `SendGuildNotice( szNotice )` (:13203-13211). */
export function encodeGuildNotice(notice: string): Uint8Array {
  return guildString(clientPacket(GuildPacket.NW_GUILDNOTICE), notice, MAX_BYTE_NOTICE - 1, true).toBytes();
}

/**
 * `SendQueryPlayerData( vecPlayer )` (`DPClient.cpp:13491-13498`): after GUILD, every member with the version known
 * (`OnGuild`, :12662-12684): `vector::size()` (4 bytes on Win32), then each `PDVer` raw (id, version).
 */
export function encodeQueryPlayerData2(players: ReadonlyArray<{ playerId: number; version: number }>): Uint8Array {
  const w = clientPacket(GuildPacket.QUERY_PLAYER_DATA2).u32(players.length);
  for (const player of players) w.u32(player.playerId).i32(player.version);
  return w.toBytes();
}

/** For the pretend servers: a client packet of the guild after its type, by the encoders' parameter names. */
export type GuildRequestPacket =
  | { type: 'guildInviteRequest'; targetObjectId: number }
  | { type: 'ignoreGuildInviteRequest'; inviterId: number }
  | { type: 'addGuildMemberRequest'; inviterId: number; ownId: number; multiNo: number }
  | { type: 'removeGuildMemberRequest'; ownId: number; playerId: number }
  | { type: 'destroyGuildRequest'; ownId: number }
  | { type: 'guildMemberLevelRequest'; ownId: number; playerId: number; rank: number }
  | { type: 'guildClassRequest'; up: boolean; ownId: number; playerId: number }
  | { type: 'guildNicknameRequest'; ownId: number; playerId: number; nickname: string }
  | { type: 'chgMasterRequest'; ownId: number; newMasterId: number }
  | { type: 'guildAuthorityRequest'; ownId: number; guildId: number; power: number[] }
  | { type: 'guildPenyaRequest'; ownId: number; guildId: number; rank: number; penya: number }
  | { type: 'guildSetNameRequest'; ownId: number; guildId: number; name: string }
  | { type: 'querySetGuildNameRequest'; itemObjectId: number; name: string }
  | { type: 'guildLogoRequest'; logo: number }
  | { type: 'guildContributionRequest'; pxpCount: number; gold: number; itemFlag: number }
  | { type: 'guildNoticeRequest'; notice: string }
  | { type: 'queryPlayerData2Request'; players: Array<{ playerId: number; version: number }> };

export function readGuildRequestPacket(packetType: number, r: ArReader): GuildRequestPacket | null {
  switch (packetType) {
    case GuildPacket.GUILD_INVITE:
      return { type: 'guildInviteRequest', targetObjectId: r.u32() };
    case GuildPacket.IGNORE_GUILD_INVITE:
      return { type: 'ignoreGuildInviteRequest', inviterId: r.u32() };
    case GuildPacket.ADD_GUILD_MEMBER: {
      const inviterId = r.u32(), ownId = r.u32(), multiNo = r.u8();
      r.bytes(3);
      return { type: 'addGuildMemberRequest', inviterId, ownId, multiNo };
    }
    case GuildPacket.REMOVE_GUILD_MEMBER:
      return { type: 'removeGuildMemberRequest', ownId: r.u32(), playerId: r.u32() };
    case GuildPacket.DESTROY_GUILD:
      return { type: 'destroyGuildRequest', ownId: r.u32() };
    case GuildPacket.GUILD_MEMBER_LEVEL:
      return { type: 'guildMemberLevelRequest', ownId: r.u32(), playerId: r.u32(), rank: r.i32() };
    case GuildPacket.GUILD_CLASS: {
      const up = r.u8() === 1;
      return { type: 'guildClassRequest', up, ownId: r.u32(), playerId: r.u32() };
    }
    case GuildPacket.GUILD_NICKNAME: {
      const ownId = r.u32(), playerId = r.u32();
      return { type: 'guildNicknameRequest', ownId, playerId, nickname: r.string(MAX_G_NAME) };
    }
    case GuildPacket.CHG_MASTER:
      return { type: 'chgMasterRequest', ownId: r.u32(), newMasterId: r.u32() };
    case GuildPacket.GUILD_AUTHORITY: {
      const ownId = r.u32(), guildId = r.u32();
      return { type: 'guildAuthorityRequest', ownId, guildId, power: dwords(r, MAX_GM_LEVEL) };
    }
    case GuildPacket.GUILD_PENYA:
      return { type: 'guildPenyaRequest', ownId: r.u32(), guildId: r.u32(), rank: r.u32(), penya: r.u32() };
    case GuildPacket.GUILD_SETNAME: {
      const ownId = r.u32(), guildId = r.u32();
      return { type: 'guildSetNameRequest', ownId, guildId, name: r.string(MAX_G_NAME) };
    }
    case GuildPacket.QUERYSETGUILDNAME: {
      const itemObjectId = r.u8();
      return { type: 'querySetGuildNameRequest', itemObjectId, name: r.string(MAX_G_NAME) };
    }
    case GuildPacket.NW_GUILDLOGO:
      return { type: 'guildLogoRequest', logo: r.u32() };
    case GuildPacket.NW_GUILDCONTRIBUTION:
      return { type: 'guildContributionRequest', pxpCount: r.u8(), gold: r.i32(), itemFlag: r.u8() };
    case GuildPacket.NW_GUILDNOTICE:
      return { type: 'guildNoticeRequest', notice: r.string(MAX_BYTE_NOTICE) };
    case GuildPacket.QUERY_PLAYER_DATA2: {
      const count = r.u32();
      if (count > MAX_GM_SIZE * 2) throw new RangeError(`Invalid player data count ${count}.`);
      return { type: 'queryPlayerData2Request', players: Array.from({ length: count }, () => ({ playerId: r.u32(), version: r.i32() })) };
    }
    default:
      return null;
  }
}
