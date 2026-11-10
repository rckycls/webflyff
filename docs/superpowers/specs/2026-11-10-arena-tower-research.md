# Arena and Forsaken Tower: research (2026-11-10)

The owner asked how "Enter Arena" and "Enter Forsaken Tower" work in the V15 Neuz client, and for them in FlyffWeb. This
note says what Neuz V15 does, what the WorldServer checks, what the web pages say, and what FlyffWeb has today.

Sources are CP949: `iconv -f cp949 -t utf-8`. The text files are UTF-16 (`textClient.inc`, `textClient.txt.txt`,
`character.inc`). Paths start at the V15 folder (`Source/`, `Resource/`, `Program/`).

## 1. Is it on in the owner's build?

| Feature | Guard | Neuz | WorldServer | Server switch |
|---|---|---|---|---|
| Arena | `__JEFF_11_4` | on, `Source/Neuz/VersionCommon.h:99` | on, `Source/WORLDSERVER/VersionCommon.h:112` | `ARENA` in `Program/WorldServer.ini` (sets `EVE_ARENA`, `WorldServer.cpp:600-603`) |
| Forsaken Tower | `#if __VER >= 12 // __HEAVEN_TOWER` | `__VER 15`, `Neuz/VersionCommon.h:4` | `__VER 15`, `WORLDSERVER/VersionCommon.h:4` | none |

- The `#define __HEAVEN_TOWER` lines are commented out (`Neuz/VersionCommon.h:120`, `WORLDSERVER/VersionCommon.h:130`),
  but no code tests that name: every tower block is `#if __VER >= 12 // __HEAVEN_TOWER`. So the tower **is compiled in**.
- The other `__JEFF_11_4` lines (`Neuz/VersionCommon.h:372, 455`) are inside the `__INTERNALSERVER` / test blocks, not
  the main one.
- "Forsaken Tower" is the English name of the "Heaven Tower" (심연의 탑): `TID_MMI_HEAVEN_TOWER` 7097 = "Forsaken Tower"
  (`textClient.inc:11387`), `TID_TOOLTIP_HEAVENTOWER` 3674 = "The Forsaken Tower" (`textClient.inc:10550`).
- The custom 3v3 arena (`__BB_ARENA_3V3`, `Arena3v3*`, `PACKETTYPE_ARENA3V3_*`) is the owner's own feature: left out.

## 2. The NPCs (`Resource/character.inc`, UTF-16; `npcs.json` in the converted data)

| Key | Name (converted) | Menu | Where (`World/*.dyo`, x and z times 4) |
|---|---|---|---|
| `MaFl_Ray` (:6598-6611) | [Arena Manager] Lay | Dialog (0), Enter Arena (80) | Madrigal, three: Flaris (6932, 3259), (8438, 3616), (3802, 4448) |
| `MaFl_Harold` (:6515-6531) | [Arena Manager] Harold | Dialog (0), Leave Arena (81) | WdArena (545.5, 485.8) |
| `MaFl_HEAVENMAN` (:6951-6966) | Forsaken Tower Manager | Forsaken Tower (97) | Madrigal, Flaris (6983, 3307), next to a Lay |

- `MaFl_Ray` is made only when `EVE_ARENA` is on (`CWorld::LoadObject`, `_Common/WorldFile.cpp:1139-1145`). The owner's
  `Program/WorldServer.ini` has the `ARENA` line, so Lay stands.
- The menu ids: `MMI_ARENA_ENTER` 80, `MMI_ARENA_EXIT` 81 (`Resource/defineNeuz.h:181-182`), `MMI_HEAVEN_TOWER` 97
  (`defineNeuz.h:202`). Their texts are `TID_MMI_DIALOG + id`: "Enter Arena" 7080, "Leave Arena" 7081, "Forsaken Tower"
  7097 (`textClient.inc:10300, 10305, 11387`).
- `CWndWorld::ShowMoverMenu` (`_Interface/WndWorld.cpp:6625-6684`): one menu entry runs at once (`OnCommand( nMenu )`,
  :6687), so a press on the Tower Manager opens its window with no menu. More entries give the menu; **"Enter Arena" is
  appended only past the base job** (`!g_pPlayer->IsBaseJob()`, :6671-6676). FlyffWeb already filters it so
  (`moverMenu.ts`, `npcMenuEntries`).
- Online (gpotato fan wiki, the PvP page): "talk to the Arena Manager Lay, located in each town", Harold inside. Matches.

## 3. Arena

### 3.1 Enter and leave

