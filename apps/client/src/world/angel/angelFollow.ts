// The angel that follows its player (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md §6): where it
// is, how it catches up, and the sparkles it leaves. Pure, in D3D coordinates; render/AngelLayer.ts draws it.
//
//   Function                       File:lines                         what
//   CMover::Process (the angel)    _Common/Mover.cpp:3560-3627        a player with the IK3_ANGEL_BUFF buff gets the model,
//                                                                     1 to the +x side of it; without the buff it goes
//   CMover::AngelMoveProcess       Mover.cpp:3972-4021                past 100 it is made again; past 1 it moves toward the
//                                                                     player by GetSpeed * dist² / 10; then 2 sparkles
//   CMover::CreateAngelParticle    Mover.cpp:10765-10798              the sparkles: 1.1 up, backward within 45 degrees
//   CDPClient::OnMoverDeath        Neuz/DPClient.cpp:1980-1987        a dead player's angel is made again
//
// Neuz runs these once a frame; here once a rules step (60 a second), as the pets' sparkles.

import type { Vec3 } from '@flyffweb/protocol';
import { particleRandom } from '../pets/petParticles';
import type { ParticleRandom, PetParticles, SparkleOwner } from '../pets/petParticles';

const f32 = Math.fround;
/** `D3DXToRadian` with `D3DX_PI` 3.141592654f. */
const radians = (degrees: number): number => f32(degrees * f32(f32(3.141592654) / 180));

/** `D3DXMatrixScaling( 0.2f, 0.2f, 0.2f )`, and the model 1 over `m_AngelPos` (`m_AngelWorldM._42 = y + 1.0f`). */
export const ANGEL_SCALE = 0.2;
export const ANGEL_LIFT = 1;
/** `fDistSq > 100.0f * 100.0f`: a teleport; `fDistSq > 1.0f * 1.0f`: it moves. */
const RESET_SQ = 100 * 100;
const MOVE_SQ = 1;

/** `m_AngelPos` at the model's making: the player's place, 1 to its +x (:3596-3607). */
export function startAngel(player: Vec3): Vec3 {
  return [f32(player[0] + 1), f32(player[1]), f32(player[2])];
}

/**
 * One `AngelMoveProcess` (:3972-4017): null when the player is past 100 away (the model is made again, next at
 * `startAngel`); else the angel's next place, moved toward the player by `speed * dist² / 10` when past 1 away (`speed`
 * being `GetSpeed( m_fSpeed )`, the player's run a step).
 */
export function stepAngel(angel: Vec3, player: Vec3, speed: number): Vec3 | null {
  const d: Vec3 = [f32(player[0] - angel[0]), f32(player[1] - angel[1]), f32(player[2] - angel[2])];
  const distSq = f32(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (distSq > RESET_SQ) return null;
  if (distSq <= MOVE_SQ) return angel;
  // D3DXVec3Lerp( (0,0,0), (1,0,0), fDistSq / 10 ).x, then the normalised distance times GetSpeed times it
  const serp = f32(distSq / 10);
  const step = f32(f32(speed) * serp);
  const length = f32(Math.sqrt(distSq));
  return [
    f32(angel[0] + f32(f32(d[0] / length) * step)),
    f32(angel[1] + f32(f32(d[1] / length) * step)),
    f32(angel[2] + f32(f32(d[2] / length) * step)),
  ];
}

/**
 * `CreateAngelParticle( m_AngelPos )` of the player `owner`: 2 particles from 1.1 over the angel, each 0.03 lower, flying
 * at up to 0.02 a frame along a turn within 45 degrees of the player's back and a pitch of -30 to 30 about the player's,
 * of the angel's kind `kind` plus 0 to 2 (`m_dwAngelKind + xRandom( 3 )`), the player's height plus 0.5 their ground.
 */
export function createAngelParticle(
  particles: PetParticles, owner: SparkleOwner, angel: Vec3, kind: number, random: ParticleRandom = particleRandom,
): void {
  const pos: Vec3 = [f32(angel[0]), f32(angel[1] + f32(1.1)), f32(angel[2])];
  for (let j = 0; j < 2; j++) {
    pos[1] = f32(pos[1] - f32(0.03));
    const angXZ = radians(f32(f32(f32(-45 + random.float(90)) + owner.angle) + 180));
    const angH = radians(f32(f32(owner.angleX + random.float(-30)) + random.float(30)));
    const speed = random.float(f32(0.02));
    const dist = f32(f32(Math.cos(-angH)) * speed);
    const vel: Vec3 = [f32(f32(Math.sin(angXZ)) * dist), f32(-f32(Math.sin(-angH)) * speed), f32(-f32(Math.cos(angXZ)) * dist)];
    particles.create(kind + random.int(3), [...pos], vel, f32(owner.y + 0.5));
  }
}

/** The angels of the players in view: each one's place, made at `startAngel` and moved by `stepAngel` each step. */
export class AngelFollowers {
  private readonly angels = new Map<number, { itemId: number; pos: Vec3 }>();

  /**
   * One step for every player in view: `players` gives each one's id, place, `GetSpeed` and the angel buff's item (or
   * null): an angel is made (`m_pAngel == NULL`) or goes with its buff, moves, and sparkles through `sparkle`.
   */
  step(
    players: Iterable<{ id: number; pos: Vec3; speed: number; angelItem: number | null }>,
    sparkle: (id: number, angel: Vec3, itemId: number) => void,
  ): void {
    const seen = new Set<number>();
    for (const { id, pos, speed, angelItem } of players) {
      if (angelItem === null) continue;
      seen.add(id);
      let angel = this.angels.get(id);
      if (angel === undefined || angel.itemId !== angelItem) {
        angel = { itemId: angelItem, pos: startAngel(pos) };
        this.angels.set(id, angel);
      }
      const next = stepAngel(angel.pos, pos, speed);
      if (next === null) {
        this.angels.delete(id); // made again at the next step (`m_pAngel = NULL`, :3979-3985)
        continue;
      }
      angel.pos = next;
      sparkle(id, next, angelItem);
    }
    for (const id of [...this.angels.keys()]) if (!seen.has(id)) this.angels.delete(id);
  }

  /** A player died: its angel is made again (OnMoverDeath, DPClient.cpp:1980-1987). */
  died(id: number): void {
    this.angels.delete(id);
  }

  /** The angel of `id`: its buff's item and its place (D3D), or undefined. */
  of(id: number): { itemId: number; pos: Vec3 } | undefined {
    return this.angels.get(id);
  }

  /** Every angel, by its player's id. */
  all(): ReadonlyMap<number, { itemId: number; pos: Vec3 }> {
    return this.angels;
  }

  clear(): void {
    this.angels.clear();
  }
}
