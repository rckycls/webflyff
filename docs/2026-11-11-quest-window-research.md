# The quest window: V15 against FlyffWeb (2026-11-11)

The owner asked for the quest window to look and behave like V15's, and for a smaller phone version that opens in the
middle. This note says how V15 draws it and what FlyffWeb (Piece 7 M1, `hud/quests/questWindow.ts`) does differently.
Source files are CP949; line numbers are those of the files as they are.

## V15's two windows

V15 (`__IMPROVE_QUEST_INTERFACE`, on in `Neuz/VersionCommon.h:201`) opens `APP_QUEST_EX_LIST` (`WndQuest.cpp:1162-1169`).
A quest's details open in a second window, `APP_QUEST_EX_DETAIL`, docked at the list's right edge.

**The list, `APP_QUEST_EX_LIST`** (`Resource/resdata.inc:4076-4126`): `WndTile00.tga` tiled, 336 × 416, title "Quest".
- `WIDC_GROUPBOX_QUEST_LIST` 16,8-192,24 (`:4104`): a header bar of `WndEditTile200.tga` tiles, style `0x2220051`.
  That is WSS_GROUPBOX with centring both ways, so "Quest List" is white and centred, drawn twice 1 px apart
  (`CWndStatic::OnDraw`, `_Interface/WndControl.cpp:53-112`).
- `WIDC_QUEST_LIST_TABCTRL` 16,28-320,328 (`:4086`): a tab control.
  - Its surface is the nine edit tiles (`WndEditTile00`-`08`), 15 px short of the right edge
    (`CWndTabCtrl::AdditionalSkinTexture`, `WndControl.cpp:4296-4357`).
  - The strip of `WndTabTile` sits at the bottom: rows − 2, so 280 px down, 20 tall (`:4385-4436`). The chosen tab is
    drawn over the strip (`OnDraw`, `:4183-4219`).
  - The titles are centred (`SetTabTitleAlign( ALIGN_CENTER )`, `WndQuest.cpp:1096`), 17 px above the bottom: the
    chosen one black, the others white (`WndControl.cpp:4221-4285`).
  - A tab's page fills the control less the 18 px of the strip (`InsertItem`, `:4572-4598`).
- **Four trees**, one per tab, titled by quests 6000-6003 (`WndQuest.cpp:1098-1138`):
  - Scenario, General, Request Office, Event.
  - Each tree is created with `WBS_VSCROLL`, check boxes on and at most 5 ticks (`:1098-1112`).
- **The tab and filter at first:** tab 0 (Scenario) and "In Progress" (`_Common/TreeInformation.cpp:36-37`). They are
  kept while the game runs and reset at log-in (`:88-95`).
- `WIDC_BUTTON1` "ButtRemoveQuest.bmp" 16,356-156,376 (`:4095`). It has the same id, 933, as `WIDC_REMOVE`
  (`ResData.h:1325, 1341`), and its tooltip is "Cancel Quest in Progress".
- `WIDC_COMBOBOX_QUEST_LIST` 174,332-304,348 (`:4113`): a read-only combo box (`EBS_READONLY`, `WndQuest.cpp:1145`).
  - It is drawn in `WndEditTile00` tiles, with `ButtQuickListDn.tga` in its right 20 px (`WndControl.cpp:4679-4699`).
  - A press opens its list under it (`:4724-4735`, `:4890-4902`).
  - The choices are All Quests, In Progress and Completed (`WndQuest.cpp:1146-1148`).
- `WIDC_BUTTON_CLOSE` "ButtClose.tga" 232,356-304,376 (`:4122`).
- **Where it opens:** at the right edge, 110 px down, then `MoveParentCenter()` (`WndQuest.cpp:1157-1159`). That puts it
  in the **middle of the screen** (`MoveRectCenter`, `WndBase.cpp:1805-1815`).

**The tree** (`CWndTreeCtrl`, `WndControl.cpp:766-1420`):
- Its client is the control less 4 px all round, and less 15 px more on the right for the scroll bar (`:1137-1147`).
  The scroll bar is docked in the right 16 px and always shown (`:1389-1396`, `:1186-1196`).
- **Drawing** starts 3 px into the client (`:1166-1170`).
  - A row is one font height (`:1262`, `GetFontHeight`, `WndBase.cpp:1960-1966`). Each level is 16 px further in
    (`m_nTreeTabWidth`, `:783`).
  - A folder draws `ButtTreeOpen.tga` or `ButtTreeClose.tga` at its left (`:1233-1239`).
  - A current quest draws a 13-px `ButtCheck.bmp` check box there instead, 1 px up (`:1217-1224`). The text starts
    16 px in (`m_nCategoryTextSpace`, `:784`, `:1210`).
- **Colours:**
  - Rows are ARGB(255,64,64,64) (`WndControl.h:551-557`). A completed quest is 0xffc0c0c0 with no check box
    (`WndQuest.cpp:1465-1466`).
  - The **chosen row's text turns blue** (0xff0000ff). There is no highlight bar (`WndControl.cpp:1241-1250`).
