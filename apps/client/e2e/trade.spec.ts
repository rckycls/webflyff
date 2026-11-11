// 2026-11-10: the player trade (docs/superpowers/specs/2026-11-10-trade-research.md), played against a scripted world
// server on the desktop (drag and drop) and on the phone (taps): the request from a player's menu, the trade window,
// an item, a stack's count and the penya put in, the two OKs, the final box and the exchange; the asked side's window,
// its refusals, a cancel and the partner leaving. Webby is player 500 (the harness's character list); Lead, player
// 70002, stands in view.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType, TradePacket } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, directBlock, newVagrantOwn, writeAddPlayer, writeAddSelf, writeConfirmTrade, writeDelObj, writeTrade,
  writeTradeCancel, writeTradeConsent, writeTradeLastConfirm, writeTradeLastConfirmOk, writeTradeOk, writeTradePut,
  writeTradePutGold,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  BASE, MADRIGAL, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, hudTexts, playGateway, recordHudTexts, self,
  sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const LEAD_ID = 9300;
const LEAD_AT: Vec3 = [6967, groundAt(6967, 3323), 3323];
const lead: AddedMover = {
  ...BASE, hitPoint: 80, index: MI_MALE, pos: LEAD_AT, angle: 180, objectId: LEAD_ID, isPlayer: true,
  player: { ...SELF_PLAYER, self: false, name: 'Lead', playerId: LEAD, level: 1, job: 0, equipmentObjectIds: [] },
};
/** Lead's bag as TRADE sends it: three of item 4805 on its first object. */
const LEAD_ITEMS: InventoryItem[] = [{ objectId: 0, itemId: 4805, count: 3 }];

/** Webby with a stack of five (object 6), a sword (object 8) and 5000 penya; each object on its own bag position. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 6, itemId: 2800, count: 5 }, { objectId: 8, itemId: 21, count: 1 }];
  own.gold = 5000;
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddPlayer(LEAD_ID, lead)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const trade = (page: Page) => page.locator('.hud-trade');
const mySlot = (page: Page, slot: number) => trade(page).locator(`.hud-trade-grid[data-side="mine"] [data-trade-slot="${slot}"]`);
const theirSlot = (page: Page, slot: number) => trade(page).locator(`.hud-trade-grid[data-side="theirs"] [data-trade-slot="${slot}"]`);
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
// the shown amount box (the bank's Move Items boxes share its look, hidden)
const goldBox = (page: Page) => page.locator('.hud-trade-gold:visible');
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');

/** A sent packet's bytes after DPID_UNKNOWN and the type. */
const bodyOf = (gateway: Gateway, type: number, i = 0): Buffer => sentOf(gateway, type)[i]!.body.subarray(8);

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

/** A bag item put on the own grid: dragged onto `slot` on the desktop, tapped on the phone (the first free slot). */
async function putItem(page: Page, bagSlot: number, slot: number): Promise<void> {
  if (isPhone()) await bagCell(page, bagSlot).tap();
  else await bagCell(page, bagSlot).dragTo(mySlot(page, slot));
}

/** The quantity box answered: the field typed over, then OK (Enter on the desktop, the button on the phone). */
async function answerAmount(page: Page, amount: string): Promise<void> {
  const field = goldBox(page).locator('input');
  await field.fill(amount);
  if (isPhone()) await goldBox(page).locator('[data-control="WIDC_OK"]').tap();
  else await field.press('Enter');
  await expect(goldBox(page)).toBeHidden();
}

