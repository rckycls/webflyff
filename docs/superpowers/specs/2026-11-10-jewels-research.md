# Create Jewels and Jewel Setting: research (PARTIAL, 2026-11-10)

Status: Neuz client and WorldServer rules are read. Not done yet: resdata.inc layout, tooltip code
(`CToolTip::SetUltimateToolTip`), propItem rows, online sources, and the survey of today's FlyffWeb code.
The session stopped at a usage limit. Nothing is built yet.

Sources are CP949: `iconv -f cp949 -t utf-8`. `WndField.cpp` lines are in the converted file (same numbers).

## Which window is which

NPC menu texts (Resource/textClient.txt.txt, IDs from Resource/defineText.h:380-385, 431):

| MMI (defineNeuz.h:146-200) | English menu text | Window | APP id |
|---|---|---|---|
| 51 MMI_SMELT_MIXJEWEL | Create Shining Oricalkum | CWndMixJewel | APP_SMELT_MIXJEWEL |
| 52 MMI_SMELT_JEWEL | **Jewel Setting** | CWndSmeltJewel | APP_SMELT_JEWEL |
| 53 MMI_SMELT_EXTRACTION | **Create Jewels** | CWndExtraction | APP_SMELT_EXTRACTION |
| 54 MMI_SMELT_CHANGEGWEAPON | Create Unique Weapon | CWndChangeWeapon(WEAPON_GENERAL) | APP_SMELT_CHANGEWEAPON |
| 55 MMI_SMELT_CHANGEUWEAPON | Create Ultimate Weapon | CWndChangeWeapon(WEAPON_UNIQUE) | APP_SMELT_CHANGEWEAPON |
| 56 MMI_LEGEND_SKILLUP | Level-up Hero Skill! | CWndHeroSkillUp | APP_HERO_SKILLUP |
| 95 MMI_SMELT_REMOVE_JEWEL | Remove Jewel from Ultimate Weapon | CWndRemoveJewel | APP_SMELT_REMOVE_JEWEL |

So the owner's "Create jewel" = CWndExtraction, "Jewel setting" = CWndSmeltJewel.

Opening (Source/_Interface/WndWorld.cpp:4942-5094): each menu entry refuses with TID_GAME_WND_OVERLAPED
(chat line) if its window is already open, else creates the window. Mix Jewel also opens the inventory
(`CreateApplet(APP_INVENTORY)`, :4951). All windows `MoveParentCenter()`.

## Create Jewels (CWndExtraction, WndField.cpp:19650-19920)

- One slot WIDC_PIC_SLOT, a START button (disabled until a weapon is set), text WIDC_TEXT1 from
  `Client/SmeltExtraction.inc` (:19831).
- Accepted (drop :19763, inventory double-click via `SetWeapon` :19794): `dwItemKind1 == IK1_WEAPON` and
  (`dwReferStat1 == WEAPON_GENERAL && dwLimitLevel1 >= 60` or `dwReferStat1 == WEAPON_UNIQUE`). Anything else
  is silently ignored. The item is marked busy with `SetExtra(+1)`.
- Double-click on the slot removes the weapon (:19745).
- START: button disabled, sends `SendUltimateMakeGem(objId)` (:19814).
- Result (:19845): SUCCESS -> message box `TID_GAME_EXTRACTION_SUCCESS` formatted with the gem name
  (`GetGemKind(dwLimitLevel1)`) and count; slot cleared, window stays. FAILED/CANCEL -> message box
  `TID_GAME_EXTRACTION_FAILED`, window closes. INVENTORY -> message box `TID_GAME_EXTRACTION_ERROR`, START
  enabled again.
- Server (Source/_Common/UltimateWeapon.cpp:189-277): weapon destroyed always. Gem kind by weapon level
  (Ultimate_GemAbility.txt LEVEL_GEM: Topaz 60-70, Ruby 71-85, Sapphire 86-100, Emerald 101-119,
  Diamond 120). Chance and count by the weapon's upgrade (+0..+10) from Ultimate_UltimateWeapon.txt MAKE_GEM
  (general 5%..100%, count 1..20; unique 10%..100%, count 1..40). Equipped weapon -> TID_GAME_ULTIMATE_ISEQUIP
  chat + CANCEL. Bag too full -> INVENTORY.

## Jewel Setting (CWndSmeltJewel, WndField.cpp:19900-20530)

- WIDC_CUSTOM1: a 3D view of the weapon, rotating; camera per weapon kind (:20053-20160). Five socket slots
  WIDC_STATIC1..5, START, text from `Client/SmeltJewel.inc` (:20405).
