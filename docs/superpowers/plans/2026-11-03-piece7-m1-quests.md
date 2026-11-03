# Piece 7 M1 — Quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any ordinary NPC quest can be taken, followed and handed in. The browser reads and keeps the character's quests
as Neuz does, and shows them in the V15 quest window, its detail window and the on-screen tracker, with Neuz's chat
lines, abandon and check boxes, and the world-map destination mark.

**Architecture:**
- Task 1: the protocol learns the own quest lists in ADD_OBJ, the five quest snapshots and the two quest packets.
- Task 2: the converter writes an optional `data/quests.json` from the five quest files Neuz loads, and the windows'
  pictures.
- Task 3: DOM-free modules port `__IsEndQuestCondition`, the condition and reward rows, and the quest tree.
- Task 4: `OwnState` keeps the quest state and reports its changes as events; a module turns them into Neuz's lines.
- Tasks 5-7: three HUD pieces, the quest window (list and detail), the tracker, and the world map's destination mark.
- Task 8 wires them into `WorldScreen`, fills M0's `QuestLookup`, and adds a browser spec.
- Task 9 writes the checklist and the checkpoint.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for DOM tests), Playwright (Chromium), the FlyffWeb converter.

**Spec:** `docs/superpowers/specs/2026-11-03-piece7-design.md` §3.2 (M1), §4, §5 (M1 row), §7 (M1). Research (cited as
`[R §n]`): `docs/superpowers/specs/2026-11-03-piece7-m1-quests-research.md`. C++ paths are relative to
`Blouflash VS22 V15/Source/`.

## Global Constraints

- No server or gateway change: every packet is one Neuz sends, with Neuz's bytes [R §3].
- Each new module opens with the C++ it copies as a `Function  File:lines  what` table (as `hud/dialogue/dialogWindow.ts`).
- Server and catalog text goes into the page with `textContent` or the M0 text runs (`parseDialogText`), never as markup.
- Strings come from `data.texts` by TID name, with the English of [R §6] as the fallback.
- The phone rule is `(max-width: 1000px) and (pointer: coarse)`; phone text at least 14 px.
- Custom server features, party quests and guild quests are out of scope.
- No new dependency.
- Builders run `npx vitest run <the task's test files>`, `npm run typecheck`, and at most the one browser spec their task
  changes, through `.superpowers/sdd/e2e-5175.config.ts` (chromium and phone). The owner's `dev:client` holds 5174:
  never stop it.
- Corpus tests run with `FLYFF_CLIENT=C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client`.

## Review Focus

1. **A quest the catalog does not know** (or no `quests.json` at all):
   - it is still listed (as "Quest <id>"), its kill counts still print, and nothing throws;
   - the dialogue's rows fall back to the server's titles, as in M0.

   Test: Task 3 Step 1, "an unknown quest is a General leaf titled by its id"; Task 8 Step 1, "without a catalog the
   world still enters".
2. **A sixth check box.**
   - A sixth tick sends nothing and prints `TID_GAME_ERROR_DONT_CHECK`.
   - The box stays as the server's QUEST_CHECKED says, not as the click left it.

   Test: Task 5 Step 1, "a sixth tick sends nothing and says why".
3. **Abandoning what cannot be abandoned.** An ended quest, a `noRemove` quest, or any quest while the NPC dialogue is
   open has the button disabled. The confirm box sends only on OK.

   Test: Task 5 Step 1, "abandon is offered only for a removable current quest".
4. **A phone at 750 × 342.**
   - The quest window is a full-screen panel, list and detail both reachable.
   - The tracker sits clear of the joystick, the task bar and the shortcuts, and scrolls past three quests.

   Test: Task 8 Step 5 (`quests.spec.ts`, phone project).
5. **A world change or a reconnect.** The quest state comes again from the new ADD_OBJ. The windows rebuild from it, the
   tracker keeps the checked quests, and no listener is left over.

   Tests:
   - Task 4 Step 1, "a new OwnState takes the quests from ADD_OBJ";
   - Task 5 Step 1, "dispose removes both windows and their listeners";
   - Task 6 Step 1, "dispose removes it";
   - Task 8 Step 3, where `disposeWorld` calls both.

---

## Setup (once)

- [ ] Work in `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece7` on branch `piece7-m1` (cut from main
  4517c3a). `npm ci` and `dist\assets` are already in place there (M0).

---

### Task 1: The quest messages and packets, as Neuz has them

