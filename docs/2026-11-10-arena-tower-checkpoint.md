# Arena and Forsaken Tower: checkpoint (2026-11-10)

Branch `arena-tower` (worktree `FlyffWeb-worktrees/arena-tower`), cut from main `df57fb7`. Not merged, not pushed.
Research: `docs/superpowers/specs/2026-11-10-arena-tower-research.md`.

## What was found

- **Forsaken Tower** is V15's "Heaven Tower" (`MMI_HEAVEN_TOWER` 97, `CWndHeavenTower`). It is **on** in the owner's
  build: its code is `#if __VER >= 12`, and `__VER` is 15 (the commented-out `__HEAVEN_TOWER` line is not used).
- **Arena** (`__JEFF_11_4`) is on in Neuz and the WorldServer, and `ARENA` is in `Program/WorldServer.ini`.
- **No server or gateway change is needed** for either.

## What was built

- **Protocol** (`packages/protocol/src/world/arenaTower.ts`): `ARENA_ENTER` 0x70000010 and `ARENA_EXIT` 0x70000011 (the
  type alone), `HEAVENTOWER_TELEPORT` 0x70001008 (the floor, 1-5); their decode cases for the tests.
- **NPC menu** (`hud/moverMenu.ts`): Enter Arena (80), Leave Arena (81) and Forsaken Tower (97) are enabled. Enter Arena
  still shows only past the base job (as before).
  - Lay (`MaFl_Ray`, in Flaris and two other towns): Enter Arena sends `ARENA_ENTER`.
  - Harold (`MaFl_Harold`, inside the Arena): Leave Arena sends `ARENA_EXIT`.
  - The server moves the player (REPLACE), which FlyffWeb already handles.
- **PvP in the Arena only** (`combat/arena.ts`, `combat/attackLoop.ts`): Neuz's `IsArenaTarget`. Another player can be
  attacked only when you are in world 208 and **both** of you stand inside the fight circle around (490, 507), radius
  about 35 m. Melee, wand, bow, attack skills, the Attack button and auto-attack all use this one rule.
  - Everywhere else players stay unattackable, as before.
  - The spot where the server drops you (540, 485) is outside the circle: walk into the ring to fight.
- **Death in the Arena**: the line "Please press ESC and resurrect." (`TID_GAME_DEATH_ARENA`), and the revive window's
  "Revive here" (resurrection scroll) is always greyed there, as Neuz does.
- **Forsaken Tower window** (`hud/heavenTowerWindow.ts`): a press on the Forsaken Tower Manager opens it at once (its only
  menu entry).
  - It has the description and seven lines, B1 to B5 (10,000 to 100,000 penya), B6 (Secret Room), and "Do not Enter".
  - A floor asks "You need to pay N penya to enter floor Bx." with OK and Cancel. OK sends the floor and closes the window.
  - B6 says "You cannot enter a private area." and sends nothing. "Do not Enter." closes the window.
  - If you lack penya, the server answers "You do not have enough Penya." (already shown by FlyffWeb).
- **Phone**: the tower window is a panel with 14 px text and 34 px lines. A tap on a line chooses it.
  - Fixed during the build: on a phone, the tap that opened the window also "clicked" the floor line under the finger. A
    line now reacts only to a press of its own.
  - In the Arena the phone selects a player with a tap and attacks with the Attack button (a second tap on a player still
    opens the player menu, as before).
- **Tests**:
  - unit: `arena.test.ts`, `heavenTowerWindow.test.ts`, `packages/protocol/test/arenaTower.test.ts`, plus new cases in
    `attackLoop`, `skillUse`, `moverMenu` and `hud` tests;
  - e2e: `apps/client/e2e/arenaTower.spec.ts`, which passes on desktop and phone (4 of 4).
- `npm run typecheck`: clean. `npx vitest run`: 4243 passed; only the 5 failures main already has (`looks.test.ts` ×3,
  `inventoryWindow.test.ts` ×2).

## What is left, and why

