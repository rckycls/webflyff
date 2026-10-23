import type { Vec3 } from '@flyffweb/protocol';

/**
 * Neuz's collision of movers on the ground with the world's objects and land, and of the chase camera: the parts of
 * `CActionMover::ProcessCollisionGround` (`Source/_AIInterface/ActionMoverCollision.cpp:127-389`) that are not the
 * mover's own state, the `CWorld` and `CObject3D` functions they call (`Source/_Common/WorldIntersect.cpp`,
 * `Object3D.cpp`, `xUtil3D.cpp`), and `CWorld::CheckBound` (`World3D.cpp:1658`).
 *
 * Neuz's build (`Source/Neuz/VersionCommon.h`): `__VER` is 15, so the `__VER >= 11` code (`__FIX_COLLISION`,
 * `__FIX_PICKING`), `__VER >= 12` (`__CAM_FAST_RECOVER`) and `__VER >= 15` (`__BOUND_BOX_COLLISION`) is in.
 * `__SLIDE_060502` and `__CPU_UTILDOWN_060502` are defined only in its internal and test sections, so the main
 * server's client runs their `#else` code; `__BS_ADJUST_COLLISION` and `__LAYER_1015` are off.
 *
 * D3D coordinates, and floats as the C++ keeps them (`f32` at every store; see `ActionMover.ts`). The D3DX functions
 * are in D3DX's DLL, whose own code is not known: `D3DXVec3TransformCoord` and `D3DXVec3Normalize` are written as
 * Wine's d3dx9 writes them and `D3DXMatrixInverse` by cofactors, in floats, so the last bit may differ.
 *
 * What the data leaves out (see each function): the model's own box, for which the collision mesh's bounds stand in;
 * the land's triangles, so land steeper than 112 degrees does not slide a mover down; water and translucent models
 * (`m_bTrans`) for the camera; the world's edge. The controls (`OT_CTRL`: chests, doors) are not in `Ground`, which
 * holds the tiles' world objects (`OT_OBJ`) only, so the C++'s loops over them are left out.
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
}

/** The world around the movers, as the collision rules read it. D3D x and z throughout. */
export interface Ground {
  /**
   * The terrain's height (`CWorld::GetLandHeight`), or null where no land is loaded (`GetLandscape` is NULL). (Movers
   * stand on the land's triangle in the C++, which inside a cell can differ from this: see `processUnderCollision`.)
   */
  terrainHeight(x: number, z: number): number | null;
  /**
   * `CWorld::GetHeightAttribute` (`World.cpp:1717`, `CLandscape::GetHeightAttribute`, `lod.cpp:1633`): the `HATTR_*`
   * of the land there, which Neuz reads from the `HGT_*` flag added to the height at the corner of the cell (not
   * from the tile's patch attributes, `m_aLandAttr`, which nothing reads). 0 where unknown.
   */
  landAttr(x: number, z: number): number;
  /**
   * The tiles' world objects (`OT_OBJ`) with collision meshes that `FOR_LINKMAP( this, vPos, pObj, nRange,
   * CObj::linkStatic, ... )` visits around (x, z) (`World.h:865-904`), in its order: the first one hit wins in several
   * rules. The camera's test reaches 5 cells further (`nRange` 5, `IntersectObjLine2`) than the movers' (`nRange` 0);
   * one list serves both here.
   */
  objectsNear(x: number, z: number): readonly CollisionObject[];
}

const NO_OBJECTS: readonly CollisionObject[] = Object.freeze([]);

