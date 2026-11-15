# Guild Siege: checkpoint for the owner (2026-11-15)

This build has the V15 Guild Siege and your five changes. Plan: `docs/superpowers/plans/2026-11-15-guild-siege.md`.
Research: `docs/guild-siege/research/`.

**Status:** nothing is merged or pushed yet.
- Each task was built and reviewed.
- The builders ran the quick checks only: unit tests and the typecheck.
- Your checks follow, in order.

## Where the work is

| Part | Where | Commits |
|---|---|---|
| Server patch (open times, level 50, 12 guilds) | outer repo branch `guild-siege`, worktree `Bakbak\Blouflash-worktrees\guild-siege` | `bee54d3`, `fae0840` |
| FlyffWeb (game client + website API) | FlyffWeb branch `guild-siege`, worktree `Bakbak\FlyffWeb-worktrees\guild-siege` | `905b723`..`HEAD` |

## 1. First: are there 3 guilds at level 50? (SSMS on the VPS, 1 min)

`SELECT m_szGuild, m_nLevel FROM CHARACTER_01_DBF.dbo.GUILD_TBL WHERE m_nLevel >= 50`

- **3 or more rows:** fine.
- **Fewer:** no siege can open. Either keep 50 and wait, or set a lower `GUILDLEVEL` in `Resource\GuildCombat.txt` for the beta (one line).

## 2. Server test in the VM (about 30 min)

Follow `docs\guild-siege\README.md` on the outer branch. It names the new `World.exe`, its hash, where to copy it, and
the test.

The test uses a copy of `GuildCombat.txt` with two open times 10 minutes apart today.

**Pass:** the siege opens at both times, and the Status window's count-down showed the right time before each.

The real `GuildCombat.txt` opens at **6:52 AM and 6:52 PM** every day. The war starts at 8:00 AM and 8:00 PM.

## 3. Website SQL in the VM (5 min)

1. Re-run `apps\web\sql\Install-WebLogin.ps1`. It can be run again; it adds the three siege procedures.
2. Then run:
   - `curl http://127.0.0.1:8091/api/siege/ranking?board=guild&span=all`
   - `curl http://127.0.0.1:8091/api/siege/ranking?board=player&span=week`
   - `curl http://127.0.0.1:8091/api/siege/weekly`

**Pass:**
- Both ranking calls answer 200 with `rows`. The list can be empty.
- `weekly` answers 200. It stays all `null` until a siege ends on a Saturday between 20:00 and 21:59.

**Good to know:**
- A disbanded guild drops out of the rankings.
- A deleted character drops out of the rankings.
- If the weekly champion guild is disbanded, or the weekly MVP is deleted, that half of the weekly answer is `null`.

## 4. Pictures (on main, after the merge, about 5 min)

```
npm run convert -- --only "TexGuildCombat*,ButtGW*,ButtDefenderIcon*,ButtApply*,ButtSave*,ButtUp*,ButtDown*,WdGuildWar_Mask*"
```

No gear sync. Audio, world and data need no convert: world 202 and the siege music are already in.

`TexGuildCombat*` also makes the two **gold** weekly marks (`ui/texguildcombatweeklywinner.png`, `ui/texguildcombatweeklybest.png`).

Until you convert:
- the buttons are blank;
- the trophies and gold marks are not drawn;
- the minimap mask is missing;
- the top-right siege icon shows the word "Siege".

## 5. Full e2e run (PC, about 20 min)

`npm run test:e2e:client`

**Pass:** no `failed` line, except two that already failed on main before this work, in `landscape.spec.ts`:
- "every lobby screen fits a landscape phone"
- "turning upright mid-fight keeps attacking"

The siege spec, `guildCombat.spec.ts`, passed in the builders' last run on desktop and phone. That run covered the
arena with PvP, the kill line, the end caption and a 10-member guild list on 568x320 and 730x320. The "Ranking and
result" case was re-run on its own after a test fix.

If anything fails, send me the failing test name and its error lines.

## 6. Live siege in the VM (about 2 h, or less with GM commands)

1. Get 3 guilds that meet the level. If needed, use the test copy of `GuildCombat.txt` from step 2, which has `GUILDLEVEL 1`.
2. Each master applies at Frankie with 100M.
3. Use `/gcopen` to open the siege now, then `/gcnext` to skip each wait.

**Check each step:**
- **Line-up:** a master picks fighters and a defender, then Complete.
- **Entry:** "teleport?" box, Join at Frankie, the watch stand.
- **Start point:** the 4-area window, 10 s.
- **War:** the guild board and player board on the right; your guild's list on the left; names green for your guild and white for others; non-fighters hidden for fighters; fighters of other guilds can be hit, your own guild can't; death revives at once on the stand.
- **End:** the result window (2 tabs, battle log, Save), back to Flaris, the trophies by the winner's and MVP's names.
- **Donaris:** the Ranking menu shows the all-time points.

**Pass:** each step happens on desktop and on the phone.

## 7. iPhone landscape (by hand, 15 min)

- Frankie's and Donaris's windows fit on the screen and their buttons can be tapped.
- In the arena, the boards don't cover the attack button or the action slots.
- The boards fold when you tap their title.
- The siege icon at the top right opens the Siege Ranking window.
- Both tabs and This week / All time work in the Siege Ranking window.

## 8. Your yes/no on the look

**The gold weekly marks.** A gold tint of the V15 trophies, drawn by the name of:
- every member of the guild that won the latest Saturday 8 PM siege;
- that siege's MVP.

They last 7 days.

**The phone icon.** The 5+4 grid did not fit at 730 px (the target bar overlapped an icon), so the plan's fallback
shipped:
- the siege icon replaces **Status**, and the grid stays 4x2;
- Status still opens from the Start menu and its hotkey, and its window shows from the start anyway.

**Desktop.** A siege button left of the Navigator, and a Start menu line "Siege Ranking". The Start menu now has 16 lines.

## 9. On merging

- **The Start menu line counts.** The `housing` and `social` branches also add a Start menu line. Recount the lines and
  fix the counts in `apps/client/test/hud.test.ts` and `apps/client/e2e/landscape.spec.ts`: the height (428) and the
  8+8 phone columns.
- **`ButtGWRefresh.tga`.** The `housing` branch also adds it to `THEME_FILES`; keep one entry.
- **The outer patch.** Apply `patches\2026-11-15-guild-siege-schedule.patch` to the main `Source` before the next
  combined server build, then rebuild World.

## What was left as is

- **Neuz (out of scope):** it still paints applicants 9-12 red, its boards still say the old values, and it shows the
  status count-down in its own long format.
- **The 1:1 siege:** not touched. Its menus stay greyed.
- **Board 1 now says:** level 50, apply any time no siege is running, open 6:52 AM / 6:52 PM, war 8:00 AM / 8:00 PM PH
  daily, the top 12 bids, at least 3 guilds, 6 lives.
- **Board typos:** the stock spelling mistakes on the boards (for example "seige") are kept as V15 has them.
- **The status count-down:** it uses your short format ("11h52m"). The arena clock stays hh:mm:ss.
- **The apply window:** it refuses a bid above your guild master's penya plus the current bid, or above 2,147,483,647,
  with V15's own "not enough penya" text. Commas typed in the bid are ignored.
- **The quest tracker:** it is hidden inside the siege map (202), so the boards and your guild's list can be read.
