import { MAP_SIZE, NUM_PATCHES_PER_SIDE } from '@flyffweb/formats';
import type { WebTile, WebTileObject, WorldManifest } from '@flyffweb/formats';
import type { Object3D } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  AdditiveBlending,
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { geometryBytes } from '../src/overlay/gpuMemory';
import { LOD_DISTANCES, ObjectPool } from '../src/world/objects';

const SIDE = MAP_SIZE + 1;
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;
const NO_MODEL = 0xffff;

function triangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  return geometry;
}

function standard(texture: string | null, extras: Record<string, unknown> = {}): MeshStandardMaterial {
  const material = new MeshStandardMaterial();
  material.userData = { texture, effect: 0, ...extras };
  return material;
}

function named<T extends Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

/** The scenes GLTFLoader would give for the models of the test world, by logical key. */
const SCENES: Record<string, () => Group> = {
  // one LOD, one primitive: the node is the mesh
  'models/obj_box.glb': () => {
    const scene = new Group();
    scene.add(named(new Mesh(triangle(), standard('textures/box.ktx2')), 'lod0'));
    return scene;
  },
  // three LODs
  'models/obj_tree.glb': () => {
    const scene = new Group();
    for (const lod of ['lod0', 'lod1', 'lod2']) scene.add(named(new Mesh(triangle(), standard('textures/tree.ktx2')), lod));
    return scene;
  },
  // skinned lod0 with a static child, an animated object of two primitives (a group) and one hung from a bone
  'models/obj_windmill.glb': () => {
    const scene = new Group();
    const joints = named(new Group(), 'skeleton');
    const bone = named(new Bone(), 'bone0');
    bone.position.set(0, 10, 0);
    joints.add(bone);
    scene.add(joints);
    scene.updateMatrixWorld(true);

    const geometry = triangle();
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(12).fill(0.25), 4));
    const skinned = named(new SkinnedMesh(geometry, standard('textures/mill.ktx2')), 'lod0');
    skinned.bind(new Skeleton([bone], [new Matrix4().makeTranslation(0, -10, 0)]), new Matrix4());
    scene.add(skinned);
    skinned.add(named(new Mesh(triangle(), standard('textures/mill.ktx2')), 'lod0_static'));
    const blades = named(new Group(), 'lod0_2');
    blades.position.set(0, 5, 0);
    blades.add(named(new Mesh(triangle(), standard('textures/blade.ktx2')), 'lod0_2_mesh'));
    blades.add(named(new Mesh(triangle(), standard('textures/mill.ktx2')), 'lod0_2_mesh_1'));
    skinned.add(blades);
    const flag = named(new Mesh(triangle(), standard(null)), 'lod0_3');
    flag.position.set(1, 0, 0);
    bone.add(flag);
    return scene;
  },
  'models/obj_lamp.glb': () => {
    const scene = new Group();
    scene.add(named(new Mesh(triangle(), standard('textures/glow.ktx2', { light: true })), 'lod0'));
    return scene;
  },
};

const MODELS = Object.keys(SCENES).concat('models/obj_broken.glb');
const BOX = MODELS.indexOf('models/obj_box.glb');
const TREE = MODELS.indexOf('models/obj_tree.glb');
const WINDMILL = MODELS.indexOf('models/obj_windmill.glb');
const LAMP = MODELS.indexOf('models/obj_lamp.glb');
const BROKEN = MODELS.indexOf('models/obj_broken.glb');

const manifest: WorldManifest = {
  name: 'WdTest',
  size: [4, 4],
  mpu: 4,
  mapSize: 128,
  ambient: 0,
  bgColor: 0,
  fog: { start: 70, end: 400, density: 0 },
  camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
  terrainTextures: [],
  models: MODELS,
  tiles: {},
};

function at(model: number, x: number, y: number, z: number, rotationY = 0): WebTileObject {
  const matrix = new Matrix4().makeRotationY(rotationY).setPosition(x, y, z);
  return { model, matrix: Float32Array.from(matrix.elements) };
}

function makeTile(x: number, y: number, objects: WebTileObject[]): WebTile {
  return {
    x,
    y,
    heights: new Float32Array(SIDE * SIDE),
    water: new Uint8Array(PATCHES * 2),
    landAttr: new Uint8Array(PATCHES),
    layers: [],
    objects,
  };
}

