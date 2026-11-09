// 2026-11-10 (personal-shop): the personal shop against a scripted world server
// (docs/superpowers/specs/2026-11-10-personal-shop-research.md): the seller puts an item up, names and opens the shop,
// sees a sale and shuts it; a buyer sees a seller's balloon, opens its shop, buys, and leaves. On the desktop by Neuz's
// mouse (drag, keypad, double click); on the landscape phone by taps and number fields.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArReader, NULL_ID, VendorPacket } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddPlayer, writeAddSelf, writeChattingNew, writePVendorItemNum, writePVendorItems,
  writePVendorOpen, writeRegisterPVendorItem, writeSetPointParam,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self, sentOf } from './worldHarness';

test.setTimeout(120_000);

const SELLER_ID = 9300;
const SELLER_PLAYER = 700;
const POTION = 2800;
/** DST_GOLD (defineAttribute.h): the bag's penya, which the self's ADD_OBJ of the testkit leaves at 0. */
const DST_GOLD = 10000;

/** The fields of a packet the page sent, after DPID_UNKNOWN and the type. */
const fields = (body: Buffer): ArReader => {
  const r = new ArReader(body);
  r.bytes(8);
  return r;
};
const sent = (gateway: Awaited<ReturnType<typeof playGateway>>, type: number) => sentOf(gateway, type);

function scriptOf(others: AddedMover[] = []): WorldScript {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 6, itemId: POTION, count: 5 }];
  own.gold = 100_000;
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: others.map((mover) => writeAddPlayer(mover.objectId, mover)),
  });
}

async function openOwnShop(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Private Shop', exact: true }).click();
  await expect(page.locator('.hud-vendor')).toBeVisible();
}

const okBox = async (page: Page, text: string): Promise<void> => {
  const box = page.locator('.hud-message:not([hidden])');
  await expect(box).toBeVisible();
  await expect(box.locator('.hud-message-text')).toHaveText(text);
  await box.locator('[data-button="ok"]').click();
};

