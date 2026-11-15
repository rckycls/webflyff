// The guild house's packets (2026-11-15, side-session-notes housing-research/B-server.md §2.2, A-client.md §2), both ways.
// The reads copy Neuz's handlers, the writes its senders; the server's writers are `CUser::AddGuildHouse*`
// (`WORLDSERVER/User.cpp:8716-8792`).
//
//   snapshots  CDPClient::OnGuildHousePacket   Neuz/DPClient.cpp:19011-19022  GUILDHOUSE_PACKET 0x8810: int type, int index, the
//                                                                             furniture record
//              OnGuildHouseAllInfo             :19023-19032                   GUILDHOUSE_ALLINFO 0x8812: BOOL the furniture
//                                                                             channel (ENABLE_GUILD_INVENTORY), BOOL a house; with
//                                                                             one: DWORD guild, DWORD world, time_t upkeep left,
//                                                                             int n, n records (`SerializeAllInfo`, GuildHouse.cpp:
//                                                                             713-750)
//              OnGuildHouseRemove              :19033-19036                   GUILDHOUSE_REMOVE 0x8813: nothing
//              OnRestPoint                     :19037-19049                   GUILDHOUSE_RESTPOINT 0x8814: int, 0..1,000,000
//   senders    SendBuyGuildHouse / SendGuildHouseEnter / SendGuildHouseGoOut (:19007-19009, SendHdr: the type alone)
//              CGuildHouseBase::SendClientToWorld (GuildHouse.cpp:107-113): GUILDHOUSE_PACKET with int type, int index, record
//
// The furniture record (`GH_Fntr_Info::Serialize`, GuildHouse.cpp:50-67): DWORD item, BOOL placed, D3DXVECTOR3, float angle,
// OBJID, time_t (the seconds left: `tKeepTime - time_null()`, 0 for a timer not started); 32 bytes on our Win32 build.

import type { ArReader } from '../ar/ArReader';
import type { Vec3 } from '../constants';
import { clientPacket } from './packet';

/** The guild house's packet types, client to world (`Source/_Network/MsgHdr.h:808-814`). */
export const GuildHousePacket = {
  BUY: 0x88100001,
  PACKET: 0x88100003,
  ENTER: 0x88100006,
  GOOUT: 0x88100007,
} as const;

/** The guild house's snapshot types (`MsgHdr.h:1291-1294`). */
export const GuildHouseMessageType = {
  PACKET: 0x8810,
  ALLINFO: 0x8812,
  REMOVE: 0x8813,
  RESTPOINT: 0x8814,
} as const;

/** GUILDHOUSE_PACKET's kinds (`GUILDHOUSE_PCKTTYPE_*`, `_Common/GuildHouse.h:13-23`). */
export const GuildHousePacketType = {
  LISTUP: 0,
  LISTDROP: 1,
  SETUP: 2,
  REMOVE: 3,
  RESET: 4,
  REFRESH: 5,
  UPKEEP: 6,
  EXPIRED: 7,
} as const;

/** `WI_GUILDHOUSE_SMALL` .. `LARGE` (`Resource/defineWorld.h:67-69`): the guild houses' worlds, one layer per guild. */
export const WI_GUILDHOUSE_SMALL = 212;
export const WI_GUILDHOUSE_MIDDLE = 213;
export const WI_GUILDHOUSE_LARGE = 214;

/** `CWorld::IsWorldGuildHouse`: the three guild house worlds. */
export const isGuildHouseWorld = (worldId: number): boolean => worldId >= WI_GUILDHOUSE_SMALL && worldId <= WI_GUILDHOUSE_LARGE;

/** The guild house items' kinds (`Resource/defineItemkind.h:56-59, :204-210`). */
export const GuildHouseKind = {
  IK2_GUILDHOUSE_FURNITURE: 38,
  IK2_GUILDHOUSE_NPC: 39,
  IK2_GUILDHOUSE_PAPERING: 40,
  IK3_TELEPORTER: 140,
  IK3_REST: 141,
  IK3_DESK: 142,
  IK3_CHAIR: 143,
  IK3_CASE: 144,
  IK3_BATH: 145,
  IK3_DRAWER: 146,
} as const;

/** `MAX_REST_POINT` (`GuildHouse.h:35`): the rest gauge's full value. */
export const MAX_REST_POINT = 1_000_000;

/** One GH_Fntr_Info: a listed piece of guild furniture. */
export interface GuildFurniture {
  itemId: number;
  placed: boolean;
  pos: Vec3;
  /** Degrees. */
  angle: number;
  /** The placed control's object id (NULL_ID while not placed). */
  objectId: number;
  /** The seconds left when written, 0 for a timer not started (never placed). */
  secondsLeft: number;
}

/** The guild house as GUILDHOUSE_ALLINFO brings it. */
export interface GuildHouseInfo {
  guildId: number;
  worldId: number;
  /** The upkeep's seconds left, 0 when it ran out. */
  upkeepSecondsLeft: number;
  furniture: GuildFurniture[];
}

