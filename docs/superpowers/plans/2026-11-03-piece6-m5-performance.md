# Piece 6 M5 — Performance and Memory, Part A (measure, and the page freezes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the client measure itself honestly (the Stats panel, a soak test, a first-load check, the owner's device checklist) and remove the page freezes that keep the full browser suite from finishing clean.

**Architecture:** The Stats panel (`packages/scene` `Overlay`) gains draw calls and triangles and stops seeing the clamped frame time. The client gets a `perf()` test hook over it. The inventory and lobby portraits read back with `readRenderTargetPixelsAsync`, so the page never waits on the GPU. The screenshot hangs are found by experiment before anything is changed. Two new Playwright projects, `soak` and `prod`, copy the viewer's (`apps/viewer/playwright.config.ts`). **Part B**, fixing what misses the targets, gets its own plan once the owner's device readings are in (spec §3.6 step 2: "measure first, then fix in order of cost").

**Tech Stack:** TypeScript, three.js 0.186.1, Vite, Vitest, Playwright 1.64.1 (Chromium 1248, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.6 (M5), §4 (M5 line), §5 (M5 row), §7 (M5). M4 was skipped by the owner on 2026-11-03.

## Global Constraints

- Targets, measured on the weakest of the four test devices (iPhone, Android phone, iPad, Android tablet):
  - ≥ 30 fps in Flaris town, standing and running, with the HUD open and monsters and players in view;
  - ≤ ~400 MB, JS heap plus the GPU estimate, as the Stats panel shows;
  - after a scripted 10-minute loop, memory within 10% of its start, and three.js' geometry, texture and program counts back to their start;
  - ≤ 15 MB downloaded before the character is on screen, counted compressed.
- No server change. Every packet the browser sends is one Neuz sends. The gateway's limits stay.
- Any change to the look on phones is shown to the owner before it is kept (spec §3.6). Part A changes no look.
- Builders run `npm test`, `npm run typecheck` and the one spec file their change touches. The owner runs the full suites. The exceptions are Tasks 3 and 4, whose deliverable is the timing set itself.
- The owner's dev server holds port 5174. Builders run browser specs through a copy of the config on another port, in the git-ignored `.superpowers/sdd/`, for example `e2e-5175.config.ts`. Never stop the owner's server.
- Automated browser tests are Chromium only.
- Never commit `.playwright-drops/` or `apps/client/playwright.drops.config.ts`. They are the owner's.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands given to the owner use `npm.cmd`, because PowerShell's execution policy blocks `npm.ps1`.

## Review Focus

1. A portrait whose read finishes after a newer one started, for example the inventory reopened or equipment changed twice: the newer picture must win, and an older read must never overwrite it. Pinned by Task 2's `latestOnly` tests.
2. A tab that comes back after a minute hidden gives one 60 s frame. The panel must then read a low but finite fps, never NaN or Infinity, and 0 s frames must not divide by zero. Pinned by Task 1's overlay tests.
3. Draw calls must be read right after the world's own `stage.render()`, not after a later pass such as the screen layers or a portrait, which would show a handful of calls. Pinned by Task 1's e2e check `drawCalls > 50` in Flaris.
4. `npm run test:e2e:client` must neither start the soak or prod servers nor run their tests. Playwright starts every `webServer` it is given. Pinned by Task 5's `--list` check.
5. The first-load count must not quietly miss files once the resource-timing buffer fills at its default of 250. Pinned by Task 6: the count is checked against the responses Playwright saw.

---

### Task 1: The Stats panel tells the truth, and the client can read it

**Files:**
- Create: `packages/scene/src/overlay/rendererCounts.ts`
- Modify:
  - `packages/scene/src/overlay/Overlay.ts` (`OverlaySnapshot`, `setRenderCounts`, `redraw`)
  - `packages/scene/src/index.ts` (exports)
  - `apps/viewer/src/testHooks.ts:16-20,56-64` (use the moved `rendererCounts`)
  - `apps/client/src/world/WorldScreen.ts:1060-1064` (raw dt to the overlay), `:1098-1101` (render counts), `:361` (hook)
  - `apps/client/src/testHooks.ts` (`perf`)
- Test:
  - `packages/scene/test/overlay.test.ts`
  - `apps/client/e2e/world.spec.ts`, one new test

**Interfaces:**
- Produces:
  - `export interface RendererCounts { geometries: number; textures: number; programs: number }`
  - `export function rendererCounts(renderer: Pick<WebGLRenderer, 'info'>): RendererCounts`
  - `OverlaySnapshot` gains `drawCalls: number; triangles: number`
  - `Overlay.setRenderCounts(c: { drawCalls: number; triangles: number }): void`
  - client hook `perf(): ClientPerf`, with `ClientPerf = OverlaySnapshot & { renderer: RendererCounts; loadedTiles: string[] }`; `loadedTiles` comes from `WorldStage.loadedTiles()` (`packages/scene/src/world/WorldStage.ts:184`)

- [ ] **Step 1: Write the failing overlay tests** in `packages/scene/test/overlay.test.ts`:
  - `it('shows the draw calls and triangles it is given')`: after `setRenderCounts({ drawCalls: 412, triangles: 183_500 })` and a redraw, `snapshot()` has both numbers, and the panel text contains `draws 412   triangles 183,500`.
  - `it('reads a long frame as a low, finite rate')`: `frame(60)`, then `snapshot().fps` is finite and `> 0`.
  - `it('reads zero-length frames as 0 fps, not Infinity')`: `frame(0)` 60 times, then `snapshot().fps === 0`.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/overlay.test.ts`. Expected: FAIL. The first test fails on `setRenderCounts` not being a function. The other two may already pass, which is fine: they guard Step 3.
- [ ] **Step 3: Implement.**
  - In `Overlay`, keep `drawCalls` and `triangles` next to `counts`, return them from `snapshot()`, and add the line `draws ${drawCalls}   triangles ${triangles.toLocaleString('en-US')}` right after the tiles line.
  - Move `rendererCounts` from the viewer into `rendererCounts.ts` and export both names from `packages/scene`. The viewer's `registerRenderer` keeps its shape and calls the shared function.
- [ ] **Step 4: Run** `npx vitest run packages/scene/test/overlay.test.ts apps/viewer`. Expected: PASS.
- [ ] **Step 5: Write the failing e2e test** in `world.spec.ts`: `test('the stats hook reads the world frame: draw calls, triangles and three.js counts')`. Enter Flaris, then `expect.poll(() => perf().drawCalls, ON_FRAMES).toBeGreaterThan(50)`. Also expect `triangles > 0`, `renderer.programs > 0` and `loadedTiles.length === 25`.
- [ ] **Step 6: Implement the client side.**
  - In `WorldScreen.frame`, pass the raw `Math.max(0, (now - this.lastTime) / 1000)` to `overlay.frame`. The simulation keeps its 0.25 s clamp, so only the panel sees the raw time.
  - Right after `stage.render()`, call `overlay.setRenderCounts({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles })`.
  - Add `perf` to `ClientHooks` and to the hook object at `WorldScreen.ts:361`.
- [ ] **Step 7: Run** the new test through the port-5175 config, `--project=chromium -g "stats hook"`, then `npm test` and `npm run typecheck`. Expected: all PASS.
- [ ] **Step 8: Commit** `feat(scene,client): draw calls and triangles in the Stats panel, the raw frame time, a perf hook`.

### Task 2: Portraits read back without stalling the page

**Files:**
- Modify:
  - `apps/client/src/world/render/portrait.ts:61-140`
  - `apps/client/src/world/WorldScreen.ts:894-920` (`makePortrait`)
  - `apps/client/src/lobby/characterPreviews.ts:31`
- Test: `apps/client/test/portrait.test.ts` (new)

**Interfaces:**
- Produces:
  - `renderPortrait(renderer, model, motion, doc, fullBody?): Promise<HTMLCanvasElement>`, which was synchronous before;
  - `export function latestOnly<T>(): (task: Promise<T>) => Promise<T | null>`. It resolves `null` for a task overtaken by a later one.

- [ ] **Step 1: Write the failing tests**, using a stub renderer that records calls; jsdom's `getContext('2d')` returns null, so no pixels are copied:
  - `it('reads the pixels with readRenderTargetPixelsAsync, never the blocking read')`
  - `it('gives the render target back before the read resolves, and disposes the target after')`. Assert the call order: `setRenderTarget(target)`, `render`, `setRenderTarget(old)`, then `readRenderTargetPixelsAsync`, and only after its promise resolves, `target.dispose`.
  - `it('rejects when the read rejects, and still disposes the target')`
  - `it('latestOnly: an older task that finishes after a newer one gives null')`, and `it('latestOnly: the newest task gives its value')`
- [ ] **Step 2: Run** `npx vitest run apps/client/test/portrait.test.ts`. Expected: FAIL, because `readRenderTargetPixels` is called and `latestOnly` is undefined.
- [ ] **Step 3: Implement.**
  - Restore the render target and clear colour right after `render`, then `await renderer.readRenderTargetPixelsAsync(...)`, then dispose the target in a `finally`.
  - `makePortrait` awaits the canvas inside its existing `try`, so the model is still released in `finally`.
  - The inventory preview goes through one `latestOnly` per `WorldScreen`, and the `this.over` and stage-generation checks run again after the await.
  - The lobby's `characterPreviews` awaits too, and drops the canvas if its target element has left the page.
- [ ] **Step 4: Run** `npx vitest run apps/client/test/portrait.test.ts apps/client/test/inventoryWindow.test.ts`, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Run** `items.spec.ts` and `talking.spec.ts` through the port-5175 config with `--workers=1`. Expected: PASS. Ledger the console count of "GPU stall due to ReadPixels" before and after.
- [ ] **Step 6: Commit** `perf(client): portraits read back asynchronously, the newest one wins`.

### Task 3: Find the screenshot hangs

The hang set, from the 2026-11-03 runs: `controls.spec.ts:10` phone, `mobileAudit.spec.ts:7` phone, `talking.spec.ts:23` phone, `items.spec.ts:48` phone. In each, `page.screenshot` or a click waited its whole 2 minutes. Most are on the phone project, which is a Pixel 7 at device scale 2.625; the renderer caps its pixel ratio at 2 (`packages/scene/src/boot.ts:33`), so it draws about 1.4× the desktop's pixels, with antialiasing, in software.

- [ ] **Step 1: RED.** Run the hang set at `--workers=4`, twice. Expected: at least one hang per run. Ledger which tests hung.
- [ ] **Step 2: Hypothesis 1, pixel load.** Use a scratch config in `.superpowers/sdd/` that sets the phone project's `deviceScaleFactor: 1`. Run the hang set twice at 4 workers and ledger the result.
- [ ] **Step 3: Hypothesis 2, if 1 is wrong.** Trace one hanging test with `browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu'] })`. Find the longest main-thread tasks and GPU waits, and name the code that runs in them.
- [ ] **Step 4: Rule and fix.**
  - Record `Task 3: Ruling: <cause, with the numbers> — <fix> — <cost if wrong>`.
  - If the cause is the test machine's pixel load, the fix is the phone project's `deviceScaleFactor: 1` in `apps/client/playwright.config.ts`, with a comment. Layout is in CSS pixels, so the phone tests still check the same layout.
  - If the cause is in the client, fix it there, with a unit test that fails first.
- [ ] **Step 5: GREEN.** Run the hang set twice at 4 workers. Expected: no hang.
- [ ] **Step 6: Commit** `test(client)` or `perf(client)`, depending on where the fix landed.

### Task 4: The remaining waits follow the frame loop

The timing set, all the 2026-11-03 failures that weren't fixed by 5cc23c6, on both projects:
- `items.spec.ts:20` and `:48`
- `world.spec.ts:384`
- `recovery.spec.ts:121`
- `fight.spec.ts:311`
- `skills.spec.ts:182`
- `talking.spec.ts:23`
- `mobileAudit.spec.ts`
- `navigation.spec.ts:14`
- `controls.spec.ts:10`

- [ ] **Step 1: RED.** Run the timing set at `--workers=4` and ledger each failure with its line.
- [ ] **Step 2: Fix each failure.**
  - If its freeze has a cause in the client, fix the cause, with a test that fails first.
  - Otherwise, move that one wait onto `ON_FRAMES` (`worldHarness.ts:28`, 60 s), with a comment naming the freeze it waits through, as R28 did.
  - Never raise a test's whole timeout.
  - Each change gets a `Ruling:` line.
- [ ] **Step 3: GREEN.** Run the timing set twice at 4 workers. Expected: 0 failed both times.
- [ ] **Step 4: Commit** `test(client): waits on the frame loop where a frame can stall`.

### Task 5: The client soak test

**Files:**
- Create: `apps/client/e2e/soak.spec.ts`
- Modify:
  - `apps/client/playwright.config.ts` (projects and conditional servers)
  - `package.json` (scripts)

**Interfaces:**
- Consumes: `perf()` from Task 1.
- Produces:
  - project `soak` (`grep: /@soak/`, timeout 20 min, Chromium args `--enable-precise-memory-info --js-flags=--expose-gc`, on the dev server);
  - `chromium` and `phone` get `grepInvert: /@soak|@prod/`;
  - scripts `test:e2e:client`, now `playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone`, and `test:soak:client`, which is `--project=soak`.

- [ ] **Step 1: Make the config select servers by the projects named on the command line**, as `apps/viewer/playwright.config.ts:23-34,65-90` does. The dev server is only for `chromium`, `phone` and `soak`.
- [ ] **Step 2: Verify the separation.**
  - Run: `npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone --list | grep -c "@soak\|soak.spec"`. Expected: `0`.
  - `--project=soak --list` lists exactly the soak test.
- [ ] **Step 3: Write `soak.spec.ts`**, test `'ten minutes of laps through Flaris keep memory within 10% of the first lap', { tag: '@soak' }`. Constants:
  - `MINUTES = Number(process.env.SOAK_MINUTES ?? 10)`
  - `SIDE = 600` m, a square centred on `SQUARE`
  - `HOP_METRES = 50`
  - `HOP_MS = 1_000`
  - `SETTLE_MS = 5_000`
  - `LIMIT = 1.1`

  The pretend Flaris has 6 monsters and 3 players around the square.

  Each lap does three things:
  - the player is put at each point 50 m apart along the square, with `writeSetPos(SELF_ID, [x, groundAt(x, z), z])` pushed through `gateway.pushCache`, one hop every `HOP_MS`;
  - the 6 monsters are removed with `writeDelObj` and added again with `writeAddMonster`, so their views are freed and rebuilt;
  - a sample is taken at the start corner, after `SETTLE_MS`, then `gc()`, then `perf()`.

  The baseline is lap 1. Assertions:
  - the last lap's `gpuBytes + (jsHeapBytes ?? 0)` is at most `LIMIT ×` the baseline's;
  - the last lap's `renderer` equals the baseline's `renderer`;
  - `perf().errors` is empty.

  The self-checks, so the test can't pass for nothing:
  - `typeof gc === 'function'` and the heap is not null;
  - the heap numbers are not all equal;
  - the far corner's `loadedTiles` differ from the start corner's;
  - `perf().models` drops while the monsters are away and comes back.

  Ledger the ruling `Task 5: Ruling: the loop is the server's SETPOS hops, not held keys — no wall stops a lap, and every lap loads the same tiles — the cost if wrong: a leak only on the own player's walking path is missed`.
- [ ] **Step 4: Run** `SOAK_MINUTES=2` through a port-5175 copy of the soak project. Expected: PASS, with at least 2 laps. Ledger the per-lap numbers. The full 10 minutes is the owner's run.
- [ ] **Step 5: Commit** `test(client): a soak test for the world's memory`.

### Task 6: The first-load byte check

**Files:**
- Create: `apps/client/e2e/firstLoad.spec.ts`
- Modify:
  - `apps/client/playwright.config.ts`
  - `package.json`

**Interfaces:**
- Produces:
  - project `prod` (`grep: /@prod/`, baseURL `http://localhost:4174/`);
  - its server, `npm run build:client && npm run preview:client -- --port 4174 --strictPort`, with env `VITE_TEST_HOOKS: '1', VITE_GATEWAY_URL: 'ws://127.0.0.1:9', GATEWAY_PROXY: ''` and `reuseExistingServer: false`;
  - scripts `preview:client`, which is `vite preview --config apps/client/vite.config.ts --host`, and `test:firstload:client`, which is `--project=prod`.

- [ ] **Step 1: Write the test** `'first load stays under 15 MB until the character is on screen', { tag: '@prod' }`.
  - `addInitScript(() => performance.setResourceTimingBufferSize(100_000))`.
  - Count same-origin responses with `page.on('response')`.
  - Run `playGateway(page)` and then `enterFlaris(page)`.
  - Sum `encodedBodySize` over the navigation and resource entries.
  - Assert `bytes <= 15 * 1024 * 1024`.
  - Assert the number of entries is at least the number of responses seen, so no file was left out.
  - Assert `perf().errors` is empty.
  - Log `first load: <bytes> bytes in <files> files`.
- [ ] **Step 2: Run** `npm run test:firstload:client`. Expected: the build runs, the test PASSES, and the byte count is ledgered. If it is over 15 MB, the test fails. That's a real miss: ledger it for Part B and keep the test.
- [ ] **Step 3: Commit** `test(client): the first-load budget on a production build`.

### Task 7: The owner's checklist and the records

**Files:**
- Modify:
  - `docs/device-testing.md` (new section "Piece 6, milestone 5: performance")
  - `docs/conversion-baseline.md` (sections "Client soak test" and "Client first load")
- Create: `docs/piece6-m5-checkpoint.md`

- [ ] **Step 1: The checklist.**
  - Start the client from the piece6 folder with the VM gateway, as in M3.
  - The three spots:
    1. the Flaris square, standing, with the Navigator and chat open;
    2. 30 s of running round the square;
    3. the field north of Flaris (x 7100, z 3638) with monsters in view, standing, then fighting one.
  - Read fps, frame ms, gpu (est), heap or `n/a`, draws and triangles, at each spot, on the iPhone, Android phone, iPad, Android tablet, and the PC as a reference.
  - On the weakest device: gpu (est) after 1 minute and after a 10-minute loop.
  - A results table per spot.
- [ ] **Step 2: The baselines.**
  - Add the builder's quick soak numbers and the first-load bytes.
  - Add empty rows for the owner's full runs and the device table.
- [ ] **Step 3: The checkpoint**, covering what Part A changed, the ledger's rulings, and what's open: the owner's runs and Part B.
- [ ] **Step 4: Commit** `docs(piece6): M5 part A checklist, baselines and checkpoint`.

**The owner's runs**, in the piece6 folder, with their own dev server stopped:

| Command | Time | Pass |
|---|---|---|
| `npm.cmd run test:e2e:client` | about 40–50 min | no `failed` |
| `npm.cmd run test:soak:client` | about 12 min | `1 passed` |
| `npm.cmd run test:firstload:client` | about 3 min | `1 passed`, and the bytes it prints |
| The device readings | about 1 hour | the tables filled in |

---

## Part B (its own plan, after the readings)

Once the owner's numbers are in, `docs/superpowers/plans/<date>-piece6-m5b-fixes.md` takes each miss, cheapest fix first, in the spec's order:
- draw calls (merging or instancing models, name tags and effects);
- texture sizes on phones;
- view distance on phones (`RADIUS`, `WorldScreen.ts:120`);
- per-frame allocations: the Piece 4 final review's deferred items T9 `box()`, T13 matrices and cones, T16 `keyOf`, T19 `measureRadii`, T21 shake. They are in `FlyffWeb-worktrees/piece4-combat/.superpowers/sdd/2026-10-24-piece4-combat-skills/final-review-deferred.md`;
- shadow and effect detail.

Any quality setting it adds falls back to the default when it can't be applied (spec §4). If no target is missed, Part B is a note in the checkpoint.
