// The effect player's stepping (EffectModel), against hand-made effects whose answers follow from CSfxModel::Process
// and the part renderers (Source/_Common/sfxbase.cpp), and against sfx_GenLevelUp01: its key frames as a fixture, and
// the converted file itself when the worktree's dist/assets has it (`npm run convert`).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AssetIndex, SfxKey, SfxParticle, Vec3, WebEffect, WebEffectPart } from '@flyffweb/formats';
import { describe, expect, it } from 'vitest';
import { EffectModel, coneVertices, neuzRandom } from '../src/effects/EffectModel';
import type { EffectConeDraw, EffectDraw, EffectQuadDraw, EffectRandom } from '../src/effects/EffectModel';

const f32 = Math.fround;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const ONE: Vec3 = [1, 1, 1];

function key(frame: number, over: Partial<SfxKey> = {}): SfxKey {
  return { frame, pos: [0, 0, 0], posRotate: [0, 0, 0], scale: [1, 1, 1], rotate: [0, 0, 0], alpha: 255, ...over };
}

function part(over: Partial<WebEffectPart> = {}): WebEffectPart {
  return {
    type: 1, texture: 'tex', texFrame: 1, texLoop: 1, using: true, billType: 4, alphaType: 2, keys: [],
    particle: null, points: 0, frames: [], model: null, ...over,
  };
}

function particleBlock(over: Partial<SfxParticle> = {}): SfxParticle {
  return {
    create: 0, createNum: 1, appear: 0, keep: 0, disappear: 10, startPosVar: 0, startPosVarY: 0, yLow: 0, yHigh: 0,
    xzLow: 0, xzHigh: 0, accel: [0, 0, 0], scale: [1, 1, 1], scaleSpeed: [0, 0, 0], rotationLow: [0, 0, 0],
    rotationHigh: [0, 0, 0], repeatScal: false, repeat: false, scaleSpeedLow: [0, 0, 0], scaleSpeedHigh: [0, 0, 0],
    scaleEnd: [0, 0, 0], ...over,
  };
}

function particlePart(block: Partial<SfxParticle>, over: Partial<WebEffectPart> = {}): WebEffectPart {
  return part({ type: 2, particle: particleBlock(block), ...over });
}

/** Gives `values` in turn, over and over, and counts the calls. */
function scripted(values: number[] = [0]): EffectRandom & { calls: number } {
  const random = {
    calls: 0,
    next(): number {
      return values[random.calls++ % values.length]!;
    },
  };
  return random;
}

function model(parts: WebEffectPart[], random: EffectRandom = scripted()): EffectModel {
  return new EffectModel({ parts }, random);
}

/** Steps until the model's frame is `frame` (it must get there going up one at a time). */
function stepTo(effect: EffectModel, frame: number): void {
  while (effect.frame < frame) effect.step();
  expect(effect.frame).toBe(frame);
}

const draws = (effect: EffectModel, angleY = 0, scale: Vec3 = ONE, invView = IDENTITY): EffectDraw[] =>
  effect.drawList(angleY, scale, invView);
const quads = (effect: EffectModel, angleY = 0, scale: Vec3 = ONE, invView = IDENTITY): EffectQuadDraw[] =>
  draws(effect, angleY, scale, invView) as EffectQuadDraw[];

/** Steps `count` times; the index (1-based) of the step that returned true first, or null. */
function endTick(effect: EffectModel, count: number): number | null {
  for (let tick = 1; tick <= count; tick++) if (effect.step()) return tick;
  return null;
}

function expectMatrix(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(16);
  actual.forEach((value, i) => expect(value, `element ${i}`).toBeCloseTo(expected[i]!, 5));
}

