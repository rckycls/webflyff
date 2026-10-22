import { MAP_SIZE, NUM_PATCHES_PER_SIDE, PATCH_SIZE } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import type { BufferGeometry, Mesh, ShaderMaterial } from 'three';
import { ClampToEdgeWrapping, DataTexture, LinearFilter, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { geometryBytes } from '../src/overlay/gpuMemory';
import { sampleHeight } from '../src/world/heightSampler';
import { TerrainLighting, TerrainTile } from '../src/world/TerrainTile';
import { buildTerrainGeometry, layerIndices } from '../src/world/terrainGeometry';

const SIDE = MAP_SIZE + 1;
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;
const INDICES_PER_PATCH = PATCH_SIZE * PATCH_SIZE * 2 * 3;
const LIGHT_BYTES = MAP_SIZE * MAP_SIZE * 4;

interface TileOptions {
  x?: number;
  y?: number;
  /** The raw height of the vertex at (col, row). */
  height?: (col: number, row: number) => number;
  /** Per layer: its texture index and the patches it covers. */
  layers?: { texture: number; patches: 'all' | number[] }[];
}

function makeTile({ x = 0, y = 0, height = () => 0, layers = [] }: TileOptions = {}): WebTile {
  const heights = new Float32Array(SIDE * SIDE);
  for (let row = 0; row < SIDE; row++) for (let col = 0; col < SIDE; col++) heights[row * SIDE + col] = height(col, row);
  return {
    x,
    y,
    heights,
    water: new Uint8Array(PATCHES * 2),
    landAttr: new Uint8Array(PATCHES),
    layers: layers.map(({ texture, patches }) => {
      const patchEnable = new Uint8Array(PATCHES);
      if (patches === 'all') patchEnable.fill(1);
      else for (const p of patches) patchEnable[p] = 1;
      return { texture, patchEnable, light: new Uint8Array(LIGHT_BYTES).fill(128) };
    }),
    objects: [],
  };
}

function makeManifest(mpu: number, textures: string[]): WorldManifest {
  return {
    name: 'test',
    size: [30, 30],
    mpu,
    mapSize: 128,
    ambient: 0,
    bgColor: 0,
    fog: { start: 70, end: 400, density: 0 },
    camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
    terrainTextures: textures,
    models: [],
    tiles: {},
  };
}

/** `[x, y, z]` of vertex `index`. */
function vertex(geometry: BufferGeometry, index: number): number[] {
  const position = geometry.getAttribute('position');
  return [position.getX(index), position.getY(index), position.getZ(index)];
}

describe('buildTerrainGeometry', () => {
  it('has 129 x 129 vertices, the first at the tile corner and the last at the opposite one', () => {
    const tile = makeTile({ x: 2, y: 3, height: () => 1012.5 });
    const geometry = buildTerrainGeometry(tile, 4);
    expect(geometry.getAttribute('position').count).toBe(16641);
    expect(vertex(geometry, 0)).toEqual([1024, 12.5, -1536]);
    expect(vertex(geometry, 16640)).toEqual([1536, 12.5, -2048]);
  });

  it('puts vertex (col, row) at +x for col and -z for row, with the height cleaned of its flag', () => {
    const tile = makeTile({ x: 1, y: 2, height: (col, row) => (col === 5 && row === 7 ? 3000 + 9.25 : 2) });
    const geometry = buildTerrainGeometry(tile, 2);
    expect(vertex(geometry, 7 * SIDE + 5)).toEqual([(128 + 5) * 2, 9.25, -((256 + 7) * 2)]);
    expect(vertex(geometry, 7 * SIDE + 6)[1]).toBe(2);
  });

  it('gives the texture 3 repeats per patch and the light map the half-texel-offset uv of lod.cpp:760-763', () => {
    const geometry = buildTerrainGeometry(makeTile(), 4);
    const uv = geometry.getAttribute('uv');
    const uv1 = geometry.getAttribute('uv1');
    const at = 17 * SIDE + 9; // col 9, row 17
    expect([uv.getX(at), uv.getY(at)]).toEqual([(9 / PATCH_SIZE) * 3, (17 / PATCH_SIZE) * 3]);
    // fTemp2 = (1 / 128) * 7 * 16 / 128 = 7 / 1024, fTemp / 2 = 1 / 256
    expect([uv1.getX(at), uv1.getY(at)]).toEqual([(7 / 1024) * 9 + 1 / 256, (7 / 1024) * 17 + 1 / 256]);
    // the first vertex samples the middle of the first light texel
    expect([uv1.getX(0), uv1.getY(0)]).toEqual([0.5 / 128, 0.5 / 128]);
    // the C++ restarts the texture uv in every patch; whole repeats later the sample is the same
    const nextPatch = 8; // col 8: C++ patch 0 has 3.0, patch 1 has 0.0
    expect(uv.getX(nextPatch) % 1).toBe(0);
  });

  it('has normals of length 1 that point up on a flat tile', () => {
    const geometry = buildTerrainGeometry(makeTile({ height: () => 1005 }), 4);
    const normal = geometry.getAttribute('normal');
    for (const i of [0, 1, 130, 8000, 16640]) {
      expect([normal.getX(i), normal.getY(i), normal.getZ(i)]).toEqual([0, 1, 0]);
    }
  });

  it('tips the normals away from the slope, in the web frame', () => {
    // Height rises with col (toward +x): the ground faces -x. Height rises with row (toward -z): it faces +z.
    const east = buildTerrainGeometry(makeTile({ height: (col) => col }), 1);
    const eastNormal = new Vector3().fromBufferAttribute(east.getAttribute('normal'), 64 * SIDE + 64);
    expect(eastNormal.x).toBeCloseTo(-Math.SQRT1_2);
    expect(eastNormal.y).toBeCloseTo(Math.SQRT1_2);
    expect(eastNormal.z).toBeCloseTo(0);

    const south = buildTerrainGeometry(makeTile({ height: (_col, row) => row }), 1);
    const southNormal = new Vector3().fromBufferAttribute(south.getAttribute('normal'), 64 * SIDE + 64);
    expect(southNormal.x).toBeCloseTo(0);
    expect(southNormal.y).toBeCloseTo(Math.SQRT1_2);
    expect(southNormal.z).toBeCloseTo(Math.SQRT1_2);
  });

  it('computes the normals from cleaned heights, so a flag does not tilt them', () => {
    const geometry = buildTerrainGeometry(makeTile({ height: (col) => (col >= 60 ? 2000 + 5 : 5) }), 4);
    const normal = geometry.getAttribute('normal');
    const at = 64 * SIDE + 64;
    expect([normal.getX(at), normal.getY(at), normal.getZ(at)]).toEqual([0, 1, 0]);
  });
});

describe('layerIndices', () => {
  it('has 8 x 8 quads of 2 triangles for every enabled patch', () => {
    expect(layerIndices(new Uint8Array(PATCHES).fill(1)).length).toBe(PATCHES * INDICES_PER_PATCH);
    expect(layerIndices(new Uint8Array(PATCHES)).length).toBe(0);
  });

  it('keeps patch 0 to rows 0-8 and cols 0-8', () => {
    const enable = new Uint8Array(PATCHES);
    enable[0] = 1;
    const indices = layerIndices(enable);
    expect(indices.length).toBe(INDICES_PER_PATCH);
    for (const index of indices) {
      expect(Math.floor(index / SIDE)).toBeLessThanOrEqual(8);
      expect(index % SIDE).toBeLessThanOrEqual(8);
    }
    expect(Math.max(...indices)).toBe(8 * SIDE + 8);
  });

  it('numbers patches X + Y * 16: patch 17 is col 8-16, row 8-16', () => {
    const enable = new Uint8Array(PATCHES);
    enable[17] = 1;
    const cols = new Set<number>();
    const rows = new Set<number>();
    for (const index of layerIndices(enable)) {
      cols.add(index % SIDE);
      rows.add(Math.floor(index / SIDE));
    }
    expect([Math.min(...cols), Math.max(...cols)]).toEqual([8, 16]);
    expect([Math.min(...rows), Math.max(...rows)]).toEqual([8, 16]);
  });

  it('draws every vertex of an enabled patch (9 x 9) and covers it without gaps or overlaps', () => {
    const enable = new Uint8Array(PATCHES);
    enable[255] = 1;
    const indices = layerIndices(enable);
    expect(new Set(indices).size).toBe(81);

    const geometry = buildTerrainGeometry(makeTile(), 1);
    let area = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new Vector3(...vertex(geometry, indices[t + k]!)));
      area += new Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!)).length() / 2;
    }
    expect(area).toBeCloseTo(64);
  });

  it('winds every triangle counter-clockwise seen from above (+y normal), whatever the slope', () => {
    const geometry = buildTerrainGeometry(makeTile({ height: (col, row) => 3 * Math.sin(col / 7) + 2 * Math.cos(row / 5) }), 4);
    const indices = layerIndices(new Uint8Array(PATCHES).fill(1));
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3(...vertex(geometry, indices[k]!)));
    const first = new Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!));
    expect(first.normalize().y).toBeGreaterThan(0.9);
    for (let t = 0; t < indices.length; t += 3) {
      const [p, q, r] = [0, 1, 2].map((k) => new Vector3(...vertex(geometry, indices[t + k]!)));
      expect(new Vector3().crossVectors(q!.clone().sub(p!), r!.clone().sub(p!)).y).toBeGreaterThan(0);
    }
  });

  it('splits quads like the client index buffer: the diagonals meet at the centre of each 2 x 2 block', () => {
    // World3D.cpp:2171-2188 (LOD 0): in the block of quads (0,0) (0,1) (1,0) (1,1) every diagonal passes through
    // vertex (1, 1). The quad (qr, qc) with qr + qc even is cut from its (row, col) corner to the opposite one.
    const enable = new Uint8Array(PATCHES);
    enable[0] = 1;
    const indices = layerIndices(enable);
    const triangles = new Set<string>();
    for (let t = 0; t < indices.length; t += 3) triangles.add([...indices.subarray(t, t + 3)].sort((a, b) => a - b).join(','));
    const v = (row: number, col: number): number => row * SIDE + col;
    const triangle = (...corners: number[]): string => corners.sort((a, b) => a - b).join(',');
    expect(triangles.has(triangle(v(0, 0), v(0, 1), v(1, 1)))).toBe(true); // quad (0,0): diagonal (0,0)-(1,1)
    expect(triangles.has(triangle(v(0, 1), v(0, 2), v(1, 1)))).toBe(true); // quad (0,1): diagonal (0,2)-(1,1)
    expect(triangles.has(triangle(v(1, 0), v(1, 1), v(2, 0)))).toBe(true); // quad (1,0): diagonal (1,1)-(2,0)
    expect(triangles.has(triangle(v(1, 1), v(1, 2), v(2, 2)))).toBe(true); // quad (1,1): diagonal (1,1)-(2,2)
  });
});

