# A. Guild Siege (`CGuildCombat`, world 202) - the V15 Neuz client side

Research only, read-only. Root = `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15`.
`Source/` files are CP949 (line numbers as in the file). `Resource/character.inc`, `textClient.inc`, `textClient.txt.txt`, `world.txt.txt` are UTF-16LE; `resdata.inc`, `resData.txt.txt`, `ResData.h`, `GuildCombat.txt` are ANSI.
Texts: a `TID_*` is resolved through `Resource/textClient.inc` (TID -> colour + IDS) and `Resource/textClient.txt.txt` (IDS -> English). I give the inc line as `inc:N` and the English text.
Note: line numbers in `Neuz/DPClient.cpp` moved since the 2026-11-10 study (`OnGuildCombat` is now at 6745, not 6776). The numbers below are today's.
1:1-siege-only code (`GUILDCOMBAT1TO1`, `CGuildCombat1to1Mng`) is left out, except where the normal siege reuses it (marked **[1:1 reuse]**).

---

## 0. Compile switches that matter

- `__VER 15` main server: everything `__VER >= 11` is in. So the siege uses the 1:1 offer window and the 1:1 status layout (see 2.1, 2.2).
- `__S_BUG_GC` is defined (`Source/Neuz/VersionCommon.h:50`): the vector paths are compiled (`#ifdef __S_BUG_GC` blocks).
- `_USE_32BIT_TIME_T` is defined in the client and the world server (`Source/Neuz/StdAfx.h:10`, `Source/WORLDSERVER/StdAfx.h:4`): every `time_t` on the wire is 4 bytes.
- `PACKETTYPE_GETITEM_GUILDCOMBAT` / `SendGCGetItem` are `__VER < 8` only (`Source/_Network/MsgHdr.h:570-572`, `Source/Neuz/DPClient.cpp:9188-9195`): not compiled.
- Wire format of `CAr`: ints/DWORD/BOOL/u_long/OBJID = 4 bytes LE, `__int64` = 8, a string = int32 length + bytes, no NUL (`Source/_Network/Misc/Src/ar.cpp:81-86`). `ReadString(buf, n)` with a length > n-1 blanks the string AND skips the rest of the packet (`ar.cpp:99-112`).

---

## 1. NPCs and their menus

### 1.1 The NPCs

| key | name (character.txt.txt) | portrait | menus | file |
|---|---|---|---|---|
| `MaFl_GuildWar` | `[Guild Siege Manager]Frankie` (IDS_CHARACTER_INC_000434) | `Client/Char/char_GuildWar01.tga` 200x240 | DIALOG, `MMI_GUILDWAR_APP`, `MMI_GUILDWAR_STATE`, `MMI_GUILDWAR_JOIN`, `MMI_GUILDCOMBAT_SELECTION`, `MMI_GUILDCOMBAT_INFO_BOARD1..3` | `Resource/character.inc:3763-3786` (UTF-16 line numbers) |
| `MaFl_Donaris` | `[Guild Siege Manager]Donaris` (IDS_CHARACTER_INC_000436) | `Client/Char/char_GuildWar02.tga` 200x240 | DIALOG, `MMI_GUILDWAR_CANCEL`, `MMI_GUILDCOMBAT_RANKING`, `MMI_GUILDCOMBAT_JACKPOT`, `MMI_GUILDCOMBAT_JACKPOT2`, `MMI_GUILDCOMBAT_INFO_TEX` | `Resource/character.inc:3788-3810` |
| `Mada_Guildcombatshop` | `Guild Siege Merchant` (IDS_CHARACTER_INC_000420) | `char_Achaben.tga` | DIALOG, TRADE; vendor tabs Food / Poster / Magic Tools / Arrow | `Resource/character.inc:3606-3647` |

- Placement: Frankie and Donaris are in `Resource/World/WdMadrigal/WdMadrigal.dyo` (name strings at byte 8560 and 8760). The floats before the name read pos (1747.11, 100, 833.77) and (1747.11, 100, 832.78), angles 267.75 / 270.62. Times 4 (MPU) that is about (6988, 3335) / (6988, 3331) in Flaris, next to the server teleport targets 6983,3330 and 6968,3328.8 below. **The x4 scale is my inference, not confirmed in code.**
- The merchant is spawned by the server inside world 202, twice, as `MI_MADA_ACHABEN` with key `Mada_Guildcombatshop`, at (1343, 94, 1215) and (1288, 98, 1356) (`Source/_Common/eveschool.cpp:1662-1684`).
- Images `char_GuildWar03.tga` / `04.tga` also exist (unused by these NPCs).

### 1.2 How the menu is built (client)

- Menu text = `prj.GetText( TID_MMI_DIALOG + i )` with `TID_MMI_DIALOG 7000` (`Resource/defineText.h:327`, `Source/_Interface/WndWorld.cpp:6686`). No siege menu entry has a client condition: they are always listed (`WndWorld.cpp:6655-6690`). If an NPC had only one menu it would be run directly (`:6692-6695`).
- Handlers: `CWndWorld::OnCommand` (`WndWorld.cpp:3933`), siege cases `:3941-4159`.
- Every NPC-opened siege window is closed by `CWndWorld::Process` when the player starts moving (`WndWorld.cpp:8058` condition, siege ids destroyed at `:8402-8436`: `APP_GUILDCOMBAT_RANK_P`, `APP_GUILDCOMBAT_RANKING`, `APP_GUILD_WAR_STATE`, `APP_CLOSE_EXISTING_CONNECTION` (join confirm), `APP_GUILDCOMBAT_SELECTION`, `APP_GUILDCOMBAT_1TO1_SELECTION/_OFFERSTATE/_OFFER`).

### 1.3 Menu entries

| MMI (id, `Resource/defineNeuz.h`) | text (TID_MMI_* inc line) | on | client action (`WndWorld.cpp`) | client checks |
|---|---|---|---|---|
| `MMI_GUILDWAR_APP` 26 (`:118`) | "Apply" (inc:1432) | Frankie | `SendGuildCombatWindow()` (`:3942-3946`) | none. Server answers only to a guild master (`Source/WORLDSERVER/DPSrvr.cpp:5179-5183`, `TID_GAME_GUILDCOMBAT_NOT_GUILD_LEADER`) |
| `MMI_GUILDWAR_STATE` 27 (`:119`) | "Status" (inc:1437) | Frankie | `SendGCRequestStatusWindow()` (`:3948-3952`) | none |
| `MMI_GUILDWAR_CANCEL` 28 (`:120`) | "Cancel" (inc:1442) | Donaris | opens `CWndGuildWarCancelConfirm(0)` (`:3954-3965`) | none |
| `MMI_GUILDWAR_JOIN` 29 (`:121`) | "Join" (inc:1447) | Frankie | opens `CWndGuildWarJoinConfirm(0)` (`:3967-3978`) | on Yes: vagrants refused (2.6). Server also checks NPC distance (`DPSrvr.cpp:5365`) |
| `MMI_GUILDCOMBAT_RANKING` 30 (`:122`) | "Ranking" (inc:1452) | Donaris | `SendGCPlayerPoint()` (`:3980-3986`) | none |
| `MMI_GUILDCOMBAT_SELECTION` 33 (`:125`) | "Entry" (inc:6830) | Frankie | `SendGCSelectPlayerWindow()` (`:3988-3992`) | window checks state on open (2.3) |
| `MMI_GUILDCOMBAT_INFO_TEX` 40 (`:133`) | "Commission Information" (inc:6939) | Donaris | board with `FILE_GUILDCOMBAT_TEXT_6` (`:3994-4020`) | - |
| `MMI_GUILDCOMBAT_PENYA_RETURN` 41 (`:134`) | "Refund of application fee" (inc:6944) | none | empty handler (`:4022-4025`) | not on any NPC |
| `MMI_GUILDCOMBAT_JACKPOT` 34 (`:126`) | "Receipt of prize money and application money" (inc:6835) | Donaris | `SendGCGetPenyaGuild()` only if `pGuild->IsMaster(me)` (`:4027-4037`) | master only, silent otherwise |
| `MMI_GUILDCOMBAT_JACKPOT2` 35 (`:127`) | "Information about Prize Money" (inc:6914) | Donaris | board with `FILE_GUILDCOMBAT_TEXT_5` (`:4039-4066`) | - |
| `MMI_GUILDCOMBAT_BESTPLAYER` 36 (`:128`) | "Acceptance of prize money for MVP" (inc:6919) | none | `SendGCGetPenyaPlayer()` (`:4068-4072`) | not on any NPC in this data (only MaFl_GuildWar/Donaris carry siege menus, `character.inc` grep) |
| `MMI_GUILDCOMBAT_INFO_BOARD1` 37 (`:130`) | "Information to Participate" (inc:6924) | Frankie | board `FILE_GUILDCOMBAT_TEXT_1` (`:4074-4101`) | - |
| `MMI_GUILDCOMBAT_INFO_BOARD2` 38 (`:131`) | "Basic Rule" (inc:6929) | Frankie | board `FILE_GUILDCOMBAT_TEXT_2` (`:4103-4130`) | - |
| `MMI_GUILDCOMBAT_INFO_BOARD3` 39 (`:132`) | "Conditions to Win" (inc:6934) | Frankie | board `FILE_GUILDCOMBAT_TEXT_3` (`:4132-4159`) | - |

