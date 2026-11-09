// Piece 7 M4, Part A: parties in the world, played against a scripted world server ([R §5]-[R §9]): the invite from a
// player's menu, an invite received, the party chat, a mode radio, a member out of view, and the party through a world
// change and a log-out. Webby is player 500 (the harness's character list); Lead, player 70002, stands in view.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { decodeTileBin } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';
import { ArReader, ArWriter, NULL_ID, PacketType, ShortcutKind } from '@flyffweb/protocol';
import type { AddedMover, PartyBlock, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, writeAddPlayer, writeAddSelf, writePartyChangeLeader, writePartyChat, writeReplace, writePartyItemMode, writePartyMember, writePartyRequest,
  writeQueryPlayerData, writeSetPartyMode, writeTaskBar,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  ASSETS, BASE, MADRIGAL, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, hudTexts, logOut, playGateway,
  recordHudTexts, self, sentOf, tapEnter, tapMover, targetsOf,
} from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const FAR = 70003;
const LEAD_ID = 9300;
const LEAD_AT: Vec3 = [6967, groundAt(6967, 3323), 3323];
/** A vagrant of level 1 with no STA: 80 HP at most (`GetMaxOriginHitPoint`), so 80 is a full bar. */
const lead: AddedMover = {
  ...BASE, hitPoint: 80, index: MI_MALE, pos: LEAD_AT, angle: 180, objectId: LEAD_ID, isPlayer: true,
  player: { ...SELF_PLAYER, self: false, name: 'Lead', playerId: LEAD, level: 1, job: 0, equipmentObjectIds: [] },
};

// Mars Mine, where travel.spec.ts goes: a point on its ground
const MARS = 200;
const index: AssetIndex = JSON.parse(readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const manifest: WorldManifest = JSON.parse(readFileSync(path.join(ASSETS, index.files['worlds/duflmas/manifest.json']!), 'utf8'));
const side = manifest.mapSize * manifest.mpu;
const [mx, mz] = [850, 686];
const tileFile = path.join(ASSETS, manifest.tiles[`${Math.floor(mx / side)}_${Math.floor(mz / side)}`]!);
const marsTile = decodeTileBin(new Uint8Array(readFileSync(tileFile)), tileFile);
const MARS_POS: Vec3 = [mx, sampleHeight(marsTile, mx - Math.floor(mx / side) * side, mz - Math.floor(mz / side) * side, manifest.mpu), mz];

const scriptOf = (): WorldScript => createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self), others: [writeAddPlayer(LEAD_ID, lead)],
});

const partyOf = (members: number[], itemMode = 0): PartyBlock => ({
  partyId: 1, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: '',
  members: members.map((playerId) => ({ playerId, removed: false })),
});

/** The u32 and i32 fields of a packet the page sent, after DPID_UNKNOWN and the type. */
const fieldsOf = (body: Buffer, count: number): number[] =>
  Array.from({ length: count }, (_, i) => body.readInt32LE(8 + 4 * i));

/** Start → Party: the party window (and with 2 members the quick view), as P does. */
async function openParty(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Party', exact: true }).click();
  await expect(page.locator('.hud-party')).toBeVisible();
}

const rows = (page: Page) => page.locator('.hud-party .hud-party-row');
const column = (page: Page, key: string) => rows(page).locator(`[data-column="${key}"]`);

