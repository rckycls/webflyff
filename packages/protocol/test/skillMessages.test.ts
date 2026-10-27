import { describe, expect, it } from 'vitest';
import { ArWriter, BUNDLE_MARKER, MAX_SKILL_JOB, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';
import type { SkillSlot, Vec3, WorldMessage } from '../src';

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

/**
 * Reads a bundle of this one message, with and without the table of contents, and returns what the reader made of
 * it: nothing skipped or mismatched, and the same value both ways. `objectId` is the object the message is about.
 */
function readOne(type: number, fields: Uint8Array, objectId = OBJ): WorldMessage {
  const values: WorldMessage[] = [];
  for (const indexed of [true, false]) {
    const result = readBundle(body([{ objectId, type, fields }], indexed), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ objectId, type });
    values.push(result.messages[0].value);
  }
  expect(values[1]).toEqual(values[0]);
  return values[0];
}

/** The skill IDs of the Vagrant's three skills (`SI_VAG_ONE_CLEANHIT` to `SI_VAG_ONE_OVERCUTTER`, `defineSkill.h:19-21`). */
const CLEAN_HIT = 1;
const FLURRY = 2;
const OVER_CUT = 3;

// Every position is exactly representable as a float, so it reads back unchanged.
const pos: Vec3 = [6968.5, 100.25, 3328.5];

/** A skill array of `MAX_SKILL_JOB` slots: the given ones first, the rest empty (`dwSkill` `NULL_ID`, `dwLevel` 0). */
function skillArray(filled: SkillSlot[]): SkillSlot[] {
  return Array.from({ length: MAX_SKILL_JOB }, (_, i) => filled[i] ?? { skill: NULL_ID, level: 0 });
}

/** The 45 `dwSkill`, `dwLevel` pairs as `AddDoUseSkillPoint` writes them. */
function skillPairs(w: ArWriter, skills: SkillSlot[]): ArWriter {
  for (const s of skills) w.u32(s.skill).u32(s.level);
  return w;
}

describe('the values copied from the C++ headers', () => {
  it('the skill message types are those of MsgHdr.h', () => {
    expect(MessageType.CREATESFXOBJ).toBe(0x000f);
    expect(MessageType.USESKILL).toBe(0x0019);
    expect(MessageType.CLEAR_USESKILL).toBe(0x001a);
    expect(MessageType.INITSKILLPOINT).toBe(0x007c);
    expect(MessageType.DOUSESKILLPOINT).toBe(0x007d);
    expect(MessageType.SETACTIONPOINT).toBe(0x00c5);
    expect(MessageType.ENDSKILLQUEUE).toBe(0x00e5);
  });

  it('a skill array has 45 slots (MAX_SKILL_JOB, Mover.h:95-100)', () => {
    expect(MAX_SKILL_JOB).toBe(45);
  });
});

