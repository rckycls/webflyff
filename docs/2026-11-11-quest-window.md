# The quest window in V15's look, and a phone version (2026-11-11)

Branch `quest-window`, from local `main` 0682ef3. The research and every difference from M1's window are in
[the comparison note](2026-11-11-quest-window-research.md).

## What changed

**Desktop.** The window is now drawn as V15 draws `APP_QUEST_EX_LIST` and `APP_QUEST_EX_DETAIL`:
- **Header bars:** "Quest List", "Quest Contents", "Requirement" and "Reward" are WndEditTile200 bars with white,
  centred titles.
- **The list:**
  - The tab control is tiled, with its tab strip at the bottom; the titles are centred, the chosen one black.
  - The tree sits on the tiles with Neuz's own scroll bar. The mouse wheel moves it one row.
  - A chosen row's text turns blue, with no highlight bar.
  - A folder opens or closes by its picture or by a double click; one click only chooses it.
  - The filter is V15's read-only combo box, not the browser's `<select>`.
- **Opening:** the window opens in the middle of the screen, on the **Scenario** tab, showing In Progress.
- **The detail window:**
  - Its title bar is empty, as in V15.
  - It sits at the list's right edge less 2 px. It moves with the list and cannot be dragged on its own.
  - The contents, the requirements and the rewards each sit on edit tiles with a scroll bar.
  - A pressed requirement row turns blue.
- **What closes the detail:** a new tab, a new filter, or the remove button (the confirm box still knows which quest).
- **Unchanged:** the tracker, the quest markers, the destination on the world map, check boxes and their 5-tick limit,
  the remove rules and its confirm box, Q and the Start menu's Quest Diary.

**Phone.** The full-screen panel is gone:
- **Size:** both windows keep V15's layout at the frame's 0.7, as the Messenger does.
- **Place:** the list opens in the middle, above the task bar. With a detail open, the two are centred together. When the
  detail closes, the list goes back to the middle.
- **Text:** 14 px in CSS. As in the Messenger, the 0.7 scale shows it at about 10 px on screen.
- **Rows:** tree rows are 26 px tall and requirement rows at least 26 px.
- **Press areas:** the check boxes, the remove and close buttons, the filter and the tabs take presses a little outside
  their pictures.
- **Touch:** the tree and the texts scroll by finger, and a tap on a folder's name opens or closes it (a finger has no
  double click).
- **Hidden while it is open:** the joystick, Jump, Attack, the phone tools and the tracker, as with the Messenger.

**Files:**
- `apps/client/src/world/hud/quests/questWindow.ts` (rewritten)
- the quest block of `apps/client/src/style.css`. It was replaced in place, and its phone `@media` block is closed. The
  braces balance.
- `apps/client/test/questWindow.test.ts`
- `apps/client/e2e/quests.spec.ts` (Scenario first, then General; the detail's place)
- `apps/client/e2e/questWindow.spec.ts` (new)

`WorldScreen.ts` is not touched: `toggle`'s width argument is kept and no longer used.

## Rulings (each with what it costs if wrong)

- **The tree keeps its chosen row when quest data changes.** V15 loses it on every `Update()`
  (`DeleteAllItems`, WndControl.cpp:806-812). Cost: the remove button stays on for the chosen quest where V15 would
  turn it off.
- **Long requirement rows wrap.** V15's tree draws one line a row. Cost: a row can be two lines tall.
- **The tab and the filter last for one world**, as in M1. V15 keeps them until the next log-in. Cost: one click after
  travel.
- **The GM's "(state, id)" suffix is left out.** Cost: none for players.

## Convert

None. Every picture the window uses is already in the UI stage: WndEditTile00-08 and 200-208, WndTabTile, ButtVScr*,
ButtQuickListDn, ButtCheck, buttTree*, ButtRemoveQuest and ButtClose.

## Checks (this PC)

- `npm run typecheck`: exit 0.
- `npx vitest run`: 4,508 passed, 9 skipped, 5 failed. The 5 are main's known ones: 3 in `looks.test.ts`, 2 in
  `inventoryWindow.test.ts`. The quest window file has 19 tests, all passing.
- Playwright, `E2E_CLIENT_PORT=5193`, desktop (`chromium`) and `phone`: `quests.spec.ts` and `questWindow.spec.ts`,
  6 passed.
- **Phone scrolling:** a finger drag scrolls the tree; the check uses touch events. CDP's `synthesizeScrollGesture`
  scrolled nothing in this page, so the check does not use it.

## The owner's command

In PowerShell in the `quest-window` folder, while your own `npm run dev:client` keeps 5174:

```
$env:E2E_CLIENT_PORT = '5193'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone quests.spec questWindow; Remove-Item Env:E2E_CLIENT_PORT
```

It takes about 1 minute. It passes when it ends with `6 passed` and no `failed`.
