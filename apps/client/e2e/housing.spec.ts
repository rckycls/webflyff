// 2026-11-15: personal housing (side-session-notes housing-research/), played against a scripted world server on the desktop
// (mouse, Page Down, a click) and on the phone (a finger drag and the placing bar): Charlie's Enter House sends VISITROOM with
// the own id, the room (WdMiniroom, 209) loads with a placed sofa and the wallpaper on, the Housing window lists the pieces,
// Install of the bed places its copy where the pointer is and sends SETUPFURNITURE, the bed then drawn; the door's Exit House
// asks first and sends GOOUT. Each step leaves a picture in the test's output folder.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { HousingPacket, NULL_ID, WI_WORLD_MINIROOM, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddCtrl, writeAddNpc, writeAddSelf, writeHousingAllInfo, writeHousingPapering,
  writeHousingSetupFurniture, writeReplace,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { ASSETS, MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

/** Charlie's basic yellow bed and long chair (10,000,000 penya, 30 days), their controls; the Shabby-Chic Wallpaper. */
const BED = 26674, BED_CTRL = 47;
const SOFA = 26675, SOFA_CTRL = 50;
const WALLPAPER = 26743;
const DOOR_ID = 9310;
const SOFA_OBJECT = 0x7001;
const BED_OBJECT = 0x7002;

const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
/** The land's height at (x, z) in the converted world `folder` (as arenaTower.spec.ts reads it). */
function groundOf(folder: string, x: number, z: number): Vec3 {
  const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files[`worlds/${folder}/manifest.json`]!), 'utf8'));
  const side = manifest.mapSize * manifest.mpu;
  const tx = Math.floor(x / side), tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
}

/** The room's arrival (`CHousingMng::SetVisitRoom`, Housing.cpp:572-574) and the door (WdMiniroom.dyo). */
const IN_ROOM = groundOf('wdminiroom', 253, 243);
const npcAs = (objectId: number, characterKey: string, pos: Vec3): AddedMover =>
  ({ ...julia, objectId, pos, npc: { ...julia.npc!, characterKey } });

function script(): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: self.pos, self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
    others: [writeAddNpc(NPC_ID, npcAs(NPC_ID, 'Mafl_Charlie', julia.pos))],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const lastOf = (gateway: Gateway, type: number) => {
  const all = sentOf(gateway, type);
  return decodeWorldPacket(new Uint8Array(all[all.length - 1]!.body));
};

async function chooseEntry(page: Page, gateway: Gateway, npc: number, entry: number): Promise<void> {
  await tapMover(page, npc);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === npc), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, npc);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await item.click();
}

