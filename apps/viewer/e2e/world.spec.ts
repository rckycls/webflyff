import { expect, test } from '@playwright/test';
import type { Vec3 } from '@flyffweb/formats';
import { tileOf, tilesInRange } from '@flyffweb/scene';
import type {} from '../src/testHooks'; // window.__viewer
import { madrigal, spots } from './data';

test('world flaris start', async ({ page }) => {
  await page.goto('/#/world?world=wdmadrigal&paused=1');
  await page.evaluate(() => window.__viewer!.ready());

  const { errors } = await page.evaluate(() => window.__viewer!.stats());
  expect(errors).toEqual([]);
  // The overlay's numbers (fps, heap) change from frame to frame, so it is masked.
  await expect(page).toHaveScreenshot('world-flaris-start.png', { mask: [page.locator('#overlay')] });
});

/** The route of a compare spot, so these pictures and the compare page can never show different views. */
function spotRoute(id: string): string {
  const spot = spots().find((s) => s.id === id);
  if (spot === undefined) throw new Error(`spots.json has no spot ${id}`);
  return spot.route;
}

// The two pictures of Flaris' town square (client 6968, 3328), turned south and east: x, z and yaw in the address.
for (const [id, picture] of [
  ['flaris-plaza', 'world-flaris-plaza.png'],
  ['flaris-plaza-east', 'world-flaris-plaza-east.png'],
] as const) {
  test(`world ${id}`, async ({ page }) => {
    await page.goto(`/${spotRoute(id)}`);
    await page.evaluate(() => window.__viewer!.ready());

    const manifest = madrigal();
    // the player stands on the square's tile (web z is the client's z negated), not on the manifest's start
    const here = tileOf([6968, 0, -3328], manifest.mpu);
    const { loadedTiles, errors } = await page.evaluate(() => window.__viewer!.stats());
    expect(loadedTiles).toContain(`${here.x}_${here.y}`);
    expect(errors).toEqual([]);
    await expect(page).toHaveScreenshot(picture, { mask: [page.locator('#overlay')] });
  });
}

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
