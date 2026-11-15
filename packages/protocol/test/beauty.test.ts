// The beauty shop's packets (2026-11-15, docs/2026-11-15-beauty-shop-research.md §4):
//   CDPClient::SendSetHair     Neuz/DPClient.cpp:14057-14083   PACKETTYPE_SET_HAIR 0x00ff00af: BYTE hair r g b, BOOL coupon
//   CDPClient::SendChangeFace  DPClient.cpp:2651-2672          PACKETTYPE_CHANGEFACE 0x00ff00ee: u_long, DWORD, int, BOOL
//   CUserMng::AddSetHair       WORLDSERVER/User.cpp:5440-5450  SNAPSHOTTYPE_SET_HAIR 0x0048 on the player: BYTE hair r g b
//   CUserMng::AddChangeFace    User.cpp:5252-5259              SNAPSHOTTYPE_CHANGEFACE 0x004d on NULL_ID: u_long, DWORD

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeChangeFace, encodeSetHair,
  readBundle,
} from '../src';

describe('the beauty shop packets', () => {
  it('the type numbers are MsgHdr.h\'s', () => {
    expect([PacketType.SET_HAIR, PacketType.CHANGEFACE]).toEqual([0x00ff00af, 0x00ff00ee]);
    expect([MessageType.SET_HAIR, MessageType.CHANGEFACE]).toEqual([0x0048, 0x004d]);
  });

  it('SET_HAIR is the style and the colour as bytes, then the coupon as a 4-byte BOOL', () => {
    const bytes = encodeSetHair(4, 200, 76, 254, true);
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32()]).toEqual([NULL_ID, 0x00ff00af]);
    expect([r.u8(), r.u8(), r.u8(), r.u8(), r.i32()]).toEqual([4, 200, 76, 254, 1]);
    r.expectEnd();
    expect(decodeWorldPacket(bytes)).toEqual({ type: 'setHairRequest', hair: 4, r: 200, g: 76, b: 254, useCoupon: true });
    expect(decodeWorldPacket(encodeSetHair(0, 0, 0, 0, false))).toMatchObject({ useCoupon: false });
  });

  it('CHANGEFACE is the player id, the face, the price and the coupon', () => {
    const bytes = encodeChangeFace(0x01020304, 7, 1_000_000, false);
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32()]).toEqual([NULL_ID, 0x00ff00ee]);
    expect([r.u32(), r.u32(), r.i32(), r.i32()]).toEqual([0x01020304, 7, 1_000_000, 0]);
    r.expectEnd();
    expect(decodeWorldPacket(bytes)).toEqual({ type: 'changeFaceRequest', playerId: 0x01020304, face: 7, cost: 1_000_000, useCoupon: false });
  });

  it('refuses what does not fit its field', () => {
    expect(() => encodeSetHair(256, 0, 0, 0, false)).toThrow(RangeError);
    expect(() => encodeSetHair(0, -1, 0, 0, false)).toThrow(RangeError);
    expect(() => encodeSetHair(0, 0, 1.5, 0, false)).toThrow(RangeError);
    expect(() => encodeChangeFace(-1, 0, 0, false)).toThrow(RangeError);
    expect(() => encodeChangeFace(1, 0, 2 ** 31, false)).toThrow(RangeError);
  });

  it('SET_HAIR and CHANGEFACE are read, and a bundle goes on after them', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(3);
    w.u32(0x1234).u16(MessageType.SET_HAIR).u8(2).u8(255).u8(128).u8(76);
    w.u32(NULL_ID).u16(MessageType.CHANGEFACE).u32(77).u32(9);
    w.u32(0x1234).u16(MessageType.SET_HAIR).u8(0).u8(1).u8(2).u8(3);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => [m.objectId, m.value])).toEqual([
      [0x1234, { type: 'setHair', hair: 2, r: 255, g: 128, b: 76 }],
      [NULL_ID, { type: 'changeFace', playerId: 77, face: 9 }],
      [0x1234, { type: 'setHair', hair: 0, r: 1, g: 2, b: 3 }],
    ]);
  });
});
