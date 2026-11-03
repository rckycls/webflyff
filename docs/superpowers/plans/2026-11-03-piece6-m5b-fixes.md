# Piece 6 M5 — Performance and Memory, Part B (the fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the first load under 15 MB and the Flaris frame to 30 fps on a phone-speed CPU, by drawing only what Neuz draws, and record the numbers for the owner's single round of device readings.

**Architecture:** Measured first, on this PC (Task 1 makes those measurements a test): the frame is CPU-bound, and three.js' `render()` takes about 29 ms of a 38 ms frame with Chromium's CPU slowed 4×. So the fixes cut draw calls and per-draw work. Neuz draws only the 3 × 3 lands around the camera and hides each object beyond its model's view distance; the web client draws the preload ring too and every object at every distance. It also draws see-through two-sided materials in two passes, where D3D uses one. The texture, view-distance and shadow levers of spec §3.6 step 2 are not needed for any measured miss (see "Decisions").

**Tech Stack:** TypeScript, three.js 0.186.1, Vite, Vitest, Playwright 1.64.1 (Chromium 1248, on the GPU through ANGLE D3D11).

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.6 (M5) step 2, §4 (M5 line), §7 (M5). Part A: `docs/superpowers/plans/2026-11-03-piece6-m5-performance.md` and `docs/piece6-m5-checkpoint.md`. The owner chose on 2026-11-03 to have Part B planned before the device readings, so one round of readings covers Parts A and B.

## What was measured (2026-11-03, this PC, Flaris square, Webby with an Aibatt and Julia, dev server)

| Measure | Desktop view | Phone view (Pixel 7 landscape) |
|---|---|---|
| Draw calls / triangles | 292 / 619,009 | 327 / 897,209 |
| Map objects (instanced) | 225 draws, 309k tris | 248 draws, 477k tris (14 draws and 155k of them on the preload ring) |
| Terrain layers | 47 draws, 306k tris | 57 draws, 416k tris (10 draws and 110k on the ring) |
| Movers, name tags | 12 + 3 draws | 12 + 3 draws |
| CPU 1× / 4× / 6× | 60 / 32.3 / 18.9 fps | 60 / 26.3 / 15.5 fps; `render()` 5.0 / 29.7 / 50.7 ms |
| Phone view, ring hidden, CPU 4× | | 28.3 fps (was 24.7), 303 draws, 632,560 tris |

- The preload ring (16 tiles at distance 2) lies wholly beyond the 400 m far plane, Flaris' fog end. Its tiles are 512 m on a side. Their whole-tile bounding spheres still pass three.js' frustum test.
- First load, assets only, dev server: 15.43 MiB. With the ring's tile requests held until the character was on screen, 11.40 MiB, of which about 0.97 MiB is the ring's own tile files, which the probe still counted. On the production build that comes to about 11.3 MiB, against 16.3 now.
- Three.js re-checks a shader program about 10.5 times a frame, all on the additive light materials of Flaris' buildings (`Obj_MaFlHo01-light.dds` and three more). Three's `renderObject` draws a transparent `DoubleSide` material twice, back faces then front, and sets `needsUpdate` before each pass, unless `forceSinglePass` is set.
- Allocations, standing: 8.1 MB/s. Three's `getParameters` accounts for 1.85 MB/s (the re-checks above). In the client's own code: `checkBound` (`sim/camera.ts`) 0.66, `Minimap.update` (`hud/minimap.ts:139`) 0.25, `WorldStage.ts:104` 0.19, `TaskBar.draw` (`hud/taskBar.ts:701`) 0.18 MB/s.
- Neuz's object view distance, estimated offline from the converted tiles: the 3 × 3 tiles around the square hold 4,300 objects, and 1,643 are within their model's distance from Webby. The (tile, model) pairs with an object in range, each at least one draw, go from 293 to 88. The distance classes are 2,537 objects of class 0 (250 m), 1,743 of class 2 (60 m) and 20 of class 3 (400 m).
- Memory: the Part A soak held 266 MB (desktop), under the 400 MB target. No shadow maps are drawn.

