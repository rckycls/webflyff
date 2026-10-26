import { describe, expect, it } from 'vitest';
import {
  ArWriter, AttackFlag, BUNDLE_MARKER, DstParam, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle,
} from '../src';
import type { Vec3, WorldMessage } from '../src';

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
 * it: nothing skipped or mismatched, and the same value both ways.
 */
function readOne(type: number, fields: Uint8Array): WorldMessage {
  const values: WorldMessage[] = [];
  for (const indexed of [true, false]) {
    const result = readBundle(body([{ objectId: OBJ, type, fields }], indexed), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ objectId: OBJ, type });
    values.push(result.messages[0].value);
  }
  expect(values[1]).toEqual(values[0]);
  return values[0];
}

// Every position and angle below is exactly representable as a float, so it reads back unchanged.
const pos: Vec3 = [6968.5, 100.25, 3328.5];

// The message types are checked against MsgHdr.h in world.test.ts, with the others.
describe('the values copied from the C++ headers', () => {
  it('the AF_* flags are those of ActionMover.h:27-44', () => {
    expect(AttackFlag).toEqual({
      GENERIC: 0x1, MISS: 0x2, MAGIC: 0x8, MELEESKILL: 0x10, MAGICSKILL: 0x20, CRITICAL1: 0x40, CRITICAL2: 0x80,
      CRITICAL: 0xc0, PUSH: 0x100, PARRY: 0x200, RESIST: 0x400, STUN: 0x800, BLOCKING: 0x1000, FORCE: 0x2000,
      RANGE: 0x4000, FLYING: 0x10000000,
    });
    expect(AttackFlag.CRITICAL).toBe(AttackFlag.CRITICAL1 | AttackFlag.CRITICAL2);
  });

  it('the points are DST_HP, DST_MP and DST_FP of defineAttribute.h', () => {
    expect(DstParam).toEqual({ HP: 38, MP: 39, FP: 40 });
  });
});

