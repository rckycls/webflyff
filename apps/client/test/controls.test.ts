import { describe, expect, it } from 'vitest';
import { NO_INTENT, joystickIntent } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import { STANDING, desiredFrom, driveOwnMover } from '../src/world/controls';
import type { Desired } from '../src/world/controls';
import { ActionMover } from '../src/world/sim/ActionMover';
import { ActMsg, ObjSta, ObjStaF } from '../src/world/sim/constants';

/** An own mover at the origin facing 90 degrees, running 0.1 a step; `walking` is the server's starting mode. */
function ownMover(walking: boolean): ActionMover {
  const act = new ActionMover({ pos: [0, 0, 0], angle: 90, speed: 0.1 });
  if (walking) act.stateFlag |= ObjStaF.WALK;
  return act;
}

const intent = (forward: number, turn: number, run: boolean): MoveIntent => ({ forward, turn, run });
const desired = (move: Desired['move'], turn: Desired['turn'], walk: boolean): Desired => ({ move, turn, walk });
const NOTHING = { moved: false, behavior: false };

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

  it('walks unless running', () => {
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
    expect(desiredFrom(intent(0, 0, false), desired('forward', 'right', false))).toEqual(STANDING);
    expect(desiredFrom(intent(1, 0, false), desired('back', 'left', true))).toEqual(desired('forward', 'none', true));
    expect(desiredFrom(intent(0, 1, false), desired('forward', 'left', true))).toEqual(desired('stand', 'right', true));
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
    const sent = driveOwnMover(act, last);
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
    expect(driveOwnMover(act, desiredFrom(joystickIntent(0, -30)))).toEqual({ moved: true, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
    for (let i = 0; i < 60; i++) act.step();
    expect(act.body.pos[0]).toBeCloseTo(1.5, 4);

    // pushing on to the end of the stick runs: only the behavior changes, the move is already on
    expect(driveOwnMover(act, desiredFrom(joystickIntent(0, -60)))).toEqual({ moved: false, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeFalsy();
    const before = act.body.pos[0];
    for (let i = 0; i < 60; i++) act.step();
    expect(act.body.pos[0] - before).toBeCloseTo(6, 4);
  });

  it('starting to run sends moved and behavior once, holding it sends nothing', () => {
    const act = ownMover(true);
    const run = desired('forward', 'none', false);
    expect(driveOwnMover(act, run)).toEqual({ moved: true, behavior: true });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
    for (let i = 0; i < 3; i++) {
      act.step();
      expect(driveOwnMover(act, run)).toEqual(NOTHING);
    }
  });

  it('turning while running sends moved', () => {
    const act = ownMover(false);
    const run = desired('forward', 'none', false);
    driveOwnMover(act, run);
    expect(driveOwnMover(act, desired('forward', 'right', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.RTURN);
    // the turn is held: nothing more to send, and it keeps turning right
    act.step();
    expect(driveOwnMover(act, desired('forward', 'right', false))).toEqual(NOTHING);
    // and it turns the other way when the player does
    expect(driveOwnMover(act, desired('forward', 'left', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.LTURN);
  });

  it('walks backward with a back push, and sends moved once', () => {
    const act = ownMover(false);
    const back = desired('back', 'none', false);
    expect(driveOwnMover(act, back)).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.BMOVE);
    act.step();
    expect(driveOwnMover(act, back)).toEqual(NOTHING);
  });

  it('going from back to forward sends FORWARD, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('back', 'none', false));
    expect(driveOwnMover(act, desired('forward', 'none', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
  });

  it('releasing forward sends STAND, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('forward', 'none', false));
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    // standing already: STAND answers 0, so nothing is sent
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual(NOTHING);
  });

  it('releasing a turn sends STOP_TURN, which is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('stand', 'left', false));
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.LTURN);
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(0);
    // no turn left to stop: STOP_TURN answers 0
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual(NOTHING);
  });

  it('stopping a turn while the move goes on is moved', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('forward', 'left', false));
    act.step();
    expect(driveOwnMover(act, desired('forward', 'none', false))).toEqual({ moved: true, behavior: false });
    expect(act.state & ObjSta.TURN_ALL).toBe(0);
  });

  it('switching to walk while standing sends behavior only', () => {
    const act = ownMover(false);
    driveOwnMover(act, desired('stand', 'none', false));
    act.step();
    expect(driveOwnMover(act, desired('stand', 'none', true))).toEqual({ moved: false, behavior: true });
    expect(act.stateFlag & ObjStaF.WALK).toBeTruthy();
    // and back to running
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual({ moved: false, behavior: true });
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
    driveOwnMover(act, desired('stand', 'none', false));
    expect(sent).toBe(0);
    expect(act.state).toBe(ObjSta.SJUMP3);
  });

  it('does not send STAND while sitting', () => {
    const act = ownMover(false);
    expect(act.sendActMsg(ActMsg.SITDOWN)).toBe(true);
    act.step();
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
    expect(driveOwnMover(act, desired('stand', 'none', false))).toEqual(NOTHING);
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
    expect(act.stateFlag & ObjStaF.SIT).toBeTruthy();
  });

  it('a forward push while sitting changes nothing and sends nothing', () => {
    const act = ownMover(false);
    act.sendActMsg(ActMsg.SITDOWN);
    act.step();
    expect(driveOwnMover(act, desired('forward', 'none', false))).toEqual(NOTHING);
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.SIT);
  });

  it('moves before it turns before it changes gait: one call, one state', () => {
    // from standing and walking, a full-stick push right and forward sends all three, and the state shows all three
    const act = ownMover(true);
    expect(driveOwnMover(act, desired('forward', 'right', false))).toEqual({ moved: true, behavior: true });
    expect(act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(act.state & ObjSta.TURN_ALL).toBe(ObjSta.RTURN);
    expect(act.stateFlag & ObjStaF.WALK).toBe(0);
  });
});
