// 2026-11-12 (owner): on a landscape phone the screen-centre texts (a level up's caption, the server messages) are drawn at
// half their size, and the task bar and the chat above it 20% smaller across and up. The desktop keeps Neuz's sizes.
// A level up from the pretend world server (SETEXPERIENCE) shows both texts: "Congratulations! Level up!" and the line
// about the stat points.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeSetExperience } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

async function levelUp(page: Page): Promise<void> {
  const own = newVagrantOwn();
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, level: 1, own } }), others: [],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writeSetExperience(SELF_ID, 0n, 2, 0, 0)]));
  await expect(page.locator('.hud-caption')).toContainText('Level up', ON_FRAMES);
  await expect(page.locator('.hud-messages')).not.toBeEmpty();
}

/** The scale an element's transform draws it at (its matrix's first number). */
const scaleOf = (page: Page, selector: string): Promise<number> => page.locator(selector).first().evaluate((element) => {
  const transform = getComputedStyle(element).transform;
  return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
});

test('the phone draws the centre texts at half size, the task bar and the chat 20% smaller; the desktop as Neuz', async ({ page, isMobile }, info) => {
  await levelUp(page);
  const line = page.locator('.hud-messages > div').first();
  const lineFont = await line.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const bar = page.locator('.hud-taskbar-strip');
  if (!isMobile) {
    expect(await scaleOf(page, '.hud-caption')).toBe(1);
    expect(await scaleOf(page, '.hud-messages')).toBe(1);
    expect((await line.boundingBox())!.height).toBeCloseTo(12, 0);
    expect((await bar.boundingBox())!.height).toBeCloseTo(48, 0);
    return;
  }
  const { width } = page.viewportSize()!;
  // the caption and the server messages: half size (12 px lines drawn 6 px high)
  expect(await scaleOf(page, '.hud-caption')).toBe(0.5);
  expect(await scaleOf(page, '.hud-messages')).toBe(0.5);
  expect(lineFont).toBe(12);
  expect((await line.boundingBox())!.height).toBeCloseTo(6, 0);
  // the caption's top stays at 184/768 of the HUD's height
  const hud = (await page.locator('.world-hud').boundingBox())!;
  expect((await page.locator('.hud-caption').boundingBox())!.y).toBeCloseTo(hud.y + hud.height * 184 / 768, 0);

  // the task bar: 80% of the width between the gutters (at most 720), its height with it (48 px at 620 wide)
  const barWidth = Math.round(0.8 * Math.min(720, width - 32));
  const barBox = (await bar.boundingBox())!;
  expect(barBox.width).toBeCloseTo(barWidth, 0);
  expect(barBox.height).toBeCloseTo(48 * barWidth / 620, 0);
  expect(barBox.x + barBox.width / 2).toBeCloseTo(width / 2, 0);

  // the chat: as wide as the bar, on it, 20% lower than its 71 px; its line keeps its 16 px (no zoom on an iPhone)
  await page.getByRole('button', { name: 'Chat', exact: true }).tap();
  const chat = page.locator('.hud-chat');
  const chatBox = (await chat.boundingBox())!;
  expect(chatBox.x).toBeCloseTo(barBox.x, 0);
  expect(chatBox.width).toBeCloseTo(barBox.width, 0);
  expect(chatBox.y + chatBox.height).toBeCloseTo(barBox.y, 0);
  expect(chatBox.height).toBeLessThanOrEqual(0.8 * 71 + 1);
  expect(await scaleOf(page, '.hud-chat')).toBe(0.8);
  const input = chat.getByRole('textbox', { name: 'Chat message' });
  expect(await input.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
  await page.screenshot({ path: info.outputPath('phone-sizes.png') });
});
