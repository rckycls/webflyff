# A — FlyFF V15 bank ("Custody") — research notes for the FlyffWeb port

Scope: the personal bank of the V15 Neuz client (window title "Bank"), its PIN windows, packets and server rules. Research only,
no source changed. "Custody" in the game text is the **Scroll of Private Custody** (`II_SYS_SYS_SCR_CUSTODY`), which opens the
same bank away from an NPC (section 2.4).

Paths are relative to `Source/` (C++), `Resource/` (resdata.inc, ResData.h, text tables) or the repo root (`Database.sql`).
Line numbers are the original CP949 / UTF-16 file lines (iconv keeps them). Text: TID -> number from `Resource/defineText.h`,
colour + IDS key from `Resource/textClient.inc`, English from `Resource/textClient.txt.txt`; window/control strings are
`IDS_RESDATA_INC_*` from `Resource/resData.txt.txt` (that file is ASCII, not UTF-16).

Packet notation (same as guild-research/B-packets.md section 0): little-endian; `BYTE`=1, `short`=2, `int`/`DWORD`/`OBJID`/`u_long`=4;
`String` = `int32 len` + `len` bytes, no NUL (`_Network/Misc/Src/ar.cpp:81-86`). Client->server body = `DWORD dpid (0xFFFFFFFF)` +
`DWORD packetType` + payload (`BEFORESENDSOLE`, `_Network/Net/Include/dpmng.h:32`). Server->client bank replies are **world
snapshots**: inside `PACKETTYPE_SNAPSHOT`, each message is `OBJID objid` + `WORD snapshotType` + payload (see guild B-packets.md 0).

Status: complete (sections 1-11, 2026-11-10).

---------------------------------------------------------------------------------------------------------------------------

## 1. Build switches

| define | on for __MAINSERVER V15? | effect on the bank | evidence |
|---|---|---|---|
| `__MAINSERVER`, `__VER 15` | yes | — | Neuz/VersionCommon.h:3-4 (WORLDSERVER same) |
| no `__BANK*` / `__BANKPASS*` define exists | — | the bank, the PIN windows and the 3-character ("common") bank are **not behind any define**; they are always compiled and always on. Only grep hit for "BANK" in the two VersionCommon.h is the commented `__GUILD_BANK_LOG` (Neuz/VersionCommon.h:71). | grep |
| `__SYS_POCKET` (`__VER >= 11`) | yes (code tests `__VER`) | opening the bank closes the portable bag window `APP_BAG_EX` | WndBank.cpp:50-52 |
| `__SYS_IDENTIFY` (`__VER >= 11`) | yes | server refuses bound items with `IsBinds()` instead of the old `binds` flag | DPSrvr.cpp:1313-1319 |
| `__S8_PK` (`__VER >= 8`) | yes | chaotic players: refused if `PKSetting` propensity row has `nBank == 0` (client + server) | WndWorld.cpp:5523-5533, DPSrvr.cpp:1043-1050 |
| `__S_SERVER_UNIFY` | yes (Neuz/VersionCommon.h:26, WORLDSERVER/VersionCommon.h:31) | server ignores CONFIRMBANK while `m_bAllAction == FALSE` (forced-rename state) | DPSrvr.cpp:1891-1894 |
| `__MOD_TUTORIAL` (`__VER >= 12`) | yes | opening the bank ticks the tutorial guide condition "window APP_COMMON_BANK opened" | WndBank.cpp:158-165 |
| `__IMPROVE_SYSTEM_VER15` | yes | (inventory only) item tooltip with sub-tooltip; the **bank** item ctrl uses the plain `PutToolTip_Item(..., APP_INVENTORY)` path | WndItemCtrl.cpp:232-244 |

Custom `__BB_*` code that touches the bank (leave out of the port, listed only):
* `__BB_STAFF_MODERATOR_AUTH` (Neuz/VersionCommon.h:212, WORLDSERVER/VersionCommon.h:213): staff-moderator accounts get
  `TID_GAME_BANKNOTRADE` and are refused in OnOpenBankWnd (DPSrvr.cpp:1033-1039), OnBankToBank (:1195-1201), OnPutItemBank
  (:1288-1294), OnPutGoldBank (:1738-1744), OnConfirmBank (:1878-1884). Not in OnGetItemBank / OnGetGoldBank / OnChangeBankPass.
* `__BB_INVENTORY_SORT` (Neuz/VersionCommon.h:213): inventory-only; it sits next to `SendMoveBankItem` in DPClient.cpp:9364 but
  does not touch the bank.
* No `__BB_*` in `_Interface/WndBank.cpp/.h`.

---------------------------------------------------------------------------------------------------------------------------

## 2. How the bank opens and closes

### 2.1 NPC menu entry
* `MMI_BANKING = 9` (Resource/defineNeuz.h:101). Menu text = `prj.GetText( TID_MMI_DIALOG + i )` (WndWorld.cpp:6667-6680), i.e.
  `TID_MMI_BANKING` = 7009 (defineText.h:336) -> **"Deposit"** (textClient.txt.txt:291, colour 0xffffffff, textClient.inc:1462).
* NPCs with `AddMenu( MMI_BANKING )` (Resource/character.inc, UTF-16; names from character.txt.txt):

| NPC key | character.inc | name | other menus | placed in |
|---|---|---|---|---|
| `MaFl_Juria` | :469-474 | **Julia** (IDS_CHARACTER_INC_000057), portrait char_Juria.tga | Dialog, Deposit, guild bank, 3 guild rankings, Trade (scrolls), quiz | Flaris (WdMadrigal.dyo) |
| `MaSa_Helena` | :1119-1124 | **Helena** (…000127) | same minus quiz | Saint Morning (WdMadrigal.dyo) |
| `MaDa_Ollien` | :2458-2463 | **Ollien** (…000290) | same as Helena | Darkon (WdMadrigal.dyo) |
| `MaFl_Jeffo` | :3567-3573 | Jeffo (…000416) | Deposit, quiz | **not placed** in any world .dyo (grep) |
| `MaFl_InstantBank` | :3588-3592 | **Banker Pang** (…000418), char_InfoPeng.tga | Deposit only | **not placed** in any .dyo (grep); no code spawns it (no source hit for "InstantBank" except the server flag `m_bInstantBank`) |

  The three real bankers also appear in WdIvilisTemple.dyo (byte grep hit; probably a copy of the town set).

### 2.2 Click on "Deposit" (client checks, in order) — WndWorld.cpp:5451-5536
Each refusal prints a chat line `g_WndMng.PutString( text, NULL, colour )`:

| # | condition | message (TID, English, colour) | line |
|---|---|---|---|
| 1 | trade window `APP_TRADE` open | `TID_GAME_TRADENOBANK` "You cannot trade items when using the bank." red 0xffff0000 | :5453-5458 |
| 2 | repair window `APP_REPAIR` open | `TID_GAME_REPAIR_NOACTION` "You cannot use an item while repairing." white | :5459-5464 |
| 3 | NPC shop `APP_SHOP_` open | `TID_GAME_BANKNOTRADE` "You cannot use the bank while trading" red | :5465-5470 |
| 4 | bank `APP_COMMON_BANK`, PIN `APP_CONFIRM_BANK` or set-PIN `APP_BANK_PASSWORD` already open | `TID_GAME_BANKSTILLUSING` "You are already using the bank." white | :5471-5488 |
| 5 | drop-item count window `APP_DROP_ITEM` open | nothing printed, just stops | :5489-5491 |
| 6 | guild bank `APP_GUILD_BANK` open | `TID_GAME_BANKSTILLUSING` | :5492-5497 |
| 7 | beauty shop (`APP_BEAUTY_SHOP_SKIN`, `APP_BEAUTY_SHOP_EX`) open | `TID_GAME_BEAUTYSHOPUSING` "You are using the beauty shop." white | :5498-5513 |
| 8 | summon-angel window open | `TID_GAME_SUMMONANGELUSING` "You have summoned an Angel." white | :5514-5521 |
| 9 | chaotic and propensity `nBank == 0` | `TID_GMAE_CHAOTIC_NOT_BANK` "A character with a bad Disposition cannot use bank." red | :5523-5532 |
| — | otherwise | `g_DPlay.SendOpenBankWnd( NULL_ID, 0 )` | :5534 |

