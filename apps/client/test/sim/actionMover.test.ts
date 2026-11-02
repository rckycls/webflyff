import { describe, expect, it } from 'vitest';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { ActionMover, motionFor, wrapAngle } from '../../src/world/sim/ActionMover';
import type { MotionHand, MoverBody } from '../../src/world/sim/ActionMover';
import { terrainGround } from '../../src/world/sim/collision';
import { ActMsg, AniLoop, Ik3, MAX_CORR_SIZE_45, Mop, Mti, ObjSta, ObjStaF } from '../../src/world/sim/constants';

/** A terrain's height under D3D x, z (null where there is none): these tests' grounds have no objects. */
type GroundAt = (x: number, z: number) => number | null;

/** Flat terrain at height 0. */
const FLAT = terrainGround(() => 0);

describe('native standing jump', () => {
  it('reports jump start, rises, falls and lands without allowing another jump in flight', () => {
    const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: 0.1, isPlayer: true });
    act.step(FLAT);
    expect(act.sendActMsg(17)).toBe(true); // OBJMSG_JUMP
    expect(act.report(1n).state & 0xf000).toBe(0x5000);
    expect(act.motion).toBe(13); // MTI_JUMP1
    act.step(FLAT);
    expect(act.motion).toBe(14);
    expect(act.body.pos[1]).toBeGreaterThan(0);
    expect(act.sendActMsg(17)).toBe(false);
    let peak = 0;
    let falling = false;
    for (let i = 0; i < 120; i++) {
      act.step(FLAT);
      peak = Math.max(peak, act.body.pos[1]);
      falling ||= (act.state & 0xf000) === 0x7000;
    }
    expect(peak).toBeGreaterThan(3);
    expect(falling).toBe(true);
    expect(act.body.pos[1]).toBe(0);
    expect(act.state & 0xf000).toBe(0);
  });

  it('does not jump while sitting, hurt, dead or attacking', () => {
    for (const state of [ObjSta.ATK1, ObjSta.DMG, ObjSta.DEAD, ObjSta.SIT]) {
      const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: 0.1 });
      act.state = state;
      if (state === ObjSta.SIT) act.stateFlag |= ObjStaF.SIT;
      expect(act.sendActMsg(17)).toBe(false);
    }
  });
});

/** A mover at `pos` facing `angle`, whose `CMover::GetSpeed` is 0.1 per step (the plan's test speed). */
function mover(angle: number, pos: Vec3 = [0, 0, 0], extra: Partial<MoverBody> = {}): ActionMover {
  return new ActionMover({ pos, angle, speed: 0.1, ...extra });
}

