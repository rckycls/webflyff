// 2026-11-10: the guild's messages as the servers write them, in the order of the readers (`@flyffweb/protocol`
// world/guild.ts): the world's snapshots (`CUser::AddGuildInvite` ..., `WORLDSERVER/User.cpp:1935-1945, :5294-5349`;
// `CDPCoreClient`, `WORLDSERVER/DPCoreClient.cpp:1764-2447`) and the core's whole packets (`CDPCacheSrvr`,
// `CORESERVER/DPCacheSrvr.cpp:1856-1935`). Guild research appendix B §2.

import { ArWriter, GuildMessageType, GuildPacket, NULL_ID } from '@flyffweb/protocol';
import type { GuildMemberEntry, GuildRankRow, GuildSummary, GuildWhole } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** A member as `CGuildMember::Serialize` writes it (`_Common/guild.cpp:266-280`), with defaults for the unused fields. */
export function guildMember(playerId: number, rank: number, extra: Partial<GuildMemberEntry> = {}): GuildMemberEntry {
  return {
    playerId, pay: 0, giveGold: 0, givePxp: 0, win: 0, lose: 0, rank, selectedVote: 0, surrender: 0, rankClass: 0, alias: '',
    ...extra,
  };
}

/** A whole guild with defaults: level 1, no logo, no notice, the Master's rights 0xFF (`CORESERVER/DPCoreSrvr.cpp:1344-1446`). */
export function guildWhole(guildId: number, masterId: number, name: string, members: readonly GuildMemberEntry[], extra: Partial<GuildWhole> = {}): GuildWhole {
  return {
    guildId, masterId, level: 1, name, logo: 0, gold: 0, win: 0, lose: 0, surrender: 0,
    power: [0xff, 0, 0, 0, 0], penya: [0, 0, 0, 0, 0], notice: '', contributionPxp: 0, enemyGuildId: 0,
    members: [...members], votes: [], quests: [], ...extra,
  };
}

/** `CAr::WriteString` of any game text (the notice holds line breaks, which `ArWriter.string`'s ASCII refuses). */
function text(w: ArWriter, value: string): ArWriter {
  return w.i32(value.length).bytes(Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff));
}

function writeSummary(w: ArWriter, g: GuildSummary): ArWriter {
  return text(w.u32(g.guildId).u32(g.masterId).i32(g.level), g.name).u32(g.logo).u32(g.gold).i32(g.win).i32(g.lose).i32(g.surrender);
}

/** `CGuild::Serialize( ar, FALSE )` (`guild.cpp:409-435`): no votes and no quests unless given. */
function writeWhole(w: ArWriter, g: GuildWhole): ArWriter {
  writeSummary(w, g);
  for (let i = 0; i < 5; i++) w.u32(g.power[i] ?? 0);
  for (let i = 0; i < 5; i++) w.u32(g.penya[i] ?? 0);
  text(w, g.notice).u32(g.contributionPxp).i32(g.level).u32(g.enemyGuildId).i16(g.members.length);
  for (const m of g.members) {
    w.u32(m.playerId).i32(m.pay).i32(m.giveGold).u32(m.givePxp).i16(m.win).i16(m.lose).u8(m.rank)
      .u32(m.selectedVote).i32(m.surrender).i32(m.rankClass).string(m.alias);
  }
  w.i16(g.votes.length);
  for (const v of g.votes) {
    w.u32(v.voteId).u8(v.completed ? 1 : 0).string(v.title).string(v.question);
    for (let i = 0; i < 4; i++) w.string(v.choices[i]?.text ?? '').u8(v.choices[i]?.count ?? 0);
  }
  w.u8(g.quests.length);
  for (const q of g.quests) w.i32(q.questId).i32(q.state).u32(q.guildId);
  return w;
}

/** A NUL-padded `char[size]`. */
function fixed(w: ArWriter, text: string, size: number): ArWriter {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < Math.min(text.length, size - 1); i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return w.bytes(bytes);
}

