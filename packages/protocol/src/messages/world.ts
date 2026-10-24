import { ArReader } from '../ar/ArReader';
import { ArWriter } from '../ar/ArWriter';
import { DPID_UNKNOWN, MessageType, PacketType } from '../constants';
import type { Vec3 } from '../constants';
import type { SlotMessenger } from './login';

// A packet the client sends to the cache server is built with `BEFORESENDSOLE( ar, type, DPID_UNKNOWN )`
// (`Source/_Network/Net/Include/dpmng.h`), like the login packets: the sender ID `DPID_UNKNOWN` first, then the
// type, then the fields.
function clientPacket(type: number): ArWriter {
  return new ArWriter().u32(DPID_UNKNOWN).u32(type);
}

/** What `CDPClient::SendJoin` sends: the character that enters the world, and the account that owns it. */
export interface JoinRequest {
  worldId: number;
  playerId: number;
  authKey: number;
  partyId: number;
  guildId: number;
  warId: number;
  /** `uIdofMulti` in the C++: the channel the character logged in on. */
  channelId: number;
  slot: number;
  name: string;
  account: string;
  /** `g_Neuz.m_szPassword`: the hashed password, as CERTIFY and GETPLAYERLIST carry it. */
  passwordHash: string;
  /** The slot's messenger as PLAYER_LIST gave it; `undefined` writes the empty `CRTMessenger`. */
  messenger: SlotMessenger | undefined;
}

/**
 * JOIN (`CDPClient::SendJoin`, `Neuz/DPClient.cpp:9089`, `__RT_1025`): world ID, player ID, auth key, party, guild
 * and war IDs, channel ID (all `u32`), the slot (`BYTE`), the name, the account and the password hash as strings,
 * then `CRTMessenger::Serialize` (`_Common/rtmessenger.cpp:36`, storing): the state (`DWORD`), the friend count
 * (`int`), and per friend its ID (`u_long`) and the 8 bytes of a `Friend` (`BOOL bBlock`, `DWORD dwState`). The
 * `slot` of the messenger is not written: `SendJoin` takes the messenger of that slot, and the slot goes in the
 * packet once, as the `BYTE` above. The `__GPAUTH_01` branch only picks which account text goes in.
 */
export function encodeJoin(j: JoinRequest): Uint8Array {
  const w = clientPacket(PacketType.JOIN).u32(j.worldId).u32(j.playerId).u32(j.authKey).u32(j.partyId).u32(j.guildId)
    .u32(j.warId).u32(j.channelId).u8(j.slot).string(j.name).string(j.account).string(j.passwordHash);
  const friends = j.messenger?.friends ?? [];
  w.u32(j.messenger?.state ?? 0).i32(friends.length);
  for (const f of friends) w.u32(f.id).i32(f.blocked).u32(f.state);
  return w.toBytes();
}

/**
 * KEEP_ALIVE (`CDPClient::OnKeepAlive`, `Neuz/DPClient.cpp:961`): the cache server's KEEP_ALIVE is answered with
 * `BEFORESENDSOLE( ar2, PACKETTYPE_KEEP_ALIVE, DPID_UNKNOWN )` and no fields.
 */
export function encodeWorldKeepAlive(): Uint8Array {
  return clientPacket(PacketType.KEEP_ALIVE).toBytes();
}

/**
 * The fields of PLAYERMOVED and PLAYERBEHAVIOR, in the order `CDPClient::SendPlayerMoved` (`Neuz/DPClient.cpp:10081`)
 * and `CDPClient::SendPlayerBehavior` (:10113) write them. Positions are in D3D coordinates and the angle in FlyFF
 * degrees, as the C++ holds them.
 */