function steps(act: ActionMover, n: number, groundAt?: GroundAt): void {
  for (let i = 0; i < n; i++) act.step(groundAt && terrainGround(groundAt));
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
      act.step(terrainGround(uphill));
      near(act.body.pos[1], uphill(act.body.pos[0], act.body.pos[2])!);
      expect(act.delta[1]).toBe(0);
    }
    const downhill: GroundAt = (x) => 20 - 0.3 * x;
    act.forceSet({ ...act.report(0n), pos: [0, 20, 0] });
    for (let i = 0; i < 30; i++) {
      act.step(terrainGround(downhill));
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
      act.step(terrainGround(flat));
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
      act.step(FLAT);
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
    low.step(FLAT);
    expect(low.body.pos[1]).toBe(0);
    // From 0.3 the fall is 0.005, 0.01, 0.015, 0.02 in floats: at step 4 the float y is 0.25000003, still above
    // 0.25 (in doubles it would be 0.24999999999999997 and land a step early); step 5 lands.
    const high = mover(0, [0, 0.3, 0]);
    const ys: number[] = [];
    for (let i = 0; i < 5; i++) {
      high.step(FLAT);
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
    act.step(FLAT);
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

  it('TURNMOVE turns to a whole-degree angle and runs, unless already running at it', () => {
    const act = mover(0);
    act.sendActMsg(ActMsg.LTURN);
    expect(act.sendActMsg(ActMsg.TURNMOVE, 90)).toBe(true);
    expect(act.body.angle).toBe(90);
    expect(act.state).toBe(ObjSta.FMOVE); // STOP_TURN, then FORWARD
    expect(act.motion).toBe(Mti.RUN);
    // FMOVE and (int)GetAngle() == nParam1: nothing to do (ActionMoverMsg.cpp:254)
    expect(act.sendActMsg(ActMsg.TURNMOVE, 90)).toBe(false);
    // 30 is held as 29.998...: (int) gives 29, so each TURNMOVE 30 sets it again
    expect(act.sendActMsg(ActMsg.TURNMOVE, 30)).toBe(true);
    expect(act.body.angle).toBe(wrapAngle(30));
    expect(act.sendActMsg(ActMsg.TURNMOVE, 30)).toBe(true);
    // a falling player is turned, but FORWARD refuses to run
    const falling = mover(0, [0, 5, 0], { isPlayer: true });
    for (let i = 0; i < 60 && (falling.state & ObjSta.JUMP_ALL) === 0; i++) falling.step(FLAT);
    expect(falling.state & ObjSta.JUMP_ALL).toBe(ObjSta.SJUMP3);
    expect(falling.sendActMsg(ActMsg.TURNMOVE, 45)).toBe(true);
    expect(falling.body.angle).toBe(wrapAngle(45));
    expect(falling.state & ObjSta.MOVE_ALL).not.toBe(ObjSta.FMOVE);
  });

  it('forceSet says whether ForcedSet took the state', () => {
    const act = mover(0);
    expect(act.forceSet({ ...act.report(0n), state: ObjSta.FMOVE })).toBe(true);
    act.sendActMsg(ActMsg.STOP);
    act.sendActMsg(ActMsg.SITDOWN);
    expect(act.forceSet({ ...act.report(0n), state: ObjSta.STAND, stateFlag: 0 })).toBe(false);
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

/** The fists' attack speed of a level 1 Vagrant with 15 DEX (`attackSpeed` of `params.ts`; plan-header's reference). */
const FISTS_SPEED = Math.fround(0.8416128754615784);

/** A player body's hand holding a one-handed sword (the Wooden Sword's `IK3_SWD`, `HD_ONE`). */
const SWORD: MotionHand = { kind3: Ik3.SWD, twoHanded: false, dual: false, master: false, psykeeper: false };

/**
 * A player (object 1) at the origin facing north and an Aibatt (object 2) 2 m east of it, each finding the other as
 * `prj.GetMover` would; both would swing at the fists' speed (only the player does: `ProcessAniSpeed`).
 */
function fight(): { player: ActionMover; monster: ActionMover; byId: Map<number, ActionMover> } {
  const player = mover(0, [0, 0, 0], { isPlayer: true });
  const monster = mover(0, [2, 0, 0]);
  const byId = new Map([[1, player], [2, monster]]);
  for (const act of [player, monster]) {
    act.findMover = (id) => byId.get(id);
    act.attackSpeed = () => FISTS_SPEED;
  }
  return { player, monster, byId };
}

describe('ActionMover: attacks, damage and death', () => {
  it('ATK1 swings at its target: OBJSTA_ATK1, the combat flag and MTI_ATK1, a one-handed sword\'s 223', () => {
    const { player } = fight();
    expect(player.sendActMsg(ActMsg.ATK1, 2)).toBe(true);
    expect(player.state).toBe(ObjSta.STAND | ObjSta.ATK1);
    expect(player.stateFlag).toBe(ObjStaF.COMBAT);
    expect(player.motion).toBe(Mti.ATK1);
    expect(player.loop).toBe(AniLoop.ONE_PLAY);
    expect(player.motionOption).toBe(Mop.SWDFORCE | Mop.NO_TRANS);
    expect(motionFor(player.motion, SWORD, player.stateFlag, player.motionOption)).toBe(223);
    // it faces the target, 2 m east (GetDegree), and swings at its attack speed
    expect(player.body.angle).toBe(90);
    expect(player.targetId).toBe(2);
    expect(player.aniSpeed).toBe(FISTS_SPEED);
    // while it swings, another swing is refused (0: OnMeleeAttack keeps it), and so are moves and turns
    expect(player.sendActMsg(ActMsg.ATK2, 2)).toBe(false);
    expect(player.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect(player.sendActMsg(ActMsg.FORWARD)).toBe(false);
    expect(player.sendActMsg(ActMsg.LTURN)).toBe(false);
    expect(player.state).toBe(ObjSta.STAND | ObjSta.ATK1);
  });

  it('a swing starts m_nAtkCnt, one more each step: IsAttackMode for its 600 steps (10 s), and not before any swing', () => {
    const { player } = fight();
    expect(player.isAttackMode()).toBe(false);
    player.step(); // never swung: the count stays 0 (Mover.cpp:3872)
    expect(player.atkCnt).toBe(0);
    expect(player.sendActMsg(ActMsg.ATK1, 2)).toBe(true);
    expect(player.atkCnt).toBe(1); // ActionMoverMsg.cpp:685
    expect(player.isAttackMode()).toBe(true);
    for (let i = 0; i < 598; i++) player.step();
    expect(player.atkCnt).toBe(599);
    expect(player.isAttackMode()).toBe(true);
    player.step(); // m_nAtkCnt < SEC1 * 10 no more (Mover.cpp:9229)
    expect(player.isAttackMode()).toBe(false);
    // a refused swing does not start it again
    expect(player.sendActMsg(ActMsg.ATK1, 99)).toBe(false);
    expect(player.isAttackMode()).toBe(false);
  });

  it('ATK refuses a target out of view or dead, clears a flinch and is refused in any other damage state', () => {
    const { player, monster } = fight();
    expect(player.sendActMsg(ActMsg.ATK1, 99)).toBe(false);
    expect(player.state).toBe(0);
    monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, 1);
    expect(player.sendActMsg(ActMsg.ATK1, 2)).toBe(false);
    expect(player.stateFlag).toBe(0);
    // a flinch ends for the swing (ActionMoverMsg.cpp:640-641)
    const fresh = fight();
    fresh.player.setDamaged();
    expect(fresh.player.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG);
    expect(fresh.player.sendActMsg(ActMsg.ATK1, 2)).toBe(true);
    expect(fresh.player.state).toBe(ObjSta.STAND | ObjSta.ATK1);
    // a knock-back, or death, refuses it (:642-644)
    fresh.monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE_FORCE, 1);
    expect(fresh.monster.sendActMsg(ActMsg.ATK1, 1)).toBe(false);
    expect(fresh.monster.state).toBe(ObjSta.DMG_FLY);
  });

  it('calls onHit as the model passes a hit frame, but not while paused, and not at a target dead with no HP', () => {
    const { player, monster } = fight();
    let hit = -1;
    player.isAttrHit = () => hit;
    player.isEndFrame = () => false;
    const hits: [number, number][] = [];
    player.onHit = (index, state) => hits.push([index, state]);
    player.sendActMsg(ActMsg.ATK3, 2);
    player.step();
    expect(hits).toEqual([]);
    hit = 1;
    player.step();
    expect(hits).toEqual([[1, ObjSta.ATK3]]);
    // OnAttackMelee pauses a player's model 5 steps; each step counts one off and tests no hit (ActionMoverState.cpp:953-1031)
    player.pause(5);
    for (let left = 4; left >= 0; left--) {
      player.step();
      expect(player.paused).toBe(left);
    }
    expect(hits).toHaveLength(1);
    player.step();
    expect(hits).toHaveLength(2);
    // IsLive (Mover.h:1222): a dead target with HP left is still hit, one with none is not
    monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, 1);
    monster.hitPoint = () => 3;
    player.step();
    expect(hits).toHaveLength(3);
    monster.hitPoint = () => 0;
    player.step();
    expect(hits).toHaveLength(3);
    // a new motion ends a pause (SetMotion loads it: InitAnimate, Model.h:125-136)
    player.pause(5);
    player.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, 2);
    expect(player.paused).toBe(0);
  });

  it('ends the swing at its last frame and says so, still testing the hit in that step', () => {
    const { player } = fight();
    let ended = false;
    let hit = -1;
    player.isEndFrame = () => ended;
    player.isAttrHit = () => hit;
    const hits: number[] = [];
    const ends: number[] = [];
    player.onHit = (index) => hits.push(index);
    player.onAttackEnd = (state) => ends.push(state);
    player.sendActMsg(ActMsg.ATK2, 2);
    player.step();
    expect(ends).toEqual([]);
    ended = true;
    hit = 0;
    player.step();
    expect(ends).toEqual([ObjSta.ATK2]);
    expect(hits).toEqual([0]);
    expect(player.state).toBe(ObjSta.STAND);
    // the next step stands, at speed 1 again
    hit = -1;
    player.step();
    expect(player.aniSpeed).toBe(1);
    expect(player.motion).toBe(Mti.STAND);
  });

  it('a busy mover keeps a MELEE_ATTACK and swings it as its swing ends (OnMeleeAttack, OnEndAttackState)', () => {
    const { monster, byId } = fight();
    let ended = false;
    monster.isEndFrame = () => ended;
    const ends: number[] = [];
    monster.onAttackEnd = (state) => ends.push(state);
    expect(monster.meleeAttack(ActMsg.ATK1, 1)).toBe(true);
    expect(monster.meleeAttack(ActMsg.ATK1, 1)).toBe(false);
    monster.step();
    const started = monster.motionSets;
    ended = true;
    monster.step();
    // the kept swing starts as the first ends: the same motion, set again
    expect(ends).toEqual([ObjSta.ATK1]);
    expect(monster.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect(monster.motion).toBe(Mti.ATK1);
    expect(monster.motionSets).toBe(started + 1);
    monster.step();
    expect(ends).toEqual([ObjSta.ATK1, ObjSta.ATK1]);
    expect(monster.state & ObjSta.ATK_ALL).toBe(0);
    // a kept swing whose target left is dropped and the next one swings (ActionMover.cpp:39-56)
    const other = mover(0, [0, 0, 2]);
    byId.set(3, other);
    ended = false;
    monster.meleeAttack(ActMsg.ATK1, 1);
    monster.meleeAttack(ActMsg.ATK2, 1);
    monster.meleeAttack(ActMsg.ATK3, 3);
    byId.delete(1);
    ended = true;
    monster.step();
    expect(monster.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK3);
    expect(monster.targetId).toBe(3);
    // a message this copy does not take (a special attack, OBJMSG_SP_ATK1 33) is not kept to block the rest
    const OBJMSG_SP_ATK1 = 33;
    expect(monster.meleeAttack(OBJMSG_SP_ATK1, 3)).toBe(false);
    monster.step();
    expect(monster.state & ObjSta.ATK_ALL).toBe(0);
  });

  it('setDamaged flinches a standing mover (MTI_DMG1 + random(2)), but plays nothing while it attacks', () => {
    const { player, monster } = fight();
    monster.rand = () => 7; // rand() % 2 = 1
    monster.step();
    monster.setDamaged();
    expect(monster.state).toBe(ObjSta.STAND | ObjSta.DMG);
    expect(monster.motion).toBe(Mti.DMG2);
    expect(monster.loop).toBe(AniLoop.ONE_PLAY);
    monster.step(); // the flinch ends with its motion
    expect(monster.state).toBe(ObjSta.STAND);
    player.sendActMsg(ActMsg.ATK1, 2);
    const sets = player.motionSets;
    player.setDamaged();
    expect(player.motion).toBe(Mti.ATK1);
    expect(player.motionSets).toBe(sets);
    expect(player.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    // Neuz marks the hit all the same: SetState comes before the test (MoverAttack.cpp:2036-2049)
    expect(player.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG);
    // a mover knocked flying is left alone (:2018-2019)
    const flying = fight();
    flying.monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE_FORCE, 1);
    const flySets = flying.monster.motionSets;
    flying.monster.setDamaged();
    expect(flying.monster.state).toBe(ObjSta.DMG_FLY);
    expect(flying.monster.motionSets).toBe(flySets);
  });

  it('DIE with DAMAGE or 0 lies dead in MTI_DIE1, held on its last frame', () => {
    for (const how of [ActMsg.DAMAGE, 0]) {
      const { player, monster } = fight();
      player.sendActMsg(ActMsg.ATK1, 2);
      monster.sendActMsg(ActMsg.FORWARD);
      monster.step(FLAT);
      expect(monster.sendActMsg(ActMsg.DIE, how, 1)).toBe(true);
      expect(monster.state).toBe(ObjSta.DEAD);
      expect(monster.motion).toBe(Mti.DIE1);
      expect(monster.loop).toBe(AniLoop.CONT);
      expect(monster.delta[0]).toBe(0);
      const at = [...monster.body.pos];
      steps(monster, 30, () => 0);
      expect(monster.body.pos).toEqual(at);
      expect(monster.state).toBe(ObjSta.DEAD);
      expect(monster.motion).toBe(Mti.DIE1);
      // the dead state keeps the last frame however the model was left (ActionMoverState.cpp:532-533)
      monster.loop = AniLoop.LOOP;
      monster.step(FLAT);
      expect(monster.loop).toBe(AniLoop.CONT);
      // the dead neither move, turn, stand nor swing
      expect(monster.sendActMsg(ActMsg.FORWARD)).toBe(false);
      expect(monster.sendActMsg(ActMsg.LTURN)).toBe(false);
      expect(monster.sendActMsg(ActMsg.STAND)).toBe(false);
      expect(monster.sendActMsg(ActMsg.ATK1, 1)).toBe(false);
      expect(monster.state).toBe(ObjSta.DEAD);
      // dying ends a swing
      expect(player.sendActMsg(ActMsg.DIE, how, 2)).toBe(true);
      expect(player.state).toBe(ObjSta.DEAD);
      expect(player.motion).toBe(Mti.DIE1);
    }
  });

  it('DIE with DAMAGE_FORCE knocks the mover flying the way the attacker faces, then down, then dead', () => {
    const { player, monster } = fight();
    player.sendActMsg(ActMsg.ATK1, 2); // faces east
    steps(monster, 3, () => 0);
    expect(monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE_FORCE, 1)).toBe(true);
    expect(monster.state).toBe(ObjSta.DMG_FLY);
    expect(monster.motion).toBe(Mti.DMGFLY);
    expect(monster.loop).toBe(AniLoop.CONT);
    // DoDamageFly( 90, 145, 0.25 ) (ActionMover.cpp:446-454): up by -cos(145) * 0.25, east by sin(145) * 0.25 a step
    expect(monster.delta[1]).toBe(Math.fround(0.20478801429271698));
    const x0 = monster.body.pos[0];
    const seen: number[] = [];
    let flown = 0;
    for (let i = 0; i < 200 && monster.state !== ObjSta.DEAD; i++) {
      if (monster.state === ObjSta.DMG_FLY) flown++;
      monster.step(FLAT);
      if (seen.at(-1) !== monster.state) seen.push(monster.state);
    }
    // aloft with no friction, down on the ground, then dead: it has no HP. The step that finds it landed moves it no more.
    expect(seen).toEqual([ObjSta.DMG_FLY, ObjSta.DMG_DIE, ObjSta.DEAD]);
    near(monster.body.pos[0] - x0, (flown - 1) * 0.1433941125869751);
    near(monster.body.pos[2], 0);
    expect(monster.motion).toBe(Mti.DMGDIE);
    const at = [...monster.body.pos];
    steps(monster, 30, () => 0);
    expect(monster.body.pos[0]).toBe(at[0]);
    expect(monster.body.pos[1]).toBe(0);
  });

  it('a mover knocked down with HP left gets up (OBJSTA_DMG_LIVE) and stands', () => {
    const { monster } = fight();
    monster.hitPoint = () => 40;
    monster.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE_FORCE, 1);
    const seen: number[] = [];
    for (let i = 0; i < 200 && monster.state !== ObjSta.STAND; i++) {
      monster.step(FLAT);
      if (seen.at(-1) !== monster.state) seen.push(monster.state);
    }
    expect(seen).toEqual([ObjSta.DMG_FLY, ObjSta.DMG_DIE, ObjSta.DMG_LIVE, 0, ObjSta.STAND]);
    expect(monster.motion).toBe(Mti.STAND);
  });

  it('a player swings at its attack speed and a monster at 1.0, as ProcessAniSpeed sets them', () => {
    const { player, monster } = fight();
    monster.sendActMsg(ActMsg.ATK1, 1);
    expect(monster.aniSpeed).toBe(1);
    monster.isEndFrame = () => false;
    monster.step();
    expect(monster.aniSpeed).toBe(1);
    expect(monster.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    player.sendActMsg(ActMsg.ATK1, 2);
    expect(player.aniSpeed).toBe(FISTS_SPEED);
    player.step(); // the swing ends at once: no model plays it
    expect(player.aniSpeed).toBe(FISTS_SPEED);
    expect(player.state & ObjSta.ATK_ALL).toBe(0);
    player.step();
    expect(player.aniSpeed).toBe(1);
  });

  it('MODE_COMBAT sets the combat flag and the standing motion again, once', () => {
    const act = mover(0);
    act.step();
    const sets = act.motionSets;
    expect(act.sendActMsg(ActMsg.MODE_COMBAT)).toBe(true);
    expect(act.stateFlag).toBe(ObjStaF.COMBAT);
    expect(act.motion).toBe(Mti.STAND);
    // m_dwMotion = -1 first, so that the weapon's standing motion is loaded (ActionMoverMsg.cpp:1018-1019)
    expect(act.motionSets).toBe(sets + 1);
    expect(act.sendActMsg(ActMsg.MODE_COMBAT)).toBe(false);
    const sitting = mover(0);
    sitting.sendActMsg(ActMsg.SITDOWN);
    expect(sitting.sendActMsg(ActMsg.MODE_COMBAT)).toBe(false);
    expect(sitting.stateFlag).toBe(ObjStaF.SIT);
  });
});

/**
 * A fake model of `frames` frames that moves 0.5 a step at speed 1 (a `.ani` at 30 fps: `perSlerp` 0.5), held while the
 * rules pause it and started again at each motion set, as `MoverViews` moves a model; `hits` are the motion's `MA_HIT`
 * frames, one passed when the last move went from below it to it or past it within its frame (`CMotion::IsAttrHit`,
 * `Bone.h:162-169`). `move` is the frame move that follows each rules step.
 */
function fakeModel(act: ActionMover, frames: number, hits: readonly number[]): { frame: () => number; move: () => void } {
  let sets = act.motionSets;
  let current = 0;
  let old = -1;
  act.modelFrame = () => ({ current: sets === act.motionSets ? current : 0, max: frames });
  act.isAttrHit = () => {
    const [o, c] = sets === act.motionSets ? [old, current] : [-1, 0];
    return hits.findIndex((h) => Math.trunc(h) === Math.trunc(c) && o < h && h <= c);
  };
  act.isEndFrame = () => sets === act.motionSets && current >= frames - 1;
  return {
    frame: () => current,
    move: () => {
      if (sets !== act.motionSets) {
        sets = act.motionSets;
        current = 0;
        old = -1;
      }
      if (act.paused > 0) return;
      old = current;
      current = Math.min(current + 0.5 * act.aniSpeed, frames - 1);
    },
  };
}

describe('ActionMover: melee skills (OBJMSG_MELEESKILL, ProcessStateMeleeSkill)', () => {
  it('MELEESKILL clears every state and plays the skill motion as it is: OBJSTA_ATK_MELEESKILL, MOP_FIXED, at 1.0', () => {
    const { player } = fight();
    player.sendActMsg(ActMsg.MODE_COMBAT);
    player.step();
    expect(player.state).toBe(ObjSta.STAND);
    const sets = player.motionSets;
    expect(player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2)).toBe(true);
    // ClearState, then the skill's state alone (ActionMoverMsg.cpp:746-753): no standing state is left
    expect(player.state).toBe(ObjSta.ATK_MELEESKILL);
    expect(player.motion).toBe(Mti.VAG_ONE_CLEANHIT);
    expect(player.motionSets).toBe(sets + 1);
    expect(player.loop).toBe(AniLoop.ONE_PLAY);
    expect(player.motionOption).toBe(Mop.SWDFORCE | Mop.NO_TRANS | Mop.FIXED);
    // MOP_FIXED: the sword's set is not added in combat (Mover.cpp:4822)
    expect(motionFor(player.motion, SWORD, player.stateFlag, player.motionOption)).toBe(Mti.VAG_ONE_CLEANHIT);
    player.modelFrame = () => ({ current: 0, max: 51 });
    player.step();
    // ProcessAniSpeed lists no melee-skill state: 1.0, not the attack speed (Mover.cpp:3084-3119)
    expect(player.aniSpeed).toBe(1);
    expect(player.state).toBe(ObjSta.ATK_MELEESKILL);
    // the same skill again starts its motion again (m_dwMotion = -1 first)
    expect(player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2)).toBe(true);
    expect(player.motionSets).toBe(sets + 2);
  });

  it('MELEESKILL is refused (-2) at a target out of view and in an action, and leaves the state as it was', () => {
    const { player } = fight();
    player.step();
    expect(player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 99)).toBe(false);
    expect(player.state).toBe(ObjSta.STAND);
    expect(player.motion).toBe(Mti.STAND);
    player.state |= ObjSta.COLLECT; // an action state (OBJSTA_ACTION_ALL)
    expect(player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2)).toBe(false);
    expect(player.state & ObjSta.ATK_ALL).toBe(0);
  });

  it('the skill motion ends at 65% of its 51 frames, its skill cleared, and the next step stands', () => {
    const { player } = fight();
    const model = fakeModel(player, 51, [27]);
    const ends: number[] = [];
    player.onAttackEnd = (state) => ends.push(state);
    player.onMeleeSkill = () => {};
    player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2);
    player.skillAct = { skill: 1, targetId: 2, level: 1 };
    let steps = 0;
    for (;;) {
      player.step();
      steps++;
      if ((player.state & ObjSta.ATK_ALL) === 0 || steps > 200) break;
      model.move();
    }
    // m_fFrameCurrent >= m_nFrameMax * 0.65f, 51 * 0.65f being 33.15 (ActionMoverState.cpp:614-619): 67 moves of 0.5
    // reach 33.5, the hit at 27 held the model 4 steps, and the step that sees 33.5 ends it (33 did not)
    expect(model.frame()).toBe(33.5);
    expect(steps).toBe(67 + 4 + 1);
    expect(player.state).toBe(0);
    // OnActEndMeleeSkill (MoverActEvent.cpp:2056-2060): the skill in use is cleared; a swing's end is not told
    expect(player.skillAct).toBe(null);
    expect(ends).toEqual([]);
    player.step();
    expect(player.state).toBe(ObjSta.STAND);
    expect(player.motion).toBe(Mti.STAND);
  });

  it('a model with no frame to tell ends the skill at once; one whose motion file is still loading does not', () => {
    const { player } = fight();
    player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2);
    player.step(); // the default: no model, every motion over at once (frame 0 of 0)
    expect(player.state & ObjSta.ATK_ALL).toBe(0);
    player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_CLEANHIT, 2);
    player.modelFrame = () => null;
    player.step();
    expect(player.state).toBe(ObjSta.ATK_MELEESKILL);
  });

  it('calls onMeleeSkill at each hit frame with the hit count, then holds the model 4 steps: Flurry hits three times', () => {
    const { player } = fight();
    const model = fakeModel(player, 61, [7, 23, 39]);
    const hits: Array<[number, number]> = [];
    let step = 0;
    player.onMeleeSkill = (count) => hits.push([count, step]);
    player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_BRANDISH, 2);
    for (; step < 120 && (player.state & ObjSta.ATK_ALL) !== 0; step++) {
      player.step();
      // m_nPause = 4 on the client (ActionMoverState.cpp:656-658)
      if (hits.length > 0 && hits[hits.length - 1]![1] === step) expect(player.paused).toBe(4);
      model.move();
    }
    // 61 * 0.65f = 39.65: the third hit, at 39, comes before the cut
    expect(hits.map(([count]) => count)).toEqual([0, 1, 2]);
    // frame 7 is reached by the 14th move, so the 15th step finds it; each hit holds the model 4 steps
    expect(hits.map(([, at]) => at)).toEqual([14, 14 + 32 + 4, 14 + 64 + 8]);
    // a new skill counts its hits from 0 again (m_nMotionHitCount = 0, ActionMoverMsg.cpp:769)
    hits.length = 0;
    player.sendActMsg(ActMsg.MELEESKILL, Mti.VAG_ONE_BRANDISH, 2);
    for (let i = 0; i < 20; i++) {
      player.step();
      model.move();
    }
    expect(hits.map(([count]) => count)).toEqual([0]);
  });
});

