# Quick Job Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A V15-look "Quick Job Change" window (desktop + phone) that pops up when a job change is due and, after a
V15 Yes/No box, has the World server change the job with exactly the V15 quest chains' rewards.

**Architecture:** The web client decides when a change is due (job, level, exp %, quest lists it already has) and sends
one new packet, 0x8FFF0130, with the picked job. A World patch checks everything again. It gives the end rewards of each
unfinished quest of that job's chain, read from the loaded `propQuest.inc` (so the owner's custom gear comes along), marks
them done, then repeats what the V15 NPC script does. The portraits are 24 PNGs rendered once, ahead of time, by a script
using the client's own lobby renderer.

**Tech Stack:** C++ (VS 2022 MSBuild, Release|Win32) for the World; TypeScript, Vitest (jsdom), Playwright (Chromium
desktop + Pixel 7 landscape) for FlyffWeb.

**Spec:** `docs/superpowers/specs/2026-11-20-quick-job-change-design.md` (FlyffWeb worktree).

**Worktrees and branches (both `quick-job-change`, nothing merged or pushed):**
- FlyffWeb: `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\quick-job-change`, from main 6283c23. Its
  `node_modules` comes from `npm ci`, and `dist` is copied in.
- Outer: `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash-worktrees\quick-job-change`, from main af7f41f. `Source\` is
  copied from main's Source (git-ignored; it already carries the 19 applied patches).

## Global Constraints

- Packet: `0x8FFF0130`, client → World, body `int32 nJob`. No answer packet: V15's own updates are the answer.
- Applet id `9007` (`AppId.QUICK_JOB_CHANGE`). Its Start-menu line is "Job Change", last in Extras, after Redeem Code.
- The window title is "Quick Job Change". The job name is never blue: it uses a group box (`group: 'WndEditTile200.tga'`,
  white title, `.is-centred`), as the Teleport window's `WIDC_STATIC1`.
- Tiers, as V15's NPC scripts check them:
  - 1st: Vagrant at Lv15.
  - 2nd: a 1st job (1-4) at Lv60.
  - Master: a 2nd job (6-13) at Lv120 with exp % 9999.
  - Hero: a Master (16-23) at Lv120 with exp % 9999.
- Targets:
  - 1st: 1-4.
  - 2nd: 1 → 6/7, 2 → 8/9, 3 → 10/11, 4 → 12/13.
  - Master: job + 10.
  - Hero: job + 8.
- Chains (quest ids from `Resource/defineQuest.h`, the last `#define` wins). The client uses these numbers; the server
  uses the `QUEST_*` macros:
  - Mercenary 151-154, Acrobat 53-56, Assist 155-158, Magician 159-162.
  - Knight 163-167, Blade 168-172, Jester 57-61, Ranger 62-66, Ringmaster 178-182, Billposter 173-177, Psykeeper 183-187,
    Elementor 188-192.
  - Master 5022, Hero 5023.
- Class lock: in the 1st and 2nd tiers, if any quest of a target's chain is in the player's current or completed quests,
  only such started targets may be picked. There is no Madrigal-teacher exception.
- After the quests, the NPC script's steps:
  - 1st: `ChangeJob` + `InitStat`.
  - 2nd: `ChangeJob`.
  - Master: `ChangeJob` + `InitStat` + `SetLevel(60)` + `AddGPPoint(-120)`.
  - Hero: `ChangeJob` + `SetLevel(121)` + `AddGPPoint(15)`.
- Items: the window never takes an item except quest tokens (`dwItemKind3 == IK3_EVENTMAIN`) named by a completed quest's
  `SetEndRemoveItem`.
- V15 look on both desktop and phone. Every new text is plain English. No convert: the pictures ship in `src/icons/`.
- The e2e test character Webby is a Lv15 Vagrant. The auto pop-up is off when `localStorage['flyffweb.jobPopup'] ===
  'off'`, which `playGateway` sets unless `options.jobPopup` is true.

## Review Focus

1. **A Lv15 Vagrant in every other e2e test:** the pop-up must not open in specs that don't ask for it. Expect them
   unchanged. Covered by Task 6 Step 1 (the harness switch) and by Task 7 running startMenu, teleportWindow and landscape.
2. **A full bag on Go!:** the World refuses with V15's `TID_QUEST_NOINVENTORYSPACE` and changes nothing. The window
   unlocks Go! after 2 s. Covered by the Task 1 in-game check list and by the Task 5 lock test.
3. **A double press or a slow server:** a second Go! within 2 s sends nothing. A second packet after the change finds no
   due tier and is refused. Covered by Task 5 `sends once` and by the Task 1 check 2.
