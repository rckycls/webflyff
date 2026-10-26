import { expect, it } from 'vitest';
import {
  ArWriter, AttackFlag, BUNDLE_MARKER, DstParam, MessageType, NULL_ID, PacketType, ShortcutKind, WORLD_READERS,
  bytesToHex, readBundle,
} from '@flyffweb/protocol';
import type {
  AddedMover, MessageReader, MonsterRate, MoveReport, OwnCharacter, Shortcut, SkillSlot, TaskBar, Vec3, WorldMessage,
} from '@flyffweb/protocol';
import {
  GAMETIMER, encodeBundle, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf, writeCorrReq, writeDamage,
  writeDefinedText, writeDelObj, writeDestAngle, writeDestPos, writeEnvironmentSetting, writeGameTimer,
  writeMeleeAttack, writeMonsterProp, writeMotion, writeMoverAngle, writeMoverBehavior, writeMoverCorr,
  writeMoverDeath, writeMoverMoved, writeQueryGetDestObj, writeReplace, writeRevival, writeRevivalToLodestar,
  writeSetDestObj, writeSetExperience, writeSetGrowthLearningPoint, writeSetLevel, writeSetPointParam, writeSetPos,
  writeSetPosAngle, writeSetState, writeTaskBar, writeWorldReadInfo,
} from '../src';

it('encodeBundle writes the table', () => {
  const bytes = encodeBundle(PacketType.SNAPSHOT, 0x1234, [
    { objectId: 7, type: MessageType.MOVERMOVED, fields: new Uint8Array([1, 2, 3, 4]) },
    { objectId: 8, type: MessageType.DEL_OBJ, fields: new Uint8Array(0) },
  ]);
  expect(bytesToHex(bytes)).toBe([
    '00ffffff', '34120000', '0200', // type SNAPSHOT, player object ID, count
    '07000000', 'ca00', '01020304', // message 0, 10 bytes
    '08000000', 'f100', // message 1, 6 bytes
    '00000000', '0a000000', // starts: 0 and 10, counted from byte 10
    '0200', '544f4331', // count again, the marker "TOC1"
  ].join(''));
  expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.byteLength - 4, true))
    .toBe(BUNDLE_MARKER);
});

it('writes the table by default and no trailer without index', () => {
  const messages = [{ objectId: 7, type: 0xca, fields: new Uint8Array([1, 2, 3, 4]) }];
  const indexed = encodeBundle(PacketType.JOIN, 1, messages);
  const plain = encodeBundle(PacketType.JOIN, 1, messages, { index: false });
  expect(indexed.byteLength).toBe(plain.byteLength + 4 + 2 + 4); // one start, the count, the marker
  expect(bytesToHex(indexed.subarray(0, plain.byteLength))).toBe(bytesToHex(plain));
  expect(bytesToHex(plain)).toBe('00ff0000' + '01000000' + '0100' + '07000000' + 'ca00' + '01020304');
  expect(bytesToHex(encodeBundle(PacketType.JOIN, 1, messages, { index: true }))).toBe(bytesToHex(indexed));
});

it('writes the trailer of a bundle with no messages', () => {
  expect(bytesToHex(encodeBundle(PacketType.SNAPSHOT, 5, []))).toBe('00ffffff' + '05000000' + '0000' + '0000' + '544f4331');
  expect(bytesToHex(encodeBundle(PacketType.SNAPSHOT, 5, [], { index: false }))).toBe('00ffffff' + '05000000' + '0000');
});

it('refuses more messages than the i16 count holds', () => {
  const many = Array.from({ length: 0x8000 }, () => ({ objectId: 1, type: 1, fields: new Uint8Array(0) }));
  expect(() => encodeBundle(PacketType.SNAPSHOT, 1, many)).toThrow();
});

it('what it writes is read back by readBundle, with and without the table', () => {
  const readers = new Map<number, MessageReader<number>>([[MessageType.MOVERMOVED, (r) => r.u32()]]);
  const messages = [
    { objectId: 7, type: MessageType.MOVERMOVED, fields: new ArWriter().u32(99).toBytes() },
    { objectId: 8, type: MessageType.DEL_OBJ, fields: new Uint8Array(0) },
  ];
  const indexed = readBundle(encodeBundle(PacketType.SNAPSHOT, 3, messages), readers);
  expect(indexed).toMatchObject({
    playerObjectId: 3, indexed: true, skipped: [MessageType.DEL_OBJ], mismatched: [], stoppedAt: null,
    messages: [{ objectId: 7, type: MessageType.MOVERMOVED, value: 99 }],
  });
  const plain = readBundle(encodeBundle(PacketType.SNAPSHOT, 3, messages, { index: false }), readers);
  expect(plain).toMatchObject({
    indexed: false, stoppedAt: MessageType.DEL_OBJ, messages: [{ objectId: 7, value: 99 }],
  });
});

// Positions, deltas and angles are exactly representable as floats, so they read back unchanged.
const pos: Vec3 = [6968.5, 100.25, 3328.5];
const delta: Vec3 = [0.5, 0, -1.25];
const move: MoveReport = {
  pos, delta, angle: 90.5, state: 0x11, stateFlag: 0x2, motion: 0x15, motionEx: -1, loop: 3, motionOption: 4,
  tick: 123456789012n,
};

const rates: MonsterRate[] = [
  { name: 'Aibatt', hitPoint: 100, attackPower: 101, defence: 102, exp: 103, itemDrop: 104, penya: 105 },
  { name: 'Mushpang', hitPoint: 250, attackPower: 50, defence: 100, exp: 400, itemDrop: 0, penya: 100 },
];

