import { expect, it } from 'vitest';
import {
  ArWriter, DPID_UNKNOWN, MessageType, NULL_ID, PacketType, WORLD_READERS, bytesToHex, encodeJoin, encodeMeleeAttack,
  encodeModifyStatus, encodePlayerMoved, encodePlayerSetDestObj, encodePreJoin, encodeRevivalToLodestar, encodeSetTarget,
  encodeWorldKeepAlive, readBundle,
} from '@flyffweb/protocol';
import type { AddedMover, MoveReport, WorldPacket } from '@flyffweb/protocol';
import {
  GAMETIMER, createWorldScript, writeAddSelf, writeDamage, writeDelObj, writeRevivalToLodestar, writeSetPos,
  writeSetState,
} from '../src';

/** The own character, wearing nothing. */
const OWN: AddedMover = {
  index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: 9, motion: 0, isPlayer: true, hitPoint: 100, state: 1,
  stateFlag: 0, belligerence: 0, sfxId: 0,
  player: {
    self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, sta: 15,
    dex: 15, level: 15, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
    equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '',
    // A new character's numbers, but 45 empty skill slots and an empty inventory (a new character's hold its three skills and
    // its starter items, `newVagrantOwn`).
    own: {
      str: 15, sta: 15, dex: 15, int: 15, manaPoint: 63, fatiguePoint: 32, exp: 0n, skillLevel: 0, skillPoint: 0,
      deathExp: 0n, deathLevel: 0, remainGP: 0,
      skills: Array.from({ length: 45 }, () => ({ skill: NULL_ID, level: 0 })), inventory: [], inventoryError: null,
      inventorySlots: Array.from({ length: 73 }, (_, i) => i < 42 ? i : NULL_ID),
    },
  },
};
const SELF = writeAddSelf(9, OWN);
const OTHER = writeSetPos(10, [4, 5, 6]);
const script = (index?: boolean) => createWorldScript({
  playerObjectId: 9, worldId: 1, pos: [6968, 100, 3328], self: SELF, others: [OTHER], ...(index === undefined ? {} : { index }),
});
const join = encodeJoin({
  worldId: 1, playerId: 500, authKey: 7, partyId: 0, guildId: 0, warId: 0, channelId: 1, slot: 0, name: 'Webby',
  account: 'webtester', passwordHash: 'x', messenger: undefined,
});

it('answers PRE_JOIN on the login connection with a PRE_JOIN of no fields', () => {
  expect(script().answer('login', encodePreJoin('webtester', 500, 'Webby')).map(bytesToHex))
    .toEqual([bytesToHex(new ArWriter().u32(PacketType.PRE_JOIN).toBytes())]);
  // a PRE_JOIN on the cache connection is not the login server's
  expect(script().answer('cache', encodePreJoin('webtester', 500, 'Webby'))).toEqual([]);
});

it('answers JOIN with the JOIN bundle in CUser::Open\'s order: the environment, WORLD_READINFO, the own ADD_OBJ, the rest', () => {
  const [bundle, ...rest] = script().answer('cache', join);
  expect(rest).toEqual([]);
  expect(new DataView(bundle!.buffer, bundle!.byteOffset).getUint32(0, true)).toBe(PacketType.JOIN);
  const read = readBundle(bundle!, WORLD_READERS);
  expect(read.playerObjectId).toBe(9);
  expect(read.indexed).toBe(true);
  expect(read.messages.map((m) => [m.objectId, m.value])).toEqual([
    [9, { type: 'environmentSetting', season: 0 }],
    [9, { type: 'worldReadInfo', worldId: 1, pos: [6968, 100, 3328] }],
    [9, { type: 'addMover', mover: OWN }],
    [10, { type: 'setPos', pos: [4, 5, 6] }],
  ]);
  // the game timer, standing for the rest of CUser::Open's messages, which the browser has no reader for
  expect(read.skipped).toEqual([GAMETIMER]);
  expect(read.mismatched).toEqual([]);
});

it('without the table, the JOIN bundle is read up to the own character and the rest of it is dropped, as from the old exe', () => {
  const read = readBundle(script(false).answer('cache', join)[0]!, WORLD_READERS);
  expect(read.indexed).toBe(false);
  expect(read.messages.map((m) => m.value.type)).toEqual(['environmentSetting', 'worldReadInfo', 'addMover']);
  // the own ADD_OBJ's reader skips the rest of its message, which without a table is the rest of the bundle
  expect(read).toMatchObject({ skipped: [], mismatched: [], stoppedAt: null });
});

it('answers nothing else', () => {
  const s = script();
  expect(s.answer('cache', encodeWorldKeepAlive())).toEqual([]);
  expect(s.answer('login', join)).toEqual([]);
  const move: MoveReport = {
    pos: [0, 0, 0], delta: [0, 0, 0], angle: 0, state: 0, stateFlag: 0, motion: 0, motionEx: 0, loop: 0, motionOption: 0, tick: 0n,
  };
  expect(s.answer('cache', encodePlayerMoved(move))).toEqual([]);
  expect(s.answer('cache', new ArWriter().u32(DPID_UNKNOWN).u32(0x1234).toBytes())).toEqual([]);
});

it('later is a SNAPSHOT bundle for the same player', () => {
  const bytes = script().later([writeDelObj(10)]);
  expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)).toBe(PacketType.SNAPSHOT);
  expect(readBundle(bytes, WORLD_READERS)).toMatchObject({
    playerObjectId: 9, indexed: true, messages: [{ objectId: 10, value: { type: 'delObj' } }],
  });
});

