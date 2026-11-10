# The Lord system (V15): research (2026-11-11)

The owner's request: "please do the lord system". This is the research for it: what the servers do, what Neuz shows, what
FlyffWeb needs. The C++ is CP949; line numbers are those of `iconv -f cp949 -t utf-8` output (the same lines). Paths are
from the outer repo (`Blouflash VS22 V15`): `Source/...`, `Resource/...`, `Database.sql`, `Client/...`.

## 0. The short answer

- **The Lord system is already compiled into every server and into Neuz.** Every Lord block is
  `#if __VER >= 12 // __LORD`, and `__VER` is 15. The `__LORD` define that is commented out
  (`Source/WORLDSERVER/VersionCommon.h:134`, `Source/Neuz/VersionCommon.h:124`, `Source/databaseserver/VersionCommon.h:73`)
  is a dead label: no file tests it (`grep -E "defined\s*\(\s*__LORD\s*\)|#\s*ifn?def\s+__LORD\b"` finds nothing in
  `Source`). Switching it on changes no binary. So the servers need **no Source change and no rebuild**.
- **The database objects exist, or the DB server would not start.** `CTLord::CreateColleagues` runs at start-up
  (`Source/databaseserver/DatabaseServer.cpp:338-341`) and calls `exit( -1 )` when any restore procedure fails
  (`Source/databaseserver/tlord.cpp:46-50`). All 17 procedures and 7 tables are in `Database.sql` (§4.2).
- **But the election can never reach the vote.** `uspElectionBeginVote` returns its row from `tblElection`
  (`Database.sql:5313-5330`: `SELECT top 1 nRequirement = 0 from tblElection ...`). `tblElection` is filled only by the
  SQL Agent job `usp_ElectionStat` (`Database.sql:14416-14436`, in `LOGGING_01_DBF`). With no job (SQL Express, or no
  Agent), the table is empty, the SELECT returns no row, `CLController::BeginVote` returns -1 (`tlord.cpp:672-681`),
  `DoTestBeginVote` fails (`tlord.cpp:419-431`) and the election stays in "candidacy" for ever, retried every minute
  (`tlord.cpp:533-550`). **The fix is SQL only:** make `uspElectionBeginVote` always return one row with 0 (the value Gala
  hard-coded).
- **Neuz has the windows; FlyffWeb has none.** The Lord Manager NPC (`MaFl_KINGAIDE`, Flarine) is placed in
  `Client/World/WdMadrigal/WdMadrigal.dyo`, and FlyffWeb already shows it with its five entries greyed. FlyffWeb skips the
  Lord messages today (the world-snapshot index lets it).

## 1. The election

### 1.1 Schedule and states

`Resource/election.inc` (read by the DB server only, `tlord.cpp:202-258`; sent to the world and the client inside the
`LORD` snapshot, §3):

| Setting | Value | Meaning |
|---|---|---|
| `nDayOfWeek` | 6 | start day, 1 = Sunday (`election.inc:3-4`): **Friday** |
| `nHour` | 0 | start hour: 00:00 |
| `tCandidacy` | 86400 | candidacy lasts 24 h (Friday) |
| `tVote` | 172800 | vote lasts 48 h (Saturday, Sunday), ends Monday 00:00 |
| `nDays` | 14 | one election every 2 weeks |
| `rate` | 1.0, 1.0, 0.8, 0.6, 0.4, 0.2, 0, 0, 0, 0, **0.98** | deposit returned by final rank 1-10; the 11th value for a bidder left out of the top 10 (`election.inc:11-24`) |
| `fRequirementFactor` | 0.1 | minimum votes = 10 % of `tblElection.chrcount` (§1.4) |
| `item 0` / `item 1` | 7 items each | the Lord's items, male / female (`election.inc:28-48`) |

States (`IElection::ELECTION_STATE`, `Source/_Common/lord.h:56`): `eReady` 0, `eCandidacy` 1, `eVote` 2, `eExpired` 3.

- `IElection::GetNextBegin` (`lord.cpp:184-200`): the first election starts at the next `nDayOfWeek` `nHour` after now;
  later ones `nDays` after the last begin.
- `IElection::GetPropertyState` (`lord.cpp:202-219`): from the clock: before the begin `eReady`, then `eCandidacy` for
  `tCandidacy`, `eVote` for `tVote`, then `eExpired`.
