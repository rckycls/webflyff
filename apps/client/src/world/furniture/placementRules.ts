// The furniture core's rules (2026-11-15, side-session-notes housing-research/A-client.md §2.6, §3.3): where a piece being
// placed collides, as Neuz decides it, and the pieces' boxes and matrices. D3D coordinates and degrees, as the C++ holds
// them. Shared by personal housing and, later, the guild house.
//
//   CObj::UpdateLocalMatrix        _Common/Obj.cpp:126-152          scale x RotationYawPitchRoll( -angle, 0, 0 ) x translation
//   BBOX::UpdateMartix             _Common/xUtil3D.cpp:305-331      the OBB: the model box's centre through the world matrix,
//                                                                   its half sizes times the scale, the rotation's rows as axes
//   CWorld::TestOBBIntersect       _Common/WorldIntersect.cpp:166+  the separating-axis test of two OBBs
//   CWorld::ProcessObjCollision    WorldIntersect.cpp:95-125        a piece collides when its box is out of the room's wall box,
//                                                                   when it touches the wall's triangles (TestTriIntersect ->
//                                                                   CObject3D::SimpleTriIntersect, Object3D.cpp:2156+), or when
//                                                                   its box meets another control's (the one being moved left out)
//
// Simplified: the wall's box is its collision mesh's bounds (the drawn mesh's box is not loaded here, as sim/object3d.ts
// does); a piece with no collision mesh tests its box's 12 triangles against the wall (Neuz takes its drawn mesh); the
// triangle test is the six edges of each pair against the other triangle, which misses only coplanar overlaps; and every
// control in view is tested, where FOR_LINKMAP visits those of the link cells around the point.

import type { Vec3 } from '@flyffweb/protocol';

/** A box in the world: `BBOX` (`Center`, `Axis[3]`, `Extent[3]`). */
export interface Obb {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  extents: Vec3;
}

/** A model's box in its own space (`m_vMin`, `m_vMax`). */
export interface ModelBox {
  min: Vec3;
  max: Vec3;
}

const RAD = Math.PI / 180;

/**
 * `m_matWorld` of a control at `pos`, turned `angle` degrees and scaled `scale` (`UpdateLocalMatrix`): 16 numbers, row-major,
 * for row vectors (`_11 _12 _13 _14 _21 ...`), as `CollisionObject.matrix`.
 */
export function placedMatrix(scale: number, angle: number, pos: Vec3): Float32Array {
  // D3DXMatrixRotationY( -angle ): _11 cos, _13 -sin(-a) = sin a, _31 sin(-a) = -sin a, _33 cos
  const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
  return new Float32Array([
    scale * c, 0, scale * s, 0,
    0, scale, 0, 0,
    -scale * s, 0, scale * c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

/** `D3DXVec3TransformCoord` with a row-major matrix of no projection. */
export function transform(m: ArrayLike<number>, v: Vec3): Vec3 {
  return [
    v[0] * m[0]! + v[1] * m[4]! + v[2] * m[8]! + m[12]!,
    v[0] * m[1]! + v[1] * m[5]! + v[2] * m[9]! + m[13]!,
    v[0] * m[2]! + v[1] * m[6]! + v[2] * m[10]! + m[14]!,
  ];
}

/**
 * `BBOX::UpdateMartix` with the world matrix `m`: the box's centre through it, each half size times the length of its row
 * (the scale), each row made unit (the rotation's row).
 */
export function obbOf(box: ModelBox, m: ArrayLike<number>): Obb {
  const center = transform(m, [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]);
  const axes: Vec3[] = [];
  const extents: number[] = [];
  for (let i = 0; i < 3; i++) {
    const row: Vec3 = [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
    const length = Math.hypot(...row) || 1;
    axes.push([row[0] / length, row[1] / length, row[2] / length]);
    // Extent is negative where a box has no back face (`__BS_BBOX_ABS_EXTENT` takes its size)
    extents.push(Math.abs((box.max[i]! - box.min[i]!) / 2) * length);
  }
  return { center, axes: axes as [Vec3, Vec3, Vec3], extents: extents as unknown as Vec3 };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** `TestOBBIntersect`: the 15 axes of the separating-axis test; touching counts as meeting (`t > ra + rb` separates). */
export function obbsIntersect(a: Obb, b: Obb): boolean {
  const r: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const abs: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      r[i]![k] = dot(a.axes[i], b.axes[k]);
      abs[i]![k] = Math.abs(r[i]![k]!) + 1e-6;
    }
  }
  const d = sub(b.center, a.center);
  const t = [dot(d, a.axes[0]), dot(d, a.axes[1]), dot(d, a.axes[2])];
  const ea = a.extents, eb = b.extents;
  for (let i = 0; i < 3; i++) {
    const rb = eb[0] * abs[i]![0]! + eb[1] * abs[i]![1]! + eb[2] * abs[i]![2]!;
    if (Math.abs(t[i]!) > ea[i]! + rb) return false;
  }
  for (let k = 0; k < 3; k++) {
    const ra = ea[0] * abs[0]![k]! + ea[1] * abs[1]![k]! + ea[2] * abs[2]![k]!;
    if (Math.abs(t[0]! * r[0]![k]! + t[1]! * r[1]![k]! + t[2]! * r[2]![k]!) > ra + eb[k]!) return false;
  }
  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
    for (let k = 0; k < 3; k++) {
      const k1 = (k + 1) % 3, k2 = (k + 2) % 3;
      const ra = ea[i1]! * abs[i2]![k]! + ea[i2]! * abs[i1]![k]!;
      const rb = eb[k1]! * abs[i]![k2]! + eb[k2]! * abs[i]![k1]!;
      if (Math.abs(t[i2]! * r[i1]![k]! - t[i1]! * r[i2]![k]!) > ra + rb) return false;
    }
  }
  return true;
}

/** The 12 triangles of a box (9 numbers each), for a piece with no collision mesh. */
export function obbTriangles(o: Obb): Float32Array {
  const corner = (sx: number, sy: number, sz: number): Vec3 => {
    const p: Vec3 = [...o.center];
    for (let i = 0; i < 3; i++) {
      const s = [sx, sy, sz][i]! * o.extents[i]!;
      p[0] += o.axes[i]![0] * s; p[1] += o.axes[i]![1] * s; p[2] += o.axes[i]![2] * s;
    }
    return p;
  };
  const c = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1),
    corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7],
    [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  const out = new Float32Array(faces.length * 9);
  faces.forEach((face, f) => face.forEach((v, j) => out.set(c[v]!, f * 9 + j * 3)));
  return out;
}

/** A mesh's triangles (9 numbers each, in its own space) through the world matrix `m`. */
export function worldTriangles(triangles: Float32Array, m: ArrayLike<number>): Float32Array {
  const out = new Float32Array(triangles.length);
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    out.set(transform(m, [triangles[i]!, triangles[i + 1]!, triangles[i + 2]!]), i);
  }
  return out;
}

