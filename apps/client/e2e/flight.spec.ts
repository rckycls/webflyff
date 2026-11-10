// Flying against the pretend world server (Piece 7 M5, plan Task 12 Step 3; spec §3.6): Webby, level 20 with a Magic
// Broom (5000) at inventory object 3, takes off from the task bar, flies and turns, fights a Small Mothbee in the air and
// lands; another player flies by on a Hover Board; Webby enters the world already on its broom; and the phone's flight
// buttons. The world server's answers are scripted (`worldHarness.ts`); the packets the page sent are read off the cache
// connection with `decodeWorldPacket`, as the world server reads them.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { NULL_ID, PacketType, ShortcutKind, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, FlightReport, OwnCharacter, Vec3, WorldPacket } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddPlayer, writeAddSelf, writeDoEquip, writeMoverMoved2,
  writeSetFuel, writeSetPos, writeStateMode, writeTaskBar,
} from '@flyffweb/testkit';
import type { ScriptMessage, WorldScript } from '@flyffweb/testkit';
import type { ClientMover } from '../src/testHooks';
import {
  ANILOOP_LOOP, BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, NPC_PART, OBJSTA_FMOVE, OBJSTA_MOVE_ALL, OBJSTA_STAND, ON_FRAMES,
  SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

const isTouch = (): boolean => test.info().project.use.hasTouch === true;

/** `II_RID_RID_STI_MAGIC` (the Magic Broom) and `II_RID_RID_BOA_HOVER` (the Hover Board), propItem.txt. */
const MAGIC_BROOM = 5000;
const HOVER_BOARD = 5101;
/** The broom's place in Webby's bag. */
const BROOM_OBJECT = 3;
/** `PARTS_RIDE` (`defineItemkind.h`). */
const PARTS_RIDE = 13;
/** The broom's `fFlightSpeed` as DOUSEITEM and DOEQUIP carry it: the float of its written '0.0023'. */
const BROOM_FLOAT = Math.fround(0.0023);
/** `STATE_BASEMOTION_MODE`: the cast's state mode (STATEMODE ON with the item). */
const STATE_BASEMOTION_MODE = 4;
/** `OBJSTAF_FLY`, `_ACC`, `_TURBO` (`MoverMsg.h:98-102`); `OBJSTA_LTURN`, `_RTURN`; `OBJMSG_ATK1`. */
const FLY = 8;
const ACC = 16;
const TURBO = 128;
const LTURN = 0x100;
const RTURN = 0x200;
const OBJMSG_ATK1 = 29;
/** `MI_SMALL_MOTHBEE` (propMover.txt): a level-20 flying monster. */
const SMALL_MOTHBEE = 304;
const MOTHBEE_ID = 9060;
const FLIER_ID = 9070;
/** The Hover Board's `dwUseMotion` (61) plus `MTA_FRUNNING1` (7), and `MOP_FIXED`. */
const BOARD_FRUNNING = 68;
const MOP_FIXED = 2;
/** The server tick of the QUERYTICKCOUNT answer (`playGateway`). */
const SERVER_TICK = 123456789n;

/** Webby's bag: a new Vagrant's, with the Magic Broom at object 3. */
function webbyOwn(): OwnCharacter {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: BROOM_OBJECT, itemId: MAGIC_BROOM, count: 1 });
  own.inventory!.sort((a, b) => a.objectId - b.objectId); // the inventory is listed in rising slots
  return own;
}

/** Webby at level 20; `riding` wears the broom (`m_aEquipInfo[PARTS_RIDE].dwId` 3) and flies (`OBJSTAF_FLY`) at `pos`. */
function webby(riding: { pos: Vec3 } | null = null): AddedMover {
  const equipmentObjectIds = Array.from({ length: 31 }, (_, part) => (riding !== null && part === PARTS_RIDE ? BROOM_OBJECT : NULL_ID));
  return {
    ...self, ...(riding !== null ? { pos: riding.pos, stateFlag: FLY } : {}),
    player: { ...SELF_PLAYER, level: 20, own: webbyOwn(), equipmentObjectIds, ...(riding !== null ? { fuel: 1200 } : {}) },
  };
}