**Files:**
- Create: `packages/protocol/src/world/quest.ts`
- Modify:
  - `packages/protocol/src/world/addObj.ts:181-183` (read the three lists);
  - `packages/protocol/src/world/types.ts:217-258` (`OwnCharacter`), `:13-122` (`WorldMessage`);
  - `packages/protocol/src/world/readers.ts:31-85`;
  - `packages/protocol/src/constants.ts:6-64` (`PacketType.REMOVEQUEST`, `QUEST_CHECK`);
  - `packages/protocol/src/messages/world.ts:238-262`, `:325-407` (decode the two packets for the pretend servers);
  - `packages/protocol/src/index.ts`;
  - `packages/testkit/src/world.ts:612-652` (`writeAddSelf` writes the lists), plus three new writers;
  - `packages/testkit/src/newVagrant.ts`;
  - `apps/client/src/world/WorldSession.ts`.
- Test: `packages/protocol/test/quest.test.ts` (create); `packages/protocol/test/addObj.test.ts:375-381` (assert the
  values); `apps/client/test/worldSession.test.ts`

**Interfaces:**
- Produces:

```ts
/** `QUEST` (_Common/Mover.h:261-279), 12 bytes raw. `time` is m_wTime as sent (bit 15 = all met). */
export interface OwnQuest { id: number; state: number; time: number; kills: [number, number]; patrol: boolean; dialog: boolean }
export const QS_END = 14;
export function readQuest(r: ArReader): OwnQuest;
export function writeQuest(w: ArWriter, quest: OwnQuest): ArWriter;   // for the testkit and tests
// OwnCharacter gains: quests?: OwnQuest[]; completedQuests?: number[]; checkedQuests?: number[]
// WorldMessage gains:
//   { type: 'setQuest'; quest: OwnQuest }                                   0x00b0, to the player
//   { type: 'removeQuest'; kind: number; questId: number }                  0x003a  (-1, 0, 1, 2)
//   { type: 'questTextTime'; flag: boolean; state: number; ms: number }     0x00ba
//   { type: 'questHelperNpcPos'; pos: [number, number, number] }            0x9400
//   { type: 'questChecked'; quests: number[] }                              0x8820
export function encodeRemoveQuest(questId: number): Uint8Array;               // 0x00ff0026, u32 id
export function encodeQuestCheck(questId: number, check: boolean): Uint8Array; // 0x88100110, i32 id, i32 0|1
// WorldSession: sendRemoveQuest(questId: number): void; sendQuestCheck(questId: number, check: boolean): void
// testkit: writeSetQuest(objectId, quest), writeRemoveQuest(kind, questId), writeQuestChecked(quests): ScriptMessage
```

- [ ] **Step 1: Write the failing tests** (`quest.test.ts`):
  - `'reads a QUEST as Neuz lays it out'`: bytes `0e 00 | 05 80 | 97 00 | 03 00 | 00 00 | 03 00` give
    `{ id: 151, state: 14, time: 0x8005, kills: [3, 0], patrol: true, dialog: true }`. `writeQuest` gives the bytes back.
  - `'reads the five quest snapshots'`:
    - SETQUEST: a 12-byte QUEST.
    - REMOVEQUEST: `i32 -1, u32 151` gives `{ kind: -1, questId: 151 }`.
    - QUEST_TEXT_TIME: `i32 1, i32 2, u32 60000`.
    - QUESTHELPER_NPCPOS: 3 × f32.
    - QUEST_CHECKED: `u8 2, u16 151, u16 83`.
    - Each is followed by `u32 0xdeadbeef`, read back.
  - `'the abandon and check packets are Neuz's'`:
    - `encodeRemoveQuest(151)` is `DPID_UNKNOWN, 0x00ff0026, u32 151`.
    - `encodeQuestCheck(83, true)` is `…0x88100110, i32 83, i32 1`.
  - `addObj.test.ts:375-381`: the own ADD_OBJ's `quests`, `completedQuests` and `checkedQuests` equal what the test
    writes.
- [ ] **Step 2: Run them to see them fail.**
  `npx vitest run packages/protocol/test/quest.test.ts packages/protocol/test/addObj.test.ts` — FAIL.
- [ ] **Step 3: Implement** what the Interfaces block lists, in the order [R §2] gives.
  - `writeAddSelf` writes `own.quests ?? []` and the two lists through `writeQuest`.
  - `newVagrantOwn` leaves them empty.
  - Register the five readers by their raw ids.
  - `decodeClientPacket` gives `{ type: 'removeQuest', questId }` and `{ type: 'questCheck', questId, check }`.
- [ ] **Step 4: Run** those tests and `apps/client/test/worldSession.test.ts` (add one test that each sender writes its
  bytes), then `npm run typecheck`. Expected: PASS and exit 0.
