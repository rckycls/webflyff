// 2026-11-15: the guild house (side-session-notes housing-research/), played against a scripted world server on the desktop
// (mouse, Page Down, a click) and on the phone (a finger and the placing bar): Webby, master of Bakers, at Bertha's: Enter
// your Guild House sends GUILDHOUSE_ENTER; the house (WdGuildhousesmall, 212) loads with a placed sofa and the Guild House
// menu opens by itself; Furniture Storage lists the pieces; Install of the bed places its copy and sends SETUP; Fee Deposit
// pays 34 days; the door's Exit sends GOOUT. Each step leaves a picture in the test's output folder.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import {
  ENABLE_GUILD_INVENTORY, GuildHousePacket, GuildHousePacketType, GuildPacket, NULL_ID, WI_GUILDHOUSE_SMALL, decodeWorldPacket,
} from '@flyffweb/protocol';
import type { AddedMover, GuildFurniture, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, guildMember, guildWhole, newVagrantOwn, writeAddCtrl, writeAddNpc, writeAddSelf, writeAllGuilds,
  writeFlyffEvent, writeGuild, writeGuildHouseAllInfo, writeGuildHousePacket, writeReplace,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { ASSETS, MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

const WEBBY = 500;
const GUILD = 77;
/** The Common set's sofa (placed) and a Wood set bed (new) of propItem.txt, their controls (their items' dwLinkKind). */
const SOFA_OBJECT = 0x7101;
const BED_OBJECT = 0x7102;
const DOOR_ID = 9320;

const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const itemProps: Array<{ id: number; name: string; kind2: number; kind3: number; linkKind?: number }> =
  JSON.parse(readFileSync(path.join(ASSETS, index.files['data/itemProps.json']!), 'utf8'));
const guildItem = (pattern: RegExp, kind3: number) =>
  itemProps.find((p) => p.kind2 === 38 && p.kind3 === kind3 && pattern.test(p.name) && p.linkKind !== undefined)!;
const SOFA = guildItem(/Sofa/, 125);
const BED = guildItem(/Bed/, 124);

function groundOf(folder: string, x: number, z: number): Vec3 {
  const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files[`worlds/${folder}/manifest.json`]!), 'utf8'));
  const side = manifest.mapSize * manifest.mpu;
  const tx = Math.floor(x / side), tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
}

/** The arrival (x 78-83, z 61-66, GuildHouse.h:219) facing into the room (+z), the sofa ahead, the door in view for the click. */
const IN_HOUSE = groundOf('wdguildhousesmall', 80, 63);
const SOFA_AT = groundOf('wdguildhousesmall', 74, 74);
const npcAs = (objectId: number, characterKey: string, pos: Vec3): AddedMover =>
  ({ ...julia, objectId, pos, npc: { ...julia.npc!, characterKey } });
const webby: AddedMover = { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn(), guildId: GUILD, equipmentObjectIds: Array(31).fill(NULL_ID) } };

function script(): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: self.pos, self: writeAddSelf(SELF_ID, webby),
    others: [writeAddNpc(NPC_ID, npcAs(NPC_ID, 'MaFl_GUILDHOUSESALE', julia.pos))],
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

