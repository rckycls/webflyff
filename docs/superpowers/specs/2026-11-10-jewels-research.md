# Create Jewels and Jewel Setting: research (2026-11-10)

The owner asked for V15's "Create Jewel" and "Jewel setting" in FlyffWeb, on the PC and on a phone. This note says how Neuz
V15 does them, what the WorldServer checks, what the web pages say, and what FlyffWeb has today.

Sources are CP949: `iconv -f cp949 -t utf-8`. `WndField.cpp`, `WndManager.cpp` and `tooltip.cpp` line numbers are the
converted files' (the same lines). Paths start at the V15 folder (`Source/`, `Resource/`, `Client/`).

## 1. Which window is which

The menu texts (`Resource/textClient.txt.txt`, ids `Resource/defineText.h:380-385, 431`):

| MMI (`Resource/defineNeuz.h:146-200`) | Menu text | Window class | APP id |
|---|---|---|---|
| 51 MMI_SMELT_MIXJEWEL | Create Shining Oricalkum | CWndMixJewel | APP_SMELT_MIXJEWEL |
| 52 MMI_SMELT_JEWEL | **Jewel Setting** | CWndSmeltJewel | APP_SMELT_JEWEL |
| 53 MMI_SMELT_EXTRACTION | **Create Jewels** | CWndExtraction | APP_SMELT_EXTRACTION |
| 54 MMI_SMELT_CHANGEGWEAPON | Create Unique Weapon | CWndChangeWeapon(WEAPON_GENERAL) | APP_SMELT_CHANGEWEAPON |
| 55 MMI_SMELT_CHANGEUWEAPON | Create Ultimate Weapon | CWndChangeWeapon(WEAPON_UNIQUE) | APP_SMELT_CHANGEWEAPON |
| 56 MMI_LEGEND_SKILLUP | Level-up Hero Skill! | CWndHeroSkillUp | APP_HERO_SKILLUP |
| 95 MMI_SMELT_REMOVE_JEWEL | Remove Jewel from Ultimate Weapon | CWndRemoveJewel | APP_SMELT_REMOVE_JEWEL |

So the owner's "Create jewel" is **CWndExtraction** and "Jewel setting" is **CWndSmeltJewel**.

Who offers them (`Resource/character.inc`, UTF-16):
- `MaFl_Peach`, "[Jewel Expert] Peach" (:6970-6982): Dialog, Trade, Create Jewels (53), Create Shining Oricalkum (51),
  Jewel Setting (52), and two cancels. She stands in Madrigal (`World/WdMadrigal/WdMadrigal.dyo`).
- `MaFl_Ultimate`, a practice NPC (:5970-5980): 51, 52, 53, 54, 55.
- `MaFl_Bobochan` (:6247-6262): 54, 55 and 95 among the Upgrade Specialist's entries.

Opening (`Source/_Interface/WndWorld.cpp:4942-4985`): each entry refuses with TID_GAME_WND_OVERLAPED "You are already
using this window!" (a red chat line, `PutString`) while its window is open; otherwise it makes the window, which centres
itself (`MoveParentCenter`). Only Create Shining Oricalkum opens the bag as well (`CreateApplet( APP_INVENTORY )`, :4951).

Closing: when the player moves, `CWndWorld::Process` closes all four (WndWorld.cpp:8052, :8198-8222). Closing the bag
closes Create Jewels and Create Shining Oricalkum, not Jewel Setting (`CWndInventory::OnDestroy`, WndField.cpp:1036-1045).

The bag's double-click while one is open (`CWndInventory::OnChildNotify`, WndField.cpp:2288-2350): with Jewel Setting, a
jewel with a free piece goes in (`SetJewel`); with Create Jewels, a weapon (`IK1_WEAPON`) with a free piece goes in
(`SetWeapon`, which then checks the rest). Any other item's use is refused with TID_SBEVE_NOTUSEITEM in the chat
(:2577-2583).

While Jewel Setting is open the world takes no click (WndWorld.cpp:6761, :11532) and the cursor is CUR_NO (:2645). The
upgrade cursor refuses a Shining Oricalkum or a jewel removal on the weapon in it (TID_GAME_NOTEQUALITEM,
WndField.cpp:13405-13525).

## 2. Create Jewels (CWndExtraction)

