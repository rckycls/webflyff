# Craft Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bozman's "Craft Card" window: a Craft Stone plus 1-5 low piercing cards roll for one random top card; VIP
characters can repeat the same combination up to 5/10/15/20 times. The World server decides everything.

**Architecture:** One new client→World packet (`0x8FFF0110`) and one World→client snapshot (`0x9A01`) in a World-only
patch; the World checks, takes, rolls and gives per try. FlyffWeb adds the Craft Stone to its catalog and Bozman's menu
line in code (no convert), and a new `NpcWindow` (as Create Jewels) with a result part, a bulk button and a confirm box.

**Tech Stack:** C++ (VS 2022, `Source\all\all.sln`, WorldServer Release|Win32); TypeScript (FlyffWeb monorepo, vitest,
Playwright Chromium).

**Spec:** `docs/superpowers/specs/2026-11-19-craft-card-design.md` (FlyffWeb branch `craft-card`).

Worktrees: FlyffWeb `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\craft-card` (branch `craft-card`, from
aab21bf); outer `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash-worktrees\craft-card` (branch `craft-card`, from bc6ac37).

## Global Constraints

- Packet `PACKETTYPE_CRAFT_CARD` = `0x8FFF0110`; snapshot `SNAPSHOTTYPE_CRAFT_CARD` = `0x9A01`.
- Craft Stone: `II_GEN_MAT_CRAFTSTONE` = 20280, "Craft Stone", stacks to 99, tradeable, IK1_GENERAL / IK2_MATERIAL /
  IK3_SUPSTONE (no use), icon and dropped model of the never-obtained Mineral (3200): `itm_GenMatSupMinera.dds`,
  mdlDyna `"GenMatSupResour"`; web `ui/item/itm_genmatsupminera.png`, `models/item_genmatsupresour.glb`.
- Description: "A stone used for crafting. Bozman in Saint Morning uses it to craft piercing cards."
- Points: 2% / D = 5, 3% / C = 10, 4% / B = 20; +5 per card after the first; 1-5 cards; cap 90.
  `chance = min(90, sum + 5 * (n - 1))`.
- Inputs: suit 2% 3204 3209 3214 3219 3224; 3% 3255 3256 3257 3258 3259; 4% 3207 3212 3217 3222 3227. Weapon D 26594
  26598 26602 26606 26610; C = D+1; B = D+2.
- Results (equal odds): suit 3208 3213 3218 3223 3228; weapon A 26597 26601 26605 26609 26613. These and the
  "seghope" cards (3237-3254, 3500-3532) are refused as inputs.
- Tries: 1 for all; letter 'A' 5, 'B' 10, 'C' 15, 'E' 20; game masters (letter >= 'L') 20.
- Fail loses the stone and every card; no penya cost.
- Drop: `DropItem(II_GEN_MAT_CRAFTSTONE, 8000, 0, -1, 1, 150);` in `Resource/propDropEvent.inc`.
- Bozman = NPC key `MaSa_Bozman`; menu range `MAX_LEN_MOVER_MENU` (1024, squared length).
- Resource files keep their encoding and line endings (propItem.txt, propItem.txt.txt, defineItem.h,
  propDropEvent.inc: ANSI/CP949 bytes; mdlDyna.inc: check its first bytes and keep them). Edit with byte-safe tools.
- Never run the converter against FlyffWeb main; never test against the live server; port 5174 is the owner's.
- The World patch goes after the 13 on main Source and must `git apply --check` next to the unmerged
  `awaken-window` and `vip-perks` patches in either order.

## Review Focus

1. **One stack in several slots** (four 4% cards from a stack of 3): the server must count uses per object id and
   refuse when the stack is short; the client must not let a 4th slot take a stack of 3. → Task 2 (server reading),
   Task 4 test `affordableTries counts a stack used twice`.
2. **The bag fills mid-bulk:** the World checks room before each try and stops; tries not run cost nothing; the answer
   lists only the tries run. → Task 2, Task 5 test `a bulk answer shorter than asked shows the tries run`.
