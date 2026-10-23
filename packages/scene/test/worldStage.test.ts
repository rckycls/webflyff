import { MAP_SIZE } from '@flyffweb/formats';
import type { Vec3, WorldManifest } from '@flyffweb/formats';
import { AmbientLight, Color, DirectionalLight, Fog, SRGBColorSpace, Vector2, Vector3 } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SceneServices } from '../src/boot';
import { WorldStage } from '../src/world/WorldStage';

/** Madrigal's meters per unit: a tile is 512 m across. */
const MPU = 4;
const TILE_METERS = MAP_SIZE * MPU;

function makeManifest(fog = { start: 70, end: 400, density: 0 }): WorldManifest {
  return {
    name: 'WdTest',
    size: [30, 30],
    mpu: MPU,
    mapSize: 128,
    ambient: 0,
    bgColor: 0xff336699,
    fog,
    camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
    terrainTextures: [],
    models: [],
    tiles: {},
  };
}

/** The middle of tile (x, y), in web coordinates. */
function middleOf(x: number, y: number): Vec3 {
  return [(x + 0.5) * TILE_METERS, 0, -(y + 0.5) * TILE_METERS];
}

/** Services that can be had without a GPU: a renderer that only knows its size, a store with a world and no tiles. */
function fakeServices(manifest: () => Promise<WorldManifest>) {
  const canvas = { x: 1280, y: 720 };
  const drawn: { aspect: number; scene: Scene; camera: PerspectiveCamera }[] = [];
  const renderer = {
    getSize: (target: Vector2) => target.set(canvas.x, canvas.y),
    render: (scene: Scene, camera: PerspectiveCamera) => drawn.push({ aspect: camera.aspect, scene, camera }),
  };
  const overlay = { error: vi.fn(), addGpuBytes: vi.fn() };
  const store = { manifest: vi.fn(manifest), tile: vi.fn(async () => null), bytes: vi.fn() };
  const textures = { acquire: vi.fn(), release: vi.fn() };
  const loaders = { gltf: { parseAsync: vi.fn() }, ktx2: {} };
  const services = { renderer, store, loaders, textures, overlay } as unknown as SceneServices;
  return { services, canvas, drawn, overlay, store };
}

async function openStage(manifest = makeManifest(), radius = 1) {
  const fake = fakeServices(async () => manifest);
  const stage = await WorldStage.open('wdtest', fake.services, radius);
  return { stage, ...fake };
}

describe('WorldStage.open', () => {
  it('asks the store for the world by its web name and keeps its manifest', async () => {
    const manifest = makeManifest();
    const { stage, store } = await openStage(manifest);

    expect(store.manifest).toHaveBeenCalledWith('wdtest');
    expect(stage.manifest).toBe(manifest);
  });

  it('rejects when the manifest cannot be had', async () => {
    const { services } = fakeServices(() => Promise.reject(new Error('worlds/wdtest/manifest.json: 404')));

    await expect(WorldStage.open('wdtest', services, 1)).rejects.toThrow('worlds/wdtest/manifest.json: 404');
  });

  it('takes the sky and the fog from the manifest, and the far plane from the fog', async () => {
    const { stage } = await openStage(makeManifest({ start: 70, end: 400, density: 0 }));

    const sky = stage.scene.background as Color;
    expect(sky).toBeInstanceOf(Color);
    expect(sky.equals(new Color().setRGB(0x33 / 255, 0x66 / 255, 0x99 / 255, SRGBColorSpace))).toBe(true);
    const fog = stage.scene.fog as Fog;
    expect(fog).toBeInstanceOf(Fog);
    expect([fog.near, fog.far]).toEqual([70, 400]);
    expect(fog.color.equals(sky)).toBe(true);
    expect(stage.camera.far).toBe(400);
  });

  it('keeps the default far plane for a fog that ends before the near plane', async () => {
    const { stage } = await openStage(makeManifest({ start: 0, end: 0.1, density: 0 }));

    expect(stage.camera.far).toBe(1000);
  });

  it('lights the models with an ambient and a sun light of intensity pi', async () => {
    const { stage } = await openStage();

    const lights = stage.scene.children.filter(
      (child: Object3D) => child instanceof AmbientLight || child instanceof DirectionalLight,
    ) as (AmbientLight | DirectionalLight)[];
    expect(lights.map((light) => light.constructor)).toEqual([AmbientLight, DirectionalLight]);
    expect(lights.map((light) => light.intensity)).toEqual([Math.PI, Math.PI]);
  });
});

describe('WorldStage camera', () => {
  it('looks from the position at the target', async () => {
    const { stage } = await openStage();

    stage.setCamera([10, 20, 30], [10, 20, 0]);

    expect(stage.camera.position.toArray()).toEqual([10, 20, 30]);
    const direction = stage.camera.getWorldDirection(new Vector3());
    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.y).toBeCloseTo(0, 6);
    expect(direction.z).toBeCloseTo(-1, 6);
  });

  it('draws the scene with the camera, at the aspect ratio the canvas has when it draws', async () => {
    const { stage, canvas, drawn } = await openStage();

    stage.render();
    canvas.x = 800;
    canvas.y = 400;
    stage.render();
    canvas.y = 0;
    stage.render();

    expect(drawn.map((frame) => frame.aspect)).toEqual([1280 / 720, 2, 1]);
    expect(drawn.every((frame) => frame.scene === stage.scene && frame.camera === stage.camera)).toBe(true);
  });
});

describe('WorldStage tiles', () => {
  it('streams the tiles around the focus, and stands them on flat ground where the world has none', async () => {
    const { stage, overlay } = await openStage();
    const here = middleOf(5, 7);

    expect(stage.loadedTiles()).toEqual([]);
    stage.focus(here);
    // the tile is asked for, not here yet
    expect(stage.heightAt(here)).toBeNull();
    await stage.ready();

    const visible = [];
    for (let y = 6; y <= 8; y++) for (let x = 4; x <= 6; x++) visible.push(`${x}_${y}`);
    expect(stage.loadedTiles()).toEqual(expect.arrayContaining(visible));
    expect(stage.counts()).toEqual({ tiles: stage.loadedTiles().length, models: 0 });
    expect(stage.heightAt(here)).toBe(0);
    expect(overlay.error).toHaveBeenCalledWith('tile 5_7: not in the world manifest; showing flat ground');
  });

  it('follows the focus: tiles that left the range go', async () => {
    const { stage } = await openStage(makeManifest(), 0);

    stage.focus(middleOf(5, 7));
    await stage.ready();
    expect(stage.loadedTiles()).toContain('5_7');
    stage.focus(middleOf(20, 20));
    await stage.ready();

    expect(stage.loadedTiles()).toContain('20_20');
    expect(stage.loadedTiles()).not.toContain('5_7');
  });

  it('gives its tiles back on dispose', async () => {
    const { stage } = await openStage();
    stage.focus(middleOf(5, 7));
    await stage.ready();
    expect(stage.scene.children.some((child) => child.name.startsWith('placeholder'))).toBe(true);

    stage.dispose();

    expect(stage.loadedTiles()).toEqual([]);
    expect(stage.scene.children.some((child) => child.name.startsWith('placeholder'))).toBe(false);
  });
});