- The DB server's Lord thread ticks **once a minute** (`CLController` is made with `CreateDbHandler( MIN( 1 ) )`,
  `tlord.cpp:33`; the "once a second" comment at :151 is stale). `CTElection::OnTimer` (`tlord.cpp:533-550`) moves the
  state one step when it differs from `GetPropertyState`: Ready → `BeginCandidacy`, Candidacy → `BeginVote( 0 )`,
  Vote → `EndVote( 0 )`. It is off on `__INTERNALSERVER` builds (`tlord.cpp:177-186`); the owner's DB server defines
  `__MAINSERVER` (`databaseserver/VersionCommon.h:4-7`), so it runs.
- On start, `CTElection::Restore` (`tlord.cpp:286-330`) reads the last election and its candidates; with none, or an
  expired one, it prepares the next (`PrepareNext`, `lord.cpp:261-267`: state Ready, candidates cleared, next begin,
  id + 1) and stores it (`uspElectionInitialize`).

### 1.2 Registering: the bid (deposit)

- The client sends the **total** it wants to have bid (`CWndLordTender::OnChildNotify`, `_Interface/WndLord.cpp:426-454`:
  `atol` of the box into a `DWORD`; at least 100,000,000 or `TID_UPGRADE_ERROR_NOMONEY` in a box; then
  `SendElectionAddDeposit`).
- The world checks (`election::AddDepositRequirements`, `WORLDSERVER/slord.cpp:147-171`), in order:
  Master or Hero (`TID_GAME_ELECTION_ADD_DEPOSIT_E001`); total ≥ `nMinDeposit` 100,000,000 (`lord.h:25`, E002);
  state is candidacy (E004); total > the old bid (E003); not already querying (`TID_GAME_LORD_IS_QUERYING`);
  the difference ≤ `INT_MAX` and ≤ the player's penya (E002); the difference ≥ 10,000,000 (E005). It then takes the
  difference (`CDPSrvr::OnElectionAddDeposit`, `DPSrvr.cpp:9032-9051`) and asks the DB server.
- The DB server stores it (`uspElectionAddDeposit`) and answers every world (`CTElection::DoTestAddDeposit`,
  `tlord.cpp:454-462`); on failure the world gives the penya back (`DPDatabaseClient.cpp:3303-3326`).
- Every client gets `ELECTION_ADD_DEPOSIT` (§3); the bidder sees `TID_GAME_ELECTION_ADD_DEPOSIT_S001` (more on an old bid:
  old, added, total) or `_S002` (first bid) in a box, and `_S003` in the chat (`Neuz/clord.cpp:123-138`).
- Candidates are kept sorted by deposit, then by `tCreate` (`DepositCompare`, `lord.h:144-153`).

### 1.3 The pledge

- Only during the **vote** (`election::SetPledgeRequirements`, `slord.cpp:173-196`): a candidate (else
  `TID_GAME_ELECTION_SET_PLEDGE_E001`), state vote (E003). The first pledge is free; a change costs
  `nSetPledgeCost` 1,000,000 (`lord.h:25`, E002 when short). Up to 255 bytes (`nMaxPledgeLen`, `lord.h:25`).
- In Neuz the candidate opens their own line in the candidate list (`APP_LORD_STATE`), double-clicks the text to edit it
  (`CWndLordPledge::OnCommand`, `WndLord.cpp:244-260`: only their own), and presses OK (`:271-304`): a first pledge is sent
  at once; a change opens `APP_LORD_CONFIRM` with `TID_GAME_MOD_PLEGDE` (1,000,000 penya, OK / Cancel, `:875-901`).
- Over 255 characters: `TID_GUILD_NOTICE_ERROR` in a box (`:280-284`).

### 1.4 Voting and the result

- `BeginVote` (`lord.cpp:227-240`): state vote; past 10 candidates, the rest get 98 % back by mail
  (`CTElection::DoReturnDeposit`, `tlord.cpp:410-417`, `PostDeposit`, :352-408, as penya plus Perins) and are dropped.
  The requirement is `nRequirement` × 0.1, where the stock procedure returns 0 (§0).
- Neuz shows every candidate `TID_GAME_ELECTION_BEGIN_VOTE_S001` in a box, and captions `..._CAPTION_BEGIN_VOTE_01/02`
  (`clord.cpp:82-95`).
