// Landscape for the whole game (Piece 4 spec §3.10): the cover over a page taller than wide, the lobby's screens and the
// world laid out for a landscape phone (844 x 390 CSS px, Safari's 750 x 342 on an iPhone held on its side, and the phone
// project's Pixel 7, 863 x 360), the touch phone's controls (the joystick, the attack button, a Start menu for a finger, a tall window that
// scrolls above the task bar), and a fight that goes on while the phone is upright (Review Focus 5). The servers, Flaris
// and the helpers are worldHarness.ts's, as world.spec.ts uses them.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { PacketType } from '@flyffweb/protocol';
import { writeDamage } from '@flyffweb/testkit';
import {
  MONSTER_ID, OBJSTA_FMOVE, OBJSTA_MOVE_ALL, OBJSTA_STAND, ON_FRAMES, SELF_ID, enterFlaris, errorPacket, flaris, hpOf, logIn,
  movedState, movesOf, ownAt, playGateway, sentOf, serverList, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

/** The plan's texts of the cover (plan-header's table of texts not from the catalogs). */
const TOUCH_TEXT = 'Turn your device sideways to play.';
const PC_TEXT = 'Make the window wider to play.';

/** A landscape phone (an iPhone 13's screen, 844 x 390 CSS px), the same phone upright, and Safari's view of it on its side. */
const LANDSCAPE = { width: 844, height: 390 };
const UPRIGHT = { width: 390, height: 844 };
const SAFARI_LANDSCAPE = { width: 750, height: 342 };

/** `ERROR_DUPLICATE_ACCOUNT`, the account logged in elsewhere (lobby.spec.ts). */
const DUPLICATE_ACCOUNT = 103;
/** FlyFF with four channels: one to pick, one offline, one full and another to pick. */
const FOUR_CHANNELS = [
  { id: 1, name: 'Channel 1', players: 12, enabled: true }, { id: 2, name: 'Channel 2', players: 0, enabled: false },
  { id: 3, name: 'Channel 3', players: 500, enabled: true }, { id: 4, name: 'Channel 4', players: 40, enabled: true },
];

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen.
test.describe.configure({ timeout: 120_000 });

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
const swingsOf = (gateway: Gateway): number => sentOf(gateway, PacketType.MELEE_ATTACK).length;
const cover = (page: Page): Locator => page.locator('.landscape-cover');
const characterWindow = (page: Page): Locator => page.locator('.hud-character');

/**
 * Turns a touch phone that has entered the world to `size`. Its taps on Log in and Enter asked for full screen (for the
 * orientation lock, landscape.ts), which Chromium's phone grants, and Chromium cannot resize a full-screen window
 * (`Browser.setWindowBounds`). A real phone turns in full screen; this one leaves it first.
 */
async function turn(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.evaluate(async () => {
    if (document.fullscreenElement !== null) await document.exitFullscreen();
  });
  await page.setViewportSize(size);
}

/** The page's whole size: as big as the window when nothing makes it scroll either way. */
async function expectNoScroll(page: Page, what: string): Promise<void> {
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
  }));
  expect(size, `${what} scrolls`).toEqual(page.viewportSize());
}

