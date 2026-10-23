import { describe, expect, it } from 'vitest';
import { ArWriter, BUNDLE_MARKER, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';
import type { MoveReport, Vec3, WorldMessage } from '../src';

const PLAYER = 0x1234;
const OBJ = 0x5678;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A SNAPSHOT body written by hand: the 10-byte header, the messages, and (by default) the table of contents. */
function body(messages: Msg[], indexed = true): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(messages.length);
  const starts: number[] = [];
  let at = 0;
  for (const m of messages) {
    starts.push(at);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    at += 6 + m.fields.byteLength;
  }
  if (indexed) {
    for (const s of starts) w.u32(s);
    w.u16(messages.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}

/** Reads a bundle of this one message and returns what the reader made of it, with nothing skipped or mismatched. */
function readOne(type: number, fields: Uint8Array, indexed = true): WorldMessage {
  const result = readBundle(body([{ objectId: OBJ, type, fields }], indexed), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ objectId: OBJ, type });
  return result.messages[0].value;
}

// Every position, delta and angle below is exactly representable as a float, so it reads back unchanged.
const pos: Vec3 = [6968.5, 100.25, 3328.5];
const delta: Vec3 = [0.5, 0, -1.25];

const move: MoveReport = {
  pos, delta, angle: 90.5, state: 0x11, stateFlag: 0x2, motion: 0x15, motionEx: -1, loop: 3, motionOption: 4,
  tick: 123456789012n,
};

/**
 * `ar >> v >> vd >> f; ar >> dwState >> dwStateFlag; ar >> dwMotion >> nMotionEx; ar >> nLoop >> dwMotionOption;
 * ar >> nTickCount;`
 */
const moveFields = (m: MoveReport) => new ArWriter().vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state)
  .u32(m.stateFlag).u32(m.motion).i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick).toBytes();

describe('movement messages', () => {
  it('MOVERMOVED is OnMoverMoved: v, vd, f, state, state flag, motion, motion ex, loop, motion option, tick', () => {
    expect(readOne(MessageType.MOVERMOVED, moveFields(move))).toEqual({ type: 'moverMoved', move });
  });

  it('MOVERBEHAVIOR is OnMoverBehavior, the same fields in the same order', () => {
    expect(readOne(MessageType.MOVERBEHAVIOR, moveFields(move))).toEqual({ type: 'moverBehavior', move });
  });

  it('MOVERMOVED keeps a negative angle, a negative motionEx and a 64-bit tick whole', () => {
    const odd: MoveReport = { ...move, angle: -270.25, motionEx: -2147483648, loop: -7, tick: 9007199254740993n };
    expect(readOne(MessageType.MOVERMOVED, moveFields(odd))).toEqual({ type: 'moverMoved', move: odd });
  });

  it('MOVERANGLE is OnMoverAngle: v, vd, f, angle X, accelerating power, turn angle, tick', () => {
    // ar >> v >> vd >> f >> fAngleX >> fAccPower >> fTurnAngle; ar >> nTickCount;
    const fields = new ArWriter().vec3(pos).vec3(delta).f32(45.5).f32(-10.25).f32(0.75).f32(2.5).i64(555n).toBytes();
    expect(readOne(MessageType.MOVERANGLE, fields)).toEqual({
      type: 'moverAngle', pos, delta, angle: 45.5, angleX: -10.25, accPower: 0.75, turnAngle: 2.5, tick: 555n,
    });
  });

  it('DESTPOS is OnSetDestPos: the position and the forward byte, with no object ID (__IAOBJ0622 is off)', () => {
    // ar >> vPos >> fForward;
    expect(readOne(MessageType.DESTPOS, new ArWriter().vec3(pos).u8(1).toBytes()))
      .toEqual({ type: 'destPos', pos, forward: true });
    expect(readOne(MessageType.DESTPOS, new ArWriter().vec3(pos).u8(0).toBytes()))
      .toEqual({ type: 'destPos', pos, forward: false });
  });

  it('DESTPOS and DESTANGLE take any non-zero byte as true, as (fForward != 0) and (fLeft != 0) do', () => {
    expect(readOne(MessageType.DESTPOS, new ArWriter().vec3(pos).u8(2).toBytes()))
      .toEqual({ type: 'destPos', pos, forward: true });
    expect(readOne(MessageType.DESTANGLE, new ArWriter().f32(10).u8(0xff).toBytes()))
      .toEqual({ type: 'destAngle', angle: 10, left: true });
  });

  it('DESTANGLE is OnSetDestAngle: the angle and the left byte', () => {
    // ar >> fDestAngle >> fLeft;
    expect(readOne(MessageType.DESTANGLE, new ArWriter().f32(135.5).u8(1).toBytes()))
      .toEqual({ type: 'destAngle', angle: 135.5, left: true });
    expect(readOne(MessageType.DESTANGLE, new ArWriter().f32(-45.25).u8(0).toBytes()))
      .toEqual({ type: 'destAngle', angle: -45.25, left: false });
  });

  it('MOVERSETDESTOBJ is OnMoverSetDestObj: the target object ID and the range', () => {
    // ar >> objid >> fRange;
    expect(readOne(MessageType.MOVERSETDESTOBJ, new ArWriter().u32(0xabcd).f32(3.5).toBytes()))
      .toEqual({ type: 'setDestObj', targetId: 0xabcd, range: 3.5 });
    expect(readOne(MessageType.MOVERSETDESTOBJ, new ArWriter().u32(NULL_ID).f32(0).toBytes()))
      .toEqual({ type: 'setDestObj', targetId: NULL_ID, range: 0 });
  });

  it('MOTION is OnMotion: the OBJMSG as a DWORD', () => {
    // ar >> dwMsg;
    expect(readOne(MessageType.MOTION, new ArWriter().u32(0x2a).toBytes())).toEqual({ type: 'motion', message: 0x2a });
    expect(readOne(MessageType.MOTION, new ArWriter().u32(0xfffffff0).toBytes()))
      .toEqual({ type: 'motion', message: 0xfffffff0 });
  });
});

