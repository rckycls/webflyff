// The flight collision and the server's corrections in the air (Piece 7 M5, [R §3, §5]): ProcessCollisionFly,
// ForcedSet2, HalfForceSet and the ghost's chase, on hand-made worlds.

import { describe, expect, it } from 'vitest';
import type { FlightReport, Vec3 } from '@flyffweb/protocol';
import { HAttr } from '../../src/world/sim/collision';
import type { CollisionObject, Ground } from '../../src/world/sim/collision';
import { ObjSta, ObjStaF } from '../../src/world/sim/constants';
import { setAngle } from '../../src/world/sim/flight';
import type { FlightState } from '../../src/world/sim/flight';
import {
  approachFlight, collideFly, forcedSet2, fullHeight, getDegreeX, halfForcedSet,
} from '../../src/world/sim/flightCollision';

const f32 = Math.fround;
type Tri = [Vec3, Vec3, Vec3];
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const object = (tris: Tri[]): CollisionObject => ({ triangles: new Float32Array(tris.flat(2)), matrix: IDENTITY });

/** The plane x = `x` facing -x, between heights `y0`..`y1` and `z0`..`z1` (a line meets it moving +x). */
function wallX(x: number, y0: number, y1: number, z0: number, z1: number): Tri[] {
  const a: Vec3 = [x, y0, z1];
  const b: Vec3 = [x, y1, z1];
  const c: Vec3 = [x, y0, z0];
  const d: Vec3 = [x, y1, z0];
  return [[a, b, c], [b, d, c]];
}

/** A flat deck facing up at height `y`. */
function deck(x0: number, x1: number, y: number, z0: number, z1: number): Tri[] {
  return [[[x0, y, z1], [x1, y, z1], [x1, y, z0]], [[x0, y, z1], [x1, y, z0], [x0, y, z0]]];
}

function world(over: Partial<Ground> & { objects?: CollisionObject[] } = {}): Ground {
  const { objects = [], ...rest } = over;
  return {
    terrainHeight: () => 0, landAttr: () => HAttr.NONE, objectsNear: () => objects, extent: [1280, 1280], ...rest,
  };
}

function flier(over: Partial<FlightState> = {}): FlightState {
  return {
    pos: [100, 120, 100], delta: [0, 0, 0], deltaE: [0, 0, 0], angle: 0, angleX: 0, accPower: f32(0.001725),
    turnAngle: 0, state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY | ObjStaF.ACC, motion: 38, motionOption: 2, loop: 4,
    accFuel: 0, ride: { speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 }, ...over,
  };
}

describe('ProcessCollisionFly', () => {
  it('a hovering mover is not clamped', () => {
    const s = flier({ pos: [100, -5, 100], accPower: 0 });
    expect(collideFly(s, [0, 0, 0], world(), true, true)).toEqual({ collided: false, unequip: false, died: false });
    expect(s.pos).toEqual([100, -5, 100]);
  });

  it('the ceiling is 200', () => {
    const s = flier({ pos: [100, 199.75, 100] });
    collideFly(s, [0, 0.5, 0], world(), true, true);
    expect(s.pos[1]).toBe(200);
  });

  it('below the land it stands on the land, and delta.y is kept', () => {
    const s = flier({ pos: [100, 50.25, 100], delta: [0, -0.5, 0] });
    expect(collideFly(s, [0, -0.5, 0], world({ terrainHeight: () => 50 }), true, true).collided).toBe(true);
    expect(s.pos[1]).toBe(50);
    expect(s.delta[1]).toBe(-0.5);
  });

  it('over a deck the floor is the deck (GetFullHeight)', () => {
    const s = flier({ pos: [100, 130.25, 100] });
    collideFly(s, [0, -0.5, 0], world({ objects: [object(deck(90, 110, 130, 90, 110))] }), true, false);
    expect(s.pos[1]).toBe(130);
    expect(fullHeight(world({ objects: [object(deck(90, 110, 130, 90, 110))] }), [100, 131, 100])).toBe(130);
    expect(fullHeight(world({ terrainHeight: () => 12 }), [100, 131, 100])).toBe(12);
  });

  it('the minimum 85 holds over cloud water only', () => {
    const cloud = flier({ pos: [100, 84.25, 100] });
    collideFly(cloud, [0, -0.5, 0], world({ waterTexture: () => 1 }), true, true); // WTYPE_CLOUD
    expect(cloud.pos[1]).toBe(85);
    const sea = flier({ pos: [100, 84.25, 100] });
    collideFly(sea, [0, -0.5, 0], world({ waterTexture: () => 2 }), true, true); // WTYPE_WATER
    expect(sea.pos[1]).toBe(83.75);
  });

  it('NOFLY land takes the step back and unequips (Review Focus 3)', () => {
    const s = flier();
    const noFlyAhead = world({ landAttr: (_x, z) => (z > 100.2 ? HAttr.NOFLY : HAttr.NONE) });
    expect(collideFly(s, [0.5, 0.25, 0.5], noFlyAhead, true, true)).toEqual({ collided: false, unequip: true, died: false });
    expect(s.pos).toEqual([100, 120, 100]);
  });

  it('a world without flight unequips anywhere', () => {
    const s = flier();
    expect(collideFly(s, [0.5, 0.25, 0.5], world(), false, true).unequip).toBe(true);
    expect(s.pos).toEqual([100, 120, 100]);
  });

  it('NOMOVE land takes back its own axis; DIE land kills', () => {
    const s = flier();
    collideFly(s, [0.5, 0, 0.5], world({ landAttr: (x) => (x > 100.2 ? HAttr.NOMOVE : HAttr.NONE) }), true, true);
    expect(s.pos).toEqual([100, 120, 100.5]);
    expect(collideFly(flier(), [0.5, 0, 0.5], world({ landAttr: () => HAttr.DIE }), true, true).died).toBe(true);
  });

  it("the world's edge stops 10 m in", () => {
    const s = flier({ pos: [10.25, 120, 1269.75] });
    collideFly(s, [-0.5, 0, 0.5], world(), true, true);
    expect([s.pos[0], s.pos[2]]).toEqual([10, 1270]);
  });

  it('a wall reflects the move at 0.7', () => {
    const s = flier({ pos: [100.5, 120, 100], delta: [0.5, 0, 0] });
    const wall = object(wallX(101, 110, 130, 90, 110));
    expect(collideFly(s, [0.5, 0, 0], world({ objects: [wall] }), true, true).collided).toBe(true);
    expect(s.delta[0]).toBeCloseTo(-0.35, 5);
    expect(s.delta[1]).toBeCloseTo(0, 6);
    expect(s.pos[0]).toBeCloseTo(100.15, 5);
    // a mover chasing a destination does not test the objects (CanCollisionFly)
    const ghost = flier({ pos: [100.5, 120, 100] });
    collideFly(ghost, [0.5, 0, 0], world({ objects: [wall] }), true, false);
    expect(ghost.pos[0]).toBe(101);
  });
});

