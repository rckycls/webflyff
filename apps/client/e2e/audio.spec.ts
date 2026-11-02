import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writePlaySound } from '@flyffweb/testkit';
import { enterFlaris, flaris, playGateway } from './worldHarness';

// Piece 6 M2: the game's music and sound (docs/superpowers/plans/2026-11-02-piece6-m2-sound.md). The page's audio is
// read by what it asks the server for (the tracks) and by the test hooks' log (the effects it was asked to play).
test.setTimeout(150_000);

/** The tracks the page has asked for so far, by web name (`music/bgmto1flaris.ogg` is `bgmto1flaris`). */
function tracksOf(page: Page): string[] {
  const tracks: string[] = [];
  page.on('request', (request) => {
    const match = /\/music\/([a-z0-9_-]+)\.[0-9a-f]{10}\.(?:ogg|mp3)/.exec(request.url());
    if (match !== null) tracks.push(match[1]!);
  });
  return tracks;
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const soundsPlayed = (page: Page): Promise<number[]> => page.evaluate(() => window.__client!.played().sounds);

test('audio: nothing is downloaded before the first tap, which starts the title track on the login form', async ({ page }) => {
  const errors = errorsOf(page);
  const tracks = tracksOf(page);
  await page.goto('/');
  await expect(page.getByLabel('Account')).toBeVisible();
  await page.waitForTimeout(1500); // the audio catalog is in by now; without a gesture nothing starts
  expect(tracks).toEqual([]);
  await page.getByLabel('Account').click();
  await expect.poll(() => tracks).toContain('bgmdu1mystery'); // BGM_TITLE (default.bgm:1)
  expect(errors).toEqual([]);
});

test('audio: Flarine plays its track; a press of Start clicks; the server\'s PLAYSOUND plays its sound', async ({ page, isMobile }) => {
  const errors = errorsOf(page);
  const tracks = tracksOf(page);
  const gateway = await playGateway(page);
  await enterFlaris(page);
  // the square is in Flarine (WdMadrigal.rgn:796, direct): BGM_TO_FLARIS, BgmTo1Flaris.ogg
  await expect.poll(() => tracks, { timeout: 15_000 }).toContain('bgmto1flaris');
  const start = page.getByRole('button', { name: 'Start', exact: true });
  if (isMobile) await start.tap();
  else await start.click();
  await expect.poll(() => soundsPlayed(page)).toContain(1); // SND_INF_CLICK (WndControl.cpp:692-694)
  gateway.pushCache(flaris.later([writePlaySound(4)])); // SND_INF_TRADE
  await expect.poll(() => soundsPlayed(page)).toContain(4);
  expect(errors).toEqual([]);
});

test('audio: the Option window shows the kept BGM step, moves it, and keeps the new one', async ({ page }) => {
  const errors = errorsOf(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded') === null) {
      localStorage.setItem('flyffweb.sound', JSON.stringify({ effects: 10, music: 3 }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await playGateway(page);
  await enterFlaris(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Option', exact: true }).click();
  const bgm = page.getByRole('slider', { name: 'BGM' });
  await expect(bgm).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByRole('slider', { name: 'Sound Effect' })).toHaveAttribute('aria-valuenow', '10');
  await bgm.focus();
  await page.keyboard.press('ArrowRight');
  await expect(bgm).toHaveAttribute('aria-valuenow', '4');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('flyffweb.sound')))!)).toEqual({ effects: 10, music: 4 });
  await page.reload();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('flyffweb.sound')))!)).toEqual({ effects: 10, music: 4 });
  expect(errors).toEqual([]);
});
