/**
 * custom (owner 2026-11-15): Auto Play's auto pots. Which item to use for a low gauge, and how fast. V15 potions, MP
 * refreshers and FP drinks have no cooldown (`CooltimeMgr.cpp:19-43`, the IK2_POTION line is commented out), so the
 * bot paces itself: one item per gauge per 500 ms, and then only once the gauge moved or 800 ms passed. Food and pills
 * keep their V15 cooldown (`ItemUse.cooldownLeft`).
 */
import type { InventoryItem } from '@flyffweb/protocol';
import { GAUGE_ROWS } from './settings';
import type { AutoPlaySettings, GaugeRow } from './settings';

export interface Gauges { hp: number; maxHp: number; mp: number; maxMp: number; fp: number; maxFp: number }

/** At least this long between two items for one gauge (ms). */
export const POTION_MIN_GAP_MS = 500;
/** Without a change of the gauge, this long before the next item for it (ms). */
export const POTION_WAIT_MS = 800;

type Inventory = ReadonlyMap<number, InventoryItem> | null;

/** `IK2_REFRESHER` 11, `IK2_POTION` 12, `IK2_FOOD` 14 and `IK3_PILL` 59 (Resource/defineItemkind.h): what a row may take. */
const POTION_KIND2 = new Set([11, 12, 14]);
const IK3_PILL = 59;

/** Whether an item is one the auto pots offer: a refresher, a potion, food or a pill. */
export function isPotionProp(prop: { kind2: number; kind3: number }): boolean {
  return POTION_KIND2.has(prop.kind2) || prop.kind3 === IK3_PILL;
}

/** The first stack of `itemIndex` in the bag with something left. */
export function findStack(inventory: Inventory, itemIndex: number): InventoryItem | undefined {
  if (!inventory || itemIndex <= 0) return undefined;
  for (const item of inventory.values()) if (item.itemId === itemIndex && item.count > 0) return item;
  return undefined;
}

/** How many of `itemIndex` the bag holds, over all stacks. */
export function countOf(inventory: Inventory, itemIndex: number): number {
  if (!inventory || itemIndex <= 0) return 0;
  let count = 0;
  for (const item of inventory.values()) if (item.itemId === itemIndex) count += Math.max(0, item.count);
  return count;
}

export class PotionPacer {
  private readonly last = new Map<GaugeRow, { at: number; value: number }>();

  canUse(row: GaugeRow, now: number, value: number): boolean {
    const last = this.last.get(row);
    if (!last) return true;
    const since = now - last.at;
    return since >= POTION_MIN_GAP_MS && (value !== last.value || since >= POTION_WAIT_MS);
  }

  used(row: GaugeRow, now: number, value: number): void {
    this.last.set(row, { at: now, value });
  }
}

/** The gauge's value and maximum for a row. */
export function gaugeOf(g: Gauges, row: GaugeRow): { value: number; max: number } {
  return row === 'hp' ? { value: g.hp, max: g.maxHp } : row === 'mp' ? { value: g.mp, max: g.maxMp } : { value: g.fp, max: g.maxFp };
}

/**
 * The item to use now, HP first, then MP, then FP: a row fires when it is on, has an item, its gauge is below its
 * percent of the maximum, a stack is in the bag, the item is off cooldown and the pacer allows. Null when none fires.
 */
export function pickPotion(s: AutoPlaySettings['pots'], g: Gauges, inventory: Inventory,
  cooldownLeft: (itemId: number) => number, pacer: PotionPacer, now: number): { row: GaugeRow; objectId: number } | null {
  for (const row of GAUGE_ROWS) {
    const set = s.rows[row];
    if (!set.on || set.itemIndex <= 0) continue;
    const { value, max } = gaugeOf(g, row);
    if (max <= 0 || value * 100 >= max * set.below) continue;
    const stack = findStack(inventory, set.itemIndex);
    if (!stack || cooldownLeft(set.itemIndex) > 0 || !pacer.canUse(row, now, value)) continue;
    return { row, objectId: stack.objectId };
  }
  return null;
}