describe('using skills', () => {
  it('USESKILL is OnUseSkill: the skill and its level, the target, the use type and the casting time', () => {
    // ar >> dwSkill >> dwLevel; ar >> id >> nUseType >> nCastingTime;  (CUserMng::AddUseSkill writes the same)
    expect(readOne(MessageType.USESKILL, new ArWriter().u32(CLEAN_HIT).u32(3).u32(0x4242).i32(0).i32(1).toBytes()))
      .toEqual({ type: 'useSkill', skill: CLEAN_HIT, level: 3, targetId: 0x4242, useType: 0, castingTime: 1 });
  });

  it('USESKILL keeps the use types of a queue and a casting time in 1/15 s ticks', () => {
    // SUT_QUEUESTART 1, SUT_QUEUEING 2 (Mover.h:134-139); KT_MAGIC sends the cast time in ticks, KT_SKILL 1.
    expect(readOne(MessageType.USESKILL, new ArWriter().u32(FLURRY).u32(10).u32(0x4242).i32(1).i32(1).toBytes()))
      .toMatchObject({ skill: FLURRY, level: 10, useType: 1 });
    expect(readOne(MessageType.USESKILL, new ArWriter().u32(OVER_CUT).u32(1).u32(0x4242).i32(2).i32(45).toBytes()))
      .toMatchObject({ skill: OVER_CUT, level: 1, useType: 2, castingTime: 45 });
  });

  it('USESKILL keeps an object ID that is NULL_ID as the unsigned value, and a signed casting time', () => {
    expect(readOne(MessageType.USESKILL, new ArWriter().u32(CLEAN_HIT).u32(1).u32(NULL_ID).i32(0).i32(-1).toBytes()))
      .toEqual({ type: 'useSkill', skill: CLEAN_HIT, level: 1, targetId: NULL_ID, useType: 0, castingTime: -1 });
  });

  it('CLEAR_USESKILL is OnClearUseSkill: no fields', () => {
    expect(readOne(MessageType.CLEAR_USESKILL, new Uint8Array(0))).toEqual({ type: 'clearUseSkill' });
  });

  it('ENDSKILLQUEUE is OnEndSkillQueue: no fields', () => {
    expect(readOne(MessageType.ENDSKILLQUEUE, new Uint8Array(0))).toEqual({ type: 'endSkillQueue' });
  });

  it('SETACTIONPOINT is OnSetActionPoint: the action points as an int, from a message about NULL_ID', () => {
    // int nAP; ar >> nAP;  CUser::AddSetActionPoint writes NULL_ID as the object ID (UserLux.cpp:206-214).
    expect(readOne(MessageType.SETACTIONPOINT, new ArWriter().i32(100).toBytes(), NULL_ID))
      .toEqual({ type: 'setActionPoint', actionPoint: 100 });
    expect(readOne(MessageType.SETACTIONPOINT, new ArWriter().i32(0).toBytes(), NULL_ID))
      .toEqual({ type: 'setActionPoint', actionPoint: 0 });
  });
});

describe('skill points', () => {
  it('DOUSESKILLPOINT is OnDoUseSkillPoint: the 45 skill and level pairs, then the skill points', () => {
    // for( i < MAX_SKILL_JOB ) ar >> dwSkill >> dwLevel; ar >> g_pPlayer->m_nSkillPoint;
    const skills = skillArray([
      { skill: CLEAN_HIT, level: 3 }, { skill: FLURRY, level: 1 }, { skill: OVER_CUT, level: 0 },
    ]);
    const fields = skillPairs(new ArWriter(), skills).i32(4).toBytes();
    expect(fields.byteLength).toBe(45 * 8 + 4);
    expect(readOne(MessageType.DOUSESKILLPOINT, fields)).toEqual({ type: 'doUseSkillPoint', skills, skillPoint: 4 });
  });

  it('DOUSESKILLPOINT keeps the empty slots as NULL_ID and the order of the slots', () => {
    const skills = skillArray([{ skill: OVER_CUT, level: 2 }, { skill: CLEAN_HIT, level: 9 }]);
    const message = readOne(MessageType.DOUSESKILLPOINT, skillPairs(new ArWriter(), skills).i32(0).toBytes());
    if (message.type !== 'doUseSkillPoint') throw new Error(`expected doUseSkillPoint, got ${message.type}`);
    expect(message.skills).toHaveLength(45);
    expect(message.skills[0]).toEqual({ skill: OVER_CUT, level: 2 });
    expect(message.skills[1]).toEqual({ skill: CLEAN_HIT, level: 9 });
    expect(message.skills[2]).toEqual({ skill: 0xffffffff, level: 0 });
    expect(message.skills[44]).toEqual({ skill: 0xffffffff, level: 0 });
  });

  it('DOUSESKILLPOINT reads the points as an int', () => {
    const fields = skillPairs(new ArWriter(), skillArray([])).i32(-1).toBytes();
    expect(readOne(MessageType.DOUSESKILLPOINT, fields)).toMatchObject({ skillPoint: -1 });
  });

  it('DOUSESKILLPOINT is dropped with 44 pairs, whatever follows', () => {
    const short = skillPairs(new ArWriter(), skillArray([]).slice(0, 44)).i32(4).toBytes();
    const result = readBundle(body([{ objectId: OBJ, type: MessageType.DOUSESKILLPOINT, fields: short }]), WORLD_READERS);
    expect(result.mismatched).toEqual([MessageType.DOUSESKILLPOINT]);
    expect(result.messages).toEqual([]);
  });

  it('INITSKILLPOINT is OnInitSkillPoint: the skill points as an int', () => {
    // int nSkillPoint; ar >> nSkillPoint;  (CUser::AddInitSkill writes m_nSkillPoint)
    expect(readOne(MessageType.INITSKILLPOINT, new ArWriter().i32(28).toBytes()))
      .toEqual({ type: 'initSkillPoint', skillPoint: 28 });
  });
});

