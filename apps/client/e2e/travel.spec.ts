import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { ArWriter, NULL_ID, PacketType } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import { createWorldScript, writeAddSelf, writeReplace } from '@flyffweb/testkit';
import { ASSETS, MADRIGAL, ON_FRAMES, SELF_ID, SQUARE, enterFlaris, ownAt, playGateway, self, sentOf } from './worldHarness';

// M4's transport lifecycle: native REPLACE does not reconnect or send JOIN again.
test.setTimeout(120_000);
const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const MARS = 200;
const manifestKey = 'worlds/duflmas/manifest.json';
const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files[manifestKey]!), 'utf8'));
const side = manifest.mapSize * manifest.mpu;
const x = 850, z = 686, tx = Math.floor(x / side), tz = Math.floor(z / side);
const tileFile = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
const tile = decodeTileBin(new Uint8Array(readFileSync(tileFile)), tileFile);
const MARS_POS: Vec3 = [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
const scriptFor = () => createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, self), others: [] });
const replacePacket = (worldId: number, pos: Vec3) => new ArWriter().u32(PacketType.REPLACE).u32(worldId).vec3(pos).toBytes();

test('travel: buffers a delayed destination snapshot, keeps the cache open, and returns from Mars Mine', async ({ page }) => {
  const script = scriptFor(), gateway = await playGateway(page, script);
  await enterFlaris(page);
  const closed = gateway.closed.length;
  const joins = sentOf(gateway, PacketType.JOIN).length;
  gateway.pushCache(script.later([{ objectId: SELF_ID, type: 1, fields: new ArWriter().string('Travel history').toBytes() }]));
  await expect(page.locator('.chat-transcript')).toContainText('Travel history');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  gateway.pushCache(replacePacket(MARS, MARS_POS));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeHidden();
  await expect(page.locator('.world-status')).toBeVisible();
  const keepAlives = sentOf(gateway, PacketType.KEEP_ALIVE).length;
  gateway.pushCache(new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes());
  await expect.poll(() => sentOf(gateway, PacketType.KEEP_ALIVE).length).toBe(keepAlives + 1);
  expect(gateway.closed).toHaveLength(closed);
  gateway.pushCache(script.later([writeAddSelf(SELF_ID, { ...self, pos: MARS_POS })]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MARS));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => { const pos = await ownAt(page); return [pos[0], pos[2]]; }).toEqual([MARS_POS[0], MARS_POS[2]]);
  await expect(page.locator('.world-hud')).toHaveCount(1);
  await expect(page.locator('.hud-taskbar-strip')).toHaveCount(1);
  await expect(page.locator('.world')).not.toHaveClass(/world-menu-open|world-modal/);
  await expect(page.locator('.chat-transcript')).toContainText('Travel history');
  await page.screenshot({ path: test.info().outputPath('travel-mars.png') });
  gateway.pushCache(script.later([writeReplace(NULL_ID, MADRIGAL, SQUARE), writeAddSelf(SELF_ID, self)]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MADRIGAL));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => ownAt(page)).toEqual(SQUARE);
  await expect(page.locator('.world-hud')).toHaveCount(1);
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(sentOf(gateway, PacketType.JOIN)).toHaveLength(joins);
  expect(gateway.closed).toHaveLength(closed);
});

// Piece 6 M5, part B: the ring of tiles around the 3 x 3 starts the frame after a world is first drawn, in each world.
test('travel: the ring of tiles around the view loads again in the world travelled back to', async ({ page }) => {
  const script = scriptFor(), gateway = await playGateway(page, script);
  await enterFlaris(page);
  const tiles = async () => (await page.evaluate(() => window.__client!.perf())).loadedTiles.length;
  await expect.poll(tiles, ON_FRAMES).toBe(25);
  gateway.pushCache(replacePacket(MARS, MARS_POS));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeHidden();
  gateway.pushCache(script.later([writeAddSelf(SELF_ID, { ...self, pos: MARS_POS })]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MARS));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  gateway.pushCache(script.later([writeReplace(NULL_ID, MADRIGAL, SQUARE), writeAddSelf(SELF_ID, self)]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MADRIGAL));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect.poll(tiles, ON_FRAMES).toBe(25);
});

test('travel: a second transition supersedes an unfinished map load', async ({ page }) => {
  let requested!: () => void, release!: () => void;
  const request = new Promise<void>(resolve => { requested = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/${index.files[manifestKey]}`, async route => {
    requested(); await held; await route.continue();
  });
  const script = scriptFor(), gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writeReplace(NULL_ID, MARS, MARS_POS), writeAddSelf(SELF_ID, { ...self, pos: MARS_POS })]));
  await request;
  gateway.pushCache(script.later([writeReplace(NULL_ID, MADRIGAL, SQUARE), writeAddSelf(SELF_ID, self)]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MADRIGAL));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  release();
  await expect.poll(() => ownAt(page)).toEqual(SQUARE);
  await expect(page.locator('.world-hud')).toHaveCount(1);
  await expect(page.locator('.hud-taskbar-strip')).toHaveCount(1);
});

for (const failure of ['unknown world', 'missing manifest', 'malformed manifest'] as const) {
  test(`travel: ${failure} returns cleanly to the lobby`, async ({ page }) => {
    if (failure === 'missing manifest') await page.route('**/assets/index.json', route => {
      const files = { ...index.files }; delete files[manifestKey];
      return route.fulfill({ json: { ...index, files } });
    });
    if (failure === 'malformed manifest') await page.route(`**/${index.files[manifestKey]}`, route => route.fulfill({ json: {} }));
    const script = scriptFor(), gateway = await playGateway(page, script);
    await enterFlaris(page);
    const closed = gateway.closed.length;
    gateway.pushCache(script.later([writeReplace(NULL_ID, failure === 'unknown world' ? 999999 : MARS, MARS_POS),
      writeAddSelf(SELF_ID, { ...self, pos: MARS_POS })]));
    await expect(page.locator('.world')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => gateway.closed.length).toBe(closed + 2);
    await expect(page.locator('.world-hud')).toHaveCount(0);
  });
}
