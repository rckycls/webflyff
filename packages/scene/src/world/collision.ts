// The collision shapes of a world's placed objects (spec §3.7): every object (OT_OBJ, the only type the tiles hold) of
// a loaded tile whose model has a collision file (`collision/<stem>.bin`, collisionBin.ts, with the stem of its
// `models/<stem>.glb`) is a `CollisionObject` of the stage's `Ground` (ground.ts); a model without one has none. A
// model's shape is downloaded once and shared by every object, on every tile, that uses it: it is held while a tile
// placing it is loaded (ref-counted by tile) and let go with the last one, as the object pool does with the glbs
// (objects.ts). Nothing is downloaded before `activate` (`WorldStage.ground`): the viewer never asks, so it fetches
// nothing new. Coordinates are D3D: a tile object's web matrix goes back through `toWebMatrix`, its own inverse.
//
// The objects are linked as Neuz links them, so that `objectsNear` gives them in the order FOR_LINKMAP visits them
// (`Source/_Common/World.h:865-904`), which the rules depend on (the first one hit wins):
//
//   - `CObj::CalcLinkLevel` (`Obj.cpp:974-1020`, the client's `#else`): the link level is the first of 0 to 6
//     whose cell, `MAP_SIZE * MPU / ( 128 >> level )` meters, is wider than the object, the larger in x or z of the
//     difference between the model's box corners `m_vMin` and `m_vMax` taken through the world matrix
//     (`D3DXVec3Transform`); 6 when none is.
//   - `CLandscape::InsertObjLink` (`lod.cpp:1439-1481`): the cell is the one of that level the object's position (the
//     matrix's translation) is in, counted from the tile's corner (`m_nWorldX = x * MAP_SIZE`, `WorldFile.cpp:982`).
//     An object whose cell falls outside the tile's grid is not linked, and LoadLandscape deletes it
//     (`lod.cpp:1379-1389`). The first object of a cell heads its list and each later one goes in right after the
//     head (`InsNextNode`, `Obj.cpp:199-206`): a cell lists its objects first, last, last but one, ..., second, in
//     tile order.
//
// Simplified: the collision mesh's bounds stand in for the model's box (the glb is not loaded here; object3d.ts does
// the same), which can put an object at a lower level than Neuz would; and the objects whose model has no collision
// mesh are left out of the lists (their box is not known), which changes the order of the others only in a cell such
// an object heads.

import { MAP_SIZE, collisionKey, decodeCollisionBin, toWebMatrix } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import type { AssetStore } from '../assets/AssetStore';
import type { Overlay } from '../overlay/Overlay';
import type { CollisionObject } from './ground';

const f32 = Math.fround;

/** `WebTileObject.model` of an object whose model the converter could not resolve. */
const NO_MODEL = 0xffff;
/** `MAX_LINKLEVEL` (`Obj.h:23`). */
const MAX_LINKLEVEL = 7;
/** `CLandscape::m_nWidthLinkMap` (`lod.cpp:253-266`): the link cells across a tile at each level. */
const LINK_WIDTHS: readonly number[] = [128, 64, 32, 16, 8, 4, 2];
/** `nRange` of the camera's `IntersectObjLine2` (`WorldIntersect.cpp:851`): the reach of `objectsNear`. */
const LINK_RANGE = 5;
/** `objectsNear` keeps this many answers, until the objects change. */
const MEMO_SIZE = 256;

const NO_OBJECTS: readonly CollisionObject[] = Object.freeze([]);

/** What `place` reads from a tile. */
export type TileObjects = Pick<WebTile, 'x' | 'y' | 'objects'>;

/** A model's shape, by its collision key. */
interface Shape {
  /** Tiles holding it. */
  refs: number;
  /** The triangles once they have arrived; null for a shape that failed (reported). Never rejects. */
  ready: Promise<Float32Array | null>;
}

