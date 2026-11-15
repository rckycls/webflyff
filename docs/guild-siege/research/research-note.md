# Guild Siege: research note (2026-11-15)

The owner asked: build the V15 Guild Siege exactly as V15 has it, then consider five changes (a siege every 12 hours,
weekly badges, a rankings window, more guilds, max-level guilds only).

Read-only research. Nothing was changed or built. Detail with every file:line:
- [A-client.md](A-client.md): the Neuz client (NPCs, every window, every packet byte by byte, HUD, assets, client limits).
- [B-server.md](B-server.md): the servers (switches, schedule, phases, rules, rewards, SQL, limits).
- [C-flyffweb.md](C-flyffweb.md): what FlyffWeb has today and how a siege would be wired.

`Source/` is CP949, so read it with `iconv -f cp949 -t utf-8`; line numbers are kept. `eve.cpp` = `Source/_Common/eveschool.cpp`.

## Summary

- **The siege is on in our server.** It is compiled in (`__VER 15`), switched on (`Program/WorldServer.ini:20`
  `GUILDCOMBAT`), the map is loaded (`Resource/World.inc:12` `WdGuildWar`), and the rules are in `Resource/GuildCombat.txt`.
  Today it opens **Saturday 18:30 PH time** (`GuildCombat.txt:82-85`; the VPS clock is UTC+8,
  `deploy/1-Install-Prerequisites.ps1:20`). The war runs 19:38 to 20:08.
- **FlyffWeb has none of it yet.** It skips the siege packet. World 202 already loads, and the NPCs show with greyed
  menus. Building the stock siege on desktop and phone is **large**: about 20 packet types, about 10 windows, the in-map
  HUD, the PvP rule, the trophies by the name, and around 15 pictures.
- **The five changes, in short:**

| # | Change | Possible? | Where | Size |
|---|---|---|---|---|
| 1 | A siege at 8 AM and 8 PM every day | yes, with a **small server patch** (the script allows only one time per weekday) | `eveschool.h/.cpp` + `GuildCombat.txt` | small |
| 2 | Weekly champion and weekly MVP badges (Saturday 8 PM) | yes | website API (SQL) + FlyffWeb name tags; **no server code** | medium |
| 3 | Rankings window (individual + guild) from a top-right icon | yes | website API (SQL) + a FlyffWeb window and icon; no server code | medium |
| 4 | More guilds | yes: the server has **no fixed cap**; 12 recommended | `GuildCombat.txt:24` + FlyffWeb boards | small |
| 5 | Max-level guilds only | yes, **one line**: the check already exists | `GuildCombat.txt:18` -> 50 | tiny |

**Recommendation.** Build the stock siege in FlyffWeb first, in milestones (§3). Do the server side alongside it, as one
small patch plus script lines: twice-daily times, `GUILDLEVEL 50`, `MAXJOINGUILDSIZE 12`. Then add the rankings window
and the weekly badges, both read from SQL by the website, so the game server needs no new packets.
**First, check how many guilds are level 50.** With fewer than 3, no siege can ever start (§2.5).

## 1. The V15 siege, as it is

### 1.1 Switches
- Server `__MAINSERVER`, `__VER 15` (`Source/WORLDSERVER/VersionCommon.h:3-4`). The siege code has no `#define` of its
  own: its gates are `#if __VER >= 8 / 11 / 15`, so all of it is in. That includes the red-chip reward
  (`eve.cpp:1449`, `:2674`) and the V15 change that removes fighters from their party (`eve.cpp:724`).
  `__S_BUG_GC` is on (`VersionCommon.h:58`).
- The rules file is loaded at start (`Source/WORLDSERVER/ThreadMng.cpp:275`). The siege ticks every world loop
  (`ThreadMng.cpp:416`).

### 1.2 Schedule and phases
- One open time per weekday: `__AUTO_OPEN __AutoOpen[7]` (`Source/_Common/eveschool.h:60-71`). The script fills
  `__AutoOpen[day-1]` (`eve.cpp:2986-3029`).