- A vote (`election::IncVoteRequirements`, `slord.cpp:198-215`): the name is a candidate (E001), state vote (E002),
  level ≥ 60 (`nLevelRequirements`, `lord.h:57`, E003), not querying, not voted in this election (`CUser::GetElection`,
  E004). The DB keeps one vote per character per election (`uspElectionIncVote`, `Database.sql:5257-5280`). The voter
  gets the `II_SYS_SYS_VOTE_THANKS` buff (`DPDatabaseClient.cpp:3371-3377`: EXP and drop × 1.05, `MoverParam.cpp:4133`,
  :4261) and Neuz shows `TID_GAME_VOTE_COMPLETE` and closes the vote window (`clord.cpp:151-163`).
- In Neuz the voter **types the candidate's name** in the box and presses OK (`CWndLordVote::OnChildNotify`,
  `WndLord.cpp:551-596`); the list's click that filled the box is commented out (:560-572). A name that matches no
  candidate sends nothing.
- `EndVote` (`lord.cpp:242-259`): sorted by votes, then `tCreate` (`VoteCompare`, `lord.h:156-165`); the first wins when
  the total votes ≥ the requirement (`GetResult`, :335-342), else nobody (`NULL_ID`). The Lord is set, the skills' cool
  downs reset, the next election prepared. The DB server mails every candidate their rate of the deposit
  (`PostDepositToAllCandidate`, `tlord.cpp:448-452`) and the Lord the 7 items for 14 days (`PostLordItems`, :492-514).
- Neuz captions `TID_GAME_ELECTION_CAPTION_END_VOTE_01` and `_02` (the name), and puts `TID_GAME_ELECTION_END_VOTE_S000`
  (elected for 2 weeks) or `_S001` (no Lord) in the chat (`clord.cpp:97-121`). A player who is not the Lord loses every
  Lord-skill shortcut and the Lord skill and event windows close (`clord.cpp:170-206`).

### 1.5 How the servers run it

| Server | Part | Where |
|---|---|---|
| DatabaseServer | the clock, the store, the mail: `CTLord` + `CTElection` + `CLEvent` + `CTLordSkill`, one thread (`CLController`) | `databaseserver/tlord.cpp`, `DatabaseServer.cpp:338-341`, `dptrans.cpp:155-176`, :1694-1840 |
| WorldServer | the checks, the penya, the buffs, the teleports, and the broadcasts to players: `CSLord` | `WORLDSERVER/slord.cpp`, `lordskillexecutable.cpp`, `DPSrvr.cpp:451-457`, :9031-9168, `DPDatabaseClient.cpp:143-156`, :3302-3530, `User.cpp:8160-8335` |
| CoreServer | nothing of its own; the shout colour field only | `WORLDSERVER/DPCoreClient.cpp:771-773` |
| Neuz | the windows and the messages: `CCLord` | `Neuz/clord.cpp`, `_Interface/WndLord.cpp`, `Neuz/DPClient.cpp:753-778`, :17782-17938 |

The world gets the whole Lord state from the DB server when it connects (`CTLord::Handler` `eInit` → `SendLord`,
`tlord.cpp:117-120`; `CDPDatabaseClient::OnLord`, `DPDatabaseClient.cpp:3412-3416`) and every player gets it on entering
(`CUser::AddLord` in the join, `User.cpp:341-343`, :8161-8168).

## 2. The Lord's powers

### 2.1 Lord skills

`Resource/lordskill.txt` (names `Resource/lordskill.txt.txt`), read by all three (`CLordSkill::Initialize`,
`_Common/lordskill.cpp:120-155`). Columns: id, type, name, description, target, item (the buff), cool down in **minutes**,
icon, passive, src sfx, dst sfx, range.

