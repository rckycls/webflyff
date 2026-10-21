import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { AssetIndex, Vec3, WorldManifest } from '@flyffweb/formats';
import type {} from '../src/testHooks'; // window.__viewer
import { tileOf, tilesInRange } from '../src/world/tileStreamer';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/assets');

/** Madrigal's manifest, as the viewer reads it (through the asset index). */
function madrigal(): WorldManifest {
  const index = JSON.parse(readFileSync(path.join(assets, 'index.json'), 'utf8')) as AssetIndex;
  const file = index.files['worlds/wdmadrigal/manifest.json'];
  if (file === undefined) throw new Error('the asset index has no worlds/wdmadrigal/manifest.json');
  return JSON.parse(readFileSync(path.join(assets, file), 'utf8')) as WorldManifest;
}

test('world flaris start', async ({ page }) => {
  await page.goto('/#/world?world=wdmadrigal&paused=1');
  await page.evaluate(() => window.__viewer!.ready());

  const { errors } = await page.evaluate(() => window.__viewer!.stats());
  expect(errors).toEqual([]);
  // The overlay's numbers (fps, heap) change from frame to frame, so it is masked.
  await expect(page).toHaveScreenshot('world-flaris-start.png', { mask: [page.locator('#overlay')] });
});

test('walking never shows missing ground', async ({ page }) => {
  // 1,200 m at 12 m/s is 100 s of walking, plus the start.
  test.setTimeout(300_000);
  const manifest = madrigal();
  const RUN = 12;
  const LENGTH = 1200;
  const STEP = 50;

  await page.goto('/#/world?world=wdmadrigal');
  await page.evaluate(() => window.__viewer!.ready());

  // A straight line from the start position toward Flaris (D3D x 6968, z 3328; web z is -z).
  const start = manifest.camera.position;
  const dx = 6968 - start[0];
  const dz = -3328 - start[2];
  const length = Math.hypot(dx, dz);
  const direction = [dx / length, dz / length] as const;

  for (let walked = STEP; walked <= LENGTH; walked += STEP) {
    const point: Vec3 = [start[0] + direction[0] * walked, start[1], start[2] + direction[1] * walked];
    await page.evaluate(([p, speed]) => window.__viewer!.walkRoute([p], speed), [point, RUN] as const);

    const { loadedTiles, errors } = await page.evaluate(() => window.__viewer!.stats());
    const { visible } = tilesInRange(tileOf(point, manifest.mpu), 1, manifest.size);
    expect(loadedTiles, `at ${walked} m (${point[0].toFixed(0)}, ${point[2].toFixed(0)})`).toEqual(
      expect.arrayContaining(visible),
    );
    expect(errors).toEqual([]);
  }
});
