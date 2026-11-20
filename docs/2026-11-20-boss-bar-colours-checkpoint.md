# Boss HP bar colours: checkpoint (2026-11-20)

Branch `boss-bar-colours` (worktree `Bakbak/FlyffWeb-worktrees/boss-bar-colours`, from main 57255b1). Not merged.
Design: `docs/superpowers/specs/2026-11-20-boss-bar-colours-design.md`. Plan: `docs/superpowers/plans/2026-11-20-boss-bar-colours.md`.

## What changed

- `apps/client/src/world/hud/targetBar.ts`: `barShade(left, max)` (Neuz's fill red on the first bar, lighter each bar,
  white on the last), `behindShade(left, max)` (the next bar's shade, dark grey behind the last), a third gauge
  `target-next` between the empty gauge and the fill. One-bar monsters: unchanged.
- `apps/client/src/world/hud/gauge.ts`: `Gauge.setColor(color)`.
- Tests: `apps/client/test/hpLayer.test.ts` (4 new), `apps/client/e2e/layeredBossHp.spec.ts` (colours at x5, x2, x1 and
  a plain monster; pictures x5, x4, x3, x2, x1, late).

## Merge and deploy

- No convert, no gear sync, no server change. A code-only FlyffWeb update.
- Bosses only show 2+ bars with the server's `LayeredBossHp.inc`; the new counts are on the outer branch `boss-hp-respawn`.

## Quick tests (owner)

```
npm run typecheck
npx vitest run apps/client/test/hpLayer.test.ts
$env:E2E_CLIENT_PORT='5198'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone layeredBossHp
```

Pass: typecheck clean; vitest 8 passed; e2e 2 passed.