---

## 2. Windows

Sizes and controls from `Resource/resdata.inc` (block line given). Control rects are (left,top)-(right,bottom) in client pixels. All dialogs use `WndTile00.tga` background, style 0x2410000, and call `MoveParentCenter()`.
Window titles: several classes override the resdata title in `PaintFrame` with a TID when `m_nCombatType == 0`.

### 2.1 Apply / bid: `CWndGuildCombat1to1Offer(0)` **[1:1 reuse]**

- Opened by `GC_IN_WINDOW` (3.2). V15 builds `new CWndGuildCombat1to1Offer(0)` instead of `CWndGuildCombatOffer` (`Source/Neuz/DPClient.cpp:6836-6840`); the pointer type is `CWndGuildCombat1to1Offer*` (`Source/_Interface/WndManager.h:436-440`).
- Window `APP_GUILDCOMBAT_1TO1_OFFER`, `resdata.inc:12062`, 304x272, `InitDialog` at `Source/_Interface/WndGuildCombat1to1.cpp:622-625`.
- Title (`PaintFrame`, type 0): `TID_GAME_GUILDCOMBAT_OFFER` "Guild Siege - Apply " (inc:9010) (`WndGuildCombat1to1.cpp:563-586`).

| control | rect | content |
|---|---|---|
| `WIDC_STATIC2` | (20,18)-(116,34) | "Current Application Fee." |
| `WIDC_EDIT1` | (126,18)-(270,37) | the bid; filled by `SetGold` with min fee or own current fee (`DPClient.cpp:6848-6859`, `WndGuildCombat1to1.cpp:645-655`) |
| `WIDC_STATIC3` | (20,62)-(116,78) | "Red Chip Info." |
| `WIDC_TEXT1` | (20,90)-(286,194) | text of `Client/Client/GuildCombatRedChipGuild.inc` (`WndGuildCombat1to1.cpp:606-617`) |
| `WIDC_ACCEPT` `ButtAccept.tga` | (70,206)-(142,226) | tooltip says "Apply for 1vs1 Guild Siege." even in siege mode (shared layout) |
| `WIDC_CLOSE` `ButtClose.tga` | (158,206)-(230,226) | closes |

- Accept (`WndGuildCombat1to1.cpp:670-718`): `nCost = atoi(edit)`.
  - If the guild already bid (`m_dwReqGold != 0`) and `nCost <= old bid` -> box `TID_GAME_GUILDCOMBAT1TO1_MORE_CURRENT_REQUEST` "You require more Penya to apply." (inc:9235).
  - Else if first bid and `nCost < min` -> `TID_GAME_GUILDCOMBAT1TO1_LIMIT_MIN` "Apply with the minimum Application Fee or higher." (inc:9240).
  - Else confirm box `CWndGuildCombat1to1OfferMessageBox` (OK/Cancel) with `TID_GAME_GUILDCOMBAT1TO1_MORE_REQUEST` "You have applied with %d Penya. Do you wish to add %d Penya?" (inc:9245), args (0, cost) or (old, cost-old).
  - OK -> `SendGuildCombatApp( nCost )` and the offer window is deleted (`WndGuildCombat1to1.cpp:779-796`).
- The total prize `__int64` is received but not shown on V15 (`SetTotalGold` only `__VER < 11`, `DPClient.cpp:6861-6863`).
- The old `CWndGuildCombatOffer` (`APP_GUILDCOMBAT_OFFER`, 320x368, `resdata.inc:422`, code `Source/_Interface/WndField.cpp:15439-15589`, dragon-cloak text `TID_GAME_GUILDCOMBAT_PRESENT_TEXT`) is dead code on V15.

### 2.2 Application status: `CWndGuildCombatState(0)` on the 1:1 layout **[1:1 reuse]**

- Opened by `GC_REQUEST_STATUS` (3.2), `DPClient.cpp:6869-6925`. Class is the siege one but `Initialize` uses `APP_GUILDCOMBAT_1TO1_OFFERSTATE` on V15 (`WndField.cpp:16451-16458`).
- `APP_GUILDCOMBAT_1TO1_OFFERSTATE`, `resdata.inc:11960`, 304x480. Title (`PaintFrame`, type 0): `TID_GAME_GUILDCOMBAT_OFFERSTATE` "Guild Siege - Applying Situation" (inc:9030) (`WndField.cpp:16406-16429`).

| control | rect | content |
|---|---|---|
| `WIDC_STATIC1` | (20,20)-(116,36) | "Remaining Time." |
| `WIDC_STATIC2` | (134,20)-(270,36) | count-down to the next siege: "%dday %dhr %dmin %dsec" from `TID_PK_LIMIT_DAY/HOUR/MINUTE/SECOND` (inc:5562/5557/5547/5552), redrawn every frame (`WndField.cpp:16540-16560`, `Process` `:16577-16587`, `SetTime` `WndField.h:1528`) |
| `WIDC_LISTBOX1` | (22,100)-(278,328) | one row per applying guild, `"No.%.2d\t\t%s"` in bid order (`WndField.cpp:16531-16538`). Tooltip "Top 8 Applying Guilds can join the Guild Siege." |
| `WIDC_STATIC3` | (20,342)-(116,358) | "Bidding Rank" |
| `WIDC_STATIC5` | (134,342)-(230,358) | own guild's place (1-based) or blank; **red `0xFFFF0000` when `8 < nRate`** (`WndField.cpp:16562-16575`). Tooltip "Only the Top 8 applying Guilds can join the Guild Siege." |
| `WIDC_STATIC7` | (20,368)-(116,384) | "Current Application Fee." |
| `WIDC_STATIC6` | (134,368)-(230,384) | own guild's bid, money style (`WndField.cpp:16602-16610`) |
| `WIDC_BUTTON1` `ButtApply.tga` | (18,404)-(90,424) | closes, then `SendGuildCombatWindow()` (`WndField.cpp:16503-16514`) |
| `WIDC_BUTTON2` `ButtGWRefresh.tga` | (108,404)-(180,424) | `SendGCRequestStatusWindow()` (`:16516-16526`) |
| `WIDC_CLOSE` `ButtClose.tga` | (200,404)-(272,424) | closes |

- Own place is found by comparing names case-insensitively (`DPClient.cpp:6904-6910`).
- The old `APP_GUILDCOMBAT_OFFERSTATE` layout (`resdata.inc:302`, 304x480) and the `CWndGuildWarState` / `APP_GUILD_WAR_STATE` (336x272, `resdata.inc:27051`, array `GUILDLIST m_aList[MAX_WANTED_LIST]` `WndField.h:1634`) are never created on V15 (no `new` anywhere).

### 2.3 Line-up: `CWndGuildCombatSelection` (pick fighters, order, defender)

- Opened by `GC_SELECTPLAYER` with `bRequestWar && bWindow` (`DPClient.cpp:6927-6979`). With `bRequestWar && !bWindow` it only shows box `TID_GAME_GUILDCOMBAT_PLAYER_MAKEUP` "Line up for guild siege was completed." (inc:6990). With `!bRequestWar` nothing.
- `APP_GUILDCOMBAT_SELECTION`, `resdata.inc:515`, 656x432, title "Set Entry List for Guild Siege". `InitDialog` `WndField.cpp:16117-16120`.
- On open: if `g_GuildCombatMng.m_nGCState != NOTENTER_COUNT_STATE` -> box `TID_GAME_GUILDCOMBAT_CANNOT_MAKEUP` "For now, you can not organize an entry." (inc:7092) and close (`WndField.cpp:16100-16115`). The server checks the same (`DPSrvr.cpp:5230-5240`).

