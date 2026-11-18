// The phone's window shortcuts at the top right (2026-11-10, owner): the Start menu's icons of the important windows, alone,
// with no box or border, smoothed; since 2026-11-13 two rows left of the Navigator, 4 px between the icons (owner:
// "reduce the space"), the target bar back at the top centre clear of them, the quest list at the left; since 2026-11-18
// (owner, "2 rows of 5 include pet filter and autoplay") two rows of five, the target bar stepping left of them where the
// centre would meet them. Stats keeps its text, in a third row.

import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** The shortcuts in the Start menu's order, and the Client/Icon picture of each. */
// 2026-11-15 (owner, Guild Siege C2): the Siege Ranking icon first, in Status's place (nine icons in rows of five and four
// failed at 730 px: the target bar over an icon); 2026-11-17 (owner): FlyffWeb's own Start-menu icon (src/icons/), no longer the trophy
const SHORTCUTS = [
  ['Siege Ranking', 'icon_siegeranking'], ['Character', 'icon_character'], ['Bag', 'icon_inventory'], ['Skill', 'icon_skill'],
  ['Quest', 'icon_quest'], ['World Map', 'icon_applet'], ['Messenger', 'icon_messenger'], ['Party', 'icon_troupe'],
  // 2026-11-18 (owner): the client's own Pet Filter and Auto Play, with their own icons (src/icons/bare)
  ['Pet Filter', 'icon_petfilter'], ['Auto Play', 'icon_autoplay'],
] as const;
const LABELS = [...SHORTCUTS.map(([label]) => label), 'Stats'];
/** 2026-11-17 (owner): the Start-menu lines of the client's own windows and their own icons (src/icons/). */
const OWN_ICON_LINES =[['Siege Ranking', 'icon_siegeranking'], ['Auto Play', 'icon_autoplay'], ['Pet Filter', 'icon_petfilter']] as const;

type Box = { x: number; y: number; width: number; height: number };
/** Whether two boxes share any area. */
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The boxes of the visible shortcuts, the toolbar, the icons, the status window, the Navigator and the target bar; and of
 * the other things at the top or under the rows that the icons must leave clear (2026-11-18): the buffs, Auto Play's AUTO
 * button and the Action Slot button, where shown.
 */
async function layout(page: Page): Promise<{
  labels: string[]; tools: Box; icons: Box[]; status: Box; navigator: Box; target: Box | null; others: Record<string, Box>;
}> {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const tools = document.querySelector('.hud-mobile-tools')!;
    const labels = [...tools.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0)
      .map((b) => b.getAttribute('aria-label')!);
    const target = document.querySelector('.hud-target');
    const others: Record<string, Box> = {};
    for (const selector of ['.hud-buffs', '.hud-auto-button', '.hud-action-trigger']) {
      const element = document.querySelector(selector);
      if (element !== null && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden') {
        others[selector] = box(element);
      }
    }
    return {
      others,
      labels, tools: box(tools), icons: [...tools.querySelectorAll('button[data-icon]')].map(box),
      status: box(document.querySelector('.hud-status')!), navigator: box(document.querySelector('.hud-navigator')!),
      target: target !== null && target.getClientRects().length > 0 ? box(target) : null,
    };
  });
}

