import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, WORLD_READERS } from '../src/index';
import { encodeQuestCheck, encodeRemoveQuest, readQuest, writeQuest } from '../src/world/quest';
import type { OwnQuest } from '../src/world/quest';
import type { WorldMessage } from '../src/world/types';

const QUEST_BYTES = [0x0e, 0x00, 0x05, 0x80, 0x97, 0x00, 0x03, 0x00, 0x00, 0x00, 0x03, 0x00];
const ENDED: OwnQuest = { id: 151, state: 14, time: 0x8005, kills: [3, 0], patrol: true, dialog: true };

/** Reads one snapshot message of `type` with its registered reader, then the marker after it. */
function readMessage(type: number, write: (w: ArWriter) => ArWriter): WorldMessage {
  const r = new ArReader(write(new ArWriter()).u32(0xdeadbeef).toBytes());
  const message = WORLD_READERS.get(type)!(r, { objectId: 9000, playerObjectId: 9000 });
  expect(r.u32()).toBe(0xdeadbeef);
  r.expectEnd();
  return message;
}

describe('QUEST (_Common/Mover.h:261-279)', () => {
  it('reads a QUEST as Neuz lays it out', () => {
    expect(readQuest(new ArReader(Uint8Array.from(QUEST_BYTES)))).toEqual(ENDED);
    expect([...writeQuest(new ArWriter(), ENDED).toBytes()]).toEqual(QUEST_BYTES);
  });
});

describe('the quest snapshots (Neuz/DPClient.cpp)', () => {
  it('reads the five quest snapshots', () => {
    expect(readMessage(0x00b0, (w) => writeQuest(w, ENDED))).toEqual({ type: 'setQuest', quest: ENDED });
    expect(readMessage(0x003a, (w) => w.i32(-1).u32(151))).toEqual({ type: 'removeQuest', kind: -1, questId: 151 });
    expect(readMessage(0x00ba, (w) => w.i32(1).i32(2).u32(60000))).toEqual({ type: 'questTextTime', flag: true, state: 2, ms: 60000 });
    expect(readMessage(0x9400, (w) => w.f32(1).f32(2).f32(3))).toEqual({ type: 'questHelperNpcPos', pos: [1, 2, 3] });
    expect(readMessage(0x8820, (w) => w.u8(2).u16(151).u16(83))).toEqual({ type: 'questChecked', quests: [151, 83] });
  });
});

describe('the quest packets (DPClient.cpp:11247, :19252)', () => {
  it("the abandon and check packets are Neuz's", () => {
    const remove = new ArReader(encodeRemoveQuest(151));
    expect([remove.u32(), remove.u32(), remove.u32()]).toEqual([0xffffffff, 0x00ff0026, 151]);
    remove.expectEnd();
    const check = new ArReader(encodeQuestCheck(83, true));
    expect([check.u32(), check.u32(), check.i32(), check.i32()]).toEqual([0xffffffff, 0x88100110, 83, 1]);
    check.expectEnd();
    const uncheck = new ArReader(encodeQuestCheck(83, false));
    uncheck.u32(); uncheck.u32(); uncheck.i32();
    expect(uncheck.i32()).toBe(0);
  });
});
