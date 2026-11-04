import { describe, expect, it } from 'vitest';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { NULL_ID } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { APPROACH_REPORT_STEPS, AttackLoop, attackAble, chargeLevel, objRadius, setOwnDestObj } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import type { OwnState } from '../src/world/OwnState';
import { terrainGround } from '../src/world/sim/collision';
import type { CollisionObject, Ground } from '../src/world/sim/collision';
import { ActMsg, Belli, Ik3, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';
import type { Mover } from '../src/world/WorldState';
import { MI_FEMALE, MI_MALE, addedNpc, addedPlayer, webMoverOf } from './helpers/movers';
import { OWN_ID, WOODEN_SWORD, itemProp, newVagrant, ownAdded, ownGameData } from './helpers/ownState';
import { TRAFFIC_BUDGET, busiestSecond } from './helpers/traffic';

const f32 = Math.fround;

/** `MI_AIBATT1` and its row: a monster that can be killed (`bKillable` 1). */
const AIBATT = 20;
const MONSTER_ID = 30;
const OTHER_MONSTER_ID = 31;
/** Piece 7 M5: a flying monster (`dwFlying` 1) and its object ID. */
const MOTHBEE = 22;
const FLIER_ID = 33;
const NPC_ID = 40;
const PLAYER_ID = 50;
/** How many steps the fake model plays each motion for before `IsEndFrame` (a swing included). */
const MOTION_STEPS = 12;

type Sent =
  | ['destObj', number, number]
  | ['melee', number, number, number]
  | ['melee2', number, number]
  | ['getDestObj', number, number]
  | ['behavior', MoveReport]
  | ['magic', number, number, number]
  | ['range', number, number, number];

const OWN_AT: Vec3 = [100, 0, 100];
/** 6 m east of the own mover, which faces east (angle 90: D3D +x). */
const MONSTER_AT: Vec3 = [106, 0, 100];

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The plane x = `x` from height 0 to 10 and z 90 to 110, facing -x. */
function wallAt(x: number): CollisionObject {
  const a: Vec3 = [x, 0, 110];
  const b: Vec3 = [x, 10, 110];
  const c: Vec3 = [x, 0, 90];
  const d: Vec3 = [x, 10, 90];
  return { triangles: new Float32Array([a, b, c, b, d, c].flat()), matrix: IDENTITY };
}

interface RigOptions {
  motionReady?: () => boolean;
  /** Piece 7 M3: the item cast's guard (`ItemCast.interrupt`). */
  interruptCast?: () => boolean;
  level?: number;
  /** The own state the loop reads; `newVagrant( level )` unless given. */
  own?: OwnState | undefined;
  /** The monster's belligerence and `bKillable`. */
  belligerence?: number;
  killable?: number;
  /** Whether the own mover comes into view (and so is stepped) first, as the first ADD_OBJ of the JOIN; by default it is. */
  ownFirst?: boolean;
  /** The land and objects; flat land with nothing on it by default. */
  ground?: Ground;
  /** Piece 7 M5: a flying monster (Mothbee, dwFlying 1) at this place too. */
  flierAt?: Vec3;
}

/**
 * The own character (a Vagrant of `level`, with the Wooden Sword) 6 m west of an Aibatt and of a second one 6 m north,
 * with a peaceful NPC and another player beside them, in a `WorldState` on `ground`; the loop over a fake session that
 * records what it sends; and a rules step as the world screen takes one: the loop's step (which says whether the
 * controls run: `controls`), then the world's, then each model's frame move. The models are fakes that end each motion
 * after `MOTION_STEPS` steps; each mover's radius is 0.5.
 */
function rig(options: RigOptions = {}) {
  const level = options.level ?? 1;
  const data = ownGameData({
    movers: new Map([
      [MI_MALE, webMoverOf({ index: MI_MALE, name: 'Male', speed: 0.1, ai: 1, killable: 1 })],
      [MI_FEMALE, webMoverOf({ index: MI_FEMALE, name: 'Female', speed: 0.1, ai: 1, killable: 1 })],
      [AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', killable: options.killable ?? 1, belligerence: Belli.ACTIVEATTACK })],
      [MOTHBEE, webMoverOf({ index: MOTHBEE, name: 'Mothbee', killable: 1, belligerence: Belli.ACTIVEATTACK, flying: true })],
    ]),
  });
  const world = new WorldState(data, new ServerClock(() => 0), options.ground ?? terrainGround(() => 0));
  const add = (added: Parameters<WorldState['apply']>[1] & { type: 'addMover' }): void => {
    world.apply(added.mover.objectId, added);
  };
  const addOwn = (): void => add({ type: 'addMover', mover: { ...ownAdded(level), pos: OWN_AT, angle: 90, state: ObjSta.STAND } });
  if (options.ownFirst !== false) addOwn();
  add({
    type: 'addMover',
    mover: addedNpc(MONSTER_ID, AIBATT, {}, {
      pos: MONSTER_AT, angle: 270, state: ObjSta.STAND, belligerence: options.belligerence ?? Belli.ACTIVEATTACK,
    }),
  });
  add({
    type: 'addMover',
    mover: addedNpc(OTHER_MONSTER_ID, AIBATT, {}, { pos: [100, 0, 94], state: ObjSta.STAND, belligerence: Belli.ACTIVEATTACK }),
  });
  add({
    type: 'addMover',
    mover: addedNpc(NPC_ID, MI_FEMALE, { characterKey: 'MaFl_Juria' }, { pos: [103, 0, 103], belligerence: Belli.PEACEFUL }),
  });
  add({ type: 'addMover', mover: addedPlayer(PLAYER_ID, {}, { pos: [103, 0, 97] }) });
  if (options.flierAt !== undefined) {
    add({ type: 'addMover', mover: addedNpc(FLIER_ID, MOTHBEE, {}, { pos: options.flierAt, state: ObjSta.STAND, belligerence: Belli.ACTIVEATTACK }) });
  }
  if (options.ownFirst === false) addOwn();
  world.takeChanges();
  const own = world.self()!;
  const monster = world.movers.get(MONSTER_ID)!;
  for (const m of world.movers.values()) m.radius = 0.5;

  // the models: each plays its motion for MOTION_STEPS steps, from the step the rules set it on; one set since the last
  // frame move has not ended (as `MoverViews.isEndFrame` says, `SetMotion` clearing the flag)
  const frames = new Map<Mover, { sets: number; frame: number }>();
  for (const m of world.movers.values()) {
    frames.set(m, { sets: m.act.motionSets, frame: 0 });
    m.act.isEndFrame = () => {
      const f = frames.get(m)!;
      return f.sets === m.act.motionSets && f.frame >= MOTION_STEPS;
    };
  }
  const frameMove = (): void => {
    for (const [m, f] of frames) {
      if (f.sets !== m.act.motionSets) {
        f.sets = m.act.motionSets;
        f.frame = 0;
      }
      f.frame++;
    }
  };

  const sent: Sent[] = [];
  const targets: Array<[number, number]> = [];
  const session = {
    sendDestObj: (targetId: number, range: number) => void sent.push(['destObj', targetId, range]),
    sendMeleeAttack: (message: number, targetId: number, speed: number) => void sent.push(['melee', message, targetId, speed]),
    sendGetDestObj: (fromId: number, destId: number) => void sent.push(['getDestObj', fromId, destId]),
    sendBehavior: (m: MoveReport) => void sent.push(['behavior', m]),
    sendSetTarget: (targetId: number, clear: 1 | 2) => void targets.push([targetId, clear]),
    // Piece 7 M2: the wand's and the bow's shots
    sendMagicAttack: (targetId: number, power: number, id: number) => void sent.push(['magic', targetId, power, id]),
    sendRangeAttack: (targetId: number, power: number, id: number) => void sent.push(['range', targetId, power, id]),
    // Piece 7 M5: the swing in the air
    sendMeleeAttack2: (message: number, targetId: number) => void sent.push(['melee2', message, targetId]),
  };
  const focus = new Focus(session);
  const state = 'own' in options ? options.own : newVagrant(level);
  let tick = 1000n;
  const loop = new AttackLoop(
    session, focus, world, () => state, { tick: () => (tick += 10n) }, data.movers, undefined, options.motionReady, options.interruptCast,
  );
  const texts: string[] = [];
  loop.onText = (id) => void texts.push(id);
  if (options.ground !== undefined) loop.ground = () => options.ground;

  let now = 10_000;
  /** Whether the last step ran the controls (`AttackLoop.step`'s answer). */
  let controls = true;
  const step = (): void => {
    controls = loop.step(false, now);
    world.step();
    frameMove();
    now += 1000 / 60;
  };
  const steps = (n: number): void => {
    for (let i = 0; i < n; i++) step();
  };
  /** Steps until `done` holds, at most `limit` steps; fails if it never does. */
  const until = (done: () => boolean, limit = 600): void => {
    for (let i = 0; i < limit; i++) {
      if (done()) return;
      step();
    }
    throw new Error(`still not done after ${limit} steps`);
  };
  /** A tap on `objectId`: pressed and let go before the next step. */
  const tap = (objectId: number, double = false): void => {
    loop.onMoverPressed(objectId, now, double);
    loop.onReleased(now);
  };
  const melee = (): Array<[number, number, number]> =>
    sent.filter((s) => s[0] === 'melee').map((s) => [s[1], s[2], s[3]] as [number, number, number]);
  const kinds = (): string[] => sent.filter((s) => s[0] === 'destObj' || s[0] === 'melee').map((s) =>
    s[0] === 'destObj' ? `destObj ${s[1]}` : `ATK${(s[1] as number) - ActMsg.ATK1 + 1} ${s[2]}`);
  return {
    world, own, monster, loop, focus, sent, targets, step, steps, until, tap, melee, kinds, now: () => now,
    controls: () => controls, texts,
  };
}


const SWORD_SPEED = f32(0.085);

describe('AttackLoop: a tap selects, a second one attacks (WndWorld.cpp:6844-6929, 8513-8531)', () => {
  it.each(['button', 'target'])('switches walking to running once when attacking through %s', (source) => {
    const r = rig();
    r.own.act.sendActMsg(ActMsg.MODE_WALK);
    r.tap(MONSTER_ID);
    r.step();
    expect(r.own.act.stateFlag & ObjStaF.WALK).not.toBe(0); // selection alone keeps the gait
    if (source === 'button') r.loop.attackButton();
    else r.tap(MONSTER_ID);
    r.step();
    expect(r.own.act.stateFlag & ObjStaF.WALK).toBe(0);
    expect(r.sent.filter((s) => s[0] === 'behavior')).toHaveLength(1);
    r.steps(5);
    expect(r.sent.filter((s) => s[0] === 'behavior')).toHaveLength(1);
  });
  it('one tap only selects; the second walks up with one PLAYERSETDESTOBJ and swings ATK1 on arrival with MELEE_ATTACK', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.targets).toEqual([[MONSTER_ID, 2]]);
    expect(r.loop.autoAttack).toBe(false);
    r.steps(60);
    expect(r.sent).toEqual([]);
    expect(r.own.act.body.pos).toEqual(OWN_AT);

    r.tap(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    r.step();
    // SetDestObj( target, 0 ): PLAYERSETDESTOBJ, m_nCorr -1, and the rules follow the target
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    expect(r.own.dest?.targetId).toBe(MONSTER_ID);
    expect(r.own.nCorr).toBe(-1);
    r.until(() => r.melee().length > 0);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0], ['melee', ActMsg.ATK1, MONSTER_ID, SWORD_SPEED]]);
    expect(SWORD_SPEED).toBe(WOODEN_SWORD.attackSpeed);
    // it ran up to the monster: in range (0.8 * 0.5 + 0.8 * 0.5 + 1), facing it, swinging, and no longer following
    const [x, , z] = r.own.act.body.pos;
    expect(Math.hypot(MONSTER_AT[0] - x, MONSTER_AT[2] - z)).toBeLessThan(1.8);
    expect(x).toBeGreaterThan(OWN_AT[0] + 3);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect(r.own.dest).toBeNull();
  });

  it('a double click attacks: its second press is OnLButtonDblClk, on the mover just selected', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID, true);
    expect(r.loop.autoAttack).toBe(true);
    r.until(() => r.melee().length > 0);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('the swing plays at the attack speed (GetAttackSpeed: Wooden Sword, level 1, DEX 15)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length > 0);
    r.step();
    expect(r.own.act.aniSpeed).toBe(f32(0.8432520031929016));
  });
});

