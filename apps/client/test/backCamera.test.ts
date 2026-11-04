import { describe, expect, it } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import { CHASE_PITCH, chaseCamera } from '@flyffweb/scene';
import { BackCamera } from '../src/world/backCamera';
import { HAttr } from '../src/world/sim/collision';
import type { CollisionObject, Ground } from '../src/world/sim/collision';
import { add, normalize, scale, sub, vecLength } from '../src/world/sim/d3dx';

const f32 = Math.fround;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The plane x = -2 from height 0 to 10 and z -5 to 5, facing +x (toward the mover at the origin). */
const WALL: CollisionObject = {
  triangles: new Float32Array([-2, 0, 5, -2, 0, -5, -2, 10, 5, -2, 10, 5, -2, 0, -5, -2, 10, -5]), matrix: IDENTITY,
};

/** Flat land at height 0 and the objects the test puts in `objects` (D3D). */
function world(): { ground: Ground; objects: CollisionObject[] } {
  const objects: CollisionObject[] = [];
  return { objects, ground: { terrainHeight: () => 0, landAttr: () => HAttr.NONE, objectsNear: () => objects } };
}

/** The look-at point (`m_vLookAt`) and where the chase camera would be (`m_vPos`): the wall is between them. */
const TARGET: Vec3 = [0, 1, 0];
const EYE: Vec3 = [-4, 3, 0];
/** `CheckBound`'s hit on the wall, and its `fLength`. */
const HIT: Vec3 = [-2, 2, 0];
const HIT_LENGTH = vecLength(sub(HIT, TARGET));
const FULL_LENGTH = vecLength(sub(EYE, TARGET));
/** `m_fLength2 += 0.37f` (`__CAM_FAST_RECOVER`). */
const EASE = f32(0.37);
/** Where `CBackCamera::Process` puts the camera `length` out from the look-at point toward where it would be. */
const along = (length: number): Vec3 => add(TARGET, scale(normalize(sub(EYE, TARGET)), length));

