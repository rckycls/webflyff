// Left-handed (Direct3D) to right-handed (glTF, three.js) conversion, for everything the converter writes and the
// viewer reads. Nothing else in the codebase converts coordinates on its own (global constraints).
//
// The conversion is the mirror S = diag(1, 1, -1, 1): negate Z. Four consequences, one function each:
//
//   positions    (x, y, z)        -> (x, y, -z)                                  toWebPosition
//   matrices     M (D3DXMATRIX)   -> S M S                                       toWebMatrix
//   quaternions  (x, y, z, w)     -> (-x, -y, z, w)                              toWebQuaternion
//   triangles    (a, b, c)        -> (a, c, b)                                   flipWinding
//
// Matrices: D3DX stores _11, _12, ..., _44 and multiplies row vectors (v' = v M). That memory order, read as
// a column-major array, is the matrix for column vectors (v' = M^T v), which is what three.js and glTF use, so a
// D3D matrix needs no transpose. Conjugating with S multiplies element (row i, column j) by s_i s_j, which flips
// the sign exactly when one of i, j is 2 and the other is not. In column-major array positions that is indices 2,
// 6 and 14 (column 0, 1, 3 of row 2) and 8, 9 and 11 (rows 0, 1, 3 of column 2): 2, 6, 8, 9, 11, 14. The
// translation (indices 12 to 14) thus ends up as (x, y, -z), matching `toWebPosition`.
//
// Quaternions: a mirror turns a rotation about axis a into a rotation by the same angle about -S a (an axis is a
// pseudovector), which for S = diag(1, 1, -1) is (-ax, -ay, az); w is the angle and stays.
//
// Triangles: mirroring Z reverses the winding that a viewer sees, and Direct3D (clockwise front faces) and glTF
// (counter-clockwise) disagree about which winding is the front. Together the mirror and the winding flip leave
// every face looking the same way, so a front face stays a front face.
//
// Every result is a new array. Negation is `0 - v`, not `-v`, so a zero never becomes negative zero (which would
// make the converter's output bytes differ between 0 and -0 for the same geometry).

import type { Vec3 } from '../binary/BinaryReader';

/** Column-major indices of a matrix that change sign under conjugation by diag(1, 1, -1, 1). */
const MIRRORED_MATRIX_INDICES = [2, 6, 8, 9, 11, 14] as const;

function negate(v: number): number {
  return 0 - v;
}

/** A position in web space: `[x, y, -z]`. */
export function toWebPosition(v: Vec3): Vec3 {
  return [v[0], v[1], negate(v[2])];
}

/**
 * A D3DXMATRIX (16 floats in file order, `objectLocalMatrix`'s output) as a web matrix: a column-major array for
 * column vectors, mirrored in Z.
 */
export function toWebMatrix(m: Float32Array): Float32Array {
  if (m.length !== 16) {
    throw new RangeError(`toWebMatrix: expected 16 elements, got ${m.length}`);
  }
  const out = Float32Array.from(m);
  for (const i of MIRRORED_MATRIX_INDICES) {
    out[i] = negate(m[i]!);
  }
  return out;
}

/** A rotation quaternion `[x, y, z, w]` in web space: `[-x, -y, z, w]`. */
export function toWebQuaternion(q: [number, number, number, number]): [number, number, number, number] {
  return [negate(q[0]), negate(q[1]), q[2], q[3]];
}

/** A copy of a triangle list with the second and third index of every triangle swapped. */
export function flipWinding<T extends Uint16Array | Uint32Array>(indices: T): T {
  if (indices.length % 3 !== 0) {
    throw new RangeError(`flipWinding: ${indices.length} indices is not a whole number of triangles`);
  }
  const out = indices.slice() as T;
  for (let i = 0; i < out.length; i += 3) {
    out[i + 1] = indices[i + 2]!;
    out[i + 2] = indices[i + 1]!;
  }
  return out;
}
