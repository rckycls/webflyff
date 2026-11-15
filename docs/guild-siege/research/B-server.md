# Guild Siege, server side (V15, our build) — 2026-11-15

Read-only research. Line numbers are those of the files in the outer repo (`Source/` is CP949; read with
`iconv -f cp949 -t utf-8`, line numbers kept). `eve.cpp` below = `Source/_Common/eveschool.cpp`.

## 1. Is it on?

| What | Where | Value |
|---|---|---|
| Version | `Source/WORLDSERVER/VersionCommon.h:3-4` | `__MAINSERVER`, `__VER 15` |
| Siege code | `CGuildCombat` in `Source/_Common/eveschool.h:67-320`, `eveschool.cpp` | compiled in (no own `#define`; most gates are `#if __VER >= 8/11/15`) |
| `__S_BUG_GC` (vector of guilds, tie fix) | `WORLDSERVER/VersionCommon.h:58`, `databaseserver/VersionCommon.h:34`, `Neuz/VersionCommon.h:50` | on |
| `__GUILDCOMBATCHIP` (red-chip reward) | commented at `WORLDSERVER/VersionCommon.h:81`, but code uses `#if __VER >= 11` (`eve.cpp:1449`, `:2674`) | on |
| `__IMPROVE_SYSTEM_VER15` (party removal on entry) | commented `WORLDSERVER/VersionCommon.h:213`, code uses `#if __VER >= 15` (`eve.cpp:724`, `:2271`) | on |
| World .ini flag | `Program/WorldServer.ini:20` `GUILDCOMBAT` (`:21` `GUILDCOMBAT1TO1`) -> `WorldServer.cpp:573-575` `EVE_GUILDCOMBAT` | on |
| Rules file | `ThreadMng.cpp:275` loads `GuildCombat.txt` from `ResourceFolder "..\Resource"` (`Program/WorldServer.ini:1`) | `Resource/GuildCombat.txt` |
| Siege map in the server's world list | `Resource/World.inc:12` `WI_WORLD_GUILDWAR "WdGuildWar"` (owner's uncommitted copy still lists it) | yes |
| Process tick | `ThreadMng.cpp:416` `g_GuildCombatMng.Process()` | every world tick |

## 2. The rules file `Resource/GuildCombat.txt` (all script, no code)

| Key | Line | Value | Read at |
|---|---|---|---|
| JOINPENYA (minimum bid) | 15 | 100,000,000 | `eve.cpp:3076-3079` |
| GUILDLEVEL (minimum guild level) | 18 | 20 | `eve.cpp:3080-3083` |
| MINJOINGUILDSIZE | 21 | 3 | |
| MAXJOINGUILDSIZE | 24 | 8 | |
| MAXPLAYERLIFE (lives per fighter) | 27 | 6 | |
| MAXJOINMEMBERSIZE (line-up size) | 30 | 10 | |
| MAXWARPLAYER (fighters inside at once) | 33 | 5 | |
| MAXMAPTIME (seconds to pick a start point) | 36 | 10 | |
| ITEMPENYA | 39 | 1000 (unused since `__VER >= 8`, `DPSrvr.cpp:5444`) | |
| MAXGUILDPERCENT / MAXPLAYERPERCENT (penya prize %) | 42 / 45 | 0 / 0 (no penya prize) | |
| REQUESTCANCLEPERCENT (refund when the guild cancels) | 48 | 80 | |
| NOTREQUESTPERCENT (refund when outbid) | 51 | 98 (by mail to the master, `DPDatabaseClient.cpp:515-528`) | |
| GCSENDITEM win-streak items | 53-77 | all commented out (no items) | |
| AUTO_OPEN_IDC (used by `__MAINSERVER`) | 82-85 | `7 18 30` = Saturday 18:30 | `eve.cpp:2985-3029` |
| AUTO_OPEN_TEST (test servers only) | 87-96 | every day 17:00 (not used by us) | `eve.cpp:3030-3074` |
| OPEN script (14 steps) | 98-132 | see §3 | `eve.cpp:3153-3215` |

