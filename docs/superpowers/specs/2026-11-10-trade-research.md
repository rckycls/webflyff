# V15 player trade: research (2026-11-10)

The owner asked: "research how v15 trade works and apply it. create a mobile responsive version as well". This note covers
the player-to-player trade window (Neuz's `CWndTrade`). Personal shops (vendors) are a separate system and are left out.

Sources: the Neuz source (`Source/`, CP949, read with `iconv -f cp949 -t utf-8`), the resources (`Resource/resdata.inc`,
`Resource/resData.txt.txt`, `Resource/textClient.inc` + `textClient.txt.txt`), and a 2010 copy of the official Gala wiki.
Line numbers are those of the files in `Source/` and `Resource/`. Where the wiki and the code differ, the code wins.

## 1. The pieces

| Neuz class | Window id (`ResData.h`) | resdata.inc | What it is |
|---|---|---|---|
| `CWndTrade` | `APP_TRADE` 1009 (:798) | :21942, `WndTrade.tga` (not tiled) 352 x 288 | The trade window |
| `CWndTradeCtrl` (x2) | children 10001 / 10002 | made in code | The two 5 x 5 item grids |
| `CWndConfirmTrade` | `APP_CONFIRM_TRADE` 259 (:164) | :28047, `WndTile06.tga` 272 x 160 | "X wants to trade." on the asked side |
| `CWndTradeConfirm` | `APP_TRADE_CONFIRM` 292 (:197) | :2024, `WndTile08.tga` 288 x 128 | The final "Do you accept the trade?" |
| `CWndTradeGold` | `APP_TRADE_GOLD` 116 (:21) | :11228, `WndTile09.tga` 240 x 128 | The quantity / penya box |

Declarations: `_Interface/WndField.h:878-956`, `_Interface/WndTradeCtrl.h`. Code: `_Interface/WndField.cpp:8433-9178`,
`_Interface/WndTradeCtrl.cpp`. Packets: `Neuz/DPClient.cpp:2517-2849, 9411-9469`. Shared trade state: `CVTInfo`
(`_Common/Mover.h:345-385`, `_Common/MoverItem.cpp:14-532`).

## 2. How a trade starts

1. **The menu.** Right-click on a player within 20 m opens the mover menu (`CWndWorld`, `_Interface/WndWorld.cpp:6520-6527`,
   `fDistSq < 20.0f * 20.0f`). For a player without an open vendor the first line is `MMI_TRADE` "Trade"
   (`TID_MMI_TRADE`, :6552), then Add to my list, Invite to party. The wiki's 2010 screenshot shows the same order.
2. **Checks before asking** (`MMI_TRADE`, `WndWorld.cpp:5251-5358`). Each one puts a line in the chat and stops:
   - common bank open: `TID_GAME_BANKTRADESELF` "You cannot trade while using the bank." (red);
   - mail window open: `TID_MAIL_OTHERWORK` "Not available";
   - bank confirm / guild bank / bank password open: `TID_GAME_BANKSTILLUSING` "You are already using the bank.";
   - beauty shops, summon angel, repair window: their "already using" texts;
   - `APP_CONFIRM_TRADE` or `APP_TRADE` already open: `TID_GAME_YETTRADE` "That player is currently busy. Please try
     again after few minutes." (red, :5323-5338).
   Then, for a player: `SendConfirmTrade( pFocusMover )` and the chat line `TID_GAME_TRADEREQUEST` "You have offered to
   trade with %s." (:5352-5356).
3. **The server** (`WORLDSERVER/DPSrvr.cpp:6460-6511`, `OnConfirmTrade`): nothing if the asker is already trading; in the
   Guild Siege arena (and 1:1 guild combat) the asker gets `TID_GAME_GUILDCOMBAT_CANNOT_TRADE` (the English file says "You
   can trade in the Guild Siege arena.", a mistranslation kept as it is); nothing if either side duels; if the asked
   player is in attack mode the asker gets `TID_GAME_BATTLE_NOTTRADE` "You cannot trade while dueling."; otherwise the
   asked player gets `SNAPSHOTTYPE_CONFIRMTRADE` with the asker's object id. Asking also removes the asker's
   invisibility. (The `__BB_STAFF_MODERATOR_AUTH` check is a custom server feature; the client does nothing for it.)
4. **The asked side** (`Neuz/DPClient.cpp:2546-2602`, `OnConfirmTrade`) refuses on its own, through `SendBlock( nGu,
   myName, askerName )` (:11155-11162), when:
   - the "Refuse Trade" option is on (`g_Option.m_bTrade == FALSE`): nGu 3;
   - the repair window is open: nGu 4;
   - a trade or a trade request is already open: nGu 5;
   - the guild bank or the summon-angel window is open: nGu 8.
   The server passes the block through the core server back to the asker (`DPSrvr.cpp:2859-2879`), whose
   `CDPClient::OnBlock` (`DPClient.cpp:8336-8392`) prints: 3 `TID_GAME_TRADEDENY` "%s is in the 'Refuse Trade' setting.",
   4 `TID_GAME_REPAIR_NOTTRADE` "You cannot trade with %s while the player is repairing an item.", 5 `TID_GAME_YETTRADE`,
   8 `TID_GAME_TRADELIMITPC` "You cannot trade with another player while vending.".
   Otherwise it opens `CWndConfirmTrade` (:2598-2600): centred, 70 px from the top (`WndField.cpp:8823-8831`), title
   "Trade", line 1 `TID_GAME_FROM` "%s wants to trade." (WIDC_STATIC2, :8811-8819), line 2 "Would you like to trade?"
   (resdata WIDC_STATIC1), OK and Cancel.
5. **The answer** (`WndField.cpp:8854-8873`): OK sends `PACKETTYPE_TRADE` with the asker's object id (`SendTrade`,
   `DPClient.cpp:9411-9419`). Cancel or the close box sends `PACKETTYPE_CONFIRMTRADECANCEL` with the asker's id; the
   server forwards `SNAPSHOTTYPE_CONFIRMTRADECANCEL` to the asker (`DPSrvr.cpp:6513-6521`), who prints
   `TID_GAME_TRADECANCEL` "The trade has been cancelled." (red, `DPClient.cpp:2604-2607`).
6. **Opening** (`DPSrvr.cpp:6397-6458`, `OnTrade`): if neither side is trading, duelling or vending, and neither has the
   bank or guild bank open (else `TID_GAME_TRADELIMITPC` to the one who accepted), the server links the two and sends
   both `SNAPSHOTTYPE_TRADE` (`User.cpp:798-808`): the other player's object id as the snapshot's id, the accepting
   player's `idPlayer`, then **the other player's whole inventory** (`CItemContainer::Serialize`). Each client keeps that
   inventory to show the other side's items (`DPClient.cpp:2517-2544`), sets the partner, and opens the inventory and the
   trade window.
7. **The trade window opens** (`WndField.cpp:9005-9049`) at the right edge, 110 px down, then is centred on the screen.
   The gold-clear button (`WIDC_CLEAR`) is hidden (`__CSC_VER11_1`, :9031-9038). The extra-pocket window closes. If a web
   box, NPC shop, bank, guild bank or vendor window is open, the trade window closes itself at once (:9043-9047), which
   cancels the trade (its destructor sends `PACKETTYPE_TRADECANCEL`, :8958-8962).

The task-bar "Trade" applet (`Icon_Trade.dds`, `FuncApplet.cpp:220`) sends `PACKETTYPE_TRADE` straight to the selected
player (`WndTaskBar.cpp:1411`); it is only reachable from an old saved shortcut. Not ported.

## 3. The trade window

Layout (`resdata.inc:21942-22004`, client coordinates):

| Control | Picture | Rect | Use |
|---|---|---|---|
| `WIDC_STATIC1` | | 10,10 - 114,30 | the other player's name |
| `WIDC_STATIC2` | | 228,10 - 328,30 | my name |
| grid "You" (10001) | | 5,40 - 170,205 (`WndField.cpp:9007`) | the other's 25 slots |
| grid "I" (10002) | | 175,40 - 340,205 (:9008) | my 25 slots |
| `WIDC_STATIC3` | | 64,208 - 162,228 | the other's penya |
| `WIDC_STATIC4` | | 230,208 - 328,228 | my penya |
| `WIDC_CLEAR` | `ButtClearGold.tga` | 308,208 - 335,228 | hidden in V15 |
| `WIDC_OK_YOU` | `ButtOk.tga` | 20,232 - 92,252 | the other's OK, never clickable by me |
| `WIDC_CANCEL` | `ButtCancel.tga` | 136,232 - 208,252 | cancel |
| `WIDC_OK_I` | `ButtOk.tga` | 248,232 - 320,252 | my OK |

- Title "Trade" (`IDS_RESDATA_INC_002586`). The "penya" labels and the name / penya boxes are painted in
  `WndTrade.tga` itself (wiki screenshot `Trading_Window.jpg`).
- Each grid (`WndTradeCtrl.cpp:48-94`): `MAX_TRADE` 25 (`_Common/ProjectCmn.h:11`) slots, 5 a row, 32 px apart,
  inside the control's rect deflated by 3 (`SetWndRect`, :199-206). An expired item is drawn tinted red; a stackable
  item (`dwPackMax > 1`) shows the traded count at the bottom right in blue `0xff1010ff`; the tooltip is the normal item
  tooltip. No frame is drawn (`WBS_NODRAWFRAME`).
- Names: the other's `GetName( TRUE )`, mine `GetName()` (:8964-8977). Penya: a plain number with a comma every three
  digits (:8979-8998).
- The OK buttons are check buttons: when a side's OK arrives it is checked and disabled.

## 4. Putting things in

- **Items, by drag only.** Dropping an inventory item on a grid (`CWndTradeCtrl::OnDropIcon`, `WndTradeCtrl.cpp:108-174`):
  - nothing while the quantity box is open (:110-112);
  - an expired item is refused (:131-135);
  - an item with `m_nItemNum > 1` asks the quantity first, if the slot under the pointer is free (:138-160);
  - else, the first slot under the pointer that is free sends `PACKETTYPE_TRADEPUT` `( slot, type 0, objectId, 1 )`
    (:163-172).
  - Both grids accept a drop, and the free-slot test reads the grid the item fell on (`m_pMover`), while the server puts
    the item in *my* slot. Dropping on my own grid is the normal case; the port takes drops on my grid only.
  - There is no way to take an item back out: `SendTradePull` exists (`DPClient.cpp:9445-9450`) but nothing calls it.
- **The quantity box** (`CWndTradeGold`, `WndField.cpp:8433-8541`, opened by `CWndTrade::OnChildNotify` :9064-9118):
  modal, centred, title "Item", text `TID_GAME_MOVECOUNT` "Move how many items?", label `TID_GAME_NUMCOUNT` "Number:", an
  edit box preset to the whole stack, OK (default, Enter) and Cancel. OK: the number (`_ttoi`) is raised to 1 and cut to
  the stack, then `TRADEPUT( slot, 0, objectId, n )`. The box closes itself if the item gets into the trade meanwhile
  (`Process`, :8444-8455).
- **Penya.** Dragging the penya sack of the inventory (a shortcut with `m_dwData == 0`, `CWndGold`, :490-500) onto a grid
  opens the same box titled "Penya", text `TID_GAME_MOVEPENYA` "How many do you want to move?", label
  `TID_GAME_PENYACOUNT` "Penya:", preset to all my penya — **only while my penya in the trade is 0** (:9087-9103); a
  second drop does nothing. OK: the number, at least 1, at most my penya, is sent as `PACKETTYPE_TRADEPUTGOLD` if above
  0 (:8515-8527). The server takes it from the inventory penya (`DPSrvr.cpp:6607-6643`) and both clients show it; my
  client takes it off my penya (`DPClient.cpp:2644-2669`).
- **Server checks on an item** (`CVTInfo::TradeSetItem2`, `MoverItem.cpp:217-247`), answered by `DEFINEDTEXT`:
  - already in the trade or the slot taken, equipped, a quest item (`IK3_QUEST`), bound (`IsBinds`: a keep time unless a
    warp item, `IP_FLAG_BINDS`, the binds flag, a blessing / eat-pet random option, a level-down), a guild cloak, a
    vagrant's ride: `TID_GAME_CANNOTTRADE_ITEM` "This item cannot be traded.";
  - the summoned pet or the active eat-pet: `TID_GAME_CANNOT_DO_USINGITEM` "You are already using that item";
  - the count is raised to 1 and cut to the stack.
  The server answers a good put with `SNAPSHOTTYPE_TRADEPUT` to both (`DPSrvr.cpp:6523-6571`). After an OK it answers
  `SNAPSHOTTYPE_TRADEPUTERROR`, a message box `TID_DIAG_0054` "You cannot add into or remove items from the trading window
  anymore after the first confirmation." (`DPClient.cpp:2625-2629`).
- **While trading, the inventory**: an item in the trade is drawn faded (alpha 60) and shows its count minus the traded
  count; it cannot be picked up (`WndItemCtrl.cpp:690-711, 809-820`). Using an item or moving it inside the inventory
  prints `TID_GAME_TRADELIMITUSING` "You cannot use items while trading." (`WndField.cpp:2541-2547, 2862-2876`).

## 5. OK, then the final confirm

`CVTInfo` has three steps (`Mover.h:187-192`): ITEM, OK, CONFIRM.

1. **OK** (`WIDC_OK_I`, `WndField.cpp:9124-9127`) sends `PACKETTYPE_TRADEOK`. The server (`DPSrvr.cpp:6738-6764`) moves me
   to OK. If the other is not at OK yet, both get `SNAPSHOTTYPE_TRADEOK` with my id: my OK button is checked and
   disabled; on the other side the "You" OK is checked and the chat says `TID_GAME_TRADEACCPET` "%s has completed the
   trade." (green-white `0xffccffcc`, `DPClient.cpp:2795-2819`).
2. When the second player presses OK both get `SNAPSHOTTYPE_TRADELASTCONFIRM`: both OK buttons checked, and
   `CWndTradeConfirm` opens (`DPClient.cpp:2837-2852`): title "Confirm Trade", `TID_DIAG_0083` "Do you accept the trade?",
   Yes and No, centred on its parent (`WndField.cpp:8890-8906`). While it is open the trade window ignores its buttons
   and drops (:9061-9065).
3. **Yes** sends `PACKETTYPE_TRADECONFIRM` (:8928-8945). The first to answer: both get `SNAPSHOTTYPE_TRADELASTCONFIRMOK`
   with that player's id (`DPSrvr.cpp:6686-6705`). On that player's side the box says `TID_GAME_WAITCOMFIRM` "You need to
   wait for approval." and its buttons hide (`bMsg`, `DPClient.cpp:2765-2784`); the other side's chat says
   `TID_GAME_FINALCOMFIRM` "%s pushed final confirmation." (:2785-2791).
4. The second Yes runs the exchange on the server (`CVTInfo::TradeLastConfirm`, `MoverItem.cpp:351-518`): it fails if a
   side's penya would overflow, or a side has fewer free bag slots than the number of item slots it receives; then both
   get `SNAPSHOTTYPE_TRADECANCEL` (id `NULL_ID`, mode 0) and the trade is cancelled. On success both get
   `SNAPSHOTTYPE_TRADECONSENT`.
5. **Consent on the client** (`DPClient.cpp:2821-2835`, `CVTInfo::TradeConsent`, `MoverItem.cpp:132-215`): the server
   sends no inventory, so each client moves the items itself, in this order:
   - my traded items: a stack loses the traded count (the item goes if none is left), a single item goes; the traded
     parts gather in a 25-slot temporary container (`CItemContainer::Add`, so equal stacks merge);
   - the other's traded items are added to my inventory with `CItemContainer::Add` (`Item.h:660-759`): first onto my
     stacks of the same item id, flag and charged state that are not full, in bag order, then into the first empty bag
     slot (the slot's object keeps its id); the other's inventory loses them the same way;
   - the temporary container goes into the other's inventory;
   - penya: I get the other's trade penya, the other gets mine.
   Then the trade window and the confirm box close.
   The server does the same moves (`TradeLastConfirm`), so the two inventories stay the same.

## 6. Cancelling, and what ends a trade

- **Cancel / close box** on the trade window, or **No / close box** on the confirm box: `PACKETTYPE_TRADECANCEL` with mode
  0 (`WndField.cpp:9128-9131, 8935-8938`). The window stays until the answer. The server clears both sides (the trade
  penya goes back to each inventory and its new total is sent) and sends both `SNAPSHOTTYPE_TRADECANCEL` with the
  canceller's `idPlayer` and the mode (`DPSrvr.cpp:6664-6684`). Each client (`DPClient.cpp:2729-2763`) clears the trade,
  closes the trade window, and opens a message box: mode 0 `TID_DIAG_0003` "The trade has been cancelled." (and closes
  the confirm box); mode 1, if someone else cancelled, `TID_DIAG_0002` "In 'Refuse Trade' setting.". Nothing in Neuz
  sends mode 1.
- **The trade window's destructor always sends `PACKETTYPE_TRADECANCEL`** (`WndField.cpp:8958-8962`), also after a
  consent or a cancel; the server ignores it then, since neither side has a partner.
- **The partner leaves** (logs out, teleports, moves out of sight): the server clears both sides without a packet
  (`CMover::OnTradeRemoveUser`, `MoverParam.cpp:3702-3716`, from `CUserMng::RemoveUser`, `User.cpp:3920-3932`). The
  client sees the partner's `DEL_OBJ` and closes the trade window, the confirm boxes and the quantity box
  (`DPClient.cpp:1676-1708`), with no message.
- **Distance**: no check during a trade, on either side. Only the menu needs 20 m; the trade lasts while both are in the
  same world (`pTrader->GetWorld() == pWorld` in each handler).
- **Death**: no trade check. A dead player keeps trading (`GetSummonState` lists trading and dying apart,
  `MoverParam.cpp:313-330`).
- **Full inventory**: checked only at the final confirm (step 5.4): the trade is cancelled with "The trade has been
  cancelled.".
- **Opening a vendor** clears the trade (`DPSrvr.cpp:6900-6916`); vendors are out of scope.
- **Blocked while trading** on the server (each returns quietly when the player has a partner): the guild bank, the bank,
  piercing, enchanting, a duel request and others (`DPSrvr.cpp:1079, 1885, 2945, 3207, 3489, 3548, 5005, 10289, 12154`).

## 7. Packets

Client to world (`_Network/MsgHdr.h:155-164, 355`; senders `DPClient.cpp:9411-9469, 2693-2696, 11155-11162`; all start
with `DPID_UNKNOWN` and the type):

| Packet | Type | Body |
|---|---|---|
| `CONFIRMTRADE` | 0x00ff00a7 | `OBJID` the asked player |
| `CONFIRMTRADECANCEL` | 0x00ff00a8 | `OBJID` the asker |
| `TRADE` | 0x00ff00a0 | `OBJID` the asker (accepting) |
| `TRADEPUT` | 0x00ff00a1 | `BYTE slot, BYTE itemType, BYTE objectId, short count` |
| `TRADEPULL` | 0x00ff00a2 | `BYTE slot` (unused) |
| `TRADEOK` | 0x00ff00a3 | nothing |
| `TRADECANCEL` | 0x00ff00a4 | `int mode` |
| `TRADEPUTGOLD` | 0x00ff00a5 | `DWORD penya` |
| `TRADECONFIRM` | 0x00ff002f | nothing |
| `BLOCK` | 0xffffff5a | `BYTE gu, string myName, string askerName` |

World to client, in the snapshot (`MsgHdr.h:887-936`; handlers `DPClient.cpp:501-513, 626`; senders `User.cpp:798-908`):

| Snapshot | Type | Object id | Body |
|---|---|---|---|
| `TRADEPUTERROR` | 0x0005 | me | nothing |
| `TRADE` | 0x0007 | the partner | `u_long idPlayer` of the accepting player, then the partner's `CItemContainer` (73 index DWORDs, a BYTE count, `count x (BYTE objectId, CItemElem)`, 73 object-index DWORDs) |
| `TRADEPUT` | 0x0008 | who put | `BYTE slot, BYTE itemType, BYTE objectId, short count` |
| `TRADEPULL` | 0x0009 | who pulled | `BYTE slot` |
| `TRADEOK` | 0x000a | who pressed | nothing |
| `TRADECANCEL` | 0x000b | who cancelled, or `NULL_ID` | `u_long idPlayer, int mode` |
| `TRADECONSENT` | 0x000c | me | nothing |
| `TRADEPUTGOLD` | 0x0020 | who put | `DWORD penya` |
| `CONFIRMTRADE` | 0x0022 | the asker | nothing |
| `CONFIRMTRADECANCEL` | 0x0023 | the asked | nothing |
| `TRADELASTCONFIRM` | 0x002b | me | nothing |
| `TRADELASTCONFIRMOK` | 0x002c | who pressed Yes | nothing |

`BLOCK` comes back as a direct packet `PACKETTYPE_BLOCK` (`DPClient.cpp:210, 8336-8392`): `BYTE gu, string name`.
`TRADECLEARGOLD` (0x0021 / 0x00ff00a6) is commented out on both sides (raiders.2006.11.28) and not ported.

## 8. Resources

- Windows: `resdata.inc:21942` (APP_TRADE), `:28047` (APP_CONFIRM_TRADE), `:2024` (APP_TRADE_CONFIRM), `:11228`
  (APP_TRADE_GOLD); strings `resData.txt.txt` `IDS_RESDATA_INC_002586`, `003590-003597`, `000306-000311`,
  `001080-001091`.
- Pictures (`Client/Theme/Default/`): `WndTrade.tga` (the window), `ButtOk.tga`, `ButtCancel.tga`, `ButtYes.tga`,
  `ButtNo.tga`, `ButtClearGold.tga` (hidden), `WndTile06/08/09.tga`, `WndEditTile00.tga`. Only `WndTrade.tga` and
  `ButtClearGold.tga` are new to FlyffWeb.
- Texts (`textClient.inc` / `textClient.txt.txt`, with colours):

| Id | English | Colour |
|---|---|---|
| `TID_MMI_TRADE` | Trade | |
| `TID_GAME_TRADEREQUEST` | You have offered to trade with %s. | white |
| `TID_GAME_FROM` | %s wants to trade. | |
| `TID_DIAG_0083` | Do you accept the trade? | |
| `TID_GAME_TRADECANCEL` | The trade has been cancelled. | red |
| `TID_DIAG_0003` | The trade has been cancelled. | box |
| `TID_DIAG_0002` | In 'Refuse Trade' setting. | box |
| `TID_DIAG_0054` | You cannot add into or remove items from the trading window anymore after the first confirmation. | box |
| `TID_GAME_TRADEACCPET` | %s has completed the trade. | `0xffccffcc` |
| `TID_GAME_FINALCOMFIRM` | %s pushed final confirmation. | `0xffccffcc` (TRADEACCPET's) |
| `TID_GAME_WAITCOMFIRM` | You need to wait for approval. | |
| `TID_GAME_YETTRADE` | That player is currently busy. Please try again after few minutes. | red |
| `TID_GAME_TRADEDENY` | %s is in the 'Refuse Trade' setting. | white |
| `TID_GAME_REPAIR_NOTTRADE` | You cannot trade with %s while the player is repairing an item. | TRADEDENY's |
| `TID_GAME_TRADELIMITPC` | You cannot trade with another player while vending. | red |
| `TID_GAME_TRADELIMITUSING` | You cannot use items while trading. | red |
| `TID_GAME_CANNOTTRADE_ITEM` | This item cannot be traded. | white |
| `TID_GAME_CANNOT_DO_USINGITEM` | You are already using that item | white |
| `TID_GAME_BATTLE_NOTTRADE` | You cannot trade while dueling. | red |
| `TID_GAME_MOVECOUNT` / `TID_GAME_NUMCOUNT` | Move how many items? / Number: | |
| `TID_GAME_MOVEPENYA` / `TID_GAME_PENYACOUNT` | How many do you want to move? / Penya: | |

## 9. Online

A 2010 copy of the official Gala wiki (`flyff-wiki.gpotato.com.br/wiki/Trading`, last edited 24 Sep 2010) matches the code:
- the right-click menu starts with "Trade" (`Trade_target_player.jpg`);
- the window shows the two names, two item areas without grid lines, "penya" boxes with comma groups, and Ok / Cancel /
  Ok; the arrows show your own side on the right (`Trading_Window.jpg`);
- both players must click OK, then a "Confirm Trade" box asks "Do you accept the trade?" with Yes / No;
- a stack opens "Item" / "Move how many items?" / "Number:"; dragging the penya sack opens "Penya" / "Penya:";
- event items cannot be traded; penya is capped at 2.1 billion.
The wiki says nothing about distance, death or logout; the code (section 6) does. Flyff Universe's newer trade (levels,
list mode) is a different game and was ignored. The fandom wiki, archive.org, RaGEZONE and elitepvpers could not be read.

## 10. FlyffWeb today (main a133cf5)

What exists (paths under `apps/client/src/world/` unless said):
- **The player menu**: `party/playerMenu.ts:28-39` lists `[2, 'Trade']` first but greyed (`enabled` only for invite and
  messenger, :37); `menuInReach` is the 20 m check (:42-45, `MENU_RANGE` in `hud/moverMenu.ts:51`).
  `WorldScreen.pressPlayer` (:2998) opens it; `choosePlayerEntry` (:3014) handles add-to-list and invite.
- **The bag** (`hud/inventoryWindow.ts`): HTML drag and drop with `application/x-flyff-inventory` and the object id
  (:205-212); other windows take the drop by that type (`items/itemWindowFlows.ts:522-532`, `pets/petTamerWindows.ts:322`).
  A held item (`SetExtra`) is faded and not dragged nor used: `WorldScreen.reserveItem` / `bagHeld` / `bagReserved`
  (:411, :1779, :1863), and the count shown is the count less `reservedCount`. On the phone there is no drag: a tap
  selects and shows Equip / Use / Drop; the shop puts the bag in a tap-to-pick mode (`shopSelect`, :193). The penya is a
  plain line at the bag's foot (:264), not draggable.
- **Number input**: no `CWndTradeGold`. The bag's drop box and the shop use `<input type=number>`; `upgradeNpcWindows.ts`
  and `characterWindow.ts` use `inputMode='numeric'`.
- **Windows**: `hud/resWindow.ts` builds a window from its resdata entry (tiled or one picture, statics, buttons with
  their four-state pictures, edits, customs), centred, modal if asked, scaled to fit on a phone (`mobileScale: 1,
  fitWhole: true`). Layouts are TypeScript constants citing resdata.inc (`items/itemWindowLayouts.ts`).
- **Messages**: `hud/messageBox.ts` (`OpenMessageBox`), `hud.messages.add(text, colour)` (`PutString`), texts from
  `data/texts.json` (`gameData.ts:38`, `texts.get('TID_…')`), `WorldScreen.sayRefusal`.
- **The own inventory** (`OwnState.ts`): `inventory` by object id, `inventorySlots` (`m_apIndex`, 42 bag + 31 parts),
  `gold`. No `CItemContainer::Add`: CREATEITEM brings its slots from the server.
- **Protocol**: the inventory container reader (`packages/protocol/src/world/own.ts:109-216`), the item packets
  (`world/items.ts`), BLOCK both ways (`world/party.ts:174`, `world/playerData.ts:46`), already routed to the party (gu 7)
  and the messenger (gu 1, 2, 6). **No trade packet.**
- **Pictures**: `ButtOk`, `ButtCancel`, `ButtYes`, `ButtNo`, `WndTile06/08/09`, `WndEditTile00` are converted;
  `WndTrade.tga` and `ButtClearGold.tga` are not.
- **Tests**: Playwright `chromium` and `phone` (Pixel 7 landscape, `apps/client/playwright.config.ts:83-84`); the fake
  world (`packages/testkit/src/worldScript.ts`, `apps/client/e2e/worldHarness.ts`); `party.spec.ts` spawns another player
  and opens its menu.

Missing, and built by this work:
1. the trade packets both ways, with testkit writers (§7), and the item container reader exported for TRADE;
2. the menu's Trade line, its checks and the request line (§2.1-2);
3. the asked side's confirm window, its auto-refusals (BLOCK 4, 5, 8) and the BLOCK lines (3, 4, 5, 8) (§2.4-5);
4. the trade window (`APP_TRADE`, §3), the quantity / penya box (`APP_TRADE_GOLD`, §4) and the final confirm box
   (`APP_TRADE_CONFIRM`, §5), as `ResWindow`s from their resdata entries;
5. drops from the bag onto my grid, and the bag's penya as a drag source on the desktop (`CWndGold`);
6. the items in the trade held in the bag (faded, count less the traded count) and "You cannot use items while trading";
7. `CItemContainer::Add` and `CVTInfo::TradeConsent` on the own inventory (§5.5), and the penya moves;
8. the ends: the cancel answers, the partner's DEL_OBJ, the put error;
9. the phone: tap instead of drag, a number box with the phone's number keyboard, 14 px text.

Left out: personal shops (vendors), the "Refuse Trade" option (FlyffWeb's options have none; trade requests are always
shown, as with Neuz's default `m_bTrade = TRUE`, `HwOption.cpp:187`), the task-bar Trade applet, `TRADEPULL` (Neuz never
sends it) and the checks for windows FlyffWeb does not have (bank, guild bank, mail, beauty shops, repair, summon angel,
web box).