describe('combat messages', () => {
  it('MELEE_ATTACK is OnMeleeAttack: the OBJMSG, the target and two ints', () => {
    // ar >> dwAtkMsg >> id >> nParam2 >> nParam3;
    expect(readOne(MessageType.MELEE_ATTACK, new ArWriter().u32(29).u32(0xabcd).i32(0).i32(0x00010000).toBytes()))
      .toEqual({ type: 'meleeAttack', message: 29, targetId: 0xabcd, param2: 0, param3: 0x00010000 });
    // A monster's swing: AIMonster.cpp:1259-1305 sends MAKELONG( 0, nError ) as nParam3, and a param can be negative.
    expect(readOne(MessageType.MELEE_ATTACK, new ArWriter().u32(29).u32(NULL_ID).i32(-5).i32(0x20000).toBytes()))
      .toEqual({ type: 'meleeAttack', message: 29, targetId: NULL_ID, param2: -5, param3: 0x20000 });
  });

  it('DAMAGE without AF_FLYING is OnDamage: the attacker, the hit and the flags, with no position', () => {
    // ar >> objidAttacker >> dwHit; ar >> dwAtkFlags;
    const flags = AttackFlag.GENERIC | AttackFlag.CRITICAL1 | AttackFlag.CRITICAL2;
    expect(flags).toBe(0xc1);
    expect(readOne(MessageType.DAMAGE, new ArWriter().u32(0x77).u32(12).u32(flags).toBytes()))
      .toEqual({ type: 'damage', attackerId: 0x77, hit: 12, flags: 0xc1, fly: null });
    // A miss is a DAMAGE with dwHit 0 and AF_MISS (AttackArbiter.cpp:290-294).
    expect(readOne(MessageType.DAMAGE, new ArWriter().u32(0x77).u32(0).u32(AttackFlag.MISS).toBytes()))
      .toEqual({ type: 'damage', attackerId: 0x77, hit: 0, flags: 0x2, fly: null });
  });

  it('DAMAGE with AF_FLYING also reads the position and the angle', () => {
    // if( dwAtkFlags & AF_FLYING ) { ar >> vPos; ar >> fAngle; }
    const flags = AttackFlag.GENERIC | AttackFlag.FLYING;
    expect(readOne(MessageType.DAMAGE, new ArWriter().u32(0x77).u32(40).u32(flags).vec3(pos).f32(-135.5).toBytes()))
      .toEqual({ type: 'damage', attackerId: 0x77, hit: 40, flags: 0x10000001, fly: { pos, angle: -135.5 } });
  });

  it('DAMAGE keeps a hit and flags that do not fit an int as unsigned DWORDs', () => {
    expect(readOne(MessageType.DAMAGE, new ArWriter().u32(NULL_ID).u32(0xfffffff0).u32(0x8000).toBytes()))
      .toEqual({ type: 'damage', attackerId: NULL_ID, hit: 0xfffffff0, flags: 0x8000, fly: null });
  });

  it('MOVERDEATH is OnMoverDeath: the attacker and the OBJMSG', () => {
    // ar >> objidAttacker >> dwMsg;
    expect(readOne(MessageType.MOVERDEATH, new ArWriter().u32(0x77).u32(41).toBytes()))
      .toEqual({ type: 'moverDeath', attackerId: 0x77, message: 41 });
    expect(readOne(MessageType.MOVERDEATH, new ArWriter().u32(NULL_ID).u32(0).toBytes()))
      .toEqual({ type: 'moverDeath', attackerId: NULL_ID, message: 0 });
  });

  it('CORRREQ is OnCorrReq: the position and the attacker', () => {
    // ar >> vPos >> idAttacker;
    expect(readOne(MessageType.CORRREQ, new ArWriter().vec3(pos).u32(0x77).toBytes()))
      .toEqual({ type: 'corrReq', pos, attackerId: 0x77 });
  });

  it('REVIVAL and REVIVAL_TO_LODESTAR are OnRevival and OnRevivalLodestar: no fields', () => {
    expect(readOne(MessageType.REVIVAL, new Uint8Array(0))).toEqual({ type: 'revival' });
    expect(readOne(MessageType.REVIVAL_TO_LODESTAR, new Uint8Array(0))).toEqual({ type: 'revivalToLodestar' });
  });

  it('QUERYGETDESTOBJ is OnQueryGetDestObj: the object to answer for', () => {
    // ar >> objid;
    expect(readOne(MessageType.QUERYGETDESTOBJ, new ArWriter().u32(0x4242).toBytes()))
      .toEqual({ type: 'queryGetDestObj', fromId: 0x4242 });
  });
});

