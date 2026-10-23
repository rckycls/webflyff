// The chase camera behind the player's own character (spec §3.5, §3.7): where `chaseCamera` (`packages/scene`) puts it,
// kept out of the land and the objects by `CWorld::CheckBound` (`sim/camera.ts`) and eased back out after it was pulled
// in, as `CBackCamera::Process` does (`Source/_Common/Camera.cpp:388-444`, `__CAM_FAST_RECOVER`). Without the easing a
// line that grazes a wall's edge would put the camera near and far by turns, every frame. Neuz processes its camera
// once a `FrameMove`, in `CWorld::Process` (`World.cpp:924-935`), which runs at the rules' 60 steps a second: the world
// screen calls `follow` once a rules step, and draws from the last `view`.

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import { CHASE_PITCH, chaseCamera } from '@flyffweb/scene';
import { checkBound } from './sim/camera';
import type { Ground } from './sim/collision';
import { add, normalize, scale, sub, toFloats } from './sim/d3dx';

const f32 = Math.fround;

/** `m_fLength2 += 0.37f` (`Camera.cpp:415`, `__CAM_FAST_RECOVER`): how much farther out the camera goes each step. */
const EASE_OUT = f32(0.37);

/** Where the camera looks from and at, in web coordinates. */
export interface ChaseView {
  position: Vec3;
  target: Vec3;
}

export class BackCamera {
  /** `m_bOld`: the last step's camera was pulled in. */
  private old = false;
  /** `m_bStart`: the camera is easing back out. */
  private start = false;
  /** `m_fLength2`: how far from the look-at point the camera is while it eases out (the last hit's distance, then more). */
  private length2 = 0;
  /** The view of the last `follow`; null before the first. */
  view: ChaseView | null = null;

  /**
   * One step of the camera behind the mover standing at `at` (web coordinates) at FlyFF angle `angle`, on `ground`
   * (D3D): `chaseCamera`'s view (heading = pi - the angle in radians, global constraints), its position through
   * `bound`, which works in D3D (the mirror, web z = -z, both ways).
   */
  follow(at: Vec3, angle: number, ground: Ground): ChaseView {
    const chase = chaseCamera(at, Math.PI - (angle * Math.PI) / 180, CHASE_PITCH);
    const position = toWebPosition(this.bound(toWebPosition(chase.target), toWebPosition(chase.position), ground));
    this.view = { position, target: chase.target };
    return this.view;
  }

  /**
   * The camera's part of `CBackCamera::Process` after its position is worked out (`Camera.cpp:393-440`), in D3D: the
   * camera at `camera` (`m_vPos`) looking at `target` (`m_vLookAt`), through `CheckBound`. A hit puts it there and keeps
   * the distance (`m_fLength2 = fLength`). The first step without a hit after one starts the easing (`m_bStart`); while
   * it runs the camera is `m_fLength2` out from the look-at point toward where it would be, 0.37 more each step, until
   * that passes the distance it would be at (that step is the last, `m_fLength2 > fLength`). A hit while it runs takes
   * the hit's distance, plus that step's 0.37, and ends it.
   */
  bound(target: Vec3, camera: Vec3, ground: Ground): Vec3 {
    const { crash, out, length } = checkBound(target, camera, ground);
    if (crash) this.length2 = length;
    if (this.old && !crash) this.start = true; // (m_fLength1 = fLength: nothing reads it)
    let at = out;
    if (this.start) {
      const dir = normalize(sub(toFloats(camera), toFloats(target))); // vCPos - m_vLookAt
      this.length2 = f32(this.length2 + EASE_OUT);
      if (this.length2 > length) this.start = false;
      at = add(toFloats(target), scale(dir, this.length2));
    }
    this.old = crash;
    return at;
  }
}
