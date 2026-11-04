// Buff Pang (2026-11-05): the request (`CDPClient::SendNPCBuff`, `Neuz/DPClient.cpp:17387-17394`) and the answer's
// DOAPPLYUSESKILL (`CUserMng::AddDoApplySkill`, `WORLDSERVER/UserLux.cpp:270-280`), which must not end its bundle.

import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, MessageType, PacketType, WORLD_READERS, decodeWorldPacket, encodeNpcBuff, readBundle } from '../src';

const PLAYER = 0x1234;

describe('Buff Pang', () => {
  it('NPC_BUFF is the character key as CAr::WriteString writes it, and nothing else', () => {
    const r = new ArReader(encodeNpcBuff('MaFl_Helper'));
    expect(r.u32()).toBe(0xffffffff);
    expect(r.u32()).toBe(0xf000f813);
    expect(r.string(64)).toBe('MaFl_Helper');
    r.expectEnd();
    expect(PacketType.NPC_BUFF).toBe(0xf000f813);
    expect(decodeWorldPacket(encodeNpcBuff('MaFl_Helper_ver12'))).toEqual({ type: 'npcBuff', key: 'MaFl_Helper_ver12' });
  });

  it('refuses a key the server reads as another (empty, longer than its 63 chars, or not ASCII)', () => {
    for (const key of ['', 'x'.repeat(64), 'Pang\u0000']) expect(() => encodeNpcBuff(key)).toThrow();
  });

  it('DOAPPLYUSESKILL is read (target, skill, level), so the buffs after it in the bundle still arrive', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(3);
    // Quick Step (Event) 317 at level 2 for an hour, its DOAPPLYUSESKILL, then Haste (Event) 318
    w.u32(PLAYER).u16(MessageType.SETSKILLSTATE).u32(PLAYER).u16(1).u16(317).u32(2).u32(3600000);
    w.u32(PLAYER).u16(MessageType.DOAPPLYUSESKILL).u32(PLAYER).u32(317).u32(2);
    w.u32(PLAYER).u16(MessageType.SETSKILLSTATE).u32(PLAYER).u16(1).u16(318).u32(2).u32(3600000);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'setSkillState', targetId: PLAYER, buffType: 1, id: 317, level: 2, time: 3600000 },
      { type: 'doApplySkill', targetId: PLAYER, skill: 317, level: 2 },
      { type: 'setSkillState', targetId: PLAYER, buffType: 1, id: 318, level: 2, time: 3600000 },
    ]);
    expect(MessageType.DOAPPLYUSESKILL).toBe(0x00d7);
  });
});
