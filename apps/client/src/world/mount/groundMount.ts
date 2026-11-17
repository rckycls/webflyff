// The ground mount (2026-11-18, a custom prototype the owner asked for: "like in MU, a fenrir", built from FlyFF's own
// creature and pose, docs/2026-11-18-ground-mount-checkpoint.md). The server's side is the outer repo's
// patches/2026-11-18-ground-mount.patch (CUser::DoUseGroundMount, WORLDSERVER/User.cpp):
//
//   - The item II_SYS_SYS_SCR_GROUNDMOUNT01 (20270, "Grey Wolf Mount") is never used up. A use mounts after the item's
//     1 s cast (its dwSkillReadyType, the cast gauge and STATEMODE a ride's take-off has), or gets off at once.
//   - Mounted is the item's own buff (BUFF_ITEM 20270, never running out). It carries DST_SPEED +50 (the own run comes
//     back as SETDESTPARAM; another player's run is made here, `mountedSpeed`) and reaches every player around
//     (SETSKILLSTATE, REMOVESKILLINFLUENCE, the ADD_OBJ buffs).
//   - Only where a ride may take off (the world's fly flag, not HATTR_NOFLY), 5 s after getting off; attacking or a skill
//     throws the rider off, being hit does not; death, a shop, a ride and a teleport to a world that does not fly too.
//
// Drawn: FlyFF's Lawolf (mvr_lawolf: stand, idle1, walk) under the rider, scaled up, and the rider in V15's sitting-astride
// ride pose, the `-c` set the Wooden Rocking Horse and the hoverbikes use (MTI_FSTAND1 91, MTI_FRUNNING1 98, MTI_FDMG1
// 100), raised onto the wolf's back. Nothing is taken from another game.

import type { WebItemProp } from '@flyffweb/formats';
import { buffedSpeed } from '../sim/moverRules';
import { Mta, ObjSta, ObjStaF } from '../sim/constants';

/** `II_SYS_SYS_SCR_GROUNDMOUNT01` (outer repo `Resource/defineItem.h`, after `II_PET_LAWOLF1`). */
export const GROUND_MOUNT_ITEM = 20270;
/** Its `nAdjParamVal1` on `DST_SPEED`: the run with the mount, in percent. */
export const GROUND_MOUNT_SPEED = 50;
/** `BUFF_ITEM`: the buff type of an item's buff. */
const BUFF_ITEM = 0;
/** `MTI_FSTAND1` of the `-c` ride pose set (the Wooden Rocking Horse's `dwUseMotion` 91). */
const RIDE_POSE = 91;

/**
 * The item as the catalog would have it. The converter builds `itemProps.json` from the client's packs, which never had
 * this custom item, so the game data adds it when it is missing (`withGroundMount`). Kept in step with the server's row
 * (`Resource/propItem.txt`): IK1_SYSTEM 5, IK2_BUFF 29, IK3_SCROLL 50, DST_SPEED 11 +50, a 1 s cast with
 * XI_FLIGHT_READY 117, dwSkillTime 999999999, not used up, the Baby Lawolf's icon.
 */
export const GROUND_MOUNT_PROP: WebItemProp = {
  id: GROUND_MOUNT_ITEM,
  name: 'Grey Wolf Mount',
  description: 'Use it to ride a grey wolf on the ground, 50% faster than on foot. Use it again to get off. Attacking or '
    + 'using a skill throws you off. Only where flying is allowed.',
  cost: 0,
  packMax: 1,
  kind1: 5,
  kind2: 29,
  kind3: 50,
  handed: -1,
  part: -1,
  abilityMin: -1,
  abilityMax: -1,
  weaponType: -1,
  attackSpeed: -1,
  attackRange: -1,
  destParams: [11, -1, -1],
  adjParams: [GROUND_MOUNT_SPEED, -1, -1],
  sfxHit: -1,
  sfxMissile: -1,
  linkKindBullet: -1,
  castMs: 1000,
  sfxReady: 117,
  model: 'models/item_genmatsuitbox.glb',
  dropModel: 'models/item_genmatsuitbox.glb',
  icon: 'ui/item/itm_petlawolf1.png',
  itemLevel: 1,
  skillTime: 999999999,
  permanence: 1,
};

