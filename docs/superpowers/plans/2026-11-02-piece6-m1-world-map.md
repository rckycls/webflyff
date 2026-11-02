# Piece 6 M1 — World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M and the Start menu open Neuz's ordinary V15 world map in the browser:
- the 8 map pictures and their buttons;
- the player's arrow;
- the monster switch, with details on hover or tap;
- in a dungeon, Neuz's "not here" message.

The map sends no packet.

**Architecture:**
- **Converter:** reads the continent outlines, the monster scripts and the button sheet into one optional catalog,
  `data/worldMap.json`, and converts the map art. Neuz's constants (picture names, per-map bounds, the
  continent → map switch) go into that catalog.
- **Client:** pure rule functions (`worldMapRules.ts`) copy Neuz's continent test, projection, arrow and tooltip. One
  HUD overlay (`hud/worldMap.ts`) draws them over the world view and holds all input while it is open.
- **Reuse:** the existing applet, task-bar, Escape and modal patterns.

**Tech Stack:** TypeScript, the converter's data and UI stages, DOM/CSS HUD, Vitest, one Chromium Playwright spec.

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.2. **Research:**
`docs/superpowers/specs/2026-11-02-piece6-m1-worldmap-research.md`, cited as `[R §n]`. It holds every C++ `file:line`,
number and fixture used below. Copy the citations from it into the code's doc comments.

## Global Constraints

- **The ordinary V15 branch**, the 9 picture buttons, is the one copied [R §1]. Not the list-box branch, and not
  `CWndMapEx`.
- **No packet** is sent by opening, browsing or closing the map. The NPC teleporter window (`hud/teleporterWindow.ts`)
  keeps its own sends.
- **`data/worldMap.json` is optional:** it is never added to `GAME_DATA_KEYS`, so an older `dist/assets` still logs in
  [R open question 9].
- **Coordinates:** world positions are FlyFF's: x east, z north. Picture positions are in Neuz's 1280×960 picture frame,
  with positive z toward the top.
- **Arithmetic:** bounds are `Math.fround`, screen points are `Math.trunc`, and the polygon test is integer, as the C++
  does it [R §4, §5].
- **Builders run only:**
  - `npx vitest run` on the files their task names;
  - `npm run typecheck`;
  - in Task 5, `npm run test:e2e:client -- worldMap.spec.ts` once.

  The owner runs the full suites.
- **Work in** `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, branch `piece6`.

## Rulings made while planning (the owner reviews these with the plan)

1. **Size:** the composition (1280×960 picture and its buttons) fills the world view as Neuz fills the screen: the
   largest 4:3 rectangle inside the safe area, centred. Outside the picture the fill is `#3B3D2F` when the area is 4:3
   within 1%, black otherwise, as in Neuz's 4:3 and wide paths [R §3]. This applies on the PC and on phones.
2. **Close button** (a web addition, since Neuz has none): `ButtWndExit.tga` at the picture's top right, with a 44 px
   touch area. On a phone it is the only way out.
3. **Escape** closes only the map. Neuz's same press also runs the normal Escape order.
4. **Input while open:** every key is held, except M and Escape, which close the map. Pointer input on the overlay
   never reaches the world. Opening the map runs the modal reset (`modalChanged`), so a held walk key or joystick stops
   the character with its ordinary stop packet. That stop belongs to the controls, as on focus loss; the map itself
   sends nothing. Neuz lets keys walk under the map; the spec chose to hold them.
5. **Arrow:** a copy of Neuz, including the aspect skew [R §6]. It turns by the camera's yaw (from the camera to the
   player), and the own name label sits above it in `#7FFF7F`.
6. **Tooltip:** Neuz's 9-slice frame (`WndTooltipTile00-08.tga`), with the text and colours of [R §7].
7. **Phone picking:** a tap picks the monster icon whose centre is nearest, within 22 CSS px. The mouse keeps Neuz's
   40×40 boxes, where the last row wins. Map 0 shows no icons and no details.
