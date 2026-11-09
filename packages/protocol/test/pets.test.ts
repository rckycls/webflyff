// Pets M0 (docs/superpowers/plans/2026-11-09-pets-m0-p1.md): the pet in items and players, the 12 pet messages and the
// own summoned pet's slot, read as Neuz reads them.
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, newVagrantOwn, writeAddPlayer, writeAddSelf, writeMoverChangeSfx, writePet, writePetCall, writePetFeed,
  writePetLevelup, writePetMill, writePetRelease, writePetResurrectionResult, writePetSetExp, writePetState,
  writeSetPetName, writeVisPetActivate,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';
import type { AddedMover, AddedPlayer, InventoryItem, OwnCharacter, PetData, WorldMessage } from '../src';

const PLAYER = 9;
const OTHER = 0x2001;
/** A name of the full `MAX_PET_NAME` - 1 bytes (`_Common/pet.h:105`). */
const LONG_NAME = 'Sixteen-byte-nam';
const PET: PetData = { kind: 4, level: 2, exp: 5000, energy: 80, life: 3, availLevels: [1, 2, 0, 0, 0, 0], name: LONG_NAME };

const PLAYER_BASE: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, sta: 15,
  dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
  equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '', own: null,
};

function selfWith(own: OwnCharacter): AddedMover {
  return {
    index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: PLAYER, motion: 0, isPlayer: true, hitPoint: 230,
    state: 1, stateFlag: 0, belligerence: 0, sfxId: 0, player: { ...PLAYER_BASE, own },
  };
}

function otherWith(pet?: AddedPlayer['pet']): AddedMover {
  return {
    index: 11, scale: 1, pos: [6970, 100, 3330], angle: 0, objectId: OTHER, motion: 0, isPlayer: true, hitPoint: 230,
    state: 1, stateFlag: 0, belligerence: 0, sfxId: NULL_ID,
    player: { ...PLAYER_BASE, self: false, equipmentObjectIds: [], ...(pet ? { pet } : {}) },
  };
}

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages.map((m) => m.value);
}

function ownOf(value: WorldMessage): OwnCharacter | null | undefined {
  return value.type === 'addMover' ? value.mover.player?.own : undefined;
}

describe('the pet in an item (CItemElem::Serialize, ObjSerialize.cpp:120-132; CPet::Serialize, pet.cpp:325-338)', () => {
  it('keeps the raised pet, the vis keep times and the transform flag, all three together', () => {
    const own = newVagrantOwn();
    const egg: InventoryItem = {
      objectId: 3, itemId: 21090, count: 1, pet: PET, piercing: [9001, 0], visKeepTimes: [3600, 60], transformVisPet: true,
    };
    own.inventory = [...own.inventory!.slice(0, 3), egg, ...own.inventory!.slice(3)];
    const [value] = read([writeAddSelf(PLAYER, selfWith(own))]);
    expect(ownOf(value!)?.inventory?.find((item) => item.objectId === 3)).toEqual(egg);
  });

  it('an item without them has none of the keys', () => {
    const [value] = read([writeAddSelf(PLAYER, selfWith(newVagrantOwn()))]);
    for (const item of ownOf(value!)?.inventory ?? []) {
      expect(Object.keys(item)).not.toContain('pet');
      expect(Object.keys(item)).not.toContain('visKeepTimes');
      expect(Object.keys(item)).not.toContain('transformVisPet');
    }
  });
});

describe('another player\'s pet (ObjSerializeOpt.cpp:299-316, read :664-672)', () => {
  it('splits MAKELONG( index, level ) and keeps the name', () => {
    const pet = { modelIndex: 1157, level: 5, name: 'Rex' };
    const [value] = read([writeAddPlayer(OTHER, otherWith(pet))]);
    expect(value?.type === 'addMover' ? value.mover.player?.pet : undefined).toEqual(pet);
  });

  it('a player with no pet (NULL_ID) has no pet key', () => {
    const [value] = read([writeAddPlayer(OTHER, otherWith())]);
    expect(Object.keys(value?.type === 'addMover' ? value.mover.player ?? {} : {})).not.toContain('pet');
  });
});