| Id | Skill | Type | Target | Buff item | Cool down | Icon |
|---|---|---|---|---|---|---|
| 0 | Lord's Cheer: EXP and drop × 1.1 (`MoverParam.cpp:4131`, :4259) | item buff | self or other | `II_SYS_SYS_LS_CHEERING` | 60 | `skill_sklKing01.dds` |
| 1 | Lord's Blessing: attack and defence up | item buff | both | `II_SYS_SYS_LS_BLESSING` | 60 | `skill_sklKing02.dds` |
| 2 | Lord's Love: all stats + 15 | item buff | both | `II_SYS_SYS_LS_LOVE` | 60 | `skill_sklKing03.dds` |
| 3 | Lord's Shout: shouts in green `0xff00ff00` (`FuncTextCmd.cpp:1836-1839`) | item buff | self | `II_SYS_SYS_LS_SHOUT` | 60 | `skill_sklKing04.dds` |
| 4 | Lord's Anger: no chat (`CUser::GetMuteText`, `User.cpp:8170-8177`; not on a GM, `lordskill.cpp:204-206`) | item buff | other | `II_SYS_SYS_LS_RAGE` | 120 | `skill_sklKing05.dds` |
| 5 | Lord's Call: summons a player to the Lord | summon | other (by name) | - | 60 | `skill_sklKing06.dds` |
| 6 | Lord's Teleport: the Lord goes to a player | teleport | other (by name) | - | 10 | `skill_sklKing07.dds` |
| 7 | Lord's Party: party skills last 4 × as a party leader (`party.cpp:340-346`) | passive | - | - | 0 | `skill_sklKing08.dds` |

- Range 8 m for 0-2 (`lordskill.txt:2-4`), none for the rest.
- Checks (`CLordSkillComponentExecutable::IsExecutable`, `lordskill.cpp:184-209`): the Lord (`TID_GAME_LORD_SKILL_USE_E001`),
  not passive (E003), the target online and (other) not self (E004), in range (E008). Call and Teleport add
  `IsTeleportable` (`:211-221`): not a GM (E004), the Lord (E009) and the target (E010) not in a guild war, dungeon,
  secret room, instance... (`CUser::IsTeleportable`, `User.cpp:8188-8212`).
- The DB server refuses a skill still cooling (E005) and stores the tick (`databaseserver/lordskillexecutable.cpp:18-33`).
  Each minute it takes one off every cooling skill and sends the ticks; the world passes them to the Lord only
  (`DPDatabaseClient.cpp:3470-3481`).
- The world then runs it (`WORLDSERVER/lordskillexecutable.cpp:14-71`) and tells everyone around the Lord
  (`CUserMng::AddLordSkillUse`, `User.cpp:8307-8318`). Neuz then turns the Lord to the target, plays `MTI_ATK1`, and the
  src and dst effects (`DPClient.cpp:17870-17901`).
- **Using them** (Neuz): the Lord Skill window (`APP_LORD_SKILL`, the `L` key, `FuncApplet.cpp:166-171`; not the Lord: a
  box `TID_GAME_L_EVENT_CREATE_E001`, `WndLord.cpp:736-746`) shows the 8 icons with name and description tips
  (`:850-872`). They are **dragged to the task bar** (`SHORTCUT_LORDSKILL` 11, id = skill id: `WndLord.cpp:827-848` sets
  `m_dwId = index + 1`, `WndTaskBar.cpp:1650-1653` takes one off). A shortcut press (`WndManager.cpp:2882-2920`):
  Call and Teleport (still cooling: `TID_GAME_STILLNOTUSE`) open `APP_LORD_SKILL_CONFIRM` for the name
  (`WndLord.cpp:943-1007`); the others go to the focused player, or to the Lord with no focus. The shortcut draws the
  cool down as a radar (`WndTaskBar.cpp:2845-2853`) and its tip adds `TID_TOOLTIP_COOLTIME` (`:607-631`).

### 2.2 Lord events

`Resource/lordevent.inc`: two tables of (rate, penya). EXP: 0-50 % in 5 % steps, 100,000,000 penya a step; drop: 0-50 %,
300,000,000 a step. The cost is the sum of the two rows (`ILordEvent::GetCost`, `lord.cpp:484-491`); 0/0 costs 0 and is
refused (`TID_GAME_L_EVENT_CREATE_E004`).

- Only the Lord, one event of theirs at a time (`lordevent::CreateRequirements`, `slord.cpp:221-238`: E001, E002, querying,
  E004, short of `GetTotalGold` = penya + Perins: E003). The world takes the cost from penya and Perins
  (`DPSrvr.cpp:9125-9147`).
- An event lasts 60 ticks = **60 minutes** (`ILordEvent::eTick`, `lord.h:205`). Each running event adds its rates:
  EXP × (1 + Σ e), drop × (1 + Σ i) (`lord.cpp:566-580`, `MoverParam.cpp:4128-4130`, :4256-4258).