describe('sampleHeight', () => {
  const mpu = 4;

  it('is bilinear between the four corners of the cell', () => {
    const tile = makeTile({ height: (col) => col });
    expect(sampleHeight(tile, 2.5 * mpu, 0, mpu)).toBe(2.5);

    const bumpy = makeTile({ height: (col, row) => (col === 3 && row === 5 ? 100 : 0) });
    expect(sampleHeight(bumpy, 3 * mpu, 5 * mpu, mpu)).toBe(100);
    expect(sampleHeight(bumpy, 3.5 * mpu, 5 * mpu, mpu)).toBe(50);
    expect(sampleHeight(bumpy, 3.5 * mpu, 5.5 * mpu, mpu)).toBe(25);
    expect(sampleHeight(bumpy, 2.75 * mpu, 4.25 * mpu, mpu)).toBeCloseTo(100 * 0.75 * 0.25);
  });

  it('uses heights without their flag', () => {
    const tile = makeTile({ height: (col) => (col === 3 ? 1000 + 3 : col) });
    expect(sampleHeight(tile, 3 * mpu, 0, mpu)).toBe(3);
    expect(sampleHeight(tile, 2.5 * mpu, 0, mpu)).toBe(2.5);
  });

  it('reaches the far edge of the tile and is 0 outside it, as CLandscape::GetHeight is', () => {
    const tile = makeTile({ height: () => 7 });
    expect(sampleHeight(tile, 128 * mpu, 128 * mpu, mpu)).toBe(7);
    expect(sampleHeight(tile, 128 * mpu, 0, mpu)).toBe(7);
    expect(sampleHeight(tile, -0.01, 0, mpu)).toBe(0);
    expect(sampleHeight(tile, 0, 128 * mpu + 0.01, mpu)).toBe(0);
  });

  it('measures x and z in the tile\'s own D3D frame, z growing with the row', () => {
    const tile = makeTile({ height: (_col, row) => row });
    expect(sampleHeight(tile, 0, 10 * mpu, mpu)).toBe(10);
  });
});