- Weapon: drop on CUSTOM1 only; must be IK2_WEAPON_DIRECT or IK2_WEAPON_MAGIC with
  `dwReferStat1 == WEAPON_ULTIMATE` (:20300).
- Sockets: `GetUltimatePiercingSize()` open; set jewels come from `GetUltimatePiercingItem(i)` (:20464).
  Usable slot = the first empty one (count of set jewels). Drawing (:20230-20280): set jewel = its icon over
  `WndDisableBlue.bmp`; empty but not the usable slot = `WndDisableBlack.bmp`; not opened =
  `WndDisableRed.bmp`; the usable slot plain.
- Jewel: only II_GEN_MAT_RUBY/DIAMOND/EMERALD/SAPPHIRE/TOPAZ, only onto the usable slot (drop :20340, or
  inventory double-click `SetJewel` :20365). Double-click the slot removes it (:20391).
- START enabled only when the usable slot holds a jewel (`Process` :19993). Press: sound
  PcSkillD-Counter01.wav, spin animation (~25 steps with a white flash), then `SendUltimateSetGem(weapon, gem)`.
- Result (:20437): SUCCESS -> message box TID_GAME_SMELTJEWEL_SUCCESS, sound InfUpgradeSuccess.wav, window
  closes. FAILED -> message box TID_GAME_SMELTJEWEL_FAIL, window resets (stays open). CANCEL -> closes.
- Server (UltimateWeapon.cpp:279-350): not ultimate -> ISNOTULTIMATE; equipped -> TID_GAME_ULTIMATE_ISEQUIP;
  no empty socket -> TID_GAME_ULTIMATE_GEMSPACE. Jewel always consumed. 90% (SET_GEM 900000) success: the socket
  gets a random ability jewel (e.g. II_GEN_MAT_RUBY02 = ATK) via `UpdateItem(UI_ULTIMATE_PIERCING,
  MAKELONG(slot, abilityItemId))`.

## Packets

Client -> server (Source/Neuz/DPClient.cpp:16336-16385, ids Source/_Network/MsgHdr.h:609-614):
- 0xf000f110 ULTIMATE_MAKEITEM: 10 x OBJID (5 Oricalkum, 5 Moonstone).
- 0xf000f111 ULTIMATE_MAKEGEM: OBJID weapon.
- 0xf000f112 ULTIMATE_TRANSWEAPON: OBJID weapon, gem1, gem2.
- 0xf000f113 ULTIMATE_ENCHANTWEAPON, 0xf000f114 ULTIMATE_SETGEM, 0xf000f115 ULTIMATE_REMOVEGEM: OBJID weapon, OBJID gem.

Server -> client: snapshot SNAPSHOTTYPE_ULTIMATE 0x0100 (MsgHdr.h:1190), then BYTE state
(MsgHdr.h:1585-1590: 1 MAKEITEM, 2 TRANSWEAPON, 3 MAKEGEM, 4 SETGEM, 5 REMOVEGEM, 6 ENCHANTWEAPON), then int
result (UltimateWeapon.h:19: 0 SUCCESS, 1 FAILED, 2 CANCEL, 3 ISULTIMATE, 4 INVENTORY, 5 ISNOTULTIMATE).
MAKEGEM adds int count. Writers: Source/WORLDSERVER/User.cpp:7810-7842. Reader: DPClient.cpp:11577-11655.
The socket change itself arrives as the normal UpdateItem (UI_ULTIMATE_PIERCING).

## Other ultimate windows (plan later)

- Create Shining Oricalkum (CWndMixJewel :19114-19575): 5 Oricalkum slots + 5 Moonstone slots, shift-drop
  fills all, START needs all 10 (TID_GAME_SUMMONANGEL_ERROR2), result window APP_SMELT_MIXJEWEL_CONFIRM with
  TID_GAME_MIXJEWEL_SUCCESS. Same packet family; small.
- Create Unique/Ultimate Weapon (CWndChangeWeapon :20520-20950), Remove Jewel (CWndRemoveJewel :22458-22860,
  uses a Moonstone, 100%), Hero Skill-up (CWndHeroSkillUp :21040-21330).

## Owner custom data (do not build)

- Ultimate_UltimateWeapon.txt: ULTIMATE_ENCHANT rates x1.6 (custom, commit 2f3b2ed). SET_GEM and MAKE_GEM are stock.
- Ultimate_GemAbility.txt: 45 lines changed from stock (custom ability values). The client only shows them
  through the tooltip; port the stock tooltip code and read whatever data the converter gives.
- UltimateWeapon.cpp includes HighRateProfile.h (used at :706, :787 only, enchant and safety smelt).
