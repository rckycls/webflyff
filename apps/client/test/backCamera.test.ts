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
});