describe('BackCamera (CBackCamera::Process, Camera.cpp:398-423)', () => {
  it('nothing in the way: the camera is where the chase camera puts it', () => {
    const { ground } = world();
    expect(new BackCamera().bound(TARGET, EYE, ground)).toEqual(EYE);
  });

  it('a wall in the way pulls the camera in front of it at once (CheckBound)', () => {
    const { ground, objects } = world();
    objects.push(WALL);
    const camera = new BackCamera();
    expect(camera.bound(TARGET, EYE, ground)).toEqual(HIT);
    expect(camera.bound(TARGET, EYE, ground)).toEqual(HIT);
  });

  it('once the way is clear the camera eases back out 0.37 a step, then is where it would be', () => {
    const { ground, objects } = world();
    objects.push(WALL);
    const camera = new BackCamera();
    camera.bound(TARGET, EYE, ground); // m_fLength2 = the hit's fLength
    objects.length = 0;

    // m_bOld and no hit now: m_bStart; m_fLength2 grows by 0.37 a step from the hit's length, and the step that takes
    // it past the free length (the 7th: 2.236 + 7 x 0.37 > 4.472) ends the easing, a little past where it would be
    let length = HIT_LENGTH;
    for (let k = 1; k <= 7; k++) {
      length = f32(length + EASE);
      expect(camera.bound(TARGET, EYE, ground), `step ${k}`).toEqual(along(length));
    }
    expect(length).toBeGreaterThan(FULL_LENGTH);
    expect(f32(length - EASE)).toBeLessThanOrEqual(FULL_LENGTH);
    expect(camera.bound(TARGET, EYE, ground)).toEqual(EYE);
    expect(camera.bound(TARGET, EYE, ground)).toEqual(EYE);
  });

  it('a line that grazes the wall every other step keeps the camera near, instead of jumping between near and far', () => {
    const { ground, objects } = world();
    const camera = new BackCamera();
    const distances: number[] = [];
    for (let step = 0; step < 12; step++) {
      objects.length = 0;
      if (step % 2 === 0) objects.push(WALL);
      distances.push(vecLength(sub(camera.bound(TARGET, EYE, ground), TARGET)));
    }
    // the first hit is the wall; after that a hit during the easing ends it one step on (m_fLength2 = fLength, + 0.37),
    // and the step clear after it starts it again from there: 2.6 and 3.0 out, never the 4.5 of the way clear
    expect(distances[0]).toBe(HIT_LENGTH);
    for (const d of distances.slice(1)) expect(d).toBeLessThan(3.1);
    expect(Math.max(...distances)).toBeGreaterThan(HIT_LENGTH);
  });

  it('follow: the chase camera behind the mover, its target as it is and its position kept out of the objects (D3D)', () => {
    const { ground } = world();
    // the mover at web (10, 0, -20) facing angle 90 (D3D +x): the camera is behind it, to the west
    const at: Vec3 = [10, 0, -20];
    const chase = chaseCamera(at, Math.PI - Math.PI / 2, CHASE_PITCH);
    const free = new BackCamera().follow(at, 90, ground);
    expect(free.target).toEqual(chase.target);
    free.position.forEach((v, i) => expect(v).toBeCloseTo(chase.position[i]!, 4));
    expect(free.position[0]).toBeLessThan(at[0] - 10);

    // a wall 2 m west of the mover, across the whole view (D3D x = 8, facing +x, any z): the camera stops at it
    const wall: CollisionObject = {
      triangles: new Float32Array([8, -50, 50, 8, -50, -50, 8, 50, 50, 8, 50, 50, 8, -50, -50, 8, 50, -50]), matrix: IDENTITY,
    };
    const walled: Ground = { ...ground, objectsNear: () => [wall] };
    const camera = new BackCamera();
    const view = camera.follow(at, 90, walled);
    expect(view.target).toEqual(chase.target);
    expect(view.position[0]).toBeCloseTo(8, 4);
    expect(camera.view).toBe(view);
    expect(toWebPosition(view.position)[2]).toBeCloseTo(20, 4);
  });

  it('keeps the camera direction when the character turns and follows camera drag immediately', () => {
    const { ground } = world();
    const camera = new BackCamera();
    const before = camera.follow([0, 0, 0], 90, ground);
    expect(camera.follow([0, 0, 0], 270, ground)).toEqual(before);
    camera.rotate(100, 0);
    expect(camera.follow([0, 0, 0], 270, ground).position).not.toEqual(before.position);
  });

  it('reverses both drag axes from the original camera direction', () => {
    const camera = new BackCamera();
    camera.follow([0, 0, 0], 90, world().ground);
    const heading = camera.heading!;
    const pitch = camera.pitch;
    camera.rotate(20, 20);
    expect(camera.heading!).toBeGreaterThan(heading);
    expect(camera.pitch).toBeLessThan(pitch);
  });

  it('eases relocation over half a second while keeping free camera direction', () => {
    const { ground } = world();
    const camera = new BackCamera();
    camera.follow([0, 0, 0], 90, ground);
    camera.relocate();
    expect(camera.follow([100, 0, 0], 270, ground).target[0]).toBe(0);
    for (let i = 0; i < 15; i++) camera.follow([100, 0, 0], 270, ground);
    expect(camera.view!.target[0]).toBeCloseTo(50);
    for (let i = 0; i < 15; i++) camera.follow([100, 0, 0], 270, ground);
    expect(camera.view!.target[0]).toBe(100);
  });
});

