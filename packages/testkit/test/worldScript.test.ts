import { expect, it } from 'vitest';
import {
  ArWriter, DPID_UNKNOWN, MessageType, NULL_ID, PacketType, WORLD_READERS, bytesToHex, encodeJoin, encodePlayerMoved,
  encodePreJoin, encodeWorldKeepAlive, readBundle,
} from '@flyffweb/protocol';
import type { AddedMover, MoveReport } from '@flyffweb/protocol';
import { GAMETIMER, createWorldScript, writeAddSelf, writeDelObj, writeSetPos } from '../src';

/** The own character, wearing nothing. */
const OWN: AddedMover = {
  index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: 9, motion: 0, isPlayer: true, hitPoint: 100, state: 1,
  stateFlag: 0, belligerence: 0, sfxId: 0,
  player: {
    self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, level: 15,
    authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
    equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '',
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