### 2.3 Open sequence (packets)
1. C->S `PACKETTYPE_OPENBANKWND` = `DWORD dwId, DWORD dwItemId` (DPClient.cpp:9674-9679). From the NPC: `dwId = NULL_ID (0xFFFFFFFF)`,
   `dwItemId = 0`. From the Custody scroll: `dwId` = scroll's inventory objid, `dwItemId` = its item index (2.4).
2. Server `CDPSrvr::OnOpenBankWnd` (DPSrvr.cpp:1025-1062):
   * NPC path (`dwId == NULL_ID`) needs a `MMI_BANKING` NPC in the same world with **3-D distance squared < 1024 (32 m)**
     (`CNpcChecker::IsCloseNpc`, WORLDSERVER/npchecker.cpp:56-72, `MAX_LEN_MOVER_MENU 1024`, npchecker.h:4). Else silent return.
   * Chaotic with propensity `nBank == 0` -> silent return (:1043-1050).
   * If the character's PIN is still **"0000"** -> `AddBankWindow( 0, dwId, dwItemId )` (open the *set PIN* window), else
     `AddBankWindow( 1, ... )` (open the *enter PIN* window) (:1051-1060). Nothing else is checked here (no trade/vendor check).
3. S->C snapshot `SNAPSHOTTYPE_BANKWINDOW`: `int nMode, DWORD dwId, DWORD dwItemId` (User.cpp:1071-1081).
   Client `OnBankWindow` (DPClient.cpp:3031-3055) deletes any bank / PIN / set-PIN window, then
   * `nMode != 0` -> `CWndConfirmBank` (APP_CONFIRM_BANK, "Bank Password") with `SetItem(dwId, dwItemId)`;
   * `nMode == 0` -> `CWndBankPassword` (APP_BANK_PASSWORD) in mode 0 ("first time": old PIN field pre-filled "0000").
4. The bank itself opens only after a correct PIN: snapshot `SNAPSHOTTYPE_CONFIRMBANKPASS` with `nMode = 1`
   (DPClient.cpp:3113-3128): `g_WndMng.CreateApplet( APP_INVENTORY )` **(opens the inventory)**, then `new CWndBank` ->
   `Initialize( &g_WndMng, APP_COMMON_BANK )`. So **yes, opening the bank also opens the inventory**, and the bank is placed
   next to it (section 4.4). Details of the PIN step: section 3.

The bank contents are **not** sent on open; they arrived at login (section 7).

### 2.4 Scroll of Private Custody (remote bank)
* Item `II_SYS_SYS_SCR_CUSTODY` = 15083 (Resource/defineItem.h:2639), propItem.txt:2118: IK1_SYSTEM / IK3_SCROLL, name
  "Scroll of Private Custody", desc "Allows you to instantly access your bank account." (propItem.txt.txt:4729-4730).
* Using it (double-click) does not send `DOUSEITEM`; the client sends `SendOpenBankWnd( item objid, item index )`
  (DPClient.cpp:10519-10523). The server skips the NPC distance check because `dwId != NULL_ID` (DPSrvr.cpp:1041), and the
  normal PIN flow follows.
* On the correct PIN (OnConfirmBank, DPSrvr.cpp:1908-1920) the server checks the scroll is still in the inventory, usable, and
  its index equals `dwItemId`; then sets `m_bInstantBank = TRUE` and **removes 1 scroll** (`RemoveItem`). Wrong PIN -> scroll kept.
* While `m_bInstantBank` is TRUE the put/get handlers skip the NPC distance check (DPSrvr.cpp:1295-1299, 1678-1682, 1745-1749,
  1798-1802). Note: **OnBankToBank never checks distance** (any path).
* `m_bInstantBank` is cleared by CLOSEBANKWND (DPSrvr.cpp:1100) and is FALSE on login (User.cpp:178). One scroll = one session.

### 2.5 How it closes
| trigger | what happens | evidence |
|---|---|---|
| X button / ESC / any destroy of the bank window | `~CWndBank` sends `PACKETTYPE_CLOSEBANKWND` (no payload) and deletes the quantity window `m_pWndTradeGold` | WndBank.cpp:20-24; DPClient.cpp:9710-9714 |
| closing the **inventory** | `CWndInventory::OnDestroy` destroys the bank (-> CLOSEBANKWND) | WndField.cpp:1018, 1103-1105 |
| the player **moves** (state not STAND, or moving backwards), checked every frame | bank destroyed + explicit `SendCloseBankWnd()` (so CLOSEBANKWND is sent **twice**), `APP_TRADE_GOLD` and the **inventory** destroyed too; the PIN and set-PIN windows are also destroyed | WndWorld.cpp:8051-8052, 8313-8324, 8332-8337 |
| accepting a duel (Yes in `CWndDuelConfirm`) | same as moving: bank + trade-gold + inventory + PIN windows closed | WndDuelConfirm.cpp:177-201 |
| server side | `OnCloseBankWnd` sets `m_bBank = FALSE`, `m_bInstantBank = FALSE` (DPSrvr.cpp:1094-1102). There is **no server-side distance watchdog**: walking away is handled only by the client closing on movement; each put/get re-checks distance (2.3) unless instant. | |

Notes for the port: the WTBID_CLOSE branch of `CWndBank::OnChildNotify` is empty (its `SendCloseBankWnd` is commented,
WndBank.cpp:401-405) — the destructor does the send. Opening a trade/shop/guild bank/vendor while the bank is open: see 8.

---------------------------------------------------------------------------------------------------------------------------

## 3. The bank PIN ("password")

### 3.1 Facts
* 4 characters, digits only (client check). Stored **per character** (not per account) in `BANK_TBL.m_BankPw char(4)`, default
  `'0000'` (Database.sql:2753-2761, default constraint :12539, char-creation insert :10629). The world server gets it in the DB
  join packet (DbManagerJoin.cpp:290-292 reads the current slot's row, :71 writes it; WORLDSERVER/DPDatabaseClient.cpp:778 ->
  `CUser::m_szBankPass[5]`, User.h:106). **The client never receives the PIN.**
* "No PIN yet" = PIN is exactly `"0000"` (DPSrvr.cpp:1051). Then the server sends the *set PIN* window first; you cannot open the
  bank with 0000 directly, you must change it to something else first (setting it to "0000" again just loops back here).
* No retry limit, no lock-out, no delay after wrong PINs (DPSrvr.cpp:1924-1929).
* Typing: plain edit boxes with `EBS_PASSWORD` (shown as `*`, WndControl.cpp:2656-2676; IME mode switch off,
  WndEditCtrl.cpp:1235-1238). No keypad, no on-screen digits. No max length on the edit (port: cap at 4).

### 3.2 CWndConfirmBank — "enter PIN" (APP_CONFIRM_BANK)
* `APP_CONFIRM_BANK` = 256 (ResData.h:161); resdata.inc:28095-28160; `WndTile06.tga` tiled, **272 x 160**, style 0x2410000;
  title "Bank Password" (IDS_RESDATA_INC_003576, resData.txt.txt:3577).
* Controls (client rect l,t,r,b):

| id (ResData.h) | type | rect | picture | text / tooltip |
|---|---|---|---|---|
| `WIDC_STATIC1` | static | 36,12,228,36 | — | "Enter Bank PIN" / tip "Enter your four digit Bank PIN" (003580/003581) |
| `WIDC_STATIC2` | static | 28,48,96,68 | — | "PIN" (003584) |
| `WIDC_EDIT1` = 935 (:1361) | edit | 100,48,232,68 | WndEditTile00.tga | tip "Enter your four digit Bank PIN" (003583) |
| `WIDC_OK` = 102 (:868) | button | 8,92,80,112 | ButtOk.tga | "OK" / tip "OK" (003578/003579) |
| `WIDC_CANCEL` = 103 (:869) | button | 92,92,164,112 | ButtCancel.tga | "Cancel" (003588/003589) |
| `WIDC_CHANGE_PASS` = 809 (:1135) | button | 180,92,252,112 | **ButtChange.bmp** | "Change PIN" / tip "Change PIN" (003586/003587) |

* Code: WndBank.cpp:414-526. Init (:425-442): EDIT1 gets `EBS_PASSWORD` + focus; window moved to (screenRight - width, 110) then
  `MoveParentCenter()` = centred on the screen (same idiom as the guild popups).
* OK or Enter in the edit (:475-512): text copied (max 10); if length == 4 and all 4 are digits (`isdigit2`) ->
  `SendConfirmBank( pin, m_dwId, m_dwItemId )`; else clear the edit and open an OK message box `TID_DIAG_0025`
  "Password should have 4 digits. Please try again." (defineText.h:1046, textClient.txt.txt:420). The window stays open while
  waiting; the server reply recreates it anyway.
