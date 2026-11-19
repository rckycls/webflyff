# Teleport window (CUSTOM, 2026-11-19): hand-over

The owner asked for a V15-look Teleport window, desktop and phone, like another server's (layout only), then: "Make only
flaris, darkon and sm for regular players add the other for VIP1-VIP4". Design:
`docs/superpowers/specs/2026-11-19-teleport-window-design.md`; plan: `docs/superpowers/plans/2026-11-19-teleport-window.md`.

## What it does

- Start menu → **Extras** → **Teleport**. Extras is a new V15-look folder holding the Pet Filter (U still opens it) and
  Teleport, so the top level keeps its 18 lines (Awaken can join the folder when it merges). Auto Play stays at the top.
- 14 places: V15's own teleporter points. Flaris, Saint Morning and Darkon (the city) for everyone; Darkon 1, Darkon 3,
  Shaduwar, Garden of Rhisis, Mars Dungeon, Dekane Mine, Ivillis Temple, Dead Wilderness, Volcane, Aminus Dungeon and
  Aminus Dungeon (Hero) for VIP1-VIP4 (letters A B C E) and GMs. VIP places carry the VIP star; a regular player sees
  them greyed, and the text adds "VIP only."
- Right side: the name, V15's region map (already converted) with a pulsing red mark on the landing point, and one line
  about the place (monster levels from V15's spawn data).
- 10,000 Penya and Apply under the list. Apply refuses a VIP place for a regular player and too little Penya at once;
  otherwise it sends the place number (TELEPORT_WINDOW 0x8fff0120) and closes. The World checks everything again (see
  the outer repo's `docs/2026-11-19-teleport-window-deploy.md`): the 10 s wait, state, place, Penya.
- The window opens on the place picked last this session. No hotkey, no Yes/No box.
- Phone (landscape): the same two columns in a compact panel over the open bag; 26 px rows that scroll; the map as tall
  as the room leaves; the silver Apply button.

## Files

- `packages/protocol/src/world/teleportWindow.ts` (+ `constants.ts`, `index.ts`): `encodeTeleportWindow`,
  `TELEPORT_PLACE_COUNT`.
- `apps/client/src/world/hud/teleportPlaces.ts`: the 14 places (same order as the World's `TeleportWindow.h`),
  `canTeleportTo`, `placeMarker`.
- `apps/client/src/world/hud/teleportWindow.ts`: the window (`ResWindow`, `hud-teleport`).
- `apps/client/src/world/hud/applets.ts` (applet 9005, the Blinkwing's icon), `art.ts` (`themeKey` keeps `ui/...png`
  keys: the same two lines as the awaken-window branch, so they merge cleanly), `taskBar.ts` (the Extras folder),
  `WorldSession.ts`, `WorldScreen.ts`, `style.css`.
- Tests: `packages/protocol/test/teleportWindow.test.ts`, `apps/client/test/teleportPlaces.test.ts`,
  `apps/client/test/teleportWindow.test.ts`, `apps/client/test/hud.test.ts`; e2e `teleportWindow.spec.ts` and the
  Pet Filter's move into Extras in `startMenu`, `petFilter`, `topRightIcons`, `landscape`.

## Merging

- No convert and no gear sync: every picture is already converted.
- With the awaken-window branch: both change `art.ts` the same way (no conflict there). Both add a line at the same
  spots of `applets.ts` (ids 9004 / 9005), `taskBar.ts` (the window type, `WINDOWS`, `MENU`), `hud.test.ts` and
  `startMenu.spec.ts`, so git stops on small conflicts: keep both sides. Put Awaken in the Extras folder (after
  Teleport) so the top level stays at 18 lines; or keep it at the top level (19, the limit) and add 'Awaken' to the
  line lists.
- The World exe must go in with the client (an old World ignores 0x8fff0120: the window would take nothing and do
  nothing).
