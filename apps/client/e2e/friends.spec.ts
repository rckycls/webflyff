// 2026-11-10 (friends-say): the Messenger and /say against a scripted world server (docs/superpowers/specs/2026-11-10-
// friends-say-research.md): the list at log-in and its states, the window opened from Start, a friend's log-in notice,
// the list's menu, the Message window's /say both ways, a friend request, Add Friend, and /whisperrefuse.
// Webby is player 500 (the harness's character); Lead (70002) and Rocky (70003) are friends, never in view.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArReader, FriendPacket, PacketType } from '@flyffweb/protocol';
import type { PlayerDataRecord } from '@flyffweb/protocol';
import {
  createWorldScript, directFriendJoin, directFriendStates, directSay, directWhisper, writeAddSelf, writeFriendGameJoin,
  writeFriendRequest, writeQueryPlayerData,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SQUARE, enterFlaris, hudTexts, playGateway, recordHudTexts, self, sentOf } from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const ROCKY = 70003;
const CHAT = 0x00ff0000;
const knight = (level: number, login: number): PlayerDataRecord => ({ job: 6, level, sex: 0, version: 1, login });

const scriptOf = (): WorldScript => createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [] });

/** The u32 fields of a packet the page sent, after DPID_UNKNOWN and the type. */
const fieldsOf = (body: Buffer, count: number): number[] => Array.from({ length: count }, (_, i) => body.readUInt32LE(8 + 4 * i));
/** The text of the last CHAT the page sent. */
const lastChat = (gateway: Awaited<ReturnType<typeof playGateway>>): string => {
  const r = new ArReader(sentOf(gateway, CHAT).at(-1)!.body);
  r.bytes(8);
  return r.string(1024);
};

async function openMessenger(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Messenger', exact: true }).click();
  await expect(page.locator('.hud-messenger')).toBeVisible();
}

const rows = (page: Page) => page.locator('.hud-messenger .hud-messenger-row');

/** The list at log-in (ADDFRIENDGAMEJOIN), the states the page asks for, and the names of the player data. */
async function withFriends(page: Page) {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  gateway.pushCache(script.later([writeFriendGameJoin(SELF_ID, 0, [
    { playerId: LEAD, blocked: false, state: 1 }, { playerId: ROCKY, blocked: false, state: 1 },
  ])]));
  // OnFriendGameJoin: with friends, GETFRIENDSTATE with the own id
  await expect.poll(() => sentOf(gateway, FriendPacket.GETFRIENDSTATE).length).toBe(1);
  expect(fieldsOf(sentOf(gateway, FriendPacket.GETFRIENDSTATE)[0]!.body, 1)).toEqual([WEBBY]);
  gateway.pushCache(directFriendStates([{ playerId: LEAD, state: 0, channel: 1 }, { playerId: ROCKY, state: 1, channel: 0 }]));
  gateway.pushCache(script.later([
    writeQueryPlayerData(SELF_ID, LEAD, 'Lead', knight(60, 1)), writeQueryPlayerData(SELF_ID, ROCKY, 'Rocky', knight(45, 0)),
  ]));
  return { script, gateway };
}

