// The soak test (global constraints: "after a 10-minute loop walk, memory within 10% of its starting level").
// On `#/world` the player runs laps around a closed square, 600 m on a side and centred on the start, for ten minutes:
// tiles stream in and out the whole time, so anything the streamer, the object pool or the texture cache fails to give
// back shows up as growth. Memory is what the overlay reports: the GPU estimate plus the JS heap (`gpuBytes +
// jsHeapBytes`, the heap counting as 0 where the browser has none). The baseline is taken after the first lap, when
// everything a lap needs has been loaded once, and the end of the last lap must stay within 110% of it.
//
// Every sample is taken standing on the same corner, after the tiles around it have settled, so the same tiles are
// loaded each time. The soak project starts Chromium with `--js-flags=--expose-gc` (playwright.config.ts) and the test
// collects garbage before a sample: the heap number is then what is still held, not what is waiting to be collected.
//
// The player moves with the frame's own duration (`Route.step(dt)`), so under software WebGL, at a few frames a second,
// a lap takes as long as it would on a fast machine and the ten minutes are ten minutes of walking.
//
// `SOAK_MINUTES` and `SOAK_SIDE` (metres) exist to try the test out quickly; the real run uses neither.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Vec3 } from '@flyffweb/formats';
import type {} from '../src/testHooks'; // window.__viewer
import { madrigal } from './data';

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
const SIDE = Number(process.env.SOAK_SIDE ?? 600);
/** The running speed of the world view (metres per second). */
const RUN_SPEED = 12;
/** The limit: the last sample over the baseline. */
const LIMIT = 1.1;
/** Time on the corner before a sample, for the tiles around it to arrive and the ones behind to go. */
const SETTLE_MS = 5_000;

interface Sample {
  lap: number;
  /** Seconds since the walk began. */
  at: number;
  gpuBytes: number;
  jsHeapBytes: number | null;
  /** gpuBytes + (jsHeapBytes ?? 0) */
  memory: number;
  tiles: number;
  fps: number;
  errors: string[];
}

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

async function sample(page: Page, lap: number, began: number): Promise<Sample> {
  await page.waitForTimeout(SETTLE_MS);
  // present because the soak project starts Chromium with --expose-gc; a run without it still works, with a noisier heap
  await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
  const stats = await page.evaluate(() => window.__viewer!.stats());
  return {
    lap,
    at: Math.round((Date.now() - began) / 1000),
    gpuBytes: stats.gpuBytes,
    jsHeapBytes: stats.jsHeapBytes,
    memory: stats.gpuBytes + (stats.jsHeapBytes ?? 0),
    tiles: stats.loadedTiles.length,
    fps: stats.fps,
    errors: stats.errors,
  };
}

test('ten minutes of laps around a square keep memory within 10% of the first lap', { tag: '@soak' }, async ({ page }) => {
  const lapSeconds = (4 * SIDE) / RUN_SPEED;
  // the walk (the minutes, and up to one more lap to finish the lap it is on), the way to the first corner, slack
  test.setTimeout((MINUTES * 60 + 2 * lapSeconds + 300) * 1000);

  await page.goto('/#/world?world=wdmadrigal');
  await page.evaluate(() => window.__viewer!.ready());

  // the square, around the start; corner A is where every lap begins and ends
  const [cx, y, cz] = madrigal().camera.position;
  const half = SIDE / 2;
  const a: Vec3 = [cx - half, y, cz - half];
  const lap: Vec3[] = [
    [cx + half, y, cz - half],
    [cx + half, y, cz + half],
    [cx - half, y, cz + half],
    a,
  ];
  const walk = (points: Vec3[]) =>
    page.evaluate(([p, speed]) => window.__viewer!.walkRoute(p, speed), [points, RUN_SPEED] as const);

  const began = Date.now();
  await walk([a]);

  const samples: Sample[] = [];
  let laps = 0;
  // at least two laps, so there is a baseline and a later sample; then until the time is up
  while (laps < 2 || Date.now() - began < MINUTES * 60_000) {
    await walk(lap);
    laps++;
    const s = await sample(page, laps, began);
    samples.push(s);
    console.log(
      `soak lap ${s.lap} at ${s.at} s: memory ${mb(s.memory)} MB (gpu ${mb(s.gpuBytes)}, heap ` +
        `${s.jsHeapBytes === null ? 'n/a' : mb(s.jsHeapBytes)}), ${s.tiles} tiles, ${s.fps.toFixed(1)} fps`,
    );
  }

  const baseline = samples[0]!;
  const final = samples[samples.length - 1]!;
  const ratio = final.memory / baseline.memory;
  const summary =
    `baseline ${mb(baseline.memory)} MB (lap 1), final ${mb(final.memory)} MB (lap ${final.lap}, ${final.at} s), ` +
    `ratio ${ratio.toFixed(3)}, ${laps} laps of ${4 * SIDE} m`;
  console.log(`soak: ${summary}`);
  test.info().annotations.push({ type: 'soak', description: summary });

  expect(samples.flatMap((s) => s.errors)).toEqual([]);
  expect(laps).toBeGreaterThanOrEqual(2);
  expect(final.memory, summary).toBeLessThanOrEqual(baseline.memory * LIMIT);
});
