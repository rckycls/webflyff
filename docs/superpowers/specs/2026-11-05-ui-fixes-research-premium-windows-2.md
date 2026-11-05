# Premium windows 2: the confirm and summon windows as Neuz draws them (V15 research, 2026-11-05)

What the builder needs to rebuild, from `resdata.inc`, these Neuz windows that the web client shows today as
`MessageBox` prompts: the party summon (3 windows), the friend summon (2), `CWndCommItemDlg`, `CWndRestateConfirm`,
`CWndSmeltSafetyConfirm`, the random scroll confirm, `CWndFunnyCoinConfirm`, `CWndConfirmVis` (Awakening Protection), and
the hammer cursor. Their packets are already known and built (`2026-11-05-item-windows-research.md`,
`2026-11-05-buffs-premium-research.md`), so this file covers only the windows.

Paths: source files are under `Source/`, resource files under `Resource/`, client files under `Client/` (all in
`Blouflash VS22 V15`). `resdata.inc` is now plain ASCII (CRLF), not UTF-16, so the line numbers are those of the file
as it is. Texts: `Resource/resData.txt.txt` (IDS_RESDATA_INC_*) and `Resource/textClient.inc` / `textClient.txt.txt`
(UTF-16; TID ids in `Resource/defineText.h`).

**Flags.** Checked in `Neuz/VersionCommon.h` (CP949). `__MAINSERVER` is defined at line 3, so the `__INTERNALSERVER` block
(:261-405) is off. That means `__IMPROVE_MAP_SYSTEM` (:390) is **off**. Flags used here that are on: `__VER 15` (:4),
`__SYS_TICKET` (:91), `__RT_1025` (:94, the messenger), `__AZRIA_1023` (:151), `__FUNNY_COIN` (:160), `__SMELT_SAFETY`
(:172), `__IMPROVE_QUEST_INTERFACE` (:201), `__PETVIS` (:204), `__15_5TH_ELEMENTAL_SMELT_SAFETY` (:225),
`__ADD_RESTATE_LOW` (:235), `__PROTECT_AWAKE` (:251). The blocks `__VER >= 14` (`__RESTATE_CONFIRM`, `__SMELT_SAFETY`)
and `__VER >= 15` are on too.

**None of these classes is a `CWndMessageBox` subclass.** Every one is a `CWndNeuz` built from its own `resdata.inc`
entry. Awakening Protection's `CWndConfirmVis` uses `APP_CONFIRM_ENTER`, not `APP_MESSAGEBOX`, so the port's
`messageBox.ts` layout does not apply to any of them.

---

## 0. Rules shared by every window below

### 0.1 The resdata.inc entry

`CResManager::Load` (`_Common/ResManager.cpp:76-160`) reads an entry this way:

- **Window line:** `APP_ID "picture" tile width height style d3dformat`, then a title block `{ IDS }`, a help-key block
  `{ IDS }`, and the controls in `{ }`.
- **Control line:** `WTYPE_x WIDC_x "picture" tile left top right bottom style visible group disabled tabstop`, then a title
  block and a tooltip block.
- **The last four numbers:** `CWndNeuz::CreateControl` (`_Interface/WndNeuz.cpp:562-647`) ignores them, except `group`
  for buttons. The `-858993460` (0xCCCCCCCC) on the friend summon's combo box is uninitialised data and means nothing.

| Item | What it means |
|---|---|
| Window style `0x2410000` | `WBS_CAPTION 0x02000000 \| WBS_SOUND 0x00400000 \| WBS_MOVE 0x00010000` (`Resource/WndStyle.h`). A title bar that drags. `WBS_SOUND` does nothing (its uses are commented out, `_Interface/WndBase.cpp:340, 403, 438`). **Not `WBS_MODAL`**: the world and other windows still take input. Only `CWndConfirmVis` adds `WBS_MODAL` itself. |
| Help button | Only when the help key is not empty (`WndNeuz.cpp:675`). Every help key here is empty, so there is no "?" button. |
| Close button | Every caption window has `ButtWndExit.tga` at the right of its title bar (`WndNeuz.cpp:75-90`; none of these classes sets `m_bNoCloseButton`). |
| Frame | `tile 1` means the 12 tiles `WndTile00..11.tga` (16 x 16). The tile name is the picture's name less its last 6 characters, plus 00..11 (`WndNeuz.cpp:274-279`), so **`"WndTile08.tga"` (the random scroll box) gives the same 12 tiles as `WndTile00.tga`**. Tiled sizes round up to 16 (`WndNeuz.cpp:498-510`); every size here is already a multiple of 16. |
| Client area | For a caption window: `(4, 22)` to `(w-8, h-10)` (`CWndBase::SetWndRect`, `WndBase.cpp:1847-1853`). **Control rects and `OnDraw` coordinates are relative to this client area** (as in `selectVillageWindow.ts`). |
| Text control style `0x20000` | `WBS_CHILD`. |
| Text control style `0x20020000` | `WBS_CHILD \| WBS_VSCROLL 0x20000000`: the text has a vertical scroll bar. |
| Button style `0x220010` | `WBS_NOFRAME \| WBS_CHILD \| WBS_HIGHLIGHT`. |
| Static style `0x2220000` | `WBS_CAPTION \| WBS_NOFRAME \| WBS_CHILD`: a plain label. |
| Static style `0x2220001` | The same, plus `WSS_GROUPBOX 0x1`. |

### 0.2 How each control type draws

