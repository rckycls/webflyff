import { describe, expect, it } from 'vitest';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { ActionMover } from '../../src/world/sim/ActionMover';
import { HAttr } from '../../src/world/sim/collision';
import type { CollisionObject, Ground } from '../../src/world/sim/collision';
import { ActMsg, AniLoop, MAX_CORR_SIZE_45, Mti, ObjSta, ObjStaF } from '../../src/world/sim/constants';
import {
  applyDestPos, applyMotion, applyMoved, applyMoverCorr, isEmptyDest, setDestAngle, setDestObj, setDestPos, stepMover,
} from '../../src/world/sim/moverRules';
import type { SimMover } from '../../src/world/sim/moverRules';

const f32 = Math.fround;
type Find = (objectId: number) => SimMover | undefined;
const nobody: Find = () => undefined;

/**
 * A mover at `pos` facing `angle`, running `speed` a step. The tests stand near (100, 0, 100): at z = 0 a run at
 * angle 90 would leave z by the float cos(90 degrees)'s 4e-9 and cross the axis of a destination there at once, as
 * in Neuz; at 100 the float position does not see it.
 */
function sim(objectId: number, pos: Vec3, angle: number, speed = 0.1, extra: Partial<SimMover> = {}): SimMover {
  return {
    objectId, act: new ActionMover({ pos, angle, speed: f32(speed) }), dest: null, corr: null, speedFactor: 1,
    ...extra,
  };
}

function world(...movers: SimMover[]): { find: Find; remove: (id: number) => void; put: (m: SimMover) => void } {
  const byId = new Map(movers.map((m) => [m.objectId, m]));
  return { find: (id) => byId.get(id), remove: (id) => { byId.delete(id); }, put: (m) => { byId.set(m.objectId, m); } };
}

function steps(m: SimMover, n: number, find: Find = nobody): void {
  for (let i = 0; i < n; i++) stepMover(m, find);
}

/** What another client reported: a run (FMOVE) at `angle` from `pos`. */
function report(pos: Vec3, angle = 90, extra: Partial<MoveReport> = {}): MoveReport {
  return {
    pos, delta: [0.1, 0, 0], angle, state: ObjSta.FMOVE, stateFlag: 0, motion: Mti.RUN, motionEx: 0,
    loop: AniLoop.LOOP, motionOption: 0, tick: 0n, ...extra,
  };
}

/** Where a mover is after taking `m` as it is (`ActionForceSet`) and then `n` steps of it. */
function afterForceSet(m: MoveReport, n: number, speed = 0.1): ActionMover {
  const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: f32(speed) });
  act.forceSet(m);
  for (let i = 0; i < n; i++) act.step();
  return act;
}

function near(actual: number, expected: number, tolerance = 1e-4): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

