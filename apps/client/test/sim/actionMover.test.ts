import { describe, expect, it } from 'vitest';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { ActionMover, wrapAngle } from '../../src/world/sim/ActionMover';
import type { MoverBody } from '../../src/world/sim/ActionMover';
import { ActMsg, AniLoop, MAX_CORR_SIZE_45, Mti, ObjSta, ObjStaF } from '../../src/world/sim/constants';

type GroundAt = (x: number, z: number) => number | null;

/** A mover at `pos` facing `angle`, whose `CMover::GetSpeed` is 0.1 per step (the plan's test speed). */
function mover(angle: number, pos: Vec3 = [0, 0, 0], extra: Partial<MoverBody> = {}): ActionMover {
  return new ActionMover({ pos, angle, speed: 0.1, ...extra });
}

function steps(act: ActionMover, n: number, groundAt?: GroundAt): void {
  for (let i = 0; i < n; i++) act.step(groundAt);
}

/** Within 1e-5, the plan's tolerance for distances. */
function near(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-5);
}

/** How far an angle is from `expected`, the short way round (360 is 0). */
function angleOff(actual: number, expected: number): number {
  const d = Math.abs(actual - expected) % 360;
  return Math.min(d, 360 - d);
}

describe('ActionMover', () => {
  it('runs forward 6 units in 60 steps at angle 90', () => {
    const act = mover(90);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(true);
    steps(act, 60);
    near(act.body.pos[0], 6);
    near(act.body.pos[2], 0);
    expect(act.body.pos[1]).toBe(0);
    expect(act.state).toBe(ObjSta.FMOVE);
    expect(act.motion).toBe(Mti.RUN);
    near(act.delta[0], 0.1);
  });

  it('walks at a quarter of the speed', () => {
    const act = mover(90);
    expect(act.sendActMsg(ActMsg.MODE_WALK)).toBe(true);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(true);
    steps(act, 60);
    near(act.body.pos[0], 1.5);
    expect(act.motion).toBe(Mti.WALK);
  });

  it('walks backward at a fifth', () => {
    const act = mover(90);
    expect(act.sendActMsg(ActMsg.BACKWARD)).toBe(true);
    // OBJMSG_BACKWARD sets MTI_WALK (ActionMoverMsg.cpp:416); the BMOVE state shows MTI_BACK from its first step (:262)
    expect(act.motion).toBe(Mti.WALK);
    steps(act, 60);
    near(act.body.pos[0], -1.2);
    expect(act.motion).toBe(Mti.BACK);
  });

  it('turns 4 degrees a step', () => {
    // AddAngle( 4 ) goes through CObj::SetAngle, which keeps 65536 steps a circle and truncates: a left turn adds
    // 728 steps (3.999 degrees), so 10 steps from 0 make 7280 steps, 39.990234375, the plan's 40.
    const left = mover(0);
    expect(left.sendActMsg(ActMsg.LTURN)).toBe(true);
    steps(left, 10);
    expect(left.body.angle).toBe(7280 * 360 / 65536);
    expect(angleOff(left.body.angle, 40)).toBeLessThan(0.05);
    // 40 is held as 7281 steps; a right turn takes 729 steps a time (truncating toward zero), so 10 steps pass 0
    // by 8 steps and wrap: 359.9560546875, the plan's 0.
    const right = mover(40);
    expect(right.sendActMsg(ActMsg.RTURN)).toBe(true);
    steps(right, 10);
    expect(right.body.angle).toBe(65528 * 360 / 65536);
    expect(angleOff(right.body.angle, 0)).toBeLessThan(0.05);
    expect(right.body.pos).toEqual([0, 0, 0]);
  });

  it('presuppose matches stepping', () => {
    const act = mover(30, [100, 5, 200]);
    act.sendActMsg(ActMsg.FORWARD);
    const predicted = act.presuppose(MAX_CORR_SIZE_45);
    expect(act.body.pos).toEqual([100, 5, 200]);
    steps(act, 22);
    // Equal to the bit here. In general a step's x6.5 round trip (which PresupposePos does not make) can change the
    // last bit of the x/z move, in Neuz as here, and the float position may or may not absorb it.
    expect(predicted.pos).toEqual(act.body.pos);
    expect(predicted.angle).toBe(act.body.angle);
    expect(predicted.delta[0]).toBe(act.delta[0]);
    expect(predicted.delta[2]).toBe(act.delta[2]);
  });

  it('angle 0 runs toward lower D3D z', () => {
    const act = mover(0, [10, 0, 10]);
    act.sendActMsg(ActMsg.FORWARD);
    act.step();
    near(act.body.pos[0], 10);
    near(act.body.pos[2], 9.9);
  });

  it('sendActMsg reports a change once', () => {
    const act = mover(0);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(true);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(false);
  });

  it('stands on the ground it is given', () => {
    const uphill: GroundAt = (x) => 2 + 0.3 * x;
    const act = mover(90, [0, 2, 0]);
    act.sendActMsg(ActMsg.FORWARD);
    for (let i = 0; i < 30; i++) {
      act.step(uphill);
      near(act.body.pos[1], uphill(act.body.pos[0], act.body.pos[2])!);
      expect(act.delta[1]).toBe(0);
    }
    const downhill: GroundAt = (x) => 20 - 0.3 * x;
    act.forceSet({ ...act.report(0n), pos: [0, 20, 0] });
    for (let i = 0; i < 30; i++) {
      act.step(downhill);
      near(act.body.pos[1], downhill(act.body.pos[0], act.body.pos[2])!);
    }
    near(act.body.pos[0], 3);
  });

  it('forceSet sets position, delta, angle, state and motion', () => {
    const act = mover(0);
    const pos: Vec3 = [10, 2, -5];
    const m: MoveReport = {
      pos, delta: [0.05, 0, -0.08], angle: -30, state: ObjSta.FMOVE | ObjSta.LTURN, stateFlag: ObjStaF.WALK,
      motion: Mti.WALK, motionEx: 3, loop: AniLoop.CONT, motionOption: 2, tick: 5n,
    };
    act.forceSet(m);
    expect(act.body.pos).toEqual([10, 2, -5]);
    expect(act.body.pos).not.toBe(pos);
    expect(act.delta).toEqual([Math.fround(0.05), 0, Math.fround(-0.08)]); // m_vDelta is a D3DXVECTOR3 of floats
    expect(act.body.angle).toBe(wrapAngle(-30));
    expect(act.body.angle).toBeCloseTo(330, 2);
    expect(act.state).toBe(ObjSta.FMOVE | ObjSta.LTURN);
    expect(act.stateFlag).toBe(ObjStaF.WALK);
    expect(act.motion).toBe(Mti.WALK);
    expect(act.motionEx).toBe(3);
    expect(act.loop).toBe(AniLoop.CONT);
    expect(act.motionOption).toBe(2);
    // the forced state goes on: a walk (a quarter of 0.1) while turning left
    act.step();
    near(act.body.pos[0], 10 + Math.sin(wrapAngle(-30) * Math.PI / 180) * 0.025);
    expect(act.body.angle).toBe(wrapAngle(wrapAngle(-30) + 4));
  });
});

