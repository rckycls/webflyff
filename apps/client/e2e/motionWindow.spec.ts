// 2026-11-14: the Motion window (docs/2026-11-14-motion-window-research.md), against the pretend servers, on the desktop
// (O, a click uses, a drag carries to the bar) and on the phone (the Start menu's Motion line, a tap uses, the Task bar
// button picks for the next slot tapped): a plain motion's PLAYERBEHAVIOR with OBJSTAF_ETC and its MTI, Sit's MOTION,
// an emoticon's "/laugh" chat line, and the motion on the bar as SHORTCUT_MOTION (ADDITEMTASKBAR).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PacketType, decodeWorldPacket } from '@flyffweb/protocol';
import { ON_FRAMES, enterFlaris, playGateway, sentOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
/** CHAT (`CDPClient::SendChat`, PACKETTYPE_CHAT 0xff0000): its text after the int count. */
const CHAT = 0xff0000;
const chats = (gateway: Gateway): string[] => sentOf(gateway, CHAT).map(({ body }) => body.subarray(12).toString('latin1'));
/** PLAYERBEHAVIOR's state flag and motion (after DPID, the type, two vectors, the angle and the state). */
const behaviors = (gateway: Gateway): Array<{ stateFlag: number; motion: number }> =>
  sentOf(gateway, PacketType.PLAYERBEHAVIOR).map(({ body }) => ({ stateFlag: body.readUInt32LE(40), motion: body.readUInt32LE(44) }));

async function openMotion(page: Page): Promise<void> {
  if (isPhone()) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Motion', exact: true }).click();
  } else {
    await page.keyboard.press('KeyO');
  }
  await expect(page.locator('.hud-motion')).toBeVisible();
}

const cell = (page: Page, name: string) => page.locator(`.hud-motion-cell[aria-label="${name}"]:visible`);

test('the Motion window: O or Start > Motion, a motion and an emoticon used, Sit sent, a motion put on the bar', async ({ page }) => {
  const gateway = await playGateway(page);
  await enterFlaris(page);
  await openMotion(page);
  const window = page.locator('.hud-motion');
  // V15's two tabs, Motion first: its 27 icons; the Emoticon tab's 29
  await expect(window.locator('.hud-tab-title')).toHaveText(['Motion', 'Emoticon']);
  await expect(window.locator('[data-page="motion"] .hud-motion-cell')).toHaveCount(27);
  await page.screenshot({ path: test.info().outputPath('motion-tab.png') });

  // Shake Hands: OBJMSG_MOTION, reported to the others (PLAYERBEHAVIOR with OBJSTAF_ETC 0x20 and MTI_HANDSHAKE 122)
  await cell(page, 'Shake Hands').click();
  await expect.poll(() => behaviors(gateway).some((b) => (b.stateFlag & 0x20) !== 0 && b.motion === 122), ON_FRAMES).toBe(true);

  // Sit Down: PACKETTYPE_MOTION with OBJMSG_SITDOWN (4)
  await cell(page, 'Sit Down').click();
  await expect.poll(() => sentOf(gateway, PacketType.MOTION).map(({ body }) => decodeWorldPacket(new Uint8Array(body))), ON_FRAMES)
    .toContainEqual({ type: 'motionRequest', message: 4 });

  // the Emoticon tab: /laugh goes as a chat line
  await window.getByRole('button', { name: 'Emoticon', exact: true }).click();
  await expect(window.locator('[data-page="emoticon"] .hud-motion-cell')).toHaveCount(29);
  await page.screenshot({ path: test.info().outputPath('emoticon-tab.png') });
  await cell(page, '/laugh').click();
  await expect.poll(() => chats(gateway), ON_FRAMES).toContain('/laugh');

  // a motion onto slot 4 of the bar: SHORTCUT_MOTION (3), its MOT_BASE_* (Shake Hands 4)
  await window.getByRole('button', { name: 'Motion', exact: true }).click();
  const target = page.locator('.hud-slot[data-row="item"][data-slot="4"]');
  if (isPhone()) {
    // a finger's tap chooses the icon (a mouse click only uses it), and the Task bar button picks the chosen one
    await cell(page, 'Shake Hands').tap();
    await window.getByRole('button', { name: 'Task bar', exact: true }).click();
    await target.click();
  } else {
    await cell(page, 'Shake Hands').dragTo(target);
  }
  await expect.poll(() => sentOf(gateway, PacketType.ADDITEMTASKBAR).map(({ body }) => decodeWorldPacket(new Uint8Array(body))), ON_FRAMES)
    .toContainEqual(expect.objectContaining({ type: 'addItemTaskBar', slot: 4, shortcut: expect.objectContaining({ kind: 3, id: 4 }) }));
  await expect(target).toHaveAttribute('data-kind', 'skill');
});
