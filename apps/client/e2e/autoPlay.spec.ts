// custom (owner 2026-11-15): Auto Play against the pretend world server (docs/superpowers/specs/2026-11-15-auto-play-design.md):
// the window from the Start menu, the farm bot engaging the Aibatt by itself, a whisper stopping it, the AUTO button, and
// the battery saver. The servers, Flaris and the helpers are worldHarness.ts's.
// 2026-11-20 (owner, "the autoplay icon on display should open the autoplay window when clicked and not just stop and
// start the autoplay. stop and start should be inside the autoplay window"): the AUTO button opens (and closes) the window;
// Start / Stop is the bar under the window's tabs, on every tab.

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

/** The window's Start / Stop bar (2026-11-20). */
const runBar = (page: Page) => page.locator('.hud-auto-play .auto-play-run');

test('Auto Play: the Start menu window starts the farm bot, which attacks the Aibatt by itself; a whisper stops it', async ({ page }) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openAutoPlay(page);
  const bar = runBar(page);
  await expect(bar.locator('.auto-farm-state')).toHaveText('Off');
  await bar.getByRole('button', { name: 'Start', exact: true }).click();
  // nobody clicked the Aibatt: the bot chose it (SETTARGET) and swings at it (MELEE_ATTACK)
  await expect.poll(() => targetsOf(gateway).some(([id]) => id === MONSTER_ID), ON_FRAMES).toBe(true);
  await expect.poll(() => sentOf(gateway, PacketType.MELEE_ATTACK).length, ON_FRAMES).toBeGreaterThan(0);
  const auto = page.getByRole('button', { name: 'Auto Play', exact: true });
  await expect(auto).toHaveAttribute('data-state', 'running');
  await expect(bar.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(bar.locator('.auto-farm-state')).toHaveText(/^Running: /);
  gateway.pushCache(whisper('are you there?'));
  await expect(auto).toHaveAttribute('data-state', 'stopped');
  await expect(auto).toHaveAttribute('title', 'Auto Play stopped: message from Rocky');
  await expect(bar.locator('.auto-farm-state')).toHaveText('Stopped: message from Rocky');
  await expect(bar.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('Auto Play: the AUTO button opens the window and starts nothing; its Start runs the bot, the button glows; Battery saver; Stop', async ({ page, isMobile }, info) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const auto = page.getByRole('button', { name: 'Auto Play', exact: true });
  const autoWindow = page.locator('.hud-auto-play');
  await expect(auto).toBeVisible();
  // a click (a tap) opens the window, on the Farm tab, and starts nothing
  if (isMobile) await auto.tap();
  else await auto.click();
  await expect(autoWindow).toBeVisible();
  await expect(autoWindow.getByRole('tab', { name: 'Farm' })).toHaveAttribute('aria-selected', 'true');
  await expect(auto).toHaveAttribute('data-state', 'off');
  expect(targetsOf(gateway)).toEqual([]);
  const bar = runBar(page);
  await expect(bar.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await autoWindow.screenshot({ path: info.outputPath(`auto-play-window-off-${isMobile ? 'phone' : 'desktop'}.png`) });
  // Start is on every tab
  await autoWindow.getByRole('tab', { name: 'Potions' }).click();
  await expect(bar.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(auto).toHaveAttribute('data-state', 'running');
  await expect(bar.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect.poll(() => targetsOf(gateway).some(([id]) => id === MONSTER_ID), ON_FRAMES).toBe(true);
  await autoWindow.screenshot({ path: info.outputPath(`auto-play-window-running-${isMobile ? 'phone' : 'desktop'}.png`) });
  await page.screenshot({ path: info.outputPath(`auto-play-running-${isMobile ? 'phone' : 'desktop'}.png`) });
  await bar.getByRole('button', { name: 'Battery saver' }).click();
  const saver = page.locator('.hud-auto-saver');
  await expect(saver).toBeVisible();
  await expect(saver).toContainText('Auto Play running');
  await saver.click();
  await expect(saver).toBeHidden();
  // the saver closed the window; the AUTO button, glowing, opens it again on the tab of the mode last started
  await expect(autoWindow).toBeHidden();
  if (isMobile) await auto.tap();
  else await auto.click();
  await expect(autoWindow).toBeVisible();
  await expect(autoWindow.getByRole('tab', { name: 'Farm' })).toHaveAttribute('aria-selected', 'true');
  await expect(auto).toHaveAttribute('data-state', 'running');
  await bar.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(auto).toHaveAttribute('data-state', 'stopped');
  await expect(bar.locator('.auto-farm-state')).toHaveText('Stopped: you took control');
  // a second click on the AUTO button closes the window (on a phone its open window may hide the button: its X then)
  if (await auto.isVisible()) {
    if (isMobile) await auto.tap();
    else await auto.click();
  } else {
    await autoWindow.locator('.hud-window-close').tap();
  }
  await expect(autoWindow).toBeHidden();
  await expect(auto).toHaveAttribute('data-state', 'stopped');
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