## C++ trace (the rules Tasks 2 and 4 copy)

- **Lands drawn:** `m_nVisibilityLand = (int)( m_fFarPlane / ( MAP_SIZE * MPU ) )` (`World.cpp:116`), with `m_fFarPlane = 512` (`World3D.cpp:50`): 1, so the 3 × 3 lands around the camera's land (`RenderTerrain`, `World3D.cpp:386-398`; objects likewise, `:626-631`). The web keeps the 3 × 3 around the player's tile. That gives the same picture, because the far plane (400 m) is shorter than a tile (512 m).
- **Object view distance:** `World3D.cpp:640-683`. `m_fDistCamera` is the 3D distance from the camera to the object's position. With `m_bViewLODObj` (TRUE, `World.cpp:147`), an object is skipped when `m_fDistCamera > fDistant[ g_Option.m_nObjectDistant ][ m_pModelElem->m_dwDistant ]`. `fDistant[1]` is `{ 250, 150, 60, 400 }` (`:672-675`), and `m_nObjectDistant` defaults to 1 (`HwOption.cpp:170`). `m_dwDistant` is the `dwDistant` column of `mdlObj.inc` (`ModelMng.cpp:395`).
- **One pass:** D3D draws a two-sided mesh (`D3DCULL_NONE`, the converter's `XE_2SIDE` → `doubleSided`, `tools/convert/src/models/modelGlb.ts:83-96`) in a single draw.

## Global Constraints

- Targets, measured on the weakest of the four test devices (iPhone, Android phone, iPad, Android tablet):
  - ≥ 30 fps in Flaris town, standing and running, with the HUD open and monsters and players in view;
  - ≤ ~400 MB, JS heap plus the GPU estimate, as the Stats panel shows;
  - after a scripted 10-minute loop, memory within 10% of its start, and three.js' geometry, texture and program counts back to their start;
  - ≤ 15 MB downloaded before the character is on screen, counted compressed.
- The builder's stand-in for a weak phone is Chromium in the phone view with its CPU slowed 4× (`Emulation.setCPUThrottlingRate`). It stands in for a phone's CPU, not its GPU. The owner's device readings decide.
- Copy Neuz rule for rule, citing the C++ `file:line` in the code comments, as the trace above does.
- No server change. Every packet the browser sends is one Neuz sends. The gateway's limits stay.
- Any change to the look on phones is shown to the owner before it is kept (spec §3.6). Only Task 4 changes the look.
- A setting that cannot be applied leaves the default (spec §4). A manifest without the new `modelDistant` draws every object at every distance, as now.
- Builders run `npm test`, `npm run typecheck` and the spec files their change touches. They also run the `perf` and `prod` projects after Tasks 2–5, whose numbers are each task's deliverable. The owner runs the full suites.
- The owner's dev server holds port 5174. Builders run browser specs through `.superpowers/sdd/e2e-5175.config.ts`, a git-ignored copy of the config on port 5175. Its `outputDir` is outside the owner's `test-results`. The `prod` project runs on port 4174 through the real config, with `--output .superpowers/sdd/prod-results` so that it leaves the owner's `apps/client/test-results` alone (Part A's run emptied it). Never stop the owner's server.
- Never commit `.playwright-drops/`, `apps/client/playwright.drops.config.ts` or anything under `.superpowers/`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands given to the owner use `npm.cmd`, because PowerShell's execution policy blocks `npm.ps1`.
- The converter reads the client at `FLYFF_CLIENT=C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client`, since the worktree has no `../Client`.

## Review Focus

