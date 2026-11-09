// The phone's window shortcuts at the top right (2026-11-10, owner): the Start menu's icons of their windows, alone, with no
// box or border, sharp, and presses at least as tall as the text buttons they replace; Stats keeps its text.

import { expect, test } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

test.setTimeout(120_000);

const ICONS = [['Skill', 'icon_skill'], ['Bag', 'icon_inventory'], ['Character', 'icon_character']] as const;

test('top-right shortcuts: Start-menu icons alone on the phone, named everywhere', async ({ page, isMobile }, info) => {
  await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  const tools = page.getByRole('toolbar', { name: 'Window shortcuts', includeHidden: true });
  // each shortcut's name is its accessible name and its tooltip, on the desktop too
  for (const name of [...ICONS.map(([label]) => label), 'Stats']) {
    await expect(tools.getByRole('button', { name, exact: true, includeHidden: true })).toHaveAttribute('title', name);
  }
  const size = page.viewportSize()!;
  const corner = { x: size.width - 420, y: 0, width: 420, height: 140 };
  if (!isMobile) {
    // the desktop has the task bar's Start menu and hotkeys: no shortcuts at the top right
    await expect(tools).toBeHidden();
    await page.screenshot({ path: info.outputPath('top-right-desktop.png'), clip: corner });
    return;
  }
  await expect(tools).toBeVisible();
  for (const [name, file] of ICONS) {
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
      return {
        background: style.backgroundColor, backgroundImage: style.backgroundImage,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        shadow: style.boxShadow, url, picture, rendering: iconStyle.imageRendering,
        devicePixels: icon.getBoundingClientRect().width * devicePixelRatio,
        // Chromium lays out in 1/64 CSS px (LayoutUnit): a size is that close to the one asked for, and painted snapped
        layoutUnit: devicePixelRatio / 64,
      };
    });
    // no box, no border: the icon alone
    expect(look.background).toBe('rgba(0, 0, 0, 0)');
    expect(look.backgroundImage).toBe('none');
    expect(look.borders).toEqual(['0px', '0px', '0px', '0px']);
    expect(look.shadow).toBe('none');
    // Client/Icon's picture of the window without its white panel and rim (ui/bare/), loaded (32 x 32), drawn a whole
    // number of device pixels a picture pixel, unsmoothed
    expect(look.url).toContain(`/bare/${file}.`);
    expect(look.picture).toBe(32);
    expect(look.rendering).toBe('pixelated');
    expect(Math.abs(look.devicePixels - Math.round(look.devicePixels))).toBeLessThan(look.layoutUnit);
    expect(Math.round(look.devicePixels) % 32).toBe(0);
    // a press at least as tall as the 32 px text buttons and wider than Skill's and Bag's were
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(60);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  }
  // Stats has no Start-menu icon: its text, 14 px at least, no box either
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
  await page.screenshot({ path: info.outputPath('top-right-phone.png'), clip: corner });
  // an icon's press opens its window
  await tools.getByRole('button', { name: 'Bag', exact: true }).tap();
  await expect(page.locator('.hud-inventory')).toBeVisible();
});