## 3. Schedule and phases

**Clock:** `CTime::GetCurrentTime()` = the machine's local time (`eve.cpp:2765`). The VPS is set to
"Singapore Standard Time" (UTC+8, same as Manila) by `deploy/1-Install-Prerequisites.ps1:20, :131-133`. So script times
are PH times.

**How the open works:** one slot per weekday: `__AUTO_OPEN __AutoOpen[7]` indexed by day (`eveschool.h:60-71`).
`LoadScript` writes `__AutoOpen[nDay-1]` (`eve.cpp:3007-3023`), so a second line for the same day **overwrites** the
first; at most 7 lines (`eve.cpp:2994-2997`). `Process()` opens when hour and minute match and at least
MINJOINGUILDSIZE guilds applied (`eve.cpp:2763-2797`); otherwise it broadcasts "next time" and waits 60 s.
**=> Twice a day is not possible by script. Once a day, every day, is possible by script** (7 lines).
`GetNextGuildCobmatTime()` (`eve.cpp:2097-2120`) only knows `m_nDay` = the **last** day listed, so the "time to the next
siege" in the status window would be wrong with more than one day (stock bug; also adds `m_nDay` days instead of 7 at
`:2111`). Used by `User.cpp:6828` (GC_REQUEST_STATUS) only (the `DPSrvr.cpp:5488` use is `__VER < 8`, dead).

**The OPEN steps** (`GuildCombat.txt:117-132`, run by `ProcessCommand`, `eve.cpp:2856-2967`), from the open time T:

| Step | Wait | State | What happens |
|---|---|---|---|
| WORLDMSG 2706 | 5 s | | "open ready" message to world 202 |
| WARSTATE 101 | 60 min | NOTENTER_COUNT_STATE | everyone in world 202 is sent to Flaris (`eve.cpp:2873-2877`); **line-up time**: masters/kingpins pick fighters (`DPSrvr.cpp:5230`) |
| WARSTATE 102 | 0 | ENTER_STATE | `SetEnter()`: "you can enter" + a teleport offer (GC_TELE) to every line-up player (`eve.cpp:2414-2466`) |
| ALLMSG 2710 | 7 min | | open message to all; entry time sent (`eve.cpp:2911-2913`) |
| STATE 2 | 0 | WAR_STATE | |
| WARSTATE 103 | 1 min | MAINTENANCE_STATE | `SetMaintenance()`: first 5 of each line-up who are inside get the start-point window; absent ones lose a life; < 3 guilds with a line-up => siege cancelled (`eve.cpp:2207-2412`) |
| WARSTATE 104 | 30 min | WAR_WAR_STATE | `SetGuildCombatStart()`: fighters marked state 1 (can hit) (`eve.cpp:2468-2539`) |
| STATE 3 / WARSTATE 105 | 0 | COMPLET_CLOSE / WAR_CLOSE | `SetGuildCombatClose()`: lives left are added as points (`eve.cpp:2541-2659`) |
| WAIT | 10 s | | |
| WARSTATE 106 | 0 | WAR_CLOSE_WAIT | `GuildCombatResult()` + `GuildCombatResultRanking()` (`eve.cpp:2661-2678`) |
| STATE 4 | 30 s | GM_COLSE_STATE | |
| WARSTATE 107 | 0 | WAR_TELEPORT | everyone to Flaris, results saved, state CLOSE (`eve.cpp:1630-1660`) |

Total about 99 min. The war starts at T + 68 min 05 s. Official Saturday 18:30 open => line-up 18:30-19:30, entry
19:30-19:37, prep 19:37-19:38, **war 19:38-20:08**, back in town ~20:09.

**Applying / bidding** is open whenever no siege runs (`m_nState == CLOSE_STATE`, `eve.cpp:823`): guild master only,
guild level >= GUILDLEVEL (`eve.cpp:830-836`), bid >= JOINPENYA, a raise must be higher than the old bid (`:868`), only
the difference is taken (`:896`). The top MAXJOINGUILDSIZE bids fight (`SetRequestRanking`, `eve.cpp:1735-1856`; ties keep
the earlier bidder). A guild that tendered for the 1:1 siege cannot open the apply window (`DPSrvr.cpp:5190-5196`).
Cancel only while CLOSE (`eve.cpp:906-962`).

