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
    // picked: the item row lit, not the action slot; nothing sent yet
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
    // the button picks the chosen skill: the rows it may go to lit
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
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
