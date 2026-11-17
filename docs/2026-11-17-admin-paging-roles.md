# Admin panel: paged lists, account and character levels, VIP 1-4 (2026-11-17)

Branch `admin-paging-roles`, from main f24d217. The server side (VIP letters in the game, the game's procedures) is
outer branch `vip-auth`, `docs/2026-11-17-vip-auth-deploy.md` there. Nothing merged or pushed.

## What it does

1. **Accounts and Characters open on their list**, 10 rows a page, with page buttons, "Showing 11-20 of 33" and when
   the rows were read. Find filters the same list; an empty Find (or Show all) shows everything.
   - The panel keeps each page 30 seconds (`src/admin/pageCache.ts`); the browser keeps the pages it saw 5 minutes
     (`admin/js/pages.js`). Going back to a page or to the tab reads nothing.
   - **Refresh** reads the page again and drops every kept page of that list, in the panel and the browser.
   - **After an edit** only what it changed goes: a ban or a level drops the pages that show that account; a new account
     drops every account page (the totals change); an email change also drops the email searches; a rename drops every
     character page (the name order moves) and the character-name searches; penya, move, delete, undo and a level drop
     the pages that show that character. Each write's answer carries the same `stale` list for the browser.
   - New procedures `usp_AdminAccountPage`, `usp_AdminCharacterPage`: `OFFSET`/`FETCH`, the total as an `OUTPUT`.
2. **Levels.** The choices: Player, VIP 1-4, Helper, GM 1-3, Operator, Admin.
   - **Account level** (account view): the account's own letter, and its characters' too unless "Also its characters"
     is unticked. Two audit rows now (`accounts.authority`, then `accounts.charactersAuthority`), so the log says which
     part was done if the second fails (the old one-row-for-two-calls issue).
   - **Character level** (character view, new): one character's own letter (`characters.authority`, new procedure
     `usp_AdminCharacterAuthority`). No server stop needed: the Database server reads the letter from SQL Server at each
     entry into the game. The view shows "Plays as": the account's level wins unless the account is Player or VIP.
   - The procedures take only these letters, compared as bytes (a lower-case `p` would be past `P`: admin in the game).
3. **VIP 1-4** in `packages/protocol` (`world/authority.ts`: `Authority.VIP1`... = `A`, `B`, `C`, `E`, titles,
   `authorityLevel`, `gameAuthority`), the panel's choices, and the client's chat check (`isAuthorizationHigher`
   counts a VIP letter as a player's `F`, so `/w`, `/s`... work for VIP).

## Calls made (each with its cost if wrong)

- Letters `A`, `B`, `C`, `E`: the only safe place is below `F` (see the outer doc) - cost: none known.
- Searching accounts by character name pages in memory (at most 50 characters' accounts), as the old search did -
  cost: an account past those 50 is not listed.
- The panel keeps pages 30 s, the browser 5 min - cost: a player's new account shows up to 30 s late in the panel, or
  5 min late in a browser that already showed that page (Refresh shows it at once).
- A character's own level is not locked while the servers run - cost: none (read fresh at each entry; the save never
  writes it).
- The phone menu e2e check scrolls the sidebar to Log: since the VIP tab it is below the fold of a phone held sideways.

## Tests (2026-11-17)

- `npm run typecheck`: clean.
- `npx vitest run apps/web`: 30 files, 217 passed (one run had the VIP pictures test time out once under load; it passes
  alone). Also `packages/protocol/test/authority.test.ts` and `apps/client/test/vipAuthority.test.ts`.
- `npm run test:e2e:admin` (Chromium, desktop + phone held sideways): 26 passed, 1 skipped (the phone-only menu check
  on desktop).
- `npm run admin:demo`: looked at on desktop and phone width (30 more made-up players, VIP letters among them).
- Not run: the SQL on a real SQL Server (the VM run is the first).

## Your steps

**In the VM**, after the server part (new World + Database, `BB_VipAuth.ps1 -Apply`):

1. Get this branch's FlyffWeb into the VM, `npm install`.
2. `cd <FlyffWeb>\apps\web\sql`, then `powershell -ExecutionPolicy Bypass -File .\Install-AdminLogin.ps1` with the same
   `flyffweb_admin` password as in `web.config.json`. Pass: `Check passed: ...`.
3. Run `admin-check.sql` as `flyffweb_admin`. Pass: 10 lines, all `PASS` (7-10 are new: the two lists and the letters).
4. Restart the web service, open the panel. Pass:
   - Accounts and Characters show rows at once, 10 a page, the total right; page 2 and back; Refresh;
   - an account's level with and without "Also its characters"; a character's level; the Log tab shows each change.
5. The in-game checks of the outer doc.

**On the VPS**, after the owner merges: server exes and `BB_VipAuth.ps1 -Apply` first (outer doc), then
`run.bat Update-FlyffWeb`, `run.bat 2-Setup-Database` (re-installs the panel's procedures with the saved password),
`nssm restart flyffweb-site`. Give VIP letters only after all of that.