- [ ] **Step 5: Commit** `feat(protocol): the own quests, the quest snapshots and the abandon and check packets`.

### Task 2: The quest catalog and the windows' pictures

**Files:**
- Create: `packages/formats/src/inc/propQuest.ts`, `packages/formats/src/web/quests.ts`
- Modify:
  - `packages/formats/src/index.ts`;
  - `tools/convert/src/data/gameDataStage.ts` (an optional catalog beside the world map's, `:557-576`);
  - `tools/convert/src/ui/uiStage.ts` (`THEME_FILES`).
- Test: `packages/formats/test/propQuest.test.ts` (create), `packages/formats/test/gameData.corpus.test.ts`,
  `tools/convert/test/gameDataStage.test.ts`, `tools/convert/test/uiStage.test.ts`

**Interfaces:**
- Produces (in `@flyffweb/formats`):

```ts
export const QUESTS_KEY = 'data/quests.json';
export const QUEST_FILES = ['propQuest.inc', 'propQuest-RequestBox.inc', 'propQuest-Scenario.inc',
  'propQuest-RequestBox2.inc', 'propQuest-DungeonandPK.inc'] as const;               // Masquerade.prj:116-123
export const QUEST_KIND = { SCENARIO: 6000, NORMAL: 6001, REQUEST: 6002, EVENT: 6003 } as const; // definequest.h:507-510
export interface WebQuestGoal { x: number; z: number; text: number }                 // QuestGoalData, Project.h:71-79
export interface WebQuestItem { sex: number; type: number; jobOrItem: number; item: number; count: number; goal?: WebQuestGoal }
export interface WebQuest {
  id: number; title: string; head: number;              // head after the 1800-1999 remap (Project.cpp:2329-2364)
  npc?: string; endNpc?: string; endGoal?: WebQuestGoal;
  levelMin?: number; levelMax?: number; jobs?: number[];
  noRemove?: true; repeat?: true;
  limitTime?: number;
  kills?: { mover: number; count: number; goal?: WebQuestGoal }[];
  items?: WebQuestItem[]; oneItems?: WebQuestItem[];
  patrol?: { world: number; name: string; goal?: WebQuestGoal };
  dialog?: { npc: string; key: string; goal?: WebQuestGoal };
  endLevel?: [number, number]; endGold?: number; endExpPercent?: [number, number]; endSkill?: [number, number];
  endState?: number; endCompleteQuests?: { oper: number; quests: number[] };
  /** End terms set to anything but their default that the browser cannot judge (party, guild, pet, disguise, TSP). */
  unsupported?: string[];
  rewards?: { items?: WebQuestItem[]; gold?: [number, number]; exp?: [number, number]; skillPoints?: number;
    pk?: [number, number]; hidden?: true };
  states: Record<number, string>;                       // state N { SetDesc }
}
export function readPropQuest(text: string, defines: ReadonlyMap<string, number>, strings: ReadonlyMap<string, string>,
  file: string): WebQuest[];
```

  A title-only node (a folder, 1992-1997 and 6000-6060) is a `WebQuest` with no conditions.

- [ ] **Step 1: Write the failing tests:**
  - `propQuest.test.ts`, on fixture text copied from [R §1]'s two examples (keep the `IDS_` names and give the string
    map their English):
    - `'reads the Mercenary's first quest'`: id 151, title "The Path of the Mercenary", head 6051, npc and endNpc
      `MaFl_Mustang`, endGoal `{ x: 7153, z: 3244, text: 1 }`, levels 15-15, jobs `[0]`, a kill of `MI_AIBATT1`
      ×10 with goal `{ x: 7128, z: 3333, text: 1 }`, gold `[1500, 1500]`, states `{ 0: 'Slay 10 …', 14: '' }`.
    - `'reads an item quest'`: `QUEST_FIND_REDBANGT` (83) with its item ×1 (sex −1, type 0, jobOrItem −1),
      `endLevel [30, 129]` and head 6004.
    - `'remaps the old head ids to the four kinds'`: 1992 → 6003; 1993 → 6001; 1996 → 6000; 1999 → 6002.
    - `'skips SetDialog, QuestItem and the party conditions without losing its place'`.
    - `'marks a party or guild end condition as unsupported'`.
  - `gameData.corpus.test.ts`:
    - `'reads every quest file Neuz loads'`: the five `QUEST_FILES` with 0 failures and more than 300 quests;
    - 151 and 83 are present, and 151's title is non-empty.
  - `gameDataStage.test.ts`: the stage writes `data/quests.json` when the fake client has `propQuest.inc`, and still
    succeeds without it.
  - `uiStage.test.ts`: `THEME_FILES` lists `ButtRemoveQuest.bmp`, `ButtClose.tga`, `ButtCheck.bmp`, `ButtDestination.bmp`,
    `buttTreeOpen.tga` and `buttTreeClose.tga` once each.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** `readPropQuest` as `CProject::LoadPropQuest` reads (`Project.cpp:1368-2517`), with
  `ScriptReader` (`packages/formats/src/script/cscript.ts`) in the manner of `readCharacterInc`.
  - **Head remap:**
    - 1992 → EVENT;
    - 1993, 1994, 1995, 1997 and 1998 → NORMAL;
    - 1996 → SCENARIO;
    - 1999 → REQUEST;
    - the rest of 1800-1999 as the switch's default there.
  - **Goals:** a goal's text is `atoi` of the token's last four characters.
  - **The stage:** builds the catalog from `QUEST_FILES` as an optional key, like the world map's, and adds the six
    pictures to `THEME_FILES`.
