// The beauty shop's packets (2026-11-15, docs/2026-11-15-beauty-shop-research.md §4): the hair window's and the face
// window's OK, and the hair's answer. The face's answer, CHANGEFACE 0x004d, is read by itemWindows.ts.
//
//   CDPClient::SendSetHair     Neuz/DPClient.cpp:14057-14083   PACKETTYPE_SET_HAIR: BYTE hair, BYTE r, g, b, BOOL coupon
//   CDPClient::SendChangeFace  DPClient.cpp:2651-2672          PACKETTYPE_CHANGEFACE: u_long idPlayer, DWORD face, int cost,
//                                                              BOOL coupon
//   CDPClient::OnSetHair       DPClient.cpp:14085-14116        SNAPSHOTTYPE_SET_HAIR on the player: BYTE hair, r, g, b
//   CDPSrvr::OnSetHair         WORLDSERVER/DPSrvr.cpp:2608-2663
//   CDPSrvr::OnChangeFace      DPSrvr.cpp:2214-2263            the cost read is replaced by CHANGE_FACE_COST

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

function checkByte(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`invalid ${what}`);
}
function checkU32(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`invalid ${what}`);
}

/** The hair window's OK: the style (0-based, `m_dwSelectHairMesh - 1`), the colour's bytes, and whether a coupon pays. */
export function encodeSetHair(hair: number, r: number, g: number, b: number, useCoupon: boolean): Uint8Array {
  checkByte(hair, 'hair');
  checkByte(r, 'red');
  checkByte(g, 'green');
  checkByte(b, 'blue');
  return clientPacket(PacketType.SET_HAIR).u8(hair).u8(r).u8(g).u8(b).i32(useCoupon ? 1 : 0).toBytes();
}

/** The face window's OK: the own player id, the face (0-based, `m_nSelectedFace - 1`), the price, and the coupon. */
export function encodeChangeFace(playerId: number, face: number, cost: number, useCoupon: boolean): Uint8Array {
  checkU32(playerId, 'player');
  checkU32(face, 'face');
  if (!Number.isInteger(cost) || cost < -0x80000000 || cost > 0x7fffffff) throw new RangeError('invalid cost');
  return clientPacket(PacketType.CHANGEFACE).u32(playerId).u32(face).i32(cost).i32(useCoupon ? 1 : 0).toBytes();
}

/** SNAPSHOTTYPE_SET_HAIR 0x0048, on the player's object: its hair style (0-based) and colour bytes. */
export function readSetHair(r: ArReader): MessageOf<'setHair'> {
  const hair = r.u8(), red = r.u8(), green = r.u8(), blue = r.u8();
  return { type: 'setHair', hair, r: red, g: green, b: blue };
}
