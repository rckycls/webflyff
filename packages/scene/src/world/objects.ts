// The objects a terrain tile places (trees, buildings, rocks): each model glb is loaded once per world and shared by
// every object, on every tile, that uses it. A model is held while a tile placing it is loaded (ref-counted by tile)
// and its geometry, materials and textures are given back with the last such tile.
//
// Drawing (ruling R45): one object per mesh cost one draw call each, and Flaris needs up to about 2,000 of them at
// 1280 x 720, far more than a phone can issue at 30 fps. So the objects of a tile are instanced: one InstancedMesh per
// model, LOD level and mesh of the model, holding every object of that model on the tile. The LOD level is chosen
// per tile, from the distance between the camera and the tile (its nearest point, so the tile the player is on is
// always at full detail), against LOD_DISTANCES; `update` follows the camera.
//
// Objects are static in Piece 1 (ruling R41): no `tm` or `bones` animation is played. Every mesh of a model is drawn
// where the glb puts it at rest: the lod<k> mesh, its `lod<k>_static` child, the `lod<k>_<j>` objects (under the LOD
// node or hung from a joint), and skinned meshes in their bind pose, which is the geometry as stored, so a skinned
// mesh becomes a plain one (converter layout: tools/convert/src/models/modelGlb.ts).
//
// Materials: the client draws models with fixed-function lighting and no specular (CWorld::SetLight, lighting.ts),
// so the glb's standard materials become Lambert ones; light objects (`extras.light`) are drawn additively and unlit,
// as CObject3D::RenderNormal does (modelGlb.ts materialState).
//
// No object of any converted world is mirrored (0 of 103,236 object matrices has a negative determinant), which
// matters here: three.js picks the front face per InstancedMesh, not per instance.

import type { Vec3, WebTile, WorldManifest } from '@flyffweb/formats';
import { MAP_SIZE } from '@flyffweb/formats';
import type { BufferGeometry, Material, Object3D } from 'three';
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetStore } from '../assets/AssetStore';
import type { TextureCache } from '../assets/loaders';
import { applyTextures, loadGltf } from '../assets/loaders';
import type { Overlay } from '../overlay/Overlay';
import { geometryBytes } from '../overlay/gpuMemory';

/** Where a model switches to lod0, lod1 and lod2: the distance from the camera, in world units (meters). */
export const LOD_DISTANCES: readonly number[] = [0, 100, 200];

/** `WebTileObject.model` of an object whose model the converter could not resolve. */
const NO_MODEL = 0xffff;
/** An instance matrix: 16 floats. */
const INSTANCE_BYTES = 16 * 4;

/** One mesh of a model, where it sits in the model at rest. */
interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
  matrix: Matrix4;
}

/** A loaded model: its meshes by LOD level, and what it holds. */
interface Template {
  /** `levels[k]` are the meshes of lod<k>; a level the model lacks is empty. */
  levels: Part[][];
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  /** Texture keys acquired from the cache, one per material. */
  textures: string[];
  bytes: number;
}

interface ModelEntry {
  /** Tiles holding the model. */
  refs: number;
  /** Null when the model failed to load (reported). Never rejects. */
  template: Promise<Template | null>;
  /** The template once it has arrived. */
  loaded: Template | null;
}

/** The instanced meshes of one model on one tile, by LOD level (empty for a level the model lacks). */
type ModelMeshes = InstancedMesh[][];

