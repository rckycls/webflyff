import { expect, test } from '@playwright/test';
import { ArReader, ArWriter, NULL_ID, PacketType } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeDelObj, writeSetPointParam } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, julia, ownAt, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(120_000);
const message = (objectId: number, type: number, fields: ArWriter): ScriptMessage => ({ objectId, type, fields: fields.toBytes() });
function item(id: number, count: number): Uint8Array {
  return new ArWriter().u32(id).u32(2800).u32(0).string('').i16(count).u8(0).i32(100).i32(0).u8(0)
    .i32(0).u32(0).u8(0).i32(0).i32(0).u32(0).u32(0).u32(0).i32(0).i64(0n).u32(0).u8(0).i32(0).toBytes();
}
function stock(): ArWriter {
  const w = new ArWriter();
  for (let tab = 0; tab < 4; tab++) {
    for (let i = 0; i < 100; i++) w.u32(tab === 0 && i === 0 ? 1 : NULL_ID);
    w.u8(tab === 0 ? 1 : 0); if (tab === 0) w.u8(1).bytes(item(1, 99));
    w.bytes(new Uint8Array(400));
  }
  return w;
}

test('talking: chat typing, channels, peaceful NPC dialogue and authoritative buy/sell', async ({ page, isMobile }, info) => {
  const own = newVagrantOwn(); own.inventory = [{ objectId: 6, itemId: 2800, count: 3 }];
  const vendor = { ...julia, pos: [6965, groundAt(6965, 3324), 3324] as [number, number, number], npc: { ...julia.npc!, characterKey: 'MaFl_Luda' } };
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddMonster(NPC_ID, vendor)],
  });
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  if (isMobile) await page.getByRole('button', { name: 'Chat', exact: true }).tap(); else await page.keyboard.press('Enter');
  const chat = page.locator('.hud-chat'), input = chat.getByRole('textbox', { name: 'Chat message' });
  const composerBeforeFocus = (await input.boundingBox())!;
  if (isMobile) {
    await expect(input).not.toBeFocused(); await input.tap();
    expect(await input.boundingBox()).toEqual(composerBeforeFocus);
    // A keyboard can reduce the viewport; the composer must stay attached to the taskbar.
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 80 });
    await expect.poll(async () => {
      const composer = (await chat.boundingBox())!, taskbar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
      return Math.abs(composer.y + composer.height - taskbar.y);
    }).toBeLessThan(1);
    await page.setViewportSize(viewport);
    await expect.poll(() => input.boundingBox()).toEqual(composerBeforeFocus);
  }
  await expect(input).toBeFocused();
  const chatBox = (await chat.boundingBox())!;
  const barBox = (await page.locator('.hud-taskbar-strip').boundingBox())!;
  expect(Math.abs(chatBox.x - barBox.x)).toBeLessThan(1);
  expect(Math.abs(chatBox.width - barBox.width * (isMobile ? 1 : 0.5))).toBeLessThan(1);
  expect(Math.abs(chatBox.y + chatBox.height - barBox.y)).toBeLessThan(1);
  await expect(input).not.toHaveAttribute('placeholder');
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(isMobile ? 24 : 17);
  const shoutBox = (await chat.getByRole('button', { name: 'Shout', exact: true }).boundingBox())!;
  expect(shoutBox.height).toBeLessThanOrEqual(isMobile ? 22 : 14);
  if (isMobile) {
    expect(Math.abs(shoutBox.y - (await input.boundingBox())!.y)).toBeLessThanOrEqual(3);
    await expect(page.locator('.hud-taskbar-strip')).toHaveAttribute('data-layout', '620');
    await expect(page.locator('.hud-slot[data-row=applet]')).toHaveCount(0);
    expect(await page.locator('.hud-taskbar-strip').evaluate(el => getComputedStyle(el, '::after').backgroundPosition)).toBe('-280px 0px');
    await page.locator('.hud-taskbar-strip').screenshot({ path: info.outputPath('mobile-taskbar.png') });
  }
  const position = await ownAt(page), camera = await page.evaluate(() => window.__client!.camera());
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyI'); await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__client!.step(20));
  await page.keyboard.up('KeyW'); await page.keyboard.up('ArrowLeft');
  expect(await ownAt(page)).toEqual(position); expect(await page.evaluate(() => window.__client!.camera())).toEqual(camera);
  await expect(page.locator('.hud-inventory')).toBeHidden();
  await input.fill('Hello Flaris'); await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => sentOf(gateway, 0xff0000).length).toBe(1);
  if (isMobile) {
    await expect(input).not.toBeFocused();
    expect(await input.boundingBox()).toEqual(composerBeforeFocus);
  }
  const sentText = () => { const r = new ArReader(sentOf(gateway, 0xff0000).at(-1)!.body); r.bytes(8); return r.string(1024); };
  expect(sentText()).toBe('Hello Flaris');
  gateway.pushCache(script.later([message(SELF_ID, 1, new ArWriter().string('Hello Flaris'))]));
  await expect(chat.getByRole('log')).toContainText('[nearby] Webby: Hello Flaris');
  await expect(chat.locator('select')).toHaveCount(0);
  await input.fill('/w Rocky Hi'); await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(sentText).toBe('/w Rocky Hi');
  gateway.pushCache(new ArWriter().u32(0xff00d4).string('Rocky').string('Webby').string('Hello back').u32(501).u32(500).i32(0).toBytes());
  await expect(chat.getByRole('log')).toContainText('[whisper] Rocky → Webby: Hello back');
  gateway.pushCache(script.later([message(SELF_ID, 0xa9, new ArWriter().i32(3).string('Missing'))]));
  await expect(chat.getByRole('log')).toContainText('Whisper unavailable: Missing');
  await input.fill('/s Anyone here?');
  await chat.getByRole('button', { name: 'Send', exact: true }).click(); await expect.poll(sentText).toBe('/s Anyone here?');
  gateway.pushCache(script.later([message(SELF_ID, 0xd0, new ArWriter().u32(SELF_ID).string('Webby').string('Anyone here?').u32(0xffff99cc))]));
  await expect(chat.getByRole('log')).toContainText('[shout] Webby: Anyone here?');
  await page.screenshot({ path: info.outputPath('chat.png') });
  await input.focus(); await page.keyboard.press('Escape');
  let normalBag: { x: number; y: number; width: number; height: number } | undefined;
  {
    if (isMobile) await page.getByRole('button', { name: 'Bag', exact: true }).click();
    else await page.keyboard.press('KeyI');
    normalBag = (await page.locator('.hud-inventory').boundingBox())!;
    await page.locator('.hud-inventory > .hud-window-close').click();
  }
  const menu = page.locator('.hud-mover-menu');
  await tapMover(page, NPC_ID); await expect(menu).toBeVisible();
  expect(sentOf(gateway, PacketType.MELEE_ATTACK)).toHaveLength(0);
  await expect(menu.locator('[data-menu-entry="0"]')).toHaveText('Dialog');
  await expect(menu.locator('[data-menu-entry="2"]')).toHaveText('Trade');
  await menu.locator('[data-menu-entry="0"]').click(); await expect.poll(() => sentOf(gateway, 0xff00b0).length).toBe(1);
  const dialog = page.locator('.hud-dialog');
  if (!isMobile) expect((await dialog.boundingBox())!).toMatchObject({ width: 512, height: 320 });
  // CUser::AddRunScriptFunc uses the receiving player's object ID, not the selected NPC's.
  gateway.pushCache(script.later([message(SELF_ID, 0x24, new ArWriter().u16(0x12).string('Welcome to my shop.').u32(0))]));
  await expect(dialog.locator('.dialog-text')).toContainText('Welcome to my shop.');
  await page.screenshot({ path: info.outputPath('npc.png') });
  // the dialogue is modal: it closes before the menu's Trade
  await dialog.locator(':scope > .hud-window-close').click(); await expect(dialog).toBeHidden();
  gateway.pushCache(script.later([writeSetPointParam(SELF_ID, 10000, 1000)]));
  await tapMover(page, NPC_ID);
  await menu.locator('[data-menu-entry="2"]').click(); await expect.poll(() => sentOf(gateway, 0xff00b1).length).toBe(1);
  gateway.pushCache(script.later([message(NPC_ID, 0x14, stock())]));
  const shop = page.locator('.hud-shop'); await expect(shop.locator('[data-stock-id="1"]')).toBeVisible();
  const inventory = page.locator('.hud-inventory'); await expect(inventory).toBeVisible();
  const shopRect = (await shop.boundingBox())!, inventoryRect = (await inventory.boundingBox())!;
  await expect(shop.locator('.shop-search, .shop-awaken, .shop-reference-filters')).toHaveCount(0);
  await expect(shop.locator('.shop-tabs button').first()).toHaveText('Weapons');
  expect(await shop.getByLabel('Base item price').evaluate(el => getComputedStyle(el).backgroundRepeat)).toBe(Array(9).fill('no-repeat').join(', '));
  // 2026-11-05: the tabs are one strip of WndTabTile pieces laid as CWndTabCtrl lays it, the chosen tab whole over it
  expect(await shop.locator('.shop-tab-strip > [data-tile]').count()).toBeGreaterThanOrEqual(4 * 4 + 4);
  expect(await shop.locator('.shop-tabs button').first().evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
  await page.screenshot({ path: info.outputPath('shop-tabs.png') });
  if (normalBag) {
    expect(inventoryRect.width).toBeCloseTo(normalBag.width, 0); expect(inventoryRect.height).toBeCloseTo(normalBag.height, 0);
    expect(inventoryRect.x).toBeCloseTo(normalBag.x, 0); expect(inventoryRect.y).toBeCloseTo(normalBag.y, 0);
  }
  await expect(shop.locator('.shop-money')).toHaveCount(0);
  await expect(shop.locator('.shop-feedback')).toBeHidden();
  expect(await shop.locator('.shop-controls').evaluate(el => el.nextElementSibling === null)).toBe(true);
  if (!isMobile) {
    await shop.locator('[data-stock-id="1"]').hover();
    await expect(page.locator('.shop-item-details')).toContainText('Lollipop');
    // the item tooltip as the shop asks for it (2026-11-05): the buy price, never the count, which is on the icon
    await expect(page.locator('.shop-item-details')).toContainText('Price : ');
    await expect(page.locator('.shop-item-details')).not.toContainText('99');
    await page.screenshot({ path: info.outputPath('shop-hover.png') });
    await shop.locator('.shop-heading').hover(); await expect(page.locator('.shop-item-details')).toHaveCount(0);
  }
  expect(shopRect.x + shopRect.width).toBeLessThanOrEqual(inventoryRect.x);
  expect(Math.abs(shopRect.y - inventoryRect.y)).toBeLessThanOrEqual(1);
  await shop.locator('[data-stock-id="1"]').click(); await shop.getByLabel('Shop quantity').fill('2');
  await shop.getByRole('button', { name: 'Buy', exact: true }).click(); await expect.poll(() => sentOf(gateway, 0xff00b3).length).toBe(1);
  await expect(inventory.locator('.inventory-money')).toHaveText('1,000'); await expect(inventory.locator('[data-bag-slot]').filter({ hasText: '3' }).first()).toBeVisible();
  gateway.pushCache(script.later([
    message(SELF_ID, 0x18, new ArWriter().u8(0).u8(6).u8(8).u32(5).u32(0)), writeSetPointParam(SELF_ID, 10000, 980),
  ]));
  await expect(inventory.locator('.inventory-money')).toHaveText('980'); await expect(inventory.locator('[data-bag-slot]').filter({ hasText: '5' }).first()).toBeVisible();
  await inventory.locator('[data-bag-slot]').filter({ hasText: '5' }).first().click(); await shop.getByLabel('Shop quantity').fill('2');
  await shop.getByRole('button', { name: 'Sell', exact: true }).click(); await expect.poll(() => sentOf(gateway, 0xff00b4).length).toBe(1);
  gateway.pushCache(script.later([
    writeSetPointParam(SELF_ID, 10000, 990), message(SELF_ID, 0x18, new ArWriter().u8(0).u8(6).u8(8).u32(3).u32(0)),
  ]));
  await expect(inventory.locator('.inventory-money')).toHaveText('990'); await expect(inventory.getByRole('button', { name: /Lollipop ×3, slot 7/ })).toBeVisible();
  if (isMobile) {
    const box = (await shop.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    for (const control of [shop.getByLabel('Shop quantity'), shop.getByRole('button', { name: 'Sell', exact: true })]) {
      const rect = (await control.boundingBox())!;
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height);
    }
  }
  await page.screenshot({ path: info.outputPath('shop.png') });
  const beforeWalking = await ownAt(page);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__client!.step(10));
  await page.keyboard.up('KeyW');
  await expect(shop).toBeHidden();
  expect(await ownAt(page)).not.toEqual(beforeWalking);
  await expect(inventory).toBeVisible();
  await expect.poll(() => sentOf(gateway, 0xff00b2).length).toBe(1);
  await inventory.locator(':scope > .hud-window-close').click();
  await page.evaluate(() => window.__client!.step(10));
  await tapMover(page, NPC_ID);
  await page.locator('.hud-mover-menu [data-menu-entry="2"]').click();
  await expect(shop).toBeVisible();
  gateway.pushCache(script.later([writeDelObj(NPC_ID)])); await expect(shop).toBeHidden();
  await expect.poll(() => sentOf(gateway, 0xff00b2).length).toBe(2);
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
