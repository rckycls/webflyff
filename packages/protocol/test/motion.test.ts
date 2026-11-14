// 2026-11-14: the Motion window's packets (docs/2026-11-14-motion-window-research.md):
//   CDPClient::SendMotion        Neuz/DPClient.cpp:14155-14164   PACKETTYPE_MOTION 0x00ff0016: the OBJMSG
//   CDPClient::SendCheering      DPClient.cpp:15664-15669        PACKETTYPE_CHEERING 0xffffff7c: the object ID
//   CDPClient::SendDoEscape      DPClient.cpp:15635-15648        PACKETTYPE_DO_ESCAPE 0x20: the type alone
//   CDPClient::SendPropose       DPClient.cpp:18633-18638        PACKETTYPE_PROPOSE 0x8ffff000: the name
//   CDPClient::OnSetCheerParam   DPClient.cpp:15671-15687        SNAPSHOTTYPE_SETCHEERPARAM 0x00b4: int, DWORD, BOOL

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeCheering, encodeDoEscape,
  encodeMotion, encodePropose, readBundle,
} from '../src';

describe('the Motion window packets', () => {
  it('the type numbers are MsgHdr.h\'s', () => {
    expect([PacketType.MOTION, PacketType.CHEERING, PacketType.DO_ESCAPE, PacketType.PROPOSE])
      .toEqual([0x00ff0016, 0xffffff7c, 0x00000020, 0x8ffff000]);
    expect(MessageType.SETCHEERPARAM).toBe(0x00b4);
  });

  it('MOTION carries the OBJMSG as a DWORD (OBJMSG_SITDOWN 4)', () => {
    const r = new ArReader(encodeMotion(4));
    expect([r.u32(), r.u32(), r.u32()]).toEqual([NULL_ID, 0x00ff0016, 4]);
    r.expectEnd();
    expect(decodeWorldPacket(encodeMotion(5))).toEqual({ type: 'motionRequest', message: 5 });
  });

  it('CHEERING carries the object ID; DO_ESCAPE is the type alone; PROPOSE the name as a string', () => {
    expect(decodeWorldPacket(encodeCheering(0x1234))).toEqual({ type: 'cheering', objectId: 0x1234 });
    const escape = new ArReader(encodeDoEscape());
    expect([escape.u32(), escape.u32()]).toEqual([NULL_ID, 0x20]);
    escape.expectEnd();
    expect(decodeWorldPacket(encodeDoEscape())).toEqual({ type: 'doEscape' });
    const propose = new ArReader(encodePropose('Webby'));
    expect([propose.u32(), propose.u32(), propose.i32()]).toEqual([NULL_ID, 0x8ffff000, 5]);
    expect(decodeWorldPacket(encodePropose('Webby'))).toEqual({ type: 'propose', name: 'Webby' });
    expect(() => encodePropose('')).toThrow();
    expect(() => encodeMotion(-1)).toThrow();
  });

  it('SETCHEERPARAM is read (points, rest, add), and a bundle goes on after it', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2);
    w.u32(0x1234).u16(MessageType.SETCHEERPARAM).i32(2).u32(3_540_000).i32(1);
    w.u32(0x1234).u16(MessageType.SET_LOCAL_EVENT).i16(1).u8(1);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'setCheerParam', points: 2, rest: 3_540_000, add: true },
      { type: 'setLocalEvent', id: 1, state: 1 },
    ]);
  });
});