8. **The monster switch** lasts the page session. `WorldScreen` keeps it across world changes, whose HUD rebuild would
   otherwise reset it.
9. **A missing `data/worldMap.json`:**
   - one overlay error: `worldMap.json missing: run npm run convert -- --only ui,data`;
   - M and the Start line then do nothing more.

## Review Focus

1. **Overlapping and edge points:** (6370, 3826) lies in both the Flaris and Darkon12 outlines, and must give Flaris
   (map 5). (7253, 2690) lies in neither and must give 100, so M prints the message. Pinned in Task 3.
2. **An older `dist/assets` without the catalog:** login and play work, and M gives one overlay error and no throw.
   Pinned in Task 4.
3. **Opening the map while walking** (a key or the joystick held): the character stops; while the map is open, nothing
   else is sent; after closing, the controls work again. Pinned in Tasks 4 and 5.
4. **A world change while the map is open:** the map closes; the switch state survives; one map element and no extra
   key listeners after re-entry. Pinned in Task 4.
5. **A 390 px tall landscape phone with safe insets:** the whole picture and all 9 buttons are visible, the close button
   is reachable, and a tap on an icon shows details without walking. Pinned in Task 5.

---

### Task 1: The two readers

**Files:**
- Create: `packages/formats/src/inc/continent.ts`, `packages/formats/src/inc/mapMonsterPack.ts`.
- Modify: `packages/formats/src/index.ts` (exports).
- Test: `packages/formats/test/worldMapReaders.test.ts`.

**Interfaces:**
- Produces:
  - `readContinents(text: string, file: string): ContinentPolygon[]`, with
    `ContinentPolygon = { id: number; town: boolean; ring: Array<[number, number]> }`. The ring holds integer `[x, z]`
    points, closed by repeating the first. The list is sorted by ascending `id`, the first of a repeated id wins, and
    `C_useRealData 0` blocks are skipped to their `END`. This copies `CContinent::Init` [R §5].
  - `readMapMonsterPack(text: string, defines, file: string, textureSize: { w: number; h: number }): MapMonsterPack`.
    `defines` has the type of `ScriptReader`'s defines parameter (`packages/formats/src/script/cscript.ts`). It returns
    `MapMonsterPack = { texture: string; colorKey: number; frames: MapFrame[]; rows: MapMonsterRow[] }`, with
    `MapFrame = { x: number; y: number; w: number; h: number }` and
    `MapMonsterRow = { movers: number[]; x: number; y: number; drop: number }`. Row k pairs with frame k. This copies
    `CMonsterInfoPack::LoadScript` [R §7].

- [ ] **Step 1: Write the failing tests.** Fixtures are cut from the real files and pasted as strings: the Flaris block,
  the Estia block followed by the skipped `Estia_envir` block, one Darkon3 row with 5 ids, one Ricis row with drop 0,
  and a `TOWN 1` block. Assert:
  - the Flaris polygon has id 1, 11 points plus the closing one, and truncated integers;
  - `Estia_envir` is absent;
  - a repeated id keeps the first;
  - `TOWN 1` sets `town: true`;
  - a row's movers, its `x`/`y` exactly as authored, and its drop;
  - 6 or more mover ids throw `FormatError` naming the file;
  - more rows than `number` throw.

  `texMapButton.inc` needs no new reader: `readTexturePack` already reads its 27 frames [R "What FlyffWeb has already"].
  Add one assertion that it does: frame 26 at y 704, height 88.
- [ ] **Step 2:** Run `npx vitest run packages/formats/test/worldMapReaders.test.ts`. Expected: FAIL (the modules are
  missing).
- [ ] **Step 3:** Implement both readers with `ScriptReader`, citing `Continent.cpp:29-104` and `WorldMap.cpp:1513-1651`
  in the doc comments.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(formats): the continent outlines and the world map's monster scripts`.

### Task 2: The catalog and the art in the converter

