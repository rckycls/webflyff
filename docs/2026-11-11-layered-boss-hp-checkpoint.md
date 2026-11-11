# Layered boss HP: checkpoint (2026-11-11)

An owner-approved exception to "no custom features in FlyffWeb": the server, Neuz and FlyffWeb support it together.
Server side, design and VM test steps: server repo branch `layered-boss-hp`, `docs/layered-boss-hp/README.md`.
Branch `layered-boss-hp` here, from main `17edff8`. Not merged, not pushed.

## What was built

- Protocol: `packages/protocol/src/world/hpLayer.ts`. New snapshot `HP_LAYER` (0x9A00), object the monster: int bars
  left (current one included), int bars at spawn, int max HP of one bar, int current HP. In `WORLD_READERS` and the
  `WorldMessage` union. Testkit writer: `writeHpLayer` (`packages/testkit/src/hpLayer.ts`).
- State: `WorldState` keeps `Mover.hpBars = { left, max }` for a monster of more than one bar (none for others or for
  players), takes the server's one-bar max HP, and sets the HP as SETPOINTPARAM does.
- Target bar (`apps/client/src/world/hud/targetBar.ts`): `xN` right of the gauge (yellow, bold), `x1` on the last
  bar, nothing for a normal monster. Phone: 20 px under the bar's 0.7 scale = 14 px on screen.
- Healing rule (the design's recommendation, used as is): healing only fills the current bar; all bars come back
  only on a leash reset or a new spawn. The server enforces it; the browser only shows what it is sent.

## Convert

None. No client data file changed (the bar counts live in the server-only `Resource/LayeredBossHp.inc`). After
merging, the main folder needs no `npm run convert` and no gear sync for this feature.

## Tests (run here, 2026-11-11)

- `npm run typecheck`: clean.
- `npx vitest run`: 4556 passed, 5 failed = main's known ones (3 `looks.test.ts`, 2 `inventoryWindow.test.ts`).
  New: `packages/protocol/test/hpLayer.test.ts` (2), `apps/client/test/hpLayer.test.ts` (4).
- e2e `apps/client/e2e/layeredBossHp.spec.ts`, Chromium desktop + landscape phone, port 5198: 2/2 passed.
  It plays: a normal monster (no `xN`), `x5`, a hit under the bar, an exact bar (`x4`, full), a multi-bar overflow
  (300 at 120: `x2`, 60/120), a leash reset (`x5`), the last bar (`x1`) and the kill, and a late joiner's view
  (`x2`, 75/120). On the phone it checks `xN` is at least 14 px and on screen.

Commands (from the FlyffWeb folder; never stop the owner's dev server on 5174):

```
npm run typecheck
npx vitest run
$env:E2E_CLIENT_PORT='5198'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone layeredBossHp
```

Pass: typecheck clean; vitest only the 5 known failures; e2e 2 passed.

## Live check

Follow the server repo's `docs/layered-boss-hp/README.md` steps 1-12 with FlyffWeb (two tabs for the late joiner).
