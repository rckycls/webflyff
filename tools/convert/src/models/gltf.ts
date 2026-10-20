// Small helpers shared by the model, skeleton and motion glb builders: a document with a default scene, typed
// accessors, web-space matrix arithmetic and TRS decomposition.
//
// Matrices here are web matrices (`toWebMatrix` output): 16 numbers, column-major, for column vectors, so
// element (row r, column c) is m[c * 4 + r] and `multiply(a, b)` applies b first. They are kept as plain number
// arrays (doubles) so that products and inverses do not lose float32 precision on the way.

import { Document, MathUtils, NodeIO } from '@gltf-transform/core';
import type { Accessor, GLTF, Node, TypedArray } from '@gltf-transform/core';
import { toWebMatrix } from '@flyffweb/formats';

export type Mat4 = number[];
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

const io = new NodeIO();

/** A glTF document with one default scene (its one buffer is made with the first accessor). */
export function newDocument(): Document {
  const doc = new Document();
  doc.getRoot().setDefaultScene(doc.createScene());
  return doc;
}

export function writeGlb(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}

export function addAccessor(
  doc: Document,
  type: GLTF.AccessorType,
  array: Float32Array | Uint16Array | Uint8Array,
): Accessor {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  // The readers' arrays are typed over ArrayBufferLike but always sit on a plain ArrayBuffer.
  return doc.createAccessor().setType(type).setArray(array as TypedArray).setBuffer(buffer);
}

/**
 * A D3DXMATRIX as an affine web matrix. The stored _14, _24, _34, _44 (the web matrix's last row) are 0, 0, 0, 1 up
 * to float rounding (at most 1e-6 off over the client's 48,094 bone, object and motion matrices); they are set exactly,
 * as glTF requires for inverse bind matrices. The client's skinning shader reads bone matrices as 4x3 and ignores
 * them too (CObject3D::RenderSkin, Object3D.cpp:3063-3068).
 */
export function webMatrix(d3d: Float32Array): Mat4 {
  const m = Array.from(toWebMatrix(d3d));
  m[3] = 0;
  m[7] = 0;
  m[11] = 0;
  m[15] = 1;
  return m;
}

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a * b: the transform that applies b, then a. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** The inverse of a 4x4 matrix; throws when it has none. */
export function invert(m: Mat4): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as [
    number, number, number, number, number, number, number, number,
    number, number, number, number, number, number, number, number,
  ];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(det) || det === 0) throw new Error(`matrix [${m.join(', ')}] has no inverse`);
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}

const isIdentity = (m: Mat4): boolean => m.every((v, i) => v === IDENTITY[i]);

/** Positions (3 per vertex) moved by `m` (an affine matrix). */
export function transformPositions(m: Mat4, positions: Float32Array): Float32Array {
  if (isIdentity(m)) return positions;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    for (let r = 0; r < 3; r++) out[i + r] = m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!;
  }
  return out;
}

/** Normals (3 per vertex) turned by the inverse transpose of `m`'s upper 3x3, not yet normalized. */
export function transformNormals(m: Mat4, normals: Float32Array): Float32Array {
  if (isIdentity(m)) return normals;
  // n' = (A^-1)^T n, with A the upper 3x3; the inverse comes from the 4x4 one (equal for an affine m).
  const inv = invert(m);
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    for (let r = 0; r < 3; r++) {
      out[i + r] = inv[r * 4]! * normals[i]! + inv[r * 4 + 1]! * normals[i + 1]! + inv[r * 4 + 2]! * normals[i + 2]!;
    }
  }
  return out;
}

/** A unit quaternion; throws for a zero or non-finite one (R17: keys are normalized before writing). */
export function normalizeQuaternion(q: readonly number[]): Quat {
  const length = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!);
  if (!Number.isFinite(length) || length === 0) throw new Error(`rotation [${q.join(', ')}] is not a rotation`);
  return [q[0]! / length, q[1]! / length, q[2]! / length, q[3]! / length];
}

/**
 * Sets a node's translation, rotation and scale from a web matrix. glTF animates only TRS nodes, so every node gets
 * TRS (a matrix with shear loses it; see the task report for how often that happens in the client's skeletons).
 */
export function setTransform(node: Node, m: Mat4): Node {
  const t: Vec3 = [0, 0, 0];
  const r: Quat = [0, 0, 0, 1];
  const s: Vec3 = [1, 1, 1];
  MathUtils.decompose(m as unknown as Parameters<typeof MathUtils.decompose>[0], t, r, s);
  return node.setTranslation(t).setRotation(normalizeQuaternion(r)).setScale(s);
}