function scriptFor(riding: { pos: Vec3 } | null = null, others: ScriptMessage[] = []): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: riding?.pos ?? SQUARE, self: writeAddSelf(SELF_ID, webby(riding)), others,
  });
}

/** Webby in the character list at level 20, in the Vagrant's clothes. */
const LISTED = { listed: { level: 20, equipment: MALE_VAGRANT } };

/** The broom on the task bar's first slot. */
const bar = writeTaskBar(SELF_ID, {
  applets: [], queue: [], actionPoint: 0,
  items: [{ bar: 0, slot: 0, shortcut: { kind: ShortcutKind.ITEM, id: BROOM_OBJECT, type: 0, index: 0, userId: 0, data: 1, text: '' } }],
});

const slot = (page: Page, n: number): Locator => page.locator(`.hud-slot[data-row="item"][data-slot="${n}"]`);

/** Uses the task bar's slot: F1, F2 ... on the PC, a tap on the phone. */
async function useSlot(page: Page, n: number): Promise<void> {
  if (isTouch()) await slot(page, n).click();
  else await page.keyboard.press(`F${n + 1}`);
}

/** The packets of `type` the page sent on the cache connection, read as the world server reads them. */
function decoded<T extends WorldPacket['type']>(gateway: Gateway, type: number, name: T): Array<Extract<WorldPacket, { type: T }>> {
  return sentOf(gateway, type).map((s) => {
    const packet = decodeWorldPacket(new Uint8Array(s.body));
    if (packet.type !== name) throw new Error(`a packet of type 0x${type.toString(16)} read as ${packet.type}`);
    return packet as Extract<WorldPacket, { type: T }>;
  });
}
const uses = (gateway: Gateway) => decoded(gateway, PacketType.DOUSEITEM, 'useItem');
const moved2 = (gateway: Gateway) => decoded(gateway, PacketType.PLAYERMOVED2, 'playerMoved2');
const behavior2 = (gateway: Gateway) => decoded(gateway, PacketType.PLAYERBEHAVIOR2, 'playerBehavior2');
const attacks2 = (gateway: Gateway) => decoded(gateway, PacketType.MELEE_ATTACK2, 'meleeAttack2');

const moverOf = async (page: Page, objectId: number): Promise<ClientMover | undefined> =>
  (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId);
const own = async (page: Page): Promise<ClientMover> => (await moverOf(page, SELF_ID))!;
const flagOf = async (page: Page, objectId: number, flag: number): Promise<number> => ((await moverOf(page, objectId))?.stateFlag ?? 0) & flag;
const errorsOf = async (page: Page): Promise<string[]> => (await page.evaluate(() => window.__client!.stats())).errors;
/** The signed difference `to - from` of two angles in degrees, in -180..180. */
const turned = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/**
 * Takes off as the plan's "take off" has the world server answer: the broom used from the task bar (DOUSEITEM), its cast
 * (STATEMODE ON with the broom), then the cast's end (STATEMODE OFF) and the broom worn (DOEQUIP `fEquip` 1, part -1).
 */
async function takeOff(page: Page, gateway: Gateway, script: WorldScript): Promise<void> {
  gateway.pushCache(script.later([bar]));
  await expect(slot(page, 0)).toHaveAttribute('data-kind', 'item', ON_FRAMES);
  const before = uses(gateway).length;
  await useSlot(page, 0);
  await expect.poll(() => uses(gateway).length).toBe(before + 1);
  gateway.pushCache(script.later([writeStateMode(SELF_ID, STATE_BASEMOTION_MODE, 0, MAGIC_BROOM)]));
  await expect(page.locator('.cast-gauge')).toBeVisible(ON_FRAMES);
  gateway.pushCache(script.later([
    writeStateMode(SELF_ID, 0, 1), writeDoEquip(SELF_ID, BROOM_OBJECT, MAGIC_BROOM, true, -1),
  ]));
  await expect(page.locator('.cast-gauge')).toBeHidden(ON_FRAMES);
  await expect.poll(() => flagOf(page, SELF_ID, FLY), ON_FRAMES).toBe(FLY);
}

