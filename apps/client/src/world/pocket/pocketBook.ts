// The own three pockets of the extra bag (2026-11-17, docs/2026-11-17-extra-bag-research.md §1, §2, §5), kept from the own
// ADD_OBJ and changed by the pockets' snapshots as Neuz's handlers change them:
//
//   CPocketController::m_apPocket[3]   _Common/pocket.h:94           null for a pocket that is not there
//   CPocketController::Avail           _Common/pocket.cpp:73-93      an expired pocket gets now + t, a running one + t, a new
//                                                                    one is made empty; t 0 never expires (pocket 0)
//   CPocketController::SetAttribute    pocket.cpp:278-300            expired: m_bExpired = data; avail: Avail( data )
//   CPocketController::Add             pocket.cpp:133-155            only to a pocket in use; CItemContainer::Add
//   CPocketController::RemoveAtId      pocket.cpp:157-178            only in a pocket in use: the count down, or the item gone
//   CPocketController::IsAvailable     pocket.h:64-65                there, and (with the expiry check) not expired
//   CDPClient::OnPocketAttribute ...   Neuz/DPClient.cpp:17313-17346

import type { InventoryItem, OwnPocket } from '@flyffweb/protocol';
import { POCKET_COUNT, POCKET_SLOTS, PocketAttribute } from '@flyffweb/protocol';
import { containerAdd, freshContainer } from '../trade/itemContainer';
import type { ItemContainer, PackMax } from '../trade/itemContainer';

const NULL_ID = 0xffffffff;

interface Pocket {
  container: ItemContainer;
  expired: boolean;
  /** `m_tExpirationDate` on the own clock (`time_null()` seconds), 0 for none (pocket 0). */
  expiresAt: number;
}

export class PocketBook {
  private readonly pockets: Array<Pocket | null>;
  /** Bumped on every change, for the window to redraw. */
  revision = 0;

  /** `pockets` from the own ADD_OBJ; `now` is the own clock (`time_null()`), to which a pocket's seconds left are added. */
  constructor(pockets: readonly OwnPocket[] | undefined, now: number) {
    this.pockets = Array.from({ length: POCKET_COUNT }, (_, i) => {
      const read = pockets?.find((p) => p.pocket === i);
      if (read === undefined) return null;
      const size = POCKET_SLOTS[i]!;
      const container = freshContainer(size);
      if (read.slots.length === size) container.slots = [...read.slots];
      for (const item of read.items) container.items.set(item.objectId, { ...item });
      return { container, expired: read.expired, expiresAt: read.secondsLeft === null ? 0 : now + read.secondsLeft };
    });
  }

  /** `IsAvailable( pocket )`: there and not expired (pocket 0 is always, once the ADD_OBJ made it). */
  usable(pocket: number): boolean {
    const it = this.pockets[pocket];
    return it !== undefined && it !== null && !it.expired;
  }

  /** `IsAvailable( pocket, FALSE )`: there, expired or not (its items are shown, greyed when expired). */
  exists(pocket: number): boolean {
    return (this.pockets[pocket] ?? null) !== null;
  }

  /** The seconds a pocket in use has left (`GetExpirationDate() - time(NULL)`), at least 0; null for none or no end. */
  secondsLeft(pocket: number, now: number): number | null {
    const it = this.pockets[pocket];
    if (it === undefined || it === null || it.expired || it.expiresAt === 0) return null;
    return Math.max(0, it.expiresAt - now);
  }

  item(pocket: number, objectId: number): InventoryItem | undefined {
    return this.pockets[pocket]?.container.items.get(objectId);
  }

  /** The pocket's grid by position (`CWndItemCtrl::GetItem` = `GetAt`): each position's item, or null; [] for none. */
  cells(pocket: number): Array<InventoryItem | null> {
    const it = this.pockets[pocket];
    if (it === undefined || it === null) return [];
    return it.container.slots.slice(0, it.container.positions).map((id) => {
      if (id === NULL_ID) return null;
      const item = it.container.items.get(id);
      return item !== undefined && item.itemId !== 0 ? item : null;
    });
  }

  /** Whether any pocket holds an item (`IsAllClean`'s opposite). */
  hasItems(): boolean {
    return this.pockets.some((it) => it !== null && it.container.items.size > 0);
  }

  /** POCKET_ATTRIBUTE: `SetAttribute( attribute, pocket, data )`. */
  attribute(attribute: number, pocket: number, data: number, now: number): void {
    if (pocket < 0 || pocket >= POCKET_COUNT) return;
    if (attribute === PocketAttribute.EXPIRED) {
      const it = this.pockets[pocket];
      if (it === undefined || it === null) return;
      it.expired = data !== 0;
    } else if (attribute === PocketAttribute.AVAIL) {
      this.avail(pocket, data, now);
    } else return;
    this.revision++;
  }

  /** `Avail( pocket, t )`. */
  private avail(pocket: number, seconds: number, now: number): void {
    let it = this.pockets[pocket] ?? null;
    if (it === null) {
      it = { container: freshContainer(POCKET_SLOTS[pocket]!), expired: false, expiresAt: now + seconds };
      this.pockets[pocket] = it;
    } else {
      it.expiresAt = it.expired ? now + seconds : it.expiresAt + seconds;
    }
    it.expired = false;
    if (seconds === 0) it.expiresAt = 0;
  }

  /** POCKET_ADD_ITEM: `Add( pocket, &item )`, into a pocket in use only. */
  add(pocket: number, item: InventoryItem, packMax: PackMax): void {
    if (!this.usable(pocket)) return;
    if (containerAdd(this.pockets[pocket]!.container, item, packMax)) this.revision++;
  }

  /** POCKET_REMOVE_ITEM: `RemoveAtId( pocket, item, count )`, in a pocket in use only. */
  remove(pocket: number, objectId: number, count: number): void {
    if (!this.usable(pocket)) return;
    const container = this.pockets[pocket]!.container;
    const item = container.items.get(objectId);
    if (item === undefined) return;
    if (item.count > count) container.items.set(objectId, { ...item, count: item.count - count });
    else container.items.delete(objectId);
    this.revision++;
  }
}
