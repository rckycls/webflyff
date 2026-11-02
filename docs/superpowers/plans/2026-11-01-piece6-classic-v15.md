# Piece 6 — Classic V15 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task after the design is approved. Checkbox state records verified work; do not infer implementation approval from this planning document.

**Goal:** Complete the classic world map, original audio, bounded connection recovery and installable browser experience assigned to Piece 6.

**Architecture:** Extend the existing converter/catalog contracts and the current HUD/session owners. V15 source/resources define the map and audio behavior; reconnect and installation are explicitly documented browser adaptations. Four milestones deliver separately reviewable features.

**Tech Stack:** Existing TypeScript/npm workspaces, Vite, Three.js, DOM/CSS, Vitest and Chromium Playwright; native Web Audio/HTML media and web manifest/service worker where needed. Audio conversion requires an offline FFmpeg executable; add it as a documented converter prerequisite, not a runtime package.

**Spec:** [Piece 6 design](../specs/2026-11-01-piece6-design.md).

**Research:** [Source survey, online references and research gates](../specs/2026-11-01-piece6-v15-research.md).

**Status:** Proposed, planning only. No runtime/converter/source implementation has been changed for Piece 6.

## Global constraints

- Original client root: `C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15`; keep it read-only.
- Implement in the existing `piece5-items-chat` worktree unless the owner later requests isolation. Preserve all prior uncommitted work; no blanket checkout/reset or implicit commits.
- Maintain Safari/iOS 16 and the owner's approved mobile HUD. Never call requestFullscreen, including to obtain an orientation lock.
- No server changes, offline gameplay, replayed gameplay commands, invented quest/party state or public deployment.
- Every task begins with its source/resource evidence; online pages supplement local V15 behavior. Update the research note with exact active-branch symbols, source line anchors, fixture inputs and any discrepancy.
- Original artwork/labels, current frame/button helpers, existing conversion index and existing protocol/session owners are reused.
- Tests run against pretend servers unless explicitly identified as live. Device and VM acceptance stays unchecked until performed.

## Review focus

1. Map/continent/world IDs and authored monster screen coordinates are distinct; prevent incorrect markers and accidental movement/teleport packets (Tasks 1–2).
2. Active V15 build flags and language assets can choose different UI/audio code; verify before using inactive source as specification (Tasks 1, 3).
3. Missing/late assets, autoplay rejection and hidden-tab time jumps must not corrupt the world or replay a burst of sounds (Tasks 2–4).
4. Both sockets may fail and old callbacks may arrive during cancellation/retry; allow one recovery attempt and only fresh auth/snapshot state (Tasks 5–6).
5. An installed app can run an old shell against new assets or fail orientation locking; prevent forced reload, mixed asset generations and fullscreen regressions (Tasks 7–8).

## Order and prerequisites

M1 → M2 → M3 → M4 is the proposed delivery order. Each milestone starts with a short evidence gate and ends with a checkpoint. M3's auth research can run independently of map/audio work, but do not mix implementation edits in the same session without a clear checkpoint.

Before any runtime work, review this design/plan with the owner. Piece 5 M3/M4 VM and phone checks remain open; track them honestly and complete them before final combined acceptance. Do not repeat the already-passed Piece 5 automation merely to begin research.

## M1 — Classic world map

### Task 1: Close map research and convert native metadata/art

**Read:** WorldMap.cpp/h, Neuz VersionCommon.h and project definitions, Continent.cpp/h/ContinentDef.h, WdMadrigal.wld.cnt, texMapButton.inc and all seven texMapMonster scripts, tooltip implementation reached from WorldMap.cpp.

**Files:** create `packages/formats/src/inc/worldMap.ts`, `packages/formats/src/world/continent.ts`, `packages/formats/src/web/worldMap.ts`; modify exports, `tools/convert/src/ui/uiStage.ts`, `tools/convert/src/data/gameDataStage.ts` and its existing catalog-loader integration as required. Add `packages/formats/test/worldMap.test.ts`, `tools/convert/test/worldMapStage.test.ts`; extend real-file corpus coverage in the existing formats/converter test layout.