describe('EffectModel: time and key frames', () => {
  it('advances the frame before using it, from 0', () => {
    const effect = model([part({ keys: [key(1), key(5)] })]);
    expect(effect.frame).toBe(0);
    effect.step();
    expect(effect.frame).toBe(1);
  });

  it('interpolates between the previous and next key, and draws a part only from its first key to its last', () => {
    const effect = model([part({ keys: [key(10, { alpha: 0 }), key(20, { alpha: 255, pos: [10, 0, 0] })] })]);
    stepTo(effect, 9);
    expect(draws(effect)).toEqual([]); // before the first key
    stepTo(effect, 10);
    expect(quads(effect).map((d) => [d.alpha, d.matrix[12]])).toEqual([[0, 0]]); // at a key: that key
    stepTo(effect, 15);
    expect(quads(effect).map((d) => [d.alpha, d.matrix[12]])).toEqual([[127, 5]]); // 255 * 5 / 10 in integers
    stepTo(effect, 20);
    expect(quads(effect).map((d) => [d.alpha, d.matrix[12]])).toEqual([[255, 10]]);
    stepTo(effect, 21);
    expect(draws(effect)).toEqual([]); // after the last key
  });

  it('interpolates alpha in integers, rounding toward zero, and floats in floats', () => {
    const effect = model([part({ keys: [key(0, { alpha: 100 }), key(3, { alpha: 0, pos: [1, 0, 0] })] })]);
    stepTo(effect, 1);
    const [one] = quads(effect);
    expect(one!.alpha).toBe(67); // 100 + (-100 * 1) / 3 = 100 - 33
    expect(one!.matrix[12]).toBe(f32(1 / 3)); // (1 - 0) * 1 * (1 / 3.0f)
    stepTo(effect, 2);
    expect(quads(effect)[0]!.alpha).toBe(34);
  });

  it('passes the alpha byte of the texture factor: above 255 wraps', () => {
    const effect = model([part({ keys: [key(1, { alpha: 300 }), key(5, { alpha: 300 })] })]);
    stepTo(effect, 1);
    expect(quads(effect)[0]!.alpha).toBe(300 & 0xff);
  });

  it('draws GLOW parts additive and BLEND parts blended, in part order, skipping parts not in use', () => {
    const effect = model([
      part({ texture: 'glow', alphaType: 2, keys: [key(0), key(5)] }),
      part({ texture: 'off', using: false, keys: [key(0), key(5)] }),
      part({ texture: 'blend', alphaType: 1, keys: [key(0), key(5)] }),
    ]);
    stepTo(effect, 1);
    expect(quads(effect).map((d) => [d.kind, d.part, d.texture, d.additive])).toEqual([
      ['quad', 0, 'glow', true],
      ['quad', 2, 'blend', false],
    ]);
  });
});

describe('EffectModel: texture animation', () => {
  it("picks a quad's frame by the frames since its first key, ticks 0 to 10", () => {
    const frames = ['f0', 'f1', 'f2', 'f3'];
    const effect = model([part({ texture: 'f0', texFrame: 4, texLoop: 8, frames, keys: [key(2), key(50)] })]);
    const seen: (string | null)[] = [];
    for (let tick = 0; tick <= 10; tick++) {
      if (tick > 0) effect.step();
      seen.push(quads(effect)[0]?.texture ?? null);
    }
    // (4 * (frame - 2) / 8) % 4, nothing before the first key
    expect(seen).toEqual([null, null, 'f0', 'f0', 'f1', 'f1', 'f2', 'f2', 'f3', 'f3', 'f0']);
  });

  it("picks a particle's frame by the particle's age (RenderParticles, not the part's Render)", () => {
    const frames = ['p0', 'p1', 'p2'];
    const effect = model([particlePart({ disappear: 10 }, { texture: 'p0', texFrame: 3, texLoop: 3, frames, keys: [key(1), key(50)] })]);
    const seen: (string | null)[] = [];
    for (let tick = 1; tick <= 5; tick++) {
      effect.step();
      seen.push(quads(effect)[0]?.texture ?? null);
    }
    expect(seen).toEqual(['p0', 'p1', 'p2', 'p0', 'p1']);
  });
});

