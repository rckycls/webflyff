// The `worlds` stage: every folder of `Client/World` that holds a `.wld`, as
//
//   worlds/<web name>/manifest.json         the world header and the lists the tiles index into (WorldManifest)
//   worlds/<web name>/tiles/<x>_<y>.bin     one terrain tile per `.lnd` (WebTile, encodeTileBin)
//
// Each tile is what CLandscape::LoadLandscape (Source/_Common/lod.cpp:1266) builds from a `.lnd`, minus the parts
// that need a Direct3D device:
//
//   - A tile's column and row come from its FILE NAME (`<World>NN-MM.lnd` is x = NN, y = MM, the way CWorld
//     builds the name at WorldFile.cpp:832 and :980 and passes the numbers on as LoadLandscape's xx and yy). The
//     xLand and yLand inside the file are read into unused locals (lod.cpp:1274); 36 shipped files disagree (R14).
//   - Object positions in the file are tile-local. LoadLandscape adds the tile's origin to each one, for a file of
//     version 1 or later (lod.cpp:1356-1359): `x += xx * LANDREALSCALE; z += yy * LANDREALSCALE` with
//     LANDREALSCALE = MAP_SIZE * MPU (landscape.h:12), MPU being the world's (R15). The matrix is built from the
//     moved position, in D3D space, and then mirrored (`toWebMatrix`).
//   - A layer whose texture id has no texture is dropped (lod.cpp:1326-1340). A layer whose texture file is merely
//     absent from the output is kept: the viewer draws its checkerboard.
//   - CLandscape::NewLayer (lod.cpp:1597) would fold two layers with the same texture id into one; no shipped tile
//     has two, so the layers are kept one for one.
//   - SFX objects (lod.cpp:1398) are out of scope for the first browser client and are skipped, counted in a warning.
//     So are objects with scale (0, 0, 0): their matrix is singular, they draw nothing.
//
// Heights, water bytes and land attributes are stored as the file has them (the HGT_* flags stay added to the
// heights); light maps go through `argbToRgba`.
//
// The manifest lists `terrainTextures` and `models` in the order the tiles first use them, tiles taken by row and
// then column. Tiles are read in parallel but take their slots one after the other in that order, so the output is
// the same whatever `--jobs` is (the hashed file names depend on it). `modelTrans` holds each model's `bTrans` from
// the index entry that first gave the model its slot (CModelMng::LoadScript, ModelMng.cpp:398; no shipped model has
// entries that disagree).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  FormatError,
  MAP_SIZE,
  argbToRgba,
  decodeScript,
  encodeTileBin,
  loadDefines,
  modelFileName,
  objectLocalMatrix,
  readLnd,
  readModelIndex,
  readTerrainIndex,
  readWld,
  toWebMatrix,
  toWebPosition,
  webName,
} from '@flyffweb/formats';
import type {
  LandTile,
  ModelElem,
  TerrainTexture,
  WebTile,
  WebTileLayer,
  WorldInfo,
  WorldManifest,
} from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import type { Stage, StageContext } from '../run';
import { textureKey } from '../textures/convertTexture';
import { matchesOnly, runLimited } from '../util';

/** `WebTileObject.model` of an object whose model could not be resolved. */
export const NO_MODEL = 0xffff;

const KIND = 'worlds';
const WORLD_DIR = 'World';
const MODEL_DIR = 'Model';

/** What `convertWorld` needs from the stage context. */
export type WorldContext = Pick<StageContext, 'client' | 'writer' | 'report' | 'jobs'>;

/** The two scripts every world is converted against. Read once per run (`loadWorldIndexes`). */
export interface WorldIndexes {
  /** `Terrain.inc`: texture id to entry. */
  terrain: ReadonlyMap<number, TerrainTexture>;
  /** `mdlObj.inc` and `mdlDyna.inc`: `<object type>:<id>` to entry. A later entry with the same type and id wins. */
  models: ReadonlyMap<string, ModelElem>;
}

export function loadWorldIndexes(client: ClientFs): WorldIndexes {
  const defines = loadDefines(client.packs);
  const script = (name: string): string => decodeScript(client.packs.read(name));
  const terrain = readTerrainIndex(script('Terrain.inc'), defines, 'Terrain.inc').textures;
  const models = new Map<string, ModelElem>();
  for (const name of ['mdlObj.inc', 'mdlDyna.inc']) {
    for (const elem of readModelIndex(script(name), defines, name)) models.set(`${elem.type}:${elem.id}`, elem);
  }
  return { terrain, models };
}

/** `Foo/Bar.wld` is `Bar`. */
const stem = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '');

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

