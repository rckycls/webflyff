import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeTileBin, toWebPosition } from '@flyffweb/formats';
import type { AssetIndex, SkeletonGrips, WebTile, WorldManifest } from '@flyffweb/formats';
import { CollisionShapes, modelBoxOf, tileLand, tileOf, tilesInRange, unionModelBoxes } from '@flyffweb/scene';
import type { ModelBox, TileLand } from '@flyffweb/scene';
import type { GameData } from '../../src/world/gameData';
import { heldModels } from '../../src/world/render/looks';
import type { MoverLook } from '../../src/world/render/looks';
import { terrainGround } from '../../src/world/sim/collision';
import type { Ground } from '../../src/world/sim/collision';

/** A glb's first four bytes, `glTF`, and its JSON chunk's type, `JSON`, as little-endian u32s (glTF 2.0, "Binary glTF Layout"). */
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;

/** What the rules read of a glb's JSON: its scenes' and its animations' `extras`. */
export interface GlbJson {
  scene?: number;
  scenes?: { extras?: Record<string, unknown> }[];
  animations?: { name?: string; extras?: Record<string, unknown> }[];
}

/**
 * The JSON chunk of a glb, parsed: the 12-byte header, then the chunk's length and type (glTF 2.0, "Binary glTF
 * Layout"); no mesh is read. `where` names the file when it is not a glb.
 */
export function glbJson(bytes: Uint8Array, where: string): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== GLB_JSON_CHUNK) {
    throw new Error(`${where} is not a glb with its JSON chunk first`);
  }
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as GlbJson;
}

/**
 * The `extras` of a glb's scene (`scenes[scene]`, the first without a `scene`), which GLTFLoader puts in the scene's
 * `userData`, where the scene package reads a model's box and a skeleton's grips (`ModelBoxExtras`, `SkeletonExtras`);
 * `{}` for a scene without extras.
 */
export function glbSceneExtras(json: GlbJson): Record<string, unknown> {
  return json.scenes?.[json.scene ?? 0]?.extras ?? {};
}

/** The worktree's converted assets (`npm run convert`), which the world screen's dev server serves too. */
export const ASSETS_DIR = fileURLToPath(new URL('../../../../dist/assets/', import.meta.url));

/** `dist/assets` read from the disk instead of fetched: the same logical keys, through the same `index.json`. */
export class DiskAssets {
  private constructor(private readonly files: Readonly<Record<string, string>>) {}

  /** Reads `index.json`; throws with what to do when the converted files are not there. */
  static open(): DiskAssets {
    const indexPath = `${ASSETS_DIR}index.json`;
    if (!existsSync(indexPath)) throw new Error(`${indexPath} is missing: run \`npm run convert\` first (the test reads the game data from it).`);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Partial<AssetIndex>;
    if (index.version !== 1 || typeof index.files !== 'object' || index.files === null) throw new Error(`${indexPath} is not an asset index this test reads`);
    return new DiskAssets(index.files);
  }

  has(key: string): boolean {
    return Object.hasOwn(this.files, key);
  }

  /** What `AssetStore.url` gives `loadGameData`: the file's path, or null when the index does not list the key. */
  url(key: string): string | null {
    return this.has(key) ? ASSETS_DIR + this.files[key]! : null;
  }

  /** What `AssetStore.json` gives `loadGameData`. */
  json<T>(key: string): Promise<T> {
    return Promise.resolve(this.readJson<T>(key));
  }

  readJson<T>(key: string): T {
    return JSON.parse(readFileSync(this.path(key), 'utf8')) as T;
  }

  /** What `AssetStore.bytes` gives `CollisionShapes`: the file's bytes. */
  bytes(key: string): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(readFileSync(this.path(key))));
  }

  /** A glb's JSON chunk (`glbJson`). */
  glb(key: string): GlbJson {
    return glbJson(new Uint8Array(readFileSync(this.path(key))), key);
  }

  /** The `extras` of a glb's scene (`glbSceneExtras`). */
  sceneExtras(key: string): Record<string, unknown> {
    return glbSceneExtras(this.glb(key));
  }

  /** A tile by the hashed path the world's manifest names. */
  tile(hashedPath: string): WebTile {
    const path = ASSETS_DIR + hashedPath;
    return decodeTileBin(new Uint8Array(readFileSync(path)), path);
  }

  private path(key: string): string {
    if (!this.has(key)) throw new Error(`asset "${key}" is not in ${ASSETS_DIR}index.json`);
    return ASSETS_DIR + this.files[key]!;
  }
}