- [ ] **Step 4: Run** the tests, then the corpus tests with `FLYFF_CLIENT` set. Expected: PASS.
- [ ] **Step 5: Convert into the worktree's assets:**
  `npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" --only "ButtRemoveQuest*,ButtClose*,ButtCheck*,ButtDestination*,buttTree*,data"`.
  Expected: `0 failed`, and `dist/assets/index.json` has `data/quests.json`.
- [ ] **Step 6: Commit** `feat(formats,convert): the quest catalog and the quest windows' pictures`.

### Task 3: The quest rules: the end condition, the rows, the tree

**Files:**
- Create: `apps/client/src/world/quests/questRules.ts`, `apps/client/src/world/quests/questTree.ts`
- Test: `apps/client/test/questRules.test.ts`, `apps/client/test/questTree.test.ts`

**Interfaces:**
- Consumes: `OwnQuest`, `QS_END` (Task 1); `WebQuest`, `QUEST_KIND` (Task 2); `QuestLookup` (`hud/dialogue/dialogState.ts`).
- Produces:

```ts
export type QuestCatalog = ReadonlyMap<number, WebQuest>;
/** What __IsEndQuestCondition reads off the player. */
export interface QuestOwner {
  level: number; job: number; sex: number; gold: number; expPercent: number;
  skillLevel(skill: number): number; itemCount(item: number): number; completed: readonly number[];
}
export interface QuestNames { mover(index: number): string; item(id: number): string; npc(key: string): string }
/** One line of the detail's conditions or the tracker (MakeQuestConditionItems, WndQuest.cpp:1887-2352). */
export interface ConditionRow { text: string; met: boolean; goal?: WebQuestGoal }
export function isEndQuestCondition(quest: OwnQuest, prop: WebQuest, owner: QuestOwner): boolean; // Mover.cpp:9274-9652
export function conditionRows(quest: OwnQuest, prop: WebQuest | undefined, owner: QuestOwner, names: QuestNames, texts: Texts): ConditionRow[];
export function rewardLines(prop: WebQuest | undefined, names: QuestNames, texts: Texts): string[];   // WndQuest.cpp:1795-1875
export function createQuestLookup(catalog: () => QuestCatalog | null, quests: () => ReadonlyMap<number, OwnQuest>,
  owner: () => QuestOwner | undefined): QuestLookup;
// questTree.ts
export type QuestFilter = 'all' | 'current' | 'completed';
export const QUEST_TABS = [6000, 6001, 6002, 6003] as const;      // Scenario, General, Request Office, Event
export interface QuestNode { id: number; title: string; folder: boolean; completed: boolean; checked: boolean; children: QuestNode[] }
export function questTree(tab: number, filter: QuestFilter, catalog: QuestCatalog | null,
  current: ReadonlyMap<number, OwnQuest>, completed: readonly number[], checked: readonly number[]): QuestNode[];
```

