# Neuz V15 item tooltip: reference spec (Blouflash VS22 V15 build)

Read-only audit of the original client, written as the reference for the FlyffWeb item tooltip.

- `SRC` = `<Blouflash>\Source`
- `RES` = `<Blouflash>\Resource`. The client copy under `...\Client` packs these text tables in `data.res`; `Client\Client` holds only window and help `.inc` files, none of the tables used here.
- Every `file:line` is relative to `SRC` unless it starts with `Resource/`. The sources are CP949; line numbers are the original files' line numbers.
- English text comes from `Resource/textClient.inc` (TID → colour + IDS key) and `Resource/textClient.txt.txt` (IDS key → string). The numeric ids are in `Resource/defineText.h`. Strings are quoted exactly, trailing spaces included.
- Colours are given as `#RRGGBB`. All of them are opaque (`D3DCOLOR_XRGB`, alpha 0xFF).

---

## 0. Build context: what is active

| Fact | Where |
|---|---|
| `__MAINSERVER` and `__VER 15`; the `__INTERNALSERVER` and `__TESTSERVER` blocks are off, and the `__MAINSERVER` block (lines 471-480) is on | `Neuz/VersionCommon.h:3-4`, `:261`, `:406`, `:471` |
| Most tooltip gates are written `#if __VER >= N // __NAME`. They are **on** because `__VER` is 15, even though the matching `#define __NAME` lines (`:59-148`) are commented out. Active: `__CSC_VER9_1`(9), `__LEGEND`(10), `__SYS_IDENTIFY`, `__SYS_COLLECTING`, `__SYS_POCKET`, `__MA_VER11_05`, `__CSC_VER11_3`, `__CHIPI_071210`, `__REMOVE_ENDURANCE`(11), `__EXT_PIERCING`, `__PET_0519`, `__J12_0`, `__TAX`(12), `__EQUIP_BIND`, `__JOB_TEXT`, `__NEW_ITEM_LIMIT_LEVEL`(14), `__IMPROVE_SYSTEM_VER15`, `__PETVIS`, `__HERO129_VER15`(15) | e.g. `_Interface/WndManager.cpp:4741`, `:6217` |
| `#ifdef` gates that matter: `__PROP_0827` **on** (3 dest params), `__PROTECT_AWAKE` **on**, `__SHOP_COST_RATE` **on**, `__DST_GIFTBOX` **on**, `__PET_1024` **on** (pet names). `__NEWWPN1024` is **off** (not defined anywhere), so `DST_MASTRY_ALL` drops out of the name table | `Neuz/VersionCommon.h:53`, `:251`, `:248`, `:102`, `:152` |
| The Neuz build is Win32 (`v143` toolset) with `_USE_32BIT_TIME_T` and `__CLIENT`. On the wire, `time_t`, `size_t`, `BOOL`, `int` and `long` are 4 bytes. MSVC x86 defaults to `/fp:precise` with SSE2, so `float` expressions round to float32 (see the min/max note in 1.6) | `Neuz/StdAfx.h:10,12`, `Neuz/Neuz.vcxproj:6,20` |
| Custom code: `HighRateProfile::Gear(v)` = `v * GearStats(1)` clamped to ±100000. In practice it is the identity; Resource values are already scaled. Most stat helpers call it | `_Common/HighRateProfile.h:9-29` |
| Colour set: `g_Option.m_nToolTipText` starts at 0 and only changes in the `_DEBUG`-only `LoadToolTip`. The release client therefore always uses `dwItemColor[FIRST_TC]` (index 0). The tile set `m_nToolTipTexture` is 0 | `_Common/HwOption.cpp:204-205`, `:265-273`; `_Interface/WndManager.h:228-234`, `:295` |

---

## 1. The tooltip, line by line

### 1.1 Entry point and renderer

`CWndMgr::PutToolTip_Item(CItemBase*, CPoint, CRect*, int flag)` (`_Interface/WndManager.cpp:6215-6422`). Only the `__IMPROVE_SYSTEM_VER15` branch compiles (`:6217-6225`); lines `:6226-6420` are a dead old copy.

1. Return if `GetProp()` is NULL.
2. `MakeToolTipText(pItemBase, strItem, flag)` (`:6550-6746`) builds a `CEditString`, a string whose runs carry colour and style.
3. `g_toolTip.PutToolTip(m_dwItemId, strItem, *pRect, point, 0)`. Position 0 means "above the hovered slot".
4. If `prop.IsUltimate()`, call `g_toolTip.SetUltimateToolTip(pItemBase)`, which adds the Ultimate icon and the gem-slot row.

The overload `PutToolTip_Item(DWORD dwType, DWORD dwId, …)` (`:4326-4330`) looks the item up with `g_pPlayer->GetItemId(dwId)`, i.e. by object id in the player's own inventory, and passes `flag` 0. It is only used by the task bar.

`CToolTip` renderer (`_Interface/tooltip.cpp`):

| Aspect | Behaviour | Where |
|---|---|---|
| Text wrap | `m_strToolTip.Init(fontText, CRect(0,0,200,0))`: lines wider than **200 px** wrap. Wrapping is word-wise for English at the break characters `" +-*^/%=;(),':{}."` | `tooltip.cpp:203-204`; `_Common/EditString.cpp:648-662`, `:682`, `:726`, `:742`, `:763` |
| Box size | `w = textW + 6`, `h = textH + 3 + 2*(textH / font.GetMaxHeight())`, i.e. 2 px more per line | `tooltip.cpp:205-212` |
| Show delay / fade | Timer 0 (shows at once). `m_nAlpha += 15` per frame, but the text draw ignores alpha | `tooltip.cpp:196`, `:395-396`, `:645` |
| Position 0 | `pt = hoverRect.TopLeft(); pt.y -= h + 10`. If `rect.right + 16 > screen.right`, `pt.x = screenW - w - 8`. If `rect.top < screen.top`, `pt.y = screen.top + 8` | `tooltip.cpp:406-410`, `:460-490` |
| Frame | 9-slice of 16×16 tiles from the theme, `WndTooltipTile00.tga`…`08.tga` (0 TL, 1 top, 2 TR, 3 left, 4 centre, 5 right, 6 BL, 7 bottom, 8 BR). It sits 8 px outside the text rect: `PlusRect = rect` with left/top −8 and right/bottom moved to `right−16+8` / `bottom−16+8` (where the right and bottom tiles start) | `tooltip.cpp:70-89`, `:553-643` |
| Text origin | `rect.left + 3, rect.top + 3` | `tooltip.cpp:645` |
| Ultimate weapons | Icon `Icon_Ultimate.dds` (Icon dir; the Theme dir for French) at `PlusRect.left+10, PlusRect.top+8` on the main tooltip, `+24` on comparison tooltips so it clears the header. With gem slots (`m_nSlot = GetUltimatePiercingSize()` > 0): minimum width 194, the box grows 36 px upward (`rect.top = pt.y − 36`, or `rect.bottom += 36` when clamped at the top), and the slots are drawn at `x = PlusRect.left + 14 + (PlusRect.Width() − 194)/2`, `y = PlusRect.bottom − 24`, 38 px apart: `WndChgElemItem.bmp` (theme) then the gem's item icon (`prop.szIcon`) | `tooltip.cpp:91-102`, `:449-451`, `:516-548`, `:740-783`, `:887-901` |
| Comparison tooltips (sub 1 / sub 2) | Placed right of the previous box: `x = prev.left + prev.renderWidth + 16`. The main box is pulled left when the chain would leave the screen (offsets 224 / 470) | `tooltip.cpp:432-499` |

### 1.2 Colours (`dwItemColor[FIRST_TC]`, `_Interface/WndManager.cpp:533-595`)

| Field | RGB | Hex | Used for |
|---|---|---|---|
| dwName0 | 46,112,169 | `#2E70A9` | default item name, pet name |
| dwName1 | 0,93,0 | `#005D00` | unique weapons, set armour names |
| dwName2 | 128,64,0 | `#804000` | unused (pre-v9 rare items only) |
| dwName3 | 127,0,255 | `#7F00FF` | Ultimate weapon names |
| dwGeneral | 0,0,0 | `#000000` | most plain lines |
| dwPiercing | 178,0,255 | `#B200FF` | socket count, piercing effects, vis totals, pet description |
| dwResist, dwResistFire/Water/Earth/Electricity/Wind | 0,0,0 | `#000000` | element line, base resistances (all black in this set) |
| dwResistSM | 0,158,0 | `#009E00` | pet grade line |
| dwResistSM1 | 255,0,0 | `#FF0000` | pet "(Death)", pet bonus line |
| dwTime | 0,200,0 | `#00C800` | duration, time-left and expiry lines |
| dwEffective0 / 1 / 2 / 3 | 0,0,0 / 0,255,0 / 255,0,0 / 128,128,128 | `#000000` / `#00FF00` / `#FF0000` / `#808080` | min~max numbers by efficiency |
| dwRandomOption | 0,0,0 | `#000000` | old random option (dead, see 1.4) |
| dwEnchantOption | 0,0,0 | `#000000` | armour set +N bonus |
| dwSetName | 0,0,0 | `#000000` | set title |
| dwSetItem0 | 178,178,178 | `#B2B2B2` | set piece not equipped |
| dwSetItem1 | 0,0,204 | `#0000CC` | set piece equipped |
| dwSetEffect | 255,157,0 | `#FF9D00` | set effect lines |
| dwGold | 0,0,0 | `#000000` | price lines |
| dwCommand | 0,0,0 | `#000000` | "Description:" line |
| dwNotUse | 255,66,0 | `#FF4200` | requirement you fail (sex, job, level, level-down) |
| dwAddedOpt7 | 255,0,0 | `#FF0000` | Ultimate gem option lines (the only AddedOpt colour used in v15) |
| dwAwakening | 0,0,255 | `#0000FF` | awakening caption and lines |
| dwBlessing | 0,0,255 | `#0000FF` | blessing caption and lines |
| dwBlessingWarning | 255,0,0 | `#FF0000` | blessing warning |

Literal colours in helpers:

- `PutDestParam` `#0000FF`
- pet level history `#00C8FF` / `#007FFF`, pet exp `#7878DC`, pet life `#FF6464`, pet HP `#FF0A0A`
- feed pocket `#FF0000`, `#FF1414`, `#3232CD`
- sealed character `#FF1414`
- need-vis `#000000` / `#FF0000`
- expired vis `#FF0000`
- comparison header `#000000`
- `AddString` with no colour defaults to `0xff000000` black (`_Common/EditString.h:117`)

The colour column of `textClient.inc` is **ignored** except where the code calls `GETTEXTCOLOR` / `prj.GetTextColor`: the equip-bind lines (`#FF0000`) and the tax line (`#808080`).

### 1.3 The DST name table and number formats

`FindDstString(dst)` (`WndManager.cpp:4522-4533`) scans `g_DstString` (`:4338-4451`) and returns `""` when the DST is missing. `IsDst_Rate(dst)` (`:4453-4518`) decides whether a value gets a `%`. Entries active in this build:

