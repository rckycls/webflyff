# Piece 7 M3 research: Blinkwings and the Scroll of Return

This research note backs `docs/superpowers/plans/2026-11-04-piece7-m3-blinkwings-scrolls.md`, and argues from the
Piece 7 spec, §3.4.

- C++ paths are relative to `Blouflash VS22 V15/Source/`. Data paths are relative to `Blouflash VS22 V15/`.
- English text comes from `Resource/*.txt.txt`.
- `__VER` is 15 (`Neuz/VersionCommon.h:3-4`, `WORLDSERVER/VersionCommon.h:3-4`).
- The owner's custom code next to these paths is left out: `__BB_ARENA_3V3` in `CUser::OnDoUseItem`, and
  `HighRateProfile::RestrictedScroll` in shop generation. Neither touches these items.

## 1. The items

Kinds (`Resource/defineItemkind.h`):
- IK1_SYSTEM 5 (`:14`), IK1_CHARGED 6 (`:15`).
- IK2_SYSTEM 19 (`:37`), IK2_BLINKWING 22 (`:40`).
- IK3_BLINKWING 45 (`:120`), IK3_TOWNBLINKWING 47 (`:122`), IK3_SCROLL 50 (`:129`).

World ids (`Resource/defineWorld.h`): MADRIGAL 1, KEBARAS 2, GUILDWAR 202, DUNGEON_VOLCANE 203, MINIROOM 209.

The propItem columns that matter (`_Common/ProjectCmn.cpp:371-375,413,478-480`):
- `dwSkillReadyType`: the cast time in ms.
- `dwSfxObj`: the ready effect.
- `dwLimitLevel1`: the level limit.
- `dwWeaponType`: the destination world.
- `dwItemAtkOrder1-4`: the destination x, y, z and angle.
- `szTextFileName`: the chaotic revival key.

From `Resource/propItem.txt`:

| Define | Id | English | IK3 | Level | Cast | Destination | Chaotic key |
|---|---|---|---|---|---|---|---|
| II_SYS_BLI_BLI_FLARIS | 4803 | Blinkwing of Flaris | BLINKWING | | 10000 | 1 (7161, 100, 3264), 143° | flaris |
| II_SYS_BLI_BLI_SAINTMORNING | 4804 | Blinkwing of Saint Morning | BLINKWING | | 10000 | 1 (8321, 100, 3720), 207° | saintmorning |
| II_SYS_BLI_TWO_TOWNBLINKWING | 4805 | Town Blinkwing | TOWNBLINKWING | | 10000 | revival point | |
| II_SYS_BLI_BLI_DARKON | 4806 | Blinkwing of Darkon | BLINKWING | 15 | 10000 | 1 (3896, 59, 4378), 67° | darkon |
| II_SYS_BLI_BLI_DARKON1 / 3, DK_DUNGEON, MAS_DUNGEON | 4807-4810 | Darkon 1 / 3, Dekane, Mars | BLINKWING | | 10000 | Madrigal spots | "" |
| II_SYS_BLI_BLI_VOLCANE | 4811 | Blinkwing of Volcan | BLINKWING | | 10000 | **203** (1394, 150, 544) | volcane |
| II_SYS_BLI_BLI_HARMONIN | 4812 | Blinkwing of Shaduwar | BLINKWING | | 10000 | 1 (5936, 100, 5421) | harmonin |
| II_CHR_SYS_SCR_ESCAPEBLINKWING | 10435 | Return | TOWNBLINKWING (IK1_CHARGED) | | 300000 | revival point, forced | |
| II_SYS_SYS_SCR_RETURN | 10469 | Scroll of Return | SCROLL (IK2_SYSTEM) | | 4000 | the village chosen | |

Effects:
- Every Blinkwing has `dwSfxObj` = XI_BLINKWING_READY (118, `sfx_blinkwingdelay`, `Resource/mdlDyna.inc:933`, no sound). The
  converter already writes it (`effects/sfx_blinkwingdelay.json`).
- The Scroll has no ready effect. Its `dwSfxObj3` is XI_SYS_EXPAN01 (107), and its `dwSkillTime` is 14 400 000 ms (its
  4-hour buff).

Shops:
- Flaris' magic shop **Marche** (`MaFl_Marche`, `Resource/character.inc:425`) sells them on its third tab (`:433-434`):
  the Blinkwings of Flaris, Saint Morning and Darkon, and the Town Blinkwing.
- No NPC sells the Scroll of Return; it is a cash item.

The browser's catalog already has `kind1-3` and `weaponType` (= the destination world). It drops `dwSkillReadyType`,
`dwSfxObj` and `dwLimitLevel1`: `packages/formats/src/inc/propItem.ts` reads them, but `KEPT` and `buildItemProps` leave
them out.