/** A `Ground` of terrain alone: no objects, and the land attributes `landAttr` gives (none by default). */
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
/** `SlideVectorXZ2` (`Object3D.cpp:1754`, `__FIX_COLLISION`): a line longer than 3.0f reflects, at 0.2f of it. */
const LONG_LINE = 3;
const REFLECTED_PART = f32(0.2);
/** `IsTouchRayTri`'s `det < 0.0001f` (`xUtil3D.cpp:252`). */
const MIN_DET = f32(0.0001);
/** `ProcessUnderCollision`'s `vDir( 0.0f, -1.5f, 0.0f )` (`WorldIntersect.cpp:1235`): how far under the point it looks. */
const UNDER_REACH = f32(-1.5);
/** `fMaxY = -65535.0f`: no floor found yet. */
const NO_FLOOR = -65535;
/** `SlideVectorUnder` (`Object3D.cpp:2014-2016`): a face slides once 101 degrees from straight down (`-0.19080f`), by a fall of 0.01f. */
const SLIDE_COSINE = f32(-0.1908);
const SLIDE_FALL = f32(-0.01);
/** `CheckBound` (`World3D.cpp:1697`, `__FIX_PICKING`): the camera keeps this far over the terrain. */
const CAMERA_OVER_TERRAIN = f32(0.6);

// ---- D3DX vectors and matrices, in floats ---------------------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] + b[0]), f32(a[1] + b[1]), f32(a[2] + b[2])];
const sub = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] - b[0]), f32(a[1] - b[1]), f32(a[2] - b[2])];
/** `D3DXVECTOR3::operator*` either way round: `s * v.x`, ... */
const scale = (v: Vec3, s: number): Vec3 => [f32(v[0] * s), f32(v[1] * s), f32(v[2] * s)];
const dot3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  f32(f32(f32(ax * bx) + f32(ay * by)) + f32(az * bz));
/** `D3DXVec3Dot`; `D3DXVec3LengthSq` is `dot(v, v)`. */
const dot = (a: Vec3, b: Vec3): number => dot3(a[0], a[1], a[2], b[0], b[1], b[2]);
/** `D3DXVec3Cross`. */
const cross = (a: Vec3, b: Vec3): Vec3 => [
  f32(f32(a[1] * b[2]) - f32(a[2] * b[1])), f32(f32(a[2] * b[0]) - f32(a[0] * b[2])), f32(f32(a[0] * b[1]) - f32(a[1] * b[0])),
];
const set = (out: Vec3, v: Vec3): void => {
  out[0] = v[0];
  out[1] = v[1];
  out[2] = v[2];
};

/** `D3DXVec3Length`: `sqrtf` of the float sum of squares. */
export const vecLength = (v: Vec3): number => f32(Math.sqrt(dot(v, v)));

/** `D3DXVec3Normalize`: the vector over its length; a zero vector stays zero, as in Wine's d3dx9. */
function normalize(v: Vec3): Vec3 {
  const length = vecLength(v);
  return length === 0 ? [0, 0, 0] : [f32(v[0] / length), f32(v[1] / length), f32(v[2] / length)];
}

/** `CalcSlideVec` (`xUtil3D.cpp:286-292`): `vDir` without its part along the unit normal `vN`. */
function calcSlideVec(dir: Vec3, n: Vec3): Vec3 {
  const inverted: Vec3 = [-n[0], -n[1], -n[2]];
  return sub(dir, scale(inverted, dot(dir, inverted)));
}

/** `CollisionObject.matrix`'s layout: `m[r * 4 + c]` is `_(r+1)(c+1)`. */
type Matrix = ArrayLike<number>;

/** `D3DXVec3TransformCoord`: `( v, 1 ) * m`, over its w. */
function transformCoord(v: Vec3, m: Matrix): Vec3 {
  const w = column(v, m, 3);
  return [f32(column(v, m, 0) / w), f32(column(v, m, 1) / w), f32(column(v, m, 2) / w)];
}

/** `x * m._1c + y * m._2c + z * m._3c + m._4c`, left to right in floats. */
function column(v: Vec3, m: Matrix, c: number): number {
  return f32(f32(f32(f32(m[c]! * v[0]) + f32(m[4 + c]! * v[1])) + f32(m[8 + c]! * v[2])) + m[12 + c]!);
}