4. **A half-done chain:** a Vagrant who started the Acrobat chain sees only Acrobat open. The server refuses a Mercenary
   packet from them. Covered by the Task 3 lock tests and by the Task 1 check 3.
5. **A phone in landscape at 568 × 320:** the window and its confirm box fit above the task bar and the description
   scrolls. Covered by Task 7 `expectWhole` on the phone project.

---

### Task 1: World patch — `OnQuickJobChange`

**Files (all in the outer worktree):**
- Create: `Source/WORLDSERVER/QuickJobChange.h`
- Modify: `Source/_Network/MsgHdr.h`, next to `PACKETTYPE_TELEPORT_WINDOW`
- Modify: `Source/WORLDSERVER/DPSrvr.h`, next to `OnTeleportWindow`
- Modify: `Source/WORLDSERVER/DPSrvr.cpp`: `ON_MSG` next to the teleport window's, and the handler after
  `OnTeleportWindow`
- Create: `patches/2026-11-20-quick-job-change.patch`
- Create: `Program/7. World.exe`, the built exe (force-added, as earlier branches did)

**Interfaces:**
- Produces: `#define PACKETTYPE_QUICK_JOB_CHANGE (DWORD)0x8FFF0130`, and
  `void CDPSrvr::OnQuickJobChange( CAr & ar, DPID dpidCache, DPID dpidUser, LPBYTE, u_long )`.

- [ ] **Step 1: Baseline the Source copy.** In `Source\` run `git init`, `git add -A`, and
  `git commit -m baseline`, the scratch git the teleporter worktree used. The patch is `git diff` from this baseline.

- [ ] **Step 2: Write `QuickJobChange.h`.** Its tables, with the `QUEST_*` and `JOB_*` macros:
  - `struct QJC_CHAIN { int nJob; int nFrom; int anQuest[5]; int nQuests; };`. `nFrom` is the job it starts from, or -1
    for "any Vagrant".
  - `g_aQjcFirst[4]`, `g_aQjcSecond[8]`.
  - `enum { QJC_NONE = -1, QJC_FIRST, QJC_SECOND, QJC_MASTER, QJC_HERO };`.

  Helpers. Copy the bodies from the named V15 functions:
  - `inline int QjcTier( CUser* p )`: the Global Constraints rule, using `IsBaseJob`, `IsExpert`, `IsPro`, `IsMaster`,
    `GetLevel` and `GetExpPercent`.
  - `inline BOOL QjcStarted( CUser* p, const QJC_CHAIN& c )`: any quest with `GetQuest( n ) != NULL ||
    IsCompleteQuest( n )`.
  - `inline void QjcInitStat( CUser* p )`: the body of `InitStat`, `_Common/ScriptLib.cpp:571`.
  - `inline void QjcChangeJob( CUser* p, int nJob )`: the body of `ChangeJob`, `ScriptLib.cpp:866`, from
    `AddChangeJob` on, with its `#if` blocks. Its level checks are already done by `QjcTier`.

- [ ] **Step 3: Write `OnQuickJobChange` in `DPSrvr.cpp`.** Order:
  1. `ar >> nJob`. The user is valid and in a world.
  2. `GetSummonState() != 0` → the same V15 lines as `OnTeleportWindow`. Frozen, stoned, sitting, `m_bAllAction ==
     FALSE` → `AddText( "You cannot change job now." )`.
  3. `QjcTier( pUser )` and the target table → otherwise `AddText( "No job change is waiting for you." )`.
     For Master and Hero the chain is `{ QUEST_MASTER }` or `{ QUEST_HERO }`.
  4. 1st and 2nd tiers only: the chains the player could pick are all 4 (1st) or the 2 with `nFrom == GetJob()` (2nd).
     If any of them `QjcStarted`, the picked chain must be started too. Otherwise `AddText( "You have already started
     another job's quests." )`.
  5. Remaining quests: the chain's quests with `!IsCompleteQuest( n )`, in order.
  6. Space: count the slots as `__EndQuest`'s first loop does (`_Common/ScriptHelper.cpp:257-293`) for every remaining
     quest. Skip a reward item whose id a **later** remaining quest lists in `m_nEndRemoveItemIdx`. If the count is more
     than `m_Inventory.GetEmptyCount()` → `AddDefinedText( TID_QUEST_NOINVENTORYSPACE )` and return.
  7. For each remaining quest, the rewards as `__EndQuest` gives them (`ScriptHelper.cpp:305-428`): items via
     `__CreateItem` with the ability option and flag, skipping step 6's items; pet level-up, gold (+`AddGoldText`), exp,
     skill points (+`SendLogSkillPoint`), PK, campus points.
     - Then the removals: for each `m_nEndRemoveItemIdx[i]` whose `ItemProp::dwItemKind3 == IK3_EVENTMAIN`, take what
       the player holds (`GetItemNum`, `RemoveItemA`). Skip every other item, and `m_nEndRemoveGold`.
     - No teleport (none of these quests has one).
     - Then `__SetQuestState( pUser->GetId(), nQuest, QS_END )`.
  8. Safety net, 1st and 2nd tiers: for each other chain from step 4, each quest that is current but not complete →
     `__RemoveQuest`. Also take the `IK3_EVENTMAIN` items that chain's quests name in `m_nEndRemoveItemIdx`.
  9. The NPC steps for the tier (Global Constraints). Use `QjcChangeJob`, `QjcInitStat`, `pUser->SetLevel( n )` +
     `g_dpDBClient.SendUpdatePlayerData( pUser )` (as `ScriptLib.cpp:1088`), and `pUser->AddGPPoint( n )`.

  Include `"ScriptHelper.h"` (or declare the `__` helpers it lacks) and `"QuickJobChange.h"`.

