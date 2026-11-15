// 2026-11-15 (Guild Siege): SNAPSHOTTYPE_GUILDCOMBAT 0x00b8 and the siege's client packets, as Neuz reads and writes them.
//
//   snapshot  OBJID, WORD 0x00b8, BYTE sub-type (`MsgHdr.h:1075`, sub-types :1509-1532); `CDPClient::OnGuildCombat`
//             (`Neuz/DPClient.cpp:6745-6821` and the handlers it calls). One reader switches on the sub-type; the
//             snapshot's own bytes bound it (`readIndexed` hands each reader a reader of just its body).
//   writers   `WORLDSERVER/User.cpp:5718-6309` (broadcasts) and `:6807-7067` (per user)
//   sends     `Neuz/DPClient.cpp:9115-9205`, packet types `_Network/MsgHdr.h:557-574`
//
// Wire: ints 4 bytes, time_t 4 bytes (read as i32), __int64 8 bytes, a string an i32 length and the bytes (no NUL), BOOL
// 4 bytes. Strings are read whole (the C++ reads them into a 127/511/63-byte buffer; the bound here is the snapshot).

import type { ArReader } from '../ar/ArReader';
import { decodeText } from '../text';
import { clientPacket } from './packet';

/** The snapshot's type (`MsgHdr.h:1075`). */
export const GuildCombatMessageType = { GUILDCOMBAT: 0xb8 } as const;

/** The sub-types (`MsgHdr.h:1509-1532`). `GC_IN_APP` 0x02 and `GC_IN_COMPLETE` 0x03 are not handled by Neuz. */
export const GuildCombatSub = {
  WINGUILD: 0x00, IN_WINDOW: 0x01, REQUEST_STATUS: 0x04, SELECTPLAYER: 0x05, SELECTWARPOS: 0x06, BESTPLAYER: 0x07,
  ISREQUEST: 0x08, USERSTATE: 0x10, WARPLAYERLIST: 0x11, GUILDSTATUS: 0x20, GUILDPRECEDENCE: 0x21, PLAYERPRECEDENCE: 0x22,
  GCSTATE: 0x30, NEXTTIMESTATE: 0x31, ENTERTIME: 0x32, DIAGMESSAGE: 0x33, TELE: 0x34, LOG: 0x35, LOG_REALTIME: 0x36,
  GETPENYAGUILD: 0x40, GETPENYAPLAYER: 0x41, PLAYERPOINT: 0x42,
} as const;

/** The client packet types (`MsgHdr.h:557-574`). */
export const GuildCombatPacketType = {
  IN: 0xf000d022, OUT: 0xf000d023, JOIN: 0xf000d024, SELECTPLAYER: 0xf000d027, REQUEST_STATUS: 0xf000d028,
  SELECTMAP: 0xf000d02b, GETPENYAGUILD: 0xf000d02d, GETPENYAPLAYER: 0xf000d02e, TELE: 0xf000d030, PLAYERPOINT: 0xf000d031,
} as const;

/** `GC_IN_WINDOW` / `GC_IN_APP`, the BYTE after `PACKETTYPE_IN_GUILDCOMBAT`. */
const GC_IN_WINDOW = 0x01;
const GC_IN_APP = 0x02;

/** An __int64 (penya): a number when it is a safe integer, else the bigint. */
export type GcInt64 = number | bigint;

