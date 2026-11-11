# Item NPC windows: research (2026-11-11)

The owner asked for "the rest of the jewel menu", "the rest of safe upgrade menu", the "repair window" and the "admin
resistitem window". This note says how Neuz V15 does each, what the world server does, and what is skipped.

Sources are CP949 (`iconv -f cp949 -t utf-8`); `character.inc` and `textClient.*` are UTF-16 (the same lines after
iconv). Line numbers are today's Source, after the 2026-11-11 removal of the custom features: they are lower than the
2026-11-05 and 2026-11-10 notes' (WndField.cpp by about 40, DPClient.cpp by 55, DPSrvr.cpp by about 312). Paths start at
the V15 folder.

## 0. Compile switches

- Both builds define `__MAINSERVER` and `__VER 15` (`Source/Neuz/VersionCommon.h:3-4`, `Source/WORLDSERVER/VersionCommon.h:3-4`);
  the `__INTERNALSERVER` block (and its `__VER 16`, WORLDSERVER `:321-322`) is off.
- Every gate below tests `__VER`, so all are **on**: `__ULTIMATE`/`__CSC_VER9_1` (>= 9), `__REMOVE_ATTRIBUTE` (>= 10),
  `__PIERCING_REMOVE` (>= 11), `__CSC_VER12_4`, `__EXT_PIERCING` (>= 12), `__EXT_ENCHANT` (>= 13), `__SMELT_SAFETY` (>= 14),
  `__15_5TH_ELEMENTAL_SMELT_SAFETY` (>= 15; also defined in Neuz `:217`). Their named `#define`s are commented out, which
  does not matter.
