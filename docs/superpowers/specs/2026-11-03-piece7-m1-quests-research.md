# Piece 7 M1 research — quests

**Date:** 2026-11-03. **For:** `2026-11-03-piece7-design.md` §3.2 and the plan `plans/2026-11-03-piece7-m1-quests.md`.
C++ paths are relative to `Blouflash VS22 V15/Source/`, data paths to `Resource/`, FlyffWeb paths to the repository.
V15 flags in effect (`Neuz/VersionCommon.h`):
- on: `__IMPROVE_QUEST_INTERFACE` (:201), `__IMPROVE_MAP_SYSTEM` (:390);
- compiled in: the `__VER >= 13` quest-helper code;
- off: `__BS_PUTNAME_QUESTARROW`, `__Y_INTERFACE_VER3`, `__INTERNALSERVER`.

The M0 note (`2026-11-03-piece7-m0-dialogue-research.md`) covers the dialogue's quest lists and the QUEST_BEGIN / QUEST_BEGIN_YES /
QUEST_END_COMPLETE / QUEST_NEXT_LEVEL keys.

## 1. Quest data

**Files**
- `Masquerade.prj:116-123` (loaded by `Project.cpp:472-476`) lists five quest files: `propQuest.inc`, `propQuest-RequestBox.inc`, `propQuest-Scenario.inc`, `propQuest-RequestBox2.inc`, `propQuest-DungeonandPK.inc`.
  - Their string tables are at `:22-26`. All of them are UTF-16LE, packed in `Client/dataSub1.res`.
  - `definequest.h` is in `data.res`.
  - FlyffWeb's `loadDefines` and `loadStrings` already read `definequest.h` and the five string tables.
- `propPartyQuest.inc` and `propGuildQuest.inc` are loaded only by the world server (`Project.cpp:571-574`). They are left out.
- `QuestDestination.txt.txt` and `PatrolDestination.txt.txt` are read only by the client (`Project.cpp:741-744`, `:5509-5560`), but **neither is in the client's packs or folder**. Only `Resource/` has them, so on this client Neuz's maps of them are empty.

**`QuestProp`** (`_Common/Project.h:100-263`, filled at `Project.cpp:1368-2517`). These are the fields the client uses:
- **Identity**
  - `m_wId`; `m_szTitle` (`SetTitle`).
  - `m_nHeadQuest` (`SetHeadQuest`): the parent folder. 1800-1999 are remapped to the kinds 6000-6003 (`:2329-2364`).
  - Folder nodes are title-only props: 1992-1997 and 6000-6060.
  - `m_bNoRemove` = `!SetRemove(n)`; `m_bRepeat` (a repeatable quest never joins the completed list, `MoverParam.cpp:3557-3558`).
- **Who gives it and where**
  - `SetCharacter("key")`: the giver.
  - `SetEndCondCharacter("key", x, z, text)`: the hand-in NPC, plus a goal.
- **Begin conditions:** `SetBeginCondLevel(min, max)`, `SetBeginCondJob(...)`, `SetBeginCondPreviousQuest`, and others.
- **End conditions**
  - `SetEndCondLimitTime` (minutes).
  - `SetEndCondKillNPC(slot, MI_x, n[, x, z, text])`: 2 slots.
  - `SetEndCondItem(sex, type, jobOrItem, II_x, n[, x, z, text])`.
  - `SetEndCondOneItem`.
  - `SetEndCondPatrolZone(world, l, t, r, b[, PATROL_DESTINATION_ID, x, z, text])`, with `SetPatrolZoneName`.
  - `SetEndCondDialog("npc", "key"[, x, z, text])`.
  - Skill, gold, level, EXP percent, disguise, `m_nEndCondState`, completed quests, party, guild, pet, TSP.