describe('AttackLoop: the combo (_ProcessStateAttack, ActionMoverState.cpp:804-841)', () => {
  /** The first `n` approaches and swings of an auto-attack at `level`. */
  function fight(level: number, n: number): string[] {
    const r = rig({ level });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.kinds().length >= n);
    return r.kinds().slice(0, n);
  }
  const d = `destObj ${MONSTER_ID}`;
  const atk = (n: number): string => `ATK${n} ${MONSTER_ID}`;

  it('at level 1 each swing is ATK1, and the next one starts again with PLAYERSETDESTOBJ', () => {
    expect(fight(1, 6)).toEqual([d, atk(1), d, atk(1), d, atk(1)]);
  });

  it('at level 2 the end of ATK1 sends ATK2 with no PLAYERSETDESTOBJ, then the chain starts again', () => {
    expect(fight(2, 7)).toEqual([d, atk(1), atk(2), d, atk(1), atk(2), d]);
  });

  it('at level 8 it goes on to ATK3', () => {
    expect(fight(8, 5)).toEqual([d, atk(1), atk(2), atk(3), d]);
  });

  it('at level 12 the chain reaches ATK4, then ATK1 again after a new PLAYERSETDESTOBJ', () => {
    expect(fight(12, 11)).toEqual([d, atk(1), atk(2), atk(3), atk(4), d, atk(1), atk(2), atk(3), atk(4), d]);
  });

  it('each MELEE_ATTACK goes out as its swing starts, one per swing, with the sword\'s fAttackSpeed', () => {
    const r = rig({ level: 12 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length === 1);
    for (let swing = 2; swing <= 4; swing++) {
      // the swing before plays to its end, MOTION_STEPS steps, and only then is the next one sent
      r.steps(MOTION_STEPS - 1);
      expect(r.melee()).toHaveLength(swing - 1);
      r.step();
      expect(r.melee()).toHaveLength(swing);
      expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1 * swing);
    }
    expect(r.melee().map(([, , speed]) => speed)).toEqual([SWORD_SPEED, SWORD_SPEED, SWORD_SPEED, SWORD_SPEED]);
  });
});

