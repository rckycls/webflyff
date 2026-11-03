# Piece 7 milestone 1 checkpoint: quests

Date: 2026-11-03. Branch `piece7-m1` (cut from `main` at 4517c3a, Piece 7 M0's squashed commit), folder
`FlyffWeb-worktrees/piece7`.
- Spec: [Piece 7 design](superpowers/specs/2026-11-03-piece7-design.md) §3.2.
- Plan: [M1 plan](superpowers/plans/2026-11-03-piece7-m1-quests.md).
- Research: [M1 research](superpowers/specs/2026-11-03-piece7-m1-quests-research.md).

Built on 2026-11-03 by the plan's Native route, then reviewed by a fresh reviewer and fixed (see "Final review"). The
owner's device checks and the full browser and corpus runs are pending:
[device checklist](device-testing.md#piece-7-milestone-1-quests).

## What changed

- **Protocol** (`packages/protocol/src/world/quest.ts`, 28fa6fa):
  - The own ADD_OBJ's quest lists: the current quests (12-byte QUEST records), the completed ones and the checked ones.
  - The five quest messages: SETQUEST, REMOVEQUEST, QUEST_TEXT_TIME, QUESTHELPER_NPCPOS and QUEST_CHECKED.
  - The two packets the client sends: REMOVEQUEST (abandon) and QUEST_CHECK (tick for the tracker), with Neuz's bytes.
- **The quest catalog** (formats and converter, 007af79):
  - `readPropQuest` reads the five quest files `Masquerade.prj` lists. It reads the titles, the heads, the givers and
    hand-in NPCs, the level and job limits, the end conditions with their places, the rewards and each state's text.
    End terms the browser cannot judge (party, guild, pet, disguise) are listed as unsupported. Karma and chaotic are
    too, though V15 compiles them out; no quest uses them.
  - The giver is the last `SetCharacter` in the client's language (English), and also the hand-in NPC when the file
    names none. A quest that cannot be read is a warning and is left out; the rest of the catalog is still written.
  - The data stage writes `data/quests.json` (585 quests) when the packs have the files. It is optional, as the world
    map's catalog is.
  - The UI stage adds the quest window's pictures: ButtRemoveQuest, ButtClose, ButtCheck, buttTreeOpen and
    buttTreeClose, and ButtDestination.
- **The quest rules** (`world/quests/`, 28398cf, 4e11ba4):
  - `questRules.ts`: Neuz's `__IsEndQuestCondition`, the condition rows (a met one grey), the reward lines, and the
    dialogue's lookup (levels and the yellow paper).
  - `questTree.ts`: the four tabs, the head folders, and the All / In Progress / Completed filter.
  - `OwnState` keeps the three lists and turns each quest message into a quest event: started, progress, ended,
    removed, or lists changed. A quest that repeats never joins the completed list.
  - `questLines.ts`: the kill, patrol, dialogue and time lines of `OnSetQuest`, "Quest Complete!", and the cancel line
    of `OnRemoveQuest`.
- **The quest window** (`hud/quests/questWindow.ts`, e7c2b4e): APP_QUEST_EX_LIST, 336 × 416, has the tabs, the tree with
  its folders and check boxes, the filter, and the remove and close buttons. APP_QUEST_EX_DETAIL, 272 × 416, docks at
  the list's right edge with the state's text, the condition rows and the rewards. A box asks before abandoning.
  - **Q** and the Start menu's new **Quest Diary** line open it.
  - On a touch phone the list and the detail share one full-screen panel.
- **The tracker** (`hud/quests/questTracker.ts`, 8abd4a9): APP_QUEST_QUICK_INFO at the right edge, 220 px down. It
  shows each ticked quest's title and its rows. A title opens the detail, and a row with a place sets the destination.
  - On a phone it sits under the shortcut buttons, three quests tall.
- **The destination** (`hud/worldMap.ts`, c57cb15): a condition row's place opens the world map on the whole continent
  with ButtDestination.bmp blinking at the spot. The mark stays until the quest ends.
- **The world** (`WorldScreen.ts` and friends, cd74a79):
  - The catalog loads beside the world map's.
  - Quest lines go to the messages and the chat, with the jingles (BGM_EV_START, BGM_EV_END).
  - A time that runs out sends REMOVEQUEST, as Neuz does.
  - The dialogue's quest rows read "[min~max] title", with the yellow paper for a quest ready to hand in.
  - The abandon box joins the world's modal windows.

## Decisions

The plan's own decisions:
- No "quest helper" request: V15 never asks for an NPC's position. A condition's place marks the world map instead.
- No "Destination" box: `QuestDestination.txt` is not in the client, so a row without a place does nothing.
- No 3-D destination arrow and no quest marks over NPC heads (follow-ups).
- QUEST_TEXT_TIME is read and dropped (party quests, drawn only on internal servers).
- The catalog is optional. Without it, quests are listed as "Quest <id>" and the dialogue keeps the server's titles.
- The quest window refreshes on every change; Neuz refreshes it only at some moments.
- The tracker has no hover fade. On the PC its frame shows on hover in Neuz's hover colours, and the text has a dark
  shadow.
- On phones the window is one full-screen panel and the tracker is compact.
- The jingles play as `CMover::SetQuest` plays them.

Rulings made while building (from the ledger), with what each costs if wrong:
- The own ADD_OBJ gives the quest lists only when they are not empty, as it gives gold. Cost: none.
- The testkit's quest writers take the object id first, as every other writer does. Cost: none.
- `readPropQuest` takes each statement's arguments by position (Project.cpp's orders) instead of transcribing all of
  `LoadPropQuest`. The corpus test reads all five files with no errors, and quests 151 and 83 come out exact. Cost: a
  statement read at a wrong position would be caught only for those two quests.
- A missing `;` after `)` is allowed (two places in the real files). SetCharacter keeps the first giver. Kills carry
  their slot. Karma and chaotic end terms are unsupported. Cost: none.
- The stage and THEME_FILES code was written before its tests; RED was shown by stashing it, then GREEN. Cost: none.
- A state "has text" when the catalog has its SetDesc. Cost: a quest never shows ready (none seen).
- `rewardLines` takes the player to filter items by sex and job, because the job-change rewards name one item per job.
  Cost: none.
- The skill, disguise, party and guild rows are not drawn (no texts traced). The time-out row is red. Cost: missing
  rows for rare quests.
- A kill line for a quest the catalog does not know names "???". A new quest that arrives already ended goes straight
  to completed. Cost: an odd line for an unknown quest.
- The time is compared without its "all met" bit, as Neuz does (DPClient.cpp:8473-8474). (The ledger first called this
  a deviation; the review found Neuz masks it too.)
- ButtCheck.bmp is six frames of 14 px: frame 0 unticked, frame 3 ticked. Cost: one background offset.
- QuestWindow gains `elements` and `modal` getters for the world screen. Cost: none.
- The Start menu has nine lines (274 px), Quest Diary after Inventory. Cost: see the landscape ruling below.
- On a phone the list and the detail are each half of the panel, laid out again rather than scaled, text 14 px. Cost:
  CSS only.
- The tracker draws every quest open, with no fold picture. Cost: no click to fold a quest.
- The tracker rebuilds when the rows it would draw change, so a level or item change that changes a row rebuilds it.
  Cost: none.
- On a phone the tracker sits 100 px from the right edge, clear of the attack and jump buttons, 56 px down, at most
  162 px tall, and hides while the quest panel is open. Cost: CSS only.
- The world map's mark follows CWorldMap's destination mode, the branch this map ports: a closed map opens on the whole
  continent; an open one keeps its map. Cost: a click to the continent's button.
- The mark stays across closing and reopening the map until the quest ends, where Neuz clears it when the map closes.
  It stands in for the missing 3-D arrow. Cost: an old mark stays until a new destination.
- A missing `quests.json` says nothing on the overlay. Cost: a stale asset folder gives no hint.
- The jingles play in `WorldSounds`, with the world's other sounds. A removed quest plays BGM_EV_END too, as
  `CMover::RemoveQuest` does. Cost: none.
- The quest window redraws only when what it shows changes. It is updated every frame, and a rebuild each frame would
  swallow clicks. Cost: none seen.
- An ended quest clears the destination, as Neuz resets its arrow. Cost: none.
- `landscape.spec.ts` now counts nine Start menu lines, with a 22 px floor. The lines measure 23 px at 750 × 342
  (24 px with eight), still above Neuz's 20, per the owner's rule of keeping every Windows client line. Cost: touch
  targets 1 px smaller on the shortest phone.
- The quest window's tab and filter last for one world. A world change rebuilds the windows and resets them, where Neuz
  keeps them for the whole game. Cost: a click after travel.

## Final review

A fresh reviewer read the whole branch against the plan, the spec and the C++. It found nothing Critical and five
Important slips, all fixed in one pass, each test-first (3e3b154):
- **False "ready" papers and missing item rows.** An item condition of type 1 with no item to own (−1) applies to
  everyone (Mover.cpp:9600-9608). Before, quests like Flaris's starter item quests showed the yellow paper with no items,
  and their "number (0/20)" rows were missing.
- **A row with no place opened the map.** A goal at (−1, −1) means no place (WndQuest.cpp:2506). Before, tapping such
  a row (Mercenary Arms' Twinkle Stone row, among 207) opened the world map with a mark off its corner.
- **Missing "Meet <NPC>" rows.** The giver is now also the hand-in NPC when the file names none (Project.cpp:2440-2453),
  76 quests. A giver tagged for another language (`LANG_KOR`) is skipped, as the English client does.
- **"The next step of the quest has started." never showed** for a quest moving to state 1. It now shows on every
  SETQUEST at state 1 of a known quest, as Neuz does; QUEST_CREGUILD's end says no "Quest Complete!"
  (DPClient.cpp:8546-8562).
- **One unreadable quest dropped the whole catalog.** It is now a warning and left out; a file that cannot be read fails
  alone.

Rulings from the fix pass:
- The "next step" line repeats on every SETQUEST at state 1, as in Neuz; without a catalog neither it nor "Quest
  Complete!" shows (the server's own lines still do). Cost: a repeated line, or no "Quest Complete!" without the catalog.
- The client's language for tagged givers is English. Cost: a few Korean- or Japanese-only quests would list a giver.
- After an unreadable quest the reader skips its first brace group. Cost: in an odd case one more quest is left out,
  with a warning.

The reviewer's "declined to judge" items stand as the plan decided them: the world map instead of the Navigator, no
Destination box, arrow, head marks or QUEST_TEXT_TIME, folders open at first, no tracker fade or fold, the map's mark,
the 23 px Start menu lines, the confirm box's text on phones, and sex-filtered end items (no data has them).

Left as they are (minor, for later):
- a completed quest's detail shows its last in-progress text, not the state-14 text (188 quests);
- the cancel line is white, where Neuz draws it red;
- at a time-out Neuz first prints "Time Left: 0 minutes";
- an unknown quest's kill line reads "(n/n)", and its detail shows no counts;
- reward lines: one "????" per hidden item and real rewards once completed, the PK reward line, item 0;
- rows cap a count at the need, where Neuz prints 12/10;
- unmapped head ids 1800-1999 should be Scenario; karma, chaotic and disguise 0 should not block a quest (no data hits
  either);
- a new quest arriving already at state 14 goes to Completed, where Neuz keeps it current;
- Neuz centres the window, and closes the detail when the tab or filter changes;
- the sixth-tick line goes to the messages only, not the chat;
- the window rebuilds its tree to compare each frame while open; an own-state quest counter would skip that;
- `quests.spec.ts` has no hand-in, and on the phone the tracker's visibility and the shortcut overlap are not asserted;
- old asset folders without the new pictures draw blank check boxes (the convert command below fixes them);
- `SetEndCondMultiCharacter`'s NPCs are not read (5 quests).

## Evidence (this PC)

- `npm test`: 173 files, 3,247 passed, 8 skipped (after the review fixes).
- `npm run typecheck`: exit 0.
- Corpus, with `FLYFF_CLIENT` set: `packages/formats/test/gameData.corpus.test.ts` 17 passed (the five real quest files
  read with no errors, 585 quests) after the review fixes; the UI corpus test, 8 passed (Task 2).
- Browser, through the port-5175 config, chromium and phone:
  - `quests.spec.ts`, `dialogue.spec.ts` and `talking.spec.ts`: 6 passed (after the review fixes);
  - `landscape.spec.ts` and `worldMap.spec.ts`, with the three above before the fixes: 23 passed, 9 skipped (the
    touch-only and mouse-only tests).
- Convert into piece7's `dist/assets`: ui 6 ok (Task 2); data 15 ok, 82 warn, 0 failed (after the review fixes).

## The owner's commands

On the PC in PowerShell in the piece7 folder, with your own `npm run dev:client` stopped first:

| Command | How long | Success |
| --- | --- | --- |
| `npm test` | about 2 minutes | `Tests … passed`, and no `failed`. |
| `npm run typecheck` | about 1 minute | It ends with no `error`. |
| `npm run test:e2e:client` | about 10 minutes | It ends with `… passed`, maybe a few `skipped`, and no `failed`. |
| `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 10 minutes | No `failed`. Run `Remove-Item Env:FLYFF_CLIENT` afterwards. |

Then the [device steps](device-testing.md#piece-7-milestone-1-quests).

For your own asset folder (the piece7 folder already has them):

```
npm run convert -- --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client" --only "ButtRemoveQuest*,ButtClose*,ButtCheck*,ButtDestination*,buttTree*,data"
```

It takes about 1 minute and ends with `0 failed`.

## Still open

- The owner's device checklist (PC, Android phone, iPhone) and the full runs: `npm run test:e2e:client`,
  `npm run test:corpus`.
- The merge: M1 goes to `main` as one squashed commit; then M2 (bows, wands and the job change, in its own session) is
  rebased onto it.
