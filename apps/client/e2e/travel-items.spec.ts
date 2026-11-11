// The Blinkwings and the Scroll of Return against the pretend world server (Piece 7 M3, spec §3.4, §5): a Town Blinkwing
// from the task bar with the server's cast and its far SETPOS, a Blinkwing of Volcan to another world, the cast's
// cancel, a refusal, and the Scroll's box, village window, RETURNSCROLL and its answer.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType, ShortcutKind } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddSelf, writeReplace, writeReturnScrollAck, writeSetPos, writeSetSkillState,
  writeStateMode, writeTaskBar, writeUpdateItem,
} from '@flyffweb/testkit';
import {
  MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, distanceXZ, enterFlaris, groundAt, hudTexts, ownAt, playGateway,
  recordHudTexts, self, sentOf,
} from './worldHarness';

test.setTimeout(150_000);

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
const TOWN_BLINKWING = 4805;
const VOLCAN_BLINKWING = 4811;
const RETURN_SCROLL = 10469;
const VOLCANE = 203;
/** Saint Morning's revival point (WdMadrigal.rgn:1315), some 1,500 m from Flaris' square. */
const SAINT_MORNING: Vec3 = [8470.58, 100, 3635.79];
/** The Blinkwing of Volcan's place (propItem.txt:2526). */
const VOLCANE_AT: Vec3 = [1394, 150, 544];

/** Webby with the new character's bag (5 Town Blinkwings at 2), 2 Blinkwings of Volcan at 3 and a Scroll of Return at 4. */
function webby() {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: 3, itemId: VOLCAN_BLINKWING, count: 2 }, { objectId: 4, itemId: RETURN_SCROLL, count: 1 });
  own.inventory!.sort((a, b) => a.objectId - b.objectId); // the inventory is listed in rising slots
  return { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } };
}

function scriptFor() {
  return createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby()), others: [] });
}

/** The two Blinkwings on the task bar's first two slots. */
const bar = writeTaskBar(SELF_ID, {
  applets: [], queue: [], actionPoint: 0,
  items: [2, 3].map((id, slot) => ({
    bar: 0, slot, shortcut: { kind: ShortcutKind.ITEM, id, type: 0, index: 0, userId: 0, data: 1, text: '' },
  })),
});

/** Uses the task bar's slot: F1 or F2 on the PC, a tap on the phone. */
async function useSlot(page: Page, slot: number): Promise<void> {
  if (isTouch()) await page.locator(`.hud-slot[data-row="item"][data-slot="${slot}"]`).click();
  else await page.keyboard.press(`F${slot + 1}`);
}

const used = (gateway: Awaited<ReturnType<typeof playGateway>>): number[] =>
  sentOf(gateway, PacketType.DOUSEITEM).map((s) => s.body.readUInt32LE(8) >>> 16);
const cancels = (gateway: Awaited<ReturnType<typeof playGateway>>): Array<[number, number]> =>
  sentOf(gateway, PacketType.STATEMODE).map((s) => [s.body.readUInt32LE(8), s.body.readUInt8(12)]);
const errorsOf = async (page: Page): Promise<unknown[]> => (await page.evaluate(() => window.__client!.stats())).errors;
const playedXis = (page: Page): Promise<number[]> => page.evaluate(() => window.__client!.played().effects.map((e) => e.xi));

test('a Town Blinkwing: the cast, the server\'s SETPOS far away', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([bar]));
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="0"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await useSlot(page, 0);
  await expect.poll(() => used(gateway)).toEqual([2]);
  // the server's cast: the ready effect (XI_BLINKWING_READY) and the gauge over the head
  gateway.pushCache(script.later([writeStateMode(SELF_ID, 4, 0, TOWN_BLINKWING)]));
  await expect(page.locator('.cast-gauge')).toBeVisible(ON_FRAMES);
  await expect.poll(() => playedXis(page), ON_FRAMES).toContain(118);
  // 10 s later: OFF, the Blinkwing used, and the move (MoverSkill.cpp:1790-1834; World.cpp:1589-1604)
  gateway.pushCache(script.later([
    writeStateMode(SELF_ID, 0, 1), writeUpdateItem(SELF_ID, 2, 0, 4), writeSetPos(SELF_ID, SAINT_MORNING),
  ]));
  await expect(page.locator('.cast-gauge')).toBeHidden();
  await expect.poll(async () => distanceXZ(await ownAt(page), SAINT_MORNING), ON_FRAMES).toBeLessThan(1);
  await page.waitForTimeout(3000); // the ground there streams in: the character stays (Review Focus 2)
  const at = await ownAt(page);
  expect(distanceXZ(at, SAINT_MORNING)).toBeLessThan(1);
  expect(at[1]).toBeGreaterThan(groundAt(SAINT_MORNING[0], SAINT_MORNING[2]) - 1);
  if (isTouch()) await page.getByRole('button', { name: 'Bag', exact: true }).click();
  else await page.keyboard.press('i');
  await expect(page.locator('[data-bag-slot="2"]')).toContainText('4');
  expect(await errorsOf(page)).toEqual([]);
});