/** `mInv = mTM; mInv._41 = mInv._42 = mInv._43 = 0;`: the matrix that turns a normal into the world. */
function withoutTranslation(m: Matrix): Float32Array {
  const r = Float32Array.from(m);
  r[12] = r[13] = r[14] = 0;
  return r;
}

/** Sums left to right in floats: `a + b + c` in C. */
const sum = (...terms: number[]): number => terms.reduce((s, t) => f32(s + t));
const mul = (a: number, b: number): number => f32(a * b);

/**
 * `D3DXMatrixInverse` by cofactors, in floats; null where the determinant is 0 (D3DX returns NULL and leaves the
 * result unset, which the C++ then reads anyway: such an object is skipped here).
 */
function inverse(m: Matrix): Float32Array | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = Array.from(m) as Matrix16;
  const minor = (a: number, b: number, c: number, d: number): number => f32(mul(a, b) - mul(c, d));
  const s0 = minor(a00, a11, a10, a01), s1 = minor(a00, a12, a10, a02), s2 = minor(a00, a13, a10, a03);
  const s3 = minor(a01, a12, a11, a02), s4 = minor(a01, a13, a11, a03), s5 = minor(a02, a13, a12, a03);
  const c5 = minor(a22, a33, a32, a23), c4 = minor(a21, a33, a31, a23), c3 = minor(a21, a32, a31, a22);
  const c2 = minor(a20, a33, a30, a23), c1 = minor(a20, a32, a30, a22), c0 = minor(a20, a31, a30, a21);
  const det = sum(mul(s0, c5), -mul(s1, c4), mul(s2, c3), mul(s3, c2), -mul(s4, c1), mul(s5, c0));
  if (det === 0) return null;
  const k = f32(1 / det);
  const e = (x: number, p: number, y: number, q: number, z: number, r: number): number =>
    f32(sum(mul(x, p), mul(y, q), mul(z, r)) * k);
  return new Float32Array([
    e(a11, c5, -a12, c4, a13, c3), e(-a01, c5, a02, c4, -a03, c3), e(a31, s5, -a32, s4, a33, s3), e(-a21, s5, a22, s4, -a23, s3),
    e(-a10, c5, a12, c2, -a13, c1), e(a00, c5, -a02, c2, a03, c1), e(-a30, s5, a32, s2, -a33, s1), e(a20, s5, -a22, s2, a23, s1),
    e(a10, c4, -a11, c2, a13, c0), e(-a00, c4, a01, c2, -a03, c0), e(a30, s4, -a31, s2, a33, s0), e(-a20, s4, a21, s2, -a23, s0),
    e(-a10, c3, a11, c1, -a12, c0), e(a00, c3, -a01, c1, a02, c0), e(-a30, s3, a31, s1, -a32, s0), e(a20, s3, -a21, s1, a22, s0),
  ]);
}

type Matrix16 = [
  number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number,
];

// ---- lines against an object ------------------------------------------------------------------------------------------

/** A line as the box tests take it: its two ends in the world. */
type Line = readonly [Vec3, Vec3];

/**
 * The bounds of each collision mesh, `[minX, minY, minZ, maxX, maxY, maxZ]`, worked out once; null for no
 * triangles. They stand in for the model's box (see `touchesBox`), which holds the mesh: so that the stand-in never
 * turns away a line the triangle test would take, each side is pushed out by 1e-5 of the largest coordinate (and
 * 1e-5), more than the float error of either test.
 */
const boxes = new WeakMap<Float32Array, Float32Array | null>();

function boxOf(triangles: Float32Array): Float32Array | null {
  let box = boxes.get(triangles);
  if (box === undefined) {
    box = null;
    if (triangles.length >= 9) {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < triangles.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          b[k] = Math.min(b[k]!, triangles[i + k]!);
          b[3 + k] = Math.max(b[3 + k]!, triangles[i + k]!);
        }
      }
      const margin = 1e-5 * (1 + Math.max(...b.map(Math.abs)));
      box = new Float32Array(b.map((v, k) => (k < 3 ? v - margin : v + margin)));
    }
    boxes.set(triangles, box);
  }
  return box;
}

