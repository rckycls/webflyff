// The ground mount's feel, round 2 (2026-11-18, world/mount/groundMount.ts `MOUNT_FEEL` and world/mount/mountRig.ts):
// the easing, the turn and its bank, the lean, getting on, the gallop, the wolf held in place, the saddle and the legs
// astride that never add up.

import { describe, expect, it } from 'vitest';
import { Group, Object3D, Quaternion, Vector3 } from 'three';
import {
  MOUNT_FEEL, MOUNT_FITS, angleDelta, bankFor, ease, easeAngle, gallop, gallopStrength, leanFor, riseCurve,
} from '../src/world/mount/groundMount';
import { findMountBones, holdWolf, saddleOf, seatRider, straddle, unstraddle } from '../src/world/mount/mountRig';
import { ObjSta, ObjStaF } from '../src/world/sim/constants';

describe('the easing', () => {
  it('gets about two thirds of the way in its time, and all of it with no time', () => {
    expect(ease(0, 10, 0.1, 0.1)).toBeCloseTo(10 * (1 - Math.exp(-1)), 6);
    expect(ease(0, 10, 0, 0.1)).toBe(0);
    expect(ease(0, 10, 0.1, 0)).toBe(10);
  });

  it('turns the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(-180);
    const eased = easeAngle(350, 10, 0.1, 0.1);
    expect(eased).toBeGreaterThan(350);
    expect(eased).toBeLessThan(370);
  });
});

describe('the turn, the lean and getting on', () => {
  it('banks into a turn, at most bankMax', () => {
    expect(bankFor(100)).toBeCloseTo(100 * MOUNT_FEEL.bankPerTurn, 6);
    expect(bankFor(-100)).toBeCloseTo(-100 * MOUNT_FEEL.bankPerTurn, 6);
    expect(bankFor(10_000)).toBe(MOUNT_FEEL.bankMax);
    expect(bankFor(-10_000)).toBe(-MOUNT_FEEL.bankMax);
  });

  it('leans forward running, less walking, back stepping back, upright still', () => {
    expect(leanFor(ObjSta.FMOVE, 0)).toBe(MOUNT_FEEL.leanRun);
    expect(leanFor(ObjSta.FMOVE, ObjStaF.WALK)).toBe(MOUNT_FEEL.leanWalk);
    expect(leanFor(ObjSta.BMOVE, 0)).toBe(MOUNT_FEEL.leanBack);
    expect(leanFor(ObjSta.STAND, 0)).toBe(0);
  });

  it('rises fast then settles, from 0 to 1', () => {
    expect(riseCurve(0)).toBe(0);
    expect(riseCurve(1)).toBe(1);
    expect(riseCurve(2)).toBe(1);
    expect(riseCurve(0.5)).toBeGreaterThan(0.8);
  });
});

describe('the gallop', () => {
  it('comes in with the run: none at a walk, all of it at a full run', () => {
    expect(gallopStrength(1)).toBe(0);
    expect(gallopStrength(MOUNT_FEEL.gallopFrom)).toBe(0);
    expect(gallopStrength(MOUNT_FEEL.gallopFull)).toBe(1);
    expect(gallopStrength(2.5)).toBe(1);
  });

  it('pitches nose down then up and lifts once a stride; nothing without strength', () => {
    expect(gallop(0, 1).pitch).toBeCloseTo(MOUNT_FEEL.gallopPitch, 6);
    expect(gallop(0.5, 1).pitch).toBeCloseTo(-MOUNT_FEEL.gallopPitch, 6);
    expect(gallop(0.25, 1).lift).toBeCloseTo(MOUNT_FEEL.gallopLift, 6);
    expect(gallop(0.75, 1).lift).toBe(0);
    expect(gallop(0.25, 0)).toEqual({ pitch: 0, lift: 0 });
  });
});

/** A wolf with the bones the saddle needs (its root at `rootZ`, its own units), at `scale`, in a holder. */
function wolfAt(rootZ: number, scale: number) {
  const holder = new Group();
  const wolf = new Group();
  wolf.scale.setScalar(scale);
  holder.add(wolf);
  const root = new Object3D();
  root.name = 'Bip01';
  root.position.set(0, 0.55, rootZ);
  wolf.add(root);
  const hips = new Object3D();
  hips.name = 'Bip01_Spine';
  root.add(hips);
  const back = new Object3D();
  back.name = 'Bip01_Spine1';
  back.position.set(0, 0, 0.2);
  hips.add(back);
  const shoulders = new Object3D();
  shoulders.name = 'Bip01_Neck';
  shoulders.position.set(0, 0.1, 0.5);
  back.add(shoulders);
  return { holder, wolf };
}

