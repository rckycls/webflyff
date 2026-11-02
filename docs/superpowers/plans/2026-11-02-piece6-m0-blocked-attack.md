# Piece 6 M0 — Blocked-Attack Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** auto-attacking (or using a repeating skill on) a target behind a wall never sends more than the gateway
allows, while the character keeps trying to reach it, as in Neuz.

**Architecture:** one gate in `setOwnDestObj`, the function every own approach to an object goes through. A collision
that ends a walk to an object records it as blocked. A new walk to that same object then waits until 6 rules steps
after the last PLAYERSETDESTOBJ. The rules step counts the wait down, as it counts down `m_nCorr`. Tests count the
packets of every repeatable input into a wall against a shared budget of 50 a second.
- The spec asks for one test file. The cases go beside each class's existing test rig instead, sharing one helper,
  `test/helpers/traffic.ts`, so that no rig is copied.
- The joystick and tap-walk cases already exist in `ownMover.test.ts`, from the 2026-11-01 fix, and stay there.

**Tech Stack:** TypeScript, Vitest (unit tests only; no browser spec changes).

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.1, and §2 "Facts found in the code" for the cause.

## Global Constraints

- No server change and no gateway change. The gateway keeps `maxPacketsPerSecond: 100` (`apps/gateway/src/config.ts:31`).
- The walk, the collision, the PLAYERCORR, the auto-attack, the arrival, the swing and the skills keep Neuz's rules.
  Only the timing of a repeated PLAYERSETDESTOBJ to the same blocked object changes. Comment it as a browser adaptation
  next to the copied code, citing `_Common/MoverMsg.cpp:47-84` and `_Common/MoverActEvent.cpp:2017-2037`.
- Re-approach cadence: at most one PLAYERSETDESTOBJ to the blocked object per **6** rules steps (10 a second at 60 Hz).
- Traffic budget: at most **50** packets in any 60 consecutive rules steps for one repeatable input, half the gateway's
  limit.
- Code style: match the surrounding files, with C++ citations in doc comments, 120-column lines and `Math.fround`
  where the rules already use it.
- Builders run only `npm test`, `npm run typecheck` and the focused Vitest files named below. No Playwright runs; the
  owner runs those at the checkpoint.