## 4. In the siege

- **Line-up** (`DPSrvr.cpp:5222-5350`): master or kingpin, only during NOTENTER_COUNT_STATE; up to MAXJOINMEMBERSIZE
  (`:5274`); the master or a kingpin must be in it; a defender must be named and be in it; the master cannot be the
  defender (`:5301`); each fighter must be online, in the guild and level >= 30 (hard-coded, `:5327`). Each gets
  MAXPLAYERLIFE lives (`eve.cpp:522`).
- **Entering**: NPC menu "join" -> `OnGCJoin` (must be near the NPC, `DPSrvr.cpp:5360-5368`) -> `GuildCombatEnter`
  (`eve.cpp:2170-2205`) -> `JoinObserver` (`eve.cpp:699-...`): Vagrants refused (`:701`), buffs removed, placed at the
  watch spot (1361.6, 0, 1273.3) (`:710`); line-up players leave their party (`:724-726`).
- **Start points**: 4 fixed points shared by all guilds, (1263,83,1303) (1310,83,1303) (1265,83,1254) (1314,83,1253)
  (`eve.cpp:575-579`); the player picks one in a 10 s window (GC_SELECTWARPOS, `SetSelectMap` `eve.cpp:2137-2152`), else
  random (`:580-582`); teleported after MAXMAPTIME (`ProcessJoinWar`, `eve.cpp:2802-2854`).
- **Who can hit whom**: both in state 1 and different guilds, only during WAR_WAR_STATE (`MoverAttack.cpp:1992-2010`).
  No PK penalty (`Mover.cpp:5612-5616`), no EXP loss on death (`Mover.cpp:5179-5181`).
- **Death** (`World.cpp:1947-1950`): `OutWar` -> `SetPlayerChange` (`eve.cpp:3289-3344`): the dead fighter loses a life
  and goes to the back of the queue if lives remain; the next queued fighter who is in world 202 gets the start-point
  window; queued players not in world 202 lose a life. A defender who logs out is replaced at random (`eve.cpp:619-648`).
- **Revive**: in world 202, full HP/MP/FP (`DPSrvr.cpp:10192-10193, 10275-10276`) and back to the watch spot
  (`:10207-10210, :10298-10301`).
- **Early end**: when only one guild has fighters with lives left (`eve.cpp:964-1012`).
- **Points per kill** (`GetPoint`, `eve.cpp:3402-3567`): 2, +1 if the victim's guild differs from your previous kill's,
  +1 if the killer is the guild master, +1 if the victim is the defender, +1 if the killer is on the last life (max 6).
  Guild and player boards are re-sent after each kill (GC_GUILDPRECEDENCE / GC_PLAYERPRECEDENCE).
- **Winner** (`GuildCombatResult`, `eve.cpp:1064-1447`): guild score = sum of fighters' points + lives left; ties by
  lives left, then by the average level of living fighters, then the first in bid order. Win streak counted
  (`:1289-1292`). Firework + music in world 202 (`:1284-1285`). Then GC_WINGUILD, GC_BESTPLAYER, GC_LOG to all.
- **MVP** (`GetBestPlayer`, `eve.cpp:1890-2049`): the most points; ties go to the **lowest** level, then the lowest EXP.
- **Rewards**: no penya prize (0 %); no win-streak items (commented). **Red chips** (`GuildCombatResultRanking`,
  `eve.cpp:1450-1627`): guilds re-ranked by score; the top 3 guilds' line-up players each get
  `JOINPENYA x (number of applicant guilds) x 0.0000009` chips x 70 % / 20 % / 10 % (`:1570-1582`, at least 1; to the mail
  if the bag is full). With 8 applicants: 504 / 144 / 72 chips each. Fighting guilds' bids are not returned; outbid
  guilds get 98 % by mail.