## 2. The use path and the client's refusals

**The inventory double-click** is `CWndInventory::OnChildNotify` (`_Interface/WndField.cpp:2102-2642`). Before sending it
refuses, in this order:
1. Refining or an equip-bind confirm under way. The browser has neither.
2. A shop, bank or trade window open: TID_GAME_TRADELIMITUSING (`:2541-2547`).
3. Minigame, smelt and repair windows. The browser has none.

**The task bar** (`_Interface/WndManager.cpp:2724-2778`) checks no windows: a private shop of one's own returns
silently, then it sends.

Both paths end in `CDPClient::SendDoUseItem` (`Neuz/DPClient.cpp:10254-10870`). For these items it checks, in order:

1. **Dead:** silent (`:10256-10261`).
2. **`IsUseItemReadyTime`** (`_Common/Mover.cpp:2768-2828`), for any item with `dwSkillReadyType`:
   - one's own private shop open: silent;
   - already casting (STATE_BASEMOTION_MODE): TID_PK_BLINK_LIMIT;
   - not standing (`GetMoveState() != OBJSTA_STAND`): TID_PK_STAND_LIMIT;
   - flying: TID_PK_FLIGHT_NOUSE.
3. **A Blinkwing (IK2_BLINKWING) in KEBARAS:** TID_PK_BLINK_NO with the world's title, "Azria" (`Resource/World.inc:105-108`)
   (`:10392-10398`).
4. **A Blinkwing in GUILDWAR:** `OpenMessageBoxUpper(TID_GAME_GUILDCOMBAT_NO_OUTWAR)`, a modal OK box (`:10400-10404`).
5. **A Blinkwing in MINIROOM:** TID_PK_BLINK_NO with "House" (`World.inc:301-304`) (`:10406-10414`).
6. **The Scroll of Return, with `bResult` TRUE:** the buff already on gives TID_GAME_LIMITED_USE. A message box already
   open does nothing. Otherwise `m_dwReturnScroll = dwItemId` and the box opens (§5). Nothing is sent
   (`:10416-10431`).
7. **Send.**

There is **no client level check**; the server makes it (§4).

**The packet** is `PACKETTYPE_DOUSEITEM` 0x00ff0021 (`_Network/MsgHdr.h:149`):
- `u32 MAKELONG(ITYPE_ITEM 0, objId)`;
- `u32 focus id or NULL_ID`;
- `i32 nPart` (-1);
- under `__HACK_1023`, `f32 fFlightSpeed` (-1.0 here).

The server reads the float only for a ride item (`WORLDSERVER/DPSrvr.cpp:12848-12867`). The browser's `encodeUseItem`
(`packages/protocol/src/world/items.ts:56-60`) leaves it out, and that is fine for these items.

## 3. The cast

**The server starts it.** `CMover::IsItemRedyTime` (`_Common/Mover.cpp:8582-8627`), from `DoUseItem` (`MoverSkill.cpp:1332`):
- already casting: TID_PK_BLINK_LIMIT;
- sitting, for a Blinkwing: TID_GAME_NOTSIT_BLINK;
- otherwise it sets `m_nReadyTime` and `m_dwUseItemId` and turns `STATE_BASEMOTION_MODE` (4) on. Nothing is used yet.

When the time is up, `CUser::Process` (`WORLDSERVER/User.cpp:393-421`) runs `DoUseItem` again. That sets the mode OFF and
uses the item. The server never cancels a cast because the player moved.

**`SNAPSHOTTYPE_STATEMODE` 0x00df** (`User.cpp:5171-5209`) goes to everyone in view, the caster included:
- `u32 m_dwStateMode`;
- `u8 flag` (0 ON, 1 OFF, 2 CANCEL; `_Common/authorization.h:150-156`);
- when ON only, `u32` the item's **prop id**.

**The client** (`Neuz/DPClient.cpp:12381-12440`):
- On ON it creates the ready effect at the caster (`CreateItemReadySfx(prop->dwSfxObj)`) and sets `m_dwStateMode`.
- For the own player:
  - ON: `m_dwUseItemId = prop id`, `m_nReadyTime = now`, and a cancel is sent at once if not standing;
  - OFF or CANCEL: `m_nReadyTime = 0`.
- No chat line for any flag.

**A mover coming into view mid-cast.** ADD_OBJ carries `m_dwStateMode`, then the cast item's prop id (or 0)
(`_Common/ObjSerializeOpt.cpp:155-163`). The client makes the ready effect when the mode has BASEMOTION and the id is
not 0 (`DPClient.cpp:1380-1391`). The browser reads `stateMode` (`addObj.ts:118`) and drops the id (`:119`).

