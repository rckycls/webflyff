import type { Vec3 } from '@flyffweb/protocol';
import { add, calcSlideVec, dot, faceNormal, normalize, scale, set, toFloats, touchRayTri, vecLength } from './d3dx';
import { findTouchTriLine, slideVectorUnder, slideVectorXZ2, touchedBy, touchesBox } from './object3d';
import type { Line } from './object3d';

/**
 * Neuz's collision of movers on the ground with the world's objects and land: the parts of
 * `CActionMover::ProcessCollisionGround` (`Source/_AIInterface/ActionMoverCollision.cpp:127-389`) that are not the
 * mover's own state, and the `CWorld` functions they call (`Source/_Common/WorldIntersect.cpp`, `World.cpp`), on the
 * line tests of `object3d.ts` and the math of `d3dx.ts`. The chase camera's is `camera.ts`.
 *
 * Neuz's build (`Source/Neuz/VersionCommon.h`): `__VER` is 15, so the `__VER >= 11` code (`__FIX_COLLISION`,
 * `__FIX_PICKING`), `__VER >= 12` (`__CAM_FAST_RECOVER`) and `__VER >= 15` (`__BOUND_BOX_COLLISION`) is in.
 * `__SLIDE_060502` and `__CPU_UTILDOWN_060502` are defined only in its internal and test sections, so the main
 * server's client runs their `#else` code; `__BS_ADJUST_COLLISION` and `__LAYER_1015` are off. D3D coordinates, and
 * floats as the C++ keeps them (`f32` at every store).
 *
 * Left out (see each function): the model's own box, for which the collision mesh's bounds stand in; the world's
 * edge; water. The controls (`OT_CTRL`: chests, doors) are not in `Ground`, which holds the tiles' world objects
 * (`OT_OBJ`) only, so the C++'s loops over them are left out.
 */

const f32 = Math.fround;

/** `HATTR_*` (`Source/_Common/landscape.h:34-38`): what a cell of land allows. */
export const HAttr = { NONE: 0, NOWALK: 1, NOFLY: 2, NOMOVE: 3, DIE: 4 } as const;

/** What `GetOverHeight` gives where nothing is overhead (`WorldIntersect.cpp:490`). */
export const NO_CEILING = 65535;

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
   * `FOR_LINKMAP( this, vPos, pObj, 5, CObj::linkStatic, ... )` (`World.h:865-904`) visits them, which the rules
   * depend on (the first one hit wins): link level by link level (0 to 6: an object is linked at the first level
   * whose cell is wider than it, in the cell its position is in, `Obj.cpp:974-1020`, `lod.cpp:1440-1460`), then the
   * level's cells row by row (z, then x), then each cell's objects in its list's order. That is the camera's reach
   * (`nRange` 5, `IntersectObjLine2`); it holds the movers' (`nRange` 0, the 2 x 2 cells of each level nearest the
   * point), so the movers' rules also see the objects of the cells between, which the C++ does not test.
   */
  objectsNear(x: number, z: number): readonly CollisionObject[];
  /**
   * `CWorld::GetLandTri` (`World.cpp:1251-1353`): the land's triangle under (x, z), its three corners (9 floats, world
   * coordinates) into `out`, as `landTriangle` makes it from the tiles' heights; false where no land is loaded
   * (nothing written). Optional: a Ground without it stands movers on `terrainHeight`, and no land slides them.
   */
  landTri?(x: number, z: number, out: Float32Array): boolean;
}

const NO_OBJECTS: readonly CollisionObject[] = Object.freeze([]);

/** A `Ground` of terrain alone: no objects, no land triangles, and the land attributes `landAttr` gives (none by default). */
export function terrainGround(terrainHeight: Ground['terrainHeight'], landAttr: Ground['landAttr'] = () => HAttr.NONE): Ground {
  return { terrainHeight, landAttr, objectsNear: () => NO_OBJECTS };
}

/** `vKneePos.y += 0.4f` (`ActionMoverCollision.cpp:140`): the height a move is tested at. */
const KNEE_HEIGHT = f32(0.4);
/**
 * `COLL_TEST_DIR` (`ActionMoverCollision.cpp:146`): the move is made 6.5 times longer for the test, then
 * `D3DXVECTOR3::operator /=` brings it back by multiplying by `1.0f / 6.5f` (`d3dx9math.inl:349-356`), a round trip
 * that can change the last bit.
 */
