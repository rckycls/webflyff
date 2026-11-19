// custom (owner 2026-11-19): the Teleport window against the pretend world server (docs/superpowers/plans/2026-11-19-
// teleport-window.md): from the Start menu's Extras folder, whole on the screen above the task bar; a regular player's VIP
// place refused with nothing sent, Darkon sent as TELEPORT_WINDOW 0x8fff0120 with 2 and the window closed; a VIP1 player's
// Volcane sent with 11.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

const TELEPORT_WINDOW = 0x8fff0120;
const REGULAR = 0x46, VIP1 = 0x41; // 'F', 'A' (_Common/authorization.h)

function script(authorization: number) {
  const own = newVagrantOwn();
  own.gold = 1_000_000;
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, authorization, own } }),
    others: [],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
/** The places sent: the int after DPID_UNKNOWN and the type. */
const places = (gateway: Gateway): number[] => sentOf(gateway, TELEPORT_WINDOW).map((s) => s.body.readInt32LE(8));

async function press(page: Page, target: Locator): Promise<void> {
  if (isPhone()) await target.tap();
  else await target.click();
}

async function openTeleport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Extras', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Teleport' }).click();
  const win = page.locator('.hud-teleport');
  await expect(win).toBeVisible();
  await expect(win.locator('.hud-window-title')).toHaveText('Teleport');
  return win;
}

async function expectWhole(page: Page, win: Locator): Promise<void> {
  const box = (await win.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(0);
  const bar = await page.locator('.hud-taskbar-strip').boundingBox();
  if (bar !== null) expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 0.5);
}

test('Teleport: Extras opens it; a regular player\'s VIP place is refused, Darkon is sent as 2 and the window closes', async ({ page }, info) => {
  const gateway = await playGateway(page, script(REGULAR));
  await enterFlaris(page);
  const win = await openTeleport(page);
  await expect(win.locator('[role="option"]')).toHaveCount(14);
  await expect(win.locator('[role="option"][data-locked]')).toHaveCount(11);
  await expect(win.locator('[data-control="WIDC_STATIC1"]')).toHaveText('Flaris');
  await expect(win.locator('[data-control="WIDC_STATIC2"]')).toHaveText('10,000 Penya');
  await expectWhole(page, win);
  await page.screenshot({ path: info.outputPath('teleport-window.png') });

  await press(page, win.locator('[role="option"][data-place="11"]'));
  await expect(win.locator('[data-control="WIDC_STATIC1"]')).toHaveText('Volcane');
  await expect(win.locator('[data-control="WIDC_TEXT1"]')).toContainText('VIP only');
  await page.screenshot({ path: info.outputPath('teleport-vip-locked.png') });
  await press(page, win.locator('[data-control="WIDC_APPLY"]'));
  await expect(page.locator('.hud-messages')).toContainText('Only VIP players can teleport there.');
  await expect(win).toBeVisible();

  await press(page, win.locator('[role="option"][data-place="2"]'));
  await expect(win.locator('[data-control="WIDC_STATIC1"]')).toHaveText('Darkon');
  await press(page, win.locator('[data-control="WIDC_APPLY"]'));
  await expect(win).toBeHidden();
  await expect.poll(() => places(gateway)).toEqual([2]);
});

test('Teleport: a VIP1 player sends Volcane as 11', async ({ page }, info) => {
  const gateway = await playGateway(page, script(VIP1));
  await enterFlaris(page);
  const win = await openTeleport(page);
  await expect(win.locator('[role="option"][data-locked]')).toHaveCount(0);
  await press(page, win.locator('[role="option"][data-place="11"]'));
  await expect(win.locator('[data-control="WIDC_TEXT1"]')).not.toContainText('VIP only');
  await expectWhole(page, win);
  await page.screenshot({ path: info.outputPath('teleport-vip.png') });
  await press(page, win.locator('[data-control="WIDC_APPLY"]'));
  await expect(win).toBeHidden();
  await expect.poll(() => places(gateway)).toEqual([11]);
});