| control | rect | role |
|---|---|---|
| `WIDC_STATIC3` | (24,18)-(624,42) | `TID_GAME_GUILDCOMBAT_OFFER_INFO` "Register an entry for guild siege.   Starting member %d (Maximum member %d)" (inc:7162) with (maxWar, maxJoin) (`WndField.cpp:15918-15928`) |
| `WIDC_STATIC1` | (24,52)-(278,74) | "Connected Guild Member List" |
| `WIDC_LISTBOX1` | (22,72)-(284,284) | online guild members only, sorted by level ascending, row `"Lv%.2d\t%.16s %.10s"` (level, name, job) (`WndField.cpp:15972-16024`) |
| `WIDC_BUTTON1` `Buttright2.bmp` | (284,136)-(325,156) | "--->" add selected member to entrants (`:16153-16205`) |
| `WIDC_BUTTON2` `Buttleft2.bmp` | (284,192)-(325,212) | "<---" remove entrant (`:16208-16229`) |
| `WIDC_STATIC2` | (348,52)-(596,70) | "Entrant List for Guild Siege" |
| `WIDC_LISTBOX2` | (348,72)-(604,380) | entrants in fighting order. Tooltip "5 selected members will join the Guild Siege first. Please make an entrant list." |
| `WIDC_BUTTON3` `ButtUp.tga` | (604,166)-(624,207) | move up (`:16232-16254`) |
| `WIDC_BUTTON4` `ButtDown.tga` | (604,242)-(624,283) | move down (`:16257-16279`) |
| `WIDC_BUTTON8` `ButtDefenderIcon.tga` | (328,82)-(344,98) | disabled marker; hidden if no defender, else moved to `(330, i*17 + 75)` beside the defender row (`:16048-16073`). Tooltip "Opponents will get bonus point when your Guild Defender is killed." |
| `WIDC_FINISH` `ButtFinish.BMP` | (58,318)-(130,338) | "Complete" (`:16287-16345`) |
| `WIDC_RESET` `ButtReset.BMP` | (158,318)-(230,338) | "Remake": OK/Cancel box `TID_GAME_GUILDCOMBAT_REMAKE_MAKEUP` "Would like to organize line up for guild siege again?" (inc:7087), OK = `Reset()` (`:16281-16285`, `:15844-15870`, `:16141-16148`) |
| `WIDC_BUTTON7` `ButtGWDefender.tga` | (58,352)-(130,372) | "Select Defender" (`:16348-16369`) |
| `WIDC_CLOSE` `ButtClose.tga` | (158,352)-(230,374) | closes |

- Fill: the server's saved entrants arrive in the packet and are added to the right list (`AddCombatPlayer`), but they are NOT removed from the left list (`DPClient.cpp:6955-6963`, `WndField.cpp:15898-15916`); adding one of them again gives the "already" box.
- Coloured bands drawn behind the right list: blue `ARGB(40,0,0,220)` from y 74 to `74 + maxWar*17`, red `ARGB(40,220,0,0)` from there to y 377, x 349..587 (`WndField.cpp:16075-16087`). So the first `MAXWARPLAYER` rows are "starting fighters", the rest are reserves.
- Add checks: nothing selected -> ignore; `nMaxJoinMember < size` -> box `TID_GAME_GUILDCOMBAT_SELECTION_MAX` "The  number %d of people was exceeded." (inc:7166) - **off by one: the client lets you reach maxJoin+1** (`:16161`); level < 30 -> `TID_GAME_GUILDCOMBAT_LIMIT_LEVEL_NOTICE` "You should be over level 30 for an entry." (inc:7102); not a member -> `TID_GAME_GUILDCOMBAT_NOT_GUILD_MEMBER` (inc:7107); already listed -> `TID_GAME_GUILDCOMBAT_ALREADY_ENTRY` "Be registered. Register again." (inc:7112).
- Defender: the guild master cannot be defender when more than one entrant: `TID_GAME_GUILDCOMBAT_MASTER_NOT_ASSIGN_DEFENDER` "The Guild Master cannot be a defender." (inc:7132) (`:16360-16364`). Removing the defender's row clears the defender (`:15965-15966`).
- Complete checks, in order: no defender -> `TID_GAME_GUILDCOMBAT_NOT_ASSIGN_DEFENDER` "There is no defender. Select a defender." (inc:7117); state changed -> CANNOT_MAKEUP and close; empty list -> `TID_GAME_GUILDCOMBAT_HAVENOT_PLAYER` (inc:7122); no master or kingpin (`GUD_MASTER`/`GUD_KINGPIN`) in the list -> `TID_GAME_GUILDCOMBAT_HAVENOT_MASTER` "There is no kingpin or guild master in an entry." (inc:7127). OK -> `SendGCSelectPlayer( list, defender )` and close.
- The old `APP_GUILDCOMBAT_COMBATLIST` (400x416, `resdata.inc:245`) and `APP_GUILDCOMBAT_TOTALRANKING` (416x592, `resdata.inc:653`) are never used.

### 2.4 Entry-point selection: `CWndGuildCombatJoinSelection`

- Opened by `GC_SELECTWARPOS` (`DPClient.cpp:7088-7105`): `SetMapNum( nMap )` (99 = none/random) and `SetTimeOut( nJoinWarTime * 1000 )` ms (`WndField.h:1552-1553`). The server sends it each time a fighter is about to be sent in, with `m_nMaxMapTime` = `MAXMAPTIME 10` (`Source/_Common/eveschool.cpp:2253`, `:2344`, `:3326`, `:3381`; `Resource/GuildCombat.txt:36`).
- `APP_GUILDCOMBAT_SELSTART`, `resdata.inc:167`, 320x176, resdata title "Resurrection Location Window" but the title bar is hidden (`WndField.cpp:16681-16688`).

| control | rect | role |
|---|---|---|
| `WIDC_BUTTON1..4` `ButtGW1..4.tga` | (30,26)-(70,66), (98,26)-(138,66), (166,26)-(206,66), (236,26)-(276,66) | area 1..4, tooltips "You enter the 1st/2nd/3rd/4th area."; click = `SendGCSelectMap(0..3)` at once and remember it (`WndField.cpp:16724-16748`) |
| `WIDC_STATIC3` | (10,78)-(298,94) | "Select the area you wish to enter." |
| `WIDC_STATIC2` | (16,108)-(296,124) | `TID_GAME_GUILDCOMBAT_JOIN_MESSAGE` "After %d, you enter %s." (inc:6965) with seconds left `(left/1000)+1` and `"Random"` or `"1".."4"` (`WndField.cpp:16626-16646`) |

- The chosen button gets a blue frame `0xFF0000FF`, rect deflated 1 px (`WndField.cpp:16648-16678`).
- When time is up: `SendGCSelectMap( m_nMapNum )` (99 if nothing chosen) and close (`WndField.cpp:16713-16722`). No close button.
- Server use: the 4 fixed entry points are `(1263,83,1303)`, `(1310,83,1303)`, `(1265,83,1254)`, `(1314,83,1253)`; 99 = random of the 4 (`eveschool.cpp:575-583`, teleport `:596`). These match the numbers 1-4 on the minimap mask (4.2).

### 2.5 Cancel confirm: `CWndGuildWarCancelConfirm(0)`

- `APP_GUILDCOMBAT_CANCEL_CONFIRM`, `resdata.inc:2300`, 336x160; `WIDC_TEXT1` (12,8)-(316,82), `WIDC_YES` `ButtYes.tga` (80,92)-(152,112), `WIDC_NO` `ButtNo.tga` (172,92)-(244,112).
- Title `TID_GAME_GUILDCOMBAT_CANCEL_CONFIRM` "Guild Siege - Cancel Application" (inc:9040) (`WndField.cpp:16838-16861`).
- Text: a CWndText created in code in the top half (client rect +8/+8/-4, bottom/2) with `TID_GAME_GUILDWAR_CANCEL` "Do you want to withdraw from the Guild Siege?" (inc:6048) in black `0xff000000` (`WndField.cpp:16868-16883`).
- Yes -> `SendGuildCombatCancel()`; No -> close (`WndField.cpp:16908-16935`).

### 2.6 Join confirm: `CWndGuildWarJoinConfirm(0)`

- Uses `APP_CLOSE_EXISTING_CONNECTION` (`WndField.cpp:17008-17011`), `resdata.inc:28218`: 256x144, `WndMessagebox.tga`, `WIDC_YES` `ButtYes.tga` (48,84)-(120,104), `WIDC_NO` `ButtNo.tga` (126,84)-(198,104).
- Title `TID_GAME_GUILDCOMBAT_ENTRANCE` "Entering Guild Siege Arena" (inc:9085) (`WndField.cpp:16954-16977`).
- Text `TID_GAME_GUILDWAR_JOIN` "Do you join the Guild Siege?" in its TID colour `0xff0000ff` (inc:6053) (`WndField.cpp:16994-17003`).
- Yes: vagrant (`IsBaseJob`) -> box `TID_GAME_GUILDCOMBAT_NOTENTER_VAGRANT` (inc:7136) and close; else `SendGCJoin()` (`WndField.cpp:17031-17065`).
- `CWndGuildWarAppConfirm` (`TID_GAME_GUILDWAR_APP`, sends a fixed 80000 bid, `WndField.cpp:16753-16819`) is never created: dead code.

### 2.7 Info boards: `CWndGuildCombatBoard(0)`

