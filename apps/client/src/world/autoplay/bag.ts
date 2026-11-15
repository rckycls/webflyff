/** custom (owner 2026-11-15): Auto Play's "bag full": no free position among the bag's 42 (`m_dwIndexNum`). */
import type { InventoryItem } from '@flyffweb/protocol';
import { BAG_POSITIONS } from '../trade/itemContainer';

/** Whether every one of the bag's positions holds an item (the worn slots after them do not count). */
export function bagIsFull(inventory: ReadonlyMap<number, InventoryItem> | null, slots: readonly number[]): boolean {
  if (inventory === null || slots.length < BAG_POSITIONS) return false;
  for (let i = 0; i < BAG_POSITIONS; i++) if (!inventory.has(slots[i]!)) return false;
  return true;
}
