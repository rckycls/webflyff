// The effect manager (EffectManager): effects played by XI id, as Neuz's CreateSfx makes them: where they are made,
// whom they follow, how high they are drawn, how big, which way. The models are the real EffectModel on small
// hand-made effects; the renderer is a recorder, except in the one test of the camera, which uses the real one.

import type { SfxKey, Vec3, WebEffect, WebEffectPart } from '@flyffweb/formats';
import { EffectRenderer } from '@flyffweb/scene';
import type { EffectDraw, EffectQuadDraw, EffectRandom } from '@flyffweb/scene';
import { DataTexture, PerspectiveCamera, RGBAFormat, Scene, UnsignedByteType } from 'three';
import type { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { EffectManager, Xi } from '../src/world/fx/EffectManager';
import type { EffectRequest } from '../src/world/fx/EffectManager';
import type { GameData } from '../src/world/gameData';
import { wrapAngle } from '../src/world/sim/ActionMover';

const f32 = Math.fround;
const LIFT_CREATE = f32(0.01);
const LIFT_DRAW = f32(0.2);

const key = (frame: number, over: Partial<SfxKey> = {}): SfxKey => ({
  frame, pos: [0, 0, 0], posRotate: [0, 0, 0], scale: [1, 1, 1], rotate: [0, 0, 0], alpha: 255, ...over,
});

/** A NORMAL quad: its matrix is its scale and the effect's heading, nothing else. */
const part = (over: Partial<WebEffectPart> = {}): WebEffectPart => ({
  type: 1, texture: 'textures/sfx/t.ktx2', texFrame: 1, texLoop: 1, using: true, billType: 4, alphaType: 2, keys: [],
  particle: null, points: 0, frames: [], model: null, ...over,
});

/** An effect that plays frames 0 to `last`, and is over at tick `last + 1`. */
const effectOf = (last: number, over: Partial<WebEffectPart> = {}): WebEffect => ({ parts: [part({ keys: [key(0), key(last)], ...over })] });

/** The effects files the manager loads, by key; any other key is not in the asset index. */
const FILES: Record<string, WebEffect> = {
  'effects/levelup.json': effectOf(400),
  'effects/sword.json': effectOf(19),
  'effects/crit.json': effectOf(70),
  'effects/cleanhit.json': effectOf(30),
  'effects/short.json': effectOf(5),
  'effects/big.json': effectOf(50),
};

const REFS: [number, string, number][] = [
  [Xi.GEN_LEVEL_UP01, 'effects/levelup.json', 1],
  [Xi.HIT_SWORD01, 'effects/sword.json', 1],
  [Xi.HIT_STICK02, 'effects/sword.json', 1],
  [Xi.HIT_CRITICAL01, 'effects/crit.json', 1],
  [Xi.SKILL_VAG_ONE_CLEANHIT01, 'effects/cleanhit.json', 1],
  [Xi.SKILL_VAG_ONE_BRANDISH01, 'effects/cleanhit.json', 1],
  [Xi.SKILL_VAG_ONE_OVERCUTTER01, 'effects/cleanhit.json', 1],
  [Xi.SKILL_BIL_KNU_SONICHAND02, 'effects/cleanhit.json', 1],
  [Xi.HIT_BOW01, 'effects/cleanhit.json', 1],
  [Xi.EVE_EVENT_FAIRYLY, 'effects/cleanhit.json', 1],
  [Xi.HIT_YOY01, 'effects/big.json', 2],
  [Xi.GEN_MONSTER_SPAWN01, 'effects/short.json', 2],
  [Xi.HIT_HITBLOCK01, 'effects/missing.json', 1], // an entry that names a .sfx the client lacks
];

const data: Pick<GameData, 'effects'> = { effects: new Map(REFS.map(([xi, effect, scale]) => [xi, { effect, scale }])) };

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Drawn {
  list: EffectDraw[];
  at: Vec3;
}

interface Rig {
  manager: EffectManager;
  load: Mock<(key: string) => Promise<WebEffect>>;
  report: Mock<(message: string) => void>;
  random: EffectRandom & { calls: number };
  /** What one `draw(camera)` gives the renderer, with the begin and end around it. */
  drawn(camera?: PerspectiveCamera): { effects: Drawn[]; begun: number; ended: number };
}

/** `files` are the effects files there are; any other key is not in the asset index. */
function rig(files: Record<string, WebEffect> = FILES): Rig {
  const load = vi.fn<(key: string) => Promise<WebEffect>>(async (name) => {
    const effect = files[name];
    if (effect === undefined) throw new Error(`asset "${name}" is not in the asset index`);
    return effect;
  });
  const report = vi.fn<(message: string) => void>();
  const random = { calls: 0, next: (): number => (random.calls++, 0) };
  const frames: Drawn[] = [];
  let begun = 0;
  let ended = 0;
  const renderer = {
    begin: () => {
      begun++;
      frames.length = 0;
    },
    draw: (list: EffectDraw[], at: Vec3) => {
      frames.push({ list, at: [at[0], at[1], at[2]] });
    },
    end: () => {
      ended++;
    },
  };
  const manager = new EffectManager(data, load, renderer, random, report);
  return {
    manager, load, report, random,
    drawn: (camera = new PerspectiveCamera()) => {
      begun = ended = 0;
      manager.draw(camera);
      return { effects: [...frames], begun, ended };
    },
  };
}

/** Plays an effect and lets its file arrive. */
async function play(r: Rig, request: EffectRequest): Promise<void> {
  r.manager.play(request);
  await settle();
}

const nobody = (): undefined => undefined;
const steps = (r: Rig, count: number, find: (id: number) => { pos: Vec3 } | undefined = nobody): void => {
  for (let i = 0; i < count; i++) r.manager.step(find);
};
const quadOf = (drawn: Drawn): EffectQuadDraw => drawn.list[0] as EffectQuadDraw;
/** The heading, degrees from 0 to 360, a NORMAL quad of unit scale is drawn at: its matrix is YawPitchRoll( heading ), whose first row is ( cos, 0, -sin ). */
const headingOf = (drawn: Drawn): number => {
  const m = quadOf(drawn).matrix;
  return (((Math.atan2(-m[2]!, m[0]!) * 180) / Math.PI) + 360) % 360;
};

describe('EffectManager: following (CSfx::Process, SfxObj.cpp:134-238)', () => {
  it('XI_GEN_LEVEL_UP01 with a follow id moves with the mover', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_LEVEL_UP01, pos: [10, 5, 20], followId: 7 });
    expect(r.manager.count()).toBe(1);
    const mover = { pos: [10, 5, 20] as Vec3 };
    const find = (id: number): { pos: Vec3 } | undefined => (id === 7 ? mover : undefined);
    r.manager.step(find);
    expect(r.drawn().effects[0]!.at).toEqual([10, f32(5 + LIFT_DRAW), 20]);
    mover.pos = [11, 5, 22];
    steps(r, 1, find);
    expect(r.drawn().effects[0]!.at).toEqual([11, f32(5 + LIFT_DRAW), 22]);
    mover.pos = [-3, 6, 4];
    steps(r, 1, find);
    expect(r.drawn().effects[0]!.at).toEqual([-3, f32(6 + LIFT_DRAW), 4]);
  });

  it('is made 0.01 m up, and drawn 0.2 m higher still, until it follows: the mover replaces the made position', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_LEVEL_UP01, pos: [1, 2, 3], followId: 7 });
    expect(r.drawn().effects[0]!.at).toEqual([1, f32(f32(2 + LIFT_CREATE) + LIFT_DRAW), 3]);
    steps(r, 1, () => ({ pos: [1, 2, 3] }));
    expect(r.drawn().effects[0]!.at).toEqual([1, f32(2 + LIFT_DRAW), 3]); // SetPos( src pos ): the 0.01 is gone
  });

  it('ends with the mover it follows: the source is gone (SfxObj.cpp:231-233)', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_LEVEL_UP01, pos: [0, 0, 0], followId: 7 });
    steps(r, 3, () => ({ pos: [0, 0, 0] }));
    expect(r.manager.count()).toBe(1);
    steps(r, 1, nobody);
    expect(r.manager.count()).toBe(0);
    expect(r.drawn().effects).toEqual([]);
  });

  it('followDest: a mover that is gone leaves the effect at its last position, and it plays on (SfxObj.cpp:178-188)', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_LEVEL_UP01, pos: [0, 0, 0], followId: 7, followDest: true });
    steps(r, 2, () => ({ pos: [3, 1, 4] }));
    steps(r, 5, nobody);
    expect(r.manager.count()).toBe(1);
    expect(r.drawn().effects[0]!.at).toEqual([3, f32(1 + LIFT_DRAW), 4]);
    steps(r, 1, () => ({ pos: [5, 1, 6] })); // and it follows again if the mover comes back
    expect(r.drawn().effects[0]!.at).toEqual([5, f32(1 + LIFT_DRAW), 6]);
  });

  it('an effect with no follow id stays where it was made, however the movers go', async () => {
    const r = rig();
    await play(r, { xi: Xi.HIT_CRITICAL01, pos: [4, 1.5, 9] });
    steps(r, 10, () => ({ pos: [100, 100, 100] }));
    expect(r.drawn().effects[0]!.at).toEqual([4, f32(f32(1.5 + LIFT_CREATE) + LIFT_DRAW), 9]);
  });

  it('XI_HIT_SWORD01 stays put, with the 0.01 and no 0.2 (CSfxGenNormalDmg01, Sfx.cpp:47-68)', async () => {
    for (const xi of [Xi.HIT_SWORD01, Xi.HIT_STICK02]) {
      const r = rig();
      await play(r, { xi, pos: [4, 1, 9], followId: 7 });
      r.manager.step(() => ({ pos: [50, 50, 50] })); // it does not follow, even given an id
      expect(r.drawn().effects[0]!.at).toEqual([4, f32(1 + LIFT_CREATE), 9]);
    }
  });

  it('the Vagrant skills are CSfxFixed: they sit at the point given (vPosDest, with no 0.01) and have no 0.2 (Sfx.cpp:2089-2092)', async () => {
    for (const xi of [Xi.SKILL_VAG_ONE_CLEANHIT01, Xi.SKILL_VAG_ONE_BRANDISH01, Xi.SKILL_VAG_ONE_OVERCUTTER01]) {
      const r = rig();
      await play(r, { xi, pos: [4, 1, 9], followId: 7, sourceAngle: 30 });
      r.manager.step(() => ({ pos: [50, 50, 50] }));
      expect(r.drawn().effects[0]!.at).toEqual([4, 1, 9]);
    }
  });

  it('a request marked fixed is CSfxFixed whatever its id: it sits at the point given and has no 0.2', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_LEVEL_UP01, pos: [4, 1, 9], followId: 7, fixed: true });
    r.manager.step(() => ({ pos: [50, 50, 50] }));
    expect(r.drawn().effects[0]!.at).toEqual([4, 1, 9]);
    expect(r.manager.count()).toBe(1);
    steps(r, 2, nobody); // and nothing it follows can end it
    expect(r.manager.count()).toBe(1);
  });
});