- [ ] **Step 4: Register the packet.**
  - `MsgHdr.h`: `PACKETTYPE_QUICK_JOB_CHANGE (DWORD)0x8FFF0130`, with a `// custom (owner 2026-11-20)` comment.
  - `DPSrvr.h`: the declaration.
  - `DPSrvr.cpp`: `ON_MSG( PACKETTYPE_QUICK_JOB_CHANGE, &CDPSrvr::OnQuickJobChange );`.

- [ ] **Step 5: Build.**
  Run (PowerShell, in the outer worktree):
  `& "C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe" Source\all\all.sln -t:WorldServer -p:Configuration=Release -p:Platform=Win32 -m`
  Expected: `0 Error(s)`, and no new warnings in `DPSrvr.cpp`. The output is
  `Output\WorldServer\Release\WorldServer.exe`.

- [ ] **Step 6: Make the patch and check it.**
  - In `Source\`: `git diff --src-prefix=a/Source/ --dst-prefix=b/Source/ > ..\patches\2026-11-20-quick-job-change.patch`.
    Include the new header: `git add -N` it first.
  - From the outer **main** root: `git apply --check <worktree>\patches\2026-11-20-quick-job-change.patch`.
    Expected: no output.

- [ ] **Step 7: Copy the exe and commit.**
  - Copy it to `Program\7. World.exe`.
  - Record its size and SHA-256 (`Get-FileHash`).
  - `git add -f "Program/7. World.exe"`, then add the patch.
  - Commit: `feat(world): Quick Job Change packet 0x8FFF0130 (CUSTOM)`.

**In-game checks** (go in the deploy doc in Task 8; the owner runs them in the VM):
1. A Lv15 Vagrant with a full bag: Go! gives V15's "inventory full" line, and nothing changes.
2. Mercenary from scratch: four "Quest completed" lines, 4,500 penya, 40 skill points, stats reset, the Petal/Flower set,
   weapons, shield, and the job is Mercenary. A second press is refused.
3. A Vagrant who started the Acrobat chain: a Mercenary packet is refused. Acrobat works.
4. Mercenary chain finished at the NPC but no job change yet: the window gives only the job, with no second gear set.
5. Knight at Lv60: 80 skill points, the Recorn set, the Guardian Big Sword.
6. Lv120 Knight at 99.99%: Knight Master at Lv60, with 400 skill points and the gems kept in the bag.
7. Then Hero at Lv120 99.99%: Lv121 Knight Hero.

---

### Task 2: Protocol — `QUICK_JOB_CHANGE`

**Files:**
- Modify: `packages/protocol/src/constants.ts` (after `TELEPORT_WINDOW: 0x8fff0120`)
- Create: `packages/protocol/src/world/quickJobChange.ts`
- Modify: `packages/protocol/src/index.ts` (an export line after teleportWindow's)
- Test: `packages/protocol/test/quickJobChange.test.ts`

**Interfaces:**
- Produces: `PacketType.QUICK_JOB_CHANGE = 0x8fff0130` and `encodeQuickJobChange(job: number): Uint8Array`, written as
  `clientPacket(PacketType.QUICK_JOB_CHANGE).i32(job).toBytes()`.

- [ ] **Step 1: Write the failing test** `encodes the picked job after DPID_UNKNOWN and the type`. Assert that
  `encodeQuickJobChange(2)`, read with a `DataView`, has u32 at 4 equal to `0x8fff0130` and i32 at 8 equal to `2`, as
  `teleportWindow.test.ts` does.
- [ ] **Step 2:** Run `npx vitest run packages/protocol/test/quickJobChange.test.ts`. Expected: FAIL (no export).
- [ ] **Step 3:** Add the constant (with a comment naming the outer patch), the encoder and the export.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(protocol): QUICK_JOB_CHANGE 0x8fff0130 (CUSTOM)`.