- Work in `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, branch `piece6`.

## Review Focus

1. **A different target right after a bump:** it must get its PLAYERSETDESTOBJ on that same step, never held by the
   gate. Pinned in Task 1, test "a walk to another object goes out at once".
2. **A held step must not walk locally:** the server would not know the walk, and the corrections would fight. On a
   held step, `own.dest` stays as the collision left it (null). Pinned in Task 1, same test.
3. **The first approach after a long walk:** a bump at least 6 steps after the last send re-approaches on the next step,
   with no extra delay. The existing test `a collision does not stop the auto-attack: it walks up again`
   (`attackLoop.test.ts:387-396`) must still pass unchanged.
4. **A repeating skill:** a staff or cheer stick keeps the action slot reserved (`skillUse.ts` `useSkillQueue`), so it
   re-asks on every step. It must stay under the budget and still re-approach. Pinned in Task 2.
5. **Tap-walk and the joystick still behave as after the 2026-11-01 fix:** walls stop a tap-walk with one PLAYERCORR,
   and joystick traffic stays at 22 or fewer a second. The existing tests in `ownMover.test.ts` (`coalesces %s ground
   steering against a wall…`, `a tap-walk into a wall sends one PLAYERCORR…`) must still pass unchanged.

---

### Task 1: The approach gate

**Files:**
- Modify: `apps/client/src/world/sim/moverRules.ts`:
  - the `SimMover` interface, near `nCorr` (:82-88);
  - `stepMover` (:349-359);
  - `onActCorr` (:369-378).
- Modify: `apps/client/src/world/combat/attackLoop.ts`, `setOwnDestObj` (:93-111).
- Create: `apps/client/test/helpers/traffic.ts`.
- Test: `apps/client/test/attackLoop.test.ts`.

**Interfaces:**
- Produces, in `moverRules.ts`, two new optional fields on `SimMover`:
  - `approachWait?: number`: rules steps before the next PLAYERSETDESTOBJ to `blockedTarget` may go. `setOwnDestObj`
    sets it, and `stepMover` counts it down to 0, beside `m_nCorr`.
  - `blockedTarget?: number | null`: the object whose walk `onActCorr` ended (collision or drop, with `nCorr < 0`).
    It is null when the ended walk was to a point.
- Produces, in `attackLoop.ts`: `export const APPROACH_REPORT_STEPS = 6;` and the gated
  `setOwnDestObj(session, tick, find, own, objectId, range): void`, with the signature unchanged.
- Produces, in `test/helpers/traffic.ts`:
  - `export const TRAFFIC_BUDGET = 50;`
  - `export function busiestSecond(stepsOfPackets: readonly number[]): number`: the most entries within any 60
    consecutive steps. Each entry is the rules step at which one packet was sent.

- [ ] **Step 1: Write the helper and the failing tests**

`test/helpers/traffic.ts`: `TRAFFIC_BUDGET` and `busiestSecond`. Use the same window as the peak in
`ownMover.test.ts:79`: for each entry, count the entries `at > step - 60 && at <= step`, and take the max. The max of an
empty list is 0. Doc comment: the gateway closes after more than 100 a second (`apps/gateway/src/config.ts:31`), and the
budget is half that (Piece 6 spec §3.1).

In `attackLoop.test.ts`, in the `describe` that holds `a collision does not stop the auto-attack…` (:387), add two tests.
Both use `rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } })`. A small local function
`stepCounting(r, stepsOfPackets, at)` runs `r.step()` and then pushes `at` once for each new `r.sent` entry. When
`r.own.corrReport` is set, it also pushes `at` and sets `corrReport` back to null, as `OwnMover.corrected` does on the
world screen.

```ts
it('auto-attack into a wall keeps walking up at most 10 times a second, within the traffic budget', () => {
  const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
  r.tap(MONSTER_ID);
  r.tap(MONSTER_ID);
  const at: number[] = [];
  const destObjAt: number[] = [];
  for (let s = 0; s < 300; s++) {
    const before = r.sent.length;
    stepCounting(r, at, s);
    for (const sent of r.sent.slice(before)) if (sent[0] === 'destObj') destObjAt.push(s);
  }
  expect(busiestSecond(at)).toBeLessThanOrEqual(TRAFFIC_BUDGET); // 120 before the gate
  const lastFourSeconds = destObjAt.filter((s) => s >= 60).length;
  expect(lastFourSeconds).toBeGreaterThanOrEqual(36);
  expect(lastFourSeconds).toBeLessThanOrEqual(40);
  expect(r.loop.autoAttack).toBe(true);
  expect(r.own.act.body.pos[0]).toBeLessThan(103);
});

it('a walk to another object goes out at once; the blocked one waits and does not walk locally', () => {
  // the setup: the own mover has just bumped while walking to the Aibatt
  const r = rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] } });
  r.tap(MONSTER_ID);
  r.tap(MONSTER_ID);
  r.until(() => r.own.corrReport != null);
  expect(r.own.blockedTarget).toBe(MONSTER_ID);
  const sent: Array<[number, number]> = [];
  const session = { sendDestObj: (id: number, range: number) => void sent.push([id, range]), sendBehavior: () => {} };
  const find = (id: number) => r.world.movers.get(id);
  r.own.approachWait = 3;
  setOwnDestObj(session, () => 0n, find, r.own, MONSTER_ID, 0);
  expect(sent).toEqual([]);
  expect(r.own.dest).toBeNull();
  setOwnDestObj(session, () => 0n, find, r.own, OTHER_MONSTER_ID, 0);
  expect(sent).toEqual([[OTHER_MONSTER_ID, 0]]);
  expect(r.own.approachWait).toBe(APPROACH_REPORT_STEPS);
});
```

Import `setOwnDestObj` and `APPROACH_REPORT_STEPS` from `../src/world/combat/attackLoop`, and `busiestSecond` and
`TRAFFIC_BUDGET` from `./helpers/traffic`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/client/test/attackLoop.test.ts`
Expected: both new tests FAIL:
- the first with a busiest second of about 120, more than 50;
- the second on `blockedTarget` being `undefined`. A TypeScript error on the unknown fields is also a valid failure.

