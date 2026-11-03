// Keeps the terrain tiles (and their objects) around the player in the scene. The tiles within `radius` of the one
// the player is on are the visible ones; the ring just outside them is loaded too (preload), so that a tile is ready
// before the player gets near it. Everything further away is unloaded. Tiles are addressed `"x_y"`, x with web +x
// and y with web -z (D3D +z), as the converter names them.
//
// Only the visible tiles are in the scene (Piece 6 M5, part B). Neuz draws the lands within `m_nVisibilityLand` of the
// camera's land (CWorld::RenderTerrain, World3D.cpp:386-398, and its objects, :626-631), which is
// `(int)( m_fFarPlane / ( MAP_SIZE * MPU ) )` (World.cpp:116) with `m_fFarPlane = 512` (World3D.cpp:50): 1, the 3 x 3
// around it. The ring lies wholly past the far plane (Flaris' fog end, 400 m; a tile is 512 m), yet the whole-tile
// bounding spheres of its meshes passed three.js' frustum test, and Flaris drew 24 draws and 265,000 triangles of it a
// frame in the phone's view. Around the player's tile rather than the camera's: the same picture, since the far plane is
// shorter than a tile. A ring tile's groups go into the scene when it becomes visible, and out when it goes back.
//
// The ring is not downloaded before the world is on screen: it waits for `startPreloading` (the client calls it the
// frame after the world was first drawn, the viewer once its tiles are ready), and then for each update's visible tiles
// to settle, so that the tiles in view never share the connection with it.
//
// A tile the world does not have, or whose download failed, becomes flat ground at height 0 and an error on the
// overlay (global constraints: missing tile -> flat ground, never a hole).
//
// Each tile's objects go to the object pool (objects.ts) and, where there are some, to the collision shapes
// (collision.ts), and are taken back from both when the tile goes.