describe('AttackLoop: holding the button on a new target (m_timerFocusAttack, WndWorld.cpp:571, 7090-7096)', () => {
  it('holding 500 ms on a newly selected target attacks; 499 ms does not', () => {
    const r = rig();
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    expect(r.focus.targetId).toBe(MONSTER_ID);
    r.loop.onMoverHeld(MONSTER_ID, 499);
    r.steps(5);
    expect(r.sent).toEqual([]);
    r.loop.onMoverHeld(MONSTER_ID, 500);
    r.step();
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    // it attacks while held, without auto-attack
    expect(r.loop.autoAttack).toBe(false);
    r.until(() => r.melee().length > 0);
  });

  it('selectsTarget is m_bSelectTarget: on from a press on a mover till it is let go (WndWorld.cpp:7090-7128, 6512)', () => {
    const r = rig();
    expect(r.loop.selectsTarget).toBe(false);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    expect(r.loop.selectsTarget).toBe(true);
    r.step();
    expect(r.loop.selectsTarget).toBe(true);
    r.loop.onReleased();
    expect(r.loop.selectsTarget).toBe(false);
  });

  it('a hold attacks while it is held: let go, the swing under way is the last', () => {
    const r = rig({ level: 2 });
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onMoverHeld(MONSTER_ID, 600);
    r.until(() => r.melee().length === 2); // ATK1, then ATK2 at its end while the button is down (CTRLMSG_LDOWN)
    r.loop.onReleased();
    r.steps(120);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`, `ATK2 ${MONSTER_ID}`]);
  });

  it('a press let go before 500 ms only selects', () => {
    const r = rig();
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onMoverHeld(MONSTER_ID, 300);
    r.step();
    r.loop.onReleased();
    r.steps(60);
    expect(r.sent).toEqual([]);
  });

  it("each step decides Process's branch once: the controls, the attack, or neither (WndWorld.cpp:8513-8537)", () => {
    const r = rig();
    r.step();
    expect(r.controls()).toBe(true);
    // a press on a mover held before its time is out: neither branch, no controls and no attack
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onMoverHeld(MONSTER_ID, 100);
    r.step();
    expect(r.controls()).toBe(false);
    expect(r.sent).toEqual([]);
    // past it: the attack branch
    r.loop.onMoverHeld(MONSTER_ID, 500);
    r.step();
    expect(r.controls()).toBe(false);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    r.loop.onReleased();
    r.step();
    expect(r.controls()).toBe(true);
    // auto-attacking a focus: the attack; stopped, the controls
    r.tap(MONSTER_ID);
    r.step();
    expect(r.controls()).toBe(false);
    r.loop.stop('move');
    r.step();
    expect(r.controls()).toBe(true);
  });

  it('a double click\'s second press held on another mover runs neither branch, its m_bSelectTarget being off', () => {
    const r = rig();
    // OnLButtonDblClk sets m_bLButtonDown but not m_bSelectTarget: with nothing focused, the timer long out, still neither
    r.loop.onMoverPressed(OTHER_MONSTER_ID, r.now(), true);
    r.loop.onMoverHeld(OTHER_MONSTER_ID, 600);
    r.step();
    expect(r.controls()).toBe(false);
    expect(r.sent).toEqual([]);
    expect(r.focus.targetId).toBeNull();
  });

  it('a collision ends the hold: OnActCollision lets go of the button (MoverActEvent.cpp:2022-2028)', () => {
    // a wall 3 m east, between the player and the Aibatt
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onMoverHeld(MONSTER_ID, 600);
    r.until(() => r.own.corrReport != null);
    // the walk the press started met the wall: ClearDest, STAND, the PLAYERCORR, and the button let go
    expect(r.own.dest).toBeNull();
    expect(r.own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    expect(r.own.act.body.pos[0]).toBeLessThan(103);
    // still held on the screen, the hold attacks no more: no new approach, and the controls run
    r.loop.onMoverHeld(MONSTER_ID, 2000);
    r.steps(120);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`]);
    expect(r.controls()).toBe(true);
  });

  it('a collision does not stop the auto-attack: it walks up again (UseFocusObj, PLAYERSETDESTOBJ anew)', () => {
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.own.corrReport != null);
    r.own.corrReport = null; // the world screen sends it (OwnMover.corrected)
    r.step();
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `destObj ${MONSTER_ID}`]);
    expect(r.loop.autoAttack).toBe(true);
  });

  it('auto-attack into a wall keeps walking up at most 10 times a second, within the traffic budget', () => {
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    const at: number[] = [];
    const destObjAt: number[] = [];
    for (let s = 0; s < 300; s++) {
      const before = r.sent.length;
      stepCounting(r, at, s);
      for (const sent of r.sent.slice(before)) if (sent[0] === 'destObj') destObjAt.push(s);
    }
    expect(busiestSecond(at)).toBeLessThanOrEqual(TRAFFIC_BUDGET); // 120 before the gate
    const lastFourSeconds = destObjAt.filter((s) => s >= 60).length;
    expect(lastFourSeconds).toBeGreaterThanOrEqual(36);
    expect(lastFourSeconds).toBeLessThanOrEqual(40);
    expect(r.loop.autoAttack).toBe(true);
    expect(r.own.act.body.pos[0]).toBeLessThan(103);
  });

  it('a walk to another object goes out at once; the blocked one waits and does not walk locally', () => {
    // the own mover has just bumped into the wall on its walk to the Aibatt
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.own.corrReport != null);
    expect(r.own.blockedTarget).toBe(MONSTER_ID);
    const sent: Array<[number, number]> = [];
    const session = { sendDestObj: (id: number, range: number) => void sent.push([id, range]), sendBehavior: () => {} };
    const find = (id: number): Mover | undefined => r.world.movers.get(id);
    r.own.approachWait = 3;
    r.own.blockedSlid = false; // stopped dead at the wall
    setOwnDestObj(session, () => 0n, find, r.own, MONSTER_ID, 0);
    expect(sent).toEqual([]);
    expect(r.own.dest).toBeNull();
    setOwnDestObj(session, () => 0n, find, r.own, OTHER_MONSTER_ID, 0);
    expect(sent).toEqual([[OTHER_MONSTER_ID, 0]]);
    expect(r.own.approachWait).toBe(APPROACH_REPORT_STEPS);
  });

  it('a walk that was still sliding goes on locally while it waits, then tells the server where it got to', () => {
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.own.corrReport != null);
    const sent: string[] = [];
    const session = {
      sendDestObj: (id: number) => void sent.push(`destObj ${id}`), sendBehavior: () => void sent.push('behavior'),
    };
    const find = (id: number): Mover | undefined => r.world.movers.get(id);
    r.own.approachWait = 3;
    r.own.blockedSlid = true;
    setOwnDestObj(session, () => 0n, find, r.own, MONSTER_ID, 0);
    // walking again, untold, and no collision ends it meanwhile (m_nCorr 0)
    expect(sent).toEqual([]);
    expect(r.own.dest?.targetId).toBe(MONSTER_ID);
    expect(r.own.nCorr).toBe(0);
    r.own.approachWait = 0;
    setOwnDestObj(session, () => 0n, find, r.own, MONSTER_ID, 0);
    // where the slide got to first, which keeps the server's walk (OnPlayerBehavior), then the walk
    expect(sent).toEqual(['behavior', `destObj ${MONSTER_ID}`]);
    expect(r.own.nCorr).toBe(-1);
    expect(r.own.approachWait).toBe(APPROACH_REPORT_STEPS);
    setOwnDestObj(session, () => 0n, find, r.own, MONSTER_ID, 0);
    expect(sent).toHaveLength(2);
  });

  it('auto-attack sliding along a wall reaches its target at about full speed, within the traffic budget', () => {
    // the Aibatt past the wall's end (z 90 to 110): the walk slides along the wall until it clears it
    const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.monster.act.body.pos[0] = 106;
    r.monster.act.body.pos[2] = 112;
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    const at: number[] = [];
    let s = 0;
    for (; s < 1200 && r.melee().length === 0; s++) stepCounting(r, at, s);
    // Neuz's own pace here (a walk-up at every step) arrives at about 344 steps; one every 6 steps took about 1,650
    expect(s).toBeLessThanOrEqual(400);
    expect(busiestSecond(at)).toBeLessThanOrEqual(TRAFFIC_BUDGET);
  });

  it('a walk that arrives untold tells the server where the player is before the swing', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.step();
    // as after a slide (setOwnDestObj): walking on untold, its wait not over by the arrival
    r.own.untoldWalk = true;
    r.own.blockedTarget = MONSTER_ID;
    r.own.approachWait = 600;
    r.until(() => r.melee().length > 0);
    const kinds = r.sent.map((x) => x[0]);
    expect(kinds.slice(-2)).toEqual(['behavior', 'melee']);
    expect(r.own.untoldWalk).toBe(false);
  });
});

