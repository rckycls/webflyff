// 2026-11-18 (ground mount feel, the owner: "position and movements of the character while on mount is very stiff and
// awkward"): what makes the rider sit on the wolf rather than float over it, all drawn only (the rules never see it):
//
//   - the wolf stays put (`holdWolf`): its walk carries its body 0.38 of its length forward of its stand, so at each
//     start it slid forward from under its rider (who ran sitting on its hips) and at each stop it slid back;
//   - the saddle follows the wolf's back: a point between its back bone (`Bip01 Spine1`) and its shoulders
//     (`Bip01 Neck`), so the rider rises and dips with the wolf's steps, and tips with the line from its hips
//     (`Bip01 Spine`) to its shoulders;
//   - the rider's legs straddle it: V15 has no pose for sitting astride an animal (its ride poses hold the knees
//     together over a broom's stick or a hoverbike's seat), so after the motion's own frame each frame the thighs of
//     the `-c` pose are lowered and swung out around the wolf's flanks and the shins turned back under;
//   - the rider leans and banks about its hips, not its feet (`seatRider`).
//
// The bones are found by their names in the converted glb (three's loader writes a space as `_`).

import type { Object3D } from 'three';
import { Euler, Quaternion, Vector3 } from 'three';
import type { MountFit } from './groundMount';

/** The wolf's bones: its root, its hips, its back and its shoulders. */
const WOLF_ROOT = 'Bip01';
const WOLF_HIPS = 'Bip01_Spine';
const WOLF_BACK = 'Bip01_Spine1';
const WOLF_SHOULDERS = 'Bip01_Neck';
/** Where the wolf's stand (and its idle) has its root bone, front to back, in the wolf's own units; its walk has 0. */
const WOLF_ROOT_STAND_Z = -0.382;
/** The rider's leg bones (both bodies' skeletons, `Bip02`). */
const LEGS = [
  { thigh: 'Bip02_L_Thigh', calf: 'Bip02_L_Calf', side: 1 },
  { thigh: 'Bip02_R_Thigh', calf: 'Bip02_R_Calf', side: -1 },
] as const;

const RIGHT = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const DEG = Math.PI / 180;

const q1 = new Quaternion();
const q2 = new Quaternion();
const q3 = new Quaternion();
const v1 = new Vector3();
const v2 = new Vector3();

/**
 * A leg bone the rider's pose turns, with its turn as the motion left it (`animated`) and as posed (`posed`): a bone
 * the motion did not write again still holds `posed`, and is put back to `animated` before it is turned again, so
 * the turns never add up.
 */
interface PosedBone {
  bone: Object3D;
  animated: Quaternion;
  posed: Quaternion;
}

/** The bones a mounted view moves each frame, found once for a wolf and a rider. */
export interface MountBones {
  wolf: Object3D;
  rider: Object3D;
  root: Object3D | null;
  hips: Object3D | null;
  back: Object3D | null;
  shoulders: Object3D | null;
  legs: { thigh: PosedBone; calf: PosedBone | null; side: number }[];
}

const posedBone = (bone: Object3D): PosedBone => ({ bone, animated: bone.quaternion.clone(), posed: new Quaternion(NaN, NaN, NaN, NaN) });

export function findMountBones(wolf: Object3D, rider: Object3D): MountBones {
  const legs: MountBones['legs'] = [];
  for (const leg of LEGS) {
    const thigh = rider.getObjectByName(leg.thigh);
    const calf = rider.getObjectByName(leg.calf);
    if (thigh) legs.push({ thigh: posedBone(thigh), calf: calf ? posedBone(calf) : null, side: leg.side });
  }
  const bone = (name: string): Object3D | null => wolf.getObjectByName(name) ?? null;
  return {
    wolf, rider, root: bone(WOLF_ROOT), hips: bone(WOLF_HIPS), back: bone(WOLF_BACK), shoulders: bone(WOLF_SHOULDERS), legs,
  };
}

/**
 * The wolf held where its stand has it, front to back: its walk's root bone is `WOLF_ROOT_STAND_Z` further forward,
 * so the wolf is drawn back by as much (at its `scale`), and `back` further still (the holder's units). It is lifted by
 * `lift` and pitched by `pitch` (radians, nose down positive), the gallop. After the wolf's frame, with the holder's
 * world matrices current; the wolf's are made current.
 */
