// How the player moves on the ground and where the camera follows it from. Positions are web coordinates in world
// units (FlyFF meters); only x and z are the player's to change, its height is the ground's (the world view samples
// it). The heading is in radians: 0 faces -z (D3D +z), and it grows turning right, toward +x.

import type { Vec3 } from '@flyffweb/formats';
import type { MoveIntent } from '../input/keyboard';

export const WALK_SPEED = 6;
export const RUN_SPEED = 12;
/** Radians per second at full turn. */
export const TURN_SPEED = 2.5;

/**
 * The chase camera, from CBackCamera::Process (Source/_Common/Camera.cpp:184-446): it looks at the player's position
 * raised by 0.9 (:200) and then 0.4 (:388), from 4 + m_fZoom * 2 behind (:366), m_fZoom being 6 by default (:118).
 */
export const CHASE_DISTANCE = 4 + 6 * 2;
export const CHASE_LOOK_HEIGHT = 0.9 + 0.4;

/** Which motion the character plays. */
export type Gait = 'stand' | 'walk' | 'run';

export interface PlayerState {
  x: number;
  z: number;
  heading: number;
}

/** The unit vector `[x, z]` the heading faces. */
export function forwardOf(heading: number): [number, number] {
  return [Math.sin(heading), -Math.cos(heading)];
}

/** The heading that faces the direction `(dx, dz)`. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

/**
 * Moves `player` for `dt` seconds of `intent` (keyboard or joystick): it turns, then goes along its heading, forward at
 * walking or running speed, backward at walking speed. Returns the motion that fits.
 */
export function steer(player: PlayerState, intent: MoveIntent, dt: number): Gait {
  player.heading += intent.turn * TURN_SPEED * dt;
  if (intent.forward === 0) return 'stand';
  const running = intent.run && intent.forward > 0;
  const speed = (running ? RUN_SPEED : WALK_SPEED) * Math.sign(intent.forward);
  const [fx, fz] = forwardOf(player.heading);
  player.x += fx * speed * dt;
  player.z += fz * speed * dt;
  return running ? 'run' : 'walk';
}

/** A walk along points (their heights are ignored) at a fixed speed, a step per frame. */
export class Route {
  private next = 0;

  constructor(
    private readonly points: readonly Vec3[],
    readonly speed: number,
  ) {}

  /** Running when the speed is the running speed or more. */
  get gait(): Gait {
    return this.speed >= RUN_SPEED ? 'run' : 'walk';
  }

  /** Moves `player` for `dt` seconds, facing where it goes. True once it stands on the last point. */
  step(player: PlayerState, dt: number): boolean {
    let budget = this.speed * dt;
    while (this.next < this.points.length) {
      const target = this.points[this.next]!;
      const dx = target[0] - player.x;
      const dz = target[2] - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0) player.heading = headingOf(dx, dz);
      if (distance > budget) {
        player.x += (dx / distance) * budget;
        player.z += (dz / distance) * budget;
        return false;
      }
      player.x = target[0];
      player.z = target[2];
      budget -= distance;
      this.next++;
    }
    return true;
  }
}

/**
 * The back camera's pitch: m_fCurRoty = m_fRoty + m_fZoom * 4 = -12 + 24 degrees (Camera.cpp:120, :250), turning the
 * offset about x (:370), so the camera is above its target looking 12 degrees down.
 */
export const CHASE_PITCH = (12 * Math.PI) / 180;

/**
 * CWorld::CheckBound (World3D.cpp:1658-1700), its ground part: from 1 m out, in steps of 0.1 m, the first point less
 * than 0.6 m above the ground (__VER >= 11) is where the camera stops.
 */
const BOUND_START = 1;
const BOUND_STEP = 0.1;
const BOUND_CLEARANCE = 0.6;

/**
 * Where the chase camera is for a player standing at `at` (web, on the ground) with `heading`: CHASE_DISTANCE behind
 * it and `pitch` radians above its look-at point, which is CHASE_LOOK_HEIGHT over the ground. With `groundAt` (the
 * ground height at a web x, z, or null where unknown), the camera is pulled in front of ground that is in the way,
 * as the client's does, so it never looks from inside a hill.
 */
export function chaseCamera(
  at: Vec3,
  heading: number,
  pitch: number,
  groundAt?: (x: number, z: number) => number | null,
): { position: Vec3; target: Vec3 } {
  const target: Vec3 = [at[0], at[1] + CHASE_LOOK_HEIGHT, at[2]];
  const [fx, fz] = forwardOf(heading);
  const back = Math.cos(pitch);
  // unit vector from the target to the camera
  const direction: Vec3 = [-fx * back, Math.sin(pitch), -fz * back];
  let distance = CHASE_DISTANCE;
  if (groundAt !== undefined) {
    for (let d = BOUND_START; d < CHASE_DISTANCE; d += BOUND_STEP) {
      const x = target[0] + direction[0] * d;
      const z = target[2] + direction[2] * d;
      const ground = groundAt(x, z);
      if (ground !== null && target[1] + direction[1] * d < ground + BOUND_CLEARANCE) {
        distance = d;
        break;
      }
    }
  }
  return {
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    target,
  };
}
