// The character list warms the browser's cache with the selected character's world (2026-11-04 loading audit): the
// manifest, the 3 x 3 tiles around its saved place, then those tiles' models, collisions and terrain textures, then the
// models' textures, each once, a few at a time, cancelled when the player moves on.
import { describe, expect, it } from 'vitest';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import { WorldPrefetch, glbTextureKeys } from '../src/lobby/worldPrefetch';
import type { PrefetchStore } from '../src/lobby/worldPrefetch';

/** A GLB of a JSON chunk alone: the materials name their textures in `extras.texture`, as the converter writes them. */
function glb(textures: string[]): ArrayBuffer {
  const json = JSON.stringify({ asset: { version: '2.0' }, materials: textures.map((texture) => ({ extras: { texture } })) });
  const padded = json + ' '.repeat((4 - (json.length % 4)) % 4);
  const body = new TextEncoder().encode(padded);
  const out = new DataView(new ArrayBuffer(12 + 8 + body.length));
  out.setUint32(0, 0x46546c67, true);
  out.setUint32(4, 2, true);
  out.setUint32(8, out.byteLength, true);
  out.setUint32(12, body.length, true);
  out.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out.buffer).set(body, 20);
  return out.buffer;
}

const MANIFEST = {
  name: 'Madrigal', size: [4, 4], mpu: 4, mapSize: 128, tiles: {},
  models: ['models/obj_house.glb', 'models/obj_tree.glb', 'models/obj_far.glb'],
  terrainTextures: ['textures/terrain/grass.dds.ktx2', 'textures/terrain/rock.dds.ktx2'],
} as unknown as WorldManifest;

/** A tile with objects of `models` and layers of `textures` (indexes into the manifest). */
const tile = (x: number, y: number, models: number[], textures: number[]): WebTile => ({
  x, y, objects: models.map((model) => ({ model, matrix: new Float32Array(16) })), layers: textures.map((texture) => ({ texture })),
}) as unknown as WebTile;

function rig(tiles: Map<string, WebTile>, worlds = new Map([[1, 'wdmadrigal']])) {
  const asked: string[] = [];
  const store: PrefetchStore = {
    manifest: async () => MANIFEST,
    tile: async (_world, x, y) => {
      asked.push(`tile ${x}_${y}`);
      return tiles.get(`${x}_${y}`) ?? null;
    },
    url: (key) => (key === 'textures/missing.ktx2' ? null : `/assets/${key}`),
  };
  const fetched: string[] = [];
  let inFlight = 0;
  let most = 0;
  const prefetch = new WorldPrefetch(async () => store, async (id) => worlds.get(id), async (url) => {
    fetched.push(url);
    most = Math.max(most, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    if (url.endsWith('obj_house.glb')) return glb(['textures/obj/house.ktx2', 'textures/obj/roof.ktx2']);
    if (url.endsWith('obj_tree.glb')) return glb(['textures/obj/leaf.ktx2', 'textures/obj/roof.ktx2', 'textures/missing.ktx2']);
    return new ArrayBuffer(8);
  }, 3);
  return { prefetch, asked, fetched, most: () => most };
}

describe('WorldPrefetch', () => {
  // the saved place: tile (1, 1) of a 4 x 4 world of 512 m tiles; D3D z is the web's -z
  const AT: [number, number, number] = [600, 0, 700];

  it("fetches the 3 x 3 tiles around the saved place, then their models, collisions and terrain textures, then the models' textures, each once", async () => {
    const tiles = new Map([['1_1', tile(1, 1, [0, 1, 0], [0])], ['2_2', tile(2, 2, [1], [1])], ['3_3', tile(3, 3, [2], [0])]]);
    const r = rig(tiles);
    await r.prefetch.start(1, AT);
    // (1, 1) and its eight neighbours, inside the world
    expect(r.asked.sort()).toEqual(['tile 0_0', 'tile 0_1', 'tile 0_2', 'tile 1_0', 'tile 1_1', 'tile 1_2', 'tile 2_0', 'tile 2_1', 'tile 2_2'].sort());
    expect([...r.fetched].sort()).toEqual([
      '/assets/collision/obj_house.bin', '/assets/collision/obj_tree.bin',
      '/assets/models/obj_house.glb', '/assets/models/obj_tree.glb',
      '/assets/textures/obj/house.ktx2', '/assets/textures/obj/leaf.ktx2', '/assets/textures/obj/roof.ktx2',
      '/assets/textures/terrain/grass.dds.ktx2', '/assets/textures/terrain/rock.dds.ktx2',
    ]);
    // a model's textures come after the model; the far tile's model is not in reach
    expect(r.fetched.indexOf('/assets/textures/obj/house.ktx2')).toBeGreaterThan(r.fetched.indexOf('/assets/models/obj_house.glb'));
    expect(r.most()).toBeLessThanOrEqual(3);
  });

  it('a new start aborts the last: nothing more of it is fetched; stop() starts nothing new', async () => {
    const tiles = new Map([['1_1', tile(1, 1, [0, 1], [0, 1])]]);
    const r = rig(tiles);
    const first = r.prefetch.start(1, AT);
    r.prefetch.abort();
    await first;
    expect(r.fetched.length).toBeLessThanOrEqual(3);
    const before = r.fetched.length;
    const second = r.prefetch.start(1, AT);
    r.prefetch.stop();
    await second;
    expect(r.fetched.length - before).toBeLessThanOrEqual(3);
  });

  it('a world the catalog has not: nothing, and no throw', async () => {
    const r = rig(new Map(), new Map());
    await r.prefetch.start(99, AT);
    expect([r.asked, r.fetched]).toEqual([[], []]);
  });

  it('reads the texture keys of a GLB, and none of anything else', () => {
    expect(glbTextureKeys(glb(['a.ktx2', 'b.ktx2', 'a.ktx2']))).toEqual(['a.ktx2', 'b.ktx2']);
    expect(glbTextureKeys(new ArrayBuffer(8))).toEqual([]);
  });
});