1. **The player crosses into another tile before the ring has loaded**, for example by running off right after entering. The new visible tiles must load and show, with no hole and no flat ground left behind. Pinned by Task 2's test `loads the new visible tiles, then their ring, when the player crosses into another tile`.
2. **A tile that drops from the visible set into the ring** must leave the scene. On return, the same entry must come back without a second download. Pinned by Task 2's test `keeps a ring tile out of the scene until it is visible, and takes it out when it goes back to the ring`.
3. **The camera walks away from a model's objects and back.** Culled instances must come back. A mesh with no instance in range must not be drawn, and the LOD switch must not show it again while its count is 0. Pinned by Task 4's tests `hides each object past its model's view distance from the camera, and shows it again on the way back` and `keeps a model's LOD level hidden while none of its objects is in range`.
4. **An older manifest without `modelDistant`** draws everything, as before (spec §4). Pinned by Task 4's test `draws every object at every distance when the manifest has no modelDistant`.
5. **The first-load cut-off** is the world's first frame. A request started after it must not count, even while it is still downloading when the test reads the list. A request started before it must count, finished or not. Pinned by Task 2: the ring starts one frame after the first, and the count compares each request's start time with `onScreenAt`.

---

### Task 1: The measures: the frame's own time in the Stats panel, and a phone-speed frame check

