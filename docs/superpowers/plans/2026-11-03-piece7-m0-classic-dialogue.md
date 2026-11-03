# Piece 7 M0 — Classic NPC Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's small NPC box with Neuz V15's two pieces — the mover menu beside the NPC and the 512 × 320
`APP_DIALOG_EX` dialogue window — reading and sending every dialogue message byte for byte as Neuz does.

**Architecture:** The protocol learns every RUNSCRIPTFUNC function and Neuz's two request shapes (Task 1). The converter
adds the NPC pictures and the dialogue's theme pictures (Task 2). Two DOM-free modules copy `CWndDialog`'s rules: the
text with its markup and links (Task 3) and the dialogue's state (Task 4). Two HUD modules draw them: the mover menu
(Task 5) and the dialogue window (Task 6). Task 7 wires both into `WorldScreen` in place of `NpcDialog` and moves the
browser tests over; Task 8 writes the owner's checklist and the checkpoint. Quest titles' level ranges and the
"ready to hand in" icon come through a `QuestLookup` that M0 leaves empty and M1 fills.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for DOM tests), Playwright (Chromium), the FlyffWeb converter.

**Spec:** `docs/superpowers/specs/2026-11-03-piece7-design.md` §3.1 (M0), §4, §5 (M0 row), §7 (M0). Research (cited as
`[R §n]`): `docs/superpowers/specs/2026-11-03-piece7-m0-dialogue-research.md`. C++ paths are relative to
`Blouflash VS22 V15/`.

## Global Constraints

- No server or gateway change: every packet is one Neuz sends, with Neuz's bytes [R §4].
- Each new module opens with the C++ it copies as a `Function  File:lines  what` table, as `hud/logOutBox.ts:1-23`
  does; constants cite `resdata.inc:<line>`.
- Server text goes into the page as text (`textContent`), never as markup.
- Strings come from the texts catalog (`data.texts`, keyed by TID name or `textId`), with Neuz's English in [R] as the
  fallback when a row is missing.
- The phone rule is `(max-width: 1000px) and (pointer: coarse)`; phone window text stays at least 14 px
  (`style.css:1386-1387`).
- Custom server features (`CUSTOM_FEATURES.md`) are out of scope.
- No new dependency.
- Builders run `npx vitest run <the task's test files>`, `npm run typecheck`, and at most the one browser spec their task
  changes, through the port-5175 config (Setup). The owner's `dev:client` holds 5174: never stop it.

## Review Focus

1. **Markup in server text.** A SAY or a key word holding `<b>`, `<img>` or `&amp;` shows those characters as written.
   Test: Task 6 Step 1, "shows a SAY's text as text, never as markup".