| Control | How Neuz draws it |
|---|---|
| Picture button (`ButtOk/ButtCancel/ButtYes/ButtNo.tga`, 288 x 20) | Four frames of 72 x 20, left to right: 0 = mouse over, 1 = normal, 2 = pushed, 3 = disabled (`CTheme::RenderWndButton_4Texture`, `_Interface/ITheme.cpp:1336-1413`). The resdata title "Button" is **not** drawn (`RenderWndButton` returns after the texture, `ITheme.cpp:1285-1289`). This is the port's `pictureButton` with a quarter of 72. |
| Text (`WTYPE_TEXT`, `CWndText`), picture `WndEditTile00.tga` tile 1 | **Background:** the nine edit tiles laid over the control rect. Columns = floor(w/8); rows = floor(h/8). With `WBS_VSCROLL` the tiles stop 16 px short of the right edge (`WndBase.cpp:2575-2620`). This is the port's `editTiles(doc, art, columns, rows)`. **Words:** inset 6 px on every side (`m_ptDeflateRect (6,6)`, `_Interface/WndControl.cpp:2555, 2595-2603`), and another 15 px off the right with `WBS_VSCROLL`. Colour **black 0xff000000**: `SetString`/`AddString` default to it (`WndControl.h:422-423`); the TID's own colour in textClient.inc is used only by `PutString`, not here. Line pitch = font max height + 5 (`m_nLineSpace 5`, `WndControl.cpp:2545`; `GetFontHeight`, `WndControl.h:410`). Word wrap in English. A literal `\n` in a text is a line break (`CEditString::ParsingString`, `_Common/EditString.cpp:423-431`). Without a scroll bar, only `(wordsHeight + 5) / (font + 5)` lines are drawn and **extra lines are cut** (`GETRANGE`, `WndControl.cpp:25`). |
| Edit (`WTYPE_EDITCTRL`, `CWndEdit`) | **Background:** the same tiles. **Words:** inset 3 px on the left, top and right, 0 px at the bottom (`_Interface/WndEditCtrl.cpp:1317-1326`). It **wraps at any character, not at words** (`m_string.m_bWordAlign = FALSE`, `WndEditCtrl.cpp:1209`; `CEditString::Align`). Line pitch is font + 5. It has a caret when it has focus. |
| Plain static (`0x2220000`, picture `""`) | No background (`CWndStatic::Create` clears the picture, `WndControl.cpp:44-53`). Its title in **blue 0xff2e70a9**, in the theme's text font, at (2, 2) in the rect, drawn twice at x and x+1, which makes it bold (`WndControl.cpp:140-205`). |
| Group-box static (`0x2220001`, a picture) | Its picture tiled like the edit tiles. Its title in **white 0xffffffff**, at (4, 4) (y moves up if the font is taller than 14 px), drawn twice at x and x+1 (`WndControl.cpp:54-98`). |
| Vertical scroll bar (texts with `WBS_VSCROLL`) | Docked on the text's right 16 px (`VSCROLL_WIDTH 16`, `WndControl.cpp:23, 2585-2590`). The height is rounded down to a multiple of 4. `ButtVScrUp.tga` (64 x 16: four 16 x 16 frames like a button) sits at the top and `ButtVScrDown.tga` at the bottom. `ButtVScrBar.bmp` (16 x 4) is stretched between them (`PaintFrame` `WndControl.cpp:1599-1608`, `OnInitialUpdate` :1651-1678, `OnSize` :1787-1796). The thumb is drawn only when there are more lines than fit: `ButtVScrPUp.bmp` + `ButtVScrPBar.bmp` stretched + `ButtVScrPDown.bmp`, each 16 x 4, at least 6 px tall (`OnDraw`, `WndControl.cpp:1610-1648`). The .bmp files use magenta 0xffff00ff as the transparent colour. **The port has no scroll bar yet.** |

### 0.3 Placement and closing

| What | Neuz behaviour |
|---|---|
| Placement | Each window here ends with `MoveParentCenter()`, which centres it on the whole screen (`WndBase.cpp:1805-1816`). Some first call `Move(rootRight - width, 110)`, but the centring overwrites it. |
| Title bar close button | `WTBID_CLOSE` goes to `CWndNeuz::OnChildNotify`, which calls `Destroy()` (`WndNeuz.cpp:392-409`), unless the class acts on every child message first (noted per window). **No packet is sent.** |
| Escape | `CWndMgr::Process` (`_Interface/WndManager.cpp:3296-3420`): Escape first drops the selected target if there is one. Otherwise it `Destroy()`s the topmost visible window (`CWndBase::GetWndBase()`, `WndBase.cpp:2048-2060`). No button handler runs, so **no packet is sent**, but `OnDestroy` still runs (`WndBase.cpp:1711-1736`). |
| Enter | Does nothing in these windows, except `CWndConfirmVis`, whose hidden edit box makes Enter act as OK. `CNeuzApp::KillWindow` (`Neuz/Neuz.cpp:1495-1524`) handles only `APP_STATE_CONFIRM`. |
| Icons | **No item icon in any of them except `CWndSummonPartyMsg`** (§1.2). Every other class has an empty or no `OnDraw`. |

---

## 1. Party summon

**Flow:**

1. The leader uses the scroll (26202, `II_SYS_SYS_SCR_PARTYSUMMON`) from the bag or the task bar. A non-leader gets
   `TID_GAME_TROUPECREATE` in chat instead.
2. `APP_SUMMON_PARTY` opens; OK sends SUMMON_PARTY.
3. Each member gets SUMMON (`SOMMON_PARTY_CONFIRM`), which opens `APP_MESSAGEBOX_SUMMONPARTY`, an information box with OK
   only.
4. The member double-clicks the summon buff icon on the world screen, which opens `APP_SUMMON_PARTY_USE`; OK sends
   SUMMON_PARTY_CONFIRM.

### 1.1 `APP_SUMMON_PARTY`: `CWndSummonParty`, the leader's question

**resdata.inc:27768-27806.** `"WndTile00.tga"` tile 1, **288 x 224**, style 0x2410000. Title `IDS_RESDATA_INC_003652`
"**Summon Party**" (resData.txt.txt:3653). Help key empty.

| Line | Type | Id | Picture | Rect (l t r b) | Style | Text |
|---|---|---|---|---|---|---|
| 27778 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 12 8 268 152 | 0x20000 | set by code. Tiles 32 x 18; words box (18,14)-(262,146). |
| 27787 | button | WIDC_CANCEL | ButtCancel.tga | 160 164 232 184 | 0x220010 | "Button" (not drawn) |
| 27796 | button | WIDC_OK | ButtOk.tga | 46 164 118 184 | 0x220010 | "Button" (not drawn) |

Class: `_Interface/WndSummonFriend.cpp:322-414` and `WndSummonFriend.h:62-79`.

- **Opens** from `CDPClient::SendDoUseItem` (`Neuz/DPClient.cpp:10777-10792`). This is reached from the bag
  double-click and from the task bar, both with `bResult` TRUE.
  - Not the leader (`g_Party.IsLeader`): `TID_GAME_TROUPECREATE` "Only the party leader can use this function." in
    chat, and no window.
  - Otherwise it **reuses the open window** (`GetWndBase(APP_SUMMON_PARTY)`), or creates one, then calls
    `SetData((WORD)itemObjId, 0)`.
- **OnInitialUpdate** (:338-350): `m_dwData = 0`; centred.
- **SetData** (:405-414): `m_dwData = MAKELONG(itemObjId, 0)`. TEXT1 = `TID_GAME_SUMMONPARTY` formatted with
  `g_pPlayer->GetWorld()->m_szWorldName` (the port's `worldName()`; the earlier ruling is Madrigal / Azria / Coral
  Island).
- **OnDraw:** empty, so no icon.
- **OnChildNotify** (:371-404):
  - **OK:** if the scroll with object id `LOWORD(m_dwData)` is still in the bag, `SendSummonParty(m_dwData)`
    (SUMMON_PARTY 0xf000e003). Else the chat line `TID_ERROR_SUMMONPARTY_NOITEM` with item 26202's name. **Then it
    closes in both cases.**
  - **Cancel:** closes.
- The close button and Escape close it.

Text (`TID_GAME_SUMMONPARTY`, defineText.h:1631 = 2805, textClient.inc:6497, textClient.txt.txt:1300; `\n` = line
break, kept verbatim with its typos):
`You can summon party members.\nThey should be in the same area(%s),\nThe area can't be event arean(Clockwork).\nIf party
leader move to other area(dungeon)\nmember can't be summoned.\nIt will be activated for a minute.\nWould you like to
request the summons?`

`TID_ERROR_SUMMONPARTY_NOITEM` (1632 = 2806, txt:1301, chat colour 0xffff0000): `You can not summon without %s.`
Item 26202's name is "Summon of Party Leader" (propItem.txt.txt:4739).

### 1.2 `APP_MESSAGEBOX_SUMMONPARTY`: `CWndSummonPartyMsg`, each member's notice

**resdata.inc:28248-28295.** `"WndTile00.tga"` tile 1, **320 x 224**, style 0x2410000. Title `IDS_RESDATA_INC_003548`
"**Summon P. Members**" (resData.txt.txt:3549). **No Cancel button**, although the header comment lists one.

