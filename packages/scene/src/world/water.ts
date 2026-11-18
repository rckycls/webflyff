// 2026-11-19 (water): a tile's water and cloud sea, drawn the way CLandscape::RenderWater draws a CLandscape's
// (Source/_Common/lod.cpp:932-1070), from the vertices MakeWaterVertexBuffer builds (lod.cpp:357-597) and the frames
// CWorld::Process steps (World.cpp:953-962).
//
// What the C++ does:
//  - Each patch whose `byWaterTexture` says WTYPE_WATER in its low two bits gets a flat quad at `byWaterHeight` metres
//    (a whole number, 0 to 255) over the patch, its texture repeated three times each way (u, v 0 to 3), in the vertex
//    buffer of water list `byWaterTexture >> 2`; a list Terrain.inc does not have is skipped (lod.cpp:424-503). Each
//    patch whose byte is exactly WTYPE_CLOUD gets a quad at height 0 with u, v 0 to 1 (:507-583).
//  - The water lists are drawn with the texture of their current frame (`m_fWaterFrame[i]`), which CWorld::Process steps
//    by `fWaterFrame` 0.15 each 60 Hz tick and starts again at 0 once it passes the list's length (World.cpp:953-962,
//    TerrainMng.cpp:123): 54 frames go round in 6 seconds.
//  - The cloud sea is drawn twice, moved up 40 and 80 metres, with Terrain.inc id 10's texture (no `seacloud` line in any
//    shipped .wld, so `__BS_CHANGEABLE_WORLD_SEACLOUD` never swaps it, WorldFile.cpp:199-209), its uv moved by
//    (m_fCloud_u1, v1) and (u2, v2) (:1036-1063). Those grow by 0.001 and 0.0015 after each land draws its clouds
//    (:1065-1068), so they move faster the more lands with clouds are on screen: here, the tiles whose cloud is in the
//    camera's view (Neuz draws the lands that pass `isVisibile()`, World3D.cpp:510-519), stepped at 60 Hz.
//  - States (lod.cpp:934-965): no culling; alpha blending SRCALPHA / INVSRCALPHA; the colour is the texture's alone
//    (D3DTOP_SELECTARG1, so neither the light nor the time of day changes it); the alpha is the vertices' diffuse alpha
//    0xaa (:445) times the texture factor's 200, about 0.52. Fog and depth stay as the world left them: fog on, depth
//    test and depth writes on (the cloud sets both on again, :1036-1037).
//  - Order: after the objects and before the trail effects and the sfx (CWorld::Render, World3D.cpp:1116-1120). Here the
//    water draws after the other transparent things (renderOrder 0) and before the effects (0.5), the clouds after the
//    water, the lower layer first.
//
// The colour is handled as TerrainTile handles it: the texture is decoded back to the numbers D3D uses, and written to
// the canvas without three.js' output conversion.
//
// Cost: two triangles a patch, and a draw per water list a tile has plus one for both layers of its cloud (a draw costs
// the phone's CPU more than the triangles do); quads the ground hides on the whole patch are left out
// (`buildWaterGeometry`). The materials, and so the textures, are shared by every tile. A list's frames are fetched once
// the first tile that uses it comes in (54 small textures), and kept until the stage goes; the meshes show once they are
// all in. A tile's water is not part of its `ready`: the ground does not wait for it.

import { MAP_SIZE, NUM_PATCHES_PER_SIDE, PATCH_SIZE, cleanHeight, waterOfPatch } from '@flyffweb/formats';
import type { WebTerrainWater, WebTile, WorldManifest } from '@flyffweb/formats';
import type { Camera, IUniform, Object3D, Texture } from 'three';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from 'three';
import type { TextureCache } from '../assets/loaders';
import { geometryBytes } from '../overlay/gpuMemory';

