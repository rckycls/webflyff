// The world screen's views of the movers (`MoverViews`) without a screen, for what the rules ask of them: a model's
// frames, which end a swing and land its blow (`isEndFrame`, `isAttrHit`), and its box (`pickCandidates`, which
// `WorldScreen.measureRadii` turns into the radii of `IsRangeObj`). Nothing is drawn (`update` is never called); what
// the views load is read from the disk instead of fetched and decoded:
//   - a model is an empty one with the box its glbs give (`drawnBox`: its parts' boxes and its held items', as
//     `loadMoverModel` and `attachHeld` make it), and no item is put in its hands (their boxes are in it already);
//   - a motion is its glb's events alone, the first animation's extras (`MotionEvents`: frames, speed, hit frames),
//     which GLTFLoader puts in the clip's userData, looped as the client loops it (`loopMotion`), with no tracks.

import { AnimationClip, AnimationMixer, Group, Scene } from 'three';
import { loopMotion } from '@flyffweb/scene';
import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import type { GameData } from '../../src/world/gameData';
import { MoverViews } from '../../src/world/render/MoverViews';
import { lookOf } from '../../src/world/render/looks';
import type { MoverLook } from '../../src/world/render/looks';
import { drawnBox } from './diskAssets';
import type { DiskAssets } from './diskAssets';

/**
 * The model `loadMoverModel` would give `look`, as the rules see it: its box (`drawnBox`, a new object each call, as
 * `box()` gives it), on an empty root with a mixer that has nothing to play, and no grips (no item is held: the views'
 * `hold` gets none). Rejects where `loadMoverModel` rejects (no part or no skeleton file), and the views draw their
 * placeholder, whose box they give instead.
 */
export function headlessModel(assets: DiskAssets, data: GameData): (look: MoverLook) => Promise<AssembledCharacter> {
  return async (look) => {
    const box = drawnBox(assets, look, data);
    if (box === null) throw new Error(`none of its parts could be loaded (${look.parts.join(', ')})`);
    const root = new Group();
    return {
      root,
      mixer: new AnimationMixer(root),
      grips: null,
      box: () => ({ min: [...box.min], max: [...box.max] }),
      addBox: () => {},
      release: () => {},
    };
  };
}

/**
 * The motion the world screen's `loadMotion` would give for `key` (`loopMotion` of the glb's first animation), with
 * the animation's extras (its `events`) in the clip's userData as GLTFLoader puts them, and no tracks: the rules read
 * only the events. Rejects as `loadMotion` does for a file without an animation.
 */
export function headlessMotion(assets: DiskAssets): (key: string) => Promise<LoopedMotion> {
  return async (key) => {
    const animation = assets.glb(key).animations?.[0];
    if (animation === undefined) throw new Error('the file has no animation');
    const clip = new AnimationClip(animation.name ?? key, 0, []);
    Object.assign(clip.userData, animation.extras ?? {});
    return loopMotion(clip);
  };
}

/**
 * The views as the world screen makes them (`WorldScreen.openStage`), from the disk: the own character dressed from the
 * character list's `equipment` (`lookOf`), the item catalog for the hands' motion sets, the mover catalog for the
 * shakes. What they cannot load, which the screen says on its overlay, goes to `report`.
 */
export function headlessViews(
  assets: DiskAssets, data: GameData, equipment: readonly number[], report: (message: string) => void,
): MoverViews {
  return new MoverViews(
    new Scene(), headlessModel(assets, data), { error: report, addGpuBytes: () => {} }, (mover) => lookOf(mover, data, equipment),
    headlessMotion(assets), () => Promise.resolve([]), data.itemProps, { moverProps: data.movers },
  );
}
