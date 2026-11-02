# FlyFF Web — Piece 6: Classic map, audio and browser completion

Date: 2026-11-01. Status: proposed for review; planning only, no implementation authorized by this document. The owner's latest instruction to plan supersedes the earlier instruction to build.

Research: [V15 source and online evidence](2026-11-01-piece6-v15-research.md). Predecessor: [Piece 5 design](2026-10-29-piece5-design.md) and [M4 checkpoint](../../piece5-m4-checkpoint.md).

## Intent and scope

Finish the features already assigned to Piece 6: a classic V15 world map, original music/sound, recovery after a lost browser connection, and an installable browser app. Keep the existing playable loop, V15 servers and the owner's mobile refinements. This is four separately verifiable milestones, not a commitment to launch publicly.

## Approach

Use the current converter, game-data catalogs, DOM HUD, Three.js renderer and protocol/session layers. Convert native resources; reproduce active V15 behavior at its responsible layer. Prefer small native browser facilities for audio and installation rather than a second UI/game engine or a large PWA framework.

Alternatives considered: a modern map/audio redesign would lose the requested classic presentation; copying every Neuz UI and platform behavior would reinstate unwanted fullscreen and fail browser restrictions. The proposed choice is classic game behavior and art, with explicit browser/mobile adaptations. This is the planner's recommendation, not a recorded owner choice.

## Shared constraints

- Local active V15 source/resources define gameplay, asset choice and layout; current official web guides corroborate only what they actually show. Record source paths and line anchors for every implemented behavior.
- Reuse original classic frames, buttons, labels and textures. Preserve the approved chat/taskbar, current Bag/shop relationship, centered mobile windows and half-height chat controls.
- Maintain Safari/iOS 16 baseline. No fullscreen requests, including as an orientation-lock workaround. Use the landscape cover when locking is unavailable.
- Servers remain authoritative. No automatic teleport, action replay, fake party/quest markers, offline world simulation or server patches within this scope.
- The original client/resource tree is read-only. New conversion outputs remain hashed and served through the existing asset index.
- Keep research gaps explicit. A milestone's first task closes its evidence gaps before runtime code. Documentation is not proof of implementation or device acceptance.

## M1 — World map

M and the existing Start/applet path toggle the native-style map overlay. Show all eight supplied map artworks, native continent controls, player arrow and source-defined monster toggle/tooltips. Use V15 polygons to determine the current continent and native per-map coordinate transforms. An unsupported world follows the native unavailable-map behavior; do not place a dungeon character on Madrigal by coordinate coincidence.

Use the ordinary overlay branch after verifying build definitions, rather than the conditional improved list UI. Fit the complete composition to the safe landscape viewport on phones, preserving aspect ratio and readable native labels. Enlarge invisible touch targets where necessary; tapping a monster shows the same details exposed by desktop hover. Map input is isolated from world movement/combat. M/Escape/close behavior follows the completed source trace, with an accessible touch exit. Keep NPC teleporter mode distinct and retain its validation/packet behavior.

Acceptance: all native maps browse correctly; current-map/player projection and monster positions match source-derived fixtures and screenshots; missing optional artwork degrades cleanly; mouse/touch/keyboard interactions send no movement/teleport packets; NPC teleport and cross-world travel still work.

## M2 — Original audio and sound options

Add original resource-mapped title, world/region and NPC music; native cues for the already-supported UI, movement, melee/Vagrant combat, items, death/revive and level/skill events; native server-directed music/sound messages. The research inventory determines exact supported cues and precedence. Reuse existing motion sound events and authoritative gameplay effects; never play a hit twice from motion and packet paths without native evidence for both.

Stream music, decode/cache bounded short effects, use distinct BGM/effect gains and native-styled Sound options. Defaults are effects 100%, BGM 50%, with 10% steps and locally persisted non-secret preferences. Initialize/resume from a user gesture, handle autoplay rejection without blocking login, suppress stale effects after hidden-tab suspension and release world-scoped voices on travel/logout. Original Ogg music gets an MP3 fallback for the current Safari baseline; encoding is offline in the converter, never at runtime.

Acceptance: correct original files and source timing, same-track suppression, native region/event precedence, no doubled sounds, settings persistence, bounded voices/cache, missing-file recovery and audible Android/iPhone/desktop checks. No claim of exact native acoustic attenuation until the active FMOD path is traced and tested.

## M3 — Connection recovery

On an unexpected transport loss, disable gameplay controls, tear down old connections/world effects once and show a compact classic reconnect/cancel state. Reauthenticate using the existing protocol and select the prior channel/character only when they are present and available in fresh server responses. Success requires a fresh own-character snapshot. No item/shop/chat/combat command is queued or replayed.

Proposed bounded policy: at most three attempts, starting no earlier than 15, 30 and 60 seconds after the preceding failed attempt/loss; increase those floors if research finds stricter deployed limits. An in-progress handshake uses existing bounded timeouts. Retry is single-flight and cancellable. Hidden pages do not launch retries; resuming visibility may schedule one if eligible. Preserve current live sockets when still healthy; blur alone is not a disconnect.

Retain the account/hash only in a short-lived in-memory recovery owner (maximum five minutes after loss), clear on cancel/logout/expiry/final failure and never write credentials to storage, URLs, logs or service-worker caches. Do not automatically disconnect another session. Auth rejection, duplicate login, policy/rate-limit closure, missing character/channel or a protocol mismatch ends automatic attempts with the appropriate login/selection UI. A reload or browser discard returns to login; no persistent password feature is added.

This is a browser adaptation to V15 authentication, not native seamless session resume. Acceptance includes both sockets failing, stale callbacks, cancellation during handshake, account conflicts, changed world/death/inventory on return, network flapping and no duplicate characters/listeners/heartbeats.

## M4 — Installation, orientation and completion checks

Provide a web manifest, original-resource-derived app icons, stable app identity, start URL/scope, standalone display and landscape preference. Keep installation optional and the ordinary browser usable. Android's install UI and iPhone's Add to Home Screen flow get concise instructions; no forced install prompt. Do not request fullscreen. A best-effort landscape lock is permitted only without fullscreen; the existing cover remains the fallback.

Use a small production-only versioned shell service worker if needed for the offline-launch/update experience. Do not prefetch the entire converted client or add a second cache for all world/music assets. Never cache login/session traffic. An offline launch shows a clear connection-required state; an update waits until the session ends or the user chooses a safe restart. Avoid automatic skipWaiting/claim/reload during gameplay. Existing HTTPS/WSS and gateway-origin configuration remain the deployment boundary.

Acceptance: install/relaunch on Android and iPhone, browser fallback, portrait and keyboard stability, offline shell without fake gameplay, safe deployment/update rollback, no fullscreen call, and the complete phone core loop with another browser player on the VM.

## Exit and deferred work

Each milestone has unit/converter or protocol proof, focused Chromium desktop/landscape-phone coverage, visual inspection and explicit live/device checks. Full unit/type/build checks run at the final checkpoint; no unnecessary repeated full runs. Existing Piece 5 live checks are prerequisites for declaring the combined playable loop accepted, not prerequisites for writing or building the next isolated feature.

Deferred: quests/job change, party/guild membership and chat, player trade/shops, mail, flight, broad crafting, new-world content, offline play and public deployment. The owner still decides whether Release 1 ships the core loop or waits for later pieces. Planning does not mark that decision approved.
