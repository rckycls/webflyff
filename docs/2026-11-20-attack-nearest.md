# Phone Attack button: nearest monster outside town (2026-11-20, CUSTOM)

The owner asked: "i want the attack button on mobile to attack the nearest target available if no target is selected.
only outside of town".

V15 has nothing like this. Its Tab key cycles only enemy guild players, and only in the siege map.

## What it does

| Situation | Attack button |
|---|---|
| Nothing selected, outside town, a monster within 15 m | Enabled. A press selects the nearest monster the way a tap does (SETTARGET, target bar), then attacks it. |
| Nothing selected, outside town, no monster within 15 m | Greyed. A press does nothing. |
| Something selected | As before. |
| In town | As before: greyed until you tap a monster. |
| Flying, or dead | As before. |

"Nothing selected" means no target, or a target that has left view or died.

## Owner's answers (2026-11-20)

- **Range:** 15 m around the player, measured on the ground. This is Auto Play's starting radius.
- **What it picks:** monsters only. It never picks players, NPCs or pets. It skips giants and bosses (ranks 4, 5, 7)
  and monsters another player is fighting. A party member's fight doesn't count as someone else's.
- **Nothing in range:** nothing happens. The button stays greyed, so it never looks like it ignored you.

## Rules reused (no second picker)

- The pick is Auto Play's `pickTarget` (`apps/client/src/world/autoplay/targets.ts`), called through
  `AutoPlay.nearestMonster` with the farm bot's own hooks.
  - It prefers a monster with nothing in the way (`sightBlocked`). The press does this check; the enabled check skips it
    to save work.
  - "Another player is fighting it" uses Auto Play's record of hits from the last 10 s, or the monster chasing someone
    else. That record is kept even while Auto Play is off.
- The selection is the attack loop's own tap (`AttackLoop.tap`: press, then let go with no shot), followed by the
  button's normal press.
  - The press does what a tap on a monster does: it stops Auto Play ("you took control") and ends the auto-run.
  - With a wand or a bow, the button charges and shoots as before.

## Town: V15's own flag

- Town is V15's `RA_TOWN` region flag (0x400), checked like `IsRegionAttr( RA_TOWN )`: a point inside any `RA_TOWN` rect
  of the world's `.rgn` file.
- Only `WdMadrigal.rgn` (world 1) has `RA_TOWN` rows. It has 11 rects, covering Flaris, Saint Morning and Darkon's town.
  The small `RA_SAFETY` spots around field NPCs are not towns.
- The client's data doesn't carry region flags; the converter keeps only the music and inn bits. So the 11 rects are copied
  into `apps/client/src/world/combat/townRegions.ts`.
  - This keeps the change code-only: no convert needed.
  - `apps/client/test/townRegions.corpus.test.ts` checks the copy against the client's `.rgn` files.

## Files

- `apps/client/src/world/combat/townRegions.ts`: the town rule.
- `apps/client/src/world/combat/attackNearest.ts`: the 15 m pick and when it's allowed.
- `apps/client/src/world/autoplay/controller.ts`: `nearestMonster`.
- `apps/client/src/world/combat/attackLoop.ts`: `tap`.
- `apps/client/src/world/WorldScreen.ts`: the button's press and enabled state (`nearestForButton`).
- Tests:
  - `test/attackNearest.test.ts`
  - `test/autoPlayController.test.ts` (last describe)
  - `test/attackLoop.test.ts` (last describe)
  - `test/townRegions.corpus.test.ts`
  - `e2e/attackNearest.spec.ts` (phone only)

## Checks

Run from the FlyffWeb folder.

```powershell
npm run typecheck
npx vitest run apps/client/test/attackNearest.test.ts apps/client/test/autoPlayController.test.ts apps/client/test/attackLoop.test.ts
npx vitest run --config vitest.corpus.config.ts apps/client/test/townRegions.corpus.test.ts
$env:E2E_CLIENT_PORT = '5187'; npx playwright test -c apps/client/playwright.config.ts --project=phone attackNearest
```

## VPS

- No server change, no convert, no gear sync.
- Make a code-only package with `deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`.
- Install it with `run.bat Update-FlyffWeb -From C:\FlyFF-update\FlyffWeb`.