const shortcut = (
  kind: number, id: number, type: number, index: number, userId: number, data: number, text = '',
): Shortcut => ({ kind, id, type, index, userId, data, text });
const noShortcut = shortcut(ShortcutKind.NONE, 0, 0, 0, 0, 0);

/** The bar `BASE_VALUE_TBL` gives a new character (`Database.sql:2741-2742`, both sexes). */
const newCharacterBar: TaskBar = {
  applets: [
    { slot: 0, shortcut: shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0) },
    { slot: 1, shortcut: shortcut(ShortcutKind.APPLET, 398, 0, 1, 0, 0) },
    { slot: 2, shortcut: shortcut(ShortcutKind.APPLET, 2010, 0, 2, 0, 0) },
    { slot: 3, shortcut: shortcut(ShortcutKind.APPLET, 581, 0, 3, 0, 0) },
    { slot: 4, shortcut: shortcut(ShortcutKind.MOTION, 25, 0, 4, 0, 0) },
  ],
  items: [
    { bar: 0, slot: 0, shortcut: shortcut(ShortcutKind.ITEM, 45, 0, 0, 0, 1) },
    { bar: 0, slot: 1, shortcut: shortcut(ShortcutKind.ITEM, 1, 0, 1, 0, 1) },
    { bar: 0, slot: 2, shortcut: shortcut(ShortcutKind.MOTION, 3, 0, 2, 0, 1) },
    { bar: 0, slot: 8, shortcut: shortcut(ShortcutKind.MOTION, 2, 0, 8, 0, 1) },
  ],
  queue: [],
  actionPoint: 0,
};
/** A character who has used the bars: a chat shortcut in an applet slot and on a later bar, and two queued skills. */
const busyBar: TaskBar = {
  applets: [
    { slot: 0, shortcut: shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0) },
    { slot: 17, shortcut: shortcut(ShortcutKind.CHAT, 0, 0, 17, 0, 0, '/s Hello there') },
  ],
  items: [
    { bar: 0, slot: 0, shortcut: shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 1) },
    { bar: 7, slot: 8, shortcut: shortcut(ShortcutKind.CHAT, 0, 0, 8, 0, 1, '/p Party up?') },
  ],
  queue: [shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 2), shortcut(ShortcutKind.SKILL, 1, 0, 1, 0, 2)],
  actionPoint: 11,
};

