// Neuz's flight rules (Piece 7 M5, [R §3]): ProcessActMsg2, ProcessState2, ProcessFlyMove and PresupposePos2, with the
// research's numbers. The expectations are the C++ float steps, written out here.

import { describe, expect, it } from 'vitest';
import {
  flightActMsg, flightStates, flyMove, presupposeFlight, setAngle,
} from '../../src/world/sim/flight';
import type { FlightRide, FlightState } from '../../src/world/sim/flight';
import { ActMsg, MAX_CORR_SIZE_150, Mta, ObjSta, ObjStaF, PARTS_RIDE } from '../../src/world/sim/constants';

const f32 = Math.fround;
/** `1.0f - FRIC_AIR`: what each tick leaves of the move. */
const KEEP = f32(1 - f32(0.011));
/** The Magic Broom (II_RID_RID_BOR_MAGIC01, 5000). */
const MAGIC_BROOM: FlightRide = { speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 };
/** FMOVE's thrust: `fFlightSpeed * 0.75f`. */
const THRUST = f32(MAGIC_BROOM.speed * 0.75);

function flier(over: Partial<FlightState> = {}): FlightState {
  return {
    pos: [100, 120, 100], delta: [0, 0, 0], deltaE: [0, 0, 0], angle: 0, angleX: 0, accPower: 0, turnAngle: 0,
    state: ObjSta.STAND, stateFlag: ObjStaF.FLY, motion: MAGIC_BROOM.motion + Mta.FSTAND1, motionOption: 0, loop: 4,
    accFuel: 0, ride: MAGIC_BROOM, ...over,
  };
}
const length = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('the flight constants', () => {
  it('copies MoverMsg.h, defineNeuz.h and ActionMover.h', () => {
    expect([ObjSta.LOOKUP, ObjSta.LOOKDOWN]).toEqual([0x400, 0x800]);
    expect([ObjStaF.ACC, ObjStaF.ACCTURN, ObjStaF.TURBO]).toEqual([0x10, 0x40, 0x80]);
    expect([ActMsg.MODE_FLY, ActMsg.MODE_GROUND, ActMsg.MODE_TURBO_ON, ActMsg.MODE_TURBO_OFF]).toEqual([22, 23, 24, 25]);
    expect([ActMsg.ACC_START, ActMsg.ACC_STOP, ActMsg.LOOKUP, ActMsg.LOOKDOWN, ActMsg.STOP_LOOK]).toEqual([27, 28, 43, 44, 45]);
    expect(Mta).toEqual({
      FSTAND1: 0, FIDLE1: 1, FIDLE2: 2, FLTURN1: 3, FLTURN2: 4, FRTURN1: 5, FRTURN2: 6, FRUNNING1: 7, FRUNNING2: 8,
      FDMG1: 9, FATK1: 10, FATK2: 11, FATK3: 12,
    });
    expect([PARTS_RIDE, MAX_CORR_SIZE_150]).toEqual([13, 37]);
  });
});

