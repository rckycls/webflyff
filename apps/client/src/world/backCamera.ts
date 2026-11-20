// The chase camera behind the player's own character (spec §3.5, §3.7): where `chaseCamera` (`packages/scene`) puts it,
// kept out of the land and the objects by `CWorld::CheckBound` (`sim/camera.ts`) and eased back out after it was pulled
// in, as `CBackCamera::Process` does (`Source/_Common/Camera.cpp:388-444`, `__CAM_FAST_RECOVER`). Without the easing a
// line that grazes a wall's edge would put the camera near and far by turns, every frame. Neuz processes its camera
// once a `FrameMove`, in `CWorld::Process` (`World.cpp:924-935`), which runs at the rules' 60 steps a second: the world
// screen calls `follow` once a rules step, and draws from the last `view`.
//
// 2026-11-20 (mouse-drag, docs/2026-11-20-mouse-drag.md): V15's zoom (the wheel, PageUp / PageDown), `m_fRoty` and its
// limits, the ground's offset easing a quarter a step, the camera lock's `behind` and flight's `unlock`.

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import { chaseCamera } from '@flyffweb/scene';
import { checkBound } from './sim/camera';
import type { Ground } from './sim/collision';
import { add, normalize, scale, sub, toFloats } from './sim/d3dx';

const f32 = Math.fround;

/** `m_fLength2 += 0.37f` (`Camera.cpp:415`, `__CAM_FAST_RECOVER`): how much farther out the camera goes each step. */
const EASE_OUT = f32(0.37);

/** `m_fZoom` and `m_fRoty` as Neuz starts them (`Camera.cpp:118-120`). */
const ZOOM = 6;
const ROT_Y = -12;
/** `fFactor` in flight (`CWorld::Process`): the offset closes a tenth of its gap a step. */
const FLIGHT_EASE = 10;
/** 2026-11-20 (mouse-drag): `fFactor` on the ground (`World.cpp:933`): the offset closes a quarter of its gap a step. */
const GROUND_EASE = 4;
/**
 * 2026-11-20 (mouse-drag): the zoom's limits. The wheel: a notch is 0.5 (`OnMouseWheel`, `WndWorld.cpp:7343-7408`), down
 * to -1.5 and up to 7 with ZOOMLIMIT (V15's default, `HwOption.cpp:261`), 15 without. PageUp / PageDown: 0.6 a frame,
 * from 0 to 7 (`CWndWorld::Process`, :8761-8803). In the own room (CM_MYROOM) never under 0.5 (`Camera.cpp:202-206`).
 */