- `APP_GUILDCOMBAT_BOARD`, `resdata.inc:137`, 384x384; `WIDC_TEXT1` (12,10)-(364,306); `WIDC_BUTTON1` `ButOk2.bmp` (154,318)-(226,338) closes (`WndField.cpp:15671-15679`).
- Title `TID_GAME_GUILDCOMBAT_BOARD` "Guild Siege - Info." (inc:9020) (`WndField.cpp:15605-15629`).
- Text: `GetLangFileName( lang, FILE_GUILDCOMBAT_TEXT_n )` = `"GuildCombatTEXT_n" + "_ENG.inc"` (`Source/_Common/ProjectCmn.cpp:11-29`, enum `Source/_Common/ProjectCmn.h:199-204`; `_ENG.inc` from `Resource/propLang.txt` row 1), loaded as `"Client\\" + name` with `CScript` and parsed with `AddParsingString` (`WndWorld.cpp:4007-4017`, `WndField.cpp:15681-15687`). If the file is missing the window is deleted silently.
- Files (all exist only in English, all UTF-16LE with BOM, markup `#b`/`#nb` bold, `#cAARRGGBB`/`#nc` colour):

| file | used by | size | content (short) |
|---|---|---|---|
| `Client/Client/GuildCombatTEXT_1_ENG.inc` | BOARD1 | 1104 B | Participation: apply Sun 00:00 - Sat 12:00, channel 1, guild level 20+, member level 30+, master or kingpin must join, "8 highest paying guilds", schedule, "only if 3 or more Guilds" |
| `Client/Client/GuildCombatTEXT_2_ENG.inc` | BOARD2 | 928 B | Basic rules: 30 min battle, parties and buffs cancelled, 5 members per guild, replacement order, "Each member has 3 lives" |
| `Client/Client/GuildCombatTEXT_3_ENG.inc` | BOARD3 | 1188 B | Winning priority and points: kill +2; bonuses +1 (new victim, by master, defender, last life, surviving lives) |
| `Client/Client/GuildCombatTEXT_4_ENG.inc` | nothing (no menu uses TEXT_4) | 486 B | byte-identical to TEXT_6 (`cmp`) |
| `Client/Client/GuildCombatTEXT_5_ENG.inc` | JACKPOT2 | 568 B | Reward: Red Chips, stay in the arena, mailbox if inventory full |
| `Client/Client/GuildCombatTEXT_6_ENG.inc` | INFO_TEX | 486 B | Applying fee: cancel -20%, failure -2%, the 8 accepted guilds do not get the fee back |
| `Client/Client/GuildCombatRedChipGuild.inc` | offer window text (2.1) | 302 B, ASCII | Red Chips info (`WndGuildCombat1to1.cpp:610`) |

- These texts are static: "8 guilds", "5 members", "3 lives" are written in them, while `Resource/GuildCombat.txt` says `MAXJOINGUILDSIZE 8` (`:24`), `MAXWARPLAYER 5` (`:33`), `MAXPLAYERLIFE 6` (`:27`). So the "3 lives" text already does not match the server value.

### 2.8 Pop-up message boxes

| class | window | opened by | content / buttons |
|---|---|---|---|
| `CGuildCombatInfoMessageBox(0)` | `APP_GUILDCOMBAT_MSG`, `resdata.inc:2339`, 320x176: `WIDC_TEXT1` (8,8)-(298,100), `WIDC_YES` (64,106)-(136,126), `WIDC_NO` (172,106)-(244,126) | `GC_TELE` (`DPClient.cpp:7202-7219`) | text from the packet; server sends `TID_GAME_GUILDCOMBAT_TELE` "Entrance has started. Would you like to teleport to the Guild Siege arena?" (inc:6188) to every selected entrant (`eveschool.cpp:2443-2444`, `:2459-2460`). Yes -> `SendGCTele()` (`WndField.cpp:15741-15753`); server moves the player to Madrigal (6983, 0, 3330), i.e. next to Frankie, not into the arena (`DPSrvr.cpp:5511-5520`). Title overridden to `TID_GAME_GUILDCOMBAT_OFFERSTATE` "Guild Siege - Applying Situation" (`WndField.cpp:15706-15729`). Note `WIDC_NO` falls through into `case 10000` (no `break`, `:15754-15762`), harmless |
| `CGuildCombatInfoMessageBox2` | `APP_GUILDCOMBAT_MSG2`, `resdata.inc:1934`, 320x176: `WIDC_TEXT1` (8,8)-(298,100), `WIDC_OK` `ButtOk.tga` (118,106)-(190,126) | `GC_DIAGMESSAGE` (`DPClient.cpp:7188-7201`) | title "Guild Siege Introduction"; text from packet. Server sends to masters/kingpins of applying guilds when the siege opens: `TID_GAME_GUILDCOMBAT_JOIN_OK` (qualified, go to Franky) or `..._JOIN_CANCLE` (failed, get fee back from Donalis) (inc:6178/6183) (`eveschool.cpp:1704-1729`) |
| `CWndMessageBox` via `OpenMessageBox` | standard | many | see texts in 3.2 |

### 2.9 Player ranking: `CWndGuildCombatRank_Person` + `CWndGuildCombatRank_Class` tabs

- Opened by `GC_PLAYERPOINT` (Donaris "Ranking", `DPClient.cpp:7594-7646`).
- `APP_GUILDCOMBAT_RANK_P`, `resdata.inc:2468`, 400x384, title "Guild Member Ranking"; `WIDC_TABCTRL1` (10,8)-(390,310), `WIDC_CLOSE` `ButtClose.tga` (162,318)-(234,338).
- 5 tabs, each a `CWndGuildCombatRank_Class` on `APP_GUILDCOMBAT_RANKINGCLASS` (`resdata.inc:233`, 368x288, no controls, all drawn): "United Rank" (`TID_GAME_TOOLTIP_LOG1`, inc:7265), then job names `m_aJob[1]` Mercenary, `[4]` Magician, `[2]` Acrobat, `[3]` Assist (`WndField.cpp:17746-17791`). Tab button length 100.
- Data: entries (id, job, point) go into a multimap by point, then `DivisionList()` copies them, highest first, into the job tab (all 2nd/master/hero jobs of the line) and into the total tab (`WndField.cpp:17823-17922`). Jobs not in the 4 lines (vagrant) are dropped from both.
- Drawing (`WndField.cpp:17937-18081`): two dark lines at y 5-7 and 25-27; headers at y 10: Rank `x 12`, Name `x 48`, Job `x 188`, Point `x 283` (`TID_GAME_RATE/NAME/JOB/POINT`); rows from y 35, 18 px pitch, **11 rows per page** (`MAX_GUILDCOMBAT_RANK_PER_PAGE`, `WndField.h:1766`); ties share a rank (rank cell blank); row 0 in red `RGB(200,0,0)`, others black; selected row darker. Own row repeated at y 250 in blue `RGB(0,0,255)`. Vertical scroll bar on the right; mouse wheel scrolls. Names come from `CPlayerDataCenter` (the client also sends `SendQueryPlayerData` for all ids, `DPClient.cpp:7639-7640`).
- **Hard limit: `MAX_GUILDCOMBAT_RANK 100` rows per tab** (`WndField.h:1767`, array `m_listRank[100]` `:1781`); more are dropped with `Error("...range over")` (`WndField.cpp:18169-18175`).
- `CWndGuildCombatRanking` (`APP_GUILDCOMBAT_RANKING`, 256x272, `resdata.inc:25818`) is never created on V15.

### 2.10 Result window: `CWndGuildCombatResult` + 2 tabs

- Opened automatically by `GC_LOG` (`DPClient.cpp:7254-7513`). The server sends `GC_LOG` to everyone inside world 202 when the result is known (`eveschool.cpp:1445` -> `Source/WORLDSERVER/User.cpp:5835-5866`) and to each entrant via `SendGCLog` (`eveschool.cpp:3218-3257`).
- `APP_GUILDCOMBAT_RESULT_POINT`, `resdata.inc:2378`, 560x320, title "Guild & Member Ranking"; `WIDC_TABCTRL1` (8,12)-(552,282); tab length 100 (`WndField.cpp:17547-17590`).
- Tab 1 "United Rank" = `APP_GUILDCOMBAT_TAB_RESULT` (`resdata.inc:1886`, 528x240): `WIDC_STATIC1` "Guild Ranking" (12,20)-(240,36), `WIDC_LISTBOX1` (12,56)-(242,218), `WIDC_STATIC2` "Member Ranking" (272,20)-(508,36), `WIDC_LISTBOX2` (276,56)-(506,218).
  - Guild rows from the HUD map `m_mmapGuildCombat_GuildPrecedence` (last `GC_GUILDPRECEDENCE`): `"%2d   %s\t(%d)"`, rank 1 adds `" WINNER"`, ties `"     %s\t(%d)"`; names cut to 10 chars + "..." (`DPClient.cpp:7271-7317`).
  - Member rows from `m_mmapGuildCombat_PlayerPrecedence` (last `GC_PLAYERPRECEDENCE`), same format, `" MVP"` when id == `m_uBestPlayer` (`DPClient.cpp:7319-7369`).
