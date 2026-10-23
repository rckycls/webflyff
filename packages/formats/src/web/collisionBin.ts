// The collision file the converter writes for a model (`collision/<stem>.<hash>.bin`) and the client loads with the
// world's tiles. Not a client format: there is no C++ to copy, so the layout below is the whole contract, and
// `encodeCollisionBin` and `decodeCollisionBin` are its only two implementations. Little-endian throughout:
//
//   u32 triangleCount
//   f32 triangle[triangleCount][9]     the three corners, x y z each, in the order the mesh's face lists them
//
// The corners are the model's own space, as the .o3d stores them: D3D coordinates (left-handed, y up), with no
// handedness flip and no transform. That is the space Neuz tests in (CObject3D::SlideVectorXZ takes the collision
// mesh's vertex positions as they are and moves the line into the model's space with the inverse of the object's
// world matrix, Object3D.cpp:1590); `tools/convert/src/models/collisionFiles.ts` says where each corner comes from.
//
// Errors: `decodeCollisionBin` reads untrusted bytes and throws FormatError (no C++ reference exists, so `cppRef` is
// 'n/a'); `encodeCollisionBin` checks its caller's data and throws RangeError for floats that are not whole triangles.

import { BinaryReader } from '../binary/BinaryReader';

const READER = 'decodeCollisionBin';
const NO_CPP_REF = 'n/a';

const FLOATS_PER_TRIANGLE = 9;
const TRIANGLE_BYTES = FLOATS_PER_TRIANGLE * 4;

/**
 * The logical key of a model's collision file (the asset index maps it to the hashed path). `stem` is the model's
 * web stem, the same text as in the model's own key: `models/<stem>.glb` has its collision in `collision/<stem>.bin`.
 * The converter makes both keys from `webName` of the model's file name, so a reader holding the glb key takes the
 * text between `models/` and `.glb` as the stem. Not every model has a collision file: only those with a collision
 * mesh do, and the index lacks the key of the others.
 */
export const collisionKey = (stem: string): string => `collision/${stem}.bin`;

/** `triangles` holds 9 floats per triangle (v0.xyz v1.xyz v2.xyz); anything else is a RangeError. */
export function encodeCollisionBin(triangles: Float32Array): Uint8Array {
  if (triangles.length % FLOATS_PER_TRIANGLE !== 0) {
    throw new RangeError(
      `encodeCollisionBin: ${triangles.length} floats are not whole triangles (${FLOATS_PER_TRIANGLE} each)`,
    );
  }
  const out = new Uint8Array(4 + triangles.length * 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, triangles.length / FLOATS_PER_TRIANGLE, true);
  for (let i = 0; i < triangles.length; i++) view.setFloat32(4 + i * 4, triangles[i]!, true);
  return out;
}

/**
 * Reads a file written by `encodeCollisionBin`: 9 floats per triangle. The result is a copy, not a view into `bytes`.
 * `file` only labels errors (the URL or path the bytes came from).
 */
export function decodeCollisionBin(bytes: Uint8Array, file = '<collision.bin>'): Float32Array {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: NO_CPP_REF });
  const count = r.u32();
  if (count * TRIANGLE_BYTES > r.remaining()) {
    r.fail(`${count} triangles need ${count * TRIANGLE_BYTES} bytes but only ${r.remaining()} remain`);
  }
  const triangles = r.f32Array(count * FLOATS_PER_TRIANGLE);
  r.expectEnd();
  return triangles;
}