test('invite from the player menu: MEMBERREQUEST; the new party fills the window and the chat', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  // the desktop: a right click let go on Lead; the phone: a tap selects Lead, a second tap opens the menu
  if (test.info().project.use.hasTouch === true) {
    await tapMover(page, LEAD_ID);
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === LEAD_ID)).toBe(true);
    await tapMover(page, LEAD_ID);
  } else {
    const at = (await page.evaluate((id) => window.__client!.screenOf(id), LEAD_ID))!;
    const box = (await page.locator('.world-view canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1], { button: 'right' });
  }
  const menu = page.locator('.hud-mover-menu');
  await expect(menu).toBeVisible();
  const entries = menu.locator('[data-menu-entry]');
  expect(await entries.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.menuEntry))).toEqual(['2', '5', '6', '12', '24', '31', '151']);
  await menu.locator('[data-menu-entry="6"]').click();
  await expect.poll(() => sentOf(gateway, PacketType.MEMBERREQUEST).length).toBe(1);
  expect(fieldsOf(sentOf(gateway, PacketType.MEMBERREQUEST)[0]!.body, 3)).toEqual([WEBBY, LEAD, 0]);

  await recordHudTexts(page);
  gateway.pushCache(script.later([writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', partyOf([WEBBY, LEAD]))]));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toEqual(expect.arrayContaining(['Party has been created.', 'Lead has joined the party.']));
  await openParty(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(column(page, 'mark')).toHaveText(['L', 'M']);
  await expect(column(page, 'name')).toHaveText(['Webby', 'Lead']);
  await expect(rows(page).nth(1).locator('.hud-party-hp-fill')).toHaveCSS('width', '110px');
  // 2026-11-05: the tab pictures sit in one row inside their strip (each was a block, stacked into a long bar down the
  // screen), and the title is white
  const strip = (await page.locator('.hud-party .hud-party-tabs').boundingBox())!;
  const tiles = await page.locator('.hud-party .hud-party-tabs > div').evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return [r.top, r.bottom]; }));
  expect(tiles.length).toBeGreaterThan(0);
  for (const [top, bottom] of tiles) {
    expect(top).toBeGreaterThanOrEqual(strip.y - 1);
    expect(bottom).toBeLessThanOrEqual(strip.y + strip.height + 1);
  }
  await expect(page.locator('.hud-party .hud-window-title')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.hud-party-quick-window')).toBeVisible();
  await expect(page.locator('.hud-party-quick-row:not([hidden])')).toHaveCount(2);
});

test("an invite received: the box, Yes sends ADDPARTYMEMBER with the request's values, a second invite meanwhile sends BLOCK", async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const leaderSide = { id: LEAD, level: 1, job: 0, sex: 0 };
  const memberSide = { id: WEBBY, level: 15, job: 0, sex: 0 };
  gateway.pushCache(script.later([writePartyRequest(SELF_ID, leaderSide, memberSide, 'Lead')]));
  const box = page.locator('.hud-party-confirm');
  await expect(box).toContainText('Lead invites you to join the party. Do you accept?');
  gateway.pushCache(script.later([writePartyRequest(SELF_ID, { ...leaderSide, id: FAR }, memberSide, 'Other')]));
  await expect.poll(() => sentOf(gateway, PacketType.BLOCK).length).toBe(1);
  const block = new ArReader(new Uint8Array(sentOf(gateway, PacketType.BLOCK)[0]!.body));
  block.u32(); block.u32();
  expect([block.u8(), block.string(64), block.string(64)]).toEqual([7, 'Webby', 'Other']);
  await box.getByRole('button', { name: 'Yes' }).click();
  await expect.poll(() => sentOf(gateway, PacketType.ADDPARTYMEMBER).length).toBe(1);
  expect(fieldsOf(sentOf(gateway, PacketType.ADDPARTYMEMBER)[0]!.body, 8)).toEqual([LEAD, 1, 0, 0, WEBBY, 15, 0, 0]);
  await expect(box).toBeHidden();
});