- Tab 2 "Battle Log" (`TID_GAME_TOOLTIP_LOG2`, inc:7269) = `APP_GUILDCOMBAT_TAB_RESULT_LOG` (`resdata.inc:2399`, 528x256): `WIDC_TEXT1` (8,8)-(514,210), `WIDC_BUTTON1` `ButtSave.tga` (229,217)-(301,237) saves the text to `GuildLog_YYYYMMDD.txt` and shows `TID_GAME_GUILDCOMBAT_LOG_SAVE` "Log was saved to %s file" (`WndField.cpp:17703-17728`).
  - One entry per kill (`DPClient.cpp:7375-7510`): line 1 `"[atkGuild] [Guild Master] atkName(%d grade) Attack → [defGuild] [Guild Master|Defender] defName"`; own kills in green `#cff009c00`, own guild's deaths in red `#cff9c0000`. Line 2 `"< Basic Point +2, Guild Master Bonus +1, Defender Bonus +1, Kill bonus +1, Resurrecting Bonus +1 >"` (only the flags that are set) (`TID_GAME_GC_LOG1..5`, inc:7289-7305; `TID_GAME_GC_LOG_MASTER/DEFENDER/GUILD/POINT` inc:7273-7285), then a blank line.
  - The code calls `pGuildAtk->IsMaster(...)` without a NULL check (`DPClient.cpp:7393-7394`): a port must handle an unknown guild id.

---

## 3. Packets

### 3.1 Client -> server (`Source/Neuz/DPClient.cpp:9115-9205`)

Each is a normal packet: DWORD packet type then payload.

| function | packet type (`Source/_Network/MsgHdr.h`) | payload | sent from |
|---|---|---|---|
| `SendGuildCombatWindow` | `PACKETTYPE_IN_GUILDCOMBAT` 0xf000d022 (`:557`) | BYTE `GC_IN_WINDOW` 0x01 | Apply menu, status "Apply" button |
| `SendGuildCombatApp(dwPenya)` | same 0xf000d022 | BYTE `GC_IN_APP` 0x02, DWORD penya | offer confirm OK |
| `SendGuildCombatCancel` | `PACKETTYPE_OUT_GUILDCOMBAT` 0xf000d023 (`:558`) | - | cancel confirm Yes |
| `SendGCRequestStatusWindow` | `PACKETTYPE_REQUEST_STATUS` 0xf000d028 (`:563`) | - | Status menu, Refresh |
| `SendGCSelectPlayerWindow` | `PACKETTYPE_SELECTPLAYER_GUILDCOMBAT` 0xf000d027 (`:562`) | BOOL TRUE | Entry menu |
| `SendGCSelectPlayer(list, defender)` | same 0xf000d027 | BOOL FALSE, u_long defender, int n, n x u_long playerId (in order) | line-up Complete |
| `SendGCSelectMap(nMap)` | `PACKETTYPE_SELECTMAP_GUILDCOMBAT` 0xf000d02b (`:566`) | int map (0-3, or 99) | entry-point window |
| `SendGCJoin` | `PACKETTYPE_JOIN_GUILDCOMBAT` 0xf000d024 (`:559`) | - | join confirm Yes |
| `SendGCGetPenyaGuild` | `PACKETTYPE_GETPENYAGUILD_GUILDCOMBAT` 0xf000d02d (`:568`) | - | JACKPOT menu (master) |
| `SendGCGetPenyaPlayer` | `PACKETTYPE_GETPENYAPLAYER_GUILDCOMBAT` 0xf000d02e (`:569`) | - | BESTPLAYER menu (no NPC has it) |
| `SendGCTele` | `PACKETTYPE_TELE_GUILDCOMBAT` 0xf000d030 (`:573`) | - | `GC_TELE` box Yes |
| `SendGCPlayerPoint` | `PACKETTYPE_PLAYERPOINT_GUILDCOMBAT` 0xf000d031 (`:574`) | - | Ranking menu |
| `SendHdr(PACKETTYPE_REVIVAL_TO_LODESTAR)` | - | - | automatic on own death when `m_nGuildCombatState == 1` (4.5) |

### 3.2 Server -> client: `SNAPSHOTTYPE_GUILDCOMBAT`

- Inside the snapshot stream: OBJID (u32), WORD `SNAPSHOTTYPE_GUILDCOMBAT` 0x00b8 (`MsgHdr.h:1075`), BYTE sub-type. Dispatch `CDPClient::OnSnapshot` -> `OnGuildCombat` (`DPClient.cpp:659`, `:6745-6821`). Sub-type ids `MsgHdr.h:1509-1532`. `GC_IN_APP` 0x02 and `GC_IN_COMPLETE` 0x03 are not handled (commented out `DPClient.cpp:6754-6756`).
- Server writers for cross-checking: `Source/WORLDSERVER/User.cpp:5718-6309` (broadcasts) and `:6807-7067` (per user).

| sub-type | id | layout (in order) | client action |
|---|---|---|---|
| `GC_WINGUILD` | 0x00 | int combatIndex, u_long winGuildId, int winCount | stores `m_nGuildCombatIndex`, `m_uWinGuildId`, `m_nWinGuildCount` (`DPClient.cpp:7809-7812`). Sent at login (`Source/WORLDSERVER/DPDatabaseClient.cpp:1115`) and to all at the end (`eveschool.cpp:1442`) |
| `GC_IN_WINDOW` | 0x01 | __int64 totalPrize, DWORD ownBid, DWORD minBid | if `m_nState != CLOSE_STATE` -> box `TID_GAME_GUILDCOMBAT_REQUESTEND` "Guild Siege is closed." (inc:6163) and stop; else opens 2.1 (`DPClient.cpp:6822-6867`). Prize ignored on V15 |
| `GC_REQUEST_STATUS` | 0x04 | time_t(32-bit) secondsToNext, __int64 prize, int n, n x string guildName (read max 127), DWORD ownBid | opens 2.2 (`DPClient.cpp:6869-6925`). n = all applicants, no cap (`User.cpp:6832-6845`) |
| `GC_SELECTPLAYER` | 0x05 | int maxJoin, int maxWar, BOOL requestWar; if: BOOL window; if: u_long defender, int n, n x u_long id | opens 2.3 or shows "completed" (`DPClient.cpp:6927-6979`) |
| `GC_SELECTWARPOS` | 0x06 | int map (99 = default/random), int seconds | opens 2.4 (`DPClient.cpp:7088-7105`) |
| `GC_BESTPLAYER` | 0x07 | u_long playerId | `m_uBestPlayer` (`DPClient.cpp:7813-7816`). Login (`DPDatabaseClient.cpp:1116`) and end (`eveschool.cpp:1443`) |
| `GC_ISREQUEST` | 0x08 | BOOL | `m_bRequest` = own guild applied (`DPClient.cpp:7248-7253`). Login (`DPDatabaseClient.cpp:1109`) and changes (`:1390`, `:1450`) |
| `GC_USERSTATE` | 0x10 | OBJID moverObjId, int state | `pMover->m_nGuildCombatState` (0 none, 1 fighting, 2 waiting/observer-entrant) (`DPClient.cpp:6980-6991`). Sent to the visibility range (`User.cpp:5718-5731`) |
| `GC_WARPLAYERLIST` | 0x11 | int nGuild; per guild: u_long defenderId, int n; per member: u_long id, int status (1 fighting, 0 waiting or out) | clears and refills `m_mapGC_GuildStatus` keyed by defender id (`DPClient.cpp:7220-7247`, `WndWorld.cpp:3846-3866`). Server caps nGuild at `m_nMaxGuild` (`eveschool.cpp:3569-3621`) |
| `GC_GUILDSTATUS` | 0x20 | int joinIndex (= maxWar while someone waits, else 0), int n; n x (u_long id, int lives) | own-guild list for the HUD; row `i == joinIndex` (and joinIndex != 0) is "next to go in" (`DPClient.cpp:6993-7022`). Order from server: fighters, waiting queue, dead (`User.cpp:6042-6091`). Sent to own guild only |
| `GC_GUILDPRECEDENCE` | 0x21 | int n; n x (BOOL has; if has: string guildName (max 127), int points) | HUD guild board data (`DPClient.cpp:7024-7054`). n = all siege guilds; has=FALSE for a guild with no entrants (`User.cpp:6189-6208`). Sent to world 202 |
| `GC_PLAYERPRECEDENCE` | 0x22 | int nGuild; per guild: int n; n x (u_long id, int points) | HUD player board data (`DPClient.cpp:7056-7086`). Sent to world 202 |
| `GC_GCSTATE` | 0x30 | int state, int(OBJID) warState | `m_nState`, `m_nGCState` + messages (4.1) (`DPClient.cpp:7647-7716`). Login (`DPDatabaseClient.cpp:1110`) and all changes (`User.cpp:5752-5761`) |
| `GC_NEXTTIMESTATE` | 0x31 | DWORD msLeft, DWORD nextGCState | sets HUD count-down (4.1) (`DPClient.cpp:7718-7790`) |
| `GC_ENTERTIME` | 0x32 | DWORD msLeft | if `IsRequest()`: count-down "Time Limit" + chat `TID_GAME_GUILDCOMBAT_JOIN_NOW` "Guild Siege mode is now available." (inc:6288) (`DPClient.cpp:7792-7808`) |
| `GC_DIAGMESSAGE` | 0x33 | string (max 511) | box 2.8 (`DPClient.cpp:7188-7201`) |
| `GC_TELE` | 0x34 | string (max 511) | Yes/No box 2.8 (`DPClient.cpp:7202-7219`) |
| `GC_LOG` | 0x35 | u_long n; n x (u_long atkGuild, u_long defGuild, u_long atkPlayer, u_long defPlayer, int point, BOOL diffGuild, BOOL master, BOOL defender, BOOL lastLife) | fills `m_vecGCGetPoint`, opens 2.10 (`DPClient.cpp:7254-7513`) |
| `GC_LOG_REALTIME` | 0x36 | u_long atkGuild, u_long defGuild, string atkName (max 63), string defName (max 63), u_long atkPlayer, u_long defPlayer, int point, BOOL x4 | one white chat line per kill. English/Vietnamese use a hard-coded `"[%s][%s] has killed [%s][%s] and has gained %d points."` (`DPClient.cpp:7514-7592`). Sent to world 202 (`User.cpp:5867-5906`) |
| `GC_GETPENYAGUILD` | 0x40 | int result, __int64 penya | 0 `TID_GAME_GUILDCOMBAT_JACKPOT` "You received %I64d penya as prize money..." (inc:6899); 1 `_JACKPOT_CANCEL` (inc:6904); 2 `_WINNER_NOT_GUILD` (inc:6970); 3 overflow: `_JACKPOT_LIMIT2` if > INT_MAX else `_LIMIT1` if gold+penya > INT_MAX (`DPClient.cpp:7106-7150`) |
| `GC_GETPENYAPLAYER` | 0x41 | int result, __int64 penya | 0 `TID_GAME_GUILDCOMBAT_MVP_PENYA` (inc:6980); 1 `_NOT_MVP` (inc:6975); 2 overflow like above (`DPClient.cpp:7151-7187`) |
| `GC_PLAYERPOINT` | 0x42 | u_long n; n x (u_long id, int job, int point) | fills `m_vecGCPlayerPoint`, opens 2.9 (`DPClient.cpp:7594-7646`) |