describe('EffectModel: particles', () => {
  it('emits a burst of createNum once, at the first key, and the particles die at disappear', () => {
    const effect = model([particlePart({ create: 0, createNum: 5, disappear: 20 }, { keys: [key(3), key(100)] })]);
    const counts: number[] = [];
    for (let tick = 1; tick <= 30; tick++) {
      effect.step();
      counts.push(draws(effect).length);
    }
    expect(counts).toEqual([0, 0, ...Array<number>(20).fill(5), ...Array<number>(8).fill(0)]);
  });

  it('never emits a burst whose first key is at frame 0: the first step already sees frame 1', () => {
    const effect = model([particlePart({ create: 0, createNum: 5 }, { keys: [key(0), key(100)] })]);
    for (let tick = 1; tick <= 100; tick++) {
      effect.step();
      expect(draws(effect)).toEqual([]);
    }
  });

  it("ages a continuous emitter's particles: fade in over appear, out after keep, gone at disappear", () => {
    const effect = model([
      particlePart({ create: 2, createNum: 1, appear: 4, keep: 6, disappear: 10 }, { keys: [key(0, { alpha: 200 }), key(100, { alpha: 200 })] }),
    ]);
    effect.step();
    expect(draws(effect)).toEqual([]); // the first emission is at frame 2: (frame - 0) % 2 == 0
    const firstAlphas: number[] = [];
    for (let tick = 2; tick <= 11; tick++) {
      effect.step();
      firstAlphas.push(quads(effect)[0]!.alpha);
    }
    expect(firstAlphas).toEqual([0, 50, 100, 150, 200, 200, 200, 150, 100, 50]);
    expect(draws(effect)).toHaveLength(5); // born at 2, 4, 6, 8, 10
    effect.step(); // frame 12: the one born at 2 is 10 old and gone, one more is born
    const now = quads(effect);
    expect(now).toHaveLength(5);
    expect(now[0]!.alpha).toBe(100); // born at 4, 8 old
  });

  it('shares the three randoms of a tick between its particles; each gets its own angle, used as radians', () => {
    // r1 = 0.5, r2 = 0.25, r3 = 0.75, then the angles RANDF * 360 = 36 and 72 (radians)
    const random = scripted([0.5, 0.25, 0.75, 0.1, 0.2]);
    const effect = model(
      [particlePart({ createNum: 2, startPosVar: 1, startPosVarY: 2, yLow: 0, yHigh: 1, xzLow: 0, xzHigh: 1, disappear: 50 }, { keys: [key(1), key(100)] })],
      random,
    );
    effect.step();
    const born = quads(effect).map((d) => [d.matrix[12]!, d.matrix[13]!, d.matrix[14]!]);
    expect(born).toHaveLength(2);
    expect(born[0]).toEqual([f32(Math.sin(f32(f32(0.1) * 360))), 1, f32(Math.cos(f32(f32(0.1) * 360)))]);
    expect(born[1]![1]).toBe(1); // same height: r1 * startPosVarY
    expect(born[1]![0]).toBe(f32(Math.sin(f32(f32(0.2) * 360))));
    effect.step();
    const moved = quads(effect).map((d) => [d.matrix[12]!, d.matrix[13]!, d.matrix[14]!]);
    // the same speed: up yLow + r2 * (yHigh - yLow), out xzLow + r2 * (xzHigh - xzLow), each along its own angle
    expect(moved.map((p) => p[1])).toEqual([1.25, 1.25]);
    for (let i = 0; i < 2; i++) expect(Math.hypot(moved[i]![0]! - born[i]![0]!, moved[i]![2]! - born[i]![2]!)).toBeCloseTo(0.25, 6);
  });

  it('draws three randoms every tick of the emission window, emitting or not, plus one per particle', () => {
    const random = scripted();
    const effect = model([particlePart({ create: 3, createNum: 2, disappear: 10 }, { keys: [key(1), key(100)] })], random);
    effect.step(); // frame 1: emits, 3 + 2
    effect.step(); // frame 2: 3
    effect.step(); // frame 3: 3
    effect.step(); // frame 4: emits, 3 + 2
    expect(random.calls).toBe(16);
    stepTo(effect, 91); // past the window's end, 100 - disappear
    const calls = random.calls;
    effect.step();
    expect(random.calls).toBe(calls);
  });

  it("doesn't scale the emitter's offset by the effect's scale, only the particles' offsets and sizes", () => {
    const effect = model([particlePart({ createNum: 1, scale: [0.5, 0.25, 9] }, { keys: [key(1, { pos: [1, 0, 0] }), key(100, { pos: [1, 0, 0] })] })]);
    effect.step();
    const [quad] = quads(effect, 0, [2, 2, 2]);
    expect(quad!.matrix[12]).toBe(1);
    expect([quad!.matrix[0], quad!.matrix[5], quad!.matrix[10]]).toEqual([1, 0.5, 2]); // scale.x, scale.y times 2; z is 1 * 2
  });

  it('ping-pongs the scale of a repeatScal part between its start and end, and ignores the part scale speed', () => {
    const effect = model([
      particlePart(
        { createNum: 1, repeatScal: true, scale: [0.5, 0.5, 0.5], scaleEnd: [1, 1, 1], scaleSpeed: [9, 9, 9], scaleSpeedLow: [0.25, 0.25, 0.25], scaleSpeedHigh: [0.25, 0.25, 0.25], disappear: 50 },
        { keys: [key(1), key(100)] },
      ),
    ]);
    const sizes: number[] = [];
    for (let tick = 1; tick <= 7; tick++) {
      effect.step();
      sizes.push(quads(effect)[0]!.matrix[0]!);
    }
    expect(sizes).toEqual([0.75, 1, 0.75, 0.5, 0.75, 1, 0.75]);
  });

  it('jumps a repeat part back from 65% of its last key to 60%, and never ends', () => {
    const effect = model([particlePart({ create: 1, repeat: true, disappear: 10 }, { keys: [key(0), key(100)] })]);
    const ends: boolean[] = [];
    for (let tick = 1; tick <= 64; tick++) ends.push(effect.step());
    expect(effect.frame).toBe(64);
    ends.push(effect.step());
    expect(effect.frame).toBe(60); // 65 / 100 >= 0.65: (int)(100 * 0.6f)
    for (let tick = 66; tick <= 70; tick++) ends.push(effect.step());
    expect(effect.frame).toBe(60);
    for (let tick = 71; tick <= 1000; tick++) ends.push(effect.step());
    expect(ends).not.toContain(true);
  });

  it('jumps before the later parts of the same tick look at the frame', () => {
    const effect = model([
      particlePart({ create: 1, repeat: true, disappear: 10 }, { keys: [key(0), key(100)] }),
      part({ texture: 'later', keys: [key(60)] }),
    ]);
    stepTo(effect, 64);
    expect(quads(effect).some((d) => d.texture === 'later')).toBe(false);
    effect.step();
    expect(quads(effect).some((d) => d.texture === 'later')).toBe(true); // drawn at the jumped frame, 60
  });
});