describe('moverRules: corrections (CDPClient::OnMoverMoved, __SYNC_1217)', () => {
  it('a move 951 ms old is set at once; one 949 ms old is not', () => {
    // (int)( (float)951 / 16.6667f ) - 35 = 57 - 35 = 22 = MAX_CORR_SIZE_45; 949 gives 56 - 35 = 21
    const move = report([105, 0, 100]);
    const late = sim(1, [100, 0, 100], 0);
    applyMoved(late, move, 951, false);
    expect(late.act.body.pos).toEqual([105, 0, 100]);
    expect(late.act.body.angle).toBe(90);
    expect(late.act.state).toBe(ObjSta.FMOVE);
    expect(late.dest).toBeNull();
    expect(late.corr).toBeNull();

    const onTime = sim(2, [100, 0, 100], 0);
    applyMoved(onTime, move, 949, false);
    expect(onTime.act.body.pos).toEqual([100, 0, 100]);
    expect(onTime.corr).toMatchObject({ remnant: 1, speed: f32(0.1) });
    expect(onTime.dest?.pos).toEqual([105, 0, 100]);
    // the one step left starts with the reported move (EnforcedGhostCorr), then makes its step
    stepMover(onTime, nobody);
    expect(onTime.act.body.pos).toEqual(afterForceSet(move, 1).body.pos);
    expect(onTime.corr).toBeNull();
    expect(onTime.dest).toBeNull();
  });

  it('an on-time move heads for the predicted point at the mover\'s own speed for the remaining steps, then takes the reported state', () => {
    // 617 ms: (int)( 617.0f / 16.6667f ) = 37, so delay = 2 and 20 steps remain
    const m = sim(1, [100, 0, 100], 0);
    const move = report([105, 0, 100], 90, { motionEx: 4 });
    applyMoved(m, move, 617, false);
    expect(m.corr).toMatchObject({ remnant: 20, speed: f32(0.1) });
    expect(m.dest).toMatchObject({ pos: [105, 0, 100], angle: -1 });
    expect(m.act.body.pos).toEqual([100, 0, 100]);

    // 19 steps run toward the point (TURNMOVE turns it to 90) at its own 0.1, as a run of its own would
    const own = new ActionMover({ pos: [100, 0, 100], angle: 90, speed: f32(0.1) });
    own.sendActMsg(ActMsg.FORWARD);
    for (let i = 0; i < 19; i++) {
      stepMover(m, nobody);
      own.step();
      expect(m.act.body.pos).toEqual(own.body.pos);
      expect(m.corr?.remnant).toBe(19 - i);
    }
    expect(m.act.state).toBe(ObjSta.FMOVE);
    expect(m.act.motionEx).toBe(-1);
    expect(m.act.body.speed).toBe(f32(0.1));

    // the 20th takes the reported move and goes on with it
    stepMover(m, nobody);
    const taken = afterForceSet(move, 1);
    expect(m.act.body.pos).toEqual(taken.body.pos);
    expect(m.act.body.angle).toBe(90);
    expect(m.act.motionEx).toBe(4);
    expect(m.corr).toBeNull();
    expect(m.dest).toBeNull();
  });

  it('a backward move corrects in one step', () => {
    // __SYNC_1217: nRemnant = 1 when the report or the mover moves backward
    const back = report([101, 0, 100], 90, { state: ObjSta.BMOVE, motion: Mti.BACK, delta: [-0.02, 0, 0] });
    const m = sim(1, [100, 0, 100], 0);
    applyMoved(m, back, 617, false);
    expect(m.corr?.remnant).toBe(1);
    stepMover(m, nobody);
    expect(m.act.body.pos).toEqual(afterForceSet(back, 1).body.pos);
    expect(m.act.state).toBe(ObjSta.BMOVE);
    expect(m.corr).toBeNull();

    const backing = sim(2, [100, 0, 100], 90);
    backing.act.sendActMsg(ActMsg.BACKWARD);
    applyMoved(backing, report([101, 0, 100]), 617, false);
    expect(backing.corr?.remnant).toBe(1);
    stepMover(backing, nobody);
    expect(backing.act.body.pos).toEqual(afterForceSet(report([101, 0, 100]), 1).body.pos);
  });

  it('a walking mover corrects at its running speed', () => {
    // m_fCrrSpd = fSpeed * 4.0f while walking: the walk's quarter of it is the run's speed
    const m = sim(1, [100, 0, 100], 0);
    m.act.sendActMsg(ActMsg.MODE_WALK);
    const walk = report([101.5, 0, 100], 90, { stateFlag: ObjStaF.WALK, motion: Mti.WALK, delta: [0.025, 0, 0] });
    applyMoved(m, walk, 617, false);
    expect(m.corr?.speed).toBe(f32(f32(0.1) * 4));
    steps(m, 10);
    near(m.act.body.pos[0], 101);
    expect(m.act.motion).toBe(Mti.WALK);
    expect(m.act.body.speed).toBe(f32(0.1));
    // it reaches the point before its 20 steps are up: there it takes the reported walk (OnArriveAtPos) and walks
    // at its own pace
    steps(m, 7);
    expect(m.corr).toBeNull();
    expect(m.dest).toBeNull();
    const x = m.act.body.pos[0];
    stepMover(m, nobody);
    near(m.act.body.pos[0] - x, 0.025);
  });

  it('a behavior is set at once, whatever its age', () => {
    const m = sim(1, [100, 0, 100], 0);
    const behavior = report([102, 0, 100], 45, { state: ObjSta.STAND, motion: Mti.STAND, delta: [0, 0, 0] });
    applyMoved(m, behavior, 0, true);
    expect(m.act.body.pos).toEqual([102, 0, 100]);
    expect(m.act.state).toBe(ObjSta.STAND);
    expect(m.dest).toBeNull();
    expect(m.corr).toBeNull();
  });

  it('a behavior during a correction ends it, but keeps its action until DESTPOS drops it', () => {
    // OnMoverBehavior's ActionForceSet zeroes m_uRemnantCorrFrm and (DefaultSet) m_fCrrSpd, not m_CorrAction
    const m = sim(1, [100, 0, 100], 0);
    applyMoved(m, report([105, 0, 100]), 617, false);
    steps(m, 3);
    applyMoved(m, report([101, 0, 100], 0, { state: ObjSta.STAND, motion: Mti.STAND, delta: [0, 0, 0] }), 0, true);
    expect(m.corr).toMatchObject({ remnant: 0, speed: 0, action: { pos: [105, 0, 100] } });
    expect(m.dest).toBeNull();
    // OnSetDestPos: DefaultSet, then BehaviorActionForceSet's memset (a move's action has fBehavior FALSE)
    applyDestPos(m, [101, 0, 104], true);
    expect(m.corr).toBeNull();
    expect(m.dest?.pos).toEqual([101, 0, 104]);
  });

  it('a standing mover that turns turns to the reported angle, then takes the report', () => {
    // OnMoverMoved: standing in both and turning: SetDestAngle( f, LTURN ), not SetDestPos
    const m = sim(1, [100, 0, 100], 0);
    m.act.step();
    const turning = report([100, 0, 100], 40, { state: ObjSta.STAND | ObjSta.LTURN, motion: Mti.STAND, delta: [0, 0, 0] });
    applyMoved(m, turning, 617, false);
    expect(m.dest).toMatchObject({ pos: null, angle: 40, left: true });
    // 10 left turns make 39.990234375 (9 make 35.9912109375, 4.0088 short)
    steps(m, 10);
    expect(m.act.body.angle).toBe(39.990234375);
    expect(m.act.state).toBe(ObjSta.STAND | ObjSta.LTURN);
    expect(m.corr).not.toBeNull();
    // within 4.001 degrees: ApproachGhostAngle takes the correction's report (still turning left)
    stepMover(m, nobody);
    expect(m.corr).toBeNull();
    expect(m.dest).toBeNull();
    expect(m.act.state).toBe(ObjSta.STAND | ObjSta.LTURN);
    expect(m.act.body.angle).toBe(afterForceSet(turning, 1).body.angle);

    // running in either, a turning report is a point to run to
    const running = sim(2, [100, 0, 100], 0);
    running.act.sendActMsg(ActMsg.FORWARD);
    applyMoved(running, turning, 617, false);
    expect(running.dest).toMatchObject({ pos: [100, 0, 100], angle: -1 });
    const standing = sim(3, [100, 0, 100], 0);
    standing.act.step();
    applyMoved(standing, { ...turning, state: ObjSta.FMOVE | ObjSta.LTURN }, 617, false);
    expect(standing.dest).toMatchObject({ pos: [100, 0, 100], angle: -1 });
  });
});

