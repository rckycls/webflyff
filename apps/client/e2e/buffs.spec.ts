// Buff Pang, the buff display and the premium items against the pretend world server (2026-11-05,
// docs/superpowers/specs/2026-11-05-buffs-premium-research.md): the NPC's Get Buffed! and its buffs, the display dragged
// by an icon and half size on a phone, an ES scroll and a premium timer used from the task bar, and a protection
// scroll's box.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArReader, NULL_ID, PacketType, ShortcutKind } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddNpc, writeAddSelf, writeDoApplySkill, writeSetSkillState, writeSmMode, writeTaskBar,
  writeUpdateItem,
} from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(150_000);

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
/** Buff Pang's first four (`MaFl_Helper`, character.inc): the Event Quick Step, Haste, Heap Up and Accuracy. */
const EVENT_BUFFS = [317, 318, 319, 320];
const ES20 = 26205;
const FULL_SHOUT = 10212;
const SPROTECT = 10464;
const SM_SHOUT15 = 4;

/** Webby with an ES scroll at 3, a Full Shout at 4 and a Scroll of SProtect at 5, and Buff Pang beside Julia's place. */
function scriptFor() {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: 3, itemId: ES20, count: 2 }, { objectId: 4, itemId: FULL_SHOUT, count: 1 },
    { objectId: 5, itemId: SPROTECT, count: 1 });
  own.inventory!.sort((a, b) => a.objectId - b.objectId);
  const pang = { ...julia, npc: { ...julia.npc!, characterKey: 'MaFl_Helper' } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own } }), others: [writeAddNpc(NPC_ID, pang)],
  });
}

/** The three items on the task bar's first three slots. */
const bar = writeTaskBar(SELF_ID, {
  applets: [], queue: [], actionPoint: 0,
  items: [3, 4, 5].map((id, slot) => ({
    bar: 0, slot, shortcut: { kind: ShortcutKind.ITEM, id, type: 0, index: 0, userId: 0, data: 1, text: '' },
  })),
});

async function useSlot(page: Page, slot: number): Promise<void> {
  if (isTouch()) await page.locator(`.hud-slot[data-row="item"][data-slot="${slot}"]`).click();
  else await page.keyboard.press(`F${slot + 1}`);
}

/** Each DOUSEITEM sent: its inventory object and the focus it names. */
const used = (gateway: Awaited<ReturnType<typeof playGateway>>): Array<[number, number]> =>
  sentOf(gateway, PacketType.DOUSEITEM).map((s) => [s.body.readUInt32LE(8) >>> 16, s.body.readUInt32LE(12)]);
const errorsOf = async (page: Page): Promise<unknown[]> => (await page.evaluate(() => window.__client!.stats())).errors;

test("Buff Pang's Get Buffed! sends its key, and its buffs show", async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  await expect(menu).toBeVisible(ON_FRAMES);
  const entry = menu.locator('[data-menu-entry="74"]');
  await expect(entry).toBeEnabled();
  await expect(entry).toHaveText('Get Buffed!');
  await entry.click();
  await expect.poll(() => sentOf(gateway, PacketType.NPC_BUFF).length).toBe(1);
  const r = new ArReader(sentOf(gateway, PacketType.NPC_BUFF)[0]!.body);
  r.u32();
  expect(r.u32()).toBe(PacketType.NPC_BUFF);
  expect(r.string(64)).toBe('MaFl_Helper');
  r.expectEnd();
  // CDPSrvr::OnNPCBuff: each buff, then its DOAPPLYUSESKILL
  gateway.pushCache(script.later(EVENT_BUFFS.flatMap((skill) => [
    writeSetSkillState(SELF_ID, SELF_ID, 1, skill, skill < 319 ? 2 : 1, 3_600_000), writeDoApplySkill(SELF_ID, SELF_ID, skill, 1),
  ])));
  const icons = page.locator('.hud-buffs .hud-buff');
  await expect(icons).toHaveCount(4, ON_FRAMES);
  expect(await icons.locator('img').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).alt)))
    .toEqual(['Quick Step (Event)', 'Haste (Event)', 'Heap Up (Event)', 'Accuracy (Event)']);
  expect(await icons.first().getAttribute('title')).toContain('01:00:00');
  expect(await errorsOf(page)).toEqual([]);
});

test('the buff display is dragged by an icon, and is half size on a phone', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writeSetSkillState(SELF_ID, SELF_ID, 1, 318, 2, 3_600_000)]));
  const icon = page.locator('.hud-buffs .hud-buff').first();
  await expect(icon).toBeVisible(ON_FRAMES);
  const before = (await icon.boundingBox())!;
  expect(Math.round(before.width * 10) / 10).toBe(isTouch() ? 19.2 : 38.4);
  // the press on the icon picks the display up; it follows the pointer and stays where it is let go
  await page.mouse.move(before.x + 5, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(before.x + 65, before.y + 45, { steps: 5 });
  await page.mouse.up();
  const after = (await icon.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(60);
  expect(Math.round(after.y - before.y)).toBe(40);
  // a later buff does not move it back
  gateway.pushCache(script.later([writeSetSkillState(SELF_ID, SELF_ID, 1, 317, 2, 3_600_000)]));
  await expect(page.locator('.hud-buffs .hud-buff')).toHaveCount(2, ON_FRAMES);
  const first = (await page.locator('.hud-buffs .hud-buff').first().boundingBox())!;
  expect(Math.round(first.x)).toBe(Math.round(after.x));
  expect(await errorsOf(page)).toEqual([]);
});

test('an ES scroll and a Full Shout from the task bar; their buff and timer show', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([bar]));
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="1"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await useSlot(page, 0);
  await useSlot(page, 1);
  await expect.poll(() => used(gateway)).toEqual([[3, NULL_ID], [4, NULL_ID]]);
  // the server: the ES scroll's BUFF_ITEM, the Full Shout's SM mode (20 minutes left: shown), the counts
  gateway.pushCache(script.later([
    writeSetSkillState(SELF_ID, SELF_ID, 0, ES20, 0, 3_600_000), writeUpdateItem(SELF_ID, 3, 0, 1),
    writeSmMode(SM_SHOUT15, 1200), writeUpdateItem(SELF_ID, 4, 0, 0),
  ]));
  const icons = page.locator('.hud-buffs .hud-buff');
  await expect(icons).toHaveCount(2, ON_FRAMES);
  expect(await icons.locator('img:first-child').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).alt)))
    .toEqual(['Scroll of Amplification ES20', 'Full Shout 15']);
  await expect(icons.nth(1).locator('.hud-buff-time')).toHaveText(/^(20|19)min$/);
  expect(await icons.first().getAttribute('title')).toContain('50%');
  expect(await errorsOf(page)).toEqual([]);
});

test("the Scroll of SProtect asks first; OK uses it", async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([bar]));
  await expect(page.locator('.hud-slot[data-row="item"][data-slot="2"]')).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  await useSlot(page, 2);
  const box = page.locator('.hud-message-text');
  await expect(box).toContainText('consumed regardless', ON_FRAMES);
  expect(used(gateway)).toEqual([]);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => used(gateway)).toEqual([[5, NULL_ID]]);
  expect(await errorsOf(page)).toEqual([]);
});