/** A texture cache that hands out one texture per key and records what happened to the keys. */
function fakeTextures(): {
  cache: { acquire(key: string | null): Promise<Texture>; release(key: string | null): void };
  acquired: (string | null)[];
  released: (string | null)[];
  made: Map<string | null, Texture>;
  hold(): () => void;
} {
  const acquired: (string | null)[] = [];
  const released: (string | null)[] = [];
  const made = new Map<string | null, Texture>();
  let gate: Promise<void> | null = null;
  return {
    acquired,
    released,
    made,
    hold() {
      let open!: () => void;
      gate = new Promise<void>((resolve) => (open = resolve));
      return open;
    },
    cache: {
      async acquire(key) {
        acquired.push(key);
        if (!made.has(key)) made.set(key, new Texture());
        const texture = made.get(key)!;
        if (gate !== null) await gate;
        return texture;
      },
      release(key) {
        released.push(key);
      },
    },
  };
}

/** Counts the `dispose` events an object dispatches. */
function watchDispose(object: { addEventListener(type: 'dispose', listener: () => void): void }): { count: number } {
  const seen = { count: 0 };
  object.addEventListener('dispose', () => seen.count++);
  return seen;
}

function uniformValue(material: ShaderMaterial, name: string): unknown {
  return material.uniforms[name]!.value;
}

