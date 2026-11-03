# Piece 7 milestone 0 checkpoint: the classic NPC dialogue

Date: 2026-11-03. Branch `piece7` (cut from `piece6` at 3cabb49, before Piece 6's merge).
- Spec: [Piece 7 design](superpowers/specs/2026-11-03-piece7-design.md) §3.1.
- Plan: [M0 plan](superpowers/plans/2026-11-03-piece7-m0-classic-dialogue.md).
- Research: [M0 research](superpowers/specs/2026-11-03-piece7-m0-dialogue-research.md).

Built on 2026-11-03 by the plan's Native route. The owner's device checks and full test runs are pending:
[device checklist](device-testing.md#piece-7-milestone-0-the-classic-npc-dialogue).

## What changed

- **Protocol** (`packages/protocol/src/world/npc.ts`, 5d24b0a):
  - Every RUNSCRIPTFUNC function is read with Neuz's fields, including the eleven the client threw on before (the stat
    resets, the navigator, SAYQUEST, the name questions, the quest lists).
  - The opening request is Neuz's: the NPC, an empty key and four zeros. Every later request carries the NPC and the
    player as nGlobal3 and nGlobal4.
- **Pictures** (formats and converter, f54b0d3):
  - `character.inc`'s `SetImage` is kept, and `npcs.json` names each NPC's picture as `ui/char/<name>.png`.
  - The UI stage converts the 79 pictures of `Client/Char` (magenta key), `WndDialogEx.tga`, `wndButtEnter.bmp` and
    the four quest papers (white key).
- **The dialogue's text and rules**, without the window:
  - `hud/dialogue/dialogText.ts` (e26264d): Say's page, the colour, bold, underline and strike codes, and the
    `[word][key]` links.
  - `hud/dialogue/dialogState.ts` (b3cd340): pages, keys, answers, the quest lists, the 1 s lock after a request.
- **The NPC's menu** (`hud/moverMenu.ts`, a3c025c): CWndMenu's look. The entries are in MMI order, the ones the browser
  cannot do are greyed, the guild warehouse is left out, and the arena entry is shown only past the base job.
- **The dialogue window** (`hud/dialogue/dialogWindow.ts`, d886a90): APP_DIALOG_EX at 512 × 320 on WndDialogEx.tga. It
  is modal. It shows the NPC's picture, the title, the paged text with the next button, the keys, the picture answers
  90 px apart, and the quest rows with their papers.
- **The world** (`WorldScreen.ts` and friends, dde878c):
  - Today's small NPC box is gone.
  - Within 20 units a tap runs the sole entry or opens the menu at the NPC's bound rect. Farther, the player walks up,
    and a second tap opens it.
  - The dialogue closes when its NPC goes or the player moves.
  - Dialog waits 3 s after a drop, and no drop happens while it is open.
  - INITSTAT to INITINT reset the own stats.

## Decisions

The plan's own decisions:
- Quest rows show the server's title, without levels or the yellow paper, until M1.
- The walk-up opens nothing on arrival.
- Unbuilt menu entries are greyed.
- One Escape closes the menu or the dialogue.
- Colour codes are read in either case.
- Phones get 32 px menu items and a fitted dialogue.
- The stat resets are applied, and the rename question is logged.
- Requests use Neuz's two shapes.
- The NPC's music plays when Dialog opens.

Rulings made while building (from the ledger):
- `m_szChar` is read as the C++ reads it. No real file uses it.
- An empty picture name gives no picture.
- The UI corpus count now includes the 923 landscape minimaps that Piece 5 M4 left out. That test failed before this
  milestone.
- The partial-convert filter is `char*`, because of `char-deajangguem.tga`.
- A `#c` code that is not hex keeps the colour as it was. A link's word is taken as written.
- The dialogue state keeps the title a key press sets.
- Quest rows are not repeated. Every press waits out the 1 s lock.
- The window takes a clock for its lock.
- Escape is taken by the window before the modal backdrop's key hold.
- The title is drawn as text only. Whether Neuz draws a frame of WndEditTile200 pieces round it was not checked: compare
  on the PC.
- Phone text is 14 px.
- The menu's sizes are checked in the browser spec, not the unit tests.
- `onEscape` steps aside while the menu or the dialogue is open.
- The dialogue's modal joins `modalChanged`.
- A drop during the dialogue is refused silently.
- Trade keeps the old vendorType and 32-unit rules.

## Final review

A fresh reviewer read the whole branch and found nothing Critical. One fix pass, each fix test-first:
- **A quest list showed over the last page's Yes / OK.** Pressing **New Quest** now clears the page and the answers
  first, as `BeginText` does before the branch (WndDialog.cpp:379). Before, the Yes button stayed live over the list and
  could accept a quest by accident.
- **NPCs whose only entry the browser can't open** (the hair shop, the bank-only NPC, a shop of the special kind, a
  teleporter with no destinations) did nothing at all. They now show their menu with that entry greyed.
- **The menu stayed open when its NPC left or died.** It now closes, as the dialogue does.
- **A long menu could run off a short phone's screen.** It is now kept inside the screen, 4 px from the edges.
- **The keys area cut off a fourth row.** It now scrolls.
- **Taps:** a tap on the text turns the page, as the spec asks. On phones the keys and quest rows are taller, and the
  next and answer buttons hit 8 px round their pictures.
- **The checklist:** step 7 could not pass, because the open dialogue lets nobody move (it is modal, as in Neuz). It now
  checks the menu. Steps 10 (one greyed entry) and 11 (Benku's music on Dialog) are added.
- **`world.spec.ts`:** its mover-selection test now closes Julia's re-opened menu with Escape before it taps the ground.
  On a short phone the bigger menu covers that spot.

Left as they are (minor, for later):
- the refusal message `TID_GAME_DIALOGNODROPITEM` (the case can hardly be reached);
- the no-Dialog-while-a-shop-is-open guard, which copies a misreading: Neuz's guard is about the player's own private
  shop window. Owner to decide.
- a key that cannot be encoded throws inside its click;
- `$` in a key's tooltip text;
- the quest row's space before `]` (M1 will show it);
- the plain answers' colour (#505050 in Neuz);
- the menu's text lookup on each tap;
- the hard-coded "Conversation" and "Next".

## Evidence (this PC)

- `npm test`: 165 files, 3,170 passed, 8 skipped (after the review fixes).
- `npm run typecheck`: exit 0.
- Corpus, with `FLYFF_CLIENT` set:
  - `tools/convert/test/uiStage.corpus.test.ts` and `packages/formats/test/gameData.corpus.test.ts`: 24 passed;
  - every NPC picture is written, and Julia's is 200 × 240.
- Browser, through the port-5175 config, chromium and phone, after the review fixes:
  - `dialogue.spec.ts`, `talking.spec.ts`, `navigation.spec.ts` and `world.spec.ts`: 65 passed and 1 failed, the
    phone's mover-selection test;
  - that test, fixed: 2 passed.
- Convert into piece7's `dist/assets`:
  - `--only "WndDialogEx*,wndButtEnter*,QuestUiPaper*,char_*,data"`: 98 ok, 82 warn, 0 failed;
  - `--only "char-*"`: 1 ok;
  - all 79 `ui/char` pictures are in the index.

## Still open

- The owner's device checklist (PC, Android phone, iPhone) and the full runs: `npm run test:e2e:client`,
  `npm run test:corpus`.
- (The final whole-branch review is done; see above.)
- Piece 6 is not merged. Once it is, `piece7` moves onto `main`.