/** lod.cpp:445: the vertices' diffuse 0xaaaaaaaa; :961-965: alpha = diffuse alpha x the texture factor's 200. */
export const WATER_ALPHA = (0xaa / 255) * (200 / 255);
/** After the other transparent things (0) and before the effects (EffectRenderer, 0.5). */
const WATER_RENDER_ORDER = 0.25;
const CLOUD_RENDER_ORDER = 0.26;
/** lod.cpp:1050 and :1061: the two cloud layers are moved up 40 and 80 metres. */
const CLOUD_HEIGHTS = [40, 80] as const;
/** lod.cpp:1065-1068: what each layer's uv moves after a land drew its clouds. */
const CLOUD_STEPS = [0.001, 0.0015] as const;
/** lod.cpp:455: a water quad's texture repeats three times; a cloud quad's once (:530). */
const WATER_REPEATS = 3;
/** World.cpp:957 with TerrainMng.cpp:123: 0.15 frames a tick, written as 3 / 20 to count in whole numbers. */
const FRAME_STEP_NUMERATOR = 3;
const FRAME_STEP_DENOMINATOR = 20;
/** FRAME_PER_SEC (timer.h:133): CWorld::Process runs 60 times a second. */
const TICKS_PER_MS = 60 / 1000;
/** A longer gap between two frames (a hidden tab) moves the clouds no more than this. */
const MAX_STEP_MS = 1000;

/** The frame of a water list of `count` frames at `ms` on a clock that starts with frame 0 (World.cpp:953-962). */
export function waterFrame(ms: number, count: number): number {
  const ticks = Math.floor(ms * TICKS_PER_MS + 1e-6);
  return Math.floor(((ticks * FRAME_STEP_NUMERATOR) % (count * FRAME_STEP_DENOMINATOR)) / FRAME_STEP_DENOMINATOR);
}

/** How far the two cloud layers' uv move in `ms` with `lands` tiles of cloud on screen: [layer 40 m, layer 80 m]. */
export function cloudScroll(ms: number, lands: number): [number, number] {
  const frames = ms * TICKS_PER_MS * lands;
  return [CLOUD_STEPS[0] * frames, CLOUD_STEPS[1] * frames];
}

/** The quads of one geometry being built: positions, uvs and (the cloud's) layer of each vertex. */
interface Quads {
  positions: number[];
  uvs: number[];
  layers: number[];
}

/**
 * The tile's water quads, one geometry per water list (keyed by `byWaterTexture >> 2`), and its cloud quads, both
 * layers in one geometry (null when it has none): every quad at 40 m, then every quad at 80 m, so one draw keeps the
 * C++'s order, with the attribute `layer` (0, 1) picking the layer's uv offset. Six vertices a quad, in
 * MakeWaterVertexBuffer's order; patch (column j, row i) covers D3D x `(tile.x * 128 + j * 8) * mpu` on, z likewise,
 * mirrored to web -z.
 *
 * A quad the ground is above on the whole patch is left out: the ground's triangles run between its vertices, so it
 * is above the quad everywhere there, and the opaque ground hides the quad from any camera over the land, as it does
 * in Neuz, which draws it anyway. Many cloud patches lie under the islands' edges.
 */