/** `IsTouchAABB_Line` (`xUtil3D.cpp:127-203`): whether the line from `v1` to `v2` touches the box, in floats. */
function touchesAabb(box: Float32Array, v1: Vec3, v2: Vec3): boolean {
  const code1 = outCode(box, v1);
  if (code1 === 0) return true;
  const code2 = outCode(box, v2);
  if (code2 === 0) return true;
  if ((code1 & code2) > 0) return false;
  // the plane the start is outside of, axis by axis: where the line crosses it must be within the other two
  for (let k = 0; k < 3; k++) {
    if ((code1 & (3 << (2 * k))) === 0) continue;
    const at = code1 & (1 << (2 * k)) ? box[3 + k]! : box[k]!;
    const d = f32(v2[k]! - v1[k]!);
    const s = f32(at - v1[k]!);
    let within = true;
    for (let j = 0; j < 3 && within; j++) {
      if (j === k) continue;
      const p = f32(v1[j]! + f32(f32(s * f32(v2[j]! - v1[j]!)) / d));
      within = p <= box[3 + j]! && p >= box[j]!;
    }
    if (within) return true;
  }
  return false;
}

/** `CalcOutCode` (`xUtil3D.cpp:95-116`): on which sides of the box the point is, one bit pair an axis. */
function outCode(box: Float32Array, v: Vec3): number {
  let code = 0;
  for (let k = 0; k < 3; k++) {
    if (v[k]! > box[3 + k]!) code |= 1 << (2 * k); // CLIP_RIGHT, CLIP_TOP, CLIP_BACK
    else if (v[k]! < box[k]!) code |= 2 << (2 * k); // CLIP_LEFT, CLIP_BOTTOM, CLIP_FRONT
  }
  return code;
}

/**
 * `CModelObject::TestIntersectionOBB_Line` (`ModelObject.cpp:390-414`) with `__CPU_UTILDOWN_060502` off:
 * `IsTouchOBB_Line` (`xUtil3D.cpp:211-227`), the line's two ends taken into the model's space and tested against the
 * model's box. A model without a collision mesh is never tested (:393). The model's box (the .o3d's
 * `m_vBBMin`/`m_vBBMax`, `Object3D.cpp:980`) is not in the converted data, so the collision mesh's bounds stand in
 * for it (`boxOf`), and the guild-combat ground's always-touched box (:397-401) is not known. The C++ rebuilds the
 * ends from a `Segment3` (`xUtil3D.cpp:296-302`), which can move them by a float step; against the tight stand-in a
 * line along a face would then miss, so the ends are taken as they are.
 */
function touchesBox(obj: CollisionObject, inv: Matrix, [start, end]: Line): boolean {
  const box = boxOf(obj.triangles);
  return box !== null && touchesAabb(box, transformCoord(start, inv), transformCoord(end, inv));
}

/**
 * `IsTouchRayTri` (`xUtil3D.cpp:230-279`) for the triangle at `i`: the distance along `dir` (in lengths of `dir`) from
 * `orig` to where the line meets it, or null. One-sided: only a line against the triangle's normal,
 * `cross( v1 - v0, v2 - v0 )`, meets it; the edges count (`u`, `v` and `u + v` may equal their bounds).
 */
