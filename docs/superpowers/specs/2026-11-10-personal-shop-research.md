# Personal shop (private shop, "vendor") in Neuz V15: research (2026-11-10)

The player's own shop: a player puts bag items up for sale with a price, opens the shop under a name, and other players
buy from it. Not the NPC shops (`CWndShop`). Source: `Source/` (CP949, read with `iconv -f cp949 -t utf-8`),
`Resource/resdata.inc`, `Resource/textClient.inc` (texts as converted in `data/texts.json`). `__VER` is 15
(`Neuz/VersionCommon.h:4`), so every `#if __VER >= 8 / 11` branch below is the one in use (`__S8_VENDOR_REVISION`,
`__MOD_VENDOR`, `__ADD_ZOOMOPT` are labels of those `__VER` gates, not defines). `__RULE_0615` (`:48`), `__VENDOR_1106`
(`:95`), `__FIX_WND_1109` (`:22`) and `__S_SERVER_UNIFY` (`:26`) are on; `__CSC_VER12_1` is a `__VER >= 12` gate, so on too.

Short names: **DPC** = `Neuz/DPClient.cpp`, **WV** = `_Interface/WndVendor.cpp`, **WVC** = `_Interface/WndVendorCtrl.cpp`,
**WVB** = `_Interface/WndVendorBuy.cpp`, **WRV** = `_Interface/WndRegVend.cpp`, **WW** = `_Interface/WndWorld.cpp`,
**SRV** = `WORLDSERVER/DPSrvr.cpp`, **USR** = `WORLDSERVER/User.cpp`, **MI** = `_Common/MoverItem.cpp`.

## 1. The pieces

| Class | Window id | resdata.inc | What it is |
|---|---|---|---|
| `CWndVendor` | `APP_VENDOR_REVISION` | :3716, `WndTile00.tga` tiled, 448 x 464, "Private Shop" | the shop: the seller's set-up and the buyer's view, one class |
| `CWndVendorCtrl` | child id 100 | made in code, `CRect( 5, 60, 440, 460 )` (WV:82) | the 20 slots, 2 columns x 10 rows |
| `CWndRegVend` | `APP_VENDOREX_SELL` | :12278, 304 x 160, "Sell Item Registration" | the seller's quantity and unit price keypad |
| `CWndVendorBuy` | `APP_VENDOREX_BUY` | :12977, 304 x 160, "Buy Item" | the buyer's quantity keypad |
| `CWndVendorConfirm` | a `CWndMessageBox` (OK/Cancel) | WV:767-810 | "Will you open your shop?" / "Will you close your shop?" |
| `CWndVendorMessage` | `APP_VENDOREX_CHAT` | :12533, `WndTile02.tga`, 448 x 320, "Chatting" | the shop's chat room; the seller's "Information" tab |
| `CVTInfo` (vendor part) | — | MI:530-702 | the shop's state on each mover: title, 30 item pointers, the partner |
| `CDialogMsg::AddVendorMessage` | — | `_Common/DialogMsg.cpp:930-998`, drawn :630-716 | the title balloon over the seller |

Constants (`_Common/ProjectCmn.h`): `MAX_VENDITEM` 30 (:12, the server's array), `MAX_VENDOR_REVISION` 20 (:41, the
slots the V8+ window shows and the server accepts, SRV:7083-7084), `MAX_VENDORNAME` 48 (:14).

`IsVendorOpen()` is "the title is not empty" (MI:57-60). `VendorIsVendor()` is "an item is registered" (MI:614-623): a
seller is a "vendor" from the first item put up, before the shop opens.

## 2. The seller

### 2.1 Opening the window

- **Start menu → "Private Shop"** (`TID_APP_VENDOR`), after Inventory / Bag / Housing and before Skill
  (`_Interface/WndTaskBar.cpp:2612-2613`). The applet `APP_VENDOR_REVISION` (`_Interface/FuncApplet.cpp:223`,
  `Icon_Applet.dds`, tip `TID_TIP_VENDOR` "Allows you to open a Private Shop."). With the interface option 2 it has no
  hot key (`WndManager.cpp:2445-2449`); otherwise none is listed either. A slot on the task bar can hold the applet.