test('personal housing: Enter House, the room with its furniture, placing a bed, Exit House', async ({ page }, info) => {
  const world = script();
  const gateway = await playGateway(page, world);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  // the login list: the bed not placed, the sofa placed, the wallpaper on
  const room = (placed: boolean) => ({ secondsLeft: 2_590_000, placed, pos: [256, IN_ROOM[1], 247] as Vec3, angle: 90 });
  gateway.pushCache(world.later([writeHousingAllInfo(SELF_ID, [
    { itemId: BED, ...room(false) }, { itemId: SOFA, ...room(true) }, { itemId: WALLPAPER, ...room(true) },
  ], [])]));

  // Charlie: Enter House (MMI_VISIT_MYROOM 122) sends VISITROOM with the own id
  await chooseEntry(page, gateway, NPC_ID, 122);
  await expect.poll(() => sentOf(gateway, HousingPacket.VISITROOM).length).toBe(1);
  expect(lastOf(gateway, HousingPacket.VISITROOM)).toEqual({ type: 'housingVisitRoomRequest', ownerId: SELF_PLAYER.playerId });

  // the room: REPLACE to WdMiniroom, the sofa's control, the door, the wallpaper's PAPERINGINFO
  gateway.pushCache(world.later([
    writeReplace(NULL_ID, WI_WORLD_MINIROOM, IN_ROOM), writeAddSelf(SELF_ID, { ...self, pos: IN_ROOM, angle: 175, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
    writeAddCtrl({ index: SOFA_CTRL, scale: 0.7, pos: [256, IN_ROOM[1], 247], angle: 90, objectId: SOFA_OBJECT }),
    // the door stands behind the arrival (253.6, 240.8, WdMiniroom.dyo); here in view, for the click
    writeAddNpc(DOOR_ID, npcAs(DOOR_ID, 'NPC_Door', groundOf('wdminiroom', 260, 252))),
  ]));
  await expect(page.locator('.world-view canvas')).toBeVisible(ON_FRAMES);
  await page.waitForTimeout(3000);
  await shot('room-default');
  // the server puts the wallpaper on (PAPERINGINFO, World.cpp:1650-1667): the wall takes its texture
  gateway.pushCache(world.later([writeHousingPapering(SELF_ID, WALLPAPER, true)]));
  await page.waitForTimeout(2000);
  await shot('room');

  // the Housing window: Y on the desktop, the Start menu's Housing on the phone
  if (isPhone()) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Housing', exact: true }).click();
  } else {
    await page.keyboard.press('KeyY');
  }
  const housing = page.locator('.hud-housing');
  await expect(housing).toBeVisible();
  await expect(housing.locator('.hud-window-title')).toHaveText('Housing');
  const rows = housing.locator('.hud-housing-row');
  await expect(rows).toHaveCount(3);
  await shot('housing-window');

  // the bed (X): Install starts its placing
  const bed = rows.filter({ hasText: 'Single Bed' });
  await expect(bed).toContainText('X');
  await bed.click();
  const install = housing.locator('[data-control="WIDC_BUTTON1"]');
  await expect(install).toBeEnabled();
  await install.click();
  const canvas = page.locator('.world-view canvas');
  const box = (await canvas.boundingBox())!;
  // the room's free floor is about x 252-262, z 244-254 (the wall's box less the bed's half sizes): points ahead of Webby
  // are tried until one is free (a red one says "You can't place that there." and the piece stays)
  const points: Array<[number, number]> = [[0.5, 0.45], [0.55, 0.4], [0.45, 0.42], [0.6, 0.5], [0.5, 0.35]];
  const refusals = () => page.locator('.hud-messages').getByText("You can't place that there.").count();
  const placedOnce = () => sentOf(gateway, HousingPacket.SETUPFURNITURE).length > 0;
  if (isPhone()) {
    // the window steps aside, the bar shows; a finger moves the bed, the bar turns it and OK places it
    await expect(housing).toBeHidden();
    const bar = page.locator('.hud-placement-bar');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Turn right' }).click();
    for (const [fx, fy] of points) {
      const before = await refusals();
      await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(300);
      if (fx === 0.5 && fy === 0.45) await shot('placing');
      await bar.getByRole('button', { name: 'Place' }).click();
      await expect.poll(async () => placedOnce() || (await refusals()) > before, ON_FRAMES).toBe(true);
      if (placedOnce()) break;
    }
  } else {
    // the window may close meanwhile (V15 keeps the piece): it is in the middle, where the floor is
    await housing.locator('.hud-window-close').click();
    await page.keyboard.press('PageDown');
    for (const [fx, fy] of points) {
      const before = await refusals();
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(300);
      if (fx === 0.5 && fy === 0.45) await shot('placing');
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await expect.poll(async () => placedOnce() || (await refusals()) > before, ON_FRAMES).toBe(true);
      if (placedOnce()) break;
    }
  }
  await expect.poll(() => sentOf(gateway, HousingPacket.SETUPFURNITURE).length, ON_FRAMES).toBe(1);
  const request = lastOf(gateway, HousingPacket.SETUPFURNITURE);
  expect(request).toMatchObject({ type: 'housingSetupFurnitureRequest', itemId: BED, placed: true, angle: 45 });
  const at = (request as { pos: Vec3 }).pos;

  // the server's answer: the list says placed (O), the line, the bed's control drawn
  gateway.pushCache(world.later([
    writeHousingSetupFurniture(SELF_ID, { itemId: BED, secondsLeft: 2_590_000, placed: true, pos: at, angle: 45 }),
    writeAddCtrl({ index: BED_CTRL, scale: 0.7, pos: at, angle: 45, objectId: BED_OBJECT }),
  ]));
  await expect(page.locator('.hud-messages')).toContainText('has been placed in your house.', ON_FRAMES);
  if (!isPhone()) await page.keyboard.press('KeyY');
  await expect(housing).toBeVisible();
  await expect(rows.filter({ hasText: 'Single Bed' })).toContainText('O');
  await page.waitForTimeout(1500);
  await shot('placed');

  // the door: Exit House (MMI_RETURNTO_WORLD 124) asks; OK sends GOOUT
  await housing.locator('.hud-window-close').click().catch(() => {});
  await chooseEntry(page, gateway, DOOR_ID, 124);
  const quit = page.locator('.hud-quit-room');
  await expect(quit).toBeVisible();
  await expect(quit).toContainText('Are you sure you want to exit?');
  await quit.locator('[data-control="WIDC_BUTTON1"]').click();
  await expect.poll(() => sentOf(gateway, HousingPacket.GOOUT).length).toBe(1);
});
