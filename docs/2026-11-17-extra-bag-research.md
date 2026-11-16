# Extra bag (Backpack) research, 2026-11-17

V15 calls it the Backpack (`APP_BAG_EX`, `TID_APP_BAG_EX` "Backpack"). It is a window of three pockets beside the main bag.
Sources: `Source/_Common/pocket.{h,cpp}`, `_Interface/WndBagEx.cpp`, `WndField.cpp`, `WndItemCtrl.cpp`, `Neuz/DPClient.cpp`,
`WORLDSERVER/DPSrvr.cpp`, `User.cpp`, `_Common/Mover.cpp`, `_Database/DbManagerFun.cpp`, `Resource/resdata.inc`,
the converted texts and item props.

## 1. Pockets

- `MAX_POCKET` 3 (`pocket.h:31`).
- Pocket 0: 6 slots (`POCKET_SLOT_SIZE_0`). Always open, never expires (`Mover.cpp:1468` `m_Pocket.Avail( 0 )`, time 0).
- Pockets 1 and 2: 24 slots each (`POCKET_SLOT_SIZE_1_2`). Opened by an Extra Bag item for a time.
- A pocket is a `CItemContainer` of its size. Position i holds object i and never moves (no move inside a pocket).
- Items show by position, gaps kept (`CWndItemCtrl::GetItem` = `GetAt`, `WndItemCtrl.cpp:455-520, 1101`).

## 2. Opening and expiry

- Items that open a pocket: `IK3_POCKET` (123). `dwSkillTime` is the time in seconds.
  - 26561 Extra Bag (1 day) 86400 s.
  - 20040 Extra Bag (15 days) 1296000 s.
  - 26477 Extra Bag (30 days) 2592000 s.
- Desktop: drag the Extra Bag from the main bag onto the bag icon 1 or 2 of the Backpack (`CWndBagEx::OnDropIcon`,
  `WndBagEx.cpp:220-270`). Only from the main bag, only `IK3_POCKET`.
  - Pocket already in use: message box `TID_GAME_ALREADY_USE` "You are already using an Extra Bag." No packet.
  - Else `AVAIL_POCKET` (pocket, item object id).
- Server `OnAvailPocket` (`DPSrvr.cpp:8676-8710`): pocket 1 or 2 only, item usable and `IK3_POCKET`, pocket not in use.
  Takes one item (`UpdateItem UI_NUM count-1`), sets the pocket open for `dwSkillTime` and sends `POCKET_ATTRIBUTE(avail)`.
  An in-use pocket is never extended.
- `CPocketController::Avail` (`pocket.cpp:73-93`): an expired pocket gets now + time; a new pocket is made empty.
  The items of an expired pocket stay in it.
- Expiry: the world server checks every second (`ProcessExpiring`, `pocket.cpp:340-360`, pockets 1-2). Past the date it
  sends `POCKET_ATTRIBUTE(expired, pocket, 1)`.
- An expired pocket keeps its items. They show greyed under the cover, and cannot be moved out
  (`GetItemId2` with the expiry check, `Mover.cpp:11694-11699`; the bag's drop handler checks `IsAvailable`,
  `WndField.cpp:1936-1941`). They come back when the pocket is opened again.
- The database keeps a pocket that has items or is not expired (`DbManagerFun.cpp:628-650`).
- A character with anything in a pocket cannot be sealed (`TID_GAME_SEALCHAR_NO_CLEANBANK`). Server only.

## 3. The window (`APP_BAG_EX`, resdata.inc:13938-14037)

- "InventoryBag.tga" (one picture, not tiled), 236 x 496, title "Backpack" (`IDS_RESDATA_INC_005168`), hotkey B.
- Controls (client coordinates):
  - `WIDC_BASIC` tab control [10,10,230,66]: pocket 0, one tab "Item" (`TID_GAME_ITEM`).
  - `WIDC_ICO_BAG1` [46,72,86,110], `WIDC_ICO_BAG2` [132,72,174,110]: the bag icons.
  - `WIDC_EXBAG1` [10,138,230,284], `WIDC_EXBAG2` [10,312,230,458]: pockets 1 and 2, one "Item" tab each.
  - `WIDC_CUSTOM4` (9,134), `WIDC_CUSTOM5` (9,306): where the cover goes.
  - `WIDC_TABCTRL2`, `WIDC_TABCTRL3`, `WIDC_CUSTOM3`: off the window or unused.
- Each grid: 32 px cells, 6 across, a scroll bar at the right (thumb only when needed). Pocket 0 shows 1 row, 1 and 2 show 4.
- `OnDraw` (`WndBagEx.cpp:62-140`), for pockets 1 and 2:
  - in use: `Itm_SysSysScrBagBag01.bmp` (gold bag) on the icon, alpha 200;
  - not in use: `InventoryBagEff.tga` (grey) over the grid at alpha 150, and `Itm_SysSysScrBagBag02.bmp` (grey bag), alpha 200.
- Icon tooltip (`OnMouseWndSurface`, `WndBagEx.cpp:272-345`):
  - in use: `TID_TOOLTIP_BAG_TIME` "%d Days %d Hours %d Minutes left" from the time left;
  - not in use: `TID_TOOLTIP_BAG_INFO` "Place the Extra Bag icon here."
  - The port shows the time short ("29d23h left"), by the owner's 2026-11-14 rule for every duration (`formatDuration`).
