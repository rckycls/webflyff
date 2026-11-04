// Mounting and landing (Piece 7 M5, [R §1]): IsUseItemReadyTime's ride part (Mover.cpp:2767-2795), the disguise
// (DPClient.cpp:10324-10330) and IsUnEquipAble (MoverEquip.cpp:1708-1728).

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { IK1_RIDE, IK2_AIRFUEL, NOLIMIT_RIDE, isRide, landRefusal, rideRefusal } from '../src/world/items/rideItems';
import { HAttr } from '../src/world/sim/collision';
import { itemProp } from './helpers/ownState';

const f32 = Math.fround;
const BROOM: WebItemProp = itemProp({
  id: 5000, part: 13, kind1: IK1_RIDE, kind2: 20,
  flight: { speed: f32(0.0023), speedText: '0.0023', turn: f32(0.6), pitch: 1, limit: 1, fuelMax: 1200, accelFuelMax: 12, motion: 31 },
});
const check = (over: Partial<Parameters<typeof rideRefusal>[0]> = {}) => ({
  prop: BROOM, level: 20, worldFly: true, landAttr: HAttr.NONE, disguised: false, worn: false, ...over,
});

describe('rideItems', () => {
  it('knows a ride and the fuel', () => {
    expect([IK1_RIDE, IK2_AIRFUEL, NOLIMIT_RIDE]).toEqual([4, 23, 26514]);
    expect(isRide(BROOM)).toBe(true);
    expect(isRide(itemProp({ id: 21, part: 10 }))).toBe(false);
  });

  it('level 19 is refused with the aircraft text, 20 is not', () => {
    expect(rideRefusal(check({ level: 19 }))).toEqual({ kind: 'say', tid: 'TID_GAME_USEAIRCRAFT' });
    expect(rideRefusal(check({ level: 20 }))).toBeNull();
  });

  it("the Beginner's broom has no limit", () => {
    const free = { ...BROOM, flight: { ...BROOM.flight!, limit: 0 } };
    expect(rideRefusal(check({ prop: free, level: 1 }))).toBeNull();
    // __NOLIMIT_RIDE_ITEM: II_RID_RID_STI_MAGIC01 flies at any level whatever its column says
    expect(rideRefusal(check({ prop: { ...BROOM, id: NOLIMIT_RIDE }, level: 1 }))).toBeNull();
  });

  it('no flight here: the world, or NOFLY land', () => {
    expect(rideRefusal(check({ worldFly: false }))).toEqual({ kind: 'say', tid: 'TID_ERROR_NOFLY' });
    expect(rideRefusal(check({ landAttr: HAttr.NOFLY }))).toEqual({ kind: 'say', tid: 'TID_ERROR_NOFLY' });
    expect(rideRefusal(check({ landAttr: HAttr.NOWALK }))).toBeNull();
  });

  it('a disguise refuses the ride; a worn ride (landing) skips the tests', () => {
    expect(rideRefusal(check({ disguised: true }))).toEqual({ kind: 'say', tid: 'TID_QUEST_DISQUISE_NOTFLY' });
    expect(rideRefusal(check({ worn: true, level: 1, worldFly: false }))).toBeNull();
  });

  it('landing is refused over NOWALK land (Review Focus 4)', () => {
    expect(landRefusal({ sitting: false, landAttr: HAttr.NOWALK })).toBe(true);
    expect(landRefusal({ sitting: false, landAttr: HAttr.NOFLY })).toBe(true);
    expect(landRefusal({ sitting: false, landAttr: HAttr.NOMOVE })).toBe(true);
    expect(landRefusal({ sitting: true, landAttr: HAttr.NONE })).toBe(true);
    expect(landRefusal({ sitting: false, landAttr: HAttr.NONE })).toBe(false);
  });
});
