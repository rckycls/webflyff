# Quick Job Change window (2026-11-20, CUSTOM): hand-over

The owner: "i'd like changing jobs to be easier so let's build this window pop up both for desktop and mobile after
reaching the required level so they just click the job they want with another confirmation box that follows the same
theme. except the blue text (follow our white title text rule). Make the theme for v15."

- Spec: `docs/superpowers/specs/2026-11-20-quick-job-change-design.md`
- Plan: `docs/superpowers/plans/2026-11-20-quick-job-change.md`
- The owner's reference screenshots: `docs/quick-job-change/`
- The World side is the outer repo's branch `quick-job-change`: `patches/2026-11-20-quick-job-change.patch`, the built
  `Program/7. World.exe`, and `docs/2026-11-20-quick-job-change-deploy.md` (VPS steps and in-game checks).

## What the player sees

- **When it pops up:** when a job change becomes due, and again at each login while one is due.
  - 1st job: Lv15 Vagrant.
  - 2nd job: Lv60 first job.
  - Master, then Hero: Lv120 at 99.99%.
- **Closing it:** it doesn't come back in that session for the same tier. Start → Extras → **Job Change** opens it. With
  nothing due, that line says when the next change opens.
- **The row:** four portraits. The picked one is in colour in an orange frame, the others grey. A locked or unused slot
  shows V15's lock.
  - 2nd job: the line's two jobs, then two locks.
  - Master or Hero: the one job with V15's Master or Hero mark, then three locks.
- **Under the row:**
  - the job's name, as the white title of a V15 group box;
  - its description;
  - V15's small arrows and Go!.
- **Go!:** a V15 Yes/No box: "Become an Acrobat? This can't be undone." Yes sends the packet, and the World's job change
  closes the window.
- **Class lock:** the same as the class NPCs'. A started chain leaves only that class open.
- **Phone:** the same window, scaled to fit the screen above the task bar.

## Files

| File | What |
|---|---|
| `packages/protocol/src/world/quickJobChange.ts` | `encodeQuickJobChange(job)`: `QUICK_JOB_CHANGE` 0x8fff0130, one int |
| `apps/client/src/world/jobs/quickJobChange.ts` | the rules: `dueTier`, `jobSlots`, `JOB_CHAINS`, `JOB_NAMES`, `jobDescription`, `nextChangeLevel`, `shouldPopUp`, `jobPopupOff` |
| `apps/client/src/world/jobs/quickJobChangeWindow.ts` | the window and its Yes/No box (`QUICK_JOB_LAYOUT`, `QUICK_JOB_CONFIRM`) |
| `apps/client/src/world/hud/ownIcons.ts` | `OWN_ICON_FILES.jobChange`, the 24 portraits, `jobPortraitKey(job, sex)` |
| `apps/client/src/world/hud/applets.ts`, `taskBar.ts` | applet 9007 `APP_QUICK_JOB_CHANGE`, the Extras line "Job Change" (last) |
| `apps/client/src/world/WorldSession.ts` | `sendQuickJobChange(job)` |
| `apps/client/src/world/WorldScreen.ts` | the window's host, `checkQuickJob(login)` after each message batch and at the first drawn frame |
| `apps/client/src/icons/jobs/job<N>_<m\|f>.png` | the 24 portraits (176 x 216) |
| `apps/client/src/icons/icon_jobchange.png`, `bare/` | the Start-menu icon (`scripts/drawWindowIcons.ts`) |
| `apps/client/scripts/renderJobPortraits.ts`, `e2e/jobPortraitHarness.*` | how the portraits are drawn |
| `apps/client/e2e/quickJobChange.spec.ts` | the e2e test |

No convert and no gear sync: the pictures ship with the build.

## The e2e switch

The e2e character Webby is a Lv15 Vagrant, so the window would pop up in every world test. `playGateway` (in
`e2e/worldHarness.ts`) now sets `localStorage['flyffweb.jobPopup'] = 'off'` unless it is called with
`{ jobPopup: true }`. The client reads it in `jobPopupOff`. A player who sets it by hand only loses the pop-up; the menu
line still works.

## Re-drawing the portraits

Run these from the FlyffWeb root, with `dist/assets` present:

```
npm run dev:client -- --port 5187 --strictPort
$env:E2E_CLIENT_PORT='5187'; npx tsx apps/client/scripts/renderJobPortraits.ts
```

- **What it draws:** the Select Character slot's camera, standing, with the first face and hair of character creation.
- **The gear:** each job's job-change reward set and weapon (`e2e/jobPortraitHarness.ts`, from the outer repo's
  job-change-rewards table).
- **The crop:** head to knees, so the weapon shows: it's the only thing that tells Knight from Blade, and so on.

## Checks run

- `npm run typecheck`: clean.
- vitest: see the counts in the session's report. The new tests are `quickJobChange.test.ts` (13),
  `quickJobChangeWindow.test.ts` (12), `quickJobPopup.test.ts` (4), `jobPortraits.test.ts` (2), `hud.test.ts` (Extras
  line, applet 9007, icons) and protocol `quickJobChange.test.ts` (3).
- e2e, Chromium desktop and Pixel 7 landscape, on port 5187: `quickJobChange` 6 passed. The Start-menu, Teleport and
  landscape specs were run too (see the report).

## For the owner: full e2e

Close the dev server on 5174 first, or keep it and use another port:

```
$env:E2E_CLIENT_PORT='5187'; npm run test:e2e:client
```

**Pass:** every test passes, apart from flakes earlier hand-overs already list.

**By hand on an iPhone or iPad:**
- the pop-up on a Lv15 character;
- tapping a portrait;
- the arrows, Go!, Yes;
- the window fits above the task bar.

## Known limits

- The portraits use a stock face and hair, not the player's own (the owner picked pictures made ahead).
- Bows are held low, so the Acrobat's and Ranger's bows are small in the picture.
- On a very small phone (568 x 320) the window scales to about 0.8.
- The quest window still doesn't list the custom job-change gear (the converter reads `data.res`). The chat shows each
  item.
- With "translucent windows" on, the Yes/No box shows the window under it through its body, as the Awaken box does.
