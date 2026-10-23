// The worlds stage on a small hand-made client. The real worlds (all of WdMadrigal, and the worlds with cases of their
// own) are corpus tests: world.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { objectLocalMatrix, readLnd, toWebMatrix, webName } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { DEFAULT_STAGES } from '../src/run';
import type { StageContext } from '../src/run';
import { NO_MODEL, convertWorld, worldsStage } from '../src/world/convertWorld';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';
import { lndBytes } from './helpers/lndBytes';
import type { TestLnd } from './helpers/lndBytes';
import { bytesOf, manifestOf, tileOf } from './helpers/worldRun';
import type { ReportJson, Run } from './helpers/worldRun';

/** Runs the worlds stage over `root` into `out`. `seed` can write assets first, as the earlier stages would. */
async function runWorlds(
  root: string,
  out: string,
  opts: { only?: string; jobs?: number; seed?: (writer: AssetWriter) => Promise<void> } = {},
): Promise<Run> {
  const writer = new AssetWriter(out);
  const report = new Report();
  await opts.seed?.(writer);
  const ctx: StageContext = {
    client: await ClientFs.open(root),
    writer,
    report,
    only: opts.only,
    jobs: opts.jobs ?? 2,
    outDir: out,
  };
  await worldsStage.run(ctx);
  await report.write(out);
  return { writer, report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson, out };
}

const text = (s: string): number[] => Array.from(Buffer.from(s, 'latin1'));

// ---- a small hand-made client -------------------------------------------------------------------------------------

const TERRAIN_INC = `
"Ground" 0 {
  0 0 "default.dds" 0 ""
  1 0 "grass.dds" 0 ""
  2 0 "Sand.dds" 0 ""
  3 0 "Rock Face.dds" 0 ""
}
`;

// "name" id modelType part fly distant pick scale trans shadow textureEx renderFlag
const entry = (name: string, id: number, modelType = 1, trans = 0, pick = 0): string =>
  `  "${name}" ${id} ${modelType} "" 0 0 ${pick} 1.0 ${trans} 0 0 0`;

const MDL_OBJ_INC = `
"obj" 0 {
${entry('Tree01', 1)}
${entry('Rock 02', 2)}
${entry('Unconverted', 3)}
${entry('NoFile', 4)}
${entry('Fx', 5, 4)}
${entry('Glass', 6, 1, 1)}
${entry('Bridge', 7, 1, 0, 1)}
}
`;

const MDL_DYNA_INC = `
"mvr" 5 {
${entry('Guard', 1, 2)}
}
`;

const PACKED = [
  { name: 'Terrain.inc', data: text(TERRAIN_INC) },
  { name: 'mdlObj.inc', data: text(MDL_OBJ_INC) },
  { name: 'mdlDyna.inc', data: text(MDL_DYNA_INC) },
];

/** `size` is the world's tile grid. */
const wld = (size: [number, number], mpu = 4): string =>
  [
    '// World script',
    `size ${size[0]}, ${size[1]}`,
    'indoor 0',
    'ambient 0x808080',
    'bgColor 0xffe0e0ff',
    'camera 5063.999 240.888 4095.910  0.393  0.191',
    'fogSetting 70.000 400.000  0.250',
    `MPU ${mpu}`,
  ].join('\r\n');

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** A model the stage can link: written to the output as the models stage would have. */
const seedModel = (key: string) => async (writer: AssetWriter) => {
  await writer.write(key, bytesOf(1), 'seed');
};

describe('worlds stage', () => {
  it('runs after the textures and models stages, and before the game-data stage', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(['textures', 'models', 'worlds', 'data']);
  });
});