describe('EffectModel: the end of the effect', () => {
  it('ends once no non-particle part has a key at or after the frame', () => {
    expect(endTick(model([part({ keys: [key(0), key(5)] })]), 50)).toBe(6);
  });

  it('counts a part that is not drawn: not in use, or a mesh part with no model; a part with no keys never counts', () => {
    const off = model([part({ keys: [key(0), key(5)] }), part({ using: false, texture: 'off', keys: [key(0), key(8)] })]);
    expect(endTick(off, 50)).toBe(9);
    // Piece 7 M2 draws a mesh part (below); one whose model was not converted is not drawn and still counts
    const mesh = model([part({ keys: [key(0), key(5)] }), part({ type: 3, texture: null, model: null, keys: [key(0), key(8)] })]);
    stepTo(mesh, 7);
    expect(draws(mesh)).toEqual([]);
    expect(endTick(mesh, 50)).toBe(2); // frame 9
    expect(endTick(model([part({ keys: [] })]), 50)).toBe(1);
  });

  it('waits for the particles, but a particle part not in use counts for nothing', () => {
    const effect = model([particlePart({ create: 0, createNum: 1, disappear: 30 }, { keys: [key(1), key(40)] }), part({ keys: [key(0), key(5)] })]);
    expect(endTick(effect, 100)).toBe(31); // born at 1, 30 old at 31
    expect(endTick(model([particlePart({ create: 1 }, { using: false, keys: [key(1), key(100)] })]), 50)).toBe(1);
  });

  it('is not over before the first key of a particle part', () => {
    expect(endTick(model([particlePart({ create: 0, createNum: 0 }, { keys: [key(20)] })]), 50)).toBe(20);
  });
});