const COLL_TEST_DIR = 6.5;
const INV_COLL_TEST_DIR = f32(1 / COLL_TEST_DIR);
/** `ProcessUnderCollision`'s `vDir( 0.0f, -1.5f, 0.0f )` (`WorldIntersect.cpp:1235`): how far under the point it looks. */
const UNDER_REACH = f32(-1.5);
/** `fMaxY = -65535.0f`: no floor found yet. */
const NO_FLOOR = -65535;
/**
 * `ProcessUnderCollision` (`WorldIntersect.cpp:1352-1358`): land steeper than about 68 degrees (its normal more than
 * 112 degrees from straight down: past `-0.37864f`) slides, by a fall of 0.2f.
 */
const LAND_SLIDE_COSINE = f32(-0.37864);
const LAND_SLIDE_FALL = f32(-0.2);
/** `MAP_SIZE` (`landscape.h:6`): a tile is 128 cells square. */
const MAP_SIZE = 128;

// ---- the land's triangles -----------------------------------------------------------------------------------------

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
  // the corners, numbered as the C++'s comments do: 0 (gx, gz), 1 (gx + 1, gz), 2 (gx, gz + 1), 3 (gx + 1, gz + 1)
  const order = (gx + gz) % 2 === 0 ? (glx > glz ? [0, 3, 1] : [0, 2, 3]) : (f32(glx + glz) < 1 ? [0, 2, 1] : [1, 2, 3]);
  order.forEach((k, n) => {
    const ox = k & 1;
    const oz = k >> 1;
    out[n * 3] = (gx + ox + lx * MAP_SIZE) * mpu;
    out[n * 3 + 1] = k === 0 ? h00 : height(lx, lz, gx + ox, gz + oz) ?? 0;
    out[n * 3 + 2] = (gz + oz + lz * MAP_SIZE) * mpu;
  });
  return true;
}

/**
 * `CWorld::GetLandTris` (`World.cpp:1079-1092`) from `Ground.landTri`: `GetLandTri2` (:1093-1249) at the point and
 * at the 8 around it a cell (`mpu`) apart, in the C++'s order, skipping cells without land. `GetLandTri2` gives the
 * triangle the point is in, then the other half of the cell, each as `GetLandTri` orders it: that one is asked for
 * at the middle of the other half.
 */
