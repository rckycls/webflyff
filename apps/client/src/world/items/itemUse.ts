import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';

export const RESURRECTION_SCROLL = 10431;
export interface ItemUseSender { sendUseItem(objectId: number): void; sendRevival(): void }

/** Requests only: server UPDATE_ITEM/SETPOINTPARAM/REVIVAL are the sole writers of the results. */
export class ItemUse {
  constructor(
    private readonly own: () => OwnState | undefined,
    private readonly props: ReadonlyMap<number, WebItemProp>,
    private readonly session: ItemUseSender,
  ) {}

  use(objectId: number): boolean {
    const own = this.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.props.get(item.itemId);
    if (!own || own.hp <= 0 || !item || item.count <= 0 || !prop || ![11, 12, 14].includes(prop.kind2)) return false;
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
