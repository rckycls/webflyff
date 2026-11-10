# B — FlyFF V15 mail (the post) — research notes for the FlyffWeb port

Scope: the V15 Neuz post (mailbox NPC, send / inbox / read windows, new-mail notice) and the server rules behind it.
Research only, no source changed.

Paths: `Source/...` = Neuz / server C++ (CP949, line numbers kept by iconv), `Resource/...` = resdata.inc, ResData.h,
textClient.inc (+ textClient.txt.txt, UTF-16LE), resData.txt.txt (**plain ASCII in this repo, not UTF-16**),
`Client/Theme/Default/...` = the theme pictures (there is only a `Default` theme folder).
TID text = `textClient.inc` line (colour) -> IDS key -> `textClient.txt.txt`. resdata strings = `IDS_RESDATA_INC_*` in resData.txt.txt.
Framing of client <-> server packets (`BEFORESENDSOLE`, snapshots, strings) is the same as in
`guild-research/B-packets.md` section 0; only mail specifics are repeated here.

Status: complete (sections 1-10, builder summary, open questions).

---------------------------------------------------------------------------------------------------------------------------

## 1. Build switches

Build: `__MAINSERVER`, `__VER 15` (Source/Neuz/VersionCommon.h:3-4; Source/WORLDSERVER/VersionCommon.h:3-4;
Source/databaseserver/VersionCommon.h:3-4). `__INTERNALSERVER` is only defined when neither TEST nor MAIN (Neuz/VersionCommon.h:6-8),
so it is **off**.

| switch | on? | what it does for mail | evidence |
|---|---|---|---|
| (none) — the post itself | **always on** | `CMail`/`CMailBox`/`CPost`, the 6 windows and all packets are compiled with no feature switch. There is no `__POST`/`__MAIL` switch. | _Common/post.h (no guard), WndField.h:1148-1332, DPClient.cpp:681-684 |
| `__MAIL_REQUESTING_BOX` | **on in Neuz only** (Neuz/VersionCommon.h:252, common part, not inside a server-type block). Not defined in WORLDSERVER/VersionCommon.h (grep: no hit). | "Mail Request" modal box while the inbox loads, 5 s auto re-query, `CloseMailRequestingBox`, deletes `<name>_MailData.Temp` when the box is empty. See 2.4. | WndField.cpp:13836-13899, 13942-14021; DPClient.cpp:15991-16002, 16035-16075; WndManager.cpp:528-530, 3273-3280; post.cpp:367-370 |
| `MAX_KEEP_MAX_DAY` / `MAX_KEEP_BASIC_DAY` | main values **15 / 7 days** (internal build would be 7 / 2) | keep time and free-keep time | _Common/post.h:14-22 |
| `MAX_MAILTITLE 32`, `MAX_MAILTEXT 256`, `MAX_MAIL 50` | fixed (old values 128 / 100 commented out, "mulcom 100420") | buffer sizes / mailbox limit | post.h:8-12, 122-125 |
| `__BS_NO_CREATION_POST` | **off** (commented, Neuz/VersionCommon.h:392, and inside the internal block) | would skip creating MI_POSTBOX objects | DPClient.cpp:1070-1085 |
| `__POST_1204` | **off** (commented, databaseserver/VersionCommon.h:88) | batch expiry delete; off -> one DELETE per expired mail | _Database/DbManager.cpp:6150-6188 |
| `__GETMAILREALTIME` | **on** (databaseserver/VersionCommon.h:31) | DB server polls table `MAIL_STR_REALTIME` every minute and mails web/shop items (sender id 0) | databaseserver/DatabaseServer.cpp:540-545; DbManager.cpp:7242-7330 |
| `__JEFF_FIX_0` | **on** (databaseserver/VersionCommon.h:60) | `QUERYMAILBOX` goes through the DB worker queue; the "send all mail at world connect" (`SendAllMail`) is compiled out | databaseserver/dptrans.cpp:312-314, 1107-1135 |
| `__RT_1025` | on (Neuz/VersionCommon.h:94, common part) | recipient dropdown is filled from `g_WndMng.m_RTMessenger` (friends) | WndField.cpp:14209-14232 |
| `__SYS_PLAYER_DATA` | define commented (Neuz/VersionCommon.h:92) but every use is `#if __VER >= 11` -> **active** | names come from `CPlayerDataCenter` (client) / `GetPlayerId` (server) | WndField.cpp:14226, 14682, 15173; DPSrvr.cpp:5016-5027 |
| `__FIX_WND_1109` | on (Neuz/VersionCommon.h:22) | read window owned by the inbox page (`Initialize(this)`, `SAFE_DELETE` before re-open) | WndField.cpp:15331-15343 |
| `__S_SERVER_UNIFY` | on | server `AddDiagText` arrives as `SNAPSHOTTYPE_TEXT/TEXT_DIAG` -> client modal OK box; world refuses `QUERYPOSTMAIL` while `m_bAllAction == FALSE` | DPClient.cpp:1598-1600; DPSrvr.cpp:5011-5014 |
| `__MA_VER11_05` | define commented but code uses `__VER >= 11` -> active | "Delete" does nothing on a mail whose item is a Sealed Character scroll | WndField.cpp:14880-14883 |

### 1.1 Custom `__BB_*` code that touches mail (leave out of the port)

Only `__BB_STAFF_MODERATOR_AUTH` (WORLDSERVER/VersionCommon.h:213; databaseserver/VersionCommon.h:12; Neuz/VersionCommon.h:212):
* WORLDSERVER/DPSrvr.cpp:4997-5003 — staff moderators cannot send mail (`TID_GAME_CANNOT_POST`).
* WORLDSERVER/DPSrvr.cpp:5178-5184 — cannot take a mail item.
* WORLDSERVER/DPSrvr.cpp:5233-5239 — cannot take mail penya.
No `__BB_*` in post.cpp/.h, WndField.cpp post classes, WndMailRequestingBox.*, DPClient.cpp mail handlers,
DPDatabaseClient.cpp mail handlers or DbManager.cpp mail functions (grep).

---------------------------------------------------------------------------------------------------------------------------

## 2. How the post opens and closes

### 2.1 The mailbox NPC
* Menu id `MMI_POST = 25` (Resource/defineNeuz.h:117). Menu text `TID_MMI_DIALOG + 25` = `TID_MMI_POST` (Resource/defineText.h:352,
  value 7025) = "Mailbox" (textClient.inc:1422, white).
* Only one character has it: **`MaFl_Postbox`** (Resource/character.inc:5692-5706, UTF-16): `AddMenu( MMI_POST )` only;
  name IDS_CHARACTER_INC_000633 = "Post Box", image IDS_CHARACTER_INC_000632 = "char_Question.tga" (Resource/character.txt.txt).
  It is a mover `MI_POSTBOX = 873` (Resource/defineObj.h:1614), model "NpcPostbox" (Resource/mdlDyna.inc:6656),
  prop line Resource/propMover.txt:526 (name "Post Box", peaceful).
* Placements: `Resource/World/WdMadrigal/WdMadrigal.dyo` holds 4 `MaFl_Postbox` records (byte offsets 5444, 17744, 24144,
  37944; `WdIvilisTemple/WdIvilisTemple.dyo` is a byte-identical copy). The floats just before each record read as
  (x,y,z) = (1739.4,100,802.9) (2115.7,100,900.1) (958.5,59,1114.1) (1490.2,100.4,1351.0) with angles 180/180/308/299, but I did
  not verify the dyo record layout. Take postbox spawns from the port's existing NPC spawn data (see Open questions).
* No item opens the post (grep: no other caller creates `CWndPost`).

### 2.2 Click -> window
1. Clicking an NPC calls `CWndWorld::ShowMoverMenu` (Source/_Interface/WndWorld.cpp:6517). The menu path runs only when the
   player is within **20 units** (`fDistSq < 20*20`, :6520-6526); else the player auto-walks to the NPC (:6705-6709).
2. Because `MaFl_Postbox` has exactly **one** menu entry, no popup menu is shown: `OnCommand( MMI_POST )` runs directly
   (:6630-6646, :6686-6689).
3. `case MMI_POST` (WndWorld.cpp:4525-4612) refuses (chat line in the TID colour, window not opened) if one of these is open,
   checked in this order:

| open window | TID (textClient.inc line) | English | colour |
|---|---|---|---|
| APP_TRADE | TID_GAME_TRADENOTPOST (:7659) | You cannot use the Mailbox while trading. | 0xffff0000 |
| APP_POST (already open) | TID_MAIL_OTHERWORK (:6456) | Not available | 0xffffffff |
| APP_COMMON_BANK | TID_GAME_BANKTRADESELF (:1097) | You cannot trade while using the bank. | 0xffff0000 |
| APP_CONFIRM_BANK, APP_GUILD_BANK, APP_BANK_PASSWORD | TID_GAME_BANKSTILLUSING (:1847) | You are already using the bank. | 0xffffffff |
| APP_REPAIR | TID_GAME_REPAIR_NOACTION (:2732) | You cannot use an item while repairing. | 0xffffffff |
| APP_SHOP_ | TID_GAME_TRADENOTBEAUTYSHOP (:1927) | You cannot use the beauty shop while trading. | 0xffff0000 |
| APP_BEAUTY_SHOP_SKIN | TID_GAME_FACESHOPUSING (:7609) | You are using Cosmetic Upgrades. | 0xffffffff |
| APP_BEAUTY_SHOP_EX | TID_GAME_BEAUTYSHOPUSING (:1932) | You are using the beauty shop. | 0xffffffff |
| APP_SUMMON_ANGEL | TID_GAME_SUMMONANGELUSING (:7639) | You have summoned an Angel. | 0xffffffff |

4. Then: open the inventory (`CreateApplet( APP_INVENTORY )`, :4606), `SAFE_DELETE( g_WndMng.m_pWndPost )`, `new CWndPost`,
   `Initialize( NULL, APP_POST )` (:4608-4610).
