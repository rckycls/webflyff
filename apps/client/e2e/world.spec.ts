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
import { ArReader, ArWriter, MessageType, NULL_ID, PacketType, Port } from '@flyffweb/protocol';
import type { AddedMover, AddedNpc, AddedPlayer, MoveReport, Vec3 } from '@flyffweb/protocol';
import { sampleHeight } from '@flyffweb/scene';
import {
  createWorldScript, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf, writeDelObj, writeMoverMoved,
} from '@flyffweb/testkit';
import type {} from '../src/testHooks'; // window.__client

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
/** `OBJSTA_STAND` (`MoverMsg.h`), `OBJSTA_FMOVE`, `OBJSTA_MOVE_ALL`, `BELLI_PEACEFUL` (`defineAttribute.h:203`). */
const OBJSTA_STAND = 0x01;
const OBJSTA_FMOVE = 0x04;
/** `MTI_RUN` (`Resource/defineNeuz.h`) and `ANILOOP_LOOP` (`_Common/Obj.h:28`). */
const MTI_RUN = 5;
const ANILOOP_LOOP = 0x04;
const OBJSTA_MOVE_ALL = 0xff;
const BELLI_PEACEFUL = 1;
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

const SELF_PLAYER: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0xff907b6d, headMesh: 0, playerId: 500, job: 0,
  level: 15, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
  equipmentObjectIds: Array.from({ length: MAX_HUMAN_PARTS }, () => NULL_ID), shopTitle: '',
};
const NPC_PART: AddedNpc = {
  hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [], activeAttack: 0, movePattern: 0, moveEvent: 0,
  moveEventCount: 0, speedFactor: 1,
};
const self: AddedMover = { ...BASE, index: MI_MALE, pos: SQUARE, angle: 0, objectId: SELF_ID, isPlayer: true, player: SELF_PLAYER };
const aibatt: AddedMover = { ...BASE, index: MI_AIBATT, pos: MONSTER_AT, angle: 180, objectId: MONSTER_ID, isPlayer: false, npc: NPC_PART };
const julia: AddedMover = {
  ...BASE, index: MI_FEMALE, pos: NPC_AT, angle: 180, objectId: NPC_ID, isPlayer: false, belligerence: BELLI_PEACEFUL,
  npc: { ...NPC_PART, characterKey: 'MaFl_Juria', hairMesh: 2, hairColor: 0xff8a5a3c, worn: FEMALE_VAGRANT },
};

const flaris = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia)],
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

/** Logs in, picks Channel 1 and enters with Webby; resolves once the world is on screen. */
async function enterFlaris(page: Page): Promise<void> {
  await startEntering(page);
  await page.evaluate(() => window.__client!.ready());
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
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

/** Clicks (or, on a phone, taps) the world's drawing at `x`, `y` (shares of its width and height). */
async function tapWorld(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

/** The state in a PLAYERMOVED (`CDPClient::SendPlayerMoved`): after DPID_UNKNOWN, the type, the position, the delta and the angle. */
const movedState = (moved: Sent): number => moved.body.readUInt32LE(4 + 4 + 12 + 12 + 4);

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
    // no STAND cut the walk short on the way: the walk to a point sends no move of its own
    expect(movesOf(gateway)).toEqual([]);
  });

  test('pressing a turn key cancels it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await tapWorld(page, 0.5, 0.9);
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    const dest = destPosOf(gateway)[0]!.pos;
    await expect.poll(async () => distanceXZ(await ownAt(page), SQUARE), { timeout: 60_000 }).toBeGreaterThan(1);

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

  test('Leave returns to the login form', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await page.getByRole('button', { name: 'Leave' }).click();

    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Leave' })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Leave' })).toHaveCount(0);
  });
});