it('every writer decodes to what it was given', () => {
  // One entry per writer: the message it makes, the type it must carry and what the reader must make of it.
  const cases: [string, ReturnType<typeof writeMoverMoved>, number, WorldMessage][] = [
    ['writeMoverMoved', writeMoverMoved(11, move), MessageType.MOVERMOVED, { type: 'moverMoved', move }],
    ['writeMoverBehavior', writeMoverBehavior(12, move), MessageType.MOVERBEHAVIOR, { type: 'moverBehavior', move }],
    ['writeMoverCorr', writeMoverCorr(26, move), MessageType.MOVERCORR, { type: 'moverCorr', move }],
    [
      'writeMoverAngle', writeMoverAngle(13, pos, delta, 45.5, -10.25, 0.75, 2.5, 555n), MessageType.MOVERANGLE,
      { type: 'moverAngle', pos, delta, angle: 45.5, angleX: -10.25, accPower: 0.75, turnAngle: 2.5, tick: 555n },
    ],
    ['writeDestPos', writeDestPos(14, pos, true), MessageType.DESTPOS, { type: 'destPos', pos, forward: true }],
    ['writeDestPos (backward)', writeDestPos(15, pos, false), MessageType.DESTPOS, { type: 'destPos', pos, forward: false }],
    ['writeDestAngle', writeDestAngle(16, 135.5, true), MessageType.DESTANGLE, { type: 'destAngle', angle: 135.5, left: true }],
    [
      'writeDestAngle (right)', writeDestAngle(17, -45.25, false), MessageType.DESTANGLE,
      { type: 'destAngle', angle: -45.25, left: false },
    ],
    [
      'writeSetDestObj', writeSetDestObj(18, 0xabcd, 3.5), MessageType.MOVERSETDESTOBJ,
      { type: 'setDestObj', targetId: 0xabcd, range: 3.5 },
    ],
    ['writeMotion', writeMotion(19, 0x2a), MessageType.MOTION, { type: 'motion', message: 0x2a }],
    ['writeSetPos', writeSetPos(20, pos), MessageType.SETPOS, { type: 'setPos', pos }],
    ['writeSetPosAngle', writeSetPosAngle(21, pos, -90.5), MessageType.SETPOSANGLE, { type: 'setPosAngle', pos, angle: -90.5 }],
    ['writeDelObj', writeDelObj(22), MessageType.DEL_OBJ, { type: 'delObj' }],
    ['writeWorldReadInfo', writeWorldReadInfo(23, 1, pos), MessageType.WORLD_READINFO, { type: 'worldReadInfo', worldId: 1, pos }],
    ['writeReplace', writeReplace(24, 0x2a, pos), MessageType.REPLACE, { type: 'replace', worldId: 0x2a, pos }],
    [
      'writeEnvironmentSetting', writeEnvironmentSetting(25, 3), MessageType.ENVIRONMENTALL,
      { type: 'environmentSetting', season: 3 },
    ],
    [
      'writeMeleeAttack', writeMeleeAttack(40, 29, 0xabcd, 0, 0x00010000), MessageType.MELEE_ATTACK,
      { type: 'meleeAttack', message: 29, targetId: 0xabcd, param2: 0, param3: 0x00010000 },
    ],
    [
      'writeDamage', writeDamage(41, 0x77, 12, AttackFlag.GENERIC | AttackFlag.CRITICAL), MessageType.DAMAGE,
      { type: 'damage', attackerId: 0x77, hit: 12, flags: 0xc1, fly: null },
    ],
    [
      'writeDamage (miss)', writeDamage(42, 0x77, 0, AttackFlag.MISS), MessageType.DAMAGE,
      { type: 'damage', attackerId: 0x77, hit: 0, flags: 0x2, fly: null },
    ],
    [
      'writeDamage (flying)', writeDamage(43, 0x77, 40, AttackFlag.GENERIC | AttackFlag.FLYING, { pos, angle: -135.5 }),
      MessageType.DAMAGE,
      { type: 'damage', attackerId: 0x77, hit: 40, flags: 0x10000001, fly: { pos, angle: -135.5 } },
    ],
    [
      'writeMoverDeath', writeMoverDeath(44, 0x77, 41), MessageType.MOVERDEATH,
      { type: 'moverDeath', attackerId: 0x77, message: 41 },
    ],
    [
      'writeMoverDeath (no attacker)', writeMoverDeath(45, NULL_ID, 0), MessageType.MOVERDEATH,
      { type: 'moverDeath', attackerId: NULL_ID, message: 0 },
    ],
    [
      'writeSetPointParam', writeSetPointParam(46, DstParam.FP, 32), MessageType.SETPOINTPARAM,
      { type: 'setPointParam', param: 40, value: 32 },
    ],
    [
      'writeSetExperience', writeSetExperience(47, 1234n, 5, 1, 3, 77n, 4), MessageType.SETEXPERIENCE,
      { type: 'setExperience', exp: 1234n, level: 5, skillLevel: 1, skillPoint: 3, deathExp: 77n, deathLevel: 4 },
    ],
    [
      'writeSetExperience (the defaults of AddSetExperience)', writeSetExperience(48, 14n, 2, 0, 0),
      MessageType.SETEXPERIENCE,
      { type: 'setExperience', exp: 14n, level: 2, skillLevel: 0, skillPoint: 0, deathExp: -1n, deathLevel: 0xffff },
    ],
    ['writeSetLevel', writeSetLevel(49, 15), MessageType.SETLEVEL, { type: 'setLevel', level: 15 }],
    [
      'writeSetGrowthLearningPoint', writeSetGrowthLearningPoint(50, 28), MessageType.SET_GROWTH_LEARNING_POINT,
      { type: 'setGrowthLearningPoint', remainGP: 28 },
    ],
    [
      'writeSetState', writeSetState(51, 16, 17, 18, 19, 21), MessageType.SETSTATE,
      { type: 'setState', str: 16, sta: 17, dex: 18, int: 19, remainGP: 21 },
    ],
    ['writeCorrReq', writeCorrReq(52, pos, 0x77), MessageType.CORRREQ, { type: 'corrReq', pos, attackerId: 0x77 }],
    ['writeRevival', writeRevival(53), MessageType.REVIVAL, { type: 'revival' }],
    [
      'writeRevivalToLodestar', writeRevivalToLodestar(54), MessageType.REVIVAL_TO_LODESTAR,
      { type: 'revivalToLodestar' },
    ],
    [
      'writeDefinedText', writeDefinedText(55, 0x1234, 'Aibatt 12'), MessageType.DEFINEDTEXT,
      { type: 'definedText', textId: 0x1234, args: 'Aibatt 12' },
    ],
    [
      'writeDefinedText (empty arguments)', writeDefinedText(56, 7, ''), MessageType.DEFINEDTEXT,
      { type: 'definedText', textId: 7, args: '' },
    ],
    [
      'writeDefinedText (no arguments: DEFINEDTEXT1)', writeDefinedText(57, 0x1234), MessageType.DEFINEDTEXT1,
      { type: 'definedText', textId: 0x1234, args: null },
    ],
    [
      'writeQueryGetDestObj', writeQueryGetDestObj(58, 0x4242), MessageType.QUERYGETDESTOBJ,
      { type: 'queryGetDestObj', fromId: 0x4242 },
    ],
    [
      'writeMonsterProp', writeMonsterProp(59, rates, ['Burudeng']), MessageType.MONSTERPROP,
      { type: 'monsterProp', rates, removed: ['Burudeng'] },
    ],
    [
      'writeMonsterProp (empty lists)', writeMonsterProp(NULL_ID, [], []), MessageType.MONSTERPROP,
      { type: 'monsterProp', rates: [], removed: [] },
    ],
    [
      "writeTaskBar (a new character's)", writeTaskBar(60, newCharacterBar), MessageType.TASKBAR,
      { type: 'taskBar', taskBar: newCharacterBar },
    ],
    [
      'writeTaskBar (chat shortcuts and a queue)', writeTaskBar(61, busyBar), MessageType.TASKBAR,
      { type: 'taskBar', taskBar: busyBar },
    ],
    [
      'writeTaskBar (nothing on it)', writeTaskBar(62, { applets: [], items: [], queue: [], actionPoint: 0 }),
      MessageType.TASKBAR, { type: 'taskBar', taskBar: { applets: [], items: [], queue: [], actionPoint: 0 } },
    ],
  ];
  for (const [name, message, type, expected] of cases) {
    expect(message.type, name).toBe(type);
    for (const index of [true, false]) {
      const result = readBundle(encodeBundle(PacketType.SNAPSHOT, 7, [message], { index }), WORLD_READERS);
      expect(result.skipped, name).toEqual([]);
      expect(result.mismatched, name).toEqual([]);
      expect(result.messages, name).toEqual([{ objectId: message.objectId, type, value: expected }]);
    }
  }
  // All of them in one bundle, as a JOIN or SNAPSHOT carries them.
  const all = readBundle(encodeBundle(PacketType.JOIN, 7, cases.map(([, message]) => message)), WORLD_READERS);
  expect(all.mismatched).toEqual([]);
  expect(all.messages.map((m) => m.value)).toEqual(cases.map(([, , , expected]) => expected));
});

