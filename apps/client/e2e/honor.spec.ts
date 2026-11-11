// 2026-11-11: the honour window (the Character window's Fame/Master page, CWndHonor, _Interface/WndField.cpp:4061-4196),
// played against a scripted world server on the desktop (clicks) and the phone (taps). Webby comes in with two titles
// earned (the own ADD_OBJ's counts, ObjSerializeOpt.cpp:612-634): Stamina Master and Lord. The page lists them after
// "No Title"; Lord and OK send HONOR_CHANGE_REQ 36 (SendReqHonorTitleChange, Neuz/DPClient.cpp:17235-17240); the
// server's HONOR_CHANGE_ACK (CDPSrvr::OnHonorChangeReq, WORLDSERVER/DPSrvr.cpp:8312-8335) puts "[Lord]" over Webby's head.
// A later HONOR_LIST_ACK with Master Knight says so and adds it to the open list (OnHonorListAck, DPClient.cpp:17242-17278).
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { HonorPacket } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import { createWorldScript, honorCounts, newVagrantOwn, writeAddPlayer, writeAddSelf, writeHonorChange, writeHonorList } from '@flyffweb/testkit';
import {
  BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self, sentOf,
} from './worldHarness';

test.setTimeout(150_000);

/** honorList.txt's ids (Resource/honorList.txt): 7 HS_STA "Stamina Master" (253), 20 JOB_KNIGHT_MASTER (1), 36 HS_LORD (1). */
const STAMINA = 7, KNIGHT = 20, LORD = 36;
const GUIDE = 9302;

const webby: AddedMover = {
  ...self, player: { ...SELF_PLAYER, own: { ...newVagrantOwn(), honorCounts: honorCounts({ [STAMINA]: 300, [LORD]: 1 }) } },
};
const guide: AddedMover = {
  ...BASE, index: MI_MALE, pos: [SQUARE[0] + 2, groundAt(SQUARE[0] + 2, SQUARE[2] - 2), SQUARE[2] - 2], angle: 180,
  objectId: GUIDE, isPlayer: true, player: {
    ...SELF_PLAYER, self: false, name: 'Guide', playerId: 1302, equipmentObjectIds: [],
    worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
  },
};

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const press = async (target: Locator): Promise<void> => { if (isPhone()) await target.tap(); else await target.click(); };
const tagOf = async (page: Page, objectId: number) =>
  (await page.evaluate(() => window.__client!.tags())).find((t) => t.objectId === objectId)?.text;

/**
 * The phone's rules, as drawn on the screen (the window is scaled to fit: its words' size times that scale): words 14 px or
 * more, rows and buttons 40 px tall, the window inside the screen.
 */
async function phoneChecks(page: Page, window: Locator): Promise<void> {
  if (!isPhone()) return;
  const scale = await window.evaluate((e) => e.getBoundingClientRect().width / (e as HTMLElement).offsetWidth);
  for (const words of await window.locator('.hud-honor-rows [role="option"], .hud-char-tab-title, .hud-honor-empty').all()) {
    if (!await words.isVisible()) continue;
    expect(await words.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)) * scale).toBeGreaterThanOrEqual(14);
  }
  for (const target of await window.locator('.hud-honor-rows [role="option"], .hud-char-tab-title, [data-button="honor-ok"]').all()) {
    if (await target.isVisible()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(39.5);
  }
  const view = page.viewportSize()!, at = (await window.boundingBox())!;
  expect(at.x >= 0 && at.y >= 0 && at.x + at.width <= view.width + 0.5 && at.y + at.height <= view.height + 0.5).toBe(true);
}

test('the honour window: the earned titles, the pick sent, and the title over the name', async ({ page }, info) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    others: [writeAddPlayer(GUIDE, guide)],
  });
  // the world server's answer to the pick, to every player in view (CUserMng::AddHonorTitleChange, User.cpp:7906-7918)
  script.on('honorChangeRequest', (p) => (p.type === 'honorChangeRequest' ? [writeHonorChange(SELF_ID, p.honor)] : []));
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = async (name: string) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  };
  await expect.poll(() => tagOf(page, SELF_ID), ON_FRAMES).toBe('Webby');

  // the Character window from the Start menu, then its Fame/Master tab
  await press(page.getByRole('button', { name: 'Start' }));
  await press(page.getByRole('menuitem', { name: 'Character' }));
  const character = page.locator('.hud-character');
  await expect(character).toBeVisible();
  await press(character.getByRole('button', { name: 'Fame/Master' }));
  await expect(character.locator('.hud-honor-page')).toBeVisible();
  await expect(character.locator('.hud-char-page[data-page="0"]')).toBeHidden();
  const rows = character.locator('.hud-honor-rows [role="option"]');
  await expect(rows).toHaveText(['No Title', 'Stamina Master', 'Lord']);
  const ok = character.locator('[data-button="honor-ok"]');
  await expect(ok).toBeDisabled();
  await phoneChecks(page, character);
  await shot('list');

  // Lord, then OK: HONOR_CHANGE_REQ 36, and the answer puts the title over Webby's head
  await press(rows.nth(2));
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
  if (!isPhone()) await expect(rows.nth(2)).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(ok).toBeEnabled();
  await press(ok);
  await expect(ok).toBeDisabled();
  await expect.poll(() => sentOf(gateway, HonorPacket.HONOR_CHANGE_REQ).map((s) => s.body.readInt32LE(8))).toEqual([LORD]);
  await expect.poll(() => tagOf(page, SELF_ID), ON_FRAMES).toBe('[Lord] Webby');
  await shot('lord');

  // another player in view takes a title too; then a new title earned, said and added to the open list
  gateway.pushCache(script.later([writeHonorChange(GUIDE, STAMINA)]));
  await expect.poll(() => tagOf(page, GUIDE), ON_FRAMES).toBe('[Stamina Master] Guide');
  gateway.pushCache(script.later([writeHonorList(SELF_ID, honorCounts({ [STAMINA]: 300, [LORD]: 1, [KNIGHT]: 1 }))]));
  await expect(page.locator('.hud-messages')).toContainText('You have earned the title: Master Knight!');
  await expect(rows).toHaveText(['No Title', 'Stamina Master', 'Lord', 'Master Knight']);
  await expect(ok).toBeDisabled();

  // No Title takes it off again (-1)
  await press(rows.nth(0));
  await press(ok);
  await expect.poll(() => sentOf(gateway, HonorPacket.HONOR_CHANGE_REQ).map((s) => s.body.readInt32LE(8))).toEqual([LORD, -1]);
  await expect.poll(() => tagOf(page, SELF_ID), ON_FRAMES).toBe('Webby');
  await phoneChecks(page, character);
  await shot('none');

  // the first tab shows the Character page again
  await press(character.locator('.hud-char-tab-title[data-tab="0"]'));
  await expect(character.locator('.hud-char-page[data-page="0"]')).toBeVisible();
  await expect(character.locator('.hud-honor-page')).toBeHidden();
});
