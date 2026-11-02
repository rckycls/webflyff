import { expect, test } from '@playwright/test';
import { PacketType } from '@flyffweb/protocol';
import { enterFlaris, movedState, ownAt, playGateway, sentOf } from './worldHarness';

test.setTimeout(120_000);

test('mobile audit: passive chat permits joystick and second-finger jump; active chat owns its touches', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await page.addInitScript(() => {
    const tracked = window as Window & { fullscreenRequests?: number };
    tracked.fullscreenRequests = 0;
    document.documentElement.requestFullscreen = async () => {
      tracked.fullscreenRequests = (tracked.fullscreenRequests ?? 0) + 1;
    };
  });
  const gateway = await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  await page.locator('.world').evaluate(element => {
    const style = (element as HTMLElement).style;
    style.setProperty('--game-safe-left', '48px');
    style.setProperty('--game-safe-right', '12px');
    style.setProperty('--game-safe-bottom', '34px');
    window.dispatchEvent(new Event('resize'));
  });
  await page.evaluate(() => window.__client!.step(0));
  const session = await page.context().newCDPSession(page);
  const size = page.viewportSize()!;
  const left = { id: 1, x: 100, y: size.height * .65 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, left)).toBe('CANVAS');
  const before = await ownAt(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  const held = { ...left, y: left.y - 60 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [held] });
  await expect(page.locator('.joystick')).toBeVisible();
  await page.evaluate(() => window.__client!.step(5));
  expect(await ownAt(page)).not.toEqual(before);
  const box = (await page.locator('.hud-jump').boundingBox())!;
  const navigator = (await page.locator('.hud-navigator').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(navigator.y + navigator.height);
  const finger = { id: 3, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held, finger] });
  await page.evaluate(() => window.__client!.step(1));
  await expect.poll(() => sentOf(gateway, PacketType.PLAYERBEHAVIOR).some(packet => (movedState(packet) & 0xf000) === 0x5000)).toBe(true);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  const chat = page.locator('.hud-chat');
  const input = chat.getByRole('textbox', { name: 'Chat message' });
  await chat.getByRole('button', { name: 'Chat', exact: true }).tap();
  await expect(input).not.toBeFocused();
  await expect(chat).toHaveAttribute('data-expanded', 'true');
  expect(await chat.locator('.chat-transcript').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('auto');
  await input.tap();
  await expect(input).toBeFocused();
  await input.press('End');
  await expect(page.locator('.hud-jump')).toBeVisible();
  await input.fill('mobile audit');
  // A landscape software keyboard can leave very little vertical room.
  await page.setViewportSize({ width: size.width, height: 160 });
  await page.evaluate(() => window.__client!.step(0));
  const send = chat.getByRole('button', { name: 'Send', exact: true });
  const sendBox = (await send.boundingBox())!;
  expect(sendBox.y).toBeGreaterThanOrEqual(0);
  expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(160);
  const composer = (await chat.boundingBox())!, taskbar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
  expect(Math.abs(composer.y + composer.height - taskbar.y)).toBeLessThan(1);
  await send.tap();
  await expect(input).not.toBeFocused();
  await expect(chat).not.toHaveAttribute('data-expanded');
  await page.setViewportSize(size);
  for (const viewport of [{ width: 750, height: 342 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__client!.step(0));
    const jump = (await page.locator('.hud-jump').boundingBox())!, attack = (await page.locator('.hud-attack').boundingBox())!;
    const map = (await page.locator('.hud-navigator').boundingBox())!, rail = (await chat.locator('form').boundingBox())!;
    expect(jump.y).toBeGreaterThanOrEqual(map.y + map.height);
    expect(jump.y + jump.height).toBeLessThanOrEqual(attack.y);
    expect(attack.y + attack.height).toBeLessThanOrEqual(rail.y + 1);
    await page.screenshot({ path: info.outputPath(`actions-${viewport.width}.png`) });
  }
  expect(await page.evaluate(() => (window as Window & { fullscreenRequests?: number }).fullscreenRequests)).toBe(0);
});

test('mobile audit: Character and Skill stay centered, closeable and above the taskbar across landscape sizes', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  for (const [name, selector] of [['Character', '.hud-character'], ['Skill', '.hud-skills']] as const) {
    await page.getByRole('toolbar', { name: 'Window shortcuts' }).getByRole('button', { name, exact: true }).tap();
    const frame = page.locator(selector);
    for (const size of [{ width: 750, height: 342 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.__client!.step(0));
      await expect(frame).toBeVisible();
      await expect.poll(async () => {
        const rect = (await frame.boundingBox())!, hud = (await page.locator('.world-hud').boundingBox())!;
        return Math.abs(rect.x + rect.width / 2 - hud.x - hud.width / 2);
      }).toBeLessThan(1);
      const rect = (await frame.boundingBox())!, bar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(bar.y + 1);
      const close = frame.locator(':scope > .hud-window-close');
      expect(await close.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      if (size.width === 568) await page.screenshot({ path: info.outputPath(`${name.toLowerCase()}-compact.png`) });
    }
    await frame.locator(':scope > .hud-window-close').tap();
    await expect(frame).toBeHidden();
  }
});

test('mobile audit: Bag stays above the taskbar while resizing', async ({ page, isMobile }, info) => {
  test.skip(!isMobile);
  await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  await page.keyboard.press('KeyI');
  const bag = page.locator('.hud-inventory');
  await expect(bag).toBeVisible();
  for (const size of [{ width: 750, height: 342 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.__client!.step(0));
    const rect = (await bag.boundingBox())!, bar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
    expect(rect.y + rect.height).toBeLessThanOrEqual(bar.y);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
    expect(rect.width / rect.height).toBeCloseTo(1.62, 1);
    await page.screenshot({ path: info.outputPath(`bag-${size.width}.png`) });
  }
});
