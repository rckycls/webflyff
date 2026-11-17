// The ground mount prototype (2026-11-18, world/mount/groundMount.ts): who rides, the run with the mount, the rider's
// pose, the wolf's walk speed and the item the catalog lacks.

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import {
  GROUND_MOUNT_ITEM, GROUND_MOUNT_PROP, isGroundMounted, isMoving, mountedSpeed, riderMotion, withGroundMount, wolfTimeScale,
} from '../src/world/mount/groundMount';
import { MoverBuffs } from '../src/world/buffs';
import { ObjSta, ObjStaF } from '../src/world/sim/constants';

const f32 = Math.fround;

function rider(over: { buff?: boolean; hp?: number; state?: number; stateFlag?: number } = {}) {
  const buffs = new MoverBuffs();
  if (over.buff ?? true) buffs.add(0, GROUND_MOUNT_ITEM, 1, 999_999_999, 0);
  return { buffs, hp: over.hp ?? 100, act: { state: over.state ?? ObjSta.STAND, stateFlag: over.stateFlag ?? 0 } };
}

describe('who rides', () => {
  it('a living mover on the ground with the mount\'s item buff', () => {
    expect(isGroundMounted(rider())).toBe(true);
    expect(isGroundMounted(rider({ state: ObjSta.FMOVE }))).toBe(true);
    expect(isGroundMounted(rider({ state: ObjSta.STAND | ObjSta.DMG }))).toBe(true); // a hit does not throw off
  });

  it('not without the buff, dead, flying, swinging or casting, knocked down', () => {
    expect(isGroundMounted(rider({ buff: false }))).toBe(false);
    expect(isGroundMounted(rider({ hp: 0 }))).toBe(false);
    expect(isGroundMounted(rider({ stateFlag: ObjStaF.FLY }))).toBe(false);
    expect(isGroundMounted(rider({ state: ObjSta.STAND | ObjSta.ATK1 }))).toBe(false);
    expect(isGroundMounted(rider({ state: ObjSta.STAND | ObjSta.ATK_CASTING1 }))).toBe(false);
    expect(isGroundMounted(rider({ state: ObjSta.DMG_FLY }))).toBe(false);
    expect(isGroundMounted(rider({ state: ObjSta.DEAD }))).toBe(false);
  });
});

describe('the run with the mount', () => {
  it('is GetSpeed\'s DST_SPEED +50 in floats, the table\'s run without it', () => {
    expect(mountedSpeed(f32(0.1), true)).toBe(f32(f32(0.1) * f32(1.5)));
    expect(mountedSpeed(f32(0.1), false)).toBe(f32(0.1));
  });
});

describe('the rider\'s pose', () => {
  it('the -c ride pose: FSTAND1 91 still, FRUNNING1 98 moving either way, FDMG1 100 when hit', () => {
    expect(riderMotion(ObjSta.STAND)).toBe(91);
    expect(riderMotion(ObjSta.SIT)).toBe(91);
    expect(riderMotion(ObjSta.FMOVE)).toBe(98);
    expect(riderMotion(ObjSta.BMOVE)).toBe(98);
    expect(riderMotion(ObjSta.FMOVE | ObjSta.DMG)).toBe(100);
    expect(isMoving(ObjSta.FMOVE | ObjSta.LTURN)).toBe(true);
    expect(isMoving(ObjSta.STAND | ObjSta.LTURN)).toBe(false);
  });
});

describe('the wolf\'s walk', () => {
  it('plays faster with the run, slower walking or backing, within 0.6 to 2.5', () => {
    const run = f32(0.15);
    expect(wolfTimeScale(run, ObjSta.FMOVE, 0, 1.5)).toBeCloseTo(0.15 / (0.075 * 1.5), 5);
    expect(wolfTimeScale(run, ObjSta.FMOVE, ObjStaF.WALK, 1.5)).toBe(0.6);
    expect(wolfTimeScale(run, ObjSta.BMOVE, 0, 1.5)).toBe(0.6);
    expect(wolfTimeScale(1, ObjSta.FMOVE, 0, 1.5)).toBe(2.5);
  });
});

describe('the item', () => {
  it('is added to a catalog that lacks it, and a converted row wins', () => {
    const props = withGroundMount(new Map<number, WebItemProp>());
    expect(props.get(GROUND_MOUNT_ITEM)).toBe(GROUND_MOUNT_PROP);
    const converted = { ...GROUND_MOUNT_PROP, name: 'From the packs' };
    expect(withGroundMount(new Map([[GROUND_MOUNT_ITEM, converted]])).get(GROUND_MOUNT_ITEM)).toBe(converted);
  });

  it('is the server\'s row: IK2_BUFF, DST_SPEED +50, a 1 s cast, never running out, kept', () => {
    expect(GROUND_MOUNT_PROP).toMatchObject({
      kind1: 5, kind2: 29, kind3: 50, packMax: 1, destParams: [11, -1, -1], adjParams: [50, -1, -1], castMs: 1000,
      skillTime: 999_999_999, permanence: 1, icon: 'ui/item/itm_petlawolf1.png',
    });
  });
});
