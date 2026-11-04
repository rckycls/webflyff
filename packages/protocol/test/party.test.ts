// The party messages (Piece 7 M4, [R §1.1]): their fields, the party block of PARTYMEMBER, and a bundle of all of them
// read to its end.

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, PacketType, WORLD_READERS, decodeWorldPacket, encodeAddPartyMember, encodeBlock,
  encodeChangeTroup, encodePartyChangeLeader, encodePartyExpMode, encodePartyItemMode, encodePartyMemberCancel,
  encodePartyMemberRequest, encodePartySkillUse, encodeQueryPlayerData, encodeRemovePartyMember, readBundle,
} from '../src';
import { readPartyMember } from '../src/world/party';

const PLAYER = 0x1234;
const END = 0xdeadbeef;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A SNAPSHOT body written by hand, without the table of contents: a reader that is missing ends it. */
function body(messages: Msg[]): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(messages.length);
  for (const m of messages) w.u32(m.objectId).u16(m.type).bytes(m.fields);
  return w.toBytes();
}

const fields = (write: (w: ArWriter) => ArWriter): Uint8Array => write(new ArWriter()).toBytes();
/** `CAr::WriteString`: an i32 count, then the bytes. */
const str = (w: ArWriter, text: string): ArWriter => w.i32(text.length).bytes(new TextEncoder().encode(text));
const readOne = (type: number, bytes: Uint8Array, objectId = PLAYER) =>
  readBundle(body([{ objectId, type, fields: bytes }]), WORLD_READERS);

/** The party block of `CParty::Serialize` (`party.cpp:215-240`); the name only when `kind` is not 0. */
function block(w: ArWriter, kind: number, members: Array<[number, number]>, name = ''): ArWriter {
  w.u32(77).i32(kind).i32(members.length).i32(3).i32(120).i32(15).i32(0).i32(1).u32(0);
  for (const time of [0, 1, 0, 0, 0]) w.i32(time);
  if (kind !== 0) str(w, name);
  for (const [id, removed] of members) w.u32(id).i32(removed);
  return w;
}

const MEMBER = (kind: number, name = '') => fields((w) =>
  block(str(str(w.u32(70002), 'Lead'), 'Webby').i32(2), kind, [[70001, 0], [70002, 1]], name).u32(END));
/** Reads a PARTYMEMBER's fields and the u32 after them. */
function readMember(bytes: Uint8Array) {
  const r = new ArReader(bytes);
  return { value: readPartyMember(r), after: r.u32() };
}

