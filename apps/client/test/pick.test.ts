import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { objectLocalMatrix, toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import { intersectBB, moverMatrix, pickMover, pickRay, pickTap } from '../src/world/render/picking';
import type { PickCandidate } from '../src/world/render/picking';
import { terrainGround } from '../src/world/sim/collision';
import { FAR_PLANE } from '../src/world/sim/pick';

/**
 * `CObj::m_matWorld` of a mover at `pos` turned `angle` degrees with scale `scale`, from the formats package's
 * `objectLocalMatrix` (scale, then rotation, then translation: `CObj::UpdateLocalMatrix`), as an oracle for
 * `moverMatrix`: the record's other fields are not read.
 */
function worldOf(pos: Vec3, angle = 0, scale = 1): Float32Array {
  return objectLocalMatrix({
    objType: 5, angle, axis: [0, 0, 0], position: pos, scale: [scale, scale, scale], type: 5, index: 0, motion: 0, ai: 0, ai2: 0,
    extraBytes: 0,
  });
}

/** A unit-ish mover: a box half a metre round its origin, a person's height above it. */
function candidate(objectId: number, pos: Vec3, parts: Partial<PickCandidate> = {}): PickCandidate {
  return {
    objectId, box: { min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }, world: worldOf(pos), dead: false, isPlayer: false, ...parts,
  };
}

/**
 * A ray from just off the origin along +z, one unit of `dir` per metre. Its x and y are chosen to fall on none of the
 * diagonals that cut the faces of the boxes below into triangles.
 */
const ORIG: Vec3 = [0.1, 0.4, 0];
const ALONG_Z: Vec3 = [0, 0, 1];

describe('pickMover (CWorld::PickObject_Fast, World3D.cpp:2655-2733)', () => {
  it('takes the nearer mover by origin, even when the farther one\'s box is hit nearer', () => {
    // A's origin is 10 m out but its box reaches back to 2 m; B's origin is 5 m out and its box is hit at 4.5 m
    const far = candidate(1, [0, 0, 10], { box: { min: [-1, 0, -8], max: [1, 1, 1] } });
    const near = candidate(2, [0, 0, 5]);
    expect(pickMover(ORIG, ALONG_Z, [far, near], FAR_PLANE)).toBe(2);
    // the order of the candidates is not the order of the pick
    expect(pickMover(ORIG, ALONG_Z, [near, far], FAR_PLANE)).toBe(2);
  });

  it('falls to the next mover when the nearest by origin is not hit', () => {
    const aside = candidate(1, [3, 0, 4]);
    const behind = candidate(2, [0, 0, 9]);
    expect(pickMover(ORIG, ALONG_Z, [aside, behind], FAR_PLANE)).toBe(2);
    expect(pickMover(ORIG, ALONG_Z, [aside], FAR_PLANE)).toBeNull();
    expect(pickMover(ORIG, ALONG_Z, [], FAR_PLANE)).toBeNull();
  });

  it('skips a dead monster, but not a dead player', () => {
    const deadMonster = candidate(1, [0, 0, 5], { dead: true });
    const alive = candidate(2, [0, 0, 9]);
    expect(pickMover(ORIG, ALONG_Z, [deadMonster, alive], FAR_PLANE)).toBe(2);
    expect(pickMover(ORIG, ALONG_Z, [deadMonster], FAR_PLANE)).toBeNull();

    const deadPlayer = candidate(3, [0, 0, 5], { dead: true, isPlayer: true });
    expect(pickMover(ORIG, ALONG_Z, [deadPlayer, alive], FAR_PLANE)).toBe(3);
  });

  it('does not pick a model with no box (the empty box CModel::IsNullBoundBox names)', () => {
    const boxless = candidate(1, [0, 0, 5], { box: { min: [0, 0, 0], max: [0, 0, 0] } });
    const alive = candidate(2, [0, 0, 9]);
    expect(pickMover(ORIG, ALONG_Z, [boxless, alive], FAR_PLANE)).toBe(2);
    // a flat box (min equals max on one axis only) is a box
    const flat = candidate(3, [0, 0, 5], { box: { min: [-1, 0, 0], max: [1, 2, 0] } });
    expect(pickMover([0.1, 1.5, 0], ALONG_Z, [flat], FAR_PLANE)).toBe(3);
  });

  it('tests the box oriented and scaled as the mover stands: the faces of its world matrix', () => {
    // a plank 4 m long (x) and half a metre across (z), a metre high, at (10, 0, 20) turned 45 degrees (its length
    // then runs along +x +z in D3D) and scaled by 1.5: 6 m long, 0.75 across, 1.5 high
    const plank = (scale: number): PickCandidate => candidate(1, [10, 0, 20], {
      box: { min: [-2, 0, -0.25], max: [2, 1, 0.25] }, world: worldOf([10, 0, 20], 45, scale),
    });
    const down: Vec3 = [0, -1, 0];
    const from = (x: number, z: number): Vec3 => [x, 10, z];
    // on its length, 2.12 m out from the middle
    expect(pickMover(from(11.5, 21.5), down, [plank(1.5)], FAR_PLANE)).toBe(1);
    // the other diagonal is across it, and a box of the world's axes round it would have been hit there
    expect(pickMover(from(11.5, 18.5), down, [plank(1.5)], FAR_PLANE)).toBeNull();
    // 2.5 m out along its length: only the scaled box reaches that far
    expect(pickMover(from(10 + 2.5 * Math.SQRT1_2, 20 + 2.5 * Math.SQRT1_2), down, [plank(1.5)], FAR_PLANE)).toBe(1);
    expect(pickMover(from(10 + 2.5 * Math.SQRT1_2, 20 + 2.5 * Math.SQRT1_2), down, [plank(1)], FAR_PLANE)).toBeNull();
    // the scale also lifts the top to 1.5 m: a level ray at 1.2 m across the plank meets it only scaled
    expect(pickMover([10, 1.2, 12], [0, 0, 1], [plank(1.5)], FAR_PLANE)).toBe(1);
    expect(pickMover([10, 1.2, 12], [0, 0, 1], [plank(1)], FAR_PLANE)).toBeNull();
  });

  it('takes the first hit under the far plane, in lengths of the ray\'s direction', () => {
    // GetPickRay's direction is one unit along the view axis, not of length one: its distances are those of the depth
    const hitAt = (z: number): PickCandidate => candidate(1, [0, 0, z]);
    expect(pickMover(ORIG, [0, 0, 2], [hitAt(100)], 50)).toBe(1); // the box is hit at z 99.5: 49.75 lengths
    expect(pickMover(ORIG, [0, 0, 2], [hitAt(100)], 49)).toBeNull();
    // a hit at or past the plane is passed over, and the next mover by origin is tried
    const reaching = candidate(2, [0, 0, 5], { box: { min: [-0.5, 0, 6], max: [0.5, 1.8, 7] } }); // hit at z 11
    expect(pickMover(ORIG, ALONG_Z, [reaching, candidate(3, [0, 0, 8])], 10)).toBe(3);
    expect(pickMover(ORIG, ALONG_Z, [reaching], 10)).toBeNull();
    expect(pickMover(ORIG, ALONG_Z, [reaching], 11.5)).toBe(2);
  });

  it('takes the world matrix as a plain array or as floats', () => {
    const plain = candidate(1, [0, 0, 5], { world: Array.from(worldOf([0, 0, 5])) });
    expect(pickMover(ORIG, ALONG_Z, [plain], FAR_PLANE)).toBe(1);
  });
});

describe('intersectBB (CModel::IntersectBB, Model.cpp:104-144)', () => {
  const unit = { min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 };
  const at = (z: number) => worldOf([0, 0, z]);

  it('gives the distance of the first triangle of its table the ray meets, from either side', () => {
    // along +z the table's z-min face (z 4) comes before the z-max face (z 6): the near one
    expect(intersectBB([0.3, 0.2, 0], [0, 0, 1], at(5), unit)).toBeCloseTo(4, 5);
    // along -z it is still the z-min face that comes first, now the far one: the table's order, not the nearer hit
    expect(intersectBB([0.3, 0.2, 20], [0, 0, -1], at(5), unit)).toBeCloseTo(16, 5);
    // behind the ray's start there is nothing
    expect(intersectBB([0.3, 0.2, 10], [0, 0, 1], at(5), unit)).toBeNull();
    // all six faces are in the table: a ray along each axis meets the box (centre (0, 0, 5)), its other two
    // coordinates off the diagonals
    const centre: Vec3 = [0, 0, 5];
    const off: Vec3 = [0.3, 0.2, 5.1];
    for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as Vec3[]) {
      const orig = off.map((v, i) => (dir[i] === 0 ? v : centre[i]! - 4 * dir[i]!)) as Vec3;
      expect(intersectBB(orig, dir, at(5), unit)).not.toBeNull();
    }
  });

  it('uses the corners as SetBB lays them out, for a box that is not centred', () => {
    const box = { min: [2, 0, 0] as Vec3, max: [3, 1, 1] as Vec3 };
    expect(intersectBB([2.4, 0.3, -3], [0, 0, 1], at(0), box)).toBeCloseTo(3, 5);
    expect(intersectBB([0.4, 0.3, -3], [0, 0, 1], at(0), box)).toBeNull();
  });
});

