import { expect, it } from 'vitest';
import { MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import { encodeBundle, newVagrantOwn, writeAddSelf } from '../src';

const SELF: AddedMover = {
  index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: 9, motion: 0, isPlayer: true, hitPoint: 230, state: 1,
  stateFlag: 0, belligerence: 0, sfxId: 0,
  player: {
    self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, sta: 15,
    dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
    equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '', own: newVagrantOwn(),
  },
};

it('the new Vagrant: the BASE_VALUE_TBL numbers, the three skills at level 0 and the starter inventory', () => {
  const own = newVagrantOwn();
  expect([own.str, own.sta, own.dex, own.int]).toEqual([15, 15, 15, 15]);
  expect([own.manaPoint, own.fatiguePoint, own.exp, own.remainGP, own.skillPoint]).toEqual([63, 32, 0n, 0, 0]);
  expect(own.skills).toHaveLength(45);
  // the tblSkillPoint rows of character creation (SkillLv 0), on an array InitProp left empty: nothing else is in it
  expect(own.skills.slice(0, 3)).toEqual([{ skill: 1, level: 0 }, { skill: 2, level: 0 }, { skill: 3, level: 0 }]);
  expect(own.skills.slice(3)).toEqual(Array.from({ length: 42 }, () => ({ skill: NULL_ID, level: 0 })));
  expect(own.inventory?.map((item) => [item.objectId, item.itemId, item.count])).toEqual([
    [0, 502, 1], [1, 2801, 1], [2, 4805, 5], [42, 506, 1], [43, 510, 1], [44, 21, 1], [45, 2800, 3],
  ]);
  expect(own.inventoryError).toBeNull();
});

it('is a fresh object each call, so a test can change it', () => {
  const a = newVagrantOwn();
  a.skills[0]!.level = 9;
  a.inventory?.pop();
  expect(newVagrantOwn().skills[0]).toEqual({ skill: 1, level: 0 });
  expect(newVagrantOwn().inventory).toHaveLength(7);
});

it('writes and reads back through the own ADD_OBJ unchanged', () => {
  const bundle = encodeBundle(PacketType.JOIN, 9, [writeAddSelf(9, SELF)]);
  const read = readBundle(bundle, WORLD_READERS);
  expect(read.mismatched).toEqual([]);
  expect(read.messages).toEqual([{ objectId: 9, type: MessageType.ADD_OBJ, value: { type: 'addMover', mover: SELF } }]);
});