3. **A refused answer** (too far, bag full, other) keeps the slots and unlocks Craft. → Task 5 test.
4. **No answer** (old World without the patch): Craft unlocks after 3 s, nothing is lost. → Task 5 test.
5. **The VIP letter changes** while the window is open (admin panel): the bulk button follows the letter at each draw;
   the World reads the letter at the press. → Task 5 test `the bulk button hides when the letter is no VIP's`.

---

### Task 1: Craft Stone and its drop (outer repo, Resource data)

**Files (outer worktree):**
- Modify: `Resource/defineItem.h` (after `II_SYS_SYS_SCR_GROUNDMOUNT01 20270`): `#define	II_GEN_MAT_CRAFTSTONE		20280`
- Modify: `Resource/propItem.txt`: a copy of the `II_GEN_MAT_SUP_MINERAL` row (line ~1843) after it, with the id
  `II_GEN_MAT_CRAFTSTONE`, a new name string id, `dwPackMax` 99, and a new description string id (last column).
- Modify: `Resource/propItem.txt.txt`: the two strings (next free `IDS_PROPITEM_TXT_` numbers after the highest used,
  012301: check none is used).
- Modify: `Resource/mdlDyna.inc`: a copy of the `"GenMatSupResour" II_GEN_MAT_SUP_MINERAL` line for `II_GEN_MAT_CRAFTSTONE`.
- Modify: `Resource/propDropEvent.inc`: the drop line (outside any `/* */` block) with a comment
  `// custom (owner 2026-11-19): Craft Stone, every monster, about 1 in 4,900 kills at x77`.
- Modify: `CUSTOM_FEATURES.md`: a Craft Card section (item 20280, packet, snapshot, drop line, Bozman, VIP tries).

- [ ] **Step 1:** Make the five data edits with a byte-safe script (Node `latin1` read/write, or PowerShell with the
  file's encoding); keep CRLF.
- [ ] **Step 2: Verify** each file's first bytes and line endings are unchanged and the new lines are where meant:
  `git diff --stat` shows only these files; `git diff` shows only added lines (no whole-file rewrite).
- [ ] **Step 3: Commit** `feat(resource): Craft Stone (20280) and its monster drop`.

### Task 2: World patch, build and deploy doc (outer repo)

**Files:**
- Copy: main `Source` to the outer worktree's `Source` (`robocopy "<main>\Source" "<wt>\Source" /E`, never /MIR; it is
  git-ignored). Make a scratch git repo inside the copy (`git init`, commit the 5 files below as the baseline) to cut
  the patch.
- Create: `Source/WORLDSERVER/CraftCard.h` (header only, inline): the tables and rules.
- Modify: `Source/_Network/MsgHdr.h` (after `PACKETTYPE_PETFILTER`; after `SNAPSHOTTYPE_HP_LAYER`).
- Modify: `Source/WORLDSERVER/DPSrvr.h`, `DPSrvr.cpp` (handler after `OnSetPetfilter`, same `__VER >= 12` block as its
  `ON_MSG`).
- Modify: `Source/WORLDSERVER/User.h`, `User.cpp` (`AddCraftCard` beside `AddHpLayer`).
- Create: `patches/2026-11-19-craft-card.patch` (paths `Source/...`, from the scratch repo with
  `--src-prefix=a/Source/ --dst-prefix=b/Source/`, CRLF kept: check `git apply --check` works on the CRLF files).
- Create: `Program/7. World.exe` (the build), `docs/2026-11-19-craft-card-deploy.md`.

**Interfaces (produced):**
- `CraftCard.h`: `enum { CRAFTCARD_NONE = 0, CRAFTCARD_SUIT = 1, CRAFTCARD_WEAPON = 2 };`
  `inline int CraftCardKind( DWORD dwItemId )`, `inline int CraftCardPoints( DWORD dwItemId )` (0 = not an input),
  `inline int CraftCardChance( int nPoints, int nCards )`, `inline int CraftCardMaxTries( DWORD dwAuthorization )`,
  `inline DWORD CraftCardResult( int nKind, int nFamily )` (nFamily 0-4), `const DWORD II_CRAFTSTONE = 20280;`
  (named so later crafting reuses it), `const int CRAFTCARD_MAX_CARDS = 5, CRAFTCARD_MAX_TRIES = 20;`.