* Change PIN (:513-520): opens `CWndBankPassword` in **mode 1** and destroys itself. Note: it does **not** pass `m_dwId/m_dwItemId`
  (SetItem is not called), so after a Custody-scroll open the change flow continues as an NPC open (the later confirm needs an NPC
  within 32 m; far from one it silently does nothing — original bug, see Open questions).
* Cancel (:521-524): destroy, no packet.

### 3.3 CWndBankPassword — "set / change PIN" (APP_BANK_PASSWORD)
* `APP_BANK_PASSWORD` = 248 (ResData.h:153); resdata.inc:26835-26927; `WndTile06.tga` tiled, **272 x 208**; title string
  IDS_RESDATA_INC_003240 = "Bank PIN:" (resData.txt.txt:3241).

| id | type | rect | picture | text / tooltip (IDS_RESDATA_INC_) |
|---|---|---|---|---|
| `WIDC_STATIC1` | static | 56,10,224,30 | — | "Set/Change Bank PIN" (003242) |
| `WIDC_STATIC2` | static | 16,44,108,64 | — | "Old PIN:" (003244) |
| `WIDC_EDIT1` = 935 | edit | 114,44,246,64 | WndEditTile00.tga | tip "If you have not set your bank PIN previously, enter 0000." (003247) |
| `WIDC_STATIC3` | static | 16,72,106,92 | — | "New PIN" (003248) |
| `WIDC_EDIT2` = 897 (:1263) | edit | 114,72,242,92 | WndEditTile00.tga | tip "New PIN" (003253) |
| `WIDC_STATIC4` | static | 16,100,104,120 | — | "Confirm PIN" (003250) |
| `WIDC_EDIT3` = 794 (:1133) | edit | 114,100,242,120 | WndEditTile00.tga | tip "Confirm New PIN" (003255) |
| `WIDC_OK` | button | 48,136,120,156 | ButtOk.tga | "OK" (003256) |
| `WIDC_CANCEL` | button | 144,136,216,156 | ButtCancel.tga | "Cancel" (003258) |

  (EDIT1 is 4 px wider than EDIT2/3 in the original data.)
* Two modes, `m_nFlags` (WndBank.cpp:545-548):
  * **mode 0 = first time** (server said PIN is 0000, DPClient.cpp:3051): EDIT1 pre-filled `"0000"` (hidden as `****`), focus on
    EDIT2 (:563-567). If EDIT1 sends notify message 0 it moves focus to EDIT2 (:693-697) (no edit notify with code 0 was found;
    probably dead).
  * **mode 1 = change** (from the Change PIN button, or after a wrong old PIN): EDIT1 empty, focus on EDIT1 (:568-571).
* All three edits `EBS_PASSWORD`; centred like 3.2 (:574-579).
* OK or Enter (:613-688), checks in this order:
  1. all three lengths == 4, else: reset EDIT1 (to "0000" in mode 0, "" in mode 1), clear EDIT2/3, box `TID_DIAG_0025`.
  2. new == confirm, else: clear EDIT2/3 (EDIT1 kept), box `TID_DIAG_0022` "Your new password is different from the password you
     confirmed. Please try again." (defineText.h:1043, textClient.txt.txt:417).
  3. all 12 characters digits, else: same reset as 1 + box `TID_DIAG_0025`.
  4. `SendChangeBankPass( old, new, m_dwId, m_dwItemId )`.
  (Original uses unbounded `strcpy` into `char[10]` (:627-629) — overflow if >9 chars typed. Port: cap input at 4.)
* Cancel: destroy, no packet. There is no "skip" — the bank can't be opened until a non-0000 PIN is set.

### 3.4 Packets and server rules
| dir | packet | payload | handler / rules |
|---|---|---|---|
| C->S | `PACKETTYPE_CONFIRMBANK` 0xffffff48 (MsgHdr.h:344) | `String pin`, `DWORD dwId`, `DWORD dwItemId` (DPClient.cpp:9702-9708) | `OnConfirmBank` DPSrvr.cpp:1872-1931. Silent return if: trading (`m_vtInfo.GetOther()`), own vendor shop open (`VendorIsVendor()`), guild bank open (`m_bGuildBank`), `m_bAllAction == FALSE`, NPC path and no banker within 32 m. Reads pin with `ReadString(buf,10)`. PIN equal -> (scroll path: scroll must still be at `dwId`, usable, index == `dwItemId`, else silent return; then `m_bInstantBank = TRUE`, remove 1 scroll) -> `m_bBank = TRUE` -> reply mode 1. PIN differs -> reply mode 0. |
| S->C | `SNAPSHOTTYPE_CONFIRMBANKPASS` 0x0058 (MsgHdr.h:989) | `int nMode`, `DWORD dwId`, `DWORD dwItemId` (User.cpp:1112-1121) | client DPClient.cpp:3113-3136: delete bank/PIN windows; mode 1 -> open inventory + bank; mode 0 -> reopen `CWndConfirmBank` (same dwId/dwItemId) + box `TID_DIAG_0028` "Wrong password.  Please try again." (defineText.h:1049, textClient.txt.txt:423; two spaces in the original). |
| C->S | `PACKETTYPE_CHANGEBANKPASS` 0xffffff47 (:343) | `String oldPin`, `String newPin`, `DWORD dwId`, `DWORD dwItemId` (DPClient.cpp:9693-9700) | `OnChangeBankPass` DPSrvr.cpp:1836-1870. Reads both with `ReadString(buf,10)`; if either is longer than 4 -> `WriteError` + **no reply**. **No digit check, no length-4 check, no distance check, no trade check on the server.** Old == current -> store new, save to DB (`SendChangeBankPass(name, new, idPlayer)` DPDatabaseClient.cpp:2139-2148 -> DB `BANK_STR 'U', idPlayer, serverindex, pin`, _Database/DbManager.cpp:382-405, Database.sql:9181-9206), reply mode 1. Else reply mode 0. |
| S->C | `SNAPSHOTTYPE_CHANGEBANKPASS` 0x0057 (:988) | `int nMode`, `DWORD dwId`, `DWORD dwItemId` (User.cpp:1101-1110) | client DPClient.cpp:3085-3111: delete bank/PIN windows; mode 1 -> open `CWndConfirmBank` (you now type the **new** PIN to enter); mode 0 -> reopen `CWndBankPassword` in **mode 1** (old field empty, even if you came from first-time mode) + box `TID_DIAG_0028`. |
| S->C | `SNAPSHOTTYPE_BANKWINDOW` 0x0056 (:987) | `int nMode`, `DWORD dwId`, `DWORD dwItemId` | reply to OPENBANKWND, see 2.3. |

Flow summary: Deposit -> (PIN 0000? set-PIN window : enter-PIN window) -> enter PIN -> inventory + bank open.
After setting a PIN you still have to type it once in the enter-PIN window.

Message boxes: `g_WndMng.OpenMessageBox( text )` = modal OK box, TID colour ignored (same convention as guild A-windows.md 2).
Window style of both PIN windows (0x2410000) = `WBS_CAPTION | WBS_SOUND | WBS_MOVE` (Resource/WndStyle.h:20-30): movable,
**not modal**.

---------------------------------------------------------------------------------------------------------------------------

## 4. The bank window (APP_COMMON_BANK)

### 4.1 Ids and frame
* Class `CWndBank` (WndBank.h:4-27, WndBank.cpp:11-409). Opened with `InitDialog( hwnd, APP_COMMON_BANK, 0, (0,0), &g_WndMng )`
  (WndBank.cpp:166). `APP_COMMON_BANK` = **396** (ResData.h:301).
* resdata.inc:**10679-10798**: `APP_COMMON_BANK "WndCommonBank.tga" 0 528 256 0x2410000 26` -> picture **not tiled**, window
  **528 x 256**, style CAPTION|SOUND|MOVE (not modal), title **"Bank"** (IDS_RESDATA_INC_001180, resData.txt.txt:1181), help key empty.
* `WndCommonBank.tga` (Client/Theme/Default, 528 x 256, 32-bit, magenta key) is the **whole window** incl. title bar: three
  light panels with a big "$" watermark, under each panel a blue-grey bar with 3 rivets (where the tab label sits), then a
  penya-bag icon and a white rounded box for the amount. Nothing else is drawn by code except the controls below.
