// The own guild's bank as Neuz keeps it (2026-11-15, side-session-notes housing-research/research-note.md §1): `CGuild::m_GuildBank`,
// 42 slots, filled whole by GUILD_BANK_WND and changed by the guild bank's snapshots as Neuz's handlers change it:
//
//   CDPClient::OnGuildBankWindow      Neuz/DPClient.cpp:3010-3034    m_GuildBank.Serialize( ar ): the whole bank
//   CDPClient::OnPutItemGuildBank     :2843-2851                     m_GuildBank.Add( &itemElem ), whatever the mode
//   CDPClient::OnGetItemGuildBank     :2853-2943                     an item: GetAtId( its id ); the count off, or RemoveAtId
//   CDPClient::OnRemoveGuildBankItem  :16120-16134                   CGuild::RemoveItem( id, count )
//   CWndItemCtrl::OnDraw              _Interface/WndItemCtrl.cpp:664-702  the filled items drawn packed, in position order

import type { InventoryItem } from '@flyffweb/protocol';
import { MAX_GUILDBANK } from '@flyffweb/protocol';
import { containerAdd, freshContainer } from '../trade/itemContainer';
import type { ItemContainer, PackMax } from '../trade/itemContainer';

const NULL_ID = 0xffffffff;

export class GuildBankBook {
  private container: ItemContainer = freshContainer(MAX_GUILDBANK);
  /** Bumped on every change, for the window to redraw. */
  revision = 0;

  /** GUILD_BANK_WND: the bank as the server sent it. */
  load(bank: { slots: readonly number[]; items: readonly InventoryItem[] }): void {
    const slots = bank.slots.length === MAX_GUILDBANK ? [...bank.slots] : Array.from({ length: MAX_GUILDBANK }, (_, i) => i);
    this.container = { items: new Map(bank.items.map((item) => [item.objectId, { ...item }])), slots, positions: MAX_GUILDBANK };
    this.revision++;
  }

  /** Forgets the bank (the guild left, the world left). */
  clear(): void {
    this.container = freshContainer(MAX_GUILDBANK);
    this.revision++;
  }

  item(objectId: number): InventoryItem | undefined {
    return this.container.items.get(objectId);
  }

  /** The filled items as the grid draws them: packed, in position order. */
  packed(): InventoryItem[] {
    const items: InventoryItem[] = [];
    for (let i = 0; i < this.container.positions; i++) {
      const id = this.container.slots[i];
      if (id === undefined || id === NULL_ID) continue;
      const item = this.container.items.get(id);
      if (item !== undefined && item.itemId !== 0) items.push(item);
    }
    return items;
  }

  /** PUTITEMGUILDBANK: `m_GuildBank.Add( item )` (stacks first, then the first empty position; the item's own id not used). */
  put(item: InventoryItem, packMax: PackMax): void {
    containerAdd(this.container, item, packMax);
    this.revision++;
  }

  /**
   * GETITEMGUILDBANK's item, and REMOVE_GUILD_BANK_ITEM's: `count` off the object, or the object gone when that is all of it.
   * False when the bank has no such object (Neuz then adds nothing to the bag either).
   */
  take(objectId: number, count: number): boolean {
    const item = this.container.items.get(objectId);
    if (item === undefined) return false;
    if (item.count > count) this.container.items.set(objectId, { ...item, count: item.count - count });
    else this.container.items.delete(objectId);
    this.revision++;
    return true;
  }
}
