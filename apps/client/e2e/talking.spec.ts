import { expect, test } from '@playwright/test';
import { ArReader, ArWriter, NULL_ID, PacketType } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeDelObj, writeSetPointParam } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, SELF_ID, SELF_PLAYER, SQUARE, destPosOf, enterFlaris, groundAt, julia, ownAt, playGateway, self, sentOf, tapMover } from './worldHarness';

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
  // the phone's chat, or the desktop's, Neuz's chat window (2026-11-09)
  const chat = page.locator(isMobile ? '.hud-chat' : '.hud-neuz-chat'), input = chat.getByRole('textbox', { name: 'Chat message' });
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
  // the desktop's is CWndChat's 528 x 128 at the bottom left, on the task bar (WndCommunication.cpp:445-452)
  expect(Math.abs(chatBox.width - (isMobile ? barBox.width : 528))).toBeLessThan(1);
  if (!isMobile) expect(chatBox.height).toBe(128);
  expect(Math.abs(chatBox.y + chatBox.height - barBox.y)).toBeLessThan(1);
  await expect(input).not.toHaveAttribute('placeholder');
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(isMobile ? 24 : 18);
  const shoutBox = (await chat.getByRole(isMobile ? 'button' : 'radio', { name: 'Shout', exact: true }).boundingBox())!;
  expect(shoutBox.height).toBeLessThanOrEqual(isMobile ? 22 : 17);
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
  // the desktop has no Send button: Enter sends (CWndChat, EN_RETURN), and the focus goes back to the world
  const send = async (): Promise<void> => {
    if (isMobile) await chat.getByRole('button', { name: 'Send', exact: true }).click(); else await input.press('Enter');
  };
  await input.fill('Hello Flaris'); await send();
  await expect.poll(() => sentOf(gateway, 0xff0000).length).toBe(1);
  await expect(input).not.toBeFocused();
  if (isMobile) expect(await input.boundingBox()).toEqual(composerBeforeFocus);
  const sentText = () => { const r = new ArReader(sentOf(gateway, 0xff0000).at(-1)!.body); r.bytes(8); return r.string(1024); };
  expect(sentText()).toBe('Hello Flaris');
  gateway.pushCache(script.later([message(SELF_ID, 1, new ArWriter().string('Hello Flaris'))]));
  const log = chat.getByRole('log').first();
  // the desktop writes each line as DPClient.cpp does: "Name : text", "<- [from] text", "[Name] text"
  await expect(log).toContainText(isMobile ? '[nearby] Webby: Hello Flaris' : 'Webby : Hello Flaris');
  await expect(chat.locator('select')).toHaveCount(0);
  await input.fill('/w Rocky Hi'); await send();
  await expect.poll(sentText).toBe('/w Rocky Hi');
  gateway.pushCache(new ArWriter().u32(0xff00d4).string('Rocky').string('Webby').string('Hello back').u32(501).u32(500).i32(0).toBytes());
  await expect(log).toContainText(isMobile ? '[whisper] Rocky → Webby: Hello back' : '<- [Rocky] Hello back');
  gateway.pushCache(script.later([message(SELF_ID, 0xa9, new ArWriter().i32(3).string('Missing'))]));
  // a game line: on the desktop, the System window's (PutString's default style, WndManager.cpp:4166-4172)
  await expect(isMobile ? log : page.locator('.hud-neuz-chat-log .neuz-chat-text')).toContainText('Missing does not exist.');
  // 2026-11-09: a shout shares the anti-spam's clocks (0.7 s and 1 s after a plain line, FuncTextCmd.cpp:1946-2004)
  await page.waitForTimeout(1100);
  await input.fill('/s Anyone here?');
  await send(); await expect.poll(sentText).toBe('/s Anyone here?');
  gateway.pushCache(script.later([message(SELF_ID, 0xd0, new ArWriter().u32(SELF_ID).string('Webby').string('Anyone here?').u32(0xffff99cc))]));
  await expect(log).toContainText(isMobile ? '[shout] Webby: Anyone here?' : '[Webby] Anyone here?');
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

