// custom (owner 2026-11-19): the Awaken window against the pretend world server (docs/superpowers/plans/2026-11-19-awaken-
// window.md): from the Start menu, a suit and a Scroll of Awakening put in from the bag, the Yes/No box with "Don't ask
// again", AWAKEN_WINDOW 0x8fff0104 sent, the World's answer (UPDATE_ITEM_EX, UPDATE_ITEM) drawn in the panel, and the next
// press sent at once.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeUpdateItem, writeUpdateItemEx } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

const COTTON_SUIT = 502, AWAKE = 26461, REVERSION = 26462;
const AWAKEN_WINDOW = 0x8fff0104;
/** STR +20, Attack Speed +15%, Max. HP +250 (itemTooltip.test.ts). */
const NEW_AWAKENING = 0x08cfa184b0041400n;
const UI_NUM = 0, UI_RANDOMOPTITEMID = 10;

function script() {
  const own = newVagrantOwn();
  own.gold = 1_000_000;
  own.inventory = [
    { objectId: 3, itemId: COTTON_SUIT, count: 1 },
    { objectId: 5, itemId: AWAKE, count: 2 },
    { objectId: 6, itemId: REVERSION, count: 1 },
  ] as typeof own.inventory;
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
/** The packets' three DWORDs, after DPID_UNKNOWN and the type. */
const words = (gateway: Gateway): number[][] => sentOf(gateway, AWAKEN_WINDOW).map((s) => [8, 12, 16].map((at) => s.body.readUInt32LE(at)));

async function putIn(page: Page, slot: number): Promise<void> {
  const cell = page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
  if (isPhone()) await cell.tap();
  else await cell.dblclick();
}

test('Awaken: the Start menu opens it; a suit and a scroll; Yes with Don\'t ask sends; the panel shows the new awakening; the next press goes at once', async ({ page }, info) => {
  const s = script();
  const gateway = await playGateway(page, s);
  await enterFlaris(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Extras', exact: true }).click(); // 2026-11-19: Awaken is in the Extras folder
  await page.getByRole('menuitem', { name: 'Awaken' }).click();
  const win = page.locator('.hud-awaken');
  await expect(win).toBeVisible();
  await expect(win.locator('.hud-window-title')).toHaveText('Awaken');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await putIn(page, 3);
  await putIn(page, 5);
  await expect(win.locator('[data-slot][data-filled]')).toHaveCount(2);
  await expect(win.locator('[data-control="WIDC_STATIC9"]')).toHaveText('50,000');
  await expect(win.locator('.hud-awaken-line')).toHaveText(['Not awakened']);
  // the whole window on screen, above the task bar
  const box = (await win.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(0);
  const bar = await page.locator('.hud-taskbar-strip').boundingBox();
  if (bar !== null) expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 0.5);
  await page.screenshot({ path: info.outputPath('awaken-window.png') });

  await win.getByRole('button', { name: 'Awaken' }).click();
  const confirm = page.locator('.hud-awaken-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Awaken this item? It uses 1 Scroll of Awakening and 50,000 Penya.');
  await page.screenshot({ path: info.outputPath('awaken-confirm.png') });
  await confirm.getByRole('checkbox', { name: "Don't ask again" }).click();
  await confirm.locator('[data-control="WIDC_YES"]').click();
  await expect(confirm).toBeHidden();
  await expect.poll(() => words(gateway), ON_FRAMES).toEqual([[3, 5, NULL_ID]]);

  // the World's answer: the suit's new awakening, one scroll used
  gateway.pushCache(s.later([
    writeUpdateItemEx(SELF_ID, 3, UI_RANDOMOPTITEMID, NEW_AWAKENING),
    writeUpdateItem(SELF_ID, 5, UI_NUM, 1),
  ]));
  await expect(win.locator('.hud-awaken-line').first()).toHaveText('STR +20', ON_FRAMES);
  await expect(win.locator('.hud-awaken-line')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('awaken-awakened.png') });

  // awakened now: without a Reversion nothing is sent; with one, "Don't ask again" sends it at once
  await win.getByRole('button', { name: 'Awaken' }).click();
  await expect(confirm).toBeHidden();
  expect(words(gateway)).toHaveLength(1);
  await putIn(page, 6);
  await expect(win.locator('[data-slot][data-filled]')).toHaveCount(3);
  await win.getByRole('button', { name: 'Awaken' }).click();
  await expect.poll(() => words(gateway), ON_FRAMES).toEqual([[3, 5, NULL_ID], [3, 5, 6]]);
  await expect(confirm).toBeHidden();
});