interface TileRecord {
  tile: TileObjects;
  /** The collision keys the tile holds (once its shapes were asked for). */
  keys: Set<string>;
  started: boolean;
  /** Each link level's cells (`y * width + x` in the tile) to their lists; null until the tile's shapes are in. */
  links: Map<number, CollisionObject[]>[] | null;
  /** Its shapes are in and linked (or failed). Never rejects. */
  settled: Promise<void>;
  released: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The collision file of a model key: `models/<stem>.glb` has `collision/<stem>.bin` (Ruling 28), or null. */
function collisionKeyOf(model: string): string | null {
  const match = /^models\/(.+)\.glb$/.exec(model);
  return match === null ? null : collisionKey(match[1]!);
}

/** The bounds of a mesh, `[minX, minY, minZ]` and `[maxX, maxY, maxZ]`, or null for one without triangles. */
function boundsOf(triangles: Float32Array): [number[], number[]] | null {
  if (triangles.length < 9) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangles.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, triangles[i + k]!);
      max[k] = Math.max(max[k]!, triangles[i + k]!);
    }
  }
  return [min, max];
}

/** `D3DXVec3Transform`'s x and z of `v` (a row vector) through `m` (`D3DXMATRIX` memory order), in floats. */
function transformXZ(v: number[], m: Float32Array): [number, number] {
  const axis = (c: number): number =>
    f32(f32(f32(f32(v[0]! * m[c]!) + f32(v[1]! * m[4 + c]!)) + f32(v[2]! * m[8 + c]!)) + m[12 + c]!);
  return [axis(0), axis(2)];
}

/** `CObj::CalcLinkLevel` (`Obj.cpp:974-1020`, the client's code) for a model box `[min, max]` at `matrix`. */
function linkLevel([min, max]: [number[], number[]], matrix: Float32Array, mpu: number): number {
  const [minX, minZ] = transformXZ(min, matrix);
  const [maxX, maxZ] = transformXZ(max, matrix);
  const dx = f32(maxX - minX);
  const dz = f32(maxZ - minZ);
  const width = Math.abs(Math.abs(dx) > Math.abs(dz) ? dx : dz);
  let widthLink = MAP_SIZE * 2;
  let level = 0;
  for (; level < MAX_LINKLEVEL; level++) {
    widthLink = Math.max(1, Math.trunc(widthLink / 2));
    const perGrid = Math.trunc((MAP_SIZE * mpu) / widthLink); // MAP_SIZE * MPU / nWidthLink, in ints
    if (width < perGrid) break;
  }
  return Math.min(level, MAX_LINKLEVEL - 1);
}

/**
 * `CLandscape::InsertObjLink` (`lod.cpp:1439-1481`): the cell of `level` that the object at `matrix` goes in, on the
 * tile at column `tx`, row `ty`; null where the C++ does not link it.
 */
function linkCell(matrix: Float32Array, tx: number, ty: number, level: number, mpu: number): number | null {
  const x = f32(f32(matrix[12]! / mpu) - tx * MAP_SIZE); // vPos.x /= MPU; vPos.x -= m_nWorldX
  const z = f32(f32(matrix[14]! / mpu) - ty * MAP_SIZE);
  const width = LINK_WIDTHS[level]!;
  const unit = MAP_SIZE / width;
  const cell = Math.trunc(Math.trunc(z) / unit) * width + Math.trunc(Math.trunc(x) / unit);
  return cell >= 0 && cell < width * width ? cell : null;
}

/** Collision shapes of the tiles a `TileStreamer` holds (see the top of the file). */
export class CollisionShapes {
  private readonly shapes = new Map<string, Shape>();
  /** By `y * world width + x`. */
  private readonly tiles = new Map<number, TileRecord>();
  private active = false;
  /** `objectsNear`'s answers, by what FOR_LINKMAP reads from the point; emptied whenever the links change. */
  private readonly memo = new Map<string, readonly CollisionObject[]>();

