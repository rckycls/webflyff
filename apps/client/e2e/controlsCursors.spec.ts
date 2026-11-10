// 2026-11-11 (docs/2026-11-11-controls-cursors.md): the double W's auto-run, a walk or a flight going on as windows, the chat
// and the map open, the flight keys reversed (W climbs, S dives), and the V15 cursors on a computer (none on a phone).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf } from '@flyffweb/testkit';
import {
  MADRIGAL, MALE_VAGRANT, MONSTER_ID, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, distanceXZ, enterFlaris, ownAt,
  playGateway, self, tapWorld,
} from './worldHarness';

test.setTimeout(150_000);

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
const OBJSTA_MOVE_ALL = 0xff;
const OBJSTA_STAND = 0x01;
const OBJSTA_FMOVE = 0x04;
const ACC = 16;

const ownOf = async (page: Page) => (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === SELF_ID)!;
const moveOf = async (page: Page): Promise<number> => (await ownOf(page)).state & OBJSTA_MOVE_ALL;

/** How far the own player goes in `ms`. */
async function goes(page: Page, ms = 700): Promise<number> {
  const from = await ownAt(page);
  await page.waitForTimeout(ms);
  return distanceXZ(from, await ownAt(page));
}

/** Two quick presses of W: Neuz's double W (within 200 ms of the let-go). */
async function doubleW(page: Page): Promise<void> {
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyW');
}

test('auto-run: a double W walks on with no key held, through the bag, the Start menu, the map and the chat; S stops it', async ({ page }) => {
  test.skip(isTouch(), 'the PC\'s keys');
  await playGateway(page);
  await enterFlaris(page);
  await page.waitForTimeout(1000);
  await doubleW(page);
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_FMOVE);
  expect(await goes(page)).toBeGreaterThan(0.5);
  // the turn keys still turn while it walks
  const angle = (await ownOf(page)).angle;
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  expect((await ownOf(page)).angle).not.toBe(angle);
  // the bag, the Start menu, the map, the chat: it goes on
  await page.keyboard.press('KeyI');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await expect(page.locator('.hud-worldmap')).toBeVisible();
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('KeyM');
  await expect(page.locator('.hud-worldmap')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('.neuz-chat-edit input').first()).toBeFocused();
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('Escape');
  await page.locator('.world-view canvas').focus().catch(() => {});
  // S stops it
  await page.keyboard.press('KeyS');
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_STAND);
  expect(await goes(page, 500)).toBeLessThan(0.05);
});

test('auto-run: a later W stops it, and a click on the ground walks there and stops', async ({ page }) => {
  test.skip(isTouch(), 'the PC\'s keys');
  await playGateway(page);
  await enterFlaris(page);
  await page.waitForTimeout(1000);
  await doubleW(page);
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_FMOVE);
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyW');
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_STAND);
  // two presses farther apart than 200 ms are two single presses
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);
  expect(await moveOf(page)).toBe(OBJSTA_STAND);
  await doubleW(page);
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_FMOVE);
  await tapWorld(page, 0.5, 0.8);
  await expect.poll(() => moveOf(page), { timeout: 60_000 }).toBe(OBJSTA_STAND);
  expect(await goes(page, 500)).toBeLessThan(0.05);
});

test('a walk to a clicked point goes on as the chat takes the keys and as the map opens with W held', async ({ page }) => {
  test.skip(isTouch(), 'the PC\'s keys');
  await playGateway(page);
  await enterFlaris(page);
  await page.waitForTimeout(1000);
  await tapWorld(page, 0.5, 0.45);
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_FMOVE);
  await page.keyboard.press('Enter');
  expect(await goes(page, 400)).toBeGreaterThan(0.3);
  await page.keyboard.press('Escape');
  // W held as the map opens: the walk goes on under it, and W's let-go still stops it
  await expect.poll(() => moveOf(page), { timeout: 60_000 }).toBe(OBJSTA_STAND);
  await page.keyboard.down('KeyW');
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_FMOVE);
  await page.keyboard.press('KeyM');
  await expect(page.locator('.hud-worldmap')).toBeVisible();
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.keyboard.up('KeyW');
  await expect.poll(() => moveOf(page), ON_FRAMES).toBe(OBJSTA_STAND);
  await page.keyboard.press('KeyM');
});