/**
 * The ground under a D3D x, z of one converted world, which the movers' steps stand on as the screen's ground does
 * (`tileLand`, which the world screen's stage stands on too): the terrain's height (`CLandscape::GetHeight`), `null`
 * where the world has no tile (the mover then stays where it is), the land's attributes (the `HGT_*` flags of the
 * heights) and its triangles; no objects.
 */
export class Terrain {
  private readonly tiles = new Map<string, WebTile | null>();
  readonly heightAt: TileLand['terrainHeight'];
  readonly landAttrAt: TileLand['landAttr'];
  readonly landTriAt: TileLand['landTri'];
  /** What `WorldState` takes: this terrain, its attributes and its triangles, without objects. */
  readonly ground: Ground;

  constructor(private readonly assets: DiskAssets, private readonly manifest: WorldManifest) {
    const land = tileLand(manifest, (tx, tz) => this.tileOf(tx, tz));
    this.heightAt = land.terrainHeight;
    this.landAttrAt = land.landAttr;
    this.landTriAt = land.landTri;
    this.ground = { ...terrainGround(land.terrainHeight, land.landAttr), landTri: land.landTri };
  }

  private tileOf(tx: number, tz: number): WebTile | null {
    const key = `${tx}_${tz}`;
    let tile = this.tiles.get(key);
    if (tile === undefined) {
      tile = Object.hasOwn(this.manifest.tiles, key) ? this.assets.tile(this.manifest.tiles[key]!) : null;
      this.tiles.set(key, tile);
    }
    return tile;
  }
}

/**
 * The collision shapes of a world's placed objects, as the world screen's stage adds them to its land
 * (`WorldStage.ground().objectsNear`, `CollisionShapes`), read from the disk: on the tiles the stage holds around D3D
 * (x, z) (`TileStreamer`: those within `radius` of its tile and the ring past it, the stage's `RADIUS` being 1), every
 * tile's shapes linked before it resolves, so that their land and their objects count together (Ruling 45). Unlike the
 * stage it does not stream: the tiles stay those around the point it was made for. A shape that cannot be read, which
 * the stage would say on the overlay, throws.
 */
export async function placedObjects(
  assets: DiskAssets, manifest: WorldManifest, x: number, z: number, radius = 1,
): Promise<CollisionShapes> {
  const problems: string[] = [];
  const shapes = new CollisionShapes(assets, manifest, { error: (message) => problems.push(message) });
  shapes.activate();
  const { visible, preload } = tilesInRange(tileOf(toWebPosition([x, 0, z]), manifest.mpu), radius, manifest.size);
  const keys = [...visible, ...preload].filter((key) => Object.hasOwn(manifest.tiles, key));
  await Promise.all(keys.map((key) => shapes.place(assets.tile(manifest.tiles[key]!))));
  if (problems.length > 0) throw new Error(`the placed objects' collision shapes could not all be read: ${problems.join('; ')}`);
  return shapes;
}

/**
 * The box of a look's model as the world screen loads it and puts the items in its hands (`AssembledCharacter.box()`
 * after `loadMoverModel` and `attachHeld`), which its views give `WorldScreen.measureRadii` (`pickCandidates`) for
 * `CObj::GetRadius`; read from the glbs' scene extras instead of from the loaded models:
 * - with a skeleton, the union of the parts' boxes (`assembleCharacter`) and of the boxes of the items in the hands
 *   (`heldModels`; `attachHeld` adds them, given the skeleton's grips, which a glb of an older conversion lacks:
 *   `gripsOf`);
 * - without one, the first part's (`plainModel`).
 * A part or an item the asset index lacks adds nothing (the views say so and leave it out), and a part without a box
 * adds nothing either. Null where there is no model to load (`loadMoverModel` rejects, and the views draw their
 * placeholder): no look, no part, or no skeleton file.
 */
export function drawnBox(assets: DiskAssets, look: MoverLook | null, data: GameData): ModelBox | null {
  if (look === null) return null;
  const parts = look.parts.filter((key) => assets.has(key));
  if (parts.length === 0) return null;
  const boxOf = (key: string): ModelBox | null => modelBoxOf({ userData: assets.sceneExtras(key) }, key);
  const boxes: ModelBox[] = [];
  const add = (box: ModelBox | null): void => {
    if (box !== null) boxes.push(box);
  };
  if (look.skeleton === null) {
    add(boxOf(parts[0]!));
    return unionModelBoxes(boxes);
  }
  if (!assets.has(look.skeleton)) return null;
  for (const key of parts) add(boxOf(key));
  const grips = assets.sceneExtras(look.skeleton).grips as Partial<SkeletonGrips> | undefined;
  if (grips?.rArm !== undefined && grips.lArm !== undefined) {
    for (const { model } of heldModels(look.held, data)) if (assets.has(model)) add(boxOf(model));
  }
  return unionModelBoxes(boxes);
}
