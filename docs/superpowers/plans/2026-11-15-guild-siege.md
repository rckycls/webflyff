# Guild Siege Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the stock V15 Guild Siege in FlyffWeb (desktop and phone), plus the owner's five changes: a siege twice a
day, weekly badges, a Siege Ranking window, 12 guilds, and level-50 guilds only.

**Architecture:**
- **Server.** One small World patch: several open times per day, a correct "time to next siege", and a fixed guild count
  in one packet. Also three lines in `Resource/GuildCombat.txt`.
- **FlyffWeb client.** It reads the siege snapshot `0xb8`, sends the 12 siege packets, and builds the V15 windows and
  arena HUD in 5 milestones.
- **Extras (rankings, weekly badges).** These come from SQL. The website (`apps/web`) reads it through three new
  procedures. The game server gets no new packets.

**Tech Stack:**
- Server: C++ (VS 2022, Release|Win32, World only).
- Client and website: TypeScript (vitest, Playwright Chromium). Website SQL: SQL Server through `mssql`.

**Spec:** `docs/guild-siege/research/research-note.md`, with the details in `A-client.md`, `B-server.md` and `C-flyffweb.md` beside it ("A §2.3" means `A-client.md` section 2.3).
Executors read the spec and this plan together.

## Owner decisions (2026-11-15: "Yes, write the plan")

| # | Decision |
|---|---|
| D1 | The **war** is at 08:00 and 20:00 PH, so the siege **opens at 06:52 and 18:52 every day**. The war starts 68 min 05 s after the open. |
| D2 | Weekly badges are **marks by the name**, read from the website. Every member of the winning guild gets "Weekly Champion"; the MVP gets "Weekly MVP". They come from the latest Saturday siege that ended between 20:00 and 21:59, and each lasts 7 days from that siege's end. |
| D3 | A **Siege Ranking** window with **Individual** and **Guild** tabs and a **This week / All time** switch. "This week" means Sunday 00:00 to now, PH time. Up to 100 rows. |
| D4 | The guild cap is **12** (`MAXJOINGUILDSIZE 12`). |
| D5 | **Guild level 50** only (`GUILDLEVEL 50`). |
| D6 | The phone icon goes in a **5+4 grid** if it fits at 568 and 730 px wide; otherwise it **replaces Status**. Desktop gets an icon left of the Navigator plus a Start menu line. The icon art is the V15 winner trophy. |
| D7 | The minimum bid stays at **100,000,000**. |
| D8 | FlyffWeb's info boards show **our real values**: level 50, the new schedule, 12 guilds, 6 lives. |

## Gate G0 (owner, before Part S goes live)

Run this on the VPS in SSMS:

`SELECT m_szGuild, m_nLevel FROM CHARACTER_01_DBF.dbo.GUILD_TBL WHERE m_nLevel >= 50`

- 3 or more rows: go ahead.
- Fewer: no siege can open. The owner chooses: keep 50 and wait, or use a lower `GUILDLEVEL` for the beta (one line).

The build can start either way.

## Global Constraints

- **Server work goes on an outer-repo branch.**
  - Branch `guild-siege`, worktree `Bakbak/Blouflash-worktrees/guild-siege`, made from the outer `main`.
  - `Source/` is git-ignored, so code ships as `patches/2026-11-NN-guild-siege-schedule.patch`. Make it from the
    worktree's own scratch Source repo with `git diff -U10`. `patches/.gitattributes` already has `*.patch -text`.
- **Editing Source files.**
  - `Source/` files are CP949 + CRLF. Edit them byte-safe with node scripts that use `latin1` read/write.
  - Write those scripts with the Write tool; Bash heredocs collapse `\\`.
- **Building World.**
  - Copy the owner's uncommitted `Resource/defineWorld.h` and `Resource/ResData.h` from the main folder into the
    worktree first.
  - Never write to the main folder's `Program/` or `Source/`.
- **FlyffWeb work goes on its own branch.** Branch `guild-siege`, fresh worktree `Bakbak/FlyffWeb-worktrees/guild-siege`
  off FlyffWeb `main` (357a1ea or newer). No junctions inside the worktree.
- **Builders run only quick checks:** `npm test`, `npm run typecheck`, and at most one run of the e2e spec file their task
  touches. The full suites, the converter, live tests and the iPhone check go to the owner in each milestone's
  checkpoint doc `docs/2026-11-NN-guild-siege-mN-checkpoint.md`. Each item says the command, the place (PC or VM), the
  time, and what a pass looks like.
- **One source of truth for the siege numbers.** These must equal `GuildCombat.txt`, kept in
  `apps/client/src/world/guildCombat/guildCombatRules.ts` as `SIEGE`:
  - `maxGuilds: 12`, `minGuilds: 3`, `maxJoinMembers: 10`, `maxWarPlayers: 5`, `lives: 6`;
  - `guildLevel: 50`, `fighterLevel: 30`, `minBid: 100_000_000`;
  - `openTimes: ['06:52', '18:52']`, `worldId: 202`.
- **Stock V15 look and words:** layouts from `Resource/resdata.inc`, texts by TID from `texts.json`. Only D1-D8 are
  custom. Every window works on desktop and on the phone (game area about 800x350).