describe('place messages', () => {
  it('SETPOS is OnSetPos: the position', () => {
    // ar >> vPos;
    expect(readOne(MessageType.SETPOS, new ArWriter().vec3(pos).toBytes())).toEqual({ type: 'setPos', pos });
  });

  it('SETPOSANGLE is OnSetPosAngle: the position and the angle', () => {
    // ar >> vPos >> fAngle;
    expect(readOne(MessageType.SETPOSANGLE, new ArWriter().vec3(pos).f32(-90.5).toBytes()))
      .toEqual({ type: 'setPosAngle', pos, angle: -90.5 });
  });

  it('DEL_OBJ is OnRemoveObj: no fields', () => {
    expect(readOne(MessageType.DEL_OBJ, new Uint8Array(0))).toEqual({ type: 'delObj' });
  });

  it('WORLD_READINFO is OnWorldReadInfo: the world ID and the position', () => {
    // ar >> dwWorldId >> vPos;
    expect(readOne(MessageType.WORLD_READINFO, new ArWriter().u32(1).vec3(pos).toBytes()))
      .toEqual({ type: 'worldReadInfo', worldId: 1, pos });
  });

  it('REPLACE is OnReplace: the world ID and the position, and nothing else', () => {
    // ar >> dwWorldID; ar >> vPos;
    expect(readOne(MessageType.REPLACE, new ArWriter().u32(0x2a).vec3(pos).toBytes()))
      .toEqual({ type: 'replace', worldId: 0x2a, pos });
  });
});

describe('the environment setting', () => {
  it('ENVIRONMENTALL is OnEnvironmentSetting: the season as an int', () => {
    // int nSeason = SEASON_NONE; ar >> nSeason; (__ENVIRONMENT_EFFECT is on)
    expect(MessageType.ENVIRONMENTALL).toBe(0x0063);
    expect(readOne(MessageType.ENVIRONMENTALL, new ArWriter().i32(3).toBytes())).toEqual({ type: 'environmentSetting', season: 3 });
    expect(readOne(MessageType.ENVIRONMENTALL, new ArWriter().i32(-1).toBytes())).toEqual({ type: 'environmentSetting', season: -1 });
  });

  it('lets a JOIN without a table of contents be read on past it, as CUser::Open starts the JOIN with it', () => {
    // CUser::Open (WORLDSERVER/User.cpp:308-349): the environment setting, then WORLD_READINFO, then the own ADD_OBJ
    const result = readBundle(body([
      { objectId: PLAYER, type: MessageType.ENVIRONMENTALL, fields: new ArWriter().i32(0).toBytes() },
      { objectId: PLAYER, type: MessageType.WORLD_READINFO, fields: new ArWriter().u32(1).vec3(pos).toBytes() },
    ], false), WORLD_READERS);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'environmentSetting', season: 0 }, { type: 'worldReadInfo', worldId: 1, pos },
    ]);
    expect(result.stoppedAt).toBeNull();
  });
});

