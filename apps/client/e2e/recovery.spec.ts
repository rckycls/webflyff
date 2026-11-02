import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex } from '@flyffweb/formats';
import { NULL_ID, PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddMonster, writeAddNpc, writeAddSelf, writeReplace } from '@flyffweb/testkit';
import type { Gateway } from './worldHarness';
import {
  ASSETS, MADRIGAL, MONSTER_ID, NPC_ID, SELF_ID, SQUARE, aibatt, enterFlaris, errorPacket, julia, playGateway, self, serverList,
  startEntering,
} from './worldHarness';

// Piece 6 M3: one tap reconnects after the world dropped on its own (docs/superpowers/plans/2026-11-02-piece6-m3-reconnect.md).
test.setTimeout(150_000);

/** Flaris for the n-th entry: Webby with 100 HP the first time, 77 after (the server's fresh state). */
const freshFlaris = (entry: number) => createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, { ...self, hitPoint: entry === 1 ? 100 : 77 }),
  others: [writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia)],
});

/** What a reconnect must never send by itself: an attack, a skill, a target. */
const GAMEPLAY: readonly number[] = [PacketType.MELEE_ATTACK, PacketType.USESKILL, PacketType.SETTARGET];

const certifies = (gateway: Gateway) => gateway.sent.filter((p) => p.type === PacketType.CERTIFY);
const box = (page: Page) => page.locator('.hud-dropbox');

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Holds the second download of the glyph sheets (data/uiSheets.json, fetched again for each world), which a world waits
 * for before it is first shown: `held` once it is asked for, `release` lets it go.
 */
async function holdSecondSheets(page: Page): Promise<{ held: Promise<void>; release: () => void }> {
  const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
  let loads = 0, release!: () => void, holding!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const held = new Promise<void>((resolve) => { holding = resolve; });
  await page.route(`**/${index.files['data/uiSheets.json']}`, async (route) => {
    if (++loads === 2) {
      holding();
      await released;
    }
    await route.continue();
  });
  return { held, release };
}

async function reconnect(page: Page, isMobile: boolean): Promise<void> {
  const button = page.getByRole('button', { name: 'Reconnect' });
  if (isMobile) await button.tap();
  else await button.click();
}

test('reconnect: a dropped cache connection freezes the world behind the box, and one tap brings the same character back', async ({ page, isMobile }) => {
  const errors = errorsOf(page);
  const gateway = await playGateway(page, freshFlaris);
  await enterFlaris(page);
  expect(await page.evaluate(() => window.__client!.own()!.hp)).toBe(100);
  await gateway.closeCache(4002);
  await expect(box(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('The connection to the game was lost.');
  const sentAtDrop = gateway.sent.length;
  await page.waitForTimeout(1000);
  expect(gateway.sent.length).toBe(sentAtDrop); // the frozen world sends nothing
  await reconnect(page, isMobile);
  await expect.poll(() => certifies(gateway).length).toBe(2);
  expect(certifies(gateway)[1]!.body.equals(certifies(gateway)[0]!.body)).toBe(true); // the same account and hash
  await expect.poll(() => page.evaluate(() => window.__client!.own()?.hp ?? null), { timeout: 30_000 }).toBe(77);
  await expect(box(page)).toHaveCount(0);
  await page.evaluate(() => window.__client!.ready()); // the JOIN gives the numbers before the new world is on screen
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  const after = gateway.sent.slice(sentAtDrop);
  expect(after.filter((p) => GAMEPLAY.includes(p.type))).toEqual([]);
  expect(errors).toEqual([]);
});

test('reconnect: a dropped login connection shows the box too', async ({ page, isMobile }) => {
  const gateway = await playGateway(page, freshFlaris);
  await enterFlaris(page);
  await gateway.closeLogin(1006);
  await expect(box(page)).toBeVisible();
  await reconnect(page, isMobile);
  await expect.poll(() => page.evaluate(() => window.__client!.own()?.hp ?? null), { timeout: 30_000 }).toBe(77);
});

test('reconnect: an account still in the game keeps the box, and a later tap gets in', async ({ page, isMobile }) => {
  const gateway = await playGateway(page, freshFlaris, { certify: (n) => (n === 2 ? errorPacket(103) : serverList()) });
  await enterFlaris(page);
  await gateway.closeCache(4002);
  await reconnect(page, isMobile);
  await expect(page.getByRole('alert')).toHaveText('This account is still in the game. Wait a minute, then tap Reconnect.');
  expect(gateway.sent.filter((p) => p.type === PacketType.CLOSE_EXISTING_CONNECTION)).toEqual([]); // nothing kicked
  await reconnect(page, isMobile);
  await expect.poll(() => page.evaluate(() => window.__client!.own()?.hp ?? null), { timeout: 30_000 }).toBe(77);
});

test('reconnect: Back to login leaves the frozen world for the login form, the account kept', async ({ page }) => {
  const gateway = await playGateway(page, freshFlaris);
  await enterFlaris(page);
  await gateway.closeCache(4002);
  await page.getByRole('button', { name: 'Back to login' }).click();
  await expect(page.getByLabel('Account')).toHaveValue('webtester');
  await expect(box(page)).toHaveCount(0);
});

test('reconnect: a drop before the world was shown goes to the login form as before, with no box', async ({ page }) => {
  const gateway = await playGateway(page, freshFlaris);
  await startEntering(page);
  await gateway.closeLogin(1006);
  await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled({ timeout: 30_000 });
  await expect(box(page)).toHaveCount(0);
});

test('reconnect: a drop while the next world is drawn for the first time shows the box, and hides the Leave of the loading screen', async ({ page, isMobile }) => {
  // the next world's HUD is built, then kept off the page until its tiles, models and glyph sheets are in: the drop comes
  // while its sheets are held
  const { held, release } = await holdSecondSheets(page);
  const scripts: ReturnType<typeof createWorldScript>[] = [];
  const gateway = await playGateway(page, (entry) => (scripts[entry] = freshFlaris(entry)));
  await enterFlaris(page);
  // a REPLACE to Mars Mine (200), and its snapshot: the new world is entered and loads
  gateway.pushCache(scripts[1]!.later([writeReplace(NULL_ID, 200, SQUARE), writeAddSelf(SELF_ID, self)]));
  await held;
  await gateway.closeCache(4002);
  await expect(box(page)).toBeVisible();
  await expect(page.locator('.world-leave')).toBeHidden(); // it would do nothing: the world has ended
  release();
  await reconnect(page, isMobile);
  await expect.poll(() => page.evaluate(() => window.__client!.own()?.hp ?? null), { timeout: 30_000 }).toBe(77);
});

test('reconnect: a new world that drops before it is shown brings the box back, the login kept, and a later tap gets in', async ({ page, isMobile }) => {
  const { held, release } = await holdSecondSheets(page);
  const gateway = await playGateway(page, freshFlaris);
  await enterFlaris(page);
  await gateway.closeCache(4002);
  await reconnect(page, isMobile);
  await held; // the reconnect's world is entered, and waits for its sheets
  await gateway.closeCache(4002);
  await expect(box(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('The connection to the game was lost.');
  await expect(page.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  release();
  await reconnect(page, isMobile);
  await expect.poll(() => page.evaluate(() => window.__client!.own()?.hp ?? null), { timeout: 30_000 }).toBe(77);
  expect(certifies(gateway)).toHaveLength(3);
});