- Neuz on start: a caption (`TID_GAME_L_EVENT_CREATE_S001`-`S003` by kind) and a line in the chat (`S004`-`S006`, the
  Lord's name and the %), `clord.cpp:263-294`. While it runs, its icon (`Skill_TroGiftbox02.dds`) sits after the buffs
  with the tip `TID_GAME_LORD_EVENT_TOOLTIP` and the minutes left (`WndWorld.cpp:10749-10785`).
- The Event window (`APP_LORD_EVENT`, MMI 94, Lord only): two rows with ◄ ► buttons for EXP % and drop %, the cost with
  thousands commas, Start (`WndLord.cpp:599-679`). Neuz bug kept: the drop row's ► wraps by the EXP table's size (:641);
  both tables have 11 rows, so it does not show.

### 2.3 The Lord's mark

- **The honour title "Lord"** (`HS_LORD`): the world sets its count to 1 while the player is the Lord
  (`CMover::CheckHonorStat`, `_Common/Mover.cpp:11493-11497`), so the Lord can pick it; it shows above the name as other
  titles (`CMover::RenderName`). FlyffWeb already draws titles (`render/nameTags.ts:84-134`); picking one needs the
  Honour window (`CWndHonor`), which FlyffWeb does not have yet.
- **The green shout** while Lord's Shout runs (§2.1): FlyffWeb already reads the shout colour (`readShout`,
  `packages/protocol/src/world/chat.ts:16`).
- **The items** mailed on election (`election.inc:28-48`): the Majesty set, the Yeti pet, the Majesty cloak and bike.
- There is no name colour of its own.

## 3. The packets

Numbers from `Source/_Network/MsgHdr.h:755-767` (packets) and :1226-1239 (snapshot messages). Win32 build with
`_USE_32BIT_TIME_T` in every `StdAfx.h`: `time_t` and `size_t` are 4 bytes. Strings are `CAr::WriteString`
(`int` length + bytes).

### 3.1 Client → world

| Packet | Id | Fields | Neuz sender | World handler |
|---|---|---|---|---|
| `ELECTION_ADD_DEPOSIT` | `0x8FFF0000` | `i64` total | `DPClient.cpp:17903-17908` | `DPSrvr.cpp:9032-9051` |
| `ELECTION_SET_PLEDGE` | `0x8FFF0001` | string pledge (≤ 255) | :17910-17915 | :9083-9105 |
| `ELECTION_INC_VOTE` | `0x8FFF0002` | `u32` candidate id | :17917-17922 | :9107-9123 |
| `L_EVENT_CREATE` | `0x8FFF0008` | `i32` EXP row, `i32` drop row | :17924-17929 | :9125-9147 |
| `LORD_SKILL_USE` | `0x8FFF0009` | `i32` skill, string target name (≤ 32) | :17931-17936 | :9149-9167 |

Each is `BEFORESENDSOLE` (the packet type, then the fields).

### 3.2 World → client (snapshot messages, object id `NULL_ID` except `LORD_SKILL_USE`)

| Message | Id | Fields | Neuz reader |
|---|---|---|---|
| `ELECTION_ADD_DEPOSIT` | `0x8F00` | `u32` player, `i64` deposit added, `i32` tCreate | `DPClient.cpp:17783-17792` |
| `ELECTION_SET_PLEDGE` | `0x8F01` | `u32` player, string pledge | :17794-17803 |
| `ELECTION_INC_VOTE` | `0x8F02` | `u32` candidate, `u32` voter | :17805-17812 |
| `ELECTION_BEGIN_CANDIDACY` | `0x8F03` | - | :17814-17818 |
| `ELECTION_BEGIN_VOTE` | `0x8F04` | `i32` requirement | :17820-17827 |
| `ELECTION_END_VOTE` | `0x8F05` | `u32` Lord id (`NULL_ID`: none) | :17829-17836 |
| `LORD` | `0x8F06` | the whole state, below | :17838-17841 |
| `L_EVENT_CREATE` | `0x8F08` | a component: `i32` tick, `u32` player, `f32` e, `f32` i | :17843-17849 |
| `L_EVENT_INITIALIZE` | `0x8F09` | - | :17851-17855 |
| `LORD_SKILL_TICK` | `0x8F0A` | `u32` n, n × (`i32` skill, `i32` tick) | :17857-17861 |
| `L_EVENT_TICK` | `0x8F0B` | `u32` n, n × (`u32` player, `i32` tick); then drop those at 0 | :17863-17868 |
| `LORD_SKILL_USE` | `0x8F0D` | object = the Lord; `u32` target id, `i32` skill | :17870-17901 |

