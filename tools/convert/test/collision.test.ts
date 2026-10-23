// The collision files of the models stage on hand-made models: the triangles taken from the collision mesh, and the
// stage's rules for when a file is written. The collision meshes of the real models are swept in
// collision.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collisionKey, decodeCollisionBin, readO3d } from '@flyffweb/formats';
import { Bytes } from '../../../packages/formats/test/helpers/bytes';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { collisionTriangles } from '../src/models/collisionFiles';
import { modelsStage } from '../src/models/modelsStage';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

// ---- a model laid out the way CObject3D::LoadObject reads it: only what the collision tests need ---------------

/** A mesh: 3 floats per vertex, 3 indices per triangle. */
interface Mesh {
  positions: number[];
  indices: number[];
}

/** A GMOBJECT body as CObject3D::LoadGMObject reads it, for a normal object with no material and one block. */
function gmBody(b: Bytes, mesh: Mesh): void {
  const vertices = mesh.positions.length / 3;
  b.f32(0).f32(0).f32(0).f32(1).f32(1).f32(1); // bbMin, bbMax
  b.i32(0).i32(0).i32(0).zeros(28); // opacity, bump, rigid; reserved
  b.i32(vertices).i32(vertices).i32(mesh.indices.length / 3).i32(mesh.indices.length);
  // The vertex list differs from the vertex buffer on purpose: the collision functions read the buffer.
  for (const p of mesh.positions) b.f32(p + 1000);
  for (let v = 0; v < vertices; v++) {
    b.f32(mesh.positions[v * 3]!).f32(mesh.positions[v * 3 + 1]!).f32(mesh.positions[v * 3 + 2]!);
    b.f32(0).f32(1).f32(0).f32(0).f32(0); // normal, uv
  }
  for (const i of mesh.indices) b.u16(i);
  for (let v = 0; v < vertices; v++) b.u16(v);
  b.i32(0).i32(0); // no physique, no material
  b.i32(1).i32(0).i32(mesh.indices.length / 3).i32(0).u32(0).i32(255).i32(0); // one block over every triangle
  for (let k = 0; k < 28; k++) b.i32(0);
}

const TRIANGLE: Mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };

/** A version 22 model with one normal object, and `collision` as its collision mesh when given. */
function o3dBytes(name: string, collision: Mesh | null): Uint8Array {
  const b = new Bytes().u8(name.length);
  for (let i = 0; i < name.length; i++) b.u8(name.charCodeAt(i) ^ 0xcd);
  b.i32(22).i32(1); // version, id
  b.zeros(4 * 12).zeros(4 * 2 + 16); // force points, scroll speeds, reserved
  b.zeros(4 * 6).f32(0.5).i32(0); // bounding box, perSlerp, frame count
  b.i32(0); // no events
  if (collision === null) {
    b.i32(0);
  } else {
    b.i32(1);
    gmBody(b, collision);
  }
  b.i32(0).i32(0); // no LOD, no bones
  b.i32(1).i32(1); // pool size, objects in the group
  b.u32(0).i32(0).i32(0).i32(-1); // normal, no used bones, id 0, no parent
  for (let k = 0; k < 16; k++) b.f32(k % 5 === 0 ? 1 : 0); // identity
  gmBody(b, TRIANGLE);
  b.i32(0); // no frame attributes
  return b.build();
}

/** Two triangles that share a side, in the corners of a fence panel; the numbers are exact in f32. */
const PANEL: Mesh = {
  positions: [-1, 0, 2, 3, 0, 2, 3, 2.5, 2, -1, 2.5, 5],
  indices: [0, 1, 2, 0, 2, 3],
};

/** PANEL's triangles as the file holds them: each face's corners in index order, as stored (D3D, z not negated). */
const PANEL_TRIANGLES = [
  ...[-1, 0, 2, 3, 0, 2, 3, 2.5, 2], // vertices 0, 1, 2
  ...[-1, 0, 2, 3, 2.5, 2, -1, 2.5, 5], // vertices 0, 2, 3
];

describe('collisionTriangles (CObject3D::SlideVectorXZ, Object3D.cpp:1590)', () => {
  const meshOf = (mesh: Mesh) => readO3d(o3dBytes('Test.o3d', mesh), 'Test.o3d').collision!;

  it('lists the corners of each face in index order, from the vertex buffer, with no change of space', () => {
    expect(Array.from(collisionTriangles(meshOf(PANEL)))).toEqual(PANEL_TRIANGLES);
  });

  it('gives 9 floats for each 3 indices, and none for a mesh without faces', () => {
    const triangles = collisionTriangles(meshOf({ positions: PANEL.positions, indices: [3, 2, 1, 0, 1, 2, 2, 2, 2] }));
    expect(triangles.length).toBe(27);
    expect(Array.from(triangles.subarray(0, 9))).toEqual([-1, 2.5, 5, 3, 2.5, 2, 3, 0, 2]);
    expect(collisionTriangles(meshOf({ positions: [], indices: [] })).length).toBe(0);
  });
});