- [ ] **Step 1: Write the failing tests:**
  - `questRules.test.ts`, with a catalog built from Task 2's fixture props:
    - `'the Mercenary's first quest ends at 10 Aibatts, not 9'`.
    - `'an item quest counts the inventory, filtered by sex and job'`.
    - `'a time limit counts while minutes are left, and the met bit is ignored for the count'`: `time` 0x8005 → 5 minutes.
    - `'a quest with an unsupported end term is never ready'`.
    - `'the dialogue flag is not a condition'` (`Mover.cpp`: not checked).
    - `'the rows read as Neuz writes them'`:
      - "Defeat Small Aibatt (3/10)" from `TID_QUEST_KILL_NPC`, with its goal;
      - the item row;
      - "Meet Mustang", last;
      - a met row has `met: true`.
    - `'the rewards read as Neuz writes them'`: "Penya: 1500", `TID_QUEST_EXP1`, and "Item: ????" when hidden.
    - `'the lookup gives the title and levels, and ready only for a current quest that meets its conditions'`.
  - `questTree.test.ts`:
    - `'a current quest sits in its tab under its head folders'`: 151 is under 6051 under 6001, so in the General tab.
    - `'the filter shows current, completed or both, current ones first'`.
    - `'a completed quest is not checkable; a checked one is marked'`.
    - `'an unknown quest is a General leaf titled by its id'`: "Quest 999".
    - `'an empty folder is left out'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**, following [R §4] for `isEndQuestCondition` and [R §5] for the rows and the tree.
  - Each end term counts when met. The ones `prop.unsupported` names are never met. Item counts use
    `owner.itemCount`.
  - Row texts are formatted with `formatText` (`hud/format.ts`) from the TIDs of [R §6].
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the quest rules: the end condition, the rows and the tree (Mover.cpp, WndQuest.cpp)`.

### Task 4: The quest state and its chat lines

**Files:**
- Modify:
  - `apps/client/src/world/OwnState.ts` (fields, constructor `:150-171`, `apply` `:236-316`, `OwnEvent` `:32-40`);
  - `apps/client/src/world/WorldState.ts` (route the five messages to `toOwn`, `:286-292`, `:347-350`).
- Create: `apps/client/src/world/quests/questLines.ts`
- Modify: `apps/client/src/audio/soundIds.ts` (`BGM_EV_START` 19, `BGM_EV_END` 20, `Resource/defineSound.h:1924-1925`)
- Test: `apps/client/test/ownState.test.ts`, `apps/client/test/questLines.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's messages; Task 3's `QuestCatalog`, `QuestNames`.
- Produces:

```ts
// OwnState: readonly quests: Map<number, OwnQuest>; completedQuests: number[]; checkedQuests: number[]
export type QuestChange =
  | { kind: 'started'; quest: OwnQuest }                     // a new current quest (BGM_EV_START)
  | { kind: 'progress'; before: OwnQuest; after: OwnQuest }  // a known quest, not ended
  | { kind: 'ended'; quest: OwnQuest }                       // state 14: moved to completed (BGM_EV_END)
  | { kind: 'removed'; questId: number; cancelled: boolean } // REMOVEQUEST -1 (cancelled) or 0
  | { kind: 'listsChanged' };                                // QUEST_CHECKED, REMOVEQUEST 1 or 2
// OwnEvent gains { kind: 'quest'; change: QuestChange }
export interface QuestLine { text: string; color?: number }
/** OnSetQuest's and OnRemoveQuest's lines (DPClient.cpp:8444-8573, :14633-14684). */
export function questLines(change: QuestChange, catalog: QuestCatalog | null, names: QuestNames, texts: Texts): QuestLine[];
/** Whether the change runs out a time limit, so the client abandons the quest itself (DPClient.cpp:8484). */
export function timedOut(change: QuestChange): boolean;
```

- [ ] **Step 1: Write the failing tests:**
  - `ownState.test.ts`:
    - `'a new OwnState takes the quests from ADD_OBJ'`.
    - `'SETQUEST adds a new quest (started), updates a known one (progress), and an ended one moves to completed and out of the checked list (ended)'`.
    - `'a repeatable quest that ends is not added to completed'` (with the catalog's `repeat`).
    - `'a quest already completed is refused'`.
    - `'REMOVEQUEST -1 and 0 remove it from all three lists; 1 clears all; 2 clears completed'`.
    - `'QUEST_CHECKED replaces the checked list'`.
    - `'QUEST_TEXT_TIME and QUESTHELPER_NPCPOS change nothing'` ([R §2]).
  - `questLines.test.ts`:
    - `'a kill count change says "Defeat Small Aibatt (4/10)"'`.
    - `'the patrol and dialogue flags and a new time say their lines'`.
    - `'step 1 says the next step started; the end says Quest Complete!'`.
    - `'a time running out says the time-out and the failure, and asks for the abandon'`.
    - `'a cancelled quest says "<title> quest has been cancelled."'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
  - `OwnState` gets the catalog's `repeat` through an optional constructor argument
    `repeats: (questId: number) => boolean = () => false`.
  - `WorldState` routes setQuest (own) and the four object-less messages.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the own quest state and Neuz's quest lines (OnSetQuest, OnRemoveQuest)`.