test('the asker: Trade from the menu, items, a stack, the penya, both OKs, the final box and the exchange', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  await openLeadMenu(page, gateway);
  const entry = page.locator('.hud-mover-menu [data-menu-entry="2"]');
  await expect(entry).toBeEnabled();
  await entry.click();
  await expect.poll(() => sentOf(gateway, TradePacket.CONFIRMTRADE).length).toBe(1);
  expect(bodyOf(gateway, TradePacket.CONFIRMTRADE).readUInt32LE(0)).toBe(LEAD_ID);
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('You have offered to trade with Lead.');

  // Lead said yes: TRADE opens the bag and the trade window, with both names and no penya
  gateway.pushCache(script.later([writeTrade(LEAD_ID, LEAD, LEAD_ITEMS)]));
  await expect(trade(page)).toBeVisible();
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await expect(trade(page).locator('[data-trade="their-name"]')).toHaveText('Lead');
  await expect(trade(page).locator('[data-trade="my-name"]')).toHaveText('Webby');
  await expect(trade(page).locator('[data-trade="my-penya"]')).toContainText('0');
  // no use of a bag item while trading (desktop: a double click on one not in the trade)
  if (!isPhone()) {
    await bagCell(page, 6).dblclick();
    await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('You cannot use items while trading.');
  }

  // the sword: TRADEPUT ( 0, 0, 8, 1 ); the server's echo fills the slot and fades the bag's sword
  await putItem(page, 8, 0);
  await expect.poll(() => sentOf(gateway, TradePacket.TRADEPUT).length).toBe(1);
  expect([...bodyOf(gateway, TradePacket.TRADEPUT)]).toEqual([0, 0, 8, 1, 0]);
  gateway.pushCache(script.later([writeTradePut(SELF_ID, 0, 8, 1)]));
  await expect(mySlot(page, 0)).toHaveAttribute('data-filled', '');
  await expect(bagCell(page, 8)).toHaveClass(/is-in-use/);

  // the stack of five asks its count first ("Item", preset to 5): 3 of them
  await putItem(page, 6, 1);
  await expect(goldBox(page)).toBeVisible();
  await expect(goldBox(page).locator('.hud-window-title')).toHaveText('Item');
  await expect(goldBox(page).locator('input')).toHaveValue('5');
  await answerAmount(page, '3');
  await expect.poll(() => sentOf(gateway, TradePacket.TRADEPUT).length).toBe(2);
  expect([...bodyOf(gateway, TradePacket.TRADEPUT, 1)]).toEqual([1, 0, 6, 3, 0]);
  gateway.pushCache(script.later([writeTradePut(SELF_ID, 1, 6, 3)]));
  await expect(mySlot(page, 1)).toHaveAttribute('data-filled', '');

  // the penya: the bag's penya dragged (tapped) on the grid, "Penya" preset to all of it; 1200 of it
  if (isPhone()) await page.locator('.hud-inventory .inventory-money').tap();
  else await page.locator('.hud-inventory .inventory-money').dragTo(mySlot(page, 4));
  await expect(goldBox(page)).toBeVisible();
  await expect(goldBox(page).locator('.hud-window-title')).toHaveText('Penya');
  await expect(goldBox(page).locator('input')).toHaveValue('5000');
  await answerAmount(page, '1200');
  await expect.poll(() => sentOf(gateway, TradePacket.TRADEPUTGOLD).length).toBe(1);
  expect(bodyOf(gateway, TradePacket.TRADEPUTGOLD).readUInt32LE(0)).toBe(1200);
  gateway.pushCache(script.later([writeTradePutGold(SELF_ID, 1200)]));
  await expect(trade(page).locator('[data-trade="my-penya"]')).toContainText('1,200');
  await expect(page.locator('.hud-inventory .inventory-money')).toHaveText('3,800');

  // Lead puts two of its three and 700 penya, and presses OK first
  gateway.pushCache(script.later([writeTradePut(LEAD_ID, 0, 0, 2), writeTradePutGold(LEAD_ID, 700), writeTradeOk(LEAD_ID)]));
  await expect(theirSlot(page, 0)).toHaveAttribute('data-filled', '');
  await expect(trade(page).locator('[data-trade="their-penya"]')).toContainText('700');
  await expect(trade(page).locator('[data-control="WIDC_OK_YOU"]')).toBeDisabled();
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('Lead has completed the trade.');

  // my OK: TRADEOK; both pressed, the final box
  await trade(page).locator('[data-control="WIDC_OK_I"]').click();
  await expect.poll(() => sentOf(gateway, TradePacket.TRADEOK).length).toBe(1);
  gateway.pushCache(script.later([writeTradeLastConfirm()]));
  const confirm = page.locator('.hud-trade-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Do you accept the trade?');
  await expect(trade(page).locator('[data-control="WIDC_OK_I"]')).toBeDisabled();
  await confirm.locator('[data-control="WIDC_YES"]').click();
  await expect.poll(() => sentOf(gateway, TradePacket.TRADECONFIRM).length).toBe(1);
  gateway.pushCache(script.later([writeTradeLastConfirmOk(SELF_ID)]));
  await expect(confirm).toContainText('You need to wait for approval.');
  await expect(confirm.locator('[data-control="WIDC_YES"]')).toBeHidden();

  // the exchange: the windows close (the trade window's TRADECANCEL as its destructor sends); the bag moved as Neuz's
  // TradeConsent moves it: the sword gone, two of the stack left, Lead's two on the first empty position, the penya
  gateway.pushCache(script.later([writeTradeConsent()]));
  await expect(trade(page)).toBeHidden();
  await expect(confirm).toBeHidden();
  await expect.poll(() => sentOf(gateway, TradePacket.TRADECANCEL).length).toBe(1);
  await expect(bagCell(page, 8)).toHaveAttribute('aria-label', 'Empty slot 9');
  await expect(bagCell(page, 6)).toHaveAttribute('aria-label', /×2, slot 7$/);
  await expect(bagCell(page, 0)).toHaveAttribute('aria-label', /×2, slot 1$/);
  await expect(page.locator('.hud-inventory .inventory-money')).toHaveText('4,500');
});

