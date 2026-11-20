// custom (owner 2026-11-20): the Quick Job Change window against the pretend world server (docs/superpowers/plans/
// 2026-11-20-quick-job-change.md): it pops up for a level 15 Vagrant, whole on the screen above the task bar; the arrow
// picks Acrobat, Go! asks Yes/No in the same theme, Yes sends QUICK_JOB_CHANGE 0x8fff0130 with 2, and the World's job change
// (SET_JOB_SKILL) closes it. A level 14 Vagrant gets no pop-up, and the Start menu's Extras line says when it opens. Without
// `jobPopup` (every other test) it stays shut.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeSetJobSkill } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

const QUICK_JOB_CHANGE = 0x8fff0130;

function script(level: number) {
  const own = newVagrantOwn();
  return {
    own,
    world: createWorldScript({
      playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
      self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, level, own } }),
      others: [],
    }),
  };
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
/** The jobs sent: the int after DPID_UNKNOWN and the type. */
const jobsSent = (gateway: Gateway): number[] => sentOf(gateway, QUICK_JOB_CHANGE).map((s) => s.body.readInt32LE(8));

async function press(target: Locator): Promise<void> {
  if (isPhone()) await target.tap();
  else await target.click();
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

test('Quick Job Change pops up for a Lv15 Vagrant; Acrobat; Yes sends 0x8fff0130 with 2; SET_JOB_SKILL closes it', async ({ page }, info) => {
  const { own, world } = script(15);
  const gateway = await playGateway(page, world, { jobPopup: true });
  await enterFlaris(page);
  const win = page.locator('.hud-quick-job');
  await expect(win).toBeVisible();
  await expect(win.locator('.hud-window-title')).toHaveText('Quick Job Change');
  await expect(win.locator('[role="radio"]')).toHaveCount(4);
  await expect(win.locator('[role="radio"][aria-checked="true"]')).toHaveAttribute('aria-label', 'Mercenary');
  await expect(win.locator('[data-control="WIDC_STATIC1"]')).toHaveText('Mercenary');
  // the name is the group box's white title, not V15's blue static
  const color = await win.locator('[data-control="WIDC_STATIC1"] .hud-res-static-text').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(255, 255, 255)');
  await expectWhole(page, win);
  await page.screenshot({ path: info.outputPath(isPhone() ? 'quick-job-phone.png' : 'quick-job-desktop.png') });

  await press(win.locator('[data-control="WIDC_RIGHT"]'));
  await expect(win.locator('[data-control="WIDC_STATIC1"]')).toHaveText('Acrobat');
  await press(win.locator('[data-control="WIDC_GO"] button'));
  const box = page.locator('.hud-quick-job-confirm');
  await expect(box).toBeVisible();
  await expect(box.locator('[data-control="WIDC_TEXT1"]')).toHaveText("Become an Acrobat? This can't be undone.");
  await expectWhole(page, box);
  await page.screenshot({ path: info.outputPath(isPhone() ? 'quick-job-confirm-phone.png' : 'quick-job-confirm-desktop.png') });
  await press(box.locator('[data-control="WIDC_YES"]'));
  await expect(box).toBeHidden();
  await expect.poll(() => jobsSent(gateway)).toEqual([2]);

  // the World's answer: the new job, which closes the window
  gateway.pushCache(world.later([writeSetJobSkill(SELF_ID, 2, own.skills)]));
  await expect(win).toBeHidden();
});

test('a 568 x 320 phone: the window and its Yes/No box whole above the task bar, Go! and the arrows finger-sized', async ({ page }) => {
  test.skip(!isPhone(), 'a phone\'s layout');
  await page.setViewportSize({ width: 568, height: 320 });
  const { world } = script(15);
  await playGateway(page, world, { jobPopup: true });
  await enterFlaris(page);
  const win = page.locator('.hud-quick-job');
  await expect(win).toBeVisible();
  await expectWhole(page, win);
  for (const control of ['WIDC_GO"] button', 'WIDC_LEFT"]', 'WIDC_RIGHT"]']) {
    const box = (await win.locator(`[data-control="${control}`).boundingBox())!;
    expect(box.height, control).toBeGreaterThanOrEqual(28);
    expect(box.width, control).toBeGreaterThanOrEqual(40);
  }
  // the words scroll inside their box
  const words = win.locator('[data-control="WIDC_TEXT1"] .hud-res-text-body');
  expect(await words.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
  await press(win.locator('[data-control="WIDC_GO"] button'));
  const box = page.locator('.hud-quick-job-confirm');
  await expect(box).toBeVisible();
  await expectWhole(page, box);
  const yes = (await box.locator('[data-control="WIDC_YES"]').boundingBox())!;
  expect(yes.height).toBeGreaterThanOrEqual(24);
});

test('a Lv14 Vagrant: no pop-up; Start -> Extras -> Job Change says the next change opens at level 15', async ({ page }) => {
  const { world } = script(14);
  const gateway = await playGateway(page, world, { jobPopup: true });
  await enterFlaris(page);
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.locator('.hud-quick-job')).toBeHidden();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Extras', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Job Change' }).click();
  await expect(page.getByText('Your next job change opens at level 15.').first()).toBeVisible();
  await expect(page.locator('.hud-quick-job')).toBeHidden();
  expect(jobsSent(gateway)).toEqual([]);
});

test('without jobPopup the window stays shut (every other test\'s Lv15 Webby)', async ({ page }) => {
  await playGateway(page);
  await enterFlaris(page);
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.locator('.hud-quick-job')).toBeHidden();
  // and the Extras line still opens it
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Extras', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Job Change' }).click();
  await expect(page.locator('.hud-quick-job')).toBeVisible();
});