| Line | Type | Id | Picture | Rect | Style | Text |
|---|---|---|---|---|---|---|
| 28258 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 10 8 298 74 | 0x20000 | set by code. Tiles 36 x 8; words (16,14)-(292,68). |
| 28267 | button | WIDC_OK | ButtOk.tga | 126 164 198 184 | 0x220010 | (not drawn) |
| 28276 | text | WIDC_TEXT2 | WndEditTile00.tga tile 1 | 50 106 300 154 | 0x20000 | set by code. Tiles 31 x 6; words (56,112)-(294,148), which holds 2 lines. |
| 28285 | static (group box) | WIDC_STATIC1 | **WndEditTile200.tga** tile 1 | 8 82 296 98 | 0x2220001 | `IDS_RESDATA_INC_003556` "**How to Use**" (resData.txt.txt:3557), white, bold, at (4,4). Tiles 36 x 2 from `WndEditTile200..208`. |

Class: `WndSummonFriend.cpp:231-321` and `WndSummonFriend.h:43-60`.

- **Opens** from `CDPClient::OnSummonPartyConfirm` (`DPClient.cpp:16138-16155`; SUMMON with state
  `SOMMON_PARTY_CONFIRM`: `OBJID leader, DWORD data, string world` of up to 256). It reuses the open window or creates
  one, then calls `SetData(objid, data, world)`.
- **OnInitialUpdate** (:257-271): loads the icon of item 26202 from `Item\` with colour key magenta 0xffff00ff
  (`Itm_SysSysScrPartycome.dds`, 32 x 32); centred.
- **OnDraw** (:250-256): `RenderTexture( CPoint(12, 116), icon, alpha 255 )`. That puts **the scroll's 32 x 32 icon
  at client (12,116)-(44,148)**, left of TEXT2 and under the "How to Use" strip.
- **SetData** (:304-321):
  - Stores the leader's object id, the data and the world name in `g_Neuz.m_dwSummonPartyObjid / m_dwSummonPartyData /
    m_szSummonPartyWorldName`. These are what §1.3 uses later.
  - TEXT1 = `TID_DIAG_SUMMONPARTY_CONFIRM` with `g_Party.m_sParty`, the party's name. It is empty for an unnamed party
    (`_Common/Party.cpp:54, 79`), so the text then begins " Party has asked ...".
  - TEXT2 = `TID_DIAG_SUMMONPARTY_CONFIRM_USE` with item 26202's name.
- **OnChildNotify** (:292-303): OK closes. Nothing is sent. The close button and Escape close it too.

Texts:
- `TID_DIAG_SUMMONPARTY_CONFIRM` (1633 = 2807, txt:1302): `%s Party has asked to summon you. \nYou will be summoned to
  the Party Leader.\n You have one minute to decide.`
- `TID_DIAG_SUMMONPARTY_CONFIRM_USE` (1644 = 2819, txt:1303): `If you click the icon(%s) on the upper of the right
  \nyou will be teleported to the leader.`
  - With "Summon of Party Leader" the first line wraps, so in Neuz the last line may not fit in TEXT2's 2 lines and is
    cut.

### 1.3 `APP_SUMMON_PARTY_USE`: `CWndSummonPartyUse`, the member's "teleport?" question

**resdata.inc:27663-27701.** `"WndTile00.tga"` tile 1, **288 x 144**, style 0x2410000. Title `IDS_RESDATA_INC_003674`
"**Summon P. Members**" (resData.txt.txt:3675).

| Line | Type | Id | Picture | Rect | Style | Text |
|---|---|---|---|---|---|---|
| 27673 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 8 8 264 72 | 0x20000 | set by code. Tiles 32 x 8; words (14,14)-(258,66). |
| 27682 | button | WIDC_OK | ButtOk.tga | 48 80 120 100 | 0x220010 | |
| 27691 | button | WIDC_CANCEL | **"Buttcancel.tga"** (lower-case c; it is `ButtCancel.tga`) | 162 80 234 100 | 0x220010 | |

Class: `WndSummonFriend.cpp:416-494`.

- **Opens** from `CWndWorld::OnLButtonDblClk` (`_Interface/WndWorld.cpp:7268-7279`): a double-click on the world
  screen's buff icon of item 26202 (`GetBuffIconRect`).
  - Nothing happens if `g_Neuz.m_dwSummonPartyObjid` is 0 (no notice yet) or is the player's own id.
  - Nothing happens if the window is already open.
- **OnInitialUpdate** (:432-447): TEXT1 = `TID_DIAG_SUMMONPARTY_USE` with `g_Neuz.m_szSummonPartyWorldName`; centred.
- **OnDraw:** empty.
- **OnChildNotify** (:478-494):
  - **OK:** `SendSummonPartyConfirm(m_dwSummonPartyObjid, m_dwSummonPartyData)` (0xf000e004), then closes.
  - **Cancel:** closes.
- The close button and Escape close it without sending.

`TID_DIAG_SUMMONPARTY_USE` (1645 = 2820, txt:1304): `You should be close for the summon to work,(%s)\n Make sure you
are not in an Event arena. \n Do you want to be teleported?`

---

## 2. Friend summon

**Flow:**

1. The scroll (26201 A / 26217 B) goes out as DOUSEITEM.
2. The server answers SUMMON `SOMMON_FRIEND`, which opens `APP_SUMMON_FRIEND`; OK sends SUMMON_FRIEND (data, name).
3. The friend gets SUMMON `SOMMON_FRIEND_CONFIRM`, which opens `APP_MESSAGEBOX_SUMMONFRINED`. Its OK sends
   SUMMON_FRIEND_CONFIRM and its Cancel sends SUMMON_FRIEND_CANCEL.

### 2.1 `APP_SUMMON_FRIEND`: `CWndSummonFriend`, the summoner types or picks a friend

**resdata.inc:27846-27902.** `"WndTile00.tga"` tile 1, **272 x 144**, style 0x2410000. Title `IDS_RESDATA_INC_003632`
"**Summon**" (resData.txt.txt:3633).

| Line | Type | Id | Picture | Rect | Style | Text |
|---|---|---|---|---|---|---|
| 27856 | static | WIDC_STATIC1 | "" | 24 44 66 60 | 0x2220000 | `IDS_RESDATA_INC_003634` "**Name :**" (txt:3635), blue 0xff2e70a9, bold, at (2,2) |
| 27865 | static | WIDC_STATIC2 | "" | 30 18 228 34 | 0x2220000 | `IDS_RESDATA_INC_003636` "**Input the character name to be summoned.**" (txt:3637), blue, bold |
| 27874 | button | WIDC_OK | ButtOk.tga | 40 78 112 98 | 0x220010 | |
| 27883 | button | WIDC_CANCEL | ButtCancel.tga | **143 77 215 97** (1 px higher than OK, as written) | 0x220010 | |
| 27892 | combo box | WIDC_COMBOBOX1 | WndEditTile00.tga tile 1 | 70 42 238 60 | 0x20000 | title "ComboBox" (txt:3643) is unused |

**The combo box** (`CWndComboBox`, `_Interface/WndControl.cpp:4668-4910`; it is a `CWndEdit`, so the player can **type
a name or pick one**):

- **Field:** edit tiles over 168 x 18 (21 x 2 tiles). The words start at (73,45), inset 3 px. It gets the focus and
  caret when the window opens (`SetFocus`, `WndSummonFriend.cpp:151`).
- **Drop button:** a docked child at the field's right 20 px, `(w-20, 0)-(w, h)` of the field (docked children sit in
  the parent's window rect, `WndBase.cpp:1044-1052`), so at client (218,42)-(238,60). `ButtQuickListDn.tga` is
  **56 x 12, four 14 x 12 frames** (0 mouse over, 1 normal, 2 pushed, 3 disabled), drawn at the button's top left
  (218,42).
- **Opening the list:** a press on the field or on the button toggles the list (`OnLButtonDown` :4724-4735; button
  :4740-4752; `OpenListBox` :4890-4902).
- **The list** is a popup under the field: left = field left, top = field bottom, width 168. Its height is
  `(rows + 1) * (fontMaxHeight + 3) + 8` (`AddString` :4809-4815); with no rows it is the initial 100 px (:4686-4689).
  - It has the same edit tiles and a vertical scroll bar (`WBS_POPUP | WBS_VSCROLL`, :4691-4696).
  - Rows start at (3,3), with a pitch of font height + 1 (`CWndListBox`, `m_nLineSpace 1`, :1816; draw :1860-1920).
  - Row colours: normal 0xff404040 (64,64,64); under the mouse 0xffff8000 (255,128,0); selected 0xff4040ff (64,64,255)
    (:1805-1810).
- **Picking a row** puts its name in the field and hides the list (`WNM_SELCHANGE`, :4764-4783). The window ignores
  that message.

**List contents** (`OnInitialUpdate`, `WndSummonFriend.cpp:115-159`, `__RT_1025` branch :122-128):

- Every entry of `g_WndMng.m_RTMessenger` (`CRTMessenger : map<u_long idPlayer, Friend{BOOL bBlock; DWORD dwState}>`,
  `_Common/rtmessenger.h:6-17`) whose state is **not `FRS_OFFLINE` (1)** and which is **not blocked**.
  - All the other states are listed: online 0, absent 3, hard play 4, eating 5, resting 6, moving 7, dead 8, danger 9
    (`_Common/messenger.h:6-15`).
- In map order, which is **ascending player id**.
- The names are `CPlayerDataCenter::GetPlayerString(idPlayer)`, from the client's player-name table
  (`_Common/playerdata.cpp:191-198`).
- The map is filled by the snapshot `SNAPSHOTTYPE_ADDFRIENDGAMEJOIN` 0x0074 (`DPClient.cpp:439, 7849-7860`;
  `CRTMessenger::Serialize`, `_Common/rtmessenger.cpp:36-69`): `DWORD myState, int n, n × (u_long idFriend, BOOL
  bBlock, DWORD dwState)`.
  - Add, remove, block and state updates come through `OnAddFriend` / `OnRemoveFriend` / `SetBlock`
    (`DPClient.cpp:7904, 8012, 8126, 8157`) and GET/SETFRIENDSTATE (:178-179).
  - **The port reads none of these today** (only the login's `SlotMessenger` ids), so without that work the list is
    empty and the player types the name.

Class: `WndSummonFriend.cpp:97-229` and `WndSummonFriend.h:24-41`.

- **Opens** from `CDPClient::OnSummonFriend` (`DPClient.cpp:16097-16115`). It reads `DWORD data, OBJID`. If the item
  `HIWORD(data)` is in the bag, it reuses or creates the window, then calls `SetData((WORD)itemObjId, 0)`, which sets
  `m_dwData = MAKELONG(itemObjId, 0)` (:166-169).
- **OnDraw:** empty.
- **OnChildNotify** (:184-229), **OK:** takes the field's text.
  1. **Length 3 to 63** (`3 <= len < MAX_NAME 64`, `_Common/Mover.h:32`). Shorter or longer does **nothing, and the
     window stays open**.
  2. **The player's own name:** the chat line `TID_GAME_SUMMON_FRIEND_MY_NOUSE`, then the window closes.
  3. **The scroll `LOWORD(m_dwData)` still in the bag:** `SendSummonFriend(m_dwData, name)` (0xf000e001).
  4. **Otherwise:** `TID_ERROR_SUMMONFRIEND_NOITEM` with item **26201**'s name and the typed name.
  5. Steps 2-4 close the window.
- **Cancel:** closes. Enter in the field does nothing: the combo sends `EN_RETURN` with its own id, which the switch
  ignores. The close button and Escape close it without sending.

Texts:
- `TID_GAME_SUMMON_FRIEND_MY_NOUSE` (1649 = 2824, txt:1333, chat red): `You can not use item to yourself.`
- `TID_ERROR_SUMMONFRIEND_NOITEM` (1627 = 2801, txt:1297, chat red): `You don't have %s. You cannot summon %s.`
  - Item 26201's name in the data is "**Friendship (B)**": `II_SYS_SYS_SCR_FRIENDSUMMON_A` has `IDS_PROPITEM_TXT_004734`
    (propItem.txt:2122; propItem.txt.txt:4735). The A/B names are swapped in the data. Take the name from the item data
    for 26201 as Neuz does.

