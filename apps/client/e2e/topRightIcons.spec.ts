// The phone's window shortcuts at the top right (2026-11-10, owner): the Start menu's icons of the important windows, alone,
// with no box or border, smoothed, half the space between them of the first version; one row from the status window to
// the Navigator, the target bar and the quest list under it; a narrow phone keeps the most used. Stats keeps its text.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** The shortcuts in the Start menu's order, and the Client/Icon picture of each. */
const SHORTCUTS = [
  ['Status', 'icon_status'], ['Character', 'icon_character'], ['Bag', 'icon_inventory'], ['Skill', 'icon_skill'],
  ['Quest', 'icon_quest'], ['World Map', 'icon_applet'], ['Messenger', 'icon_messenger'], ['Party', 'icon_troupe'],
] as const;
const LABELS = [...SHORTCUTS.map(([label]) => label), 'Stats'];

type Box = { x: number; y: number; width: number; height: number };

/** The boxes of the visible shortcuts, the toolbar, the status window and the Navigator. */
async function layout(page: Page): Promise<{ labels: string[]; tools: Box; status: Box; navigator: Box }> {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const tools = document.querySelector('.hud-mobile-tools')!;
    const labels = [...tools.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0)
      .map((b) => b.getAttribute('aria-label')!);
    return { labels, tools: box(tools), status: box(document.querySelector('.hud-status')!), navigator: box(document.querySelector('.hud-navigator')!) };
  });
}

test('top-right shortcuts: the important Start-menu icons in one row on the phone, named everywhere', async ({ page, isMobile }, info) => {
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
    await page.screenshot({ path: info.outputPath('top-desktop.png'), clip: top });
    return;
  }
  await expect(tools).toBeVisible();
  let previous: Box | null = null;
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
    // the space between two icons is half the first version's (60 px less the icon)
    if (previous !== null) expect(look.icon.x - (previous.x + previous.width)).toBeCloseTo((60 - look.icon.width) / 2, 1);
    previous = look.icon;
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
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
  expect((await stats.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  // one row between the status window and the Navigator; the target bar under it, the quest list under the target bar
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
  expect(target.y).toBeGreaterThanOrEqual(row.tools.y + row.tools.height);
  const trackerTop = await page.locator('.hud-quest-tracker').evaluate((element) => parseFloat(getComputedStyle(element).top));
  expect(trackerTop).toBeGreaterThanOrEqual(target.y + target.height);
  await page.screenshot({ path: info.outputPath('top-phone.png'), clip: top });

  // an icon's press opens its window
  await tools.getByRole('button', { name: 'Bag', exact: true }).tap();
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await page.locator('.hud-inventory .hud-window-close').tap();

  // a narrower phone keeps the shortcuts that fit, the most used: all of them at 844 and 750, four at 568
  for (const [width, height, labels] of [
    [844, 390, LABELS], [750, 342, LABELS], [568, 320, ['Character', 'Bag', 'Skill', 'Quest', 'Stats']],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__client!.step(1));
    const narrow = await layout(page);
    expect(narrow.labels, `${width}`).toEqual(labels);
    expect(narrow.tools.x, `${width}`).toBeGreaterThanOrEqual(narrow.status.x + narrow.status.width);
    expect(narrow.tools.x + narrow.tools.width, `${width}`).toBeLessThanOrEqual(narrow.navigator.x);
    if (width === 568) await page.screenshot({ path: info.outputPath('top-phone-568.png'), clip: { x: 0, y: 0, width, height: 150 } });
  }
});