function touchRayTri(tris: Float32Array, i: number, orig: Vec3, dir: Vec3): number | null {
  const x0 = tris[i]!, y0 = tris[i + 1]!, z0 = tris[i + 2]!;
  const e1x = f32(tris[i + 3]! - x0), e1y = f32(tris[i + 4]! - y0), e1z = f32(tris[i + 5]! - z0);
  const e2x = f32(tris[i + 6]! - x0), e2y = f32(tris[i + 7]! - y0), e2z = f32(tris[i + 8]! - z0);
  const px = f32(f32(dir[1] * e2z) - f32(dir[2] * e2y));
  const py = f32(f32(dir[2] * e2x) - f32(dir[0] * e2z));
  const pz = f32(f32(dir[0] * e2y) - f32(dir[1] * e2x));
  const det = dot3(e1x, e1y, e1z, px, py, pz);
  if (!(det > 0) || det < MIN_DET) return null;
  const tx = f32(orig[0] - x0), ty = f32(orig[1] - y0), tz = f32(orig[2] - z0);
  const u = dot3(tx, ty, tz, px, py, pz);
  if (u < 0 || u > det) return null;
  const qx = f32(f32(ty * e1z) - f32(tz * e1y));
  const qy = f32(f32(tz * e1x) - f32(tx * e1z));
  const qz = f32(f32(tx * e1y) - f32(ty * e1x));
  const v = dot3(dir[0], dir[1], dir[2], qx, qy, qz);
  if (v < 0 || f32(u + v) > det) return null;
  return f32(dot3(e2x, e2y, e2z, qx, qy, qz) * f32(1 / det));
}

const corner = (tris: Float32Array, i: number): Vec3 => [tris[i]!, tris[i + 1]!, tris[i + 2]!];
/** The face's normal, `cross( v2 - v1, v3 - v1 )`, not normalized. */
const faceNormal = (tris: Float32Array, i: number): Vec3 =>
  cross(sub(corner(tris, i + 3), corner(tris, i)), sub(corner(tris, i + 6), corner(tris, i)));

/**
 * The line from `pos` to `end` in the model's space: Neuz moves the line with the inverse of the world matrix rather
 * than the triangles into the world (`D3DXVec3TransformCoord` of both ends, e.g. `Object3D.cpp:1736-1739`).
 */
function modelLine(inv: Matrix, pos: Vec3, end: Vec3): { pos: Vec3; dir: Vec3 } {
  const p = transformCoord(pos, inv);
  return { pos: p, dir: sub(transformCoord(end, inv), p) };
}

/**
 * `CObject3D::FindTouchTriLine` (`Object3D.cpp:2035-2110`) on the collision mesh (`mTM = mWorld`): the distance along
 * the line, from 0 to under 1, to the first triangle in the mesh's order (not the nearest) that it meets, or null.
 */
function findTouchTriLine(obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): number | null {
  const line = modelLine(inv, pos, end);
  for (let i = 0; i + 9 <= obj.triangles.length; i += 9) {
    const t = touchRayTri(obj.triangles, i, line.pos, line.dir);
    if (t !== null && t >= 0 && t < 1) return t;
  }
  return null;
}

/**
 * `CObject3D::SlideVectorXZ2` (`Object3D.cpp:1695-1831`, `__FIX_COLLISION`) on the collision mesh: for the first
 * triangle the line meets, the vector the move becomes, or null. The face's normal is turned into the world without
 * its y, as if the face stood upright (:1803-1814). A line up to 3.0f long meets triangles from 0 to under 1 along it,
 * and gives what is left of it past the face, slid along it (`CalcSlideVec`); a longer one meets them anywhere within
 * its length either way along it, and gives its reflection off the face times 0.2f (:1754-1791).
 */
function slideVectorXZ2(obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): Vec3 | null {
  const line = modelLine(inv, pos, end);
  const tris = obj.triangles;
  for (let i = 0; i + 9 <= tris.length; i += 9) {
    const t = touchRayTri(tris, i, line.pos, line.dir);
    if (t === null) continue;
    const dir = sub(end, pos);
    const dirLength = vecLength(dir);
    if (dirLength > LONG_LINE ? !(Math.abs(t) < dirLength) : !(t >= 0 && t < 1)) continue;
    const n = faceNormal(tris, i);
    const flat = transformCoord(n, rotationOf(obj.matrix));
    flat[1] = 0; // (Neuz logs an error for a flat face, whose normal is then nothing, :1772-1773)
    const wall = normalize(flat);
    if (dirLength > LONG_LINE) {
      const back: Vec3 = [-dir[0], -dir[1], -dir[2]];
      return scale(add(dir, scale(wall, f32(dot(back, wall) * 2))), REFLECTED_PART);
    }
    const intersect = add(pos, scale(dir, t));
    return calcSlideVec(sub(end, intersect), wall);
  }
  return null;
}

