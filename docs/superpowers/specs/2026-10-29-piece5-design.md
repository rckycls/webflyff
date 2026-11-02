# FlyFF Web Client — Piece 5: Controls, Items, Social Play and Travel

**Date:** 2026-10-29
**Status:** Approved by owner on 2026-10-29
**Builds on:** Piece 4 combat and skills on main; Piece 3 world session, collision, terrain and movement.
**Research:** five read-only passes over FlyffWeb and the local V15 C++ source. Source paths below are relative to `Blouflash VS22 V15/` unless stated otherwise.

## 1. Goal and shape

Piece 5 completes the next playable browser-client slice: comfortable controls and camera on desktop and phones, item management and use, social interaction with players and NPCs, NPC shops, and travel between supported maps. It is divided into four independently testable milestones, in the owner's chosen order:

1. **Controls and layout:** correct the attack-button packet burst, add free camera control and camera easing, add jump, and fix the mobile HUD/layout.
2. **Items:** inventory, consumables, equipment, ground drops and pickup, and the resurrection scroll.
3. **Talking:** nearby, whisper and shout chat; NPC dialogue; and NPC buy/sell shops.
4. **Travel:** NPC teleport travel to supported worlds and a compact minimap/navigation surface.

The full world map remains Piece 6. Party and guild chat, player shops/trading, blinkwings and general scroll travel remain later work. This piece adds the owner's requested features without replacing the established movement, combat, skills, taskbar, or world simulation.

## 2. Owner decisions carried into this design

- Tap-to-walk moves to the tapped point without turning the camera.
- The joystick moves the character and never turns the camera. Forward follows the camera's view direction. The joystick floats under the left thumb where it first touches the left side of the play area.
- A screen drag turns the camera and works while the joystick is held. PC camera rotation uses right-button drag; left click remains selection, attack, and tap-to-walk. Camera drag follows the pointer. Camera changes caused by character turns or relocation ease over about 0.5 seconds.
- Owner refinement after M1 testing: arrows control the camera, WASD controls the character, and both camera drag axes and their arrow equivalents are inverted from the first M1 build. Touch actions must respond to secondary pointer-down while the joystick is held. Disable browser zoom and default double-click actions inside the game while retaining game targeting gestures.
- Space jumps on PC. Phones get a small jump button above attack. Implement Neuz jump state, animation, movement and server report, not a visual-only hop.
- Owner refinement: the joystick can start or redirect horizontal movement during ascent and descent to adjust the landing position. Releasing it stops horizontal travel. Preserve jump height, gravity, animation and collision; send direction changes through the existing PLAYERBEHAVIOR report. Desktop A/D can also turn during jumps, using the ground turn rate and the existing horizontal travel mode.
- Mobile taps, including the second finger while the joystick is held, select NPCs/players/mobs. Camera control activates only after crossing the drag threshold. Touch drag sensitivity is 1.5 times the initial horizontal sensitivity and 0.35 times the initial vertical sensitivity; desktop camera sensitivity stays as configured.
- Owner refinement: remove fullscreen. On mobile only, small top-right Skill, Character and Stats buttons toggle the existing skill window, character window and diagnostics panel.
- Browser context menus are disabled over the game surface; editable login text keeps normal paste behavior. Preserve existing taskbar right-click/long-press behavior where it is a game action.
- Mobile windows occupy about half their PC area, with readable text. Milestone 1 uses a 0.7 linear scale (0.49 area) with larger base text; the HP/MP/FP status window uses 0.63, making it 10% smaller than the first mobile version. The owner checks readability on the actual phone. The mobile taskbar floats at the horizontal center of the viewport, capped at 720px wide with equal gutters wide enough for either notch inset. It sits flush with the game viewport bottom, cancelling the HUD's bottom safe-area inset for the bar alone. Desktop keeps its existing taskbar and status window. The debug overlay folds behind the top-right Stats button. Remove the stray J marker.
- Starting a melee attack switches walking to running once before approaching the target. Merely selecting a target preserves gait; run mode persists when ordinary controls resume.
- Unfocused tabs retain their game session while the browser connection remains alive. The gateway sends login PINGs every 10s and answers cache KEEP_ALIVE itself, independent of browser timers. Closing the WebSocket destroys its TCP connection and heartbeat timers. Blur still releases controls. Browser discard, network loss, server shutdown and explicit logout can end a session; indefinite survival through those events is not guaranteed.
- Mobile inventory follows the owner's horizontal classic reference: a panel fitted to the available height at the right edge, with equipment/character on the left and six item-grid rows, Item strip and penya footer on the right. Picking up an item uses tap-to-approach; a nearby-pickup button collects eligible items in range.
- NPC shops buy and sell. Player shops and player-to-player trading are deferred.
- Chat channels for this piece are nearby, whisper and shout. Party and guild chat follow party/guild support.
- Travel milestone starts with NPC teleporters to other worlds (including dungeon/Mars Mine examples); blinkwings and scroll travel can wait. World map belongs to Piece 6.
- The owner supplies known test inventory and penya through existing GM/database setup; each device/live checklist will name what it needs.
- Automated browser tests remain Chromium only (desktop and landscape phone); iPhone/iPad are hand-checked. Do not require Neuz to run beside the servers or require a Neuz recording.
- Before removing the Piece 4 worktree, preserve or regenerate its ignored converted assets for this worktree; the existing Piece 4 `dist/assets` is about 1.4 GB.
- The owner's Caddy hosting guide follow-up is included with milestone 1: add compression (`zstd` and `gzip`) and a one-year immutable cache policy for fingerprinted assets.