test('the asked side: the request window, its refusal, a cancel, and the partner leaving', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);

  // CONFIRMTRADE: "Lead wants to trade."; a second one while it is open is refused with BLOCK 5
  gateway.pushCache(script.later([writeConfirmTrade(LEAD_ID)]));
  const request = page.locator('.hud-trade-request');
  await expect(request).toBeVisible();
  await expect(request).toContainText('Lead wants to trade.');
  await expect(request).toContainText('Would you like to trade?');
  gateway.pushCache(script.later([writeConfirmTrade(LEAD_ID)]));
  await expect.poll(() => sentOf(gateway, PacketType.BLOCK).length).toBe(1);
  expect(bodyOf(gateway, PacketType.BLOCK)[0]).toBe(5);
  // Cancel: CONFIRMTRADECANCEL with Lead's object
  await request.locator('[data-control="WIDC_CANCEL"]').click();
  await expect(request).toBeHidden();
  await expect.poll(() => sentOf(gateway, TradePacket.CONFIRMTRADECANCEL).length).toBe(1);
  expect(bodyOf(gateway, TradePacket.CONFIRMTRADECANCEL).readUInt32LE(0)).toBe(LEAD_ID);

  // asked again: OK sends TRADE
  gateway.pushCache(script.later([writeConfirmTrade(LEAD_ID)]));
  await expect(request).toBeVisible();
  await request.locator('[data-control="WIDC_OK"]').click();
  await expect.poll(() => sentOf(gateway, TradePacket.TRADE).length).toBe(1);
  expect(bodyOf(gateway, TradePacket.TRADE).readUInt32LE(0)).toBe(LEAD_ID);
  gateway.pushCache(script.later([writeTrade(LEAD_ID, WEBBY, LEAD_ITEMS)]));
  await expect(trade(page)).toBeVisible();

  await page.screenshot({ path: test.info().outputPath('trade.png') });
  const view = page.viewportSize()!;
  const tradeBox = (await trade(page).boundingBox())!;
  expect(tradeBox.x).toBeGreaterThanOrEqual(-1);
  expect(tradeBox.x + tradeBox.width).toBeLessThanOrEqual(view.width + 1);
  expect(tradeBox.y + tradeBox.height).toBeLessThanOrEqual(view.height + 1);
  if (isPhone()) {
    // the phone: the names, the penya and the buttons' words 14 px at least, the grids and the buttons in the window
    for (const selector of ['[data-trade="their-name"] span', '[data-trade="my-penya"] span', '[data-control="WIDC_OK_I"]',
      '[data-control="WIDC_CANCEL"]']) {
      expect(await trade(page).locator(selector).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    }
    for (const selector of ['.hud-trade-grid[data-side="mine"]', '.hud-trade-grid[data-side="theirs"]', '[data-control="WIDC_OK_I"]']) {
      const part = (await trade(page).locator(selector).boundingBox())!;
      expect(part.y + part.height).toBeLessThanOrEqual(tradeBox.y + tradeBox.height + 1);
      expect(part.x + part.width).toBeLessThanOrEqual(tradeBox.x + tradeBox.width + 1);
    }
    // the bag beside it, not under it
    const bag = (await page.locator('.hud-inventory').boundingBox())!;
    expect(tradeBox.x + tradeBox.width).toBeLessThanOrEqual(bag.x + 1);
  }

  // Cancel: TRADECANCEL, the window stays for the answer; the answer closes it with the box
  await trade(page).locator('[data-control="WIDC_CANCEL"]').click();
  await expect.poll(() => sentOf(gateway, TradePacket.TRADECANCEL).length).toBe(1);
  await expect(trade(page)).toBeVisible();
  gateway.pushCache(script.later([writeTradeCancel(SELF_ID, WEBBY, 0)]));
  await expect(trade(page)).toBeHidden();
  await expect(box(page)).toHaveText('The trade has been cancelled.');
  await page.locator('.hud-message:visible [data-button="ok"]').click();

  // Lead's refusal of my request comes back as BLOCK 3
  gateway.pushCache(directBlock(3, 'Lead'));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('Lead is in the \'Refuse Trade\' setting.');

  // a trade again, then Lead leaves (DEL_OBJ): every trade window closes, with no box
  gateway.pushCache(script.later([writeTrade(LEAD_ID, WEBBY, LEAD_ITEMS)]));
  await expect(trade(page)).toBeVisible();
  gateway.pushCache(script.later([writeDelObj(LEAD_ID)]));
  await expect(trade(page)).toBeHidden();
  await expect(box(page)).toHaveCount(0);
});
