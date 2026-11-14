# Admin panel checkpoint (2026-11-15)

Branch `admin-panel` (FlyffWeb) from `e9b09be`; server repo branch `admin-panel-deploy` (`2e0e7b4`). Built from
`docs/superpowers/plans/2026-11-15-admin-panel.md` (spec `docs/superpowers/specs/2026-11-15-admin-panel-design.md`).
Nothing merged or pushed. Owner steps: `docs/admin-panel-deploy.md`.

## Tests at the end

- `npx vitest run` (whole repo, before the restyle): 331 files, 4743 passed, 10 skipped.
- `npx vitest run apps/web`: 148 passed. `npm run test:e2e:admin`: 14 passed, 1 skipped (the phone-menu check on desktop).
- Not run: the SQL against a real SQL Server (no SQL Server on this PC), the deploy scripts as administrator.

## Calls made while building (each with its cost if wrong)

- Pre-flight: Ruling: LogRow is written out with `account: string | null; characterName: string | null` instead of `Required<LogEntry>` — the columns are NULL for rows with no target (logins) — cost if wrong: none.
- Pre-flight: Ruling: Task 7 creates `itemCatalog.ts` holding only `CatalogItem`; Task 14 adds its functions — keeps AdminDeps typed from Task 7 — cost if wrong: none.
- Pre-flight: Ruling: main.ts wiring is split: Task 7 adds the admin-start function with the store and catalog injected; Task 9 passes sqlAdminStore; Task 14 passes the loaded catalog — each task's wiring needs what exists by then — cost if wrong: none.
- Task 2: Ruling: the settings checks move from config.ts to configHelpers.ts so admin/config.ts can share them without a circular import — cost if wrong: none (config.test.ts unchanged and green).
- Task 4: Ruling: buildCredentials/checkSetupPassword live in apps/web/scripts/adminSetupRules.ts, not adminSetup.ts — importing the interactive script in a test would run it — cost if wrong: none. Lines are read through readline's async iterator so piped answers work; smoke-run: short password → exit 1, 3 wrong codes → exit 1, nothing written.
- Task 7: Ruling: a write without a requestId answers 400 invalid (field requestId), a repeated one 409 repeat — the plan only named the repeat — cost if wrong: none.
- Task 7: Ruling: while the login guard refuses (429), no audit row is written, only a log line — otherwise anyone could fill WEB_ADMIN_LOG; real failed tries stay capped by the guard (5/address/15 min, 20/hour in all) — cost if wrong: fewer rows for blocked floods.
- Task 7: Ruling: a failed login's audit row holds {nameOk, passwordOk, codeOk}, not the typed name — a password typed into the name box would otherwise be logged — cost if wrong: the log does not show which name was tried.
- Task 7: Ruling: a login whose audit row cannot be written still succeeds (with a warning line) — a login changes no data; every change still needs its row (runAudited) — cost if wrong: a login missing from Recent logins while SQL is down.
- Task 7: Ruling: main.ts's start lives in src/admin/startAdmin.ts (tested: bad section, missing/bad login file, taken port → "admin: panel off: ..." and no throw); main.ts calls it in Task 9 when sqlAdminStore exists — cost if wrong: none.
- Task 7: Ruling: test helpers live in apps/web/test/support (memoryAdminStore.ts, adminDeps.ts) and are shared by Tasks 10-14 and the demo — cost if wrong: none.
- Task 8: Ruling: procedures are made with "IF OBJECT_ID(..) IS NOT NULL DROP PROCEDURE" then CREATE, not web-login.sql's EXEC(N'CREATE ...') stub — the stub is dynamic SQL, which the plan forbids; DROP+CREATE works on every version and the grants follow each database's part — cost if wrong: none.
- Task 8: Ruling: write procedures that can refuse return -1 (bad letter, bad date), 0 (no such row), 1 (changed); the store maps >0 to true — gives admin-check.sql a real "refused" signal without touching an account — cost if wrong: none.
- Task 8: Ruling: undelete also sets CHARACTER_TBL.BlockTime to yesterday — the delete set it to the delete day and the old value is gone — cost if wrong: a character BlockTime that was a real block is lost (none known in this server).
- Task 8: Ruling: too_old = End_Time's day <= today-7, as CHARACTER_DELETE_STR purges; the memory store follows — cost if wrong: one day's difference at the edge.
- Task 10: Ruling: actions are registered in src/admin/actions/index.ts (ADMIN_ACTIONS), passed to startAdmin by main.ts; field readers in actions/fields.ts — one registry instead of editing main.ts per task — cost if wrong: none.
- Task 11: Ruling: players is null whenever the online list is (SQL down or World not up) — a count from stale flags would mislead — cost if wrong: no number shown during maintenance.
- Task 12: Ruling: packages/protocol's checkSignUp is split into checkSignUpPassword(account, password) and checkSignUpEmail(email), both exported; checkSignUp calls them (same order, same messages; signUp/signUpHandler tests green) — the panel's password reset and email change need those rules alone, for old accounts whose names break today's account rules — cost if wrong: none.
- Task 12: Ruling: a database "not changed" on an account write answers 409 refused and ends the row 'refused' — cost if wrong: none.
- Task 13: Ruling: the edit lock is checked inside runAudited's step (row begun first, then the probe, then the change), so a locked try is a 'refused' row with what the probe saw — cost if wrong: one extra row per locked try.
- Task 14: Ruling: loadItemCatalog(assetsDir, warn) takes the warn function (the plan said 'a warning') so tests stay quiet and main.ts uses consoleLogger — cost if wrong: none. Cancel checks the pending row first: not found → 404, a game row → 409 before any audit row; the online check is inside the audited step.
- Tasks 15-17: Ruling: the page is one commit — panel.js imports every tab module, so a shell-only commit would not load — cost if wrong: coarser history.
- Tasks 15-17: Ruling: adminDemo.ts (Task 18's demo) was written first, to check the page by hand — cost if wrong: none.
- Tasks 15-17: Ruling: pending sends carry the item's name (actions/pending.ts, from the item list) so the tables show "Vagrant Cap" instead of "item 500"; test: adminSends 'name' — cost if wrong: none.
- Task 18: Ruling: one login per run (a `setup` project + storageState), and e2e/codes.ts hands out each 30-s step once (a file in node_modules/.cache/admin-e2e) — the server takes a code once, so a login per test would wait 30 s each — cost if wrong: none.
- Task 18: Ruling: the demo's login constants live in scripts/adminDemoLogin.ts (importing adminDemo.ts would start a server) — cost if wrong: none.
- Task 19: Ruling: a guide test (apps/web/test/adminHostingGuide.test.ts) pins step 8b's block to ADMIN_CSP and keeps step 8's block at one site line (Get-Caddyfile's rule) — cost if wrong: none.
- Task 20: Ruling: no `run.bat 4-Setup-FlyffWeb -DryRun` here — the scripts need an administrator shell and C:\flyff-web\deploy.json, which this PC does not have; the function-level checks above stand in, and the owner's VM/VPS run is the real check — cost if wrong: a script path untried until the owner runs it.
- Task 20: Ruling: 2-Setup-Database makes flyffweb_admin only while adminPanel is true (least privilege: no unused login), and 4-Setup writes the admin section fresh each run (never kept from the old file), so adminPanel false + a re-run switches the panel off — cost if wrong: none.
- Task 20: Ruling: 8092 joins $ClosedPorts (5-Firewall blocks it) and Check-Server's outside port list, though the panel listens on 127.0.0.1 only — a second fence — cost if wrong: none.
- Final: Ruling: anyone can keep the panel's login closed (20 wrong tries an hour from anywhere) — stands for version 1: it fails closed, the spec chose it, and the owner can still restart the service; a later piece can let a right code past it — cost if wrong: the owner cannot log in while someone keeps trying
- Final: Ruling: 429-refused logins get no audit row — stands (Task 7's ruling: nobody can fill the log) — cost if wrong: floods show only in web.log
- Final: Ruling: the narrow races (lock probe vs a server starting; cancel vs delivery at login) — stand: the design accepts them — cost if wrong: a rare edit lost or a cancel racing a delivery
- Final: Ruling: the penya cap uses CHARACTER_TBL.m_dwGold, which can be older than the Database server's memory — stands: 2,000,000,000 leaves 147 million under the game's int limit — cost if wrong: an overflow only if a character gained more than that since its last save
- Final: Ruling: a case-insensitive SQL collation is assumed (= on names) — stands: Database.sql sets none, so the server default (CI) applies; admin-check.sql would show odd searches otherwise — cost if wrong: lookups miss names typed in another case
- Final: Ruling: scrypt runs on the site's thread — stands: the login guard caps it at about 20 an hour — cost if wrong: a few 50 ms pauses
- Final: Ruling: delete refuses every guild member (the game only refuses those in a war) — stands: the Core server, stopped then, takes members out of a guild — cost if wrong: the owner removes the character from its guild in the game first
- Final: Ruling: changes to the live LOGIN_STR or usp_CreateNewAccount by the server-security work — outside this branch — cost if wrong: the VM run shows it
- Final: Ruling: no uninstall SQL script — stands: the kill switch is in the settings — cost if wrong: the procedures stay unused
- Restyle (owner request, 2026-11-15): Ruling: the owner's Figma link could not be read (the connector's account has no access); the owner then gave BootstrapMade's TrendyAdmin demo — the panel takes its look (dark navy-purple, purple-to-magenta active pill and greeting card, stat cards, status pills, phone top bar + slide-in sidebar) with our own CSS, SVG icons and markup, nothing copied — cost if wrong: a look the owner tunes later. Found by the phone browser check: the sidebar and the login box did not scroll on short screens — fixed (overflow, margin:auto, max-height:480px rules); test:e2e:admin 14 passed, 1 skipped (menu test on desktop), apps/web 148/148.

## Review fixes (whole-branch review, one fix pass)

- undelete could make two live characters with one name (the game's create checks live names only) — adminCharacters 'does not undo a delete while a live character has taken the name' RED→GREEN; usp_AdminCharacterUndelete returns 'name_taken' (adminSql check)
- the edit lock failed open (a timeout or wrong host read as 'down') — probeState tells open / closed (ECONNREFUSED) / unknown, 3 s wait (Windows answers a refused local port after ~2 s), unknown keeps edits locked; adminStatus 'keeps edits locked when a Database or World port gives no clear answer' + 'tells a refused port from one that does not answer' RED→GREEN, apps/web 146/146
- the 30-minute idle logout never fired while Status was open (its 30-s refresh touched the session) — refreshes send X-Admin-Background: 1 and SessionBook.get(id, touch=false) leaves lastSeen; adminSessions 'does not count a background read as use' + adminServer 'lets background reads through without keeping an idle session alive' RED→GREEN, apps/web 148/148
- a send whose answer was lost showed "Something went wrong (0)" and invited a second send — a write with no answer (or a 502/503/504 from Caddy) now says the change may have been made; Send refreshes its pending list after any try; e2e 'a send whose answer is lost says it may have been made, and shows the pending list' RED ("Something went wrong (0).") → GREEN, test:e2e:admin 13/13

## Small points left for later

- GM level writes one audit row for two calls; if the character-database call throws, the row says failed while the account's letter already changed
- dates read from GETDATE() datetime columns (account Made, character Made, send Sent) show shifted by the VPS's time zone (mssql useUTC); the audit time is right
- a ban date only SQL Server refuses (clocks differ) answers 409 refused, not 400 invalid until
- too_old is one day stricter than CHARACTER_DELETE_STR's purge
- sends to a deleted character are accepted (the character view's Send button shows on deleted characters)
- the deploy's admin section does not pass the World/Cache ports from WorldServer.ini/CacheServer.ini; with a World key other than 101, World reads down and the online list stays stale (the live key is 101)
- docs/admin-panel-deploy.md §2.4 leaves out running 2-Setup-Database before 4-Setup-FlyffWeb (4-Setup refuses with a clear message)
- expired sessions never asked for again are not swept; the Status online table has no job column; adminPanel false leaves the flyffweb_admin login enabled
