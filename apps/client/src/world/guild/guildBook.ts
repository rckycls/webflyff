// The guilds the client knows (2026-11-10, guild research §4, appendix B §2-3): Neuz's `g_GuildMng` (`CGuildMng`,
// `_Common/guild.cpp:786-835`), every guild's short form from ALL_GUILDS and the all-player broadcasts, and the own guild
// in full from GUILD. `apply` copies each `CDPClient::On*` handler's change and returns what the screen must do: a game
// line, the invite window, a refresh of the windows and the name tags, the members' player data.
//
//   OnCreateGuild  Neuz/DPClient.cpp:12516-12581   OnDestroyGuild 12583-12615   OnGuild 12617-12686
//   OnSetGuild     12689-12745                     OnAddGuildMember 12747-12799 OnRemoveGuildMember 12801-12838
//   OnGuildMemberLv 12878-12918  OnGuildClass 12920-12941  OnChgMaster 12943-12982  OnGuildNickName 12984-13005
//   OnGuildError 13099-13119  OnGuildInvite 13121-13143  OnAllGuilds 13145-13148  OnGuildLogo 13254-13265
//   OnGuildContribution 13278-13296  OnGuildNotice 13368-13387  OnGuildAuthority 13389-13406  OnGuildPenya 13408-13428
//   OnGuildRealPenya 13430-13452  OnGuildSetName 13454-13476  OnSetWar / OnWar DPClientGuildWar.cpp:179-226

import type {
  GuildMemberEntry, GuildMessage, GuildDirectMessage, GuildRanking, GuildSummary, GuildWarState,
} from '@flyffweb/protocol';
import { GuildRank } from './guildRules';
import type { GuildLike } from './guildRules';

/** A guild as the client keeps it; the own guild also has its whole fields. */
export interface Guild extends GuildSummary, GuildLike {
  power: number[];
  penya: number[];
  notice: string;
  contributionPxp: number;
  enemyGuildId: number;
  members: Map<number, GuildMemberEntry>;
  /** Whether GUILD came for it (the own guild): its members are all known. */
  whole: boolean;
}

/** What the screen does after a message. */
export type GuildEvent =
  /** A game line in the text's own colour; `args` fill its %s. */
  | { kind: 'line'; tid: string; english: string; args: Array<string | number> }
  /** The invite window (`CWndGuildConfirm`) for this guild and inviter. */
  | { kind: 'invite'; guildId: number; guildName: string; inviterId: number }
  /** The own guild's windows and the Messenger's Guild tab to refresh. */
  | { kind: 'changed' }
  /** A mover's guild, or a guild's name or logo, changed: the name tags to redraw. */
  | { kind: 'tags' }
  /** The own player joined (`BGM_IN_COMPANY`) or left a guild: the chat's Guild tab. */
  | { kind: 'joined' }
  | { kind: 'left' }
  /** QUERY_PLAYER_DATA2 for the own guild's members (`OnGuild`, :12662-12684). */
  | { kind: 'queryMembers'; playerIds: number[] };

/** What `apply` reads of the world. */
export interface GuildContext {
  ownObjectId: number;
  ownPlayerId: number;
  /** A mover's guild (ADD_OBJ, SET_GUILD), and its change. */
  moverGuild(objectId: number): number | undefined;
  setMoverGuild(objectId: number, guildId: number): void;
  setMoverWar(objectId: number, warId: number): void;
  /** `prj.GetUserByID( idPlayer )`: a player in view, by its id; its object id and name. */
  playerInView(playerId: number): { objectId: number; name: string } | undefined;
  /** `CPlayerDataCenter::GetPlayerString`: a player's name from the player data, '' when unknown. */
  playerName(playerId: number): string;
}

const emptyGuild = (summary: GuildSummary): Guild => ({
  ...summary, power: [0, 0, 0, 0, 0], penya: [0, 0, 0, 0, 0], notice: '', contributionPxp: 0, enemyGuildId: 0,
  members: new Map(), whole: false,
});

