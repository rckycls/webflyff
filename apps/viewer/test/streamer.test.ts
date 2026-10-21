import { MAP_SIZE, NUM_PATCHES_PER_SIDE } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import { Group, Mesh, Scene, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TerrainTile } from '../src/world/TerrainTile';
import { TileStreamer, tileOf, tilesInRange } from '../src/world/tileStreamer';

const SIDE = MAP_SIZE + 1;
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;
/** Madrigal's meters per unit: a tile is 512 m across. */
const MPU = 4;
const TILE_METERS = MAP_SIZE * MPU;

/** A tile with one layer of texture 0 over every patch, its heights `height(col, row)`. */
function makeTile(x: number, y: number, height: (col: number, row: number) => number = () => 0): WebTile {
  const heights = new Float32Array(SIDE * SIDE);
  for (let row = 0; row < SIDE; row++) for (let col = 0; col < SIDE; col++) heights[row * SIDE + col] = height(col, row);
  return {
    x,
    y,
    heights,
    water: new Uint8Array(PATCHES * 2),
    landAttr: new Uint8Array(PATCHES),
    layers: [{ texture: 0, patchEnable: new Uint8Array(PATCHES).fill(1), light: new Uint8Array(128 * 128 * 4) }],
    objects: [],
  };
}

function makeManifest(size: [number, number] = [30, 30]): WorldManifest {
  return {
    name: 'WdTest',
    size,
    mpu: MPU,
    mapSize: 128,
    ambient: 0,
    bgColor: 0,
    fog: { start: 70, end: 400, density: 0 },
    camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
    terrainTextures: ['textures/ground.ktx2'],
    models: [],
    tiles: {},
  };
}

/** The middle of tile (x, y), in web coordinates. */
function middleOf(x: number, y: number): [number, number, number] {
  return [(x + 0.5) * TILE_METERS, 0, -(y + 0.5) * TILE_METERS];
}

/** Lets every settled promise run its callbacks. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Textures that arrive only when `arrive()` is called (or at once, with `instant`). */
function fakeTextures(instant = true) {
  const texture = new Texture();
  let arrive: () => void = () => {};
  const arrived = instant ? Promise.resolve() : new Promise<void>((resolve) => (arrive = resolve));
  return {
    arrive: () => arrive(),
    acquire: vi.fn(async (_key: string | null) => {
      await arrived;
      return texture;
    }),
    release: vi.fn((_key: string | null) => {}),
  };
}

interface Setup {
  /** Tiles the store does not have (it answers null); every other tile is flat ground. */
  missing?: string[];
  /** Tiles whose download fails. */
  failing?: string[];
  /** Tiles whose download waits until `release(key)` is called. */
  held?: string[];
  instantTextures?: boolean;
  tile?: (x: number, y: number) => WebTile;
}

function setup({ missing = [], failing = [], held = [], instantTextures = true, tile = makeTile }: Setup = {}) {
  const heldDownloads = new Map<string, () => void>();
  const store = {
    tile: vi.fn(async (_world: string, x: number, y: number): Promise<WebTile | null> => {
      const key = `${x}_${y}`;
      if (held.includes(key)) await new Promise<void>((resolve) => heldDownloads.set(key, resolve));
      if (failing.includes(key)) throw new Error(`could not load ${key}.bin after 4 attempts: HTTP 503`);
      return missing.includes(key) ? null : tile(x, y);
    }),
  };
  const groups = new Map<string, Group>();
  const objects = {
    place: vi.fn(async (t: WebTile) => {
      const group = new Group();
      group.name = `objects ${t.x}_${t.y}`;
      groups.set(`${t.x}_${t.y}`, group);
      return group;
    }),
    releaseTile: vi.fn((_key: string) => {}),
  };
  const overlay = { error: vi.fn((_message: string) => {}), addGpuBytes: vi.fn((_n: number) => {}) };
  const textures = fakeTextures(instantTextures);
  const scene = new Scene();
  const streamer = new TileStreamer('wdtest', makeManifest(), store, scene, { textures, objects, overlay });
  const gpuBytes = () => overlay.addGpuBytes.mock.calls.reduce((sum, [n]) => sum + n, 0);
  const release = (key: string) => heldDownloads.get(key)?.();
  return { store, objects, groups, overlay, textures, scene, streamer, gpuBytes, release };
}

