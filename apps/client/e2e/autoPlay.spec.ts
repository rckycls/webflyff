// custom (owner 2026-11-15): Auto Play against the pretend world server (docs/superpowers/specs/2026-11-15-auto-play-design.md):
// the window from the Start menu, the farm bot engaging the Aibatt by itself, a whisper stopping it, the AUTO button
// (a long press on a phone), and the battery saver. The servers, Flaris and the helpers are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArWriter, PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, MONSTER_ID, ON_FRAMES, SELF_ID, SQUARE, aibatt, enterFlaris, playGateway, self, sentOf, targetsOf } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

/** A whisper from Rocky to Webby (PACKETTYPE_SAY on the cache connection, as talking.spec.ts sends one). */
const whisper = (text: string): Uint8Array =>
  new ArWriter().u32(0xff00d4).string('Rocky').string('Webby').string(text).u32(501).u32(500).i32(0).toBytes();

async function openAutoPlay(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Auto Play' }).click();
  await expect(page.locator('.hud-auto-play')).toBeVisible();
}

test('Auto Play: the Start menu window starts the farm bot, which attacks the Aibatt by itself; a whisper stops it', async ({ page }) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openAutoPlay(page);
  const farm = page.locator('.auto-farm');
  await expect(farm.locator('.auto-farm-state')).toHaveText('Off');
  await farm.getByRole('button', { name: 'Start', exact: true }).click();
  // nobody clicked the Aibatt: the bot chose it (SETTARGET) and swings at it (MELEE_ATTACK)
  await expect.poll(() => targetsOf(gateway).some(([id]) => id === MONSTER_ID), ON_FRAMES).toBe(true);
  await expect.poll(() => sentOf(gateway, PacketType.MELEE_ATTACK).length, ON_FRAMES).toBeGreaterThan(0);
  const auto = page.getByRole('button', { name: 'Auto Play', exact: true });
  await expect(auto).toHaveAttribute('data-state', 'running');
  gateway.pushCache(whisper('are you there?'));
  await expect(auto).toHaveAttribute('data-state', 'stopped');
  await expect(auto).toHaveAttribute('title', 'Auto Play stopped: message from Rocky');
  await expect(farm.locator('.auto-farm-state')).toHaveText('Stopped: message from Rocky');
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('Auto Play: the AUTO button starts it; Battery saver covers the game and a tap brings it back; a long press opens the window', async ({ page, isMobile }) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt)],
  });
  await playGateway(page, script);
  await enterFlaris(page);
  const auto = page.getByRole('button', { name: 'Auto Play', exact: true });
  await expect(auto).toBeVisible();
  await auto.click();
  await expect(auto).toHaveAttribute('data-state', 'running');
  await openAutoPlay(page);
  await page.locator('.auto-farm').getByRole('button', { name: 'Battery saver' }).click();
  const saver = page.locator('.hud-auto-saver');
  await expect(saver).toBeVisible();
  await expect(saver).toContainText('Auto Play running');
  await saver.click();
  await expect(saver).toBeHidden();
  if (isMobile) {
    // a phone: the AUTO button above the quick slot over Attack, its long press the window (Battery saver closed it)
    await expect(page.locator('.hud-auto-play')).toBeHidden();
    const box = (await auto.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await auto.dispatchEvent('pointerdown');
    await page.waitForTimeout(700);
    await auto.dispatchEvent('pointerup');
    await expect(page.locator('.hud-auto-play')).toBeVisible();
    await expect(auto).toHaveAttribute('data-state', 'running');
  }
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

// custom (owner 2026-11-16): the loot filter, Auto Play's Loot tab (docs/superpowers/plans/2026-11-16-pet-loot-filter.md)
test('Auto Play: the Loot tab shows the 8 kinds, all on; unchecking Jewellery keeps it and tells the World server', async ({ page }, info) => {
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [] });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openAutoPlay(page);
  await page.locator('.hud-auto-play').getByRole('tab', { name: 'Loot' }).click();
  const loot = page.locator('.auto-loot');
  // 2026-11-17: Neuz's ButtCheck.bmp boxes (role checkbox), not the browser's
  await expect(loot.getByRole('checkbox')).toHaveCount(8);
  for (const box of await loot.getByRole('checkbox').all()) await expect(box).toHaveAttribute('aria-checked', 'true');
  // every box and button inside the window, none cut off
  const win = (await page.locator('.hud-auto-play').boundingBox())!;
  for (const el of await loot.locator('button').all()) {
    const b = (await el.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(win.y + win.height + 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(win.x + win.width + 0.5);
  }
  await page.screenshot({ path: info.outputPath('loot-tab.png') });
  // every kind is what the server starts with: nothing sent on entering
  expect(sentOf(gateway, PacketType.PET_LOOT_FILTER)).toHaveLength(0);
  await loot.getByRole('checkbox', { name: 'Jewellery' }).click();
  // PET_LOOT_FILTER: DPID_UNKNOWN, the type, the mask (penya 1 ... jewellery 16 ... other 128)
  await expect.poll(() => sentOf(gateway, PacketType.PET_LOOT_FILTER).map((s) => s.body.readUInt32LE(8)), ON_FRAMES).toEqual([0xef]);
  const stored = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('flyffweb.autoPlay.'))?.[1] ?? '');
  expect(JSON.parse(stored).loot.mask).toBe(0xff & ~16);
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
