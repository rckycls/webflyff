// 2026-11-10 (bank-mail): the post (docs/superpowers/specs/2026-11-10-bank-mail-research.md §2), played against a scripted world
// server on the desktop and on the phone: the new-mail notice, the Post Box, the request box until the box comes, the inbox,
// reading a mail (READMAIL), taking its penya and its item, Reply, a mail sent with an item and penya after its confirm box.
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PostPacket, decodeWorldPacket } from '@flyffweb/protocol';
import type { Mail } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeMailBox, writeModifyMode, writeQueryPlayerData, writeRemoveMail,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const RUBY = 2032;
const WOODEN_SWORD = 21;
const ALICE = 700;
/** MODE_MAILBOX (`_Common/authorization.h:121`). */
const MAILBOX = 0x8000;

/** Webby with a Wooden Sword (object 6) and 5,000 penya; the Post Box beside the square. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.gold = 5000;
  own.inventory = [{ objectId: 6, itemId: WOODEN_SWORD, count: 1 }];
  const postbox = { ...julia, npc: { ...julia.npc!, characterKey: 'MaFl_Postbox' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, postbox)],
  });
}

const MAILS: Mail[] = [
  { id: 41, senderId: ALICE, item: { objectId: 0, itemId: RUBY, count: 3 }, gold: 1500, age: 3600, read: false, title: 'Rubies for you', text: 'Two lines,\nfrom Alice.' },
  { id: 42, senderId: 0, gold: 0, age: 9 * 86400, read: true, title: 'Event', text: '' },
];

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const lastOf = (gateway: Gateway, type: number) => {
  const all = sentOf(gateway, type);
  return decodeWorldPacket(new Uint8Array(all[all.length - 1]!.body));
};

/** The Post Box: its one entry runs at once (a second tap on the phone, the first selecting it). */
async function openPost(page: Page, gateway: Gateway): Promise<void> {
  await tapMover(page, NPC_ID);
  const post = page.locator('.hud-post');
  if (isPhone() && !(await post.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await post.isVisible())) await tapMover(page, NPC_ID);
  }
  await expect(post).toBeVisible(ON_FRAMES);
}