- **Wire format:** ints are 4 bytes little-endian, and `time_t` is 4 bytes. A string is an i32 length plus bytes with no
  NUL.
- **Out of scope:**
  - the 1:1 siege (MMI 60-70 stay greyed);
  - Neuz changes (Neuz will paint applicants 9-12 red; cosmetic);
  - TAB target cycling (FlyffWeb has none);
  - the old penya prize (it is 0 %).

## Review Focus

1. **Logging in mid-siege.** A player who logs in or reconnects at war state 104 gets only GC_GCSTATE, GC_USERSTATE and
   the boards. The arena HUD and the PvP rule must come up from those alone. Owner: Task B5.
2. **Bad siege data.** Two cases:
   - A guild id or player id the client does not know, in GC_LOG, the boards or the ranking. Neuz crashes on this
     (`DPClient.cpp:7393`). FlyffWeb shows `?` and carries on.
   - A GC_WARPLAYERLIST guild that has no member record. Owners: S1 fixes the server count; B1 tests a reader that ends
     early.
3. **Twelve guilds on a phone.** The boards must not cover the attack button or the action slots at 568x320 and 730x320.
   Owner: Task B5, which gets a phone e2e check.
4. **The website down, slow or failing.** The badges vanish, the ranking window says it is unavailable, and the game
   carries on. Fetches have a 3 s timeout and at most one call per 5 min. Owners: C1 and C2.
5. **Week edges.**
   - A Saturday siege that ends early (for example 20:06) still counts.
   - A Saturday siege that never ends (cancelled, under 3 line-ups) gives no badge.
   - The previous badge expires 7 days after its siege.
   - Times stay PH: SQL returns local times, and the site sends them as `+08:00` ISO.
   - Owner: Task W1.

---

## Part S: Server (outer repo, branch `guild-siege`)

### Task S1: Several open times a day, the next-siege time, the war list count

**Files:**
- Modify: `Source/_Common/eveschool.h:60-71` (`__AutoOpen`, with a new method) and `:313-314`.
- Modify: `Source/_Common/eveschool.cpp`:
  - LoadScript, MAINSERVER branch `:2985-3029` and TEST branch `:3030-3074`;
  - `Process` `:2751-2797`;
  - `GetNextGuildCobmatTime` `:2097-2120`;
  - `SerializeGCWarPlayerList` `:3569-3621`.
- Modify: `Resource/GuildCombat.txt:18` (`GUILDLEVEL 50`), `:24` (`MAXJOINGUILDSIZE 12`), `:82-85` (`AUTO_OPEN_IDC`).
- Create: `patches/2026-11-NN-guild-siege-schedule.patch` and `docs/guild-siege/README.md` (VM test steps).

**Interfaces:**
- Produces:
  - `enum { MAX_AUTO_OPEN_PER_DAY = 4 };`
  - `__AUTO_OPEN __AutoOpen[7][MAX_AUTO_OPEN_PER_DAY];` (WORLDSERVER only)
  - `BOOL CGuildCombat::AddAutoOpen( int nDay, int nHour, int nMinute );`
  - `GetNextGuildCobmatTime()` keeps its signature.

- [ ] **Step 1: Make the worktree.** Copy `Resource/defineWorld.h` and `Resource/ResData.h` in from the main folder. Make
  the scratch Source repo (copy of `Source/`, `git init`, commit) so the patch can be cut from it.
- [ ] **Step 2: Header.** Make `__AutoOpen` two-dimensional and declare `AddAutoOpen`. `m_nDay` stays declared but
  nothing reads it any more.
- [ ] **Step 3: LoadScript.** Both branches call `AddAutoOpen(nDay, nTime1, nTime2)` instead of writing
  `__AutoOpen[nDay-1]`.
  - `AddAutoOpen` fills that day's first free slot.
  - It fails with `Error("CGuildCombat::LoadScript() too many open times on day %d", nDay)` when the day has 4.
  - The count check becomes `nAutoOpenCnt >= 7 * MAX_AUTO_OPEN_PER_DAY`.
  - Keep the existing day, hour and minute range checks.
- [ ] **Step 4: Process.** In CLOSE state, look for any used slot of today (`GetDayOfWeek()-1`) whose hour and minute
  match.
  - The body runs once per match, as today: open if at least `m_nMinGuild` applied, else the "next combat" messages, then
    `m_bMutex = TRUE`.
  - Move the `m_bMutexMsg` / `m_ctrMutexOut` reset out of the slot check, so it runs on every CLOSE tick.
  - Still true: `m_bMutex` is cleared at the end of a siege (`eve.cpp:1657`).
- [ ] **Step 5: GetNextGuildCobmatTime.** For each day offset 0..7 and each used slot of that weekday, build
  `CTime(y, m, d, hour, minute, 0)` from `now + CTimeSpan(offset,0,0,0)`.
  - Return the earliest one that is at or after now (the current minute counts).
  - With no slot at all, return now; today that case reads `__AutoOpen[-1]`.