`LORD` (`CLord::Serialize`, `lord.cpp:361-371`):

```
u32 idLord                                         (NULL_ID 0xffffffff: none)
election (IElection::Serialize, lord.cpp:151-177):
  u32 idElection, i32 state, i32 tBegin, i32 nRequirement
  property (lord.cpp:56-95): i32 nDayOfWeek, i32 nHour, i32 tCandidacy, i32 tVote, f32 fRequirementFactor, i32 nDays,
    u32 n, n × f32 rate;  2 × ( u32 n, n × i32 item )
  u32 n, n × candidate (lord.cpp:39-53): u32 idPlayer, i64 deposit, i32 votes, i32 tCreate, string pledge
event (ILordEvent::Serialize, lord.cpp:582-602): u32 n, n × (i32 tick, u32 player, f32 e, f32 i)
skills (CLordSkill::SerializeTick, lordskill.cpp:157-181): u32 n, n × (i32 skill, i32 tick)
```

The client runs the same `IElection` steps on each message (`AddDeposit` re-sorts, `IncVote` adds one, `BeginVote` keeps
10, `EndVote` sorts by votes and sets the Lord); FlyffWeb does the same.

Other messages that touch it: `SHOUT` ends with a `DWORD` colour (`User.cpp:4450-4452`, already read); `QUERY_PLAYER_DATA`
for the new Lord (`CUserMng::AddQueryPlayerData`, `User.cpp:8320-8333`, already read). Names, levels and jobs of
candidates come from the player-data store (`CPlayerDataCenter`), as Neuz uses it (`WndLord.cpp:97-101`, :483-489).

### 3.3 World ↔ DB (server-side only)

`PACKETTYPE_ELECTION_*`, `LORD`, `L_EVENT_*`, `LORD_SKILL_*` in both directions: `WORLDSERVER/DPDatabaseClient.cpp:3302-3530`
and `databaseserver/dptrans.cpp:155-176`, :1694-1840. GM commands go the same way (§5).

## 4. The database

### 4.1 Tables (`CHARACTER_01_DBF`)

`tblLord` (`Database.sql:2155-2165`), `tblLordElection` (:2117-2133), `tblLordCandidates` (:2134-2154), `tblLordElector`
(:2105-2116), `tblLordEvent` (:2091-2104), `tblLordSkill` (:2079-2090), `tblElection` (:2353-2364); defaults at
:12851, :12908-12950.

### 4.2 Procedures (all in `Database.sql`)

`uspRestoreLord` :4387, `uspRestoreElection` :4414, `uspRestoreCandidates` :4281, `uspRestoreLEvent` :4401,
`uspRestoreLordSkill` :4374, `uspElectionInitialize` :5242, `uspElectionBeginCandidacy` :5332, `uspElectionBeginVote`
:5313, `uspElectionEndVote` :5286, `uspElectionAddDeposit` :5355, `uspElectionSetPledge` :5202, `uspElectionIncVote`
:5257, `uspElectionLeaveOut` :5219, `uspAddLEComponent` :5762, `uspInitializeLEvent` :4907, `uspLordSkillTick` :4842,
`uspLordEventTick` :4866. Callers: `tlord.cpp:168`, :288, :300, :323, :389, :566, :668-742, :763.

### 4.3 What the SQL script does (outer repo, branch `lord`)

`BB_LordSystem.sql` + `BB_LordSystem.ps1`: creates any missing table, default or procedure as `Database.sql` has it,
and replaces `uspElectionBeginVote` with one that always returns one row (`nRequirement = 0`). The runner reports by
default and changes only with `-Apply`.

## 5. Switches and GM commands

- `__LORD`: dead (§0). Nothing to switch on. `__MAINSERVER` keeps the DB server's election clock on (§1.1).
- GM commands (administrator, `FuncTextCmd.cpp:5396-5412`), useful to test without waiting for Friday:
  `/ebc` (begin candidacy), `/ebv` (begin vote), `/eev` (end vote), `/ep 0|1` (stop or run the clock), `/lecreate e i`,
  `/leinitialize`, `/er` (votes / requirement, Neuz only).