| DST | id | TID | English | % |
|---|---|---|---|---|
| DST_STR | 1 | TID_TOOLTIP_STR (1377) | "STR" | |
| DST_DEX | 2 | TID_TOOLTIP_DEX (1336) | "DEX" | |
| DST_INT | 3 | TID_TOOLTIP_INT (1337) | "INT" | |
| DST_STA | 4 | TID_TOOLTIP_STA (1338) | "STA" | |
| DST_SPEED | 11 | TID_TOOLTIP_SPEED (1340) | "Speed" | % |
| DST_ABILITY_MIN | 12 | TID_TOOLTIP_ABILITYMIN (1341) | "Min. Ability" | |
| DST_ABILITY_MAX | 13 | TID_TOOLTIP_ABILITYMAX (1342) | "Max. Ability" | |
| DST_ATTACKSPEED | 24 | TID_TOOLTIP_ATKSPEED (1343) | "Attack Speed" | % (value /2/10) |
| DST_ADJDEF | 26 | TID_TOOLTIP_DEFENCE (1344) | "DEF" | |
| DST_RESIST_MAGIC | 27 | TID_TOOLTIP_DEFMAGIC (1345) | "Magic-defense" | |
| DST_RESIST_ELECTRICITY | 28 | TID_TOOLTIP_DEFELECTRICITY (1346) | "Electric-defense" | |
| DST_RESIST_ALL | 10002 | TID_TOOLTIP_DEFALLELEMETAL (1347) | "All Elements" | |
| DST_RESIST_FIRE | 30 | TID_TOOLTIP_DEFFIFE (1349) | "Fire-defense" | |
| DST_RESIST_WIND | 31 | TID_TOOLTIP_DEFWIND (1350) | "Wind-defense" | |
| DST_RESIST_WATER | 32 | TID_TOOLTIP_DEFWATER (1351) | "Water-defense" | |
| DST_RESIST_EARTH | 33 | TID_TOOLTIP_DEFEARTH (1352) | "Earth-defense" | |
| DST_HP_MAX | 35 | TID_TOOLTIP_MAXHP (1353) | "Max. HP" | |
| DST_MP_MAX | 36 | TID_TOOLTIP_MAXMP (1354) | "Max. MP" | |
| DST_FP_MAX | 37 | TID_TOOLTIP_MAXFP (1355) | "Max. FP" | |
| DST_HP / MP / FP | 38 / 39 / 40 | TID_TOOLTIP_HP / MP / FP | "HP" / "MP" / "FP" | |
| DST_HP / MP / FP_RECOVERY | 41 / 42 / 43 | TID_TOOLTIP_HP / MP / FPRECOVERY | "HP Recovery" / "MP Recovery" / "FP Recovery" | |
| DST_HP / MP / FP_RECOVERY_RATE | 10007 / 10008 / 10009 | TID_TOOLTIP_xPRECOVERYRATE | "HP Recovery" / "MP Recovery" / "FP Recovery" | % |
| DST_ALL_RECOVERY | 10012 | TID_TOOLTIP_ALL_RECOVERY | "HP, MP, FP Recovery Power" | |
| DST_ALL_RECOVERY_RATE | 10013 | TID_TOOLTIP_ALL_RECOVERY_RATE | "HP, MP, FP Recovery Rate" | % |
| DST_KILL_HP / MP / FP | 44 / 45 / 46 | TID_TOOLTIP_KILL_x | "HP Recovery Power once you kill NPC" (and MP / FP) | |
| DST_KILL_ALL | 10014 | TID_TOOLTIP_KILL_ALL | "HP, MP, FP Recovery Power once you kill NPC" | |
| DST_KILL_HP / MP / FP / ALL_RATE | 10015 / 10016 / 10017 / 10018 | TID_TOOLTIP_KILL_x_RATE | "… Recovery Rate once you kill NPC" | % |
| DST_ALL_DEC_RATE | 10019 | TID_TOOLTIP_ALL_DEC_RATE | "Decrease Rate of MP, FP Consumption" | % |
| DST_ADJ_HITRATE | 47 | TID_TOOLTIP_HITRATE (1365) | "Hit" | % |
| DST_CHR_DMG | 63 | TID_TOOLTIP_CHRDMG | "Additional Damage" | |
| DST_CHRSTATE | 64 | TID_TOOLTIP_CHRSTATE | "Additional Attribute" | |
| DST_PARRY | 65 | TID_TOOLTIP_PARRY | "Parry" | |
| DST_ATKPOWER_RATE | 66 | TID_TOOLTIP_ATKPOWER (2639) | "Increased Attack" | % |
| DST_JUMPING | 68 | TID_TOOLTIP_JUMPING | "Jumping Height" | |
| DST_BLOCK_MELEE | 14 | TID_GAME_TOOLTIP_BLOCK (2472) | "Blocking Rate of Melee attacks" | % |
| DST_BLOCK_RANGE | 8 | TID_GAME_TOOLTIP_BLOCKRANGE (2611) | "Blocking Rate of Ranged attacks" | % |
| DST_STAT_ALLUP | 10003 | TID_GAME_TOOLTIPALLSTAT (2629) | "All Stat" | |
| DST_HP_MAX_RATE | 52 | TID_TOOLTIP_DST_HP_MAX_RATE (2636) | "Increased HP" | % |
| DST_ADDMAGIC | 62 | TID_GAME_TOOLTIPCONDITIONRATE (2628) | "Add Magical Power" | |
| DST_ADJDEF_RATE | 72 | TID_TOOLTIP_DST_ADJDEF_RATE (2638) | "Increased DEF" | % |
| DST_MP_MAX_RATE | 53 | TID_TOOLTIP_DST_MP_MAX_RATE (2637) | "Increased MP" | % |
| DST_FP_MAX_RATE | 54 | TID_TOOLTIP_DST_FP_RATE (2640) | "Increased FP" | % |
| DST_CHR_CHANCECRITICAL | 9 | TID_TOOLTIP_DST_CRITICAL_RATE (2678) | "Critical Chance" | % |
| DST_CHR_WEAEATKCHANGE | 55 | TID_TOOLTIP_DST_CHR_WEAEATKCHANGE | "Attribute Attack" | |
| DST_MASTRY_EARTH / FIRE / WATER / ELECTRICITY / WIND | 15 / 17 / 18 / 19 / 20 | TID_TOOLTIP_DST_MASTRY_x | "Mastery: Earth" (Fire, Water, Electricity, Wind) | % |
| DST_REFLECT_DAMAGE | 29 | TID_TOOLTIP_DST_REFLECT_DAMAGE | "Reflect Damage" | % |
| DST_MP_DEC_RATE / FP_DEC_RATE | 73 / 74 | … | "Decreased MP Consumption" / "Decreased FP Consumption" | % |
| DST_SPELL_RATE | 75 | TID_TOOLTIP_DST_SPELL_RATE | "Decreased Casting Time" | % |
| DST_CAST_CRITICAL_RATE | 76 | … | "Max. Spell" | % |
| DST_CRITICAL_BONUS | 77 | TID_TOOLTIP_DST_CRITICAL_BONUS (2690) | "Additional Damage of Critical Hits" | % |
| DST_YOY / BOW / KNUCKLE / SWD / AXE_DMG | 5 / 6 / 21 / 25 / 34 | … | "Increased Attack Power (Yo-Yo)" (Bow, Knuckle, Sword, Axe) | |
| DST_ATTACKSPEED_RATE | 51 | TID_TOOLTIP_ATTACKSPEED_RATE | "The rate of attack speed" | % |
| DST_CHR_STEALHP | 56 | TID_TOOLTIP_DST_DMG_GET (3103) | "Damage absorb" | % |
| DST_PVP_DMG_RATE | 22 | TID_TOOLTIP_DST_DMG_GET (3103) | "Damage absorb" (wrong TID in the original) | |
| DST_EXPERIENCE | 67 | TID_TOOLTIP_DST_EXPERIENCE | "Exp." | % |
| DST_MELEE_STEALHP | 81 | TID_TOOLTIP_DST_MELEE_STEALHP | "Lifesteal (HP)" | |
| DST_MONSTER_DMG | 79 | TID_TOOLTIP_DST_MONSTER_DMG | "Damage increase vs. Monsters" | % |
| DST_PVP_DMG | 80 | TID_TOOLTIP_DST_PVP_DMG | "Damage increase during PvP." | % |
| DST_HEAL | 82 | TID_TOOLTIP_DST_HEAL | "Cure" | |
| DST_ATKPOWER | 83 | TID_TOOLTIP_ATKPOWER_VALUE (3291) | "Attack" | |
| DST_ONEHAND / TWOHAND / YOYO / BOW / KNUCKLEMASTER_DMG | 85-89 | … | "Increases damage while using a one-handed weapon." etc. | |
| DST_HAWKEYE_RATE | 90 | TID_TOOLTIP_DST_HAWKEYE | "Increases the range of a Bow." | % |
| DST_RESIST_MAGIC_RATE | 91 | TID_TOOLTIP_DEFMAGIC_RATE | "Decrease the Magic defense of a target" | % |
| DST_GIFTBOX | 92 | TID_TOOLTIP_DST_GIFTBOX | "It becomes a lucky box when you wear it." | |
| DST_HPDMG_UP | 10004 | TID_TOOLTIP_DST_HPDMG_UP | "Attack power and HP increase" | |
| DST_DEFHITRATE_DOWN | 10005 | TID_TOOLTIP_DST_DEFHITRATE_DOWN | "Defense power and accuracy decrease" | % |
| DST_RESTPOINT_RATE | 93 | TID_TOOLTIP_RESTPOINT_RATE | "Bubble Time!" | % |
| DST_CHR_RANGE | 7 | TID_GAME_TOOLTIP_ATTACKRANGE4 | "Increased Range" | |
| DST_STOP_MOVEMENT | 16 | TID_GAME_TOOLTIP_MOVEMENT1 | "Rooted" | |
| DST_IMMUNITY | 61 | TID_GAME_TOOLTIP_IMMUNITY1 | "Immunity" | |

DST ids are from `Resource/defineAttribute.h`. `IsDst_Rate(0)` is also TRUE because the rate array holds literal zeros, but DST 0 never reaches a print.

**The number format differs per helper.** Copy them exactly:

| Helper | rate | non-rate | negative non-rate |
|---|---|---|---|
| PutBaseItemOpt, accessory lines, PutVisPetInfo | `"\n%s%+d%%"` | `"\n%s%+d"` | `STR-5` |
| PutRandomOpt, PutPiercingOpt | `"\n%s%+d%%"` | `"\n%s+%d"` (literal `+`) | `STR+-5` |
| PutSetItemOpt | `"\n%s: %s% +d%%"` → `Set Effect: Increased HP+5%` | `"\n%s: %s +%d"` → `Set Effect: STR +5` | |
| PutEnchantOpt | `"\n%s+%d%%"` | `"\n%s+%d"` | |
| PutAwakeningBlessing | `"\n%s %c%d%%"` (ATTACKSPEED: `"\n%s %c%d%% "`, with a trailing space) | `"\n%s %c%d"` | `%c` is `'+'` when adj > 0, else `'-'`; the value printed is `abs` |
| PutDestParam | `"\n%s%s%d%%"` | `"\n%s%s%d"` | sign string `""` when negative, `"+"` otherwise |
| PutAddedOpt | `"\n%s+%d%%"` (only MELEE_STEALHP and PVP_DMG) | `"\n%s+%d"` | |