5. `CWndPost::OnInitialUpdate` (WndField.cpp:13850-13900): **disables the whole window** (`EnableWindow( FALSE )`, :13854),
   closes APP_BAG_EX (the pocket window, :13862-13864), builds the 2 tabs (section 3), selects tab 1 "Inbox" (:13880),
   centres itself (`MoveParentCenter`, :13882), **sends `PACKETTYPE_QUERYMAILBOX`** (:13885) and opens the modal
   "Mail Request" box (2.4) (:13896-13898).
6. The window is enabled again only when the server answers (2.3).

Other windows refuse while the post is open: player menu "Trade" -> TID_MAIL_OTHERWORK "Not available" (WndWorld.cpp:5260-5265);
summon-angel NPC -> TID_GAME_TRADENOTSUMMONANGEL "You cannot summon an Angel while trading." (:4823-4828).

### 2.3 What the server answers (mailbox load)
Client sends `QUERYMAILBOX` (0x1d, no payload; DPClient.cpp:15894-15901) on: window open (WndField.cpp:13885), every switch
**to** the Inbox tab (:13921-13937; switching to "Send Mail" sends nothing), the "Request" button of the request box
(WndMailRequestingBox.cpp:64-83), and automatically every 5 s while `m_bWaitRequestMail` is set (WndManager.cpp:3273-3280).
There is **no client-side distance check** for this and **no server-side NPC check** either (DPSrvr.cpp:5288-5376).
(Tab changes made in code with `SetCurSel` do not notify, WndControl.cpp:4502-4541, so opening on tab 1 does not send a second query.)

World server `CDPSrvr::OnQueryMailBox` (WORLDSERVER/DPSrvr.cpp:5288-5376):
* `nClientReqCount` = 1, or the per-user counter when `CheckClientReq()` says >= 3 s passed since the last counted query
  (User.cpp:6793-6814, `CHECK_TICK_FROM_CLIENT = SEC(3)` User.h:60). The counter is reset at join (User.cpp:4249) and after each
  mailbox delivery (DPDatabaseClient.cpp:2476, 2516, 2541, 2783).
* World has a `CMailBox` for the player:
  * status `data`: count <= 1 -> sends the mailbox at once (`AddMailBox` = snapshot `QUERYMAILBOX`); else asks the DB again
    (`QUERYMAILBOX_COUNT`) (:5313-5327).
  * status `nodata`: asks the DB (`QUERYMAILBOX`, or `_COUNT` when count >= 2), status -> `read` (:5328-5341).
  * status `read` (waiting for the DB): ignored, or `_COUNT` when count >= 2 (:5342-5351).
* No `CMailBox` at the world: first time asks the DB `QUERYMAILBOX_REQ` (:5362-5365); after that the world answers the client
  itself with snapshot `QUERYMAILBOX_REQ(FALSE)` = "you have no mail" (:5366-5369).
* DB answers (databaseserver/dptrans.cpp:1107-1204): `QUERYMAILBOX` -> full box (`CMailBox::Write`), or `QUERYMAILBOX_REQ`
  with `bHaveMailBox` (+ box). World then: `OnMailBox` refreshes its copy and sends it to the user (DPDatabaseClient.cpp:2458-2483);
  `OnMailBoxReq` sends the client snapshot `QUERYMAILBOX_REQ(bHave)` and, if bHave, builds the box and sends it (:2485-2544).

Client handlers:
* `OnMailBoxReq( BOOL b )` (DPClient.cpp:16026-16078): TRUE -> `m_bWaitRequestMail = TRUE` (keep the request box, re-query every
  5 s until the box arrives). FALSE -> close the request box, **enable** the post window, clear the local mailbox, refresh the
  list, delete the file `<playername>_MailData.Temp` (current directory).
* `OnMailBox` (DPClient.cpp:15982-16024): `CMailBox::GetInstance()->Serialize(ar)` (clears and re-reads everything, post.cpp:360-381;
  while `m_bWaitRequestMail` is set and the box is empty it sends another QUERYMAILBOX, post.cpp:367-370); if the post window
  exists: enable it, `UpdateScroll()`, close the request box, `m_bWaitRequestMail = FALSE`.
* The snapshot `SNAPSHOTTYPE_POSTMAIL` (one new mail pushed into an open window) is **never sent**: the world sends it only when
  `pUser->IsPosting()` (DPDatabaseClient.cpp:2624-2627) and `SetPosting` has no caller (grep: only the inline at User.h:241).
  So a mail that arrives while the window is open is **not** shown until the next QUERYMAILBOX (switch tabs or reopen).
  (Good, because the client handler `OnPostMail` dereferences `m_pItemElem` without a NULL check in its log line, DPClient.cpp:15911.)

### 2.4 The "Mail Request" box (`__MAIL_REQUESTING_BOX`) — CWndMailRequestingBox
* Class: Source/_Interface/WndMailRequestingBox.h:6-25, .cpp:9-87. Window `APP_REQUESTING_POST` (ResData.h:788 = 890),
  resdata.inc:6605-6634, `WndTile00.tga` tiled, **192 x 192**, title "Mail Request" (IDS_RESDATA_INC_007020).
  * `WIDC_STATIC_REQUEST` (ResData.h:1295 = 929) STATIC 28,44,156,60, text "Requesting the post..." (IDS_RESDATA_INC_007022).
  * `WIDC_BUTTON_REQUEST` (ResData.h:1323 = 933) BUTTON 60,82,124,122, `ButtSend.bmp` (256x40 = 4 states of 64x40), text
    "Request" (IDS_RESDATA_INC_007024).
* Opened modal (`InitDialog( APP_REQUESTING_POST, WBS_MODAL )`, .cpp:20-23), **no close button** (`m_bNoCloseButton = TRUE`, :13),
  not movable (`DelWndStyle( WBS_MOVE )`, :29), centred (:37). The button starts **disabled** (:31-35).
* `Process()` (:40-58): 5 s after opening (`REQUEST_BUTTON_WAITING_TIME = 5`, .h:9) the button is enabled. If the button was
  pressed 3 times (`DESTRUCTION_TIME = 3`, .h:10) the box destroys itself when the next 5 s run out.
* Button (:64-83): `++counter`; if enabled -> send QUERYMAILBOX, disable again for another 5 s.
* Closed by `CWndPost::CloseMailRequestingBox()` (WndField.cpp:14014-14020) on any mailbox answer, and in `~CWndPost` (:13844).
* `LoadLastMailBox` / `SaveLastMailBox` (WndField.cpp:13943-14013): a local cache file `<playername>_MailData.Temp`
  (per mail: DWORD gold, BYTE read, char[32] title). **Dead code**: both calls are commented out (:13843, :13888-13894).
  The only live use is the `DeleteFile` in `OnMailBoxReq(FALSE)`. Port: skip the cache file.

### 2.5 How it closes
* Title-bar close button (normal CWndNeuz).
* **When the player moves**: every frame, if the player is not standing or is moving backwards
  (`!IsState( OBJSTA_STAND ) || GetMoveState() == OBJSTA_BMOVE`, WndWorld.cpp:8051-8052) the client destroys APP_POST,
  APP_POST_SEND, APP_POST_RECEIVE and APP_POST_READ (:8383-8394). No distance check: any movement closes it. The inventory that
  was opened with it stays open.
* Accepting a duel destroys the same 4 windows (Source/_Interface/WndDuelConfirm.cpp:248-259).
* The server has no "close post" packet and no open-state (`m_bPosting` is never set).

---------------------------------------------------------------------------------------------------------------------------

## 3. The post window — CWndPost (APP_POST)

Window inventory (all in Source/_Interface/WndField.cpp/.h unless noted):

| class | APP id (ResData.h line = value) | resdata.inc lines | frame | size | modal? |
|---|---|---|---|---|---|
| `CWndPost` (tab frame) | `APP_POST` :422 = 517 | 27030-27050 | `WndTile00.tga` tiled | 320 x 368 | no |
| `CWndPostSend` (tab 0) | `APP_POST_SEND` :418 = 513 | 26928-27029 | none (child page) | 287 x 320 (resized by the tab ctrl) | — |
| `CWndPostReceive` (tab 1) | `APP_POST_RECEIVE` :420 = 515 | 25848-25859 (no controls) | none | 300 x 320 (resized) | — |
| `CWndPostRead` | `APP_POST_READ` :430 = 525 | 25539-25649 | `WndTile00.tga` tiled | 288 x 336 | yes (WBS_MODAL) |
| `CWndPostDeleteConfirm` | `APP_POST_DELETE_CONFIRM` :478 = 573 | 2429-2467 | `WndTile00.tga` tiled | 256 x 144 | yes |
| `CWndPostItemWarning` | `APP_QUEITMWARNING` :387 = 482 (shared resource) | 23229-23276 | `WndTile00.tga` tiled | 320 x 160 | yes |
| `CWndPostSendMessageBox` (send confirm) | `APP_MESSAGEBOX` :405 = 500 (generic) | 24534-24545 | `WndMessagebox.tga` | 256 x 144 | yes |
| `CWndMailRequestingBox` | `APP_REQUESTING_POST` :788 = 890 | 6605-6634 | `WndTile00.tga` tiled | 192 x 192 | yes (2.4) |
| `CWndTradeGold` (stack count) | `APP_TRADE_GOLD` :21 = 116 | 11228-11284 | `WndTile09.tga` tiled | 240 x 128 | yes (4.3) |
| `CWndPostSendConfirm` | none | — | — | — | declared only (WndField.h:1288-1312), never implemented/used — skip |

resdata control line format (Source/_Common/ResManager.cpp:126-145): `type id texture bTile left top right bottom style visible
group disabled tabstop`, rect in client coordinates.