/**
 * sfx_GenLevelUp01's timing, as `readSfx` reads Client/SFX/sfx_GenLevelUp01.sfx: each part's type, its first and last
 * key frames (only they decide when the effect ends) and the particle part's block. The particles are emitted every
 * frame from 20 to 410 - 90, and the last one is 90 frames old at 410.
 */
const LEVEL_UP_FRAMES: [type: 1 | 2 | 4, first: number, last: number][] = [
  [1, 0, 370], [4, 20, 345], [1, 25, 390], [1, 35, 380], [1, 25, 390], [4, 30, 385], [4, 20, 390], [2, 20, 410], [4, 345, 375],
];
const LEVEL_UP_PARTICLES: Partial<SfxParticle> = {
  create: 1, createNum: 1, appear: 5, keep: 60, disappear: 90, startPosVar: f32(0.2), yHigh: f32(-0.1), xzHigh: f32(0.01), scale: [0.5, 0.5, 0.5],
};
const levelUpFixture = (): WebEffect => ({
  parts: LEVEL_UP_FRAMES.map(([type, first, last]) =>
    type === 2
      ? particlePart(LEVEL_UP_PARTICLES, { billType: 1, texFrame: 9, texLoop: 9, keys: [key(first, { alpha: 100 }), key(last, { alpha: 100 })] })
      : part({ type, points: type === 4 ? 20 : 0, keys: [key(first, { alpha: 0 }), key(last, { alpha: 0 })] }),
  ),
});

const ASSETS_DIR = fileURLToPath(new URL('../../../dist/assets/', import.meta.url));
const LEVEL_UP_KEY = 'effects/sfx_genlevelup01.json';
function convertedLevelUp(): WebEffect | null {
  if (!existsSync(`${ASSETS_DIR}index.json`)) return null;
  const hashed = (JSON.parse(readFileSync(`${ASSETS_DIR}index.json`, 'utf8')) as AssetIndex).files[LEVEL_UP_KEY];
  return hashed === undefined ? null : (JSON.parse(readFileSync(ASSETS_DIR + hashed, 'utf8')) as WebEffect);
}
const converted = convertedLevelUp();

describe('EffectModel: sfx_GenLevelUp01', () => {
  it('ends at tick 410 (the fixture of its key frames)', () => {
    expect(endTick(new EffectModel(levelUpFixture(), neuzRandom), 1000)).toBe(410);
  });

  it.skipIf(converted === null)('ends at tick 410 (the converted file)', () => {
    const effect = new EffectModel(converted!, neuzRandom);
    let tick = 0;
    let most = 0;
    while (tick < 1000 && !effect.step()) {
      tick++;
      most = Math.max(most, effect.drawList(0, ONE, IDENTITY).length);
    }
    expect(tick + 1).toBe(410);
    expect(most).toBeGreaterThan(90); // a particle a frame, 90 frames each, besides the quads and cones
  });
});

