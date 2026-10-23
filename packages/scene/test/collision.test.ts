import { HGT, MAP_SIZE, NUM_PATCHES_PER_SIDE, encodeCollisionBin, toWebMatrix } from '@flyffweb/formats';
import type { Vec3, WebTile, WebTileObject, WorldManifest } from '@flyffweb/formats';
import { Group, Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SceneServices } from '../src/boot';
import { WorldStage } from '../src/world/WorldStage';
import { CollisionShapes } from '../src/world/collision';
import type { TileObjects } from '../src/world/collision';
import { tileLand } from '../src/world/ground';
import type { CollisionObject } from '../src/world/ground';

/** Madrigal's meters per unit: a tile is 512 m across. */
const MPU = 4;
const TILE_METERS = MAP_SIZE * MPU;
const SIDE = MAP_SIZE + 1;
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;

// The models of the hand-made world, by their index in `manifest.models`.
const WALL = 0;
const GLASS = 1;
/** Has no collision file. */
const TREE = 2;
const BOX = 3;
/** 20 m across: linked at level 3, whose cells are 32 m (`CalcLinkLevel`). */
const BIG = 4;

/** One triangle a meter across (level 0, whose cells are 4 m). */
const SMALL_TRIANGLE = [0, 0, 0, 1, 0, 0, 0, 1, 0];
/** The collision files the store has, by key. */
const SHAPES: Record<string, number[]> = {
  'collision/obj_wall.bin': [...SMALL_TRIANGLE, 0, 1, 0, 1, 0, 0, 1, 1, 0],
  'collision/obj_glass.bin': SMALL_TRIANGLE,
  'collision/obj_box.bin': [0, 0, 0, 0.5, 0, 0, 0, 0.5, 0],
  'collision/obj_big.bin': [-10, 0, 0, 10, 0, 0, 0, 1, 0],
};

/** `modelTrans` or `modelPick` null: a manifest written before it existed. The wall is the one pickable model. */
function makeManifest(
  modelTrans: boolean[] | null = [false, true, false, false, false],
  modelPick: boolean[] | null = [true, false, false, false, false],
): WorldManifest {
  return {
    name: 'WdTest',
    size: [4, 4],
    mpu: MPU,
    mapSize: 128,
    ambient: 0,
    bgColor: 0,
    fog: { start: 70, end: 400, density: 0 },
    camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
    terrainTextures: [],
    models: ['models/obj_wall.glb', 'models/obj_glass.glb', 'models/obj_tree.glb', 'models/obj_box.glb', 'models/obj_big.glb'],
    ...(modelTrans === null ? {} : { modelTrans }),
    ...(modelPick === null ? {} : { modelPick }),
    tiles: {},
  };
}

/** A D3D translation matrix (`D3DXMATRIX` memory order). */
const d3dAt = (x: number, y: number, z: number): Float32Array =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

/** An object of `model` at D3D (x, y, z), as a tile stores it: its matrix in web space. */
const placedAt = (model: number, x: number, y: number, z: number): WebTileObject => ({
  model, matrix: toWebMatrix(d3dAt(x, y, z)),
});

/** A store with the collision files of SHAPES; it counts what was downloaded. */
function fakeStore() {
  return {
    url: vi.fn((key: string) => (Object.hasOwn(SHAPES, key) ? `/assets/${key}` : null)),
    bytes: vi.fn(async (key: string) => encodeCollisionBin(new Float32Array(SHAPES[key]!))),
  };
}

function setup(manifest = makeManifest()) {
  const store = fakeStore();
  const overlay = { error: vi.fn((_message: string) => {}) };
  const shapes = new CollisionShapes(store, manifest, overlay);
  const downloads = () => store.bytes.mock.calls.map(([key]) => key).sort();
  return { store, overlay, shapes, downloads };
}

const tile = (x: number, y: number, objects: WebTileObject[]): TileObjects => ({ x, y, objects });

/** The D3D position of a placed object. */
const positionOf = (object: CollisionObject): number[] => Array.from(object.matrix.subarray(12, 15));