test('party chat: the Party view sends "/p text"; a PARTYCHAT shows its line', async ({ page, isMobile }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', partyOf([WEBBY, LEAD]))]));
  // the chat opened, then its Party view; on the desktop (2026-11-09) Neuz's Party tab, enabled in a party, which puts
  // "/p " in the line (WndCommunication.cpp:212-216, :708-713)
  const chatWindow = page.locator(isMobile ? '.hud-chat' : '.hud-neuz-chat');
  const input = chatWindow.getByRole('textbox', { name: 'Chat message' });
  if (isMobile) {
    await chatWindow.getByRole('button', { name: 'Chat', exact: true }).click();
    await chatWindow.locator('[data-view="party"]').click();
    await input.fill('hello team');
  } else {
    await chatWindow.getByRole('radio', { name: 'Party' }).click();
    await expect(input).toHaveValue('/p ');
    await input.press('End'); await input.pressSequentially('hello team');
  }
  await input.press('Enter');
  const CHAT = 0xff0000;
  await expect.poll(() => sentOf(gateway, CHAT).length).toBe(1);
  const chat = new ArReader(new Uint8Array(sentOf(gateway, CHAT)[0]!.body));
  chat.u32(); chat.u32();
  // both chats send it as Neuz's party chat does: "/p text" (TextCmd_PartyChat's client half, FuncTextCmd.cpp:2107-2128)
  expect(chat.string(1024)).toBe('/p hello team');
  gateway.pushCache(script.later([writePartyChat(SELF_ID, LEAD_ID, 'Lead', 'hi back')]));
  await expect(page.locator('.chat-transcript, .hud-neuz-chat .neuz-chat-text')).toContainText(isMobile ? 'hi back' : '[Lead] hi back');
});

test("the leader's item radio sends PARTYCHANGEITEMMODE once; the echo checks it", async ({ page }) => {
  const script = scriptOf();
  script.on('partyItemModeChange', (p) => (p.type === 'partyItemModeChange' ? [writePartyItemMode(SELF_ID, p.mode)] : []));
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', partyOf([WEBBY, LEAD]))]));
  await openParty(page);
  const radio = page.locator('.hud-party [data-radio="item1"]');
  await expect(page.locator('.hud-party [data-radio="item0"]')).toHaveAttribute('aria-checked', 'true');
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
  expect(sentOf(gateway, PacketType.PARTYCHANGEITEMMODE).map((s) => fieldsOf(s.body, 2))).toEqual([[WEBBY, 1]]);
  // a member's radio: the box TID_DIAG_0008, which holds the world (its keys let go, the joystick hidden) until OK
  gateway.pushCache(script.later([writePartyChangeLeader(SELF_ID, LEAD)]));
  await expect(rows(page).first().locator('[data-column="name"]')).toHaveText('Lead');
  await page.locator('.hud-party [data-radio="item2"]').click();
  const box = page.getByRole('group', { name: 'Message Box' });
  await expect(box).toBeVisible();
  await expect(page.locator('.world')).toHaveClass(/world-modal/);
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('.world')).not.toHaveClass(/world-modal/);
  expect(sentOf(gateway, PacketType.PARTYCHANGEITEMMODE)).toHaveLength(1);
});

test('a member out of view is queried once; the answer names its row', async ({ page }) => {
  const script = scriptOf();
  script.on('queryPlayerData', (p) => (p.type === 'queryPlayerData' && p.playerId === FAR
    ? [writeQueryPlayerData(SELF_ID, FAR, 'Faraway', { job: 0, level: 7, sex: 0, version: 1, login: 1 })] : []));
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writePartyMember(SELF_ID, FAR, 'Webby', 'Faraway', partyOf([WEBBY, LEAD, FAR]))]));
  await openParty(page);
  await expect(column(page, 'name')).toHaveText(['Webby', 'Lead', 'Faraway']);
  await expect(column(page, 'level').nth(2)).toHaveText('7');
  // a few frames more: still the one query
  await page.waitForTimeout(500);
  expect(sentOf(gateway, PacketType.QUERY_PLAYER_DATA).map((s) => fieldsOf(s.body, 2))).toEqual([[FAR, 0]]);
});

