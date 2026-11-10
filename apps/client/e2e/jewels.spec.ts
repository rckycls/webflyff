// 2026-11-10: Peach's Create Jewels and Jewel Setting (docs/superpowers/specs/2026-11-10-jewels-research.md), played against
// a scripted world server on the desktop (double-click and drag) and on the phone (taps): the weapon broken into Rubies,
// the Ultimate weapon's next socket set with a Ruby after START's turn, the answers' boxes, and the tooltip's set jewel.
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, UltimateResult, UltimateState } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeUltimate, writeUpdateItem } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

/** Blue Jade Sword (level 75, general), Lusaka's Sword (Ultimate, level 75), Ruby, Ruby02 (an ability jewel). */
const BLUE_JADE = 57;
const LUSAKA = 20148;
const RUBY = 2032;
const RUBY02 = 2045;
const MAKEGEM = 0xf000f111;
const SETGEM = 0xf000f114;
/** UI_ULTIMATE_PIERCING (`CMover::UpdateItem`). */
const UI_ULTIMATE_PIERCING = 14;

/** Webby with the general sword (object 3), the Ultimate sword +8 with one Ruby02 of three sockets (4), three Rubies (5). */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 3, itemId: BLUE_JADE, count: 1, abilityOption: 5 },
    { objectId: 4, itemId: LUSAKA, count: 1, abilityOption: 8, ultimate: [RUBY02, 0, 0] },
    { objectId: 5, itemId: RUBY, count: 3 },
  ];
  const peach = { ...julia, npc: { ...julia.npc!, characterKey: 'MaFl_Peach' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, peach)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
const closeBox = (page: Page) => page.locator('.hud-message:visible [data-button="ok"]').click();
const words = (gateway: Gateway, type: number, i = 0): number[] => {
  const body = sentOf(gateway, type)[i]!.body;
  const out: number[] = [];
  for (let at = 8; at + 4 <= body.length; at += 4) out.push(body.readUInt32LE(at));
  return out;
};

/** Peach's menu entry `entry`: a click on the desktop; on the phone a tap to select and a second to open the menu. */
async function chooseEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await item.click();
}

/** A bag item put in the open jewel window: a double-click on the desktop, a tap on the phone. */
async function putIn(page: Page, slot: number): Promise<void> {
  if (isPhone()) await bagCell(page, slot).tap();
  else await bagCell(page, slot).dblclick();
}

test('Create Jewels breaks a weapon into Rubies; Jewel Setting sets a Ruby in the next socket', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const bag = page.locator('.hud-inventory');

  // Create Jewels (MMI_SMELT_EXTRACTION 53): the bag opens with it on the phone; the desktop opens it with I
  await chooseEntry(page, gateway, 53);
  const extraction = page.locator('.hud-jewel-extraction');
  await expect(extraction).toBeVisible();
  await expect(extraction.locator('.hud-window-title')).toHaveText('Create Jewels');
  await expect(extraction).toContainText('Create Jewel');
  if (!isPhone()) await page.keyboard.press('i');
  await expect(bag).toBeVisible();
  const start = extraction.locator('[data-control="WIDC_START"]');
  await expect(start).toBeDisabled();
  await putIn(page, 5); // a Ruby: not a weapon, refused
  await expect(extraction.locator('[data-control="WIDC_PIC_SLOT"][data-filled]')).toHaveCount(0);
  await putIn(page, 3);
  await expect(extraction.locator('[data-control="WIDC_PIC_SLOT"][data-filled] img')).toBeVisible();
  await expect(start).toBeEnabled();
  await shot('create-jewels');
  await start.click();
  await expect.poll(() => sentOf(gateway, MAKEGEM).length).toBe(1);
  expect(words(gateway, MAKEGEM)).toEqual([3]);
  gateway.pushCache(script.later([writeUltimate(SELF_ID, UltimateState.MAKEGEM, UltimateResult.SUCCESS, 2)]));
  await expect(box(page)).toHaveText('You have created Ruby 2.');
  await shot('create-jewels-success');
  await closeBox(page);
  await extraction.locator('.hud-window-close').click();
  await expect(extraction).toBeHidden();
  if (isPhone()) await expect(bag).toBeHidden(); // the bag it opened goes with it, so Peach can be tapped again

  // Jewel Setting (MMI_SMELT_JEWEL 52): the Ultimate sword dropped (tapped) in, a Ruby into the usable socket
  await chooseEntry(page, gateway, 52);
  const setting = page.locator('.hud-jewel-setting');
  await expect(setting).toBeVisible();
  await expect(setting.locator('.hud-window-title')).toHaveText('Jewel Setting');
  if (!isPhone()) await expect(bag).toBeVisible();
  if (isPhone()) await bagCell(page, 4).tap();
  else await bagCell(page, 4).dragTo(setting.locator('[data-control="WIDC_CUSTOM1"]'));
  await expect(setting.locator('.hud-jewel-weapon')).toBeVisible();
  const sockets = setting.locator('[data-socket]');
  await expect(sockets).toHaveCount(5);
  expect(await sockets.evaluateAll((all) => all.map((s) => (s as HTMLElement).dataset.socket))).toEqual(['set', 'usable', 'open', 'closed', 'closed']);
  const settingStart = setting.locator('[data-control="WIDC_START"]');
  await expect(settingStart).toBeDisabled();
  await putIn(page, 5);
  await expect(sockets.nth(1).locator('img')).toBeVisible();
  await expect(settingStart).toBeEnabled();
  await shot('jewel-setting');
  if (isPhone()) {
    // the phone's words: the description and START at least 14 px
    for (const target of [setting.locator('.hud-res-text-body'), settingStart]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
    const slotBox = (await sockets.nth(1).boundingBox())!;
    expect(slotBox.width).toBeGreaterThanOrEqual(44);
  }
  await settingStart.click();
  await expect(settingStart).toBeDisabled();
  // START's turn: about 6 s, then the weapon and the jewel
  await expect.poll(() => sentOf(gateway, SETGEM).length, { timeout: 15_000 }).toBe(1);
  expect(words(gateway, SETGEM)).toEqual([4, 5]);
  gateway.pushCache(script.later([
    writeUpdateItem(SELF_ID, 4, UI_ULTIMATE_PIERCING, (RUBY02 << 16) | 1),
    writeUltimate(SELF_ID, UltimateState.SETGEM, UltimateResult.SUCCESS),
  ]));
  await expect(box(page)).toHaveText('Jewel creation succeeded!');
  await expect(setting).toBeHidden();
  await shot('jewel-setting-success');
  await closeBox(page);

  // the tooltip: the name's room for the Ultimate icon, two Ruby02 sockets set, the icon and the socket row (the phone's
  // bag closed with the window that opened it)
  if (!(await bag.isVisible())) await page.keyboard.press('i');
  await expect(bag).toBeVisible();
  if (isPhone()) await bagCell(page, 4).tap();
  else await bagCell(page, 4).hover();
  const details = bag.locator('.inventory-details');
  await expect(details).toBeVisible();
  await expect(details.locator('.hud-item-tooltip-ultimate')).toBeVisible();
  await expect(details.locator('.hud-item-tooltip-socket')).toHaveCount(3);
  await expect(details.locator(`.hud-item-tooltip-socket[data-jewel="${RUBY02}"]`)).toHaveCount(2);
  await shot('ultimate-tooltip');
});