test('top-right shortcuts: the important Start-menu icons in two rows of five on the phone, named everywhere', async ({ page, isMobile }, info) => {
  await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
    others: [writeAddMonster(aibatt.objectId, aibatt)],
  }));
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  const tools = page.getByRole('toolbar', { name: 'Window shortcuts', includeHidden: true });
  // each shortcut's name is its accessible name and its tooltip, on the desktop too
  for (const name of LABELS) {
    await expect(tools.getByRole('button', { name, exact: true, includeHidden: true })).toHaveAttribute('title', name);
  }
  const size = page.viewportSize()!;
  const top = { x: 0, y: 0, width: size.width, height: 150 };
  if (!isMobile) {
    // the desktop has the task bar's Start menu and hotkeys: no shortcuts at the top right
    await expect(tools).toBeHidden();
    // 2026-11-15 (owner, C2): but the Siege Ranking button, left of the Navigator, opens its window (the website's answer
    // stands in for the route; the Start menu has the line too)
    await page.route('**/api/siege/ranking*', (route) => route.fulfill({
      json: { rows: [{ rank: 1, name: 'Zed', job: 1, guild: 'Alpha', points: 9 }], checkedAt: '2026-11-15T12:00:00+08:00' },
    }));
    const siege = page.locator('.hud-siege-button');
    await expect(siege).toBeVisible();
    // 2026-11-17 (owner): the same own icon as the phone's, without its frame
    await expect(siege).toHaveCSS('background-image', /\/bare\/icon_siegeranking\./);
    await expect(siege).toHaveText('');
    const [siegeBox, navigatorBox] = [(await siege.boundingBox())!, (await page.locator('.hud-navigator').boundingBox())!];
    expect(siegeBox.x + siegeBox.width).toBeLessThanOrEqual(navigatorBox.x);
    await siege.click();
    await expect(page.locator('.hud-sr')).toBeVisible();
    await expect(page.locator('.hud-sr .hud-sr-row')).toContainText('Zed');
    await page.locator('.hud-sr .hud-window-close').click();
    await page.getByRole('button', { name: 'Start' }).click();
    // 2026-11-17 (owner): the client's own windows' Start-menu lines show FlyffWeb's own icons, framed as Client/Icon's
    for (const [name, file] of OWN_ICON_LINES) {
      await expect(page.getByRole('menuitem', { name }).locator('.hud-menu-icon')).toHaveCSS('background-image', new RegExp(`/icons/${file}\\.png`));
    }
    await page.getByRole('menu').screenshot({ path: info.outputPath('start-menu-desktop.png') });
    await page.getByRole('menuitem', { name: 'Siege Ranking' }).click();
    await expect(page.locator('.hud-sr')).toBeVisible();
    await page.screenshot({ path: info.outputPath('top-desktop.png'), clip: top });
    return;
  }
  await expect(tools).toBeVisible();
  let previous: Box | null = null;
  const icons: Box[] = [];
  for (const [name, file] of SHORTCUTS) {
    const button = tools.getByRole('button', { name, exact: true });
    await expect(button).toHaveText('');
    const look = await button.evaluate(async (element) => {
      const style = getComputedStyle(element);
      const icon = element.querySelector<HTMLElement>('.hud-mobile-tool-icon')!;
      const iconStyle = getComputedStyle(icon);
      const url = /^url\("(.*)"\)$/.exec(iconStyle.backgroundImage)?.[1] ?? '';
      const picture = await new Promise<number>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth);
        image.onerror = () => resolve(0);
        image.src = url;
      });
      const { x, y, width, height } = icon.getBoundingClientRect();
      return {
        background: style.backgroundColor, backgroundImage: style.backgroundImage,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        shadow: style.boxShadow, url, picture, rendering: iconStyle.imageRendering, icon: { x, y, width, height },
        devicePixels: width * devicePixelRatio,
        // Chromium lays out in 1/64 CSS px (LayoutUnit): a size is that close to the one asked for, and painted snapped
        layoutUnit: devicePixelRatio / 64,
      };
    });
    // no box, no border: the icon alone
    expect(look.background).toBe('rgba(0, 0, 0, 0)');
    expect(look.backgroundImage).toBe('none');
    expect(look.borders).toEqual(['0px', '0px', '0px', '0px']);
    expect(look.shadow).toBe('none');
    // Client/Icon's picture without its white panel and rim (ui/bare/), loaded (32 x 32), smoothed, at a whole number of
    // device pixels a picture pixel
    expect(look.url).toContain(`/bare/${file}.`);
    expect(look.picture).toBe(32);
    expect(look.rendering).toBe('auto');
    expect(Math.abs(look.devicePixels - Math.round(look.devicePixels))).toBeLessThan(look.layoutUnit);
    expect(Math.round(look.devicePixels) % 32).toBe(0);
    // 2026-11-13 (owner, "reduce the space"): 4 px between two icons of a row, each press area the icon and 4 px
    if (previous !== null && Math.abs(previous.y - look.icon.y) < 1) {
      expect(look.icon.x - (previous.x + previous.width)).toBeCloseTo(4, 1);
    }
    previous = look.icon;
    icons.push(look.icon);
    expect((await button.boundingBox())!.height).toBeCloseTo(look.icon.height + 4, 0);
  }
  // Stats has no Start-menu icon: its text, 14 px at least, no box either, after the icons
  const stats = tools.getByRole('button', { name: 'Stats', exact: true });
  await expect(stats).toHaveText('Stats');
  const statsLook = await stats.evaluate((element) => {
    const style = getComputedStyle(element);
    return { font: parseFloat(style.fontSize), background: style.backgroundColor, border: style.borderTopWidth };
  });
  expect(statsLook.font).toBeGreaterThanOrEqual(14);
  expect(statsLook.background).toBe('rgba(0, 0, 0, 0)');
  expect(statsLook.border).toBe('0px');
  expect((await stats.boundingBox())!.height).toBeGreaterThanOrEqual(32);

  // 2026-11-13 (owner): two rows left of the Navigator, the second an icon and 4 px under the first, column under column;
  // Stats under them; the target bar at the top centre; the quest list at the left, under the status window. 2026-11-18
  // (owner): two rows of five.
  const [first, second] = [icons.slice(0, 5), icons.slice(5)];
  expect([first.length, second.length]).toEqual([5, 5]);
  for (const row of [first, second]) for (const icon of row) expect(icon.y).toBeCloseTo(row[0]!.y, 0);
  expect(second[0]!.y - first[0]!.y).toBeCloseTo(first[0]!.height + 4, 0);
  expect((await stats.boundingBox())!.y).toBeGreaterThanOrEqual(second[0]!.y + second[0]!.height);
  second.forEach((icon, i) => expect(icon.x).toBeCloseTo(first[i]!.x, 0));
  const row = await layout(page);
  expect(row.labels).toEqual(LABELS);
  expect(row.tools.x).toBeGreaterThanOrEqual(row.status.x + row.status.width);
  expect(row.tools.x + row.tools.width).toBeLessThanOrEqual(row.navigator.x);
  const point = (await page.evaluate((id) => window.__client!.screenOf(id), aibatt.objectId))!;
  const canvas = (await page.locator('.world-view canvas').boundingBox())!;
  await page.touchscreen.tap(canvas.x + point[0] * canvas.width, canvas.y + point[1] * canvas.height);
  await page.evaluate(() => window.__client!.step(1));
  await expect(page.locator('.hud-target')).toBeVisible();
  const target = (await page.locator('.hud-target').boundingBox())!;
  expect(target.y).toBeCloseTo(0, 0);
  expect(target.x + target.width / 2).toBeCloseTo(size.width / 2, 0);
  for (const icon of row.icons) expect(overlap(target, icon), 'target over an icon').toBe(false);
  const tracker = await page.locator('.hud-quest-tracker').evaluate((element) => {
    const style = getComputedStyle(element);
    return { top: parseFloat(style.top), left: parseFloat(style.left), font: parseFloat(style.fontSize) };
  });
  expect(tracker.top).toBeGreaterThanOrEqual(row.status.y + row.status.height);
  expect(tracker.left).toBeLessThan(row.status.x + row.status.width);
  expect(tracker.font).toBe(10);
  await page.screenshot({ path: info.outputPath('top-phone.png'), clip: top });

  // an icon's press opens its window
  await tools.getByRole('button', { name: 'Bag', exact: true }).tap();
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await page.locator('.hud-inventory .hud-window-close').tap();
  await tools.getByRole('button', { name: 'Siege Ranking', exact: true }).tap();
  await expect(page.locator('.hud-sr')).toBeVisible();
  await page.locator('.hud-sr .hud-window-close').tap();
  // 2026-11-18 (owner): Pet Filter's and Auto Play's icons open their windows, as the Start menu's lines do
  for (const [name, selector] of [['Pet Filter', '.hud-pet-filter'], ['Auto Play', '.hud-auto-play']] as const) {
    await tools.getByRole('button', { name, exact: true }).tap();
    await expect(page.locator(selector), name).toBeVisible();
    await page.locator(`${selector} .hud-window-close`).tap();
    await expect(page.locator(selector), name).toBeHidden();
  }

  // two rows of five fit every phone: all of them at 844, 750, an iPhone's 730 with its address bar, 667 and 568
  for (const [width, height] of [[844, 390], [750, 342], [730, 320], [667, 375], [568, 320]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__client!.step(1));
    await expectClearTop(page, `${width} x ${height}`);
    if (width === 568 || width === 667) {
      await page.screenshot({ path: info.outputPath(`top-phone-${width}.png`), clip: { x: 0, y: 0, width, height: 150 } });
    }
  }
});

