// 2026-11-10: the Arena (`__JEFF_11_4`) and the Forsaken Tower (`__VER >= 12 // __HEAVEN_TOWER`): what the client sends.
// No new message comes back: both answers are the ordinary REPLACE (world/place.ts), and the tower's refusal for lack of
// penya is a DEFINEDTEXT (`TID_GAME_LACKMONEY`, `CDPSrvr::OnTeleportToHeavenTower`, `WORLDSERVER/DPSrvr.cpp:9554-9558`).

import { PacketType } from '../constants';
import { ProtocolError } from '../errors';
import { clientPacket } from './packet';

/**
 * "Enter Arena" (`MMI_ARENA_ENTER`): `g_DPlay.SendHdr( PACKETTYPE_ARENA_ENTER )` (`_Interface/WndWorld.cpp:5928-5930`), the
 * type alone. `CDPSrvr::OnArenaEnter` (`WORLDSERVER/DPSrvr.cpp:9143-9154`) drops it for a base-job player and otherwise
 * marks where the player stands and sends them to `WI_WORLD_ARENA` at (540, 140, 485).
 */
export function encodeArenaEnter(): Uint8Array {
  return clientPacket(PacketType.ARENA_ENTER).toBytes();
}

/**
 * "Leave Arena" (`MMI_ARENA_EXIT`): `SendHdr( PACKETTYPE_ARENA_EXIT )` (`WndWorld.cpp:5931-5933`), the type alone.
 * `CDPSrvr::OnArenaExit` (`DPSrvr.cpp:9156-9161`) sends the player back to the place `OnArenaEnter` marked.
 */
export function encodeArenaExit(): Uint8Array {
  return clientPacket(PacketType.ARENA_EXIT).toBytes();
}

/** The floors the tower window sends (`CWndHeavenTowerEntranceConfirm::OnChildNotify`, `WndField.cpp:21851-21856`). */
const FIRST_FLOOR = 1;
const LAST_FLOOR = 5;

/**
 * The Forsaken Tower's OK: `CDPClient::SendTeleportToHeavenTower( nFloor )` (`Neuz/DPClient.cpp:17828-17835`), the floor
 * (1-5) as an `int`. `CDPSrvr::OnTeleportToHeavenTower` (`DPSrvr.cpp:9509-9575`) drops it away from the tower's NPC or for
 * another floor, answers `TID_GAME_LACKMONEY` without the fee, and otherwise takes the fee and sends the player there.
 */
export function encodeHeavenTowerTeleport(floor: number): Uint8Array {
  if (!Number.isInteger(floor) || floor < FIRST_FLOOR || floor > LAST_FLOOR) throw new ProtocolError('Invalid Forsaken Tower floor');
  return clientPacket(PacketType.HEAVENTOWER_TELEPORT).i32(floor).toBytes();
}
