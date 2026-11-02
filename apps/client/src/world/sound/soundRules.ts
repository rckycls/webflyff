// Where and how loud an effect plays, copying CSoundManager::Play (Source/_DirectX/dsutil.cpp:250-322) and the volume
// steps of CWndOptionGame (WndOptionGame.cpp:249-263), and when a motion's sound fires (CModelObject::IsAttrSound,
// Bone.h:170-177). docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md §7, §8.
//
// Neuz places a sound once, when it starts: its offset from the own player, turned by the listener's angle and cut to
// whole metres, against a DirectSound listener that never moves. Nothing plays beyond 100 m across the ground; DirectSound
// then keeps full volume to 4 m, falls as 4/d, and mutes beyond 70 m. The listener's angle is the camera's heading, as
// Neuz's default camera lock gives it (HwOption.cpp:245); its sign is the one that puts a sound on the camera's right in
// the right ear, which DirectSound's left-handed space here cannot be checked against by ear (the plan's ruling 3).

import { cameraYaw } from '../worldMapRules';

const f32 = Math.fround;

export interface Vec { x: number; y: number; z: number }

/** `if( fRadian > 100.0f ) return false;` (dsutil.cpp:267). */
export const HEARING = 100;
/** `flMinDistance = 4.0f` (dsutil.cpp:312): full volume this near. */
export const MIN_DISTANCE = 4;
/** `flMaxDistance = 70.0f` with DSBCAPS_MUTE3DATMAXDISTANCE (dsutil.cpp:313, :383): silent beyond. */
export const MAX_DISTANCE = 70;
/** `Create( ..., 10 )` (dsutil.cpp:383): the buffers of one file. */
export const MAX_COPIES = 10;

/** The C cast to int: toward zero, and never -0. */
const cut = (v: number): number => Math.trunc(v) + 0;

/**
 * The sound's place for the listener (dsutil.cpp:262-288): null when it is more than 100 m away across the ground.
 * `angleDeg` is `m_fTheta`'s degrees (`listenerAngle`).
 */
export function placeSound(sound: Vec, listener: Vec, angleDeg: number): Vec | null {
  const dx = f32(sound.x - listener.x);
  const dy = f32(sound.y - listener.y);
  const dz = f32(sound.z - listener.z);
  const r = f32(Math.sqrt(f32(f32(Math.abs(dx) * Math.abs(dx)) + f32(Math.abs(dz) * Math.abs(dz)))));
  if (r > HEARING) return null;
  // Line1 = (0, 0, -1), Line2 = -vPos, divided by its length across the ground when that is above 1
  const lineZ = r > 1 ? f32(-dz / r) : -dz;
  const dot = -lineZ;
  // acos of a value that rounding pushed past 1 would be NaN: kept to -1..1
  let a = f32(Math.acos(Math.max(-1, Math.min(1, dot))));
  if (dx < 0) a = f32(Math.PI * 2 - a);
  a = f32(a - f32(angleDeg * (Math.PI / 180)));
  return { x: cut(f32(Math.sin(a)) * r), y: cut(dy), z: cut(f32(Math.cos(a)) * r) };
}

/** Whether a placed sound is within DirectSound's 70 m (3D, height included). */
export function audible(local: Vec): boolean {
  return Math.hypot(local.x, local.y, local.z) <= MAX_DISTANCE;
}

/**
 * The place Web Audio's listener (at the origin, facing -z, up +y, so right is +x) is given for a placed sound: Neuz's
 * local x is the listener's right and its z the front.
 */
export function pannerPosition(local: Vec): Vec {
  return { x: local.x, y: local.y, z: -local.z };
}

/** The listener's angle in degrees: the heading from the camera to the player it follows (FlyFF positions). */
export function listenerAngle(camera: Vec, target: Vec): number {
  return (cameraYaw([camera.x, camera.y, camera.z], [target.x, target.y, target.z]) * 180) / Math.PI;
}

/** `step * 0.1f`, the volume a slider step gives (WndOptionGame.cpp:249, :262). */
const volumeOf = (step: number): number => f32(step * f32(0.1));

/**
 * The effects' gain for a slider step (0-10): `m_nSoundVolume = (int)( -(1.0f - v) * 5000 )` hundredths of a dB
 * (WndOptionGame.cpp:250), as amplitude; at step 0 (-5000) nothing plays (dsutil.cpp:253), so 0.
 */
export function effectsGain(step: number): number {
  if (step <= 0) return 0;
  const hundredths = Math.trunc(f32(-f32(1 - volumeOf(step)) * 5000));
  return 10 ** (hundredths / 2000);
}

/** The music's gain for a slider step (0-10): the Miles master level `SetVolume( step * 0.1f )`, linear. */
export function musicGain(step: number): number {
  return step <= 0 ? 0 : volumeOf(step);
}

/** The buffers of each file (CSound::GetFreeBufferIndex, dsutil.cpp:1290-1311): an 11th play while 10 play is lost. */
export class SoundCopies {
  private readonly playing = new Map<string, number>();

  take(key: string): boolean {
    const count = this.playing.get(key) ?? 0;
    if (count >= MAX_COPIES) return false;
    this.playing.set(key, count + 1);
    return true;
  }

  release(key: string): void {
    const count = this.playing.get(key) ?? 0;
    if (count <= 1) this.playing.delete(key);
    else this.playing.set(key, count - 1);
  }
}

/**
 * The sound of a frame move from `old` to `current` (`IsAttrSound`, the test of `hitIndex` in MoverViews): the event of
 * the frame `(int)current` with `old < frame <= current`, its id when above 0 (ModelObject.cpp:1594-1596), else 0. A
 * frame one move jumps right over makes no sound, as in Neuz (the skip loop of :1603-1610 checks only quakes).
 */
export function soundAt(sound: ReadonlyArray<readonly [number, number]>, old: number, current: number): number {
  const o = f32(old);
  const c = f32(current);
  const at = Math.trunc(c);
  const hit = sound.find(([frame]) => {
    const f = f32(frame);
    return Math.trunc(f) === at && o < f && f <= c;
  });
  return hit !== undefined && hit[1] > 0 ? hit[1] : 0;
}

/**
 * The equip sound of an item (CMover::DoEquip, MoverEquip.cpp:1013-1041), 0 for none: a weapon (IK1_WEAPON), jewelry
 * (IK1_GENERAL + IK2_JEWELRY), cloth (IK1_ARMOR + IK2_CLOTH), armour (IK1_ARMOR + IK2_ARMOR, or any IK2_ARMORETC); any
 * unequip is SND_INF_INVENTORYDROP.
 */
export function equipSound(kind1: number, kind2: number, equip: boolean): number {
  if (!equip) return 5;
  if (kind1 === 1) return 8;
  if (kind1 === 3 && kind2 === 13) return 11;
  if (kind1 === 2 && kind2 === 9) return 10;
  if ((kind1 === 2 && kind2 === 7) || kind2 === 8) return 9;
  return 0;
}
