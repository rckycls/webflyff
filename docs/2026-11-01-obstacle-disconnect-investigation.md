# Mobile joystick obstacle disconnect investigation

Date: 2026-11-01. Initial investigation followed by an owner-authorized client fix. The gateway limit remains unchanged. The owner confirmed the symptom occurs with the mobile joystick. Piece 6 is set aside.

## Reproduced mechanism

`controls.ts` converts joystick direction to an absolute integer angle. `OwnMover.control()` issues TURNMOVE whenever that angle changes; `drive()` sends PLAYERMOVED and resets `nCorr` to 22. When the next simulation step hits an obstacle, `moverRules.ts:onActCorr()` sends PLAYERCORR and clears `nCorr` to zero. A direction change on the following step rearms it.

Thus small direction changes while blocked can send one movement plus one correction per 60 Hz step: approximately 120 packets/second. The gateway default is 100 packets in a sliding second; `relay.ts` closes excess traffic with LIMIT/4004. `errorText.ts` displays that as “Too much data was sent. Disconnected.” The reproduction's largest packet is 68 bytes versus the 16,384-byte maximum: packet frequency is the demonstrated trigger.

Native comparison: `_AIInterface/ActionMoverMsg.cpp:253–274` suppresses identical TURNMOVE angles; `_Interface/WndWorldControlPlayer.cpp:422` onward reports successful input transitions. `_Common/MoverActEvent.cpp:2014–2037` sends a collision correction only when `m_nCorr` is armed, then clears it. The web collision behavior follows that rule, but its added absolute joystick steering can continually rearm it. The original keyboard does not generate changing absolute joystick angles.

## Evidence

Diagnostic test: `.superpowers/investigation/obstacleTraffic.test.ts` (ignored local investigation artifact). Command: `npx vitest run .superpowers/investigation/obstacleTraffic.test.ts --reporter=verbose` → 6 passed, exit 0.

| Four-second simulation | Packets per successive second | Limiter rejection |
| --- | --- | --- |
| Steady keyboard into wall | 1, 0, 0, 0 | None |
| Steady joystick into wall | 1, 0, 0, 0 | None |
| Single ground tap into wall | 2, 0, 0, 0 | None |
| Joystick alternating 89°/91°, open ground | 60, 60, 60, 60 | None |
| Same steering into wall | 96, 120, 120, 120 | At simulated 1.067 seconds |

The final test replays the actual encoded movement/correction packets at simulation cadence through the unmodified WebSocket/TCP gateway relay and a fake FlyFF server. The real relay closes with 4004 after its sliding-window limit is exceeded. Wall-clock scheduling changes the precise close time, so that integration test asserts the code rather than an exact elapsed duration.

This is a local, controlled reproduction of the confirmed mobile input path, not a packet capture from the owner's physical phone. No deployed gateway configuration was found in this worktree, so 100/second is the verified default, not a claim about a separately deployed override.

## Implemented correction and regression evidence

`OwnMover` now coalesces ground steering reports to one per six control steps (10 per simulation second). Local steering remains at simulation speed. Actual movement transitions, joystick starts and stops remain immediate; queued angles flush at the next slot and are discarded on jump, stop or a new tap destination. Only a sent movement report rearms the native collision correction counter. The gateway and native angle/collision rules are unchanged.

The regression tests also demonstrated that a steady non-cardinal direction can trigger the same failure: `wrapAngle(91)` is approximately 90.9998, while native TURNMOVE tests the truncated integer angle. Repeated 91-degree intent therefore keeps returning a changed movement. The original steady 90-degree control was exactly representable and did not expose that path. Both steady non-cardinal steering and noisy steering are covered by the fix.

Permanent tests in `apps/client/test/ownMover.test.ts` cover a six-second wall contact with a sliding-window packet bound, immediate local facing, turning away, stop/restart, final-angle flushing, jump cleanup and a new tap replacing pending steering. These assertions failed before the patch (peak 120 reports/second), then passed.

The updated local diagnostic measured wall traffic at 16, 20, 20, 20 packets across four successive seconds, including collision corrections, versus 96, 120, 120, 120 before. The real relay stayed connected for the complete 240-frame replay and closed normally with 1000 only when the test explicitly left.

Verification: focused movement/control/attack tests passed; `npm test -- --maxWorkers=2 --reporter=dot` passed 140 files, 2,912 tests with 8 skipped (includes the six ignored-local-path diagnostic tests discovered by Vitest); `npm run typecheck` passed. Physical phone/VM confirmation has not been performed in this fix session.

Browser command: `npx playwright test -c .superpowers/sdd/2026-10-29-piece5-m3-talking/playwright.config.ts controls.spec.ts world.spec.ts --grep 'camera gestures|Flaris wall|walking forward|stops the walking player' --workers=1` → 11 passed, 1 failed. All desktop/phone wall, forward-movement and focus-loss cases passed. The broader phone controls case times out tapping a Skill shortcut hidden by the existing centered window. Temporarily using the window close buttons for diagnosis exposed a separate second-finger jump assertion (expected 2 packets, got 1). Repeating that case with only this runtime patch removed produced the identical jump failure, confirming it predates this fix. The runtime fix was restored byte for byte and the temporary browser-test edits were removed. No unrelated HUD/multitouch fix was included.
