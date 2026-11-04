// The player data (Piece 7 M4, [R §4]): the name, job, level and log-in state the party windows read for a member out
// of view, kept by `CPlayerDataCenter` (`_Common/playerdata.cpp`):
//
//   CDPClient::OnQueryPlayerData   Neuz/DPClient.cpp:13576-13606   QUERY_PLAYER_DATA (snapshot): id, name, the record
//   CDPClient::OnUpdatePlayerData  DPClient.cpp:977-1003           UPDATE_PLAYER_DATA (direct, from the core): id, record
//   CDPClient::OnLogout            DPClient.cpp:1005-1024          LOGOUT (direct): id; `uLogin = 0`
//   sPlayerData                    _Common/playerdata.h:6-14       BYTE nJob, nLevel, nSex; int nVer; BYTE uLogin
//
// `sPlayerData` is written raw (`ar.Write( &data, sizeof(sPlayerData) )`) with the default packing (`targa.h`'s
// `#pragma pack(1)` is closed at its :34): job @0, level @1, sex @2, a pad byte, `nVer` @4, `uLogin` @8, 3 pad bytes.

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf, PlayerDataRecord } from './types';

/** `sizeof(sPlayerData)` on Win32. */
export const PLAYER_DATA_BYTES = 12;

export function readPlayerDataRecord(r: ArReader): PlayerDataRecord {
  const job = r.u8();
  const level = r.u8();
  const sex = r.u8();
  r.u8();
  const version = r.i32();
  const login = r.u8();
  r.u8(); r.u8(); r.u8();
  return { job, level, sex, version, login };
}

/** `ar >> idPlayer`, `ReadString( pd.szPlayer, MAX_PLAYER )`, the record. */
export function readQueryPlayerData(r: ArReader): MessageOf<'playerData'> {
  const playerId = r.u32();
  const name = r.string(42);
  return { type: 'playerData', playerId, name, data: readPlayerDataRecord(r) };
}

export function readUpdatePlayerData(r: ArReader): MessageOf<'updatePlayerData'> {
  const playerId = r.u32();
  return { type: 'updatePlayerData', playerId, data: readPlayerDataRecord(r) };
}

export const readPlayerLogout = (r: ArReader): MessageOf<'playerLogout'> => ({ type: 'playerLogout', playerId: r.u32() });

/** The core's BLOCK (`CDPCacheSrvr::SendBlock`, `CORESERVER/DPCacheSrvr.cpp:2267-2273`): `BYTE nGu`, the name (64). */
export function readBlock(r: ArReader): MessageOf<'block'> {
  const gu = r.u8();
  return { type: 'block', gu, name: r.string(64) };
}

/** `CDPClient::SendQueryPlayerData( idPlayer, nVer = 0 )` (`DPClient.cpp:13484-13489`): the id and the version known. */
export const encodeQueryPlayerData = (playerId: number, version = 0): Uint8Array =>
  clientPacket(PacketType.QUERY_PLAYER_DATA).u32(playerId).i32(version).toBytes();
