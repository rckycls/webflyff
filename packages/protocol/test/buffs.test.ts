// The buffs' messages (Piece 7 M2, [R §10]): their fields, a bundle of all of them read to its end, and another mover's
// ADD_OBJ keeping its buffs.

import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, MessageType, PacketType, WORLD_READERS, readBundle } from '../src';
import { readBuffs } from '../src/world/buffs';

const PLAYER = 0x1234;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A SNAPSHOT body written by hand, without the table of contents: a reader that is missing ends it. */
function body(messages: Msg[]): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(messages.length);
  for (const m of messages) w.u32(m.objectId).u16(m.type).bytes(m.fields);
  return w.toBytes();
}

const fields = (write: (w: ArWriter) => ArWriter): Uint8Array => write(new ArWriter()).toBytes();

const MESSAGES: Array<[number, Uint8Array, unknown]> = [
  // Heap Up (SI_ASS_CHEER_HEAPUP 49) at level 3 on 9001 for 60 s
  [MessageType.SETSKILLSTATE, fields((w) => w.u32(9001).u16(1).u16(49).u32(3).u32(60000)),
    { type: 'setSkillState', targetId: 9001, buffType: 1, id: 49, level: 3, time: 60000 }],
  [MessageType.REMOVESKILLINFULENCE, fields((w) => w.u16(1).u16(49)), { type: 'removeSkillInfluence', buffType: 1, id: 49 }],
  [MessageType.REMOVEALLSKILLINFULENCE, fields((w) => w), { type: 'removeAllSkillInfluence' }],
  [MessageType.SETDESTPARAM, fields((w) => w.i32(1).i32(2).i32(-1)), { type: 'setDestParam', dst: 1, adj: 2, chg: -1 }],
  [MessageType.RESETDESTPARAM, fields((w) => w.i32(1).i32(2)), { type: 'resetDestParam', dst: 1, adj: 2 }],
  [MessageType.RESETDESTPARAM_SYNC, fields((w) => w.i32(11).i32(10).i32(30)), { type: 'resetDestParamSync', dst: 11, adj: 10, total: 30 }],
];

describe('the buffs\' messages ([R §10])', () => {
  it('reads each message with its fields', () => {
    for (const [type, bytes, value] of MESSAGES) {
      const result = readBundle(body([{ objectId: PLAYER, type, fields: bytes }]), WORLD_READERS);
      expect(result.messages.map((m) => m.value), type.toString(16)).toEqual([value]);
    }
  });

  it('a bundle with every buff message is read to its end', () => {
    const all = MESSAGES.map(([type, bytes]) => ({ objectId: PLAYER, type, fields: bytes }));
    const result = readBundle(body(all), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages).toHaveLength(MESSAGES.length);
  });

  it("BUFF_ITEM2's level is read as seconds left", () => {
    // wType 3 (BUFF_ITEM2): its level is an i32, the seconds it has left (CBuffItem2::SerializeLevel)
    const result = readBundle(body([{
      objectId: PLAYER, type: MessageType.SETSKILLSTATE, fields: fields((w) => w.u32(9001).u16(3).u16(10270).i32(-5).u32(0)),
    }]), WORLD_READERS);
    expect(result.messages[0]!.value).toMatchObject({ buffType: 3, level: -5 });
  });

  it("another mover's ADD_OBJ keeps its buffs", () => {
    const r = new ArReader(fields((w) => w.u32(2).u16(1).u16(49).u32(3).u32(45000).u16(1).u16(20).u32(1).u32(1000)));
    expect(readBuffs(r)).toEqual([
      { buffType: 1, id: 49, level: 3, timeLeft: 45000 }, { buffType: 1, id: 20, level: 1, timeLeft: 1000 },
    ]);
    r.expectEnd();
  });
});
