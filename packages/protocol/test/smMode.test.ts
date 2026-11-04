// The premium timers (2026-11-05): SM_MODE (`CUser::AddSMMode`, `WORLDSERVER/User.cpp:2090-2125`; `CDPClient::OnSMMode`,
// `Neuz/DPClient.cpp:5884-5965`) and, at join, SM_MODE_ALL (`AddSMModeAll`, User.cpp:2127-2163; `OnSMModeAll`).

import { describe, expect, it } from 'vitest';
import { ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';

describe('SM_MODE and SM_MODE_ALL', () => {
  it('reads each, about NULL_ID, and a bundle with both goes on after them', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(3);
    w.u32(NULL_ID).u16(MessageType.SM_MODE_ALL).i16(2).i32(4).u32(1_296_000).i32(20).u32(1);
    w.u32(NULL_ID).u16(MessageType.SM_MODE).i32(8).u32(900);
    w.u32(0x1234).u16(MessageType.SETSKILLSTATE).u32(0x1234).u16(0).u16(26205).u32(0).u32(3_600_000);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'smModeAll', modes: [{ type: 4, seconds: 1_296_000 }, { type: 20, seconds: 1 }] },
      { type: 'smMode', smType: 8, seconds: 900 },
      { type: 'setSkillState', targetId: 0x1234, buffType: 0, id: 26205, level: 0, time: 3_600_000 },
    ]);
    expect([MessageType.SM_MODE_ALL, MessageType.SM_MODE]).toEqual([0x003e, 0x003f]);
  });
});

describe('RESISTSMMODE (2026-11-05: the element stones, CUser::AddResistSMMode, User.cpp:2166-2177)', () => {
  it('reads the left and right weapons\' and the defence\'s elements, 0xff for none', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(1);
    w.u32(NULL_ID).u16(MessageType.RESISTSMMODE).u8(1).u8(0xff).u8(4);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'resistSmMode', left: 1, right: 0xff, defense: 4 }]);
    expect(MessageType.RESISTSMMODE).toBe(0x005d);
  });
});