test('the party stays through a world change; a log-out clears it', async ({ page }) => {
  const scripts: WorldScript[] = [];
  const gateway = await playGateway(page, () => { const script = scriptOf(); scripts.push(script); return script; });
  await enterFlaris(page);
  gateway.pushCache(scripts.at(-1)!.later([writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', partyOf([WEBBY, LEAD]))]));
  await openParty(page);
  await expect(rows(page)).toHaveCount(2);
  // to Mars Mine and back: each world's windows are new; the party is the screen's (plan Decisions 3)
  gateway.pushCache(new ArWriter().u32(PacketType.REPLACE).u32(MARS).vec3(MARS_POS).toBytes());
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeHidden();
  gateway.pushCache(scripts.at(-1)!.later([writeAddSelf(SELF_ID, { ...self, pos: MARS_POS })]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MARS));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await openParty(page);
  await expect(rows(page)).toHaveCount(2);
  gateway.pushCache(scripts.at(-1)!.later([writeReplace(NULL_ID, MADRIGAL, SQUARE), writeAddSelf(SELF_ID, self), writeAddPlayer(LEAD_ID, lead)]));
  await expect(page.locator('.world')).toHaveAttribute('data-world-id', String(MADRIGAL));
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 60_000 });
  await logOut(page);
  await tapEnter(page);
  await page.evaluate(() => window.__client!.ready());
  await openParty(page);
  await expect(rows(page)).toHaveCount(0);
  gateway.pushCache(scripts.at(-1)!.later([writePartyMember(SELF_ID, WEBBY, 'Webby', '', partyOf([WEBBY, LEAD]))]));
  await expect(rows(page)).toHaveCount(2);
});

/** An advanced party at level 20, Webby leading: Linked Attack (level 20) is the leader's. */
const advanced = (members: number[]): PartyBlock => ({ ...partyOf(members), kind: 1, level: 20, point: 10, name: 'Winners' });

test('an advanced party at level 20: the Skill tab, and a task bar party skill sends PARTYSKILLUSE', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  // the own TASKBAR with Linked Attack (m_dwType 2, m_dwId 5) on F1
  gateway.pushCache(script.later([
    writeTaskBar(SELF_ID, {
      applets: [], queue: [], actionPoint: 0,
      items: [{ bar: 0, slot: 0, shortcut: { kind: ShortcutKind.SKILL, id: 5, type: 2, index: 0, userId: 0, data: 1, text: '' } }],
    }),
    writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', advanced([WEBBY, LEAD])),
  ]));
  await openParty(page);
  await page.locator('.hud-party .hud-party-tab', { hasText: 'Skill' }).click();
  const skills = page.locator('.hud-party .hud-party-skill');
  await expect(skills).toHaveCount(8);
  await expect(skills.nth(4).locator('.hud-party-skill-name')).toHaveText('Linked Attack');
  await expect(skills.nth(4).locator('.hud-party-skill-name')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(skills.nth(5).locator('.hud-party-skill-name')).toHaveCSS('color', 'rgb(255, 0, 0)');
  const slot = page.locator('.hud-slot[data-row="item"][data-slot="0"]');
  await expect(slot).toHaveAttribute('data-kind', 'skill');
  await slot.click();
  await expect.poll(() => sentOf(gateway, PacketType.PARTYSKILLUSE).map((s) => fieldsOf(s.body, 2))).toEqual([[WEBBY, 5]]);
});

test('SETPARTYMODE on: the icon at the top, the chat line, the effect on the leader; off: the line', async ({ page }) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  gateway.pushCache(script.later([writePartyMember(SELF_ID, LEAD, 'Webby', 'Lead', advanced([WEBBY, LEAD]))]));
  await recordHudTexts(page);
  // Linked Attack's mode (0) on for 20 s
  gateway.pushCache(script.later([writeSetPartyMode(SELF_ID, 0, 20000, true, 9)]));
  await expect(page.locator('.hud-party-buffs .hud-party-buff[data-skill="5"]')).toBeVisible();
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('The party skill Linked Attack has been used.');
  // its effect on the leader, Webby (XI 1505, DPClient.cpp:5130-5150)
  await expect.poll(async () => (await page.evaluate(() => window.__client!.played())).effects.map((e) => e.xi)).toContain(1505);
  gateway.pushCache(script.later([writeSetPartyMode(SELF_ID, 0, 0, false)]));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('The effect of Linked Attack is about to end.');
});
