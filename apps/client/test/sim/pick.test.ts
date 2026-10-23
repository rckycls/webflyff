import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { HAttr } from '../../src/world/sim/collision';
import type { CollisionObject, Ground } from '../../src/world/sim/collision';
import { clientPointToVector } from '../../src/world/sim/pick';

const MPU = 4;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The plane x = `x` from height 0 to 20 and z 80 to 120, facing -x (`facing` -1) or +x (1). */
function wallAt(x: number, pick: boolean, facing: -1 | 1 = -1): CollisionObject {
  const a: Vec3 = [x, 0, 120];
  const b: Vec3 = [x, 20, 120];
  const c: Vec3 = [x, 0, 80];
  const d: Vec3 = [x, 20, 80];
  const tris = facing === -1 ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
  return { triangles: new Float32Array(tris.flat()), matrix: IDENTITY, pick };
}

function ground(
  height: (x: number, z: number) => number | null, objectsNear: (x: number, z: number) => CollisionObject[] = () => [],
): Ground {
  return { terrainHeight: height, landAttr: () => HAttr.NONE, objectsNear };
}

const flat = (h: number) => ground(() => h);

function expectNear(actual: Vec3 | null, expected: Vec3, digits = 3): void {
  expect(actual).not.toBeNull();
  actual!.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));
}

describe('clientPointToVector (CWorld::ClientPointToVector, World3D.cpp:2318-2462)', () => {
  it('flat land: where the ray meets it', () => {
    // from 10 over the land, 0.5 east and 0.25 north for each 1 down: 10 down at (105, 102.5)
    expectNear(clientPointToVector([100, 15, 100], [0.5, -1, 0.25], flat(5), MPU), [105, 5, 102.5]);
  });

  it('sloped land: on the slope', () => {
    // y = 0.1 x; the ray y = 30 - t, x = 100 + t meets it at t = 20 / 1.1
    const t = 20 / 1.1;
    expectNear(clientPointToVector([100, 30, 100], [1, -1, 0], ground((x) => 0.1 * x), MPU), [100 + t, 30 - t, 100]);
  });

  it('nothing where no land is loaded', () => {
    expect(clientPointToVector([100, 15, 100], [0.5, -1, 0.25], ground(() => null), MPU)).toBeNull();
  });

  it('the land is looked for out to half the far plane, 256 m from the camera', () => {
    // 10 m down at a slope of 1 in 20 is 200 m out; at 1 in 50, 500 m
    expectNear(clientPointToVector([100, 15, 100], [1, -0.05, 0], flat(5), MPU), [300, 5, 100], 2);
    expect(clientPointToVector([100, 15, 100], [1, -0.02, 0], flat(5), MPU)).toBeNull();
  });

  it('land seen from below is not picked (__FIX_PICKING)', () => {
    expect(clientPointToVector([100, 0, 100], [0.3, 1, 0.2], flat(5), MPU)).toBeNull();
  });

  it('a pickable object nearer than the land is picked; the land is, where it is nearer', () => {
    // the ray from (100, 6, 100) meets the land at height 5 20 m out
    const near = wallAt(103, true);
    expectNear(clientPointToVector([100, 6, 100], [1, -0.05, 0], ground(() => 5, () => [near]), MPU), [103, 5.85, 100]);
    const far = wallAt(130, true);
    expectNear(clientPointToVector([100, 6, 100], [1, -0.05, 0], ground(() => 5, () => [far]), MPU), [120, 5, 100]);
  });

  it('an object that does not pick (bPick 0) lets the ray through to the land behind it', () => {
    const tree = wallAt(103, false);
    expectNear(clientPointToVector([100, 6, 100], [1, -0.05, 0], ground(() => 5, () => [tree]), MPU), [120, 5, 100]);
  });

  it('an object seen from behind is not picked (IsTouchRayTri is one-sided)', () => {
    const back = wallAt(103, true, 1);
    expectNear(clientPointToVector([100, 6, 100], [1, -0.05, 0], ground(() => 5, () => [back]), MPU), [120, 5, 100]);
  });

  it('an object with no land behind it is picked', () => {
    const near = wallAt(103, true);
    expectNear(clientPointToVector([100, 6, 100], [1, -0.05, 0], ground(() => null, () => [near]), MPU), [103, 5.85, 100]);
  });

  it('looks for the objects all along the ray, not only around the camera', () => {
    // the wall 25 m out is listed only around it
    const wall = wallAt(125, true);
    const g = ground(() => 5, (x) => (x > 115 ? [wall] : []));
    expectNear(clientPointToVector([100, 8, 100], [1, -0.05, 0], g, MPU), [125, 6.75, 100]);
  });

  it('a placed object is tested in its own space: a wall turned and moved by its world matrix', () => {
    // the wall at x = 3 of the model, facing -x there, turned 90 degrees about y (x to -z) and moved to (100, 0, 110):
    // in the world it stands at z = 107, facing +z... a ray going -z from (100, 6, 120) meets it
    const turned = new Float32Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 100, 0, 110, 1]);
    const tris = wallAt(3, true).triangles.map((v, i) => (i % 3 === 2 ? v - 100 : v));
    const wall: CollisionObject = { triangles: tris, matrix: turned, pick: true };
    const point = clientPointToVector([100, 6, 120], [0, -0.05, -1], ground(() => 5, () => [wall]), MPU);
    expectNear(point, [100, 6 - 0.05 * 13, 107]);
  });
});