const requested = (store: { tile: { mock: { calls: [string, number, number][] } } }): string[] =>
  store.tile.mock.calls.map(([, x, y]) => `${x}_${y}`);

describe('tileOf', () => {
  it('gives the tile under a web position: x from +x, y from -z, 128 cells of mpu meters each', () => {
    expect(tileOf([1024, 0, -1536], 4)).toEqual({ x: 2, y: 3 });
  });

  it('floors, so a point just inside a tile belongs to it', () => {
    expect(tileOf([1023.9, 50, -1536.1], 4)).toEqual({ x: 1, y: 3 });
    expect(tileOf([0, 0, 0], 4)).toEqual({ x: 0, y: 0 });
  });
});

describe('tilesInRange', () => {
  it('has the 3 x 3 visible tiles and the 16 of the ring around them, for radius 1', () => {
    const { visible, preload } = tilesInRange({ x: 10, y: 10 }, 1, [30, 30]);
    expect(visible).toHaveLength(9);
    expect(preload).toHaveLength(16);
    expect(new Set(visible)).toEqual(new Set(['9_9', '10_9', '11_9', '9_10', '10_10', '11_10', '9_11', '10_11', '11_11']));
    expect(preload).toContain('8_8');
    expect(preload).toContain('12_12');
    expect(preload).toContain('10_8');
    expect(preload).not.toContain('10_10');
  });

  it('leaves out tiles outside the world', () => {
    const { visible, preload } = tilesInRange({ x: 0, y: 0 }, 1, [30, 30]);
    expect(new Set(visible)).toEqual(new Set(['0_0', '1_0', '0_1', '1_1']));
    expect(new Set(preload)).toEqual(new Set(['2_0', '2_1', '2_2', '0_2', '1_2']));

    const corner = tilesInRange({ x: 29, y: 29 }, 1, [30, 30]);
    expect(corner.visible).toHaveLength(4);
    expect(corner.preload).toHaveLength(5);
  });

  it('is the centre alone for radius 0, with its 8 neighbours to preload', () => {
    const { visible, preload } = tilesInRange({ x: 5, y: 5 }, 0, [30, 30]);
    expect(visible).toEqual(['5_5']);
    expect(preload).toHaveLength(8);
  });
});

