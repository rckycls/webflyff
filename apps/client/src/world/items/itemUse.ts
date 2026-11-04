import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { IK2_AIRFUEL, flightSpeedOf, isRide, landRefusal, rideRefusal } from './rideItems';
import { RETURN_SCROLL, usableFromBag, useRefusal } from './travelItems';
import type { Refusal, UseCheck } from './travelItems';
import { PARTS_RIDE } from '../sim/constants';
import { ItemCooldowns, bagConfirm, checkConfirm, confirmedTarget, isMapItem, premiumRefusal, useConfirm } from './premiumItems';

/** `NULL_ID`: no focused mover. */
const NULL_TARGET = 0xffffffff;
import { upgradeKindOf } from './upgradeItems';

export const RESURRECTION_SCROLL = 10431;
export interface ItemUseSender {
  /** DOUSEITEM; `targetId` the focused mover (2026-11-05), `NULL_ID` when not given. */
  sendUseItem(objectId: number, part?: number, flightSpeed?: number, targetId?: number): void;
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
  /**
   * 2026-11-05: opens Neuz's box (`CWndCommItemDlg`, `CWndRestateConfirm`) with the text of `tid`, OK and Cancel; OK runs
   * `ok`. `boxOpen` says whether one is open; `now` is the cool-downs' clock (ms).
   */
  confirm?(tid: string, ok: () => void, args?: string[]): void;
  boxOpen?(): boolean;
  now?(): number;
  /** 2026-11-05: opens the world map (a map item from the bag). */
  openMap?(): void;
  /** 2026-11-05: the upgrade cursor, which a material double-clicked in the bag starts (`UpgradeCursor.begin`). */
  upgrade?: { begin(objectId: number): boolean };
}

/**
 * Where a use comes from: the bag (the PC's double-click, the phone's Use), the task bar, RETURNSCORLL's answer, or a
 * box's OK (2026-11-05: `bResult` FALSE, no box again).
 */
export type UseFrom = 'bag' | 'bar' | 'again' | 'confirmed';

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
  use(objectId: number, from: UseFrom = 'bar', focus?: number): boolean {
    const own = this.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    // 2026-11-05: an upgrade material double-clicked in the bag starts the upgrade mode (WndField.cpp:2351-2398); from the
    // task bar Neuz sends DOUSEITEM, which the server does nothing with
    if (from === 'bag' && own && own.hp > 0 && item && prop && this.travel?.upgrade !== undefined && upgradeKindOf(prop) !== null) {
      return this.travel.upgrade.begin(objectId);
    }
    if (!own || own.hp <= 0 || !item || item.count <= 0 || !prop || !usableFromBag(prop)) return false;
    const travel = this.travel;
    let target: number | undefined;
    if (travel === undefined) {
      if (![11, 12, 14].includes(prop.kind2)) return false;
    } else {
      const check = travel.check();
      // 2026-11-05: the focused mover DOUSEITEM names, kept from the first press through a box (CWndCommItemDlg's)
      target = focus ?? check.focusId;
      if (from === 'bag') {
        // CWndInventory's own checks before SendDoUseItem (WndField.cpp:2102-2620): a box already open, the bag's own
        // boxes, then the trade
        if (travel.boxOpen?.() === true) {
          travel.say({ kind: 'say', tid: 'TID_TOOLTIP_ITEM_USING_ERROR' });
          return false;
        }
        const bag = bagConfirm(prop, {
          revival: check.revival ?? false, skillPointsSpent: check.skillPointsSpent ?? false, charged: item.charged === 1,
        });
        if (bag?.kind === 'say') {
          travel.say(bag);
          return false;
        }
        if (bag?.kind === 'box' && travel.confirm !== undefined) {
          travel.confirm(bag.tid, () => void this.use(objectId, 'confirmed', target));
          return true;
        }
        // 2026-11-05: a map opens the world map (OpenMap, WndField.cpp:2407-2415), and DOUSEITEM goes too
        if (isMapItem(prop)) travel.openMap?.();
      }
      // the bag's trade check, and the box's OK's (CWndCommItemDlg::OnChildNotify, WndField.cpp:12937-12943)
      if ((from === 'bag' || from === 'confirmed') && travel.shopOpen?.() === true) {
        travel.say({ kind: 'say', tid: 'TID_GAME_TRADELIMITUSING' });
        return false;
      }
      // 2026-11-05: CheckConfirm's box before SendDoUseItem, from the bag and the task bar (Awakening Protection)
      const checked = from === 'bag' || from === 'bar' ? checkConfirm(prop) : null;
      if (checked !== null && travel.confirm !== undefined) {
        travel.confirm(checked, () => void this.use(objectId, 'confirmed', target));
        return true;
      }
      // the object a box's OK names: a battery's id, the Funny Coin's NULL_ID, Awakening Protection's player
      if (from === 'confirmed') target = confirmedTarget(prop, target ?? NULL_TARGET, own.objectId);
      // 2026-11-05: SendDoUseItem's cool-down, the wings and the piercing protection
      const premium = premiumRefusal({
        prop, cooldowns: this.cooldowns, now: this.now(), disguised: check.disguised ?? false, wing: check.wing ?? null,
      });
      if (premium !== null) {
        travel.say(premium);
        return false;
      }
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
        if (target === undefined) this.session.sendUseItem(objectId, PARTS_RIDE, flightSpeedOf(prop));
        else this.session.sendUseItem(objectId, PARTS_RIDE, flightSpeedOf(prop), target);
        return true;
      }
      if (prop.id === RETURN_SCROLL && (from === 'bag' || from === 'bar')) {
        travel.returnScroll.begin(objectId);
        return true;
      }
      // 2026-11-05: SendDoUseItem's box (`bResult`): the protection and smelting scrolls; OK uses it with no box
      const box = from === 'bag' || from === 'bar' ? useConfirm(prop) : null;
      if (box !== null && travel.confirm !== undefined) {
        // the Funny Coin's names the item (`TID_GAME_FUNNYCOIN_ASKUSE`'s %s)
        travel.confirm(box, () => void this.use(objectId, 'confirmed', target), [prop.name]);
        return true;
      }
    }
    if (target === undefined) this.session.sendUseItem(objectId);
    else this.session.sendUseItem(objectId, -1, -1, target);
    return true;
  }

  /**
   * 2026-11-05: UPDATE_ITEM `UI_COOLTIME` for the own item at `objectId`, before the count changes: its cool-down group
   * starts (`CDPClient::OnUpdateItem`, DPClient.cpp:3226-3245).
   */
  cooled(objectId: number): void {
    const item = this.own()?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    if (prop) this.cooldowns.start(prop, this.now());
  }

  /** `CCooltimeMgr`: the groups' ends. */
  private readonly cooldowns = new ItemCooldowns();

  /** 2026-11-05: the share of the cool-down gone for the own item at `objectId` (its slot's sweep), or null. */
  cooldownDone(objectId: number): number | null {
    const item = this.own()?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    return prop ? this.cooldowns.progress(prop, this.now()) : null;
  }

  private now(): number {
    return this.travel?.now?.() ?? performance.now();
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