describe('CollisionShapes', () => {
  it("loads the shapes of a tile's objects and frees them with the tile", async () => {
    const { shapes, downloads } = setup();
    shapes.activate();

    await shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10), placedAt(TREE, 12, 0, 10), placedAt(WALL, 14, 0, 10), placedAt(BOX, 16, 0, 10)]));

    // the tree has no collision file; the wall's is downloaded once for both walls
    expect(downloads()).toEqual(['collision/obj_box.bin', 'collision/obj_wall.bin']);
    expect(shapes.shapeCount()).toBe(2);
    const near = shapes.objectsNear(12, 10, 5);
    expect(near.map(positionOf)).toEqual([[10, 0, 10], [14, 0, 10], [16, 0, 10]]);
    expect(near[0]!.triangles).toBe(near[1]!.triangles); // one decoded shape for both walls
    expect(Array.from(near[0]!.triangles)).toEqual(SHAPES['collision/obj_wall.bin']);

    shapes.releaseTile('0_0');

    expect(shapes.shapeCount()).toBe(0);
    expect(shapes.objectsNear(12, 10, 5)).toEqual([]);
  });

  it('keeps a shape that another loaded tile still uses, and downloads it once', async () => {
    const { shapes, downloads } = setup();
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10), placedAt(BOX, 16, 0, 10)]));
    await shapes.place(tile(1, 0, [placedAt(WALL, TILE_METERS + 10, 0, 10)]));
    expect(downloads()).toEqual(['collision/obj_box.bin', 'collision/obj_wall.bin']);

    shapes.releaseTile('0_0');

    expect(shapes.shapeCount()).toBe(1); // the box is let go, the wall stays for tile 1_0
    expect(shapes.objectsNear(TILE_METERS + 10, 10, 5).map(positionOf)).toEqual([[TILE_METERS + 10, 0, 10]]);
    shapes.releaseTile('1_0');
    expect(shapes.shapeCount()).toBe(0);
  });

  it('lets go of a shape that arrives after its tile left', async () => {
    const { shapes, store } = setup();
    let arrive: () => void = () => {};
    store.bytes.mockImplementationOnce(async (key: string) => {
      await new Promise<void>((resolve) => (arrive = resolve));
      return encodeCollisionBin(new Float32Array(SHAPES[key]!));
    });
    shapes.activate();
    const settled = shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10)]));
    shapes.releaseTile('0_0');
    arrive();
    await settled;

    expect(shapes.shapeCount()).toBe(0);
    expect(shapes.objectsNear(10, 10, 5)).toEqual([]);
  });

  it('objectsNear returns the shapes of the tiles around the point', async () => {
    const { shapes } = setup();
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(WALL, TILE_METERS - 2, 0, 10)]));
    await shapes.place(tile(1, 0, [placedAt(BOX, TILE_METERS + 2, 0, 10), placedAt(WALL, TILE_METERS + 400, 0, 10)]));

    // both sides of the tiles' border, the nearer cells' first (column by column); in D3D, the tile's web matrix mirrored back
    const border = shapes.objectsNear(TILE_METERS, 10, 5);
    expect(border.map(positionOf)).toEqual([[TILE_METERS - 2, 0, 10], [TILE_METERS + 2, 0, 10]]);
    expect(Array.from(border[0]!.matrix)).toEqual(Array.from(d3dAt(TILE_METERS - 2, 0, 10)));
    expect(shapes.objectsNear(TILE_METERS + 400, 10, 5).map(positionOf)).toEqual([[TILE_METERS + 400, 0, 10]]);
    // beyond the camera's reach, and where no tile is loaded
    expect(shapes.objectsNear(TILE_METERS + 200, 10, 5)).toEqual([]);
    expect(shapes.objectsNear(3 * TILE_METERS, 10, 5)).toEqual([]);
  });

  it('objectsNear reaches nRange cells of level 0 each way: 0 for the movers, 5 for the camera, each answer kept apart', async () => {
    const { shapes } = setup();
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10), placedAt(WALL, 26, 0, 10), placedAt(WALL, 10, 0, 2)]));

    // (10, 10) is 2 m into level 0's cell (2, 2), not past its middle: nRange 0 takes cells 1 and 2 in x and in z
    // (FOR_LINKMAP's _nX, _nZ), so not the objects 4 cells east (cell 6) or 2 cells north (cell 0)
    expect(shapes.objectsNear(10, 10, 0).map(positionOf)).toEqual([[10, 0, 10]]);
    // nRange 5 takes 5 cells more each way (clipped to the world): row 0 first, then row 2 west to east
    expect(shapes.objectsNear(10, 10, 5).map(positionOf)).toEqual([[10, 0, 2], [10, 0, 10], [26, 0, 10]]);
    // the answers are kept by range: the same point asked again gives each its own
    expect(shapes.objectsNear(10, 10, 0).map(positionOf)).toEqual([[10, 0, 10]]);
    // the other cell is the one on the side of the cell's middle the point is on, in whole meters ((int)_vPos.x): 7 is
    // past the middle of cell 1 (6), so cells 1 and 2; 6 is not, so cells 0 and 1; 11, past cell 2's (10), cells 2 and 3
    expect(shapes.objectsNear(7, 7, 0).map(positionOf)).toEqual([[10, 0, 10]]);
    expect(shapes.objectsNear(6, 6, 0)).toEqual([]);
    expect(shapes.objectsNear(11, 11, 0).map(positionOf)).toEqual([[10, 0, 10]]);
    expect(shapes.objectsNear(11, 1, 0).map(positionOf)).toEqual([[10, 0, 2]]);
  });

  it('lists the objects as FOR_LINKMAP visits them: by link level, then row by row, then each cell\'s list', async () => {
    const { shapes } = setup();
    shapes.activate();
    // in tile order: A, D, B, the big one, E, C; A, B and C share the cell (2, 2) of level 0, 4 m square
    const at = (model: number, x: number, z: number, name: string) => ({ name, x, z, object: placedAt(model, x, 0, z) });
    const placed = [
      at(WALL, 9, 9, 'A'), at(WALL, 5, 13, 'D'), at(WALL, 9.5, 9.5, 'B'), at(BIG, 12, 12, 'big'), at(WALL, 13, 5, 'E'),
      at(WALL, 10, 9, 'C'),
    ];
    await shapes.place(tile(0, 0, placed.map((p) => p.object)));
    const names = new Map(placed.map((p) => [[p.x, 0, p.z].join(), p.name]));

    const order = shapes.objectsNear(10, 10, 5).map((o) => names.get(positionOf(o).join()));

    // level 0: row 1 (E), row 2 (the cell's head A, then the later ones last first: C, B), row 3 (D); then level 3
    expect(order).toEqual(['E', 'A', 'C', 'B', 'D', 'big']);
  });

  it("a translucent model's object comes out with trans: true", async () => {
    const { shapes } = setup();
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(GLASS, 10, 0, 10), placedAt(WALL, 12, 0, 10)]));

    expect(shapes.objectsNear(10, 10, 5).map((o) => o.trans)).toEqual([true, false]);

    // a manifest written before modelTrans: nothing is see-through
    const old = setup(makeManifest(null));
    old.shapes.activate();
    await old.shapes.place(tile(0, 0, [placedAt(GLASS, 10, 0, 10)]));
    expect(old.shapes.objectsNear(10, 10, 5).map((o) => o.trans)).toEqual([false]);
  });

  it("a pickable model's object comes out with pick: true", async () => {
    const { shapes } = setup();
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(GLASS, 10, 0, 10), placedAt(WALL, 12, 0, 10)]));

    expect(shapes.objectsNear(10, 10, 5).map((o) => o.pick)).toEqual([false, true]);

    // a manifest written before modelPick: nothing is pickable
    const old = setup(makeManifest(undefined, null));
    old.shapes.activate();
    await old.shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10)]));
    expect(old.shapes.objectsNear(10, 10, 5).map((o) => o.pick)).toEqual([false]);
  });

  it('downloads nothing before activate, then the shapes of the tiles it was given', async () => {
    const { shapes, downloads } = setup();
    await shapes.place(tile(0, 0, [placedAt(WALL, 10, 0, 10)]));
    expect(downloads()).toEqual([]);
    expect(shapes.objectsNear(10, 10, 5)).toEqual([]);

    shapes.activate();
    await vi.waitFor(() => expect(shapes.objectsNear(10, 10, 5)).toHaveLength(1));
    expect(downloads()).toEqual(['collision/obj_wall.bin']);
  });

  it('reports a shape that cannot be had, and links the others', async () => {
    const { shapes, store, overlay } = setup();
    store.bytes.mockImplementationOnce(async () => {
      throw new Error('could not load collision/obj_box.bin after 4 attempts: HTTP 503');
    });
    shapes.activate();
    await shapes.place(tile(0, 0, [placedAt(BOX, 16, 0, 10), placedAt(WALL, 10, 0, 10)]));

    expect(overlay.error).toHaveBeenCalledWith(
      'shape collision/obj_box.bin: could not load collision/obj_box.bin after 4 attempts: HTTP 503',
    );
    expect(shapes.objectsNear(12, 10, 5).map(positionOf)).toEqual([[10, 0, 10]]);
  });
});