### 2.2 `APP_MESSAGEBOX_SUMMONFRINED` (sic): `CWndSummonFriendMsg`, the friend's question

**resdata.inc:27807-27845.** `"WndTile00.tga"` tile 1, **288 x 144**, style 0x2410000. Title `IDS_RESDATA_INC_003644`
"**Summon**" (resData.txt.txt:3645). The header comment lists WIDC_STATIC1/2, but resdata has only these three
controls.

| Line | Type | Id | Picture | Rect | Style | Text |
|---|---|---|---|---|---|---|
| 27817 | button | WIDC_OK | ButtOk.tga | 50 80 122 100 | 0x220010 | |
| 27826 | button | WIDC_CANCEL | ButtCancel.tga | 160 80 232 100 | 0x220010 | |
| 27835 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 12 8 268 74 | 0x20000 | set by code. Tiles 32 x 8; words (18,14)-(262,68). |

Class: `WndSummonFriend.cpp:16-95` and `WndSummonFriend.h:4-22`.

- **Opens** from `CDPClient::OnSummonFriendConfirm` (`DPClient.cpp:16117-16136`). It reads `OBJID summoner, DWORD
  data, string name (64), string world (128)`, reuses or creates the window, then calls `SetData`.
- **OnInitialUpdate** (:33-46): zeroes the stored id and data; centred.
- **SetData** (:53-62): stores the summoner's id and the data. TEXT1 = `TID_DIAG_SUMMONFRIEND_CONFIRM` with (name,
  world).
- **OnDraw:** empty.
- **OnChildNotify** (:77-95):
  - **OK:** `SendSummonFriendConfirm(objid, data)` (0xf000e002), then closes.
  - **Cancel:** `SendSummonFriendCancel(objid, data)` (0xf000e005), then closes.
  - **The close button and Escape close it without sending the cancel.** Today's web box sends the cancel on close.

`TID_DIAG_SUMMONFRIEND_CONFIRM` (1626 = 2800, txt:1296): `%s asked to summon you %s.\n Would you like to accept?`

---

## 3. `APP_COMMITEM_DIALOG`: `CWndCommItemDlg`, the generic "use this item?" box