2. **Fast presses.** Tapping keys, answers, links or rows quickly sends at most one request a second (Neuz's 1 s timer),
   and never two for one press. Test: Task 4 Step 1, "after a request, presses for 1 s send nothing".
3. **The NPC or the player going away while it is open.** The NPC leaving view, dying, or the own character dying or
   moving closes the menu and the window without an error. Test: Task 7 Step 1, "the dialogue closes when its NPC goes
   or the player moves".
4. **A long page on a phone.** A SAY taller than the 168 px text area scrolls inside it, and the keys, answers and Enter
   stay reachable at 750 × 342. Test: Task 7 Step 5 (`dialogue.spec.ts`, phone project).
5. **A world change with the menu or the window open.** Both are removed with the world; nothing stays on the screen or
   on the document's listeners. Tests:
   - Task 5 Step 1, "a press outside or Escape closes it; no listener stays after close or dispose";
   - Task 6 Step 1, "EXIT, the close button and Escape close it; dispose removes it";
   - Task 7 Step 3, where `disposeWorld` calls both `dispose`s.

---

## Setup (once, before Task 1)

- [ ] In `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece7`, run `npm ci`. Expected: exit 0.
- [ ] Copy the converted assets from the piece6 worktree (about 1.3 GB):
      `robocopy ..\piece6\dist\assets dist\assets /E /NFL /NDL /NJH /NJS` (PowerShell). Expected: `dist\assets\report.json`
      exists.
- [ ] Copy `..\piece6\.superpowers\sdd\e2e-5175.config.ts` to `.superpowers\sdd\e2e-5175.config.ts` (git-ignored). One
      spec runs as `npx playwright test -c .superpowers/sdd/e2e-5175.config.ts <spec> --project=chromium --project=phone`.

---

### Task 1: The dialogue messages and requests, as Neuz has them

**Files:**
- Modify: `packages/protocol/src/world/npc.ts`
- Modify: `apps/client/src/world/WorldSession.ts:100`
- Test: `packages/protocol/test/npcDialog.test.ts` (create); `packages/protocol/test/worldShop.test.ts:8-30`,
  `apps/client/test/worldSession.test.ts:162-168` (update to the new signatures)

**Interfaces:**
- Produces:
  - `encodeNpcDialogOpen(npcId: number): Uint8Array`
  - `encodeNpcDialog(npcId: number, key: string, param: number, quest: number, playerId: number): Uint8Array`
  - the `NpcAction` union below, read by `readNpcScript` (still registered at `world/readers.ts:40`)
  - `WorldSession.sendNpcDialogOpen(npcId: number): void`;
    `WorldSession.sendNpcDialog(npcId: number, key: string, param: number, quest: number, playerId: number): void`

```ts
export type InitStat = 'all' | 'str' | 'sta' | 'dex' | 'int';
export type NpcAction =
  | { kind: 'say'; text: string; quest: number }
  | { kind: 'key' | 'answer' | 'newQuest' | 'currentQuest'; label: string; key: string; param: number; quest: number }
  | { kind: 'removeKey'; key: string }
  | { kind: 'clear' | 'exit' | 'none' | 'removeNavigator' }
  | { kind: 'initStat'; stat: InitStat; remainGP: number }
  | { kind: 'navigator'; worldId: number; pos: [number, number, number] }
  | { kind: 'queryName'; of: 'player' | 'guild' };
```

- [ ] **Step 1: Write the failing tests** in `packages/protocol/test/npcDialog.test.ts`:
  - `'the opening request is Neuz's: the NPC, an empty key and four zeros'`: `encodeNpcDialogOpen(12)` decodes (after
    the 8-byte header `DPID_UNKNOWN`, `0xff00b0`) as `u32 12, i32 0 (key length), i32 0, 0, 0, 0`.
  - `'a request carries the NPC and the player in the last two globals'`: `encodeNpcDialog(12, 'Introduction', 3, 7, 9000)`
    gives `12, 'Introduction', 3, 7, 12, 9000`.
  - `'refuses an empty or too long key in a request'`: `encodeNpcDialog(12, '', 0, 0, 1)` and a 256-character key throw.
  - `'reads every function the V15 server sends'`, table-driven over [R §4]'s table: 0x10 → `key`, 0x11 → `removeKey`,
    0x12 → `say`, 0x13 → `answer`, 0x16 → `exit`, 0x19 → `none`, 0x1a → `initStat 'all'`, 0x1d → `clear`,
    0x20-0x23 → `initStat 'str' | 'sta' | 'dex' | 'int'`, 0x24 → `queryName 'player'`, 0x26 → `newQuest`,
    0x27 → `currentQuest`, each with its fields' values.
  - `'reads the functions V15 never sends without losing its place'`: 0x14, 0x15, 0x17, 0x18, 0x1c and 0x25 read no
    field; 0x1b reads `u32 world, 3 × f32` to `navigator`; 0x1e reads a string and a u32 to `none`. Each is followed in
    the same reader by a `u32 0xdeadbeef` that the test reads back.
  - `'refuses a function number it does not know'`: 0x1f throws `ProtocolError`.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run packages/protocol/test/npcDialog.test.ts` — FAIL
  (`encodeNpcDialogOpen` is not exported).
- [ ] **Step 3: Implement** in `npc.ts`:
  - `encodeNpcDialogOpen` writes the length 0 and no bytes for the key (`DPClient.cpp:9647-9654` with `NULL`).
  - `encodeNpcDialog` keeps `chatBytes(key, 255)` and writes `npcId` and `playerId` as nGlobal3 and nGlobal4
    (`WndDialog.cpp:234-240`).
  - `readNpcScript` follows [R §4]'s table. The old `'end'` and `'unsupported'` kinds go.
  - `WorldSession.sendNpcDialogOpen` and the new `sendNpcDialog` send them. Fix the two old tests to the new
    signatures.
- [ ] **Step 4: Keep the old box compiling until Task 7 deletes it.** In `npcDialog.ts`, `receive` maps the new kinds:
  - `newQuest`, `currentQuest` and `queryName` to its `unsupported` branch;
  - `none`, `initStat`, `navigator` and `removeNavigator` to its `end` branch (nothing).

  Its `request` sends `'#init'` as today. `WorldScreen.ts:851` passes `this.world?.self()?.objectId ?? 0` as the player.
- [ ] **Step 5: Run the tests to see them pass.** `npx vitest run packages/protocol/test/npcDialog.test.ts
  packages/protocol/test/worldShop.test.ts apps/client/test/worldSession.test.ts apps/client/test/npcDialog.test.ts`,
  then `npm run typecheck`. Expected: PASS and exit 0.
- [ ] **Step 6: Commit** `feat(protocol): every dialogue function and Neuz's two dialogue requests`.

### Task 2: The NPC pictures and the dialogue's pictures

**Files:**
- Modify: `packages/formats/src/inc/character.ts:21-34`, `:48`, `:184-194` (keep `SetImage` / `m_szChar`)
- Modify: `packages/formats/src/web/gameData.ts:151-164` (`WebNpc.image`)
- Modify: `tools/convert/src/output/keys.ts` (new key function)
- Modify: `tools/convert/src/ui/uiStage.ts:52-55` (`PICTURE_FOLDERS`), `:67-160` (`THEME_FILES`), `:269-276`
  (colour key)
- Modify: `tools/convert/src/data/gameDataStage.ts:452-461` (`buildNpcs`)
- Test: `packages/formats/test/gameDataReaders.test.ts`, `tools/convert/test/uiStage.test.ts`,
  `tools/convert/test/gameDataStage.test.ts:617-622`, `tools/convert/test/uiStage.corpus.test.ts`

**Interfaces:**
- Produces:
  - `CharacterDef.image?: string` (the resolved file name, `char_Juria.tga`)
  - `WebNpc.image?: string` (an asset key, `ui/char/char_juria.png`)
  - `charPictureKeyOf(file: string): string` in `keys.ts`, `'ui/char/' + <webName of the base name> + '.png'`, as
    `itemIconKeyOf` does
  - in `dist/assets`: the theme pieces `ui/wnddialogex.png`, `ui/wndbuttenter.png`, `ui/questuipapergreen.png`,
    `ui/questuipaperred.png`, `ui/questuipapergray.png`, `ui/questuipaperyellow.png` (keys by `themeKey`), and one
    `ui/char/<name>.png` per file of `Client/Char`

- [ ] **Step 1: Write the failing tests:**
  - `gameDataReaders.test.ts`: `'keeps the NPC picture SetImage names'`: a `character.inc` row with
    `SetImage( IDS_X )`, whose string is `char_Juria.tga`, gives `image: 'char_Juria.tga'`; one with
    `m_szChar = "char_Losha.tga";` gives that name.
  - `uiStage.test.ts`: the six new theme pieces are each listed once. `QuestUiPaper*.tga` take white as their colour
    key, as `ButtSpin` does (`:59`). A file of `Char` goes to `ui/char/<web>.png` (as `:191` does for `Item`).
  - `gameDataStage.test.ts:617-622`: the expected npcs rows gain `image: 'ui/char/…png'` where the fixture names one.
  - `uiStage.corpus.test.ts`: `'every NPC picture character*.inc names is a file of Client/Char'`, ignoring case.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run packages/formats/test/gameDataReaders.test.ts
  tools/convert/test/uiStage.test.ts tools/convert/test/gameDataStage.test.ts` — FAIL.
- [ ] **Step 3: Implement** what the Interfaces block lists. The Char folder keeps the default magenta key
  (`WndDialog.cpp:294`). The QuestUiPaper files get white (`:254-257`).
- [ ] **Step 4: Run the tests to see them pass**, the corpus test too:
  `npx vitest run --config vitest.corpus.config.ts tools/convert/test/uiStage.corpus.test.ts`.
- [ ] **Step 5: Convert into the worktree's assets.**
  `npm run convert -- --only "WndDialogEx,wndButtEnter,QuestUiPaper*,char_*,data"`. Expected: `0 failed`;
  `dist/assets/index.json` has `ui/char/char_juria.png` and `ui/wnddialogex.png`. Record the totals line in the commit
  message.
- [ ] **Step 6: Commit** `feat(formats,convert): the NPC pictures and the dialogue window's pictures`.

### Task 3: The dialogue's text: Say, markup and links

**Files:**
- Create: `apps/client/src/world/hud/dialogue/dialogText.ts`
- Test: `apps/client/test/dialogText.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TextRun {
  text: string;            // may contain '\n'
  color: number;           // ARGB, 0xff000000 by default
  bold: boolean; underline: boolean; strike: boolean;
  link?: string;           // the key a context word sends
}
export function sayText(text: string, questTitle?: string): string;   // CWndDialog::Say's string (WndDialog.cpp:423-453)
export function parseDialogText(text: string): TextRun[];             // CEditString::ParsingString + CWndDialog::ParsingString
```

- [ ] **Step 1: Write the failing tests** (`dialogText.test.ts`):
  - `'Say starts a page with two spaces and turns each \\n into a new line and two spaces'`:
    `sayText('Hello\\nWorld')` (a literal backslash and n) is `'  Hello\n  World'`.
  - `'a quest page starts with its title in bold, in the quest colour'`: `sayText('Go', 'Title')` is
    `'#b#cff5050f0Title#nb#nc\n  Go'`.
  - `'reads the colour, bold, underline and strike codes'`: `'#cff00ff00Hi#nc #bthere#nb #ux#nu #sy#ns'` gives runs with
    colours `0xff00ff00` then `0xff000000`, and bold, underline and strike set on `there`, `x` and `y`.
  - `'drops the codepage codes and keeps any other # code as it is'`: `'#l0949a#nl#zb'` gives the text `'a#zb'`.
  - `'a link shows its word in bold and sends its key'`: `'[Yes][Yes_Enter] / [No][No_Enter]'` gives `Yes` (bold, link
    `Yes_Enter`), `' / '`, and `No` (bold, link `No_Enter`).
  - `'an empty key sends the word'`: `'[For Honor][]'` gives link `For Honor`.
  - `'an unclosed bracket stays text'`: `'a [b'` gives one run `'a [b'`.
  - `'markup characters stay text'`: `'<b>x</b> &amp;'` gives that exact text.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run apps/client/test/dialogText.test.ts` — FAIL.
- [ ] **Step 3: Implement** both functions, following [R §3] "Say", "Markup" and "Links". Hex digits of either case
  are read: Neuz misreads upper case, and this deviation is recorded under Decisions.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the dialogue's text, its codes and its links (CWndDialog::Say, ParsingString)`.

### Task 4: The dialogue's state

**Files:**
- Create: `apps/client/src/world/hud/dialogue/dialogState.ts`
- Test: `apps/client/test/dialogState.test.ts`

**Interfaces:**
- Consumes: `NpcAction` (Task 1), `sayText` (Task 3).
- Produces:

```ts
export interface DialogButton { word: string; key: string; param: number; quest: number }
export interface QuestRow extends DialogButton { valid: boolean }          // valid: key !== 'QUEST_NEXT_LEVEL'
export interface DialogRequest { key: string; param: number; quest: number }
export interface QuestLookup {
  titleOf(questId: number): { title: string; levelMin: number; levelMax: number } | undefined;
  isReadyToHandIn(questId: number): boolean;
}
export const NO_QUESTS: QuestLookup;                                       // M0: undefined and false
export interface DialogWords { newQuest: string; currentQuest: string }    // TID_GAME_NEW_QUEST, TID_GAME_CURRENT_QUEST
export const REQUEST_LOCK_MS = 1000;                                       // m_timer.Set( SEC( 1 ) ), WndDialog.cpp:239
export class DialogState {
  constructor(words: DialogWords, quests: QuestLookup);
  readonly pages: readonly string[]; readonly page: number;
  readonly keys: readonly DialogButton[]; readonly answers: readonly DialogButton[];
  readonly newQuests: readonly QuestRow[]; readonly currentQuests: readonly QuestRow[];
  readonly selectedKey: number;                                            // -1: none
  readonly list: 'new' | 'current' | null;                                 // a quest list shown in the text area
  get hasNextPage(): boolean;                                              // UpdateButtonEnable
  get visibleAnswers(): readonly DialogButton[];                           // the last page's only
  apply(action: NpcAction): 'changed' | 'exit' | 'ignored';
  nextPage(): void;
  pressKey(index: number, now: number): DialogRequest | null;
  pressAnswer(index: number, now: number): DialogRequest | null;
  pressLink(key: string, now: number): DialogRequest | null;
  pressQuest(list: 'new' | 'current', index: number, now: number): DialogRequest | null;
}
```

- [ ] **Step 1: Write the failing tests** (`dialogState.test.ts`), with `words = { newQuest: 'New Quest',
  currentQuest: 'Quests in Progress' }`:
  - `'Julia's opening: keys, a new quest row and one page'`. Apply in order: `clear`; `key` Introduction/Introduction;
    `key` Farewell/Farewell; `newQuest` 'Report to Flaris'/'QUEST_BEGIN'/0/5; `say` 'Hi'/0. Expect:
    - keys `['Introduction', 'Farewell', 'New Quest']`, the last with key `'New Quest'`;
    - one new row, valid;
    - pages `['  Hi']`, page 0.
  - `'a key with a word it already has is ignored; REMOVEKEY removes by key'`.
  - `'REMOVEALLKEY empties the keys and both quest lists'`.
  - `'each SAY adds a page and the view goes back to page 0'`: two SAYs, then `nextPage()` gives page 1 and
    `hasNextPage` false. A third SAY goes back to page 0.
  - `'answers show only on the last page'`.
  - `'a quest SAY's title comes from the lookup, else from its row'`: with `NO_QUESTS` and a row for quest 5 titled
    'Report to Flaris', `say` 'Go'/5 gives the page `sayText('Go', 'Report to Flaris')`. With neither, it gives
    `sayText('Go')`.
  - `'pressing New Quest with rows shows the list and sends nothing'`: `pressKey` gives null, `list` 'new',
    `selectedKey` 2.
  - `'pressing a key clears the pages and sends its key, param and quest'`.
  - `'a QUEST_NEXT_LEVEL row is invalid and sends nothing'`.
  - `'after a request, presses for 1 s send nothing'`: `pressKey(0, 0)` sends. `pressKey(1, 999)` gives null.
    `pressKey(1, 1000)` sends.
  - `'EXIT is exit; the stat, navigator and name functions are ignored here'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** `DialogState`, following [R §3] "EndSay … BeginText", "Key buttons", "Answers", "Pressing"
  and "Quest lists". The first quest key is `newQuest` or `currentQuest` making the "New Quest" / "Quests in Progress"
  key (`MakeQuestKeyButton`, `WndDialog.cpp:1003-1020`). At most 32 keys.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the dialogue's state, as CWndDialog keeps it`.

### Task 5: The mover menu

**Files:**
- Create: `apps/client/src/world/hud/moverMenu.ts`
- Modify: `apps/client/src/style.css` (a `.hud-mover-menu` block beside the HUD windows, `:594-657`)
- Test: `apps/client/test/moverMenu.test.ts` (jsdom)

**Interfaces:**
- Produces:

```ts
export interface MenuEntry { id: number; label: string; enabled: boolean }
export const MMI = { DIALOG: 0, TRADE: 2, GUILDBANKING: 15, ARENA_ENTER: 80, TELEPORTER: 146 } as const;
export const MENU_RANGE = 20;                                              // ShowMoverMenu, WndWorld.cpp:6520-6523
/** The menu ShowMoverMenu shows (WndWorld.cpp:6649-6684), in ascending MMI number. */
export function npcMenuEntries(npc: WebNpc | undefined, texts: Texts, ownIsBaseJob: boolean): MenuEntry[];
/** OnCommand( nMenu ) at once when the NPC has one entry or none (WndWorld.cpp:6630-6645, :6688); null otherwise. */
export function soleEntry(npc: WebNpc | undefined): number | null;
export class MoverMenu {
  constructor(doc?: Document);
  readonly element: HTMLElement;                                           // .hud-mover-menu, in the HUD layer
  open(entries: readonly MenuEntry[], at: { x: number; y: number }, choose: (id: number) => void): void;
  close(): void;
  get isOpen(): boolean;
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests** (`moverMenu.test.ts`):
  - `'Julia's menu is in MMI order, without the guild warehouse'`: `npc.menus` `[0, 9, 15, 16, 17, 18, 2, 137]` gives ids
    `[0, 2, 9, 16, 17, 18, 137]`.
  - `'Dialog, a shop's Trade and a teleporter's Teleport are enabled; the rest is greyed'`: `vendorType` set disables 2;
    146 is enabled only with `teleports`.
  - `'Arena entry is left out for a base job'`.
  - `'labels are TID_MMI_DIALOG + id'`: `textId` 7009 → 'Deposit'. With no row: 'Dialog', 'Trade', 'Teleport'.
  - `'one entry or none runs at once'`: `soleEntry` with `[146]` gives 146, with `[]` gives 0, with `[0, 2]` gives null.
  - `'items are 20 px on a 22 px pitch, as wide as the widest + 60, at the given point'` (desktop). The phone rule gives
    32 px on a 34 px pitch.
  - `'choosing an enabled entry calls back once and closes; a greyed one does nothing'`.
  - `'a press outside or Escape closes it; no listener stays after close or dispose'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** following [R §1] "`CWndMenu`". The frame is `#e2c6b5` with a 3 px border and a white inside;
  text black at 24 px, 4 px; hover fill `rgba(200,200,200,0.61)` with a `#f0f0f0` rounded outline. Buttons carry
  `data-menu-entry="<id>"`. The press-outside and Escape listeners are added on `open` and removed on `close`.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the NPC's mover menu (CWndMenu, ShowMoverMenu)`.

### Task 6: The dialogue window

**Files:**
- Create: `apps/client/src/world/hud/dialogue/dialogWindow.ts`
- Modify: `apps/client/src/style.css` (a `.hud-dialog` block)
- Test: `apps/client/test/dialogWindow.test.ts` (jsdom)

**Interfaces:**
- Consumes: `DialogState`, `DialogRequest`, `QuestLookup` (Task 4); `parseDialogText` (Task 3); `NpcAction` (Task 1);
  `WindowFrame` (`hud/frame.ts`); `ModalBackdrop` (`hud/modal.ts`); `pictureButton`, `place` (`hud/button.ts`);
  `themeUrl` (`hud/art.ts`).
- Produces:

```ts
export const DIALOG = { width: 512, height: 320, top: 10 } as const;      // resdata.inc:13842; WndDialog.cpp:313-320
export const TEXT_RECT, KEYS_RECT, PICTURE_RECT, ENTER_RECT, TITLE_RECT: ControlRect;   // [R §2] client rects
export class DialogWindow {
  constructor(art: UiArt, texts: Texts, quests: QuestLookup, send: (request: DialogRequest) => void, doc?: Document);
  readonly frame: WindowFrame;                                             // 'Conversation', texture WndDialogEx.tga
  get element(): HTMLElement;                                              // the modal backdrop with the window
  get npcId(): number | null;
  open(npcId: number, npc: WebNpc | undefined, layerWidth: number): void;
  receive(action: NpcAction, now: number): void;
  close(): void;
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests** (`dialogWindow.test.ts`):
  - `'shows a SAY's text as text, never as markup'`: `say '<img src=x onerror=alert(1)> &amp;'` leaves no `img` element,
    and the text area's `textContent` holds those characters.
  - `'draws the picture, the title and the text where resdata.inc puts them'`: the picture `img` src is
    `art.url('ui/char/char_juria.png')` at 6, 22, 200 × 240. The title is 'Dialog'. The text area is 268 × 168 at 218, 38
    with `overflow-y: auto`.
  - `'turns pages with the Enter button, shown only before the last page'`.
  - `'links, keys, answers and quest rows send through the state'`. Each press calls `send` once with the state's
    request:
    - a `[x][k]` link sends `k`;
    - a key `button[data-dialog-key]`;
    - a `__YES__` answer: a `ButtYes.tga` picture button, 72 × 20;
    - a quest row `button[data-quest-row]`.
  - `'special answers sit 90 px apart, centred under the text, 20 px over its bottom'`: two of them give lefts
    `218 + 134 - 90 = 262` and `352`, and top `186`.
  - `'the New Quest key shows its rows with their icons; an empty list says so'`:
    - a valid row has `questuipapergreen`, an invalid row `questuipaperred`;
    - current rows have `questuipapergray` (`NO_QUESTS`), or `questuipaperyellow` when `isReadyToHandIn` is true;
    - a row's text is the title, or `[1~15] Title` when `titleOf` knows it;
    - with the key selected and no rows: 'No New Quests'.
  - `'EXIT, the close button and Escape close it; dispose removes it'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** following [R §2] and [R §3]:
  - The frame: `new WindowFrame('Conversation', art, { width: 512, height: 320, texture: 'WndDialogEx.tga',
    mobileScale: 1, fitWhole: true }, doc)`, with a `ModalBackdrop` (`WBS_MODAL`).
  - Placing it: on `open`, at x `(layerWidth - 512) / 2`, y 10, or `'center'` under the phone rule.
  - The text: runs go into spans through `textContent`. The colours are the runs' own; the line height is the font's
    plus 6; the text wraps at 268 px; links are `button.dialog-link` with the hover colour `#1010ff` and an underline.
  - The keys: a wrapping row in KEYS_RECT, each button 8 px padded on each side. Colours: `#505050`, selected
    `#8000ff`, hover `#1010ff` underlined. `title` is 'Ask about %s' (`TID_GAME_ABOUTQUESTION`). A break goes before
    the first quest key.
  - Plain answers: text buttons after the text.
  - The title: `TID_GAME_DIALOG` or the selected key's word, `#800040`, bold, centred in TITLE_RECT.
  - The Enter button: `pictureButton(doc, art, 'wndButtEnter.bmp', ENTER_RECT, 24, …)`.
  - The NPC's picture: `npc.image`, left out when there is none.
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Commit** `feat(client): the classic dialogue window (APP_DIALOG_EX, CWndDialog)`.

### Task 7: Wiring: the click, the walk-up, the guards, the stat resets, and the browser tests

**Files:**
- Modify: `apps/client/src/world/WorldScreen.ts`:
  - `:64`, `:249` — fields;
  - `:849-866` — build both and append them;
  - `:872-888` — the press;
  - `:525-531` — `npcScript`;
  - `:1134-1140` — remove `updateAnchor`;
  - `:1293` — per-frame closing;
  - `:1523-1528` — `canTalk`;
  - `:1647`, `:1666` — dispose;
  - `:1708-1709` — drop.
- Modify: `apps/client/src/world/combat/attackLoop.ts` (a public `walkTo`)
- Modify: `apps/client/src/world/OwnState.ts` (`initStat`)
- Delete: `apps/client/src/world/hud/npcDialog.ts`, `apps/client/test/npcDialog.test.ts`, and the `.hud-npc` and
  `.npc-*` rules (`style.css:1551-1555`, `:1570`, `:1707-1715`)
- Create: `apps/client/src/world/hud/dialogue/dialogueStays.ts`
- Test: `apps/client/test/attackLoop.test.ts`, `apps/client/test/ownState.test.ts` (add);
  `apps/client/test/dialogueStays.test.ts` (create);
  `apps/client/e2e/dialogue.spec.ts` (create), `apps/client/e2e/talking.spec.ts`, `apps/client/e2e/navigation.spec.ts`
  (update)

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces:
  - `AttackLoop.walkTo(objectId: number): void` — `stop('move')`, then `setDestObj(own, objectId, 0)`
    (`WndWorld.cpp:6707-6708`).
  - `OwnState.initStat(stat: InitStat, remainGP: number): OwnEvent[]` — 'all' sets the four stats to 15; one stat sets
    only that one; `remainGP` is the message's; returns `[{ kind: 'statsChanged' }]` (`DPClient.cpp`, FUNCTYPE_INITSTAT
    to INITINT).
  - `dialogueStays(npc: Mover | undefined, own: Mover | undefined): boolean` in `dialogueStays.ts`. It is true when:
    - the NPC is there and not `act.isDie()` (`WndDialog.cpp:58-63`);
    - the own mover is there and not dead;
    - `(own.act.state & ObjSta.STAND) !== 0`;
    - `(own.act.state & ObjSta.MOVE_ALL) !== ObjSta.BMOVE`.

    The last two are `IsState( OBJSTA_STAND )` and `GetMoveState() != OBJSTA_BMOVE` (`WndWorld.cpp:8052-8081`). The menu
    closes on the same rule's own-mover half.