- **Goal data:** `QuestGoalData{index, X, Z, textId}` (`Project.h:71-79`). The index comes from one counter shared by all files (`Project.cpp:1378`).
  - A goal of (-1, -1) has no position (for example `VOCMER_TRN1`'s item).
- **Rewards:** items (`SetEndRewardItem`), gold min-max, EXP min-max, skill points, PK, teleport, TSP, `m_bEndRewardHide` ("????").
- **Texts**
  - `state N { SetDesc( IDS ) }` gives `m_questState[N].m_szDesc`.
  - `SetDialog` is kept only by the world server (`Project.h:259-261`).
  - `QuestItem(MI, II, prob, n)` is the server's drop table.

**Examples**
- `QUEST_VOCMER_BFTRN` (151), `propQuest.inc:6322-6435`:
  - "The Path of the Mercenary", giver and hand-in `MaFl_Mustang` at (7153, 3244).
  - Level 15 only, `JOB_VAGRANT`.
  - Kill 10 `MI_AIBATT1` with a goal at (7128, 3333).
  - Reward 1500 penya; head 6051 ("1st Job Change") under 6001 ("General").
  - Its state 0 text: "Slay 10 Small Aibatts …".
- The chain continues: TRN1 at `:6437`, TRN2 at `:6545`, TRN3 at `:6648` (40 skill points, 4 items).
- `QUEST_FIND_REDBANGT` (83), `:7553-7644`: Luda, levels 30-60, the four first jobs, end item `II_SYS_SYS_QUE_REDBANGHEAD` ×1, head 6004 ("Flaris").

## 2. The own quest state

**`QUEST`** (`_Common/Mover.h:261-279`), 12 bytes raw in both directions:

| offset | field | meaning |
|---|---|---|
| 0 | u8 `m_nState` | 0 begin … 14 `QS_END` |
| 2 | u16 `m_wTime` | minutes left; bit 15 is set once every condition is met (`Mover.cpp:9646`), so show `& 0x7fff` |
| 4 | u16 `m_wId` | |
| 6, 8 | u16 `m_nKillNPCNum[2]` | |
| 10 | bits | bit 0 `m_bPatrol`, bit 1 `m_bDialog` |

Offsets 1 and 11 are padding.

**ADD_OBJ for the own player** (`_Common/ObjSerializeOpt.cpp:198-227` writes it, `:509-549` reads it). After `m_vMarkingPos` come:
- `u8 n` + `QUEST[n]`;
- `u8 n` + `u16[n]` completed;
- `u8 n` + `u16[n]` checked;
- then `m_idMurderer`.

The limits are `MAX_QUEST` 100, `MAX_COMPLETE_QUEST` 300 (the count is still a BYTE) and `MAX_CHECKED_QUEST` 5 (`ProjectCmn.h:23-26`).

**Snapshots** (Neuz handlers in `Neuz/DPClient.cpp`, ids in `_Network/MsgHdr.h`):

| Snapshot | Fields | Neuz |
|---|---|---|
| SETQUEST 0x00b0 | `QUEST` (12 bytes) | `OnSetQuest` `:8444-8573` |
| REMOVEQUEST 0x003a | `i32 type, u32 questId` | `OnRemoveQuest` `:14633-14684` |
| QUEST_TEXT_TIME 0x00ba | `i32 flag, i32 state, u32 ms` | party quests only; drawn only under `__INTERNALSERVER` (off) |
| QUESTHELPER_NPCPOS 0x9400 | `f32 x, y, z` | only as an answer to a request V15 never sends |
| QUEST_CHECKED 0x8820 | `u8 n, u16[n]` | replaces the checked list (`:19245-19250`) |

**`OnSetQuest`, for a quest it knows that has not ended:** it compares the old copy with the new one and prints:
- time changed: `TID_QUEST_LIMIT_TIME`. At 0 it prints `TID_QUEST_LIMIT_TIMEOUT` and `TID_QUEST_FAILURE`, then sends `SendRemoveQuest` itself.
- patrol changed: `TID_QUEST_PATROL` (zone name).
- a kill count changed: `TID_QUEST_KILL_NPC` (name, count, need).
- dialogue changed: `TID_QUEST_DIALOG`.

Then `SetQuest`.

**A new quest or a quest reaching `QS_END`:** `SetQuest`.
- State 1 prints `TID_EVE_STARTJOB1`, and `QS_END` prints `TID_EVE_ENDJOB1`.
- `CMover::SetQuest` (`MoverParam.cpp:3475-3577`):
  - refuses a quest already completed;
  - appends a new one, with `BGM_EV_START`;
  - moves an ended one to the completed list (unless it repeats) and out of the checked list, with `BGM_EV_END`.

**REMOVEQUEST types:**
- -1: cancelled, `TID_GAME_REMOVEQUEST`;
- 0: removed silently;
- 1: all quests (a GM command);
- 2: the completed list (a GM command).

**From the server:** DEFINEDTEXT `TID_EVE_STARTQUEST`, `TID_EVE_ENDQUEST`, `TID_EVE_CANCELQUEST`, `TID_EVE_REAPITEM`, `TID_GAME_REAPMONEY`,
`TID_GAME_REAPEXP`, `TID_QUEST_NOINVENTORYSPACE`. These need nothing new: Piece 5 shows every DEFINEDTEXT.

## 3. What the client sends

| `Send*` | Packet | Fields | Used by V15 |
|---|---|---|---|
| `SendRemoveQuest` `:11247` | 0x00ff0026 | `u32 questId` | the abandon box's OK (`WndQuest.cpp:43-48`); the time-out above |
| `SendCheckedQuestId` `:19252` | 0x88100110 | `i32 questId, i32 check` | the tree's check boxes (`WndQuest.cpp:1551, 1556`) |
| `SendReqNPCPos` `:18643` | 0x70005000 | string | **never** (compiled out) |

**What the server does with them**
- Abandoning: refused for an ended quest or one marked `m_bNoRemove`, with a 400 ms throttle (`DPSrvr.cpp:11840-11872`).
- Checking: a sixth check does nothing. Otherwise the quest moves to the end of the list (`:10945-10988`).
- Either way the server answers with QUEST_CHECKED.

## 4. `__IsEndQuestCondition` (`_Common/Mover.cpp:9274-9652`)

- It is 0 unless the quest is current and not ended. Each term below counts when met, and success is all of them (`21 + 64 + 64`).
- **Terms:**
  - time (`limit == 0 || m_wTime`);
  - patrol (`world == 0 || m_bPatrol`);
  - each kill slot;
  - the skill level; `gold >= need`; the level range; the EXP-percent range;
  - pet; disguise;
  - the state rule: with `m_nEndCondState == 0`, the highest consecutive defined state from 1 upward, minus 1;
  - the completed quests (operator 0 / 1 / 2);
  - party; guild;
  - the one-of items;
  - each end item (`GetItemNum >= n`, filtered by sex, job or owned item; `GetItemNum` is 0 while an item sits in a trade or shop);
  - TSP.
- `m_bDialog` is **not** checked.
- Its client uses:
  - the dialogue's yellow paper (`WndDialog.cpp:1054`);
  - the NPC head emoticons (`Mover.cpp:1092-1137`).
- The tracker and the detail window build their own rows instead (`MakeQuestConditionItems`).

## 5. The windows (`_Interface/WndQuest.cpp`, `WndQuestQuickInfo.cpp`; `Resource/resdata.inc`)

**`APP_QUEST_EX_LIST` 859** (`:4076`): `WndTile00.tga` tiled, 336 × 416, titled "Quest".
- The tab control is at 16,28-320,328: four tree tabs, titled by props 6000-6003 ("Scenario", "General", "Request Office", "Event").
- `WIDC_REMOVE`, "ButtRemoveQuest.bmp", is at 16,356-156,376.
- The combo is at 174,332-304,348: "All Quests" / "In Progress" / "Completed", defaulting to In Progress. The tab and the filter persist.
- `ButtClose.tga` is at 232,356-304,376.
- **Rows:**
  - Each quest sits under its head chain's folders; the tab is the chain's root, and an unknown root goes to General.
  - A completed row is grey (0xffc0c0c0) with no check box.
  - A current row has a 13-px `ButtCheck.bmp` check box, ticked when the quest is checked; a sixth tick prints `TID_GAME_ERROR_DONT_CHECK`.
  - Rows are ARGB(255,64,64,64); the selected row is blue.
  - The tree's buttons are `buttTreeOpen.tga` and `buttTreeClose.tga` (`WndControl.cpp:1130-1131`).
- **Behaviour**
  - Clicking a leaf toggles the detail window.
  - Abandon is enabled only for a current quest that has not ended and is removable, while no NPC dialogue is open. It opens `TID_GAME_QUEST_DELCONFIRM` with OK and Cancel; OK sends REMOVEQUEST.
  - Position: right edge, 110 down, then centred on its parent.

**`APP_QUEST_EX_DETAIL` 862** (`:2795`): 272 × 416, docked at the list's right edge.
- The group boxes are "Quest Contents", "Requirement" and "Reward".
- The text is the current state's description (for a completed quest, the last state's) at 12,28-252,156.
- The conditions tree is at 12,180-252,274; the rewards text at 12,292-252,374.
- **Condition rows** (`MakeQuestConditionItems`, `:1887-2352`), shown only at the last defined state or 14:
  - time left, or a red time-out;
  - kills: `TID_QUEST_KILL_NPC`;
  - items: `TID_QUEST_ITEM`;
  - patrol + "[Complete]";
  - disguise; skill; party; guild;
  - the one-of items;
  - `TID_QUEST_DIALOG`;
  - `TID_QUEST_DESTINATION` "Meet %s" (the hand-in NPC).

  A row that is met is wrapped grey (`#cffa0a0a0`). A completed quest shows only `TID_QUEST_COMPLETED`.
