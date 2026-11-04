# Flyff v15 World Indicators Implementation Plan

**Goal:** Show v15 NPC quest markers and a brief monster attack emote in the FlyffWeb world.

**Architecture:** Derive quest status from existing local player quest/catalog data. Add a focused world indicator layer that owns billboard sprites and transient emotes, updated from existing mover synchronization and render positions.

**Tech Stack:** TypeScript, existing Three.js sprites/canvas textures, FlyffWeb quest and world state.

**Spec:** `docs/superpowers/specs/2026-11-04-world-indicators-design.md`

## Global Constraints

- No server/protocol changes.
- No navigator-map markers or persistent idle-monster emotes.
- Actual DDS imagery only; no generated or drawn fallback.
- Keep existing name tags and quest HUD behavior intact.

## Review Focus

- Quest state must be per-player and absent for non-NPC movers.
- Turn-in-ready and available markers must preserve v15 priority when multiple quests point to one NPC.
- The attack emote comes from the server's `!0` chat event, expires after five seconds, and is not printed as chat.
- Removed or respawned movers must not leave stale sprites or timers.
- Missing quest catalog/player data must hide quest markers without breaking world rendering.

## Files

- Create `apps/client/src/world/render/WorldIndicatorLayer.ts` to own quest/emote sprites and lifecycle.
- Create `apps/client/src/world/quests/questMarkers.ts` to map player quest state to NPC marker states.
- Modify `apps/client/src/world/WorldScreen.ts` to create, synchronize, update, and dispose the indicator layer.
- Modify `apps/client/src/world/WorldScreen.ts` to intercept monster `!0` chat events before the normal non-player chat filter.

## Tasks

### Task 1: Derive NPC quest marker states

- Add a pure helper that evaluates source and destination quest links for the current player against loaded quest props and supported start/end conditions.
- Return the v15 states `available`, `future`, `inProgress`, `ready`, or `none`, with v15 priority ordering.
- Use available own state fields and current quest helpers; hide unsupported cases rather than guessing.
- Inspect existing quest owner construction and lifecycle hooks to identify when the helper should refresh.

### Task 2: Render and lifecycle indicators

- Add head-anchored billboards for the four quest states and the attack emote.
- Reuse `WorldScreen`'s `placeOf`/head positions and the name-tag layer's pixel-sized, depth-independent sprite approach.
- Synchronize NPC markers when the world changes and when own quest/stat data changes.
- Intercept the v15 `!0` chat payload for an aggressive monster; create/refresh its five-second attack emote and suppress the payload from chat and speech bubbles.
- Remove indicators on mover removal and dispose all GPU resources on teardown.

### Task 3: Verify original artwork integration

- Inspect the changed code and `git diff` for state ownership, priority, update timing, and cleanup.
- Run focused conversion and frame-selection tests, type checking, pixel comparison against the original DDS sheets, and the client build.
