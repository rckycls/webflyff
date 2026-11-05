# Upgrade Specialist: Piercing, Safe Upgrade, Safe Piercing (V15 research, 2026-11-05)

Read from the V15 source for the browser port. Paths: `Source/...` is
`C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source`, `Resource/...` and `Client/Theme/Default` are under
`Blouflash VS22 V15`. Line numbers are the files' own (character.inc / textClient.* are UTF-16; their line numbers are the
same after `iconv`). This builds on `docs/superpowers/specs/2026-11-05-item-windows-research.md` (the upgrade cursor and its
APP_SMELT_SAFETY_CONFIRM box) and does not repeat it.

Short answer: all three entries work on the V15 server as it is. Piercing opens `CWndPiercing` (APP_PIERCING) and
sends PIERCING_SIZE 0xf000d008. Safe Upgrade and Safe Piercing open the same class `CWndSmeltSafety` (APP_SMELT_SAFETY) in two
modes. It repeats SMELT_SAFETY 0x70007000 every 2 s and the server answers with snapshot 0x9900. The port needs two new
encoders (they must allow NULL_ID), one new snapshot reader, and two windows. No server change is needed (§9).

---

## 1. Version gates

`__MAINSERVER` is defined in both headers (`Neuz/VersionCommon.h:3`, `WORLDSERVER/VersionCommon.h:3`), so the
`#if defined(__INTERNALSERVER)` blocks (Neuz `:261-405`, World `:238-338`) are off. `__VER` is 15 in both (`:4`).
The feature code tests `__VER`, not the named flag, so the named flag being commented out in WORLDSERVER does not matter.

