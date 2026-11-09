// The quests (Piece 7 M1) against the pretend servers: the quest window and its detail, a check and the tracker, a
// progress line, the destination on the world map, abandoning, and the dialogue's quest row from the catalog.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ArReader, ArWriter, PacketType } from '@flyffweb/protocol';
import type { OwnQuest } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeQuestChecked, writeRemoveQuest, writeSetQuest,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(120_000);

const QUEST: OwnQuest = { id: 151, state: 0, time: 0, kills: [3, 0], patrol: false, dialog: false };
/** Mustang, Flaris's drillmaster, who gives quest 151: Julia's body under his key (`MaFl_Mustang`, Dialog only). */
const mustang = { ...julia, npc: { ...julia.npc!, characterKey: 'MaFl_Mustang' } };
const fn = (func: number, write: (w: ArWriter) => ArWriter = (w) => w): ScriptMessage =>
  ({ objectId: SELF_ID, type: 0x24, fields: write(new ArWriter().u16(func)).toBytes() });
const button = (func: number, word: string, key: string, quest = 0) => fn(func, (w) => w.string(word).string(key).u32(0).u32(quest));

/** A client packet's fields after its header and type. */
function fields(body: Buffer, type: number): ArReader {
  const r = new ArReader(body);
  r.u32();
  expect(r.u32()).toBe(type);
  return r;
}

async function openQuests(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Quest Diary', exact: true }).click();
  } else {
    await page.keyboard.press('KeyQ');
  }
}

/** Two boxes that share no point. */
async function apart(a: Locator, b: Locator): Promise<boolean> {
  const [p, q] = [await a.boundingBox(), await b.boundingBox()];
  if (p === null || q === null) return true;
  return p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
}

test('quests: the window, the detail, a check and the tracker, progress lines, abandon, the dialogue\'s quest row', async ({ page, isMobile }) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: { ...newVagrantOwn(), quests: [QUEST] } } }),
    others: [writeAddNpc(NPC_ID, mustang)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);

  // 1. Q (a phone: Start, Quest Diary): the General tab, "1st Job Change" and its quest
  await openQuests(page, isMobile);
  const list = page.locator('.hud-quests');
  await expect(list).toBeVisible();
  await expect(list.locator('[data-quest-tab="6001"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(list.locator('[data-quest-folder="6051"]')).toContainText('1st Job Change');
  const leaf = list.locator('[data-quest-id="151"]');
  await expect(leaf.locator('.quest-title')).toHaveText('The Path of the Mercenary');
  if (isMobile) {
    // 8. a full-screen panel inside the screen
    const viewport = page.viewportSize()!;
    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  // 2. the detail: its condition row and its reward
  await leaf.locator('.quest-title').click();
  const detail = page.locator('.hud-quest-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.quest-conditions')).toContainText('Defeat Small Aibatt (3/10)');
  await expect(detail.locator('.quest-rewards')).toContainText('Penya: 1500');
  if (isMobile) expect(await apart(list, detail)).toBe(true);

  // 3. a tick sends QUEST_CHECK 151, 1; the box and the tracker follow QUEST_CHECKED
  await leaf.locator('.quest-check').click();
  await expect.poll(() => sentOf(gateway, PacketType.QUEST_CHECK).length).toBe(1);
  const check = fields(sentOf(gateway, PacketType.QUEST_CHECK)[0]!.body, PacketType.QUEST_CHECK);
  expect([check.i32(), check.i32()]).toEqual([151, 1]);
  check.expectEnd();
  gateway.pushCache(script.later([writeQuestChecked(SELF_ID, [151])]));
  await expect(leaf.locator('.quest-check')).toHaveAttribute('data-checked', 'true');
  const tracker = page.locator('.hud-quest-tracker');
  await expect(tracker.locator('.tracker-title')).toHaveText('The Path of the Mercenary');
  await expect(tracker.locator('.tracker-row').first()).toHaveText('Defeat Small Aibatt (3/10)');
  await expect(tracker.locator('.tracker-row').nth(1)).toContainText('Mustang'); // the hand-in row, "Meet ..."
  if (!isMobile) await expect(tracker).toBeVisible();

  // 4. a kill: the line among the messages and in the chat, the tracker's count
  gateway.pushCache(script.later([writeSetQuest(SELF_ID, { ...QUEST, kills: [4, 0] })]));
  await expect(page.locator('.hud-messages')).toContainText('Defeat Small Aibatt (4/10)');
  // the desktop's chat (2026-11-09) puts a game line in its System window (CWndMgr::PutString, WndManager.cpp:4166-4172)
  await expect.poll(() => page.locator('.hud-chat, .hud-neuz-chat-log').evaluate((el) => el.textContent ?? '')).toContain('Defeat Small Aibatt (4/10)');
  await expect(tracker.locator('.tracker-row').first()).toHaveText('Defeat Small Aibatt (4/10)');
  if (isMobile) {
    // 8. the tracker clear of the joystick, the attack and jump buttons and the task bar
    for (const other of ['.joystick', '.hud-attack', '.hud-jump', '.hud-taskbar']) {
      expect(await apart(tracker, page.locator(other).first()), other).toBe(true);
    }
  }

  // 5. the kill row's goal: the world map with the destination
  await detail.locator('.quest-conditions [data-row="0"]').click();
  const map = page.locator('.hud-worldmap');
  await expect(map).toBeVisible();
  await expect(page.locator('.hud-worldmap-destination')).toBeVisible();
  if (isMobile) await page.locator('[data-worldmap-close]').click();
  else await page.keyboard.press('Escape');
  await expect(map).toBeHidden();

  // 6. abandon, OK: REMOVEQUEST 151; the server's cancel empties the tree and the tracker
  await list.locator('button.quest-remove').click();
  const confirm = page.locator('.quest-confirm');
  await expect(confirm).toContainText('cancel the quest');
  await confirm.locator('[data-button="ok"]').click();
  await expect.poll(() => sentOf(gateway, PacketType.REMOVEQUEST).length).toBe(1);
  const remove = fields(sentOf(gateway, PacketType.REMOVEQUEST)[0]!.body, PacketType.REMOVEQUEST);
  expect(remove.u32()).toBe(151);
  remove.expectEnd();
  gateway.pushCache(script.later([writeRemoveQuest(SELF_ID, -1, 151)]));
  await expect(page.locator('.hud-messages')).toContainText('The Path of the Mercenary');
  await expect(list.locator('[data-quest-id]')).toHaveCount(0);
  await expect(tracker).toBeHidden();
  await expect(detail).toBeHidden();

  // 7. Mustang's dialogue: the new quest's row from the catalog, [15~15] and the green paper
  if (isMobile) await list.locator('.quest-close').click();
  else await page.keyboard.press('KeyQ');
  await expect(list).toBeHidden();
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  const dialog = page.locator('.hud-dialog');
  await expect(menu.or(dialog).first()).toBeVisible();
  if (await menu.isVisible()) await menu.locator('[data-menu-entry="0"]').click();
  await expect(dialog).toBeVisible();
  gateway.pushCache(script.later([fn(0x1d), button(0x26, 'The Path of the Mercenary', 'QUEST_BEGIN', 151)]));
  await page.waitForTimeout(1000);
  await dialog.locator('[data-dialog-key="New Quest"]').click();
  const row = dialog.locator('[data-quest-list="new"] [data-quest-row="0"]');
  await expect(row).toHaveText('[15~15] The Path of the Mercenary');
  expect(await row.locator('img').getAttribute('src')).toContain('questuipapergreen');

  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
