// 2026-11-12 (closed beta): a bag item and a skill put on the task bar's item row with a finger. The desktop drags them
// there (InventoryWindow.onDrop, CWndSkillTreeEx::OnMouseMove then CWndTaskBar::OnDropIcon); the landscape phone, which
// has no drag, taps the bag item's Task bar button (or the Skill window's), then the slot. Either way the browser sends the
// one ADDITEMTASKBAR (CDPClient::SendAddItemTaskBar). The pretend world server and Flaris are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { PacketType, ShortcutKind, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, OwnCharacter, WorldPacket } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import {
  MADRIGAL, MALE_VAGRANT, MONSTER_ID, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, playGateway, self, sentOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

/** Webby at level 5 with Clean Hit at level 1 (slot 0 of `m_aJobSkill`), and the new Vagrant's bag. */
function webby(): OwnCharacter {
  const own = newVagrantOwn();
  return { ...own, skills: own.skills.map((slot, i) => (i === 0 ? { ...slot, level: 1 } : slot)) };
}

async function enter(page: Page): Promise<Gateway> {
  const own = webby();
  const mover: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, level: 5, own, sta: own.sta, dex: own.dex } };
  const gateway = await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, mover),
    others: [writeAddMonster(MONSTER_ID, aibatt)],
  }), { listed: { level: 5, equipment: [...MALE_VAGRANT, 21] } });
  await enterFlaris(page);
  return gateway;
}

const addItemTaskBar = (gateway: Gateway): Array<Extract<WorldPacket, { type: 'addItemTaskBar' }>> =>
  sentOf(gateway, PacketType.ADDITEMTASKBAR)
    .map((s) => decodeWorldPacket(new Uint8Array(s.body)))
    .filter((p): p is Extract<WorldPacket, { type: 'addItemTaskBar' }> => p.type === 'addItemTaskBar');

const itemSlot = (page: Page, slot: number): Locator => page.locator(`.hud-slot[data-row="item"][data-slot="${slot}"]`);
const lit = (page: Page, row: string): Locator => page.locator(`.hud-taskbar-lit[data-row="${row}"]`);
const shortcut = (page: Page, name: string): Locator =>
  page.getByRole('toolbar', { name: 'Window shortcuts', includeHidden: true }).getByRole('button', { name, exact: true });