Layout (`Resource/resdata.inc:8333-8380`), "Create Jewels", 272 x 208, tiled WndTile00:
- WIDC_TEXT1, a text on WndEditTile00 tiles, [16, 68, 250, 134]: the description.
- WIDC_START, ButtStart.bmp, [98, 144, 162, 164].
- WIDC_PIC_SLOT, WndChgElemItem.bmp, [112, 24, 144, 56]: the weapon.
- (WIDC_STATIC1 at [628, 285, ...] is off the window and unused.)

The description is `Client/Client/SmeltExtraction.inc` (`SetDescription`, WndField.cpp:19831-19843; a parsing string):
"#b#cff0000ff Create Jewel #nb#nc" and a paragraph that weapons of level 60 or more give jewels, more for a higher
upgrade, and that a failure destroys the weapon.

Rules (WndField.cpp:19650-19920):
- START is disabled until a weapon is in (OnInitialUpdate :19686-19723).
- The slot takes a drop on it (`OnDropIcon` :19763-19792) or the bag's double-click while the window is open (`SetWeapon`
  :19794-19812, called from WndWorld.cpp:8213). Only when the slot is empty, and only `dwItemKind1 == IK1_WEAPON` with
  (`dwReferStat1 == WEAPON_GENERAL && dwLimitLevel1 >= 60`) or `dwReferStat1 == WEAPON_UNIQUE`. Anything else is ignored
  with no message. The bag item is held (`SetExtra(+1)`: drawn faded, not usable).
- A double-click on the slot takes the weapon out and disables START (:19745-19761).
- START: disabled, then `SendUltimateMakeGem( weapon )` (:19814-19829).
- The answer (`ReceiveResult` :19845-19919):
  - SUCCESS: a message box "You have created %s %d." (TID_GAME_EXTRACTION_SUCCESS) with the jewel's name (from the weapon's
    level, `GetGemKind`) and the count. The slot empties; the window stays.
  - FAILED or CANCEL: a message box "Jewel creation failed." (TID_GAME_EXTRACTION_FAILED); the window closes.
  - INVENTORY: a message box "You have no space in your inventory. Please make space and try again!"
    (TID_GAME_EXTRACTION_ERROR); START is enabled again.
  - The slot is not emptied on SUCCESS by `SetExtra(0)`: the weapon is gone, so the hold goes with it.

Server (`Source/_Common/UltimateWeapon.cpp:189-277`, `CUltimateWeapon::MakeGem`):
- Not a weapon, or not general or unique: CANCEL. Equipped: chat TID_GAME_ULTIMATE_ISEQUIP "Unequip your weapon and try
  again." and CANCEL.
- The jewel by the weapon's level (`GetGemKind` :104-115, `Resource/Ultimate_GemAbility.txt` LEVEL_GEM): Topaz 60-70,
  Ruby 71-85, Sapphire 86-100, Emerald 101-119, Diamond 120. No row: CANCEL.
- The chance and count by the weapon's upgrade (`GetAbilityOption`, +0..+10) from `Resource/Ultimate_UltimateWeapon.txt`
  MAKE_GEM: general 5%, 10%, 15%, 20%, 50%, then 100% from +5, count 1, 1, 1, 1, 1, 1, 2, 3, 5, 10, 20; unique 10%, 20%,
  30%, 40%, then 100% from +4, count 1, 1, 1, 1, 1, 2, 4, 6, 10, 20, 40.
- A bag too full for the count: INVENTORY (only checked when the count is more than a stack).
- Otherwise the weapon is always removed; then the roll: SUCCESS with the jewels made, or FAILED.

## 3. Jewel Setting (CWndSmeltJewel)

Layout (`Resource/resdata.inc:8984-9073`), "Jewel Setting", 256 x 432, tiled WndTile00:
- WIDC_CUSTOM1 [16, 16, 176, 246]: the weapon's 3D model, turning; WIDC_STATIC6 Window01.bmp on the same rect (its
  background).
- WIDC_STATIC1..5, WndChgElemItem.bmp, at x 192-224, tops 32, 74, 116, 158, 200 (32 x 32): the five sockets.
- WIDC_TEXT1 [12, 260, 236, 358], WndEditTile00 tiles: the description, `Client/Client/SmeltJewel.inc`:
  "#b#cff0000ff Jewel Composing #nb#nc" and a paragraph: an Ultimate weapon of +6 or more, one of 9 attributes, a bonus
  for the same jewel twice, only the jewel lost on a failure, the last jewel removed with a Moonstone.