- [ ] **Step 6: SerializeGCWarPlayerList.** Write the number of guilds actually written: count the guilds among the
  first `m_nMaxGuild` of `vecRequestRanking` for which `FindGuildCombatMember` is not NULL, then write that count, then
  those guilds. Change the `__S_BUG_GC` path only; the `#else` path is not compiled.
- [ ] **Step 7: GuildCombat.txt** (ANSI + CRLF, byte-safe):
  - `GUILDLEVEL 50`;
  - `MAXJOINGUILDSIZE 12`;
  - `AUTO_OPEN_IDC` gets 14 lines: `1 6 52`, `1 18 52`, `2 6 52`, `2 18 52`, … `7 6 52`, `7 18 52`.
- [ ] **Step 8: Build World.** `MSBuild` with Release|Win32, the World project only.
  - Expected: `0 error(s)`.
  - Output: `Output\WorldServer\Release\WorldServer.exe` in the worktree.
- [ ] **Step 9: Cut the patch** from the scratch repo (`git diff -U10`), then check that it applies to a fresh copy:
  `git apply --check`.
- [ ] **Step 10: Write `docs/guild-siege/README.md`**, the owner's VM test, about 30 min. The steps:
  1. Copy the exe in as `Program\7. World.exe`.
  2. Make a test copy of `GuildCombat.txt` with `GUILDLEVEL 1` and two open times today, at now+10 and now+20 min.
  3. Make 3 guilds; each master applies with 100M.
  4. The Status window's count-down shows the time to the now+10 slot.
  5. At now+10 the siege opens (world message). Use `/gcclose`.
  6. At now+20 it opens again. Use `/gcclose`.
  7. Put back the real `GuildCombat.txt`.

  Pass: both opens happen, and the count-down was right before each.
- [ ] **Step 11: Commit** the patch, `Resource/GuildCombat.txt` and the README:

```bash
git add patches/2026-11-NN-guild-siege-schedule.patch Resource/GuildCombat.txt docs/guild-siege/README.md
git commit -m "feat(siege): two open times a day, level 50, 12 guilds"
```

---

## Part W: Website API (FlyffWeb, branch `guild-siege`)

### Task W1: Siege procedures, store methods, two cached routes

**Files:**
- Modify: `apps/web/sql/web-login.sql`. Add three procedures in `CHARACTER_01_DBF`, in the
  `IF OBJECT_ID … CREATE … ALTER` form the file already uses, and grant each to `flyffweb_site`. Update the header
  comment.
- Modify: `apps/web/src/accountStore.ts` (interface) and `apps/web/src/sqlAccountStore.ts` (the CHARACTER pool).
- Create: `apps/web/src/siege.ts` (types, `SiegeCache`, the handlers).
- Modify: `apps/web/src/server.ts:67-92` (two routes).
- Test: `apps/web/test/siege.test.ts`.

**Interfaces:**
- Produces, used by C1 and C2 as JSON:
  - `SiegeWeekly = { champion: { guildId: number; name: string } | null; mvp: { playerId: number; name: string } | null; endedAt: string | null; expiresAt: string | null }`
  - `SiegeRankRow = { rank: number; name: string; job?: number; guild?: string; wins?: number; sieges?: number; points: number }`
  - `GET /api/siege/weekly` returns `SiegeWeekly`.
  - `GET /api/siege/ranking?board=player|guild&span=week|all` returns `{ rows: SiegeRankRow[]; checkedAt: string }`.
  - A bad parameter returns 400 `{error:'bad_request'}`. A SQL failure, or no answer within 2 s, returns 503
    `{error:'unavailable'}`.

The SQL rules:
- Only sieges with `tblCombatInfo.Status = '30'` count. `serverindex` is `'01'`.
- `usp_WebSiegeWeekly` takes the latest ended siege where all of these hold:
  - `EndDt > DATEADD(day, -7, GETDATE())`;
  - its weekday is Saturday, computed as `(DATEPART(weekday, EndDt) + @@DATEFIRST - 1) % 7 = 6`, so it does not depend on
    DATEFIRST;
  - its hour is 20 or 21.

  It returns:
  - winner `GuildID` with `StraightWin > 0`, joined to `GUILD_TBL.m_szGuild`;
  - MVP `PlayerID` with `Reward > 0`, joined to `CHARACTER_TBL.m_szName`;
  - `EndDt`.

  `expiresAt` = `EndDt` + 7 days. It is worked out in the store, not in SQL.
- `usp_WebSiegeRankingPlayer @week bit` returns the top 100 by `SUM(Point)` with `SUM > 0`.
  - Each row has name, job, and the guild of the player's latest siege.
  - With `@week = 1`, only sieges with `EndDt >= ` this Sunday 00:00. That is
    `DATEADD(day, -((DATEPART(weekday, GETDATE()) + @@DATEFIRST - 1) % 7), CAST(GETDATE() AS date))`.
- `usp_WebSiegeRankingGuild @week bit` returns the top 100, sorted by wins, then points (both high to low).
  - `wins` = count of `StraightWin > 0`.
  - `sieges` = the sieges where the guild had line-up players, i.e. rows in `tblCombatJoinPlayer` for that CombatID and
    GuildID. This counts the guilds that really fought, not the outbid ones.
  - `points` = `SUM(tblCombatJoinGuild.Point)` over those sieges.
