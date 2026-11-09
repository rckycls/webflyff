# Pets in V15: research (2026-11-09)

What Neuz (V15) and the WorldServer do with pets, what the owner's data has, what the web client has today, and what porting
each kind would take. Research only: nothing here is built yet. Paths are under `Source/` unless they say `Resource/` or
`Client/`. The C++ is CP949; line numbers are the file's own lines.

## 0. The short answer

The code has **three kinds** of pet. They share the word "pet" but work very differently.

| Kind | Item | What it does | Who makes the model |
|---|---|---|---|
| **Raised pet** (the code's "system pet") | `IK3_EGG` (120): `II_PET_EGG` and the 8 hatched pets | Hatches from an egg, grows D, C, B, A, S, gives one stat that grows each level. Needs food (energy), can die. | **The client** makes its own mover; the server only keeps the pet's numbers in the item |
| **Pick-up pet** (the code's "eat pet", 먹펫) | `IK3_PET` (100): 54 items (wolf, dog, cat, panda ...) | Follows the owner and picks up the owner's drops. No stats, no food. Often time-limited. | **The server** makes a real NPC mover (`AII_PET`); the client sees it through ADD_OBJ |
| **Buff pet** (V15 "vis pet", `__PETVIS`) | an `IK3_PET` whose `dwReferStat1` is `PET_VIS` (Raccoon, Rican), or any pick-up pet changed by the Pet Magic scroll | A pick-up pet with up to 9 "vis" stones socketed; each vis gives stats for a time; the pet wears an aura. | The server (same as a pick-up pet) |

There is no "F" or "E" grade: the levels are egg, D, C, B, A, S (`_Common/pet.h:16`). The egg's text is
`TID_GAME_PETGRADE_E` (`_Interface/WndPetSys.cpp:399`), so the egg is "E".

Suggested order for FlyffWeb (details in section 9): readers first (M0), then **pick-up pets** (smallest: the server does
everything), then **raised pets** in four steps, then **buff pets**, then the rare raised-pet extras.

## 1. Compile switches in the owner's build

Both `Neuz/VersionCommon.h` and `WORLDSERVER/VersionCommon.h` define `__MAINSERVER` and `__VER 15` (lines 3-4). Almost all
pet code is gated by `__VER`, not by its own define, so the commented-out defines below do not matter.

| Switch | Gate used in code | Neuz | WorldServer | Meaning |
|---|---|---|---|---|
| `__PET_0410` | `#if __VER >= 9` (111 places) | on | on | V9-V10 raised pets, pick-up pet items |
| `__AI_0509` | `#if __VER >= 9` | on | on | monster/pet AI changes |
| `__PET_0519` | `#if __VER >= 12` (46 places) | on | on | V12: awakening of pets, feed without a count, `IsUsingEatPet` |
| `__CSC_VER12_5` | `#if __VER >= 12` | on | on | egg exchange window (`APP_PET_TRANS_EGGS`) |
| `__PETVIS` | `#if __VER >= 15` (every use) | on | on | V15 buff pets. The define itself is on in Neuz (`:204`) and commented out in WorldServer (`:205`) and DatabaseServer (`:114`), but no code uses `#ifdef __PETVIS`, so both sides have it |
| `__REACTIVATE_EATPET` | `#if __VER >= 15` | on | on | a pick-up pet left behind (teleport) is summoned again (`WORLDSERVER/User.cpp:564-584`) |
| `__PET_1024` | `#ifdef` | on (`:152`) | on (`:161`) | pet naming; adds a name string to `CPet` and to other players' ADD_OBJ |
| `__JEFF_11` | `#ifdef` | on (`:96`) | on (`:99`) | pick-up pet skips an item that does not fit the bag (`MoverActEvent.cpp:2243-2249`); pet resurrection packet |
| `__JEFF_11_1` | `#ifdef` | on (`:479`) | on (`:411`) | second feed pocket item |
| `__JEFF_11_3` | `#ifdef` | n/a | on (`:412`) | the server reads `Pet_LevelupAvail` and `Pet_AddLifeProbability` from `Resource/s.txt` (`_Common/Project.cpp:5300-5340`) |

No `__BB_*` define touches pet code (searched every `.cpp`/`.h`). The owner did change stock pet **data**; see section 6.

## 2. Raised pets (stat pets)

### 2.1 What the player sees and does

1. **Get an egg** (`II_PET_EGG`; monsters of level 20 and up drop them, per the wiki). Double-click it in the bag: the
   egg is "summoned" and bounces along beside the player (model `MI_PET_EGG`). The pet window opens next to the status
   window.
2. **Grow the egg.** An egg gains EXP only from **pet food** (1 food = 1 EXP, up to 50,000) or the **hatch scroll**. At
   100% a message box says the pet can hatch (`TID_GAME_PETEGG_HATCH`, `Neuz/DPClient.cpp:16514-16538`).
3. **Level up at the Pet Tamer** (`MaFl_PetTamer`). Quests `QUEST_PETTAME01`-`05` (`Resource/propQuest.inc`, from
   line 17545) each need the pet at level n with 100% EXP and give `SetEndRewardPetLevelup`. They repeat. Egg to D picks
   the kind at random; every level rolls a new stat step.
4. **Keep it fed.** A hatched pet loses **1 energy a second** while summoned. Double-click **pet food** to feed it (the
   whole stack, as much as fits: 1 food = 2 energy). At 0 energy it loses 1 **life** and refills; at no life left it
   **dies**: the item is marked dead (`TID_GAME_PET_DEAD` on use) and the pet is sent back.
5. **It gains EXP over time** while summoned (D 0.25%, C 0.125%, B 0.062%, A 0.031% a minute; S never).
6. **Make food** at the Pet Tamer (menu "food mill"): drop a monster quest item (`IK3_GEM`, e.g. Twinkle Stone), get pet
   food by the item's price. A premium **feed maker** item opens the same window anywhere and gives more.
7. **Recall**: double-click the pet item again, or right-click the pet and choose release. Releasing costs a little EXP
   (D 0.16%, C 0.08%, B 0.04%, A 0.02%). If the owner dies to a monster, the pet loses 1 life too (eggs never).
8. **What others see**: the pet walking beside its owner, with its name if named. An S pet sparkles.
9. **Premium helpers**: life scroll (+1 to +5 life), hatch scroll, tamer's mistake (one level down), tamer's miracle
   (reroll the last two stat steps), tonic A (no energy loss for 10 min) and B (also EXP x1.5), feed pocket (eats food
   from the bag instead of energy), S-pet food (an S pet loses no energy), naming scroll.
10. **Not allowed**: summoning while flying (`TID_GAME_CANNOT_CALL_PET_ON_FLYING`), flying with any pet out
    (`TID_GAME_CANNOT_FLY_WITH_PET`, `_Common/Mover.cpp:8587-8594`), pets in the quiz world.

### 2.2 The numbers (code wins over the web; owner's data)

**Stat steps** (`Resource/pet.inc:1-12`, read by `CPetProperty::LoadScript`, `_Common/pet.cpp:124-240`): each kind has
one stat (`dwDstParam`) and nine step values **1, 2, 4, 7, 11, 16, 22, 29, 37**. At each level the server rolls a step
(`GetLevelupAvailLevel`, `pet.cpp:51-62`) with these odds per 10,000 (`Resource/s.txt:80-88`, `Pet_LevelupAvail`):

| Level | step 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | gives |
|---|---|---|---|---|---|---|---|---|---|---|
| D | 10000 | | | | | | | | | +1 |
| C | 5100 | 3100 | 1800 | | | | | | | +1, +2 or +4 |
| B | 4000 | 2800 | 1800 | 1000 | 400 | | | | | +1 to +11 |
| A | 3500 | 2300 | 1700 | 1200 | 700 | 400 | 200 | | | +1 to +22 |
| S | 2700 | 2100 | 1700 | 1300 | 900 | 600 | 400 | 200 | 100 | +1 to +37 |

The bonus is the **sum** of the steps of every level reached (`CPet::GetAvailDestParam`, `pet.cpp:378-388`). A perfect S
pet gives 1+4+11+22+37 = **75**; the worst gives 5. The kind (owner's `pet.inc`, `Resource/define.h:250-258`):

| Kind | `PK_` | Stat | Item | Hatch weight /10,000 |
|---|---|---|---|---|
| White tiger | 0 TIGER | STR | `II_PET_WHITETIGER01` | 900 |
| Barbary lion | 1 LION | STA | `II_PET_BARBARYLION01` | 1100 |
| Rabbit | 2 RABBIT | DEX | `II_PET_RABBIT02` | 1300 |
| Nine-tailed fox | 3 FOX | INT | `II_PET_NINEFOX01` | 1675 |
| Dragon | 4 DRAGON | ATK % (`DST_ATKPOWER_RATE`) | `II_PET_DRAGON01` | 1675 |
| Eagle (griffin) | 5 GRIFFIN | DEF % (`DST_ADJDEF_RATE`) | `II_PET_EAGLE01` | 1675 |
| Unicorn | 6 UNICORN | max HP % (`DST_HP_MAX_RATE`) | `II_PET_UNICORN01` | 1675 |
| Mana unicorn | 7 MANA_UNICORN | max MP % (`DST_MP_MAX_RATE`) | `II_PET_MANAUNICORN01` | 1675 |

Stock V15 (section 7) gave the dragon flat attack (steps x5), the griffin flat defence (x4) and the unicorn flat max HP
(x91). The owner's `pet.inc` uses the plain 1-37 steps as **percent** for those three, so a perfect S dragon gives +75%
attack on this server.

`Hatch()` (`pet.cpp:78-89`) draws 1-10,000 against the running total. The weights add up to 11,675, so the **mana
unicorn can never hatch from an egg** (its range is 10,001-11,675). This is a server data matter, not a client one; the
owner may want to know.

**Other tables** (`Resource/pet.inc:14-71`):

| | D | C | B | A | S |
|---|---|---|---|---|---|
| Max energy (`MaxEnergy`) | 180 | 300 | 420 | 600 | 1500 |
| EXP a minute, of 100,000 (`IncrementExp`) | 250 | 125 | 62 | 31 | 0 |
| Minutes from 0 to 100% | 400 | 800 | 1613 | 3226 | n/a |
| EXP lost on release (`Penalty`, % of 100,000) | 0.16 | 0.08 | 0.04 | 0.02 | 0 |

- Egg EXP max 50,000, pet EXP max 100,000, life max 99 (`pet.h:85-87`). A new egg gets life 1 and full energy
  (`CPet::InitEgg`, `pet.cpp:403-407`). The egg's max energy is 1 (`CPetProperty::GetMaxEnergy`, `pet.cpp:98-103`).
- **Food from a quest item** (`FeedEnergy 0` at the NPC, `FeedEnergy 1` with the feed maker; `pet.inc:14-42`): by the
  item's `dwCost`, e.g. cost 1-575 gives 7-14 food (NPC) or 28 (maker); cost 10,000 and up gives 250-500 (NPC) or 1000
  (maker). The total is capped at one stack, `dwPackMax` 9999 (`WORLDSERVER/DPSrvr.cpp:8192-8203`).
- **Life scroll odds** (`Resource/s.txt:90-97`): +1 35%, +2 30%, +3 20%, +4 10%, +5 5%. Life scroll 02 is always +1.
- **Energy and EXP timing**: energy every `m_nCount & 15` ticks ("1 per second", `_Common/Mover.cpp:11028-11035`), EXP
  every `m_nCount & 1023` ticks ("once a minute", `:11115-11121`).

### 2.3 How Neuz does it (client)

**The pet lives in the item.** `CItemElem::m_pPet` (`_Common/Item.h:213`) is serialised inside every item
(`_Common/ObjSerialize.cpp:75-85` storing, `:120-129` loading): `u8 hasPet`, then `CPet::Serialize`
(`pet.cpp:311-339`): `u8 kind, u8 level, u32 exp, u16 energy, u16 life, u8[6] availLevel, string name` (name since
`__PET_1024`, max 17 bytes, `pet.h:104-105`). The item id changes with the level (`CPet::GetItemId`: `II_PET_EGG` for the
egg, else the kind's item, `pet.h:147-152`).

- **Icon**: `CItemBase::SetTexture` (`_Common/Item.cpp:81-117`) adds `_00` (D, C), `_01` (B, A) or `_02` (S) to the icon
  name. Files `Client/Item/Itm_PetWhiteTiger01_00.dds` etc.
- **Name**: `CItemElem::GetName` (`Item.cpp:609-625`): `TID_GAME_CAGE_STRING` with the mover's name, or the pet's own name.
- **Tooltip**: `CWndMgr::PutPetInfo` (`_Interface/WndManager.cpp:5285`), `PutPetFeedPocket` (`:5448`), `PutPetKind`
  (`:7611`). Already researched in `2026-11-05-item-tooltip-research.md` (:195-257).
- **Buff bar**: the server's `BUFF_PET` (type 2, `_Common/SkillInfluence.h:6`) shows the pet's icon by level
  (`CWndWorld::GetSystemPetTextureKey`, `_Interface/WndWorld.cpp:9160-9182`, used at `:9219-9228`).

**Which pet is out.** `CMover::m_dwPetId` (`_Common/Mover.h:798`): for the own player the bag slot (item `m_dwObjId`) of
the summoned pet; for others `MAKELONG( model index, level )`. It arrives in ADD_OBJ:

- own player: `ar << GetPetId()` after the three banks (`_Common/ObjSerializeOpt.cpp:257-259`, read at `:593-603`). The
  server saves it (`_Database/DbManagerSave.cpp:347-348`, loaded `DbManagerJoin.cpp:257-258`), so **a summoned pet is
  still out after a relog**;
- other players: `u32 dwPetId, string name` after the shop title and worn parts (`ObjSerializeOpt.cpp:299-316`, read
  `:664-672`).

**The pet mover is made by the client.** `pet.h:10-13` says so: the server keeps only the data. `CMover::ProcessPet`
(`_Common/Mover.cpp:10839-10937`, called every frame at `:3770`), when `m_dwPetId` is set and there is no pet object:

1. model index: own pet `CPet::GetIndex()` (`pet.cpp:390-401`: `MI_PET_EGG`, else `m_adwIndex[0]` for D-C, `[1]` for
   B-A, `[2]` for S); others `LOWORD( dwPetId )`;
2. `CreateObj( OT_MOVER, index )`, the pet's name, `InitMotion( MTI_STAND )`, AI `CAIEgg` (`AII_EGG`), position = owner,
   `AddObj` with **no server id** (`GetId()` stays `NULL_ID`); the own pet gets character key `"MaFl_Pet"`;
3. `CreatePetSfx` (`:11148-11178`): after a level-up plays `PCSkillCastCheer.wav`; after the tamer's miracle feeds the
   miracle window;
4. the own player's pet window opens (`CWndPetStatus`).
5. An S pet (own: its level; others: `HIWORD( dwPetId )`) sprays 4 particles a frame (`:10915-10929`;
   `CreatePetParticle`, `:10802-10833`, `g_ParticleMng` kinds 13-23, the angel's particle system).

Without `m_dwPetId` the object is deleted (`:10900-10913`). `PetRelease` (`:11180-11190`) deletes it and plays
`ItemGnCollector.wav`. `PetLevelup` on the client (`:10961-10968`) deletes it, so the next frame rebuilds it with the new
model and the level-up sound.

**How it moves**: `CAIEgg::MoveProcessIdle` (`pet.cpp:493-570`): every AI tick, take the two points 1 m to the owner's
left and right (owner angle ±90°, on the ground under the owner), pick the one nearer the pet, and `SetDestPos` there if
the pet is more than 1 m away (XZ). No server packets: the pet is local only.

**The model** (`Resource/mdlDyna.inc:19359-19760`): the egg is `PetEgg` (idle motion); each kind is one mesh
(`Mvr_PetWhiteTiger01.o3d` ...) and its three `MI_` ids differ only by **texture set**: `ATEX_NONE`, `ATEX_01`, `ATEX_02`
(`nTextureEx`), i.e. `Client/Model/TextureMid/Mvr_PetWhiteTiger01-et01.dds` and `-et02.dds`
(`_Common/Object3D.cpp:3107-3108` picks the set). Scale 1.0-1.1.

**Client special cases for pets** (`dwAI` `AII_PET` or `AII_EGG`): name and HP bar placed at `GetScrPos`, not `GetPos`
(`MoverRender.cpp:1333`, `:1772`; `_Interface/WndWorld.cpp:2674`); the shadow too (`World3D.cpp:1052`); the motion speed
follows the move speed like a monster's (`Mover.cpp:3844-3846`); no collision for pure pets
(`_AIInterface/ActionMoverCollision.cpp:172-185`); **another player's raised pet cannot be clicked** (`GetId() ==
NULL_ID` and not the own pet, `World3D.cpp:2703-2707`).

**Windows** (all in `_Interface/WndPetSys.cpp` unless noted; sizes from `Resource/resdata.inc`):

| Window | APP id | Size | What it does |
|---|---|---|---|
| `CWndPetStatus` | `APP_PET_STATUS` 627 (`resdata.inc:8798`) | 192x160, +48 when expanded | Title = pet name. 3D portrait of the pet (own camera per kind, `SetPetCamTable` :225-283, egg special :676-687), energy gauge (red) and EXP gauge (blue) with numbers (:544-611), level text `TID_GAME_PETGRADE_E..S`, stat line, and (expanded, `WIDC_BUTTON1`) one `Icon_PetLevel1..9_S.dds` per level with a tooltip of that step (:838-919). Art: `PetStatusBg.tga`, `PetLevelBg.tga`. Opens beside `APP_STATUS1` (:802-836). |
| `CWndFoodConfirm` | `APP_PET_ITEM` 659 | | V12 sends feed without it; still used by the food mill count (:1076-1240) |
| `CWndPetFoodMill` | `APP_PET_FOODMILL` 650 (`:9209`) | 208x176 | drop a gem from the bag; `SendMakePetFeed` (:1664-1838) |
| `CWndPetMiracle` | `APP_PET_MIRACLE` 646 (`:9257`) | 272x336 | tamer's miracle: shows the two rerolled steps (:1325-1500) |
| `CWndPetLifeConfirm` | `APP_MESSAGEBOX` | | confirm the life scroll (:1841-1935) |
| `CWndPetTransEggs` | `APP_PET_TRANS_EGGS` 745 (`:22596`) | 240x320 | 10 unhatched eggs for food or a D pet (`Resource/transformitem.inc`) (:1938-2210) |
| `CWndPetAwakCancel` | `APP_PET_AWAK_CANCEL` 762 (`:23976`) | 272x224 | remove a pet's awakening (:19-150) |
| `CWndPetRes` | `APP_PET_RES` 687 (`:13467`) | 208x208 | pet resurrection (`_Interface/WndPetRes.cpp`) |
| `CWndChangePetName` | `APP_CHANGENAME` | | name input (`_Interface/WndChangeName.cpp:166`) |

**Menus**: right-click the own pet: `MaFl_Pet` (`Resource/character.inc`) has `MMI_PET_STATUS` (toggle the window) and
`MMI_PET_RELEASE` (`SendPetRelease`) (`WndWorld.cpp:5877-5898`). The Pet Tamer `MaFl_PetTamer`: `MMI_DIALOG`,
`MMI_PET_FOODMILL`, `MMI_PET_EGG01` (egg exchange), `MMI_PET_RES`, `MMI_PET_RES01`, `MMI_PET_AWAK_CANCEL`,
`MMI_RENAME_CANCEL` (`SendClearPetName`) (`WndWorld.cpp:4424-4440`, `:5098-5115`, `:5231-5241`, `:5863-5876`).

**Item use from the bag** (`CDPClient::SendDoUseItem`, `Neuz/DPClient.cpp:10604-10667`): items with `dwExeTarget ==
EXT_PET` need a summoned pet (`TID_GAME_PET_NOT_FOUND`). Miracle opens its window; mistake and hatch open
`CWndCommItemDlg` with `TID_GAME_PET_MISTAKE_DESC` / `TID_GAME_PET_HATCH_DESC`; **food sends `USE_PET_FEED` at once**; the
feed maker opens the food mill; the life scroll opens its confirm; the naming scroll opens the name window
(`:10845-10857`). The egg/pet item itself goes out as a plain DOUSEITEM.

### 2.4 Packets

Server to client (snapshot types, `_Network/MsgHdr.h:1194-1201`, `:1237`, `:1271`; handlers `DPClient.cpp:16398-16632`,
dispatch `:708-715`):

| Type | Id | Sent to | Body | Neuz does |
|---|---|---|---|---|
| PET_CALL | 0x0110 | all in range | `u32 itemObjId, u32 modelIndex, u8 level, string name` (`WORLDSERVER/User.cpp:7888-7906`) | own: `SetPetId( itemObjId )`; others: `MAKELONG( index, level )`; set name |
| PET_RELEASE | 0x0111 | all in range | nothing | `PetRelease`; own: close status, miracle, food windows |
| PET_LEVELUP | 0x0112 | others only | `u32 MAKELONG( index, level )` | set, rebuild the model |
| PET_SET_EXP | 0x0113 | self | `u32 exp` | at 100%: message box `TID_GAME_PETEGG_HATCH` |
| PET | 0x0114 | self | `CPet`, `u8 flag` (`PF_PET` 0, `LEVEL_UP` 1, `LEVEL_DOWN` 2, `GET_AVAIL` 3) | replace the item's pet; on a flag, new item id and icon, rebuild the model |
| PET_STATE | 0x0115 | self | `u32 itemObjId, u16 life, u16 energy, u32 exp` | set; more life: message `TID_GAME_PET_LIFE` |
| PET_FEED | 0x0116 | all in range | `u16 energy` | set the energy |
| PET_MILL | 0x0117 | self | `i32 result, i32 count` | food mill result |
| QUE_PETRESURRECTION_RESULT | 0x0203 | self | `BOOL` | pet resurrection window |
| SET_PET_NAME | 0x9100 | all in range | `string name` (`User.cpp:7872-7881`) | set, rename the model |

Client to server: `PET_RELEASE` 0xf000f600 (empty), `USE_PET_FEED` 0xf000f601 (`u32 feedObjId`), `PET_TAMER_MISTAKE`
0xf000f602 and `PET_TAMER_MIRACLE` 0xf000f603 (`u32 scrollObjId`), `FEED_POCKET_INACTIVE` 0xf000f604, `MAKE_PET_FEED`
0xf000f605 (`u32 material, u32 tool or NULL_ID, i16 count`), `QUE_PETRESURRECTION` 0x70000009, `TRANSFORM_ITEM`
0x8FFF000D (`CTransformStuff`), `PICKUP_PET_AWAKENING_CANCEL` 0x8FFF000F, `DO_USE_ITEM_INPUT` 0x8FFFFF00 (naming),
`CLEAR_PET_NAME` 0x8FFFFF01 (`MsgHdr.h:626-632`, `:681`, `:768-775`). Summon, life, hatch, tonic and pocket are DOUSEITEM.

### 2.5 What the server does (brief; the servers do not change)

- Use (`CMover::DoUseItem`, `_Common/MoverSkill.cpp:1699-1706`): `IK3_EGG` calls `DoUseSystemPet` (`:4025-4031`): toggle.
  `ActivateSystemPet` (`:3982-4015`) makes the `CPet` on the first summon, sets `m_dwPetId`, sends PET_CALL to all and PET
  to the owner the first time.
- Every tick (`CMover::ProcessPet`, server half, `Mover.cpp:10930-10937`): `ProcessPetAvail` (`:10999-11025`) puts the
  stat on as `BUFF_PET` + `SetDestParam`; `ProcessPetEnergy` (`:11028-11113`) and `ProcessPetExp` (`:11115-11143`) as in
  2.2, sending PET_STATE each second and PET_SET_EXP each minute.
- Feed: `OnUsePetFeed` (`WORLDSERVER/DPSrvr.cpp:8054-8122`); food mill `OnMakePetFeed` (`:8125-8227`, must be near the
  tamer unless a feed maker is used); mistake (`:8229-8275`, C to S); miracle (`:8277-8327`, B to S); pocket off
  (`:8329-8338`). Scrolls in `MoverSkill.cpp:1962-2015` (life, hatch), `:3926-3978` (feed pocket), `:4280-` (tonic).
- Level-up: `CMover::PetLevelup` (`Mover.cpp:10969-10995`) from the quest reward (`_Common/ScriptHelper.cpp:352-353`).
- Death with the owner: `Mover.cpp:5226-5258`. Release: `:11192-11234`.

## 3. Pick-up pets (looter, "eat pets")

### 3.1 What the player sees and does

Double-click the pet item (`IK3_PET`): a small creature appears at the player and follows them. When the owner's drops
are on the ground it runs to the nearest one and the owner gets the item (the normal pick-up message and sound). It
brings items back only for its owner; the owner needs bag space. Double-click the item again to send it away. Most of
these items are time-limited (1 to 30 days through the box items `II_SYS_SYS_SCR_BX_PET_*`); when the time runs out the
pet goes and the item vanishes (`CUser::CheckFiniteItem`, `WORLDSERVER/User.cpp:7333-7346`).

### 3.2 How the server does it

- `ActivateEatPet` (`_Common/MoverSkill.cpp:4041-4087`): no summon while flying or in the quiz world;
  `CreateMover( world, prop->dwLinkKind, owner pos, layer )`: a real NPC mover (`MI_PET_*`, `dwAI` `AII_PET`,
  `BELLI_PEACEFUL`, `Resource/propMover.txt:445-`), AI `CAIPet` (`_Common/Obj.cpp:730`). V12 adds the item's awakening
  to the owner (`CAIPet::SetItem`, `_AIInterface/AIPet.cpp:437-443`).
- AI (`_AIInterface/AIPet.cpp`): every tick (`MoveProcessIdle`, `:178-256`): if not fetching and more than 1 m from the
  owner, `MoveToDst( owner )` (MOVERSETDESTOBJ to all, `:94-101`); **once a second** (`GetCount() & 15`, `:227`) look for
  loot (`SubItemLoot`, `:105-170`): nothing if the owner is more than **32 m** away or flying; else the nearest ground item
  within **15 m** of the pet that the owner may take (`IsLoot( item, TRUE )`); walk there (`SetDestPos` + DESTPOS to all,
  `:83-91`). On arrival within **5 m** (`:302`) the owner `DoLoot`s it (the same as picking it up), then look again.
- `IsLoot` for a pet (`_Common/MoverActEvent.cpp:2193-2251`): the owner's drop, a party member's drop, or anything after 7
  s; never a respawned field item; never if the bag is full (gold is fine).
- The pet is dropped when the owner dies or is more than 32 m away (`NotOwnedPetInactivated`, `AIPet.cpp:403-431`). After a
  teleport (`CMover::Replace`, `Mover.cpp:2240-2243`) the server summons it again next to the owner
  (`CUser::Process`, `User.cpp:564-584`, `__REACTIVATE_EATPET`).

### 3.3 How Neuz does it (client)

There is **almost nothing pet-specific on the client**. The pet comes as a normal NPC ADD_OBJ and moves with the usual
DESTPOS and MOVERSETDESTOBJ; the item comes with the usual CREATE_ITEM and the ground item's DEL_OBJ. The only rules are the
`AII_PET` ones in 2.3 (screen position for the name, shadow, motion speed, no collision). It **can** be clicked (it has a
server id). The client does **not** know which mover is its own pick-up pet: `SetEatPetId` is only called for buff pets
(`DPClient.cpp:19008`), so `IsUsingEatPet` (`Mover.cpp:11242-11258`) is false on the client for a plain pick-up pet and
its bag slot is not faded.

## 4. Buff pets (V15 "vis pets", `__PETVIS`)

### 4.1 What the player sees and does

A buff pet is a pick-up pet that also carries **vis** stones. Items: `II_PET_RACCON` and `II_PET_RICAN`
(`dwReferStat1 = PET_VIS`, `_Common/ProjectCmn.h:379-386`), or any pick-up pet after the **Pet Magic** scroll
(`II_SYS_SYS_SCR_PET_MAGIC`, sets `m_bTranformVisPet`). On the first summon it gets 2 vis slots
(`PETVIS_DEFAULT_VIS_SLOT_SZIE`, `Mover.h:88`); the **vis key** (`II_SYS_SYS_VIS_KEY01`) opens more, up to 9 (`MAX_VIS`,
`_Network/CmnHdr.h:568`). While it is out, its window (`APP_BUFFPET_STATUS`) shows the pet and 9 slots. Drag a vis
(`IK3_VIS`, 45 items) from the bag to a slot (a confirm box, `CWndConfirmVis`, `APP_CONFIRM_ENTER`), drag between slots to
swap, or take one out. Each vis gives its stats (`dwDestParam1-3`) for its time (`dwAbilityMin` minutes: 60 for level 1, 4320
for level 2, 10080 for level 3), and level-3 vis need one or two other vis in the pet first (`dwReferTarget1/2`). The pet
glows by its best vis level (`XI_BUFFPET_GRADE1-3`, `sfx_buffpet01-03.sfx`). The pet's item shows as a buff icon
(`BUFF_EQUIP`).

### 4.2 How it works

- Server: `ActivateEatPet` (`MoverSkill.cpp:4073-4084`): `SetVisPetItem`, `SetPetVisDST` (`:4118-4141`: `BUFF_EQUIP` for
  the pet item, each valid vis's stats), the pet mover's `m_dwMoverSfxId = GetVisPetSfxId()` (`_Common/Item.cpp:810-829`),
  and **VISPET_ACTIVATE** to the owner. `ProcessVisPet` (`:4163-4185`) removes timed-out vis (`TID_GAME_BUFFPET_TIMEOUTVIS`).
  Vis use, key and Pet Magic go through `CUser::OnDoUseItem` (`WORLDSERVER/User.cpp:3006-3024`) to `CItemUpgrade`
  (`WORLDSERVER/ItemUpgrade.cpp`); a changed glow is sent as MOVER_CHANGESFX (`ItemUpgrade.cpp:1686-1695`).
- The vis live in the item's piercing list: slot items in the first list, their end times in the third list
  (`_Common/piercing.cpp:36-87`, `i64` seconds left). Changes come as UPDATE_ITEM with `UI_PETVIS_SIZE` 15,
  `UI_PETVIS_ITEM` 16 (`LOWORD` slot, `HIWORD` item, and the PETVIS `dwTime` in minutes), `UI_PETVIS_ITEMSWAP` 17,
  `UI_TRANSFORM_VISPET` 18 (`Mover.h:82-89`, `MoverParam.cpp:3980-4020`); each plays `SND_INF_EQUIPACCESSORY`.
- Packets: **VISPET_ACTIVATE** 0x8801 (self: `u32 itemObjId, u32 petMoverId`; opens or closes the window,
  `DPClient.cpp:19002-19029`), **MOVER_CHANGESFX** 0x8800 (all: `u32 sfxId`, `:19032-19042`), and ADD_OBJ's
  `m_dwMoverSfxId` on every mover (`ObjSerializeOpt.cpp:110-112`). Client to server: `VISPET_REMOVEVIS` 0x88000000
  (`i32 slot`), `VISPET_SWAPVIS` 0x88000001 (`i32, i32`) (`DPClient.cpp:18988-19000`).
- The aura: `CMover::SetSfxBuffPet` (`Mover.cpp:1940-1951`) makes the effect linked to the mover (`CSfxLinkMover`,
  looping); `Mover.cpp:3958-3961` makes it whenever `m_dwMoverSfxId` is set.
- Window: `CWndBuffPetStatus` (`WndPetSys.cpp:2212-2860`, `APP_BUFFPET_STATUS` 845, 192x128, `resdata.inc:2693`, art
  `"BuffpetStatusBg .tga"` with a space): portrait of the pet's model, slots `WIDC_BUFFPET_SLOT1-9`, drop from the bag
  (confirm, then DOUSEITEM of the vis), drag inside (`SendSwapVis`), remove (`SendRemoveVis`).
- Tooltips: `PutVisPetInfo` (`WndManager.cpp:7479`), `PutNeededVis` (`:7429`); see the tooltip research note.

## 5. Other pet-related items (not a separate kind)

Pet awakening (`II_SYS_SYS_SCR_PETAWAKE`, `EATPETAWAKE`, cancel), pet resurrection quest scrolls
(`II_SYS_SYS_QUE_PETRESURRECTION01/02_S/A/B`), the egg exchange, and GM commands (`/petlevel`, `/petexp`,
`/makepetfeed`, `/Pet`, `/SetPetName`, `/ClearPetName`, `_Interface/FuncTextCmd.cpp`). The `MI_PET_*` boxes (`II_SYS_SYS_SCR_BX_PET_*`)
just give a pick-up pet with a time limit.

## 6. The owner's data

**Items** (`Resource/propItem.txt`): 9 `IK3_EGG` (the egg + 8 hatched pets), 54 `IK3_PET` (2 with `PET_VIS`), 45
`IK3_VIS` (19 level 1, 21 level 2, 5 level 3), 1 `IK3_FEED` (`II_SYS_SYS_FEED_01`, stack 9999), and the scrolls named in
2.1 and 4.1. Pick-up pets have `dwLinkKind` = their `MI_PET_*` mover.

**Movers** (`Resource/propMover.txt`): 54 `AII_PET` rows and 25 `AII_EGG` rows (the egg + 8 kinds x 3 stages), all speed
0.1.

**Models** (`Client/Model`): 48 `Mvr_Pet*.o3d` with 48 `.chr` and 165 `.ani`; the early pick-up pets (Lawolf, Aibatt,
Leyena, Luia) use the monsters' models (`mdlDyna.inc:17812`). Stage textures in `Client/Model/TextureMid/*-et01.dds`,
`-et02.dds`. Window art in `Client/Theme/Default` (`PetStatusBg.tga`, `PetLevelBg.tga`, `BuffpetStatusBg .tga`), level
icons `Client/Icon/Icon_PetLevel1..9_S.dds` (and `_L`), effects `Client/SFX/sfx_buffpet01-03.sfx`, sounds
`PCSkillCastCheer.wav`, `ItemGnCollector.wav`.

**Owner changes that affect stock pets** (`CUSTOM_FEATURES.md:332-372`, resource only, no `__BB_` code): dragon, eagle and
unicorn now give percent stats (ATK%, DEF%, max HP%), and a new kind, the **mana unicorn** (max MP%, `PK_MANA_UNICORN` 7,
`PK_MAX` 8). The web client should read `pet.inc` and not hard-code the kinds. Two side effects in the C++ the owner may
want to know about:

- the hatch weights add up to 11,675, so the mana unicorn never hatches from an egg (2.2);
- `CWndPetStatus` has a camera entry for 7 kinds only (`MAX_PET_CLASS 7`, `_Interface/WndPetSys.h:16`), so a mana
  unicorn's portrait reads past the table (`m_PetCameTable[7]`, `WndPetSys.cpp:688-692`). The web port needs a choice for
  kind 7 (e.g. reuse the unicorn's entry).

## 7. Online

Sources reached: the copy of the old gPotato wiki at `flyff-wiki.gpotato.com.br` (pages `Pets`, the seven pet pages,
`Pet_Tamer.html`, `Raising_Pet_1(Egg_D_Level).html`, `Version_11..16.html`, `Cash_Shop_Pets.html`, `Buff_Pet.html`,
`Buff_Bead`, `Pet_Feed.html`), the V12 "Flyff Pet System Guide" by XoxJayoxO (copy at
`cyberly.org/game-cheats/pc-walkthroughs/flyff-pet-system-guide.html`, 2009), and Ten Ton Hammer's V15 launch article
(20 Apr 2010, no pet news). `flyff.fandom.com` and `web.archive.org` could not be reached. The full notes with a link per
fact are in the session notes folder (`pets-research/online.md`). **Where they differ, the code wins.**

| Topic | Online | Code (this server) |
|---|---|---|
| Grades | Egg, D, C, B, A, S. F/E, "Pet Candy" and an energy that only switches the stat off are **Flyff Universe** | same as online (V15) |
| Kinds | 7: tiger STR, lion STA, rabbit DEX, fox INT, unicorn HP (x91), griffin DEF (x4), dragon ATK (x5); 3 looks (change at B and S) | 8 kinds; dragon, griffin, unicorn give **percent** with x1 steps; mana unicorn MP% added (owner's change, 2.2) |
| Step odds | guide's table = `s.txt` exactly (the guide's A-to-S row adds to 101%) | `Resource/s.txt:80-88` |
| Hatch | summon the egg, feed 50,000, quest "Raising Pet 1"; Egg Hatcher scroll | same |
| Energy | "pet HP": 1 a second, 2 per feed, 180/300/420/600/1500 | same |
| EXP a minute | 0.25 / 0.12 / 0.06 / 0.03 % (wiki), 0.25 / 0.125 / 0.0625 / 0.03125 % (guide) | 0.25 / 0.125 / 0.062 / 0.031 %; 400 / 800 / 1613 / 3226 min (the wiki says 833 / 1667 / 3333) |
| Release penalty | one minute of EXP (wiki), about half a minute (guide) | 0.16 / 0.08 / 0.04 / 0.02 % = about 0.64 minute: the guide is closer |
| Owner dies | loses a life (wiki), "pet dies" (guide) | loses a life only when killed by a monster, not in PvP; the pet is sent back; an egg never |
| Lives | starts with one; egg-exchange pets may start without it (guide) | life 1 at summon and at hatch; the exchange gives life 0 (`Resource/transformitem.inc`, `TI_PET ... 1 0 0`) |
| Food | the tamer turns quest items into feed: Twinkle Stone 7-14, Fangs 18-35, Golden Wing 25-50 | matches `FeedEnergy 0` by item price |
| Tamer services | Raising Pet 1-5, feed, 10-egg change (V12), revival (V11), rename cancel (V13), pick-up pet blessing removal | `MaFl_PetTamer` menus (2.3) |
| Premium | Blessing of the Pet Tamer, Chance of the Pet Tamer, Pet Medicine A/B, Pet Feed Bag (6 h), Feed for (S) Pet (15 days), Pet Energy (+1 to +5 lives) | mistake, miracle, tonic A/B (10 min), feed pocket (360 min), S-pet food (21,600 min), life scroll |
| Pick-up range | not found | owner within 32 m, item within 15 m of the pet, checked once a second |
| Whose drops | "for their owner", not detailed | owner's, party's, anyone's after 7 s; not respawning field items; not with a full bag (gold is fine) |
| Expiry | not stated | only box-given pets have a time (`II_SYS_SYS_SCR_BX_PET_*`) |
| Flying | cannot summon or recall while flying | same; also cannot fly with any pet out |
| V15 re-summon | a pet left behind comes back | past 32 m or after a teleport the server summons it again |
| Buff pets (V15) | "Pick-up Pet Upgrade" scroll gives 2 bead slots; "Bead Slot Key" up to 9; beads give timed stats; the pet glows | Pet Magic scroll, vis key, vis (`IK3_VIS`), `MAX_VIS` 9, `XI_BUFFPET_GRADE1-3` |
| Bead times | 1 h, 1 day, 3 days, 7 days, permanent (page edited to 2020) | this data: 60 min (level 1), 4,320 min (level 2), 10,080 min (level 3) only |
| "Visual" or "transformation" pets | no such kind for official V15 | none either; the "transform" is the Pet Magic scroll |
| Pet window | "vital information" only | section 2.3 |
| Inventory "pet tab" | mentioned on a page edited to 2020 | not in V15 |

PC-client videos (titles and links only): "Flyff US - RAISED PET" (`youtube.com/watch?v=gpyHG1aQopc`), "Flyff US - EGG
HATCHING" (`youtube.com/watch?v=EQq73GvKGtM`), "Flyff::Episode 37::Our New Pet!" (`youtube.com/watch?v=0MYta76aw6U`).

## 8. What FlyffWeb has today (main at 386a418, which already holds buffs-premium and ui-fixes-2026-11-05)

- **Reads every pet byte and throws it away.** Other players' `dwPetId` and name (`packages/protocol/src/world/addObj.ts:156-157`);
  every item's `CPet` and `m_bTranformVisPet` (`own.ts:161-163`, `skipPet` `:187-196`); the vis end times (`own.ts:183`);
  UPDATE_ITEM's PETVIS `dwTime` (`items.ts:34-37`). `m_dwMoverSfxId` is kept as `AddedMover.sfxId` (`addObj.ts:70`,
  `types.ts:539-540`) but never used. The own ADD_OBJ stops after the inventory (`own.ts:33-43`, `skipRest`), so the own
  summoned pet's slot (after the banks) is not read.
- **No pet packets.** None of the snapshot types in 2.4 or 4.2 has a reader (`world/readers.ts:53-168`). With the patched
  world server's table of contents (`server-patches/world-snapshot-index.patch`) an unknown type is skipped safely
  (`bundle.ts:160-166`); without it the rest of the bundle is lost (`bundle.ts:194-199`).
- **Pet items are blocked.** `premiumItems.ts:32-41` lists IK3 100, 120, 138 and the pet scrolls as `'noWindow'`, so the
  bag and task bar will not use them (`travelItems.ts:41-44`). The tooltip shows only the pet-kind line
  (`itemTooltip.ts:340-342`) and the pet awakening (`:532-539`).
- **Movers**: kinds are `player | monster | npc` (`WorldState.ts:62`); a pick-up pet would show as a clickable "monster"
  with its `movers.json` model. Generic follow (MOVERSETDESTOBJ) and DESTPOS already work (`moverRules.ts:513-518`,
  `:612-624`). `AII_PET`/`AII_EGG` are not defined; the pet exceptions are noted as left out (`render/TargetMarks.ts:83-84`,
  `sim/collision.ts:163`, `sim/moverRules.ts:15`).
- **Ground items and pick-up** work (`items/groundItems.ts`, `itemActions.ts:35-61`, CREATE_ITEM, DEL_OBJ), so a pick-up
  pet's loot already shows correctly.
- **Buffs**: the buff bar shows only `BUFF_SKILL`, `BUFF_ITEM`, `BUFF_ITEM2` (`hud/buffStatus.ts:29-30`, `:223`, `:285`);
  `BUFF_PET` (2) and `BUFF_EQUIP` (4) are dropped.
- **Quests**: end conditions on pet level or EXP are "unsupported, never met" (`quests/questRules.ts:14`,
  `formats/src/inc/propQuest.ts:240-241`), so the tamer's quests can never be finished in the browser.
- **Converter**: every `.o3d/.chr/.ani` becomes glb (`tools/convert/src/models/modelsStage.ts`), except
  `Mvr_PetManaUnicorn01.o3d` (its stored name differs, `docs/conversion-baseline.md:72`). `movers.json` has `ai`, `speed`,
  `model`; `itemProps.json` has kinds, `referStat1`, `exeTarget`, dest params, icon. **Not exported**: `nTextureEx`
  (parsed in `formats/src/inc/modelIndex.ts:137`, then dropped), `dwReferTarget1/2`, `pet.inc`. The 7 hatched pets' plain
  icon names have no file, but their `_00/_01/_02` files are converted (`conversion-baseline.md:140`).
- **Docs**: pets were out of scope so far (`2026-10-23-piece3-enter-world-design.md:307`, `device-testing.md:1372`,
  `2026-11-05-buffs-premium-research.md:85-93`, `2026-11-05-item-windows-research.md:57-58`).

## 9. Gaps and milestones

Small steps, each testable in the pretend world (`packages/testkit`) and then live.

**M0. Readers only (protocol).** Readers for PET_CALL, PET_RELEASE, PET_LEVELUP, PET_SET_EXP, PET, PET_STATE, PET_FEED,
PET_MILL, SET_PET_NAME, QUE_PETRESURRECTION_RESULT, VISPET_ACTIVATE, MOVER_CHANGESFX. Keep `CPet`, `m_bTranformVisPet`
and the vis end times in `InventoryItem`; keep other players' `dwPetId` and name in `AddedPlayer`; read the own ADD_OBJ
past the three banks to get the own `dwPetId` (a protocol task of its own: the bank containers, then stop before the
pocket, or read on). UPDATE_ITEM: the `UI_PETVIS_*` and `UI_TRANSFORM_VISPET` cases. No convert work. Testkit writers
for all of it.

**P1. Pick-up pets.** Let the bag and task bar use `IK3_PET` (plain DOUSEITEM, the server toggles). A mover kind or flag
for `AII_PET`/`AII_EGG` movers: name and bar at the screen position, motion speed rule, no collision, peaceful (a click
must not start an attack). Check every `MI_PET_*` model loads. Convert: none (maybe a check list of the 54 models).
Owner test: summon, it follows, it fetches drops, recall, teleport, time-out.

**R1. Raised pet in the world.** Use `IK3_EGG` from the bag (summon/recall). Make the client-side pet mover from
`m_dwPetId` (own: item's `CPet.GetIndex`; others: `LOWORD`), `CAIEgg` follow (1 m left or right), rebuild on level-up,
sounds, others' pets, not clickable unless own. Convert: export `nTextureEx` per model to `movers.json` and convert the
`-et01/-et02` textures (stages B-A and S look different only by texture); fix the `Mvr_PetManaUnicorn01` skip. The S
sparkle needs the `g_ParticleMng` port (particle kinds 13-23); it can wait.

**R2. Pet window and bag look.** `CWndPetStatus` (gauges, level text, stat, expanded step icons, 3D portrait with the
camera table), opened on summon; right-click own pet: status, release (`PET_RELEASE`). Bag icon by level (`_00/_01/_02`),
"cage" name, `PutPetInfo` tooltips, the faded slot, `BUFF_PET` icon in the buff bar. Convert: `pet.inc` to a small
`pets.json` (stat per kind, step values, max energy, EXP rates, kind cameras are code), `Icon_PetLevel*_S`, the two theme
pictures (check they are converted already).

**R3. Care.** Feed (food double-click sends `USE_PET_FEED`; messages), the tamer's food mill window
(`MMI_PET_FOODMILL`, `MAKE_PET_FEED`, feed maker item), life scroll confirm, hatch scroll and tamer's mistake
(`CWndCommItemDlg`), tamer's miracle window, tonic, feed pocket (+ turning it off), naming window and the tamer's rename
cancel. Quests: support `SetBeginCondPetLevel`, `SetEndCondPetLevel`, `SetEndCondPetExp` so `QUEST_PETTAME01-05` work.
Convert: the quest conditions in `quests.json`; window layouts from `resdata.inc` (already converted in general).

**B1. Buff pets.** Vis pet window (`APP_BUFFPET_STATUS`: 9 slots, drop with confirm, swap, remove), VISPET_ACTIVATE
opening it, the aura (`m_dwMoverSfxId` and MOVER_CHANGESFX: a looping effect linked to the mover; the `EffectRequest`
`followId`/`whileTrue` path may fit), `BUFF_EQUIP` icon, vis use, vis key, Pet Magic scroll, `PutVisPetInfo` and
`PutNeededVis` tooltips. Convert: `dwReferTarget1/2` into `itemProps.json`, the buff-pet background, the three
`sfx_buffpet` effects (check they are in `effectsIndex.json`).

**R4. Rare extras (optional).** Egg exchange (`APP_PET_TRANS_EGGS`, `TRANSFORM_ITEM`), pet awakening and its cancel window,
pet resurrection (`APP_PET_RES`).

**Suggested order:** M0, P1, R1, R2, R3, B1, R4. Pick-up pets first because the server does all the work and they are
the most common pet. Raised pets next because they change the player's stats. Buff pets last because they build on the
pick-up pet and need the most windows.
