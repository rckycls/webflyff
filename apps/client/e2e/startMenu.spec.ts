// 2026-11-18 (owner, "Start menu is overflowing"): the Start menu on the owner's screens, two desktops (1366 x 768, 1280 x 720,
// the mouse) and two iPhones on their side (844 x 390, 667 x 375, a finger): every line on the screen, above the task bar and
// on the menu's picture, and V15's Communication folder showing its sub-menu (Chatting, Messenger, Couple) beside it, on the
// screen too; Messenger from it opens the Messenger. A picture of each in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

test.setTimeout(120_000);

const DESKTOPS = [{ width: 1366, height: 768 }, { width: 1280, height: 720 }];
const PHONES = [{ width: 844, height: 390 }, { width: 667, height: 375 }];

interface Box { name: string | null; left: number; top: number; right: number; bottom: number }

/** The shown lines of the menus open (the Start menu's and a sub-menu's), and the menu's, the bar's and the screen's edges. */
async function measure(page: Page): Promise<{ lines: Box[]; menu: Box; barTop: number; width: number; height: number }> {
  return page.evaluate(() => {
    const box = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { name: e.getAttribute('aria-label'), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const menu = document.querySelector('.hud-taskbar-menu')!;
    const lines = [...menu.querySelectorAll('[role="menuitem"]')].filter((e) => (e as HTMLElement).offsetParent !== null).map(box);
    const bar = document.querySelector('.hud-taskbar-strip') ?? document.querySelector('.hud-taskbar')!;
    return { lines, menu: box(menu), barTop: bar.getBoundingClientRect().top, width: innerWidth, height: innerHeight };
  });
}

function expectInside(m: Awaited<ReturnType<typeof measure>>, what: string): void {
  for (const line of m.lines) {
    expect(line.left, `${line.name} at ${what}`).toBeGreaterThanOrEqual(-0.5);
    expect(line.right, `${line.name} at ${what}`).toBeLessThanOrEqual(m.width + 0.5);
    expect(line.top, `${line.name} at ${what}`).toBeGreaterThanOrEqual(-0.5);
    expect(line.bottom, `${line.name} at ${what}`).toBeLessThanOrEqual(m.barTop + 0.5);
  }
}

for (const size of [...DESKTOPS, ...PHONES]) {
  test(`the Start menu at ${size.width} x ${size.height}: every line and the Communication sub-menu on the screen`, async ({ page }, info) => {
    const phone = size.width < 1000;
    test.skip(phone !== (info.project.use.hasTouch === true), 'the desktops with the mouse, the phones with a finger');
    await page.setViewportSize(size);
    await playGateway(page);
    await enterFlaris(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const top = await measure(page);
    // eighteen lines: V15's two folders hold Chatting, Messenger, Couple and Party, Guild
    expect(top.lines.map((line) => line.name)).toEqual([
      'Status', 'Character', 'Skills', 'Inventory', 'Backpack', 'Housing', 'Private Shop', 'Quest Diary', 'Motion', 'World Map',
      'Navigator', 'Communication', 'Community', 'Siege Ranking', 'Auto Play', 'Pet Filter', 'Option', 'Log out',
    ]);
    expectInside(top, `${size.width} x ${size.height}`);
    // the lines on the picture: the last line above its bottom edge (26 px at scale 1, drawn smaller or bigger with the menu)
    const last = top.lines[top.lines.length - 1]!;
    expect(last.bottom).toBeLessThan(top.menu.bottom);
    expect(top.menu.top).toBeGreaterThanOrEqual(-0.5);
    await page.screenshot({ path: info.outputPath(`start-menu-${size.width}x${size.height}.png`) });

    await page.getByRole('menuitem', { name: 'Communication', exact: true }).click();
    const submenu = page.getByRole('menu', { name: 'Communication' });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole('menuitem')).toHaveCount(3);
    const open = await measure(page);
    expectInside(open, `${size.width} x ${size.height} with Communication open`);
    const folder = open.lines.find((line) => line.name === 'Communication')!;
    const chatting = open.lines.find((line) => line.name === 'Chatting')!;
    // beside its folder's line, to its right, from its top
    expect(chatting.left).toBeGreaterThanOrEqual(folder.right - 1);
    expect(Math.abs(chatting.top - folder.top)).toBeLessThan(12);
    await page.screenshot({ path: info.outputPath(`start-menu-communication-${size.width}x${size.height}.png`) });

    await submenu.getByRole('menuitem', { name: 'Messenger' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.hud-messenger')).toBeVisible();
  });
}
