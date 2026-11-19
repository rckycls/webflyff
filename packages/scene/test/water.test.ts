import { MAP_SIZE, NUM_PATCHES_PER_SIDE } from '@flyffweb/formats';
import type { WebTerrainWater, WebTile, WorldManifest } from '@flyffweb/formats';
import type { BufferGeometry, Mesh, ShaderMaterial } from 'three';
import { DoubleSide, Group, PerspectiveCamera, Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { WaterSurfaces, buildWaterGeometry, cloudScroll, waterFrame } from '../src/world/water';

const SIDE = MAP_SIZE + 1;
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;

/** A tile whose patches have the given `[byWaterHeight, byWaterTexture]`, and the ground at `ground` (col, row). */
function makeTile(water: Record<number, [number, number]>, x = 0, y = 0, ground: (col: number, row: number) => number = () => 0): WebTile {
  const bytes = new Uint8Array(PATCHES * 2);
  for (const [patch, [height, texture]] of Object.entries(water)) {
    bytes[Number(patch) * 2] = height;
    bytes[Number(patch) * 2 + 1] = texture;
  }
  const heights = new Float32Array(SIDE * SIDE);
  for (let row = 0; row < SIDE; row++) for (let col = 0; col < SIDE; col++) heights[row * SIDE + col] = ground(col, row);
  return { x, y, heights, water: bytes, landAttr: new Uint8Array(PATCHES), layers: [], objects: [] };
}

const manifest = (mpu = 4): WorldManifest => ({
  name: 'test',
  size: [30, 30],
  mpu,
  mapSize: 128,
  ambient: 0,
  bgColor: 0,
  fog: { start: 70, end: 400, density: 0 },
  camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
  terrainTextures: [],
  models: [],
  tiles: {},
});

const points = (geometry: BufferGeometry, name: 'position' | 'uv' | 'layer'): number[][] => {
  const attribute = geometry.getAttribute(name);
  return Array.from({ length: attribute.count }, (_, i) =>
    Array.from({ length: attribute.itemSize }, (_, k) => attribute.array[i * attribute.itemSize + k]!),
  );
};

describe('buildWaterGeometry', () => {
  it('puts a water quad over each WTYPE_WATER patch at its byWaterHeight, with three texture repeats (lod.cpp:437-503)', () => {
    // patch 17 is column 1, row 1; list 1 is byWaterTexture 6
    const { water, cloud } = buildWaterGeometry(makeTile({ 17: [84, 6] }, 2, 3), 4);
    expect(cloud).toBeNull();
    expect([...water.keys()]).toEqual([1]);
    const geometry = water.get(1)!;
    const positions = points(geometry, 'position');
    expect(positions).toHaveLength(6);
    // a patch is 8 cells of 4 m; tile (2, 3) starts at x 1024, D3D z 1536 (web z -1536)
    const x0 = 2 * MAP_SIZE * 4 + 32;
    const z0 = 3 * MAP_SIZE * 4 + 32;
    expect(positions).toEqual([
      [x0, 84, -z0],
      [x0, 84, -(z0 + 32)],
      [x0 + 32, 84, -z0],
      [x0, 84, -(z0 + 32)],
      [x0 + 32, 84, -z0],
      [x0 + 32, 84, -(z0 + 32)],
    ]);
    expect(points(geometry, 'uv')).toEqual([
      [0, 0],
      [0, 3],
      [3, 0],
      [0, 3],
      [3, 0],
      [3, 3],
    ]);
  });

  it('keeps one geometry per water list, and leaves out patches of no water', () => {
    const { water } = buildWaterGeometry(makeTile({ 0: [10, 2], 1: [12, 2], 2: [99, 6], 3: [50, 0], 4: [50, 3] }), 4);
    expect([...water.keys()].sort()).toEqual([0, 1]);
    expect(water.get(0)!.getAttribute('position').count).toBe(12);
    expect(water.get(1)!.getAttribute('position').count).toBe(6);
  });

  it('puts two cloud quads, at 40 and 80 m, over each WTYPE_CLOUD patch, one texture repeat, whatever its height byte (lod.cpp:507-583, :1050-1061)', () => {
    const { water, cloud } = buildWaterGeometry(makeTile({ 255: [80, 1], 0: [0, 1] }), 2);
    expect(water.size).toBe(0);
    const positions = points(cloud!, 'position');
    expect(positions).toHaveLength(24);
    // every quad at 40 m first, then every quad at 80 m: the lower layer is drawn first
    expect(positions.slice(0, 12).every((p) => p[1] === 40)).toBe(true);
    expect(positions.slice(12).every((p) => p[1] === 80)).toBe(true);
    expect(points(cloud!, 'layer').map(([layer]) => layer)).toEqual([...Array(12).fill(0), ...Array(12).fill(1)]);
    expect(positions[6]).toEqual([15 * 16, 40, -(15 * 16)]);
    expect(positions[11]).toEqual([16 * 16, 40, -(16 * 16)]);
    expect(points(cloud!, 'uv')[11]).toEqual([1, 1]);
  });

  it('leaves out a quad the ground covers on the whole patch, which the opaque ground hides anyway', () => {
    // patch 0 (cols and rows 0-8) has ground at 50 m but for col 8, patch 1 (cols 8-16) at 100 m but for col 8 (90 m)
    const ground = (col: number): number => (col < 8 ? 50 : col === 8 ? 90 : 100);
    const tile = makeTile({ 0: [60, 2], 1: [60, 2], 16: [0, 1], 17: [0, 1] }, 0, 0, ground);
    const { water, cloud } = buildWaterGeometry(tile, 4);
    // the water at 60 m: over patch 0 (ground 50-90), not over patch 1 (ground 90-100)
    expect(points(water.get(0)!, 'position').map((p) => p[0])).toEqual([0, 0, 32, 0, 32, 32]);
    // the clouds: patch 16 (ground 50-90) has its 80 m quad only; patch 17 (90-100) none
    const positions = points(cloud!, 'position');
    expect(positions).toHaveLength(6);
    expect(positions.every((p) => p[1] === 80 && p[0] <= 32)).toBe(true);
  });

  it('gives nothing for a tile without water bytes', () => {
    const tile = makeTile({});
    const { water, cloud } = buildWaterGeometry({ ...tile, water: new Uint8Array(0) }, 4);
    expect(water.size).toBe(0);
    expect(cloud).toBeNull();
  });
});

describe('waterFrame', () => {
  it('steps 0.15 frames a 60 Hz tick and starts again after the last frame (World.cpp:953-962)', () => {
    expect(waterFrame(0, 54)).toBe(0);
    expect(waterFrame(6 * (1000 / 60), 54)).toBe(0); // 0.9
    expect(waterFrame(7 * (1000 / 60), 54)).toBe(1); // 1.05
    expect(waterFrame(1000, 54)).toBe(9); // 60 ticks: 9 frames a second
    expect(waterFrame(359 * (1000 / 60), 54)).toBe(53);
    expect(waterFrame(360 * (1000 / 60), 54)).toBe(0); // 6 seconds a round
    expect(waterFrame(1000, 1)).toBe(0);
  });
});

describe('cloudScroll', () => {
  it('moves the two layers 0.001 and 0.0015 a 60 Hz frame for each land drawn with cloud (lod.cpp:1065-1068)', () => {
    const [a, b] = cloudScroll(1000, 2);
    expect(a).toBeCloseTo(0.12);
    expect(b).toBeCloseTo(0.18);
    expect(cloudScroll(1000, 0)).toEqual([0, 0]);
  });
});

describe('WaterSurfaces', () => {
  const catalog: WebTerrainWater = { water: [['a0', 'a1', 'a2'], ['b0']], cloud: 'c' };

  /** A texture cache that hands out one texture per key, and counts what is held. */
  function fakeTextures() {
    const held = new Map<string | null, number>();
    const made = new Map<string | null, Texture>();
    return {
      held,
      made,
      acquire: (key: string | null): Promise<Texture> => {
        held.set(key, (held.get(key) ?? 0) + 1);
        if (!made.has(key)) made.set(key, new Texture());
        return Promise.resolve(made.get(key)!);
      },
      release: (key: string | null): void => {
        held.set(key, (held.get(key) ?? 0) - 1);
      },
    };
  }

  it('builds a tile of water meshes that show once their list is in, and animates them by the clock', async () => {
    const textures = fakeTextures();
    const prepared: Texture[] = [];
    const surfaces = new WaterSurfaces(catalog, textures, (t) => prepared.push(t));
    const tile = surfaces.tile(makeTile({ 0: [30, 2], 1: [30, 1] }), manifest())!;
    expect(tile).not.toBeNull();
    await tile.ready;
    // list 0 and the cloud sea: one water mesh, one cloud mesh holding both layers
    const meshes = tile.group.children as Mesh[];
    expect(meshes.map((m) => m.name).sort()).toEqual(['cloud 0_0', 'water 0_0 list 0']);
    for (const mesh of meshes) {
      const material = mesh.material as ShaderMaterial;
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(true);
      expect(material.side).toBe(DoubleSide);
      // stage 0's alpha: the vertices' 0xaa times the texture factor's 200 (lod.cpp:445, :961-965)
      expect(material.uniforms.uAlpha!.value).toBeCloseTo((0xaa / 255) * (200 / 255));
    }
    // only list 0's frames and the cloud are fetched, each once
    expect([...textures.held.keys()].sort()).toEqual(['a0', 'a1', 'a2', 'c']);
    expect(prepared).toHaveLength(4);

    const water = meshes.find((m) => m.name.startsWith('water'))!;
    const uniform = (water.material as ShaderMaterial).uniforms.uTexture!;
    const scene = new Scene();
    scene.add(tile.group);
    const camera = new PerspectiveCamera();
    surfaces.update(0, camera);
    expect(uniform.value).toBe(textures.made.get('a0'));
    surfaces.update(14 * (1000 / 60), camera); // 2.1
    expect(uniform.value).toBe(textures.made.get('a2'));

    tile.dispose();
    expect(tile.group.children).toHaveLength(0);
    surfaces.dispose();
    expect([...textures.held.values()].every((n) => n === 0)).toBe(true);
  });

  it('gives no tile for a tile without water, and skips a list Terrain.inc does not have (lod.cpp:429)', () => {
    const surfaces = new WaterSurfaces(catalog, fakeTextures());
    expect(surfaces.tile(makeTile({}), manifest())).toBeNull();
    expect(surfaces.tile(makeTile({ 0: [30, 2 + (5 << 2)] }), manifest())).toBeNull();
  });

  it('gives no tiles without a catalog', () => {
    const surfaces = new WaterSurfaces(null, fakeTextures());
    expect(surfaces.tile(makeTile({ 0: [30, 2] }), manifest())).toBeNull();
  });

  it('scrolls the cloud sea only for tiles that are in the scene', async () => {
    const surfaces = new WaterSurfaces(catalog, fakeTextures());
    const tile = surfaces.tile(makeTile({ 0: [0, 1] }), manifest())!;
    await tile.ready;
    const cloud = (tile.group.children as Mesh[]).find((m) => m.name.startsWith('cloud'))!;
    const offset = (cloud.material as ShaderMaterial).uniforms.uOffset!.value as { x: number; y: number };
    const offset2 = (cloud.material as ShaderMaterial).uniforms.uOffset2!.value as { x: number; y: number };
    const camera = new PerspectiveCamera(45, 1, 0.5, 1000);
    camera.position.set(16, 100, -16);
    camera.lookAt(16, 0, -16.01);
    surfaces.update(0, camera);
    surfaces.update(1000, camera); // not in a scene: no scroll
    expect(offset.x).toBe(0);
    const scene = new Scene();
    scene.add(new Group().add(tile.group));
    surfaces.update(2000, camera);
    expect(offset.x).toBeCloseTo(0.06);
    expect(offset.y).toBeCloseTo(0.06);
    expect(offset2.x).toBeCloseTo(0.09);
  });
});