export function buildWaterGeometry(tile: Pick<WebTile, 'x' | 'y' | 'water' | 'heights'>, mpu: number): {
  water: Map<number, BufferGeometry>;
  cloud: BufferGeometry | null;
} {
  const water = new Map<number, Quads>();
  const clouds: [Quads, Quads] = [{ positions: [], uvs: [], layers: [] }, { positions: [], uvs: [], layers: [] }];
  const patchSide = PATCH_SIZE * mpu;
  const worldX = tile.x * MAP_SIZE * mpu;
  const worldZ = tile.y * MAP_SIZE * mpu;

  /** The lowest ground over patch (j, i), without the HGT_ flags; -Infinity for a tile without heights. */
  const lowestGround = (j: number, i: number): number => {
    let lowest = Infinity;
    for (let row = i * PATCH_SIZE; row <= (i + 1) * PATCH_SIZE; row++) {
      for (let col = j * PATCH_SIZE; col <= (j + 1) * PATCH_SIZE; col++) {
        const raw = tile.heights[row * (MAP_SIZE + 1) + col];
        if (raw === undefined) return -Infinity;
        lowest = Math.min(lowest, cleanHeight(raw));
      }
    }
    return lowest;
  };

  const addQuad = (quads: Quads, j: number, i: number, height: number, repeats: number, layer: number): void => {
    const x = worldX + j * patchSide;
    const z = worldZ + i * patchSide;
    // lod.cpp:437-503: (0, 0) (0, 1) (1, 0), then (0, 1) (1, 0) (1, 1), in patch steps along x and D3D z
    for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [0, 1], [1, 0], [1, 1]] as const) {
      // 0 - n and not -n: a zero must be +0
      quads.positions.push(x + dx * patchSide, height, 0 - (z + dz * patchSide));
      quads.uvs.push(dx * repeats, dz * repeats);
      quads.layers.push(layer);
    }
  };

  for (let i = 0; i < NUM_PATCHES_PER_SIDE; i++) {
    for (let j = 0; j < NUM_PATCHES_PER_SIDE; j++) {
      const patch = j + i * NUM_PATCHES_PER_SIDE;
      if (patch * 2 + 1 >= tile.water.length) continue;
      const what = waterOfPatch(tile.water[patch * 2 + 1]!);
      if (what === null) continue;
      const ground = lowestGround(j, i);
      if (what.kind === 'water') {
        const height = tile.water[patch * 2]!;
        if (ground > height) continue;
        let quads = water.get(what.list);
        if (quads === undefined) water.set(what.list, (quads = { positions: [], uvs: [], layers: [] }));
        addQuad(quads, j, i, height, WATER_REPEATS, 0);
      } else {
        CLOUD_HEIGHTS.forEach((height, layer) => {
          if (ground <= height) addQuad(clouds[layer]!, j, i, height, 1, layer);
        });
      }
    }
  }

  const geometryOf = (quads: Quads, withLayer: boolean): BufferGeometry => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(quads.positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(quads.uvs), 2));
    if (withLayer) geometry.setAttribute('layer', new BufferAttribute(new Float32Array(quads.layers), 1));
    geometry.computeBoundingSphere();
    return geometry;
  };
  const both: Quads = {
    positions: [...clouds[0].positions, ...clouds[1].positions],
    uvs: [...clouds[0].uvs, ...clouds[1].uvs],
    layers: [...clouds[0].layers, ...clouds[1].layers],
  };
  return {
    water: new Map([...water].map(([list, quads]) => [list, geometryOf(quads, false)])),
    cloud: both.positions.length === 0 ? null : geometryOf(both, true),
  };
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  #ifdef CLOUD
    // the layer's uv offset: (m_fCloud_u1, v1) at 40 m, (u2, v2) at 80 m
    attribute float layer;
    uniform vec2 uOffset;
    uniform vec2 uOffset2;
  #endif

  void main() {
    #ifdef CLOUD
      vUv = uv + mix(uOffset, uOffset2, layer);
    #else
      vUv = uv;
    #endif
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uAlpha;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  // The sRGB encoding of a linear colour: the number D3D would have had for it (as TerrainTile's).
  vec3 toStored(vec3 c) {
    vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(high, c * 12.92, step(c, vec3(0.0031308)));
  }

  void main() {
    // stage 0: the texture's colour (D3DTOP_SELECTARG1), the diffuse alpha times the texture factor's
    gl_FragColor = vec4(toStored(texture2D(uTexture, vUv).rgb), uAlpha);
    // the fog colour is already an output-space colour (see TerrainTile), so it is mixed as it comes
    #include <fog_fragment>
  }
`;

/** The material of a water list, or with `cloudOffsets` the cloud sea's, whose two layers move by those offsets. */
function waterMaterial(texture: IUniform<Texture | null>, cloudOffsets?: [Vector2, Vector2]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTexture: texture,
      uAlpha: { value: WATER_ALPHA },
      ...(cloudOffsets === undefined ? {} : { uOffset: { value: cloudOffsets[0] }, uOffset2: { value: cloudOffsets[1] } }),
    },
    defines: cloudOffsets === undefined ? {} : { CLOUD: '' },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    fog: true,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
  });
}

/** Whether `object` hangs, through its parents, in a scene. */
function inScene(object: Object3D): boolean {
  for (let o: Object3D | null = object; o !== null; o = o.parent) if ((o as Object3D & { isScene?: boolean }).isScene) return true;
  return false;
}

/** A set of textures that is fetched once, on first need, and shown through one shared material. */
interface Surface {
  keys: (string | null)[];
  /** The textures, in `keys` order, once they are all in. */
  textures: Texture[] | null;
  loading: Promise<void> | null;
  uniform: IUniform<Texture | null>;
}

/** One tile's water: its meshes go into `group` once their textures are in. */
export class WaterTile {
  /** The water and cloud meshes, in world coordinates. Empty until their textures are in. */
  readonly group = new Group();
  /** Resolves once the meshes are in `group` (or the tile was disposed first). Never rejects. */
  readonly ready: Promise<void>;
  private readonly geometries: BufferGeometry[];
  private readonly bytes: number;
  private disposed = false;

  constructor(
    parts: { geometry: BufferGeometry; meshes: Mesh[]; arrival: Promise<void> }[],
    private readonly onDispose: (tile: WaterTile) => void,
  ) {
    this.geometries = parts.map((part) => part.geometry);
    this.bytes = this.geometries.reduce((sum, geometry) => sum + geometryBytes(geometry), 0);
    this.ready = Promise.all(
      parts.map((part) =>
        part.arrival.then(() => {
          if (!this.disposed) this.group.add(...part.meshes);
        }),
      ),
    ).then(() => undefined);
  }

  /** What the tile holds on the GPU, without the textures (the texture cache counts those). Constant. */
  gpuBytes(): number {
    return this.bytes;
  }

  /** Frees the tile's geometry; the materials and textures are the surfaces'. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.clear();
    for (const geometry of this.geometries) geometry.dispose();
    this.onDispose(this);
  }
}

/**
 * The water and cloud sea of one world: the textures of Terrain.inc's water lists and cloud, the materials every tile's
 * meshes share, and their animation (`update`, once a frame). `catalog` null draws no water. `prepare` is given each
 * texture once it is in, so the stage can put it on the GPU before its frame comes round.
 */
export class WaterSurfaces {
  private readonly lists: { surface: Surface; material: ShaderMaterial }[];
  private readonly cloud: { surface: Surface; material: ShaderMaterial; offsets: [Vector2, Vector2] } | null;
  /** Each tile's cloud mesh, for counting the lands with clouds on screen. */
  private readonly cloudMeshes = new Map<WaterTile, Mesh>();
  private readonly frustum = new Frustum();
  private readonly viewProjection = new Matrix4();
  private last: number | null = null;
  private disposed = false;

  constructor(
    catalog: WebTerrainWater | null,
    private readonly textures: Pick<TextureCache, 'acquire' | 'release'>,
    private readonly prepare?: (texture: Texture) => void,
  ) {
    const surface = (keys: (string | null)[]): Surface => ({ keys, textures: null, loading: null, uniform: { value: null } });
    this.lists = (catalog?.water ?? []).map((keys) => {
      const s = surface(keys);
      return { surface: s, material: waterMaterial(s.uniform) };
    });
    if (catalog === null || catalog.cloud === null) {
      this.cloud = null;
    } else {
      const s = surface([catalog.cloud]);
      const offsets: [Vector2, Vector2] = [new Vector2(), new Vector2()];
      this.cloud = { surface: s, material: waterMaterial(s.uniform, offsets), offsets };
    }
  }

  /** The tile's water and cloud meshes, or null when it has none that can be drawn. */
  tile(tile: WebTile, manifest: WorldManifest): WaterTile | null {
    if (this.disposed) return null;
    const { water, cloud } = buildWaterGeometry(tile, manifest.mpu);
    const parts: { geometry: BufferGeometry; meshes: Mesh[]; arrival: Promise<void> }[] = [];
    for (const [index, geometry] of water) {
      const list = this.lists[index];
      if (list === undefined || list.surface.keys.length === 0) {
        geometry.dispose(); // lod.cpp:429: a list Terrain.inc does not have is not drawn
        continue;
      }
      const mesh = new Mesh(geometry, list.material);
      mesh.name = `water ${tile.x}_${tile.y} list ${index}`;
      mesh.renderOrder = WATER_RENDER_ORDER;
      parts.push({ geometry, meshes: [mesh], arrival: this.load(list.surface) });
    }
    let cloudMesh: Mesh | null = null;
    if (cloud !== null && this.cloud !== null) {
      cloudMesh = new Mesh(cloud, this.cloud.material);
      cloudMesh.name = `cloud ${tile.x}_${tile.y}`;
      cloudMesh.renderOrder = CLOUD_RENDER_ORDER;
      parts.push({ geometry: cloud, meshes: [cloudMesh], arrival: this.load(this.cloud.surface) });
    } else {
      cloud?.dispose();
    }
    if (parts.length === 0) return null;

    const waterTile = new WaterTile(parts, (gone) => this.cloudMeshes.delete(gone));
    if (cloudMesh !== null) this.cloudMeshes.set(waterTile, cloudMesh);
    return waterTile;
  }

  /**
   * Steps the animation to the time `now` (ms, any clock that goes forward): each water list shows its frame, and the
   * clouds move for the frames since the last call, by the tiles whose cloud is in the scene and in `camera`'s view.
   */
  update(now: number, camera: Camera): void {
    const elapsed = this.last === null ? 0 : Math.min(Math.max(now - this.last, 0), MAX_STEP_MS);
    this.last = now;
    for (const { surface } of this.lists) {
      if (surface.textures !== null) surface.uniform.value = surface.textures[waterFrame(now, surface.textures.length)]!;
    }
    if (this.cloud === null || elapsed === 0 || this.cloudMeshes.size === 0) return;

    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let lands = 0;
    for (const mesh of this.cloudMeshes.values()) {
      if (mesh.parent !== null && inScene(mesh) && this.frustum.intersectsObject(mesh)) lands++;
    }
    const steps = cloudScroll(elapsed, lands);
    this.cloud.offsets.forEach((offset, layer) => {
      const step = steps[layer]!;
      // the texture repeats, so only the fraction counts; keeping it small keeps the precision
      offset.set((offset.x + step) % 1, (offset.y + step) % 1);
    });
  }

  /** Gives back the textures and frees the materials. The tiles are the streamer's to dispose. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const surfaces = [...this.lists.map((list) => list.surface), ...(this.cloud === null ? [] : [this.cloud.surface])];
    for (const surface of surfaces) {
      if (surface.loading !== null) for (const key of surface.keys) this.textures.release(key);
    }
    for (const list of this.lists) list.material.dispose();
    this.cloud?.material.dispose();
    this.cloudMeshes.clear();
  }

  /** Fetches the surface's textures the first time it is asked for; resolves once they are in. Never rejects. */
  private load(surface: Surface): Promise<void> {
    if (surface.loading === null) {
      surface.loading = Promise.all(surface.keys.map((key) => this.textures.acquire(key))).then(
        (textures) => {
          if (this.disposed) return;
          surface.textures = textures;
          surface.uniform.value = textures[this.last === null ? 0 : waterFrame(this.last, textures.length)]!;
          for (const texture of textures) this.prepare?.(texture);
        },
        () => undefined, // the cache gives the checkerboard for a texture that fails; this is not expected
      );
    }
    return surface.loading;
  }
}
