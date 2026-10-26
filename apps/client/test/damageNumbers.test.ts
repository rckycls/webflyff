// The damage numbers (DamageNumbers): Neuz's CDamageNum and CDamageNumMng (Source/_Common/2DRender.cpp:1855-2070) over
// a recording painter: which glyphs of DmgEffect.inc a number is drawn with, where, how big and how faded, tick by tick.
// The projections are hand-made; `screenProjector` is checked against a real camera.

import type { PackFrame, Vec3 } from '@flyffweb/formats';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { DamageNumbers, screenProjector } from '../src/world/render/DamageNumbers';
import type { Project, ScreenPoint } from '../src/world/render/DamageNumbers';
import type { Sprite, SpritePainter } from '../src/world/render/SpriteLayer';

const f32 = Math.fround;

/**
 * The frames of `SFX/DmgEffect.inc` as the converter writes them (`data/uiSheets.json`): `serialize 10 50 50 0 0`, the
 * four words at y 50, `serialize 10 50 50 0 128`, and the words again at y 178.
 */
const WORDS = (y: number): PackFrame[] => [
  { x: 0, y, w: 200, h: 50 }, { x: 200, y, w: 200, h: 50 }, { x: 400, y, w: 300, h: 50 }, { x: 700, y, w: 250, h: 50 },
];
const DIGITS = (y: number): PackFrame[] => Array.from({ length: 10 }, (_, d) => ({ x: d * 50, y, w: 50, h: 50 }));
const FRAMES: PackFrame[] = [...DIGITS(0), ...WORDS(50), ...DIGITS(128), ...WORDS(178)];

/** A painter that keeps what it was last given. */
function recorder(): SpritePainter & { painted: Sprite[]; paints: number } {
  return {
    painted: [],
    paints: 0,
    paint(sprites) {
      this.painted = [...sprites];
      this.paints++;
    },
  };
}

/** Every point at the same place on the screen. */
const at = (point: ScreenPoint): Project => () => point;

/** One Neuz loop: a FrameMove (`step`), then a Render (`draw`). */
function tick(numbers: DamageNumbers, project: Project): void {
  numbers.step();
  numbers.draw(project);
}

const FEET: Vec3 = [6970, 100, 3330];

describe('DamageNumbers: the glyphs (CDamageNum::Render, 2DRender.cpp:1913-1974)', () => {
  it("draws the own player's 123 with glyphs 1, 2 and 3, and a monster's with 15, 16 and 17, 25 px each, 12.5 px apart, centred", () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 123, true);
    tick(numbers, project);
    // centred: 400 - 0.5 * 50 * (1 + 0.5 * 2) / 2 = 375, then + 50 * 0.5 * 0.5 a glyph, cast to int for the point
    expect(painter.painted).toEqual([
      { frame: 1, x: 375, y: 290, scale: 0.5, alpha: 255 },
      { frame: 2, x: 387, y: 290, scale: 0.5, alpha: 255 },
      { frame: 3, x: 400, y: 290, scale: 0.5, alpha: 255 },
    ]);

    const monster = recorder();
    const others = new DamageNumbers(FRAMES, monster);
    others.draw(project);
    others.add(FEET, 123, false);
    tick(others, project);
    expect(monster.painted.map((s) => [s.frame, s.x])).toEqual([[15, 375], [16, 387], [17, 400]]);
    // 25 px glyphs: the 50 px tile at scale 2 / 4
    expect(monster.painted.map((s) => FRAMES[s.frame]!.w * s.scale)).toEqual([25, 25, 25]);
  });

  it('centres one digit on the point, and puts every digit of a long number on the row the colour set says', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400.75, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 7, false);
    numbers.add(FEET, 1090, true);
    tick(numbers, project);
    // 400.75 - 12.5 = 388.25; 400.75 - 0.5 * 50 * 2.5 / 2 = 369.5
    expect(painter.painted.map((s) => [s.frame, s.x])).toEqual([[21, 388], [1, 369], [0, 382], [9, 394], [0, 407]]);
  });

  it('projects the point 1 m over the feet, x every draw and y once, at the first step', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const asked: Vec3[] = [];
    let dx = 0;
    const project: Project = (p) => {
      asked.push(p);
      return { x: 100 + p[0] / 100 + dx, y: 500 - p[1] };
    };
    numbers.draw(project);
    numbers.add(FEET, 5, false);
    asked.length = 0;
    tick(numbers, project);
    // the first step projects the point over the feet for y; the draw tests the feet (in front?) and projects the point again
    expect(asked).toEqual([[6970, 101, 3330], [6970, 100, 3330], [6970, 101, 3330]]);
    // 100 + 69.7 - 12.5; 500 - 101 - 10
    expect(painter.painted.map((s) => [s.x, s.y])).toEqual([[157, 389]]);
    // the camera turns: x follows the point, y stays where the screen had it
    dx = 50;
    tick(numbers, project);
    expect(painter.painted.map((s) => [s.x, s.y])).toEqual([[207, 379]]);
  });
});

