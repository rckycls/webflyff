// The world screen against scripted servers: as in lobby.spec.ts, every WebSocket the page opens is answered by a
// script that plays the server behind the gateway, here the certifier, the login server and the cache server (with the
// world server behind it, `createWorldScript`). The world drawn is the converted Flaris in the worktree's dist/assets,
// which the dev server serves as the viewer's does.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MAP_SIZE, decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { ArReader, ArWriter, MessageType, NULL_ID, PacketType, Port, ShortcutKind } from '@flyffweb/protocol';
import type { AddedMover, AddedNpc, AddedPlayer, MoveReport, Shortcut, TaskBar, Vec3 } from '@flyffweb/protocol';
import { sampleHeight } from '@flyffweb/scene';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf, writeDamage, writeDefinedText,
  writeDelObj, writeMoverCorr, writeMoverDeath, writeMoverMoved, writeSetPointParam, writeTaskBar,
} from '@flyffweb/testkit';
import type {} from '../src/testHooks'; // window.__client
import { Belli } from '../src/world/sim/constants';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/assets');

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  if (!existsSync(path.join(ASSETS, 'index.json'))) throw new Error(`${ASSETS}/index.json is missing: run \`npm run convert\` first`);
});

// Ruling 3: WebKit runs these where it draws WebGL. Playwright's WebKit draws Flaris on this PC (checked with a picture
// of the iPhone 13 page); where a WebKit build has no WebGL the world screen ends at once with "This browser can't show
// the 3D world", these fail at `ready()`, and they are to be skipped in that project, naming that reason. The picture is
// Chromium's only.

