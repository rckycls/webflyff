// The client's soak test (Piece 6 M5, spec §3.6: "after a scripted 10-minute loop in the world, memory within 10% of its
// start, and three.js' geometry, texture and program counts back to their start"), as the viewer's (`apps/viewer/e2e/
// soak.spec.ts`) is for the viewer.
//
// Webby runs laps of a square, 600 m on a side, from Flaris' square: the pretend server puts it at each point 50 m apart
// along the square (SETPOS, as a server places a mover), so no wall stops a lap and every lap loads the same tiles. Six
// monsters and three players stand by the square. Back on the square after each lap, the six monsters leave (DEL_OBJ)
// and come back (ADD_OBJ), so their views are freed and rebuilt. Memory is what the Stats panel reports: the GPU estimate
// plus the JS heap. The baseline is taken after the first lap, when everything a lap needs has been loaded once; the last
// lap must stay within 110% of it, and three.js' own counts (`renderer.info`) must be the baseline's.
//
// Every sample is taken on the square, after the tiles around it have settled, and after `gc()`: the soak project starts
// Chromium with `--js-flags=--expose-gc` and precise heap numbers (playwright.config.ts). The test checks that it measures
// what it says: that `gc()` and the heap number are there, that the heap numbers move at all, that the far corner's tiles
// are not the square's (the tiles really streamed), and that the monsters' models went and came back.
//
// `SOAK_MINUTES` exists to try the test out quickly; the real run uses 10.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import { createWorldScript, writeAddMonster, writeAddPlayer, writeAddSelf, writeDelObj, writeSetPos } from '@flyffweb/testkit';
import type { ClientPerf } from '../src/testHooks';
import {
  BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, groundAt,
  playGateway, self,
} from './worldHarness';

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
/** The square's side and the distance between two of the server's placings, in metres. */
const SIDE = 600;
const HOP_METRES = 50;
const HOP_MS = 1_000;
/** Time on the square before a sample, for the tiles around it to arrive and the ones behind to go. */
const SETTLE_MS = 5_000;
/** The limit: the last sample over the baseline. */
const LIMIT = 1.1;

const at = (x: number, z: number): Vec3 => [x, groundAt(x, z), z];
const MONSTER_IDS = [9101, 9102, 9103, 9104, 9105, 9106];
const monsters: AddedMover[] = MONSTER_IDS.map((objectId, i) => ({
  ...aibatt, objectId, pos: at(SQUARE[0] - 6 + 2.5 * i, SQUARE[2] - 6),
}));
const players: AddedMover[] = [0, 1, 2].map((i) => ({
  ...BASE, index: MI_MALE, pos: at(SQUARE[0] + 3 + 2 * i, SQUARE[2]), angle: 0, objectId: 9201 + i, isPlayer: true,
  player: {
    ...SELF_PLAYER, self: false, name: `Soaker${i + 1}`, playerId: 601 + i, equipmentObjectIds: [],
    worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
  },
}));
const script = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self),
  others: [...monsters.map((m) => writeAddMonster(m.objectId, m)), ...players.map((p) => writeAddPlayer(p.objectId, p))],
});

/** The lap's placings: along the square's four sides from Flaris' square (its first corner), and back to it. */
function lapPoints(): Vec3[] {
  const [x0, , z0] = SQUARE;
  const corners: Array<[number, number]> = [[x0, z0], [x0 + SIDE, z0], [x0 + SIDE, z0 + SIDE], [x0, z0 + SIDE], [x0, z0]];
  const points: Vec3[] = [];
  for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c]!, [bx, bz] = corners[c + 1]!;
    for (let d = HOP_METRES; d <= SIDE; d += HOP_METRES) points.push(at(ax + (bx - ax) * d / SIDE, az + (bz - az) * d / SIDE));
  }
  return points;
}

interface Sample { lap: number; at: number; memory: number; gpuBytes: number; jsHeapBytes: number | null; perf: ClientPerf }

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);
const perfOf = (page: Page): Promise<ClientPerf> => page.evaluate(() => window.__client!.perf());

test('ten minutes of laps through Flaris keep memory within 10% of the first lap', { tag: '@soak' }, async ({ page }) => {
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  expect(await page.evaluate(() => typeof (window as unknown as { gc?: unknown }).gc)).toBe('function');
  const began = Date.now();
  const sample = async (lap: number): Promise<Sample> => {
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => (window as unknown as { gc: () => void }).gc());
    const perf = await perfOf(page);
    return {
      lap, at: Math.round((Date.now() - began) / 1000), memory: perf.gpuBytes + (perf.jsHeapBytes ?? 0),
      gpuBytes: perf.gpuBytes, jsHeapBytes: perf.jsHeapBytes, perf,
    };
  };
  const points = lapPoints();
  const farCorner = points.findIndex(([x, , z]) => x === SQUARE[0] + SIDE && z === SQUARE[2] + SIDE);
  const samples: Sample[] = [];
  const squareTiles = (await perfOf(page)).loadedTiles;
  let farTiles: string[] = [];
  for (let lap = 1; lap === 1 || lap === 2 || Date.now() - began < MINUTES * 60_000; lap++) {
    for (let i = 0; i < points.length; i++) {
      gateway.pushCache(script.later([writeSetPos(SELF_ID, points[i]!)]));
      await page.waitForTimeout(HOP_MS);
      if (i === farCorner && lap === 1) { await page.waitForTimeout(SETTLE_MS); farTiles = (await perfOf(page)).loadedTiles; }
    }
    // back on the square: the monsters leave and come back, their views freed and made again
    const withMonsters = (await perfOf(page)).models;
    gateway.pushCache(script.later(MONSTER_IDS.map((id) => writeDelObj(id))));
    await expect.poll(async () => (await perfOf(page)).models, ON_FRAMES).toBeLessThan(withMonsters);
    gateway.pushCache(script.later(monsters.map((m) => writeAddMonster(m.objectId, m))));
    await expect.poll(async () => (await perfOf(page)).models, ON_FRAMES).toBe(withMonsters);
    samples.push(await sample(lap));
    const s = samples.at(-1)!;
    console.log(`lap ${lap} at ${s.at}s: memory ${mb(s.memory)} MB (gpu ${mb(s.gpuBytes)}, heap ${s.jsHeapBytes === null ? 'n/a' : mb(s.jsHeapBytes)}), `
      + `tiles ${s.perf.loadedTiles.length}, renderer ${JSON.stringify(s.perf.renderer)}, ${s.perf.fps.toFixed(1)} fps`);
  }

  // the test measured what it says
  expect(farTiles.length).toBeGreaterThan(0);
  expect(farTiles.filter((key) => squareTiles.includes(key))).not.toEqual(farTiles);
  expect(samples.every((s) => s.jsHeapBytes !== null)).toBe(true);
  expect(new Set(samples.map((s) => s.jsHeapBytes)).size).toBeGreaterThan(1);

  const [baseline] = samples, last = samples.at(-1)!;
  test.info().annotations.push({ type: 'soak', description: `${samples.length} laps: ${mb(baseline!.memory)} MB to ${mb(last.memory)} MB` });
  expect(last.memory).toBeLessThanOrEqual(baseline!.memory * LIMIT);
  expect(last.perf.renderer).toEqual(baseline!.perf.renderer);
  expect(last.perf.errors).toEqual([]);
});
