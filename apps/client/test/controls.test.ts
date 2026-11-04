import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { MoveReport } from '@flyffweb/protocol';
import { NO_INTENT, joystickIntent } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import {
  STANDING, TapToWalk, WalkKey, controlIntent, desiredFrom, driveOwnMover, flightStick, movesOrTurns, restingIn,
} from '../src/world/controls';
import type { ControlIntent, Desired, WorldPress } from '../src/world/controls';
import { OwnMover } from '../src/world/ownMover';
import { moverMatrix, pickTap } from '../src/world/render/picking';
import type { PickCandidate, TapHit } from '../src/world/render/picking';
import { ActionMover } from '../src/world/sim/ActionMover';
import { terrainGround } from '../src/world/sim/collision';
import { ActMsg, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { setDestPos } from '../src/world/sim/moverRules';
import type { SimMover } from '../src/world/sim/moverRules';
import { addedPlayer, moverFrom } from './helpers/movers';

/** An own mover at the origin facing 90 degrees, running 0.1 a step; `walking` is the server's starting mode. */
function ownMover(walking: boolean): ActionMover {
  const act = new ActionMover({ pos: [0, 0, 0], angle: 90, speed: 0.1 });
  if (walking) act.stateFlag |= ObjStaF.WALK;
  return act;
}

/** A push of the joystick, or of anything that asks for a gait (`run`): a full push runs, a part push walks. */
const intent = (forward: number, turn: number, run: boolean): MoveIntent => ({ forward, turn, run });
/** The keys (W, S, A, D) held, with Shift or not, the joystick at rest: what `controlIntent` makes of them. */
const keys = (forward: number, turn: number, shift = false): ControlIntent =>
  controlIntent({ forward, turn, run: shift }, NO_INTENT);
const desired = (move: Desired['move'], turn: Desired['turn'], walk: boolean): Desired => ({ move, turn, walk });
const NOTHING = { moved: false, behavior: false };

describe('flightStick (Piece 7 M5, Decision 4)', () => {
  it('the stick forward dives, back climbs, sideways turns', () => {
    const push = (forward: number, turn: number): MoveIntent => ({ forward, turn, run: true });
    expect(flightStick(push(1, 0))).toEqual({ dive: true, climb: false, left: false, right: false });
    expect(flightStick(push(-1, 0))).toEqual({ dive: false, climb: true, left: false, right: false });
    expect(flightStick(push(0, -1))).toEqual({ dive: false, climb: false, left: true, right: false });
    expect(flightStick(push(0.7, 0.7))).toEqual({ dive: true, climb: false, left: false, right: true });
    expect(flightStick(push(0, 0))).toEqual({ dive: false, climb: false, left: false, right: false });
    // a share under 0.4 starts nothing; one that counts goes on down to 0.3
    expect(flightStick(push(0.35, 1))).toEqual({ dive: false, climb: false, left: false, right: true });
    const diving = flightStick(push(1, 0));
    expect(flightStick(push(0.35, 1), diving).dive).toBe(true);
  });
});

describe('desiredFrom', () => {
  it('reads forward and back from the sign of forward', () => {
    expect(desiredFrom(intent(1, 0, false)).move).toBe('forward');
    expect(desiredFrom(intent(0.2, 0, false)).move).toBe('forward');
    expect(desiredFrom(intent(-1, 0, false)).move).toBe('back');
    expect(desiredFrom(intent(0, 0, false)).move).toBe('stand');
  });

  it('turns right for a positive turn and left for a negative one', () => {
    expect(desiredFrom(intent(0, 1, false)).turn).toBe('right');
    expect(desiredFrom(intent(0, -0.5, false)).turn).toBe('left');
    expect(desiredFrom(intent(0, 0, false)).turn).toBe('none');
  });

  it('a push walks unless it is a full one', () => {
    expect(desiredFrom(intent(1, 0, false)).walk).toBe(true);
    expect(desiredFrom(intent(1, 0, true)).walk).toBe(false);
  });

  it('a forward push walks, a full push runs', () => {
    expect(desiredFrom(joystickIntent(0, -30))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(joystickIntent(0, -60))).toEqual(desired('forward', 'none', false));
  });

  it('a push inside the dead zone asks for nothing', () => {
    expect(desiredFrom(joystickIntent(2, -2))).toEqual(desired('stand', 'none', true));
  });

  it('the keys are on or off whatever was asked before: the stick\'s memory never holds a key that was let go', () => {
    expect(desiredFrom(intent(1, 1, false))).toEqual(desired('forward', 'right', true));
    expect(desiredFrom(intent(-1, -1, true))).toEqual(desired('back', 'left', false));
    // letting go keeps the mode the move had (Ruling 40)
    expect(desiredFrom(intent(0, 0, false), desired('forward', 'right', false))).toEqual(desired('stand', 'none', false));
    expect(desiredFrom(intent(1, 0, false), desired('back', 'left', true))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(intent(0, 1, false), desired('forward', 'left', true))).toEqual(desired('stand', 'right', true));
  });

  it('with no move or turn held the mode is the one before: letting go asks for no change (Ruling 40)', () => {
    // after a run, at rest: still running
    expect(desiredFrom(intent(0, 0, false), desired('forward', 'none', false)).walk).toBe(false);
    expect(desiredFrom(intent(0, 0, false), desired('stand', 'none', false)).walk).toBe(false);
    // a gait asked for with no move or turn changes nothing
    expect(desiredFrom(intent(0, 0, true), desired('stand', 'none', true)).walk).toBe(true);
    // a move or a turn takes the mode it is held with
    expect(desiredFrom(intent(0, 1, false), desired('stand', 'none', false)).walk).toBe(true);
    expect(desiredFrom(intent(1, 0, true), desired('stand', 'none', true)).walk).toBe(false);
    // a full push of the joystick runs, and its mode stays once the thumb lifts
    const ran = desiredFrom(joystickIntent(0, -60));
    expect(ran.walk).toBe(false);
    expect(desiredFrom(NO_INTENT, ran)).toEqual(desired('stand', 'none', false));
  });

  it('restingIn: nothing held, in the mode the mover has', () => {
    expect(restingIn(ownMover(true))).toEqual(desired('stand', 'none', true));
    expect(restingIn(ownMover(false))).toEqual(desired('stand', 'none', false));
  });
});

/**
 * A thumb on the joystick, one frame per point: each push through `joystickIntent` (which remembers the last one, as the
 * `Joystick` does) and `desiredFrom` (which remembers the last `Desired`, as the world screen does), then into the own
 * mover a step at a time. Returns what each frame asked for and how many PLAYERMOVED and PLAYERBEHAVIOR it would send.
 */
function thumb(points: [number, number][]): { asked: Desired[]; moved: number; behavior: number } {
  const act = ownMover(true);
  let push: MoveIntent = { ...NO_INTENT };
  let last = STANDING;
  const asked: Desired[] = [];
  let moved = 0;
  let behavior = 0;
  for (const [dx, dy] of points) {
    push = joystickIntent(dx, dy, push);
    last = desiredFrom(push, last);
    asked.push(last);
    const sent = driveOwnMover(act, last, true);
    moved += Number(sent.moved);
    behavior += Number(sent.behavior);
    act.step();
  }
  return { asked, moved, behavior };
}

/** `n` frames alternating between two points. */
const jitter = (a: [number, number], b: [number, number], n = 60): [number, number][] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a : b));
/** How many frames asked for something else than the frame before, by `key`. */
const switches = (asked: Desired[], key: keyof Desired): number =>
  asked.filter((d, i) => i > 0 && d[key] !== asked[i - 1]![key]).length;

