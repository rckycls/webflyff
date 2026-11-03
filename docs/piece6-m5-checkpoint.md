# Piece 6 milestone 5 checkpoint: performance and memory, part A

Date: 2026-11-03. Branch `piece6`.
- Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.6. M4 was skipped by the owner on 2026-11-03.
- Plan: [M5 plan, part A](superpowers/plans/2026-11-03-piece6-m5-performance.md).

Part A measures, and removes the page freezes that kept the full browser suite from finishing clean. Part B, the fixes, gets its own plan once the owner's device readings are in.

## What changed

- **The Stats panel tells the truth.** It shows the world frame's draw calls and triangles, read right after the world's render. Its fps is the frame's real time: the world's quarter-second cap had kept it from ever showing under 4. The client has a `window.__client.perf()` hook over it, with three.js' own counts and the loaded tiles. `rendererCounts` moved from the viewer into `packages/scene`.
- **Portraits no longer stall the page.** The status face, the inventory preview and the lobby's previews are read back with `readRenderTargetPixelsAsync`. They used `readRenderTargetPixels`, which waits for the GPU to finish everything queued. An inventory picture overtaken by a newer one is dropped (`latestOnly`).
- **The browser tests draw on the PC's GPU.** On the owner's laptop, a 15 W Ryzen 7 5700U, SwiftShader kept every core busy and the boost gave out after about 20 s. A Flaris frame of about 0.9 million triangles then drew at 1-2 fps even alone, and screenshots and frame waits timed out: those were the phone tests' two-minute hangs. On the laptop's GPU (ANGLE D3D11), four phone worlds draw at 20-24 fps. The three picture tests (@picture) keep SwiftShader in a desktop project, `pictures`, so their baselines stay GPU-independent. `E2E_SOFTWARE_GL=1` puts every test back on SwiftShader.
- **A client soak test** (`npm run test:soak:client`) and **a first-load check on a production build** (`npm run test:firstload:client`). `test:e2e:client` now names its projects: `chromium`, `phone` and `pictures`. The config starts only the servers of the projects named.
- **The owner's checklist:** [device-testing.md](device-testing.md), "Piece 6, milestone 5". The records are in [conversion-baseline.md](conversion-baseline.md): client soak, client first load, and per device.

## Rulings

- The portraits keep the generation counter, to skip drawing an obsolete one, and add `latestOnly`, so an overtaken read never lands.
- Under SwiftShader the asynchronous read lands about 5 s after the draw; the blocking read took under 1 s. The tests wait for the inventory preview and the status face with `ON_FRAMES` before reading or photographing them.
- The hangs' cause is the test machine's software rendering. It is not the client, the screenshots or the pixel count: at device scale 1 the hang set still failed 4/4. The fix is the GPU for the tests.
- The world pictures were retaken. The Stats panel's new line made the overlay mask a line taller.
- The soak's loop is the server's SETPOS hops, not held keys, so no wall stops a lap. Its square starts at Flaris' square, so the monsters and players are in view at every sample.
- The first-load bytes are every request the page or its workers started before `ready()`, at its whole compressed body, waited for if still coming. Media streams (the music) are left out: they stream (spec §9), and whether a track had ended at `ready()` swung the number by about 2 MiB. Resource Timing missed some, among them the lobby's 1.14 MiB background picture. The test build goes to `node_modules/.cache/client-firstload`, never `apps/client/dist`.
- The Stats panel's draws line shows only once the client gives it numbers, so the viewer's panel and pictures stay as they were (the final review's finding).

## Verification

- **Unit suite:** `npm test`: 160 files, 3,101 passed, 8 skipped. `npm run typecheck`: exit 0.
- **Full browser suite on the GPU, 4 workers, port 5175:** 174 passed, 13 skipped, 0 failed, twice (9.5 and 10.6 minutes). The owner's run before M5 gave 19 failed and 153 passed in 40.8 minutes.
- **Soak, 2-minute run:** 3 laps at 266.8, 266.1 and 266.2 MB. three.js held 591 geometries, 310 textures and 13 programs at every lap. Passed.
- **First load:** 16.27, 16.31 and 16.31 MiB against 15 MiB. **Over the budget by 1.31 MiB**, mostly textures (8.60 MiB). The test stays failing for Part B.

## For Part B

- **First load:** textures 8.60 MiB, models 2.51, the world's tiles 1.52, interface pictures 1.45. 1.31 MiB has to go.
- **Per frame:** Flaris square, 327 draw calls and 897,209 triangles in the phone's view.
- **Per-frame allocations:** the Piece 4 final review's deferred items (T9, T13, T16, T19, T21).

## Still open

- [ ] The owner's `npm.cmd run test:e2e:client`: no `failed`.
- [ ] The owner's `npm.cmd run test:soak:client`: `1 passed`, with its `lap …` lines.
- [ ] The owner's `npm.cmd run test:firstload:client`: known to fail; its `first load:` line.
- [ ] The device readings on the four devices, and the 10-minute walk on the weakest.
- [ ] Part B's plan, from those numbers.

## Final review

A fresh reviewer read the whole of part A (f2058e6..439159f): 0 Critical, 2 Important, 10 Minor. Its verdict was "ready with fixes".

**The two Important findings were fixed:**
- **The first-load count** swung by about 2 MiB, depending on whether the music's request had ended, and its cross-check tested the wrong set. It now counts everything started before `ready()`, waited for, leaving out media streams. Three runs gave 16.27, 16.31 and 16.31 MiB.
- **A "draws 0 triangles 0" line** would have been in the viewer's Stats panel, using up most of its pictures' allowance. The line now shows only once the client gives it numbers. The viewer's browser tests: 11 passed.

**After the fixes:**
- `npm test`: 3,102 passed, 8 skipped. Typecheck: exit 0.
- The full browser suite on the GPU: 174 passed, 13 skipped, 0 failed (8.3 minutes).

**The minors are deferred:**
- A bare `playwright test` also runs the soak and the prod build. `default: false` on those projects would stop that.
- Your `playwright.drops.config.ts` spreads `webServer`, which is now a list.
- The soak's monster check can flake while a tile is still loading.
- A lost WebGL context reads "portrait: undefined".
- Stale "SwiftShader" comments are left in the specs.
- The device checklist doesn't ask about the faces and previews on Safari.
- `makePortrait`'s wiring has no test of its own.
