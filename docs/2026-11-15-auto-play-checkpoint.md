# Auto Play: final checkpoint (2026-11-15)

Branch `auto-play` (FlyffWeb worktree `FlyffWeb-worktrees/auto-play`), from `farm-bot-plan` (b751131). Custom feature
chosen by the owner on 2026-11-15 (V15 has no farm bot, auto pots or auto skills). Not merged, not pushed. No server
change. No convert needed (no new pictures: the window uses CSS and the HUD's own frame).

Design: `docs/superpowers/specs/2026-11-15-auto-play-design.md`. Plan: `docs/superpowers/plans/2026-11-15-auto-play.md`.
Milestone checkpoints: `docs/2026-11-15-auto-play-m1-checkpoint.md` … `m4`.

## What the owner gets
- Start menu → **Auto Play** (19th line; phone 10 + 9): Farm, Potions and Skills tabs, saved per character.
- **AUTO** button: desktop above the task bar's right end, phone above the quick slot over Attack. Tap: start/stop. Right-
  click or long press: the window.
- Farm bot, auto pots (also by hand, not in PvP), Action Slot + 4 ready skills, 8 buffs, Wake Lock, battery saver.

## Builder's checks (done on the branch)
- `npx vitest run apps/client`: all pass.
- `npx tsc --noEmit -p apps/client` and `-p apps/client/tsconfig.node.json`: clean.
- `npm run check:public-build`: ok.
- `apps/client/e2e/autoPlay.spec.ts`, chromium only, once (result in the session report).

## Owner's runs
1. **Full client e2e** on the PC (about 25-40 min; port 5174 must be free, or set `E2E_CLIENT_PORT`):
   ```bash
   npm run test:e2e:client
   ```
   Pass: no `failed` line. Expected changes in this branch: `landscape.spec.ts` now counts 19 Start menu lines;
   `autoPlay.spec.ts` is new. If something fails, send the test name and the first error lines.
2. **Live checks** in the VM game (the lists in the m1-m4 checkpoints). The ones that matter most:
   - 30 minutes farming in a desktop background tab: still farming on return.
   - 30 minutes on an iPhone with the battery saver: still farming; locking the phone stops it (expected).
   - A whisper, a player's hit, a duel request, a teleport: each stops it with its reason.
   - Arena / siege / instance: Start refused ("not allowed here"); no auto pots in the Arena.
3. **Looks** (yes/no): the window on desktop and phone; the AUTO button's place on the phone.

## Known limits (by design)
- No pathfinding: a monster behind a wall is given up after 10 s.
- The client is never told who owns a drop: the bot loots what appears near its own kill in the 3 s after it.
- Rules are in the client only: the server cannot tell a bot from a player.
