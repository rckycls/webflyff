// custom (owner 2026-11-20, redeem codes): the Redeem Code window against the pretend world server and a pretend code
// service (page.route): from the Start menu's Extras folder, whole on the screen above the task bar; Check shows the
// offer; Redeem sends the code, the playing character and confirm false, and shows the done lines; the code's mail
// (`Code reward #77`, from the game) then makes the game ask for its item (QUERYGETMAILITEM). A lost session asks for the
// password and goes on with the same code; a higher VIP's refusal gives both dates.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { NULL_ID, PostPacket, decodeWorldPacket } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeMailBox } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

const WOODEN_SWORD = 21;
const OFFER = { codeId: 3, label: 'Launch', vipLevel: 2, vipDays: 7, expiresAt: '2026-12-15T12:00:00Z', items: [{ itemId: WOODEN_SWORD, count: 1 }], bound: false };

function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;

async function press(target: Locator): Promise<void> {
  if (isPhone()) await target.tap();
  else await target.click();
}

async function openRedeem(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Extras', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Redeem Code' }).click();
  const win = page.locator('.hud-redeem');
  await expect(win).toBeVisible();
  await expect(win.locator('.hud-window-title')).toHaveText('Redeem Code');
  return win;
}

async function expectWhole(page: Page, win: Locator): Promise<void> {
  const box = (await win.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(0);
  const bar = await page.locator('.hud-taskbar-strip').boundingBox();
  if (bar !== null) expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 0.5);
}

/** The code box's words (set as the floating keyboard would type them). */
async function typeCode(win: Locator, code: string): Promise<void> {
  await win.getByLabel('Code', { exact: true }).evaluate((input, value) => { (input as HTMLInputElement).value = value; }, code);
}

test('Redeem Code: Extras opens it; Check, Redeem, and the code mail goes into the bag', async ({ page }, info) => {
  const redeemed: unknown[] = [];
  await page.route('**/api/account/session', (route) => route.fulfill({ json: { account: 'tester1', csrf: 'tok' } }));
  await page.route('**/api/codes/check', (route) => route.fulfill({ json: { ok: true, offer: OFFER, vip: null, replaces: false } }));
  await page.route('**/api/codes/redeem', (route) => {
    redeemed.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, useId: 77, offer: OFFER, vip: { level: 2, endsAt: '2026-11-27T12:00:00Z' }, repeat: false } });
  });
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const win = await openRedeem(page);
  await expectWhole(page, win);
  await page.screenshot({ path: info.outputPath('redeem-empty.png') });

  await typeCode(win, 'WELCOME2026');
  await press(win.locator('button[data-redeem="check"]'));
  await expect(win).toContainText('VIP2 for 7 days');
  await expect(win).toContainText('Wooden Sword ×1');
  await expect(win).toContainText('Needs 1 free bag slot');
  await page.screenshot({ path: info.outputPath('redeem-offer.png') });

  await press(win.locator('button[data-redeem="redeem"]'));
  await expect(win).toContainText('Done! Your items arrive in your bag within about a minute.');
  await expect(win).toContainText('You have VIP2 until 27 Nov 2026. Log out and in again to see it.');
  expect(redeemed).toEqual([{ code: 'WELCOME2026', character: SELF_PLAYER.playerId, requestId: expect.any(String), confirm: false }]);
  await page.screenshot({ path: info.outputPath('redeem-done.png') });

  // the code's mail arrives (as the Database server's real-time mail hands it over): the game asks for its item
  gateway.pushCache(script.later([writeMailBox(SELF_ID, SELF_PLAYER.playerId, [{
    id: 90, senderId: 0, item: { objectId: 0, itemId: WOODEN_SWORD, count: 1 }, gold: 0, age: 5, read: false,
    title: 'Code reward #77', text: 'From code "Launch". Collect within 15 days.',
  }])]));
  await expect.poll(() => sentOf(gateway, PostPacket.QUERYGETMAILITEM).length).toBe(1);
  const take = sentOf(gateway, PostPacket.QUERYGETMAILITEM)[0]!;
  expect(decodeWorldPacket(new Uint8Array(take.body))).toEqual({ type: 'queryGetMailItemRequest', mailId: 90 });
});

test('Redeem Code: a lost session asks for the password, then goes on; a higher VIP gives both dates', async ({ page }, info) => {
  let loggedIn = false;
  await page.route('**/api/account/session', (route) => (loggedIn
    ? route.fulfill({ json: { account: 'tester1', csrf: 'tok' } })
    : route.fulfill({ status: 401, json: { error: 'session' } })));
  await page.route('**/api/account/login', (route) => { loggedIn = true; return route.fulfill({ json: { account: 'tester1', csrf: 'tok' } }); });
  await page.route('**/api/codes/check', (route) => (loggedIn
    ? route.fulfill({ status: 409, json: { error: 'lower_vip', offer: { ...OFFER, vipLevel: 1 }, vip: { level: 4, endsAt: '2026-11-30T12:00:00Z' } } })
    : route.fulfill({ status: 401, json: { error: 'session' } })));
  await playGateway(page, scriptOf());
  await enterFlaris(page);
  const win = await openRedeem(page);
  await typeCode(win, 'VIPONE');
  await press(win.locator('button[data-redeem="check"]'));
  await expect(win).toContainText('Type your password to use codes.');
  await expect(win.getByLabel('Password')).toBeVisible();
  await win.getByLabel('Password').evaluate((input) => { (input as HTMLInputElement).value = 'password-one'; });
  await press(win.locator('button[data-redeem="ok"]'));
  await expect(win).toContainText('You have VIP4 until 30 Nov 2026. This code gives VIP1 and works until 15 Dec 2026. Use it after your VIP ends.');
  await expect(win.getByLabel('Password')).toBeHidden();
  await page.screenshot({ path: info.outputPath('redeem-lower-vip.png') });
});
