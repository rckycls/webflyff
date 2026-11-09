// The personal shop's state on the browser (2026-11-10, personal-shop research §2-§4): `CVTInfo`'s vendor part for the
// movers in view, the own shop's slots and its saved list, the shop being browsed and the shop's chat room. `apply` reads
// a world message as Neuz's handlers do and says what changed; the windows act on the events.
//
//   CVTInfo::Vendor*               _Common/MoverItem.cpp:535-623   the slots: SetItem, ItemNum, Close
//   CDPClient::OnPVendorOpen ...   Neuz/DPClient.cpp:13798-14062   the shop's snapshots
//   CDPClient::OnChatting          :15054-15166                    the chat room (g_Chatting)
//   CWndVendor::OnDestroy, ReloadItemList   _Interface/WndVendor.cpp:147-184, :483-505   the saved list (m_aSavedInven)

import type { AddedMover, VendorItem, WorldMessage } from '@flyffweb/protocol';
import { MAX_VENDITEM } from './vendorRules';
import type { OwnSlot } from './vendorRules';

/** An entry of `g_Neuz.m_aSavedInven`: what the own shop held when its window closed. */
export interface SavedSlot extends OwnSlot {
  itemId: number;
}

/** The shop being browsed (`m_vtInfo.GetOther()` and its `VendorCopyItems`). */
export interface Browsed {
  sellerId: number;
  items: (VendorItem | null)[];
}

export type VendorEvent =
  /** A mover's title came or went (the balloon). */
  | { kind: 'title'; objectId: number; title: string }
  /** The own shop opened (PVENDOR_OPEN of the own mover). */
  | { kind: 'ownOpened' }
  /** The own shop shut while it was open (PVENDOR_CLOSE of the own mover); `title` the one it had. */
  | { kind: 'ownClosed'; title: string; slots: (OwnSlot | null)[] }
  /** A slot of the own shop was filled or emptied; `objectId` the bag item held or let go. */
  | { kind: 'ownSlot'; slot: number; objectId: number; held: boolean }
  /** Another's shop came (PVENDOR_ITEM): its window opens. */
  | { kind: 'browse'; sellerId: number; chatting: boolean }
  /** The browsed shop shut, or the buyer left it. */
  | { kind: 'browseClosed'; sellerId: number }
  /** A slot's count changed (PVENDOR_ITEM_NUM); for the own shop, `sold` pieces of `itemId` went to `buyer` for `total`. */
  | { kind: 'itemNum'; sellerId: number; slot: number; left: number; buyer: string; sold: number; itemId: number; total: number }
  | { kind: 'chatMembers' }
  | { kind: 'chatEnter'; name: string }
  | { kind: 'chatLeave'; name: string }
  | { kind: 'chatLine'; name: string; text: string }
  | { kind: 'chatState'; open: boolean }
  | { kind: 'chatDeleted' };

const emptySlots = <T>(): (T | null)[] => Array.from({ length: MAX_VENDITEM }, () => null);

export class VendorBook {
  /** The titles of the movers in view with an open shop, the own one included (`m_vtInfo.m_strTitle`). */
  readonly titles = new Map<number, string>();
  /** The own shop's registered items (`m_apItem_VT` of `g_pPlayer`). */
  own: (OwnSlot | null)[] = emptySlots<OwnSlot>();
  /** `g_Neuz.m_aSavedInven`. */
  saved: (SavedSlot | null)[] = emptySlots<SavedSlot>();
  browsed: Browsed | null = null;
  /** `g_Chatting`: the room's state and its members by player id. */
  chatOpen = false;
  readonly members = new Map<number, string>();

  /** The own shop is open (`IsVendorOpen`: its title is not empty). */
  ownOpen(selfId: number | undefined): boolean {
    return selfId !== undefined && (this.titles.get(selfId) ?? '') !== '';
  }

  /** An item is registered (`VendorIsVendor`). */
  get isVendor(): boolean {
    return this.own.some((slot) => slot !== null);
  }

  /** The bag object ids the own shop holds. */
  heldObjectIds(): number[] {
    return this.own.flatMap((slot) => (slot === null ? [] : [slot.objectId]));
  }