For `DST_ATTACKSPEED` every rate format prints `adj / 2 / 10` (C integer division).

### 1.4 Line order (`MakeToolTipText`, `WndManager.cpp:6550-6746`)

`pMover` is `g_pPlayer`, except when `flag == APP_QUERYEQUIP` and the query window exists: then it is that window's mover (`:6563-6569`). `pMover` drives every "can you use it" colour.

| # | Step | Runs when | Cite |
|---|---|---|---|
| 1 | PutItemName | always | `:6581` |
| 2 | PutItemAbilityPiercing (same line) | always | `:6582` |
| 3 | PutPetKind | always (prints only for pets and eggs) | `:6584` |
| 4 | Equip-bind line | `prop.dwFlag & IP_FLAG_EQUIP_BIND` (0x04) | `:6586-6595` |
| 5 | PutWeapon | always | `:6596` |
| 6 | PutSex | always | `:6597` |
| 7 | `switch (prop.dwItemKind2)` | see below | `:6599-6693` |
| 8 | PutDestParam from the pick-up-pet skill | `IK3_PET` (100) and `dwActiveSkill != NULL_ID`; uses AddSkillProp at level 1 | `:6696-6710` |
| 9 | PutVisPetInfo | `IsVisPet()` | `:6715-6718` |
| 10 | PutCoolTime | always | `:6721` |
| 11 | PutEndurance | always, but compiled to nothing | `:6722` |
| 12 | PutKeepTime | always | `:6723` |
| 13 | PutJob | always | `:6724` |
| 14 | PutLevel | always | `:6725` |
| 15 | PutCommand (description) | always | `:6726` |
| 16 | PutItemGold (price) | always (flag-dependent) | `:6727` |
| 17 | PutSetItemOpt | always (prints only for set pieces) | `:6728` |
| 18 | PutPetInfo: **clears everything before it** | `IK3_EGG` (120) and `m_pPet != NULL` | `:6730-6731` |
| 19 | PutPetFeedPocket: **clears everything before it** | id == `II_SYS_SYS_SCR_PET_FEED_POCKET` (21035) | `:6732-6733` |
| 20 | PutPiercingOpt (socketed card effects) | always | `:6736` |
| 21 | PutAwakeningBlessing | always (prints only for awakenable kinds) | `:6739` |
| 22 | PutAddedOpt (Ultimate gem options) | IK2 WEAPON_DIRECT/MAGIC and `dwReferStat1 == WEAPON_ULTIMATE` (2) | `:6742-6744` |

Step 7, by `dwItemKind2` (values from `Resource/defineItemkind.h`):

- **WEAPON_DIRECT 2, WEAPON_MAGIC 3, ARMOR 7, ARMORETC 8, CLOTH 9, CLOTHETC 10, BLINKWING 22**: PutItemMinMax → PutItemSpeed → PutItemResist (if `IK3_ELECARD` (37), or `m_nResistAbilityOption != 0` and IK1 is WEAPON 1 or ARMOR 2) → PutBaseResist → PutBaseItemOpt → PutRandomOpt → PutEnchantOpt (`:6601-6630`).
- **REFRESHER 11, FOOD 14, POTION 12**: PutMedicine(dwDestParam1, nAdjParamVal1), then PutMedicine(dwDestParam2, nAdjParamVal2) (`:6631-6638`).
- **JEWELRY 13**: PutBaseItemOpt (`:6639-6643`).
- **SYSTEM 19**: if `IK3_VIS` (138), PutNeededVis + PutBaseItemOpt; if the id is `II_SYS_SYS_SCR_SEALCHARACTER` (26476), PutSealChar (`:6645-6660`).
- **GMTEXT 27** with `IK3_TEXT_DISGUISE` (81): PutDestParam on the prop's dst1/dst2, plus PutDestParam on `AddSkillProp(dwActiveSkill, 1)` when it has an active skill (`:6663-6688`).
- Anything else (RIDING, WARP, …): nothing.

Every line except the first starts with `"\n"`. When a helper pushes `"\n"` and then prints nothing, an empty line remains; PutItemMinMax does this for gear without min/max.

### 1.5 The helpers in detail

Each entry gives: condition → exact text → formula → colour → data (`CItemElem` field or propItem.txt column; column names are those of the header row of `Resource/propItem.txt`, read in `_Common/ProjectCmn.cpp:300-480`).

**PutItemName** (`WndManager.cpp:4538-4614`). Returns the name colour, which PutItemAbilityPiercing reuses.

- Colour from `dwReferStat1`: 0 `WEAPON_GENERAL` → dwName0 `#2E70A9`; 1 `WEAPON_UNIQUE` → dwName1 `#005D00`; 2 `WEAPON_ULTIMATE` → dwName3 `#7F00FF`; 3 `ARMOR_SET` → dwName1 `#005D00`; anything else (usually `=`, i.e. −1) → dwName0 (`:4542-4552`).
- Bound prefix, when all of these hold:
  - `m_byFlag & binds` (0x02)
  - the id is not `II_GEN_MAT_ORICHALCUM01_1` (2082) or `II_GEN_MAT_MOONSTONE_1` (2083)
  - `prop.dwFlag != IP_FLAG_EQUIP_BIND`. This is an equality test, not a bit test.

  The text is `"%s "` of `TID_GAME_TOOLTIP_ITEM_BINDS` (3112) `"Event Reward:  "`, giving `"Event Reward:   "` with 3 spaces (`:4559-4565`).
- Old random-option prefix: if `dwParts != -1` and `CRandomOptItemGen::GetRandomOptItem(low byte of m_iRandomOptItemId)` exists, the prefix becomes `"<name> "` (`:4568-4573`). **This is dead with this data**: `Resource/propItemEtc.inc` has no `RandomOptItem` blocks (loader at `_Common/Project.cpp:4208-4227`).
- Body:
  - Cloak (`IK3_CLOAK` 24) with `m_idGuild != 0`: if `g_GuildMng` knows the guild and the cloak is not a guild-war dragon cloak (`II_ARM_S_CLO_CLO_DRAGON1..4`), the body is `TID_GUILD_CLOAK` (2415) `"%s Guild Cloak"` with the guild name. Otherwise it is `prop.szName` (`:4575-4588`).
  - Everything else uses `CItemElem::GetName()` (`_Common/Item.cpp:608-636`): `szName`, except `IK3_EGG` with `m_pPet`, which gives `TID_GAME_CAGE_STRING` (3360) `"%s Cage"`. The `%s` is the pet's own name when it has one (`__PET_1024`), else the MoverProp name of `m_pPet->GetIndex()` (`_Common/pet.cpp:390-401`: egg `MI_PET_EGG`, D/C → index 0, B/A → index 1, S → index 2, from `Resource/pet.inc`).
- Ultimate names get 13 leading spaces, room for the icon (`:4597-4600`). The client also strips the `@` marker and the character before it from Ultimate `szName` at load (`_Common/ProjectCmn.cpp`, `LoadPropItem`, `:522-528`).
- The whole line is bold (`ESSTY_BOLD`).
- Data: `m_dwItemId`, `m_byFlag`, `m_idGuild`, `m_pPet`; propItem `szName`, `dwReferStat1`, `dwItemKind3`, `dwParts`, `dwFlag`.

**PutItemAbilityPiercing** (`:4616-4640`), on the name line:

- If `m_nAbilityOption != 0`: `" %+d"` (e.g. `" +7"`), name colour, bold.
- If `GetPiercingSize() > 0` and the item is not the sealed-character scroll: `"    (%d/%d)"` (4 spaces) = non-zero socket ids / socket count, dwPiercing `#B200FF`, not bold. Buff pets keep vis in the piercing vector, so they show "(used/slots)" too.

**PutPetKind** (`:7611-7638`):

- `IK3_PET`: `"\n[Buff Pet]"` (`TID_TOOLTIP_PET_BUFF` 4351) when `IsVisPet()`, i.e. `dwReferStat1 == PET_VIS` (1) or `m_bTranformVisPet` (`_Common/Item.h:273`, `_Common/ProjectCmn.h:380`). Otherwise `"\n[Pick-Up Pet]"` (4349).
- `IsEgg()` (`IK3_EGG` with no `m_pPet`, or level `PL_EGG`, `Item.cpp:787-792`): `"\n[Raised Pet]"` (4350).
- Colour black (default). A hatched raised pet prints nothing here.

**Equip-bind** (`:6586-6595`): when `prop.dwFlag & 0x04`, `"\n"` followed by:

- `binds` flag set: `TID_TOOLTIP_EQUIPBIND_AFTER` (4166) `"Soul-linked."`
- not set: `TID_TOOLTIP_EQUIPBIND_BEFORE` (4165) `"This item will be soul-linked once equipped."`

The colour is the TID colour, `0xffff0000` `#FF0000`.

**PutWeapon** (`:6151-6170`): when `dwItemKind3 != IK3_SHIELD` (16) and `dwHanded != -1`: `"\n"` + `"One-handed weapon."` (`TID_GAME_TOOLTIP_ONEHANDWEAPON` 1040, `HD_ONE` = 1) or `"Two-handed weapon."` (1041, `HD_TWO` = 2). Any other `dwHanded` gives an empty line. dwGeneral. Column `dwHanded`.

**PutSex** (`:5984-5999`): when `dwItemSex != -1`: `"\n"` + `"SEX: Male"` (1077, value 0) or `"SEX: Female"` (1078). The colour is dwGeneral when `dwItemSex == pMover->GetSex()`, else dwNotUse `#FF4200`. Column `dwItemSex`.

**PutItemMinMax** (`:4995-5062`):

- Always pushes `"\n"` first.
- Prints only when `dwAbilityMin`, `dwAbilityMax` and `dwEndurance` are all `!= -1`.
- `f = pMover->GetItemMultiplier(item)` (`_Common/MoverAttack.cpp:2069-2097`):
  - 0 if the item is `expired`.
  - Otherwise `1.0f * (100 + ExpUpItem(kind3, opt)) / 100.0f`, where `opt` is `m_nAbilityOption`, or **10 for any Ultimate weapon**.
  - `ExpUpItem` (`_Common/Project.cpp:5163-5201`) reads `Resource/expTable.inc` `expUpitem` (lines 557-571; rows +0…+10):
    - column 0 (weapons: SWD, CHEERSTICK, WAND, AXE, KNUCKLEHAMMER, STAFF, YOYO, BOW, COLLECTER): `0 2 4 6 8 10 13 16 19 21 24`
    - columns 1-5 (HELMET, SUIT, GAUNTLET, BOOTS, SHIELD): `0 2 4 6 8 10 12 14 16 18 20`
    - other IK3: 0, plus an error log.
- `nMin = (int)(pMover->GetItemAbilityMin(id) * f)`, `nMax` the same with max.
  - `GetItemAbilityMin` (`_Common/MoverParam.cpp:541-546`) is `pMover->GetParam(DST_ABILITY_MIN, base)`, with `base = Gear(dwAbilityMin)` for players with IK1 weapon/armour (raw otherwise).
  - `GetParam` (`MoverParam.cpp:2771-2782`) returns the mover's "chg" value for that DST if one is set, else `base + adj`. So the player's own `DST_ABILITY_MIN/MAX` bonuses shift the shown numbers.
  - **Float32 matters.** `f` is a float, so `100 * 1.06f = 105.99999` → 105 (not 106). In TypeScript use `Math.trunc(Math.fround(base * Math.fround(Math.fround(100 + up) / 100)))`.
