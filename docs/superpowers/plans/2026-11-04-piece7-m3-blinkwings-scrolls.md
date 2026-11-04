# Piece 7 M3: Blinkwings and the Scroll of Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Town Blinkwing, the place Blinkwings and the Scroll of Return work from the inventory and the task bar,
another world included, and refuse where Neuz refuses. The cast (ready effect, the own gauge, its cancels) and the
Scroll's village choice and return trip work as in V15.

**Architecture:**
- Task 1: the protocol learns the three travel packets, two snapshots and ADD_OBJ's cast item; the testkit writes them.
- Task 2: the converter keeps the cast time, the ready effect and the level limit, and converts the gauge's and the radio's
  pictures.
- Task 3 is a DOM-free module for Neuz's client refusals.
- Tasks 4 to 6 build the cast: the movers' state mode and the ready effect, the own cancels, and the own gauge.
- Task 7 builds the Scroll of Return's two windows, its flow and the return trip from its buff icon.
- Task 8 wires everything into `ItemUse`, the inventory and `WorldScreen`, and adds `travel-items.spec.ts`.
- Task 9 writes the checklist, the README line and the checkpoint.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for DOM tests), Playwright (Chromium), the FlyffWeb converter.

**Spec:** `docs/superpowers/specs/2026-11-03-piece7-design.md`: §3.4 (M3), §4 (M3), §5 (M3 row), §7 (M3). The research,
cited as `[R §n]`, is `docs/superpowers/specs/2026-11-04-piece7-m3-travel-research.md`. C++ paths are relative to
`Blouflash VS22 V15/Source/`.

## Global Constraints

- **No server or gateway change.** Every packet is one Neuz sends, with Neuz's bytes [R §6].
- **C++ table.** Each new module opens with the C++ it copies as a `Function  File:lines  what` table (as
  `hud/dialogue/dialogWindow.ts`).
- **Strings** come from `data.texts` by TID name, with the English of [R §7] as the fallback. The world titles ("Azria",
  "House") and the village window's labels are hard-coded with their source [R §2, §5].