## 6. The windows (Neuz) and their layout

All open centred (`MoveParentCenter`), tile `WndTile00.tga`. The NPC menu (`MaFl_KINGAIDE`, `Resource/character.inc:6903-6926`,
"Lord Manager", picture `char_Secretary.TGA`): `MMI_LORD_STATE` 91, `TENDER` 92, `VOTE` 93, `EVENT` 94, `INFO` 101
(`Resource/defineNeuz.h:195-210`; `RPINFO` 102 is commented out of the menu); `CWndWorld::OnCommand`
(`WndWorld.cpp:5182-5212`) deletes an open one and makes a new one.

| Window | APP id | resdata.inc | Size | Controls (rect = left, top, right, bottom) |
|---|---|---|---|---|
| Bid (`CWndLordTender`) | `APP_LORD_TENDER` 718 | :17826 | 304 × 576 | STATIC1 "Current application fee" (8,8,144,24); EDIT1 (154,8,284,26) the total; STATIC2 "Bid Info." (8,44,144,60); TEXT1 (8,68,290,220) `Client/Client/lordcandidate.inc`; STATIC3 "Bid Rank" (8,232,144,248); STATIC4 "Rank" (16,258,70,274); STATIC5 "Character name" (76,258,212,274); TEXT2 (8,280,290,504) the bidders "  rank  name"; BUTTON1 `ButtAccept.tga` (56,516,130,536); BUTTON2 `ButtClose.tga` (160,516,232,536) |
| Candidates (`CWndLordState`) | `APP_LORD_STATE` 722 | :18039 | 432 × 320 | STATIC7 "* Minimum number of voting people condition(Live) :" (8,8,232,24); WIDC_LIVE (232,8,328,24) `TID_GAME_LORD_MINREQ_OK`/`_NO`; headers Rank (20,34), Character name (74,34), Class (232,34), Pledge (324,34); LISTBOX1 (12,56,408,252) 10 rows of 16 px: "rank name" at +15, class at +220, "open" at +313, the chosen row in ARGB(60,240,0,0); BUTTON1 `ButOk2.bmp` (168,260,240,280) closes |
| Pledge (`CWndLordPledge`) | `APP_LORD_PLEDGE` 720 | :18141 | 304 × 272 | TEXT1 / EDIT1 (8,8,288,200) the pledge (the edit only for the candidate, after a double click); BUTTON2 `ButOk2.bmp` (114,210,186,230) |
| Pledge change (`CWndLordConfirm`) | `APP_LORD_CONFIRM` 738 | :20985 | 336 × 160 | TEXT1 (8,8,320,82) `TID_GAME_MOD_PLEGDE`; OK `ButtOk.tga` (80,92,152,112); Cancel `ButtCancel.tga` (172,92,244,114) |
| Vote (`CWndLordVote`) | `APP_LORD_VOTE` 724 | :20013 | 352 × 288 | headers Level (18,10), Name (74,10), Class (238,10); LISTBOX1 (10,32,330,204) rows: level +15, name +60, class +220; EDIT1 (20,218,200,238) the name; BUTTON1 `ButOk2.bmp` (228,216,300,238) |
| Event (`CWndLordEvent`) | `APP_LORD_EVENT` 726 | :20079 | 320 × 208 | "Exp Up Event" (8,28,136,44), ◄ `Buttleft2.bmp` (138,26,180,46), TEXT1 (182,24,258,48) "  N %", ► `Buttright2.bmp` (258,26,300,46); "Drop Up Event" (8,60,136,76), ◄ (138,58,180,80), TEXT2 (182,56,258,80), ► (258,58,300,78); "Penya" (8,102,74,118), TEXT3 (62,96,294,120) the cost; BUTTON5 `ButtStart.bmp` (126,138,192,158) |
| Lord Skill (`CWndLordSkill`) | `APP_LORD_SKILL` 728 | :17937 | 192 × 272 | TEXT1 (8,8,176,68) `TID_GAME_LORD_SKILL_INFO`; 32 px icons at (18,90) (74,90) (128,90) / (18,138) (74,138) (128,138) / (18,190) (74,190); CUSTOM9 (128,190) empty |
| Call / Teleport name (`CWndLordSkillConfirm`) | `APP_LORD_SKILL_CONFIRM` 736 | :21024 | 272 × 208 | TEXT1 (8,8,256,96) `TID_GAME_LORD_SKILL_CONFIRM1`/`2`; EDIT1 (8,110,248,134); OK `ButtOk.tga` (98,146,170,166) |
| Lord info (`CWndLordInfo`) | `APP_LORD_INFO` 756 | :22836 | 304 × 320 | "Status" (8,8,112,24) → STATIC4 (132,8,280,24) `TID_GAME_LORD_STATUS_*`; "Lord" (8,36,112,52) → STATIC5 the name; "Remaining time..." (8,64,112,80) → STATIC6 `TID_TOOLTIP_DATE` to the vote's end; TEXT1 (8,98,290,242) `Client/Client/lordInfo.inc`; OK `ButOk2.bmp` (112,254,184,274) |
| Refund info (`CWndLordRPInfo`) | `APP_LORD_INFO2` 758 | :22806 | 400 × 304 | TEXT1 (10,12,386,236) `lordrpInfo.inc`; OK (160,244,232,264). Not in the NPC menu |

