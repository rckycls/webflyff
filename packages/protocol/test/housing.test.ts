// 2026-11-15 (housing): personal housing's packets (B-server.md §3.2) and the ADD_OBJ of a control, read as Neuz's
// handlers read them and written as its senders write them.
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, writeAddCtrl, writeDelObj, writeHousingAllInfo, writeHousingFurnitureList, writeHousingPapering,
  writeHousingSetupFurniture, writeHousingSetVisitAllow, writeHousingVisitableList,
} from '@flyffweb/testkit';
import {
  HousingPacket, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeHousingGoOut, encodeHousingReqVisitableList,
  encodeHousingSetupFurniture, encodeHousingSetVisitAllow, encodeHousingVisitRoom, isHousingMessage, readBundle,
} from '../src';
import type { HousingInfo } from '../src';

const SELF = 9;

function read(messages: Parameters<typeof encodeBundle>[2]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, messages), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  return result.messages.map((m) => m.value);
}

const BED: HousingInfo = { itemId: 4916, secondsLeft: 2_591_000, placed: true, pos: [253.5, 100, 240.25], angle: 45 };
const SOFA: HousingInfo = { itemId: 4917, secondsLeft: 86_000, placed: false, pos: [0, 0, 0], angle: 0 };

describe('the housing snapshots', () => {
  it('reads the login list with the friends allowed in', () => {
    expect(read([writeHousingAllInfo(SELF, [BED, SOFA], [500, 501])])).toEqual([
      { type: 'housingAllInfo', furniture: [BED, SOFA], allowed: [500, 501] },
    ]);
    expect(read([writeHousingAllInfo(SELF, [], [])])).toEqual([{ type: 'housingAllInfo', furniture: [], allowed: [] }]);
  });

  it('reads the list changes, placing, the papering, the allow list and the visitable owners', () => {
    const values = read([
      writeHousingFurnitureList(SELF, SOFA, true),
      writeHousingFurnitureList(SELF, SOFA, false),
      writeHousingSetupFurniture(SELF, BED),
      writeHousingPapering(SELF, 4950, true),
      writeHousingPapering(SELF, NULL_ID, false),
      writeHousingSetVisitAllow(SELF, 500, true),
      writeHousingVisitableList(SELF, [700, 701, 702]),
    ]);
    expect(values).toEqual([
      { type: 'housingFurnitureList', info: SOFA, add: true },
      { type: 'housingFurnitureList', info: SOFA, add: false },
      { type: 'housingSetupFurniture', info: BED },
      { type: 'housingPapering', itemId: 4950, on: true },
      { type: 'housingPapering', itemId: NULL_ID, on: false },
      { type: 'housingSetVisitAllow', playerId: 500, allow: true },
      { type: 'housingVisitableList', owners: [700, 701, 702] },
    ]);
    expect(values.every((v) => isHousingMessage(v))).toBe(true);
  });
});

describe('the ADD_OBJ of a control (CCtrl::Serialize)', () => {
  it('reads the index, scale, point, angle and object id, and DEL_OBJ removes it', () => {
    const values = read([
      writeAddCtrl({ index: 23, scale: 0.7, pos: [250, 100.5, 244], angle: 175.5, objectId: 0x7001 }),
      writeDelObj(0x7001),
    ]);
    expect(values).toEqual([
      { type: 'addCtrl', ctrl: { index: 23, scale: Math.fround(0.7), pos: [250, 100.5, 244], angle: 175.5, objectId: 0x7001 } },
      { type: 'delObj' },
    ]);
  });

  it('keeps the angle to the tenth of a degree, a negative one too', () => {
    const [value] = read([writeAddCtrl({ index: 1, scale: 1, pos: [1, 2, 3], angle: -12.3, objectId: 5 })]);
    expect(value).toMatchObject({ ctrl: { angle: Math.fround(-12.3) } });
  });
});

describe('the housing packets the browser sends (DPClient.cpp:18545-18574)', () => {
  it('writes each with its fields and reads it back', () => {
    const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];
    expect([...encodeHousingGoOut().subarray(4, 8)]).toEqual([0x07, 0x30, 0x00, 0x70]);
    expect(body(encodeHousingGoOut())).toEqual([]);
    expect(body(encodeHousingVisitRoom(0x01020304))).toEqual([4, 3, 2, 1]);
    // the window's tKeepTime 0 less the clock
    const setup = encodeHousingSetupFurniture({ itemId: 4916, placed: true, pos: [253, 100, 241], angle: 90 }, 1_763_200_000);
    expect(setup.length).toBe(8 + 28);
    expect([
      setup,
      encodeHousingSetupFurniture({ itemId: 4917, placed: false, pos: [0, 0, 0], angle: 0 }, 0),
      encodeHousingSetVisitAllow(500, true), encodeHousingSetVisitAllow(501, false), encodeHousingVisitRoom(9001),
      encodeHousingReqVisitableList(), encodeHousingGoOut(),
    ].map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'housingSetupFurnitureRequest', itemId: 4916, keepTime: -1_763_200_000, placed: true, pos: [253, 100, 241], angle: 90 },
      { type: 'housingSetupFurnitureRequest', itemId: 4917, keepTime: 0, placed: false, pos: [0, 0, 0], angle: 0 },
      { type: 'housingSetVisitAllowRequest', playerId: 500, allow: true },
      { type: 'housingSetVisitAllowRequest', playerId: 501, allow: false },
      { type: 'housingVisitRoomRequest', ownerId: 9001 },
      { type: 'housingReqVisitableListRequest' },
      { type: 'housingGoOutRequest' },
    ]);
    expect(HousingPacket.SETUPFURNITURE).toBe(0x70003002);
  });
});
