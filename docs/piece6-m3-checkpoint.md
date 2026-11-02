# Piece 6 milestone 3 checkpoint: one-tap reconnect

Date: 2026-11-02. Branch `piece6`.
- Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.4.
- Plan: [M3 plan](superpowers/plans/2026-11-02-piece6-m3-reconnect.md).
- Research: [M3 research](superpowers/specs/2026-11-02-piece6-m3-reconnect-research.md).

Built straight after M2, at the owner's request. The owner reported M3 passed on 2026-11-03: every hand check, on the PC
and the phone, tested together with M2. The full browser suite's timing failures, which date from Piece 5, moved to M5
(spec §3.6 step 3).

## What changed

- **Login flow** (`lobby/LoginFlow.ts`):
  - `relogin(account, passwordHash)` logs in again from the kept hash, never hashing it twice.
  - The hand-over gives the channel's parent `serverId`.
  - The character list now has the certifier's 20 s timeout. It ends the session, back to the login form.
- **Reconnect** (`lobby/reconnect.ts`): one attempt per tap. It runs CERTIFY, the same channel of the same server, the
  same character by player id, then the lobby's own Enter.
  - The kept login (account, hash, server, channel, player) lives there, in memory, for 5 minutes.
  - Where refusals go:
    - a wrong password or a blocked account: the login form;
    - a channel that is gone: the server list;
    - a character that is gone: the character list;
    - anything else: the box, ready for another tap.
  - 103 says "This account is still in the game. Wait a minute, then tap Reconnect." and kicks nothing.
- **World screen:** a session ending after the world was first shown is a drop. So is any session ending of the world
  a reconnect enters, so a new world that fails before it shows brings the box back.
  - The world freezes: the rules, sounds, keys and windows stop, and the last picture stays.
  - The box (`hud/dropBox.ts`) shows over it, or over the loading text when the next world is not on screen yet. The
    loading screen's Leave is hidden then.
  - The hash is dropped from the entry and the session's JOIN bytes.
  - Every other ending is as before.
- **Lobby** (`lobby/LobbyApp.ts`): the reconnect takes the flow's events first while its box shows. It closes the frozen
  world, then enters the new one or shows the lobby step.

## Tests added

- `apps/client/test/`:
  - `loginFlow.test.ts`: 6 cases;
  - `reconnect.test.ts`: 11;
  - `dropBox.test.ts`: 5;
  - `lobbyReconnect.test.ts`: 7;
  - `worldSession.test.ts`: 1 (the JOIN bytes forgotten);
  - `sim/stepper.test.ts`: 3 (`catchUp`, the sound hold of a stalled frame).
- `apps/client/e2e/recovery.spec.ts`: 7 cases, on desktop and phone.
  - **A cache drop:** the box, nothing sent while it shows, the same CERTIFY again, and the fresh world's HP.
  - **A login drop.**
  - **103, then a later tap.**
  - **Back to login,** with the account kept.
  - **A drop before the world was shown:** the login form, as before.
  - **A drop while the next world is drawn for the first time:** the box, with no Leave.
  - **A reconnect's world that drops before it shows:** the box again, and a later tap gets in.
- `world.spec.ts`'s drop test now goes through the box.

## Builder's checks

- **Unit suite:** `npm test` passed: 159 files, 3,093 tests, 8 skipped (after the final review's fixes).
- **Typecheck:** clean.
- **Browser specs:** `recovery.spec.ts` gave 14 passed. `travel`, `navigation` and `audio` gave 22 passed, 1 skipped
  and 1 flaky (below). Before the fixes, `world.spec.ts` gave 63 passed, 1 skipped and 2 failed; its drop test passes
  after them.
- **The flaky one:** `audio.spec.ts`'s Flarine track check failed once on the phone under the full 4-worker load: the
  region's track came after its 15 s wait. It passed 3 times out of 3 alone.
- **The 2 failures predate Piece 6:**
  - the `world-flaris-movers.png` baseline was last updated in Piece 4 (4d00565), before Piece 5 (a84fe29) added the
    Navigator and the chat window;
  - "the task bar draws the JOIN's TASKBAR" expects applet 398's hotkey J, which Piece 5's rule blanks for applets
    without a window.

  Their baseline and expectation are the owner's to update.

## Final review

An opus reviewer read the whole of M3 (e6f24bc..be73daf): 2 Critical, 4 Important, 8 Minor. Every Critical and Important
finding was fixed in one pass (669c737), each with a test that failed first:

- **Keys after the box:** the box never let go of the page's keys, so after a drop every key stayed dead until a reload.
- **A drop while the next world is drawn:** the box went into that world's HUD, which is not on the page yet. The player
  was left on "Entering the world…".
- **The hash after 5 minutes:** it stayed reachable through the dropped world. The lobby now takes it, so the reconnect
  alone holds it.
- **The character list's timeout:** it left the ordinary lobby on a dead server list. It now goes back to the login form.
  A login-server ERROR while the list is awaited stops it.
- **A reconnect's world that fails before it shows:** it went to the login form and lost the login. It now brings the box
  back.
- **Device steps 3 and 4:** they expected results they could not give. Step 3 now cuts the phone's network, as a gateway
  restart frees the account at once. Step 4 says how the first device gets back to the box.

Two Minor findings were fixed with them, as their effect is worse than minor:

- **The loading screen's Leave:** it sat over the box and did nothing.
- **The sound hold:** a throwing step during a catch-up left it on, which silenced every effect of the page.

The rest are deferred (the brief lists them).

## Owner checks

- [ ] `npm run test:e2e:client`, the full run: no `failed` other than the two Piece 5 cases above. If `audio.spec.ts`'s Flarine check fails on the phone, run `npm run test:e2e:client -- audio.spec.ts` alone: it should pass.
- [ ] `npm run test:corpus` with `FLYFF_CLIENT` set: no `failed`.
- [ ] `docs/device-testing.md`, "Piece 6, milestone 3", on the VM, the PC and an Android phone.