Every picture is already in FlyffWeb's converted UI (`dist/assets/ui`: `buttaccept`, `buttclose`, `butok2`, `buttok`,
`buttcancel`, `buttleft2`, `buttright2`, `buttstart`, `wndedittile00`, `wndedittile200`, `wndtile00`,
`skill_sklking01`-`08`, `skill_trogiftbox02`, `char/char_secretary`), and every TID text is in `data/texts`. The three
`Client/Client/lord*.inc` help texts are short and go in the code as constants (as the pet windows do). **No convert.**

## 7. Online (wiki and guides)

From `flyff-wiki.gpotato.com.br/wiki/Lord_System.html`, `flyffwiki.com/lord-system/`, a 2008 Gala press release
(`forums.mmorpg.com/discussion/200483`) and a fandom search snippet. They agree with the code on the schedule
(Friday bids, weekend vote, 2-week term), the 100 M minimum, Master/Hero only, level 60 voters, the refund table, the
1 M pledge change, the voter buff (105 %), the skills and their cool downs, the 1-hour events and the items.
Where they differ, **the code wins**:

- Event prices: one guide gives "EXP 10 % = 100 M"; `lordevent.inc` says 5 % = 100 M, 10 % = 200 M.
- Minimum turnout: the 2008 text says 10 %; the stock SQL makes it 0 (§0), as the newer wiki says.
- The NPC is "Lord Manager" in the owner's data (some pages say "Lord Aide").
- No page names the windows or a name colour; the code has the title and the green shout (§2.3).

## 8. FlyffWeb today and what it needs

Today: the Lord Manager's menu shows its five entries greyed (`hud/moverMenu.ts`); the `LORD*`/`ELECTION*` messages are
skipped; `SHORTCUT_LORDSKILL` 11 is known to the task-bar reader (`packages/protocol/src/constants.ts:414`); the
`APP_LORD_SKILL` applet is listed with its `L` key (`hud/applets.ts:49`) but opens nothing; the shout colour and honour
titles work.

To build:

1. **protocol** (`world/lord.ts`): the 12 readers of §3.2 and the 5 encoders of §3.1; testkit writers for each.
2. **model** (`lord/lordState.ts`): `CCLord` in TypeScript: the election with the same steps and sorts, the events, the
   skill ticks, the 8 skills and the event table from `lordskill.txt` and `lordevent.inc`.
3. **windows** (`hud/lord/lordWindows.ts`), laid out from §6 with `ResWindow`: Info, Bid, Candidates (+ Pledge,
   Pledge change), Vote, Event, Lord Skill, Call/Teleport name. The NPC entries 91-94 and 101 enabled.
4. **HUD**: the event icon after the buffs with its tip and minutes; captions and chat lines and boxes of §1-2; the
   Lord-skill shortcut on the task bar (icon, cool-down radar, press as `WndManager.cpp:2882-2920`), the `L` key.
5. **Phone** (landscape): each window as a panel like the guild / bank / trade ones; taps in place of drags and double
   clicks (a tap on a skill puts it on the next free task-bar slot; the candidate's own pledge has an Edit button);
   the vote list's tap fills the name (Neuz needs typing; the box stays); buttons ≥ 40 px, text ≥ 14 px.
6. **Tests**: vitest for the readers/writers and the model; one Playwright spec (desktop + landscape phone) through the
   Lord Manager's menu with the server stand-in.
