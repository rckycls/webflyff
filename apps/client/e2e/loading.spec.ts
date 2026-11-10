// Loading (2026-11-04 audit): the page fetches its asset index once, and the character list fetches the selected
// character's world into the browser's cache before Enter (the manifest, the tiles around the saved place, their models,
// collision files and textures), so that the world's own requests are answered from the cache.
import { expect, test } from '@playwright/test';
import { logIn, playGateway } from './worldHarness';

test.setTimeout(120_000);

test("the character list fetches Webby's world before Enter, and the asset index is fetched once", async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(new URL(request.url()).pathname));
  await playGateway(page);
  await page.goto('/play/');
  await logIn(page);
  await page.getByRole('button', { name: /Channel 1/ }).click();
  await expect(page.getByRole('button', { name: 'Enter Webby' })).toBeVisible();
  // Webby is saved on Flaris' square: its manifest, its tiles and the models on them come while the list is shown
  await expect.poll(() => urls.filter((url) => url.startsWith('/assets/worlds/wdmadrigal/tiles/')).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(4);
  await expect.poll(() => urls.filter((url) => url.startsWith('/assets/models/')).length, { timeout: 30_000 }).toBeGreaterThan(10);
  await expect.poll(() => urls.filter((url) => url.startsWith('/assets/collision/')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const before = urls.length;
  await page.getByRole('button', { name: 'Enter Webby' }).click();
  await page.evaluate(() => window.__client!.ready());
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  expect(urls.length).toBeGreaterThan(before);
  expect(urls.filter((url) => url.endsWith('/assets/index.json'))).toHaveLength(1);
});
