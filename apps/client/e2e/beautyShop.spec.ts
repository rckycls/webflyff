// 2026-11-15: the beauty shop (docs/2026-11-15-beauty-shop-research.md), played against a scripted world server on the
// desktop and on the phone: the Hair Designer's hair window (a style and a colour, the prices, the confirm, SET_HAIR and
// its answer on the player and on another), the Makeup Artist's face window (CHANGEFACE and its answer), and the free
// hair coupon from the bag (its question, the window with the coupon on, SET_HAIR with the coupon). Each step leaves a
// picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddPlayer, writeAddSelf, writeChangeFace, writeSetHair,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  BASE, MADRIGAL, MI_MALE, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, julia, playGateway, self,
  sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const SET_HAIR = 0x00ff00af;
const CHANGEFACE = 0x00ff00ee;
const HAIR_COUPON = 26410;
const OTHER_ID = 9201;
const OTHER_PLAYER = 601;

/** Webby (hair 0, colour 0x907b6d, face 0) with two hair coupons (object 3) beside `npcKey`, and another player near. */
function scriptOf(npcKey: string): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 3, itemId: HAIR_COUPON, count: 2 }];
  const npc = { ...julia, npc: { ...julia.npc!, characterKey: npcKey } };
  const at: Vec3 = [SQUARE[0] + 3, groundAt(SQUARE[0] + 3, SQUARE[2]), SQUARE[2]];
  const other: AddedMover = {
    ...BASE, index: MI_MALE, pos: at, angle: 0, objectId: OTHER_ID, isPlayer: true,
    player: { ...SELF_PLAYER, self: false, name: 'Other', playerId: OTHER_PLAYER, equipmentObjectIds: [], worn: [] },
  };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, npc), writeAddPlayer(OTHER_ID, other)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const looks = (page: Page) => page.evaluate(() => window.__client!.looks!());
const lookOf = async (page: Page, objectId: number) => (await looks(page)).find((l) => l.objectId === objectId);
const text = (scope: ReturnType<Page['locator']>, id: string) => scope.locator(`[data-control="${id}"] .hud-res-static-text`);

/** The NPC's one entry runs at once (WndWorld.cpp:6630-6645); a phone's first tap only targets it. */
async function openFrom(page: Page, gateway: Gateway, window: ReturnType<Page['locator']>): Promise<void> {
  await tapMover(page, NPC_ID);
  if (isPhone() && !(await window.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await window.isVisible())) await tapMover(page, NPC_ID);
  }
  await expect(window).toBeVisible(ON_FRAMES);
}

/** The window's pictures drawn: the two models and the small boxes. */
async function drawn(window: ReturnType<Page['locator']>, small: number): Promise<void> {
  await expect(window.locator('[data-control="WIDC_CUSTOM5"] canvas')).toHaveCount(1, ON_FRAMES);
  await expect(window.locator('[data-control="WIDC_CUSTOM6"] canvas')).toHaveCount(1, ON_FRAMES);
  await expect(window.locator('.hud-beauty-box canvas')).toHaveCount(small, ON_FRAMES);
}

/** On a phone the panel fits the game area, its words are 12 px and its boxes keep their size. */
async function phoneFits(page: Page, window: ReturnType<Page['locator']>): Promise<void> {
  if (!isPhone()) return;
  const box = (await window.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  await expect(window.locator('.hud-window-frame')).toHaveCSS('display', 'grid');
  expect((await window.locator('.hud-beauty-box').first().boundingBox())!.width).toBeGreaterThanOrEqual(60);
}

test('the hair window: a style and a colour, 6,000,000 penya, SET_HAIR; the new hair on the player and on another', async ({ page }, info) => {
  const script = scriptOf('MaFl_HairShop');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const window = page.locator('.hud-beauty-hair');
  await openFrom(page, gateway, window);
  await expect(window.locator('.hud-window-title')).toHaveText('Hair Shop');
  if (!isPhone()) await expect(page.locator('.hud-inventory')).toBeVisible();
  await drawn(window, 4);
  await expect(text(window, 'WIDC_COST')).toHaveText('0');
  await phoneFits(page, window);
  await shot('hair-open');

  // the second style (hair 1) and a red of 200 (the edit's number: (200 / 255 * 0.7 + 0.3) * 255 = byte 216)
  await window.locator('[data-beauty-hair="1"]').click();
  await expect(window.locator('[data-beauty-hair="1"]')).toHaveAttribute('data-chosen', '');
  await expect(text(window, 'WIDC_STATIC1')).toHaveText('2,000,000');
  await window.locator('[data-control="WIDC_EDIT1"] input').fill('200');
  await expect(text(window, 'WIDC_STATIC2')).toHaveText('4,000,000');
  await expect(text(window, 'WIDC_COST')).toHaveText('6,000,000');
  await expect(window.locator('[data-beauty-bar="0"] .hud-beauty-knob.is-original')).toBeVisible();
  // a number past 254 is held to 254
  await window.locator('[data-control="WIDC_EDIT2"] input').fill('300');
  await expect(window.locator('[data-control="WIDC_EDIT2"] input')).toHaveValue('254');
  await window.locator('[data-control="WIDC_EDIT2"] input').fill('123');
  await shot('hair-chosen');

  // OK: the confirm's words, Yes sends and closes
  await window.locator('[data-control="WIDC_OK"]').click();
  const confirm = page.locator('.hud-beauty-confirm:visible');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('[data-control="WIDC_TEXT1"]'))
    .toHaveText('Selected Change your Hair Price is 6,000,000 Penya. Do you want to change your hair?');
  await shot('hair-confirm');
  await confirm.locator('[data-control="WIDC_YES"]').click();
  await expect.poll(() => sentOf(gateway, SET_HAIR).length).toBe(1);
  const body = sentOf(gateway, SET_HAIR)[0]!.body;
  // the green typed as 123: (123 / 255 * 0.7 + 0.3) * 255 = 162.6, byte 162
  expect([body[8], body[9], body[10], body[11], body.readInt32LE(12)]).toEqual([1, 216, 162, 0x6d, 0]);
  await expect(window).toBeHidden();

  // the server's answer, on the player and on another player near
  gateway.pushCache(script.later([writeSetHair(SELF_ID, 1, 216, 162, 0x6d), writeSetHair(OTHER_ID, 4, 10, 255, 255)]));
  await expect.poll(() => lookOf(page, SELF_ID), ON_FRAMES).toMatchObject({ hairMesh: 1, hairColor: 0xffd8a26d });
  // a byte under 77 is raised to 76 (0.3), as SetHairColor does
  await expect.poll(() => lookOf(page, OTHER_ID), ON_FRAMES).toMatchObject({ hairMesh: 4, hairColor: 0xff4cffff });
  await shot('hair-answered');
});