it('writes the fields in the order of the C++ handlers', () => {
  expect(bytesToHex(writeDestPos(1, [1, 2, 3], true).fields))
    .toBe(bytesToHex(new ArWriter().vec3([1, 2, 3]).u8(1).toBytes()));
  expect(bytesToHex(writeDestAngle(1, 2.5, true).fields)).toBe(bytesToHex(new ArWriter().f32(2.5).u8(1).toBytes()));
  expect(bytesToHex(writeSetDestObj(1, 9, 2.5).fields)).toBe(bytesToHex(new ArWriter().u32(9).f32(2.5).toBytes()));
  expect(bytesToHex(writeReplace(1, 5, [1, 2, 3]).fields))
    .toBe(bytesToHex(new ArWriter().u32(5).vec3([1, 2, 3]).toBytes()));
  expect(writeDelObj(3)).toEqual({ objectId: 3, type: MessageType.DEL_OBJ, fields: new Uint8Array(0) });
  expect(bytesToHex(writeEnvironmentSetting(1, 4).fields)).toBe(bytesToHex(new ArWriter().i32(4).toBytes()));
});

it('writes the combat, number and text messages in the order the CUser::Add* and CUserMng::Add* functions do', () => {
  const hex = (w: ArWriter) => bytesToHex(w.toBytes());
  // CUserMng::AddMeleeAttack: ar << dwAtkMsg << objid << nParam2 << nParam3;
  expect(bytesToHex(writeMeleeAttack(1, 29, 9, -1, 2).fields)).toBe(hex(new ArWriter().u32(29).u32(9).i32(-1).i32(2)));
  // CUserMng::AddDamage: ar << objidAttacker << dwHit; ar << dwAtkFlags; then, with AF_FLYING, the position and angle.
  expect(bytesToHex(writeDamage(1, 9, 5, 1).fields)).toBe(hex(new ArWriter().u32(9).u32(5).u32(1)));
  expect(bytesToHex(writeDamage(1, 9, 5, 0x10000001, { pos: [1, 2, 3], angle: 4 }).fields))
    .toBe(hex(new ArWriter().u32(9).u32(5).u32(0x10000001).vec3([1, 2, 3]).f32(4)));
  // CUserMng::AddMoverDeath: ar << GETID( pAttacker ) << dwMsg;
  expect(bytesToHex(writeMoverDeath(1, 9, 41).fields)).toBe(hex(new ArWriter().u32(9).u32(41)));
  // CUserMng::AddSetPointParam: ar << nDstParameter << nValue;
  expect(bytesToHex(writeSetPointParam(1, 38, 230).fields)).toBe(hex(new ArWriter().i32(38).i32(230)));
  // CUser::AddSetExperience: ar << nExp1 << wLevel; ar << nSkillLevel << nSkillPoint; ar << nDeathExp << wDeathLevel;
  expect(bytesToHex(writeSetExperience(1, 5n, 2, 7, 8, 9n, 3).fields))
    .toBe(hex(new ArWriter().i64(5n).u16(2).i32(7).i32(8).i64(9n).u16(3)));
  expect(bytesToHex(writeSetExperience(1, 5n, 2, 7, 8).fields))
    .toBe(hex(new ArWriter().i64(5n).u16(2).i32(7).i32(8).i64(-1n).u16(0xffff)));
  // CUserMng::AddSetLevel: ar << wLevel;
  expect(bytesToHex(writeSetLevel(1, 15).fields)).toBe(hex(new ArWriter().u16(15)));
  // CUser::AddSetGrowthLearningPoint: ar << nRemainGP << (long)0;
  expect(bytesToHex(writeSetGrowthLearningPoint(1, 28).fields)).toBe(hex(new ArWriter().i32(28).i32(0)));
  // CUser::AddSetState: ar << nStr << nSta << nDex << nInt; ar << (LONG)0 << nGP;
  expect(bytesToHex(writeSetState(1, 1, 2, 3, 4, 5).fields)).toBe(hex(new ArWriter().i32(1).i32(2).i32(3).i32(4).i32(0).i32(5)));
  // CUser::AddCorrReq: ar << pMover->GetPos(); ar << pMover->m_idAttacker;
  expect(bytesToHex(writeCorrReq(1, [1, 2, 3], 9).fields)).toBe(hex(new ArWriter().vec3([1, 2, 3]).u32(9)));
  // CUserMng::AddHdr: nothing after the header.
  expect(writeRevival(3)).toEqual({ objectId: 3, type: MessageType.REVIVAL, fields: new Uint8Array(0) });
  expect(writeRevivalToLodestar(3)).toEqual({ objectId: 3, type: MessageType.REVIVAL_TO_LODESTAR, fields: new Uint8Array(0) });
  // CUser::AddDefinedText( dwText, lpszFormat, ... ): ar << dwText; ar.WriteString( szBuffer ); and
  // CUser::AddDefinedText( dwText ): ar << dwText.
  expect(bytesToHex(writeDefinedText(1, 9, 'a b').fields)).toBe(hex(new ArWriter().i32(9).string('a b')));
  expect(writeDefinedText(1, 9, 'a b').type).toBe(MessageType.DEFINEDTEXT);
  expect(bytesToHex(writeDefinedText(1, 9).fields)).toBe(hex(new ArWriter().i32(9)));
  expect(writeDefinedText(1, 9).type).toBe(MessageType.DEFINEDTEXT1);
  // CUser::AddQueryGetDestObj: ar << idFrom;
  expect(bytesToHex(writeQueryGetDestObj(1, 9).fields)).toBe(hex(new ArWriter().u32(9)));
  // CUser::AddMonsterProp: the count, per entry the name and the six rates, the count of removed names and the names.
  expect(bytesToHex(writeMonsterProp(1, [{
    name: 'Ai', hitPoint: 1, attackPower: 2, defence: 3, exp: 4, itemDrop: 5, penya: 6,
  }], ['Mu']).fields)).toBe(hex(new ArWriter().i32(1).string('Ai').i32(1).i32(2).i32(3).i32(4).i32(5).i32(6)
    .i32(1).string('Mu')));
});

