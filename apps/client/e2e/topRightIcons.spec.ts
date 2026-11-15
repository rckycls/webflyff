// The phone's window shortcuts at the top right (2026-11-10, owner): the Start menu's icons of the important windows, alone,
// with no box or border, smoothed; since 2026-11-13 two rows of four left of the Navigator, 4 px between the icons (owner:
// "reduce the space"), the target bar back at the top centre clear of them, the quest list at the left. Stats keeps its
// text, in a third row.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** The shortcuts in the Start menu's order, and the Client/Icon picture of each. */
// 2026-11-15 (owner, Guild Siege C2): the Siege Ranking icon (no Start-menu picture: the winner trophy, `null` here) first, in Status's place (nine icons in rows of five and four failed at 730 px: the target bar over an icon)
const SHORTCUTS = [
  ['Siege Ranking', null], ['Character', 'icon_character'], ['Bag', 'icon_inventory'], ['Skill', 'icon_skill'],
  ['Quest', 'icon_quest'], ['World Map', 'icon_applet'], ['Messenger', 'icon_messenger'], ['Party', 'icon_troupe'],
] as const;
const LABELS = [...SHORTCUTS.map(([label]) => label), 'Stats'];

type Box = { x: number; y: number; width: number; height: number };
/** Whether two boxes share any area. */
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The boxes of the visible shortcuts, the toolbar, the icons, the status window, the Navigator and the target bar. */
async function layout(page: Page): Promise<{ labels: string[]; tools: Box; icons: Box[]; status: Box; navigator: Box; target: Box | null }> {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const tools = document.querySelector('.hud-mobile-tools')!;
    const labels = [...tools.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0)
      .map((b) => b.getAttribute('aria-label')!);
    const target = document.querySelector('.hud-target');
    return {
      labels, tools: box(tools), icons: [...tools.querySelectorAll('button[data-icon]')].map(box),
      status: box(document.querySelector('.hud-status')!), navigator: box(document.querySelector('.hud-navigator')!),
      target: target !== null && target.getClientRects().length > 0 ? box(target) : null,
    };
  });
}

test('top-right shortcuts: the important Start-menu icons in two rows of four on the phone, named everywhere', async ({ page, isMobile }, info) => {
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
    const [siegeBox, navigatorBox] = [(await siege.boundingBox())!, (await page.locator('.hud-navigator').boundingBox())!];
    expect(siegeBox.x + siegeBox.width).toBeLessThanOrEqual(navigatorBox.x);
    await siege.click();
    await expect(page.locator('.hud-sr')).toBeVisible();
    await expect(page.locator('.hud-sr .hud-sr-row')).toContainText('Zed');
    await page.locator('.hud-sr .hud-window-close').click();
    await page.getByRole('button', { name: 'Start' }).click();
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
    if (file === null) {
      // the trophy's picture is converted only by the owner: before that its short text sits in an icon-sized button
      const box = (await button.locator('.hud-mobile-tool-icon').boundingBox())!;
      icons.push(box);
      expect((await button.boundingBox())!.height).toBeCloseTo(box.height + 4, 0);
      previous = box;
      continue;
    }
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

  // 2026-11-13 (owner): two rows of four, left of the Navigator, the second an icon and 4 px under the first, column under
  // column; Stats under them; the target bar at the top centre; the quest list at the left, under the status window
  const [first, second] = [icons.slice(0, 4), icons.slice(4)];
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

  // two rows of four fit every phone: all of them at 844, 750, an iPhone's 730 with its address bar, and 568
  for (const [width, height, labels] of [
    [844, 390, LABELS], [750, 342, LABELS], [730, 320, LABELS], [568, 320, LABELS],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__client!.step(1));
    const narrow = await layout(page);
    expect(narrow.labels, `${width}`).toEqual(labels);
    expect(narrow.tools.x, `${width}`).toBeGreaterThanOrEqual(narrow.status.x + narrow.status.width);
    expect(narrow.tools.x + narrow.tools.width, `${width}`).toBeLessThanOrEqual(narrow.navigator.x);
    // the target bar at the top, clear of the icons and of the status window (left of the centre at 640 px and less)
    expect(narrow.target, `${width}`).not.toBeNull();
    for (const icon of narrow.icons) expect(overlap(narrow.target!, icon), `${width}: target over an icon`).toBe(false);
    expect(narrow.target!.x, `${width}`).toBeGreaterThanOrEqual(narrow.status.x + narrow.status.width);
    if (width === 568) await page.screenshot({ path: info.outputPath('top-phone-568.png'), clip: { x: 0, y: 0, width, height: 150 } });
  }
});
