// 2026-11-15 (Guild Siege, B3): Frankie's and Donaris's menus and windows (docs/guild-siege/research/A-client.md §1, §2.1-2.8,
// §3.2), played against a scripted world server on the desktop (clicks) and on the phone (taps): Apply opens the offer with the
// minimum bid and OK sends GC_IN_APP; Status shows the list and the count-down; walking away closes the NPC windows; the boards
// show the owner's rules; Donaris's Cancel asks first, Jackpot stays silent for a player who is not the guild master, and the
// server's GC_GETPENYAGUILD, GC_TELE and GC_DIAGMESSAGE become their boxes. The siege's button pictures are not converted
// yet, so their loads fail in the console: the windows still work (their buttons are found by their names).
// B5: in the arena (world 202), logged in during the war: the HUD and the PvP rule from GC_GCSTATE, GC_USERSTATE and the
// boards alone; the phone's boards clear of Attack, the quick slots, Jump, the Action Slot button and the task bar, and the
// own guild's list of a full line-up clear of them, the chat and the boards (final review).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { ArReader, GuildCombatPacketType, PacketType, readGuildCombatRequestPacket } from '@flyffweb/protocol';
import type { AddedMover, GuildCombatMessage, PlayerDataRecord, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, guildMember, guildWhole, newVagrantOwn, writeAddNpc, writeAddPlayer, writeAddSelf, writeAllGuilds, writeGuild, writeGuildCombat,
  writeQueryPlayerData,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  ASSETS, BASE, MALE_VAGRANT, MI_MALE, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, MADRIGAL, enterFlaris, julia, playGateway, self, sentOf,
  tapMover, tapWorld, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

const T = 'guildCombat' as const;
const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const press = async (target: Locator): Promise<void> => { if (isPhone()) await target.tap(); else await target.click(); };
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
async function closeBox(page: Page): Promise<void> {
  await press(page.locator('.hud-message:visible [data-button="ok"]'));
  await expect(page.locator('.hud-message:visible')).toHaveCount(0);
}

const npcOf = (characterKey: string): AddedMover => ({ ...julia, objectId: NPC_ID, npc: { ...julia.npc!, characterKey } });
const worldWith = (characterKey: string, me: AddedMover = self): WorldScript => createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, me), others: [writeAddNpc(NPC_ID, npcOf(characterKey))],
});
/** The server's answer: a siege snapshot of `message`. */
type Body = GuildCombatMessage extends infer M ? (M extends { type: string } ? Omit<M, 'type'> : never) : never;
const answer = (gateway: Gateway, script: WorldScript, message: Body): void =>
  gateway.pushCache(script.later([writeGuildCombat(SELF_ID, { type: T, ...message } as GuildCombatMessage)]));