describe('EffectModel: matrices (D3D row vectors)', () => {
  const s = 2;
  const scaled: Vec3 = [s, s, s];

  it('turns a BILL quad to the camera: scale, roll, then the inverse view without its translation', () => {
    const c = Math.cos(Math.PI / 6);
    const n = Math.sin(Math.PI / 6);
    const invView = [c, 0, -n, 0, 0, 1, 0, 0, n, 0, c, 0, 5, 6, 7, 1]; // a yaw of 30 degrees, and a translation that must go
    for (const billType of [1, 3] as const) {
      const effect = model([part({ billType, keys: [key(1), key(5)] })]);
      stepTo(effect, 1);
      expectMatrix(quads(effect, 40, scaled, invView)[0]!.matrix, [s * c, 0, -s * n, 0, 0, s, 0, 0, s * n, 0, s * c, 0, 0, 0, 0, 1]);
    }
  });

  it('lays a BOTTOM quad flat, turned by rotate.z less the effect angle', () => {
    const effect = model([part({ billType: 2, keys: [key(1, { rotate: [0, 0, 30] }), key(5, { rotate: [0, 0, 30] })] })]);
    stepTo(effect, 1);
    expectMatrix(quads(effect, 30, scaled)[0]!.matrix, [s, 0, 0, 0, 0, 0, s, 0, 0, -s, 0, 0, 0, 0, 0, 1]);
  });

  it('turns a NORMAL quad and its offset by the effect angle, and scales the offset', () => {
    const effect = model([part({ billType: 4, keys: [key(1, { pos: [0, 0, 1] }), key(5, { pos: [0, 0, 1] })] })]);
    stepTo(effect, 1);
    // yaw 90: x goes to -z, z to x
    expectMatrix(quads(effect, 90, scaled)[0]!.matrix, [0, 0, -s, 0, 0, s, 0, 0, s, 0, 0, 0, s, 0, 0, 1]);
  });

  it('gives a CUSTOMMESH cone its radii, height, UV numbers and points, with the effect scale in the matrix', () => {
    const k = { pos: [0, 1, 0] as Vec3, scale: [1, 2, 0.5] as Vec3, posRotate: [9, 0.5, 0] as Vec3 };
    const effect = model([part({ type: 4, points: 20, keys: [key(1, k), key(5, k)] })]);
    stepTo(effect, 1);
    const [cone] = draws(effect, 0, scaled) as EffectConeDraw[];
    expect(cone).toMatchObject({ kind: 'cone', part: 0, texture: 'tex', billType: 4, top: 1, bottom: 0.5, height: 2, uv: [9, 0.5, 0], points: 20, alpha: 255, additive: true });
    expectMatrix(cone!.matrix, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, s, 0, 1]);
  });

  it('turns a camera-facing cone by rotate.z less the effect angle (BILL) or by rotate.z alone (POLE)', () => {
    const bill = model([part({ type: 4, points: 20, billType: 1, keys: [key(1), key(5)] })]);
    const pole = model([part({ type: 4, points: 20, billType: 3, keys: [key(1), key(5)] })]);
    stepTo(bill, 1);
    stepTo(pole, 1);
    expectMatrix(draws(bill, 90)[0]!.matrix, [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); // Rz(-90)
    expectMatrix(draws(pole, 90)[0]!.matrix, IDENTITY);
  });

  it("doesn't change the simulation or draw randoms when drawing", () => {
    const random = scripted([0.3, 0.6, 0.9]);
    const effect = model([particlePart({ create: 1, createNum: 2, startPosVar: 1, disappear: 20 }, { keys: [key(1), key(100)] })], random);
    stepTo(effect, 5);
    const calls = random.calls;
    const first = draws(effect, 10, scaled);
    expect(draws(effect, 10, scaled)).toEqual(first);
    expect(random.calls).toBe(calls);
  });
});

