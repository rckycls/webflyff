// 2026-11-11: the item NPC windows (docs/superpowers/specs/2026-11-11-item-npc-windows-research.md), played against a scripted
// world server on the desktop (double-click and drag) and on the phone (taps): BoBoChan's Safe Element, Create Unique
// Weapon, Remove Jewel, Remove Element upgrading and Remove a Pierced Card; Peach's Create Shining Oricalkum; the GM's
// /ResistItem window. Each step leaves a picture in the test's output folder. (The Repair window has no NPC in V15: its
// unit tests cover it.)
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ArReader, ArWriter, MessageType, NULL_ID, UltimateResult, UltimateState } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeUltimate, writeUpdateItem } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

/** Items (dist/assets' catalog): Blue Jade Sword (general, 75), Lusaka's Sword (Ultimate), Cotton Suit, the stones and scrolls. */
const BLUE_JADE = 57, LUSAKA = 20148, COTTON_SUIT = 502;
const ORICHALCUM02 = 2034, SUNSTONE = 2035, MOONSTONE = 2036, RUBY = 2032, RUBY01 = 2040, RUBY02 = 2045;
const FLAME_CARD = 3206, SPROTECT = 10464, VOLCANO_CARD = 3204;
const SMELT_SAFETY = 0x70007000, TRANSWEAPON = 0xf000f112, REMOVEGEM = 0xf000f115, REMOVE_ATTRIBUTE = 0xf000d00b;
const PIERCINGREMOVE = 0xf000f809, MAKEITEM = 0xf000f110, CHAT = 0x00ff0000;
const UI_ULTIMATE_PIERCING = 14;

function scriptOf(npcKey: string, items: Array<Record<string, unknown> & { objectId: number; itemId: number; count: number }>,
  authorization = SELF_PLAYER.authorization): WorldScript {
  const own = newVagrantOwn();
  own.gold = 5_000_000;
  own.inventory = items as typeof own.inventory;
  const npc = { ...julia, npc: { ...julia.npc!, characterKey: npcKey } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, authorization, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, npc)],
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

/** The NPC's menu entry `entry`: a click on the desktop; on the phone a tap to select and a second to open the menu. */
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

/** A bag item put in the open window: a double-click on the desktop, a tap on the phone. */
async function putIn(page: Page, slot: number): Promise<void> {
  if (isPhone()) await bagCell(page, slot).tap();
  else await bagCell(page, slot).dblclick();
}

/** The desktop opens the bag with I when the window did not; the phone's window opened it. */
async function bagOpen(page: Page): Promise<void> {
  const bag = page.locator('.hud-inventory');
  if (!(await bag.isVisible())) await page.keyboard.press('i');
  await expect(bag).toBeVisible();
}

/** The phone's words: at least 14 px; its slots and buttons big enough for a finger. */
async function phoneSized(window: Locator): Promise<void> {
  if (!isPhone()) return;
  for (const target of await window.locator('.hud-window-body :is(.hud-res-text-body, .hud-picture-button)').all()) {
    if (!(await target.isVisible())) continue;
    expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  }
  for (const slot of await window.locator('[data-slot]').all()) {
    if (!(await slot.isVisible())) continue;
    const size = (await slot.boundingBox())!;
    expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
  }
  for (const button of await window.locator('.hud-window-body .hud-picture-button').all()) {
    if (!(await button.isVisible())) continue;
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  }
}

async function closeWindow(window: Locator): Promise<void> {
  if (await window.isVisible()) await window.locator('.hud-window-close').click();
  await expect(window).toBeHidden();
}