/** The NPC's menu entry `entry` (on the phone a first tap may only select the NPC). */
async function chooseEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone()) {
    await expect.poll(() => targetsOf(gateway).some(([t]) => t === NPC_ID), ON_FRAMES).toBe(true);
    if (!await menu.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await press(item);
}

/** The phone's rules for a window: Neuz's 12 px words, the buttons 24 px tall or more, the window inside 800 x 350 and the screen. */
async function phoneChecks(page: Page, window: Locator): Promise<void> {
  if (!isPhone()) return;
  for (const words of await window.locator('.hud-res-text-body, .hud-res-static-text, .hud-window-title, [role="option"]').all()) {
    if (!await words.isVisible()) continue;
    expect(await words.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12);
  }
  for (const button of await window.locator('.hud-picture-button').all()) {
    if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
  const view = page.viewportSize()!, at = (await window.boundingBox())!;
  expect(at.x >= 0 && at.y >= 0 && at.x + at.width <= view.width && at.y + at.height <= view.height).toBe(true);
  expect(at.width).toBeLessThanOrEqual(800);
  expect(at.height).toBeLessThanOrEqual(350);
}

test('Frankie: Apply, Status, walking away and the boards', async ({ page }, info) => {
  // the penya for the minimum bid: a bid over the own penya is refused before the confirm box (final review, Important 1)
  const script = worldWith('MaFl_GuildWar', { ...self, player: { ...SELF_PLAYER, own: { ...newVagrantOwn(), gold: 150_000_000 } } });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // Apply: GC_IN_WINDOW; the offer opens with the minimum bid, OK in the confirm box sends GC_IN_APP
  await chooseEntry(page, gateway, 26);
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.IN).length).toBe(1);
  expect(sentOf(gateway, GuildCombatPacketType.IN)[0]!.body.readUInt8(8)).toBe(1);
  answer(gateway, script, { sub: 'inWindow', totalPrize: 0, ownBid: 0, minBid: 100_000_000 });
  const apply = page.locator('.hud-gc-apply');
  await expect(apply).toBeVisible(ON_FRAMES);
  await expect(apply.locator('.hud-window-title')).toHaveText('Guild Siege - Apply');
  await expect(apply.getByLabel('Current application fee')).toHaveValue('100000000');
  if (!isPhone()) {
    const at = (await apply.boundingBox())!;
    expect([Math.round(at.width), Math.round(at.height)]).toEqual([304, 272]);
  }
  await expect(apply).toContainText('Red Chips are rewarded');
  await phoneChecks(page, apply);
  await shot('apply');
  await press(apply.getByRole('button', { name: 'Accept' }));
  await expect(box(page)).toContainText('Do you wish to add 100000000 Penya?');
  await press(page.locator('.hud-message:visible [data-button="ok"]'));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.IN).length).toBe(2);
  const app = sentOf(gateway, GuildCombatPacketType.IN)[1]!.body;
  expect([app.readUInt8(8), app.readUInt32LE(9)]).toEqual([2, 100_000_000]);
  await expect(apply).toBeHidden();

  // Status: GC_REQUEST_STATUS; the list, the count-down that runs
  await chooseEntry(page, gateway, 27);
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.REQUEST_STATUS).length).toBe(1);
  answer(gateway, script, { sub: 'requestStatus', secondsToNext: 125, prize: 0, guildNames: ['Alpha', 'Bravo', 'Charlie'], ownBid: 0 });
  const status = page.locator('.hud-gc-status');
  await expect(status).toBeVisible(ON_FRAMES);
  await expect(status.locator('[role="option"]')).toHaveCount(3);
  await expect(status.locator('[role="option"]').nth(1)).toContainText('No.02');
  await expect(status.locator('[role="option"]').nth(1)).toContainText('Bravo');
  const countdown = status.locator('[data-control="WIDC_STATIC2"]');
  await expect(countdown).toHaveText(/^\d+m\d+s$/);
  const first = await countdown.innerText();
  await expect.poll(() => countdown.innerText(), ON_FRAMES).not.toBe(first);
  await phoneChecks(page, status);
  await shot('status');
  await press(status.getByRole('button', { name: 'Refresh' }));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.REQUEST_STATUS).length).toBe(2);

  // walking away closes it (WndWorld.cpp:8402-8436)
  if (isPhone()) await tapWorld(page, 0.92, 0.6); else await tapWorld(page, 0.5, 0.8);
  await expect(status).toBeHidden(ON_FRAMES);

  // the board: the owner's rules in the V15 text
  await chooseEntry(page, gateway, 37);
  const board = page.locator('.hud-gc-board');
  await expect(board.locator('.hud-window-title')).toHaveText('Guild Siege - Info.');
  await expect(board).toContainText('Required Guild Level: Level 50+');
  await expect(board).toContainText('The 12 highest bids');
  await expect(board).toContainText('6:52 AM / 6:52 PM');
  await expect(board).not.toContainText('#cff');
  await phoneChecks(page, board);
  await shot('board1');
  await press(board.getByRole('button', { name: 'OK' }));
  await expect(board).toBeHidden();
  await chooseEntry(page, gateway, 38);
  await expect(board).toContainText('Each member has 6 "lives"');
  await press(board.getByRole('button', { name: 'OK' }));
});

