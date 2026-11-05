# Premium item windows 1: how Neuz V15 draws them (2026-11-05)

Windows: APP_CHANGENAME, APP_SELECT_CHANNEL, APP_CHANGESEX, APP_CHANGE_ATTRIBUTE, APP_ITEM_TRANSY. This is research only.
The packets are already known and built (`FlyffWeb-worktrees/ui-fixes/docs/superpowers/specs/2026-11-05-item-windows-research.md`
§3). This file covers the windows themselves.

## 0. Conventions and shared facts

- Source paths are under `Blouflash VS22 V15/Source/`. Resource paths are under `Blouflash VS22 V15/Resource/`. Pictures
  are under `Blouflash VS22 V15/Client/Theme/Default/` unless another folder is named.
- `Resource/resdata.inc` is plain ASCII today, not UTF-16. Its five entries are byte-identical to `resdata.inc.bak`
  (UTF-16), which I checked. Line numbers below are for `resdata.inc`.
- Version gates (`Neuz/VersionCommon.h`). `__MAINSERVER` (line 3) and `__VER 15` (line 4) are on. So are
  `__S_SERVER_UNIFY` (26), `__RULE_0615` (48), `__SYS_TICKET` (91), `__AZRIA_1023` (151), `__PET_1024` (152),
  `__SYS_ITEMTRANSY` (155), `__STATIC_ALIGN` (180) and `__IMPROVE_QUEST_INTERFACE` (201). These defines sit outside any
  `#if`. `__YENV` is off (272, commented out). The `__INTERNALSERVER` block (261-405), which holds
  `__IMPROVE_MAP_SYSTEM`, is inactive. `__EXT_ENCHANT` code is gated by `__VER >= 13` and is on.
- **resdata line format** (`_Common/ResManager.cpp:85-149`):
  - Window line: `APP_ID "picture" bTile width height style d3dFormat`, then the title and help-key IDS.
  - Control line: `WTYPE WIDC "picture" bTile left top right bottom style visible group disabled tabstop`, then the
    title and tooltip IDS.
  - Control rects are in the window's client area. The port already places them straight onto `frame.body`, as
    `selectVillageWindow.ts` does.
- **Window style** `0x2410000` = WBS_CAPTION (0x02000000) | WBS_SOUND (0x00400000) | WBS_MOVE (0x00010000)
  (`Resource/WndStyle.h:20-37`). Each window is movable by its title bar and is not modal.
  - The title bar holds the close button (ButtWndExit.tga 60x14, four 15x14 frames).
  - When the help key is non-empty, `InitDialog` adds WBS_HELP (`_Interface/WndNeuz.cpp:675-677`) and a `?` button
    (ButtWndHelp.tga 60x14) appears left of the close button. Buttons are 16 px apart, and the strip sits at
    x = width − n·16 − 7, y = 4 (`WndNeuz.cpp:53-60, 76-107`).
  - `d3dFormat` 26 is A4R4G4B4.
  - All five sizes are multiples of 16, so `OnSize` does no rounding (`WndNeuz.cpp:498-512`).
- **Control style bits** (`WndStyle.h`):

  | Value | Meaning |
  |---|---|
  | `0x2220002` | CAPTION \| NOFRAME \| CHILD \| WSS_PICTURE (static picture) |
  | `0x2220001` | the same with WSS_GROUPBOX (group box / header bar) |
  | `0x2220000` | plain static text |
  | `0x220010` | NOFRAME \| CHILD \| WBS_HIGHLIGHT (picture button) |
  | `0x20000` | CHILD (edit, list box) |
  | `0x20020000` | WBS_VSCROLL \| CHILD (text with scroll bar) |
  | `0x260000` | NOFRAME \| NODRAWFRAME \| CHILD (custom) |

  WTYPE_CUSTOM controls are never created. `CWndNeuz::CreateControl` has no case for them (`WndNeuz.cpp:562-647`), so
  they are only rects that the class reads with `GetWndCtrl`.
- **Placement.** Every class does `Move(rectRoot.right − w, 110)` and then `MoveParentCenter()`, which centres the window
  on the whole screen: x = W/2 − w/2, y = H/2 − h/2 in integer maths (`_Interface/WndBase.cpp:1805-1816`). The Move is
  overridden, so the window simply opens centred.
- **Baked control skins** (`CWndBase::AdjustWndBase` / `AdditionalSkinTexture`, `WndBase.cpp:2524-2662`). After
  `OnInitialUpdate` (`WndBase.cpp:353-354`), the window bakes its 16 px tiles and then every visible child's picture into
  one texture, in resdata order.
  - **Tiled picture** (bTile 1). The nine pieces are named by the picture name less its last 6 characters, plus `%02d`
    0..8, plus the extension: `WndEditTile00.tga` gives WndEditTile00..08, and `WndEditTile200.tga` gives
    WndEditTile200..208. Each piece is 8x10 and is laid every 8 px in both directions.
  - Grid size: columns = ⌊w/8⌋, rows = ⌊h/8⌋. If WBS_VSCROLL is set, w is reduced by 16 first.
  - Rows 0..rows−2 show only their top 8 px; the last row is fully 10 px.
  - The port already does exactly this with `editTiles(doc, art, columns, rows, tile)` (`apps/client/src/world/hud/tiles.ts`).
  - **Non-tiled picture** (bTile 0): drawn once at the control's top-left at its own size.
  - Compositing is a copy, not a blend (`_Common/vutil.cpp:236-320`). For a 32-bit picture, pixels whose alpha nibble is 0
    are skipped; any other pixel replaces the window pixel together with its own alpha. For a 24-bit .bmp, magenta
    (FF00FF) pixels are skipped.
- **Picture buttons** (`CTheme::RenderWndButton_4Texture`, `_Interface/ITheme.cpp:1336-1416`):
  - The picture is four equal frames side by side: 0 = mouse over, 1 = normal, 2 = pressed or checked, 3 = disabled.
  - It is drawn at the button's (0, 0) at frame size (picture width / 4 × picture height), even when the resdata rect is
    larger. The hit area is the rect.
  - The title ("Button") is not drawn. The port's `pictureButton(..., quarter, ...)` already does this.