**Files:**
- Modify:
  - `packages/scene/src/overlay/Overlay.ts` (`OverlaySnapshot.cpuMs`, `addWork`, the fps line)
  - `apps/client/src/world/WorldScreen.ts` (`frame`: time the frame's work)
  - `apps/client/e2e/worldHarness.ts` (the crowd, moved from the soak)
  - `apps/client/e2e/soak.spec.ts` (uses the moved crowd)
  - `apps/client/playwright.config.ts` (`perf` project, `@perf` in `OWN_PROJECT`, the dev server for `perf`)
  - `package.json` (`test:perf:client`), `README.md` (its row)
- Create: `apps/client/e2e/frameRate.spec.ts`
- Test: `packages/scene/test/overlay.test.ts`; the new spec

**Interfaces:**
- Produces:
  - `OverlaySnapshot.cpuMs: number | null`, null until `addWork` was first called;
  - `Overlay.addWork(ms: number): void`;
  - from `worldHarness.ts`: `CROWD_MONSTERS: AddedMover[]` (9101–9106), `CROWD_PLAYERS: AddedMover[]` (9201–9203), `crowdScript(): WorldScript`. These are the soak's values, unchanged.
  - `npm run test:perf:client`, whose test logs one `frame rate:` line. The later tasks quote it.

- [ ] **Step 1: Write the failing overlay tests** in `overlay.test.ts`:
  - `it("adds the frame's own work to the fps line once it is given")`: 30 times `frame(1 / 60)` and `addWork(4)`, then a redraw. Then `snapshot().cpuMs` is close to `4` (`toBeCloseTo(4, 5)`), and the text contains `cpu 4.0 ms` on the line that starts `fps`.
  - `it('keeps the fps line as it was when no work time is given (the viewer)')`: no `addWork`, so `cpuMs === null` and the fps line has no `cpu`.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/overlay.test.ts`. Expected: FAIL, `addWork` is not a function.
- [ ] **Step 3: Implement.**
  - `addWork` sums its time over the same window as `frameMs`, and resets with it.
  - The fps line becomes `fps ${fps}   frame ${frameMs} ms   cpu ${cpuMs} ms` when `cpuMs !== null`. It stays shorter than the panel's longest line, so the overlay's box, and with it the pictures' mask, keeps its size.
  - In `WorldScreen.frame`, take `performance.now()` first, and call `overlay.addWork(performance.now() - start)` last, in a `finally`, so a throwing frame is timed too.
  - `ClientPerf` gets `cpuMs` through `OverlaySnapshot`.
- [ ] **Step 4: Run** the overlay tests and `npx vitest run apps/viewer`. Expected: PASS.
- [ ] **Step 5: Move the crowd.** The soak's `monsters`, `players` and `script` become `CROWD_MONSTERS`, `CROWD_PLAYERS` and `crowdScript()` in `worldHarness.ts`, and the soak imports them.
- [ ] **Step 6: Write `frameRate.spec.ts`:** `test('a phone-speed CPU keeps 30 fps in Flaris, standing and running, with a crowd in view', { tag: '@perf' }, …)`.
  - Use `crowdScript()`, then `enterFlaris`. Wait 5 s for the tiles and the ring.
  - Through a CDP session, `Emulation.setCPUThrottlingRate { rate: 4 }`, then wait 3 s.
  - **Standing:** read `perf()` every 500 ms for 3 s, and keep the mean `fps` and `cpuMs` and the last `drawCalls` and `triangles`.
  - **Running:** `keyboard.down('KeyW')`, wait 1 s, read as for standing, then `keyboard.up('KeyW')`.
  - Set the rate back to 1. Sample allocations for 10 s with `HeapProfiler.startSampling` / `stopSampling` (`samplingInterval: 4096`, objects collected by both GCs included), and sum to MB/s overall and for the ten largest functions.
  - Log `frame rate: standing <fps> fps (cpu <ms> ms), running <fps> fps (cpu <ms> ms), draws <n>, triangles <n>; allocations <MB/s> MB/s`, the top-ten lines under it, and push the same as an annotation.
  - Assert `errors` is `[]`, standing fps ≥ 30 and running fps ≥ 30.
- [ ] **Step 7: Wire it.**
  - `OWN_PROJECT` becomes `/@picture|@soak|@prod|@perf/`.
  - Add the project `{ name: 'perf', grep: /@perf/, timeout: 180_000, use: { ...devices['Pixel 7 landscape'], launchOptions: { args: GPU_GL } } }`.
  - The dev server's `runs(...)` gains `'perf'`.
  - Add the script `"test:perf:client": "playwright test -c apps/client/playwright.config.ts --project=perf"` and a README row beside the soak's.
- [ ] **Step 8: Run** the new spec through the 5175 config, `--project=perf`. Expected: it runs and logs the line, and **FAILS** on the 30 fps assertion: about 25 fps standing at 4×, with draws near 330. Ledger the line as the baseline. Also run `--list` on `npm run test:e2e:client`'s projects. Expected: no `frameRate.spec.ts` test listed.
- [ ] **Step 9: Run** `npm test` and `npm run typecheck`. Expected: PASS. Then run the soak for one minute: set the `SOAK_MINUTES` environment variable to `1`, then run the `soak` project through the 5175 config. Expected: `1 passed`, since only its imports moved.
- [ ] **Step 10: Commit** `feat(scene,client): the frame's own time in the Stats panel, a phone-speed frame check`.

### Task 2: The preload ring loads after the character is on screen, and is never drawn

**Files:**
- Modify:
  - `packages/scene/src/world/tileStreamer.ts` (`startPreloading`, the ring kept out of the scene, the header comment with the C++ trace)
  - `packages/scene/src/world/WorldStage.ts` (`startPreloading`)
  - `apps/client/src/world/WorldScreen.ts` (start it the frame after the first, `onScreenAt`)
  - `apps/client/src/testHooks.ts` (`ClientPerf.onScreenAt`)
  - `apps/viewer/src/world/WorldView.ts:272` (the viewer starts it once ready)
  - `apps/client/e2e/firstLoad.spec.ts` (the cut-off)
  - `apps/client/e2e/world.spec.ts:127` (25 tiles, polled)
- Test: `packages/scene/test/streamer.test.ts`

**Interfaces:**
- Consumes: Task 1's `test:perf:client`.
- Produces:
  - `TileStreamer.startPreloading(): void` and `WorldStage.startPreloading(): void`. Before the first call, `update` loads only the visible tiles. From then on, each `update`'s ring loads once that update's visible tiles have settled, and right away for the current ring when they already have.
  - `ClientPerf.onScreenAt: number | null`: epoch ms (`performance.timeOrigin + performance.now()`), taken right after the frame that first drew the world (where `resolveShown` runs). Null before.

- [ ] **Step 1: Write the failing streamer tests** in `streamer.test.ts`:
  - `it('asks only for the visible tiles until startPreloading, then for the ring once they have settled')`: after `update` and the visible tiles' arrival, the store was asked for the 9 visible keys only. After `startPreloading()`, it was also asked for the 16 ring keys, each once.
  - `it('keeps a ring tile out of the scene until it is visible, and takes it out when it goes back to the ring')`: a ring tile that arrived has neither its ground group nor its objects group under `scene`. After an `update` that makes it visible, both are there, with no second request. After one that puts it back in the ring, neither is, and `loaded()` still has it.
  - `it('loads the new visible tiles, then their ring, when the player crosses into another tile')`: preloading is on, and the player crosses before the first ring has arrived. The new visible tiles are asked for first and are in the scene once they arrive, and the new ring is asked for after they settle.
  - Update `asks for the visible tiles first, then the preload ring, each once` to call `startPreloading()`.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/streamer.test.ts`. Expected: FAIL, with `startPreloading` missing and ring tiles in the scene.
- [ ] **Step 3: Implement.**
  - An entry's groups (terrain, objects, placeholder) are in the scene only while its key is visible. `show` and `flat` add them only then. `update` adds and removes them as keys move between the visible set and the ring.
  - The ring's loads wait for `startPreloading` and for that update's visible tiles to settle. A later `update` overtakes an earlier one's wait, through a generation counter.
  - `ready()` is unchanged. `loaded()` documents that it includes loaded ring tiles. Collision shapes are placed for ring tiles as now.
  - The header comment cites `World.cpp:116` and `World3D.cpp:50`, `:386-398`, as in the trace above.
- [ ] **Step 4: Run** the streamer tests and `packages/scene/test/worldStage.test.ts`. Expected: PASS.
- [ ] **Step 5: Wire the callers.**
  - `WorldScreen.frame` calls `stage.startPreloading()` once, before `stage.focus`, on the first frame that begins with `endingsAreDrops` already true, so one frame after the world was first drawn. Right after `resolveShown()` it stores `onScreenAt`.
  - The viewer's `WorldView` calls `opened.startPreloading()` right after its `await Promise.all([opened.ready(), …])`.
- [ ] **Step 6: The first-load cut-off.**
  - In `firstLoad.spec.ts`, read `onScreenAt` from `perf()` after `enterFlaris`. Count the non-media requests whose `request.timing().startTime < onScreenAt`, sized and waited for as now.
  - The Resource Timing cross-check uses the same cut-off. The header comment says why: the character is on screen at that frame, and the ring starts after it.
- [ ] **Step 7: Run** `world.spec.ts` with `-g "stats hook"` through the 5175 config, its 25-tile check now polled with `ON_FRAMES`. Then run the `@picture` tests (`--project=pictures`). Expected: PASS. If a picture fails, look at its diff first. Ring tiles were only ever in the fully fogged far corners. A diff there alone gets a baseline retake and a ledgered ruling. Any other diff is a bug.
- [ ] **Step 8: Run** the `prod` project (Global Constraints: the real config, with `--output`), and the `perf` project through the 5175 config. Expected:
  - first load PASSES, at about 11.3 MiB;
  - the perf line shows about 303 draws and 633k triangles in the phone view, and about 28 fps standing at 4×. It still fails on 30 fps.
  - Ledger both lines.
- [ ] **Step 9: Run** `npm test`, `npm run typecheck`, the viewer's world spec, and the soak for one minute (`SOAK_MINUTES=1`). Expected: PASS.
- [ ] **Step 10: Commit** `perf(scene,client): the preload ring loads after the character is on screen and is never drawn (Neuz's 3 x 3 lands)`.

### Task 3: See-through two-sided materials draw in one pass, as D3D does

**Files:**
- Modify:
  - `packages/scene/src/assets/loaders.ts` (`loadGltf`)
  - `packages/scene/src/world/objects.ts:113-127` (`worldMaterial`)
  - `packages/scene/src/effects/EffectRenderer.ts:124` (`effectMaterial`)
  - `apps/client/src/world/render/moverModels.ts:48` (the hair tint)
  - `apps/client/src/world/render/portrait.ts:45`
  - `apps/client/src/world/render/moveMark.ts:37`
- Test: `packages/scene/test/assets.test.ts`, `objects.test.ts`, `effectRenderer.test.ts`; `apps/client/test/moveMark.test.ts`, `portrait.test.ts`

**Interfaces:**
- Produces: every material the client draws has `forceSinglePass === true`. Three reads it only for a transparent `DoubleSide` material, so it changes nothing else.

- [ ] **Step 1: Write the failing tests:**
  - in `objects.test.ts`, extend `lights models as the fixed-function pipeline does …` to expect `forceSinglePass` on the light and Lambert materials. Add `it('draws a see-through two-sided model in one pass, as D3D does with culling off')`: a glb material with `doubleSided` and `alphaMode: 'BLEND'` ends up transparent, `DoubleSide` and `forceSinglePass`.
  - in `effectRenderer.test.ts`, extend the GLOW test (`… on both sides`) to expect `forceSinglePass`;
  - in `assets.test.ts`: `it('marks every material of a parsed glb for one pass')`;
  - in `moveMark.test.ts` and `portrait.test.ts`: the material has `forceSinglePass`.
- [ ] **Step 2: Run** those five files. Expected: FAIL on `forceSinglePass` being `false`.
- [ ] **Step 3: Implement.**
  - Set the flag where each material is made.
  - In `loadGltf`, traverse the parsed scene's materials.
  - Each site's comment cites D3D's single draw with `D3DCULL_NONE` and the converter's `XE_2SIDE` rule (`modelGlb.ts:83-96`).
- [ ] **Step 4: Run** the five files, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Run** the `@picture` tests and `fight.spec.ts` through the 5175 config. Expected: PASS. Additive light is the same in either order. A failing picture means a see-through two-sided blend was in view: look at its diff, then retake the baseline with a ledgered ruling (D3D draws it in one pass).
- [ ] **Step 6: Run** `test:perf:client`. Expected: phone draws drop by about 5, to about 298. Ledger the line.
- [ ] **Step 7: Commit** `perf(scene,client): see-through two-sided materials in one pass, as D3D draws them`.

### Task 4: Each map object hides past its model's view distance, as in Neuz

**Files:**
- Modify:
  - `packages/formats/src/web/manifest.ts` (`modelDistant`)
  - `tools/convert/src/world/convertWorld.ts:145-147`, `:259-260`, `:401-402`
  - `packages/scene/src/world/objects.ts` (`OBJECT_DISTANCES`, the per-instance view distance in `update`, the header comment)
  - `apps/client/e2e/__screenshots__/…` (the world pictures, retaken after the owner's yes)
- Test: `tools/convert/test/world.test.ts`, `packages/scene/test/objects.test.ts`

**Interfaces:**
- Produces:
  - `WorldManifest.modelDistant?: number[]`, parallel to `models`: `MODELELEM::m_dwDistant`, 0 to 3. Missing in an older manifest, where every object is drawn at every distance.
  - `export const OBJECT_DISTANCES: readonly number[] = [250, 150, 60, 400]` in `objects.ts`: `fDistant[1]` (`World3D.cpp:672-675`), `m_nObjectDistant` 1 (`HwOption.cpp:170`).
  - `ObjectPool.update(camera: Vec3)` keeps its signature, and now also culls by distance.

- [ ] **Step 1: Write the failing converter test** in `world.test.ts`, beside the `modelTrans` test: `it("writes each model's dwDistant (mdlObj.inc, ModelMng.cpp:395) as modelDistant, parallel to models")`. Expected `[2, 0]` for two models whose index entries say 2 and 0.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/world.test.ts`. Expected: FAIL, `modelDistant` is undefined.
- [ ] **Step 3: Implement** `this.modelDistant.push(elem.extra[1]!)` next to `modelTrans`, the manifest field, and its doc comment, in the same style as `modelTrans`.
- [ ] **Step 4: Write the failing pool tests** in `objects.test.ts`:
  - `it('hides each object past its model's view distance from the camera, and shows it again on the way back')`: a tile with objects of a class-2 model at 50 m and 70 m from the camera. After `update`, the model's meshes have `count === 1`, and the drawn instance is the 50 m one. With the camera 15 m nearer the far one, `count === 2`. The distance is 3D, from the camera to the object's position.
  - `it('keeps a model's LOD level hidden while none of its objects is in range')`: every object of a two-level model is past its distance, so all its meshes are invisible whatever the band. When one comes back in range, the band's level shows.
  - `it('draws every object at every distance when the manifest has no modelDistant')`
  - `it('rewrites a model's instances only when the set in range changes')`: two `update`s with the camera moved 1 m and nothing crossing a limit. The second leaves `instanceMatrix.version` unchanged.
- [ ] **Step 5: Run** `npx vitest run packages/scene/test/objects.test.ts`. Expected: FAIL.
- [ ] **Step 6: Implement.**
  - Per model on a tile, `place` keeps the full instance matrices of each mesh, the objects' positions, and the model's limit: `OBJECT_DISTANCES[modelDistant[i]]`, or `Infinity` without the column.
  - `update` computes each model's set in range, by 3D distance from `camera` against its limit. Only when that set changed, it writes the kept instances to the front of each mesh's `instanceMatrix`, then sets `count`, `needsUpdate` and `computeBoundingSphere()`.
  - A mesh is visible when its LOD level is the one shown and its `count` is above 0.
  - The header comment cites `World3D.cpp:640-683`, `World.cpp:147` and `HwOption.cpp:170`.
  - Movers, ground items and effects are left out: see "Decisions".
- [ ] **Step 7: Run** the objects tests, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 8: Convert again**, in the background:

  ```
  npm run convert -- --only "wd*,du*"
  ```

  Run it with `FLYFF_CLIENT` set (Global Constraints). Expected: 35 worlds, 0 failed. Each `manifest.json` in `dist/assets/index.json` now has `modelDistant`, as long as `models`.
- [ ] **Step 9: Run** `test:perf:client`. Expected: in the phone view, the objects' draws fall from about 234 to under 100, and the test PASSES with ≥ 30 fps standing and running at 4×. Ledger the line. If it still fails, ledger the miss with its numbers for the owner, and don't add another lever.
- [ ] **Step 10: Show the owner.** Take the same pictures before (`git stash` the scene change, or check out the previous commit's `objects.ts`) and after:
  - Flaris square, phone view and desktop view;
  - from the square looking down the main street.

  Save them in the plan's workspace and send them to the owner with the checkpoint. Then run the `@picture` tests. Expected: `world-flaris-movers.png` fails where the distant small objects went. Retake it with `--update-snapshots`, look at it, and commit the retake in a **separate commit**, `test(client): world pictures with Neuz's object view distance`, so that a "no" from the owner is one `git revert` of this task's commits and a reconversion (or keeping `modelDistant` and setting the limit to `Infinity`).
- [ ] **Step 11: Commit** the code: `feat(convert,scene): each map object hides past its model's view distance, as Neuz's fDistant`.

### Task 5: The client's own per-frame allocations

**Files:**
- Modify:
  - `apps/client/src/world/sim/camera.ts` (`checkBound`)
  - `apps/client/src/world/hud/minimap.ts:139` (`update`)
  - `apps/client/src/world/hud/taskBar.ts:701` (`draw`)
  - `packages/scene/src/world/WorldStage.ts` (what the profile puts at `:104`)
  - the Piece 4 final review's deferred T9 `box()`, T13 `toWebMatrix` and `coneVertices` (`EffectRenderer.ts`), T16 `keyOf`, T19 `measureRadii` (`WorldScreen.ts`), T21 the shake offset. They are listed in `FlyffWeb-worktrees/piece4-combat/.superpowers/sdd/2026-10-24-piece4-combat-skills/final-review-deferred.md`.
- Test: each file's existing unit tests

**Interfaces:**
- Consumes: Task 1's allocation lines.
- Produces: nothing new. Each function keeps its signature and results, and reuses scratch objects held by its module or class.

- [ ] **Step 1: Re-take the profile** with `test:perf:client`. Its top-ten lines name the functions. The client's own code means `apps/client/src` and `packages/*/src`. Ledger every function there at ≥ 0.1 MB/s, standing.
- [ ] **Step 2: For each one**, first confirm its existing unit tests pin its results (add a result test where none does). Then make it reuse its scratch objects or arrays, and run its tests. Expected: PASS, the same results. T21 is a behaviour change: the shake is sampled once per rules step and held between steps. It gets `it('samples the shake once per rules step, not per browser frame')` first, which must fail before the change.
- [ ] **Step 3: Run** `test:perf:client`. Expected: no client function ≥ 0.1 MB/s in the top ten. Ledger the overall MB/s, before and after.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`, then the soak for one minute. Expected: PASS.
- [ ] **Step 5: Commit** `perf(client,scene): no per-frame allocations in the client's own frame code`.

### Task 6: The records, the owner's checklist and the checkpoint

**Files:**
- Modify:
  - `docs/conversion-baseline.md` (the client first load, the phone-speed frame per task, the allocation rate)
  - `docs/device-testing.md`, "Piece 6, milestone 5" (a `cpu` column in the readings; one round for Parts A and B; the faces and previews on iPhone and iPad Safari, Part A's deferred minor)
  - `docs/piece6-m5-checkpoint.md` (a Part B section: what changed, rulings, numbers, still open)
  - `README.md` (what Part B adds, if Task 1's row doesn't say it)

- [ ] **Step 1: Write the records** from the ledgered `frame rate:` and `first load:` lines.
- [ ] **Step 2: Update the checklist.**
  - The readings take the Stats panel's `cpu` too. A frame time well over its `cpu` time means the device's GPU is the limit, and that is the next lever (see "Decisions").
  - Add a "Look" step for Task 4's view distance, a yes or no from the owner.
- [ ] **Step 3: The checkpoint's Part B section,** with the owner's runs:

  | Command (PowerShell, in the piece6 folder, own dev server stopped) | Time | Pass |
  |---|---|---|
  | `npm.cmd run test:e2e:client` | about 10–15 min | no `failed` |
  | `npm.cmd run test:soak:client` | about 12 min | `1 passed` |
  | `npm.cmd run test:firstload:client` | about 3 min | `1 passed`, and its `first load:` line |
  | `npm.cmd run test:perf:client` | about 1 min | `1 passed`, and its `frame rate:` line |
  | The device readings, with the `cpu` column | about 1 hour | the tables filled in |
  | Task 4's pictures | a minute | yes or no |

- [ ] **Step 4: Commit** `docs(piece6): M5 part B records, checklist and checkpoint`.

---

## Decisions this plan makes

Each one, with what it costs if wrong:
- **Terrain LOD (Neuz's `lod.cpp`, ranges 128, 256 and 512 m at the default view area) is left out.** The measured frame is CPU-bound, and terrain LOD cuts triangles, not draws. It is the next lever if a device's Stats panel shows a frame time well over its `cpu`. *Cost:* another plan round if the weakest device is GPU-bound.
- **Movers, ground items and effects get no view distance.** In Neuz, movers are all class 1 (150 m), and ground items and most effects class 2 (60 m). Here they are 15 draws in all. *Cost:* a monster past 150 m stays drawn, unlike in Neuz.
- **The 3 × 3 follows the player's tile, not the camera's land.** *Cost:* none on screen, since the far plane (400 m) is shorter than a tile (512 m).
- **Texture sizes, view distance and shadows stay.** The ring fix brings the first load to about 11.3 MiB, the soak measured 266 MB, the view is already Neuz's 3 × 3 within its fog, and no shadow maps are drawn. *Cost:* if a phone's memory reading passes 400 MB, `--max-texture-size` in the converter is the lever, and it applies to every device.
- **The first-load count ends at the world's first frame (`onScreenAt`).** Until now it ended when the test noticed `ready()`, tens of milliseconds later. *Cost:* none. Before, a request started in that gap counted, though the character was already on screen.
- **The phone stand-in is a 4× slower CPU on this PC's GPU.** *Cost:* the GPU side is checked only by the owner's readings.
