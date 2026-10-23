// The world as the movement rules read it (`apps/client/src/world/sim/`, Neuz's `CActionMover::ProcessCollisionGround`
// and the `CWorld` functions it calls): the `Ground` they are given, the placed objects in it, and the land read from
// the tiles' heights. The rules are the client's; what the world holds is the stage's (`WorldStage.ground`), whose
// objects come from collision.ts. D3D coordinates throughout: x with a tile's column, z with its row (web z is -z),
// and floats as the C++ keeps them (`f32` at every store).

import { MAP_SIZE, cleanHeight, heightFlag } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import { sampleHeight } from './heightSampler';

const f32 = Math.fround;

/** `HATTR_NONE` (`Source/_Common/landscape.h:34`): land that allows everything. */
const HATTR_NONE = 0;

/** A placed world object, as far as collision sees it. */
export interface CollisionObject {
  /** The model's collision mesh (`collisionBin.ts`): 9 floats a triangle, in the model's own space (D3D). */
  triangles: Float32Array;
  /**
   * The placed object's D3D world matrix (`CObj::GetMatrixWorld`): the 16 floats of the `D3DXMATRIX` in memory order,
   * `_11 _12 _13 _14 _21 ... _44`, which a row vector multiplies from the left (the translation is at 12..14). Not
   * changed once given: its inverse is kept. (The triangles' bounds are kept the same way.)
   */
  matrix: Float32Array;
  /**
   * The model turns see-through between the camera and the player (`MODELELEM::m_bTrans`, `bTrans` in mdlObj.inc):
   * the camera's test passes through it (`IntersectObjLine2`'s `bSkipTrans`); movers still collide with it.
   */
  trans?: boolean;
  /**
   * A click on the model sets a destination on it (`MODELELEM::m_bPick`, `bPick` in mdlObj.inc): `CWorld::PickObject`
   * with `bOnlyTopPick` tests only such models, and a click passes through any other to what is behind it.
   */
  pick?: boolean;
}

/** The world around the movers, as the collision rules read it. D3D x and z throughout. */
export interface Ground {
  /**
   * The terrain's height (`CWorld::GetLandHeight`, the bilinear blend of the cell's corners), or null where no land
   * is loaded (`GetLandscape` is NULL). Movers stand on the land's triangle instead where `landTri` is given.
   */
  terrainHeight(x: number, z: number): number | null;
  /**
   * `CWorld::GetHeightAttribute` (`World.cpp:1717`, `CLandscape::GetHeightAttribute`, `lod.cpp:1633`): the `HATTR_*`
   * of the land there, which Neuz reads from the `HGT_*` flag added to the height at the corner of the cell (not
   * from the tile's patch attributes, `m_aLandAttr`, which nothing reads). 0 where unknown.
   */
  landAttr(x: number, z: number): number;
  /**
   * The tiles' world objects (`OT_OBJ`) with collision meshes around (x, z), in the order
   * `FOR_LINKMAP( this, vPos, pObj, nRange, CObj::linkStatic, ... )` (`World.h:865-904`) visits them with `range` as
   * its `nRange`, which the rules depend on (the first one hit wins): link level by link level (0 to 6: an object is
   * linked at the first level whose cell is wider than it, in the cell its position is in, `Obj.cpp:974-1020`,
   * `lod.cpp:1439-1481`), then the level's cells row by row (z, then x), then each cell's objects in its list's order.
   * Each level's cells are the point's, the one beside it on the side of its middle the point is on, and `range` cells
   * of level 0 more each way: the movers' rules ask with 0 (`ProcessCollision`, `ProcessUnderCollision`,
   * `GetOverHeight`: the 2 x 2 cells of each level nearest the point), the chase camera with 5 (`IntersectObjLine2`).
   */
  objectsNear(x: number, z: number, range: number): readonly CollisionObject[];
  /**
   * `CWorld::GetLandTri` (`World.cpp:1251-1353`): the land's triangle under (x, z), its three corners (9 floats, world
   * coordinates) into `out`, as `landTriangle` makes it from the tiles' heights; false where no land is loaded
   * (nothing written). Optional: a Ground without it stands movers on `terrainHeight`, and no land slides them.
   */
  landTri?(x: number, z: number, out: Float32Array): boolean;
}

/**
 * `CWorld::GetLandTri` (`World.cpp:1251-1353`, the client's `#else` code) from the tiles' heights: the triangle of
 * the land under (x, z) into `out` (9 floats). The cell (in the tile at column `lx`, row `lz`, cell `gx`, `gz`) is cut
 * along (0, 0)-(1, 1) where `gx + gz` is even and along (1, 0)-(0, 1) where it is odd, and its corners come in the
 * C++'s order (each triangle's normal faces up). `height( lx, lz, gx, gz )` is the height at corner (gx, gz), 0 to
 * 128, of that tile without its `HGT_*` flag (`CLandscape::GetHeight( DWORD, DWORD )`, `lod.cpp:1240`), or null where
 * the tile is not loaded; then, and off the world's low edges, nothing is written and the answer is false.
 */