- `CWndWorld::OnCommand` (`_Interface/WndWorld.cpp:5927-5934`): `MMI_ARENA_ENTER` → `g_DPlay.SendHdr( PACKETTYPE_ARENA_ENTER )`;
  `MMI_ARENA_EXIT` → `SendHdr( PACKETTYPE_ARENA_EXIT )`. A header and no fields.
- `PACKETTYPE_ARENA_ENTER` 0x70000010, `PACKETTYPE_ARENA_EXIT` 0x70000011 (`Source/_Network/MsgHdr.h:686-687`).
- `CDPSrvr::OnArenaEnter` (`WORLDSERVER/DPSrvr.cpp:9143-9154`): a base-job player is dropped without a word; anyone else
  gets `SetMarkingPos()` (where they stood) and `REPLACE` to `WI_WORLD_ARENA` (208) at (540, 140, 485). **No NPC distance
  check, no level, no cost.**
- `CDPSrvr::OnArenaExit` (:9156-9161): `REPLACE` back to the marked world and place. No check.
- No new packet comes back: the REPLACE is the ordinary world change, which FlyffWeb already handles (`readReplace`,
  `world/place.ts`).
- No message on either side.

### 3.2 The world

- `WI_WORLD_ARENA` 208 (`Resource/defineWorld.h:63`) = "WdArena" (`Resource/World.inc:21`), titled `IDS_WORLD_INC_000022`.
- `CWorld::IsArena()` is `m_dwWorldID == WI_WORLD_ARENA` (`_Common/World.h:414-415`).
- Converted: `dist/assets/worlds/wdarena` (in `worlds.json` as 208), and 208 is in `worldNoFly.json`: no flying there.
- Continent `CONT_DARKON12` for tax (`_Common/Continent.cpp:265`): no effect on the client.

### 3.3 Who can attack whom

`CMover::IsAttackAble( pObj )` (`_Common/Mover.cpp:6470-6570`), client side, for a **player** target:

1. `HasBuffByIk3( IK3_TEXT_DISGUISE )` → no (:6473-6476).
2. In `STATE_BASEMOTION_MODE` (an item casting) → its cancel and no (:6484-6494). FlyffWeb has this (`interruptCast`).
3. Only when `g_eLocal.GetState( EVE_18 )` (:6503): duel (`IsPVPTarget`), then war, then school event, then
   **`IsArenaTarget( pMover )` → yes** (:6514-6517), else PK (`IsPKAttackAble`, which also says yes for an arena target,
   :6631-6638, and otherwise needs `EVE_PK`).
4. A refusal turns the auto-attack off (:6564-6567).

`EVE_18` comes from the line `18` in `Program/WorldServer.ini` (`WorldServer.cpp:540-544`) and reaches Neuz in
`SNAPSHOTTYPE_FLYFF_EVENT` (`OnFlyffEvent`, `Neuz/DPClient.cpp:6183-6190`). The owner's ini has `18`; FlyffWeb does not
decode that snapshot, so it takes `EVE_18` as on. `EVE_PK` (`//PK` in the ini) is off: no PK anywhere.

`CMover::IsArenaTarget( pMover )` (`_Common/MoverAttack.cpp:1953-1972`): true only when **the attacker's world is the
Arena** and **both** the target and the attacker stand inside the fight circle:
- `dx = (int)( x - 490 )`, `dy = (int)( z - 507 )` (truncated toward zero; `HighRateProfile::Bounded` is only a safe
  cast, `_Common/HighRateProfile.h:14-21`);
- `dx * dx + dy * dy > 1246` → false (a radius of about 35.3).
- The entry point (540, 485) is 54.6 away and Harold 56.6: both outside, so the spot one arrives at is safe.
- Nothing about parties, guilds or levels: inside the circle anyone hits anyone ("free for all", the wiki says).

The server (`CMover::GetHitType`, `MoverAttack.cpp:1820-1870`): dead or just-revived (`m_nDead`) → fail; flying → fail;
then `IsArenaTarget` → `HITTYPE_ARENA` (:1855-1858). `GetHitType2` (good spells, :1757-1800) the same (:1786-1789).

Melee, wand and bow all go through `IsAttackAble`: `UseFocusObj` (`WndWorld.cpp:6197-6266`), the charged shot
(`WndWorld.cpp:975`), the let-go shot (`OnLButtonUp`, :6486), and `Process`'s auto-attack (:8524).

### 3.4 Skills

- Client: `CMD_SetUseSkill` (`MoverMsg.cpp:172-423`) asks `IsAttackAble` for a harmful skill on another mover. So an
  arena target is a valid target for attack skills.
- Server, harmful: in a PK-free region a harmful skill on a player is refused unless the target is a PVP / war / guild
  combat / **arena** target (`MoverSkill.cpp:349-372`, `Ctrl.cpp:1043-1067`, `TID_GMAE_PK_NOT_AREA`).
