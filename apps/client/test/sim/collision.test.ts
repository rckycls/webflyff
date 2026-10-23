import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { ActionMover } from '../../src/world/sim/ActionMover';
import type { MoverBody } from '../../src/world/sim/ActionMover';
import { cameraBound } from '../../src/world/sim/camera';
import {
  HAttr, NO_CEILING, landTriangle, overHeight, processCollision, processUnderCollision, terrainGround,
} from '../../src/world/sim/collision';
import type { CollisionObject, Ground } from '../../src/world/sim/collision';
import { ActMsg, ObjSta } from '../../src/world/sim/constants';

const f32 = Math.fround;

// ---- hand-made shapes ---------------------------------------------------------------------------------------------
// IsTouchRayTri (xUtil3D.cpp:230) is one-sided: a line meets a triangle only against its normal, cross( v1 - v0,
// v2 - v0 ). Each shape below lists its corners so that the normal faces the way its name says.

type Tri = [Vec3, Vec3, Vec3];

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function object(tris: Tri[], matrix: Float32Array = IDENTITY): CollisionObject {
  return { triangles: new Float32Array(tris.flat(2)), matrix };
}

/** The plane x = `x` between heights `y0`..`y1` and `z0`..`z1`, facing -x (`facing` -1) or +x (1). */
function wallX(x: number, y0: number, y1: number, z0: number, z1: number, facing: -1 | 1 = -1): Tri[] {
  const a: Vec3 = [x, y0, z1];
  const b: Vec3 = [x, y1, z1];
  const c: Vec3 = [x, y0, z0];
  const d: Vec3 = [x, y1, z0];
  return facing === -1 ? [[a, b, c], [b, d, c]] : [[a, c, b], [b, c, d]];
}

/** The plane z = `z` between `x0`..`x1` and heights `y0`..`y1`, facing +z (1) or -z (-1). */
function wallZ(z: number, x0: number, x1: number, y0: number, y1: number, facing: -1 | 1 = 1): Tri[] {
  const a: Vec3 = [x0, y0, z];
  const b: Vec3 = [x1, y0, z];
  const c: Vec3 = [x0, y1, z];
  const d: Vec3 = [x1, y1, z];
  return facing === 1 ? [[a, b, c], [b, d, c]] : [[a, c, b], [b, c, d]];
}