All other tests in the file pass.

- [ ] **Step 3: Implement the gate**

- `moverRules.ts`, `SimMover`: add `approachWait` and `blockedTarget` with doc comments. Say that they are the browser's,
  not Neuz's, and why: the gateway's limit, and Neuz's 120 a second at a wall.
- `stepMover`: beside `if (m.nCorr !== undefined && m.nCorr > 0) m.nCorr--;`, count `approachWait` down the same way.
- `onActCorr`: in the `m.nCorr < 0` branch, set `m.blockedTarget = m.dest?.targetId ?? null` before `clearDest(m)`.
- `setOwnDestObj`: inside `if (old !== objectId)`, before anything is sent, return at once when
  `own.blockedTarget === objectId && (own.approachWait ?? 0) > 0`. That return skips the sends and the rules'
  `setDestObj`, so nothing walks locally. When PLAYERSETDESTOBJ is sent, set `own.approachWait = APPROACH_REPORT_STEPS`.
  Extend the doc comment with the adaptation and the cadence.

No caller changes:
- `cmdSetMeleeAttack` runs again on the next attack step;
- `cmdSetUseSkill` keeps its command, which a reserved action slot re-asks on each step.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run apps/client/test/attackLoop.test.ts apps/client/test/ownMover.test.ts apps/client/test/skillUse.test.ts`
Expected: all pass, including `a collision does not stop the auto-attack: it walks up again` unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/sim/moverRules.ts apps/client/src/world/combat/attackLoop.ts apps/client/test/helpers/traffic.ts apps/client/test/attackLoop.test.ts
git commit -m "fix(client): a blocked walk to a target is asked for again at most 10 times a second (Piece 6 M0)"
```

---

### Task 2: The other approaches, and the owner's checkpoint

What was checked while planning:
- **Skills:** the skill use goes through `setOwnDestObj` (`skillUse.ts:525`), so the gate covers it.
- **Pick-up:** it sends its own PLAYERSETDESTOBJ (`items/itemActions.ts:58`), at most once per drop per 6 s
  (`active.until`).
- **NPCs:** selecting one sends no approach.

This task pins those with tests, and writes the owner's docs.

**Files:**
- Test: `apps/client/test/skillUse.test.ts`, `apps/client/test/itemActions.test.ts`.
- Modify: `docs/device-testing.md` (a new section "Piece 6, milestone 0").
- Create: `docs/piece6-m0-checkpoint.md`.

**Interfaces:**
- Consumes: `busiestSecond` and `TRAFFIC_BUDGET` from `test/helpers/traffic.ts` (Task 1).

- [ ] **Step 1: Write the tests**

In `skillUse.test.ts`, add a `describe('SkillUse: a target behind a wall (Piece 6 M0)')`. Both tests use
`rig({ ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] }, queue: [skillShortcut(0, 2)] })`.
The Aibatt is at its default, 5 m east, behind the wall. Count packets per step as in Task 1, `r.sent` deltas plus a
nulled `r.own.corrReport`, over 300 steps.

- `a skill from the bar on a target behind a wall bumps once and asks no more`:
  - `r.tap(MONSTER_ID); r.skills.useSlot(0);`, then 300 counted steps;
  - expect exactly one `destObj` and one correction;
  - expect `busiestSecond(at) <= TRAFFIC_BUDGET`.