**resdata.inc:23805-23843.** `"WndTile00.tga"` tile 1, **320 x 128**, style 0x2410000. Title `IDS_RESDATA_INC_002802`
"**Use Item**" (resData.txt.txt:2803).

| Line | Type | Id | Picture | Rect | Style | Text |
|---|---|---|---|---|---|---|
| 23815 | **edit** | WIDC_EDIT_COMMUSE | WndEditTile00.tga tile 1 | 10 8 300 64 | 0x20000 | set by code. Tiles 36 x 7; words (13,11)-(297,64); **wraps at characters** |
| 23824 | button | WIDC_BUTTON_OK | ButtOk.tga | 68 68 140 88 | 0x220010 | |
| 23833 | button | WIDC_BUTTON_CANCEL | ButtCancel.tga | 168 68 240 88 | 0x220010 | |

Class: `_Interface/WndField.cpp:12878-12995` and `WndField.h:1090-1106`.

- Every caller does `SAFE_DELETE` on the open box first (**a new box replaces the old**), then `Initialize`, then
  `SetItem(tid, a, b)`.
- **OnInitialUpdate** (:12896-12907): the edit is **disabled** (`EnableWindow(FALSE)`: no caret, no input); centred.
- **SetItem** (:12907-12912): `AddString(text)` in black. `m_dwObjId = a`, `m_dwCtrlId = b`.
- **OnDraw:** empty, so no icon.
- **OnChildNotify** (:12934-12995), **OK** (or `EN_RETURN`, which cannot happen because the edit is disabled):
  - A shop (`APP_SHOP_`), the bank or a trade window is open: the chat line `TID_GAME_TRADELIMITUSING`.
  - The repair window is open: `TID_GAME_REPAIR_NOTUSE`, in TRADELIMITUSING's colour.
  - Else, if `a == 10425` (`II_SYS_SYS_SCR_CHACLA`, the class change): opens `APP_CHANGECLASS_1` (expert) or
    `APP_CHANGECLASS_2`. The server ignores the class change, as the earlier research found.
  - Else, if `b == 21030` (pet tamer mistake): `SendPetTamerMistake(a)`.
  - Else, if the item `a` is still in the bag (`__AZRIA_1023`): an `IK3_TICKET` sends `SendDoUseItemInput(MAKELONG(0,
    a), "0")`; anything else sends `SendDoUseItem(MAKELONG(0, a), b, -1, FALSE)`. `bResult FALSE` skips every box branch
    of `SendDoUseItem`.
  - **The box closes in every case**, refusals included.
- **Cancel** and the close button (`WTBID_CLOSE`, tested explicitly) close it. Escape closes it.

