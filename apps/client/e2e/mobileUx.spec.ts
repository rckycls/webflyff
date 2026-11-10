// The owner's phone fixes of 2026-11-10 (mobile-ux-fixes): the bag's buttons close its tooltip; the bag scrolls a row at
// a time under its fixed dividers, with nothing beside its close button; the Skill window's first and second job sections
// have their arrows; Attack and Jump wear the windows' colours. The desktop keeps its own bag, Skill window and buttons.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, OwnCharacter, SkillSlot } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import { MADRIGAL, MONSTER_ID, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, playGateway, self, sentOf } from './worldHarness';

test.setTimeout(120_000);

/** The Magician's and the Elementor's skills (`skillPlaces.ts`), all of them, as a job change gives them. */
const MAGICIAN = [121, 107, 64, 69, 118, 119, 120, 65, 70, 32, 34, 36, 30, 31, 33, 35, 37];
const ELEMENTOR = [168, 174, 180, 171, 177, 170, 176, 182, 173, 179, 183, 185, 184, 186, 169, 175, 181, 172, 178];
/** `JOB_ELEMENTOR` (`Resource/defineJob.h`). */
const JOB_ELEMENTOR = 13;

/** Webby, an Elementor at 70 with every skill of the line, and a bag of 40 items (7 rows: one more than the phone shows). */
function elementor(): OwnCharacter {
  const own = newVagrantOwn();
  const ids = [1, 2, 3, ...MAGICIAN, ...ELEMENTOR];
  const skills: SkillSlot[] = own.skills.map((_, i) => ({ skill: ids[i] ?? NULL_ID, level: 0 }));
  const kept = (own.inventory ?? []).filter((item) => item.objectId >= 42 || item.objectId < 3);
  const extra: InventoryItem[] = [];
  for (let id = 3; id < 40; id++) extra.push({ objectId: id, itemId: id % 2 === 0 ? 4805 : 2800, count: id });
  return { ...own, skillPoint: 30, skills, inventory: [...kept, ...extra].sort((a, b) => a.objectId - b.objectId) };
}

async function enter(page: Page) {
  const own = elementor();
  const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, job: JOB_ELEMENTOR, level: 70, own, sta: own.sta, dex: own.dex } };
  const gateway = await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby), others: [writeAddMonster(MONSTER_ID, aibatt)],
  }));
  await enterFlaris(page);
  return gateway;
}

const shortcut = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Window shortcuts', includeHidden: true }).getByRole('button', { name, exact: true });