- **No licence item.** A Taiwan-only check for `II_SYS_SYS_SCR_VENDOR` is commented out (SRV:6791-6800). Anyone can.
- From the task bar, with the Summon Angel window open: `TID_GAME_SUMMONANGELUSING` and no window
  (`WndManager.cpp:2686-2695`).
- `CWndVendor::Initialize` refuses (no window, no message) during the school event, with a trade, NPC shop, bank or guild
  bank window open, or in a duel (WV:199-213). `OnInitialUpdate` closes it again in community mode, with those windows,
  without "all action" (`__S_SERVER_UNIFY`), and for a chaotic player whose propensity forbids vending
  (`TID_GAME_CHAOTIC_NOT_VENDOR` "A character with a bad Disposition cannot open a private shop.", WV:87-123). It also
  closes the extra bag (`APP_BAG_EX`, WV:95-97).
- The inventory opens with it, and the shop sits right beside it: to its left if the bag is on the right half of the
  screen, else to its right (WV:135-144).
- The title is "Private Shop" (`TID_GAME_VENDOR_TITLE`, WV:81).

### 2.2 The window (APP_VENDOR_REVISION, resdata.inc:3716-3880)

| Control | Rect (client) | What |
|---|---|---|
| `WIDC_STATIC3` group | 6,8 - 86,24 `WndEditTile200` | "Shop Name" |
| `WIDC_EDIT1` | 86,8 - 286,28 `WndEditTile00` | the shop's name |
| `WIDC_OK` | 288,8 - 360,28 `ButtOk.tga` | open the shop |
| `WIDC_CANCEL` | 360,8 - 432,28 `ButtCancel.tga` | close |
| `WIDC_STATIC1` group | 6,38 - 288,54 `WndEditTile200` | "Sale List" |
| `WIDC_RESET` | 288,36 - 360,56 `ButtReset.BMP` | take every item off |
| `WIDC_CHAT` | 360,36 - 432,56 `ButtChat.BMP` | the chat room |
| `WIDC_EDIT2`..`EDIT21` | 8,66 - 208,98 / 228,66 - 428,100, then every 36 px down to 8,392 - 208,424 / 228,392 - 428,424 | the 20 slots' boxes (disabled edits used as backgrounds) |

The slots (`CWndVendorCtrl::OnDraw`, WVC:157-233): slot `i` is column `i % 2`, row `i / 2`; its icon at
x = 15 (column 0) or 235 (column 1), y = row * 36 + 8, in the control at (5, 60). Hit test is the 32 x 32 icon (WVC:508-541);
the drop test and hover rect are 180 x 32 (WVC:182, :335). Each filled slot draws:
- the icon (1.15x while hovered; red-tinted when expired);
- the name at (+50, +3) in black, with " +N" for an upgraded item, cut to 108 px with "..." (WVC:79-132);
- the price at (+50, +17), with thousands separators (`GetNumberFormatEx`; the Korean format only for `LANG_KOR`), coloured
  by size: ≥1,000,000,000 0xff990099, ≥100,000,000 0xffCC0303, ≥10,000,000 0xffFF6600, ≥1,000,000 0xff3333FF,
  ≥100,000 0xff009900, else black (WVC:134-154);
- the count, for items that stack (`dwPackMax > 1`), at the icon's bottom right in 0xff1010ff (WVC:222-230);
- while an item is carried over a slot: `WndPosMark.tga` on it (WVC:184-193);
- the tooltip of `APP_VENDOR`: the item's tooltip plus `TID_GAME_TOOLTIP_SHELLCOST2` with the price
  (`WndManager.cpp:5809-5822`).

### 2.3 Putting an item up

1. Drag a bag item onto an **empty** slot (`CWndVendorCtrl::OnDropIcon`, WVC:300-353): the slot index + 100 goes to the
   parent (`OnChildNotify` 100, WV:244-305).
2. Refused silently: not from the inventory; a quest item; a guild cloak (`IK3_CLOAK` with `m_idGuild`); an expired item;
   a slot already filled; an item already held (`IsUsingItem`: `m_nExtra > 0`); someone else's shop; the shop already open
   (WV:250-300).