- If `m_nAbilityOption > 0`, both values get `+ (int)pow(opt, 1.5)` (`:5017-5023`, `:5040-5046`): +1..+10 → 1, 2, 5, 8, 11, 14, 18, 22, 27, 31.
- Weapons (IK2 2/3): label `TID_GAME_TOOLTIP_ATTACKRANGE2` (1038) `"Attack:"` in dwGeneral, then `" %d ~ %d"`, giving `Attack: 105 ~ 132`. Everything else: label `TID_GAME_TOOLTIP_DEFENSE_B` (1098) `"DEF"`, then `" %d ~ %d"`. The `nOpt` branches (ATTACKRANGE1 / DEFENSE_A) are dead because `nOpt` is always 0.
- Number colour: `f >= 1` `#000000`; `0.8 <= f < 1` `#00FF00`; `0.6 <= f < 0.8` `#FF0000`; otherwise `#808080`. In v15 `f` is either ≥ 1 or 0 (expired, so grey numbers that are just the refine bonus).

**PutItemSpeed** (`:4704-4716`): weapons only (IK2 2/3), when `fAttackSpeed != 0xffffffff`. Pushes `"\n"`, then `TID_GAME_TOOLTIP_ATTACKSPEED` (1039) `"Attack speed: %s"` with `GetATKSpeedString` (`WndManager.cpp:107-121`):

| fAttackSpeed | Text |
|---|---|
| < 0.035 | `"Very slow"` |
| < 0.050 | `"Slow"` |
| < 0.070 | `"Normal"` |
| < 0.080 | `"Fast"` |
| < 0.17 | `"Very fast"` |
| otherwise | `"Fastest"` |

dwGeneral. Column `dwAttackSpeed` (float).

**PutItemResist** (`:4642-4702`):

- Element from `m_bItemResist` (`SAI79`, `_Common/data.h:409`): 1 `"Fire"`, 2 `"Water"`, 3 `"Electric"`, 4 `"Wind"`, 5 `"Earth"` (`TID_UPGRADE_FIRE` 2237, `_WATER` 2238, `_ELECTRICITY` 2239, `_WIND` 2240, `_EARTH` 2241).
- IK1 weapon/armour with a known element: `"\n%s%+d"` of `m_nResistAbilityOption`, e.g. `Fire+5`. **Bold if `m_nResistSMItemId != 0`** (the paid element card flag). Colour is the element's dwResistX, all `#000000`. Nothing is printed when the element is unknown.
- Any other IK1 (element cards): `"\n%s Lv%d"` with `dwItemLV`.

**PutBaseResist** (`:5641-5674`): one `"\n"` + line per non-zero prop resistance, in this order (each column is stored as float × 100, `ProjectCmn.cpp`):

1. `"Electricity Resistance : %d"` (1087), column `fItemResistElecricity`
2. `"Fire Resistance : %d"` (1090), `fItemResistFire`
3. `"Water Resistance : %d"` (1088), `fItemResistWater`
4. `"Wind Resistance : %d"` (1092), `fItemResistWind`
5. `"Earth Resistance : %d"` (1093), `fItemResistEarth`

Colour `#000000`.

**PutBaseItemOpt** (`:5100-5179`):

- Prop stats: for i = 0..2 (columns `dwDestParam1-3` / `nAdjParamVal1-3`) with `dst != -1`:
  - `DST_STAT_ALLUP` prints four lines: `"\nSTR%+d"`, `"\nDEX%+d"`, `"\nINT%+d"`, `"\nSTA%+d"`.
  - Rate DSTs: `"\n%s%+d%%"`.
  - Others: `"\n%s%+d"`. There is no space between name and number (`STR+5`, `Increased HP+10%`).
  - All values go through `Gear`. dwGeneral.
- Accessories (`CAccessoryProperty::IsAccessory`) **add** the lines of `CAccessoryProperty::GetDst(id, m_nAbilityOption)` (`_Common/accessory.cpp:31-37`; data `Resource/accessory.inc`, one row per refine 0…20), same format. Both the prop lines and the accessory lines print.

**PutRandomOpt** (`:4833-4861`): dead with this data (see PutItemName). Format would be `"\n%s%+d%%"` / `"\n%s+%d"` in dwRandomOption.

**PutEnchantOpt** (`:4889-4939`), the armour set +N bonus:

- `n = pMover->GetSetItemClient()` (`_Common/Mover.cpp:8732-8748`): the **minimum** refine over the equipped `PARTS_UPPER_BODY` (2), `HAND` (4), `FOOT` (5) and `CAP` (6); 0 if any of the four is missing or +0. For another player it reads `m_aEquipInfo[part].nOption & 0xFF` (`Mover.cpp:8710-8730`).
- Shown only when one of these holds:
  - own mover, `flag == APP_INVENTORY`, the item is equipped (`m_Inventory.IsEquip(m_dwObjId)`), its `dwParts` is one of the four, and `n > 0`;
  - another mover, `flag == APP_QUERYEQUIP`, the part matches, and `n > 0`.
- Values from `prj.GetSetItemAvail(n)` = row `n−1` of `Resource/expTable.inc` `Setitem` (lines 818-831; `_Common/Project.cpp:3424-3439`, `:4130-4135`). Columns are hit%, block%, max HP%, add magic, all stats:

  | Refine | Hit % | Block % | Max HP % | Add magic | All stats |
  |---|---|---|---|---|---|
  | +1, +2 | 0 | 0 | 0 | 0 | 0 |
  | +3 | 25 | 15 | 0 | 15 | 0 |
  | +4 | 50 | 15 | 0 | 20 | 0 |
  | +5 | 50 | 15 | 25 | 25 | 5 |
  | +6 | 100 | 30 | 25 | 30 | 5 |
  | +7 | 100 | 30 | 25 | 35 | 5 |
  | +8 | 150 | 50 | 50 | 40 | 10 |
  | +9 | 150 | 50 | 50 | 45 | 10 |
  | +10 | 225 | 75 | 100 | 50 | 15 |

- Lines (each only if > 0), dwEnchantOption `#000000`:
  - `"\nHit+%d%%"`
  - `"\nBlock+%d%%"` (`TID_GAME_TOOLTIPBLOCKRATE` 2625)
  - `"\nIncreased HP+%d%%"`
  - `"\nAdd Magical Power+%d"`
  - `"\nAll Stat+%d"`

**PutMedicine** (`:5064-5098`), run once per (dst, adj) pair, when `dst != -1`:

- When `adj != -1`, push `"\n"` and then by dst:
  - `DST_MP` (39): `"MP Recovery: %d"` (1069)
  - `DST_HP` (38): `"HP Recovery: %d"` (1070)
  - `DST_FP` (40): `"FP Recovery: %d"` (1071)
- Then, if `dwAbilityMin != -1`: `"\n"` + `"Max. Recovery: %d"` (1072) with `dwAbilityMin`. This repeats once per valid pair, so it prints twice when both dst columns are set.
- dwGeneral, no `Gear`.

**PutNeededVis** (`:7429-7476`), for vis (`IK3_VIS`): for each of the columns `dwReferTarget1` / `dwReferTarget2` that is not `NULL_ID` and not 0, print `"\n%s: %s"` with `TID_GAME_BUFFPET_REQUIRE` (4254) `"Required Bead: "` and the required vis `szName`. The result reads `Required Bead: : <Name>`. Colour `#000000`, or `#FF0000` when the requirement fails: no active buff pet (both lines red), or `g_pPlayer->IsSatisfyNeedVis(pet, visProp)` returns FAILED_BOTH / FAILED_1ST / FAILED_2ND.

**PutSealChar** (`:5594-5638`), for `II_SYS_SYS_SCR_SEALCHARACTER`. One run in `#FF1414`:

| Line | Source |
|---|---|
| `"\nCharacter Name\n<m_szItemText>"` | `m_szItemText` |
| `"\nLevel    :<lvl>"` | `lvl = m_nRepairNumber`; suffix `"-M"` (`TID_GAME_TOOLTIP_MARK_MASTER`) when 16 ≤ job < 24, `"-H"` (`MARK_HERO`) when job ≥ 24; job is `m_nRepair` |
| `"\nClass  :<job name>"` | `prj.m_aJob[m_nRepair].szName`, from `Resource/etc.inc` + `etc.txt.txt` |
| `"\nStat"` | |
| `"\n- STA   :<piercing[0]>"` | piercing slot 0 |
| `"\n- STR   :<piercing[1]>"` | piercing slot 1 |
| `"\n- DEX   :<piercing[2]>"` | piercing slot 2 |
| `"\n- INT   :<piercing[3]>"` | piercing slot 3 |
| `"\n- POINT :<m_nResistAbilityOption>"` | `m_nResistAbilityOption` |

**PutDestParam** (`:7364-7423`), for the disguise text item and pick-up pets:

- At most 2 lines; skips `NULL_ID`, 0 and `DST_CHRSTATE`.
- Sign string `""` when negative, `"+"` otherwise.
- Rate: `"\n%s%s%d%%"` (ATTACKSPEED: `/2/10`); otherwise `"\n%s%s%d"`.
- Colour `#0000FF`, no `Gear`.
- Data: the prop's `dwDestParam1/2` + `nAdjParamVal1/2`, or the AddSkillProp of `dwActiveSkill` at level 1 from `Resource/propSkillAdd.csv`.

**PutVisPetInfo** (`:7479-7609`), for buff pets:

- Totals: for each socket below the piercing size whose vis prop exists, has `now < GetVisKeepTime(i)`, and passes `IsSatisfyNeedVis(...) == SUCCSESS_NEEDVIS`, add its three prop dst/adj pairs into a map. Print one line per DST in **ascending DST id**: rate `"\n%s%+d%%"`, else `"\n%s%+d"`. dwPiercing `#B200FF`.
- Then, for each slot below `MAX_VIS` (9) with an id: `"\n"` + `"<VisName> (<remaining>)"`. `<remaining>` is built from these texts with no spaces:
  - days > 0: `"%.1dday"` + `"%.1dhr"` + `"%.1dmin"`
  - else hours > 0: `"%.1dhr"` + `"%.1dmin"`
  - else minutes > 0: `"%.1dmin"` + `"%.1dsec"`
  - else seconds ≥ 0: `"%.1dsec"`
  - else `"Expiration"` (`TID_GAME_TOOLTIP_TIMEOUT`)

  The texts are `TID_PK_LIMIT_DAY` / `HOUR` / `MINUTE` / `SECOND`. Colour dwTime when `t > 0`, else `#FF0000`.

**PutCoolTime** (`:5826-5844`):