### 3.1 APP_POST frame
* resdata.inc:27030: `APP_POST "WndTile00.tga" 1 320 368 0x2410000 26`, title **"POST"** (IDS_RESDATA_INC_003214).
* One control: `WIDC_TABCTRL1` (ResData.h:1352 = 934) TABCTRL 8,8,314,330 (resdata.inc:27040).
* Created with `InitDialog( APP_POST )` (WndField.cpp:13902-13905), centred on screen (`MoveParentCenter`, :13882).
* Tabs (WndField.cpp:13857-13880): both pages are created as children of the tab control with `rect = GetClientRect()` but
  `left = 5, top = 0` (:13858-13867); the tab control then sets every page to its own rect minus 18 px at the bottom (the tab
  strip is at the bottom; WndControl.cpp:4522-4533).

| index | label | TID (textClient.inc line) | page |
|---|---|---|---|
| 0 | "Send Mail" | TID_APP_POST_SEND (:22) | `m_PostTabSend` APP_POST_SEND |
| 1 | "Inbox" | TID_APP_POST_RECEIVE (:27) | `m_PostTabReceive` APP_POST_RECEIVE — **selected at open** (:13880) |

* `OnChildNotify( WNM_SELCHANGE )` (:13921-13940): new tab 0 -> nothing; new tab 1 -> `SendQueryMailBox()` (the
  `m_PostTabSend.ClearData()` before it is `#ifndef __MAIL_REQUESTING_BOX`, so **off**: the send form keeps its data).
* No OnDraw content (:13847-13849).

---------------------------------------------------------------------------------------------------------------------------

## 4. Writing a mail — CWndPostSend (tab 0, APP_POST_SEND)

### 4.1 Layout (resdata.inc:26928-27029; ids from ResData.h)

| control (ResData.h line = value) | type | rect l,t,r,b | picture (tiled?) | text / note |
|---|---|---|---|---|
| WIDC_STATIC1 (:1305 = 929) | STATIC | 12,18,78,34 | WndEditTile200.tga (tiled) | "Receiver" (IDS_RESDATA_INC_003230) |
| WIDC_COMBOBOX1 (:1291 = 928) | COMBOBOX (editable: `CWndComboBox : CWndEdit`, WndControl.h:1206) | 86,18,256,36 | WndEditTile00.tga (tiled) | recipient |
| WIDC_STATIC5 (:1195 = 872) | STATIC | 12,44,78,60 | WndEditTile200.tga (tiled) | "Title" (…003228) |
| WIDC_EDIT2 (:1263 = 897) | EDITCTRL | 86,42,256,60 | WndEditTile00.tga (tiled) | title, tabstop |
| WIDC_EDIT3 (:1133 = 794) | EDITCTRL, style 0x20020000 | 7,74,267,210 | WndEditTile00.tga (tiled) | body; code adds `EBS_WANTRETURN` + `EBS_AUTOVSCROLL` (WndField.cpp:14190-14199); Enter inserts `'\n'` (WndEditCtrl.cpp:1528-1536) |
| WIDC_STATIC3 (:1370 = 936) | STATIC | 12,228,44,260 | WndChgElemItem.bmp (32x32, not tiled) | item slot |
| WIDC_STATIC2 (:1270 = 900) | STATIC | 64,238,126,254 | none | "Penya" (…003234) |
| WIDC_EDIT4 (:967 = 436) | EDITCTRL | 112,238,184,254 | WndEditTile00.tga (tiled) | penya amount, tabstop |
| WIDC_SEND (:929 = 288) | BUTTON | 201,224,267,266 | ButtSend.bmp (256x40, 4 states) | send |
| WIDC_STATIC4 (:1180 = 867) | STATIC | 16,272,266,288 | WndEditTile200.tga (tiled) | **"Rental Fee : 500 Penya"** (…003236) — fixed text, not computed |

* Non-Korean clients move two controls (WndField.cpp:14234-14247): WIDC_STATIC2 -> 50,238,112,254 (14 px left);
  WIDC_EDIT4 -> 98,238,194,254 (left -14, right +10). The English port must use these moved rects.
* Tab stops: combobox, EDIT2, EDIT3 (:14205-14207). Initial focus: combobox (:14249). No max length is set on any edit
  (CWndEdit default `m_dwMaxStringNumber = 0xffffffff`, WndEditCtrl.cpp:1212); limits are checked on Send (4.4).
* Recipient dropdown (:14209-14232): one entry per friend in `g_WndMng.m_RTMessenger` (a `map<u_long, Friend>`, so ascending
  player id), text `CPlayerDataCenter::GetPlayerString( idPlayer )`. The edit part accepts any typed name.

### 4.2 Attaching an item (only from the inventory)
`OnDropIcon` (WndField.cpp:14287-14374):
1. Accepts an item shortcut. (The guard at :14292 uses `&&`, so it only rejects things that are neither an item nor from the
   inventory; the item is then read **by inventory index** `m_Inventory.GetAt( m_dwIndex )`, :14309 — port: accept inventory items only.)
2. Penya dragged from the inventory (`m_dwData == 0`) -> refused (forbid cursor), :14295-14299. Penya is typed, never dragged.
3. Equipped item -> chat TID_GAME_EQUIPPUT "Please unequip the item first." (textClient.inc:1817, 0xffff0000), :14301-14306.
4. Must be dropped inside the WIDC_STATIC3 slot rect (:14314-14318), else nothing happens (returns TRUE).
5. Premium/charged item (`IsCharged()`: `m_bCharged == 1 || m_nResistSMItemId != 0`, _Common/Item.cpp:323-329) -> chat
   TID_GAME_CHARGED_NOTUSE "You can not use the premium items." (:6473, white), :14320-14325.
6. Stack (`m_nItemNum > 1`): remember the item id, open **CWndTradeGold** (4.3) with the full stack as default (:14327-14348).
7. Single item: remember it, `SetExtra( 1 )` (:14358-14361).
8. In both cases the **title edit is overwritten with the item name** (`GetProp()->szName`) if it differs (:14350-14356, :14363-14369).
* Only one item can be attached. Dropping another item replaces it; the old item's `Extra` is reset to 0 (`SetItemId`, :14272-14285).
* While attached, the inventory item carries `Extra = count` (client-only marker): the inventory draws it at alpha 60 and shows
  the stack count minus Extra (Source/_Interface/WndItemCtrl.cpp:690-715).
* Right-click inside the slot removes the attachment (`SetExtra(0)`, `m_nItem = 0xff`), :14376-14394 (the title stays).
* Draw (`OnDraw`, :14144-14185): item icon at the slot's top-left (12,228); if `dwPackMax > 1` and `Extra > 0` the count is drawn
  with `m_pFontWndTitle` at (right-13, bottom-13) in 0xff0000ff then at (right-14, bottom-14) in 0xffb0b0f0 (shadowed number);
  hovering the slot shows the normal item tooltip.

### 4.3 Stack quantity — CWndTradeGold (APP_TRADE_GOLD)
* Setup at WndField.cpp:14331-14348: `m_dwGold = stack size` (default text), `m_nIdWndTo = APP_POST_SEND`, modal, centred, title
  cleared (`SetTitle("")`), WIDC_STATIC text TID_GAME_MOVECOUNT "Move how many items?" (textClient.inc:3217), WIDC_CONTROL1 text
  TID_GAME_NUMCOUNT "Number:" (:3227).
* Layout resdata.inc:11228-11284 (`WndTile09.tga` tiled, 240x128): WIDC_STATIC 36,12,192,29; WIDC_EDIT 100,36,196,56
  (WndEditTile00); WIDC_OK 40,68,112,88 ButtOk.tga; WIDC_CANCEL 124,68,196,88 ButtCancel.tga; WIDC_CONTROL1 24,36,92,52.
* OK or Enter (WndField.cpp:8493-8504, 8733-8783): `n = atoi(text)`, `n < 1 -> 1`, `n > stack -> stack`; `SetExtra(n)`,
  `SetItemId`, `SetCount(n)`. Cancel (:8785-8792): `SetItemId(0xff)`, count 0 (no attachment).

### 4.4 Send button — checks in order (WndField.cpp:14404-14508)
Reads receiver (combobox text), title (EDIT2), body (EDIT3), penya (EDIT4). Lengths are **bytes** (`strlen`).

| # | check | result |
|---|---|---|
| 1 | receiver empty or title empty (:14421-14424) | nothing happens (silent) |
| 2 | no item and penya empty (:14427-14430) | intended "nothing happens", but **never fires**: `m_nItem` is a BYTE (0xff) compared with `NULL_ID` (0xffffffff). A mail with no item and no penya is allowed. |
| 3 | penya text has a non-digit (:14433-14452) | silent (the message box is commented out) |
| 4 | penya > 1,000,000,000 (`_atoi64`, :14454-14459) | box TID_GAME_LIMITPENYA "You can not send that much Penya." (textClient.inc:6696) |
| 5 | receiver length < 3 or > 16 (:14461-14466) | box TID_DIAG_0057 "That name is too long.  Please try again." (:2267) (same text for too short) |
| 6 | body length > 255 (`MAX_MAILTEXT - 1`, :14468-14474) | box TID_GAME_MAILBOX_TEXT_MAX "The text should be under %d letters." with %d = **256** (:7201) |
| 7 | title length > 31 (`MAX_MAILTITLE - 1`, :14476-14482) | box TID_GAME_MAILBOX_TITLE_MAX "The title should be under %d letters." with %d = **32** (:7206) |
| ok | — | opens the send-confirm box (4.5) with: item id (0xff if none), count = item `Extra` (0 if none), receiver, `atoi(penya)`, title, body (:14484-14501) |

"box" = `g_WndMng.OpenMessageBoxUpper( text )` (modal OK box, TID colour not used).
No client check for: sending to yourself, unknown name, enough penya, item type (all server-side, 4.6). Penya = 0 is allowed.

### 4.5 Confirm box — CWndPostSendMessageBox (WndField.cpp:14028-14087)
* A `CWndMessageBox` with `MB_OKCANCEL` (generic APP_MESSAGEBOX; Source/_Interface/WndMessageBox.cpp:190-206), opened by
  `g_WndMng.OpenCustomBox( "", pBox )` (WndManager.cpp:2237-2249).