**Files:**
- Create: `packages/formats/src/web/worldMap.ts`, `tools/convert/src/data/worldMapCatalog.ts`.
- Modify:
  - `packages/formats/src/index.ts`;
  - `tools/convert/src/data/gameDataStage.ts` (one `catalogs` entry);
  - `tools/convert/src/ui/uiStage.ts` (`THEME_FILES`).
- Test: `tools/convert/test/worldMapCatalog.test.ts`, `tools/convert/test/uiStage.test.ts`; a corpus case in
  `tools/convert/test/worldMap.corpus.test.ts`.

**Interfaces:**
- Consumes: Task 1's readers.
- Produces `WORLD_MAP_KEY = 'data/worldMap.json'` and:
  ```ts
  interface WebWorldMap {
    world: number;                                   // WI_WORLD_MADRIGAL, 1
    maps: Array<{
      index: number;                                 // 0-7, WorldMap.cpp:197-209 order
      picture: string;                               // ui key, e.g. 'ui/world_flaris.png'
      bounds: { x1: number; z1: number; x2: number; z2: number };  // [R §4] table, fround
      continent: number | null;                      // C_id, null for map 0
      monsters: { sheet: string; frames: MapFrame[]; rows: MapMonsterRow[] } | null;  // null for map 0
    }>;
    continents: Array<{ id: number; map: number; ring: Array<[number, number]> }>;  // ascending id, towns left out
    buttons: { sheet: string; frames: MapFrame[] };  // 27 frames of texMapButton.inc
    arrow: string;                                   // 'ui/imgmaparrow.png'
    tooltipTiles: string[];                          // the 9 'ui/wndtooltiptile0N.png'
  }
  ```

- [ ] **Step 1: Write the failing tests.**
  - `worldMapCatalog.test.ts` builds a fake client with `writeFakeClient`, holding a two-polygon `.cnt` under
    `World/WdMadrigal`, one monster script and the button `.inc`. Assert:
    - map 5's bounds are `{5500, 2540, 9200, 5130}` and map 0's are `{0, 1298, 11800, 9757}`;
    - the continent → map switch (1→5, 2→4, 3→3, 4→7, 241→1, 242→2, 243→6) [R §5];
    - the rows are kept;
    - a malformed row is reported and skipped, never written as 0,0;
    - a missing script leaves that map's `monsters` null, with one report line.
  - `uiStage.test.ts`: the new `THEME_FILES` produce `ui/world_flaris.png`, `ui/texmapbutton.png`,
    `ui/texmapmonster_flaris.png`, `ui/imgmaparrow.png` and `ui/wndtooltiptile00.png`, with the `0xffff00ff` key for the
    sheets and `0xff000000` for `world_*`.
  - Corpus test (skipped without the client): 7 polygons; 78 rows; every mover and drop id in the converted catalogs; each
    icon's back-projected centre within 300 m of a spawn of its first mover in `WdMadrigal.rgn` [R §4 cross-check].
- [ ] **Step 2:** Run `npx vitest run tools/convert/test/worldMapCatalog.test.ts tools/convert/test/uiStage.test.ts`.
  Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The constants come from [R §4, §5, §7] with their C++ lines.
  - The `.cnt` and the `Theme` scripts are read as loose files (`ctx.client.find`), not from packs [R open question 11].
  - `THEME_FILES` gains the 7 `WORLD_*.dds`, `TexMapButton.bmp`, the 7 `TexMapMonster_*.bmp`, `ImgMapArrow.bmp` and
    `WndTooltipTile00-08.tga`, with a comment citing `WorldMap.cpp:92-225`.
  - The catalog entry fails on its own, as the others do.
- [ ] **Step 4:** Run the Step 2 command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Convert into this worktree:
  `npm run convert -- --only ui,data --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client"`.
  Expected: exit 0. `dist/assets/index.json` then has `data/worldMap.json` and the 25 new `ui/` keys, and the report has
  no failure. Record the counts for the checkpoint.