export interface MoveReport {
  /** `v`: for PLAYERMOVED the position `PresupposePos` predicts `MAX_CORR_SIZE_45` steps ahead, for PLAYERBEHAVIOR `GetPos()`. */
  pos: Vec3;
  /** `vd`: the movement per step (`PresupposePos`'s `vd` for PLAYERMOVED, `m_vDelta` for PLAYERBEHAVIOR). */
  delta: Vec3;
  /** `f`: the angle in degrees (`PresupposePos`'s `f` for PLAYERMOVED, `GetAngle()` for PLAYERBEHAVIOR). */
  angle: number;
  /** `m_pActMover->GetState()` (`DWORD`). */
  state: number;
  /** `m_pActMover->GetStateFlag()` (`DWORD`). */
  stateFlag: number;
  /** `m_dwMotion` (`DWORD`). */
  motion: number;
  /** `m_pActMover->m_nMotionEx` (`int`). */
  motionEx: number;
  /** `m_pModel->m_nLoop` (`int`). */
  loop: number;
  /** `m_dwMotionOption` (`DWORD`). */
  motionOption: number;
  /** `g_TickCount.GetTickCount()` (`__int64`): the clock `tickcount.h` keeps, in 100 ns units. */
  tick: bigint;
}

function moveReport(type: number, m: MoveReport): Uint8Array {
  return clientPacket(type).vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state).u32(m.stateFlag).u32(m.motion)
    .i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick).toBytes();
}

/** PLAYERMOVED (`CDPClient::SendPlayerMoved`, `Neuz/DPClient.cpp:10081`). */
export function encodePlayerMoved(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERMOVED, m);
}

/** PLAYERBEHAVIOR (`CDPClient::SendPlayerBehavior`, `Neuz/DPClient.cpp:10113`). */
export function encodePlayerBehavior(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERBEHAVIOR, m);
}

/**
 * PLAYERCORR (`CDPClient::SendPlayerCorr`, `Neuz/DPClient.cpp:10866-10895`): PLAYERBEHAVIOR's fields (`GetPos()`,
 * `m_vDelta`, `GetAngle()`, the state...) in its order, which `CDPSrvr::OnPlayerCorr` (`WORLDSERVER/DPSrvr.cpp:12872`)
 * reads.
 */
export function encodePlayerCorr(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERCORR, m);
}

/**
 * The client's SNAPSHOT carrying one DESTPOS (`CDPClient::SendSnapshot`, `Neuz/DPClient.cpp:11187`, a click-to-move):
 * the object count (`BYTE`, here 1), the message type (`WORD` `SNAPSHOTTYPE_DESTPOS`), the position, and `fForward`
 * (`BYTE`). The messages have no object ID in front, unlike the server's bundles (`CDPSrvr::OnSnapshot` reads
 * them that way); `__IAOBJ0622` is off, so there is no `objidIAObj`.
 */
export function encodeDestPos(pos: Vec3, forward: boolean): Uint8Array {
  return clientPacket(PacketType.SNAPSHOT).u8(1).u16(MessageType.DESTPOS).vec3(pos).u8(forward ? 1 : 0).toBytes();
}

/**
 * SETTARGET (`CDPClient::SendSetTarget`, `Neuz/DPClient.cpp:9886`): the target's object ID (`OBJID`), then `bClear`
 * (`BYTE`), the order `CDPSrvr::OnSetTarget` (`WORLDSERVER/DPSrvr.cpp:2183`) reads them in. 1 releases the target (the
 * server clears the target's `m_idTargeter` if this player set it); 2 makes the target the player's focus
 * (`m_idSetTarget`), and with `NULL_ID` it clears the focus.
 */
export function encodeSetTarget(targetId: number, clear: 1 | 2): Uint8Array {
  return clientPacket(PacketType.SETTARGET).u32(targetId).u8(clear).toBytes();
}

/**
 * PLAYERSETDESTOBJ (`CDPClient::SendPlayerDestObj`, `Neuz/DPClient.cpp:10923`): the object to walk to (`OBJID`),
 * then the range to stop at (`float`), as `CDPSrvr::OnPlayerSetDestObj` (`WORLDSERVER/DPSrvr.cpp:12794`) reads them.
 */
export function encodePlayerSetDestObj(targetId: number, range: number): Uint8Array {
  return clientPacket(PacketType.PLAYERSETDESTOBJ).u32(targetId).f32(range).toBytes();
}