- Packet body (read in this order): `DWORD npcId, stoneId, card[5], DWORD tries, BYTE stopOnSuccess`.
- Snapshot (`CUser::AddCraftCard( BYTE code, const std::vector<DWORD>& made )`), written under the player's own id:
  `BYTE code, BYTE count, count x DWORD itemId` (0 = a failed try). Codes: 0 ran, 2 too far, 3 bag full, 4 refused.

- [ ] **Step 1:** Copy Source, make the scratch baseline.
- [ ] **Step 2:** Write `CraftCard.h` and the two defines.
- [ ] **Step 3:** Write `CDPSrvr::OnCraftCard`, following the spec's "Server" section in order:
  - read the body; drop silently on a bad user;
  - refuse 4 when dead, trading (`m_vtInfo.GetOther()`), vendor open (`VendorIsVendor()`), `tries` 0 or over
    `CraftCardMaxTries( pUser->m_dwAuthorization )`;
  - refuse 2 when `prj.GetMover( npcId )` is not valid, its `m_szCharacterKey` is not `MaSa_Bozman`
    (case-insensitive), or it is in another world/layer or past `MAX_LEN_MOVER_MENU` (as the L8 vendor check);
  - refuse 4 when the stone is not a usable 20280, a card id is not usable / not an input / of the other kind, there
    are 0 cards, or an object id's uses (stone included) exceed its `m_nItemNum`;
  - refuse 3 unless every one of the kind's 5 possible result cards fits (`m_Inventory.IsFull( &probe, pProp, 1 )`
    FALSE for each, the probe a `CItemElem` of that id, count 1);
  - per try: re-check the same (stop quietly when short or no room), take with `RemoveItem`/`UpdateItem UI_NUM`
    grouped per object id, item logs (`PutItemLog( pUser, "u", "CraftCard", pItem, n )`), roll
    `xRandom( 100 ) < chance`, on success `CreateItem` the `CraftCardResult( kind, xRandom( 5 ) )` and log it
    (`LogItemInfo` Action "&", RecvName "CRAFTCARD"), push the id or 0; stop after a success when `stopOnSuccess`;
  - after the tries: `SND_INF_UPGRADESUCCESS` + `XI_INT_SUCCESS` if any success, else `SND_INF_UPGRADEFAIL` +
    `XI_INT_FAIL` (not in transparent mode, as OnAwakenWindow); `AddCraftCard( 0, made )`.
- [ ] **Step 4: Build:** MSBuild `Source\all\all.sln -t:WorldServer -p:Configuration=Release;Platform=Win32` →
  expected `0 Error(s)`. Copy the World exe to `Program\7. World.exe`; note size and SHA-256.
- [ ] **Step 5: Cut the patch**; verify:
  - `git apply --check patches/2026-11-19-craft-card.patch` from the outer **main** root → no output (main Source);
  - on a scratch copy: awaken-window's patch then this one, and vip-perks' two then this one → both apply.
- [ ] **Step 6:** Write the deploy doc (what the World does, the refusal table, exe hash, VPS PowerShell steps with
  `Copy-Item -Force` and `Get-FileHash`, the 5 Resource files, restart Database + World, the in-game checks: GM `/ci`
  20280 and cards, single craft, 7%/A refused, mixing refused, too far, bag full, bulk 5 as VIP1, stop at first
  success, an old World ignores the packet).
- [ ] **Step 7: Commit** `feat(server): Craft Card at Bozman (packet 0x8FFF0110, snapshot 0x9A01)`.

### Task 3: Protocol: the packet and the snapshot (FlyffWeb)