it('on answers each packet of its type on the cache connection with the reply\'s messages, as a SNAPSHOT bundle', () => {
  const s = script();
  const seen: WorldPacket[] = [];
  s.on('meleeAttack', (p) => {
    seen.push(p);
    return [writeDamage(10, 9, 10, 1)];
  });
  const answers = s.answer('cache', encodeMeleeAttack(29, 10, 0.085));
  // the reply is given the packet as decodeWorldPacket reads it
  expect(seen).toEqual([
    { type: 'meleeAttack', message: 29, targetId: 10, param2: 0, param3: 0x00010000, attackSpeed: Math.fround(0.085) },
  ]);
  expect(answers.map(bytesToHex)).toEqual([bytesToHex(s.later([writeDamage(10, 9, 10, 1)]))]);
  expect(readBundle(answers[0]!, WORLD_READERS)).toMatchObject({
    playerObjectId: 9, indexed: true,
    messages: [{ objectId: 10, value: { type: 'damage', attackerId: 9, hit: 10, flags: 1, fly: null } }],
  });
  // each packet of the type is answered, in turn
  expect(s.answer('cache', encodeMeleeAttack(29, 10, 0.085))).toHaveLength(1);
  expect(seen).toHaveLength(2);
});

it('on: an empty reply sends nothing; other types, the login connection and JOIN are answered as before', () => {
  const s = script();
  let replies = 0;
  s.on('revivalToLodestar', () => {
    replies++;
    return [];
  });
  expect(s.answer('cache', encodeRevivalToLodestar())).toEqual([]);
  expect(replies).toBe(1);
  expect(s.answer('login', encodeRevivalToLodestar())).toEqual([]);
  expect(replies).toBe(1);
  expect(s.answer('cache', encodeModifyStatus({ str: 1, sta: 0, dex: 0, int: 0 }))).toEqual([]);
  // the JOIN bundle still comes, whatever is scripted besides
  expect(s.answer('cache', join)).toHaveLength(1);
});

it('on: a later reply for the same type takes the place of the earlier', () => {
  const s = script();
  s.on('modifyStatus', () => [writeRevivalToLodestar(9)]);
  s.on('modifyStatus', (p) => (p.type === 'modifyStatus' ? [writeSetState(9, 15 + p.str, 15, 15, 15, 0)] : []));
  const [bundle] = s.answer('cache', encodeModifyStatus({ str: 2, sta: 0, dex: 0, int: 0 }));
  expect(readBundle(bundle!, WORLD_READERS).messages.map((m) => m.value)).toEqual([
    { type: 'setState', str: 17, sta: 15, dex: 15, int: 15, remainGP: 0 },
  ]);
});

it('on: a body that does not start with DPID_UNKNOWN is not a browser packet, and its reply is not asked', () => {
  const s = script();
  let replies = 0;
  s.on('unknown', () => {
    replies++;
    return [writeRevivalToLodestar(9)];
  });
  s.on('meleeAttack', () => {
    replies++;
    return [writeRevivalToLodestar(9)];
  });
  // a server's body (its type first): the MELEE_ATTACK packet type without DPID_UNKNOWN in front, and a bare type
  expect(s.answer('cache', new ArWriter().u32(PacketType.MELEE_ATTACK).u32(29).u32(10).i32(0).i32(0).f32(1).toBytes()))
    .toEqual([]);
  expect(s.answer('cache', new ArWriter().u32(0x1234).u32(0).toBytes())).toEqual([]);
  expect(replies).toBe(0);
});

it('on with until: the reply is held back to the next packet of that type, and goes out before its own answer', () => {
  const s = script();
  let swing = 0;
  // the DAMAGE of each swing at the next swing, as a live server's comes after the client's hit frame
  s.on('meleeAttack', () => [writeDamage(10, 9, ++swing, 1)], { until: 'meleeAttack' });
  s.on('setTarget', () => [writeSetPos(9, [1, 2, 3])]);
  const hits = (answers: Uint8Array[]) => answers.map((bundle) => readBundle(bundle, WORLD_READERS).messages.map((m) => m.value));

  // the first swing's DAMAGE waits; another packet, even one that is answered, does not bring it
  expect(s.answer('cache', encodeMeleeAttack(29, 10, 0.085))).toEqual([]);
  expect(hits(s.answer('cache', encodeSetTarget(10, 2)))).toEqual([[{ type: 'setPos', pos: [1, 2, 3] }]]);
  expect(s.answer('cache', encodeWorldKeepAlive())).toEqual([]);
  // the second swing brings the first's, and its own waits for the third
  expect(hits(s.answer('cache', encodeMeleeAttack(30, 10, 0.085)))).toEqual([
    [{ type: 'damage', attackerId: 9, hit: 1, flags: 1, fly: null }],
  ]);
  expect(hits(s.answer('cache', encodeMeleeAttack(31, 10, 0.085)))).toEqual([
    [{ type: 'damage', attackerId: 9, hit: 2, flags: 1, fly: null }],
  ]);
});

it('on with until: a reply held for another type goes out with that packet, before the reply to that packet', () => {
  const s = script();
  s.on('meleeAttack', () => [writeDamage(10, 9, 7, 1)], { until: 'playerSetDestObj' });
  s.on('playerSetDestObj', () => [writeSetPos(9, [4, 5, 6])]);
  expect(s.answer('cache', encodeMeleeAttack(29, 10, 0.085))).toEqual([]);
  const answers = s.answer('cache', encodePlayerSetDestObj(10, 0));
  expect(answers.map((bundle) => readBundle(bundle, WORLD_READERS).messages.map((m) => m.value.type)))
    .toEqual([['damage'], ['setPos']]);
  // given once
  expect(s.answer('cache', encodePlayerSetDestObj(10, 0)).map((b) => readBundle(b, WORLD_READERS).messages.length)).toEqual([1]);
});