export class GuildBook {
  private readonly guilds = new Map<number, Guild>();
  /** The own mover's guild id (`g_pPlayer->m_idGuild`). */
  private ownGuildId = 0;
  /** The guild ranking that came with ALL_GUILDS (for the ranking windows, later). */
  ranking: GuildRanking | null = null;
  /** The own guild's war, from WAR (`g_pPlayer->GetWar()`), or null. */
  war: GuildWarState | null = null;
  /** The own mover's war (`m_idWar`). */
  ownWarId = 0;

  /** `g_GuildMng.GetGuild( id )`. */
  guild(guildId: number): Guild | undefined {
    return guildId === 0 ? undefined : this.guilds.get(guildId);
  }

  /** `g_pPlayer->GetGuild()`: the own mover's guild, when the own player is a member of it (`Mover.cpp:8137-8160`). */
  own(ownPlayerId: number): Guild | null {
    const guild = this.guild(this.ownGuildId);
    return guild !== undefined && guild.members.has(ownPlayerId) ? guild : null;
  }

  get ownGuild(): number {
    return this.ownGuildId;
  }

  /** The own mover came (its ADD_OBJ): its guild and war. */
  setOwn(guildId: number, warId: number): void {
    this.ownGuildId = guildId;
    this.ownWarId = warId;
  }

  /** The guild shown above a mover (`CMover::GetGuild`, the client branch). */
  shownGuild(guildId: number | undefined, playerId: number, ownPlayerId: number): Guild | undefined {
    const guild = this.guild(guildId ?? 0);
    if (guild === undefined) return undefined;
    if (guildId === this.ownGuildId && this.own(ownPlayerId) !== null) return guild.members.has(playerId) ? guild : undefined;
    return guild;
  }

  /** Forgets every guild (a log-out). */
  reset(): void {
    this.guilds.clear();
    this.ownGuildId = 0;
    this.ownWarId = 0;
    this.ranking = null;
    this.war = null;
  }

