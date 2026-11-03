// The NPC's mover menu and the classic dialogue (Piece 7 M0) against the pretend servers: what the menu shows, the
// opening request and every later one byte for byte, the pages, the keys, the answers, the quest rows and EXIT, and the
// walk-up to an NPC out of the menu's range.

import { expect, test } from '@playwright/test';
import { ArReader, ArWriter, PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddNpc, writeAddSelf } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, SELF_ID, SQUARE, enterFlaris, groundAt, julia, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(120_000);

const SCRIPTDLG = 0xff00b0;
const FAR_ID = 9003;
const message = (objectId: number, type: number, fields: ArWriter): ScriptMessage => ({ objectId, type, fields: fields.toBytes() });
const fn = (func: number, write: (w: ArWriter) => ArWriter = (w) => w) => message(SELF_ID, 0x24, write(new ArWriter().u16(func)));
const button = (func: number, word: string, key: string, quest = 0) => fn(func, (w) => w.string(word).string(key).u32(0).u32(quest));

/** A SCRIPTDLG request's fields after its header: object, key, the four globals. */
function request(body: Buffer): [number, string, number, number, number, number] {
  const r = new ArReader(body);
  r.u32();
  expect(r.u32()).toBe(SCRIPTDLG);
  const fields: [number, string, number, number, number, number] = [r.u32(), r.string(255), r.i32(), r.i32(), r.i32(), r.i32()];
  r.expectEnd();
  return fields;
}

test('classic dialogue: menu, opening request, pages, keys, answers, quest rows and EXIT', async ({ page, isMobile }) => {
  const far = { ...julia, objectId: FAR_ID, pos: [SQUARE[0], groundAt(SQUARE[0], SQUARE[2] - 24), SQUARE[2] - 24] as [number, number, number] };
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, self), others: [writeAddNpc(NPC_ID, julia), writeAddNpc(FAR_ID, far)] });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);

  // 1. Julia's menu: her entries in MMI order, the guild warehouse left out, Dialog and Trade enabled
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  await expect(menu).toBeVisible();
  const entries = menu.locator('[data-menu-entry]');
  await expect(entries).toHaveCount(7);
  expect(await entries.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.menuEntry))).toEqual(['0', '2', '9', '16', '17', '18', '137']);
  expect(await entries.evaluateAll((els) => els.map((el) => (el as HTMLButtonElement).disabled))).toEqual([false, false, true, true, true, true, true]);
  // CWndMenu's items: 20 px on a 22 px pitch (32 on 34 for fingers)
  const [first, second] = [(await entries.nth(0).boundingBox())!, (await entries.nth(1).boundingBox())!];
  expect(Math.round(first.height)).toBe(isMobile ? 32 : 20);
  expect(Math.round(second.y - first.y)).toBe(isMobile ? 34 : 22);

  // 2. Dialog: the opening request, an empty key and four zeros; the window on screen
  await menu.locator('[data-menu-entry="0"]').click();
  await expect.poll(() => sentOf(gateway, SCRIPTDLG).length).toBe(1);
  expect(request(sentOf(gateway, SCRIPTDLG)[0]!.body)).toEqual([NPC_ID, '', 0, 0, 0, 0]);
  const dialog = page.locator('.hud-dialog');
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

  // 3. what the server answers: keys, a quest row, two pages (the first longer than the text area), an OK answer
  const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a long page.`).join('\\n');
  gateway.pushCache(script.later([
    fn(0x1d), button(0x10, 'Introduction', 'Introduction'), button(0x26, 'Report to Flaris', 'QUEST_BEGIN', 5),
    fn(0x12, (w) => w.string(long).u32(0)), fn(0x12, (w) => w.string('The second page.').u32(0)),
    button(0x13, '__OK__', 'QUEST_END_COMPLETE'),
  ]));
  const text = dialog.locator('.dialog-text');
  await expect(text).toContainText('Line 1 of a long page.');
  expect(await text.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const ok = dialog.locator('[data-dialog-answer="0"]');
  await expect(ok).toHaveCount(0);
  const enter = dialog.locator('button.dialog-enter');
  await expect(enter).toBeVisible();
  await expect(dialog.locator('[data-dialog-key="Introduction"]')).toBeInViewport();
  await expect(enter).toBeInViewport();
  await enter.click();
  await expect(text).toContainText('The second page.');
  await expect(ok).toBeVisible();
  await expect(enter).toBeHidden();

  // 4. a key: the request carries the NPC and the player; a second press within 1 s sends nothing
  await dialog.locator('[data-dialog-key="Introduction"]').click();
  await expect.poll(() => sentOf(gateway, SCRIPTDLG).length).toBe(2);
  expect(request(sentOf(gateway, SCRIPTDLG)[1]!.body)).toEqual([NPC_ID, 'Introduction', 0, 0, NPC_ID, SELF_ID]);
  await dialog.locator('[data-dialog-key="Introduction"]').click();
  expect(sentOf(gateway, SCRIPTDLG)).toHaveLength(2);

  // 5. the New Quest key shows its row with the green paper
  await page.waitForTimeout(1000);
  await dialog.locator('[data-dialog-key="New Quest"]').click();
  const row = dialog.locator('[data-quest-list="new"] [data-quest-row="0"]');
  await expect(row).toContainText('Report to Flaris');
  expect(await row.locator('img').getAttribute('src')).toContain('questuipapergreen');

  // 6. EXIT closes it
  gateway.pushCache(script.later([fn(0x16)]));
  await expect(dialog).toBeHidden();

  // 7. an NPC 24 units away: no menu, one walk to it
  const walks = sentOf(gateway, PacketType.PLAYERSETDESTOBJ).length;
  await tapMover(page, FAR_ID);
  await expect.poll(() => sentOf(gateway, PacketType.PLAYERSETDESTOBJ).length).toBe(walks + 1);
  await expect(menu).toBeHidden();
  await expect(dialog).toBeHidden();

  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});