export type GuildHouseMessage =
  | { type: 'guildHousePacket'; packetType: number; index: number; furniture: GuildFurniture }
  /** `channel`: furniture may be placed on this channel (`ENABLE_GUILD_INVENTORY`); `house` null without one. */
  | { type: 'guildHouseAllInfo'; channel: boolean; house: GuildHouseInfo | null }
  | { type: 'guildHouseRemove' }
  | { type: 'guildHouseRestPoint'; restPoint: number };

/** `GH_Fntr_Info::Serialize`, the loading side. */
export function readGuildFurniture(r: ArReader): GuildFurniture {
  const itemId = r.u32(), placed = r.i32() !== 0;
  const pos = r.vec3();
  const angle = r.f32(), objectId = r.u32();
  return { itemId, placed, pos, angle, objectId, secondsLeft: r.i32() };
}

export function readGuildHousePacket(r: ArReader): GuildHouseMessage {
  const packetType = r.i32(), index = r.i32();
  return { type: 'guildHousePacket', packetType, index, furniture: readGuildFurniture(r) };
}

export function readGuildHouseAllInfo(r: ArReader): GuildHouseMessage {
  const channel = r.i32() !== 0;
  if (r.i32() === 0) return { type: 'guildHouseAllInfo', channel, house: null };
  const guildId = r.u32(), worldId = r.u32(), upkeepSecondsLeft = r.i32();
  const n = Math.max(0, r.i32());
  const furniture = Array.from({ length: n }, () => readGuildFurniture(r));
  return { type: 'guildHouseAllInfo', channel, house: { guildId, worldId, upkeepSecondsLeft, furniture } };
}

export const readGuildHouseRemove = (): GuildHouseMessage => ({ type: 'guildHouseRemove' });

export const readGuildHouseRestPoint = (r: ArReader): GuildHouseMessage => ({ type: 'guildHouseRestPoint', restPoint: r.i32() });

/** The snapshot readers of the guild house, for `WORLD_READERS`. */
export const GUILD_HOUSE_READERS: ReadonlyArray<[number, (r: ArReader) => GuildHouseMessage]> = [
  [GuildHouseMessageType.PACKET, readGuildHousePacket],
  [GuildHouseMessageType.ALLINFO, readGuildHouseAllInfo],
  [GuildHouseMessageType.REMOVE, readGuildHouseRemove],
  [GuildHouseMessageType.RESTPOINT, readGuildHouseRestPoint],
];

const GUILD_HOUSE_TYPES: ReadonlySet<string> = new Set(['guildHousePacket', 'guildHouseAllInfo', 'guildHouseRemove', 'guildHouseRestPoint']);

/** Whether a world message is one of the guild house's. */
export function isGuildHouseMessage(message: { type: string }): message is GuildHouseMessage {
  return GUILD_HOUSE_TYPES.has(message.type);
}

// --- the client's packets ---

/** `SendBuyGuildHouse()`: the type alone. */
export const encodeGuildHouseBuy = (): Uint8Array => clientPacket(GuildHousePacket.BUY).toBytes();
/** `SendGuildHouseEnter()`. */
export const encodeGuildHouseEnter = (): Uint8Array => clientPacket(GuildHousePacket.ENTER).toBytes();
/** `SendGuildHouseGoOut()`. */
export const encodeGuildHouseGoOut = (): Uint8Array => clientPacket(GuildHousePacket.GOOUT).toBytes();

/**
 * `SendClientToWorld( type, gfi, index )`: the kind, the list index (NULL_ID, -1, for the upkeep) and the record, whose
 * time is already the seconds to write (`tKeepTime - time_null()`, or 0).
 */
export const encodeGuildHousePacket = (packetType: number, index: number, f: GuildFurniture): Uint8Array =>
  clientPacket(GuildHousePacket.PACKET).i32(packetType).i32(index | 0).u32(f.itemId >>> 0).i32(f.placed ? 1 : 0).vec3(f.pos)
    .f32(f.angle).u32(f.objectId >>> 0).i32(Math.trunc(f.secondsLeft) | 0).toBytes();

/** For the pretend servers: a client packet of the guild house after its type. */
export type GuildHouseRequestPacket =
  | { type: 'guildHouseBuyRequest' }
  | { type: 'guildHouseEnterRequest' }
  | { type: 'guildHouseGoOutRequest' }
  | { type: 'guildHousePacketRequest'; packetType: number; index: number; furniture: GuildFurniture };

export function readGuildHouseRequestPacket(packetType: number, r: ArReader): GuildHouseRequestPacket | null {
  switch (packetType) {
    case GuildHousePacket.BUY: return { type: 'guildHouseBuyRequest' };
    case GuildHousePacket.ENTER: return { type: 'guildHouseEnterRequest' };
    case GuildHousePacket.GOOUT: return { type: 'guildHouseGoOutRequest' };
    case GuildHousePacket.PACKET: {
      const kind = r.i32(), index = r.i32();
      return { type: 'guildHousePacketRequest', packetType: kind, index, furniture: readGuildFurniture(r) };
    }
    default: return null;
  }
}