/** The world box of some triangles (min, max), null for none. */
function boundsOf(t: Float32Array): [Vec3, Vec3] | null {
  if (t.length < 9) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < t.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = t[i + a]!;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  return [min, max];
}

const EPSILON = 1e-7;

/** Whether the segment p..q meets the triangle a, b, c (Möller-Trumbore, both faces). */
function segmentMeetsTriangle(p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const dir = sub(q, p);
  const e1 = sub(b, a), e2 = sub(c, a);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < EPSILON) return false;
  const inv = 1 / det;
  const s = sub(p, a);
  const u = dot(s, h) * inv;
  if (u < 0 || u > 1) return false;
  const qv = cross(s, e1);
  const v = dot(dir, qv) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) * inv;
  return t >= 0 && t <= 1;
}

const vertex = (t: Float32Array, i: number, j: number): Vec3 => [t[i + j * 3]!, t[i + j * 3 + 1]!, t[i + j * 3 + 2]!];

/** Whether two triangles meet: an edge of one through the other. */
function trianglesMeet(t1: Float32Array, i: number, t2: Float32Array, j: number): boolean {
  const a = [vertex(t1, i, 0), vertex(t1, i, 1), vertex(t1, i, 2)] as const;
  const b = [vertex(t2, j, 0), vertex(t2, j, 1), vertex(t2, j, 2)] as const;
  for (let e = 0; e < 3; e++) {
    if (segmentMeetsTriangle(a[e]!, a[(e + 1) % 3]!, b[0], b[1], b[2])) return true;
    if (segmentMeetsTriangle(b[e]!, b[(e + 1) % 3]!, a[0], a[1], a[2])) return true;
  }
  return false;
}

/** `SimpleTriIntersect`: whether any triangle of `a` meets any of `b` (both in world space); `b`'s box skips far ones. */
export function meshesMeet(a: Float32Array, b: Float32Array): boolean {
  const box = boundsOf(b);
  if (box === null) return false;
  const [min, max] = box;
  for (let i = 0; i + 8 < a.length; i += 9) {
    let out = false;
    for (let k = 0; k < 3 && !out; k++) {
      const lo = Math.min(a[i + k]!, a[i + 3 + k]!, a[i + 6 + k]!), hi = Math.max(a[i + k]!, a[i + 3 + k]!, a[i + 6 + k]!);
      out = hi < min[k]! || lo > max[k]!;
    }
    if (out) continue;
    for (let j = 0; j + 8 < b.length; j += 9) if (trianglesMeet(a, i, b, j)) return true;
  }
  return false;
}

/** The room's wall (`obj_miniwall01.o3d`): its box and its triangles in the world. */
export interface RoomShell {
  obb: Obb;
  triangles: Float32Array;
}

/** The piece being placed: its box, and its triangles in the world (its collision mesh, else its box's). */
export interface PlacedShape {
  obb: Obb;
  triangles: Float32Array;
}

/**
 * `CDeployManager::CheckCollision` -> `ProcessObjCollision`: no wall, no collision (`m_pWallObj` NULL); out of the wall's box,
 * or touching the wall, collides; so does meeting another control's box (`others`, the piece being moved left out by the caller).
 */
export function collides(piece: PlacedShape, wall: RoomShell | null, others: Iterable<Obb>): boolean {
  if (wall === null) return false;
  if (!obbsIntersect(wall.obb, piece.obb)) return true; // out of the room
  if (meshesMeet(wall.triangles, piece.triangles)) return true;
  for (const other of others) if (obbsIntersect(other, piece.obb)) return true;
  return false;
}

/** The model key of the room's wall, whose box and triangles bound the room (`GetObjByName("obj_miniwall01.o3d")`). */
export const ROOM_WALL_MODEL = 'models/obj_miniwall01.glb';

/** `m_fAngle` as `CObj::SetAngle` keeps it: the angle cut to 65536ths of a turn, in 0..360. */
export function keptAngle(angle: number): number {
  return (360 / 65536) * (Math.trunc(angle * (65536 / 360)) & 65535);
}