test('the face window: a new face, 1,000,000 penya, CHANGEFACE; the answer changes the face', async ({ page }, info) => {
  const script = scriptOf('MaFl_FaceOff');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const window = page.locator('.hud-beauty-face');
  await openFrom(page, gateway, window);
  await expect(window.locator('.hud-window-title')).toHaveText('Plastic Surgery');
  await drawn(window, 8);
  await phoneFits(page, window);
  await shot('face-open');

  // the new row's third face: face 8 (head 7); the arrows move the row
  await window.locator('[data-beauty-face="6"]').click();
  await expect(window.locator('[data-beauty-face="6"]')).toHaveAttribute('data-chosen', '');
  await window.locator('[data-control="WIDC_NEWFACE_RIGHT"]').click();
  await expect(window.locator('[data-beauty-face="5"]')).toHaveAttribute('data-chosen', '');
  await shot('face-chosen');
  await window.locator('[data-control="WIDC_BTN_OK"]').click();
  const confirm = page.locator('.hud-beauty-confirm:visible');
  await expect(confirm.locator('[data-control="WIDC_TEXT1"]'))
    .toHaveText('Selected Change your Appearance. Price is 1,000,000 Penya. Do you want to change your appearance?');
  await confirm.locator('[data-control="WIDC_YES"]').click();
  await expect.poll(() => sentOf(gateway, CHANGEFACE).length).toBe(1);
  const body = sentOf(gateway, CHANGEFACE)[0]!.body;
  expect([body.readUInt32LE(8), body.readUInt32LE(12), body.readInt32LE(16), body.readInt32LE(20)]).toEqual([500, 7, 1_000_000, 0]);
  await expect(window).toBeHidden();

  gateway.pushCache(script.later([writeChangeFace(500, 7), writeChangeFace(OTHER_PLAYER, 9)]));
  await expect.poll(() => lookOf(page, SELF_ID), ON_FRAMES).toMatchObject({ headMesh: 7 });
  await expect.poll(() => lookOf(page, OTHER_ID), ON_FRAMES).toMatchObject({ headMesh: 9 });
});

test('the hair coupon: its question, the window with the coupon on (no prices), SET_HAIR with the coupon', async ({ page }, info) => {
  const script = scriptOf('MaFl_Juria');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const bag = page.locator('.hud-inventory');
  if (isPhone()) await page.getByRole('button', { name: 'Bag', exact: true }).tap();
  else await page.keyboard.press('i');
  await expect(bag).toBeVisible();
  await bag.locator('[data-bag-slot="3"]').click();
  if (isPhone()) await bag.locator('[data-item-action="use"]').click();
  else await bag.locator('[data-bag-slot="3"]').dblclick();

  // flag 0's question; no DOUSEITEM goes
  const question = page.locator('.hud-beauty-confirm:visible');
  await expect(question.locator('.hud-window-title')).toHaveText('Use Coupon');
  await expect(question.locator('[data-control="WIDC_TEXT1"]')).toHaveText('You have a Free Coupon. Do you want to use it now?');
  await question.locator('[data-control="WIDC_YES"]').click();
  const window = page.locator('.hud-beauty-hair');
  await expect(window).toBeVisible();
  await expect(window.locator('.hud-window-title')).toHaveText('Hair Shop  Using the Free Coupon.');
  expect(sentOf(gateway, 0xff0021)).toHaveLength(0);

  await window.locator('[data-beauty-hair="2"]').click();
  await expect(text(window, 'WIDC_COST')).toHaveText('0');
  await window.locator('[data-control="WIDC_OK"]').click();
  await expect(question.locator('[data-control="WIDC_TEXT1"]')).toContainText('Do you want to use your Free Coupon now?');
  await expect(question.locator('.hud-beauty-warning')).toHaveText('Once used, the coupon is gone forever.');
  await page.screenshot({ path: info.outputPath('coupon-question.png') });
  await question.locator('[data-control="WIDC_YES"]').click();
  await expect.poll(() => sentOf(gateway, SET_HAIR).length).toBe(1);
  const body = sentOf(gateway, SET_HAIR)[0]!.body;
  expect([body[8], body.readInt32LE(12)]).toEqual([2, 1]);
});
