// 2026-11-20 (owner: "Trading perin sometimes isn't showing in inventory. When the perin receiver uses or double clicks
// the perin it removes the wings and disappears from the inventory but when you double clicks the wings it appears
// again."): the trade's end moves the items on each client by Neuz's own rules (`CVTInfo::TradeConsent`; the server sends
// no bag after TRADECONSENT), so the client's bag must hold the server's `m_apIndex` (each bag position's object) to put a
// traded item on the object the server put it on. The VIP bag Sort reorders `m_apIndex` on the server and sends the new
// order (SNAPSHOTTYPE_VIP_INVENTORY_SORT 0x8870), which WorldState did not pass on: the client kept the old order, and its
// next drags and trades filled other objects than the server's. The traded Perin then sat on the server's wings: a
// double-click on it sent DOUSEITEM for that object, and the server took the wings off or put them on.
import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { OwnState } from '../src/world/OwnState';
import { terrainGround } from '../src/world/sim/collision';
import { freshContainer } from '../src/world/trade/itemContainer';
import type { TradeSlot } from '../src/world/trade/itemContainer';
import { WorldState } from '../src/world/WorldState';
import { OWN_ID, WOODEN_SWORD, itemProp, ownAdded, ownGameData } from './helpers/ownState';

const NULL_ID = 0xffffffff;
const POTION = 500; // a stack (dwPackMax 100)
const SWORD = WOODEN_SWORD.id; // IK1_WEAPON: the sort puts it before the potion's IK1_GENERAL
const WING_CAPE = 20250; // II_ARM_S_CLO_CLO_WINGS01 (custom wing cape, PARTS_CLOAK 8)
const HAT = 700;
const PERIN = 26456; // II_SYS_SYS_SCR_PERIN, dwPackMax 99

/** The partner's bag as TRADE sends it, with `items` on its objects. */
function partnerBag(items: InventoryItem[]) {
  const bag = freshContainer(42);
  bag.slots.push(...Array.from({ length: 31 }, () => NULL_ID));
  for (const item of items) bag.items.set(item.objectId, item);
  return bag;
}

/** The partner's 25 trade slots, `put` from the first. */
function slots(...put: TradeSlot[]): Array<TradeSlot | null> {
  return Array.from({ length: 25 }, (_, i) => put[i] ?? null);
}

describe('a trade after the VIP bag Sort', () => {
  it('puts the traded items on the objects the server put them on, so the Perin is not the server\'s wings', () => {
    const data = ownGameData();
    data.itemProps.set(POTION, itemProp({ id: POTION, part: -1, packMax: 100 }));
    data.itemProps.set(WING_CAPE, itemProp({ id: WING_CAPE, part: 8 }));
    data.itemProps.set(HAT, itemProp({ id: HAT, part: 6 }));
    data.itemProps.set(PERIN, itemProp({ id: PERIN, part: -1, packMax: 99 }));
    const added = ownAdded();
    // the bag as the server holds it: position i on object i (Clear), 30 potions on 0 and the sword on 5, nothing worn
    added.player!.own!.inventory = [{ objectId: 0, itemId: POTION, count: 30 }, { objectId: 5, itemId: SWORD, count: 1 }];
    added.player!.own!.inventorySlots = Array.from({ length: 73 }, (_, i) => (i < 42 ? i : NULL_ID));
    const own = new OwnState(data, added, []);
    const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
    world.apply(OWN_ID, { type: 'addMover', mover: added }, true);

    // The Sort (CDPSrvr::OnVipSortInventory): the items by kind, the sword (5) before the potions (0), then the empty
    // positions' objects in their old order. The new m_apIndex comes back as 0x8870.
    const sorted = [5, 0, 1, 2, 3, 4, ...Array.from({ length: 36 }, (_, i) => i + 6)];
    world.apply(OWN_ID, { type: 'vipInventorySort', slots: sorted });

    // A drag from position 0 to 3 (OnMoveItem): the server swaps its positions 0 (the sword) and 3 (object 2, empty)
    // and confirms with MOVEITEM 0 -> 3.
    world.apply(OWN_ID, { type: 'moveItem', itemType: 0, source: 0, destination: 3 });

    // Two trades in (TRADECONSENT; WorldScreen hands the trade's slots to OwnState.tradeConsent). The server's Add puts
    // each on the first empty position's object: the wing cape on position 0's object 2, then the hat on position 2's
    // object 1 and the 5 Perins on position 4's object 3.
    own.tradeConsent(slots(), slots({ objectId: 9, count: 1 }), partnerBag([{ objectId: 9, itemId: WING_CAPE, count: 1 }]), 0);
    own.tradeConsent(
      slots(), slots({ objectId: 4, count: 1 }, { objectId: 8, count: 5 }),
      partnerBag([{ objectId: 4, itemId: HAT, count: 1 }, { objectId: 8, itemId: PERIN, count: 20 }]), 0,
    );

    const bag = new Map([...own.inventory!].map(([objectId, item]) => [objectId, [item.itemId, item.count]]));
    expect(bag).toEqual(new Map([
      [0, [POTION, 30]], [1, [HAT, 1]], [2, [WING_CAPE, 1]], [3, [PERIN, 5]], [5, [SWORD, 1]],
    ]));
    expect(own.inventorySlots.slice(0, 6)).toEqual([2, 0, 1, 5, 3, 4]);
    // a double-click on the bag's Perin sends DOUSEITEM for its object: the server's Perin, not its wing cape
    const perin = own.inventorySlots.slice(0, 42).find((objectId) => own.inventory!.get(objectId)?.itemId === PERIN);
    expect(perin).toBe(3);
  });
});