/** `WI_WORLD_MADRIGAL` (`Resource/defineWorld.h`): Flaris is in Madrigal. */
const MADRIGAL = 1;
/** `MI_MALE`, `MI_FEMALE` (`Resource/defineObj.h:954-955`) and the Aibatt (`MI_AIBATT2`, propMover.txt). */
const MI_MALE = 11;
const MI_FEMALE = 12;
const MI_AIBATT = 21;
/** `OBJSTA_STAND` (`MoverMsg.h`), `OBJSTA_FMOVE`, `OBJSTA_MOVE_ALL`. */
const OBJSTA_STAND = 0x01;
const OBJSTA_FMOVE = 0x04;
/** `MTI_STAND`, `MTI_RUN` (`Resource/defineNeuz.h`) and `ANILOOP_LOOP` (`_Common/Obj.h:28`). */
const MTI_STAND = 0;
const MTI_RUN = 5;
const ANILOOP_LOOP = 0x04;
const OBJSTA_MOVE_ALL = 0xff;
/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`): the own character's equipment object IDs. */
const MAX_HUMAN_PARTS = 31;
/** The vagrant's clothes (jobItem.inc): `II_ARM_M_VAG_SUIT01`, `_GAUNTLET01`, `_BOOTS01`, and the women's 504, 508, 512. */
const MALE_VAGRANT = [502, 506, 510];
const FEMALE_VAGRANT = [{ part: 2, itemId: 504, flag: 0 }, { part: 4, itemId: 508, flag: 0 }, { part: 5, itemId: 512, flag: 0 }];

function readAsset<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(ASSETS, file), 'utf8')) as T;
}

/** The terrain height at client (D3D) x, z of Madrigal, as `CLandscape::GetHeight` gives it: where a server stands a mover. */
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

/** Flaris' town square, as the viewer's pictures stand there (client 6968, 3328), facing south (angle 0: D3D -z). */
const SQUARE: Vec3 = [6968, groundAt(6968, 3328), 3328];
/** 6 m ahead of the player (south), 2.5 m to either side, facing it. */
const MONSTER_AT: Vec3 = [6965.5, groundAt(6965.5, 3322), 3322];
const NPC_AT: Vec3 = [6970.5, groundAt(6970.5, 3322), 3322];

const SELF_ID = 9000;
const MONSTER_ID = 9001;
const NPC_ID = 9002;

const BASE = { scale: 1, motion: 0, hitPoint: 100, state: OBJSTA_STAND, stateFlag: 0, belligerence: 0, sfxId: 0 };

/** Webby with no numbers (`own` null), so with STA and DEX 0 on the wire too. */
const SELF_PLAYER: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0xff907b6d, headMesh: 0, playerId: 500, job: 0,
  sta: 0, dex: 0, level: 15, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1,
  worn: [], equipmentObjectIds: Array.from({ length: MAX_HUMAN_PARTS }, () => NULL_ID), own: null, shopTitle: '',
};
const NPC_PART: AddedNpc = {
  hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [], activeAttack: 0, movePattern: 0, moveEvent: 0,
  moveEventCount: 0, speedFactor: 1,
};
const self: AddedMover = { ...BASE, index: MI_MALE, pos: SQUARE, angle: 0, objectId: SELF_ID, isPlayer: true, player: SELF_PLAYER };
const aibatt: AddedMover = { ...BASE, index: MI_AIBATT, pos: MONSTER_AT, angle: 180, objectId: MONSTER_ID, isPlayer: false, npc: NPC_PART };
const julia: AddedMover = {
  ...BASE, index: MI_FEMALE, pos: NPC_AT, angle: 180, objectId: NPC_ID, isPlayer: false, belligerence: Belli.PEACEFUL,
  npc: { ...NPC_PART, characterKey: 'MaFl_Juria', hairMesh: 2, hairColor: 0xff8a5a3c, worn: FEMALE_VAGRANT },
};

const flaris = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia)],
});

/** `DST_HP` (`Resource/defineAttribute.h`), and `OBJMSG_DAMAGE` (`MoverMsg.h`, the `OBJMSG` enum from 0). */
const DST_HP = 38;
const OBJMSG_DAMAGE = 41;
/**
 * Flaris with the own character's TASKBAR and an HP of 77 right after its ADD_OBJ in the JOIN (`CUser::Open` sends the
 * task bar there, `WORLDSERVER/User.cpp:326-328`): they reach the own numbers only if these are made before the JOIN is
 * applied.
 */
const flarisWithOwnMessages = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self),
  others: [
    writeTaskBar(SELF_ID, { applets: [], items: [], queue: [], actionPoint: 42 }), writeSetPointParam(SELF_ID, DST_HP, 77),
    writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia),
  ],
});

const shortcut = (kind: number, id: number, index: number, data: number): Shortcut => ({
  kind, id, type: 0, index, userId: 0, data, text: '',
});
/**
 * The new character's bars (BASE_VALUE_TBL, `Database.sql:2741-2742`): the applets 400, 398, 2010, 581 and the motion 25
 * in the applet row; on bar 0 the lollipops (object 45) and the biscuit (object 1), and the motions 3 and 2.
 */
const NEW_BAR: TaskBar = {
  applets: [
    { slot: 0, shortcut: shortcut(ShortcutKind.APPLET, 400, 0, 0) },
    { slot: 1, shortcut: shortcut(ShortcutKind.APPLET, 398, 1, 0) },
    { slot: 2, shortcut: shortcut(ShortcutKind.APPLET, 2010, 2, 0) },
    { slot: 3, shortcut: shortcut(ShortcutKind.APPLET, 581, 3, 0) },
    { slot: 4, shortcut: shortcut(ShortcutKind.MOTION, 25, 4, 0) },
  ],
  items: [
    { bar: 0, slot: 0, shortcut: shortcut(ShortcutKind.ITEM, 45, 0, 1) },
    { bar: 0, slot: 1, shortcut: shortcut(ShortcutKind.ITEM, 1, 1, 1) },
    { bar: 0, slot: 2, shortcut: shortcut(ShortcutKind.MOTION, 3, 2, 1) },
    { bar: 0, slot: 8, shortcut: shortcut(ShortcutKind.MOTION, 2, 8, 1) },
  ],
  queue: [],
  actionPoint: 0,
};
/** Flaris with Webby's own data a new Vagrant's (its inventory: the lollipops, the biscuit ...) and the new character's TASKBAR. */
const flarisWithNewBar = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own: newVagrantOwn() } }),
  others: [writeTaskBar(SELF_ID, NEW_BAR), writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia)],
});

/**
 * A house east of Flaris' square (mdlObj.inc's `MaSaHo25`, object 2441 of tile 13_6, at client 6995.6, 3330.6): the
 * east wall of its ground floor stands at client x 6998.5, from z 3325.4 to 3331.6 and 3.6 m up. Webby stands 5.5 m
 * east of it, facing west (angle 270: D3D -x), where the way to it is open and the land flat (height 100) and walkable.
 */
const WALL_X = 6998.5;
const BY_THE_WALL: Vec3 = [7004, groundAt(7004, 3328.5), 3328.5];
const byTheWall = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: BY_THE_WALL,
  self: writeAddSelf(SELF_ID, { ...self, pos: BY_THE_WALL, angle: 270 }), others: [],
});
/** Webby on the same spot facing east (angle 90: D3D +x), the house's east wall 5.5 m behind it. */
const backToTheWall = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: BY_THE_WALL,
  self: writeAddSelf(SELF_ID, { ...self, pos: BY_THE_WALL, angle: 90 }), others: [],
});

/** Another player, who comes into view 3 m east of Webby once Webby is in the world, dressed as a vagrant. */
const BOB_ID = 9003;
const BOB_AT: Vec3 = [6971, groundAt(6971, 3328), 3328];
const bob: AddedMover = {
  ...BASE, index: MI_MALE, pos: BOB_AT, angle: 0, objectId: BOB_ID, isPlayer: true,
  player: {
    ...SELF_PLAYER, self: false, name: 'Bob', playerId: 501, equipmentObjectIds: [],
    worn: MALE_VAGRANT.map((itemId, i) => ({ part: [2, 4, 5][i]!, itemId, flag: 0 })),
  },
};
/** A message of a type the browser has no reader for. */
const UNREAD = { objectId: SELF_ID, type: 0x7777, fields: new Uint8Array([1, 2, 3]) };

// The lobby's side, as lobby.spec.ts scripts it: a server list, the clock, the cache address and the characters.
const AUTH_KEY = 7;

function serverList(): Buffer {
  const w = new ArWriter().u32(PacketType.SRVR_LIST).u32(AUTH_KEY).u8(0).string('webtester').u32(2);
  w.u32(NULL_ID).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0);
  w.u32(1).u32(1).string('Channel 1').string('').i32(0).i32(12).i32(1).i32(500);
  return Buffer.from(w.toBytes());
}

/** Webby in Madrigal on Flaris' square, dressed as a vagrant (`CDPLoginClient::OnPlayerList`'s order). */
function playerList(): Buffer {
  const w = new ArWriter().u32(PacketType.PLAYER_LIST).u32(AUTH_KEY).i32(1);
  w.i32(0).i32(0).u32(MADRIGAL).u32(MI_MALE).string('Webby').vec3(SQUARE)
    .u32(500).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0xff907b6d).u32(0).u8(0).i32(0).i32(15).u32(0)
    .i32(15).i32(15).i32(15).i32(15).u32(0).i32(MALE_VAGRANT.length);
  for (const id of MALE_VAGRANT) w.u32(id);
  return Buffer.from(w.i32(0).toBytes());
}

/** A packet the page sent: the port it went to, the connection it came on, its type and its whole body. */
interface Sent {
  port: number;
  connection: number;
  type: number;
  body: Buffer;
}

interface Gateway {
  sent: Sent[];
  /** The connections the page closed, by the number they were opened as. */
  closed: number[];
  /** Ends the cache connection the way the gateway does, with a close code. */
  closeCache(code: number): Promise<void>;
  /** Sends a packet to the page on the cache connection, as the world server does between the page's packets. */
  pushCache(packet: Uint8Array): void;
}

/**
 * Plays the gateway and the four servers behind it: the certifier, the login server and the cache server with Flaris
 * (`world`: Webby on the square, with the Aibatt and Julia, unless another script is given).
 */
async function playGateway(page: Page, world = flaris): Promise<Gateway> {
  const gateway: Gateway = {
    sent: [], closed: [], closeCache: async () => {}, pushCache: () => {
      throw new Error('no cache connection yet');
    },
  };
  let connections = 0;
  await page.routeWebSocket(/\/connect\//, (ws) => {
    const port = Number(new URL(ws.url()).pathname.split(':').pop());
    const connection = ++connections;
    if (port === Port.CACHE) {
      gateway.closeCache = (code) => ws.close({ code });
      gateway.pushCache = (packet) => ws.send(Buffer.from(packet));
    }
    ws.onClose(() => gateway.closed.push(connection));
    ws.onMessage((message) => {
      const body = Buffer.from(message as Buffer);
      // Packets to the certifier start with the type; to the login and cache servers with DPID_UNKNOWN.
      const type = body.readUInt32LE(port === Port.CERTIFIER ? 0 : 4);
      gateway.sent.push({ port, connection, type, body });
      const reply = (packet: Uint8Array) => ws.send(Buffer.from(packet));
      if (port === Port.CERTIFIER) {
        if (type === PacketType.CERTIFY) reply(serverList());
      } else if (port === Port.LOGIN) {
        if (type === PacketType.QUERYTICKCOUNT) {
          reply(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(body.readUInt32LE(8)).i64(123456789n).toBytes());
        }
        if (type === PacketType.GETPLAYERLIST) {
          reply(new ArWriter().u32(PacketType.CACHE_ADDR).string('172.31.238.55').toBytes());
          reply(playerList());
        }
        world.answer('login', body).forEach(reply);
      } else {
        world.answer('cache', body).forEach(reply);
      }
    });
  });
  return gateway;
}

/** Logs in, picks Channel 1 and taps Enter on Webby. */
async function tapEnter(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: /Channel 1/ }).click();
  await page.getByRole('button', { name: 'Enter Webby' }).click();
}

/** Logs in, picks Channel 1 and taps Enter on Webby; resolves on the loading screen. */
async function startEntering(page: Page): Promise<void> {
  await tapEnter(page);
  await expect(page.getByText('Entering the world…')).toBeVisible();
}

/** Logs in, picks Channel 1 and enters with Webby; resolves once the world is on screen, with its task bar. */
async function enterFlaris(page: Page): Promise<void> {
  await startEntering(page);
  await page.evaluate(() => window.__client!.ready());
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

/** Leaves the world as Piece 4's player does: the task bar's Start button, then the menu's Log out (spec §3.9). */
async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
}

/** The PLAYERMOVED packets the page sent so far. */
const movesOf = (gateway: Gateway): Sent[] => gateway.sent.filter((s) => s.port === Port.CACHE && s.type === PacketType.PLAYERMOVED);

/**
 * The client SNAPSHOTs the page sent so far, as `CDPClient::SendSnapshot` writes one with a DESTPOS: after DPID_UNKNOWN
 * and the type, the count (1), the message type, the position and the forward flag.
 */
function destPosOf(gateway: Gateway): { count: number; type: number; pos: Vec3; forward: number }[] {
  return gateway.sent.filter((s) => s.port === Port.CACHE && s.type === PacketType.SNAPSHOT).map(({ body }) => {
    const r = new ArReader(new Uint8Array(body));
    r.u32();
    r.u32();
    return { count: r.u8(), type: r.u16(), pos: r.vec3(), forward: r.u8() };
  });
}

/** Where the rules have Webby (D3D). */
async function ownAt(page: Page): Promise<Vec3> {
  return (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === SELF_ID)!.pos;
}

const distanceXZ = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Taps the world's drawing at `x`, `y` (shares of its width and height): with a finger in the phone project (iPhone 13,
 * touch pointer events), with the mouse on the desktop.
 */
async function tapWorld(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  const at = { x: box.x + box.width * x, y: box.y + box.height * y };
  if (test.info().project.use.hasTouch === true) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

/** The packets of `type` the page sent on the cache connection so far. */
const sentOf = (gateway: Gateway, type: number): Sent[] => gateway.sent.filter((s) => s.port === Port.CACHE && s.type === type);

/** The SETTARGETs the page sent so far (`CDPClient::SendSetTarget`): after DPID_UNKNOWN and the type, the target and `bClear`. */
const targetsOf = (gateway: Gateway): Array<[number, number]> =>
  sentOf(gateway, PacketType.SETTARGET).map(({ body }) => [body.readUInt32LE(8), body.readUInt8(12)]);

/**
 * The state in a PLAYERMOVED (`CDPClient::SendPlayerMoved`) or a PLAYERCORR (`SendPlayerCorr`, the same fields): after
 * DPID_UNKNOWN, the type, the position, the delta and the angle.
 */
const movedState = (moved: Sent): number => moved.body.readUInt32LE(4 + 4 + 12 + 12 + 4);
/** The state flag in a PLAYERMOVED or a PLAYERBEHAVIOR, after the state. */
const movedStateFlag = (moved: Sent): number => moved.body.readUInt32LE(4 + 4 + 12 + 12 + 4 + 4);
/** `OBJSTAF_WALK` (`MoverMsg.h:97`). */
const OBJSTAF_WALK = 0x02;
/** `OBJMSG_ATK1` (`MoverMsg.h`, the `OBJMSG` enum from 0). */
const OBJMSG_ATK1 = 29;

test.describe('the world screen against scripted servers', () => {
  test('enters Flaris from the character list', async ({ page }) => {
    await playGateway(page);
    await enterFlaris(page);
    await expect(page.getByText('Entering the world…')).toBeHidden();

    const movers = await page.evaluate(() => window.__client!.movers());
    expect(movers.map((m) => [m.objectId, m.name]).sort()).toEqual([
      [SELF_ID, 'Webby'], [MONSTER_ID, 'Aibatt'], [NPC_ID, 'Julia'],
    ]);
    const stats = await page.evaluate(() => window.__client!.stats());
    // skipped: the JOIN's game timer, which stands for the messages of CUser::Open that nothing reads
    expect(stats).toMatchObject({ bundles: 1, indexed: 1, skipped: 1, mismatched: 0, errors: [] });
  });

  test('bundles after entering: a player comes into view, runs, and leaves', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const bobAt = async () => (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === BOB_ID)?.pos;

    gateway.pushCache(flaris.later([writeAddPlayer(BOB_ID, bob)]));
    await expect.poll(async () => (await page.evaluate(() => window.__client!.movers())).map((m) => m.name)).toContain('Bob');
    expect(await bobAt()).toEqual(BOB_AT);

    // Bob runs south (angle 0: D3D -z), behind a message nothing reads: the table of contents lets the run through
    const run: MoveReport = {
      pos: BOB_AT, delta: [0, 0, 0], angle: 0, state: OBJSTA_FMOVE, stateFlag: 0, motion: MTI_RUN, motionEx: 0,
      loop: ANILOOP_LOOP, motionOption: 0, tick: 123456789n,
    };
    gateway.pushCache(flaris.later([UNREAD, writeMoverMoved(BOB_ID, run)]));
    await expect.poll(async () => (await bobAt())?.[2] ?? Infinity).toBeLessThan(BOB_AT[2] - 1);

    gateway.pushCache(flaris.later([writeDelObj(BOB_ID)]));
    await expect.poll(async () => (await page.evaluate(() => window.__client!.movers())).map((m) => m.objectId))
      .not.toContain(BOB_ID);
    // the JOIN's game timer and the unread message are skipped; every message read ended where the table said
    expect(await page.evaluate(() => window.__client!.stats()))
      .toMatchObject({ bundles: 4, indexed: 4, skipped: 2, mismatched: 0, errors: [] });
  });

  test("another player's correction puts it where its own client stopped it (MOVERCORR)", async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const bobAt = async () => (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === BOB_ID)?.pos;
    gateway.pushCache(flaris.later([writeAddPlayer(BOB_ID, bob)]));
    await expect.poll(async () => (await bobAt()) !== undefined).toBe(true);

    // Bob runs south (angle 0: D3D -z): the browser runs it on toward where its PLAYERMOVED says it will be
    const run: MoveReport = {
      pos: BOB_AT, delta: [0, 0, 0], angle: 0, state: OBJSTA_FMOVE, stateFlag: 0, motion: MTI_RUN, motionEx: 0,
      loop: ANILOOP_LOOP, motionOption: 0, tick: 123456789n,
    };
    gateway.pushCache(flaris.later([writeMoverMoved(BOB_ID, run)]));
    await expect.poll(async () => (await bobAt())?.[2] ?? Infinity).toBeLessThan(BOB_AT[2] - 0.5);

    // Bob's own client stopped it 2 m on, where it met something, and corrected it (PLAYERCORR): the world server passes
    // that on as MOVERCORR, which puts Bob there, standing, at once
    const stopped: Vec3 = [BOB_AT[0], BOB_AT[1], Math.fround(BOB_AT[2] - 2)];
    gateway.pushCache(flaris.later([writeMoverCorr(BOB_ID, {
      ...run, pos: stopped, state: OBJSTA_STAND, motion: MTI_STAND, tick: 123456790n,
    })]));
    await expect.poll(async () => (await bobAt())?.[2]).toBe(stopped[2]);
    await page.waitForTimeout(1000);
    const at = (await bobAt())!;
    expect([at[0], at[2]]).toEqual([stopped[0], stopped[2]]); // (its height is the land's under it)
    expect(at[1]).toBeCloseTo(stopped[1], 1);
    // the JOIN's game timer is the one message skipped; MOVERCORR is read, and ends where the table says
    expect(await page.evaluate(() => window.__client!.stats())).toMatchObject({ skipped: 1, mismatched: 0, errors: [] });
  });

  // A hidden page runs no frames, and a lost focus may swallow the key's or the finger's let-go: either way the screen
  // stops the player at once, or the server's copy of it would run on.
  const hiding = [
    ['the page is hidden', () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }],
    ['the window loses the focus', () => {
      window.dispatchEvent(new Event('blur'));
    }],
  ] as const;
  for (const [what, hide] of hiding) {
    test(`stops the walking player at once when ${what}`, async ({ page }) => {
      const gateway = await playGateway(page);
      await enterFlaris(page);
      await page.keyboard.down('KeyW');
      await expect.poll(() => movesOf(gateway).length).toBeGreaterThan(0);
      expect(movedState(movesOf(gateway).at(-1)!) & OBJSTA_MOVE_ALL).toBe(OBJSTA_FMOVE);
      // the rules stop stepping: from here on, the frame loop sends nothing
      await page.evaluate(() => window.__client!.pause());
      const before = movesOf(gateway).length;

      await page.evaluate(hide);
      await expect.poll(() => movesOf(gateway).length).toBe(before + 1);
      expect(movedState(movesOf(gateway).at(-1)!) & OBJSTA_MOVE_ALL).toBe(OBJSTA_STAND);
      await page.keyboard.up('KeyW');
    });
  }

  test('Leave on the loading screen returns to the login form', async ({ page }) => {
    // the map's tiles never come, so the screen stays on "Entering the world…"
    await page.route(/\/assets\/worlds\/.*\/tiles\//, () => {});
    const tileAsked = page.waitForRequest(/\/assets\/worlds\/.*\/tiles\//);
    const gateway = await playGateway(page);
    await startEntering(page);
    await tileAsked;
    await expect(page.getByText('Entering the world…')).toBeVisible();
    await page.getByRole('button', { name: 'Leave' }).click();

    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Entering the world…')).toHaveCount(0);
    const login = gateway.sent.find((s) => s.port === Port.LOGIN)!.connection;
    const cache = gateway.sent.find((s) => s.port === Port.CACHE)!.connection;
    await expect.poll(() => gateway.closed).toEqual(expect.arrayContaining([login, cache]));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('game files older than the client end the entry with their own message', async ({ page }) => {
    // an asset index from before the game-data catalogs this version reads
    await page.route(/\/assets\/index\.json/, async (route) => {
      const response = await route.fetch();
      const index = (await response.json()) as AssetIndex;
      const files: Record<string, string> = { ...index.files };
      delete files['data/worlds.json'];
      await route.fulfill({ response, json: { ...index, files } });
    });
    await playGateway(page);
    await startEntering(page);

    await expect(page.getByRole('alert')).toHaveText('The game files on the server are out of date.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  test("a job table without the character's job ends the entry as game files out of date (the own numbers made on entry)", async ({ page }) => {
    // a job table from before the character's job had a row: OwnState, made as the JOIN enters, cannot be made
    await page.route(/\/assets\/data\/jobs\.[0-9a-f]+\.json/, (route) => route.fulfill({ json: [] }));
    await playGateway(page);
    await startEntering(page);

    await expect(page.getByRole('alert')).toHaveText('The game files on the server are out of date.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  test('a browser without WebGL is told so', async ({ page }) => {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        return String(args[0]).startsWith('webgl') ? null : (real as (...a: unknown[]) => unknown).apply(this, args);
      } as unknown as typeof real;
    });
    await playGateway(page);
    // the screen ends as it opens, so the loading screen may be gone before a test could see it
    await tapEnter(page);

    await expect(page.getByRole('alert')).toHaveText("This browser can't show the 3D world (WebGL is off or not supported).");
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  test('shows a monster and an NPC with name tags', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'pictures are Chromium only (SwiftShader), as the viewer takes them');
    await playGateway(page);
    await enterFlaris(page);
    await page.evaluate(() => window.__client!.pause());

    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
    // The overlay's numbers (fps, heap) change from frame to frame, so it is masked.
    await expect(page).toHaveScreenshot('world-flaris-movers.png', { mask: [page.locator('#overlay')], timeout: 30_000 });
  });

  test('walking forward sends PLAYERMOVED', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await page.keyboard.down('KeyW');
    await expect.poll(() => gateway.sent.filter((s) => s.port === Port.CACHE && s.type === PacketType.PLAYERMOVED).length)
      .toBeGreaterThan(0);
    await page.keyboard.up('KeyW');

    // CDPClient::SendPlayerMoved: DPID_UNKNOWN, the type, then where PresupposePos puts the player 22 steps on, the move
    // per step and the angle, then the state.
    const moved = gateway.sent.find((s) => s.port === Port.CACHE && s.type === PacketType.PLAYERMOVED)!;
    const r = new ArReader(new Uint8Array(moved.body));
    r.u32();
    r.u32();
    const pos = r.vec3();
    const delta = r.vec3();
    const angle = r.f32();
    const state = r.u32();
    expect(state & OBJSTA_MOVE_ALL).toBe(OBJSTA_FMOVE);
    expect(angle).toBe(0);
    // facing south (D3D -z): 22 steps ahead of where the player stands, added up in floats as PresupposePos does
    expect(delta[2]).toBeLessThan(0);
    let z = SQUARE[2];
    for (let i = 0; i < 22; i++) z = Math.fround(z + delta[2]);
    expect(pos[2]).toBe(z);
    expect(pos[0]).toBe(SQUARE[0]);
  });

  test('walking into a Flaris wall stops the player', async ({ page }) => {
    await playGateway(page, byTheWall);
    await enterFlaris(page);
    const ownAt = async () => (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === SELF_ID)!.pos;
    await page.keyboard.down('KeyW');
    // it runs west up to the wall (SwiftShader's first frames are slow, so the time this takes is not known)
    await expect.poll(async () => (await ownAt())[0], { timeout: 60_000 }).toBeLessThan(WALL_X + 1);
    // then 2 s more of forward: through the wall it would run on into the house (the Male's 0.1 a step is 6 m/s)
    await page.waitForTimeout(2000);
    const own = await ownAt();
    await page.keyboard.up('KeyW');

    expect(own[0]).toBeGreaterThan(WALL_X); // it stopped in front of the wall
    expect(own[2]).toBeCloseTo(BY_THE_WALL[2], 1); // head on, it does not slide along it
  });

  test("the chase camera stays out of the house behind the player (CheckBound on the stage's objects)", async ({ page }) => {
    await playGateway(page, backToTheWall);
    await enterFlaris(page);
    // 16 m behind Webby (15.65 m out, 12 degrees up) the camera would be at x 6988.3, inside the house: the line to it
    // meets the wall 5.5 m behind Webby, 2.5 m up, and the camera stays there, in front of it
    const cameraX = async () => (await page.evaluate(() => window.__client!.camera()))[0];
    await expect.poll(cameraX).toBeGreaterThan(WALL_X - 0.05);
    await page.waitForTimeout(500);
    expect(await cameraX()).toBeGreaterThan(WALL_X - 0.05);
    expect(await cameraX()).toBeLessThan(BY_THE_WALL[0] - 4);
  });

  // The chase camera looks south over Webby from 16 m north of it: a tap below the middle of the screen is on the square
  // behind Webby, a few metres north.
  test('clicking the ground sends DESTPOS and the player walks there', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await tapWorld(page, 0.5, 0.8);

    // CDPClient::SendSnapshot: one DESTPOS, forward, at a point of the square behind Webby
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    const [dest] = destPosOf(gateway);
    expect(dest).toMatchObject({ count: 1, type: MessageType.DESTPOS, forward: 1 });
    expect(dest!.pos[2]).toBeGreaterThan(SQUARE[2] + 1);
    expect(dest!.pos[1]).toBeCloseTo(groundAt(dest!.pos[0], dest!.pos[2]), 1);

    // it walks there (just past it: the own character arrives once past the point) and stays
    await expect.poll(async () => distanceXZ(await ownAt(page), dest!.pos), { timeout: 60_000 }).toBeLessThan(0.3);
    await page.waitForTimeout(1000);
    expect(distanceXZ(await ownAt(page), dest!.pos)).toBeLessThan(0.3);
    // no STAND cut the walk short on the way, and no change of mode went out at rest or on the way (Ruling 40): the
    // walk to a point sends nothing of its own
    expect(movesOf(gateway)).toEqual([]);
    expect(sentOf(gateway, PacketType.PLAYERBEHAVIOR)).toEqual([]);
  });

  // The Aibatt and Julia stand 6 m ahead of Webby, 2.5 m to either side. A tap on a mover is a selection (SelectObj), not a
  // walk; a tap on the ground walks and leaves the selection as it is.
  test('tapping a mover selects it with SETTARGET and walks nowhere; the ground leaves the focus alone', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const tapMover = async (objectId: number): Promise<void> => {
      const at = await page.evaluate((id) => window.__client!.screenOf(id), objectId);
      expect(at).not.toBeNull();
      await tapWorld(page, at![0], at![1]);
    };

    await tapMover(MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    // another mover: the old target is released with 1, the new one focused with 2
    await tapMover(NPC_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NPC_ID, 2]]);
    // the same one again changes nothing
    await tapMover(NPC_ID);
    await page.waitForTimeout(500);
    expect(targetsOf(gateway)).toHaveLength(3);
    expect(destPosOf(gateway)).toEqual([]);

    // the ground walks (as Piece 3), and the focus stays
    await tapWorld(page, 0.5, 0.8);
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    await page.waitForTimeout(500);
    expect(targetsOf(gateway)).toHaveLength(3);
  });

  // WorldScreen.apply tells the focus of a MOVERDEATH and a DEL_OBJ as they come, before the world applies them
  test('a death and a DEL_OBJ reach the focus as they come: a dead target leaving gets no release, the own kill clears it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const tapMover = async (objectId: number): Promise<void> => {
      const at = await page.evaluate((id) => window.__client!.screenOf(id), objectId);
      expect(at).not.toBeNull();
      await tapWorld(page, at![0], at![1]);
    };
    const hpOf = async (objectId: number) =>
      (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId)?.hp;

    await tapMover(MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    // the Aibatt dies with no killer (OnMoverDeath): HP 0 and the dead state, and the focus stays on it
    gateway.pushCache(flaris.later([writeMoverDeath(MONSTER_ID, NULL_ID, 0)]));
    await expect.poll(() => hpOf(MONSTER_ID)).toBe(0);
    // then it leaves view: the focus goes (CWorld::Process), and a dead target is not released (IsLive, World.cpp:310)
    gateway.pushCache(flaris.later([writeDelObj(MONSTER_ID)]));
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [NULL_ID, 2]]);

    // the own kill clears the focus, the live target released first (DPClient.cpp:1956-1963)
    await tapMover(NPC_ID);
    await expect.poll(() => targetsOf(gateway).length).toBe(3);
    gateway.pushCache(flaris.later([writeMoverDeath(NPC_ID, SELF_ID, OBJMSG_DAMAGE)]));
    await expect.poll(() => targetsOf(gateway)).toEqual([
      [MONSTER_ID, 2], [NULL_ID, 2], [NPC_ID, 2], [NPC_ID, 1], [NULL_ID, 2],
    ]);
    expect(await hpOf(NPC_ID)).toBe(0);
  });

  // OnDamage's number (CDamageNumMng::AddNumber) in the numbers layer over the canvas; the layers go with the screen
  test("a DAMAGE the own player deals draws its number's glyphs in the numbers layer, and leaving takes the layers off", async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const glyphs = page.locator('.world-damage-numbers > div');
    await expect(page.locator('.world-damage-numbers')).toHaveCount(1);
    await expect(page.locator('.world-target-marks')).toHaveCount(1);
    expect(await glyphs.count()).toBe(0);

    gateway.pushCache(flaris.later([writeDamage(MONSTER_ID, SELF_ID, 123, 0)]));
    // its three digits, in the second colour set (the own player hurt the Aibatt): "1" is the frame at 50, 128 of the
    // sheet; the elements stay for the next numbers once this one has gone
    await expect.poll(() => glyphs.count()).toBe(3);
    expect(await glyphs.first().evaluate((e) => (e as HTMLElement).style.backgroundPosition)).toBe('-50px -128px');
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);

    await logOut(page);
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.locator('.world-damage-numbers, .world-target-marks')).toHaveCount(0);
  });

  // Neuz's windows over the world (Hud, Piece 4 §3.9): the status window with the own numbers, the target bar of the tapped
  // monster, a DEFINEDTEXT as a line of the server messages (its TID found by the number defineText.h gives it), T, and
  // Escape in Neuz's order (WndManager.cpp:3295-3427: the target first, never the status window, then the Start menu);
  // logging out takes them off with the screen
  test('the status window shows the own numbers, the target bar the tapped monster, and a server text its line', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const status = page.locator('.hud-status');
    await expect(status.locator('.hud-window-title')).toHaveText('Webby - Lv: 15');
    // the ADD_OBJ's HP, of the maximum of a level 15 Vagrant with the stats of a character with nothing (NO_OWN)
    await expect(status.locator('[data-text="hp"]')).toHaveText(/^100 \/ \d+$/);
    await expect(status.locator('[data-text="exp"]')).toHaveText('0.00%');
    await expect(status.locator('.hud-status-face canvas')).toHaveCount(1);
    await expect(page.locator('.hud-target')).toBeHidden();

    const at = await page.evaluate((id) => window.__client!.screenOf(id), MONSTER_ID);
    expect(at).not.toBeNull();
    await tapWorld(page, at![0], at![1]);
    await expect(page.locator('.hud-target-name')).toHaveText(/^Aibatt <Lvl \d+>$/);

    // TID_GAME_PRIORITYMOB (Resource/defineText.h:273), as the server refuses an attack, with no arguments (DEFINEDTEXT1)
    gateway.pushCache(flaris.later([writeDefinedText(SELF_ID, 655)]));
    await expect(page.locator('.hud-messages > div'))
      .toHaveText(['You cannot attack a monster that is fighting against another player.']);

    await page.keyboard.press('t');
    await expect(status).toBeHidden();
    await page.keyboard.press('t');
    await expect(status).toBeVisible();
    // Escape clears the target first (SetObjFocus( NULL ): released, then NULL_ID), and leaves the status window
    await page.keyboard.press('Escape');
    await expect(page.locator('.hud-target')).toBeHidden();
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2]]);
    await expect(status).toBeVisible();
    // with nothing to clear and no window it closes, it opens the Start menu
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(status).toBeVisible();
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);

    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.locator('.world-hud')).toHaveCount(0);
  });

  // The task bar (CWndTaskBar, Piece 4 §3.9) with the JOIN's TASKBAR, drawn with the converted pictures (none missing from
  // the asset index, or the overlay would list it)
  test("the task bar draws the JOIN's TASKBAR, and F5 and the digits are the bar's, not the browser's", async ({ page }) => {
    await playGateway(page, flarisWithNewBar);
    await enterFlaris(page);
    const slot = (row: string, i: number) => page.locator(`.hud-slot[data-row="${row}"][data-slot="${i}"]`);
    await expect(slot('item', 0)).toHaveAttribute('data-kind', 'item');
    await expect(slot('item', 0).locator('.hud-slot-count')).toHaveText('3');
    await expect(slot('item', 1).locator('.hud-slot-count')).toHaveText('1');
    await expect(slot('item', 2)).toHaveAttribute('data-kind', 'plain');
    await expect(slot('applet', 1).locator('.hud-slot-hotkey')).toHaveText('J');
    // F5 is the fifth slot of the bar (empty here): the page is not reloaded, and 2 shows the second bar
    await page.keyboard.press('F5');
    await page.keyboard.press('Digit2');
    await expect(page.locator('.hud-taskbar-number')).toHaveText('2');
    await expect(slot('item', 0)).not.toHaveAttribute('data-kind');
    await page.keyboard.press('Digit1');
    await expect(slot('item', 0)).toHaveAttribute('data-kind', 'item');
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // The attack button (Piece 4 §3.4, §3.9): a touch screen's, where the joystick shows
  test('the attack button shows on a touch screen, enabled once the Aibatt is selected, and a press attacks it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const button = page.getByRole('button', { name: 'Attack' });
    if (test.info().project.use.hasTouch !== true) {
      await expect(button).toBeHidden();
      return;
    }
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    const at = await page.evaluate((id) => window.__client!.screenOf(id), MONSTER_ID);
    expect(at).not.toBeNull();
    await tapWorld(page, at![0], at![1]);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await expect(button).toBeEnabled();
    await button.tap();
    await expect.poll(() => sentOf(gateway, PacketType.MELEE_ATTACK).length, { timeout: 60_000 }).toBeGreaterThan(0);
    expect(sentOf(gateway, PacketType.PLAYERSETDESTOBJ)).toHaveLength(1);
  });

  test("the JOIN's messages about the own character reach its numbers, made before the JOIN is applied", async ({ page }) => {
    await playGateway(page, flarisWithOwnMessages);
    await enterFlaris(page);
    // the TASKBAR and the SETPOINTPARAM after the own ADD_OBJ: the own numbers have them, and the own mover's HP is theirs
    expect(await page.evaluate(() => window.__client!.own())).toEqual({ hp: 77, level: 15, actionPoint: 42 });
    const self = (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === SELF_ID);
    expect(self?.hp).toBe(77);
  });

  test('pressing a turn key cancels it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    // as far behind Webby as the screen shows above the task bar (about 7 m: it runs there in about 1 s), and the key goes
    // down soon after it starts
    await tapWorld(page, 0.5, 0.92);
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    const dest = destPosOf(gateway)[0]!.pos;
    await expect.poll(async () => distanceXZ(await ownAt(page), SQUARE), { timeout: 60_000, intervals: [20] }).toBeGreaterThan(0.5);

    // the turn is a move (LTURN answers 1): ClearDest, then PLAYERMOVED; with the walk over, the next step stands
    await page.keyboard.down('KeyA');
    await expect.poll(() => movesOf(gateway).length).toBeGreaterThan(1);
    await page.keyboard.up('KeyA');
    await expect.poll(() => movedState(movesOf(gateway).at(-1)!)).toBe(OBJSTA_STAND);
    const stopped = await ownAt(page);
    await page.waitForTimeout(1000);
    expect(await ownAt(page)).toEqual(stopped);
    expect(distanceXZ(stopped, dest)).toBeGreaterThan(1);
  });

  // X is the walk key (spec §1): it toggles walking and running as Neuz's does, and Shift no longer changes the gait
  test('X toggles walking with one PLAYERBEHAVIOR, and W with Shift moves at that gait', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const behaviors = () => sentOf(gateway, PacketType.PLAYERBEHAVIOR);
    await page.keyboard.press('KeyX');
    await expect.poll(() => behaviors().length).toBe(1);
    expect(movedStateFlag(behaviors()[0]!) & OBJSTAF_WALK).toBe(OBJSTAF_WALK);

    // Shift held with W walks, as W alone does now: the move goes out walking, with no change of mode
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyW');
    await expect.poll(() => movesOf(gateway).length).toBeGreaterThan(0);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Shift');
    expect(movedStateFlag(movesOf(gateway)[0]!) & OBJSTAF_WALK).toBe(OBJSTAF_WALK);
    await page.waitForTimeout(500);
    expect(behaviors()).toHaveLength(1);

    // X again: running
    await page.keyboard.press('KeyX');
    await expect.poll(() => behaviors().length).toBe(2);
    expect(movedStateFlag(behaviors()[1]!) & OBJSTAF_WALK).toBe(0);
  });

  // The Aibatt stands 6 m ahead of Webby: a tap selects it, the next one walks Webby up to it and swings (spec §3.4)
  test('tapping the selected monster again walks up to it with one PLAYERSETDESTOBJ and attacks; a turn key stops it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const tapMover = async (objectId: number): Promise<void> => {
      const at = await page.evaluate((id) => window.__client!.screenOf(id), objectId);
      expect(at).not.toBeNull();
      await tapWorld(page, at![0], at![1]);
    };
    const approaches = () => sentOf(gateway, PacketType.PLAYERSETDESTOBJ);
    const swings = () => sentOf(gateway, PacketType.MELEE_ATTACK);

    await tapMover(MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await page.waitForTimeout(1000);
    expect(approaches()).toEqual([]);

    await tapMover(MONSTER_ID);
    await expect.poll(() => swings().length, { timeout: 60_000 }).toBeGreaterThan(0);
    // CDPClient::SendPlayerDestObj: the target and the range 0, once
    expect(approaches()).toHaveLength(1);
    expect([approaches()[0]!.body.readUInt32LE(8), approaches()[0]!.body.readFloatLE(12)]).toEqual([MONSTER_ID, 0]);
    // CDPClient::SendMeleeAttack: OBJMSG_ATK1, the target, 0, MAKELONG( 0, 1 ), and the fists' fAttackSpeed (no weapon)
    const melee = swings()[0]!.body;
    expect([melee.readUInt32LE(8), melee.readUInt32LE(12), melee.readInt32LE(16), melee.readInt32LE(20)])
      .toEqual([OBJMSG_ATK1, MONSTER_ID, 0, 0x00010000]);
    expect(melee.readFloatLE(24)).toBe(Math.fround(0.07));
    // it ran up to the Aibatt, and stays with it
    expect(distanceXZ(await ownAt(page), MONSTER_AT)).toBeLessThan(3);
    expect(targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);

    // a turn key stops the auto-attack: the swing under way ends, and no more come
    await page.keyboard.down('KeyA');
    await expect.poll(() => movesOf(gateway).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(1500);
    const count = swings().length;
    await page.waitForTimeout(2000);
    expect(swings()).toHaveLength(count);
    expect(approaches()).toHaveLength(1);
  });

  test('a tap-walk into a Flaris wall stops there and sends one PLAYERCORR, standing', async ({ page }) => {
    // Webby faces the house's east wall 5.5 m away; a tap above the middle of the screen is on the land behind the wall
    // (the house's model is not pickable: the ray goes through it), so the walk there meets the wall
    const gateway = await playGateway(page, byTheWall);
    await enterFlaris(page);
    await tapWorld(page, 0.5, 0.45);
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    expect(destPosOf(gateway)[0]!.pos[0]).toBeLessThan(WALL_X);

    // OnActCollision with m_nCorr -1: ClearDest, STAND and SendPlayerCorr, once
    await expect.poll(() => sentOf(gateway, PacketType.PLAYERCORR).length, { timeout: 60_000 }).toBe(1);
    await page.waitForTimeout(1000);
    const corrs = sentOf(gateway, PacketType.PLAYERCORR);
    expect(corrs).toHaveLength(1);
    expect(movedState(corrs[0]!)).toBe(OBJSTA_STAND);
    expect(movesOf(gateway)).toEqual([]);
    const own = await ownAt(page);
    expect(own[0]).toBeGreaterThan(WALL_X);
    expect(own[0]).toBeLessThan(BY_THE_WALL[0] - 4);
  });

  // the Start menu's Log out replaces Piece 3's Leave in the world (spec §3.9), and leaves as it did
  test("the Start menu's Log out returns to the login form", async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await expect(page.getByRole('button', { name: 'Leave' })).toHaveCount(0);
    await logOut(page);

    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
    // both of the world's connections are closed: the login server's and the cache server's
    const login = gateway.sent.find((s) => s.port === Port.LOGIN)!.connection;
    const cache = gateway.sent.find((s) => s.port === Port.CACHE)!.connection;
    await expect.poll(() => gateway.closed).toEqual(expect.arrayContaining([login, cache]));
  });

  test('a dropped cache connection shows the lost text', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    // 4002: the server ended the connection (the gateway passes the close on)
    await gateway.closeCache(4002);

    await expect(page.getByRole('alert')).toHaveText('The connection to the game was lost.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });
});
