# Honour window: checkpoint (2026-11-11)

Why: the world server gives the Lord the `HS_LORD` honour title (`_Common/Mover.cpp:11493-11497`), but a title shows over
a name only after the player picks it in Neuz's Fame/Master page (`CWndHonor`). FlyffWeb had no such page, so a new
Lord could not show "[Lord]". This branch adds the page for every title.

Branch `honor` (`FlyffWeb-worktrees/honor`, from main 616f135). Not merged, not pushed.

## What Neuz does (V15 source, read in CP949)

- The page is the Character window's second tab (`CWndCharacter::OnInitialUpdate`, `_Interface/WndField.cpp:4243-4260`),
  laid out by `APP_HONOR` (`Resource/resdata.inc:1241-1270`): a list (6, 8)-(172, 382) with a scroll bar, and ButtOk at
  (48, 390)-(120, 410).
- `CWndHonor::RefreshList` (`WndField.cpp:4097-4122`): no row chosen, OK disabled; with titles, "No Title" first, then
  each earned title. With none, `OnDraw` writes "No fame obtained." (`:4072-4086`).
- A row picks -1 ("No Title") or its title and enables OK; OK disables itself and sends HONOR_CHANGE_REQ
  (`OnChildNotify`, `:4138-4170`; `SendReqHonorTitleChange`, `Neuz/DPClient.cpp:17235-17240`).
- The server checks the count against the need and answers HONOR_CHANGE_ACK to everyone in view
  (`WORLDSERVER/DPSrvr.cpp:8312-8335`, `User.cpp:7906-7918`); the client sets `m_nHonor` and the name tag
  (`DPClient.cpp:17280-17292`).
- The earned list (`CTitleManager::m_vecEarned`, `_Common/honor.cpp:484-520`): a title is earned when its count is at least
  its need (`honorList.txt`'s 4th column) and the need is above 0. The own ADD_OBJ fills it quietly
  (`ObjSerializeOpt.cpp:612-634`); HONOR_LIST_ACK adds new ones with "Congratulations! You have earned the title: %s!"
  and removes lost ones (`DPClient.cpp:17242-17278`). The server sends that list after a stat change, a job change and
  the like (`DPSrvr.cpp:8045-8047`, `Mover.cpp:1820-1822`), not at login.

## Built

- **data** (`packages/formats/src/inc/honorTitles.ts`, `tools/convert/src/data/gameDataStage.ts`): `readHonorList` keeps
  the need column; the convert writes `data/honorNeeds.json` (id -> need). It is optional (not in `GAME_DATA_KEYS`), so
  older game files still load; the page then lists no title.
- **protocol** (`packages/protocol/src/world/honor.ts`): HONOR_LIST_ACK (0x9300, 150 ints), HONOR_CHANGE_ACK (0x9301, one
  int under the mover's object), HONOR_CHANGE_REQ (0x70004001). `world/own.ts` now reads the own ADD_OBJ past the three
  pockets (`Pocket.cpp:28-50, 303-330`: 6, 24, 24 slots, 4-byte `time_t`) and `m_dwMute` to the 150 honour counts
  (`OwnCharacter.honorCounts`). A read error there drops the counts only. testkit: `writeHonorList`, `writeHonorChange`,
  `honorCounts`, and `writeAddSelf` with `own.honorCounts`.
- **client**:
  - `world/honor/honorBook.ts` copies `m_vecEarned` (load, apply, the order Neuz keeps).
  - `hud/characterWindow.ts`: the tabs are buttons now (`CWndTabCtrl::OnLButtonDown`, `WndControl.cpp:4460-4490`) and switch
    the page. The Fame/Master page has the list (grey rows, orange under the mouse, red when chosen), the scroll bar, the
    "No fame obtained." line and OK.
  - `WorldScreen.ts`: own counts -> book; HONOR_LIST_ACK -> the line in the HUD messages + list refresh;
    HONOR_CHANGE_ACK -> `WorldState` sets the player's `honor`, then the name tags are redrawn; OK -> `sendHonorTitleChange`.
- **phone** (`style.css`, after the character window's phone rules): tabs 46 px tall, rows 46 px with 16 px words, OK a
  plain 46 px button, list on the left and OK on the right of the 480 x 320 window. The window is drawn at about 0.9 on a
  Pixel 7 held sideways, so 46 px stays over 40 and 16 px over 14 on the screen.

## Departures from Neuz

- None in behaviour. On the phone the list and OK are placed for the landscape window (as the Character page already is).

## Tests

- `npm run typecheck`: clean.
- vitest: new `packages/protocol/test/honor.test.ts` (6), `apps/client/test/honorBook.test.ts` (5), 4 page tests in
  `apps/client/test/hud.test.ts`, the need column in `packages/formats/test/gameDataReaders.test.ts`, the new catalog in
  `tools/convert/test/gameDataStage.test.ts`. Client run: 2456 passed, 5 failed = main's known ones (looks x3,
  inventoryWindow x2). Protocol 491 passed; formats + convert 118 passed.
- e2e `apps/client/e2e/honor.spec.ts`, Chromium desktop + landscape phone (port 5196): **2 passed** (about 20 s). It comes in
  with two titles, opens Fame/Master from the Start menu, picks Lord (HONOR_CHANGE_REQ 36, then "[Lord] Webby"), sees
  another player take a title, gets Master Knight by HONOR_LIST_ACK (the line, and the row added), and takes the title
  off (-1). On the phone it checks words >= 14 px and rows, tabs and OK >= 40 px as drawn, and the window on screen.
  Pictures: `honor-desktop.png`, `honor-phone.png` in the session notes folder.

## For the owner

1. Convert the data in the main folder (new `data/honorNeeds.json`; without it the page says "No fame obtained."):

   ```
   npm run convert -- --only data
   ```

   Pass: the last lines say `data: ... 0 failed`.
2. Re-run the new browser test (any free port but 5174):

   ```
   cd apps/client
   E2E_CLIENT_PORT=5196 npx playwright test e2e/honor.spec.ts --project chromium --project phone
   ```

   Pass: `2 passed`.
   The tabs of the Character window changed, so the older specs that open it are worth one run too (not run here):

   ```
   cd apps/client
   E2E_CLIENT_PORT=5196 npx playwright test e2e/fight.spec.ts e2e/jobs.spec.ts e2e/controls.spec.ts --project chromium --project phone
   ```

   Pass: no test failed.
3. In the game (VM servers): log in with a character that has a title (a Lord, or a master/hero job), press H, open
   Fame/Master, pick a title, press OK. Pass: the title shows as "[Title] Name" over the head, for you and others.
   This also checks the new read of the own ADD_OBJ past the pockets on a real server (only test bytes so far).
   A GM can give a count to test with: `/hts <title id> <count>` (HonorTitleSet).
