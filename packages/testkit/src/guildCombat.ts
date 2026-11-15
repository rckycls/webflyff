// 2026-11-15 (Guild Siege): SNAPSHOTTYPE_GUILDCOMBAT as the world server writes it (`WORLDSERVER/User.cpp:5718-6309` and
// :6807-7067), in the order of the reader (`@flyffweb/protocol` world/guildCombat.ts).

import { ArWriter, GuildCombatMessageType, GuildCombatSub } from '@flyffweb/protocol';
import type { GuildCombatMessage } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const bool = (w: ArWriter, value: boolean): ArWriter => w.i32(value ? 1 : 0);

/** One GUILDCOMBAT snapshot of `msg` under `objectId` (the receiving player; the mover for `userState`). */
export function writeGuildCombat(objectId: number, msg: GuildCombatMessage): ScriptMessage {
  const w = new ArWriter();
  const sub = (id: number): ArWriter => w.u8(id);
  switch (msg.sub) {
    case 'winGuild': sub(GuildCombatSub.WINGUILD).i32(msg.combatIndex).u32(msg.winGuildId).i32(msg.winCount); break;
    case 'inWindow': sub(GuildCombatSub.IN_WINDOW).i64(BigInt(msg.totalPrize)).u32(msg.ownBid).u32(msg.minBid); break;
    case 'requestStatus':
      sub(GuildCombatSub.REQUEST_STATUS).i32(msg.secondsToNext).i64(BigInt(msg.prize)).i32(msg.guildNames.length);
      for (const name of msg.guildNames) w.string(name);
      w.u32(msg.ownBid);
      break;
    case 'selectPlayer':
      sub(GuildCombatSub.SELECTPLAYER).i32(msg.maxJoin).i32(msg.maxWar);
      bool(w, msg.requestWar);
      if (msg.requestWar) {
        bool(w, msg.window);
        if (msg.window) {
          w.u32(msg.defenderId).i32(msg.playerIds.length);
          for (const id of msg.playerIds) w.u32(id);
        }
      }
      break;
    case 'selectWarPos': sub(GuildCombatSub.SELECTWARPOS).i32(msg.map).i32(msg.seconds); break;
    case 'bestPlayer': sub(GuildCombatSub.BESTPLAYER).u32(msg.playerId); break;
    case 'isRequest': bool(sub(GuildCombatSub.ISREQUEST), msg.requested); break;
    case 'userState': sub(GuildCombatSub.USERSTATE).u32(msg.moverId).i32(msg.state); break;
    case 'warPlayerList':
      sub(GuildCombatSub.WARPLAYERLIST).i32(msg.guilds.length);
      for (const g of msg.guilds) {
        w.u32(g.defenderId).i32(g.members.length);
        for (const m of g.members) w.u32(m.playerId).i32(m.status);
      }
      break;
    case 'guildStatus':
      sub(GuildCombatSub.GUILDSTATUS).i32(msg.joinIndex).i32(msg.players.length);
      for (const p of msg.players) w.u32(p.playerId).i32(p.lives);
      break;
    case 'guildPrecedence':
      sub(GuildCombatSub.GUILDPRECEDENCE).i32(msg.guilds.length);
      for (const g of msg.guilds) {
        if (g.has) bool(w, true).string(g.name).i32(g.points); else bool(w, false);
      }
      break;
    case 'playerPrecedence':
      sub(GuildCombatSub.PLAYERPRECEDENCE).i32(msg.guilds.length);
      for (const g of msg.guilds) {
        w.i32(g.length);
        for (const p of g) w.u32(p.playerId).i32(p.points);
      }
      break;
    case 'gcState': sub(GuildCombatSub.GCSTATE).i32(msg.state).i32(msg.warState); break;
    case 'nextTimeState': sub(GuildCombatSub.NEXTTIMESTATE).u32(msg.msLeft).u32(msg.nextState); break;
    case 'enterTime': sub(GuildCombatSub.ENTERTIME).u32(msg.msLeft); break;
    case 'diagMessage': sub(GuildCombatSub.DIAGMESSAGE).string(msg.text); break;
    case 'tele': sub(GuildCombatSub.TELE).string(msg.text); break;
    case 'log':
      sub(GuildCombatSub.LOG).u32(msg.entries.length);
      for (const e of msg.entries) {
        w.u32(e.atkGuildId).u32(e.defGuildId).u32(e.atkPlayerId).u32(e.defPlayerId).i32(e.point);
        bool(w, e.diffGuild); bool(w, e.master); bool(w, e.defender); bool(w, e.lastLife);
      }
      break;
    case 'logRealtime':
      sub(GuildCombatSub.LOG_REALTIME).u32(msg.atkGuildId).u32(msg.defGuildId).string(msg.atkName).string(msg.defName)
        .u32(msg.atkPlayerId).u32(msg.defPlayerId).i32(msg.point);
      bool(w, msg.diffGuild); bool(w, msg.master); bool(w, msg.defender); bool(w, msg.lastLife);
      break;
    case 'getPenyaGuild': sub(GuildCombatSub.GETPENYAGUILD).i32(msg.result).i64(BigInt(msg.penya)); break;
    case 'getPenyaPlayer': sub(GuildCombatSub.GETPENYAPLAYER).i32(msg.result).i64(BigInt(msg.penya)); break;
    case 'playerPoint':
      sub(GuildCombatSub.PLAYERPOINT).u32(msg.players.length);
      for (const p of msg.players) w.u32(p.playerId).i32(p.job).i32(p.point);
      break;
    case 'unknown': sub(msg.id); break;
  }
  return { objectId, type: GuildCombatMessageType.GUILDCOMBAT, fields: w.toBytes() };
}