  /** ADD_OBJ of a player with an open shop (DPClient.cpp:1356-1359), or a mover gone (DEL_OBJ). */
  added(mover: AddedMover): VendorEvent[] {
    const title = mover.player?.shopTitle ?? '';
    if (title === '') {
      if (!this.titles.has(mover.objectId)) return [];
      this.titles.delete(mover.objectId);
      return [{ kind: 'title', objectId: mover.objectId, title: '' }];
    }
    this.titles.set(mover.objectId, title);
    return [{ kind: 'title', objectId: mover.objectId, title }];
  }

  removed(objectId: number): VendorEvent[] {
    const events: VendorEvent[] = [];
    if (this.titles.delete(objectId)) events.push({ kind: 'title', objectId, title: '' });
    // the browsed seller left view: its window closes (DPClient.cpp:1676-1690)
    if (this.browsed?.sellerId === objectId) {
      this.browsed = null;
      events.push({ kind: 'browseClosed', sellerId: objectId });
    }
    return events;
  }

  /**
   * A world message: the shop's snapshots and the chat room. `objectId` the message's mover; `selfId` the own mover;
   * `itemOf` the own bag's item by object id (for the sale's line); `nameOf` a player id's name in view.
   */
  apply(objectId: number, value: WorldMessage, selfId: number | undefined, itemOf: (objectId: number) => { itemId: number } | undefined): VendorEvent[] {
    switch (value.type) {
      case 'pvendorOpen': {
        this.titles.set(objectId, value.title);
        const events: VendorEvent[] = [{ kind: 'title', objectId, title: value.title }];
        if (objectId === selfId) events.push({ kind: 'ownOpened' });
        return events;
      }
      case 'pvendorClose': return this.close(objectId, value.clearTitle, selfId);
      case 'registerPVendorItem': {
        // the own mover only (OnRegisterPVendorItem: IsActiveMover)
        if (objectId !== selfId || value.slot >= MAX_VENDITEM) return [];
        const events: VendorEvent[] = [];
        const before = this.own[value.slot];
        if (before !== null && before !== undefined && before.objectId !== value.objectId) {
          events.push({ kind: 'ownSlot', slot: value.slot, objectId: before.objectId, held: false });
        }
        this.own[value.slot] = { objectId: value.objectId, count: value.count, cost: value.cost };
        events.push({ kind: 'ownSlot', slot: value.slot, objectId: value.objectId, held: true });
        return events;
      }
      case 'unregisterPVendorItem': {
        const events: VendorEvent[] = [];
        if (objectId === selfId) {
          const before = this.own[value.slot];
          this.own[value.slot] = null;
          if (before) events.push({ kind: 'ownSlot', slot: value.slot, objectId: before.objectId, held: false });
        }
        this.saved[value.slot] = null; // m_aSavedInven cleared whoever it was (DPClient.cpp:13945-13949)
        return events;
      }
      case 'pvendorItems': {
        const items = Array.from({ length: MAX_VENDITEM }, (_, slot) => value.items.find((item) => item.slot === slot) ?? null);
        this.chatOpen = value.chatting;
        if (objectId === selfId) return [];
        this.browsed = { sellerId: objectId, items };
        return [{ kind: 'browse', sellerId: objectId, chatting: value.chatting }];
      }
      case 'pvendorItemNum': return this.itemNum(objectId, value.slot, value.left, value.buyer, selfId, itemOf);
      case 'chattingNew':
        this.members.clear();
        for (const member of value.members) this.members.set(member.playerId, member.name);
        return [{ kind: 'chatMembers' }];
      case 'chattingEnter':
        this.members.set(value.member.playerId, value.member.name);
        return [{ kind: 'chatMembers' }, { kind: 'chatEnter', name: value.member.name }];
      case 'chattingDelete':
        this.members.clear();
        return [{ kind: 'chatMembers' }, { kind: 'chatDeleted' }];
      case 'chattingRemove': {
        const name = this.members.get(value.playerId);
        this.members.delete(value.playerId);
        return name === undefined ? [] : [{ kind: 'chatMembers' }, { kind: 'chatLeave', name }];
      }
      case 'chattingLine': {
        const name = this.members.get(value.playerId);
        return name === undefined ? [] : [{ kind: 'chatLine', name, text: value.text }];
      }
      case 'chattingState':
        this.chatOpen = value.open;
        return [{ kind: 'chatState', open: value.open }];
      default:
        return [];
    }
  }