test('Donaris: Cancel, Jackpot, the prize and the boxes of the server', async ({ page }, info) => {
  const script = worldWith('MaFl_Donaris');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // Cancel: the question first; No sends nothing, Yes sends GC_OUT
  await chooseEntry(page, gateway, 28);
  const cancel = page.locator('.hud-gc-cancel');
  await expect(cancel.locator('.hud-window-title')).toHaveText('Guild Siege - Cancel Application');
  await expect(cancel).toContainText('Do you want to withdraw from the Guild Siege?');
  await phoneChecks(page, cancel);
  await shot('cancel');
  await press(cancel.getByRole('button', { name: 'No' }));
  await expect(cancel).toBeHidden();
  expect(sentOf(gateway, GuildCombatPacketType.OUT)).toHaveLength(0);
  await chooseEntry(page, gateway, 28);
  await press(cancel.getByRole('button', { name: 'Yes' }));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.OUT).length).toBe(1);
  await expect(cancel).toBeHidden();

  // Jackpot is the guild master's: for this player nothing is sent
  await chooseEntry(page, gateway, 34);
  await page.waitForTimeout(500);
  expect(sentOf(gateway, GuildCombatPacketType.GETPENYAGUILD)).toHaveLength(0);
  await expect(page.locator('.hud-message:visible')).toHaveCount(0);
  // the Ranking asks the server
  await chooseEntry(page, gateway, 30);
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.PLAYERPOINT).length).toBe(1);

  // the server's prize answer is a message box
  answer(gateway, script, { sub: 'getPenyaGuild', result: 0, penya: 5_000_000 });
  await expect(box(page)).toContainText('5000000 penya as prize money', ON_FRAMES);
  await closeBox(page);

  // Info
  await chooseEntry(page, gateway, 40);
  const board = page.locator('.hud-gc-board');
  await expect(board).toContainText('Applying Fee');
  await expect(board).toContainText('the 12 Guilds');
  await press(board.getByRole('button', { name: 'OK' }));

  // GC_TELE: Yes sends GC_TELE
  answer(gateway, script, { sub: 'tele', text: 'Entrance has started. Would you like to teleport to the Guild Siege arena?' });
  const tele = page.locator('.hud-gc-tele');
  await expect(tele).toBeVisible(ON_FRAMES);
  await expect(tele).toContainText('Would you like to teleport');
  await phoneChecks(page, tele);
  await shot('tele');
  await press(tele.getByRole('button', { name: 'Yes' }));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.TELE).length).toBe(1);
  await expect(tele).toBeHidden();

  // GC_DIAGMESSAGE: the text, OK
  answer(gateway, script, { sub: 'diagMessage', text: 'You qualified to enter the guild siege.' });
  const diag = page.locator('.hud-gc-diag');
  await expect(diag).toBeVisible(ON_FRAMES);
  await expect(diag.locator('.hud-window-title')).toHaveText('Guild Siege Introduction');
  await expect(diag).toContainText('You qualified');
  await phoneChecks(page, diag);
  await press(diag.getByRole('button', { name: 'OK' }));
  await expect(diag).toBeHidden();
});

// B4: the line-up window and the start-point window.
const WEBBY = 500, LEAD = 70002, MIA = 70003, ROCKY = 70004, FAR = 70005, GUILD = 77;
const player = (level: number, login: number): PlayerDataRecord => ({ job: 6, level, sex: 0, version: 1, login });