function landTris(landTri: NonNullable<Ground['landTri']>, x: number, z: number, mpu: number): Float32Array {
  const out: number[] = [];
  const tri = new Float32Array(9);
  for (const [i, j] of [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const) {
    if (!landTri(f32(x + i * mpu), f32(z + j * mpu), tri)) continue;
    out.push(...tri);
    const [ox, oz] = otherHalf(tri);
    if (landTri(ox, oz, tri)) out.push(...tri);
  }
  return new Float32Array(out);
}

/** The middle of the cell's other triangle: its two corners on the cut and the corner `tri` lacks, over 3. */
function otherHalf(tri: Float32Array): [number, number] {
  const xs = [tri[0]!, tri[3]!, tri[6]!];
  const zs = [tri[2]!, tri[5]!, tri[8]!];
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const has = (px: number, pz: number): boolean => xs.some((v, k) => v === px && zs[k] === pz);
  const [mx, mz] = ([[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const).find(([px, pz]) => !has(px, pz))!;
  // the corner of `tri` across the cell from the missing one is the one not on the cut
  const sx = xs[0]! + xs[1]! + xs[2]! - (x0 + x1 - mx);
  const sz = zs[0]! + zs[1]! + zs[2]! - (z0 + z1 - mz);
  return [(sx + mx) / 3, (sz + mz) / 3];
}

/**
 * `FindTouchLandTri` (`WorldIntersect.cpp:713-736`): the distance along `dir` from `pos` (beyond its length too) to
 * the first of the triangles it meets going forward, or null.
 */
function findTouchLandTri(tris: Float32Array, pos: Vec3, dir: Vec3): number | null {
  for (let i = 0; i + 9 <= tris.length; i += 9) {
    const t = touchRayTri(tris, i, pos, dir);
    if (t !== null && t >= 0) return t;
  }
  return null;
}

// ---- the rules ----------------------------------------------------------------------------------------------------

/**
 * `CWorld::ProcessCollision` (`WorldIntersect.cpp:498-622`): the move `dir` from `pos`, tested against the world's
 * objects around `pos` (`linkStatic`), into `out`. The first object it meets gives the slide (`SlideVectorXZ2`), which
 * is tested once more from `pos`; if that meets something too, the move is nothing (:539-550, :573-597, whose two
 * `__FIX_COLLISION` branches both test again on the first slide). True when something was met; `out` is `dir` when
 * nothing was. `out` may be `dir`, as in `ProcessCollisionGround`'s call. (The controls' loop, `linkDynamic` objects
 * of type `OT_CTRL` tested with their render meshes, :515-556, is left out: see the module's comment.)
 */
export function processCollision(out: Vec3, pos: Vec3, dir: Vec3, ground: Ground): boolean {
  return collide(out, toFloats(pos), toFloats(dir), ground, 0);
}

function collide(out: Vec3, pos: Vec3, dir: Vec3, ground: Ground, slideCount: number): boolean {
  const end = add(pos, dir);
  set(out, dir);
  const line: Line = [pos, end];
  for (const obj of ground.objectsNear(pos[0], pos[2])) {
    const inv = touchedBy(obj, line);
    if (inv === null) continue;
    const slide = slideVectorXZ2(obj, inv, pos, end);
    if (slide === null) continue;
    set(out, slide);
    if (++slideCount <= 1 && collide(out, pos, slide, ground, slideCount)) set(out, [0, 0, 0]);
    return true;
  }
  return false;
}

/**
 * The move in x and z of `CActionMover::ProcessCollisionGround` (`ActionMoverCollision.cpp:135-268`), on `pos` in
 * place: the step's move (`deltaAccu`, `m_vDeltaAccu`) in x and z, 6.5 times longer, tested from the knee (0.4 up)
 * and slid (`processCollision`), brought back, then added in x and in z, each taken back again where the land is
 * `HATTR_NOWALK` or `HATTR_NOMOVE` (its own axis only: x is read at the new x and the old z, z at the x kept and the
 * new z). Returns that move (`vDeltaXZ`) and whether the test met something (`fResult`), for `__FIX_COLLISION`, which
 * changes the mover's delta.
 *
 * Every mover collides: the exceptions for pets and returning NPCs (:173-191) are overruled by `bColl = TRUE;`
 * (:193), and `CObj::m_bCollision` is TRUE (`Obj.cpp:23`; only a debug window turns it off). Without `ground` nothing
 * is tested and the land allows everything. Left out: the world's edge (`ClipX`, `ClipZ`), ships (a mover on one,
 * `GetIAObjLink`, ignores the land), `HATTR_DIE` (`DoDie`: death is Piece 4) and the world server's `AIMSG_COLLISION`.
 */
export function collideMove(pos: Vec3, deltaAccu: Vec3, ground?: Ground): { hit: boolean; move: Vec3 } {
  const knee: Vec3 = [pos[0], f32(pos[1] + KNEE_HEIGHT), pos[2]];
  const move: Vec3 = [f32(deltaAccu[0] * COLL_TEST_DIR), 0, f32(deltaAccu[2] * COLL_TEST_DIR)];
  const hit = ground !== undefined && vecLength(move) !== 0 && processCollision(move, knee, move, ground);
  const back = scale(move, INV_COLL_TEST_DIR);
  const blocks = (x: number, z: number): boolean => {
    const attr = ground?.landAttr(x, z);
    return attr === HAttr.NOWALK || attr === HAttr.NOMOVE;
  };
  pos[0] = f32(pos[0] + back[0]);
  if (blocks(pos[0], pos[2])) pos[0] = f32(pos[0] - back[0]);
  pos[2] = f32(pos[2] + back[2]);
  if (blocks(pos[0], pos[2])) pos[2] = f32(pos[2] - back[2]);
  return { hit, move: back };
}

/**
 * `CWorld::ProcessUnderCollision` (`WorldIntersect.cpp:1233-1383`, the `!__SLIDE_060502` one): the height of what is
 * under `pos` (which `ProcessCollisionGround` puts 1 over the feet), within 1.5 down for the objects: the highest of
 * the objects' faces (`SlideVectorUnder`) and the land, however far down that is. `out` gets the point a mover
 * landing there slides to, or keeps (0, 0, 0) where nothing slides: `vOut` is one vector that each object's test
 * writes only for a face that slides, and the highest find takes it as it then is, stale or not (:1290-1297, :1376-1380).
 *
 * The land, with `Ground.landTri` (:1324-1374): the height where the line meets the land's triangle under `pos`; on
 * land steeper than about 68 degrees `vOut` becomes the point a fall of 0.2f slides to along it, or where that slide
 * first meets the land around (`GetLandTris`, `FindTouchLandTri`). Without `landTri` (or should the line miss the
 * triangle, where the C++ would read a stale distance): `terrainHeight`, and no slide. Where no land is loaded only
 * the objects count (`NO_FLOOR`, -65535, without any). Housing rooms' controls (:1249-1281) and ships (`linkAirShip`,
 * :1303-1322) are left out.
 */
export function processUnderCollision(out: Vec3, pos: Vec3, ground: Ground): number {
  const from = toFloats(pos);
  const down: Vec3 = [0, UNDER_REACH, 0];
  const end = add(from, down);
  const line: Line = [from, end];
  const slide: Vec3 = [0, 0, 0];
  let maxY = NO_FLOOR;
  for (const obj of ground.objectsNear(from[0], from[2])) {
    const inv = touchedBy(obj, line);
    if (inv === null) continue;
    const y = slideVectorUnder(slide, obj, inv, from, end);
    if (y !== null && y > maxY) {
      maxY = y;
      set(out, slide);
    }
  }
  let land: number | null;
  const tri = new Float32Array(9);
  const t = ground.landTri?.(from[0], from[2], tri) ? touchRayTri(tri, 0, from, down) : null;
  if (t !== null) {
    land = f32(from[1] + f32(t * UNDER_REACH));
    const n = normalize(faceNormal(tri, 0));
    if (dot(n, [0, -1, 0]) > LAND_SLIDE_COSINE) {
      const intersect: Vec3 = [from[0], land, from[2]];
      const dir = calcSlideVec([0, LAND_SLIDE_FALL, 0], n);
      const mpu = f32(Math.max(tri[0]!, tri[3]!, tri[6]!) - Math.min(tri[0]!, tri[3]!, tri[6]!)); // the cell, m_iMPU
      const at = findTouchLandTri(landTris(ground.landTri!, from[0], from[2], mpu), intersect, dir);
      set(slide, add(intersect, at === null ? dir : scale(dir, at)));
    }
  } else {
    const h = ground.terrainHeight(from[0], from[2]);
    land = h === null ? null : f32(h);
  }
  if (land !== null && land > maxY) {
    maxY = land;
    set(out, slide);
  }
  return maxY;
}

/**
 * `CWorld::GetOverHeight` (`WorldIntersect.cpp:407-491`, `__BOUND_BOX_COLLISION`): the height of the ceiling over
 * `pos` (which `ProcessCollisionGround` puts 1.5 over the feet), within 1 up, or `NO_CEILING`. It takes the first
 * object whose box the line touches and looks no further: that object's first face the line meets, or nothing.
 * `forPlayer` is `GetOverHeightForPlayer` (:356-401), which a player rising uses: it passes over a box the point
 * itself is in, unless no other box is touched.
 */
export function overHeight(pos: Vec3, ground: Ground, forPlayer = false): number {
  const from = toFloats(pos);
  const end = add(from, [0, 1, 0]);
  const line: Line = [from, end];
  let found: { obj: CollisionObject; inv: Float32Array } | undefined;
  for (const obj of ground.objectsNear(from[0], from[2])) {
    const inv = touchedBy(obj, line);
    if (inv === null) continue;
    found = { obj, inv };
    if (!forPlayer || !touchesBox(obj, inv, [from, from])) break;
  }
  if (found === undefined) return NO_CEILING;
  const t = findTouchTriLine(found.obj, found.inv, from, end);
  return t === null ? NO_CEILING : f32(from[1] + t);
}
