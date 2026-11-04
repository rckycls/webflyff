import { describe, expect, it } from 'vitest';
import { OwnState } from '../src/world/OwnState';
import { ownAdded, ownGameData, itemProp } from './helpers/ownState';
import { equipmentPart } from '../src/world/items/equipment';
import { ServerClock } from '../src/net/serverClock';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';

function setup() {
  const added = ownAdded();
  added.player!.own!.inventory = [{ objectId: 6, itemId: 2800, count: 3 }, { objectId: 7, itemId: 2800, count: 8 }];
  added.player!.own!.inventorySlots = Array.from({ length: 73 }, (_, i) => i < 42 ? i : 0xffffffff);
  const data = ownGameData();
  data.itemProps.set(2800, itemProp({ id: 2800, part: -1, packMax: 10 }));
  data.itemProps.set(700, itemProp({ id: 700, part: 20 }));
  const own = new OwnState(data, added, []);
  return { own, id: added.objectId };
}
describe('authoritative inventory state', () => {
  it('uses native inventory equipment positions instead of stale appearance-header references', () => {
    const added = ownAdded(), own = added.player!.own!;
    own.inventory = [{ objectId: 42, itemId: 502, count: 1 }, { objectId: 6, itemId: 21, count: 1 }];
    own.inventorySlots = Array.from({ length: 73 }, (_, i) => i < 42 ? i : 0xffffffff);
    own.inventorySlots[44] = 42; // suit's actual equipment position
    added.player!.equipmentObjectIds[2] = 6; // unrelated object in stale header
    const state = new OwnState(ownGameData(), added, []);
    expect(state.equipmentObjectIds[2]).toBe(42);
    expect(state.equipmentObjectIds[10]).toBe(0xffffffff);
  });
  it('resolves Blade offhand only with a one-handed right weapon and no shield', () => {
    const sword = itemProp({ id: 21, part: 10, handed: 1 });
    expect(equipmentPart(sword, -1, true, 7, (part) => part === 10 ? sword : undefined)).toBe(9);
    expect(equipmentPart(sword, -1, true, 7, () => sword)).toBe(10);
    expect(equipmentPart(sword, -1, true, 0, (part) => part === 10 ? sword : undefined)).toBe(10);
    expect(equipmentPart(sword, -1, false, 7, () => sword, 9)).toBe(9);
  });
  it('places a second ring into the secondary slot when native nPart is -1', () => {
    const { own, id } = setup();
    // The production catalog supplies the same prop to both items; add it to the shared setup here.
    own.inventory!.set(6, { objectId: 6, itemId: 700, count: 1 });
    own.inventory!.set(7, { objectId: 7, itemId: 700, count: 1 });
    for (const objectId of [6, 7]) own.apply({ type: 'equipItem', objectId, equip: true, itemId: 700, option: 0, flag: 0, part: -1 }, id);
    expect(own.equipmentObjectIds.slice(20, 22)).toEqual([6, 7]);
    expect(own.equipped.armour.filter((p) => p.id === 700)).toHaveLength(2);
    own.apply({ type: 'equipItem', objectId: 7, equip: false, itemId: 700, option: 0, flag: 0, part: -1 }, id);
    expect(own.equipmentObjectIds.slice(20, 22)).toEqual([6, 0xffffffff]);
  });
  it('applies native part=-1 equip and unequip confirmations using the catalog', () => {
    const { own, id } = setup();
    own.inventory!.set(6, { objectId: 6, itemId: 21, count: 1 });
    own.apply({ type: 'equipItem', objectId: 6, equip: true, itemId: 21, option: 0, flag: 0, part: -1 }, id);
    expect(own.equipmentObjectIds[10]).toBe(6);
    expect(own.inventorySlots.slice(0, 42)).not.toContain(6);
    expect(own.equipped.weapon?.id).toBe(21);
    own.apply({ type: 'equipItem', objectId: 6, equip: false, itemId: 21, option: 0, flag: 0, part: -1 }, id);
    expect(own.equipmentObjectIds[10]).toBe(0xffffffff);
    expect(own.inventorySlots.slice(0, 42)).toContain(6);
    expect(own.equipped.weapon).toBeNull();
  });
  it('keeps what the item tooltip shows up to date: the awakening, the upgrade, the element, the sockets (2026-11-05)', () => {
    const { own, id } = setup();
    const update = (param: number, value: number) => own.apply({ type: 'updateItem', itemType: 0, objectId: 6, param, value, time: 0 }, id);
    const revision = own.inventoryRevision;
    // CMover::UpdateItemEx's UI_RANDOMOPTITEMID (MoverParam.cpp:3832-3858)
    own.apply({ type: 'updateItemEx', objectId: 6, param: 10, value: 0x1234n }, id);
    expect(own.inventory!.get(6)!.randomOption).toBe(0x1234n);
    expect(own.inventoryRevision).toBe(revision + 1);
    // CMover::UpdateItem (MoverParam.cpp:3862-): UI_AO 3, UI_RAO 4, UI_IR 5, UI_PIERCING_SIZE 6, UI_PIERCING 7 (LOWORD the
    // socket, HIWORD the card), UI_ULTIMATE_PIERCING_SIZE 13, UI_ULTIMATE_PIERCING 14
    update(3, 7); update(5, 2); update(4, 4); update(6, 3); update(7, (7001 << 16) | 1); update(13, 2); update(14, 9001 << 16);
    expect(own.inventory!.get(6)).toEqual({
      objectId: 6, itemId: 2800, count: 3, randomOption: 0x1234n, abilityOption: 7, resist: 2, resistOption: 4,
      piercing: [0, 7001, 0], ultimate: [9001, 0],
    });
    // the upgrades stop at 20 (__EXT_ENCHANT); a socket past the size is not set; an awakening of 0 is none
    update(3, 25); update(7, (7002 << 16) | 5); update(6, 1);
    own.apply({ type: 'updateItemEx', objectId: 6, param: 10, value: 0n }, id);
    expect(own.inventory!.get(6)).toMatchObject({ abilityOption: 20, piercing: [0] });
    expect(own.inventory!.get(6)!.randomOption).toBeUndefined();
    // another object's message is not the player's
    own.apply({ type: 'updateItemEx', objectId: 6, param: 10, value: 5n }, id + 1);
    expect(own.inventory!.get(6)!.randomOption).toBeUndefined();
  });
  it('keeps the sex of the character, which the item tooltip judges SEX lines by (PutSex; 2026-11-05)', () => {
    const added = ownAdded();
    added.player!.sex = 1;
    expect(new OwnState(ownGameData(), added, []).sex).toBe(1);
  });
  it('the world hands UPDATE_ITEM_EX to the own numbers (2026-11-05)', () => {
    const added = ownAdded();
    added.player!.own!.inventory = [{ objectId: 6, itemId: 2800, count: 3 }];
    added.player!.own!.inventorySlots = Array.from({ length: 73 }, (_, i) => i < 42 ? i : 0xffffffff);
    const data = ownGameData();
    const own = new OwnState(data, added, []);
    const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
    world.apply(added.objectId, { type: 'addMover', mover: added });
    world.apply(added.objectId, { type: 'updateItemEx', objectId: 6, param: 10, value: 77n });
    expect(own.inventory!.get(6)!.randomOption).toBe(77n);
  });
  it('uses MOVEITEM confirmation to merge up to packMax while preserving object IDs', () => {
    const { own, id } = setup();
    own.apply({ type: 'moveItem', itemType: 0, source: 6, destination: 7 }, id);
    expect(own.inventory?.get(6)?.count).toBe(1);
    expect(own.inventory?.get(7)?.count).toBe(10);
    expect(own.inventorySlots[6]).toBe(6);
  });
  it('swaps empty allocations and removes stacks only on server confirmation', () => {
    const { own, id } = setup();
    own.apply({ type: 'moveItem', itemType: 0, source: 6, destination: 0 }, id);
    expect(own.inventorySlots[0]).toBe(6);
    expect(own.inventory?.get(6)?.count).toBe(3);
    own.apply({ type: 'updateItem', itemType: 0, objectId: 6, param: 8, value: 0, time: 0 }, id);
    expect(own.inventory?.has(6)).toBe(false);
    own.apply({ type: 'updateItem', itemType: 0, objectId: 6, param: 0, value: 5, time: 0 }, id);
    expect(own.inventory?.has(6)).toBe(false); // stale update cannot recreate an item
  });
  it('ignores another character and unknown updates; CREATEITEM replaces counts absolutely', () => {
    const { own, id } = setup();
    own.apply({ type: 'updateItem', itemType: 0, objectId: 6, param: 0, value: 0, time: 0 }, id + 1);
    expect(own.inventory?.get(6)?.count).toBe(3);
    const message = { type: 'createItem' as const, itemType: 0, item: { objectId: 999, itemId: 2800, count: 99 }, stacks: [{ objectId: 6, count: 9 }] };
    own.apply(message, id);
    own.apply(message, id);
    expect(own.inventory?.get(6)).toEqual({ objectId: 6, itemId: 2800, count: 9 });
  });
});
