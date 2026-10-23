import type { Vec3 } from '@flyffweb/protocol';

/**
 * The 3D math the collision rules are made of, in floats as the C++ keeps it (`f32` at every store; see
 * `ActionMover.ts`): D3DX's vector and matrix functions, and FlyFF's own line tests (`Source/_Common/xUtil3D.cpp`).
 * D3DX's code is in its DLL and not known: `D3DXVec3TransformCoord` and `D3DXVec3Normalize` are written as Wine's
 * d3dx9 writes them and `D3DXMatrixInverse` by cofactors, so the last bit may differ.
 *
 * The functions the rules call at every step for every mover (the line transforms, the face normal, the normalize) also
 * come as `...To( out, ... )`, which write into `out` (it may be an argument) instead of making a new vector: the same
 * float operations in the same order, without the garbage.
 */

const f32 = Math.fround;

export const toFloats = (v: Vec3): Vec3 => [f32(v[0]), f32(v[1]), f32(v[2])];
export const add = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] + b[0]), f32(a[1] + b[1]), f32(a[2] + b[2])];
export const sub = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] - b[0]), f32(a[1] - b[1]), f32(a[2] - b[2])];
/** `D3DXVECTOR3::operator*` either way round: `s * v.x`, ... */
export const scale = (v: Vec3, s: number): Vec3 => [f32(v[0] * s), f32(v[1] * s), f32(v[2] * s)];
export const dot3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  f32(f32(f32(ax * bx) + f32(ay * by)) + f32(az * bz));
/** `D3DXVec3Dot`; `D3DXVec3LengthSq` is `dot(v, v)`. */
export const dot = (a: Vec3, b: Vec3): number => dot3(a[0], a[1], a[2], b[0], b[1], b[2]);
/** `D3DXVec3Cross`. */
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  f32(f32(a[1] * b[2]) - f32(a[2] * b[1])), f32(f32(a[2] * b[0]) - f32(a[0] * b[2])), f32(f32(a[0] * b[1]) - f32(a[1] * b[0])),
];
export const set = (out: Vec3, v: Vec3): void => {
  out[0] = v[0];
  out[1] = v[1];
  out[2] = v[2];
};

/** `D3DXVec3Length`: `sqrtf` of the float sum of squares. */
export const vecLength = (v: Vec3): number => f32(Math.sqrt(dot(v, v)));

/** `D3DXVec3Normalize`: the vector over its length; a zero vector stays zero, as in Wine's d3dx9. */
export function normalize(v: Vec3): Vec3 {
  return normalizeTo([0, 0, 0], v);
}

/** `normalize` into `out`, which may be `v`. */
export function normalizeTo(out: Vec3, v: Vec3): Vec3 {
  const length = vecLength(v);
  if (length === 0) {
    out[0] = out[1] = out[2] = 0;
  } else {
    out[0] = f32(v[0] / length);
    out[1] = f32(v[1] / length);
    out[2] = f32(v[2] / length);
  }
  return out;
}

/** A `D3DXMATRIX`'s 16 floats in memory order: `m[r * 4 + c]` is `_(r+1)(c+1)`, and a row vector multiplies it. */
export type Matrix = ArrayLike<number>;

/** `D3DXVec3TransformCoord`: `( v, 1 ) * m`, over its w. */
export function transformCoord(v: Vec3, m: Matrix): Vec3 {
  return transformCoordTo([0, 0, 0], v, m);
}

/** `transformCoord` into `out`, which may be `v`. */
export function transformCoordTo(out: Vec3, v: Vec3, m: Matrix): Vec3 {
  const w = column(v, m, 3);
  const x = column(v, m, 0);
  const y = column(v, m, 1);
  const z = column(v, m, 2);
  out[0] = f32(x / w);
  out[1] = f32(y / w);
  out[2] = f32(z / w);
  return out;
}

/** `x * m._1c + y * m._2c + z * m._3c + m._4c`, left to right in floats. */
function column(v: Vec3, m: Matrix, c: number): number {
  return f32(f32(f32(f32(m[c]! * v[0]) + f32(m[4 + c]! * v[1])) + f32(m[8 + c]! * v[2])) + m[12 + c]!);
}

/** `mInv = mTM; mInv._41 = mInv._42 = mInv._43 = 0;`: the matrix that turns a normal into the world. */
export function withoutTranslation(m: Matrix): Float32Array {
  const r = Float32Array.from(m);
  r[12] = r[13] = r[14] = 0;
  return r;
}

/** Sums left to right in floats: `a + b + c` in C. */
const sum = (...terms: number[]): number => terms.reduce((s, t) => f32(s + t));
const mul = (a: number, b: number): number => f32(a * b);

type Matrix16 = [
  number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number,
];

