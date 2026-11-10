// 2026-11-10: Summon Angel (docs/superpowers/specs/2026-11-10-summon-angel-research.md), played against a scripted world
// server on the desktop (double-click and drag) and on the phone (taps): the Priest of Confession's "Summon Angel", the
// Angel Window's slots, rates and START (CREATEANGEL), then an angel buff: the angel's model following the player, its
// EXP gauge, "Your Angel has reached full Exp.", the 100% box, and a press on its buff icon on a PK server (ANGELBUFF).
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { EVE_PK, NULL_ID } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeAngelInfo, writeFlyffEvent, writeSetSkillState,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, hudTexts, julia, playGateway, readAsset,
  recordHudTexts, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const SUNSTONE = 2035;
const MOONSTONE = 2036;
const BLUE_ANGEL = 30036;
const CREATEANGEL = 0x00fff000;
const ANGELBUFF = 0x00fff002;
/** BUFF_ITEM and the angels' dwSkillTime (`propItem.txt:4129-4132`). */
const BUFF_ITEM = 0;
const ANGEL_TIME = 999_999_999;

/** Webby (level 15) with 4 Sunstones (object 3), 2 Moonstones (4) and a sword (5), beside the Priest of Confession. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 3, itemId: SUNSTONE, count: 4 },
    { objectId: 4, itemId: MOONSTONE, count: 2 },
    { objectId: 5, itemId: 22028, count: 1 },
  ];
  const priest = { ...julia, npc: { ...julia.npc!, characterKey: 'MaMa_PKNPC01' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, priest)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
const closeBox = (page: Page) => page.locator('.hud-message:visible [data-button="ok"]').click();
const lines = async (page: Page): Promise<string[]> => (await hudTexts(page))?.lines ?? [];
/** The string of a sent CREATEANGEL: after DPID and the type, `WriteString`'s length and bytes. */
const createText = (gateway: Gateway): string => {
  const body = sentOf(gateway, CREATEANGEL)[0]!.body;
  return body.subarray(12, 12 + body.readInt32LE(8)).toString('latin1');
};

/** The priest's menu entry `entry`: a click on the desktop; on the phone a tap to select and a second to open the menu. */
async function chooseEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await expect(item).toHaveText('Summon Angel');
  await item.click();
}

/** A bag item put in the window: a double-click on the desktop, a tap on the phone. */
async function putIn(page: Page, slot: number): Promise<void> {
  if (isPhone()) await bagCell(page, slot).tap();
  else await bagCell(page, slot).dblclick();
}

/** The angel's full EXP at its level: `nExp1 / 100 * 60` for a Blue Angel (`RenderAngelStatus`, MoverRender.cpp:1972). */
function blueTarget(level: number): bigint {
  const index = readAsset<{ files: Record<string, string> }>('index.json');
  const rows = readAsset<Array<{ exp1: number | string }>>(index.files['data/exp.json']!);
  return (BigInt(rows[level]!.exp1) / 100n) * 60n;
}

test('Summon Angel: the window sends CREATEANGEL; the angel follows, fills and is asked back from its icon', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // the priest's Summon Angel (MMI_SUMMON_ANGEL 43): the bag and the window open
  await chooseEntry(page, gateway, 43);
  const angelWindow = page.locator('.hud-summon-angel');
  await expect(angelWindow).toBeVisible();
  await expect(angelWindow.locator('.hud-window-title')).toHaveText('Angel Window');
  await expect(angelWindow).toContainText('Confession');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  const rates = () => angelWindow.locator('[data-control^="WIDC_STATIC_"] .hud-res-static-text').allTextContents();
  await expect.poll(rates).toEqual(['100.0', '0.0', '0.0']);

  // the sword is refused as a use; two Sunstones and a Moonstone go in their rows
  await putIn(page, 5);
  await expect.poll(() => lines(page)).toContain('You cannot use items while trading.');
  await putIn(page, 3);
  await putIn(page, 3);
  await putIn(page, 4);
  await expect(angelWindow.locator('[data-angel-slot][data-filled]')).toHaveCount(3);
  await expect(angelWindow.locator('[data-angel-slot="10"][data-filled] img')).toBeVisible();
  await expect.poll(rates).toEqual(['91.0', '6.0', '3.0']);
  if (isPhone()) {
    // the phone's words at least 14 px, its slots 44 px and its buttons a finger's
    for (const target of [angelWindow.locator('.hud-res-text-body'), angelWindow.locator('[data-control="WIDC_STATIC3"] .hud-res-static-text'),
      angelWindow.locator('[data-control="WIDC_START"]')]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect((await angelWindow.locator('[data-angel-slot="0"]').boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await angelWindow.locator('[data-control="WIDC_START"]').boundingBox())!.height).toBeGreaterThanOrEqual(36);
    // a tap on a filled slot takes it out, and it goes back in
    await angelWindow.locator('[data-angel-slot="1"]').tap();
    await expect(angelWindow.locator('[data-angel-slot][data-filled]')).toHaveCount(2);
    await putIn(page, 3);
  } else {
    // a Sunstone dragged onto the Moonstone row is not taken
    await bagCell(page, 3).dragTo(angelWindow.locator('[data-angel-slot="15"]'));
    await expect(angelWindow.locator('[data-angel-slot][data-filled]')).toHaveCount(3);
  }
  await shot('angel-window');

  // START: the stacks in the order of the slots, then everything let go
  await angelWindow.locator('[data-control="WIDC_START"]').click();
  await expect.poll(() => sentOf(gateway, CREATEANGEL).length).toBe(1);
  expect(createText(gateway)).toBe('3D2DD4D1DD');
  await expect(angelWindow.locator('[data-angel-slot][data-filled]')).toHaveCount(0);
  await shot('angel-window-started');
  await angelWindow.locator('[data-control="WIDC_CANCEL"]').click();
  await expect(angelWindow).toBeHidden();

  // the angel used (on a PK server): its buff, its EXP; it follows the player with its gauge
  const level = 16; // the summoner's level + 1 (MoverSkill.cpp:1442)
  const target = blueTarget(level);
  gateway.pushCache(script.later([
    writeFlyffEvent(SELF_ID, { [EVE_PK]: 1 }),
    writeSetSkillState(SELF_ID, SELF_ID, BUFF_ITEM, BLUE_ANGEL, 0, ANGEL_TIME),
    writeAngelInfo(SELF_ID, target / 2n, level),
  ]));
  await expect.poll(() => page.evaluate(() => window.__client!.angels!()), ON_FRAMES)
    .toEqual([expect.objectContaining({ ownerId: SELF_ID, itemId: BLUE_ANGEL, drawn: true })]);
  await expect(page.locator('[data-angel-gauge] img[data-piece="fill"]')).toBeVisible();
  const icon = page.locator('.hud-buff', { has: page.locator('img[alt="Blue Angel"]') });
  await expect(icon).toHaveAttribute('title', /Blue Angel {3}50%/);
  await shot('angel-following');

  // full: the chat line, the box once, the icon blinking; a press asks for the full angel's item
  gateway.pushCache(script.later([writeAngelInfo(SELF_ID, target, level, true)]));
  await expect.poll(() => lines(page)).toContain('Your Angel has reached full Exp.');
  await expect(box(page)).toHaveText('Please click the Angle buff icon.');
  await shot('angel-full');
  await closeBox(page);
  await expect(icon).toHaveAttribute('title', /Blue Angel {3}100%/);
  await icon.click();
  await expect.poll(() => sentOf(gateway, ANGELBUFF).length).toBe(1);
});
