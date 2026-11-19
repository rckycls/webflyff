// 2026-11-20 (mouse-drag-ui, docs/2026-11-20-mouse-drag-ui.md): the V15 drag boxes and windows against the scripted world.
// F: the penya sack refused on the ground (TID_GAME_CANNOT_DROPMONEY); one item's Yes/No box.
// G: the NPC shop's drags: a stock item into the bag opens Purchase Confirmation, a bag item onto the shop Selling Confirm.
// H: the Navigator's edges drag (96 x 112 to 192 x 208), and a window's place is kept for the next time it opens.
import { expect, test } from '@playwright/test';
import { ArWriter, NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeSetPointParam } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  MADRIGAL, NPC_ID, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, hudTexts, julia, playGateway, recordHudTexts, self,
  sentOf, tapMover,
} from './worldHarness';

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

async function enter(page: Parameters<typeof playGateway>[0]) {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 6, itemId: 2800, count: 3 }, { objectId: 7, itemId: 2800, count: 1 }];
  const vendor = { ...julia, pos: [6965, groundAt(6965, 3324), 3324] as [number, number, number], npc: { ...julia.npc!, characterKey: 'MaFl_Luda' } };
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddMonster(NPC_ID, vendor)],
  });
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  // 1,000 penya (PI_GOLD)
  gateway.pushCache(script.later([writeSetPointParam(SELF_ID, 10000, 1000)]));
  return { gateway, script };
}

test('the shop drags: buy into the bag, sell onto the shop, each through its V15 box (desktop)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'the phone keeps the shop\'s select + Buy/Sell buttons');
  const { gateway, script } = await enter(page);
  await tapMover(page, NPC_ID);
  await page.locator('.hud-mover-menu [data-menu-entry="2"]').click();
  await expect.poll(() => sentOf(gateway, 0xff00b1).length).toBe(1);
  gateway.pushCache(script.later([message(NPC_ID, 0x14, stock())]));
  const shop = page.locator('.hud-shop'), bag = page.locator('.hud-inventory');
  await expect(shop.locator('[data-stock-id="1"]')).toBeVisible();
  await expect(bag).toBeVisible();
  // a stock item into the bag: CWndConfirmBuy, its count 1; + and Max; OK sends the buy
  await shop.locator('[data-stock-id="1"]').dragTo(bag.locator('[data-bag-slot="20"]'));
  const buy = page.getByRole('dialog', { name: 'Purchase Confirmation', exact: true });
  await expect(buy).toBeVisible();
  const count = buy.getByLabel('Buy quantity');
  await expect(count).toHaveValue('1');
  await buy.getByRole('button', { name: 'One more' }).click();
  await expect(count).toHaveValue('2');
  await buy.getByRole('button', { name: 'Max' }).click();
  await expect(count).toHaveValue('99');
  await buy.getByRole('button', { name: 'One less' }).click();
  await expect(count).toHaveValue('98');
  await count.fill('2');
  await expect(count).toHaveValue('2');
  await page.screenshot({ path: info.outputPath('confirm-buy.png') });
  await buy.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(buy).toBeHidden();
  await expect.poll(() => sentOf(gateway, 0xff00b3).length).toBe(1);
  // the server's answer (the penya less), which the shop waits for before the next request
  gateway.pushCache(script.later([writeSetPointParam(SELF_ID, 10000, 980)]));
  await expect(bag.locator('.inventory-money')).toHaveText('980');
  // a bag stack onto the shop: CWndConfirmSell, filled with the whole stack; OK sells what it reads
  await bag.locator('[data-bag-slot="6"]').dragTo(shop.locator('.shop-stock-grid'));
  const sell = page.getByRole('dialog', { name: 'Selling Confirm', exact: true });
  await expect(sell).toBeVisible();
  await expect(sell.getByLabel('Sell quantity')).toHaveValue('3');
  await sell.getByLabel('Sell quantity').fill('2');
  await page.screenshot({ path: info.outputPath('confirm-sell.png') });
  await sell.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(sell).toBeHidden();
  await expect.poll(() => sentOf(gateway, 0xff00b4).length).toBe(1);
  // the select + button way still works
  await expect(shop.getByRole('button', { name: 'Buy', exact: true })).toBeVisible();
  // a drop on the ground while the shop is open: refused (TID_GAME_TRADELIMITITEM)
  await recordHudTexts(page);
  await bag.locator('[data-bag-slot="7"]').dragTo(page.locator('.world-view canvas'), { targetPosition: { x: 200, y: 400 } });
  await expect.poll(async () => (await hudTexts(page))?.lines.join('|') ?? '').toContain('trad');
  await expect(page.locator('.hud-drop-window:visible')).toHaveCount(0);
  expect(sentOf(gateway, 0xff0007)).toHaveLength(0);
});

