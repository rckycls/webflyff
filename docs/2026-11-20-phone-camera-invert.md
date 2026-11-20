# Phone camera direction + "Invert Camera" (2026-11-20)

The owner: "People are saying that my camera panning is inverted. Is it different from most of the games? If yes, do
what other games do and create an option to invert it so people will have preference." Then: "in mobile."

## Is ours different?

Yes, on **up/down** only.

| Finger drag | Phone games (where it is written down) | FlyffWeb before | FlyffWeb now |
|---|---|---|---|
| right | the view turns right (the world slides left) | same | same |
| up | the view tilts up (the camera goes lower) | the view tilted **down** (the camera went higher) | the view tilts up |

What was found (web search, 2026-11-20):

- PUBG Mobile: drag up aims up (recoil guides: "drag your finger down" to pull the aim down). Call of Duty Mobile: the
  same (inferred: an aim drag). Roblox: up looks up, right turns right (read from its camera code); it also has a
  "Camera Inverted" setting that flips up/down for touch too.
- Genshin Impact: has "Invert X-axis" and "Invert Y-axis", marked controller only. Honkai: Star Rail: no invert option.
  Tower of Fantasy: "Vertical Flip" and "Horizontal Flip" for the PC mouse.
- Ragnarok M, MU Origin, Lineage 2 Revolution, Black Desert Mobile: no written source says which way their drag turns
  (Ragnarok M and MU Origin 2 also have a top-down 2.5D camera that only turns left and right). A check on a phone
  would settle them.
- No game was found documented the way FlyffWeb's up/down was.

V15 on PC (Neuz) is the same way as the phone games: a mouse drag down lifts the camera (`m_fRoty += dy`,
`WndWorld.cpp:7586`). The "drag down lowers the camera" direction was this client's own, from Piece 5 M1.

## What changed

- `apps/client/src/world/cameraControls.ts`: the finger drag's up/down is flipped (`TOUCH_DOWN_SIGN = -1`). Left/right
  as before. Speeds as before (x1.5 round, x0.35 up/down, 8 px before it starts).
- `apps/client/src/world/options/gameOptions.ts`: two new options, `invertCameraUp` and `invertCameraTurn`, off. Kept
  per browser with the other game options (`localStorage` `flyffweb.gameOptions`); older saved options read them as off.
- `apps/client/src/world/hud/optionWindow.ts`: on the **phone** Option window (Start → Option), a new group
  **"Invert Camera"** under Automatic Attack, with two checks side by side: **Up/Down** and **Left/Right** (V15's
  check box picture, as Translucency and Battle Music). Each applies at the next finger move. The window keeps its size.
- `WorldScreen.ts`: the camera reads the two options at each finger move.
- The desktop is unchanged: the mouse drag, the arrows and the desktop Option window do not read the new options.

Both invert checks are offered: up/down because that is the one players asked about, left/right because the owner
wanted a preference (Genshin and Tower of Fantasy offer it, though not for touch).

## The desktop mouse: phone only (owner, 2026-11-21)

Asked whether the desktop mouse drag should follow the same setting, the owner answered **phone only**. The mouse keeps
its direction (`DRAG_UP_SIGN = -1`, a drag down lowers the camera; the opposite of V15's mouse) and the desktop Option
window has no "Invert Camera". If that is ever wanted: flip `DRAG_UP_SIGN` to 1 and show the group on the desktop page
(the free space under Duel Requests), read by the mouse too.

## Tests

Run here:

- `npx vitest run apps/client/test/cameraControls.test.ts apps/client/test/backCamera.test.ts apps/client/test/gameOptions.test.ts apps/client/test/optionWindow.test.ts`: 58 passed.
- `npm run typecheck`: clean.
- `$env:E2E_CLIENT_PORT='5187'; npx playwright test -c apps/client/playwright.config.ts --project=phone --project=chromium apps/client/e2e/phoneCamera.spec.ts apps/client/e2e/controls.spec.ts apps/client/e2e/viewEquipOptions.spec.ts`
  7 passed, 1 skipped (the phone-only test on the desktop project).

`viewEquipOptions.spec.ts` also had an old expectation of the saved options without `cameraLock`/`zoomLimit` (added by
mouse-drag); it now lists every kept option.

## Full suites (for the owner, in this worktree)

    cd C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\phone-camera-invert
    npm run typecheck
    npm test
    $env:E2E_CLIENT_PORT='5187'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone

Pass: typecheck exits 0; `npm test` has no failures beyond any main already has; Playwright has no failures in
`phoneCamera`, `controls`, `viewEquipOptions`, `mouseDrag`, `mobileUx`, `windows`.

## By hand (phone)

- Drag a finger up on the world: the view tilts up (more sky). Down: more ground. Right: the view turns right.
- Start → Option: "Invert Camera" under Automatic Attack. Tick Up/Down, close, drag up: the view tilts down. Tick
  Left/Right: a drag right turns the view left. Reload the page: the ticks are still there.

## VPS (after the owner's merge; no convert, no server change)

1. Merge into FlyffWeb main (the owner's word): `git merge --no-ff phone-camera-invert`.
2. Make the package, in the server repo: `powershell -ExecutionPolicy Bypass -File deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`.
   Code only; the VPS keeps its game files.
3. On the VPS, follow the package's `PACKAGE.txt` (unpack to `C:\FlyFF-update`, `robocopy C:\FlyFF-update\deploy C:\FlyFF\deploy /E`,
   `C:\FlyFF\deploy\run.bat Update-FlyffWeb -From C:\FlyFF-update\FlyffWeb`, delete `C:\FlyFF-update`).

Players' browsers start with both inverts off, so every phone gets the new up/down at once; anyone who liked the old
way ticks Up/Down.
