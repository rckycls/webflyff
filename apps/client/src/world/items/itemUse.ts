import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { IK2_AIRFUEL, flightSpeedOf, isRide, landRefusal, rideRefusal } from './rideItems';
import { RETURN_SCROLL, usableFromBag, useRefusal } from './travelItems';
import type { Refusal, UseCheck } from './travelItems';
import { PARTS_RIDE } from '../sim/constants';

export const RESURRECTION_SCROLL = 10431;
export interface ItemUseSender {
  sendUseItem(objectId: number, part?: number, flightSpeed?: number): void;
  sendRevival(): void;
  /** Piece 7 M5: DOEQUIP, which the worn ride's equipment cell lands with. */
  sendEquipItem?(objectId: number, part: number, flightSpeed: number): void;
}

/**
 * Piece 7 M3: what the travel items need from the world (`SendDoUseItem`, `Neuz/DPClient.cpp:10254-10431`): the use's
 * state for Neuz's refusals, a refusal said or shown, the Scroll of Return's box, and whether the shop window is open
 * (a use from the bag is then refused, `CWndInventory::OnChildNotify`, `WndField.cpp:2541-2547`).
 */
export interface ItemUseTravel {
  check(): Omit<UseCheck, 'prop'>;
  say(refusal: Refusal): void;
  returnScroll: { begin(objectId: number): void };
  shopOpen?(): boolean;
}

/** Where a use comes from: the bag (the PC's double-click, the phone's Use), the task bar, or RETURNSCORLL's answer. */
export type UseFrom = 'bag' | 'bar' | 'again';

/** Requests only: server UPDATE_ITEM/SETPOINTPARAM/REVIVAL are the sole writers of the results. */
export class ItemUse {
  constructor(
    private readonly own: () => OwnState | undefined,
    private readonly props: ReadonlyMap<number, WebItemProp>,
    private readonly session: ItemUseSender,
    private readonly travel?: ItemUseTravel,
  ) {}

  /**
   * Uses the item at `objectId`: the consumables, and with `travel` the Blinkwings and the Scroll of Return (Piece 7 M3),
   * through Neuz's refusals in its order; the Scroll first opens its box, and only its `'again'` sends it.
   */
  use(objectId: number, from: UseFrom = 'bar'): boolean {
    const own = this.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    if (!own || own.hp <= 0 || !item || item.count <= 0 || !prop || !usableFromBag(prop)) return false;
    const travel = this.travel;
    if (travel === undefined) {
      if (![11, 12, 14].includes(prop.kind2)) return false;
    } else {
      if (from === 'bag' && travel.shopOpen?.() === true) {
        travel.say({ kind: 'say', tid: 'TID_GAME_TRADELIMITUSING' });
        return false;
      }
      const check = travel.check();
      // Piece 7 M5: the Accelor Fuel is for a flier only (silently)
      if (prop.kind2 === IK2_AIRFUEL && !check.flying) return false;
      const worn = isRide(prop) && own.equipmentObjectIds.includes(objectId);
      if (isRide(prop)) {
        if (worn && landRefusal({ sitting: check.sitting ?? false, landAttr: check.landAttr ?? 0 })) return false;
        const rideRefused = rideRefusal({
          prop, level: check.level ?? own.level, worldFly: check.worldFly ?? true, landAttr: check.landAttr ?? 0,
          disguised: check.disguised ?? false, worn,
        });
        if (rideRefused !== null) {
          travel.say(rideRefused);
          return false;
        }
      }
      // IsUseItemReadyTime is TRUE at once for an equipped item (Mover.cpp:2770-2773): a worn ride's cast is not tested
      const refusal = worn ? null : useRefusal({ prop, ...check });
      if (refusal !== null) {
        travel.say(refusal);
        return false;
      }
      // Piece 7 M5: a ride's DOUSEITEM carries PARTS_RIDE and its exact fFlightSpeed, worn or not
      if (isRide(prop)) {
        this.session.sendUseItem(objectId, PARTS_RIDE, flightSpeedOf(prop));
        return true;
      }
      if (prop.id === RETURN_SCROLL && from !== 'again') {
        travel.returnScroll.begin(objectId);
        return true;
      }
    }
    this.session.sendUseItem(objectId);
    return true;
  }

  /**
   * Piece 7 M5: the worn ride's equipment cell, double-clicked: DOEQUIP with its part and float (`SendDoEquip`), unless
   * the land refuses the landing (`IsUnEquipAble`, silently).
   */
  land(objectId: number): boolean {
    const own = this.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    if (!own || own.hp <= 0 || !item || !prop || !isRide(prop) || !own.equipmentObjectIds.includes(objectId)) return false;
    const check = this.travel?.check();
    if (landRefusal({ sitting: check?.sitting ?? false, landAttr: check?.landAttr ?? 0 })) return false;
    if (this.session.sendEquipItem === undefined) return false;
    this.session.sendEquipItem(objectId, PARTS_RIDE, flightSpeedOf(prop));
    return true;
  }

  get canRevive(): boolean {
    const own = this.own();
    return own !== undefined && own.hp <= 0 && [...(own.inventory?.values() ?? [])]
      .some((item) => item.itemId === RESURRECTION_SCROLL && item.count > 0);
  }

  revive(): boolean {
    if (!this.canRevive) return false;
    this.session.sendRevival();
    return true;
  }
}
