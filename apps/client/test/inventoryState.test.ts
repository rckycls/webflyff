import { describe, expect, it } from 'vitest';
import { OwnState } from '../src/world/OwnState';
import { ownAdded, ownGameData, itemProp } from './helpers/ownState';
import { equipmentPart } from '../src/world/items/equipment';

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
