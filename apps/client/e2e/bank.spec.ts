// 2026-11-10 (bank-mail): the bank (docs/superpowers/specs/2026-11-10-bank-mail-research.md §1), played against a scripted world
// server on the desktop (drags) and on the phone (taps and the number pad): Julia's Deposit, the first PIN set and then entered,
// a stack put in with its count, an item taken out, penya put in, the other banks covered, CLOSEBANKWND on the close box.
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BankPacket, NULL_ID, decodeWorldPacket } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeBankWindow, writeChangeBankPass, writeConfirmBankPass,
  writeGetItemBank, writePutGoldBank, writePutItemBank, writeUpdateBankItem, writeUpdateItem,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const RUBY = 2032;
const DIAMOND = 2029;
const WOODEN_SWORD = 21;

/** Webby (slot 0) with 5 Rubies (object 5) and a Wooden Sword (6) in the bag, 5,000 penya; a Diamond and 1,000 in bank 0. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.gold = 5000;
  own.inventory = [{ objectId: 5, itemId: RUBY, count: 5 }, { objectId: 6, itemId: WOODEN_SWORD, count: 1 }];
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }, {
      banks: [[{ objectId: 0, itemId: DIAMOND, count: 1 }], [], []],
      bank: { slot: 0, gold: [1000, 0, 0], players: [SELF_PLAYER.playerId, 0, 0] },
    }),
    others: [writeAddNpc(NPC_ID, julia)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
const lastOf = (gateway: Gateway, type: number) => {
  const all = sentOf(gateway, type);
  return decodeWorldPacket(new Uint8Array(all[all.length - 1]!.body));
};

/** Julia's Deposit: a click on the desktop; on the phone a tap to select and a second to open the menu. */
async function deposit(page: Page, gateway: Gateway): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, NPC_ID);
  }
  const item = page.locator('.hud-mover-menu [data-menu-entry="9"]');
  await expect(item).toBeEnabled(ON_FRAMES);
  await item.click();
}

/** The count box: the desktop's field typed, or the phone's number pad tapped; then OK. */
async function amount(page: Page, value: string): Promise<void> {
  if (isPhone()) {
    const sheet = page.locator('.hud-amount-box:visible');
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-pad-key="escape"]').click();
    for (const key of value) await sheet.locator(`[data-pad-key="${key}"]`).click();
    await sheet.locator('[data-button="ok"]').click();
  } else {
    const gold = page.locator('.hud-trade-gold:visible');
    await expect(gold).toBeVisible();
    await gold.locator('input').fill(value);
    await gold.locator('[data-control="WIDC_OK"]').click();
  }
}