/** The mouse's drag from `from` to `to`, by its button (the bar's own gestures, not the bag's HTML drag). */
async function mouseDrag(page: Page, from: Locator, to: Locator): Promise<void> {
  const centre = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const a = await centre(from);
  const b = await centre(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test('a bag item onto F2: the desktop drags it, the phone taps its Task bar button then the slot; ADDITEMTASKBAR either way', async ({ page, isMobile }, info) => {
  const gateway = await enter(page);
  const bag = page.locator('.hud-inventory');
  const slot = itemSlot(page, 1);
  if (isMobile) {
    await shortcut(page, 'Bag').tap();
    await expect(bag).toBeVisible();
    // the bag stops above the bar, whose slots stay in reach
    const bagBox = (await bag.boundingBox())!;
    const barBox = (await page.locator('.hud-taskbar-strip').boundingBox())!;
    expect(bagBox.y + bagBox.height).toBeLessThanOrEqual(barBox.y + 1);
    await bag.locator('[data-bag-slot="2"]').tap();
    const details = bag.locator('.inventory-details');
    await expect(details).toBeVisible();
    await details.locator('[data-item-action="taskbar"]').tap();
    await expect(details).toHaveCount(0);
    // picked, the bag closed (it covers the quick slots): the item row lit, not the action slot; nothing sent yet
    await expect(bag).toBeHidden();
    await expect(lit(page, 'item')).toBeVisible();
    await expect(lit(page, 'queue')).toBeHidden();
    await page.screenshot({ path: info.outputPath('phone-bag-picked.png') });
    expect(addItemTaskBar(gateway)).toEqual([]);
    await slot.tap();
  } else {
    await page.keyboard.press('i');
    await expect(bag).toBeVisible();
    await bag.locator('[data-bag-slot="2"]').dragTo(slot);
  }
  await expect.poll(() => addItemTaskBar(gateway)).toEqual([{
    type: 'addItemTaskBar', bar: 0, slot: 1,
    shortcut: { kind: ShortcutKind.ITEM, id: 2, type: 0, index: 1, userId: 0, data: 1, text: '' },
  }]);
  await expect(slot).toHaveAttribute('data-kind', 'item');
  await expect(lit(page, 'item')).toBeHidden();
});

test('a skill onto F3: the desktop drags it, the phone taps the Skill window\'s Task bar button then the slot; ADDITEMTASKBAR either way', async ({ page, isMobile }, info) => {
  const gateway = await enter(page);
  const tree = page.locator('.hud-skills');
  const cleanHit = tree.locator('.hud-skill[data-skill="1"]');
  const slot = itemSlot(page, 2);
  if (isMobile) {
    await shortcut(page, 'Skill').tap();
    await expect(tree).toBeVisible();
    const button = tree.locator('[data-button="taskbar"]');
    await expect(button).toHaveText('Task bar');
    await expect(button).toBeDisabled();
    // a tap chooses Clean Hit and picks it (the tap's own pick, which the button shows); a second tap lets it go
    await cleanHit.tap();
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await cleanHit.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(lit(page, 'item')).toBeHidden();
    // the button picks the chosen skill and closes the window (it covers the quick slots): the rows it may go to lit
    await button.tap();
    await expect(tree).toBeHidden();
    await expect(lit(page, 'item')).toBeVisible();
    await page.screenshot({ path: info.outputPath('phone-skill-picked.png') });
    expect(addItemTaskBar(gateway)).toEqual([]);
    await slot.tap();
  } else {
    await page.keyboard.press('k');
    await expect(tree).toBeVisible();
    await expect(tree.locator('[data-button="taskbar"]')).toHaveCount(0);
    await mouseDrag(page, cleanHit, slot);
  }
  await expect.poll(() => addItemTaskBar(gateway)).toEqual([{
    type: 'addItemTaskBar', bar: 0, slot: 2,
    shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: 2, userId: 0, data: 1, text: '' },
  }]);
  await expect(slot).toHaveAttribute('data-kind', 'skill');
  await expect(slot).toHaveAttribute('aria-label', 'Clean Hit');
});

// 2026-11-12 (owner): the phone's quick slots round Attack are bar 8's first four (TaskBar.quickSlots): a bag item and a skill
// put there the same way (the Task bar buttons, then a tap on a circle), ADDITEMTASKBAR for bar 8; a tap on a filled
// circle uses it; a finger held on it offers Remove (REMOVEITEMTASKBAR for bar 8)
test('the phone: a bag item and a skill onto the quick slots by Attack (bar 8), one used, one taken off', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'the quick slots are the phone\'s');
  const gateway = await enter(page);
  const circle = (i: number): Locator => page.locator(`.hud-quick-slot[data-slot="${i}"]`);
  const quick = page.locator('.hud-quick-slots');
  // the potion (bag slot 2) onto the circle at Attack's left
  await shortcut(page, 'Bag').tap();
  await page.locator('.hud-inventory [data-bag-slot="2"]').tap();
  await page.locator('.hud-inventory [data-item-action="taskbar"]').tap();
  await expect(quick).toHaveAttribute('data-lit', '');
  await circle(0).tap();
  await expect.poll(() => addItemTaskBar(gateway)).toEqual([{
    type: 'addItemTaskBar', bar: 7, slot: 0,
    shortcut: { kind: ShortcutKind.ITEM, id: 2, type: 0, index: 0, userId: 0, data: 1, text: '' },
  }]);
  await expect(circle(0)).toHaveAttribute('data-kind', 'item');
  await expect(quick).not.toHaveAttribute('data-lit');
  // Clean Hit onto the circle above Attack, from the Skill window's Task bar button
  await shortcut(page, 'Skill').tap();
  await page.locator('.hud-skills .hud-skill[data-skill="1"]').tap();
  await page.locator('.hud-skills [data-button="taskbar"]').tap();
  await circle(3).tap();
  await expect.poll(() => addItemTaskBar(gateway).length).toBe(2);
  expect(addItemTaskBar(gateway)[1]).toEqual({
    type: 'addItemTaskBar', bar: 7, slot: 3,
    shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: 3, userId: 0, data: 1, text: '' },
  });
  await expect(circle(3)).toHaveAttribute('aria-label', 'Clean Hit');
  // the bar shown (bar 1) is left as it was
  await expect(itemSlot(page, 0)).not.toHaveAttribute('data-kind', 'item');
  await page.screenshot({ path: info.outputPath('phone-quick-slots.png') });
  // a tap on the potion's circle uses it (DOUSEITEM, as F-key on the bar would)
  const used = () => sentOf(gateway, PacketType.DOUSEITEM).length;
  const before = used();
  await circle(0).tap();
  await expect.poll(used).toBe(before + 1);
  // held: Remove takes it off
  const box = (await circle(0).boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const finger = { id: 5, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  await page.waitForTimeout(700);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(used).toBe(before + 1);
  const remove = page.locator('.hud-quick-remove');
  await expect(remove).toBeVisible();
  await remove.tap();
  await expect.poll(() => sentOf(gateway, PacketType.REMOVEITEMTASKBAR).length).toBe(1);
  await expect(circle(0)).not.toHaveAttribute('data-kind');
});