- Cooldown group (`_Common/CooltimeMgr.cpp:19-43`) exists only when `dwSkillReady > 0`: `IK2_FOOD` → 1 (`IK3_PILL` → 2), `IK2_SKILL` → 3.
- When the group's end time is still in the future: `"\n"` + `TID_TOOLTIP_COOLTIME` (2483) `"Waiting Time for reuse: %.2d:%.2d"`, minutes and seconds of `(end − now + 500) / 1000`. dwGeneral.
- The client-side timer is set when a `UI_COOLTIME` item update arrives (`Neuz/DPClient.cpp:3226-3244`, `CooltimeMgr.cpp:54-61`).

**PutEndurance** (`:5959-5982`): the body sits inside `#if __VER < 11`, so there is **no durability line**.

**PutKeepTime** (`:5846-5957`):

- **A. Prop duration.** When column `dwCircleTime != -1`, push `"\n"`, then:
  - `== 1`: `TID_GAME_COND_USE` (2618) `"Takes effect when player dies."`
  - otherwise: `TID_TOOLTIP_ITEMTIME` (1380) `"Time Left"` + `" : "`, then `TID_TOOLTIP_DATE` (1378) `"%d Day(s) %d Hr(s) %d Min(s) %d Sec(s)"` of `dwCircleTime` seconds.

  Colour dwTime `#00C800`.
- **B. Time left.** `t = m_dwKeepTime − now`. Vis items in the bag have no server timer: when `t <= 0` and the item is `IK3_VIS`, the code sets `m_dwKeepTime = dwAbilityMin` (minutes; this **mutates** the item) and `t = minutes × 60` (`:5870-5874`).
- When `m_dwKeepTime != 0` and the item is not `expired`, and `t > 0`:
  - `IK3_TICKET` (122): `TID_TOOLTIP_DATE` in full.
  - Vis: the compound day/hr/min texts, as in PutVisPetInfo.
  - Everything else: days → `"%.1dday"` with **days + 1**; else hours `"%.1dhr"`; else minutes `"%.1dmin"`; else `"%.1dsec"`.

  Then `TID_TOOLTIP_PERIOD` (2667) `"Period"` is appended with no space. The line is `"\n"` + e.g. `4dayPeriod`, in dwTime `#00C800`. When `t <= 0` without the expired flag, the text is just `"Period"`.

**PutJob** (`:6001-6116`): when column `dwItemJob != -1`, push `"\n"` + the job text:

| Job ids | Texts |
|---|---|
| 0-5 | `"Req Job: Vagrant"`, `"Req Job: Mercenary"`, `"Req Job: Acrobat"`, `"Req Job: Assist"`, `"Req Job: Magician"`, `"Req Job: Puppeteer"` |
| 6-15 | `"Req Job: Knight"`, `"…Blade"`, `"…Jester"`, `"…Ranger"`, `"…Ringmaster"`, `"…Billposter"`, `"…Psykeeper"`, `"…Elementor"`, `"…Gatekeeper"`, `"…Doppler"` (TIDs 1047-1062) |
| 16-23 | `"Required Job: Master Knight"` … `"Master Elementor"` (4177-4184) |
| 24-31 | `"Required Job: Hero Knight"` … `"Hero Elementor"` (4185-4192) |

Any other value gives an empty line. The colour is dwGeneral when `pMover->IsInteriorityJob(job)` (`_Common/MoverParam.cpp:409-458`), else dwNotUse. `IsInteriorityJob` returns true when:

- the job is Vagrant or the mover's own job;
- the mover is 2nd class and `job*2+4` or `job*2+5` equals the mover's job;
- the mover is a Master and either the job is 1st class with `job*2+14` / `job*2+15`, or the job is 2nd class with `job+10`;
- the mover is a Hero and the job is 1st class (`job*2+22` / `+23`), 2nd class (`job+18`), or Master (`job+8`).

**PutLevel** (`:6118-6149`): when column `dwLimitLevel1 != -1`:

- `"\n"` + `TID_GAME_TOOLTIP_REQLEVEL` (1089) `"Required Level : %d"` with the **raw** `dwLimitLevel1`.
- Colour dwNotUse when `item.IsLimitLevel(pMover)`, else dwGeneral. `IsLimitLevel` (`_Common/Item.cpp:678-687`):
  - FALSE (can use) when the mover's job type ≥ `JTYPE_MASTER` (5) and is greater than the job type of `dwItemJob` (`-1` counts as the mover's own job type, so this never passes);
  - else FALSE when `level >= GetLimitLevel()`, which is `dwLimitLevel1 + GetLevelDown()` with a floor of 0 (`Item.cpp:665-674`);
  - else TRUE.
- If `GetLevelDown() != 0`, `"(%d)"` follows on the same line, i.e. `(-5)` or `(-10)`, in dwNotUse.

**PutCommand** (`:6172-6213`): when column `szComment` (`prop.szCommand`) is non-empty: `"\n"` + `TID_ITEM_INFO` (2252) `"Description: %s"`. dwCommand `#000000`. Couple rings (`II_GEN_WARP_COUPLERING` 3600, `_COUPLERING01` 3601, `II_GEN_WARP_WEDDING_BAND` 18186) with `m_iRandomOptItemId > 0` use instead `TID_ITEM_COUPLERING_DESC` (2903) `"The name of %s was carved into the ring."`, with the name from `CPlayerDataCenter` for `(u_long)m_iRandomOptItemId`.

**PutItemGold** (`:5676-5824`), with prices formatted by `GetNumberFormatEx` (comma every 3 digits, `_Common/xUtil.cpp:396-410`):

- **`flag == APP_SHOP_`** (NPC shop item):
  - Requires `GetCost() != -1`. `CItemBase::GetCost` (`_Common/Item.cpp:123-145`) returns −1 when `dwCost` is −1; otherwise `dwCost`, or, when refined, `(int)(dwCost + dwCost*(0.1f + opt*opt/18.0f))`.
  - Penya vendor (`m_nVenderType == 0`): `cost = (int)(prj.m_fShopBuyRate * cost)`. When `CTax::IsApplyTaxRate`, `beforeTax = cost` and `cost += (int)(cost * purchaseTaxRate)`.
  - Red-chip vendor (`m_nVenderType == 1`): `cost = GetChipCost()` = column `dwReferValue1`.
  - Then `cost = (int)(cost * prj.m_fShopCost)` (applied to chips too). `II_SYS_SYS_SCR_PERIN` costs `PERIN_VALUE` (100000000, `Resource/define.h:264`). Values ≤ 0 become 1.
  - Line: `"\n"` + `TID_GAME_TOOLTIP_COST2` (2411) `"Price : %s"`, plus `" Red Chip"` (`TID_GAME_REDCHIP`) for chip vendors. dwGold `#000000`.
  - When tax applies and it is a penya vendor: `"\n"` + `TID_GAME_TAX_RATE` (3939) `"Before tax price : %s"` in its TID colour `#808080`.
- **`flag == APP_INVENTORY`** and the NPC shop window is open (`GetWndBase(APP_SHOP_)`):
  - `sell = (DWORD)GetCost() / 4`, then `* m_fShopSellRate`, then `−= sell * salesTaxRate` when tax applies; values below 1 become 1.
  - Line: `"\n"` + `TID_GAME_TOOLTIP_SHELLCOST2` (2412) `"Selling Price : %s"`, plus the `"Before tax price"` line when tax applies.
- **`flag == APP_VENDOR`**: `"\n"` + `"Selling Price : %s"` with `CItemBase::m_nCost`. This is not a serialised field; private-shop packets fill it.
- Any other flag: no price.
- Tax (`_Common/Tax.cpp:96-160`): `IsApplyTaxRate` is TRUE whenever the player stands in a known continent and the item is not perin, red chip, awakening scroll or pet-awakening scroll. **The "Before tax" line therefore appears even when the rate is 0%.** Rates are `nTaxRate × 0.01` from the server's tax info. The continent comes from polygons in `World/WdMadrigal/WdMadrigal.wld.cnt` (`_Common/Continent.cpp:29-66`, `:272-343`).
- `m_fShopCost`, `m_fShopBuyRate` and `m_fShopSellRate` default to 1.0 and arrive in the game-rate packet (`Neuz/DPClient.cpp:6473-6625`, `_Common/Project.cpp:126`, `:271-272`).

**PutSetItemOpt** (`:4941-4993`), when the id is an element of a set (`CSetItemFinder`, data: `Resource/propItemEtc.inc` `SetItem` blocks with names in `propItemEtc.txt.txt`; loader `_Common/Project.cpp:4162-4206`):

- Title: `"\n\n%s (%d/%d)"`, i.e. a blank line, then `<Set name> (<equipped>/<pieces>)`, in dwSetName `#000000`. `<equipped>` counts pieces equipped by `pMover` with the exact id in the set's part, not expired (`Mover.cpp:9022-9054`).
- Each piece in file order: `"\n   %s"` (3 spaces) + `szName`, `#0000CC` when equipped, `#B2B2B2` when not.
- Effects: `GetItemAvail(&a, nEquiped, TRUE)` (`Project.cpp:4355-4379`) sums every `Avail` row with required count ≤ equipped, per DST, in file order. Lines are `"\n%s: %s% +d%%"` for rate DSTs and `"\n%s: %s +%d"` otherwise, prefixed with `TID_TOOLTIP_SET` (2727) `"Set Effect"`, in dwSetEffect `#FF9D00`.

**PutPetInfo** (`:5285-5446`), raised pet with `m_pPet`. It calls `pEdit->Empty()`, so everything printed before step 18 is lost.