* Text: `TID_MAIL_SEND_CONFIRM` (textClient.inc:6431) formatted with `MAX_KEEP_MAX_DAY` = 15:
  "Would you like to send mail?" + line break + " Received mail will be deleted after 15 days."
  (the table has a literal `\n`; the leading space after it is in the text).
* OK (id 1): `SendQueryPostMail(...)` then `m_PostTabSend.ClearData()` (:14066-14081). Cancel (id 2): close.
* `ClearData()` (:14101-14125) only drops the attachment (Extra 0, `m_nItem = 0xff`, cost/count 0). **The receiver, title, body and
  penya texts are NOT cleared** (that code is commented out, :14116-14124). Nothing else changes on the client until the server answers.

### 4.6 Server rules — CDPSrvr::OnQueryPostMail (WORLDSERVER/DPSrvr.cpp:4970-5140)
Read: `BYTE nItem, short nItemNum, string receiver (max 41 bytes, MAX_PLAYER 42), int nGold, string title (max 31), string text (max 255)`
(:4972-4984). Postage `nPostGold = 100` if Korean, **500 otherwise** (:4986-4989); `Program/WorldServer.ini:6` has `LANG 1`
(= LANG_ENG, Resource/lang.h:7) -> **500 penya**.

| # | check (in order) | result |
|---|---|---|
| 1 | `nGold < 0` or `nGold + 500 <= 0` (overflow) (:4991-4992) | dropped silently |
| 2 | (custom `__BB_STAFF_MODERATOR_AUTH`, :4997-5003) | leave out |
| 3 | trading (`m_vtInfo.GetOther()`), own vendor open, bank open (`m_bBank`), `m_bAllAction == FALSE` (:5005-5014) | silent |
| 4 | receiver name unknown (`GetPlayerId` = 0) (:5017-5021, 5128-5132) | box TID_MAIL_UNKNOW "Unknown user" |
| 5 | receiver is yourself (:5024-5031) | box TID_GAME_MSGSELFSENDERROR "You cannot send a message to yourself, silly." |
| 6 | not within **32 units** (3D, squared < 1024) of any MMI_POST NPC in the same world (:5033-5036; WORLDSERVER/npchecker.cpp:56-72, npchecker.h:4) | silent |
| 7 | receiver already has >= 50 mails (`MAX_MAIL`) (:5037-5042) | chat (defined text) TID_GAME_MAILBOX_FULL "%s's mail box is full." with the typed receiver name |
| 8 | item (if `GetAtId(nItem)` finds one): `Extra != 0` (in trade/vendor, `IsUsableItem`, Item.cpp:17-26), equipped, quest item, bound (`IsBinds`: keep-time item that is not IK2_WARP, IP_FLAG_BINDS, bind flag, blessing/eat-pet random option, level-down; Item.cpp:400-421), guild cloak (IK3_CLOAK with `m_idGuild`), vagrant flying ride (`PARTS_RIDE` and `dwItemJob == JOB_VAGRANT`), charged/premium (:5044-5098) | box TID_GAME_CANNOT_POST "You cannot send this item." |
| 8b | item in use (`IsUsing`) (:5067-5071) | box TID_GAME_CANNOT_DO_USINGITEM "You are already using that item" |
| 8c | `nItemNum <= 0` (:5090-5091) | silent ("hacking"); `nItemNum > stack` -> clamped to the stack |
| 9 | penya < 500 + nGold (:5100-5104) | box TID_GAME_LACKMONEY "You do not have enough Penya." |
| ok | take 500 + nGold penya (:5106); copy the item with `m_nItemNum = nItemNum`, remove that many from the inventory, save the player (:5108-5121); forward to the DB server (:5126) | — |

* The postage is the same with or without an item (no per-item fee). The penya sent is paid on top.
* `nItem` is not validated: if no item is attached the client sends 0xff and `GetAtId(255)` finds nothing -> penya-only mail.
* Note: the server does **not** check `nGold <= 1,000,000,000`; only the client does.

DB server (`CDbManager::AddMail`, _Database/DbManager.cpp:6050-6117): `m_tmCreate = time(NULL)`, adds the mail to the receiver's box
(new id `++CMail::s_nMail`, post.cpp:209-214), stored by stored procedure `MAIL_STR 'A1'` (DbManager.cpp:4113+); then
`SendPostMail( bResult, idReceiver, pMail )` to **all** world servers (databaseserver/dptrans.cpp:1246-1255).
World `CDPDatabaseClient::OnPostMail` (WORLDSERVER/DPDatabaseClient.cpp:2596-2668):
* success: add the mail to the world copy; if the receiver is online: set `MODE_MAILBOX` and broadcast it (section 8); the sender
  (if online) gets box TID_MAIL_SEND_OK "You have sent mail." (:2635-2637).
* failure: the sender gets the item back (`CreateItem`), **500 + nGold** back (100 if Korean), box TID_GAME_POST_ERROR
  "You have failed to send." and a save (:2639-2667).

---------------------------------------------------------------------------------------------------------------------------

## 5. The inbox — CWndPostReceive (tab 1, APP_POST_RECEIVE)

No resdata controls (resdata.inc:25848-25859); everything is drawn in code (WndField.cpp:15032-15432).

* Textures loaded in `OnInitialUpdate` (:15378-15380):
  `m_Texture[0]` = Theme `WndPostTable.tga` (242x240, the row table background), `m_Texture[1]` = Theme `WndNotUse.tga` (32x32,
  "read" overlay), `m_Texture[2]` = `Item/itm_GolGolSeed.dds` (32x32, penya-only icon). Colour key 0xffff00ff.
* Rows per page `MAX_MAIL_LIST_PER_PAGE = 6` (WndField.cpp:63), row height **40 px**.
* Vertical scrollbar (`CWndScrollBar`, id 1000, `WBS_DOCKING`) created from the page rect: top +15, bottom -50, x = right-40 .. right-30
  (:15352-15373). Range 0..count, page = min(count, 6) (`UpdateScroll`, :15070-15088). Mouse wheel moves 1 row (:15414-15432).
* **Order**: mailbox order as received = ascending mail id (DB loads `order by nMail`, Database.sql:7611 in MAIL_STR 'S1';
  new mails are appended). Oldest at the top. No sorting in the client.

### 5.1 Row drawing (`OnDraw`, :15089-15258), `sx = 9`, first row `sy = 30`, then `sy += 40`
* Table picture `WndPostTable.tga` at (13, 26) with alpha 150, once (:15112).
* Selected row: filled rect (13, sy-4)-(249, sy+36) colour ARGB(32,190,0,0) (:15136-15140).
* Icon at (19, sy+2): the item's icon if the mail has an item; else, if penya > 0, `itm_GolGolSeed.dds`; else no icon (:15143-15165).
  * Stackable item (`dwPackMax > 1`): count at (36, sy+20) drawn twice at the **same** spot, 0xff0000ff then 0xffb0b0f0, font
    `m_pFontWndTitle` (:15147-15158) — looks light lavender without shadow.
* Read mail: `WndNotUse.tga` over the icon at (19, sy+1), alpha 110 (:15167-15171). Unread mail has no extra marker.
* Sender at (69, sy+3), black: `"FLYFF"` if sender id is 0 (system mail); else the name from `CPlayerDataCenter` cut to 16 characters
  (`GetStrCut`, MBCS-aware, _Common/vutil.cpp:19-34) + "..." when longer than 16; `"Unknown"` if the name is empty (:15173-15202).
  On the client `GetPlayerString` -> `GetPlayerData(id)` **queries unknown players** (`SendQueryPlayerData`, _Common/playerdata.cpp:32-63,
  191-198), so the row shows "Unknown" for a moment and the real name once the answer arrives.
* Days left at (202, sy+3), or (199, sy+3) when `nDay <= 0` (:15223-15226): see section 7 for the value, format and colour.
* Title at (69, sy+18), colour RGB(0,0,190): cut to 13 characters + "..." when it has **13 or more** characters (:15228-15234,
  15251-15254). If the sender name is empty the title is drawn empty.
* Tooltip when the mouse is over the row rect (13, sy-4)-(249, sy+36): TID_GAME_MAIL_RECEIVE_DATE "The received date : %s"
  (textClient.inc:6466) with `COleDateTime( m_tmCreate ).Format()` (locale date + time, e.g. "11/10/2026 3:42:11 PM")
  (:15236-15249; same in `OnMouseWndSurface`, :15260-15312).

### 5.2 Mouse
* Hit test (`GetSelectIndex`, :15057-15069): `index = (y - 23) / 40` (C integer division, rounds toward 0), valid 0..5, plus scroll
  position, must be < count.
* Left click selects (:15400-15408). **Double-click** selects and opens the read window (:15314-15346): deletes any previous read
  window, `new CWndPostRead`, `Initialize( this )`, `SetValue( index )`.
* No right-click, no keyboard, no delete-from-list, no "select all".

---------------------------------------------------------------------------------------------------------------------------

## 6. Reading a mail — CWndPostRead (APP_POST_READ)

### 6.1 Layout (resdata.inc:25539-25649), `WndTile00.tga` tiled, 288 x 336, title **"Check Post Box"** (IDS_RESDATA_INC_003514)