test('the desktop chat: the chat window of Neuz V15 (tabs, Lock, filter, System, anti-spam, macro, Help, resize, move, Escape)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'the phone keeps its own chat');
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [],
  });
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  const chat = page.locator('.hud-neuz-chat'), input = chat.getByRole('textbox', { name: 'Chat message' });
  const log = chat.getByRole('log', { name: 'Chat messages' });
  const sentText = () => { const r = new ArReader(sentOf(gateway, 0xff0000).at(-1)!.body); r.bytes(8); return r.string(1024); };
  // the frame is WndTile300-311, the strip under the line WndChatEdit00_1, 01 and 02
  expect(await chat.locator('.hud-window-frame > div').first().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('wndtile300');
  expect(await chat.locator('.neuz-chat-strip > div').first().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('wndchatedit00_1');
  // Party is disabled out of a party, Guild out of a guild
  await expect(chat.getByRole('radio', { name: 'Party' })).toBeDisabled();
  await expect(chat.getByRole('radio', { name: 'Guild' })).toBeDisabled();
  // a tab puts its prefix in the line and gives it the focus
  await chat.getByRole('radio', { name: 'Shout' }).click();
  await expect(input).toBeFocused(); await expect(input).toHaveValue('/s ');
  await expect(chat.getByRole('radio', { name: 'Shout' })).toHaveAttribute('aria-checked', 'true');
  await input.press('End'); await input.pressSequentially('hello all'); await input.press('Enter');
  await expect.poll(() => sentOf(gateway, 0xff0000).length).toBe(1);
  expect(sentText()).toBe('/s hello all');
  await expect(input).not.toBeFocused();
  // Lock keeps the line's focus after Enter; the Shout tab's empty line takes its prefix again
  await chat.getByRole('checkbox', { name: 'Lock', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused(); await expect(input).toHaveValue('/s ');
  await page.waitForTimeout(1100);
  await input.fill('again'); await input.press('Enter');
  await expect.poll(sentText).toBe('again');
  await expect(input).toBeFocused();
  await chat.getByRole('checkbox', { name: 'Lock', exact: true }).click();
  // ParsingChat: the word filter (Filter_ENG.inc, data/chat.json), and a plain line within 0.7 s of the last refused
  await page.waitForTimeout(1100);
  // the two lines sent at once, so a slow machine still sends the second within 0.7 s
  await page.evaluate(() => {
    const line = document.querySelector<HTMLInputElement>('.hud-neuz-chat input[aria-label="Chat message"]')!;
    for (const text of ['you asshole', 'too fast']) {
      line.focus(); line.value = text;
      line.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
  });
  await expect.poll(sentText).toBe('you *******');
  await expect(log).toContainText('The last message could not be transmitted due to chat spam limitations.');
  expect(sentText()).toBe('you *******');
  // the Shout tab shows General and Shout: a whisper goes to the System window
  gateway.pushCache(new ArWriter().u32(0xff00d4).string('Rocky').string('Webby').string('psst').u32(501).u32(500).i32(0).toBytes());
  gateway.pushCache(script.later([message(SELF_ID, 0xd0, new ArWriter().u32(SELF_ID).string('Webby').string('Anyone?').u32(0xffff99cc))]));
  await expect(log).toContainText('[Webby] Anyone?');
  await expect(log).not.toContainText('psst');
  const system = page.locator('.hud-neuz-chat-log');
  await expect(system.locator('.neuz-chat-text')).toContainText('<- [Rocky] psst');
  // the Chat tab shows every kind, the shout in its own colour
  await chat.getByRole('radio', { name: 'Chat', exact: true }).click();
  await expect(log).toContainText('<- [Rocky] psst');
  expect(await log.locator('.neuz-chat-line', { hasText: 'Anyone?' }).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 153, 204)');
  // "/r " answers the last whisperer
  await input.fill(''); await input.pressSequentially('/r ');
  await expect(input).toHaveValue('/whisper Rocky ');
  await input.fill('');
  // a right-click on a line whispers its sender
  gateway.pushCache(script.later([message(SELF_ID, 0xd0, new ArWriter().u32(SELF_ID).string('Tom').string('wts').u32(0xffff99cc))]));
  await log.locator('.neuz-chat-line', { hasText: '[Tom] wts' }).click({ button: 'right' });
  await expect(input).toHaveValue('/whisper Tom '); await expect(input).toBeFocused();
  // the macro mark carries the line to the task bar (CWndMacroChat): a chat shortcut, which F1 runs, typed in the line too
  await input.fill('see you at the fountain');
  const macro = (await chat.locator('.neuz-chat-macro').boundingBox())!;
  const target = (await page.locator('.hud-slot[data-row="item"][data-slot="0"]').boundingBox())!;
  await page.mouse.move(macro.x + 8, macro.y + 8); await page.mouse.down();
  await page.mouse.move(target.x + 16, target.y + 16, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => sentOf(gateway, 0xffffff0c).length).toBe(1);
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="0"]')).toHaveAttribute('data-kind', 'chat');
  await page.waitForTimeout(1100);
  await input.focus(); await page.keyboard.press('F1');
  await expect.poll(sentText).toBe('see you at the fountain');
  await input.fill('');
  // Help: the Fast Help window, help.inc's text for the chat
  await chat.getByRole('button', { name: 'Help' }).click();
  const help = page.locator('.hud-chat-help');
  await expect(help).toContainText('It is located right above the task bar.');
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toBeHidden();
  // Option: this tab's five checks, its own disabled; Shout off hides the shouts
  await chat.getByRole('button', { name: 'Option' }).click();
  const filter = page.locator('.hud-chat-filter');
  await expect(filter).toBeVisible();
  await expect(filter.getByRole('checkbox', { name: 'General' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('chat-filter.png') });
  await filter.getByRole('checkbox', { name: 'Shout' }).click();
  await expect(log).not.toContainText('Anyone?');
  await filter.locator('.hud-window-close').click();
  await expect(filter).toBeHidden();
  // System shows the System window at the chat's right, its top on the chat's
  await chat.getByRole('checkbox', { name: 'System' }).click();
  await expect(system).toBeVisible();
  const chatBox = (await chat.boundingBox())!, systemBox = (await system.boundingBox())!;
  expect(systemBox.x).toBeCloseTo(chatBox.x + chatBox.width, 0);
  expect(systemBox.y).toBeCloseTo(chatBox.y, 0);
  await page.screenshot({ path: info.outputPath('chat-desktop.png') });
  await chat.screenshot({ path: info.outputPath('chat-window.png') });
  // the right edge dragged 70 px: 64, in 16 px steps; the line follows (OnSize)
  const edge = { x: chatBox.x + chatBox.width - 2, y: chatBox.y + 40 };
  await page.mouse.move(edge.x, edge.y); await page.mouse.down();
  await page.mouse.move(edge.x + 70, edge.y, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await chat.boundingBox())!.width).toBe(592);
  expect((await input.boundingBox())!.width).toBeCloseTo(592 - 10 - 50, 0);
  // a press on the messages moves the window; the move lock keeps it still
  const before = (await chat.boundingBox())!;
  await page.mouse.move(before.x + 200, before.y + 30); await page.mouse.down();
  await page.mouse.move(before.x + 300, before.y - 70, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => Math.round((await chat.boundingBox())!.x)).toBe(Math.round(before.x + 100));
  await chat.getByRole('checkbox', { name: 'Move lock' }).click();
  const locked = (await chat.boundingBox())!;
  await page.mouse.move(locked.x + 200, locked.y + 30); await page.mouse.down();
  await page.mouse.move(locked.x + 300, locked.y + 10, { steps: 4 }); await page.mouse.up();
  expect((await chat.boundingBox())!.x).toBeCloseTo(locked.x, 0);
  // a click on the messages goes to the world under them too (CWndChat::OnLButtonDown): a walk there
  const walks = destPosOf(gateway).length;
  await page.mouse.click(locked.x + 260, locked.y + 30);
  await page.evaluate(() => window.__client!.step(2));
  await expect.poll(() => destPosOf(gateway).length).toBeGreaterThan(walks);
  // Escape, even while typing, closes the window on top, the chat; Enter then does nothing; the Start menu's Chatting
  // opens it again where it was
  const closedAt = (await chat.boundingBox())!;
  await page.keyboard.press('Enter'); await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(chat).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(chat).toBeHidden();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Chatting', exact: true }).click();
  await expect(chat).toBeVisible(); await expect(input).toBeFocused();
  expect((await chat.boundingBox())!.x).toBeCloseTo(closedAt.x, 0);
  // Close closes it too
  await chat.getByRole('button', { name: 'Close' }).click();
  await expect(chat).toBeHidden();
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