const readBytes = async (file: string): Promise<Uint8Array> => new Uint8Array(await fs.readFile(file));

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One `.lnd` of the world, with the column and row its name gives. */
interface TileJob {
  file: string;
  x: number;
  y: number;
  /** Position among the world's tiles by row, then column. */
  order: number;
}

/** A tile read and checked, not yet tied to the manifest's lists. */
interface PreparedTile {
  land: LandTile;
  objects: { objType: number; index: number; matrix: Float32Array }[];
  zeroScale: number;
}

/** Lets tiles take their slots one after the other in tile order, whichever tile finishes reading first. */
class Turns {
  private readonly finished: (() => void)[] = [];
  private readonly promises: Promise<void>[];

  constructor(count: number) {
    this.promises = Array.from({ length: count }, (_, i) => {
      return new Promise<void>((resolve) => (this.finished[i] = resolve));
    });
  }

  /** Resolves once tile `order - 1` has taken its slots (or failed before it could). */
  wait(order: number): Promise<void> {
    return order === 0 ? Promise.resolve() : this.promises[order - 1]!;
  }

  done(order: number): void {
    this.finished[order]!();
  }
}

/** The state shared by the tiles of one world: the manifest's lists, and the warnings already given. */
class WorldBuild {
  readonly terrainTextures: string[] = [];
  readonly models: string[] = [];
  /** Parallel to `models`: each model's `bTrans`. */
  readonly modelTrans: boolean[] = [];
  private readonly textureOfKey = new Map<string, number>();
  private readonly modelOfKey = new Map<string, number>();
  /** Terrain.inc id to slot (undefined: no such texture). */
  private readonly layerSlots = new Map<number, number | undefined>();
  /** `<type>:<id>` to slot or NO_MODEL. */
  private readonly objectSlots = new Map<string, number>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly ctx: WorldContext,
    private readonly indexes: WorldIndexes,
  ) {}

  private warnOnce(about: string, source: string, message: string): void {
    if (this.warned.has(about)) return;
    this.warned.add(about);
    this.ctx.report.warn(KIND, source, message);
  }

  /** Index into `terrainTextures` for a layer's Terrain.inc id, or undefined for a layer to drop. */
  layerSlot(id: number, source: string): number | undefined {
    if (this.layerSlots.has(id)) return this.layerSlots.get(id);
    const texture = this.indexes.terrain.get(id);
    let slot: number | undefined;
    if (texture === undefined) {
      this.warnOnce(
        `texture id ${id}`,
        source,
        `layer texture id ${id} is not in Terrain.inc, so the layer is dropped (LoadLandscape drops a layer whose ` +
          'texture it cannot load)',
      );
    } else {
      const key = textureKey('terrain', texture.file);
      slot = this.textureOfKey.get(key);
      if (slot === undefined) {
        slot = this.terrainTextures.push(key) - 1;
        this.textureOfKey.set(key, slot);
        if (this.ctx.writer.pathOf(key) === undefined) {
          this.ctx.report.warn(
            KIND,
            source,
            `terrain texture ${texture.file} (Terrain.inc id ${id}) was not converted (not in ` +
              `${WORLD_DIR}/TextureMid, failed, or left out by --only); the viewer shows a checkerboard for it`,
          );
        }
      }
    }
    this.layerSlots.set(id, slot);
    return slot;
  }

  /** Index into `models` for an object, or NO_MODEL (with a warning, once per name) when it has no converted model. */
  modelSlot(objType: number, index: number, source: string): number {
    const id = `${objType}:${index}`;
    let slot = this.objectSlots.get(id);
    if (slot === undefined) {
      slot = this.resolveModel(objType, index, source);
      this.objectSlots.set(id, slot);
    }
    return slot;
  }

  private resolveModel(objType: number, index: number, source: string): number {
    const elem = this.indexes.models.get(`${objType}:${index}`);
    if (elem === undefined) {
      this.warnOnce(
        `type ${objType} id ${index}`,
        source,
        `the model index (mdlObj.inc, mdlDyna.inc) has no entry for object type ${objType} id ${index}, so its ` +
          'objects get no model',
      );
      return NO_MODEL;
    }

    const fileName = modelFileName(elem);
    const where = `(object type ${objType} id ${index}, "${elem.name}")`;
    if (!/\.o3d$/i.test(fileName)) {
      // modelFileName gives an SFX model (it names a .sfx script) or a billboard just its name: no mesh to convert.
      this.warnOnce(
        fileName.toLowerCase(),
        source,
        `model ${fileName} ${where} is an SFX or billboard model, not an .o3d file, so its objects get no model`,
      );
      return NO_MODEL;
    }
    const real = this.ctx.client.find(MODEL_DIR, fileName);
    if (real === null) {
      this.warnOnce(
        fileName.toLowerCase(),
        source,
        `model file ${fileName} ${where} is not in Client/${MODEL_DIR}, so its objects get no model`,
      );
      return NO_MODEL;
    }

    // The models stage names its output after the real file (`Obj_ AzriaThicket01.o3d`), not after the index entry.
    const base = path.basename(real);
    const key = `models/${webName(base.slice(0, -'.o3d'.length))}.glb`;
    if (this.ctx.writer.pathOf(key) === undefined) {
      this.warnOnce(
        base.toLowerCase(),
        source,
        `model ${base} was not converted (rejected by Neuz, failed, or left out by --only), ` +
          'so its objects get no model',
      );
      return NO_MODEL;
    }
    let slot = this.modelOfKey.get(key);
    if (slot === undefined) {
      if (this.models.length >= NO_MODEL) throw new RangeError(`more than ${NO_MODEL} distinct models in one world`);
      slot = this.models.push(key) - 1;
      this.modelTrans.push(elem.extra[4] !== 0); // bTrans (ModelMng.cpp:398)
      this.modelOfKey.set(key, slot);
    }
    return slot;
  }
}