test('the bank: the first PIN, then the PIN; a stack in with its count, an item out, penya in', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // Deposit: OPENBANKWND; the PIN is still 0000, so the set-PIN window with Old PIN filled
  await deposit(page, gateway);
  await expect.poll(() => sentOf(gateway, BankPacket.OPENBANKWND).length).toBe(1);
  expect(lastOf(gateway, BankPacket.OPENBANKWND)).toEqual({ type: 'openBankWndRequest', scrollId: NULL_ID, scrollItem: 0 });
  gateway.pushCache(script.later([writeBankWindow(SELF_ID, 0)]));
  const password = page.locator('.hud-bank-password');
  await expect(password).toBeVisible();
  await expect(password.locator('.hud-window-title')).toHaveText('Bank PIN:');
  const pins = password.locator('input');
  await expect(pins.nth(0)).toHaveValue('0000');
  await expect(pins.nth(0)).toHaveAttribute('type', 'password');
  await pins.nth(1).fill('1234');
  await pins.nth(2).fill('4321');
  await password.locator('[data-control="WIDC_OK"]').click();
  await expect(box(page)).toHaveText('Your new password is different from the password you confirmed. Please try again.');
  await page.locator('.hud-message:visible [data-button="ok"]').click();
  await pins.nth(1).fill('1234');
  await pins.nth(2).fill('1234');
  await shot('bank-set-pin');
  await password.locator('[data-control="WIDC_OK"]').click();
  await expect.poll(() => sentOf(gateway, BankPacket.CHANGEBANKPASS).length).toBe(1);
  expect(lastOf(gateway, BankPacket.CHANGEBANKPASS)).toMatchObject({ oldPin: '0000', newPin: '1234' });

  // taken: the enter-PIN window; the right PIN opens the bag and the bank
  gateway.pushCache(script.later([writeChangeBankPass(SELF_ID, 1)]));
  const confirm = page.locator('.hud-bank-pin:not(.hud-bank-password)');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('.hud-window-title')).toHaveText('Bank Password');
  await confirm.locator('input').fill('1234');
  await confirm.locator('[data-control="WIDC_OK"]').click();
  await expect.poll(() => sentOf(gateway, BankPacket.CONFIRMBANK).length).toBe(1);
  expect(lastOf(gateway, BankPacket.CONFIRMBANK)).toMatchObject({ pin: '1234' });
  gateway.pushCache(script.later([writeConfirmBankPass(SELF_ID, 1)]));
  const bank = page.locator('.hud-bank');
  await expect(bank).toBeVisible();
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await expect(bank.locator('.hud-window-title')).toHaveText('Bank');
  const grid0 = bank.locator('.hud-bank-grid[data-bank="0"]');
  await expect(grid0.locator('[data-object-id]')).toHaveCount(1);
  await expect(bank.locator('[data-bank-gold="0"]')).toContainText('1000');
  // banks 1 and 2: no character in their slots, no Common Bank: covered
  await expect(bank.locator('.hud-bank-tab[data-bank="1"]')).toHaveAttribute('data-usable', 'false');
  await shot('bank-open');

  // a stack of 5 Rubies: the count box, 2 of them
  if (isPhone()) await bagCell(page, 5).tap();
  else await bagCell(page, 5).dragTo(grid0);
  await amount(page, '2');
  await expect.poll(() => sentOf(gateway, BankPacket.PUTITEMBANK).length).toBe(1);
  expect(lastOf(gateway, BankPacket.PUTITEMBANK)).toEqual({ type: 'putItemBankRequest', bank: 0, objectId: 5, count: 2 });
  gateway.pushCache(script.later([writePutItemBank(SELF_ID, 0, { objectId: 5, itemId: RUBY, count: 2 }), writeUpdateItem(SELF_ID, 5, 0, 3)]));
  await expect(grid0.locator('[data-object-id]')).toHaveCount(2);
  await expect(grid0.locator(`[data-item-id="${RUBY}"] span`)).toHaveText('2');
  await shot('bank-stack-in');

  // the Diamond out: one, at once
  const diamond = grid0.locator(`[data-item-id="${DIAMOND}"]`);
  if (isPhone()) await diamond.tap();
  else await diamond.dragTo(page.locator('.hud-inventory [data-bag-slot="10"]'));
  await expect.poll(() => sentOf(gateway, BankPacket.GETITEMBANK).length).toBe(1);
  expect(lastOf(gateway, BankPacket.GETITEMBANK)).toEqual({ type: 'getItemBankRequest', bank: 0, objectId: 0, count: 1 });
  gateway.pushCache(script.later([writeGetItemBank(SELF_ID, { objectId: 0, itemId: DIAMOND, count: 1 }), writeUpdateBankItem(SELF_ID, 0, 0, 0)]));
  await expect(grid0.locator('[data-object-id]')).toHaveCount(1);
  await expect(page.locator(`.hud-inventory [aria-label^="Diamond"]`)).toHaveCount(1);

  // 500 penya in: the sack dragged (tapped), the count box
  if (isPhone()) await page.locator('.hud-inventory .inventory-money').tap();
  else await page.locator('.hud-inventory .inventory-money').dragTo(grid0);
  await amount(page, '500');
  await expect.poll(() => sentOf(gateway, BankPacket.PUTGOLDBANK).length).toBe(1);
  expect(lastOf(gateway, BankPacket.PUTGOLDBANK)).toEqual({ type: 'putGoldBankRequest', bank: 0, gold: 500 });
  gateway.pushCache(script.later([writePutGoldBank(SELF_ID, 0, 4500, 1500)]));
  await expect(bank.locator('[data-bank-gold="0"]')).toContainText('1500');
  await shot('bank-penya-in');

  if (isPhone()) {
    // the phone: the bank panel's words at least 14 px, its cells big enough for a finger
    for (const target of [bank.locator('.hud-bank-phone-tabs button').first(), bank.locator('[data-bank-gold="0"] .hud-res-static-text'),
      bank.locator('.hud-window-title'), grid0.locator('[data-item-id] span').first()]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect((await grid0.locator('.hud-bank-cell').first().boundingBox())!.width).toBeGreaterThanOrEqual(40);
    // another bank's tab shows it covered
    await bank.locator('[data-bank-tab="1"]').tap();
    await expect(bank.locator('.hud-bank-tab[data-bank="1"]')).toBeVisible();
    await shot('bank-phone-not-use');
  }

  // closed by its close box: CLOSEBANKWND
  await bank.locator('.hud-window-close').click();
  await expect(bank).toBeHidden();
  await expect.poll(() => sentOf(gateway, BankPacket.CLOSEBANKWND).length).toBe(1);
});