* `WndCommonBankNotUse.tga` (144 x 214): red panel with a crossed circle and "NOT USE", plus a red bar where the penya box is.
  Loaded in OnInitialUpdate (WndBank.cpp:122) and drawn over each **unusable** bank at the top-left of `WIDC_CUSTOM4/5/6`
  with **alpha 50/255** (≈20 %) every frame (WndBank.cpp:26-45).
* The old `APP_BANK` = 204 (ResData.h:109, resdata.inc:21255, "WndShop.tga" 208 x 352) is the pre-V15 single bank; **no V15
  code opens it** (only stale checks still test it, section 8). Do not port it.

### 4.2 Controls (client rect l,t,r,b; ids from ResData.h)
| control | id = value (ResData.h line) | type, style | rect | role |
|---|---|---|---|---|
| bank 0 (character slot 0) | `WIDC_BANK_0` = 934 (:1355) | TABCTRL 0x260000 | 12,10,172,190 | holds item grid 0 |
| bank 1 | `WIDC_BANK_1` = 1008 (:1401) | TABCTRL | 184,10,344,190 | grid 1 |
| bank 2 | `WIDC_BANK_3` = 1009 (:1402) (note the name "_3") | TABCTRL | 354,10,514,190 | grid 2 |
| penya 0 | `WIDC_BANKGOLD_0` = 929 (:1312) | STATIC 0x2260000 (no align bits = left) | 70,198,152,214 | text = `m_dwGoldBank[0]` |
| penya 1 | `WIDC_BANKGOLD_1` = 900 (:1276) | STATIC | 240,198,324,214 | `m_dwGoldBank[1]` |
| penya 2 | `WIDC_BANKGOLD_2` = 936 (:1368) | STATIC | 410,198,492,214 | `m_dwGoldBank[2]` |
| coin 0 | `WIDC_BANKGO_0` = 870 (:1192) | CUSTOM -> `CWndGold` | 42,196,63,217 | drag handle for bank-0 penya |
| coin 1 | `WIDC_BANKGO_1` = 692 (:1083) | CUSTOM -> `CWndGold` | 212,196,233,217 | bank-1 penya |
| coin 2 | `WIDC_BANKGO_2` = 693 (:1086) | CUSTOM -> `CWndGold` | 382,196,403,217 | bank-2 penya |
| overlay 0 | `WIDC_CUSTOM4` = 659 (:1074) | CUSTOM (rect only) | 12,2,156,216 | where "NOT USE" is drawn |
| overlay 1 | `WIDC_CUSTOM5` = 660 (:1075) | CUSTOM | 184,2,328,216 | |
| overlay 2 | `WIDC_CUSTOM6` = 661 (:1076) | CUSTOM | 352,2,496,216 | |

All control title/tooltip strings are empty except the statics ("0") and customs ("Custom") (IDS_RESDATA_INC_001182-001205,
resData.txt.txt:1183-1206). WTYPE_CUSTOM entries are not windows; code only reads their rect (WndNeuz.cpp:562-647 has no
WTYPE_CUSTOM case).

### 4.3 What OnInitialUpdate builds (WndBank.cpp:47-123)
* Closes `APP_BAG_EX` (portable bag) (:50-52).
* If a trade, NPC shop, guild bank or vendor window is open -> `Destroy()` at once (:53-57) (destructor sends CLOSEBANKWND).
* For each bank i: a `CWndItemCtrl` `m_wndItemCtrl[i]`, style `WLVS_ICON`, **control id 11**, child of the tab control,
  bound to `g_pPlayer->m_Bank[i]` with frame id `APP_COMMON_BANK` (:59-72); one tab per control with text
  `TID_GAME_ITEM` = **"Item"** (defineText.h:754, textClient.txt.txt:591) (:74-86).
* `m_wndGold[i]` = `CWndGold` (a `CWndButton`, WndField.h:172-181) created with title "g", `WBS_NODRAWFRAME`, at the
  `WIDC_BANKGO_i` rect (:89-99). Its only job: on mouse-down it puts a "penya" shortcut (`m_dwData = 0`, cursor icon
  `itm_GolGolSeed.dds`) in the global drag slot (WndField.cpp:495-508). The coin picture itself is part of WndCommonBank.tga.
* `pCost[i]` = the three penya statics (:101-103). `OnDraw` sets their text every frame to `"%d"` of `m_dwGoldBank[i]` —
  **plain number, no thousands separator** (:31-34).
* `RectItemCtrl[]`/`RectGold[]` are computed (:107-109, :148) but never used.

### 4.4 Position
WndBank.cpp:111-120: take the inventory window's top-left (the inventory was just opened by `CreateApplet(APP_INVENTORY)`).
* If inventory.x > screenWidth / 2 (inventory on the right half): bank.x = inventory.x - (int)(inventoryWidth * 2.525).
  `APP_INVENTORY` is 240 wide (resdata.inc:19776) -> 606 px to the left, which leaves a **78 px gap** between bank and inventory.
* Else: bank.x = inventory.x + inventoryWidth (touching on the right).
* bank.y = inventory.y in both cases.

### 4.5 Item grid geometry (same CWndItemCtrl as the inventory, frame = APP_COMMON_BANK)
* Tab control window 160 x 180 (WBS_NOFRAME -> client = window). Tab page area = client minus 18 px at the bottom = 160 x 162
  (WndControl.cpp:4586-4592). The item ctrl's client = that rect deflated 4 px left/right, minus 15 px for the scrollbar
  (WndItemCtrl.cpp:1454-1479) = **137 x 162**.
* Cells are 32 x 32 (`x*32, y*32`) -> **4 columns x 5 visible rows** = 20 visible cells; capacity `MAX_BANK = 42`
  (_Common/ProjectCmn.h:9) -> 11 rows, vertical scrollbar (range = ceil(42/4) = 11, page 5; WndItemCtrl.cpp:441-451). Mouse
  wheel scrolls (WndItemCtrl.cpp:1613). Scrollbar = rightmost 15 px of the item ctrl (WndItemCtrl.cpp:1444-1451).
* First cell in bank-client coordinates: (12+4, 10) for bank 0, (184+4, 10), (354+4, 10).
* Tab strip: the single tab "Item" is drawn by the standard `CWndTabCtrl::OnDraw` at the bottom 20 px of the tab control
  (WndTabTile10-15.bmp, WndControl.cpp:4183-4294); selected tab text black.
* **Items are drawn packed**: for any frame other than inventory / bag / shop the ctrl first collects the non-empty items in
  storage order into `m_pArrayItemElem` and draws item n at cell n (WndItemCtrl.cpp:664-702). So there are **no gaps** and no
  drag-to-reorder (4.6). Hovered item drawn 4 px larger (:693-700). Stack count (if `dwPackMax > 1`) bottom-right, shadow
  0xff0000ff at +1 px then 0xffb0b0f0 (:704-716). Expired items tinted red `ARGB(a,255,100,100)` (:345-361).
* Tooltip on hover: `PutToolTip_Item( item, ..., APP_INVENTORY )` (the normal inventory tooltip; with the repair window open
  the repair tooltip) (WndItemCtrl.cpp:212-245).

### 4.6 The three banks (account-wide "common bank")
* `m_Bank[3]`, `m_dwGoldBank[3]`, `m_idPlayerBank[3]` on CMover (_Common/Mover.h:709-711); index = **character slot on the
  login screen** (`m_nSlot`, BYTE, Mover.h:707). Bank 0 is always the left panel, whatever your own slot is.
* Usable test, `ReSetBank()` (WndBank.cpp:125-150), run on open and when an SM (premium) timer changes
  (DPClient.cpp:5907-5913, 6046-6051):
  * own slot (`i == m_nSlot`) -> usable;
  * other slot -> usable only if `m_idPlayerBank[i] != 0` (a character exists in that slot) **and** `IsCommBank()`
    (Mover.cpp:11700-11703: an active `SM_BANK15`, `SM_BANK30` or `SM_BANK001` timer);
  * not usable -> item ctrl + coin disabled (`EnableWindow(FALSE)`), scrollbar hidden, "NOT USE" overlay drawn. Its items
    and penya are still **drawn** (the data is in the login packet) — they are only greyed by the overlay.