| control (ResData.h line = value) | type | rect | picture | text / note |
|---|---|---|---|---|
| WIDC_STATIC1 (:1305 = 929) | STATIC | 12,18,76,34 | WndEditTile200.tga (tiled) | "Sender" (…003516) |
| WIDC_STATIC2 (:1270 = 900) | STATIC | 12,46,82,62 | WndEditTile200.tga (tiled) | "Title" (…003518) |
| WIDC_EDIT1 (:1361 = 935) | EDITCTRL, disabled | 78,18,254,36 | WndEditTile00.tga (tiled) | sender |
| WIDC_EDIT2 (:1263 = 897) | EDITCTRL, disabled | 78,46,258,64 | WndEditTile00.tga (tiled) | title |
| WIDC_TEXT1 (:1205 = 877) | TEXT, style 0x20020000 | 14,76,262,212 | WndEditTile00.tga (tiled) | body |
| WIDC_STATIC3 (:1370 = 936) | STATIC | 16,224,48,256 | WndChgElemItem.bmp | item slot |
| WIDC_STATIC4 (:1180 = 867) | STATIC | 78,234,98,254 | ButtMoney.tga (19x20) | penya icon; an invisible `CWndGold` ("g", no frame) is created on the same rect (WndField.cpp:14614-14616) so it can be dragged |
| WIDC_EDIT3 (:1133 = 794) | EDITCTRL, disabled | 102,236,193,255 -> code widens to **102,236,225,255** (+32, :14599-14601) | WndEditTile00.tga (tiled) | penya amount |
| WIDC_BUTTON1 (:1351 = 933) | BUTTON | 16,270,88,290 | ButtDelete.tga (288x20 = 4 x 72x20) | Delete |
| WIDC_BUTTON2 (:1247 = 889) | BUTTON | 102,270,174,290 | ButtReply.tga (288x20) | Reply |
| WIDC_BUTTON3 (:1060 = 648) | BUTTON | 188,270,262,290 | ButtClose.tga (288x20) | Close (gets the focus, :14611) |

* Opened by double-click (5.2) with `Create( WBS_MOVE | WBS_SOUND | WBS_CAPTION | WBS_MODAL, … APP_POST_READ )` (:14621-14627),
  centred (:14612). The 3 edits are disabled (:14606-14608).

### 6.2 SetValue( index ) (:14663-14733)
* Sender: as in the list ("FLYFF" for id 0; cut to 16 chars + "..."; "Unknown" if empty) (:14682-14707).
* Title: cut to 13 chars + "..." if >= 13 chars; body = full text (`CWndText`, `#c…`-style colour codes are interpreted by CWndText).
  If the sender name is empty, title and body are set to "" (:14709-14726). (Set once; it does not refresh when the name arrives.)
* **Sends `PACKETTYPE_READMAIL( nMail )` every time a mail is opened**, read or not (:14728).
* Penya edit = `GetNumberFormatEx( "%d" )` (thousands separators), "0" when none (:14730-14732).
* `OnDraw` (:14528-14589): item icon at (16,224); if `dwPackMax > 1` the count (even 1) at (right-13,bottom-13) 0xff0000ff then
  (right-14,bottom-14) 0xffb0b0f0; mouse over the slot -> red rounded rect RGB(150,0,0) + item tooltip; mouse over the penya rect
  with penya > 0 -> red rounded rect.

### 6.3 Taking the item
Two ways: **right-click the item slot** (`OnRButtonUp`, :14765-14793) or **drag it onto the inventory** (left-down in the slot sets
`m_bDrag`, mouse-move starts a global shortcut, :14641-14662, 14739-14763; the inventory drop calls `MailReceiveItem`, WndField.cpp:2015-2032).
`MailReceiveItem` (:14794-14839):
* hours elapsed > 7 days (`(15*24 - hoursLeft) > 7*24`, section 7) -> open **CWndPostItemWarning** (6.4) with the storage fee;
* else -> `SendQueryGetMailItem( nMail )` directly.

Server `OnQueryGetMailItem` (WORLDSERVER/DPSrvr.cpp:5170-5223): (custom BB check, leave out); **no free inventory slot** -> box
TID_GAME_LACKSPACE "Inventory is full. Please make room and try again.." (:5185-5189); storage fee due and not enough penya -> box
TID_GAME_LACKMONEY (:5212-5216); else the fee is taken now (:5217) and the DB is asked (:5221). No NPC distance check.
DB `RemoveMailItem` (DbManager.cpp:6190-6218, `MAIL_STR 'U1'`) -> all worlds `OnGetMailItem` (DPDatabaseClient.cpp:2693-2728): the
asking world creates the item in the inventory and sends the client `REMOVEMAIL( nMail, item )`; if `CreateItem` fails the item comes
back as a **new mail from "FLYFF" with empty title and text**. The fee is not refunded in that case.

### 6.4 Storage-fee warning — CWndPostItemWarning (APP_QUEITMWARNING, WndField.cpp:13763-13827)
* resdata.inc:23229-23276: `WndTile00.tga` tiled 320x160, title "Warning" (IDS_RESDATA_INC_002922):
  WIDC_WARNING (ResData.h:1308 = 929) STATIC 8,18,72,82 `WndQueItmwarning.tga` (64x64); WIDC_CONTEXT (:1362 = 935) EDITCTRL 72,8,300,88
  (WndEditTile00, tiled; disabled by `SetString`, :13781-13790); WIDC_BTN_YES (:867 = 101) 72,96,144,116 ButtYes.tga;
  WIDC_BTN_NO (:1033 = 588) 164,96,236,116 ButtNo.tga.
* Modal, caption, parent = read window, centred (:13773-13799).
* Text: TID_GAME_MAILBOX_KEEP_PAY (textClient.inc:7186) with (7, fee):
  "The time 7 for basic custody expired. Therefore you should pay <fee> penya as charges for custody."
* Yes or Enter -> `SendQueryGetMailItem( nMail )` (the index field holds the mail id, :14823), close; No -> close (:13814-13827).

### 6.5 Taking the penya
Right-click the penya rect (`WIDC_STATIC4`, :14787-14792) or drag the penya icon onto the inventory (`CWndGold` sets a shortcut with
`m_dwData = 0`, WndField.cpp:495-501; inventory drop -> `MailReceiveGold`, :2027). `MailReceiveGold` (:14840-14858): if the mail id > 0
and penya > 0: `SendQueryGetMailGold( nMail )` and the penya edit shows "0" at once. No fee, no warning.
Server `OnQueryGetMailGold` (DPSrvr.cpp:5225-5258): mail must exist; DB `RemoveMailGold` (`MAIL_STR 'U2'`, DbManager.cpp:6220-6248) ->
`OnGetMailGold` (DPDatabaseClient.cpp:2730-2769): if `CanAdd( gold, mailGold )` -> add penya, client `REMOVEMAIL( nMail, gold )`; if it
would overflow, the penya is re-mailed as a **new mail from "FLYFF"** (empty title/text). No message either way.

### 6.6 Delete — CWndPostDeleteConfirm (APP_POST_DELETE_CONFIRM, WndField.cpp:14950-15029)
* Button Delete (:14876-14893): if the mail item is `II_SYS_SYS_SCR_SEALCHARACTER` -> **nothing happens**; else open the confirm
  (modal, parent = read window, centred).
* resdata.inc:2429-2467: `WndTile00.tga` tiled 256x144, **no title**; WIDC_TEXT1 (:1205 = 877) TEXT 8,8,240,82 (WndEditTile00, tiled)
  with TID_MAIL_DELETE_CONFIRM (textClient.inc:6446): "Do you want to delete this mail? " + line break +
  "If you do, items and penya in this mail will be deleted as well."; WIDC_YES (:866 = 101) 46,86,118,106 ButtYes.tga;
  WIDC_NO (:1034 = 588) 128,86,200,106 ButtNo.tga.
* Yes: `SendQueryRemoveMail( nMail )`, close the confirm **and the read window** (:15006-15023). No: close.
* Server `OnQueryRemoveMail` (DPSrvr.cpp:5142-5168): mail must exist -> DB `RemoveMail` (`MAIL_STR 'D1'` = soft delete byRead=90,
  DbManager.cpp:6119-6148) -> worlds `OnRemoveMail` (DPDatabaseClient.cpp:2670-2691): client `REMOVEMAIL( nMail, mail )`; clear
  `MODE_MAILBOX` if no unread mail is left. Item and penya are gone (no return).

### 6.7 Reply (Button2, :14894-14939)
* Dead check: if the sender edit equals "Unknow" -> box TID_MAIL_UNKNOW. Never true (the edit says "Unknown").
* Then: drop any attachment (`SetItemId(0xff)`), clear receiver/text/title of the send page, switch to tab 0 (`SetCurSel(0)`, no
  query), receiver = sender name (**"FLYFF" for system mail** — sending to it gives "Unknown user"), title = `"Re:"` + the **displayed**
  title (already cut, may end with "..."; no space after the colon), close the read window. Penya edit is not cleared.

### 6.8 Return to sender
**Not in V15.** No button, no packet (grep: no "return" mail path); the only automatic returns are the restore mails of 6.3/6.5.

### 6.9 What changes after each answer (client `OnRemoveMail`, DPClient.cpp:15924-15980)
`SNAPSHOTTYPE_REMOVEMAIL( u_long nMail, int nType )`: `0 mail` -> remove the mail from the local box; `1 item` -> delete its item;
`2 gold` -> penya = 0; `3 read` -> `m_byRead = TRUE` (post.cpp:408-485). Nothing else is refreshed: the list is redrawn every frame
from the local box, but `UpdateScroll()` is **not** called, so the scroll range / `m_nMax` stay stale until the next QUERYMAILBOX
(port: recompute, and guard the stale index — the original indexes `mailbox[m_nSelect]` without a size check). The read window keeps
its texts; the item icon disappears (drawn from the box), the penya edit was already set to "0".

---------------------------------------------------------------------------------------------------------------------------

## 7. Expiry, days left, storage fee

### 7.1 Constants (_Common/post.h:14-22)
* A mail is kept **15 days** (`MAX_KEEP_MAX_DAY`). The first **7 days** are free (`MAX_KEEP_BASIC_DAY`); after that, taking the
  **item** costs a storage fee (penya is always free).

### 7.2 Deletion at expiry (server)
* DB server timer `TID_POSTPROC` every **1 minute** (databaseserver/DatabaseServer.cpp:92, 324, 513-515) -> `CPost::Process()`
  (_Common/post.cpp:599-617): every mail with `m_tmCreate < now - 15 days` (exact 15 x 24 h) is deleted with
  `CDbManager::RemoveMail( list )` (DbManager.cpp:6170-6186: `MAIL_STR 'D1'` each, then `SendRemoveMail`) -> worlds `OnRemoveMail`
  -> client `REMOVEMAIL( nMail, 0 )`, and `MODE_MAILBOX` is cleared if no unread mail is left.
