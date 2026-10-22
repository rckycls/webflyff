// One terrain tile as a single 129 x 129 vertex grid, copying how the Windows client builds its landscape.
//
// Vertices: CLandscape::SetVertices (Source/_Common/lod.cpp:688-774). The C++ makes one 9 x 9 vertex buffer per patch;
// here the whole tile is one grid, so every per-patch value is written in tile coordinates (col, row in 0..128).
//   position  lod.cpp:710-711  (X * PATCH_SIZE + j + m_nWorldX) * MPU, GetHeightMap (heights without their HGT_ flag), z likewise
//   normal    lod.cpp:712-741  the sum of four cross products around the vertex (see `normalsOf`)
//   uv        lod.cpp:760-761  (j / PATCH_SIZE) * 3: three texture repeats per patch
//   uv1       lod.cpp:762-763  fTemp2 * col + fTemp / 2, the light map coordinate (fTemp and fTemp2 at :696-697)
// The C++ also has two other uv branches, but both are dead: the `GetLandMark` one is commented out (:750-758, so it
// does not depend on the world's MPU), and so is the `* MPU` variant (:765-770). Every world, Madrigal's MPU 4
// included, gets `* 3`.
//
// Triangles: g_pIB, the LOD 0 part (World3D.cpp:2174-2189, 128 triangles per patch). Its diagonals pass through the
// centre of each 2 x 2 block of quads, which is: quad (r, c) is cut from its (r, c) corner to the opposite one when
// r + c is even, and from (r, c + 1) to (r + 1, c) when odd. D3D draws those triangles clockwise seen from above (the
// device culls D3DCULL_CCW, World3D.cpp:446). The web frame mirrors z, which does not change what the picture looks
// like from above, so three.js (front = counter-clockwise) gets every triangle with two of its corners swapped.

import { MAP_SIZE, NUM_PATCHES_PER_SIDE, PATCH_SIZE, cleanHeight } from '@flyffweb/formats';
import type { WebTile } from '@flyffweb/formats';
import { BufferAttribute, BufferGeometry } from 'three';

/** Vertices along one side of a tile. */
export const VERTICES_PER_SIDE = MAP_SIZE + 1;
export const PATCH_COUNT = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;
/** 8 x 8 quads of 2 triangles of 3 vertices. */
export const INDICES_PER_PATCH = PATCH_SIZE * PATCH_SIZE * 2 * 3;

/** lod.cpp:760: tu1 = j / PATCH_SIZE * 3. */
const TEXTURE_REPEATS_PER_PATCH = 3;
/** lod.cpp:696-697. */
const F_TEMP = 1 / MAP_SIZE;
const F_TEMP2 = (F_TEMP * (PATCH_SIZE - 1) * NUM_PATCHES_PER_SIDE) / MAP_SIZE;

/**
 * The tile's vertices: `position`, `normal`, `uv` (layer texture) and `uv1` (light map), no index (see `layerIndices`).
 * Vertex (col, row) is at web `[(x * 128 + col) * mpu, height, -((y * 128 + row) * mpu)]`, the height without its flag.
 * The bounding sphere is computed, so meshes built on shared attributes can reuse it.
 */