## 3. Current system and research findings

### Controls, camera and presentation

The web client already has WASD/arrows, X gait toggle, a stationary lower-left joystick, pointer tap-to-walk, target selection, a touch attack button, and focus-loss cleanup. The input path is `packages/scene/src/input/keyboard.ts`, `packages/scene/src/input/joystick.ts`, `apps/client/src/world/controls.ts`, `ownMover.ts`, and `WorldScreen.ts`. It intentionally lacks Neuz's Space jump, B board, V sit and autorun. Neuz's movement and jump references are `_Interface/WndWorldControlPlayer.cpp:109-147,157-193,486-559` and `_AIInterface/ActionMoverMsg.cpp:498-519`.

The camera is a fixed chase view with terrain/object obstruction checks. `packages/scene/src/world/player.ts:13-18,92-142` sets the view; `apps/client/src/world/sim/camera.ts:34-70` handles collision. There is no user camera drag or zoom. Native camera references are `_Common/Camera.cpp:116-122,238-250,355-370` and `_Interface/WndWorld.cpp:7337-7421,8690-8797`. Native values/configuration differ, so only the behavior explicitly chosen above is normative. The jump simulator contains landing/fall states but omits starting a jump (`apps/client/src/world/sim/ActionMover.ts:210-225,900-910`).

The gateway enforces an incoming packet rate limit; rapid attack-button input can close the session with code 4004. The client attack loop and touch button are the right place to prevent duplicate attack commands while one is active. Keep the gateway's general safety limit unchanged.

### Items and NPC data

The own-character ADD_OBJ reader already exposes inventory object ID, item ID and count (`packages/protocol/src/world/own.ts:102-145`); item icons and catalogs are converted. Taskbar item shortcut packets and edit state already exist. The inventory panel, mutations, item use, equip operations, drops, pickup and shop actions are absent. Ground OT_ITEM objects are currently skipped. Item shortcuts refer to inventory object IDs, while icon/data lookup uses item IDs; use authoritative server updates rather than optimistic item mutation.

The C++ server already registers item equip/use/drop/buy/sell operations (`Source/WORLDSERVER/DPSrvr.cpp:151-244,763,945,12428,12822,13025,13291`). Neuz composers and server handlers include `Source/Neuz/DPClient.cpp:9367,9795,9811,10226,10248` and corresponding DPSrvr handlers. Character script parsing recognizes dialogue, menu, vendor and teleport declarations, but the web catalog currently drops most of those fields (`packages/formats/src/inc/character.ts:41-58`, `tools/convert/src/data/gameDataStage.ts:439-447`).

### Chat and talking

The web client has transient system-message lines but no chat transcript/composer or chat packet readers. It can pick movers, but currently selects/attacks only. `ShortcutKind.CHAT` is saved as a grey taskbar shortcut; it is not live chat. Neuz/server references include `Source/Neuz/DPClient.cpp:9133-9138,9647-9659,11769,11905`, `_Interface/WndWorld.cpp:5163-5180`, and `Source/WORLDSERVER/DPSrvr.cpp:691-739,11122-11170,12965-13012,13025-13068,13291-13324`. NPC script dialogue can be stateful and script-driven; support the menus and responses needed for the chosen NPC interactions and shops, while leaving quest progression systems out of Piece 5.

### Travel and maps

The client currently ends the session when a REPLACE names a different world (`apps/client/src/world/WorldSession.ts:51,368-375,407-409`). The packet parser already reads a destination world and position, but world asset/session lifecycle does not reload. The server emits REPLACE followed by the new-world snapshot (`Source/_Common/World.cpp:1605-1645`); Neuz rebuilds the world in `Source/Neuz/DPClient.cpp:2297-2306,2416-2447`. The server validates NPC teleport requests (`Source/WORLDSERVER/DPSrvr.cpp:10134-10155`). The full world map is explicitly Piece 6. Piece 5 only promises a compact minimap and supported NPC teleport destinations.

## 4. Architecture and shared rules