/** The catalog with the mount's item, added when the converted catalog lacks it. */
export function withGroundMount(props: Map<number, WebItemProp>): Map<number, WebItemProp> {
  if (!props.has(GROUND_MOUNT_ITEM)) props.set(GROUND_MOUNT_ITEM, GROUND_MOUNT_PROP);
  return props;
}

/** What `isGroundMounted` reads of a mover. */
export interface MountedMover {
  buffs: { has(buffType: number, id: number): boolean };
  hp: number;
  act: { stateFlag: number; state: number };
}

/**
 * The mover rides the ground mount: it has the mount's buff, is alive and on the ground. A swing or a cast of its own
 * shows it off at once, before the server's REMOVESKILLINFLUENCE comes back (the server throws it off for those).
 */
export function isGroundMounted(mover: MountedMover): boolean {
  if (!mover.buffs.has(BUFF_ITEM, GROUND_MOUNT_ITEM) || mover.hp <= 0) return false;
  const { stateFlag, state } = mover.act;
  if (stateFlag & ObjStaF.FLY) return false;
  if (state & ObjSta.ATK_ALL) return false;
  if ((state & ObjSta.DMG_ALL & ~ObjSta.DMG) !== 0) return false; // knocked down, dead
  return true;
}

/** Another player's run: the table's, with the mount's DST_SPEED while mounted (`CMover::GetSpeed`). */
export function mountedSpeed(baseSpeed: number, mounted: boolean): number {
  return mounted ? buffedSpeed(baseSpeed, GROUND_MOUNT_SPEED) : baseSpeed;
}

/** The mover's feet go forward or back (`OBJSTA_FMOVE`, `OBJSTA_BMOVE`). */
export function isMoving(state: number): boolean {
  const move = state & ObjSta.MOVE_ALL;
  return move === ObjSta.FMOVE || move === ObjSta.BMOVE;
}

/**
 * The rider's motion: the `-c` ride pose's stand, its run while the feet move, its flinch while hit. Only what is drawn
 * changes: the rules keep their own motion and frames.
 */
export function riderMotion(state: number): number {
  if (state & ObjSta.DMG) return RIDE_POSE + Mta.FDMG1;
  return isMoving(state) ? RIDE_POSE + Mta.FRUNNING1 : RIDE_POSE + Mta.FSTAND1;
}

/** The wolf's motions (`mvr_lawolf_*`). */
export type WolfMotion = 'stand' | 'idle' | 'walk';

/** After this long standing still, the wolf plays its idle once (then stands again). */
export const WOLF_IDLE_AFTER_SECONDS = 8;

/**
 * The fit (tuned from close-ups of both bodies from the side and from behind, standing and running): the wolf's scale,
 * how far the rider is raised and how far forward it sits (back toward the tail when negative), in the mover's own units
 * (scale 1). The `-c` pose sits a rider on a seat about knee-high; the wolf's back, at 1.5 times its size, is higher,
 * so the rider is raised to sit just behind its shoulders, the hands on its mane and the legs down its flanks.
 */
export interface MountFit {
  wolfScale: number;
  seat: number;
  forward: number;
}

export const MOUNT_FITS: Readonly<Record<'male' | 'female', MountFit>> = {
  male: { wolfScale: 1.5, seat: 0.9, forward: -0.12 },
  female: { wolfScale: 1.5, seat: 0.9, forward: -0.12 },
};

/** The Lawolf's own walk: `MI_LAWOLF1`'s table speed (0.075 a step) at scale 1, which its walk motion's stride matches. */
const WOLF_WALK_SPEED = 0.075;

/**
 * How fast the wolf's walk plays for a run of `speed` a step (the mover's run; the slow walk is a quarter of it and a
 * step back a fifth, `moveSpeed`): the stride grows with the scale, so the feet keep to the ground. Between 0.6 and 2.5.
 */
export function wolfTimeScale(speed: number, state: number, stateFlag: number, wolfScale: number): number {
  const back = (state & ObjSta.MOVE_ALL) === ObjSta.BMOVE;
  const step = back ? speed / 5 : stateFlag & ObjStaF.WALK ? speed / 4 : speed;
  const scale = step / (WOLF_WALK_SPEED * wolfScale);
  return Math.min(2.5, Math.max(0.6, scale));
}