### 3.3 State values (shared header)

`Source/_Common/eveschool.h:74-75`: `OPEN_STATE 0, CLOSE_STATE 1, WAR_STATE 2, COMPLET_CLOSE_STATE 3, GM_COLSE_STATE 4`; `NOTENTER_STATE 100, NOTENTER_COUNT_STATE 101, ENTER_STATE 102, MAINTENANCE_STATE 103, WAR_WAR_STATE 104, WAR_CLOSE_STATE 105, WAR_CLOSE_WAIT_STATE 106, WAR_TELEPORT_STATE 107`. Client defaults: `CLOSE_STATE` / `WAR_CLOSE_STATE`, win guild 0, best player 0 (`eveschool.cpp:328-338`).
Packet structs: `__GCGETPOINT` (4 x u_long, int, 4 x BOOL) `eveschool.h:175-192`; `__GCPLAYERPOINT` (u_long, int, int) `:193-203`.

---

## 4. In the siege world (WI_WORLD_GUILDWAR 202)

### 4.1 Entering, state messages, count-down

- On `OnReplace` to world 202: loading picture `Theme/Default/MapLoading_GuildWar.tga` (1024x768, 24-bit TGA) (`DPClient.cpp:2281-2288`); after the first frame `Sleep(2000)` (`:2361-2362`); in-game clock fixed at 19:00 (`:2364-2369`). Changing to an ordinary world clears the count-down (`:2303-2310`).
- Messages on `GC_GCSTATE` (`DPClient.cpp:7647-7716`):
  - state 101 `NOTENTER_COUNT_STATE` (anywhere): guild master of an applying guild gets chat `TID_GAME_GUILDCOMBAT_NOW_PLAYER_MAKEUP` "From now on, you can organize the entry of guild siege." (inc:6995).
  - Only inside 202: `WAR_STATE`+`MAINTENANCE_STATE` -> white chat `TID_GAME_GUILDCOMBAT_MAINTENANCE2` "Combat starts right after server maintenance. Prepare for war!" (inc:6238); `WAR_STATE`+`WAR_WAR_STATE` -> music `BGM_BA_CRISIS` + big caption `TID_GAME_GUILDCOMBAT_WAR` "Start Combat" (inc:6243); `COMPLET_CLOSE_STATE`+`WAR_CLOSE_STATE` -> caption `TID_GAME_GUILDCOMBAT_WAR_END` "End combat" (inc:6248); `COMPLET_CLOSE_STATE`+`WAR_CLOSE_WAIT_STATE` -> `m_bRequest = FALSE`; `CLOSE_STATE`+`WAR_TELEPORT_STATE` -> count-down off and own-guild list cleared.
  - Caption font: `CWndWorld::m_pFontAPITitle`, font `szFontFirst` (Verdana for English), height = screen width / `nDivCaption` (50), white with blue outline `ARGB(255,40,100,220)`, outline 2 (`WndWorld.cpp:3486-3498`, `Resource/propLang.txt` row 1).
- Count-down label on `GC_NEXTTIMESTATE` (`DPClient.cpp:7734-7788`): next state `WAR_WAR_STATE` -> `TID_GAME_GUILDCOMBAT_MAINTENANCE` "Maintenance Schedule" (inc:6233); `WAR_CLOSE_STATE` -> "End combat"; `WAR_TELEPORT_STATE` -> `TID_GAME_GUILDCOMBAT_EXIT_MSG` "Teleporting to Flaris" (inc:6253) - these three only in 202; `ENTER_STATE` -> master or kingpin of an applying guild, any world: `TID_GAME_GUILDCOMBAT_PLAYER_MAKEUP_FINISH` "Time for organizing line up and preparation for Guild Siege." (inc:7067). `GC_ENTERTIME` -> `TID_GAME_GUILDCOMBAT_JOIN_LIMIT_TIME` "Time Limit" (inc:6268).
- Count-down drawing (`CWndWorld::OnEraseBkgnd`, `WndWorld.cpp:883`, block `:1163-1197`): text `"%s %.2d:%.2d:%.2d"`, font `m_pFontGuildCombatText` = map "gulim13" = `szFont2` 13 (Verdana) (`Source/_Interface/ITheme.cpp:98`, `:420`); centred at y = 110; colour white `0xffffffff` with outline `0xff990099`; hidden when it reaches 0.

### 4.2 Minimap mask

- `CWndNavigator` loads `World\WdGuildWar\WdGuildWar_Mask.dds` (`DIR_WORLD_GUILDCOMBAT`, `Source/_Common/path.h:18`) at init (`WndField.cpp:9903`).
- In world 202 it draws the mask over every landscape minimap tile, same size, alpha 200 (`WndField.cpp:9214-9218`, `:9242-9246`).
- `WdGuildWar_Mask.dds`: 256x256 A8R8G8B8, transparent except 4 yellow circled numbers ①②③④ at about pixels (117,114), (145,114), (117,142), (145,142) (I converted it to PNG to look). With the 512 m tile at landscape 02-02 (x,z 1024..1536, 2 m per pixel, z up) these are exactly the 4 entry points of 2.4.

### 4.3 HUD boards (`CWndWorld::OnEraseBkgnd`)

Guild board and player board are drawn only while the player is in world 202 (`WndWorld.cpp:1248`), for fighters and spectators alike. Origin `cPoint = (clientWidth - 150, 200)`, row gap 16 (`:1250-1254`). All text has a black outline `0xFF000000`.