describe('ProcessState2 and ProcessActMsg2', () => {
  it("FMOVE's thrust is the ride's speed × 0.75", () => {
    const s = flier();
    expect(flightActMsg(s, ActMsg.FORWARD)).toBe(1);
    expect(s.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
    expect(s.motion).toBe(31 + Mta.FRUNNING1);
    flightStates(s);
    expect(s.accPower).toBe(THRUST);
    expect(flightActMsg(s, ActMsg.FORWARD)).toBe(0); // already moving
    expect(flightActMsg(s, ActMsg.STAND)).toBe(1);
    flightStates(s);
    expect(s.accPower).toBe(0);
    expect(s.motion).toBe(31 + Mta.FSTAND1);
  });

  it("a turn is 2.5 times the ride's turn without ACC, once with it", () => {
    const s = flier();
    expect(flightActMsg(s, ActMsg.LTURN, 60)).toBe(1); // (int)(fFlightLRAngle * 100)
    expect(s.turnAngle).toBe(f32(0.6));
    expect(s.motion).toBe(31 + Mta.FSTAND1); // the message plays the turn motion only above 1°
    flightStates(s);
    expect(s.angle).toBe(setAngle(f32(f32(0.6) * 2.5)));
    expect(s.motion).toBe(31 + Mta.FLTURN1); // the state plays it whatever the angle
    const acc = flier({ stateFlag: ObjStaF.FLY | ObjStaF.ACC });
    flightActMsg(acc, ActMsg.RTURN, 60);
    flightStates(acc);
    expect(acc.angle).toBe(setAngle(f32(0 - f32(0.6))));
    expect(acc.motion).toBe(31 + Mta.FRTURN1);
    expect(flightActMsg(acc, ActMsg.STOP_TURN)).toBe(1);
    expect(acc.turnAngle).toBe(0);
    expect(acc.state & ObjSta.TURN_ALL).toBe(0);
  });

  it('a turn above 1° plays the turn motion', () => {
    const s = flier();
    flightActMsg(s, ActMsg.LTURN, 250);
    expect(s.motion).toBe(31 + Mta.FLTURN1);
    flightActMsg(s, ActMsg.RTURN, 250);
    expect(s.motion).toBe(31 + Mta.FRTURN1);
  });

  it("LOOKDOWN adds the ride's pitch until 45, and may pass it once", () => {
    const s = flier({ angleX: 44.5 });
    expect(flightActMsg(s, ActMsg.LOOKDOWN)).toBe(1);
    flightStates(s);
    expect(s.angleX).toBe(45.5);
    flightStates(s);
    expect(s.angleX).toBe(45.5);
    expect(flightActMsg(s, ActMsg.LOOKDOWN)).toBe(0);
  });

  it('LOOKUP replaces the look bits and leaves the turn (Decision 1)', () => {
    const s = flier({ state: ObjSta.FMOVE | ObjSta.LTURN | ObjSta.LOOKDOWN });
    expect(flightActMsg(s, ActMsg.LOOKUP)).toBe(1);
    expect(s.state & ObjSta.LOOK_ALL).toBe(ObjSta.LOOKUP);
    expect(s.state & ObjSta.TURN_ALL).toBe(ObjSta.LTURN);
    s.angleX = -44.5;
    flightStates(s);
    expect(s.angleX).toBe(-45.5);
    flightStates(s);
    expect(s.angleX).toBe(-45.5);
    expect(flightActMsg(s, ActMsg.STOP_LOOK)).toBe(1);
    expect(s.state & ObjSta.LOOK_ALL).toBe(0);
    expect(flightActMsg(s, ActMsg.STOP_LOOK)).toBe(0);
  });

  it('turbo needs accFuel, and multiplies the thrust by 1.2 with ACC', () => {
    const empty = flier();
    expect(flightActMsg(empty, ActMsg.MODE_TURBO_ON)).toBe(0);
    expect(empty.stateFlag & ObjStaF.TURBO).toBe(0);

    const s = flier({ accFuel: 1000, state: ObjSta.FMOVE });
    expect(flightActMsg(s, ActMsg.MODE_TURBO_ON)).toBe(1);
    expect(flightActMsg(s, ActMsg.MODE_TURBO_ON)).toBe(0);
    expect(flightActMsg(s, ActMsg.ACC_START)).toBe(1);
    flightStates(s);
    flyMove(s);
    expect(s.delta[2]).toBe(f32(f32(0 - f32(THRUST * f32(1.2))) * KEEP));

    // without ACC the turbo adds nothing
    const coast = flier({ accFuel: 1000, state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.TURBO, delta: [0, 0, f32(-0.1)] });
    flightStates(coast);
    flyMove(coast);
    expect(coast.delta[2]).toBe(f32(f32(f32(-0.1) + -THRUST) * KEEP));

    // the fuel runs out: the turbo goes off and the thrust is plain
    const out = flier({ accFuel: 0, state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC | ObjStaF.TURBO });
    flightStates(out);
    flyMove(out);
    expect(out.stateFlag & ObjStaF.TURBO).toBe(0);
    expect(out.delta[2]).toBe(f32(f32(0 - THRUST) * KEEP));
    expect(flightActMsg(out, ActMsg.MODE_TURBO_OFF)).toBe(0);
  });

  it('TURNMOVE: f = 2·dist/(0.10·n²), and the y term has an extra cos', () => {
    const s = flier({ state: ObjSta.FMOVE | ObjSta.RTURN });
    expect(flightActMsg(s, ActMsg.TURNMOVE, 90, 10, 37, 5)).toBe(1);
    expect(s.angle).toBe(setAngle(90));
    expect(s.angleX).toBe(10);
    expect(s.stateFlag & ObjStaF.ACC).toBe(ObjStaF.ACC);
    expect(s.state & ObjSta.TURN_ALL).toBe(0);
    const f = 10 / (0.1 * 37 * 37);
    const pitch = (10 * Math.PI) / 180;
    expect(s.delta[0]).toBeCloseTo(Math.cos(pitch) * f, 6);
    expect(s.delta[2]).toBeCloseTo(0, 6);
    expect(s.delta[1]).toBeCloseTo(-Math.sin(pitch) * f * Math.cos(pitch), 6);
    expect(flightActMsg(flier(), ActMsg.TURNMOVE, 90, 10, 0, 5)).toBe(0); // no frames left: Neuz logs and stops
    expect(flightActMsg(flier({ state: ObjSta.ATK1 }), ActMsg.TURNMOVE, 90, 10, 37, 5)).toBe(-2);
    expect(flightActMsg(flier({ state: ObjSta.DMG }), ActMsg.TURNMOVE, 90, 10, 37, 5)).toBe(-3);
  });
});

describe('ProcessFlyMove', () => {
  it('level flight from a stop follows (v + a)·0.989, along −Z at angle 0', () => {
    const s = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC });
    let v = 0;
    for (let tick = 1; tick <= 600; tick++) {
      flightStates(s);
      flyMove(s);
      v = f32(f32(v + THRUST) * KEEP);
      if (tick === 1 || tick === 2 || tick === 600) expect(s.delta[2], `tick ${tick}`).toBe(-v);
    }
    expect(s.delta[0]).toBe(0);
    expect(Object.is(s.delta[1], 0) || Object.is(s.delta[1], -0)).toBe(true);
    expect(v).toBeLessThan((THRUST * 0.989) / 0.011); // the terminal speed, 0.155
    expect(v).toBeGreaterThan(0.15);
  });

  it('the cap binds only beyond 0.3', () => {
    const fast = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, delta: [0, 0, f32(-0.31)] });
    flightStates(fast);
    flyMove(fast);
    expect(fast.delta[2]).toBe(f32(f32(-0.31) * KEEP));
    const under = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, delta: [0, 0, f32(-0.29)] });
    flightStates(under);
    flyMove(under);
    expect(under.delta[2]).toBe(f32(f32(f32(-0.29) - THRUST) * KEEP));
  });

  it('drift: thrust over 70° from the move doubles it and slows the move by 0.985', () => {
    const s = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, delta: [f32(0.2), 0, 0] });
    flightStates(s);
    expect(flyMove(s).drift).toBe(true);
    expect(s.delta[0]).toBe(f32(f32(f32(0.2) * f32(0.985)) * KEEP));
    expect(s.delta[2]).toBe(f32(f32(0 + f32(-THRUST * 2)) * KEEP));
    const ahead = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, delta: [0, 0, -0.2] });
    flightStates(ahead);
    expect(flyMove(ahead).drift).toBe(false);
  });

  it('stopped: no thrust and |v| under 0.0002 zeroes the move and drops ACC', () => {
    const s = flier({ stateFlag: ObjStaF.FLY | ObjStaF.ACC, delta: [0, 0, f32(-0.0001)] });
    flightStates(s);
    expect(flyMove(s).speedShown).toBe(0);
    expect(s.delta).toEqual([0, 0, 0]);
    expect(s.stateFlag & ObjStaF.ACC).toBe(0);
    // at rest and not accelerating nothing happens at all
    const still = flier();
    expect(flyMove(still)).toEqual({ speedShown: 0, drift: false, turned: false });
  });

  it('the speed shown is |v| × 1080, truncated twice', () => {
    const s = flier({ delta: [0, 0, f32(-0.1)] });
    expect(flyMove(s).speedShown).toBe(106); // |v| 0.0989: 21362 / 200
  });

  it('tracking turns 2.5° and 1.5° a tick toward the target, past 3°', () => {
    const s = flier({ state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, angle: 10, angleX: 0 });
    flightStates(s);
    expect(flyMove(s, { yawTo: 20, pitchTo: -10 }).turned).toBe(true);
    expect(s.angle).toBe(setAngle(f32(10 + 2.5)));
    expect(s.angleX).toBe(-1.5);
    const near = flier({ stateFlag: ObjStaF.FLY | ObjStaF.ACC, angle: setAngle(350), angleX: 2 });
    expect(flyMove(near, { yawTo: -8, pitchTo: 0 }).turned).toBe(false); // 2° either way
    expect(near.angle).toBe(setAngle(350));
    expect(near.angleX).toBe(2);
  });
});

describe('PresupposePos2 and SetAngle', () => {
  it('PresupposePos2 looks 1° a tick, multiplies the turbo by 1.5, and caps y at 270', () => {
    const s = flier({
      pos: [100, 269.9, 100], delta: [0, 0.2, 0], state: ObjSta.FMOVE | ObjSta.LOOKUP,
      stateFlag: ObjStaF.FLY | ObjStaF.ACC | ObjStaF.TURBO, accFuel: 1000,
    });
    const r = presupposeFlight(s, MAX_CORR_SIZE_150);
    expect(r.angleX).toBe(-37);
    expect(r.pos[1]).toBe(270);
    expect(r.accPower).toBe(f32(THRUST * 1.5));
    expect(s.pos).toEqual([100, 269.9, 100]); // the mover itself does not move
    expect(s.angleX).toBe(0);
  });

  it('setAngle wraps and quantises', () => {
    expect(setAngle(-1)).toBe(f32((360 / 65536) * 65354));
    expect(setAngle(360)).toBe(0);
    expect(setAngle(90)).toBe(90);
  });
});