test('take off: the broom from the task bar sends DOUSEITEM with part 13 and its float; DOEQUIP flies Webby', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  expect(await flagOf(page, SELF_ID, FLY)).toBe(0);
  await takeOff(page, gateway, script);
  // 1. DOUSEITEM: the broom's object, PARTS_RIDE and the float of '0.0023' (Decision 12)
  expect(uses(gateway)).toEqual([{ type: 'useItem', objectId: BROOM_OBJECT, targetId: NULL_ID, part: PARTS_RIDE, flightSpeed: BROOM_FLOAT }]);
  // 3. flying, on the broom
  const webbyNow = await own(page);
  expect(webbyNow.stateFlag & FLY).toBe(FLY);
  expect(webbyNow.rideItemId).toBe(MAGIC_BROOM);
  // hovering: no gravity pulls it down
  const at = webbyNow.pos;
  await page.waitForTimeout(1000);
  expect((await own(page)).pos[1]).toBeCloseTo(at[1], 3);
  expect(await errorsOf(page)).toEqual([]);
});

test('fly and turn: Space sends PLAYERMOVED2 with ACC, Webby flies along its heading, D turns with one PLAYERMOVED2', async ({ page }) => {
  test.skip(isTouch(), "Space and D are the PC's keys; the phone's stick and Accelerate have their own test");
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await takeOff(page, gateway, script);
  const start = await own(page);
  // 1. Space: the thrust (ACC), and PLAYERMOVED2 with nFrame 37
  await page.keyboard.press('Space');
  await expect.poll(() => moved2(gateway).filter((p) => (p.move.stateFlag & ACC) !== 0).length, ON_FRAMES).toBeGreaterThan(0);
  const thrust = moved2(gateway).find((p) => (p.move.stateFlag & ACC) !== 0)!;
  expect(thrust.frames).toBe(37);
  expect(thrust.move.stateFlag & FLY).toBe(FLY);
  // 2. two seconds on, Webby has flown south along its heading (angle 0: D3D -z)
  await page.waitForTimeout(2000);
  const flown = await own(page);
  const south = start.pos[2] - flown.pos[2];
  expect(south).toBeGreaterThan(1);
  expect(Math.abs(flown.pos[0] - start.pos[0])).toBeLessThan(south / 4);
  expect(flown.stateFlag & ACC).toBe(ACC);
  // 3. D held: the angle falls, and the turn goes out as one RTURN PLAYERMOVED2, not one a step
  const sentBefore = moved2(gateway).length;
  await page.keyboard.down('d');
  await expect.poll(async () => turned(flown.angle, (await own(page)).angle), ON_FRAMES).toBeLessThan(-5);
  await page.waitForTimeout(1000); // some 60 rules steps held
  const rightTurns = moved2(gateway).slice(sentBefore).filter((p) => (p.move.state & (LTURN | RTURN)) === RTURN);
  expect(rightTurns).toHaveLength(1);
  expect(rightTurns[0]!.frames).toBe(37);
  await page.keyboard.up('d');
  // the let-go stops the turn: the last PLAYERMOVED2 has no turn in it
  await expect.poll(() => (moved2(gateway).at(-1)!.move.state & (LTURN | RTURN)), ON_FRAMES).toBe(0);
  expect(moved2(gateway).slice(sentBefore).filter((p) => (p.move.state & (LTURN | RTURN)) === RTURN)).toHaveLength(1);
  expect(await errorsOf(page)).toEqual([]);
});