test('the seller: an item up with its price, the shop named and opened, a sale, the shop shut', async ({ page, isMobile }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await openOwnShop(page);
  const shop = page.locator('.hud-vendor');
  const bag = page.locator('.hud-inventory');
  await expect(bag).toBeVisible();
  await expect(shop.locator('.hud-window-title')).toHaveText('Private Shop');
  if (!isMobile) {
    await expect(shop.locator('.vendor-slot')).toHaveCount(20);
    // the bag's potion dragged on the first slot: the registration keypad, its quantity the stack's
    await bag.locator('[data-bag-slot="6"]').dragTo(shop.locator('.vendor-slot[data-slot="0"]'));
    const sell = page.locator('.hud-vendor-sell');
    await expect(sell).toBeVisible();
    await expect(sell.locator('[data-control="WIDC_SELLNUM"] .hud-res-static-text')).toHaveText('5');
    // the price: a click on Unit Price, then 1 and 000 on the keypad
    await sell.locator('[data-control="WIDC_SELLPRI"]').click();
    await sell.locator('[data-control="WIDC_NUM1"]').click();
    await sell.locator('[data-control="WIDC_NUM000"]').click();
    await expect(sell.locator('[data-control="WIDC_SELLPRI"] .hud-res-static-text')).toHaveText('1,000');
    await sell.locator('[data-control="WIDC_OK"]').click();
  } else {
    await expect(shop.locator('.vendor-phone-row')).toHaveCount(20);
    // the phone: the shop's only text field is its name (the phone keyboard comes up for it alone)
    await expect(shop.locator('input, textarea')).toHaveCount(1);
    // a tap on the potion in the bag puts it on the first free slot; the sheet has the in-game numpad and no text field
    await bag.locator('[data-bag-slot="6"]').tap();
    const sell = page.locator('.hud-vendor-sell');
    await expect(sell).toBeVisible();
    await expect(sell.locator('input, textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    await expect(sell.locator('[data-field="quantity"]')).toHaveText('5');
    // Unit Price tapped, then 1 and 000 on the numpad
    await sell.locator('[data-field="price"]').tap();
    await expect(sell.locator('[data-field="price"]')).toHaveAttribute('aria-pressed', 'true');
    await sell.locator('[data-pad-key="1"]').tap();
    await sell.locator('[data-pad-key="000"]').tap();
    await expect(sell.locator('[data-field="price"]')).toHaveText('1,000');
    // keys a finger can press, their text 14 px or more
    const key = sell.locator('[data-pad-key="5"]');
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect(await key.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: info.outputPath('seller-numpad.png') });
    await sell.locator('[data-vendor-button="ok"]').tap();
  }
  await expect.poll(() => sent(gateway, VendorPacket.REGISTER_PVENDOR_ITEM).length).toBe(1);
  const register = fields(sent(gateway, VendorPacket.REGISTER_PVENDOR_ITEM)[0]!.body);
  expect([register.u8(), register.u8(), register.u8(), register.i16(), register.i32()]).toEqual([0, 0, 6, 5, 1000]);
  gateway.pushCache(script.later([writeRegisterPVendorItem(SELF_ID, 0, 6, 5, 1000)]));
  const slot = isMobile ? shop.locator('.vendor-phone-row[data-slot="0"]') : shop.locator('.vendor-slot[data-slot="0"]');
  await expect(slot.locator('.vendor-slot-price')).toContainText('1,000');
  await page.screenshot({ path: info.outputPath('seller-registered.png') });
  // the bag's potion is held: faded
  await expect(bag.locator('[data-bag-slot="6"]')).toHaveClass(/is-in-use/);

  // the name, OK, and the box
  const name = isMobile ? shop.locator('.vendor-phone-head input') : shop.locator('[data-control="WIDC_EDIT1"] input');
  await name.fill('Webby potions');
  if (isMobile) await shop.locator('[data-vendor-button="ok"]').tap();
  else await shop.locator('[data-control="WIDC_OK"]').click();
  await okBox(page, 'Will you open your shop?');
  await expect.poll(() => sent(gateway, VendorPacket.PVENDOR_OPEN).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.PVENDOR_OPEN)[0]!.body).string(48)).toBe('Webby potions');
  gateway.pushCache(script.later([writePVendorOpen(SELF_ID, 'Webby potions'), writeChattingNew(SELF_ID, [{ playerId: 500, name: 'Webby' }])]));
  await expect(shop.locator('.hud-window-title')).toHaveText('Private Shop(Shop is opening)');
  // ENTERCHTTING with the own player id, and the chat room as the owner's
  await expect.poll(() => sent(gateway, VendorPacket.ENTERCHTTING).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.ENTERCHTTING)[0]!.body).u32()).toBe(500);
  const chat = page.locator('.hud-vendor-chat');
  await expect(chat).toBeVisible();
  await expect(page.locator('.vendor-sign[data-object-id="9000"] .vendor-sign-text')).toHaveText('Webby potions');
  await page.screenshot({ path: info.outputPath('seller-open.png') });

  // a sale of 2: the slot shows 3; the Information tab says who bought it
  gateway.pushCache(script.later([writePVendorItemNum(SELF_ID, 0, 3, 'Buyer')]));
  if (isMobile) await expect(slot.locator('.vendor-slot-name')).toContainText('x3');
  else await expect(slot.locator('.vendor-slot-count')).toHaveText('3');
  await chat.locator('[data-vendor-button="information"]').click();
  await expect(chat.locator('.vendor-chat-pane').nth(1)).toContainText('Character: Buyer has purchased');
  await expect(chat.locator('.vendor-chat-pane').nth(1)).toContainText('2000 penya');

  // Cancel asks; OK shuts the window and sends PVENDOR_CLOSE with the own id
  if (isMobile) await shop.locator('[data-vendor-button="cancel"]').tap();
  else await shop.locator('[data-control="WIDC_CANCEL"]').click();
  await okBox(page, 'Will you close your shop?');
  await expect(shop).toBeHidden();
  await expect.poll(() => sent(gateway, VendorPacket.PVENDOR_CLOSE).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.PVENDOR_CLOSE)[0]!.body).u32()).toBe(SELF_ID);
});