const PARTS_RIDE = 13;
/** Webby flying 12 m over the square on the Magic Broom. */
function flyingScript() {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: 3, itemId: 5000, count: 1 });
  own.inventory!.sort((a, b) => a.objectId - b.objectId);
  const high: Vec3 = [SQUARE[0], SQUARE[1] + 12, SQUARE[2]];
  const equipmentObjectIds = Array.from({ length: 31 }, (_, part) => (part === PARTS_RIDE ? 3 : NULL_ID));
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: high, others: [],
    self: writeAddSelf(SELF_ID, { ...self, pos: high, stateFlag: 8, player: { ...SELF_PLAYER, level: 20, own, equipmentObjectIds, fuel: 1200 } }),
  });
}

test('flight: W climbs and S dives (the owner\'s reversal); the bag and the map leave the thrust on', async ({ page }) => {
  test.skip(isTouch(), 'the PC\'s keys; the phone\'s stick is unchanged (controls.test.ts)');
  await playGateway(page, flyingScript(), { listed: { level: 20, equipment: MALE_VAGRANT } });
  await enterFlaris(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await ownOf(page)).stateFlag & ACC, ON_FRAMES).toBe(ACC);
  const start = await ownOf(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await ownOf(page)).angleX, ON_FRAMES).toBeLessThan(-5);
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  expect((await ownOf(page)).pos[1]).toBeGreaterThan(start.pos[1]);
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await ownOf(page)).angleX, ON_FRAMES).toBeGreaterThan(5);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyI');
  expect(await goes(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('KeyM');
  await expect(page.locator('.hud-worldmap')).toBeVisible();
  expect(await goes(page)).toBeGreaterThan(0.5);
  expect((await ownOf(page)).stateFlag & ACC).toBe(ACC);
});

/** The cursor CSS shows at the point, as a shares of the canvas. */
async function cursorAt(page: Page, at: [number, number]): Promise<{ id: string | undefined; css: string }> {
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * at[0], box.y + box.height * at[1]);
  await page.waitForTimeout(300);
  return page.locator('.world-view canvas').evaluate((canvas) => ({
    id: (canvas as HTMLElement).dataset.cursor, css: getComputedStyle(canvas).cursor,
  }));
}

test('V15 cursors: a monster CUR_ATTACK, an NPC CUR_NPC, the ground and the windows CUR_BASE, an edit box CUR_EDIT', async ({ page }) => {
  test.skip(isTouch(), 'a phone shows no cursor: its own test');
  await playGateway(page);
  await enterFlaris(page);
  await page.waitForTimeout(1000);
  const monster = await page.evaluate((id) => window.__client!.screenOf(id), MONSTER_ID);
  const npc = await page.evaluate((id) => window.__client!.screenOf(id), NPC_ID);
  expect(monster).not.toBeNull();
  expect(npc).not.toBeNull();
  const attack = await cursorAt(page, monster!);
  expect(attack.id).toBe('attack');
  expect(attack.css).toContain('curattack');
  const talk = await cursorAt(page, npc!);
  expect(talk.id).toBe('npc');
  expect(talk.css).toContain('curnpc');
  const ground = await cursorAt(page, [0.5, 0.85]);
  expect(ground.id).toBe('base');
  expect(ground.css).toContain('curbase');
  expect(await page.getByRole('button', { name: 'Start', exact: true }).evaluate((el) => getComputedStyle(el).cursor)).toContain('curbase');
  await page.keyboard.press('Enter');
  const input = page.locator('.neuz-chat-edit input').first();
  expect(await input.evaluate((el) => getComputedStyle(el).cursor)).toContain('edit');
});

test('V15 cursors: a phone shows none', async ({ page }) => {
  test.skip(!isTouch(), 'the phone project');
  await playGateway(page);
  await enterFlaris(page);
  const css = await page.locator('.world-view canvas').evaluate((canvas) => getComputedStyle(canvas).cursor);
  expect(css).not.toContain('url(');
  expect(await page.locator('.world').evaluate((el) => getComputedStyle(el).cursor)).not.toContain('url(');
});