// 2026-11-13 (owner): "create an action slot window to set up skills, to add or remove": a tap on the bar's action slot opens
// it on the phone; a tap on a skill adds it after the last (SKILLTASKBAR, as Neuz's SetSkillQueue sends it), × takes it out
test('the phone: the Action Slot window adds and takes out the action slot\'s skills (SKILLTASKBAR)', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'the desktop drags skills onto its action slot');
  const gateway = await enter(page);
  const skillTaskBar = () => sentOf(gateway, PacketType.SKILLTASKBAR)
    .map((s) => decodeWorldPacket(new Uint8Array(s.body)))
    .filter((p): p is Extract<WorldPacket, { type: 'skillTaskBar' }> => p.type === 'skillTaskBar');
  await page.locator('.hud-slot[data-row="queue"][data-slot="0"]').tap();
  const win = page.locator('.hud-action-slot-window');
  await expect(win).toBeVisible();
  await expect(win.locator('.action-slot-cell')).toHaveCount(5);
  const cleanHit = win.getByRole('button', { name: 'Add Clean Hit' });
  await expect(cleanHit).toBeEnabled();
  await cleanHit.tap();
  await expect.poll(() => skillTaskBar().length).toBe(1);
  // the five slots named, the empty ones as NONE (CDPClient::SendSkillTaskBar)
  expect(skillTaskBar()[0]!.entries.map((e) => [e.slot, e.shortcut.kind, e.shortcut.id])).toEqual([
    [0, ShortcutKind.SKILL, 0], [1, ShortcutKind.NONE, 0], [2, ShortcutKind.NONE, 0], [3, ShortcutKind.NONE, 0], [4, ShortcutKind.NONE, 0],
  ]);
  await expect(win.locator('.action-slot-cell[data-slot="0"]')).toContainText('Clean Hit');
  // a second step skill cannot follow: Clean Hit greyed now
  await expect(cleanHit).toBeDisabled();
  await expect(page.locator('.hud-slot[data-row="queue"][data-slot="0"]')).toHaveAttribute('data-kind', 'skill');
  await page.screenshot({ path: info.outputPath('phone-action-slot.png') });
  await win.getByRole('button', { name: 'Take Clean Hit out' }).tap();
  await expect.poll(() => skillTaskBar().length).toBe(2);
  expect(skillTaskBar()[1]!.entries.every((e) => e.shortcut.kind === ShortcutKind.NONE)).toBe(true);
  await expect(win.locator('.action-slot-cell[data-slot="0"]')).not.toContainText('Clean Hit');
  await win.locator('.hud-window-close').tap();
  await expect(win).toBeHidden();
});