- [ ] **Step 6:** Commit: `feat(convert): the world map catalog and art`.

### Task 3: The rules

**Files:**
- Create: `apps/client/src/world/worldMapRules.ts`.
- Modify: `apps/client/src/world/hud/teleporterWindow.ts`. `teleportPoint` reuses `mapPoint`, and its wrong citation
  `:1359` becomes `:1399-1405`, `:1463-1490`.
- Test: `apps/client/test/worldMapRules.test.ts`; `apps/client/test/teleporterWindow.test.ts` stays green.

**Interfaces:**
- Consumes: `WebWorldMap` (Task 2).
- Produces:
  - `MAP_NONE = 100`.
  - `pointInPoly(x: number, z: number, ring: ReadonlyArray<[number, number]>): boolean`: `Point_In_Poly`, with the
    integer `xinters` (`Math.trunc`) [R §5].
  - `mapNumber(worldId: number, pos: { x: number; z: number }, map: WebWorldMap): number`: 100 off `map.world`; else
    the first continent, by ascending id, whose ring holds the truncated point; else 100.
  - `mapPoint(bounds, pos, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number }`:
    `sx = trunc(L + W·(x−X1)/(X2−X1))`, `sy = trunc(T + H·(Z2−z)/(Z2−Z1))` [R §4].
  - `cameraYaw(camera: Vec3, player: Vec3): number`: `atan2(dx, dz)` of player − camera [R §6].
  - `arrowMatrix(yaw: number, width: number, height: number): [number, number, number, number]`, the CSS matrix
    `a, b, c, d`: `kW·cos, kH·sin, −kW·sin, kH·cos`, with `kW = 0.035·W/37` and `kH = 0.035·H/37` [R §6].
  - `buttonRect(i: number, height: number): { x: number; y: number; w: number; h: number }`, with `rate = height/1024`,
    `w = trunc(228·rate)`, `h = trunc(88·rate)`, `y = trunc(80·rate) + i·h`.
  - `buttonFrame(i: number, shown: number, hovered: number | null): number`: `3i`, `+1` when hovered and not shown,
    `+2` when shown, and never `+2` for i 8 [R §3].
  - `monsterTip(row: MapMonsterRow, movers, itemProps, texts): TipLine[]`, where
    `TipLine = { parts: Array<{ text: string; color: number }>; element: number }`. These are the lines and colours of
    [R §7]: blue "Lv.", the level in `0xff8282c8`, the name in black (red for the last id), the element, then
    "Booty : " and the item in `0xff2e70a9`, or "None".

- [ ] **Step 1: Write the failing tests.**
  - The whole fixture table of [R §4]:
    - the Flaris lodestar (6968, 3328) gives map 5 and (507, 667) on it, (755, 729) on map 0;
    - Saint Morning, Darken and the four other rows;
    - every map's corners give (0,0) and (1280,960) in a 1280×960 rectangle.
  - Precedence: (6370, 3826) gives 5; (7253, 2690) gives 100; world 200 gives 100.
  - `cameraYaw`: camera south of the player gives 0; camera west gives π/2.
  - `arrowMatrix(0, 1280, 960)`: unrotated, it measures 44.8×31.8 px for the 37×35 picture.
  - `buttonRect(8, 768)`: `{0, 588, 171, 66}`.
  - `buttonFrame`: (5, 5, 5) gives 17; (3, 5, 3) gives 10; (8, 5, 8) gives 25.
  - `monsterTip` for Flaris row 0: four "Lv.1 …" lines, the last name red, then "Booty : Twinkle Stone". Drop 0 gives
    "None".
- [ ] **Step 2:** Run `npx vitest run apps/client/test/worldMapRules.test.ts apps/client/test/teleporterWindow.test.ts`.
  Expected: the rules file FAILS (no module) and the teleporter tests PASS.