/** A tile of flat land at height `h`, with `objects`; its patch attributes say "no walking" everywhere, which nothing reads. */
function landTile(x: number, y: number, objects: WebTileObject[] = [], h = 5): WebTile {
  return {
    x, y, heights: new Float32Array(SIDE * SIDE).fill(h), water: new Uint8Array(PATCHES * 2),
    landAttr: new Uint8Array(PATCHES).fill(1), layers: [], objects,
  };
}

describe('tileLand', () => {
  it('landAttr reads the patch', () => {
    // the HGT_* flag on the height at a cell's corner is the attribute of the whole cell (CWorld::GetHeightAttribute)
    const land = landTile(1, 0);
    land.heights[2 + 3 * SIDE] = 5 + HGT.NOWALK;
    land.heights[4 + 3 * SIDE] = 5 + HGT.NOMOVE;
    const ground = tileLand(makeManifest(), (tx, tz) => (tx === 1 && tz === 0 ? land : null));
    const xOf = (gx: number, dx = 0): number => (MAP_SIZE + gx + dx) * MPU;

    expect(ground.landAttr(xOf(2), 3 * MPU)).toBe(1); // HATTR_NOWALK
    expect(ground.landAttr(xOf(2, 0.99), 3.99 * MPU)).toBe(1);
    expect(ground.landAttr(xOf(4, 0.5), 3.5 * MPU)).toBe(3); // HATTR_NOMOVE
    // the neighbour cells, the tile's patch attributes (all 1), a tile not loaded and off the world: nothing
    expect(ground.landAttr(xOf(1, 0.99), 3 * MPU)).toBe(0);
    expect(ground.landAttr(xOf(3, 0.5), 3.5 * MPU)).toBe(0);
    expect(ground.landAttr(10, 10)).toBe(0);
    expect(ground.landAttr(-1, 10)).toBe(0);
  });

  it('gives the land height without the flags, and the land triangle of GetLandTri, where a tile is loaded', () => {
    const land = landTile(0, 0);
    land.heights[1 + SIDE] = 5 + HGT.NOWALK;
    const ground = tileLand(makeManifest(), (tx, tz) => (tx === 0 && tz === 0 ? land : null));

    expect(ground.terrainHeight(6, 6)).toBe(5);
    expect(ground.terrainHeight(TILE_METERS + 6, 6)).toBeNull();
    const out = new Float32Array(9);
    expect(ground.landTri(3, 1, out)).toBe(true);
    // the cell (0, 0) is even: under its cut (0, 0)-(1, 1) the corners 0, 3, 1; the corner (1, 1) stands at 5 all the same
    expect(Array.from(out)).toEqual([0, 5, 0, 4, 5, 4, 4, 5, 0]);
    expect(ground.landTri(TILE_METERS + 1, 1, new Float32Array(9))).toBe(false);
  });
});