**There is no casting motion.** The items' `dwUseMotion` is "=". While in the mode, the stand state loops `MTI_STAND`
and skips the idle motions (`_AIInterface/ActionMoverState.cpp:69-84`). The browser plays no idles, so the stand pose
is already right.

**The ready effect is `CSfxReady`** (`_Common/Sfx.cpp:3826-3837`). It plays at the caster and follows it, and deletes
itself when the caster leaves the mode or is gone.

**The gauge** is `CMover::RenderCasting` (`_Common/MoverRender.cpp:1982-2043`). It draws for the own player only, while
it is in the mode with `m_nReadyTime != 0`, called from `WndWorld.cpp:1040`:
- **Position:** the top of the model's box is projected to the screen and raised 48 px; the 80 px gauge is centred
  there, its rect from `x - 42` to `y - 5`.
- **Background:** `GauAccelBG.TGA`, `RenderScal(p, 200, 0.8, 0.55)`.
- **Fill:** `GauAccelInner.TGA` at `p`, alpha 255, the same scale, `nWidth` wide, where
  `nWidth = GauPartyHp.TGA width × elapsed / dwSkillReadyType`, clamped to 0..112. The textures are
  `Neuz/Neuz.cpp:1619-1625`.

**The cancel** is `PACKETTYPE_STATEMODE` 0xffffff7a: `u32 4`, `u8 2` (`SendStateModeCancel`, `DPClient.cpp:9736-9742`).
The client sends it while the own player is in the mode, on:
- a forward or back key, not a turn (`_Interface/WndWorldControlPlayer.cpp:422-433`);
- a jump (`:487-505`);
- a tap on the ground (`:341`);
- a skill command, which is then refused (`_Common/MoverMsg.cpp:196-202`);
- an attack, which `IsAttackAble` then refuses (`Mover.cpp:6484-6494`);
- a hit on the own player, or the own player's attack landing (`DPClient.cpp:1843-1846`);
- STATEMODE ON arriving while not standing (`:12419-12422`).

The server accepts it only during the cast and answers STATEMODE CANCEL (`DPSrvr.cpp:4599-4620`). It also ends a cast
with OFF on death (`Mover.cpp:5187-5194`), and with CANCEL when an attack starts.

## 4. The server

**Refusals before the cast** (`CUser::OnDoUseItem`, `User.cpp:2961-3052`, and `CMover::DoUseItem`, `MoverSkill.cpp:1275-1332`):
- an unequipped item during a trade: TID_GAME_TRADELIMITUSING;
- an expired item: TID_GAME_ITEM_EXPIRED;
- a guild-war spectator: TID_GAME_GUILDCOMBAT_STANDS_NOTUSEITEM (as SNAPSHOTTYPE_TEXT).

**After the cast**, `DoUseItemBlinkWing` (`MoverSkill.cpp:1732-1876`) checks, in order:
1. sitting, still in the mode, Kebaras (`bUse`), guild war: silent;
2. 1:1 guild war: TID_GAME_GUILDCOMBAT1TO1_NOBLINKWING;
3. Secret Room: TID_GAME_SECRETROOM_USEBRINKITEM;
4. Rainbow Race: TID_GAME_RAINBOWRACE_NOTELEPORT;
5. miniroom: silent;
6. **level:** `dwLimitLevel1 > level` gives `DEFINEDTEXT TID_GAME_USINGNOTLEVEL` ("Your level is too low."). So a
   level-14 Darkon Blinkwing casts its 10 s first, then is refused, and is not used.

**The Town Blinkwing** (`:1790-1834`) uses the item (UPDATE_ITEM), then picks a revival point:
- **A normal player:** the world's `revival` key from its `.wld` (`_Common/WorldFile.cpp:74-79`) if it names another
  world. Failing that, `GetNearRevivalPos` (`WorldMng.cpp:627-662`): a revival region containing the player, else the
  nearest non-chaotic point.
- **A chaotic player** (`m_dwPKPropensity > 0`): the chaotic point.
- The Escape Blinkwing uses REPLACE_FORCE, which only skips the flying refusal (`Mover.cpp:2224-2228`).

The Madrigal revival points (`Resource/World/WdMadrigal/WdMadrigal.rgn`):

| Key | Kind | Position |
|---|---|---|
| flaris | normal | (6968.38, 100, 3328.86) |
| flaris | chaotic | (6590.05, 100, 3811.88) |
| saintmorning | normal | (8470.58, 100, 3635.79) |
| darkon | normal | (3808.40, 59, 4455.15) |
| harmonin | normal | (5946.72, 100.39, 5406.16) |