3. Else **`CWndRegVend`** opens (WV:296-299; WRV:32-58, :68-98), centred on the shop (`MoveParentCenter`):
   - "Quantity" `WIDC_SELLNUM` starts at the stack's count; "Unit Price" `WIDC_SELLPRI` at 0. The keypad types into the
     focused one; the focus starts on Quantity, or on Price for a single item (WRV:39-53). A click on either picks it
     (WRV:115-136); `WndVenderArrowEx.tga` marks the focused one 4 px up-left of it (WRV:60-66, :72-91).
   - Keypad (resdata.inc:12278-): `ButItemNum0..9`, `ButItemNum00`, `ButItemNum000` (refused on "0", and when the result
     would pass 9 digits), `ButItemMin` (1), `ButItemMax` (the stack's count for Quantity, 2,100,000,000 for the price),
     and a small calculator `+ - * / =` (WRV:142-270, :383-500). Typed digits and Backspace work the same (`OnChar`);
     Escape clears to 0; more than 10 digits are ignored (WRV:489-495). While a keypad window is open, Escape does not
     close other windows (`WndManager.cpp:3286-3292`).
   - **OK** or Enter (WRV:272-349): count < 1 → nothing; count > stack → the stack; price parsed as 64-bit and capped at
     `INT_MAX`; price < 1 → nothing. Then the gold check: bag penya + Σ(price × count of what is up) + this price × count
     must be > 0, < 2,100,000,000 and grow; else the box `TID_GAME_VENDOR_MAX_ALL_GOLD` ("The amount of Penya in your
     inventory and the price of what you are selling cannot exceed 2,100,000,000."). Then
     **`SendRegisterPVendorItem( slot, 0, objId, count, price )`** and the keypad closes.
4. The server answers **REGISTER_PVENDOR_ITEM** to the seller only (USR:931-938); `VendorSetItem` points the slot at the
   bag item, `SetExtra( count )`, `m_nCost = price` (MI:552-561). The bag item is now "in use": faded, not draggable, its
   count shown less the held count (`WndItemCtrl.cpp:474-487, :532-533`).
5. **Right-click a slot** (seller): `SendUnregisterPVendorItem( slot )` (WVC:419-435); the server refuses once open
   (SRV:7066-7068). **Reset** sends it for each filled slot and empties the saved list (WV:439-461); Reset is hidden while
   the own shop is open (WV:186-197).

### 2.4 Naming and opening

**OK** (WV:308-379), in order:
1. flying → nothing; no item registered → nothing;
2. the name trimmed; the gold check of §2.3 again (box `TID_GAME_VENDOR_MAX_ALL_GOLD`);
3. `IsInvalidName` (a word of `InvalidName_ENG.inc` inside, lower case) or not `IsAllowedLetter( name, TRUE )` → box
   `TID_DIAG_0020` "Character name is not allowed." (`_Common/ProjectCmn.cpp:787-803, :845-873`). The vendor letter set is
   `Letter2_<lang>.inc` (`__VENDOR_1106`, :807-841); English has none, so every letter passes;
4. `WordChange` (the chat's word filter, `WndManager.cpp:3723-3795`);
5. length (bytes) < 6 or > 32 → box `TID_DIAG_0011` "The name must be 6 to 18 characters long." (`__RULE_0615`, the text
   says 18; the rule is 32);
6. **`CWndVendorConfirm`**: "Will you open your shop?" (`TID_GAME_VENDOR_START`), OK/Cancel; OK hides itself while asked.
   Its OK sends **`SendPVendorOpen( name )`**; Cancel shows OK again (WV:780-809).

The server (`OnPVendorOpen`, SRV:6772-6883): drops a body over 55 bytes; `__RULE_0615` only says `TID_DIAG_0020` for a
bad name and goes on; strips colour codes unless the player has the font-edit scroll buff (`II_SYS_SYS_SCR_FONTEDIT`);
refuses in the guild siege arena and the 1:1 guild combat (`TID_GAME_GUILDCOMBAT_CANNOT_TRADE`), the mini room, during a
trade, a duel, attack mode, flight (silently), a chaotic player (`TID_GAME_CHAOTIC_NOT_VENDOR`) and without all action.
Then, with an item up, it makes the chat room, sends **PVENDOR_OPEN** to everyone in range (USR:5406-5416) and
CHATTING_NEWCHATTING to the seller. (`BB_STAFF_MODERATOR_AUTH` is a custom server rule, not Neuz's: left out.)

`OnPVendorOpen` on each client (DPC:13798-13844): the title is set (so `IsVendorOpen`), the balloon added; for the seller,
the name field is disabled, ENTERCHTTING is sent, the chat window opens (owner, with the Information tab) and the shop
window comes back in front, and the shop's title becomes "Private Shop(Shop is opening)" (`TID_GAME_VENDOR_TITLE` +
`TID_GAME_VENDOR_TITLE0`).

### 2.5 While the shop is up

- The character **does not sit or change motion**: nothing in the open path plays a motion. It stays as it was; a player
  can sit first (the Motion window, before the shop window opens: motions are refused while it is open,
  `WndManager.cpp:2924-2928`).
- From the first item registered (`VendorIsVendor`): no movement keys (`WndWorldControlPlayer.cpp:30`), no clicks in the
  world (WW:6721-6722, :11495-11496), no right clicks (WW:7157-7158), no item or skill shortcuts (`WndManager.cpp:2726,
  :2781`), the world cursor "no" (WW:2629). With the shop window open, no world clicks either (WW:6727-6728).
- No balloon for its chat lines (`WndManager.cpp:4097-4098`); others cannot attack it unless forced or PK (`Mover.cpp:6689`).
- When the seller is hit, the shop window and the bag close (DPC:1795-1812), which closes the shop (§2.6).
- **Selling while away**: V15 has no offline shop. The shop lives while the seller is logged in **and** the window is open.
  The player may stay away from the keyboard; a log-out removes the mover and the shop.

### 2.6 Closing

- **Cancel** or the close button while open: "Will you close your shop?" (`TID_GAME_VENDOR_STOP`); OK destroys the window
  (WV:380-392, :789-790). Not open: the window just closes.
- **`OnDestroy`** (WV:483-505): the registered list (object id, count, price, item id) is saved in `g_Neuz.m_aSavedInven`,
  and **`SendPVendorClose( own id )`**. The server (`ClosePVendor`, SRV:6896-6930) clears the items, the trade, sends
  PVENDOR_CLOSE( clear title 1 ) to everyone in range (USR:5418-5428), deletes the chat room (CHATTING_DELETECHATTING to
  its members).
- **`ReloadItemList`** (WV:147-184): the next time the window opens (shop not open), each saved entry whose bag item is
  still there (same object id and item id) is registered again with its count and price, unless the stack shrank below
  the saved count (then the entry is dropped).
- `OnPVendorClose` for the own mover while the shop was open (DPC:13866-13931) reopens the window with the old title
  (line breaks as spaces) when it was closed some other way.

## 3. The buyer

### 3.1 Finding a shop

- The **balloon** over each open shop (`AddVendorMessage`, `_Common/DialogMsg.cpp:930-998`): the title (line breaks as
  spaces) in `m_pFontText`, red or blue at random (`rand() % 2`, :978-983), never expiring. Drawn (:630-716) at the
  mover's bounding box top projected on screen: `texDialogBox_left.tga` at (x - 24, y - 42), `texDialogBox_center.TGA`
  stretched from x + 8 over the text width rounded up to 16, height 32, then `texDialogBox_right.tga`; alpha 200; the text
  at (x + 8, y + 8 - 40) with alpha 250, where x is the projected point less half the balloon's width and y less its
  height. A culled mover has none. It comes with ADD_OBJ when the shop is already open (DPC:1356-1359) and with
  PVENDOR_OPEN; PVENDOR_CLOSE( 1 ) takes it away (DPC:13891-13893).
- The title arrives in **ADD_OBJ** for other players (`METHOD_EXCLUDE_ITEM`: `ReadString( szPVendor, MAX_VENDORNAME )`
  before the worn parts, `_Common/ObjSerializeOpt.cpp:641-646`). There is no separate packet.

### 3.2 Opening it

**Left click on the seller** (`CWndWorld::OnLButtonDown`, WW:7019-7048): another player, shop open, the own partner
empty (`m_vtInfo.GetOther() == NULL`), its distance **from the camera** under 20 (40 with the zoom limit off; on by
default, `HwOption.cpp:261`), and Alt not held. In a safety region it always sends; elsewhere not with Ctrl (Ctrl is the
force attack): **`SendQueryPVendorItem( id )`**. Neuz has no balloon click; the click is on the body.

**Right click on the seller**: the menu has only "View equipment" (`MMI_QUERYEQUIP`, WW:6544-6547): no trade, invite or
add-friend.

The server (`OnQueryPVendorItem`, SRV:7024-7053): not while trading, not flying; the shop open → `SetOther( vendor )` and
**PVENDOR_ITEM** with the chat room's state (USR:949-975). The client (`OnPVendorItem`, DPC:13998-14062): builds copies of
the items with their count and price, sets the partner, opens the shop window (`CreateApplet`), sends ENTERCHTTING, opens
the chat window if the room is open, and `SetVendor( seller )`: the name field shows the title, disabled; OK and Cancel are
hidden (WV:49-69). The bag opens beside it as for the seller.

### 3.3 Buying

- **Double-click a slot** (WVC:442-465, not on the own shop): **`CWndVendorBuy`** opens over the shop
  (WVB:35-67): "Quantity" `WIDC_BUYNUM` starts at **all** the slot holds, "Price" the unit price, "Total Cost" the
  product; keypad 0-9, 00, 000, Min (1), Max (all) (WVB:94-216); a typed count above the slot's is cut to it; Escape → 0.
- **OK** or Enter: count < 1 → nothing; the total over the bag's penya → box `TID_GAME_LACKMONEY` "You do not have enough
  Penya." (WVB:189-204); else **`SendBuyPVendorItem( seller, slot, itemId, count )`** and the keypad closes.
- The server (`OnBuyPVendorItem`, SRV:6963-7022; `VendorSellItem`, MI:637-702): slot < 30, count > 0, the shop open, the
  slot's item the same; the count capped to what is left; money short → `TID_GAME_LACKMONEY`; no room →
  `TID_GAME_LACKSPACE` "Inventory is full. Please make room and try again.."; else the item is made for the buyer, the
  penya moves, **PVENDOR_ITEM_NUM**( slot, left, buyer's name ) goes to the seller and everyone browsing that shop
  (USR:5431-5447), and the seller's bag item is removed (normal item packets).
- `OnPVendorItemNum` (DPC:13963-13996): the slot's count becomes what is left; at 0 the slot empties. The seller's chat
  window, if open, writes in its Information tab `TID_GAME_BUY_INFO` "Character: %s has purchased %s(%d), it is spent %d
  penya." with the buyer, the item's name, the count bought (old count − left) and its total, in blue.

### 3.4 Leaving

The buyer's window closing sends **`SendPVendorClose( seller id )`** (the same `OnDestroy`); the server clears the partner,
answers **PVENDOR_CLOSE( 0 )** to the buyer only (the title stays), and takes the buyer out of the chat room
(CHATTING_REMOVEMEMBER to the others) (SRV:6931-6958). When the seller closes, `OnPVendorClose` closes every buyer's
window (DPC:13850-13864); a seller leaving view (DEL_OBJ) does the same (DPC:1676-1690).

## 4. The shop's chat room (`CWndVendorMessage`, APP_VENDOREX_CHAT)

`resdata.inc:12533`: "Message" static, `WIDC_TABCTRL1` 22,30 - 284,230 with the tabs "Dialog" (`TID_APP_DIALOG`) and, for
the seller, "Information" (`TID_APP_INFOMATION`) (WV:548-569); the "User" list `WIDC_LISTBOX1` 296,24 - 430,236 (every
member's name, WV:526-536); "Input" and the edit 66,252 - 358,270; Send `ButtSend.bmp` 362,240 - 426,280. Placed at the
right of the layout, 110 px down, then centred on the shop (WV:572-576).
- Enter or Send: **`SendChatting( text )`** (under 1020 bytes, WV:611-654). Lines come as CHATTING_CHATTING with the
  speaker's id: "name" + `TID_GAME_FROM3` + " :" then the line on the next row, the own name red, others blue (WV:664-694).
- The seller's Information tab: `TID_GAME_VENCHATIN` "%s has just logged in." / `TID_GAME_VENCHATOUT` "%s has disconnected."
  in red as members come and go (WV:696-765), and the sale lines (§3.3).
- **Chat** button: for the open seller sends **OPENCHATTINGROOM** and opens (or toggles) the window; for a buyer only while
  the room is open (WV:393-437). The seller's close button sends **CLOSECHATTINGROOM** (WV:655-659); the room's state goes
  to the members (CHATTING_CHATTINGROOMSTATE); a closed room closes the buyers' chat windows (DPC:15148-15162).

## 5. Packets

### 5.1 Client → server (`Neuz/DPClient.cpp:13756-13796, 15028-15052`; `_Network/MsgHdr.h:166-171, :528-536`)

| Packet | Type | Fields |
|---|---|---|
| PVENDOR_OPEN | 0x00ff00a9 | `WriteString( name )` |
| PVENDOR_CLOSE | 0x00ff00aa | OBJID vendor (own id for the seller, the seller's for a buyer) |
| REGISTER_PVENDOR_ITEM | 0x00ff00ab | BYTE slot, BYTE type (0), BYTE object id, short count, int price |
| QUERY_PVENDOR_ITEM | 0x00ff00ac | OBJID vendor |
| BUY_PVENDOR_ITEM | 0x00ff00ad | OBJID vendor, BYTE slot, DWORD item id, short count |
| UNREGISTER_PVENDOR_ITEM | 0x00ff00ae | BYTE slot |
| ENTERCHTTING | 0xf000b054 | u_long room (the seller's player id) |
| CHATTING | 0xf000b055 | `WriteString( text )` |
| OPENCHATTINGROOM | 0xf000b058 | — |
| CLOSECHATTINGROOM | 0xf000b059 | — |

### 5.2 Server → client snapshots (`MsgHdr.h:963-968, :1029, :1492-1497`; dispatch DPC:428-435, :657)

| Snapshot | Type | Object | Fields | Sent by |
|---|---|---|---|---|
| PVENDOR_OPEN | 0x0042 | seller | string title (48) | USR:5406, to all in range |
| PVENDOR_CLOSE | 0x0043 | seller | BYTE clear title (1 all in range; 0 to a leaving buyer) | USR:5418, :940 |
| REGISTER_PVENDOR_ITEM | 0x0044 | seller | BYTE slot, BYTE type, BYTE object id, short count, int price | USR:931, seller only |
| PVENDOR_ITEM | 0x0045 | seller | BYTE n; n × (BYTE slot, `CItemElem::Serialize`, int count, int price); BOOL room open | USR:949, the asker |
| PVENDOR_ITEM_NUM | 0x0046 | seller | BYTE slot, short left, string buyer (MAX_PLAYER) | USR:5431, seller and browsers |
| UNREGISTER_PVENDOR_ITEM | 0x0047 | seller | BYTE slot | USR:922, seller only |
| CHATTING | 0x007b | own | BYTE kind: 0 ENTERMEMBER (id, name), 1 NEWCHATTING (int n, n × (id, name)), 2 DELETECHATTING, 3 REMOVEMEMBER (id), 4 CHATTING (id, string 1024), 5 CHATTINGROOMSTATE (BOOL) | USR:6384-6505 |

The client only applies REGISTER / UNREGISTER for its own mover (DPC:13935-13961), and keeps the saved list in step on
UNREGISTER and ITEM_NUM. The gateway passes all of these unchanged (it only forbids GATEWAY_CLIENT_ADDR).

## 6. Rules the client must follow (summary)

- Slots 0-19 only; an empty slot to drop on; not quest, guild cloak, expired, already held; the server also refuses bound
  items, equipped items, vagrant rides, items in use (`TID_GAME_CANNOT_DO_USINGITEM`), a fight region
  (`TID_GAME_FAIL_TO_OPEN_SHOP` "Private Shops are unavailable in this area."), within 3 m of an NPC (a box,
  `TID_GAME_NPC_RADIUS` "You cannot open a Private Shop near an NPC."), the mini room and the quiz world (SRV:7075-7189).
- Price 1 to 2,147,483,647 each; bag penya + all prices × counts under 2,100,000,000.
- Name 6 to 32 bytes, no banned word, chat word filter applied.
- Not while flying, trading, in a duel, chaotic, in the guild siege; no NPC shop, bank or guild bank window open.
- A seller with an item up cannot move, click the world, use items or skills; with the window open, no motions.
- A buyer clicks within 20 of the camera; Ctrl outside a safety region does not open; one shop at a time.

## 7. Online sources

Fan wikis say little about V15's private shop. The GPotato FlyFF wiki's "Madrigal Market Place" page says shops may only
be set up in the Market Place, and describes the consignment shop of version 19; both are later versions, not V15
(https://flyff-wiki.gpotato.com.br/wiki/Madrigal_Market_Place.html). A Madrigal Inside guide describes the Vendor Shop
"clone" (an offline shop) and a 100,000,000,000 price cap, also of later versions (https://madrigalinside.com/?p=46172).
The code wins: V15 opens anywhere but the refusals above, has no offline shop, and caps at 2,100,000,000 in total.

## 8. FlyffWeb today (main a7f1af3)

Has:
- **ADD_OBJ** already reads the title: `AddedPlayer.shopTitle` (`packages/protocol/src/world/addObj.ts:148`,
  `types.ts:520`); nothing uses it.
- **Item reader** `readInventoryItem` (`world/own.ts`), used by the NPC shop (`world/shop.ts`) and CREATEITEM.
- **The bag** (`apps/client/src/world/hud/inventoryWindow.ts`): HTML drag with `application/x-flyff-inventory` and the
  object id (:205-212); a held item faded and not dragged (`held`, `WorldScreen.reserveItem` :1912, `bagHeld` :1828);
  the phone has no drag: a tap selects; the NPC shop puts the bag in a tap-to-pick mode (`shopSelect`, :193, :240).
- **Windows from resdata.inc** (`hud/resWindow.ts`): statics, groups, picture buttons, edits, customs, lists; phone
  windows scaled to fit (`mobileScale: 1, fitWhole: true`), text 14 px on the phone (`style.css:1637`).
- **Message box** (`hud/messageBox.ts`, OK and OK/Cancel), the hud's lines (`hud.messages.add`), texts by TID.
- **The player menu** (`world/party/playerMenu.ts:28-39`) and `WorldScreen.pressPlayer` (:3061); the press router
  (`TapToWalk` handler, :1699-1724), which a frozen player skips (`isFrozen`, `gmModes.ts:97`), and the movement step's
  frozen check (:2380).
- **The Start menu** (`hud/taskBar.ts:100-125`, `WINDOWS` :71); the applet 591 `APP_VENDOR_REVISION` is listed in
  `hud/applets.ts:55` but opens nothing.
- **Name tags** (`world/render/NameTagLayer.ts`, sprites) and **speech bubbles** (`world/render/SpeechBubbleLayer.ts`,
  5 s sprites, not Neuz's pictures); `showsBubble` (`gmModes.ts:88`) already drops bubbles for invisible GMs.
- **Sitting**: the action states know `OBJSTA_SIT` (`sim/ActionMover.ts:715`, `WorldScreen.ts:3120`).
- **Invalid names**: the party catalog carries `InvalidName_ENG.inc` (`invalidNames`) and the letters
  (`tools/convert/src/data/partyCatalog.ts:56-57`); the chat word filter is in `hud/chatRules.ts` (chat.json).

Missing:
- every packet of §5 and their testkit writers;
- the shop state (own slots, saved list, other shops' titles, the shop being browsed, the chat room);
- the four windows (shop, sell keypad, buy keypad, chat), the confirm boxes, the Start menu line;
- the title balloon and its pictures (`texDialogBox_left/center/right`), the keypad pictures (`ButItemNum*`, `ButItem*`),
  `Window04.bmp`, `ButtChat.BMP`, `WndVenderArrowEx.tga`, `WndPosMark.tga` (not in the UI stage);
- the click on a seller, the seller-only menu, the seller's control locks, no chat bubble for a seller;
- a phone layout for all of it.

Shared with the trade branch (in progress): the player menu, the bag's drag and held items, a quantity entry. The shop's
quantity and price entry is Neuz's own keypad windows (`CWndRegVend`, `CWndVendorBuy`), not `CWndTradeGold`, so the two
do not overlap; both hold bag items through `reserveItem`.