---

### Task 3: The rules — `quickJobChange.ts`

**Files:**
- Create: `apps/client/src/world/jobs/quickJobChange.ts`
- Test: `apps/client/test/quickJobChange.test.ts`

**Interfaces:**
- Produces:
  - `export type JobTier = 'first' | 'second' | 'master' | 'hero';`
  - `export interface JobSlot { job: number | null; open: boolean; }` (`job: null` is a filler lock)
  - `export function dueTier(job: number, level: number, expPercent: number): JobTier | null`
  - `export function jobSlots(job: number, tier: JobTier, started: (questId: number) => boolean): JobSlot[]`: always
    4 slots.
  - `export function nextChangeLevel(job: number): number | null`: 15 for a Vagrant, 60 for a 1st job, 120 for a 2nd job
    or a Master, null for a Hero.
  - `export const JOB_NAMES: ReadonlyMap<number, string>`: 1-4, 6-13, 16-31. Masters are "Knight Master", Heroes are
    "Knight Hero", and so on. 12 is "Psykeeper".
  - `export function jobDescription(job: number): string`
  - `export const JOB_CHAINS: ReadonlyMap<number, readonly number[]>`: target job → its quest ids (Global Constraints).

- [ ] **Step 1: Write the failing tests.**
  - `dueTier`:
    - `(0, 15, 0)` → `'first'`; `(0, 14, 9999)` → `null`.
    - `(1, 60, 0)` → `'second'`.
    - `(6, 120, 9999)` → `'master'`; `(6, 120, 9998)` → `null`.
    - `(16, 120, 9999)` → `'hero'`; `(24, 121, 9999)` → `null`.
  - `jobSlots(0, 'first', () => false)` → jobs `[1, 2, 3, 4]`, all open.
  - `jobSlots(0, 'first', (q) => q === 53)` → only job 2 open; Acrobat BFTRN started.
  - `jobSlots(1, 'second', () => false)` → `[6, 7, null, null]`, with the nulls closed.
  - `jobSlots(3, 'second', (q) => q === 182)` → 11 closed and 10 open; Ringmaster's last quest done.
  - `jobSlots(6, 'master', ...)` → `[16, null, null, null]`; `jobSlots(17, 'hero', ...)` → `[25, null, null, null]`.
  - `jobDescription(1)` contains "close combat"; `jobDescription(16)` contains "level 60"; `jobDescription(24)`
    contains "level 121".
  - `nextChangeLevel` gives 15, 60, 120, 120, null for jobs 0, 1, 6, 16, 24.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/quickJobChange.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The description texts, exactly:
  - 1 Mercenary: "Mercenaries are experts at close combat. A sword strikes fast for steady damage; an axe hits harder
    but slower, and both go well with a shield. Their skills stop an enemy's movement so it stays within reach. At level
    60 a Mercenary becomes a Knight or a Blade."
  - 2 Acrobat: "Acrobats are the most versatile fighters: a bow strikes from long range and a yo-yo fights up close.
    They are quick on their feet and can pull a distant enemy right up to them. At level 60 an Acrobat becomes a Jester
    or a Ranger."
  - 3 Assist: "The Assist's role is party support: heals that keep allies standing and buffs that make the whole group
    stronger. With a stick or a pair of knuckles, an Assist can also hold their own in a fight. At level 60 an Assist
    becomes a Ringmaster or a Billposter."
  - 4 Magician: "Magicians defeat their enemies with magic. A wand fires a charged blast from a distance, and a staff
    can also be swung up close. Their spells call on fire, water, wind, earth and lightning. At level 60 a Magician
    becomes a Psykeeper or an Elementor."
  - 6 Knight: "Knights wield two-handed swords and axes and wear the heaviest armour. They stand at the front, draw
    enemies onto themselves and take hits no one else could, while their great swings strike several foes at once."
  - 7 Blade: "Blades carry a weapon in each hand and attack faster than any other class. They give up defence for a
    relentless stream of hits, tearing down a single target before it can react."
  - 8 Jester: "Jesters fight with yo-yos and live for the critical hit. Their tricks weaken and poison enemies, and
    their sudden strikes can end a fight in a few blows."
  - 9 Ranger: "Rangers are masters of the bow. They strike from far away with piercing, poisoned and elemental arrows,
    and keep their enemies at a distance while they fire."
  - 10 Ringmaster: "Ringmasters are the party's healers. With a stick in hand they restore health, bring fallen allies
    back and cast the strongest protective buffs in Madrigal."
  - 11 Billposter: "Billposters fight with knuckles. They pour support magic into themselves, turning powerful buffs
    into raw strength, and trade blows up close where other supporters cannot."
  - 12 Psykeeper: "Psykeepers wield wands and the power of the mind. They curse and weaken their enemies, and their
    psychic blasts strike whole groups at once."
  - 13 Elementor: "Elementors wield staves and command fire, water, wind, earth and lightning. Their spells hit many
    enemies at once with great elemental damage."
  - 16-23 Master: "Become a {2nd job} Master. You start again from level 60 with your stats reset, and gain your Master
    skill and 400 skill points."
  - 24-31 Hero: "Become a {2nd job} Hero. You go straight to level 121 and gain your Hero skill."
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): Quick Job Change rules (CUSTOM)`.

---

### Task 4: The portraits and the Start-menu icon

**Files:**
- Create: `apps/client/e2e/jobPortraitHarness.html`, `apps/client/e2e/jobPortraitHarness.ts`. These are dev-server pages,
  as `lobbyHarness`; vite doesn't ship them.
- Create: `apps/client/scripts/renderJobPortraits.ts`
- Create: `apps/client/src/icons/jobs/job{1,2,3,4,6,7,8,9,10,11,12,13}_{m,f}.png` (24 files)
- Modify: `apps/client/scripts/drawWindowIcons.ts`, adding `icon_jobchange`
- Create: `apps/client/src/icons/icon_jobchange.png`, `apps/client/src/icons/bare/icon_jobchange.png`
- Modify: `apps/client/src/world/hud/ownIcons.ts`, adding `OWN_ICON_FILES.jobChange` and the 24 portraits as
  `ui/jobs/job<N>_<m|f>.png`, in the same way the own icons map
- Test: `apps/client/test/ownIcons.test.ts` (extend it, or the hud test that counts `OWN_ICONS`)

**Interfaces:**
- Produces: `export function jobPortraitKey(job: number, sex: number): string` in `ownIcons.ts`. It maps a Master or
  Hero to its 2nd job, so it returns, for example, `ui/jobs/job6_m.png` for 6, 16 and 24 with sex 0.

- [ ] **Step 1: The harness page.** It reads `?job=&sex=` and builds a `CharacterSummary` from `newCharacterSummary(
  { sex, hairMesh: 0, headMesh: 0 })` (`lobby/lobbyPortraits.ts`). Its equipment is the table below, its job is `job`
  and its level is 60. It renders that one summary with `selectPortraits(element, [summary], () => 0)`. After 30 frames
  it sets `document.body.dataset.ready = '1'`.

  The gear, item ids from `Resource/defineItem.h`. "+" lists every item worn; the set is helmet, suit, gauntlets,
  boots.

  | Job | Male set ids | Female set ids | Held |
  |---|---|---|---|
  | 1 | 18004-18007 | 18000-18003 | 22002 + shield 7001 |
  | 2 | 18012-18015 | 18008-18011 | 22014 |
  | 3 | 18020-18023 | 18016-18019 | 22017 + 7001 |
  | 4 | 18028-18031 | 18024-18027 | 22020 + 7001 |
  | 6 | 22066-22069 | 22070-22073 | 22030 |
  | 7 | 22066-22069 | 22070-22073 | 22026 (both hands, if the look takes two) |
  | 8 | 22074-22077 | 22078-22081 | 22054 |
  | 9 | 22074-22077 | 22078-22081 | 22050 |
  | 10 | 22082-22085 | 22086-22089 | 22046 |
  | 11 | 22082-22085 | 22086-22089 | 22042 + 7005 |
  | 12 | 22090-22093 | 22094-22097 | 22058 + 7005 |
  | 13 | 22090-22093 | 22094-22097 | 22062 |

- [ ] **Step 2: The render script.** It runs against `npm run dev:client` on `E2E_CLIENT_PORT` (default 5187, never
  5174). It opens the harness for each job and sex and waits for `data-ready`. It reads the `.cs-portrait canvas`.
  - Crop: head to hips, from the full 158 × 238 slot. Pick one fixed rect so the head sits about 12 % from the top, and
    write it in the script.
  - Scale to **176 × 216** (2× the 88 × 108 picture area) and write the PNGs with a transparent background.

  Run: `npx tsx apps/client/scripts/renderJobPortraits.ts`. Expected: 24 files.
- [ ] **Step 3: Look at them.** Put them on one sheet (Chromium screenshot or a small HTML page) and check each one: the
  right gender, the set worn, the weapon held, nothing cut off. Fix the crop and run Step 2 again if needed. Save the
  sheet to the shared notes folder `quick-job-change/portraits-sheet.png`.
- [ ] **Step 4: The Start-menu icon.** A 32 × 32 icon in the Teleport/Awaken style (same rim and orb): a gold upward
  arrow over a crossed sword and staff. Write the framed and the `bare/` copies.
  Run: `npx tsx apps/client/scripts/drawWindowIcons.ts`.
- [ ] **Step 5: Test `jobPortraitKey`.** Write the failing test (`(6,0)`, `(16,0)` and `(24,0)` → `ui/jobs/job6_m.png`;
  `(3,1)` → `ui/jobs/job3_f.png`) and the `OWN_ICONS` count. Implement, then run
  `npx vitest run apps/client/test/hud.test.ts apps/client/test/ownIcons.test.ts`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(client): job portraits rendered from V15 models + Job Change icon (CUSTOM)`.

