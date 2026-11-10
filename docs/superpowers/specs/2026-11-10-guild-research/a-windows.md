# A — FlyFF V15 guild windows (Neuz client) — research notes

Scope: the guild windows of the V15 Neuz client, for a faithful TypeScript port. Research only, no source changed.
Paths below are relative to `Source/` (Neuz code) or `Resource/` (resdata.inc, ResData.h, text tables). Line numbers are
the original CP949 file line numbers (iconv keeps them). Text: TID -> English is from `Resource/textClient.inc` (colour +
IDS key) and `textClient.txt.txt` (UTF-16LE); resdata control/window strings are `IDS_RESDATA_INC_*` from `Resource/resData.txt.txt`.

Status: complete (sections 0-7 + Appendix A).

---------------------------------------------------------------------------------------------------------------------------

## 0. Build flags that matter (Neuz/VersionCommon.h)

| define | active on __MAINSERVER V15? | evidence |
|---|---|---|
| `__MAINSERVER`, `__VER 15` | yes | VersionCommon.h:3-4 |
| `__INTERNALSERVER` | **no** (only defined when neither TEST nor MAIN) | VersionCommon.h:6-8 |
| `__GUILDVOTE` (guild vote window + Start-menu entry + applet) | **NO**. Defined only in the `__INTERNALSERVER` block (VersionCommon.h:269) and the `__TESTSERVER` block (:412). The `__MAINSERVER` block (:471-480) does not define it. | so `CWndGuildVote` is compiled (Neuz vcxproj line 621) but never reachable: FuncApplet.cpp:142-143/247-249 and WndTaskBar.cpp:2673-2675 are `#ifdef __GUILDVOTE` |
| `__GUILD_HOUSE` (5th tab "Permissions", `CWndGuildTabPower`) | yes, defined unconditionally at VersionCommon.h:205; the guild code tests `__VER >= 15` anyway (WndGuild.h:9,25) | |
| `__GUILD_HOUSE_MIDDLE` | no (internal/test only, :398/:462) | |
| `__CSC_VER12_2` (sortable member tab `APP_GUILD_TABMEMBER_EX`) | the #define itself is commented (:116) but every use is `#if __VER >= 12 // __CSC_VER12_2`, so **active** | WndGuild.cpp:58-62, WndGuildTabMember.cpp:28 etc. |
| `__CSC_VER11_4` (new messenger, icon_PlayerData icons in member tab) | active through `__VER >= 11` | WndGuildTabMember.cpp:239,270 |
| `__SYS_PLAYER_DATA` (job/level/sex/online come from `CPlayerDataCenter`, not `CGuildMember`) | active through `__VER >= 11` | WndGuildTabMember.cpp:850-861 |
| `__GUILD_COMBAT_1TO1` checks | active through `__VER >= 11` (the #define at :70 is commented, code uses `__VER`) | WndGuildTabMember.cpp:650 |
| `__S_SERVER_UNIFY` | yes (:26) — guild window self-destroys while `g_WndMng.m_bAllAction == FALSE` (forced rename state) | WndGuild.cpp:96-102 |
| `__RULE_0615` (name rules, `IsAllowedLetter`) | yes (:48) | WndGuildName.cpp:141, 241-254 |
| `__RULE_0516` (guild name 6..24) | **no** (not defined anywhere) -> guild name length rule is 3..32 bytes | WndGuildName.cpp:96-100 |
| `__BB_*` | custom. None in the guild client files (grep of WndGuild*.cpp, WndRankGuild.cpp, guild.cpp/.h); the server invite path has `__BB_STAFF_MODERATOR_AUTH` (WORLDSERVER/DPSrvr.cpp:7831-7837). Leave out. | |

---------------------------------------------------------------------------------------------------------------------------

## 1. Window inventory

### 1a. Core guild windows (detailed below)

| class | APP id (ResData.h line = value) | resdata.inc block | size | frame tga | file |
|---|---|---|---|---|---|
| `CWndGuild` (tabbed main) | `APP_GUILD` ResData.h:228 = 323 | 5243-5263 | 448x368 | WndTile07.tga (tiled) | _Interface/WndGuild.cpp |
| `CWndGuildTabInfo` (tab 0 "Information") | `APP_GUILD_TABINFO` :230 = 325 | 5060-5242 | 404x300 | none (child) | WndGuildTabInfo.cpp |
| `CWndGuildTabMember` (tab 1 "Member") | `APP_GUILD_TABMEMBER_EX` :603 = 698 (V15). Old `APP_GUILD_TABMEMBER` :232 = 327 is the `__VER < 12` path | 14892-14948 (EX) | 404x300 | none | WndGuildTabMember.cpp |
| `CWndGuildTabApp` (tab 2 "Title" = rights + pay) | `APP_GUILD_TABAPPELLATION` :234 = 329 | 5531-6064 | 404x304 | none | WndGuildTabApp.cpp |
| `CWndGuildTabWar` (tab 3 "Guild Duel") | `APP_GUILD_TABGUILDWAR` :248 = 343 | 7355-7501 | 404x300 | none | WndGuildTabWar.cpp |
| `CWndGuildTabPower` (tab 4 "Permissions" = guild-house rights) | `APP_GUILD_TAPPOWER` :769 = 864 | 4463-4627 | 404x304 | none | WndGuildTabPower.cpp |
| `CWndGuildConfirm` (invite received) | `APP_GUILD_INVATE` :252 = 347 | 6944-7000 | 240x144 | WndTile08.tga | WndGuild.cpp:182-252 |
| `CWndGuildName` (set / change guild name) | `APP_GUILDNAME` :250 = 345 | 7502-7549 | 272x128 | WndTile06.tga | WndGuildName.cpp:10-166 |
| `CWndGuildNickName` (member nickname / "title") | `APP_GUILD_NICKNAME` :254 = 349 | 7550-7597 | 272x128 | WndTile08.tga | WndGuildName.cpp:169-334 |
| `CWndGuildNotice` (edit notice) | `APP_GUILD_NOTICE` :218 = 313 | 3254-3301 | 320x240 | WndTile07.tga | WndGuildTabInfo.cpp:92-188 |
| `CWndGuildSetLogo` (logo picker) | `APP_GUILD_SETLOGO` :220 = 315 | 3302-3349 | 208x240 | WndTile07.tga | WndGuildTabInfo.cpp:191-370 |
| `CWndGuildDisMiss` (disband confirm) | `APP_GUILD_DISMISS` :237 = 332 | 6065-6112 | 288x128 | WndTile08.tga | WndGuildTabInfo.cpp:21-88 |
| `CWndGuildPayConfirm` (set salary of a rank) | `APP_GUILD_PAYCONFIRM` :243 = 338 | 7001-7057 | 288x144 | WndTile08.tga | WndGuildTabApp.cpp:465-566 |
| `CWndGuildMerit` (contribute penya / quest items) | `APP_GUILD_MERIT1` :484 = 579 (old `APP_GUILD_MERIT` :244 = 339 is unused) | 3038-3112 | 272x224 | WndTile00.tga | WndGuildMerit.cpp |
| `CWndRankGuild` (+3 tabs) | `APP_RANK_GUILD` :283 = 378; tabs `APP_RANK_GUILDTABBEST` :262 = 357, `APP_RANK_GUILDTABUNITED` :264 = 359, `APP_RANK_GUILDTABPENYA` :266 = 361 | 10244-10264; 8540-8605; 8606-8671; 8672-8710 | 464x384; tabs 452x338 | WndTile07.tga | WndRankGuild.cpp |
| `CWndGuildVote` / `CWndGuildVoteSeting` | `APP_GUILD_VOTE` :226 = 321 / `APP_GUILD_VOTESETING` :246 = 341 | 5321-5530, 7226-7354 | 352x368 / 352x352 | WndTile07.tga | WndGuildVote.cpp — **not reachable on __MAINSERVER** (section 0) |
| `CWndGuildCtrlEx` (guild tab of the messenger) | child ctrl of `APP_MESSENGER_` | — | — | — | WndMessengerCtrl.cpp:1056-1640 (see 2.12) |
| `CWndGuildCtrl` | legacy pre-v11 messenger guild list, used only by `CWndMessenger` (WndMessenger.h:20); V15 uses `CWndMessengerEx` + `CWndGuildCtrlEx` (WndMessenger.h:40-49) | — | — | — | WndGuildCtrl.cpp — do not port |

There is **no leave-guild confirm window and no kick confirm window** in V15: "Leave Guild" in the member right-click menu sends the
packet directly (WndGuildTabMember.cpp:634-660). `APP_GUILD_LEAVE` (ResData.h:256, resdata.inc:6896-6943, 288x128, text "Do you want
to leave Guild?") exists in resdata but no class uses it (grep of Source finds no reference). Same for `APP_GUILD_MAINWND` (:216),
`APP_GUILD_MEMBER` (:222), `APP_GUILD_APPELLATION` (:224), `APP_GUILD_TABVOTE` (:233), `APP_GUILD_DISMISSINFO` (:239), `APP_GUILD_MERIT` (:244).

### 1b. Other guild windows — list only

| class | APP id | what |
|---|---|---|
| `CWndGuildWarDecl` | `APP_GUILD_WAR` (ResData.h:285=380), resdata.inc:10265, 288x144 | declare guild duel: enemy guild name edit (+ penya edit), OK -> `SendDeclWar(idMaster, szGuild)` (WndGuildWarDecl.cpp:89; DPClientGuildWar.cpp:29) |
| `CWndGuildWarPeace` | `APP_GUILD_WARPEACE` (:291=386), 10886, 288x128 | ask truce, Yes -> `SendQueryTruce` (WndGuildWarPeace.cpp:73; DPClientGuildWar.cpp:94) |
| `CWndGuildWarPeaceConfirm` | `APP_GUILD_WARPEACECONFIRM` (:293=388), 10838 | truce request received, Yes -> `SendAcptTruce` (…PeaceConfirm.cpp:76; DPClientGuildWar.cpp:101) |
| `CWndGuildWarGiveUp` | `APP_GUILD_WARGIVEUP` (:289=384), 10925 | surrender, Yes -> `SendSurrender` (…GiveUp.cpp:75; DPClientGuildWar.cpp:44) |
| `CWndGuildWarRequest` | `APP_GUILD_WARREQUEST` (:295=390), 10799 | war declared on us (TID_GAME_GUILDWARREQUEST "The Guild Leader of %s, %s , declares a Guild duel. Do you Accept?"), Yes -> `SendAcptWar` (…Request.cpp:38,86; DPClientGuildWar.cpp:37) |
| `CWndGuildBank`, `CWndGuildBankLog` | `APP_GUILD_BANK` (:241=336, WndGuildBank.tga 236x348), `APP_GUILD_BANK_LOG` (:587=682) | guild warehouse (NPC menu MMI_GUILDBANKING -> `SendOpenGuildBankWnd`, WndWorld.cpp:5537-5612); its Button1 opens `CWndGuildMerit`, Button2 makes a cloak (see 2.10) |
| `CWndGuildCombatOffer/Board/Selection/State/JoinSelection/Ranking/Result…`, `CWndGuildWarAppConfirm/CancelConfirm/JoinConfirm/State` | `APP_GUILDCOMBAT_*`, `APP_GUILD_WAR_STATE` (:424=519) | Guild Siege (WndField.h:1341-1801), opened from NPC menus MMI_GUILDWAR_* / MMI_GUILDCOMBAT_* (WndWorld.cpp:3936-4295) |
| `CWndGuildCombat1to1Selection/Offer/OfferMessageBox` | `APP_GUILDCOMBAT_1TO1_*` (:577-581) | 1v1 guild siege (WndGuildCombat1to1.h) |
| `CWndGHMainMenu`, `CWndGHTeleporter`, `CWndGHUpkeep` | `APP_GH_MAIN` (:754=849), `APP_GH_TELEPORTER` (:756) | guild house menu; its "Permissions" button opens APP_GUILD on tab 4 (WndGuildHouse.cpp:63-76) |
| `CWndGuildHousing`, `CWndGHouseShowOneUnit`, `CWndGuildHouseBid` | `APP_GH_FURNITURE_STORAGE` (:758), `APP_GH_SHOWONE` (:777) | guild-house furniture / bidding (WndHousing.h:68-164); applet key 'R' (FuncApplet.cpp:201) |
| `CWndRankWar`, `CWndRankInfo` | `APP_RANK_WAR` (:269=364), `APP_RANK_INFO` (:277=372) | other ranking windows from the same NPC (MMI_RANK_WAR / MMI_RANK_INFO, WndWorld.cpp:5623-5638) |

---------------------------------------------------------------------------------------------------------------------------

## 2. Core windows in detail

Conventions used by every guild window (so the port can share code):
* Messages "box" = `g_WndMng.OpenMessageBox( text, MB_OK, parent )` — a modal OK box; no colour (the TID colour is ignored).
  Messages "chat" = `g_WndMng.PutString( text, NULL, prj.GetTextColor(TID) )` — system chat line in the TID colour.
* Start position: almost every guild popup does `Move( rectRoot.right - width, 110 )` and then `MoveParentCenter()`;
  `MoveParentCenter` centres on **the root (screen) rect**, not on the parent (WndBase.cpp:1805-1816), so the net effect is
  "centred on screen". Exception: `CWndGuildConfirm` (invite) is centred horizontally at **y = 70** (WndGuild.cpp:203-206).
* Child popups opened from a tab are created with `WBS_MOVE | WBS_SOUND | WBS_CAPTION | WBS_MODAL` (modal) and are owned
  by the tab (`SAFE_DELETE` + `new` each time), e.g. WndGuildTabInfo.cpp:51,140,303; WndGuildTabApp.cpp:496.
* resdata rects are client-area coordinates (l,t,r,b), parsed by _Common/ResManager.cpp:126-145 (texture, bTile, l,t,r,b,
  style, visible, group, disabled, tabstop, title, tooltip). Full control tables for every window are in **Appendix A**.

### 2.1 CWndGuild — APP_GUILD (main tabbed window)

* resdata.inc:5243-5263, ResData.h:228 (323). Frame `WndTile07.tga` tiled, **448 x 368**, title "Guild Window"
  (IDS_RESDATA_INC_000576). One control: `WIDC_TABCTRL1` TABCTRL rect 18,6,434,330.
* Opened with `InitDialog( APP_GUILD, CPoint(0,0) )` (WndGuild.cpp:122); refuses to open when `g_eLocal.GetState(EVE_SCHOOL)`
  (school event; :117-118). It opens **even when the player has no guild** — every tab then shows blanks (each tab's
  `UpdateData` has a "no guild" branch). No "you have no guild" message exists.
* `OnInitialUpdate` (WndGuild.cpp:42-113): creates the 5 tab pages as children of the tab control with `rect = GetClientRect()`
  but `left = 5, top = 0` (:51-53), then inserts tabs in this order:

| index | label (TID -> English) | page | APP id |
|---|---|---|---|
| 0 | TID_GAME_TOOLTIP_GUILDINFO "Information" (textClient.inc:3482) | CWndGuildTabInfo | APP_GUILD_TABINFO (:56) |
| 1 | TID_GAME_TOOLTIP_GUILDMEMBER "Member" (:3487) | CWndGuildTabMember | APP_GUILD_TABMEMBER_EX (:59) |
| 2 | TID_GAME_TOOLTIP_APPELLATION "Title" (:3492) | CWndGuildTabApp | APP_GUILD_TABAPPELLATION (:57) |
| 3 | TID_GAME_TOOLTIP_GUILDWAR "Guild Duel" (:3772) | CWndGuildTabWar | APP_GUILD_TABGUILDWAR (:63) |
| 4 | TID_GAME_TOOLTIP_AGIT "Permissions" (:14555, colour 0xff000000) | CWndGuildTabPower | APP_GUILD_TAPPOWER (:66) |

  (WndGuild.cpp:69-93.) Then: if `m_bAllAction == FALSE` (server-unify forced rename) the window destroys itself (:96-102);
  `MoveParentCenter()` (:105) — opens centred on screen; stores its rect in `m_WndGuildTabMember.m_rectParent` (:107-110).
* `SetCurTab(index)` (:164-170) — used only by the guild-house menu to open straight on tab 4 (WndGuildHouse.cpp:63-76; the
  "Permissions" button toggles: closes APP_GUILD if open, else `CreateApplet(APP_GUILD)` + `SetCurTab(4)`).
* `UpdateDataAll()` (:30-40) refreshes all 5 tabs but **nobody calls it** (grep). Refreshes come from DPClient handlers that
  call individual tabs (section 3).
* No buttons/handlers of its own (OnChildNotify/OnCommand pass through, :137-154).

### 2.2 CWndGuildTabInfo — APP_GUILD_TABINFO (tab "Information")

* resdata.inc:5060-5242, ResData.h:230 (325), no frame, 404x300.
* Layout (Appendix A): labels Name(6,6) / Master(6,24) / Exp(6,42) / Penya(6,60) on the left, Level(236,6) / Member(236,24) /
  Logo(236,42) on the right; value statics WIDC_GUILDNAME 66,6,166,26; WIDC_GUILDMASTER 66,24; WIDC_GUILDEXPMERIT 66,42;
  WIDC_GUILDPENYAMERIT 66,60; WIDC_GUILDLEVEL 304,6,359,22; WIDC_GUILDNUMBER 304,24,359,40; logo box WIDC_CUSTOM1 308,46,332,70
  (24x24); notice text WIDC_TEXT1 TEXT 6,84,378,254 on `WndEditTile00.tga` tiled; 4 buttons at y 262-282:
  WIDC_BUTTON4 12-84 `ButtName.BMP` "Setup Guild Name" (tooltip "This establishes your guild's name. It can be done only once."),
  WIDC_BUTTON1 106-178 `ButtNotice.BMP` "Setup Notice", WIDC_BUTTON2 200-272 `ButtSetlogo.BMP` "Setup Logo",
  WIDC_BUTTON3 294-366 `ButtDismiss.BMP` "Disband Guild".
* `UpdateData()` (WndGuildTabInfo.cpp:422-489), data from `CGuild` (_Common/guild.h:264-376):

| control | value | line |
|---|---|---|
| WIDC_GUILDNAME | `m_szGuild` (empty right after creation) | :430-431 |
| WIDC_GUILDLEVEL | `"%d"`, `m_nLevel` | :432-434 |
| WIDC_GUILDMASTER | `CPlayerDataCenter::GetPlayerString( m_idMaster )` | :435-443 |
| WIDC_GUILDNUMBER | `"%d / %d"`, `GetSize()` (members in `m_mapPMember`) / `CGuildTable::GetMaxMemeber( m_nLevel )` (guild table) | :451-455 |
| WIDC_GUILDEXPMERIT | `"%u"`, `m_dwContributionPxp` | :456-458 |
| WIDC_GUILDPENYAMERIT | `"%u"`, `m_nGoldGuild` (guild bank / contributed penya) | :459-461 |
| WIDC_TEXT1 | `m_szNotice` (max 128 bytes, guild.h:25) | :463-465 |
| no guild | all of the above set to "" | :467-488 |

* `OnDraw` (:396-420): if `m_dwLogo != 0`, draws `CWndWorld::m_pTextureLogo[m_dwLogo-1]` (24x24 jpg, see 5) at the top-left of
  WIDC_CUSTOM1, opaque (SRCBLEND ONE / DESTBLEND ZERO).
* Buttons — `OnChildNotify` (:525-618) returns FALSE (silently ignores the click, **no message**) unless I am in a guild **and
  I am the master** (`IsMaster`, :527-533). So for non-masters all four buttons do nothing.

| button | client checks (in order) | message (TID / English / where) | result |
|---|---|---|---|
| WIDC_BUTTON4 Setup Guild Name | name must be empty (`strlen(m_szGuild)==0`) | else box TID_GAME_GUILDNOTCHGNAME "The guild name can only be changed once." (:550) | opens (or reuses) `CWndGuildName` via `g_WndMng.GetWndBase(APP_GUILDNAME)`, `Initialize(&g_WndMng)`, `SetData()` -> `m_nId = 0xff` (:539-548) |
| WIDC_BUTTON1 Setup Notice | — | — | `new CWndGuildNotice`, `Initialize(this)` (:554-560) |
| WIDC_BUTTON2 Setup Logo | 1. `g_pPlayer->m_idWar` (in a guild duel) 2. logo already set (`m_dwLogo`) 3. `m_nLevel < 2` | box TID_GAME_GUILDWARERRORLOGO "You cannot change your guild logo during a guild duel." (:566); TID_GAME_GUILDSTILLLOGO "Guild logo has already been set." (:571); TID_GAME_GUILDNOTLEVEL "Guild level is too low." (:576) | `new CWndGuildSetLogo` (:580-582). A logo can be set **once** (also `CGuild::SetLogo`, guild.cpp:516-523) |
| WIDC_BUTTON3 Disband Guild | 1. guild bank window open (`g_WndMng.m_pWndGuildBank`) -> silently nothing (:587-590) 2. `m_idWar` 3. guild quest QUEST_WARMON_LV1 ("clockwork") in state QS_BEGIN | box TID_GAME_GUILDWARERRORDISBAND "You cannot disband your guild during a guild duel." (:594); box TID_GUILD_QUEST_LEAVEERROR "You can neither disband the guild nor leave it from it here." (:603) | `new CWndGuildDisMiss` (:609-611) |

### 2.3 CWndGuildTabMember — APP_GUILD_TABMEMBER_EX (tab "Member")

* resdata.inc:14892-14948, ResData.h:603 (698), no frame, 404x300. Only 5 header buttons (all `0x220010`, no text — the text
  is in the bitmap): WIDC_MLEVEL 8,4,55,24 `ButtGuildMemberTabMLevel.bmp`; WIDC_JOB 66,4,113,24 `ButtGuildMemberTabJob.bmp`;
  WIDC_LEVEL 124,4,164,24 `ButtGuildMemberTabLevel.bmp`; WIDC_NAME 174,4,259,24 `ButtGuildMemberTabChar.bmp`;
  WIDC_ALIAS 270,4,355,24 `ButtGuildMemberTabAlias.bmp`. `OnInitialUpdate` re-applies the same bitmaps from `DIR_THEME`
  with colour key 0xffff00ff for every language (both branches identical, WndGuildTabMember.cpp:471-527).
* The list itself is **owner-drawn** in `OnDraw`, no list control. Scroll bar: a `CWndScrollBar` id 1000 created in
  `OnInitialUpdate` (:457-469) and positioned in `OnSize` at x = width-40 .. width-25, y = 40 .. height-10 (:666-681);
  range = member count, page = 14.
* Data — `UpdateData()` (:837-892) copies every `CGuild::m_mapPMember` entry (std::map keyed by idPlayer, so **ascending
  idPlayer order**) into `m_aList[128]` (`MEMBERLIST`, WndGuildTabMember.h:4-19):

| MEMBERLIST field | source | line |
|---|---|---|
| idPlayer, nMemberLv (rank 0..4), nClass (0..2), szAlias | `CGuildMember` m_idPlayer, m_nMemberLv, m_nClass, m_szAlias | :848-849, 878-879 |
| nJob, nSex, nLevel, bIsOnLine (`uLogin > 0`), szName | `CPlayerDataCenter::GetPlayerData(idPlayer)` (`data.nJob/nSex/nLevel/uLogin`, `szPlayer`) | :851-855, 869-870 |
| nGiveGold, dwGivePxpCount, nWin, nLose | `CGuildMember` m_nGiveGold, m_dwGivePxpCount, m_nWin, m_nLose | :863-866 |

  Rank constants: GUD_MASTER 0, GUD_KINGPIN 1, GUD_CAPTAIN 2, GUD_SUPPORTER 3, GUD_ROOKIE 4 (Resource/defineJob.h:146-150).
* Row drawing (`OnDraw`, :218-449). 14 rows visible (`MAX_MEMBER_LIST_DRAW`, :25), row height 18 (:26), first row at
  sx = 8, sy = 32. Icons come from `CWndWorld::m_texPlayerDataIcon` = `icon\icon_PlayerData.inc` (frame list in 5.2).

| column | x (client) | what | line |
|---|---|---|---|
| rank icons | `nposx = 22` (sx+14), minus 5 if nClass==1, minus 10 if nClass==2; y = sy-4 | Master: one icon, frame **44**. Kingpin/Captain/Supporter/Rookie: **nClass+1** copies (1..3) of frame 45/46/47/48, spaced 10 px (`nposx + j*10`). Tint always white. | :266-337 |
| job-type icon | sx+64 = 72, y = sy-3 | only for Master jobs (frame 27..32 by level: <70 ->27, 70-79 28, 80-89 29, 90-99 30, 100-109 31, 110-120 32) and Hero (frame 33) | :349-371 |
| job icon | sx+84 = 92, y = sy-3 | 1st jobs: 14+nJob; 2nd (JTYPE_PRO): 19+nJob-6; Master: 19+nJob-16; Hero: 19+nJob-24 | :347-373 |
| level | sx+126 = 134, y = sy | `TextOut(nLevel)` | :403 |
| name | sx+168 = 176 | `szName`, if longer than 10 bytes cut to 10 bytes (DBCS-aware) + "..." | :411-431 |
| alias | sx+264 = 272 | `szAlias` (the guild nickname/"title") | :432 |

  Colours: text = **0xff0000ff (blue) for the selected row**, else 0xff000000 (black) online / **0xff909090 (grey) offline**
  (:254-264). Icon tint for job/job-type icons: 0xffffffff online / **0xffff6464 (red-tinted) offline** (:339-344).
  Online = `PlayerData.data.uLogin > 0`.
* Sorting (`__CSC_VER12_2`, comparators :32-193, toggles :894-981). Header click -> `OnChildNotify` WIDC_MLEVEL/JOB/LEVEL/NAME/
  ALIAS -> `SortbyXxx()` (:728-746). Each column has its own boolean that flips on each click. **The comparator names are
  inverted**: "Asce" functions sort descending.

| column | initial flag (ctor :204-210) | click with flag TRUE | click with flag FALSE |
|---|---|---|---|
| MLevel (rank) | FALSE, and `OnInitialUpdate` already calls `SortbyMemberLevel()` once (:531-533) -> default order is rank ascending (Master first), ties by nClass **descending**; flag is then TRUE | `prMemberLevelAsce`: rank descending (Rookie first), ties nClass ascending | `prMemberLevelDesc`: Master first, ties nClass desc |
| Job | TRUE | `prJobAsce`: jobType (`prj.m_aJob[nJob].dwJobType`) desc, then nJob desc | ascending |
| Level | TRUE | `prLevelAsce`: **jobType desc first**, then nLevel desc (so heroes > masters > 2nd jobs, level only breaks ties) | ascending |
| Name | TRUE | `prNameAsce`: CString compare, Z..A (case-sensitive byte order) | A..Z |
| Alias | TRUE | `prAliasAsce`: Z..A | A..Z |

  JTYPE values: BASE 0, EXPERT 1, PRO 2, TROUPE 3, COMMON 4, MASTER 5, HERO 6 (Resource/defineJob.h:4-10). Sorting uses
  `std::sort` (not stable) and only runs when there are more than 1 members.
  **Quirk:** `UpdateData()` does not re-sort; every refresh packet (section 3) rebuilds `m_aList` in map (idPlayer) order, so the
  sort is lost until the next header click. `m_nSelect` is an index, so a re-sort/refresh moves the selection to another member.
* Mouse: L-click / R-button-down select row `m_nSelect = m_nCurrentList + (y-32)/18`, clamped (:685-699). Wheel scrolls 3 rows
  (:812-834). Dragging with the left button scrolls by (dy/5) rows (:751-771).
* Hover tooltip (`OnMouseWndSurface`, :772-810): over a row (hit rects x 4..width, y 30+18i .. 45+18i) shows
  `"%s\n%s %u\n%s %d\n%s %d"` = name / TID_GAME_TOOLTIP_EXPMERIT "Contribution:" dwGivePxpCount / TID_GAME_TOOLTIP_PENYAMERIT
  "Penya Contribution:" nGiveGold / TID_GAME_TOOLTIP_GIVEUPNUM "Number of times surrendered" **nLose** (label says surrender,
  value is m_nLose).
* Right-click menu (`OnRButtonUp`, :701-722), a `CWndMenu` shown at `m_rectCurrentWindow.TopLeft() + point`:

| order | id (Resource/defineNeuz.h:309-315) | label |
|---|---|---|
| 1 | MGI_APPELL_UP 0 | TID_GAME_GUILD_APPELLATIONUP "Promote Member" |
| 2 | MGI_APPELL_DOWN 1 | TID_GAME_GUILD_APPELLATIONDOWN "Demote Member" |
| 3 | MGI_CLASS_UP 2 | TID_GAME_GUILD_CLASSUP "Class Up" |
| 4 | MGI_CLASS_DOWN 3 | TID_GAME_GUILD_CLASSDOWN "Class Down" |
| 5 | MGI_NICKNAME 5 | TID_GAME_GUILD_NICKNAME "Create Nickname" |
| 6 | MGI_GUILD_LEAVE 4 | TID_GAME_GUILD_LEAVE "Leave Guild" |
| 7 (only if I am master) | MGI_CHG_MASTER 6 | TID_GAME_CHG_MASTER "Change of Guild Leader." |

  All items are shown to every member; rights are checked by the server. Menu handling (`OnCommand`, :552-665): first ignores
  the scrollbar (id 1000, message 514); then returns FALSE if no guild or `m_nSelect` out of range; then **if I am in a guild
  duel (`g_pPlayer->m_idWar`) every item is refused** with box TID_GAME_GUILDWARERRORMEMBER "Unable to use the member
  management function during a guild duel." (:571-575).

| item | client checks / message | sender (DPClient.cpp line) and payload |
|---|---|---|
| Promote | none (no range check) | `SendGuildMemberLv( myId, target, nMemberLv - 1 )` (:581-584) -> DPClient.cpp:13151, PACKETTYPE_GUILD_MEMBER_LEVEL `<< idMaster << idPlayer << int` |
| Demote | none | `SendGuildMemberLv( myId, target, nMemberLv + 1 )` (:585-588) |
| Class Up / Down | sender skips if target == me (DPClient.cpp:13160) | `SendGuildClass( myId, target, 1 / 0 )` (:590-597) -> DPClient.cpp:13158, PACKETTYPE_GUILD_CLASS `<< BYTE flag << idMaster << idPlayer` |
| Create Nickname | I must be master, else box TID_GAME_GUILDONLYMASTER "Can only be used by the Guild Leader" (:628); guild level >= 10, else box TID_GAME_GUILDNOTLEVEL "Guild level is too low." (:614-617) | opens `CWndGuildNickName` (`g_WndMng.m_pWndGuildNickName`, `m_idPlayer = target`, `Initialize(&g_WndMng, APP_GUILD_NICKNAME)`) (:618-624) |
| Leave Guild (also = kick when the selected row is someone else) | guild quest QUEST_WARMON_LV1 in QS_BEGIN -> box TID_GUILD_QUEST_LEAVEERROR (:636-644); guild siege applied and running (`m_bRequest && m_nState != CLOSE_STATE && m_nGCState != WAR_CLOSE_STATE`) -> box TID_GAME_GUILDCOMBAT_NOT_LEAVE_GUILD "You can not quit from a guild while in Guild Siege." (:647-649); 1v1 siege not closed -> box TID_GAME_GUILDCOMBAT1TO1_NOTLEAVEGUILD "Guild Members cannot leave the Guild until the 1vs1 Guild Siege is over." (:651-652) | **no confirm window**: `SendRemoveGuildMember( myId, target )` (:656) -> DPClient.cpp:12509, PACKETTYPE_REMOVE_GUILD_MEMBER `<< idMaster << idPlayer` |
| Change of Guild Leader | target != me; target online, else box TID_GAME_NOTLOGIN "That player is not connected." (:600-606) | `SendChgMaster( myId, target )` -> DPClient.cpp:13246, PACKETTYPE_CHG_MASTER `<< idPlayer << idPlayer2` |

  Any header click also hides the popup menu (`m_wndMenu.SetVisible(FALSE)`, :726).

### 2.4 CWndGuildTabApp — APP_GUILD_TABAPPELLATION (tab "Title": rights + salary per rank)

* resdata.inc:5531-6064, ResData.h:234 (329), no frame, 404x304. It is a 5-column x 7-row grid:

| row (label static, x 0..58) | y | Master col (x 58/72) | Kingpin (124/138) | Captain (190/204) | Supporter (256/270) | Rookie (322/336) |
|---|---|---|---|---|---|---|
| header icons (WIDC_CUSTOM1..5, 16x16) | 30 | CUSTOM1 70,30 | CUSTOM2 136,30 | CUSTOM3 202,30 | CUSTOM4 268,30 | CUSTOM5 334,30 |
| header text (STATIC8/9/12/10/11) | 8 | "Master" | "Kingpin" | "Captain" | "Supporter" | "Rookie" |
| STATIC1 "Member" -> count `%.2d/%.2d` | 48 | WIDC_GUILD_NUM_MASTER | _KINGPIN | _CAPTAIN | _SUPPORTER | _ROOKIE |
| STATIC2 "Title" -> PF_MEMBERLEVEL (promote/demote) | 72 | CHECK1 | CHECK2 | CHECK3 | CHECK4 | CHECK5 |
| STATIC3 "Rank" -> PF_LEVEL (class up/down) | 98 | CHECK6 | CHECK7 | CHECK8 | CHECK9 | CHECK10 |
| STATIC4 "Join" -> PF_INVITATION (invite) | 124 | CHECK11 | CHECK12 | CHECK13 | CHECK14 | CHECK15 |
| STATIC5 "Penya" -> PF_PENYA (take penya from guild bank) | 150 | CHECK16 | CHECK17 | CHECK18 | CHECK19 | CHECK20 |
| STATIC6 "Item" -> PF_ITEM (take items from guild bank) | 176 | CHECK21 | CHECK22 | CHECK23 | CHECK24 | CHECK25 |
| STATIC7 "Pay" -> salary `%d` | 202 | WIDC_GUILD_PAY_MASTER | _KINGPIN | _CAPTAIN | _SUPPORTER | _ROOKIE |
| salary "Setup" buttons (`ButtPay.BMP`, 45x20) | 224 | BUTTON1 | BUTTON2 | BUTTON3 | BUTTON4 | BUTTON5 |

  Checkboxes are `ButtCheck.bmp` style 0x220018 (16x16 / 18x16). Bottom centre: WIDC_OK 162,256,234,276 `ButtOk.tga`
  "Apply Settings". Pay-button tooltips: "Set Master pay.(It will be paid at 00:00 automatically)" etc. (resdata.inc:5694-5730).
  Rights bits: PF_MEMBERLEVEL 0x01, PF_LEVEL 0x02, PF_INVITATION 0x04, PF_PENYA 0x08, PF_ITEM 0x10 (guild.h:38-42), plus the
  guild-house bits 0x20/0x40 shown on tab 4. Mapping of checkbox -> bit is WndGuildTabApp.cpp:132-238 (toggle) and :300-463 (load).
* Header icons: `OnDraw` (:30-53) draws `CWndWorld::m_texMsgIcon` (= `icon\icon_IconMessenger.inc`) frames **49, 50, 51, 52, 53**
  (`43 + k + 6`) at the top-left of CUSTOM1..5 — the 5 guild-rank icons of the messenger sheet (5.2).
* `UpdateData()` (:643-712): counts `GetMemberLvSize(rank)` / `GetMaxMemberLvSize(rank)` formatted `"%.2d/%.2d"`; max per rank is
  Master 1, Kingpin 5, Captain 10, Supporter 20 (`GM_*`, guild.h:32-36, guild.cpp:328-329) and Rookie = `GetMaxMemberSize()` =
  guild-table max members for the guild level (guild.cpp:499-514; WndGuildTabApp.cpp:674-675). Then `SetData(m_adwPower)` (copies
  the 5 DWORDs and **only ever sets** checks to 1 — it never clears a box, :300-463), `SetPenya()` writes `"%d"` of `m_adwPenya[i]`
  (:285-297). Everything is enabled only for the master (`EnableButton(IsMaster)`, :682-685), and the whole Master column (CHECK1/6/
  11/16/21) is always disabled (:700-711). No guild -> all zero, disabled, pays "0" (:687-698).
* `OnChildNotify` (:87-282) — returns FALSE unless my rank is GUD_MASTER (:89-100), no message.
  * a checkbox click toggles the matching bit in the local `m_adwPower[rank]` copy (no packet yet);
  * WIDC_BUTTON1..5 -> `new CWndGuildPayConfirm`, `m_dwAppellation` = GUD_MASTER..GUD_ROOKIE (:241-275);
  * WIDC_OK -> `g_DPlay.SendGuildAuthority( guildId, m_adwPower )` (:276-279) -> DPClient.cpp:13213, PACKETTYPE_GUILD_AUTHORITY
    `<< myId << guildId`, then 5 DWORDs raw. Note it sends this tab's own copy of all 5 DWORDs, including the guild-house bits
    loaded at the last `UpdateData` (tab 4 keeps a separate copy, see 2.6).
* Server answer `OnGuildAuthority` copies the array into `CGuild::m_adwPower`, refreshes **only this tab** and prints chat
  TID_GAME_GUILDCHGWARRANT "Authority for each title has been changed." (DPClient.cpp:13389-13406).

#### CWndGuildPayConfirm — APP_GUILD_PAYCONFIRM (salary for one rank)
* resdata.inc:7001-7057, ResData.h:243 (338), `WndTile08.tga`, 288x144, title "Setup Pay per Title"; text "What amount will you set
  for payment?", "Amount", WIDC_EDIT1 90,46,210,64, WIDC_YES "OK", WIDC_NO "Cancel". Modal (WndGuildTabApp.cpp:491-497).
* WIDC_YES (:513-558): every char must be a digit (`isdigit2`) and the value 0..999999; otherwise the edit is cleared and box
  TID_GAME_GUILDONLYNUMBER "Please enter the number." (:550, :556). Valid -> `SendGuilPenya( guildId, m_dwAppellation, penya )`
  (:543) -> DPClient.cpp:13223, PACKETTYPE_GUILD_PENYA `<< myId << guildId << DWORD rank << DWORD penya`, then close. An empty
  edit passes the digit loop and sends 0. WIDC_NO closes.
* Server answer `OnGuildPenya` stores `m_adwPenya[type]`, refreshes TabInfo + `TabApp.SetPenya()`, chat TID_GAME_GUILDCHGPAY
  "Salary for each title has been changed." (DPClient.cpp:13408-13428). The daily pay arrives as `OnGuildRealPenya`
  (chat TID_GAME_GUILD_PAYTAKE "Guild salary of %d Penya received. Log in again to acquire the amount.", :13430-13452).

### 2.5 CWndGuildTabWar — APP_GUILD_TABGUILDWAR (tab "Guild Duel")

* resdata.inc:7355-7501, ResData.h:248 (343), 404x300. Labels "Guild Name:", "Guild Logo:", "Won:", "Lost:", "Gave Up:",
  "Time Left"; values WIDC_GUILDWARGUILDNAME 100,6; WIDC_GUILDWARWIN/LOSE/GIVEUP 110,62/82/102; WIDC_GUILDWARLEFTTIME 110,124;
  enemy logo box WIDC_CUSTOM1 98,30,122,54. Buttons y 256-276: BUTTON1 24-96 `ButtGuildWar.BMP` "Declare Guild Duel",
  BUTTON2 152-224 `ButtPeace.BMP` "Propose Cease-fire", BUTTON3 272-344 `ButtGiveUp.BMP` "Give Up Guild Duel". For LANG_ENG/VTN the
  code swaps BUTTON1 to `ButtGuildDuel.bmp` (WndGuildTabWar.cpp:104-110).
* `UpdateData` (:181-210): enemy = `g_GuildMng.GetGuild( m_idEnemyGuild )` name or ""; time-left ""; Won/Lost/Gave Up with
  TID_GAME_GUILD_WAR_DATA_WIN / _LOSE / _SURRENDER (all just "%d", colour 0xff000000) of `m_nWin`, `m_nLose`, `m_nSurrender`.
* `OnDraw` (:39-96): only while `g_pPlayer->GetWar()` exists — sets WIDC_GUILDWARLEFTTIME every frame to
  `(war end time - now).Format("%H:%M:%S")`, and draws the enemy guild's logo (enemy = the war side that is not my guild).
* Buttons (:149-179): no guild -> ignored. BUTTON1 (master only, silent otherwise) -> `CWndGuildWarDecl`; BUTTON2 (master only)
  -> `CWndGuildWarPeace`; BUTTON3 (**any member**, no rank check) -> `CWndGuildWarGiveUp`. Those dialogs: 1b. The declare dialog
  only sends the enemy name if it is 3..47 chars (WndGuildWarDecl.cpp:86-89); its penya edit (WIDC_EDIT2) is never read.

### 2.6 CWndGuildTabPower — APP_GUILD_TAPPOWER (tab "Permissions" = guild-house rights)

* resdata.inc:4463-4627, ResData.h:769 (864), 404x304. Column headers "Kingpin" 100,30 / "Captain" 166,30 / "Supporter" 238,30 /
  "Rookie" 322,30 (no Master column). Rows: "Furniture" (8,88) -> CHECK1 110,92 / CHECK2 176,92 / CHECK3 250,92 / CHECK4 330,92
  = PF_GUILDHOUSE_FURNITURE 0x20; "Teleporter" (8,106) label **without checkboxes**; "Maintenance Fee" (8,148) -> CHECK9 110,152 /
  CHECK10 176,152 / CHECK11 250,152 / CHECK12 330,152 = PF_GUILDHOUSE_UPKEEP 0x40 (guild.h:44-45). Buttons WIDC_BUTTON1 70,220,166,244
  `ButtOk.tga` "OK", WIDC_BUTTON11 230,220,326,244 `ButtCancel.tga` "CANCEL".
* `UpdateData` (WndGuildTabPower.cpp:61-79) = `SetData(m_adwPower)` (again set-only) + enable for the master; CANCEL is always
  disabled (:108-110); OK starts disabled (`m_bChanedCheckBox` FALSE, :41-43).
* `OnChildNotify` (:174-267): master only (silent). A checkbox toggles the bit and sets a **function-static** `bChanged = TRUE`;
  OK with bChanged -> `SendGuildAuthority( guildId, m_adwPower )` (:254-258) — same packet as tab 2, carrying this tab's copy of all
  5 DWORDs. OK is re-enabled/disabled after every notify (:260-264).
* Refresh: **only at creation**. `OnGuildAuthority` refreshes tab 2 only (DPClient.cpp:13400-13402) and the other handlers never touch
  tab 4, so after a change made in tab 2 a later OK in tab 4 resends the old tab-2 bits (and vice versa). Port note: share one array.
* The rights are used by the guild-house NPC menu (e.g. MMI_GUILDHOUSE_CHARGE checks `IsAuthority(PF_GUILDHOUSE_UPKEEP)`,
  WndWorld.cpp:6085-6090).

### 2.7 CWndGuildConfirm — APP_GUILD_INVATE (invitation received)

* resdata.inc:6944-7000, ResData.h:252 (347), `WndTile08.tga`, 240x144, title "Invite to Guild". WIDC_STATIC3 32,12,192,28 = guild
  name (set in `OnInitialUpdate`, WndGuild.cpp:201-202); "Guild is inviting you." (30,34); "Will you join the Guild?" (30,56);
  WIDC_OK 36,82,108,102 `ButtYes.tga` "YES"; WIDC_NO 120,82,192,102 `ButtNo.tga` "NO". Position: centred horizontally, **y = 70**
  (:203-206). Created with `InitDialog(APP_GUILD_INVATE)` (:212), window style from resdata. One instance: `g_WndMng.m_pWndGuildConfirm` (deleted and recreated per invite).
* Opened by `CDPClient::OnGuildInvite` (DPClient.cpp:13121-13143, snapshot SNAPSHOTTYPE_GUILD_INVITE, :547): reads idGuild and
  idMaster (the inviter); ignored while `m_bAllAction == FALSE`; **only if the guild is already in `g_GuildMng`**, otherwise nothing.
* YES or Enter (`EN_RETURN`) -> `SendAddGuildMember( m_idMaster, info{ idPlayer = me }, IsAuthorization(AUTH_GAMEMASTER) )`
  (WndGuild.cpp:230-245) -> DPClient.cpp:12501, PACKETTYPE_ADD_GUILD_MEMBER `<< idMaster` + raw GUILD_MEMBER_INFO
  (`idPlayer`, `BYTE nMultiNo = 100` default, guild.h:243-260); the `bGM` argument is **not written**.
* NO -> just closes (:246-249). **No refusal packet is sent**: `SendIgnoreGuildInvite` (DPClient.cpp:12479, PACKETTYPE_IGNORE_GUILD_INVITE)
  exists and the world server would tell the inviter TID_GAME_COMACCEPTDENY "%s has declined your invitation." (WORLDSERVER/DPSrvr.cpp:
  12005-12019), but nothing in the V15 client calls it.

### 2.8 CWndGuildName — APP_GUILDNAME (set guild name / rename)

* resdata.inc:7502-7549, ResData.h:250 (345), `WndTile06.tga`, 272x128, title "Guild Name Setup Window"; "Enter the guild name."
  (42,10); WIDC_EDIT1 8,36,252,56; WIDC_OK 46,68 "OK"; WIDC_CANCEL 130,68 "CANCEL". Opened with `Initialize(&g_WndMng)` (top level, parent = window manager;
  InitDialog). Pre-fills the edit with the current name; destroys itself if I have no guild (WndGuildName.cpp:39-60). While
  `m_bAllAction == FALSE` it re-centres itself every frame (:26-38) and Cancel/close are refused (:157-162).
* `m_nId` selects the packet: `0xff` (from the Info tab button) -> `SendGuildSetName(name)` (DPClient.cpp:13231, PACKETTYPE_GUILD_SETNAME
  `<< myId << myGuildId << string`); anything else -> `SendQuerySetGuildName(name, nId)` (DPClient.cpp:15789, PACKETTYPE_QUERYSETGUILDNAME
  `<< BYTE nId << string`), where nId = the rename item's object id (`II_SYS_SYS_SCR_GCHANAM` 10463, defineItem.h:2520, handled in
  `SendDoUseItem`, DPClient.cpp:10525-10535) or `0x7f` (server-unify forced rename: `OnAllAction` :1637-1644 and
  `FUNCTYPE_QUERYSETGUILDNAME` :14469-14479).
* OK validation (WndGuildName.cpp:84-149), all as boxes; name is trimmed first:

| check | message |
|---|---|
| length (bytes) < 3 or > 32 (`__RULE_0516` is not defined) | TID_DIAG_0011 "The name must be 6 to 18 characters long." (the English text does not match the 3..32 rule) |
| first char is a digit (not DBCS) | TID_DIAG_0012 "The name cannot start with a number." |
| DBCS char that is not Hangul (Korean client only) | TID_DIAG_0014 "You cannot use special characters in a name." |
| any single-byte char that is not alphanumeric and not Cyrillic, or is a control char | TID_DIAG_0013 "You cannot use special characters or spaces in a name." |
| `prj.IsInvalidName` (filter) or not `prj.IsAllowedLetter` (`__RULE_0615`) | TID_DIAG_0020 "Character name is not allowed." |

* Result: `OnGuildSetName` renames the guild and prints (no colour argument) TID_GAME_GUILDNAMECHG "%s guild has changed their name to %s."
  (DPClient.cpp:13454-13476); a duplicate name comes back as `OnGuildError` 1 -> chat TID_GAME_COMOVERLAPNAME "Guild name already exists."
  (0xffff0000), error 2 -> TID_GAME_GUILDONLYNUMBER (:13099-13119).

### 2.9 CWndGuildNickName — APP_GUILD_NICKNAME (member nickname, shown in the Alias column)

* resdata.inc:7550-7597, ResData.h:254 (349), `WndTile08.tga`, 272x128, title "Setup Guild Title"; "Enter Title" (44,12); WIDC_EDIT1
  40,36,224,55; WIDC_OK 48,66 "OK"; WIDC_CANCEL 130,64 "Cancel". Held in `g_WndMng.m_pWndGuildNickName`, `m_idPlayer` = target.
* OK (WndGuildName.cpp:221-327), trimmed: empty -> TID_DIAG_0011; length 2..12 bytes (with `__RULE_0615` the same for all languages,
  :241-254) else TID_DIAG_0011_01 "Enter a name between 2 to 12 letters."; then the same digit / character / filter checks as 2.8
  (TID_DIAG_0012/0014/0013/0020). Then it sends `SendGuildNickName( m_idPlayer, nick )` (DPClient.cpp:13169, PACKETTYPE_GUILD_NICKNAME
  `<< myId << target << string`) **only if the new text differs from my own alias** (it compares against the master's member entry, not
  the target's, :309-321 — a bug; if equal, nothing happens and the window stays open). Cancel closes.
* Answer `OnGuildNickName` sets `m_szAlias`, refreshes TabInfo + TabMember (DPClient.cpp:12984-13005). No chat line.

### 2.10 CWndGuildNotice — APP_GUILD_NOTICE

* resdata.inc:3254-3301, ResData.h:218 (313), `WndTile07.tga`, 320x240, title "Guild Notice Setup Window". WIDC_EDIT1 6,6,308,176
  multi-line (gets `EBS_WANTRETURN | EBS_AUTOVSCROLL`), pre-filled with `m_szNotice` (WndGuildTabInfo.cpp:104-134). Buttons y 182-202:
  WIDC_BUTTON1 28 `ButtNoticeNew.BMP` "New Notice" (clears the edit), WIDC_BUTTON2 116 `ButtNoticeStart.BMP` "Open Notice"
  (= post), WIDC_BUTTON3 204 `ButtNoticeEdit.BMP` "Modify Notice" (just focuses the edit) (:157-188). Modal.
* Post: `strlen < MAX_BYTE_NOTICE (128)` -> `SendGuildNotice(text)` (DPClient.cpp:13203, PACKETTYPE_NW_GUILDNOTICE, string) and close;
  else box TID_GUILD_NOTICE_ERROR "The number of characters exceeds the limit. Please shorten it." (:167-175).
* Every member then gets `OnGuildNotice`: chat TID_GAME_GUILDNOTICEUPDATE "A new Guild Notice has been posted. Please check it in the guild
  window." and TabInfo refresh (DPClient.cpp:13368-13387).

### 2.11 CWndGuildSetLogo — APP_GUILD_SETLOGO

* resdata.inc:3302-3349, ResData.h:220 (315), `WndTile07.tga`, 208x240, title "Guild Logo Setup Window". WIDC_STATIC1 12,10,182,144 on
  `WndEditTile00.tga` (the picture frame), WIDC_OK 18,150 "Setup Logo", WIDC_CANCEL 100,150 "Cancel", WIDC_BUTTON1 66,180,124,200 "GM Logo".
* Non-GM (`!IsAuthHigher(AUTH_GAMEMASTER)`): BUTTON1 hidden+disabled and the **window height is cut to 208** (WndGuildTabInfo.cpp:276-288).
* Grid (`OnInitialUpdate` :257-269): logos 1..20 (`CUSTOM_LOGO_MAX - 7`; CUSTOM_LOGO_MAX = 27, Resource/define.h:162) in 5 columns x 4 rows;
  logo k (0-based, col = k%5, row = k/5) at **x = 24 + col*30, y = 18 + row*30**, 24x24 each (`pt = (x+24, y+18) + (x*(w+5), y*(h+5))`).
  Drawn opaque (:222-237). Initial selection = current `m_dwLogo` (0 = none).
* Selection: left-button-up on a logo -> `m_nSelectLogo = k+1` (:314-326); the selected logo gets two magenta 1-px rectangles
  (RGB 255,0,255) at 1 and 2 px outside it (:203-220).
* OK -> `SendGuildLogo( m_nSelectLogo )` (1-based; 0 if nothing picked) (:334-346) -> DPClient.cpp:13178, PACKETTYPE_NW_GUILDLOGO `<< DWORD`.
  GM Logo -> `SendGuildLogo( GetGMLogoIndex() )` — 21..27 by client language (WndWorld.cpp:7945-7979: SPA 21, GER/FRE 22, JAP 23,
  ENG+PHP 24, THA 25, TWN 26, ENG+USA 27, else -1) — or box TID_GAME_DONOTHAVE_GMLOGO "No GM guild exist for apply." (:352-366).
* Answer `OnGuildLogo` just sets `m_dwLogo` (DPClient.cpp:13254-13265); the tabs read it live in OnDraw, nothing is refreshed.

### 2.12 CWndGuildDisMiss — APP_GUILD_DISMISS (disband confirm)

* resdata.inc:6065-6112, ResData.h:237 (332), `WndTile08.tga`, 288x128, title "Disband Guild Confirmation Window"; WIDC_EDIT1 10,10,266,62
  is only a framed box; text "Do you want to disband the guild?" (44,24); WIDC_YES 52,70 `ButtYes.tga`; WIDC_NO 136,70 `ButtNo.tga`. Modal.
* YES (WndGuildTabInfo.cpp:68-88): if `g_GuildCombatMng.m_bRequest` (applied for Guild Siege) -> box TID_GAME_GUILDCOMBAT_NOT_DISSOLVE_GUILD,
  whose English text is wrong ("You can disband a guild that has applied for a Guild Siege."); else `SendDestroyGuild( myId )`
  (DPClient.cpp:12493, PACKETTYPE_DESTROY_GUILD `<< idPlayer`). Closes either way.
* All clients then get `OnDestroyGuild`: chat TID_GAME_COMDISMESS "%s has disbanded the %s guild." (0xffff0000) — only for members of that
  guild — and the guild is removed; tabs 0-3 refreshed (DPClient.cpp:12583-12615).

### 2.13 CWndGuildMerit — APP_GUILD_MERIT1 (contribute)

* resdata.inc:3038-3112, ResData.h:484 (579), `WndTile00.tga`, 272x224, title "Guild Contributing Window". WIDC_STATIC3 "Quest Items" +
  WIDC_CHECK2 92,10; WIDC_LISTBOX1 10,28,252,134 (replaced by a custom item grid `CWndGuildMeritCtrl`, WndGuildMerit.cpp:42-44);
  "Penya" + WIDC_EDIT1 70,140,222,158 (pre-set "0", focused); WIDC_BUTTON1 50,166 `ButtYes.tga`; WIDC_BUTTON2 138,166 `ButtNo.tga`
  (both captioned "Button"; the picture carries the text). Opened only from the guild bank's Button1, and only if the guild has a name,
  else box TID_GAME_GUILDNOTHINGNAME "Unable to make a contribution. Ask your Guild Leader to set the guild name first."
  (WndGuildBank.cpp:313-332).
* CHECK2 on: lists every inventory item with `dwItemKind3 == IK3_GEM` (quest/gem items), 6 per row at 32 px, with stack count in
  0xff1010ff (WndGuildMerit.cpp:130-163, 243-297). OK / Enter: penya > 0 -> `CanContribute` then `SendGuildContribution(0, penya)`; items
  checked -> `SendGuildContribution(0, 0, 1)` (DPClient.cpp:13190, PACKETTYPE_NW_GUILDCONTRIBUTION `<< BYTE pxp << int gold << BYTE itemFlag`);
  result chat lines from `CGuild::MeritResultMsg` (WndGuildMerit.cpp:92-118): OK TID_GAME_GUILDMERITSTUFF "You have Contributed to the
  guild."; max level TID_GAME_GUILDMERITMAXLEVEL; guild penya overflow TID_GAME_GUILDMAXBANKGOLD; invalid TID_GAME_GUILDMERITSYSERROR;
  own penya overflow TID_GAME_GUILDMERITMAXGOLD (all 0xffffffff). Cancel restores item counts.
* The guild bank's Button2 "cloak" -> guild level >= 4 else box TID_GAME_GUILDNOTLEVEL, then `SendCreateGuildCloak()` (WndGuildBank.cpp:333-346,
  DPClient.cpp:14183).

### 2.14 CWndRankGuild — APP_RANK_GUILD (guild ranking, 3 tabs)

* APP_RANK_GUILD resdata.inc:10244-10264, ResData.h:283 (378), `WndTile07.tga`, 464x384, title "Guild Ranking Window", WIDC_TABCTRL1 10,6,462,344.
  Tabs (WndRankGuild.cpp:616-652): 0 TID_GAME_TOOLTIP_RANKBEST "Best Guild" -> CWndRankTabBest (APP_RANK_GUILDTABBEST, ranking `CGuildRank::R1`);
  1 TID_GAME_TOOLTIP_RANKUNITED "Best Guild of Unity" -> CWndRankTabUnited (R5); 2 TID_GAME_TOOLTIP_RANKPENYA "Richest Guild" -> CWndRankTabPenya (R6).
  Each tab 452x338 with header statics Ranking (6,4) / Guild Name (68,4) / Guild Master Name (216,4) / Win (344,4) "/" (374,4) Lose (390,4)
  (the Penya tab has no Win/Lose). Two header statics of the Best tab have a broken id (`IDS_RESDATA_INC_000811/813` instead of WIDC_*,
  resdata.inc:8568, 8577) — harmless.
* Rows (OnDraw, :22-112 / 223-312 / 421-506): 10 visible, start sx 8 sy 32, step 25; rank medal from `m_texMsgIcon` frame **49 + n** with
  n = 0 for #1, 1 for #2-3, 2 for #4-7, 3 for #8-12, 4 for #13+ (the guild-rank icons reused as medals) at (8, sy-3); rank number at x 28;
  logo (if any) at (50, sy-5); guild name x 80; master name x 218 (cut at 12 bytes + "..."); `"%5d  /  %5d"` win/lose at x 338. Text black.
  Wheel = 3 rows, drag scroll like the member tab.
* Opened only from NPC menu MMI_RANK_GUILD "Guild Ranking" (TID_MMI_RANK_GUILD) — WndWorld.cpp:5614-5622: new window (`g_WndMng.m_pWndRankGuild`)
  + `SendGuildRank( CGuildRank::Instance()->m_Version )` (DPClient.cpp:13239, PACKETTYPE_REQUEST_GUILD_RANKING `<< DWORD ver`); answer
  `OnGuildRank` deserialises `CGuildRank` (:13478-13481). NPCs with the menu (Resource/character.inc, UTF-16): MaFl_Juria (:469-476),
  MaSa_Helena (:1119-1126); MaDa_Ollien (:2458-2464) has the guild warehouse.

### 2.15 CWndGuildVote / CWndGuildVoteSeting — APP_GUILD_VOTE / APP_GUILD_VOTESETING (not on __MAINSERVER)

Compiled but unreachable on the main server (section 0). For completeness: vote window 352x368 (resdata.inc:5321-5530, combo of votes, question
edit, 4 radio options with counts, "Vote" / "Setup Vote" buttons) -> `SendCastVote(idVote, sel)` (WndGuildVote.cpp:238; DPClient.cpp:14575);
setup window 352x352 (7226-7354: title, question, 4 options, "Delete" / "Start Vote" / "End Vote") -> `SendAddVote` (:444; DPClient.cpp:14526),
`SendCloseVote` (:456; DPClient.cpp:14561); remove = `SendRemoveVote` (DPClient.cpp:14547). Its `OnInitialUpdate` prints chat
TID_GAME_GUILDNOTLEVEL on a low guild level (WndGuildVote.cpp:62). Recommend: skip.

### 2.16 Messenger "Guild" tab — CWndGuildCtrlEx

The V15 messenger (`CWndMessengerEx`, WndMessenger.h:40-52) has a guild-member list `CWndGuildCtrlEx` (WndMessengerCtrl.cpp:1056-1640):
built from `m_mapPMember` + PlayerData (job, level, channel = uLogin, online/offline) (:1094-1151); default sort by status; columns at
x 20 channel icon (`m_texPlayerDataIcon` 34 + channel-1), x 76 status icon (7 + state-2), x 127 level text, x 174 job-type / x 194 job icon,
x 226 name (cut at 10 bytes) — selected row 0xff6060ff (:1168-1325); row height 20; job-name tooltip over the job icon (:1327-1352);
double-click an online member opens a whisper window, offline -> chat TID_GAME_NOTLOGIN (:1374-1417). It is refreshed by
`UpdateGuildMemberList()` from the same packets as the guild window (section 3). If the messenger port already has a guild tab, this is it.

---------------------------------------------------------------------------------------------------------------------------

## 3. Refresh triggers (which packet refreshes which tab) and the chat lines they print

Packet dispatch: DPClient.cpp:183-206 (`ON_MSG`) and the snapshot switch :515-560. "Tabs" = tab `UpdateData()` calls on the open
APP_GUILD window; "Msgr" = `CWndMessengerEx::UpdateGuildMemberList()`. `UpdateGuildWnd()` (DPClient.cpp:13267-13275) = Info + Member.

| handler (DPClient.cpp) | data change | tabs refreshed | chat line (TID, English, colour) |
|---|---|---|---|
| OnCreateGuild 12516-12581 (SNAPSHOTTYPE_CREATE_GUILD) | new CGuild, name as sent (empty after NPC creation), master = idPlayer, `m_adwPower[GUD_MASTER] = 0xFF` | none (Msgr if I am the master) | TID_GAME_COMCREATE "%s has formed the guild '%s'." 0xffccffcc |
| OnDestroyGuild 12583-12615 | guild removed | App, Info, Member, War; Msgr | TID_GAME_COMDISMESS "%s has disbanded the %s guild." 0xffff0000 (only if it is my guild, :12596) |
| OnGuild 12617-12686 (PACKETTYPE_GUILD / SNAPSHOTTYPE_GUILD) | full guild serialize; then `SendQueryPlayerData` for all members | App, Info, Member, War; Msgr | — |
| OnSetGuild 12689-12745 (per mover) | mover's `m_idGuild`; for me: leave -> `GuildHouse->Clear()` | join: App, Info, Member, War; Msgr | leave: TID_GAME_COMLEAVE "You are no longer a member of the %s guild." 0xffff0000; join: BGM_IN_COMPANY music + TID_GAME_COMACCEPT "You have joined the %s guild." 0xffccffcc |
| OnAddGuildMember 12747-12799 | new member, rank GUD_ROOKIE | Info, Member; Msgr | TID_GAME_COMACCEPTWELCOME "%s has joined the guild." 0xffccffcc |
| OnRemoveGuildMember 12801-12838 | member removed | App, Info, Member, War; Msgr | TID_GAME_COMLEAVEBYE "%s has left the guild." 0xffff0000 (used for both leave and kick) |
| OnGuildChat 12840-12876 | — | — | `"[%s] %s"`, colour of TID_GUILD_CHAT 0xffffbaff, style CHATSTY_GUILD; balloon over the speaker (`CHAT_GUILD`) |
| OnGuildMemberLv 12878-12918 | rank set, **class reset to 0** | Info, Member; Msgr | builds TID_GAME_GUILDMEM_APPUP "%s has been promoted." / _APPDOWN "%s has been demoted." but **never prints it** (no PutString, :12890-12900); note "promoted" is chosen when the new number is *larger* (= lower rank) |
| OnGuildClass 12920-12941 | `m_nClass` | Info, Member | — |
| OnChgMaster 12943-12982 | old master -> GUD_ROOKIE, new -> GUD_MASTER, classes 0 | Info, Member | TID_GAME_CHANGE_GUILDMASTER "%s has become the guild master." 0xff00ff00 (only if the new master is in view) |
| OnGuildNickName 12984-13005 | `m_szAlias` | Info, Member | — |
| OnGuildMemberLogin 13008-13039, OnGuldMyGameJoin 13041-13097 | (pre-v11 login fields; V15 uses PlayerData) | Member (+Info for GameJoin); Msgr | — |
| OnUpdatePlayerData 977-1003, OnLogout 1005-1024, OnQueryPlayerData 13576-13606, rename 15625-15646 | PlayerData (job, level, online, name) | Info, Member (`UpdateGuildWnd`) | — |
| OnGuildChangeJobLevel 17029-17056 | — | (pre-v11 path only) | — |
| OnGuildError 13099-13119 | — | — | 1: TID_GAME_COMOVERLAPNAME "Guild name already exists." 0xffff0000; 2: TID_GAME_GUILDONLYNUMBER "Please enter the number." |
| OnGuildInvite 13121-13143 | — | opens CWndGuildConfirm | — |
| OnAllGuilds 13145-13148 | `g_GuildMng` serialize (all guilds) | — | — |
| OnGuildLogo 13254-13265 | `m_dwLogo` | none (drawn live) | — |
| OnGuildContribution 13278-13295 | level, guild penya, pxp, member contribution | Info, Member | level up: TID_GAME_GUILDLEVELUP "Guild level has increased." 0xffffffff |
| OnGuildNotice 13368-13387 | `m_szNotice` | Info | TID_GAME_GUILDNOTICEUPDATE "A new Guild Notice has been posted. Please check it in the guild window." |
| OnGuildAuthority 13389-13406 | `m_adwPower[5]` | **App only** (not Power) | TID_GAME_GUILDCHGWARRANT "Authority for each title has been changed." |
| OnGuildPenya 13408-13428 | `m_adwPenya[type]` | Info, App.SetPenya | TID_GAME_GUILDCHGPAY "Salary for each title has been changed." |
| OnGuildRealPenya 13430-13452 | `m_nGoldGuild` | Info | TID_GAME_GUILD_PAYTAKE "Guild salary of %d Penya received. Log in again to acquire the amount." (if my rank's pay > 0) |
| OnGuildSetName 13454-13476 | name (`g_GuildMng.SetName`) | Info | TID_GAME_GUILDNAMECHG "%s guild has changed their name to %s." (default colour) |
| OnGuildRank 13478-13481 | `CGuildRank` | (rank window draws live) | — |
| guild bank penya updates 2915-2955 | `m_nGoldGuild`, contribution decrement | Info, Member | — |

Tab 4 (Power) is refreshed by none of them (only at creation). Guild-war packets: `OnAcptWar` and `OnWar` refresh the War tab (DPClientGuildWar.cpp:131-171, 193-225); `OnWarEnd` refreshes App, Info, Member and more (:267-294+).

---------------------------------------------------------------------------------------------------------------------------

## 4. How the windows are opened

| route | details | cite |
|---|---|---|
| Applet / hotkey | `AddAppletFunc( AppMain_WndGuild, APP_GUILD, "WndGuild", "Icon_Troupe.dds", GETTEXT(TID_TIP_COMPANY) "Manage your Guild.", 'G' )` — hotkey **G**; the per-language hotkey override `__HotKeyChange` does not touch APP_GUILD | FuncApplet.cpp:97, 245; WndManager.cpp:2432-2476 |
| Start menu | folder "Community" (TID_APP_COMMUNITY, `icon_Folder.dds`) -> submenu `m_pMenu2`: APP_PARTY (TID_APP_PARTY), **APP_GUILD (TID_APP_COMPANY "Guild")**; APP_GUILD_VOTE only under `__GUILDVOTE` (off) | WndTaskBar.cpp:2634, 2668-2676 |
| task bar / quick slot | it is an applet, so it can be dragged to the task bar as SHORTCUT_APPLET with icon `Icon_Troupe.dds` (generic applet mechanism) | FuncApplet.cpp:245 |
| guild-house menu | `CWndGHMainMenu` WIDC_BTN_SETUPPOWER toggles APP_GUILD and selects tab 4 | WndGuildHouse.cpp:63-76 |
| start position | APP_GUILD centred on screen (`MoveParentCenter`, WndGuild.cpp:105) | |
| right-click on a player | `CWndWorld::ShowMoverMenu` (WndWorld.cpp:6517-): for a player whose vendor is **not** open, the menu is Trade, Add to messenger, Invite to party, **"Invite to join guild"** (TID_MMI_INVITE_COMPANY, MMI_INVITE_COMPANY 7) *only if I have a guild, I am a member, and `m_adwPower[myRank] & PF_INVITATION`* (:6556-6565), then duel/trace/inspect/cheer/campus items. Shown even if the target already has a guild (server rejects). Distance < 20 m (:6520-6526). | WndWorld.cpp:6544-6623 |
| invite click | `MMI_INVITE_COMPANY` -> `InviteCompany( target objid )` (:5645-5650) -> guild-siege running -> box TID_GAME_GUILDCOMBAT_NOT_INVITATION_GUILD "You can not invite someone to the guild while in Guild Siege."; 1v1 siege not closed -> box TID_GAME_GUILDCOMBAT1TO1_NOTINVITEGUILD "You cannot invite new Guild Members until the 1vs1 Guild Siege is over."; else `SendGuildInvite( objid )` (DPClient.cpp:12472, PACKETTYPE_GUILD_INVITE `<< OBJID`) | WndWorld.cpp:11268-11282 |
| chat command | `/guildinvite <name>` (TCM_SERVER, AUTH_GENERAL) runs the same server `InviteCompany`; `/g` guild chat | FuncTextCmd.cpp:3043-3071, 5144-5146 |
| NPC menus | MMI_RANK_GUILD "Guild Ranking" -> CWndRankGuild (+MMI_RANK_WAR / MMI_RANK_INFO); MMI_GUILDBANKING "Guild Warehouse" -> `SendOpenGuildBankWnd` (blocked while trade/repair/shop/bank windows are open, with chat messages TID_GAME_TRADENOBANK etc.) | WndWorld.cpp:5537-5638; NPCs in Resource/character.inc:469-476 (MaFl_Juria), 1119-1126 (MaSa_Helena), 2458-2464 (MaDa_Ollien) |
| items | `II_SYS_SYS_SCR_GCHANAM` (10463, guild rename scroll) -> CWndGuildName with `SetData(item objid)` -> `SendQuerySetGuildName` | DPClient.cpp:10525-10535 |
| server-driven | SNAPSHOTTYPE_GUILD_INVITE -> CWndGuildConfirm; `FUNCTYPE_QUERYSETGUILDNAME` run-script and `OnAllAction(m_bAllAction = FALSE, guild)` -> CWndGuildName(0x7f) | DPClient.cpp:13121, 14469-14479, 1618-1646 |

---------------------------------------------------------------------------------------------------------------------------

## 5. Pictures used by code (not by resdata)

### 5.1 Files
| file | loaded where | used for |
|---|---|---|
| `Icon\Icon_CloakSLogo01.jpg` .. `27.jpg` (24x24, colour key black, 27 files present in Client/Icon) | `CWndWorld` init, `str.Format("Icon_CloakSLogo%02d.jpg", i+1)` into `m_pTextureLogo[CUSTOM_LOGO_MAX]` (WndWorld.cpp:3667-3677; WndWorld.h:347) | guild logos: Info tab, logo picker (1..20), war tab enemy logo, ranking rows, **overhead logo left of the guild name** (MoverRender.cpp:1617-1660), and the cloth texture under `__YCLOTH` (WndWorld.cpp:3679-3692). 21..27 = GM logos (Resource/define.h:164-170) |
| `icon\icon_IconMessenger.inc` / `.dds` | `m_texMsgIcon.LoadScript` (WndWorld.cpp:3694) | rank icons in the Title tab header and ranking medals (frames 49-53) |
| `icon\icon_PlayerData.inc` / `.dds` | `m_texPlayerDataIcon.LoadScript` (WndWorld.cpp:3699) | member tab rank/job icons; messenger guild tab icons |
| `Theme\ButtGuildMemberTabMLevel/Job/Level/Char/Alias.bmp` (key 0xffff00ff) | WndGuildTabMember.cpp:471-527 (same files as resdata) | member-tab column header buttons |
| `Theme\ButtGuildDuel.bmp` (key 0xffff00ff) | WndGuildTabWar.cpp:104-110, only LANG_ENG / LANG_VTN | replaces `ButtGuildWar.BMP` on the "Declare Guild Duel" button |
| `Theme\TexGuildCombatWinner.bmp`, `TexGuildCombatBest.bmp` | WndWorld.cpp:3811-3812 | overhead marks for the guild-siege winner guild / best player, left of the logo (MoverRender.cpp:1649-1691) |
| `Icon_Troupe.dds` | FuncApplet.cpp:245 | applet icon of APP_GUILD (the party applet uses the same icon, :233) |
| `CT%06d.jpg` in DIR_LOGO | `CGuildTexture::LoadGuildTexture` (GuildRender.cpp:37-79) | per-guild custom cloak texture — **returns NULL in non-debug builds** (:39-41), so unused in a release client; skip |
| `GauEmptySmall.bmp`, `GauFillSmall.bmp` | legacy `CWndGuildCtrl` only (WndGuildCtrl.cpp:74-75) | not used in V15 |

### 5.2 Sprite-sheet frames (texture pack `serialize count w h x y` = frames left-to-right from (x,y), stride w; _Common/2DRender.cpp:1712-1745)

`icon_PlayerData.inc` (49 frames; Client/Icon/icon_PlayerData.inc):
| frames | size | sheet y | content |
|---|---|---|---|
| 0-6 | 32x32 | 1 | big status |
| 7-13 | 16x16 | 33 | small status |
| 14-18 | 16x16 | 49 | 1st-job icons (index 14 + nJob, nJob 0..4) |
| 19-26 | 16x16 | 65 | 2nd-job icons (19 + nJob-6) |
| 27-33 | 16x16 | 81 | master level badges 27..32 (60/70/80/90/100/110), 33 = hero |
| 34-43 | 16x16 | 97 | server channel icons |
| **44-48** | 16x16 | 113 | **guild rank icons: 44 Master, 45 Kingpin, 46 Captain, 47 Supporter, 48 Rookie** |

`icon_Iconmessenger.inc` (86 frames): 0-11 big job icons 32x32 (y 1, 33); 12-23 small job icons (y 65 male, 81 female; 12 + nJob + 6*sex);
24-26 friend/group/guild item icons (y 97); 27-32 big status 12x12 (y 113); 33-38 small status 8x8 (x 73, y 113); 39-48 server icons
(y 125, 38 + channel); **49-53 guild rank icons (y 141)**; 54-69 2nd-job big icons; 70-85 2nd-job small icons (70 + nJob-6 + 8*sex).

---------------------------------------------------------------------------------------------------------------------------

## 6. Flows

### 6.1 Guild creation (client side has no creation window)
1. NPC **MaSa_Helena** dialog (WORLDDIALOG/NpcScript.cpp:10912-10933 and 10946-10971): requires quest `QUEST_CREGUILD` finished, >= 3,000,000
   penya, I am party leader, party size >= 3 and no party member in a guild (`IsPartyGuild() == 0`). Then `RemoveGold(3000000)` and
   `CreateGuild()` -> server `CreateGuild` (_Common/ScriptLib.cpp:799-837) collects all party members (all must be online) and calls
   `g_DPCoreClient.SendCreateGuild( info, nSize, "" )` — **empty guild name**. Dialog texts are Say(752) ok / 753 or 863 (party rule) / 755.
2. Client receives SNAPSHOTTYPE_CREATE_GUILD -> `OnCreateGuild` (chat TID_GAME_COMCREATE with an empty name) and per member SNAPSHOTTYPE_SET_GUILD /
   `OnSetGuild` (TID_GAME_COMACCEPT, BGM_IN_COMPANY). Nothing opens automatically (`// CWndX` placeholders, DPClient.cpp:12549-12552).
3. The master opens the guild window, tab Information, button **Setup Guild Name** (only while the name is empty) -> CWndGuildName (m_nId 0xff)
   -> `SendGuildSetName`. Until then the guild bank contribution is refused (TID_GAME_GUILDNOTHINGNAME).
4. Later renames only with the scroll `II_SYS_SYS_SCR_GCHANAM` (-> `SendQuerySetGuildName(name, itemObjId)`), or GM `/sgn`.
   GM `/createguild` (`/cg`) exists (FuncTextCmd.cpp:1095-1111, 5218).

### 6.2 Invite
1. Inviter (with PF_INVITATION) right-clicks a player -> "Invite to join guild" -> client siege checks -> `SendGuildInvite(objid)` (4).
2. World server `InviteCompany` (WORLDSERVER/DPSrvr.cpp:7794-7867): no right -> inviter TID_GAME_GUILDINVAITNOTWARR "You are not authorized to do
   this."; target in a guild -> TID_GAME_COMACCEPTHAVECOM "%s is already in a guild."; target dueling -> silent; my guild at war ->
   TID_GAME_GUILDWARNOMEMBER; target in attack mode -> TID_GAME_BATTLE_NOTGUILD "You cannot invite others to join your guild during a battle.";
   else target gets the invite snapshot and the inviter TID_GAME_COMACCEPTKINGPIN "You invited %s to your guild." (0xffccffcc).
3. Target sees CWndGuildConfirm (2.7). YES -> `SendAddGuildMember(inviter, me)`; everyone in the guild gets OnAddGuildMember (welcome line), the
   joiner gets OnSetGuild (joined line + music). NO -> window closes, **nothing is sent**.

### 6.3 Leave / kick / disband / master change
* Leave and kick are the same menu item "Leave Guild" in the member tab, applied to the selected row, **no confirmation** (2.3). Result for
  everybody: OnRemoveGuildMember "%s has left the guild."; for the removed player also OnSetGuild(0) "You are no longer a member of the %s guild."
  `APP_GUILD_LEAVE` ("Do you want to leave Guild?") exists only in resdata.
* GM `/rgm <name>` sends the same packet (FuncTextCmd.cpp:1121-1137); `/dg` = `SendDestroyGuild` (:1113-1119).
* Disband: Info tab -> CWndGuildDisMiss (2.12) -> `SendDestroyGuild`. NPC script `DestroyGuild` (ScriptLib.cpp:839-859) only sends
  FUNCTYPE_DESTROYGUILD, which the client ignores (DPClient.cpp:14373-14376); non-masters get TID_GAME_COMDELNOTKINGPIN "Only the guild leader
  can disband the guild.", no guild TID_GAME_COMNOHAVECOM.
* Master change: member tab menu (master only) -> `SendChgMaster` -> OnChgMaster (old master becomes Rookie).

---------------------------------------------------------------------------------------------------------------------------

## 7. Surprises / port notes (summary)

1. `__GUILDVOTE` is internal/test only: no vote window on the main server.
2. No leave/kick confirmation; "Leave Guild" kicks whoever is selected (server checks rights). `APP_GUILD_LEAVE` is dead resdata.
3. Invite "NO" sends nothing (`SendIgnoreGuildInvite` never called); `SendAddGuildMember`'s bGM is not serialized.
4. Info-tab buttons are master-only and silently ignored for everyone else; the guild name can be set only while empty.
5. Member list sort is lost on every refresh (UpdateData does not re-sort) and the comparator names are inverted; Level sort is by job type first.
6. Promote/demote: OnGuildMemberLv formats a message but never shows it; promote sends `rank-1` without bounds checks.
7. Rights checkboxes are set-only (never unchecked on refresh); tab 2 and tab 4 keep separate copies of the same 5-DWORD rights array and
   each sends its own copy; tab 4 is never refreshed after creation.
8. Nickname window compares the new text against the master's own alias instead of the target's.
9. English text mismatches: TID_DIAG_0011 says "6 to 18" but the rule is 3..32 bytes; TID_GAME_GUILDCOMBAT_NOT_DISSOLVE_GUILD says "You can
   disband" (should be cannot).
10. Logo can be set once (level >= 2), 20 player logos + 7 GM logos, all 24x24 jpg; the custom cloak texture path is disabled in release.
11. Message boxes (OpenMessageBox) carry no colour; chat lines (PutString) use the TID colour from textClient.inc.

---------------------------------------------------------------------------------------------------------------------------

## Appendix A — resdata.inc control tables (generated; `vNgNdNtN` = visible/group/disabled/tabstop flags from the file, all 0 unless noted)

Columns: control id, WTYPE, rect (l,t,r,b, client coords), picture, style hex (+ "tile" when bTile = 1), text (IDS_RESDATA_INC title),
tooltip, resdata.inc line. Window header line: frame tga, tile flag, size, style, D3D format, window title / help key.

### APP_GUILD — resdata.inc:5243-5263, ResData.h:228 (=323)
frame "WndTile07.tga" tile=1 size 448x368 style 0x2410000 fmt 26; title "Guild Window"; help "Guild Window"
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_TABCTRL1 | TABCTRL | 18,6,434,330 | - | 0x260000 v0g0d0t0 |  |  | 5253 |

### APP_GUILD_TABINFO — resdata.inc:5060-5242, ResData.h:230 (=325)
frame "" tile=0 size 404x300 style 0x410000 fmt 26; title "Information Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,6,72,26 | - | 0x2260000 v0g0d0t0 | Name |  | 5070 |
| WIDC_STATIC2 | STATIC | 6,24,72,44 | - | 0x2260000 v0g0d0t0 | Master |  | 5079 |
| WIDC_STATIC3 | STATIC | 6,42,72,62 | - | 0x2260000 v0g0d0t0 | Exp |  | 5088 |
| WIDC_STATIC4 | STATIC | 6,60,72,80 | - | 0x2260000 v0g0d0t0 | Penya |  | 5097 |
| WIDC_STATIC5 | STATIC | 236,6,302,26 | - | 0x2260000 v0g0d0t0 | Level |  | 5106 |
| WIDC_STATIC6 | STATIC | 236,24,302,44 | - | 0x2260000 v0g0d0t0 | Member |  | 5115 |
| WIDC_STATIC7 | STATIC | 236,42,302,62 | - | 0x2260000 v0g0d0t0 | Logo |  | 5124 |
| WIDC_TEXT1 | TEXT | 6,84,378,254 | WndEditTile00.tga | 0x20020000 tile v0g0d0t0 |  |  | 5133 |
| WIDC_BUTTON1 | BUTTON | 106,262,178,282 | ButtNotice.BMP | 0x220010 v0g0d0t0 | Setup Notice | Setup Guild Notice | 5142 |
| WIDC_BUTTON2 | BUTTON | 200,262,272,282 | ButtSetlogo.BMP | 0x220010 v0g0d0t0 | Setup Logo | Setup Guild Logo | 5151 |
| WIDC_BUTTON3 | BUTTON | 294,262,366,282 | ButtDismiss.BMP | 0x220010 v0g0d0t0 | Disband Guild | Disband Guild | 5160 |
| WIDC_GUILDLEVEL | STATIC | 304,6,359,22 | - | 0x2260000 v0g0d0t0 | 0 |  | 5169 |
| WIDC_GUILDMASTER | STATIC | 66,24,166,44 | - | 0x2260000 v0g0d0t0 |  |  | 5178 |
| WIDC_GUILDEXPMERIT | STATIC | 66,42,166,62 | - | 0x2260000 v0g0d0t0 | 0 |  | 5187 |
| WIDC_GUILDPENYAMERIT | STATIC | 66,60,166,80 | - | 0x2260000 v0g0d0t0 | 0 |  | 5196 |
| WIDC_GUILDNAME | STATIC | 66,6,166,26 | - | 0x2260000 v0g0d0t0 |  |  | 5205 |
| WIDC_GUILDNUMBER | STATIC | 304,24,359,40 | - | 0x2260000 v0g0d0t0 | 0/0 |  | 5214 |
| WIDC_CUSTOM1 | CUSTOM | 308,46,332,70 | - | 0x260000 v0g0d0t0 | Custom |  | 5223 |
| WIDC_BUTTON4 | BUTTON | 12,262,84,282 | ButtName.BMP | 0x220010 v0g0d0t0 | Setup Guild Name | This establishes your guild's name. It can be done only once. | 5232 |

### APP_GUILD_TABMEMBER_EX — resdata.inc:14892-14948, ResData.h:603 (=698)
frame "" tile=0 size 404x300 style 0x410000 fmt 26; title ""; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_MLEVEL | BUTTON | 8,4,55,24 | ButtGuildMemberTabMLevel.bmp | 0x220010 v0g0d0t0 |  |  | 14902 |
| WIDC_JOB | BUTTON | 66,4,113,24 | ButtGuildMemberTabJob.bmp | 0x220010 v0g0d0t0 |  |  | 14911 |
| WIDC_LEVEL | BUTTON | 124,4,164,24 | ButtGuildMemberTabLevel.bmp | 0x220010 v0g0d0t0 |  |  | 14920 |
| WIDC_NAME | BUTTON | 174,4,259,24 | ButtGuildMemberTabChar.bmp | 0x220010 v0g0d0t0 |  |  | 14929 |
| WIDC_ALIAS | BUTTON | 270,4,355,24 | ButtGuildMemberTabAlias.bmp | 0x220010 v0g0d0t0 |  |  | 14938 |

### APP_GUILD_TABAPPELLATION — resdata.inc:5531-6064, ResData.h:234 (=329)
frame "" tile=0 size 404x304 style 0x410000 fmt 26; title "Guild Title Management Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 0,48,58,68 | - | 0x2260000 v0g0d0t0 | Member |  | 5541 |
| WIDC_STATIC2 | STATIC | 0,72,58,92 | - | 0x2260000 v0g0d0t0 | Title |  | 5550 |
| WIDC_STATIC3 | STATIC | 0,98,58,118 | - | 0x2260000 v0g0d0t0 | Rank |  | 5559 |
| WIDC_STATIC4 | STATIC | 0,124,58,144 | - | 0x2260000 v0g0d0t0 | Join |  | 5568 |
| WIDC_STATIC5 | STATIC | 0,150,58,170 | - | 0x2260000 v0g0d0t0 | Penya |  | 5577 |
| WIDC_STATIC6 | STATIC | 0,176,58,196 | - | 0x2260000 v0g0d0t0 | Item |  | 5586 |
| WIDC_STATIC7 | STATIC | 0,202,58,222 | - | 0x2260000 v0g0d0t0 | Pay |  | 5595 |
| WIDC_STATIC8 | STATIC | 56,8,122,26 | - | 0x2260000 v0g0d0t0 | Master |  | 5604 |
| WIDC_STATIC10 | STATIC | 254,8,320,26 | - | 0x2260000 v0g0d0t0 | Supporter |  | 5613 |
| WIDC_STATIC11 | STATIC | 320,8,386,26 | - | 0x2260000 v0g0d0t0 | Rookie |  | 5622 |
| WIDC_STATIC12 | STATIC | 188,8,254,26 | - | 0x2260000 v0g0d0t0 | Captain |  | 5631 |
| WIDC_STATIC9 | STATIC | 122,8,188,26 | - | 0x2260000 v0g0d0t0 | Kingpin |  | 5640 |
| WIDC_GUILD_PAY_MASTER | STATIC | 58,202,118,222 | - | 0x2260000 v0g0d0t0 | 0 |  | 5649 |
| WIDC_GUILD_PAY_CAPTAIN | STATIC | 190,202,250,222 | - | 0x2260000 v0g0d0t0 | 0 |  | 5658 |
| WIDC_GUILD_PAY_ROOKIE | STATIC | 322,202,382,222 | - | 0x2260000 v0g0d0t0 | 0 |  | 5667 |
| WIDC_GUILD_PAY_SUPPORTER | STATIC | 256,202,316,222 | - | 0x2260000 v0g0d0t0 | 0 |  | 5676 |
| WIDC_GUILD_PAY_KINGPIN | STATIC | 124,202,184,222 | - | 0x2260000 v0g0d0t0 | 0 |  | 5685 |
| WIDC_BUTTON1 | BUTTON | 58,224,103,244 | ButtPay.BMP | 0x220010 v0g0d0t0 | Setup | Set Master pay.(It will be paid at 00:00 automatically) | 5694 |
| WIDC_BUTTON2 | BUTTON | 124,224,169,244 | ButtPay.BMP | 0x220010 v0g0d0t0 | Setup | Set Kingpin pay.(It will be paid at 00:00 automatically) | 5703 |
| WIDC_BUTTON3 | BUTTON | 190,224,235,244 | ButtPay.BMP | 0x220010 v0g0d0t0 | Setup | Set Captain pay.(It will be paid at 00:00 automatically) | 5712 |
| WIDC_BUTTON4 | BUTTON | 256,224,301,244 | ButtPay.BMP | 0x220010 v0g0d0t0 | Setup | Set Supporter pay.(It will be paid at 00:00 automatically) | 5721 |
| WIDC_BUTTON5 | BUTTON | 322,224,367,244 | ButtPay.BMP | 0x220010 v0g0d0t0 | Setup | Set Rookie pay.(It will be paid at 00:00 automatically) | 5730 |
| WIDC_GUILD_NUM_MASTER | STATIC | 58,48,103,68 | - | 0x2260000 v0g0d0t0 | 00/00 |  | 5739 |
| WIDC_GUILD_NUM_KINGPIN | STATIC | 124,48,169,68 | - | 0x2260000 v0g0d0t0 | 00/00 |  | 5748 |
| WIDC_GUILD_NUM_CAPTAIN | STATIC | 190,48,235,68 | - | 0x2260000 v0g0d0t0 | 00/00 |  | 5757 |
| WIDC_GUILD_NUM_SUPPORTER | STATIC | 256,48,301,68 | - | 0x2260000 v0g0d0t0 | 00/00 |  | 5766 |
| WIDC_GUILD_NUM_ROOKIE | STATIC | 322,48,367,68 | - | 0x2260000 v0g0d0t0 | 00/00 |  | 5775 |
| WIDC_CHECK1 | BUTTON | 72,72,88,88 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5784 |
| WIDC_CHECK2 | BUTTON | 138,72,156,88 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5793 |
| WIDC_CHECK3 | BUTTON | 204,72,222,88 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5802 |
| WIDC_CHECK4 | BUTTON | 270,72,288,88 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5811 |
| WIDC_CHECK5 | BUTTON | 336,72,354,88 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5820 |
| WIDC_CHECK6 | BUTTON | 72,98,90,114 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5829 |
| WIDC_CHECK7 | BUTTON | 138,98,156,114 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5838 |
| WIDC_CHECK8 | BUTTON | 204,98,222,114 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5847 |
| WIDC_CHECK9 | BUTTON | 270,98,288,114 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5856 |
| WIDC_CHECK10 | BUTTON | 336,98,354,114 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5865 |
| WIDC_CHECK11 | BUTTON | 72,124,90,140 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5874 |
| WIDC_CHECK12 | BUTTON | 138,124,156,140 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5883 |
| WIDC_CHECK13 | BUTTON | 204,124,222,140 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5892 |
| WIDC_CHECK14 | BUTTON | 270,124,288,140 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5901 |
| WIDC_CHECK15 | BUTTON | 336,124,354,140 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5910 |
| WIDC_CHECK16 | BUTTON | 72,150,90,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5919 |
| WIDC_CHECK17 | BUTTON | 138,150,156,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5928 |
| WIDC_CHECK18 | BUTTON | 204,150,222,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5937 |
| WIDC_CHECK19 | BUTTON | 270,150,288,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5946 |
| WIDC_CHECK20 | BUTTON | 336,150,354,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5955 |
| WIDC_CHECK21 | BUTTON | 72,176,90,192 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5964 |
| WIDC_CHECK22 | BUTTON | 138,176,156,192 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5973 |
| WIDC_CHECK23 | BUTTON | 204,176,222,192 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5982 |
| WIDC_CHECK24 | BUTTON | 270,176,288,192 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 5991 |
| WIDC_CHECK25 | BUTTON | 336,176,354,192 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 6000 |
| WIDC_OK | BUTTON | 162,256,234,276 | ButtOk.tga | 0x220010 v0g0d0t0 | Apply Settings | Apply Settings | 6009 |
| WIDC_CUSTOM1 | CUSTOM | 70,30,86,46 | - | 0x260000 v0g0d0t0 | Custom |  | 6018 |
| WIDC_CUSTOM2 | CUSTOM | 136,30,152,46 | - | 0x260000 v0g0d0t0 | Custom |  | 6027 |
| WIDC_CUSTOM3 | CUSTOM | 202,30,218,46 | - | 0x260000 v0g0d0t0 | Custom | Custom | 6036 |
| WIDC_CUSTOM4 | CUSTOM | 268,30,284,46 | - | 0x260000 v0g0d0t0 | Custom |  | 6045 |
| WIDC_CUSTOM5 | CUSTOM | 334,30,350,46 | - | 0x260000 v0g0d0t0 | Custom | Custom | 6054 |

### APP_GUILD_TABGUILDWAR — resdata.inc:7355-7501, ResData.h:248 (=343)
frame "" tile=0 size 404x300 style 0x410000 fmt 26; title "Guild Duel"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,6,90,26 | - | 0x2260000 v0g0d0t0 | Guild Name:  |  | 7365 |
| WIDC_STATIC2 | STATIC | 6,26,106,46 | - | 0x2260000 v0g0d0t0 | Guild Logo:  |  | 7374 |
| WIDC_STATIC3 | STATIC | 6,62,106,82 | - | 0x2260000 v0g0d0t0 | Won:  |  | 7383 |
| WIDC_STATIC4 | STATIC | 6,82,106,102 | - | 0x2260000 v0g0d0t0 | Lost:  |  | 7392 |
| WIDC_STATIC5 | STATIC | 6,102,106,122 | - | 0x2260000 v0g0d0t0 | Gave Up:  |  | 7401 |
| WIDC_CUSTOM1 | CUSTOM | 98,30,122,54 | - | 0x260000 v0g0d0t0 | Custom |  | 7410 |
| WIDC_GUILDWARGUILDNAME | STATIC | 100,6,200,22 | - | 0x2260000 v0g0d0t0 |  |  | 7419 |
| WIDC_GUILDWARWIN | STATIC | 110,62,210,82 | - | 0x2260000 v0g0d0t0 |  |  | 7428 |
| WIDC_GUILDWARLOSE | STATIC | 110,82,210,102 | - | 0x2260000 v0g0d0t0 |  |  | 7437 |
| WIDC_GUILDWARGIVEUP | STATIC | 110,102,210,122 | - | 0x2260000 v0g0d0t0 |  |  | 7446 |
| WIDC_BUTTON1 | BUTTON | 24,256,96,276 | ButtGuildWar.BMP | 0x220010 v0g0d0t0 | Declare Guild Duel |  | 7455 |
| WIDC_BUTTON2 | BUTTON | 152,256,224,276 | ButtPeace.BMP | 0x220010 v0g0d0t0 | Propose Cease-fire |  | 7464 |
| WIDC_BUTTON3 | BUTTON | 272,256,344,276 | ButtGiveUp.BMP | 0x220010 v0g0d0t0 | Give Up Guild Duel |  | 7473 |
| WIDC_STATIC6 | STATIC | 6,124,106,142 | - | 0x2260000 v0g0d0t0 | Time Left |  | 7482 |
| WIDC_GUILDWARLEFTTIME | STATIC | 110,124,210,142 | - | 0x2260000 v0g0d0t0 |  |  | 7491 |

### APP_GUILD_TAPPOWER — resdata.inc:4463-4627, ResData.h:769 (=864)
frame "" tile=0 size 404x304 style 0x410000 fmt 26; title ""; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 100,30,144,46 | - | 0x2220000 v0g0d0t0 | Kingpin |  | 4473 |
| WIDC_STATIC11 | STATIC | 166,30,212,46 | - | 0x2220000 v0g0d0t0 | Captain |  | 4482 |
| WIDC_STATIC111 | STATIC | 238,30,286,46 | - | 0x2220000 v0g0d0t0 | Supporter |  | 4491 |
| WIDC_STATIC1111 | STATIC | 322,30,358,46 | - | 0x2220000 v0g0d0t0 | Rookie |  | 4500 |
| WIDC_STATIC11111 | STATIC | 8,88,64,106 | - | 0x2220000 v0g0d0t0 | Furniture |  | 4509 |
| WIDC_STATIC1111111 | STATIC | 8,148,82,164 | - | 0x2220000 v0g0d0t0 | Maintenance Fee |  | 4518 |
| WIDC_CHECK2 | BUTTON | 176,92,190,106 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4527 |
| WIDC_CHECK3 | BUTTON | 250,92,264,106 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4536 |
| WIDC_CHECK4 | BUTTON | 330,92,344,106 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4545 |
| WIDC_CHECK9 | BUTTON | 110,152,124,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4554 |
| WIDC_CHECK10 | BUTTON | 176,152,190,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4563 |
| WIDC_CHECK11 | BUTTON | 250,152,264,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4572 |
| WIDC_CHECK12 | BUTTON | 330,152,344,166 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4581 |
| WIDC_CHECK1 | BUTTON | 110,92,124,106 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 4590 |
| WIDC_BUTTON1 | BUTTON | 70,220,166,244 | ButtOk.tga | 0x220010 v0g0d0t0 | OK |  | 4599 |
| WIDC_BUTTON11 | BUTTON | 230,220,326,244 | ButtCancel.tga | 0x220010 v0g0d0t0 | CANCEL |  | 4608 |
| WIDC_STATIC111111 | STATIC | 8,106,72,124 | - | 0x2220000 v0g0d0t0 | Teleporter |  | 4617 |

### APP_GUILD_INVATE — resdata.inc:6944-7000, ResData.h:252 (=347)
frame "WndTile08.tga" tile=1 size 240x144 style 0x2410000 fmt 26; title "Invite to Guild"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_OK | BUTTON | 36,82,108,102 | ButtYes.tga | 0x220010 v0g0d0t0 | YES |  | 6954 |
| WIDC_NO | BUTTON | 120,82,192,102 | ButtNo.tga | 0x220010 v0g0d0t0 | NO |  | 6963 |
| WIDC_STATIC1 | STATIC | 30,34,192,52 | - | 0x2260000 v0g0d0t0 | Guild is inviting you. |  | 6972 |
| WIDC_STATIC2 | STATIC | 30,56,190,74 | - | 0x2260000 v0g0d0t0 | Will you join the Guild? |  | 6981 |
| WIDC_STATIC3 | STATIC | 32,12,192,28 | - | 0x2220000 v0g0d0t0 |  |  | 6990 |

### APP_GUILDNAME — resdata.inc:7502-7549, ResData.h:250 (=345)
frame "WndTile06.tga" tile=1 size 272x128 style 0x2410000 fmt 26; title "Guild Name Setup Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_EDIT1 | EDITCTRL | 8,36,252,56 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7512 |
| WIDC_STATIC1 | STATIC | 42,10,206,28 | - | 0x2260000 v0g0d0t0 | Enter the guild name. |  | 7521 |
| WIDC_OK | BUTTON | 46,68,118,88 | ButtOk.tga | 0x220010 v0g0d0t0 | OK |  | 7530 |
| WIDC_CANCEL | BUTTON | 130,68,202,88 | ButtCancel.tga | 0x220010 v0g0d0t0 | CANCEL |  | 7539 |

### APP_GUILD_NICKNAME — resdata.inc:7550-7597, ResData.h:254 (=349)
frame "WndTile08.tga" tile=1 size 272x128 style 0x2410000 fmt 26; title "Setup Guild Title"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_OK | BUTTON | 48,66,120,86 | ButtOk.tga | 0x220010 v0g0d0t0 | OK |  | 7560 |
| WIDC_CANCEL | BUTTON | 130,64,202,84 | ButtCancel.tga | 0x220010 v0g0d0t0 | Cancel |  | 7569 |
| WIDC_STATIC1 | STATIC | 44,12,246,30 | - | 0x2260000 v0g0d0t0 | Enter Title |  | 7578 |
| WIDC_EDIT1 | EDITCTRL | 40,36,224,55 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7587 |

### APP_GUILD_NOTICE — resdata.inc:3254-3301, ResData.h:218 (=313)
frame "WndTile07.tga" tile=1 size 320x240 style 0x2410000 fmt 26; title "Guild Notice Setup Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_BUTTON1 | BUTTON | 28,182,100,202 | ButtNoticeNew.BMP | 0x220010 v1g1d1t1 | New Notice | Write new Guild Notice. | 3264 |
| WIDC_BUTTON2 | BUTTON | 116,182,188,202 | ButtNoticeStart.BMP | 0x220010 v1g0d0t0 | Open Notice | Open the Notice, and send it to other characters. | 3273 |
| WIDC_BUTTON3 | BUTTON | 204,182,276,202 | ButtNoticeEdit.BMP | 0x220010 v0g0d0t0 | Modify Notice | Modify a Notice. | 3282 |
| WIDC_EDIT1 | EDITCTRL | 6,6,308,176 | WndEditTile00.tga | 0x20020000 tile v0g0d0t0 |  |  | 3291 |

### APP_GUILD_SETLOGO — resdata.inc:3302-3349, ResData.h:220 (=315)
frame "WndTile07.tga" tile=1 size 208x240 style 0x2410000 fmt 26; title "Guild Logo Setup Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_OK | BUTTON | 18,150,90,170 | ButtOk.tga | 0x220010 v0g0d0t0 | Setup Logo |  | 3312 |
| WIDC_CANCEL | BUTTON | 100,150,172,170 | ButtCancel.tga | 0x220010 v0g0d0t0 | Cancel |  | 3321 |
| WIDC_STATIC1 | STATIC | 12,10,182,144 | WndEditTile00.tga | 0x2220002 tile v0g0d0t0 |  |  | 3330 |
| WIDC_BUTTON1 | BUTTON | 66,180,124,200 | - | 0x220010 v0g0d0t0 | GM Logo |  | 3339 |

### APP_GUILD_DISMISS — resdata.inc:6065-6112, ResData.h:237 (=332)
frame "WndTile08.tga" tile=1 size 288x128 style 0x2410000 fmt 26; title "Disband Guild Confirmation Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_EDIT1 | EDITCTRL | 10,10,266,62 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 6075 |
| WIDC_YES | BUTTON | 52,70,124,90 | ButtYes.tga | 0x220010 v0g0d0t0 | Yes |  | 6084 |
| WIDC_NO | BUTTON | 136,70,208,90 | ButtNo.tga | 0x220010 v0g0d0t0 | No |  | 6093 |
| WIDC_STATIC1 | STATIC | 44,24,244,44 | - | 0x2260000 v0g0d0t0 | Do you want to disband the guild? |  | 6102 |

### APP_GUILD_LEAVE (no class uses it) — resdata.inc:6896-6943, ResData.h:256 (=351)
frame "WndTile08.tga" tile=1 size 288x128 style 0x2410000 fmt 26; title "Leave Guild"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_NO | BUTTON | 146,70,218,90 | ButtNo.tga | 0x220010 v0g0d0t0 | No |  | 6906 |
| WIDC_YES | BUTTON | 60,70,132,90 | ButtYes.tga | 0x220010 v0g0d0t0 | Yes |  | 6915 |
| WIDC_EDIT1 | EDITCTRL | 10,10,266,62 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 6924 |
| WIDC_STATIC1 | STATIC | 68,24,250,44 | - | 0x2260000 v0g0d0t0 | Do you want to leave Guild? |  | 6933 |

### APP_GUILD_PAYCONFIRM — resdata.inc:7001-7057, ResData.h:243 (=338)
frame "WndTile08.tga" tile=1 size 288x144 style 0x2410000 fmt 26; title "Setup Pay per Title"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_YES | BUTTON | 42,78,114,98 | ButtOk.tga | 0x220010 v0g0d0t0 | OK |  | 7011 |
| WIDC_NO | BUTTON | 144,78,216,98 | ButtCancel.tga | 0x220010 v0g0d0t0 | Cancel |  | 7020 |
| WIDC_STATIC1 | STATIC | 38,12,232,30 | - | 0x2260000 v0g0d0t0 | What amount will you set for payment? |  | 7029 |
| WIDC_STATIC2 | STATIC | 44,46,86,64 | - | 0x2260000 v0g0d0t0 | Amount |  | 7038 |
| WIDC_EDIT1 | EDITCTRL | 90,46,210,64 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7047 |

### APP_GUILD_MERIT1 — resdata.inc:3038-3112, ResData.h:484 (=579)
frame "WndTile00.tga" tile=1 size 272x224 style 0x2410000 fmt 26; title "Guild Contributing Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC3 | STATIC | 8,8,108,28 | - | 0x2220000 v0g0d0t0 | Quest Items |  | 3048 |
| WIDC_CHECK2 | BUTTON | 92,10,110,26 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 3057 |
| WIDC_LISTBOX1 | LISTBOX | 10,28,252,134 | WndEditTile00.tga | 0x20020000 tile v0g0d0t0 |  |  | 3066 |
| WIDC_STATIC2 | STATIC | 8,139,74,157 | - | 0x2220000 v0g0d0t0 | Penya |  | 3075 |
| WIDC_EDIT1 | EDITCTRL | 70,140,222,158 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 3084 |
| WIDC_BUTTON1 | BUTTON | 50,166,122,186 | ButtYes.tga | 0x220010 v0g0d0t0 | Button |  | 3093 |
| WIDC_BUTTON2 | BUTTON | 138,166,210,186 | ButtNo.tga | 0x220010 v0g0d0t0 | Button |  | 3102 |

### APP_GUILD_MERIT (unused in V15) — resdata.inc:7133-7225, ResData.h:244 (=339)
frame "WndTile07.tga" tile=1 size 272x256 style 0x2410000 fmt 26; title "Guild Contribute Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_EDIT1 | EDITCTRL | 82,168,234,186 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7143 |
| WIDC_STATIC1 | STATIC | 8,8,74,26 | - | 0x2260000 v0g0d0t0 | Contributed Items |  | 7152 |
| WIDC_CHECK1 | BUTTON | 92,14,110,30 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 7161 |
| WIDC_STATIC2 | STATIC | 16,166,82,184 | - | 0x2260000 v0g0d0t0 | Contributed Penya |  | 7170 |
| WIDC_BUTTON1 | BUTTON | 58,196,130,216 | ButtYes.tga | 0x220010 v0g0d0t0 | YES |  | 7179 |
| WIDC_BUTTON2 | BUTTON | 142,196,214,216 | ButtNo.tga | 0x220010 v0g0d0t0 | NO |  | 7188 |
| WIDC_STATIC3 | STATIC | 8,28,108,48 | - | 0x2260000 v0g0d0t0 | Contribute Quest Items |  | 7197 |
| WIDC_CHECK2 | BUTTON | 92,32,110,48 | ButtCheck.bmp | 0x220018 v0g0d0t0 |  |  | 7206 |
| WIDC_LISTBOX1 | LISTBOX | 10,54,252,160 | WndEditTile00.tga | 0x20020000 tile v0g0d0t0 |  |  | 7215 |

### APP_RANK_GUILD — resdata.inc:10244-10264, ResData.h:283 (=378)
frame "WndTile07.tga" tile=1 size 464x384 style 0x2410000 fmt 26; title "Guild Ranking Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_TABCTRL1 | TABCTRL | 10,6,462,344 | - | 0x260000 v0g0d0t0 |  |  | 10254 |

### APP_RANK_GUILDTABBEST — resdata.inc:8540-8605, ResData.h:262 (=357)
frame "" tile=0 size 452x338 style 0x410000 fmt 26; title "Best Guild"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,4,64,24 | - | 0x2260000 v0g0d0t0 | Ranking |  | 8550 |
| WIDC_STATIC3 | STATIC | 68,4,200,24 | - | 0x2260000 v0g0d0t0 | Guild Name |  | 8559 |
| IDS_RESDATA_INC_000811 | STATIC | 216,4,340,24 | - | 0x2260000 v0g0d0t0 | Guild Master Name |  | 8568 |
| IDS_RESDATA_INC_000813 | STATIC | 344,4,384,24 | - | 0x2260000 v0g0d0t0 | Win |  | 8577 |
| WIDC_STATIC6 | STATIC | 374,4,394,24 | - | 0x2260000 v0g0d0t0 | / |  | 8586 |
| WIDC_STATIC7 | STATIC | 390,4,430,24 | - | 0x2260000 v0g0d0t0 | Lose |  | 8595 |

### APP_RANK_GUILDTABUNITED — resdata.inc:8606-8671, ResData.h:264 (=359)
frame "" tile=0 size 452x338 style 0x410000 fmt 26; title "Maximum Unity"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,4,64,24 | - | 0x2260000 v0g0d0t0 | Ranking |  | 8616 |
| WIDC_STATIC2 | STATIC | 68,4,200,24 | - | 0x2260000 v0g0d0t0 | Guild Name |  | 8625 |
| WIDC_STATIC3 | STATIC | 216,4,340,24 | - | 0x2260000 v0g0d0t0 | Guild Master Name |  | 8634 |
| WIDC_STATIC4 | STATIC | 344,4,384,24 | - | 0x2260000 v0g0d0t0 | Win |  | 8643 |
| WIDC_STATIC5 | STATIC | 374,4,394,24 | - | 0x2260000 v0g0d0t0 | / |  | 8652 |
| WIDC_STATIC6 | STATIC | 390,4,430,24 | - | 0x2260000 v0g0d0t0 | Lose |  | 8661 |

### APP_RANK_GUILDTABPENYA — resdata.inc:8672-8710, ResData.h:266 (=361)
frame "" tile=0 size 452x338 style 0x410000 fmt 26; title "Maximum Wealth"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,4,64,24 | - | 0x2260000 v0g0d0t0 | Ranking |  | 8682 |
| WIDC_STATIC2 | STATIC | 68,4,200,24 | - | 0x2260000 v0g0d0t0 | Guild Name |  | 8691 |
| WIDC_STATIC3 | STATIC | 216,4,340,24 | - | 0x2260000 v0g0d0t0 | Guild Master Name |  | 8700 |

### APP_GUILD_VOTE — resdata.inc:5321-5530, ResData.h:226 (=321)
frame "WndTile07.tga" tile=1 size 352x368 style 0x2410000 fmt 26; title "Voting Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_COMBOBOX1 | COMBOBOX | 10,8,330,28 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 5331 |
| WIDC_EDIT1 | EDITCTRL | 10,34,330,178 | WndEditTile00.tga | 0x20000 tile v0g0d1t0 |  |  | 5340 |
| WIDC_EDIT2 | EDITCTRL | 46,214,308,233 | WndEditTile00.tga | 0x20000 tile v0g0d1t0 |  |  | 5349 |
| WIDC_EDIT4 | EDITCTRL | 46,190,308,209 | WndEditTile00.tga | 0x20000 tile v0g0d1t0 |  |  | 5358 |
| WIDC_EDIT5 | EDITCTRL | 46,238,308,257 | WndEditTile00.tga | 0x20000 tile v0g0d1t0 |  |  | 5367 |
| WIDC_EDIT3 | EDITCTRL | 46,262,308,281 | WndEditTile00.tga | 0x20000 tile v0g0d1t0 |  |  | 5376 |
| WIDC_VOTE_SETTING | BUTTON | 178,306,250,326 | ButtSetVote.BMP | 0x220010 v0g0d0t0 | Setup Vote |  | 5385 |
| WIDC_VOTE | BUTTON | 88,306,160,326 | ButtVote.BMP | 0x220010 v0g0d0t0 | Vote |  | 5394 |
| WIDC_RADIO1 | BUTTON | 12,194,27,210 | ButtRadio.bmp | 0x220014 v0g0d0t0 |  |  | 5403 |
| WIDC_RADIO2 | BUTTON | 12,218,27,234 | ButtRadio.bmp | 0x220014 v0g0d0t0 |  |  | 5412 |
| WIDC_RADIO3 | BUTTON | 12,244,27,260 | ButtRadio.bmp | 0x220014 v0g0d0t0 |  |  | 5421 |
| WIDC_RADIO4 | BUTTON | 12,268,27,284 | ButtRadio.bmp | 0x220014 v0g0d0t0 |  |  | 5430 |
| WIDC_STATIC1 | STATIC | 26,188,46,204 | - | 0x2260000 v0g0d0t0 | 1 |  | 5439 |
| WIDC_STATIC2 | STATIC | 28,214,48,230 | - | 0x2260000 v0g0d0t0 | 2 |  | 5448 |
| WIDC_STATIC3 | STATIC | 28,238,48,254 | - | 0x2260000 v0g0d0t0 | 3 |  | 5457 |
| WIDC_STATIC4 | STATIC | 28,262,48,278 | - | 0x2260000 v0g0d0t0 | 4 |  | 5466 |
| WIDC_STATIC5 | STATIC | 308,190,328,206 | - | 0x2260000 v0g0d0t0 | 0 |  | 5475 |
| WIDC_STATIC6 | STATIC | 308,214,328,230 | - | 0x2260000 v0g0d0t0 | 0 |  | 5484 |
| WIDC_STATIC7 | STATIC | 308,238,328,254 | - | 0x2260000 v0g0d0t0 | 0 |  | 5493 |
| WIDC_STATIC8 | STATIC | 308,262,328,278 | - | 0x2260000 v0g0d0t0 | 0 |  | 5502 |
| WIDC_STATIC9 | STATIC | 244,282,304,302 | - | 0x2260000 v0g0d0t0 | Total Vote |  | 5511 |
| WIDC_STATIC10 | STATIC | 308,282,328,302 | - | 0x2260000 v0g0d0t0 | 0 |  | 5520 |

### APP_GUILD_VOTESETING — resdata.inc:7226-7354, ResData.h:246 (=341)
frame "WndTile07.tga" tile=1 size 352x352 style 0x2410000 fmt 26; title "Setup Vote Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_EDIT1 | EDITCTRL | 10,8,330,27 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7236 |
| WIDC_EDIT2 | EDITCTRL | 14,32,326,176 | WndEditTile00.tga | 0x20020000 tile v0g0d0t0 |  |  | 7245 |
| WIDC_EDIT3 | EDITCTRL | 48,188,310,207 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7254 |
| WIDC_EDIT4 | EDITCTRL | 48,260,310,279 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7263 |
| WIDC_EDIT5 | EDITCTRL | 48,212,310,231 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7272 |
| WIDC_EDIT6 | EDITCTRL | 48,236,310,255 | WndEditTile00.tga | 0x20000 tile v0g0d0t0 |  |  | 7281 |
| WIDC_STATIC1 | STATIC | 26,188,46,204 | - | 0x2260000 v0g0d0t0 | 1 |  | 7290 |
| WIDC_STATIC2 | STATIC | 26,212,46,228 | - | 0x2260000 v0g0d0t0 | 2 |  | 7299 |
| WIDC_STATIC3 | STATIC | 26,236,46,252 | - | 0x2260000 v0g0d0t0 | 3 |  | 7308 |
| WIDC_STATIC4 | STATIC | 26,260,46,276 | - | 0x2260000 v0g0d0t0 | 4 |  | 7317 |
| WIDC_VOTE_CLEAR | BUTTON | 44,286,116,306 | ButtVoteClear.BMP | 0x220010 v0g0d0t0 | Delete |  | 7326 |
| WIDC_VOTE_START | BUTTON | 136,286,208,306 | ButtVoteStart.BMP | 0x220010 v0g0d0t0 | Start Vote |  | 7335 |
| WIDC_VOTE_FINISH | BUTTON | 228,286,300,306 | ButtVoteEnd.BMP | 0x220010 v0g0d0t0 | End Vote |  | 7344 |

### APP_GUILD_TABMEMBER (pre-v12 member tab, unused in V15) — resdata.inc:5264-5320, ResData.h:232 (=327)
frame "" tile=0 size 332x300 style 0x410000 fmt 26; title "Member Window"; help ""
| ctrl id | type | rect (l,t,r,b) | picture | style | text | tooltip | line |
|---|---|---|---|---|---|---|---|
| WIDC_STATIC1 | STATIC | 6,4,48,24 | - | 0x2260000 v0g0d0t0 | Title |  | 5274 |
| WIDC_STATIC2 | STATIC | 50,4,92,24 | - | 0x2260000 v0g0d0t0 | Job |  | 5283 |
| WIDC_STATIC3 | STATIC | 138,4,218,24 | - | 0x2260000 v0g0d0t0 | Character Name |  | 5292 |
| WIDC_STATIC4 | STATIC | 96,4,148,24 | - | 0x2260000 v0g0d0t0 | Level |  | 5301 |
| WIDC_STATIC5 | STATIC | 234,4,314,24 | - | 0x2260000 v0g0d0t0 | Nick Name |  | 5310 |