- The text IDs `GuildID` char(6) and `PlayerID` char(7) are sent as numbers (`parseInt`), so the client can match them
  with ADD_OBJ ids.
- Times come back as text from SQL: `CONVERT(varchar(19), EndDt, 126) + '+08:00'`. They must never come back as a
  `datetime`, because `mssql`'s default `useUTC` would read the PH clock as UTC and shift it by 8 hours.

- [ ] **Step 1: Write failing tests** in `apps/web/test/siege.test.ts`, with a fake store as the status tests use:
  - `weekly route returns the store answer with expiresAt = endedAt + 7 days`;
  - `ranking route rejects board=x and span=y with 400`;
  - `ranking answer is cached 60 s per board+span; a failed load is not kept`;
  - `store slower than 2 s gives 503 unavailable`;
  - `endedAt is sent as ISO with +08:00` (SQL `datetime` is local PH time; send it as `+08:00`, never `Z`).
- [ ] **Step 2:** Run `npx vitest run apps/web/test/siege.test.ts`. Expected: FAIL (no module `../src/siege`).
- [ ] **Step 3: Write the code.**
  - `siege.ts`: `class SiegeCache` with the same shape as `StatusCache` (`status.ts`), a 60 s TTL, keys `weekly`,
    `player:week`, and so on.
  - `handleSiegeWeekly(deps)` and `handleSiegeRanking(query, deps)`.
  - Store methods `siegeWeekly()` and `siegeRanking(board: 'player'|'guild', week: boolean)`.
  - Use the SQL rules above.
- [ ] **Step 4:** Run `npm test -- apps/web` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Owner checkpoint item.**
  - On the VM, re-run `apps/web/sql/Install-WebLogin.ps1`; it can be re-run.
  - Then `curl http://127.0.0.1:8091/api/siege/ranking?board=guild&span=all`.
  - Pass: 200 with `rows`. After a test siege, `/api/siege/weekly` stays `null` unless the siege ended on a Saturday
    between 20:00 and 21:59.
- [ ] **Step 6: Commit** with `feat(web): siege ranking and weekly winner API`.

---

## Part B: FlyffWeb stock siege (branch `guild-siege`, milestones M1-M5)

Shared paths:
- protocol `packages/protocol/src/world/guildCombat.ts`;
- book `apps/client/src/world/guildCombat/guildCombatBook.ts`;
- rules `…/guildCombat/guildCombatRules.ts`;
- glue `…/guildCombat/guildCombatHud.ts`;
- windows `apps/client/src/world/hud/guildCombat/*.ts`.

Wire each piece in the 15 steps of C §3: reader, readers.ts, types.ts union, messages/world.ts, index.ts, testkit,
WorldSession send, `WorldScreen.apply` route, build/teardown, windows, CSS, THEME_FILES, tests.

### Task B1 (M1): The siege snapshot, the 12 sends, the combat state in ADD_OBJ

**Files:**
- Create: `packages/protocol/src/world/guildCombat.ts`, `packages/testkit/src/guildCombat.ts`.
- Modify:
  - `packages/protocol/src/world/readers.ts:232-245`, `types.ts:18-27`, `messages/world.ts:771-782`, `index.ts:75-81`;
  - `packages/testkit/src/index.ts`;
  - `packages/protocol/src/world/addObj.ts:140`, `types.ts:571-576`, `packages/testkit/src/world.ts:657`.
- Test: `packages/protocol/test/guildCombat.test.ts`, `packages/protocol/test/addObj.test.ts`.

**Interfaces:**
- Produces:
  - `GuildCombatMessageType = { GUILDCOMBAT: 0xb8 }`.
  - `GuildCombatSub`, with the ids of A §3.2: WINGUILD 0x00, IN_WINDOW 0x01, REQUEST_STATUS 0x04, SELECTPLAYER 0x05,
    SELECTWARPOS 0x06, BESTPLAYER 0x07, ISREQUEST 0x08, USERSTATE 0x10, WARPLAYERLIST 0x11, GUILDSTATUS 0x20,
    GUILDPRECEDENCE 0x21, PLAYERPRECEDENCE 0x22, GCSTATE 0x30, NEXTTIMESTATE 0x31, ENTERTIME 0x32, DIAGMESSAGE 0x33,
    TELE 0x34, LOG 0x35, LOG_REALTIME 0x36, GETPENYAGUILD 0x40, GETPENYAPLAYER 0x41, PLAYERPOINT 0x42.
  - `type GuildCombatMessage = { type: 'guildCombat' } & (one variant per sub, field names in camelCase as A §3.2 lists them | { sub: 'unknown'; id: number })`.
  - `readGuildCombat(r: ArReader): GuildCombatMessage`.
  - `GUILD_COMBAT_READERS`.
  - `GuildCombatPacketType`: IN 0xf000d022, OUT 0xf000d023, JOIN 0xf000d024, SELECTPLAYER 0xf000d027,
    REQUEST_STATUS 0xf000d028, SELECTMAP 0xf000d02b, GETPENYAGUILD 0xf000d02d, GETPENYAPLAYER 0xf000d02e,
    TELE 0xf000d030, PLAYERPOINT 0xf000d031.
  - The encoders: `encodeGcWindow()`, `encodeGcApply(penya)`, `encodeGcCancel()`, `encodeGcStatus()`,
    `encodeGcLineupWindow()`, `encodeGcLineup(defenderId, ids)`, `encodeGcSelectMap(map)`, `encodeGcJoin()`,
    `encodeGcPenyaGuild()`, `encodeGcPenyaPlayer()`, `encodeGcTele()`, `encodeGcPlayerPoint()`. Each returns
    `Uint8Array`.
  - `readGuildCombatRequestPacket(bytes)` for the pretend servers.
  - Testkit: `writeGuildCombat(objectId, msg: GuildCombatMessage): ScriptMessage`.
  - `AddedMover.guildCombatState: number`.