describe('moverRules: MOVERCORR (CDPClient::OnMoverCorr, DPClient.cpp:8929-8955)', () => {
  it('a correction is taken at once: the point, the angle and the correction under way go, and the mover stays there', () => {
    // the mover runs to a reported point (a correction with an action, OnMoverMoved) and turns to an angle
    const m = sim(1, [100, 0, 100], 0);
    applyMoved(m, report([105, 0, 100]), 617, false);
    setDestAngle(m, 45, true);
    steps(m, 3);
    expect(m.corr?.action).not.toBeNull();
    expect(m.dest?.pos).toEqual([105, 0, 100]);

    // the walker met a wall on its own screen: it stands where it stopped (PLAYERCORR, passed on as MOVERCORR)
    const stood = report([101.5, 0, 100.25], 90, { state: ObjSta.STAND, motion: Mti.STAND, delta: [0, 0, 0] });
    applyMoverCorr(m, stood);
    expect(m.act.body.pos).toEqual([101.5, 0, 100.25]);
    expect(m.act.body.angle).toBe(90);
    expect(m.act.state).toBe(ObjSta.STAND);
    // ClearDestPos, ClearDestAngle and the memset of m_CorrAction; ActionForceSet ends the steps and the speed
    expect(m.dest).toBeNull();
    expect(m.corr).toBeNull();
    steps(m, 30);
    expect(m.act.body.pos).toEqual([101.5, 0, 100.25]);
  });

  it('a correction that runs on is taken as it is, and the mover runs on from there', () => {
    const m = sim(1, [100, 0, 100], 0);
    applyMoverCorr(m, report([102, 0, 100]));
    expect(m.act.body.pos).toEqual([102, 0, 100]);
    expect(m.act.state).toBe(ObjSta.FMOVE);
    steps(m, 5);
    expect(m.act.body.pos).toEqual(afterForceSet(report([102, 0, 100]), 5).body.pos);
  });

  it('an object followed is followed on, from range 0 (SetDestObj( objidDest, 0.0f, FALSE ))', () => {
    const m = sim(1, [100, 0, 100], 0);
    const target = sim(2, [110, 0, 100], 0);
    setDestObj(m, 2, 3);
    setDestAngle(m, 45, true);
    applyMoverCorr(m, report([101, 0, 100], 90, { state: ObjSta.STAND, motion: Mti.STAND, delta: [0, 0, 0] }));
    expect(m.act.body.pos).toEqual([101, 0, 100]);
    expect(m.dest).toMatchObject({ pos: null, targetId: 2, range: 0, angle: -1 });
    // it goes after the target again, and stops within range 0 (which counts as 1)
    const { find } = world(m, target);
    for (let i = 0; i < 200 && m.dest; i++) stepMover(m, find);
    const gap = 110 - m.act.body.pos[0];
    expect(gap).toBeLessThan(1);
    expect(gap).toBeGreaterThan(0.85);
  });

  it('a flier ignores it (IsFly)', () => {
    const m = sim(1, [100, 0, 100], 0);
    m.act.stateFlag = ObjStaF.FLY;
    setDestPos(m, [105, 0, 100], true);
    applyMoverCorr(m, report([101, 0, 100], 90, { stateFlag: ObjStaF.FLY }));
    expect(m.act.body.pos).toEqual([100, 0, 100]);
    expect(m.dest?.pos).toEqual([105, 0, 100]);
  });
});

