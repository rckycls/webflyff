// 2026-11-20 (loading screen): V15's loading picture with its bar while the world loads, gone once the world is drawn.
// Desktop and phone (the `chromium` and `phone` projects). The pictures need the converter's MapLoading* in dist/assets.

import { expect, test } from '@playwright/test';
import { Port } from '@flyffweb/protocol';
import { enterFlaris, playGateway, startEntering } from './worldHarness';

test('the loading screen shows the picture and a bar under 100% while the map loads', async ({ page }) => {
  // the map's tiles never come, so the screen stays on the loading screen
  await page.route(/\/assets\/worlds\/.*\/tiles\//, () => {});
  const tileAsked = page.waitForRequest(/\/assets\/worlds\/.*\/tiles\//);
  const gateway = await playGateway(page);
  await startEntering(page);
  await expect.poll(() => gateway.sent.some((s) => s.port === Port.CACHE)).toBe(true);
  await tileAsked;

  const loading = page.locator('.world-loading');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('data-picture', /maploading/);
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
  const bar = page.getByRole('progressbar', { name: 'Loading' });
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
  // the bar and its percent inside the picture, on the screen
  const box = (await page.locator('.world-loading-box').boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const size = page.viewportSize()!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(Math.min(box.y + box.height, size.height) + 0.5);
  expect(barBox.height).toBeGreaterThanOrEqual(8);
  await page.waitForTimeout(400); // the picture decoded and drawn
  await page.screenshot({ path: test.info().outputPath(`loading-${test.info().project.name}.png`) });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('the loading screen fades out once the world is drawn, and lets the world be used', async ({ page }) => {
  await playGateway(page);
  await enterFlaris(page);
  await expect(page.locator('.world-loading')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByText('Entering the world…')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath(`world-${test.info().project.name}.png`) });
});