describe('CREATESFXOBJ', () => {
  it('is OnCreateSfxObj: the effect, a position of three floats, then the flag as a BOOL', () => {
    // ar >> dwSfxObj >> x >> y >> z; ar >> bFlag;  (BOOL is 4 bytes)
    expect(readOne(MessageType.CREATESFXOBJ, new ArWriter().u32(108).vec3(pos).i32(0).toBytes()))
      .toEqual({ type: 'createSfxObj', sfxId: 108, pos, flag: 0 });
    expect(readOne(MessageType.CREATESFXOBJ, new ArWriter().u32(42).vec3(pos).i32(1).toBytes()))
      .toEqual({ type: 'createSfxObj', sfxId: 42, pos, flag: 1 });
  });

  it('gives a position of zeros as it is: the effect then goes on the object the message is about', () => {
    // `if( x || y || z )` makes the position absolute; AddCreateSfxObj defaults x, y, z and bFlag to 0 (User.h:864).
    expect(readOne(MessageType.CREATESFXOBJ, new ArWriter().u32(108).vec3([0, 0, 0]).i32(0).toBytes()))
      .toEqual({ type: 'createSfxObj', sfxId: 108, pos: [0, 0, 0], flag: 0 });
  });
});

/** Fields that each reader takes whole, for the tests that run over every type. */
const SAMPLES: [number, Uint8Array][] = [
  [MessageType.CREATESFXOBJ, new ArWriter().u32(108).vec3(pos).i32(0).toBytes()],
  [MessageType.USESKILL, new ArWriter().u32(CLEAN_HIT).u32(3).u32(0x4242).i32(0).i32(1).toBytes()],
  [MessageType.CLEAR_USESKILL, new Uint8Array(0)],
  [MessageType.INITSKILLPOINT, new ArWriter().i32(28).toBytes()],
  [MessageType.DOUSESKILLPOINT, skillPairs(new ArWriter(), skillArray([{ skill: CLEAN_HIT, level: 2 }])).i32(5).toBytes()],
  [MessageType.SETACTIONPOINT, new ArWriter().i32(11).toBytes()],
  [MessageType.ENDSKILLQUEUE, new Uint8Array(0)],
];

describe('WORLD_READERS for the skill messages', () => {
  it('has a reader for each type', () => {
    for (const [type] of SAMPLES) expect(WORLD_READERS.has(type), `type 0x${type.toString(16)}`).toBe(true);
  });

  it('reads a bundle of all of them in order, with and without the table of contents', () => {
    const messages = SAMPLES.map(([type, fields], i) => ({ objectId: 100 + i, type, fields }));
    for (const indexed of [true, false]) {
      const result = readBundle(body(messages, indexed), WORLD_READERS);
      expect(result.indexed).toBe(indexed);
      expect(result.skipped).toEqual([]);
      expect(result.mismatched).toEqual([]);
      expect(result.stoppedAt).toBeNull();
      expect(result.messages.map((m) => m.type)).toEqual(SAMPLES.map(([type]) => type));
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
      if (fields.byteLength === 0) continue; // CLEAR_USESKILL and ENDSKILLQUEUE have nothing to cut
      const shorter = fields.subarray(0, fields.byteLength - 1);
      const result = readBundle(body([{ objectId: OBJ, type, fields: shorter }]), WORLD_READERS);
      expect(result.mismatched, `type 0x${type.toString(16)}`).toEqual([type]);
      expect(result.messages).toEqual([]);
    }
  });
});