- [ ] **Step 1: Write failing tests.**
  - `every sub-type reads back what the testkit wrote` (one case per sub, with A §3.2's field order).
  - `an unknown sub-type gives sub 'unknown' and its id`.
  - `GC_WARPLAYERLIST with fewer guild blocks than its count reads the blocks present and stops at the snapshot end`.
  - Byte-exact encoder tests: for example, `encodeGcLineup(7, [7, 9])` equals
    `type 0xf000d027 | BOOL 0 | u32 7 | i32 2 | u32 7 | u32 9`; `encodeGcApply(100000000)` equals
    `0xf000d022 | u8 0x02 | u32 100000000`.
  - In `addObj.test.ts`: `guildCombatState 1 is kept`.
- [ ] **Step 2:** Run `npx vitest run packages/protocol/test/guildCombat.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the reader, the encoders and the testkit writer.**
  - `time_t` fields read as i32.
  - `__int64` fields read as bigint and are kept as number when they are safe.
  - Strings read whole: the TOC bounds the snapshot.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: pass, and the overlay's `skipped` no longer counts
  `0xb8`.
- [ ] **Step 5: Commit** with `feat(siege): read the siege snapshot and send the siege packets`.

### Task B2 (M1): Siege book, login data, trophies, instant revive

**Files:**
- Create: `apps/client/src/world/guildCombat/guildCombatBook.ts`, `guildCombatRules.ts` (with `SIEGE`),
  `guildCombatHud.ts`.
- Modify:
  - `WorldSession.ts` (`sendGuildCombat(bytes)` next to `sendGuild` `:307`);
  - `WorldScreen.ts` (route in `apply` after guild `:947-953`; build after GuildHud `:2033-2046`; teardown
    `:4779-4806`);
  - `render/nameTags.ts:7-24`, `:134-151`;
  - `render/NameTagLayer.ts:29-108`, `:152-227`;
  - `WorldScreen.ts:4175-4189` (`recolorTags`);
  - the own-death path that opens the revive window (`hud/reviveWindow.ts:116-117` and its caller in `WorldScreen`).
- Modify: `tools/convert/src/ui/uiStage.ts:249-264`. Add a commented group "Guild Siege" with:
  - `TexGuildCombatWinner.bmp`, `TexGuildCombatBest.bmp` (colour key magenta);
  - `ButtGW1..4.tga`, `ButtGWDefender.tga`, `ButtGWRefresh.tga`, `ButtDefenderIcon.tga`, `ButtApply.tga`,
    `ButtSave.tga`, `ButtUp.tga`, `ButtDown.tga`.

  The housing branch also adds `ButtGWRefresh`; on merge keep one entry.
- Test: `apps/client/test/guildCombatBook.test.ts`, `apps/client/test/nameTags.test.ts`.

**Interfaces:**
- Consumes: B1's `GuildCombatMessage`, `AddedMover.guildCombatState`.
- Produces:
  - `class GuildCombatBook`, with `state`, `warState`, `winGuildId`, `winCount`, `bestPlayerId`, `requested`,
    `countdown: { label: number; endsAt: number } | null`, `guildStatus`, `guildRanks`, `playerRanks`,
    `warPlayers: Map<number /*defenderId*/, {id:number; status:number}[]>`, `log`, `playerPoints`;
    `apply(msg, now): GuildCombatEvent[]`; `combatStateOf(objectId): number`.
  - `NameTag.trophy?: 'winner' | 'best' | null`.
  - `trophyOf(book, playerId, guildId): 'best' | 'winner' | null`. It returns a trophy only in `CLOSE_STATE` and only
    for a player with a guild; the MVP beats the winner.

- [ ] **Step 1: Write failing tests.**
  - `GC_GCSTATE at login sets state and warState`.
  - `USERSTATE sets one mover's combat state`.
  - `trophyOf: best beats winner; none outside CLOSE_STATE; none without a guild`.
  - `the trophy is drawn one logo width + 2 left of the logo, or 30 px left of the wider line without a logo`
    (layout numbers from `MoverRender.cpp:1645-1688`).
  - `own death with combat state 1 sends REVIVAL_TO_LODESTAR and opens no revive window`.
- [ ] **Step 2:** Run the two test files. Expected: FAIL.
- [ ] **Step 3: Write the book, the trophy slot and the instant revive.** The book keeps the arrival time for every
  count-down. The siege chat lines and captions are B5's.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): siege state, trophies by the name, instant revive`. Checkpoint M1 lists the
  convert command (see the end).

### Task B3 (M2): Frankie and Donaris, apply, status, cancel, join, boards, boxes

**Files:**
- Modify: `apps/client/src/world/hud/moverMenu.ts`:
  - add MMI 26-30 and 33-41 to `MMI` (`:23-42`);
  - add `GUILD_COMBAT_ENTRIES` to `enabled` (`:108-113`);
  - leave out 36 (BESTPLAYER) and 41 (PENYA_RETURN), which no NPC carries.
- Modify: `WorldScreen.chooseNpcEntry` (`:4274-4314`). Dispatch to `guildCombatHud.openEntry(entry)`.
- Create: `hud/guildCombat/applyWindow.ts`, `statusWindow.ts`, `confirmWindows.ts` (cancel, join), `boardWindow.ts`,
  `infoBoxes.ts` (GC_TELE Yes/No, GC_DIAGMESSAGE OK).
- Create: `guildCombat/boardTexts.ts`, with the 6 board texts in V15 markup (`#b`, `#c`):
  - copied from `Client/Client/GuildCombatTEXT_1,2,3,5,6_ENG.inc`;
  - `GuildCombatRedChipGuild.inc` copied too;
  - with D8's values: level 50, "applications are open whenever no siege is running", open 6:52 AM / 6:52 PM and war
    8:00 AM / 8:00 PM PH daily, top 12 bids, at least 3 guilds, 6 lives.

  The header comment names each source file and each changed value.
- Modify: `apps/client/src/style.css`, with a desktop block and a phone block, as the guild block `:3191` does.
- Test: `apps/client/test/moverMenu.test.ts:13-30`, `apps/client/test/guildCombatRules.test.ts`,
  `apps/client/e2e/guildCombat.spec.ts` (new).

**Interfaces:**
- Consumes: the book and the encoders.
- Produces:
  - `bidRefusal(bid, ownBid, minBid): number | null`. It returns the TID of A §2.1: MORE_CURRENT_REQUEST when
    `ownBid && bid <= ownBid`, LIMIT_MIN when `!ownBid && bid < minBid`.
  - `statusRankRed(rank): boolean`, true when `rank > SIEGE.maxGuilds`.
  - `joinRefusal(jobIsVagrant): number | null`.
  - `GuildCombatHud.openEntry(mmi: number): void`.

- [ ] **Step 1: Write failing tests.**
  - `Frankie lists Apply, Status, Join, Entry, boards 1-3 enabled; Donaris lists Cancel, Ranking, Jackpot, Jackpot2, Info`.
  - `bidRefusal` cases.
  - `statusRankRed(12) is false, (13) is true`.
  - `vagrant cannot join`.
  - e2e on the pretend server:
    - Apply opens the 304x272 window with the min bid filled;
    - OK sends `GC_IN_APP`;
    - Status shows the list and the count-down;
    - walking away closes the NPC windows (`WndWorld.cpp:8402-8436`);
    - on the phone, each window fits inside 800x350.
- [ ] **Step 2:** Run the unit files. Expected: FAIL.
- [ ] **Step 3: Write the code.**
  - Windows from `ResWindow` with the resdata layouts of A §2.1-2.8.
  - GC_GETPENYAGUILD and GC_GETPENYAPLAYER results become the message boxes of A §3.2.
  - The JACKPOT entry is sent only by the guild master. For anyone else it is silent, as Neuz.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, then `npx playwright test -c apps/client/playwright.config.ts
  guildCombat.spec.ts --project=chromium --project=phone` once. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): Frankie and Donaris windows, boards and boxes`.

### Task B4 (M3): The line-up window, the start-point window

**Files:**
- Create: `hud/guildCombat/lineupWindow.ts` (656x432, A §2.3) and `startPointWindow.ts` (320x176, A §2.4).
- Modify: `style.css`. On the phone the line-up window is a compact centred panel: both lists side by side, each
  scrolling, with the buttons below.
- Test: `apps/client/test/guildCombatRules.test.ts`, `e2e/guildCombat.spec.ts`.

**Interfaces:**
- Produces:
  - `lineupAddRefusal(member, list, maxJoin): number | null`. It refuses at `list.length >= maxJoin`, which is the
    server's limit (`DPSrvr.cpp:5274`); Neuz allowed one more by mistake (`WndField.cpp:16161`). It also refuses
    level < 30, not a member, and already listed.
  - `lineupFinishRefusal(list, defenderId, masterOrKingpinIds): number | null`.
  - `defenderRefusal(memberId, masterId, listSize): number | null`.

- [ ] **Step 1: Write failing tests.** Each refusal returns its TID from A §2.3, and:
  - `the first SIEGE.maxWarPlayers rows are drawn blue, the rest red`;
  - `the start-point window sends the picked area at the time-out, or 99 when none was picked`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Write both windows.**
  - The online guild members come from the guild book, sorted by level from low to high.
  - The saved entrants from the packet go into the right-hand list (A §2.3 "Fill").
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, and one e2e run (line-up Complete sends the ids in order).
  Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): line-up and start-point windows`.