- **Static text** (`CWndStatic`, `_Interface/WndControl.cpp:27-120`):
  - Group box (WSS_GROUPBOX): the colour stays at the constructor's `0xffffffff` (white). The title is drawn at (4, 4),
    raised by `maxFontHeight − 14` when the font is taller than 14. It is drawn twice, at x and x+1 (faux bold), in
    `m_Theme.m_pFontText`.
  - Plain static: `Create` sets the colour to `0xff2e70a9` (rgb 46,112,169) and clears the picture. The resdata picture,
    if any, is set again afterwards (`WndNeuz.cpp:588-595`). The text is drawn at (2, 2), also twice at x and x+1.
  - WndEditTile204 is rgb(112,147,178) with alpha 232, so white header text on a steel-blue bar is right. The port's
    skillWindow.ts `GROUP_TITLE` agrees (white, drawn twice). Note that `selectVillageWindow.ts` draws its group-box text
    black (#000000), which disagrees with the source.
- **Escape** (`_Interface/WndManager.cpp:3296-3429`). Escape first clears a selected target, a quest destination or the
  monster-summon cursor. Only when none of those is set does it `Destroy()` the top window. This calls no OnChildNotify,
  so no packet is sent. For all five windows, Escape is the same as the close button.
- **Items "in use".** `SetExtra(n>0)` makes the bag draw that item faded (alpha 60, `_Interface/WndItemCtrl.cpp:473-487`).
  The windows below use it to lock the scroll and the item placed in a slot.

## 1. APP_CHANGENAME, name change (item 10424 II_SYS_SYS_SCR_CHANAM)

### 1.1 resdata.inc:23181-23228

- Window: `"WndTile00.tga"` tiled, 224 x 128, style 0x2410000.
- Title IDS_RESDATA_INC_002932 = "Change Name" (`resData.txt.txt:2933`).
- Help key IDS_RESDATA_INC_002933 = "Character name changing window." (2934). Because it is non-empty, WBS_HELP is added
  and the title bar shows `?` then `x`.
  - The help button opens APP_HELP_INSTANT with `prj.GetHelp(key)` (`WndNeuz.cpp:354-381`,
    `_Interface/WndHelp.cpp:589-604`).
  - The key text appears in no help file under Resource/ or Client/ (only in resData.txt.txt), so that help window would
    be empty.

| # | Type | WIDC | Rect (l, t, r, b) | Size | Picture | Text (English) | Style |
|---|---|---|---|---|---|---|---|
| 1 | static (plain) | WIDC_STATIC1 | 26, 18, 192, 32 | 166x14 | none ("") | "Please input the new name to change into." (002934) | 0x2220000 |
| 2 | button | WIDC_OK | 24, 68, 96, 88 | 72x20 | ButtOk.tga | (title "" 002936) | 0x220010 |
| 3 | button | WIDC_CANCEL | 110, 68, 182, 88 | 72x20 | ButtCancel.tga | (002938 "") | 0x220010 |
| 4 | edit | WIDC_EDIT_CHANGENAME | 24, 42, 188, 62 | 164x20 | WndEditTile00.tga tiled | empty (002940) | 0x20000 |

Rendering details:

- The static text is rgb(46,112,169), drawn at (28, 20) in the client, twice at x and x+1.
- The edit's tiles: 20 columns × 2 rows = 160 x 18 px at (24, 42).
- The edit's text area is the rect deflated (3, 3, 3, 0) (`_Interface/WndEditCtrl.cpp:1317-1326`). Text is black
  (`EDIT_COLOR 0xff000000`, :1180), with a caret.
- No length limit: `m_dwMaxStringNumber = 0xffffffff` (:1212).
- The edit draws no frame of its own (`CWndEdit::PaintFrame` returns, :1327-1332).

### 1.2 Class `CWndChangeName` (`_Interface/WndChangeName.cpp`, header `WndChangeName.h`)

**Opening.** `CDPClient::SendDoUseItem` (`Neuz/DPClient.cpp:10508-10517`). If `g_WndMng.m_pWndChangeName` is null, it
creates and initializes it. It then calls `SetData((WORD)objid, 0)` and returns, so no DOUSEITEM is sent.

- Because of that guard, using a second scroll while the window is open only updates m_dwData.
- `SetData` stores `MAKELONG(wId, wReset)` (:79-82).
- Two other openers: the server's `FUNCTYPE_QUERYSETPLAYERNAME` (`DPClient.cpp:14458-14466`, `SetData(0xffff, 1)`) and
  the forced rename after a server merge (`OnAllAction`, :1618-1633).

**OnInitialUpdate** (:41-52) sets m_dwData = 0, then does the Move and MoveParentCenter (centred). It creates nothing
and sets no focus.

**OnDraw** (:27-39) re-centres every frame, but only while `m_bAllAction == FALSE` (the forced-rename case). It draws
nothing.

**OnChildNotify** (:86-123):

| Event | Action |
|---|---|
| WIDC_OK | The edit string is trimmed (left and right, in place) by `IsValidPlayerName` (`_Interface/WndTitle.cpp:2723-2791`). Checks run in this order: empty → TID_DIAG_0031 "Enter name."; length < 4 or > 16 bytes → TID_DIAG_RULE_0 "Character Name must be 4 to 16 characters long."; first char 0-9 → TID_DIAG_0012 "The name cannot start with a number."; any char not `isalnum` → TID_DIAG_0013 "You cannot use special characters or spaces in a name.". Each error opens a message box (`OpenMessageBox`) and calls `pEdit->SetFocus()`. Next, `prj.IsInvalidName` (lower-cased substring match against the invalid-name list) or `!IsAllowedLetter` → message box TID_DIAG_0020 "Character name is not allowed." (no refocus). Otherwise `SendQuerySetPlayerName(m_dwData, name)` (`DPClient.cpp:15598-15604`), then `Destroy()`. |
| WIDC_CANCEL or WTBID_CLOSE | `Destroy()`, except while `m_bAllAction == FALSE`, when it returns TRUE and stays open. |
| Enter in the edit | The edit sends EN_RETURN with nID WIDC_EDIT_CHANGENAME (`WndEditCtrl.cpp:1528-1541`). The class ignores it, so Enter does nothing. |
| Escape | Closes, except while `m_bAllAction == FALSE`: `GetWndBase` skips APP_CHANGENAME then (`WndBase.cpp:2092-2095`). |

**Pictures:**

| Picture | Exists | Size |
|---|---|---|
| WndTile00..11.tga | yes | 16x16 |
| WndEditTile00..08.tga | yes | 8x10 |
| ButtOk.tga | yes | 288x20 (four 72x20 frames) |
| ButtCancel.tga | yes | 288x20 |
| ButtWndHelp.tga | yes | 60x14 |
| ButtWndExit.tga | yes | 60x14 |

## 2. APP_SELECT_CHANNEL, ticket channels (IK3_TICKET 26529, 26530, 26558 Kebaras; 26681, 26682 Coral Island)

### 2.1 resdata.inc:28785-28814

- Window: `"WndTile00.tga"` tiled, 176 x 256, style 0x2410000.
- Title IDS_RESDATA_INC_006308 = "Channel Selection" (`resData.txt.txt:6309`).
- The help key (006309) is empty, so there is no `?` button.
- **There is no OK and no Cancel button.**

| # | Type | WIDC | Rect | Size | Picture | Text | Style |
|---|---|---|---|---|---|---|---|
| 1 | list box | WIDC_LISTBOX1 | 8, 32, 154, 214 | 146x182 | WndEditTile00.tga tiled | — | 0x20000 (no scroll bar) |
| 2 | static (group box) | WIDC_STATIC1 | 8, 8, 152, 24 | 144x16 | WndEditTile200.tga tiled | "Please choose a channel" (006312) | 0x2220001 |

- List tiles: 18 × 22 = 144 x 178 at (8, 32).
- Header tiles: 18 × 2 = 144 x 18 at (8, 8). The header text is white at (12, 12), drawn twice.

### 2.2 Class `CWndSelectCh` (`_Interface/WndSelectCh.cpp`, all under `#ifdef __AZRIA_1023`)

**Opening** (`DPClient.cpp:10709-10750`):

- If the ticket is not expired and has a `TicketProp` (`Resource/ticket.inc`):
  - In the ticket's own world: a CWndCommItemDlg with TID_GAME_TICKET_DESC "Would you like to leave?" (already built).
  - Elsewhere: `nExpand = GetExpanedLayer(world)` from `Resource/layer.inc`, which gives WI_WORLD_KEBARAS 1 and
    WI_WORLD_CISLAND 1. Any open `m_pWndSelectCh` is deleted, then `new CWndSelectCh(dwItemId, nExpand)` and
    `Initialize`.
- The function does **not** return there. It falls through and still sends a plain DOUSEITEM at the end (:10860-10867).
  The server only teleports through DO_USE_ITEM_INPUT: input items are routed by `HasInput()`
  (`_Common/MoverSkill.cpp:1883-1888`, `WORLDSERVER/User.cpp:8568-8574`, `DPSrvr.cpp:9815-9827`).

**Constructor** (:24-28): `m_nItemId = dwItemId` (that is, MAKELONG(ITYPE_ITEM, objid)), and
`m_nChCount = nExpand + 1`. Both current tickets therefore give **2 rows**.

**OnInitialUpdate** (:38-58): `ResetContent`, then for i = 0..m_nChCount−1, `AddString(Format("%s\t%d",
TID_GAME_CHAR_SERVERNAME, i+1))`. TID_GAME_CHAR_SERVERNAME is "Channel" (`textClient.inc:8875`).

- The rows are "Channel⇥1" and "Channel⇥2", with a literal TAB.
- Neuz's GDI glyph font (`_DirectX/d3dfont.cpp:1045-1046`) does not expand tabs, so the gap is the font's tab glyph,
  blank or narrow. Draw "Channel 1" / "Channel 2" with one space. This is not verified on screen.
- After that it centres.

**OnDraw** draws nothing (:34-36).

**List look** (`CWndListBox`, `WndControl.cpp:1802-1990, 2262-2272, 2507-2518`):

- Client area = rect deflated by 4. Rows start at (3, 3) inside it, so the first text is at (15, 39) in the window's
  client area. Row height is `GetFontHeight() + 1`.
- Text is drawn through CEditString with colour codes parsed. Colours:
  - normal 0xff404040 (64,64,64)
  - mouse over 0xffff8000 (255,128,0)
  - selected 0xff4040ff (64,64,255)
  - invalid 0xffaaaaaa
- No selection at open (`m_nCurSelect = −1`). There is no row background or highlight bar; only the text colour changes.
- Row hit rect: x from 3 to 3 + 146 (the whole width), height = row height.

**OnChildNotify** (:89-108). Any notification from WIDC_LISTBOX1 does the same thing: it reads `GetCurSel()`, sends
`SendDoUseItemInput(m_nItemId, itoa(−sel))` (`DPClient.cpp:18431-18437`), then `Destroy()`. Row 0 sends "0" and row 1
sends "-1". The notifications that trigger it:

| Notification | When |
|---|---|
| WNM_SELCHANGE | mouse up over the row that the mouse-down selected (:1930-1963) |
| WNM_SELCANCEL | right-button up over the already-selected row (:1990-2024) |
| WNM_DBLCLK | double-click (:2028-2053) |

In practice, one left click on a row picks the channel and closes the window. The close button and Escape close it
without sending anything.

**Pictures:** WndTile00..11 (16x16), WndEditTile00..08 (8x10), WndEditTile200..208 (8x10), ButtWndExit.tga (60x14). All
exist.

## 3. APP_CHANGESEX, sex change with face preview (item 10220 II_CHR_SYS_SCR_TRANSY)

### 3.1 resdata.inc:23031-23096

- Window: `"WndTile00.tga"` tiled, 192 x 272, style 0x2410000.
- Title IDS_RESDATA_INC_002960 = "Change Sex" (`resData.txt.txt:2961`). The help key (002961) is empty.

| # | Type | WIDC | Rect | Size | Picture | Text | Style |
|---|---|---|---|---|---|---|---|
| 1 | static (picture) | WIDC_STATIC1 | 18, 38, 168, 168 | 150x130 | WndEditTile00.tga tiled | — | 0x2220002 |
| 2 | static (group box) | WIDC_STATIC2 | 18, 18, 164, 34 | 146x16 | WndEditTile200.tga tiled | "Change Face" (002964) | 0x2220001 |
| 3 | button | WIDC_OK | 12, 204, 86, 226 | 74x22 (picture 72x20) | ButtOk.tga | — | 0x220010 |
| 4 | button | WIDC_CANCEL | 96, 204, 168, 224 | 72x20 | ButtCancel.tga | — | 0x220010 |
| 5 | button | WIDC_RIGHT | 96, 174, 140, 198 | 44x24 (picture 41x20) | Buttright2.bmp | — | 0x220010 |
| 6 | button | WIDC_LEFT | 42, 174, 84, 198 | 42x24 (picture 41x20) | Buttleft2.bmp | — | 0x220010 |

- Preview box tiles: 18 columns × 16 rows = 144 x 130 at (18, 38).
- Header tiles: 18 × 2 = 144 x 18 at (18, 18), with "Change Face" in white at (22, 22), drawn twice.
- Left and right are four-frame buttons of 41x20 (164/4). They are magenta-keyed 24-bit BMPs.
- No face number or other text is drawn anywhere.

**WIDC_STATIC1 is hidden after creation.** The item path calls `SetVisible(FALSE)` on it (`DPClient.cpp:10578-10581`).
Two things follow:

- The skin was already baked during `Create` (`WndBase.cpp:353-354`), and `SetVisible` only flips a flag
  (`WndBase.h:182`). So the 150x130 edit-tile box stays visible.
- The static itself has no text, so hiding it changes nothing visible. Draw the box.

### 3.2 Class `CWndChangeSex` (`_Interface/WndChangeFace.cpp:117-332`, header `WndChangeFace.h:21-43`)

**Opening** (`DPClient.cpp:10554-10583`, only when `nPart == −1`, which is the bag double-click):

- First the equipment check. For each part except HEAD 0, HAIR 1, LWEAPON 9, RWEAPON 10, SHIELD 11, RIDE 13 and
  NECKLACE1..BULLET 19-25: if anything is equipped, `PutString(TID_GAME_CHECK_EQUIP)` "Please unequip the item first."
  (red 0xffff0000) and return.
- So upper, lower, hand, foot, cap, robe, cloak, mask, CAP2..FOOT2 and the fashion parts 26-30 must all be empty.
- If APP_CHANGESEX is not open: `new CWndChangeSex; Initialize()` (no parent, so the root window).
- Then `SetData(dwItemId, objid)`, hide WIDC_STATIC1, and return. No packet is sent yet.
- The GM text command `/ChangeFace` opens it with `SetData(NULL_ID, NULL_ID)` (`_Interface/FuncTextCmd.cpp:352-358`).
  In that case OK sends the chat command "/ChangeFace n" instead.

**Members:** m_nSelectFace = 0, m_pModel = NULL, m_dwItemId and m_dwObjId = NULL_ID (:119-126). `MAX_FACE` is 5
(:117).

**OnInitialUpdate** (:245-267):

1. `nMover = (player is SEX_MALE) ? MI_FEMALE (12) : MI_MALE (11)`. This is the opposite sex.
2. `LoadModel(OT_MOVER, nMover, bParts = TRUE)` loads only the bones `mvr_female.chr` or `mvr_male.chr`, with no skin
   (`_Common/ModelMng.cpp:234-276`).
3. `LoadMotion(MTI_STAND2 = 199)`. Through `MakeMotionName` (`ModelMng.cpp:124-155`):
   - female: `Resource/mdlDyna.inc:25555` "GenStand2", so `Mvr_female_GenStand2.ani`.
   - male: the male block (mdlDyna.inc:24753-25549) has no MTI_STAND2, so it falls back to MTI_STAND "GenStand", which
     gives `Mvr_male_GenStand.ani`.
4. `CMover::UpdateParts(!player.sex, 0, 0, player.m_dwHairMesh, m_nSelectFace, player.m_aEquipInfo, m_pModel,
   &player.m_Inventory)`. This is `_Common/MoverEquip.cpp:280-457`, with bIfParts = TRUE and pMover = NULL. Section 3.3
   lists what it loads.
5. `InitDeviceObjects`, then the Move and MoveParentCenter (centred).

**OnDraw** (:131-244) draws the 3D preview, every frame. Section 3.3 has the details.

**OnChildNotify** (:285-332):

| Event | Action |
|---|---|
| WIDC_LEFT | `m_nSelectFace−−`; below 0 it wraps to 4. Re-runs UpdateParts (new head). |
| WIDC_RIGHT | `m_nSelectFace++`; at 5 it wraps to 0. Re-runs UpdateParts. |
| WIDC_OK | If m_dwItemId is NULL_ID: chat "/ChangeFace %d". Otherwise `SendDoUseItem(m_dwItemId, m_dwObjId, m_nSelectFace)`, so DOUSEITEM's nPart is the face 0..4. Then `Destroy(TRUE)`. |
| WIDC_CANCEL or WTBID_CLOSE | `Destroy(TRUE)`. Nothing is sent. |
| Escape | Closes. Nothing is sent. |

- The window does not close when the player moves (it is not in `WndWorld.cpp:8052-8497`) and not on a world change
  (not in `CloseBoundWindow`, `WndManager.cpp:7899-7924`).
- The model is not rotated: there is no drag handler and no rotate buttons. `OnLButtonDown` is empty (:282-284).

### 3.3 The preview: exactly what Neuz builds and draws

**Model parts**, from `UpdateParts` with nSex = the opposite sex:

| Part | File | Notes |
|---|---|---|
| PARTS_HAIR 1 | `Part_maleHair%02d.o3d` / `Part_femaleHair%02d.o3d` with the **player's** `m_dwHairMesh + 1` | `MoverEquip.cpp:74, 295-296` |
| PARTS_HEAD 0 | `Part_{sex}Head%02d.o3d` with `m_nSelectFace + 1`, so Head01..Head05 (Head01 at open) | :75, 298-299 |
| PARTS_UPPER_BODY 2 | `Part_{sex}Upper.o3d` | armour must be off, so always the bare default (:427-431) |
| PARTS_LOWER_BODY 3 | `Part_{sex}Lower.o3d` | :432-436 |
| PARTS_HAND 4 | `Part_{sex}Hand.o3d` | :437-441 |
| PARTS_FOOT 5 | `Part_{sex}Foot.o3d` | :442-446 |
| PARTS_RWEAPON 10 | the player's equipped right-hand weapon, if any | Uses `part_<m_szPart>.o3d` for the opposite sex if `bPartsFile`, else `item_<name>.o3d` (`ModelMng.cpp:63-123`). Parent bone: right hand. A knuckle uses the right arm, a bow the left hand, and a yo-yo both hands (:381-410). |
| PARTS_LWEAPON 9 | the equipped left-hand weapon | parent: left hand (:411-419) |
| PARTS_SHIELD 11 | the equipped shield | parent: left arm (:420-426) |
| everything else | nothing | `CModelObject::LoadElement` refuses PARTS_RIDE and parts 16..25 (`_Common/ModelObject.cpp:638-642`); the other parts are empty because the open check requires it |

The body is not the player's own look. It is the opposite sex's default naked parts, plus the player's hair **mesh
number**, the chosen head, and the player's weapons and shield.

**Hair colour is not applied.** The lines that would set the hair tint are commented out (`WndChangeFace.cpp:225-229`).

- The hair is drawn with diffuse 0 and ambient = the shared hair mesh's `m_fAmbient`, because lighting is off
  (`ModelObject.cpp:1147-1172`).
- That value is whatever the last mover drawn with the same hair file set it to (`_Common/MoverRender.cpp:350-360`).
  When nothing has set it, it is (1, 1, 1) (`_Common/Object3D.cpp:529-531`), which shows the raw texture.
- Reproduce it as the raw hair texture with tint (1, 1, 1). The player's own hair colour is the obvious alternative if the
  owner prefers it, but that is not what Neuz shows.

**Pose:** the first frame (frame 0) of the motion, frozen.

- The class has no `Process`, and `FrameMove` is never called on `m_pModel`.
- `CModelObject::Render` animates bones at `m_fFrameCurrent`, which stays 0 (`ModelObject.cpp:982-1006`).
- There is no idle animation.

**Render state** (`WndChangeFace.cpp:136-152, 217-240`):

- Z write and Z test on, cull CCW, alpha blend off, solid fill, linear filtering.
- `D3DRS_AMBIENT` white, fog off, lighting off, `::SetLight(FALSE)`, `SetDiffuse(1,1,1)`, `SetAmbient(1,1,1)`.
- Each part's texture is shown as it is: unlit, the same convention as the port's `portrait.ts`.

**Viewport** (:176-187):

- X = client origin + STATIC1.left − 6 = **client x 12**. Y = client origin + STATIC1.top = **client y 38**.
- Width 150, height 130. MinZ 0, MaxZ 1.
- Only the Z buffer is cleared (`Clear(0, NULL, D3DCLEAR_ZBUFFER, …)`). The colour is kept, so the baked edit-tile box
  shows around the model.
- Note the 6 px left shift: the 3D drawing covers x 12..162, while the box is at 18..162 (tiles) / 18..168 (rect).

**Projection** (:189-200):

- `D3DXMatrixOrthoLH(w, h, CWorld::m_fNearPlane − 0.01 (= 0.49), CWorld::m_fFarPlane (512 default))`.
- h = cos(π/8) / sin(π/8) = 2.41421356.
- w = h × 150/130 = 2.78563103.
- Scale: 53.85 px per world unit on both axes.

**Camera** (:166-172): `D3DXMatrixLookAtLH(eye (0, 0.7, −3.5), at (0, 0, 3), up (0, 1, 0))`. This is the same camera as
the status-window face portrait.

**World matrix** (:202-215): `Scale(4.5) × Translation(0, ty, 0)`, with no rotation (`matRot` is declared but unused).

- ty = **−5.6 when the player is male** (the female model is shown).
- ty = **−5.8 when the player is female** (the male model is shown).
- The check is on `g_pPlayer->GetSex()`, the current sex, not the model's.

**What the box shows.** I worked this out from the matrices; it is not verified on screen.

- The visible band is world y −0.891..1.537. That is model-space y ≈ 1.046..1.586 for the female model and
  ≈ 1.091..1.631 for the male model.
- Horizontally it is ±0.31 model units.
- So the head and shoulders, facing the camera, as a "Change Face" close-up.

**three.js recipe.** Reuse `apps/client/src/world/render/portrait.ts` `renderPortrait` with these changes:

- canvas 150 x 130 CSS px
- `viewWidth = VIEW_HEIGHT × 150/130`
- `root.scale = 4.5`
- `root.rotation.y = 0`
- `root.position.y = −5.6` (player male) or `−5.8` (player female)
- eye (0, 0.7, 3.5) and lookAt (0, 0, −3) in the port's mirrored Z (as portrait.ts already does)
- the mixer at `frameTime(0)` of GenStand2 (female) or GenStand (male)
- unlit materials and a transparent clear

Place the canvas at client (12, 38), over the editTiles box at (18, 38). Render once at open and again on each
Left/Right press; the model never moves between those, so this is enough.

### 3.4 Pictures

| Picture | Exists | Size |
|---|---|---|
| WndTile00..11.tga | yes | 16x16 |
| WndEditTile00..08.tga | yes | 8x10 |
| WndEditTile200..208.tga | yes | 8x10 |
| ButtOk.tga | yes | 288x20 |
| ButtCancel.tga | yes | 288x20 |
| Buttleft2.bmp | yes | 164x20, 24-bit, magenta key, four 41x20 frames |
| Buttright2.bmp | yes | 164x20, the same |
| ButtWndExit.tga | yes | 60x14 |

Models and motions (`Client/Model`, partly in .res archives):

| File | Loose in Client/Model |
|---|---|
| mvr_male.chr, mvr_female.chr | present |
| Mvr_female_GenStand2.ani, Mvr_male_GenStand.ani | present |
| Part_femaleHead01-05, Part_femaleHair01-10 | present |
| Part_maleHair02, 03, 06, 07 | present |
| the other male heads and hair | not loose (they are in the .res archives) |

## 4. APP_CHANGE_ATTRIBUTE, element change (item 20037 II_SYS_SYS_SCR_SOKCHANG)

### 4.1 resdata.inc:28701-28784

- Window: `"WndTile00.tga"` tiled, 304 x 288, style 0x2410000.
- Title IDS_RESDATA_INC_006290 = "Scroll of Attribute Change" (`resData.txt.txt:6291`). The help key is empty.
- Every control title and tooltip is empty.
- **There is no Cancel button.**

| # | Type | WIDC | Rect | Size | Picture | Style |
|---|---|---|---|---|---|---|
| 1 | static (picture), the item slot | WIDC_STATIC1 | 132, 24, 164, 56 | 32x32 | WndChgElemItem.bmp (not tiled) | 0x2220002 |
| 2 | text with scroll bar | WIDC_TEXT1 | 8, 74, 290, 172 | 282x98 | WndEditTile00.tga tiled | 0x20020000 |
| 3 | custom, Fire | WIDC_CUSTOM1 | 28, 188, 52, 212 | 24x24 | — | 0x260000 |
| 4 | custom, Water | WIDC_CUSTOM2 | 82, 188, 106, 212 | 24x24 | — | 0x260000 |
| 5 | custom, Electricity | WIDC_CUSTOM3 | 136, 188, 160, 212 | 24x24 | — | 0x260000 |
| 6 | custom, Wind | WIDC_CUSTOM4 | 190, 188, 214, 212 | 24x24 | — | 0x260000 |
| 7 | custom, Earth | WIDC_CUSTOM5 | 244, 188, 268, 212 | 24x24 | — | 0x260000 |
| 8 | button | WIDC_OK | 114, 228, 186, 248 | 72x20 | ButOk2.bmp | 0x220010 |

**Text control** (`CWndText`, `WndControl.cpp:2536-2611`):

- Tiles: the width is first reduced by 16 for the scroll bar, giving 33 columns × 12 rows = 264 x 98 at (8, 74).
- Text area: the rect deflated by 6 on each side and right −15, so client (14, 80)–(269, 166). Line spacing is 5.
- The scroll bar takes the control's right 16 px (x 274..290, y 74..172). It uses ButtVScrUp.tga and ButtVScrDown.tga
  (64x16, four 16x16 frames each), the ButtVScrBar.bmp track (16x4) and the ButtVScrPUp, PBar and PDown.bmp thumb
  (16x4 each) (`WndControl.cpp:1600-1650`).
- The scroll bar is shown even when everything fits (`CWndText::OnDraw`, :2637-2652).

**Text contents** (from `OnInitialUpdate`), from `Client/Client/ChangeAttribute.inc` (ASCII, 185 bytes), parsed with
`AddParsingString` (default colour black 0xff000000):

```
#b#cff0000ff Scroll of Attribute Change #nb#nc
After placing an applicable item in the box above, you can select one of the below icons to convert the elemental attribute of an item.
```

The first line is bold and blue (0xff0000ff), with a leading and trailing space. The second line is black and wraps
inside the 255 px area.

### 4.2 Class `CWndChangeAttribute` (`_Interface/WndField.cpp:22856-23115`, header `WndField.h:2349-2377`)

**Opening** is a bag double-click on II_SYS_SYS_SCR_SOKCHANG (`WndField.cpp:2417-2428`):

- Any open window is deleted first (SAFE_DELETE).
- `new CWndChangeAttribute`, then `SetChangeItem(scroll)`, which does scroll `SetExtra(+1)` to lock it (:23024-23028).
- Then `Initialize(&g_WndMng, APP_COMMITEM_DIALOG)`. The id argument is ignored (:22912-22916), so this is still
  APP_CHANGE_ATTRIBUTE.
- `bAble = FALSE`, so no DOUSEITEM is sent.
- The GM text command `/ChangeAttribute` opens it without a scroll (`FuncTextCmd.cpp:4867-4880`).

**OnInitialUpdate** (:22879-22910):

- Loads the text above into WIDC_TEXT1.
- Maps the element slots: index i 0..4 → WIDC_CUSTOM1..5.
- Tooltips: [0] = TID_TOOLTIP_CA_INSLOT, [1..5] = FIRE, WATER, ELEC, WIND, EARTH.
- `MoveParentCenter()` (centred).
- Initial state: `m_nAttributeNum = −1` (nothing chosen), and no item in the slot.

**OnDraw** (:22934-22952):

1. If an item is placed, its icon (`Item/<szIcon>`, colour key magenta) is drawn at STATIC1's top-left (132, 24),
   32x32, over the WndChgElemItem.bmp slot.
2. For each i in 0..4:
   - Draw frame i of `g_WndMng.m_pWndWorld->m_texAttrIcon` at the custom rect's top-left, scaled 1.5 to 24x24, alpha
     255. The texture is `Client/Icon/Icon_MonElemantkind.inc` → `icon\Icon_MonElemantkind.dds` (128x16, key 0xffff00ff),
     with `serialize 5 16 16 0 0`: five 16x16 frames left to right from (0, 0), in the order fire, water, electricity,
     wind, earth.
   - If i is the chosen element, draw the "lamp" (`FillRect`, :23030-23057) over that icon.
3. **The lamp.** With the rect at (L, T, R, B) (24x24):
   - Colours: c2 = 0xffbb00ff (opaque rgb(187,0,255)); c1 = 0x00ffffff (transparent white). The 0x00bb00ff "end" colour
     is only used to lerp at 1.0, so it has no effect.
   - Four 8 px bands, each a gradient from c2 at the outer edge to c1 inward:
     - left: x L−2 → L+6, over y T−2..B+2
     - top: y T−2 → T+6, over x L−2..R+2
     - right: x R+2 → R−6
     - bottom: y B+2 → B−6
   - The result is a 28x28 glow frame, 2 px outside the icon and 6 px inside. The corners overlap and are alpha-blended
     twice.
   - Vertex order is LT, RT, LB, RB (`_Common/2DRender.h:142`, `2DRender.cpp:246-300`). Blending is on because some
     alpha is below 0xff.
   - In CSS: `linear-gradient(to <inward>, rgba(187,0,255,1), rgba(255,255,255,0))` per band.

**Process** (:22954-22982) shows tooltips, with or without an item:

- over the slot: TID_TOOLTIP_CA_INSLOT "Place an item here to change it's elemental attribute."
- over the icons, in order: "Change to Fire Element " (with a trailing space), "Change to Water Element", "Change to
  Electric Element", "Change to Wind Element", "Change to Earth Element"
- Source: `textClient.inc:12864-12889`.

**OnSetCursor** (:22998-23022): CUR_SELECT (the hand) over the five icons, the normal cursor elsewhere.

**OnLButtonUp** (:22984-22996): a click inside an icon rect sets `m_nAttributeNum = i`. Clicking again does not
un-choose it, and choosing does not need an item to be placed.

**OnDropIcon** (:23059-23097):

- The source frame must be APP_INVENTORY; otherwise the drop is refused with `SetForbid(TRUE)`.
- The drop counts only inside STATIC1's rect, and only when the slot is empty and the item exists.
- Accepted when `CItemElem::IsEleRefineryAble(prop)` (IK3_SUIT, IK2_WEAPON_MAGIC or IK2_WEAPON_DIRECT,
  `_Common/Item.cpp:374-385`) and `m_nResistAbilityOption > 0`. The item is then placed, its icon loaded, and
  `SetExtra(+1)` locks it in the bag.
- Otherwise: `PutString(TID_GAME_NOTELEMENT)` "The attribute has not been applied to the selected item. Please finish the
  attribute refining first." (red).
- **Equipped items are not refused by the client.** Dropping onto a filled slot does nothing; the player must clear it
  first.

**OnLButtonDblClk** (:23099-23113): a double-click on the slot clears it and unlocks the item (`SetExtra(0)`).

**OnChildNotify** (:22918-22932). WIDC_OK:

- If item, scroll and element (0..4) are all set: `SendChangeAttribute(item.objid, scroll.objid, m_nAttributeNum + 1)`,
  so 1 fire, 2 water, 3 electricity, 4 wind, 5 earth (`DPClient.cpp:14797-14803`).
- In all cases it then unlocks the item and calls `Destroy()`. The destructor unlocks both (:22871-22877).

**Closing:**

- The close button and Escape call `Destroy` and send nothing.
- **It also closes when the player moves**: `WndWorld.cpp:8052` (not standing, or BMOVE) → :8487-8491.

**Pictures:**

| Picture | Exists | Size |
|---|---|---|
| WndTile00..11.tga | yes | 16x16 |
| WndChgElemItem.bmp | yes | 32x32, 24-bit, magenta key |
| WndEditTile00..08.tga | yes | 8x10 |
| ButOk2.bmp | yes | 288x20, 24-bit, magenta key, four 72x20 frames |
| ButtVScrUp.tga, ButtVScrDown.tga | yes | 64x16 |
| ButtVScrBar.bmp, ButtVScrPUp.bmp, ButtVScrPBar.bmp, ButtVScrPDown.bmp | yes | 16x4 |
| ButtWndExit.tga | yes | 60x14 |
| Client/Icon/Icon_MonElemantkind.DDS | yes (not a theme file) | 128x16 |

## 5. APP_ITEM_TRANSY, item transmute (26204 II_CHR_SYS_SCR_ITEMTRANSY_A, 26218 _B)

### 5.1 resdata.inc:27702-27767

- Window: `"WndTile00.tga"` tiled, 176 x 160, style 0x2410000.
- Title IDS_RESDATA_INC_003660 = "Trasy for Item" (`resData.txt.txt:3661`). This is the source's spelling; keep it. The
  help key is empty.

| # | Type | WIDC | Rect | Size | Picture | Text | Style |
|---|---|---|---|---|---|---|---|
| 1 | static (picture), source slot | WIDC_STATIC1 | 30, 46, 62, 78 | 32x32 | WndElemItemBlank.tga (not tiled) | — | 0x2220002 |
| 2 | static (group box) | WIDC_STATIC2 | 8, 8, 156, 24 | 148x16 | WndEditTile200.tga tiled | "Change Sex of Item" (003664) | 0x2220001 |
| 3 | button | WIDC_OK | 6, 96, 78, 116 | 72x20 | ButtOk.tga | — | 0x220010 |
| 4 | button | WIDC_CANCEL | 86, 96, 158, 116 | 72x20 | "Buttcancel.tga", which is ButtCancel.tga | — | 0x220010 |
| 5 | static (picture), twin slot | WIDC_STATIC4 | 106, 46, 138, 78 | 32x32 | WndElemItemBlank.tga | — | 0x2220002 |
| 6 | static (group box) | WIDC_STATIC5 | 72, 52, 98, 70 | 26x18 | WndEditTile200.tga tiled | "->" (003672) | 0x2220001 |

- Header tiles: 18 × 2 = 144 x 18 at (8, 8). The text is white at (12, 12), drawn twice.
- Arrow tiles: 3 × 2 = 24 x 18 at (72, 52), with "->" in white at (76, 56), drawn twice.
- WndElemItemBlank.tga is a 32-bit TGA, transparent at its corners (alpha 0).

### 5.2 Class `CWndItemTransy` (`_Interface/WndChangeFace.cpp:334-575`, header `WndChangeFace.h:45-75`)

**Opening.**

- Bag double-click (`DPClient.cpp:10753-10763`): if APP_ITEM_TRANSY is not open, `new` it, `Initialize(&g_WndMng)`,
  `Init(scroll)`, and return, so no DOUSEITEM is sent. If it is already open, nothing happens.
- The NPC menu MMI_ITEM_TRANSY opens it with `Init(NULL, bMenu = TRUE)` (`WndWorld.cpp:5935-5946`). That is the
  no-scroll, penya path.

**Init** (:350-374):

- `m_bMenu = bMenu`, and both slots are cleared.
- `m_Rect[0]` = STATIC1's rect (30, 46, 62, 78); `m_Rect[1]` = STATIC4's rect (106, 46, 138, 78).
- `m_pItemElem[1] = scroll`, with `SetExtra(1)` to lock it.

**OnInitialUpdate** (:418-429): only centres. Note that it runs before Init.

**OnDraw** (:382-417):

- If the source slot is filled:
  - the source's icon is drawn at (30, 46);
  - the twin's icon (`Item/<twin szIcon>`, key magenta, loaded every frame) is drawn at (106, 46). Both are 32x32,
    alpha 255.
- Tooltips:
  - over the source slot: the item tooltip of the source, or `TID_GAME_TRANSITEM_PUT` "Please input an item which you
    want to change." when empty;
  - over the twin slot: the full item tooltip of `m_pItemElemChange` when the source is filled, or
    `TID_GAME_TRANSITEM_PUT1` "Please input an item on the left column." when empty.
- `m_pItemElemChange` is a copy of the source with `m_dwItemId = twin id` and `m_nHitPoint = twin.dwEndurance` (:569-571).
  So the twin's tooltip keeps the source's upgrade level, options and so on.

**OnDropIcon** (:495-575):

- Source check: the drop is refused only when the shortcut is not SHORTCUT_ITEM **and** the frame is not APP_INVENTORY.
  The condition uses `&&`, so this is looser than intended.
- Equipped item → `PutString(TID_GAME_EQUIPPUT)` "Please unequip the item first." (red) and SetForbid.
- Missing item → SetForbid.
- Only the source rect counts:
  - `twin = g_pPlayer->GetTransyItem(prop)` (`_Common/Mover.cpp:2971-3030`). It needs IK2_ARMOR or IK2_ARMORETC with a
    sex, and finds the item of the other sex with the same kinds, job, handed, parts, level, ability min/max and attack
    speed, and the same set or non-set status.
  - No twin → TID_GAME_ITEM_TRANSY "This item is not available. Please input another item." (red), SetForbid.
  - Scroll path (`!m_bMenu`): scroll A (26204) refuses `dwLimitLevel1 >= 61` with TID_GAME_ITEM_TRANSY_NOT_LEVEL_0
    "Only 1-60 level items are usable.". Scroll B refuses `dwLimitLevel1 < 61` with _LEVEL_1 "Only 61-120 level items
    are usable.". In both, the message's `%s` is the scroll name, though the English texts contain no `%s`.
  - Accepted: the old source is unlocked; the new one is locked and placed; the twin is computed.
  - Dropping again replaces the source.
- A drop elsewhere in the window is accepted and does nothing.

**OnRButtonUp** (:450-457): a right click on the source slot clears it and unlocks it.

**OnChildNotify** (:458-493):

| Event | Action |
|---|---|
| WIDC_OK | `!m_bMenu` and both source and scroll set: `SendItemTransy(source, scroll, twinId, TRUE)`. `m_bMenu` and source set: `SendItemTransy(source, NULL_ID, twinId, FALSE)` (`DPClient.cpp:14834-14848`). Then **always** `Destroy()`, even when nothing was sent. |
| WIDC_CANCEL | `Destroy()` |
| close button, Escape | `Destroy()` |

- `OnDestroy` unlocks both items (:375-381).
- The window does not close on movement or on a world change.

**Pictures:**

| Picture | Exists | Size |
|---|---|---|
| WndTile00..11.tga | yes | 16x16 |
| WndElemItemBlank.tga | yes | 32x32, 32-bit |
| WndEditTile200..208.tga | yes | 8x10 |
| ButtOk.tga | yes | 288x20 |
| ButtCancel.tga | yes (resdata spells it "Buttcancel.tga"; the match is case-insensitive) | 288x20 |
| ButtWndExit.tga | yes | 60x14 |

## 6. Texts used (game texts: `Resource/textClient.inc` → `textClient.txt.txt`)

| TID | English | Colour |
|---|---|---|
| TID_GAME_CHAR_SERVERNAME | Channel | white |
| TID_TOOLTIP_CA_INSLOT | Place an item here to change it's elemental attribute. | white |
| TID_TOOLTIP_CA_FIRE / WATER / ELEC / WIND / EARTH | Change to Fire Element  / Change to Water Element / Change to Electric Element / Change to Wind Element / Change to Earth Element | white |
| TID_GAME_NOTELEMENT | The attribute has not been applied to the selected item. Please finish the attribute refining first. | red |
| TID_GAME_TRANSITEM_PUT | Please input an item which you want to change. | white |
| TID_GAME_TRANSITEM_PUT1 | Please input an item on the left column. | white |
| TID_GAME_ITEM_TRANSY | This item is not available. Please input another item. | red |
| TID_GAME_ITEM_TRANSY_NOT_LEVEL_0 / _1 | Only 1-60 level items are usable. / Only 61-120 level items are usable. | red |
| TID_GAME_EQUIPPUT, TID_GAME_CHECK_EQUIP | Please unequip the item first. | red |
| TID_DIAG_0031 | Enter name. | white |
| TID_DIAG_RULE_0 | Character Name must be 4 to 16 characters long. | red |
| TID_DIAG_0012 | The name cannot start with a number. | white |
| TID_DIAG_0013 | You cannot use special characters or spaces in a name. | white |
| TID_DIAG_0020 | Character name is not allowed. | white |
| TID_DIAG_0034 | That character name is already in use. (server answer) | white |
| TID_GAME_TICKET_DESC | Would you like to leave? | white |