interface TileRecord {
  /** Model keys this tile holds. */
  keys: Set<string>;
  group: Group;
  /** Models with more than one LOD level, whose meshes `update` switches. */
  switching: ModelMeshes[];
  /** The tile on the ground: web x from `minX`, web z from `minZ`, `side` long. */
  minX: number;
  minZ: number;
  side: number;
  /** How many of LOD_DISTANCES (after the first) the tile is past; -1 before the first `update`. */
  band: number;
  /** Instance matrices added to the overlay's GPU estimate. */
  bytes: number;
  released: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The LOD level of a mesh: the k of the nearest `lod<k>...` name at or above it, 0 when there is none. */
function levelOf(object: Object3D): number {
  for (let o: Object3D | null = object; o !== null; o = o.parent) {
    const match = /^lod(\d+)/.exec(o.name);
    if (match !== null) return Number(match[1]);
  }
  return 0;
}

/** The material a model mesh is drawn with in the world (see the top of the file). `source` is disposed. */
function worldMaterial(source: Material): Material {
  const shared = {
    name: source.name,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
  };
  const material =
    source.userData.light === true
      ? new MeshBasicMaterial({ ...shared, side: DoubleSide, transparent: true, blending: AdditiveBlending, depthWrite: false })
      : new MeshLambertMaterial({ ...shared, depthWrite: source.depthWrite });
  material.userData = { ...source.userData };
  source.dispose();
  return material;
}

/** The band of a distance: 0 below LOD_DISTANCES[1], 1 below LOD_DISTANCES[2], and so on. */
function bandOf(distance: number): number {
  let band = 0;
  while (band + 1 < LOD_DISTANCES.length && distance >= LOD_DISTANCES[band + 1]!) band++;
  return band;
}

/** Shows the level of `meshes` for `band`: the highest level k <= band the model has, else its first. */
function showLevel(meshes: ModelMeshes, band: number): void {
  let shown = -1;
  meshes.forEach((level, k) => {
    if (level.length > 0 && (k <= band || shown === -1)) shown = k;
  });
  meshes.forEach((level, k) => {
    for (const mesh of level) mesh.visible = k === shown;
  });
}

export class ObjectPool {
  private readonly models = new Map<string, ModelEntry>();
  private readonly tiles = new Map<string, TileRecord>();
  /** Models whose template has arrived and not been disposed. */
  private loadedModels = 0;

  constructor(
    private readonly store: Pick<AssetStore, 'bytes'>,
    private readonly loaders: { gltf: Pick<GLTFLoader, 'parseAsync'> },
    private readonly cache: Pick<TextureCache, 'acquire' | 'release'>,
    private readonly overlay: Pick<Overlay, 'error' | 'addGpuBytes'>,
  ) {}

  /**
   * The objects of `tile`, each at its matrix, in one group (resolves once their models and textures are in). Objects
   * whose model is 0xffff, or failed to load, are left out. The tile holds its models until `releaseTile`. Until the
   * first `update`, every model shows its most detailed level.
   */
  async place(tile: WebTile, manifest: WorldManifest): Promise<Group> {
    const key = `${tile.x}_${tile.y}`;
    this.releaseTile(key);
    const side = MAP_SIZE * manifest.mpu;
    const record: TileRecord = {
      keys: new Set(),
      group: new Group(),
      switching: [],
      minX: tile.x * side,
      minZ: -(tile.y + 1) * side,
      side,
      band: -1,
      bytes: 0,
      released: false,
    };
    record.group.name = `objects ${key}`;
    this.tiles.set(key, record);

    // the objects of each model, in tile order
    const placements = new Map<string, Matrix4[]>();
    for (const object of tile.objects) {
      if (object.model === NO_MODEL) continue;
      const model = manifest.models[object.model];
      if (model === undefined) {
        this.overlay.error(`tile ${key}: object model ${object.model} is not in the world manifest`);
        continue;
      }
      let matrices = placements.get(model);
      if (matrices === undefined) {
        matrices = [];
        placements.set(model, matrices);
        record.keys.add(model);
        this.acquire(model);
      }
      matrices.push(new Matrix4().fromArray(object.matrix));
    }

    const templates = await Promise.all([...placements.keys()].map((model) => this.models.get(model)!.template));
    if (record.released) return record.group;

    let index = 0;
    for (const matrices of placements.values()) {
      const template = templates[index++];
      if (template === null || template === undefined) continue;
      const meshes = template.levels.map((parts) => parts.map((part) => instanced(part, matrices)));
      for (const level of meshes) for (const mesh of level) record.group.add(mesh);
      record.bytes += meshes.flat().length * matrices.length * INSTANCE_BYTES;
      if (meshes.filter((level) => level.length > 0).length > 1) {
        record.switching.push(meshes);
        showLevel(meshes, 0);
      }
    }
    this.overlay.addGpuBytes(record.bytes);
    return record.group;
  }

  /** Picks each tile's LOD level for a camera at `camera` (web). Cheap when no tile changes band. */
  update(camera: Vec3): void {
    for (const record of this.tiles.values()) {
      const dx = Math.max(record.minX - camera[0], 0, camera[0] - (record.minX + record.side));
      const dz = Math.max(record.minZ - camera[2], 0, camera[2] - (record.minZ + record.side));
      const band = bandOf(Math.hypot(dx, dz));
      if (band === record.band) continue;
      record.band = band;
      for (const meshes of record.switching) showLevel(meshes, band);
    }
  }

