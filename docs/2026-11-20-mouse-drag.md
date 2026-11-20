# Mouse drag: V15's mouse in FlyffWeb (2026-11-20)

The owner asked to check how the V15 client's mouse works, then picked every difference to fix ("All of them").
Research notes (Neuz lines, FlyffWeb lines, the full table) are in the session notes folder `mouse-drag-research/`.
This branch (`mouse-drag`) has the camera, click and flight parts (A-E). The item drag, ground-drop boxes, shop drag
and window resize / positions (F-H) were built on `mouse-drag-ui` and merged in here (see `2026-11-20-mouse-drag-ui.md`).

V15 settings used: Interface 1 (the only one V15's Option window offers: right drag turns the camera), MouseSpeed 1
(0.2 deg/px; `__SFX_OPT` hides the radios), ZOOMLIMIT on, CameraLock on (`HwOption.cpp:178-261`, `Resource/neuz.ini`).

## What changed (desktop unless said)

| | V15 (Neuz) | Before | Now |
|---|---|---|---|
| A right drag | turns from the first pixel, 0.2 deg/px (`WndWorld.cpp:7555-7590`) | 8 px wait, 0.29 deg/px | 0 px, 0.2 deg/px (`cameraControls.ts`) |
| A tilt | `m_fRoty` -80 .. 80-zoom*4, camera = m_fRoty + zoom*4, max 80 (`Camera.cpp:250, 336`) | +-72 fixed | V15 (`backCamera.ts` `turn`, `pitch`) |
| A zoom | wheel 0.5/notch, -1.5 .. 7 (15 no limit); PgUp/PgDn 0.6/frame 0..7; distance 4+zoom*2 | none, 16 m fixed | V15 (`wheel`, `page`); phone: two-finger pinch; laptop pinch (Ctrl+wheel) |
| A arrows | 4 deg/frame round, 2 up/down | 1.15 both | V15 |
| A right double click | ground: camera behind the character (:7336-7339) | nothing | V15 |
| A camera easing | ground offset closes 1/4 a step (`World.cpp:933`) | instant | V15 (so zoom, lock and double click swing, not jump) |
| B camera lock | W/A/S/D held, right not held: camera behind (`WndWorld.cpp:8011-8015`) | never | V15 (`WorldScreen.step`, option `cameraLock`, on) |
| C left click ground | walks at the press, any hold (`ControlPlayer.cpp:300-338`) | only on release <=300 ms, <=8 px | mouse walks at the press; phone keeps the tap rule |
| D both buttons | pressed within 500 ms: jump (`ControlPlayer.cpp:499-506`); left within 200 ms of right: no press; left with right held: ground only | nothing | V15 (`controls.ts` chords) |
| E flight right drag | cursor hidden, recentred, steering never stops (:7465-7495) | cursor visible, stops at the screen edge | pointer lock while steering |
| E right double click (air) | steer without a button (`m_nMouseMode`, :7317-7332) | none | V15 (Esc or landing ends it) |
| E middle drag (air) | turns the camera; let go: back behind (Unlock) | nothing | V15; right let-go in the air also puts it back behind |
| E left held (air) | attacks the target anywhere (`ControlPlayer.cpp:798-833`) | only a press on a mover / Insert | V15 |
| E flight pitch | Unlock sets m_fRoty 0 at take-off: 24 deg at zoom 6 | 12 deg | V15 (one m_fRoty for ground and air, as Neuz) |
| cursor | CUR_CAMERA while the middle button is held (:2567-2571) | never | V15 |

Kept as it was (owner's earlier choice, Piece 5 M1): a vertical mouse drag DOWN lowers the camera. V15 is the other
way (a drag down lifts it). One constant flips it: `DRAG_UP_SIGN` in `cameraControls.ts` (-1 now, 1 = V15). Arrows
already match V15. The phone's touch drag is unchanged.

Not done: the Option window's Video tab (greyed) has V15's "Camera lock" and zoom-limit checkboxes; the options exist
(`gameOptions.ts` `cameraLock`, `zoomLimit`, both on as in V15) but have no switch yet.

## Tests

Quick checks run here:

- `npx tsc --noEmit -p apps/client` (+ `apps/client/tsconfig.node.json`, `apps/viewer`): clean.
- `npx vitest run apps/client/test/backCamera.test.ts apps/client/test/cameraControls.test.ts apps/client/test/controls.test.ts apps/client/test/gameOptions.test.ts apps/client/test/ownMover.test.ts apps/client/test/flightControl.test.ts packages/scene/test/player.test.ts`: all pass.
- `E2E_CLIENT_PORT=5193 npx playwright test -c apps/client/playwright.config.ts --project=chromium apps/client/e2e/mouseDrag.spec.ts apps/client/e2e/controls.spec.ts apps/client/e2e/controlsCursors.spec.ts`: 8 passed, 1 skipped (phone-only).

Not testable headless: pointer lock (flight steering); try it by hand: fly, hold right and move the mouse past the
screen edge; right double click in the air, move without a button, Esc to stop.

After merging `mouse-drag-ui` (f163829): `npm run typecheck` clean; 13 related vitest files, 184 tests, pass;
`E2E_CLIENT_PORT=5193 npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone apps/client/e2e/mouseDrag.spec.ts apps/client/e2e/mouseDragUi.spec.ts apps/client/e2e/items.spec.ts apps/client/e2e/controls.spec.ts apps/client/e2e/controlsCursors.spec.ts`: 19 passed, 11 skipped (other device), 0 failed.

## Full suites (for the owner, in this worktree)

    cd C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\mouse-drag
    npm run typecheck
    npm test
    $env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone

Pass: typecheck exits 0; `npm test` has no failures beyond any main already has; Playwright has no failures in
`mouseDrag`, `mouseDragUi`, `controls`, `controlsCursors`, `items`, `flight`, `mobileUx`, `friends`, `windows`, `housing`.

## By hand (computer)

- Wheel in and out; PageUp / PageDown.
- Right drag: slow and fast; right double click on the ground.
- Walk with W/A/D: the camera swings behind.
- Click the ground and hold: walks at once.
- Press left and right together: jump.
- Fly:
  - right drag past the screen edge (the cursor hides);
  - right double click, then steer without a button (Esc ends it);
  - middle drag: the camera turns; let go: it goes back behind.

## VPS (after the merge; no convert, no server change)

1. Merge into FlyffWeb main (the owner's word): `git merge --no-ff mouse-drag`.
2. Make the package, in the server repo: `powershell -ExecutionPolicy Bypass -File deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`.
   This is code only; the VPS keeps its game files.
3. On the VPS, follow the package's `PACKAGE.txt`:
   - unpack it to `C:\FlyFF-update`;
   - `robocopy C:\FlyFF-update\deploy C:\FlyFF\deploy /E`;
   - `C:\FlyFF\deploy\run.bat Update-FlyffWeb -From C:\FlyFF-update\FlyffWeb`;
   - delete `C:\FlyFF-update`.
