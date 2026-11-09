// The particles of Neuz's `g_ParticleMng` that an S pet sprays (pets R1): point sprites made one at a time with a place
// and a speed, which move by that speed and fade a step at a time, drawn added onto the scene (`render/ParticleLayer.ts`).
// Only the kinds the pet sprays are here (13 to 23): the angel's (`CreateAngelParticle`, kinds 5 to 12) and the flying
// monsters' (`CreateFlyParticle`, 0 to 4) are not in the browser.
//
//   Function                         File:lines                            what
//   CParticleMng::CreateParticle     _Common/ParticleMng.cpp:520-595       a kind's size and picture, then one particle
//   CParticles::Create               ParticleMng.cpp:83-99                 512 at most of a kind, no gravity
//   CParticles::CreateParticle       ParticleMng.cpp:289-345               kinds from 13: white, fading to black
//   CParticles::Update               ParticleMng.cpp:207-247               each frame: fade less 0.015, place plus speed
//   CParticles::Render               ParticleMng.cpp:355-475               point sprites, ONE + ONE, no depth write
//   CParticleMng::Process            Neuz/Neuz.cpp:1100                    once a frame (here once a rules step)
//   CMover::CreatePetParticle        _Common/Mover.cpp:10802-10833         4 a call at the pet, each 0.03 lower

import type { Vec3 } from '@flyffweb/protocol';

const f32 = Math.fround;

/** A kind of `CParticleMng`: its point size (`m_fSize`, in D3D's point-scale units) and its picture's asset key. */
export interface ParticleKind {
  size: number;
  texture: string;
}

/**
 * `CParticleMng::CreateParticle`'s switch for the kinds an S pet sprays (`ParticleMng.cpp:557-575`): blue, red, white and
 * green, each in three sizes (green's third, 24, is never drawn: `13 + xRandom( 11 )` stops at 23). The pictures are
 * `MakePath( DIR_MODELTEX, ... )`, `Model/TextureMid` (`_Common/path.h:28`), which the textures stage converts.
 */
export const PET_PARTICLE_KINDS: ReadonlyMap<number, ParticleKind> = new Map([
  [13, { size: 0.15, texture: 'textures/etc_particle11.bmp.ktx2' }],
  [14, { size: 0.1, texture: 'textures/etc_particle11.bmp.ktx2' }],
  [15, { size: 0.07, texture: 'textures/etc_particle11.bmp.ktx2' }],
  [16, { size: 0.15, texture: 'textures/etc_particle12.bmp.ktx2' }],
  [17, { size: 0.1, texture: 'textures/etc_particle12.bmp.ktx2' }],
  [18, { size: 0.07, texture: 'textures/etc_particle12.bmp.ktx2' }],
  [19, { size: 0.15, texture: 'textures/etc_particle13.bmp.ktx2' }],
  [20, { size: 0.1, texture: 'textures/etc_particle13.bmp.ktx2' }],
  [21, { size: 0.07, texture: 'textures/etc_particle13.bmp.ktx2' }],
  [22, { size: 0.15, texture: 'textures/etc_particle14.bmp.ktx2' }],
  [23, { size: 0.1, texture: 'textures/etc_particle14.bmp.ktx2' }],
  [24, { size: 0.07, texture: 'textures/etc_particle14.bmp.ktx2' }],
].map(([kind, entry]) => [kind as number, { ...(entry as ParticleKind), size: f32((entry as ParticleKind).size) }]));

/** `Create( 512, 512, nType )` (`ParticleMng.cpp:529`): `m_dwParticlesLim`, the most of one kind alive at once. */
export const PARTICLES_PER_KIND = 512;
/** `m_fFade -= 0.015f` a frame (`ParticleMng.cpp:222`): a particle lasts 67 frames. */
const FADE_STEP = f32(0.015);

/** One `PARTICLE` (`ParticleMng.h:13-24`): D3D place and speed, and its fade from 1 to 0 (its colour's brightness). */
export interface Particle {
  pos: Vec3;
  vel: Vec3;
  fade: number;
  /** `m_fGroundY`: where a falling kind would stop; the pet's kinds do not fall. */
  groundY: number;
}

/** `xRandomF( n )` (`xUtil.cpp:54-57`, `rand() / RAND_MAX * n`) and `xRandom( n )` (`xRand() % n`, :39-42). */
export interface ParticleRandom {
  float(n: number): number;
  int(n: number): number;
}

/** MSVC's `RAND_MAX`. */
const RAND_MAX = 32767;