**A place Blinkwing** (`:1835-1873`) uses the item, then goes to the prop's world and position. A chaotic player goes
to the chaotic point of its key.

**The move** (`CWorld::_replace`, `_Common/World.cpp:1565-1681`):
- **Same world:** `SNAPSHOTTYPE_SETPOS` 0x0010 (three floats) to all in view. The angle is not sent.
- **Another world:** `SNAPSHOTTYPE_REPLACE` 0x00f2 (`u32 world`, three floats), then the own ADD_OBJ in the new world.

**The use** is `SNAPSHOTTYPE_UPDATE_ITEM` 0x0018: `i8 type 0`, `u8 objId`, `i8 UI_NUM 0`, `u32 count` (≤ 0 removes),
`u32 time 0` (`User.cpp:1136-1150`).

**The order for a Blinkwing** (from reading, not observed):
1. STATEMODE ON;
2. 10 s;
3. STATEMODE OFF;
4. UPDATE_ITEM;
5. SETPOS or REPLACE.

## 5. The Scroll of Return

1. **The first box.** The use opens `CReturnScrollMsgBox` (`_Interface/WndSelectVillage.cpp:17-45`): APP_MESSAGEBOX,
   MB_OKCANCEL, with TID_GAME_RETURN_USEITEM. OK opens the village window and closes the box; Cancel only closes it.
   - `CWndMessageBox` lays out (`_Interface/WndMessageBox.cpp:65-128`):
     - the text at (10,10) to the client's width − 10 and height − 35;
     - buttons of 60×25 sized to their texture, at y = client height − 30;
     - OK at the centre − 70 and Cancel at the centre + 10 (MB_OKCANCEL), or one button at the centre − 30 (MB_OK).
   - The browser's `LogOutBox` (`hud/logOutBox.ts`) already copies this layout.
2. **The village window** is `CWndSelectVillage`, APP_COMM_SELECTVIL 499 (`Resource/resdata.inc:24294-24356`;
   `resData.txt.txt:3141-3149`):
   - `WndTile00.tga` tiled, 176×144, titled "Choose the Village to Return", centred;
   - a static at (10,8)-(160,26): "Choose the Village";
   - radios in `ButtRadio.bmp`: Flaris (8,28)-(104,44), "Sain City" (8,46)-(104,62), "Darken City" (8,64)-(104,80).
     Flaris is checked by default (`:75-83`);
   - OK (8,82)-(80,102) and Cancel (84,82)-(156,102).
   - OK sends `SendReturnScroll(i)` for the checked radio (0 flaris, 1 saintmorning, 2 darkon) and closes. Cancel only
     closes (`:112-132`).
3. **`PACKETTYPE_RETURNSCROLL`** 0xf000d010: `i32 select`, from −1 to 2 (`DPClient.cpp:15776-15781`).
4. **The server** (`DPSrvr.cpp:4938-4961`) stores the village and answers **`SNAPSHOTTYPE_RETURNSCORLL` 0x00ad**, with no
   body (`User.cpp:6636-6645`).
5. **The ack** (`DPClient.cpp:677`, `:15784-15787`) runs `SendDoUseItem(m_dwReturnScroll, NULL_ID, -1, FALSE)`. FALSE
   skips the box; the other checks of §2 run again.
6. **The cast** is 4000 ms (§3), with no ready effect.
7. **The use** (`DoUseItemSystem`, `MoverSkill.cpp:2615-2662`):
   - **Refused in a limited zone:** the buff already on gives TID_GAME_LIMITED_USE. Guild war, Kebaras, a guild quest
     region or 1:1 give TID_GAME_LIMITZONE_USE, and the scroll is still used.
   - **Otherwise:**
     - the current place is stored (`SetReturnPos`);
     - the buff BUFF_ITEM 10469 for 4 h is sent as SETSKILLSTATE;
     - the server moves the player to the village's revival point in the **current** world, by SETPOS or REPLACE;
     - CREATESFXOBJ XI_SYS_EXPAN01 at the player;
     - UPDATE_ITEM.
8. **Going back.** A double-click on the buff's icon (`WndWorld.cpp:7265-7266`) sends `SendReturnScroll(-1)`. The server
   checks the buff, casts 4 s, removes the buff (REMOVESKILLINFULENCE), and moves the player back to the stored place.

## 6. Packets