test('a Blinkwing of Volcan to another world', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  // a Scroll of Return used earlier: its 4-hour buff (BUFF_ITEM) and its blinking icon, the way back
  gateway.pushCache(script.later([bar, writeSetSkillState(SELF_ID, SELF_ID, 0, RETURN_SCROLL, 0, 14_400_000)]));
  const scrollIcon = page.locator('.hud-buffs .hud-buff img[alt="Scroll of Return"]');
  await expect(scrollIcon).toBeVisible(ON_FRAMES);
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="1"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await useSlot(page, 1);
  await expect.poll(() => used(gateway)).toEqual([3]);
  gateway.pushCache(script.later([writeStateMode(SELF_ID, 4, 0, VOLCAN_BLINKWING)]));
  await expect(page.locator('.cast-gauge')).toBeVisible(ON_FRAMES);
  // the cast ends in another world: REPLACE, then the own ADD_OBJ there (World.cpp:1610-1671) (Review Focus 3)
  gateway.pushCache(script.later([
    writeStateMode(SELF_ID, 0, 1), writeUpdateItem(SELF_ID, 3, 0, 1), writeReplace(NULL_ID, VOLCANE, VOLCANE_AT),
    writeAddSelf(SELF_ID, { ...webby(), pos: VOLCANE_AT }),
  ]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(VOLCANE), ON_FRAMES);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible(ON_FRAMES);
  await expect(page.locator('.cast-gauge')).toBeHidden();
  // the buffs go with the player to the new world (final review, Important 1): the way back is still there
  await expect(scrollIcon).toBeVisible(ON_FRAMES);
  expect(await errorsOf(page)).toEqual([]);
});

test('walking cancels the cast', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([bar]));
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="0"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await useSlot(page, 0);
  await expect.poll(() => used(gateway)).toEqual([2]);
  gateway.pushCache(script.later([writeStateMode(SELF_ID, 4, 0, TOWN_BLINKWING)]));
  await expect(page.locator('.cast-gauge')).toBeVisible(ON_FRAMES);
  // a walk forward on the PC, a jump on the phone (WndWorldControlPlayer.cpp:422-433, :487-505): one cancel
  if (isTouch()) {
    await page.locator('.hud-jump').click();
  } else {
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
  }
  await expect.poll(() => cancels(gateway), ON_FRAMES).toEqual([[4, 2]]);
  gateway.pushCache(script.later([writeStateMode(SELF_ID, 0, 2)]));
  await expect(page.locator('.cast-gauge')).toBeHidden();
  expect(cancels(gateway)).toHaveLength(1);
  expect(await errorsOf(page)).toEqual([]);
});

test('a refusal: not standing', async ({ page }) => {
  test.skip(isTouch(), 'the walk is the PC\'s W key; the phone\'s joystick has its own tests');
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([bar]));
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="0"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await recordHudTexts(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await useSlot(page, 0);
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('You can use it when you stand up.');
  await page.keyboard.up('w');
  expect(used(gateway)).toEqual([]);
});

test('the Scroll of Return: the box, the village, RETURNSCROLL and its answer', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const bag = page.locator('.hud-inventory');
  if (isTouch()) await page.getByRole('button', { name: 'Bag', exact: true }).click();
  else await page.keyboard.press('i');
  const cell = bag.locator('[data-bag-slot="4"]');
  await expect(cell).toBeVisible(ON_FRAMES);
  if (isTouch()) {
    await cell.click();
    await bag.locator('[data-item-action="use"]').click();
  } else {
    await cell.dblclick();
  }
  // the shown message box (others wait hidden beside it)
  const box = page.locator('.hud-message:visible');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Do you want to use the item?');
  expect(used(gateway)).toEqual([]);
  if (isTouch()) {
    // the question at its full 256 px on the phone, whole on the screen, its words at 14 px (final review, Minor 4 graded
    // Important: at the 0.7 scale its text was 9.8 px and its last line cut)
    const view = page.viewportSize()!;
    const at = (await box.boundingBox())!;
    expect(at.width).toBeGreaterThanOrEqual(255);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y + at.height).toBeLessThanOrEqual(view.height + 0.5);
    const size = await box.locator('.hud-message-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
  }
  await box.locator('[data-button="ok"]').click();
  const villages = page.locator('.hud-select-village');
  await expect(villages).toBeVisible();
  if (isTouch()) {
    // a 750 x 342 phone: the window whole on the screen, its labels at least 14 px (Review Focus 5)
    const view = page.viewportSize()!;
    const at = (await villages.boundingBox())!;
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.x + at.width).toBeLessThanOrEqual(view.width + 0.5);
    expect(at.y + at.height).toBeLessThanOrEqual(view.height + 0.5);
    const size = await villages.getByRole('radio', { name: 'Sain City' }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
  }
  await villages.getByRole('radio', { name: 'Sain City' }).click();
  await villages.locator('[data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, PacketType.RETURNSCROLL).map((s) => s.body.readInt32LE(8))).toEqual([1]);
  // the server's answer: the scroll used again, with no second box (OnReturnScrollACK)
  gateway.pushCache(script.later([writeReturnScrollAck(SELF_ID)]));
  await expect.poll(() => used(gateway)).toEqual([4]);
  await expect(box).toBeHidden();
  expect(await errorsOf(page)).toEqual([]);
});