/** GUILD_INVITE (`CUser::AddGuildInvite`, `User.cpp:1935-1945`): about the invited player. */
export const writeGuildInvite = (ownObjectId: number, guildId: number, inviterId: number): ScriptMessage =>
  scripted(ownObjectId, GuildMessageType.GUILD_INVITE, new ArWriter().u32(guildId).u32(inviterId));

/** SET_GUILD (`AddSetGuild`): about the mover whose guild it is (0: none). */
export const writeSetGuild = (moverObjectId: number, guildId: number): ScriptMessage =>
  scripted(moverObjectId, GuildMessageType.SET_GUILD, new ArWriter().u32(guildId));

/** CREATE_GUILD (`AddCreateGuild`, `User.cpp:5294-5304`): to every player. */
export const writeCreateGuild = (masterId: number, guildId: number, masterName: string, name: string): ScriptMessage =>
  scripted(NULL_ID, GuildMessageType.CREATE_GUILD, new ArWriter().u32(masterId).u32(guildId).string(masterName).string(name));

/** DESTROY_GUILD (`AddDestroyGuild`): the master's name, then the guild. */
export const writeDestroyGuild = (masterName: string, guildId: number): ScriptMessage =>
  scripted(NULL_ID, GuildMessageType.DESTROY_GUILD, new ArWriter().string(masterName).u32(guildId));

/** GUILD (`AddMyGuild`): the id, then the whole guild. */
export const writeGuild = (ownObjectId: number, guild: GuildWhole): ScriptMessage =>
  scripted(ownObjectId, GuildMessageType.GUILD, writeWhole(new ArWriter().u32(guild.guildId), guild));

/** ALL_GUILDS (`AddAllGuilds`): `CGuildMng::Serialize( ar, TRUE )` with a ranking (empty unless given). */
export function writeAllGuilds(ownObjectId: number, guilds: readonly GuildSummary[], ranking: readonly (readonly GuildRankRow[])[] = [], version = 1): ScriptMessage {
  const w = new ArWriter().u32(guilds.reduce((max, g) => Math.max(max, g.guildId), 0)).i32(guilds.length);
  for (const g of guilds) writeSummary(w, g);
  w.u32(version);
  for (let i = 0; i < 8; i++) w.i32(ranking[i]?.length ?? 0);
  for (let i = 0; i < 8; i++) {
    for (const row of ranking[i] ?? []) {
      w.i32(row.logo);
      fixed(w, row.name, 17);
      fixed(w, row.master, 33);
      w.u8(0).u8(0).i32(row.win).i32(row.lose).i32(row.surrender).f32(row.averageLevel).i32(row.winPoint);
    }
  }
  return scripted(ownObjectId, GuildMessageType.ALL_GUILDS, w);
}

/** GUILD_LOGO (`AddGuildLogo`, `User.cpp:5341-5349`): to every player. */
export const writeGuildLogo = (guildId: number, logo: number): ScriptMessage =>
  scripted(NULL_ID, GuildMessageType.GUILD_LOGO, new ArWriter().u32(guildId).u32(logo));

/** GUILD_CONTRIBUTION (`DPCoreClient.cpp:2274-2304`): `CONTRIBUTION_CHANGED_INFO`. */
export function writeGuildContribution(ownObjectId: number, info: { guildId: number; playerId: number; pxpCount: number; penya: number; guildPxpCount: number; guildPenya: number; guildLevel: number }): ScriptMessage {
  return scripted(ownObjectId, GuildMessageType.GUILD_CONTRIBUTION, new ArWriter().u32(info.guildId).u32(info.playerId)
    .u32(info.pxpCount).u32(info.penya).u32(info.guildPxpCount).u32(info.guildPenya).u16(info.guildLevel));
}

/** GUILD_NOTICE (`DPCoreClient.cpp:2373-2397`). */
export const writeGuildNotice = (ownObjectId: number, guildId: number, notice: string): ScriptMessage =>
  scripted(ownObjectId, GuildMessageType.GUILD_NOTICE, text(new ArWriter().u32(guildId), notice));

/** GUILD_AUTHORITY (`DPCoreClient.cpp:2399-2423`): the five DWORDs raw. */
export function writeGuildAuthority(ownObjectId: number, power: readonly number[]): ScriptMessage {
  const w = new ArWriter();
  for (let i = 0; i < 5; i++) w.u32(power[i] ?? 0);
  return scripted(ownObjectId, GuildMessageType.GUILD_AUTHORITY, w);
}