describe('motionFor', () => {
  const hand = (kind3: number, more: Partial<MotionHand> = {}): MotionHand =>
    ({ kind3, twoHanded: false, dual: false, master: false, psykeeper: false, ...more });
  const atk1 = (h: MotionHand | null, stateFlag: number = ObjStaF.COMBAT, option = 0): number =>
    motionFor(Mti.ATK1, h, stateFlag, option);

  it('adds the weapon set of a player body in combat (CMover::SetMotion, Mover.cpp:4822-4902)', () => {
    expect(atk1(hand(Ik3.HAND))).toBe(223);
    expect(atk1(hand(Ik3.SWD))).toBe(223);
    expect(atk1(hand(Ik3.SWD, { twoHanded: true }))).toBe(823);
    expect(atk1(hand(Ik3.AXE))).toBe(523);
    expect(atk1(hand(Ik3.AXE, { twoHanded: true }))).toBe(823);
    expect(atk1(hand(Ik3.STAFF))).toBe(623);
    expect(atk1(hand(Ik3.CHEERSTICK))).toBe(423);
    expect(atk1(hand(Ik3.KNUCKLEHAMMER))).toBe(723);
    expect(atk1(hand(Ik3.WAND))).toBe(323);
    expect(atk1(hand(Ik3.WAND, { psykeeper: true }))).toBe(2223);
    expect(atk1(hand(Ik3.YOYO))).toBe(2379);
    expect(atk1(hand(Ik3.BOW))).toBe(2351);
    expect(atk1(hand(Ik3.SWD, { dual: true }))).toBe(923);
    // the master bodies: no dual set, and a yoyo or bow is +200
    expect(atk1(hand(Ik3.YOYO, { master: true, dual: true }))).toBe(223);
    expect(atk1(hand(Ik3.BOW, { master: true }))).toBe(223);
  });

  it('adds nothing out of combat, for MOP_FIXED, or for a monster or NPC', () => {
    expect(atk1(hand(Ik3.SWD), 0)).toBe(Mti.ATK1);
    expect(atk1(hand(Ik3.SWD), ObjStaF.COMBAT | ObjStaF.WALK)).toBe(223);
    expect(atk1(hand(Ik3.SWD), ObjStaF.COMBAT, Mop.FIXED)).toBe(Mti.ATK1);
    expect(atk1(null)).toBe(Mti.ATK1);
    expect(motionFor(Mti.STAND, hand(Ik3.HAND), ObjStaF.COMBAT)).toBe(200);
    expect(motionFor(Mti.DIE1, hand(Ik3.HAND), ObjStaF.COMBAT)).toBe(208);
  });
});
