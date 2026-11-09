// Neuz's item container moves that the trade's end runs on the client (2026-11-10, trade research §5.5): the server sends
// no inventory after TRADECONSENT, so each client moves the items itself, as the world server did
// (`CVTInfo::TradeLastConfirm`, `_Common/MoverItem.cpp:351-518`).
//
//   CItemContainer::Clear       _Common/Item.h:480-496     a fresh container: position i holds object i
//   CItemContainer::IsFull      Item.h:629-658             whether `n` of an item fits (onto stacks, then empty positions)
//   CItemContainer::Add         Item.h:660-759             onto the same stacks first, in position order, then the first
//                                                          empty position's object takes the rest
//   CItemContainer::RemoveAtId  Item.h:761-772             the object emptied; a bag position keeps its object
//   CVTInfo::TradeConsent       MoverItem.cpp:132-215      the own traded items out (into a 25-slot container), the
//                                                          other's in, the container to the other, the penya

import type { InventoryItem } from '@flyffweb/protocol';

/** `MAX_INVENTORY` (`_Common/ProjectCmn.h:7`): the bag's positions, `m_dwIndexNum` of the inventory. */
export const BAG_POSITIONS = 42;
/** `MAX_TRADE` (`ProjectCmn.h:11`). */
export const TRADE_SLOTS = 25;
/** `NULL_ID`. */
const NULL_ID = 0xffffffff;

/**
 * A container as the browser keeps one: its items by object ID (an empty object is absent) and `m_apIndex`, positions to
 * object IDs; the first `positions` of `slots` are the ones `Add` and `IsFull` walk (`m_dwIndexNum`).
 */
export interface ItemContainer {
  items: Map<number, InventoryItem>;
  slots: number[];
  positions: number;
}

/** An item's `dwPackMax`, 1 for one that does not stack (or that the catalog lacks). */
export type PackMax = (itemId: number) => number;

/** A fresh container of `size` positions (`SetItemContainer( ITYPE_ITEM, size )` then `Clear`). */
export function freshContainer(size: number): ItemContainer {
  return { items: new Map(), slots: Array.from({ length: size }, (_, i) => i), positions: size };
}

/** The objects `Add` and `IsFull` walk, in position order: each position's object, when it is one of the container's. */
function* positionObjects(container: ItemContainer): Generator<number> {
  for (let i = 0; i < container.positions; i++) {
    const id = container.slots[i];
    // `nId < 0 || nId >= m_dwItemMax` is skipped (NULL_ID is -1 as an int)
    if (id === undefined || id === NULL_ID || id < 0 || id >= container.slots.length) continue;
    yield id;
  }
}

/** Same item, flag and charged state: what `Add` and `IsFull` stack together. */
function sameKind(a: InventoryItem, b: InventoryItem): boolean {
  return a.itemId === b.itemId && (a.flag ?? 0) === (b.flag ?? 0) && (a.charged ?? 0) === (b.charged ?? 0);
}

/** `CItemContainer::IsFull( pElem, pItemProp, nNum )`: true when `count` of `item` does not fit. */
export function containerIsFull(container: ItemContainer, item: InventoryItem, count: number, packMax: PackMax): boolean {
  const max = packMax(item.itemId);
  let left = count;
  for (const id of positionObjects(container)) {
    const there = container.items.get(id);
    if (there === undefined) {
      if (left > max) left -= max;
      else return false;
    } else if (sameKind(item, there)) {
      if (there.count + left > max) left -= max - there.count;
      else return false;
    }
  }
  return true;
}

/**
 * `CItemContainer::Add( pElem )`: false (nothing added) when it is full. A stackable item (`dwPackMax` > 1) first tops
 * up the stacks of the same kind in position order; what is left goes to the first empty positions, a full stack each,
 * as copies of `item` whose object ID becomes the position's object.
 */
export function containerAdd(container: ItemContainer, item: InventoryItem, packMax: PackMax): boolean {
  const max = packMax(item.itemId);
  let left = item.count;
  if (containerIsFull(container, item, left, packMax)) return false;
  if (max > 1) {
    for (const id of positionObjects(container)) {
      const there = container.items.get(id);
      if (there === undefined || !sameKind(there, item) || there.count >= max) continue;
      if (there.count + left > max) {
        left -= max - there.count;
        container.items.set(id, { ...there, count: max });
      } else {
        container.items.set(id, { ...there, count: there.count + left });
        left = 0;
        break;
      }
    }
  }
  if (left > 0) {
    for (const id of positionObjects(container)) {
      if (container.items.has(id)) continue;
      const count = left > max ? max : left;
      container.items.set(id, { ...item, objectId: id, count });
      left -= count;
      if (left === 0) break;
    }
  }
  return true;
}

/** `CItemContainer::RemoveAtId`: the object emptied (a bag position keeps its object, as `m_dwObjIndex < m_dwIndexNum`). */
export function containerRemove(container: ItemContainer, objectId: number): void {
  container.items.delete(objectId);
}

/** One side's trade slot: the object put in it and the count traded (`SetExtra( nItemNum )`). */
export interface TradeSlot {
  objectId: number;
  count: number;
}

/**
 * `CVTInfo::TradeConsent` (`MoverItem.cpp:132-215`) from the own side: the own traded items leave `own` (a stack only
 * the traded count) and gather in a 25-position container; the partner's traded items join `own` and leave `partner`;
 * the container's items join `partner`. The penya is the caller's. A slot whose object is gone is passed over.
 */
export function tradeConsent(
  own: ItemContainer, mine: ReadonlyArray<TradeSlot | null>, partner: ItemContainer, theirs: ReadonlyArray<TradeSlot | null>,
  packMax: PackMax,
): void {
  const given = freshContainer(TRADE_SLOTS);
  for (const slot of mine) {
    const item = slot === null ? undefined : own.items.get(slot.objectId);
    if (slot === null || item === undefined) continue;
    if (packMax(item.itemId) > 1) {
      const left = item.count - slot.count;
      containerAdd(given, { ...item, count: slot.count }, packMax);
      if (left === 0) containerRemove(own, slot.objectId);
      else own.items.set(slot.objectId, { ...item, count: left });
    } else {
      containerAdd(given, item, packMax);
      containerRemove(own, slot.objectId);
    }
  }
  for (const slot of theirs) {
    const item = slot === null ? undefined : partner.items.get(slot.objectId);
    if (slot === null || item === undefined) continue;
    if (packMax(item.itemId) > 1) {
      const left = item.count - slot.count;
      containerAdd(own, { ...item, count: slot.count }, packMax);
      if (left === 0) containerRemove(partner, slot.objectId);
      else partner.items.set(slot.objectId, { ...item, count: left });
    } else {
      containerAdd(own, item, packMax);
      containerRemove(partner, slot.objectId);
    }
  }
  // `cbI = a.GetCount()`, then `a.GetAtId( i )` for i below it: the container fills its objects in order
  const count = given.items.size;
  for (let i = 0; i < count; i++) {
    const item = given.items.get(i);
    if (item !== undefined) containerAdd(partner, item, packMax);
  }
}