- **Presses:**
  - On a row's text: choose it (`:1277-1290`), then `WNM_CLICKED`. A quest toggles its detail; a folder only turns blue
    (`WndQuest.cpp:1279-1300`).
  - On the open/close picture: the folder opens or closes (`WndControl.cpp:1325-1333`).
  - A double press on a folder's text also opens or closes it (`:1355-1385`).
- **The wheel** scrolls a row at a time (`:1398-1418`).

**The detail, `APP_QUEST_EX_DETAIL`** (`resdata.inc:2795-2858`): 272 × 416.
- **Its title is empty:** `IDS_RESDATA_INC_006718` has no text (`Resource/resData.txt.txt:6719`). Nothing sets it
  (`PaintFrame`, `WndQuest.cpp:1692-1715`).
- **Three header bars** like the list's: "Quest Contents" 12,8-172,24, "Requirement" 12,160-172,176 and "Reward"
  12,272-172,288 (`:2805`, `:2814`, `:2823`).
- `WIDC_TEXT_CONTENTS` 12,28-252,156 and `WIDC_TEXT_REWARD` 12,292-252,374 (`:2832`, `:2841`): texts in edit tiles,
  `0x20020000` = with a scroll bar. The words are black (`WndQuest.cpp:1752-1768`).
- `WIDC_CUSTOM_CONDITION` 12,180-252,274 (`:2850`): a tree with a scroll bar and no indent (`SetCategoryTextSpace( 0 )`,
  `WndQuest.cpp:1660-1664`).
  - Its rows are black; a met one is wrapped grey (`MakeQuestConditionItems` defaults, `WndQuest.h:125-131`).
  - A pressed row turns blue and sets the destination (`WndQuest.cpp:1614-1640`).
- **Where it goes:** at the list's right edge less 2 px, at its top (`:1666-1674`). It cannot be dragged while the list
  is open (`:1682-1690`), and it follows the list when the list moves (`:1177-1189`).
- **Changing the tab or the filter closes the detail** (`:1230-1234`). So does the remove button (`:1257-1265`).

**How it opens:**
- `Q` (applet 859, `NeuzMsgProc.cpp:166-181`).
- The Start menu's Quest Diary (`WndTaskBar.cpp:2618`).

**Online:** the FlyFF wiki's v15 page agrees with the code: tabs by type and by progress, the remove button, the check
box that feeds the goal window, and Q to open
([FlyFF Wiki, Quests](https://flyff-wiki.gpotato.com.br/wiki/Quests.html)). No screenshot was readable, so the code
decides.

## FlyffWeb today, and every difference

| # | V15 | FlyffWeb (M1) |
| --- | --- | --- |
| 1 | "Quest List" header bar of WndEditTile200 tiles, white centred title | blue bold text, no bar |
| 2 | tab strip at the **bottom** of a tiled tab control, WndTabTile strip, titles centred, chosen black and others white | tab buttons at the **top**, each its own three tiles, titles left, purple |
| 3 | tree on the edit tiles with Neuz's scroll bar (ButtVScr*) on the right | white box, 1 px border, the browser's thin scroll bar |
| 4 | rows #404040; the chosen row's text blue, no bar | chosen row a pale-blue bar behind the title |
| 5 | folder: picture press or double press opens it; one press only chooses it (blue) | any press on a folder opens or closes it |
| 6 | 16 px a level; the check box or picture, then the text 16 px in | 12 px a level, 4 px gaps |
| 7 | read-only combo box in edit tiles with ButtQuickListDn | the browser's `<select>` |
| 8 | opens on **Scenario**, In Progress | opens on General, In Progress |
| 9 | opens in the **middle of the screen** | at the right edge, 110 px down |
| 10 | changing tab or filter, or the remove button, closes the detail | the detail stays open |
| 11 | detail title empty | detail titled with the quest's name |
| 12 | detail's three header bars as #1 | blue bold labels |
| 13 | contents, conditions and rewards on edit tiles, each with Neuz's scroll bar, words 6 px in | white boxes with a border and the browser's scroll bar |
| 14 | a pressed condition row turns blue | no change |
| 15 | detail docked, cannot be dragged, follows the list | docked once; it can be dragged, and moving the list leaves it behind |
| 16 | tab and filter kept until log-in | kept until the next world (M1 ruling, unchanged) |
| 17 | a GM sees "(state, id)" after titles (`WndQuest.cpp:1463`) | not shown (GM only; left out) |

The same in both: the window size and the button places, the remove rules and the confirm box, the five-tick limit and
its line, completed quests grey with no box, the tracker, the destination on the world map, Q and the Start menu.

**The phone today:** list and detail are two half-screen panels in a full-screen layout, with text at 14 px.

## What changes (this branch)

- **Desktop:** differences 1-15 are fixed. Differences 16 and 17 are left as they are.
- **Phone:**
  - The same two windows at the frame's phone scale (0.7, as the Messenger since 2026-11-10).
  - The list opens in the middle, above the task bar. With a quest chosen, the list and its detail are centred
    together.
  - Text is at least 14 px, the lists scroll by finger, and the buttons and rows have finger-sized press areas.
- **Pictures:** every one is already in the UI stage: WndEditTile00-08 and 200-208, WndTabTile, ButtVScr*,
  ButtQuickListDn, ButtCheck, buttTree*, ButtRemoveQuest and ButtClose. No convert is needed.