---

### Task 5: The window and the confirm box

**Files:**
- Create: `apps/client/src/world/jobs/quickJobChangeWindow.ts`
- Modify: `apps/client/src/style.css`, the desktop rules: `.hud-quick-job` and `.hud-quick-job-confirm`
- Test: `apps/client/test/quickJobChangeWindow.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: Task 3 (`dueTier`, `jobSlots`, `JOB_NAMES`, `jobDescription`, `JobTier`) and Task 4 (`jobPortraitKey`).
- Produces:
  ```ts
  export interface QuickJobHost {
    job(): number; level(): number; expPercent(): number; sex(): number;
    started(questId: number): boolean;
    say(text: string): void;
    send(job: number): void;
  }
  export const QUICK_JOB_LAYOUT: ResLayout;    // title 'Quick Job Change', width 432, height 336
  export const QUICK_JOB_CONFIRM: ResLayout;   // title 'Quick Job Change', width 336, height 156, modal
  export class QuickJobChangeWindow {
    constructor(host: QuickJobHost, art: UiArt, doc?: Document);
    readonly element: HTMLElement;
    get isOpen(): boolean;
    open(): boolean;        // opens when a tier is due; false (and nothing shown) when none
    toggle(): void;         // the Start line: open, close, or with nothing due host.say(`Your next job change opens at level ${n}.`)
    close(): void;
    jobChanged(): void;     // closes both boxes and clears the lock
  }
  ```

**Layout** (client-area rects, as the Teleport layout):
- `WIDC_CUSTOM1`-`4`, the portraits: `[12,8,104,120]`, `[112,8,204,120]`, `[212,8,304,120]`, `[312,8,404,120]`.
- `WIDC_STATIC1`, the name group box: `[12,128,404,146]`.
- `WIDC_TEXT1`, the description: `[12,152,404,250]`, `tile: 'WndEditTile00.tga'`, `scroll: true`.
- `WIDC_LEFT` (`ButtLeft.bmp`) at `[12,262]` and `WIDC_RIGHT` (`ButtRight.bmp`) at `[380,262]`, each the size of its
  picture's quarter.
- `WIDC_GO`, a custom area `[168,258,248,284]` holding a `textButton(doc, 'Go!', …)`, styled as the V15 text buttons
  (`data-word="Go!"` for the phone).

The confirm box: `WIDC_TEXT1 [10,10,318,84]`, then `yes`/`no` at `[74,96,146,116]` and `[182,96,254,116]`, using
`itemWindowLayouts.ts`'s helpers. Export them from there, or copy the two lines.

**Each portrait slot:**
- `role="radio"`, `aria-label` = the job name, or "Locked".
- `data-job`; `aria-checked` on the picked one.
- An `<img>` of `art.url(jobPortraitKey(job, sex))`.
- Picked: a 2 px `#f09a3c` frame with a 1 px light inner line. Otherwise `filter: grayscale(1) brightness(0.9)` and a
  `#9aa4b4` frame.
