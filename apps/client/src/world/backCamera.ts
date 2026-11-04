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

/** Piece 7 M5: `m_fZoom` and `m_fRoty` as Neuz starts them (`Camera.cpp`), which the flight camera keeps. */
const ZOOM = 6;
const ROT_Y = -12;
/** `fFactor` in flight (`CWorld::Process`): the offset closes a tenth of its gap a step. */
const FLIGHT_EASE = 10;
/** `vPos.y += 0.9f`, and the look-at point `m_vLookAt.y += 0.4f` over it. */
const EYE_HEIGHT = f32(0.9);
const LOOK_HEIGHT = f32(0.4);
/** `fDiv` (`World3D.cpp:58`): the field of view is `D3DX_PI / fDiv`, 4 (45 degrees) unless the turbo widens it. */
const FDIV_GROUND = 4;
const FDIV_TURBO = 2;
const FDIV_IN = f32(0.2);
const FDIV_OUT = f32(0.05);
const RADIANS_PER_DEGREE = f32(f32(3.141592654) / 180);
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Where the camera looks from and at, in web coordinates. */
export interface ChaseView {
  position: Vec3;
  target: Vec3;
}

export class BackCamera {
  /** Independent web heading: character turns and tap-to-walk never rotate the view. */
  heading: number | null = null;
  pitch = CHASE_PITCH;
  private relocatePending = false;
  private offset: Vec3 = [0, 0, 0];
  private easeSteps = 0;
  private lastAt: Vec3 | null = null;

  rotate(dx: number, dy: number): void {
    // Piece 7 M5: in flight the arrows (and a touch drag) turn the camera round the flier (m_fRotx, m_fRoty)
    if (this.flightOffset !== null) {
      this.flightRotX = f32(this.flightRotX + dx * 0.005 * DEGREES_PER_RADIAN);
      this.flightRotY = Math.max(-60, Math.min(60, f32(this.flightRotY + dy * 0.005 * DEGREES_PER_RADIAN)));
      return;
    }
    this.heading = (this.heading ?? 0) + dx * 0.005;
    this.pitch = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, this.pitch - dy * 0.005));
  }

  /** The camera follows a teleport/revival over 30 rules steps (half a second). */
  relocate(): void { this.relocatePending = true; }
  /** `m_bOld`: the last step's camera was pulled in. */
  private old = false;
  /** `m_bStart`: the camera is easing back out. */
  private start = false;
  /** `m_fLength2`: how far from the look-at point the camera is while it eases out (the last hit's distance, then more). */
  private length2 = 0;
  /** The view of the last `follow`; null before the first. */
  view: ChaseView | null = null;
  /** Piece 7 M5: `m_vOffset` in flight (D3D), null on the ground; and `fDiv`. */
  private flightOffset: Vec3 | null = null;
  private fDiv = FDIV_GROUND;
  /** Piece 7 M5: `m_fRotx` and `m_fRoty`'s change in flight, in degrees: 0 as a flight starts (`Unlock`). */
  private flightRotX = 0;
  private flightRotY = 0;

  /**
   * One step of the camera behind the mover standing at `at` (web coordinates) at FlyFF angle `angle`, on `ground`
   * (D3D): `chaseCamera`'s view (heading = pi - the angle in radians, global constraints), its position through
   * `bound`, which works in D3D (the mirror, web z = -z, both ways).
   */
  follow(at: Vec3, angle: number, ground: Ground): ChaseView {
    this.flightOffset = null;
    this.fDiv = FDIV_GROUND;
    this.heading ??= Math.PI - (angle * Math.PI) / 180;
    if (this.relocatePending && this.lastAt !== null) {
      this.offset = this.lastAt.map((v, i) => v - at[i]!) as Vec3;
      this.easeSteps = 30;
    }
    this.relocatePending = false;
    const t = this.easeSteps / 30;
    const ease = t * t * (3 - 2 * t);
    const eased = at.map((v, i) => v + this.offset[i]! * ease) as Vec3;
    if (this.easeSteps > 0) this.easeSteps--;
    this.lastAt = eased;
    const chase = chaseCamera(eased, this.heading, this.pitch);
    const position = toWebPosition(this.bound(toWebPosition(chase.target), toWebPosition(chase.position), ground));
    this.view = { position, target: chase.target };
    return this.view;
  }

  /**
   * Piece 7 M5: one step of the camera behind the own flier at `at` (web coordinates), FlyFF angle `angle` and pitch
   * `angleX` (`CBackCamera::Process` in flight, `Camera.cpp:184-446`, unlocked: no rotation of its own). The offset
   * `(0, 0, -4 - m_fZoom * 2)` (2 m behind at the turbo's widest) is turned up by `m_fRoty + m_fZoom * 4 + angleX` (at
   * most 80) and round to behind the heading, and `m_vOffset` closes a tenth of its gap to it a step; the camera looks
   * at 1.3 over the feet, through `bound` (`CheckBound`) as on the ground. The field of view (`CWorld::Projection`,
   * `World3D.cpp:58-109`, in degrees) narrows by 0.2 of `fDiv` a step to 90 degrees with the thrust and the turbo, widens
   * back by 0.05 with the thrust alone, and is 45 without it. The ground's heading takes the flier's, so a landing keeps
   * it (Decision 8).
   */
  followFlight(
    at: Vec3, angle: number, angleX: number, accelerating: boolean, turbo: boolean, ground: Ground,
  ): ChaseView & { fov: number } {
    if (accelerating && turbo) this.fDiv = Math.max(FDIV_TURBO, f32(this.fDiv - FDIV_IN));
    else if (accelerating) this.fDiv = Math.min(FDIV_GROUND, f32(this.fDiv + FDIV_OUT));
    else this.fDiv = FDIV_GROUND;
    const feet = toWebPosition(at);
    const eye: Vec3 = [feet[0], f32(feet[1] + EYE_HEIGHT), feet[2]];
    if (this.flightOffset === null) this.flightRotX = this.flightRotY = 0; // Unlock: the rotations back to 0
    const roty = Math.min(80, f32(f32(f32(ROT_Y + this.flightRotY) + ZOOM * 4) + angleX));
    const yaw = f32(f32(this.flightRotX - angle) + 180);
    const back = this.fDiv === FDIV_TURBO ? -2 : -4 - ZOOM * 2;
    // D3DXMatrixRotationX, then D3DXMatrixRotationY, on the row vector (0, 0, back)
    const x = f32(roty * RADIANS_PER_DEGREE);
    const y1 = f32(-back * f32(Math.sin(x)));
    const z1 = f32(back * f32(Math.cos(x)));
    const t = f32(yaw * RADIANS_PER_DEGREE);
    const dest: Vec3 = [f32(z1 * f32(Math.sin(t))), y1, f32(z1 * f32(Math.cos(t)))];
    let offset = this.flightOffset;
    if (offset === null) {
      // from the ground's camera where there was one, else straight at its place
      const was = this.view === null ? null : toWebPosition(this.view.position);
      offset = was === null ? dest : sub(was, eye);
    } else {
      offset = add(offset, scale(sub(dest, offset), f32(1 / FLIGHT_EASE)));
    }
    this.flightOffset = offset;
    const camera = add(eye, offset);
    const look: Vec3 = [eye[0], f32(eye[1] + LOOK_HEIGHT), eye[2]];
    const position = toWebPosition(this.bound(look, camera, ground));
    this.heading = Math.PI - (angle * Math.PI) / 180;
    this.lastAt = at;
    this.view = { position, target: toWebPosition(look) };
    return { ...this.view, fov: 180 / this.fDiv };
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