describe('the pet messages (DPClient.cpp:16398-16632, 18446-18467, 19002-19042)', () => {
  it('reads all twelve', () => {
    expect(read([
      writePetCall(PLAYER, 7, 1157, 2, LONG_NAME),
      writePetRelease(OTHER),
      writePetLevelup(OTHER, 1158, 3),
      writePetSetExp(PLAYER, 50000),
      writePet(PLAYER, PET, 1),
      writePetState(PLAYER, 7, 2, 179, 99999),
      writePetFeed(OTHER, 300),
      writePetMill(PLAYER, 1, 750),
      writePetResurrectionResult(true),
      writeSetPetName(OTHER, LONG_NAME),
      writeMoverChangeSfx(0x3001, 1234),
      writeVisPetActivate(PLAYER, 12, 0x3001),
    ])).toEqual([
      { type: 'petCall', itemObjectId: 7, modelIndex: 1157, level: 2, name: LONG_NAME },
      { type: 'petRelease' },
      { type: 'petLevelup', modelIndex: 1158, level: 3 },
      { type: 'petSetExp', exp: 50000 },
      { type: 'pet', pet: PET, flag: 1 },
      { type: 'petState', itemObjectId: 7, life: 2, energy: 179, exp: 99999 },
      { type: 'petFeed', energy: 300 },
      { type: 'petMill', result: 1, count: 750 },
      { type: 'petResurrectionResult', ok: true },
      { type: 'setPetName', name: LONG_NAME },
      { type: 'moverChangeSfx', sfxId: 1234 },
      { type: 'visPetActivate', itemObjectId: 12, petMoverId: 0x3001 },
    ]);
  });

  it('a buff pet that went: VISPET_ACTIVATE with NULL_ID both', () => {
    expect(read([writeVisPetActivate(PLAYER, NULL_ID, NULL_ID)])).toEqual([
      { type: 'visPetActivate', itemObjectId: NULL_ID, petMoverId: NULL_ID },
    ]);
  });

  it('drops a PET_CALL cut short', () => {
    const fields = new ArWriter().u32(7).u32(1157).toBytes();
    const result = readBundle(
      encodeBundle(PacketType.SNAPSHOT, PLAYER, [{ objectId: PLAYER, type: MessageType.PET_CALL, fields }]), WORLD_READERS,
    );
    expect(result.mismatched).toEqual([MessageType.PET_CALL]);
  });
});

describe('the own summoned pet\'s slot, after the three banks (ObjSerializeOpt.cpp:585-603)', () => {
  function petSlotOf(message: ScriptMessage): number | undefined {
    const [value] = read([message]);
    return ownOf(value!)?.petSlot;
  }

  it('is the dwPetId after empty banks', () => {
    expect(petSlotOf(writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), petSlot: 7 })))).toBe(7);
  });

  it('is still found past bank items that carry pets', () => {
    const banks = [[{ objectId: 0, itemId: 21090, count: 1, pet: PET }], [], [{ objectId: 41, itemId: 2801, count: 5 }]];
    expect(petSlotOf(writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), petSlot: 7 }), { banks }))).toBe(7);
  });

  it('is absent when no pet is out (NULL_ID)', () => {
    expect(petSlotOf(writeAddSelf(PLAYER, selfWith(newVagrantOwn()), { banks: [] }))).toBeUndefined();
  });

  it('banks cut short keep the inventory and give no slot', () => {
    const plain = writeAddSelf(PLAYER, selfWith(newVagrantOwn()));
    const full = writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), petSlot: 7 }));
    const cut = { ...full, fields: full.fields.subarray(0, plain.fields.length + 50) };
    const [value] = read([cut]);
    expect(ownOf(value!)?.inventory).toEqual(newVagrantOwn().inventory);
    expect(ownOf(value!)?.petSlot).toBeUndefined();
  });
});