  /** `OnPVendorClose` (DPClient.cpp:13846-13933) and `VendorClose` (MoverItem.cpp:590-611). */
  private close(objectId: number, clearTitle: boolean, selfId: number | undefined): VendorEvent[] {
    const events: VendorEvent[] = [];
    if (this.browsed?.sellerId === objectId) {
      this.browsed = null;
      events.push({ kind: 'browseClosed', sellerId: objectId });
    }
    if (objectId === selfId) {
      const title = this.titles.get(objectId) ?? '';
      const slots = this.own;
      this.own = emptySlots<OwnSlot>();
      for (const [slot, entry] of slots.entries()) if (entry) events.push({ kind: 'ownSlot', slot, objectId: entry.objectId, held: false });
      if (title !== '') events.push({ kind: 'ownClosed', title, slots });
    }
    if (clearTitle && this.titles.delete(objectId)) events.push({ kind: 'title', objectId, title: '' });
    return events;
  }

  /** `OnPVendorItemNum` (DPClient.cpp:13963-13996) and `VendorItemNum` (MoverItem.cpp:565-582). */
  private itemNum(
    objectId: number, slot: number, left: number, buyer: string, selfId: number | undefined,
    itemOf: (objectId: number) => { itemId: number } | undefined,
  ): VendorEvent[] {
    let sold = 0, itemId = 0, total = 0;
    const events: VendorEvent[] = [];
    if (objectId === selfId) {
      const entry = this.own[slot];
      if (entry) {
        sold = entry.count - left;
        total = Math.imul(sold, entry.cost);
        itemId = itemOf(entry.objectId)?.itemId ?? 0;
        if (left <= 0) {
          // VendorItemNum's m_apItem_VT[i] = NULL: the bag item is let go (the server takes the pieces sold from it)
          this.own[slot] = null;
          events.push({ kind: 'ownSlot', slot, objectId: entry.objectId, held: false });
        } else entry.count = left;
      }
    } else if (this.browsed?.sellerId === objectId) {
      const entry = this.browsed.items[slot];
      if (entry) {
        if (left <= 0) this.browsed.items[slot] = null;
        else entry.count = left;
      }
    }
    this.saved[slot] = null;
    events.unshift({ kind: 'itemNum', sellerId: objectId, slot, left, buyer, sold, itemId, total });
    return events;
  }

  /** `CWndVendor::OnDestroy` (WndVendor.cpp:486-498): the own slots kept, with their item ids. */
  save(itemOf: (objectId: number) => { itemId: number } | undefined): void {
    for (const [slot, entry] of this.own.entries()) {
      if (entry === null) continue;
      this.saved[slot] = { ...entry, itemId: itemOf(entry.objectId)?.itemId ?? 0 };
    }
  }

  /**
   * `ReloadItemList` (WndVendor.cpp:147-184): with the shop shut, each saved entry whose bag item is still there (the same
   * object and item id) is registered again, unless the stack shrank under the saved count (then it is dropped).
   */
  reload(itemOf: (objectId: number) => { itemId: number; count: number } | undefined): Array<{ slot: number } & OwnSlot> {
    const again: Array<{ slot: number } & OwnSlot> = [];
    for (const [slot, entry] of this.saved.entries()) {
      if (entry === null || entry.objectId === 0) continue;
      const item = itemOf(entry.objectId);
      if (item === undefined || item.itemId !== entry.itemId) continue;
      if (entry.count > item.count) { this.saved[slot] = null; continue; }
      again.push({ slot, objectId: entry.objectId, count: entry.count, cost: entry.cost });
    }
    return again;
  }

  /** Reset: the saved list emptied (WndVendor.cpp:458-459). */
  clearSaved(): void {
    this.saved = emptySlots<SavedSlot>();
  }

  /** The buyer let the shop go (its window closed): `SetOther( NULL )` waits for PVENDOR_CLOSE; the copies go now. */
  leave(): void {
    this.browsed = null;
  }

  /** A new world: nothing in view, the own shop shut. */
  reset(): void {
    this.titles.clear();
    this.own = emptySlots<OwnSlot>();
    this.browsed = null;
    this.chatOpen = false;
    this.members.clear();
  }
}