**Interfaces:** export `readContinents(text, defines)` with native continent ID, town/real-data flags and ordered x/z polygon points. Export `readMapMonsters(text, defines)` with texture/frame data, original reference-space positions, mover-ID lists and drop-item ID. Define `WebWorldMapData` with map indices 0–7, native projection bounds, texture keys, button-sheet frames, continent-to-map mapping and per-map monster metadata; output `data/worldMap.json`. Follow existing ScriptReader/define resolution rather than a new script engine. Exact record field types are finalized in this file before HUD integration.

- [ ] Verify active ordinary-map branch, multilingual asset precedence, rendering/closing behavior, all eight projection bounds, arrow rotation, monster tooltip fields and unavailable-map text; append findings to research.
- [ ] Write failing fixtures for Flaris polygon/map-5 selection, map-index/continent-ID distinction, all projection corners/centers, town/non-real blocks, variable monster counts, malformed/truncated rows and 1280×960 screen-coordinate preservation. Run `npx vitest run packages/formats/test/worldMap.test.ts tools/convert/test/worldMapStage.test.ts` and confirm failures describe missing behavior.
- [ ] Implement bounded readers and catalogs; convert all eight WORLD textures, TexMapButton's language-resolved atlas, monster sheets and map arrows with native color keys. Reuse `texturePack.ts` where it fits; preserve the extra monster metadata separately.
- [ ] Run those tests, real-resource corpus checks for the changed formats, and relevant typecheck. Record counts, skipped resources and any missing artwork; a malformed optional row cannot silently become coordinate zero.

### Task 2: Map overlay, input and travel integration

**Files:** create `apps/client/src/world/hud/worldMapWindow.ts`, `apps/client/test/worldMapWindow.test.ts`, `apps/client/e2e/worldMap.spec.ts`; modify `world/gameData.ts`, `WorldScreen.ts`, `hud/taskBar.ts`, `hud/applets.ts`, `style.css`. Reuse existing `teleporterWindow.ts`, `frame.ts`, `escape.ts`, `art.ts` and item/mover detail patterns; do not replace Bag, chat or Navigator.

**Interfaces:** `WorldMapWindow` consumes UiArt/WebWorldMapData and current `{worldId, position, heading}`; exposes its HUD element plus `toggle()`, `update(state)` and `dispose()`. Pure `projectWorldMap(mapIndex, worldId, position, data)` returns a visible reference-space point or null. The ordinary map has no gameplay-send callback. Extract shared projection/art from TeleporterWindow only where required; NPC selection still owns its send/valid callbacks.

- [ ] Write failing tests for eight-map selection, current/player markers, wrong-world/continent suppression, unavailable art, native monster toggle/details and input isolation. Map tap/drag must emit zero walk, attack and teleporter requests.
- [ ] Implement the verified native composition, M/Start/applet opening, source-defined closing behavior, native labels/frames and mouse tooltip/touch detail parity. Fit the complete composition to the safe mobile area; preserve original relative geometry and enlarge invisible hit areas as needed.
- [ ] Dispose/update safely on travel; ensure NPC teleport map and ordinary map cannot intercept each other's actions. Add desktop/phone browser cases for M and touch open, browse, monster detail, close and world transition.
- [ ] Run focused unit tests, `npm run typecheck`, and `npm run test:e2e:client -- worldMap.spec.ts navigation.spec.ts travel.spec.ts`. Use an isolated config if existing suite infrastructure requires one, recording its exact path. Inspect desktop/phone screenshots against native art and geometry.
- [ ] Write `docs/piece6-m1-checkpoint.md`; append VM and device checks for all maps, native art, no movement leak, unavailable-world feedback and retained NPC travel to `docs/device-testing.md`.

## M2 — Original sound and music