* **The item and penya are lost** — not returned to the sender (`__POST_1204` batch path is off; neither path returns anything).

### 7.3 Days / hours left — `CMail::GetMailInfo` (post.cpp:61-87), used by the inbox list and by the item-fee check (client and server)
```
span      = (now.dayOfMonth, h, m, s) - (created.dayOfMonth, h, m, s)   // COleDateTimeSpan; local time
nDay      = (int)( 16 - span.totalDays )          // MAX_KEEP_MAX_DAY + 1; C cast truncates toward 0
hoursLeft = (DWORD)( 360 - span.totalHours )      // MAX_KEEP_MAX_DAY * 24
```
* **Quirk**: only the day-of-month is used, not the full date. Inside one month it is right; across a month change it is wrong
  (made on the 30th, seen on the 2nd -> span = -28 days -> nDay = 44, hoursLeft = 1032). The server uses the same function for the
  fee, so client and server agree. The client rebuilds `m_tmCreate = clientNow - ageSeconds` (post.cpp:129-131), so the days are
  counted in the client's local time zone.
* Normal values: first 24 h -> 15 (16 only at span exactly 0), then 14, … ; when `nDay <= 1` the hours are shown instead.
* List text (WndField.cpp:15210-15218): `nDay <= 1` -> TID_PK_LIMIT_HOUR "%.1dhr" with hoursLeft (textClient.inc:5557), e.g. "23hr";
  else TID_PK_LIMIT_DAY "%.1dday" with nDay (:5562), e.g. "15day" (no space; `%.1d` = plain integer).