- **Rewards:**
  - `TID_QUEST_ITEM1` "Item: %s(%d)", or `ITEM2` "????";
  - `GOLD1`, `GOLD2` (a range) or `GOLD3`;
  - `TID_QUEST_EXP1`, `TID_QUEST_SKILLPOINT`, PK.

**`APP_QUEST_QUICK_INFO` 857, the tracker** (`:4055`): 224 × 144, created hidden, with no close button, at the right edge, 220 down. It resizes from 128 × 96 up to 768 × 544 and grows for a new quest.
- It shows only while quests are checked.
- Each checked quest gives a title row and its condition rows.
- The frame fades in on hover. Not hovered: titles yellow, rows white. Hovered: titles (161,28,70), rows (121,80,255).
- Clicking a title toggles the detail window. Clicking a row sets the destination.

**Opening:** applet 859, `Icon_Quest.dds`, hotkey `Q` (`NeuzMsgProc.cpp:166-181`), Start menu "Quest Diary" (`TID_APP_QUEST`, `WndTaskBar.cpp:2623`).

## 6. Messages (TID → English)

**Chat lines the client makes itself**
- `TID_QUEST_KILL_NPC` "Defeat %s #b(%d/%d)#nb"; `TID_QUEST_PATROL` "%s Search"; `TID_QUEST_DIALOG` "Chat with %s".
- `TID_QUEST_LIMIT_TIME` "Time Left: #b%d minutes#nb"; `TID_QUEST_LIMIT_TIMEOUT`; `TID_QUEST_FAILURE` "Quest cancelled.".
- `TID_EVE_STARTJOB1` "The next step of the quest has started."; `TID_EVE_ENDJOB1` "Quest Complete!".
- `TID_GAME_REMOVEQUEST` "%s quest has been cancelled."; `TID_GAME_ERROR_DONT_CHECK` "You cannot check that anymore.".

