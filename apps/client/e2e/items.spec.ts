import { expect, test } from '@playwright/test';
import { ArWriter, NULL_ID, ShortcutKind } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeDelObj, writeMoverDeath, writeRevival, writeSetPointParam, writeTaskBar } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self, sentOf } from './worldHarness';

test.setTimeout(120_000);
// UPDATE_ITEM UI_NUM (0): a new count. Not UI_COOLTIME (8), which sets the count too but starts the item's cool-down
// (OnUpdateItem, DPClient.cpp:3226-3245; 2026-11-05), and the food's second use would then wait it out
const update = (id: number, count: number): ScriptMessage => ({ objectId: SELF_ID, type: 0x18,
  fields: new ArWriter().u8(0).u8(id).u8(0).u32(count).u32(0).toBytes() });
const equip = (on: boolean): ScriptMessage => ({ objectId: SELF_ID, type: 6,
  fields: new ArWriter().u8(8).u32(0).u8(on ? 1 : 0).u32(21).i32(0).u8(0).bytes(new Uint8Array(3)).i32(-1).toBytes() });
function groundItem(): ScriptMessage {
  const w = new ArWriter().u8(4).u32(2800).u8(4).u32(2800).u16(100)
    .vec3([SQUARE[0] + 1, SQUARE[1], SQUARE[2]]).i16(0).u32(901);
  w.u32(0).u32(2800).u32(0).string('').i16(2).u8(0).i32(0).i32(0).u8(0).i32(0).u32(0).u8(0).i32(0).i32(0)
    .u32(0).u32(0).u32(0).i32(0).i64(0n).u32(0).u8(0).i32(0);
  return { objectId: 901, type: 0xf0, fields: w.toBytes() };
}

test('ground models load and remain pickable on desktop and phone', async ({ page }, info) => {
  const shaderErrors: string[] = [];
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS/.test(message.text())) shaderErrors.push(message.text()); });
  // Exercise the native nReflect material branch with a small, reliably converted item.
  await page.route(/\/data\/itemProps\.[^/]+\.json/i, async route => {
    const response = await route.fetch();
    const props = await response.json() as Array<{ id: number; reflect?: number }>;
    const prop = props.find(prop => prop.id === 2800);
    if (prop) prop.reflect = 1;
    await route.fulfill({ response, json: props });
  });
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [groundItem()],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const drop = page.getByRole('button', { name: /Pick up Lollipop/ });
  // the model downloads and decodes beside the other workers' worlds: a wait on the frame loop (ON_FRAMES), as the world's
  await expect(drop).toHaveClass(/has-drop-model/, ON_FRAMES);
  await expect(drop.locator('img')).toBeHidden();
  await page.screenshot({ path: info.outputPath('ground-model.png') });
  expect(shaderErrors).toEqual([]);
  await drop.click();
  await expect.poll(() => sentOf(gateway, 0xffffff07).some(p => p.body.readUInt32LE(8) === 901)).toBe(true);
  gateway.pushCache(script.later([writeDelObj(901)]));
  await expect(drop).toHaveCount(0);
});

/** A tile of Flaris' ring: two tiles from Webby's, 13_6. */
function ringTile(url: string): boolean {
  const match = /\/worlds\/wdmadrigal\/tiles\/(\d+)_(\d+)\./.exec(url);
  return match !== null && Math.max(Math.abs(Number(match[1]) - 13), Math.abs(Number(match[2]) - 6)) === 2;
}

// Piece 6 M5, part B: on a slow CPU the ring's downloads, right after the world shows, doubled the time a model in view
// took to come (the drop's, 5.4 to 16.4 s at an 8x slowdown); the ring waits for them.
test('the ring of map tiles around the view waits for the models in view', async ({ page }) => {
  const ringAsked: number[] = [];
  page.on('request', (request) => { if (ringTile(request.url())) ringAsked.push(Date.now()); });
  await page.route(/\/assets\/models\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [groundItem()],
  });
  await playGateway(page, script);
  await enterFlaris(page);
  const onScreenAt = (await page.evaluate(() => window.__client!.perf())).onScreenAt!;
  await expect(page.getByRole('button', { name: /Pick up Lollipop/ })).toHaveClass(/has-drop-model/, ON_FRAMES);
  await expect.poll(() => ringAsked.length, ON_FRAMES).toBeGreaterThan(0);
  // every model answers 3 s late: the drop's, asked for as the world showed, came 3 s after it at the earliest
  expect(Math.min(...ringAsked) - onScreenAt).toBeGreaterThan(2_500);
});

