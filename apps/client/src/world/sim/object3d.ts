import type { Vec3 } from '@flyffweb/protocol';
import type { CollisionObject } from './collision';
import {
  add, calcSlideVec, dot, faceNormal, inverse, normalize, scale, set, sub, touchRayTri, touchesAabb, transformCoord,
  vecLength, withoutTranslation,
} from './d3dx';
import type { Matrix } from './d3dx';

/**
 * A line against a placed world object's collision mesh: `CModelObject::TestIntersectionOBB_Line` and the
 * `CObject3D` functions the collision rules call (`Source/_Common/ModelObject.cpp`, `Object3D.cpp`), on the collision
 * mesh (`bCollObj` TRUE, `mTM = mWorld`). Neuz moves the line into the model's space with the inverse of the world
 * matrix rather than the triangles into the world (`D3DXVec3TransformCoord` of both ends, e.g. `Object3D.cpp:1736`).
 */

const f32 = Math.fround;

/** `SlideVectorXZ2` (`Object3D.cpp:1754`, `__FIX_COLLISION`): a line longer than 3.0f reflects, at 0.2f of it. */
const LONG_LINE = 3;
const REFLECTED_PART = f32(0.2);
/**
 * `SlideVectorUnder` (`Object3D.cpp:2014-2016`): a face steeper than about 79 degrees (its normal more than 101
 * degrees from straight down: past `-0.19080f`) slides, by a fall of 0.01f.
 */
const SLIDE_COSINE = f32(-0.1908);
const SLIDE_FALL = f32(-0.01);

/** A line as the box tests take it: its two ends in the world. */
export type Line = readonly [Vec3, Vec3];

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

/**
 * `CModelObject::TestIntersectionOBB_Line` (`ModelObject.cpp:390-414`) with `__CPU_UTILDOWN_060502` off:
 * `IsTouchOBB_Line` (`xUtil3D.cpp:211-227`), the line's two ends taken into the model's space and tested against the
 * model's box. A model without a collision mesh is never tested (:393). The model's box (the .o3d's
 * `m_vBBMin`/`m_vBBMax`, `Object3D.cpp:980`) is not in the converted data, so the collision mesh's bounds stand in
 * for it (`boxOf`), and the guild-combat ground's always-touched box (:397-401) is not known. The C++ rebuilds the
 * ends from a `Segment3` (`xUtil3D.cpp:296-302`), which can move them by a float step; against the tight stand-in a
 * line along a face would then miss, so the ends are taken as they are.
 */
export function touchesBox(obj: CollisionObject, inv: Matrix, [start, end]: Line): boolean {
  const box = boxOf(obj.triangles);
  return box !== null && touchesAabb(box, transformCoord(start, inv), transformCoord(end, inv));
}

/**
 * The object's inverse world matrix when the line touches its box, else null. (An object whose matrix has no inverse
 * is skipped: see `inverse`.)
 */
export function touchedBy(obj: CollisionObject, line: Line): Float32Array | null {
  const inv = inverseOf(obj.matrix);
  return inv !== null && touchesBox(obj, inv, line) ? inv : null;
}

/** The line from `pos` to `end` in the model's space. */
function modelLine(inv: Matrix, pos: Vec3, end: Vec3): { pos: Vec3; dir: Vec3 } {
  const p = transformCoord(pos, inv);
  return { pos: p, dir: sub(transformCoord(end, inv), p) };
}

/**
 * `CObject3D::FindTouchTriLine` (`Object3D.cpp:2035-2110`): the distance along the line, from 0 to under 1, to the
 * first triangle in the mesh's order (not the nearest) that it meets, or null.
 */
export function findTouchTriLine(obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): number | null {
  const line = modelLine(inv, pos, end);
  for (let i = 0; i + 9 <= obj.triangles.length; i += 9) {
    const t = touchRayTri(obj.triangles, i, line.pos, line.dir);
    if (t !== null && t >= 0 && t < 1) return t;
  }
  return null;
}

/**
 * `CObject3D::SlideVectorXZ2` (`Object3D.cpp:1695-1831`, `__FIX_COLLISION`): for the first triangle the line meets,
 * the vector the move becomes, or null. The face's normal is turned into the world without its y, as if the face
 * stood upright (:1803-1814). A line up to 3.0f long meets triangles from 0 to under 1 along it, and gives what is
 * left of it past the face, slid along it (`CalcSlideVec`); a longer one meets them anywhere within its length either
 * way along it, and gives its reflection off the face times 0.2f (:1754-1791).
 */
export function slideVectorXZ2(obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): Vec3 | null {
  const line = modelLine(inv, pos, end);
  const tris = obj.triangles;
  for (let i = 0; i + 9 <= tris.length; i += 9) {
    const t = touchRayTri(tris, i, line.pos, line.dir);
    if (t === null) continue;
    const dir = sub(end, pos);
    const dirLength = vecLength(dir);
    if (dirLength > LONG_LINE ? !(Math.abs(t) < dirLength) : !(t >= 0 && t < 1)) continue;
    const flat = transformCoord(faceNormal(tris, i), rotationOf(obj.matrix));
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
 * `CObject3D::SlideVectorUnder` (`Object3D.cpp:1947-2027`, the `!__SLIDE_060502` one): for the first triangle the
 * line meets (from 0 to under 1 along it), the height where it does, or null. Its normal is normalized in the model
 * and turned into the world (not normalized again): a face up to about 79 degrees steep is a floor and leaves `out`
 * as it is; a steeper one puts into `out` the point a fall of 0.01f slides to along it.
 */
export function slideVectorUnder(out: Vec3, obj: CollisionObject, inv: Matrix, pos: Vec3, end: Vec3): number | null {
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