/** The element's box, which must be drawn. */
async function boxOf(locator: Locator, what: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} is not drawn`);
  return box;
}

/** The element's box is on the screen, whole; above `bottom` (a CSS px line, the screen's bottom unless said). */
async function expectOnScreen(locator: Locator, what: string, bottom?: number): Promise<void> {
  const box = await boxOf(locator, what);
  const { width, height } = locator.page().viewportSize()!;
  const floor = bottom ?? height;
  expect([box.x >= 0, box.y >= 0, box.x + box.width <= width + 0.5, box.y + box.height <= floor + 0.5], `${what} at ${JSON.stringify(box)}`)
    .toEqual([true, true, true, true]);
}

/** Whether a tap at the middle of `locator` lands on it (nothing covers it). */
async function tapLandsOn(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return top !== null && element.contains(top);
  });
}

/** Where the task bar starts, from the top of the page. */
const barTop = async (page: Page): Promise<number> => (await boxOf(page.locator('.hud-taskbar-strip'), 'the task bar')).y;

/** The mobile joystick floats under a real touch; it is hidden before a gesture starts. */
async function holdJoystick(page: Page): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  const point = { id: 1, x: 120, y: page.viewportSize()!.height * .65 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y - 40 }] });
  await expect(page.locator('.joystick')).toBeVisible();
  return async () => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  };
}

test.describe('landscape (spec §3.10)', () => {
  test('the cover shows over the login form while the page is upright, and goes once it is wide again', async ({ page }) => {
    await page.setViewportSize(UPRIGHT);
    await page.goto('/play/');
    const logInButton = page.getByRole('button', { name: 'Log in' });
    await expect(page.getByRole('dialog', { name: isTouch() ? TOUCH_TEXT : PC_TEXT })).toBeVisible();
    await expect(cover(page)).toHaveText(isTouch() ? TOUCH_TEXT : PC_TEXT);
    await expect(cover(page)).toBeFocused();
    // over the form: a tap on Log in lands on the cover
    expect(await tapLandsOn(logInButton)).toBe(false);
    await expectOnScreen(cover(page), 'the cover');

    await page.setViewportSize(LANDSCAPE);
    await expect(cover(page)).toBeHidden();
    expect(await tapLandsOn(logInButton)).toBe(true);
    await expect(logInButton).toBeEnabled();
  });

  // the desktop set to a phone's 844 x 390, the phone project at its own 863 x 360
  test('every lobby screen fits a landscape phone with no scroll', async ({ page }) => {
    if (!isTouch()) await page.setViewportSize(LANDSCAPE);
    await playGateway(page, flaris, {
      certify: (n) => (n === 1 ? errorPacket(DUPLICATE_ACCOUNT) : serverList(FOUR_CHANNELS)),
    });
    await page.goto('/play/');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expectNoScroll(page, 'the login form');

    await logIn(page);
    await expect(page.getByRole('heading', { name: 'Already connected' })).toBeVisible();
    await expectNoScroll(page, 'the already-connected screen');
    await page.getByRole('button', { name: 'Disconnect it' }).click();
    await expect(page.getByRole('status')).toContainText('Log in again');
    await expectNoScroll(page, 'the login form with its status line');

    await page.getByLabel('Password').fill('password1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await expectNoScroll(page, 'the channels');
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();
    await expectNoScroll(page, 'the characters');

    await page.getByRole('button', { name: 'Empty — Create' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create a character in slot 2' })).toBeVisible();
    await expectNoScroll(page, 'the create screen');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter name.');
    await expectNoScroll(page, 'the create screen with a message');
    await expectOnScreen(page.getByRole('button', { name: 'Create', exact: true }), 'Create');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete Webby' }).click();
    await expect(page.getByRole('heading', { name: 'Delete a character' })).toBeVisible();
    await expectNoScroll(page, 'the delete screen');
    await page.getByLabel('Bank PIN').fill('abcd');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('The Bank PIN should be a 4 digit number.');
    await expectNoScroll(page, 'the delete screen with a message');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Enter Webby' }).click();
    await expect(page.getByText('Entering the world…')).toBeVisible();
    await expectNoScroll(page, 'the loading screen');
  });

  test('the world fits 844 x 390 with no scroll: its windows, the task bar and the Start menu on screen', async ({ page }) => {
    test.skip(isTouch(), "the phone's world is measured with its touch controls below");
    await page.setViewportSize(LANDSCAPE);
    await playGateway(page);
    await enterFlaris(page);
    await expectNoScroll(page, 'the world');
    await expectOnScreen(page.locator('.hud-taskbar-strip'), 'the task bar');
    await expectOnScreen(page.locator('.hud-status'), 'the status window');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectOnScreen(page.getByRole('menu'), 'the Start menu');
    await expectOnScreen(page.getByRole('menuitem', { name: 'Log out' }), 'Log out');
    await page.getByRole('menuitem', { name: 'Character' }).click();
    await expect(characterWindow(page)).toBeVisible();
    await expectOnScreen(characterWindow(page).locator('.hud-window-title'), "the Character window's title bar");
    await expectNoScroll(page, 'the world with the Character window');
    // 512 px high, it is cut to the 342 px above the task bar (ruling R26): the bar is not under it, and stays to be pressed
    await expectOnScreen(characterWindow(page), 'the Character window', await barTop(page));
    expect(await tapLandsOn(page.getByRole('button', { name: 'Start' }))).toBe(true);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  // A touch phone held on its side: Safari's 750 x 342 of an iPhone, and the 844 x 390 of a phone in full screen
  for (const size of [SAFARI_LANDSCAPE, LANDSCAPE]) {
    test(`on a touch phone of ${size.width} x ${size.height} the world fits, its joystick and attack button above the task bar`, async ({ page }) => {
      test.skip(!isTouch(), "the joystick and the attack button are a touch screen's");
      await page.setViewportSize(size);
      await playGateway(page);
      await enterFlaris(page);
      await expectNoScroll(page, 'the world');
      const bar = await barTop(page);
      await expectOnScreen(page.locator('.hud-taskbar-strip'), 'the task bar');
      await expectOnScreen(page.locator('.hud-status'), 'the status window', bar);
      await expect(page.locator('.joystick')).toBeHidden();
      const release = await holdJoystick(page);
      await expectOnScreen(page.locator('.joystick'), 'the joystick', bar);
      await expectOnScreen(page.getByRole('button', { name: 'Attack' }), 'the attack button', bar);
      // the joystick (left) and the attack button (right) apart, and the joystick under the status window
      const joystick = await boxOf(page.locator('.joystick'), 'the joystick');
      const attack = await boxOf(page.getByRole('button', { name: 'Attack' }), 'the attack button');
      const status = await boxOf(page.locator('.hud-status'), 'the status window');
      expect(joystick.x + joystick.width).toBeLessThan(attack.x);
      expect(joystick.y).toBeGreaterThanOrEqual(status.y + status.height);
      await release();
    });
  }

  // Ruling R27: the Start menu drawn for a finger, its top edge, its lines and its bottom edge at up to twice their size,
  // each line its whole row; every line of the Windows client kept (the owner's choice, 2026-11-03). Fourteen lines since
  // 2026-11-10 (Private Shop, Chatting, Messenger, Guild ...): in one column a line would be 16 px above 750 x 342's bar,
  // so a touch screen that short stands them in two columns of seven (2026-11-12), each line at least 22 px again
  test('on a touch phone all fourteen Start menu entries fit, in two columns, with contiguous touch targets', async ({ page }) => {
    test.skip(!isTouch(), 'a mouse gets the menu at its size');
    await playGateway(page);
    await enterFlaris(page);
    for (const size of [SAFARI_LANDSCAPE, LANDSCAPE]) {
      await turn(page, size);
      await page.getByRole('button', { name: 'Start' }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expectOnScreen(menu, `the Start menu at ${size.width} x ${size.height}`, await barTop(page));
      const lines = await menu.getByRole('menuitem').evaluateAll((items) => items.map((item) => {
        const box = item.getBoundingClientRect();
        return { left: box.left, top: box.top, bottom: box.bottom, height: box.height };
      }));
      expect(lines).toHaveLength(14);
      for (const line of lines) {
        expect(line.height, `a line at ${size.width} x ${size.height}`).toBeGreaterThanOrEqual(22);
        expect(line.height, `a line at ${size.width} x ${size.height}`).toBeLessThanOrEqual(44.5);
      }
      // two columns of seven, side by side from the same top, each line's row against the next one's
      const [left, right] = [lines.slice(0, 7), lines.slice(7)];
      for (const column of [left, right]) {
        for (let i = 1; i < column.length; i++) expect(column[i]!.top).toBeCloseTo(column[i - 1]!.bottom, 1);
      }
      expect(right[0]!.top).toBeCloseTo(left[0]!.top, 1);
      expect(right[0]!.left).toBeGreaterThan(left[0]!.left + 100);
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(menu).toBeHidden();
    }
  });

  // Ruling R26: a window taller than the room above the task bar is cut to it, and its client area scrolls
  test('on a touch phone of 750 x 342 the wide Character window fits above the taskbar with Apply reachable', async ({ page }) => {
    test.skip(!isTouch(), "a touch phone's, as short as Safari on an iPhone held on its side");
    await page.setViewportSize(SAFARI_LANDSCAPE);
    await playGateway(page);
    await enterFlaris(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Character' }).click();
    const character = characterWindow(page);
    await expect(character).toBeVisible();
    const bar = await barTop(page);
    await expectOnScreen(character, 'the Character window', bar);
    await expect(character).toHaveClass(/hud-character-landscape/);
    const apply = character.locator('[data-button="apply"]');
    await apply.scrollIntoViewIfNeeded();
    await expectOnScreen(apply, 'Apply', bar);
    expect(await tapLandsOn(apply)).toBe(true);
  });

  // A finger held on the joystick as the phone turns upright: the game under the cover is inert, and the finger's let-go may
  // never reach the joystick, so the world screen lets go itself, and the player stops
  test('turning upright lets go of a finger held on the joystick: the player stops under the cover', async ({ page }) => {
    test.skip(!isTouch(), "the joystick is a touch screen's");
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const release = await holdJoystick(page);
    // the waits on the frame loop get 60 s, as world.spec.ts's (ruling R28)
    await expect.poll(() => movesOf(gateway).length, { timeout: 60_000 }).toBeGreaterThan(0);
    expect(movedState(movesOf(gateway).at(-1)!) & OBJSTA_MOVE_ALL).toBe(OBJSTA_FMOVE);

    // the cover shows and goes at the resize, which the page takes between its frames: a wait on the frame loop (R28)
    await turn(page, UPRIGHT);
    await expect(cover(page)).toBeVisible(ON_FRAMES);
    // the stop goes out, with the finger still down
    await expect.poll(() => movedState(movesOf(gateway).at(-1)!) & OBJSTA_MOVE_ALL, { timeout: 60_000 }).toBe(OBJSTA_STAND);
    const stopped = await ownAt(page);
    await page.waitForTimeout(1000);
    expect(await ownAt(page)).toEqual(stopped);
    await release();
    await turn(page, SAFARI_LANDSCAPE);
    await expect(cover(page)).toBeHidden(ON_FRAMES);
    expect(await ownAt(page)).toEqual(stopped);
  });

  // An open window kept where the player put it, inside the screen as it turns (the windows' layer hides what is past
  // its edges): squeezed in while upright, and back where it was once the phone is turned back
  test('a window the player moved stays on the screen as it turns, and goes back where it was', async ({ page }) => {
    test.skip(isTouch(), 'one browser drags the window, with the mouse');
    await page.setViewportSize(LANDSCAPE);
    await playGateway(page);
    await enterFlaris(page);
    await page.keyboard.press('h');
    const character = characterWindow(page);
    await expect(character).toBeVisible();
    // dragged by its title bar to the right edge of the landscape screen
    const title = await boxOf(character.locator('.hud-window-title'), "the Character window's title bar");
    await page.mouse.move(title.x + 40, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(title.x + 40 + 1000, title.y + 10, { steps: 4 });
    await page.mouse.up();
    const placed = await boxOf(character, 'the Character window');
    expect(placed.x + placed.width).toBeCloseTo(LANDSCAPE.width, 0);

    // the open windows are kept on the screen by the first frame after the resize (`refitWindows` in the world screen's
    // `drawHud`), and the page takes the resize between its frames: both waits are on the frame loop (R28). Four workers
    // drawing in software left two or three frames in the 4 to 5.5 s the window took to go back
    await page.setViewportSize(UPRIGHT);
    await expect.poll(async () => (await boxOf(character, 'the Character window')).x + placed.width, ON_FRAMES)
      .toBeLessThanOrEqual(UPRIGHT.width);
    await expectOnScreen(character.locator('.hud-window-title'), "the Character window's title bar, upright");

    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await boxOf(character, 'the Character window')).x, ON_FRAMES).toBeCloseTo(placed.x, 0);
  });

  // Review Focus 5: the phone turned upright in a fight. The cover shows, and nothing behind it pauses: the auto-attack
  // swings on, the server's messages and their numbers are applied, and turning back shows the fight as it went on.
  test('turning upright mid-fight keeps attacking', async ({ page }) => {
    test.skip(isTouch(), "the fight is the desktop's, with the mouse");
    await page.setViewportSize(LANDSCAPE);
    const gateway = await playGateway(page);
    await enterFlaris(page);

    // a tap selects the Aibatt, the next one walks up to it and swings
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(0);
    // the target bar, the cover and the numbers are the frame loop's to draw, and the cover changes at a resize the page
    // takes between its frames: waits on the frame loop (R28)
    await expect(page.locator('.hud-target-info')).toHaveText('100 / 148', ON_FRAMES);

    // upright: the cover is over the fight
    await page.setViewportSize(UPRIGHT);
    await expect(cover(page)).toBeVisible(ON_FRAMES);
    await expect(cover(page)).toHaveText(PC_TEXT);
    const swingsUpright = swingsOf(gateway);
    // the world server's DAMAGE of the own hit (the Aibatt loses 30): applied under the cover, its number drawn
    gateway.pushCache(flaris.later([writeDamage(MONSTER_ID, SELF_ID, 30, 0)]));
    await expect.poll(() => hpOf(page, MONSTER_ID)).toBe(70);
    await expect.poll(() => page.locator('.world-damage-numbers > div').count(), ON_FRAMES).toBeGreaterThan(0);
    // the auto-attack swings on
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(swingsUpright);

    // turned back: the same fight, the Aibatt's HP lowered on its bar, the loop still running, the target still the Aibatt
    await page.setViewportSize(LANDSCAPE);
    await expect(cover(page)).toBeHidden(ON_FRAMES);
    await expect(page.locator('.hud-target-info')).toHaveText('70 / 148', ON_FRAMES);
    const swingsBack = swingsOf(gateway);
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(swingsBack);
    expect(targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });
});