it('writes the task bar in the order of CUserTaskBar::Serialize', () => {
  const hex = (w: ArWriter) => bytesToHex(w.toBytes());
  const bar: TaskBar = {
    applets: [{ slot: 3, shortcut: shortcut(ShortcutKind.CHAT, 7, 6, 5, 4, 3, 'hi') }],
    items: [{ bar: 2, slot: 1, shortcut: shortcut(ShortcutKind.ITEM, 9, 8, 7, 6, 5) }],
    queue: [shortcut(ShortcutKind.SKILL, 12, 11, 10, 9, 2)],
    actionPoint: 25,
  };
  // The applet count, per applet `i` and the six DWORDs (kind, ID, type, index, user ID, data) and, for a chat
  // shortcut, its string; the item count and per item `i`, `j` and the same; the queue count and per entry `i` and the
  // six DWORDs, no string; then `m_nActionPoint` (UserTaskBar.cpp:67-122).
  expect(bytesToHex(writeTaskBar(1, bar).fields)).toBe(hex(new ArWriter()
    .i32(1).i32(3).u32(8).u32(7).u32(6).u32(5).u32(4).u32(3).string('hi')
    .i32(1).i32(2).i32(1).u32(5).u32(9).u32(8).u32(7).u32(6).u32(5)
    .i32(1).i32(0).u32(6).u32(12).u32(11).u32(10).u32(9).u32(2)
    .i32(25)));
  expect(writeTaskBar(1, bar).objectId).toBe(1);
  // Nothing on the bar: the three counts and the action point.
  expect(bytesToHex(writeTaskBar(1, { applets: [], items: [], queue: [], actionPoint: 0 }).fields))
    .toBe(hex(new ArWriter().i32(0).i32(0).i32(0).i32(0)));
});

it('the task bar writer leaves out an empty shortcut, as the C++ loops do, and numbers the queue by position', () => {
  // `if( m_aSlotApplet[i].m_dwShortcut != SHORTCUT_NONE )` (and the same for the items and the queue).
  const skill = shortcut(ShortcutKind.SKILL, 1, 0, 2, 0, 2);
  const withGap = writeTaskBar(1, {
    applets: [{ slot: 0, shortcut: noShortcut }], items: [{ bar: 0, slot: 0, shortcut: noShortcut }],
    queue: [skill, noShortcut, skill], actionPoint: 0,
  });
  expect(bytesToHex(withGap.fields)).toBe(bytesToHex(new ArWriter()
    .i32(0).i32(0)
    .i32(2).i32(0).u32(6).u32(1).u32(0).u32(2).u32(0).u32(2).i32(2).u32(6).u32(1).u32(0).u32(2).u32(0).u32(2)
    .i32(0).toBytes()));
  const read = readBundle(encodeBundle(PacketType.JOIN, 7, [withGap]), WORLD_READERS);
  expect(read.mismatched).toEqual([]);
  expect(read.messages[0].value).toEqual({
    type: 'taskBar', taskBar: { applets: [], items: [], queue: [skill, noShortcut, skill], actionPoint: 0 },
  });
});

it('the task bar writer refuses what the C++ arrays and the wire format cannot hold', () => {
  const empty: TaskBar = { applets: [], items: [], queue: [], actionPoint: 0 };
  const applet = shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0);
  // MAX_SLOT_APPLET 18, MAX_SLOT_ITEM_COUNT 8, MAX_SLOT_ITEM 9, MAX_SLOT_QUEUE 5.
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: 18, shortcut: applet }] })).toThrow(/applet slot 18/);
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: -1, shortcut: applet }] })).toThrow(/applet slot -1/);
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: 1.5, shortcut: applet }] })).toThrow(/applet slot 1.5/);
  expect(() => writeTaskBar(1, { ...empty, items: [{ bar: 8, slot: 0, shortcut: applet }] })).toThrow(/item bar 8/);
  expect(() => writeTaskBar(1, { ...empty, items: [{ bar: 0, slot: 9, shortcut: applet }] })).toThrow(/item slot 9/);
  expect(() => writeTaskBar(1, { ...empty, queue: Array.from({ length: 6 }, () => applet) })).toThrow(/at most 5/);
  // The string is written for a chat shortcut alone, and into a char[128]: 127 bytes at most.
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: 0, shortcut: { ...applet, text: 'x' } }] }))
    .toThrow(/only a chat shortcut has a text/);
  expect(() => writeTaskBar(1, { ...empty, items: [{ bar: 0, slot: 0, shortcut: { ...applet, text: 'x' } }] }))
    .toThrow(/only a chat shortcut has a text/);
  const chat = (text: string): Shortcut => shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 0, text);
  expect(() => writeTaskBar(1, { ...empty, queue: [chat('x')] })).toThrow(/action slot.*no text/);
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: 0, shortcut: chat('x'.repeat(128)) }] }))
    .toThrow(/at most 127/);
  expect(() => writeTaskBar(1, { ...empty, applets: [{ slot: 0, shortcut: chat('x'.repeat(127)) }] })).not.toThrow();
});

