import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { ArWriter, PacketType } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import { createWorldScript, writeAddSelf } from '@flyffweb/testkit';
import type { Gateway } from './worldHarness';
import { ASSETS, MADRIGAL, SELF_ID, SQUARE, enterFlaris, ownAt, playGateway, self, sentOf } from './worldHarness';

// Piece 6 M1: CWorldMap's ordinary V15 map on M and in the Start menu (docs/superpowers/plans/2026-11-02-piece6-m1-world-map.md).
test.setTimeout(150_000);

const PICTURES = ['world_flyff', 'world_darkon12', 'world_darkon3', 'world_ricis', 'world_saint', 'world_flaris',
  'world_harmonin', 'world_estia'];
/** What the map must never send: a walk, a turn, a target, an attack or a teleport. */
const GAMEPLAY = [PacketType.PLAYERMOVED, PacketType.PLAYERBEHAVIOR, PacketType.PLAYERCORR, PacketType.PLAYERSETDESTOBJ,
  PacketType.SETTARGET, PacketType.SNAPSHOT, PacketType.MELEE_ATTACK, PacketType.TELEPORTER];
const gameplaySent = (gateway: Gateway): number => GAMEPLAY.reduce((n, type) => n + sentOf(gateway, type).length, 0);

const worldMap = (page: Page) => page.locator('.hud-worldmap');
const picture = (page: Page) => page.locator('.hud-worldmap-picture');
const pictureOf = (page: Page) => picture(page).evaluate((el) => (el as HTMLElement).style.backgroundImage);

async function openFromStart(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'World Map', exact: true }).click();
}

async function press(page: Page, selector: string, isMobile: boolean): Promise<void> {
  if (isMobile) await page.locator(selector).tap();
  else await page.locator(selector).click();
}

test('world map: M and the Start menu open Flaris; the buttons, the monster details and closing; nothing is sent', async ({ page, isMobile }) => {
  const gateway = await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  if (isMobile) {
    // an iPhone held sideways: notch insets left and right, the home bar below (as controls.spec.ts sets them)
    await page.locator('.world').evaluate((element) => {
      (element as HTMLElement).style.setProperty('--game-safe-left', '48px');
      (element as HTMLElement).style.setProperty('--game-safe-right', '12px');
      (element as HTMLElement).style.setProperty('--game-safe-bottom', '34px');
      window.dispatchEvent(new Event('resize'));
    });
    await page.evaluate(() => window.__client!.step(0));
  }
  const sentBefore = gameplaySent(gateway);

  if (isMobile) await openFromStart(page);
  else await page.keyboard.press('KeyM');
  await expect(worldMap(page)).toBeVisible();
  expect(await pictureOf(page)).toContain('world_flaris');
  await expect(page.locator('[data-map-button="5"]')).toHaveAttribute('data-frame', '17');
  await expect(page.locator('.hud-worldmap-arrow-picture')).toBeVisible(); // its anchor is a 0x0 point

  for (let i = 0; i < PICTURES.length; i++) {
    await press(page, `[data-map-button="${i}"]`, isMobile);
    await expect.poll(() => pictureOf(page)).toContain(PICTURES[i]!);
  }
  await press(page, '[data-map-button="5"]', isMobile);
  await press(page, '[data-map-button="8"]', isMobile);
  await expect.poll(() => page.locator('[data-monster]').count()).toBeGreaterThan(0);
  const tip = page.locator('.hud-worldmap-tip');
  if (isMobile) await page.locator('[data-monster="0"]').tap();
  else await page.locator('[data-monster="0"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Booty : Twinkle Stone');
  await page.screenshot({ path: test.info().outputPath('world-map.png') });

  if (isMobile) {
    // the whole picture inside the safe area, the map itself down to the screen's edge (over the home-bar strip, where
    // the task bar and the canvas reach), and a close button a finger can hit
    const viewport = page.viewportSize()!;
    const box = (await picture(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(48 - 0.5);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12 + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 34 + 0.5);
    const cover = (await worldMap(page).boundingBox())!;
    expect(cover.y + cover.height).toBeGreaterThanOrEqual(viewport.height - 0.5);
    const close = (await page.locator('[data-worldmap-close]').boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await page.locator('[data-worldmap-close]').tap();
    await expect(worldMap(page)).toBeHidden();
  } else {
    await page.keyboard.press('KeyM');
    await expect(worldMap(page)).toBeHidden();
    await page.keyboard.press('KeyM');
    await expect(worldMap(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(worldMap(page)).toBeHidden();
    await openFromStart(page);
    await expect(worldMap(page)).toBeVisible();
    await page.locator('[data-worldmap-close]').click();
    await expect(worldMap(page)).toBeHidden();
  }
  // the rules run a second: a press that had reached the world would send its walk, target or swing now
  await page.evaluate(() => window.__client!.step(60));
  expect(gameplaySent(gateway)).toBe(sentBefore);
});

test('world map: opened while walking, the walk stops, nothing is sent while it is open, and W walks again after', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard case: the touch path is the same releaseControls');
  const gateway = await playGateway(page);
  await enterFlaris(page);
  const moves = () => sentOf(gateway, PacketType.PLAYERMOVED).length;
  const walking = moves();
  await page.keyboard.down('KeyW');
  await expect.poll(moves).toBeGreaterThan(walking);
  await page.keyboard.press('KeyM');
  await expect(worldMap(page)).toBeVisible();
  // the held W lets go as the map opens (its ordinary stop), then nothing more while it is open
  await page.waitForTimeout(2_000);
  const [open, at] = [gameplaySent(gateway), await ownAt(page)];
  await page.waitForTimeout(3_000);
  expect(gameplaySent(gateway)).toBe(open);
  expect(await ownAt(page)).toEqual(at);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyM');
  await expect(worldMap(page)).toBeHidden();
  const closed = moves();
  await page.keyboard.down('KeyW');
  await expect.poll(moves).toBeGreaterThan(closed);
  await page.keyboard.up('KeyW');
});

test('world map: in Mars Mine, M says the map is not for here, and opens nothing', async ({ page, isMobile }) => {
  const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
  const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files['worlds/duflmas/manifest.json']!), 'utf8'));
  const side = manifest.mapSize * manifest.mpu;
  const [x, z] = [850, 686];
  const [tx, tz] = [Math.floor(x / side), Math.floor(z / side)];
  const tileFile = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(tileFile)), tileFile);
  const mars: Vec3 = [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, self), others: [] });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(new ArWriter().u32(PacketType.REPLACE).u32(200).vec3(mars).toBytes());
  gateway.pushCache(script.later([writeAddSelf(SELF_ID, { ...self, pos: mars })]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', '200');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });

  if (isMobile) await openFromStart(page);
  else await page.keyboard.press('KeyM');
  await expect(page.getByText('You can not use the Map in this Dungeon.').first()).toBeVisible();
  await expect(worldMap(page)).toBeHidden();
});
