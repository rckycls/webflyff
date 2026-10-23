import { expect, it } from 'vitest';
import {
  ArWriter, BUNDLE_MARKER, MessageType, NULL_ID, PacketType, WORLD_READERS, bytesToHex, readBundle,
} from '@flyffweb/protocol';
import type { AddedMover, MessageReader, MoveReport, Vec3, WorldMessage } from '@flyffweb/protocol';
import {
  GAMETIMER, encodeBundle, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf, writeDelObj, writeDestAngle,
  writeDestPos, writeEnvironmentSetting, writeGameTimer, writeMotion, writeMoverAngle, writeMoverBehavior, writeMoverCorr,
  writeMoverMoved, writeReplace, writeSetDestObj, writeSetPos, writeSetPosAngle, writeWorldReadInfo,
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
const player = {
  ...looks, name: 'Hero', sex: 1, skinSet: 2, playerId: 777, job: 9, level: 65, authorization: 0x46, mode: 0x10,
  stateMode: 0x20, pkTime: 5000, pkValue: -3, pkPropensity: 100, honor: 6,
};
const moverBase = {
  pos, motion: 0x15, hitPoint: 1234, state: 0x11, stateFlag: 0x2, belligerence: 0, sfxId: NULL_ID,
};
const otherPlayer: AddedMover = {
  ...moverBase, index: 11, scale: 1, angle: 90.5, objectId: 31, isPlayer: true,
  player: {
    ...player, self: false, shopTitle: 'Cheap swords', equipmentObjectIds: [],
    worn: [{ part: 2, itemId: 500, flag: 0 }, { part: 10, itemId: 21, flag: 1 }, { part: 27, itemId: 4100, flag: 0 }],
  },
};
const ownPlayer: AddedMover = {
  ...moverBase, index: 11, scale: 1, angle: -45.5, objectId: 32, isPlayer: true,
  player: {
    ...player, self: true, shopTitle: '', worn: [],
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
});