| piece | position / box | content and colours |
|---|---|---|
| guild board box | x-10 .. x+140, from y-10, height `(nGuilds + 3) * 16`, fill `ARGB(30,0,0,0)` (`:1257-1263`) | - |
| guild board title | (x+10, 200) | `TID_GAME_GUILDCOMBAT_RATE` "Current rank:" (inc:7196) in `0xFFEBAD18` (`:1269`) |
| guild rows | from y 224, 16 px each; rank at x (`"%2d"`, blank for a tie), name at x+25 (5 chars + "..."), points at x+110 (`:1270-1327`) | own guild `0xFF9ED3FF`, others `0xFFFFFF99` (name compare, `:1281-1290`). Every guild in the packet is drawn, **no row limit** |
| player board | starts 50 px under the last guild row; same box rule with `(nPlayers + 3) * 16` (`:1329-1339`) | title `TID_GAME_GUILDCOMBAT_PERSON_RATE` "Individual rank:" (inc:7191) in `0xFFEBAD18` |
| player rows | **top 10 only** (`nMaxRender = 10`, `:1344-1373`); same columns | own `0xFF9ED3FF`, others `0xFFFFFF99`. If you are not in the top 10, one extra own row after a 16 px gap with your rank/points (`:1433-1458`); if you are not in the list at all it shows rank 0 / 0 points. The box height still counts all players, not 10 |

- Own-guild list (left side, `WndWorld.cpp:1461-1618`), drawn in ANY world while you appear in `m_mapGC_GuildStatus` (state 0 or 1):
  - box x 5..140, from y 120, height `(n + 2) * 16`, `ARGB(30,0,0,0)`; title = own guild name at (10, 129) in `0xFFEBAD18`; rows from (10, 150), 16 px.
  - Row: `"D"` at x 4 if the member is a defender key in `m_mapGC_GuildStatus`; number at x 10; name (5 chars + "...") at x 35; lives left `max(nLife-1, 0)` at x 120; HP bar at x 150, 60x11, back `ARGB(100,0,0,0)`, fill `ARGB(100,0,255,0)` from the mover's HP if visible, else empty (`:1565-1595`).
  - Colours: you `0xFF9ED3FF`, others `0xFFFFFF99`, the "next in" row `0xFF00CB00` with one extra gap above it, members with 0 lives grey `0xFFCBCBCB` after one extra gap.
  - If you are the next in and have lives, while `WAR_STATE`: two yellow `0xFFFFFF00` lines at screen centre, y = height/2 - 150: `TID_GAME_GUILDCOMBAT_JOIN_READY` "Gain entrance when one of your guild mates dies." and `..._JOIN_READY2` "Be ready!" (inc:6955/6960) (`:1601-1616`).
- A third block (guild join counts `"%.2d/%.2d"`, max 10 rows `9 < nCount`, at x 20 / mid-height, colours red/cyan/white) exists at `WndWorld.cpp:1621-1750`, but its lists `m_vecGuildCombatJoin` / `m_vGuildCombatSort` are never filled anywhere in `Source/` (only declared `Source/_Interface/WndWorld.h:397-401`): **dead, draws nothing**.
- The 1:1 HUD (`DrawGuildCombat1to1*`, `WndWorld.cpp:1199-1209`) is 1:1 only.

### 4.4 Names, visibility, targeting

- Name colour (`Source/_Common/MoverRender.cpp:1236-1245`, applied `:1405-1406`): in 202, when both you and the other player have a guild, own guild `COLOR_GUILDCOMBAT 0xff00ff00`, all others `COLOR_PLAYER 0xffffffff` (`Source/_Common/Mover.h:34`, `:40`). This beats party/PK colours. Only two colours: no per-guild colour table.
- Guild line colour (`MoverRender.cpp:1580-1596`): master's guild line `0xFFFFFF99`; else the siege colour above; and while `m_nGCState >= MAINTENANCE_STATE`, any player who is a defender key in `m_mapGC_GuildStatus` gets pink `0xFFFEA8FF` (any world).
- Hiding (`CMover::ProcessETC`, `Source/_Common/Mover.cpp:3321-3368`): if you are fighting (status 1), every player who is not fighting is hidden and not clickable; if you are waiting (0), players not on any list (spectators) are hidden. Spectators see everyone. Hidden = `GCWAR_RENDER_SKIP_MODE` (render skip, `Source/_Common/World3D.cpp:655-662`) + `GCWAR_NOT_CLICK_MODE` (pick skip, `WndWorld.cpp:6338-6347`). Their normal chat and shouts are dropped (`DPClient.cpp:1460-1465`, `:11681-11686`).
- PvP rule (shared): target only if both have `m_nGuildCombatState == 1` and different guilds (`Source/_Common/MoverAttack.cpp:1992-2011`; server also needs `WAR_WAR_STATE`, `:1995-2002`); used by `IsAttackAble` when `EVE_GUILDCOMBAT` is on (`Mover.cpp:6590-6596`).
- TAB in 202 cycles through up to `MAX_MOVERSELECT 5` living enemy-guild players within 20 m (`World3D.cpp:600-603`, `:804-835`; `Source/_Common/World.h:36`; key handler `WndWorld.cpp:7664-7691`).
- Other client rules in 202: Blinkwing refused with `TID_GAME_GUILDCOMBAT_NO_OUTWAR` (inc:6218) (`DPClient.cpp:10362-10366`); escape refused, same text (`:15641-15645`); add-friend refused `TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD` (its English text wrongly says "You can add friends...", inc:7025) (`Source/_Interface/WndFriendConFirm.cpp:185-188`); incoming friend requests ignored (`DPClient.cpp:14049-14050`); combat music off (`Source/_Common/MoverMove.cpp:43-44`); skills `SI_MAG_MAG_BLINKPOOL` / `SI_RIG_HERO_RETURN` blocked, resurrection skill only during `WAR_STATE` (`Source/_Common/MoverSkill.cpp:453-468`, `DoUseSkill`); continent = Flaris (`Source/_Common/Continent.cpp:266`). Spectators (state 0) cannot use skills/items: `TID_GAME_GUILDCOMBAT_STANDS_NOTUSESKILL/ITEM` (`MoverSkill.cpp:303-315`, `:1306-1316`, server side).

### 4.5 Death and revive

- `CDPClient::OnMoverDeath` (`DPClient.cpp:1923`): own death in 202 plays no death music (`:2003-2022`), prints `TID_GAME_DEATH` "Press ESC and go back to Lodestar..." (inc:792), then:
  - if `m_nGuildCombatState == 1` (fighter): **no revive window**, the client at once sends `PACKETTYPE_REVIVAL_TO_LODESTAR` (`:2043-2046`);
  - else the normal `CWndRevival` opens (`:2047-2057`).
- Server side (for reference): revive in 202 = full HP/MP/FP, `SNAPSHOTTYPE_REVIVAL`, then `JoinObserver`: buffs removed, teleport to the stand at (1361.6, 0, 1273.3), chat "Welcome to the Guild Siege." + "You can zoom in the camera by pressing the [Scroll Lock] key." (`DPSrvr.cpp:10275-10302`, `eveschool.cpp:699-722`). The kill goes through `CWorld::_OnDie` -> `OutWar` + `GetPoint` (`Source/_Common/World.cpp:1945-1962`), which re-sends `GC_GUILDSTATUS` and `GC_WARPLAYERLIST` (`eveschool.cpp:693-694`).
- Re-entry of the next fighter: `GC_SELECTWARPOS` window (2.4), then the server teleports to the chosen point.

### 4.6 Arena data (world files)

- `Resource/World.inc:12` `WI_WORLD_GUILDWAR "WdGuildWar"`; title "Guild Siege Territory" (`World.inc:115-118`, `world.txt.txt:10`).
- `Client/World/WdGuildWar/WdGuildWar.wld`: `size 5, 5`, indoor 0, ambient 0xff808080, bgColor 0xffe0e0ff, fly 0, camera 1310.742 119.715 1352.450, fog 70-150, bgm 0, pkmode 16. Only one landscape file exists: `WdGuildWar02-02.lnd` (x,z 1024..1536).
- `WdGuildWar.rgn` (UTF-16): attribute region 0x4010 (`RA_SAFETY|RA_DANGER`, `Resource/define.h:140`, `:150`) rect (1244,1232)-(1339,1324) = the fight area around the 4 entry points; revival region (1327,1210)-(1338,1220); two teleport triggers (1311,1348)-(1319,1356) and (1320,1196)-(1324,1200) to world 1 (Madrigal) at (6946,100,3326); a big attribute region (1188,1167)-(1400,1364) with music 21 (`BGM_IN_BOSS`, `Resource/defineSound.h:1927`) and title "Prove yourself!\nShow them that you are the best!" (`WdGuildWar.txt.txt`). Field order from `Source/_Common/WorldFile.cpp:419-460`.

---

## 5. After the siege