- Item tooltip: the normal bag tooltip (`PutToolTip_Item(..., APP_INVENTORY)`, `WndItemCtrl.cpp:188-210`).
- Placing: `OnInitialUpdate` moves it to the right, then `MoveParentCenter()`: it opens centred.
- It does not open the bag. It refuses to open (closes at once) with the trade, a mail being read, an NPC shop, the guild
  bank or a private shop open (`WndBagEx.cpp:148-152`).
- It closes when the bank, an NPC shop, a private shop, the guild bank, the trade or the post opens (`WndBank.cpp:50`,
  `WndShop.cpp:771`, `WndVendor.cpp:95`, `WndGuildBank.cpp:92`, `WndField.cpp:9000`, `:13822`).
- Start menu: "Backpack" after Inventory, before Housing (`WndTaskBar.cpp:2599-2605`). Applet icon `Icon_BagBag.tga`.
- A double-click on a pocket item does nothing (`CWndBagEx` has no `WIN_DBLCLK`).
- The pet food mill refuses a pocket item: `TID_GAME_ERROR_FOOD_MILL_POCKET` (`WndPetSys.cpp:1725`).

## 4. Moving items

All moves use `MOVE_ITEM_POCKET` (from, object id, count, to). -1 is the main bag.

- Bag to pocket (`CWndBagEx::OnChildNotify`, `WndBagEx.cpp:348-430`): the count box closes first.
  - Target pocket 1 or 2 not in use: nothing.
  - From the equipment (no single bag item selected): `TID_GAME_EQUIPPUT` "Please unequip the item first."
  - Quest item (`IK3_QUEST`): `TID_GAME_ERROR_DONT_MOVE_QUEST_ITEM_TO_BAG_EX`.
  - A stack of more than 1: the count box ("Move how many items?", "Number:"), only when no part is in a trade or shop
    (`GetExtra() == 0`); with a part in use nothing happens.
  - One item: sent at once with count 1.
- Pocket to pocket (`:432-500`): both pockets must be in use (pocket 0 always). A stack opens the count box; one item goes
  at once. A drop on its own grid does nothing (`CWndItemCtrl::OnDropIcon`, `WndItemCtrl.cpp:1213-1232`).
- Pocket to bag (`CWndInventory::OnChildNotify`, `WndField.cpp:1918-1977`): the source pocket must be in use. A stack opens
  the count box; one item goes at once.
- Count box OK (`CWndTradeGold`, `WndField.cpp:8529-8542`): count at least 1, at most the stack; sends the move.
- Server `OnMoveItemOnPocket` (`DPSrvr.cpp:8625-8673`): from != to, count 1 .. stack, a worn bag item and an item in use
  (pet, feed pocket) are refused. It adds to the target first (`CreateItem2`) and only then removes from the source.
  - Into a pocket: `POCKET_ADD_ITEM` (the pocket adds it, stacking first, as `CItemContainer::Add`).
  - Out of a pocket: `POCKET_REMOVE_ITEM` (count down, or the item gone).
  - Into or out of the bag: the bag's usual create-item and update-item snapshots.
  - Target full: nothing is moved, nothing is said.

## 5. Packets

| Direction | Name | Type | Body |
|---|---|---|---|
| client to world | `AVAIL_POCKET` | 0x70000006 | int pocket, int item object id |
| client to world | `MOVE_ITEM_POCKET` | 0x70000007 | int from, int item, short count, int to |
| snapshot | `POCKET_ATTRIBUTE` | 0x0200 | int attribute (0 expired, 1 avail), int pocket, int data |
| snapshot | `POCKET_ADD_ITEM` | 0x0201 | int pocket, `CItemElem` |
| snapshot | `POCKET_REMOVE_ITEM` | 0x0202 | int pocket, int item, short count |
| own ADD_OBJ | `m_Pocket.Serialize` | | per pocket a BYTE; when 1 the container, BOOL expired, time_t date, and the time left when the date is not 0 |

- `POCKET_ATTRIBUTE` avail: `Avail(pocket, data)`; expired: `SetExpired(data)`. The Backpack redraws (`InitItem`).
- The client keeps the date as now + time left (`CPocket::Serialize`, `pocket.cpp:28-50`).

## 6. What FlyffWeb had before

- `packages/protocol/src/world/own.ts` read the pockets in the own ADD_OBJ and threw them away (to reach the honour counts).
- No pocket snapshot reader. A pocket snapshot in a bundle would have stopped the rest of that bundle from being read.
- `APPLETS` already lists `APP_BAG_EX` (689, `Icon_BagBag.tga`, B), but no window opened.
- The other "pocket" code is the pet feed pocket (item 21035), a different thing: its buff, tooltip and off-switch.
  It stays as it is.

## 7. Server

The V15 servers already handle all of it. No server change is needed. The owner's Source already has the count and
range checks in `OnMoveItemOnPocket` (security batch).

## 8. Phone (not in V15)

V15 has no phone. The port copies the bank's phone pattern:
- the Backpack is a compact V15 panel beside the phone's bag, which shows its items only;
- tabs pick the pocket shown (Basic, Bag 1, Bag 2); each closed pocket shows its cover and the "Place the Extra Bag icon
  here." line; an open one shows its time left under its bag icon;
- a tap on a bag item puts it in the pocket shown; when that pocket is closed and the item is an Extra Bag, the tap opens
  the pocket with it (the drop on its icon);
- a tap on a pocket item takes it out to the bag;
- counts use the game's number pad (`AmountBox`);
- opening the Backpack on the phone opens the bag too (the taps need it).
