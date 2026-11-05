// The owner's seven bugs of 2026-11-05 against the pretend world server (docs/superpowers/specs/2026-11-05-ui-fixes-research.md):
// the item windows as Neuz's own windows, the Upgrade Specialist's Safe Upgrade and its 2 s run, the status window's k
// numbers, and the chat's command list. Each step leaves a picture in the test's output folder.

import { expect, test } from '@playwright/test';
import { ArWriter, NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(180_000);

const NAME_CHANGE = 10424;
const ELEMENT_CHANGE = 20037;
const WOODEN_SWORD = 21;
const RESTAT = 10211;
const SUNSTONE = 2035;
const SPROTECT = 10464;

function scriptFor() {
  const own = newVagrantOwn();
  own.inventory = [
    { objectId: 3, itemId: NAME_CHANGE, count: 1 }, { objectId: 4, itemId: ELEMENT_CHANGE, count: 1 },
    { objectId: 5, itemId: WOODEN_SWORD, count: 1, resist: 1, resistOption: 2 }, { objectId: 6, itemId: RESTAT, count: 1 },
    { objectId: 7, itemId: SUNSTONE, count: 5 }, { objectId: 8, itemId: SPROTECT, count: 3 },
  ];
  const bobochan = { ...julia, npc: { ...julia.npc!, characterKey: 'MaFl_Bobochan' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, bobochan)],
  });
}

test('the item windows are Neuz\'s windows; the Upgrade Specialist\'s Safe Upgrade runs; "/" lists the commands', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'the bag\'s double-click is the desktop\'s; a phone uses the same windows through Use');
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const bag = page.locator('.hud-inventory');
  const cell = (slot: number) => bag.locator(`[data-bag-slot="${slot}"]`);
  const window = (title: string) => page.locator('.hud-res-window:visible').filter({ has: page.locator('.hud-window-title', { hasText: title }) });
  await page.keyboard.press('i');
  await expect(bag).toBeVisible();

  // APP_CHANGENAME
  await cell(3).dblclick();
  await expect(window('Change Name')).toBeVisible();
  await expect(window('Change Name')).toContainText('Please input the new name to change into.');
  await shot('change-name');
  await window('Change Name').getByRole('button', { name: 'Cancel' }).click();
  await expect(window('Change Name')).toHaveCount(0);

  // APP_CHANGE_ATTRIBUTE: the scroll held, the sword placed by a click, wind chosen, OK sends (sword, scroll, 4)
  await cell(4).dblclick();
  const attribute = window('Scroll of Attribute Change');
  await expect(attribute).toBeVisible();
  await cell(5).click();
  await expect(attribute.locator('.hud-res-slot img')).toBeVisible();
  await expect(cell(4)).toHaveClass(/is-in-use/);
  await attribute.locator('[data-control="WIDC_CUSTOM4"]').click();
  await shot('change-attribute');
  await attribute.getByRole('button', { name: 'OK' }).click();
  await expect.poll(() => sentOf(gateway, 0xf000d00e).map((s) => [s.body.readUInt32LE(8), s.body.readUInt32LE(12), s.body.readInt32LE(16)]))
    .toEqual([[5, 4, 4]]);

  // APP_RESTATE_CONFIRM
  await cell(6).dblclick();
  await expect(window('Confirm Re-Stat')).toBeVisible();
  await shot('restate-confirm');
  await window('Confirm Re-Stat').getByRole('button', { name: 'No' }).click();

  // the Upgrade Specialist's Safe Upgrade: the sword, two Sunstones, an SProtect; START sends a row 2 s on
  await tapMover(page, NPC_ID);
  const entry = page.locator('.hud-mover-menu [data-menu-entry="134"]');
  await expect(entry).toBeEnabled(ON_FRAMES);
  await entry.click();
  const safety = page.locator('.hud-smelt-safety');
  await expect(safety).toBeVisible();
  for (const slot of [5, 7, 7, 8]) await cell(slot).dblclick();
  await expect(cell(7).locator('span')).toHaveText('3'); // the die flag: the stack counted down
  await shot('safe-upgrade');
  await safety.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sentOf(gateway, 0x70007000).length, { timeout: 10_000 }).toBe(1);
  const sent = sentOf(gateway, 0x70007000)[0]!.body;
  expect([8, 12, 16, 20].map((at) => sent.readUInt32LE(at))).toEqual([5, 7, 8, NULL_ID]);
  gateway.pushCache(script.later([{ objectId: SELF_ID, type: 0x9900, fields: new ArWriter().u8(1).toBytes() }]));
  await expect(safety.locator('[data-control="RESULT0"]')).toHaveAttribute('data-result', 'success');
  await page.waitForTimeout(500); // the result's picture is asked for as the answer comes
  await shot('safe-upgrade-success');
  await safety.locator('.hud-window-close').click();

  // the chat's "/" list
  await page.locator('[name="message"]').click();
  await page.keyboard.type('/');
  await expect(page.locator('.chat-suggestions')).toBeVisible();
  await expect(page.locator('.chat-suggestion[data-command="shout"]')).toBeVisible();
  await shot('chat-commands');
});