- [ ] **Step 3:** Implement. Make `teleportPoint` call `mapPoint` on map 0's bounds, scaled to its 788×591 body.
- [ ] **Step 4:** Run the same command. Expected: PASS, the teleporter's tests unchanged.
- [ ] **Step 5:** Commit: `feat(client): the world map's rules, copied from WorldMap.cpp and Continent.cpp`.

### Task 4: The overlay and its wiring

**Files:**
- Create: `apps/client/src/world/hud/worldMap.ts`, `apps/client/src/world/worldMapData.ts`.
- Modify:
  - `apps/client/src/world/hud/applets.ts`: `AppId.MAP = 228`; the `APPLETS` row with hotkey `'M'` exists already.
  - `apps/client/src/world/hud/taskBar.ts`: `'worldmap'` in `TaskBarWindow` and `WINDOWS`, and a `MENU` line "World Map"
    just before Navigator.
  - `apps/client/src/world/WorldScreen.ts`:
    - create and dispose the map;
    - `openWindow('worldmap')`, which does nothing while the NPC dialog is open [R §2];
    - a per-frame `update`;
    - Escape: the map comes first;
    - close the map when a modal opens;
    - keep `monsterInfo` across world changes.
  - `apps/client/src/style.css`: `.hud-worldmap` covers the whole HUD layer, sits above the windows and the task bar, and
    hides the touch controls while open.
- Test: `apps/client/test/worldMap.test.ts` (jsdom).

**Interfaces:**
- Consumes: Tasks 2 and 3; `UiArt`, `themeKey` and `themeUrl` (`hud/art.ts`); `modalChanged` and `holdKey`
  (`hud/modal.ts`, `WorldScreen.ts`); `say(id)` (`WorldScreen.ts:1127`).
- Produces:
  - `loadWorldMap(store): Promise<WebWorldMap | null>`: null, with one overlay error (Ruling 9), when the key is
    missing.
  - `class WorldMap`:
    - `constructor(art: UiArt, data: WebWorldMap | null, game: Pick<GameData, 'movers' | 'itemProps' | 'texts'>, say: (id: string) => void, doc: Document)`;
    - `element: HTMLElement`;
    - `isOpen: boolean`;
    - `monsterInfo: boolean` (get and set);
    - `toggle(view: MapView): void`: opens on `mapNumber`'s map, or says `TID_GAME_MAPMSG` on 100;
    - `close(): void`;
    - `update(view: MapView): void`;
    - `dispose(): void`.
  - `MapView = { worldId: number; pos: Vec3; camera: Vec3; name: string }`.
  - `WorldMap` takes no session and no send callback.

- [ ] **Step 1: Write the failing tests** (jsdom, with fake art and a small `WebWorldMap`):
  - **Opening:** `toggle` at the Flaris lodestar opens on map 5 with button 5 drawn as selected; `toggle` again closes
    it.
  - **Other worlds:** world 200, or (7253, 2690), says `TID_GAME_MAPMSG` and stays closed.
  - **Buttons:** pressing button 3 shows map 3 and hides the arrow when the player is on map 5. Map 0 always shows the
    arrow.
  - **Monster switch:** button 8 toggles icons on maps 1-7 and none on map 0. Hovering an icon shows `monsterTip`'s text
    inside the 9-slice frame. A tap within 22 px of an icon's centre shows the same; a tap elsewhere shows nothing.
  - **Input:** with the map open, a `keydown` of `KeyW` is held (it does not reach a window listener), while `KeyM` and
    `Escape` close the map.
  - **Missing data:** a null `data` gives one error from `loadWorldMap`, and `toggle` does nothing.
  - **Teardown:** `dispose` removes the element and every listener; a second `WorldMap` on the same document leaves one
    `.hud-worldmap`.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/worldMap.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the overlay:
  - **Layout:** Rulings 1-7. The picture is a 4:3 box sized to the HUD layer's safe area. Buttons come from
    `buttonRect`/`buttonFrame` as sprites of `texmapbutton.png`. Monster icons are drawn at
    `(trunc(x·W/1280), trunc(y·H/960))`, scaled by `H/1024`, at alpha 255 when hovered and 150 otherwise [R §7].
  - **Arrow:** `arrowMatrix(cameraYaw(...), W, H)` at `mapPoint`.
  - **Name label:** above the arrow, in `#7FFF7F`.
  - **Tooltip:** placed above the icon and clamped as in `tooltip.cpp:406-488`.

  Then wire it in. `WorldScreen` builds `MapView` from the own mover's position, `backCamera`'s position and the own
  name.