test('fight in the air: the Mothbee selected and the attack held send MELEE_ATTACK2 once it is within 3 m', async ({ page }) => {
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await takeOff(page, gateway, script);
  const at = (await own(page)).pos;
  // a Small Mothbee 6 m ahead (south) at Webby's height, then brought to 2 m by the server
  const far: Vec3 = [at[0], at[1] + 0.5, at[2] - 6];
  const near: Vec3 = [at[0], at[1] + 0.5, at[2] - 2];
  const mothbee: AddedMover = {
    ...BASE, index: SMALL_MOTHBEE, pos: far, angle: 180, objectId: MOTHBEE_ID, isPlayer: false, npc: NPC_PART, hitPoint: 3404,
  };
  gateway.pushCache(script.later([writeAddMonster(MOTHBEE_ID, mothbee)]));
  await expect.poll(() => page.evaluate((id) => window.__client!.screenOf(id), MOTHBEE_ID), ON_FRAMES).not.toBeNull();
  // a click (a tap) on a flying monster selects it in the air (Decision 5)
  await tapMover(page, MOTHBEE_ID);
  await expect.poll(() => targetsOf(gateway).some(([id]) => id === MOTHBEE_ID), ON_FRAMES).toBe(true);
  // the attack held: Insert on the PC, the Attack button on the phone
  const session = isTouch() ? await page.context().newCDPSession(page) : null;
  const attack = page.locator('.hud-attack');
  if (session !== null) {
    await expect(attack).toBeEnabled(ON_FRAMES);
    const box = (await attack.boundingBox())!;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 7, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
  } else {
    await page.keyboard.down('Insert');
  }
  // 6 m away: out of the swing's 3 m, nothing is sent
  await page.waitForTimeout(1000);
  expect(attacks2(gateway)).toEqual([]);
  // within 3 m: the swing (ATK1) and its MELEE_ATTACK2
  gateway.pushCache(script.later([writeSetPos(MOTHBEE_ID, near)]));
  await expect.poll(() => attacks2(gateway).length, ON_FRAMES).toBeGreaterThan(0);
  expect(attacks2(gateway)[0]).toEqual({ type: 'meleeAttack2', message: OBJMSG_ATK1, targetId: MOTHBEE_ID, param2: 0, param3: 0 });
  // no ground attack goes out in the air
  expect(sentOf(gateway, PacketType.MELEE_ATTACK)).toEqual([]);
  if (session !== null) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.keyboard.up('Insert');
  }
  expect(await errorsOf(page)).toEqual([]);
});

/**
 * Webby flies up under thrust (Space, then W held: the nose up, the owner's reversal of 2026-11-11) until it is `up` m over
 * the ground: the PC's keys.
 */
async function climb(page: Page, up: number): Promise<void> {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await own(page)).stateFlag & ACC, ON_FRAMES).toBe(ACC);
  await page.keyboard.down('w');
  await expect.poll(async () => heightOver(await own(page)), ON_FRAMES).toBeGreaterThan(up);
  await page.keyboard.up('w');
}

/** How high the mover is over the terrain under it. */
const heightOver = (m: ClientMover): number => m.pos[1] - groundAt(m.pos[0], m.pos[2]);

/** Lifts the hovering Webby `up` m (the server's SETPOS), so that the landing has a fall. */
async function lift(page: Page, gateway: Gateway, script: WorldScript, up: number): Promise<void> {
  const at = (await own(page)).pos;
  const high: Vec3 = [at[0], at[1] + up, at[2]];
  gateway.pushCache(script.later([writeSetPos(SELF_ID, high)]));
  await expect.poll(async () => (await own(page)).pos[1], ON_FRAMES).toBeCloseTo(high[1], 1);
  await page.waitForTimeout(500);
  expect((await own(page)).pos[1]).toBeCloseTo(high[1], 1); // still hovering there
}

/** The server takes the ride off (DOEQUIP `fEquip` 0, part 13): Webby lands, falls and stands on the ground. */
async function expectLanding(page: Page, gateway: Gateway, script: WorldScript): Promise<void> {
  expect(heightOver(await own(page))).toBeGreaterThan(3);
  gateway.pushCache(script.later([writeDoEquip(SELF_ID, BROOM_OBJECT, MAGIC_BROOM, false, PARTS_RIDE)]));
  await expect.poll(() => flagOf(page, SELF_ID, FLY), ON_FRAMES).toBe(0);
  await expect.poll(async () => heightOver(await own(page)), ON_FRAMES).toBeCloseTo(0, 1);
  await expect.poll(async () => (await own(page)).state & (OBJSTA_MOVE_ALL | 0xf000), ON_FRAMES).toBe(OBJSTA_STAND);
  const landed = await own(page);
  expect(landed.rideItemId).toBeNull();
  expect(landed.angleX).toBe(0);
  await page.waitForTimeout(1000); // and it stays there, standing
  const later = await own(page);
  expect(heightOver(later)).toBeCloseTo(0, 1);
  expect(later.pos).toEqual(landed.pos);
}

