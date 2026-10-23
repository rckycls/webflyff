import { describe, expect, it } from 'vitest';
import { joystickIntent } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import { desiredFrom, driveOwnMover } from '../src/world/controls';
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