### Task B5 (M4): In the arena

**Files:**
- Create: `hud/guildCombat/arenaHud.ts` (count-down, guild board, player board, own-guild list, captions, the "be
  ready" lines).
- Create: `apps/client/src/world/combat/siege.ts`.
- Modify:
  - `combat/attackLoop.ts:120-132` (one more player branch);
  - `render/nameTags.ts:143-151` (siege colours);
  - the mover draw and pick paths in `WorldScreen` (hide and no-pick);
  - `hud/minimap.ts` (the mask in 202);
  - the BGM player calls (BGM_BA_CRISIS at war start, BGM_IN_FITUP at the end);
  - chat: drop the lines of hidden players; add the white per-kill line from GC_LOG_REALTIME, which uses Neuz's fixed
    English format (`DPClient.cpp:7514-7592`); add the state lines of A §4.1, which also show outside 202.
- Modify: `tools/convert/src/ui/uiStage.ts`. Convert `World/WdGuildWar/WdGuildWar_Mask.dds` to
  `minimaps/wdguildwar/mask.png`.
- Test: `apps/client/test/siegeCombat.test.ts`, `apps/client/test/arenaHud.test.ts`, `e2e/guildCombat.spec.ts`.

**Interfaces:**
- Consumes: the book (`warState`, `combatStateOf`, the precedence lists).
- Produces:
  - `isSiegeTarget(own: { worldId; guildId; combatState }, target: { guildId; combatState }, warState): boolean`. It is
    true only when all of these hold: the world is 202, the war state is WAR_WAR (104), both combat states are 1, both
    guild ids are not 0, and the guilds differ.
  - `siegeHidden(ownState: number, target: {combatState; listed: boolean}): boolean`.
  - `siegeNameColor(ownGuildId, otherGuildId): number | null`. In 202, with both guild ids not 0: `0xff00ff00` for the
    same guild, else `0xffffffff`.
  - `siegeDefenderLine(isDefender, gcState): number | null`. It returns `0xFFFEA8FF` from MAINTENANCE on.

- [ ] **Step 1: Write failing tests.**
  - The `isSiegeTarget` truth table, with each of the five conditions false in turn.
  - `siegeHidden`: a fighter hides non-fighters; a waiting entrant hides unlisted players; a spectator hides no one.
  - `arenaHud`:
    - the desktop guild board lists all 12 guilds;
    - the player board shows the top 10 plus the own row;
    - on the phone (≤ 350 px tall) both boards show the top 5 plus the own row and fold on a tap of their title;
    - lives are shown as `max(n-1, 0)`.
  - `login at warState 104 with USERSTATE 1 brings up the HUD and the PvP rule`. This is Review Focus 1.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Write the code.**
  - Colours, positions and texts come from A §4.1-4.4.
  - The desktop board origin is `(width-150, 200)`.
  - The phone boards sit under the minimap, right-aligned, and must clear the attack button and the action slots.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, and one phone e2e run at 568x320 and 730x320: with 12 guilds on
  the boards, neither box overlaps the attack button or the slot row. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): arena HUD, siege PvP, names, hiding, minimap mask`.

### Task B6 (M5): The result window, Donaris's ranking

**Files:**
- Create: `hud/guildCombat/resultWindow.ts` (560x320, 2 tabs, battle log, Save) and `rankingWindow.ts` (400x384, 5
  tabs).
- Test: `apps/client/test/guildCombatResult.test.ts`, `e2e/guildCombat.spec.ts`.

**Interfaces:**
- Consumes: the book's `log`, `guildRanks`, `playerRanks`, `bestPlayerId` and `playerPoints`; the player-name lookup in
  `packages/protocol/src/world/playerData.ts`, used as Messenger uses it.
- Produces:
  - `resultRows(book): { guilds: string[]; players: string[] }`. Formats are from A §2.10. Rank 1 gets " WINNER" and
    the MVP gets " MVP"; names are cut at 10 characters plus "...".
  - `logLines(entry, ownGuildId): string[]`. An unknown guild id shows `?`.
  - `rankTabs(points, jobs): RankRow[][]`. It makes 5 tabs; each keeps 100 rows at most, highest first, and ties share a
    rank. Vagrants are left out.

- [ ] **Step 1: Write failing tests.**
  - `resultRows` formats.
  - `logLines` marks own kills green and own deaths red, and an unknown guild gives `?`.
  - `rankTabs` caps at 100, shares ranks on ties, and leaves vagrants out.
  - `Save downloads GuildLog_YYYYMMDD.txt`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Write both windows.** The result window opens on GC_LOG; the ranking window opens on GC_PLAYERPOINT.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): result and ranking windows`.