const KEYS = ['textures/terrain/a.dds.ktx2', 'textures/terrain/b.dds.ktx2', 'textures/terrain/c.dds.ktx2'];

describe('TerrainTile', () => {
  const manifest = makeManifest(4, KEYS);

  it('draws each patch with the first layer that covers it opaque and the later layers blended by the light alpha', async () => {
    // layer 0 covers patch 0 only; layer 1 covers 0 and 1; layer 2 covers 1 and 2.
    const tile = makeTile({
      layers: [
        { texture: 0, patches: [0] },
        { texture: 1, patches: [0, 1] },
        { texture: 2, patches: [1, 2] },
      ],
    });
    const textures = fakeTextures();
    const terrain = new TerrainTile(tile, manifest, { textures: textures.cache });
    await terrain.ready;

    const meshes = terrain.group.children as Mesh[];
    const describeMesh = (mesh: Mesh): string => {
      const material = mesh.material as ShaderMaterial;
      return `${uniformValue(material, 'uTexture') === textures.made.get(KEYS[0]!) ? 'a' : uniformValue(material, 'uTexture') === textures.made.get(KEYS[1]!) ? 'b' : 'c'}:${material.transparent ? 'blended' : 'opaque'}:${mesh.geometry.index!.count / INDICES_PER_PATCH}`;
    };
    // Layer 0: patch 0 opaque. Layer 1: patch 0 blended, patch 1 opaque. Layer 2: patch 1 blended, patch 2 opaque.
    expect(meshes.map(describeMesh).sort()).toEqual(['a:opaque:1', 'b:blended:1', 'b:opaque:1', 'c:blended:1', 'c:opaque:1']);
  });

  it('draws a layer that covers every patch once, opaque when it is the first', async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }] });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    expect(terrain.group.children).toHaveLength(1);
    const mesh = terrain.group.children[0] as Mesh;
    expect((mesh.material as ShaderMaterial).transparent).toBe(false);
    expect(mesh.geometry.index!.count).toBe(PATCHES * INDICES_PER_PATCH);
  });

  it('blends in layer order and after everything opaque; every pass tests and writes depth', async () => {
    const tile = makeTile({
      layers: [
        { texture: 0, patches: 'all' },
        { texture: 1, patches: [3] },
        { texture: 2, patches: [3] },
      ],
    });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const meshes = terrain.group.children as Mesh[];
    expect(meshes).toHaveLength(3);
    const blended = meshes.filter((m) => (m.material as ShaderMaterial).transparent);
    expect(blended.map((m) => m.renderOrder)).toEqual([...blended.map((m) => m.renderOrder)].sort((a, b) => a - b));
    expect(new Set(blended.map((m) => m.renderOrder)).size).toBe(2);
    for (const mesh of meshes) {
      const material = mesh.material as ShaderMaterial;
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(true);
      expect(material.fog).toBe(true);
    }
  });

  it('shares one geometry between its meshes: the attributes are the same, the index is each mesh\'s own', async () => {
    const tile = makeTile({
      layers: [
        { texture: 0, patches: 'all' },
        { texture: 1, patches: [5, 6] },
      ],
    });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const [first, second] = terrain.group.children as Mesh[];
    expect(first!.geometry.getAttribute('position')).toBe(second!.geometry.getAttribute('position'));
    expect(first!.geometry.getAttribute('uv1')).toBe(second!.geometry.getAttribute('uv1'));
    expect(first!.geometry.index).not.toBe(second!.geometry.index);
    expect(second!.geometry.index!.count).toBe(2 * INDICES_PER_PATCH);
  });

  it('gives each layer a 128 x 128 rgba light texture of its own, linear, clamped, without mipmaps', async () => {
    const tile = makeTile({
      layers: [
        { texture: 0, patches: 'all' },
        { texture: 1, patches: [0] },
      ],
    });
    tile.layers[1]!.light[3] = 77;
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const lights = (terrain.group.children as Mesh[]).map((m) => uniformValue(m.material as ShaderMaterial, 'uLight') as DataTexture);
    expect(new Set(lights).size).toBe(2);
    for (const light of lights) {
      expect(light).toBeInstanceOf(DataTexture);
      expect([light.image.width, light.image.height]).toEqual([128, 128]);
      expect(light.generateMipmaps).toBe(false);
      expect(light.minFilter).toBe(LinearFilter);
      expect(light.magFilter).toBe(LinearFilter);
      expect(light.wrapS).toBe(ClampToEdgeWrapping);
      expect(light.wrapT).toBe(ClampToEdgeWrapping);
    }
    expect(lights.map((l) => (l.image.data as Uint8Array)[3]).sort((a, b) => a! - b!)).toEqual([77, 128]);
  });

  it("lets go of each light map's pixels once it is on the GPU, and keeps the geometry and the byte count", async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }] });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const bytes = terrain.gpuBytes();
    const mesh = terrain.group.children[0] as Mesh;
    const light = uniformValue(mesh.material as ShaderMaterial, 'uLight') as DataTexture;
    expect(light.image.data).not.toBeNull();

    // what WebGLTextures does right after the upload
    light.onUpdate!(light);

    expect(light.image.data).toBeNull();
    expect([light.image.width, light.image.height]).toEqual([128, 128]);
    expect(mesh.geometry.getAttribute('position').array).toHaveLength(16641 * 3);
    expect(terrain.gpuBytes()).toBe(bytes);
  });

  it('shows nothing until every layer texture has arrived, then shows the ground', async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }, { texture: 1, patches: [0] }] });
    const textures = fakeTextures();
    const open = textures.hold();
    const terrain = new TerrainTile(tile, manifest, { textures: textures.cache });
    expect(terrain.group.children).toHaveLength(0);
    // the references are taken at once, so a texture is never evicted while the tile waits for it
    expect(textures.acquired).toEqual([KEYS[0], KEYS[1]]);
    open();
    await terrain.ready;
    expect(terrain.group.children).toHaveLength(2);
  });

  it('asks for the checkerboard (null) for a layer whose texture index the manifest does not have', async () => {
    const tile = makeTile({ layers: [{ texture: 99, patches: 'all' }] });
    const textures = fakeTextures();
    const terrain = new TerrainTile(tile, manifest, { textures: textures.cache });
    await terrain.ready;
    expect(textures.acquired).toEqual([null]);
    terrain.dispose();
    expect(textures.released).toEqual([null]);
  });

  it('frees geometry, index buffers, light textures and materials, and releases each texture key once', async () => {
    const tile = makeTile({
      layers: [
        { texture: 0, patches: 'all' },
        { texture: 1, patches: [0, 1] },
        { texture: 2, patches: [2] },
      ],
    });
    const textures = fakeTextures();
    const terrain = new TerrainTile(tile, manifest, { textures: textures.cache });
    await terrain.ready;
    const meshes = terrain.group.children as Mesh[];
    const geometries = meshes.map((m) => watchDispose(m.geometry));
    const materials = meshes.map((m) => watchDispose(m.material as ShaderMaterial));
    const lights = new Set(meshes.map((m) => uniformValue(m.material as ShaderMaterial, 'uLight') as DataTexture));
    const lightDisposed = [...lights].map(watchDispose);

    terrain.dispose();
    expect(geometries.every((g) => g.count === 1)).toBe(true);
    expect(materials.every((m) => m.count === 1)).toBe(true);
    expect(lightDisposed).toHaveLength(3);
    expect(lightDisposed.every((l) => l.count === 1)).toBe(true);
    expect(terrain.group.children).toHaveLength(0);
    expect(textures.released.sort()).toEqual([...KEYS].sort());

    terrain.dispose();
    expect(textures.released).toHaveLength(3);
    expect(geometries.every((g) => g.count === 1)).toBe(true);
  });

  it('releases its textures and adds no meshes when it is disposed before they arrive', async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }, { texture: 1, patches: [0] }] });
    const textures = fakeTextures();
    const open = textures.hold();
    const terrain = new TerrainTile(tile, manifest, { textures: textures.cache });
    terrain.dispose();
    expect(textures.released.sort()).toEqual([KEYS[0], KEYS[1]]);
    open();
    await terrain.ready;
    expect(terrain.group.children).toHaveLength(0);
    expect(textures.released).toHaveLength(2);
  });

  it('counts the shared geometry once, each index buffer, and each light texture as rgba8 without mipmaps', async () => {
    const tile = makeTile({
      layers: [
        { texture: 0, patches: 'all' },
        { texture: 1, patches: [0, 1] },
      ],
    });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const meshes = terrain.group.children as Mesh[];
    const attributes = geometryBytes(buildTerrainGeometry(tile, 4));
    // 16641 vertices: position and normal 3 floats, uv and uv1 2 floats
    expect(attributes).toBe(16641 * (3 + 3 + 2 + 2) * 4);
    const indices = meshes.reduce((sum, m) => sum + (m.geometry.index!.array as Uint16Array | Uint32Array).byteLength, 0);
    expect(terrain.gpuBytes()).toBe(attributes + indices + 2 * 128 * 128 * 4);
  });

  it('mixes the fog in three.js\' own way: fogColor arrives in output space and is not encoded a second time', async () => {
    // For a canvas, WebGLMaterials.refreshFogUniforms converts the Fog's colour to renderer.outputColorSpace before it
    // reaches the shader, and this shader works in (and writes) that space, so the chunk's plain mix is right and a
    // toStored(fogColor) would lighten the far ground (0x808080 would fade to about 0xbc).
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }, { texture: 1, patches: [0] }] });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    for (const mesh of terrain.group.children as Mesh[]) {
      const material = mesh.material as ShaderMaterial;
      expect(material.fog).toBe(true);
      expect(material.uniforms.fogColor).toBeDefined();
      expect(material.fragmentShader).toContain('#include <fog_fragment>');
      expect(material.fragmentShader).not.toContain('fogColor');
      // the texture is the only thing that goes through the stored-space conversion
      expect(material.fragmentShader.match(/toStored\(/g)).toHaveLength(2); // its definition and the one use
      expect(material.fragmentShader).toContain('toStored(texture2D(uTexture');
    }
  });

  it('keeps the vertex indices in 16 bits: the tile has 16641 vertices', async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }] });
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache });
    await terrain.ready;
    const index = (terrain.group.children[0] as Mesh).geometry.index!;
    expect(index.array).toBeInstanceOf(Uint16Array);
    expect(index.array[index.count - 1]).toBeLessThan(16641);
  });

  it('shares the lighting the world view gives it between all its materials, unlit by default', async () => {
    const tile = makeTile({ layers: [{ texture: 0, patches: 'all' }, { texture: 1, patches: [0] }] });
    const lighting = new TerrainLighting();
    const terrain = new TerrainTile(tile, manifest, { textures: fakeTextures().cache, lighting });
    await terrain.ready;
    for (const mesh of terrain.group.children as Mesh[]) {
      expect(uniformValue(mesh.material as ShaderMaterial, 'uAmbient')).toBe(lighting.ambient);
      expect(uniformValue(mesh.material as ShaderMaterial, 'uSunColor')).toBe(lighting.sunColor);
      expect(uniformValue(mesh.material as ShaderMaterial, 'uSunDirection')).toBe(lighting.sunDirection);
    }
    expect([lighting.ambient.x, lighting.ambient.y, lighting.ambient.z]).toEqual([1, 1, 1]);
    expect([lighting.sunColor.x, lighting.sunColor.y, lighting.sunColor.z]).toEqual([0, 0, 0]);
  });
});
