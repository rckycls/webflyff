# Piece 5 Milestone 2: Items Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task. Steps use checkbox syntax for tracking.

**Goal:** Let players inspect and manage inventory, use consumables, equip gear, drop and pick up items, and use the resurrection scroll.

**Architecture:** Extend the existing own ADD_OBJ inventory state and taskbar item shortcuts. Add bounded readers for item world objects and authoritative update messages, then connect inventory/equipment/drop/use/pickup UI actions to the packets already handled by the V15 server.

**Tech Stack:** TypeScript, existing game-data converter, protocol readers/writers, Vitest, Playwright Chromium.

**Spec:** docs/superpowers/specs/2026-10-29-piece5-design.md, sections 3, 4 and 5 (Milestone 2).

**Prerequisite:** Milestone 1 accepted by the owner on 2026-10-30. Implemented; owner checkpoint pending.

## Global Constraints

- Shortcut object IDs reference inventory entries; item IDs resolve catalog data and icons.
- Server replies are authoritative for inventory, equipment, stack counts and money; never optimistically commit a mutation.
- Phone inventory is full-screen with large cells; owner provides test items and penya.
- Keep malformed/unknown item data bounded and recoverable; preserve valid own character state.
- Full test suites and VM/device checks are owner-run at the checkpoint.

## Review Focus

- Malformed item serialization cannot desynchronize the rest of ADD_OBJ; test truncated and oversized inventory input.
- Item object IDs and item catalog IDs cannot be confused; test taskbar display/use with separate IDs.
- Rejected use/equip/buy/drop leaves local inventory intact; test delayed, failed and reordered authoritative responses.
- Stacks reaching zero clear shortcuts and inventory slots correctly; test partial and final consumption.
- Ground item records with unknown IDs or invalid positions are ignored safely; test unknown item and out-of-world positions.

---

### Task 1: Trace and decode item updates and ground drops

**Files:**
- Create: packages/protocol/src/world/items.ts
- Modify: packages/protocol/src/world/readers.ts, types.ts, WorldState.ts, OwnState.ts and tools/convert/src/data/gameDataStage.ts if required by the source trace
- Test: packages/protocol/test/worldItems.test.ts, addObj.test.ts and apps/client/test/worldState.test.ts

**Interfaces:**
- Consumes: current WebItemProp, own inventory objectId/itemId/count and table-of-contents-bounded readers.
- Produces: validated item-object add/remove/update messages and immutable inventory/equipment change events.

- [x] Trace ObjSerializeOpt.cpp, Item.cpp and DPSrvr.cpp use/equip/drop/pickup handlers; record exact fields and server response messages in comments/tests.
- [x] Add failing byte-reader tests for OT_ITEM add/remove, inventory mutation and malformed boundaries.
- [x] Implement readers and state application from server-confirmed messages only.
- [x] Run focused protocol and state tests; expected: PASS.

### Task 2: Inventory panel and item taskbar editing

**Files:**
- Create: apps/client/src/world/hud/inventoryWindow.ts
- Modify: apps/client/src/world/WorldScreen.ts, hud/taskBar.ts, hud/taskBarEdits.ts, gameData loading and style.css
- Test: apps/client/test/inventoryWindow.test.ts and hud.test.ts

**Interfaces:**
- Consumes: OwnState inventory, item catalog/icons, existing taskbar edit senders.
- Produces: PC inventory window and full-screen large-cell phone inventory with inspect, stack selection, move/split where supported, equip/unequip and taskbar placement.

- [x] Test empty slots, stack counts, icon fallback, unknown item, touch-size layout and stale state while a request is pending.
- [x] Implement the inventory view and supported slot interactions from the C++ serialization rules.
- [x] Wire taskbar item shortcuts to the actual inventory object and refresh from authoritative updates.
- [x] Run focused tests; expected: PASS.

### Task 3: Use items and resurrection scroll

**Files:**
- Create: apps/client/src/world/items/itemUse.ts
- Modify: WorldSession.ts, OwnState.ts, hud/taskBar.ts, hud/reviveWindow.ts and relevant protocol message modules
- Test: apps/client/test/itemUse.test.ts and hud tests

**Interfaces:**
- Consumes: item definitions, inventory entries, taskbar shortcut and revive-window action.
- Produces: native self-use/target-use item requests, server text/error feedback, count reconciliation and enabled revive-here action when the required scroll exists.

- [x] Test starter food/potion use, missing or empty stacks, cooldown/refusal, taskbar use, and resurrection scroll availability.
- [x] Implement native DOUSEITEM semantics for supported self-use consumables and route taskbar use through the same controller.
- [x] Enable Revive Here only when the inventory contains the matching resurrection scroll; apply the server's revival response without local resurrection.
- [x] Run focused tests; expected: PASS.

### Task 4: Equipment, ground drop and pickup

**Files:**
- Create: apps/client/src/world/items/itemActions.ts
- Modify: WorldSession.ts, WorldState.ts, WorldScreen.ts, render/MoverViews.ts, item rendering/picking and inventoryWindow.ts
- Test: apps/client/test/itemActions.test.ts, worldState.test.ts and one focused client e2e spec

**Interfaces:**
- Consumes: validated item mutations, world OT_ITEM records, existing tap-to-walk, camera picking and inventory UI.
- Produces: equip/unequip and drop actions, tap-to-approach pickup, plus a nearby-pickup button that requests all eligible drops in range.

- [x] Test equipment slot change and remote look update, drop rejection, pickup range, tap approach, nearby pickup and double-click prevention.
- [x] Implement the C++-matching item target/range and pickup semantics; preserve world movement/camera gestures.
- [x] Apply successful changes from server updates and recover cleanly from refused or stale requests.
- [x] Run focused tests and the single touched e2e spec once; expected: PASS.

### Task 5: Milestone 2 checkpoint

- [ ] Owner runs npm test and npm run typecheck.
- [ ] Owner runs npm run test:e2e:client -- items once in Chromium desktop and landscape phone; pass means no failed tests.
- [ ] Owner provisions the checklist character with the listed food, potion, equipment, resurrection scroll, ground drop and enough penya; owner runs the VM live test and phone/PC device checklist.