  constructor(
    private readonly store: Pick<AssetStore, 'url' | 'bytes'>,
    private readonly manifest: Pick<WorldManifest, 'mpu' | 'size' | 'models' | 'modelTrans'>,
    private readonly overlay: Pick<Overlay, 'error'>,
  ) {}

  /** From now on the shapes are downloaded: those of the tiles already placed now, the others as they are placed. */
  activate(): void {
    if (this.active) return;
    this.active = true;
    for (const record of this.tiles.values()) this.load(record);
  }

  /**
   * The objects of `tile`, whose shapes are downloaded and linked (once `activate` has been called; until then only
   * remembered). Resolves once they are in, at once before `activate`; never rejects. The tile holds its shapes until
   * `releaseTile`.
   */
  place(tile: TileObjects): Promise<void> {
    this.releaseTile(`${tile.x}_${tile.y}`);
    const record: TileRecord = {
      tile, keys: new Set(), started: false, links: null, settled: Promise.resolve(), released: false,
    };
    this.tiles.set(this.indexOf(tile.x, tile.y), record);
    if (this.active) this.load(record);
    return record.settled;
  }

  /** Lets go of the tile's objects and of the shapes no other tile holds. Nothing happens for an unknown tile. */
  releaseTile(key: string): void {
    const [x, y] = key.split('_').map(Number) as [number, number];
    const index = this.indexOf(x, y);
    const record = this.tiles.get(index);
    if (record === undefined) return;
    this.tiles.delete(index);
    record.released = true;
    for (const shape of record.keys) this.release(shape);
    if (record.links !== null) this.memo.clear();
  }

  /**
   * `Ground.objectsNear`: the objects around D3D (x, z), as `FOR_LINKMAP( this, vPos, pObj, 5, CObj::linkStatic, ... )`
   * visits them (`World.h:865-904`, the client's `#else`): link level by link level, the level's cells around the
   * point row by row and column by column, in the loaded tiles, then each cell's list. Its cells: the point's cell of
   * the level, `nRange` 5 cells of level 0 each way taken in the level's cells, and one more cell on the side of the
   * cell the point is nearer to (`_nX`, `_nZ`); clipped to the world.
   */
  objectsNear(x: number, z: number): readonly CollisionObject[] {
    const { mpu, size } = this.manifest;
    const linkX = Math.trunc(f32(x / mpu)); // (int)( _vPos.x / m_iMPU )
    const linkZ = Math.trunc(f32(z / mpu));
    const atX = Math.trunc(x); // (int)( _vPos.x )
    const atZ = Math.trunc(z);
    const key = `${linkX} ${linkZ} ${atX} ${atZ}`;
    const known = this.memo.get(key);
    if (known !== undefined) return known;

    const found: CollisionObject[] = [];
    for (let level = 0; level < MAX_LINKLEVEL; level++) {
      const widthLink = LINK_WIDTHS[level]!;
      const maxWidth = widthLink * size[0];
      const maxHeight = widthLink * size[1];
      const unit = Math.trunc((MAP_SIZE * size[0]) / maxWidth);
      const half = Math.trunc((unit * mpu) / 2);
      const nX = atX - Math.trunc(linkX / unit) * unit * mpu > half ? 1 : 0;
      const nZ = atZ - Math.trunc(linkZ / unit) * unit * mpu > half ? 1 : 0;
      const xMin = Math.max(0, Math.trunc((linkX - LINK_RANGE) / unit) + (nX - 1));
      const zMin = Math.max(0, Math.trunc((linkZ - LINK_RANGE) / unit) + (nZ - 1));
      const xMax = Math.min(maxWidth - 1, Math.trunc((linkX + LINK_RANGE) / unit) + nX);
      const zMax = Math.min(maxHeight - 1, Math.trunc((linkZ + LINK_RANGE) / unit) + nZ);
      for (let j = zMin; j <= zMax; j++) {
        for (let k = xMin; k <= xMax; k++) {
          const links = this.tiles.get(this.indexOf(Math.trunc(k / widthLink), Math.trunc(j / widthLink)))?.links;
          const list = links?.[level]?.get((j % widthLink) * widthLink + (k % widthLink));
          if (list !== undefined) found.push(...list);
        }
      }
    }

    const answer = found.length === 0 ? NO_OBJECTS : Object.freeze(found);
    if (this.memo.size >= MEMO_SIZE) this.memo.clear();
    this.memo.set(key, answer);
    return answer;
  }

