import { AnimationClip, AnimationMixer, NumberKeyframeTrack, Object3D, Quaternion, QuaternionKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { applyWingFit, flapGap, idleOf, playWing, wingFit } from '../src/world/render/wingCapes';
import type { WingMotions } from '../src/world/render/wingCapes';

/** Wings whose stand moves one bone's x from 0 to 1, and whose walk from 0 to -1, over `walkSeconds` (1 s unless said). */
function wings(walk = true, walkSeconds = 1): { bone: Object3D; wing: WingMotions } {
  const root = new Object3D();
  const bone = new Object3D();
  bone.name = 'BoneF';
  root.add(bone);
  const clip = (name: string, to: number, seconds = 1) =>
    new AnimationClip(name, seconds, [new NumberKeyframeTrack('BoneF.position[x]', [0, seconds], [0, to])]);
  const stand = clip('stand', 1);
  return {
    bone,
    wing: {
      mixer: new AnimationMixer(root), stand, walk: walk ? clip('walk', -1, walkSeconds) : null, idle: idleOf(stand),
      playing: null, untilFlap: 100, flapLeft: 0,
    },
  };
}

describe('playWing (wing capes, 2026-11-17)', () => {
  it('plays the stand, then the walk while the wearer moves, blended, looped', () => {
    const { bone, wing } = wings();
    playWing(wing, 'stand', 0.5);
    expect(wing.playing).toBe('stand');
    expect(bone.position.x).toBeCloseTo(0.5);
    playWing(wing, 'walk', 0);
    expect(wing.playing).toBe('walk');
    playWing(wing, 'walk', 1.25); // past the blend and round the loop: the walk's quarter
    expect(wing.mixer.clipAction(wing.walk!).isRunning()).toBe(true);
    expect(bone.position.x).toBeCloseTo(-0.25);
  });

  it('keeps the stand for wings with no walk, and for an idle with no idle clip', () => {
    const { wing } = wings(false);
    playWing(wing, 'walk', 0.1);
    expect(wing.playing).toBe('stand');
    playWing({ ...wings().wing, idle: null }, 'idle', 0.1);
  });

  it('plays the gentle idle while the wearer stands with nothing going on (2026-11-20)', () => {
    const { bone, wing } = wings();
    playWing(wing, 'idle', 1); // two thirds of the idle, which is 1.5 times slower
    expect(wing.playing).toBe('idle');
    expect(bone.position.x).toBeCloseTo(0.3 * (1 / 1.5));
  });

  it('breaks the idle with a big flap once the gap runs out, then idles again and draws the next gap', () => {
    const { wing } = wings();
    wing.untilFlap = 2;
    const half = (): number => 0.5;
    playWing(wing, 'idle', 0, half);
    playWing(wing, 'idle', 1.5, half);
    expect(wing.playing).toBe('idle');
    playWing(wing, 'idle', 0.6, half); // the gap runs out
    expect(wing.playing).toBe('flap');
    expect(wing.flapLeft).toBeCloseTo(1); // one whole 1 s flap of the walk
    expect(wing.untilFlap).toBeCloseTo(32.5); // 5 + 0.5 * 55
    expect(wing.mixer.clipAction(wing.walk!).isRunning()).toBe(true);
    playWing(wing, 'idle', 0.5, half);
    expect(wing.playing).toBe('flap');
    playWing(wing, 'idle', 0.6, half);
    expect(wing.playing).toBe('idle');
  });

  it("plays a quick flutter's whole flaps for at least 0.6 s", () => {
    const { wing } = wings(true, 0.2);
    wing.untilFlap = 0.1;
    playWing(wing, 'idle', 0);
    playWing(wing, 'idle', 0.2);
    expect(wing.playing).toBe('flap');
    expect(wing.flapLeft).toBeCloseTo(0.6);
  });

  it('a flap the wearer starts walking in goes on as the walk, not from its start; a busy wearer gets no flap', () => {
    const { wing } = wings();
    wing.untilFlap = 0.1;
    playWing(wing, 'idle', 0);
    playWing(wing, 'idle', 0.2);
    playWing(wing, 'idle', 0.3);
    const walk = wing.mixer.clipAction(wing.walk!);
    const time = walk.time;
    playWing(wing, 'walk', 0.1);
    expect(wing.playing).toBe('walk');
    expect(walk.time).toBeCloseTo(time + 0.1);
    const busy = wings().wing;
    busy.untilFlap = 0.1;
    playWing(busy, 'stand', 0);
    playWing(busy, 'stand', 5);
    expect(busy.playing).toBe('stand');
  });

  it('draws the gap between big flaps from 5 to 60 seconds', () => {
    expect(flapGap(() => 0)).toBe(5);
    expect(flapGap(() => 0.5)).toBe(32.5);
    expect(flapGap(() => 0.999)).toBeCloseTo(59.945);
    for (let i = 0; i < 20; i++) {
      const gap = flapGap();
      expect(gap).toBeGreaterThanOrEqual(5);
      expect(gap).toBeLessThan(60);
    }
  });
});

describe('idleOf (2026-11-20)', () => {
  it('keeps the first pose and 30% of the movement, 1.5 times slower', () => {
    const stand = new AnimationClip('stand', 1, [new NumberKeyframeTrack('BoneF.position[x]', [0, 0.5, 1], [2, 4, 2])]);
    const idle = idleOf(stand);
    expect(idle.duration).toBe(1.5);
    expect(Array.from(idle.tracks[0]!.times)).toEqual([0, 0.75, 1.5]);
    Array.from(idle.tracks[0]!.values).forEach((value, i) => expect(value).toBeCloseTo([2, 2.6, 2][i]!, 5));
    expect(Array.from(stand.tracks[0]!.values)).toEqual([2, 4, 2]); // the stand is left as it was
  });

  it('turns a bone 30% of the way from its first turn', () => {
    const first = new Quaternion();
    const last = new Quaternion().setFromAxisAngle({ x: 0, y: 0, z: 1 } as never, Math.PI / 2);
    const stand = new AnimationClip('stand', 1, [new QuaternionKeyframeTrack('BoneF.quaternion', [0, 1], [...first.toArray(), ...last.toArray()])]);
    const values = idleOf(stand).tracks[0]!.values;
    expect(new Quaternion().fromArray(values, 4).angleTo(first)).toBeCloseTo((Math.PI / 2) * 0.3, 5);
    expect(new Quaternion().fromArray(values, 0).angleTo(first)).toBeCloseTo(0, 6);
  });
});

describe('wingFit', () => {
  it("has a fit for every wing cape's model on both bodies, and none for other models", () => {
    for (const name of ['winfeather01', 'winfeather02', 'winangel01', 'winangel02', 'winprophet01', 'winprophet02',
      'butterpeacock01', 'butterbujun01', 'buttermolpo01', 'buttertrans01', 'dragonfly01']) {
      for (const gender of ['male', 'female'] as const) {
        const fit = wingFit(`models/item_ridrid${name}.glb`, gender);
        expect(fit.scale).toBeGreaterThan(0.5);
        expect(fit.scale).toBeLessThanOrEqual(1);
        expect(fit.back).toBeGreaterThanOrEqual(0);
        // 2026-11-20: a little below the Neck, on the upper shoulder blades (not at the neck, not low on the back)
        expect(fit.up).toBeGreaterThanOrEqual(-0.12);
        expect(fit.up).toBeLessThanOrEqual(-0.08);
      }
    }
    expect(wingFit('models/item_ridridstimagic.glb', 'male')).toEqual({ back: 0, up: 0, scale: 1 });
  });

  it('moves the wings back (-z) and up (+y) in their own space, and sizes them', () => {
    const object = new Object3D();
    applyWingFit(object, { back: 0.1, up: 0.2, scale: 0.8 });
    expect(object.position.toArray()).toEqual([0, 0.2, -0.1]);
    expect(object.scale.toArray()).toEqual([0.8, 0.8, 0.8]);
  });
});
