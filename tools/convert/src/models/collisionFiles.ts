// The collision file of a model (`collision/<stem>.bin`, collisionBin.ts), written by the models stage for each model
// that has a collision mesh. The mesh is the GMOBJECT after the model's events in the .o3d (CObject3D::LoadObject
// reads it into m_CollObject, Object3D.cpp:992), kept apart from the objects that are drawn.
//
// What Neuz tests against, which this copies (CObject3D::SlideVectorXZ, Object3D.cpp:1590; SlideVectorXZ2 at 1695,
// SlideVectorUnder at 1889 and FindTouchTriLine at 2035 read the mesh the same way):
//   - every face of `m_nMaxFaceList`, its three corners `pVB[ *pIB++ ].position`: the index buffer's entries into
//     the vertex buffer, so a corner is shared by the faces that index it, and the vertex list (m_pVertexList) is
//     not read;
//   - the object's world matrix and nothing else: `mTM = mWorld` (Object3D.cpp:1629; FindTouchTriLine's comment at
//     2078: the collision mesh has no LocalTM). So the corners stay in the model's own space, in D3D coordinates.
// A mesh with no faces still gets its file: the model counts as having a collision mesh (IsHaveCollObj,
// Object3D.h:301), which TestIntersectionOBB_Line asks for before it tests the box (ModelObject.cpp:393).

import type { GmObject } from '@flyffweb/formats';
import { collisionKey, encodeCollisionBin } from '@flyffweb/formats';
import type { AssetWriter } from '../output/AssetWriter';

const POSITION_FLOATS = 3;

/**
 * The triangles of a collision mesh: 9 floats per face, the positions of its three corners in index order (the
 * model's own space, D3D, as stored). readO3d has checked that the indices are 3 per face and inside the vertex buffer.
 */
export function collisionTriangles(mesh: GmObject): Float32Array {
  const { positions, indices } = mesh;
  const triangles = new Float32Array(indices.length * POSITION_FLOATS);
  indices.forEach((vertex, corner) => {
    const from = vertex * POSITION_FLOATS;
    triangles.set(positions.subarray(from, from + POSITION_FLOATS), corner * POSITION_FLOATS);
  });
  return triangles;
}

/**
 * Writes `collision/<stem>.bin` for a model's collision mesh. `stem` is the one the glb has, `webName` of the model's
 * file name (`models/<stem>.glb`). Returns the size of the file, or null (and writes nothing) when there is no mesh.
 */
export async function writeCollision(
  mesh: GmObject | null,
  stem: string,
  writer: AssetWriter,
  source: string,
): Promise<number | null> {
  if (mesh === null) return null;
  const bytes = encodeCollisionBin(collisionTriangles(mesh));
  await writer.write(collisionKey(stem), bytes, source);
  return bytes.length;
}
