// 2026-11-10: the Arena and the Forsaken Tower (docs/superpowers/specs/2026-11-10-arena-tower-research.md), played against
// a scripted world server on the desktop (clicks) and on the phone (taps and the Attack button): Lay's Enter Arena sends
// ARENA_ENTER; in the Arena another player inside the circle is attacked (MELEE_ATTACK at them); Harold's Leave Arena sends
// ARENA_EXIT. The Forsaken Tower Manager opens the tower window at once; a floor asks with its cost, OK sends
// HEAVENTOWER_TELEPORT and the floor's world loads. Each step leaves a picture in the test's output folder.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddNpc, writeAddPlayer, writeAddSelf, writeReplace } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  ASSETS, BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia,
  playGateway, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

const ARENA_ENTER = 0x70000010;
const ARENA_EXIT = 0x70000011;
const HEAVENTOWER_TELEPORT = 0x70001008;
/** WI_WORLD_ARENA and WI_WORLD_HEAVEN03 (Resource/defineWorld.h:63, :13). */
const ARENA = 208;
const HEAVEN03 = 23;
const RIVAL_ID = 9301;
const HAROLD_ID = 9302;

const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
/** The land's height at (x, z) in the converted world `folder` (as travel.spec.ts reads Mars Mine's). */
function groundOf(folder: string, x: number, z: number): Vec3 {
  const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files[`worlds/${folder}/manifest.json`]!), 'utf8'));
  const side = manifest.mapSize * manifest.mpu;
  const tx = Math.floor(x / side), tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
}

/** Webby past the base job (a Mercenary: Lay shows Enter Arena only past it, WndWorld.cpp:6671-6676), with numbers. */
const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, job: 1, own: newVagrantOwn() } };
/** Inside the Arena's circle around (490, 507): Webby, the rival 3 m east, Harold 4 m south-west. */
const IN_ARENA = groundOf('wdarena', 488, 505);
const rival: AddedMover = {
  ...BASE, index: MI_MALE, pos: groundOf('wdarena', 491, 505), angle: 270, objectId: RIVAL_ID, isPlayer: true,
  player: {
    ...SELF_PLAYER, self: false, name: 'Rival', playerId: 701, job: 1, equipmentObjectIds: [],
    worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
  },
};
const npcAs = (objectId: number, characterKey: string, pos: Vec3): AddedMover =>
  ({ ...julia, objectId, pos, npc: { ...julia.npc!, characterKey } });
const harold = npcAs(HAROLD_ID, 'MaFl_Harold', groundOf('wdarena', 485, 503));
/** Floor B3's arrival (`OnTeleportToHeavenTower`, DPSrvr.cpp:9535-9537). */
const B3_AT = groundOf('wdheaven03', 264, 227);

/** Webby on Flaris' square with `npcKey` where Julia stands. */
function scriptWith(npcKey: string): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    others: [writeAddNpc(NPC_ID, npcAs(NPC_ID, npcKey, julia.pos))],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
const typed = (gateway: Gateway, type: number) => sentOf(gateway, type);

/** A press on the NPC `id` that opens its menu or its window (`opened`): on the phone a first tap may only select it. */
async function pressNpc(page: Page, gateway: Gateway, id: number, opened: string): Promise<void> {
  await tapMover(page, id);
  const target = page.locator(opened);
  if (isPhone()) {
    await expect.poll(() => targetsOf(gateway).some(([t]) => t === id), ON_FRAMES).toBe(true);
    // a second tap only when the first one selected and opened nothing (it would land on what opened)
    const shown = await target.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (!shown) await tapMover(page, id);
  }
  await expect(target).toBeVisible(ON_FRAMES);
}

async function chooseEntry(page: Page, gateway: Gateway, npc: number, entry: number): Promise<void> {
  await pressNpc(page, gateway, npc, '.hud-mover-menu');
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await item.click();
}