describe('number messages', () => {
  it('SETPOINTPARAM is OnSetPointParam: the DST_* and the absolute value, both ints', () => {
    // ar >> nDstParameter >> nValue;
    expect(readOne(MessageType.SETPOINTPARAM, new ArWriter().i32(DstParam.HP).i32(230).toBytes()))
      .toEqual({ type: 'setPointParam', param: 38, value: 230 });
    expect(readOne(MessageType.SETPOINTPARAM, new ArWriter().i32(DstParam.MP).i32(0).toBytes()))
      .toEqual({ type: 'setPointParam', param: 39, value: 0 });
    expect(readOne(MessageType.SETPOINTPARAM, new ArWriter().i32(DstParam.FP).i32(-3).toBytes()))
      .toEqual({ type: 'setPointParam', param: 40, value: -3 });
  });

  it('SETEXPERIENCE is OnSetExperience: EXP, level, skill level, skill points, death EXP and death level', () => {
    // ar >> nExp1 >> wLevel; ar >> nSkillLevel >> nSkillPoint >> nDeathExp >> wDeathLevel;
    const fields = new ArWriter().i64(1234n).u16(5).i32(1).i32(3).i64(77n).u16(4).toBytes();
    expect(readOne(MessageType.SETEXPERIENCE, fields)).toEqual({
      type: 'setExperience', exp: 1234n, level: 5, skillLevel: 1, skillPoint: 3, deathExp: 77n, deathLevel: 4,
    });
  });

  it('SETEXPERIENCE gives the defaults of AddSetExperience through unchanged: EXPINTEGER -1 and 0xffff', () => {
    // User.h:494: EXPINTEGER nDeathExp = (EXPINTEGER)-1, WORD wDeathLevel = 0xffff. Neuz keeps the old value for them.
    const fields = new ArWriter().i64(0n).u16(1).i32(0).i32(0).i64(-1n).u16(0xffff).toBytes();
    expect(readOne(MessageType.SETEXPERIENCE, fields)).toEqual({
      type: 'setExperience', exp: 0n, level: 1, skillLevel: 0, skillPoint: 0, deathExp: -1n, deathLevel: 0xffff,
    });
  });

  it('SETEXPERIENCE keeps a 64-bit EXP whole', () => {
    const exp = 9007199254740993n; // 2^53 + 1, which a double cannot hold
    const fields = new ArWriter().i64(exp).u16(15).i32(0).i32(2).i64(exp + 1n).u16(14).toBytes();
    expect(readOne(MessageType.SETEXPERIENCE, fields)).toEqual({
      type: 'setExperience', exp, level: 15, skillLevel: 0, skillPoint: 2, deathExp: exp + 1n, deathLevel: 14,
    });
  });

  it('SETLEVEL is OnSetLevel: the level as a WORD', () => {
    // ar >> wLevel;
    expect(readOne(MessageType.SETLEVEL, new ArWriter().u16(15).toBytes())).toEqual({ type: 'setLevel', level: 15 });
  });

  it('SET_GROWTH_LEARNING_POINT is OnSetGrowthLearningPoint: the stat points, then a long that is not used', () => {
    // long nRemainGP, nRemainLP; ar >> nRemainGP >> nRemainLP;  (a long is 4 bytes in CAr)
    expect(readOne(MessageType.SET_GROWTH_LEARNING_POINT, new ArWriter().i32(28).i32(0).toBytes()))
      .toEqual({ type: 'setGrowthLearningPoint', remainGP: 28 });
    expect(readOne(MessageType.SET_GROWTH_LEARNING_POINT, new ArWriter().i32(-1).i32(99).toBytes()))
      .toEqual({ type: 'setGrowthLearningPoint', remainGP: -1 });
  });

  it('SETSTATE is OnSetState: STR, STA, DEX, INT, a long that is not used, then the stat points', () => {
    // ar >> m_nStr >> m_nSta >> m_nDex >> m_nInt; ar >> nRemainLP >> m_nRemainGP;  (all LONG)
    const fields = new ArWriter().i32(16).i32(17).i32(18).i32(19).i32(0).i32(21).toBytes();
    expect(readOne(MessageType.SETSTATE, fields))
      .toEqual({ type: 'setState', str: 16, sta: 17, dex: 18, int: 19, remainGP: 21 });
    // The unused long is read and dropped, whatever it holds.
    const odd = new ArWriter().i32(1).i32(2).i32(3).i32(4).i32(0x7fffffff).i32(0).toBytes();
    expect(readOne(MessageType.SETSTATE, odd))
      .toEqual({ type: 'setState', str: 1, sta: 2, dex: 3, int: 4, remainGP: 0 });
  });
});

