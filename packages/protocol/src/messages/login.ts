import { ArReader } from '../ar/ArReader';
import { ArWriter } from '../ar/ArWriter';
import { DPID_UNKNOWN, PacketType, PROTOCOL_VERSION } from '../constants';

// A packet the client sends to the login server is built with `BEFORESENDSOLE( ar, type, DPID_UNKNOWN )`
// (`Source/_Network/Net/Include/dpmng.h`): the sender ID `DPID_UNKNOWN` first, then the type, then the fields.
function clientPacket(type: number): ArWriter {
  return new ArWriter().u32(DPID_UNKNOWN).u32(type);
}

/** QUERYTICKCOUNT (`CDPLoginClient::QueryTickCount`): the client's `timeGetTime()`, wrapped to 32 bits like the C++ DWORD. */
export function encodeQueryTickCount(timeMs: number): Uint8Array {
  return clientPacket(PacketType.QUERYTICKCOUNT).u32(timeMs >>> 0).toBytes();
}

/**
 * PING (`CDPLoginClient::Ping`): the client's `GetCurrentTime()` (`GetTickCount`), wrapped to 32 bits like the C++
 * DWORD. Neuz sends it every 10 s; the login server drops a connection that sent none for 90 s
 * (`CUserMng::DestroyAbnormalPlayer`).
 */
export function encodePing(timeMs: number): Uint8Array {
  return clientPacket(PacketType.PING).u32(timeMs >>> 0).toBytes();
}

/** GETPLAYERLIST (`CDPLoginClient::SendGetPlayerList`): asks for the account's characters on one channel. */
export function encodeGetPlayerList(authKey: number, account: string, passwordHash: string, channelId: number): Uint8Array {
  return clientPacket(PacketType.GETPLAYERLIST).string(PROTOCOL_VERSION).u32(authKey).string(account)
    .string(passwordHash).u32(channelId).toBytes();
}

/** What `CDPLoginClient::SendCreatePlayer` sends about a new character. All fields are single bytes on the wire except `hairColor` (unsigned 32-bit) and `bankPin` (signed 32-bit). */
export interface NewCharacter {
  slot: number;
  name: string;
  face: number;
  costume: number;
  skinSet: number;
  hairMesh: number;
  hairColor: number;
  sex: number;
  job: number;
  headMesh: number;
  /** The 4-digit Bank PIN (`__2ND_PASSWORD_SYSTEM`), sent as a signed 32-bit number. */
  bankPin: number;
}

/** CREATE_PLAYER (`CDPLoginClient::SendCreatePlayer`, `__VER >= 15`). */
export function encodeCreatePlayer(account: string, passwordHash: string, c: NewCharacter, authKey: number): Uint8Array {
  return clientPacket(PacketType.CREATE_PLAYER).string(account).string(passwordHash).u8(c.slot).string(c.name)
    .u8(c.face).u8(c.costume).u8(c.skinSet).u8(c.hairMesh).u32(c.hairColor)
    .u8(c.sex).u8(c.job).u8(c.headMesh).i32(c.bankPin).u32(authKey).toBytes();
}

/**
 * DEL_PLAYER (`CDPLoginClient::SendDeletePlayer`, `__RT_1025`): `key` is `deleteKey(bankPin)`, `friendIds` are the
 * messenger friends of the slot being deleted (the server cleans up their lists), written after their count.
 */
export function encodeDeletePlayer(
  account: string, passwordHash: string, key: string, playerId: number, authKey: number, friendIds: number[],
): Uint8Array {
  const w = clientPacket(PacketType.DEL_PLAYER).string(account).string(passwordHash).string(key)
    .u32(playerId).u32(authKey).u32(friendIds.length);
  for (const id of friendIds) w.u32(id);
  return w.toBytes();
}

/**
 * PRE_JOIN (`CDPLoginClient::SendPreJoin`, `Neuz/DPLoginClient.cpp:187`, `__2ND_PASSWORD_SYSTEM`): the account, the
 * character's ID and name, then the "secret number" (`nSecretNum`, an `int`; the browser always sends 0). The slot
 * argument of the C++ function is kept by the client and is not sent.
 */
export function encodePreJoin(account: string, playerId: number, name: string): Uint8Array {
  return clientPacket(PacketType.PRE_JOIN).string(account).u32(playerId).string(name).i32(0).toBytes();
}

/** One entry of PLAYER_LIST, in the order `CDPLoginClient::OnPlayerList` reads it. */
export interface CharacterSummary {
  slot: number;
  blocked: number;
  worldId: number;
  index: number;
  name: string;
  position: [number, number, number];
  playerId: number;
  partyId: number;
  guildId: number;
  warId: number;
  skinSet: number;
  hairMesh: number;
  hairColor: number;
  headMesh: number;
  sex: number;
  job: number;
  level: number;
  jobLevel: number;
  str: number;
  sta: number;
  dex: number;
  int: number;
  mode: number;
  /** Item IDs of the equipped items, in the order sent. */
  equipment: number[];
}