describe('the party messages ([R §1.1])', () => {
  it('PARTYMEMBER reads its party block, the name only for an advanced party', () => {
    expect(readMember(MEMBER(0))).toEqual({ after: END, value: {
      type: 'partyMember', playerId: 70002, leaderName: 'Lead', memberName: 'Webby',
      party: {
        partyId: 77, kind: 0, level: 3, exp: 120, point: 15, expMode: 0, itemMode: 1, duelPartyId: 0,
        modeTime: [0, 1, 0, 0, 0], name: '',
        members: [{ playerId: 70001, removed: false }, { playerId: 70002, removed: true }],
      },
    } });
    expect(readMember(MEMBER(1, 'Webbies'))).toMatchObject({ after: END, value: { party: { kind: 1, name: 'Webbies' } } });
  });

  it('PARTYMEMBER with a size of 0 has no block', () => {
    const result = readOne(MessageType.PARTYMEMBER, fields((w) => str(str(w.u32(70001), 'Lead'), 'Webby').i32(0)));
    expect(result.messages[0]!.value).toEqual({ type: 'partyMember', playerId: 70001, leaderName: 'Lead', memberName: 'Webby', party: null });
  });

  it('reads the request, its cancel, the EXP in exp-level-point order, the modes and the errors', () => {
    const request = fields((w) => str(w.u32(70002).i32(20).i32(1).u8(0).u32(70001).i32(15).i32(4).u8(1), 'Lead').i32(0));
    expect(readOne(MessageType.PARTYREQEST, request).messages[0]!.value).toEqual({
      type: 'partyRequest', leader: { id: 70002, level: 20, job: 1, sex: 0 }, member: { id: 70001, level: 15, job: 4, sex: 1 },
      leaderName: 'Lead', troup: 0,
    });
    expect(readOne(MessageType.PARTYREQESTCANCEL, fields((w) => w.u32(70001).u32(70002).i32(3))).messages[0]!.value)
      .toEqual({ type: 'partyRequestCancel', leaderId: 70001, memberId: 70002, mode: 3 });
    expect(readOne(MessageType.PARTYEXP, fields((w) => w.i32(180).i32(4).i32(30))).messages[0]!.value)
      .toEqual({ type: 'partyExp', exp: 180, level: 4, point: 30 });
    expect(readOne(MessageType.SETPARTYMODE, fields((w) => w.i32(0).u32(20000).i32(1).i32(14))).messages[0]!.value)
      .toEqual({ type: 'setPartyMode', mode: 0, skillTime: 20000, on: true, point: 14 });
    expect(readOne(MessageType.SETPARTYMODE, fields((w) => w.i32(0).u32(0).i32(0))).messages[0]!.value)
      .toEqual({ type: 'setPartyMode', mode: 0, skillTime: 0, on: false, point: null });
    expect(readOne(MessageType.ERRORPARTY, fields((w) => w.u32(207).u32(2))).messages[0]!.value)
      .toEqual({ type: 'errorParty', code: 207, skill: 2 });
    expect(readOne(MessageType.ERRORPARTY, fields((w) => w.u32(201))).messages[0]!.value)
      .toEqual({ type: 'errorParty', code: 201, skill: null });
  });

  it('reads the leader, the troup, the names, the member param, the map info and the four party skills', () => {
    const cases: Array<[number, Uint8Array, unknown]> = [
      [MessageType.ADDPARTYCHANGELEADER, fields((w) => w.u32(70002)), { type: 'partyChangeLeader', leaderId: 70002 }],
      [MessageType.PARTYCHANGETROUP, fields((w) => str(w, 'Webbies')), { type: 'partyChangeTroup', name: 'Webbies' }],
      [MessageType.PARTYCHANGENAME, fields((w) => str(w, 'Webbies')), { type: 'partyChangeName', name: 'Webbies' }],
      [MessageType.ADDPARTYNAME, fields((w) => str(w, 'Saved')), { type: 'myPartyName', name: 'Saved' }],
      [MessageType.PARTYCHANGEITEMMODE, fields((w) => w.i32(2)), { type: 'partyItemMode', mode: 2 }],
      [MessageType.PARTYCHANGEEXPMODE, fields((w) => w.i32(1)), { type: 'partyExpMode', mode: 1 }],
      [MessageType.SET_PARTY_MEMBER_PARAM, fields((w) => w.u32(70002).u8(0).i32(1)),
        { type: 'setPartyMemberParam', playerId: 70002, param: 0, value: 1 }],
      [MessageType.PARTYMAPINFO, fields((w) => w.i32(1).f32(6000).f32(100).f32(4000)),
        { type: 'partyMapInfo', index: 1, pos: [6000, 100, 4000] }],
      [MessageType.PARTYSKILL_CALL, fields((w) => w.f32(6000).f32(100).f32(4000)), { type: 'partySkillCall', pos: [6000, 100, 4000] }],
      [MessageType.PARTYSKILL_BLITZ, fields((w) => w.u32(9001)), { type: 'partySkillBlitz', targetId: 9001 }],
      [MessageType.PARTYSKILL_RETREAT, fields((w) => w), { type: 'partySkillRetreat' }],
      [MessageType.PARTYSKILL_SPHERECIRCLE, fields((w) => w), { type: 'partySkillSphereCircle' }],
    ];
    for (const [type, bytes, value] of cases) {
      const result = readOne(type, bytes);
      expect(result.messages.map((m) => m.value), type.toString(16)).toEqual([value]);
      expect(result.stoppedAt, type.toString(16)).toBeNull();
    }
  });

  it('a bundle with every party message is read to its end', () => {
    const sixteen = Array.from({ length: 16 }, (_, i): [number, number] => [70001 + i, 0]);
    const all: Msg[] = [
      [MessageType.PARTYMEMBER, fields((w) => block(str(str(w.u32(70002), 'Lead'), 'Webby').i32(16), 0, sixteen))],
      [MessageType.PARTYMEMBER, fields((w) => str(str(w.u32(70001), 'Lead'), 'Webby').i32(0))],
      [MessageType.PARTYREQEST, fields((w) => str(w.u32(1).i32(1).i32(0).u8(0).u32(2).i32(1).i32(0).u8(1), 'L').i32(0))],
      [MessageType.PARTYREQESTCANCEL, fields((w) => w.u32(1).u32(2).i32(0))],
      [MessageType.PARTYEXP, fields((w) => w.i32(1).i32(2).i32(3))],
      [MessageType.ADDPARTYCHANGELEADER, fields((w) => w.u32(2))],
      [MessageType.PARTYCHANGETROUP, fields((w) => str(w, 'Abcd'))],
      [MessageType.PARTYCHANGENAME, fields((w) => str(w, ''))],
      [MessageType.ADDPARTYNAME, fields((w) => str(w, ''))],
      [MessageType.PARTYCHANGEITEMMODE, fields((w) => w.i32(0))],
      [MessageType.PARTYCHANGEEXPMODE, fields((w) => w.i32(0))],
      [MessageType.SETPARTYMODE, fields((w) => w.i32(3).u32(300000).i32(1).i32(0))],
      [MessageType.SETPARTYMODE, fields((w) => w.i32(3).u32(0).i32(0))],
      [MessageType.SET_PARTY_MEMBER_PARAM, fields((w) => w.u32(2).u8(0).i32(0))],
      [MessageType.PARTYMAPINFO, fields((w) => w.i32(20).f32(0).f32(0).f32(0))],
      [MessageType.PARTYSKILL_CALL, fields((w) => w.f32(0).f32(0).f32(0))],
      [MessageType.PARTYSKILL_BLITZ, fields((w) => w.u32(9001))],
      [MessageType.PARTYSKILL_RETREAT, fields((w) => w)],
      [MessageType.PARTYSKILL_SPHERECIRCLE, fields((w) => w)],
      [MessageType.ERRORPARTY, fields((w) => w.u32(207).u32(4))],
      [MessageType.ERRORPARTY, fields((w) => w.u32(202))],
      [0x0069, fields((w) => str(str(w.u32(9050), 'Lead'), 'hello'))],
      [0x00d1, fields((w) => w.u32(3))],
    ].map(([type, bytes]) => ({ objectId: PLAYER, type: type as number, fields: bytes as Uint8Array }));
    const result = readBundle(body(all), WORLD_READERS);
    expect(result.messages.map((m) => m.type)).toEqual(all.map((m) => m.type));
    expect(result.stoppedAt).toBeNull();
    expect(result.messages[0]!.value).toMatchObject({ type: 'partyMember', party: { members: { length: 16 } } });
  });

  it('party chat reads a speaker name of 41 bytes', () => {
    const name = 'A'.repeat(41);
    const result = readOne(0x0069, fields((w) => str(str(w.u32(9050), name), 'hello')));
    expect(result.messages[0]!.value).toEqual({ type: 'party', sender: name, text: 'hello', speakerId: 9050 });
  });
});