test('the Messenger from Start: the list, its icons, a log-in notice and the menu', async ({ page }) => {
  const { gateway } = await withFriends(page);
  await openMessenger(page);
  // the Friend tab, sorted by state (online first); Lead online on channel 1, Rocky offline
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).locator('[data-column="name"]')).toHaveText(['Lead', 'Rocky']);
  await expect(rows(page).locator('[data-column="level"]')).toHaveText(['60', '45']);
  await expect(rows(page).nth(0).locator('[data-part="channel"]')).toHaveAttribute('data-frame', '34');
  await expect(rows(page).nth(0).locator('[data-part="state"]')).toHaveAttribute('data-frame', '7');
  await expect(rows(page).nth(1).locator('[data-part="state"]')).toHaveAttribute('data-frame', '13');
  await expect(rows(page).nth(0).locator('[data-part="job"]')).toHaveAttribute('data-frame', '19');
  await expect(page.locator('.hud-messenger [data-own="state"]')).toHaveText('(Online)');
  await expect(page.locator('.hud-messenger .hud-messenger-tab')).toHaveText(['Friend', 'Guild', 'Mentor-Pupil']);
  // the column head sorts: the name, Z first (prNameAsce)
  await page.locator('.hud-messenger [data-sort="name"]').click();
  await expect(rows(page).locator('[data-column="name"]')).toHaveText(['Rocky', 'Lead']);
  await page.locator('.hud-messenger [data-sort="state"]').click();
  await page.locator('.hud-messenger [data-sort="state"]').click();
  await expect(rows(page).locator('[data-column="name"]')).toHaveText(['Lead', 'Rocky']);
  // Rocky logs in: the instant message at the bottom right says so (TID_GAME_LOGIN)
  gateway.pushCache(directFriendJoin(ROCKY, 0, 2));
  await expect(page.locator('.hud-instant-message[data-player="Rocky"]')).toBeVisible();
  await expect(page.locator('.hud-instant-message[data-player="Rocky"] .hud-instant-text')).toContainText('Rockyhas logged into the game.');
  // the list's menu on Lead: Message, Block, Delete, Invite, House; Block sends FRIENDINTERCEPTSTATE
  await rows(page).nth(0).click({ button: 'right' });
  const menu = page.locator('.hud-friend-menu');
  await expect(menu).toBeVisible();
  expect(await menu.locator('[data-menu-entry]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.menuEntry))).toEqual(['0', '1', '2', '4', '8']);
  await menu.locator('[data-menu-entry="1"]').click();
  await expect.poll(() => sentOf(gateway, FriendPacket.FRIENDINTERCEPTSTATE).length).toBe(1);
  expect(fieldsOf(sentOf(gateway, FriendPacket.FRIENDINTERCEPTSTATE)[0]!.body, 2)).toEqual([WEBBY, LEAD]);
  // the state menu: AFK sends SETFRIENDSTATE 3
  await page.locator('.hud-messenger [data-button="state"]').click();
  await page.locator('.hud-friend-menu [data-menu-entry="3"]').click();
  await expect.poll(() => sentOf(gateway, FriendPacket.SETFRIENDSTATE).length).toBe(1);
  expect(fieldsOf(sentOf(gateway, FriendPacket.SETFRIENDSTATE)[0]!.body, 2)).toEqual([WEBBY, 3]);
  // 2026-11-10 (owner): it opens centred across and above the task bar; on the phone at the phones' 0.7, not the whole
  // screen
  const phone = test.info().project.name === 'phone';
  const box = (await page.locator('.hud-messenger').boundingBox())!;
  const layer = (await page.locator('.hud-messenger').evaluate((el) => {
    const r = el.parentElement!.getBoundingClientRect();
    return { x: r.x, width: r.width };
  }));
  expect(Math.abs(box.x + box.width / 2 - (layer.x + layer.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(box.width - 352 * (phone ? 0.7 : 1))).toBeLessThanOrEqual(1);
  const bar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  // the phone's text is 14 px at least
  if (phone) {
    expect(await rows(page).nth(0).locator('[data-column="name"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  }
});

test('the Message window: a double click opens it, Enter sends /say, and the lines come back', async ({ page }) => {
  const { gateway } = await withFriends(page);
  await openMessenger(page);
  await expect(rows(page)).toHaveCount(2);
  await rows(page).nth(0).dblclick();
  const message = page.locator('.hud-message[data-player="Lead"]');
  await expect(message).toBeVisible();
  await expect(message.locator('.hud-window-title')).toHaveText('Message - Lead');
  const edit = message.getByRole('textbox', { name: 'Message to Lead' });
  await edit.fill('hi there');
  await edit.press('Enter');
  await expect.poll(() => sentOf(gateway, CHAT).length).toBe(1);
  expect(lastChat(gateway)).toBe('/say "Lead" hi there');
  await expect(edit).toHaveValue('');
  // the core's SAY to the sender: the line in the window, the own name in red
  gateway.pushCache(directSay('Webby', 'Lead', 'hi there', WEBBY, LEAD));
  await expect(message.locator('.hud-message-text')).toContainText('Webby :');
  await expect(message.locator('.hud-message-from').first()).toHaveCSS('color', 'rgb(255, 0, 0)');
  gateway.pushCache(directSay('Lead', 'Webby', 'hello', LEAD, WEBBY));
  await expect(message.locator('.hud-message-from').last()).toHaveText('Lead :');
  await expect(message.locator('.hud-message-from').last()).toHaveCSS('color', 'rgb(0, 0, 255)');
  // a line from a name with no window: an instant message and the yellow chat line; a press opens its window
  gateway.pushCache(directSay('Rocky', 'Webby', 'yo', ROCKY, WEBBY));
  const instant = page.locator('.hud-instant-message[data-player="Rocky"]');
  await expect(instant).toBeVisible();
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('[Rocky] yo');
  await instant.locator('.hud-instant-text').click();
  await expect(page.locator('.hud-message[data-player="Rocky"] .hud-message-text')).toContainText('yo');
  await expect(instant).toHaveCount(0);
  // not connected: the core answers the sender with `search` 1
  gateway.pushCache(directSay('', '', '', WEBBY, ROCKY, 1));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('That player is not connected.');
});

test('a friend request: the Confirm, Yes sends ADDFRIEND; Add Friend sends the name', async ({ page }) => {
  const { script, gateway } = await withFriends(page);
  gateway.pushCache(script.later([writeFriendRequest(SELF_ID, 70009, 1, 8, 'Asker')]));
  const confirm = page.locator('.hud-friend-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('.hud-friend-confirm-text')).toHaveText('Asker wants to be your friend. Do you accept?');
  await confirm.locator('[data-button="yes"]').click();
  await expect.poll(() => sentOf(gateway, FriendPacket.ADDFRIEND).length).toBe(1);
  const body = sentOf(gateway, FriendPacket.ADDFRIEND)[0]!.body;
  expect([body.readUInt32LE(8), body.readUInt32LE(12), body.readUInt8(16), body.readUInt8(17), body.readInt32LE(18)]).toEqual([70009, WEBBY, 1, 0, 8]);
  await expect(confirm).toBeHidden();
  await openMessenger(page);
  await page.locator('.hud-messenger [data-button="add"]').click();
  const add = page.locator('.hud-add-friend');
  await expect(add).toBeVisible();
  await add.getByRole('textbox', { name: 'Name :' }).fill('Newbie');
  await add.locator('[data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, FriendPacket.ADDFRIENDNAMEREQEST).length).toBe(1);
  const r = new ArReader(sentOf(gateway, FriendPacket.ADDFRIENDNAMEREQEST)[0]!.body);
  r.bytes(8);
  expect([r.u32(), r.string(64)]).toEqual([WEBBY, 'Newbie']);
  await expect(add).toBeHidden();
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('You have asked for permission to add Newbie to your messenger.');
});

test('/say from the chat goes as typed; /whisperrefuse answers a whisper with BLOCK 1', async ({ page, isMobile }) => {
  const { gateway } = await withFriends(page);
  if (isMobile) await page.getByRole('button', { name: 'Chat', exact: true }).tap(); else await page.keyboard.press('Enter');
  const chat = page.locator(isMobile ? '.hud-chat' : '.hud-neuz-chat');
  const input = chat.getByRole('textbox', { name: 'Chat message' });
  const send = async (text: string): Promise<void> => {
    await input.fill(text);
    if (isMobile) await chat.getByRole('button', { name: 'Send', exact: true }).click(); else await input.press('Enter');
  };
  await send('/say Lead hello');
  await expect.poll(() => sentOf(gateway, CHAT).length).toBe(1);
  expect(lastChat(gateway)).toBe('/say Lead hello');
  // the server's answer opens the Message window for Lead
  gateway.pushCache(directSay('Webby', 'Lead', 'hello', WEBBY, LEAD));
  await expect(page.locator('.hud-message[data-player="Lead"] .hud-message-text')).toContainText('hello');
  await page.locator('.hud-message[data-player="Lead"] > .hud-window-close').click();
  if (isMobile) await page.getByRole('button', { name: 'Chat', exact: true }).tap(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await send('/wr');
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('Whisper refused.');
  gateway.pushCache(directWhisper('Rocky', 'Webby', 'psst', ROCKY, WEBBY));
  await expect.poll(() => sentOf(gateway, PacketType.BLOCK).length).toBe(1);
  const r = new ArReader(sentOf(gateway, PacketType.BLOCK)[0]!.body);
  r.bytes(8);
  expect([r.u8(), r.string(64), r.string(64)]).toEqual([1, 'Webby', 'Rocky']);
});