describe('desiredFrom: the joystick', () => {
  it('a push nearly straight up walks straight, with no turn', () => {
    expect(desiredFrom(joystickIntent(3, -50))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(joystickIntent(-3, -50))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(joystickIntent(3, 50))).toEqual(desired('back', 'none', true));
  });

  it('a push nearly straight sideways turns in place, with no move', () => {
    expect(desiredFrom(joystickIntent(50, -3))).toEqual(desired('stand', 'right', true));
    expect(desiredFrom(joystickIntent(-50, 3))).toEqual(desired('stand', 'left', true));
  });

  it('a diagonal push walks and turns, as W and D together', () => {
    expect(desiredFrom(joystickIntent(35, -35))).toEqual(desired('forward', 'right', true));
    expect(desiredFrom(joystickIntent(-35, 35))).toEqual(desired('back', 'left', true));
  });

  it('a gentle push walks however short it is, once it is out of the dead zone', () => {
    expect(desiredFrom(joystickIntent(0, -10))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(joystickIntent(10, 0))).toEqual(desired('stand', 'right', true));
  });

  it('a thumb wobbling across straight up does not turn', () => {
    const { asked, moved } = thumb(jitter([1, -50], [-1, -50]));
    expect(new Set(asked.map((d) => d.turn))).toEqual(new Set(['none']));
    expect(moved).toBe(1); // the first FORWARD
  });

  it('a thumb on the edge between walking straight and turning switches once, not every frame', () => {
    // 20 px across and 46 up is just short of where turning starts, 21 px just past it
    expect(desiredFrom(joystickIntent(20, -46)).turn).toBe('none');
    expect(desiredFrom(joystickIntent(21, -46)).turn).toBe('right');
    const { asked, moved } = thumb(jitter([20, -46], [21, -46]));
    expect(switches(asked, 'turn')).toBe(1);
    expect(moved).toBe(2); // FORWARD, then RTURN once
  });

  it('a thumb on the edge between turning in place and walking switches once, not every frame', () => {
    expect(desiredFrom(joystickIntent(46, -20)).move).toBe('stand');
    expect(desiredFrom(joystickIntent(46, -21)).move).toBe('forward');
    const { asked, moved } = thumb(jitter([46, -20], [46, -21]));
    expect(switches(asked, 'move')).toBe(1);
    expect(moved).toBe(2); // RTURN, then FORWARD once
  });

  it('a push held at the run threshold, 1 px either side, does not switch between walking and running every frame', () => {
    // 57 px is 0.95 of the 60 px radius, where running starts
    expect(desiredFrom(joystickIntent(0, -56)).walk).toBe(true);
    expect(desiredFrom(joystickIntent(0, -58)).walk).toBe(false);
    const { asked, behavior } = thumb(jitter([0, -56], [0, -58]));
    expect(switches(asked, 'walk')).toBe(1);
    expect(behavior).toBe(1); // MODE_RUN once
  });

  it('a thumb on the edge of the dead zone does not start and stop every frame', () => {
    // 9 px is 0.15 of the radius, the dead zone's edge: 10 px starts a walk, 8 px would not
    expect(desiredFrom(joystickIntent(0, -8)).move).toBe('stand');
    const { asked, moved } = thumb(jitter([0, -10], [0, -8]));
    expect(switches(asked, 'move')).toBe(0);
    expect(moved).toBe(1); // the first FORWARD
  });
});

