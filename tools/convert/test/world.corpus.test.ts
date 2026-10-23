// The worlds stage on real client worlds: all 900 tiles of WdMadrigal (about 215 MB written to a temp folder), and
// DuDreadfulCave and WdEvent01 for the cases only they have. Corpus tests (`npm run test:corpus`), not unit tests:
// they need the client folder and take long enough to time out a loaded `npm test`. The stage's rules are unit-tested
// on a small hand-made client in world.test.ts.

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  decodeScript,
  loadDefines,
  modelFileName,
  objectLocalMatrix,
  readLnd,
  readModelIndex,
  readTerrainIndex,
  toWebMatrix,
  webName,
} from '@flyffweb/formats';
import type { WorldManifest } from '@flyffweb/formats';
import { clientRoot, describeClient, loadClientPacks } from '../../../packages/formats/test/helpers/client';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { NO_MODEL, worldsStage } from '../src/world/convertWorld';
import { makeTempDir } from './helpers/fakeClient';
import { bytesOf, manifestOf, tileOf } from './helpers/worldRun';
import type { ReportJson, Run } from './helpers/worldRun';


/** Runs the worlds stage on the real client folder for the worlds `only` matches; the output is a temp folder. */
async function runRealWorlds(
  only: string,
  seed?: (writer: AssetWriter, client: ClientFs) => Promise<void>,
): Promise<Run & { client: ClientFs; seconds: number }> {
  const out = await makeTempDir('flyffweb-world-real-');
  const client = await ClientFs.open(clientRoot()!);
  const writer = new AssetWriter(out);
  const report = new Report();
  await seed?.(writer, client);
  const ctx: StageContext = { client, writer, report, only, jobs: 4, outDir: out };
  const started = Date.now();
  await worldsStage.run(ctx);
  const seconds = (Date.now() - started) / 1000;
  await report.write(out);
  return { writer, report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson, out, client, seconds };
}

const lndOf = (client: ClientFs, world: string, name: string) => {
  const file = client.find(`World/${world}`, name);
  expect(file, `${world}/${name}`).not.toBeNull();
  return { file: file!, tile: readLnd(new Uint8Array(readFileSync(file!)), file!) };
};

