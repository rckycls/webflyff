// 2026-11-15 (social): Cheers, Couple, Follow and Duel (docs/2026-11-15-social-research.md), against the pretend servers, on the
// desktop and on the phone: the player menu's Cheer and Follow, the couple's proposal box, window and break-up, the duel's
// menu entries in a /ctd Duel Zone, its question, count and result.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddPlayer, writeAddSelf, writeAddRegion, writeCouple, writeCoupleResult, writeDecoupleResult,
  writeDuelCount, writeDuelRequest, writeDuelStart, writeFlyffEvent, writeProposeResult, writeQueryPlayerData,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  BASE, MADRIGAL, MI_FEMALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, hudTexts, playGateway, recordHudTexts,
  self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const LEAD_ID = 9300;
const LEAD_AT: Vec3 = [6967, groundAt(6967, 3323), 3323];
const lead: AddedMover = {
  ...BASE, hitPoint: 80, index: MI_FEMALE, pos: LEAD_AT, angle: 180, objectId: LEAD_ID, isPlayer: true,
  player: { ...SELF_PLAYER, self: false, name: 'Lead', sex: 1, playerId: LEAD, level: 75, job: 16, equipmentObjectIds: [] },
};

function scriptOf(): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddPlayer(LEAD_ID, lead)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const decoded = (gateway: Gateway, type: number) => sentOf(gateway, type).map(({ body }) => decodeWorldPacket(new Uint8Array(body)));
const lines = async (page: Page): Promise<string[]> => (await hudTexts(page))?.lines ?? [];
const menuEntry = (page: Page, id: number) => page.locator(`.hud-mover-menu [data-menu-entry="${id}"]`);

/** Lead's menu: a right click let go on the desktop; a tap to select, a second to open, on the phone. */
async function openLeadMenu(page: Page, gateway: Gateway): Promise<void> {
  if (isPhone()) {
    await tapMover(page, LEAD_ID);
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === LEAD_ID)).toBe(true);
    await tapMover(page, LEAD_ID);
  } else {
    const at = (await page.evaluate((id) => window.__client!.screenOf(id), LEAD_ID))!;
    const view = (await page.locator('.world-view canvas').boundingBox())!;
    await page.mouse.click(view.x + view.width * at[0], view.y + view.height * at[1], { button: 'right' });
  }
  await expect(page.locator('.hud-mover-menu')).toBeVisible();
}

test('the player menu\'s Cheer and Follow (MMI_CHEER, MMI_TRACE)', async ({ page }) => {
  const gateway = await playGateway(page, scriptOf());
  await enterFlaris(page);
  await openLeadMenu(page, gateway);
  await expect(menuEntry(page, 31)).toBeEnabled();
  await menuEntry(page, 31).click();
  await expect.poll(() => decoded(gateway, PacketType.CHEERING), ON_FRAMES).toContainEqual({ type: 'cheering', objectId: LEAD_ID });
  await openLeadMenu(page, gateway);
  await menuEntry(page, 12).click();
  // SetDestObj( Lead ): PLAYERSETDESTOBJ with Lead's object, range 0
  await expect.poll(() => decoded(gateway, PacketType.PLAYERSETDESTOBJ), ON_FRAMES)
    .toContainEqual(expect.objectContaining({ targetId: LEAD_ID }));
});

