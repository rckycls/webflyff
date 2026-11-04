// Mounting and landing (Piece 7 M5, [R §1]): what refuses a ride's use, and its landing.
//
//   rideRefusal   CMover::IsUseItemReadyTime's ride part (Source/_Common/Mover.cpp:2767-2795), and the disguise
//                 (Neuz/DPClient.cpp:10324-10330), which SendDoUseItem tests in that order
//   landRefusal   CMover::IsUnEquipAble (Source/_Common/MoverEquip.cpp:1708-1728), silent

import type { WebItemProp } from '@flyffweb/formats';
import { HAttr } from '../sim/collision';
import { PARTS_RIDE } from '../sim/constants';
import type { Refusal } from './travelItems';

/** `IK1_RIDE` and `IK2_AIRFUEL` (`Resource/defineItemkind.h:13`, `:41`): a ride, and the Accelor Fuel. */
export const IK1_RIDE = 4;
export const IK2_AIRFUEL = 23;
/** `II_RID_RID_STI_MAGIC01` (`defineItem.h:4945`), which `__NOLIMIT_RIDE_ITEM` lets fly at any level. */
export const NOLIMIT_RIDE = 26514;
/** `GetFlightLv()` (`Mover.h:540`): 1 from level 20. */
const FLIGHT_LEVEL = 20;

/** A ride: worn in `PARTS_RIDE`, with its flight columns. */
export function isRide(prop: WebItemProp): boolean {
  return prop.part === PARTS_RIDE && prop.flight !== undefined;
}

/** What the use of a ride is checked against. */
export interface RideCheck {
  prop: WebItemProp;
  level: number;
  /** The world's `fly` (`m_bFly`). */
  worldFly: boolean;
  /** The `HATTR_*` of the land under the mover. */
  landAttr: number;
  /** A disguise buff (`HasBuffByIk3( IK3_TEXT_DISGUISE )`). */
  disguised: boolean;
  /** The ride is worn: its use lands, which none of these refuse. */
  worn: boolean;
}

/** The refusal said for a ride's use, or null to go on. */
export function rideRefusal(check: RideCheck): Refusal | null {
  if (check.worn) return null;
  const limit = check.prop.id === NOLIMIT_RIDE ? 0 : check.prop.flight?.limit ?? 1;
  const flightLevel = check.level >= FLIGHT_LEVEL ? 1 : 0;
  if (flightLevel < limit) return { kind: 'say', tid: 'TID_GAME_USEAIRCRAFT' };
  if (!check.worldFly || check.landAttr === HAttr.NOFLY) return { kind: 'say', tid: 'TID_ERROR_NOFLY' };
  if (check.disguised) return { kind: 'say', tid: 'TID_QUEST_DISQUISE_NOTFLY' };
  return null;
}

/** `IsUnEquipAble` for a ride: no landing while sitting, or over NOFLY, NOWALK or NOMOVE land. */
export function landRefusal(check: { sitting: boolean; landAttr: number }): boolean {
  const attr = check.landAttr;
  return check.sitting || attr === HAttr.NOFLY || attr === HAttr.NOWALK || attr === HAttr.NOMOVE;
}

/** The ride's `fFlightSpeed` as the server compares it: the float of its written text. */
export function flightSpeedOf(prop: WebItemProp): number {
  const text = prop.flight?.speedText;
  return text === undefined || text === '=' ? -1 : Math.fround(Number.parseFloat(text));
}
