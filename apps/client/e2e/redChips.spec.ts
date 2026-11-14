// 2026-11-15: the Red Chip merchant, Waforu (`SetVenderType(1)`, Resource/character.inc:6383-6440). Needs the data convert
// of the red-chips branch (itemProps' `referValue1`, the chip price). Research: docs/superpowers/specs/2026-11-15-red-chips-research.md.
import { expect, test } from '@playwright/test';
import { ArReader, ArWriter, NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeDefinedText } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, julia, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(120_000);
const II_CHP_RED = 26460;
const BOX = 224882; // II_SYS_SYS_SCR_BXMKNT120SET, 10000 Red Chips
const TID_GAME_LACKCHIP = 3467;
const message = (objectId: number, type: number, fields: ArWriter): ScriptMessage => ({ objectId, type, fields: fields.toBytes() });
function item(objectId: number, itemId: number, count: number): Uint8Array {
  return new ArWriter().u32(objectId).u32(itemId).u32(0).string('').i16(count).u8(0).i32(100).i32(0).u8(0)
    .i32(0).u32(0).u8(0).i32(0).i32(0).u32(0).u32(0).u32(0).i32(0).i64(0n).u32(0).u8(0).i32(0).toBytes();
}
/** OPENSHOPWND: one box in the first tab, at index 1. */
function stock(): ArWriter {
  const w = new ArWriter();
  for (let tab = 0; tab < 4; tab++) {
    for (let i = 0; i < 100; i++) w.u32(tab === 0 && i === 0 ? 1 : NULL_ID);
    w.u8(tab === 0 ? 1 : 0); if (tab === 0) w.u8(1).bytes(item(1, BOX, 99));
    w.bytes(new Uint8Array(400));
  }
  return w;
}

test('red chips: Waforu opens his shop, prices in Red Chips, BUYCHIPITEM, and V15 messages', async ({ page, isMobile }, info) => {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 6, itemId: II_CHP_RED, count: 9999 }, { objectId: 7, itemId: II_CHP_RED, count: 10001 }];
  const vendor = { ...julia, pos: [6965, groundAt(6965, 3324), 3324] as [number, number, number], npc: { ...julia.npc!, characterKey: 'MaFl_Waforu' } };
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddMonster(NPC_ID, vendor)],
  });
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());

  // the menu's Trade is no longer greyed for a chip vendor
  const menu = page.locator('.hud-mover-menu');
  await tapMover(page, NPC_ID); await expect(menu).toBeVisible();
  await expect(menu.locator('[data-menu-entry="2"]')).toBeEnabled();
  await menu.locator('[data-menu-entry="2"]').click(); await expect.poll(() => sentOf(gateway, 0xff00b1).length).toBe(1);
  gateway.pushCache(script.later([message(NPC_ID, 0x14, stock())]));
  const shop = page.locator('.hud-shop'); await expect(shop.locator('[data-stock-id="1"]')).toBeVisible();
  await expect(shop.locator('.shop-tabs button').first()).toHaveText('Mercenary');

  const quantity = async (digit: string): Promise<void> => {
    if (!isMobile) { await shop.getByLabel('Shop quantity').fill(digit); return; }
    await shop.getByRole('button', { name: 'Shop quantity' }).click();
    await shop.locator(`.shop-phone-pad [data-pad-key="${digit}"]`).click();
    await shop.locator('[data-shop-amount="ok"]').click();
    await expect(shop.getByRole('button', { name: 'Shop quantity' })).toHaveText(digit);
  };
  // the tooltip (a hover; a tap on a phone) and the price box say Red Chips
  if (!isMobile) await shop.locator('[data-stock-id="1"]').hover();
  await shop.locator('[data-stock-id="1"]').click();
  await expect(page.locator('.shop-item-details')).toContainText('Price : 10,000 Red Chip');
  await expect(shop.getByLabel('Base item price')).toHaveText('10000');
  await page.screenshot({ path: info.outputPath('red-chips-shop.png') });

  // three boxes are 30000 chips, the bag holds 20000: V15's message box, nothing sent
  await quantity('3');
  await shop.getByRole('button', { name: 'Buy', exact: true }).click();
  const box = page.locator('.hud-message');
  await expect(box).toContainText('More Red Chips are needed.');
  await page.screenshot({ path: info.outputPath('red-chips-not-enough.png') });
  await box.getByRole('button', { name: 'OK' }).click(); await expect(box).toBeHidden();
  expect(sentOf(gateway, 0xff00b6)).toHaveLength(0); expect(sentOf(gateway, 0xff00b3)).toHaveLength(0);

  // two: PACKETTYPE_BUYCHIPITEM, BUYITEM's body (tab, id, count, item), never BUYITEM
  await quantity('2');
  await shop.getByRole('button', { name: 'Buy', exact: true }).click();
  await expect.poll(() => sentOf(gateway, 0xff00b6).length).toBe(1);
  const body = new ArReader(new Uint8Array(sentOf(gateway, 0xff00b6)[0]!.body)); body.u32(); body.u32();
  expect([body.u8(), body.u8(), body.i16(), body.u32()]).toEqual([0, 1, 2, BOX]);
  expect(sentOf(gateway, 0xff00b3)).toHaveLength(0);

  // the server's own refusal (OnBuyChipItem: TID_GAME_LACKCHIP) shows in the shop's line
  gateway.pushCache(script.later([writeDefinedText(SELF_ID, TID_GAME_LACKCHIP)]));
  await expect(shop.locator('.shop-feedback')).toContainText('More Red Chips are needed.');
});