**Window texts**
- `TID_GAME_QUEST_DELCONFIRM` "Are you going to cancel the quest?"; `TID_QUEST_COMPLETED` "Quest completed.";
  `TID_GAME_QUEST_COMPLETE_TEXT` "[Complete]".
- `TID_QUEST_DESTINATION` "#bMeet %s#nb"; `TID_QUEST_ITEM` "%s number #b(%d/%d)#nb".
- `TID_QUEST_ITEM1` "Item: %s(%d)" and `TID_QUEST_ITEM2`; `TID_QUEST_GOLD1/2/3`; `TID_QUEST_EXP1` "Experience Gained.";
  `TID_QUEST_SKILLPOINT`; `TID_QUEST_COND_ITEM`.
- `TID_GAME_QUEST_ALL_LIST`, `CURRENT_LIST`, `COMPLETE_LIST`.

## 7. Destinations

- **Clicking a condition row** (detail window or tracker; `WndQuest.cpp:1614-1640`, `:2425-2530`):
  - finds the row's goal, in order: items, kills, the meet NPC, patrol, the dialogue NPC;
  - sets `m_vDestinationArrow` to (X, 0, Z) and opens the world map in destination mode, which draws `ButtDestination.bmp` at that spot (`WndMapEx.cpp:547-572, 1172-1214`);
  - with no position, opens a "Destination" box with the `QuestDestination` text, which is empty on this client.