test('BoBoChan: Safe Element, Create Unique Weapon, Remove Jewel, Remove Element upgrading, Remove a Pierced Card', async ({ page }, info) => {
  const script = scriptOf('MaFl_Bobochan', [
    { objectId: 3, itemId: BLUE_JADE, count: 1, abilityOption: 5 },
    { objectId: 4, itemId: LUSAKA, count: 1, abilityOption: 8, ultimate: [RUBY01, RUBY02, 0] },
    { objectId: 5, itemId: COTTON_SUIT, count: 1, resist: 1, resistOption: 2, piercing: [VOLCANO_CARD, 0] },
    { objectId: 6, itemId: FLAME_CARD, count: 3 },
    { objectId: 7, itemId: SPROTECT, count: 3 },
    { objectId: 8, itemId: ORICHALCUM02, count: 1 },
    { objectId: 9, itemId: RUBY, count: 1 },
    { objectId: 10, itemId: MOONSTONE, count: 2 },
  ]);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // the menu: every entry of BoBoChan's is lit (Remove Element upgrading 59 among them)
  await tapMover(page, NPC_ID);
  if (isPhone() && !(await page.locator('.hud-mover-menu').isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await page.locator('.hud-mover-menu').isVisible())) await tapMover(page, NPC_ID);
  }
  for (const entry of [54, 55, 59, 72, 95, 167]) await expect(page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`)).toBeEnabled(ON_FRAMES);
  await shot('bobochan-menu');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-mover-menu')).toBeHidden();

  // Safe Element Upgrade (167): the suit (fire +2), a Flame Card, an SProtect; START sends a row 2 s on
  await chooseEntry(page, gateway, 167);
  const safety = page.locator('.hud-smelt-safety');
  await expect(safety).toBeVisible();
  await expect(safety.locator('.hud-window-title')).toHaveText('Safe Element Upgrade');
  await bagOpen(page);
  for (const slot of [5, 6, 7]) await putIn(page, slot);
  await expect(safety.locator('[data-control="WIDC_NOW_GRADE"]')).toHaveText('2');
  await phoneSized(safety);
  if (isPhone()) {
    // the phone's panel: the rows' cells 44 px, beside the bag and not under it
    expect((await safety.locator('[data-control="MATERIAL0"]').boundingBox())!.width).toBeGreaterThanOrEqual(44);
    const panel = (await safety.boundingBox())!, bag = (await page.locator('.hud-inventory').boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(bag.x + 1);
  }
  await shot('safe-element');
  await safety.locator('[data-control="WIDC_BUTTON_START"]').click();
  await expect.poll(() => sentOf(gateway, SMELT_SAFETY).length, { timeout: 10_000 }).toBe(1);
  expect(words(gateway, SMELT_SAFETY)).toEqual([5, 6, 7, NULL_ID]);
  gateway.pushCache(script.later([
    writeUpdateItem(SELF_ID, 5, 4, 3), // UI_RAO 3
    { objectId: SELF_ID, type: MessageType.SMELT_SAFETY, fields: new ArWriter().u8(1).toBytes() },
  ]));
  await expect(safety.locator('[data-control="RESULT0"]')).toHaveAttribute('data-result', 'success');
  await expect(safety.locator('[data-control="WIDC_NOW_GRADE"]')).toHaveText('3');
  await shot('safe-element-success');
  await safety.locator('[data-control="WIDC_BUTTON_STOP"]').click();
  await closeWindow(safety);

  // Create Unique Weapon (54): the sword, Shining Oricalkum, a Ruby (its level's); START sends; a failure's box
  await chooseEntry(page, gateway, 54);
  const change = page.locator('.hud-change-weapon');
  await expect(change).toBeVisible();
  await expect(change.locator('.hud-window-title')).toHaveText('Upgrade to a Unique Weapon');
  await bagOpen(page);
  for (const slot of [3, 8, 9]) await putIn(page, slot);
  await expect(change.locator('[data-slot][data-filled]')).toHaveCount(3);
  await phoneSized(change);
  await shot('change-weapon');
  await change.locator('[data-control="WIDC_START"]').click();
  await expect.poll(() => sentOf(gateway, TRANSWEAPON).length).toBe(1);
  expect(words(gateway, TRANSWEAPON)).toEqual([3, 9, 8]);
  gateway.pushCache(script.later([writeUltimate(SELF_ID, UltimateState.TRANSWEAPON, UltimateResult.FAILED)]));
  await expect(box(page)).toHaveText('Conversion to Unique weapon failed.');
  await closeBox(page);
  await expect(change.locator('[data-slot][data-filled]')).toHaveCount(0);
  await closeWindow(change);

  // Remove Jewel (95): the Ultimate sword and a Moonstone; the jewels and their stats; START sends and closes
  await chooseEntry(page, gateway, 95);
  const removeJewel = page.locator('.hud-remove-jewel');
  await expect(removeJewel).toBeVisible();
  await bagOpen(page);
  for (const slot of [4, 10]) await putIn(page, slot);
  await expect(removeJewel.locator('[data-slot][data-filled]')).toHaveCount(2);
  await expect(removeJewel.locator('.hud-remove-jewel-stat').nth(1)).not.toHaveText('');
  await phoneSized(removeJewel);
  await shot('remove-jewel');
  await removeJewel.locator('[data-control="WIDC_START"]').click();
  await expect.poll(() => sentOf(gateway, REMOVEGEM).length).toBe(1);
  expect(words(gateway, REMOVEGEM)).toEqual([4, 10]);
  await expect(removeJewel).toBeHidden();
  gateway.pushCache(script.later([writeUpdateItem(SELF_ID, 4, UI_ULTIMATE_PIERCING, 1), writeUltimate(SELF_ID, UltimateState.REMOVEGEM, 0)]));

  // Remove Element upgrading (59): the suit; START asks; YES sends; TRUE says so and closes
  await chooseEntry(page, gateway, 59);
  const removeAttribute = page.locator('.hud-remove-attribute');
  await expect(removeAttribute).toBeVisible();
  await bagOpen(page);
  await putIn(page, 5);
  await expect(removeAttribute.locator('[data-slot][data-filled]')).toHaveCount(1);
  await phoneSized(removeAttribute);
  await removeAttribute.locator('[data-control="WIDC_START"]').click();
  const confirm = page.locator('.hud-remove-attribute-confirm');
  await expect(confirm).toBeVisible();
  await shot('remove-attribute-confirm');
  await confirm.locator('[data-control="WIDC_YES"]').click();
  await expect.poll(() => sentOf(gateway, REMOVE_ATTRIBUTE).length).toBe(1);
  expect(words(gateway, REMOVE_ATTRIBUTE)).toEqual([5]);
  gateway.pushCache(script.later([{ objectId: SELF_ID, type: MessageType.REMOVE_ATTRIBUTE, fields: new ArWriter().i32(1).toBytes() }]));
  await expect(box(page)).toHaveText('The element of weapon was removed.');
  await expect(removeAttribute).toBeHidden();
  await expect(confirm).toBeHidden();
  await closeBox(page);

  // Remove a Pierced Card (72): the suit with its Volcano Card; its row; START sends and closes
  await chooseEntry(page, gateway, 72);
  const removePiercing = page.locator('.hud-remove-piercing');
  await expect(removePiercing).toBeVisible();
  await bagOpen(page);
  await putIn(page, 5);
  await expect(removePiercing.locator('[data-control="WIDC_STATIC_PIERCING1"]')).toContainText('+2%');
  await phoneSized(removePiercing);
  await shot('remove-piercing');
  await removePiercing.locator('[data-control="WIDC_START"]').click();
  await expect.poll(() => sentOf(gateway, PIERCINGREMOVE).length).toBe(1);
  expect(words(gateway, PIERCINGREMOVE)).toEqual([5]);
  await expect(removePiercing).toBeHidden();
});

test('Peach: Create Shining Oricalkum from five Sunstones and five Moonstones', async ({ page }, info) => {
  const script = scriptOf('MaFl_Peach', [{ objectId: 3, itemId: SUNSTONE, count: 5 }, { objectId: 4, itemId: MOONSTONE, count: 5 }]);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await chooseEntry(page, gateway, 51);
  const mix = page.locator('.hud-mix-jewel');
  await expect(mix).toBeVisible();
  await expect(mix.locator('.hud-window-title')).toHaveText('Sunstone & Moonstone Use.');
  await expect(page.locator('.hud-inventory')).toBeVisible(); // Neuz opens the bag with it
  for (let i = 0; i < 5; i++) {
    await putIn(page, 3);
    await putIn(page, 4);
  }
  await expect(mix.locator('[data-slot][data-filled]')).toHaveCount(10);
  await phoneSized(mix);
  await page.screenshot({ path: info.outputPath('mix-jewel.png') });
  await mix.locator('[data-control="WIDC_START"]').click();
  await expect.poll(() => sentOf(gateway, MAKEITEM).length).toBe(1);
  expect(words(gateway, MAKEITEM)).toEqual([3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  gateway.pushCache(script.later([writeUltimate(SELF_ID, UltimateState.MAKEITEM, UltimateResult.SUCCESS)]));
  const confirm = page.locator('.hud-mix-jewel-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Created a Shining Oricalkum.');
  await page.screenshot({ path: info.outputPath('mix-jewel-success.png') });
  await confirm.locator('[data-control="WIDC_OK"]').click();
  await expect(confirm).toBeHidden();
  await expect(mix.locator('[data-slot][data-filled]')).toHaveCount(0);
});

test('the GM’s /ResistItem opens its window; with an item in, "/ResistItem 1 10 5" sends "/ritem"', async ({ page }, info) => {
  const ADMIN = 0x50; // 'P', AUTH_ADMINISTRATOR
  const script = scriptOf('MaFl_Peach', [{ objectId: 3, itemId: BLUE_JADE, count: 1 }], ADMIN);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const phone = isPhone();
  if (phone) await page.getByRole('button', { name: 'Chat', exact: true }).tap(); else await page.keyboard.press('Enter');
  const chat = page.locator(phone ? '.hud-chat' : '.hud-neuz-chat');
  const input = chat.getByRole('textbox', { name: 'Chat message' });
  const say = async (line: string): Promise<void> => {
    if (!(await input.isVisible()) || !(await input.evaluate((el) => el === document.activeElement))) {
      if (phone) await input.tap(); else await page.keyboard.press('Enter');
    }
    await input.fill(line);
    if (phone) await chat.getByRole('button', { name: 'Send', exact: true }).click(); else await input.press('Enter');
  };
  await say('/ResistItem 1 10 5');
  const resist = page.locator('.hud-resist-item');
  await expect(resist).toBeVisible();
  await expect(resist.locator('.hud-window-title')).toHaveText('Upgrade');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  if (phone) await bagCell(page, 3).tap();
  else await bagCell(page, 3).dragTo(resist.locator('[data-control="WIDC_CUSTOM3"]'));
  await expect(resist.locator('[data-slot][data-filled]')).toHaveCount(1);
  await phoneSized(resist);
  await page.screenshot({ path: info.outputPath('resist-item.png') });
  await say('/ResistItem 1 10 5');
  await expect.poll(() => sentOf(gateway, CHAT).map((s) => { const r = new ArReader(s.body); r.bytes(8); return r.string(1024); }))
    .toContain('/ritem 3 1 10 5');
});