* Colour (:15114-15117, 15220-15226): `f = nDay / 7.0`; `r = (int)(255 - 255*f)`, `g = (int)(150*f)`, blue 0; then `D3DCOLOR_XRGB`
  keeps only the low 8 bits (`& 0xff`, two's complement). The lerp is not clamped, so values above 7 days **wrap**. Exact results:

| nDay | colour (r,g,b) | | nDay | colour |
|---|---|---|---|---|
| <= -1 (e.g. -1) | (35,235,0) | | 8 | (220,171,0) |
| 0 | (255,0,0) red | | 9 | (184,192,0) |
| 1 | (218,21,0) | | 10 | (147,214,0) |
| 2 | (182,42,0) | | 11 | (111,235,0) |
| 3 | (145,64,0) | | 12 | (74,1,0) |
| 4 | (109,85,0) | | 13 | (38,22,0) |
| 5 | (72,107,0) | | 14 | (1,44,0) |
| 6 | (36,128,0) | | 15 | (221,65,0) — a fresh mail |
| 7 | (0,150,0) green | | 16 | (185,86,0) |

  (Port: compute `(Math.trunc(255 - 255*f) & 0xff, Math.trunc(150*f) & 0xff, 0)` with f in float32 to match.)

### 7.4 Storage fee for taking the item (client WndField.cpp:14807-14837; server DPSrvr.cpp:5197-5218 — same formula)
```
if ( (360u - hoursLeft) > 168u ) {                 // unsigned compare: more than 7 days old
    fee = itemCost * (15 - 7 - nDay) / (15 - 7)     // = itemCost * (8 - nDay) / 8, float
    if (fee < 0) fee = 0;  fee = (int)fee;          // charged once, not per stack unit
}
```
* `itemCost` = `CItemBase::GetCost()` (_Common/Item.cpp:123-145): prop `dwCost`; with an upgrade level a:
  `(int)(dwCost + dwCost * (0.1 + a*a/18.0))`; `dwCost == 0xFFFFFFFF` -> -1 (fee 0).
* So: day 8 left -> 0 (the warning still shows "0"), 4 left -> half price, 0 left -> full price.
* Month-change quirk: when hoursLeft > 360 the unsigned subtraction wraps, the condition is true, nDay > 8 gives a negative fee -> 0;
  the warning box still appears with 0.

---------------------------------------------------------------------------------------------------------------------------

## 8. The new-mail notice (`MODE_MAILBOX`)

`MODE_MAILBOX = 0x00008000`, one bit of the mover's `m_dwMode` (_Common/authorization.h:121). Meaning: "has at least one unread mail".

### 8.1 Server side
* Set at login: `CDPDatabaseClient::OnJoin` -> `AdjustMailboxState()` (WORLDSERVER/DPDatabaseClient.cpp:990; User.cpp:3739-3746):
  set if the world's copy of the box has an unread mail (`IsStampedMailExists`, post.cpp:487-506). It travels in the normal mover
  data. (The world only has a copy if the box was loaded in this world-server session — `SendAllMail` is compiled out by
  `__JEFF_FIX_0`, databaseserver/dptrans.cpp:312-314.)
* Set on every new mail for an online receiver: `SetMode( MODE_MAILBOX )` + `g_UserMng.AddModifyMode( pUser )`
  (DPDatabaseClient.cpp:2629-2633) = snapshot `MODIFYMODE` to every player in visibility range (User.cpp:5158-5169).
* Cleared after a read or delete when no unread mail remains (DPDatabaseClient.cpp:2684-2688, 2785-2789) + `AddModifyMode`.
  Taking the item or penya does not change it.

### 8.2 Client side — three places
1. **Instant message popup** (`CWndInstantMsg`, Source/_Interface/WndMessenger.cpp:990-1104): `g_WndMng.OpenInstantMsg( "Mail" )`
   (WndManager.cpp:7128-7155) re-uses the open "Mail" popup or creates one at the bottom-right of the screen (stacked upward/leftward
   by the number of open instant messages); `AddPostMessage( TID_MAIL_RECEIVE )` plays `SND_INF_MESSENGERRING`, appends the line
   **"New mail has arrived"** (textClient.inc:6441) and resets the timer; the caller sets the timer to **1 minute**; the popup closes
   itself when the timer runs out (:996-1002). Clicking a "Mail" popup does nothing (:1039-1047, 1051-1070).
   Layout `APP_INSTANTMSG` (ResData.h:129 = 224), resdata.inc:25074-25094: `WndInstantMsg.tga` (144x112, not tiled), `WBS_NOFOCUS`;
   WIDC_TEXT (ResData.h:878 = 159) TEXT 0,0,132,80 on WndEditTile00 (tiled).
   Triggered (a) on world entry if the bit is set (`CWndWorld::OnInitialUpdate`, WndWorld.cpp:3792-3801), and (b) in
   `OnModifyMode` whenever a MODIFYMODE for **my own** mover arrives with the bit set (DPClient.cpp:12358-12377).
2. **Chat line** (only in case b): `PutString( "New mail has arrived", colour of TID_ADMIN_NORMAL = 0xffffff99 )` (DPClient.cpp:12372).
   Note: case (b) repeats on every MODIFYMODE for me while the bit stays set (each new mail, and any other mode change).
3. **Blinking envelope in the Messenger window** (`CWndMessengerEx`, `APP_MESSENGER_EX` ResData.h:207 = 302, resdata.inc:2180-2299,
   WndTile10.tga tiled 352x368): control `WIDC_CUSTOM1` (ResData.h:1190 = 870) CUSTOM **56,312,68,324** (12x12). While the bit is
   set, Theme `WndMail.dds` (12x12) is drawn at its top-left with alpha `m_nFlashCounter` (WndMessenger.cpp:486-490); `Process()`
   moves the alpha by 8 per frame between 50 and 255 and back (blink; starts at 0, :622-639, 717-718); mouse-over shows the tooltip
   "New mail has arrived" (:641-654). Not drawn when the bit is clear. Only visible while the Messenger window is open.
   (The same pulse is also drawn over WIDC_BUTTON2 for unread notes/tags — not mail, :492-496.)
* There is **no** taskbar/HUD mail icon in V15 (grep `MODE_MAILBOX` in the client: only DPClient.cpp, WndMessenger.cpp, WndWorld.cpp).

---------------------------------------------------------------------------------------------------------------------------

## 9. Every refusal and message

Kinds: **chat** = `g_WndMng.PutString( text, NULL, TID colour )`; **box** = modal OK box (`OpenMessageBoxUpper`, colour ignored) —
server `AddDiagText` arrives as snapshot TEXT/TEXT_DIAG and is shown the same way (DPClient.cpp:1598-1600); **defined** = server
`AddDefinedText` -> chat in the TID colour (DPClient.cpp:4123-4178). Colours from textClient.inc.

| TID (textClient.inc line) | English | colour | kind | where |
|---|---|---|---|---|
| TID_GAME_TRADENOTPOST (:7659) | You cannot use the Mailbox while trading. | 0xffff0000 | chat | client, open post while trading (WndWorld.cpp:4531) |
| TID_MAIL_OTHERWORK (:6456) | Not available | 0xffffffff | chat | client, post already open (WndWorld.cpp:4537); Trade menu while post open (:5263) |
| TID_GAME_BANKTRADESELF (:1097) | You cannot trade while using the bank. | 0xffff0000 | chat | client, bank open (:4543) |
| TID_GAME_BANKSTILLUSING (:1847) | You are already using the bank. | 0xffffffff | chat | client, bank confirm/guild bank/bank password open (:4549-4562) |
| TID_GAME_REPAIR_NOACTION (:2732) | You cannot use an item while repairing. | 0xffffffff | chat | client, repair open (:4569) |
| TID_GAME_TRADENOTBEAUTYSHOP (:1927) | You cannot use the beauty shop while trading. | 0xffff0000 | chat | client, shop open (:4576) |
| TID_GAME_FACESHOPUSING (:7609) | You are using Cosmetic Upgrades. | 0xffffffff | chat | client (:4584) |
| TID_GAME_BEAUTYSHOPUSING (:1932) | You are using the beauty shop. | 0xffffffff | chat | client (:4594) |
| TID_GAME_SUMMONANGELUSING (:7639) | You have summoned an Angel. | 0xffffffff | chat | client (:4602) |
| TID_GAME_TRADENOTSUMMONANGEL (:7644) | You cannot summon an Angel while trading. | 0xffff0000 | chat | client, summon-angel NPC while post open (:4826) |
| TID_GAME_EQUIPPUT (:1817) | Please unequip the item first. | 0xffff0000 | chat | client, attach equipped item (WndField.cpp:14303) |
| TID_GAME_CHARGED_NOTUSE (:6473) | You can not use the premium items. | 0xffffffff | chat | client, attach premium item (:14322) |
| TID_GAME_MOVECOUNT (:3217) / TID_GAME_NUMCOUNT (:3227) | Move how many items? / Number: | — | labels | stack count window (:14344-14347) |
| TID_GAME_LIMITPENYA (:6696) | You can not send that much Penya. | (0xffff0000) | box | client, penya > 1,000,000,000 (:14457) |
| TID_DIAG_0057 (:2267) | That name is too long.  Please try again. | — | box | client, receiver < 3 or > 16 bytes (:14464) |
| TID_GAME_MAILBOX_TEXT_MAX (:7201) | The text should be under 256 letters. | — | box | client, body > 255 bytes (:14471) |
| TID_GAME_MAILBOX_TITLE_MAX (:7206) | The title should be under 32 letters. | — | box | client, title > 31 bytes (:14479) |
| TID_MAIL_SEND_CONFIRM (:6431) | Would you like to send mail?\n Received mail will be deleted after 15 days. | — | OK/Cancel box | client (:14047) |
| TID_MAIL_UNKNOW (:6451) | Unknown user | — | box | server, unknown receiver (DPSrvr.cpp:5131); client Reply dead check (WndField.cpp:14903) |
| TID_GAME_MSGSELFSENDERROR (:3632) | You cannot send a message to yourself, silly. | — | box | server (DPSrvr.cpp:5029) |
| TID_GAME_MAILBOX_FULL (:7176) | %s's mail box is full. | 0xffffffff | defined (chat) | server, receiver has 50 mails (DPSrvr.cpp:5040) |
| TID_GAME_CANNOT_POST (:6684) | You cannot send this item. | (0xff00ff00) | box | server item checks (DPSrvr.cpp:5049-5097) |
| TID_GAME_CANNOT_DO_USINGITEM (:8250) | You are already using that item | — | box | server (DPSrvr.cpp:5069) |
| TID_GAME_LACKMONEY (:907) | You do not have enough Penya. | (0xffff0000) | box | server, postage + penya (DPSrvr.cpp:5102); storage fee (:5214) |
| TID_MAIL_SEND_OK (:6436) | You have sent mail. | — | box | server, to the sender after DB success (DPDatabaseClient.cpp:2637) |
| TID_GAME_POST_ERROR (:6688) | You have failed to send. | (0xff00ff00) | box | server, DB failure, refund (DPDatabaseClient.cpp:2653) |
| TID_GAME_LACKSPACE (:912) | Inventory is full. Please make room and try again.. | (0xffff0000) | box | server, take item with 0 free slots (DPSrvr.cpp:5187) |
| TID_GAME_MAILBOX_KEEP_PAY (:7186) | The time %d for basic custody expired. Therefore you should pay %d penya as charges for custody. | — | warning window | client, (7, fee) (WndField.cpp:14830) |
| TID_MAIL_DELETE_CONFIRM (:6446) | Do you want to delete this mail? \nIf you do, items and penya in this mail will be deleted as well. | — | confirm window | client (WndField.cpp:14973) |
| TID_GAME_MAIL_RECEIVE_DATE (:6466) | The received date : %s | — | tooltip | client list (WndField.cpp:15246) |
| TID_PK_LIMIT_DAY (:5562) / TID_PK_LIMIT_HOUR (:5557) | %.1dday / %.1dhr | — | list text | client (WndField.cpp:15213-15217) |
| TID_MAIL_RECEIVE (:6441) | New mail has arrived | chat 0xffffff99 (TID_ADMIN_NORMAL :1742) | popup + chat + tooltip | client (DPClient.cpp:12363-12372; WndWorld.cpp:3797; WndMessenger.cpp:652) |
| TID_APP_POST_SEND (:22) / TID_APP_POST_RECEIVE (:27) | Send Mail / Inbox | — | tab labels | client (WndField.cpp:13872-13876) |
| TID_MMI_POST (:1422) | Mailbox | — | NPC menu (not shown: single entry) | client |

Silent refusals (no message): client — receiver or title empty, penya not all digits; server — trading / vendor / bank open /
`m_bAllAction` off, not within 32 units of a postbox, `nItemNum <= 0`, negative or overflowing penya; Delete on a Sealed Character
mail; Reply to an unknown sender (dead check).
Strings hard-coded in the client (not TIDs): `"FLYFF"` (system sender), `"Unknown"` (empty sender), `"..."`, `"Re:"`, `"0"`.

---------------------------------------------------------------------------------------------------------------------------

## 10. Packets

Notation (same as guild-research/B-packets.md section 0): little-endian; `u_long`/`DWORD`/`int`/`BOOL`/`time_t` = 4 bytes
(`_USE_32BIT_TIME_T` in Neuz/StdAfx.h:10, WORLDSERVER/StdAfx.h:4, databaseserver/StdAfx.h:9), `short` = 2, `BYTE` = 1.
**string** = `int32 len` + `len` bytes, no NUL (_Network/Misc/Src/ar.cpp:81-86); the reader `ReadString(buf, n)` throws away the rest
of the message if `len > n-1` (ar.cpp:99-119), and reads past the end return 0 (_Network/Misc/Include/ar.h:135-139).
Client -> server: `BEFORESENDSOLE` = `DWORD 0xFFFFFFFF` + `DWORD type` + payload; all mail types go to the **world** server (not on
the cache's core list). Server -> client: inside `PACKETTYPE_SNAPSHOT` (0xffffff00); each entry = `OBJID` + `WORD snapshotType` + payload.

### 10.1 Client -> world

| type (MsgHdr.h line) | payload | sender (DPClient.cpp) | world handler (DPSrvr.cpp) | then |
|---|---|---|---|---|
| `QUERYPOSTMAIL` 0x0000001a (:31) | `BYTE nItem` (inventory item id = `m_dwObjId`, 0xff = none), `short nItemNum` (0 if none), `string receiver` (server max 41), `int nGold`, `string title` (max 31), `string text` (max 255) | :15840-15852 | OnQueryPostMail :4970-5140 | DB ADD_MAIL |
| `QUERYREMOVEMAIL` 0x0000001b (:32) | `u_long nMail` | :15854-15862 | :5142-5168 | DB REMOVE_MAIL |
| `QUERYGETMAILITEM` 0x0000001c (:33) | `u_long nMail` | :15864-15872 | :5170-5223 | DB REMOVE_MAIL_ITEM |
| `QUERYMAILBOX` 0x0000001d (:34) | (none) | :15894-15901 | :5288-5376 | 2.3 |
| `QUERYGETMAILGOLD` 0x0000001f (:36) | `u_long nMail` | :15874-15882 | :5225-5258 | DB REMOVE_MAIL_GOLD |
| `READMAIL` 0x00000024 (:37) | `u_long nMail` | :15884-15892 | :5260-5286 | DB READ_MAIL |

Handlers registered at WORLDSERVER/DPSrvr.cpp:339-344.

### 10.2 World -> client snapshots (registered at Neuz/DPClient.cpp:681-684; sent from WORLDSERVER/User.cpp)

| snapshot (MsgHdr.h line) | objid | payload | sent by | client handler |
|---|---|---|---|---|
| `QUERYMAILBOX` 0x00e9 (:1144) | own player | `CMailBox::Serialize`: `u_long idReceiver`, `int count`, then `count` x **CMail** (below) | `AddMailBox` User.cpp:6761-6770 | `OnMailBox` DPClient.cpp:15982 |
| `QUERYMAILBOX_REQ` 0x8860 (:1332) | own player | `BOOL bHaveMailBox` | `SendCheckMailBoxReq` User.cpp:6772-6780 | `OnMailBoxReq` :16026 |
| `REMOVEMAIL` 0x00e7 (:1143) | own player | `u_long nMail`, `int nType` (0 = mail removed, 1 = item taken, 2 = penya taken, 3 = read) | `AddRemoveMail` User.cpp:6750-6759 | `OnRemoveMail` :15924 |
| `POSTMAIL` 0x00e6 (:1142) | own player | one **CMail** | `AddPostMail` User.cpp:6739-6748 — **never sent** (2.3) | `OnPostMail` :15903 (crashes on a mail without item; don't port the log line) |
| `MODIFYMODE` 0x00d3 (:1130) | any mover in range | `DWORD dwMode` | `CUserMng::AddModifyMode` User.cpp:5158-5169 | `OnModifyMode` :12278 (section 8) |
| `TEXT` 0x00a0 (:1068) + `BYTE TEXT_DIAG = 0x02` (:1574) | NULL_ID | `string` | `AddDiagText` User.cpp:719-731 | box (DPClient.cpp:1598-1600) |
| `DEFINEDTEXT` 0x0095 (:1056) | own player | `DWORD tid`, `string args` | `AddDefinedText` User.cpp:2241-2262 | chat (DPClient.cpp:4123-4178) |

**CMail** on the wire (`CMail::Serialize( ar, TRUE )`, _Common/post.cpp:89-136):

| field | size | note |
|---|---|---|
| `u_long nMail` | 4 | mail id (unique, from the DB server) |
| `u_long idSender` | 4 | 0 = system ("FLYFF") |
| `BYTE hasItem` | 1 | 1 -> followed by `CItemElem::Serialize` (the standard one, _Common/ObjSerialize.cpp:48) |
| `DWORD nGold` | 4 | penya attached |
| `time_t age` | 4 | **seconds since creation** (`serverNow - tmCreate`); client sets `tmCreate = clientNow - age` |
| `BYTE byRead` | 1 | 0 unread, 1 read |
| `string title` | 4 + n | client buffer 32 (max 31) |
| `string text` | 4 + n | client buffer 256 (max 255) |

The client keeps one global `CMailBox` (post.cpp:186-190); `QUERYMAILBOX` replaces it completely (`Clear()` then read, post.cpp:360-381).
`AddMail` on the client keeps the server's `nMail` (post.cpp:209-214). Mails are addressed by `nMail` in every packet; the windows
address them by **vector index** (`m_nMailIndex`, `m_nSelect`).

### 10.3 Which server does what
* **World server** (WORLDSERVER/DPSrvr.cpp, DPDatabaseClient.cpp, User.cpp): all client packets, all checks, postage and fee,
  inventory changes, `MODE_MAILBOX`, keeps a per-player copy of the box.
* **Database ("trans") server** (databaseserver/dptrans.cpp:94-107, 1107-1300; _Database/DbManager.cpp:4506-4528, 6050-6281, 7242-7330):
  owns all mailboxes (`CPost`), mail ids, SQL (`MAIL_STR` A1 add / D1 delete / U1 item taken / U2 penya taken / U3 read / D2 batch),
  the 1-minute expiry and the web-shop mail poll; answers go to **all** worlds (`DPID_ALLPLAYERS`) and each world acts only for its
  own users (`uQuery == g_uIdofMulti` decides who creates the item/penya).
* World <-> DB packet ids: same numbers as the client ones (`QUERYPOSTMAIL` … `READMAIL`) plus `QUERYMAILBOX_REQ` 0x88100240 and
  `QUERYMAILBOX_COUNT` 0x88100241 (MsgHdr.h:876-877), `ALLMAIL` 0x1e (unused on main). Layouts: WORLDSERVER/DPDatabaseClient.cpp:2434-2594
  (world -> DB) and databaseserver/dptrans.cpp:1186-1283 (DB -> world: `QUERYPOSTMAIL` = `BOOL bResult, u_long idReceiver, CMail`;
  `QUERYREMOVEMAIL`/`READMAIL` = `u_long idReceiver, u_long nMail`; `QUERYGETMAILITEM`/`QUERYGETMAILGOLD` = `idReceiver, nMail, u_long uQuery`).
* **Core server**: not involved (grep: no mail code in CORESERVER or CACHESERVER).

### 10.4 Other senders of mail (all `idSender = 0`, shown as "FLYFF")
Restores of 6.3/6.5 (DPDatabaseClient.cpp:2727, 2767), guild siege refunds/prizes (DPDatabaseClient.cpp:527, 609; _Common/eveschool.cpp:485-1614),
Sealed Character (DPSrvr.cpp:8846), buffs/items that do not fit (_Common/buff.cpp:266; EventLua.cpp:562, 868), 1:1 guild siege
(GuildCombat1to1.cpp:295), guild house (GuildHouse.cpp:2378-2418), mini-games (MiniGame.cpp:189-593), rainbow race (RainbowRace.cpp:663-694),
secret room (SecretRoom.cpp:986), attendance (User.cpp:7681), DB side: couple, quiz, lord, tax (couplehelper.cpp:257, QuizDBCtrl.cpp:329,
tlord.cpp:407, 530, Tax.cpp:719), and the web-shop poll (DbManager.cpp:7242-7330). Their title/text are often an item name or empty.

---------------------------------------------------------------------------------------------------------------------------

## Builder summary

### Rules
| topic | rule | source |
|---|---|---|
| open | NPC `MaFl_Postbox` (MMI_POST 25, single menu -> opens directly) within 20 units; refused if trade/post/bank/repair/shop/beauty/angel window open (2.2 table); opens inventory too | WndWorld.cpp:4525-4612, 6517-6689 |
| on open | window disabled, tab "Inbox" selected, send QUERYMAILBOX, show modal "Mail Request" box (button enabled after 5 s, re-query; auto close after 3 presses) until the box arrives | WndField.cpp:13850-13900; WndMailRequestingBox.cpp |
| refresh | QUERYMAILBOX on open, on every switch to Inbox, on Request button, every 5 s while waiting; new mail is never pushed into an open window | 2.3 |
| close | close button; any movement; accepting a duel | WndWorld.cpp:8051-8394; WndDuelConfirm.cpp:248-259 |
| tabs | 0 "Send Mail", 1 "Inbox" (default); tab strip at the bottom of the tab control | WndField.cpp:13869-13880 |
| receiver | editable combobox + friend list; 3..16 bytes; not yourself; must exist | WndField.cpp:14461; DPSrvr.cpp:5017-5031 |
| title | required; <= 31 bytes; auto-filled with the item name on attach; "Re:" + shown title on reply | WndField.cpp:14421, 14476, 14350, 14933 |
| body | optional; <= 255 bytes; Enter = '\n' | WndField.cpp:14468 |
| penya | digits only (else silent), <= 1,000,000,000 (client), >= 0; may be 0 | WndField.cpp:14433-14459 |
| item | 1 item from the inventory, not equipped / premium (client), not in trade, quest, bound, guild cloak, vagrant ride, in use (server); stack -> count window | 4.2, 4.6 |
| postage | **500 penya** (server; 100 only for Korean), same with or without item, paid with the sent penya; label "Rental Fee : 500 Penya" is static | DPSrvr.cpp:4986-4989, 5100-5106 |
| distance | sending needs a postbox within 32 units (server, silent); reading/taking/deleting has no distance check | npchecker.cpp:56-72 |
| box size | receiver max 50 mails -> "%s's mail box is full." | DPSrvr.cpp:5037-5042 |
| after send | confirm box; on OK only the attachment is cleared, texts stay; "You have sent mail." box when stored | WndField.cpp:14064-14087; DPDatabaseClient.cpp:2637 |
| list | 6 rows x 40 px, oldest first, icon (item / penya seed / none), read overlay WndNotUse alpha 110, sender (16 ch, "FLYFF", "Unknown"), days/hours left (coloured, wraps), title blue (13 ch), date tooltip, double-click to read | 5 |
| read | modal window; READMAIL sent on every open; right-click or drag item/penya to take; Delete (confirm; not for Sealed Character); Reply; Close | 6 |
| keep | 15 days, then deleted with item and penya (DB checks every minute); no return to sender | 7.2 |
| fee | taking an item after 7 days costs `cost * (8 - daysLeft) / 8` (warning window first) | 7.4 |
| notice | `MODE_MAILBOX` (0x8000) = has unread mail; popup "New mail has arrived" 1 min + chat line (0xffffff99) on MODIFYMODE; popup on world entry; blinking 12x12 envelope in the Messenger at 56,312 | 8 |

### Packets
| dir | id | name | payload |
|---|---|---|---|
| C->W | 0x0000001a | QUERYPOSTMAIL | BYTE itemId(0xff none), short count, str receiver, int penya, str title, str text |
| C->W | 0x0000001b | QUERYREMOVEMAIL | u_long nMail |
| C->W | 0x0000001c | QUERYGETMAILITEM | u_long nMail |
| C->W | 0x0000001d | QUERYMAILBOX | — |
| C->W | 0x0000001f | QUERYGETMAILGOLD | u_long nMail |
| C->W | 0x00000024 | READMAIL | u_long nMail |
| W->C snap | 0x00e9 | QUERYMAILBOX | u_long idReceiver, int n, n x CMail |
| W->C snap | 0x8860 | QUERYMAILBOX_REQ | BOOL hasMail (FALSE = empty box, close the request box) |
| W->C snap | 0x00e7 | REMOVEMAIL | u_long nMail, int type (0 mail, 1 item, 2 penya, 3 read) |
| W->C snap | 0x00e6 | POSTMAIL | CMail — never sent by this server |
| W->C snap | 0x00d3 | MODIFYMODE | DWORD dwMode (bit 0x8000) |
| CMail | — | — | u_long nMail, u_long idSender, BYTE hasItem [+CItemElem], DWORD penya, int32 ageSeconds, BYTE read, str title, str text |

---------------------------------------------------------------------------------------------------------------------------

## Open questions

1. **Postbox spawn positions**: the dyo record layout was not verified; the floats near the 4 `MaFl_Postbox` records
   ((1739,802), (2116,900), (958,1114), (1490,1351)) do not obviously match Flarine. Use the server's / port's NPC spawn data.
2. **Month bug in days left** (7.3): copy it faithfully (it also decides the storage fee on the server, so the warning number would
   match) or fix the display only? Faithful is safer for the fee warning.
3. **Stale list state** (6.9): the original never calls `UpdateScroll()` after REMOVEMAIL and indexes by vector position (read window
   `m_nMailIndex`, list `m_nSelect`). Recommend: recompute count/scroll and keep the selection by `nMail`.
4. After the request box closes itself (3 presses), the post window stays disabled until data arrives — not verified whether its close
   button still works in the original. Port: keep the close button usable.
5. Drag-and-drop from the **modal** read window onto the inventory: code exists (WndField.cpp:2015-2032) but whether the modal window
   lets the inventory receive the drop was not checked. Right-click always works.
6. TID texts with a literal `\n` (TID_MAIL_SEND_CONFIRM, TID_MAIL_DELETE_CONFIRM): use the port's existing rule for `\n` in text tables.
7. Date tooltip: `COleDateTime::Format()` uses the Windows user locale; pick a fixed format (e.g. en-US "M/D/YYYY h:mm:ss AM").
8. Whether `CWndWorld::OnInitialUpdate` (popup on world entry) also runs after a teleport/world change was not checked.
9. FlyffWeb already prints the MODE_MAILBOX chat line for the own mover (FlyffWeb/apps/client/src/world/WorldScreen.ts:3454-3463,
   `Mode.MAILBOX` in gmModes.ts:27); the instant-message popup, the world-entry popup and the messenger envelope are still missing.
10. Friend entries whose PlayerData is not loaded give an empty name in the recipient dropdown (GetPlayerString returns "" and queries);
    decide whether to skip empty names.

