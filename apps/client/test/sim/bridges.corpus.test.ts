// Movers on Madrigal's real bridges (spec §3.7: "movers stand on bridges and stairs"), on the converted data in the
// worktree's dist/assets (`npm run convert`): the first 12 bridges `obj_mamaprbridge01` and `obj_mamaprbridge02` of
// the world's tiles, in the manifest's order, each with the shapes and land of the 3 x 3 tiles around it, as the world
// screen's stage gives them (`CollisionShapes`, `tileLand`). Each must have a deck to stand on above the terrain, and a
// mover running across one must be carried over the land below. Corpus test (`npm run test:corpus`): skipped without
// the converted files. The rules themselves are unit-tested against hand-made shapes in collision.test.ts.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTileBin, toWebMatrix } from '@flyffweb/formats';
import type { AssetIndex, WebTile, WorldManifest } from '@flyffweb/formats';
import { CollisionShapes, tileLand } from '@flyffweb/scene';
import type { Ground, TileData } from '@flyffweb/scene';
import { ActionMover } from '../../src/world/sim/ActionMover';
import { processUnderCollision } from '../../src/world/sim/collision';
import { ActMsg } from '../../src/world/sim/constants';
import { stepMover } from '../../src/world/sim/moverRules';
import { ASSETS_DIR } from '../helpers/diskAssets';

const INDEX = `${ASSETS_DIR}index.json`;
const BRIDGES = ['models/obj_mamaprbridge01.glb', 'models/obj_mamaprbridge02.glb'];
/** Bridges tested: the first ones met, as many as the review's probe took. */
const COUNT = 12;
/** A run across: from 8 m out on one side, 160 steps of the player's 0.1 (16 m), along x and along z both ways. */
const OUT = 8;
const RUN_STEPS = 160;
const RUNS = [[1, 0, 90], [0, 1, 180], [-1, 0, 270], [0, -1, 0]] as const;

interface Bridge { tile: string; x: number; z: number }

describe.skipIf(!existsSync(INDEX))('movers on the real bridges of Madrigal', () => {
  const files = existsSync(INDEX) ? (JSON.parse(readFileSync(INDEX, 'utf8')) as AssetIndex).files : {};
  const read = (hashed: string): Uint8Array => new Uint8Array(readFileSync(ASSETS_DIR + hashed));
  const manifest = existsSync(INDEX)
    ? (JSON.parse(readFileSync(ASSETS_DIR + files['worlds/wdmadrigal/manifest.json']!, 'utf8')) as WorldManifest)
    : undefined;
  const tiles = new Map<string, WebTile | null>();
  const tileAt = (key: string): WebTile | null => {
    if (!tiles.has(key)) {
      const hashed = manifest!.tiles[key];
      tiles.set(key, hashed === undefined ? null : decodeTileBin(read(hashed), hashed));
    }
    return tiles.get(key)!;
  };

  /** The stage's Ground around tile `key`: the 3 x 3 tiles' land and their objects' shapes, all linked. */
  async function groundAround(key: string): Promise<{ ground: Ground; land: ReturnType<typeof tileLand> }> {
    const store = {
      url: (k: string) => (files[k] === undefined ? null : ASSETS_DIR + files[k]),
      bytes: async (k: string) => read(files[k]!),
    };
    const errors: string[] = [];
    const shapes = new CollisionShapes(store, manifest!, { error: (message) => errors.push(message) });
    shapes.activate();
    const [tx, tz] = key.split('_').map(Number) as [number, number];
    const near = new Map<string, TileData>();
    const placing: Promise<void>[] = [];
    for (let x = tx - 1; x <= tx + 1; x++) {
      for (let z = tz - 1; z <= tz + 1; z++) {
        const tile = tileAt(`${x}_${z}`);
        if (tile === null) continue;
        const data = { x: tile.x, y: tile.y, heights: tile.heights, objects: tile.objects };
        near.set(`${x}_${z}`, data);
        placing.push(shapes.place(data));
      }
    }
    await Promise.all(placing);
    expect(errors).toEqual([]);
    const land = tileLand(manifest!, (x, z) => near.get(`${x}_${z}`) ?? null);
    return { land, ground: { ...land, objectsNear: (x, z, range) => shapes.objectsNear(x, z, range) } };
  }

  function bridges(): Bridge[] {
    const models = new Set(BRIDGES.map((model) => manifest!.models.indexOf(model)));
    expect(models.has(-1)).toBe(false);
    const found: Bridge[] = [];
    for (const key of Object.keys(manifest!.tiles)) {
      for (const object of tileAt(key)!.objects) {
        if (!models.has(object.model)) continue;
        const d3d = toWebMatrix(object.matrix); // a web matrix mirrored back is the D3D one
        found.push({ tile: key, x: d3d[12]!, z: d3d[14]! });
      }
    }
    return found.slice(0, COUNT);
  }

  it('each has a deck to stand on, and a mover running across one is carried over the land below', async () => {
    const tested = bridges();
    expect(tested).toHaveLength(COUNT);
    let highest = 0;
    let carried = 0;
    const lines: string[] = [];
    for (const bridge of tested) {
      const { ground, land } = await groundAround(bridge.tile);
      // a 9 x 9 grid 1 m apart around the bridge's origin, each looked down on from 30 m over the terrain, a metre at a
      // time (ProcessUnderCollision looks 1.5 down): a point stands on the bridge where it finds a floor over the land
      let decks = 0;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const x = bridge.x + i;
          const z = bridge.z + j;
          const terrain = land.terrainHeight(x, z) ?? 0;
          for (let y = terrain + 30; y > terrain - 2; y -= 1) {
            const floor = processUnderCollision([0, 0, 0], [x, y, z], ground);
            if (floor > terrain + 0.3 && floor <= y) {
              decks++;
              break;
            }
          }
        }
      }
      expect(decks, `bridge at ${bridge.x.toFixed(1)}, ${bridge.z.toFixed(1)}`).toBeGreaterThan(0);

      for (const [dx, dz, angle] of RUNS) {
        const sx = bridge.x - dx * OUT;
        const sz = bridge.z - dz * OUT;
        const act = new ActionMover({ pos: [sx, land.terrainHeight(sx, sz) ?? 0, sz], angle, speed: 0.1 });
        const mover = { objectId: 1, act, dest: null, corr: null, speedFactor: 1 };
        act.sendActMsg(ActMsg.FORWARD);
        let over = 0;
        for (let s = 0; s < RUN_STEPS; s++) {
          stepMover(mover, () => undefined, ground);
          const p = act.body.pos;
          over = Math.max(over, p[1] - (land.terrainHeight(p[0], p[2]) ?? 0));
        }
        highest = Math.max(highest, over);
        if (over > 3) carried++;
        lines.push(`${bridge.x.toFixed(1)}, ${bridge.z.toFixed(1)} angle ${angle}: up to ${over.toFixed(2)} m over the land`);
      }
    }
    console.log(`Madrigal bridges: ${COUNT} with a deck; ${carried} of ${COUNT * RUNS.length} runs carried more than 3 m `
      + `over the land, the highest ${highest.toFixed(2)} m\n  ${lines.join('\n  ')}`);
    // the deck carries a runner high over the river or the road under it: on the real data up to 18 m
    expect(highest).toBeGreaterThan(10);
    expect(carried).toBeGreaterThanOrEqual(8);
  });
});
