// 2026-11-12 (owner): a landscape phone's layout. The screen-centre texts (a level up's caption, the server messages) at
// half their size; the task bar smaller (0.56) at the bottom left, the desktop's chat (Neuz's chat window) docked on it; Attack
// 20% bigger in the bottom right corner with four quick slots (bar 8's first slots) round it, as a phone MOBA has its
// skills. The desktop keeps Neuz's sizes. A level up from the pretend world server (SETEXPERIENCE) shows both texts:
// "Congratulations! Level up!" and the line about the stat points.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeSetExperience } from '@flyffweb/testkit';
import { MADRIGAL, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

interface Box { x: number; y: number; width: number; height: number }

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

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** Two round buttons that do not overlap. */
const apart = (a: Box, b: Box) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y) >= (a.width + b.width) / 2;

test('the phone: centre texts at half size, bar and docked desktop chat at the bottom left, Attack 20% bigger with four quick slots; the desktop as Neuz', async ({ page, isMobile }, info) => {
  await levelUp(page);
  const line = page.locator('.hud-messages > div').first();
  const lineFont = await line.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const bar = page.locator('.hud-taskbar-strip');
  if (!isMobile) {
    expect(await scaleOf(page, '.hud-caption')).toBe(1);
    expect(await scaleOf(page, '.hud-messages')).toBe(1);
    expect((await line.boundingBox())!.height).toBeCloseTo(12, 0);
    expect((await bar.boundingBox())!.height).toBeCloseTo(48, 0);
    await expect(page.locator('.hud-quick-slots')).toBeHidden();
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

  // the task bar: 56% of the width between the gutters (0.8, then 30% smaller) (at most 720), its height with it (48 px at 620 wide), at the
  // bottom left
  const barWidth = Math.round(0.56 * Math.min(720, width - 32));
  const barBox = (await bar.boundingBox())!;
  expect(barBox.width).toBeCloseTo(barWidth, 0);
  expect(barBox.height).toBeCloseTo(48 * barWidth / 620, 0);
  expect(barBox.x).toBeCloseTo(0, 0);

  // the chat: the desktop's docked on the bar, as wide, drawn at 0.56, 104 px high (58 on screen), its 12 px text
  const chat = page.locator('.hud-neuz-chat');
  await expect(chat).toBeVisible();
  await expect(page.locator('.hud-chat')).toHaveCount(0);
  const chatBox = (await chat.boundingBox())!;
  expect(chatBox.x).toBeCloseTo(barBox.x, 0);
  expect(chatBox.width).toBeCloseTo(barBox.width, 0);
  expect(chatBox.y + chatBox.height).toBeCloseTo(barBox.y, 0);
  expect(chatBox.height).toBeCloseTo(104 * 0.56, 0);
  expect(await scaleOf(page, '.hud-neuz-chat')).toBe(0.56);
  expect(await chat.evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px');
  await expect(chat.getByRole('radio', { name: 'Chat', exact: true })).toBeVisible();

  // Attack 20% bigger (64 -> 77 px on a phone under 400 px high), in the bottom right corner
  const attack = (await page.locator('.hud-attack').boundingBox())!;
  expect(attack.width).toBeCloseTo(77, 0);
  expect(attack.x + attack.width).toBeCloseTo(width - 16, 0);
  // the four quick slots: 44 px circles round it from its left to its top, none on another, on Attack or on Jump
  const circles = await page.locator('.hud-quick-slot').all();
  expect(circles).toHaveLength(4);
  const boxes = await Promise.all(circles.map(async (circle) => (await circle.boundingBox())!));
  const jump = (await page.locator('.hud-jump').boundingBox())!;
  for (const [i, box] of boxes.entries()) {
    expect(box.width).toBeCloseTo(44, 0);
    expect(apart(box, attack), `circle ${i} clear of Attack`).toBe(true);
    expect(apart(box, jump), `circle ${i} clear of Jump`).toBe(true);
    for (const other of boxes.slice(i + 1)) expect(apart(box, other)).toBe(true);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.x).toBeGreaterThan(barBox.x + barBox.width);
  }
  // the first at Attack's left, the last above it
  expect(centre(boxes[0]!).y).toBeCloseTo(centre(attack).y, 0);
  expect(centre(boxes[3]!).x).toBeCloseTo(centre(attack).x, 0);
  expect(jump.y + jump.height).toBeLessThan(attack.y);
  await page.screenshot({ path: info.outputPath('phone-sizes.png') });
});