  /** The models' shapes held: downloaded, or on their way. */
  shapeCount(): number {
    return this.shapes.size;
  }

  dispose(): void {
    for (const record of [...this.tiles.values()]) this.releaseTile(`${record.tile.x}_${record.tile.y}`);
  }

  private indexOf(x: number, y: number): number {
    return y * this.manifest.size[0] + x;
  }

  private load(record: TileRecord): void {
    if (record.started) return;
    record.started = true;
    const { models, modelTrans } = this.manifest;
    const placed: { key: string; matrix: Float32Array; trans: boolean }[] = [];
    for (const object of record.tile.objects) {
      if (object.model === NO_MODEL) continue;
      const model = models[object.model];
      // (a model index the manifest lacks is reported by the object pool)
      const key = model === undefined ? null : collisionKeyOf(model);
      if (key === null || this.store.url(key) === null) continue; // no collision mesh
      if (!record.keys.has(key)) {
        record.keys.add(key);
        this.acquire(key);
      }
      placed.push({ key, matrix: toWebMatrix(object.matrix), trans: modelTrans?.[object.model] ?? false });
    }
    const keys = [...record.keys];
    const arriving = keys.map((key) => this.shapes.get(key)!.ready);
    record.settled = Promise.all(arriving).then((shapes) => {
      if (record.released) return;
      const triangles = new Map(keys.map((key, i) => [key, shapes[i]!]));
      record.links = this.link(record.tile, placed.map((p) => ({ ...p, triangles: triangles.get(p.key)! })));
      this.memo.clear();
    });
  }

  /** The link lists of a tile's objects, in tile order (see the top of the file). */
  private link(
    tile: TileObjects, placed: { matrix: Float32Array; trans: boolean; triangles: Float32Array | null }[],
  ): Map<number, CollisionObject[]>[] {
    const links = LINK_WIDTHS.map(() => new Map<number, CollisionObject[]>());
    const bounds = new Map<Float32Array, ReturnType<typeof boundsOf>>();
    for (const { matrix, trans, triangles } of placed) {
      if (triangles === null) continue;
      if (!bounds.has(triangles)) bounds.set(triangles, boundsOf(triangles));
      const box = bounds.get(triangles)!;
      if (box === null) continue; // a mesh without faces touches nothing
      const level = linkLevel(box, matrix, this.manifest.mpu);
      const cell = linkCell(matrix, tile.x, tile.y, level, this.manifest.mpu);
      if (cell === null) continue;
      const object: CollisionObject = { triangles, matrix, trans };
      const list = links[level]!.get(cell);
      if (list === undefined) links[level]!.set(cell, [object]);
      else list.splice(1, 0, object); // InsNextNode on the head
    }
    return links;
  }

  private acquire(key: string): void {
    let shape = this.shapes.get(key);
    if (shape === undefined) {
      const created: Shape = { refs: 0, ready: Promise.resolve(null) };
      created.ready = this.store.bytes(key).then(
        (bytes) => decodeCollisionBin(bytes, key),
      ).catch((error: unknown) => {
        this.overlay.error(`shape ${key}: ${messageOf(error)}`);
        return null;
      });
      shape = created;
      this.shapes.set(key, shape);
    }
    shape.refs++;
  }

  private release(key: string): void {
    const shape = this.shapes.get(key);
    if (shape === undefined || --shape.refs > 0) return;
    // a shape still arriving is dropped when it does: nothing holds it
    this.shapes.delete(key);
  }
}