test('the guild house: Enter, the menu, Furniture Storage, placing a bed, the fee, Exit', async ({ page }, info) => {
  const world = script();
  const gateway = await playGateway(page, world);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // the guild (master Webby), the server's GUILDBANK switch, the house: the sofa placed, the bed new
  const bakers = guildWhole(GUILD, WEBBY, 'Bakers', [guildMember(WEBBY, 0)], { level: 4, logo: 3 });
  const sofa: GuildFurniture = { itemId: SOFA.id, placed: true, pos: SOFA_AT, angle: 90, objectId: SOFA_OBJECT, secondsLeft: 500_000 };
  const bed: GuildFurniture = { itemId: BED.id, placed: false, pos: [0, 0, 0], angle: 0, objectId: NULL_ID, secondsLeft: 0 };
  gateway.pushCache(world.later([
    writeFlyffEvent(SELF_ID, { [ENABLE_GUILD_INVENTORY]: 1 }), writeAllGuilds(SELF_ID, [bakers]), writeGuild(SELF_ID, bakers),
    writeGuildHouseAllInfo(SELF_ID, true, { guildId: GUILD, worldId: WI_GUILDHOUSE_SMALL, upkeepSecondsLeft: 6 * 86_400, furniture: [sofa, bed] }),
  ]));
  await expect.poll(() => sentOf(gateway, GuildPacket.QUERY_PLAYER_DATA2).length).toBe(1);

  // Bertha: Enter your Guild House (MMI_GUILDHOUSE_ENTER 149)
  await chooseEntry(page, gateway, NPC_ID, 149);
  await expect.poll(() => sentOf(gateway, GuildHousePacket.ENTER).length).toBe(1);

  // the house: REPLACE to WdGuildhousesmall, the sofa's control, the door
  gateway.pushCache(world.later([
    writeReplace(NULL_ID, WI_GUILDHOUSE_SMALL, IN_HOUSE), writeAddSelf(SELF_ID, { ...webby, pos: IN_HOUSE, angle: 180 }),
    writeAddCtrl({ index: SOFA.linkKind!, scale: 1, pos: SOFA_AT, angle: 90, objectId: SOFA_OBJECT }),
    writeAddNpc(DOOR_ID, npcAs(DOOR_ID, 'NPC_GUILDHOUSE_DOOR', groundOf('wdguildhousesmall', 84, 70))),
  ]));
  const menu = page.locator('.hud-guild-house');
  await expect(menu).toBeVisible(ON_FRAMES);
  await expect(menu.locator('.hud-window-title')).toHaveText('Guild House');
  await page.waitForTimeout(3000);
  await shot('house');

  // Furniture Storage: the sofa (placed) and the bed (new)
  await menu.locator('[data-control="WIDC_BTN_FURNITURE"]').click();
  const storage = page.locator('.hud-gh-storage');
  await expect(storage).toBeVisible();
  const rows = storage.locator('.hud-gh-storage-row');
  await expect(rows).toHaveCount(2);
  await shot('storage');

  // the bed's install button: its copy follows the pointer; the storage steps aside for the "Installed" strip
  await rows.filter({ hasText: BED.name }).locator('.hud-gh-storage-ir').click();
  await expect(page.locator('.hud-gh-showone')).toBeVisible();
  await expect(storage).toBeHidden();
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  const points: Array<[number, number]> = [[0.5, 0.45], [0.45, 0.4], [0.55, 0.5], [0.5, 0.35], [0.4, 0.5]];
  const refusals = () => page.locator('.hud-messages').getByText("You can't place that there.").count();
  const placed = () => sentOf(gateway, GuildHousePacket.PACKET).length > 0;
  const bar = page.locator('.hud-placement-bar');
  if (isPhone()) {
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Turn right' }).click();
  } else await page.keyboard.press('PageDown');
  for (const [fx, fy] of points) {
    const before = await refusals();
    const x = box.x + box.width * fx, y = box.y + box.height * fy;
    if (isPhone()) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    await page.waitForTimeout(300);
    if (fx === 0.5 && fy === 0.45) await shot('placing');
    if (isPhone()) await bar.getByRole('button', { name: 'Place' }).click();
    else await page.mouse.click(x, y);
    await expect.poll(async () => placed() || (await refusals()) > before, ON_FRAMES).toBe(true);
    if (placed()) break;
  }
  const request = lastOf(gateway, GuildHousePacket.PACKET);
  expect(request).toMatchObject({ type: 'guildHousePacketRequest', packetType: GuildHousePacketType.SETUP, index: 1, furniture: { itemId: BED.id, placed: true, angle: 45 } });
  const at = (request as { furniture: GuildFurniture }).furniture.pos;
  await expect(storage).toBeVisible();

  // the server's answer: the line, the row placed (blue), the bed's control drawn
  gateway.pushCache(world.later([
    writeGuildHousePacket(SELF_ID, GuildHousePacketType.SETUP, 1, { ...bed, placed: true, pos: at, angle: 45, objectId: BED_OBJECT, secondsLeft: 86_400 }),
    writeAddCtrl({ index: BED.linkKind!, scale: 1, pos: at, angle: 45, objectId: BED_OBJECT }),
  ]));
  await expect(page.locator('.hud-messages')).toContainText('has been placed in your Guild House.', ON_FRAMES);
  await expect(rows.filter({ hasText: BED.name })).toHaveAttribute('data-placed', 'true');
  await page.waitForTimeout(1500);
  await shot('placed');
  await storage.locator('.hud-window-close').click();

  // Fee Deposit: Max is 34 days at 2,400,000 each; OK sends UPKEEP
  await menu.locator('[data-control="WIDC_BTN_UPKEEP"]').click();
  const upkeep = page.locator('.hud-gh-upkeep');
  await expect(upkeep).toBeVisible();
  await upkeep.locator('[data-control="WIDC_MAX"]').click();
  await expect(upkeep).toContainText('81,600,000');
  await shot('upkeep');
  await upkeep.locator('[data-control="WIDC_OK"]').click();
  await expect.poll(() => sentOf(gateway, GuildHousePacket.PACKET).length).toBe(2);
  expect(lastOf(gateway, GuildHousePacket.PACKET)).toMatchObject({ packetType: GuildHousePacketType.UPKEEP, index: -1, furniture: { itemId: 34 } });

  // the door: Exit Your Guild House (its one entry runs at once) sends GOOUT
  await tapMover(page, DOOR_ID);
  if (isPhone() && sentOf(gateway, GuildHousePacket.GOOUT).length === 0) await tapMover(page, DOOR_ID);
  await expect.poll(() => sentOf(gateway, GuildHousePacket.GOOUT).length, ON_FRAMES).toBe(1);
});
