# Piece 6 milestone 0 checkpoint: a target behind a wall

Date: 2026-11-02. Branch `piece6`. Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.1.
Plan: [M0 plan](superpowers/plans/2026-11-02-piece6-m0-blocked-attack.md). The owner reported M0 passed on 2026-11-02, after re-running the client from this folder; the first run had used the piece5 folder, without the fix.

## What changed

When a collision ends the own character's walk to a target, a new walk to that same target waits until 6 rules steps
after the last PLAYERSETDESTOBJ. That is at most 10 a second. The rule lives in `setOwnDestObj`
(`apps/client/src/world/combat/attackLoop.ts`), which the attack and the skills share. The collision records the
blocked target (`onActCorr`), and the rules step counts the wait down (`stepMover`), both in
`apps/client/src/world/sim/moverRules.ts`. A walk to another target goes at once. While it waits after a stop, nothing
is sent and nothing walks.

After a slide along the obstacle, the walk goes on at full speed without telling the server. When the wait ends, the
server is told where the character got to (PLAYERBEHAVIOR) and gets the walk again. An arrival during such a walk
tells the server before the swing or the skill. That is the owner's choice after the final review.

The gateway's limit is unchanged.

## The cause

Auto-attack runs the attack on every 60 Hz step. Each step, the wall cancelled the walk with a PLAYERCORR, and the
attack asked for the walk again with a PLAYERSETDESTOBJ. That made 120 packets a second, and the gateway closes a
connection above 100. Neuz does the same, but it has no gateway in front of it.

## Tests added

- `attackLoop.test.ts`:
  - `auto-attack into a wall keeps walking up at most 10 times a second, within the traffic budget`. It failed at
    120 a second before the fix.
  - `a walk to another object goes out at once; the blocked one waits and does not walk locally`.
- `skillUse.test.ts`:
  - `a skill from the bar on a target behind a wall bumps once and asks no more`.
  - `the action slot with a staff keeps walking up at most 10 times a second, within the traffic budget`. It failed at
    120 a second against the pre-fix `setOwnDestObj`, so a repeating action slot had the same flood.
- `skillUse.test.ts`: `a skill pressed while the walk-up waits goes out once the wait ends, and the auto-attack carries on` (final review: a press during the wait was lost and stalled the auto-attack).
- `attackLoop.test.ts`, added for sliding after the final review:
  - `a walk that was still sliding goes on locally while it waits, then tells the server where it got to`.
  - `auto-attack sliding along a wall reaches its target at about full speed, within the traffic budget`: more than
    1,200 steps before, at most 400 now; Neuz takes about 344.
  - `a walk that arrives untold tells the server where the player is before the swing`.
- `itemActions.test.ts`: `a drop that is never picked up is asked for once, then given up after 6 s`.
- `test/helpers/traffic.ts`: `TRAFFIC_BUDGET` (50 a second, half the gateway's limit) and `busiestSecond`.

Already covered from the 2026-11-01 fix, in `ownMover.test.ts`: the joystick at a wall, steady and wobbling, and a
tap-walk into a wall. Walking to an NPC sends no approach.

## Quick checks (run by the builder)

- `npm test -- --maxWorkers=2 --reporter=dot`: 139 files passed; 2,917 tests passed, 8 skipped; exit 0 (after the final-review fixes).
- `npm run typecheck`: all projects passed; exit 0.

## Owner checks

- [x] `npm run test:e2e:client -- fight.spec.ts skills.spec.ts` on the PC: no `failed` (reported passed by the owner).
- [x] `docs/device-testing.md`, "Piece 6, milestone 0", on the phone and the PC: every step passes (reported passed by the owner).

The converted game files were copied into this worktree's `dist/assets` from the piece5 worktree, for `dev:client`.
