import { expect, it } from 'vitest';
import { decodeCollisionBin, encodeCollisionBin, readO3d } from '@flyffweb/formats';
import type { GmObject, O3dModel } from '@flyffweb/formats';
import { describeClient, forEachClientFile } from '../../../packages/formats/test/helpers/client';
import { collisionTriangles } from '../src/models/collisionFiles';

// The collision meshes of every model the models stage converts (the .o3d files directly in Client/Model that Neuz
// accepts): each gives whole triangles with finite corners and survives the collision file. Corpus test
// (`npm run test:corpus`): it needs the client folder. The rules of the files are unit-tested in collision.test.ts.

/** Throws unless the mesh converts to a collision file with whole triangles, and the file reads back the same. */
function checkMesh(mesh: GmObject): number {
  if (mesh.indices.length % 3 !== 0) throw new Error(`${mesh.indices.length} indices are not whole triangles`);
  const vertices = mesh.positions.length / 3;
  const outside = mesh.indices.find((i) => i >= vertices);
  if (outside !== undefined) throw new Error(`index ${outside} is not one of the ${vertices} vertices`);

  const triangles = collisionTriangles(mesh);
  if (triangles.length !== (mesh.indices.length / 3) * 9) {
    throw new Error(`${triangles.length} floats for ${mesh.indices.length / 3} faces`);
  }
  const notFinite = triangles.findIndex((v) => !Number.isFinite(v));
  if (notFinite >= 0) throw new Error(`corner float ${notFinite} is ${triangles[notFinite]}`);

  const bytes = encodeCollisionBin(triangles);
  const back = decodeCollisionBin(bytes);
  if (back.length !== triangles.length || back.some((v, i) => v !== triangles[i])) {
    throw new Error('the collision file does not read back the same triangles');
  }
  return bytes.length;
}

describeClient('collision meshes of the real models', () => {
  it('every collision mesh of the real models converts, with whole triangles', () => {
    const stats = { models: 0, refused: 0, withCollision: 0, empty: 0, triangles: 0, bytes: 0 };
    const { count, failures } = forEachClientFile('Model', /\.o3d$/i, (bytes, file) => {
      let model: O3dModel;
      try {
        model = readO3d(bytes, file);
      } catch (error) {
        // a version Neuz refuses too (R21): the models stage skips the file with a warning
        if (error instanceof Error && /older than the oldest the client reads/.test(error.message)) {
          stats.refused++;
          return;
        }
        throw error;
      }
      if (!model.nameMatches) {
        stats.refused++;
        return;
      }
      stats.models++;
      if (model.collision === null) return;
      stats.withCollision++;
      if (model.collision.indices.length === 0) stats.empty++;
      stats.triangles += model.collision.indices.length / 3;
      stats.bytes += checkMesh(model.collision);
    });

    console.log(
      `${count} .o3d files: ${stats.models} converted, ${stats.refused} refused; ${stats.withCollision} collision ` +
        `meshes (${stats.empty} without faces), ${stats.triangles} triangles, ${stats.bytes} bytes of collision files`,
    );
    expect(failures.map((f) => `${f.path}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)).toEqual(
      [],
    );
    expect(count).toBe(stats.models + stats.refused);
    expect(stats.models).toBe(4192);
    expect(stats.withCollision).toBe(1144);
  });
});