/**
 * The object's inverse world matrix when the line touches its box, else null. (An object whose matrix has no inverse
 * is skipped: see `inverse`.)
 */
function touchedBy(obj: CollisionObject, line: Line): Float32Array | null {
  const inv = inverseOf(obj.matrix);
  return inv !== null && touchesBox(obj, inv, line) ? inv : null;
}

/**
 * Each world matrix's inverse and its translation-free copy, worked out once: the C++ works them out at every test,
 * with the same float result, and a placed object's matrix does not change (`CollisionObject.matrix`).
 */
const inverses = new WeakMap<Float32Array, Float32Array | null>();
const rotations = new WeakMap<Float32Array, Float32Array>();

function inverseOf(matrix: Float32Array): Float32Array | null {
  let inv = inverses.get(matrix);
  if (inv === undefined) inverses.set(matrix, (inv = inverse(matrix)));
  return inv;
}

function rotationOf(matrix: Float32Array): Float32Array {
  let r = rotations.get(matrix);
  if (r === undefined) rotations.set(matrix, (r = withoutTranslation(matrix)));
  return r;
}

const toFloats = (v: Vec3): Vec3 => [f32(v[0]), f32(v[1]), f32(v[2])];

// ---- the rules --------------------------------------------------------------------------------------------------------

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
 * the objects' faces (`SlideVectorUnder`) and the terrain, however far down that is. `out` gets the point a mover
 * landing there slides to, or keeps (0, 0, 0) where nothing slides: `vOut` is one vector that each object's test
 * writes only for a face that slides, and the highest find takes it as it then is, stale or not (:1290-1297, :1376-1380).
 *
 * The terrain's height is `terrainHeight` (the C++ meets the land's triangle with the line, :1324-1344), and the
 * slide down land steeper than 112 degrees (:1352-1374) needs the land's triangles, which `Ground` does not give: it is
 * left out. Where no land is loaded only the objects count (`NO_FLOOR`, -65535, without any). Housing rooms' controls
 * (:1249-1281) and ships (`linkAirShip`, :1303-1322) are left out.
 */
export function processUnderCollision(out: Vec3, pos: Vec3, ground: Ground): number {
  const from = toFloats(pos);
  const end = add(from, [0, UNDER_REACH, 0]);
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
  const land = ground.terrainHeight(from[0], from[2]);
  if (land !== null && f32(land) > maxY) {
    maxY = f32(land);
    set(out, slide);
  }
  return maxY;
}

/**
 * `CObject3D::SlideVectorUnder` (`Object3D.cpp:1947-2027`, the `!__SLIDE_060502` one) on the collision mesh: for the
 * first triangle the line meets (from 0 to under 1 along it), the height where it does, or null. A face whose normal,
 * normalized in the model and turned into the world, is within 79 degrees of straight up is a floor and leaves `out`
 * as it is; a steeper one puts into `out` the point a fall of 0.01f slides to along it.
 */