### Task 5: The quest window

**Files:**
- Create: `apps/client/src/world/hud/quests/questWindow.ts`
- Modify:
  - `apps/client/src/world/hud/taskBar.ts` (`TaskBarWindow` `:55` gains `'quests'`; `WINDOWS` `:61-70` maps 859; `MENU`
    `:87-98` gains "Quest Diary", `TID_APP_QUEST`);
  - `apps/client/src/style.css` (a `.hud-quests` block, and the phone panel after `.hud-inventory[data-mobile-window]`,
    `:1644`).
- Test: `apps/client/test/questWindow.test.ts` (jsdom), `apps/client/test/taskBar.test.ts`

**Interfaces:**
- Consumes: Task 3 (`questTree`, `conditionRows`, `rewardLines`, `QuestFilter`, `QUEST_TABS`); `WindowFrame`,
  `ModalBackdrop`, `pictureButton`, `place`, `themeUrl`.
- Produces:

```ts
export interface QuestWindowState {
  catalog: QuestCatalog | null; current: ReadonlyMap<number, OwnQuest>; completed: readonly number[];
  checked: readonly number[]; owner: QuestOwner | undefined; dialogueOpen: boolean;
}
export class QuestWindow {
  constructor(art: UiArt, texts: Texts, names: QuestNames,
    actions: { check(questId: number, check: boolean): void; abandon(questId: number): void; destination(goal: WebQuestGoal): void;
      say(text: string): void },
    doc?: Document);
  readonly list: WindowFrame;    // APP_QUEST_EX_LIST, 336 × 416, tiled (resdata.inc:4076)
  readonly detail: WindowFrame;  // APP_QUEST_EX_DETAIL, 272 × 416, docked at the list's right (:2795)
  get isOpen(): boolean;
  toggle(layerWidth: number, state: QuestWindowState): void;
  update(state: QuestWindowState): void;       // rebuilds what changed
  showDetail(questId: number | null, state: QuestWindowState): void;
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests** (`questWindow.test.ts`):
  - `'four tabs titled by 6000-6003, General selected, In Progress by default; the tab and filter survive reopening'`.
  - `'the tree shows folders with the open and close pictures and leaves; a completed leaf is grey with no box'`.
  - `'a tick sends check; the box shows what QUEST_CHECKED says, not the click'`.
  - `'a sixth tick sends nothing and says why'` (`TID_GAME_ERROR_DONT_CHECK`).
  - `'a leaf toggles the detail with its state text, rows (met ones grey) and rewards'`.
  - `'abandon is offered only for a removable current quest'`:
    - disabled for an ended quest, a `noRemove` quest, and while `dialogueOpen`;
    - otherwise it opens a confirm box with `TID_GAME_QUEST_DELCONFIRM`;
    - OK calls `abandon(id)` once, and Cancel does not.
  - `'a row with a goal calls destination; one without does nothing'`.
  - `'catalog titles go in as text'`: a title `<b>x</b>` shows those characters.
  - `'dispose removes both windows and their listeners'`.
  - `taskBar.test.ts`: `'Q and the Start menu's Quest Diary open the quests window'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**, following [R §5].
  - **Tabs:** `WndTabTile` buttons, as `shopWindow.ts:107-113` does.
  - **Tree:** rows with the 13-px `ButtCheck.bmp` and `buttTreeOpen/Close.tga`.
  - **Filter:** a native `<select>` styled like the combo.
  - **Abandon:** the remove button `ButtRemoveQuest.bmp`; its confirm is a `WndMessagebox.tga` box with OK and Cancel, as
    `logOutBox.ts`.
  - **Close:** `ButtClose.tga`.
  - **Phones:** the list and the detail sit side by side in one full-screen panel (copy the inventory's panel CSS), each
    scrolling.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the quest window (APP_QUEST_EX_LIST, APP_QUEST_EX_DETAIL)`.

### Task 6: The tracker

**Files:**
- Create: `apps/client/src/world/hud/quests/questTracker.ts`
- Modify: `apps/client/src/style.css` (`.hud-quest-tracker`)
- Test: `apps/client/test/questTracker.test.ts` (jsdom)

**Interfaces:**
- Consumes: Task 3's `conditionRows`; Task 5's `QuestWindowState`.
- Produces:

```ts
export class QuestTracker {
  constructor(texts: Texts, names: QuestNames,
    actions: { title(questId: number): void; destination(goal: WebQuestGoal): void }, doc?: Document);
  readonly element: HTMLElement;   // .hud-quest-tracker, in the HUD layer, no close button
  update(state: QuestWindowState): void;   // hidden while nothing is checked
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests:**
  - `'hidden with no checked quest; one title row and its condition rows per checked quest, in checked order'`.
  - `'titles yellow, rows white; met rows grey'` (classes, which the CSS colours).
  - `'a title calls title(id); a row with a goal calls destination'`.
  - `'it rebuilds only when the checked list or a checked quest changes'`.
  - `'dispose removes it'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**, following [R §5] "the tracker".
  - **PC:** at the right edge, 220 px down, with a dark text shadow. The frame shows on hover in Neuz's hover colours.
  - **Phones:** under the top-right shortcuts, at most three quests tall, scrolling, and clear of the joystick and the
    task bar.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the quest tracker (APP_QUEST_QUICK_INFO)`.

### Task 7: The world map's destination mark

**Files:**
- Modify:
  - `apps/client/src/world/hud/worldMap.ts:49-224`;
  - `tools/convert/src/ui/uiStage.ts` (only if Task 2 missed `ButtDestination.bmp`).
- Test: `apps/client/test/worldMap.test.ts`

**Interfaces:**
- Produces:

```ts
// WorldMap gains:
/** WndMapEx's DESTINATION mode (WndMapEx.cpp:547-572, 1172-1214): ButtDestination.bmp at a Madrigal x, z until cleared. */
showDestination(view: MapView, at: { x: number; z: number }): void;   // opens the map if closed
clearDestination(): void;
```

- [ ] **Step 1: Write the failing tests:**
  - `'the destination opens the map with ButtDestination at the spot's map position'`.
  - `'the mark goes on clearDestination and survives a reopen'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** with the map's own world-to-picture projection, as the player arrow uses it.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the world map's quest destination mark (WndMapEx DESTINATION)`.

### Task 8: Wiring, the dialogue's quest data, and the browser spec

**Files:**
- Create: `apps/client/src/world/quests/questCatalog.ts`
- Modify: `apps/client/src/world/WorldScreen.ts`:
  - load the catalog beside `loadWorldMap`, `:431`;
  - `new OwnState` at `:512` (repeats);
  - `NO_QUESTS` at `:872`;
  - `openWindow` `:1339-1363`;
  - `syncViews` / `play` `:967-1001` (quest lines, jingles and the time-out abandon);
  - `drawHud` `:1296-1332` (window and tracker updates);
  - `disposeWorld`.
- Test: `apps/client/test/questCatalog.test.ts`; `apps/client/e2e/quests.spec.ts` (create)

**Interfaces:**
- Produces:
  `loadQuests(store: AssetStore, report: (error: Error) => void): Promise<QuestCatalog | null>`, null when
  `QUESTS_KEY` is missing (as `loadWorldMap`).

- [ ] **Step 1: Write the failing unit test** (`questCatalog.test.ts`): `'without a catalog the world still enters'`.
  `loadQuests` gives null for a store without the key, and reports nothing.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement the wiring:**
  - **`QuestOwner`:** from `OwnState`. `itemCount` sums the inventory by item id; `expPercent` comes from the EXP
    table.
  - **`QuestNames`:** from `data.movers`, `data.itemProps` and `data.npcs`.
  - **Dialogue:** `createQuestLookup(...)` replaces `NO_QUESTS`, so the dialogue's rows show `[min~max] title` and
    the yellow paper.
  - **`'quests'`:** toggles the window.
  - **Each `quest` own event:**
    - its `questLines` go to `hud.messages.add` and the chat;
    - `BGM_EV_START` / `BGM_EV_END` play through the jingle;
    - `timedOut` sends `sendRemoveQuest`.
  - **The actions:**
    - check → `sendQuestCheck`;
    - abandon → `sendRemoveQuest`;
    - destination → `worldMap.showDestination`;
    - the tracker's title → `questWindow.showDetail`.
  - **`drawHud`:** updates the window and the tracker from the own state.
  - **`disposeWorld`:** disposes both.
- [ ] **Step 4: Run** the unit tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Write `apps/client/e2e/quests.spec.ts`:**
  `'quests: the window, the detail, a check and the tracker, progress lines, abandon, the dialogue's quest row'`, on
  chromium and phone.
  - **Setup:** the player enters with `own.quests = [{ id: 151, state: 0, time: 0, kills: [3, 0], patrol: false, dialog: false }]`.
  1. Press Q (phone: Start → Quest Diary). The General tab shows "1st Job Change" › "The Path of the Mercenary".
  2. The detail shows "Defeat Small Aibatt (3/10)" and "Penya: 1500".
  3. Tick the box. One `0x88100110` packet decodes to `151, 1`. Push QUEST_CHECKED `[151]`: the tracker shows the
     quest and its row.
  4. Push SETQUEST with kills 4. The chat has "Defeat Small Aibatt (4/10)", and the tracker says 4/10.
  5. Tap the kill row. The world map opens with the destination mark.
  6. Abandon, then OK. One `0x00ff0026` packet decodes to `151`. Push REMOVEQUEST `-1, 151`: the chat says it was
     cancelled, and the tree and the tracker are empty.
  7. Open Mustang's dialogue (an NPC with key `MaFl_Mustang`) and push NEWQUEST for 151. The row reads
     "[15~15] The Path of the Mercenary" with the green paper.
  8. On phone: the window is a full-screen panel inside 750 × 342 or the project's size; the tracker does not overlap
     the joystick zone.

  End with `errors` equal to `[]`.
- [ ] **Step 6: Run** `quests.spec.ts`, `dialogue.spec.ts` and `talking.spec.ts` through the 5175 config. Expected: all
  pass.
- [ ] **Step 7: Commit** `feat(client): quests in the world: the window, the tracker, the lines and the dialogue's quest data`.

### Task 9: The owner's checklist and the checkpoint

**Files:**
- Modify: `docs/device-testing.md` (a "Piece 7, milestone 1: quests" section), `README.md` (one sentence after M0's)
- Create: `docs/piece7-m1-checkpoint.md`

- [ ] **Step 1:** In `device-testing.md`, add steps on the PC and a landscape phone, each with its pass mark. The test
  characters need:
  - a Vagrant of level 15 (GM), for the Mercenary chain;
  - any character of level 30 or more, for a Flaris quest.

  The steps:
  1. A level-1 Flaris starter quest: take it in the dialogue, see "You've received the quest", Q shows it.
  2. Kill progress lines and the tracker.
  3. Hand it in: the rewards' lines, then "Quest Complete!", and the quest moves to Completed.
  4. The Mercenary chain's first two quests, up to the job change. The change itself is M2's.
  5. Abandon a quest.
  6. A sixth check box.
  7. A destination on the world map.
  8. The phone panel and the tracker.
- [ ] **Step 2:** Write `docs/piece7-m1-checkpoint.md`, as `docs/piece7-m0-checkpoint.md`: what was built, the
  decisions, the rulings, the evidence, the owner's commands (`npm test`, `npm run typecheck`, `npm run test:corpus`,
  `npm run test:e2e:client`, the device steps), and the convert command of Task 2 Step 5 for the owner's own assets.
- [ ] **Step 3: Commit** `docs(piece7): M1 checklist and checkpoint`.

---

## Decisions this plan makes

1. **No "quest helper" request.** V15 never asks the server for an NPC's position (`SendReqNPCPos` is compiled out,
   [R §3]).
   - The spec's "target NPC's position on the Navigator" is therefore what V15 actually does instead: a condition
     row's goal marks the world map (Task 7).
   - QUESTHELPER_NPCPOS is read and dropped.
2. **No "Destination" box.** `QuestDestination.txt` is not in the client [R §1], so Neuz's box for a goal without a
   position is empty. Here such a row does nothing.
3. **No 3-D destination arrow.** `etc_arrow.o3d` is not converted [R §7]. It is a follow-up, with the converter's model
   list.
4. **No quest marks over NPC heads.** Neuz's "!" and "?" emoticons (`Mover.cpp:1092-1137`) need every begin condition
   judged on the client. They are a follow-up.
5. **QUEST_TEXT_TIME is read and dropped.** It belongs to party quests and is drawn only on internal servers [R §2].
6. **The catalog is optional**, like the world map's.
   - Without it, quests are listed as "Quest <id>" and the dialogue keeps M0's server titles.
   - End terms the browser cannot judge (party, guild, pet, disguise, TSP) make a quest never "ready". They show as a
     row only when the catalog sets them.
7. **The quest window refreshes on every change.** Neuz refreshes it only when it opens, around the dialogue and on
   REMOVEQUEST.
8. **The tracker is drawn without the hover fade.** On the PC its frame shows on hover in Neuz's hover colours; phones
   have no hover. The text has a dark shadow so it reads over the world.
9. **On phones:**
   - the quest window is one full-screen panel with the list and the detail side by side;
   - the tracker is compact, under the shortcuts, and scrolls past three quests.
10. **The quest jingles:** `BGM_EV_START` and `BGM_EV_END` play through Piece 6's jingle player, as `CMover::SetQuest`
    plays them.