- Server, good: outside the Arena a buff on a hostile target is refused (`TID_GAME_NEVERKILLSTOP`); **in the Arena that
  check is skipped** (`MoverSkill.cpp:428-447`, `Ctrl.cpp:1104-1112`): buffs and heals work on anyone there.
- Psychic Wall hits arena targets (`CommonCtrl.cpp:255-262`).
- No skill and no item is refused because of the Arena (no `IsArena` / `WI_WORLD_ARENA` in the item code). The only
  item change is the revive window's scroll button (3.6).

### 3.5 Names and colours

No `IsArena` in `MoverRender.cpp` or the name drawing: names and colours do not change in the Arena. An arena hit is not
PK: no pink name (`HITTYPE_PK`'s `SetPKPink` is skipped for the Arena, `MoverAttack.cpp:1708-1712`), no karma, no
propensity loss (`AttackArbiter.cpp:798-813`), no PK penya drop (`Mover.cpp:5668-5672`).

### 3.6 Dying and coming back

- Neuz (`CDPClient::OnMoverDeath`, `Neuz/DPClient.cpp:2045-2052`): the own death in the Arena prints
  `TID_GAME_DEATH_ARENA` "Please press ESC and resurrect." (colour 0xff00ffff, `textClient.inc:10565`) in place of
  `TID_GAME_DEATH`. The revive window opens as everywhere (:2060-2072).
- The revive window (`CWndRevival::OnInitialUpdate` / `OnDraw`, `_Interface/WndField.cpp:12161-12200`): in the Arena
  **"Revive here" (the resurrection scroll) is always greyed**. Lodestar stays.
- Server (`CDPSrvr::OnRevivalLodestar`, `DPSrvr.cpp:11390-11400`): a chaotic player is not sent to a chaotic revival
  point in the Arena; otherwise the world's revival point.
- Experience: a player killed by a player loses none (`m_bLastPK = TRUE` unless `EVE_PKCOST` and not the Arena,
  `Mover.cpp:5150-5166`; `PKCOST` is off in the owner's ini anyway).
- Online: "kill and be killed without any penalty". Matches.

### 3.7 What FlyffWeb has today

- "Enter Arena" greyed (`moverMenu.ts`, `npcMenuEntries`'s `enabled`); "Leave Arena" greyed too.
- `attackAble` refuses every player (`combat/attackLoop.ts:112-115`). The skill use (`skills/skillUse.ts:560`) asks the
  attack loop's `isAttackAble`. The attack button asks `canAttackFocus`.
- A press on another player goes to the attack loop (select, then a second press turns the auto-attack on); on a phone
  the second tap opens the player menu, so the phone attacks with the Attack button.

## 4. Forsaken Tower

### 4.1 The window (`CWndHeavenTower`, `_Interface/WndField.cpp:21592-21830`; `WndField.h:2172-2215`)

- Opened by `MMI_HEAVEN_TOWER` (`WndWorld.cpp:5115-5129`): if `APP_HEAVEN_TOWER` is open already,
  `TID_GAME_WND_OVERLAPED` and nothing; else a new window.
- Layout: `APP_HEAVEN_TOWER` 734 (`Resource/ResData.h:639`), `Resource/resdata.inc:20907-20953`: "WndTile00.tga"
  tiled, 304 x 416, title `IDS_RESDATA_INC_005710` "Enter Forsaken Tower" (`resData.txt.txt:5711`):
  - `WIDC_TEXT1` "WndEditTile00.tga" (14, 12)-(288, 112): the description, `TID_TOOLTIP_HEAVENTOWER` (one page);
  - `WIDC_BUTTON1` "wndButtEnter.bmp" (252, 84)-(276, 108): next page, hidden with one page (:21670-21675);
  - `WIDC_LISTBOX1` "WndEditTile00.tga" (14, 116)-(282, 364): the floors;
  - `WIDC_CUSTOM2` (14, 120)-(277, 134): the red bar `ARGB(60, 240, 0, 0)` over the chosen line (`OnDraw`, :21624-21640).
- `InitWnd` (:21778-21829): the list as tall as its lines (`m_nGap` = font height + 2, 7 lines + 10), the window as tall
  as the list + the text + 60; everything 80 px wider "for English".
- The seven lines (`InitText`, :21642-21695), `"%d. %s"`:

| # | Text (`textClient.inc:11207-11237`) | Confirm text (`:11242-11267`) | Cost (`m_nCost`) |
|---|---|---|---|
| 1 | Enter Floor B1. (Monster Level 62-72) | You need to pay %d penya to enter floor B1. | 10000 |
| 2 | Enter Floor B2. (Monster Level 74-84) | ... B2. | 30000 |
| 3 | Enter Floor B3. (Monster Level 86-96) | ... B3. | 50000 |
| 4 | Enter Floor B4. (Monster Level 98-108) | ... B4. | 70000 |
| 5 | Enter Floor B5. (Monster Level 110-120) | ... B5. | 100000 |
| 6 | Enter Floor B6. (Secret Room) | You cannot enter a private area. | none |
| 7 | Do not Enter. | (closes the window) | |

- A click on a line (`OnChildNotify` `WIDC_LISTBOX1`, :21720-21776): line 7 closes the window; lines 1-6 open
  `CWndHeavenTowerEntranceConfirm` (an OK / Cancel message box, `MB_OKCANCEL`, :21835-21839) with the confirm text (lines
  1-5 with the cost in it).
- OK (`:21847-21862`): for floors 1-5 `SendTeleportToHeavenTower( floor )` and the tower window closes; floor 6 sends
  nothing. Either way the box closes. Cancel closes the box.
- There is **no level limit and no client-side penya check**: the levels are only in the text.
- The GM command `/HeavenTower` opens the same window (`FuncTextCmd.cpp:4348-4362`, admin only).

### 4.2 The packet

- `CDPClient::SendTeleportToHeavenTower( int nFloor )` (`Neuz/DPClient.cpp:17828-17835`): `PACKETTYPE_HEAVENTOWER_TELEPORT`
  0x70001008 (`_Network/MsgHdr.h:713`), then `nFloor` as an `int`.
- `CDPSrvr::OnTeleportToHeavenTower` (`WORLDSERVER/DPSrvr.cpp:9509-9575`):
  - not near the tower NPC (`CNpcChecker::IsCloseNpc( MMI_HEAVEN_TOWER, ... )`) → dropped, no word;
  - floor not 1-5 → `Error` log, dropped;
  - not enough penya → `TID_GAME_LACKMONEY` (a DEFINEDTEXT the client already prints);
  - else `REPLACE` to the floor, the penya taken, the angle set, the tax added, a penya log.

| Floor | World (`defineWorld.h:11-15`, `World.inc:46-50`) | Arrives at | Angle |
|---|---|---|---|
| 1 | `WI_WORLD_HEAVEN01` 21 "WdHeaven01" | (253, 102, 78) | 183 |
| 2 | `WI_WORLD_HEAVEN02` 22 "WdHeaven02" | (251, 102, 95) | 183 |
| 3 | `WI_WORLD_HEAVEN03` 23 "WdHeaven03" | (264, 102, 227) | 183 |
| 4 | `WI_WORLD_HEAVEN04` 24 "WdHeaven04" | (253, 102, 86) | 174 |
| 5 | `WI_WORLD_HEAVEN05` 25 "WdHeaven05" | (218, 102, 101) | 176 |

- All five are converted (`dist/assets/worlds/wdheaven01..05`, in `worlds.json` as 21-25) and are no-fly worlds.
- Floor 6 ("WdHeaven06", the Secret Room, `WI_DUNGEON_SECRET_*`, `World.inc:28-31`) belongs to the guild Secret Room
  system: not entered from here.
- Online (gpotato wiki "Forsaken Tower", V12 notes): five floors, the same costs and monster levels; the manager in
  Flaris; the entry fees feed the lord's tax. Matches the code.

### 4.3 What FlyffWeb has today

- `MaFl_HEAVENMAN`'s one entry, 97, is greyed in its menu (a sole entry the browser cannot open shows its menu,
  `soleEntry`).
- The pictures `wndbuttenter` and `wndedittile00` are converted already (`dist/assets/ui`). No new picture or world is
  needed for either feature.

## 5. Plan for FlyffWeb

1. Protocol: `encodeArenaEnter`, `encodeArenaExit`, `encodeHeavenTowerTeleport( floor )` and their decode cases.
2. Menu: Enter Arena (80), Leave Arena (81) and Forsaken Tower (97) enabled.
3. `isArenaTarget` / `attackAble`: a player target is attackable only when the own world is 208 and both stand inside the
   circle (and the player is not dead: Neuz lets the swing go and the server drops it, `GetHitType`'s `IsDie`; the
   browser refuses at once). Everywhere else players stay unattackable, as today.
4. The death line `TID_GAME_DEATH_ARENA` and the revive window's greyed scroll button in the Arena.
5. The Forsaken Tower window and its OK / Cancel box, on the PC and on the phone.
6. No server or gateway change is needed.
