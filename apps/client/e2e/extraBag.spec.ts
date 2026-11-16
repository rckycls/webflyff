// 2026-11-17: the extra bag, V15's Backpack (docs/2026-11-17-extra-bag-research.md), played against a scripted world server
// on the desktop (B, drags, the icon's tooltip) and on the phone (Start > Backpack, its tabs, taps and the number pad): an
// Extra Bag opens Bag 1 (AVAIL_POCKET), a stack goes in with its count and an item comes out (MOVE_ITEM_POCKET), the
// pocket expires and is covered again with its items kept. Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PocketPacket, decodeWorldPacket } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddSelf, writePocketAddItem, writePocketAttribute, writePocketRemoveItem, writeUpdateItem,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const RUBY = 2032;
const DIAMOND = 2029;
const WOODEN_SWORD = 21;
/** II_SYS_SYS_SCR_BAGBAG (defineItem.h:4907): "Extra Bag (30 days)", IK3_POCKET, dwSkillTime 2592000. */
const EXTRA_BAG = 26477;
const THIRTY_DAYS = 2_592_000;
const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Webby with 5 Rubies (object 5), a Wooden Sword (6) and an Extra Bag (7); a Diamond in pocket 0; Bag 2 expired, a sword in it. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 5, itemId: RUBY, count: 5 }, { objectId: 6, itemId: WOODEN_SWORD, count: 1 }, { objectId: 7, itemId: EXTRA_BAG, count: 1 },
  ];
  own.pockets = [
    { pocket: 0, expired: false, secondsLeft: null, slots: ids(6), items: [{ objectId: 0, itemId: DIAMOND, count: 1 }] },
    { pocket: 2, expired: true, secondsLeft: -60, slots: ids(24), items: [{ objectId: 3, itemId: WOODEN_SWORD, count: 1 }] },
  ];
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const moves = (gateway: Gateway) => sentOf(gateway, PocketPacket.MOVE_ITEM_POCKET).map(({ body }) => decodeWorldPacket(new Uint8Array(body)));

/** The count box: the desktop's field typed, or the phone's number pad tapped; then OK. */
async function amount(page: Page, value: string): Promise<void> {
  if (isPhone()) {
    const sheet = page.locator('.hud-amount-box:visible');
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-pad-key="escape"]').click();
    for (const key of value) await sheet.locator(`[data-pad-key="${key}"]`).click();
    await sheet.locator('[data-button="ok"]').click();
  } else {
    const gold = page.locator('.hud-trade-gold:visible');
    await expect(gold).toBeVisible();
    await gold.locator('input').fill(value);
    await gold.locator('[data-control="WIDC_OK"]').click();
  }
}

/** B on the desktop; the Start menu's Backpack line on the phone. */
async function openBackpack(page: Page): Promise<void> {
  if (isPhone()) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Backpack', exact: true }).click();
  } else {
    await page.keyboard.press('KeyB');
  }
  await expect(page.locator('.hud-bagex')).toBeVisible(ON_FRAMES);
}

