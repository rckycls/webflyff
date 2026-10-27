// Landscape for the whole game (Piece 4 spec §3.10): the cover over a page taller than wide, the lobby's screens and the
// world laid out for a landscape phone (844 x 390 CSS px), and a fight that goes on while the phone is upright (Review
// Focus 5). The servers are scripted as world.spec.ts scripts them: every WebSocket the page opens is answered by the
// certifier, the login server or the cache server (with the world server behind it, `createWorldScript`), and the world
// drawn is the converted Flaris in the worktree's dist/assets.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { MAP_SIZE, decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { ArWriter, NULL_ID, PacketType, Port } from '@flyffweb/protocol';
import type { AddedMover, AddedNpc, AddedPlayer, Vec3 } from '@flyffweb/protocol';
import { sampleHeight } from '@flyffweb/scene';
import { createWorldScript, writeAddMonster, writeAddSelf, writeDamage } from '@flyffweb/testkit';
import type {} from '../src/testHooks'; // window.__client

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/assets');

/** The plan's texts of the cover (plan-header's table of texts not from the catalogs). */
const TOUCH_TEXT = 'Turn your device sideways to play.';
const PC_TEXT = 'Make the window wider to play.';

/** A landscape phone (an iPhone 13's screen, 844 x 390 CSS px), and the same phone upright. */
const LANDSCAPE = { width: 844, height: 390 };
const UPRIGHT = { width: 390, height: 844 };

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen.
test.describe.configure({ timeout: 120_000 });

// ---- the servers, as world.spec.ts plays them ---------------------------------------------------------------------------

/** `WI_WORLD_MADRIGAL`, `MI_MALE` and the Aibatt (`MI_AIBATT2`), as world.spec.ts has them. */
const MADRIGAL = 1;
const MI_MALE = 11;
const MI_AIBATT = 21;
/** `OBJSTA_STAND` (`MoverMsg.h`). */
const OBJSTA_STAND = 0x01;
/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`): the own character's equipment object IDs. */
const MAX_HUMAN_PARTS = 31;
/** The vagrant's clothes (jobItem.inc): `II_ARM_M_VAG_SUIT01`, `_GAUNTLET01`, `_BOOTS01`. */
const MALE_VAGRANT = [502, 506, 510];

function readAsset<T>(file: string): T {
  if (!existsSync(path.join(ASSETS, 'index.json'))) throw new Error(`${ASSETS}/index.json is missing: run \`npm run convert\` first`);
  return JSON.parse(readFileSync(path.join(ASSETS, file), 'utf8')) as T;
}

/** The terrain height at client (D3D) x, z of Madrigal, as `CLandscape::GetHeight` gives it. */
function groundAt(x: number, z: number): number {
  const index = readAsset<AssetIndex>('index.json');
  const manifest = readAsset<WorldManifest>(index.files['worlds/wdmadrigal/manifest.json']!);
  const side = MAP_SIZE * manifest.mpu;
  const tx = Math.floor(x / side);
  const tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu);
}

const SELF_ID = 9000;
const MONSTER_ID = 9001;

/** Webby on Flaris' town square facing south, and an Aibatt 6 m ahead and 2.5 m to the side, facing it (world.spec.ts). */
function flaris() {
  const square: Vec3 = [6968, groundAt(6968, 3328), 3328];
  const monsterAt: Vec3 = [6965.5, groundAt(6965.5, 3322), 3322];
  const base = { scale: 1, motion: 0, hitPoint: 100, state: OBJSTA_STAND, stateFlag: 0, belligerence: 0, sfxId: 0 };
  const player: AddedPlayer = {
    self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0xff907b6d, headMesh: 0, playerId: 500, job: 0,
    sta: 0, dex: 0, level: 15, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1,
    worn: [], equipmentObjectIds: Array.from({ length: MAX_HUMAN_PARTS }, () => NULL_ID), own: null, shopTitle: '',
  };
  const npc: AddedNpc = {
    hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [], activeAttack: 0, movePattern: 0, moveEvent: 0,
    moveEventCount: 0, speedFactor: 1,
  };
  const self: AddedMover = { ...base, index: MI_MALE, pos: square, angle: 0, objectId: SELF_ID, isPlayer: true, player };
  const aibatt: AddedMover = { ...base, index: MI_AIBATT, pos: monsterAt, angle: 180, objectId: MONSTER_ID, isPlayer: false, npc };
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: square, self: writeAddSelf(SELF_ID, self),
    others: [writeAddMonster(MONSTER_ID, aibatt)],
  });
  return { script, square };
}