- `the action slot with a staff keeps walking up at most 10 times a second, within the traffic budget`:
  - set `r.numbers.equipped = { weapon: itemProp({ id: 31, kind1: 1, kind2: 2, kind3: Ik3.STAFF, part: 10 }), armour: [] }`,
    as `skillUse.test.ts:318` does;
  - `r.tap(MONSTER_ID); r.skills.useActionSlot();`, then 300 counted steps;
  - expect `busiestSecond(at) <= TRAFFIC_BUDGET`;
  - expect the `destObj` entries at steps ≥ 60 to number between 36 and 40.

In `itemActions.test.ts`, add `a drop that is never picked up is asked for once, then given up after 6 s`. Build
`ItemActions` as the existing nearby test does (:19-25), with one drop that never disappears. Call
`actions.pick(100, 0)`, then `actions.step(now)` every 1000/60 ms for 10 s. Expect `sendDestObj` to have been called
exactly once. `step` drops the timed-out drop and its queue is then empty (`itemActions.ts:49-60`).

- [ ] **Step 2: Run them**

Run: `npx vitest run apps/client/test/skillUse.test.ts apps/client/test/itemActions.test.ts`
Expected: PASS.
- If the action-slot test fails with a busiest second of about 120, the gate is not on that path: trace why
  `cmdSetUseSkill` bypassed `setOwnDestObj`, and fix it there.
- If the bar-slot test sees more than one `destObj`, report what re-issues it before changing anything.

- [ ] **Step 3: Run the quick suites**

Run: `npm test` and then `npm run typecheck`, from the worktree root.
Expected: exit code 0 and no `failed` line in either, with the skipped count unchanged from before Task 1. Write the
passed and skipped counts into the checkpoint doc (Step 5).

- [ ] **Step 4: Copy the converted game files for the owner's check**

The owner's device check runs `dev:client` from this worktree. Copy the piece5 worktree's converted files, 1.4 GB:

```powershell
robocopy "C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece5-items-chat\dist\assets" "C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6\dist\assets" /E /NFL /NDL /NJH /NP
```

Expected: exit code below 8, which for robocopy means success, and `dist/assets/index.json` present. The folder is
git-ignored.

- [ ] **Step 5: Write the owner's docs**

`docs/device-testing.md`, section "Piece 6, milestone 0: a target behind a wall". Write it in the style of the existing
sections: plain words, numbered steps, "Success:" lines, and what the test character needs. The character needs: a
character of any level that can attack. For step 3, a Vagrant at level 3 or higher with Clean Hit on the bar.
1. Start the client from `FlyffWeb-worktrees\piece6`, as in the Piece 5 sections, with `GATEWAY_PROXY` set to the VM's
   gateway.
2. Find a monster on the other side of a fence, a wall or a building corner. Select it and press the attack button on the
   phone, or click it twice on the PC.
   Success: the character walks into the obstacle and keeps nudging at it. After 30 seconds you are still connected, and
   no "Too much data was sent" appears.
3. Same with a skill from the bar on that monster.
   Success: one bump, still connected.
4. Walk around the obstacle while auto-attack is on.
   Success: once the way is clear, the character reaches the monster and attacks.

`docs/piece6-m0-checkpoint.md`:
- what changed;
- the cause, in two sentences;
- the tests added, with their names;
- the quick-suite results from Step 3, exact counts and exit codes;
- the owner's checks below, unchecked.

- [ ] **Step 6: Commit**

```bash
git add apps/client/test/skillUse.test.ts apps/client/test/itemActions.test.ts docs/device-testing.md docs/piece6-m0-checkpoint.md
git commit -m "test(client): skills and pick-up stay within the traffic budget at a wall; M0 checklist"
```

---

## Owner checkpoint (after Task 2)

Run on the PC, in `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`:

| What | Command | Time | Pass |
|---|---|---|---|
| Fight and skill browser tests | `npm run test:e2e:client -- fight.spec.ts skills.spec.ts` | about 15-25 min | no `failed` line |
| Device check | `docs/device-testing.md`, "Piece 6, milestone 0", on the phone and the PC, servers in the VM | 10 min | every "Success:" line holds |

If something fails, send: the command's last 30 lines, or for the device check, which step, the device, and what
happened instead.