| Line | Text | Colour |
|---|---|---|
| Name | `GetName()` (`"<pet> Cage"`), bold | `#2E70A9` |
| (PutPetKind) | `"\n[Raised Pet]"` only while an egg | black |
| Death, same line | `" (Death)"` (`TID_GAME_PETINFO_DEAD`), bold, when `expired` | `#FF0000` |
| Grade | `"\n"` + `"%s : %s"` = `"Level : <grade>"`; grade texts `"Egg"`, `"D Level"`, `"C Level"`, `"B Level"`, `"A Level"`, `"S Level"` (`TID_GAME_PETGRADE_E..S`) | `#009E00` |
| Bonus (not egg) | `"\n"` + `"Bonus : <stat> +N"`, or `+N%` for ATKPOWER_RATE / ADJDEF_RATE / HP_MAX_RATE / MP_MAX_RATE. Stat text: STR / DEX / INT / STA / `"Attack"` / `"Increased Attack"` / `"DEF"` / `"Increased DEF"` / `TID_TOOLTIP_DST_HP_MAX` = **`"#NAME?"`** (a broken English string) / `"Increased HP"` / `"Increased MP"`. N = `CPet::GetAvailDestParam` (`_Common/pet.cpp:378-388`): the sum over levels D…current of `pet.inc` `m_anParam[availLevel[lv−1] − 1]` | `#FF0000` |
| History (above egg) | `"\n"` + `"("` `#00C8FF`, then per level D…current `"Lv%d"` (`m_anAvailLevel`) `#007FFF`, separated by `"/"` `#00C8FF`, then `")"` `#00C8FF` | as stated |
| Exp | `exp = (exp × 10000 / maxExp) / 100.0`, maxExp 50000 for eggs and 100000 otherwise. At ≥ 99.99 the text is `"Exp : 99.99%"` (the TID's `%%` goes through Format); else `"Exp : %.2f%%"` | `#7878DC` |
| Life (above egg) | `"\nLife : %d"` | `#FF6464` |
| P.Hp (above egg) | `"\nP.Hp : %d / %d"` (energy / max energy from pet.inc) | `#FF0A0A` |
| Description | `"\n"` + raw `szCommand`, with no "Description:" prefix | `#B200FF` |

Steps 20-22 still append afterwards; awakening can apply to C-level and higher pets.

**PutPetFeedPocket** (`:5448-5590`), for id 21035; it also calls `Empty()` first.

- When `m_dwKeepTime > 0`:
  - name `szName`, bold, `#2E70A9`
  - player has buff `BUFF_ITEM II_SYS_SYS_SCR_PET_FEED_POCKET`: `" (Active)"` `#FF0000`; the remaining time line `"\n<t>Period"` in `#FF1414`; `"\nPet food count: N"` in `#3232CD`, where N = `GetItemNumForClient(II_SYS_SYS_FEED_01)`
  - otherwise: `" (Inactive)"` `#FF0000` and the time line in dwTime
  - then `"\nThe amount of Pet Feed in your inventory decreases rather than the HP of your pet.  Disappears 6 hours after activation."` in `#B200FF`
- When `m_dwKeepTime == 0`: the name, then `"\nDouble-click to use."` in `#B200FF`.

**PutPiercingOpt** (`:4862-4887`): `CItemElem::GetPiercingAvail` (`_Common/Item.cpp:331-356`) sums the `CPiercingAvail` entry of every socketed id per DST, in first-seen order. The data is `Resource/propItemEtc.inc` `Piercing <itemId> { DST adj … }` blocks (92 of them; loader `_Common/Project.cpp:4137-4160`, `:4251-4285`). Lines are `"\n%s%+d%%"` for rates and `"\n%s+%d"` otherwise, in dwPiercing `#B200FF`. **Socket card names are never listed.** Only the count `(n/m)` on the name line and the summed effects show.

**PutAwakeningBlessing** (`:4719-4830`) is covered in §2.

**PutAddedOpt** (`:5182-5283`), Ultimate weapons:

- `mapDst = prj.m_UltimateWeapon.GetDestParamUltimate(item)` (`_Common/UltimateWeapon.cpp:838-878`). It counts each gem id in the **Ultimate** piercing vector, reads `prop.dwReferStat2` as the gem's DST, and gets the value from `GetDST(gemId, count, dst)` using `Resource/Ultimate_GemAbility.txt` (loader `UltimateWeapon.cpp:46-115`).
- Only DSTs in `[HP_MAX, ATKPOWER, ADJDEF, MELEE_STEALHP, PVP_DMG, STR, STA, DEX, INT]` print, iterated in ascending DST id.
- MELEE_STEALHP and PVP_DMG use `"\n%s+%d%%"`; the others `"\n%s+%d"`. Values go through `Gear`. Colour dwAddedOpt7 `#FF0000`.
- The gem icons themselves are drawn by the renderer (§1.1).

### 1.6 Comparison tooltips (inventory bag only)

`PutToolTipItemAndSubToolTip` (`WndManager.cpp:6425-6512`) runs only for items in the inventory bag; see §3.

- The main tooltip is `PutToolTipParts(item, flag)`.
- For IK2 WEAPON_DIRECT/MAGIC, ARMOR, ARMORETC, CLOTH, CLOTHETC, JEWELRY, RIDING (20) and CLOTHWIG (32), it also shows the item equipped in `prop.dwParts` as sub 1.
- Paired slots:
  - `PARTS_RWEAPON` (10): if both hands are filled, sub 2 is the left weapon; else sub 1 is whichever hand is filled.
  - `PARTS_RING1` (20) / `PARTS_RING2` and `PARTS_EARRING1` (22) / `EARRING2`: the same logic.
- Sub tooltips start with `PutEquipItemText` (`:7721-7726`): `"[ %s ]\n"` with `TID_GAME_EQUIPED_ITEM` (4316) `"Equipped"`, bold, `#000000`.
- Sub tooltips get the same flag (APP_INVENTORY), so they can show set-enchant and sell-price lines.

---

## 2. Awakening / blessing (`m_iRandomOptItemId`) in full

### 2.1 Storage and bit layout

`CItemElem::m_iRandomOptItemId` is a signed `__int64` (`_Common/Item.h:155-170`). The comment `8|10|8|10|8|10|8` at `Item.h:157` is out of date. The real layout, from `SetParam` / `GetParam`:

| Bits | Meaning | Code |
|---|---|---|
| 0-7 | old "random option item" id (`GetRandomOpt()`), the CRandomOptItemGen prefix. **Unused with this data.** Also the only part a 32-bit `UI_RANDOMOPTITEMID` update touches | `Item.h:168-169`; `_Common/MoverParam.cpp:4022-4026` |
| 8-25 | option 0 (18 bits) | `randomoption.cpp:85-110`, `:151-169` |
| 26-43 | option 1 | same |
| 44-61 | option 2. Its DST top bit (bit 61) collides with the safe flag, so DSTs are read as **7 bits** | same, `:165` |
| 61 | `_AWAKE_SAFE_FLAG` `0x2000000000000000`, "awakening protected" | `randomoption.h:9`, `randomoption.cpp:348-406` |
| 62 | level-down −5 (`0x4000000000000000`) | `_Common/Item.cpp:645-663` |
| 63 | level-down −10 (`0x8000000000000000`); checked first | same |

Each 18-bit option field, counted from its own bit 0:

- bits 0-8: `|adj|` (0…511)
- bit 9: sign (1 = negative)
- bits 10-17: DST (masked to 7 bits on read)

Encode (`randomoption.cpp:85-110`): `field = (dst << 10) | (adj < 0 ? 0x200 | -adj : adj)`, placed at bit `8 + 18*i`, where `i` is the current option count.

Decode (`randomoption.cpp:151-169`):

```
n   = (int32)(raw >> (8 + 18*i))      // i = 0..2; the value is truncated to int
adj = n & 0x1FF;  if (n & 0x200) adj = -adj;
dst = (n >> 10) & 0x7F;               // option exists only if dst > 0
```

Option count:

- `GetRandomOptionSize(raw)` (`:171-197`) returns **0 when the safe flag is set**. Otherwise it counts consecutive non-zero 18-bit fields (mask `0x3FFFF << (8+18j)`), stopping at the first empty field; the maximum is 3 (`MAX_RANDOM_OPTION`, `randomoption.h:6`).
- `GetViewRandomOptionSize(raw)` (`:201-217`) does the same but ignores the safe flag. Its third mask includes bit 61, so a protected item with 2 options reports 3. The third `GetParam` then yields DST 0 and is skipped, so nothing visible changes.

Other operations:

- Re-awakening and "reversion" clear with `& 0xC0000000000000FF` (`:339-342`), which **keeps** the level-down bits and the low byte.
- `SelectNewRandomOption` keeps the same mask (`Item.cpp:853-858`).
- Sign: this server's `Resource/randomoption.inc` only generates positive values (header comment at line 1, "positive generation, x5 with the existing 511 packed-value cap"), but the decoder and the tooltip handle negatives.

### 2.2 Class, kind, data file

- Class: `CRandomOptionProperty` (`_Common/randomoption.h:45-119`, `_Common/randomoption.cpp`), singleton `g_xRandomOptionProperty` (`randomoption.h:122`).
- Data: `Resource/randomoption.inc`, loaded at `_Common/Project.cpp:621`, with blocks `Awakening`, `Blessing`, `SystemPet` and `EatPet`. Each block gives the probabilities of getting 1/2/3 options, then per DST its weight and `{adj probability}` list. Hand, foot and cap get their own derived tables (`AwakeningExtension`, `:413-445`):

  | Part | Allowed DSTs |
  |---|---|
  | hand | CHANCECRITICAL, ATKPOWER, SPELL_RATE, ATTACKSPEED, MP_MAX, FP_MAX |
  | foot | CRITICAL_BONUS, SPEED, ADJDEF, HP_MAX, MP_MAX, FP_MAX |
  | cap | STR, DEX, INT, STA, MP_MAX, FP_MAX |

  **The tooltip needs none of this.** It decodes the 64-bit value and prints it with the DST name table (§1.3). The file only matters for generation on the server.
- Kind, from `GetRandomOptionKind(item)` (`randomoption.cpp:112-149`), by `prop.dwParts`:

  | Kind | When |
  |---|---|
  | eAwakening (0) | UPPER_BODY 2, RWEAPON 10, SHIELD 11, HAND 4, FOOT 5, CAP 6 |
  | eBlessing (1) | CLOTH 27, CLOAK 8, HAT 26, GLOVE 28, BOOTS 29 (fashion parts) |
  | eSystemPet (2) | any other part, `IK3_EGG` with `m_pPet` level ≥ `PL_C` (2) |
  | eEatPet (3) | any other part, `IK3_PET` |
  | −1 | everything else; nothing is printed |

### 2.3 What PutAwakeningBlessing prints (`WndManager.cpp:4719-4830`)

1. `nKind < 0` → nothing.
2. `nSize = GetRandomOptionSize(raw)`. If the safe flag is set (`bSafe`), `nSize = GetViewRandomOptionSize(raw)` instead (`:4726-4733`).
3. Caption, by kind:
   - eAwakening and `nSize == 0`: `"\n\"Awakening Available\""`, with literal double quotes (`TID_GAME_AWAKENING` 3402), in dwAwakening `#0000FF`. When `nSize > 0` there is **no caption** in v15 (the "Awakening Options" caption, TID 3403, belongs to the `__VER < 12` branch only).
   - eBlessing and `nSize > 0`: `"\nBlessed Options"` (`TID_GAME_BLESSING_CAPTION` 3404) in dwBlessing `#0000FF`, and remember to print the warning.
   - eSystemPet / eEatPet and `nSize == 0`: `"\n\"Hidden stats are available!  Use an appropriate Scroll of Pet Awakening or Scroll of Pet Blessing to reveal them.\""` (`TID_GAME_AWAKENNIG_PET_00` 3823) in `#0000FF`.
4. Options `i = 0 … nSize−1`: skip when `GetParam` returns FALSE (DST 0). Apply `adj = Gear(adj)` (identity), then:
   - rate DST: `"\n%s %c%d%%"`, value `abs(adj)`; for ATTACKSPEED `"\n%s %c%d%% "` (trailing space) with `abs(adj/2/10)`;
   - other DSTs: `"\n%s %c%d"` with `abs(adj)`.
   - `%c` is `'+'` when `adj > 0`, else `'-'`.
   - Colour: eAwakening uses dwAwakening `#0000FF`, with `ESSTY_STRIKETHROUGH` when `bSafe`. Every other kind uses dwBlessing `#0000FF`, never struck through.
5. Blessing only, after the options: `"\n※ Blessed items cannot be dropped, traded, or placed in a Bank."` (`TID_GAME_BLESSING_WARNING` 3405) in dwBlessingWarning `#FF0000`.

The level-down bits show up in **PutLevel** (`(-5)` / `(-10)`), not here. Blessed and eat-pet options, and level-down, also make `IsBinds()` true (`Item.cpp:400-421`), but the tooltip does not show that.

**States:**

- **Not yet awakened**: an eligible part with value 0 shows the `"Awakening Available"` caption. Eligible fashion items with no blessing print nothing.
- **Protected (safe flag)**, set by the server (`WORLDSERVER/DPSrvr.cpp:9663-9690`): when a player who has the `II_SYS_SYS_SCR_AWAKESAFE` buff uses the awakening-cancel scroll, the server sets bit 61 instead of clearing the options. The tooltip then shows the old options **struck through** and no caption. The next awakening (`DPSrvr.cpp:9578-9660`) clears the flag, rolls a new set into `m_n64NewRandomOption` (not serialised), and sends `SNAPSHOTTYPE_ITEM_SELECT_AWAKENING_VALUE` (`Neuz/DPClient.cpp:876`, `:19344-19358`). The client shows its own old/new pick window (`_Interface/WndAwakening.cpp:307-400`), not the tooltip.
- Live updates: the server sends `UpdateItemEx(id, UI_RANDOMOPTITEMID, int64)`, which replaces the full 64-bit value (`Neuz/DPClient.cpp:3194-3207`, `_Common/MoverParam.cpp:3832-3857`).

### 2.4 Worked examples (computed with the code above)

**Example A: awakened suit (`PARTS_UPPER_BODY`, eAwakening), three options**

- Raw value: `0x08CFA184B0041400` (signed decimal `634903663743341568`)
- Fields:
  - option 0: `0x0414` → DST 1 (STR), +20
  - option 1: `0x612C` → DST 24 (ATTACKSPEED), +300
  - option 2: `0x8CFA` → DST 35 (HP_MAX), +250
  - low byte 0, no flags
- Printed (all `#0000FF`, no caption, not struck):

```
STR +20
Attack Speed +15%      <- 300/2/10 = 15, the line ends with a space
Max. HP +250
```

**Example B: protected gauntlet (`PARTS_HAND`, eAwakening), negative option, −5 level**

- Raw value: `0x600000983D4C6400` (signed decimal `6917529681504527360`)
- Flags: bit 61 (safe) and bit 62 (−5 level).
- Fields:
  - option 0: `0x14C64` → DST 83 (ATKPOWER), +100
  - option 1: `0x260F` → DST 9 (CHR_CHANCECRITICAL), sign bit set, 15 → −15
  - option 2 decodes to DST 0 → skipped (the view size says 3)
- Printed (`#0000FF` with strike-through; no "Awakening Available" caption, because the view size is greater than 0):

```
Attack +100            (struck through)
Critical Chance -15%   (struck through)
```

- Also, in PutLevel: `Required Level : 60` followed by `(-5)` in `#FF4200`. The required-level colour itself uses `60 − 5 = 55` for the level check.

**Example C (bonus): blessed cloak (`PARTS_CLOAK`, eBlessing)**

- Raw value: `0x000000B028685000`
- Fields: option 0 DST 26 (ADJDEF) +80; option 1 DST 11 (SPEED) +10.
- Printed:

```
Blessed Options                          (#0000FF)
DEF +80                                  (#0000FF)
Speed +10%                               (#0000FF)
※ Blessed items cannot be dropped, traded, or placed in a Bank.   (#FF0000)
```

**Example D**: a suit with value 0 prints `"Awakening Available"` (with the quotes) in `#0000FF`.

---

## 3. Windows that show item tooltips

APP ids: `APP_SHOP_` = `APP_SHOPEX` (280, `_Interface/AppDefine.h:6`), `APP_VENDOR` 231, `APP_REPAIR` 276, `APP_QUERYEQUIP` 507, `APP_INVEN_REMOVE_ITEM` 585, `APP_INVENTORY` 1003, `APP_BAG_EX` 689, `APP_BANK` 204, `APP_GUILD_BANK` 336, `APP_COMMON_BANK` 396 (`Resource/ResData.h`).

**What each flag changes:**

| Flag | Effect |
|---|---|
| `APP_QUERYEQUIP` | Swaps `pMover` for the inspected player, and enables PutEnchantOpt for a non-active mover |
| `APP_INVENTORY` | PutEnchantOpt for own equipped set parts; the sell price line while an NPC shop is open |
| `APP_SHOP_` | Buy price (plus red chip and tax lines) |
| `APP_VENDOR` | `"Selling Price"` from `m_nCost` |
| anything else (0, `APP_REPAIR`, `APP_INVEN_REMOVE_ITEM`) | No extra effect. PutEndurance, which would have used `APP_SHOP_` / `APP_QUERYEQUIP`, is compiled out |

**No tooltip line ever shows the stack count** (`m_nItemNum`); the count is drawn on the icon.

| Window / control | Call site | Arguments | Notes |
|---|---|---|---|
| Inventory bag grid (`CWndItemCtrl`, frame `APP_INVENTORY`, grandparent `APP_INVENTORY`) | `_Interface/WndItemCtrl.cpp:177` (`OnMouseWndSurface`), `:106` (`UpdateTooltip`, re-run after every item update, `MoverParam.cpp:3849-3852`, `:4052-4057`) | `PutToolTipItemAndSubToolTip(item, …, APP_INVENTORY)` | Main tooltip plus comparison tooltips of the equipped items (§1.6). Sell price while the shop is open. Bag items are not equipped, so no set-enchant lines on the main tooltip |
| Same, while the Repair window is open | `WndItemCtrl.cpp:172`, `:101` | `PutToolTip_Item(…, APP_REPAIR)` | Single tooltip, same as flag 0 |
| Inventory equipment slots (`CWndInventory::OnMouseWndSurface`) | `_Interface/WndField.cpp:1151` (loop `:1107-1150`) | `APP_INVENTORY`, after `g_toolTip.SetSubToolTipNumber(0)` | Single tooltip. Set-enchant lines appear here. The left-hand slot shows the shield, else the left weapon, else the right weapon. Empty slots show a slot-name tooltip (`:1152-1180`) |
| NPC shop tabs (`CWndShop`, `CWndItemCtrl` frame `APP_SHOP_`) | `WndItemCtrl.cpp:230` (also `:96`, `:166`); frame set at `_Interface/WndShop.cpp:794` | `APP_SHOP_` | Buy price (§1.5 PutItemGold) |
| Extra bags / pockets (`CWndBagEx`, grandparent `APP_BAG_EX`) | `WndItemCtrl.cpp:206` | `APP_INVENTORY` | Single tooltip; sell price while the shop is open; no comparison |
| Bank, common bank, guild bank (`CWndItemCtrl` frames `APP_COMMON_BANK` (`WndBank.cpp:62-72`), `APP_GUILD_BANK` (`WndGuildBank.cpp:108`); `APP_BANK` also accepted) | `WndItemCtrl.cpp:243` (`:239` with Repair open) | `APP_INVENTORY` (or `APP_REPAIR`) | Single tooltip; sell price while the shop is open |
| Trade window, both grids | `_Interface/WndTradeCtrl.cpp:76` | 0 | No price. The other side's items are full `CItemElem`s: the whole trader inventory is sent when the trade opens (`Neuz/DPClient.cpp:2517-2545`), then `OnTradePut` sends only indexes (`:2610-2623`) |
| Private shop (`CWndVendorCtrl`), both your own setup and browsing someone else's | `_Interface/WndVendorCtrl.cpp:208` (the `__VER >= 8` variant) | `APP_VENDOR` | `"Selling Price : <m_nCost>"` (unit price) |
| Guild contribution window (`CWndGuildMeritCtrl`, inventory item pointers) | `_Interface/WndGuildMerit.cpp:282` | `APP_VENDOR` | Prints `"Selling Price : <m_nCost>"`, normally 0 for inventory items |
| Inspect another player's equipment (`CWndQueryEquip`) | `WndField.cpp:587` | `APP_QUERYEQUIP` | The item is rebuilt from `m_aEquipInfo` + `EQUIP_INFO_ADD` (`:571-584`): id, flag byte, refine `nOption & 0xFF`, element, element level, the 64-bit random option, piercing. **No** keep time, pet, guild id or item text. Job, sex and level colours are judged against the inspected player. Set-enchant from their `nOption` |
| Task bar item shortcut | `_Interface/WndTaskBar.cpp:594` → `WndManager.cpp:4326-4330` | 0 | Looked up by object id in your own inventory |
| Dropped item in the world (mouse-over) | `_Interface/WndWorld.cpp:6442` (`HighlightObj`) | 0 | `CItem::m_pItemBase`, from `CItem::Serialize` (`_Common/ObjSerialize.cpp`) |
| Mail compose, attached item | `WndField.cpp:14180` (`CWndPostSend::OnDraw`) | 0 | Inventory item |
| Mail read, attached item | `WndField.cpp:14555` (`CWndPostRead::OnDraw`) | 0 | From `CMail::Serialize` (`_Common/post.cpp:121-127`) |
| Safe-upgrade window | `WndField.cpp:23995` (`CWndSmeltSafety`, `__VER >= 14`) | 0 | |
| Upgrade-window base (refine / element / piercing family) | `_Interface/WndUpgradeBase.cpp:62` | 0 | |
| Piercing window | `_Interface/WndPiercing.cpp:98` | 0 | |
| Element-change window | `_Interface/WndCommItem.cpp:1234` (`CWndCommercialElem`) | 0 | |
| Item transmute window | `_Interface/WndChangeFace.cpp:402`, `:413` (`CWndItemTransy`) | 0 | Empty slots show a hint string instead (`:404`, `:415`) |
| Repair list | `_Interface/WndRepairItemCtrl.cpp:72` | 276 (`APP_REPAIR`) | Same as 0 |
| Delete-item confirm | `_Interface/WndInvenRemoveItem.cpp:102` | `APP_INVEN_REMOVE_ITEM` | Same as 0 |
| Rock-paper-scissors mini game prize | `_Interface/WndMiniGame.cpp:397`, `:410` (`__EVE_MINIGAME`) | 0 | Local `CItemElem` with only `m_dwItemId` and `m_nItemNum = 1` |
| Pet egg transmutation | `_Interface/WndPetSys.cpp:2028` | 0 | |
| Buff-pet status, vis slots | `_Interface/WndPetSys.cpp:2843` | 0 | Local `CItemElem`: `m_dwItemId` = vis id, `m_dwKeepTime` = the slot's end time (`:2825-2841`) |

Not via `PutToolTip_Item`:

- The quest windows (`WndQuest.cpp`, `WndQuestQuickInfo.cpp`) have **no** item tooltips.
- The pet-status bonus tooltip builds its own text (`CWndPetStatus::OnMouseWndSurface`, `WndPetSys.cpp:838-912`).
- The awakening pick window draws its own option list (`WndAwakening.cpp:307-400`).
- `WndGuildHouse.cpp:487` is commented out.

---

## 4. Item wire data

### 4.1 `CItemElem::Serialize`, loading side (`_Common/ObjSerialize.cpp:31-44`, `:48-138`)

All values are little-endian raw copies (`CAr`, `_Network/Misc/Include/ar.h`). A string is an `int32` length followed by that many bytes, with no terminator (`_Network/Misc/Src/ar.cpp:81-119`).

| # | Field | Type (bytes) | Used by the tooltip for |
|---|---|---|---|
| 1 | `m_dwObjId` | DWORD (4) | yes: `IsEquip` (set-enchant), task-bar lookup |
| 2 | `m_dwItemId` | DWORD (4) | yes: everything (prop) |
| 3 | `m_liSerialNumber` | DWORD (4) (`SERIALNUMBER`, `_Network/CmnHdr.h:88`) | no |
| 4 | `m_szItemText` | string, max 31 chars. A longer length empties the archive (`ar.cpp:106-112`) | yes: the sealed-character name |
| 5 | `m_nItemNum` | short (2) | no (the count is on the icon) |
| 6 | `m_nRepairNumber` | BYTE (1) | yes: sealed-character level |
| 7 | `m_nHitPoint` | int (4) | no (durability removed; it holds the amount for gold) |
| 8 | `m_nRepair` | int (4) | yes: sealed-character job |
| 9 | `m_byFlag` | BYTE (1) | yes: `0x01` expired, `0x02` binds (`0x04` isusing is unused) |
| 10 | `m_nAbilityOption` | int (4) | yes: refine `+N`, min/max, price, accessory row, set-enchant |
| 11 | `m_idGuild` | DWORD (4) | yes: guild cloak name |
| 12 | `m_bItemResist` | BYTE (1) | yes: element |
| 13 | `m_nResistAbilityOption` | int (4) | yes: element level; sealed-character points |
| 14 | `m_nResistSMItemId` | int (4) | yes: element line in bold |
| 15 | `m_piercing` (`_Common/piercing.cpp:54-87`) | `int32 n`, then `n × DWORD` socket ids (kept ≤ 10); `int32 u`, then `u × DWORD` Ultimate gem ids (≤ 5); `int32 v`, then `v × int32` vis seconds left, which the client turns into absolute `now + t` (≤ 9) | yes: socket count, piercing effects, Ultimate gems, vis, sealed-character stats |
| 16 | `m_bCharged` | BOOL (4) | **no** (no cash or charged line) |
| 17 | `m_iRandomOptItemId` | `__int64` (8) | yes: §2; level-down; couple-ring partner id |
| 18 | `m_dwKeepTime` | DWORD (4) | yes: time left |
| 19 | when `m_dwKeepTime != 0`: `t` | `time_t` int32 (4) | seconds left; the client sets `m_dwKeepTime = now + t` (`:112-119`) |
| 20 | `bPet` | BYTE (1) | |
| 21 | when `bPet`: `CPet` (`_Common/pet.cpp:311-337`) | BYTE kind, BYTE level, DWORD exp, WORD energy, WORD life, BYTE[6] avail levels (`PL_MAX` = 6), string name (max 16, `__PET_1024`) | yes: pet info, cage name, eSystemPet kind |
| 22 | `m_bTranformVisPet` | BOOL (4) | yes: `IsVisPet` |

`CItemBase::m_nCost` is **not** in `Serialize`. It is filled for private-shop items (`OnPVendorItem`: per item, `BYTE index`, `CItemElem`, `int extra`, `int cost`, `Neuz/DPClient.cpp:14006-14024`; own vendor: `OnRegisterPVendorItem` `:13952-13965` → `_Common/MoverItem.cpp:559`).

### 4.2 How the containers arrive

- **Container format** (`_Common/Item.h:892-950`): `DWORD m_apIndex[max]`, `BYTE count`, then `count × (BYTE slot, CItemElem)`, then `DWORD objIndex[max]`.
- **Inventory**: max = 42 + 31 = 73 (`MAX_INVENTORY` 42, `MAX_HUMAN_PARTS` 31). **Equipped items live in the same container**: `GetEquip(part)` = `m_apIndex[42 + part]` (`Item.h:545-547`).
- **Own character**, in the mover snapshot (active-mover branch of `CMover::Serialize`): `m_Inventory` at `_Common/ObjSerializeOpt.cpp:585`, the 3 banks at `:586-587`, pockets at `:606`.
- **Other players**: only `m_aEquipInfo` (`dwId`, `byFlag` at `:649-663`; `nOption` at `:500`).
- **Single items**:
  - created or picked up: `OnCreateItem` (`DPClient.cpp:2136-2160`)
  - bank put / get: `:2881-2888`, `:2993-2998`
  - guild bank: `:2890-2990`, `:3057-3075`
  - pocket add: `:17365-17372`
- **NPC shop**: `OnOpenShopWnd`, one container per tab (`DPClient.cpp:2856-2879`; `OnVendor` `:3138-3176`).
- **Mail**: `CMail::Serialize` (`_Common/post.cpp:89-136`): `BYTE hasItem`, then `CItemElem`.
- **Inspect another player**: `OnQueryEquip` (`DPClient.cpp:15744-15773`): `int count`, then per part `int part`, `__int64 randomOpt`, `CPiercing`, `BYTE element`, `int elementLevel`.
- **Field updates** that change tooltip data:
  - `OnUpdateItem` (`DPClient.cpp:3210-3255`): `CHAR type, BYTE id, CHAR param, DWORD value, DWORD time`, applied by `CMover::UpdateItem` (`_Common/MoverParam.cpp:3862-4060`):
    - `UI_NUM`, `UI_HP`, `UI_REPAIR_NUM`, `UI_RN`
    - `UI_AO`: refine
    - `UI_RAO`: element level
    - `UI_IR`: element
    - `UI_PIERCING_SIZE` / `UI_PIERCING` (low word index, high word id)
    - `UI_ULTIMATE_PIERCING*`
    - `UI_PETVIS_SIZE` / `ITEM` / `ITEMSWAP`
    - `UI_TRANSFORM_VISPET`
    - `UI_RANDOMOPTITEMID`: low byte only
    - `UI_KEEPTIME`: minutes from now (`:4027-4032`)
    - `UI_FLAG`: high word is the flag byte (`:4034-4046`)
    - `UI_COOLTIME`
  - `OnUpdateItemEx` replaces the 64-bit random option.

### 4.3 What the tooltip reads outside `CItemElem`

| Input | Feeds | Source |
|---|---|---|
| `pMover` sex | PutSex colour | mover snapshot |
| `pMover` job and job type | PutJob colour, `IsLimitLevel` | mover snapshot; `prj.m_aJob` from `Resource/etc.inc` |
| `pMover` level | PutLevel colour | mover snapshot |
| `pMover` equipped items | set count, set member colours, set effects, set-enchant refine (4 parts), comparison tooltips | own inventory equip slots; `m_aEquipInfo.nOption` for other players |
| `pMover` `DST_ABILITY_MIN` / `MAX` adj/chg params | min~max numbers | the player's live params (`SetDestParam` packets) |
| Cooldown manager | PutCoolTime | client timers after `UI_COOLTIME` |
| Current time | keep time, vis times, feed pocket | client clock (`time_null()`) |
| Buffs (`BUFF_ITEM` feed pocket) and inventory count of `II_SYS_SYS_FEED_01` | PutPetFeedPocket | own buffs and inventory |
| Active buff pet and its vis (`IsSatisfyNeedVis`) | PutNeededVis, PutVisPetInfo | own inventory and pet state |
| Guild list | guild cloak name | `g_GuildMng` (guild packets) |
| Player id → name | couple-ring description | `CPlayerDataCenter` (server query) |
| Shop window state: open?, `m_nVenderType` of the NPC (`LPCHARACTER`) | price lines | `character.inc` (vendor type) + open-shop packet |
| `m_fShopCost`, `m_fShopBuyRate`, `m_fShopSellRate` | prices | game-rate packet |
| Tax rates and player continent | "Before tax" line, tax math | tax packets + `WdMadrigal.wld.cnt` polygons |

---

## 5. Lines that need data beyond the item element

| Tooltip part | Needs | Resource file(s) |
|---|---|---|
| All names, descriptions, IK kinds, requirements, base stats, resistances, attack speed, durations, costs, vis requirements | ItemProp | `Resource/propItem.txt` + `propItem.txt.txt` (`szName` / `szComment` are IDS keys) |
| Every fixed string and DST name | TIDs | `Resource/textClient.inc` + `textClient.txt.txt` (+ `defineText.h` for ids); job names `Resource/etc.inc` + `etc.txt.txt` |
| Set title, members, set effects | set table | `Resource/propItemEtc.inc` `SetItem` blocks + `propItemEtc.txt.txt` (set names) |
| Piercing effects (summed card stats) | piercing table | `Resource/propItemEtc.inc` `Piercing` blocks |
| Armour set +N bonus | `Setitem` table | `Resource/expTable.inc` lines 818-831 |
| Min~max refine multiplier | `expUpitem` table | `Resource/expTable.inc` lines 557-571 |
| Accessory refine stats | accessory table | `Resource/accessory.inc` |
| Ultimate gem option values | gem table + gem prop `dwReferStat2` | `Resource/Ultimate_GemAbility.txt` (+ `Ultimate_UltimateWeapon.txt`) |
| Pet bonus, max energy, cage model name | pet table + MoverProp | `Resource/pet.inc`; `propMover.txt` + `propMover.txt.txt` |
| Pick-up pet / disguise stat lines | AddSkillProp | `Resource/propSkillAdd.csv` (named in `Resource/Masquerade.prj`) |
| Awakening / blessing lines | nothing extra (decode + DST names). `Resource/randomoption.inc` is generation-only | — |
| Old random-option prefix and lines | `RandomOptItem` blocks | `Resource/propItemEtc.inc`: **none present, so skip** |
| Tooltip frame, Ultimate icon, gem slot frame | textures | Theme `WndTooltipTile00-08.tga`, `WndChgElemItem.bmp`; Icon `Icon_Ultimate.dds`; gem icons from `prop.szIcon` |
| Tax line | server tax info + continent polygons | `World/WdMadrigal/WdMadrigal.wld.cnt` (`Resource/ContinentDef.h`) |
| Guild cloak, couple ring | server-side names | guild / player-data packets |

---

## 6. Faithful-reproduction gotchas (quick list)

1. No durability line at all in v15; no count line; no cash/charged line.
2. Every line starts with `\n`. PutItemMinMax always adds `\n`, so gear without min/max gets an empty line.
3. The bound prefix is `"Event Reward:   "` (as in this text file). Equip-bind items use the separate red "Soul-linked." lines.
4. Each helper has its own number format (§1.3). Copy them exactly, including `"STR+5"` with no space, `"Set Effect: STR +5"`, `"STR +20"` in awakening, `"Hit+25%"`, the trailing space after awakening Attack Speed, and `"+-"` for negative piercing values.
5. Min~max uses float32 math (100 × 1.06f → 105).
6. "Time left" adds 1 to days and glues the unit and `"Period"`: `"4dayPeriod"`, `"5hrPeriod"`.
7. PutPetInfo and PutPetFeedPocket wipe all earlier lines.
8. Awakening captions: the suit/weapon caption appears only when **un**-awakened; blessing gets a caption plus a red warning; protected options are struck through.
9. `TID_TOOLTIP_DST_HP_MAX` is literally `"#NAME?"` in this English table (pet bonus line).
10. The "Before tax price" line shows whenever the player is in a known continent, even at 0%.
11. Comparison tooltips appear only for inventory-bag items (not banks, pockets, shop or equipment slots).