test('land: the broom used again sends DOUSEITEM with part 13; DOEQUIP fEquip 0 lands Webby, which falls and stands', async ({ page }) => {
  test.skip(isTouch(), "the climb is the PC's keys; the phone's Land button has its own test");
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await takeOff(page, gateway, script);
  await climb(page, 6);
  // 1. the broom used again (the task bar, worn): DOUSEITEM with PARTS_RIDE and its float
  await useSlot(page, 0);
  await expect.poll(() => uses(gateway).length).toBe(2);
  expect(uses(gateway)[1]).toEqual({ type: 'useItem', objectId: BROOM_OBJECT, targetId: NULL_ID, part: PARTS_RIDE, flightSpeed: BROOM_FLOAT });
  // 2-3. the server's DOEQUIP fEquip 0: Webby falls and stands (Review Focus 4)
  await expectLanding(page, gateway, script);
  expect(await errorsOf(page)).toEqual([]);
});

test('land: after a climb, the server\'s DOEQUIP fEquip 0 part 13 takes the broom off; Webby falls and stands on the ground', async ({ page }) => {
  test.skip(isTouch(), "the climb is the PC's keys");
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await takeOff(page, gateway, script);
  await climb(page, 6);
  await expectLanding(page, gateway, script);
  expect(await errorsOf(page)).toEqual([]);
});

test('land from a hover: DOEQUIP fEquip 0 part 13 with Webby still in the air 8 m up; it falls and stands', async ({ page }) => {
  // a flier set down with no vertical speed falls: the flight step keeps m_bGround as ProcessAction does (ActionMover.cpp:276-285)
  const script = scriptFor();
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await takeOff(page, gateway, script);
  await lift(page, gateway, script, 8);
  await expectLanding(page, gateway, script);
  expect(await errorsOf(page)).toEqual([]);
});

test('another player flying: its ADD_OBJ with FLY on a Hover Board, then MOVERMOVED2, moves it in the air', async ({ page }) => {
  const at: Vec3 = [SQUARE[0] + 3, groundAt(SQUARE[0] + 3, SQUARE[2] - 4) + 10, SQUARE[2] - 4];
  const flier: AddedMover = {
    ...BASE, index: MI_MALE, pos: at, angle: 0, objectId: FLIER_ID, isPlayer: true, stateFlag: FLY,
    player: {
      ...SELF_PLAYER, self: false, name: 'Flier', playerId: 601, level: 30, equipmentObjectIds: [],
      worn: [...MALE_VAGRANT.map((itemId, i) => ({ part: [2, 4, 5][i]!, itemId, flag: 0 })), { part: PARTS_RIDE, itemId: HOVER_BOARD, flag: 0 }],
      fuel: 1200,
    },
  };
  const script = scriptFor(null, [writeAddPlayer(FLIER_ID, flier)]);
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  await expect.poll(async () => (await moverOf(page, FLIER_ID))?.rideItemId, ON_FRAMES).toBe(HOVER_BOARD);
  expect(await flagOf(page, FLIER_ID, FLY)).toBe(FLY);
  await page.waitForTimeout(1000);
  expect((await moverOf(page, FLIER_ID))!.pos[1]).toBeCloseTo(at[1], 3); // on its board in the air, not falling
  // its MOVERMOVED2: under thrust, 6 m on south (where its client predicts it 37 steps ahead)
  const move: FlightReport = {
    pos: [at[0], at[1], at[2] - 6], delta: [0, 0, 0], angle: 0, angleX: 0, accPower: 0, turnAngle: 0, state: OBJSTA_FMOVE,
    stateFlag: FLY | ACC, motion: BOARD_FRUNNING, motionEx: 0, loop: ANILOOP_LOOP, motionOption: MOP_FIXED, tick: SERVER_TICK,
  };
  gateway.pushCache(script.later([writeMoverMoved2(FLIER_ID, move, 37)]));
  await expect.poll(async () => (await moverOf(page, FLIER_ID))!.pos[2], ON_FRAMES).toBeLessThan(at[2] - 1);
  const moved = (await moverOf(page, FLIER_ID))!;
  expect(moved.pos[1]).toBeGreaterThan(groundAt(moved.pos[0], moved.pos[2]) + 5); // in the air
  expect(moved.stateFlag & FLY).toBe(FLY);
  expect(moved.rideItemId).toBe(HOVER_BOARD);
  expect(await errorsOf(page)).toEqual([]);
});