it('the DAMAGE writer refuses a position without AF_FLYING and AF_FLYING without a position', () => {
  // The reader decides by the flag, so a DAMAGE that disagrees with its own position would be misread.
  expect(() => writeDamage(1, 9, 5, AttackFlag.GENERIC, { pos, angle: 1 })).toThrow(/needs AF_FLYING/);
  expect(() => writeDamage(1, 9, 5, AttackFlag.GENERIC | AttackFlag.FLYING)).toThrow(/needs a position/);
  expect(() => writeDamage(1, 9, 5, AttackFlag.FLYING, null)).toThrow(/needs a position/);
});

it('writeGameTimer writes the time as a double, a message the browser has no reader for', () => {
  const timer = writeGameTimer(9, 0.5);
  expect(timer.type).toBe(GAMETIMER);
  expect(GAMETIMER).toBe(0x0096);
  expect(bytesToHex(timer.fields)).toBe('000000000000e03f'); // 0.5 as a little-endian double
  expect(WORLD_READERS.has(GAMETIMER)).toBe(false);
  expect(readBundle(encodeBundle(PacketType.JOIN, 9, [timer]), WORLD_READERS).skipped).toEqual([GAMETIMER]);
});

// One mover of each kind, with values the C++ casts keep (a scale × 100 and an angle × 10 that are whole numbers).
const looks = { hairMesh: 3, hairColor: 0xff112233, headMesh: 4 };
/** STA and DEX are the own character's numbers' (`ownNumbers`), which `writeAddSelf` writes. */
const player = {
  ...looks, name: 'Hero', sex: 1, skinSet: 2, playerId: 777, job: 9, sta: 16, dex: 17, level: 65, authorization: 0x46,
  mode: 0x10, stateMode: 0x20, pkTime: 5000, pkValue: -3, pkPropensity: 100, honor: 6,
};
const moverBase = {
  pos, motion: 0x15, hitPoint: 1234, state: 0x11, stateFlag: 0x2, belligerence: 0, sfxId: NULL_ID,
};
/** `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`): the slots of `m_aJobSkill`, the empty ones `NULL_ID` at level 0. */
const MAX_SKILL_JOB = 45;
const skillSlots = (filled: SkillSlot[]): SkillSlot[] =>
  Array.from({ length: MAX_SKILL_JOB }, (_, i) => filled[i] ?? { skill: NULL_ID, level: 0 });
/** Numbers that differ from each other, with the signs and widths the C++ types keep: a `short` GP, an `__int64` EXP. */
const ownNumbers: OwnCharacter = {
  str: 15, sta: 16, dex: 17, int: 18, manaPoint: 63, fatiguePoint: 32,
  exp: 9876543210n, skillLevel: 3, skillPoint: 4, deathExp: -5n, deathLevel: 7, remainGP: -2,
  // Slots 0 to 2: test skills; 3 to 6: the four `SI_GEN_EVE_*` IDs (`Resource/defineSkill.h:243-246`); the rest empty.
  skills: skillSlots([
    { skill: 1, level: 0 }, { skill: 2, level: 1 }, { skill: 3, level: 2 },
    { skill: 317, level: 0 }, { skill: 318, level: 0 }, { skill: 319, level: 0 }, { skill: 320, level: 0 },
  ]),
  // The two worn items (object IDs 0 and 7, see `equipmentObjectIds`) and 3 lollipops in slot 45.
  inventory: [
    { objectId: 0, itemId: 506, count: 1 }, { objectId: 7, itemId: 502, count: 1 },
    { objectId: 45, itemId: 2800, count: 3 },
  ],
  inventoryError: null,
};
const otherPlayer: AddedMover = {
  ...moverBase, index: 11, scale: 1, angle: 90.5, objectId: 31, isPlayer: true,
  player: {
    ...player, self: false, own: null, shopTitle: 'Cheap swords', equipmentObjectIds: [],
    worn: [{ part: 2, itemId: 500, flag: 0 }, { part: 10, itemId: 21, flag: 1 }, { part: 27, itemId: 4100, flag: 0 }],
  },
};
const ownPlayer: AddedMover = {
  ...moverBase, index: 11, scale: 1, angle: -45.5, objectId: 32, isPlayer: true,
  player: {
    ...player, self: true, own: ownNumbers, shopTitle: '', worn: [],
    // m_aEquipInfo[i].dwId: inventory object IDs at parts 2 and 13, NULL_ID elsewhere.
    equipmentObjectIds: Array.from({ length: 31 }, (_, i) => (i === 2 ? 7 : i === 13 ? 0 : NULL_ID)),
  },
};
const monster: AddedMover = {
  ...moverBase, index: 20, scale: 1.5, angle: 180, objectId: 33, isPlayer: false, belligerence: 1,
  npc: {
    hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [],
    activeAttack: 1, movePattern: 0, moveEvent: 0, moveEventCount: 0, speedFactor: 1,
  },
};
const humanNpc: AddedMover = {
  ...moverBase, index: 11, scale: 2.5, angle: 0, objectId: 34, isPlayer: false,
  npc: {
    ...looks, characterKey: 'MaFl_Bobochan',
    worn: [{ part: 2, itemId: 502, flag: 0 }, { part: 10, itemId: 22, flag: 0 }],
    activeAttack: 0, movePattern: 2, moveEvent: 99, moveEventCount: -1, speedFactor: 0.5,
  },
};

