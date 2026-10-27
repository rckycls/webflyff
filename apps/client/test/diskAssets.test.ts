import { describe, expect, it } from 'vitest';
import { HGT, encodeCollisionBin, toWebMatrix } from '@flyffweb/formats';
import type { Vec3, WebTile, WorldManifest } from '@flyffweb/formats';
import type { MoverLook } from '../src/world/render/looks';
import { HAttr } from '../src/world/sim/collision';
import { Terrain, drawnBox, glbJson, glbSceneExtras, placedObjects } from './helpers/diskAssets';
import type { DiskAssets } from './helpers/diskAssets';
import { gameDataOf } from './helpers/movers';
import { itemProp } from './helpers/ownState';

const MPU = 4;
const SIDE = 129;

/** A Terrain of one tile (column 1, row 0) whose heights are `heights`, read from a hand-made store. */
function terrainOf(heights: Float32Array): Terrain {
  const tile: WebTile = { x: 1, y: 0, heights, water: new Uint8Array(512), landAttr: new Uint8Array(256), layers: [], objects: [] };
  const assets = { tile: (path: string) => (path === 'tiles/1_0.bin' ? tile : undefined) } as unknown as DiskAssets;
  const manifest = { mpu: MPU, size: [2, 1], tiles: { '1_0': 'tiles/1_0.bin' } } as unknown as WorldManifest;
  return new Terrain(assets, manifest);
}

/** World D3D x of tile 1's cell column `gx`, plus `dx` cells. */
const xOf = (gx: number, dx = 0): number => (128 + gx + dx) * MPU;

describe('Terrain (the live test\'s ground from the converted tiles)', () => {
  it('landAttrAt reads the HGT_* flag on the height at the corner of the cell (CWorld::GetHeightAttribute)', () => {
    const heights = new Float32Array(SIDE * SIDE).fill(5);
    heights[2 + 3 * SIDE] = 5 + HGT.NOWALK;
    heights[4 + 3 * SIDE] = 5 + HGT.NOMOVE;
    heights[6 + 3 * SIDE] = 5 + HGT.DIE;
    heights[8 + 3 * SIDE] = 5 + HGT.NOFLY;
    const terrain = terrainOf(heights);
    // the whole cell from the corner (2, 3) up to the next corners reads the corner's flag
    expect(terrain.landAttrAt(xOf(2), 3 * MPU)).toBe(HAttr.NOWALK);
    expect(terrain.landAttrAt(xOf(2, 0.99), 3.99 * MPU)).toBe(HAttr.NOWALK);
    expect(terrain.landAttrAt(xOf(1, 0.99), 3 * MPU)).toBe(HAttr.NONE);
    expect(terrain.landAttrAt(xOf(4, 0.5), 3.5 * MPU)).toBe(HAttr.NOMOVE);
    expect(terrain.landAttrAt(xOf(6, 0.5), 3.5 * MPU)).toBe(HAttr.DIE);
    expect(terrain.landAttrAt(xOf(8, 0.5), 3.5 * MPU)).toBe(HAttr.NOFLY);
    // the tile's patch attributes are not read; off the tiles is nothing
    expect(terrain.landAttrAt(10, 10)).toBe(HAttr.NONE);
    expect(terrain.ground.landAttr(xOf(2), 3 * MPU)).toBe(HAttr.NOWALK);
  });

  it('landTri gives the triangle of GetLandTri from the heights, without their flags', () => {
    // heights 10 gx + gz, the corner (1, 1) flagged no-walk (it still stands at 11)
    const heights = new Float32Array(SIDE * SIDE);
    for (let gz = 0; gz < SIDE; gz++) for (let gx = 0; gx < SIDE; gx++) heights[gx + gz * SIDE] = 10 * gx + gz;
    heights[1 + SIDE] = 11 + HGT.NOWALK;
    const terrain = terrainOf(heights);
    const at = (x: number, z: number): number[] => {
      const out = new Float32Array(9);
      expect(terrain.ground.landTri!(x, z, out)).toBe(true);
      return Array.from(out);
    };
    const c = (gx: number, gz: number): number[] => [xOf(gx), 10 * gx + gz, gz * MPU];
    // cell (0, 0) is even: under its cut (0, 0)-(1, 1) the corners 0, 3, 1; cell (1, 0) is odd: before its cut 0, 2, 1
    expect(at(xOf(0, 0.75), 0.25 * MPU)).toEqual([...c(0, 0), ...c(1, 1), ...c(1, 0)]);
    expect(at(xOf(0, 0.25), 0.75 * MPU)).toEqual([...c(0, 0), ...c(0, 1), ...c(1, 1)]);
    expect(at(xOf(1, 0.25), 0.25 * MPU)).toEqual([...c(1, 0), ...c(1, 1), ...c(2, 0)]);
    expect(at(xOf(1, 0.75), 0.75 * MPU)).toEqual([...c(2, 0), ...c(1, 1), ...c(2, 1)]);
    expect(terrain.ground.landTri!(10, 10, new Float32Array(9))).toBe(false); // tile 0 is not there
  });
});