describe('the party packets the client sends ([R §2])', () => {
  /** The fields after `DPID_UNKNOWN` and the type, which must be `type`. */
  function after(bytes: Uint8Array, type: number): ArReader {
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32()]).toEqual([0xffffffff, type]);
    return r;
  }
  const i32s = (r: ArReader, n: number): number[] => Array.from({ length: n }, () => r.i32());

  it('encodes the party packets as Neuz does', () => {
    let r = after(encodePartyMemberRequest(70001, 70002), 0xffffff17);
    expect(i32s(r, 3)).toEqual([70001, 70002, 0]); r.expectEnd();
    r = after(encodePartyMemberCancel(70002, 70001, 0), 0xffffff18);
    expect(i32s(r, 3)).toEqual([70002, 70001, 0]); r.expectEnd();
    r = after(encodeAddPartyMember({ id: 70002, level: 20, job: 1, sex: 0 }, { id: 70001, level: 15, job: 4, sex: 1 }), 0xffffff11);
    expect(i32s(r, 8)).toEqual([70002, 20, 1, 0, 70001, 15, 4, 1]); r.expectEnd();
    r = after(encodeRemovePartyMember(70001, 70002), 0xffffff12);
    expect(i32s(r, 2)).toEqual([70001, 70002]); r.expectEnd();
    r = after(encodeChangeTroup(70001, 'Webbies'), 0xffffff19);
    expect(i32s(r, 2)).toEqual([70001, 1]); expect(r.string(33)).toBe('Webbies'); r.expectEnd();
    r = after(encodePartyChangeLeader(70001, 70002), 0xffffff2f);
    expect(i32s(r, 2)).toEqual([70001, 70002]); r.expectEnd();
    r = after(encodePartyItemMode(70001, 3), 0xffffff20);
    expect(i32s(r, 2)).toEqual([70001, 3]); r.expectEnd();
    r = after(encodePartyExpMode(70001, 1), 0xffffff21);
    expect(i32s(r, 2)).toEqual([70001, 1]); r.expectEnd();
    r = after(encodePartySkillUse(70001, 5), 0xffffff1b);
    expect(i32s(r, 2)).toEqual([70001, 5]); r.expectEnd();
    r = after(encodeBlock(7, 'Webby', 'Lead'), 0xffffff5a);
    expect(r.u8()).toBe(7); expect([r.string(64), r.string(64)]).toEqual(['Webby', 'Lead']); r.expectEnd();
    r = after(encodeQueryPlayerData(70002), 0xf000f802);
    expect(i32s(r, 2)).toEqual([70002, 0]); r.expectEnd();
  });

  it('decodeClientPacket reads every party packet back', () => {
    const side = { id: 70002, level: 20, job: 1, sex: 0 };
    expect([
      decodeWorldPacket(encodePartyMemberRequest(70001, 70002)),
      decodeWorldPacket(encodePartyMemberCancel(70002, 70001, 3)),
      decodeWorldPacket(encodeAddPartyMember(side, { ...side, id: 70001 })),
      decodeWorldPacket(encodeRemovePartyMember(70001, 70001)),
      decodeWorldPacket(encodeChangeTroup(70001, 'Webbies')),
      decodeWorldPacket(encodePartyChangeLeader(70001, 70002)),
      decodeWorldPacket(encodePartyItemMode(70001, 2)),
      decodeWorldPacket(encodePartyExpMode(70001, 1)),
      decodeWorldPacket(encodePartySkillUse(70001, 1)),
      decodeWorldPacket(encodeBlock(7, 'Webby', 'Lead')),
      decodeWorldPacket(encodeQueryPlayerData(70002)),
    ]).toEqual([
      { type: 'partyMemberRequest', ownId: 70001, targetId: 70002, troup: 0 },
      { type: 'partyMemberCancel', leaderId: 70002, memberId: 70001, mode: 3 },
      { type: 'addPartyMember', leader: side, member: { ...side, id: 70001 } },
      { type: 'removePartyMember', ownId: 70001, leaveId: 70001 },
      { type: 'changeTroup', ownId: 70001, name: 'Webbies' },
      { type: 'partyLeaderChange', ownId: 70001, newLeaderId: 70002 },
      { type: 'partyItemModeChange', ownId: 70001, mode: 2 },
      { type: 'partyExpModeChange', ownId: 70001, mode: 1 },
      { type: 'partySkillUse', ownId: 70001, skill: 1 },
      { type: 'blockRequest', gu: 7, ownName: 'Webby', inviterName: 'Lead' },
      { type: 'queryPlayerData', playerId: 70002, version: 0 },
    ]);
  });
});
