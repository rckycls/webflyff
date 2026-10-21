import { expect, test } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import type {} from '../src/testHooks'; // window.__viewer
import { spots } from './data';

/** A 1 x 1 PNG: any picture will do for "the reference is there". */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The reference pictures are the owner's files, so a test says what the server has instead of relying on them. */
async function referencesAre(page: Page, present: boolean): Promise<void> {
  await page.route('**/compare/refs/*.png', (route) =>
    present
      ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
      : route.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }),
  );
}

/** The viewer inside the compare page, once its hooks are there. */
async function liveFrame(page: Page): Promise<Frame> {
  const handle = await page.locator('.compare-live iframe').elementHandle();
  const frame = await handle!.contentFrame();
  if (frame === null) throw new Error('the live pane has no frame');
  await frame.waitForFunction(() => window.__viewer !== undefined);
  return frame;
}

test('compare lists the four spots', async ({ page }) => {
  await page.goto('/#/compare');
  await page.evaluate(() => window.__viewer!.ready());

  const links = page.locator('.compare-spots a');
  await expect(links).toHaveCount(4);
  expect(await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')))).toEqual(
    spots().map((spot) => `#/compare?spot=${spot.id}`),
  );
  // nothing is chosen yet, so no pictures
  await expect(page.locator('.compare-panes')).toHaveCount(0);
  const { errors } = await page.evaluate(() => window.__viewer!.stats());
  expect(errors).toEqual([]);
});

test('opening a spot shows the live view beside the reference', async ({ page }) => {
  await referencesAre(page, true);
  await page.goto('/#/compare?spot=character-male-default');
  await page.evaluate(() => window.__viewer!.ready());

  await expect(page.locator('.compare-spots a[aria-current="true"]')).toHaveText(/character-male-default/);
  const reference = page.locator('.compare-reference');
  await expect(reference).toHaveAttribute('data-state', 'loaded');
  expect(await reference.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await reference.locator('img').getAttribute('src')).toBe('compare/refs/character-male-default.png');

  // the live pane is the viewer, on the spot's route
  const frame = await liveFrame(page);
  expect(frame.url()).toMatch(/#\/character\?gender=male&paused=1&frame=0$/);
  await frame.evaluate(() => window.__viewer!.ready());
  const { errors } = await frame.evaluate(() => window.__viewer!.stats());
  expect(errors).toEqual([]);
  // a viewer in a frame has no nav bar over its picture
  await expect(frame.locator('#nav')).toBeHidden();

  const live = (await page.locator('.compare-live').boundingBox())!;
  const ref = (await reference.boundingBox())!;
  // side by side on a wide screen: same top, the reference to the right
  expect(ref.y).toBeCloseTo(live.y, 0);
  expect(ref.x).toBeGreaterThanOrEqual(live.x + live.width);
});

test('a missing reference says where to put it', async ({ page }) => {
  await referencesAre(page, false);
  await page.goto('/#/compare?spot=flaris-plaza');
  await page.evaluate(() => window.__viewer!.ready());

  const reference = page.locator('.compare-reference');
  await expect(reference).toHaveAttribute('data-state', 'missing');
  await expect(reference).toContainText(
    'no screenshot yet: put apps/viewer/compare/refs/flaris-plaza.png here',
  );
  // the live view is there all the same, on the spot's route (position and direction included)
  expect(await page.locator('.compare-live iframe').getAttribute('src')).toMatch(
    /#\/world\?world=wdmadrigal&x=6968&z=3328&yaw=180&paused=1$/,
  );
});

test('the panes stack on screens narrower than 768 px', async ({ page }) => {
  await referencesAre(page, true);
  const boxes = async () => ({
    live: (await page.locator('.compare-live').boundingBox())!,
    ref: (await page.locator('.compare-reference').boundingBox())!,
  });

  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/#/compare?spot=character-male-default');
  await page.evaluate(() => window.__viewer!.ready());
  const narrow = await boxes();
  expect(narrow.ref.x).toBeCloseTo(narrow.live.x, 0);
  expect(narrow.ref.y).toBeGreaterThanOrEqual(narrow.live.y + narrow.live.height);
  // no sideways scrolling
  expect(await page.evaluate(() => document.querySelector('.compare')!.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 768, height: 900 });
  const wide = await boxes();
  expect(wide.ref.y).toBeCloseTo(wide.live.y, 0);
  expect(wide.ref.x).toBeGreaterThanOrEqual(wide.live.x + wide.live.width);
});

test('a spot the page does not have is said so, and the list stays', async ({ page }) => {
  await page.goto('/#/compare?spot=nowhere');
  await page.evaluate(() => window.__viewer!.ready());

  await expect(page.locator('.compare-notice')).toContainText('no spot called "nowhere"');
  await expect(page.locator('.compare-spots a')).toHaveCount(4);
  await expect(page.locator('.compare-live')).toHaveCount(0);
});

test('every spot opens its live view without errors', async ({ page }) => {
  test.setTimeout(300_000);
  await referencesAre(page, false);
  for (const spot of spots()) {
    await page.goto(`/#/compare?spot=${spot.id}`);
    await page.evaluate(() => window.__viewer!.ready());

    const frame = await liveFrame(page);
    await frame.evaluate(() => window.__viewer!.ready());
    const { errors } = await frame.evaluate(() => window.__viewer!.stats());
    expect(errors, spot.id).toEqual([]);
    expect(frame.url(), spot.id).toMatch(new RegExp(`${spot.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
});