export function landTriangle(
  x: number, z: number, mpu: number, height: (lx: number, lz: number, gx: number, gz: number) => number | null,
  out: Float32Array,
): boolean {
  if (!(x >= 0 && z >= 0)) return false; // VecInWorld (World.h:726)
  const cx = f32(x / mpu); // x /= m_iMPU
  const cz = f32(z / mpu);
  const lx = Math.trunc(f32(cx / MAP_SIZE));
  const lz = Math.trunc(f32(cz / MAP_SIZE));
  const gx = Math.trunc(cx) - lx * MAP_SIZE;
  const gz = Math.trunc(cz) - lz * MAP_SIZE;
  const glx = f32(cx - Math.trunc(cx));
  const glz = f32(cz - Math.trunc(cz));
  const h00 = height(lx, lz, gx, gz);
  if (h00 === null) return false;
  const order = (gx + gz) % 2 === 0 ? (glx > glz ? EVEN_UNDER : EVEN_OVER) : (f32(glx + glz) < 1 ? ODD_UNDER : ODD_OVER);
  for (let n = 0; n < 3; n++) {
    const k = order[n]!;
    const ox = k & 1;
    const oz = k >> 1;
    out[n * 3] = (gx + ox + lx * MAP_SIZE) * mpu;
    out[n * 3 + 1] = k === 0 ? h00 : height(lx, lz, gx + ox, gz + oz) ?? 0;
    out[n * 3 + 2] = (gz + oz + lz * MAP_SIZE) * mpu;
  }
  return true;
}

// `landTriangle`'s corners, numbered as the C++'s comments do: 0 (gx, gz), 1 (gx + 1, gz), 2 (gx, gz + 1), 3 (gx + 1, gz + 1)
const EVEN_UNDER: readonly number[] = [0, 3, 1];
const EVEN_OVER: readonly number[] = [0, 2, 3];
const ODD_UNDER: readonly number[] = [0, 2, 1];
const ODD_OVER: readonly number[] = [1, 2, 3];

/** What the land of a `Ground` reads from a tile: its raw heights, `HGT_*` flags still added (`WebTile.heights`). */
export type TileHeights = Pick<WebTile, 'heights'>;

/** The land part of a `Ground`, its three functions; `landTri` is always there. */
export type TileLand = Pick<Ground, 'terrainHeight' | 'landAttr'> & Required<Pick<Ground, 'landTri'>>;

/**
 * The land of a `Ground` from the tiles' heights, for a world of `size` tiles of 128 cells of `mpu` meters:
 * `tileAt( tx, tz )` is the loaded tile at column tx, row tz (D3D x and z over the tile's side), or null where none is
 * loaded. The game client's world screen stands on it (`WorldStage.ground`), and so does its live test. Its functions
 * are closures: they may be passed around on their own.
 */
export function tileLand(
  { mpu, size }: Pick<WorldManifest, 'mpu' | 'size'>,
  tileAt: (tx: number, tz: number) => TileHeights | null,
): TileLand {
  const side = MAP_SIZE * mpu;
  const mpuInv = f32(1 / mpu);
  const cells = MAP_SIZE + 1;

  /** `CWorld::GetLandHeight` (`World.cpp:982-1044`, the client's `#else`): the tile's `GetHeight` (sampleHeight). */
  const terrainHeight = (x: number, z: number): number | null => {
    const tx = Math.floor(x / side);
    const tz = Math.floor(z / side);
    const tile = tileAt(tx, tz);
    return tile === null ? null : sampleHeight(tile, x - tx * side, z - tz * side, mpu);
  };

  /**
   * `CWorld::GetHeightAttribute` (`World.cpp:1717-1735`) and `CLandscape::GetHeightAttribute` (`lod.cpp:1633-1649`):
   * the `HATTR_*` of the `HGT_*` flag on the height at the corner of the cell (in whole cells). Off the world
   * (`VecInWorld`, `World.h:726-751`: below 0, or past the last cell, `WORLD_WIDTH` being `MAP_SIZE * m_nLandWidth`)
   * and where no tile is loaded, the C++'s -1 stops nothing: 0 here.
   */
  const landAttr = (x: number, z: number): number => {
    if (!(x >= 0) || f32(x * mpuInv) >= MAP_SIZE * size[0] - 1) return HATTR_NONE;
    if (!(z >= 0) || f32(z * mpuInv) >= MAP_SIZE * size[1] - 1) return HATTR_NONE;
    const cx = f32(x * mpuInv); // x *= mpuInv
    const cz = f32(z * mpuInv);
    const mX = Math.trunc(Math.trunc(cx) / MAP_SIZE);
    const mZ = Math.trunc(Math.trunc(cz) / MAP_SIZE);
    const tile = tileAt(mX, mZ);
    if (tile === null) return HATTR_NONE;
    const gx = Math.trunc(f32(cx - mX * MAP_SIZE));
    const gz = Math.trunc(f32(cz - mZ * MAP_SIZE));
    if (gx < 0 || gx > MAP_SIZE || gz < 0 || gz > MAP_SIZE) return HATTR_NONE;
    return heightFlag(tile.heights[gx + gz * cells]!);
  };

  /** `CWorld::GetLandTri` (`landTriangle`) on the heights without their flags (`GetHeight( DWORD, DWORD )`). */
  const cleanHeightAt = (lx: number, lz: number, gx: number, gz: number): number | null => {
    const tile = tileAt(lx, lz);
    return tile === null ? null : cleanHeight(tile.heights[gx + gz * cells]!);
  };
  const landTri = (x: number, z: number, out: Float32Array): boolean => landTriangle(x, z, mpu, cleanHeightAt, out);

  return { terrainHeight, landAttr, landTri };
}