test('the couple: a proposal answered, the window (F or Start > Couple), Break Up', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  // a proposal from Lead: the box; OK sends COUPLE
  gateway.pushCache(script.later([writeProposeResult(SELF_ID, LEAD, 'Lead')]));
  const box = page.locator('.hud-couple-message');
  await expect(box).toContainText('Lead has proposed to you. Would you like to make a couple?');
  await page.screenshot({ path: test.info().outputPath('couple-proposal.png') });
  await box.locator('[data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, 0x8ffff002).length, ON_FRAMES).toBe(1);
  // the couple made, then its EXP after a while; Lead's data for the window
  gateway.pushCache(script.later([
    writeCoupleResult(SELF_ID, LEAD, 'Lead'), writeCouple(SELF_ID, 17000, LEAD, WEBBY),
    writeQueryPlayerData(SELF_ID, LEAD, 'Lead', { job: 16, level: 75, sex: 1, version: 1, login: 1 }),
  ]));
  await expect.poll(() => lines(page), ON_FRAMES).toContain('You and Lead are now a couple!');
  if (isPhone()) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    // 2026-11-18: in V15's Communication folder (WndTaskBar.cpp:2659-2667)
    await page.getByRole('menuitem', { name: 'Communication', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Couple', exact: true }).click();
  } else {
    await page.keyboard.press('KeyF');
  }
  const window = page.locator('.hud-couple');
  await expect(window).toBeVisible();
  await expect(window.locator('.hud-tab-title')).toHaveText(['Couple Information', 'Couple Skills']);
  await expect(window.locator('[data-page="info"]')).toContainText('Lead');
  await expect(window.locator('[data-page="info"]')).toContainText('75');
  await page.screenshot({ path: test.info().outputPath('couple-info.png') });
  await window.getByRole('button', { name: 'Couple Skills', exact: true }).click();
  // level 6 (17000 EXP): Power of Love lit
  await expect(window.locator('.hud-couple-skill[data-active]')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('couple-skills.png') });
  await window.getByRole('button', { name: 'Couple Information', exact: true }).click();
  await window.getByRole('button', { name: 'Break Up', exact: true }).click();
  await expect(box).toContainText('Are you certain you would like to break up with Lead?');
  await box.locator('[data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, 0x8ffff003).length, ON_FRAMES).toBe(1);
  gateway.pushCache(script.later([writeDecoupleResult(SELF_ID)]));
  await expect.poll(() => lines(page), ON_FRAMES).toContain('Your couple has broken up.');
});

test('the duel: offered only in a /ctd Duel Zone; the request, the question, the count and the result', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  // EVE_18 on, no zone yet: no duel in the menu
  gateway.pushCache(script.later([writeFlyffEvent(SELF_ID, { 1: 1 })]));
  await openLeadMenu(page, gateway);
  await expect(menuEntry(page, 10)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  // the Duel Zone over both: "Duel - 1 vs 1", which sends DUELREQUEST (own idPlayer, Lead's)
  gateway.pushCache(script.later([writeAddRegion(MADRIGAL, [6900, 3250, 7050, 3400], [SELF_ID])]));
  await expect.poll(async () => {
    await openLeadMenu(page, gateway);
    return menuEntry(page, 10).count();
  }, ON_FRAMES).toBe(1);
  await expect(menuEntry(page, 10)).toHaveText('Duel - 1 vs 1');
  await page.screenshot({ path: test.info().outputPath('duel-menu.png') });
  await menuEntry(page, 10).click();
  await expect.poll(() => decoded(gateway, 0xffffff23), ON_FRAMES).toContainEqual({ type: 'duelRequestPacket', party: false, asker: WEBBY, asked: LEAD });
  // Lead asks: the question; Yes sends DUELYES (Lead's idPlayer, the own)
  gateway.pushCache(script.later([writeDuelRequest(SELF_ID, LEAD, WEBBY)]));
  const question = page.locator('.hud-duel-confirm');
  await expect(question).toContainText('Lead challenges you to a duel. Do you accept?');
  await page.screenshot({ path: test.info().outputPath('duel-question.png') });
  await question.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect.poll(() => decoded(gateway, 0xffffff24), ON_FRAMES).toContainEqual({ type: 'duelYes', party: false, asker: LEAD, own: WEBBY });
  // the start, the count, the fight
  gateway.pushCache(script.later([writeDuelStart(SELF_ID, LEAD, 0), writeDuelCount(SELF_ID, 3)]));
  await expect(page.locator('.hud-duel-count')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('duel-count.png') });
  gateway.pushCache(script.later([writeDuelStart(SELF_ID, LEAD, 1), writeDuelCount(SELF_ID, 0)]));
  await expect.poll(() => lines(page), ON_FRAMES).toContain('Duel with Lead started!');
  // won: the result window; its Yes plays the motion (PLAYERBEHAVIOR)
  gateway.pushCache(script.later([writeDuelStart(SELF_ID, LEAD, 3)]));
  const result = page.locator('.hud-duel-result');
  await expect(result).toContainText('Lead loses the Duel!');
  await page.screenshot({ path: test.info().outputPath('duel-result.png') });
  await result.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(result).toBeHidden();
});