/**
 * `D3DXMatrixInverse` by cofactors, in floats; null where the determinant is 0 (D3DX returns NULL and leaves the
 * result unset, which the C++ then reads anyway: such an object is skipped).
 */
export function inverse(m: Matrix): Float32Array | null {
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

/**
 * `D3DXIntersectTri` as Wine's d3dx9 writes it: `orig - v0` through the inverse of the matrix whose rows are
 * `v1 - v0`, `v2 - v0` and `-dir` (`D3DXVec4Transform`) gives u, v and the distance along `dir`, in its lengths. Both
 * sides of the triangle count. That distance when the line meets the triangle ahead of `orig` (u, v >= 0, u + v <= 1,
 * the distance >= 0), else null; null too where the matrix has no inverse.
 */
export function intersectTri(v0: Vec3, v1: Vec3, v2: Vec3, orig: Vec3, dir: Vec3): number | null {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const inv = inverse([e1[0], e1[1], e1[2], 0, e2[0], e2[1], e2[2], 0, -dir[0], -dir[1], -dir[2], 0, 0, 0, 0, 1]);
  if (inv === null) return null;
  const v = sub(orig, v0); // and w 0
  const at = (c: number): number => f32(f32(f32(f32(inv[c]! * v[0]) + f32(inv[4 + c]! * v[1])) + f32(inv[8 + c]! * v[2])) + 0);
  const u = at(0);
  const w = at(1);
  const t = at(2);
  return u >= 0 && w >= 0 && f32(u + w) <= 1 && t >= 0 ? Math.abs(t) : null;
}

// ---- xUtil3D.cpp --------------------------------------------------------------------------------------------------

/** `CalcSlideVec` (`xUtil3D.cpp:286-292`): `vDir` without its part along the unit normal `vN`. */
export function calcSlideVec(dir: Vec3, n: Vec3): Vec3 {
  const inverted: Vec3 = [-n[0], -n[1], -n[2]];
  return sub(dir, scale(inverted, dot(dir, inverted)));
}

/**
 * `IsTouchRayTri` (`xUtil3D.cpp:230-279`) for the triangle whose 9 floats start at `i`: the distance along `dir` (in
 * lengths of `dir`, either way along the line) from `orig` to where the line meets it, or null. One-sided: only a
 * line against the triangle's normal, `cross( v1 - v0, v2 - v0 )`, meets it; the edges count (`u`, `v` and `u + v`
 * may equal their bounds).
 */
export function touchRayTri(tris: ArrayLike<number>, i: number, orig: Vec3, dir: Vec3): number | null {
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

/** `IsTouchRayTri`'s `det < 0.0001f` (`xUtil3D.cpp:252`). */
const MIN_DET = f32(0.0001);

/** The normal of the triangle at `i`, `cross( v1 - v0, v2 - v0 )`, not normalized. */
export function faceNormal(tris: ArrayLike<number>, i: number): Vec3 {
  return faceNormalTo([0, 0, 0], tris, i);
}

/** `faceNormal` into `out`: `sub` of the corners and `cross`, term by term. */
export function faceNormalTo(out: Vec3, tris: ArrayLike<number>, i: number): Vec3 {
  const x0 = tris[i]!, y0 = tris[i + 1]!, z0 = tris[i + 2]!;
  const ax = f32(tris[i + 3]! - x0), ay = f32(tris[i + 4]! - y0), az = f32(tris[i + 5]! - z0);
  const bx = f32(tris[i + 6]! - x0), by = f32(tris[i + 7]! - y0), bz = f32(tris[i + 8]! - z0);
  out[0] = f32(f32(ay * bz) - f32(az * by));
  out[1] = f32(f32(az * bx) - f32(ax * bz));
  out[2] = f32(f32(ax * by) - f32(ay * bx));
  return out;
}

/** `IsTouchAABB_Line` (`xUtil3D.cpp:127-203`): whether the line from `v1` to `v2` touches the box, in floats. */
export function touchesAabb(box: ArrayLike<number>, v1: Vec3, v2: Vec3): boolean {
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

/**
 * `CalcOutCode` (`xUtil3D.cpp:95-116`): on which sides of the box (`[minX, minY, minZ, maxX, maxY, maxZ]`) the point
 * is, one bit pair an axis.
 */
function outCode(box: ArrayLike<number>, v: Vec3): number {
  let code = 0;
  for (let k = 0; k < 3; k++) {
    if (v[k]! > box[3 + k]!) code |= 1 << (2 * k); // CLIP_RIGHT, CLIP_TOP, CLIP_BACK
    else if (v[k]! < box[k]!) code |= 2 << (2 * k); // CLIP_LEFT, CLIP_BOTTOM, CLIP_FRONT
  }
  return code;
}
