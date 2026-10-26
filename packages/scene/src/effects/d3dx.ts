import type { Vec3 } from '@flyffweb/formats';

/**
 * The D3DX matrix and vector functions the effect player's maths is made of (`Source/_Common/sfxbase.cpp`), in floats as
 * the C++ keeps them: `f32` after every operation. D3DX's code is in its DLL and not known, so the functions are written
 * as Wine's d3dx9 writes them (as the client's `apps/client/src/world/sim/d3dx.ts` does for the collision rules; that
 * module is the client's, and the scene can't import it), and the last bit may differ.
 *
 * A matrix is a `D3DXMATRIX`'s 16 floats in memory order: `m[r * 4 + c]` is `_(r+1)(c+1)`, a row vector multiplies it
 * (`v' = v M`), `a * b` applies `a` first, and the translation is elements 12 to 14.
 */

const f32 = Math.fround;

export type Matrix = number[];

/** `D3DX_PI` (`d3dx9math.h:28`). */
const PI = f32(3.141592654);
/** `2.0f * D3DX_PI`, the start of `DEGREETORADIAN` (`sfxbase.h:6`). */
const TWO_PI = f32(2 * PI);
/** `1.0f / 360.0f`: `D3DXVECTOR3::operator /` multiplies by the inverse (`d3dx9math.inl`). */
const INV_360 = f32(1 / 360);

/** `DEGREETORADIAN( x )` of a float (`sfxbase.h:6`): `( 2.0f * D3DX_PI * x ) / 360.0f`. */
export function degToRad(x: number): number {
  return f32(f32(TWO_PI * x) / 360);
}

/**
 * `DEGREETORADIAN( v )` of a `D3DXVECTOR3`: `2.0f * D3DX_PI * v` is `operator *( FLOAT, v )`, and `/ 360.0f` is
 * `operator /( FLOAT )`, which multiplies by `1.0f / 360.0f`.
 */
export function degToRadVec(v: Vec3): Vec3 {
  return [f32(f32(TWO_PI * v[0]) * INV_360), f32(f32(TWO_PI * v[1]) * INV_360), f32(f32(TWO_PI * v[2]) * INV_360)];
}

export const vecAdd = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] + b[0]), f32(a[1] + b[1]), f32(a[2] + b[2])];
export const vecSub = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] - b[0]), f32(a[1] - b[1]), f32(a[2] - b[2])];
/** Component by component: what the C++ writes out as `v.x * s.x`, `v.y * s.y`, `v.z * s.z`. */
export const vecMul = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] * b[0]), f32(a[1] * b[1]), f32(a[2] * b[2])];

/** `D3DXVec3Length`: `sqrtf` of the float sum of squares. */
export function vecLength(v: Vec3): number {
  return f32(Math.sqrt(f32(f32(f32(v[0] * v[0]) + f32(v[1] * v[1])) + f32(v[2] * v[2]))));
}

export function identity(): Matrix {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** `D3DXMatrixScaling`. */
export function scaling(x: number, y: number, z: number): Matrix {
  return [f32(x), 0, 0, 0, 0, f32(y), 0, 0, 0, 0, f32(z), 0, 0, 0, 0, 1];
}

/** `D3DXMatrixTranslation`. */
export function translation(x: number, y: number, z: number): Matrix {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, f32(x), f32(y), f32(z), 1];
}

/** `D3DXMatrixRotationX`: `_22 = _33 = cosf`, `_23 = sinf`, `_32 = -sinf`. */
export function rotationX(angle: number): Matrix {
  const s = f32(Math.sin(angle));
  const c = f32(Math.cos(angle));
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** `D3DXMatrixRotationZ`: `_11 = _22 = cosf`, `_12 = sinf`, `_21 = -sinf`. */
export function rotationZ(angle: number): Matrix {
  const s = f32(Math.sin(angle));
  const c = f32(Math.cos(angle));
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * `D3DXMatrixRotationYawPitchRoll( yaw, pitch, roll )`, radians: roll about Z, then pitch about X, then yaw about Y
 * (`Rz * Rx * Ry`), as Wine's d3dx9 writes the product out.
 */
export function yawPitchRoll(yaw: number, pitch: number, roll: number): Matrix {
  const sr = f32(Math.sin(roll)), cr = f32(Math.cos(roll));
  const sp = f32(Math.sin(pitch)), cp = f32(Math.cos(pitch));
  const sy = f32(Math.sin(yaw)), cy = f32(Math.cos(yaw));
  return [
    f32(f32(f32(sr * sp) * sy) + f32(cr * cy)), f32(sr * cp), f32(f32(f32(sr * sp) * cy) - f32(cr * sy)), 0,
    f32(f32(f32(cr * sp) * sy) - f32(sr * cy)), f32(cr * cp), f32(f32(f32(cr * sp) * cy) + f32(sr * sy)), 0,
    f32(cp * sy), -sp, f32(cp * cy), 0,
    0, 0, 0, 1,
  ];
}

/** `yawPitchRoll` of a vector of radians as the C++ passes it: yaw = y, pitch = x, roll = z. */
export const yawPitchRollOf = (radians: Vec3): Matrix => yawPitchRoll(radians[1], radians[0], radians[2]);

/** `D3DXMatrixMultiply( out, a, b )` (`a * b`): `a` applied first, each element summed left to right in floats. */
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Matrix {
  const out = new Array<number>(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const a0 = a[r * 4]!, a1 = a[r * 4 + 1]!, a2 = a[r * 4 + 2]!, a3 = a[r * 4 + 3]!;
      out[r * 4 + c] = f32(f32(f32(f32(a0 * b[c]!) + f32(a1 * b[4 + c]!)) + f32(a2 * b[8 + c]!)) + f32(a3 * b[12 + c]!));
    }
  }
  return out;
}

/** `a * b * c * ...`, left to right. */
export function product(...matrices: ArrayLike<number>[]): Matrix {
  return matrices.slice(1).reduce<Matrix>((m, next) => multiply(m, next), Array.from(matrices[0]!));
}

/** `D3DXVec3TransformCoord`: `( v, 1 ) * m`, over its w, as Wine's d3dx9 writes it. */
export function transformCoord(v: Vec3, m: ArrayLike<number>): Vec3 {
  const column = (c: number): number =>
    f32(f32(f32(f32(m[c]! * v[0]) + f32(m[4 + c]! * v[1])) + f32(m[8 + c]! * v[2])) + m[12 + c]!);
  const w = column(3);
  return [f32(column(0) / w), f32(column(1) / w), f32(column(2) / w)];
}