### Task 3: Trace audio behavior and extend conversion/protocol data

**Read:** active Music2.cpp/Music.h and FMOD sound implementation, HwOption/WndOption sound controls, WorldFile/RGN parsing, WndWorld region/music processing, DPClient PLAYMUSIC/PLAYSOUND plus server writers, ModelObject motion sounds; sound.inc/default.bgm/defineSound and current sound-bearing item/mover/skill/terrain data.

**Files:** create `packages/formats/src/inc/audio.ts`, `packages/formats/src/world/rgn.ts`, `packages/formats/src/web/audio.ts`, `tools/convert/src/audio/audioStage.ts` and focused tests. Modify converter `run.ts`, `cli.ts`, world/data conversion, manifest/catalog exports and protocol snapshot readers/tests. Reuse existing WAV/binary helpers or installed tools if suitable; no custom codec implementation.

**Interfaces:** `WebAudioData` maps native IDs to hashed source variants and metadata. `WorldManifest` gains optional source-derived BGM/region presentation metadata, with absence backward compatible. `MotionEvents.sound` remains the existing `[frame, soundId][]` contract. Add native `playMusic`/`playSound` decoded message variants using exact source field widths; resolve IDs through the catalog, never server-provided fetch URLs. Add `audio` converter-stage selection and document its effect on `--only`.

- [ ] Complete the research gate: an event matrix naming caller, cue ID, position/attenuation, interruption/loop/resume behavior and duplicate-trigger rules for every currently playable action. Include UI, movement, melee/Vagrant skills, items, NPC dialogue, death/revive and level-up; explicitly list unsupported cues.
- [ ] Write and run failing tests for ID/path mappings, empty/unknown IDs, duplicate definitions and traversal rejection; representative complete RGN rows/overlaps; motion sound preservation; native music/sound packet roundtrips and truncated bodies.
- [ ] Implement conversion/readers and the exact protocol variants. Copy/normalize compatible short effects and preserve original Ogg with an MP3 fallback via a checked offline FFmpeg invocation. Verify MIME types, deterministic outputs and useful missing-tool/file diagnostics; leave input files unchanged.
- [ ] Run focused tests and a real-client audio/region conversion; report output count, missing files, total bytes and representative codec/playback compatibility. Confirm incremental conversion preserves existing index entries. Record source semantics before Task 4.

### Task 4: Audio runtime, native settings and lifecycle

**Files:** create `apps/client/src/audio/gameAudio.ts`, `apps/client/src/world/hud/soundWindow.ts`, unit tests and `apps/client/e2e/audio.spec.ts`; modify `main.ts`, `WorldScreen.ts`, source-identified animation/effect/UI hooks, applets/taskbar, styles and catalog loading. Keep one app-owned audio controller; world teardown clears world voices without destroying persistent volume choices.

**Interfaces:** `GameAudio` provides `unlock()`, `playEffect(id, position?)`, `playMusic(id, loopCount)`, `setVolumes(effects, music)`, `suspend()`, `resume()` and `dispose()`. It consumes the converted catalog and current listener state. Music priority/region policy is driven by the completed event matrix. SoundWindow uses original resource labels/control art and calls the volume API; persist only versioned non-secret preferences.

- [ ] Write failing behavior tests for gesture unlock/rejection, same-playing-track suppression, source loop count/region policy, event interruption/resumption, sound timing across loop/correction boundaries, mute/10% steps/persistence, missing/late assets and stale async completion after travel/disposal.
- [ ] Implement streamed music and Web Audio short effects with separate gains; defaults 1.0 effects/0.5 music. Set explicit tested voice/cache limits after inventory measurements; reject oversized optional assets and evict unused buffers. Map sound positions through the established native-to-web transform.
- [ ] Route motion/cue and authoritative packet events once, respecting the matrix. Hidden-tab suspension drops expired one-shots rather than replaying them on resume. No frame-by-frame repeated music requests, no audio failure ending a session.
- [ ] Run unit/type checks and `npm run test:e2e:client -- audio.spec.ts`. Browser automation proves activation/state/assets; actual listening on desktop, Android and Safari/iOS 16 proves audibility, correct tracks, fallback and interruption behavior.
- [ ] Write `docs/piece6-m2-checkpoint.md`, update conversion/hosting prerequisites and the device checklist. Keep device listening checks pending if not performed.

