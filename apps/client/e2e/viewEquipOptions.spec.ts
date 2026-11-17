// 2026-11-17 (view-equip-options): View Equipment and the Option window's game options (docs/2026-11-17-view-equip-options.md),
// against the pretend servers, on the desktop and on the phone: the player menu's View equipment, its QUERYEQUIP and the
// window the answer opens, with a part's tooltip; the refusal's line; the Option window's Game / Audio page, its radios
// kept or sent (QUERYEQUIPSETTING, MODE), and a trade request and a party invite refused by them.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType, QueryEquipPacket, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddPlayer, writeAddSelf, writeConfirmTrade, writeDefinedText, writePartyRequest,
  writeQueryEquip,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  BASE, FEMALE_VAGRANT, MADRIGAL, MI_FEMALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway,
  self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const LEAD_ID = 9300;
const LEAD_AT: Vec3 = [6967, groundAt(6967, 3323), 3323];
/** II_WEA_SWO_WOODEN on PARTS_RWEAPON, +7. */
const SWORD = 21;
const lead: AddedMover = {
  ...BASE, hitPoint: 80, index: MI_FEMALE, pos: LEAD_AT, angle: 180, objectId: LEAD_ID, isPlayer: true,
  player: {
    ...SELF_PLAYER, self: false, name: 'Lead', sex: 1, playerId: LEAD, level: 75, job: 16, equipmentObjectIds: [],
    worn: [...FEMALE_VAGRANT, { part: 10, itemId: SWORD, flag: 0, option: 7 }],
  },
};
/** TID_DIAG_0088, "Permission to view equipment denied." (Resource/defineText.h). */
const TID_DIAG_0088 = 2673;

function scriptOf(): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddPlayer(LEAD_ID, lead)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const decoded = (gateway: Gateway, type: number) => sentOf(gateway, type).map(({ body }) => decodeWorldPacket(new Uint8Array(body)));
const menuEntry = (page: Page, id: number) => page.locator(`.hud-mover-menu [data-menu-entry="${id}"]`);
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}-${isPhone() ? 'phone' : 'desktop'}.png`) });

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

async function openOption(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Option', exact: true }).click();
  await expect(page.locator('.hud-option')).toBeVisible();
}

test('View equipment: QUERYEQUIP for the player, the View window with its parts and tooltips; a refusal is a line', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openLeadMenu(page, gateway);
  await expect(menuEntry(page, 24)).toBeEnabled();
  await menuEntry(page, 24).click();
  await expect.poll(() => decoded(gateway, QueryEquipPacket.QUERYEQUIP), ON_FRAMES).toContainEqual({ type: 'queryEquipRequest', objectId: LEAD_ID });
  // the answer: the sword awakened and pierced, fire +4
  gateway.pushCache(script.later([writeQueryEquip(LEAD_ID, [
    { part: 10, piercing: [0], resist: 1, resistOption: 4 }, { part: 2 }, { part: 4 }, { part: 5 },
  ])]));
  const window = page.locator('.hud-query-equip');
  await expect(window).toBeVisible(ON_FRAMES);
  await expect(window.locator('.hud-window-title')).toHaveText('View');
  const sword = window.locator('.hud-query-equip-slot[data-part="10"]');
  await expect(sword).toBeEnabled();
  await expect(window.locator('.hud-query-equip-icon')).toHaveCount(4);
  // the model drawn into WIDC_CUSTOM20
  await expect(window.locator('.hud-query-equip-model canvas')).toBeAttached(ON_FRAMES);
  if (isPhone()) await sword.click();
  else await sword.hover();
  const tooltip = page.locator('.hud-query-equip-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Wooden Sword');
  await expect(tooltip).toContainText('+7');
  await shot(page, 'view-equipment');
  if (isPhone()) await tooltip.getByRole('button', { name: 'Close item details' }).click();
  await window.locator('.hud-window-close').click();
  await expect(window).toBeHidden();
  // a player who refuses: the world server's TID_DIAG_0088 in the chat, no window
  await openLeadMenu(page, gateway);
  await menuEntry(page, 24).click();
  await expect.poll(() => decoded(gateway, QueryEquipPacket.QUERYEQUIP).length, ON_FRAMES).toBe(2);
  gateway.pushCache(script.later([writeDefinedText(SELF_ID, TID_DIAG_0088)]));
  await expect(page.getByText('Permission to view equipment denied.').first()).toBeAttached(ON_FRAMES);
  await expect(window).toBeHidden();
});

test('the Option window\'s Game / Audio page: the radios kept or sent; trades and party invites refused by them', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openOption(page);
  const option = page.locator('.hud-option');
  for (const title of ['Trading', 'Whispers & Messages', 'Friend Invites', 'Duel Requests', 'Party Invites', 'Automatic Attack',
    'Allow Inventory View', 'Message Alarm', 'Window Effects', 'Battle Music']) await expect(option).toContainText(title);
  await expect(option.getByRole('tab', { name: 'Video' })).toBeDisabled();
  const radio = (name: string, value: 'on' | 'off') => option.locator(`.hud-radio[data-option="${name}"][data-value="${value}"]`);
  await expect(radio('equip', 'on')).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'option-window');
  await radio('trade', 'off').click();
  await radio('party', 'off').click();
  await radio('equip', 'off').click();
  await radio('duel', 'off').click();
  await option.locator('.hud-six-frame[data-option="translucent"]').click();
  await expect.poll(() => decoded(gateway, QueryEquipPacket.QUERYEQUIPSETTING), ON_FRAMES).toEqual([{ type: 'queryEquipSetting', allow: false }]);
  await expect.poll(() => decoded(gateway, QueryEquipPacket.MODE), ON_FRAMES).toEqual([{ type: 'changeMode', mode: 0x2000, flag: 2 }]);
  await expect(page.locator('.world-hud')).toHaveAttribute('data-translucent', '');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('flyffweb.gameOptions')))!)).toEqual({
    trade: false, party: false, autoAttack: true, translucent: true, battleMusic: false,
  });
  await shot(page, 'option-window-changed');
  // a trade request from Lead: BLOCK 3, no window
  gateway.pushCache(script.later([writeConfirmTrade(LEAD_ID)]));
  await expect.poll(() => sentOf(gateway, PacketType.BLOCK).length, ON_FRAMES).toBe(1);
  expect(new Uint8Array(sentOf(gateway, PacketType.BLOCK)[0]!.body.subarray(8))[0]).toBe(3);
  await expect(page.locator('.hud-trade-request')).toBeHidden();
  // a party invite: PARTYMEMBERCANCEL mode 3, no box
  gateway.pushCache(script.later([writePartyRequest(SELF_ID, { id: LEAD, level: 75, job: 16, sex: 1 }, { id: WEBBY, level: 15, job: 0, sex: 0 }, 'Lead')]));
  await expect.poll(() => decoded(gateway, PacketType.MEMBERREQUESTCANCLE), ON_FRAMES)
    .toEqual([{ type: 'partyMemberCancel', leaderId: LEAD, memberId: WEBBY, mode: 3 }]);
  await expect(page.locator('.hud-party-confirm')).toBeHidden();
  // the options are what the window shows the next time
  await option.locator('.hud-window-close').click();
  await openOption(page);
  await expect(radio('trade', 'off')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('party', 'off')).toHaveAttribute('aria-checked', 'true');
});