/** `Math.random` standing in for MSVC's `rand()` and Neuz's own `xRand()`. */
export const particleRandom: ParticleRandom = {
  float: (n) => f32(f32(Math.floor(Math.random() * (RAND_MAX + 1)) / RAND_MAX) * f32(n)),
  int: (n) => Math.floor(Math.random() * n),
};

/** `D3DXToRadian` with `D3DX_PI` 3.141592654f. */
const radians = (degrees: number): number => f32(degrees * f32(f32(3.141592654) / 180));

/**
 * The particles of every kind (`g_ParticleMng`), in D3D. `create` adds one, `step` moves them all one frame, and
 * `particles` gives a kind's live ones for drawing, newest first (`m_pParticles` is a list that takes new ones at its head).
 */
export class PetParticles {
  private readonly kinds = new Map<number, Particle[]>();

  /**
   * `CParticleMng::CreateParticle( nType, vPos, vVel, fGroundY )`: one particle of a known kind (any other is not in the
   * browser), not past 512 of its kind (`return E_FAIL`), at full brightness.
   */
  create(kind: number, pos: Vec3, vel: Vec3, groundY: number): void {
    if (!PET_PARTICLE_KINDS.has(kind)) return;
    let list = this.kinds.get(kind);
    if (list === undefined) this.kinds.set(kind, (list = []));
    if (list.length >= PARTICLES_PER_KIND) return;
    list.unshift({ pos: [f32(pos[0]), f32(pos[1]), f32(pos[2])], vel: [f32(vel[0]), f32(vel[1]), f32(vel[2])], fade: 1, groundY: f32(groundY) });
  }

  /**
   * `CParticleMng::Process`: `CParticles::Update` of each kind (`ParticleMng.cpp:207-247`): the fade less 0.015 and the
   * place moved by the speed (these kinds have no gravity, `m_bGravity` 0); one faded out (0, after a floor of 0) goes.
   */
  step(): void {
    for (const [kind, list] of this.kinds) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        p.fade = f32(p.fade - FADE_STEP);
        p.pos = [f32(p.pos[0] + p.vel[0]), f32(p.pos[1] + p.vel[1]), f32(p.pos[2] + p.vel[2])];
        if (p.fade < 0) p.fade = 0;
      }
      const live = list.filter((p) => p.fade > 0);
      if (live.length === 0) this.kinds.delete(kind);
      else this.kinds.set(kind, live);
    }
  }

  /** The live particles of `kind`. */
  particles(kind: number): readonly Particle[] {
    return this.kinds.get(kind) ?? [];
  }

  /** The kinds with live particles. */
  liveKinds(): number[] {
    return [...this.kinds.keys()];
  }

  /** How many particles are alive, of every kind. */
  count(): number {
    let n = 0;
    for (const list of this.kinds.values()) n += list.length;
    return n;
  }

  clear(): void {
    this.kinds.clear();
  }
}

/** What `CreatePetParticle` reads of the owner (`this`): its angles and its height. */
export interface SparkleOwner {
  angle: number;
  angleX: number;
  y: number;
}

/**
 * `CMover::CreatePetParticle( vPos )` of the owner (`Mover.cpp:10802-10833`), `at` being its pet's drawn place
 * (`GetScrPos()`): 4 particles, each 0.03 lower than the one before, flying out at up to 0.015 a frame along a random
 * turn of 360 degrees (from the owner's back, less 45) and a random pitch of -130 to 130 degrees about the owner's
 * (`xRandomF( -130 ) + xRandomF( 130 )`), of a random kind from 13 to 23, with the owner's height plus 0.5 as their ground.
 */
export function createPetParticle(
  particles: PetParticles, owner: SparkleOwner, at: Vec3, random: ParticleRandom = particleRandom,
): void {
  const pos: Vec3 = [f32(at[0]), f32(at[1]), f32(at[2])];
  for (let j = 0; j < 4; j++) {
    pos[1] = f32(pos[1] - f32(0.03));
    const angXZ = radians(f32(f32(f32(-45 + random.float(360)) + owner.angle) + 180));
    const angH = radians(f32(f32(owner.angleX + random.float(-130)) + random.float(130)));
    const speed = random.float(f32(0.015));
    const dist = f32(f32(Math.cos(-angH)) * speed);
    const vel: Vec3 = [f32(f32(Math.sin(angXZ)) * dist), f32(-f32(Math.sin(-angH)) * speed), f32(-f32(Math.cos(angXZ)) * dist)];
    particles.create(13 + random.int(11), pos, vel, f32(owner.y + 0.5));
  }
}