**Files:**
- Create: `packages/protocol/src/world/craftCard.ts`
- Modify: `packages/protocol/src/constants.ts` (`CRAFT_CARD: 0x8fff0110` after `PET_FILTER`),
  `packages/protocol/src/world/readers.ts` (`...CRAFT_CARD_READERS`), `packages/protocol/src/world/types.ts`
  (union), `packages/protocol/src/index.ts` (export), `packages/protocol/src/messages/world.ts` (decode the client
  packet as `{ type: 'craftCard', ... }`, as PET_FILTER is).
- Create: `packages/testkit/src/craftCard.ts` (`writeCraftCard`), export in `packages/testkit/src/index.ts`.
- Test: `packages/protocol/test/craftCard.test.ts`

**Interfaces (produced):**
- `CraftCardMessageType = { CRAFT_CARD: 0x9a01 } as const`
- `type CraftCardMessage = { type: 'craftCard'; code: number; made: number[] }`
- `CraftCardCode = { RAN: 0, TOO_FAR: 2, BAG_FULL: 3, REFUSED: 4 } as const`
- `encodeCraftCard(request: CraftCardRequest): Uint8Array` with
  `interface CraftCardRequest { npcId: number; stoneId: number; cardIds: number[]; tries: number; stopOnSuccess: boolean }`
  (cardIds padded to 5 with `NULL_ID` 0xffffffff; throws RangeError on >5 cards, tries outside 1-20).
- testkit `writeCraftCard(objectId: number, code: number, made: number[]): ScriptMessage`

- [ ] **Step 1: Write the failing tests:**
  - `encodeCraftCard writes 0x8fff0110 then npc, stone, five cards (NULL_ID padded), tries, the stop byte`: decode the
    bytes with the world packet decoder and expect
    `{ type: 'craftCard', npcId: 7, stoneId: 3, cardIds: [4, 4, 9, 0xffffffff, 0xffffffff], tries: 10, stopOnSuccess: true }`.
  - `encodeCraftCard refuses six cards and tries 0 or 21` (RangeError).
  - `CRAFT_CARD 0x9a01 reads code, count, and one item id per try`: `writeCraftCard(PLAYER, 0, [3218, 0, 26601])` →
    `{ type: 'craftCard', code: 0, made: [3218, 0, 26601] }`; a refusal `writeCraftCard(PLAYER, 2, [])` →
    `{ code: 2, made: [] }`; skipped and mismatched empty (as hpLayer.test.ts).
- [ ] **Step 2:** `npx vitest run packages/protocol/test/craftCard.test.ts` → FAIL (missing exports).
- [ ] **Step 3:** Implement the module, the constant, the reader registration, the union, the decode, the writer.
- [ ] **Step 4:** Same command → PASS; `npx vitest run packages/testkit` → PASS (the every-writer table, if it lists
  writers, gets the new one).
- [ ] **Step 5: Commit** `feat(protocol): CRAFT_CARD packet 0x8fff0110 and snapshot 0x9a01`.

### Task 4: The rules and the Craft Stone item (client)

**Files:**
- Create: `apps/client/src/world/items/craftCardRules.ts`
- Modify: `apps/client/src/world/gameData.ts:184-185` (chain `withCraftStone` beside `withGroundMount`)
- Test: `apps/client/test/craftCardRules.test.ts`

**Interfaces (produced):**
- `CRAFT_STONE = 20280`; `CRAFT_STONE_PROP: WebItemProp` (the Global Constraints values; kind1 4 IK1_GENERAL, kind2 17
  IK2_MATERIAL, kind3 = IK3_SUPSTONE's number from the converted Mineral prop 3200, packMax 99, cost 100,
  icon/model above); `withCraftStone(props: Map<number, WebItemProp>): Map<number, WebItemProp>`.
- `type CardKind = 'suit' | 'weapon'`
- `cardInput(itemId: number): { kind: CardKind; points: number } | null`
- `isTopCard(itemId: number): boolean` (the 10 results)
- `craftChance(itemIds: readonly number[]): number`
- `maxTries(authorization: number): number`
- `affordableTries(stoneId: number | null, cardIds: ReadonlyArray<number | null>, countOf: (objectId: number) => number): number`
  (min over object ids of `floor(count / uses)`, the stone included; 0 when the stone or every card is missing).