describeClient('worlds stage on WdMadrigal', () => {
  let run: Run & { client: ClientFs; seconds: number };
  let manifest: WorldManifest;
  /** A model of tile 9_7 (by Flaris, 358 objects) that Client/Model has, which the test lets the writer know as the models stage would. */
  let seededKey: string;
  let seededIndex: number;
  /** Its mdlObj.inc entry's bTrans. */
  let seededTrans: boolean;

  beforeAll(async () => {
    const packs = loadClientPacks();
    const elems = new Map(readModelIndex(decodeScript(packs.read('mdlObj.inc')), loadDefines(packs), 'mdlObj.inc').map((e) => [e.id, e]));
    run = await runRealWorlds('WdMadrigal', async (writer, client) => {
      const { tile } = lndOf(client, 'WdMadrigal', 'WdMadrigal09-07.lnd');
      for (const rec of tile.objects) {
        const elem = elems.get(rec.index);
        const real = elem === undefined ? null : client.find('Model', modelFileName(elem));
        if (real === null || !/\.o3d$/i.test(real)) continue;
        seededKey = `models/${webName(path.basename(real).replace(/\.o3d$/i, ''))}.glb`;
        seededIndex = rec.index;
        seededTrans = elem!.extra[4] !== 0;
        await writer.write(seededKey, bytesOf(1), 'seed');
        return;
      }
      throw new Error('no object of tile 9_7 has a model file');
    });
    manifest = await manifestOf(run, 'wdmadrigal');
  }, 600_000);

  afterAll(async () => {
    if (run !== undefined) await fs.rm(run.out, { recursive: true, force: true });
  });

  it('converts all 900 tiles without a failure', () => {
    expect(run.report.failures).toEqual([]);
    expect(run.report.kinds.worlds).toMatchObject({ ok: 901, failed: 0 }); // 900 tiles and the manifest
    console.log(
      `WdMadrigal: ${run.seconds.toFixed(1)} s, ${run.report.kinds.worlds!.ok} files, ` +
        `${(run.report.kinds.worlds!.bytesIn / 1e6).toFixed(1)} MB in, ${(run.report.kinds.worlds!.bytesOut / 1e6).toFixed(1)} MB out, ` +
        `${run.report.warnings.length} warnings`,
    );
  });

  it('has the header of WdMadrigal.wld', () => {
    expect(manifest.name).toBe('WdMadrigal');
    expect(manifest.size).toEqual([30, 30]);
    expect(manifest.mpu).toBe(4);
    expect(manifest.mapSize).toBe(128);
    expect(manifest.ambient).toBe(0x808080);
    expect(manifest.fog).toEqual({ start: 70, end: 400, density: 0 });
    expect(Object.keys(manifest.tiles)).toHaveLength(900);
    expect(manifest.camera.position[0]).toBeCloseTo(5063.999, 3);
    expect(manifest.camera.position[1]).toBeCloseTo(240.888, 3);
    expect(manifest.camera.position[2]).toBeCloseTo(-4095.91, 3);
  });

  it('writes tile 1_4 as the file holds it', async () => {
    const { tile: source } = lndOf(run.client, 'WdMadrigal', 'WdMadrigal01-04.lnd');
    const tile = await tileOf(run, manifest, '1_4');

    expect([tile.x, tile.y]).toEqual([1, 4]);
    expect(tile.heights).toEqual(source.heights);
    expect(tile.water).toEqual(source.water);
    expect(tile.landAttr).toEqual(source.landAttr);
    expect(tile.layers).toHaveLength(source.layers.length);
    expect(tile.layers.length).toBeGreaterThan(0);
    tile.layers.forEach((layer, i) => {
      expect(layer.texture).toBeLessThan(manifest.terrainTextures.length);
      expect(layer.patchEnable).toEqual(source.layers[i]!.patchEnable);
      const argb = source.layers[i]!.lightMap[1000]!;
      expect(Array.from(layer.light.subarray(4000, 4004))).toEqual([(argb >>> 16) & 0xff, (argb >>> 8) & 0xff, argb & 0xff, argb >>> 24]);
    });
    expect(tile.objects).toHaveLength(source.objects.length);
  });

  it('puts a layer on the texture Terrain.inc names for its id', async () => {
    const packs = loadClientPacks();
    const { textures } = readTerrainIndex(decodeScript(packs.read('Terrain.inc')), loadDefines(packs));
    const { tile: source } = lndOf(run.client, 'WdMadrigal', 'WdMadrigal01-04.lnd');
    const tile = await tileOf(run, manifest, '1_4');
    tile.layers.forEach((layer, i) => {
      const file = textures.get(source.layers[i]!.textureId)!.file;
      expect(manifest.terrainTextures[layer.texture]).toBe(`textures/terrain/${webName(file)}.ktx2`);
    });
  });

  it('places the objects of tile 9_7 at the tile origin plus their position (R15) and links the model it was given', async () => {
    const { tile: source } = lndOf(run.client, 'WdMadrigal', 'WdMadrigal09-07.lnd');
    const tile = await tileOf(run, manifest, '9_7');
    expect(source.objects.length).toBe(358);
    expect(tile.objects).toHaveLength(source.objects.length); // none of them has scale 0

    source.objects.forEach((rec, i) => {
      const placed = { ...rec, position: [rec.position[0] + 9 * 512, rec.position[1], rec.position[2] + 7 * 512] as [number, number, number] };
      const matrix = tile.objects[i]!.matrix;
      expect(Array.from(matrix), `object ${i}`).toEqual(Array.from(toWebMatrix(objectLocalMatrix(placed))));
      expect(matrix[12]).toBeGreaterThanOrEqual(9 * 512);
      expect(matrix[12]).toBeLessThan(10 * 512);
      expect(-matrix[14]!).toBeGreaterThanOrEqual(7 * 512);
      expect(-matrix[14]!).toBeLessThan(8 * 512);
    });

    const slot = manifest.models.indexOf(seededKey);
    expect(manifest.models).toEqual([seededKey]);
    expect(manifest.modelTrans).toEqual([seededTrans]);
    expect(slot).toBe(0);
    source.objects.forEach((rec, i) => {
      if (rec.index === seededIndex) expect(tile.objects[i]!.model).toBe(slot);
    });
    expect(tile.objects.filter((o) => o.model === slot).length).toBe(source.objects.filter((r) => r.index === seededIndex).length);
    expect(tile.objects.some((o) => o.model === NO_MODEL)).toBe(true); // everything else was not converted in this run
    for (const object of tile.objects) expect(object.model === NO_MODEL || object.model < manifest.models.length).toBe(true);
  });

  it('warns once per distinct unresolved model and missing texture, never per object', () => {
    const messages = run.report.warnings.map((w) => w.message);
    expect(new Set(messages).size).toBe(messages.length);
    expect(run.report.warnings.every((w) => w.kind === 'worlds')).toBe(true);
    expect(messages.filter((m) => /skipped/.test(m))).toHaveLength(1); // the SFX objects: 472 in WdMadrigal
    expect(messages.find((m) => /skipped/.test(m))).toMatch(/472 SFX objects/);
  });
});

describeClient('worlds stage on other real worlds', () => {
  it('counts the objects with scale (0, 0, 0) that DuDreadfulCave holds, and skips them', async () => {
    const run = await runRealWorlds('DuDreadfulCave');
    expect(run.report.failures).toEqual([]);
    const manifest = await manifestOf(run, 'dudreadfulcave');
    expect(Object.keys(manifest.tiles)).toHaveLength(100);
    expect(manifest.mpu).toBe(2);

    let objects = 0;
    for (const key of Object.keys(manifest.tiles)) objects += (await tileOf(run, manifest, key)).objects.length;
    expect(objects).toBe(5111 - 97);
    const skipped = run.report.warnings.filter((w) => /skipped/.test(w.message));
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.message).toMatch(/97 objects with scale \(0, 0, 0\)/);
    expect(skipped[0]!.message).toMatch(/46 SFX objects/);
    await fs.rm(run.out, { recursive: true, force: true });
  }, 300_000);

  it('uses the file name for a tile whose header holds other coordinates (WdEvent01)', async () => {
    const run = await runRealWorlds('WdEvent01');
    expect(run.report.failures).toEqual([]);
    const manifest = await manifestOf(run, 'wdevent01');
    expect(Object.keys(manifest.tiles)).toHaveLength(25);

    let disagreeing = 0;
    for (const key of Object.keys(manifest.tiles)) {
      const [x, y] = key.split('_').map(Number) as [number, number];
      const name = `WdEvent01${String(x).padStart(2, '0')}-${String(y).padStart(2, '0')}.lnd`;
      const { tile: source } = lndOf(run.client, 'WdEvent01', name);
      if (source.x !== x || source.y !== y) disagreeing++;
      const tile = await tileOf(run, manifest, key);
      expect([tile.x, tile.y]).toEqual([x, y]);
    }
    expect(disagreeing).toBeGreaterThan(0); // the test means something only if the header really differs
    await fs.rm(run.out, { recursive: true, force: true });
  }, 300_000);
});