/** A rider with its two legs, a thigh and a calf each, the thighs pointing forward as the `-c` pose seats them. */
function riderWithLegs() {
  const rider = new Group();
  for (const side of ['L', 'R']) {
    const thigh = new Object3D();
    thigh.name = `Bip02_${side}_Thigh`;
    const calf = new Object3D();
    calf.name = `Bip02_${side}_Calf`;
    thigh.add(calf);
    rider.add(thigh);
  }
  return rider;
}

describe('the wolf held in place and the saddle', () => {
  it('draws the wolf back by as far as its walk carries its body forward of its stand', () => {
    const scale = MOUNT_FITS.male.wolfScale;
    const stand = wolfAt(-0.382, scale);
    const walk = wolfAt(0, scale);
    const rider = riderWithLegs();
    for (const { holder, wolf } of [stand, walk]) {
      holder.updateMatrixWorld(true);
      holdWolf(findMountBones(wolf, rider), scale, 0.26);
    }
    expect(stand.wolf.position.z).toBeCloseTo(-0.26, 6);
    expect(walk.wolf.position.z).toBeCloseTo(-0.382 * scale - 0.26, 6);
    // the saddle is in the same place for both
    const at = [stand, walk].map(({ holder, wolf }) => {
      const out = new Vector3();
      saddleOf(findMountBones(wolf, rider), holder, 0.3, out);
      return out;
    });
    expect(at[0]!.distanceTo(at[1]!)).toBeLessThan(1e-6);
  });

  it('measures the back from the hips to the shoulders, nose up positive', () => {
    const { holder, wolf } = wolfAt(0, 1);
    holder.updateMatrixWorld(true);
    const bones = findMountBones(wolf, riderWithLegs());
    const out = new Vector3();
    const pitch = saddleOf(bones, holder, 0, out)!;
    expect(pitch).toBeCloseTo(Math.atan2(0.1, 0.7), 6);
    expect(out.toArray().map((v) => +v.toFixed(6) + 0)).toEqual([0, 0.55, 0.2]);
  });

  it('is null for a wolf without those bones', () => {
    const holder = new Group();
    const wolf = new Group();
    holder.add(wolf);
    expect(saddleOf(findMountBones(wolf, riderWithLegs()), holder, 0.3, new Vector3())).toBeNull();
  });
});

describe('the rider', () => {
  it('leans about its hips: they stay where they are put', () => {
    const rider = new Group();
    seatRider(rider, new Vector3(0, 1, 0), 0.3, -0.1, 0.45);
    rider.updateMatrixWorld(true);
    const hips = new Vector3(0, 0.45, 0).applyMatrix4(rider.matrixWorld);
    expect(hips.toArray().map((v) => +v.toFixed(6) + 0)).toEqual([0, 1.45, 0]);
  });

  it('straddles: the thighs turned each frame from the motion\'s turn, never adding up, and given back getting off', () => {
    const holder = new Group();
    const { wolf } = wolfAt(0, 1);
    const rider = riderWithLegs();
    holder.add(wolf, rider);
    holder.updateMatrixWorld(true);
    const bones = findMountBones(wolf, rider);
    const thigh = rider.getObjectByName('Bip02_L_Thigh')!;
    const legs = MOUNT_FITS.male.legs;
    straddle(bones, legs);
    const once = thigh.quaternion.clone();
    expect(once.angleTo(new Quaternion())).toBeGreaterThan(0.5);
    // a frame where the motion did not write the bone: the same pose, not twice the turn
    straddle(bones, legs);
    expect(thigh.quaternion.angleTo(once)).toBeLessThan(1e-6);
    // a frame where the motion wrote it anew: turned from the new turn
    thigh.quaternion.identity();
    straddle(bones, legs);
    expect(thigh.quaternion.angleTo(once)).toBeLessThan(1e-6);
    unstraddle(bones);
    expect(thigh.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it('swings the two legs out to opposite sides', () => {
    const holder = new Group();
    const { wolf } = wolfAt(0, 1);
    const rider = riderWithLegs();
    holder.add(wolf, rider);
    holder.updateMatrixWorld(true);
    straddle(findMountBones(wolf, rider), MOUNT_FITS.male.legs);
    // the thighs point forward (+z) as the -c pose has them: after the turns, the left one's +z goes to +x
    const left = new Vector3(0, 0, 1).applyQuaternion(rider.getObjectByName('Bip02_L_Thigh')!.quaternion);
    const right = new Vector3(0, 0, 1).applyQuaternion(rider.getObjectByName('Bip02_R_Thigh')!.quaternion);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(0);
    expect(left.y).toBeLessThan(0); // lowered
  });
});