test('entering on a ride: an own ADD_OBJ with FLY and the broom worn enters in the air and sends PLAYERBEHAVIOR2 once', async ({ page }) => {
  // the own ADD_OBJ lists no worn parts: the own ride is the inventory item in the equipment's PARTS_RIDE slot
  const high: Vec3 = [SQUARE[0], SQUARE[1] + 12, SQUARE[2]];
  const script = scriptFor({ pos: high });
  const gateway = await playGateway(page, script, LISTED);
  await enterFlaris(page);
  const entered = await own(page);
  expect(entered.stateFlag & FLY).toBe(FLY);
  expect(entered.rideItemId).toBe(MAGIC_BROOM);
  await page.waitForTimeout(2000);
  const later = await own(page);
  expect(later.stateFlag & FLY).toBe(FLY);
  expect(later.pos[1]).toBeCloseTo(high[1], 1); // in the air, not falling, not frozen on the ground
  // the own flier tells the server once that it is there (Review Focus 2)
  await expect.poll(() => behavior2(gateway).length, ON_FRAMES).toBe(1);
  await page.waitForTimeout(1000);
  expect(behavior2(gateway)).toHaveLength(1);
  expect(behavior2(gateway)[0]!.move.stateFlag & FLY).toBe(FLY);
  expect(await errorsOf(page)).toEqual([]);
});