test('Entry: the line-up (add, refusals, defender, order, Complete) and the start point', async ({ page }, info) => {
  const own = { ...self, player: { ...self.player!, guildId: GUILD } };
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, own), others: [writeAddNpc(NPC_ID, npcOf('MaFl_GuildWar'))],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const bakers = guildWhole(GUILD, WEBBY, 'Bakers', [
    guildMember(WEBBY, 0), guildMember(LEAD, 1), guildMember(MIA, 4), guildMember(ROCKY, 4), guildMember(FAR, 4),
  ], { level: 3 });
  gateway.pushCache(script.later([writeAllGuilds(SELF_ID, [bakers]), writeGuild(SELF_ID, bakers)]));
  gateway.pushCache(script.later([
    writeQueryPlayerData(SELF_ID, WEBBY, 'Webby', player(40, 1)), writeQueryPlayerData(SELF_ID, LEAD, 'Lead', player(60, 1)),
    writeQueryPlayerData(SELF_ID, MIA, 'Mia', player(35, 1)), writeQueryPlayerData(SELF_ID, ROCKY, 'Rocky', player(25, 1)),
    writeQueryPlayerData(SELF_ID, FAR, 'Far', player(50, 0)),
  ]));
  const request = (type: number, i: number) => {
    const r = new ArReader(sentOf(gateway, type)[i]!.body);
    r.bytes(8);
    return readGuildCombatRequestPacket(type, r);
  };

  // the entries are taken while the siege waits for them (NOTENTER_COUNT_STATE 101)
  answer(gateway, script, { sub: 'gcState', state: 1, warState: 101 });
  await chooseEntry(page, gateway, 33);
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.SELECTPLAYER).length).toBe(1);
  expect(request(GuildCombatPacketType.SELECTPLAYER, 0)).toEqual({ type: 'gcLineupWindowRequest' });
  answer(gateway, script, { sub: 'selectPlayer', maxJoin: 10, maxWar: 5, requestWar: true, window: true, defenderId: 0, playerIds: [] });
  const lineup = page.locator('.hud-gc-lineup');
  await expect(lineup).toBeVisible(ON_FRAMES);
  await expect(lineup.locator('.hud-window-title')).toHaveText('Set Entry List for Guild Siege');
  await expect(lineup).toContainText('Starting member 5 (Maximum member 10)');
  if (!isPhone()) {
    const at = (await lineup.boundingBox())!;
    expect([Math.round(at.width), Math.round(at.height)]).toEqual([656, 432]);
  }
  // the online members, the lowest level first
  const left = lineup.locator('[data-control="WIDC_LISTBOX1"] [role="option"]');
  await expect(left).toHaveCount(4);
  await expect(left.nth(0)).toContainText('Lv25');
  await expect(left.nth(3)).toContainText('Lv60');
  const right = lineup.locator('[data-control="WIDC_LISTBOX2"] [role="option"]');
  const pick = async (row: Locator) => press(row);
  // level 25: refused
  await pick(left.nth(0));
  await press(lineup.getByRole('button', { name: '--->' }));
  await expect(box(page)).toContainText('level 30', ON_FRAMES);
  await closeBox(page);
  // Mia, Webby, Lead
  for (const at of [1, 2, 3]) {
    await pick(left.nth(at));
    await press(lineup.getByRole('button', { name: '--->' }));
  }
  await expect(right).toHaveCount(3);
  // one already in: refused
  await press(lineup.getByRole('button', { name: '--->' }));
  await expect(box(page)).toContainText('Register again', ON_FRAMES);
  await closeBox(page);
  // the guild master (Webby, the second row) cannot be the defender with more than one entrant
  await pick(right.nth(1));
  await press(lineup.getByRole('button', { name: 'Defender' }));
  await expect(box(page)).toContainText('Guild Master cannot be a defender', ON_FRAMES);
  await closeBox(page);
  // Complete with no defender: refused
  await press(lineup.getByRole('button', { name: 'Complete' }));
  await expect(box(page)).toContainText('no defender', ON_FRAMES);
  await closeBox(page);
  // Mia defends; Lead moves up
  await pick(right.nth(0));
  await press(lineup.getByRole('button', { name: 'Defender' }));
  await expect(right.nth(0)).toHaveClass(/is-defender/);
  await pick(right.nth(2));
  await press(lineup.getByRole('button', { name: 'Up' }));
  await expect(right.nth(1)).toContainText('Lead');
  await expect(right.nth(0)).toHaveClass(/is-blue/);
  await phoneChecks(page, lineup);
  await shot('lineup');
  await press(lineup.getByRole('button', { name: 'Complete' }));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.SELECTPLAYER).length).toBe(2);
  expect(request(GuildCombatPacketType.SELECTPLAYER, 1)).toEqual({ type: 'gcLineupRequest', defenderId: MIA, playerIds: [MIA, LEAD, WEBBY] });
  await expect(lineup).toBeHidden();

  // the start point: a press sends the area at once, the time-out sends the pick; no close button
  answer(gateway, script, { sub: 'selectWarPos', map: 99, seconds: 3 });
  const start = page.locator('.hud-gc-startpoint');
  await expect(start).toBeVisible(ON_FRAMES);
  await expect(start).toContainText('Select the area you wish to enter.');
  await expect(start).toContainText('you enter Random.');
  await expect(start.locator('.hud-window-close, [data-button="close"]')).toHaveCount(0);
  await phoneChecks(page, start);
  await shot('startpoint');
  await press(start.getByRole('button', { name: '2' }));
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.SELECTMAP).length).toBe(1);
  expect(request(GuildCombatPacketType.SELECTMAP, 0)).toEqual({ type: 'gcSelectMapRequest', map: 1 });
  await expect(start).toBeHidden({ timeout: 8_000 });
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.SELECTMAP).length).toBe(2);
  expect(request(GuildCombatPacketType.SELECTMAP, 1)).toEqual({ type: 'gcSelectMapRequest', map: 1 });
});