- Locked or filler: a grey slot with `ui/icon_lock.png` centred, and never picked.
- Master or Hero: the 2nd job's picture plus `ui/icon_mastermark1.png` or `ui/icon_heromark.png`, 22 px, bottom right.

**Behaviour:**
- `open()` picks the first open slot.
- A slot click (after a press inside the window, as Teleport's `pressed` guard) or an arrow picks the next or previous
  open slot, wrapping.
- The name and the description follow the pick.
- Go! opens the confirm box: "Become a {name}? This can't be undone." Use "an" before a vowel ("an Acrobat", "an
  Assist", "an Elementor").
- Yes → `host.send(job)`, Go! disabled for 2,000 ms (the `LOCK_MS` of `awakenWindow.ts`), and the box closes. No closes
  the box.
- The window sets `frame.overBag = true`.

- [ ] **Step 1: Write the failing tests.**
  - `a Lv15 Vagrant sees four portraits, Mercenary picked, its name and description`.
  - `the right arrow picks Acrobat; a click on Magician picks it`.
  - `an Acrobat chain started: only Acrobat is open and picked; the others are locked`.
  - `a Mercenary at 60 sees Knight, Blade and two locks`.
  - `a Knight at 120/9999 sees Knight Master with the Master mark`.
  - `Go! asks "Become an Acrobat? This can't be undone."; No sends nothing; Yes sends 2 once`.
  - `sends once`: a second Yes within 2,000 ms (fake timers) sends nothing; after 2,000 ms Go! works again.
  - `open() with nothing due returns false and shows nothing`.
  - `toggle() at Lv14 says "Your next job change opens at level 15."`.
  - `jobChanged() closes both boxes`.
  - `the name is in the group box (white title), not a plain static`: `WIDC_STATIC1` has the group tiles.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/quickJobChangeWindow.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the class and the desktop CSS.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): Quick Job Change window and confirm box (CUSTOM)`.

---

### Task 6: Wiring — pop-up, Start → Extras, packet

**Files:**
- Modify: `apps/client/src/world/hud/applets.ts`: `AppId.QUICK_JOB_CHANGE: 9007`, and the applet
  `applet('APP_QUICK_JOB_CHANGE', OWN_ICON_FILES.jobChange, 'Job Change')`.
- Modify: `apps/client/src/world/hud/taskBar.ts`:
  - `WINDOWS`: `[AppId.QUICK_JOB_CHANGE, 'quickJob']`;
  - the Extras folder: `{ id: AppId.QUICK_JOB_CHANGE, text: 'Job Change' }` after Redeem Code;
  - the `TaskBarWindow` type gains `'quickJob'`.
- Modify: `apps/client/src/world/WorldSession.ts`:
  `sendQuickJobChange(job: number): void { this.playingCache()?.send(encodeQuickJobChange(job)); }`.
- Modify: `apps/client/src/world/WorldScreen.ts`:
  - Create the window next to `teleportWindow`. Its host reads `this.own` (`job`, `level`, `sex`, `expPercent(own.exp,
    expNeeded(data.exp, own.level))` from `world/sim/params.ts`, and `started` from `own.quests.has(id) ||
    own.completedQuests.includes(id)`).
  - Append its element with the other windows.
  - `if (window === 'quickJob') { this.quickJobWindow?.toggle(); return; }`.
  - The pop-up.
- Modify: `apps/client/e2e/worldHarness.ts`: `GatewayOptions.jobPopup?: boolean`. `playGateway` runs
  `page.addInitScript(() => { try { localStorage.setItem('flyffweb.jobPopup', 'off'); } catch {} })` unless
  `options.jobPopup === true`.
- Test: `apps/client/test/hud.test.ts` (the Extras folder lists "Job Change" after "Redeem Code"),
  `apps/client/test/quickJobPopup.test.ts`.

**Interfaces:**
- Produces: in `quickJobChange.ts`, `export function shouldPopUp(before: JobTier | null, now: JobTier | null, login:
  boolean, dismissed: boolean, off: boolean): boolean`. It is true when `!off && now !== null && (login || before !==
  now) && !dismissed`. `WorldScreen` keeps `before`, and `dismissed` (set when the player closes the window, cleared when
  the tier changes).

**When it is called:**
- After `apply()` has handled a `setExperience`, `setJobSkill` or quest message for the own player.
  - On `setJobSkill`, also `quickJobWindow.jobChanged()`.
- Once at the end of the first drawn frame (`resolveShown`), with `login = true`.
- `off` reads `localStorage['flyffweb.jobPopup'] === 'off'`, wrapped in try/catch.

- [ ] **Step 1: The harness switch first.** Edit `worldHarness.ts`. Then grep `apps/client/e2e` for specs that enter the
  world without `playGateway` (`startEntering(`, `enterFlaris(` with their own `routeWebSocket`), and give each the same
  init script.
- [ ] **Step 2: Write the failing tests.**
  - `shouldPopUp`:
    - `(null, 'first', false, false, false)` → true;
    - `('first', 'first', false, false, false)` → false;
    - `('first', 'first', true, false, false)` → true;
    - `(null, 'first', true, true, false)` → false;
    - `(null, 'first', true, false, true)` → false.
  - hud.test: the Extras submenu's labels are `['Pet Filter', 'Awaken', 'Teleport', 'Redeem Code', 'Job Change']`.
- [ ] **Step 3:** Run `npx vitest run apps/client/test/quickJobPopup.test.ts apps/client/test/hud.test.ts`.
  Expected: FAIL.
- [ ] **Step 4:** Implement the wiring.
- [ ] **Step 5:** Run the tests again, plus `npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 6:** Commit: `feat(client): Quick Job Change pops up when due, Start → Extras → Job Change (CUSTOM)`.

---

### Task 7: Phone layout and the e2e spec

**Files:**
- Modify: `apps/client/src/style.css`. A `@media (max-width: 1000px) and (pointer: coarse)` block for `.hud-quick-job`
  and `.hud-quick-job-confirm`, after the `.hud-teleport` phone block, whose frame, caption, close, pale backing and
  silver buttons it copies. The panel:
  - centred, `width: min(560px, calc(100% - 16px))`, `max-height` above the task bar;
  - the 4 portraits in one row, each `min(22%, 104px)` wide at 88:108;
  - then the name, then the description (`max-height: 72px`, scrolls);
  - then the arrows and Go! (the 96 × 30 silver `data-word` button);
  - the confirm box as Awaken's on the phone.
- Create: `apps/client/e2e/quickJobChange.spec.ts`

- [ ] **Step 1: Write the spec.** It uses `playGateway(page, script, { jobPopup: true })` and `enterFlaris`. Tests:
  - `pops up for a Lv15 Vagrant; Acrobat; Yes sends 0x8fff0130 with 2; SET_JOB_SKILL closes it`.
    - Expect `.hud-quick-job` visible on entry, with title "Quick Job Change" and 4 `[role="radio"]`.
    - The right arrow, then the name is "Acrobat"; `expectWhole` (copy it from `teleportWindow.spec.ts`).
    - Go!, then the confirm text, then Yes.
    - `sentOf(gateway, 0x8fff0130)` holds one packet with `readInt32LE(8) === 2`.
    - Push `writeSetJobSkill(SELF_ID, 2, …)` as a cache packet; the window is hidden.
    - Screenshots to `info.outputPath('quick-job-desktop.png' | 'quick-job-phone.png')`, and one with the confirm box
      open.
  - `a Lv14 Vagrant: no pop-up; Start → Extras → Job Change says the next change opens at level 15`. Use the script with
    `level: 14`.
  - `without jobPopup the window stays shut`: the default `playGateway`, then `.hud-quick-job` is hidden after `enterFlaris`.
- [ ] **Step 2: Run it.** Start the dev server on a free port. The owner's dev server holds 5174.
  Run: `$env:E2E_CLIENT_PORT='5187'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone quickJobChange startMenu teleportWindow landscape`
  Expected: all pass. The phone-only Start-menu test is skipped on desktop.
- [ ] **Step 3: Look at the screenshots.**
  - Desktop and phone both look V15.
  - The name is white.
  - Nothing is cut off at the Pixel 7 landscape size.

  Copy the four screenshots to the shared notes folder `quick-job-change/`.
- [ ] **Step 4:** Commit: `feat(client): Quick Job Change on phones + e2e (CUSTOM)`.

---

### Task 8: Docs, checks and hand-over

**Files:**
- Create (outer): `docs/2026-11-20-quick-job-change-deploy.md`. It covers:
  - what changed;
  - the exe's size and SHA-256;
  - the patch order: after the 19 on main Source;
  - the VPS steps: stop World; back up `C:\FlyFF\Program\7. World.exe` to `C:\FlyFF\old-20261120-quickjob\`; copy the new
    exe; check the hash; start; the FlyffWeb package with `deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`; no
    convert, no gear sync;
  - the rollback;
  - Task 1's in-game checks.
- Create (FlyffWeb): `docs/2026-11-20-quick-job-change.md`, the hand-over. It covers:
  - the files;
  - the test switch `flyffweb.jobPopup`;
  - how to re-render the portraits;
  - the owner's full e2e command;
  - the known limits (portraits are generic faces; the quest window still doesn't list the custom gear).
- Create: the shared notes folder's `quick-job-change-handover.md`, in the format of the other `*-handover.md` there.

- [ ] **Step 1: The quick checks.** Run `npm run typecheck` and
  `npx vitest run apps/client/test packages/protocol/test`. Expected: clean, all pass. If anything unrelated fails, run
  it alone and note it, as earlier hand-overs did.
- [ ] **Step 2: Write the three docs.** The owner's full e2e command goes in both hand-overs:
  `$env:E2E_CLIENT_PORT='5187'; npm run test:e2e:client`. Pass criteria: every test passes except known flakes listed in
  earlier hand-overs.
- [ ] **Step 3:** Commit in each repo: `docs(quick-job-change): deploy steps and hand-over`.
- [ ] **Step 4: Final review.** One fresh reviewer reads the whole diff of both branches against the spec. Fix every
  Critical or Important finding, then re-run Step 1.
