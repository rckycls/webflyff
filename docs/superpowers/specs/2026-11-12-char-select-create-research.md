# Character select and character create: V15 research (2026-11-12)

What the V15 Neuz client of this server does on its Select Character, New Character and Delete Character windows, and
how FlyffWeb's lobby (main `f6a955e`) differs. Paths are under `Blouflash VS22 V15/` unless they start with `apps/`.

## 0. Sources

| What | Where |
|---|---|
| Window classes | `Source/_Interface/WndTitle.h:83-196` (`CWndDeleteChar`, `CWndSelectChar`, `CWndCreateChar`) |
| Delete window | `Source/_Interface/WndTitle.cpp:1150-1350` |
| Select window | `WndTitle.cpp:1357-2310` |
| Create window, name rules | `WndTitle.cpp:2314-2955` (`IsValidPlayerName` `:2749-2791`) |
| Character tooltip | `Source/_Interface/WndManager.cpp:6737-6806` (`PutToolTip_Character`) |
| Character list packet | `Source/Neuz/DPLoginClient.cpp:370-535` (`OnPlayerList`) |
| Create / delete / pre-join packets | `DPLoginClient.cpp:161-230`; `Source/LOGINSERVER/DPLoginSrvr.cpp:215-275` |
| Delete on the database | `Source/_Database/DbManager.cpp:284-370`; `Database.sql:10094-10186` (`CHARACTER_STR 'D1'`) |
| Block flag | `DbManager.cpp:536-582` |
| Layouts | `Resource/resdata.inc:11012` (APP_DELETE_CHAR), `:24546` (APP_CREATE_CHAR), `:24774` (APP_SELECT_CHAR) |
| Layout strings | `Resource/resData.txt.txt` (IDS_RESDATA_INC_001124-001135, 003048-003099, 006874-006905) |
| Game text | `Resource/textClient.inc` + `textClient.txt.txt` (UTF-16) |
| Name filters | `Resource/InvalidName_ENG.inc`, `Resource/Letter_ENG.inc`; `Source/_Common/ProjectCmn.cpp:763-860` |
| Start equipment | `Resource/jobItem.inc` (`job JOB_VAGRANT`), `Resource/defineItem.h:32, :248-258` |
| Build switches | `Source/Neuz/VersionCommon.h:20, :48`; `Source/Neuz/WinMain.rc:1828-1837`; every server `.rc` (IDS_2ND_PASSWORD) |
| Art | `Client/Theme/Default/` (ButtMale.bmp, ButtFemale.bmp, ButtLeft.bmp, ButtRight.bmp, ButtOk.tga, ButtCancel.tga, WndEditTile00.tga, WndTile00-11.tga, WndSelectChar.tga) |
| Online | [FlyFF Wiki, New Player Guide](https://flyff-wiki.gpotato.com.br/wiki/New_Player_Guide) |

## 1. Which branches of the C++ this server runs

- `IDS_LANG "1"`, `IDS_SUBLANG "0"` (`WinMain.rc:1828-1829`): **LANG_ENG, no sub-language**. `m_bThroughPortal` is FALSE
  unless Neuz is started from a portal (`NeuzMsgProc.cpp:265-276`), so every `__THROUGHPORTAL0810` branch for LANG_ENG
  USA/IND is off.
- `__RULE_0615` is on (`VersionCommon.h:48`): names are 4 to 16 letters, and the invalid-name and allowed-letter lists apply.
- `IDS_2ND_PASSWORD "0"` in Neuz and in every server (`*.rc`): **the 2nd password system is off**. Accept does not open the
  random number pad (`APP_2ND_PASSWORD_NUMBERPAD`); the login server's `OnPreJoin` skips the PIN check
  (`DPLoginSrvr.cpp:236-262`). The create window still asks for the Bank PIN twice (that code is only `__VER >= 15`).
  The online guide describes retail's number pad at Accept; this server's build does not show it.

## 2. Select Character (`APP_SELECT_CHAR`)

**Window.** 544 x 368, the picture `WndSelectChar.tga`, not tiled (`resdata.inc:24774`). Title "Select Character".
Centred (`MoveParentCenter`).

**Slots.** Three rectangles of 158 x 238 at (16, 16), (186, 16), (356, 16) in the client area (`OnInitialUpdate`,
`:1892-1898`: `CRect(16, 16, 174, 254)`, offset 170 each). Each is a 3D viewport (`OnDraw`, `:1599-1722`):
- perspective `D3DXMatrixPerspectiveFovLH(PI/4, w/h, near, far)`, eye (0, 0.5, -3.5), looking at (0, 0, 1);
- the model scaled 1.6 and lowered 1.15, no turn; unlit (`SetLight(FALSE)`, diffuse and ambient 1); hair tinted with the
  saved colour; the hat/cap hiding rules of `dwBasePartsIgnore` (as the world does).
- The **selected** slot gets a faint green fill, `ARGB(20, 80, 250, 80)`, inset 5 px top and bottom and moved `i` px right
  (`:1583-1592`).
- Under each slot, at (left, bottom + 10): the name. Selected: blue `0xff6060ff`, drawn twice 1 px apart (bold).
  Others: grey `0xff505050`. An empty slot shows "Available" (`TID_GAME_WND_SELECT_CHARACTER_EMPTY`) in the same colours.
- No level, job or stats are drawn on the window: they are in the tooltip.

**Motions** (`Process`, `:1462-1516`; `SelectCharacter`, `:2252-2281`; `UpdateCharacter`, `:1824-1846`):
- the selected character stands: `MTI_GETUP` once when it becomes selected, then `MTI_STAND` looping;
- every other character sits: `MTI_SIT` once, then `MTI_SITSTAND` looping. On opening, the selected one starts in
  `MTI_STAND` and the others in `MTI_SITSTAND`.

**Selection.** `m_nSelectCharacter` is static: it is kept between visits (after Create, Cancel, Delete, Back). Default 0.
- A click in a slot selects it (`OnLButtonUp`, `:2283-2305`), empty or not, unless the slot is blocked.
- Left and Right arrows move the selection, wrapping (`OnKeyUp`, `:1386-1410`).
- When a new list comes and the selected slot is blocked, the first usable one is selected (`OnPlayerList`, `:516-526`).

**Block flag** (`PLAYER_LIST`'s second field): 2 = empty slot (Neuz's default), 1 = usable, 0 = blocked (the account's
`BlockTime` is in the future, `DbManager.cpp:571-579`). Clicking or accepting a blocked character opens a box titled "Inbox"
with "You cannot use this character." (`CWndCharBlockBox`, `TID_DIAG_0068`, `TID_DIAG_0073`).

**Tooltip** on hovering a character's slot (`PutToolTip_Character`), one line each:
- the name, bold, blue (`#cff0000ff`); for a blocked one red, followed by "Connet Cut" [sic];
- "SEX: Male" / "SEX: Female";
- "Level : N", followed by "-M" for a master job (`dwJobType == 5`) or "-H" for a hero (`6`);
- "Strength : N", "Stamina : N", "Dexterity : N", "Intelligence : N";
- "Job : <job name>".

**Buttons**, 72 x 20, y 300 to 320 (`resdata.inc:24779-24798`): Back (104), Create (188), Delete (272), Accept (356).
Accept is the default button (Enter), Back has the focus. Each draw (`:1795-1809`): with a character selected, Create is
disabled and Accept and Delete enabled; with an empty slot selected, the reverse.
- **Back** (and the window's close, id 10000): drops the login server, reconnects to the certifier and sends CERTIFY
  again with the kept account, showing the login window; the server list follows (`:1997-2025`). FlyffWeb's
  `changeChannel` is this.
- **Create**: only for an empty slot; closes the select window and opens New Character for that slot (`:2026-2042`).
- **Delete**: only for a character; opens the Delete Character window over the select window (`:2043-2050`).
- **Accept**: disables itself; a blocked character gets the box above; otherwise (2nd password off) "Connecting. Please
  wait." and the cache connection, then `PRE_JOIN` (`:2051-2131`, `Connected`, `:1935-1981`). FlyffWeb's world screen
  does this part.
- No Log out button: leaving is Back, then the server list's Back.

## 3. New Character (`APP_CREATE_CHAR`)

**Window.** 544 x 368, tiled with `WndTile08.tga` (the frame is WndTile00 to WndTile11), title "New Character".
Opened for the slot chosen (`m_Player.m_uSlot`).

**Layout** (`resdata.inc:24546-24773`, client-area pixels; labels from resData.txt):

| Row | Label (x 16) | Control |
|---|---|---|
| y 48 | Character Name | edit (116, 48)-(288, 71), `WndEditTile00.tga`; tooltip "Total approved amount of letters for a name is 16 at maximum. No special letter or space is approved." |
| y 128 | Sex | `ButtMale.bmp` (118, 128), `ButtFemale.bmp` (194, 128) |
| y 152 | Hair Style | `ButtLeft.bmp` (118, 152), `ButtRight.bmp` (194, 152) |
| y 176 | Hair Color | the same two, **disabled** (`OnInitialUpdate`, `:2615-2616`) |
| y 200 | Face | the same two (they change the head mesh) |
| y 224 | Bank PIN | edit (172, 224)-(268, 244): password, digits only, 4 at most |
| y 248 | Confirm Bank PIN | edit (172, 248)-(268, 268): the same |
| y 272 | "Character PIN is the same as your Bank PIN." in red (`m_dwColor` 255, 0, 0) | |
| y 300 | | `ButtOk.tga` (176, 300), `ButtCancel.tga` (280, 300); OK is the default button |

The two statics at y 76 and 97 are Thai only (disabled for every other language).

**Preview** (`OnDraw`, `:2358-2593`): a viewport at x 280 to 550, y 0 to 305 (270 x 305; the window's client area ends at
544, so its right edge is cut), orthographic `D3DXMatrixOrthoLH(h * aspect, h)` with `h = cos(PI/8) / sin(PI/8)`, eye (0, 0,
-5) looking at (0, 0, 3), the model scaled 1.4 and lowered 1.1, unlit, the hair tinted with the hair style's default colour.
No turning, no mouse control.

**Defaults** (`CWndCreateChar()`, `:2314-2324`; `OnInitialUpdate`, `:2595-2649`): **female**, skin set 0, face 0,
costume 0, Vagrant; hair style and head chosen **at random** from 0 to 4 (`xRandom(0, MAX_BASE_HAIR)`,
`xRandom(0, MAX_DEFAULT_HEAD)`, both 5). The name edit has the focus.

**Sex** (`SetSex`, `:2651-2681`): the body model of that sex, its motion `MTI_STAND` for a man and `MTI_STAND2` (199,
"ponytail in front") for a woman, dressed in the Vagrant's start equipment of `jobItem.inc`: suit, gauntlets, boots and
the Wooden Sword (male 502, 506, 510, 21; female 504, 508, 512, 21). Hair and head are kept.

**Hair Style / Face** (`:2805-2836`): left and right step through 0 to 4 and wrap. The hair colour follows the style
(`nMaleHairColor` / `nFeMaleHairColor`).

**OK** (`:2838-2933`), checks in this order, each failing one opening a message box and sending nothing:
1. The name, trimmed (`IsValidPlayerName`, `:2749-2791`):
   - empty: "Enter name." (`TID_DIAG_0031`);
   - under 4 or over 16 characters: "Character Name must be 4 to 16 characters long." (`TID_DIAG_RULE_0`);
   - a digit first: "The name cannot start with a number." (`TID_DIAG_0012`);
   - any character not a letter or digit: "You cannot use special characters or spaces in a name." (`TID_DIAG_0013`).
2. `IsInvalidName` (the name, lower-cased, holds any word of `InvalidName_ENG.inc`, lower-cased) or a letter missing from
   `Letter_ENG.inc` (A-Z, a-z, 0-9): "Character name is not allowed." (`TID_DIAG_0020`).
3. The Bank PIN: empty: "Enter the Bank PIN to continue."; under 4 digits: "The Bank PIN should be a 4 digit number.";
   "0000": "Invalid Bank PIN."; the confirmation empty: "Confirm Bank PIN."; different: "Bank PINs do not match."
4. OK and Cancel are disabled, and `CREATE_PLAYER` goes with the slot, the name, face, costume, skin set, hair mesh, the
   hair colour as `ARGB(255, r, g, b)`, sex, job (Vagrant), head mesh and the PIN as a number (`SendCreatePlayer`).

The server answers with a new `PLAYER_LIST`; `OnPlayerList` closes the create window and opens the select window
(`DPLoginClient.cpp:383-387`), the new character's slot still selected. An error (a name in use) comes as `ERROR`.

**Cancel**: back to Select Character, the selection kept.

## 4. Delete Character (`APP_DELETE_CHAR`)

**Window.** 272 x 208, tiled with `WndTile07.tga` (WndTile00-11), **modal**, centred over the select window, title
"Delete Character" (`Initialize`, `:1188-1241`).

| Control | Where | Text |
|---|---|---|
| `WIDC_CONTROL1` | (68, 10)-(192, 30) | "Password for deleting character" |
| `WIDC_STATIC1` | (70, 32)-(248, 52) | "Enter The Password" |
| `WIDC_EDIT1` | (70, 62)-(178, 82), `WndEditTile00.tga` | password style, focused |
| `WIDC_OK` | (46, 142) `ButtOk.tga` | OK |
| `WIDC_CANCEL` | (136, 142) `ButtCancel.tga` | CANCEL |

**OK** (`OnChildNotify`, `:1270-1349`), LANG_ENG's default branch: any text of 1 to 63 characters is sent (no digit rule);
anything else empties the edit and opens "Please Re-enter SSN." (`TID_DIAG_0044`). Sending disables OK and Cancel and sends
`DEL_PLAYER`: account, password hash, `GetDeleteKey(text)` (the salted MD5, as the password), the player id, the auth key
and the slot's messenger friend ids (`SendDeletePlayer`, `DPLoginClient.cpp:161-184`).

The server: `CHARACTER_STR 'D1'` (`Database.sql:10094-10186`) refuses an empty key or a character not of the account
(`fError 1` gives `ERROR_NO_SUCH_GROUP`), refuses during a guild war (`fError 3`, `ERROR_WARTIME`), otherwise deletes and
sends a new `PLAYER_LIST`. **In this dump the Bank PIN comparison is commented out (`set @Exists = 1`): any key deletes.**
That is a server matter, noted for the owner.

On the new list Neuz closes the delete window (`DPLoginClient.cpp:388-391`); the select window stays, the emptied slot
still selected and now "Available".

**Cancel** closes the window.

## 5. Packets

| Packet | When | FlyffWeb |
|---|---|---|
| `PLAYER_LIST` (in) | after GETPLAYERLIST, CREATE_PLAYER, DEL_PLAYER | `decodeLoginMessage` → `CharacterSummary` (`blocked` is the block flag) |
| `CREATE_PLAYER` (out) | create OK | `encodeCreatePlayer` (unchanged) |
| `DEL_PLAYER` (out) | delete OK | `encodeDeletePlayer(..., deleteKey(text), ...)` (unchanged) |
| `ERROR` (in) | a refused create or delete | `errorText` (unchanged) |
| `PRE_JOIN` (out) | Accept | the world session (unchanged) |
| `LOGIN_NUM_PAD`, `LOGIN_PROTECT` (in) | only with the 2nd password on | decoded, not used: off here |

## 6. FlyffWeb (main `f6a955e`) against V15

| # | V15 | FlyffWeb main |
|---|---|---|
| 1 | Title "Select Character" | "Your characters" |
| 2 | Slots at V15's pixel rectangles | percentages of the picture |
| 3 | Characters animated: the selected stands up and stands, the others sit | a still picture of the stand motion |
| 4 | Selected: green fill, blue bold name; others grey; empty "Available" | outline, blue name, "Level N · Job"; "Empty — Create" button |
| 5 | Stats only in a hover tooltip (sex, level -M/-H, STR/STA/DEX/INT, job) | none |
| 6 | One row: Back, Create, Delete, Accept, enabled by the selection | Back/Create/Log out row plus Delete and Enter under the selected slot |
| 7 | Left/Right arrows; Enter accepts | none |
| 8 | Blocked characters (flag 0) refused with "You cannot use this character." | not handled |
| 9 | No Log out | a Log out button |
| 10 | New Character: V15 layout, sprite buttons, preview on the right | a plain form, no preview |
| 11 | Female by default, random hair and face | male, hair 1, head 1 |
| 12 | Hair Color row shown, disabled | absent |
| 13 | "Face" row | "Head" stepper |
| 14 | "Character name is not allowed." for invalid names | not checked |
| 15 | Red note "Character PIN is the same as your Bank PIN." | a hint of its own |
| 16 | Delete: a modal over the select window, "Password for deleting character", 1-63 characters | a separate screen asking a 4-digit Bank PIN |
| 17 | After delete the emptied slot stays selected | the first character is selected |
| 18 | The selection is kept between visits | the first character every time |

## 7. Not in scope

- The random number pad at Accept (off on this server).
- The 15/30 s pre-join timeout and "Connecting. Please wait." box: the world screen's.
- Japanese voice on select (`LANG_JAP` only).
