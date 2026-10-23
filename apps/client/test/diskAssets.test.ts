import { describe, expect, it } from 'vitest';
import { HGT } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import { HAttr } from '../src/world/sim/collision';
import { Terrain } from './helpers/diskAssets';
import type { DiskAssets } from './helpers/diskAssets';

const MPU = 4;
const SIDE = 129;

/** A Terrain of one tile (column 1, row 0) whose heights are `heights`, read from a hand-made store. */
function terrainOf(heights: Float32Array): Terrain {
  const tile: WebTile = { x: 1, y: 0, heights, water: new Uint8Array(512), landAttr: new Uint8Array(256), layers: [], objects: [] };
  const assets = { tile: (path: string) => (path === 'tiles/1_0.bin' ? tile : undefined) } as unknown as DiskAssets;
  const manifest = { mpu: MPU, size: [2, 1], tiles: { '1_0': 'tiles/1_0.bin' } } as unknown as WorldManifest;
  return new Terrain(assets, manifest);
}

/** World D3D x of tile 1's cell column `gx`, plus `dx` cells. */
const xOf = (gx: number, dx = 0): number => (128 + gx + dx) * MPU;

describe('Terrain (the live test\'s ground from the converted tiles)', () => {
  it('landAttrAt reads the HGT_* flag on the height at the corner of the cell (CWorld::GetHeightAttribute)', () => {
    const heights = new Float32Array(SIDE * SIDE).fill(5);
    heights[2 + 3 * SIDE] = 5 + HGT.NOWALK;
    heights[4 + 3 * SIDE] = 5 + HGT.NOMOVE;
    heights[6 + 3 * SIDE] = 5 + HGT.DIE;
    heights[8 + 3 * SIDE] = 5 + HGT.NOFLY;
    const terrain = terrainOf(heights);
    // the whole cell from the corner (2, 3) up to the next corners reads the corner's flag
    expect(terrain.landAttrAt(xOf(2), 3 * MPU)).toBe(HAttr.NOWALK);
    expect(terrain.landAttrAt(xOf(2, 0.99), 3.99 * MPU)).toBe(HAttr.NOWALK);
    expect(terrain.landAttrAt(xOf(1, 0.99), 3 * MPU)).toBe(HAttr.NONE);
    expect(terrain.landAttrAt(xOf(4, 0.5), 3.5 * MPU)).toBe(HAttr.NOMOVE);
    expect(terrain.landAttrAt(xOf(6, 0.5), 3.5 * MPU)).toBe(HAttr.DIE);
    expect(terrain.landAttrAt(xOf(8, 0.5), 3.5 * MPU)).toBe(HAttr.NOFLY);
    // the tile's patch attributes are not read; off the tiles is nothing
    expect(terrain.landAttrAt(10, 10)).toBe(HAttr.NONE);
    expect(terrain.ground.landAttr(xOf(2), 3 * MPU)).toBe(HAttr.NOWALK);
  });

  it('landTri gives the triangle of GetLandTri from the heights, without their flags', () => {
    // heights 10 gx + gz, the corner (1, 1) flagged no-walk (it still stands at 11)
    const heights = new Float32Array(SIDE * SIDE);
    for (let gz = 0; gz < SIDE; gz++) for (let gx = 0; gx < SIDE; gx++) heights[gx + gz * SIDE] = 10 * gx + gz;
    heights[1 + SIDE] = 11 + HGT.NOWALK;
    const terrain = terrainOf(heights);
    const at = (x: number, z: number): number[] => {
      const out = new Float32Array(9);
      expect(terrain.ground.landTri!(x, z, out)).toBe(true);
      return Array.from(out);
    };
    const c = (gx: number, gz: number): number[] => [xOf(gx), 10 * gx + gz, gz * MPU];
    // cell (0, 0) is even: under its cut (0, 0)-(1, 1) the corners 0, 3, 1; cell (1, 0) is odd: before its cut 0, 2, 1
    expect(at(xOf(0, 0.75), 0.25 * MPU)).toEqual([...c(0, 0), ...c(1, 1), ...c(1, 0)]);
    expect(at(xOf(0, 0.25), 0.75 * MPU)).toEqual([...c(0, 0), ...c(0, 1), ...c(1, 1)]);
    expect(at(xOf(1, 0.25), 0.25 * MPU)).toEqual([...c(1, 0), ...c(1, 1), ...c(2, 0)]);
    expect(at(xOf(1, 0.75), 0.75 * MPU)).toEqual([...c(2, 0), ...c(1, 1), ...c(2, 1)]);
    expect(terrain.ground.landTri!(10, 10, new Float32Array(9))).toBe(false); // tile 0 is not there
  });
});