export function holdWolf(bones: MountBones, scale: number, back: number, lift = 0, pitch = 0): void {
  const wolf = bones.wolf;
  const ahead = bones.root === null ? 0 : wolf.worldToLocal(bones.root.getWorldPosition(v1)).z - WOLF_ROOT_STAND_Z;
  wolf.position.set(0, lift, -ahead * scale - back);
  wolf.rotation.set(pitch, 0, 0);
  wolf.updateMatrixWorld(true);
}

/**
 * The saddle in `space`'s coordinates (the mover's holder), written to `out`, and the pitch of the wolf's back (from its
 * hips to its shoulders), radians, nose up positive; null when the wolf has no such bones. The world matrices must be
 * current.
 */
export function saddleOf(bones: MountBones, space: Object3D, along: number, out: Vector3): number | null {
  if (bones.back === null || bones.shoulders === null) return null;
  const shoulders = space.worldToLocal(bones.shoulders.getWorldPosition(v2));
  out.copy(space.worldToLocal(bones.back.getWorldPosition(v1))).lerp(shoulders, along);
  const hips = bones.hips === null ? out : space.worldToLocal(bones.hips.getWorldPosition(v1));
  return Math.atan2(shoulders.y - hips.y, shoulders.z - hips.z);
}

/**
 * Turns `bone` by `angle` radians about `axis`, a direction in `frame`'s own coordinates, around the bone's origin (its
 * children follow).
 */
function turnBone(bone: Object3D, frame: Object3D, axis: Vector3, angle: number): void {
  if (angle === 0 || bone.parent === null) return;
  const inFrame = frame.getWorldQuaternion(q1);
  const parent = bone.parent.getWorldQuaternion(q2).invert();
  const local = v1.copy(axis).applyQuaternion(inFrame).applyQuaternion(parent).normalize();
  bone.quaternion.premultiply(q3.setFromAxisAngle(local, angle));
  bone.updateMatrixWorld(true);
}

/** The bone back to its motion's turn when the motion left it as posed, then that turn kept. */
function fromMotion(posed: PosedBone): void {
  if (posed.bone.quaternion.equals(posed.posed)) posed.bone.quaternion.copy(posed.animated);
  else posed.animated.copy(posed.bone.quaternion);
}

/**
 * The legs astride (`MountFit.legs`, degrees), posed after the motion's frame:
 *
 *   - each thigh lowered about the rider's side-to-side axis, its knee turned out about its up axis, and the leg swung
 *     out about its forward axis;
 *   - each shin turned back about the side-to-side axis.
 */
export function straddle(bones: MountBones, legs: MountFit['legs']): void {
  const rider = bones.rider;
  for (const leg of bones.legs) {
    fromMotion(leg.thigh);
    if (leg.calf !== null) fromMotion(leg.calf);
    turnBone(leg.thigh.bone, rider, RIGHT, legs.drop * DEG);
    turnBone(leg.thigh.bone, rider, UP, leg.side * legs.spread * DEG);
    turnBone(leg.thigh.bone, rider, FORWARD, leg.side * legs.splay * DEG);
    leg.thigh.posed.copy(leg.thigh.bone.quaternion);
    if (leg.calf !== null) {
      turnBone(leg.calf.bone, rider, RIGHT, -legs.knee * DEG);
      leg.calf.posed.copy(leg.calf.bone.quaternion);
    }
  }
}

/** The legs as the motion left them (getting off). */
export function unstraddle(bones: MountBones): void {
  for (const leg of bones.legs) {
    for (const posed of [leg.thigh, leg.calf]) {
      if (posed !== null && posed.bone.quaternion.equals(posed.posed)) posed.bone.quaternion.copy(posed.animated);
    }
  }
}

const tilt = new Euler(0, 0, 0, 'YXZ');
const tilted = new Quaternion();
const hips = new Vector3();

/**
 * The rider placed at `at` (the holder's coordinates) and tilted by `pitch` (forward positive) and `roll` (radians)
 * about its hips, `hip` above its root.
 */
export function seatRider(rider: Object3D, at: Vector3, pitch: number, roll: number, hip: number): void {
  tilted.setFromEuler(tilt.set(pitch, 0, roll));
  hips.set(0, hip, 0);
  const turned = v2.copy(hips).applyQuaternion(tilted);
  rider.position.copy(at).add(hips).sub(turned);
  rider.quaternion.copy(tilted);
}