describe('DamageNumbers: the path (CDamageNum::Process, 2DRender.cpp:1855-1910; CDamageNumMng::Process, :2041-2052)', () => {
  /**
   * Tick by tick, the C++ state machine as drawn once a tick (`m_nFrame` counts the Process and the Render): the y of
   * the number (from 300), its alpha and its scale. Ticks 1-8 rise 10 px; tick 9 starts the shake, which moves at ticks
   * 10-18 by `g_nRenderCnt & 1` (here 9 renders before tick 10: odd, so down 3 first); tick 19 ends it; ticks 20-33
   * hold; tick 34 starts the fade (`m_nCnt` 1), which rises 2 px a tick with alpha 75 - 2 cnt and scale (3 + 0.05 cnt) / 4
   * up to tick 50 (cnt 17). At tick 51 `m_nFrame` is 100 and the number is deleted before its Process.
   */
  const expected: [number, number, number][] = [];
  {
    const ys = [290, 280, 270, 260, 250, 240, 230, 220, 220, 223, 220, 223, 220, 223, 220, 223, 220, 223, 223];
    for (const y of ys) expected.push([y, 255, 0.5]);
    for (let t = 20; t <= 33; t++) expected.push([223, 255, 0.5]);
    for (let cnt = 1; cnt <= 17; cnt++) expected.push([223 - 2 * cnt, 75 - 2 * cnt, f32(f32(3 + f32(cnt * f32(0.05))) / 4)]);
  }

  it('rises 80 px, shakes, holds and fades over 50 ticks, and is gone at tick 51', () => {
    expect(expected).toHaveLength(50);
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 4, false);
    const path: [number, number, number][] = [];
    for (let t = 1; t <= 50; t++) {
      tick(numbers, project);
      expect(painter.painted, `tick ${t}`).toHaveLength(1);
      const [glyph] = painter.painted;
      path.push([glyph!.y, glyph!.alpha, glyph!.scale]);
    }
    expect(path).toEqual(expected);
    expect(numbers.count()).toBe(1);
    tick(numbers, project);
    expect(painter.painted).toEqual([]);
    expect(numbers.count()).toBe(0);
  });

  it('keeps the fade centred: the glyphs grow from the point as the scale does', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 12, false);
    for (let t = 1; t <= 50; t++) tick(numbers, project);
    // tick 50: scale 3.85 / 4; 400 - scale * 50 * 1.5 / 2, then + 50 * 0.5 * scale
    const scale = f32(f32(3 + f32(17 * f32(0.05))) / 4);
    const x0 = f32(400 - f32(f32(f32(scale * 50) * 1.5) / 2));
    const x1 = f32(x0 + 50 * 0.5 * scale);
    expect(painter.painted.map((s) => [s.frame, s.x])).toEqual([[15, Math.trunc(x0)], [16, Math.trunc(x1)]]);
  });

  it('a frame with no step in between draws nothing new: Neuz renders at most once a FrameMove', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 4, false);
    for (let t = 1; t <= 10; t++) {
      tick(numbers, project);
      numbers.draw(project); // a second frame within the same tick
      numbers.draw(project);
    }
    // the same path as one draw a tick: up 80, the shake's first move at tick 10 (9 renders before it)
    expect(painter.painted[0]!.y).toBe(223);
    expect(painter.paints).toBe(10);
  });

  it('a point behind the camera is not drawn and its draws do not age it: only its steps do', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    let behind = true;
    // the feet are tested (in front of the camera?), the point 1 m over them is projected
    const project: Project = (p) => (behind && p[1] === FEET[1] ? null : { x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 4, false);
    for (let t = 1; t <= 50; t++) {
      tick(numbers, project);
      expect(painter.painted, `tick ${t}`).toEqual([]);
    }
    // 50 frames by the steps alone: half its life
    expect(numbers.count()).toBe(1);
    behind = false;
    tick(numbers, project);
    // tick 51 of the same path: fading, cnt 18, the one glyph centred on 400
    const scale = f32(f32(3 + f32(18 * f32(0.05))) / 4);
    const x = Math.trunc(f32(400 - f32(f32(f32(scale * 50) * 1) / 2)));
    expect(painter.painted).toEqual([{ frame: 18, x, y: 187, scale, alpha: 39 }]);
    // then two frames a tick: m_nFrame is 52 after tick 51, 100 after tick 75, and the number goes at tick 76
    for (let t = 52; t <= 75; t++) tick(numbers, project);
    expect(numbers.count()).toBe(1);
    tick(numbers, project);
    expect(numbers.count()).toBe(0);
    expect(painter.painted).toEqual([]);
  });

  it('several numbers at one place are drawn over each other, in the order they came', () => {
    const painter = recorder();
    const numbers = new DamageNumbers(FRAMES, painter);
    const project = at({ x: 400, y: 300 });
    numbers.draw(project);
    numbers.add(FEET, 3, false);
    tick(numbers, project);
    numbers.add(FEET, 5, true);
    tick(numbers, project);
    expect(painter.painted.map((s) => [s.frame, s.y])).toEqual([[17, 280], [5, 290]]);
  });
});

describe('screenProjector (D3DXVec3TransformCoord and D3DXVec3Project of CDamageNum::Render, 2DRender.cpp:1919-1926)', () => {
  it('gives the CSS pixel of a D3D point, and null for one behind the camera', () => {
    const camera = new PerspectiveCamera(60, 2, 0.1, 1000);
    // web (0, 0, 0) looking down web -z, which is D3D +z
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld();
    const project = screenProjector(camera, 800, 400);
    expect(project([0, 0, 10])).toEqual({ x: 400, y: 200 });
    // up is up: a point over the middle is higher on the screen (smaller y)
    expect(project([0, 1, 10])!.y).toBeLessThan(200);
    // D3D +x is to the right (the web x is the D3D x)
    expect(project([1, 0, 10])!.x).toBeGreaterThan(400);
    expect(project([0, 0, -10])).toBeNull();
  });
});