* Common-bank items: `II_CHR_SYS_SCR_COMMBANK15` 10216 "Common Bank 15", `II_CHR_SYS_SCR_COMMBANK30` 10217 "Common Bank 30",
  `II_CHR_SYS_SCR_COMMBANK001` 26559 "Common Bank (1 day)" (defineItem.h:2246-2247, 4992; propItem.txt:1992-1993, 4779:
  IK1_CHARGED, times 1296000 / 2592000 / 86400 s; names propItem.txt.txt:4487-4490, 9325-9326). Using one sets the SM timer
  unless one is already running (_Common/MoverSkill.cpp:2097-2120; refusal nResult = 2). SM table: _Network/CmnHdr.h:495-532.
* On the server the same rule (`m_nSlot == nSlot || (m_idPlayerBank[nSlot] != 0 && IsCommBank())`) guards every put/get
  (DPSrvr.cpp:1301, 1683, 1750, 1803). Bank-to-bank needs `m_idPlayerBank` of **both** slots non-zero **and** `IsCommBank()`
  even when one side is your own bank (DPSrvr.cpp:1202).
* The DB keeps one bank row per character (`BANK_TBL`, Database.sql:2753); at login all 3 rows of the account are loaded
  (DbManagerJoin.cpp:288-296 `GetBank` per slot; _Database/DbManagerFun.cpp:185-202 fill `m_idPlayerBank`/`m_dwGoldBank`)
  and shared through the account cache (DbManagerJoin.cpp:358-386). On save, the other slots' bank rows are saved too
  (_Database/DbManagerSave.cpp:437-441).

### 4.7 Pictures used
| file | where | note |
|---|---|---|
| WndCommonBank.tga | bank frame, 528 x 256 | not tiled |
| WndCommonBankNotUse.tga | unusable-bank overlay, 144 x 214, alpha 50 | WndBank.cpp:122 |
| WndTabTile10..15.bmp | tab strip under each grid | standard tab ctrl |
| itm_GolGolSeed.dds (Item dir) | drag cursor for penya | WndField.cpp:507 |
| WndTile06.tga (tiled) | both PIN windows | |
| WndEditTile00.tga | PIN edit boxes | |
| ButtOk.tga, ButtCancel.tga, ButtChange.bmp (288 x 20 = 4 states of 72 x 20) | PIN buttons | |
| WndTile09.tga (tiled) | quantity window APP_TRADE_GOLD | section 5.3 |

---------------------------------------------------------------------------------------------------------------------------

## 5. Moving items and penya

Only **drag and drop**. No double-click, no right-click, no shift-click action on bank items:
`CWndItemCtrl::OnLButtonDblClk` sends `WIN_DBLCLK` up, and `CWndBank::OnChildNotify` handles only `WIN_ITEMDROP` and
`WNM_CLICKED` (WndItemCtrl.cpp:1403-1440, WndBank.cpp:183-409); right-click only opens book/scroll/letter/quest-item info
windows like everywhere (WndItemCtrl.cpp:1306-1392). Dragging starts on mouse-move after mouse-down on an item that is not
"in use" (WndItemCtrl.cpp:806-825, 1009-1099); the shortcut carries `m_dwId` = the item's **storage index** (`m_dwObjId`,
0..41 in its container) and `m_dwData` = item pointer (0 = penya). A drop is only handled when it lands on a grid
(control id **11**: the inventory grid or one of the 3 bank grids). Disabled (unusable) bank grids/coins take part in
nothing: child lookup under the mouse and focus skip disabled windows (WndBase.cpp:843-875), so they can neither start a
drag nor receive a drop.

Slot detection uses two static pointers of CWndBase (WndBase.h:125,140): `m_pWndOnMouseMove` = control under the mouse
(= drop target) and `m_pCurFocus` = control that had focus = the one the drag started from (= source). Mapping is
"grid/coin 0 -> 0, grid/coin 1 -> 1, anything else -> 2".

### 5.1 Inventory -> bank (CWndBank::OnChildNotify, WndBank.cpp:185-276)
* Target bank = grid under the mouse (:189-204). Any open quantity window is closed first (:211).
* Item (`m_dwData != 0`):
  * if the inventory grid's selection count is not 1 -> chat `TID_GAME_EQUIPPUT` **"Please unequip the item first."**
    (defineText.h:600, red 0xffff0000) (:215-220). In practice this is the "dragged from the equipment doll" case (a doll
    drag leaves the grid with no selection).
  * stack (`m_nItemNum > 1`) -> quantity window (5.3) with tag `APP_BANK`, default = whole stack, prompt
    `TID_GAME_MOVECOUNT` "Move how many items?" + label `TID_GAME_NUMCOUNT` "Number:" (:230-247).
  * single -> `SendPutItemBank( bank, id, 1 )` (:250).
* Penya (the inventory coin, `m_dwData == 0`) -> quantity window, tag `APP_BANK`, default = all inventory penya, prompt
  `TID_GAME_MOVEPENYA` "How many do you want to move?" + label `TID_GAME_PENYACOUNT` "Penya:" (:255-275).
* No client pre-check for quest / bound / timed / pet items or a full bank — the server decides (section 6).

### 5.2 Bank -> inventory (CWndInventory::OnChildNotify, WndField.cpp:1863-1950)
* Source bank = focused control (`m_pCurFocus`): grid 0/1/else 2 for items, coin 0/1/else 2 for penya (:1866-1883, :1919-1930).
* Item: stack -> quantity window, tag `APP_GOLD` ("the inventory, but that tag was taken", :1899), default = whole stack,
  texts "Move how many items?" / "Number:"; single -> `SendGetItemBank( bank, id, 1 )` (:1893-1915).
* Penya: quantity window, tag `APP_GOLD`, default = `m_dwGoldBank[bank]`, texts "How many do you want to move?" / "Penya:"
  (:1932-1947).
* No client check for a full inventory.

### 5.3 The quantity window: CWndTradeGold (APP_TRADE_GOLD)
* `APP_TRADE_GOLD` = 116 (ResData.h:21); resdata.inc:11228-11284; `WndTile09.tga` tiled, **240 x 128**; title "Move Items"
  (IDS_RESDATA_INC_001080). Opened **modal** (`InitDialog( ..., APP_TRADE_GOLD, WBS_MODAL, ...)`, WndField.cpp:8475-8478) and
  `MoveParentCenter()` (centred on screen). One instance only: `g_WndMng.m_pWndTradeGold` (deleted before a new drop).

| id | type | rect | picture | text |
|---|---|---|---|---|
| `WIDC_STATIC` = 185 (ResData.h:896) | static | 36,12,192,29 | — | prompt; resdata "Place your bet!" is replaced by code |
| `WIDC_CONTROL1` = 379 (:959) | static | 24,36,92,52 | — | label; resdata "Penya:" replaced by code |
| `WIDC_EDIT` | edit | 100,36,196,56 | WndEditTile00.tga | the amount |
| `WIDC_OK` = 102 | button | 40,68,112,88 | ButtOk.tga | "Confirm" (001086) |
| `WIDC_CANCEL` = 103 | button | 124,68,196,88 | ButtCancel.tga | "Cancel" (001088) |

* Init (WndField.cpp:8459-8473): OK is the default button (Enter), edit focused, pre-filled with `m_dwGold` (capped at INT_MAX).
* `Process()` (:8444-8455) closes it if the inventory item with the dragged id gets an "extra" count (put in a trade).
* OK / Enter (:8493-8784): `n = atoi(text)`, `n < 1 -> 1`, then by tag:

| tag | penya | item |
|---|---|---|
| `APP_BANK` (inv -> bank) | `n = min(n, inventory gold)`; `SendPutGoldBank( bank, n )` (sent even if n becomes 0; server ignores 0) (:8545-8553) | if the inventory item still exists: `n = min(n, stack)`; `SendPutItemBank( bank, id, n )` (:8554-8566) |
| `APP_GOLD` (bank -> inv) | `n = min(n, m_dwGoldBank[bank])`; if `n > 0` `SendGetGoldBank( bank, n )` (:8652-8667) | bank item by id: `n = min(n, stack)`; `SendGetItemBank( bank, id, n )` (:8668-8690) |
| `APP_COMMON_BANK` (bank -> bank) | `n = min(n, m_dwGoldBank[fromBank])`; if `n > 0` `SendPutGoldBankToBank( fromBank, toBank, n )` (:8693-8708) | item in `fromBank`: `n = min(n, stack)`; `SendPutItemBankToBank( fromBank, toBank, id, n )` (:8709-8730) |

  then `Destroy()` (:8783). Cancel -> `Destroy()` (:8785-8793). The count is sent as `short`.
* The same class serves trade, NPC drop, guild bank and mail (other tags) — the port probably already has it.