describe('ForcedSet2, HalfForceSet and the chase', () => {
  const report = (stateFlag: number): FlightReport => ({
    pos: [1, 2, 3], delta: [0.1, 0.2, 0.3], angle: 10, angleX: -5, accPower: f32(0.002), turnAngle: f32(0.6),
    state: ObjSta.FMOVE | ObjSta.LTURN, stateFlag, motion: 38, motionEx: 0, loop: 4, motionOption: 2, tick: 1n,
  });

  it('ForcedSet2 refuses a FLY flip', () => {
    const s = flier();
    expect(forcedSet2(s, report(ObjStaF.WALK), true)).toBe(false);
    expect(s.delta).toEqual([0, 0, 0]);
    const ground = flier({ stateFlag: 0 });
    expect(forcedSet2(ground, report(ObjStaF.FLY), false)).toBe(false);
    expect(forcedSet2(s, report(ObjStaF.FLY | ObjStaF.TURBO), true)).toBe(true);
    expect(s).toMatchObject({
      delta: [0.1, 0.2, 0.3], accPower: f32(0.002), turnAngle: f32(0.6), state: ObjSta.FMOVE | ObjSta.LTURN,
      stateFlag: ObjStaF.FLY | ObjStaF.TURBO,
    });
  });

  it('HalfForceSet sets the move, the thrust and the turn only', () => {
    const s = flier({ state: ObjSta.STAND });
    halfForcedSet(s, report(0));
    expect(s).toMatchObject({ delta: [0.1, 0.2, 0.3], accPower: f32(0.002), turnAngle: f32(0.6), state: ObjSta.STAND });
  });

  it('the ghost chases with TURNMOVE toward the destination', () => {
    expect(getDegreeX([100, 110, 90], [100, 100, 100])).toBeCloseTo(-45, 4); // a target above is nose up
    expect(getDegreeX([100, 90, 90], [100, 100, 100])).toBeCloseTo(45, 4);
    const s = flier({ pos: [100, 100, 100], state: ObjSta.FMOVE | ObjSta.RTURN, stateFlag: ObjStaF.FLY });
    expect(approachFlight(s, [100, 110, 90], 10)).toBe(9);
    expect(s.angle).toBe(setAngle(0));
    expect(s.angleX).toBe(-45); // (int)GetDegreeX
    expect(s.stateFlag & ObjStaF.ACC).toBe(ObjStaF.ACC);
    expect(s.state & ObjSta.TURN_ALL).toBe(0);
    expect(s.delta[1]).toBeGreaterThan(0);
    expect(s.delta[2]).toBeLessThan(0);
    // m_fDistance = |dest - pos|, f = 2·dist / (0.10·n²)
    const f = (2 * Math.hypot(10, 10)) / (0.1 * 10 * 10);
    expect(Math.hypot(...s.delta)).toBeCloseTo(f * Math.hypot(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4) * Math.cos(Math.PI / 4)), 4);
    const done = flier({ pos: [100, 100, 100] });
    expect(approachFlight(done, [100, 110, 90], 0)).toBe(0);
    expect(done.delta).toEqual([0, 0, 0]);
  });
});
