import { expect, it } from 'vitest';
import {
  ArWriter, DPID_UNKNOWN, MessageType, PacketType, WORLD_READERS, bytesToHex, encodeJoin, encodePlayerMoved, encodePreJoin,
  encodeWorldKeepAlive, readBundle,
} from '@flyffweb/protocol';
import type { MoveReport } from '@flyffweb/protocol';
import { createWorldScript, writeDelObj, writeSetPos } from '../src';

const SELF = { objectId: 9, type: MessageType.SETPOS, fields: new ArWriter().vec3([1, 2, 3]).toBytes() };
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

it('answers JOIN with the JOIN bundle: WORLD_READINFO, the own ADD_OBJ, then the others', () => {
  const [bundle, ...rest] = script().answer('cache', join);
  expect(rest).toEqual([]);
  expect(new DataView(bundle!.buffer, bundle!.byteOffset).getUint32(0, true)).toBe(PacketType.JOIN);
  const read = readBundle(bundle!, WORLD_READERS);
  expect(read.playerObjectId).toBe(9);
  expect(read.indexed).toBe(true);
  expect(read.messages.map((m) => [m.objectId, m.value])).toEqual([
    [9, { type: 'worldReadInfo', worldId: 1, pos: [6968, 100, 3328] }],
    [9, { type: 'setPos', pos: [1, 2, 3] }],
    [10, { type: 'setPos', pos: [4, 5, 6] }],
  ]);
  expect(readBundle(script(false).answer('cache', join)[0]!, WORLD_READERS).indexed).toBe(false);
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
