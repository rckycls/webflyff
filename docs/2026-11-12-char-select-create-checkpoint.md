# Character select and create in V15's look (2026-11-12): checkpoint

Branch `char-select-create`, cut from main `f6a955e`. Research: `docs/superpowers/specs/2026-11-12-char-select-create-research.md`.

## What changed

**Select Character** (`views/characterView.ts`, `selectRules.ts`): V15's 544 x 368 window on `WndSelectChar.tga`, the
three slots at V15's pixel rectangles.
- The characters are animated in 3D (`lobbyPortraits.ts`, `lobbyMotion.ts`): the selected one gets up and stands, the
  others sit down and stay sitting, with V15's camera (perspective, eye (0, 0.5, -3.5), scale 1.6, lowered 1.15).
- The selected slot has the faint green fill and the blue name; the others' names are grey; an empty slot says "Available".
- One button row: Back, Create, Delete, Accept, enabled by the selection, as V15 does. Back is the old "Change channel".
  The extra "Log out" button is gone: leaving is Back, then the server list's Back.
- Left and Right move the selection, wrapping; Enter is Accept.
- Hovering a character shows V15's tooltip: sex, level (-M/-H), STR/STA/DEX/INT, job. A finger shows it while it presses.
- The selection is kept between visits (after Create, Cancel, Delete, Back), as V15's static `m_nSelectCharacter`.
- Blocked characters (block flag 0) cannot be selected or entered: "You cannot use this character." The selection moves to
  the first usable character when a list comes.

**New Character** (`views/createView.ts`, `createRules.ts`): V15's tiled window and layout.
- Character Name, Sex (ButtMale/ButtFemale), Hair Style, Hair Color (disabled), Face, Bank PIN, Confirm Bank PIN, the red
  note, OK and Cancel, all with the theme's art.
- A 3D preview on the right with V15's camera, dressed in the Vagrant's start clothes and the Wooden Sword; a woman plays
  MTI_STAND2.
- Opens as V15 does: female, hair style and face at random.
- V15's checks in V15's order, now including "Character name is not allowed." (InvalidName_ENG.inc, Letter_ENG.inc, from
  the converted party catalog). The PIN edits keep digits only, 4 at most.

**Delete Character** (`views/deleteView.ts`): a modal window over Select Character (272 x 208, tiled).
- It says "Password for deleting character" and "Enter The Password", with OK and CANCEL.
- V15's LANG_ENG rule: any text of 1 to 63 characters is sent as the key; otherwise "Please Re-enter SSN." (V15's own
  text). `LoginFlow.deleteCharacter` follows the same rule.
- After a delete, the emptied slot stays selected. Cancel returns to the select window as it was.

**Phone** (`lobby.css`, `@media (max-width: 1000px) and (pointer: coarse)`): the same windows, fullscreen.
- Buttons are 100 x 28, edits 28 px with 16 px text, the create window in two columns (form left, preview right).
- Checked whole and reachable at 568 x 320, 750 x 342 and 844 x 390.
- The lobby's message line no longer covers a window's buttons: on a phone the window makes room, and on a short desktop
  window the line sits over the caption.

## Rulings (where the web differs from Neuz, and why)

1. Errors use the lobby's message line, not V15's message boxes (as the rest of the lobby does).
2. The chosen sex button shows its pressed frame (`aria-pressed`). Neuz's buttons do not stay pressed; the preview shows
   the sex there.
3. The characters are drawn into a render target and read back, as the pet window's portrait is: the page's canvas has
   no alpha, so it cannot sit under the window's HTML. Motions step at 60 ticks a second; switches do not blend.
4. A touch screen shows the tooltip while a finger presses a character (there is no hover).
5. The random number pad at Accept is not built: `IDS_2ND_PASSWORD` is "0" in this server's Neuz and in every server.
6. Desktop edits are V15's 20 px in 12 px text. The e2e helper now asks 24 px and 16 px text of inputs on touch screens only.

## For the owner

- **Convert on main:** `npm run convert -- --only "ButtMale,ButtFemale,ButtLeft,ButtRight"` (the UI stage, four pictures;
  no gear sync needed). Until then, the create window's buttons show their words on a plain button.
- **Server note:** in this `Database.sql` dump, `CHARACTER_STR 'D1'` has its Bank PIN check commented out (`set @Exists = 1`),
  so any delete password deletes. That is a server question, not part of this branch.
- **Not compared with Neuz by eye:** the sitting characters' place in their slot (their feet reach the slot's bottom edge;
  V15's camera numbers are used as they are) and the tooltip's exact colours.

## Checks

- Typecheck (`npm run typecheck`): clean.
- Unit: `apps/client/test/charSelectCreate.test.ts` (new, 17 tests) and `loginFlow.test.ts` (delete now follows V15's rule).
  Full vitest: 4601 passed; two converter tests (`gameDataStage` skill icon case, `world` jobs) hit the 5 s timeout while
  the machine was busy and pass when run alone.
- e2e (Chromium, desktop and phone, port 5201): `lobby.spec.ts`, `landscape.spec.ts` and `loading.spec.ts`: 48 passed,
  8 skipped (phone-only or desktop-only cases).
- e2e fixtures: `worldHarness.ts` and `lobby.spec.ts` now send block flag 1 (a playable character), as the real server
  does; 0 would be a blocked one.

## Full e2e for the owner

```bash
E2E_CLIENT_PORT=5201 npm run test:e2e:client
```

Passing looks like: everything passes except tests already failing on main. Lobby tests to watch: `lobby.spec.ts` (17 per
project), `landscape.spec.ts` "every lobby screen fits a landscape phone with no scroll".