/** GUILD_PENYA (`DPCoreClient.cpp:2425-2447`): the rank and its salary. */
export const writeGuildPenya = (ownObjectId: number, rank: number, penya: number): ScriptMessage =>
  scripted(ownObjectId, GuildMessageType.GUILD_PENYA, new ArWriter().u32(rank).u32(penya));

/** GUILD_REAL_PENYA: the guild fund after the payout, the own rank. */
export const writeGuildRealPenya = (ownObjectId: number, gold: number, rank: number): ScriptMessage =>
  scripted(ownObjectId, GuildMessageType.GUILD_REAL_PENYA, new ArWriter().i32(gold).i32(rank));

/** SET_WAR: about the mover whose war it is. */
export const writeSetWar = (moverObjectId: number, warId: number): ScriptMessage =>
  scripted(moverObjectId, GuildMessageType.SET_WAR, new ArWriter().u32(warId));

// --- the core's whole packets (for `gateway.pushCache`) ---

/** GUILD (`CDPCacheSrvr::SendGuild`, `DPCacheSrvr.cpp:1856-1864`): to a member who just joined. */
export const directGuild = (guild: GuildWhole): Uint8Array =>
  writeWhole(new ArWriter().u32(GuildPacket.GUILD).u32(guild.guildId), guild).toBytes();

/** ADD_GUILD_MEMBER (`SendAddGuildMember`, :1866-1877): GUILD_MEMBER_INFO raw, the guild, the name. */
export const directAddGuildMember = (playerId: number, guildId: number, name: string, multiNo = 100): Uint8Array =>
  new ArWriter().u32(GuildPacket.ADD_GUILD_MEMBER).u32(playerId).u8(multiNo).u8(0).u8(0).u8(0).u32(guildId).string(name).toBytes();

/** REMOVE_GUILD_MEMBER: the player, the guild. */
export const directRemoveGuildMember = (playerId: number, guildId: number): Uint8Array =>
  new ArWriter().u32(GuildPacket.REMOVE_GUILD_MEMBER).u32(playerId).u32(guildId).toBytes();

/** GUILD_MEMBER_LEVEL: the player, the new rank. */
export const directGuildMemberLevel = (playerId: number, rank: number): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_MEMBER_LEVEL).u32(playerId).i32(rank).toBytes();

/** GUILD_CLASS: the player, the new class. */
export const directGuildClass = (playerId: number, rankClass: number): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_CLASS).u32(playerId).i32(rankClass).toBytes();

/** CHG_MASTER: the old master, the new one. */
export const directChgMaster = (oldMasterId: number, newMasterId: number): Uint8Array =>
  new ArWriter().u32(GuildPacket.CHG_MASTER).u32(oldMasterId).u32(newMasterId).toBytes();

/** GUILD_NICKNAME: the player, the nickname. */
export const directGuildNickname = (playerId: number, alias: string): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_NICKNAME).u32(playerId).string(alias).toBytes();

/** GUILD_GAMELOGIN (`CGuildMng::AddConnection`, `guild.cpp:837-903`). */
export const directGuildMemberLogin = (login: boolean, playerId: number, multiNo = 100): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_GAMELOGIN).u8(login ? 1 : 0).u32(playerId).u32(multiNo).toBytes();

/** GUILD_SETNAME: to every player. */
export const directGuildSetName = (guildId: number, name: string): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_SETNAME).u32(guildId).string(name).toBytes();

/** GUILD_ERROR: 1 the name is taken, 2 not a number. */
export const directGuildError = (error: number): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_ERROR).i32(error).toBytes();

/** GUILD_CHAT (`DPCacheSrvr.cpp:1936-1943`): the speaker's object id, name and text. */
export const directGuildChat = (speakerObjectId: number, sender: string, text: string): Uint8Array =>
  new ArWriter().u32(GuildPacket.GUILD_CHAT).u32(speakerObjectId).string(sender).string(text).toBytes();
