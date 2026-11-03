import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, ProtocolError } from '../src/index';
import { encodeNpcDialog, encodeNpcDialogOpen, readNpcScript, type NpcAction } from '../src/world/npc';

/** The request's body after its 8-byte header (`DPID_UNKNOWN`, PACKETTYPE_SCRIPTDLG). */
function requestOf(bytes: Uint8Array): ArReader {
  const r = new ArReader(bytes);
  r.u32();
  expect(r.u32()).toBe(0xff00b0);
  return r;
}

function read(write: (w: ArWriter) => ArWriter): NpcAction {
  return readNpcScript(new ArReader(write(new ArWriter()).toBytes())).action;
}

describe('SendScriptDialogReq (DPClient.cpp:9647-9654)', () => {
  it("the opening request is Neuz's: the NPC, an empty key and four zeros", () => {
    const r = requestOf(encodeNpcDialogOpen(12));
    expect([r.u32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()]).toEqual([12, 0, 0, 0, 0, 0]);
    r.expectEnd();
  });

  it('a request carries the NPC and the player in the last two globals', () => {
    const r = requestOf(encodeNpcDialog(12, 'Introduction', 3, 7, 9000));
    expect([r.u32(), r.string(255), r.i32(), r.i32(), r.i32(), r.i32()]).toEqual([12, 'Introduction', 3, 7, 12, 9000]);
    r.expectEnd();
  });

  it('refuses an empty or too long key in a request', () => {
    expect(() => encodeNpcDialog(12, '', 0, 0, 1)).toThrow();
    expect(() => encodeNpcDialog(12, 'k'.repeat(256), 0, 0, 1)).toThrow();
  });
});

describe('OnRunScriptFunc (DPClient.cpp:14265-14476, MsgHdr.h:1416-1438)', () => {
  const button = (fn: number) => (w: ArWriter) => w.u16(fn).string('Report').string('QUEST_BEGIN').u32(4).u32(5);
  const fields = { label: 'Report', key: 'QUEST_BEGIN', param: 4, quest: 5 };

  it('reads every function the V15 server sends', () => {
    const cases: [(w: ArWriter) => ArWriter, NpcAction][] = [
      [button(0x10), { kind: 'key', ...fields }],
      [(w) => w.u16(0x11).string('Farewell'), { kind: 'removeKey', key: 'Farewell' }],
      [(w) => w.u16(0x12).string('Hello').u32(5), { kind: 'say', text: 'Hello', quest: 5 }],
      [button(0x13), { kind: 'answer', ...fields }],
      [(w) => w.u16(0x16), { kind: 'exit' }],
      [(w) => w.u16(0x19), { kind: 'none' }],
      [(w) => w.u16(0x1a).u32(30), { kind: 'initStat', stat: 'all', remainGP: 30 }],
      [(w) => w.u16(0x1d), { kind: 'clear' }],
      [(w) => w.u16(0x20).u32(1), { kind: 'initStat', stat: 'str', remainGP: 1 }],
      [(w) => w.u16(0x21).u32(2), { kind: 'initStat', stat: 'sta', remainGP: 2 }],
      [(w) => w.u16(0x22).u32(3), { kind: 'initStat', stat: 'dex', remainGP: 3 }],
      [(w) => w.u16(0x23).u32(4), { kind: 'initStat', stat: 'int', remainGP: 4 }],
      [(w) => w.u16(0x24), { kind: 'queryName', of: 'player' }],
      [button(0x26), { kind: 'newQuest', ...fields }],
      [button(0x27), { kind: 'currentQuest', ...fields }],
    ];
    for (const [write, action] of cases) expect(read(write)).toEqual(action);
  });

  it('reads the functions V15 never sends without losing its place', () => {
    const cases: [(w: ArWriter) => ArWriter, NpcAction][] = [
      [(w) => w.u16(0x14), { kind: 'none' }],
      [(w) => w.u16(0x15), { kind: 'none' }],
      [(w) => w.u16(0x17), { kind: 'none' }],
      [(w) => w.u16(0x18), { kind: 'none' }],
      [(w) => w.u16(0x1b).u32(1).f32(6968).f32(100).f32(3328), { kind: 'navigator', worldId: 1, pos: [6968, 100, 3328] }],
      [(w) => w.u16(0x1c), { kind: 'removeNavigator' }],
      [(w) => w.u16(0x1e).string('Quest text').u32(5), { kind: 'none' }],
      [(w) => w.u16(0x25), { kind: 'queryName', of: 'guild' }],
    ];
    for (const [write, action] of cases) {
      const r = new ArReader(write(new ArWriter()).u32(0xdeadbeef).toBytes());
      expect(readNpcScript(r).action).toEqual(action);
      expect(r.u32()).toBe(0xdeadbeef);
      r.expectEnd();
    }
  });

  it('refuses a function number it does not know', () => {
    expect(() => read((w) => w.u16(0x1f))).toThrow(ProtocolError);
  });
});