test('the post: the notice, the inbox, reading and taking, a reply sent with an item and penya', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // the new-mail notice follows MODE_MAILBOX
  const notice = page.locator('.hud-mail-notice');
  await expect(notice).toBeHidden();
  gateway.pushCache(script.later([writeModifyMode(SELF_ID, MAILBOX), writeQueryPlayerData(SELF_ID, ALICE, 'Alice', { job: 1, level: 30, sex: 1, version: 1, login: 1 })]));
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('aria-label', 'New mail has arrived');
  await shot('post-notice');

  // the Post Box: the bag and the post, disabled, on Inbox, asking for the box with the request box up
  await openPost(page, gateway);
  const post = page.locator('.hud-post');
  await expect(post.locator('.hud-window-title')).toHaveText('POST');
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYMAILBOX).length).toBe(1);
  const request = page.locator('.hud-post-request');
  await expect(request).toBeVisible();
  await expect(request).toContainText('Requesting the post...');
  await expect(page.locator('.hud-inventory')).toBeVisible();
  gateway.pushCache(script.later([writeMailBox(SELF_ID, SELF_PLAYER.playerId, MAILS)]));
  await expect(request).toBeHidden();
  const rows = post.locator('.hud-post-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.hud-post-row-sender')).toHaveText('Alice');
  await expect(rows.nth(0).locator('.hud-post-row-time')).toHaveText('15day');
  await expect(rows.nth(0).locator('.hud-post-row-title')).toHaveText('Rubies for yo...');
  await expect(rows.nth(1).locator('.hud-post-row-sender')).toHaveText('FLYFF');
  await expect(rows.nth(1).locator('.hud-post-row-read')).toHaveCount(1);
  await shot('post-inbox');

  // reading: READMAIL; the penya taken (right click / tap), then the item
  if (isPhone()) await rows.nth(0).tap();
  else await rows.nth(0).dblclick();
  const read = page.locator('.hud-post-read');
  await expect(read).toBeVisible();
  await expect.poll(() => sentOf(gateway, PostPacket.READMAIL).length).toBe(1);
  expect(lastOf(gateway, PostPacket.READMAIL)).toEqual({ type: 'readMailRequest', mailId: 41 });
  await expect(read.locator('[data-control="WIDC_EDIT1"]')).toHaveText('Alice');
  await expect(read.locator('[data-control="WIDC_TEXT1"]')).toContainText('from Alice.');
  await expect(read.locator('[data-control="WIDC_EDIT3"]')).toHaveText('1,500');
  await shot('post-read');
  const coin = read.locator('[data-control="WIDC_STATIC4"]');
  if (isPhone()) await coin.tap();
  else await coin.click({ button: 'right' });
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYGETMAILGOLD).length).toBe(1);
  await expect(read.locator('[data-control="WIDC_EDIT3"]')).toHaveText('0');
  gateway.pushCache(script.later([writeRemoveMail(SELF_ID, 41, 2)]));
  const slot = read.locator('[data-control="WIDC_STATIC3"]');
  if (isPhone()) await slot.tap();
  else await slot.click({ button: 'right' });
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYGETMAILITEM).length).toBe(1);
  expect(lastOf(gateway, PostPacket.QUERYGETMAILITEM)).toEqual({ type: 'queryGetMailItemRequest', mailId: 41 });
  gateway.pushCache(script.later([writeRemoveMail(SELF_ID, 41, 1), writeRemoveMail(SELF_ID, 41, 3), writeModifyMode(SELF_ID, 0)]));
  await expect(slot.locator('img')).toHaveCount(0);
  await expect(notice).toBeHidden();

  if (isPhone()) {
    // the phone: the read window's words at least 14 px
    for (const target of [read.locator('[data-control="WIDC_EDIT1"]'), read.locator('[data-control="WIDC_TEXT1"]'), read.locator('[data-control="WIDC_BUTTON2"]')]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
  }

  // Reply: the Send page, the receiver Alice, the title "Re:" and the shown title
  await read.locator('[data-control="WIDC_BUTTON2"]').click();
  await expect(read).toBeHidden();
  await expect(post).toHaveAttribute('data-tab', 'send');
  await expect(post.locator('[data-control="WIDC_COMBOBOX1"] input')).toHaveValue('Alice');
  await expect(post.locator('[data-control="WIDC_EDIT2"] input')).toHaveValue('Re:Rubies for yo...');

  // the Wooden Sword attached (its name the title), 100 penya, a line of text; Send asks first
  if (isPhone()) await bagCell(page, 6).tap();
  else await bagCell(page, 6).dragTo(post.locator('[data-control="WIDC_STATIC3"]'));
  await expect(post.locator('[data-control="WIDC_STATIC3"] img')).toHaveCount(1);
  await expect(post.locator('[data-control="WIDC_EDIT2"] input')).toHaveValue('Wooden Sword');
  await post.locator('.hud-post-text').fill('Thanks!');
  if (isPhone()) {
    await post.locator('[data-control="WIDC_EDIT4"] input').tap();
    const sheet = page.locator('.hud-amount-box:visible');
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-pad-key="escape"]').click();
    for (const key of '100') await sheet.locator(`[data-pad-key="${key}"]`).click();
    await sheet.locator('[data-button="ok"]').click();
    await expect(post.locator('[data-control="WIDC_EDIT4"] input')).toHaveValue('100');
  } else {
    await post.locator('[data-control="WIDC_EDIT4"] input').fill('100');
  }
  await shot('post-send');
  await post.locator('[data-control="WIDC_SEND"]').click();
  const confirm = page.locator('.hud-message:visible .hud-message-text');
  await expect(confirm).toContainText('Would you like to send mail?');
  await expect(confirm).toContainText('Received mail will be deleted after 15 days.');
  await page.locator('.hud-message:visible [data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYPOSTMAIL).length).toBe(1);
  expect(lastOf(gateway, PostPacket.QUERYPOSTMAIL)).toEqual({
    type: 'queryPostMailRequest', itemObjectId: 6, count: 1, receiver: 'Alice', gold: 100, title: 'Wooden Sword', text: 'Thanks!',
  });
  // only the attachment goes
  await expect(post.locator('[data-control="WIDC_STATIC3"] img')).toHaveCount(0);
  await expect(post.locator('[data-control="WIDC_COMBOBOX1"] input')).toHaveValue('Alice');

  if (isPhone()) {
    for (const target of [post.locator('.hud-tab-title').first(), post.locator('[data-control="WIDC_STATIC1"] .hud-res-static-text'),
      post.locator('[data-control="WIDC_SEND"]'), post.locator('.hud-post-text')]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
  }

  // back to Inbox: the box is asked for again
  await post.locator('.hud-tab-title[data-tab="1"]').click();
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYMAILBOX).length).toBe(2);
  await post.locator('.hud-window-close').click();
  await expect(post).toBeHidden();
});