function setup() {
  const store = {
    bytes: vi.fn(async (key: string) => new TextEncoder().encode(key)),
  };
  const gltf = {
    parseAsync: vi.fn(async (buffer: ArrayBuffer) => {
      const key = new TextDecoder().decode(buffer);
      const scene = SCENES[key];
      if (scene === undefined) throw new Error(`${key}: not a glb`);
      return { scene: scene(), animations: [] };
    }),
  };
  const texture = new Texture();
  const cache = {
    acquire: vi.fn(async (_key: string | null) => texture),
    release: vi.fn((_key: string | null) => {}),
  };
  const overlay = { error: vi.fn((_message: string) => {}), addGpuBytes: vi.fn((_n: number) => {}) };
  // the fake gives what ObjectPool reads of a GLTF (its scene), not a whole one
  const pool = new ObjectPool(store, { gltf: gltf as unknown as Pick<GLTFLoader, 'parseAsync'> }, cache, overlay);
  const gpuBytes = () => overlay.addGpuBytes.mock.calls.reduce((sum, [n]) => sum + n, 0);
  return { store, gltf, cache, overlay, pool, texture, gpuBytes };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The instanced meshes of a tile's group. */
function instancesOf(group: Group): InstancedMesh[] {
  for (const child of group.children) expect(child).toBeInstanceOf(InstancedMesh);
  return group.children as InstancedMesh[];
}

function matrixAt(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

function positionAt(mesh: InstancedMesh, index: number): number[] {
  return new Vector3().setFromMatrixPosition(matrixAt(mesh, index)).toArray();
}

/** Which of a tile's instanced meshes are drawn. */
const shown = (group: Group): boolean[] => instancesOf(group).map((mesh) => mesh.visible);

// A tile is 512 m across (mpu 4): tile 0_0 spans web x 0 to 512 and z -512 to 0.
describe('ObjectPool', () => {
  it('draws each model of a tile as one instanced mesh, every object at its matrix, skipping those without a model', async () => {
    const { pool } = setup();
    const group = await pool.place(
      makeTile(1, 2, [at(BOX, 10, 1, -20), at(NO_MODEL, 0, 0, 0), at(BOX, 30, 5, -40, Math.PI / 2)]),
      manifest,
    );

    const [box] = instancesOf(group);
    expect(group.children).toHaveLength(1);
    expect(box!.count).toBe(2);
    expect(Array.from(matrixAt(box!, 0).elements)).toEqual(Array.from(new Matrix4().setPosition(10, 1, -20).elements));
    const turned = new Matrix4().makeRotationY(Math.PI / 2).setPosition(30, 5, -40);
    // the tile stores float32 matrices
    matrixAt(box!, 1).elements.forEach((v, i) => expect(v).toBeCloseTo(turned.elements[i]!, 5));
    // culled as a whole: its bounds hold every instance
    expect(box!.boundingSphere!.containsPoint(new Vector3(30, 5, -40))).toBe(true);
    expect(box!.boundingSphere!.containsPoint(new Vector3(10, 1, -20))).toBe(true);
  });

  it('loads each model once per world, however many objects and tiles use it', async () => {
    const { pool, store, gltf } = setup();
    await pool.place(makeTile(0, 0, [at(BOX, 1, 0, -1), at(BOX, 2, 0, -2), at(TREE, 3, 0, -3)]), manifest);
    await pool.place(makeTile(1, 0, [at(BOX, 600, 0, -1)]), manifest);

    expect(store.bytes.mock.calls.map(([key]) => key).sort()).toEqual(['models/obj_box.glb', 'models/obj_tree.glb']);
    expect(gltf.parseAsync).toHaveBeenCalledTimes(2);
    expect(pool.modelCount()).toBe(2);
  });

  it('switches a model with lod1 and lod2 per tile at 0, 100 and 200 m from the camera to the tile', async () => {
    const { pool } = setup();
    const group = await pool.place(makeTile(0, 0, [at(TREE, 5, 0, -5), at(TREE, 500, 0, -500)]), manifest);
    expect(LOD_DISTANCES).toEqual([0, 100, 200]);
    expect(instancesOf(group).map((mesh) => mesh.count)).toEqual([2, 2, 2]);

    // lod0 until the camera is known
    expect(shown(group)).toEqual([true, false, false]);
    // on the tile, however far from its middle or its objects: full detail
    pool.update([510, 30, -2]);
    expect(shown(group)).toEqual([true, false, false]);
    // 150 m east of the tile's edge
    pool.update([662, 30, -256]);
    expect(shown(group)).toEqual([false, true, false]);
    // 250 m north (web -z) of its far edge
    pool.update([256, 30, -762]);
    expect(shown(group)).toEqual([false, false, true]);
    pool.update([-99, 30, 0]);
    expect(shown(group)).toEqual([true, false, false]);
  });

  it('always draws a model without LODs', async () => {
    const { pool } = setup();
    const group = await pool.place(makeTile(0, 0, [at(BOX, 5, 0, -5)]), manifest);
    pool.update([5000, 0, 5000]);
    expect(shown(group)).toEqual([true]);
  });

  it('draws skinned meshes in their bind pose as plain meshes, with the _static and _<j> children', async () => {
    const { pool } = setup();
    const group = await pool.place(makeTile(0, 0, [at(WINDMILL, 100, 20, -100)]), manifest);

    const meshes = instancesOf(group);
    expect(meshes).toHaveLength(5);
    expect(meshes.some((mesh) => (mesh as unknown as SkinnedMesh).isSkinnedMesh === true)).toBe(false);
    expect(meshes.some((mesh) => mesh.geometry.hasAttribute('skinWeight'))).toBe(false);
    const positions = meshes.map((mesh) => positionAt(mesh, 0));
    // skin and static child at the object; the animated group 5 up; the object hung from the bone at bone + 1
    expect(positions.filter((p) => p[0] === 100 && p[1] === 20 && p[2] === -100)).toHaveLength(2);
    expect(positions.filter((p) => p[0] === 100 && p[1] === 25 && p[2] === -100)).toHaveLength(2);
    expect(positions).toContainEqual([101, 30, -100]);
  });

  it('lights models as the fixed-function pipeline does (Lambert), and light objects additively, unlit', async () => {
    const { pool, texture } = setup();
    const group = await pool.place(makeTile(0, 0, [at(BOX, 0, 0, 0), at(LAMP, 0, 0, 0)]), manifest);

    const [box, lamp] = instancesOf(group);
    expect(box!.material).toBeInstanceOf(MeshLambertMaterial);
    expect((box!.material as MeshLambertMaterial).map).toBe(texture);
    const glow = lamp!.material as MeshBasicMaterial;
    expect(glow).toBeInstanceOf(MeshBasicMaterial);
    expect(glow.blending).toBe(AdditiveBlending);
    expect(glow.depthWrite).toBe(false);
    expect(glow.map).toBe(texture);
  });

  it('gets textures through the cache once per model, and gives everything back with the last tile', async () => {
    const { pool, cache, gpuBytes } = setup();
    const first = await pool.place(makeTile(0, 0, [at(BOX, 1, 0, -1), at(BOX, 2, 0, -2)]), manifest);
    const geometry = instancesOf(first)[0]!.geometry;
    await pool.place(makeTile(1, 0, [at(BOX, 600, 0, -1)]), manifest);
    const disposed = vi.spyOn(geometry, 'dispose');

    expect(cache.acquire.mock.calls.map(([key]) => key)).toEqual(['textures/box.ktx2']);
    // the geometry once, and an instance matrix (16 floats) per object
    expect(gpuBytes()).toBe(geometryBytes(geometry) + 3 * 64);

    pool.releaseTile('0_0');
    expect(cache.release).not.toHaveBeenCalled();
    expect(pool.modelCount()).toBe(1);
    expect(gpuBytes()).toBe(geometryBytes(geometry) + 64);

    pool.releaseTile('1_0');
    expect(cache.release.mock.calls.map(([key]) => key)).toEqual(['textures/box.ktx2']);
    expect(disposed).toHaveBeenCalled();
    expect(pool.modelCount()).toBe(0);
    expect(gpuBytes()).toBe(0);
  });

  it('empties the group of a released tile and frees its instance buffers', async () => {
    const { pool } = setup();
    const group = await pool.place(makeTile(0, 0, [at(BOX, 1, 0, -1), at(TREE, 2, 0, -2)]), manifest);
    const disposed = instancesOf(group).map((mesh) => vi.spyOn(mesh, 'dispose'));
    pool.releaseTile('0_0');

    expect(group.children).toHaveLength(0);
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('gives back the models of a tile released before they arrived', async () => {
    const { pool, cache, gpuBytes } = setup();
    const placed = pool.place(makeTile(0, 0, [at(BOX, 1, 0, -1)]), manifest);
    pool.releaseTile('0_0');
    const group = await placed;
    await flush();

    expect(group.children).toHaveLength(0);
    expect(heldKeys(cache.release)).toEqual(heldKeys(cache.acquire));
    expect(pool.modelCount()).toBe(0);
    expect(gpuBytes()).toBe(0);
  });

  it('reports a model that cannot be loaded and places the other objects', async () => {
    const { pool, overlay } = setup();
    const group = await pool.place(makeTile(0, 0, [at(BROKEN, 1, 0, -1), at(BOX, 2, 0, -2)]), manifest);

    expect(group.children).toHaveLength(1);
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toMatch(/models\/obj_broken\.glb/);
  });

  it('gives back every model on dispose', async () => {
    const { pool, cache, gpuBytes } = setup();
    await pool.place(makeTile(0, 0, [at(BOX, 1, 0, -1), at(TREE, 2, 0, -2), at(WINDMILL, 3, 0, -3)]), manifest);
    pool.dispose();

    expect(heldKeys(cache.release)).toEqual(heldKeys(cache.acquire));
    expect(pool.modelCount()).toBe(0);
    expect(gpuBytes()).toBe(0);
  });
});

/** The texture keys a cache mock was called with, sorted, without null (the checkerboard, which is never held). */
function heldKeys(mock: { mock: { calls: [string | null][] } }): string[] {
  return mock.mock.calls.flatMap(([key]) => (key === null ? [] : [key])).sort();
}