- The siege opens when hour and minute match, if at least 3 guilds applied (`eve.cpp:2763-2797`).
- The clock is the machine's local time (`eve.cpp:2765`), which is PH time on the VPS.
- Phases from the open time T (`GuildCombat.txt:117-132`, `eve.cpp:2856-2967`):

| From | Length | Phase | What happens |
|---|---|---|---|
| T | 60 min | line-up | world 202 is emptied. Masters and kingpins of the top 8 bidders pick up to 10 fighters, their order and a defender |
| T+60 | 7 min | entry | fighters get "teleport to Frankie?", then enter by the NPC and wait on the watch stand |
| T+67 | 1 min | prep | the first 5 of each line-up who are inside pick one of 4 start points (10 s). Absent fighters lose a life. Under 3 guilds = cancelled |
| T+68 | 30 min | war | fighters of different guilds can hit each other. No PK, no EXP loss |
| T+98 | ~1 min | end | lives left become points, then the winner, the MVP and the rewards. Everyone is sent to Flaris |

- **Applying (bidding)** works whenever no siege runs (`eve.cpp:816-905`). Only the guild master can apply. The guild
  needs level 20+ and must bid at least 100,000,000 penya, and a raise must beat the old bid. The top 8 bids fight
  (`eve.cpp:1735-1856`). Outbid guilds get 98 % back by mail. Fighting guilds lose their bid. Cancelling returns 80 %.

### 1.3 What a player sees
- **NPCs in Flaris** (`Resource/character.inc:3763-3810`):
  - **Frankie**: Apply, Status, Join, Entry (line-up), three info boards.
  - **Donaris**: Cancel, Ranking, prize money (master only), prize info, fee info.
  - A merchant is spawned inside the arena (`eve.cpp:1662-1684`).
- **Windows:**
  - Apply: the 1:1 offer window, reused (304x272).
  - Status: the 1:1 status layout (304x480), with a count-down to the next siege and the applicant list.
  - Line-up: 656x432.
  - Start point: 320x176, 4 buttons, 10 s.
  - Cancel and join confirms.
  - Info boards: 384x384, from 6 text files.
  - "Teleport?" and "result of bidding" boxes.
  - Ranking: 400x384, 5 tabs (all + 4 job lines), all-time points.
  - Result after the siege: 560x320, guild and member ranking plus the battle log.
  - Layouts, controls and texts: A §2.
- **In the arena:**
  - A count-down at the top.
  - On the right, the guild board ("Current rank") and the player board ("Individual rank", top 10 + your row).
  - On the left, your guild's fighters with lives and HP, a "D" for the defender, and the next fighter in green.
  - Your guild's names green, all others white; the defender's guild line pink.
  - Fighters cannot see or click non-fighters.
  - The minimap shows the 4 numbered start points.
  - Layout and colours: A §4.
- **Death:** a fighter gets no revive window. The client goes straight to "revive", and the server revives at full
  HP/MP/FP on the watch stand (`Source/Neuz/DPClient.cpp:2043-2046`; `Source/WORLDSERVER/DPSrvr.cpp:10275-10302`).
  The fighter loses a life, and the next queued fighter gets the start-point window (`eve.cpp:3289-3344`).
- **Points per kill** (`eve.cpp:3402-3567`): 2, plus 1 each for a victim from a different guild than your last kill,
  a kill by the master, killing the defender, or killing while on your last life (max 6).
- **Winner:** guild points plus lives left. Ties go to more lives, then the higher average level (`eve.cpp:1064-1271`).
- **MVP:** the most points. Ties go to the lowest level, then the lowest EXP (`eve.cpp:1890-2049`).
- **Rewards:** red chips to every line-up player of the top 3 guilds: 70 / 20 / 10 % of `100M x applicants x 0.0000009`
  (`eve.cpp:1555-1626`). With 8 applicants that is 504 / 144 / 72 chips each. No penya prize (0 %), no items.
- **Trophies:** between sieges, the last winner's members get `TexGuildCombatWinner.bmp`, and the MVP gets
  `TexGuildCombatBest.bmp`, left of the guild logo (`Source/_Common/MoverRender.cpp:1598-1689`). The data (GC_WINGUILD,
  GC_BESTPLAYER) is sent at login (`Source/WORLDSERVER/DPDatabaseClient.cpp:1109-1116`).
