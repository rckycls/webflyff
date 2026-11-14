// 2026-11-15 (housing): the furniture core's collision (ProcessObjCollision) and boxes (UpdateLocalMatrix, BBOX::UpdateMartix).
import { describe, expect, it } from 'vitest';
import {
  collides, keptAngle, meshesMeet, obbOf, obbTriangles, obbsIntersect, placedMatrix, transform, worldTriangles,
} from '../src/world/furniture/placementRules';
import type { ModelBox, Obb, RoomShell } from '../src/world/furniture/placementRules';

const UNIT: ModelBox = { min: [-1, 0, -1], max: [1, 2, 1] };
const close = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 5));

/** A room 20 x 10 x 20 around (250, 100, 240): four walls as two triangles each, no floor (the floor is the land). */
function room(): RoomShell {
  const [x0, x1, y0, y1, z0, z1] = [240, 260, 100, 110, 230, 250];
  const quad = (a: number[], b: number[], c: number[], d: number[]): number[] => [...a, ...b, ...c, ...a, ...c, ...d];
  const triangles = new Float32Array([
    ...quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]),
    ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    ...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
    ...quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]),
  ]);
  const obb: Obb = { center: [250, 105, 240], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], extents: [10, 5, 10] };
  return { obb, triangles };
}

function piece(pos: [number, number, number], angle = 0, scale = 1) {
  const m = placedMatrix(scale, angle, pos);
  const obb = obbOf(UNIT, m);
  return { obb, triangles: obbTriangles(obb) };
}

describe('the placed matrix and box (UpdateLocalMatrix, BBOX::UpdateMartix)', () => {
  it('turns by -angle about Y as RotationYawPitchRoll( -angle ) does, then moves', () => {
    const m = placedMatrix(1, 90, [10, 0, 20]);
    close(transform(m, [1, 0, 0]), [10, 0, 21]); // x' = x cos a - z sin a, z' = x sin a + z cos a
    close(transform(m, [0, 0, 1]), [9, 0, 20]);
  });

  it('keeps the box centre, half sizes times the scale, and the rotation rows', () => {
    const obb = obbOf(UNIT, placedMatrix(0.7, 0, [5, 100, 5]));
    close(obb.center, [5, 100.7, 5]);
    close(obb.extents, [0.7, 0.7, 0.7]);
    close(obb.axes[0], [1, 0, 0]);
  });

  it('cuts the angle to 65536ths of a turn, in 0..360 (SetAngle)', () => {
    expect(keptAngle(45)).toBeCloseTo(45, 2);
    expect(keptAngle(-45)).toBeCloseTo(315, 2);
    expect(keptAngle(360)).toBe(0);
  });
});

describe('TestOBBIntersect', () => {
  it('meets when the boxes overlap, also turned, and not when apart', () => {
    expect(obbsIntersect(piece([0, 0, 0]).obb, piece([1.5, 0, 0]).obb)).toBe(true);
    expect(obbsIntersect(piece([0, 0, 0]).obb, piece([2.5, 0, 0]).obb)).toBe(false);
    // turned 45 degrees the corner reaches sqrt(2): 2.3 apart now meets
    expect(obbsIntersect(piece([0, 0, 0], 45).obb, piece([2.3, 0, 0]).obb)).toBe(true);
    expect(obbsIntersect(piece([0, 0, 0], 45).obb, piece([2.5, 0, 0]).obb)).toBe(false);
  });
});

describe('ProcessObjCollision', () => {
  it('never collides without the wall', () => {
    expect(collides(piece([0, 0, 0]), null, [])).toBe(false);
  });

  it('is free inside the room, and collides out of it, on a wall, or on another piece', () => {
    const shell = room();
    expect(collides(piece([250, 100, 240]), shell, [])).toBe(false);
    expect(collides(piece([300, 100, 240]), shell, [])).toBe(true); // out of the wall's box
    expect(collides(piece([259.5, 100, 240]), shell, [])).toBe(true); // through the x1 wall
    expect(collides(piece([250, 100, 240]), shell, [piece([251, 100, 240]).obb])).toBe(true);
    expect(collides(piece([250, 100, 240]), shell, [piece([255, 100, 240]).obb])).toBe(false);
  });

  it('tests the mesh it is given in the world (worldTriangles)', () => {
    const tri = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
    const wall = new Float32Array([0, 1, -1, 0, 1, 1, 0, 3, 0]); // crosses tri's plane through its middle
    expect(meshesMeet(wall, worldTriangles(tri, placedMatrix(1, 0, [0, 0, 0])))).toBe(true);
    expect(meshesMeet(wall, worldTriangles(tri, placedMatrix(1, 0, [0, 0, 5])))).toBe(false);
  });
});