const AUTH_KEY = 7;
/** `ERROR_DUPLICATE_ACCOUNT`, the account logged in elsewhere (lobby.spec.ts). */
const DUPLICATE_ACCOUNT = 103;

/** FlyFF with four channels: one to pick, one offline, one full and another to pick. */
function serverList(): Buffer {
  const w = new ArWriter().u32(PacketType.SRVR_LIST).u32(AUTH_KEY).u8(0).string('webtester').u32(5);
  w.u32(NULL_ID).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0);
  const channels: Array<[number, string, number, number]> = [[1, 'Channel 1', 12, 1], [2, 'Channel 2', 0, 0], [3, 'Channel 3', 500, 1], [4, 'Channel 4', 40, 1]];
  for (const [id, name, players, enabled] of channels) w.u32(1).u32(id).string(name).string('').i32(0).i32(players).i32(enabled).i32(500);
  return Buffer.from(w.toBytes());
}

/** Webby in Madrigal on Flaris' square, dressed as a vagrant (`CDPLoginClient::OnPlayerList`'s order). */
function playerList(square: Vec3): Buffer {
  const w = new ArWriter().u32(PacketType.PLAYER_LIST).u32(AUTH_KEY).i32(1);
  w.i32(0).i32(0).u32(MADRIGAL).u32(MI_MALE).string('Webby').vec3(square)
    .u32(500).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0xff907b6d).u32(0).u8(0).i32(0).i32(15).u32(0)
    .i32(15).i32(15).i32(15).i32(15).u32(0).i32(MALE_VAGRANT.length);
  for (const id of MALE_VAGRANT) w.u32(id);
  return Buffer.from(w.i32(0).toBytes());
}

/** A packet the page sent on the cache connection: its type and its whole body. */
interface Sent {
  type: number;
  body: Buffer;
}

interface Gateway {
  /** The packets the page sent to the cache server so far. */
  cache: Sent[];
  /** Sends a packet to the page on the cache connection, as the world server does between the page's packets. */
  pushCache(packet: Uint8Array): void;
}

/**
 * Plays the gateway and the servers behind it: the certifier (refusing the first login as an account logged in elsewhere
 * when `duplicateFirst`), the login server and the cache server with Flaris.
 */
async function playGateway(page: Page, { duplicateFirst = false } = {}): Promise<Gateway & { script: ReturnType<typeof flaris>['script'] }> {
  const { script, square } = flaris();
  const gateway = {
    script, cache: [] as Sent[], pushCache: (_packet: Uint8Array): void => {
      throw new Error('no cache connection yet');
    },
  };
  let certifies = 0;
  await page.routeWebSocket(/\/connect\//, (ws) => {
    const port = Number(new URL(ws.url()).pathname.split(':').pop());
    if (port === Port.CACHE) gateway.pushCache = (packet) => ws.send(Buffer.from(packet));
    ws.onMessage((message) => {
      const body = Buffer.from(message as Buffer);
      // Packets to the certifier start with the type; to the login and cache servers with DPID_UNKNOWN.
      const type = body.readUInt32LE(port === Port.CERTIFIER ? 0 : 4);
      const reply = (packet: Uint8Array) => ws.send(Buffer.from(packet));
      if (port === Port.CERTIFIER) {
        if (type !== PacketType.CERTIFY) return;
        certifies++;
        if (duplicateFirst && certifies === 1) reply(new ArWriter().u32(PacketType.ERROR).i32(DUPLICATE_ACCOUNT).toBytes());
        else reply(serverList());
      } else if (port === Port.LOGIN) {
        if (type === PacketType.QUERYTICKCOUNT) {
          reply(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(body.readUInt32LE(8)).i64(123456789n).toBytes());
        }
        if (type === PacketType.GETPLAYERLIST) {
          reply(new ArWriter().u32(PacketType.CACHE_ADDR).string('172.31.238.55').toBytes());
          reply(playerList(square));
        }
        script.answer('login', body).forEach(reply);
      } else {
        gateway.cache.push({ type, body });
        script.answer('cache', body).forEach(reply);
      }
    });
  });
  return gateway;
}