- **GM test commands:** `/gcopen`, `/gcnext` (skip a wait), `/gcclose`, `/gcin` (`Source/_Interface/FuncTextCmd.cpp:5220-5223`).

### 1.4 Limits and where they live

| Limit | Value | Where |
|---|---|---|
| Guilds that fight / minimum | 8 / 3 | `GuildCombat.txt:24`, `:21` (script) |
| Line-up / inside at once / lives | 10 / 5 / 6 | `GuildCombat.txt:30`, `:33`, `:27` (script) |
| Guild level / minimum bid | 20 / 100,000,000 | `GuildCombat.txt:18`, `:15` (script) |
| Fighter level | 30 | `DPSrvr.cpp:5327` (code) |
| Open times | 1 per weekday | `eveschool.h:70` (code) |
| Start points | 4, shared by all guilds | `eve.cpp:575-579` (code), minimap mask |
| Server lists and packets | no cap: vectors, and every list is sent with its count | `Source/WORLDSERVER/User.cpp:6180-6250`, `:7027-7066` |
| SQL | per siege, guild and player; no cap | `Database.sql:1219`, `:11570`, `:11601` |
| Neuz client | paints the 9th+ applicant red; HUD sized for about 8 guilds on 800x600; ranking 100 rows per tab | A §7 |

### 1.5 SQL already keeps everything
- Each siege has a row in `tblCombatInfo`, with `EndDt` set at the end (`Database.sql:5179-5185`). StartDt is never set.
- Each guild has a row in `tblCombatJoinGuild`: bid, points, and `StraightWin > 0` only for the winner
  (`Database.sql:12231-12240`).
- Each fighter has a row in `tblCombatJoinPlayer`: points, and `Reward > 0` only for the MVP
  (`Source/_Database/DbManager.cpp:5065-5066`).
- The all-time player ranking is `uspRankGuildCombatPlayer` (`Database.sql:12400`).
- **So weekly and all-time rankings, and the weekly champion and MVP, can be read from SQL with no server change.**

### 1.6 What FlyffWeb has today (C)
- **Built:**
  - Guild core and guild bank.
  - Honour titles, including [Lord].
  - World 202 loads (converted, no-fly).
  - `/escape`, Blink Wings and Add Friend are refused in 202.
  - The GM `/gc*` commands pass through.
- **Not built:**
  - The siege packet `0xb8` has no reader; it is skipped silently (`packages/protocol/src/bundle.ts:163-166`).
  - `m_nGuildCombatState` is dropped from ADD_OBJ (`packages/protocol/src/world/addObj.ts:140`).
  - Siege menus MMI 26-41 show greyed.
  - No siege windows, HUD, PvP rule or trophy slot on name tags.
  - The siege pictures are not converted.
- Guild war and the guild ranking windows are not built either. The siege does not need them.

## 2. The owner's five changes

### 2.1 A siege every 12 hours (8 AM and 8 PM PH)
- **Possible: yes, but not by script alone.** The script keeps one time per weekday. A second line for the same day
  overwrites the first (`eve.cpp:3007-3023`). One siege every day *is* possible by script (7 lines).
- **Time zone:** fine. The server uses local time, and the VPS is set to UTC+8 (`deploy/1-Install-Prerequisites.ps1:20`).
- **Also broken today:** the status window's "time to next siege" only knows the last day listed (`eve.cpp:2097-2120`).
  It must be fixed for any schedule with more than one day.
- **What does "8 PM" mean?** The war starts 68 min after the open.
  - War at 8:00 means the open is at 6:52 (line-up 6:52, entry 7:52, war 8:00-8:30).
  - Open at 8:00 means the war is at 9:08-9:38.
- **Options:**
  - **A (recommended):** a small patch to `CGuildCombat`:
    - keep a list of open times, so several per day work (about 14-28 slots);
    - check them all in `Process()`;
    - make `GetNextGuildCobmatTime()` return the nearest one;
    - `AUTO_OPEN_IDC` lists 14 lines (7 days x 6:52 and 18:52, or x 8:00 and 20:00).
  - **B:** script only, one siege a day (for example 18:52 daily). No code, but not what was asked.