| Flag (comment name) | Test used in the code | Neuz | WorldServer | Effect |
|---|---|---|---|---|
| `__SMELT_SAFETY` | `#if __VER >= 14` | defined `:172` | commented `:178`, but `__VER>=14` is true | on in both |
| `__15_5TH_ELEMENTAL_SMELT_SAFETY` | `#if __VER >= 15` | defined `:225` | commented `:225`, but `__VER>=15` is true | on in both (4 modes, element mode) |
| `__EXT_PIERCING` | `#if __VER >= 12` | commented `:121` | commented `:131` | on through `__VER`: piercing costs a flat 100000, `IsPierceAble(NULL_ID, TRUE)` |
| `__Y_NEW_ENCHANT` | `#if __VER >= 8` | (gate only) | (gate only) | on: the piercing material is the Moonstone, not the dice |
| `__ULTIMATE` (`__VER < 9` suit-only check) | `#if __VER < 9` | | | off: not only suits |
| `__CSC_VER8_4` / `__CSC_VER8_5` | `#if __VER >= 8` | | | on (beauty-shop guard; the bag's "die flag") |
| `__WINDOW_INTERFACE_BUG` | `#ifdef` | defined `:166` | n/a | on: closing the bag closes APP_PIERCING |
| `__STATIC_ALIGN` | `#if __VER >= 14` | defined `:180` | n/a | static text alignment flags work |
| `__WND_EDIT_NUMBER_MODE` | `#if __VER >= 14` | defined `:178` | n/a | `EBS_NUMBER`: digits only in the goal edit |
| `__IMPROVE_MAP_SYSTEM` | `#ifdef` | `:390`, inside the INTERNALSERVER block: **off** | n/a | a window's `OnDraw` paints **after** its child controls (`_Interface/WndBase.cpp:529-575`, the `#ifndef` branch), so item icons and gauges go over the slot and bar pictures |
| `__QUIZ` | `#ifdef` | `:229` | `:187` | on: in the quiz world the server answers SMELT_SAFETY with 0 |
| `__PERIN_BUY_BUG` | `#ifdef` | n/a | `:193` | on: gold changes are sent as SETPOINTPARAM DST_GOLD (clamped) |

---

## 2. The NPCs and their menu entries

| NPC key | character.inc | Name (character.txt.txt) | Menu entries (AddMenu lines) |
|---|---|---|---|
| `MaFl_Bobochan` (Flaris) | `:6247`, AddMenu `:6251-6261`, SetName `:6270-6273`, image `char_Boboku.tga` | `IDS_CHARACTER_INC_000679` "[Upgrade Specialist] BoBoChan" (`:680`) | DIALOG, SMELT_CHANGEGWEAPON, SMELT_CHANGEUWEAPON, ATTRIBUTE, PIERCING, SMELT_REMOVE_PIERCING, SMELT_REMOVE_JEWEL, SMELT_SAFETY_GENERAL, _ACCESSORY, _PIERCING, _ELEMENT |
| `MaDa_Laydian` (Darkon) | `:8034`, AddMenu `:8038-8048`, SetName `:8057-8060`, image `char_Remine.tga` | `IDS_CHARACTER_INC_000849` "[Upgrade Expert] Radyan" (`:850`) | the same 11 entries |
| `MaSa_Bulrox`, `MaDa_Remine`, `MaDa_Kablloc` | `:1273`, `:2546`, `:2703` | "Bulrox", "Remine", "Kablloc" | DIALOG, TRADE, PIERCING (Piercing only) |

The menu is built in ascending MMI order (ShowMoverMenu; `moverMenu.ts` already does that). The text is `TID_MMI_DIALOG + id`.

| MMI | Value (`Resource/defineNeuz.h`) | TID (defineText.h) | English (textClient.txt.txt) | `CWndWorld::OnCommand` (`_Interface/WndWorld.cpp`) |
|---|---|---|---|---|
| MMI_DIALOG | 0 (`:92`) | 7000 | "Dialog" | already built |
| **MMI_PIERCING** | **23** (`:115`) | TID_MMI_PIERCING 7023 (`:350`) | "Piercing" (`:1131`) | `:5681-5733`: does nothing (silent `break`) when any of APP_TRADE, APP_REPAIR, APP_SHOP_, APP_COMMON_BANK, APP_CONFIRM_BANK, APP_BANK_PASSWORD, APP_DROP_ITEM, APP_GUILD_BANK, APP_BEAUTY_SHOP_SKIN, APP_BEAUTY_SHOP_EX, APP_TEST, APP_COMMERCIAL_ELEM, APP_REMOVE_ELEM or APP_PIERCING itself is open. Otherwise `new CWndPiercing; Initialize(&g_WndMng, APP_PIERCING)` (`:5729-5731`) |
| MMI_SMELT_CHANGEGWEAPON | 54 | 7054 | "Create Unique Weapon" | not in scope |
| MMI_SMELT_CHANGEUWEAPON | 55 | 7055 | "Create Ultimate Weapon" | not in scope |
| MMI_ATTRIBUTE | 59 | 7059 | "Remove Element upgrading" | not in scope |
| MMI_SMELT_REMOVE_PIERCING | 72 | 7072 | "Remove a Pierced Card" | not in scope |
| MMI_SMELT_REMOVE_JEWEL | 95 | 7095 | "Remove Jewel from Ultimate Weapon" | not in scope |
| **MMI_SMELT_SAFETY_GENERAL** | **134** (`:259`) | 7134 | "Safe Upgrade" (`:2700`) | `:5989-6003`: when trading or running an own vendor shop (`m_vtInfo.GetOther() \|\| VendorIsVendor()`), shows TID_GAME_SMELT_SAFETY_ERROR16 and stops. Otherwise deletes any open smelt-safety window and opens `new CWndSmeltSafety(WND_NORMAL)`, `Initialize(NULL)` |
| MMI_SMELT_SAFETY_ACCESSORY | 135 (`:260`) | 7135 | "Safe Accessory Upgrade" | `:6004-6018`, same with WND_ACCESSARY (optional, same window) |
| **MMI_SMELT_SAFETY_PIERCING** | **136** (`:261`) | 7136 | "Safe Piercing" (`:2702`) | `:6019-6033`, same with **WND_PIERCING** |
| MMI_SMELT_SAFETY_ELEMENT | 167 (`:299`) | 7167 | "Safe Element Upgrade" | `:6036-6049`, same with WND_ELEMENT (optional) |

The admin text commands `/ssn /ssa /ssp /sse` open the same windows (`_Interface/FuncTextCmd.cpp:4910-4971, 5470-5478`; AUTH_ADMINISTRATOR).

---

## 3. Piercing: `CWndPiercing` (APP_PIERCING 493)

Source: `_Interface/WndPiercing.h`, `_Interface/WndPiercing.cpp` (whole class, 366 lines).

### 3.1 resdata.inc entry (`Resource/resdata.inc:23844-23954`)

`APP_PIERCING "WndTile00.tga" 1 192 256 0x2410000 26`. The frame is tiled (WndTile00..). The window is 192 x 256. The style is
WBS_CAPTION | WBS_SOUND | WBS_MOVE. The title is IDS_RESDATA_INC_002778 "Piercing".

Control columns: type, id, picture, tiled, left, top, right, bottom, style. The trailing `0 0 0 0` are m_bVisible,
m_bGroup, m_bDisabled and m_bTabStop (`_Common/ResManager.cpp:76-140`). Style bits come from `Resource/WndStyle.h:20-65`:
0x2220000 = WBS_CAPTION|WBS_NOFRAME|WBS_CHILD; low bits WSS_GROUPBOX 1, WSS_PICTURE 2, WSS_MONEY 4, WSS_ALIGNHCENTER 0x10,
WSS_ALIGNVCENTER 0x40. 0x220010 = WBS_NOFRAME|WBS_CHILD|WBS_HIGHLIGHT.

| Line | Type | WIDC | Picture | Tiled | Rect (l,t,r,b) | Style | Text (resData.txt.txt) |
|---|---|---|---|---|---|---|---|
| 23854 | STATIC | WIDC_STATIC1 | "" | 1 | 22,46,70,62 | 0x2220000 | "Item" (002780) |
| 23863 | STATIC | WIDC_STATIC2 | "" | 1 | 22,86,100,102 | 0x2220000 | "Moonstone" (002782) |
| 23872 | STATIC | WIDC_STATIC3 | "" | 1 | 22,130,102,146 | 0x2220000 | "Gprotect ->" (002784) |
| 23881 | BUTTON | WIDC_OK | ButtOk.tga | 0 | 12,192,84,212 | 0x220010 | ("Button", not drawn) |
| 23890 | BUTTON | WIDC_CANCEL | ButtCancel.tga | 0 | 94,192,166,212 | 0x220010 | ("Button") |
| 23899 | STATIC | WIDC_STATIC5 (slot 0: item) | WndElemItemBlank.tga | 0 | 112,38,144,70 | 0x2220002 (PICTURE) | "" |
| 23908 | STATIC | WIDC_STATIC6 (slot 1: Moonstone) | WndElemItemBlank.tga | 0 | 112,80,144,112 | 0x2220002 | "" |
| 23917 | STATIC | WIDC_STATIC7 (slot 2: GProtect) | WndElemItemBlank.tga | 0 | 112,122,144,154 | 0x2220002 | "" |
| 23926 | STATIC | WIDC_STATIC8 | ButtMoney.tga | 0 | 24,162,46,182 | 0x2220000 | "" |
| 23935 | STATIC | WIDC_STATIC9 (cost) | "" | 1 | 58,164,144,180 | 0x2220000, plus WSS_MONEY at run time | "Static" (002798), replaced every frame |
| 23944 | STATIC | WIDC_STATIC4 | WndEditTile200.tga (9 pieces) | 1 | 8,8,168,30 | 0x2220001 (GROUPBOX) | "Pierce Item" (002800) |

Static text (`_Interface/WndControl.cpp:44-203`): a plain static draws its title at (2,2) in 0xff2e70a9, twice with a 1 px
x offset (bold), in the theme text font. WSS_MONEY formats the title with thousands separators (`GetNumberFormatEx`). A group box
draws its title at (4,4), or higher when the font is taller than 14 px, in 0xffffffff, also bold. All tooltips are empty.

### 3.2 Opening (`OnInitialUpdate`, `WndPiercing.cpp:125-156`)

- `Initialize` uses `InitDialog(APP_PIERCING, 0, 0, parent)` (`:158-161`), which is not modal.
- It opens the bag (`CreateApplet(APP_INVENTORY)`) and puts the window beside it, at the bag's top. When the bag's left x is
  more than half the screen width, the window goes on the bag's left (`bag.left - window width`). Otherwise it goes on the
  bag's right (`bag.left + bag width`) (`:129-140`).
- The slots are m_Rect[0..2] = the rects of WIDC_STATIC5/6/7 (`:142-148`). WIDC_STATIC9 gets WSS_MONEY (`:150-151`).
- It starts the effect XI_INT_INCHANT 1716 on the player (`:154-155`). The effect stays while the window is open (it is
  deleted in the destructor, `:66-73`). This is the same effect the upgrade cursor uses.

### 3.3 Drop rules (`OnDropIcon`, `:182-290`)

The source must be the bag. The test is `!(SHORTCUT_ITEM) && !(from APP_INVENTORY)` → FALSE, so in Neuz only a drag that is
neither an item nor from the bag is refused. Then, in order:

| Check | Result |
|---|---|
| the item is equipped (`m_Inventory.IsEquip`) | TID_GAME_EQUIPPUT "Please unequip the item first." (red); `SetForbid` |
| drop point in m_Rect[0] (item slot) | `!IsPierceAble(NULL_ID, TRUE)` (no next socket possible, or the kind cannot be pierced) gives TID_PIERCING_POSSIBLE "You can pierce 4 sockets into suits." Next, `dwItemRare == 0xffffffff` gives TID_PIERCING_POSSIBLE_ITEM "The item cannot be pierced.". Otherwise the old slot 0 item's extra goes to 0, the new item gets extra 1, and **slots 1 and 2 are emptied** (their extra goes to 0) |
| drop point in m_Rect[1] | only when slot 0 is filled (otherwise nothing happens). The item must be Moonstone 2036 or Event Moonstone 2083, else TID_SBEVE_NOTUSEITEM "You cannot use that item.". The old slot 1 extra goes to 0 and the new one gets extra 1 |
| drop point in m_Rect[2] | only when slot 0 is filled. The item must be Scroll of GProtect 10465 (II_SYS_SYS_SCR_PIEPROT), else TID_SBEVE_NOTUSEITEM. The old slot 2 extra goes to 0 and the new one gets extra 1 |
| elsewhere | nothing |

`IsPierceAble(kind3, bSize)` (`_Common/Item.cpp:694-741`) adds 1 to the current size when bSize is TRUE. It returns TRUE for
IK3_SUIT 18 while the size is at most MAX_PIERCING_SUIT 4. It also returns TRUE for IK3_SHIELD 16, IK2_WEAPON_DIRECT 2 and
IK2_WEAPON_MAGIC 3 while the size is at most MAX_PIERCING_WEAPON 10, and for a vis pet while it is at most MAX_VIS
(`_Common/Piercing.h:4-7`).

A right click (`OnRButtonUp`, `:336-366`) on slot 0 empties all three slots. On slot 1 or 2 it empties that slot. Each
emptied slot's extra goes to 0. A left click does nothing (`:173-181`). The bag does not double-click items into this
window.

"Extra" is the bag's reservation (`CItemBase::m_dwExtra`). While it is above 0 the bag draws the item at alpha 60, shows the
count as `num - extra`, and does not let the item be dragged or used. The piercing window does not set the bag's die flag
(see §4.12), so the reserved item is fully locked.

### 3.4 Drawing (`OnDraw`, `:75-123`)

- For each filled slot: the item icon at the slot's top left at alpha 255. When the stack is above 1, the number
  `GetExtra()` (always 1) is drawn at (slot.right-11, slot.bottom-11) in 0xff1010ff. The item tooltip shows on hover.
- WIDC_STATIC9's title is "100000" when slot 0 is filled (`__EXT_PIERCING`: a flat 100000), else "0". With WSS_MONEY it
  shows as "100,000" / "0".

### 3.5 Buttons and the confirm box (`OnChildNotify`, `:292-321`; `CPiercingMessageBox`, `:17-45`)

- **OK** (WIDC_OK): needs slots 0 and 1 filled (otherwise it does nothing). It opens a CWndMessageBox, MB_OKCANCEL, with
  TID_PIERCING_ERROR_NOTICE "Do you want to pierce this item?" (`g_WndMng.OpenCustomBox("", box, this)`).
  - The box's OK sends `SendPiercingSize(slot0, slot1, slot2 or NULL_ID)`, closes the box and **closes the piercing window**
    (its `OnDestroy` sets every slot's extra to 0, `:327-334`). The window does not wait for the answer.
  - The box's Cancel closes only the box.
- **Cancel** (WIDC_CANCEL): closes the window.
- The window also closes when the player moves (`WndWorld.cpp:8051` condition, `:8360-8362`), when the bag closes
  (`WndField.cpp:1047-1050`, `__WINDOW_INTERFACE_BUG`), and when a duel is accepted (`WndDuelConfirm.cpp:222-224`).

### 3.6 Packet: PIERCING_SIZE

`CDPClient::SendPiercingSize` (`Neuz/DPClient.cpp:14824-14831`), `PACKETTYPE_PIERCING_SIZE (DWORD)0xf000d008`
(`_Network/MsgHdr.h:515`):

| Offset | C type | Value |
|---|---|---|
| 0 | DWORD | DPID_UNKNOWN 0xffffffff (BEFORESENDSOLE, `_Network/Net/Include/dpmng.h:32-35`) |
| 4 | DWORD | 0xf000d008 |
| 8 | OBJID (u32) | the item (slot 0) |
| 12 | OBJID (u32) | the Moonstone (slot 1) |
| 16 | OBJID (u32) | the GProtect (slot 2), or **NULL_ID 0xffffffff** |

### 3.7 Server (`CDPSrvr::OnPiercingSize`, `WORLDSERVER/DPSrvr.cpp:2922-2934`, ON_MSG `:299`; `CItemUpgrade::OnPiercingSize`, `WORLDSERVER/ItemUpgrade.cpp:120-239`)

The checks run in this order. Any refusal sends only what the table says.

| # | Check | On refusal |
|---|---|---|
| 1 | item and Moonstone exist and are usable server-side (`IsUsableItem`: extra 0) | nothing |
| 2 | trading or own vendor | nothing |
| 3 | item equipped | DEFINEDTEXT TID_GAME_EQUIPPUT |
| 4 | `IsPierceAble(NULL_ID, TRUE)` | DEFINEDTEXT TID_PIERCING_POSSIBLE_ITEM "The item cannot be pierced." |
| 5 | material is 2036 or 2083 | DEFINEDTEXT TID_SBEVE_NOTUSEITEM |
| 6 | slot 2, when it exists and is usable, is 10465 | DEFINEDTEXT TID_SBEVE_NOTUSEITEM |
| 7 | gold >= 100000 | DEFINEDTEXT TID_GAME_LACKMONEY "You do not have enough Penya." |

When all checks pass:
- It takes 100000 Penya (`AddGold(-100000)` gives SETPOINTPARAM DST_GOLD, `_Common/Mover.cpp:567-620`).
- The chance is `GetSizeProb` (`:241-262`): `tSuitProb` for suits, `tWeaponProb` for shields and weapons, indexed by the
  next size, in 1/10000 (`Resource/ItemUpgrade.lua:5-6`: suits {10000, 8000, 3200, 800}; weapons {8000, 4000, 2000, 1000,
  500, 249, 124, 62, 32, 16}). `HighRateProfile::Chance` (`_Common/HighRateProfile.h:31-36`) is ×1 here (SuccessPercent 100,
  capped at 10000).
- **Fail** (`xRandom(10000) >= chance`): PLAYSOUND SND_INF_UPGRADEFAIL 13, CREATESFXOBJ XI_INT_FAIL 1715 at the player (to
  everyone near), DEFINEDTEXT TID_MMI_PIERCINGFAIL "Piercing failed.". **Without a GProtect the item is destroyed**
  (`RemoveItem(item, 1)`, which sends UPDATE_ITEM UI_NUM 0).
- **Success**: PLAYSOUND SND_INF_UPGRADESUCCESS 14, CREATESFXOBJ XI_INT_SUCCESS 1714, UPDATE_ITEM UI_PIERCING_SIZE = size + 1,
  DEFINEDTEXT TID_MMI_PIERCINGSUCCESS "Piercing Succeeded.".
- In both cases the Moonstone count goes down 1 (UPDATE_ITEM UI_NUM). When the third id is not NULL_ID and the scroll is
  usable, the GProtect count goes down 1.

`CMover::RemoveItem` is `UpdateItem(id, UI_NUM, num - n)` (`_Common/Mover.cpp:2343-2348`).

### 3.8 How Neuz shows the answers

Neuz has no handler of its own for this packet. The texts (in their TID colours), the sound, the effect, the item update and
the gold come through the general handlers, which the port already has: DEFINEDTEXT 0x0095, PLAYSOUND 0x00d2,
CREATESFXOBJ 0x000f, UPDATE_ITEM 0x0018 (UI_PIERCING_SIZE 6, UI_NUM), and SETPOINTPARAM.

---

## 4. Safe Upgrade / Safe Piercing: `CWndSmeltSafety` (APP_SMELT_SAFETY 828)

Source: class `_Interface/WndField.h:2471-2556`; code `_Interface/WndField.cpp:23619-25234`.
Constants: `SMELT_MAX = 10` (`.h:2479`), `ENCHANT_TIME = 2` seconds (`:2480`, `SEC(x) = 1000*x`, `_Common/timer.h:5`),
`EXTENSION_PIXEL = 32`, `HALF_EXTENSION_PIXEL = 16` (`:2481`), `GENERAL_NON_USING_SCROLL2_LEVEL = 7`,
`ELEMENTAL_NON_USING_SCROLL2_LEVEL = 10` (`:2483`). The modes are `WND_NORMAL, WND_ACCESSARY, WND_PIERCING, WND_ELEMENT` (`:2475`).

### 4.1 resdata.inc entry (`Resource/resdata.inc:1310-1771`)

`APP_SMELT_SAFETY "WndTile00.tga" 1 304 544 0x2410000 26`. The frame is tiled and the window is 304 x 544, with
WBS_CAPTION|WBS_SOUND|WBS_MOVE. The resdata title IDS_RESDATA_INC_006428 "Safe Upgrade" is **replaced** by the mode's title
(§4.3). Every control's title is "" unless the table says otherwise.

Rows: row i (0..9) has top = 60 + 42·i and bottom = top + 32. The four columns:

| Column | WIDC ids (row 0..9) | Picture | Rect x (base) | Style | resdata lines |
|---|---|---|---|---|---|
| Material | WIDC_STATIC11..20 | WndChgElemItem.bmp | 8..40 | 0x2220002 (PICTURE) | 1329-1418 |
| Scroll 1 (protection, required) | WIDC_STATIC41..50 | WndChgElemItem.bmp | 62..94 | 0x2220002 | 1419-1508 |
| Scroll 2 (smelting, optional) | WIDC_STATIC61..70 | WndChgElemItem.bmp | 98..130 | 0x2220002 | 1617-1706 |
| Result bar | WIDC_STATIC31..40 | Window02.bmp | 116..284 | 0x2220052 (PICTURE, HCENTER, VCENTER) | 1509-1598 |

The single controls:

| Line | Type | WIDC | Picture | Tiled | Rect (l,t,r,b) base | Style | Tooltip (resData.txt.txt) |
|---|---|---|---|---|---|---|---|
| 1320 | STATIC | WIDC_STATIC1 (target item slot) | WndChgElemItem.bmp | 0 | 130,8,162,40 | 0x2220002 | "" |
| 1707 | STATIC | WIDC_TITLE_NOW_GRADE | "" | 0 | 18,16,118,32 | 0x2220010 (HCENTER) | "" |
| 1716 | STATIC | WIDC_TITLE_MAX_GRADE | "" | 0 | 174,16,274,32 | 0x2220010 | "" |
| 1743 | STATIC | WIDC_NOW_GRADE | "" | 0 | 59,34,79,52 | 0x2220010 | "" |
| 1734 | EDITCTRL | WIDC_EDIT_MAX_GRADE | WndEditTile00.tga (9 pieces) | 1 | 212,34,236,52 | 0x20000, plus EBS_NUMBER at run time | "" |
| 1752 | BUTTON | WIDC_BUTTON_PLUS | ButItemPlus.BMP | 0 | 196,36,210,52 | 0x220010 | "" |
| 1761 | BUTTON | WIDC_BUTTON_MINUS | ButItemMinus.BMP | 0 | 238,36,252,52 | 0x220010 | "" |
| 1599 | BUTTON | WIDC_BUTTON_START | ButtStart.bmp | 0 | 30,480,94,500 | 0x220010 | "Press START to begin Safe Upgrade.  Pressing STOP will cancel Safe Upgrade." (006493) |
| 1608 | BUTTON | WIDC_BUTTON_STOP | Buttstop.bmp | 0 | 114,480,178,500 | 0x220010 | "Safe Upgrade has stopped." (006495) |
| 1725 | BUTTON | WIDC_BUTTON_RESET | ButtReset.BMP | 0 | 197,480,269,500 | 0x220010 | "Press RESET to clear the Safe Upgrade Menu.  Can only be done when the Safe Upgrade is \*not\* in progress." (006529) |

The plus button is left of the edit and the minus button is right of it (as in the resdata).

### 4.2 Opening and layout per mode (`Initialize` `:23689-23693`, `OnInitialUpdate` `:23695-23878`)

- `InitDialog(APP_SMELT_SAFETY, 0, CPoint(0,0), NULL)`: not modal.
- It sets the two title statics (§4.3) and calls `RefreshInformation()` (NOW shows "--", §4.5), then `SetTitle` with the
  mode title.
- **NORMAL and ELEMENT** (`:23784-23852`) widen the layout, because the scroll 2 column overlaps the base result bars:
  - every result bar WIDC_STATIC31..40 moves **+32** in x;
  - WIDC_STATIC1, WIDC_TITLE_NOW_GRADE, WIDC_TITLE_MAX_GRADE, WIDC_NOW_GRADE, WIDC_EDIT_MAX_GRADE, PLUS, MINUS, START, STOP
    and RESET move **+16** in x;
  - the window becomes **336** wide.
- **ACCESSARY and PIERCING** (`:23853-23862`) keep the base layout and hide and disable WIDC_STATIC61..70 (scroll 2 column).
- Every mode: EBS_NUMBER is added to the edit and the edit is disabled (`:23864-23867`). The bag opens
  (`CreateApplet(APP_INVENTORY)`) and gets `SetDieFlag(TRUE)` (`:23869-23871`). The textures SafetyGauge.bmp,
  SafetySuccess.bmp and SafetyFailure.bmp load with colour key 0xffff00ff (magenta is transparent) (`:23873-23875`).
- Last, `MoveParentCenter()` centres the window on the screen (`:23877`).

Final rects in the **widened** modes (NORMAL, ELEMENT); the material and scroll columns do not move:

| Control | Rect |
|---|---|
| WIDC_STATIC1 | 146,8,178,40 |
| TITLE_NOW_GRADE / TITLE_MAX_GRADE | 34,16,134,32 / 190,16,290,32 |
| NOW_GRADE / EDIT_MAX_GRADE | 75,34,95,52 / 228,34,252,52 |
| PLUS / MINUS | 212,36,226,52 / 254,36,268,52 |
| START / STOP / RESET | 46,480,110,500 / 130,480,194,500 / 213,480,285,500 |
| result bar row i | 148, 60+42i, 316, 92+42i |

### 4.3 What each mode takes

Item ids are from `Resource/defineItem.h`. Names and icons are from `Resource/propItem.txt` and `propItem.txt.txt`.

| | **NORMAL** = Safe Upgrade (MMI 134) | ACCESSARY (135, optional) | **PIERCING** = Safe Piercing (MMI 136) | ELEMENT (167, optional) |
|---|---|---|---|---|
| Window title | TID_GAME_SMELTSAFETY_NORMAL "Safe Upgrade (Normal)" | _ACCESSARY "Safe Upgrade (accessory)" | _PIERCING "Safe Upgrade (Piercing)" | _ELEMENT "Safe Element Upgrade" |
| TITLE_NOW / TITLE_MAX | "\~Current Value\~" / "Upgrade Goal" | same | "\~Piercings\~" / "Piercing Goal" | same as NORMAL |
| Target accepted (`SetItem` `:24443-24500`) | `IsDiceRefineryAble` (`Item.cpp:359-371`): dwItemKind2 IK2_ARMOR 7, IK2_WEAPON_MAGIC 3, IK2_WEAPON_DIRECT 2, IK2_ARMORETC 8. Else ERROR01 | `IsCollector(TRUE)` or IK2_JEWELRY 13. Else ERROR01 | `IsPierceAble()` with bSize FALSE: any suit, shield, weapon or vis pet, **even one already at max**. Else ERROR02 | `IsEleRefineryAble` (`Item.cpp:374-385`): IK3_SUIT or IK2 2/3. Else ERROR01 |
| Current value (`GetNowSmeltValue` `:25176-25195`) | `GetAbilityOption()` (+N) | `GetAbilityOption()` | `GetPiercingSize()` | `GetResistAbilityOption()` |
| Default max, also the edit's start and cap (`GetDefaultMaxSmeltValue` `:25197-25234`) | 10 | 20 | IK3_SUIT: 4, else 10 | 20 |
| Material, column 1 (`IsAcceptableMaterial` `:25005-25089`) | target not ultimate (`dwReferStat1 != WEAPON_ULTIMATE 2`): Sunstone 2035 or Event Sunstone 2082. Ultimate: Shining Oricalkum 2034 | Moonstone 2036 / Event Moonstone 2083 | **Moonstone 2036 / Event Moonstone 2083** | the card of the target's element; without an element, the first card placed fixes the card type |
| Scroll 1, required (`IsAcceptableScroll1` `:25091-25133`) | Scroll of SProtect 10464; ultimate: Scroll of XProtect 10488 | Scroll of AProtect 26473 | **Scroll of GProtect 10465** | Scroll of SProtect 10464 |
| Scroll 2, optional (`IsAcceptableScroll2` `:25135-25174`) | Scroll of Smelting 10468, only while +N < 7 and not ultimate | none (column hidden) | **none (column hidden)** | Scroll of Smelting (Elements) 10489 while resist < 10 |
| Placeholder icons (`DrawListItem` `:24815-24961`) | only once a target is set: Sunstone icon (ultimate: Shining Oricalkum), SProtect (ultimate: XProtect), Smelting (while +N < 7 and not ultimate) | always: Moonstone, AProtect | **always, even with no target: Moonstone, GProtect** | card (when known), SProtect, Smelting (Elements) when the target is set and resist < 10 |
| Start refusal when a pair is missing | ERROR08 (ultimate: ERROR09) | ERROR10 | ERROR11 | ERROR20 |
| A scroll placed with no free material row | ERROR03 (ultimate: ERROR04) | ERROR05 | ERROR05 | ERROR17 |
| Gold | none | none | 100,000 per attempt (client checks the bag's gold, §4.6) | none |
| Server function | `SmeltSafetyGeneral` / `SmeltSafetyUltimate` | `SmeltSafetyAccessory` | `SmeltSafetyPiercingSize` | `SmeltSafetyAttribute` |

### 4.4 Putting items in and taking them out

**In.** An item comes in two ways, and both call `SetItem` (`:24428-24692`). The drop position does not matter; the item's
type picks the column.
- A drop from the bag anywhere in the client area (`OnDropIcon`, `:24220-24247`). A drop from any other window gets
  `SetForbid` and is refused.
- **A double-click on a bag item** while the window is open, if that stack still has an unreserved piece
  (`extra < num`) (`CWndInventory::OnChildNotify`, `WndField.cpp:2262-2272`). The double-click then does nothing else.
  Earlier in the same handler (`:2101-2114`), a double-click during the upgrade cursor's wait or while
  APP_SMELT_SAFETY_CONFIRM is open gives TID_MMI_NOTUPGRADE.

| Situation | Effect |
|---|---|
| smelting is running (`m_bStart`) | ERROR12 "You cannot do that during the Safe Upgrading process." |
| no target yet | the mode's target test (§4.3). A pass sets the target: extra+1, the icon, the edit enabled with text = default max, then RefreshInformation. Materials cannot go in before a target (they fail the target test) |
| target set, item is a material | while `materialCount < 10`: add one row (Shift held: add rows until 10 or the stack has no free piece) |
| item is scroll 1 | while `scroll1Count < materialCount`: add (Shift: fill). If `scroll1Count` already equals materialCount (and is below 10): the mode's error (ERROR03/04/05/17). At 10: nothing |
| item is scroll 2 (NORMAL / ELEMENT only) | while `scroll2Count < materialCount`: first `scroll2Count = max(currentRow, scroll2Count)`, then add (Shift: fill). Otherwise the same errors as scroll 1 |
| ELEMENT, the item is an element card but not accepted | the target already has an element: ERROR18. A different card type was already chosen: ERROR19 |
| anything else | ERROR06 "You cannot place that item there." |

Every add is `AddListItem`: isUse = TRUE, the pointer is kept, and the stack's extra goes up 1 (`:24800-24806`). Then
`RefreshValidSmeltCounter`.

**Out** (`OnLButtonDblClk`, `:24249-24378`; ignored while running):
- A double-click on **WIDC_STATIC1** (the target) moves the focus to RESET, clears the target (extra 0), sets the edit to ""
  and disables it, then calls `ResetData` and `RefreshInformation`. **This is the only way to change the target.**
- A double-click on any material cell, when `materialCount > currentRow`, removes the **last** material and trims scroll 1
  and scroll 2 down to the new count. With Shift it removes all unused materials (and trims the scrolls the same way).
  In ELEMENT mode, if no unused material is left, the chosen card type is forgotten.
- A double-click on a scroll 1 cell removes the last scroll 1 (Shift: all unused). The scroll 2 column (NORMAL and ELEMENT)
  works the same way.

`SubtractListItem` takes the stack's extra down 1 (`:24807-24813`).

### 4.5 Buttons and the goal edit (`OnChildNotify`, `:24052-24218`)

| Control | Behaviour |
|---|---|
| START | Ignored while running. No target: ERROR07 "Please place the item that you wish to upgrade in the box at the top of the Safe Upgrading Menu.". When `validCounter > 0`: in PIERCING mode, gold < 100000 gives TID_GAME_LACKMONEY and stops here. Otherwise **start**: `m_bStart = TRUE`, `resultSwitch = true`, timer start = now, end = now + 2000 ms, edit disabled. When `validCounter == 0`, the first match of: current value == default max gives ERROR13; `currentRow >= 10` gives ERROR15 "Please click the Rest Button to continue upgrading."; `materialCount <= currentRow` or `scroll1Count <= currentRow` gives the mode's ERROR08/09/10/11/20; current value >= goal gives ERROR14 "You don't meet the condition of upgrading." |
| STOP | while running: `StopSmelting()`. That sets m_bStart = FALSE and resultSwitch = false and enables the edit (`:24731-24738`) |
| RESET | only when not running: `ResetData()`, then `RefreshInformation()` |
| EDIT_MAX_GRADE (any notification, e.g. EN_CHANGE on typing) | when not running and a target is set: the text becomes `min(atoi(text), default max)`, then RefreshValidSmeltCounter. It takes digits only (EBS_NUMBER) |
| PLUS / MINUS | when the edit is enabled, not running, and a target is set: goal + 1 capped at default max, or goal − 1 floored at 0. Then RefreshValidSmeltCounter |

- `ResetData` (`:24764-24798`): all counts and the current row go to 0. Every list item is cleared, and its stack's extra is
  **set to 0**. Every result bar's title becomes "". ELEMENT forgets the chosen card. **The target stays.**
- `RefreshText` (`:24700-24714`): WIDC_NOW_GRADE shows `%d` of the current value, or "--" with no target.
- `RefreshValidSmeltCounter` (`:24716-24729`): `valid = min(materialCount, scroll1Count) − currentRow`, then
  `valid = min(valid, max(goal − current value, 0))`. Scroll 2 does not count.

### 4.6 The repeating run (`Process`, every frame, `:23880-23967`)

1. When trading or running an own vendor shop, the window closes (`Destroy`).
2. If `m_bStart` is set and a target exists:
   - The gauge rate is `(now − start) / (end − start)` while `resultSwitch` is on, else 0.
   - When `validCounter == 0` or the current value equals the default max, it calls `StopSmelting()`. The frame goes on.
   - In PIERCING mode, if the bag's gold (WIDC_GOLD_NUM, the own gold) is below 100000: TID_GAME_LACKMONEY and
     `StopSmelting()`. The frame goes on.
   - **When `end < now`:** `resultSwitch = false` (the gauge hides). If row `currentRow` has both a material and a scroll 1:
     **send SMELT_SAFETY** (target, material, scroll1, scroll2 when that row has one, else NULL_ID). That row's three cells are
     then emptied: isUse FALSE, each stack's extra −1, pointers cleared. Then start = now, end = now + 2000. This happens even
     if the row was empty (no send), so the loop re-arms every 2 s.
3. Otherwise start and end go to 0xffffffff (the timer is off).

So one attempt goes out every 2 s. The first one goes 2 s after START, while the row 0 gauge fills from empty to full.
The row only moves on when the answer comes (§4.10). The stop checks run before the send in the same frame and do not
return, so a send due in the frame where a stop condition is met still goes out.

### 4.7 Drawing (`OnDraw`, `:23969-24050`; painted after the child controls, §1)

- **Target slot** at WIDC_STATIC1's current (moved) rect: the target's icon at alpha 255. While the timer runs
  (start and end not 0xffffffff), the frames `Icon_ImgIncAni_00..10.tga` are drawn over it, one per frame, as a 32x32 loop
  (`RenderEnchant`, `_Interface/WndManager.cpp:127-140`). The port draws this as a CSS pulse for the upgrade cursor.
- **Tooltip** on the target slot: the item tooltip, or with no target TID_GAME_TOOLTIP_SMELT_SAFETY_ITEM "Please select the
  item that you would like to upgrade safely.".
- **List** (`DrawListItem`): for rows `i = currentRow .. 9` only, each column's **fixed placeholder icon** (§4.3) at the
  cell's resdata rect top left. The alpha is **255 when the cell is filled and 75 when empty**. The icon is the prop's icon,
  not the placed item's (an Event Sunstone shows the Sunstone icon). Rows below currentRow show no icons.
- **Results**: rows `0 .. currentRow−1` draw SafetySuccess.bmp (on success) or SafetyFailure.bmp (on failure) over that row's
  result bar rect (+32 in the widened modes), with `RenderGauge` in 0xffffffff.
- **Progress gauge**, while running and `resultSwitch` is on: SafetyGauge.bmp over row `currentRow`'s result bar, from its
  left to `left + trunc(168 × rate)` capped at its right (+32 in the widened modes).
- `CTheme::RenderGauge` (`_Interface/ITheme.cpp:1907-`) cuts the picture into three equal vertical slices: the left slice,
  the middle slice stretched, the right slice. It draws a width of `floor(w / slice) × slice` at the picture's own height,
  and nothing under 2 slices. The port's `gauge.ts` already does this. SafetySuccess and SafetyFailure (168x32, 56 px
  slices) therefore draw exactly at their size. SafetyGauge (12x32) has 4 px slices, so it shows from 8 px of progress up.

### 4.8 Packet: SMELT_SAFETY

`CDPClient::SendSmeltSafety` (`Neuz/DPClient.cpp:18740-18746`, `DPClient.h:1164-1167`), `PACKETTYPE_SMELT_SAFETY
(DWORD)0x70007000` (`_Network/MsgHdr.h:753`):

| Offset | C type | Value |
|---|---|---|
| 0 | DWORD | 0xffffffff (DPID_UNKNOWN) |
| 4 | DWORD | 0x70007000 |
| 8 | OBJID | target item |
| 12 | OBJID | material (Sunstone / Shining Oricalkum / Moonstone / card) |
| 16 | OBJID | protection scroll (SProtect / XProtect / AProtect / GProtect) |
| 20 | OBJID | smelting scroll, or **NULL_ID 0xffffffff** |

### 4.9 Server

`CDPSrvr::OnSmeltSafety` (`WORLDSERVER/DPSrvr.cpp:3469-3531`, ON_MSG `:290-292`):

1. Reads the four u32 ids. In the quiz world it answers 0.
2. Trading or own vendor: answers 0.
3. If the fourth id is not NULL_ID and that item is not usable: it **returns with no answer**.
4. Target, material or scroll missing or not usable: 0. Target equipped: 0. Target with `m_nResistSMItemId != 0`: 0.
5. Otherwise it answers `AddSmeltSafety(CItemUpgrade::OnSmeltSafety(...))`.

`CItemUpgrade::OnSmeltSafety` (`WORLDSERVER/ItemUpgrade.cpp:421-450`) branches on the material's dwItemKind3:
- IK3_ENCHANT 119 goes to `SmeltSafetyNormal` (`:452-470`): Sunstone and Event Sunstone go to `SmeltSafetyGeneral`; Shining
  Oricalkum goes to `CUltimateWeapon::SmeltSafetyUltimate` (`_Common/UltimateWeapon.cpp:737-812`); anything else is 0.
- IK3_PIERDICE 61 (the Moonstones): an accessory goes to `SmeltSafetyAccessory` (`:575-645`); an item with
  `IsPierceAble(NULL_ID, TRUE)` goes to `SmeltSafetyPiercingSize` (`:647-734`). Otherwise the case **falls through** into
  IK3_ELECARD, `SmeltSafetyAttribute` (`:857-957`), which answers 0 for a Moonstone. A piercing target at max therefore
  gets 0.
- Any other kind: 0.

| Function | Refusals | Costs (sent before the answer) | Chance | Fail | Success | Answer |
|---|---|---|---|---|---|---|
| SmeltSafetyGeneral | not dice-refinable: 0; ultimate, or scroll1 not SProtect 10464: 0; +N >= 10 (`tGeneral` size): **3**; scroll 2 given but not 10468 or not usable: 0 | if scroll 2 is valid and +N < 7: chance +1000, scroll 2 −1. Then material −1 and SProtect −1 (UPDATE_ITEM UI_NUM each) | `tGeneral[+N+1]` /10000, ×0.9 from +3 outside Korea (`GetGeneralEnchantProb` `:1107-1119`); `ItemUpgrade.lua:13` {10000, 10000, 10000, 8000, 6400, 4800, 3200, 1600, 800, 320} | PLAYSOUND 13, CREATESFXOBJ XI_INT_FAIL (not while transparent); **the item is kept** | PLAYSOUND 14, CREATESFXOBJ XI_INT_SUCCESS, UPDATE_ITEM **UI_AO** +1 | 2 / 1 |
| SmeltSafetyUltimate | not ultimate: 0; scroll1 not XProtect 10488: 0; +N >= 10: 3 | material −1, XProtect −1 | `m_mapUltimateProb[+N+1]` /1000000 | sound, sfx | UI_AO +1; above +5 also UI_ULTIMATE_PIERCING_SIZE = +N − 5 | 2 / 1 |
| SmeltSafetyPiercingSize | material not 2036/2083: 0; scroll1 not GProtect 10465: 0; gold < 100000: DEFINEDTEXT TID_GAME_LACKMONEY and 0 | gold −100000 (SETPOINTPARAM DST_GOLD), material −1, GProtect −1 | `GetSizeProb` (§3.7) | PLAYSOUND 13, XI_INT_FAIL; **the item is kept**, no text | PLAYSOUND 14, XI_INT_SUCCESS, UPDATE_ITEM **UI_PIERCING_SIZE** +1, no text | 2 / 1 |
| SmeltSafetyAccessory | material not a Moonstone: 0; scroll1 not AProtect 26473: 0; +N >= 20 (MAX_AAO): 3 | material −1, AProtect −1 | `CAccessoryProperty::GetProbability(+N)` /10000 | sound, sfx | UI_AO +1 | 2 / 1 |

The server sends no DEFINEDTEXT on success or failure here. The window shows the outcome.

Snapshot `CUser::AddSmeltSafety` (`WORLDSERVER/User.cpp:8646-8656`), `SNAPSHOTTYPE_SMELT_SAFETY (WORD)0x9900`
(`_Network/MsgHdr.h:1301`): `OBJID (own id) | WORD 0x9900 | BYTE nResult`. Because snapshots keep their order, the
UPDATE_ITEM and UI_NUM changes arrive **before** the result.

### 4.10 Neuz's answer handler (`CDPClient::OnSmeltSafety`, `Neuz/DPClient.cpp:18748-18783`; dispatch `:844-846`)

The handler returns at once when no smelt-safety window is open.

| nResult | Meaning | Window update |
|---|---|---|
| 0 | refused (wrong material, no gold, quiz world, equipped ...) | nothing. The run stays "running": the 2 s timer keeps re-arming on the now-empty row and sends nothing, the gauge is hidden, the target keeps its animation. The player must press STOP |
| 1 | success | `resultStatic[row] = true`, `currentRow++`, `RefreshInformation()` (NOW shows the new value), `DisableScroll2()`, `resultSwitch = true` (the next row's gauge appears, already part-filled) |
| 2 | failure | `resultStatic[row] = false`, `currentRow++`, `RefreshValidSmeltCounter()`, `resultSwitch = true` |
| 3 | at max | nothing (same as 0) |

`DisableScroll2` (`WndField.cpp:24740-24762`): in NORMAL mode, once +N >= 7 or the target is ultimate (or in ELEMENT once
resist >= 10), every scroll 2 cell is emptied (extra −1 each) and scroll2Count goes to 0.

### 4.11 Closing

The window closes in these cases:
- the title bar's close button;
- trading or own vendor (`Process`);
- the player moving: `WndWorld.cpp:8051` (state not stand, or moving back) closes it at `:8493-8495`;
- the bag closing (`CWndInventory::OnDestroy`, `WndField.cpp:1071-1079`), which also closes APP_SMELT_SAFETY_CONFIRM;
- a new menu choice, which deletes the old window first.

The destructor (`:23648-23686`) sets every reserved stack's extra to 0 (except items in a trade) and sets the bag's die
flag back to FALSE. Nothing is sent. An answer that comes later is ignored.

### 4.12 The bag while the window is open

`SetDieFlag(TRUE)` (`_Interface/WndItemCtrl.cpp:1634-1637`) changes the bag in three ways:
- A stack with some pieces reserved still draws normally. It draws greyed (alpha 60) only when every piece is reserved
  (`extra == num`) (`:472-487`).
- Such a stack can still be selected and dragged (`:809-812`, `:1076`, `:1424`).
- The count always shows `num − extra` (`:528-535`).

So the 10 Sunstones of one stack can go in one at a time, and the bag counts them down.

---

## 5. APP_SMELT_SAFETY_CONFIRM 830 (the upgrade cursor's box, for the Neuz look only)

`Resource/resdata.inc:1772-1806`: `APP_SMELT_SAFETY_CONFIRM "WndTile00.tga" 1 336 160 0x2410000 26`, title
IDS_RESDATA_INC_006516 "Confirm Upgrade".

| Line | Type | WIDC | Picture | Tiled | Rect | Style |
|---|---|---|---|---|---|---|
| 1782 | BUTTON | WIDC_SMELT_YES | ButtYes.tga | 0 | 74,100,146,120 | 0x220010 |
| 1791 | BUTTON | WIDC_SMELT_NO | ButtNo.tga | 0 | 182,100,254,120 | 0x220010 |
| 1800 | TEXT | WIDC_CONFIRM_TEXT | WndEditTile00.tga | 1 | 10,18,318,94 | 0x20000 |

`CWndSmeltSafetyConfirm` is at `WndField.cpp:25236-25313`. Its texts are TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL / _HIGHEST /
_ACCESSARY (§8). The port already shows these through its message box. The safety windows above do not use it.

---

## 6. Theme pictures (`Client/Theme/Default`, all present)

| Window | File (exact case on disk) | Size | Use |
|---|---|---|---|
| all | WndTile00.tga ... (frame tiles, e.g. WndTile01, WndTile11) | 16x16 each, TGA 32 bpp | tiled frame (the port's `frame.ts`) |
| Piercing | WndElemItemBlank.tga | 32x32 TGA 32 bpp | the 3 slots |
| Piercing | ButtOk.tga, ButtCancel.tga | 288x20 TGA (4 states × 72) | OK / Cancel |
| Piercing | ButtMoney.tga | 19x20 TGA | coin by the cost |
| Piercing | WndEditTile200.tga ... WndEditTile208.tga | 8x10 each TGA | "Pierce Item" group box (9 pieces) |
| Safety | WndChgElemItem.bmp | 32x32 BMP 24 bpp | target slot and the 30 list cells |
| Safety | Window02.bmp | 168x32 BMP 24 bpp | the 10 empty result bars |
| Safety | SafetyGauge.bmp | 12x32 BMP 24 bpp | progress gauge (3 slices of 4 px) |
| Safety | SafetySuccess.bmp, SafetyFailure.bmp | 168x32 BMP 24 bpp each | result pictures (3 slices of 56 px) |
| Safety | ButtStart.bmp, Buttstop.bmp | 256x20 BMP (4 states × 64) | START / STOP |
| Safety | ButtReset.BMP | 288x20 BMP (4 × 72) | RESET |
| Safety | ButItemPlus.BMP, ButItemMinus.BMP | 56x16 BMP (4 × 14) | + / − |
| Safety, confirm | WndEditTile00.tga ... WndEditTile08.tga | 8x10 each TGA | goal edit, confirm text box |
| Confirm | ButtYes.tga, ButtNo.tga | 288x20 TGA (4 × 72) | Yes / No |
| (icon dir) | Icon_ImgIncAni_00..10.tga | 32x32 | the target slot's animation (not converted; use the existing pulse) |

The BMP pictures use magenta 0xffff00ff as transparent (AddTexture colour key).

Item icons drawn (`Item/` folder): Itm_GenMatOrichalcum01.dds (Sunstone 2035, Event Sunstone 2082),
Itm_GenMatOrichalcum02.dds (Shining Oricalkum 2034), Itm_GenMatMoonstone.dds (2036, 2083), Itm_SysSysScrSmePro.dds
(SProtect 10464), Itm_SysSysScrSmelprot3.dds (XProtect 10488), Itm_SysSysScrPiePro.dds (GProtect 10465),
Itm_SysSysScrSmelti.dds (Smelting 10468), Itm_SysSysScrSmelprot4.dds (AProtect 26473), Itm_SysSysScrSmelti2.dds
(Smelting (Elements) 10489). Lines: `Resource/propItem.txt:1791-1795, 2097-2105`.

---

## 7. Packets and snapshots in one place

| Direction | Name | Id | Layout after the header |
|---|---|---|---|
| client to server | PIERCING_SIZE | DWORD 0xf000d008 | u32 item, u32 moonstone, u32 gprotect or 0xffffffff |
| client to server | SMELT_SAFETY | DWORD 0x70007000 | u32 item, u32 material, u32 protection scroll, u32 smelting scroll or 0xffffffff |
| server to client | SMELT_SAFETY | WORD 0x9900 | u8 result (0 refused, 1 success, 2 failure, 3 at max) |
| server to client (existing) | UPDATE_ITEM 0x0018 (UI_AO 3, UI_PIERCING_SIZE 6, UI_NUM, UI_ULTIMATE_PIERCING_SIZE 13), SETPOINTPARAM (DST_GOLD), DEFINEDTEXT 0x0095, PLAYSOUND 0x00d2 (13 fail / 14 success), CREATESFXOBJ 0x000f (1715 fail / 1714 success) | | already read by the port |

---

## 8. Texts (TID, number = defineText.h, colour = textClient.inc, English = textClient.txt.txt)

| TID | No. | Colour | English |
|---|---|---|---|
| TID_PIERCING_ERROR_NOTICE | 2641 | ffffffff | Do you want to pierce this item? |
| TID_GAME_EQUIPPUT | 962 | ffff0000 | Please unequip the item first. |
| TID_PIERCING_POSSIBLE | 2633 | ffff0000 | You can pierce 4 sockets into suits. |
| TID_PIERCING_POSSIBLE_ITEM | 2634 | ffff0000 | The item cannot be pierced. |
| TID_SBEVE_NOTUSEITEM | 511 | ffff0000 | You cannot use that item. |
| TID_MMI_PIERCINGFAIL | 2651 | ffff0000 | Piercing failed. |
| TID_MMI_PIERCINGSUCCESS | 2650 | ffff0000 | Piercing Succeeded. |
| TID_GAME_LACKMONEY | 625 | ffff0000 | You do not have enough Penya. |
| TID_MMI_NOTUPGRADE | 2652 | ffff0000 | The item cannot be equipped or moved during refining. |
| TID_GAME_SMELTSAFETY_NORMAL | 4124 | ff000000 | Safe Upgrade (Normal) |
| TID_GAME_SMELTSAFETY_ACCESSARY | 4125 | ff000000 | Safe Upgrade (accessory) |
| TID_GAME_SMELTSAFETY_PIERCING | 4126 | ff000000 | Safe Upgrade (Piercing) |
| TID_GAME_SMELTSAFETY_ELEMENT | 4337 | ff000000 | Safe Element Upgrade |
| TID_GAME_SMELT_SAFETY_NOW_GRADE | 4135 | ffffffff | \~Current Value\~ |
| TID_GAME_SMELT_SAFETY_MAX_GRADE | 4136 | ffffffff | Upgrade Goal |
| TID_GAME_SMELT_SAFETY_NOW_PIERCING | 4137 | ffffffff | \~Piercings\~ |
| TID_GAME_SMELT_SAFETY_MAX_PIERCING | 4138 | ffffffff | Piercing Goal |
| TID_GAME_TOOLTIP_SMELT_SAFETY_ITEM | 4142 | ffff0000 | Please select the item that you would like to upgrade safely. |
| TID_GAME_SMELT_SAFETY_ERROR01 | 4143 | ffff0000 | You cannot upgrade this item. |
| ERROR02 | 4144 | ffff0000 | Piercing is not allowed on this item. |
| ERROR03 | 4148 | ffff0000 | Missing reagent: Sunstone. |
| ERROR04 | 4149 | ffff0000 | Missing Reagent: Shining Oricalkum. |
| ERROR05 | 4150 | ffff0000 | Missing Reagent: Moonstone. |
| ERROR06 | 4151 | ffff0000 | You cannot place that item there. |
| ERROR07 | 4152 | ffff0000 | Please place the item that you wish to upgrade in the box at the top of the Safe Upgrading Menu. |
| ERROR08 | 4153 | ffff0000 | In order to proceed, make sure you've placed both a Sunstone and a Scroll of SProtect into the Safe Upgrading Menu. |
| ERROR09 | 4154 | ffff0000 | ... both a Shining Oricalkum and a Scroll of XProtect ... (same wording) |
| ERROR10 | 4155 | ffff0000 | ... both a Moonstone and a Scroll of AProtect ... |
| ERROR11 | 4156 | ffff0000 | In order to proceed, make sure you've placed both a Moonstone and a Scroll of GProtect into the Safe Upgrading Menu. |
| ERROR12 | 4157 | ffff0000 | You cannot do that during the Safe Upgrading process. |
| ERROR13 | 4158 | ffff0000 | That item has reached the maximum upgrade value.  Please place a new item and try again. |
| ERROR14 | 4163 | ffff0000 | You don't meet the condition of upgrading. |
| ERROR15 | 4176 | ffff0000 | Please click the Rest Button to continue upgrading. |
| ERROR16 | 4200 | ffff0000 | You can't do that right now, silly. |
| ERROR17 | 4338 | ffff0000 | You must place an Element Card in the appropriate slot in order to proceed. |
| ERROR18 | 4339 | ffff0000 | This item already has an Element Upgrade.  You can't apply a different element. |
| ERROR19 | 4340 | ffff0000 | A different type of element has already been applied. |
| ERROR20 | 4341 | ffff0000 | Please make sure all items are placed in the upgrade slots. |

The texts' full line references (textClient.inc / textClient.txt.txt) are: ERROR01 `:13139` / `:2664` through ERROR20
`:14279` / `:2895`. The window titles are at `:13034-13044` / `:2643-2645`. TID_GAME_SMELT_SAFETY_SUCCESS "Success" and
_FAILURE "Failure" (4146 / 4147) exist but are not used.

---

## 9. Is anything impossible at V15 without server changes?

No. The details:

- **The server handlers are compiled and registered.** ON_MSG PIERCING_SIZE is at `DPSrvr.cpp:299` with no gate. ON_MSG
  SMELT_SAFETY is at `:290-292` under `__VER >= 14`. All `CItemUpgrade` functions are under `__VER >= 12/14/15`. The
  WORLDSERVER `VersionCommon.h` lines that comment out `__SMELT_SAFETY` etc. have no effect.
- **No NPC distance check** on either packet. The menu alone gates them, as in Neuz.
- **The gateway** (`apps/gateway`) only relays and rate-limits. It has no packet list to extend.
- **Port work needed (client only):**
  - `packages/protocol`: an encoder for PIERCING_SIZE (3 × u32) and one for SMELT_SAFETY (4 × u32). The existing `checkId`
    in `src/world/upgrade.ts:18-20` throws for ids >= 73, so the optional last field needs its own path that allows NULL_ID
    0xffffffff.
  - A reader for snapshot **0x9900** (u8) in `src/world/readers.ts`. Without a reader the bundle parser stops at the first
    unknown type and loses the rest of that bundle (`src/bundle.ts:53-69`).
  - The bag needs a per-item "reserved" count (extra) with the greying and count rules of §3.3 and §4.12.
  - `moverMenu.ts` should enable MMI 23, 134 and 136 (and 135 and 167 if wanted).
- **Bakbak server specifics (not V15 limits):**
  - `HighRateProfile::RestrictedScroll` (`_Common/HighRateProfile.h:38-44`, used at `_Common/Mover.cpp:1359, 4630`) removes
    SProtect 10464, GProtect 10465 and XProtect 10488 from **NPC shops**. Safe Upgrade (SProtect / XProtect) and Safe
    Piercing (GProtect) therefore need scrolls from another source (cash shop, web shop, drops, GM). Plain Piercing works
    without a GProtect (the item is destroyed on failure).
  - `HighRateProfile::Chance` is ×1. The higher rates live in `ItemUpgrade.lua`. No client effect.

---

## 10. Quirks to keep or to rule on

1. On drop, Piercing slot 0 says "You can pierce 4 sockets into suits." for **any** item that cannot take another socket,
   including a potion, because `IsPierceAble(NULL_ID, TRUE)` runs first.
2. The Piercing window closes as soon as OK is confirmed. The result comes only as a chat line, a sound and an effect.
3. The piercing slots' stack number shows `GetExtra()` (1), not the stack size.
4. Safe Piercing accepts a target that is already at max. START then gives ERROR13. The edit starts at 4 for suits and 10
   otherwise.
5. Safe Piercing's placeholder Moonstone and GProtect icons show at alpha 75 even before a target is set. NORMAL shows
   nothing until a target is set.
6. After an answer of 0 or 3, or no answer at all (an unusable smelting scroll), the run hangs until STOP (§4.10).
7. The client does not test whether the target is equipped. A drag from the bag's equipment slots goes in, and the server
   answers 0.
8. RESET keeps the target. Only a double-click on the target slot removes it.
9. Shift fills or empties whole columns. A phone has no Shift. The port may offer this another way (owner's call).
10. Neuz takes items both by drag-and-drop and by a double-click in the bag (§4.4). The port's earlier ruling for item
    windows used a click in the bag. The double-click here is Neuz's own path, so it is "byte for byte".