describe('the flight camera (Piece 7 M5, CBackCamera::Process in flight, Camera.cpp:184-446)', () => {
  const open: Ground = { terrainHeight: () => 0, landAttr: () => HAttr.NONE, objectsNear: () => [] };
  /** The mover at D3D (100, 50, 100), as the web position `followFlight` takes. */
  const AT_D3D: Vec3 = [100, 50, 100];
  const AT = toWebPosition(AT_D3D);
  const settle = (camera: BackCamera, angle: number, angleX = 0, acc = false, turbo = false, n = 200) => {
    let view = camera.followFlight(AT, angle, angleX, acc, turbo, open);
    for (let i = 1; i < n; i++) view = camera.followFlight(AT, angle, angleX, acc, turbo, open);
    return { ...view, d3d: toWebPosition(view.position), look: toWebPosition(view.target) };
  };

  it('in flight the camera follows the heading', () => {
    const north = settle(new BackCamera(), 0); // angle 0 faces -Z: the camera is behind, at +Z
    expect(north.d3d[2]).toBeGreaterThan(AT_D3D[2] + 14);
    expect(north.d3d[0]).toBeCloseTo(AT_D3D[0], 3);
    expect(north.look).toEqual([AT_D3D[0], f32(AT_D3D[1] + 1.3), AT_D3D[2]].map((v, i) => (i === 1 ? expect.closeTo(v, 5) : v)));
    const east = settle(new BackCamera(), 90); // angle 90 faces +X: the camera at -X
    expect(east.d3d[0]).toBeLessThan(AT_D3D[0] - 14);
    expect(east.fov).toBe(45);
  });

  it('angleX lifts the pitch, up to 80', () => {
    const height = (angleX: number) => settle(new BackCamera(), 0, angleX).d3d[1] - (AT_D3D[1] + 0.9);
    // m_fRoty -12 + m_fZoom 6 * 4 + angleX, the offset (0, 0, -16) turned up by it
    expect(height(0)).toBeCloseTo(16 * Math.sin((12 * Math.PI) / 180), 3);
    expect(height(30)).toBeCloseTo(16 * Math.sin((42 * Math.PI) / 180), 3);
    expect(height(90)).toBeCloseTo(16 * Math.sin((80 * Math.PI) / 180), 3);
  });

  it('the offset eases a tenth a step', () => {
    const camera = new BackCamera();
    const before = settle(camera, 0).d3d;
    const after = toWebPosition(camera.followFlight(AT, 90, 0, false, false, open).position);
    const dest = settle(new BackCamera(), 90).d3d;
    for (let i = 0; i < 3; i++) expect(after[i]!).toBeCloseTo(before[i]! + (dest[i]! - before[i]!) / 10, 3);
  });

  it('turbo widens the view to 90° and brings the camera to 2 m', () => {
    const camera = new BackCamera();
    const cruise = settle(camera, 0, 0, true, false, 20);
    expect(cruise.fov).toBe(45);
    const turbo = settle(camera, 0, 0, true, true, 200);
    expect(turbo.fov).toBe(90);
    const eye: Vec3 = [AT_D3D[0], AT_D3D[1] + 0.9, AT_D3D[2]];
    expect(vecLength(sub(turbo.d3d, eye))).toBeCloseTo(2, 3);
    // the turbo off, with the thrust on, the view narrows back by 0.05 a step
    const back = camera.followFlight(AT, 0, 0, true, false, open);
    expect(back.fov).toBeCloseTo(180 / 2.05, 3);
    // without the thrust it is 45 at once (m_nZoomLevel 0)
    expect(camera.followFlight(AT, 0, 0, false, false, open).fov).toBe(45);
  });

  it('back on the ground the camera keeps its heading (Decision 8)', () => {
    const camera = new BackCamera();
    settle(camera, 90);
    camera.follow(AT, 0, open);
    expect(camera.heading).toBeCloseTo(Math.PI - Math.PI / 2, 6);
  });
});

describe('the flight camera turns with the arrows (Piece 7 M5, Decision 3)', () => {
  it('rotate() swings it round the flier, and a new flight starts straight behind', () => {
    const open: Ground = { terrainHeight: () => 0, landAttr: () => HAttr.NONE, objectsNear: () => [] };
    const at = toWebPosition([100, 50, 100] as Vec3);
    const camera = new BackCamera();
    const behind = () => {
      let v = camera.followFlight(at, 0, 0, false, false, open);
      for (let i = 0; i < 200; i++) v = camera.followFlight(at, 0, 0, false, false, open);
      return toWebPosition(v.position);
    };
    const straight = behind();
    expect(straight[0]).toBeCloseTo(100, 3);
    for (let i = 0; i < 30; i++) camera.rotate(4, 0); // ArrowRight held half a second
    const swung = behind();
    expect(Math.abs(swung[0] - 100)).toBeGreaterThan(1);
    camera.follow(at, 0, open); // landed
    expect(behind()[0]).toBeCloseTo(100, 3); // the next flight's camera starts unturned (Unlock)
  });
});