## M3 — Connection recovery

### Task 5: Authenticate again safely with a bounded recovery owner

**Read:** local certifier/login/cache disconnect, auth-key and duplicate-login handlers; gateway close codes/route and flood policies; web `LoginFlow.ts`, `WorldSession.ts`, `LobbyApp.ts`, `authorization.ts`, `net/PacketChannel.ts` and existing live-test rules.

**Files:** create `apps/client/src/lobby/recovery.ts`, `apps/client/test/recovery.test.ts`; modify LoginFlow/WorldSession event contracts only as needed and extend their existing tests. No gateway limiter change.

**Interfaces:** `RecoveryTarget` contains prior channel/server identity and character player ID; no inventory/world snapshot is trusted. An app-owned `RecoveryController` takes injected clock and fresh-login operations, exposes `start(reason)`, `cancel()`, `dispose()` and progress events. A narrowly internal prehashed-login path reuses CERTIFY encoding without hashing the hash again; it is never exposed in URLs/test hooks. Preserve single ownership of every PacketChannel.

- [ ] Finish server/native flow trace and document recoverable versus terminal reasons, cleanup delays and any stricter limits. The proposed 15/30/60-second retry delays are floors, not permission to bypass deployed throttling.
- [ ] Write failing fake-clock/channel tests: three-attempt cap, five-minute memory expiry, fresh auth per attempt, no second live socket/heartbeat, both-close single-flight, visibility hints, cancellation during open/CERTIFY/JOIN, stale packets, terminal auth/policy/protocol errors, missing channel/character and duplicate login without automatic takeover.
- [ ] Implement the recovery owner and minimal fresh-login reuse. Clear credentials on logout/cancel/expiry/final failure; prevent retry after intentional Leave, server rejection or normal lobby exit. Do not retain a plaintext password or persist its hash.
- [ ] Run `npx vitest run apps/client/test/recovery.test.ts apps/client/test/loginFlow.test.ts apps/client/test/worldSession.test.ts` (verify actual existing test filename before invocation), plus typecheck. Inspect diff for secret persistence/logging and unbounded listeners/timers.

### Task 6: Reconnect presentation and fresh-world return

**Files:** modify `main.ts`, `LobbyApp.ts`, `WorldScreen.ts`, world HUD/input cancellation and `style.css`; create `apps/client/e2e/recovery.spec.ts`; extend testkit fake-server scenarios only where necessary.

**Interfaces:** root app owns RecoveryController across disposed WorldScreens; WorldScreen reports a structured end reason as well as display text. A reconnect view has progress, Cancel and a safe return to Login. A fresh WorldEntry must pass normal JOIN/own-snapshot/world-asset validation before input is enabled.

- [ ] Add failing desktop/phone scenarios for a cache drop, login drop, both, cancel, duplicate session, missing character and failure during world load. A successful return must reflect server changes to position/world, death, inventory and money rather than stale local state.
- [ ] Implement classic-styled recovery UI, stop controls/audio/actions once, close shops/dialogue and discard all outgoing action intent. Restore only safe presentation preferences/chat history where the user stayed in the same page/account; never replay an unsent message automatically.
- [ ] Run focused unit/type and `npm run test:e2e:client -- recovery.spec.ts travel.spec.ts`. Assert no replayed buy/sell/use/chat/combat packets and no repeated JOIN within one successful attempt.
- [ ] Write `docs/piece6-m3-checkpoint.md`; add a rate-limit-respecting VM disconnect/reconnect checklist with exact prerequisites and stop conditions. A test harness can virtualize time; live checks must respect real delays.