describe('worlds stage on a small hand-made client', () => {
  let root: string;
  let out: string;

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-world-client-');
    out = await makeTempDir('flyffweb-world-out-');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  const client = (loose: Record<string, string | Uint8Array>) => writeFakeClient(root, { packed: PACKED, loose });

  it('converts every folder of World that has a .wld; --only filters by folder name', async () => {
    await client({
      'World/WdTest/WdTest.wld': wld([1, 1]),
      'World/WdTest/WdTest00-00.lnd': lndBytes(),
      'World/WdOther/WdOther.wld': wld([1, 1]),
      'World/WdOther/WdOther00-00.lnd': lndBytes(),
      'World/WdLux/WdLux00-00.lnd': lndBytes(), // tiles but no .wld
      'World/TextureMid/grass.dds': 'not a world',
    });

    const all = await runWorlds(root, out);
    expect(all.report.failures).toEqual([]);
    expect(all.writer.pathOf('worlds/wdtest/manifest.json')).toMatch(/^worlds\/wdtest\/manifest\.[0-9a-f]{10}\.json$/);
    expect(all.writer.pathOf('worlds/wdother/manifest.json')).toBeDefined();
    expect(all.writer.pathOf('worlds/wdlux/manifest.json')).toBeUndefined();
    expect(all.writer.pathOf('worlds/texturemid/manifest.json')).toBeUndefined();
    expect(all.report.kinds.worlds).toMatchObject({ ok: 4, failed: 0 }); // two tiles and two manifests

    const filteredOut = await makeTempDir('flyffweb-world-out2-');
    try {
      const some = await runWorlds(root, filteredOut, { only: 'wdt*' });
      expect(some.writer.pathOf('worlds/wdtest/manifest.json')).toBeDefined();
      expect(some.writer.pathOf('worlds/wdother/manifest.json')).toBeUndefined();
    } finally {
      await fs.rm(filteredOut, { recursive: true, force: true });
    }
  });

  it('does nothing when the client has no World folder', async () => {
    await client({});
    const run = await runWorlds(root, out);
    expect(run.report.failures).toEqual([]);
    expect(run.report.warnings).toEqual([]);
    expect(run.report.kinds.worlds).toBeUndefined();
  });

  it('writes the manifest: header fields, camera in web space, tiles in row order', async () => {
    await client({
      'World/WdTest/WdTest.wld': wld([3, 4]),
      'World/WdTest/WdTest02-03.lnd': lndBytes(),
      'World/WdTest/WdTest01-00.lnd': lndBytes(),
      'World/WdTest/WdTest00-03.lnd': lndBytes(),
    });
    const run = await runWorlds(root, out);
    const manifest = await manifestOf(run, 'wdtest');

    expect(manifest).toMatchObject({
      name: 'WdTest',
      size: [3, 4],
      mpu: 4,
      mapSize: 128,
      ambient: 0x808080,
      bgColor: 0xffe0e0ff,
      fog: { start: 70, end: 400, density: 0.25 },
      terrainTextures: [],
      models: [],
      modelTrans: [],
      modelPick: [],
    });
    expect(manifest.camera.position[0]).toBeCloseTo(5063.999, 3);
    expect(manifest.camera.position[1]).toBeCloseTo(240.888, 3);
    expect(manifest.camera.position[2]).toBeCloseTo(-4095.91, 3);
    expect(manifest.camera.angle).toBeCloseTo(0.393, 3);
    expect(manifest.camera.angleX).toBeCloseTo(0.191, 3);
    // by row, then column; every value is the tile's hashed path
    expect(Object.keys(manifest.tiles)).toEqual(['1_0', '0_3', '2_3']);
    expect(manifest.tiles['2_3']).toMatch(/^worlds\/wdtest\/tiles\/2_3\.[0-9a-f]{10}\.bin$/);
  });

  it('takes a tile\'s coordinates from its file name, not from the header inside (R14)', async () => {
    await client({
      'World/WdTest/WdTest.wld': wld([3, 4]),
      'World/WdTest/WdTest02-03.lnd': lndBytes({ headerX: 7, headerY: 9 }),
    });
    const run = await runWorlds(root, out);
    const manifest = await manifestOf(run, 'wdtest');
    expect(Object.keys(manifest.tiles)).toEqual(['2_3']);
    const tile = await tileOf(run, manifest, '2_3');
    expect([tile.x, tile.y]).toEqual([2, 3]);
  });

  it('matches tile names to the .wld name without regard to case, and a tile of a world with a long name', async () => {
    await client({
      'World/WdHeaven06_1/WdHeaven06_1.wld': wld([2, 2]),
      'World/WdHeaven06_1/wdheaven06_100-01.lnd': lndBytes(),
    });
    const run = await runWorlds(root, out);
    expect(run.report.warnings).toEqual([]);
    expect(Object.keys((await manifestOf(run, 'wdheaven06_1')).tiles)).toEqual(['0_1']);
  });

  it('stores heights, water, land attributes and light maps as the file has them', async () => {
    await client({
      'World/WdTest/WdTest.wld': wld([1, 1]),
      'World/WdTest/WdTest00-00.lnd': lndBytes({
        height: (i) => (i === 3 ? 1012.5 : i * 0.5), // a HGT_NOWALK flag stays added
        layers: [{ tex: 1, light: 0x80112233 }],
      }),
    });
    const run = await runWorlds(root, out);
    const tile = await tileOf(run, await manifestOf(run, 'wdtest'), '0_0');

    expect(tile.heights).toHaveLength(129 * 129);
    expect(tile.heights[2]).toBe(1);
    expect(tile.heights[3]).toBe(1012.5);
    expect(tile.heights[129 * 129 - 1]).toBe((129 * 129 - 1) * 0.5);
    expect(Array.from(tile.water)).toEqual(Array.from({ length: 512 }, (_, i) => i & 0xff));
    expect(Array.from(tile.landAttr)).toEqual(Array.from({ length: 256 }, (_, i) => (40 + i) & 0xff));
    expect(tile.layers).toHaveLength(1);
    expect(Array.from(tile.layers[0]!.patchEnable)).toEqual(Array.from({ length: 256 }, (_, i) => i % 2));
    expect(tile.layers[0]!.light).toHaveLength(128 * 128 * 4);
    expect(Array.from(tile.layers[0]!.light.subarray(0, 8))).toEqual([0x11, 0x22, 0x33, 0x80, 0x11, 0x22, 0x33, 0x80]);
  });

  describe('object placement', () => {
    const translationOf = (m: Float32Array): number[] => Array.from(m.subarray(12, 15));

    it('adds the tile origin, 128 * the world MPU per tile, to the position (R15)', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([3, 4]),
        'World/WdTest/WdTest02-03.lnd': lndBytes({ objects: [{ pos: [10, 5, 20] }] }),
        'World/WdBig/WdBig.wld': wld([2, 2], 8),
        'World/WdBig/WdBig01-01.lnd': lndBytes({ objects: [{ pos: [10, 5, 20] }] }),
      });
      const run = await runWorlds(root, out);

      // file x and z are times 4 (OLD_MPU); then + tile * 128 * MPU; web space negates z
      const test = await tileOf(run, await manifestOf(run, 'wdtest'), '2_3');
      expect(test.objects).toHaveLength(1);
      expect(Array.from(test.objects[0]!.matrix.subarray(0, 12))).toEqual(IDENTITY);
      expect(translationOf(test.objects[0]!.matrix)).toEqual([40 + 2 * 512, 5, -(80 + 3 * 512)]);

      const big = await tileOf(run, await manifestOf(run, 'wdbig'), '1_1');
      expect(translationOf(big.objects[0]!.matrix)).toEqual([40 + 1024, 5, -(80 + 1024)]);
    });

    it('adds no origin to a version 0 tile, which holds no coordinates (lod.cpp:1356 tests the version)', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([3, 4]),
        'World/WdTest/WdTest02-03.lnd': lndBytes({ version: 0, objects: [{ pos: [10, 5, 20] }] }),
      });
      const run = await runWorlds(root, out);
      const tile = await tileOf(run, await manifestOf(run, 'wdtest'), '2_3');
      expect(translationOf(tile.objects[0]!.matrix)).toEqual([40, 5, -80]);
    });

    it('builds the matrix with objectLocalMatrix and toWebMatrix', async () => {
      const spec: TestLnd = { objects: [{ pos: [3, 1, 7], scale: [2, 3, 4], angle: 90 }] };
      await client({
        'World/WdTest/WdTest.wld': wld([3, 4]),
        'World/WdTest/WdTest01-02.lnd': lndBytes(spec),
      });
      const run = await runWorlds(root, out);
      const tile = await tileOf(run, await manifestOf(run, 'wdtest'), '1_2');

      const rec = readLnd(lndBytes(spec), 'expected.lnd').objects[0]!;
      rec.position = [rec.position[0] + 1 * 512, rec.position[1], rec.position[2] + 2 * 512];
      expect(Array.from(tile.objects[0]!.matrix)).toEqual(Array.from(toWebMatrix(objectLocalMatrix(rec))));
    });

    it('skips objects with scale (0, 0, 0) and SFX objects, and counts them in one warning per world', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({
          objects: [{ pos: [1, 0, 1] }, { scale: [0, 0, 0] }, { scale: [0, 0, 0] }],
          sfx: [{}, {}],
        }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ objects: [{ scale: [0, 0, 0] }], sfx: [{}] }),
      });
      const run = await runWorlds(root, out);
      const manifest = await manifestOf(run, 'wdtest');
      expect((await tileOf(run, manifest, '0_0')).objects).toHaveLength(1);
      expect((await tileOf(run, manifest, '1_0')).objects).toHaveLength(0);

      expect(run.report.failures).toEqual([]);
      const skipped = run.report.warnings.filter((w) => /skipped/.test(w.message));
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.kind).toBe('worlds');
      expect(skipped[0]!.source).toMatch(/WdTest\.wld$/);
      expect(skipped[0]!.message).toMatch(/3 SFX objects/);
      expect(skipped[0]!.message).toMatch(/3 objects with scale \(0, 0, 0\)/);
    });

    it('does not warn about skipped objects when there are none', async () => {
      await client({ 'World/WdTest/WdTest.wld': wld([1, 1]), 'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: [{}] }) });
      const run = await runWorlds(root, out);
      expect(run.report.warnings.filter((w) => /skipped/.test(w.message))).toEqual([]);
    });
  });

  describe('models', () => {
    const objects = (...ids: number[]) => ids.map((index) => ({ index }));

    it('links an object to its model through the model index, and lists each model once, in order of first use', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: objects(2, 1, 2) }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ objects: objects(1, 2) }),
        'Model/Obj_Tree01.o3d': 'x',
        'Model/obj_rock 02.O3D': 'x', // the client's names mix case; the key follows the real file name
      });
      const run = await runWorlds(root, out, {
        seed: async (writer) => {
          await seedModel('models/obj_tree01.glb')(writer);
          await seedModel('models/obj_rock-02.glb')(writer);
        },
      });
      const manifest = await manifestOf(run, 'wdtest');
      expect(run.report.failures).toEqual([]);
      expect(manifest.models).toEqual(['models/obj_rock-02.glb', 'models/obj_tree01.glb']);
      expect((await tileOf(run, manifest, '0_0')).objects.map((o) => o.model)).toEqual([0, 1, 0]);
      expect((await tileOf(run, manifest, '1_0')).objects.map((o) => o.model)).toEqual([1, 0]);
      expect(run.report.warnings).toEqual([]);
    });

    it("writes each model's bTrans (mdlObj.inc, ModelMng.cpp:398) as modelTrans, parallel to models", async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([1, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: objects(6, 1, 6) }),
        'Model/Obj_Tree01.o3d': 'x',
        'Model/Obj_Glass.o3d': 'x',
      });
      const run = await runWorlds(root, out, {
        seed: async (writer) => {
          await seedModel('models/obj_tree01.glb')(writer);
          await seedModel('models/obj_glass.glb')(writer);
        },
      });
      const manifest = await manifestOf(run, 'wdtest');
      expect(run.report.failures).toEqual([]);
      expect(manifest.models).toEqual(['models/obj_glass.glb', 'models/obj_tree01.glb']);
      expect(manifest.modelTrans).toEqual([true, false]);
    });

    it("writes each model's bPick (mdlObj.inc, ModelMng.cpp:396) as modelPick, parallel to models", async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([1, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: objects(7, 1, 7) }),
        'Model/Obj_Tree01.o3d': 'x',
        'Model/Obj_Bridge.o3d': 'x',
      });
      const run = await runWorlds(root, out, {
        seed: async (writer) => {
          await seedModel('models/obj_tree01.glb')(writer);
          await seedModel('models/obj_bridge.glb')(writer);
        },
      });
      const manifest = await manifestOf(run, 'wdtest');
      expect(run.report.failures).toEqual([]);
      expect(manifest.models).toEqual(['models/obj_bridge.glb', 'models/obj_tree01.glb']);
      // the bridge's entry picks, the tree's does not; neither is see-through
      expect(manifest.modelPick).toEqual([true, false]);
      expect(manifest.modelTrans).toEqual([false, false]);
    });

    it('gives 0xffff and one warning per distinct unresolved name, not per object', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: objects(3, 3, 4, 5, 9, 1) }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ objects: objects(3, 4, 5, 9, 9) }),
        'Model/Obj_Tree01.o3d': 'x',
        'Model/Obj_Unconverted.o3d': 'x', // in the client but not converted in this run
      });
      const run = await runWorlds(root, out, { seed: seedModel('models/obj_tree01.glb') });
      const manifest = await manifestOf(run, 'wdtest');

      expect(manifest.models).toEqual(['models/obj_tree01.glb']);
      expect(NO_MODEL).toBe(0xffff);
      expect((await tileOf(run, manifest, '0_0')).objects.map((o) => o.model)).toEqual([
        NO_MODEL, NO_MODEL, NO_MODEL, NO_MODEL, NO_MODEL, 0,
      ]);
      expect((await tileOf(run, manifest, '1_0')).objects.map((o) => o.model)).toEqual([NO_MODEL, NO_MODEL, NO_MODEL, NO_MODEL, NO_MODEL]);

      const messages = run.report.warnings.map((w) => w.message).sort();
      expect(run.report.warnings.every((w) => w.kind === 'worlds')).toBe(true);
      expect(messages).toHaveLength(4);
      expect(messages.filter((m) => /Obj_Unconverted\.o3d.*not converted/.test(m))).toHaveLength(1);
      expect(messages.filter((m) => /obj_nofile\.o3d.*not in Client\/Model/i.test(m))).toHaveLength(1);
      expect(messages.filter((m) => /obj_fx.*SFX or billboard model/i.test(m))).toHaveLength(1); // an sfx model has no .o3d
      expect(messages.filter((m) => /no entry for object type 0 id 9/.test(m))).toHaveLength(1);
    });

    it('resolves other object types through the same index (type = objType)', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([1, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: [{ objType: 5, index: 1 }] }),
        'Model/Mvr_Guard.o3d': 'x',
      });
      const run = await runWorlds(root, out, { seed: seedModel('models/mvr_guard.glb') });
      const manifest = await manifestOf(run, 'wdtest');
      expect(run.report.failures).toEqual([]);
      expect(manifest.models).toEqual(['models/mvr_guard.glb']);
      expect((await tileOf(run, manifest, '0_0')).objects.map((o) => o.model)).toEqual([0]);
    });

    it('links models that an earlier run converted, through its index.json (R32)', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([1, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: objects(1) }),
        'Model/Obj_Tree01.o3d': 'x',
      });
      const earlier = new AssetWriter(out);
      await earlier.write('models/obj_tree01.glb', bytesOf(1, 2, 3), 'Obj_Tree01.o3d');
      await earlier.finish();

      const run = await runWorlds(root, out); // a new writer: only the worlds stage runs
      const manifest = await manifestOf(run, 'wdtest');
      expect(manifest.models).toEqual(['models/obj_tree01.glb']);
      expect(run.report.warnings).toEqual([]);
      await run.writer.finish();
      const index = JSON.parse(await fs.readFile(path.join(out, 'index.json'), 'utf8')) as { files: Record<string, string> };
      expect(Object.keys(index.files)).toEqual([
        'models/obj_tree01.glb',
        'worlds/wdtest/manifest.json',
        'worlds/wdtest/tiles/0_0.bin',
      ]);
    });
  });

  describe('terrain textures', () => {
    const layers = (...tex: number[]) => tex.map((t) => ({ tex: t }));
    const seedTexture = (file: string) => seedModel(`textures/terrain/${webName(file)}.ktx2`);

    it('lists the textures the layers use once, in order of first use; a layer indexes that list', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 2]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ layers: layers(1, 0) }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ layers: layers(2, 1, 0) }),
        'World/WdTest/WdTest00-01.lnd': lndBytes({ layers: layers(2) }),
      });
      const run = await runWorlds(root, out, {
        seed: async (writer) => {
          await seedTexture('grass.dds')(writer);
          await seedTexture('default.dds')(writer);
          await seedTexture('Sand.dds')(writer);
        },
      });
      const manifest = await manifestOf(run, 'wdtest');

      expect(manifest.terrainTextures).toEqual([
        'textures/terrain/grass.dds.ktx2',
        'textures/terrain/default.dds.ktx2',
        'textures/terrain/sand.dds.ktx2',
      ]);
      expect((await tileOf(run, manifest, '0_0')).layers.map((l) => l.texture)).toEqual([0, 1]);
      expect((await tileOf(run, manifest, '1_0')).layers.map((l) => l.texture)).toEqual([2, 0, 1]);
      expect((await tileOf(run, manifest, '0_1')).layers.map((l) => l.texture)).toEqual([2]);
      expect(run.report.warnings).toEqual([]);
    });

    it('still lists a texture that was not converted, with one warning for it however many layers use it', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ layers: layers(3, 1) }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ layers: layers(3, 3) }),
      });
      const run = await runWorlds(root, out, { seed: seedTexture('grass.dds') });
      const manifest = await manifestOf(run, 'wdtest');

      expect(manifest.terrainTextures).toEqual(['textures/terrain/rock-face.dds.ktx2', 'textures/terrain/grass.dds.ktx2']);
      expect(run.report.failures).toEqual([]);
      expect(run.report.warnings).toHaveLength(1);
      expect(run.report.warnings[0]!.kind).toBe('worlds');
      expect(run.report.warnings[0]!.message).toMatch(/Rock Face\.dds.*id 3.*not converted/);
    });

    it('drops a layer whose texture id Terrain.inc does not define, as LoadLandscape does, with one warning', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ layers: layers(1, 99, 0) }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ layers: layers(99) }),
      });
      const run = await runWorlds(root, out, {
        seed: async (writer) => {
          await seedTexture('grass.dds')(writer);
          await seedTexture('default.dds')(writer);
        },
      });
      const manifest = await manifestOf(run, 'wdtest');
      expect(manifest.terrainTextures).toEqual(['textures/terrain/grass.dds.ktx2', 'textures/terrain/default.dds.ktx2']);
      expect((await tileOf(run, manifest, '0_0')).layers.map((l) => l.texture)).toEqual([0, 1]);
      expect((await tileOf(run, manifest, '1_0')).layers).toEqual([]);
      expect(run.report.warnings).toHaveLength(1);
      expect(run.report.warnings[0]!.message).toMatch(/texture id 99.*Terrain\.inc/);
    });
  });

  describe('bad input', () => {
    it('reports a tile with a non-finite height as a failure of its .lnd, skips only that tile, and goes on', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([3, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes(),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ height: (i) => (i === 100 ? Number.NaN : 0) }),
        'World/WdTest/WdTest02-00.lnd': lndBytes(),
      });
      const run = await runWorlds(root, out);
      const manifest = await manifestOf(run, 'wdtest');

      expect(Object.keys(manifest.tiles)).toEqual(['0_0', '2_0']);
      expect(run.writer.pathOf('worlds/wdtest/tiles/1_0.bin')).toBeUndefined();
      expect(run.report.failures).toHaveLength(1);
      expect(run.report.failures[0]!.kind).toBe('worlds');
      expect(run.report.failures[0]!.source).toMatch(/WdTest01-00\.lnd$/);
      expect(run.report.failures[0]!.message).toMatch(/height 100.*not finite/);
      expect(run.report.kinds.worlds).toMatchObject({ ok: 3, failed: 1 }); // two tiles and the manifest
    });

    it('reports a tile with a non-finite object matrix as a failure', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes({ objects: [{ pos: [Number.POSITIVE_INFINITY, 0, 0] }] }),
        'World/WdTest/WdTest01-00.lnd': lndBytes({ objects: [{ pos: [1, 0, 0] }] }),
      });
      const run = await runWorlds(root, out);
      expect(Object.keys((await manifestOf(run, 'wdtest')).tiles)).toEqual(['1_0']);
      expect(run.report.failures).toHaveLength(1);
      expect(run.report.failures[0]!.source).toMatch(/WdTest00-00\.lnd$/);
      expect(run.report.failures[0]!.message).toMatch(/object 0.*matrix.*not finite/);
    });

    it('reports an encoder RangeError as a failure of the .lnd it came from', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes(),
        'World/WdTest/WdTest70000-00.lnd': lndBytes(), // a column that does not fit the tile file's u16
      });
      const run = await runWorlds(root, out);
      expect(Object.keys((await manifestOf(run, 'wdtest')).tiles)).toEqual(['0_0']);
      expect(run.report.failures).toHaveLength(1);
      expect(run.report.failures[0]!.source).toMatch(/WdTest70000-00\.lnd$/);
      expect(run.report.failures[0]!.message).toMatch(/u16/);
    });

    it('reports an unreadable .lnd as a failure of that file', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes(),
        'World/WdTest/WdTest01-00.lnd': lndBytes().subarray(0, 1000),
      });
      const run = await runWorlds(root, out);
      expect(Object.keys((await manifestOf(run, 'wdtest')).tiles)).toEqual(['0_0']);
      expect(run.report.failures).toHaveLength(1);
      expect(run.report.failures[0]!.source).toMatch(/WdTest01-00\.lnd$/);
    });

    it('warns about, and skips, a .lnd whose name does not fit the world', async () => {
      await client({
        'World/WdTest/WdTest.wld': wld([2, 1]),
        'World/WdTest/WdTest00-00.lnd': lndBytes(),
        'World/WdTest/WdTest-backup.lnd': lndBytes(),
        'World/WdTest/WdOther00-00.lnd': lndBytes(),
      });
      const run = await runWorlds(root, out);
      expect(run.report.failures).toEqual([]);
      expect(Object.keys((await manifestOf(run, 'wdtest')).tiles)).toEqual(['0_0']);
      expect(run.report.warnings.map((w) => path.basename(w.source)).sort()).toEqual(['WdOther00-00.lnd', 'WdTest-backup.lnd']);
      expect(run.report.warnings[0]!.message).toMatch(/WdTest<column>-<row>\.lnd/);
    });

    it('reports a world whose .wld cannot be read as one failure, writes no manifest, and converts the next world', async () => {
      await client({
        'World/WdBad/WdBad.wld': 'size 3,',
        'World/WdBad/WdBad00-00.lnd': lndBytes(),
        'World/WdGood/WdGood.wld': wld([1, 1]),
        'World/WdGood/WdGood00-00.lnd': lndBytes(),
      });
      const run = await runWorlds(root, out);
      expect(run.report.failures).toHaveLength(1);
      expect(run.report.failures[0]!.kind).toBe('worlds');
      expect(run.report.failures[0]!.source).toMatch(/WdBad\.wld$/);
      expect(run.writer.pathOf('worlds/wdbad/manifest.json')).toBeUndefined();
      expect(run.writer.pathOf('worlds/wdgood/manifest.json')).toBeDefined();
    });
  });

  it('writes the same files whatever the number of jobs', async () => {
    const loose: Record<string, string | Uint8Array> = { 'World/WdTest/WdTest.wld': wld([4, 3]), 'Model/Obj_Tree01.o3d': 'x', 'Model/Obj_Rock 02.o3d': 'x' };
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        const n = (x * 5 + y * 3) % 7;
        loose[`World/WdTest/WdTest${String(x).padStart(2, '0')}-${String(y).padStart(2, '0')}.lnd`] = lndBytes({
          layers: [{ tex: (n % 4) as number }, { tex: ((n + 1) % 4) as number }].slice(0, 1 + (n % 2)),
          objects: Array.from({ length: n * 40 }, (_, i) => ({ index: ((i + n) % 2) + 1, pos: [i, 0, 1] as [number, number, number] })),
        });
      }
    }
    await client(loose);
    const seed = async (writer: AssetWriter): Promise<void> => {
      await seedModel('models/obj_tree01.glb')(writer);
      await seedModel('models/obj_rock-02.glb')(writer);
    };

    const one = await runWorlds(root, out, { jobs: 1, seed });
    const otherOut = await makeTempDir('flyffweb-world-out2-');
    try {
      const many = await runWorlds(root, otherOut, { jobs: 6, seed });
      const a = await manifestOf(one, 'wdtest');
      const b = await manifestOf(many, 'wdtest');
      expect(b).toEqual(a);
      expect(many.writer.pathOf('worlds/wdtest/manifest.json')).toBe(one.writer.pathOf('worlds/wdtest/manifest.json'));
      expect(Object.keys(a.tiles)).toHaveLength(12);
      expect(a.models.length).toBe(2);
    } finally {
      await fs.rm(otherOut, { recursive: true, force: true });
    }
  });
});

describe('convertWorld', () => {
  it('is exported with the (worldDir, ctx) signature the stage uses', () => {
    expect(convertWorld).toBeTypeOf('function');
  });
});