describe('moverRules: destinations (CMover::ProcessMove)', () => {
  it('walks to a point and stops there', () => {
    const m = sim(1, [100, 0, 100], 0);
    setDestPos(m, [103, 0, 100], true);
    expect(m.dest).toMatchObject({ pos: [103, 0, 100], forward: true, positiveX: false, positiveZ: false });
    steps(m, 29);
    near(m.act.body.pos[0], 102.9, 1e-3);
    expect(m.act.body.angle).toBe(90);
    expect(m.act.state).toBe(ObjSta.FMOVE);
    steps(m, 3);
    // the step after the one that passes x = 103 sees the crossing: OnArriveAtPos sends m_dwMotionArrive (STAND)
    expect(m.dest).toBeNull();
    expect(m.act.state).toBe(ObjSta.STAND);
    expect(m.act.motion).toBe(Mti.STAND);
    const x = m.act.body.pos[0];
    expect(x).toBeGreaterThan(103);
    expect(x).toBeLessThan(103.1001);
    steps(m, 10);
    expect(m.act.body.pos[0]).toBe(x);
    expect(m.act.body.pos[2]).toBe(100);
  });

  it('others stop where an axis is crossed; the player\'s own character only past the point', () => {
    // TURNMOVE takes (int)GetDegree: toward (103, 99.99) that is 89, which crosses z = 99.99 after 6 steps. Others
    // arrive there; __BS_FIX_ARRIVEPOS_ALGO keeps the active mover going until the point is behind it.
    const other = sim(1, [100, 0, 100], 0);
    setDestPos(other, [103, 0, 99.99], true);
    steps(other, 12);
    expect(other.dest).toBeNull();
    near(other.act.body.pos[0], 100.6, 1e-3);
    expect(other.act.state).toBe(ObjSta.STAND);

    const self = sim(2, [100, 0, 100], 0, 0.1, { isSelf: true });
    setDestPos(self, [103, 0, 99.99], true);
    steps(self, 12);
    expect(self.dest).not.toBeNull();
    expect(self.act.body.angle).toBe(90);
    steps(self, 25);
    expect(self.dest).toBeNull();
    expect(self.act.body.pos[0]).toBeGreaterThan(103);
    expect(self.act.body.pos[0]).toBeLessThan(103.1001);
  });

  it('follows an object until within range', () => {
    const target = sim(2, [110, 0, 100], 0);
    const m = sim(1, [100, 0, 100], 0);
    const { find } = world(m, target);
    setDestObj(m, 2, 2);
    expect(m.dest).toMatchObject({ pos: null, targetId: 2, range: 2 });
    let n = 0;
    while (m.dest && n < 200) { stepMover(m, find); n++; }
    // in range when the distance is under range + 0.8 x each radius (0 here: no model); ProcessMoveArrival stops it
    const gap = 110 - m.act.body.pos[0];
    expect(gap).toBeLessThan(2);
    expect(gap).toBeGreaterThan(1.9);
    expect(m.act.state).toBe(ObjSta.STAND);
    const x = m.act.body.pos[0];
    steps(m, 5, find);
    expect(m.act.body.pos[0]).toBe(x);

    // a moving target: the follower aims at where it is each step
    const runner = sim(4, [110, 0, 100], 180, 0.05);
    runner.act.sendActMsg(ActMsg.FORWARD);
    const chaser = sim(3, [100, 0, 100], 0, 0.2);
    const w = world(chaser, runner);
    setDestObj(chaser, 4, 1);
    for (let i = 0; i < 200 && chaser.dest; i++) {
      stepMover(runner, w.find);
      stepMover(chaser, w.find);
    }
    expect(chaser.dest).toBeNull();
    expect(chaser.act.body.angle).toBeGreaterThan(90);
    const d = Math.hypot(runner.act.body.pos[0] - chaser.act.body.pos[0], runner.act.body.pos[2] - chaser.act.body.pos[2]);
    expect(d).toBeLessThan(1);
  });

  it('the radii count toward the range', () => {
    // CObj::IsRangeObj: 0.8 x each GetRadius(), plus the range (0 counts as 1): 0.8 + 0.4 + 1
    const target = sim(2, [110, 0, 100], 0, 0.1, { radius: 1 });
    const m = sim(1, [100, 0, 100], 0, 0.1, { radius: 0.5 });
    const { find } = world(m, target);
    setDestObj(m, 2, 0);
    for (let i = 0; i < 200 && m.dest; i++) stepMover(m, find);
    const gap = 110 - m.act.body.pos[0];
    expect(gap).toBeLessThan(2.2);
    expect(gap).toBeGreaterThan(2.1);
  });

  it('turns to a destination angle the short or the given way', () => {
    // left from 0 to 90: 22 turns (to 87.978515625), then within 4.001 it is set to 90
    const left = sim(1, [100, 0, 100], 0);
    setDestAngle(left, 90, true);
    steps(left, 22);
    expect(left.act.body.angle).toBe(87.978515625);
    expect(left.act.state).toBe(ObjSta.LTURN);
    stepMover(left, nobody);
    expect(left.act.body.angle).toBe(90);
    expect(left.dest).toBeNull();
    expect(left.act.state).toBe(ObjSta.STAND);

    // right from 0 to 90 is the long way round, and the way it was given: 67 turns, then 90
    const right = sim(2, [100, 0, 100], 0);
    setDestAngle(right, 90, false);
    stepMover(right, nobody);
    expect(right.act.body.angle).toBe(356.0009765625);
    let passed180 = false;
    for (let i = 1; i < 67; i++) {
      stepMover(right, nobody);
      if (right.act.body.angle > 175 && right.act.body.angle < 185) passed180 = true;
    }
    expect(passed180).toBe(true);
    expect(right.act.body.angle).toBe(91.702880859375);
    expect(right.act.state).toBe(ObjSta.RTURN);
    stepMover(right, nobody);
    expect(right.act.body.angle).toBe(90);
    expect(right.dest).toBeNull();
    expect(right.act.body.pos).toEqual([100, 0, 100]);
  });

  it('a target that vanished stops following', () => {
    const target = sim(2, [110, 0, 100], 0);
    const m = sim(1, [100, 0, 100], 0);
    const w = world(m, target);
    setDestObj(m, 2, 0);
    steps(m, 10, w.find);
    expect(m.act.state).toBe(ObjSta.FMOVE);
    w.remove(2);
    const x = m.act.body.pos[0];
    stepMover(m, w.find);
    expect(m.act.state).toBe(ObjSta.STAND);
    expect(m.act.body.pos[0]).toBe(x);
    steps(m, 10, w.find);
    expect(m.act.body.pos[0]).toBe(x);
    // ProcessMove only sends STAND: m_idDest stays, so the mover follows again if the target comes back
    expect(m.dest?.targetId).toBe(2);
    w.put(target);
    stepMover(m, w.find);
    expect(m.act.state).toBe(ObjSta.FMOVE);
  });

  it('a sitting mover keeps its destination but does not go there', () => {
    const m = sim(1, [100, 0, 100], 0);
    m.act.sendActMsg(ActMsg.SITDOWN);
    setDestPos(m, [103, 0, 100], true);
    steps(m, 10);
    expect(m.act.body.pos).toEqual([100, 0, 100]);
    expect(m.act.body.angle).toBe(0); // not even turned: ProcessMove returns at once
    expect(m.dest?.pos).toEqual([103, 0, 100]);
  });

  it('MOTION clears the destination and the correction\'s action, except for STANDUP', () => {
    // CDPClient::OnMotion: ClearDest, ClearDestAngle and the memset, then SendActMsg( dwMsg, 0, 0, 1 )
    const m = sim(1, [100, 0, 100], 0);
    applyMoved(m, report([105, 0, 100]), 617, false);
    applyMotion(m, ActMsg.SITDOWN);
    expect(m.dest).toBeNull();
    expect(m.corr).toMatchObject({ action: null, remnant: 20 });
    expect(m.act.stateFlag & ObjStaF.SIT).toBe(ObjStaF.SIT);

    const up = sim(2, [100, 0, 100], 0);
    up.act.sendActMsg(ActMsg.SITDOWN);
    up.act.step();
    setDestAngle(up, 30, true);
    applyMotion(up, ActMsg.STANDUP);
    expect(up.dest?.angle).toBe(30);
    expect(up.act.motion).toBe(Mti.GETUP);
  });

  it('STOP clears the destination, whoever sends it', () => {
    // CActionMover's OBJMSG_STOP calls CMover::ClearDest: the rules give the mover that hook
    const m = sim(1, [100, 0, 100], 0);
    setDestPos(m, [103, 0, 100], true);
    steps(m, 2);
    m.act.sendActMsg(ActMsg.STOP);
    expect(m.dest).toBeNull();
  });

  it('IsEmptyDest: no point and no object followed', () => {
    const m = sim(1, [100, 0, 100], 0);
    expect(isEmptyDest(m)).toBe(true);
    setDestAngle(m, 30, true);
    expect(isEmptyDest(m)).toBe(true);
    setDestPos(m, [103, 0, 100], true);
    expect(isEmptyDest(m)).toBe(false);
    setDestObj(m, 2, 1);
    expect(isEmptyDest(m)).toBe(false);
  });
});

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The plane x = `x` from height 0 to 10 and z 90 to 110, facing -x (IsTouchRayTri is one-sided). */
function wallAt(x: number): CollisionObject {
  const a: Vec3 = [x, 0, 110];
  const b: Vec3 = [x, 10, 110];
  const c: Vec3 = [x, 0, 90];
  const d: Vec3 = [x, 10, 90];
  return { triangles: new Float32Array([a, b, c, b, d, c].flat()), matrix: IDENTITY };
}