describe('collision files of the models stage', () => {
  let root: string;
  let out: string;

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-collision-client-');
    out = await makeTempDir('flyffweb-collision-out-');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  /** Runs the models stage on a client with these files in Client/Model (the stored name defaults to the file's). */
  async function runStage(models: Record<string, { collision: Mesh | null; storedName?: string }>) {
    const loose: Record<string, Uint8Array> = {};
    for (const [file, { collision, storedName }] of Object.entries(models)) {
      loose[`Model/${file}`] = o3dBytes(storedName ?? file, collision);
    }
    await writeFakeClient(root, { loose });
    const writer = new AssetWriter(out);
    const report = new Report();
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report, jobs: 2, outDir: out };
    await modelsStage.run(ctx);
    await report.write(out);
    const json = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as {
      kinds: Record<string, { ok: number; warn: number; failed: number; bytesOut: number }>;
      failures: unknown[];
    };
    return { writer, report: json };
  }

  const readBin = async (writer: AssetWriter, key: string): Promise<Float32Array> =>
    decodeCollisionBin(new Uint8Array(await fs.readFile(path.join(out, writer.pathOf(key)!))));

  it('a model with a collision mesh writes collision/<stem>.bin with its triangles', async () => {
    const { writer, report } = await runStage({ 'Obj_ Fence01.o3d': { collision: PANEL } });
    expect(report.failures).toEqual([]);

    // the stem is the one of the glb: webName of the file's base name (the space becomes a dash)
    expect(writer.pathOf('models/obj_-fence01.glb')).toMatch(/^models\/obj_-fence01\.[0-9a-f]{10}\.glb$/);
    expect(collisionKey('obj_-fence01')).toBe('collision/obj_-fence01.bin');
    expect(writer.pathOf('collision/obj_-fence01.bin')).toMatch(/^collision\/obj_-fence01\.[0-9a-f]{10}\.bin$/);
    expect(Array.from(await readBin(writer, 'collision/obj_-fence01.bin'))).toEqual(PANEL_TRIANGLES);

    expect(report.kinds.models!.ok).toBe(1);
    expect(report.kinds.collision).toMatchObject({ ok: 1, warn: 0, failed: 0, bytesOut: 4 + 2 * 9 * 4 });
  });

  it('a model without one writes nothing', async () => {
    const { writer, report } = await runStage({ 'Obj_Plain01.o3d': { collision: null } });
    expect(report.failures).toEqual([]);
    expect(writer.pathOf('models/obj_plain01.glb')).toBeDefined();
    expect(writer.pathOf('collision/obj_plain01.bin')).toBeUndefined();
    expect(report.kinds.collision).toBeUndefined();
    expect(await fs.readdir(out)).not.toContain('collision');
  });

  it('writes each model its own file', async () => {
    const { writer } = await runStage({
      'Obj_A.o3d': { collision: TRIANGLE },
      'Obj_B.o3d': { collision: PANEL },
      'Obj_C.o3d': { collision: null },
    });
    expect((await readBin(writer, 'collision/obj_a.bin')).length).toBe(9);
    expect((await readBin(writer, 'collision/obj_b.bin')).length).toBe(18);
    expect(writer.pathOf('collision/obj_c.bin')).toBeUndefined();
  });

  it('a collision mesh with no faces still writes its file (Neuz counts the model as having one)', async () => {
    const { writer } = await runStage({ 'Obj_Empty.o3d': { collision: { positions: [], indices: [] } } });
    expect(Array.from(await readBin(writer, 'collision/obj_empty.bin'))).toEqual([]);
  });

  it('a model Neuz refuses (its stored name is not its own) writes no collision file either', async () => {
    const { writer, report } = await runStage({ 'Obj_Fence01.o3d': { collision: PANEL, storedName: 'Obj_Other.o3d' } });
    expect(writer.pathOf('models/obj_fence01.glb')).toBeUndefined();
    expect(writer.pathOf('collision/obj_fence01.bin')).toBeUndefined();
    expect(report.kinds.collision).toBeUndefined();
  });
});
