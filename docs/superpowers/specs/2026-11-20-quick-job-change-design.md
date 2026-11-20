# Quick Job Change (CUSTOM, 2026-11-20): design

## Why

The owner: "i'd like changing jobs to be easier so let's build this window pop up both for desktop and mobile after
reaching the required level so they just click the job they want with another confirmation box that follows the same
theme. except the blue text (follow our white title text rule). Make the theme for v15."

The reference is another server's "Quick Job Change" window (owner's screenshots, copied to the shared notes folder,
`quick-job-change/ref-first-job.png`, `ref-second-job.png`, and to `docs/quick-job-change/` here). It shows a row of 4 job
portraits (the picked one in colour with a highlighted frame, the others grey, unused slots locked), the job's name, a
scrolling description, left/right arrows and a Go! button.

V15 changes jobs through quest chains that walk the player across several towns, then an NPC script does the change. The
closed beta runs at x77 exp, so players hit the job levels fast and the walking is the slow part. The window skips the
walking and the tasks, never the rewards.

## Owner's answers

- **Tiers:** 1st job, 2nd job, **and Master and Hero**.
- **Master/Hero cost:** "No need requirements change immediately": no gems. Asked again: V15's level rule stays, so the
  window offers Master or Hero at Lv120 with 99.99% exp, and the change happens on Go!. Only the quests' gems are dropped.
- **Old quests:** keep both ways. The NPC chains still work; the window gives the same rewards and marks those quests
  done, so nobody claims twice.
- **Reopening:** a line in Start → Extras, and the window pops up again at each login while a change is due.
- **Portraits:** V15's own 3D characters, **pictures made ahead** (shipped with the build), in the player's gender, wearing
  that job's reward set. Not the reference server's art.
- **Name colour:** not blue; the project's white title rule (a V15 group box with a white, centred title, as the
  Teleport window's place name).

## Goals

- The window opens by itself when a change is due and from Start → Extras.
- One click per job, Go!, a V15 Yes/No box, then the job changes.
- The World gives exactly what the V15 chains give, including the owner's custom job-change gear in
  `Resource/propQuest.inc`, and nobody can skip or double-claim them.
- Desktop and phone both work, in the V15 look.

## Non-goals

- Listing the rewards in the window (the chat already shows a line per item, gold and skill points).
- Changing the NPC chains or the NPC scripts.
- A job reset or a job swap after a change.
- Listing the custom gear in the quest window (the separate converter follow-up from job-change-rewards).

## Anti-goals (a failure even if it works)

- A second set of job-change gear, by any order of window and NPC.
- A job change the NPC would refuse: wrong level, wrong job, or a 2nd job of another line.
- Taking a real item from the bag (gems, Twinkle Stones) the player did not hand in.
- A blue job name, or a window that is not V15-looking on either desktop or phone.

## When a change is due (V15's own rules)

| Tier | Current job | Level rule (V15 NPC script) | Choices | Chain the window completes |
|---|---|---|---|---|
| 1st | Vagrant (0) | Lv15 (V15 caps a Vagrant there) | Mercenary 1, Acrobat 2, Assist 3, Magician 4 | `QUEST_VOC{MER,ACR,ASS,MAG}_BFTRN`, `_TRN1`, `_TRN2`, `_TRN3` |
| 2nd | 1st job | Lv60 (V15 caps a 1st job there) | the line's two: Mercenary → Knight 6 / Blade 7, Acrobat → Jester 8 / Ranger 9, Assist → Ringmaster 10 / Billposter 11, Magician → Psykeeper 12 / Elementor 13 | `QUEST_HERO{KNI,BLA,JES,RAN,RIN,BIL,PSY,ELE}_TRN1` … `_TRN5` |
| Master | 2nd job (6-13) | Lv120 at 99.99% | own line's Master (job + 10, 16-23) | `QUEST_MASTER` |
| Hero | Master (16-23) | Lv120 at 99.99% | own line's Hero (job + 8, 24-31) | `QUEST_HERO` |