/**
 * Reads a tile's objects and heights and checks them, without touching the manifest's lists. Throws a RangeError for a
 * non-finite height or object matrix, which would encode as garbage.
 */
function prepareTile(land: LandTile, job: TileJob, mpu: number): PreparedTile {
  for (let i = 0; i < land.heights.length; i++) {
    if (!Number.isFinite(land.heights[i]!)) throw new RangeError(`height ${i} is not finite (${land.heights[i]})`);
  }

  // lod.cpp:1356: only a file of version 1 or later has its tile origin added.
  const realScale = MAP_SIZE * mpu; // LANDREALSCALE
  const moveX = land.version >= 1 ? job.x * realScale : 0;
  const moveZ = land.version >= 1 ? job.y * realScale : 0;

  const objects: PreparedTile['objects'] = [];
  let zeroScale = 0;
  land.objects.forEach((rec, i) => {
    if (rec.scale[0] === 0 && rec.scale[1] === 0 && rec.scale[2] === 0) {
      zeroScale++;
      return;
    }
    const position: [number, number, number] = [rec.position[0] + moveX, rec.position[1], rec.position[2] + moveZ];
    const matrix = toWebMatrix(objectLocalMatrix({ ...rec, position }));
    if (!matrix.every(Number.isFinite)) throw new RangeError(`object ${i} has a matrix that is not finite`);
    objects.push({ objType: rec.objType, index: rec.index, matrix });
  });
  return { land, objects, zeroScale };
}

/** Ties a prepared tile to the manifest's lists. Must run in tile order (see `Turns`). */
function assignSlots(prepared: PreparedTile, job: TileJob, world: WorldBuild): WebTile {
  const { land } = prepared;
  const layers: WebTileLayer[] = [];
  for (const layer of land.layers) {
    const texture = world.layerSlot(layer.textureId, job.file);
    if (texture === undefined) continue;
    layers.push({ texture, patchEnable: layer.patchEnable, light: argbToRgba(layer.lightMap) });
  }
  const objects = prepared.objects.map((o) => ({
    model: world.modelSlot(o.objType, o.index, job.file),
    matrix: o.matrix,
  }));
  return { x: job.x, y: job.y, heights: land.heights, water: land.water, landAttr: land.landAttr, layers, objects };
}

