/**
 * custom (owner 2026-11-15): Auto Play's buff list (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.7): an entry
 * is recast when its buff is missing or has under 10 s left. A buff is keyed as `CBuffMgr` keys it (`wType`, `wId`):
 * a skill's by its skill id, an item's by its item index (buffs.ts).
 */
import { BUFF_ITEM, BUFF_SKILL } from '../buffs';
import type { BuffShown } from '../buffs';
import type { BuffEntry } from './settings';

/** Recast under this much left (ms). */
export const BUFF_RECAST_MS = 10_000;

/** `DST_HP`, `DST_MP`, `DST_FP` (Resource/defineAttribute.h): a heal's effects, not a buff's (buffs.ts `NOT_SET`). */
const HEALS = new Set([38, 39, 40]);

/** Whether an item is one the buff list offers: not worn (`dwParts` none) and with an effect that is not a heal. */
export function isBuffItemProp(prop: { part: number; destParams: readonly number[] }): boolean {
  return prop.part < 0 && prop.destParams.some((dst) => dst > 0 && !HEALS.has(dst));
}

/** The buff an entry gives: a skill slot's by its skill id (`skillIdOf`), an item's by its index; null when unknown. */
export function buffOf(e: BuffEntry, skillIdOf: (skillIndex: number) => number | undefined): { buffType: number; id: number } | null {
  if (e.kind === 'item') return { buffType: BUFF_ITEM, id: e.index };
  const id = skillIdOf(e.index);
  return id === undefined ? null : { buffType: BUFF_SKILL, id };
}

/** The first entry whose buff is missing or ends within 10 s (an endless one never), and that can be used now. */
export function pickBuff(list: readonly BuffEntry[], buffs: readonly BuffShown[],
  of: (e: BuffEntry) => { buffType: number; id: number } | null, usable: (e: BuffEntry) => boolean, _now: number): BuffEntry | null {
  for (const entry of list) {
    const key = of(entry);
    if (key === null) continue;
    const on = buffs.find((b) => b.buffType === key.buffType && b.id === key.id);
    const due = on === undefined || (on.totalMs > 0 && on.leftMs < BUFF_RECAST_MS);
    if (due && usable(entry)) return entry;
  }
  return null;
}