- **Size:** small. Two files (`Source/_Common/eveschool.h/.cpp`), about 60 lines. World rebuild.
- **Risks:**
  - The 100M minimum bid twice a day is a big penya drain on fighting guilds. The red chips scale with it, so lowering
    it lowers the chips too.
  - The 1:1 siege opens Saturday 17:00 and can run past 19:00 (`Resource/GuildCombat1TO1.lua`).
  - A guild with a 1:1 tender cannot open the siege apply window (`DPSrvr.cpp:5190-5196`), and 1:1 tenders are open all
    week. So such a guild misses every normal siege that week. This is V15 behaviour; watch it.
  - Info board 1 states the old schedule and level, so FlyffWeb's copy of the text needs an update.

### 2.2 Weekly champion and weekly MVP badges (from the Saturday 8 PM siege)
- **What V15 has:** the two trophies by the name (§1.3). They follow the **last** siege, so with 12-hour sieges they
  change twice a day. They come with the stock build.
- **What a badge can be in V15:**
  - **Mark by the name:** seen by all. Not in V15 as a weekly thing.
  - **Honour title:** seen by all as "[title] name", but the player must pick it. The Lord title is one that comes and
    goes (`Source/_Common/Mover.cpp:11549-11553`).
  - **Buff icon:** other players' item buffs are not shown (`apps/client/src/world/hud/targetBuffs.ts:1-3`).
  - **Item:** nothing to show off.