/**
 * One rules step of `r`, pushing `step` into `stepsOfPackets` once for each packet it sent, the PLAYERCORR the step owes
 * included, which the world screen sends and clears (`OwnMover.corrected`).
 */
function stepCounting(r: ReturnType<typeof rig>, stepsOfPackets: number[], step: number): void {
  const before = r.sent.length;
  r.step();
  for (let i = before; i < r.sent.length; i++) stepsOfPackets.push(step);
  if (r.own.corrReport) {
    stepsOfPackets.push(step);
    r.own.corrReport = null;
  }
}

describe('AttackLoop: the arrival is the rules\' (ProcessMoveArrival, MoverMove.cpp:73-262)', () => {
  it('the arrival swings even when another mover is stepped before the own mover', () => {
    // the own mover last in view, so stepped last, standing still (no speed); the Aibatt walks up to it, and comes in
    // range in its own step, before the own mover's ProcessMove
    const r = rig({ ownFirst: false });
    r.own.act.body.speed = 0;
    r.world.apply(MONSTER_ID, { type: 'setDestObj', targetId: OWN_ID, range: 0 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length > 0);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect(r.own.act.body.pos).toEqual(OWN_AT);
  });

  it('with no command the arrival is the default: the walk ends, nothing is swung', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.step();
    r.loop.stop('move'); // ClearCmd: the walk goes on (FORWARD answers 0 on the way), the command does not
    r.until(() => r.own.dest === null);
    r.steps(5);
    expect(r.melee()).toEqual([]);
    expect(r.own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });
});

describe('AttackLoop: what stops it ([combat §2.6])', () => {
  it('a movement key stops it: no swing on arrival and no new approach', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.steps(10);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    r.loop.stop('move'); // m_bAutoAttack = FALSE, ClearCmd (WndWorldControlPlayer.cpp:383-403)
    expect(r.loop.autoAttack).toBe(false);
    r.steps(300);
    expect(r.melee()).toEqual([]);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    expect(r.focus.targetId).toBe(MONSTER_ID); // the focus stays
  });

  it('a movement key in the middle of the combo lets the swing end and starts no next one', () => {
    const r = rig({ level: 12 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length === 1);
    r.loop.stop('move');
    r.steps(120);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('a press on the ground stops it as it goes down and drops the next target (WndWorld.cpp:6854, 6919-6929)', () => {
    const r = rig();
    // pressed before any step: the loop sees the movers in view from the start (the render target)
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.tap(OTHER_MONSTER_ID); // queued behind the target while auto-attacking
    expect(r.focus.next).toBe(OTHER_MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    r.loop.onGroundPressed(false);
    expect(r.loop.autoAttack).toBe(false);
    expect(r.focus.next).toBeNull();
    expect(r.loop.renderTargetId).toBeNull();
    expect(r.focus.targetId).toBe(MONSTER_ID); // bare ground does not clear the focus
    r.steps(300);
    expect(r.melee()).toEqual([]);
  });

  it("a double click's second press on the ground stops nothing (OnLButtonDblClk, WndWorld.cpp:7239-7263)", () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.loop.onGroundPressed(true);
    expect(r.loop.autoAttack).toBe(true);
    r.until(() => r.melee().length > 0);
  });

  it('the player dying stops it (DPClient.cpp:2080)', () => {
    const r = rig({ level: 2 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length === 1);
    r.loop.stop('died');
    expect(r.loop.autoAttack).toBe(false);
    r.steps(120);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('a DEL_OBJ mid-approach stops the loop', () => {
    const r = rig({ level: 12 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.steps(10); // on the way
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    // the world screen's part of a DEL_OBJ (`WorldScreen.apply`): the loop is told first (`onRemoved`), while the mover
    // is still in view, so its focus is released as live as it is: the focus goes (CWorld::Process, World.cpp:892-893)
    // and the attack stops; then the world drops the mover
    r.loop.onRemoved(MONSTER_ID);
    r.world.apply(MONSTER_ID, { type: 'delObj' });
    expect(r.focus.targetId).toBeNull();
    expect(r.targets).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2]]);
    expect(() => r.steps(300)).not.toThrow();
    expect(r.melee()).toEqual([]);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    expect(r.loop.autoAttack).toBe(false);
  });

  it('a kill with a next target queued focuses it and stops the auto-attack (onMoverDeath, SetNextTarget)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.tap(OTHER_MONSTER_ID);
    // another mover going changes nothing
    r.loop.onRemoved(NPC_ID);
    expect(r.loop.autoAttack).toBe(true);
    // DPClient.cpp:1956-1970, WndWorld.cpp:6389-6419: the focus to the next target, marked, and the auto-attack off
    r.loop.onMoverDeath(MONSTER_ID, OWN_ID);
    expect(r.focus.targetId).toBe(OTHER_MONSTER_ID);
    expect(r.focus.next).toBeNull();
    expect(r.loop.autoAttack).toBe(false);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    expect(r.targets).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2], [OTHER_MONSTER_ID, 2]]);
  });

  it('a target that leaves view gets no packet even before the loop is told', () => {
    const r = rig({ level: 12 });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.melee().length === 1);
    // gone in the middle of ATK1: the combo finds no m_objidHit (IsValidObj) and sends nothing
    r.world.apply(MONSTER_ID, { type: 'delObj' });
    expect(() => r.steps(300)).not.toThrow();
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('a target dead when the attack is tried: the focus is cleared and nothing is sent (IsAttackAbleNPC, Mover.cpp:6580-6589)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.monster.act.sendActMsg(ActMsg.DIE, 0, 0);
    r.tap(MONSTER_ID);
    r.step();
    expect(r.sent).toEqual([]);
    expect(r.focus.targetId).toBeNull();
    expect(r.targets.at(-1)).toEqual([NULL_ID, 2]);
    expect(r.loop.autoAttack).toBe(false);
  });
});

describe('AttackLoop: MOVERDEATH (CDPClient::OnMoverDeath, DPClient.cpp:1936-2090)', () => {
  /** Auto-attacking the monster, with `next` pressed after it (queued as the next target). */
  function attacking(next: number | null) {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    if (next !== null) r.tap(next);
    return r;
  }

  it('the own kill focuses the queued next target, marked only when it is not peaceful (:1956-1971, SetNextTarget)', () => {
    const r = attacking(OTHER_MONSTER_ID);
    r.loop.onMoverDeath(MONSTER_ID, OWN_ID);
    expect(r.focus.targetId).toBe(OTHER_MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    expect(r.loop.autoAttack).toBe(false);
    // the dead target, not yet in its dead state, is live: it is released (World.cpp:310)
    expect(r.targets).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2], [OTHER_MONSTER_ID, 2]]);

    // a peaceful NPC queued: it becomes the focus, and SetObjFocus( NULL ) left no mark (WndWorld.cpp:6414-6415)
    const peaceful = attacking(NPC_ID);
    expect(peaceful.focus.next).toBe(NPC_ID);
    expect(peaceful.loop.renderTargetId).toBe(MONSTER_ID);
    peaceful.loop.onMoverDeath(MONSTER_ID, OWN_ID);
    expect(peaceful.focus.targetId).toBe(NPC_ID);
    expect(peaceful.loop.renderTargetId).toBeNull();
  });

  it('the own kill clears the focus whatever died (:1963)', () => {
    const r = rig();
    r.tap(OTHER_MONSTER_ID);
    r.loop.onMoverDeath(MONSTER_ID, OWN_ID);
    expect(r.focus.targetId).toBeNull();
    expect(r.targets).toEqual([[OTHER_MONSTER_ID, 2], [OTHER_MONSTER_ID, 1], [NULL_ID, 2]]);
  });

  it('the queued next target killed by another: dropped, and the mark goes back to the focus (:1984-1993)', () => {
    const r = attacking(OTHER_MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    r.loop.onMoverDeath(OTHER_MONSTER_ID, PLAYER_ID);
    expect(r.focus.next).toBeNull();
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    // a DEL_OBJ of the queued one only forgets it (World.cpp:899-902): the mark stays where it was
    const gone = attacking(OTHER_MONSTER_ID);
    gone.loop.onRemoved(OTHER_MONSTER_ID);
    expect(gone.focus.next).toBeNull();
    expect(gone.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
  });

  it('the target killed by another stays the focus until the attack finds it dead (IsAttackAbleNPC)', () => {
    const r = attacking(null);
    r.loop.onMoverDeath(MONSTER_ID, PLAYER_ID);
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    r.monster.act.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, PLAYER_ID);
    r.step();
    expect(r.focus.targetId).toBeNull();
    expect(r.loop.autoAttack).toBe(false);
    expect(r.melee()).toEqual([]);
  });

  it('the own death clears the focus and the next target, and stops the attack (:1949-1951, 2080)', () => {
    const r = attacking(OTHER_MONSTER_ID);
    r.loop.onMoverDeath(OWN_ID, MONSTER_ID);
    expect(r.focus.targetId).toBeNull();
    expect(r.focus.next).toBeNull();
    expect(r.loop.renderTargetId).toBeNull();
    expect(r.loop.autoAttack).toBe(false);
    expect(r.targets).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2]]);
  });
});