- **The 3-D arrow** `etc_arrow.o3d`, which points from the player to the destination:
  - it is drawn only in `WI_WORLD_MADRIGAL` (`WndWorld.cpp:2414-2421`, `:3523`);
  - it is reset when the quest ends, on a teleport and on a tracker title click;
  - the model is in `Client/Model` but **the converter does not convert it**.

## 8. The job change (for M2)

- The last vocation quest ends through `QUEST_END_COMPLETE` (`__EndQuest`: inventory space, items, penya, EXP, skill points, then SETQUEST with state 14).
- The NPC script's `#questEndComplete` (Mustang → `mafl_hyuit_8` …) then calls `ChangeJob(n); InitStat();` (`ScriptLib.cpp:866-908`, `:571-583`).
- That sends SET_JOB_SKILL 0x00a7, SET_NEAR_JOB_SKILL 0x00a8 and RUNSCRIPTFUNC INITSTAT. There is no text.
- M1 shows the quest side; M2 handles the job messages; M0 handles INITSTAT already.

## 9. Today's web client (what M1 extends)

**Protocol**
- `packages/protocol/src/world/addObj.ts:181-183` skips the three quest lists of the own ADD_OBJ.
- `OwnCharacter` (`world/types.ts:217-258`) flows through `OwnNumbers` (`own.ts:25`), so a new optional field reaches `OwnState`.
- The test `addObj.test.ts:375-381` already writes 2 quests, 1 completed and 1 checked.
- No quest snapshot is read today. The free reader ids are 0x00b0, 0x00ba, 0x003a, 0x9400 and 0x8820 (`readers.ts:31-85`).
- `PacketType` has no quest packet. `decodeClientPacket` (`messages/world.ts:325-407`) needs a case before `script.on()` can answer.
- `writeAddSelf` (`packages/testkit/src/world.ts:639`) writes three empty counts.

**`OwnState`** (`apps/client/src/world/OwnState.ts`)
- The constructor copies `own.*` (`:150-171`).
- `apply` has object-less cases (`:236-256`), then own cases (`:258-316`).
- `OwnEvent` is at `:32-40`.
- `WorldState.apply` routes own messages through `toOwn` (`:286-292`, `:347-350`).
- The events reach `Hud.play` through `syncViews` (`WorldScreen.ts:967-1001`).

**Data**
- The data stage (`tools/convert/src/data/gameDataStage.ts`) has required catalogs at `:518-544` and optional ones (the world map at `:557-576`, audio at `:578-606`).
- The optional client loader pattern is `loadWorldMap(store, report)` (`apps/client/src/world/worldMapData.ts:12-25`).
- `ScriptReader` (`packages/formats/src/script/cscript.ts`) and `readCharacterInc` are the reader pattern.

**HUD**
- 859 is not in the task bar's `WINDOWS` (`hud/taskBar.ts:61-70`), so Q does nothing today.
- The Start menu `MENU` (`:87-98`) has no quest line.
- `WorldScreen.openWindow` is at `:1339-1363`.
- The phone panel to copy is `.hud-inventory[data-mobile-window]` (`style.css:1644-1676`, `inventoryWindow.ts:51-74`).
- Shop tabs use `WndTabTile` (`shopWindow.ts:107-113`).
- There is no tree or check-box control yet. Every theme picture has to be in `THEME_FILES` (`uiStage.ts`).
- Of the pictures the quest windows need, only `ButtQuickListDn.tga` is listed today (`:155`).

**World map** (`hud/worldMap.ts:49-224`): `toggle(view)`, `close()`, `update(view)`. It has no marker API.

**Minimap** (`hud/minimap.ts`): its destination mark is private and set only by a click on the map.

**Where M1 plugs in:**
- `QuestLookup` (`hud/dialogue/dialogState.ts:29-34`);
- `WorldScreen.ts:872`, which passes `NO_QUESTS`.