- `__WINDOW_INTERFACE_BUG` is an `#ifdef`, defined in Neuz `:166`: on (the bag's close closes some windows).
- **Off:** every `#if __VER < 11 // __REMOVE_ENDURANCE` block: items never lose endurance (`Abrade`,
  `WORLDSERVER/AttackArbiter.cpp:179-181`, `_Common/MoverParam.cpp:3722-3787`), and the repair takes no gold
  (`DPSrvr.cpp:2585-2587`). The Moonstone cursor's old jewel removal (`WndField.cpp:13468-13523`) is the `#else` of
  `__CSC_VER12_4`: off.

## 1. The NPCs and their menus (`Resource/character.inc`, `AddMenu`)

| NPC | Entries |
|---|---|
| `MaFl_Peach` "[Jewel Manager] Peach" (:6970-6994) | 53, 51, 52 |
| `MaFl_Bobochan` "[Upgrade Specialist] BoBoChan" (:6247-6273) | 0, 54, 55, 59, 23, 72, 95, 134, 135, 136, 167 |
| `MaDa_Laydian` "[Upgrade Expert] Radyan" (:8034-8048) | the same 11 |
| `MaFl_Ultimate` (practice, :5970-5991) | 51, 52, 53, 54, 55 |

Labels are `TID_MMI_DIALOG + id` (7000 + id). Greyed in the web before this work: 51, 54, 55, 59, 72, 95, 167; and 14
(Repair) on any NPC that would list it. **No NPC of V15 lists MMI_REPAIR 14** (`defineNeuz.h:106`; it appears in no
character*.inc).

Opening (`_Interface/WndWorld.cpp`, `CWndWorld::OnCommand`): 51 :4942-4957 (also opens the bag), 54 :4986-5006, 55
:5007-5027, 59 :5045-5060, 72 :5061-5080, 95 :5081-5096, 167 :6035-6050, 14 :5388-5450. An open window refuses with
TID_GAME_WND_OVERLAPED "You are already using this window!", the weapon change with TID_GAME_CHANGE_NOWUSING "You are
already using the conversion window.", the repair with TID_GAME_REPAIR_STILL (red chat lines).

Closing: on moving (`CWndWorld::Process`, condition :8052) 51 (:8198-8207, with the bag), 54/55 (:8218-8222), 72
(:8229-8236), 95 (:8238-8242), 59 (:8298-8302), Repair (:8325-8331, with the bag), APP_TEST (:8363-8365), safe upgrade
(:8492-8496). On the bag's close (`CWndInventory::OnDestroy`, `WndField.cpp:1015-1075`): 51, 59, 72, 95, the safe upgrade
and APP_TEST; **not** 54/55 nor Repair.

## 2. The packets

Client to server (each after DPID_UNKNOWN and its type, `Neuz/DPClient.cpp`):

| Packet | Type (`_Network/MsgHdr.h`) | Body | Sender |
|---|---|---|---|
| ULTIMATE_MAKEITEM | 0xf000f110 (:609) | 10 x u32 (5 Sunstones, 5 Moonstones; an id once per piece) | :16281-16289 |
| ULTIMATE_TRANSWEAPON | 0xf000f112 (:611) | u32 weapon, u32 jewel, u32 Shining Oricalkum | :16299-16306 |
| ULTIMATE_REMOVEGEM | 0xf000f115 (:614) | u32 weapon, u32 Moonstone | :16316-16322 |
| PIERCINGREMOVE | 0xf000f809 (:660) | u32 item | :14760-14765 |
| REMVOE_ATTRIBUTE (sic) | 0xf000d00b (:521) | u32 item | :14734-14739 |
| SMELT_SAFETY | 0x70007000 (:753) | u32 item, card, SProtect, Smelting (Elements) or NULL_ID | :18686-18691 |
| REPAIRITEM | 0x00ff00b5 (:180) | BYTE count, count x BYTE object id | :14150-14190 |
| CHAT | 0x00ff0000 (:112) | `/ritem objid element rao ao` | :9091-9096 |

Server to client: ULTIMATE 0x0100 (`MsgHdr.h:1166`, BYTE state 1 MAKEITEM / 2 TRANSWEAPON / 5 REMOVEGEM, int result;
`WORLDSERVER/User.cpp:7764-7796`; results `_Common/UltimateWeapon.h:19-20`: 0 success, 1 failed, 2 cancel, 4 inventory,
5 not Ultimate); REMOVE_ATTRIBUTE 0x0122 (`MsgHdr.h:1184`, a BOOL, `User.cpp:7813-7821`, read `DPClient.cpp:6415-6423`);
SMELT_SAFETY 0x9900 (a byte); UPDATE_ITEM 0x0018 (UI_HP 1, UI_RN 2, UI_AO 3, UI_RAO 4, UI_IR 5, UI_PIERCING 7, UI_REPAIR_NUM
12, UI_ULTIMATE_PIERCING_SIZE 13, UI_ULTIMATE_PIERCING 14, `_Common/Mover.h:62-80`); DEFINEDTEXT for the texts.

The web read none of the client packets above but SMELT_SAFETY, and not 0x0122 (an unknown snapshot type stops the bundle
parser). The bag's items dropped `m_nRepairNumber`, `m_nHitPoint`, `m_nRepair` (`ObjSerialize.cpp:93-95`) and UI_HP,
UI_RN, UI_REPAIR_NUM.

## 3. The rest of the jewel menu

### 3.1 Create Shining Oricalkum (51, `CWndMixJewel`, `WndField.cpp:19069-19602`)

- APP_SMELT_MIXJEWEL (`resdata.inc:8420-8539`): 288 x 288, WndTile00, "Sunstone & Moonstone Use."; WIDC_PIC_SLOT1-5 (the
  Sunstones) at y 24, WIDC_PIC_SLOT6-10 (the Moonstones) at y 72, x 26/74/122/170/218, WndChgElemItem.bmp; WIDC_TEXT1
  [8,118,272,206] `Client/SmeltMixJewel.inc`; WIDC_START ButtStart.bmp [106,220,170,240].
- An empty slot shows its stone at alpha 50 (`OnDraw` :19120-19177). A drop fills the slot under it with its row's stone
  (Sunstone 2035/2082, Moonstone 2036/2083; :19277-19312), with Shift every empty slot of the row (:19332-19358); the bag's
  double-click the first empty one of its row (`SetJewel` :19378-19409, route :2241-2253). A double-click on a slot empties
  it (:19257-19271). The bag is in "die flag" mode while it is open. A whole stack held: "Too many Gems."
- START (enabled with all ten in, :19173-19176) sends ULTIMATE_MAKEITEM (:19413-19469). The answer (:19487-19519) empties
  every slot; success opens `CWndMixJewelConfirm` (`resdata.inc:8381-8419`, 272 x 176, "Confirm Composing", the Shining
  Oricalkum's icon, TID_GAME_MIXJEWEL_SUCCESS "Created a Shining Oricalkum.", OK); failed or cancel close it; inventory says
  TID_GAME_EXTRACTION_ERROR.
- Server (`DPSrvr.cpp:7272-7286`, `UltimateWeapon.cpp:421-517`): exactly 5 + 5, room for one: always success.

### 3.2 Create Unique / Ultimate Weapon (54 / 55, `CWndChangeWeapon(WEAPON_GENERAL / WEAPON_UNIQUE)`, :20472-20900)

- APP_SMELT_CHANGEWEAPON (`resdata.inc:9371-9435`): 224 x 384, its title TID_GAME_CHANGEWEAPON_UNIQUE / _ULTIMATE; STATIC1
  the weapon [92,24,124,56], STATIC2 the Shining Oricalkum [26,64,58,96], STATIC3 the jewel [154,64,186,96], TEXT2 the jewel
  table [12,108,204,204], TEXT1 the description [12,216,204,312] (`Smelt/ChangeUnique|UltimateWeapon.inc`), START
  [75,322,139,342]. It does not open the bag.
- Weapon: IK1_WEAPON, level 60+, `dwReferStat1` the window's type, and (55) +10 or more; the Oricalkum: 2034; the jewel
  (only with a weapon in): `GetGemKind(level)` (Topaz 60-70, Ruby 71-85, Sapphire 86-100, Emerald 101-119, Diamond 120).
  Wrong items are ignored. A double-click on a slot empties it. Hover texts TID_TOOLTIP_CHANGEW_*.
- START (all three in) sends TRANSWEAPON (weapon, jewel, Oricalkum). The answer: success/failure message boxes
  (TID_GAME_CGWEAPON_* / CUWEAPON_*), cancel closes it, inventory TID_GAME_EXTRACTION_ERROR; every slot emptied after.
- Server (`DPSrvr.cpp:7303-7320`, `UltimateWeapon.cpp:520-651`): 2 % (`Ultimate_UltimateWeapon.txt:10,12`), a unique must
  be exactly +10, an equipped weapon says TID_GAME_ULTIMATE_ISEQUIP; failure destroys the weapon (an XProtect buff keeps a
  unique one).

### 3.3 Remove Jewel (95, `CWndRemoveJewel`, :22397-22812)

- APP_SMELT_REMOVE_JEWEL (`resdata.inc:22458-22592`): 272 x 432, "Remove Jewel from Ultimate Weapon"; PIC_SLOT the weapon
  [114,18,146,50], PIC_SLOT1 the Moonstone [114,56,146,88] (its icon at alpha 50 when empty), JEWEL_SLOT1-5 and
  JEWEL_SLOT_INFO1-5 (Window02.bmp) at y 100/136/172/206/240, TEXT1 [10,282,258,358] `SmeltRemoveJewel.inc`, START
  [98,364,162,384].
- Each set jewel's icon and its stat's name (no value) in its family's colour (`WndManager.cpp:575-583`). Three names are
  "#NAME?" in the English text file (`textClient.txt.txt:1786-1788`): shown as the web's stat names instead.
- The weapon: Ultimate with a socket open, else TID_GAME_REMOVE_JEWEL_ERROR2; the Moonstone else ERROR1 (chat). START sends
  REMOVEGEM and **closes the window at once**. The server's texts (TID_GAME_REMOVEGEM_SUCCESS/FAILED), sound and effect are
  the feedback; the answer is read and ignored (`DPClient.cpp:11590-11594`).

### 3.4 Jewel Setting's turning weapon and the rest

- `CWndSmeltJewel::OnDraw` (:20012-20257): the item's model, camera per kind (:20054-20115), `PerspectiveFovLH(pi/4, 1, 1,
  100)` in the 160 x 230 box (stretched), world = Scale 1.5 x RotationX(m_fRotate), `m_fRotate += m_fAddRot` each draw (2 a
  frame idle), unlit; START's last ten steps take 0.4 off the eye's Y (`Process` :19970-20007).
- The upgrade cursor: Shining Oricalkum on the weapon an open Jewel Setting holds says TID_GAME_NOTEQUALITEM
  (`RunUpgrade` :13372-13381). The Moonstone's check (:13480-13489) is dead in V15.
- The "no" cursor over the world while it is open (`WndWorld.cpp:2645-2646`): already in the web (`hud/cursors.ts`).

## 4. The rest of the safe upgrade menu (BoBoChan, Radyan)

### 4.1 Safe Element Upgrade (167, `CWndSmeltSafety(WND_ELEMENT)`)

Safe Upgrade's window and run (`WndField.cpp:23578-25193`) with: the title TID_GAME_SMELTSAFETY_ELEMENT; NORMAL's wide
layout and labels; a suit or a weapon (`IsEleRefineryAble`); the value `m_nResistAbilityOption`, max 20; the material an
element card (Flame 3206, River 3211, Generator 3216, Cyclone 3226, Desert 3221): the item's element's, or with none the
first one placed chooses (`IsAcceptableMaterial` :24992-25044), ERROR18/ERROR19 for the others; scroll 1 SProtect 10464;
scroll 2 Smelting (Elements) 10489 under 10 (`DisableScroll2` from 10); ERROR17 (a scroll with no card), ERROR20 (START
with a pair missing); the placeholders (:24800-24917). No gold. Server: `ItemUpgrade.cpp:857-958` (UI_IR, UI_RAO on
success, the answer 1/2/3).

### 4.2 Remove Element upgrading (59, `CWndRemoveAttribute`, :21826-22098)

APP_REMOVE_ATTRIBUTE (`resdata.inc:10496`): 272 x 256; TEXT1 [16,68,250,172] `RemoveAttribute.inc`, START [98,185,162,205],
PIC_SLOT [114,24,146,56]. An item with no element upgrade: a message box TID_GAME_REMOVE_ERROR; not a suit or weapon:
ignored. START opens `CWndRemoveAttributeConfirm` (`resdata.inc:11732`, 288 x 128, TID_GAME_REMOVE_ATTRIBUTE, Yes/No); Yes
sends REMOVE_ATTRIBUTE (the box stays); the answer (TRUE: a box TID_GAME_REMOVE_ATTRIBUTE_CONFIRM) closes both. Server
(`DPSrvr.cpp:3642-3714`): 100,000 Penya, UI_IR 0 and UI_RAO 0.

### 4.3 Remove a Pierced Card (72, `CWndRemovePiercing`, :22101-22395)

APP_SMELT_REMOVE_PIERCING_EX (`resdata.inc:22329`): 272 x 480; PIC_SLOT [114,14,146,46], ten rows STATIC_PIERCING1-10
(WndSquare3.bmp, 240 x 24, y 54 + 26i) each showing its card's stats, a suit's rows 5-10 red; TEXT1 [10,326,258,402]
`SmeltRemovePiercing.inc`; START [98,412,162,432]. A pierceable item with a card goes in, else the chat line
TID_GAME_REMOVE_PIERCING_ERROR_EX. START sends PIERCINGREMOVE and closes the window. Server (`ItemUpgrade.cpp:338-381`):
1,000,000 Penya, the last card's socket emptied, TID_GAME_REMOVE_PIERCING_SUCCESS.

### 4.4 Create Unique / Ultimate Weapon (54, 55) and Remove Jewel (95)

The same windows as Peach's practice NPC and §3.2-3.3.

## 5. The Repair window (14, `CWndRepairItem`, `_Interface/WndRepairItem.cpp`, `WndRepairItemCtrl.cpp`)

- APP_REPAIR (`resdata.inc:692-757`): 192 x 304, WndTile02 tiled, "Repair"; STATIC2 "Repair List" [6,2,106,20], EDIT1
  [6,30,174,198] the grid's frame, STATIC1 "Repair Cost" [8,212,78,232], STATIC3 the cost [86,214,170,230], OK
  [6,242,78,262] ButtOk.tga, Cancel [102,242,174,262] ButtCancel.tga. The grid (`CWndRepairItemCtrl`, [6,24,174,192]): 25
  cells, 5 x 5, 32 px, icons at (x*32+6, y*32+10). It opens the bag and stands beside it (:70-79).
- Opening refusals (`WndWorld.cpp:5388-5446`): the bank, the trade, a shop, the beauty shops, Summon Angel, a vendor, an
  open repair (TID_GAME_REPAIR_TAKE*, _TRADEING, _STILL).
- In by a drop only (`OnChildNotify` :110-207): equipped TID_GAME_REPAIR_EQUIP; not IK2 1-8 or repaired to its
  `nMaxRepair` TID_GAME_REPAIR_DONOT; at full endurance TID_GAME_REPAIR_FULLENDURANCE; the cost
  `100 - hp*100/endurance` x (`dwCost/1000 + 1`) added, refused with TID_GAME_REPAIR_NOTENOUGHPENYA when gold is short. The
  bag draws a held item at alpha 60 and it cannot be dragged. Nothing comes out one by one: Cancel and close let all go. The
  bag's double-click says TID_GAME_REPAIR_NOTUSE.
- OK sends REPAIRITEM (the window stays); none to repair: TID_GAME_REPAIR_NO. Server (`DPSrvr.cpp:2536-2590`): UI_HP
  endurance and UI_RN per item, TID_GAME_REPAIRITEM "All items have been repaired."; no gold taken.
- **In practice:** endurance never drops in V15, so only items made with `m_nHitPoint` -1 (GM `/ci`) need it.
  `nMaxRepair` is not in the web's item catalog: the web reads it as "no limit" (the packs' gear has 180, and `m_nRepair`
  is never raised by V15's server).

## 6. The GM `/ResistItem` window (`CWndUpgradeBase`, APP_TEST)

- Table (`_Interface/FuncTextCmd.cpp:5236`): "ResistItem" / "ritem", TCM_BOTH, AUTH_ADMINISTRATOR ('P'). The web's
  command table already gates it.
- Client half (:1612-1661): with no window open it opens APP_TEST and sends nothing; with it open, `/ResistItem element rao
  ao` (element 0-5, rao 0-20, ao 0-10; element 0 makes rao 0; a missing word is 0) with an item in slot 0 sends
  `/ritem objid element rao ao` as chat; any error or an empty slot sends nothing.
- APP_TEST (`resdata.inc:11414-11577`): 240 x 280, WndUpgradeBase.tga (not tiled), "Upgrade"; slot 0 WIDC_CUSTOM3
  [74,24,106,56] ("Item"), the other five slots and labels belong to a never-finished upgrade (its server handler is empty,
  `DPSrvr.cpp:3851-3853`); OK ButOk2.bmp [32,210,106,232], Cancel ButCancel2.bmp [124,210,196,230]. It opens the bag and
  docks beside it. Slot 0 takes, by a drop only, armour or a weapon (IK2 ARMOR, WEAPON_MAGIC, WEAPON_DIRECT, ARMORETC);
  equipped TID_GAME_EQUIPPUT; a premium element (`m_nResistSMItemId`) a box TID_GAME_NOTUPGRADE. A right click on slot 0
  empties it. OK's UPGRADEBASE does nothing on the server: the web closes the window as Neuz does, sending nothing.
- Server half (:1565-1611): UI_IR, UI_RAO, UI_AO, and for an Ultimate weapon above +5 UI_ULTIMATE_PIERCING_SIZE ao - 5;
  equipped: TID_GAME_EQUIPPUT.

## 7. Pictures

All in `Client/Theme/Default`. Already converted: WndChgElemItem, ButtStart, Window02, WndEditTile00, ButOk2, ButtOk,
ButtCancel, ButCancel2, ButtYes, ButtNo, WndTile00. New: `WndSquare3.bmp` (the card rows), `WndUpgradeBase.tga` (APP_TEST),
`WndTile02` is the tiled frame's set (checked in the converter).

## 8. Left out

- Neuz's bugs: a drop on ChangeWeapon's stone slots that replaces an item without letting the old one go; the unique window
  accepting above +10 (kept, the server refuses); Remove Jewel taking a weapon with empty sockets (kept).
- APP_TEST's five other slots and OK's UPGRADEBASE (dead on the server).
- The Repair window's reach: no V15 NPC has its entry; the web enables it where an NPC lists it.