- **The phone rule** is `(max-width: 1000px) and (pointer: coarse)`. Phone text is at least 14 px.
- **Out of scope:**
  - custom server features;
  - the Escape motion (`MOT_BASE_ESCAPE`, the Escape Blinkwing's virtual use);
  - flying, until M5. The flying refusal reads a `flying()` that returns false.
- No new dependency.
- **Builders run:**
  - `npx vitest run <the task's test files>`;
  - `npm run typecheck`;
  - at most the one browser spec their task changes, through `.superpowers/sdd/e2e-5175.config.ts` (chromium and phone).
- **Ports:** the owner's `dev:client` holds 5174, so never stop it. The M2 session uses 5176.
- **Corpus tests** run with `FLYFF_CLIENT=C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client`.

## Decisions

1. **No casting motion.** The cast is the stand pose, the ready effect at the caster (Blinkwings only) and the gauge over
   the own head [R §3].
2. **The own gauge starts at STATEMODE ON**, when it arrives (`m_nReadyTime = timeGetTime()`), not at the send. A mover
   met mid-cast (ADD_OBJ) gets the effect and no gauge.
3. **One cancel per cast.** Neuz sends one at each trigger, and the server ignores the extras; the browser sends one and
   waits for the server's CANCEL or OFF.
4. **Where the cast refuses commands.** A skill command or an attack command during the cast sends the cancel and is
   refused (`MoverMsg.cpp:196-202`, `Mover.cpp:6484-6494`). The guard sits in the command paths only, never in a
   per-frame check such as the Attack button's enabling.
5. **Item buff icons.** `BuffStatus` shows BUFF_ITEM, BUFF_ITEM2 and BUFF_EQUIP buffs with the item's icon
   (`WndWorld.cpp:9691-9760`), so the Scroll of Return's 4-hour buff shows, and blinks (`:9725`). Its double-click sends
   RETURNSCROLL −1 (`WndField.cpp:18552-18572` → `WndWorld.cpp:7265-7266`). On a phone, two taps within 500 ms are the
   double-click.
6. **The shop window refuses use from the bag.** With the shop window open, using any item from the bag (the PC
   double-click or the phone's Use) says TID_GAME_TRADELIMITUSING and sends nothing (`WndField.cpp:2541-2547`). The task
   bar does not check (`WndManager.cpp:2724-2778`).
7. **The level limit is the server's.** The client sends, and the server refuses after the cast [R §4].
8. **Travel itself is unchanged.** Another world uses Piece 5's REPLACE path; the same world uses SETPOS with the 0.5 s
   camera ease [R §8].
9. **The Escape Blinkwing from the bag** (10435, IK2_BLINKWING) goes the Town Blinkwing's path. Nothing special.

## Review Focus

1. **The Attack button during a cast.** A target is selected while a Blinkwing casts: the Attack button's per-frame
   enabling sends no STATEMODE cancel. Only a press does, and the press attacks nothing.

   Test: Task 5 Step 1, "the per-frame attack check sends no cancel".
2. **A long jump in the same world.** A Town Blinkwing from Flaris' outskirts to Saint Morning's revival point, about
   1,500 m by SETPOS: the character stands at the destination once the ground loads. It does not fall, and does not
   snap back.

   Test: Task 8 Step 5, "a Town Blinkwing: the cast, the server's SETPOS far away".
3. **A cast that ends in another world.** A Blinkwing of Volcan ends with REPLACE to world 203. The ready effect and the
   gauge go with the old world; Volcane enters with no errors.

   Test: Task 8 Step 5, "a Blinkwing of Volcan to another world".
4. **The Scroll's answer when things changed.** RETURNSCORLL arrives after the player started walking, or after the
   scroll was used up: the use is checked again and refused (TID_PK_STAND_LIMIT), or sends nothing. A second Scroll use
   while its box is open does nothing.

   Test: Task 7 Step 1, "the answer re-checks the use" and "a second use while the box is open does nothing".
5. **The village window on a 750 × 342 phone.** It shows whole, at least 14 px text; its radios and OK can be tapped.

   Test: Task 8 Step 5 (`travel-items.spec.ts`, phone project).

---

### Task 1: Protocol: the travel packets, the cast snapshots and the testkit writers

**Files:**
- Modify:
  - `packages/protocol/src/constants.ts`
  - `packages/protocol/src/world/items.ts` (`encodeUseItem` uses the new constant)
  - `packages/protocol/src/world/readers.ts`
  - `packages/protocol/src/world/types.ts`
  - `packages/protocol/src/world/addObj.ts:119`
  - `packages/protocol/src/messages/world.ts` (`WorldPacket`, `decodeClientPacket`)
  - `packages/protocol/src/index.ts`
  - `apps/client/src/world/WorldSession.ts`
  - `packages/testkit/src/world.ts`
  - `packages/testkit/src/index.ts`
- Create: `packages/protocol/src/world/travel.ts`
- Test:
  - `packages/protocol/test/travel.test.ts` (new)
  - `packages/protocol/test/world.test.ts` (the constants against MsgHdr.h)
  - `packages/protocol/test/addObj.test.ts`
  - `packages/testkit/test/world.test.ts`
  - `apps/client/test/worldSession.test.ts`

**Interfaces:**
- Produces:
  - `PacketType.DOUSEITEM = 0x00ff0021`, `PacketType.STATEMODE = 0xffffff7a`, `PacketType.RETURNSCROLL = 0xf000d010`.
  - `MessageType.STATEMODE = 0x00df`, `MessageType.RETURNSCORLL = 0x00ad`.
  - `STATE_BASEMOTION_MODE = 4`, and `StateModeFlag = { ON: 0, OFF: 1, CANCEL: 2 } as const` (exported from `travel.ts`).
  - `encodeStateModeCancel(): Uint8Array` writes `u32 4, u8 2`.
  - `encodeReturnScroll(select: number): Uint8Array` writes `i32 select`, and throws a `RangeError` outside −1..2.
  - `WorldMessage` gains:
    - `{ type: 'stateMode'; mode: number; flag: number; itemId: number | null }`, where `itemId` is read only when the
      flag is ON;
    - `{ type: 'returnScrollAck' }`.
  - `AddedPlayer.useItemId: number` (0 is none).
  - `WorldPacket` gains:
    - `{ type: 'useItem'; objectId: number; targetId: number; part: number }`, where `objectId` is the id's high word;
    - `{ type: 'stateMode'; mode: number; flag: number }`;
    - `{ type: 'returnScroll'; select: number }`.
  - `WorldSession.sendStateModeCancel(): void` and `WorldSession.sendReturnScroll(select: number): void`.
  - The testkit gains:
    - `writeStateMode(objectId: number, mode: number, flag: number, itemId?: number): ScriptMessage`;
    - `writeReturnScrollAck(objectId: number): ScriptMessage`;
    - `writeUpdateItem(objectId: number, itemObjectId: number, param: number, value: number): ScriptMessage`, which
      writes type 0 and time 0;
    - the ADD_OBJ writers write `useItemId` (default 0).

- [ ] **Step 1: Write the failing tests.**
  - `travel.test.ts`:
    - "encodeStateModeCancel writes mode 4 and CANCEL": after the 8-byte header, `u32 4, u8 2`; 13 bytes in all.
    - "encodeReturnScroll writes the choice, −1 to 2 only": `encodeReturnScroll(1)` ends with `i32 1`; 3 and −2 throw.
    - "STATEMODE reads the item only when ON":
      - `[u32 4, u8 0, u32 4805]` reads as `{ mode: 4, flag: 0, itemId: 4805 }`;
      - `[u32 0, u8 1]` reads as `itemId: null`;
      - each ends exactly (`expectEnd`).
    - "RETURNSCORLL has no body".
    - "decodeClientPacket names DOUSEITEM, STATEMODE and RETURNSCROLL": `encodeUseItem(6)` decodes to
      `{ type: 'useItem', objectId: 6, targetId: 0xffffffff, part: -1 }`; the other two round-trip.
  - `addObj.test.ts`: "keeps the cast item of a mover in view", `useItemId: 4805`.
  - `world.test.ts`: the five constants against MsgHdr.h, as its table does.
  - `testkit/test/world.test.ts`: add the three writers to "every writer decodes to what it was given".
  - `worldSession.test.ts`: "sendStateModeCancel and sendReturnScroll send only while playing".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run packages/protocol/test/travel.test.ts packages/protocol/test/addObj.test.ts packages/protocol/test/world.test.ts packages/testkit/test/world.test.ts apps/client/test/worldSession.test.ts`
  - Expected: FAIL, with the new names undefined.
- [ ] **Step 3: Implement.**
  - Write the readers in `travel.ts`, registered in `WORLD_READERS`.
  - `encodeUseItem` keeps its bytes and uses `PacketType.DOUSEITEM`.
  - `addObj.ts:119` keeps the u32 as `useItemId`.
  - Cite `DPClient.cpp:9736-9742`, `:15776-15781`, `:12381-12440`, `:677` and `User.cpp:5171-5209`, `:6636-6645`.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS. Then run `npm run typecheck`: exit 0.
- [ ] **Step 5: Commit.**
  - `feat(protocol): the travel packets, STATEMODE and RETURNSCORLL, and ADD_OBJ's cast item`

### Task 2: The catalog: cast time, ready effect and level, and the new pictures

**Files:**
- Modify:
  - `packages/formats/src/inc/propItem.ts` (`KEPT`, `ItemProp`)
  - `packages/formats/src/web/gameData.ts` (`WebItemProp`)
  - `tools/convert/src/data/gameDataStage.ts` (`buildItemProps`)
  - `tools/convert/src/ui/uiStage.ts` (`THEME_FILES`)
- Test:
  - `packages/formats/test/propItem.test.ts`
  - `tools/convert/test/gameDataStage.test.ts`
  - `tools/convert/test/gameData.corpus.test.ts`
  - `tools/convert/test/uiStage.corpus.test.ts`

**Interfaces:**
- Produces three optional `WebItemProp` fields, each omitted when the column is 0, −1 or `=`:
  - `castMs?: number` (`dwSkillReadyType`);
  - `sfxReady?: number` (`dwSfxObj`);
  - `levelLimit?: number` (`dwLimitLevel1`).
- Produces three new theme files: `ui/gauaccelbg.png`, `ui/gauaccelinner.png` and `ui/buttradio.png`
  (`GauAccelBG.TGA`, `GauAccelInner.TGA`, `ButtRadio.bmp`).

- [ ] **Step 1: Write the failing tests.**
  - `propItem.test.ts`: "keeps the cast time, the ready effect and the level limit", from a fixture row.
  - `gameDataStage.test.ts`: "item props carry castMs, sfxReady and levelLimit only when set".
  - `gameData.corpus.test.ts`: "the travel items' cast and effect":
    - 4805: `castMs` 10000, `sfxReady` 118;
    - 4806: `levelLimit` 15;
    - 10469: `castMs` 4000, with no `sfxReady`;
    - 4811: `weaponType` 203.
  - `uiStage.corpus.test.ts`: the three pictures are converted, at 112×16, 112×16 and 84×14.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run packages/formats/test/propItem.test.ts tools/convert/test/gameDataStage.test.ts`
  - Expected: FAIL.
  - The corpus tests: the Step 4 command. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the columns to `KEPT` under the names `ITEM_COLUMNS` uses.
  - Export them in `buildItemProps`.
  - Add the three files to `THEME_FILES` next to the other gauges.
  - Old catalogs have none of the fields, and nothing needs them to.
- [ ] **Step 4: Run the tests and convert.**
  - Run the Step 2 command, then:
    `FLYFF_CLIENT="C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" npx vitest run --config vitest.corpus.config.ts tools/convert/test/gameData.corpus.test.ts tools/convert/test/uiStage.corpus.test.ts`
  - Then convert: `npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" --only "GauAccelBG*,GauAccelInner*,ButtRadio*,data"`
  - Expected: PASS; the convert reports 0 failed.
- [ ] **Step 5: Commit.**
  - `feat(formats,convert): the items' cast time, ready effect and level limit; the gauge's and the radio's pictures`

### Task 3: Neuz's client refusals for the travel items

**Files:**
- Create: `apps/client/src/world/items/travelItems.ts`
- Test: `apps/client/test/travelItems.test.ts`

**Interfaces:**
- Consumes `WebItemProp` (Task 2).
- Produces:
  - `IK2_BLINKWING = 22`, `RETURN_SCROLL = 10469`, `KEBARAS = 2`, `GUILDWAR = 202`, `MINIROOM = 209`.
  - `isTravelItem(prop: WebItemProp): boolean`: kind2 22, or id 10469.
  - `usableFromBag(prop: WebItemProp): boolean`: kind2 11, 12 or 14, or `isTravelItem`.
  - `interface UseCheck { prop: WebItemProp; worldId: number; casting: boolean; standing: boolean; flying: boolean; returnBuff: boolean }`.
  - `type Refusal = { kind: 'say'; tid: string; args?: string } | { kind: 'box'; tid: string }`.
  - `useRefusal(check: UseCheck): Refusal | null`, in `SendDoUseItem`'s order [R §2]:
    1. `prop.castMs` set, and casting: TID_PK_BLINK_LIMIT;
    2. `castMs` set, and not standing: TID_PK_STAND_LIMIT;
    3. `castMs` set, and flying: TID_PK_FLIGHT_NOUSE;
    4. kind2 22 in KEBARAS: TID_PK_BLINK_NO with "Azria";
    5. kind2 22 in GUILDWAR: the box TID_GAME_GUILDCOMBAT_NO_OUTWAR;
    6. kind2 22 in MINIROOM: TID_PK_BLINK_NO with "House";
    7. 10469 with `returnBuff`: TID_GAME_LIMITED_USE.
  - `castFill(elapsedMs: number, castMs: number): number`: `trunc(112 × elapsed / castMs)`, clamped to 0..112
    (`MoverRender.cpp:2034-2041`).

- [ ] **Step 1: Write the failing tests** in `travelItems.test.ts`.
  - "each refusal in Neuz's order": one case per rule, and the earlier rule wins when two hold (casting and not
    standing gives BLINK_LIMIT).
  - "a potion has no cast refusals": a potion with no `castMs` is never refused for casting or standing.
  - "Kebaras and the house name the world".
  - "the Scroll of Return is refused only with its buff on".
  - "usableFromBag takes the travel items and the three old kinds".
  - "castFill clamps to 0..112": −5 gives 0, half gives 56, 2× gives 112.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/travelItems.test.ts`
  - Expected: FAIL, the module is missing.
- [ ] **Step 3: Implement** the module, with the C++ table (`DPClient.cpp:10254-10431`, `Mover.cpp:2768-2828`,
  `MoverRender.cpp:1982-2043`, `World.inc:105-108,301-304`).
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): Neuz's refusals for the travel items (SendDoUseItem, IsUseItemReadyTime)`

### Task 4: The cast in the world: the movers' state mode and the ready effect

**Files:**
- Modify:
  - `apps/client/src/world/WorldState.ts` (`Mover`, the mover switch at `:394-509`, ADD_OBJ, `CombatEvent`)
  - `apps/client/src/world/fx/EffectManager.ts` (`EffectRequest`, `step`)
- Test:
  - `apps/client/test/worldState.test.ts`
  - `apps/client/test/effectManager.test.ts`

**Interfaces:**
- Consumes Task 1's `stateMode` message and `useItemId`.
- Produces:
  - `Mover.stateMode: number`, from ADD_OBJ, then STATEMODE.
  - `Mover.cast: { itemId: number; startedAt: number | null } | null`:
    - set on ON, with `startedAt` = the world clock (`nowMs`);
    - set from ADD_OBJ when the mode has 4 and `useItemId` ≠ 0, with `startedAt: null`;
    - cleared on OFF or CANCEL.
  - `CombatEvent` gains `{ kind: 'itemCast'; moverId: number; itemId: number; fresh: boolean }`. It is emitted:
    - on ON, with `fresh: true`;
    - for a mover added mid-cast, with `fresh: false`.
  - `EffectRequest.whileTrue?: () => boolean`: the effect's model loops while this holds, and the effect is deleted the
    tick it stops holding, or when its follow mover is gone (`CSfxReady::Process`, `Sfx.cpp:3826-3837`).

- [ ] **Step 1: Write the failing tests.**
  - `worldState.test.ts`:
    - "STATEMODE ON starts a cast and says so": `cast.itemId` is 4805, `startedAt` is the clock, and the event has
      `fresh: true`.
    - "OFF and CANCEL end it": `cast` is null, and `stateMode` has no 4.
    - "a mover added mid-cast has the effect and no clock": `startedAt: null`, `fresh: false`.
  - The effect test: "an effect with whileTrue loops until it is false". Its model has ended twice and it still plays;
    once the predicate is false it is gone on the next step.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/worldState.test.ts apps/client/test/effectManager.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `step`, a `whileTrue` effect checks the predicate first, and rewinds its model when it ends (as `seconds` does).
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the movers' cast state (OnStateMode) and an effect that lasts while a cast does (CSfxReady)`

### Task 5: The own cast: the cancels and the commands it refuses

**Files:**
- Create: `apps/client/src/world/items/itemCast.ts`
- Modify:
  - `apps/client/src/world/skills/skillUse.ts` (`cmdSetUseSkill`, `:523-579`)
  - `apps/client/src/world/combat/attackLoop.ts` (the command paths)
- Test:
  - `apps/client/test/itemCast.test.ts`
  - `apps/client/test/skillUse.test.ts`
  - `apps/client/test/attackLoop.test.ts`

**Interfaces:**
- Consumes `Mover.stateMode` and `cast` (Task 4), and `WorldSession.sendStateModeCancel` (Task 1).
- Produces `class ItemCast`:
  - `constructor(own: () => Mover | undefined, send: { sendStateModeCancel(): void })`;
  - `get casting(): boolean`: the own mover's mode has 4;
  - `interrupt(): boolean`: while casting, sends the cancel once per cast, and returns `casting`;
  - `started(): void`: on an own fresh `itemCast`, re-arms the one cancel.
- Produces two hooks, both defaulting to `() => false`:
  - `SkillUse` takes an optional `interruptCast: () => boolean`. True refuses `cmdSetUseSkill` before anything else.
  - `AttackLoop` takes the same option. It is checked only where an attack command is made: `cmdSetMagicAttack`,
    `cmdSetRangeAttack`, and where the melee command is set.
    - True refuses the command.
    - An auto-attack keeps trying each step; `ItemCast` sends only the one cancel. Once the server's CANCEL ends the
      cast, the attack goes ahead, as Neuz's `IsAttackAble` lets it.
    - It is never checked in `isAttackAble`, `canAttackFocus` or `gauge`.

- [ ] **Step 1: Write the failing tests.**
  - `itemCast.test.ts`:
    - "interrupt sends one cancel a cast";
    - "a new cast re-arms it";
    - "not casting, interrupt sends nothing and returns false".
  - `skillUse.test.ts`: "a skill during a cast sends the cancel and is not used".
  - `attackLoop.test.ts`:
    - "an attack press during a cast cancels it and attacks nothing";
    - "the per-frame attack check sends no cancel" (Review Focus 1): `canAttackFocus()` and `gauge()` run 60 times, and
      the cancel count stays 0.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/itemCast.test.ts apps/client/test/skillUse.test.ts apps/client/test/attackLoop.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**, citing `DPClient.cpp:9736-9742`, `MoverMsg.cpp:196-202` and `Mover.cpp:6484-6494`.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the own cast's cancel, and the skill and attack commands it refuses`

### Task 6: The own casting gauge

**Files:**
- Create: `apps/client/src/world/render/CastGauge.ts`
- Test: `apps/client/test/castGauge.test.ts`

**Interfaces:**
- Consumes `castFill` (Task 3), and the theme pictures `GauAccelBG.TGA` and `GauAccelInner.TGA` (Task 2).
- Produces `class CastGauge` (modelled on `render/ChargeGauge.ts`):
  - `constructor(art: UiArt, doc?: Document)` and `element: HTMLElement` (`.cast-gauge`, hidden);
  - `update(fill: number | null, head: Vec3 | null, camera: Camera, width: number, height: number): void`;
  - `dispose(): void`.
- **Layout:**
  - The top of the head is projected, then raised 48 px.
  - The background is drawn at `(x − 42, y − 5)`, at 112×16 scaled 0.8 × 0.55 (89.6 × 8.8 px), at alpha 200/255.
  - The fill is drawn at the same point, at `fill × 0.8` px wide, 8.8 px high, alpha 1 (`MoverRender.cpp:2026-2042`).
  - `fill: null` hides it.

- [ ] **Step 1: Write the failing tests** in `castGauge.test.ts`, with a fixed camera.
  - "the gauge sits 48 px above the head": left = projected x − 42, top = projected y − 48 − 5.
  - "the fill is fill × 0.8 px wide": fill 56 gives 44.8 px.
  - "null hides it".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/castGauge.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**, with CSS next to `.charge-gauge` in `style.css`.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the own casting gauge (CMover::RenderCasting)`

### Task 7: The Scroll of Return: the box, the village window, the flow and the return trip

**Files:**
- Create:
  - `apps/client/src/world/hud/messageBox.ts`
  - `apps/client/src/world/hud/selectVillageWindow.ts`
  - `apps/client/src/world/items/returnScroll.ts`
- Modify: `apps/client/src/world/hud/buffStatus.ts` (item icons, the blink, the double-click)
- Test:
  - `apps/client/test/messageBox.test.ts`
  - `apps/client/test/selectVillageWindow.test.ts`
  - `apps/client/test/returnScroll.test.ts`
  - `apps/client/test/buffStatus.test.ts`

**Interfaces:**
- Consumes `WorldSession.sendReturnScroll` (Task 1) and `useRefusal` (Task 3).
- Produces `class MessageBox`, Neuz's `CWndMessageBox` (APP_MESSAGEBOX, `WndMessagebox.tga`):
  - `constructor(art: UiArt, texts: Texts, doc?: Document)`;
  - `frame`, `modal: ModalBackdrop`;
  - `open(text: string, buttons: 'ok' | 'okCancel', onOk: () => void, onCancel?: () => void): void`;
  - `get isOpen(): boolean`.
  - **Layout** (`WndMessageBox.cpp:65-128`, as `LogOutBox` does):
    - the text at (10,10);
    - 60×25 buttons sized to their texture, at y = client height − 30;
    - MB_OKCANCEL: OK at the centre − 70, Cancel at the centre + 10;
    - MB_OK: one button at the centre − 30.
- Produces `class SelectVillageWindow`, APP_COMM_SELECTVIL [R §5]:
  - `constructor(art: UiArt, doc?: Document)`;
  - `frame`, `modal`;
  - `open(onChoose: (select: 0 | 1 | 2) => void): void`.
  - **Layout:**
    - tiled `WndTile00`, 176×144, centred;
    - the title "Choose the Village to Return", and the static "Choose the Village" at (10,8);
    - three radios in `ButtRadio.bmp` (six 14×14 frames; which frame shows for which state comes from `CWndButton`'s
      radio drawing in `_Interface/WndControl.cpp`): "Flaris" (8,28), "Sain City" (8,46), "Darken City" (8,64), with
      Flaris checked;
    - OK (8,82)-(80,102) and Cancel (84,82)-(156,102).
  - On a phone it uses `{ mobileScale: 1, fitWhole: true }`, as the teleporter does.
- Produces `class ReturnScroll` (`DPClient.cpp:10416-10431`, `:15784-15787`):
  - `constructor(box: MessageBox, villages: SelectVillageWindow, send: { sendReturnScroll(select: number): void }, texts: Texts)`;
  - `begin(objectId: number): void`: stores `m_dwReturnScroll` and opens the box with TID_GAME_RETURN_USEITEM. OK
    opens the village window, and the village's OK sends RETURNSCROLL with the choice. A box already open does
    nothing.
  - `answered(): number | null`: on `returnScrollAck`, gives the stored object id to use again with no box, or null
    when nothing is stored.
  - `goBack(): void`: sends RETURNSCROLL −1.
- `BuffStatus.update` shows BUFF_ITEM (0), BUFF_ITEM2 (3) and BUFF_EQUIP buffs with the item's icon
  (`ui/item/<icon>.png`, through the item props it is given), in Neuz's order (`WndWorld.cpp:9691-9760`). Item 10469's
  icon always blinks (`:9725`).
- `BuffStatus` takes `onReturnScroll: () => void`. It runs on a double-click on 10469's icon, or on a phone on two taps
  on it within 500 ms.

- [ ] **Step 1: Write the failing tests.**
  - `messageBox.test.ts`:
    - "OK and Cancel sit where CWndMessageBox puts them";
    - "MB_OK has one centred button";
    - "the text goes in as text, not markup".
  - `selectVillageWindow.test.ts`:
    - "Flaris is checked first";
    - "OK sends the checked village";
    - "Cancel sends nothing".
  - `returnScroll.test.ts`:
    - "the box, the village, then RETURNSCROLL 1";
    - "Cancel at the box sends nothing";
    - "the answer re-checks the use" (Review Focus 4): `answered()` gives the stored id, and a cleared store gives
      null;
    - "a second use while the box is open does nothing".
  - `buffStatus.test.ts`:
    - "an item buff shows the item's icon";
    - "the Scroll of Return's icon blinks";
    - "a double-click on it goes back";
    - "two taps within 500 ms go back, two 600 ms apart do not".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/messageBox.test.ts apps/client/test/selectVillageWindow.test.ts apps/client/test/returnScroll.test.ts apps/client/test/buffStatus.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The village labels are constants citing `resData.txt.txt:3141-3149`.
  - The phone panel's CSS goes next to the teleporter's.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the Scroll of Return's box and village window (CReturnScrollMsgBox, CWndSelectVillage) and its return trip`

### Task 8: Wiring, and `travel-items.spec.ts`

**Files:**
- Modify:
  - `apps/client/src/world/items/itemUse.ts`
  - `apps/client/src/world/hud/inventoryWindow.ts:138-142`, `:236-247`
  - `apps/client/src/world/WorldScreen.ts`
  - `apps/client/src/style.css`
- Create: `apps/client/e2e/travel-items.spec.ts`
- Test:
  - `apps/client/test/itemUse.test.ts`
  - `apps/client/test/inventoryWindow.test.ts`

**Interfaces:**
- Consumes everything above.
- `ItemUse` changes:
  - It becomes `constructor(own, props, session: ItemUseSender, check: () => Omit<UseCheck, 'prop'>, say: (r: Refusal) => void, returnScroll: ReturnScroll)`.
  - `use(objectId, from: 'bag' | 'bar' | 'again' = 'bar'): boolean`:
    1. the old gate, widened with `usableFromBag`;
    2. `'bag'` with the shop window open: say TID_GAME_TRADELIMITUSING (Decision 6);
    3. `useRefusal`;
    4. 10469 not `'again'`: `returnScroll.begin(objectId)`, and return true;
    5. otherwise send.
  - `ItemUseSender` gains `sendReturnScroll`.
- The inventory's double-click and phone Use pass `'bag'`, the task bar `'bar'`, and the RETURNSCORLL answer `'again'`.
  The phone Use button shows for `usableFromBag(prop)`.
- `WorldScreen` changes:
  - It makes `ItemCast`, `CastGauge`, `MessageBox`, `SelectVillageWindow` and `ReturnScroll`, wired as `LogOutBox` is:
    `modalChanged`, the Escape guard, `drop()`, `disposeWorld` and the key list.
  - **Cancels.** It calls `itemCast.interrupt()`:
    - in `step`, on `intent.forward !== 0 || jump || tap !== null` (turning alone does not);
    - on a `hit` event whose victim or attacker is the own mover;
    - on an own fresh `itemCast` while not standing (`DPClient.cpp:12419-12422`), right after `itemCast.started()`,
      which every own fresh `itemCast` calls.
  - **Buff icons.** `BuffStatus` is given the item props and `onReturnScroll: () => returnScroll.goBack()`.
  - **The ready effect.** On `itemCast`, it plays the item's `sfxReady` at the mover with `followId` and
    `whileTrue: () => (world.movers.get(id)?.stateMode ?? 0) & 4`. The Scroll has none.
  - **The gauge.** Each frame it updates the gauge for the own mover, with
    `castFill(now − cast.startedAt, prop.castMs)` when `startedAt` is set, else null.
  - **The answer.** On `returnScrollAck`, it runs `itemUse.use(id, 'again')` with the id `answered()` gives.
  - **The guild-war refusal** opens `MessageBox` with `'ok'`.
  - The own "standing" check is `(own.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND`, and `flying` returns false.

- [ ] **Step 1: Write the failing unit tests.**
  - `itemUse.test.ts`:
    - "a Blinkwing is sent from the bar";
    - "from the bag with the shop open, nothing is sent and the trade text is said";
    - "a refusal is said and nothing sent";
    - "the Scroll opens its box, and only 'again' sends it".
  - The inventory test: "the phone's Use shows for a Blinkwing and the Scroll".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/itemUse.test.ts apps/client/test/inventoryWindow.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement the wiring.**
  - Run: the Step 2 command, then `npm run typecheck`.
  - Expected: PASS, exit 0.
- [ ] **Step 4: Write `travel-items.spec.ts`** against the pretend world server. Webby holds 5 Town Blinkwings at
  object id 2 (`newVagrantOwn`). Add a Blinkwing of Volcan and a Scroll of Return to the bag in the script.
  - **"a Town Blinkwing: the cast, the server's SETPOS far away":**
    1. F1 on a task bar slot holding the Blinkwing sends DOUSEITEM with object 2.
    2. The script answers STATEMODE ON 4805, and the gauge and the ready effect show.
    3. Then OFF, UPDATE_ITEM count 4 and SETPOS to Saint Morning's revival point (8470.58, 100, 3635.79).
    4. Webby stands there 3 s later, within 1 m and not below the ground (Review Focus 2).
    5. The bag shows 4, and `stats().errors` is empty.
  - **"a Blinkwing of Volcan to another world":** DOUSEITEM, ON, OFF, UPDATE_ITEM, then REPLACE 203 and the own
    ADD_OBJ. Volcane enters; there is no gauge, and no errors (Review Focus 3).
  - **"walking cancels the cast":** after ON, a forward key sends one STATEMODE `{ mode: 4, flag: 2 }`. The script's
    CANCEL hides the gauge.
  - **"a refusal: not standing":** with the forward key held, the Blinkwing's use says "You can use it when you stand
    up." and sends no DOUSEITEM.
  - **"the Scroll of Return":**
    1. Use from the bag; the box text is TID_GAME_RETURN_USEITEM's.
    2. OK, then pick "Sain City", then OK: RETURNSCROLL 1 is sent.
    3. The script's RETURNSCORLL brings a second DOUSEITEM with the scroll's id, and no second box.
    4. On the phone project, the village window fits the screen, with text at least 14 px (Review Focus 5).
- [ ] **Step 5: Run the spec.**
  - Run: `npx playwright test -c .superpowers/sdd/e2e-5175.config.ts --project=chromium --project=phone apps/client/e2e/travel-items.spec.ts`
  - Expected: all pass.
- [ ] **Step 6: Commit.**
  - `feat(client): Blinkwings and the Scroll of Return in the world, and travel-items.spec.ts`

### Task 9: The checklist, the README and the checkpoint

**Files:**
- Modify: `docs/device-testing.md`, `README.md`
- Create: `docs/piece7-m3-checkpoint.md`

- [ ] **Step 1: The checklist.** Add a "Piece 7, milestone 3: Blinkwings and scrolls" section to `docs/device-testing.md`
  in M1's form: steps, a results table, pass or fail, and the commands. The steps:
  1. Buy a Blinkwing of Flaris and a Town Blinkwing from Marche, on the third tab.
  2. Use the Town Blinkwing from the task bar, and watch the effect, the gauge and the move.
  3. Walk during a cast to cancel it.
  4. Use one while walking to see the refusal.
  5. A GM gives a Blinkwing of Volcan; use it to go to another world.
  6. A GM gives a Scroll of Return; pick a village; double-click (phone: double-tap) its buff icon to go back.
  7. Do all of it on the phone.
- [ ] **Step 2: The README.** Add the milestone 3 sentence after milestone 2's.
- [ ] **Step 3: The checkpoint.** Write `docs/piece7-m3-checkpoint.md`: what changed, the Decisions, every ruling, the
  evidence, the owner's commands and the convert command of Task 2.
- [ ] **Step 4: Commit.**
  - `docs(piece7): M3 checklist and checkpoint`