describe('EffectManager: scale (CObj::ResetScale and SetScale)', () => {
  it("scales an effect by its index entry's scale", async () => {
    const r = rig();
    await play(r, { xi: Xi.HIT_YOY01, pos: [0, 0, 0] });
    const m = quadOf(r.drawn().effects[0]!).matrix;
    expect([m[0], m[5], m[10]]).toEqual([2, 2, 2]);
  });

  it("replaces the entry's scale with the request's: SetScale( 3, 3, 3 ) after CreateSfx", async () => {
    const r = rig();
    await play(r, { xi: Xi.HIT_YOY01, pos: [0, 0, 0], scale: 3 });
    const m = quadOf(r.drawn().effects[0]!).matrix;
    expect([m[0], m[5], m[10]]).toEqual([3, 3, 3]); // not 2 * 3
  });

});

describe('EffectManager: the heading, as CreateSfx turns the effect (CreateObj.cpp:94-153)', () => {
  /** Plays `xi` for a source mover at `sourceAngle`, and gives the heading it is drawn at. */
  async function headingFor(xi: number, sourceAngle?: number, extra: Partial<EffectRequest> = {}): Promise<number> {
    const r = rig();
    await play(r, { xi, pos: [0, 0, 0], sourceAngle, ...extra });
    return headingOf(r.drawn().effects[0]!);
  }

  it('turns a melee skill hit by -a: the Over Cut of a caster at 30 degrees is drawn at 330 (:94-111)', async () => {
    expect(await headingFor(Xi.SKILL_VAG_ONE_OVERCUTTER01, 30)).toBeCloseTo(330, 1);
    expect(await headingFor(Xi.SKILL_VAG_ONE_OVERCUTTER01, 270)).toBeCloseTo(90, 1);
    expect(await headingFor(Xi.SKILL_VAG_ONE_CLEANHIT01, 40)).toBeCloseTo(320, 1);
    expect(await headingFor(Xi.SKILL_VAG_ONE_BRANDISH01, 40)).toBeCloseTo(320, 1);
  });

  it('turns the two Knuckle Hammer hits by -a + 180 (:115-121)', async () => {
    expect(await headingFor(Xi.SKILL_BIL_KNU_SONICHAND02, 40)).toBeCloseTo(140, 1);
    expect(await headingFor(Xi.SKILL_BIL_KNU_SONICHAND02, 200)).toBeCloseTo(340, 1);
  });

  it('turns the bow, yoyo and arrow hits by 180 - a (:128-152)', async () => {
    expect(await headingFor(Xi.HIT_BOW01, 40)).toBeCloseTo(140, 1);
    expect(await headingFor(Xi.HIT_BOW01, 200)).toBeCloseTo(340, 1);
    expect(await headingFor(Xi.HIT_YOY01, 40)).toBeCloseTo(140, 1);
  });

  it('stores the heading as SetAngle does: 65536 steps a circle, wrapped to 0..360 (Obj.cpp:662-664)', async () => {
    for (const a of [100.123456, 1, 359.9, 400, -20]) {
      expect(await headingFor(Xi.SKILL_VAG_ONE_OVERCUTTER01, a)).toBeCloseTo(wrapAngle(-a), 3);
      expect(await headingFor(Xi.HIT_BOW01, a)).toBeCloseTo(wrapAngle(f32(180 - f32(a))), 3);
    }
  });

  it('does not turn a fixed effect that has no source mover: IsValidObj( pSrc ) fails, and it keeps heading 0', async () => {
    expect(await headingFor(Xi.SKILL_VAG_ONE_OVERCUTTER01, undefined)).toBe(0);
    expect(await headingFor(Xi.HIT_BOW01, undefined)).toBe(0);
  });

  it('does not turn a plain effect: CreateSfx never calls SetAngle for it, and a CObj starts at angle 0 (Obj.cpp:49)', async () => {
    expect(await headingFor(Xi.HIT_CRITICAL01, 90)).toBe(0);
    expect(await headingFor(Xi.GEN_LEVEL_UP01, 90)).toBe(0);
  });

  it('does not turn what is fixed without a rule: the fairy (CreateObj.cpp:294-296) and any id marked fixed', async () => {
    expect(await headingFor(Xi.EVE_EVENT_FAIRYLY, 90)).toBe(0);
    expect(await headingFor(Xi.GEN_LEVEL_UP01, 90, { fixed: true })).toBe(0);
  });

  it('does not turn CSfxGenNormalDmg01: its Render never sets m_vRotate.y (Sfx.cpp:62-68)', async () => {
    expect(await headingFor(Xi.HIT_SWORD01, 90)).toBe(0);
    expect(await headingFor(Xi.HIT_STICK02, 90)).toBe(0);
  });

  it('draws the turned effect with that heading in its matrix, not only in a number', async () => {
    const r = rig();
    await play(r, { xi: Xi.SKILL_VAG_ONE_OVERCUTTER01, pos: [0, 0, 0], sourceAngle: 30 });
    const m = quadOf(r.drawn().effects[0]!).matrix;
    expect(m[0]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 3); // YawPitchRoll( 330 degrees ), to SetAngle's 0.0055 degree step
    expect(m[2]).toBeCloseTo(Math.sin((30 * Math.PI) / 180), 3);
  });
});