  apply(objectId: number, message: GuildMessage | GuildDirectMessage, ctx: GuildContext): GuildEvent[] {
    switch (message.type) {
      case 'allGuilds': {
        // `CGuildMng::Serialize`: `Clear()`, then every guild's short form (`guild.cpp:802-835`)
        this.guilds.clear();
        for (const summary of message.guilds) this.guilds.set(summary.guildId, emptyGuild(summary));
        this.ranking = message.ranking;
        return [{ kind: 'tags' }, { kind: 'changed' }];
      }
      case 'guildWhole': {
        const { members, votes: _votes, quests: _quests, ...rest } = message.guild;
        const guild: Guild = { ...rest, members: new Map(members.map((m) => [m.playerId, m])), whole: true };
        this.guilds.set(guild.guildId, guild);
        return [{ kind: 'changed' }, { kind: 'tags' }, { kind: 'queryMembers', playerIds: members.map((m) => m.playerId) }];
      }
      case 'createGuild': {
        // AddGuild fails for a guild already kept
        if (this.guilds.has(message.guildId)) return [];
        const guild = emptyGuild({
          guildId: message.guildId, masterId: message.masterId, level: 1, name: message.name, logo: 0, gold: 0, win: 0,
          lose: 0, surrender: 0,
        });
        guild.power[GuildRank.MASTER] = 0xff;
        guild.members.set(message.masterId, member(message.masterId, GuildRank.MASTER));
        this.guilds.set(guild.guildId, guild);
        const mover = ctx.playerInView(message.masterId);
        if (mover !== undefined) this.setMover(mover.objectId, message.guildId, ctx);
        return [
          { kind: 'line', tid: 'TID_GAME_COMCREATE', english: "%s has formed the guild '%s'.", args: [message.masterName, message.name] },
          { kind: 'tags' }, { kind: 'changed' },
        ];
      }
      case 'destroyGuild': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined) return [];
        const events: GuildEvent[] = [];
        if (message.guildId === this.ownGuildId) {
          events.push({ kind: 'line', tid: 'TID_GAME_COMDISMESS', english: '%s has disbanded the %s guild.', args: [message.masterName, guild.name] });
        }
        this.guilds.delete(message.guildId);
        events.push({ kind: 'changed' }, { kind: 'tags' });
        return events;
      }
      case 'setGuild': {
        const old = ctx.moverGuild(objectId) ?? 0;
        if (objectId !== ctx.ownObjectId && ctx.moverGuild(objectId) === undefined) return [];
        this.setMover(objectId, message.guildId, ctx);
        const events: GuildEvent[] = [{ kind: 'tags' }];
        if (objectId !== ctx.ownObjectId) return events;
        if (message.guildId === 0) {
          const guild = this.guilds.get(old);
          if (guild !== undefined) events.push({ kind: 'line', tid: 'TID_GAME_COMLEAVE', english: 'You are no longer a member of the %s guild.', args: [guild.name] });
          events.push({ kind: 'left' }, { kind: 'changed' });
        } else {
          const guild = this.guilds.get(message.guildId);
          if (guild !== undefined) {
            events.push(
              { kind: 'joined' },
              { kind: 'line', tid: 'TID_GAME_COMACCEPT', english: 'You have joined the %s guild.', args: [guild.name] },
              { kind: 'changed' },
            );
          }
        }
        return events;
      }
      case 'guildInvite': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined) return [];
        return [{ kind: 'invite', guildId: message.guildId, guildName: guild.name, inviterId: message.inviterId }];
      }
      case 'guildMemberAdded': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined || guild.members.has(message.playerId)) return [];
        guild.members.set(message.playerId, member(message.playerId, GuildRank.ROOKIE));
        return [
          { kind: 'line', tid: 'TID_GAME_COMACCEPTWELCOME', english: '%s has joined the guild.', args: [message.name] },
          { kind: 'changed' }, { kind: 'tags' },
        ];
      }
      case 'guildMemberRemoved': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined || !guild.members.delete(message.playerId)) return [];
        const name = ctx.playerName(message.playerId);
        const events: GuildEvent[] = [];
        if (name !== '') events.push({ kind: 'line', tid: 'TID_GAME_COMLEAVEBYE', english: '%s has left the guild.', args: [name] });
        events.push({ kind: 'changed' }, { kind: 'tags' });
        return events;
      }
      case 'guildMemberLevel': {
        // the promoted/demoted text is formatted but never put (`:12890-12901`): no line
        const entry = this.own(ctx.ownPlayerId)?.members.get(message.playerId);
        if (entry === undefined) return [];
        entry.rank = message.rank;
        entry.rankClass = 0;
        return [{ kind: 'changed' }];
      }
      case 'guildClass': {
        const entry = this.own(ctx.ownPlayerId)?.members.get(message.playerId);
        if (entry === undefined) return [];
        entry.rankClass = message.rankClass;
        return [{ kind: 'changed' }];
      }
      case 'guildMasterChanged': {
        const guild = this.own(ctx.ownPlayerId);
        const old = guild?.members.get(message.oldMasterId), next = guild?.members.get(message.newMasterId);
        if (guild === null || old === undefined || next === undefined) return [];
        guild.masterId = message.newMasterId;
        old.rank = GuildRank.ROOKIE;
        old.rankClass = 0;
        next.rank = GuildRank.MASTER;
        next.rankClass = 0;
        const events: GuildEvent[] = [{ kind: 'changed' }, { kind: 'tags' }];
        const mover = ctx.playerInView(message.newMasterId);
        if (mover !== undefined) events.unshift({ kind: 'line', tid: 'TID_GAME_CHANGE_GUILDMASTER', english: '%s has become the guild master.', args: [mover.name] });
        return events;
      }
      case 'guildNickname': {
        const entry = this.own(ctx.ownPlayerId)?.members.get(message.playerId);
        if (entry === undefined) return [];
        entry.alias = message.alias;
        return [{ kind: 'changed' }];
      }
      case 'guildError':
        if (message.error === 1) return [{ kind: 'line', tid: 'TID_GAME_COMOVERLAPNAME', english: 'Guild name already exists.', args: [] }];
        if (message.error === 2) return [{ kind: 'line', tid: 'TID_GAME_GUILDONLYNUMBER', english: 'Please enter the number.', args: [] }];
        return [];
      case 'guildLogo': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined) return [];
        guild.logo = message.logo;
        return [{ kind: 'tags' }, { kind: 'changed' }];
      }
      case 'guildContribution': {
        const { info } = message;
        const guild = this.guilds.get(info.guildId);
        if (guild === undefined) return [];
        const events: GuildEvent[] = [];
        if (info.guildLevel > guild.level) events.push({ kind: 'line', tid: 'TID_GAME_GUILDLEVELUP', english: 'Guild level has increased.', args: [] });
        guild.level = info.guildLevel;
        guild.gold = info.guildPenya;
        guild.contributionPxp = info.guildPxpCount;
        const entry = guild.members.get(info.playerId);
        if (entry !== undefined) {
          entry.givePxp = info.pxpCount;
          entry.giveGold = info.penya;
        }
        events.push({ kind: 'changed' });
        return events;
      }
      case 'guildNotice': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined) return [];
        guild.notice = message.notice;
        return [
          { kind: 'line', tid: 'TID_GAME_GUILDNOTICEUPDATE', english: 'A new Guild Notice has been posted. Please check it in the guild window.', args: [] },
          { kind: 'changed' },
        ];
      }
      case 'guildAuthority': {
        const guild = this.own(ctx.ownPlayerId);
        if (guild === null) return [];
        guild.power = [...message.power];
        return [{ kind: 'line', tid: 'TID_GAME_GUILDCHGWARRANT', english: 'Authority for each title has been changed.', args: [] }, { kind: 'changed' }];
      }
      case 'guildPenya': {
        const guild = this.own(ctx.ownPlayerId);
        if (guild === null || message.rank >= guild.penya.length) return [];
        guild.penya[message.rank] = message.penya;
        return [{ kind: 'line', tid: 'TID_GAME_GUILDCHGPAY', english: 'Salary for each title has been changed.', args: [] }, { kind: 'changed' }];
      }
      case 'guildRealPenya': {
        const guild = this.own(ctx.ownPlayerId);
        if (guild === null) return [];
        guild.gold = message.gold;
        const pay = guild.penya[message.rank] ?? 0;
        const events: GuildEvent[] = [];
        if (pay > 0) events.push({ kind: 'line', tid: 'TID_GAME_GUILD_PAYTAKE', english: 'Guild salary of %d Penya received. Log in again to acquire the amount.', args: [pay] });
        events.push({ kind: 'changed' });
        return events;
      }
      case 'guildSetName': {
        const guild = this.guilds.get(message.guildId);
        if (guild === undefined) return [];
        const old = guild.name;
        guild.name = message.name;
        return [
          { kind: 'line', tid: 'TID_GAME_GUILDNAMECHG', english: '%s guild has changed their name to %s.', args: [old, message.name] },
          { kind: 'tags' }, { kind: 'changed' },
        ];
      }
      case 'setWar':
        if (objectId === ctx.ownObjectId) this.ownWarId = message.warId;
        ctx.setMoverWar(objectId, message.warId);
        return [{ kind: 'changed' }];
      case 'guildWar':
        this.war = message.war;
        return [{ kind: 'changed' }];
      // V15 keeps the online state in the player data: these change nothing but the windows (`:13008-13097`)
      case 'guildMemberLogin':
      case 'guildGameJoin':
        return [{ kind: 'changed' }];
      case 'guildMsgControl':
        return [];
    }
  }

  private setMover(objectId: number, guildId: number, ctx: GuildContext): void {
    ctx.setMoverGuild(objectId, guildId);
    if (objectId === ctx.ownObjectId) this.ownGuildId = guildId;
  }
}

const member = (playerId: number, rank: number): GuildMemberEntry => ({
  playerId, pay: 0, giveGold: 0, givePxp: 0, win: 0, lose: 0, rank, selectedVote: 0, surrender: 0, rankClass: 0, alias: '',
});