describe('TileStreamer', () => {
  it('asks for the visible tiles first, then the preload ring, each once', async () => {
    const { store, streamer } = setup();
    streamer.update(middleOf(10, 10));
    streamer.update(middleOf(10, 10));
    await flush();

    const asked = requested(store);
    expect(asked).toHaveLength(25);
    expect(new Set(asked.slice(0, 9))).toEqual(new Set(tilesInRange({ x: 10, y: 10 }, 1, [30, 30]).visible));
    expect(store.tile.mock.calls[0]![0]).toBe('wdtest');
  });

  it('puts each tile’s ground and objects in the scene', async () => {
    const { scene, streamer, groups } = setup();
    streamer.update(middleOf(10, 10));
    await flush();

    const terrainMeshes = scene.children.flatMap((child) => child.children).filter((c) => c instanceof Mesh);
    expect(terrainMeshes.length).toBeGreaterThanOrEqual(25);
    expect(groups.size).toBe(25);
    for (const group of groups.values()) expect(group.parent).toBe(scene);
  });

  it('counts a tile as loaded only once its ground textures have arrived', async () => {
    const { streamer, textures } = setup({ instantTextures: false });
    streamer.update(middleOf(10, 10));
    await flush();
    expect(streamer.loaded()).toEqual([]);

    textures.arrive();
    await flush();
    expect(new Set(streamer.loaded())).toEqual(
      new Set([...tilesInRange({ x: 10, y: 10 }, 1, [30, 30]).visible, ...tilesInRange({ x: 10, y: 10 }, 1, [30, 30]).preload]),
    );
  });

  it('resolves ready() once the visible tiles are on screen with their objects', async () => {
    const { streamer, textures } = setup({ instantTextures: false });
    streamer.update(middleOf(10, 10));
    let ready = false;
    void streamer.ready().then(() => (ready = true));
    await flush();
    expect(ready).toBe(false);

    textures.arrive();
    await flush();
    expect(ready).toBe(true);
  });

  it('draws flat ground at height 0 for a tile the world does not have, and says so on the overlay', async () => {
    const { streamer, overlay, scene } = setup({ missing: ['10_10'] });
    streamer.update(middleOf(10, 10));
    await flush();

    expect(streamer.loaded()).toContain('10_10');
    expect(streamer.heightAt(middleOf(10, 10))).toBe(0);
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toMatch(/10_10/);
    const placeholder = scene.getObjectByName('placeholder 10_10');
    expect(placeholder).toBeInstanceOf(Mesh);
    expect(placeholder!.position.y).toBe(0);
  });

  it('draws flat ground for a tile whose download failed, with the reason on the overlay', async () => {
    const { streamer, overlay, scene } = setup({ failing: ['11_10'] });
    streamer.update(middleOf(10, 10));
    await flush();

    expect(streamer.loaded()).toContain('11_10');
    expect(scene.getObjectByName('placeholder 11_10')).toBeDefined();
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toMatch(/11_10.*HTTP 503/);
  });

  it('gives the ground height under a position, from the tile it is on, in tile-local D3D coordinates', async () => {
    // tile 3_4: height = col + 2 * row (raw, no flags)
    const { streamer } = setup({ tile: (x, y) => makeTile(x, y, (col, row) => (x === 3 && y === 4 ? col + 2 * row : 0)) });
    streamer.update(middleOf(3, 4));
    await flush();

    // web x = 3 * 512 + 10 * 4 (col 10), web z = -(4 * 512 + 6 * 4) (row 6)
    expect(streamer.heightAt([3 * TILE_METERS + 40, 0, -(4 * TILE_METERS + 24)])).toBeCloseTo(10 + 12);
    // a tile not loaded (far away) has no height yet
    expect(streamer.heightAt(middleOf(20, 20))).toBeNull();
  });

  it('unloads what goes out of range: ground disposed, textures and objects given back, nothing asked twice', async () => {
    const { store, streamer, scene, objects, groups, textures } = setup();
    streamer.update(middleOf(10, 10));
    await flush();
    const disposed = vi.spyOn(TerrainTile.prototype, 'dispose');

    streamer.update(middleOf(12, 10));
    await flush();

    const now = tilesInRange({ x: 12, y: 10 }, 1, [30, 30]);
    const kept = new Set([...now.visible, ...now.preload]);
    const before = tilesInRange({ x: 10, y: 10 }, 1, [30, 30]);
    const dropped = [...before.visible, ...before.preload].filter((key) => !kept.has(key));
    expect(dropped).toHaveLength(10); // columns 8 and 9

    expect(disposed).toHaveBeenCalledTimes(10);
    expect(new Set(objects.releaseTile.mock.calls.map(([key]) => key))).toEqual(new Set(dropped));
    for (const key of dropped) expect(groups.get(key)!.parent).toBeNull();
    expect(textures.release).toHaveBeenCalledTimes(10);
    expect(new Set(streamer.loaded())).toEqual(kept);

    const asked = requested(store);
    expect(asked).toHaveLength(25 + 10);
    expect(new Set(asked).size).toBe(35);
    expect(scene.children.length).toBe(25 * 2);
    disposed.mockRestore();
  });

  it('drops a tile that went out of range before its download finished, once it arrives', async () => {
    const { streamer, scene, objects, release, textures } = setup({ held: ['8_10'] });
    streamer.update(middleOf(10, 10));
    await flush();
    streamer.update(middleOf(13, 10));
    await flush();
    const before = scene.children.length;

    release('8_10');
    await flush();

    expect(scene.children.length).toBe(before);
    expect(streamer.loaded()).not.toContain('8_10');
    expect(objects.place.mock.calls.some(([t]) => t.x === 8 && t.y === 10)).toBe(false);
    // the 14 tiles dropped that had arrived released their texture; 8_10 never acquired one
    expect(textures.acquire.mock.calls.length - textures.release.mock.calls.length).toBe(25);
  });

  it('gives back every tile, texture and GPU byte on dispose', async () => {
    const { streamer, scene, objects, textures, gpuBytes } = setup({ missing: ['10_10'] });
    streamer.update(middleOf(10, 10));
    await flush();
    expect(gpuBytes()).toBeGreaterThan(0);

    streamer.dispose();

    expect(scene.children).toHaveLength(0);
    expect(streamer.loaded()).toEqual([]);
    expect(objects.releaseTile).toHaveBeenCalledTimes(24);
    expect(textures.release).toHaveBeenCalledTimes(textures.acquire.mock.calls.length);
    expect(gpuBytes()).toBe(0);
  });
});
