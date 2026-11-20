// custom (owner 2026-11-20, "only outside of town"): whether the own player stands in a town, by V15's own flag: the
// RA_TOWN rows (Resource/define.h:146, 0x400) of the worlds' `.rgn` files, which `CMover::UpdateRegionAttr` ORs together
// for the rects the player stands in (Source/_Common/Mover.cpp:2689-2722, `CRect::PtInRect`; `IsRegionAttr`, Mover.h:1021).
//
// Only WdMadrigal.rgn (world 1) has RA_TOWN rows: Flaris, Saint Morning and Darkon's town (each also RA_SAFETY, 0x410).
// The small RA_SAFETY spots round field NPCs are not towns. The client's data keeps no region flags (its regions are the
// music's, tools/convert/src/data/audioCatalog.ts), so the rows are copied here: a code-only change, no convert. The
// corpus test (test/townRegions.corpus.test.ts) checks them against the client's WdMadrigal.rgn.

import type { Vec3 } from '@flyffweb/protocol';

/** `RA_TOWN` (Resource/define.h:146). */
export const RA_TOWN = 0x400;

/** A region's `m_rect`: left, top, right, bottom in world x and z. */
export type RegionRect = readonly [number, number, number, number];

/** The RA_TOWN rows of each world's `.rgn`, in file order, by world id (`Resource/defineWorld.h`). */
export const TOWN_RECTS: ReadonlyMap<number, readonly RegionRect[]> = new Map([
  [1, [ // WI_WORLD_MADRIGAL, World/WdMadrigal/WdMadrigal.rgn
    [3703, 4338, 3969, 4562], // Darkon's town
    [6870, 3184, 7073, 3285], // Flaris
    [7073, 3170, 7242, 3289],
    [6918, 3285, 7004, 3384],
    [6983, 3321, 7003, 3338],
    [7214, 3170, 7236, 3196],
    [8444, 3561, 8485, 3609], // Saint Morning
    [8229, 3534, 8604, 3941],
    [8323, 3938, 8533, 4109],
    [8523, 3597, 8544, 3620],
    [8344, 3972, 8360, 3988],
  ]],
]);

/**
 * `IsRegionAttr( RA_TOWN )` at `pos` in `worldId`: inside one of its RA_TOWN rects, as `PtInRect` takes the point
 * `(LONG)x, (LONG)z`: left and top inclusive, right and bottom exclusive.
 */
export function inTown(worldId: number, pos: Vec3): boolean {
  const rects = TOWN_RECTS.get(worldId);
  if (rects === undefined) return false;
  const x = Math.trunc(pos[0]), z = Math.trunc(pos[2]);
  return rects.some(([left, top, right, bottom]) => x >= left && x < right && z >= top && z < bottom);
}