/** A glb of a JSON chunk alone holding `json`: the 12-byte header, then the chunk's length and type, padded to 4 with spaces. */
function glbOf(json: unknown): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const chunk = new TextEncoder().encode(text);
  const bytes = new Uint8Array(20 + chunk.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, chunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  bytes.set(chunk, 20);
  return bytes;
}

describe("glbJson and glbSceneExtras (what GLTFLoader puts in a scene's userData)", () => {
  it("reads the glb's JSON chunk, and its scene's extras", () => {
    const box = { bbMin: [0, 0, 0], bbMax: [1, 2, 3] };
    const json = { scenes: [{ extras: box }], animations: [{ name: 'atk', extras: { events: { hit: [12] } } }] };
    expect(glbJson(glbOf(json), 'a.glb')).toEqual(json);
    expect(glbSceneExtras(glbJson(glbOf(json), 'a.glb'))).toEqual(box);
    // the scene the glb names, and none for a scene without extras
    expect(glbSceneExtras({ scene: 1, scenes: [{ extras: { a: 1 } }, { extras: { b: 2 } }] })).toEqual({ b: 2 });
    expect(glbSceneExtras({ scenes: [{}] })).toEqual({});
  });

  it('names a file that is not a glb', () => {
    expect(() => glbJson(new TextEncoder().encode('{"scenes":[{"extras":{}}]}'), 'b.glb')).toThrow('b.glb is not a glb');
  });
});

/** A store of the glbs' scene extras by key (`DiskAssets.has`, `sceneExtras`). */
function extrasStore(extras: Record<string, Record<string, unknown>>): DiskAssets {
  return { has: (key: string) => Object.hasOwn(extras, key), sceneExtras: (key: string) => extras[key]! } as unknown as DiskAssets;
}

const boxExtras = (min: Vec3, max: Vec3): Record<string, unknown> => ({ bbMin: min, bbMax: max });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** A skeleton's grips as the converter writes them, with both forearms. */
const GRIPS = {
  rHand: 17, lHand: 13, rArm: 16, lArm: 12, localRH: IDENTITY, localLH: IDENTITY, localShield: IDENTITY, localKnuckle: IDENTITY,
};
/** A Wooden Sword with a model to hold (`II_WEA_SWO_WOODEN`: `IK3_SWORD`, `PARTS_RWEAPON`). */
const SWORD_DATA = gameDataOf({
  itemProps: new Map([[21, itemProp({ id: 21, kind1: 1, kind2: 2, kind3: 2, part: 10, model: 'models/item_swowooden.glb' })]]),
});
const lookWith = (parts: Partial<MoverLook>): MoverLook => ({
  skeleton: 'skeletons/mvr_male.glb', parts: ['models/part_a.glb', 'models/part_b.glb'], motion: () => null, hairColor: null,
  held: { right: 21, left: null }, ...parts,
});
const PARTS = {
  'models/part_a.glb': boxExtras([-1, 0, -1], [1, 1, 1]),
  'models/part_b.glb': boxExtras([0, 1, 0], [0.5, 2, 0.5]),
  'models/item_swowooden.glb': boxExtras([-0.1, -0.5, -0.1], [0.1, 1.5, 0.1]),
};

