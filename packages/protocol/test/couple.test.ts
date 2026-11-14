// 2026-11-15 (social): the couple's packets (docs/2026-11-15-social-research.md §2):
//   CDPClient::SendRefuse / SendCouple / SendDecouple   Neuz/DPClient.cpp:18640-18653   header only
//   CCoupleHelper::OnCouple ... OnAddCoupleExperience  Neuz/couplehelper.cpp:30-111    0x9700-0x9705

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, CoupleMessageType, CouplePacket, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeCouple,
  encodeDecouple, encodeRefuse, isCoupleMessage, readBundle,
} from '../src';

describe('the couple packets', () => {
  it('the type numbers are MsgHdr.h\'s', () => {
    expect(Object.values(CouplePacket)).toEqual([0x8ffff000, 0x8ffff001, 0x8ffff002, 0x8ffff003]);
    expect(Object.values(CoupleMessageType)).toEqual([0x9700, 0x9701, 0x9703, 0x9704, 0x9705]);
  });

  it('REFUSE, COUPLE and DECOUPLE are their type alone', () => {
    for (const [bytes, type, decoded] of [
      [encodeRefuse(), 0x8ffff001, 'refuse'], [encodeCouple(), 0x8ffff002, 'coupleAccept'], [encodeDecouple(), 0x8ffff003, 'decouple'],
    ] as const) {
      const r = new ArReader(bytes);
      expect([r.u32(), r.u32()]).toEqual([NULL_ID, type]);
      r.expectEnd();
      expect(decodeWorldPacket(bytes)).toEqual({ type: decoded });
    }
  });

  it('the five snapshots are read in order, and the bundle goes on after them', () => {
    const name = (w: ArWriter, text: string): ArWriter => w.i32(text.length).bytes(new TextEncoder().encode(text));
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(6);
    w.u32(0x1234).u16(0x9700).i32(2880).u32(70002).u32(70001);
    name(w.u32(0x1234).u16(0x9701).u32(70002), 'Webby');
    name(w.u32(0x1234).u16(0x9703).u32(70002), 'Webby');
    w.u32(0x1234).u16(0x9704);
    w.u32(0x1234).u16(0x9705).i32(1);
    w.u32(0x1234).u16(0x00b4).i32(1).u32(0).i32(0); // SETCHEERPARAM after them
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    const values = result.messages.map((m) => m.value);
    expect(values).toEqual([
      { type: 'couple', exp: 2880, first: 70002, second: 70001 },
      { type: 'proposeResult', proposerId: 70002, name: 'Webby' },
      { type: 'coupleResult', partnerId: 70002, name: 'Webby' },
      { type: 'decoupleResult' },
      { type: 'addCoupleExperience', exp: 1 },
      { type: 'setCheerParam', points: 1, rest: 0, add: false },
    ]);
    expect(values.map((value) => isCoupleMessage(value))).toEqual([true, true, true, true, true, false]);
  });
});