test.describe('the phone', () => {
  // Review Focus 5: an iPhone's Safari held on its side
  test.use({ viewport: { width: 750, height: 342 } });

  test('Accelerate held while the stick turns, Turbo waits for the turbo fuel; no flight button covers the stick or Attack', async ({ page }) => {
    test.skip(!isTouch(), "the flight buttons are a touch screen's");
    const script = scriptFor();
    const gateway = await playGateway(page, script, LISTED);
    await enterFlaris(page);
    await takeOff(page, gateway, script);
    const accelerate = page.locator('[data-flight="accelerate"]');
    const turbo = page.locator('[data-flight="turbo"]');
    const land = page.locator('[data-flight="land"]');
    await expect(page.locator('.hud-flight')).toBeVisible(ON_FRAMES);
    for (const button of [accelerate, turbo, land]) await expect(button).toBeVisible();
    await expect(page.locator('.hud-jump')).toBeHidden(); // Accelerate takes the Jump's place

    // 4. the joystick held where a thumb holds it, and the Attack button: no flight button's box on either, each on screen
    const session = await page.context().newCDPSession(page);
    const view = page.viewportSize()!;
    const thumb = { id: 1, x: 120, y: view.height * 0.65 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
    const steer = { ...thumb, x: thumb.x + 60 }; // sideways: a right turn
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steer] });
    await expect(page.locator('.joystick')).toBeVisible();
    const boxes = {
      joystick: (await page.locator('.joystick').boundingBox())!, attack: (await page.locator('.hud-attack').boundingBox())!,
    };
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const [name, button] of [['accelerate', accelerate], ['turbo', turbo], ['land', land]] as const) {
      const box = (await button.boundingBox())!;
      expect(overlaps(box, boxes.joystick), `${name} over the joystick: ${JSON.stringify([box, boxes.joystick])}`).toBe(false);
      expect(overlaps(box, boxes.attack), `${name} over Attack: ${JSON.stringify([box, boxes.attack])}`).toBe(false);
      expect([box.x >= 0, box.y >= 0, box.x + box.width <= view.width, box.y + box.height <= view.height], `${name} on screen`)
        .toEqual([true, true, true, true]);
      // the phone's text is 14 px at least (the plan's constraint)
      const size = await button.evaluate((el) => parseFloat(getComputedStyle(el, '::after').fontSize));
      expect(size, `${name}'s label`).toBeGreaterThanOrEqual(14);
    }

    // 1. Accelerate held with a second finger while the stick turns: ACC_START (PLAYERMOVED2 with ACC), and the turn
    const startAngle = (await own(page)).angle;
    const accelBox = (await accelerate.boundingBox())!;
    const finger = { id: 2, x: accelBox.x + accelBox.width / 2, y: accelBox.y + accelBox.height / 2 };
    const sentBefore = moved2(gateway).length;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, finger] });
    await expect.poll(() => moved2(gateway).slice(sentBefore).some((p) => (p.move.stateFlag & ACC) !== 0), ON_FRAMES).toBe(true);
    await expect.poll(async () => (await own(page)).stateFlag & ACC, ON_FRAMES).toBe(ACC);
    await expect.poll(async () => Math.abs(turned(startAngle, (await own(page)).angle)), ON_FRAMES).toBeGreaterThan(5);
    // ... and its let-go stops it (ACC_STOP), the stick still held
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [finger] });
    await expect.poll(async () => (await own(page)).stateFlag & ACC, ON_FRAMES).toBe(0);
    await expect.poll(() => moved2(gateway).at(-1)!.move.stateFlag & ACC, ON_FRAMES).toBe(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 2. Turbo: disabled without turbo fuel, enabled by SETFUEL's accFuel
    await expect(turbo).toBeDisabled();
    gateway.pushCache(script.later([writeSetFuel(SELF_ID, 1200, 12_000)]));
    await expect(turbo).toBeEnabled(ON_FRAMES);
    // with the thrust on, Turbo turns the turbo on (PLAYERMOVED2 with TURBO)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    await expect.poll(async () => (await own(page)).stateFlag & ACC, ON_FRAMES).toBe(ACC);
    const turboBox = (await turbo.boundingBox())!;
    const turboFinger = { id: 3, x: turboBox.x + turboBox.width / 2, y: turboBox.y + turboBox.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger, turboFinger] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [turboFinger] });
    await expect.poll(() => moved2(gateway).some((p) => (p.move.stateFlag & TURBO) !== 0), ON_FRAMES).toBe(true);
    // the Turbo finger's let-go is not Accelerate's: the thrust goes on (Review Focus 5)
    await page.waitForTimeout(300);
    expect((await own(page)).stateFlag & ACC).toBe(ACC);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await expect.poll(async () => (await own(page)).stateFlag & ACC, ON_FRAMES).toBe(0);

    // landed by the server (DOEQUIP fEquip 0): the flight buttons go, Jump comes back (Land itself: the next test)
    gateway.pushCache(script.later([writeDoEquip(SELF_ID, BROOM_OBJECT, MAGIC_BROOM, false, PARTS_RIDE)]));
    await expect.poll(() => flagOf(page, SELF_ID, FLY), ON_FRAMES).toBe(0);
    await expect(page.locator('.hud-flight')).toBeHidden(ON_FRAMES);
    await expect(page.locator('.hud-jump')).toBeVisible();
    expect(await errorsOf(page)).toEqual([]);
  });

  test('Land lands: the worn broom used (DOUSEITEM with part 13), then the server\'s DOEQUIP', async ({ page }) => {
    test.skip(!isTouch(), "the flight buttons are a touch screen's");
    const script = scriptFor();
    const gateway = await playGateway(page, script, LISTED);
    await enterFlaris(page);
    await takeOff(page, gateway, script);
    const land = page.locator('[data-flight="land"]');
    await expect(land).toBeEnabled(ON_FRAMES);
    const usesBefore = uses(gateway).length;
    await land.tap();
    await expect.poll(() => uses(gateway).length).toBe(usesBefore + 1);
    expect(uses(gateway).at(-1)).toEqual({ type: 'useItem', objectId: BROOM_OBJECT, targetId: NULL_ID, part: PARTS_RIDE, flightSpeed: BROOM_FLOAT });
    gateway.pushCache(script.later([writeDoEquip(SELF_ID, BROOM_OBJECT, MAGIC_BROOM, false, PARTS_RIDE)]));
    await expect.poll(() => flagOf(page, SELF_ID, FLY), ON_FRAMES).toBe(0);
    await expect(page.locator('.hud-flight')).toBeHidden(ON_FRAMES);
    await expect(page.locator('.hud-jump')).toBeVisible();
    expect(await errorsOf(page)).toEqual([]);
  });
});
