# Piece 6 milestone 3 checkpoint: one-tap reconnect

Date: 2026-11-02. Branch `piece6`.
- Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.4.
- Plan: [M3 plan](superpowers/plans/2026-11-02-piece6-m3-reconnect.md).
- Research: [M3 research](superpowers/specs/2026-11-02-piece6-m3-reconnect-research.md).

Built straight after M2, at the owner's request. The owner tests M2 and M3 together. Their checks below are still open.

## What changed

- **Login flow** (`lobby/LoginFlow.ts`):
  - `relogin(account, passwordHash)` logs in again from the kept hash, never hashing it twice.
  - The hand-over gives the channel's parent `serverId`.
  - The character list now has the certifier's 20 s timeout.
- **Reconnect** (`lobby/reconnect.ts`): one attempt per tap. It runs CERTIFY, the same channel of the same server, the
  same character by player id, then the lobby's own Enter.
  - The kept login (account, hash, server, channel, player) lives there, in memory, for 5 minutes.
  - Where refusals go:
    - a wrong password or a blocked account: the login form;
    - a channel that is gone: the server list;
    - a character that is gone: the character list;
    - anything else: the box, ready for another tap.
  - 103 says "This account is still in the game. Wait a minute, then tap Reconnect." and kicks nothing.
- **World screen:** a session ending after the world was first shown is a drop.
  - The world freezes: the rules, sounds, keys and windows stop, and the last picture stays.
  - The box (`hud/dropBox.ts`) shows over it.
  - The hash is dropped from the entry and the session's JOIN bytes.
  - Every other ending is as before.
- **Lobby** (`lobby/LobbyApp.ts`): the reconnect takes the flow's events first while its box shows. It closes the frozen
  world, then enters the new one or shows the lobby step.

## Tests added

- `apps/client/test/`:
  - `loginFlow.test.ts`: 5 cases;
  - `reconnect.test.ts`: 11;
  - `dropBox.test.ts`: 4;
  - `lobbyReconnect.test.ts`: 5;
  - `worldSession.test.ts`: 1 (the JOIN bytes forgotten).
- `apps/client/e2e/recovery.spec.ts`: 5 cases, on desktop and phone.
  - **A cache drop:** the box, nothing sent while it shows, the same CERTIFY again, and the fresh world's HP.
  - **A login drop.**
  - **103, then a later tap.**
  - **Back to login,** with the account kept.
  - **A drop before the world was shown:** the login form, as before.
- `world.spec.ts`'s drop test now goes through the box.

## Builder's checks

- **Unit suite:** `npm test` passed: 159 files, 3,086 tests, 8 skipped.
- **Typecheck:** clean.
- **Browser specs:** `npm run test:e2e:client -- recovery.spec.ts` gave 10 passed. `world.spec.ts` gave 63 passed, 1
  skipped and 2 failed.
- **The 2 failures predate Piece 6:**
  - the `world-flaris-movers.png` baseline was last updated in Piece 4 (4d00565), before Piece 5 (a84fe29) added the
    Navigator and the chat window;
  - "the task bar draws the JOIN's TASKBAR" expects applet 398's hotkey J, which Piece 5's rule blanks for applets
    without a window.

  Their baseline and expectation are the owner's to update.

## Owner checks

- [ ] `npm run test:e2e:client`, the full run: no `failed` other than the two Piece 5 cases above.
- [ ] `npm run test:corpus` with `FLYFF_CLIENT` set: no `failed`.
- [ ] `docs/device-testing.md`, "Piece 6, milestone 3", on the VM, the PC and an Android phone.