describe('coneVertices', () => {
  it('builds points * 2 + 1 vertex pairs, top then bottom, an integer number of degrees apart', () => {
    const cone: EffectConeDraw = {
      kind: 'cone', part: 0, texture: null, billType: 4, matrix: IDENTITY, top: 2, bottom: 1, height: 3, uv: [0, 0.5, 0.25], points: 8, alpha: 255, additive: true,
    };
    const { positions, uvs } = coneVertices(cone);
    expect(positions).toHaveLength(17 * 2 * 3);
    expect(uvs).toHaveLength(17 * 2 * 2);
    // 360 / 16 is 22 in integers: the last pair is at 352 degrees, so the ring does not close
    const last = 16 * 2;
    const a = f32(f32(f32(2 * f32(3.141592654)) * 352) / 360);
    expect(Array.from(positions.subarray(last * 3, last * 3 + 6))).toEqual([
      f32(f32(Math.sin(a)) * 2), 3, f32(f32(Math.cos(a)) * 2), f32(f32(Math.sin(a)) * 1), 0, f32(f32(Math.cos(a)) * 1),
    ]);
    // uv.x 0: u alternates 0 / 1 by pair; v is uv.y + 0.02 at the top, uv.z at the bottom
    expect(Array.from(uvs.subarray(0, 8))).toEqual([0, f32(f32(0.5) + f32(0.02)), 0, 0.25, 1, f32(f32(0.5) + f32(0.02)), 1, 0.25]);
  });

  it('spreads u over the ring uv.x times when uv.x is not 0', () => {
    const cone: EffectConeDraw = {
      kind: 'cone', part: 0, texture: null, billType: 4, matrix: IDENTITY, top: 1, bottom: 1, height: 1, uv: [9, 0, 0], points: 20, alpha: 255, additive: true,
    };
    const { uvs } = coneVertices(cone);
    expect(uvs[2 * 2 * 10]).toBe(f32(f32(9 * 10) / 40));
    expect(uvs[2 * 2 * 40]).toBe(9);
  });
});

describe('neuzRandom', () => {
  it('gives (rand() % 50000) / 50000 with an MSVC rand() of 0 to 32767', () => {
    for (let i = 0; i < 1000; i++) {
      const value = neuzRandom.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(f32(32767 / 50000));
      expect(f32(Math.round(value * 50000) / 50000)).toBe(value); // a whole number of 50000ths
    }
  });
});

describe('EffectModel: mesh parts and the full rotation of Render2 (Piece 7 M2)', () => {
  const arrowPart = (over: Partial<WebEffectPart> = {}): WebEffectPart => part({
    type: 3, texture: null, model: 'models/obj_middlearrow_01.glb', alphaType: 1,
    keys: [key(0, { pos: [0, 0, 1], scale: [2, 2, 2], alpha: 128 }), key(10, { pos: [0, 0, 1], scale: [2, 2, 2], alpha: 128 })],
    ...over,
  });

  it("a mesh part is listed with its model, its key's matrix and alpha (CSfxPartMesh::Render, sfxbase.cpp:1072-1130)", () => {
    const effect = model([arrowPart()]);
    stepTo(effect, 1);
    const [draw] = draws(effect, 90);
    expect(draw).toMatchObject({ kind: 'mesh', part: 0, model: 'models/obj_middlearrow_01.glb', alpha: 128, additive: false });
    // S( 2 ) * YawPitchRoll( 90 ): x to -z, z to x; the offset (0, 0, 1) turned the same, (1, 0, 0)
    expectMatrix(draw!.matrix, [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1]);
  });

  it('a mesh part with no model is not listed', () => {
    const effect = model([arrowPart({ model: null })]);
    stepTo(effect, 1);
    expect(draws(effect)).toEqual([]);
  });

  it('drawList2 turns a NORMAL quad by the whole rotation, and its offset by it then by posRotate (CSfxPartBill::Render2, :196-310)', () => {
    const effect = model([part({ billType: 4, keys: [key(0, { pos: [0, 1, 0] }), key(10, { pos: [0, 1, 0] })] })]);
    stepTo(effect, 1);
    // a pitch of 90 (x): y goes to z, z to -y; the offset (0, 1, 0) to (0, 0, 1)
    const [quad] = effect.drawList2([90, 0, 0], ONE, IDENTITY);
    expectMatrix(quad!.matrix, [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 1]);
  });

  it("drawList2 draws a mesh part by the yaw alone (Render2's SFXPARTTYPE_MESH, :2117-2121)", () => {
    const effect = model([arrowPart()]);
    stepTo(effect, 1);
    expect(effect.drawList2([90, 90, 45], ONE, IDENTITY)).toEqual(draws(effect, 90));
  });

  it('rewind sends the frame back to 0, as the missiles do (m_nCurFrame = 0)', () => {
    const effect = model([part({ keys: [key(0), key(30)] })]);
    stepTo(effect, 20);
    effect.rewind();
    expect(effect.frame).toBe(0);
    effect.step();
    expect(effect.frame).toBe(1);
  });
});