function slideVectorUnder(out: Vec3, obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): number | null {
  const line = modelLine(inv, pos, end);
  const tris = obj.triangles;
  for (let i = 0; i + 9 <= tris.length; i += 9) {
    const t = touchRayTri(tris, i, line.pos, line.dir);
    if (t === null || !(t >= 0 && t < 1)) continue;
    const intersect = add(pos, scale(sub(end, pos), t));
    const n = transformCoord(normalize(faceNormal(tris, i)), rotationOf(obj.matrix));
    if (dot(n, [0, -1, 0]) < SLIDE_COSINE) return intersect[1];
    set(out, add(intersect, calcSlideVec([0, SLIDE_FALL, 0], n)));
    return intersect[1];
  }
  return null;
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

/**
 * `CWorld::CheckBound( &m_vPos, &m_vLookAt, ... )` (`World3D.cpp:1658-1777`): where the chase camera goes so that it
 * stays out of the terrain and the objects between it and `target` (`m_vLookAt`, which `CBackCamera::Process` puts
 * 0.4 over the mover, `Camera.cpp:388`): `camera` itself when nothing is in the way, else the nearer of the two finds.
 * Its distance from `target` is `CheckBound`'s `fLength` either way. The camera's easing back after a hit
 * (`m_bStart`, `m_fLength2`, `Camera.cpp:398-423`) is the camera's.
 *
 * The terrain: from 1 out toward the camera, a point every 0.1 for 10 times the distance (so up to 1 past the camera)
 * is tested against the terrain's height + 0.6 (`GetLandHeight`, 0 where no land is loaded). The water test (keeping
 * the camera out of water the mover is above, :1674-1721) is left out: `Ground` has no water. The objects:
 * `IntersectObjLine2` below.
 */
export function cameraBound(target: Vec3, camera: Vec3, ground: Ground): Vec3 {
  const dest = toFloats(target); // vDest
  const eye = toFloats(camera); // vPos
  const towards = sub(eye, dest);
  const length = vecLength(towards);
  const step = scale(normalize(towards), f32(1 / 10)); // tempVec /= 10 multiplies by 1.0f / 10
  let p = add(dest, scale(step, 10));
  let land: Vec3 | null = null;
  const count = Math.trunc(f32(length * 10));
  for (let i = 0; i < count; i++) {
    p = add(p, step);
    if (p[1] < f32(f32(ground.terrainHeight(p[0], p[2]) ?? 0) + CAMERA_OVER_TERRAIN)) {
      land = p;
      break;
    }
  }
  const object = intersectObjLine2(dest, eye, ground);
  if (land !== null && object !== null) {
    const toLand = sub(land, dest);
    const toObject = sub(object, dest);
    return dot(toLand, toLand) < dot(toObject, toObject) ? land : object;
  }
  return land ?? object ?? eye;
}

/**
 * `CWorld::IntersectObjLine2( &vIntersect, *vDest, *vPos, TRUE )` (`WorldIntersect.cpp:832-891`, `__CAM_FAST_RECOVER`)
 * on the world's objects around `from`: the nearest point where the line to `to` meets one, or null. After each hit
 * the C++ sets the `Segment3`'s direction to the end point itself (`segment.Direction = vTempEnd`, :875, :880), so
 * the boxes of the objects after the first hit are tested against the line `TestIntersectionOBB_Line` then makes,
 * from the middle of this one out half its length times the end point's position each way; that is copied.
 * `bSkipTrans` (models that turn translucent, `m_bTrans`, are not tested) is left out: `CollisionObject` does not say
 * which. (The controls' loop, :922-951, is only reached without a hit; left out.)
 */
function intersectObjLine2(from: Vec3, to: Vec3, ground: Ground): Vec3 | null {
  const dir = sub(to, from);
  let line: Line = [from, to];
  let hit: Vec3 | null = null;
  let shortest = 0;
  for (const obj of ground.objectsNear(from[0], from[2])) {
    const inv = touchedBy(obj, line);
    if (inv === null) continue;
    const t = findTouchTriLine(obj, inv, from, to);
    if (t === null) continue;
    if (hit === null || t < shortest) shortest = t;
    hit = add(from, scale(dir, shortest));
    // Segment3 (xUtil3D.cpp:296-302): the middle and half the length, then Origin -/+ Extent * Direction
    const middle = scale(add(from, to), 0.5);
    const reach = scale(to, f32(vecLength(dir) * 0.5));
    line = [sub(middle, reach), add(middle, reach)];
  }
  return hit;
}