- Keep the browser client authoritative only for presentation and input intent. The existing game server remains authoritative for item counts/equipment, money, chat acceptance, NPC scripts, combat state and travel destinations.
- Extend the existing world screen, world session, protocol readers, catalogs and HUD patterns. Do not add a parallel input stack, generic quest engine, or private trading system.
- Bound every decoded list/string by its packet or bundle length; ignore unknown rows/IDs safely; report malformed optional feature data without corrupting the rest of a world snapshot.
- Keep interactions usable by mouse, touch and keyboard. Inputs must not leak through open modals or chat fields into movement/attack.
- Do not change the C++ servers or gateway unless research proves the shipped handlers cannot serve a requirement. A server change is a design review item, not an assumed dependency.
- Keep the app browser-only. No server process or Neuz instance is needed for local UI work. Live checks use the owner's VM and test characters.

## 5. Milestone acceptance

### Milestone 1 — Controls and layout

**Owner acceptance:** Passed on 2026-10-30. Milestone 2 is unblocked.

- Rapid repeated attack-button presses cannot exceed the gateway limit or disconnect the player; normal attack cadence and auto-attack remain intact.
- Right-button drag on PC and a world-surface swipe on touch rotate camera yaw/pitch; camera drag does not trigger target, attack or walk. A tap still selects/attacks or walks. A second pointer can operate the floating joystick while another pointer rotates the camera.
- The floating joystick moves only, and forward follows the camera heading. Camera easing on autonomous facing/relocation changes takes about 0.5 s; direct drag follows the pointer.
- Space and the touch jump button produce the native jump action, including local/remote animation, vertical motion, landing/collision, correction and server message behavior.
- On phones, windows are about half PC size with readable text; overlay is folded; taskbar floats at bottom center inside the safe area; Skill/Character/Stats shortcuts sit at top right; jump button is above attack; stray J is gone; right-click menu behavior is correct.
- Hosting guide Caddy config compresses with zstd/gzip and caches fingerprinted assets for one year as immutable.

### Milestone 2 — Items

**Owner acceptance:** Passed on 2026-10-30. Milestone 3 is unblocked: [items checkpoint](../../piece5-m2-checkpoint.md).

- A player can inspect and reorganize inventory, equip and unequip supported equipment, use starter food/potions from inventory or taskbar, drop items, pick individual nearby drops by tapping and collect nearby drops with one button.
- Resurrection scroll use is server-authoritative and integrated with the revive flow.
- Counts, equipped looks, penya and taskbar references update only from server-authoritative responses. Invalid/unavailable item actions remain recoverable.
- PC and phone layouts work; phones use the horizontal classic reference panel with large item cells. Device checklist states required character inventory/penya.

### Milestone 3 — Talking

Implementation and focused automated verification are complete. Owner VM/device acceptance is pending: [talking checkpoint](../../piece5-m3-checkpoint.md).

- Nearby chat, whisper and shout can be sent and received; the transcript distinguishes channel and sender and exposes clear refusal/error feedback.
- Selecting a non-hostile NPC allows its supported dialogue/menu actions without starting combat.
- NPC vendor list opens; buy and sell send the native packets and display server-confirmed inventory/money/errors.
- Party/guild chat, quest progression, player shops and player-to-player trade are not required here.

### Milestone 4 — Travel and minimap

- Valid NPC teleport choices for supported converted maps can be requested; a cross-world REPLACE loads the destination's assets/world state and joins the new snapshot without ending the session.
- A compact minimap shows player location and supported NPC/navigation markers for the current world. It is not the full world map.
- Invalid/missing map assets or malformed destination data produce a recoverable message and a cleanly ended/rejected transition; no half-loaded world remains.
- Test an ordinary map change and the configured NPC teleport flow on the owner's VM; world map stays Piece 6.

## 6. Four plans and owner checkpoints

The implementation plans are:

1. `docs/superpowers/plans/2026-10-29-piece5-m1-controls-layout.md`
2. `docs/superpowers/plans/2026-10-29-piece5-m2-items.md`
3. `docs/superpowers/plans/2026-10-29-piece5-m3-talking.md`
4. `docs/superpowers/plans/2026-10-29-piece5-m4-travel-minimap.md`

Each milestone starts only after the preceding plan's acceptance check. Builders run quick unit/type checks and at most the one Chromium spec they changed, in line with the owner's speed preference. The owner runs the full corpus and browser suites at milestone checkpoints and live/device checks on their VM/phones, with exact commands and setup listed in the plan. No Neuz capture or side-by-side run is a required check.

## 7. Explicit non-goals

- Full world map (Piece 6), party/guild systems, quests/job change, private player shops, player-to-player trading, Blinkwing/scroll travel, broad item crafting and mail.
- Changing gateway packet limits to mask a client packet burst.
- A wholesale movement/camera rewrite, visual-only jump, or joystick camera turn.
- Requiring native server rebuilds, Neuz recordings, or automated WebKit tests.
