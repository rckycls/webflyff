# Summon Angel: checkpoint (2026-11-10)

Branch `summon-angel` (worktree `FlyffWeb-worktrees/summon-angel`), cut from main df57fb7. Not merged, not pushed.
Research: `docs/superpowers/specs/2026-11-10-summon-angel-research.md`.

## First: the owner's server is not a PK server (by the repo's config)

Summon Angel belongs to the PK "Confession" quest. In V15 an angel item can only be **used** on a PK server
(`__PKSERVER_USE_ANGEL`, `MoverSkill.cpp:2864-2882`). The repo's `Program/WorldServer.ini:13` has `//PK` (off). So on your
server, as it is:
- the Angel Window works: the stones are used up and an angel item comes into the bag;
- using that angel item does nothing (no message: Neuz is the same);
- an angel buff is removed at every login.

The VM's own `WorldServer.ini` was not checked. Turning PK on is a server setting, your call; no code change is needed.

## What was built

- **The NPC entry.** The Priest of Confession (`MaMa_PKNPC01`) now offers "Summon Angel" (MMI 43). It is refused while the
  trade or an NPC shop is open ("You cannot summon an Angel while trading."), and while the window is already open ("You
  have summoned an Angel.", Neuz's own words).
- **The Angel Window** (`CWndSummonAngel`, 464 x 464, `angel/summonAngelWindow.ts`):
  - the bag opens with it, and the window sits beside the bag;
  - the help text (`summonAngelQuest.inc`), the two stone icons, 10 Sunstone slots and 10 Moonstone slots;
  - a Sunstone or Moonstone goes in by a double-click in the bag (first empty slot of its row) or by a drop on a slot;
    Shift + drop fills the row; a drop with no free piece says "Too many Gems."; a double-click on a slot takes it out;
  - the rates: Red 100 - 3n, Blue 2n, Green n (n = stones), as `%0.1f`, and the white angel's three lines;
  - START with fewer than 3 stones: "You need at least 3 Sunstones and 3 Moonstones to summon an Angel."; else it sends
    CREATEANGEL ("objDcountDD" per stack) and empties the slots; RESET empties them; CANCEL closes;
  - the bag shows each held stack's count less what is in the window; held pieces are let go on close;
  - it closes (with the bag) when the player moves, and when the bag closes.
- **While it is open** (Neuz's refusals): any other bag use says "You cannot use items while trading."; a drop on the
  ground says "You cannot drop items while trading."; the personal shop and the NPC shop / player trade entries say "You have summoned an
  Angel."; a trade asked by another player is refused with BLOCK 8.
- **The angel in the world** (`angel/angelFollow.ts`, `render/AngelLayer.ts`):
  - any player in view with an angel buff gets the angel's model (`Mvr_AngelRed/Blue/Green/White`, scale 0.2, 1 up,
    its stand motion), which follows the player as Neuz's `AngelMoveProcess` does (catches up by speed x dist² / 10,
    made again after a teleport or a death);
  - it sparkles in its colour (the pets' particle kinds 13-24);
  - the EXP gauge over it (`GauAngelExpBG/GauAngelExp`): the own angel's EXP; a party member's angel shows the background
    only (Neuz does not know their EXP either).
- **The angel's buff icon**: the tooltip shows "Blue Angel   42%"; at 100% it blinks and a box says "Please click the
  Angle buff icon." once; a press on it sends ANGELBUFF on a PK server (as Neuz: only when EVE_PK is on).
- **Messages**: "Your Angel has reached full Exp." when the server says so.
- **Protocol** (`packages/protocol/src/world/angel.ts`): CREATEANGEL and ANGELBUFF out; SNAPSHOTTYPE_ANGEL (ANGEL_INFO),
  FLYFF_EVENT (the join's 1024 event states, EVE_PK = 11) and SET_LOCAL_EVENT in; the own player's `m_nAngelExp` /
  `m_nAngelLevel` kept. Before, ANGEL ended its bundle and FLYFF_EVENT ended the join bundle. Testkit:
  `writeAngelInfo`, `writeFlyffEvent`, `writeSetLocalEvent`.
- **Converter**: the UI stage adds `reset.bmp`, `ButtVoteStart.BMP`, `GauAngelExpBG.tga`, `GauAngelExp.tga`; the `ultimate`
  stage adds `Client/summonAngelQuest.inc` as `descriptions.summonAngel` in `data/ultimate.json`.
- **Phone** (landscape): the window is a panel at the left beside the bag (as the jewel windows); a tap on a bag stone puts
  it in, a tap on a slot takes it out; slots 44 px, buttons 36 px tall, all text 14 px; the joystick and action buttons
  hide while it is open; the bag it opened closes with it.

## What is left

| Item | Why |
|---|---|
| Refusals for the bank, post, repair, beauty shop, guild bank and bank-password windows | Not in the browser yet (the bank and post are `bank-mail`'s work). Each is one line: `TID_GAME_TRADENOTSUMMONANGEL` in `openSummonAngel` (WorldScreen.ts), and `TID_GAME_SUMMONANGELUSING` in those windows' NPC entries |
| The Shift-fill from the bag's double-click | Neuz has none (Shift only works on a drop); nothing to do |
| The gauge's 0.4 x scale is drawn by CSS width, the pictures' alpha 200 by opacity | Same look; noted only |
| A full test on the real server | Needs PK on in the VM (see the top) |

No server or gateway change is needed.

## Tests

- Builder runs (this branch): `npm run typecheck` clean; `npx vitest run`: only the 5 old failures (`looks.test.ts` x3,
  `inventoryWindow.test.ts` x2); the new e2e spec passes on both projects:
  `npx playwright test -c .superpowers/playwright.summon-angel.config.ts summonAngel.spec.ts --project=chromium --project=phone`
  (port 5187; `.superpowers/` is not committed).
- New unit tests: `angelRules.test.ts`, `summonAngelWindow.test.ts`, `angelFollow.test.ts`, the angel's icon in
  `buffStatus.test.ts`, `packages/protocol/test/angel.test.ts`.
- For the owner, on main after the merge:
  - `npx playwright test -c apps/client/playwright.config.ts summonAngel.spec.ts --project=chromium --project=phone`: passes
    both (about 10 s each); pictures of each step in `test-results/`.
  - `npm run test:e2e:client`: no new failures against main.

## Convert command for the main folder

Run in the main FlyffWeb folder (UI pictures and `data/ultimate.json` only; it does not touch `itemProps.json`):

```
npm run convert -- --only "ultimate,reset,ButtVoteStart,GauAngelExpBG,GauAngelExp"
```

The angel models, motions and the particle pictures are already converted on main.

## In-game checklist (owner)

The Priest of Confession stands out in the fields (WdMadrigal, WdVolcane, WdIvilisTemple; on Flaris: the Plain of
Bubble). Have 3 or more Sunstones and a Moonstone or two.

**Part A: the window (works on any server).**

On the PC:
1. Click the priest: the menu has "Dialog" and "Summon Angel". Choose "Summon Angel": the bag and the "Angel Window" open
   side by side; the rates read 100.0 / 0.0 / 0.0.
2. Double-click a potion in the bag: the chat says "You cannot use items while trading." and nothing goes in.
3. Double-click a Sunstone twice and a Moonstone once: they go in the top and third rows; the Sunstone stack's count in the
   bag drops by 2; the rates read 91.0 / 6.0 / 3.0.
4. Drag a Sunstone onto the Moonstone row: nothing. Shift-drag a Sunstone onto the top row: the row fills (as many as you
   have). Double-click a filled slot: it empties.
5. START with only 2 stones in: the box "You need at least 3 Sunstones and 3 Moonstones to summon an Angel.".
6. START with 3 or more: the slots empty, the stones leave the bag, and an angel item (Red, Blue, Green or White Angel)
   comes into it. (No message: Neuz shows none either.)
7. Open the priest's menu again while the window is open: "You have summoned an Angel." Walk a step: the window and the
   bag close.

On a phone (landscape):
1. Tap the priest, then "Summon Angel": the window is a panel at the left, the bag at the right.
2. Tap a Sunstone and a Moonstone in the bag: they go in; tap a filled slot: it empties. The text is easy to read and the
   buttons easy to hit.
3. START with 3 stones: as on the PC. Close the window: the bag closes with it.

**Part B: the angel (needs a PK server, a PK value of 1 or more, and the Confession quest from the priest).**

1. Double-click the angel item: a small winged angel appears beside you with a thin gauge over it, sparkling in its colour,
   and its buff icon shows at the top left. (On a non-PK server nothing happens: that is the server, not the client.)
2. Walk and run: the angel follows, catching up when you stop. Teleport: it appears beside you again.
3. Hover (or long-press on the phone) the angel's buff icon: "Blue Angel   NN%".
4. Kill monsters: the gauge fills (the angel takes half of your EXP). When full: the chat says "Your Angel has reached full
   Exp.", a box says "Please click the Angle buff icon.", and the icon blinks.
5. Click (tap) the icon: the angel goes and "You received Blue Angel 100%." The 100% item goes to the priest with 1,000,000
   penya to finish the quest.