- WIDC_START, ButtStart.bmp, [90, 366, 154, 386].

Rules (WndField.cpp:19900-20530):
- The weapon: a drop on WIDC_CUSTOM1 (`OnDropIcon` :20300-20363) of an `IK2_WEAPON_DIRECT` or `IK2_WEAPON_MAGIC` with
  `dwReferStat1 == WEAPON_ULTIMATE`. A new weapon replaces the old one. The bag's double-click does **not** set the weapon:
  WndWorld.cpp:8208 calls only `SetJewel` (below).
- The sockets (`InitializeJewel` :20464-20520): `GetUltimatePiercingSize()` are open; each holds
  `GetUltimatePiercingItem( i )` (an ability jewel id, 0 for none). The usable socket is the first empty one, the count of
  set jewels, while that count is below the size.
- Drawing (OnDraw :20230-20290): an unopened socket WndDisableRed.bmp; an open socket with a jewel its icon over
  WndDisableBlue.bmp (none under the usable socket's new jewel); an empty open socket other than the usable one
  WndDisableBlack.bmp; the usable socket plain.
- The jewel: only II_GEN_MAT_RUBY, DIAMOND, EMERALD, SAPPHIRE or TOPAZ (2029-2033), and only while a weapon with at least
  one open socket is in: a drop on the usable socket (:20340-20361), or the bag's double-click (`SetJewel` :20365-20389),
  which puts it in the usable socket. One jewel at a time; it is held in the bag.
- A double-click on the usable socket takes the jewel out (:20391-20403).
- START is enabled only while the usable socket holds a jewel (`Process` :19993-20012).
- START (:20419-20435): disabled, sound PcSkillD-Counter01.wav, `m_nStatus = 1`. `Process` then turns the model faster,
  moves the camera in and whitens the view (alpha up to 230) for 25 steps, the first after 25 frames and each next one a
  frame sooner (:20014-20050), and only then sends `SendUltimateSetGem( weapon, jewel )`. No drop or double-click is taken
  meanwhile (`m_nStatus != 0`).
- The answer (`ReceiveResult` :20437-20462):
  - SUCCESS: message box "Jewel creation succeeded!" (TID_GAME_SMELTJEWEL_SUCCESS), sound InfUpgradeSuccess.wav, the
    window closes.
  - FAILED: message box "Jewel creation failed!" (TID_GAME_SMELTJEWEL_FAIL); the window stays, its sockets read again.
  - CANCEL: the window closes, no box. (ISNOTULTIMATE gets no case: nothing happens.)

Server (`UltimateWeapon.cpp:279-350`, `CUltimateWeapon::SetGem`):
- Either item unusable: CANCEL. Not ultimate: ISNOTULTIMATE. Equipped: chat TID_GAME_ULTIMATE_ISEQUIP and CANCEL.
- No empty socket: chat TID_GAME_ULTIMATE_GEMSPACE "No available sockets." and CANCEL.
- The jewel is always removed. 90% (SET_GEM 900000 of 1000000): the first empty socket gets a random one of the nine
  ability jewels of that jewel (`GetGemAbilityKindRandom` :173-187; e.g. Ruby -> RUBY01..09), sent as
  `UpdateItem( UI_ULTIMATE_PIERCING, MAKELONG( socket, abilityId ) )`.

Where the sockets come from: the Ultimate gem's upgrade (`EnchantWeapon`, UltimateWeapon.cpp:708-711) sends
`UI_ULTIMATE_PIERCING_SIZE = option - 5` from +6, so +6 opens 1 socket and +10 opens 5. The web pages say the same (§7).

## 4. How a set jewel shows afterwards

The tooltip (`CWndMgr::MakeToolTipText`, `Source/_Interface/WndManager.cpp:6550-6748`, and `CToolTip`,
`Source/_Interface/tooltip.cpp`):
- The name line of an Ultimate item starts with 13 spaces (`PutItemName`, WndManager.cpp:4597-4600) to leave room for
  `Icon_Ultimate.dds`, drawn at the tooltip's top left + (10, 8) (tooltip.cpp:745-753).
- The name line's "(n/m)" socket count is the normal sockets' only (`PutItemAbilityPiercing` :4616-4640).
- Last of all, for an Ultimate weapon (`IK2_WEAPON_DIRECT/MAGIC`, `WEAPON_ULTIMATE`), `PutAddedOpt` (:5182-5284, called
  at :6744): the set jewels' stats. `GetDestParamUltimate` (UltimateWeapon.cpp:838-881) counts each ability jewel up to the
  first empty socket, looks its DST up (`dwReferStat2` of the ability jewel's propItem row) and its value for that count
  (`GetDST` :883-910, `Ultimate_GemAbility.txt`); the same DST from two jewels adds up. The lines go in the map's order
  (ascending DST number), each "\n<DST name>+<value>", with "%" for steal HP and PvP damage, all in `dwAddedOpt7`'s
  colour. Only the nine DSTs of `nAddedOptDST` (:5205-5213) are shown.
- The socket row (`CToolTip::SetUltimateToolTip` tooltip.cpp:887-901, drawn at :757-780): the tooltip is made 36 px
  taller, and along its bottom, from x = 14 + (width - 194) / 2 and y = bottom - 24, one WndChgElemItem.bmp per open
  socket every 38 px, each with its jewel's icon when set.

The weapon's stats (`SetDestParamUltimate` :821-836) apply to the right-hand weapon only; that is the server's and the
status window's business, not this window's.

No glow: the Ultimate weapon's glow is the weapon's own (FlyffWeb's `render/weaponGlow.ts` already reads `referStat1`).

## 5. Packets

Client to server (`Source/Neuz/DPClient.cpp:16336-16385`; ids `Source/_Network/MsgHdr.h:609-614`), each after
DPID_UNKNOWN and the type:

| Packet | Id | Body |
|---|---|---|
| ULTIMATE_MAKEITEM | 0xf000f110 | 10 x OBJID (5 Oricalkum then 5 Moonstone) |
| ULTIMATE_MAKEGEM | 0xf000f111 | OBJID weapon |
| ULTIMATE_TRANSWEAPON | 0xf000f112 | OBJID weapon, gem1, gem2 |
| ULTIMATE_ENCHANTWEAPON | 0xf000f113 | OBJID weapon, gem (FlyffWeb has it) |
| ULTIMATE_SETGEM | 0xf000f114 | OBJID weapon, OBJID jewel |
| ULTIMATE_REMOVEGEM | 0xf000f115 | OBJID weapon, OBJID Moonstone |

Server to client: the snapshot SNAPSHOTTYPE_ULTIMATE 0x0100 (`MsgHdr.h:1190`), a BYTE state (`MsgHdr.h:1585-1590`:
1 MAKEITEM, 2 TRANSWEAPON, 3 MAKEGEM, 4 SETGEM, 5 REMOVEGEM, 6 ENCHANTWEAPON) and an int result
(`Source/_Common/UltimateWeapon.h:19`: 0 SUCCESS, 1 FAILED, 2 CANCEL, 3 ISULTIMATE, 4 INVENTORY, 5 ISNOTULTIMATE).
MAKEGEM adds an int, the count (`CUser::AddUltimateMakeGem`, `Source/WORLDSERVER/User.cpp:7821-7831`). The reader:
`CDPClient::OnUltimateWeapon` (DPClient.cpp:11577-11655). The server handlers: `Source/WORLDSERVER/DPSrvr.cpp:7584-7670`
(no NPC distance check). The item changes come as the usual REMOVE/CREATE items and UPDATE_ITEM.

## 6. The items (owner's `Resource/defineItem.h:880-941`)

- The jewels: DIAMOND 2029, EMERALD 2030, SAPPHIRE 2031, RUBY 2032, TOPAZ 2033.
- The ability jewels: `<jewel>01..09`, 2037-2081, five a row (DIAMOND0n, EMERALD0n, SAPPHIRE0n, RUBY0n, TOPAZ0n for n = 1..9):
  01 HP, 02 ATK, 03 DEF, 04 steal HP, 05 PvP damage, 06 STR, 07 STA, 08 DEX, 09 INT (`Ultimate_GemAbility.txt`).
- Shining Oricalkum 2034, Oricalkum 2035/2082, Moonstone 2036/2083 (FlyffWeb's upgradeNpcWindows.ts has these).

## 7. Online

- New Madrigal's wiki ("Jewel Setting Creation") and the GamingPH guide: Peach, the Jewel Manager, does both; sockets open at
  Ultimate +6 (1) to +10 (5); Jewel Setting takes the weapon and a jewel, then Start. Their tiers and values are their own
  servers' (fan servers), so the code wins.
- GamingPH (2022, Flyff Universe): the jewel per weapon level band, Topaz to Emerald, used with Shining Power Dice for the
  unique weapon (a later system, not V15's).
- Sources: https://newmadrigal1.gitbook.io/new-madrigal-wiki/in-game-guide/upgrading-guide/jewel-setting-creation,
  https://gamingph.com/2022/07/how-to-craft-unique-weapon-in-flyff-universe, https://flyff-wiki.gpotato.com.br/wiki/Upgrading

## 8. What FlyffWeb has today

- Protocol: ULTIMATE 0x0100 is read (`packages/protocol/src/world/upgrade.ts:75-80`, `{ state, result }`), but MAKEGEM's
  count is not; ULTIMATE_ENCHANTWEAPON is sent by the upgrade cursor. No MAKEGEM or SETGEM sender.
- Items: `readPiercing` (`world/own.ts:232-239`) gives `item.ultimate` (the ultimate sockets); OwnState applies
  UI_ULTIMATE_PIERCING_SIZE and UI_ULTIMATE_PIERCING (`OwnState.ts:1089, 1103-1106`).
- Windows: `ResWindow` (`hud/resWindow.ts`) builds resdata.inc windows with picture statics, texts with parsing strings,
  picture buttons; `upgradeNpcWindows.ts` (Piercing, Safe Upgrade) shows the pattern: a host, slots by drop or the bag's
  double-click (`WorldScreen.takeIntoUpgradeWindow`), held items (`reserveItem`), the NPC menu in `chooseNpcEntry` and
  `moverMenu.ts`'s entry sets (`UPGRADE_ENTRIES`).
- Tooltip: `items/itemTooltip.ts` shows the normal sockets and cards, not PutAddedOpt nor the Ultimate icon or socket row.
- Data: the client's packs hold `Ultimate_GemAbility.txt` (stock values); no converter stage reads it. `SmeltJewel.inc` and
  `SmeltExtraction.inc` are loose files in `Client/Client/`.
- Pictures: ButtStart, WndChgElemItem, WndEditTile00, Icon_Ultimate are converted; WndDisableRed/Blue/Black.bmp and
  Window01.bmp are not.
- Missing: the two windows, their two packets, MAKEGEM's count, the NPC entries, the tooltip's jewel lines and socket row,
  the data, the phone layout.

## 9. Other ultimate windows (to plan later)

- Create Shining Oricalkum (CWndMixJewel WndField.cpp:19114-19575, APP_SMELT_MIXJEWEL 288 x 288 and its confirm 272 x 176):
  five Oricalkum and five Moonstone slots (Shift fills all), START needs all ten (TID_GAME_SUMMONANGEL_ERROR2), sends
  MAKEITEM; success opens the confirm window with Shining Oricalkum's icon. Same answer packet. Small.
- Create Unique / Ultimate Weapon (CWndChangeWeapon :20520-20950): a weapon and two jewels (or a jewel and Shining
  Oricalkum), sends TRANSWEAPON. Medium.
- Remove Jewel (CWndRemoveJewel :22458-22860, at Bobochan): the weapon and a Moonstone, sends REMOVEGEM; the server says
  TID_GAME_REMOVEGEM_SUCCESS. Medium.
- Level-up Hero Skill (CWndHeroSkillUp :21040-21330): a separate legend-skill packet. Later.

## 10. The owner's custom changes (not built)

- `Resource/Ultimate_UltimateWeapon.txt`: ULTIMATE_ENCHANT x1.6 (commit 2f3b2ed). SET_GEM and MAKE_GEM are stock.
- `Resource/Ultimate_GemAbility.txt`: the server's ability values are about 5x stock (2f3b2ed); the client's pack keeps the
  stock file, which is what Neuz's tooltip reads. FlyffWeb converts the pack's file, so its tooltip shows what the PC
  client shows.
- `PutAddedOpt` and `PutPiercingOpt` multiply by `HighRateProfile::Gear` (WndManager.cpp:4876, :5221), and
  `UltimateWeapon.cpp` uses `HighRateProfile::Chance` (:706, :787): the owner's Neuz build. Not ported (stock values shown).