import type { Vec3, WebTile, WorldManifest } from '@flyffweb/formats';
import { MAP_SIZE } from '@flyffweb/formats';
import type { Object3D } from 'three';
import { Group, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { TextureCache } from '../assets/loaders';
import type { Overlay } from '../overlay/Overlay';
import { TerrainTile } from './TerrainTile';
import type { TerrainLighting } from './TerrainTile';
import type { CollisionShapes } from './collision';
import { sampleHeight } from './heightSampler';
import type { ObjectPool } from './objects';

export interface TilePosition {
  x: number;
  y: number;
}

export const tileKey = (x: number, y: number): string => `${x}_${y}`;

/** What the streamer keeps of a tile that is in (`tileData`): its heights and its objects, not its light maps. */
export type TileData = Pick<WebTile, 'x' | 'y' | 'heights' | 'objects'>;

/** The heights of flat ground: 0 at every corner, without flags. */
const FLAT_HEIGHTS = new Float32Array((MAP_SIZE + 1) * (MAP_SIZE + 1));

/** The tile under a web position: `floor(x / (128 mpu))`, `floor(-z / (128 mpu))`. */
export function tileOf(pos: Vec3, mpu: number): TilePosition {
  const side = MAP_SIZE * mpu;
  return { x: Math.floor(pos[0] / side), y: Math.floor((0 - pos[2]) / side) };
}

/**
 * The tiles of a world of `size` tiles around `center`: `visible` those at most `radius` away (in the larger of the
 * two directions), `preload` the ring at `radius + 1`. Tiles outside the world are left out. Row by row.
 */
export function tilesInRange(
  center: TilePosition,
  radius: number,
  size: readonly [number, number],
): { visible: string[]; preload: string[] } {
  const visible: string[] = [];
  const preload: string[] = [];
  const reach = radius + 1;
  for (let y = center.y - reach; y <= center.y + reach; y++) {
    for (let x = center.x - reach; x <= center.x + reach; x++) {
      if (x < 0 || y < 0 || x >= size[0] || y >= size[1]) continue;
      const distance = Math.max(Math.abs(x - center.x), Math.abs(y - center.y));
      (distance <= radius ? visible : preload).push(tileKey(x, y));
    }
  }
  return { visible, preload };
}

export interface StreamerDeps {
  textures: Pick<TextureCache, 'acquire' | 'release'>;
  objects: Pick<ObjectPool, 'place' | 'releaseTile'>;
  /** Given each tile's objects too, where there are some; a tile is not ready until what they place for it is in. */
  shapes?: Pick<CollisionShapes, 'place' | 'releaseTile'>;
  overlay: Pick<Overlay, 'error' | 'addGpuBytes'>;
  /** Shared by every tile; each tile is unlit without it. */
  lighting?: TerrainLighting;
  /** Visible tiles around the player's: 1 (the default) is 3 x 3. */
  radius?: number;
  /**
   * Given a ring tile's ground and its objects once they are in, out of the scene: the stage puts their textures on the
   * GPU, so that the copies loaded for them (light maps, mip levels) go as they do once drawn, and the tile shows without
   * an upload when it comes into view.
   */
  prepare?: (object: Object3D) => void;
}

/** One tile the streamer holds. */
interface Entry {
  key: string;
  /**
   * The tile's heights and objects, for `heightAt` and `tileData`; null until it arrives. Flat ground has flat
   * heights and no objects. Only these: the rest of the tile (light maps above all) is on the GPU or in the object
   * pool by then, and would only take memory.
   */
  data: TileData | null;
  terrain: TerrainTile | null;
  placeholder: Mesh | null;
  objects: Group | null;
  /** The ground is on screen: the terrain's textures are in, or the tile is flat ground. */
  loaded: boolean;
  /** Ground and objects are on screen, and the collision shapes in (or failed). Never rejects. */
  settled: Promise<void>;
  /** What was added to the overlay's GPU estimate for the ground. */
  bytes: number;
  unloaded: boolean;
}

export class TileStreamer {
  private readonly entries = new Map<string, Entry>();
  private readonly radius: number;
  private center: TilePosition | null = null;
  private visible: string[] = [];
  /** The ring of the last `update`. */
  private preload: string[] = [];
  /** `startPreloading` was called: the ring loads once each update's visible tiles have settled. */
  private preloading = false;
  /** Counts the waits for the visible tiles, so that only the latest one loads its ring. */
  private generation = 0;
  /** One plane and one material for every flat tile. */
  private readonly flatGeometry: PlaneGeometry;
  private readonly flatMaterial = new MeshLambertMaterial({ color: 0x7a8a5a });
  /**
   * The entries by `y * width + x`, for `tileData`, which the rules and the camera ask many times a frame: a `"x_y"` key
   * made for each was most of what the height lookups allocated (Piece 6 M5, part B).
   */
  private readonly byIndex = new Map<number, Entry>();

  constructor(
    private readonly world: string,
    private readonly manifest: WorldManifest,
    private readonly store: Pick<AssetStore, 'tile'>,
    private readonly scene: Object3D,
    private readonly deps: StreamerDeps,
  ) {
    this.radius = deps.radius ?? 1;
    const side = MAP_SIZE * manifest.mpu;
    this.flatGeometry = new PlaneGeometry(side, side);
    this.flatGeometry.rotateX(-Math.PI / 2);
  }

  /** Follows the player to `pos`: loads what came into range and unloads what left it. Cheap when nothing changed. */
  update(pos: Vec3): void {
    const center = tileOf(pos, this.manifest.mpu);
    if (this.center !== null && this.center.x === center.x && this.center.y === center.y) return;
    this.center = center;

    const { visible, preload } = tilesInRange(center, this.radius, this.manifest.size);
    this.visible = visible;
    this.preload = preload;
    const wanted = new Set([...visible, ...preload]);
    for (const [key, entry] of this.entries) {
      if (!wanted.has(key)) this.unload(entry);
    }
    for (const key of visible) {
      if (!this.entries.has(key)) this.load(key);
    }
    // a ring tile that came into view goes into the scene, a visible one that went back to the ring out of it
    for (const entry of this.entries.values()) this.place(entry);
    this.preloadOnceSettled();
  }

  /**
   * From now on, the ring around the player is downloaded once the visible tiles of each update have settled (at once
   * for the current ring when they already have). Before the first call only the visible tiles are.
   */
  startPreloading(): void {
    if (this.preloading) return;
    this.preloading = true;
    this.preloadOnceSettled();
  }

  /** The tiles whose ground is in: on screen, or (the ring) ready to be. */
  loaded(): string[] {
    return [...this.entries.values()].filter((entry) => entry.loaded).map((entry) => entry.key);
  }

  /** The ground height at `pos` (CLandscape::GetHeight, see sampleHeight), or null while its tile has not arrived. */
  heightAt(pos: Vec3): number | null {
    const { x, y } = tileOf(pos, this.manifest.mpu);
    const data = this.tileData(x, y);
    if (data === null) return null;
    const side = MAP_SIZE * this.manifest.mpu;
    // tile-local D3D coordinates: web z is -z
    return sampleHeight(data, pos[0] - x * side, 0 - pos[2] - y * side, this.manifest.mpu);
  }

  /**
   * Tile (x, y), x with D3D x and y with D3D z, as the streamer keeps it: its raw heights (`HGT_*` flags added) and
   * its objects; flat ground has height 0 and no objects. Null while it has not arrived, and for a tile not in range.
   */
  tileData(x: number, y: number): TileData | null {
    const [width, height] = this.manifest.size;
    if (!(x >= 0 && y >= 0 && x < width && y < height)) return null;
    return this.byIndex.get(y * width + x)?.data ?? null;
  }

  /**
   * Resolves once the visible tiles of the last `update` have their ground and objects on screen (and the shapes
   * what they were placing for them). Never rejects.
   */
  async ready(): Promise<void> {
    const pending = this.visible.flatMap((key) => this.entries.get(key)?.settled ?? []);
    await Promise.all(pending);
  }

  /** The number of tiles whose ground is in (`loaded`). */
  count(): number {
    return this.loaded().length;
  }

  dispose(): void {
    for (const entry of [...this.entries.values()]) this.unload(entry);
    this.flatGeometry.dispose();
    this.flatMaterial.dispose();
    this.center = null;
    this.visible = [];
    this.preload = [];
    this.generation++; // a wait still running loads nothing
  }

  /** Once the visible tiles of the last update have settled, the ring of that update, if preloading. */
  private preloadOnceSettled(): void {
    if (!this.preloading) return;
    const generation = ++this.generation;
    void this.ready().then(() => {
      if (generation !== this.generation) return;
      for (const key of this.preload) {
        if (!this.entries.has(key)) this.load(key);
      }
    });
  }

  /** The tile's ground, objects and placeholder are in the scene while it is visible, and out of it otherwise. */
  private place(entry: Entry): void {
    const shown = this.visible.includes(entry.key);
    for (const object of [entry.terrain?.group, entry.objects, entry.placeholder]) {
      if (object === undefined || object === null) continue;
      if (shown && object.parent !== this.scene) this.scene.add(object);
      else if (!shown && object.parent === this.scene) this.scene.remove(object);
    }
  }

  private load(key: string): void {
    const [x, y] = key.split('_').map(Number) as [number, number];
    const entry: Entry = {
      key,
      data: null,
      terrain: null,
      placeholder: null,
      objects: null,
      loaded: false,
      settled: Promise.resolve(),
      bytes: 0,
      unloaded: false,
    };
    this.entries.set(key, entry);
    this.byIndex.set(y * this.manifest.size[0] + x, entry);
    entry.settled = this.store.tile(this.world, x, y).then(
      (tile) => {
        if (entry.unloaded) return;
        if (tile === null) {
          this.flat(entry, x, y, 'not in the world manifest');
          return;
        }
        return this.show(entry, tile);
      },
      (error: unknown) => {
        if (entry.unloaded) return;
        this.flat(entry, x, y, error instanceof Error ? error.message : String(error));
      },
    );
  }

  private async show(entry: Entry, tile: WebTile): Promise<void> {
    const data: TileData = { x: tile.x, y: tile.y, heights: tile.heights, objects: tile.objects };
    entry.data = data;
    const terrain = new TerrainTile(tile, this.manifest, { textures: this.deps.textures, lighting: this.deps.lighting });
    entry.terrain = terrain;
    entry.bytes = terrain.gpuBytes();
    this.deps.overlay.addGpuBytes(entry.bytes);
    this.place(entry);

    const ground = terrain.ready.then(() => {
      if (entry.unloaded) return;
      entry.loaded = true;
      this.prepareOutOfView(entry, terrain.group);
    });
    const objects = this.deps.objects.place(tile, this.manifest).then((group) => {
      if (entry.unloaded) return;
      entry.objects = group;
      this.place(entry);
      this.prepareOutOfView(entry, group);
    });
    // the shapes keep `data`, not `tile`, whose light maps are let go of
    const shapes = this.deps.shapes?.place(data);
    await Promise.all([ground, objects, shapes]).catch((error: unknown) => {
      this.deps.overlay.error(`tile ${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Hands `object` to `deps.prepare` when its tile is in the ring: a visible one is drawn, which uploads it anyway. */
  private prepareOutOfView(entry: Entry, object: Object3D): void {
    if (!this.visible.includes(entry.key)) this.deps.prepare?.(object);
  }

  private flat(entry: Entry, x: number, y: number, reason: string): void {
    this.deps.overlay.error(`tile ${entry.key}: ${reason}; showing flat ground`);
    const side = MAP_SIZE * this.manifest.mpu;
    const mesh = new Mesh(this.flatGeometry, this.flatMaterial);
    mesh.name = `placeholder ${entry.key}`;
    mesh.position.set((x + 0.5) * side, 0, -(y + 0.5) * side);
    // the plane is shared by every flat tile and is a few bytes: not counted
    entry.placeholder = mesh;
    entry.data = { x, y, heights: FLAT_HEIGHTS, objects: [] };
    this.place(entry);
    entry.loaded = true;
  }

  private unload(entry: Entry): void {
    entry.unloaded = true;
    entry.loaded = false;
    this.entries.delete(entry.key);
    const [x, y] = entry.key.split('_').map(Number) as [number, number];
    if (this.byIndex.get(y * this.manifest.size[0] + x) === entry) this.byIndex.delete(y * this.manifest.size[0] + x);
    if (entry.terrain !== null) {
      this.scene.remove(entry.terrain.group);
      entry.terrain.dispose();
      // place() was called with the terrain: the pool holds the tile's models until told, and the shapes theirs
      this.deps.objects.releaseTile(entry.key);
      this.deps.shapes?.releaseTile(entry.key);
    }
    if (entry.objects !== null) this.scene.remove(entry.objects);
    if (entry.placeholder !== null) this.scene.remove(entry.placeholder);
    this.deps.overlay.addGpuBytes(-entry.bytes);
    entry.terrain = null;
    entry.objects = null;
    entry.placeholder = null;
    entry.data = null;
  }
}