/** `nParam2` of a melee swing: `MAKELONG( 0, 0 )` (`CMover::DoAttackMelee`, `_Common/MoverSkill.cpp:3464`). */
const MELEE_PARAM2 = 0;
/**
 * `nParam3` of a melee swing: `MAKELONG( 0, (WORD)nError )` (`_Common/MoverSkill.cpp:3464`), where `nError` is what
 * `SendActMsg` returned, `m_dwAtkFlags` = `AF_GENERIC` (1) on the client (`CActionMover::ProcessActMsg1`,
 * `_AIInterface/ActionMoverMsg.cpp:699-702`, as the client does not roll a hit): `0x00010000`.
 */
const MELEE_PARAM3 = 0x00010000;

/**
 * MELEE_ATTACK (`CDPClient::SendMeleeAttack`, `Neuz/DPClient.cpp:9819`, with `__HACK_1023` on: `Neuz/VersionCommon.h:93`,
 * `WORLDSERVER/VersionCommon.h:102`): the attack message (`OBJMSG`, an `int` on the wire), the target (`OBJID`),
 * `nParam2` and `nParam3` (`int`), then `fVal` (`FLOAT`), in the order `CDPSrvr::OnMeleeAttack`
 * (`WORLDSERVER/DPSrvr.cpp:2019`) reads them. The server compares `fVal` with the held item's `fAttackSpeed` and
 * refuses the swing on any difference (`TID_GAME_MODIFY_ATTACK_SPEED`), so `attackSpeed` is that table value as it
 * is, written as an `f32`.
 */
export function encodeMeleeAttack(message: number, targetId: number, attackSpeed: number): Uint8Array {
  return clientPacket(PacketType.MELEE_ATTACK).u32(message).u32(targetId).i32(MELEE_PARAM2).i32(MELEE_PARAM3)
    .f32(attackSpeed).toBytes();
}

/**
 * GETDESTOBJ (`CDPClient::SendGetDestObj`, `Neuz/DPClient.cpp:10941`): the answer to the server's QUERYGETDESTOBJ.
 * `fromId` is the object ID that message named (`OnQueryGetDestObj`, :8985, reads it as `objid`), `destId` the
 * player's own destination (`g_pPlayer->GetDestId()`); `CDPSrvr::OnGetDestObj` (`WORLDSERVER/DPSrvr.cpp:11604`)
 * reads the two in that order and uses only the second.
 */
export function encodeGetDestObj(fromId: number, destId: number): Uint8Array {
  return clientPacket(PacketType.GETDESTOBJ).u32(fromId).u32(destId).toBytes();
}

/**
 * REVIVAL_TO_LODESTAR (`CDPClient::SendHdr( PACKETTYPE_REVIVAL_TO_LODESTAR )`, `Neuz/DPClient.cpp:11253`, called from
 * :2054 and :2058): a type and no fields; `CDPSrvr::OnRevivalLodestar` (`WORLDSERVER/DPSrvr.cpp:11296`) reads none.
 */
export function encodeRevivalToLodestar(): Uint8Array {
  return clientPacket(PacketType.REVIVAL_TO_LODESTAR).toBytes();
}

/**
 * MODIFY_STATUS (`CDPClient::SendModifyStatus`, `Neuz/DPClient.cpp:16652`): the points to add to STR, STA, DEX and
 * INT (`int` each), the order `CDPSrvr::OnModifyStatus` (`WORLDSERVER/DPSrvr.cpp:8341`) reads them in. The server
 * ignores a request with a negative count, no points at all, or more points than the player has.
 */
export function encodeModifyStatus(counts: { str: number; sta: number; dex: number; int: number }): Uint8Array {
  return clientPacket(PacketType.MODIFY_STATUS).i32(counts.str).i32(counts.sta).i32(counts.dex).i32(counts.int).toBytes();
}

export type WorldPacket =
  | { type: 'join'; body: Uint8Array }
  | { type: 'snapshot'; body: Uint8Array }
  | { type: 'keepAlive' }
  | { type: 'error'; code: number }
  | { type: 'replace'; worldId: number }
  // The packets the browser sends, read for the pretend servers (`DPID_UNKNOWN` first): the fields of the encoders.
  | { type: 'setTarget'; targetId: number; clear: number }
  | { type: 'playerSetDestObj'; targetId: number; range: number }
  | { type: 'meleeAttack'; message: number; targetId: number; param2: number; param3: number; attackSpeed: number }
  | { type: 'getDestObj'; fromId: number; destId: number }
  | { type: 'revivalToLodestar' }
  | { type: 'modifyStatus'; str: number; sta: number; dex: number; int: number }
  | { type: 'unknown'; packetType: number };