const WHEEL_ZOOM = 0.5;
const ZOOM_MIN = -1.5;
const ZOOM_MAX = 7;
const ZOOM_MAX_FREE = 15;
const PAGE_ZOOM = 0.6;
const PAGE_ZOOM_MIN = 0;
const PAGE_ZOOM_MAX = 7;
const ROOM_ZOOM_MIN = 0.5;
/** `m_fRoty`'s lowest (`WndWorld.cpp:7589-7590`); its highest is `80 - m_fZoom * 4`, and `m_fCurRoty` at most 80 (`Camera.cpp:336`). */
const ROT_Y_MIN = -80;
const CUR_ROT_Y_MAX = 80;
/** CM_MYROOM's lowest `m_fCurRoty`, 10 degrees (`Camera.cpp:340-349`). */
const ROOM_MIN_PITCH = 10;
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
  /**
   * Independent web heading (on the ground the camera is locked, `CBackCamera::Lock`: its turn is the world's, not the
   * character's): character turns and tap-to-walk never rotate the view; the camera lock (`behind`) and drags do.
   */
  heading: number | null = null;
  /** 2026-11-20 (mouse-drag): `m_fZoom` (`Camera.cpp:118`): the camera is `4 + m_fZoom * 2` behind (:366). */
  zoom = ZOOM;
  /** 2026-11-20 (mouse-drag): ZOOMLIMIT (`HwOption.cpp:261`, on in V15): the wheel goes out to 7, else 15. */
  zoomLimit = true;
  /**
   * 2026-11-20 (mouse-drag): `m_fRoty` in degrees: the camera is `m_fRoty + m_fZoom * 4` above the look (`Camera.cpp:250`).
   * One for the ground and the air, as in Neuz: a take-off's `Unlock` sets it to 0 and a landing keeps it.
   */
  rotY = ROT_Y;
  /** 2026-11-15 (housing): the own room (CM_MYROOM, set on REPLACE to WI_WORLD_MINIROOM, `DPClient.cpp:2392-2401`). */
  private room = false;
  private relocatePending = false;
  private offset: Vec3 = [0, 0, 0];
  private easeSteps = 0;
  private lastAt: Vec3 | null = null;
  /** 2026-11-20 (mouse-drag): `m_vOffset` on the ground, from the look-at point (web); null before the first step. */
  private groundOffset: Vec3 | null = null;

  /**
   * The pitch the ground camera is at, in radians: `m_fCurRoty = m_fRoty + m_fZoom * 4`, at most 80 (`Camera.cpp:250,
   * 336-337`), at least 10 in the own room (:340-349).
   */
  get pitch(): number {
    let degrees = Math.min(CUR_ROT_Y_MAX, this.rotY + this.zoom * 4);
    if (this.room && degrees < ROOM_MIN_PITCH) degrees = ROOM_MIN_PITCH;
    return (degrees * Math.PI) / 180;
  }

  /** 2026-11-15 (housing): in the own room the camera stays 10 degrees or more up and 0.5 or more out (CM_MYROOM). */
  setRoom(room: boolean): void {
    this.room = room;
    if (room) this.keepRoom();
  }

  /** CM_MYROOM: `m_fZoom` at least 0.5, and at the 10-degree floor `m_fRoty` kept between -30 and 0 (`Camera.cpp:202-206, 340-349`). */
  private keepRoom(): void {
    if (this.zoom < ROOM_ZOOM_MIN) this.zoom = ROOM_ZOOM_MIN;
    if (this.rotY + this.zoom * 4 <= ROOM_MIN_PITCH) this.rotY = Math.min(0, Math.max(-30, this.rotY));
  }

  /**
   * 2026-11-20 (mouse-drag): a turn in V15's degrees: `yaw` onto `m_fRotx` (the heading; in flight the turn round the
   * flier), `up` onto `m_fRoty`, kept between -80 and `80 - m_fZoom * 4` (`OnMouseMove`, `WndWorld.cpp:7569-7590`; the
   * arrows, :8696-8758). Positive `up` lifts the camera.
   */
  turn(yaw: number, up: number): void {
    if (this.flightOffset !== null) this.flightRotX = f32(this.flightRotX + yaw);
    else this.heading = (this.heading ?? 0) + (yaw * Math.PI) / 180;
    let rotY = this.rotY + up;
    if (rotY > 80 - this.zoom * 4) rotY = 80 - this.zoom * 4;
    if (rotY < ROT_Y_MIN) rotY = ROT_Y_MIN;
    this.rotY = rotY;
    if (this.room) this.keepRoom();
  }

  /** A touch drag, in pixels (the phone's own: 0.005 rad a pixel; a drag down lowers the camera). */
  rotate(dx: number, dy: number): void {
    this.turn(dx * 0.005 * DEGREES_PER_RADIAN, -dy * 0.005 * DEGREES_PER_RADIAN);
  }

  /**
   * 2026-11-20 (mouse-drag): the wheel, `notches` as the browser's deltaY counts them (positive: rolled toward the
   * player, Windows' negative zDelta): in by 0.5 a notch to -1.5, out to 7 (15 without ZOOMLIMIT) (`WndWorld.cpp:7352-7404`).
   */
  wheel(notches: number): void {
    if (notches === 0) return;
    if (notches > 0) this.zoom = Math.max(ZOOM_MIN, this.zoom - WHEEL_ZOOM * notches);
    else this.zoom = Math.min(this.zoomLimit ? ZOOM_MAX : ZOOM_MAX_FREE, this.zoom - WHEEL_ZOOM * notches);
    if (this.room) this.keepRoom();
  }

  /** 2026-11-20 (mouse-drag): one frame of PageUp (-1: in, down to 0) or PageDown (1: out, up to 7) (:8761-8803). */
  page(direction: -1 | 1): void {
    if (direction < 0) {
      this.zoom -= PAGE_ZOOM;
      if (this.zoom < PAGE_ZOOM_MIN) this.zoom = PAGE_ZOOM_MIN;
    } else {
      this.zoom += PAGE_ZOOM;
      if (this.zoom > PAGE_ZOOM_MAX) this.zoom = PAGE_ZOOM_MAX;
    }
    if (this.room) this.keepRoom();
  }

  /**
   * 2026-11-20 (mouse-drag): the camera turned to behind a mover at FlyFF `angle`, `m_fRotx = -GetAngle()`: the camera
   * lock while walking (`CWndWorld::Process`, `WndWorld.cpp:8011-8015`) and a right double click (:7336-7339). The
   * offset's quarter a step (`GROUND_EASE`) makes it a short swing, not a jump. Not in the air.
   */
  behind(angle: number): void {
    if (this.flightOffset !== null) return;
    this.heading = Math.PI - (angle * Math.PI) / 180;
  }

  /**
   * 2026-11-20 (mouse-drag): `CBackCamera::Unlock` in flight (`Camera.cpp:106-110`): the turn and `m_fRoty` back to 0,
   * as a right or middle button is let go in the air (`OnRButtonUp`, `WndWorld.cpp:7143-7144`; `OnMButtonUp`, :7216-7217).
   */
  unlock(): void {
    if (this.flightOffset === null) return;
    this.flightRotX = 0;
    this.rotY = 0;
  }

  /** Whether the last step was in the air. */
  get flying(): boolean {
    return this.flightOffset !== null;
  }

  /** The distance behind, `4 + m_fZoom * 2` (`Camera.cpp:366`). */
  private get far(): number {
    return 4 + this.zoom * 2;
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
  /** Piece 7 M5: `m_fRotx` in flight, in degrees: 0 as a flight starts (`Unlock`). */
  private flightRotX = 0;

  /**
   * One step of the camera behind the mover standing at `at` (web coordinates) at FlyFF angle `angle`, on `ground`
   * (D3D): `chaseCamera`'s view (heading = pi - the angle in radians, global constraints) `4 + m_fZoom * 2` behind, its
   * offset from the look-at point closing a quarter of its gap a step (`m_vOffset`, `Camera.cpp:375-377`, `fFactor` 4),
   * its position through `bound`, which works in D3D (the mirror, web z = -z, both ways).
   */
  follow(at: Vec3, angle: number, ground: Ground): ChaseView {
    const landing = this.flightOffset !== null;
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
    const chase = chaseCamera(eased, this.heading, this.pitch, undefined, this.far);
    const dest = sub(chase.position, chase.target);
    if (this.groundOffset === null) {
      // the first step, or a landing: from where the camera was
      this.groundOffset = landing && this.view !== null ? sub(this.view.position, chase.target) : dest;
    } else {
      this.groundOffset = add(this.groundOffset, scale(sub(dest, this.groundOffset), 1 / GROUND_EASE));
    }
    const camera = add(chase.target, this.groundOffset);
    const position = toWebPosition(this.bound(toWebPosition(chase.target), toWebPosition(camera), ground));
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
   * it (Decision 8). 2026-11-20 (mouse-drag): the wheel's zoom and the shared `m_fRoty`, which the take-off's `Unlock`
   * sets to 0 (`ActionMoverMsg.cpp:1087`, `Camera.cpp:106-110`).
   */
  followFlight(
    at: Vec3, angle: number, angleX: number, accelerating: boolean, turbo: boolean, ground: Ground,
  ): ChaseView & { fov: number } {
    if (accelerating && turbo) this.fDiv = Math.max(FDIV_TURBO, f32(this.fDiv - FDIV_IN));
    else if (accelerating) this.fDiv = Math.min(FDIV_GROUND, f32(this.fDiv + FDIV_OUT));
    else this.fDiv = FDIV_GROUND;
    const feet = toWebPosition(at);
    const eye: Vec3 = [feet[0], f32(feet[1] + EYE_HEIGHT), feet[2]];
    if (this.flightOffset === null) this.flightRotX = this.rotY = 0; // Unlock: the rotations back to 0
    this.groundOffset = null;
    const roty = Math.min(80, f32(f32(this.rotY + f32(this.zoom * 4)) + angleX));
    const yaw = f32(f32(this.flightRotX - angle) + 180);
    const back = this.fDiv === FDIV_TURBO ? -2 : -4 - this.zoom * 2;
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
