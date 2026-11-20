// 2026-11-20 (phone-camera-invert, docs/2026-11-20-phone-camera-invert.md): the phone's finger drag turns the camera as the
// phone games do (up looks up, right turns right), and the Option window's "Invert Camera" turns either axis round and
// is kept in the browser. Phone only: the mouse's drag does not read it.

import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, ownAt, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** The camera's height over the own character's feet. */
async function cameraHeight(page: Page): Promise<number> {
  const camera = await page.evaluate(() => window.__client!.camera());
  return camera[1] - (await ownAt(page))[1];
}

/** Where Aibatt is across the screen, 0 (left) to 1 (right). */
async function aibattX(page: Page): Promise<number> {
  const at = await page.evaluate((id) => window.__client!.screenOf(id), aibatt.objectId);
  expect(at).not.toBeNull();
  return at![0];
}

/** One finger on the world's right part (clear of the joystick and the buttons), dragged by (dx, dy), then let go. */
async function drag(page: Page, session: CDPSession, dx: number, dy: number): Promise<void> {
  const size = page.viewportSize()!;
  const start = { id: 7, x: size.width * .65, y: size.height * .4 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + dx / 2, y: start.y + dy / 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + dx, y: start.y + dy }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // the camera's offset closes a quarter of its gap a step
  await page.evaluate(() => window.__client!.step(40));
}

async function toggleInvert(page: Page, which: 'invertCameraUp' | 'invertCameraTurn', shot?: string): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Option', exact: true }).click();
  const option = page.locator('.hud-option');
  await expect(option).toBeVisible();
  await expect(option.locator('[data-static="camera"]')).toHaveText('Invert Camera');
  const box = option.locator(`.hud-six-frame[data-option="${which}"]`);
  const was = await box.getAttribute('aria-checked');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  // the whole window on the screen (the phone's compact panel)
  const panel = (await option.boundingBox())!;
  const size = page.viewportSize()!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(size.width + .5);
  expect(panel.y + panel.height).toBeLessThanOrEqual(size.height + .5);
  if (shot !== undefined) await page.screenshot({ path: test.info().outputPath(`${shot}.png`) });
  await option.locator('.hud-window-close').click();
  await expect(option).toBeHidden();
}

test('phone: a finger dragged up looks up and dragged right turns right; Invert Camera turns each round and is kept', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "the finger drag is the phone's; the desktop's Option window has no Invert Camera");
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
    others: [writeAddMonster(aibatt.objectId, aibatt)],
  });
  await playGateway(page, script);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  await page.evaluate(() => window.__client!.step(40));
  const session = await page.context().newCDPSession(page);

  // the new default: up looks up (the camera goes lower), down looks down (higher)
  let height = await cameraHeight(page);
  await drag(page, session, 0, -60);
  expect(await cameraHeight(page)).toBeLessThan(height - .1);
  height = await cameraHeight(page);
  await drag(page, session, 0, 60);
  expect(await cameraHeight(page)).toBeGreaterThan(height + .1);
  // right turns the view right: what is in front slides left, against the finger (as before)
  let x = await aibattX(page);
  await drag(page, session, 40, 0);
  expect(await aibattX(page)).toBeLessThan(x - .02);
  x = await aibattX(page);
  await drag(page, session, -40, 0);
  expect(await aibattX(page)).toBeGreaterThan(x + .02);

  // Invert Camera, Up/Down: up now looks down; left and right as they were
  await toggleInvert(page, 'invertCameraUp');
  height = await cameraHeight(page);
  await drag(page, session, 0, -60);
  expect(await cameraHeight(page)).toBeGreaterThan(height + .1);
  x = await aibattX(page);
  await drag(page, session, 40, 0);
  expect(await aibattX(page)).toBeLessThan(x - .02);
  // and Left/Right: right now turns left
  await toggleInvert(page, 'invertCameraTurn', 'option-window-invert-camera-phone');
  x = await aibattX(page);
  await drag(page, session, 40, 0);
  expect(await aibattX(page)).toBeGreaterThan(x + .02);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('flyffweb.gameOptions')))!))
    .toMatchObject({ invertCameraUp: true, invertCameraTurn: true });
  await page.screenshot({ path: testInfo.outputPath('phone-camera-invert.png') });

  // both off again: the default back
  await toggleInvert(page, 'invertCameraUp');
  await toggleInvert(page, 'invertCameraTurn');
  height = await cameraHeight(page);
  await drag(page, session, 0, -60);
  expect(await cameraHeight(page)).toBeLessThan(height - .1);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('flyffweb.gameOptions')))!))
    .toMatchObject({ invertCameraUp: false, invertCameraTurn: false });
  await session.detach();
});
