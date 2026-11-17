import { AnimationClip, AnimationMixer, NumberKeyframeTrack, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { applyWingFit, playWing, wingFit } from '../src/world/render/wingCapes';
import type { WingMotions } from '../src/world/render/wingCapes';

/** Wings whose stand and walk each move one bone's x from 0 to 1 over a second. */
function wings(walk = true): { bone: Object3D; wing: WingMotions } {
  const root = new Object3D();
  const bone = new Object3D();
  bone.name = 'BoneF';
  root.add(bone);
  const clip = (name: string, to: number) => new AnimationClip(name, 1, [new NumberKeyframeTrack('BoneF.position[x]', [0, 1], [0, to])]);
  return { bone, wing: { mixer: new AnimationMixer(root), stand: clip('stand', 1), walk: walk ? clip('walk', -1) : null, playing: null } };
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

  it('keeps the stand for wings with no walk', () => {
    const { wing } = wings(false);
    playWing(wing, 'walk', 0.1);
    expect(wing.playing).toBe('stand');
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
