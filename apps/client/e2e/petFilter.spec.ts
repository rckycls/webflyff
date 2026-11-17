// custom (owner 2026-11-16, "do something like this": RaGEZONE's Wakazaki pet filter): the Pet Filter window against the
// pretend world server (docs/superpowers/plans/2026-11-16-pet-filter.md): from the Start menu (and U with a keyboard), its
// 19 checks, Apply keeping the filter and telling the World server, and the kept filter sent on the next entry.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

const script = () => createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [] });

/** PET_FILTER's mask: after DPID_UNKNOWN and the type. */
const masks = (gateway: Awaited<ReturnType<typeof playGateway>>): number[] =>
  sentOf(gateway, PacketType.PET_FILTER).map((s) => s.body.readUInt32LE(8));

async function openFromStart(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Pet Filter' }).click();
  await expect(page.locator('.hud-pet-filter')).toBeVisible();
}

test('Pet Filter: the Start menu opens the 19 checks; Apply keeps Ring and 4% Cards and tells the World server', async ({ page, isMobile }, info) => {
  const gateway = await playGateway(page, script());
  await enterFlaris(page);
  await openFromStart(page);
  const win = page.locator('.hud-pet-filter');
  const checks = win.getByRole('checkbox');
  await expect(checks).toHaveCount(19);
  for (const box of await checks.all()) await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(win).toContainText('Choose the items you DO NOT want to pick up');
  // the whole window on screen, above the task bar, every check and Apply inside it
  const box = (await win.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(0);
  const bar = await page.locator('.hud-taskbar-strip').boundingBox();
  if (bar !== null) expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 0.5);
  for (const el of [...await checks.all(), win.getByRole('button', { name: 'Apply' })]) {
    const b = (await el.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  }
  await page.screenshot({ path: info.outputPath('pet-filter.png') });
  // nothing left behind is what the server starts with: nothing sent on entering
  expect(masks(gateway)).toEqual([]);
  await win.getByRole('checkbox', { name: 'Ring', exact: true }).click();
  await win.getByRole('checkbox', { name: '4% Cards', exact: true }).click();
  await expect(win.getByRole('checkbox', { name: 'Ring', exact: true })).toHaveAttribute('aria-checked', 'true');
  // not sent before Apply
  expect(masks(gateway)).toEqual([]);
  await win.getByRole('button', { name: 'Apply' }).click();
  await expect(win).toBeHidden();
  // FILTER_RING 512 | FILTER_4PCARD 32768
  await expect.poll(() => masks(gateway), ON_FRAMES).toEqual([0x8200]);
  expect(await page.evaluate(() => localStorage.getItem('flyffweb.petFilter'))).toBe(String(0x8200));
  // opened again (U with a keyboard): the kept filter checked
  if (isMobile) await openFromStart(page);
  else {
    await page.keyboard.press('u');
    await expect(win).toBeVisible();
  }
  await expect(win.getByRole('checkbox', { name: 'Ring', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(win.getByRole('checkbox', { name: '4% Cards', exact: true })).toHaveAttribute('aria-checked', 'true');
  // a change closed away is dropped, and nothing more is sent
  await win.getByRole('checkbox', { name: 'Egg', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(win).toBeHidden();
  expect(masks(gateway)).toEqual([0x8200]);
  expect(await page.evaluate(() => localStorage.getItem('flyffweb.petFilter'))).toBe(String(0x8200));
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('Pet Filter: the kept filter goes to the World server as the character enters', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('flyffweb.petFilter', String(1 | 8192)); });
  const gateway = await playGateway(page, script());
  await enterFlaris(page);
  // FILTER_HPFOOD 1 | FILTER_QUESTITEM 8192, once
  await expect.poll(() => masks(gateway), ON_FRAMES).toEqual([1 | 8192]);
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
