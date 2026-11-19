// 2026-11-17 (wing capes, a custom item of this server, no Neuz rule): the 11 flying wings copied as cloaks
// (II_ARM_S_CLO_WING_*, Resource/defineItem.h), worn on the back. `looks.ts` says which cloak is one (`isWingCape`) and
// puts it in the look's `held.back`; `moverModels.ts` loads its wings with their skeleton and motions; `attachHeld`
// hangs them where a flier's wings ride; this file has how they flap and how they sit on each body.

import type { AnimationMixer, Object3D } from 'three';
import { AnimationClip, LoopRepeat, Quaternion, QuaternionKeyframeTrack } from 'three';
import type { Gender } from '@flyffweb/scene';

/**
 * What a wing cape plays: `idle` while the wearer stands with nothing going on (2026-11-20, the owner: "little to no
 * movement when just standing and not doing anything"), `stand` while it stands busy (a swing, a cast), `walk` while it
 * walks or runs.
 */
export type WingMotion = 'idle' | 'stand' | 'walk';

/** A wing cape's motions (a flier's wings', `motions/<model>/<model>_stand.glb` and `_walk`), and the one playing. */
export interface WingMotions {
  mixer: AnimationMixer;
  stand: AnimationClip | null;
  walk: AnimationClip | null;
  /** 2026-11-20: the stand made near still (`idleOf`); null with no stand. */
  idle: AnimationClip | null;
  playing: WingMotion | null;
}

/** A wing's blend between its motions, seconds (as a flier's, `MoverViews`). */
const WING_BLEND = 0.2;

/** How much of the stand's movement the idle keeps, and how many times slower it plays. */
const IDLE_AMOUNT = 0.15;
const IDLE_SLOWER = 2;

/**
 * 2026-11-20: the idle of wings whose stand is `stand`: the same motion from the same first pose, with `IDLE_AMOUNT` of
 * its movement (each key moved that far from the first key: a turn by slerp, anything else in a line) and `IDLE_SLOWER`
 * times slower, so the wings barely breathe. A stand that loops seamlessly gives an idle that does too.
 */
export function idleOf(stand: AnimationClip): AnimationClip {
  const tracks = stand.tracks.map((track) => {
    const idle = track.clone();
    for (let i = 0; i < idle.times.length; i++) idle.times[i] = idle.times[i]! * IDLE_SLOWER;
    const size = idle.getValueSize();
    const values = idle.values;
    const first = values.slice(0, size);
    const from = new Quaternion().fromArray(first);
    const turn = new Quaternion();
    for (let at = size; at < values.length; at += size) {
      if (track instanceof QuaternionKeyframeTrack) {
        turn.fromArray(values, at).slerp(from, 1 - IDLE_AMOUNT).toArray(values, at);
      } else {
        for (let c = 0; c < size; c++) values[at + c] = first[c]! + (values[at + c]! - first[c]!) * IDLE_AMOUNT;
      }
    }
    return idle;
  });
  return new AnimationClip(`${stand.name}_idle`, stand.duration * IDLE_SLOWER, tracks);
}

/**
 * Plays `want` (the stand where the wings have no idle or no walk), looped, blended from the one playing, and moves the
 * wings on by `dt` seconds: a flier's `WingMotionSetting` (`Mover.cpp:10704-10738`), the walk while the wearer moves.
 */
export function playWing(wing: WingMotions, want: WingMotion, dt: number): void {
  const next = want !== 'stand' && wing[want] !== null ? want : 'stand';
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
 * not go through them. 2026-11-18 (owner: "way too high, almost at the back of the neck"): every family went 0.14 to 0.18
 * below the Neck, a little further off the back and smaller where the lower wings reach the legs. 2026-11-20 (owner: "a
 * little low, move it up a little bit"): each raised 0.06, so 0.08 to 0.12 below the Neck, on the upper shoulder blades;
 * and closer to the back ("a little more closer"): 0.03 to 0.09 off it, as close as the swinging arms allow.
 */
export interface WingFit {
  back: number;
  up: number;
  scale: number;
}

const NO_FIT: WingFit = { back: 0, up: 0, scale: 1 };

/** One fit for both bodies. */
const both = (fit: WingFit): Record<Gender, WingFit> => ({ male: fit, female: fit });
const FEATHER = both({ back: 0.06, up: -0.12, scale: 0.9 });
const ANGEL = both({ back: 0.09, up: -0.12, scale: 0.85 });
const PROPHET = both({ back: 0.09, up: -0.08, scale: 0.55 });
const BUTTERFLY = both({ back: 0.04, up: -0.1, scale: 0.58 });

/** The fit of each wing model (its key's name), by body; a model or body not listed sits as a flier's wings. */
const FITS: Readonly<Record<string, Partial<Record<Gender, WingFit>>>> = {
  item_ridridwinfeather01: FEATHER, item_ridridwinfeather02: FEATHER,
  item_ridridwinangel01: ANGEL, item_ridridwinangel02: ANGEL,
  item_ridridwinprophet01: PROPHET, item_ridridwinprophet02: PROPHET,
  item_ridridbutterpeacock01: BUTTERFLY, item_ridridbutterbujun01: BUTTERFLY, item_ridridbuttermolpo01: BUTTERFLY,
  item_ridridbuttertrans01: BUTTERFLY,
  item_ridriddragonfly01: both({ back: 0.03, up: -0.1, scale: 0.8 }),
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