/** Services without a GPU, with a store whose tiles are `tiles` (flat ground elsewhere) and whose models are empty. */
function stageServices(manifest: WorldManifest, tiles: Record<string, WebTile>) {
  const shapes = fakeStore();
  const store = {
    manifest: vi.fn(async () => manifest),
    tile: vi.fn(async (_world: string, x: number, y: number) => tiles[`${x}_${y}`] ?? null),
    url: shapes.url,
    bytes: vi.fn(async (key: string) => (key.startsWith('collision/') ? shapes.bytes(key) : new Uint8Array(4))),
  };
  const renderer = { getSize: (target: Vector2) => target.set(1280, 720), render: () => {} };
  const overlay = { error: vi.fn(), addGpuBytes: vi.fn() };
  const textures = { acquire: vi.fn(), release: vi.fn() };
  const loaders = { gltf: { parseAsync: vi.fn(async () => ({ scene: new Group(), animations: [] })) }, ktx2: {} };
  const services = { renderer, store, loaders, textures, overlay } as unknown as SceneServices;
  const downloads = () => store.bytes.mock.calls.map(([key]) => key).filter((key) => key.startsWith('collision/'));
  return { services, store, overlay, downloads };
}

/** Web coordinates of D3D (x, z), on the ground. */
const web = (x: number, z: number): Vec3 => [x, 0, 0 - z];

