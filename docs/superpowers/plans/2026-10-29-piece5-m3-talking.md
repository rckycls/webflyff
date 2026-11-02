# Piece 5 Milestone 3: Talking Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task. Steps use checkbox syntax for tracking.

**Goal:** Add nearby, whisper and shout chat, usable NPC dialogue/menu interactions, and NPC buy/sell shops.

**Architecture:** Extend world message readers and WorldSession senders, create a persistent but session-local chat surface with input focus isolation, and use parsed NPC metadata plus server scripts as the authority for menu/dialogue outcomes. Vendor UI consumes existing inventory/money state and server responses.

**Tech Stack:** TypeScript, protocol readers/writers, converted character/text catalogs, Vitest, Playwright Chromium.

**Spec:** docs/superpowers/specs/2026-10-29-piece5-design.md, sections 3, 4 and 5 (Milestone 3).

## Global Constraints

- Supported channels: nearby, whisper and shout. Party/guild chat is deferred.
- Server remains authoritative for acceptance, NPC scripts, shop stock, item totals and penya.
- NPC quest progression, player shops and player-to-player trade are deferred.
- Chat focus must suppress game movement, attack, camera hotkeys and taskbar hotkeys.
- Keep only bounded, valid text; decode server text consistently with the existing Windows-1252 text helper.
- Full suites and live/device checks are owner-run at the checkpoint.

## Review Focus

- Malformed or oversized server chat cannot break world bundle parsing; test packet and string bounds.
- Chat-field key input cannot leak to world movement or attack; test focus and blur transitions.
- Whisper target/refusal and shout range failures are visible; test valid, invalid and server-refused responses.
- NPC menu choices are scoped to the selected live NPC and current distance; test removed/out-of-range NPC.
- Buy/sell rejection and reordered updates cannot desync money or inventory; test stale stock, low funds and full inventory.

---

### Task 1: Nearby, whisper and shout chat protocol and UI

**Files:**
- Create: packages/protocol/src/world/chat.ts and apps/client/src/world/hud/chatWindow.ts
- Modify: readers.ts, WorldSession.ts, WorldScreen.ts, applets.ts, style.css and text catalogs as required
- Test: packages/protocol/test/worldChat.test.ts and apps/client/test/chatWindow.test.ts

**Interfaces:**
- Consumes: nearby CHAT snapshots, whisper and shout server messages, existing UTF-8/windows-1252 helpers, mover names and session send path.
- Produces: one chat model with nearby, whisper and shout channels; senders for supported native packet formats.

- [x] Trace client and server packet layouts for nearby, whisper, shout, refusal and command routing before writing encoders.
- [x] Add failing tests for each packet direction, malformed text, channel rendering, send validation and input focus isolation.
- [x] Implement protocol and session flow plus phone-friendly composer/transcript.
- [x] Run focused tests; expected: PASS.

### Task 2: NPC interaction menu and dialogue

**Files:**
- Modify: packages/formats/src/web/gameData.ts, tools/convert/src/data/gameDataStage.ts, apps/client/src/world/WorldScreen.ts and NPC/hud modules
- Create: apps/client/src/world/hud/npcDialog.ts
- Test: game-data converter/catalog tests, npcDialog tests and one focused client e2e spec

**Interfaces:**
- Consumes: selected NPC, characterKey, menu/dialogue metadata, server-defined text/menu replies.
- Produces: context actions for NPCs, bounded menu/dialogue exchange, and deterministic launch points for shops and travel.

- [x] Trace active character script declarations, menu packet, response bundle and normal starting-area NPC scripts.
- [x] Add failing tests for peaceful NPC selection, range/disappearance, menu open/close, returned text and unsupported script action.
- [x] Preserve only the NPC fields needed for interactions in the converted data; implement supported menu/dialogue actions and report unknown script action safely.
- [x] Run focused converter/protocol/client tests and the touched e2e spec once; expected: PASS.

### Task 3: NPC vendor shop with buy and sell

**Files:**
- Create: packages/protocol/src/world/shop.ts and apps/client/src/world/hud/shopWindow.ts
- Modify: WorldSession.ts, readers.ts, WorldScreen.ts, NPC dialog, inventory state, item data and style.css
- Test: packages/protocol/test/worldShop.test.ts and apps/client/test/shopWindow.test.ts

**Interfaces:**
- Consumes: vendor object ID, converted vendor stock, existing inventory and penya state.
- Produces: native open/buy/sell requests, server-confirmed shop state, results and inventory/money refresh.

- [x] Trace exact OPENSHOPWND, shop inventory, BUYITEM, SELLITEM and result layouts in Neuz and DPSrvr.
- [x] Add failing tests for stock display, price/count, quantity bounds, empty slots, low money, full inventory and server refusal.
- [x] Implement vendor interaction and shop UI on PC and phone; route returned mutations through the authoritative item state.
- [x] Run focused tests; expected: PASS.

### Task 4: Milestone 3 checkpoint

- [ ] Owner runs npm test and npm run typecheck.
- [ ] Owner runs npm run test:e2e:client -- talking once in Chromium desktop and landscape phone; pass means no failed tests.
- [ ] Owner provisions two test accounts and vendor funds/stock, then checks nearby chat, whisper, shout, NPC dialogue and buy/sell on the VM and phones.
