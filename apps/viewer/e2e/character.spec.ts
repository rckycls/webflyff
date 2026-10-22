import { expect, test } from '@playwright/test';
import type {} from '../src/testHooks'; // window.__viewer

test('character default male', async ({ page }) => {
  await page.goto('/#/character?gender=male&paused=1&frame=0');
  await page.evaluate(() => window.__viewer!.ready());

  const { errors } = await page.evaluate(() => window.__viewer!.stats());
  expect(errors).toEqual([]);
  // The overlay's numbers (fps, heap) change from frame to frame, so it is masked.
  await expect(page).toHaveScreenshot('character-male-default.png', { mask: [page.locator('#overlay')] });
});

test('first load stays under 15 MB', { tag: '@prod' }, async ({ page }) => {
  // The browser keeps 250 resource entries by default; every download has to be counted.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
  await page.goto('/#/character?gender=male');
  await page.evaluate(() => window.__viewer!.ready());

  const { bytes, files, transcoder } = await page.evaluate(() => {
    const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];
    const sizes = entries.map((entry) => (entry as PerformanceResourceTiming).encodedBodySize);
    return {
      bytes: sizes.reduce((sum, size) => sum + size, 0),
      files: entries.length,
      transcoder: entries.map((entry) => entry.name).filter((name) => /\/basis_transcoder-[\w-]+\.(js|wasm)$/.test(name)),
    };
  });
  test.info().annotations.push({ type: 'first load', description: `${bytes} bytes in ${files} files` });
  console.log(`first load: ${bytes} bytes in ${files} files`);
  expect(bytes).toBeLessThanOrEqual(15 * 1024 * 1024);
  // the textures were transcoded by the Basis transcoder the build bundled (three.js' own, hashed by Vite)
  expect(transcoder).toHaveLength(2);
  expect((await page.evaluate(() => window.__viewer!.stats())).errors).toEqual([]);
});
