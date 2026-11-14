// 2026-11-14: the Motion window's packets (docs/2026-11-14-motion-window-research.md): what its motions send, and the cheer
// points the server keeps. The other motions are a PLAYERBEHAVIOR (messages/world.ts) or a chat line.
//
//   CDPClient::SendMotion       Neuz/DPClient.cpp:14155-14164   PACKETTYPE_MOTION: the OBJMSG (sit down, stand up)
//   CDPClient::SendCheering     DPClient.cpp:15664-15669        PACKETTYPE_CHEERING: the cheered player's object ID
//   CDPClient::SendDoEscape     DPClient.cpp:15635-15648        PACKETTYPE_DO_ESCAPE: the type alone
//   CDPClient::SendPropose      DPClient.cpp:18633-18638        PACKETTYPE_PROPOSE: the target's name
//   CDPClient::OnSetCheerParam  DPClient.cpp:15671-15687        SNAPSHOTTYPE_SETCHEERPARAM: int points, DWORD rest, BOOL add

import { PacketType } from '../constants';
import { ProtocolError } from '../errors';
import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

/**
 * PACKETTYPE_MOTION: `ar << dwMotion`, an `OBJMSG` (`OBJMSG_SITDOWN` 4, `OBJMSG_STANDUP` 5). `CDPSrvr::OnMotion`
 * (`WORLDSERVER/DPSrvr.cpp:2521-2547`) runs it on the player and sends MOTION to everyone around, or a MOTION error.
 */
export function encodeMotion(message: number): Uint8Array {
  if (!Number.isInteger(message) || message < 0 || message > 0xffffffff) throw new ProtocolError('Invalid motion message');
  return clientPacket(PacketType.MOTION).u32(message).toBytes();
}

/**
 * PACKETTYPE_CHEERING: `ar << objid`, the player cheered. `CDPSrvr::OnCheering` (`DPSrvr.cpp:4635-4690`) spends a point,
 * plays the motion and the effects, and gives the target the Cheer buff.
 */
export function encodeCheering(objectId: number): Uint8Array {
  if (!Number.isInteger(objectId) || objectId < 0 || objectId > 0xffffffff) throw new ProtocolError('Invalid cheer target');
  return clientPacket(PacketType.CHEERING).u32(objectId).toBytes();
}

/** PACKETTYPE_DO_ESCAPE, the type alone: `CDPSrvr::OnDoEscape` (`DPSrvr.cpp:4619-4633`) uses the escape blinkwing. */
export function encodeDoEscape(): Uint8Array {
  return clientPacket(PacketType.DO_ESCAPE).toBytes();
}

/** PACKETTYPE_PROPOSE: `ar.WriteString( pszTarget )`, the player proposed to (`CWndCoupleMessage`, `WndField.cpp:23090`). */
export function encodePropose(name: string): Uint8Array {
  if (name === '') throw new ProtocolError('Empty propose target');
  return clientPacket(PacketType.PROPOSE).string(name).toBytes();
}

/** SNAPSHOTTYPE_SETCHEERPARAM: the points left (0-3), the ms to the next point, and whether one was just given. */
export function readSetCheerParam(r: ArReader): MessageOf<'setCheerParam'> {
  const points = r.i32();
  const rest = r.u32();
  const add = r.i32() !== 0;
  return { type: 'setCheerParam', points, rest, add };
}
