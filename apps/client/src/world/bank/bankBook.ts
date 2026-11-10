// The account's three banks as the own character holds them (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md
// §1; A-bank.md §4.6, §7), kept from the own ADD_OBJ and changed by the bank's snapshots as Neuz's handlers change them:
//
//   CMover::m_Bank[3], m_dwGoldBank[3], m_idPlayerBank[3], m_nSlot   _Common/Mover.h:707-711
//   CDPClient::OnPutItemBank         Neuz/DPClient.cpp:2881-2888   m_Bank[nSlot].Add( &itemElem )
//   CDPClient::OnUpdateBankItem      :3000-3012                    UpdateItemBank: UI_NUM 0 removes, else the count
//   CDPClient::OnPutGoldBank         :3013-3021                    m_dwGoldBank[nSlot], and the bag's penya (OwnState)
//   CWndBank::ReSetBank              _Interface/WndBank.cpp:125-150 the own slot always; another with a character in it and a
//                                                                   Common Bank timer (IsCommBank, Mover.cpp:11700-11703)
//   CWndItemCtrl::OnDraw             _Interface/WndItemCtrl.cpp:664-702  a bank draws its filled items packed, in position
//                                                                   order (GetAt), no gaps

import type { InventoryItem, OwnBank } from '@flyffweb/protocol';
import { BANK_COUNT, MAX_BANK } from '@flyffweb/protocol';
import { containerAdd, containerIsFull } from '../trade/itemContainer';
import type { ItemContainer, PackMax } from '../trade/itemContainer';

/** `SM_BANK15`, `SM_BANK30`, `SM_BANK001` (`_Network/CmnHdr.h:495-503`): the Common Bank timers. */
export const COMMON_BANK_TIMERS: readonly number[] = [0, 1, 25];
/** `UI_NUM`: UPDATE_BANKITEM's count. */
const UI_NUM = 0;
const NULL_ID = 0xffffffff;

export class BankBook {
  /** `m_nSlot`: the own character's slot, its bank the one always usable. */
  readonly slot: number;
  /** `m_dwGoldBank[3]`. */
  readonly gold: number[];
  /** `m_idPlayerBank[3]`: the player in each slot of the account, 0 for none. */
  readonly players: number[];
  readonly containers: ItemContainer[];
  /** Bumped on every change, for the window to redraw. */
  revision = 0;

  constructor(bank?: OwnBank) {
    this.slot = bank?.slot ?? 0;
    this.gold = Array.from({ length: BANK_COUNT }, (_, i) => bank?.gold[i] ?? 0);
    this.players = Array.from({ length: BANK_COUNT }, (_, i) => bank?.players[i] ?? 0);
    this.containers = Array.from({ length: BANK_COUNT }, (_, i) => {
      const read = bank?.containers?.[i];
      const slots = read?.slots.length === MAX_BANK ? [...read.slots] : Array.from({ length: MAX_BANK }, (_, n) => n);
      return { items: new Map((read?.items ?? []).map((item) => [item.objectId, { ...item }])), slots, positions: MAX_BANK };
    });
  }

  /** `ReSetBank`'s rule: `commonBank` is whether a Common Bank timer runs (`IsCommBank`). */
  usable(bank: number, commonBank: boolean): boolean {
    if (bank === this.slot) return true;
    return (this.players[bank] ?? 0) !== 0 && commonBank;
  }

  /** The bank's filled items as its grid draws them: packed, in position order. */
  packed(bank: number): InventoryItem[] {
    const container = this.containers[bank];
    if (container === undefined) return [];
    const items: InventoryItem[] = [];
    for (let i = 0; i < container.positions; i++) {
      const id = container.slots[i];
      if (id === undefined || id === NULL_ID) continue;
      const item = container.items.get(id);
      if (item !== undefined && item.itemId !== 0) items.push(item);
    }
    return items;
  }

  item(bank: number, objectId: number): InventoryItem | undefined {
    return this.containers[bank]?.items.get(objectId);
  }

  /** `IsFull` of a bank: whether `count` of `item` does not fit (the server's check before a put). */
  isFull(bank: number, item: InventoryItem, count: number, packMax: PackMax): boolean {
    const container = this.containers[bank];
    return container === undefined || containerIsFull(container, item, count, packMax);
  }

  /** PUTITEMBANK: `m_Bank[bank].Add( item )` (stacks first, then the first empty position; the item's own id is not used). */
  put(bank: number, item: InventoryItem, packMax: PackMax): void {
    const container = this.containers[bank];
    if (container === undefined) return;
    containerAdd(container, item, packMax);
    this.revision++;
  }

  /** UPDATE_BANKITEM: `UpdateItemBank( bank, id, param, value )`: UI_NUM 0 removes the item, else sets its count. */
  update(bank: number, objectId: number, param: number, value: number): void {
    const container = this.containers[bank];
    const item = container?.items.get(objectId);
    if (container === undefined || item === undefined || param !== UI_NUM) return;
    if (value === 0) container.items.delete(objectId);
    else container.items.set(objectId, { ...item, count: value });
    this.revision++;
  }

  /** PUTGOLDBANK: the bank's penya. */
  setGold(bank: number, gold: number): void {
    if (bank < 0 || bank >= BANK_COUNT) return;
    this.gold[bank] = gold;
    this.revision++;
  }
}