/** The messenger of one slot (`CRTMessenger::Serialize`): its state and its friends. */
export interface SlotMessenger {
  slot: number;
  state: number;
  friends: { id: number; blocked: number; state: number }[];
}

export type LoginMessage =
  | { type: 'playerList'; authKey: number; characters: CharacterSummary[]; messengers: SlotMessenger[] }
  | { type: 'error'; code: number }
  | { type: 'cacheAddr'; address: string }
  | { type: 'queryTickCount'; sentAt: number; tickCount: bigint }
  | { type: 'ping'; sentAt: number }
  | { type: 'oneHourNotify' }
  | { type: 'preJoin' }
  | { type: 'loginNumPad'; numPadId: number }
  | { type: 'loginProtect'; ok: boolean; numPadId: number }
  | { type: 'unknown'; packetType: number };

// Buffer sizes of the C++ fields: `MAX_NAME` (`Mover.h`) and `g_Neuz.m_lpCacheAddr` (`OnCacheAddr` reads 16).
const NAME_BUFFER = 64;
const CACHE_ADDRESS_BUFFER = 16;

function readCharacter(r: ArReader): CharacterSummary {
  const slot = r.i32();
  const blocked = r.i32();
  const worldId = r.u32();
  const index = r.u32();
  const name = r.string(NAME_BUFFER);
  const position = r.vec3();
  const playerId = r.u32();
  const partyId = r.u32();
  const guildId = r.u32();
  const warId = r.u32();
  const skinSet = r.u32();
  const hairMesh = r.u32();
  const hairColor = r.u32();
  const headMesh = r.u32();
  const sex = r.u8();
  const job = r.i32();
  const level = r.i32();
  const jobLevel = r.u32();
  const str = r.i32();
  const sta = r.i32();
  const dex = r.i32();
  const int = r.i32();
  const mode = r.u32();
  const equipCount = r.i32();
  const equipment: number[] = [];
  for (let i = 0; i < equipCount; i++) equipment.push(r.u32());
  return {
    slot, blocked, worldId, index, name, position, playerId, partyId, guildId, warId, skinSet, hairMesh, hairColor,
    headMesh, sex, job, level, jobLevel, str, sta, dex, int, mode, equipment,
  };
}

function readMessenger(r: ArReader): SlotMessenger {
  const slot = r.u8();
  const state = r.u32();
  const friendCount = r.i32();
  const friends: SlotMessenger['friends'] = [];
  for (let i = 0; i < friendCount; i++) friends.push({ id: r.u32(), blocked: r.i32(), state: r.u32() });
  return { slot, state, friends };
}

function readPlayerList(r: ArReader): LoginMessage {
  const authKey = r.u32();
  const count = r.i32();
  // No up-front allocation from a count: a body that lies about it runs out of bytes and throws on the way.
  const characters: CharacterSummary[] = [];
  for (let i = 0; i < count; i++) characters.push(readCharacter(r));
  const messengerCount = r.i32();
  const messengers: SlotMessenger[] = [];
  for (let i = 0; i < messengerCount; i++) messengers.push(readMessenger(r));
  r.expectEnd();
  return { type: 'playerList', authKey, characters, messengers };
}

/**
 * Decodes a body received on the login port (the server's replies start with the type, with no `DPID_UNKNOWN` in
 * front). A known type must use the whole body; a type this does not know is reported, not thrown.
 */
export function decodeLoginMessage(body: Uint8Array): LoginMessage {
  const r = new ArReader(body);
  const packetType = r.u32();
  switch (packetType) {
    case PacketType.PLAYER_LIST:
      return readPlayerList(r);
    case PacketType.ERROR: {
      const code = r.i32();
      r.expectEnd();
      return { type: 'error', code };
    }
    case PacketType.CACHE_ADDR: {
      const address = r.string(CACHE_ADDRESS_BUFFER);
      r.expectEnd();
      return { type: 'cacheAddr', address };
    }
    case PacketType.QUERYTICKCOUNT: {
      const sentAt = r.u32();
      const tickCount = r.i64();
      r.expectEnd();
      return { type: 'queryTickCount', sentAt, tickCount };
    }
    case PacketType.PING: {
      const sentAt = r.u32();
      r.expectEnd();
      return { type: 'ping', sentAt };
    }
    case PacketType.ONE_HOUR_NOTIFY:
      r.expectEnd();
      return { type: 'oneHourNotify' };
    case PacketType.PRE_JOIN:
      // CDPLoginClient::OnPreJoin (Neuz/DPLoginClient.cpp:204) reads nothing: the answer is the bare type.
      r.expectEnd();
      return { type: 'preJoin' };
    case PacketType.LOGIN_PROTECT_NUMPAD: {
      const numPadId = r.u32();
      r.expectEnd();
      return { type: 'loginNumPad', numPadId };
    }
    case PacketType.LOGIN_PROTECT_CERT: {
      const ok = r.i32() !== 0;
      const numPadId = r.u32();
      r.expectEnd();
      return { type: 'loginProtect', ok, numPadId };
    }
    default:
      return { type: 'unknown', packetType };
  }
}
