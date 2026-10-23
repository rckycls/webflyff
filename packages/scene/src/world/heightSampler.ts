// Ground height under a point, for walking. Copies CLandscape::GetHeight( FLOAT x, FLOAT z ) (Source/_Common/lod.cpp:1205):
// the bilinear blend of the four corners of the cell, each height without its HGT_ flag (GetHeightMap, lod.cpp:1657).

import { MAP_SIZE, cleanHeight } from '@flyffweb/formats';
import type { WebTile } from '@flyffweb/formats';

const SIDE = MAP_SIZE + 1;

/**
 * The ground height at `localX`, `localZ`: world distances from the tile's corner in the tile's own D3D frame (x with
 * the column, z with the row, so a caller with a web position passes `-z` minus the tile's offset). `mpu` is the
 * world's meters per unit. 0 outside the tile, as the C++ returns. (At the far edge, x or z = 128 cells, the cell is
 * the last one with the weight at its far corner; the C++ reads a neighbour it then multiplies by 0.)
 */
export function sampleHeight(tile: Pick<WebTile, 'heights'>, localX: number, localZ: number, mpu: number): number {
  const x = localX / mpu;
  const z = localZ / mpu;
  if (x < 0 || x > MAP_SIZE || z < 0 || z > MAP_SIZE) return 0;

  const px = Math.min(Math.floor(x), MAP_SIZE - 1);
  const pz = Math.min(Math.floor(z), MAP_SIZE - 1);
  const dx = x - px;
  const dz = z - pz;

  const at = px + pz * SIDE;
  const y1 = cleanHeight(tile.heights[at]!);
  const y2 = cleanHeight(tile.heights[at + 1]!);
  const y3 = cleanHeight(tile.heights[at + SIDE]!);
  const y4 = cleanHeight(tile.heights[at + SIDE + 1]!);
  return y1 * (1 - dx) * (1 - dz) + y2 * dx * (1 - dz) + y3 * (1 - dx) * dz + y4 * dx * dz;
}