- [ ] **Step 1: Write the failing unit tests:**
  - `'walkTo sends one PLAYERSETDESTOBJ with range 0 and starts no attack'`.
  - `'INITSTAT sets all four stats to 15; INITSTR only strength; both set the stat points'`.
  - `'the dialogue closes when its NPC goes or the player moves'`: `dialogueStays` is false when:
    - the NPC is undefined or dead;
    - the own mover is dead;
    - the own state lacks `STAND`;
    - the move state is `BMOVE`.

    It is true when both stand.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement the wiring** in `WorldScreen`:
  - **An NPC press:**
    - Always: `attackLoop.stop('move')`, `focus.select`, and the idle sound (`moverClicked`).
    - Within `MENU_RANGE` (squared distance under 400): `stopOwnMover()`. Then the sole entry runs at once, or the menu
      opens at the right and top of `focusRect` for the NPC, in HUD-layer pixels, as `rectOf` does at `:1263-1268`.
    - Farther: `attackLoop.walkTo(id)`, with no message.
  - **Choosing an entry:**
    - Dialog is refused within 3000 ms of the last drop (`lastDropAt`, set when `itemActions.drop` returns true) or
      while the shop is open.
    - Otherwise Dialog closes the inventory (`inventoryWindow.frame.close()`), opens the window, calls
      `session.sendNpcDialogOpen(id)` and `sounds.npcDialog(characterKey)` (moved from the press).
    - Trade and Teleport open the shop and the teleporter as today. Both close the dialogue first.
  - **`npcScript` to self:**
    - `initStat` goes to `OwnState.initStat`, and its events are handled as `statsChanged` is.
    - `queryName` goes to `reportOnce('npc: the rename window is not in the browser')`.
    - `navigator` and `removeNavigator` are dropped.
    - Everything else goes to `dialog.receive(action, performance.now())`.
  - **Requests:** `send` is `session.sendNpcDialog(npcId, key, param, quest, world.self().objectId)`.
  - **Each frame:** the dialogue closes when `!dialogueStays(...)`. The menu closes when the own mover moves.
  - **Drops:** a drop is refused while the dialogue is open (`DPClient.cpp:9378-9382`).
  - **Leaving the world:** `disposeWorld` disposes both.
  - **The old box:** `canTalk` stays for the shop and the teleporter (the server's 32 m). Delete the old box, its test
    and its CSS.
- [ ] **Step 4: Run the unit tests to see them pass**, then `npm run typecheck` (now clean).
- [ ] **Step 5: Write `apps/client/e2e/dialogue.spec.ts`**, test
  `'classic dialogue: menu, opening request, pages, keys, answers, quest rows and EXIT'`, on the chromium and phone
  projects. Put Julia (`MaFl_Juria`, the harness's `julia`) 5 m from the player. Then:
  1. Tap her. The menu shows `[data-menu-entry]` ids `0, 2, 9, 16, 17, 18, 137`, with 0 and 2 enabled.
  2. Choose 0. One `0xff00b0` request is sent, decoding to `npc, '', 0, 0, 0, 0`. `.hud-dialog` is visible and inside
     the viewport.
  3. Push (with the spec's local `message(SELF_ID, 0x24, …)` helper, as `talking.spec.ts:8` does):
     - REMOVEALLKEY;
     - ADDKEY Introduction;
     - NEWQUEST row 'Report to Flaris' with quest 5;
     - two SAYs, the first longer than the text area;
     - ADDANSWER `__OK__`.
  4. The text area scrolls. Enter shows page 2, and only then `__OK__`.
  5. Press Introduction. The request decodes to `npc, 'Introduction', 0, 0, npc, SELF_ID`. A second press within 1 s
     sends nothing.
  6. Press New Quest. The row shows with the green icon.
  7. Push EXIT. The window is gone.
  8. Tap an NPC 30 m away. No menu shows, and one PLAYERSETDESTOBJ is sent.

  End with `errors` equal to `[]`. On the phone project, assert the window's box fits 750 × 342 or the project's size,
  and that the keys and Enter are inside the viewport.
- [ ] **Step 6: Update `talking.spec.ts`** to the menu (`[data-menu-entry="0"]` / `"2"`) and `.hud-dialog`. Its 140 px
  check becomes `.hud-dialog` 512 × 320 on desktop. Update **`navigation.spec.ts:48-49`** to `[data-menu-entry="146"]`.
- [ ] **Step 7: Run the three specs** through the 5175 config, chromium and phone. Expected: all pass.
- [ ] **Step 8: Commit** `feat(client): the mover menu and the classic dialogue in the world, the walk-up and the guards`.

### Task 8: The owner's checklist and the checkpoint

**Files:**
- Modify: `docs/device-testing.md` (a "Piece 7 M0 — NPC dialogue" section), `README.md` (one line under the Piece 6
  sentence: what M0 adds)
- Create: `docs/piece7-m0-checkpoint.md`

- [ ] **Step 1:** In `device-testing.md`, add steps on the PC and a landscape phone, each with its pass mark:
  - **Julia:** the menu order, Dialog, pages, keys, a quest row.
  - **Luda** (shop): Trade from the menu, buy one item.
  - **The Flaris teleporter:** Teleport from the menu.
  - **Benku:** his music plays on Dialog.
  - **An NPC 30 m away:** a tap walks up, then a second tap opens.
  - **A Dialog right after a drop:** refused for 3 s.

  The test character needs: level 1-15, any job, some penya for one shop item.
- [ ] **Step 2:** Write `docs/piece7-m0-checkpoint.md`:
  - what was built, with each task's commits;
  - the decisions below;
  - the owner's commands, with what "pass" means:
    - `npm test` — exit 0;
    - `npm run typecheck` — exit 0;
    - `npm run test:corpus` — exit 0;
    - `npm run test:e2e:client` — about 10 min, no `failed`;
    - the device steps;
  - the conversion command of Task 2 Step 5, for the owner's own `dist/assets`.
- [ ] **Step 3: Commit** `docs(piece7): M0 checklist and checkpoint`.

---

## Decisions this plan makes

1. **Quest lists in M0** come from the server's NEWQUEST and CURRQUEST rows. A row shows the server's title.
   - The `[min~max]` levels and the yellow "ready to hand in" icon need the client's quest data and state, which M1
     brings through `QuestLookup`.
   - Until then current rows are grey, and a quest SAY takes its title from its row.
2. **Range** (Neuz's client):
   - The menu opens within 20 units.
   - Farther, the player walks up, and nothing opens on arrival, so a second tap opens it. This replaces "Move closer to
     speak with this NPC."
   - Requests stay subject to the server's 32-unit check.
   - The dialogue closes when the player moves (Neuz's rule) rather than at a distance: a player cannot leave the range
     without moving.
3. **Menu entries the browser cannot open** (Deposit, Repair, the rankings and the like) are shown greyed, where Neuz
   would open their windows.
   - The guild warehouse is never shown: it needs a guild.
   - A press on the NPC again re-shows the menu, as Neuz does.
4. **Escape:** one press closes the menu or the dialogue, as every browser window closes. In Neuz the first press clears
   the target.
5. **Colour codes** accept upper-case hex. Neuz misreads it.
6. **Phones:**
   - The menu's items are 32 px on a 34 px pitch, for fingers.
   - The dialogue is fitted whole and centred.
   - Neuz's cursor shapes (`CUR_SELECT`, `CUR_HELP`) are not copied.
7. **The stat resets** (INITSTAT to INITINT) are applied to the own stats as Neuz applies them.
   - The rename question (QUERYSETPLAYERNAME) is logged once, because the browser has no rename window.
   - The navigator functions V15 never sends are read and dropped.
8. **Requests:**
   - The opening request sends an empty key and four zeros.
   - Every later one sends the NPC and the player as nGlobal3 and nGlobal4, as `RunScript` does.
   - The 1 s lock after a request replaces today's 450 ms.
9. **Sounds:** the NPC's idle sound plays on the press. Its music plays when Dialog opens, as `WndDialog.cpp:295-296`
   does, instead of on the press.
