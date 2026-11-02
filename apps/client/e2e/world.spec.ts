// The world screen against scripted servers: as in lobby.spec.ts, every WebSocket the page opens is answered by a
// script that plays the server behind the gateway, here the certifier, the login server and the cache server (with the
// world server behind it, `createWorldScript`). The world drawn is the converted Flaris in the worktree's dist/assets,
// which the dev server serves as the viewer's does.

import { expect, test } from '@playwright/test';
import type { AssetIndex } from '@flyffweb/formats';
import { ArReader, MessageType, NULL_ID, PacketType, Port, ShortcutKind } from '@flyffweb/protocol';
import type { AddedMover, MoveReport, Shortcut, TaskBar, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf, writeDamage, writeDefinedText,
  writeDelObj, writeMoverCorr, writeMoverDeath, writeMoverMoved, writeSetPointParam, writeTaskBar,
} from '@flyffweb/testkit';
import {
  ANILOOP_LOOP, BASE, DST_HP, MADRIGAL, MALE_VAGRANT, MI_MALE, MONSTER_AT, MONSTER_ID, MTI_RUN, MTI_STAND, NPC_ID,
  OBJMSG_ATK1, OBJMSG_DAMAGE, OBJSTAF_WALK, OBJSTA_FMOVE, OBJSTA_MOVE_ALL, OBJSTA_STAND, ON_FRAMES, SELF_ID, SELF_PLAYER,
  SQUARE, aibatt, destPosOf, distanceXZ, enterFlaris, flaris, groundAt, julia, logOut, movedState, movedStateFlag, movesOf,
  ownAt, hpOf, hudTexts, playGateway, recordHudTexts, self, sentOf, startEntering, tapEnter, tapMover, tapWorld, targetsOf,
} from './worldHarness';

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen. The waits on the frame
// loop are `ON_FRAMES` (ruling R28).
test.describe.configure({ timeout: 120_000 });