async function logIn(page: Page): Promise<void> {
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Logs in, picks Channel 1 and enters with Webby; resolves once the world is on screen, with its task bar. */
async function enterFlaris(page: Page): Promise<void> {
  await page.goto('/');
  await logIn(page);
  await page.getByRole('button', { name: /Channel 1/ }).click();
  await page.getByRole('button', { name: 'Enter Webby' }).click();
  await page.evaluate(() => window.__client!.ready());
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

/** Taps the world's drawing at `x`, `y` (shares of its width and height), with the mouse (Chromium's desktop project). */
async function tapWorld(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

async function tapMover(page: Page, objectId: number): Promise<void> {
  const at = await page.evaluate((id) => window.__client!.screenOf(id), objectId);
  expect(at).not.toBeNull();
  await tapWorld(page, at![0], at![1]);
}

/** The SETTARGETs the page sent (`CDPClient::SendSetTarget`): after DPID_UNKNOWN and the type, the target and `bClear`. */
const targetsOf = (gateway: Gateway): Array<[number, number]> =>
  gateway.cache.filter((s) => s.type === PacketType.SETTARGET).map(({ body }) => [body.readUInt32LE(8), body.readUInt8(12)]);
const swingsOf = (gateway: Gateway): number => gateway.cache.filter((s) => s.type === PacketType.MELEE_ATTACK).length;

// ---- what is on screen --------------------------------------------------------------------------------------------------

const cover = (page: Page): Locator => page.locator('.landscape-cover');

/** The page's whole size: as big as the window when nothing makes it scroll either way. */
async function expectNoScroll(page: Page, what: string): Promise<void> {
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
  }));
  expect(size, `${what} scrolls`).toEqual(page.viewportSize());
}

/** The element's box is on the screen, whole. */
async function expectOnScreen(locator: Locator, what: string): Promise<void> {
  const box = await locator.boundingBox();
  const { width, height } = locator.page().viewportSize()!;
  if (box === null) throw new Error(`${what} is not drawn`);
  expect([box.x >= 0, box.y >= 0, box.x + box.width <= width + 0.5, box.y + box.height <= height + 0.5], `${what} at ${JSON.stringify(box)}`)
    .toEqual([true, true, true, true]);
}

/** Whether a tap at the middle of `locator` lands on it (nothing covers it). */
async function tapLandsOn(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return top !== null && element.contains(top);
  });
}