/** The `.lnd` files in `relDir` with their coordinates, by row and column; a name that does not fit is warned about. */
function tileJobs(ctx: WorldContext, relDir: string, worldStem: string): TileJob[] {
  const pattern = new RegExp(`^${escapeRegExp(worldStem)}(\\d+)-(\\d+)\\.lnd$`, 'i');
  const jobs: Omit<TileJob, 'order'>[] = [];
  for (const file of ctx.client.list(relDir, /\.lnd$/i)) {
    const match = pattern.exec(path.basename(file));
    if (match === null) {
      ctx.report.warn(
        KIND,
        file,
        `file name does not fit ${worldStem}<column>-<row>.lnd, so this tile is skipped`,
      );
      continue;
    }
    jobs.push({ file, x: Number.parseInt(match[1]!, 10), y: Number.parseInt(match[2]!, 10) });
  }
  jobs.sort((a, b) => a.y - b.y || a.x - b.x || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return jobs.map((job, order) => ({ ...job, order }));
}

/**
 * Converts the world in folder `worldDir` (a real path inside the client folder): one tile file per `.lnd`, then the
 * manifest, and returns the manifest. A tile that fails is reported (kind `worlds`, its `.lnd` path) and left out of
 * `tiles`; the world goes on. Throws when the world itself is unusable (no `.wld`, an unreadable one, a name
 * collision), and the caller reports that.
 */
export async function convertWorld(
  worldDir: string,
  ctx: WorldContext,
  indexes: WorldIndexes = loadWorldIndexes(ctx.client),
): Promise<WorldManifest> {
  const folder = path.basename(worldDir);
  const relDir = path.relative(ctx.client.root, worldDir);
  const wlds = ctx.client.list(relDir, /\.wld$/i);
  const wldFile = wlds.find((f) => stem(f).toLowerCase() === folder.toLowerCase()) ?? wlds[0];
  if (wldFile === undefined) throw new Error(`${worldDir} has no .wld file`);
  const wldBytes = await readBytes(wldFile);
  const info: WorldInfo = readWld(decodeScript(wldBytes), wldFile);

  const web = webName(folder);
  const jobs = tileJobs(ctx, relDir, stem(wldFile));
  const world = new WorldBuild(ctx, indexes);
  const turns = new Turns(jobs.length);
  const written = new Map<number, string>(); // order to hashed path
  let sfxSkipped = 0;
  let zeroScaleSkipped = 0;

  await runLimited(jobs, ctx.jobs, async (job) => {
    try {
      const bytes = await readBytes(job.file);
      const prepared = prepareTile(readLnd(bytes, job.file), job, info.mpu);
      await turns.wait(job.order);
      const tile = assignSlots(prepared, job, world);
      turns.done(job.order);
      const encoded = encodeTileBin(tile);
      written.set(job.order, await ctx.writer.write(`worlds/${web}/tiles/${job.x}_${job.y}.bin`, encoded, job.file));
      sfxSkipped += prepared.land.sfxObjects.length;
      zeroScaleSkipped += prepared.zeroScale;
      ctx.report.ok(KIND, job.file, bytes.length, encoded.length);
    } catch (error) {
      ctx.report.fail(KIND, job.file, error);
    } finally {
      turns.done(job.order); // a tile that failed before taking its turn must not hold up the rest
    }
  });

  const skipped = [
    ...(sfxSkipped > 0 ? [`${plural(sfxSkipped, 'SFX object')} (out of scope)`] : []),
    ...(zeroScaleSkipped > 0 ? [`${plural(zeroScaleSkipped, 'object')} with scale (0, 0, 0)`] : []),
  ];
  if (skipped.length > 0) ctx.report.warn(KIND, wldFile, `skipped ${skipped.join(' and ')}`);

  const tiles: Record<string, string> = {};
  for (const job of jobs) {
    const hashed = written.get(job.order);
    if (hashed !== undefined) tiles[`${job.x}_${job.y}`] = hashed;
  }
  const manifest: WorldManifest = {
    name: folder,
    size: info.size,
    mpu: info.mpu,
    mapSize: MAP_SIZE,
    ambient: info.ambient,
    bgColor: info.bgColor,
    fog: info.fog,
    camera: { position: toWebPosition(info.camera.position), angle: info.camera.angle, angleX: info.camera.angleX },
    terrainTextures: world.terrainTextures,
    models: world.models,
    modelTrans: world.modelTrans,
    tiles,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  await ctx.writer.write(`worlds/${web}/manifest.json`, json, wldFile);
  ctx.report.ok(KIND, wldFile, wldBytes.length, json.length);
  return manifest;
}

/** Real paths of the folders directly inside `World` that hold a `.wld`, in name order. */
function worldFolders(client: ClientFs, worldsDir: string): string[] {
  const folders = new Set<string>();
  for (const wld of client.list(WORLD_DIR, /\.wld$/i, true)) {
    const folder = path.dirname(wld);
    if (path.dirname(folder) === worldsDir) folders.add(folder);
  }
  return [...folders];
}

export const worldsStage: Stage = {
  name: 'worlds',
  async run(ctx) {
    const worldsDir = ctx.client.find('', WORLD_DIR);
    if (worldsDir === null) return;
    const todo = worldFolders(ctx.client, worldsDir).filter((dir) => matchesOnly(path.basename(dir), ctx.only));
    if (todo.length === 0) return;

    const indexes = loadWorldIndexes(ctx.client);
    for (const dir of todo) {
      try {
        await convertWorld(dir, ctx, indexes);
      } catch (error) {
        // A FormatError names the file it came from (the .wld, say); anything else is about the folder.
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : dir, error);
      }
    }
  },
};