/**
 * Decodes a body received on the cache (game) port; the server's bodies start with their type. This is the part of
 * `CDPClient`'s `ON_MSG` table (`Neuz/DPClient.cpp:159`) the browser handles:
 * - JOIN (`OnJoin`, :897) and SNAPSHOT (`OnSnapshot`, :366) are bundles; `body` is the whole received body, type
 *   first, for the bundle reader.
 * - KEEP_ALIVE (`OnKeepAlive`, :961) reads nothing.
 * - ERROR (`OnError`, :1033) reads the error code (`long`).
 * - REPLACE (`OnReplace`, :2297) reads the world ID (`DWORD`) and the position (`D3DXVECTOR3`); the position is
 *   read to check the body and dropped, as the browser only reports the world it is asked to go to.
 * A body that starts with `DPID_UNKNOWN` is one the browser sent (`BEFORESENDSOLE`), which the pretend servers read:
 * the type follows, then the fields of the matching `encode*` (`decodeClientPacket`). No packet type of `MsgHdr.h` is
 * `0xffffffff`, so a server body is never mistaken for one.
 * A known type must use the whole body (JOIN and SNAPSHOT keep it whole); a type this does not know is reported,
 * not thrown.
 */
export function decodeWorldPacket(body: Uint8Array): WorldPacket {
  const r = new ArReader(body);
  const packetType = r.u32();
  if (packetType === DPID_UNKNOWN) return decodeClientPacket(r);
  switch (packetType) {
    case PacketType.JOIN:
      return { type: 'join', body };
    case PacketType.SNAPSHOT:
      return { type: 'snapshot', body };
    case PacketType.KEEP_ALIVE:
      r.expectEnd();
      return { type: 'keepAlive' };
    case PacketType.ERROR: {
      const code = r.i32();
      r.expectEnd();
      return { type: 'error', code };
    }
    case PacketType.REPLACE: {
      const worldId = r.u32();
      r.vec3();
      r.expectEnd();
      return { type: 'replace', worldId };
    }
    default:
      return { type: 'unknown', packetType };
  }
}

/**
 * The fight packets after their `DPID_UNKNOWN`, read in the order the matching `encode*` writes them (and the world
 * server reads them). Any other type is reported with its fields unread: the pretend servers only look at these.
 */
function decodeClientPacket(r: ArReader): WorldPacket {
  const packetType = r.u32();
  switch (packetType) {
    case PacketType.SETTARGET: {
      const targetId = r.u32();
      const clear = r.u8();
      r.expectEnd();
      return { type: 'setTarget', targetId, clear };
    }
    case PacketType.PLAYERSETDESTOBJ: {
      const targetId = r.u32();
      const range = r.f32();
      r.expectEnd();
      return { type: 'playerSetDestObj', targetId, range };
    }
    case PacketType.MELEE_ATTACK: {
      const message = r.u32();
      const targetId = r.u32();
      const param2 = r.i32();
      const param3 = r.i32();
      const attackSpeed = r.f32();
      r.expectEnd();
      return { type: 'meleeAttack', message, targetId, param2, param3, attackSpeed };
    }
    case PacketType.GETDESTOBJ: {
      const fromId = r.u32();
      const destId = r.u32();
      r.expectEnd();
      return { type: 'getDestObj', fromId, destId };
    }
    case PacketType.REVIVAL_TO_LODESTAR:
      r.expectEnd();
      return { type: 'revivalToLodestar' };
    case PacketType.MODIFY_STATUS: {
      const str = r.i32();
      const sta = r.i32();
      const dex = r.i32();
      const int = r.i32();
      r.expectEnd();
      return { type: 'modifyStatus', str, sta, dex, int };
    }
    default:
      return { type: 'unknown', packetType };
  }
}