### 5.4 Bank -> other bank (CWndBank::OnChildNotify, WndBank.cpp:277-389)
* Source frame is the bank itself. Target bank = grid under the mouse; source bank = focused grid (items, :284-295) or
  focused coin (penya, :356-367).
* Item: stack -> quantity window tag `APP_COMMON_BANK` (`m_nSlot` = target, `m_nPutSlot` = source); single ->
  `SendPutItemBankToBank( source, target, id, 1 )` (:297-336).
* Penya: quantity window, default = `m_dwGoldBank[source]` (:369-387).
* Dropping an item on **its own grid** does nothing: `CWndItemCtrl::OnDropIcon` keeps drops from itself and only knows the
  old `APP_BANK` / inventory cases (WndItemCtrl.cpp:1213-1227). So **no re-ordering inside a bank** and
  `SendMoveBankItem` (`PACKETTYPE_MOVEBANKITEM`) is never sent in V15; its server handler is empty (DPSrvr.cpp:1832-1834).
* Dropping a bank's coin on the same bank's grid sends a bank-to-bank penya move with source == target (server: add then
  subtract the same amount = no change, two PUTGOLDBANK replies).
* Allowed only while both banks are usable, i.e. with an active Common Bank timer (4.6).

### 5.5 Client -> server packets (all go to the world server; BYTE = 1, short = 2, DWORD = 4)
| packet (MsgHdr.h) | payload, in order | sender | server handler |
|---|---|---|---|
| `PACKETTYPE_OPENBANKWND` 0xffffff40 (:336) | DWORD dwId (scroll objid or 0xFFFFFFFF), DWORD dwItemId (scroll index or 0) | DPClient.cpp:9674-9679 | DPSrvr.cpp:1025-1062 |
| `PACKETTYPE_CLOSEBANKWND` 0xffffff41 (:337) | — | :9710-9714 | :1094-1102 |
| `PACKETTYPE_PUTITEMBACK` 0xffffff42 (:338) | BYTE bank, BYTE itemId (inventory storage index), short count | :9744-9749 | :1276-1381 |
| `PACKETTYPE_PUTGOLDBACK` 0xffffff43 (:339) | BYTE bank, DWORD penya | :9780-9785 | :1722-1779 |
| `PACKETTYPE_GETITEMBACK` 0xffffff44 (:340) | BYTE bank, BYTE itemId (bank storage index), short count | :9787-9792 | :1665-1720 |
| `PACKETTYPE_GETGOLDBACK` 0xffffff45 (:341) | BYTE bank, DWORD penya | :9794-9799 | :1781-1830 |
| `PACKETTYPE_MOVEBANKITEM` 0xffffff46 (:342) | BYTE src, BYTE dst | :9366-9371 (never sent in V15) | :1832-1834 (empty) |
| `PACKETTYPE_CHANGEBANKPASS` 0xffffff47 (:343) | String old, String new, DWORD dwId, DWORD dwItemId | :9693-9700 | :1836-1870 |
| `PACKETTYPE_CONFIRMBANK` 0xffffff48 (:344) | String pin, DWORD dwId, DWORD dwItemId | :9702-9708 | :1872-1931 |
| `PACKETTYPE_PUTBACKTOBANK` 0xffffff49 (:345) item | BYTE flag = **1**, BYTE fromBank, BYTE toBank, BYTE itemId (index in fromBank), short count | :9751-9757 | :1182-1275 |
| `PACKETTYPE_PUTBACKTOBANK` gold | BYTE flag = **0**, BYTE fromBank, BYTE toBank, DWORD penya | :9758-9764 | same |

(The packet names say "BACK" — a typo for "BANK" in the original — keep the numbers.)

---------------------------------------------------------------------------------------------------------------------------

## 6. Server checks, limits and messages

There are **no fees** anywhere (no penya is charged for storing, taking or moving). Every failed check below is a **silent**
`return` unless a message is named. `AddDefinedText(TID)` -> the client prints the TID in chat in the TID colour.

### 6.1 Put item (inventory -> bank), OnPutItemBank DPSrvr.cpp:1276-1381, in order
| # | check | result |
|---|---|---|
| 1 | bank index >= 3 | ignore (:1282) |
| 2 | (`__BB_*` staff) | `TID_GAME_BANKNOTRADE` (custom, leave out) |
| 3 | not a scroll session and no `MMI_BANKING` NPC within 32 m (distance² < 1024) | ignore (:1295-1299) |
| 4 | bank is not own slot and not (`m_idPlayerBank[bank] != 0` and Common Bank active) | ignore (:1301) |
| 5 | item missing, or "extra" > 0 (sitting in a trade / shop / mail slot) — `IsUsableItem` Item.cpp:17-26 | ignore (:1303-1305) |
| 6 | target is **another character's** bank and the item is a quest item (IK3_QUEST) | ignore (:1307-1311) |
| 7 | `IsBinds()`: has a time limit (`m_dwKeepTime`, except IK2_WARP), prop flag IP_FLAG_BINDS, item flag `binds`, a Blessing / eat-pet random option, or awakening level-down (Item.cpp:400-421) | ignore (:1313-1315) |
| 8 | no ItemProp | ignore |
| 9 | item in use (`IsUsing`: summoned pet / eat-pet, active pet-food pocket, ticket; Mover.cpp:11259-) | `TID_GAME_CANNOT_DO_USINGITEM` "You are already using that item" (defineText.h:2037, white) (:1325-1329) |
| 10 | IK3_EVENTMAIN, IK3_LINK, or a guild cloak (IK3_CLOAK with `m_idGuild != 0`) | ignore (:1331-1334) |
| 11 | vagrant flying item (`dwParts == PARTS_RIDE && dwItemJob == JOB_VAGRANT`) | ignore (:1338-1339) |
| 12 | item is equipped | `TID_GAME_EQUIPTRADE` "Please unequip the item before selling it." (defineText.h:245, red) (:1342-1346) |
| 13 | count clamped to 1..stack | (:1348-1351) |
| 14 | bank cannot take it (`IsFull`, stack-aware: same id + same `m_byFlag` + same `m_bCharged`, up to `dwPackMax`; Item.h:629-658) | **BANKISFULL** -> client chat `TID_GAME_SLOTFULL` **"Your inventory is full."** (defineText.h:636, colour 0xff99cc00) (:1354, 1374-1378; DPClient.cpp:3026-3029) |
| ok | `AddPutItemBank( bank, copy )`, `m_Bank[bank].Add`, log, `RemoveItem( id, n )` (-> `SNAPSHOTTYPE_UPDATE_ITEM` for the inventory) | (:1356-1372) |

Note: the server never checks `m_bBank` (that the PIN was entered) for put/get — only the NPC distance or the scroll flag.

### 6.2 Take item (bank -> inventory), OnGetItemBank DPSrvr.cpp:1665-1720
bank >= 3 -> ignore; distance (unless scroll) -> ignore; slot rule -> ignore; item not in that bank -> ignore; count clamped;
**inventory must have fewer than 42 non-equipped items** (`MAX_INVENTORY > GetCount()`, ProjectCmn.h:7, Item.h:425-434 — it
does not consider stacking) else BANKISFULL -> "Your inventory is full."; ok -> `AddGetItemBank( copy )`, inventory `Add`,
log, `UpdateItemBank( bank, id, UI_NUM, rest )` (-> `SNAPSHOTTYPE_UPDATE_BANKITEM`). No staff check (custom) here.

### 6.3 Penya in / out, OnPutGoldBank :1722-1779 / OnGetGoldBank :1781-1830
* amount read as DWORD then used as `int`; `<= 0` -> ignore; bank >= 3 -> ignore; distance; slot rule.
* Put: amount clamped to inventory penya; `CanAdd( bankGold, n )` must hold, else ignore. `CanAdd` (DPSrvr.cpp:120-128) =
  `n > 0 && (int)gold + n > (int)gold`, i.e. **max 2,147,483,647 penya per bank** (and per inventory for Get), no message.
* Get: amount clamped to that bank's penya; `CanAdd( inventoryGold, n )` else ignore.
* ok -> one `SNAPSHOTTYPE_PUTGOLDBANK` (for **both** directions) with the new inventory penya and the new bank penya.