describe('EffectManager: lifetime', () => {
  it('an effect plays once, ends and is dropped', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] }); // frames 0 to 5
    expect(r.manager.count()).toBe(1);
    steps(r, 5);
    expect(r.manager.count()).toBe(1); // frame 5 is its last key
    expect(r.drawn().effects).toHaveLength(1);
    steps(r, 1);
    expect(r.manager.count()).toBe(0);
    expect(r.drawn().effects).toEqual([]);
  });

  it('steps each effect on its own: two plays of one file end when each has played its frames', async () => {
    const r = rig();
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    steps(r, 3);
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [1, 0, 0] });
    expect(r.manager.count()).toBe(2);
    steps(r, 3);
    expect(r.manager.count()).toBe(1);
    steps(r, 3);
    expect(r.manager.count()).toBe(0);
  });

  it("steps the models with the manager's random", async () => {
    const burst = effectOf(50, {
      type: 2, particle: {
        create: 1, createNum: 1, appear: 0, keep: 0, disappear: 10, startPosVar: 0, startPosVarY: 0, yLow: 0, yHigh: 0, xzLow: 0,
        xzHigh: 0, accel: [0, 0, 0], scale: [1, 1, 1], scaleSpeed: [0, 0, 0], rotationLow: [0, 0, 0], rotationHigh: [0, 0, 0],
        repeatScal: false, repeat: false, scaleSpeedLow: [0, 0, 0], scaleSpeedHigh: [0, 0, 0], scaleEnd: [0, 0, 0],
      },
    });
    const r = rig({ ...FILES, 'effects/short.json': burst });
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    expect(r.random.calls).toBe(0);
    steps(r, 2);
    expect(r.random.calls).toBeGreaterThan(0);
  });
});

