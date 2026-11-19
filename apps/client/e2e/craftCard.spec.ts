// custom (owner 2026-11-19): Bozman's Craft Card (docs/superpowers/specs/2026-11-19-craft-card-design.md), played against a
// scripted world server on the desktop (double-click) and on the phone (taps): the menu line, a stone and two suit cards
// in, a weapon card refused, the chance, Craft -> Yes -> CRAFT_CARD's bytes, the World's answer drawn in the Result part;
// a VIP2 character sees the bulk button. Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeCraftCard } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const CRAFT_CARD = 0x8fff0110;
/** `MMI.CRAFT_CARD` (hud/moverMenu.ts): the web client's own menu number. */
const ENTRY = 9201;

/** Webby (a VIP2, letter 'B') with 5 Craft Stones (3), 3 Volcano 4% (4), a Volcano 3% (5) and 2 Fire B (6). */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 3, itemId: 20280, count: 5 },
    { objectId: 4, itemId: 3207, count: 3 },
    { objectId: 5, itemId: 3255, count: 1 },
    { objectId: 6, itemId: 26596, count: 2 },
  ];
  const bozman = { ...julia, npc: { ...julia.npc!, characterKey: 'MaSa_Bozman' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, {
      ...self, player: { ...SELF_PLAYER, authorization: 0x42, own, equipmentObjectIds: Array(31).fill(NULL_ID) },
    }),
    others: [writeAddNpc(NPC_ID, bozman)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);

async function chooseEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await expect(item).toHaveText('Craft Card');
  await item.click();
}

async function putIn(page: Page, slot: number): Promise<void> {
  if (isPhone()) await bagCell(page, slot).tap();
  else await bagCell(page, slot).dblclick();
}

test('Craft Card at Bozman: a stone and two suit cards, Craft, the answer in the Result part', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  await chooseEntry(page, gateway, ENTRY);
  const craft = page.locator('.hud-craft-card');
  await expect(craft).toBeVisible();
  await expect(craft.locator('.hud-window-title')).toHaveText('Craft Card');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await expect(craft.locator('[data-craft="bulk"]')).toBeVisible(); // a VIP2

  await putIn(page, 3);
  await putIn(page, 4);
  await putIn(page, 5);
  await putIn(page, 6); // a weapon card after suit cards: refused
  await expect(craft.locator('[data-control^="WIDC_SLOT_CARD"][data-filled]')).toHaveCount(2);
  await expect(craft.locator('[data-control="WIDC_INFO"]')).toContainText('Chance: 35%');
  await expect(craft.locator('[data-control="WIDC_INFO"]')).toContainText('Makes: one random 7% suit card');
  await shot('craft-card-filled');

  await craft.locator('[data-craft="craft"]').click();
  await expect(page.locator('.hud-message:visible .hud-message-text'))
    .toHaveText('Craft with a 35% chance? On a fail the Craft Stone and all cards are lost.');
  await page.locator('.hud-message:visible [data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, CRAFT_CARD).length).toBe(1);
  const body = sentOf(gateway, CRAFT_CARD)[0]!.body;
  const words = Array.from({ length: 8 }, (_, i) => body.readUInt32LE(8 + i * 4));
  expect(words).toEqual([NPC_ID, 3, 4, 5, NULL_ID, NULL_ID, NULL_ID, 1]);
  expect(body.readUInt8(40)).toBe(0);
  expect(body.length).toBe(41);

  gateway.pushCache(script.later([writeCraftCard(SELF_ID, 0, [3218])]));
  await expect(craft.locator('[data-control="WIDC_RESULT"]')).toContainText('Success!');
  await expect(craft.locator('[data-control="WIDC_RESULT"]')).toContainText('Lightning Card(7%)');
  await expect(craft.locator('[data-filled]')).toHaveCount(0);
  await shot('craft-card-result');
});
