import { describe, expect, it } from 'vitest';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { NULL_ID } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { AttackLoop, objRadius } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import type { OwnState } from '../src/world/OwnState';
import { terrainGround } from '../src/world/sim/collision';
import { ActMsg, ObjSta } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';
import type { Mover } from '../src/world/WorldState';
import { MI_FEMALE, MI_MALE, addedNpc, addedPlayer, webMoverOf } from './helpers/movers';
import { OWN_ID, WOODEN_SWORD, newVagrant, ownAdded, ownGameData } from './helpers/ownState';

const f32 = Math.fround;

/** `MI_AIBATT1` and its row: a monster that can be killed (`bKillable` 1). */
const AIBATT = 20;
const MONSTER_ID = 30;
const OTHER_MONSTER_ID = 31;
const NPC_ID = 40;
const PLAYER_ID = 50;
/** `BELLI_PEACEFUL`, `BELLI_ACTIVEATTACK` (`Resource/defineAttribute.h:203-205`). */
const PEACEFUL = 1;
const ACTIVE_ATTACK = 3;
/** How many steps the fake model plays each motion for before `IsEndFrame` (a swing included). */
const MOTION_STEPS = 12;

type Sent =
  | ['destObj', number, number]
  | ['melee', number, number, number]
  | ['getDestObj', number, number]
  | ['behavior', MoveReport];

const OWN_AT: Vec3 = [100, 0, 100];
/** 6 m east of the own mover, which faces east (angle 90: D3D +x). */
const MONSTER_AT: Vec3 = [106, 0, 100];

interface RigOptions {
  level?: number;
  /** The own state the loop reads; `newVagrant( level )` unless given. */
  own?: OwnState | undefined;
  /** The monster's belligerence and `bKillable`. */
  belligerence?: number;
  killable?: number;
}

/**
 * The own character (a Vagrant of `level`, with the Wooden Sword) 6 m west of an Aibatt and of a second one 6 m north,
 * with a peaceful NPC and another player beside them, in a `WorldState` on flat land; the loop over a fake session that
 * records what it sends; and a rules step as the world screen takes one: the loop's step, then the world's (the own
 * mover first, as the first ADD_OBJ of the JOIN), then each model's frame move. The models are fakes that end each
 * motion after `MOTION_STEPS` steps; each mover's radius is 0.5.
 */
function rig(options: RigOptions = {}) {
  const level = options.level ?? 1;
  const data = ownGameData({
    movers: new Map([
      [MI_MALE, webMoverOf({ index: MI_MALE, name: 'Male', speed: 0.1, ai: 1, killable: 1 })],
      [MI_FEMALE, webMoverOf({ index: MI_FEMALE, name: 'Female', speed: 0.1, ai: 1, killable: 1 })],
      [AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', killable: options.killable ?? 1, belligerence: ACTIVE_ATTACK })],
    ]),
  });
  const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0));
  const add = (added: Parameters<WorldState['apply']>[1] & { type: 'addMover' }): Mover => {
    world.apply(added.mover.objectId, added);
    return world.movers.get(added.mover.objectId)!;
  };
  const own = add({ type: 'addMover', mover: { ...ownAdded(level), pos: OWN_AT, angle: 90, state: ObjSta.STAND } });
  const monster = add({
    type: 'addMover',
    mover: addedNpc(MONSTER_ID, AIBATT, {}, { pos: MONSTER_AT, angle: 270, state: ObjSta.STAND, belligerence: options.belligerence ?? ACTIVE_ATTACK }),
  });
  add({
    type: 'addMover',
    mover: addedNpc(OTHER_MONSTER_ID, AIBATT, {}, { pos: [100, 0, 94], state: ObjSta.STAND, belligerence: ACTIVE_ATTACK }),
  });
  add({
    type: 'addMover',
    mover: addedNpc(NPC_ID, MI_FEMALE, { characterKey: 'MaFl_Juria' }, { pos: [103, 0, 103], belligerence: PEACEFUL }),
  });
  add({ type: 'addMover', mover: addedPlayer(PLAYER_ID, {}, { pos: [103, 0, 97] }) });
  world.takeChanges();
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
  };
  const focus = new Focus(session);
  const state = 'own' in options ? options.own : newVagrant(level);
  let tick = 1000n;
  const loop = new AttackLoop(session, focus, () => state, { tick: () => (tick += 10n) }, data.movers);
  const find = (objectId: number): Mover | undefined => world.movers.get(objectId);

  let now = 10_000;
  const step = (): void => {
    loop.step(own, find);
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
    loop.onReleased();
  };
  // the world runs before anything can be pressed: the loop knows the own mover and the movers in view from its step
  step();
  const melee = (): Array<[number, number, number]> =>
    sent.filter((s) => s[0] === 'melee').map((s) => [s[1], s[2], s[3]] as [number, number, number]);
  const kinds = (): string[] => sent.filter((s) => s[0] === 'destObj' || s[0] === 'melee').map((s) =>
    s[0] === 'destObj' ? `destObj ${s[1]}` : `ATK${(s[1] as number) - ActMsg.ATK1 + 1} ${s[2]}`);
  return {
    world, own, monster, loop, focus, sent, targets, step, steps, until, tap, melee, kinds, now: () => now, find,
  };
}

const SWORD_SPEED = f32(0.085);

describe('AttackLoop: a tap selects, a second one attacks (WndWorld.cpp:6844-6929, 8513-8531)', () => {
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

  it('while a press on a mover is held before its time is out, the controls do nothing (Process: neither branch)', () => {
    const r = rig();
    expect(r.loop.controlsPlayer).toBe(true);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    expect(r.loop.controlsPlayer).toBe(false);
    r.loop.onReleased();
    expect(r.loop.controlsPlayer).toBe(true);
    // auto-attacking a focus: the attack, not the controls
    r.tap(MONSTER_ID);
    expect(r.loop.controlsPlayer).toBe(false);
    r.loop.stop('move');
    expect(r.loop.controlsPlayer).toBe(true);
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

  it('a tap on the ground stops it and drops the next target (WndWorld.cpp:6919-6929)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.tap(OTHER_MONSTER_ID); // queued behind the target while auto-attacking
    expect(r.focus.next).toBe(OTHER_MONSTER_ID);
    expect(r.loop.renderTargetId).toBe(OTHER_MONSTER_ID);
    r.loop.stop('ground');
    expect(r.loop.autoAttack).toBe(false);
    expect(r.focus.next).toBeNull();
    expect(r.loop.renderTargetId).toBeNull();
    expect(r.focus.targetId).toBe(MONSTER_ID); // bare ground does not clear the focus
    r.steps(300);
    expect(r.melee()).toEqual([]);
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
    // the world screen's part of a DEL_OBJ: the world drops the mover, the focus goes (CWorld::Process, World.cpp:892-893)
    // and the loop is told its target is gone
    r.world.apply(MONSTER_ID, { type: 'delObj' });
    for (const id of r.world.takeChanges().removed) {
      const wasTarget = r.focus.targetId === id;
      r.focus.onRemoved(id, false);
      if (wasTarget) r.loop.stop('target');
    }
    expect(r.focus.targetId).toBeNull();
    expect(() => r.steps(300)).not.toThrow();
    expect(r.melee()).toEqual([]);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 0]]);
    expect(r.loop.autoAttack).toBe(false);
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

describe('AttackLoop: taps that repeat fast (Review Focus 2)', () => {
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
    const peaceful = rig({ belligerence: PEACEFUL });
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