## M4 — Installable app and combined acceptance

### Task 7: Production install shell and safe updates

**Files:** add `apps/client/manifest.webmanifest`, a small `apps/client/src/pwa.ts` and production shell worker/build integration if required; modify `index.html`, `vite.config.ts`, `main.ts`, `landscape.ts`, hosting docs and relevant tests. Derive app icons from existing native art; use converter/build copying because Vite currently disables publicDir. Keep `/client/` build assets distinct from `/assets/` converted game data.

**Interfaces:** `installPwa()` owns registration/install/update UI and exposes `setSessionActive(boolean)`/`dispose()`. Stable manifest `id`, scope and start_url follow the hosted client route. A new worker must wait while a session is active; only a safe lobby/restart transition may activate/reload. No auth/network state enters Cache Storage.

- [ ] Review current platform documentation and test target-platform install flows; write failing checks for manifest/icon routes, HTTPS production registration, no registration in dev, offline launch, delayed update and no fullscreen calls from login/enter/rotation.
- [ ] Implement optional installation, standalone display and landscape preference. Remove startup fullscreen requests, update stale comments, keep orientation locking best effort without requesting fullscreen, and preserve portrait cover/input cleanup and mobile keyboard anchoring.
- [ ] Implement only a bounded versioned shell cache and connection-required offline state. Leave large game/audio assets on existing hashed HTTP caching. Do not cache gateway/config/session traffic, errors or partial media responses as valid shell resources. Do not switch the active asset index beneath a loaded world; retain its immutable mapping until the next session.
- [ ] Add a production-build Playwright config/spec (`pwa.spec.ts`) to test actual emitted files, offline launch, update waiting, asset-generation consistency, missing/evicted cache and old-worker rollback. Run it against preview/static hosting, not just Vite dev.
- [ ] Update `docs/hosting.md` for manifest/worker MIME and freshness rules, immutable hashed assets, HTTPS/WSS/origins and deployment retention/rollback. Record manual Android/iPhone install, launch and rotation results.

### Task 8: Final research audit and core-loop acceptance

**Files:** update `docs/device-testing.md`, README, the Piece 6 research note and `docs/piece6-checkpoint.md`; no unrelated cleanup.

- [ ] Review the implementation against the source-to-feature matrix. Every visible difference from V15 must have a recorded owner request or browser limitation. Check native labels/art, mobile controls/centering, no fullscreen and no accidental modern-client behavior.
- [ ] Run `npm test -- --maxWorkers=2 --reporter=dot`, `npm run typecheck`, `npm run build:client`, relevant changed-format corpus tests and the Piece 6 browser specs with Piece 5 navigation/travel/talking regressions. Record exact commands, exit codes and skips; do not count missing-resource skips as corpus coverage.
- [ ] Inspect desktop/phone map and Sound options screenshots. On the VM, test two browser players logging in, starting-area combat/leveling, items, chat, NPC shop, travel, map, sound, disconnect recovery and logout. Complete outstanding Piece 5 M3/M4 checks as part of this run.
- [ ] On physical PC, Android and iPhone/iPad, cover audio unlock/fallback, install/non-install, keyboard open/send-close anchoring, portrait/landscape, background return, network loss, cancel and update. Keep explicit device/OS/browser/version evidence; Chromium emulation is not an iPhone pass.
- [ ] Write the checkpoint with source decisions, completed tasks, automated evidence, outstanding live/device results and next work. Do not publish or declare Release 1 accepted until the owner resolves core-loop launch versus waiting for later systems.

## Stop conditions

Planning ends with these proposed documents; no implementation is part of this request. During later implementation, checkpoint at milestone boundaries. If research shows a required server change, incompatible source/resource data or a necessary deviation from the approved behavior, document the concrete conflict before expanding scope. Difficulty alone is not a reason to silently drop a requirement.