export function gcInt64(value: bigint): GcInt64 {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

/** One kill of `GC_LOG` (`__GCGETPOINT`, `eveschool.h:175-192`). */
export type GuildCombatLogEntry = {
  atkGuildId: number; defGuildId: number; atkPlayerId: number; defPlayerId: number; point: number;
  diffGuild: boolean; master: boolean; defender: boolean; lastLife: boolean;
};

export type GuildCombatMessage = { type: 'guildCombat' } & (
  /** `m_nGuildCombatIndex`, `m_uWinGuildId`, `m_nWinGuildCount`. */
  | { sub: 'winGuild'; combatIndex: number; winGuildId: number; winCount: number }
  /** The Apply window: the prize (ignored on V15), the own guild's bid and the least bid. */
  | { sub: 'inWindow'; totalPrize: GcInt64; ownBid: number; minBid: number }
  /** The Status window: seconds to the next state, the prize, the applicants' names (all, no cap) and the own bid. */
  | { sub: 'requestStatus'; secondsToNext: number; prize: GcInt64; guildNames: string[]; ownBid: number }
  /**
   * The line-up window. `requestWar` false or `window` false: the line-up is complete (the rest is 0 and empty);
   * `window` true: the defender and the player ids in order.
   */
  | { sub: 'selectPlayer'; maxJoin: number; maxWar: number; requestWar: boolean; window: boolean; defenderId: number; playerIds: number[] }
  /** The entry-point window: the map (99 default/random) and its seconds. */
  | { sub: 'selectWarPos'; map: number; seconds: number }
  | { sub: 'bestPlayer'; playerId: number }
  /** `m_bRequest`: the own guild has applied. */
  | { sub: 'isRequest'; requested: boolean }
  /** `m_nGuildCombatState` of a mover: 0 none, 1 fighting, 2 waiting/observer-entrant. */
  | { sub: 'userState'; moverId: number; state: number }
  /** Each guild's line-up by its defender id; a guild's members: status 1 fighting, 0 waiting or out. */
  | { sub: 'warPlayerList'; guilds: Array<{ defenderId: number; members: Array<{ playerId: number; status: number }> }> }
  /** The own guild's HUD list: `joinIndex` (= maxWar while someone waits, else 0) and each player's lives. */
  | { sub: 'guildStatus'; joinIndex: number; players: Array<{ playerId: number; lives: number }> }
  /** The guild board: one entry per siege guild; `has` false for a guild without entrants. */
  | { sub: 'guildPrecedence'; guilds: Array<{ has: false } | { has: true; name: string; points: number }> }
  /** The player board: per guild, its players' points. */
  | { sub: 'playerPrecedence'; guilds: Array<Array<{ playerId: number; points: number }>> }
  | { sub: 'gcState'; state: number; warState: number }
  | { sub: 'nextTimeState'; msLeft: number; nextState: number }
  | { sub: 'enterTime'; msLeft: number }
  | { sub: 'diagMessage'; text: string }
  | { sub: 'tele'; text: string }
  | { sub: 'log'; entries: GuildCombatLogEntry[] }
  | {
    sub: 'logRealtime'; atkGuildId: number; defGuildId: number; atkName: string; defName: string; atkPlayerId: number;
    defPlayerId: number; point: number; diffGuild: boolean; master: boolean; defender: boolean; lastLife: boolean;
  }
  /** `result`: 0 received, 1 cancelled, 2 winner not a guild, 3 overflow. */
  | { sub: 'getPenyaGuild'; result: number; penya: GcInt64 }
  /** `result`: 0 received, 1 not the MVP, 2 overflow. */
  | { sub: 'getPenyaPlayer'; result: number; penya: GcInt64 }
  | { sub: 'playerPoint'; players: Array<{ playerId: number; job: number; point: number }> }
  | { sub: 'unknown'; id: number }
);

/** A string read whole: an i32 length and the bytes. */
function str(r: ArReader): string {
  const length = r.i32();
  return decodeText(r.bytes(length));
}

const bool = (r: ArReader): boolean => r.i32() !== 0;

export function readGuildCombat(r: ArReader): GuildCombatMessage {
  const id = r.u8();
  const t = 'guildCombat' as const;
  switch (id) {
    case GuildCombatSub.WINGUILD:
      return { type: t, sub: 'winGuild', combatIndex: r.i32(), winGuildId: r.u32(), winCount: r.i32() };
    case GuildCombatSub.IN_WINDOW:
      return { type: t, sub: 'inWindow', totalPrize: gcInt64(r.i64()), ownBid: r.u32(), minBid: r.u32() };
    case GuildCombatSub.REQUEST_STATUS: {
      const secondsToNext = r.i32(), prize = gcInt64(r.i64()), n = r.i32();
      const guildNames: string[] = [];
      for (let i = 0; i < n; i++) guildNames.push(str(r));
      return { type: t, sub: 'requestStatus', secondsToNext, prize, guildNames, ownBid: r.u32() };
    }
    case GuildCombatSub.SELECTPLAYER: {
      const maxJoin = r.i32(), maxWar = r.i32(), requestWar = bool(r);
      let window = false, defenderId = 0;
      const playerIds: number[] = [];
      if (requestWar) {
        window = bool(r);
        if (window) {
          defenderId = r.u32();
          const n = r.i32();
          for (let i = 0; i < n; i++) playerIds.push(r.u32());
        }
      }
      return { type: t, sub: 'selectPlayer', maxJoin, maxWar, requestWar, window, defenderId, playerIds };
    }
    case GuildCombatSub.SELECTWARPOS:
      return { type: t, sub: 'selectWarPos', map: r.i32(), seconds: r.i32() };
    case GuildCombatSub.BESTPLAYER:
      return { type: t, sub: 'bestPlayer', playerId: r.u32() };
    case GuildCombatSub.ISREQUEST:
      return { type: t, sub: 'isRequest', requested: bool(r) };
    case GuildCombatSub.USERSTATE:
      return { type: t, sub: 'userState', moverId: r.u32(), state: r.i32() };
    case GuildCombatSub.WARPLAYERLIST: {
      const count = r.i32();
      const guilds: Array<{ defenderId: number; members: Array<{ playerId: number; status: number }> }> = [];
      // fewer blocks than the count: the blocks present, up to the snapshot's end
      for (let g = 0; g < count && r.remaining() > 0; g++) {
        const defenderId = r.u32(), n = r.i32();
        const members: Array<{ playerId: number; status: number }> = [];
        for (let i = 0; i < n; i++) members.push({ playerId: r.u32(), status: r.i32() });
        guilds.push({ defenderId, members });
      }
      return { type: t, sub: 'warPlayerList', guilds };
    }
    case GuildCombatSub.GUILDSTATUS: {
      const joinIndex = r.i32(), n = r.i32();
      const players: Array<{ playerId: number; lives: number }> = [];
      for (let i = 0; i < n; i++) players.push({ playerId: r.u32(), lives: r.i32() });
      return { type: t, sub: 'guildStatus', joinIndex, players };
    }
    case GuildCombatSub.GUILDPRECEDENCE: {
      const n = r.i32();
      const guilds: Array<{ has: false } | { has: true; name: string; points: number }> = [];
      for (let i = 0; i < n; i++) guilds.push(bool(r) ? { has: true, name: str(r), points: r.i32() } : { has: false });
      return { type: t, sub: 'guildPrecedence', guilds };
    }
    case GuildCombatSub.PLAYERPRECEDENCE: {
      const count = r.i32();
      const guilds: Array<Array<{ playerId: number; points: number }>> = [];
      for (let g = 0; g < count && r.remaining() > 0; g++) {
        const n = r.i32();
        const players: Array<{ playerId: number; points: number }> = [];
        for (let i = 0; i < n; i++) players.push({ playerId: r.u32(), points: r.i32() });
        guilds.push(players);
      }
      return { type: t, sub: 'playerPrecedence', guilds };
    }
    case GuildCombatSub.GCSTATE:
      return { type: t, sub: 'gcState', state: r.i32(), warState: r.i32() };
    case GuildCombatSub.NEXTTIMESTATE:
      return { type: t, sub: 'nextTimeState', msLeft: r.u32(), nextState: r.u32() };
    case GuildCombatSub.ENTERTIME:
      return { type: t, sub: 'enterTime', msLeft: r.u32() };
    case GuildCombatSub.DIAGMESSAGE:
      return { type: t, sub: 'diagMessage', text: str(r) };
    case GuildCombatSub.TELE:
      return { type: t, sub: 'tele', text: str(r) };
    case GuildCombatSub.LOG: {
      const n = r.u32();
      const entries: GuildCombatLogEntry[] = [];
      for (let i = 0; i < n; i++) {
        entries.push({
          atkGuildId: r.u32(), defGuildId: r.u32(), atkPlayerId: r.u32(), defPlayerId: r.u32(), point: r.i32(),
          diffGuild: bool(r), master: bool(r), defender: bool(r), lastLife: bool(r),
        });
      }
      return { type: t, sub: 'log', entries };
    }
    case GuildCombatSub.LOG_REALTIME: {
      const atkGuildId = r.u32(), defGuildId = r.u32(), atkName = str(r), defName = str(r);
      const atkPlayerId = r.u32(), defPlayerId = r.u32(), point = r.i32();
      return {
        type: t, sub: 'logRealtime', atkGuildId, defGuildId, atkName, defName, atkPlayerId, defPlayerId, point,
        diffGuild: bool(r), master: bool(r), defender: bool(r), lastLife: bool(r),
      };
    }
    case GuildCombatSub.GETPENYAGUILD:
      return { type: t, sub: 'getPenyaGuild', result: r.i32(), penya: gcInt64(r.i64()) };
    case GuildCombatSub.GETPENYAPLAYER:
      return { type: t, sub: 'getPenyaPlayer', result: r.i32(), penya: gcInt64(r.i64()) };
    case GuildCombatSub.PLAYERPOINT: {
      const n = r.u32();
      const players: Array<{ playerId: number; job: number; point: number }> = [];
      for (let i = 0; i < n; i++) players.push({ playerId: r.u32(), job: r.i32(), point: r.i32() });
      return { type: t, sub: 'playerPoint', players };
    }
    default:
      // the rest of the body is the TOC-bounded snapshot's: drop it so the message still counts as read
      r.skipRest();
      return { type: t, sub: 'unknown', id };
  }
}

export const GUILD_COMBAT_READERS: ReadonlyArray<[number, (r: ArReader) => GuildCombatMessage]> = [
  [GuildCombatMessageType.GUILDCOMBAT, readGuildCombat],
];

// --- What the browser sends (`DPClient.cpp:9115-9205`) ---

/** `SendGuildCombatWindow`: the Apply menu. */
export const encodeGcWindow = (): Uint8Array => clientPacket(GuildCombatPacketType.IN).u8(GC_IN_WINDOW).toBytes();

/** `SendGuildCombatApp( dwPenya )`: the offer's OK. */
export const encodeGcApply = (penya: number): Uint8Array =>
  clientPacket(GuildCombatPacketType.IN).u8(GC_IN_APP).u32(penya).toBytes();

/** `SendGuildCombatCancel`: the cancel box's Yes. */
export const encodeGcCancel = (): Uint8Array => clientPacket(GuildCombatPacketType.OUT).toBytes();

/** `SendGCRequestStatusWindow`: the Status menu and its Refresh. */
export const encodeGcStatus = (): Uint8Array => clientPacket(GuildCombatPacketType.REQUEST_STATUS).toBytes();

/** `SendGCSelectPlayerWindow`: the Entry menu (BOOL TRUE). */
export const encodeGcLineupWindow = (): Uint8Array => clientPacket(GuildCombatPacketType.SELECTPLAYER).i32(1).toBytes();

/** `SendGCSelectPlayer( list, defender )`: BOOL FALSE, the defender, the count and the ids in order. */
export function encodeGcLineup(defenderId: number, playerIds: readonly number[]): Uint8Array {
  const w = clientPacket(GuildCombatPacketType.SELECTPLAYER).i32(0).u32(defenderId).i32(playerIds.length);
  for (const id of playerIds) w.u32(id);
  return w.toBytes();
}

/** `SendGCSelectMap( nMap )`: 0-3, or 99. */
export const encodeGcSelectMap = (map: number): Uint8Array =>
  clientPacket(GuildCombatPacketType.SELECTMAP).i32(map).toBytes();

/** `SendGCJoin`: the join box's Yes. */
export const encodeGcJoin = (): Uint8Array => clientPacket(GuildCombatPacketType.JOIN).toBytes();

/** `SendGCGetPenyaGuild`: the JACKPOT menu (the master). */
export const encodeGcPenyaGuild = (): Uint8Array => clientPacket(GuildCombatPacketType.GETPENYAGUILD).toBytes();

/** `SendGCGetPenyaPlayer`: the BESTPLAYER menu (no NPC has it). */
export const encodeGcPenyaPlayer = (): Uint8Array => clientPacket(GuildCombatPacketType.GETPENYAPLAYER).toBytes();

/** `SendGCTele`: the `GC_TELE` box's Yes. */
export const encodeGcTele = (): Uint8Array => clientPacket(GuildCombatPacketType.TELE).toBytes();

/** `SendGCPlayerPoint`: the Ranking menu. */
export const encodeGcPlayerPoint = (): Uint8Array => clientPacket(GuildCombatPacketType.PLAYERPOINT).toBytes();

/** For the pretend servers: a siege packet the client sent, after its type. */
export type GuildCombatRequestPacket =
  | { type: 'gcWindowRequest' }
  | { type: 'gcApplyRequest'; penya: number }
  | { type: 'gcCancelRequest' }
  | { type: 'gcStatusRequest' }
  | { type: 'gcLineupWindowRequest' }
  | { type: 'gcLineupRequest'; defenderId: number; playerIds: number[] }
  | { type: 'gcSelectMapRequest'; map: number }
  | { type: 'gcJoinRequest' }
  | { type: 'gcPenyaGuildRequest' }
  | { type: 'gcPenyaPlayerRequest' }
  | { type: 'gcTeleRequest' }
  | { type: 'gcPlayerPointRequest' };

export function readGuildCombatRequestPacket(packetType: number, r: ArReader): GuildCombatRequestPacket | null {
  switch (packetType) {
    case GuildCombatPacketType.IN: {
      const sub = r.u8();
      if (sub === GC_IN_WINDOW) return { type: 'gcWindowRequest' };
      if (sub === GC_IN_APP) return { type: 'gcApplyRequest', penya: r.u32() };
      throw new RangeError(`Invalid siege apply sub-type ${sub}.`);
    }
    case GuildCombatPacketType.OUT: return { type: 'gcCancelRequest' };
    case GuildCombatPacketType.REQUEST_STATUS: return { type: 'gcStatusRequest' };
    case GuildCombatPacketType.SELECTPLAYER: {
      if (bool(r)) return { type: 'gcLineupWindowRequest' };
      const defenderId = r.u32(), n = r.i32();
      const playerIds: number[] = [];
      for (let i = 0; i < n; i++) playerIds.push(r.u32());
      return { type: 'gcLineupRequest', defenderId, playerIds };
    }
    case GuildCombatPacketType.SELECTMAP: return { type: 'gcSelectMapRequest', map: r.i32() };
    case GuildCombatPacketType.JOIN: return { type: 'gcJoinRequest' };
    case GuildCombatPacketType.GETPENYAGUILD: return { type: 'gcPenyaGuildRequest' };
    case GuildCombatPacketType.GETPENYAPLAYER: return { type: 'gcPenyaPlayerRequest' };
    case GuildCombatPacketType.TELE: return { type: 'gcTeleRequest' };
    case GuildCombatPacketType.PLAYERPOINT: return { type: 'gcPlayerPointRequest' };
    default: return null;
  }
}
