// 2026-11-15: the beauty shop's answers as the world server writes them (docs/2026-11-15-beauty-shop-research.md §4):
// SNAPSHOTTYPE_SET_HAIR on the player (`CUserMng::AddSetHair`, WORLDSERVER/User.cpp:5440-5450: BYTE hair, r, g, b) and
// SNAPSHOTTYPE_CHANGEFACE on NULL_ID (`CUserMng::AddChangeFace`, User.cpp:5252-5259: u_long idPlayer, DWORD face).

import { ArWriter, MessageType, NULL_ID } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** SET_HAIR about the player `objectId`: its hair style (0-based) and colour bytes. */
export function writeSetHair(objectId: number, hair: number, r: number, g: number, b: number): ScriptMessage {
  return { objectId, type: MessageType.SET_HAIR, fields: new ArWriter().u8(hair).u8(r).u8(g).u8(b).toBytes() };
}

/** CHANGEFACE: the player `playerId`'s new face (0-based), on NULL_ID. */
export function writeChangeFace(playerId: number, face: number): ScriptMessage {
  return { objectId: NULL_ID, type: MessageType.CHANGEFACE, fields: new ArWriter().u32(playerId).u32(face).toBytes() };
}