- **Trophies**: GC_WINGUILD (`User.cpp:6892-6900`: combat index, winner guild id, streak) and GC_BESTPLAYER (`:6903-6910`)
  are sent at login (`DPDatabaseClient.cpp:1109-1116`) and after each siege. The client draws the winner/MVP icons by
  the name between sieges.
- **GM test commands** (`_Interface/FuncTextCmd.cpp:5220-5223`, GM3): `/gcopen`, `/gcclose`, `/gcnext` (skip to the next
  step), `/gcin`.

## 5. The SQL (`Database.sql`)

| Object | Line | Use |
|---|---|---|
| `tblCombatInfo` | 1219 | one row per siege: CombatID, Status (10 new, 20 started, 30 ended), EndDt (set by `uspEndCombat` :5179; **StartDt is never set**) |
| `tblCombatJoinGuild` | 11570 | per siege and guild: CombatFee (bid), Point, Reward, **StraightWin (> 0 only for the winner)**, Status |
| `tblCombatJoinPlayer` | 11601 | per siege, guild and player: Point, **Reward (> 0 only for the MVP**, `DbManager.cpp:5065-5066`) |
| `uspRankGuildCombatPlayer` | 12400 | all-time player ranking: sum of points by player (used for GC_PLAYERPOINT) |
| `uspLoadWinnerGuildInfo` | 12231 | winner of a siege = `StraightWin > 0` |
| `uspLoadCombatBestPlayer` | 12418 | MVP of a siege = `Reward > 0` |
| load at start | `_Database/DbManager.cpp:766-883` | last winner, MVP, current bids, unpaid list, player ranking |
| save at end | `_Database/DbManager.cpp:5032-5090` | guild and player points per siege, then a new CombatID |

So every siege's winner, MVP, guild scores and player points are already in SQL with the end time. A weekly or all-time
ranking can be read from SQL without server code.

## 6. Limits and where they live

| Limit | Value | Where | Fixed in code? |
|---|---|---|---|
| Guilds that fight | 8 | `GuildCombat.txt:24` | no: server lists are vectors, packets carry a count (`User.cpp:6180-6250`, `:7027-7066`) |
| Minimum guilds | 3 | `GuildCombat.txt:21` | no |
| Line-up per guild | 10 | `GuildCombat.txt:30` | no |
| Inside at once per guild | 5 | `GuildCombat.txt:33` | no |
| Lives per fighter | 6 | `GuildCombat.txt:27` | no |
| Fighter level | >= 30 | `DPSrvr.cpp:5327` | yes (hard-coded) |
| Guild level | >= 20 | `GuildCombat.txt:18`, check `eve.cpp:830` | no |
| Max guild level | 50 | `_Common/guild.h:26` `MAX_GUILD_LEVEL`; `Resource/expTable.inc` `expCompanyTest` 50 rows (row 50: 7,075,777 points, 29,759,885 penya, 80 members) | data |
| Minimum bid | 100,000,000 | `GuildCombat.txt:15` | no |
| Open times | 1 per weekday, max 7 | `eveschool.h:70`, `eve.cpp:2994-3023` | **yes** |
| Start points | 4, shared | `eve.cpp:575-579` | yes |
| Script steps | 25 per block, 250 total | `eveschool.h:218-219` | yes (enough) |
| Prize maths | `MulDiv((int)total bids, %, 100)` | `eve.cpp:2051-2077` | overflows past 2.1 billion total bids, but the % is 0 |

## 7. Other things that touch the siege

- The 1:1 Guild Siege opens Saturday 17:00 (`Resource/GuildCombat1TO1.lua`, `OPENTIME[1]`), 60 min line-up, 10 min entry,
  then 10-minute bouts. It can still be running around 19:00-20:00 on Saturday.
- No party can be made in world 202 (`DPSrvr.cpp:7480-7484`, `:10699-10700`); guild invites are blocked on the client
  while the guild is in a running siege.