### 6.4 Bank -> bank, OnBankToBank DPSrvr.cpp:1182-1275
* Reads flag, fromBank, toBank first; either >= 3 -> ignore.
* Needs `m_idPlayerBank[from] != 0 && m_idPlayerBank[to] != 0 && IsCommBank()` (:1202). **No NPC distance check, no scroll
  check, no item-type checks** (quest / bound items already in a bank can be moved to another character's bank).
* Item: must exist in fromBank; count clamped; target must have **fewer than 42 items** (`MAX_BANK > GetCount()`, not
  stack-aware) else BANKISFULL; ok -> `AddPutItemBank( to, copy )`, `Add`, `UpdateItemBank( from, id, UI_NUM, rest )`.
* Penya: clamped to fromBank penya; `CanAdd( toBankGold, n )`; ok -> `AddPutGoldBank( to, invGold, toGold )` then
  `AddPutGoldBank( from, invGold, fromGold )`.

### 6.5 Client-side refusals and messages (all in one place)
| where | text (TID, colour) | trigger |
|---|---|---|
| NPC "Deposit" | see 2.2 table | other windows open / chaotic |
| drop on bank | `TID_GAME_EQUIPPUT` "Please unequip the item first." red | dragged from the equipment doll (5.1) |
| PIN windows | `TID_DIAG_0025` / `TID_DIAG_0022` / `TID_DIAG_0028` message boxes | 3.2-3.4 |
| server BANKISFULL | `TID_GAME_SLOTFULL` "Your inventory is full." 0xff99cc00 | bank full **and** inventory full (same text) |
| server DEFINEDTEXT | `TID_GAME_CANNOT_DO_USINGITEM`, `TID_GAME_EQUIPTRADE` | 6.1 #9, #12 |
| drop on the ground while bank open | `TID_GAME_TRADELIMITITEM` "You cannot drop items while trading." red (WndWorld.cpp:7776-7797) | section 8 |

---------------------------------------------------------------------------------------------------------------------------

## 7. How the bank data reaches the client

### 7.1 At login (own player, full serialization) — nothing is sent on open
`CMover::Serialize`, storing side _Common/ObjSerializeOpt.cpp:239-256, reading side :568-587, inside the `METHOD_NONE`
(own player) block, right after `BYTE m_nCheerPoint, DWORD m_dwTickCheer`:

```
BYTE   m_nSlot                    // own character slot 0..2 (:241 / :571)
DWORD  m_dwGoldBank[3]            // penya of bank 0,1,2 (:242-243 / :572-573)
u_long m_idPlayerBank[3]          // idPlayer in slot 0,1,2, 0 = no character (:244-245 / :574-575)
int    m_nPlusMaxHitPoint, m_nAttackResistLeft, m_nAttackResistRight, m_nDefenseResist, angel exp/level ...
m_Inventory.Serialize
m_Bank[0].Serialize, m_Bank[1].Serialize, m_Bank[2].Serialize      // (:255-256 / :586-587)
DWORD  petId ...
```
Each bank = `CItemContainer::Serialize` with 42 slots (Item.h:892-945): `DWORD apIndex[42]`, `BYTE count`,
`count x ( BYTE storageIndex, CItemElem )`, `DWORD objIndex[42]`. `CItemElem::Serialize` is the normal item record
(ObjSerialize.cpp:48-).
FlyffWeb today **reads past** these fields: `packages/protocol/src/world/own.ts:143-144` skips `m_dwGoldBank`/`m_idPlayerBank`
and :52 skips the three banks — the builder needs to keep them (and keep `apIndex`, because `Add` places items by it).

### 7.2 Replies after each action (world snapshots, own objid)
| snapshot (MsgHdr.h) | payload | written by | client action |
|---|---|---|---|
| `SNAPSHOTTYPE_PUTITEMBANK` 0x0050 (:981) | BYTE bank, CItemElem | User.cpp:1012-1020 | `m_Bank[bank].Add( item )` — runs the normal container Add (stack merge first, then first empty slot in `apIndex` order, Item.h:660-759); the item's own objid in the record is ignored (DPClient.cpp:2881-2888) |
| `SNAPSHOTTYPE_GETITEMBANK` 0x0051 (:982) | CItemElem | User.cpp:1022-1029 | `m_Inventory.Add( item )` (DPClient.cpp:2993-2998) |
| `SNAPSHOTTYPE_PUTGOLDBANK` 0x0052 (:983) | BYTE bank, DWORD inventoryGold, DWORD bankGold | User.cpp:1031-1038 | `m_dwGoldBank[bank] = bankGold; SetGold( inventoryGold )` (DPClient.cpp:3013-3021) |
| `SNAPSHOTTYPE_MOVEBANKITEM` 0x0053 (:984) | BYTE src, BYTE dst | User.cpp:1040-1048 (never called) | empty (DPClient.cpp:3022-3024) |
| `SNAPSHOTTYPE_UPDATE_BANKITEM` 0x0054 (:985) | BYTE bank, BYTE id, CHAR param, DWORD value | User.cpp:1152-1160 via Mover.cpp:2400-2428 | `UpdateItemBank`: param `UI_NUM` (0): value 0 -> remove the item, else set its count (DPClient.cpp:3000-3012) |
| `SNAPSHOTTYPE_BANKISFULL` 0x0055 (:986) | — | User.cpp:1050-1057 | chat `TID_GAME_SLOTFULL` (DPClient.cpp:3026-3029) |
| `SNAPSHOTTYPE_BANKWINDOW` 0x0056 (:987) | int mode, DWORD dwId, DWORD dwItemId | User.cpp:1071-1081 | 2.3 |
| `SNAPSHOTTYPE_CHANGEBANKPASS` 0x0057 (:988) | int mode, DWORD dwId, DWORD dwItemId | User.cpp:1101-1110 | 3.4 |
| `SNAPSHOTTYPE_CONFIRMBANKPASS` 0x0058 (:989) | int mode, DWORD dwId, DWORD dwItemId | User.cpp:1112-1121 | 3.4 |
| `SNAPSHOTTYPE_UPDATE_ITEM` 0x0018 (:907) | CHAR type(0), BYTE id, CHAR param, DWORD value, DWORD time | User.cpp:1136-1150 via MoverParam.cpp:4090 | existing inventory update (after a put) |

Order on a put: PUTITEMBANK, then UPDATE_ITEM. On a take: GETITEMBANK, then UPDATE_BANKITEM. Bank-to-bank: PUTITEMBANK (to),
then UPDATE_BANKITEM (from). Dispatch: DPClient.cpp:520-533.
The SM timers that switch the Common Bank on/off arrive in the same own-player record (`m_dwSMTime[SM_MAX]`,
ObjSerializeOpt.cpp:195-196) and later via the SM-mode packet (DPClient.cpp:5905-5914), which re-runs `ReSetBank()`.

---------------------------------------------------------------------------------------------------------------------------

## 8. Everything else the client does

* **Sound**: none. No `PLAYSND` in WndBank.cpp or the bank handlers; the generic window open/close sounds are commented out
  (WndBase.cpp:340-341, WndNeuz.cpp:150).
* **Tooltips**: bank items show the normal inventory item tooltip (4.5). No tooltips on the penya boxes, coins or panels.
* **Item lock**: none. While the bank is open the inventory stays fully usable (double-click use, equip / unequip): the old
  checks test `APP_BANK` (204), which V15 never opens (WndField.cpp:2541-2547 item use, :2869-2880 inventory drop,
  :12938-12943 item dialog; WndVendor.cpp:204). Only **dropping an inventory item on the ground** is refused with
  `TID_GAME_TRADELIMITITEM` "You cannot drop items while trading." (red) (WndWorld.cpp:7776-7797). Dragging a bank item onto
  the ground does nothing (only inventory drops are handled there).
* **Moving away**: any movement closes bank + quantity window + inventory + PIN windows (2.5). There is no distance timer.
* **Using a Custody scroll while the bank is open**: the server answers BANKWINDOW and the client deletes the open bank
  (which sends CLOSEBANKWND) and shows the PIN window again (DPClient.cpp:3038-3040).
* **Other windows** (client):

| situation | behaviour | evidence |
|---|---|---|
| bank opens while trade / NPC shop / guild bank / vendor window is open | the bank destroys itself at once | WndBank.cpp:53-57 |
| trade window opens while bank is open | the trade window destroys itself | WndField.cpp:9043-9047 (CWndTrade::OnInitialUpdate) |
| NPC shop / vendor / guild bank window opens while bank is open | it destroys itself | WndShop.cpp:774-778, WndVendor.cpp:98, WndGuildBank.cpp:95 |
| NPC menu "Trade"/shop or player trade while bank open | chat `TID_GAME_BANKTRADESELF` "You cannot trade while using the bank." (red) | WndWorld.cpp:5251-5259 |
| NPC menu "Post" (mail) while bank open | same text `TID_GAME_BANKTRADESELF`; while a PIN window is open `TID_GAME_BANKSTILLUSING` | WndWorld.cpp:4540-4563 |
| NPC menu "Repair" while bank open | `TID_GAME_REPAIR_TAKEBANK` "You cannot repair an item while using the bank." (white) | WndWorld.cpp:5388-5395 |
| NPC menu guild bank while bank open | `TID_GAME_BANKSTILLUSING` | WndWorld.cpp:5575-5580 |
| NPC menu summon angel while bank open | `TID_GAME_TRADENOTSUMMONANGEL` "You cannot summon an Angel while trading." (red) | WndWorld.cpp:4815-4820 |
| NPC menu piercing / upgrade / change element while bank or a PIN window is open | silently nothing | WndWorld.cpp:5692-5700, 5745-5751, 5799-5807 |
| incoming trade request while bank open | **not** blocked on the client (only guild bank is, block 8); accepting it -> server refuses, see below | DPClient.cpp:2555-2596 |
| inventory closed | bank closed | WndField.cpp:1103-1105 |
| duel accepted | bank, trade-gold, inventory, PIN windows closed | WndDuelConfirm.cpp:177-201 |

* **Server while `m_bBank` is TRUE**: trade start refused with `TID_GAME_TRADELIMITPC` "You cannot trade with another player
  while vending." (red; original wording) to the player who sent the trade (DPSrvr.cpp:6438-6442); NPC shop open refused with
  `TID_GAME_TRADELIMITNPC` "You cannot trade with a player and an NPC at the same time." (:12994-12998); mail send refused
  silently (OnQueryPostMail :5009-5010); guild bank open refused silently (:1083-1084); friend / party summon, duel and lord
  teleport treat the player as busy (`GetSummonState()` returns 1, MoverParam.cpp:319-321; User.cpp:8257).
  Note `m_bBank` is set only after a correct PIN (DPSrvr.cpp:1921) and cleared by CLOSEBANKWND.
* **Tutorial**: opening the bank fulfils a guide step waiting for `APP_COMMON_BANK` (WndBank.cpp:158-165).
* The bank never re-requests its contents; it always draws `g_pPlayer->m_Bank[i]` live, so snapshots update it at once.

---------------------------------------------------------------------------------------------------------------------------

## 9. Guild bank (not to build) — how much it shares

`CWndGuildBank` (_Interface/WndGuildBank.cpp, 905 lines incl. the log window; `APP_GUILD_BANK` ResData.h:241 = 336,
resdata.inc:7058, `WndGuildBank.tga` 236 x 348, one panel).
* **Shared building blocks**: the same `CWndItemCtrl` (WLVS_ICON, id 11, in a tab ctrl) (:107-108), the same `CWndGold`
  coin (:118), the same `CWndTradeGold` quantity window with its own tags `APP_GUILD_BANK` (put) and `APP_MESSENGER` (take)
  (WndField.cpp:8586-8648), the same "open the inventory and dock next to it" placement (:137-149; it compares with its own
  width/2 instead of half the screen), and the same mutual-exclusion rules (bank / trade / shop / vendor).
* **Different**: no PIN; opened by `MMI_GUILDBANKING` -> `PACKETTYPE_GUILD_BANK_WND` and the contents come **with the open
  reply** (`SNAPSHOTTYPE_GUILD_BANK_WND`: int mode, int guildGold, container; DPClient.cpp:3057-3083), own packets
  (`PUTITEMGUILDBANK` / `GETITEMGUILDBANK`: BYTE id, DWORD num, BYTE mode; DPClient.cpp:9765-9777), guild rights checks,
  extra buttons (contribution window, guild cloak, log window), cross-server updates.
* Estimate: the grid, coin drag and quantity window code (~30 % of the bank port) can be reused; packets, rules and window
  are separate.

---------------------------------------------------------------------------------------------------------------------------

## 10. Builder summary

| topic | rule |
|---|---|
| Who | NPCs Julia (Flaris), Helena (Saint Morning), Ollien (Darkon), menu `MMI_BANKING` = 9 "Deposit"; or the Scroll of Private Custody (item 15083) anywhere |
| Open | `OPENBANKWND(dwId, dwItemId)` -> `BANKWINDOW(mode)`: mode 0 = set PIN (PIN is "0000"), 1 = enter PIN |
| PIN | 4 digits, per character, typed in `*` edit boxes; `CONFIRMBANK(pin, dwId, dwItemId)` -> `CONFIRMBANKPASS(1)` opens inventory + bank, `(0)` = "Wrong password" box + PIN window again; change with `CHANGEBANKPASS(old, new, dwId, dwItemId)` -> `CHANGEBANKPASS(1)` = enter-PIN window, `(0)` = wrong-old-PIN box + change window (mode 1) |
| Distance | server: a banker within 32 m (distance² < 1024) for open / confirm / put / get, skipped for a scroll session; client: any movement closes the bank |
| Window | 528 x 256 `WndCommonBank.tga`, title "Bank", 3 panels = character slots 0..2, each 4 x 5 visible cells (42 slots, scroll), penya number under each, "NOT USE" overlay (alpha 50) on unusable banks; placed next to the inventory |
| Usable banks | own slot always; the other two only with an active Common Bank timer (SM_BANK15/30/001) and a character in that slot |
| Move | drag only. inv->bank `PUTITEMBACK(bank, id, n)` / `PUTGOLDBACK(bank, n)`; bank->inv `GETITEMBACK(bank, id, n)` / `GETGOLDBACK(bank, n)`; bank->bank `PUTBACKTOBANK(1, from, to, id, n)` / `(0, from, to, gold)`; stacks and penya go through the modal "Move Items" quantity window (default = all) |
| Server refuses | quest items into another character's bank; bound / timed / blessed / level-down items; event, link, guild-cloak, vagrant flying items; equipped (message); in-use pets (message); full bank or inventory (`TID_GAME_SLOTFULL` "Your inventory is full."); penya overflow over 2,147,483,647 (silent) |
| Replies | `PUTITEMBANK(bank, item)` -> container Add; `GETITEMBANK(item)` -> inventory Add; `PUTGOLDBANK(bank, invGold, bankGold)`; `UPDATE_BANKITEM(bank, id, 0, rest)` (0 = remove); `BANKISFULL`; plus normal `UPDATE_ITEM` for the inventory |
| Data | all three banks, their penya and owner ids come in the own-player record at login (after `m_dwTickCheer`); nothing on open |
| Close | `CLOSEBANKWND` (no payload), sent when the window is destroyed (twice when closed by movement) |
| Fees | none |

---------------------------------------------------------------------------------------------------------------------------

## 11. Open questions

1. Change-PIN after a Custody-scroll open loses the scroll ids (WndBank.cpp:513-520 does not call SetItem), so the follow-up
   enter-PIN is treated as an NPC open and silently fails away from a banker (the scroll is not consumed). Copy the bug or pass
   the ids through? (Recommend passing them; it changes nothing on the server.)
2. Equal-to-"0000" check: a player can set the PIN back to "0000"; then every open goes through the set-PIN window again.
   Fine to copy as is.
3. Server does not check `m_bBank` for put/get (a client near a banker could skip the PIN) and does not validate digits on
   PIN change. Client-only port: nothing to do, but worth noting for the server owner.
4. `TID_GAME_SLOTFULL` "Your inventory is full." is also shown when the **bank** is full (original text). Keep?
5. Bank-to-bank moves skip all item-type checks (quest / bound items can reach another character's bank). Client cannot
   change it; just copy.
6. The incoming trade request is not blocked by the client while the bank is open; the server refuses later with a
   misleading "while vending" text. Copy as is?
7. Phone / touch: the original is drag-only. The phone port will need a tap-to-move or long-press scheme (not in the
   original); to be decided with the owner, like the trade and personal-shop phone versions.
8. `IsBinds()` uses the random-option tables (`g_xRandomOptionProperty`) — the client does not pre-check, so the port does
   not need them for the bank; mentioned only so the builder does not add a client check that the original lacks.
9. The NPCs `MaFl_Jeffo` and `MaFl_InstantBank` ("Banker Pang") have the bank menu but are not placed in any world file;
   probably event-spawned on other servers. Nothing to do unless they show up.

Status: complete (sections 1-11).


