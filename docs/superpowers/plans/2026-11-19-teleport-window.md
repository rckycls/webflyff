# Teleport window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CUSTOM V15-look Teleport window (Start menu → Extras → Teleport): 14 places, 10,000 penya, a 10 s wait,
Flaris / Saint Morning / Darkon for everyone and all 14 for VIP1-VIP4 and GMs, on desktop and phone landscape.

**Architecture:** The client sends only a place number in a new packet (0x8FFF0120). A World patch holds the same
table, checks VIP, wait, state, place and penya, then `REPLACE`s the player. The window is a `ResWindow` with a list,
the place's name, its V15 region map with a marker, and a text line.

**Tech Stack:** TypeScript (FlyffWeb: vitest, Playwright Chromium), C++ VS 2022 Release|Win32 (World server).

**Spec:** `docs/superpowers/specs/2026-11-19-teleport-window-design.md`

## Global Constraints

- Packet `PACKETTYPE_TELEPORT_WINDOW` / `PacketType.TELEPORT_WINDOW` = `0x8FFF0120`, body: one 32-bit int, the place
  number 0-13.
- Price `10000` penya; wait `10000` ms; places, order, coordinates and VIP flags exactly as the spec's table.
- VIP = authority letters `A B C E` (`IsAuthVip` on the server, `vipTier` on the client); GMs (`'L'` or later) too.
- Client applet id `9005` (9004 is the unmerged Awaken window's).
- Custom chat lines (English, server and client the same): "Only VIP players can teleport there.",
  "You can teleport again in %d seconds.", "You cannot teleport now.", "You cannot teleport from here.".
- No convert: pictures are `WORLD_*.dds` (already converted), the line's icon is `ui/item/itm_sysblibliblinkw.png`.
- Server patch after the 13 on main `Source`; never applied to main `Source` here. FlyffWeb is a PUBLIC repo: no secrets.
- Comment every custom line with `custom (owner 2026-11-19)`.

## Review Focus

1. A client list order different from the server's → the player lands somewhere else: a test pins the client table;
   the server header's comment names the client file.
2. Apply pressed twice quickly → two sends; the server's wait refuses the second (no double charge). The window closes
   on the first Apply.
3. A refused `REPLACE` (flying slipped through, bad layer) → no penya taken, no wait started: the server takes both only
   after `REPLACE` returns TRUE.
4. A non-VIP choosing a VIP row on the phone → the picture and "VIP only" show, Apply refuses with the VIP line and
   sends nothing (unit test).
5. The window on a 667 x 375 phone → whole on screen above the task bar (e2e box check, phone project).

---

### Task 1: World patch (outer repo, `Bakbak\Blouflash-worktrees\teleporter`)

**Files** (in the worktree's `Source` copy; a scratch git there makes the diff):
- Create: `Source/_Common/TeleportWindow.h`: the 14 `{ x, z, bVip }` rows, `TELEPORT_WINDOW_COST 10000`,
  `TELEPORT_WINDOW_WAIT 10000`.
- Modify: `Source/_Network/MsgHdr.h` (by `PACKETTYPE_TELEPORTER`), `Source/WORLDSERVER/DPSrvr.h` and `DPSrvr.cpp` (the
  `ON_MSG` and `OnTeleportWindow` by `OnTeleporterReq`), `Source/WORLDSERVER/User.h` + `User.cpp` (`DWORD
  m_tmTeleportWindow`, 0 in `Init`).
- Create: `patches/2026-11-19-teleport-window.patch` (paths `a/Source/...`), `docs/2026-11-19-teleport-window-deploy.md`,
  `Program/7. World.exe` (force-added, as earlier branches).

- [ ] **Step 1:** Write `OnTeleportWindow( CAr & ar, DPID dpidCache, DPID dpidUser, LPBYTE, u_long )`: `ar >> nPlace`,
  then the spec's checks 1-8 in order. Use `GetSummonState()` and the party summon's state → TID mapping
  (`DPSrvr.cpp:5772-5792`); `IsChaotic() || IsPKPink()`; the Blinkwing's world/event checks (`MoverSkill.cpp:1735-1879`)
  plus `IsArena()`; `REPLACE( g_uIdofMulti, WI_WORLD_MADRIGAL, D3DXVECTOR3( x, 0, z ), REPLACE_NORMAL, nDefaultLayer )`;
  on TRUE `AddGold( -TELEPORT_WINDOW_COST )`, `m_tmTeleportWindow = GetTickCount()`, `PutPenyaLog( pUser, "T", ... )`.
- [ ] **Step 2:** Build: `MSBuild Source\all\all.sln -t:WorldServer -p:Configuration=Release -p:Platform=Win32`.
  Expected: 0 errors.
- [ ] **Step 3:** Make the patch from the scratch git; check: `git apply --check` against main `Source` passes; and stacked
  in both orders with `awaken-window`, `vip-perks` (both its patches) and `craft-card` patches (each from its branch).
- [ ] **Step 4:** Copy `Output\WorldServer\Release\WorldServer.exe` to `Program/7. World.exe`; note its SHA-256 and size
  in the deploy doc (VPS steps, rollback, in-game checks). Commit on outer branch `teleporter`.

### Task 2: Protocol

**Files:** Modify `packages/protocol/src/constants.ts`; Create `packages/protocol/src/world/teleportWindow.ts`, export from
`packages/protocol/src/index.ts`; Test `packages/protocol/test/teleportWindow.test.ts`.

**Interfaces:** Produces `PacketType.TELEPORT_WINDOW = 0x8fff0120`, `TELEPORT_PLACE_COUNT = 14`,
`encodeTeleportWindow(place: number): Uint8Array`.

- [ ] **Step 1:** Test: `encodeTeleportWindow(5)` reads back (as `pets.test.ts`'s `body`) type `0x8fff0120` and int32 `5`;
  `-1`, `14`, `1.5`, `NaN` throw `RangeError`.
- [ ] **Step 2:** Run `npx vitest run packages/protocol/test/teleportWindow.test.ts` → FAIL.
- [ ] **Step 3:** Implement with `clientPacket(PacketType.TELEPORT_WINDOW).i32(place).toBytes()`.
- [ ] **Step 4:** Run again → PASS. Commit.

### Task 3: The places

**Files:** Create `apps/client/src/world/hud/teleportPlaces.ts`; Test `apps/client/test/teleportPlaces.test.ts`.

**Interfaces:**
- Produces `interface TeleportPlace { name: string; x: number; z: number; vip: boolean; map: string; about: string }`,
  `TELEPORT_PLACES: readonly TeleportPlace[]` (the spec's table; `map` the theme file, e.g. `'WORLD_Flaris.dds'`),
  `TELEPORT_COST = 10_000`, `canTeleportTo(place: TeleportPlace, authorization: number): boolean`,
  `placeMarker(place: TeleportPlace): { left: number; top: number }` (percent of the picture, with `mapPoint` and the
  map's bounds from `tools/convert/src/data/worldMapCatalog.ts`).

- [ ] **Step 1:** Tests: 14 rows whose `[name, x, z, vip]` equal the spec's table in order; only rows 0-2 have
  `vip: false`; `canTeleportTo(row 5, 'F')` false, `'A' 'B' 'C' 'E' 'L' 'P'` true, row 0 true for `'F'`; every
  `placeMarker` is within 0-100 on both axes; every `about` is non-empty and under 120 characters.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (the `about` lines: what the place is; a dungeon's monster level range
  read once from V15 data while writing them). **Step 4:** Run → PASS. Commit.

### Task 4: The window

**Files:** Create `apps/client/src/world/hud/teleportWindow.ts`; Test `apps/client/test/teleportWindow.test.ts`;
Modify `apps/client/src/style.css` (desktop look + the phone panel, after the Forsaken Tower's block).

**Interfaces:**
- Consumes Task 2 (`TELEPORT_PLACE_COUNT`), Task 3.
- Produces `interface TeleportHost { authorization(): number; gold(): number; say(text: string): void;
  sayTid(tid: string): void; send(place: number): void }` and
  `class TeleportWindow { constructor(host: TeleportHost, art: UiArt, doc?: Document); element; isOpen; open(); close();
  toggle(); dispose() }`, layout `TELEPORT_LAYOUT` (`ResWindow`, title `'Teleport'`, `hud-teleport`, `overBag`).

- [ ] **Step 1:** Tests (jsdom, as `petFilterWindow.test.ts`): 14 `[role="option"]` rows with the names; rows 3-13 carry
  `data-vip`; `open()` chooses Flaris (name static "Flaris", picture uses `world_flaris`); a click on row 5 shows
  "Shaduwar" and `world_harmonin`; Apply with authorization `'F'` on row 5 → `say('Only VIP players can teleport
  there.')`, no send, window open; with `'A'` → `send(5)` and closed; `'F'` row 1 with gold 9,999 → `sayTid
  ('TID_GAME_LACKMONEY')`, no send; close and `open()` again → row 1 still chosen; the cost static reads `10,000 Penya`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (rows as the Forsaken Tower's, `data-chosen` bar; the picture a
  `custom` control with `themeUrl(art, place.map)` and a marker; the phone's ghost-click guard as the Forsaken Tower's).
- [ ] **Step 4:** Run → PASS. Commit.

### Task 5: Wiring, Start menu folder, e2e

**Files:** Modify `apps/client/src/world/hud/applets.ts` (`AppId.TELEPORT 9005`, icon `ui/item/itm_sysblibliblinkw.png`),
`apps/client/src/world/hud/art.ts` (`themeKey` passes `ui/...png` keys through — the same two lines as the awaken
branch), `apps/client/src/world/hud/taskBar.ts` (window `'teleport'`; MENU: folder `'Extras'` = Auto Play, Pet Filter,
Teleport in place of the two lines), `apps/client/src/world/WorldSession.ts` (`sendTeleportWindow(place: number)`),
`apps/client/src/world/WorldScreen.ts` (build, layer, `'teleport'` toggles, closed on leave/dispose);
tests `apps/client/test/hud.test.ts`, e2e `startMenu`, `autoPlay`, `petFilter`, `landscape` specs; Create
`apps/client/e2e/teleportWindow.spec.ts`.

- [ ] **Step 1:** hud.test: top level is `[..., 'Siege Ranking', 'Extras', 'Option', 'Log out']` (17 lines); the Extras
  folder holds Auto Play, Pet Filter, Teleport; applet 9005's entry.
- [ ] **Step 2:** Implement; run `npx vitest run apps/client/test/hud.test.ts apps/client/test/teleportWindow.test.ts
  apps/client/test/teleportPlaces.test.ts` → PASS.
- [ ] **Step 3:** e2e `teleportWindow.spec.ts` (scripted world, gold 1,000,000): Start → Extras → Teleport opens it, the
  window whole on screen above the task bar; as `'F'`: Darkon + Apply sends `0x8fff0120` with 2, the window closes; a VIP
  row refused with nothing sent; as `'A'`: Volcane sends 11. Screenshots to the test output. Update the four specs to open
  Auto Play / Pet Filter through Extras and the line lists.
- [ ] **Step 4:** `npm run typecheck`; `npx playwright test e2e/teleportWindow.spec.ts e2e/startMenu.spec.ts
  --project=chromium --project=phone` on a free port → pass. Commit.

### Task 6: Hand-over

- [ ] Write `docs/2026-11-19-teleport-window.md` (what, files, tests run, the owner's full commands, VPS steps); copy
  screenshots to the shared notes folder; one fresh reviewer over both branches; fix Important findings. Commit.
