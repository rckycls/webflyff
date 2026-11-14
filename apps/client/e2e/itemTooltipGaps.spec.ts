// 2026-11-15 (item tooltip gaps, docs/superpowers/specs/2026-11-15-item-tooltip-gaps-research.md): the bag's tooltips
// on the desktop (hover) and the phone (tap): a bag sword's comparison tooltip of the sword worn ("[ Equipped ]", right of
// it on the desktop, beside it in one row on the phone, on the screen), and an item's own time left ("... Period").
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import { NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** PARTS_RWEAPON (defineNeuz.h). */
const PARTS_RWEAPON = 10;

/** Webby holding a Wooden Sword (object 44), another +5 in the bag (3), and a starter item with 2 h of its own left (4). */
function scriptOf() {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 3, itemId: 21, count: 1, abilityOption: 5 },
    { objectId: 4, itemId: 2801, count: 1, keepTime: 7200 },
    { objectId: 44, itemId: 21, count: 1 },
  ];
  const equipmentObjectIds = Array.from({ length: 31 }, (_, part) => (part === PARTS_RWEAPON ? 44 : NULL_ID));
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, others: [],
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds } }),
  });
}

test('the bag\'s tooltips: the worn sword beside the bag sword, and an item\'s own time left', async ({ page, isMobile }, info) => {
  await playGateway(page, scriptOf());
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const bag = page.locator('.hud-inventory');
  if (isMobile) await page.getByRole('button', { name: 'Bag', exact: true }).tap();
  else await page.keyboard.press('i');
  await expect(bag).toBeVisible();
  const show = async (slot: number) => {
    const cell = bag.locator(`[data-bag-slot="${slot}"]`);
    if (isMobile) await cell.tap();
    else await cell.hover();
  };

  // the bag sword: its tooltip, and the worn one's right of it, "[ Equipped ]" first
  await show(3);
  const details = bag.locator('.inventory-details');
  const compare = bag.locator('.inventory-compare');
  await expect(details).toBeVisible();
  await expect(details).toContainText('Wooden Sword +5');
  await expect(compare).toHaveCount(1);
  await expect(compare).toBeVisible();
  await expect(compare.locator('.hud-item-tooltip-line').first()).toHaveText('[ Equipped ]');
  await expect(compare.locator('.hud-item-tooltip-line').nth(1)).toHaveText('Wooden Sword');
  const main = (await details.boundingBox())!, sub = (await compare.boundingBox())!;
  expect(sub.x).toBeGreaterThan(main.x + main.width - 4);
  // both on the screen, bottoms level above the slot (tops level when there is no room above, as the main one goes below)
  const view = page.viewportSize()!;
  for (const box of [main, sub]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
  }
  expect(Math.min(Math.abs(main.y + main.height - (sub.y + sub.height)), Math.abs(main.y - sub.y))).toBeLessThan(3);
  await shot('comparison');

  // an item that is not worn gear has its own time left, and no comparison
  if (isMobile) await bag.locator('.inventory-details-close').tap();
  await show(4);
  await expect(details).toContainText(/(\d+[dhms]){1,2} Period/);
  await expect(compare).toHaveCount(0);
  await shot('time-left');
});
