# Piece 6 milestone 1 checkpoint: the world map

Date: 2026-11-02. Branch `piece6`.
- Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.2.
- Plan: [M1 plan](superpowers/plans/2026-11-02-piece6-m1-world-map.md).
- Research: [M1 research](superpowers/specs/2026-11-02-piece6-m1-worldmap-research.md).

The owner's checks below are still open.

## What changed

- **Readers** (`packages/formats`):
  - `readContinents` copies `CContinent::Init`.
  - `readMapMonsterPack` copies `CMonsterInfoPack::LoadScript`.
- **Converter:**
  - The data stage writes the optional catalog `data/worldMap.json` (`tools/convert/src/data/worldMapCatalog.ts`). It holds:
    - the 8 maps' pictures, world rectangles and continents;
    - Madrigal's 7 continent outlines;
    - each continent's monster icons;
    - the 27 button frames;
    - the arrow and the tooltip's 9 pieces.
  - The UI stage converts the 25 pictures that were missing: 7 maps, the buttons, 7 monster sheets, the arrow and the
    9 tooltip pieces.
  - The catalog is not one of `GAME_DATA_KEYS`, so older game files still log in, without the map.
- **Rules** (`apps/client/src/world/worldMapRules.ts`):
  - which map the player is on (`GetMapNo`, the integer `Point_In_Poly`, lowest id first);
  - the projection (`WorldPosToMapPos`);
  - the arrow (the camera's yaw, Neuz's aspect squeeze);
  - the button frames;
  - the monster tooltip.

  The NPC teleporter's projection now uses the same function, with its citation corrected.
- **Overlay** (`apps/client/src/world/hud/worldMap.ts`): on M and Start → World Map. On M in a dungeon or at sea it
  prints "You can not use the Map in this Dungeon." instead.
  - It fills the world view at 4:3 and has a close button.
  - It holds every key except M and Escape, which close it, and keeps every press from the world. It sends nothing.
  - The monster switch lasts across world changes.
  - The Start menu has a seventh line, "World Map", just before Navigator.

## Decisions (the plan's rulings, and those made while building)

- **The plan's 9 rulings:** size, close button, Escape, input, arrow, tooltip frame, phone picking, switch state, and
  missing catalog.
- **Size parameter:** `readMapMonsterPack` takes the sheet size as `{ width, height }`, as `readTexturePack` does.
- **Missing or bad data:**
  - the catalog is written only when `WdMadrigal.wld.cnt` exists;
  - a monster script that cannot be read leaves that map without icons, with one warning.
- **Corpus check:** the real-client test checks that every icon lies inside its map's rectangle, and that the Flaris
  Aibatt icon lies on the Small Aibatt spawn area. It does not read the spawn file for every monster.
- **Loader:** `loadWorldMap(store, report)` reports through the world screen's overlay.
- **Opening:** opening the map lets go of held keys and the joystick, through `releaseControls()`. That may send one
  ordinary stop.

## Tests added

- `packages/formats/test/worldMapReaders.test.ts`: 8 tests.
- `tools/convert/test/worldMapCatalog.test.ts`: 5 tests.
- `tools/convert/test/worldMap.corpus.test.ts`: 2 tests on the real client, run once: 7 continents, 78 rows, no warning.
- `apps/client/test/worldMapRules.test.ts`: 16 tests, including every fixture point of the research.
- `apps/client/test/worldMap.test.ts`: 9 jsdom tests.
- `apps/client/e2e/worldMap.spec.ts`: 2 tests on desktop and phone.
- `apps/client/test/hud.test.ts`: the Start menu's expectations now include the seventh line and the taller menu.

## Builder's checks

- **Conversion:** `npm run convert -- --only ui,data --client "…\Client"` exited 0.
  - ui: 4,754 ok, 1 warn, 0 failed.
  - data: 13 ok, 82 warn (none from the world map), 0 failed.
- **Unit suite:** `npm test -- --maxWorkers=2 --reporter=dot` gave 143 files passed, 2,955 tests passed and 8 skipped;
  exit 0.
- **Typecheck:** `npm run typecheck` passed; exit 0.
- **Browser specs:** `worldMap.spec.ts` and `navigation.spec.ts`, on desktop and phone, passed: 8 tests.
  - They ran from a temporary copy of the Playwright config on port 5177, because the owner's dev client held port 5174.
  - The first run had 2 failures from one test-side mistake: a 0×0 arrow anchor counted as invisible. The test now
    checks the arrow picture.
- **Screenshots:** the desktop and phone screenshots were checked by eye.

## Owner checks

- [ ] `npm run test:e2e:client`, the full run: no `failed`. The taller Start menu is checked here too, by the landscape
  tests.
- [ ] `npm run test:corpus` with `FLYFF_CLIENT` set: no `failed`.
- [ ] `docs/device-testing.md`, "Piece 6, milestone 1", on the PC, an Android phone and an iPhone.