it('each ADD_OBJ writer decodes to what it was given', () => {
  // The own character is the one whose object ID is the bundle's player object ID.
  const cases: [string, ReturnType<typeof writeAddPlayer>, number, AddedMover][] = [
    ['writeAddPlayer', writeAddPlayer(31, otherPlayer), 7, otherPlayer],
    ['writeAddSelf', writeAddSelf(32, ownPlayer), 32, ownPlayer],
    ['writeAddMonster', writeAddMonster(33, monster), 7, monster],
    ['writeAddNpc', writeAddNpc(34, humanNpc), 7, humanNpc],
  ];
  for (const [name, message, playerObjectId, mover] of cases) {
    expect(message.type, name).toBe(MessageType.ADD_OBJ);
    expect(message.objectId, name).toBe(mover.objectId);
    for (const index of [true, false]) {
      const result = readBundle(encodeBundle(PacketType.JOIN, playerObjectId, [message], { index }), WORLD_READERS);
      expect(result.skipped, name).toEqual([]);
      expect(result.mismatched, name).toEqual([]);
      expect(result.messages, name).toEqual([
        { objectId: mover.objectId, type: MessageType.ADD_OBJ, value: { type: 'addMover', mover } },
      ]);
    }
  }
  // A JOIN as the world server starts it: the own character first (`CUser::Open`), then what is in view.
  const inView = [ownPlayer, otherPlayer, monster, humanNpc];
  const join = readBundle(encodeBundle(PacketType.JOIN, 32, [
    writeAddSelf(32, ownPlayer), writeAddPlayer(31, otherPlayer), writeAddMonster(33, monster),
    writeAddNpc(34, humanNpc),
  ]), WORLD_READERS);
  expect(join.mismatched).toEqual([]);
  expect(join.messages.map((m) => m.value)).toEqual(inView.map((mover) => ({ type: 'addMover', mover })));
});