test('the buyer: the balloon, the shop asked for, a buy with a quantity, the shop left', async ({ page, isMobile }, info) => {
  const seller: AddedMover = {
    ...BASE, index: MI_MALE, pos: [SQUARE[0] + 2, groundAt(SQUARE[0] + 2, SQUARE[2]), SQUARE[2]], angle: 0, objectId: SELLER_ID,
    isPlayer: true,
    player: {
      ...SELF_PLAYER, self: false, name: 'Seller', playerId: SELLER_PLAYER, equipmentObjectIds: [], shopTitle: 'Cheap potions here',
      worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
    },
  };
  const script = scriptOf([seller]);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writeSetPointParam(SELF_ID, DST_GOLD, 100_000)]));
  const sign = page.locator(`.vendor-sign[data-object-id="${SELLER_ID}"]`);
  await expect(sign).toBeVisible(ON_FRAMES);
  await expect(sign.locator('.vendor-sign-text')).toHaveText('Cheap potions here');
  await page.screenshot({ path: info.outputPath('buyer-sign.png') });
  if (isMobile) {
    // the phone: the balloon is tapped, its text 14 px
    expect(await sign.locator('.vendor-sign-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    await sign.tap();
  } else {
    // the desktop: a left click on the seller (WndWorld.cpp:7019-7048)
    await expect.poll(() => page.evaluate((id) => window.__client!.screenOf(id), SELLER_ID), ON_FRAMES).not.toBeNull();
    const at = (await page.evaluate((id) => window.__client!.screenOf(id), SELLER_ID))!;
    const box = (await page.locator('.world-view canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
  }
  await expect.poll(() => sent(gateway, VendorPacket.QUERY_PVENDOR_ITEM).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.QUERY_PVENDOR_ITEM)[0]!.body).u32()).toBe(SELLER_ID);
  gateway.pushCache(script.later([writePVendorItems(SELLER_ID, [
    { slot: 0, item: { objectId: 3, itemId: POTION, count: 20 }, count: 10, cost: 50 },
  ], true)]));
  const shop = page.locator('.hud-vendor');
  await expect(shop).toBeVisible();
  await expect(shop).toHaveAttribute('data-vendor-mode', 'buyer');
  await expect.poll(() => sent(gateway, VendorPacket.ENTERCHTTING).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.ENTERCHTTING)[0]!.body).u32()).toBe(SELLER_PLAYER);
  const buy = page.locator('.hud-vendor-buy');
  await page.screenshot({ path: info.outputPath('buyer-shop.png') });
  if (!isMobile) {
    await expect(shop.locator('[data-control="WIDC_EDIT1"] input')).toHaveValue('Cheap potions here');
    await expect(shop.locator('[data-control="WIDC_OK"]')).toBeHidden();
    const slot = shop.locator('.vendor-slot[data-slot="0"]');
    await expect(slot.locator('.vendor-slot-count')).toHaveText('10');
    await expect(slot.locator('.vendor-slot-price')).toHaveText('50');
    // a double click: the buy keypad, all ten at 50 each; Min makes it one
    await slot.dblclick();
    await expect(buy).toBeVisible();
    await expect(buy.locator('[data-control="WIDC_BUYNUM"] .hud-res-static-text')).toHaveText('10');
    await expect(buy.locator('[data-control="WIDC_STATIC5"] .hud-res-static-text')).toHaveText('500');
    await buy.locator('[data-control="WIDC_VENMIN"]').click();
    await expect(buy.locator('[data-control="WIDC_STATIC5"] .hud-res-static-text')).toHaveText('50');
    await buy.locator('[data-control="WIDC_OK"]').click();
  } else {
    const row = shop.locator('.vendor-phone-row[data-slot="0"]');
    await expect(row.locator('.vendor-slot-name')).toContainText('x10');
    await row.tap();
    await expect(buy).toBeVisible();
    // the in-game numpad, no text field: C, then 1
    await expect(buy.locator('input, textarea')).toHaveCount(0);
    await expect(buy.locator('[data-field="quantity"]')).toHaveText('10');
    await expect(buy.locator('[data-field="total"]')).toHaveText('500');
    await buy.locator('[data-pad-key="escape"]').tap();
    await buy.locator('[data-pad-key="1"]').tap();
    await expect(buy.locator('[data-field="quantity"]')).toHaveText('1');
    await expect(buy.locator('[data-field="total"]')).toHaveText('50');
    await page.screenshot({ path: info.outputPath('buyer-numpad.png') });
    await buy.locator('[data-vendor-button="ok"]').tap();
  }
  await expect.poll(() => sent(gateway, VendorPacket.BUY_PVENDOR_ITEM).length).toBe(1);
  const request = fields(sent(gateway, VendorPacket.BUY_PVENDOR_ITEM)[0]!.body);
  expect([request.u32(), request.u8(), request.u32(), request.i16()]).toEqual([SELLER_ID, 0, POTION, 1]);
  await expect(buy).toBeHidden();
  // the server's count: 9 left
  gateway.pushCache(script.later([writePVendorItemNum(SELLER_ID, 0, 9, 'Webby')]));
  if (isMobile) await expect(shop.locator('.vendor-phone-row[data-slot="0"] .vendor-slot-name')).toContainText('x9');
  else await expect(shop.locator('.vendor-slot[data-slot="0"] .vendor-slot-count')).toHaveText('9');
  // the window shut: PVENDOR_CLOSE with the seller's id
  await shop.locator('.hud-window-close').click();
  await expect(shop).toBeHidden();
  await expect.poll(() => sent(gateway, VendorPacket.PVENDOR_CLOSE).length).toBe(1);
  expect(fields(sent(gateway, VendorPacket.PVENDOR_CLOSE)[0]!.body).u32()).toBe(SELLER_ID);
  if (!isMobile) {
    // a seller's menu: "View equipment" alone (WndWorld.cpp:6544-6547)
    const at = (await page.evaluate((id) => window.__client!.screenOf(id), SELLER_ID))!;
    const box = (await page.locator('.world-view canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1], { button: 'right' });
    const menu = page.locator('.hud-mover-menu');
    await expect(menu).toBeVisible();
    expect(await menu.locator('[data-menu-entry]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.menuEntry))).toEqual(['24']);
  }
});