/**
 * All the shortcuts shown, in one block between the status window and the Navigator, and no icon over the target bar, the
 * buffs, the AUTO button or the Action Slot button; the target bar at the top, right of the status window.
 */
async function expectClearTop(page: Page, at: string): Promise<void> {
  const top = await layout(page);
  expect(top.labels, at).toEqual(LABELS);
  expect(top.tools.x, at).toBeGreaterThanOrEqual(top.status.x + top.status.width);
  expect(top.tools.x + top.tools.width, at).toBeLessThanOrEqual(top.navigator.x);
  expect(top.target, at).not.toBeNull();
  expect(top.target!.y, at).toBeCloseTo(0, 0);
  expect(top.target!.x, at).toBeGreaterThanOrEqual(top.status.x + top.status.width);
  for (const icon of top.icons) {
    expect(overlap(top.target!, icon), `${at}: target over an icon`).toBe(false);
    for (const [name, other] of Object.entries(top.others)) expect(overlap(other, icon), `${at}: an icon over ${name}`).toBe(false);
  }
}

// 2026-11-18 (owner): an iPhone held on its side, at its own pixel ratio: 844 x 390 at 3 with the notch's 47 px either side
// and the home bar's 21 px (an iPhone 12 to 14), and 667 x 375 at 2 with none (an iPhone 8 or SE)
for (const { width, height, scale, safe } of [
  { width: 844, height: 390, scale: 3, safe: { left: 47, right: 47, bottom: 21 } },
  { width: 667, height: 375, scale: 2, safe: { left: 0, right: 0, bottom: 0 } },
]) {
  test(`top-right shortcuts on an iPhone of ${width} x ${height} at ${scale}x: two rows of five, clear of the top`, async ({ browser, baseURL, isMobile }, info) => {
    test.skip(!isMobile, 'the phone project only');
    const context = await browser.newContext({
      ...devices['Pixel 7 landscape'], viewport: { width, height }, deviceScaleFactor: scale, baseURL,
    });
    const page = await context.newPage();
    await playGateway(page, createWorldScript({
      playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
      self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
      others: [writeAddMonster(aibatt.objectId, aibatt)],
    }));
    await enterFlaris(page);
    await page.evaluate(() => window.__client!.pause());
    await page.locator('.world').evaluate((element, insets) => {
      const style = (element as HTMLElement).style;
      style.setProperty('--game-safe-left', `${insets.left}px`);
      style.setProperty('--game-safe-right', `${insets.right}px`);
      style.setProperty('--game-safe-bottom', `${insets.bottom}px`);
      window.dispatchEvent(new Event('resize'));
    }, safe);
    await page.evaluate(() => window.__client!.step(1));
    const point = (await page.evaluate((id) => window.__client!.screenOf(id), aibatt.objectId))!;
    const canvas = (await page.locator('.world-view canvas').boundingBox())!;
    await page.touchscreen.tap(canvas.x + point[0] * canvas.width, canvas.y + point[1] * canvas.height);
    await page.evaluate(() => window.__client!.step(1));
    await expect(page.locator('.hud-target')).toBeVisible();
    // the icons at 32 px, 4 px apart: an iPhone's whole pixel ratio draws them at their own size
    const icon = (await page.locator('.hud-mobile-tool-icon').first().boundingBox())!;
    expect(icon.width).toBeCloseTo(32, 1);
    await expectClearTop(page, `iPhone ${width} x ${height}`);
    await page.screenshot({ path: info.outputPath(`top-iphone-${width}.png`), clip: { x: 0, y: 0, width, height: 150 } });
    await context.close();
  });
}