test('inventory, item requests, ground pickup and scroll revival wait for server confirmations', async ({ page, isMobile }, info) => {
  const own = newVagrantOwn();
  own.inventory = [{ objectId: 6, itemId: 2800, count: 5 }, { objectId: 7, itemId: 4805, count: 2 },
    { objectId: 8, itemId: 21, count: 1 }, { objectId: 9, itemId: 10431, count: 1 }];
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [groundItem()],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const bag = page.locator('.hud-inventory');
  const cell = (slot: number) => bag.locator(`[data-bag-slot="${slot}"]`);
  const action = (name: string) => bag.locator(`[data-item-action="${name}"]`);
  const openBag = async () => {
    if (isMobile) await page.getByRole('button', { name: 'Bag', exact: true }).tap();
    else await page.keyboard.press('i');
    await expect(bag).toBeVisible();
  };
  const closeBag = async () => { await bag.locator('.hud-window-close').click(); await expect(bag).toBeHidden(); };
  await openBag();
  await expect(bag.locator('[data-bag-slot]')).toHaveCount(42);
  // the preview comes back from the GPU's asynchronous read (Piece 6 M5): under SwiftShader seconds after it is drawn
  await expect(bag.locator('.inventory-preview canvas')).toBeVisible(ON_FRAMES);
  if (isMobile) {
    const rect = await bag.boundingBox(), world = await page.locator('.world-hud').boundingBox();
    expect(rect!.width).toBeLessThanOrEqual(world!.width - 23);
    expect(rect!.width / rect!.height).toBeCloseTo(1.62, 1);
    // Native 32px cells scale with the wide Bag so it can also leave the taskbar reachable.
    expect((await cell(6).boundingBox())!.height).toBeGreaterThanOrEqual(28);
    const taskbar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(taskbar.y);
    const equipment = await bag.locator('.inventory-equipment').boundingBox(), grid = await bag.locator('.inventory-bag').boundingBox();
    expect(equipment!.x + equipment!.width).toBeLessThanOrEqual(grid!.x + 1);
    const scroll = bag.locator('.inventory-bag-scroll');
    expect(await scroll.evaluate((element) => element.clientHeight)).toBe(192);
    const canScroll = await bag.evaluate((element) => {
      const body = element.querySelector<HTMLElement>('.inventory-bag-scroll')!;
      const rect = body.getBoundingClientRect();
      return { x: rect.left + 80, y: rect.top + 100 };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: canScroll.x, y: canScroll.y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, x: canScroll.x, y: canScroll.y - i * 15 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => bag.locator('.inventory-bag-scroll').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => bag.locator('.inventory-bag-scroll').evaluate((element) =>
      Math.abs(element.scrollTop / 32 - Math.round(element.scrollTop / 32)))).toBeLessThan(.01);
    await bag.locator('.inventory-bag-scroll').evaluate((element) => { element.scrollTop = 0; });
    await expect.poll(() => bag.locator('.inventory-bag-scroll').evaluate((element) => element.scrollTop)).toBe(0);
    await cdp.detach();
  }
  await page.screenshot({ path: info.outputPath('inventory.png') });
  if (!isMobile) {
    await cell(6).hover();
    await expect(bag.locator('.inventory-details')).toBeVisible();
    await page.mouse.move(400, 40);
    await expect(bag.locator('.inventory-details')).toBeHidden();
    const scroll = bag.locator('.inventory-bag-scroll');
    await scroll.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(32);
    await page.mouse.wheel(0, -500);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  }
  await cell(6).click();
  await page.screenshot({ path: info.outputPath('item-details.png') });
  if (isMobile) await action('use').click();
  else { await expect(bag.locator('[data-item-action]')).toHaveCount(0); await cell(6).dblclick(); }
  await expect.poll(() => sentOf(gateway, 0xff0021).length).toBe(1);
  expect(sentOf(gateway, 0xff0021)[0]!.body.readUInt32LE(8)).toBe(6 << 16);
  await expect(cell(6)).toContainText('5'); // no reply yet
  gateway.pushCache(script.later([update(6, 4)]));
  await expect(cell(6)).toContainText('4');
  const foodSlot = isMobile ? 6 : 0;
  if (!isMobile) {
    await cell(6).dragTo(cell(0));
    await expect.poll(() => sentOf(gateway, 0xff0006).length).toBe(1);
    await expect(cell(6)).toContainText('4');
    gateway.pushCache(script.later([{ objectId: SELF_ID, type: 4, fields: new ArWriter().u8(0).u8(6).u8(0).toBytes() }]));
    await expect(cell(0)).toContainText('4');
    await cell(0).dragTo(page.locator('.hud-slot[data-row="item"][data-slot="0"]'));
    await expect.poll(() => sentOf(gateway, 0xffffff0c).length).toBe(1);
  } else {
    gateway.pushCache(script.later([writeTaskBar(SELF_ID, { applets: [], items: [{ bar: 0, slot: 0,
      shortcut: { kind: ShortcutKind.ITEM, id: 6, type: 0, index: 0, userId: 0, data: 1, text: '' } }], queue: [], actionPoint: 0 })]));
  }
  await closeBag();
  if (isMobile) await page.locator('.hud-slot[data-row="item"][data-slot="0"]').click();
  else await page.keyboard.press('F1');
  await expect.poll(() => sentOf(gateway, 0xff0021).length).toBe(2);
  gateway.pushCache(script.later([update(6, 0)]));
  await openBag();
  await expect(cell(foodSlot)).toHaveAttribute('aria-label', `Empty slot ${foodSlot + 1}`);
  if (isMobile) { await cell(8).click(); await action('equip').click(); } else await cell(8).dblclick();
  await expect.poll(() => sentOf(gateway, 0xff000b).length).toBe(1);
  await expect(bag.getByRole('button', { name: 'Equipped Wooden Sword' })).toHaveCount(0);
  gateway.pushCache(script.later([equip(true)]));
  await expect(bag.getByRole('button', { name: 'Equipped Wooden Sword' })).toBeVisible();
  if (isMobile) {
    await bag.getByRole('button', { name: 'Equipped Wooden Sword' }).click();
    await expect(bag.locator('[data-item-action]')).toHaveCount(1); await action('unequip').click();
  } else await bag.getByRole('button', { name: 'Equipped Wooden Sword' }).dblclick();
  await expect.poll(() => sentOf(gateway, 0xff000b).length).toBe(2);
  gateway.pushCache(script.later([equip(false)]));
  await expect(bag.getByRole('button', { name: 'Equipped Wooden Sword' })).toHaveCount(0);
  if (isMobile) { await cell(7).click(); await action('drop').click(); }
  else await cell(7).dragTo(page.locator('.world-view canvas'), { targetPosition: { x: 300, y: 400 } });
  const dropDialog = page.getByRole('dialog', { name: 'Drop item', exact: true });
  await expect(dropDialog).toBeVisible();
  await dropDialog.getByLabel('Drop quantity').fill('1'); await dropDialog.getByRole('button', { name: 'Drop', exact: true }).click();
  await expect.poll(() => sentOf(gateway, 0xff0007).length).toBe(1);
  await expect(cell(7)).toContainText('2');
  await closeBag();
  const ground = page.getByRole('button', { name: /Pick up Lollipop/ });
  await expect(ground).toBeVisible();
  await expect(ground).toHaveClass(/has-drop-model/);
  await ground.click();
  await expect.poll(() => sentOf(gateway, 0xffffff07).some((p) => p.body.readUInt32LE(8) === 901)).toBe(true);
  if (isMobile) await page.getByRole('button', { name: /Pick up nearby Lollipop/ }).tap();
  else await page.getByRole('button', { name: /Pick up nearby Lollipop/ }).click();
  await expect(page.getByRole('region', { name: 'Nearby items' })).toBeVisible();
  if (isMobile) {
    const panel = await page.getByRole('region', { name: 'Nearby items' }).boundingBox();
    await expect(page.getByRole('button', { name: 'Jump', exact: true })).toBeVisible();
    const jump = await page.getByRole('button', { name: 'Jump', exact: true }).boundingBox();
    expect(panel!.y + panel!.height <= jump!.y || panel!.x + panel!.width <= jump!.x).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('nearby-items.png') });
  await page.getByRole('button', { name: 'Pick up nearby items' }).click();
  gateway.pushCache(script.later([writeDelObj(901)]));
  await expect(ground).toHaveCount(0);
  gateway.pushCache(script.later([writeMoverDeath(SELF_ID, 0, SELF_ID)]));
  const revive = page.locator('.hud-revive');
  await expect(revive).toBeVisible();
  await expect(revive.locator('[data-button="stand"]')).toBeEnabled();
  await revive.locator('[data-button="stand"]').click();
  await expect.poll(() => sentOf(gateway, 0xff00c0).length).toBe(1);
  gateway.pushCache(script.later([writeRevival(SELF_ID), writeSetPointParam(SELF_ID, 38, 46)]));
  await expect(revive).toBeHidden();
  await page.screenshot({ path: info.outputPath('items.png') });
});