describe('EffectManager: loading and errors', () => {
  it('skips an unknown XI with one error, however often it is played', async () => {
    const r = rig();
    r.manager.play({ xi: 99999, pos: [0, 0, 0] });
    r.manager.play({ xi: 99999, pos: [1, 0, 0] });
    await settle();
    expect(r.manager.count()).toBe(0);
    expect(r.report).toHaveBeenCalledTimes(1);
    expect(r.report.mock.calls[0]![0]).toContain('99999');
    expect(r.load).not.toHaveBeenCalled();
    r.manager.play({ xi: 88888, pos: [0, 0, 0] }); // another is another error
    expect(r.report).toHaveBeenCalledTimes(2);
  });

  it('skips an effect whose file is missing with one error: 17 index entries name a .sfx the client lacks', async () => {
    const r = rig();
    r.manager.play({ xi: Xi.HIT_HITBLOCK01, pos: [0, 0, 0] });
    r.manager.play({ xi: Xi.HIT_HITBLOCK01, pos: [1, 0, 0] });
    await settle();
    r.manager.play({ xi: Xi.HIT_HITBLOCK01, pos: [2, 0, 0] });
    await settle();
    expect(r.manager.count()).toBe(0);
    expect(r.report).toHaveBeenCalledTimes(1);
    expect(r.report.mock.calls[0]![0]).toContain('effects/missing.json');
    expect(r.load).toHaveBeenCalledTimes(1); // and it is not asked for again
  });

  it('plays nothing for XI 0 or none (-1), and says nothing: CreateSfx makes no object for 0 (CreateObj.cpp:309)', async () => {
    const r = rig();
    r.manager.play({ xi: 0, pos: [0, 0, 0] });
    r.manager.play({ xi: -1, pos: [0, 0, 0] });
    await settle();
    expect(r.manager.count()).toBe(0);
    expect(r.report).not.toHaveBeenCalled();
    expect(r.load).not.toHaveBeenCalled();
  });

  it('copies the position when played: a vector the caller changes while the file is still coming moves nothing', async () => {
    const r = rig();
    const pos: Vec3 = [1, 2, 3];
    r.manager.play({ xi: Xi.HIT_SWORD01, pos });
    pos[0] = 50;
    pos[1] = 60;
    pos[2] = 70;
    await settle();
    expect(r.drawn().effects[0]!.at).toEqual([1, f32(2 + LIFT_CREATE), 3]);
  });

  it('loads a file once for every effect that plays it, even while it is still coming', async () => {
    const r = rig();
    r.manager.play({ xi: Xi.HIT_SWORD01, pos: [0, 0, 0] });
    r.manager.play({ xi: Xi.HIT_STICK02, pos: [1, 0, 0] }); // another XI of the same file
    expect(r.manager.count()).toBe(0); // not yet: the file has not arrived
    await settle();
    expect(r.manager.count()).toBe(2);
    await play(r, { xi: Xi.HIT_SWORD01, pos: [2, 0, 0] });
    expect(r.manager.count()).toBe(3);
    expect(r.load).toHaveBeenCalledTimes(1);
    expect(r.load).toHaveBeenCalledWith('effects/sword.json');
  });

  it('starts an effect the moment it is played once its file is in', async () => {
    const r = rig();
    await play(r, { xi: Xi.HIT_SWORD01, pos: [0, 0, 0] });
    r.manager.play({ xi: Xi.HIT_SWORD01, pos: [1, 0, 0] });
    expect(r.manager.count()).toBe(2); // no waiting
  });

  it('reports an effect it cannot start instead of throwing', async () => {
    // a particle part with no particle block: the model refuses it
    const r = rig({ ...FILES, 'effects/short.json': { parts: [part({ type: 2, particle: null, keys: [key(0), key(5)] })] } });
    r.manager.play({ xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    await settle();
    r.manager.play({ xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    expect(r.manager.count()).toBe(0);
    expect(r.report).toHaveBeenCalledTimes(1);
  });

  it('preloads a file before its first play and names the textures its parts draw, so that the first play starts at once', async () => {
    const animated = part({ texture: 'textures/sfx/a00.ktx2', frames: ['textures/sfx/a00.ktx2', 'textures/sfx/a01.ktx2', null], keys: [key(0), key(9)] });
    const plain = part({ keys: [key(0), key(9)] });
    const untextured = part({ texture: null, keys: [key(0), key(9)] });
    const r = rig({ ...FILES, 'effects/sword.json': { parts: [animated, plain, untextured] } });
    const textures: string[] = [];
    r.manager.preload(Xi.HIT_SWORD01, (key) => textures.push(key));
    expect(r.manager.count()).toBe(0); // nothing plays
    await settle();
    expect(textures).toEqual(['textures/sfx/a00.ktx2', 'textures/sfx/a00.ktx2', 'textures/sfx/a01.ktx2', 'textures/sfx/t.ktx2']);
    r.manager.play({ xi: Xi.HIT_SWORD01, pos: [0, 0, 0] });
    expect(r.manager.count()).toBe(1); // no waiting
    expect(r.load).toHaveBeenCalledTimes(1);
  });

  it('says once, as play does, that it cannot preload an unknown XI or a missing file; XI 0 and -1 are nothing', async () => {
    const r = rig();
    const texture = vi.fn<(key: string) => void>();
    r.manager.preload(99999, texture);
    r.manager.preload(Xi.HIT_HITBLOCK01, texture);
    r.manager.preload(0, texture);
    r.manager.preload(-1, texture);
    await settle();
    r.manager.play({ xi: 99999, pos: [0, 0, 0] });
    r.manager.play({ xi: Xi.HIT_HITBLOCK01, pos: [0, 0, 0] });
    await settle();
    expect(r.report.mock.calls.map(([message]) => message)).toEqual([
      'effect XI 99999: not in the effects index',
      expect.stringContaining('effect effects/missing.json:'),
    ]);
    expect(texture).not.toHaveBeenCalled();
  });
});

describe('EffectManager: drawing', () => {
  it('gives the renderer each live effect once, between begin and end, and an empty frame when there are none', async () => {
    const r = rig();
    expect(r.drawn()).toEqual({ effects: [], begun: 1, ended: 1 });
    await play(r, { xi: Xi.HIT_CRITICAL01, pos: [1, 0, 0] });
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [2, 0, 0] });
    const frame = r.drawn();
    expect(frame.begun).toBe(1);
    expect(frame.ended).toBe(1);
    expect(frame.effects.map((e) => e.at[0])).toEqual([1, 2]);
    expect(quadOf(frame.effects[1]!).kind).toBe('quad');
  });

  it('draws the frame an effect is on, and leaves out an effect that has nothing to draw this frame', async () => {
    const r = rig({ ...FILES, 'effects/short.json': effectOf(8, { keys: [key(3), key(8)] }) });
    await play(r, { xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    expect(r.drawn().effects).toEqual([]); // frame 0 is before its first key
    steps(r, 3);
    expect(r.drawn().effects).toHaveLength(1);
  });

  it("faces a camera-facing quad the way the camera faces: the camera's turn goes through the D3D inverse view", async () => {
    const scene = new Scene();
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const renderer = new EffectRenderer(scene, () => texture);
    const files = { 'effects/short.json': effectOf(50, { billType: 1 }) };
    const manager = new EffectManager(data, async (name) => files[name as keyof typeof files], renderer, { next: () => 0 }, vi.fn());
    manager.play({ xi: Xi.GEN_MONSTER_SPAWN01, pos: [0, 0, 0] });
    await settle();
    const camera = new PerspectiveCamera();
    camera.position.set(5, 3, 8);
    camera.rotation.set(-0.3, 0.8, 0.2); // a pitch, a yaw and a roll
    manager.draw(camera); // matrixWorld is not current here: draw updates it
    scene.updateMatrixWorld(true);
    const mesh = scene.getObjectByName('effects')!.children[0] as Mesh;
    const e = mesh.matrixWorld.elements;
    const c = camera.matrixWorld.elements;
    // the quad's x and y axes (scaled by the entry's 2) are the camera's right and up
    expect([e[0], e[1], e[2]]).toEqual([c[0], c[1], c[2]].map((v) => expect.closeTo(v! * 2, 5)));
    expect([e[4], e[5], e[6]]).toEqual([c[4], c[5], c[6]].map((v) => expect.closeTo(v! * 2, 5)));
  });
});