describe('moverMatrix (CObj::UpdateLocalMatrix, Obj.cpp:126-137)', () => {
  it('is scale, then the turn about the y axis by minus the angle, then the translation', () => {
    for (const [pos, angle, scale] of [
      [[0, 0, 0], 0, 1], [[6970.5, 100.25, 3330.75], 90, 1.5], [[-3, 8, 12], 213.7, 0.4], [[1, 2, 3], 359.9, 2],
    ] as Array<[Vec3, number, number]>) {
      const got = moverMatrix(pos, angle, scale);
      const want = worldOf(pos, angle, scale);
      expect(got).toHaveLength(16);
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 4));
    }
  });
});

describe('pickRay (GetPickRay, vutil.cpp:577-595)', () => {
  /** At the origin looking down the web -z axis (D3D +z), 45 degrees up and down, twice as wide as high. */
  function camera(): PerspectiveCamera {
    const c = new PerspectiveCamera(45, 2, 0.5, 1000);
    c.position.set(3, 4, 5);
    c.updateMatrixWorld();
    return c;
  }

  it('starts at the camera and goes one unit along the view axis, in D3D coordinates', () => {
    const ray = pickRay(camera(), 0, 0)!;
    expect(ray.orig).toEqual(toWebPosition([3, 4, 5]));
    expect(ray.dir[0]).toBeCloseTo(0, 6);
    expect(ray.dir[1]).toBeCloseTo(0, 6);
    expect(ray.dir[2]).toBeCloseTo(1, 6);
    // the edge of the picture: x by tan(22.5 degrees) times the aspect, y by tan(22.5 degrees)
    const corner = pickRay(camera(), 1, 1)!;
    expect(corner.dir[0]).toBeCloseTo(Math.tan(Math.PI / 8) * 2, 5);
    expect(corner.dir[1]).toBeCloseTo(Math.tan(Math.PI / 8), 5);
    expect(corner.dir[2]).toBeCloseTo(1, 6);
  });
});

