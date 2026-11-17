// 2026-11-17 (wing capes, a custom item of this server, no Neuz rule): the 11 flying wings copied as cloaks
// (II_ARM_S_CLO_WING_*, Resource/defineItem.h), worn on the back. `looks.ts` says which cloak is one (`isWingCape`) and
// puts it in the look's `held.back`; `moverModels.ts` loads its wings with their skeleton and motions; `attachHeld`
// hangs them where a flier's wings ride; this file has how they flap and how they sit on each body.

import type { AnimationClip, AnimationMixer, Object3D } from 'three';
import { LoopRepeat } from 'three';
import type { Gender } from '@flyffweb/scene';

/** A wing cape's motions (a flier's wings', `motions/<model>/<model>_stand.glb` and `_walk`), and the one playing. */
export interface WingMotions {
  mixer: AnimationMixer;
  stand: AnimationClip | null;
  walk: AnimationClip | null;
  playing: 'stand' | 'walk' | null;
}

/** A wing's blend between its motions, seconds (as a flier's, `MoverViews`). */
const WING_BLEND = 0.2;

/**
 * Plays `want` (the stand motion where the wings have no walk), looped, blended from the one playing, and moves the
 * wings on by `dt` seconds: a flier's `WingMotionSetting` (`Mover.cpp:10704-10738`), the walk while the wearer moves.
 */
export function playWing(wing: WingMotions, want: 'stand' | 'walk', dt: number): void {
  const next = want === 'walk' && wing.walk !== null ? 'walk' : 'stand';
  if (next !== wing.playing) {
    const clip = wing[next];
    if (clip !== null) {
      const action = wing.mixer.clipAction(clip);
      action.reset().setLoop(LoopRepeat, Infinity).play();
      const previous = wing.playing === null ? null : wing[wing.playing];
      if (previous !== null) wing.mixer.clipAction(previous).crossFadeTo(action, WING_BLEND, false);
      wing.playing = next;
    }
  }
  wing.mixer.update(dt);
}

/**
 * How a wing cape sits, on top of a flier's place (`attachBack`), in the wings' own space: `back` moves them away from
 * the back (+) and `up` up the back (+), in the model's units (a body is about 1.8 high; the Neck is 0.205 above Spine2),
 * and `scale` sizes them. Tuned by eye on both bodies standing and running, so that the arms, the hair and the armour do
 * not go through them. 2026-11-18 (owner: "way too high, almost at the back of the neck"): every family sits 0.14 to 0.18
 * below the Neck, on the shoulder blades, a little further off the back and smaller where the lower wings reach the legs.
 */
export interface WingFit {
  back: number;
  up: number;
  scale: number;
}

const NO_FIT: WingFit = { back: 0, up: 0, scale: 1 };

/** One fit for both bodies. */
const both = (fit: WingFit): Record<Gender, WingFit> => ({ male: fit, female: fit });
const FEATHER = both({ back: 0.1, up: -0.18, scale: 0.9 });
const ANGEL = both({ back: 0.11, up: -0.18, scale: 0.85 });
const PROPHET = both({ back: 0.14, up: -0.14, scale: 0.55 });
const BUTTERFLY = both({ back: 0.08, up: -0.16, scale: 0.58 });

/** The fit of each wing model (its key's name), by body; a model or body not listed sits as a flier's wings. */
const FITS: Readonly<Record<string, Partial<Record<Gender, WingFit>>>> = {
  item_ridridwinfeather01: FEATHER, item_ridridwinfeather02: FEATHER,
  item_ridridwinangel01: ANGEL, item_ridridwinangel02: ANGEL,
  item_ridridwinprophet01: PROPHET, item_ridridwinprophet02: PROPHET,
  item_ridridbutterpeacock01: BUTTERFLY, item_ridridbutterbujun01: BUTTERFLY, item_ridridbuttermolpo01: BUTTERFLY,
  item_ridridbuttertrans01: BUTTERFLY,
  item_ridriddragonfly01: both({ back: 0.06, up: -0.16, scale: 0.8 }),
};

/** The fit of the wings of `modelKey` (`models/item_ridridwinangel01.glb`) on a `gender` body. */
export function wingFit(modelKey: string, gender: Gender): WingFit {
  const name = modelKey.replace(/^models\//, '').replace(/\.glb$/, '');
  return FITS[name]?.[gender] ?? NO_FIT;
}

/**
 * Puts `fit` on `wings` (the wings' glb scene, under its holder): in the wings' space after `attachBack`'s turn the
 * back is -z and up the back is +y.
 */
export function applyWingFit(wings: Object3D, fit: WingFit): void {
  wings.position.set(0, fit.up, -fit.back);
  wings.scale.setScalar(fit.scale);
}