**Locked to a class (V15's rule):** V15's class NPCs refuse a chain once another class's chain of the same tier has been
**started**: `GetQuestState( … ) >= 0` in `WORLDDIALOG/NpcScript.cpp`, for example `mafl_elic_1` and `mada_corel_1`. The
window does the same:
- If any quest of a class's chain in this tier is started or done, only that class (or those classes) is offered, and
  the others show the lock.
- The chain's finished quests are never paid again: a quest already done gives nothing, so a player who finished
  `QUEST_VOCMER_TRN3` but never talked to Hyuit gets only the job.
- V15 lets one 1st-job NPC open anyway when its Madrigal-teacher scenario quest (`QUEST_SCE_MDRIGALTEACHER1`-`4`) was
  started. The window does not copy that exception; it stays strict (my call). A started chain locks the class.

## Server (outer repo, World patch)

New packet **`0x8FFF0130` QUICK_JOB_CHANGE**, client → World: `int nJob` (the job picked). This number is free: the patches
and the `town-bots` branch use 0x8FFF0100-0104, 0110, 0120, 000F and 0010. Handled by `CDPSrvr::OnQuickJobChange`, next
to `OnTeleportWindow`. No new answer packet: the World's own updates (job change, experience, quests, items, gold, the
chat lines) are the answer.

**Checks, all before anything changes.** On a refusal the player gets a chat line and nothing is given.
1. The user is valid, alive, not in a trade, a personal shop, a duel, a guild war/siege fight or a teleport, and not
   frozen or stoned. These are the teleport window's refusals.
2. `nJob` is the next tier's job for the current job (the table above), and the level rule holds.
3. If any class's chain in this tier is started or done, `nJob` must be one of those classes (the lock above).
4. **Bag space:** the reward items of every quest the window will complete (sex-matched, as `__EndQuest` counts them,
   minus tokens a later quest in the chain removes) fit `m_Inventory.GetEmptyCount()`. Otherwise the reply is V15's
   `TID_QUEST_NOINVENTORYSPACE`.

**Then, in this order:**
1. For each quest of the target's chain that is not yet done (state 14), oldest first: give its end rewards exactly as
   `__EndQuest` does: items with their flag (bound), gold, exp, skill points, pet level-up, PK, campus points. Then set
   it done with `__SetQuestState( …, QS_END )`, which sends the "Quest completed" line and the quest update.
   - **Removals:** the chain's `SetEndRemoveItem` takes only quest tokens (`IK3_EVENTMAIN`, e.g. `II_SYS_SYS_QUE_NTSKILL`,
     `…_HEROMARK`) the player holds. It never takes gems or other items. This covers Master's and Hero's gems (the owner:
     free) and Twinkle Stones / Forform, which may be the player's own.