/** A surface facing up from (`x0`, `y0`) to (`x1`, `y1`) along x, `z0`..`z1` across (a ramp, or a deck when flat). */
function slopeX(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Tri[] {
  return [[[x0, y0, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z1], [x1, y1, z0], [x0, y0, z0]]];
}

/** The same surface facing down (a ceiling). */
function ceilingX(x0: number, x1: number, y: number, z0: number, z1: number): Tri[] {
  return slopeX(x0, y, x1, y, z0, z1).map(([a, b, c]) => [a, c, b] as Tri);
}

function ground(
  objects: CollisionObject[], terrain: (x: number, z: number) => number | null = () => 0,
  landAttr: (x: number, z: number) => number = () => HAttr.NONE,
): Ground {
  return { terrainHeight: terrain, landAttr, objectsNear: () => objects };
}

/** The cell size of the hand-made land below (a world's MPU). */
const MPU = 4;

/**
 * Hand-made land: one tile whose corner (gx, gz) is at height `h(gx, gz)`, with its triangles (`landTriangle`, the
 * copy of GetLandTri) and the bilinear height between corners (CLandscape::GetHeight).
 */
function land(h: (gx: number, gz: number) => number, objects: CollisionObject[] = []): Ground {
  const bilinear = (x: number, z: number): number => {
    const [fx, fz] = [x / MPU, z / MPU];
    const [px, pz] = [Math.floor(fx), Math.floor(fz)];
    const [dx, dz] = [fx - px, fz - pz];
    return h(px, pz) * (1 - dx) * (1 - dz) + h(px + 1, pz) * dx * (1 - dz) + h(px, pz + 1) * (1 - dx) * dz
      + h(px + 1, pz + 1) * dx * dz;
  };
  return {
    terrainHeight: bilinear, landAttr: () => HAttr.NONE, objectsNear: () => objects,
    landTri: (x, z, out) => landTriangle(x, z, MPU, (lx, lz, gx, gz) => (lx === 0 && lz === 0 ? h(gx, gz) : null), out),
  };
}

/** A mover at `pos` facing `angle`, running 0.1 a step (the sim tests' speed). */
function mover(angle: number, pos: Vec3 = [0, 0, 0], extra: Partial<MoverBody> = {}): ActionMover {
  return new ActionMover({ pos, angle, speed: 0.1, ...extra });
}

function running(angle: number, pos?: Vec3, extra?: Partial<MoverBody>): ActionMover {
  const act = mover(angle, pos, extra);
  act.sendActMsg(ActMsg.FORWARD);
  return act;
}

function steps(act: ActionMover, n: number, g?: Ground): void {
  for (let i = 0; i < n; i++) act.step(g);
}

function near(actual: number, expected: number, tolerance = 1e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

/**
 * A run at `angle` (0.1 a step): `line`, the knee test's vector (m_vDelta in x and z, sinf/cosf times 0.1f, times
 * 6.5f), and `dx`, `dz`, what a free step moves (that line times 1.0f / 6.5f).
 */
function runStep(angle: number): { line: Vec3; dx: number; dz: number } {
  const theta = f32(angle * f32(f32(3.141592654) / 180));
  const line: Vec3 = [f32(f32(f32(Math.sin(theta)) * f32(0.1)) * 6.5), 0, f32(f32(-f32(Math.cos(theta)) * f32(0.1)) * 6.5)];
  return { line, dx: f32(line[0] * f32(1 / 6.5)), dz: f32(line[2] * f32(1 / 6.5)) };
}

// ---- the knee-height test -----------------------------------------------------------------------------------------

describe('collision: walls (ProcessCollisionGround, CWorld::ProcessCollision, CObject3D::SlideVectorXZ2)', () => {
  it('a wall stops a mover running into it', () => {
    const g = ground([object(wallX(1, 0, 3, -5, 5))]);
    const act = running(90);
    const free = running(90);
    // the test line runs from the knee 6.5 steps ahead (0.65): through x = 0.3 it ends at 0.95, short of the wall
    for (let i = 0; i < 4; i++) {
      act.step(g);
      free.step();
      expect(act.body.pos).toEqual(free.body.pos);
    }
    // from x = 0.4 it reaches 1.05: the slide off a wall met head on has no x, so the mover stays, running
    const stopped = act.body.pos[0];
    near(stopped, 0.4);
    steps(act, 30, g);
    expect(act.body.pos[0]).toBe(stopped);
    expect(Math.abs(act.body.pos[2])).toBeLessThan(1e-7); // only the float cos(90 degrees)'s 4e-9 a step
    expect(act.body.pos[1]).toBe(0);
    expect(act.state).toBe(ObjSta.FMOVE);
  });

  it('running along a wall at 45 degrees slides', () => {
    const g = ground([object(wallX(1, 0, 3, -50, 50))]);
    const act = running(45, [0.5, 0, 0]);
    const { dx, dz } = runStep(45);
    // the first step is free (the line ends at 0.5 + 6.5 * 0.0707 = 0.96); the next one meets the wall
    act.step(g);
    expect(act.body.pos[0]).toBe(f32(0.5 + dx));
    const x = act.body.pos[0];
    // SlideVectorXZ2 (Object3D.cpp:1795-1823): the part of the line past the wall, (1 - t) of it, without its x
    const t = (1 - x) / (6.5 * dx);
    let z = act.body.pos[2];
    for (let i = 0; i < 20; i++) {
      act.step(g);
      expect(act.body.pos[0]).toBe(x);
      near(act.body.pos[2] - z, (1 - t) * dz, 1e-7);
      z = act.body.pos[2];
    }
    expect(z).toBeLessThan(-0.15);
  });

  it('a corner stops both ways', () => {
    const a = object(wallX(1, 0, 3, -5, 5)); // facing -x
    const b = object(wallZ(-1, -5, 5, 0, 3)); // facing +z
    const { dx, dz } = runStep(45);
    for (const order of [[a, b], [b, a]]) {
      const g = ground(order);
      const act = running(45, [0.5, 0, -0.5]);
      steps(act, 400, g);
      const at = act.body.pos;
      // the second step meets both walls (0.43 away, the line reaches 0.46); the first one listed gives the slide,
      // along it toward the other wall, at (1 - t) of the line, 0.00467 a step; once that slide reaches the other
      // wall (within 0.0303, so past z -0.9697) the second test meets it too, and two hits are no move: stopped both
      // ways, after 86 steps of sliding (the mirror images of each other, to the bit)
      if (order[0] === a) {
        expect(at[0]).toBe(f32(0.5 + dx));
        expect(at[2]).toBe(-0.9719995260238647);
      } else {
        expect(at[0]).toBe(0.9719995260238647);
        expect(at[2]).toBe(f32(-0.5 + dz));
      }
      steps(act, 10, g);
      expect(act.body.pos).toEqual(at);
      const out: Vec3 = [0, 0, 0];
      expect(processCollision(out, [at[0], f32(at[1] + 0.4), at[2]], runStep(45).line, g)).toBe(true);
      expect(out).toEqual([0, 0, 0]);
    }
  });

  it('a wall lower than the knee is run through; one up to the knee stops the mover', () => {
    // the line is at f32(0.4) over the feet; IsTouchRayTri's bounds are inclusive, so a top edge exactly there counts
    const knee = f32(0.4);
    const low = running(90);
    steps(low, 20, ground([object(wallX(1, 0, knee - 2 ** -25, -5, 5))]));
    near(low.body.pos[0], 2);
    const atKnee = running(90);
    steps(atKnee, 20, ground([object(wallX(1, 0, knee, -5, 5))]));
    near(atKnee.body.pos[0], 0.4);
  });

  it('a wall seen from behind does not stop a mover, and one already touched is left freely', () => {
    const g = ground([object(wallX(1, 0, 3, -5, 5))]); // facing -x
    const behind = running(270, [1.5, 0, 0]); // running -x, into its back
    steps(behind, 10, g);
    near(behind.body.pos[0], 0.5);
    // the knee on the wall itself: the line meets it at t = 0 and the head-on slide is nothing; away from it, it is free
    const touching = running(90, [1, 0, 0]);
    steps(touching, 5, g);
    expect(touching.body.pos[0]).toBe(1);
    const leaving = running(270, [1, 0, 0]);
    steps(leaving, 5, g);
    near(leaving.body.pos[0], 0.5);
  });

  it('a mover touching a wall at 45 degrees slides along it', () => {
    const g = ground([object(wallX(1, 0, 3, -50, 50))]);
    const act = running(45, [1, 0, 0]);
    const { dz } = runStep(45);
    act.step(g);
    // t = 0: all of the line slides, so the mover goes its whole z
    expect(act.body.pos[0]).toBe(1);
    near(act.body.pos[2], dz, 1e-7);
  });

  it('a ramp steeper than the knee test stops the mover like a wall', () => {
    // slope 1: 6.5 steps ahead (0.65) it rises past the knee (0.4); the slide off it has no x (its normal's y is dropped)
    const steep = running(90);
    steps(steep, 30, ground([object(slopeX(1, 0, 3, 2, -5, 5))]));
    near(steep.body.pos[0], 0.8);
    expect(steep.body.pos[1]).toBe(0);
  });

  it('moves the line into model space with the inverse of the world matrix', () => {
    // a wall in the model's plane z = 0 (facing +z), turned 90 degrees about y (D3DXMatrixRotationY: x' = z, z' = -x),
    // scaled by 2 and put at x = 1: the plane x = 1 facing -x, as `wallX(1, ...)` is
    const placed = new Float32Array([0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1]);
    const model = object(wallZ(0, -2.5, 2.5, 0, 1.5, -1), placed);
    const world = object(wallX(1, 0, 3, -5, 5));
    for (const angle of [90, 45]) {
      const a = running(angle);
      const b = running(angle);
      for (let i = 0; i < 30; i++) {
        a.step(ground([model]));
        b.step(ground([world]));
        // the same in floats up to the rounding of the line's trip into model space and back
        for (let k = 0; k < 3; k++) near(a.body.pos[k]!, b.body.pos[k]!, 1e-6);
      }
      near(a.body.pos[0], angle === 90 ? 0.4 : 0.5657, 1e-4);
    }
  });

  it('a slide longer than 0.15 a step becomes the delta, without the fall (__FIX_COLLISION)', () => {
    // at 0.3 a step the slide along a wall touched at 45 degrees is 0.21: m_vDelta takes it and m_vDelta.y is zeroed
    const act = new ActionMover({ pos: [1, 0, 0], angle: 45, speed: 0.3 });
    act.sendActMsg(ActMsg.FORWARD);
    act.step(ground([object(wallX(1, 0, 3, -50, 50))]));
    expect(act.delta[0]).toBe(0);
    expect(act.delta[1]).toBe(0);
    expect(act.delta[2]).toBe(f32(act.body.pos[2]));
    near(act.delta[2], -0.3 * Math.SQRT1_2, 1e-6);
  });

  it('processCollision gives the vector back where nothing is hit, the slide for one hit and nothing for two', () => {
    // the C++'s vectors are floats; the functions take theirs as floats
    const knee: Vec3 = [f32(0.6), f32(0.4), 0];
    const dir: Vec3 = [f32(0.65), 0, f32(0.65)];
    const out: Vec3 = [9, 9, 9];
    expect(processCollision(out, knee, dir, ground([]))).toBe(false);
    expect(out).toEqual(dir);
    expect(processCollision(out, knee, dir, ground([object(wallX(1, 0, 3, -5, 5))]))).toBe(true);
    expect(out[0]).toBe(0);
    near(out[2], 0.65 * (1 - 0.4 / 0.65));
    // the slide is tested again from the knee: a wall across it makes it nothing
    expect(processCollision(out, knee, dir, ground([object(wallX(1, 0, 3, -5, 5)), object(wallZ(0.1, -5, 5, 0, 3, -1))]))).toBe(true);
    expect(out).toEqual([0, 0, 0]);
  });

  it('a test line longer than 3 reflects off the wall at a fifth (SlideVectorXZ2, __FIX_COLLISION)', () => {
    // Object3D.cpp:1754-1791: the reflection of the whole line, times 0.2f
    const out: Vec3 = [0, 0, 0];
    expect(processCollision(out, [0, f32(0.4), 0], [4, 0, -4], ground([object(wallX(2, 0, 3, -50, 50))]))).toBe(true);
    expect(out).toEqual([f32(-0.8), 0, f32(-0.8)]);
    // a double's 0.4 is taken as the float the C++ would hold
    expect(processCollision(out, [0, 0.4, 0], [4, 0, -4], ground([object(wallX(2, 0, 3, -50, 50))]))).toBe(true);
    expect(out).toEqual([f32(-0.8), 0, f32(-0.8)]);
  });
});

// ---- land attributes ----------------------------------------------------------------------------------------------

describe('collision: land attributes (ProcessCollisionGround :235-268)', () => {
  it('a no-walk patch stops movement at its edge on that axis only', () => {
    const { dx, dz } = runStep(45);
    const g = ground([], () => 0, (x) => (x >= 1 ? HAttr.NOWALK : HAttr.NONE));
    const act = running(45, [0.75, 0, 0]);
    let x = act.body.pos[0];
    let z = act.body.pos[2];
    for (let i = 0; i < 12; i++) {
      act.step(g);
      const moved = f32(x + dx);
      // x is added, read back as the patch it is in, and taken off again in floats: (x + dx) - dx
      expect(act.body.pos[0]).toBe(moved >= 1 ? f32(moved - dx) : moved);
      expect(act.body.pos[2]).toBe(f32(z + dz));
      x = act.body.pos[0];
      z = act.body.pos[2];
    }
    expect(x).toBeLessThan(1);
    near(x, 0.75 + 3 * dx);
  });

  it('a no-move patch stops z the same way; no-fly and death patches stop nothing', () => {
    const { dz } = runStep(45);
    const noMove = running(45);
    steps(noMove, 12, ground([], () => 0, (_x, z) => (z <= -0.5 ? HAttr.NOMOVE : HAttr.NONE)));
    expect(noMove.body.pos[2]).toBeGreaterThan(-0.5);
    near(noMove.body.pos[2], 7 * dz);
    near(noMove.body.pos[0], 12 * 0.0707107, 1e-4);
    for (const attr of [HAttr.NOFLY, HAttr.DIE]) {
      const act = running(45);
      steps(act, 12, ground([], () => 0, () => attr));
      near(act.body.pos[2], 12 * dz, 1e-6);
      expect(act.state).toBe(ObjSta.FMOVE);
    }
  });
});

// ---- height: objects and terrain together -------------------------------------------------------------------------

describe('collision: height (ProcessCollisionGround :276-388, CWorld::ProcessUnderCollision, GetOverHeight)', () => {
  // a ramp from (1, 0) to (5, 1) along x, then a deck at 1 to x = 9; the terrain under it is at 0
  const bridge = object([...slopeX(1, 0, 5, 1, -2, 2), ...slopeX(5, 1, 9, 1, -2, 2)]);

  it('a mover walks up a bridge and stands on it', () => {
    const g = ground([bridge]);
    const act = running(90);
    for (let i = 0; i < 70; i++) {
      act.step(g);
      const [x, y] = act.body.pos;
      if (x <= 1) expect(y).toBe(0);
      else if (x < 5) near(y, 0.25 * (x - 1));
      else expect(y).toBe(1); // 2 + (1 / 1.5) * -1.5 in floats is 1 again
      expect(act.delta[1]).toBe(0); // landed every step
    }
    near(act.body.pos[0], 7);
    act.sendActMsg(ActMsg.STAND);
    const at = act.body.pos;
    steps(act, 30, g);
    expect(act.body.pos).toEqual(at);
  });

  it('a mover walking off the bridge falls to the terrain', () => {
    const g = ground([bridge]);
    const act = running(90, [8, 1, 0]);
    steps(act, 30, g); // x 11: past the deck's end at 9
    expect(act.body.pos[1]).toBe(0);
  });

  it('stairs: a riser under the knee is run over, and its tread lands the mover on it', () => {
    // two steps of 0.3: risers at x 1 and 3 (facing the mover, under the knee's 0.4 over the feet), treads at 0.3 and
    // 0.6. On a tread the test under the feet (from 1 over them) finds it above them: the fall of the step (0.005)
    // is within 0.25 of it, so the landing branch puts the mover on it (ActionMoverCollision.cpp:322-347)
    const stairs = ground([
      object([...wallX(1, 0, 0.3, -5, 5), ...slopeX(1, 0.3, 3, 0.3, -5, 5)]),
      object([...wallX(3, 0.3, 0.6, -5, 5), ...slopeX(3, 0.6, 5, 0.6, -5, 5)]),
    ]);
    const act = running(90);
    const heights: number[] = [];
    for (let i = 0; i < 45; i++) {
      act.step(stairs);
      const y = act.body.pos[1];
      if (heights.at(-1) !== y) heights.push(y);
      expect(act.delta[1]).toBe(0); // landed every step
    }
    near(act.body.pos[0], 4.5);
    // onto the first tread from the ground: 1 + t * -1.5 where the line from 1 meets 0.3f, t = 0.7 / 1.5 in floats;
    // standing on it, from 1.3 the next steps meet it at t = 1 / 1.5, which gives 0.3f to the bit; the second step
    // likewise gives 0.6f at once
    expect(heights).toEqual([0, 0.2999999523162842, f32(0.3), f32(0.6)]);
  });

  it('a mover keeps terrain height where no object is', () => {
    const uphill = (x: number): number => 2 + 0.3 * x;
    // a wall far away, and a roof above the 1.0 the test under the feet reaches
    const g = ground([object(wallX(100, 0, 3, -5, 5)), object(ceilingX(-5, 10, 4, -5, 5)), object(slopeX(-5, 4, 10, 4, -5, 5))], uphill);
    const act = running(90, [0, 2, 0]);
    const plain = running(90, [0, 2, 0]);
    for (let i = 0; i < 30; i++) {
      act.step(g);
      plain.step(terrainGround(uphill));
      expect(act.body.pos[1]).toBe(f32(uphill(act.body.pos[0])));
      expect(act.body.pos).toEqual(plain.body.pos);
    }
  });

  it('processUnderCollision takes the highest of objects and terrain within 1.5 under the point', () => {
    const slide: Vec3 = [0, 0, 0];
    // from y 2 down to 0.5: the deck at 1 is above the terrain at 0
    expect(processUnderCollision(slide, [6, 2, 0], ground([bridge]))).toBe(1);
    expect(slide).toEqual([0, 0, 0]); // a floor slides nothing
    // terrain at 1.5 is above the deck
    expect(processUnderCollision(slide, [6, 2, 0], ground([bridge], () => 1.5))).toBe(1.5);
    // nothing within reach: the terrain, however far down
    expect(processUnderCollision(slide, [6, 4, 0], ground([bridge], () => -3))).toBe(-3);
  });

  it('a face steeper than about 79 degrees under the feet slides the mover off it (m_bGround 2)', () => {
    // a face 80 degrees steep, whose normal is n = (-9.8, 1.7, 0) / 9.946 (y 0.171, under 0.1908 = -cos 101 degrees):
    // SlideVectorUnder (Object3D.cpp:2011-2021) gives the point the fall (0, -0.01f, 0) slides to along it,
    // (0, -0.01, 0) - n (n . (0, -0.01, 0)) = (-0.0016840, -0.0097079, 0) from where the line meets it
    const steep = object([[[0, 0, 5], [0.17, 0.98, 5], [0.17, 0.98, -5]], [[0, 0, 5], [0.17, 0.98, -5], [0, 0, -5]]]);
    const slide: Vec3 = [0, 0, 0];
    const h = processUnderCollision(slide, [0.085, 1.49, 0], ground([steep], () => -10));
    near(h, 0.49);
    near(slide[0], 0.085 - 0.0016840);
    near(slide[1], 0.49 - 0.0097079);
    expect(slide[2]).toBe(0);
    // a mover dropped just over it lands on it and is put where the fall slides to, standing nowhere (m_bGround 2)
    const act = mover(0, [0.085, 0.6, 0]);
    act.step(ground([steep], () => -10));
    expect(act.body.pos[0]).toBeLessThan(0.085);
    expect(act.body.pos[1]).toBeLessThan(0.49);
    expect(act.delta[1]).toBe(0);
    const x = act.body.pos[0];
    act.step(ground([steep], () => -10)); // not standing: gravity again, and the next slide
    expect(act.body.pos[0]).toBeLessThan(x);
  });

  it('a ceiling stops a rising mover 1.5 under it (GetOverHeight)', () => {
    const roof = object(ceilingX(-5, 5, 2.4, -5, 5));
    expect(overHeight([0, 1.5, 0], ground([roof]))).toBe(2.4000000953674316);
    // the line reaches 1 up and IsTouchRayTri's distance must be under 1: a ceiling exactly 1 up is not found
    expect(overHeight([0, 1.4000000953674316, 0], ground([roof]))).toBe(NO_CEILING);
    expect(overHeight([0, 1.5, 0], ground([]))).toBe(65535);
    // rising 0.195, 0.19, ... a step: the fifth step would put the head (y + 1.5) at 2.425, so it stops at 0.9
    const act = mover(0);
    act.forceSet({ ...act.report(0n), delta: [0, 0.2, 0], state: ObjSta.STAND });
    const g = ground([roof]);
    for (let i = 0; i < 4; i++) {
      act.step(g);
      expect(act.delta[1]).toBeGreaterThan(0);
    }
    act.step(g);
    expect(act.body.pos[1]).toBe(f32(f32(2.4) - 1.5));
    expect(act.delta[1]).toBe(f32(-0.01));
    // a box the head is in: GetOverHeight takes it, the first one the line touches, and finds no face in it within
    // 1 up; GetOverHeightForPlayer passes over it to the beam at 2.2
    const hall = object([...slopeX(-5, 0, 5, 0, -5, 5), ...ceilingX(-5, 5, 10, -5, 5)]);
    const beam = object(ceilingX(-1, 1, 2.2, -1, 1));
    expect(overHeight([0, 1.5, 0], ground([hall, beam]))).toBe(NO_CEILING);
    expect(overHeight([0, 1.5, 0], ground([hall, beam]), true)).toBe(f32(2.2));
    expect(overHeight([0, 1.5, 0], ground([hall]), true)).toBe(NO_CEILING); // only that box: it is the one
    // without objects nothing is overhead
    const free = mover(0);
    free.forceSet({ ...free.report(0n), delta: [0, 0.2, 0], state: ObjSta.STAND });
    steps(free, 5, ground([]));
    near(free.body.pos[1], 0.925);
  });
});

// ---- the land's triangles -----------------------------------------------------------------------------------------

describe('collision: the land\'s triangles (CWorld::GetLandTri, ProcessUnderCollision :1324-1374)', () => {
  /** The triangle `landTriangle` gives at (x, z), as its three corners. */
  function triAt(h: (gx: number, gz: number) => number, x: number, z: number, lx = 0): Vec3[] {
    const out = new Float32Array(9);
    const height = (tx: number, tz: number, gx: number, gz: number): number | null => (tx === lx && tz === 0 ? h(gx, gz) : null);
    expect(landTriangle(x, z, MPU, height, out)).toBe(true);
    return [[out[0]!, out[1]!, out[2]!], [out[3]!, out[4]!, out[5]!], [out[6]!, out[7]!, out[8]!]];
  }

  it('the diagonal split picks the right triangle', () => {
    // heights that tell the corners apart: (gx, gz) -> 10 gx + gz
    const h = (gx: number, gz: number): number => 10 * gx + gz;
    const c = (gx: number, gz: number, lx = 0): Vec3 => [(gx + lx * 128) * MPU, h(gx, gz), gz * MPU];
    // cell (0, 0), gx + gz even, cut from (0, 0) to (1, 1): below it 0, 3, 1; on and above it 0, 2, 3
    expect(triAt(h, 3, 1)).toEqual([c(0, 0), c(1, 1), c(1, 0)]);
    expect(triAt(h, 1, 3)).toEqual([c(0, 0), c(0, 1), c(1, 1)]);
    expect(triAt(h, 2, 2)).toEqual([c(0, 0), c(0, 1), c(1, 1)]); // glx > glz is false on the cut
    // cell (1, 0), odd, cut from (1, 0) to (0, 1) of the cell: before it 0, 2, 1; on and after it 1, 2, 3
    expect(triAt(h, 5, 1)).toEqual([c(1, 0), c(1, 1), c(2, 0)]);
    expect(triAt(h, 7, 3)).toEqual([c(2, 0), c(1, 1), c(2, 1)]);
    expect(triAt(h, 6, 2)).toEqual([c(2, 0), c(1, 1), c(2, 1)]);
    // in the next tile along x the cells count from its own corner, and the corners are world positions
    expect(triAt(h, 128 * MPU + 3, 1, 1)).toEqual([c(0, 0, 1), c(1, 1, 1), c(1, 0, 1)]);
    // no tile, or off the world's low edge: nothing
    expect(landTriangle(3, 1, MPU, () => null, new Float32Array(9))).toBe(false);
    expect(landTriangle(-1, 1, MPU, () => 0, new Float32Array(9))).toBe(false);
  });

  it('a mover stands on the land\'s triangle, not on the blend of the corners', () => {
    // one corner of the cell raised by 1: at (3, 1) the triangle (0, 3, 1) is at z / 4 = 0.25, the blend at 0.1875
    const bump = land((gx, gz) => (gx === 1 && gz === 1 ? 1 : 0));
    const act = mover(0, [3, 0.3, 1]); // within 0.25 + a step's fall over both: it lands at once
    act.step(bump);
    near(act.body.pos[1], 0.25, 1e-6);
    expect(bump.terrainHeight(3, 1)).toBe(0.1875);
    // the terrain-only ground stands it on the blend, as before
    const plain = mover(0, [3, 0.3, 1]);
    plain.step(terrainGround(bump.terrainHeight));
    expect(plain.body.pos[1]).toBe(0.1875);
  });

  it('a flat triangle gives the same height as before', () => {
    const flat = land(() => 2.5);
    const act = running(45, [10, 2.5, 10]);
    const plain = running(45, [10, 2.5, 10]);
    for (let i = 0; i < 40; i++) {
      act.step(flat);
      plain.step(terrainGround(() => 2.5));
      expect(act.body.pos).toEqual(plain.body.pos);
    }
  });

  // land rising 3 a unit along x (71.6 degrees, steeper than about 68): its normal n = (-3, 1, 0) / 3.162, and the
  // fall (0, -0.2f, 0) slides along it by (0, -0.2, 0) - n (n . (0, -0.2, 0)) = (-0.06, -0.18, 0) a step
  const steep = land((gx) => 3 * gx * MPU);

  it('a steep slope slides a standing mover down', () => {
    const act = mover(90, [20, 60, 20]);
    let x = 20;
    for (let i = 0; i < 10; i++) {
      act.step(steep);
      near(act.body.pos[0] - x, -0.06);
      near(act.body.pos[1], 3 * act.body.pos[0], 1e-4); // on the slope
      expect(act.delta[1]).toBe(0); // landed (on sliding land, m_bGround 2), and the next step falls and slides again
      x = act.body.pos[0];
    }
  });

  it('a walker cannot climb a steep slope; a runner nets less', () => {
    const walker = running(90, [20, 60, 20]);
    walker.sendActMsg(ActMsg.MODE_WALK);
    const runner = running(90, [20, 60, 20]);
    let [w, r] = [20, 20];
    for (let i = 0; i < 10; i++) {
      walker.step(steep);
      runner.step(steep);
      near(walker.body.pos[0] - w, 0.025 - 0.06); // a walk is a quarter of the run
      near(runner.body.pos[0] - r, 0.1 - 0.06);
      [w, r] = [walker.body.pos[0], runner.body.pos[0]];
    }
  });

  it('land up to about 68 degrees does not slide, nor does land without triangles', () => {
    // slope 2 (63.4 degrees): its normal is (-2, 1, 0) / 2.236, 0.447 of straight up, above 0.37864
    const act = mover(90, [20, 40, 20]);
    steps(act, 10, land((gx) => 2 * gx * MPU));
    expect(act.body.pos).toEqual([20, 40, 20]);
    const plain = mover(90, [20, 60, 20]);
    steps(plain, 10, terrainGround(steep.terrainHeight));
    expect(plain.body.pos).toEqual([20, 60, 20]);
  });

  it('the slide stops where it meets the land at the foot of the slope (FindTouchLandTri)', () => {
    // down 3 a unit to x = 8, flat after: from 0.05 before the foot the slide (0.06, -0.18) would go 0.13 under the
    // flat land; the line along it meets the flat cell's triangle at the foot instead
    const foot = land((gx) => (gx <= 2 ? 3 * (2 - gx) * MPU : 0));
    const out: Vec3 = [0, 0, 0];
    near(processUnderCollision(out, [7.95, 0.15 + 1, 20.5], foot), 0.15);
    expect(out).toEqual([8, 0, 20.5]);
  });

  it("calls the ground's landTri on the ground, so a Ground whose methods use `this` slides too", () => {
    const foot = land((gx) => (gx <= 2 ? 3 * (2 - gx) * MPU : 0));
    const methods = {
      inner: foot,
      terrainHeight(x: number, z: number) { return this.inner.terrainHeight(x, z); },
      landAttr(x: number, z: number) { return this.inner.landAttr(x, z); },
      objectsNear(x: number, z: number) { return this.inner.objectsNear(x, z); },
      landTri(x: number, z: number, out: Float32Array) { return this.inner.landTri!(x, z, out); },
    };
    const out: Vec3 = [0, 0, 0];
    near(processUnderCollision(out, [7.95, 0.15 + 1, 20.5], methods), 0.15);
    expect(out).toEqual([8, 0, 20.5]);
  });
});

// ---- the camera ---------------------------------------------------------------------------------------------------

describe('collision: the camera (CWorld::CheckBound)', () => {
  it('the camera is pulled in front of a wall', () => {
    const wall = object(wallX(-2, 0, 10, -5, 5, 1)); // facing +x, toward the player
    expect(cameraBound([0, 1, 0], [-4, 3, 0], ground([wall]))).toEqual([-2, 2, 0]);
    expect(cameraBound([0, 1, 0], [-4, 3, 0], ground([]))).toEqual([-4, 3, 0]);
  });

  it('the camera passes through a see-through model, which movers still collide with', () => {
    // IntersectObjLine2( ..., TRUE ) skips a model with m_bTrans (WorldIntersect.cpp:854-855)
    const glass = { ...object(wallX(-2, 0, 10, -5, 5, 1)), trans: true };
    const opaque = object(wallX(-1, 0, 10, -5, 5, 1));
    expect(cameraBound([0, 1, 0], [-4, 3, 0], ground([glass]))).toEqual([-4, 3, 0]);
    expect(cameraBound([0, 1, 0], [-4, 3, 0], ground([glass, opaque]))).toEqual([-1, 1.5, 0]);
    const act = running(270, [-1, 0, 0]); // running -x into the glass, which faces +x: stopped 0.6 short, as by any wall
    steps(act, 20, ground([glass]));
    near(act.body.pos[0], -1.4);
  });

  it('the camera is kept 0.6 over the terrain', () => {
    // from the player, a point 1 out toward the camera and then every 0.1: the first one under the terrain + 0.6
    // (__FIX_PICKING's 0.6f) is it. Here y = 1 - 0.2425 (1 + 0.1 k) is 0.612 at k = 6 and 0.588 at k = 7.
    const at = cameraBound([0, 1, 0], [0, -1, -8], ground([]));
    const unit = [0, -2 / Math.sqrt(68), -8 / Math.sqrt(68)] as const;
    expect(at[0]).toBe(0);
    near(at[1], 1 + unit[1] * 1.7);
    near(at[2], unit[2] * 1.7);
    // no land is height 0 (GetLandHeight)
    expect(cameraBound([0, 1, 0], [0, -1, -8], ground([], () => null))).toEqual(at);
  });

  it('the camera takes the nearer of terrain and object', () => {
    const wallAt = (x: number): Ground => ground([object(wallX(x, -5, 10, -5, 5, 1))]);
    // the line goes under the terrain + 0.6 at its first point, 1.1 out: (-0.88, 0.34, 0)
    expect(cameraBound([0, 1, 0], [-4, -2, 0], wallAt(-0.5))).toEqual([-0.5, 0.625, 0]);
    const behind = cameraBound([0, 1, 0], [-4, -2, 0], wallAt(-3));
    near(behind[0], -0.88, 1e-6);
    near(behind[1], 0.34, 1e-6);
  });

  it('after its first hit the camera tests other objects against the line IntersectObjLine2 makes of the end point', () => {
    // __CAM_FAST_RECOVER (WorldIntersect.cpp:875-880) puts the end point in the segment's direction: the boxes of the
    // walls after the first hit are tested against a line through the middle along (6, 1, 10), which misses them here
    const nearWall = object(wallX(9, 0, 5, 9, 11, 1));
    const farWall = object(wallX(7, 0, 5, 9, 11, 1));
    expect(cameraBound([10, 1, 10], [6, 1, 10], ground([nearWall, farWall]))).toEqual([9, 1, 10]);
    expect(cameraBound([10, 1, 10], [6, 1, 10], ground([farWall, nearWall]))).toEqual([7, 1, 10]);
  });
});