describe('pickTap', () => {
  // flat land at height 5 (D3D); the camera 10 m over (100, 100), looking straight down at it
  const ground = terrainGround(() => 5);
  const camera = new PerspectiveCamera(45, 2, 0.5, 1000);
  camera.position.set(...toWebPosition([100, 15, 100]));
  camera.lookAt(...toWebPosition([100, 5, 100.001]));
  camera.updateMatrixWorld();
  // a mover 1.8 m tall standing on that spot (a little off, so that the ray is not on a diagonal of its top)
  const mover = candidate(7, [100.2, 5, 99.9]);

  it('gives the mover a tap lands on, and the point of the land beside it', () => {
    expect(pickTap(camera, 0, 0, ground, 4, [mover])).toEqual({ mover: 7 });
    const beside = pickTap(camera, 0.5, 0, ground, 4, [mover]);
    expect(beside).toHaveProperty('point');
    const point = (beside as { point: Vec3 }).point;
    expect(point[1]).toBeCloseTo(5, 3);
    expect(Math.hypot(point[0] - 100, point[2] - 100)).toBeGreaterThan(3);
  });

  it('walks where it lands when no mover is there, and gives nothing where there is no land', () => {
    const hit = pickTap(camera, 0, 0, ground, 4, []) as { point: Vec3 };
    expect(hit.point[0]).toBeCloseTo(100, 3);
    expect(hit.point[1]).toBeCloseTo(5, 4);
    expect(hit.point[2]).toBeCloseTo(100, 2);
    expect(pickTap(camera, 0, 0, terrainGround(() => null), 4, [])).toBeNull();
  });
});