test('the Backpack: an Extra Bag opens Bag 1, a stack in with its count, an item out, Bag 1 expires', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await openBackpack(page);
  const window = page.locator('.hud-bagex');
  await expect(window.locator('.hud-window-title')).toHaveText('Backpack');
  const grid = (pocket: number) => window.locator(`.hud-bagex-grid[data-pocket="${pocket}"]`);
  // pocket 0: 6 slots by position, the Diamond in the first; Bag 1 not there, Bag 2 expired: covered, its sword kept
  await expect(grid(0).locator('.hud-bagex-cell')).toHaveCount(6);
  await expect(grid(0).locator(`[data-item-id="${DIAMOND}"]`)).toHaveCount(1);
  await expect(window.locator('.hud-bagex-tab[data-pocket="1"]')).toHaveAttribute('data-usable', 'false');
  await expect(window.locator('.hud-bagex-tab[data-pocket="2"]')).toHaveAttribute('data-usable', 'false');
  await expect(grid(2).locator(`[data-item-id="${WOODEN_SWORD}"]`)).toHaveCount(1);

  if (isPhone()) {
    // the phone opens its bag beside it, the items alone; Bag 1's tab shows its line
    await expect(page.locator('.hud-inventory.inventory-items-only')).toBeVisible();
    await window.locator('[data-pocket-tab="1"]').tap();
    await expect(window.locator('.hud-bagex-phone-line')).toContainText('Place the Extra Bag icon here.');
  } else {
    // the icon's tooltip (OnMouseWndSurface)
    await window.locator('.hud-bagex-icon[data-pocket="1"]').hover();
    await expect(page.locator('.hud-bagex-tooltip')).toHaveText('Place the Extra Bag icon here.');
    // the Backpack does not open the bag on the desktop: B is the Backpack, I the bag
    await page.keyboard.press('KeyI');
    await expect(page.locator('.hud-inventory')).toBeVisible();
  }
  await shot('extra-bag-open');

  // the Extra Bag onto Bag 1's icon (the phone: tapped with Bag 1 shown): AVAIL_POCKET
  if (isPhone()) await bagCell(page, 7).tap();
  else await bagCell(page, 7).dragTo(window.locator('.hud-bagex-icon[data-pocket="1"]'));
  await expect.poll(() => sentOf(gateway, PocketPacket.AVAIL_POCKET).length, ON_FRAMES).toBe(1);
  expect(decodeWorldPacket(new Uint8Array(sentOf(gateway, PocketPacket.AVAIL_POCKET)[0]!.body)))
    .toEqual({ type: 'availPocketRequest', pocket: 1, objectId: 7 });
  gateway.pushCache(script.later([writePocketAttribute(NULL_ID, 1, 1, THIRTY_DAYS), writeUpdateItem(SELF_ID, 7, 0, 0)]));
  await expect(window.locator('.hud-bagex-tab[data-pocket="1"]')).toHaveAttribute('data-usable', 'true');
  await expect(window.locator('.hud-bagex-icon[data-pocket="1"]')).toHaveAttribute('aria-label', /^(30d|29d23h) left$/);
  if (isPhone()) await expect(window.locator('.hud-bagex-phone-line')).toContainText(/^(30d|29d23h) left$/);
  await shot('extra-bag-bag1-open');

  // 2 of the 5 Rubies into Bag 1: the count box, then MOVE_ITEM_POCKET from the bag (-1) to pocket 1
  if (isPhone()) await bagCell(page, 5).tap();
  else await bagCell(page, 5).dragTo(grid(1));
  await amount(page, '2');
  await expect.poll(() => moves(gateway).length, ON_FRAMES).toBe(1);
  expect(moves(gateway)[0]).toEqual({ type: 'moveItemPocketRequest', from: -1, objectId: 5, count: 2, to: 1 });
  gateway.pushCache(script.later([writePocketAddItem(NULL_ID, 1, { objectId: 5, itemId: RUBY, count: 2 }), writeUpdateItem(SELF_ID, 5, 0, 3)]));
  await expect(grid(1).locator(`[data-item-id="${RUBY}"] span`)).toHaveText('2');
  await shot('extra-bag-stack-in');

  // the Diamond out of pocket 0 to the bag: one, at once
  if (isPhone()) {
    await window.locator('[data-pocket-tab="0"]').tap();
    await grid(0).locator(`[data-item-id="${DIAMOND}"]`).tap();
  } else {
    await grid(0).locator(`[data-item-id="${DIAMOND}"]`).dragTo(bagCell(page, 12));
  }
  await expect.poll(() => moves(gateway).length, ON_FRAMES).toBe(2);
  expect(moves(gateway)[1]).toEqual({ type: 'moveItemPocketRequest', from: 0, objectId: 0, count: 1, to: -1 });
  gateway.pushCache(script.later([writePocketRemoveItem(NULL_ID, 0, 0, 1)]));
  await expect(grid(0).locator('[data-object-id]')).toHaveCount(0);

  if (isPhone()) {
    // the V15 look, compact: Neuz's 12 px words, the window's own frame, the cells at least 32 px
    expect(await window.locator('.hud-bagex-phone-tabs button').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(12);
    await expect(window.locator('.hud-window-frame')).toHaveCSS('display', 'grid');
    expect((await grid(0).locator('.hud-bagex-cell').first().boundingBox())!.width).toBeGreaterThanOrEqual(32);
    // the panel beside the bag, not over it
    const panel = (await window.boundingBox())!, bag = (await page.locator('.hud-inventory').boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(bag.x + 1);
    await window.locator('[data-pocket-tab="1"]').tap();
  }

  // Bag 1 expires (POCKET_ATTRIBUTE expired): covered again, its Rubies kept
  gateway.pushCache(script.later([writePocketAttribute(NULL_ID, 0, 1, 1)]));
  await expect(window.locator('.hud-bagex-tab[data-pocket="1"]')).toHaveAttribute('data-usable', 'false');
  await expect(grid(1).locator(`[data-item-id="${RUBY}"]`)).toHaveCount(1);
  await shot('extra-bag-expired');

  // closed: B again on the desktop, the close box on the phone; nothing more sent
  if (isPhone()) await window.locator('.hud-window-close').click();
  else await page.keyboard.press('KeyB');
  await expect(window).toBeHidden();
  expect(moves(gateway)).toHaveLength(2);
});