describe('AttackLoop: taps that repeat fast (Review Focus 2)', () => {
  it('waits for playable attack motions instead of flooding while the model is unavailable', () => {
    let ready = false;
    const r = rig({ motionReady: () => ready });
    r.own.act.isEndFrame = () => true; // no model or a missing clip used to end every swing immediately
    r.tap(MONSTER_ID);
    for (let i = 0; i < 120; i++) {
      r.loop.attackButton();
      r.step();
    }
    expect(r.sent).toEqual([]);
    ready = true;
    r.own.act.isEndFrame = () => false;
    r.until(() => r.melee().length > 0);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });
  it('pressing attack ten times sends one approach', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    for (let i = 0; i < 10; i++) r.loop.attackButton();
    r.step();
    for (let i = 0; i < 10; i++) {
      r.loop.attackButton();
      r.step();
    }
    r.until(() => r.melee().length > 0);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('tapping the target again and again on the way, or double-clicking it, sends one approach and one swing', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    for (let i = 0; i < 10; i++) {
      r.tap(MONSTER_ID, i % 2 === 1);
      r.step();
    }
    r.until(() => r.melee().length > 0);
    r.steps(MOTION_STEPS - 2);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID}`, `ATK1 ${MONSTER_ID}`]);
  });

  it('the attack button with nothing selected does nothing', () => {
    const r = rig();
    r.loop.attackButton();
    expect(r.loop.autoAttack).toBe(false);
    r.steps(30);
    expect(r.sent).toEqual([]);
  });
});

describe('AttackLoop: what is never attacked (IsAttackAble, IsAttackAbleNPC, Mover.cpp:6469-6626)', () => {
  const tryEverything = (r: ReturnType<typeof rig>, objectId: number): void => {
    r.tap(objectId);
    r.tap(objectId);
    r.steps(5);
    r.loop.attackButton();
    r.steps(5);
    r.loop.onMoverPressed(objectId, r.now(), false);
    r.loop.onMoverHeld(objectId, 1000);
    r.steps(60);
    r.loop.onReleased();
  };

  it('a peaceful NPC is never attacked', () => {
    const r = rig();
    tryEverything(r, NPC_ID);
    expect(r.focus.targetId).toBe(NPC_ID);
    expect(r.sent).toEqual([]);
    expect(r.loop.autoAttack).toBe(false);
    expect(r.loop.renderTargetId).toBeNull(); // only a player or a mover that is not peaceful is marked
  });

  it('nor a monster that is peaceful, one whose bKillable is 0, or another player', () => {
    const peaceful = rig({ belligerence: Belli.PEACEFUL });
    tryEverything(peaceful, MONSTER_ID);
    expect(peaceful.sent).toEqual([]);
    const unkillable = rig({ killable: 0 });
    tryEverything(unkillable, MONSTER_ID);
    expect(unkillable.sent).toEqual([]);
    const player = rig();
    tryEverything(player, PLAYER_ID);
    expect(player.sent).toEqual([]);
    expect(player.loop.renderTargetId).toBe(PLAYER_ID); // a player is marked, attackable or not
  });

  it('nothing attacks without the own numbers (OwnState), but a tap still selects', () => {
    const r = rig({ own: undefined });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.steps(60);
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.sent).toEqual([]);
  });
});

describe('AttackLoop: another target while auto-attacking (WndWorld.cpp:6912-6915)', () => {
  it('is queued as the next one and leaves the focus where it is', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.tap(OTHER_MONSTER_ID);
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.focus.next).toBe(OTHER_MONSTER_ID);
    expect(r.targets).toEqual([[MONSTER_ID, 2]]);
    expect(r.loop.autoAttack).toBe(true);
    r.until(() => r.melee().length > 0);
    expect(r.melee()[0]![1]).toBe(MONSTER_ID);
    // pressing the target again drops the queued one
    r.tap(MONSTER_ID);
    expect(r.focus.next).toBeNull();
  });
});

describe('AttackLoop: the attack button\'s target (canAttackFocus, IsAttackAble, Mover.cpp:6469-6626)', () => {
  it('is an attackable focus: none, a peaceful NPC or another player is not; a monster is', () => {
    const r = rig();
    expect(r.loop.canAttackFocus).toBe(false);
    r.tap(MONSTER_ID);
    expect(r.loop.canAttackFocus).toBe(true);
    r.tap(NPC_ID);
    expect(r.loop.canAttackFocus).toBe(false);
    r.tap(PLAYER_ID);
    expect(r.loop.canAttackFocus).toBe(false);
    const unkillable = rig({ killable: 0 });
    unkillable.tap(MONSTER_ID);
    expect(unkillable.loop.canAttackFocus).toBe(false);
  });

  it('is not while the player is dead, whose presses do nothing (WndWorld.cpp:6719-6720)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    expect(r.loop.canAttackFocus).toBe(true);
    r.own.act.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, MONSTER_ID);
    expect(r.loop.canAttackFocus).toBe(false);
  });

  it('asks without doing what IsAttackAble does: a dead focus is not attackable, and stays the focus until the loop runs', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    r.monster.hp = 0;
    expect(r.loop.canAttackFocus).toBe(false);
    // the question cleared nothing: the attack's own IsAttackAbleNPC does, at the next step
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    r.step();
    expect(r.focus.targetId).toBeNull();
    expect(r.loop.autoAttack).toBe(false);
  });
});

describe('AttackLoop: Escape (CWndMgr::Process, WndManager.cpp:3321-3368)', () => {
  it('with a next target queued, drops it and puts the mark back on the focus; the focus and the attack stay', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.tap(OTHER_MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    expect(r.loop.escape()).toBe(true);
    expect(r.focus.next).toBeNull();
    expect(r.focus.targetId).toBe(MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    expect(r.targets).toEqual([[MONSTER_ID, 2]]);
  });

  it('with a focus, clears it (SETTARGET), the mark, the walk to it (ClearDest) and the auto-attack', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.step();
    expect(r.own.dest?.targetId).toBe(MONSTER_ID);
    expect(r.loop.escape()).toBe(true);
    expect(r.focus.targetId).toBeNull();
    expect(r.loop.renderTargetId).toBeNull();
    expect(r.loop.autoAttack).toBe(false);
    expect(r.own.dest?.targetId ?? null).toBeNull();
    // SetObjFocus( NULL ): the live target released with 1, then NULL_ID focused with 2 (World.cpp:310-343)
    expect(r.targets).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2]]);
    r.steps(120);
    expect(r.melee()).toEqual([]);
  });

  it('with nothing focused, does nothing and says so', () => {
    const r = rig();
    expect(r.loop.escape()).toBe(false);
    expect(r.targets).toEqual([]);
    expect(r.sent).toEqual([]);
  });
});

describe('AttackLoop: QUERYGETDESTOBJ (CDPClient::OnQueryGetDestObj, DPClient.cpp:8985-8991)', () => {
  it('is answered with GETDESTOBJ while the player follows a target, and not otherwise', () => {
    const r = rig();
    r.step();
    r.loop.onQueryGetDestObj(OWN_ID);
    expect(r.sent).toEqual([]);
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.step();
    r.loop.onQueryGetDestObj(OWN_ID);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0], ['getDestObj', OWN_ID, MONSTER_ID]]);
    // swinging, it follows nothing (DoAttackMelee's STOP cleared it)
    r.until(() => r.melee().length > 0);
    r.loop.onQueryGetDestObj(OWN_ID);
    expect(r.sent.filter((s) => s[0] === 'getDestObj')).toHaveLength(1);
  });
});

describe('objRadius (CObj::GetRadius, Obj.cpp:781-791)', () => {
  it('is a sixth of the box\'s three sides, times the scale, in floats', () => {
    // the box of a model is floats, as the glb keeps them
    const box = { min: [f32(-0.3), 0, f32(-0.2)] as Vec3, max: [f32(0.3), f32(1.8), f32(0.2)] as Vec3 };
    let r = f32(f32(f32(f32(0.3) - f32(-0.3)) + f32(1.8)) + f32(f32(0.2) - f32(-0.2)));
    r = f32(r * f32(1 / 6));
    expect(objRadius(box, 1)).toBe(r);
    expect(objRadius(box, 2)).toBe(f32(r * 2));
  });
});

describe('AttackLoop.walkTo: a press on an NPC out of the menu range (ShowMoverMenu, WndWorld.cpp:6707-6708)', () => {
  it('walkTo sends one PLAYERSETDESTOBJ with range 0 and starts no attack', () => {
    const r = rig();
    r.loop.walkTo(MONSTER_ID);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    expect(r.loop.autoAttack).toBe(false);
    r.steps(240);
    expect(r.melee()).toEqual([]);
    expect(r.sent.filter((s) => s[0] === 'destObj')).toHaveLength(1);
  });
});

// ---- Piece 7 M2: the wand and the bow ------------------------------------------------------------------------------

/** `II_WEA_WAN_SEAL` (`propItem.txt:739`, `defineItem.h:130`: 231): IK3_WAND, AR_RANGE, 0.025, its missile XI_FIR_WAND01. */
const SEAL_WAND = itemProp({
  id: 231, name: 'Seal Wand', kind1: 1, kind2: 3, kind3: Ik3.WAND, handed: 1, part: 10, attackRange: 4,
  attackSpeed: f32(0.025), sfxHit: 27, sfxMissile: 27, linkKindBullet: -1,
});
/** `II_WEA_BOW_WOODNE` (`propItem.txt:195`, `defineItem.h:222`: 431): IK3_BOW, two hands, AR_WAND, needs IK2_BULLET. */
const WOODNESS_BOW = itemProp({
  id: 431, name: 'Woodness Bow', kind1: 1, kind2: 2, kind3: Ik3.BOW, handed: 2, part: 10, attackRange: 5,
  attackSpeed: f32(0.07), sfxHit: 33, sfxMissile: -1, linkKindBullet: 25,
});
/** `II_WEA_SEC_ACR_ARROW` (`propItem.txt:1962`, `defineItem.h:877`: 2028): IK2_BULLET, PARTS_BULLET, its missile XI_ITEM_RANGE_ATK1. */
const ARROW = itemProp({ id: 2028, name: 'Arrow', kind1: 1, kind2: 25, kind3: 60, part: 25, sfxMissile: 112, packMax: 9999 });
const ARROW_OBJECT = 7777;
/** `II_WEA_YOY_ITUN` (`propItem.txt:762`, `defineItem.h:199`): IK3_YOYO, two hands, AR_HRANGE, 0.075, thrown as XI_ITEM_YOYO_ATK1. */
const ITUN_YOYO = itemProp({
  id: 381, name: 'Itun Yoyo', kind1: 1, kind2: 2, kind3: Ik3.YOYO, handed: 2, part: 10, attackRange: 6,
  attackSpeed: f32(0.075), sfxHit: 17, sfxMissile: 116, linkKindBullet: -1,
});

/** A level 15 player holding `weapon`, with `arrows` in the arrow slot (none: an empty slot). */
function holding(weapon: typeof SEAL_WAND, arrows = 0): OwnState {
  const data = ownGameData({
    itemProps: new Map([WOODEN_SWORD, SEAL_WAND, WOODNESS_BOW, ARROW, ITUN_YOYO].map((prop) => [prop.id, prop])),
  });
  const own = newVagrant(15, [weapon.id], data);
  if (arrows > 0) {
    own.inventory!.set(ARROW_OBJECT, { objectId: ARROW_OBJECT, itemId: ARROW.id, count: arrows });
    own.equipmentObjectIds[25] = ARROW_OBJECT;
  }
  return own;
}

const shots = (sent: Sent[]): Sent[] => sent.filter((s) => s[0] === 'magic' || s[0] === 'range');

describe('AttackLoop: the charge (CWndWorld::GetGaugePower, WndWorld.cpp:6454-6469; Piece 7 M2)', () => {
  it('the charge levels are 0, 1, 2, 3, 4 from 0, 225, 675, 1125, 1575 ms; -1 in the lock-out', () => {
    const levels = [0, 224, 225, 674, 675, 1124, 1125, 1574, 1575, 9000].map(chargeLevel);
    expect(levels).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(chargeLevel(-1)).toBe(-1);
  });
});

describe('AttackLoop: the wand (CMD_SetMagicAttack, DoAttackMagic; Piece 7 M2)', () => {
  /** Selects the monster, then holds a press on it `heldMs` and lets go: the let-go's shot. */
  function chargeAndRelease(r: ReturnType<typeof rig>, heldMs: number): void {
    r.tap(MONSTER_ID);
    r.steps(40); // m_timerFocusAttack runs out
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    while (r.now() < at + heldMs) {
      r.loop.onMoverHeld(MONSTER_ID, r.now() - at);
      r.step();
    }
    r.loop.onReleased(at + heldMs);
  }

  it('a let-go on the focused target shoots at its level: MAGIC_ATTACK with the power and the current id', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    chargeAndRelease(r, 700);
    r.steps(3);
    expect(r.sent.filter((s) => s[0] === 'destObj')).toEqual([['destObj', MONSTER_ID, 15]]);
    expect(shots(r.sent)).toEqual([['magic', MONSTER_ID, 2, 0]]);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_MAGIC1);
  });

  it('a press on a new target let go before 500 ms shoots nothing', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    r.loop.onMoverHeld(MONSTER_ID, 400);
    r.loop.onReleased(at + 400);
    r.steps(5);
    expect(shots(r.sent)).toEqual([]);
  });

  it('held to level 4 a wand shoots on its own, then nothing for 1800 ms; at 3 with MP below 5', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    r.tap(MONSTER_ID);
    r.steps(40);
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    while (r.now() < at + 1700) {
      r.loop.onMoverHeld(MONSTER_ID, r.now() - at);
      r.step();
    }
    expect(shots(r.sent)).toEqual([['magic', MONSTER_ID, 4, 0]]);
    expect(r.loop.gauge(r.now())).toBe(4); // the lock-out draws it full
    r.loop.onReleased(r.now()); // within the 1800 ms: nothing
    r.steps(20);
    expect(shots(r.sent)).toHaveLength(1);

    const low = holding(SEAL_WAND);
    low.mp = 4;
    const l = rig({ own: low });
    l.tap(MONSTER_ID);
    l.steps(40);
    const from = l.now();
    l.loop.onMoverPressed(MONSTER_ID, from, false);
    while (l.now() < from + 1300) {
      l.loop.onMoverHeld(MONSTER_ID, l.now() - from);
      l.step();
    }
    expect(shots(l.sent)).toEqual([['magic', MONSTER_ID, 3, 0]]);
  });

  it('no shot during the lock-out, and none while the last is still in its motion', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    chargeAndRelease(r, 300);
    r.steps(2);
    expect(shots(r.sent)).toHaveLength(1);
    // pressed and let go again at once, the shot's motion still playing: IsActAttack refuses the command
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onReleased(r.now());
    r.steps(2);
    expect(shots(r.sent)).toHaveLength(1);
  });

  it('a wand never auto-attacks, and the action mover refuses its swings', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    r.tap(MONSTER_ID);
    r.loop.attackButton();
    expect(r.loop.autoAttack).toBe(false);
    r.steps(60);
    expect(r.melee()).toEqual([]);
    r.step();
    expect(r.own.act.sendActMsg(ActMsg.ATK1, MONSTER_ID)).toBe(false);
  });

  it('a blocked line of sight on arrival prints TID_GAME_BLOCKTARGETING and sends nothing', () => {
    const ground = { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] };
    const r = rig({ own: holding(SEAL_WAND), ground });
    chargeAndRelease(r, 300);
    r.steps(3);
    expect(shots(r.sent)).toEqual([]);
    expect(r.texts).toContain('TID_GAME_BLOCKTARGETING');
  });

  it('the gauge: none without a focus; 0 while not held; its level while held', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    expect(r.loop.gauge(r.now())).toBeNull();
    r.tap(MONSTER_ID);
    r.steps(40);
    expect(r.loop.gauge(r.now())).toBe(0);
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    expect(r.loop.gauge(at + 700)).toBe(2);
    expect(rig().loop.gauge(r.now())).toBeNull(); // a sword shows none
  });

  it('the Attack button held is not let go by the steps where no finger holds a mover (WorldScreen.step)', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    r.tap(MONSTER_ID);
    r.steps(40);
    const at = r.now();
    r.loop.attackButtonDown(at);
    for (let i = 0; i < 70; i++) {
      r.loop.onReleased(r.now()); // the screen's let-go of the tap, each step nothing is held on the canvas
      r.step();
    }
    expect(shots(r.sent)).toEqual([]);
    r.loop.attackButtonUp(at + 1200);
    r.steps(3);
    expect(shots(r.sent)).toEqual([['magic', MONSTER_ID, 3, 0]]);
  });

  it('the touch Attack button held charges and its release shoots, with a wand', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    r.tap(MONSTER_ID);
    r.steps(40);
    const at = r.now();
    r.loop.attackButtonDown(at);
    r.loop.attackButtonUp(at + 1200);
    r.steps(3);
    expect(shots(r.sent)).toEqual([['magic', MONSTER_ID, 3, 0]]);
  });
});

describe('AttackLoop: the bow (CMD_SetRangeAttack, IsBullet, DoAttackRange; Piece 7 M2)', () => {
  it('the bow walks to 15 m and sends RANGE_ATTACK with the charge as its third field', () => {
    const r = rig({ own: holding(WOODNESS_BOW, 10) });
    // a press held on a new target: the auto-attack stays off, so the charged shot is not replaced by a level-0 one
    const at = r.now();
    r.loop.onMoverPressed(MONSTER_ID, at, false);
    while (r.now() < at + 1200) {
      r.loop.onMoverHeld(MONSTER_ID, r.now() - at);
      r.step();
    }
    r.loop.onReleased(at + 1200);
    r.steps(3);
    expect(r.sent.filter((s) => s[0] === 'destObj')).toEqual([['destObj', MONSTER_ID, 15]]);
    expect(shots(r.sent)).toEqual([['range', MONSTER_ID, 3, 0]]);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_RANGE1);
  });

  it('a bow auto-attacks with a level-0 shot each step while the button is up (UseFocusObj, WndWorld.cpp:6250-6253)', () => {
    const r = rig({ own: holding(WOODNESS_BOW, 10) });
    r.tap(MONSTER_ID);
    r.steps(40);
    r.tap(MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    r.steps(60);
    const fired = shots(r.sent);
    expect(fired.length).toBeGreaterThanOrEqual(3);
    expect(fired.every((s) => s[0] === 'range' && s[2] === 0)).toBe(true);
  });

  it('no arrows: "Equip arrows first.", the auto-attack off, nothing sent', () => {
    const r = rig({ own: holding(WOODNESS_BOW) });
    r.tap(MONSTER_ID);
    r.steps(40);
    r.tap(MONSTER_ID);
    r.steps(10);
    expect(shots(r.sent)).toEqual([]);
    expect(r.sent.filter((s) => s[0] === 'destObj')).toEqual([]);
    expect(r.texts).toContain('TID_TIP_NEEDSATTACKITEM');
    expect(r.loop.autoAttack).toBe(false);
  });

  it('refused for want of arrows, a tap once they are on shoots (the sequence of jobs.spec.ts)', () => {
    const own = holding(WOODNESS_BOW);
    own.inventory!.set(3, { objectId: 3, itemId: ARROW.id, count: 100 });
    const r = rig({ own });
    r.tap(MONSTER_ID);
    r.steps(40);
    r.tap(MONSTER_ID);
    r.steps(10);
    expect(r.texts).toContain('TID_TIP_NEEDSATTACKITEM');
    own.equipmentObjectIds[25] = 3; // DOEQUIP of the arrows (OwnState.equipInventory)
    r.steps(20);
    r.tap(MONSTER_ID);
    r.steps(10);
    expect(shots(r.sent).length).toBeGreaterThan(0);
  });

  it('the last arrow spent, the next shot is refused', () => {
    const own = holding(WOODNESS_BOW, 1);
    const r = rig({ own });
    r.tap(MONSTER_ID);
    r.steps(40);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onReleased(r.now());
    r.steps(3);
    expect(shots(r.sent)).toHaveLength(1);
    // the server spends it: UPDATE_ITEM UI_NUM 0 (CMover::ArrowDown, Mover.cpp:8504-8549)
    own.apply({ type: 'updateItem', itemType: 0, objectId: ARROW_OBJECT, param: 0, value: 0, time: 0 }, OWN_ID);
    r.steps(MOTION_STEPS + 2);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onReleased(r.now());
    r.steps(3);
    expect(shots(r.sent)).toHaveLength(1);
    expect(r.texts).toContain('TID_TIP_NEEDSATTACKITEM');
  });
});

// ---- Piece 7 M2: the yoyo ------------------------------------------------------------------------------------------

describe('AttackLoop: the yoyo (CMD_SetMeleeAttack, ProcessMoveArrival, _ProcessStateAttack; Piece 7 M2)', () => {
  const d = `destObj ${MONSTER_ID}`;
  const atk = (n: number): string => `ATK${n} ${MONSTER_ID}`;

  it('a yoyo walks to 6 m and swings ATK1 then ATK2, never ATK3', () => {
    const r = rig({ own: holding(ITUN_YOYO) }); // level 15: a sword would chain to ATK4
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.kinds().length >= 5);
    expect(r.kinds().slice(0, 5)).toEqual([d, atk(1), atk(2), d, atk(1)]);
    expect(r.sent.filter((s) => s[0] === 'destObj')[0]).toEqual(['destObj', MONSTER_ID, 6]);
  });

  it("a yoyo's blocked line of sight on arrival prints the text and does not swing", () => {
    const r = rig({ own: holding(ITUN_YOYO), ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.steps(30);
    expect(r.melee()).toEqual([]);
    expect(r.texts).toContain('TID_GAME_BLOCKTARGETING');
  });
});

describe('AttackLoop: an Attack-button hold left over (final review, Important 3)', () => {
  it('a press on the canvas ends an Attack-button hold whose let-go never came', () => {
    const r = rig({ own: holding(SEAL_WAND) });
    r.tap(MONSTER_ID);
    r.steps(40);
    r.loop.attackButtonDown(r.now()); // its let-go is lost
    r.steps(5);
    // a tap on the ground: the canvas's own press and let-go, and the loop lets the button's go with it
    r.loop.onGroundPressed(false);
    r.loop.onReleased(r.now());
    r.steps(2);
    expect(r.controls()).toBe(true);
    r.steps(200); // no automatic shots with no finger down
    expect(shots(r.sent)).toEqual([]);
  });
});

describe('AttackLoop: an item cast (IsAttackAble, Mover.cpp:6484-6494; Piece 7 M3)', () => {
  it('an attack press during a cast cancels it and attacks nothing, then attacks once the cast is over', () => {
    let casting = true;
    let asked = 0;
    const r = rig({ interruptCast: () => { asked++; return casting; } });
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID); // the second press attacks
    r.steps(30);
    expect(asked).toBeGreaterThan(0);
    expect(r.kinds()).toEqual([]);
    casting = false; // the server's CANCEL: the auto-attack goes ahead
    r.until(() => r.melee().length > 0);
  });

  it('the per-frame attack check sends no cancel (Review Focus 1)', () => {
    let asked = 0;
    const r = rig({ interruptCast: () => { asked++; return true; } });
    r.tap(MONSTER_ID); // selected, not attacked
    for (let i = 0; i < 60; i++) {
      void r.loop.canAttackFocus;
      r.loop.gauge(r.now());
      r.step();
    }
    expect(asked).toBe(0);
  });
});

describe('AttackLoop: in the air (Piece 7 M5, ControlFlying, WndWorldControlPlayer.cpp:797-833)', () => {
  const RIDE = { speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 };
  /** The own mover flying at its place, 2 m up, facing east (angle 90, +X). */
  function flying(flierAt: Vec3, own?: OwnState) {
    const r = rig({ flierAt, ...(own === undefined ? {} : { own }) });
    r.own.act.body.pos = [OWN_AT[0], 2, OWN_AT[2]];
    r.own.act.modeFly(5000, RIDE, 1200);
    r.own.act.step();
    return r;
  }

  it("in the air a walker's monster cannot be attacked, a flying one can", () => {
    const r = flying([OWN_AT[0] + 2, 2, OWN_AT[2]]);
    const props = new Map([[AIBATT, { killable: 1 }], [MOTHBEE, { killable: 1 }]]);
    const flier = r.world.movers.get(FLIER_ID)!;
    expect(attackAble(r.monster, props, true)).toBe(false);
    expect(attackAble(flier, props, true)).toBe(true);
    expect(attackAble(flier, props, false)).toBe(false); // IsAttackAbleNPC: a walker hits no flier
    expect(attackAble(r.monster, props, false)).toBe(true);
  });

  it('the in-air attack sends MELEE_ATTACK2 within 3 m', () => {
    const r = flying([OWN_AT[0] + 2, 2, OWN_AT[2]]);
    r.tap(FLIER_ID); // Decision 5: a click selects a flying monster in the air
    expect(r.focus.targetId).toBe(FLIER_ID);
    r.loop.attackHeld = true;
    r.step();
    expect(r.sent.filter((s) => s[0] === 'melee2')).toEqual([['melee2', ActMsg.ATK1, FLIER_ID]]);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect(r.own.act.motion).toBe(31 + 10); // MTA_FATK1
    const far = flying([OWN_AT[0] + 8, 2, OWN_AT[2]]);
    far.tap(FLIER_ID);
    far.loop.attackHeld = true;
    far.steps(10);
    expect(far.sent.filter((s) => s[0] === 'melee2')).toEqual([]);
    expect(far.sent.filter((s) => s[0] === 'destObj')).toEqual([]); // nobody walks in the air
  });

  it('a wand fires in the air only inside 60° and 64 m', () => {
    const ahead = flying([OWN_AT[0] + 30, 2, OWN_AT[2]], holding(SEAL_WAND));
    ahead.tap(FLIER_ID);
    ahead.loop.attackHeld = true;
    ahead.step();
    expect(shots(ahead.sent)).toEqual([['magic', FLIER_ID, 0, expect.any(Number)]]);
    const behind = flying([OWN_AT[0] - 30, 2, OWN_AT[2]], holding(SEAL_WAND));
    behind.tap(FLIER_ID);
    behind.loop.attackHeld = true;
    behind.steps(5);
    expect(shots(behind.sent)).toEqual([]);
    const beyond = flying([OWN_AT[0] + 70, 2, OWN_AT[2]], holding(SEAL_WAND));
    beyond.tap(FLIER_ID);
    beyond.loop.attackHeld = true;
    beyond.steps(5);
    expect(shots(beyond.sent)).toEqual([]);
  });

  it('Tab cycles the flying targets ahead', () => {
    const r = flying([OWN_AT[0] + 20, 2, OWN_AT[2]]);
    r.loop.nextFlyTarget([1, 0, 0]); // the camera looks east, D3D
    expect(r.focus.targetId).toBe(FLIER_ID);
    r.focus.select(null);
    r.loop.nextFlyTarget([-1, 0, 0]); // looking west: nothing flies there
    expect(r.focus.targetId).toBeNull();
  });

  it('tracking (Z) points the flier at the focus', () => {
    const r = flying([OWN_AT[0], 12, OWN_AT[2] - 20]);
    r.tap(FLIER_ID);
    r.loop.toggleTracking();
    const to = r.own.act.tracking();
    expect(to).not.toBeNull();
    expect(to!.yawTo).toBeCloseTo(0, 3); // north, -Z
    expect(to!.pitchTo).toBeLessThan(0); // above: nose up
    r.loop.toggleTracking();
    expect(r.own.act.tracking()).toBeNull();
  });
});

describe('AttackLoop: a press in the air (Piece 7 M5, Decision 5; WndWorld.cpp:6868-6883, 7059)', () => {
  it('selects a flying monster only, and walks nowhere', () => {
    const r = rig({ flierAt: [OWN_AT[0] + 2, 2, OWN_AT[2]] });
    r.own.act.body.pos = [OWN_AT[0], 2, OWN_AT[2]];
    r.own.act.modeFly(5000, { speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 }, 1200);
    r.own.act.step();
    r.tap(MONSTER_ID); // a ground monster
    r.tap(NPC_ID);
    r.tap(PLAYER_ID);
    r.loop.walkTo(NPC_ID);
    r.steps(5);
    expect(r.focus.targetId).toBeNull();
    expect(r.sent).toEqual([]);
    r.tap(FLIER_ID);
    expect(r.focus.targetId).toBe(FLIER_ID);
  });
});