// B5: in the arena. Webby logs in to world 202 during the war: the JOIN carries GC_GCSTATE (WAR, WAR_WAR), the USERSTATEs,
// the count-down and the boards, before any HUD exists (DPDatabaseClient.cpp:1109-1120).
const SIEGE_WORLD = 202, RIVAL_ID = 9301, RIVAL = 70101, ALPHA = 78;
const siegeIndex: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
/** The land's height at (x, z) in the converted world `folder` (as arenaTower.spec.ts reads it). */
function groundOf(folder: string, x: number, z: number): Vec3 {
  const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, siegeIndex.files[`worlds/${folder}/manifest.json`]!), 'utf8'));
  const side = manifest.mapSize * manifest.mpu;
  const tx = Math.floor(x / side), tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return [x, sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu), z];
}
const GUILD_NAMES = ['Alpha', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'Bakers', 'India', 'Juliet', 'Kilo', 'Lima'];

test('In the arena: logged in during the war, the count-down, the boards, the own list, PvP, the kill line; the phone fit', async ({ page }, info) => {
  // at the third start point (1258, 1252; the mask's ③, A-client.md §4.2); the centre (1291, 1279) is the monument, and a
  // statue's stone basin stands east of the start point: the rival 2 m west, on open ground
  const at = groundOf('wdguildwar', 1257, 1252);
  const webby: AddedMover = { ...self, pos: at, hitPoint: 230, player: { ...SELF_PLAYER, job: 1, guildId: GUILD, own: newVagrantOwn() } };
  const rival: AddedMover = {
    ...BASE, index: MI_MALE, pos: groundOf('wdguildwar', 1255, 1252), angle: 90, objectId: RIVAL_ID, isPlayer: true,
    player: {
      ...SELF_PLAYER, self: false, name: 'Rival', playerId: RIVAL, job: 1, guildId: ALPHA, equipmentObjectIds: [],
      worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
    },
  };
  const gc = (m: Body) => writeGuildCombat(SELF_ID, { type: T, ...m } as GuildCombatMessage);
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: SIEGE_WORLD, pos: at, self: writeAddSelf(SELF_ID, webby),
    others: [
      writeAddPlayer(RIVAL_ID, rival),
      gc({ sub: 'isRequest', requested: true }),
      gc({ sub: 'gcState', state: 2, warState: 104 }),
      gc({ sub: 'nextTimeState', msLeft: 1_800_000, nextState: 105 }),
      gc({ sub: 'userState', moverId: SELF_ID, state: 1 }),
      gc({ sub: 'userState', moverId: RIVAL_ID, state: 1 }),
      gc({ sub: 'warPlayerList', guilds: [
        { defenderId: LEAD, members: [{ playerId: WEBBY, status: 1 }, { playerId: LEAD, status: 1 }, { playerId: MIA, status: 0 }] },
        { defenderId: RIVAL, members: [{ playerId: RIVAL, status: 1 }] },
      ] }),
      gc({ sub: 'guildStatus', joinIndex: 2, players: [{ playerId: WEBBY, lives: 6 }, { playerId: LEAD, lives: 4 }, { playerId: MIA, lives: 6 }] }),
      gc({ sub: 'guildPrecedence', guilds: GUILD_NAMES.map((name, i) => ({ has: true as const, name, points: 120 - i * 10 })) }),
      // 15 players, Webby 12th
      gc({ sub: 'playerPrecedence', guilds: [
        Array.from({ length: 11 }, (_, i) => ({ playerId: 71000 + i, points: 50 - i * 3 })),
        [{ playerId: WEBBY, points: 2 }, { playerId: RIVAL, points: 1 }, { playerId: 72001, points: 0 }, { playerId: 72002, points: 0 }],
      ] }),
    ],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(SIEGE_WORLD));
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const bakers = guildWhole(GUILD, WEBBY, 'Bakers', [guildMember(WEBBY, 0), guildMember(LEAD, 1), guildMember(MIA, 4)], { level: 50 });
  const alpha = guildWhole(ALPHA, RIVAL, 'Alpha', [guildMember(RIVAL, 0)], { level: 50 });
  gateway.pushCache(script.later([writeAllGuilds(SELF_ID, [bakers, alpha]), writeGuild(SELF_ID, bakers)]));
  gateway.pushCache(script.later([
    writeQueryPlayerData(SELF_ID, WEBBY, 'Webby', player(40, 1)), writeQueryPlayerData(SELF_ID, LEAD, 'Lead', player(60, 1)),
    writeQueryPlayerData(SELF_ID, MIA, 'Mia', player(35, 1)), writeQueryPlayerData(SELF_ID, RIVAL, 'Rival', player(45, 1)),
  ]));

  // the count-down of the war's end, centred, ticking hh:mm:ss
  const clock = page.locator('.hud-siege-clock');
  await expect(clock).toHaveText(/^End combat 00:(29|30):\d\d$/, ON_FRAMES);
  const guildRows = page.locator('[data-board="guild"] .hud-siege-row');
  const playerRows = page.locator('[data-board="player"] .hud-siege-row');
  const list = page.locator('.hud-siege-guild');
  await expect(list.locator('.hud-siege-title')).toHaveText('Bakers', ON_FRAMES);
  // the own guild's list: lives max(n - 1, 0), Mia next in (green), Lead the defender
  await expect(list.locator('.hud-siege-member')).toHaveCount(3);
  await expect(list.locator('.hud-siege-lives')).toHaveText(['5', '3', '5']);
  await expect(list.locator('.hud-siege-member').nth(1).locator('.hud-siege-defender')).toHaveText('D');
  await expect(list.locator('.hud-siege-member').nth(2)).toHaveCSS('color', 'rgb(0, 203, 0)');
  // the minimap mask is not converted yet: no mask, the map's tile still drawn
  await expect(page.locator('.navigator-map img[src*="wdguildwar"]').first()).toBeAttached(ON_FRAMES);
  await expect(page.locator('.navigator-mask')).toHaveCount(0);

  if (!isPhone()) {
    // Neuz's boards: every guild, the top 10 players and Webby's own row, at (width - 150, 200)
    await expect(guildRows).toHaveCount(12);
    await expect(playerRows).toHaveCount(11);
    await expect(playerRows.nth(10)).toHaveText(/12\s*Webby\.\.\.\s*2/);
    const board = (await page.locator('[data-board="guild"]').boundingBox())!;
    const hud = (await page.locator('.world-hud').boundingBox())!;
    expect([Math.round(board.x + board.width), Math.round(board.y)]).toEqual([Math.round(hud.x + hud.width - 10), Math.round(hud.y + 190)]);
    await shot('arena-desktop');
  } else {
    // the phone: the top 5 and the own row on each board; clear of Attack, the quick slots, Jump, Action Slot and the task bar
    await expect(guildRows).toHaveCount(6, ON_FRAMES);
    await expect(guildRows.nth(5)).toHaveText(/8\s*Baker\.\.\.\s*50/);
    await expect(playerRows).toHaveCount(6);
    await expect(page.locator('.hud-quick-slot')).toHaveCount(7);
    // final review, Important 2: a full line-up of 10 with Webby waiting 8th: the phone's list shows the five inside, the
    // next in and Webby's own row, under the status window, clear of Attack, the quick slots, the chat and the task bar
    answer(gateway, script, {
      sub: 'guildStatus', joinIndex: 5, players: [
        ...[LEAD, MIA, 73001, 73002, 73003, 73004, 73005].map((playerId) => ({ playerId, lives: 6 })),
        { playerId: WEBBY, lives: 3 }, { playerId: 73006, lives: 0 }, { playerId: 73007, lives: 0 },
      ],
    });
    await expect(list.locator('.hud-siege-member')).toHaveCount(7, ON_FRAMES);
    await expect(list.locator('.hud-siege-member').nth(5)).toHaveCSS('color', 'rgb(0, 203, 0)');
    await expect(list.locator('.hud-siege-member').last().locator('.hud-siege-number')).toHaveText(/^\s*8$/);
    await expect(list.locator('.hud-siege-member').last().locator('.hud-siege-name')).toHaveText('Webby...');
    const clashes = () => page.evaluate(() => {
      const boxes = (selector: string) => [...document.querySelectorAll(selector)]
        .map((element) => ({ name: `${element.className}`, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0);
      const meets = (a: DOMRect, c: DOMRect): boolean => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
      const boards = boxes('.hud-siege-board');
      const controls = boxes('.hud-attack, .hud-quick-slot, .hud-jump, .hud-action-trigger, .hud-taskbar-strip');
      const lists = boxes('.hud-siege-guild');
      const chats = boxes('.hud-neuz-chat');
      const found: string[] = [];
      if (boards.length !== 2) found.push(`${boards.length} boards`);
      if (controls.length < 10) found.push(`${controls.length} controls`);
      if (lists.length !== 1) found.push(`${lists.length} own lists`);
      if (chats.length !== 1) found.push(`${chats.length} chats`);
      const [a, b] = boards.map(({ box }) => box);
      if (a !== undefined && b !== undefined && meets(a, b)) found.push('the boards overlap');
      for (const { box: b } of boards) {
        if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) found.push('a board off the screen');
        for (const { name, box: c } of controls) if (meets(b, c)) found.push(`a board over ${name}`);
      }
      for (const { box: l } of lists) {
        if (l.left < 0 || l.top < 0 || l.right > innerWidth || l.bottom > innerHeight) found.push('the own list off the screen');
        for (const { name, box: c } of [...controls, ...chats, ...boards]) if (meets(l, c)) found.push(`the own list over ${name}`);
      }
      return found;
    });
    for (const size of [null, { width: 568, height: 320 }, { width: 730, height: 320 }]) {
      if (size !== null) await page.setViewportSize(size);
      await page.waitForTimeout(800);
      await expect.poll(clashes, ON_FRAMES).toEqual([]);
      await shot(`arena-phone-${size?.width ?? 'pixel7'}`);
    }
    // a tap on a board's title folds it, another unfolds it
    const title = page.locator('[data-board="guild"] .hud-siege-title');
    await title.tap();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await expect(guildRows.first()).toBeHidden();
    await title.tap();
    await expect(guildRows.first()).toBeVisible();
  }

  // PvP: the rival of another guild, both fighting at WAR_WAR, is attacked (a second click, the Attack button on the phone):
  // the attack command walks to it (PLAYERSETDESTOBJ at it, CMD_SetMeleeAttack's SetDestObj) and swings once in range. The
  // command alone proves the rule (IsAttackAble); the swing also needs the walk, which the arena's props may stop.
  const swings = () => sentOf(gateway, PacketType.MELEE_ATTACK).filter((s) => s.body.readUInt32LE(12) === RIVAL_ID);
  const approaches = () => sentOf(gateway, PacketType.PLAYERSETDESTOBJ).filter((s) => s.body.readUInt32LE(8) === RIVAL_ID);
  await tapMover(page, RIVAL_ID);
  await expect.poll(() => targetsOf(gateway).some(([t]) => t === RIVAL_ID), ON_FRAMES).toBe(true);
  if (isPhone()) {
    const attack = page.locator('.hud-attack');
    await expect(attack).toBeEnabled(ON_FRAMES);
    await attack.tap();
  } else {
    await tapMover(page, RIVAL_ID);
  }
  await expect.poll(() => approaches().length + swings().length, ON_FRAMES).toBeGreaterThan(0);

  // a kill: one white line in the chat, Neuz's English format
  answer(gateway, script, {
    sub: 'logRealtime', atkGuildId: GUILD, defGuildId: ALPHA, atkName: 'Webby', defName: 'Rival', atkPlayerId: WEBBY, defPlayerId: RIVAL,
    point: 3, diffGuild: true, master: true, defender: false, lastLife: false,
  });
  await expect(page.locator('.hud-neuz-chat')).toContainText('[Bakers][Webby] has killed [Alpha][Rival] and has gained 3 points.', ON_FRAMES);
  // the war's end: its caption
  answer(gateway, script, { sub: 'gcState', state: 3, warState: 105 });
  await expect(page.locator('.hud-caption')).toContainText('End combat', ON_FRAMES);
  await shot('arena-end');
});