**Who opens it** (texts from textClient; `a` = the item's bag object id unless noted; `b` = the second DOUSEITEM field):

| Item | Where | TID (defineText.h line = id; txt line) | Text | b |
|---|---|---|---|---|
| Scroll of SProtect 10464, XProtect 10488, AProtect 26473 (`SMELPROT`, 3, 4) | SendDoUseItem :10433-10450 (bag + task bar) | `TID_GAME_REGARDLESS_USE` (1508 = 2663; 1194) | This item is consumed regardless of its success or failure. Do you continue? | focus mover id |
| Smelting scroll 10468; super smelting 26203 | :10452-10460, :10499-10506 | `TID_GAME_LV7OVER_NOTUSE` (1510 = 2665; 1196) | This item has no effect when refining items higher than +7. Do you still use it? | focus id |
| Elemental smelting 10489 | :10462-10470 | `TID_GAME_LV10OVER_NOTUSE` (3172 = 4198; 2724) | This item is not effective at a +10 or higher elemental upgrade. Continue anyway? | focus id |
| Pet tamer mistake 21030 | :10625-10630 | `TID_GAME_PET_MISTAKE_DESC` (2012 = 3218; 1665) | Return your pet to its previous level and remove its current Exp. | 21030 |
| Pet hatch 21036 | :10631-10636 | `TID_GAME_PET_HATCH_DESC` (2013 = 3219; 1666) | Turns an egg into a D Level pet. Pet class will be decided at random. | focus id |
| Battery 26453 | :10669-10674 | `TID_GAME_BETTERY_DESC` (2205 = 3376; 1827) | This will replace current Battery life. Confirm? | 26453 |
| Batteries 26560, 26454, 26455 | :10675-10682 | `TID_GAME_CACHE_BETTERY_DESC` (2417 = 3577; 2045) | Use now? | the item's id |
| A ticket used inside its own world | :10706-10722 | `TID_GAME_TICKET_DESC` (2251 = 3415; 1876) | Would you like to leave? | the item's id (OK sends DO_USE_ITEM_INPUT "0") |
| Re-Skill 10434 / 26316 (some skill point spent) | bag only, `WndField.cpp:2430-2443` | `TID_GAME_SKILLINIT` (1454 = 2620; 1166) | This item resets your skills. Do you want to use this item? | focus id |
| Blessing 10430 (not charged, no `SM_REVIVAL`) | bag only, :2468-2484 | `TID_GAME_DEPEN_USE` (1451 = 2617; 1164) | This item takes effect once your character dies. Do you want to use it? | focus id |
| Class change 10425 (not charged, no armour worn, not a base job) | bag only, :2495-2528 | `TID_GAME_WARNINGCCLS` (1458 = 2624; 1170) | Your stats will reset after you change your job. Do you want to change your job? | a = b = 10425 |

The same window id is also passed by `CWndChangeAttribute` (`WndField.cpp:2421-2428`), but that is a different window
(`APP_CHANGE_ATTRIBUTE`, out of scope).

---

## 4. `APP_RESTATE_CONFIRM`: `CWndRestateConfirm`, the Re-Stat scrolls

**resdata.inc:2546-2584.** `"WndTile00.tga"` tile 1, **336 x 160**, style 0x2410000. Title `IDS_RESDATA_INC_006552`
"**Confirm Re-Stat**" (resData.txt.txt:6553).

| Line | Type | Id | Picture | Rect | Style |
|---|---|---|---|---|---|
| 2556 | text | WIDC_RESTATE_CONFIRM_TEXT | WndEditTile00.tga tile 1 | 10 18 314 94 | 0x20000. Tiles 38 x 9; words (16,24)-(308,88). |
| 2565 | button | WIDC_RESTATE_CONFIRM_YES | **ButtYes.tga** | 74 100 146 120 | 0x220010 |
| 2574 | button | WIDC_RESTATE_CONFIRM_NO | **ButtNo.tga** | 180 100 252 120 | 0x220010 |

Class: `WndField.cpp:25429-25535` and `WndField.h:2613-2631`.

- **Opens** from **the bag's double-click only** (`WndField.cpp:2445-2464`); the task bar sends DOUSEITEM with no box.
  - The scrolls: 10211 Re-Stat, 30151 STR, 30152 DEX, 30153 STA, 30154 INT, 30337-30340 the four ": Low" ones.
    20135 `RESTATE_LINK` gets no box.
  - It does `SAFE_DELETE` on the old box, then `new CWndRestateConfirm(itemId)`, then
    `SetInformation(MAKELONG(0, objId), focusId, prop.dwParts)`, then `Initialize(NULL)`.
- **OnInitialUpdate** (:25445-25503): `AddString` (black) of the text for the item id, then centred.
- **OnDraw:** none.
- **OnChildNotify** (:25505-25527). **Only while the bag (`APP_INVENTORY`) is open**; with the bag closed, YES and NO
  do nothing.
  - **YES:** `SendDoUseItem(m_dwItemObjID, m_ObjID, m_nPart)` (bResult TRUE by default), then closes.
  - **NO:** closes. The close button and Escape close it.
- **Bug kept by Neuz:** `SetInformation(DWORD, OBJID m_ObjID, int)` (:25529-25534) names its parameter like the member,
  so `m_ObjID = m_ObjID` assigns the parameter to itself. **The member stays 0** (the constructor's value), so DOUSEITEM's
  second field is **0**, not the focused mover's id. `m_nPart` is the scroll's `dwParts`.

| Item | TID (defineText.h line = id; txt line) | Text |
|---|---|---|
| 10211 | `TID_TOOLTIP_RESTATE_ALL_CONFIRM` (3166 = 4193; 2719) | All character stats will be reset.  Continue? |
| 30151 | `TID_TOOLTIP_RESTATE_STR_CONFIRM` (3167 = 4194; 2720) | Your Strength (STR) stat will be reset and the points will be refunded to you.  Continue? |
| 30153 | `TID_TOOLTIP_RESTATE_STA_CONFIRM` (3168 = 4195; 2721) | Your Stamina (STA) stat will be reset and the points will be refunded to you.  Continue? |
| 30152 | `TID_TOOLTIP_RESTATE_DEX_CONFIRM` (3169 = 4196; 2722) | Your Dexterity (DEX) stat will be reset and the points will be refunded to you.  Continue? |
| 30154 | `TID_TOOLTIP_RESTATE_INT_CONFIRM` (3170 = 4197; 2723) | Your Intellect (INT) stat will be reset and the points will be refunded to you.  Continue? |
| 30337 | `TID_GAME_RESTATE_STR_LOW_CONFIRM` (3345 = 4342; 2896) | 50 Strength (STR) points will be refunded to you.  Do you want to continue? |
| 30339 | `TID_GAME_RESTATE_STA_LOW_CONFIRM` (3346 = 4343; 2897) | 50 Stamina (STA) points will be refunded to you.  Do you want to continue? |
| 30338 | `TID_GAME_RESTATE_DEX_LOW_CONFIRM` (3347 = 4344; 2898) | 50 Dexterity (DEX) points will be refunded to you.  Do you want to continue? |
| 30340 | `TID_GAME_RESTATE_INT_LOW_CONFIRM` (3348 = 4345; 2899) | 50 Intelligence (INT) points will be refunded to you.  Do you want to continue? |

---

## 5. `APP_SMELT_SAFETY_CONFIRM`: `CWndSmeltSafetyConfirm`, before upgrading a +3 or higher item

**resdata.inc:1772-1810.** `"WndTile00.tga"` tile 1, **336 x 160**, style 0x2410000. Title `IDS_RESDATA_INC_006516`
"**Confirm Upgrade**" (resData.txt.txt:6517).

| Line | Type | Id | Picture | Rect | Style |
|---|---|---|---|---|---|
| 1782 | button | WIDC_SMELT_YES | ButtYes.tga | 74 100 146 120 | 0x220010 |
| 1791 | button | WIDC_SMELT_NO | ButtNo.tga | 182 100 254 120 | 0x220010 |
| 1800 | text | WIDC_CONFIRM_TEXT | WndEditTile00.tga tile 1 | 10 18 318 94 | 0x20000. Tiles 38 x 9; words (16,24)-(312,88). |

**Opens** in `CWndItemCtrl::OnLButtonDown` (`_Interface/WndItemCtrl.cpp:851-920`) when the upgrade cursor is on and a
bag item is pressed. The checks run in this order; the first that matches opens the box (after `SAFE_DELETE` on the old
one and `SetWndMode(target)`), otherwise `RunUpgrade(target)` runs straight away:

| # | Condition | Mode, TID (defineText.h line = id; txt line) | Text |
|---|---|---|---|
| 1 | no `SMELPROT` 10464 buff, the material is Sunstone 2035 / 2082, the target is +3 or more (`GetAbilityOption() >= 3`), and the target `IsDiceRefineryAble` | `WND_ERROR1`, `TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL` (3084 = 4128; 2647) | Item can be destroyed if upgrading fails. Recommend to use "Scroll of Sprotect". Will you proceed with upgarding? |
| 2 | no `SMELPROT3` 10488 buff, the material is 2034 (`ORICHALCUM02`), and the target is an Ultimate weapon (`dwReferStat1 == WEAPON_ULTIMATE`); **no +level check** | `WND_ERROR2`, `TID_GAME_SMELT_SAFETY_CONFIRM_HIGHEST` (3085 = 4129; 2648) | Item can be destroyed if upgrading fails. Recommend to use "Scroll of XProtect". Will you proceed with upgarding? |
| 3 | no `SMELPROT4` 26473 buff, the target is +3 or more, the material is Moonstone 2036 / 2083, and the target is `IK2_JEWELRY` | `WND_ERROR3`, `TID_GAME_SMELT_SAFETY_CONFIRM_ACCESSARY` (3086 = 4130; 2649) | Item can be destroyed if upgrading fails. Recommend to use "Scroll of AProtect". Will you proceed with upgarding? |
| 4 | no `SMELPROT` buff, the element is +3 or more (`GetResistAbilityOption() >= 3`), the material `IsElementalCard`, and the target `IsEleRefineryAble` (`__15_5TH_ELEMENTAL_SMELT_SAFETY`, on) | `WND_ERROR1` again, the NORMAL text | as #1 |

Class: `WndField.cpp:25236-25314` and `WndField.h:2558-2578`.

- **OnInitialUpdate** (:25251-25278): `AddString` (black) of the mode's text, then centred.
- **OnDraw:** none, so no item icon.
- **OnChildNotify** (:25280-25301). **Only while the bag is open.**
  - **YES:** `RunUpgrade(target)` starts the 4 s wait and its packet, then closes.
  - **NO:** `BaseMouseCursor()` ends the upgrade mode and removes its effect, then closes.
- **OnDestroy** (:25303-25308; `SetWndMode` :25310-25313) **always** calls `BaseMouseCursor()`. So the close button and Escape also end the upgrade
  mode with no upgrade.
  - After YES, the 4 s wait still runs and sends its packet (`CWndInventory::Process` keeps `m_pUpgradeItem`), but
    the `XI_INT_INCHANT` effect on the player is removed straight away.
- While the box is open the upgrade mode is still on, because the box is not modal. A press on another bag item opens
  a new box in its place.

---

## 6. `APP_RANDOMSCROLL_CONFIRM`: `CWndRandomScrollConfirm`, the random option scroll

**resdata.inc:3677-3715.** **`"WndTile08.tga"`** tile 1, which gives the same tiles as WndTile00 (§0.1); **304 x 160**,
style 0x2410000. Title `IDS_RESDATA_INC_003802` "**Random Option**" (resData.txt.txt:3803).

| Line | Type | Id | Picture | Rect | Style |
|---|---|---|---|---|---|
| 3687 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 6 6 284 94 | 0x20000. Tiles 34 x 11; words (12,12)-(278,88). |
| 3696 | button | WIDC_YES | ButtYes.tga | 66 100 138 120 | 0x220010 |
| 3705 | button | WIDC_NO | ButtNo.tga | 162 100 234 120 | 0x220010 |

Class: `WndField.cpp:290-385` and `WndField.h:99-120`.

- **Opens after the 4 s upgrade wait, not on the click** (`CWndInventory::Process`, `WndField.cpp:1730-1741`), when the
  material is `IK3_RANDOM_SCROLL`.
  - It does `SAFE_DELETE` on the old box, then `SetItem(targetObjId, scrollObjId, bFlag)`, then `Initialize()`.
  - `bFlag` is TRUE when the target already has a random option (`GetRandomOpt() > 0`).
- **OnInitialUpdate** (:315-345):
  - Both items must still be in the bag, or the window destroys itself.
  - TEXT1 = `TID_GAME_RANDOMSCROLL_CONFIRM1` (bFlag) or `TID_GAME_RANDOMSCROLL_CONFIRM`, formatted with the **target**'s
    name. The text is disabled (`EnableWindow(FALSE)`).
  - Centred.
- **OnDraw:** empty.
- **OnChildNotify** (:376-385) closes on **any** child message.
  - **YES:** first `SendRandomScroll(target, scroll)` (RANDOMSCROLL 0xf000d00d).
  - **NO**, the close button, and Escape only close it.

Texts (the leading spaces and the trailing tab are in the file):
- `TID_GAME_RANDOMSCROLL_CONFIRM` (1882 = 3095; txt:1529): `    Do you want to apply a random\n stat upgrade to the
  following item?\n %s` + a tab
- `TID_GAME_RANDOMSCROLL_CONFIRM1` (1883 = 3096; txt:1530): `    This will overwrite the previous\n random stat upgrade
  that was applied. \nDo you want to continue?` + a tab. It has no `%s`, so the name is not shown.

---

## 7. `APP_FUNNYCOIN_CONFIRM`: `CWndFunnyCoinConfirm`

**resdata.inc:1271-1309.** `"WndTile00.tga"` tile 1, **288 x 128**, style 0x2410000. Title `IDS_RESDATA_INC_006424`
"**Confirm**" (resData.txt.txt:6425).

| Line | Type | Id | Picture | Rect | Style |
|---|---|---|---|---|---|
| 1281 | button | WIDC_YES | ButtYes.tga | 56 70 128 90 | 0x220010 |
| 1290 | button | WIDC_NO | ButtNo.tga | 152 70 224 90 | 0x220010 |
| 1299 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 10 12 270 64 | **0x20020000 (scroll bar)**. Tiles 30 x 6 over x 10..250; scroll bar at client x 254-270, y 12-64 (arrows at y 12-28 and 48-64). Words (16,18)-(249,58). |

Class: `WndField.cpp:23556-23617` (`__FUNNY_COIN`) and `WndField.h:2452-2466`.

- **Opens** from `SendDoUseItem` (`DPClient.cpp:10544-10552`) for any `IK2_TOCASH` item: the Funny Coins 1000 / 3000 /
  5000 / 10000. They are named "1000 ??" and so on in propItem.txt.txt:10319-10325, which is untranslated.
  - From the bag or the task bar. It does `SAFE_DELETE` on the old box, then `SetInfo(objId, item)` **before**
    `Initialize`.
- **OnInitialUpdate** (:23568-23590): TEXT1 `AddString` (black) of `TID_GAME_FUNNYCOIN_ASKUSE` with the item's name;
  centred. With no item, the window destroys itself.
- **OnDraw:** none.
- **OnChildNotify** (:23598-23610) closes on **any** child message.
  - **YES:** first `SendDoUseItem(MAKELONG(0, objId), NULL_ID, -1, FALSE)`.
  - **NO**, the close button, and Escape only close it.

`TID_GAME_FUNNYCOIN_ASKUSE` (3061 = 4112; txt:2628): `Would you like to use %s?`

---

## 8. `APP_CONFIRM_ENTER`: `CWndConfirmVis`, Awakening Protection (`CheckConfirm`)

**resdata.inc:4346-4393.** `"WndTile00.tga"` tile 1, **304 x 192**, style 0x2410000. Title `IDS_RESDATA_INC_006822`
"**OK**" (resData.txt.txt:6823); the title bar really reads "OK".

| Line | Type | Id | Picture | Rect | Style | Note |
|---|---|---|---|---|---|---|
| 4356 | text | WIDC_TEXT1 | WndEditTile00.tga tile 1 | 10 18 286 124 | **0x20020000 (scroll bar)** | Tiles 32 x 13 over x 10..266; bar at client x 270-286, y 18-124 (arrows y 18-34 and 106-122; the bar height is rounded to 104); words (16,24)-(265,118) |
| 4365 | button | WIDC_BUTTON1 | ButtOk.tga | 56 132 128 152 | 0x220010 | OK; `SetDefault(TRUE)` |
| 4374 | button | WIDC_BUTTON2 | ButtCancel.tga | 170 132 242 152 | 0x220010 | Cancel |
| 4383 | edit | WIDC_EDIT1 | WndEditTile00.tga tile 1 | 183 4 274 23 | 0x20000 | **Moved to (-100,-100) and focused** in `OnInitialUpdate`, so it is never seen. It is there so that Enter acts as OK. Draw nothing for it. |

Class: `_Interface/WndPetSys.cpp:2848-2989` (`__PETVIS`) and `WndPetSys.h:113-152`.

- **Opens** from `CWndMgr::CheckConfirm` (`WndManager.cpp:7640-7714`). It is called before DOUSEITEM by the bag's
  double-click (`WndField.cpp:2636`) **and** the task bar (`WndManager.cpp:2768`). When it returns TRUE, nothing is
  sent.
  - For item **26961** (`II_SYS_SYS_SCR_AWAKESAFE`, "Scroll of Awakening Protection", propItem.txt.txt:12043;
    `__PROTECT_AWAKE`, :7698-7714): `new CWndConfirmVis`. There is no `SAFE_DELETE` here, so a second use opens a second
    box.
  - `m_dwItemId = objId`, `m_objid = player id`, `m_dwItemIndex = 26961`, section `ETC_PROTECT_AWAKE`, then
    `Initialize()`.
  - The other sections are the Vis pets' (the earlier ruling: no pets in the browser): `CVS_EQUIP_VIS` /
    `CVS_UNEQUIP_VIS` / `CVS_EQUIP_VISKEY` from `CWndBuffPetStatus::DoModal_ConfirmQuestion`, and
    `CVS_PICKUP_TO_BUFF` (:7675-7693).
- **Initialize** (:2927-2932): `InitDialog(APP_CONFIRM_ENTER, WBS_KEY)`, then `MoveParentCenter()`.
- **OnInitialUpdate** (:2872-2925):
  - `AddWndStyle(WBS_MODAL)`: **this one is modal**. Neuz's `MsgProc` stops the world and other windows taking input
    while a modal window is open (`Neuz/Neuz.cpp:1253-1300`).
  - OK becomes the default button.
  - TEXT1 `SetString` (black) of the section's text.
  - The edit is moved off the window and focused.
- **OnDraw:** empty.
- **OnChildNotify** (:2963-2987):
  - **OK** (`WIDC_BUTTON1`) or **Enter** (`EN_RETURN` from the hidden edit): `SendEquipPacket()`, then closes. For
    `ETC_PROTECT_AWAKE` that is `SendDoUseItem(MAKELONG(0, objId), playerId)`: part -1, bResult TRUE (`SendEquipPacket`, :2945-2961).
  - **Cancel** (`WIDC_BUTTON2`), the close button, and Escape close it.

Texts by section (only the first matters to the browser):

| Section | TID (defineText.h line = id; txt line) | Text |
|---|---|---|
| ETC_PROTECT_AWAKE | `TID_GAME_REGARDLESS_USE01` (3418 = 4400; 2958) | Would you like to activate the Scroll of Awakening Protection?  This Scroll will allow you to attempt to get a better Awakening on an item without losing your current Awakening.  This Buff will protect the next Item you posses that is the target of a Reversion Scroll. |
| CVS_EQUIP_VIS | `TID_GAME_BUFFPET_EQUIP` (3236 = 4252; 2789) | Would you like to place the %s into your Buff Pet? |
| CVS_UNEQUIP_VIS | `TID_GAME_BUFFPET_CANCEL` (3237 = 4253; 2790) | Delete the %s? |
| CVS_EQUIP_VISKEY | `TID_GAME_BUFFPET_KET01` (3273 = 4283; 2823) | Would you like to unlock %s's Bead Slot? |
| CVS_PICKUP_TO_BUFF | `TID_GAME_PET_TRAN` (3350 = 4346; 2900) | Would you like to transform your Pick-up Pet into a Buff Pet? |

The Awakening Protection text is about 280 characters. In the 249 px words box it runs to more lines than fit
(`(94 + 5) / (font + 5)` lines show), so **Neuz shows the scroll bar's thumb and the player scrolls**. The browser needs
a scroll bar, or the scrolling text, here.

---

## 9. The theme pictures

All are in `Client/Theme/Default`; matched case-insensitively and read from the files' headers.

| Picture | Exists | Size | Used by |
|---|---|---|---|
| WndTile00.tga … WndTile11.tga | yes, all 12 | 16 x 16 each, 32 bpp | every window's frame (also for "WndTile08.tga") |
| WndEditTile00.tga … WndEditTile08.tga | yes, all 9 | 8 x 10 each, 32 bpp | every text and edit, the combo box and its list |
| WndEditTile200.tga … WndEditTile208.tga | yes, all 9 | 8 x 10 each, 32 bpp | the "How to Use" strip (§1.2) |
| ButtOk.tga | yes | 288 x 20 (4 × 72 x 20) | §1.1-1.3, 2.1, 2.2, 3, 8 |
| ButtCancel.tga (also written "Buttcancel.tga" in §1.3) | yes | 288 x 20 | §1.1, 1.3, 2.1, 2.2, 3, 8 |
| ButtYes.tga | yes | 288 x 20 | §4, 5, 6, 7 |
| ButtNo.tga | yes | 288 x 20 | §4, 5, 6, 7 |
| ButtQuickListDn.tga | yes | 56 x 12 (4 × 14 x 12) | the combo box's drop button (§2.1) |
| ButtVScrUp.tga / ButtVScrDown.tga | yes | 64 x 16 each (4 × 16 x 16) | the scroll bars (§7, §8, the combo's list) |
| ButtVScrBar.bmp, ButtVScrPUp.bmp, ButtVScrPBar.bmp, ButtVScrPDown.bmp | yes | 16 x 4 each, 24 bpp, magenta key | the scroll bars |
| ButtWndExit.tga | yes | 60 x 14 (4 × 15 x 14) | the title bar's close button (the port's frame already draws it) |
| WndMessagebox.tga | yes | 256 x 144 | not used by these windows |
| `Client/Item/Itm_SysSysScrPartycome.dds` | yes | 32 x 32 (uncompressed DDS, 2176 bytes) | §1.2's icon (item 26202's `szIcon`, propItem.txt:2124) |

## 10. The hammer cursor (`CUR_HAMMER`, `Client/Cursor/anvil.cur`)

- **Loaded** by `CNeuzApp::OneTimeSceneInit`: `m_ahCursor[CUR_HAMMER] = LoadCursorFromFile("Cursor\\anvil.cur")`
  (`Neuz/Neuz.cpp:298`; `CUR_HAMMER 18`, `Neuz/Neuz.h:25`).
- **Shown** only by `CWndInventory::SetEnchantCursor` (`_Interface/WndField.cpp:2818-2828`): the hammer while
  `m_bIsUpgradeMode` is on, `CUR_BASE` otherwise. It is called only from `CWndInventory::OnSetCursor` (:2810-2815) and
  `CWndItemCtrl::OnSetCursor` (`WndItemCtrl.cpp:1393-1400`).
  - So **the hammer shows only while the mouse is over the bag window** (its frame or its grid). Over the world and
    other windows, their own cursors apply; nothing else uses `CUR_HAMMER`.
- **The mode** begins with the material's double-click (`WndField.cpp:2340-2396`). It ends with `RunUpgrade`, the target
  click (:13284-13290), or `BaseMouseCursor` (:13574-13583): a right click on the bag, the smelt box closing, the player
  moving, the bag closing.
- **File:** a Windows .cur, 3262 bytes, one image of **32 x 32**, **hotspot (0, 0)** (the top-left corner).
  - The image is 24 bpp with a 1-bit AND mask (BITMAPINFOHEADER 32 x 64), so the transparency is the mask, not alpha.
  - It shows a blue-violet hammer outlined in near-black (27,27,31) with white highlights. The head lies across the top
    from (1,10) to (30,13), and the handle runs down to about (24,30). 473 pixels are opaque.
- **For the browser:** CSS `cursor: url(anvil.png) 0 0, auto`. Convert the .cur to a 32 x 32 PNG, because Safari does
  not take .cur. Chromium and Firefox do, but a PNG with an explicit `0 0` hotspot is safe everywhere. Phones have no
  cursor.

## 11. Where the windows differ from today's web prompts (for the builder)

- **Friend summon (§2.1):**
  - Name length 3-63; a shorter name does nothing and keeps the window open. Today the prompt sends any non-empty
    name.
  - Neuz refuses the player's own name with `TID_GAME_SUMMON_FRIEND_MY_NOUSE`.
  - Neuz requires the scroll still in the bag (`TID_ERROR_SUMMONFRIEND_NOITEM` with item 26201's name).
  - The field is a combo box with the online friends.
- **The friend's question (§2.2):** only its Cancel button sends SUMMON_FRIEND_CANCEL. The close button and Escape send
  nothing. Today the message box's close counts as Cancel.
- **The member's notice (§1.2):** OK only, and it shows the scroll's icon and a "How to Use" strip. Today it is one
  joined text in a message box.
- **Re-Stat (§4):** DOUSEITEM's second field is 0 (Neuz's bug), and it comes from the bag only.
- **Smelt safety (§5):** closing the box in any way ends the upgrade mode.
- **Random scroll (§6):** the box comes after the 4 s wait (as built) and uses ButtYes / ButtNo.
- **Awakening Protection (§8):**
  - It is the one **modal** box.
  - It has a scroll bar and the title "OK", and Enter is OK.
- **All the others:** not modal, centred on the screen, and their close button and Escape send nothing.
