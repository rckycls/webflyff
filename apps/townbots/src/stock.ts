// What each bot holds of its supplies (potions, upgrade materials and spares, shop stock), written to a file now and
// then, so that a refill sends each bot only what it lacks (the install's refill reads it).
import { writeFileSync } from 'node:fs';
import type { InventoryItem } from '@flyffweb/protocol';

/** The bag's count of each of `ids` (stacks summed, single pieces counted), 0 for one it has none of. */
export function supplyCounts(bag: ReadonlyMap<number, InventoryItem>, ids: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of ids) out[id] = 0;
  for (const item of bag.values()) if (Object.hasOwn(out, item.itemId)) out[item.itemId]! += item.count;
  return out;
}

/** `{ at, bots: { account: { itemId: count } } }`. */
export function writeStock(file: string, bots: ReadonlyMap<string, Record<number, number>>, at: Date = new Date()): void {
  writeFileSync(file, `${JSON.stringify({ at: at.toISOString(), bots: Object.fromEntries(bots) }, null, 1)}\n`, 'utf8');
}