test.describe('landscape (spec §3.10)', () => {
  test('the cover shows over the login form while the page is upright, and goes once it is wide again', async ({ page }) => {
    const touch = test.info().project.use.hasTouch === true;
    await page.setViewportSize(UPRIGHT);
    await page.goto('/');
    const logInButton = page.getByRole('button', { name: 'Log in' });
    await expect(page.getByRole('dialog', { name: touch ? TOUCH_TEXT : PC_TEXT })).toBeVisible();
    await expect(cover(page)).toHaveText(touch ? TOUCH_TEXT : PC_TEXT);
    await expect(cover(page)).toBeFocused();
    // over the form: a tap on Log in lands on the cover
    expect(await tapLandsOn(logInButton)).toBe(false);
    await expectOnScreen(cover(page), 'the cover');

    await page.setViewportSize(LANDSCAPE);
    await expect(cover(page)).toBeHidden();
    expect(await tapLandsOn(logInButton)).toBe(true);
    await expect(logInButton).toBeEnabled();
  });

  test('every lobby screen fits 844 x 390 with no scroll', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the layouts are measured once, in Chromium');
    await page.setViewportSize(LANDSCAPE);
    await playGateway(page, { duplicateFirst: true });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expectNoScroll(page, 'the login form');

    await logIn(page);
    await expect(page.getByRole('heading', { name: 'Already connected' })).toBeVisible();
    await expectNoScroll(page, 'the already-connected screen');
    await page.getByRole('button', { name: 'Disconnect it' }).click();
    await expect(page.getByRole('status')).toContainText('Log in again');
    await expectNoScroll(page, 'the login form with its status line');

    await page.getByLabel('Password').fill('password1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await expectNoScroll(page, 'the channels');
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();
    await expectNoScroll(page, 'the characters');

    await page.getByRole('button', { name: 'Empty — Create' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create a character in slot 2' })).toBeVisible();
    await expectNoScroll(page, 'the create screen');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter name.');
    await expectNoScroll(page, 'the create screen with a message');
    await expectOnScreen(page.getByRole('button', { name: 'Create', exact: true }), 'Create');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete Webby' }).click();
    await expect(page.getByRole('heading', { name: 'Delete a character' })).toBeVisible();
    await expectNoScroll(page, 'the delete screen');
    await page.getByLabel('Bank PIN').fill('abcd');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('The Bank PIN should be a 4 digit number.');
    await expectNoScroll(page, 'the delete screen with a message');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Enter Webby' }).click();
    await expect(page.getByText('Entering the world…')).toBeVisible();
    await expectNoScroll(page, 'the loading screen');
  });

  test('the world fits 844 x 390 with no scroll: its windows, the task bar and the Start menu on screen', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the layouts are measured once, in Chromium');
    await page.setViewportSize(LANDSCAPE);
    await playGateway(page);
    await enterFlaris(page);
    await expectNoScroll(page, 'the world');
    await expectOnScreen(page.locator('.hud-taskbar-strip'), 'the task bar');
    await expectOnScreen(page.locator('.hud-status'), 'the status window');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectOnScreen(page.getByRole('menu'), 'the Start menu');
    await expectOnScreen(page.getByRole('menuitem', { name: 'Log out' }), 'Log out');
    await page.getByRole('menuitem', { name: 'Character' }).click();
    const character = page.locator('.hud-window', { has: page.locator('.hud-window-title', { hasText: 'Character' }) });
    await expect(character).toBeVisible();
    await expectOnScreen(character.locator('.hud-window-title'), "the Character window's title bar");
    await expectNoScroll(page, 'the world with the Character window');
    // 512 px high, it is taller than the 342 px above the task bar: it goes under the bar, which stays to be pressed (in
    // Neuz the windows are kept above it, `m_rectLayout`)
    expect(await tapLandsOn(page.getByRole('button', { name: 'Start' }))).toBe(true);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  // An open window kept where the player put it, inside the screen as it turns (the windows' layer hides what is past
  // its edges): squeezed in while upright, and back where it was once the phone is turned back
  test('a window the player moved stays on the screen as it turns, and goes back where it was', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one browser drags the window');
    await page.setViewportSize(LANDSCAPE);
    await playGateway(page);
    await enterFlaris(page);
    await page.keyboard.press('h');
    const character = page.locator('.hud-window', { has: page.locator('.hud-window-title', { hasText: 'Character' }) });
    await expect(character).toBeVisible();
    // dragged by its title bar to the right edge of the landscape screen
    const title = (await character.locator('.hud-window-title').boundingBox())!;
    await page.mouse.move(title.x + 40, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(title.x + 40 + 1000, title.y + 10, { steps: 4 });
    await page.mouse.up();
    const placed = (await character.boundingBox())!;
    expect(placed.x + placed.width).toBeCloseTo(LANDSCAPE.width, 0);

    await page.setViewportSize(UPRIGHT);
    await expect.poll(async () => (await character.boundingBox())!.x + placed.width).toBeLessThanOrEqual(UPRIGHT.width);
    await expectOnScreen(character.locator('.hud-window-title'), "the Character window's title bar, upright");

    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await character.boundingBox())!.x).toBeCloseTo(placed.x, 0);
  });

  // Review Focus 5: the phone turned upright in a fight. The cover shows, and nothing behind it pauses: the auto-attack
  // swings on, the server's messages and their numbers are applied, and turning back shows the fight as it went on.
  test('turning upright mid-fight keeps attacking', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', "the fight is Chromium's, with the mouse");
    await page.setViewportSize(LANDSCAPE);
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const hpOf = async (objectId: number) =>
      (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId)?.hp;

    // a tap selects the Aibatt, the next one walks up to it and swings
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(page.locator('.hud-target-info')).toHaveText('100 / 148');

    // upright: the cover is over the fight
    await page.setViewportSize(UPRIGHT);
    await expect(cover(page)).toBeVisible();
    await expect(cover(page)).toHaveText(PC_TEXT);
    const swingsUpright = swingsOf(gateway);
    // the world server's DAMAGE of the own hit (the Aibatt loses 30): applied under the cover, its number drawn
    gateway.pushCache(gateway.script.later([writeDamage(MONSTER_ID, SELF_ID, 30, 0)]));
    await expect.poll(() => hpOf(MONSTER_ID)).toBe(70);
    await expect.poll(() => page.locator('.world-damage-numbers > div').count(), { timeout: 10_000 }).toBeGreaterThan(0);
    // the auto-attack swings on
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(swingsUpright);

    // turned back: the same fight, the Aibatt's HP lowered on its bar, the loop still running, the target still the Aibatt
    await page.setViewportSize(LANDSCAPE);
    await expect(cover(page)).toBeHidden();
    await expect(page.locator('.hud-target-info')).toHaveText('70 / 148');
    const swingsBack = swingsOf(gateway);
    await expect.poll(() => swingsOf(gateway), { timeout: 60_000 }).toBeGreaterThan(swingsBack);
    expect(targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });
});
