// 2026-11-15 (Guild Siege, B3): Frankie's and Donaris's menus and windows (docs/guild-siege/research/A-client.md §1, §2.1-2.8,
// §3.2), played against a scripted world server on the desktop (clicks) and on the phone (taps): Apply opens the offer with the
// minimum bid and OK sends GC_IN_APP; Status shows the list and the count-down; walking away closes the NPC windows; the boards
// show the owner's rules; Donaris's Cancel asks first, Jackpot stays silent for a player who is not the guild master, and the
// server's GC_GETPENYAGUILD, GC_TELE and GC_DIAGMESSAGE become their boxes. The siege's button pictures are not converted
// yet, so their loads fail in the console: the windows still work (their buttons are found by their names).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ArReader, GuildCombatPacketType, readGuildCombatRequestPacket } from '@flyffweb/protocol';
import type { AddedMover, GuildCombatMessage, PlayerDataRecord } from '@flyffweb/protocol';
import {
  createWorldScript, guildMember, guildWhole, writeAddNpc, writeAddSelf, writeAllGuilds, writeGuild, writeGuildCombat, writeQueryPlayerData,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { NPC_ID, ON_FRAMES, SELF_ID, SQUARE, MADRIGAL, enterFlaris, julia, playGateway, self, sentOf, tapMover, tapWorld, targetsOf } from './worldHarness';
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
const worldWith = (characterKey: string): WorldScript => createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddNpc(NPC_ID, npcOf(characterKey))],
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
  const script = worldWith('MaFl_GuildWar');
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