describe('drawnBox (the box the views would draw a mover with, from the glbs)', () => {
  it("with a skeleton, unions the parts' boxes and the held items' (assembleCharacter, attachHeld)", () => {
    const assets = extrasStore({ ...PARTS, 'skeletons/mvr_male.glb': { grips: GRIPS } });
    expect(drawnBox(assets, lookWith({}), SWORD_DATA)).toEqual({ min: [-1, -0.5, -1], max: [1, 2, 1] });
  });

  it('leaves the held items out with a skeleton of an older conversion, which has no grips to hang them from', () => {
    const assets = extrasStore({ ...PARTS, 'skeletons/mvr_male.glb': {} });
    expect(drawnBox(assets, lookWith({}), SWORD_DATA)).toEqual({ min: [-1, 0, -1], max: [1, 2, 1] });
  });

  it("without a skeleton, is the first part's box (plainModel)", () => {
    const assets = extrasStore(PARTS);
    expect(drawnBox(assets, lookWith({ skeleton: null }), SWORD_DATA)).toEqual({ min: [-1, 0, -1], max: [1, 1, 1] });
  });

  it('leaves out what the index lacks or has no box, and is null where the views draw no model', () => {
    const assets = extrasStore({ ...PARTS, 'models/part_c.glb': {}, 'skeletons/mvr_male.glb': { grips: GRIPS } });
    const parts = ['models/part_c.glb', 'models/part_missing.glb', 'models/part_b.glb'];
    expect(drawnBox(assets, lookWith({ parts, held: { right: null, left: null } }), SWORD_DATA))
      .toEqual({ min: [0, 1, 0], max: [0.5, 2, 0.5] });
    expect(drawnBox(assets, lookWith({ parts: ['models/part_missing.glb'] }), SWORD_DATA)).toBeNull();
    expect(drawnBox(assets, lookWith({ skeleton: 'skeletons/missing.glb' }), SWORD_DATA)).toBeNull();
    expect(drawnBox(assets, null, SWORD_DATA)).toBeNull();
  });
});

/** An object of the manifest's model 0 at D3D (x, 0, z), as a tile stores it: its matrix in web space. */
const objectAt = (x: number, z: number): WebTile['objects'][number] => ({
  model: 0, matrix: toWebMatrix(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1])),
});
const tileWith = (x: number, y: number, objects: WebTile['objects']): WebTile => ({
  x, y, heights: new Float32Array(SIDE * SIDE), water: new Uint8Array(512), landAttr: new Uint8Array(256), layers: [], objects,
});
/** A wall's one triangle. */
const WALL = [0, 0, 0, 1, 0, 0, 0, 1, 0];

/**
 * A world of 4 x 4 tiles of 512 m, a wall on tile 0_0 at D3D (10, 20) and another on tile 3_3; `read` says whether the
 * wall's shape can be read. `asked` lists the tiles read.
 */
function objectWorld(read: boolean): { assets: DiskAssets; manifest: WorldManifest; asked: string[] } {
  const tiles: Record<string, WebTile> = { 't/0_0': tileWith(0, 0, [objectAt(10, 20)]), 't/3_3': tileWith(3, 3, [objectAt(1800, 1800)]) };
  const asked: string[] = [];
  const assets = {
    tile: (path: string) => {
      asked.push(path);
      return tiles[path]!;
    },
    url: (key: string) => (key === 'collision/obj_wall.bin' ? `/assets/${key}` : null),
    bytes: (key: string) => (read ? Promise.resolve(encodeCollisionBin(new Float32Array(WALL))) : Promise.reject(new Error(`${key} is broken`))),
  } as unknown as DiskAssets;
  const manifest = {
    mpu: MPU, size: [4, 4], models: ['models/obj_wall.glb'], modelTrans: [false], modelPick: [false],
    tiles: { '0_0': 't/0_0', '3_3': 't/3_3' },
  } as unknown as WorldManifest;
  return { assets, manifest, asked };
}

describe("placedObjects (the stage's collision shapes, read from the disk)", () => {
  it('links the shapes of the tiles the stage holds around the point, and no others', async () => {
    const { assets, manifest, asked } = objectWorld(true);
    const shapes = await placedObjects(assets, manifest, 10, 20);
    // tile 0_0 and the two rings past it (the stage's tiles and their preload) are asked for; 3_3 is too far
    expect(asked).toEqual(['t/0_0']);
    const near = shapes.objectsNear(10, 20, 0);
    expect(near.map((object) => Array.from(object.matrix.subarray(12, 15)))).toEqual([[10, 0, 20]]);
    expect(Array.from(near[0]!.triangles)).toEqual(WALL);
  });

  it('throws when a shape cannot be read, which the stage would say on the overlay', async () => {
    const { assets, manifest } = objectWorld(false);
    await expect(placedObjects(assets, manifest, 10, 20)).rejects.toThrow('collision/obj_wall.bin is broken');
  });
});
