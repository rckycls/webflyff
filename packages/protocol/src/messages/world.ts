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
 * The client's SNAPSHOT carrying one DESTPOS (`CDPClient::SendSnapshot`, `Neuz/DPClient.cpp:11187`, a click-to-move):
 * the object count (`BYTE`, here 1), the message type (`WORD` `SNAPSHOTTYPE_DESTPOS`), the position, and `fForward`
 * (`BYTE`). The messages have no object ID in front, unlike the server's bundles (`CDPSrvr::OnSnapshot` reads
 * them that way); `__IAOBJ0622` is off, so there is no `objidIAObj`.
 */
export function encodeDestPos(pos: Vec3, forward: boolean): Uint8Array {
  return clientPacket(PacketType.SNAPSHOT).u8(1).u16(MessageType.DESTPOS).vec3(pos).u8(forward ? 1 : 0).toBytes();
}

export type WorldPacket =
  | { type: 'join'; body: Uint8Array }
  | { type: 'snapshot'; body: Uint8Array }
  | { type: 'keepAlive' }
  | { type: 'error'; code: number }
  | { type: 'replace'; worldId: number }
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
 * A known type must use the whole body (JOIN and SNAPSHOT keep it whole); a type this does not know is reported,
 * not thrown.
 */
export function decodeWorldPacket(body: Uint8Array): WorldPacket {
  const r = new ArReader(body);
  const packetType = r.u32();
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