- **Options:**
  - **A (recommended):** two new marks by the name, "Weekly Champion" (winning guild's members) and "Weekly MVP", drawn
    next to the stock trophy.
    - A website route (`/api/siege/weekly`, as `/api/status`) reads SQL for the last siege that ended on a Saturday
      between 20:00 and 21:59 in the past 7 days: winner guild id and name, MVP id and name, end time.
    - FlyffWeb fetches it at login and every few minutes, and matches the guild id and player id it already has
      (`addObj.ts:102`, `:114-118`).
    - It expires by itself 7 days after that siege; the next Saturday siege replaces it.
    - No server code, no new packet, nothing for Neuz.
  - **B:** two weekly honour titles, made like the Lord title:
    - two `honorList.txt` rows plus texts;
    - the server keeps the weekly champion and MVP (saved in SQL) and grants or removes the title in `CheckHonorStat`.
    - Players must pick it in the Fame tab. Server patch plus data. Medium.
  - **C:** A and B together.
- **Size:** A is medium (SQL procedure, web route, client fetch, name-tag slot, two pictures).
- **Risks:**
  - New art is needed. The plan: gold-tinted copies of the two V15 trophies (25x25), for the owner to approve.
  - The siege must really be held on Saturday; with fewer than 3 guilds there is no champion that week.
  - With the website down, the badges just don't show.

### 2.3 Rankings window, from a new top-right icon
- **What V15 has:**
  - Donaris "Ranking": individual points over all sieges ever, in 5 tabs (A §2.9).
  - The result window: the last siege's guilds and members.
  - **No guild ranking over many sieges, and no weekly view.**
- **Options:**
  - **A (recommended):** a new "Siege Ranking" window in the V15 look (the Ranking window's frame and tabs).
    - Tabs: **Individual** and **Guild**, with a This week / All time switch.
    - Individual rows: rank, name, job, guild, points.
    - Guild rows: rank, guild, wins, sieges, points.
    - Data from SQL through a website route (cached for a minute). No server code.
  - **B:** server packets. Individual exists (all-time only). Guild needs a new packet plus a patch. Not recommended.
- **The icon:**
  - **Phone:** the 8 icons are a 4x2 grid (`apps/client/src/style.css:1639-1653`).
    - Recommended: a **5+4 grid**, the siege icon 5th in row 1, if it fits at 568 and 730 px (not measured yet).
    - Fallback: replace the Status icon, whose window shows from the start (`apps/client/src/world/hud/mobileTools.ts:46-51`).
  - **Desktop:** there is no top-right row today (`style.css:1608`). Recommended: one icon left of the Navigator, plus a
    Start menu line.
  - **Icon art:** the V15 winner trophy picture (no new art).
- **Size:** medium.
- **Risk:** the Individual tab can get long; cap it at 100 rows, as V15 does.

### 2.4 More guilds
- **Real ceiling:** none on the server. `MAXJOINGUILDSIZE` is just a number; all lists are vectors and all packets carry
  a count (B §6).
- **What limits it:**
  - **The arena:** one fight area of about 95 x 92 m with 4 start points shared by all guilds (A §4.6,
    `eve.cpp:575-579`). 8 guilds x 5 fighters = 40 at once; 12 = 60; 16 = 80.
  - **Applicants:** you need more than 8 bidding guilds before a higher cap matters. With max-level guilds only (2.5)
    that is unlikely soon.
  - **Chips:** the red-chip count grows with the number of applicants (`eve.cpp:1570`). 16 applicants means 1,008 chips
    each for the winners.
  - **Screens:** the Neuz HUD fits about 8 guilds on 800x600, and Neuz paints the 9th applicant red (A §7). The phone
    (350 px tall) needs compact or collapsible boards whatever the cap. FlyffWeb's boards can be built for any number.
- **Options:**
  - **A (recommended):** 12. Script line plus FlyffWeb's "top 12" texts.
  - **B:** 16.
  - **C:** keep 8.
- **Size:** small (part of the FlyffWeb build).
- **Risks:**
  - Crowding at the 4 start points.
  - Chip inflation.
  - The client cannot learn the cap from the server, so FlyffWeb must hard-code the same number as the script.

### 2.5 Max-level guilds only
- **Max guild level in our data: 50** (`Source/_Common/guild.h:26` `MAX_GUILD_LEVEL`; `Resource/expTable.inc`
  `expCompanyTest`, 50 rows). The last row needs 7,075,777 points and 29,759,885 penya, and gives 80 members.
- **The check already exists:** on apply, `pGuild->m_nLevel < m_nGuildLevel` refuses with "guild level %d needed"
  (`eve.cpp:830-836`). Set `GUILDLEVEL 50` (`GuildCombat.txt:18`). No code.
- **Size:** tiny. FlyffWeb's info board text also says 20+ and needs an update.
- **Risk (big):** with fewer than 3 level-50 guilds, no siege ever opens. Check first, in SQL:
  `SELECT m_szGuild, m_nLevel FROM CHARACTER_01_DBF.dbo.GUILD_TBL WHERE m_nLevel >= 50`.
- The 1:1 siege keeps its own level 20 (`Resource/GuildCombat1TO1.lua`) unless the owner wants that changed too.

## 3. How it would be built (after approval; a plan comes first)

- **Server** (outer branch, `patches/*.patch`, VS 2022 Release|Win32, World only):
  - the schedule patch (2.1);
  - `GuildCombat.txt`: times, `GUILDLEVEL 50`, `MAXJOINGUILDSIZE 12`;
  - the SQL procedure(s) for the website, with a grant to `flyffweb_site`.
- **FlyffWeb** (fresh worktree off `main`), milestones, desktop and phone each:
  1. Protocol: the `0xb8` reader with about 20 sub-types, 12 sends, testkit; keep `m_nGuildCombatState`; the siege book;
     trophies by the name; fighters revive at once.
  2. NPC menus (Frankie, Donaris); apply, status, cancel and join confirms; info boards; "teleport?" and result boxes.
  3. Line-up window; start-point window.
  4. In the arena: count-down, guild and player boards, own-guild list, the siege PvP rule (`attackAble`), name
     colours, hiding non-fighters, minimap mask.
  5. Result window (2 tabs and battle log); Ranking window (5 tabs).
  6. Owner extras: Siege Ranking window and icon; weekly badges; website route.
- **Pictures to convert:** about 15 (C §9), after they are added to `THEME_FILES`; the convert command is in C §9.
- **Testing:** a live siege needs 3 guilds with line-ups (at least 3 players online). On the VM the owner can use
  `/gcopen` and `/gcnext` to skip the waits.
