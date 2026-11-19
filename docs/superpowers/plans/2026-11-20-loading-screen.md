# Loading Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** V15's loading picture with a real progress bar over the world screen while a world loads, faded out once it is drawn.

**Architecture:** a DOM layer (`world/loading/`) owned by `WorldScreen`, pulling a `LoadParts` snapshot each animation
frame and turning it into a never-falling fraction (`loadFraction`). The scene and the mover views count what they
finished; the converter adds the eight pictures; the character list warms the picked one.

**Tech Stack:** TypeScript, DOM/CSS (container query units with px fallbacks), vitest, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-20-loading-screen-design.md`

## Global Constraints

- Pictures: `MapLoading2.tga`, `MapLoading3.tga`, `MapLoading4.tga` (random); `MapLoading_GuildWar.tga` (202, 241-244),
  `MapLoading_Ominous.tga` (121), `MapLoading_Ominous_1.tga` (122), `MapLoading_DreadfulCave.tga` (123),
  `MapLoading_Guildhouse.tga` (212-214).
- Weights: server 20, game files 10, map 45, models 20, window pictures 5; below 100% until the world is drawn.
- Fade 700 ms linear; whole 4:3 picture centred, dark blurred copy behind; nothing stretched or cropped.
- "Entering the world…" stays in the DOM (visually hidden); Leave stays.
- A missing picture (no convert yet) shows the dark background with the bar; never an error.

## Review Focus

- No convert on the server yet: `store.url` is null → dark layer + bar, no overlay error. (Task 3 test)
- A map change while the previous fade still runs: the old layer goes at once, the new one starts. (Task 4 e2e travel)
- A drop (connection lost) during loading: the drop box shows over the layer. (z-index 0 while loading; Task 3 CSS)
- Clicks right after `ready()`: the fading layer lets them through (`pointer-events: none`). (Task 4 e2e)
- Phone landscape 844 x 390: the bar and the percent stay inside the picture and readable. (Task 5 screenshot)

---

### Task 1: Picture rules and progress maths (pure)

**Files:** Create `apps/client/src/world/loading/loadingPicture.ts`, `apps/client/src/world/loading/loadProgress.ts`;
Test `apps/client/test/world/loading/loading.test.ts`

**Produces:**
- `loadingPicture(worldId: number, random?: () => number): string` and `class LoadingPictures { peek(worldId): string; take(worldId): string }`, `export const loadingPictures`.
- `interface LoadParts { server: number; files: boolean; map: { done: number; total: number } | null; models: { done: number; total: number } | null; windows: boolean; drawn: boolean }`
- `loadFraction(parts: LoadParts): number` (0..1; 0.99 at most until `drawn`), `serverShare(phase: string): number`.

- [ ] Tests: 202/241/244 → GuildWar; 121/122/123; 212-214 → Guildhouse; 1 with random 0, 0.5, 0.99 → 2, 3, 4;
  `peek` then `take` give the same picture, the next `take` may differ; `loadFraction` of all-empty 0, of everything
  but `drawn` 0.99, `drawn` 1; map `{done: 4, total: 9}` counts 0.45 × (0.1 + 0.9 × 4/9); models null → 0, `{0, 0}` → 1.
- [ ] Implement; vitest passes; commit.

### Task 2: Counting in the scene and the mover views

**Files:** Modify `packages/scene/src/world/tileStreamer.ts` (entry `done`, `progress()`), `packages/scene/src/world/WorldStage.ts`
(`progress(): { done: number; total: number }`), `apps/client/src/world/render/MoverViews.ts` (`progress()` from counters at
the three `pending.add` sites); `apps/client/src/world/WorldSession.ts` (`get loadPhase(): Phase`).

- [ ] Existing tileStreamer/MoverViews tests still pass; add one tileStreamer test: `progress()` is `{0, 9}` before the
  tiles resolve and `{9, 9}` after `ready()`.

### Task 3: The layer

**Files:** Create `apps/client/src/world/loading/loadingScreen.ts`; Modify `apps/client/src/style.css` (`.world-loading*`).

**Produces:** `class LoadingScreen { element; constructor(doc, text); setPicture(url: string | null); setArt(art: UiArt); start(read: () => LoadParts); finish(): void; dispose(): void }`

- [ ] DOM: blur, picture box (4:3, `container-type: inline-size`), bar (3-piece `GauEmptyNormal.bmp`, percent-based
  background sizes), percent, hidden status text. Under the "Now Loading" badge: picture x 392-636, y 748-760.
- [ ] `finish()`: 100%, next frame `.world-loading-fading` (opacity 0 over 700 ms, z-index 1500, no pointer events), removed
  on `transitionend` or after 900 ms.

### Task 4: Wiring

**Files:** Modify `apps/client/src/world/WorldScreen.ts` (constructor, `start`, `handle` transition, `openStage`, `showWorld`,
`drawFrame`, `drop`, `disposeWorld`, preload start), `apps/client/src/lobby/worldPrefetch.ts` (picture first),
`tools/convert/src/ui/uiStage.ts` (`THEME_FILES` + the 8 pictures).

- [ ] Existing e2e: `world.spec.ts`, `travel.spec.ts`, `lobby.spec.ts` "Entering the world…", `landscape.spec.ts` still pass.

### Task 5: Check and pictures

- [ ] Convert the 8 pictures into the worktree's `dist` only; a Playwright spec `loadingScreen.spec.ts` (desktop + phone
  landscape) with tiles held back: picture, bar < 100%, Leave visible; release: layer gone after the world is drawn;
  screenshots to the owner.