/** Land at `height(x, z)` (none where it gives null) and `objects` in the way. */
function groundOf(objects: CollisionObject[], height: (x: number, z: number) => number | null = () => 0): Ground {
  return { terrainHeight: height, landAttr: () => HAttr.NONE, objectsNear: () => objects };
}

/** The player's own character, a player, at `pos` facing +x (angle 90), running 0.1 a step. */
function self(pos: Vec3, extra: Partial<SimMover> = {}): SimMover {
  const m: SimMover = {
    objectId: 1, act: new ActionMover({ pos, angle: 90, speed: f32(0.1), isPlayer: true }), dest: null, corr: null,
    speedFactor: 1, isSelf: true, ...extra,
  };
  m.act.state = ObjSta.STAND;
  return m;
}

function stepsOn(m: SimMover, ground: Ground, n: number, until: () => boolean = () => false): number {
  for (let i = 1; i <= n; i++) {
    stepMover(m, nobody, ground);
    if (until()) return i;
  }
  return n;
}

describe('moverRules: m_nCorr, OnActCollision and OnActDrop (MoverActEvent.cpp:1908-1977, 1979-2053)', () => {
  it('a tap-walk ends where it meets something: the destination goes, the mover stands, and a PLAYERCORR is owed', () => {
    const ground = groundOf([wallAt(103)]);
    const m = self([100, 0, 100], { nCorr: -1 });
    setDestPos(m, [110, 0, 100], true);
    const n = stepsOn(m, ground, 100, () => m.corrReport != null);
    expect(n).toBeLessThan(100);

    expect(m.dest).toBeNull();
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    expect(m.nCorr).toBe(0);
    // SendPlayerCorr's fields as they are after the STAND: GetPos(), m_vDelta, the angle, the state
    const at = m.act.body.pos;
    expect(at[0]).toBeLessThan(103);
    expect(m.corrReport).toMatchObject({ pos: at, angle: 90, state: m.act.state, stateFlag: m.act.stateFlag });
    expect(m.corrReport!.delta).toEqual(m.act.delta);

    // it stays where it stopped, and owes nothing more
    m.corrReport = null;
    stepsOn(m, ground, 30);
    expect(m.act.body.pos).toEqual(at);
    expect(m.corrReport).toBeNull();
  });

  it("after a PLAYERMOVED (m_nCorr 22) a collision owes a PLAYERCORR, once, and the move goes on", () => {
    // the knee's test line is the step's move times 6.5: the wall at 101.5 is met at x 100.85, within 22 steps
    const ground = groundOf([wallAt(101.5)]);
    const m = self([100, 0, 100], { nCorr: MAX_CORR_SIZE_45 });
    m.act.sendActMsg(ActMsg.FORWARD);
    const n = stepsOn(m, ground, MAX_CORR_SIZE_45, () => m.corrReport != null);
    expect(n).toBeLessThan(MAX_CORR_SIZE_45);
    expect(m.nCorr).toBe(0);
    expect(m.corrReport!.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);

    m.corrReport = null;
    stepsOn(m, ground, 10);
    expect(m.corrReport).toBeNull();
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
  });

  it('m_nCorr counts down a step at a time: 22 steps after a PLAYERMOVED a collision owes nothing', () => {
    const ground = groundOf([wallAt(104)]);
    const m = self([100, 0, 100], { nCorr: MAX_CORR_SIZE_45 });
    m.act.sendActMsg(ActMsg.FORWARD);
    stepsOn(m, ground, 1);
    expect(m.nCorr).toBe(MAX_CORR_SIZE_45 - 1);
    stepsOn(m, ground, MAX_CORR_SIZE_45 - 1);
    expect(m.nCorr).toBe(0);
    // on to the wall: it is met, and nothing is owed
    stepsOn(m, ground, 40);
    expect(m.act.body.pos[0]).toBeLessThan(104);
    expect(m.act.body.pos[0]).toBeGreaterThan(103);
    expect(m.corrReport ?? null).toBeNull();
  });

  it('a tap-walk that starts to fall ends there: it falls straight down and stands, owing a PLAYERCORR', () => {
    // a 10 m drop at x 103
    const ground = groundOf([], (x) => (x < 103 ? 10 : 0));
    const m = self([100, 10, 100], { nCorr: -1 });
    setDestPos(m, [110, 0, 100], true);
    stepsOn(m, ground, 200, () => m.corrReport != null);

    expect(m.dest).toBeNull();
    expect(m.nCorr).toBe(0);
    expect(m.act.state & ObjSta.JUMP_ALL).toBe(ObjSta.SJUMP3);
    // OnActDrop comes before the step puts the mover where it went: the report has the position it fell from
    expect(m.corrReport!.pos[1]).toBeGreaterThan(m.act.body.pos[1]);
    const x = m.act.body.pos[0];
    expect(x).toBeGreaterThan(103);
    stepsOn(m, ground, 200, () => m.act.body.pos[1] === 0);
    expect(m.act.body.pos[0]).toBe(x);
    expect(m.act.body.pos[1]).toBe(0);
  });

  it('a mover other than the own character owes nothing and walks on', () => {
    const ground = groundOf([wallAt(103)]);
    const m = self([100, 0, 100], { isSelf: false });
    setDestPos(m, [110, 0, 100], true);
    stepsOn(m, ground, 60);
    expect(m.dest?.pos).toEqual([110, 0, 100]);
    expect(m.corrReport ?? null).toBeNull();
    expect(m.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
  });
});

describe('moverRules: OnActEndJump4 (MoverActEvent.cpp:2089-2098)', () => {
  it('a mover that lands on its way to a point takes its sides of the point anew', () => {
    // the point is 0.5 north of where the mover was: on the south side (m_bPositiveZ false)
    const m = self([100, 0, 99.5]);
    setDestPos(m, [110, 0, 100], true);
    expect(m.dest?.positiveZ).toBe(false);
    // the mover has come down 0.5 north of it and is landing; facing the point, it has not gone past it
    m.act.body.pos = [100, 0, 100.5];
    m.act.state = ObjSta.SJUMP4;
    stepMover(m, nobody, groundOf([]));
    expect(m.act.state & ObjSta.JUMP_ALL).toBe(0);
    expect(m.dest?.positiveZ).toBe(true);
    expect(m.dest?.pos).toEqual([110, 0, 100]);
  });
});
