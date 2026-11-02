import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { AssetIndex, WebNpc } from '@flyffweb/formats';
import { ArReader, NULL_ID, PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddNpc, writeAddSelf, writeReplace } from '@flyffweb/testkit';
import { ASSETS, MADRIGAL, NPC_ID, SELF_ID, SQUARE, enterFlaris, groundAt, julia, ownAt, playGateway, self, sentOf, tapMover } from './worldHarness';

test.setTimeout(120_000);
const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const npcs: WebNpc[] = JSON.parse(readFileSync(path.join(ASSETS, index.files['data/npcs.json']!), 'utf8'));
const teleporter = npcs.find(npc => npc.key === 'MaFl_TELEPORTER')!;

test('classic Navigator: native art, zoom and filters; map taps mark without walking; N and Start toggle it', async ({ page, isMobile }) => {
  await playGateway(page); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  const nav = page.locator('.hud-navigator'); await expect(nav).toBeVisible();
  await expect(nav.locator('.hud-window-title')).toHaveText('Navigator');
  await expect.poll(() => nav.locator('.navigator-map > img').count()).toBeGreaterThan(0);
  expect(await nav.getByRole('button', { name: 'Zoom in', exact: true }).evaluate(el => getComputedStyle(el).backgroundImage)).toContain('buttnavzoomin');
  await nav.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => nav.locator('.navigator-map > img').first().evaluate(el => el.style.width)).toBe('288px');
  await nav.getByRole('button', { name: 'Navigator filters' }).click();
  await nav.locator('[data-filter=npc]').click();
  await expect(nav.locator('[data-marker][data-kind=npc]')).toHaveCount(0);
  await nav.locator('[data-filter=npc]').click();
  await expect.poll(() => nav.locator('[data-marker][data-kind=npc]').count()).toBeGreaterThan(0);
  await nav.getByRole('button', { name: 'Navigator filters' }).click();
  const before = await ownAt(page), map = nav.locator('.navigator-map');
  if (isMobile) await map.tap({ position: { x: 70, y: 60 } }); else await map.click({ position: { x: 70, y: 60 } });
  await expect(nav.locator('.navigator-destination')).toBeVisible();
  expect(await ownAt(page)).toEqual(before);
  await page.screenshot({ path: test.info().outputPath('classic-navigator.png') });
  await page.keyboard.press('KeyN'); await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Navigator', exact: true }).click(); await expect(nav).toBeVisible();
  const box = (await nav.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('classic NPC teleporter: native map markers send the resource destination index and honor server REPLACE', async ({ page }) => {
  expect(teleporter.teleports!.length).toBeGreaterThan(0);
  const npc = { ...julia, npc: { ...julia.npc!, characterKey: teleporter.key } };
  const script = createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, self), others: [writeAddNpc(NPC_ID, npc)] });
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  await tapMover(page, NPC_ID);
  await page.locator('[data-npc-action=teleport]').click();
  const teleporterWindow = page.locator('.hud-teleporter'); await expect(teleporterWindow).toBeVisible();
  await expect(teleporterWindow.locator('[data-destination]')).toHaveCount(teleporter.teleports!.length);
  expect(await teleporterWindow.locator('.teleporter-map').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('world_flyff');
  await page.screenshot({ path: test.info().outputPath('classic-teleporter.png') });
  await teleporterWindow.locator('[data-destination="0"]').click();
  await expect.poll(() => sentOf(gateway, PacketType.TELEPORTER).length).toBe(1);
  const r = new ArReader(sentOf(gateway, PacketType.TELEPORTER)[0]!.body);
  r.u32(); expect(r.u32()).toBe(PacketType.TELEPORTER); expect(r.string(63)).toBe(teleporter.key); expect(r.i32()).toBe(0); r.expectEnd();
  await expect(teleporterWindow).toBeHidden(); expect(await ownAt(page)).toEqual(SQUARE);
  const destination = teleporter.teleports![0]!;
  gateway.pushCache(script.later([writeReplace(NULL_ID, MADRIGAL, [destination.x, groundAt(destination.x, destination.z), destination.z])]));
  await expect.poll(async () => { const pos = await ownAt(page); return [pos[0], pos[2]]; }).toEqual([destination.x, destination.z]);
});