| Direction | Name | Id | Body |
|---|---|---|---|
| C→S | DOUSEITEM | 0x00ff0021 | `u32 id<<16, u32 target, i32 part` (exists, no constant) |
| C→S | STATEMODE (cancel) | 0xffffff7a | `u32 mode 4, u8 flag 2` |
| C→S | RETURNSCROLL | 0xf000d010 | `i32 select` |
| S→C | STATEMODE | 0x00df | `u32 mode, u8 flag, [u32 propId if flag 0]` |
| S→C | RETURNSCORLL | 0x00ad | none |
| S→C | SETPOS / REPLACE / UPDATE_ITEM / SETSKILLSTATE / REMOVESKILLINFULENCE / DEFINEDTEXT(1) / CREATESFXOBJ | existing | read today |

## 7. Messages

| TID | Id | English | Color |
|---|---|---|---|
| TID_PK_BLINK_LIMIT | 2484 | You cannot use it during skill motion. | white |
| TID_PK_STAND_LIMIT | 2485 | You can use it when you stand up. | white |
| TID_PK_FLIGHT_NOUSE | 2498 | Unable to use while flying. | white |
| TID_PK_BLINK_NO | 2497 | You cannot use a blinkwing at %s. | white |
| TID_GAME_GUILDCOMBAT_NO_OUTWAR | 3017 | You cannot use Blinkwings to escape the Guild Siege arena. | 0xff0000ff |
| TID_GAME_LIMITED_USE | 2096 | You are already using this item. Try again after its effects have worn off. | red |
| TID_GAME_TRADELIMITUSING | 637 | You cannot use items while trading. | red |
| TID_GAME_RETURN_USEITEM | 2657 | The item loses its potency 4 hours after being equipped if not returned to the inventory . Do you want to use the item? | — |
| TID_GAME_USINGNOTLEVEL | 1151 | Your level is too low. (server) | — |
| TID_GAME_NOTSIT_BLINK | 3318 | You cannot use a Blinkwing while sitting. (server) | — |
| TID_GAME_LIMITZONE_USE | 2664 | Unable to use item in the limit zone. (server) | — |

All are in the converted `data/texts.json`. The world titles "Azria" and "House", and the village window's labels, are
not TIDs, so they are hard-coded with their source, as `reviveWindow`'s title is.

## 8. Today's web client

- **`ItemUse.use`** (`apps/client/src/world/items/itemUse.ts:18`) sends only food, refreshers and potions (IK2 14, 11,
  12). Any other item returns false with no message.
- **The phone's Use button** shows only for those kinds (`hud/inventoryWindow.ts:245`).
- **The task bar** reaches the same `itemUse.use` (`WorldScreen.ts:873-874`).
- **Another world** (REPLACE) runs teardown, "Entering the world…" and re-entry. A world with no converted map ends the
  session with "This map isn't available in the browser yet." (`WorldScreen.ts:502-524`). Every Blinkwing destination
  (worlds 1 and 203) is converted.
- **The same world** (SETPOS): `WorldState.setPos`, `views.snap`, then `backCamera.relocate()`, which eases the camera
  over 0.5 s (`backCamera.ts:41-72`).
- **Effects** loop for `seconds` or play once (`fx/EffectManager.ts:175-178,281-286`). There is no "while the caster
  is casting".
- **Buffs:** M2's `MoverBuffs` keeps every buff type (`buffs.ts`), and REMOVESKILLINFULENCE is read.
  `BuffStatus` (`hud/buffStatus.ts`) draws only BUFF_SKILL. The own ADD_OBJ's buffs are not read (M2 Decision 9).
- **Modals:** `LogOutBox` (message box), `ModalBackdrop`, `WindowFrame`, `pictureButton`. `THEME_FILES` lacks
  `GauAccelBG.TGA`, `GauAccelInner.TGA` and `ButtRadio.bmp` (`tools/convert/src/ui/uiStage.ts:71-192`).
- **The cancel hook:** `WorldScreen.step` (`:1405-1407`), where `movesOrTurns(intent) || jump || tap` cancels the item
  actions.
- **The testkit:** `newVagrantOwn()` already holds 5 Town Blinkwings at object id 2 (`packages/testkit/src/newVagrant.ts`).
  There is no `writeUpdateItem`; the specs write raw `{objectId, type: 0x18, fields}`.

## 9. Corrections to the spec

- **§2's line references:**
  - the refusals are at `DPClient.cpp:10392-10414`;
  - the Scroll's branch at `:10416-10431`;
  - `SendReturnScroll` at `:15776-15781`;
  - the RETURNSCORLL dispatch at `:677`.
- **§3.4's "Neuz's casting motion"** is the standing pose with the ready effect and the gauge (§3); there is no motion.
- **§3.4's "The level limit … show Neuz's messages":** the level check is the server's, after the cast.
