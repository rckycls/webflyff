# Boss HP bar colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each boss HP bar gets its own shade, red to white, with the next bar's shade behind the current one.

**Architecture:** Two pure functions in `hud/targetBar.ts` give the colours; `Gauge` gets `setColor`; `TargetBar` adds a
third gauge ("target-next") between the empty and the fill gauges and colours both per frame.

**Tech Stack:** TypeScript, vitest, Playwright (Chromium desktop + phone).

**Spec:** `docs/superpowers/specs/2026-11-20-boss-bar-colours-design.md`

## Global Constraints

- One-bar monsters: fill ARGB 0x80ff0f0f, no next gauge, exactly as before.
- Shade: t = (max - left) / (max - 1); R 255, G = B = round(15 + 240 t), A = round(128 + 102 t).
- Behind: the shade of left - 1; behind the last bar 0xc8404040.
- Quick tests only (owner rule): typecheck, the touched vitest files, the one e2e spec.

## Review Focus

- `left` outside 1..max from a bad packet (0, or more than max): clamp, never NaN or a negative colour.
- A target switch from a boss to a normal monster: the fill goes back to red and the next gauge hides the same frame.
- A boss with max 1 (HP_LAYER says one bar): treated as a normal monster.
- The fill and next gauges at width 0 or full: the next gauge is full width, under the fill, never over it.
- Phone layout: the next gauge sits exactly under the fill (same top, same left).

---

### Task 1: Shades and the next gauge

**Files:**
- Modify: `apps/client/src/world/hud/targetBar.ts`, `apps/client/src/world/hud/gauge.ts`
- Test: `apps/client/test/hpLayer.test.ts`, `apps/client/e2e/layeredBossHp.spec.ts`

**Interfaces:**
- Produces: `barShade(left: number, max: number): number` (ARGB), `behindShade(left: number, max: number): number | null`,
  `Gauge.setColor(color: number): void`.

- [ ] **Step 1:** vitest in `hpLayer.test.ts`: `barShade(5,5)` 0x80ff0f0f, `barShade(3,5)` 0xb3ff8787, `barShade(1,5)`
  0xe6ffffff, `barShade(1,2)` 0xe6ffffff, `barShade(0,5)` = `barShade(1,5)`, `barShade(9,5)` = `barShade(5,5)`;
  `behindShade(5,5)` = `barShade(4,5)`, `behindShade(1,5)` 0xc8404040, `behindShade(1,1)` null; TargetBar: boss x3 →
  fill rgb(255, 15, 15) opacity 128/255, next gauge shown full width rgb(255, 135, 135); then a plain monster → fill red,
  next gauge hidden.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/hpLayer.test.ts`. Expected: FAIL (barShade not exported).
- [ ] **Step 3:** Implement the two functions, `Gauge.setColor`, the "target-next" gauge and the per-frame colouring.
- [ ] **Step 4:** Run the vitest file and `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5:** e2e `layeredBossHp`: assert the fill/next colours at x5, x2, x1 and take pictures x5 to x1. Run
  `$env:E2E_CLIENT_PORT='5198'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone layeredBossHp`.
  Expected: 2 passed.
- [ ] **Step 6:** Commit; checkpoint doc with the pictures' paths and the owner's merge/deploy steps.