describe('ActionMover: the rest of the copied rules', () => {
  it('wraps every angle as CObj::SetAngle does', () => {
    // (360 / 65536) * ((int)(fAngle * (65536 / 360.0)) & 65535): the wire's raw angles, such as -45.5, come out in 0..360
    expect(wrapAngle(-45.5)).toBe(314.5001220703125);
    expect(wrapAngle(365)).toBe(4.998779296875);
    expect(wrapAngle(360)).toBe(0);
    expect(wrapAngle(720)).toBe(0);
    expect(wrapAngle(90)).toBe(90);
    expect(wrapAngle(30)).toBe(29.9981689453125);
    expect(mover(-45.5).body.angle).toBe(314.5001220703125);
    const act = mover(0);
    act.forceSet({ ...act.report(0n), angle: 365 });
    expect(act.body.angle).toBe(4.998779296875);
  });

  it('a mover with no state stands at its first step', () => {
    const act = mover(0);
    expect(act.state).toBe(0);
    act.step();
    expect(act.state).toBe(ObjSta.STAND);
    expect(act.motion).toBe(Mti.STAND);
    expect(act.sendActMsg(ActMsg.STAND)).toBe(false);
  });

  it('STAND stops a move with a new state, STOP without one and clears the destination', () => {
    const act = mover(90);
    let cleared = 0;
    act.clearDest = () => { cleared++; };
    act.sendActMsg(ActMsg.FORWARD);
    act.step();
    expect(act.sendActMsg(ActMsg.STAND)).toBe(true);
    expect(act.state).toBe(ObjSta.STAND);
    expect(act.motion).toBe(Mti.STAND);
    expect(act.delta[0]).toBe(0);
    act.sendActMsg(ActMsg.FORWARD);
    // ProcessActMsg1 returns 0 for STOP (ActionMoverMsg.cpp:152), so it never reports a change
    expect(act.sendActMsg(ActMsg.STOP)).toBe(false);
    expect(act.state).toBe(0);
    expect(cleared).toBe(1);
    const x = act.body.pos[0];
    act.step();
    expect(act.body.pos[0]).toBe(x);
    expect(act.state).toBe(ObjSta.STAND);
  });

  it('a turn while running moves on the angle the step started with', () => {
    const act = mover(0);
    act.sendActMsg(ActMsg.FORWARD);
    act.sendActMsg(ActMsg.LTURN);
    act.step();
    near(act.body.pos[0], 0);
    near(act.body.pos[2], -0.1);
    expect(act.body.angle).toBe(728 * 360 / 65536);
    expect(act.state).toBe(ObjSta.FMOVE | ObjSta.LTURN);
  });

  it('STOP_TURN, MODE_WALK and MODE_RUN report a change once', () => {
    const act = mover(0);
    expect(act.sendActMsg(ActMsg.STOP_TURN)).toBe(false);
    act.sendActMsg(ActMsg.RTURN);
    expect(act.sendActMsg(ActMsg.RTURN)).toBe(false);
    expect(act.sendActMsg(ActMsg.LTURN)).toBe(true);
    expect(act.state).toBe(ObjSta.LTURN);
    expect(act.sendActMsg(ActMsg.STOP_TURN)).toBe(true);
    expect(act.sendActMsg(ActMsg.STOP_TURN)).toBe(false);
    expect(act.sendActMsg(ActMsg.MODE_RUN)).toBe(false);
    expect(act.sendActMsg(ActMsg.MODE_WALK)).toBe(true);
    expect(act.sendActMsg(ActMsg.MODE_WALK)).toBe(false);
    expect(act.stateFlag).toBe(ObjStaF.WALK);
    expect(act.sendActMsg(ActMsg.MODE_RUN)).toBe(true);
    expect(act.sendActMsg(ActMsg.MODE_RUN)).toBe(false);
    expect(act.stateFlag).toBe(0);
  });

  it('ignores messages outside ActMsg', () => {
    const act = mover(0);
    const OBJMSG_ASTOP = 7;
    const OBJMSG_JUMP = 17;
    expect(act.sendActMsg(OBJMSG_JUMP)).toBe(false);
    expect(act.sendActMsg(OBJMSG_ASTOP)).toBe(false);
    expect(act.state).toBe(0);
  });

  it('sits down and stands up as the motions end', () => {
    const act = mover(0);
    act.step();
    expect(act.sendActMsg(ActMsg.SITDOWN)).toBe(true);
    expect(act.state).toBe(ObjSta.SIT);
    expect(act.stateFlag).toBe(ObjStaF.SIT);
    expect(act.motion).toBe(Mti.SIT);
    expect(act.loop).toBe(AniLoop.CONT);
    expect(act.sendActMsg(ActMsg.SITDOWN)).toBe(false);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(false);
    expect(act.sendActMsg(ActMsg.LTURN)).toBe(false);
    act.step();
    expect(act.motion).toBe(Mti.SITSTAND);
    expect(act.loop).toBe(AniLoop.LOOP);
    expect(act.sendActMsg(ActMsg.STANDUP)).toBe(true);
    expect(act.motion).toBe(Mti.GETUP);
    expect(act.state).toBe(ObjSta.SIT);
    expect(act.stateFlag).toBe(ObjStaF.SIT);
    act.step();   // the get-up motion ended: the sitting state ends with it
    expect(act.state).toBe(0);
    expect(act.stateFlag).toBe(0);
    act.step();
    expect(act.state).toBe(ObjSta.STAND);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(true);
    expect(act.sendActMsg(ActMsg.STANDUP)).toBe(false);
  });

  it('waits for a motion to end while isEndFrame says it has not', () => {
    const act = mover(0);
    let ended = false;
    act.isEndFrame = () => ended;
    act.sendActMsg(ActMsg.SITDOWN);
    steps(act, 5);
    expect(act.motion).toBe(Mti.SIT);
    ended = true;
    act.step();
    expect(act.motion).toBe(Mti.SITSTAND);
  });

  it('a player falls to the ground in the falling state and lands', () => {
    const flat: GroundAt = () => 0;
    const act = mover(0, [0, 5, 0], { isPlayer: true });
    const seen = new Set<number>();
    for (let i = 0; i < 80; i++) {
      act.step(flat);
      seen.add(act.state & ObjSta.JUMP_ALL);
      if (act.state & ObjSta.JUMP_ALL) expect(act.sendActMsg(ActMsg.FORWARD)).toBe(false);
    }
    expect(seen.has(ObjSta.SJUMP3)).toBe(true);
    expect(seen.has(ObjSta.SJUMP4)).toBe(true);
    expect(act.body.pos[1]).toBe(0);
    expect(act.delta[1]).toBe(0);
    expect(act.state).toBe(ObjSta.STAND);
    expect(act.motion).toBe(Mti.STAND);
    expect(act.sendActMsg(ActMsg.FORWARD)).toBe(true);
  });

  it('a monster falls and lands without the falling state', () => {
    const act = mover(0, [0, 5, 0]);
    for (let i = 0; i < 80; i++) {
      act.step(() => 0);
      expect(act.state & ObjSta.JUMP_ALL).toBe(0);
      // m_vDelta.y -= 0.005f six times in floats (in doubles it would round to -0.029999999329447746)
      if (i === 5) expect(act.delta[1]).toBe(-0.029999997466802597);
    }
    expect(act.body.pos[1]).toBe(0);
    expect(act.delta[1]).toBe(0);
  });

  it('lands at once on ground within 0.25 under its feet, and falls to ground further down', () => {
    // ProcessCollisionGround (ActionMoverCollision.cpp:306-323): after gravity's first 0.005, ground 0.245 down is caught
    const low = mover(0, [0, 0.2, 0]);
    low.step(() => 0);
    expect(low.body.pos[1]).toBe(0);
    // From 0.3 the fall is 0.005, 0.01, 0.015, 0.02 in floats: at step 4 the float y is 0.25000003, still above
    // 0.25 (in doubles it would be 0.24999999999999997 and land a step early); step 5 lands.
    const high = mover(0, [0, 0.3, 0]);
    const ys: number[] = [];
    for (let i = 0; i < 5; i++) {
      high.step(() => 0);
      ys.push(high.body.pos[1]);
      if (i === 0) near(high.delta[1], -0.005);
    }
    near(ys[0]!, 0.295);
    near(ys[1]!, 0.285);
    near(ys[2]!, 0.27);
    expect(ys[3]).toBe(0.2500000298023224);
    expect(ys[4]).toBe(0);
    expect(high.delta[1]).toBe(0);
  });

  it('runs in float steps at real world coordinates, as Neuz does', () => {
    // at x = 6968.5 floats are 1/2048 apart, so each 0.1f step adds 205 of them, 0.10009765625: 60.0586 in 600 steps
    // where doubles would make 60. z (3200) does not see the float cos(90 degrees)'s 4e-9 at all.
    const act = new ActionMover({ pos: [6968.5, 0, 3200], angle: 90, speed: Math.fround(0.1) });
    act.sendActMsg(ActMsg.FORWARD);
    steps(act, 600, () => 0);
    expect(act.body.pos[0]).toBe(7028.55859375);
    expect(act.body.pos[2]).toBe(3200);
  });

  it('moves through the collision test\'s x6.5 and back, which PresupposePos does not', () => {
    // at angle 30 (held as 29.998...) sinf * 0.1f is 0.0499972365796566; x 6.5f, then x (1.0f / 6.5f), it is one bit more
    const act = mover(30);
    act.sendActMsg(ActMsg.FORWARD);
    const predicted = act.presuppose(1);
    act.step();
    expect(predicted.pos[0]).toBe(0.0499972365796566);
    expect(act.delta[0]).toBe(0.0499972365796566);
    expect(act.body.pos[0]).toBe(0.0499972403049469);
  });

  it('falls when its height is changed in place, as m_vPosLast is its own copy', () => {
    const act = mover(0);
    steps(act, 3, () => 0);
    expect(act.body.pos[1]).toBe(0);
    act.body.pos[1] = 5; // as SetPos would put it there
    act.step(() => 0);
    expect(act.body.pos[1]).toBe(Math.fround(5 - Math.fround(0.005)));
    steps(act, 60, () => 0);
    expect(act.body.pos[1]).toBe(0);
  });

  it('does not move where there is no ground', () => {
    const act = mover(90);
    act.sendActMsg(ActMsg.FORWARD);
    steps(act, 20, (x) => (x < 0.95 ? 0 : null));
    near(act.body.pos[0], 0.9);
    expect(act.state).toBe(ObjSta.FMOVE);
  });

  it('presuppose turns by whole degrees and leaves the mover as it is', () => {
    // PresupposePos (ActionMover.cpp:417-426) adds 4 to its own float, without CObj::SetAngle
    const left = mover(0);
    left.sendActMsg(ActMsg.LTURN);
    expect(left.presuppose(22).angle).toBe(88);
    const right = mover(0);
    right.sendActMsg(ActMsg.RTURN);
    const p = right.presuppose(22);
    expect(p.angle).toBe(272);
    expect(p.pos).toEqual([0, 0, 0]);
    expect(p.delta).toEqual([0, 0, 0]);
    expect(right.body.angle).toBe(0);
    expect(right.state).toBe(ObjSta.RTURN);
  });

  it('forceSet keeps a sitting mover sitting, but still places it', () => {
    const act = mover(0);
    act.sendActMsg(ActMsg.SITDOWN);
    act.forceSet({
      pos: [1, 2, 3], delta: [0.1, 0, 0], angle: 90, state: ObjSta.FMOVE, stateFlag: 0, motion: Mti.RUN, motionEx: 0,
      loop: AniLoop.LOOP, motionOption: 0, tick: 0n,
    });
    // CActionMover::ForcedSet returns at once when the sitting flag would change (ActionMoverMsg.cpp:45-48)
    expect(act.state).toBe(ObjSta.SIT);
    expect(act.stateFlag).toBe(ObjStaF.SIT);
    expect(act.delta).toEqual([0, 0, 0]);
    expect(act.motionEx).toBe(-1);
    expect(act.body.pos).toEqual([1, 2, 3]);
    expect(act.body.angle).toBe(90);
    expect(act.motion).toBe(Mti.RUN);
  });

  it('report gives what SendPlayerBehavior sends', () => {
    const act = mover(90, [1, 2, 3]);
    act.sendActMsg(ActMsg.FORWARD);
    act.step();
    const r = act.report(123n);
    expect(r.pos[0]).toBe(Math.fround(1 + Math.fround(0.1)));
    expect(r.pos.slice(1)).toEqual([2, 3]);
    expect(r.pos).not.toBe(act.body.pos);
    expect(r.delta).toEqual(act.delta);
    expect(r.delta).not.toBe(act.delta);
    expect(r).toMatchObject({
      angle: 90, state: ObjSta.FMOVE, stateFlag: 0, motion: Mti.RUN, motionEx: -1, loop: AniLoop.LOOP, motionOption: 0,
      tick: 123n,
    });
  });
});