describe('text messages', () => {
  it('DEFINEDTEXT is OnDefinedText: the text ID, then the arguments as a string', () => {
    // ar >> dwText; ar.ReadString( lpString, 1024 );
    expect(readOne(MessageType.DEFINEDTEXT, new ArWriter().i32(0x1234).string('Aibatt 12').toBytes()))
      .toEqual({ type: 'definedText', textId: 0x1234, args: 'Aibatt 12' });
    expect(readOne(MessageType.DEFINEDTEXT, new ArWriter().i32(7).string('').toBytes()))
      .toEqual({ type: 'definedText', textId: 7, args: '' });
  });

  it('DEFINEDTEXT reads a string as long as the C++ buffer holds, 1023 bytes, and no longer', () => {
    const longest = 'x'.repeat(1023);
    expect(readOne(MessageType.DEFINEDTEXT, new ArWriter().i32(7).string(longest).toBytes()))
      .toEqual({ type: 'definedText', textId: 7, args: longest });
    const tooLong = readBundle(
      body([{ objectId: OBJ, type: MessageType.DEFINEDTEXT, fields: new ArWriter().i32(7).string('x'.repeat(1024)).toBytes() }]),
      WORLD_READERS,
    );
    expect(tooLong.mismatched).toEqual([MessageType.DEFINEDTEXT]);
    expect(tooLong.messages).toEqual([]);
  });

  it('DEFINEDTEXT1 is OnDefinedText1: only the text ID, and no string at all (null), as the text is shown unformatted', () => {
    // ar >> dwText;
    expect(readOne(MessageType.DEFINEDTEXT1, new ArWriter().i32(0x1234).toBytes()))
      .toEqual({ type: 'definedText', textId: 0x1234, args: null });
  });
});

describe('MONSTERPROP', () => {
  const rate = (name: string, base: number) => ({
    name, hitPoint: base, attackPower: base + 1, defence: base + 2, exp: base + 3, itemDrop: base + 4, penya: base + 5,
  });
  const rateFields = (w: ArWriter, r: ReturnType<typeof rate>) => w.string(r.name).i32(r.hitPoint).i32(r.attackPower)
    .i32(r.defence).i32(r.exp).i32(r.itemDrop).i32(r.penya);

  it('is OnMonsterProp: the rates of two monsters, then the name of one that was removed', () => {
    // ar >> nMonsterPropSize; per entry: ReadString( szMonsterName, 32 ) and nHitPoint, nAttackPower, nDefence, nExp,
    // nItemDrop, nPenya; then ar >> nRemovePropSize and per name ReadString( szMonsterName, 32 );
    const aibatt = rate('Aibatt', 100);
    const mushpang = rate('Mushpang', 250);
    const w = new ArWriter().i32(2);
    rateFields(w, aibatt);
    rateFields(w, mushpang);
    w.i32(1).string('Burudeng');
    expect(readOne(MessageType.MONSTERPROP, w.toBytes())).toEqual({
      type: 'monsterProp', rates: [aibatt, mushpang], removed: ['Burudeng'],
    });
  });

  it('reads the six rates in the order of the C++, as the percent the server holds', () => {
    const w = new ArWriter().i32(1).string('Aibatt').i32(1).i32(2).i32(3).i32(4).i32(5).i32(6).i32(0);
    expect(readOne(MessageType.MONSTERPROP, w.toBytes())).toEqual({
      type: 'monsterProp', removed: [],
      rates: [{ name: 'Aibatt', hitPoint: 1, attackPower: 2, defence: 3, exp: 4, itemDrop: 5, penya: 6 }],
    });
  });

  it('reads two empty lists, which is what the world server sends when no rate is set', () => {
    expect(readOne(MessageType.MONSTERPROP, new ArWriter().i32(0).i32(0).toBytes()))
      .toEqual({ type: 'monsterProp', rates: [], removed: [] });
  });

  it('reads only removed names', () => {
    expect(readOne(MessageType.MONSTERPROP, new ArWriter().i32(0).i32(2).string('Aibatt').string('Mushpang').toBytes()))
      .toEqual({ type: 'monsterProp', rates: [], removed: ['Aibatt', 'Mushpang'] });
  });

  it('takes a name of up to 31 bytes, the char[32] with its terminator, and drops one of 32', () => {
    const longest = 'M'.repeat(31);
    expect(readOne(MessageType.MONSTERPROP, rateFields(new ArWriter().i32(1), rate(longest, 0)).i32(0).toBytes()))
      .toMatchObject({ type: 'monsterProp', rates: [{ name: longest }] });
    for (const fields of [
      rateFields(new ArWriter().i32(1), rate('M'.repeat(32), 0)).i32(0).toBytes(),
      new ArWriter().i32(0).i32(1).string('M'.repeat(32)).toBytes(),
    ]) {
      const result = readBundle(body([{ objectId: OBJ, type: MessageType.MONSTERPROP, fields }]), WORLD_READERS);
      expect(result.mismatched).toEqual([MessageType.MONSTERPROP]);
      expect(result.messages).toEqual([]);
    }
  });

  it('is dropped when a count promises more entries than the message holds', () => {
    const fields = rateFields(new ArWriter().i32(3), rate('Aibatt', 0)).i32(0).toBytes();
    const result = readBundle(body([{ objectId: OBJ, type: MessageType.MONSTERPROP, fields }]), WORLD_READERS);
    expect(result.mismatched).toEqual([MessageType.MONSTERPROP]);
  });
});