test('the phone bag: its buttons close the tooltip, it scrolls a row at a time, nothing beside its close button', async ({ page, isMobile }, info) => {
  const gateway = await enter(page);
  const bag = page.locator('.hud-inventory');
  const details = bag.locator('.inventory-details');
  const navigator = page.locator('.hud-navigator');
  const visibility = () => navigator.evaluate((element) => getComputedStyle(element).visibility);
  if (!isMobile) {
    // the desktop: the tooltip follows the mouse, the Navigator stays beside the bag
    await page.keyboard.press('i');
    await expect(bag).toBeVisible();
    await bag.locator('[data-bag-slot="0"]').hover();
    await expect(details).toBeVisible();
    await expect(details.locator('[data-item-action]')).toHaveCount(0);
    await page.mouse.move(400, 40);
    await expect(details).toBeHidden();
    expect(await visibility()).toBe('visible');
    return;
  }
  await expect(navigator).toBeVisible();
  await shortcut(page, 'Bag').click();
  await expect(bag).toBeVisible();
  // the Navigator, which stood at the bag's top right with its close button, hides with the bag, and comes back after
  expect(await visibility()).toBe('hidden');
  // the title is the picture's own up to its rounded end: not the PC window's right frame and shadow, stretched
  const title = await bag.locator('.hud-window-title').evaluate((element) => {
    const style = getComputedStyle(element);
    return { size: parseFloat(style.backgroundSize), corner: style.borderTopRightRadius };
  });
  expect(title.size).toBeGreaterThan(102);
  expect(title.corner).toBe('6px');
  await page.screenshot({ path: info.outputPath('bag.png') });

  // Equip: the request goes, the tooltip closes
  await bag.locator('[data-bag-slot="0"]').click();
  await expect(details).toBeVisible();
  await details.locator('[data-item-action="equip"]').click();
  await expect.poll(() => sentOf(gateway, PacketType.DOEQUIP).length).toBe(1);
  await expect(details).toHaveCount(0);
  // Drop: the quantity box in its place
  await bag.locator('[data-bag-slot="3"]').click();
  await expect(details).toBeVisible();
  await details.locator('[data-item-action="drop"]').click();
  await expect(details).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Drop item', exact: true }).getByRole('button', { name: 'Cancel' }).click();
  // a tap on the item opens the tooltip again
  await bag.locator('[data-bag-slot="3"]').click();
  await expect(details).toBeVisible();
  await details.locator('.inventory-details-close').click();
  await expect(details).toHaveCount(0);

  // a finger's drag: the items move a whole row at a time, the dividers' picture not at all
  const scroll = bag.locator('.inventory-bag-scroll');
  const state = () => page.evaluate(() => ({
    top: document.querySelector('.inventory-bag-scroll')!.scrollTop,
    art: document.querySelector('.inventory-mobile-grid-art')!.getBoundingClientRect().top,
    cell: document.querySelector('[data-bag-slot="0"]')!.getBoundingClientRect().top,
  }));
  const start = await state();
  const box = (await scroll.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height * .8;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
  const tops = new Set<number>();
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y: y - i * 7 }] });
    const now = await state();
    expect(now.top % 32).toBe(0);
    expect(now.art).toBe(start.art);
    tops.add(now.top);
  }
  await page.screenshot({ path: info.outputPath('bag-dragged.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect([...tops]).toEqual(expect.arrayContaining([32]));
  expect((await state()).top).toBe(32);
  expect((await state()).art).toBe(start.art);

  await bag.locator('.hud-window-close').click();
  await expect(bag).toBeHidden();
  expect(await visibility()).toBe('visible');
});

test('the Skill window: the first and second jobs\' sections have their arrows on the phone, under the skills', async ({ page, isMobile }, info) => {
  await enter(page);
  const tree = page.locator('.hud-skills');
  if (isMobile) await shortcut(page, 'Skill').click();
  else await page.keyboard.press('k');
  await expect(tree).toBeVisible();
  if (!isMobile) {
    // the desktop: the job panels' pictures, no arrows of the phone's
    await expect(tree.locator('.hud-skills-tree')).toHaveCount(0);
    await expect(tree.locator('.hud-skills-job-panel')).toBeVisible();
    await expect(tree.locator('.hud-skills-pro-panel')).toBeVisible();
    return;
  }
  await expect(tree.locator('.hud-skills-job-panel, .hud-skills-pro-panel')).toHaveCount(2);
  for (const section of [1, 2]) {
    const links = tree.locator(`.hud-skills-tree[data-section="${section}"] [data-link]`);
    expect(await links.count()).toBeGreaterThan(10);
  }
  // Mental Strike leads to Blinkpool and the five first element skills; Firebird to Burningfield; the masters have none
  const named = await tree.locator('[data-link]').evaluateAll((links) => links.map((link) => link.getAttribute('data-link')));
  expect(named).toEqual(expect.arrayContaining(['121>107', '121>64', '121>69', '121>118', '121>119', '121>120', '168>170', '170>183', '176>183']));
  expect(named.some((name) => /^\d+>(169|172|175|178|181)$/.test(name ?? ''))).toBe(false);
  // each skill of a section inside it, none over another
  const boxes = await tree.locator('.hud-skill').evaluateAll((skills) => skills.map((skill) => {
    const rect = skill.getBoundingClientRect();
    return { id: (skill as HTMLElement).dataset.skill, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart = a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5;
      expect(apart, `${a.id} and ${b.id} overlap`).toBe(true);
    }
  }
  for (const section of [1, 2]) {
    const panel = (await tree.locator(`.hud-skills-panel[data-section="${section}"]`).boundingBox())!;
    const ids = section === 1 ? MAGICIAN : ELEMENTOR;
    for (const skill of boxes.filter((b) => ids.includes(Number(b.id)))) {
      expect(skill.left).toBeGreaterThanOrEqual(panel.x);
      expect(skill.right).toBeLessThanOrEqual(panel.x + panel.width + .5);
      expect(skill.bottom).toBeLessThanOrEqual(panel.y + panel.height + .5);
    }
  }
  // the arrows take no press: a finger at any skill's centre lands on that skill
  const missed = await tree.locator('.hud-skill').evaluateAll((skills) => skills.filter((skill) => {
    const rect = skill.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.hud-skill') !== skill;
  }).map((skill) => (skill as HTMLElement).dataset.skill));
  expect(missed).toEqual([]);
  await page.screenshot({ path: info.outputPath('skills.png') });
});

test('Attack and Jump wear the windows\' colours, their size and place unchanged', async ({ page, isMobile }, info) => {
  await enter(page);
  const attack = page.locator('.hud-attack'), jump = page.locator('.hud-jump');
  if (!isMobile) {
    await expect(attack).toBeHidden();
    await expect(jump).toBeHidden();
    return;
  }
  await expect(attack).toBeVisible();
  await expect(jump).toBeVisible();
  const size = page.viewportSize()!;
  const short = size.height <= 400;
  for (const [button, width, right] of [[attack, short ? 64 : 80, 16], [jump, short ? 44 : 52, short ? 26 : 30]] as const) {
    const look = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, background: style.backgroundImage, shadow: style.boxShadow };
    });
    expect(look.border).toBe('rgb(219, 169, 140)');
    expect(look.background).toContain('rgb(255, 250, 244)');
    expect(look.background).toContain('rgb(226, 179, 148)');
    expect(look.shadow).toContain('rgb(121, 84, 49)');
    const box = (await button.boundingBox())!;
    expect(box.width).toBeCloseTo(width, 0);
    expect(box.height).toBeCloseTo(width, 0);
    expect(size.width - (box.x + box.width)).toBeCloseTo(right, 0);
  }
  await page.screenshot({ path: info.outputPath('attack-jump.png'), clip: { x: size.width - 200, y: size.height - 260, width: 200, height: 260 } });
});