describe('WorldStage.ground', () => {
  it('downloads no shape until it is asked for (the viewer never asks)', async () => {
    const fake = stageServices(makeManifest(), { '0_0': landTile(0, 0, [placedAt(WALL, 10, 5, 10)]) });
    const stage = await WorldStage.open('wdtest', fake.services, 1);
    stage.focus(web(10, 10));
    await stage.ready();
    expect(fake.downloads()).toEqual([]);

    const ground = stage.ground();

    expect(ground).toBe(stage.ground());
    await vi.waitFor(() => expect(ground.objectsNear(10, 10, 5)).toHaveLength(1));
    expect(fake.downloads()).toEqual(['collision/obj_wall.bin']);
    stage.dispose();
  });

  it('stands on the land of the tiles that are in and holds their objects, in D3D x and z', async () => {
    const land = landTile(0, 0, [placedAt(WALL, 10, 5, 10)]);
    land.heights[2 + 3 * SIDE] = 5 + HGT.NOWALK;
    const fake = stageServices(makeManifest(), { '0_0': land });
    const stage = await WorldStage.open('wdtest', fake.services, 1);
    const { terrainHeight, landAttr, landTri, objectsNear } = stage.ground();
    stage.focus(web(10, 10));
    await stage.ready(); // the shapes of tiles that come after `ground` are in with them

    // the members work on their own (no `this`)
    expect(terrainHeight(10, 10)).toBe(5);
    expect(landAttr(2.5 * MPU, 3.5 * MPU)).toBe(1);
    expect(landTri!(1, 1, new Float32Array(9))).toBe(true);
    expect(objectsNear(10, 10, 5).map(positionOf)).toEqual([[10, 5, 10]]);
    // tile 1_0 is flat ground (the world has none there): height 0, no land attributes, no objects
    expect(terrainHeight(TILE_METERS + 10, 10)).toBe(0);
    expect(landAttr(TILE_METERS + 10, 10)).toBe(0);
    // a tile out of range is not loaded
    expect(terrainHeight(3 * TILE_METERS + 10, 10)).toBeNull();
    stage.dispose();
  });

  it("gives no land of a tile until its shapes are linked, so a mover on a bridge's deck stays put instead of falling", async () => {
    // the wall's collision file comes only when the test lets it
    const fake = stageServices(makeManifest(), { '0_0': landTile(0, 0, [placedAt(WALL, 10, 5, 10)]) });
    let arrive!: () => void;
    const held = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const bytes = fake.store.bytes.getMockImplementation()!;
    fake.store.bytes.mockImplementation(async (key: string) => {
      if (key.startsWith('collision/')) await held;
      return bytes(key);
    });
    const stage = await WorldStage.open('wdtest', fake.services, 1);
    const ground = stage.ground();
    stage.focus(web(10, 10));
    await vi.waitFor(() => expect(stage.heightAt(web(10, 10))).toBe(5)); // the tile is in, its shapes are not

    // the rules see no land there yet (a mover there stays where it is, as on land not loaded)...
    expect(ground.terrainHeight(10, 10)).toBeNull();
    expect(ground.landTri!(1, 1, new Float32Array(9))).toBe(false);
    expect(ground.objectsNear(10, 10, 0)).toEqual([]);
    // ...while flat ground, which places no shapes, is land at once
    expect(ground.terrainHeight(TILE_METERS + 10, 10)).toBe(0);

    arrive();
    await stage.ready();
    expect(ground.terrainHeight(10, 10)).toBe(5);
    expect(ground.landTri!(1, 1, new Float32Array(9))).toBe(true);
    expect(ground.objectsNear(10, 10, 0).map(positionOf)).toEqual([[10, 5, 10]]);
    stage.dispose();
  });

  it("frees a tile's shapes when the tile leaves", async () => {
    const fake = stageServices(makeManifest(), { '0_0': landTile(0, 0, [placedAt(WALL, 10, 5, 10)]) });
    const stage = await WorldStage.open('wdtest', fake.services, 0);
    const ground = stage.ground();
    stage.focus(web(10, 10));
    await stage.ready();
    expect(ground.objectsNear(10, 10, 5)).toHaveLength(1);

    stage.focus(web(3 * TILE_METERS + 10, 10)); // tiles 2_0 to 3_1: 0_0 leaves
    await stage.ready();

    expect(ground.objectsNear(10, 10, 5)).toEqual([]);
    // the shape was let go: coming back downloads it again
    stage.focus(web(10, 10));
    await stage.ready();
    expect(ground.objectsNear(10, 10, 5)).toHaveLength(1);
    expect(fake.downloads()).toEqual(['collision/obj_wall.bin', 'collision/obj_wall.bin']);
    stage.dispose();
  });
});