export function buildTerrainGeometry(tile: WebTile, mpu: number): BufferGeometry {
  const count = VERTICES_PER_SIDE * VERTICES_PER_SIDE;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = cleanHeight(tile.heights[i]!);

  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const uv1 = new Float32Array(count * 2);
  let at = 0;
  for (let row = 0; row < VERTICES_PER_SIDE; row++) {
    // 0 - n and not -n: a zero must be +0 (a row 0 of tile 0 would give -0)
    const z = 0 - (tile.y * MAP_SIZE + row) * mpu;
    for (let col = 0; col < VERTICES_PER_SIDE; col++, at++) {
      position[at * 3] = (tile.x * MAP_SIZE + col) * mpu;
      position[at * 3 + 1] = heights[at]!;
      position[at * 3 + 2] = z;
      uv[at * 2] = (col / PATCH_SIZE) * TEXTURE_REPEATS_PER_PATCH;
      uv[at * 2 + 1] = (row / PATCH_SIZE) * TEXTURE_REPEATS_PER_PATCH;
      uv1[at * 2] = F_TEMP2 * col + F_TEMP / 2;
      uv1[at * 2 + 1] = F_TEMP2 * row + F_TEMP / 2;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normalsOf(heights, mpu), 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('uv1', new BufferAttribute(uv1, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * lod.cpp:712-741. With L, D, R, U the neighbours at col - 1, row + 1, col + 1 and row - 1 (the ones that are in the
 * tile), the normal is the sum of `(P - A) x (A - B)` for the pairs (L, D), (D, R), (R, U), (U, L) that exist, which is
 * `a x b` for the offsets a, b of A and B from P. Written out for ground spacing m and height differences
 * ly, dy, ry, uy of the neighbours to the vertex, the four terms are
 *   (L, D) (ly m, m m, -m dy)   (D, R) (-m ry, m m, -m dy)   (R, U) (-m ry, m m, m uy)   (U, L) (m ly, m m, m uy)
 * in the D3D frame. The web frame negates z, so the code below adds the z terms with their signs turned round. (The C++
 * tests `col - 1 > 0` where `>= 0` is meant, so it ignores column 0 and row 0 for the vertices of column 1 and row 1;
 * here they count.)
 */
function normalsOf(heights: Float32Array, m: number): Float32Array {
  const last = MAP_SIZE;
  const normals = new Float32Array(heights.length * 3);
  for (let row = 0; row <= last; row++) {
    for (let col = 0; col <= last; col++) {
      const at = row * VERTICES_PER_SIDE + col;
      const h = heights[at]!;
      const hasL = col > 0;
      const hasR = col < last;
      const hasU = row > 0;
      const hasD = row < last;
      const ly = hasL ? heights[at - 1]! - h : 0;
      const ry = hasR ? heights[at + 1]! - h : 0;
      const uy = hasU ? heights[at - VERTICES_PER_SIDE]! - h : 0;
      const dy = hasD ? heights[at + VERTICES_PER_SIDE]! - h : 0;

      let x = 0;
      let y = 0;
      let z = 0;
      if (hasL && hasD) {
        x += ly * m;
        y += m * m;
        z += m * dy;
      }
      if (hasD && hasR) {
        x -= m * ry;
        y += m * m;
        z += m * dy;
      }
      if (hasR && hasU) {
        x -= m * ry;
        y += m * m;
        z -= m * uy;
      }
      if (hasU && hasL) {
        x += m * ly;
        y += m * m;
        z -= m * uy;
      }
      const length = Math.hypot(x, y, z);
      normals[at * 3] = x / length;
      normals[at * 3 + 1] = y / length;
      normals[at * 3 + 2] = z / length;
    }
  }
  return normals;
}

/**
 * The triangles of the patches with `patchEnable[p] !== 0` (p = X + Y * 16, as CLandLayer::m_aPatchEnable), 384 indices
 * each, into the grid of `buildTerrainGeometry`. Counter-clockwise seen from above, which is front-facing for three.js.
 */
export function layerIndices(patchEnable: Uint8Array): Uint32Array {
  let enabled = 0;
  for (let p = 0; p < PATCH_COUNT; p++) if (patchEnable[p] !== 0) enabled++;

  const out = new Uint32Array(enabled * INDICES_PER_PATCH);
  let at = 0;
  for (let p = 0; p < PATCH_COUNT; p++) {
    if (patchEnable[p] === 0) continue;
    const firstRow = Math.floor(p / NUM_PATCHES_PER_SIDE) * PATCH_SIZE;
    const firstCol = (p % NUM_PATCHES_PER_SIDE) * PATCH_SIZE;
    for (let row = firstRow; row < firstRow + PATCH_SIZE; row++) {
      for (let col = firstCol; col < firstCol + PATCH_SIZE; col++) {
        const p00 = row * VERTICES_PER_SIDE + col;
        const p01 = p00 + 1;
        const p10 = p00 + VERTICES_PER_SIDE;
        const p11 = p10 + 1;
        // PATCH_SIZE is even, so the parity of the tile's row + col is the parity inside the patch
        if ((row + col) % 2 === 0) {
          out[at++] = p00;
          out[at++] = p01;
          out[at++] = p11;
          out[at++] = p00;
          out[at++] = p11;
          out[at++] = p10;
        } else {
          out[at++] = p00;
          out[at++] = p01;
          out[at++] = p10;
          out[at++] = p01;
          out[at++] = p11;
          out[at++] = p10;
        }
      }
    }
  }
  return out;
}
