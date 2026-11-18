// 2026-11-19: the world's water and cloud sea (packages/scene/src/world/water.ts), against a scripted world server, on the
// desktop and the phone: the Flaris lake north of the town (water list 0 at 96 m) and the cloud sea under the east cliff
// of Flaris. A dist converted before the water catalog (`data/terrainWater.json` not in its index) draws no water, as the
// client did before. Each view leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Vec3 } from '@flyffweb/protocol';
import { createWorldScript, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, enterFlaris, groundAt, playGateway, self } from './worldHarness';

test.setTimeout(150_000);

const WATER_KEY = 'data/terrainWater.json';
/** On the south shore of the Flaris lake (its water patches start at z 3648), facing north (angle 180) over it. */
const LAKE_SHORE: Vec3 = [6896, groundAt(6896, 3628), 3628];
/** On the edge of the east cliff of Flaris (112 m), facing east (angle 90) over the cloud sea below. */
const EAST_CLIFF: Vec3 = [7352, groundAt(7352, 3180), 3180];

const isPhone = (): boolean => test.info().project.use.hasTouch === true;

async function enterAt(page: Page, pos: Vec3, angle: number): Promise<void> {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos, self: writeAddSelf(SELF_ID, { ...self, pos, angle }), others: [],
  });
  await playGateway(page, script);
  await enterFlaris(page);
}

const waterMeshes = (page: Page): Promise<string[]> => page.evaluate(() => window.__client!.water!());

async function shoot(page: Page, name: string): Promise<void> {
  // the frames step at 9 a second and the clouds move: let a few go by, then take the picture
  await page.waitForTimeout(2000);
  await page.screenshot({ path: test.info().outputPath(`${name}-${isPhone() ? 'phone' : 'desktop'}.png`) });
}

test('the Flaris lake shows its water', async ({ page }) => {
  await enterAt(page, LAKE_SHORE, 180);
  await expect.poll(async () => (await waterMeshes(page)).some((name) => /^water \d+_\d+ list 0$/.test(name)), ON_FRAMES).toBe(true);
  await shoot(page, 'water-lake');
});

test('the cloud sea lies under the east cliff of Flaris', async ({ page }) => {
  await enterAt(page, EAST_CLIFF, 90);
  await expect.poll(async () => (await waterMeshes(page)).some((name) => /^cloud \d+_\d+$/.test(name)), ON_FRAMES).toBe(true);
  await shoot(page, 'water-cloud');
});

for (const [name, pos, angle] of [['lake', LAKE_SHORE, 180], ['cloud', EAST_CLIFF, 90]] as const) {
  test(`a dist without the water catalog draws no water, as before (${name})`, async ({ page }) => {
    await page.route('**/assets/index.json', async (route) => {
      const response = await route.fetch();
      const index = (await response.json()) as { files: Record<string, string> };
      delete index.files[WATER_KEY];
      await route.fulfill({ response, json: index });
    });
    await enterAt(page, pos, angle);
    await page.waitForTimeout(3000);
    expect(await waterMeshes(page)).toEqual([]);
    await shoot(page, `water-${name}-before`);
  });
}
