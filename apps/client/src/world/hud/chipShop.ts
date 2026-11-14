// 2026-11-15: the Red Chip merchant (Waforu, `SetVenderType(1)`, Resource/character.inc:6383-6440), as V15 runs it.
//
//   CItemBase::GetChipCost    _Common/Item.cpp:147-158          the price is `dwReferValue1`, -1 for none
//   CWndShop::OnDraw          _Interface/WndShop.cpp:722-736    the price box shows GetChipCost at a type 1 vendor
//   CWndMgr::PutItemGold      _Interface/WndManager.cpp:5679-5728  "Price : %s" + " Red Chip"
//   CWndConfirmBuy::OnOK      _Interface/WndShop.cpp:561-576    count * cost above the bag's chips: TID_GAME_CANNTBUY_REDCHIP
//   CDPClient::SendBuyChipItem  Neuz/DPClient.cpp:9770-9776     PACKETTYPE_BUYCHIPITEM, BUYITEM's body
//   CDPSrvr::OnBuyChipItem    WORLDSERVER/DPSrvr.cpp:12112-12240  the same checks, then TID_GAME_LACKCHIP / LACKSPACE
//
// A sale is the same at every vendor: penya (OnSellItem has no vendor-type check, DPSrvr.cpp:12239-12260).

import type { WebItemProp, WebNpc } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';

/** `II_CHP_RED` (defineItem.h:4888): the Red Chip. */
export const II_CHP_RED = 26460;
/** `m_nVenderType` 1: a vendor that sells for Red Chips (`OnBuyChipItem`'s "1 - chip vendor", DPSrvr.cpp:12128). */
export const CHIP_VENDOR = 1;

/** The vendor sells for Red Chips. */
export const isChipVendor = (npc: WebNpc | undefined): boolean => npc?.vendorType === CHIP_VENDOR;

/**
 * The vendor's shop opens: a penya vendor (type 0, the default of `Project.cpp:2947`) or a chip vendor. The server knows
 * no other type: OnBuyItem takes type 0 alone (DPSrvr.cpp:11988-11991), OnBuyChipItem type 1 alone (:12127-12129).
 */
export const opensShop = (npc: WebNpc | undefined): boolean => (npc?.vendorType ?? 0) === 0 || isChipVendor(npc);

/** `GetChipCost`: the item's price in Red Chips, -1 when the row gives none. */
export const chipCost = (prop: WebItemProp | undefined): number => prop?.referValue1 ?? -1;

/** `GetAtItemNum( II_CHP_RED )`: every Red Chip the player holds (all stacks; ItemContainer, Item.h:534-543). */
export function chipsHeld(items: Iterable<InventoryItem>): number {
  let count = 0;
  for (const item of items) if (item.itemId === II_CHP_RED) count += item.count;
  return count;
}

/**
 * OnBuyChipItem's full-bag rule (DPSrvr.cpp:12162-12188): with no room for the item, the buy still goes on when the chips
 * paid (`chips`) are a whole stack's worth or more (`dwPackMax`, 9999), or when the first Red Chip stack in object-id
 * order (`GetAtId( i )`) holds no more than them (it is used up, so its slot frees). Else TID_GAME_LACKSPACE.
 */
export function chipsFreeSlot(items: Iterable<InventoryItem>, chips: number, chipPackMax: number): boolean {
  if (chips >= chipPackMax) return true;
  let first: InventoryItem | undefined;
  for (const item of items) if (item.itemId === II_CHP_RED && item.count > 0 && (first === undefined || item.objectId < first.objectId)) first = item;
  return first !== undefined && first.count <= chips;
}