/** The own player's ADD_OBJ read back as the browser reads it: the bundle's player object ID is the mover's. */
function readSelf(mover: AddedMover): AddedMover {
  const bundle = encodeBundle(PacketType.JOIN, mover.objectId, [writeAddSelf(mover.objectId, mover)]);
  const result = readBundle(bundle, WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  expect(result.messages).toHaveLength(1);
  const value = result.messages[0].value;
  if (value.type !== 'addMover') throw new Error(`not a mover: ${value.type}`);
  return value.mover;
}

it('writeAddSelf writes the equipment IDs, the skill pairs, the fields up to the inventory and the inventory last', () => {
  const { fields } = writeAddSelf(32, ownPlayer);
  // `ar.Read( m_aJobSkill, sizeof(SKILL) * MAX_SKILL_JOB )` follows the 31 `m_aEquipInfo[i].dwId` directly
  // (`ObjSerializeOpt.cpp:557-561`). Then the cheer point and its tick, the slot, the banks' gold and player IDs, the
  // HP bonus, the three resists and the angel's EXP and level (:569-583), 49 bytes with nothing in them, and
  // `m_Inventory.Serialize` (:585), where the message ends: the banks and the rest are not written.
  const expected = new ArWriter();
  for (const id of ownPlayer.player!.equipmentObjectIds) expected.u32(id);
  for (const slot of ownNumbers.skills) expected.u32(slot.skill).u32(slot.level);
  expected.bytes(new Uint8Array(1 + 4 + 1 + 3 * 4 + 3 * 4 + 4 + 3 + 8 + 4));
  // `CItemContainer::Serialize` (`_Common/Item.h:898-922`) over the 42 + 31 slots: `m_apIndex` as a fresh container
  // has it (`Clear`, :480-496: the bag's 42 positions hold their own slot, the parts NULL_ID), the count, each item's
  // slot and `CItemElem::Serialize`, then the object indexes, a fresh container's too.
  const fresh = (w: ArWriter): void => {
    for (let i = 0; i < 73; i++) w.u32(i < 42 ? i : NULL_ID);
  };
  fresh(expected);
  expected.u8(3);
  for (const item of ownNumbers.inventory!) {
    expected.u8(item.objectId) // ch
      .u32(item.objectId).u32(item.itemId).u32(0).i32(0) // m_dwObjId, m_dwItemId, m_liSerialNumber, '' (m_szItemText)
      .i16(item.count) // m_nItemNum
      .bytes(new Uint8Array(1 + 4 + 4 + 1 + 4 + 4 + 1 + 4 + 4)) // m_nRepairNumber to m_nResistSMItemId
      .u32(0).u32(0).u32(0) // m_piercing: no cards, no ultimate jewels, no vis keep times
      .i32(0).i64(0n).u32(0) // m_bCharged, m_iRandomOptItemId, m_dwKeepTime (0: no time left follows)
      .u8(0).i32(0); // no pet, m_bTranformVisPet
  }
  fresh(expected);
  const tail = expected.toBytes();
  expect(bytesToHex(fields.subarray(fields.byteLength - tail.byteLength))).toBe(bytesToHex(tail));
  // Slot 1 is skill 2 at level 1, slot 7 the first empty one: NULL_ID at level 0.
  const skillsAt = fields.byteLength - tail.byteLength + 4 * 31;
  const pairs = fields.subarray(skillsAt, skillsAt + 8 * MAX_SKILL_JOB);
  expect(bytesToHex(pairs.subarray(8, 16))).toBe('0200000001000000');
  expect(bytesToHex(pairs.subarray(56, 64))).toBe('ffffffff00000000');
  // The last item, 79 bytes before the object indexes: slot 45 (0x2d), item 2800 (0x0af0), serial 0, '', count 3.
  const lollipops = fields.subarray(fields.byteLength - 4 * 73 - 79);
  expect(bytesToHex(lollipops.subarray(0, 19))).toBe('2d' + '2d000000' + 'f00a0000' + '00000000' + '00000000' + '0300');
});

it("a new character's numbers, skills and inventory read back slot by slot", () => {
  const skills = skillSlots([
    { skill: 1, level: 0 }, { skill: 2, level: 1 }, { skill: 3, level: 2 },
    { skill: 317, level: 0 }, { skill: 318, level: 0 }, { skill: 319, level: 0 }, { skill: 320, level: 0 },
  ]);
  // The male `BASE_VALUE_TBL` inventory (`Database.sql:2741`): the suit, biscuit, town blink wings, gauntlets, boots,
  // wooden sword and lollipops.
  const inventory = [
    { objectId: 0, itemId: 502, count: 1 }, { objectId: 1, itemId: 2801, count: 1 },
    { objectId: 2, itemId: 4805, count: 5 }, { objectId: 42, itemId: 506, count: 1 },
    { objectId: 43, itemId: 510, count: 1 }, { objectId: 44, itemId: 21, count: 1 },
    { objectId: 45, itemId: 2800, count: 3 },
  ];
  const own: OwnCharacter = {
    str: 15, sta: 15, dex: 15, int: 15, manaPoint: 63, fatiguePoint: 32, exp: 0n, skillLevel: 0, skillPoint: 0,
    deathExp: 0n, deathLevel: 0, remainGP: 0, skills, inventory, inventoryError: null,
  };
  const mover = readSelf({ ...ownPlayer, player: { ...ownPlayer.player!, own } });
  expect(mover.player?.own).toEqual(own);
  expect(mover.player?.own?.skills).toHaveLength(MAX_SKILL_JOB);
  mover.player?.own?.skills.forEach((slot, i) => expect(slot, `slot ${i}`).toEqual(skills[i]));
  expect(mover.player?.own?.inventory).toEqual(inventory);
});

it('an own character without numbers is written with nothing in them', () => {
  // `own: null` is what a script that does not care about the numbers passes: zero stats, MP, FP, EXP and points,
  // 45 empty slots and an empty inventory, which read back as that.
  const mover = readSelf({ ...ownPlayer, player: { ...ownPlayer.player!, own: null } });
  expect(mover.player?.own).toEqual({
    str: 0, sta: 0, dex: 0, int: 0, manaPoint: 0, fatiguePoint: 0, exp: 0n, skillLevel: 0, skillPoint: 0,
    deathExp: 0n, deathLevel: 0, remainGP: 0, skills: skillSlots([]), inventory: [], inventoryError: null,
  });
  expect(mover.player?.equipmentObjectIds).toEqual(ownPlayer.player!.equipmentObjectIds);
});

it('the ADD_OBJ writers refuse a mover of the other kind', () => {
  expect(() => writeAddPlayer(31, ownPlayer)).toThrow(/own character/);
  expect(() => writeAddSelf(32, otherPlayer)).toThrow(/another player/);
  expect(() => writeAddPlayer(33, monster)).toThrow(/not a player/);
  expect(() => writeAddNpc(31, otherPlayer)).toThrow(/not an NPC or a monster/);
  expect(() => writeAddMonster(33, { ...monster, isPlayer: true })).toThrow(/isPlayer is true/);
  const own = ownPlayer.player!;
  const short = { ...own, equipmentObjectIds: own.equipmentObjectIds.slice(1) };
  expect(() => writeAddSelf(32, { ...ownPlayer, player: short })).toThrow(/31 equipment object IDs, not 30/);
  const dressed = { ...own, worn: [{ part: 2, itemId: 500, flag: 0 }] };
  expect(() => writeAddSelf(32, { ...ownPlayer, player: dressed })).toThrow(/worn must be \[\]/);
  const withIds = { ...otherPlayer.player!, equipmentObjectIds: own.equipmentObjectIds };
  expect(() => writeAddPlayer(31, { ...otherPlayer, player: withIds })).toThrow(/equipmentObjectIds must be \[\]/);
  // The skill array has 45 slots; another player has no numbers on the wire.
  const fewer = { ...own, own: { ...ownNumbers, skills: ownNumbers.skills.slice(1) } };
  expect(() => writeAddSelf(32, { ...ownPlayer, player: fewer })).toThrow(/45 skill slots, not 44/);
  const withNumbers = { ...otherPlayer.player!, own: ownNumbers };
  expect(() => writeAddPlayer(31, { ...otherPlayer, player: withNumbers })).toThrow(/own must be null/);
  // The inventory is a list (a failed read's null and error are the reader's), in the slot order the storing side
  // writes, each slot one of the 73.
  const withInventory = (inventory: OwnCharacter['inventory'], inventoryError: string | null = null): AddedMover => (
    { ...ownPlayer, player: { ...own, own: { ...ownNumbers, inventory, inventoryError } } }
  );
  expect(() => writeAddSelf(32, withInventory(null))).toThrow(/inventory to write is a list/);
  expect(() => writeAddSelf(32, withInventory([], 'item 1 of 1: ...'))).toThrow(/inventoryError must be null/);
  const lollipops = { itemId: 2800, count: 3 };
  expect(() => writeAddSelf(32, withInventory([{ objectId: 45, ...lollipops }, { objectId: 1, ...lollipops }])))
    .toThrow(/object ID 1 after 45/);
  expect(() => writeAddSelf(32, withInventory([{ objectId: 1, ...lollipops }, { objectId: 1, ...lollipops }])))
    .toThrow(/object ID 1 after 1/);
  expect(() => writeAddSelf(32, withInventory([{ objectId: 73, ...lollipops }]))).toThrow(/object ID 73 is not one of/);
});
