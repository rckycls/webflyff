# Mobile UI regression audit

Started: 2026-11-01. Completed: 2026-11-02 (Asia/Manila). Scope: the current Piece 5 client; Piece 6 remains set aside. This is an automated browser/source/visual audit, not a claim that every possible device glitch has been eliminated.

## Reproduced and corrected

| Issue | Evidence | Correction |
| --- | --- | --- |
| Transparent chat steals the left-thumb gesture and cancels a second-finger Jump | CDP pointer trace showed the first contact hitting `chat-transcript`, followed by pointercancel; no movement/jump packet. Simply disabling the transcript left its parent intercepting the touch. | On mobile, passive chat and its container let touches reach the canvas; composer and toolbar remain interactive. Opening Chat or focusing its input enables transcript scrolling. Send/outside press closes that interaction state and releases focus. Disposal removes the outside listener. |
| Phone controls disappear and the Start menu shrinks after keyboard/compatibility mouse input | A coarse-pointer/no-fine-pointer unit fixture switched to desktop mode on keydown. The phone browser menu check measured 22px rows after mouse-style input. | The shared touch-mode watcher keeps phone controls on devices without a fine pointer. Hybrid computers with real mice still switch modes. |
| Login/Enter still requests fullscreen | A failing unit spy recorded requestFullscreen before orientation.lock, contrary to the owner's earlier instruction. | Remove fullscreen requests; try only orientation locking and retain the existing portrait cover when locking fails. |
| Centered Character/Skill windows lose their center after viewport/taskbar changes | The frame test kept x=322/y=96 after a resize that required x=275/y=72. | Remember centered placement during refit; deliberate dragging still switches back to a user-chosen position. |
| Bag/Shop cover the taskbar | Browser bounds at 750×342 placed the Bag bottom at 334 while the bar began at approximately 286.4. Screenshots confirmed the overlap. | Reserve the taskbar height when sizing both windows and calculating the Bag width. Keep the current wide Bag design and its proportions; native cells scale with the available room. |
| Navigator partly covers Jump on short screens with a home-indicator inset | The safe-area regression measured Jump top at 110.27 while Navigator ended at 136. | On short landscape phones use 64px Attack and 44px Jump targets, with bottom anchors aligned above the composer and adjusted for the HUD inset. Bounds tests cover 568×320 and 750×342 as well as the default phone. |

## Coverage

- Entire available landscape-phone Chromium suite: lobby/error recovery, movement/collision/camera, attack/death/revival/stats, skills and taskbar assignment, inventory/equipment/consumables/pickup, chat routing/input, NPC dialogue/vendor transactions, Navigator/teleporter, cross-world travel and rejected/missing assets.
- New `mobileAudit.spec.ts`: real multi-pointer joystick + Jump through the passive-chat area; active-chat scrolling ownership; no automatic keyboard focus; typing keeps touch controls; Send blurs/releases chat; composer remains attached to the taskbar with a 160px-high viewport; no fullscreen request; Character/Skill centering and close-button reachability at 568×320, 750×342 and 844×390; Bag bounds/proportions at compact sizes.
- Nonzero simulated notch/home-indicator insets in touch regression; portrait cover, input release on rotation/focus loss and return to landscape.
- Desktop regression checks accompany shared frame/input changes. Screenshot review covers classic mobile Character, Skill, Bag/details, Navigator, teleporter and Shop presentation.

Some earlier end-to-end assertions described superseded UI: a stationary always-visible joystick operated with a mouse, a four-entry Start menu, a tall scrolling Character window, the removed mobile applet row/J label, and ground taps at coordinates now occupied by the composer. Those checks now use real touch gestures, all six menu entries, the current wide Character layout, zero mobile applet slots and a canvas point above the composer. Closing centered windows uses their native close button because the toolbar behind them is deliberately hidden.

## Verification record

Exploratory runs intentionally exposed failures and were not treated as acceptance; some pages also reloaded while fixes were under active Vite development.

- `npm test -- --maxWorkers=2 --reporter=dot`: 140 files passed, 2,914 tests passed, 8 skipped, exit 0. Includes six local diagnostic tests under the ignored `.superpowers/investigation` path. Existing nonfatal Three.js fake-model warnings remain unrelated.
- `npm run typecheck`: all workspaces passed. `npm run build:client`: passed after the final CSS change; the existing large-chunk warning remains advisory.
- Full phone sweep: `npx playwright test -c .superpowers/mobile-audit/playwright.config.ts --project=phone --workers=2`: 68 passed, 6 intentional platform/picture skips, 3 failed. This was not represented as a wholly passing single run.
- The inventory failure was a 120-second scenario timeout under concurrent software rendering. Serial rerun with `items.spec.ts mobileAudit.spec.ts --project=phone --workers=1` passed all 4 cases, including inventory/equipment/use/drop/pickup/revival and all three new audit scenarios with final short-screen action geometry.
- The two remaining ground-tap cases used occupied/near-UI coordinates: one actually hit the NPC menu's disabled Guild Duel ranking entry. Temporary tracing distinguished this from a world-input failure. Test taps now use an unobstructed point away from the NPC menu and composer. `world.spec.ts --grep 'ground leaves|pressing a turn key' --project=phone --workers=1` passed both. Production picking/tap rules were not altered; temporary tracing was removed.
- All 71 applicable phone cases have passing evidence across the sweep and focused reruns; six desktop/picture-only cases remain intentionally skipped in the phone project. There is no claim of a fresh, single-run 77/77 pass after focused corrections.
- Desktop shared-code regression: `controls.spec.ts talking.spec.ts --project=chromium --workers=1` using `.superpowers/sdd/2026-10-29-piece5-m3-talking/playwright.config.ts`: 2 passed. Covers camera/jump controls, chat typing/channels, NPC interaction and vendor transactions.
- `git diff --check` passed for touched files (normal Windows line-ending notices only). No debug trace variables/logging remain in source or test helpers.

The ignored `.superpowers` configs select installed Chrome on isolated local ports, without publishing or using real game servers. Permanent regression cases live in `apps/client/e2e/mobileAudit.spec.ts` and the updated existing tests.

## Remaining physical-device acceptance

Chromium phone emulation cannot prove real iOS keyboard/visualViewport behavior, Safari touch-scroll inertia, OS permission/install behavior, physical safe-area values or device GPU performance. No physical Android/iPhone/iPad or live VM session was controlled during this audit.

- [ ] iPhone Safari: input-only keyboard opening, no keyboard from Chat tabs, no focus zoom, stable composer above taskbar with the real software keyboard, Send dismissal and scroll activation.
- [ ] Android Chrome: joystick from the lower-left chat area, second-finger Jump/Attack, camera drag and selecting an NPC while moving.
- [ ] Both phones: Character/Skill centering after rotation, Bag and Shop above taskbar, item actions/drop quantity and shop quantity keyboard, close-button reachability with actual notch/home indicator.
- [ ] Device/VM: login, chat, vendor buy/sell, travel, background return and sustained joystick contact against an obstacle without disconnect.

The client build is local. Nothing was published, no game-server changes were made, and original V15 resources remained read-only.