- [ ] **Step 1: Write the failing tests** (values from the spec):
  - `craftChance` → `[3255]` 10; `[3207]` 20; `[3207, 3255]` 35; `[3204, 3204, 3204]` 25; five 3204 45; three 3255
    40; two 3207 45; three 3207 70; four 3207 90; five 3207 90; `[]` 0; `[26596, 26595]` 35.
  - `cardInput` → 3204 `{suit, 5}`, 3255 `{suit, 10}`, 3227 `{suit, 20}`, 26594 `{weapon, 5}`, 26611 `{weapon, 10}`,
    26612 `{weapon, 20}`; 3208, 26597, 3237, 3500, 20280 → null; `isTopCard(3208)` and `isTopCard(26613)` true.
  - `maxTries` → 'A' 5, 'B' 10, 'C' 15, 'E' 20, 'F' 1, 'D' 1, 'L' 20, 'Z' 20.
  - `affordableTries counts a stack used twice`: stone 12 pieces, cards [x, x, y] with x 7 pieces, y 2 → 2;
    stone missing → 0.
  - `withCraftStone adds 20280 once and keeps a converted one`.
- [ ] **Step 2:** `npx vitest run apps/client/test/craftCardRules.test.ts` → FAIL.
- [ ] **Step 3:** Implement; chain `withCraftStone` in `gameData.ts`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Commit** `feat(client): Craft Card rules and the Craft Stone item`.

### Task 5: The Craft Card window (client, desktop and phone)

**Files:**
- Create: `apps/client/src/world/items/craftCardWindow.ts`
- Modify: `apps/client/src/world/items/npcWindowKit.ts` (`NpcWindowPacket` gains the `craftCard` packet:
  `{ type: 'craftCard' } & CraftCardRequest`)