- [ ] **Step 4:** Run `npx vitest run apps/client/test/worldMap.test.ts apps/client/test/teleporterWindow.test.ts apps/client/test/minimap.test.ts`,
  then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the world map on M and in the Start menu (Piece 6 M1)`.

### Task 5: The browser spec and the owner's docs

**Files:**
- Create: `apps/client/e2e/worldMap.spec.ts`, `docs/piece6-m1-checkpoint.md`.
- Modify:
  - `docs/device-testing.md`: a section "Piece 6, milestone 1: the world map";
  - `README.md`: one sentence in the "What is built" paragraph, and the new catalog in the converter's list.

**Interfaces:**
- Consumes: the `worldHarness.ts` helpers (`playGateway`, `enterFlaris`, `ownAt`, `sentOf`) and the REPLACE to Mars Mine
  used by `travel.spec.ts`.

- [ ] **Step 1: Write the spec**, for desktop and landscape phone.
  - **Opening and buttons:**
    - M in Flaris opens on map 5;
    - each of the 9 buttons switches the picture: the `src` of the map image ends in that map's key;
    - the Start menu's "World Map" line toggles it too.
  - **Monster details:** with the switch on, hover (desktop) or tap (phone) on the first Flaris icon shows
    "Booty : Twinkle Stone".
  - **Closing:** M, Escape and the close button each close it.
  - **No packet:** the gateway's sent packets are the same before opening as after browsing and closing, with no
    PLAYERSETDESTPOS, PLAYERMOVED, SETTARGET or TELEPORTER.
  - **Phone fit:** on the phone, the picture's bounding box lies inside the viewport minus the safe insets, and the close
    button's box is at least 44×44.
  - **Mars Mine:** after the REPLACE to Mars Mine, M prints "You can not use the Map in this Dungeon." and opens nothing.
  - **Teleporter:** the NPC teleporter map still opens and sends its TELEPORTER (re-run `navigation.spec.ts`'s
    teleporter case through the same harness call).
- [ ] **Step 2:** Run `npm run test:e2e:client -- worldMap.spec.ts` once. Expected: every case passes in both projects.
  A failure in the test environment rather than the product is noted, not chased.
- [ ] **Step 3: Write the docs.**
  - **Checklist steps**, for the PC, an Android phone and an iPhone:
    - M and the Start line open the map on the right continent;
    - each button switches the map;
    - the arrow sits where you stand and turns with the camera;
    - the monster switch and its details work;
    - in Mars Mine, M shows the message;
    - the NPC teleporter still works;
    - Escape and the close button close the map.
  - **What the test character needs:** any character in Flaris; a trip to Mars Mine through the teleporter NPC.
  - **The checkpoint note:** files, test names, the converter counts from Task 2, and the rulings above.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: exit 0 and no `failed` line. Record the counts.
- [ ] **Step 5:** Commit: `test(client): the world map in the browser; M1 checklist`.

---

## Owner checkpoint (after Task 5)

On the PC, in `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, with your own `dev:client` stopped for
the browser tests:

| What | Command | Time | Pass |
|---|---|---|---|
| Client browser tests | `npm run test:e2e:client` | about 30-40 min | no `failed` line |
| Real-file tests | `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 10 min | no `failed` line |
| Device check | `docs/device-testing.md`, "Piece 6, milestone 1", with `dev:client` started **from the piece6 folder** | 15 min | every "Success:" holds |

If something fails, send the last 30 lines of the command, or for the device check, the step, the device and what you
saw.