  /** Empties the group of the tile's objects and gives its models back. Nothing happens for an unknown tile. */
  releaseTile(key: string): void {
    const record = this.tiles.get(key);
    if (record === undefined) return;
    this.tiles.delete(key);
    record.released = true;
    for (const child of record.group.children) (child as InstancedMesh).dispose();
    record.group.clear();
    this.overlay.addGpuBytes(-record.bytes);
    for (const model of record.keys) this.release(model);
  }

  /** Models loaded and held. */
  modelCount(): number {
    return this.loadedModels;
  }

  dispose(): void {
    for (const key of [...this.tiles.keys()]) this.releaseTile(key);
  }

  private acquire(model: string): void {
    let entry = this.models.get(model);
    if (entry === undefined) {
      const created: ModelEntry = { refs: 0, template: Promise.resolve(null), loaded: null };
      created.template = this.load(model).then((template) => {
        if (template === null) return null;
        // let go of a model nobody held any more by the time it arrived
        if (this.models.get(model) !== created) {
          this.disposeTemplate(template);
          return null;
        }
        created.loaded = template;
        return template;
      });
      entry = created;
      this.models.set(model, entry);
    }
    entry.refs++;
  }

  private release(model: string): void {
    const entry = this.models.get(model);
    if (entry === undefined || --entry.refs > 0) return;
    this.models.delete(model);
    // one still loading is disposed by `acquire`'s callback when it arrives
    if (entry.loaded !== null) this.disposeTemplate(entry.loaded);
  }

  private async load(model: string): Promise<Template | null> {
    let gltf: Pick<GLTF, 'scene'>;
    try {
      gltf = await loadGltf(this.store, this.loaders.gltf, model);
    } catch (error) {
      this.overlay.error(`model ${model}: ${messageOf(error)}`);
      return null;
    }

    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const template: Template = { levels: [], geometries: new Set(), materials: new Set(), textures: [], bytes: 0 };
    const converted = new Map<Material, Material>();
    const convert = (material: Material): Material => {
      let world = converted.get(material);
      if (world === undefined) {
        world = worldMaterial(material);
        converted.set(material, world);
        template.materials.add(world);
      }
      return world;
    };
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      // drawn in the bind pose, where skinning changes nothing: the weights are not needed on the GPU
      if (geometry.hasAttribute('skinIndex')) geometry.deleteAttribute('skinIndex');
      if (geometry.hasAttribute('skinWeight')) geometry.deleteAttribute('skinWeight');
      template.geometries.add(geometry);
      const material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      const level = levelOf(mesh);
      (template.levels[level] ??= []).push({ geometry, material, matrix: mesh.matrixWorld.clone() });
    }
    for (let k = 0; k < template.levels.length; k++) template.levels[k] ??= [];

    // applyTextures resolves the materials' texture keys once each through the shared cache
    const holder = new Group();
    for (const parts of template.levels) for (const part of parts) holder.add(new Mesh(part.geometry, part.material));
    template.textures = await applyTextures(holder, this.cache);
    for (const geometry of template.geometries) template.bytes += geometryBytes(geometry);
    this.overlay.addGpuBytes(template.bytes);
    this.loadedModels++;
    return template;
  }

  private disposeTemplate(template: Template): void {
    for (const geometry of template.geometries) geometry.dispose();
    // a material's map belongs to the texture cache: dispose() leaves it alone
    for (const material of template.materials) material.dispose();
    for (const key of template.textures) this.cache.release(key);
    this.overlay.addGpuBytes(-template.bytes);
    this.loadedModels--;
  }
}

/** `part` once per object, at `object matrix * part matrix`. Objects never move: no automatic matrix. */
function instanced(part: Part, objects: readonly Matrix4[]): InstancedMesh {
  const mesh = new InstancedMesh(part.geometry, part.material, objects.length);
  const matrix = new Matrix4();
  objects.forEach((object, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(object, part.matrix)));
  mesh.matrixAutoUpdate = false;
  mesh.computeBoundingSphere();
  return mesh;
}