test('the Arena: Lay sends ARENA_ENTER, a player inside the circle is attacked, Harold sends ARENA_EXIT', async ({ page }, info) => {
  const script = scriptWith('MaFl_Ray');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // Lay's menu: Dialog and Enter Arena, enabled
  await chooseEntry(page, gateway, NPC_ID, 80);
  await expect.poll(() => typed(gateway, ARENA_ENTER).length).toBe(1);
  expect(typed(gateway, ARENA_ENTER)[0]!.body.length).toBe(8); // DPID_UNKNOWN and the type: nothing else

  // the server's REPLACE into the Arena (here inside the circle; the real arrival, 540 485, is outside it)
  gateway.pushCache(script.later([
    writeReplace(NULL_ID, ARENA, IN_ARENA), writeAddSelf(SELF_ID, { ...webby, pos: IN_ARENA }),
    writeAddPlayer(RIVAL_ID, rival), writeAddNpc(HAROLD_ID, harold),
  ]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(ARENA));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await shot('arena');

  // the rival: selected, then attacked (a second click on the PC, the Attack button on the phone)
  const swings = () => typed(gateway, PacketType.MELEE_ATTACK).filter((s) => s.body.readUInt32LE(12) === RIVAL_ID);
  await tapMover(page, RIVAL_ID);
  await expect.poll(() => targetsOf(gateway).some(([t]) => t === RIVAL_ID), ON_FRAMES).toBe(true);
  if (isPhone()) {
    const attack = page.locator('.hud-attack');
    await expect(attack).toBeEnabled(ON_FRAMES);
    await attack.tap();
  } else {
    await tapMover(page, RIVAL_ID);
  }
  await expect.poll(() => swings().length, ON_FRAMES).toBeGreaterThan(0);
  await shot('arena-fight');

  // Harold's Leave Arena
  await chooseEntry(page, gateway, HAROLD_ID, 81);
  await expect.poll(() => typed(gateway, ARENA_EXIT).length).toBe(1);
  expect(typed(gateway, ARENA_EXIT)[0]!.body.length).toBe(8);
});

test('the Forsaken Tower: its window, a floor\'s cost, HEAVENTOWER_TELEPORT, and the floor loads', async ({ page }, info) => {
  const script = scriptWith('MaFl_HEAVENMAN');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // its one entry opens the window at once (WndWorld.cpp:6630-6645)
  await pressNpc(page, gateway, NPC_ID, '.hud-heaven-tower');
  const tower = page.locator('.hud-heaven-tower');
  await expect(tower.locator('.hud-window-title')).toHaveText('Enter Forsaken Tower');
  await expect(tower).toContainText('The Forsaken Tower');
  const rows = tower.locator('[data-floor]');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toHaveText('1. Enter Floor B1. (Monster Level 62-72)');
  await expect(rows.nth(6)).toHaveText('7. Do not Enter.');
  // the tap that opened it chose no line (the phone's click after a tap lands on the window now under the finger)
  await expect(page.locator('.hud-message:visible')).toHaveCount(0);
  await expect(tower.locator('[data-chosen]')).toHaveCount(0);
  await shot('tower-window');
  if (isPhone()) {
    // the phone: every word 14 px or more, each line tall enough for a finger, the window inside the screen
    for (const target of [tower.locator('.hud-res-text-body'), rows.nth(0), tower.locator('.hud-window-title')]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect((await rows.nth(2).boundingBox())!.height).toBeGreaterThanOrEqual(30);
    const view = page.viewportSize()!;
    const at = (await tower.boundingBox())!;
    expect(at.x >= 0 && at.y >= 0 && at.x + at.width <= view.width && at.y + at.height <= view.height).toBe(true);
  }

  // floor B3: its cost asked; OK sends the floor and closes the window
  await rows.nth(2).click();
  await expect(box(page)).toHaveText('You need to pay 50000 penya to enter floor B3.');
  await shot('tower-confirm');
  await page.locator('.hud-message:visible [data-button="ok"]').click();
  await expect.poll(() => typed(gateway, HEAVENTOWER_TELEPORT).length).toBe(1);
  const body = typed(gateway, HEAVENTOWER_TELEPORT)[0]!.body;
  expect([body.length, body.readInt32LE(8)]).toEqual([12, 3]);
  await expect(tower).toBeHidden();

  // the server takes the fee and REPLACEs Webby onto floor B3: its world loads
  gateway.pushCache(script.later([writeReplace(NULL_ID, HEAVEN03, B3_AT), writeAddSelf(SELF_ID, { ...webby, pos: B3_AT })]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(HEAVEN03));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await shot('tower-floor-b3');
});