---

## Part C: Owner extras (FlyffWeb, branch `guild-siege`, after W1 and B2)

### Task C1: Weekly Champion and Weekly MVP marks

**Files:**
- Create: `apps/client/src/world/guildCombat/siegeWebApi.ts` (fetches `/api/siege/*`, the same origin as `/play`).
- Modify: `render/nameTags.ts` and `NameTagLayer.ts`. Add `NameTag.badge?: 'weeklyChampion' | 'weeklyMvp' | null`,
  drawn one slot left of the trophy, or in the trophy's place when there is none.
- Modify: `tools/convert/src/ui/uiStage.ts`. Derive two pictures from the V15 trophies: a gold tint (multiply by
  `#FFD24A`), with magenta made transparent. They are `ui/texguildcombatweeklywinner.png` and
  `ui/texguildcombatweeklybest.png`. The owner approves the look at the checkpoint.
- Test: `apps/client/test/siegeWebApi.test.ts`, `apps/client/test/nameTags.test.ts`.

**Interfaces:**
- Consumes: W1's `SiegeWeekly`, and the `playerId` and `guildId` from ADD_OBJ.
- Produces:
  - `class SiegeWeeklyFeed`, with `start()`, `stop()`, `current(now): SiegeWeekly | null`.
  - `badgeOf(weekly, playerId, guildId, now): 'weeklyMvp' | 'weeklyChampion' | null`. The MVP beats the champion, and
    nothing is returned after `expiresAt`.
  - The badges show in every world and at every siege state.