/** Fields that each reader takes whole, for the tests that run over every type. */
const SAMPLES: [number, Uint8Array][] = [
  [MessageType.MELEE_ATTACK, new ArWriter().u32(29).u32(1).i32(0).i32(0x10000).toBytes()],
  [MessageType.DAMAGE, new ArWriter().u32(1).u32(5).u32(AttackFlag.GENERIC).toBytes()],
  [MessageType.DAMAGE, new ArWriter().u32(1).u32(5).u32(AttackFlag.FLYING).vec3(pos).f32(1).toBytes()],
  [MessageType.MOVERDEATH, new ArWriter().u32(1).u32(41).toBytes()],
  [MessageType.SETPOINTPARAM, new ArWriter().i32(38).i32(10).toBytes()],
  [MessageType.SETEXPERIENCE, new ArWriter().i64(1n).u16(1).i32(0).i32(0).i64(-1n).u16(0xffff).toBytes()],
  [MessageType.SETLEVEL, new ArWriter().u16(2).toBytes()],
  [MessageType.SET_GROWTH_LEARNING_POINT, new ArWriter().i32(2).i32(0).toBytes()],
  [MessageType.SETSTATE, new ArWriter().i32(1).i32(2).i32(3).i32(4).i32(0).i32(5).toBytes()],
  [MessageType.CORRREQ, new ArWriter().vec3(pos).u32(1).toBytes()],
  [MessageType.REVIVAL, new Uint8Array(0)],
  [MessageType.REVIVAL_TO_LODESTAR, new Uint8Array(0)],
  [MessageType.DEFINEDTEXT, new ArWriter().i32(1).string('a b').toBytes()],
  [MessageType.DEFINEDTEXT1, new ArWriter().i32(1).toBytes()],
  [MessageType.QUERYGETDESTOBJ, new ArWriter().u32(1).toBytes()],
  [
    MessageType.MONSTERPROP,
    new ArWriter().i32(1).string('Aibatt').i32(1).i32(2).i32(3).i32(4).i32(5).i32(6).i32(1).string('Mushpang').toBytes(),
  ],
];

describe('WORLD_READERS for the combat, number and text messages', () => {
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
      if (fields.byteLength === 0) continue; // REVIVAL and REVIVAL_TO_LODESTAR have nothing to cut
      const shorter = fields.subarray(0, fields.byteLength - 1);
      const result = readBundle(body([{ objectId: OBJ, type, fields: shorter }]), WORLD_READERS);
      expect(result.mismatched, `type 0x${type.toString(16)}`).toEqual([type]);
      expect(result.messages).toEqual([]);
    }
  });

  it('drops a DAMAGE with AF_FLYING in its flags but no position after them', () => {
    const fields = new ArWriter().u32(1).u32(5).u32(AttackFlag.FLYING).toBytes();
    const result = readBundle(body([{ objectId: OBJ, type: MessageType.DAMAGE, fields }]), WORLD_READERS);
    expect(result.mismatched).toEqual([MessageType.DAMAGE]);
  });
});