/** Fields that each reader takes whole, for the tests that run over every type. */
const SAMPLES: [number, Uint8Array][] = [
  [MessageType.ENVIRONMENTALL, new ArWriter().i32(2).toBytes()],
  [MessageType.MOVERMOVED, moveFields(move)],
  [MessageType.MOVERBEHAVIOR, moveFields(move)],
  [MessageType.MOVERANGLE, new ArWriter().vec3(pos).vec3(delta).f32(1).f32(2).f32(3).f32(4).i64(5n).toBytes()],
  [MessageType.DESTPOS, new ArWriter().vec3(pos).u8(1).toBytes()],
  [MessageType.DESTANGLE, new ArWriter().f32(1).u8(1).toBytes()],
  [MessageType.MOVERSETDESTOBJ, new ArWriter().u32(1).f32(1).toBytes()],
  [MessageType.MOTION, new ArWriter().u32(1).toBytes()],
  [MessageType.SETPOS, new ArWriter().vec3(pos).toBytes()],
  [MessageType.SETPOSANGLE, new ArWriter().vec3(pos).f32(1).toBytes()],
  [MessageType.DEL_OBJ, new Uint8Array(0)],
  [MessageType.WORLD_READINFO, new ArWriter().u32(1).vec3(pos).toBytes()],
  [MessageType.REPLACE, new ArWriter().u32(1).vec3(pos).toBytes()],
];

describe('WORLD_READERS', () => {
  it('has a reader for each movement, place and environment message type', () => {
    // ADD_OBJ has its own tests (addObj.test.ts).
    for (const [type] of SAMPLES) expect(WORLD_READERS.has(type), `type 0x${type.toString(16)}`).toBe(true);
  });

  it('reads a bundle of all of them in order, with and without the table of contents', () => {
    const messages = SAMPLES.map(([type, fields], i) => ({ objectId: 100 + i, type, fields }));
    const types = SAMPLES.map(([type]) => type);
    for (const indexed of [true, false]) {
      const result = readBundle(body(messages, indexed), WORLD_READERS);
      expect(result.indexed).toBe(indexed);
      expect(result.playerObjectId).toBe(PLAYER);
      expect(result.skipped).toEqual([]);
      expect(result.mismatched).toEqual([]);
      expect(result.stoppedAt).toBeNull();
      expect(result.messages.map((m) => m.type)).toEqual(types);
      expect(result.messages.map((m) => m.objectId)).toEqual(messages.map((m) => m.objectId));
    }
  });

  it('drops a message with a byte more than its handler reads, instead of misreading it', () => {
    for (const [type, fields] of SAMPLES) {
      const longer = new Uint8Array(fields.byteLength + 1);
      longer.set(fields);
      const result = readBundle(body([{ objectId: OBJ, type, fields: longer }]), WORLD_READERS);
      expect(result.mismatched, `type 0x${type.toString(16)}`).toEqual([type]);
      expect(result.messages).toEqual([]);
    }
  });

  it('drops a message with a byte less than its handler reads', () => {
    for (const [type, fields] of SAMPLES) {
      if (fields.byteLength === 0) continue; // DEL_OBJ has nothing to cut
      const shorter = fields.subarray(0, fields.byteLength - 1);
      const result = readBundle(body([{ objectId: OBJ, type, fields: shorter }]), WORLD_READERS);
      expect(result.mismatched, `type 0x${type.toString(16)}`).toEqual([type]);
      expect(result.messages).toEqual([]);
    }
  });
});
