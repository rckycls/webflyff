import { AnimationClip, AnimationMixer, NumberKeyframeTrack, Object3D, Quaternion, QuaternionKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { applyWingFit, idleOf, playWing, wingFit } from '../src/world/render/wingCapes';
import type { WingMotions } from '../src/world/render/wingCapes';

/** Wings whose stand and walk each move one bone's x from 0 to 1 over a second. */
function wings(walk = true): { bone: Object3D; wing: WingMotions } {
  const root = new Object3D();
  const bone = new Object3D();
  bone.name = 'BoneF';
  root.add(bone);
  const clip = (name: string, to: number) => new AnimationClip(name, 1, [new NumberKeyframeTrack('BoneF.position[x]', [0, 1], [0, to])]);
  const stand = clip('stand', 1);
  return {
    bone,
    wing: { mixer: new AnimationMixer(root), stand, walk: walk ? clip('walk', -1) : null, idle: idleOf(stand), playing: null },
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

  it('plays the near-still idle while the wearer stands with nothing going on (2026-11-20)', () => {
    const { bone, wing } = wings();
    playWing(wing, 'idle', 1); // half way through the idle, which is twice as slow
    expect(wing.playing).toBe('idle');
    expect(bone.position.x).toBeCloseTo(0.15 * 0.5);
  });
});

describe('idleOf (2026-11-20)', () => {
  it('keeps the first pose and 15% of the movement, twice as slow', () => {
    const stand = new AnimationClip('stand', 1, [new NumberKeyframeTrack('BoneF.position[x]', [0, 0.5, 1], [2, 4, 2])]);
    const idle = idleOf(stand);
    expect(idle.duration).toBe(2);
    expect(Array.from(idle.tracks[0]!.times)).toEqual([0, 1, 2]);
    Array.from(idle.tracks[0]!.values).forEach((value, i) => expect(value).toBeCloseTo([2, 2.3, 2][i]!, 5));
    expect(Array.from(stand.tracks[0]!.values)).toEqual([2, 4, 2]); // the stand is left as it was
  });

  it('turns a bone 15% of the way from its first turn', () => {
    const first = new Quaternion();
    const last = new Quaternion().setFromAxisAngle({ x: 0, y: 0, z: 1 } as never, Math.PI / 2);
    const stand = new AnimationClip('stand', 1, [new QuaternionKeyframeTrack('BoneF.quaternion', [0, 1], [...first.toArray(), ...last.toArray()])]);
    const values = idleOf(stand).tracks[0]!.values;
    expect(new Quaternion().fromArray(values, 4).angleTo(first)).toBeCloseTo((Math.PI / 2) * 0.15, 5);
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
