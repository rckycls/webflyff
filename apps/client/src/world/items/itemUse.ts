import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { RETURN_SCROLL, usableFromBag, useRefusal } from './travelItems';
import type { Refusal, UseCheck } from './travelItems';

export const RESURRECTION_SCROLL = 10431;
export interface ItemUseSender { sendUseItem(objectId: number): void; sendRevival(): void }

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
      const refusal = useRefusal({ prop, ...travel.check() });
      if (refusal !== null) {
        travel.say(refusal);
        return false;
      }
      if (prop.id === RETURN_SCROLL && from !== 'again') {
        travel.returnScroll.begin(objectId);
        return true;
      }
    }
    this.session.sendUseItem(objectId);
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