// These run in Chromium on a desktop and as a touch phone (playwright.config.ts). The picture is the desktop's only.
// Flaris, the servers and the helpers are worldHarness.ts's.

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

  // Piece 6 M5: the Stats panel's numbers as the soak test reads them. The draw calls are the world frame's, read right
  // after its render: a later pass (the screen layers, a portrait) draws a handful, Flaris's 3 x 3 tiles hundreds.
  test('the stats hook reads the world frame: draw calls, triangles and three.js counts', async ({ page }) => {
    await playGateway(page);
    await enterFlaris(page);
    const perf = () => page.evaluate(() => window.__client!.perf());
    await expect.poll(async () => (await perf()).drawCalls, ON_FRAMES).toBeGreaterThan(50);
    const numbers = await perf();
    expect(numbers.triangles).toBeGreaterThan(0);
    expect(numbers.renderer.programs).toBeGreaterThan(0);
    expect(numbers.loadedTiles).toHaveLength(25);
    expect(numbers.errors).toEqual([]);
  });

  test('bundles after entering: a player comes into view, runs, and leaves', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const bobAt = async () => (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === BOB_ID)?.pos;

    // the waits below are on the frame loop (Bob's model, his run): 60 s, as this file's other waits on it, since Chromium
    // draws with SwiftShader on the CPU and another file's world drawn beside it starves the frames (ruling R28)
    gateway.pushCache(flaris.later([writeAddPlayer(BOB_ID, bob)]));
    await expect.poll(async () => (await page.evaluate(() => window.__client!.movers())).map((m) => m.name), { timeout: 60_000 })
      .toContain('Bob');
    expect(await bobAt()).toEqual(BOB_AT);

    // Bob runs south (angle 0: D3D -z), behind a message nothing reads: the table of contents lets the run through
    const run: MoveReport = {
      pos: BOB_AT, delta: [0, 0, 0], angle: 0, state: OBJSTA_FMOVE, stateFlag: 0, motion: MTI_RUN, motionEx: 0,
      loop: ANILOOP_LOOP, motionOption: 0, tick: 123456789n,
    };
    gateway.pushCache(flaris.later([UNREAD, writeMoverMoved(BOB_ID, run)]));
    await expect.poll(async () => (await bobAt())?.[2] ?? Infinity, { timeout: 60_000 }).toBeLessThan(BOB_AT[2] - 1);

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
    // the waits below are on the frame loop (Bob's model, his run): 60 s, as this file's other waits on it, since Chromium
    // draws with SwiftShader on the CPU and another file's world drawn beside it starves the frames (ruling R28)
    gateway.pushCache(flaris.later([writeAddPlayer(BOB_ID, bob)]));
    await expect.poll(async () => (await bobAt()) !== undefined, { timeout: 60_000 }).toBe(true);

    // Bob runs south (angle 0: D3D -z): the browser runs it on toward where its PLAYERMOVED says it will be
    const run: MoveReport = {
      pos: BOB_AT, delta: [0, 0, 0], angle: 0, state: OBJSTA_FMOVE, stateFlag: 0, motion: MTI_RUN, motionEx: 0,
      loop: ANILOOP_LOOP, motionOption: 0, tick: 123456789n,
    };
    gateway.pushCache(flaris.later([writeMoverMoved(BOB_ID, run)]));
    await expect.poll(async () => (await bobAt())?.[2] ?? Infinity, { timeout: 60_000 }).toBeLessThan(BOB_AT[2] - 0.5);

    // Bob's own client stopped it 2 m on, where it met something, and corrected it (PLAYERCORR): the world server passes
    // that on as MOVERCORR, which puts Bob there, standing, at once
    const stopped: Vec3 = [BOB_AT[0], BOB_AT[1], Math.fround(BOB_AT[2] - 2)];
    gateway.pushCache(flaris.later([writeMoverCorr(BOB_ID, {
      ...run, pos: stopped, state: OBJSTA_STAND, motion: MTI_STAND, tick: 123456790n,
    })]));
    await expect.poll(async () => (await bobAt())?.[2], { timeout: 60_000 }).toBe(stopped[2]);
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
      await expect.poll(() => movesOf(gateway).length, ON_FRAMES).toBeGreaterThan(0);
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

    // The alert comes once the entry has fetched the asset index and the catalogs through the dev server, which four
    // workers drawing in software (SwiftShader) slow well past the 5 s default; the wait is on loading, not on a frame.
    await expect(page.getByRole('alert')).toHaveText('The game files on the server are out of date.', { timeout: 30_000 });
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

  test('shows a monster and an NPC with name tags', async ({ page }) => {
    test.skip(test.info().project.use.hasTouch === true, "pictures are the desktop's only: one baseline a name (SwiftShader)");
    await playGateway(page);
    await enterFlaris(page);
    await page.evaluate(() => window.__client!.pause());

    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
    // The overlay's numbers (fps, heap) change from frame to frame, so it is masked. A screenshot waits on the frame loop.
    await expect(page).toHaveScreenshot('world-flaris-movers.png', { mask: [page.locator('#overlay')], ...ON_FRAMES });
  });

  test('walking forward sends PLAYERMOVED', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await page.keyboard.down('KeyW');
    await expect.poll(() => movesOf(gateway).length, ON_FRAMES).toBeGreaterThan(0);
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
    await expect.poll(cameraX, ON_FRAMES).toBeGreaterThan(WALL_X - 0.05);
    await page.waitForTimeout(500);
    expect(await cameraX()).toBeGreaterThan(WALL_X - 0.05);
    expect(await cameraX()).toBeLessThan(BY_THE_WALL[0] - 4);
  });

  // The chase camera looks south over Webby from 16 m north of it: a tap below the middle of the screen is on the square
  // behind Webby, a few metres north.
  test('clicking the ground sends DESTPOS and the player walks there', async ({ page, isMobile }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    await tapWorld(page, 0.5, isMobile ? 0.7 : 0.8);

    // CDPClient::SendSnapshot: one DESTPOS, forward, at a point of the square behind Webby
    await expect.poll(() => destPosOf(gateway).length, ON_FRAMES).toBe(1);
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
  test('tapping a mover selects it with SETTARGET and walks nowhere; the ground leaves the focus alone', async ({ page, isMobile }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);

    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    // another mover: the old target is released with 1, the new one focused with 2
    await tapMover(page, NPC_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NPC_ID, 2]]);
    // the same one again changes nothing
    await tapMover(page, NPC_ID);
    await page.waitForTimeout(500);
    expect(targetsOf(gateway)).toHaveLength(3);
    expect(destPosOf(gateway)).toEqual([]);

    // the ground walks (as Piece 3), and the focus stays
    // Keep clear of the NPC menu and the composer's touch targets on a short phone.
    await tapWorld(page, isMobile ? 0.7 : 0.5, isMobile ? 0.65 : 0.8);
    await expect.poll(() => destPosOf(gateway).length, ON_FRAMES).toBe(1);
    await page.waitForTimeout(500);
    expect(targetsOf(gateway)).toHaveLength(3);
  });

  // WorldScreen.apply tells the focus of a MOVERDEATH and a DEL_OBJ as they come, before the world applies them
  test('a death and a DEL_OBJ reach the focus as they come: a dead target leaving gets no release, the own kill clears it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);

    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    // the Aibatt dies with no killer (OnMoverDeath): HP 0 and the dead state, and the focus stays on it
    gateway.pushCache(flaris.later([writeMoverDeath(MONSTER_ID, NULL_ID, 0)]));
    await expect.poll(() => hpOf(page, MONSTER_ID)).toBe(0);
    // then it leaves view: the focus goes (CWorld::Process), and a dead target is not released (IsLive, World.cpp:310)
    gateway.pushCache(flaris.later([writeDelObj(MONSTER_ID)]));
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [NULL_ID, 2]]);

    // the own kill clears the focus, the live target released first (DPClient.cpp:1956-1963)
    await tapMover(page, NPC_ID);
    await expect.poll(() => targetsOf(gateway).length).toBe(3);
    gateway.pushCache(flaris.later([writeMoverDeath(NPC_ID, SELF_ID, OBJMSG_DAMAGE)]));
    await expect.poll(() => targetsOf(gateway)).toEqual([
      [MONSTER_ID, 2], [NULL_ID, 2], [NPC_ID, 2], [NPC_ID, 1], [NULL_ID, 2],
    ]);
    expect(await hpOf(page, NPC_ID)).toBe(0);
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
    await expect.poll(() => glyphs.count(), ON_FRAMES).toBe(3);
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
    // the ADD_OBJ's HP, of the maximum of a level 15 Vagrant with the stats of a character with nothing (NO_OWN): 117
    await expect(status.locator('[data-text="hp"]')).toHaveText('100 / 117');
    await expect(status.locator('[data-text="exp"]')).toHaveText('0.00%');
    // The face is drawn once the own look is loaded for it alone (its parts and the standing motion through the dev server,
    // the textures transcoded in a worker: `makePortrait`), which four workers drawing in software (SwiftShader) slowed to
    // 7 to 9 s after the world was ready, past the 5 s default; the wait is on loading, not on a frame.
    await expect(status.locator('.hud-status-face canvas')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.hud-target')).toBeHidden();

    const at = await page.evaluate((id) => window.__client!.screenOf(id), MONSTER_ID);
    expect(at).not.toBeNull();
    await tapWorld(page, at![0], at![1]);
    // MI_AIBATT2 (propMover.txt): level 1, dwAddHp 148; its ADD_OBJ's HP 100, shown to every viewer (ruling R21)
    await expect(page.locator('.hud-target-name')).toHaveText('Aibatt <Lvl 1>');
    await expect(page.locator('.hud-target-info')).toHaveText('100 / 148');

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
    // with the Start menu open, Escape does nothing (WndManager.cpp:3321): the menu and the status window stay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(status).toBeVisible();
    // the menu's Status closes the status window, and opens it again (ObjectExecutor on APP_STATUS1)
    await page.getByRole('menuitem', { name: 'Status' }).click();
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(status).toBeHidden();
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Status' }).click();
    await expect(status).toBeVisible();
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);

    await logOut(page);
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.locator('.world-hud')).toHaveCount(0);
  });

  // The task bar (CWndTaskBar, Piece 4 §3.9) with the JOIN's TASKBAR, drawn with the converted pictures (none missing from
  // the asset index, or the overlay would list it)
  test("the task bar draws the JOIN's TASKBAR, and F5 and the digits are the bar's, not the browser's", async ({ page, isMobile }) => {
    await playGateway(page, flarisWithNewBar);
    await enterFlaris(page);
    const slot = (row: string, i: number) => page.locator(`.hud-slot[data-row="${row}"][data-slot="${i}"]`);
    await expect(slot('item', 0)).toHaveAttribute('data-kind', 'item');
    await expect(slot('item', 0).locator('.hud-slot-count')).toHaveText('3');
    await expect(slot('item', 1).locator('.hud-slot-count')).toHaveText('1');
    await expect(slot('item', 2)).toHaveAttribute('data-kind', 'plain');
    if (isMobile) await expect(page.locator('.hud-slot[data-row=applet]')).toHaveCount(0);
    else {
      // APP_COMM_ITEM (398, J) has no window here: Piece 5 greys it and draws no hotkey, as its key does nothing
      await expect(slot('applet', 1)).toHaveAttribute('data-greyed', '');
      await expect(slot('applet', 1).locator('.hud-slot-hotkey')).toHaveText('');
    }
    // F5 is the fifth slot of the bar (empty here): the page is not reloaded, and 2 shows the second bar
    await page.keyboard.press('F5');
    await page.keyboard.press('Digit2');
    await expect(page.locator('.hud-taskbar-number')).toHaveText('2');
    await expect(slot('item', 0)).not.toHaveAttribute('data-kind');
    await page.keyboard.press('Digit1');
    await expect(slot('item', 0)).toHaveAttribute('data-kind', 'item');
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // The own death (CDPClient::OnMoverDeath, DPClient.cpp:2040-2072) opens the revive window (CWndRevival, WBS_MODAL), which
  // takes the presses and the keys while it is open and closes the Start menu (CWndTaskMenu::OnKillFocus); Lodestar sends
  // REVIVAL_TO_LODESTAR, and Escape while still dead opens it again (CWndMgr::Process, WndManager.cpp:3311-3318)
  test('the own death opens the modal revive window; Lodestar sends REVIVAL_TO_LODESTAR, and Escape while dead opens it again', async ({ page }) => {
    const gateway = await playGateway(page, flarisWithNewBar);
    await enterFlaris(page);
    const status = page.locator('.hud-status');
    const menu = page.getByRole('menu');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(menu).toBeVisible();
    // the frame after the death plays its chat line, then opens the window (WorldScreen's `play`): a wait on the frame loop
    // (R28). The line fades 3 s (wall clock) after it came (CClientMsg), and a frame under load can take longer than that,
    // so a poll of the DOM may never see it: its text is read as the HUD added it (`recordHudTexts`), started before the
    // death is pushed
    await recordHudTexts(page);
    gateway.pushCache(flarisWithNewBar.later([writeMoverDeath(SELF_ID, MONSTER_ID, OBJMSG_DAMAGE)]));
    await expect.poll(async () => (await hudTexts(page))?.lines, ON_FRAMES)
      .toEqual(['Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.']);
    const revive = page.locator('.hud-revive');
    await expect(revive).toBeVisible();
    await expect(menu).toBeHidden();
    // the backdrop takes the press on the Start button under it; no key reaches the game: T, Escape
    const start = (await page.getByRole('button', { name: 'Start' }).boundingBox())!;
    const at = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    if (test.info().project.use.hasTouch === true) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await page.keyboard.press('t');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(menu).toBeHidden();
    await expect(status).toBeVisible();
    await expect(revive).toBeVisible();
    // Lodestar: one REVIVAL_TO_LODESTAR, and the window goes
    await page.locator('[data-button="lodestar"]').click();
    await expect(revive).toBeHidden();
    await expect.poll(() => sentOf(gateway, PacketType.REVIVAL_TO_LODESTAR).length).toBe(1);
    // no answer from the server: still dead, Escape opens the window again
    await page.keyboard.press('Escape');
    await expect(revive).toBeVisible();
    expect(sentOf(gateway, PacketType.REVIVAL_TO_LODESTAR)).toHaveLength(1);
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

  test('pressing a turn key cancels it', async ({ page, isMobile }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    // The rules are held (the test hooks' pause) and stepped, so that the key goes down while the walk is under way: under
    // load a frame runs up to 60 steps (1 s), the whole walk, and a key sent once Webby was seen moving came after it had
    // arrived (a turn standing: one PLAYERMOVED, and no other while the key is held)
    await page.evaluate(() => window.__client!.pause());
    // as far behind Webby as the screen shows above the task bar (about 7 m on the desktop: it runs there in about 1 s);
    // on the phone held on its side (342 px high) the bar starts at 0.87 of it
    const canvas = (await page.locator('.world-view canvas').boundingBox())!;
    const barTop = (await page.locator('.hud-taskbar-strip').boundingBox())!.y;
    const composerTop = (await page.locator('.hud-chat form').boundingBox())?.y ?? barTop;
    await tapWorld(page, isMobile ? 0.7 : 0.5,
      isMobile ? 0.65 : Math.min(0.92, (Math.min(barTop, composerTop) - 8 - canvas.y) / canvas.height));
    // the tap's step walks there and sends the DESTPOS; 10 more (1/6 s) and Webby is on the way, far from the point
    await page.evaluate(() => window.__client!.step(1));
    await expect.poll(() => destPosOf(gateway).length).toBe(1);
    const dest = destPosOf(gateway)[0]!.pos;
    await page.evaluate(() => window.__client!.step(10));
    const walking = await ownAt(page);
    expect(distanceXZ(walking, SQUARE)).toBeGreaterThan(0.5);
    expect(distanceXZ(walking, dest)).toBeGreaterThan(1);

    // the turn is a move (LTURN answers 1): ClearDest, then PLAYERMOVED; with the walk over, the next step stands
    await page.keyboard.down('KeyA');
    await page.evaluate(() => window.__client!.step(2));
    await expect.poll(() => movesOf(gateway).length).toBe(2);
    // let go, the next step stops turning: STAND
    await page.keyboard.up('KeyA');
    await page.evaluate(() => window.__client!.step(1));
    await expect.poll(() => movedState(movesOf(gateway).at(-1)!)).toBe(OBJSTA_STAND);
    const stopped = await ownAt(page);
    // a second of steps later Webby is still there, short of the point
    await page.evaluate(() => window.__client!.step(60));
    expect(await ownAt(page)).toEqual(stopped);
    expect(distanceXZ(stopped, dest)).toBeGreaterThan(1);
  });

  // X is the walk key (spec §1): it toggles walking and running as Neuz's does, and Shift no longer changes the gait
  test('X toggles walking with one PLAYERBEHAVIOR, and W with Shift moves at that gait', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const behaviors = () => sentOf(gateway, PacketType.PLAYERBEHAVIOR);
    // the X press is kept until the next rules step reads it (WalkKey), which sends the PLAYERBEHAVIOR: these waits are on
    // the frame loop, 60 s as this file's other waits on it (SwiftShader draws on the CPU; worlds beside it starve frames)
    await page.keyboard.press('KeyX');
    await expect.poll(() => behaviors().length, { timeout: 60_000 }).toBe(1);
    expect(movedStateFlag(behaviors()[0]!) & OBJSTAF_WALK).toBe(OBJSTAF_WALK);

    // Shift held with W walks, as W alone does now: the move goes out walking, with no change of mode
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyW');
    await expect.poll(() => movesOf(gateway).length, { timeout: 60_000 }).toBeGreaterThan(0);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Shift');
    expect(movedStateFlag(movesOf(gateway)[0]!) & OBJSTAF_WALK).toBe(OBJSTAF_WALK);
    await page.waitForTimeout(500);
    expect(behaviors()).toHaveLength(1);

    // X again: running
    await page.keyboard.press('KeyX');
    await expect.poll(() => behaviors().length, { timeout: 60_000 }).toBe(2);
    expect(movedStateFlag(behaviors()[1]!) & OBJSTAF_WALK).toBe(0);
  });

  // The Aibatt stands 6 m ahead of Webby: a tap selects it, the next one walks Webby up to it and swings (spec §3.4)
  test('tapping the selected monster again walks up to it with one PLAYERSETDESTOBJ and attacks; a turn key stops it', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    const approaches = () => sentOf(gateway, PacketType.PLAYERSETDESTOBJ);
    const swings = () => sentOf(gateway, PacketType.MELEE_ATTACK);

    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await page.waitForTimeout(1000);
    expect(approaches()).toEqual([]);

    await tapMover(page, MONSTER_ID);
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

    // a turn key stops the auto-attack: the swing under way ends, and no more come. From the key's moves on the rules are
    // held (the test hooks' pause) and stepped: 90 steps (1.5 s) for the swing to end, 120 more with none, counted in steps
    // the rules ran, not in the time the page takes under load
    await page.keyboard.down('KeyA');
    await expect.poll(() => movesOf(gateway).length, ON_FRAMES).toBeGreaterThan(0);
    await page.keyboard.up('KeyA');
    await page.evaluate(() => window.__client!.pause());
    await page.evaluate(() => window.__client!.step(90));
    const count = swings().length;
    await page.evaluate(() => window.__client!.step(120));
    expect(swings()).toHaveLength(count);
    expect(approaches()).toHaveLength(1);

    // within 10 s of a swing the player is fighting (IsAttackMode: m_nAtkCnt under 600 steps, held here with the rules):
    // Log out is refused, in red (WndManager.cpp:2613-2617)
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    const refusal = page.locator('.hud-messages > div', { hasText: 'You cannot quit during combat.' });
    await expect(refusal).toHaveCount(1);
    expect(await refusal.evaluate((e) => (e as HTMLElement).style.color)).toBe('rgb(255, 0, 0)');
    await expect(page.getByText('Do you want to disconnect?')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('a tap-walk into a Flaris wall stops there and sends one PLAYERCORR, standing', async ({ page }) => {
    // Webby faces the house's east wall 5.5 m away; a tap above the middle of the screen is on the land behind the wall
    // (the house's model is not pickable: the ray goes through it), so the walk there meets the wall
    const gateway = await playGateway(page, byTheWall);
    await enterFlaris(page);
    await tapWorld(page, 0.5, 0.45);
    await expect.poll(() => destPosOf(gateway).length, ON_FRAMES).toBe(1);
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
    const login = gateway.sent.find((s) => s.port === Port.LOGIN)!.connection;
    const cache = gateway.sent.find((s) => s.port === Port.CACHE)!.connection;
    // the box asks first (CWndLogOut: "Message Box", TID_DIAG_0069); it is modal (WBS_MODAL, WndMessageBox.cpp:202), so
    // Escape does not close it; Cancel keeps the player in the world
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByText('Do you want to disconnect?')).toBeVisible();
    await expect(page.locator('.hud-logout .hud-window-title')).toHaveText('Message Box');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.getByText('Do you want to disconnect?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Do you want to disconnect?')).toBeHidden();
    await page.waitForTimeout(300);
    expect(gateway.closed).not.toContain(login);
    expect(gateway.closed).not.toContain(cache);
    await logOut(page);

    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
    // both of the world's connections are closed: the login server's and the cache server's
    await expect.poll(() => gateway.closed).toEqual(expect.arrayContaining([login, cache]));
  });

  // The browser asks before the tab is closed, reloaded or left while the world is open (askBeforeLeaving). `runBeforeUnload` makes
  // Playwright's close raise the dialog a player's close would (a plain `page.close()` skips it); dismissing it keeps the
  // page. The page has been clicked (the login form), as Chromium needs before it shows a beforeunload dialog.
  test('closing the page in the world asks first; in the lobby after Log out it does not', async ({ page }) => {
    const dialogs: string[] = [];
    // a listener turns off Playwright's automatic dismissal of every dialog type: all are dismissed here, as it did
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await playGateway(page);
    await enterFlaris(page);

    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    expect((await asked).type()).toBe('beforeunload');
    // dismissed: the player stays in the world
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();

    // Log out returns to the login form without unloading, and ends the question
    await logOut(page);
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    const closed = page.waitForEvent('close');
    await page.close({ runBeforeUnload: true });
    await closed;
    expect(dialogs).toEqual(['beforeunload']);
  });

  test('a dropped cache connection shows the lost text, in the reconnect box (Piece 6 M3)', async ({ page }) => {
    const gateway = await playGateway(page);
    await enterFlaris(page);
    // 4002: the server ended the connection (the gateway passes the close on)
    await gateway.closeCache(4002);

    await expect(page.getByRole('alert')).toHaveText('The connection to the game was lost.');
    await page.getByRole('button', { name: 'Back to login' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });
});