- Trophies by the name (`MoverRender.cpp:1598-1689`), only while `m_nState == CLOSE_STATE`, only for players with a guild:
  - `m_uBestPlayer == player` -> `m_TexGuildBest`; else `m_uWinGuildId == player's guild` -> `m_TexGuildWinner`.
  - With a logo: drawn one logo-width+2 left of the 24x24 guild logo, same y (`:1645-1655`). Without a logo: at `y = vOut.y - 30`, `x = centre - wider(text)/2 - 30`, the wider text chosen by `strlen` (`:1659-1688`).
  - Textures `Theme/Default/TexGuildCombatWinner.bmp` and `TexGuildCombatBest.bmp`, both 25x25 24-bit BMP, colour key magenta `0xffff00ff` (`WndWorld.cpp:3817-3818`).
  - Data: `GC_WINGUILD` / `GC_BESTPLAYER`, sent at login and at the end (3.2). The earlier study (section 1 of `c-world-extras.md`) has the same facts with older line numbers.
- End-of-siege events seen by the client (server-sent):
  - firework SFX `XI_NAT_ROCKET02` (`sfx_effchrrocket02`, sound `ItemChrRocBomb.wav`, `Resource/mdlDyna.inc:856`) at (1291, 85, 1279) and music `BGM_IN_FITUP` in world 202 (`eveschool.cpp:1284-1285`);
  - system + caption `TID_GAME_GUILDCOMBAT_END` "The Guild Siege has ended." (inc:6093) (`eveschool.cpp:1295-1297`). The "winning guild %s" / "MVP is %s" / "Congratulations!" announcements are compiled out on V15 (`#if __VER < 11`, `eveschool.cpp:1426-1439`);
  - `GC_WINGUILD`, `GC_BESTPLAYER`, then `GC_LOG` -> the result window (2.10) pops up for everyone in 202 (`eveschool.cpp:1442-1445`);
  - caption "End combat" and the count-down "Teleporting to Flaris" (4.1); everyone is moved to Madrigal (6968, 3328.8) (`eveschool.cpp:1640-1642`, `:2876-2878`).
- Prizes: Donaris `JACKPOT` (master) -> `GC_GETPENYAGUILD` texts; MVP `GC_GETPENYAPLAYER` texts (3.2). Board 5 says the reward is Red Chips, mailed if the bag is full.

---

## 6. Assets for the web port (all checked on disk)

| asset | path (under `Client/`) | size | used for |
|---|---|---|---|
| winner trophy | `Theme/Default/TexGuildCombatWinner.bmp` | 25x25 BMP 24-bit, 1956 B | 5 |
| MVP trophy | `Theme/Default/TexGuildCombatBest.bmp` | 25x25 BMP 24-bit, 1956 B | 5 |
| loading picture | `Theme/Default/MapLoading_GuildWar.tga` | 1024x768 TGA 24-bit | 4.1 |
| minimap mask | `World/WdGuildWar/WdGuildWar_Mask.dds` | 256x256 ARGB32 | 4.2 |
| entry buttons | `Theme/Default/ButtGW1.tga`..`ButtGW4.tga` | 160x40 (4 states of 40x40) | 2.4 |
| defender button / icon | `ButtGWDefender.tga` 288x20; `ButtDefenderIcon.tga` 64x16 (4 x 16x16) | | 2.3 |
| other buttons | `ButtApply.tga`, `ButtGWRefresh.tga`, `ButtAccept.tga`, `ButtClose.tga`, `ButtOk.tga`, `ButtYes.tga`, `ButtNo.tga`, `ButtSave.tga` (288x20 TGA); `ButtFinish.BMP`, `ButtReset.BMP`, `ButOk2.bmp` (288x20 BMP); `Buttright2.bmp`, `Buttleft2.bmp` (164x20); `ButtUp.tga`, `ButtDown.tga` (80x41) | all in `Theme/Default/` | 2.x |
| frames | `WndTile00.tga`, `WndEditTile00.tga`, `WndEditTile200.tga`, `WndMessagebox.tga` (256x144) | `Theme/Default/` | all windows |
| NPC portraits | `Char/char_GuildWar01.tga`, `02.tga` (also 03, 04) | 200x240 TGA 32-bit | 1.1 |
| guild logos | `Icon/Icon_CloakSLogo01..27.jpg` | 24x24 JPEG | 5 |
| board texts | `Client/GuildCombatTEXT_1..6_ENG.inc`, `Client/GuildCombatRedChipGuild.inc` | 486-1188 B | 2.7, 2.1 |
| world 202 | `World/WdGuildWar/` | 7 files, 2,531,011 B (2.5 MB): `.dyo` (4 B, empty), `.rgn` 1836 B, `.txt.txt` 190 B, `.wld` 258 B, `WdGuildWar02-02.dds` (256x256 minimap) 262,272 B, `WdGuildWar02-02.lnd` 2,004,179 B, `WdGuildWar_Mask.dds` 262,272 B | 4.6. The server copy is `Resource/World/WdGuildWar/` (same 7 names). Terrain textures and models referenced by the `.lnd` were not listed |
| music | `Music/BgmBaCrisis.ogg` 2,345,993 B (`BGM_BA_CRISIS`, `Music/default.bgm:20`); `Music/BgmInFitup.ogg` 132,005 B (`BGM_IN_FITUP`, `:31`); `Music/BgmInBoss.ogg` 292,760 B (region music 21, `:27`) | | 4.1, 5, 4.6 |
| SFX | `SFX/sfx_effchrrocket02.sfx` + sound `ItemChrRocBomb.wav` (wav location not checked) | | 5 |

Texts: all TIDs quoted above with their `textClient.inc` line. The resdata strings come from `Resource/resData.txt.txt`.

---

## 7. Client limits and what breaks with more than 8 guilds

Fixed numbers in the client:

| limit | where | effect |
|---|---|---|
| own place red when `8 < rank` | `WndField.cpp:16573` | status window marks 9th+ as "not accepted". Hard-coded 8, not from the server |
| "Top 8" texts | status tooltips (`resdata.inc:11997`, `:12024`), boards TEXT_1/4/6 | static wording |
| HUD player board: top 10 rows | `WndWorld.cpp:1344` | rest hidden (own row added) |
| ranking window: 100 rows per tab, 11 per page | `WndField.h:1766-1767`, `:1781`; `WndField.cpp:18169-18175` | rows over 100 dropped (also in the total tab). 8 guilds x 10 entrants = 80 fits; 11+ guilds with 10 entrants can overflow, and if the server list is cumulative it may overflow sooner (**server content of `m_vecGCPlayerPoint` not checked here**) |
| 4 entry points | buttons `WndField.cpp:16648-16677`, `:16726-16745`; mask image; server `eveschool.cpp:575-583` | not tied to guild count; more guilds share the same 4 points |
| TAB targets 5 | `World.h:36` | - |
| join-count box 10 | `WndWorld.cpp:1633` | dead code |
| string buffers | guild name 128, dialog text 512, attacker/defender names 64 (`DPClient.cpp:6874`, `:7027`, `:7190`, `:7204`, `:7516`) | longer strings blank the rest of the packet (`ar.cpp:106-111`) |
| line-up list | defender icon at `i*17 + 75`, bands to y 377 (`WndField.cpp:16071`, `:16076-16086`) | assumes all entrants fit without scrolling (~18 rows); fine for 10 |

No client array is sized by the number of guilds: the guild board, player board, status list, `m_mapGC_GuildStatus` and the precedence maps are STL containers (`WndWorld.h:309-312`). Colours are "own guild vs. everyone else", so no colour table runs out.

What would go wrong with more than 8 guilds:
- The status window paints the 9th+ applicant red as if refused (hard 8).
- Screen space: the guild board starts at y 200 and grows 16 px per guild; the player board starts 50 px below it. With 8 guilds the player board (10 rows + own row) already ends at about y 600 (200 + 24 + 8x16 + 50 + 24 + 10x16 + 16). At 800x600 this is at the bottom edge; each extra guild pushes it 16 px further down (12 guilds about y 666, 16 guilds about y 730). The web phone layout must plan for this.
- `m_mapGC_GuildStatus` is keyed by the defender id (`WndWorld.cpp:3846-3866`): two guilds without a defender (id 0) merge into one key. Not tied to 8, but more guilds make it likelier.
- Ranking overflow at 100 (above).
- Static board texts and tooltips say 8 / 5 / 3 lives.
- Server side (for the other report): `GC_WARPLAYERLIST` writes a count then may skip a guild that has no member record (`eveschool.cpp:3571-3621`), which would desync the client parser.

Not confirmed / not checked:
- NPC world positions (x4 scaling of `.dyo` floats is inferred).
- The M-key world map for world 202 (no siege-specific code found by grep; not opened).
- Location of `ItemChrRocBomb.wav`; terrain textures and models referenced by `WdGuildWar02-02.lnd`.
- Whether `m_vecGCPlayerPoint` (ranking window) holds only the last siege or all sieges (server data).