- **Duels, PK, guild war and guild siege**: still none. They are other systems, not asked for.
- **`EVE_18`**: Neuz allows player attacks only with this server flag on. It comes in a snapshot FlyffWeb does not read
  (`SNAPSHOTTYPE_FLYFF_EVENT`). The owner's `WorldServer.ini` has the `18` line, so FlyffWeb takes it as on. If that line
  is ever removed, the server refuses the hits.
- **A dead player in the Arena**: Neuz lets the swing go out and the server ignores it; FlyffWeb refuses it at once. The
  result is the same.
- **Floor B6 (Secret Room)**: it belongs to the guild Secret Room system, so it cannot be entered from this window
  (Neuz is the same).
- **Your 3v3 arena** (`__BB_ARENA_3V3`) is a custom feature: left out, as asked.

## Merge notes

- `hud/moverMenu.ts`: two new MMI ids (`ARENA_EXIT`, `HEAVEN_TOWER`), the `ARENA_TOWER_ENTRIES` set and one more
  `|| ARENA_TOWER_ENTRIES.has(id)` in `enabled`. `bank-mail` also edits this rule (Deposit): keep both.
- `WorldScreen.ts`:
  - three new branches in `chooseNpcEntry`;
  - the tower window made next to the teleporter;
  - `attackLoop.worldId`;
  - `hud.inArena`;
  - the revive window's update.
- `style.css`: one new section at the end, its phone block closed.

## Convert command for the main folder

**None.** The Arena world (`wdarena`), the five tower floors (`wdheaven01`-`05`), the texts and the two pictures
(`wndedittile00`, `wndbuttenter`) are already in main's `dist/assets`. Do not run the converter.

## Commands and pass criteria for the owner

From `FlyffWeb` after merging (the dev server on your 5174 is not touched by these):

```bash
npm run typecheck
```

Pass: no errors.

```bash
npx vitest run
```

Pass: only the 5 old failures (`looks.test.ts` ×3, `inventoryWindow.test.ts` ×2).

```bash
npx playwright test -c apps/client/playwright.config.ts arenaTower --project=chromium --project=phone
```

Pass: 4 passed. Stop your `dev:client` first, or set `E2E_CLIENT_PORT` to a free port, because the config starts its
own dev server.

## In-game checklist (PC, then a phone)

Use two characters past the base job (any 1st job), A and B, at least one with some penya.

1. **Enter the Arena**: in Flaris, press Lay ("[Arena Manager] Lay").
   - The menu shows Dialog and Enter Arena (a Vagrant sees no Enter Arena).
   - Choose Enter Arena: you land in the Arena next to Harold.
2. **Safe at the entrance**: do the same with B. Standing where you landed, A cannot attack B.
   - The Attack button stays greyed (phone).
   - A double-click does nothing (PC).
3. **Fight in the ring**: walk both into the middle of the ring.
   - PC: A clicks B, then clicks B again; A runs to B and swings.
   - Phone: tap B, then the Attack button.
   - B loses HP; try a bow or wand character and an attack skill too.
4. **Buffs in the ring**: a buff or heal on the other player still works there.
5. **Dying in the Arena**: let B die.
   - B sees "Please press ESC and resurrect."
   - In the revive window "Revive here" is greyed, even with a resurrection scroll.
   - Lodestar brings B back. No exp lost.
6. **Leave**: press Harold, choose Leave Arena. You go back to where you stood in Flaris.
7. **No PvP outside**: in Flaris, A cannot attack B.
8. **Forsaken Tower**: in Flaris, press the Forsaken Tower Manager (next to Lay). The window "Enter Forsaken Tower" opens
   with seven lines.
   - Press it again while it is open: "You are already using this window!".
   - Choose "3. Enter Floor B3": "You need to pay 50000 penya to enter floor B3." with OK and Cancel. Cancel keeps the
     window.
   - OK with enough penya: you arrive on floor B3, 50,000 penya less.
   - OK without enough: "You do not have enough Penya." and you stay.
   - Line 6 (Secret Room): "You cannot enter a private area." and nothing happens. Line 7 closes the window.
9. **Phone, tower**:
   - The window fills the middle of the screen with large lines.
   - The tap that opens it does not choose a line by itself.
   - Lines scroll if the screen is short.