2. Safety net for the case V15's teacher exception allows (two chains started): remove the other classes' **unfinished**
   chain quests of the same tier (`__RemoveQuest`, the quest window's "cancelled" line) and their tokens. A half-done
   second chain then can't hand out its gear after the change.
3. What the NPC script does after the quest:
   - **1st job:** `ChangeJob` + `InitStat`.
   - **2nd job:** `ChangeJob`.
   - **Master:** `ChangeJob` + `InitStat` + `SetLevel(60)` + `AddGPPoint(-120)`.
   - **Hero:** `ChangeJob` + `SetLevel(121)` + `AddGPPoint(15)`.

   Same calls, same updates to the client, the party, friends and the guild, same logs (`SendLogLevelUp( …, 4 )`,
   `SendUpdatePlayerData`).

**Why it is safe against double claims:**
- Every reward comes from a quest the window first finds unfinished, and the window then marks it done in the same
  call.
- A finished quest can never be started again (`CMover::SetQuest` refuses it).
- The NPC chains' next steps need the old job.
- No order of window and NPC gives a quest's rewards twice.

**Why it reads `propQuest.inc` instead of a table:** the owner's custom gear (job-change-rewards) and any later change to
those quests apply by themselves.

Files: `WORLDSERVER/DPSrvr.cpp/.h`, `_Network/MsgHdr.h`, a small `WORLDSERVER/QuickJobChange.h` holding the tier table and
chains. The patch: `patches/2026-11-20-quick-job-change.patch`, applied after the 19 patches already on main Source.
The exe is built from a Source copy, as before.

## Client (FlyffWeb)

**Packet:** `QUICK_JOB_CHANGE` 0x8fff0130 in `packages/protocol`, writer `int32 job`.

**The rules in one place:** `world/jobs/quickJobChange.ts`, pure functions:
- `dueTier(job, level, expPercent)` → `'first' | 'second' | 'master' | 'hero' | null`;
- `choices(job, tier, completedQuests)` → 4 slots, each `{ job, open | locked }`;
- the chains' quest ids, with tests.

**The window (`QuickJobChangeWindow`, a `ResWindow` with a `ResLayout`, as Teleport and Awaken):**
- **Title:** "Quick Job Change".
- **The row of 4 portraits:**
  - The picked one is in colour in a highlighted V15 frame; the others are grey.
  - Unused or locked slots show V15's `Icon_Lock` on a grey slot.
  - 1st job: Mercenary, Acrobat, Assist, Magician.
  - 2nd job: the line's two jobs, then two locks.
  - Master or Hero: the one job, then three locks.
  - A click picks a portrait.
- **The name:** in a V15 group box with a white, centred title.
- **The description:** a V15 text box with a scroll bar (`WndEditTile00`, `scroll`).
- **Under it:** the left/right arrows (V15's `ButtLeft` / `ButtRight`) step through the open jobs, and **Go!** sits
  between them.
- **Go!** opens the confirm box. A press waits up to 2 s for the job change before Go! works again (as Awaken's lock).
  The window closes when the job-change update arrives.

**The confirm box:** a modal V15 box as `AWAKEN_CONFIRM`, titled "Quick Job Change".
- It asks, for example: "Become a Mercenary? This can't be undone."
- Yes sends the packet; No closes the box.

**When it opens:**
- When an experience or level update makes a tier due.
- When the world is entered while a tier is due (each login).
- From Start → Extras → "Job Change" (applet 9007, after Redeem Code). When nothing is due, that line only says in the
  chat when the next change opens, for example "Your next job change opens at level 60."
- It doesn't pop up again in the same session after the player closes it, except from the menu.

**Phone:** the project's phone pattern for windows a Start line opens (Teleport/Awaken):
- A compact centred panel over the open bag (`overBag`).
- The 4 portraits stay in one row, smaller.
- The description scrolls.
- The silver phone buttons carry their words (`data-word`).
- The confirm box uses the same phone styling as Awaken's.
- A tap picks a portrait.

**Portraits (pictures made ahead):** 12 jobs × 2 genders = 24 PNGs.
- Drawn once by a script with the client's own renderer (the lobby's `render/portrait.ts` path): V15's model in the stand
  pose, with the first face and hair of character creation.
- Each wears that job's reward set and weapon:
  - 1st jobs: the Lv15 set and weapon.
  - 2nd jobs: the Lv60 set and Guardian weapon.
  - The tables are in `docs/2026-11-17-job-change-rewards-deploy.md`.
- Committed under `apps/client/src/icons/jobs/` and shipped with the build, as the own icons are. No convert.
- Master and Hero use their 2nd job's picture with V15's Master or Hero mark in a corner (`Icon_MasterMark1`,
  `Icon_HeroMark`, already converted).
- Grey is a CSS filter, so there's one file per job and gender.
- A new 32 × 32 Start-menu icon in the style of the Teleport/Awaken icons (same draw script).

**Descriptions:** clean English, built from V15's own job-quest NPC lines where they exist ("Acrobats are able to wield both
Bows and Yo-Yos", "Mercenaries are experts at close combat", "the role of an Assist … is primarily party support").
- Each one says the weapons, the role and one signature trait, in 3-4 short sentences.
- Master and Hero each get a short line on what the step gives (Master: master skills and a new level 60 start; Hero:
  hero skills and level 121).
- The 12 texts are written in the plan for the owner to read.

## Approaches considered

- **Where the "due" decision lives.**
  - **Chosen:** the client decides, because it already has the job, level, exp and completed quests. The World checks
    everything again on Go!.
  - Rejected: a server snapshot saying "due". It's more server code for no gain.
- **Rewards.**
  - **Chosen:** read the quest chains from the loaded quest props at run time.
  - Rejected: a reward table in the patch, which would drift from `propQuest.inc` and the owner's custom gear.
- **Portraits.**
  - **Owner picked:** pictures made ahead.
  - The alternative was live 3D drawing of the player's own character. It looks more personal, but it loads models in the
    window and needs WebGL there.

## My calls (the owner can overrule)

- Locked slots are filler that keeps the reference's 4-slot row; they mean "not available", not future jobs.
- The 1st job's Lv15 set and the 2nd job's Lv60 set are what the portraits wear, not V15's job uniforms.
- The Extras line with nothing due gives a chat line, not an empty window.
- The window never takes items, apart from quest tokens a finished quest would have taken anyway.
- A started chain locks the class, without V15's Madrigal-teacher exception.

## Left to the plan

- The exact layout rects, the portrait size and the frame pictures.
- How the render script drives the renderer (a dev entry vs. the e2e scripted world).
- The confirm box's phone CSS.
- The 2 s lock.
- The e2e specs (desktop + landscape phone) and the vitest files.

## Done means

- Branches `quick-job-change` in both repos: the window (desktop + phone), the confirm box, the portraits, the Start line,
  the World patch and a built `Program/7. World.exe`.
- typecheck clean, the related vitest and the World build passing.
- The e2e commands written out for the owner.
- A deploy doc with the VPS steps and the in-game checks.
- Nothing merged or pushed without the owner's word.
