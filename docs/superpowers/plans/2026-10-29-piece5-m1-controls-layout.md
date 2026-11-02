# Piece 5 Milestone 1: Controls and Layout Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task. Steps use checkbox syntax for tracking.

**Goal:** Keep existing movement/combat controls, prevent attack-button disconnects, add the requested camera/jump controls, and make the world HUD usable on phones.

**Architecture:** Extend the existing WorldScreen input path and camera rig. Separate camera pointers from joystick/game presses, use existing mover state and correction messages for jump, and keep browser UI changes in the existing HUD/CSS. The gateway limit remains unchanged.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, Playwright Chromium, CSS.

**Spec:** docs/superpowers/specs/2026-10-29-piece5-design.md, sections 2, 4 and 5 (Milestone 1).

**Status:** Implemented; owner device/VM checkpoint pending. See [checkpoint instructions](../../piece5-m1-checkpoint.md).

**Implementation rulings:**
- Attack-button repeats already coalesced. The reproducible flood occurs when unavailable animations end every rules step. Combat now waits for its actual weapon/combat clips; a failing/pending model cannot trigger a packet burst.
- Touch drag starts after 8 CSS pixels; short taps retain the existing 300 ms limit. Left-side short taps still select/walk; a drag claims the floating joystick. Another pointer can turn the camera concurrently.
- About half-size mobile windows means 0.7 linear scale (0.49 area), with readable base text; actual device readability is an owner acceptance check.

## Global Constraints

- Joystick moves only; forward follows camera heading; tap-to-walk never turns camera.
- PC camera uses right-button drag; left click retains game actions. Touch screen drag turns camera while another pointer can hold joystick.
- Camera changes caused by character facing/relocation ease over about 0.5 seconds; direct drag follows the pointer.
- Jump uses native state, animation, movement, landing/collision and server behavior; Space on PC, button above attack on touch.
- Do not weaken the gateway packet limit, add WebKit automation, or require Neuz recordings.
- Phone taskbar spans full width at bottom with safe areas; mobile windows are about half PC size with readable text.
- Full browser suites and live/device checks are owner-run at the checkpoint.

## Review Focus

- Repeated attack presses while an attack is pending cannot flood the gateway; add a spam regression to the attack loop test.
- A drag cannot select, walk or attack, while a tap still does; add pointer threshold tests for desktop and touch.
- Simultaneous joystick and camera pointers remain independent; add a two-pointer input test.
- Jump reports, landing, collision and remote motion remain coherent; test jump start, apex/landing, correction, and a remote jump report.
- Focus loss, modal open/close, pointer cancel, resize, and disposal release every input; extend WorldScreen lifecycle tests.

---

### Task 1: Stop attack-button packet bursts

**Files:**
- Modify: apps/client/src/world/combat/attackLoop.ts and apps/client/src/world/hud/attackButton.ts
- Test: apps/client/test/attackLoop.test.ts and apps/client/test/hud.test.ts

**Interfaces:**
- Consumes: existing Focus, AttackLoop, and touch attack button.
- Produces: repeated presses while the same attack command is active coalesce into the current command; a deliberate new attack after completion remains available.

- [x] Add a fake-clock regression that presses rapidly while one attack request is active and asserts bounded MELEE_ATTACK/PLAYERSETDESTOBJ output.
- [x] Run the two focused tests; expected: FAIL before the guard.
- [x] Implement command coalescing at the client attack boundary; preserve regular combo cadence and target changes.
- [x] Run the focused tests; expected: PASS. Do not change gateway RateWindow.

### Task 2: Add camera input and easing

**Files:**
- Create: apps/client/src/world/cameraControls.ts
- Modify: apps/client/src/world/WorldScreen.ts, apps/client/src/world/sim/camera.ts, packages/scene/src/world/player.ts and apps/client/src/style.css
- Test: apps/client/test/cameraControls.test.ts and relevant world-screen tests

**Interfaces:**
- Consumes: pointer events, current camera yaw/pitch/zoom and existing camera collision data.
- Produces: a disposable camera controller exposing drag deltas and an eased autonomous target orientation with a 500 ms transition.

- [x] Test desktop right-drag, touch drag threshold, pointer cancel, bounds, direct tracking, and simultaneous joystick pointer.
- [x] Implement right-button mouse capture and one-finger screen drag; reserve short presses for select/attack/walk and support two independent pointer IDs.
- [x] Ease camera direction changes caused by mover heading or relocation over 500 ms; keep camera collision and tap picking aligned to the rendered camera.
- [x] Run the focused camera and picking tests; expected: PASS.

### Task 3: Add native jump input and simulation

**Files:**
- Modify: packages/scene/src/input/keyboard.ts, apps/client/src/world/controls.ts, ownMover.ts, sim/ActionMover.ts, sim/moverRules.ts, WorldScreen.ts and apps/client/src/style.css
- Test: packages/scene/test/input.test.ts, apps/client/test/sim/actionMover.test.ts, ownMover.test.ts, worldState.test.ts and worldGestures.test.ts

**Interfaces:**
- Consumes: Space key, touch jump-button press, mover motion reports, terrain collision and server correction.
- Produces: one jump intent/action, native jump states and motion, and the matching existing movement/behavior report; no new jump-specific server packet unless source tracing proves one is required.

- [x] Add failing tests for keyboard/touch jump intent, jump state transitions, vertical arc, collision landing, duplicate press suppression, and remote jump playback.
- [x] Trace the active V15 OBJMSG_JUMP state/packet path against ActionMoverMsg.cpp and ActionMoverState.cpp before editing.
- [x] Implement local and remote jump behavior, correction handling, key lifecycle, and a small touch button above attack.
- [x] Run only the focused tests; expected: PASS.

### Task 4: Apply mobile layout, context-menu and hosting fixes

**Files:**
- Modify: apps/client/src/style.css, apps/client/src/world/WorldScreen.ts, relevant hud modules, docs/hosting.md and docs/device-testing.md
- Test: apps/client/test/hud.test.ts and relevant world-screen tests

**Interfaces:**
- Consumes: existing HUD window dimensions, safe-area CSS variables, debug overlay, taskbar, attack button and login form.
- Produces: compact phone windows, collapsible debug overlay, bottom full-width safe-area taskbar, no stray J, game-surface context-menu suppression, and Caddy compression/cache instructions.

- [x] Add assertions for mobile window dimensions/readable text classes, overlay toggle, taskbar edges/safe areas, jump-button placement, and right-click behavior that preserves text-box paste.
- [x] Implement the responsive layout and contextmenu handling only on the game surface; preserve taskbar right-click removal behavior.
- [x] Update the Caddy example to encode zstd/gzip and cache fingerprinted assets as public, max-age=31536000, immutable, excluding report.json.
- [x] Update the owner device checklist; run focused tests and docs link/command checks.

### Task 5: Milestone 1 checkpoint

- [x] Builder ran npm test and npm run typecheck in the Piece 5 worktree.
- [x] Focused controls.spec.ts passed in desktop and landscape-phone Chromium using installed Chrome and temporary port 5175.
- [x] Converted dist/assets copied into this worktree from Piece 4.
- [x] Owner accepted Milestone 1 on 2026-10-30: “Milestone 1 pass.” This clears the Milestone 2 gate. Individual owner-run command outputs were not separately reported; the device/live checklist remains in docs/piece5-m1-checkpoint.md.
