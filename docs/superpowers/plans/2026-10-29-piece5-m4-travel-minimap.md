# Piece 5 Milestone 4: Travel and Minimap Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task. Steps use checkbox syntax for tracking.

**Goal:** Keep a player connected while an NPC teleports them to another supported world, and provide a compact minimap for local navigation.

**Architecture:** Treat cross-world REPLACE as a world-session transition, not a position correction. Load the target converted manifest and assets, rebuild world/render/session state from the following snapshot, then show a compact current-world minimap using converted world bounds and positions.

**Tech Stack:** TypeScript, existing Vite asset index, Three.js world loader, protocol, Vitest, Playwright Chromium.

**Spec:** docs/superpowers/specs/2026-10-29-piece5-design.md, sections 3, 4 and 5 (Milestone 4).

## Global Constraints

- Piece 5 has compact minimap/navigation only; full world map remains Piece 6.
- NPC teleport choices use server-supported destinations; blinkwings and general scroll travel are deferred.
- REPLACE and following destination snapshot must produce one clean world transition without ending the cache session.
- Missing/invalid target assets or world IDs fail cleanly; do not leave a partially loaded world.
- Owner runs full tests and VM/device checks at the checkpoint; no Neuz session is required.

## Review Focus

- REPLACE followed by ADD_OBJ is not lost or applied to stale WorldState; test packet ordering and buffered snapshot arrival.
- Missing target manifest/asset leaves the client in a recoverable disconnected state; test absent and malformed manifest.
- Rapid consecutive world transitions dispose old world controls/listeners/render resources; test enter-transition-transition-teardown lifecycle.
- Minimap coordinate conversion respects world origin/center and map bounds; test corners, center and negative/offset coordinates.
- Minimap remains usable on small landscape screens and does not intercept joystick, camera drag or world taps; test overlapping touch targets.

---

### Task 1: Cross-world transition lifecycle

**Files:**
- Modify: apps/client/src/world/WorldSession.ts, WorldScreen.ts, WorldState.ts, world asset loading/manifest and main world entry code
- Test: apps/client/test/worldSession.test.ts, worldScreen tests and one focused client e2e spec

**Interfaces:**
- Consumes: validated REPLACE worldId/position, current asset index, world manifest loader and following snapshot.
- Produces: a transition result that tears down old world-only state, loads destination assets and attaches destination snapshot while preserving the cache connection.

- [x] Trace Neuz OnReplace and server AddReplace ordering; map asset-load failures and cache keep-alive behavior.
- [x] Add failing tests for same-world REPLACE, cross-world REPLACE, delayed ADD_OBJ, invalid world, missing manifest and teardown.
- [x] Implement a bounded transition state machine; retain the world session only while a valid target load can complete.
- [x] Run focused tests and the touched e2e spec once; expected: PASS.

### Task 2: NPC teleporter choices and request

**Files:**
- Modify: packages/formats/src/web/gameData.ts, tools/convert/src/data/gameDataStage.ts, apps/client/src/world/hud/npcDialog.ts and WorldSession.ts
- Test: converter/NPC interaction tests and client e2e teleport spec

**Interfaces:**
- Consumes: NPC teleport destinations and the existing character key/index request format.
- Produces: native NPC teleport request; the server decides whether it is valid and emits REPLACE.

- [x] Add failing tests for supported destinations, malformed destination row, distance refusal and server-accepted REPLACE.
- [x] Preserve parsed AddTeleport destinations needed for the supported worlds, offer them from the NPC interaction menu, and send the native TELEPORTER request.
- [x] Run focused tests and the teleport e2e spec once; expected: PASS.

### Task 3: Compact minimap and navigation

**Files:**
- Create: apps/client/src/world/hud/minimap.ts
- Modify: apps/client/src/world/WorldScreen.ts, hud/applets.ts, world manifest/map conversion and style.css
- Test: apps/client/test/minimap.test.ts and one focused client e2e spec

**Interfaces:**
- Consumes: current world metadata, converted terrain bounds/center, own mover position/heading and supported NPC locations.
- Produces: compact map panel and navigation markers; no full-screen world map.

- [x] Test coordinate mapping, bounds clipping, absent map data, heading marker and phone hit-target interactions.
- [x] Convert/preserve only metadata required for current-world minimap; render player/NPC markers and an applet toggle.
- [x] Run focused tests and the touched e2e spec once; expected: PASS.

### Task 4: Milestone 4 and Piece 5 checkpoint

- [x] Automated full npm test and npm run typecheck passed (2026-11-01).
- [x] Travel, navigation and talking browser flows passed in Chromium desktop and landscape phone (16 tests; custom local port configuration).
- [ ] Owner runs npm run test:live:world in the VM with a test character and two converted destination maps; verify NPC teleport, REPLACE, destination join and minimap.
- [ ] Owner completes the Piece 5 device checklist on PC, iPhone and Android landscape; confirm world map remains out of this piece.