test('the bag on the ground: the penya refused, one item asks Yes/No (desktop)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'the phone has no drag (its card\'s Drop is the items spec\'s)');
  const { gateway } = await enter(page);
  await recordHudTexts(page);
  await page.keyboard.press('KeyI');
  const bag = page.locator('.hud-inventory');
  await expect(bag).toBeVisible();
  await bag.locator('.inventory-money').dragTo(page.locator('.world-view canvas'), { targetPosition: { x: 200, y: 400 } });
  await expect.poll(async () => (await hudTexts(page))?.lines.join('|') ?? '').toContain('Penya');
  await bag.locator('[data-bag-slot="7"]').dragTo(page.locator('.world-view canvas'), { targetPosition: { x: 200, y: 400 } });
  const confirm = page.getByRole('dialog', { name: 'Drop Item Confirmation', exact: true });
  await expect(confirm).toBeVisible();
  await page.screenshot({ path: info.outputPath('drop-confirm.png') });
  await confirm.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => sentOf(gateway, 0xff0007).length).toBe(1);
  await expect(confirm).toBeHidden();
});

test('the Navigator resizes by its edges; a window keeps its place for the next time (desktop)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'the phone windows keep their fixed places and sizes');
  await enter(page);
  const nav = page.locator('.hud-navigator');
  await expect(nav).toBeVisible();
  const before = (await nav.boundingBox())!;
  expect(before.width).toBe(144);
  // the bottom-left corner dragged 40 px left and 40 down: 32 more each way (16 px steps), the right edge still
  await page.mouse.move(before.x + 2, before.y + before.height - 2);
  await page.mouse.down();
  await page.mouse.move(before.x - 38, before.y + before.height + 38, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBe(176);
  const after = (await nav.boundingBox())!;
  expect(after.height).toBe(192);
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
  // never past 192 x 208 (AdjustMaxRect, WndField.cpp:10088)
  await page.mouse.move(after.x + 2, after.y + after.height - 2);
  await page.mouse.down();
  await page.mouse.move(after.x - 200, after.y + after.height + 200, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBe(192);
  expect((await nav.boundingBox())!.height).toBe(208);
  await page.screenshot({ path: info.outputPath('navigator-resized.png') });
  // the bag moved by its title, closed and opened again: where it was left
  await page.keyboard.press('KeyI');
  const bag = page.locator('.hud-inventory');
  await expect(bag).toBeVisible();
  const at = (await bag.boundingBox())!;
  await page.mouse.move(at.x + 60, at.y + 8);
  await page.mouse.down();
  await page.mouse.move(at.x - 140, at.y + 48, { steps: 4 });
  await page.mouse.up();
  const moved = (await bag.boundingBox())!;
  expect(moved.x).toBeCloseTo(at.x - 200, 0);
  await page.keyboard.press('KeyI');
  await expect(bag).toBeHidden();
  await page.keyboard.press('KeyI');
  await expect(bag).toBeVisible();
  expect((await bag.boundingBox())!).toMatchObject({ x: moved.x, y: moved.y });
  // kept with the screen's size, in the layer's pixels; the Navigator with its size (a WBS_THICKFRAME window)
  const place = await bag.evaluate((el) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('flyffweb.windowRects') ?? '{}'));
  expect(kept.APP_INVENTORY).toMatchObject({ ...place, screen: `${page.viewportSize()!.width}x${page.viewportSize()!.height}` });
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  const all = await page.evaluate(() => JSON.parse(localStorage.getItem('flyffweb.windowRects') ?? '{}'));
  expect(all.APP_NAVIGATOR).toMatchObject({ width: 192, height: 208 });
});