// B6: Donaris's ranking window and the result window.
test('Ranking and result: the tabs, the rows, the own row, the battle log and Save', async ({ page }, info) => {
  const script = worldWith('MaFl_Donaris');
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  gateway.pushCache(script.later([
    writeQueryPlayerData(SELF_ID, WEBBY, 'Webby', player(40, 1)), writeQueryPlayerData(SELF_ID, LEAD, 'Lead', player(60, 1)),
    writeQueryPlayerData(SELF_ID, MIA, 'Mia', player(35, 1)),
  ]));

  // Donaris's Ranking asks, the answer opens the window: the own player is Webby's character (SELF_PLAYER's id)
  await chooseEntry(page, gateway, 30);
  await expect.poll(() => sentOf(gateway, GuildCombatPacketType.PLAYERPOINT).length).toBe(1);
  answer(gateway, script, { sub: 'playerPoint', players: [
    { playerId: LEAD, job: 6, point: 9 }, { playerId: MIA, job: 8, point: 9 }, { playerId: WEBBY, job: 12, point: 4 },
    { playerId: 99999, job: 6, point: 3 }, { playerId: 88888, job: 0, point: 50 },
  ] });
  // Donaris's window, not the owner's Siege Ranking window (C2), which shares its look and class (hud-sr besides)
  const rank = page.locator('.hud-gc-rank:not(.hud-sr)');
  await expect(rank).toBeVisible(ON_FRAMES);
  await expect(rank.locator('.hud-window-title')).toHaveText('Guild Member Ranking');
  await expect(rank.locator('[role="tab"]')).toHaveText(['United Rank', 'Mercenary', 'Magician', 'Acrobat', 'Assist']);
  const rows = rank.locator('.hud-gc-rank-row:visible');
  await expect(rows).toHaveCount(4); // the vagrant is left out
  await expect(rows.first()).toContainText('Mia'); // of equal points the later entry first
  await expect(rows.first()).toHaveCSS('color', 'rgb(200, 0, 0)');
  await expect(rows.nth(1).locator('.hud-gc-rank-c0')).toHaveText('');
  await expect(rows.nth(3)).toContainText('?'); // a name that never came
  await phoneChecks(page, rank);
  await shot('ranking');
  await press(rank.getByRole('tab', { name: 'Magician' }));
  await expect(rank.locator('.hud-gc-rank-row:visible')).toHaveCount(1);
  await expect(rank.locator('.hud-gc-rank-own:visible')).toContainText('Webby');
  await press(rank.getByRole('button', { name: 'Close' }));
  await expect(rank).toBeHidden();

  // GC_LOG opens the result window: the boards first, the battle log on its tab
  answer(gateway, script, { sub: 'guildPrecedence', guilds: [{ has: true, name: 'Bakers', points: 7 }, { has: true, name: 'Alpha', points: 3 }] });
  answer(gateway, script, { sub: 'playerPrecedence', guilds: [[{ playerId: LEAD, points: 5 }, { playerId: MIA, points: 2 }]] });
  answer(gateway, script, { sub: 'bestPlayer', playerId: LEAD });
  answer(gateway, script, { sub: 'log', entries: [
    { atkGuildId: 4001, defGuildId: 4002, atkPlayerId: LEAD, defPlayerId: MIA, point: 3, diffGuild: true, master: false, defender: false, lastLife: true },
  ] });
  const result = page.locator('.hud-gc-result');
  await expect(result).toBeVisible(ON_FRAMES);
  await expect(result.locator('.hud-window-title')).toHaveText('Guild & Member Ranking');
  await expect(result.locator('.hud-gc-result-guilds')).toContainText('WINNER');
  await expect(result.locator('.hud-gc-result-members')).toContainText('MVP');
  await phoneChecks(page, result);
  await shot('result');
  await press(result.getByRole('tab', { name: 'Battle Log' }));
  const log = result.locator('.hud-gc-result-log');
  await expect(log).toContainText('[?]'); // guilds the client does not know
  await expect(log).toContainText('Lead(3 grade)');
  await expect(log).toContainText('Kill bonus +1');
  await shot('result-log');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    press(result.getByRole('button', { name: 'Save' })),
  ]);
  expect(download.suggestedFilename()).toMatch(/^GuildLog_\d{8}\.txt$/);
  await expect(box(page)).toContainText('GuildLog_', ON_FRAMES);
  await closeBox(page);
  await press(result.locator('.hud-window-close, [data-button="close"]').first());
  await expect(result).toBeHidden();
});
