import { expect, test } from '@playwright/test';
import { PacketType } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import {
  MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, movedState, ownAt, playGateway, self, sentOf, targetsOf,
} from './worldHarness';

test.setTimeout(120_000);

test('camera gestures, jump and phone controls share the world without stray actions', async ({ page, isMobile }, testInfo) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
    others: [writeAddMonster(aibatt.objectId, aibatt)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await expect(page.locator('.hud-fullscreen')).toHaveCount(0);
  await page.evaluate(() => window.__client!.pause());
  const before = await ownAt(page);
  if (isMobile) await page.getByRole('button', { name: 'Jump', exact: true }).tap();
  else {
    await expect(page.locator('.hud-jump')).toBeHidden();
    await expect(page.locator('.hud-attack')).toBeHidden();
    await expect(page.locator('.joystick')).toBeHidden();
    await page.keyboard.press('Space');
  }
  await page.evaluate(() => window.__client!.step(1));
  await expect.poll(() => sentOf(gateway, PacketType.PLAYERBEHAVIOR).some((packet) => (movedState(packet) & 0xf000) === 0x5000)).toBe(true);
  expect((await ownAt(page))[1]).toBeGreaterThan(before[1]);
  await page.evaluate(() => window.__client!.step(120));
  expect((await ownAt(page))[1]).toBeCloseTo(before[1], 3);

  const size = page.viewportSize()!;
  if (!isMobile) {
    await expect(page.getByRole('toolbar', { name: 'Window shortcuts' })).toBeHidden();
    const cameraBefore = await page.evaluate(() => window.__client!.camera());
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => window.__client!.step(10));
    await page.keyboard.up('ArrowRight');
    const cameraAfter = await page.evaluate(() => window.__client!.camera());
    expect(cameraAfter[0]).toBeGreaterThan(cameraBefore[0]);
    const standing = await ownAt(page);
    expect(Math.hypot(standing[0] - before[0], standing[2] - before[2])).toBeLessThan(.01);
    await page.mouse.move(size.width * .6, size.height * .4);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(size.width * .6 + 50, size.height * .4 + 20);
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('.hud-jump')).toBeHidden();
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Space');
    await page.evaluate(() => window.__client!.step(1));
    await page.keyboard.down('KeyD');
    await page.evaluate(() => window.__client!.step(10));
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    expect((await ownAt(page))[0]).toBeLessThan(before[0] - .1);
    expect((await ownAt(page))[1]).toBeGreaterThan(before[1]);
  }
  await page.evaluate(() => window.__client!.step(1));
  expect(targetsOf(gateway)).toEqual([]);
  expect(sentOf(gateway, PacketType.SNAPSHOT)).toEqual([]);
  expect(await page.locator('.world').evaluate((element) => {
    const doubleClick = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    element.dispatchEvent(doubleClick);
    const pinch = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    element.dispatchEvent(pinch);
    return doubleClick.defaultPrevented && pinch.defaultPrevented;
  })).toBe(true);

  if (isMobile) {
    // Nonzero notch insets must protect fixed controls without creating an inaccessible window column.
    await page.locator('.world').evaluate((element) => {
      (element as HTMLElement).style.setProperty('--game-safe-left', '48px');
      (element as HTMLElement).style.setProperty('--game-safe-right', '12px');
      (element as HTMLElement).style.setProperty('--game-safe-bottom', '34px');
      window.dispatchEvent(new Event('resize'));
    });
    await page.evaluate(() => window.__client!.step(0));
    expect((await page.locator('.world-hud').boundingBox())!.x).toBe(0);
    await expect(page.getByRole('button', { name: 'Jump', exact: true })).toBeVisible();
    await expect(page.locator('#overlay pre')).toBeHidden();
    const tools = page.getByRole('toolbar', { name: 'Window shortcuts' });
    await expect(tools).toBeVisible();
    await tools.getByRole('button', { name: 'Skill', exact: true }).tap();
    await expect(page.locator('.hud-skills')).toBeVisible();
    await page.locator('.hud-skills .hud-window-close').tap();
    await expect(page.locator('.hud-skills')).toBeHidden();
    await tools.getByRole('button', { name: 'Character', exact: true }).tap();
    await expect(page.locator('.hud-character')).toBeVisible();
    await page.locator('.hud-character .hud-window-close').tap();
    await expect(page.locator('.hud-character')).toBeHidden();
    await tools.getByRole('button', { name: 'Stats', exact: true }).tap();
    await expect(page.locator('#overlay pre')).toBeVisible();
    await tools.getByRole('button', { name: 'Stats', exact: true }).tap();
    await expect(page.locator('#overlay pre')).toBeHidden();
    expect((await tools.boundingBox())!.x).toBeGreaterThan(size.width / 2);
    const jump = await page.locator('.hud-jump').boundingBox();
    const attack = await page.locator('.hud-attack').boundingBox();
    expect(jump!.y + jump!.height).toBeLessThan(attack!.y);
    const bar = await page.locator('.hud-taskbar').boundingBox();
    expect(bar!.width).toBeLessThanOrEqual(720);
    expect(bar!.x + bar!.width / 2).toBeCloseTo(size.width / 2, 0);
    // A home-indicator safe area lifts the HUD, but must not leave a gap under the taskbar.
    const hud = (await page.locator('.world-hud').boundingBox())!;
    expect(size.height - hud.y - hud.height).toBeCloseTo(34, 0);
    expect(size.height - bar!.y - bar!.height).toBeCloseTo(0, 0);
    expect((await page.locator('.hud-taskbar-strip').boundingBox())!.width).toBeCloseTo(bar!.width, 0);
    const session = await page.context().newCDPSession(page);
    const title = (await page.locator('.hud-status .hud-window-title').boundingBox())!;
    const drag = { id: 9, x: title.x + title.width / 2, y: title.y + title.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [drag] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...drag, x: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await page.locator('.hud-status').boundingBox())!.x).toBe(0);
    const left = { id: 1, x: 100, y: size.height * .65 };
    const right = { id: 2, x: size.width * .65, y: size.height * .35 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, y: left.y - 60 }] });
    const jumpBox = (await page.locator('.hud-jump').boundingBox())!;
    const jumpFinger = { id: 3, x: jumpBox.x + jumpBox.width / 2, y: jumpBox.y + jumpBox.height / 2 };
    const jumpCount = () => sentOf(gateway, PacketType.PLAYERBEHAVIOR).filter((packet) => (movedState(packet) & 0xf000) === 0x5000).length;
    const jumpsBefore = jumpCount();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...left, y: left.y - 60 }, jumpFinger] });
    await page.evaluate(() => window.__client!.step(1));
    await expect.poll(jumpCount).toBe(jumpsBefore + 1);
    expect((await ownAt(page))[1]).toBeGreaterThan(before[1]);
    // CDP touchEnd lists the contacts to release; keep the joystick finger down.
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [jumpFinger] });
    const takeoff = await ownAt(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, x: left.x + 60 }] });
    await page.evaluate(() => window.__client!.step(5));
    const redirected = await ownAt(page);
    expect(redirected[0]).toBeLessThan(takeoff[0] - .3);
    expect(redirected[2]).toBeCloseTo(takeoff[2], 2);
    expect(redirected[1]).toBeGreaterThan(takeoff[1]);
    expect(jumpCount()).toBe(jumpsBefore + 1);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, y: left.y - 60 }] });
    const targetPoint = (await page.evaluate((id) => window.__client!.screenOf(id), aibatt.objectId))!;
    const canvasBox = (await page.locator('.world-view canvas').boundingBox())!;
    const selectFinger = { id: 4, x: canvasBox.x + targetPoint[0] * canvasBox.width, y: canvasBox.y + targetPoint[1] * canvasBox.height };
    const cameraBeforeTap = await page.evaluate(() => window.__client!.camera());
    // Software WebGL can delay CDP replies beyond the tap limit; give this actual tap a fixed 100ms duration.
    const tapTime = Date.now() / 1000;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: tapTime, touchPoints: [{ ...left, y: left.y - 60 }, selectFinger] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: tapTime + .1, touchPoints: [selectFinger] });
    await expect.poll(() => targetsOf(gateway).some(([id]) => id === aibatt.objectId)).toBe(true);
    expect(await page.evaluate(() => window.__client!.camera())).toEqual(cameraBeforeTap);
    await expect(page.locator('.joystick')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...left, y: left.y - 60 }, right] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, y: left.y - 60 }, { ...right, x: right.x + 30 }] });
    await page.evaluate(() => window.__client!.step(10));
    await expect(page.locator('.joystick')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => window.__client!.step(1));
    const after = await ownAt(page);
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(.5);
    expect(targetsOf(gateway).some(([id]) => id === aibatt.objectId)).toBe(true);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await session.detach();
  }
  await page.screenshot({ path: testInfo.outputPath('controls.png') });
});