- Modify: `apps/client/src/style.css` (`.hud-craft-card`: the desktop split, the phone's result under the slots, the
  word buttons and the tick box reuse Auto Play's `.auto-word` / `.auto-check` look)
- Test: `apps/client/test/craftCardWindow.test.ts`

**Interfaces:**
- Consumes: Task 3 `CraftCardMessage`, `CraftCardCode`, `CraftCardRequest`; Task 4 rules.
- Produces: `class CraftCardWindow extends NpcWindow` with `openAt(npcId: number): boolean`, `take`, `tapItem`,
  `onResult(message: CraftCardMessage): void`, `get state(): { stone: number | null; cards: Array<number | null>; sent: boolean; result: CraftCardMessage | null }`;
  `interface CraftCardHost extends NpcWindowHost { authorization(): number; sayText(text: string): void; confirm(text: string, yes: () => void): void; askTries(max: number, chosen: (tries: number) => void): void }`.

Behaviour (spec "What the player sees" and "Bulk craft"): layout `CRAFT_CARD` (title "Craft Card"): stone slot, 5
card slots (`WndChgElemItem.bmp`), a custom area for the chance and "Makes" lines, Craft / bulk icon / Cancel, the
"Stop at the first success" tick box beside the bulk button (shown with it; the spec put it in the number box, which
has no room for one: my call), and the "Result" part (desktop: right of the inputs; phone: under them). Slot rules and
messages exactly as the spec. Craft sends after `host.confirm`; the bulk button calls `host.askTries(max)` with
`max = min(maxTries(authorization), affordableTries(...))` (shown only when `maxTries > 1`; disabled when `max < 2`),
then confirm, then send. Locked until `onResult` or 3 s. `onResult`: code 0 → slots empty, result part shows each
item made with counts and "Success!" / "Failed" (single) or "N tries: M made" (bulk), chat line; codes 2/3/4 → the
message, slots kept, unlocked.

- [ ] **Step 1: Write the failing tests** (jsdom, a fake host as `upgradeNpcWindows.test.ts` builds one):
  - `a stone and a 4% card show Chance: 20% and Makes: one random 7% suit card`
  - `a weapon card after a suit card is refused with "Suit and weapon cards cannot be mixed."`
  - `a 7% card is refused with "7% and A cards cannot be crafted."`
  - `a stack of 3 fills three slots, not a fourth` (reserve counts)
  - `Craft asks first and sends { npcId, stoneId, cardIds, tries: 1, stopOnSuccess: false } on yes, nothing on no`
  - `Craft without a stone says so and sends nothing`
  - `the bulk button shows for 'B' and asks up to 10, cut to what the stacks pay for`; `the bulk button hides when the letter is no VIP's`
  - `a success answer empties the slots and shows the card made`; `a bulk answer shorter than asked shows the tries run`
    (`made: [0, 3218, 0]` → "3 tries: 1 made")
  - `a refused answer (2) keeps the slots, says "You are too far from Bozman.", unlocks Craft`
  - `no answer: Craft unlocks after 3 s` (fake timers)
- [ ] **Step 2:** `npx vitest run apps/client/test/craftCardWindow.test.ts` → FAIL.
- [ ] **Step 3:** Implement the window and CSS.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Commit** `feat(client): Craft Card window with VIP bulk craft`.

### Task 6: Wiring: Bozman's menu, the session, the answers, the bag

**Files:**
- Modify: `apps/client/src/world/hud/moverMenu.ts`: `MMI.CRAFT_CARD = 9201` (custom, documented as not an MMI);
  `npcMenuEntries` adds it for `npc.key === 'MaSa_Bozman'`, label "Craft Card" (not from `TID_MMI_BASE + id`), enabled.
- Modify: `apps/client/src/world/items/itemNpcWindows.ts`: `readonly craftCard: CraftCardWindow` in `all`; the ctor's
  `extra` gains `craft: Pick<CraftCardHost, 'authorization' | 'sayText' | 'confirm' | 'askTries'>`.
- Modify: `apps/client/src/world/WorldScreen.ts`: `chooseNpcEntry` → `entry === MMI.CRAFT_CARD` →
  `this.itemNpc?.craftCard.openAt(id)` (not while a shop or beauty window is open, as Piercing); the snapshot loop →
  `value.type === 'craftCard'` → `this.itemNpc?.craftCard.onResult(value)`; the host bits (authorization from
  `self?.added.player?.authorization`, `sayText` via `hud.messages.add`, `confirm` via `messageBox.open(text,
  'okCancel', yes)`, `askTries` via an `AmountBox` "Repeat how many times?" min 2).
- Modify: `apps/client/src/world/WorldSession.ts`: `case 'craftCard': cache.send(encodeCraftCard(packet)); return;`
- Test: `apps/client/test/hud.test.ts` or `moverMenu` test (`Bozman's menu is Dialog, Trade, Craft Card`);
  `apps/client/e2e/craftCard.spec.ts` (Chromium desktop + phone, the scripted world: open Bozman's menu → Craft Card,
  put a stone and two cards in, Craft → Yes → the packet's bytes; feed `writeCraftCard` → the result shows).

- [ ] **Step 1: Write the failing unit test** for the menu entry; run → FAIL.
- [ ] **Step 2:** Wire everything above; run the unit test → PASS; `npm run typecheck` (or the repo's typecheck
  script) → no errors.
- [ ] **Step 3:** Write the e2e spec; run `npx playwright test e2e/craftCard.spec.ts --project=chromium --project=phone`
  on a free port (not 5174) → pass. Take one desktop and one phone screenshot for the notes folder.
- [ ] **Step 4: Commit** `feat(client): Craft Card at Bozman: menu, session, answers`.

### Task 7: Notes for the owner

**Files:**
- Create: `docs/2026-11-19-craft-card.md` (FlyffWeb): what was built, the odds table, the owner's test commands (full
  vitest, the e2e), no convert, the VPS steps' pointer to the outer deploy doc.

- [ ] **Step 1:** Write it; run the related vitest files together → PASS.
- [ ] **Step 2: Commit** `docs: Craft Card notes`.