- [ ] **Step 1: Write failing tests.**
  - `fetches at world entry and every 5 min; one call in flight; 3 s timeout`.
  - `a failed fetch keeps the last good answer until it expires`.
  - `badgeOf` cases, including after `expiresAt`.
  - `a weekly MVP in the champion guild shows only the MVP mark`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Write the feed, the badge slot and the derived pictures.**
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): weekly champion and MVP marks from the website`.

### Task C2: The Siege Ranking window and its icon

**Files:**
- Create: `hud/guildCombat/siegeRankingWindow.ts`.
  - V15 look, from the `APP_GUILDCOMBAT_RANK_P` frame: 400x384, a tab control and a close button.
  - Tabs: **Individual** and **Guild**.
  - Two header buttons: **This week** and **All time**.
- Modify: `hud/mobileTools.ts:52-61`, `:89-90`. Add an optional `picture` key on `MobileTool`, so a tool with no applet
  can have an icon.
- Modify: `style.css:1639-1653` (the phone grid); the desktop button left of the Navigator; `hud/taskBar.ts:117-147` (the
  Start menu line "Siege Ranking").
- Test:
  - `apps/client/test/siegeRankingWindow.test.ts`, `apps/client/test/mobileTools.test.ts:46-56`;
  - `e2e/topRightIcons.spec.ts:14-18`, `:124-171`;
  - the hud and landscape menu-count tests: the Start menu grows by one line. Other unmerged branches add lines too, so
    on merge count them all.

**Interfaces:**
- Consumes: W1's `/api/siege/ranking`, through `siegeWebApi.ts`.
- Produces: `SiegeRankingWindow.open(board?: 'player' | 'guild')`.
  - Individual rows: rank, name, job, guild, points.
  - Guild rows: rank, guild, wins, sieges, points.
  - The own row is blue, as in Neuz's ranking. "Not available" shows on a 503 or a time-out.

- [ ] **Step 1: Write failing tests.**
  - `switching tab or span loads that board once and reuses it for 60 s`.
  - `the own name or own guild row is blue`.
  - `503 shows not available`.
  - `the icon opens the window on phone and desktop`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Write the window, the icon and the menu line.**
  - Phone: first try `repeat(5, auto)` with the siege icon 5th in row 1.
  - Run `topRightIcons.spec.ts` once at 568, 730, 750 and 844 px.
  - If any size fails its constraints (clear of the status window, the Navigator and the target bar), use the fallback:
    the siege icon replaces Status, and the grid stays 4x2.
  - Write down which one shipped in the checkpoint.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** with `feat(siege): Siege Ranking window and top-right icon`.

---

## Order, sessions and checkpoints

- **S1 and W1 run alongside B1-B6:** they share no files with them. S1 is in the outer repo; W1 touches only
  `apps/web`.
- **B1 → B2 → B3 → B4 → B5 → B6 run in order:** each builds on the one before.
- **C1 needs W1 and B2. C2 needs W1.**
- **Checkpoints:** one owner checkpoint per milestone, M1-M5, plus one for C. Each has:
  - the convert command, after merging into main:
    `npm run convert -- --only "TexGuildCombat*,ButtGW*,ButtDefenderIcon*,ButtApply*,ButtSave*,ButtUp*,ButtDown*,WdGuildWar_Mask*"`.
    If the converted audio lacks the two siege tunes, add `BgmBaCrisis*,BgmInFitup*`. No gear sync.
  - the e2e command `npm run test:e2e:client`, on the PC, about 20 min. Pass: no `failed` line.
  - the live test on the VM: 3 guilds at the level the test script sets, at least 3 players, using `/gcopen` and
    `/gcnext` to skip the waits. Pass: each step of research-note §1.2 is seen.
  - the iPhone landscape check.
- **Merge:** FlyffWeb `guild-siege` into local main when the owner says. The outer `guild-siege` patch is applied to the
  main `Source` before the next combined server build, then rebuilt. The owner copies the exes into `Program\`.