describe('driveOwnMover', () => {
  it('a forward push walks, a full push runs', () => {
    // the player ran before: a half push is a walk, so MODE_WALK goes out with the move
    const act = ownMover(false);
    expect(driveOwnMover(act, desiredFrom(joystickIntent(0, -30)), true)).toEqual({ moved: true, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
    for (let i = 0; i < 60; i++) act.step();
    expect(act.body.pos[0]).toBeCloseTo(1.5, 4);

    // pushing on to the end of the stick runs: only the behavior changes, the move is already on
    expect(driveOwnMover(act, desiredFrom(joystickIntent(0, -60)), true)).toEqual({ moved: false, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeFalsy();
    const before = act.body.pos[0];
    for (let i = 0; i < 60; i++) act.step();
    expect(act.body.pos[0] - before).toBeCloseTo(6, 4);
  });

  it('starting to run sends moved and behavior once, holding it sends nothing', () => {
    const act = ownMover(true);
    const run = desired('forward', 'none', false);
    expect(driveOwnMover(act, run, true)).toEqual({ moved: true, behavior: true });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
    for (let i = 0; i < 3; i++) {
      act.step();
      expect(driveOwnMover(act, run, true)).toEqual(NOTHING);
    }
  });

  it('turning while running sends moved', () => {
    const act = ownMover(false);
    const run = desired('forward', 'none', false);
    driveOwnMover(act, run, true);
    expect(driveOwnMover(act, desired('forward', 'right', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.RTURN);
    // the turn is held: nothing more to send, and it keeps turning right
    act.step();
    expect(driveOwnMover(act, desired('forward', 'right', false), true)).toEqual(NOTHING);
    // and it turns the other way when the player does
    expect(driveOwnMover(act, desired('forward', 'left', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.LTURN);
  });

  it('walks backward with a back push, and sends moved once', () => {
    const act = ownMover(false);
    const back = desired('back', 'none', false);
    expect(driveOwnMover(act, back, true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.BMOVE);
    act.step();
    expect(driveOwnMover(act, back, true)).toEqual(NOTHING);
  });

  it('going from back to forward sends FORWARD, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('back', 'none', false), true);
    expect(driveOwnMover(act, desired('forward', 'none', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
  });

  it('releasing forward sends STAND, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('forward', 'none', false), true);
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    // standing already: STAND answers 0, so nothing is sent
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual(NOTHING);
  });

  it('releasing a turn sends STOP_TURN, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('stand', 'left', false), true);
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.LTURN);
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(0);
    // no turn left to stop: STOP_TURN answers 0
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual(NOTHING);
  });

  it('stopping a turn while the move goes on is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('forward', 'left', false), true);
    act.step();
    expect(driveOwnMover(act, desired('forward', 'none', false), true)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(0);
  });

  it('standing, nothing held changes no mode; a turn of the joystick takes the mode it is pushed with (Ruling 40)', () => {
    // the server has the player standing, running: the first idle step, from the mover's own mode, sends nothing
    const act = ownMover(false);
    act.state = ObjSta.STAND;
    let asked = desiredFrom(intent(0, 0, false), restingIn(act));
    expect(driveOwnMover(act, asked, true)).toEqual(NOTHING);
    asked = desiredFrom(intent(0, 0, true), asked);
    expect(driveOwnMover(act, asked, true)).toEqual(NOTHING);
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
    // a part push sideways walks: the turn and the mode go out together
    asked = desiredFrom(intent(0, -1, false), asked);
    expect(driveOwnMover(act, asked, true)).toEqual({ moved: true, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
    // letting go stops the turn and keeps walk mode
    act.step();
    asked = desiredFrom(intent(0, 0, false), asked);
    expect(driveOwnMover(act, asked, true)).toEqual({ moved: true, behavior: false });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
  });

  it('an explicit change of mode while standing sends behavior only', () => {
    const act = ownMover(false);
    act.state = ObjSta.STAND;
    expect(driveOwnMover(act, desired('stand', 'none', true), true)).toEqual({ moved: false, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual({ moved: false, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
  });

  it('does not send STAND while jumping', () => {
    const act = ownMover(false);
    act.state = ObjSta.SJUMP3;
    let sent = 0;
    const send = act.sendActMsg.bind(act);
    act.sendActMsg = (msg: number, ...params: number[]): boolean => {
      if (msg === ActMsg.STAND) sent++;
      return send(msg, ...params);
    };
    driveOwnMover(act, desired('stand', 'none', false), true);
    expect(sent).toBe(0);
    expect(act.state).toBe(ObjSta.SJUMP3);
  });

  it('does not send STAND while sitting', () => {
    const act = ownMover(false);
    expect(act.sendActMsg(ActMsg.SITDOWN)).toBe(true);
    act.step();
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
    expect(driveOwnMover(act, desired('stand', 'none', false), true)).toEqual(NOTHING);
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
    expect(act.stateFlag & ObjStaF.SIT).toBeTruthy();
  });

  it('a forward push while sitting changes nothing and sends nothing', () => {
    const act = ownMover(false);
    act.sendActMsg(ActMsg.SITDOWN);
    act.step();
    expect(driveOwnMover(act, desired('forward', 'none', false), true)).toEqual(NOTHING);
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
  });

  it('moves before it turns before it changes gait: one call, one state', () => {
    // from standing and walking, a full-stick push right and forward sends all three, and the state shows all three
    const act = ownMover(true);
    expect(driveOwnMover(act, desired('forward', 'right', false), true)).toEqual({ moved: true, behavior: true });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.RTURN);
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
  });
});

/** An own mover at (100, 0, 100) facing 90 degrees and walking, on its way to a point 10 m ahead (`setDestPos`). */
function walkingToAPoint(): SimMover {
  const m: SimMover = {
    objectId: 1, act: new ActionMover({ pos: [100, 0, 100], angle: 90, speed: 0.1 }), dest: null, corr: null,
    speedFactor: 1, isSelf: true,
  };
  m.act.stateFlag |= ObjStaF.WALK;
  setDestPos(m, [110, 0, 100], true);
  // CMover::ProcessMove's TURNMOVE: it goes there
  m.act.sendActMsg(ActMsg.TURNMOVE, 90);
  return m;
}

describe('driveOwnMover with a destination (WndWorldControlPlayer.cpp:450-465, :548-553)', () => {
  it('sends no STAND while the own mover walks to its destination, and keeps it', () => {
    const m = walkingToAPoint();
    for (let i = 0; i < 10; i++) {
      expect(driveOwnMover(m.act, STANDING, false)).toEqual(NOTHING);
      m.act.step();
    }
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(m.dest?.pos).toEqual([110, 0, 100]);
  });

  it('a key that sends a move clears the destination', () => {
    const m = walkingToAPoint();
    expect(driveOwnMover(m.act, desired('forward', 'left', true), false)).toEqual({ moved: true, behavior: false });
    expect(m.dest).toBeNull();
    // with the destination gone, letting go stands the mover as before
    expect(driveOwnMover(m.act, STANDING, true)).toEqual({ moved: true, behavior: false });
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('a gait change alone clears it too (fBehavior)', () => {
    const m = walkingToAPoint();
    expect(driveOwnMover(m.act, desired('stand', 'none', false), false)).toEqual({ moved: false, behavior: true });
    expect(m.dest).toBeNull();
  });

  it('forward, which the walk is already, sends nothing and keeps it, as in Neuz (FORWARD answers 0)', () => {
    const m = walkingToAPoint();
    expect(driveOwnMover(m.act, desired('forward', 'none', true), false)).toEqual(NOTHING);
    expect(m.dest?.pos).toEqual([110, 0, 100]);
  });
});

/**
 * The own character standing at (100, 0, 100) facing east, walking or running as the server gave it, and the world
 * screen's driving of it (`OwnMover`), with what it sends.
 */
function driven(walking: boolean) {
  const own = moverFrom(addedPlayer(1, { self: true }, {
    pos: [100, 0, 100], angle: 90, state: ObjSta.STAND, stateFlag: walking ? ObjStaF.WALK : 0,
  }));
  own.act.body.speed = Math.fround(0.1);
  const sent: Array<{ type: 'moved' | 'behavior'; m: MoveReport }> = [];
  const session = {
    sendMoved: (m: MoveReport) => void sent.push({ type: 'moved', m }),
    sendBehavior: (m: MoveReport) => void sent.push({ type: 'behavior', m }),
    sendDestPos: () => {},
    sendCorr: () => {},
  };
  let tick = 1000n;
  const driving = new OwnMover(session, { tick: () => (tick += 10n) }, { show: () => {} });
  /** One step of the controls: `held` the keys and the joystick, `walkKey` whether X is held. */
  const control = (held: ControlIntent, walkKey = false): void => {
    driving.control(own, held, null, walkKey);
    own.act.step();
  };
  const types = (): string[] => sent.map((s) => s.type);
  return { own, sent, types, control };
}

const walkFlag = (act: ActionMover): boolean => (act.stateFlag & ObjStaF.WALK) !== 0;

describe('the gait (spec §1): X toggles walking and running, the keys move at the gait the mover has', () => {
  it('X toggles walk and sends one PLAYERBEHAVIOR (WndWorldControlPlayer.cpp:524-545)', () => {
    const r = driven(false);
    const idle = keys(0, 0);
    r.control(idle);
    expect(r.sent).toEqual([]);
    // X goes down: MODE_WALK, and its PLAYERBEHAVIOR, once however long it is held (`bWalk && !s_bWalk2`)
    for (let i = 0; i < 30; i++) r.control(idle, true);
    expect(r.types()).toEqual(['behavior']);
    expect(walkFlag(r.own.act)).toBe(true);
    expect(r.sent[0]!.m.stateFlag & ObjStaF.WALK).toBe(ObjStaF.WALK);
    // let go, nothing; down again: MODE_RUN
    r.control(idle);
    r.control(idle);
    expect(r.types()).toEqual(['behavior']);
    r.control(idle, true);
    expect(r.types()).toEqual(['behavior', 'behavior']);
    expect(walkFlag(r.own.act)).toBe(false);
    expect(r.sent[1]!.m.stateFlag & ObjStaF.WALK).toBe(0);
  });

  it('W and S then move at the toggled gait, and letting go keeps it', () => {
    const r = driven(false);
    r.control(keys(0, 0), true);
    r.control(keys(0, 0));
    for (let i = 0; i < 10; i++) r.control(keys(1, 0));
    // the move alone, no change of mode: it walks (a quarter of the run)
    expect(r.types()).toEqual(['behavior', 'moved']);
    expect(walkFlag(r.own.act)).toBe(true);
    expect(r.own.act.delta[0]).toBe(Math.fround(Math.fround(0.1) / 4));
    r.control(keys(0, 0));
    expect(walkFlag(r.own.act)).toBe(true);
  });

  it('Shift with W runs as W does: running, it runs; walking, it walks; and no mode changes', () => {
    for (const walking of [false, true]) {
      for (const shift of [false, true]) {
        const r = driven(walking);
        for (let i = 0; i < 5; i++) r.control(keys(1, 0, shift));
        expect(r.types()).toEqual(['moved']);
        expect(walkFlag(r.own.act)).toBe(walking);
        // Shift alone changes nothing either
        r.control(keys(0, 0, shift));
        expect(r.types()).toEqual(['moved', 'moved']); // the STAND of letting go
        expect(walkFlag(r.own.act)).toBe(walking);
      }
    }
    expect(desiredFrom(keys(1, 0, true), restingIn(ownMover(true))).walk).toBe(true);
    expect(desiredFrom(keys(-1, 1, true), restingIn(ownMover(false))).walk).toBe(false);
  });

  it('the joystick is unchanged: a part push walks, a full push runs, whatever X made the gait', () => {
    const r = driven(true);
    r.control(controlIntent(NO_INTENT, joystickIntent(0, -60)));
    expect(r.types()).toEqual(['moved', 'behavior']);
    expect(walkFlag(r.own.act)).toBe(false);
    r.control(controlIntent(NO_INTENT, joystickIntent(0, -30)));
    expect(walkFlag(r.own.act)).toBe(true);
    // the keys and the joystick together: the joystick's push sets the gait
    expect(controlIntent({ forward: 1, turn: 0, run: false }, joystickIntent(0, -60)))
      .toEqual({ forward: 1, turn: 0, run: true });
    expect(controlIntent({ forward: 1, turn: 0, run: true }, NO_INTENT)).toEqual({ forward: 1, turn: 0 });
  });

  it('movesOrTurns: a key or a push of the joystick, which stop the auto-attack (WndWorldControlPlayer.cpp:383-403)', () => {
    expect(movesOrTurns(keys(0, 0))).toBe(false);
    expect(movesOrTurns(keys(0, 0, true))).toBe(false);
    expect(movesOrTurns(keys(1, 0))).toBe(true);
    expect(movesOrTurns(keys(0, -1))).toBe(true);
    expect(movesOrTurns(controlIntent(NO_INTENT, joystickIntent(2, -2)))).toBe(false); // the dead zone
    expect(movesOrTurns(controlIntent(NO_INTENT, joystickIntent(0, -30)))).toBe(true);
  });
});

describe('WalkKey', () => {
  it('is held from the X key going down to its going up, by its place on the keyboard; a blur or reset lets go', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener: (type: string, listener: (event: unknown) => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const key = new WalkKey(target as unknown as EventTarget);
    expect(key.held()).toBe(false);
    listeners.get('keydown')!({ code: 'KeyX' });
    expect(key.held()).toBe(true);
    listeners.get('keydown')!({ code: 'KeyW' });
    listeners.get('keyup')!({ code: 'KeyW' });
    expect(key.held()).toBe(true);
    listeners.get('keyup')!({ code: 'KeyX' });
    expect(key.held()).toBe(false);
    listeners.get('keydown')!({ code: 'KeyX' });
    listeners.get('blur')!({});
    expect(key.held()).toBe(false);
    listeners.get('keydown')!({ code: 'KeyX' });
    key.reset();
    expect(key.held()).toBe(false);
    key.dispose();
    expect(listeners.size).toBe(0);
  });

  it('a press let go before it is read counts as held at the next read, once: a quick press toggles the gait once', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener: (type: string, listener: (event: unknown) => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const key = new WalkKey(target as unknown as EventTarget);
    listeners.get('keydown')!({ code: 'KeyX' });
    listeners.get('keyup')!({ code: 'KeyX' });
    expect(key.held()).toBe(true);
    expect(key.held()).toBe(false);
    const r = driven(false);
    listeners.get('keydown')!({ code: 'KeyX' });
    listeners.get('keyup')!({ code: 'KeyX' });
    for (let i = 0; i < 3; i++) r.control(keys(0, 0), key.held());
    expect(r.types()).toEqual(['behavior']);
    expect(walkFlag(r.own.act)).toBe(true);
  });

  it('read every step, as Neuz reads the key table: X pressed and let go while the attack runs toggles nothing later', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener: (type: string, listener: (event: unknown) => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const key = new WalkKey(target as unknown as EventTarget);
    const r = driven(false);
    listeners.get('keydown')!({ code: 'KeyX' });
    listeners.get('keyup')!({ code: 'KeyX' });
    key.held(); // a step of the attack branch: ControlGround does not run, and the press is gone with it
    for (let i = 0; i < 3; i++) r.control(keys(0, 0), key.held());
    expect(r.sent).toEqual([]);
    // held across the attack's end, it toggles as the controls come back (`bWalk && !s_bWalk2`)
    listeners.get('keydown')!({ code: 'KeyX' });
    key.held();
    r.control(keys(0, 0), key.held());
    expect(r.types()).toEqual(['behavior']);
  });
});

/** Just enough of a canvas for `TapToWalk`: its listeners, the pointers it keeps, and a 200 x 100 px box at (10, 20). */
class FakeCanvas {
  readonly listeners = new Map<string, (event: unknown) => void>();
  readonly captured: number[] = [];
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 10, top: 20, width: 200, height: 100 };
  }
  /** A pointer event at (x, y) on the page, `time` ms in; by default the main mouse button or the first finger. */
  fire(type: string, x: number, y: number, time: number, extra: Record<string, unknown> = {}): void {
    this.listeners.get(type)?.({ pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, timeStamp: time, ...extra });
  }
}

function tapToWalk(pick: (ndcX: number, ndcY: number) => TapHit | null = () => ({ point: [1, 2, 3] })) {
  const canvas = new FakeCanvas();
  const spy = vi.fn(pick);
  const presses: WorldPress[] = [];
  const tap = new TapToWalk(canvas as unknown as HTMLElement, spy, undefined, (press) => presses.push(press));
  return { canvas, pick: spy, tap, presses };
}

describe('Piece 5 camera-relative movement and touch gestures', () => {
  it('turns the character toward the stick vector relative to the camera without a turn state', () => {
    const intent = controlIntent(NO_INTENT, { forward: 0, turn: 1, run: true }, 90);
    const r = driven(false);
    r.control(intent);
    expect(r.own.act.body.angle).toBe(0);
    expect(r.own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(r.own.act.state & ObjSta.TURN_ALL).toBe(0);
  });

  it('a finger drag over a mover does not select or attack; a short tap does', () => {
    const r = tapToWalk(() => ({ mover: 7 }));
    r.canvas.fire('pointerdown', 100, 50, 0, { pointerType: 'touch' });
    expect(r.presses).toEqual([]);
    r.canvas.fire('pointermove', 130, 50, 50, { pointerType: 'touch' });
    r.canvas.fire('pointerup', 130, 50, 100, { pointerType: 'touch' });
    expect(r.presses).toEqual([]);
    r.canvas.fire('pointerdown', 100, 50, 1000, { pointerType: 'touch' });
    r.canvas.fire('pointerup', 100, 50, 1100, { pointerType: 'touch' });
    expect(r.presses).toHaveLength(1);
    expect(r.presses[0]!.mover).toBe(7);
    // Piece 7 M4: a finger's press says so (a phone opens a selected player's menu with it)
    expect(r.presses[0]!.touch).toBe(true);
  });
});

describe('TapToWalk', () => {
  it('a right press let go at its point on a mover is a menu press; moved, or on the ground, it is not (Piece 7 M4)', () => {
    // OnRButtonUp (__IMPROVE_SYSTEM_VER15, WndWorld.cpp:7114-7131): `point == m_ptMouseSpot`, on a player
    const canvas = new FakeCanvas();
    const menus: number[] = [];
    const presses: WorldPress[] = [];
    let hit: TapHit = { mover: 7 };
    new TapToWalk(canvas as unknown as HTMLElement, () => hit, undefined, (press) => presses.push(press), (mover) => menus.push(mover));
    canvas.fire('pointerdown', 100, 50, 1000, { button: 2 });
    canvas.fire('pointerup', 100, 50, 1200, { button: 2 });
    expect([menus, presses]).toEqual([[7], []]);
    canvas.fire('pointerdown', 100, 50, 2000, { button: 2 });
    canvas.fire('pointerup', 101, 50, 2200, { button: 2 });
    hit = { point: [1, 2, 3] };
    canvas.fire('pointerdown', 100, 50, 3000, { button: 2 });
    canvas.fire('pointerup', 100, 50, 3200, { button: 2 });
    expect(menus).toEqual([7]);
  });

  it('a press with Alt held says so (Piece 7 M4)', () => {
    const { canvas, presses } = tapToWalk(() => ({ mover: 7 }));
    canvas.fire('pointerdown', 100, 50, 1000, { altKey: true });
    canvas.fire('pointerup', 100, 50, 1050);
    canvas.fire('pointerdown', 100, 50, 3000);
    expect(presses.map((p) => p.alt)).toEqual([true, false]);
  });

  it('a tap on the ground gives the point picked where it went down', () => {
    const { canvas, pick, tap } = tapToWalk();
    expect(tap.take()).toBeNull();
    // pressed in the middle of the canvas, let go 2 px away 100 ms later: picked as it goes down (OnLButtonDown)
    canvas.fire('pointerdown', 110, 70, 1000);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith(0, 0);
    expect(tap.take()).toBeNull();
    canvas.fire('pointerup', 112, 70, 1100);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(tap.take()).toEqual([1, 2, 3]);
    // once: the next take has nothing new
    expect(tap.take()).toBeNull();

    // the corners: x from -1 (left) to 1, y from 1 (top) to -1, where the press was
    canvas.fire('pointerdown', 10, 20, 2000);
    canvas.fire('pointerup', 10, 20, 2010);
    canvas.fire('pointerdown', 210, 120, 3000);
    canvas.fire('pointerup', 210, 120, 3010);
    expect(pick.mock.calls.slice(1)).toEqual([[-1, 1], [1, -1]]);
    expect(tap.take()).toEqual([1, 2, 3]);
  });

  it('a drag is not a tap', () => {
    const { canvas, tap } = tapToWalk();
    // moved more than 8 px on the way, though let go where it started
    canvas.fire('pointerdown', 100, 50, 0);
    canvas.fire('pointermove', 109, 50, 50);
    canvas.fire('pointerup', 100, 50, 100);
    // let go more than 8 px away
    canvas.fire('pointerdown', 100, 50, 1000);
    canvas.fire('pointerup', 106, 56, 1100);
    // held longer than 300 ms
    canvas.fire('pointerdown', 100, 50, 2000);
    canvas.fire('pointerup', 100, 50, 2301);
    expect(tap.take()).toBeNull();

    // 8 px and 300 ms are still a tap
    canvas.fire('pointerdown', 100, 50, 3000);
    canvas.fire('pointermove', 108, 50, 3100);
    canvas.fire('pointerup', 100, 58, 3300);
    expect(tap.take()).toEqual([1, 2, 3]);
  });

  it("only the main button or a lone finger taps: not another button, a pinch, a cancel or another pointer's let-go", () => {
    const { canvas, pick, tap } = tapToWalk();
    canvas.fire('pointerdown', 100, 50, 0, { button: 2 });
    canvas.fire('pointerup', 100, 50, 10, { button: 2 });
    // Piece 7 M4: a right press let go where it went down is picked for the player's menu, but it is no tap
    expect(tap.take()).toBeNull();
    expect(pick).toHaveBeenCalledTimes(1);
    pick.mockClear();
    // a pinch: the second finger ends the first one's tap, and is none itself
    canvas.fire('pointerdown', 100, 50, 100, { pointerId: 5 });
    canvas.fire('pointerdown', 150, 50, 110, { pointerId: 6, isPrimary: false });
    canvas.fire('pointerup', 150, 50, 150, { pointerId: 6, isPrimary: false });
    canvas.fire('pointerup', 100, 50, 160, { pointerId: 5 });
    canvas.fire('pointerdown', 100, 50, 200);
    canvas.fire('pointercancel', 100, 50, 210);
    canvas.fire('pointerup', 100, 50, 220);
    canvas.fire('pointerdown', 100, 50, 300, { pointerId: 7 });
    canvas.fire('pointerup', 100, 50, 310, { pointerId: 8 });
    expect(tap.take()).toBeNull();
    // the second finger picked nothing: only the main pointers' presses are picked
    expect(pick).toHaveBeenCalledTimes(3);
  });

  it('a tap that picks nothing gives nothing, and leaves a tap not yet taken as it is', () => {
    let hit: TapHit | null = { point: [4, 5, 6] };
    const { canvas, tap } = tapToWalk(() => hit);
    canvas.fire('pointerdown', 100, 50, 0);
    canvas.fire('pointerup', 100, 50, 10);
    hit = null;
    canvas.fire('pointerdown', 100, 50, 1000);
    canvas.fire('pointerup', 100, 50, 1010);
    expect(tap.take()).toEqual([4, 5, 6]);
    canvas.fire('pointerdown', 100, 50, 2000);
    canvas.fire('pointerup', 100, 50, 2010);
    expect(tap.take()).toBeNull();
  });

  it('a pick that throws gives nothing, and its error goes to report (or is thrown without one)', () => {
    const canvas = new FakeCanvas();
    const report = vi.fn();
    const tap = new TapToWalk(canvas as unknown as HTMLElement, () => {
      throw new Error('no ground');
    }, report);
    canvas.fire('pointerdown', 100, 50, 0);
    expect(report).toHaveBeenCalledWith(new Error('no ground'));
    canvas.fire('pointerup', 100, 50, 10);
    expect(tap.take()).toBeNull();
    expect(tap.heldMover()).toBeNull();

    const { canvas: other } = tapToWalk(() => {
      throw new Error('no ground');
    });
    expect(() => other.fire('pointerdown', 100, 50, 0)).toThrow('no ground');
  });

  it('reset forgets a press under way and a tap not yet taken; dispose stops listening', () => {
    const { canvas, tap } = tapToWalk();
    canvas.fire('pointerdown', 100, 50, 0);
    canvas.fire('pointerup', 100, 50, 10);
    canvas.fire('pointerdown', 100, 50, 1000);
    tap.reset();
    canvas.fire('pointerup', 100, 50, 1010);
    expect(tap.take()).toBeNull();
    tap.dispose();
    expect(canvas.listeners.size).toBe(0);
  });

  it('a press on a mover is handed on as it goes down, and held until it is let go however far it moves', () => {
    const { canvas, tap, presses } = tapToWalk(() => ({ mover: 7 }));
    canvas.fire('pointerdown', 100, 50, 1000);
    // OnLButtonDown: picked and handed on at once; SetCapture keeps the pointer's let-go
    expect(presses).toEqual([{ mover: 7, time: 1000, double: false, alt: false, touch: false }]);
    expect(canvas.captured).toEqual([1]);
    expect(tap.heldMover()).toEqual({ mover: 7, time: 1000 });
    // a drag or a long hold is still the press (moving the cursor away does not matter, [combat §2.1])
    canvas.fire('pointermove', 180, 90, 1300);
    canvas.fire('pointermove', 120, 50, 1900);
    expect(tap.heldMover()).toEqual({ mover: 7, time: 1000 });
    canvas.fire('pointerup', 120, 50, 2000);
    expect(tap.heldMover()).toBeNull();
    // a mover gives no destination
    expect(tap.take()).toBeNull();

    // a second finger, a cancel, a lost capture and reset let go too
    canvas.fire('pointerdown', 100, 50, 3000);
    canvas.fire('pointerdown', 150, 50, 3010, { pointerId: 6, isPrimary: false });
    expect(tap.heldMover()).toBeNull();
    canvas.fire('pointerdown', 100, 50, 4000);
    canvas.fire('pointercancel', 100, 50, 4010);
    expect(tap.heldMover()).toBeNull();
    canvas.fire('pointerdown', 100, 50, 5000);
    canvas.fire('lostpointercapture', 100, 50, 5010);
    expect(tap.heldMover()).toBeNull();
    canvas.fire('pointerdown', 100, 50, 6000);
    tap.reset();
    expect(tap.heldMover()).toBeNull();
  });

  it('a press on the ground, or on nothing, is handed on as it goes down too, with no mover; it still walks only as a tap', () => {
    let hit: TapHit | null = { point: [1, 2, 3] };
    const { canvas, tap, presses } = tapToWalk(() => hit);
    // OnLButtonDown's other branch (WndWorld.cpp:6919-6929) runs as the button goes down, a drag or not
    canvas.fire('pointerdown', 100, 50, 1000);
    expect(presses).toEqual([{ mover: null, time: 1000, double: false, alt: false, touch: false, point: [1, 2, 3] }]); // 2026-11-05: and where
    expect(tap.heldMover()).toBeNull();
    canvas.fire('pointermove', 150, 50, 1100);
    canvas.fire('pointerup', 150, 50, 1200);
    expect(tap.take()).toBeNull();
    hit = null;
    canvas.fire('pointerdown', 100, 50, 3000);
    canvas.fire('pointerup', 100, 50, 3010);
    expect(presses.at(-1)).toEqual({ mover: null, time: 3000, double: false, alt: false, touch: false });
    expect(tap.take()).toBeNull();
    // a pick that throws hands on no press
    const other = new FakeCanvas();
    const pressed: WorldPress[] = [];
    new TapToWalk(other as unknown as HTMLElement, () => {
      throw new Error('no ground');
    }, () => {}, (press) => pressed.push(press));
    other.fire('pointerdown', 100, 50, 0);
    expect(pressed).toEqual([]);
  });

  it('hands on the let-go of a press on a mover with the time it came (OnLButtonUp), not the next step\'s', () => {
    const canvas = new FakeCanvas();
    const presses: WorldPress[] = [];
    const releases: number[] = [];
    let hit: TapHit = { mover: 7 };
    // the let-go follows M4's right-press callback (none here)
    new TapToWalk(canvas as unknown as HTMLElement, () => hit, undefined, (press) => presses.push(press), undefined, (time) => releases.push(time));
    // a mouse press held on the mover: handed on as it goes down, its let-go as it comes up, moved or not
    canvas.fire('pointerdown', 100, 50, 1000);
    expect(releases).toEqual([]);
    canvas.fire('pointermove', 180, 50, 1500);
    canvas.fire('pointerup', 180, 50, 2500);
    expect(releases).toEqual([2500]);
    // a finger's tap: its press and its let-go both as it comes up, each at its own time
    canvas.fire('pointerdown', 100, 50, 4000, { pointerType: 'touch' });
    canvas.fire('pointerup', 100, 50, 4100, { pointerType: 'touch' });
    expect(presses.at(-1)).toMatchObject({ mover: 7, time: 4000, double: false, touch: true });
    expect(releases).toEqual([2500, 4100]);
    // a finger's drag hands on no press, so no let-go either; nor a press on the ground
    canvas.fire('pointerdown', 100, 50, 6000, { pointerType: 'touch' });
    canvas.fire('pointermove', 150, 50, 6050, { pointerType: 'touch' });
    canvas.fire('pointerup', 150, 50, 6100, { pointerType: 'touch' });
    hit = { point: [1, 2, 3] };
    canvas.fire('pointerdown', 100, 50, 8000);
    canvas.fire('pointerup', 100, 50, 8100);
    expect(releases).toEqual([2500, 4100]);
    // a held press cancelled, or its capture lost, is let go then
    hit = { mover: 7 };
    canvas.fire('pointerdown', 100, 50, 10000);
    canvas.fire('pointercancel', 100, 50, 10500);
    canvas.fire('pointerdown', 100, 50, 12000);
    canvas.fire('lostpointercapture', 100, 50, 12700);
    expect(releases).toEqual([2500, 4100, 10500, 12700]);
  });

  it('a second press within 500 ms and 2 px of the first is a double click\'s (GetDoubleClickTime, SM_CXDOUBLECLK)', () => {
    let hit: TapHit = { point: [1, 2, 3] };
    const { canvas, presses } = tapToWalk(() => hit);
    // the first press on the ground, the second on a mover: a double click whatever is under it
    canvas.fire('pointerdown', 100, 50, 1000);
    canvas.fire('pointerup', 100, 50, 1050);
    hit = { mover: 7 };
    canvas.fire('pointerdown', 102, 48, 1500);
    canvas.fire('pointerup', 102, 48, 1550);
    // a third is a first press again
    canvas.fire('pointerdown', 102, 48, 1600);
    canvas.fire('pointerup', 102, 48, 1650);
    // too late, too far
    canvas.fire('pointerdown', 102, 48, 2101);
    canvas.fire('pointerup', 102, 48, 2150);
    canvas.fire('pointerdown', 105, 48, 2200);
    canvas.fire('pointerup', 105, 48, 2250);
    expect(presses.map((p) => p.double)).toEqual([false, true, false, false, false]);
    expect(presses.map((p) => p.mover)).toEqual([null, 7, 7, 7, 7]);
  });

  it('a tap on a mover gives no destination: the world screen selects the mover instead', () => {
    // flat land at height 5 (D3D); the camera 10 m over (100, 100), looking straight down at it
    const ground = terrainGround(() => 5);
    const camera = new PerspectiveCamera(45, 2, 0.5, 1000);
    camera.position.set(...toWebPosition([100, 15, 100]));
    camera.lookAt(...toWebPosition([100, 5, 100.001]));
    camera.updateMatrixWorld();
    // a mover 1.8 m tall standing on that spot (a little off, so that the ray is not on a diagonal of its top)
    const mover: PickCandidate = {
      objectId: 7, box: { min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }, world: moverMatrix([100.2, 5, 99.9], 0, 1), dead: false,
      isPlayer: false,
    };
    let moverThere = false;
    const { canvas, tap, presses } = tapToWalk((x, y) => pickTap(camera, x, y, ground, 4, moverThere ? [mover] : []));

    canvas.fire('pointerdown', 110, 70, 0);
    canvas.fire('pointerup', 110, 70, 10);
    const point = tap.take()!;
    expect(point[0]).toBeCloseTo(100, 3);
    expect(point[1]).toBeCloseTo(5, 4);
    expect(point[2]).toBeCloseTo(100, 2);

    moverThere = true;
    canvas.fire('pointerdown', 110, 70, 1000);
    canvas.fire('pointerup', 110, 70, 1010);
    expect(tap.take()).toBeNull();
    expect(presses).toEqual([{ mover: null, time: 0, double: false, alt: false, touch: false, point: expect.any(Array) }, { mover: 7, time: 1000, double: false, alt: false, touch: false }]);
    // beside the mover, the ground is picked as before
    canvas.fire('pointerdown', 170, 70, 2000);
    canvas.fire('pointerup', 170, 70, 2010);
    expect(tap.take()).not.toBeNull();
  });
});
