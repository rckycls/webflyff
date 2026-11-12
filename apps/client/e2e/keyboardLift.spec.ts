// 2026-11-12 (owner): on a phone the box typed in (the chat's line, the private shop's name) stays above the soft keyboard:
// the world's layer slides up while it has the focus (world/keyboardLift.ts). Chromium's phone emulation has no soft
// keyboard, so its visual viewport never shrinks: the box goes where the keyboard is taken to begin until the browser says
// (`FALLBACK_COVER`, the bottom 55% covered). The desktop has no keyboard to dodge and never slides.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

async function enter(page: Page): Promise<void> {
  const own = newVagrantOwn();
  own.gold = 100_000;
  await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own } }), others: [],
  }));
  await enterFlaris(page);
}

/** The box's bottom stands in the top 45% of the screen, minus the 8 px kept from the keyboard; its top on screen. */
async function aboveKeyboard(page: Page, field: Locator): Promise<void> {
  const height = page.viewportSize()!.height;
  await expect.poll(async () => (await field.boundingBox())!.y + (await field.boundingBox())!.height)
    .toBeLessThanOrEqual(height * 0.45 - 8 + 1);
  expect((await field.boundingBox())!.y).toBeGreaterThanOrEqual(0);
}

test('the chat line and the private shop name slide above the phone keyboard while typed in, and back after', async ({ page, isMobile }, info) => {
  await enter(page);
  const world = page.locator('.world');
  if (!isMobile) {
    await page.keyboard.press('Enter');
    const line = page.locator('.hud-neuz-chat').getByRole('textbox', { name: 'Chat message' });
    await expect(line).toBeFocused();
    await line.pressSequentially('hello');
    await expect(world).not.toHaveAttribute('data-keyboard-lift');
    expect(await world.evaluate((element) => element.style.transform)).toBe('');
    return;
  }
  const height = page.viewportSize()!.height;

  // the chat's line (the desktop's chat docked on the bar, 2026-11-12), above the task bar at the bottom: under any
  // keyboard until lifted
  const line = page.locator('.hud-neuz-chat').getByRole('textbox', { name: 'Chat message' });
  await expect(line).toBeVisible();
  const before = (await line.boundingBox())!;
  expect(before.y + before.height).toBeGreaterThan(height * 0.45);
  await line.tap();
  await expect(line).toBeFocused();
  await expect(world).toHaveAttribute('data-keyboard-lift', '');
  await aboveKeyboard(page, line);
  await line.pressSequentially('hello');
  await expect(line).toHaveValue('hello');
  await aboveKeyboard(page, line);
  await page.screenshot({ path: info.outputPath('phone-chat-lifted.png') });
  await line.evaluate((element) => (element as HTMLInputElement).blur());
  await expect(world).not.toHaveAttribute('data-keyboard-lift');
  expect(await world.evaluate((element) => element.style.transform)).toBe('');

  // the private shop's name
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Private Shop', exact: true }).tap();
  const shop = page.locator('.hud-vendor');
  await expect(shop).toBeVisible();
  const name = shop.locator('.vendor-phone-head input');
  await name.tap();
  await expect(name).toBeFocused();
  await aboveKeyboard(page, name);
  await name.pressSequentially('Webby potions');
  await expect(name).toHaveValue('Webby potions');
  await page.screenshot({ path: info.outputPath('phone-shop-name-lifted.png') });
  await name.evaluate((element) => (element as HTMLInputElement).blur());
  await expect(world).not.toHaveAttribute('data-keyboard-lift');
});
