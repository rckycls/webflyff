# Awaken Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CUSTOM "Awaken" window in FlyffWeb (desktop and landscape phone) that awakens or re-rolls an item's awakening
for scrolls plus 50,000 penya, checked and charged by a World server patch.

**Architecture:** The client window (modelled on `PiercingWindow`) holds the item and the two scrolls and sends one new
packet, `AWAKEN_WINDOW` 0x8FFF0102. The World server checks everything and takes the scrolls and penya in one step, then
answers with the V15 updates the client already reads (`UPDATE_ITEM_EX`, `UPDATE_ITEM`, gold, defined text).

**Tech Stack:** TypeScript, Vitest (jsdom), Playwright (Chromium, `chromium` and `phone` projects); C++ VS 2022 MSBuild for
the World server.

**Spec:** `docs/superpowers/specs/2026-11-19-awaken-window-design.md` (FlyffWeb branch `awaken-window`).

## Global Constraints

- Cost: `AWAKEN_COST = 50000` penya per Awaken, on client and server.
- Packet: `PACKETTYPE_AWAKEN_WINDOW` / `PacketType.AWAKEN_WINDOW` = `0x8FFF0102`, body three DWORDs: item, Awakening
  scroll, Reversion scroll (`0xFFFFFFFF` = none).
- Items: Scroll of Awakening `26461` (`II_SYS_SYS_SCR_AWAKE`); Scroll of Reversion `26462` (`II_SYS_SYS_SCR_AWAKECANCEL`)
  and `26563` (`..._AWAKECANCEL02`). Awakening parts: `2, 10, 11, 4, 5, 6` (suit, right weapon, shield, hands, feet, cap).
- Applet id `9004` (`AppId.AWAKEN`), Start menu text `Awaken`, top level, before `Option`. No hotkey.
- Window title `Awaken`; group `Awaken Item`; rows `Item`, `Awakening`, `Reversion ->`; panel title `Awakening`; empty
  panel text `Not awakened`.
- Confirm texts (exact):
  - not awakened: `Awaken this item? It uses 1 Scroll of Awakening and 50,000 Penya.`
  - awakened: `Replace this item's awakening? It uses 1 Scroll of Reversion, 1 Scroll of Awakening and 50,000 Penya. The
    current awakening is lost.`
  - check box: `Don't ask again`, unchecked on every opening of the window.
- Own chat texts (exact): `Put an item to awaken in the window.`, `Put a Scroll of Awakening in the window.`
- Server never trusts the client. Patch file `patches/2026-11-19-awaken-window.patch`, applied after the 13 patches on main
  `Source` (last `2026-11-18-rates-x77`). Never apply it to main `Source`, never merge, never push.
- Never run the converter; no convert is needed (all pictures exist). Never use port 5174. Playwright in Chromium only.
- Worktrees: FlyffWeb `Bakbak\FlyffWeb-worktrees\awaken-window` (branch `awaken-window`), outer
  `Bakbak\Blouflash-worktrees\awaken-window` (branch `awaken-window`). Copy `dist` from main with `robocopy /E` only (never
  `/MIR`, no junctions).

## Review Focus

- A scroll stack running out after an Awaken: its slot must empty and its bag hold be released, never show a stale icon.
- A double-click on Awaken (or Yes) must send one packet: the button stays locked until the item's awakening changes or
  2 s pass.
- An item with the Awakening Protection flag (bit 61) or a pending protected roll counts as awakened on both sides.
- An item put on (equipped) while in the window: the client refuses at take time; the server refuses `TID_GAME_EQUIPPUT`.
- A Reversion scroll in its slot on a not-awakened item is not sent as used: the server takes it only when the item was
  awakened.

---

### Task 1: World server patch (outer worktree)

**Files (in `Bakbak\Blouflash-worktrees\awaken-window`):**
- Setup: `robocopy "<outer main>\Source" Source /E` (git-ignored), then `git init` + commit inside `Source` as the
  baseline.
- Modify `Source/_Network/MsgHdr.h`: after `PACKETTYPE_PETFILTER`, a comment line "custom (owner 2026-11-19): the Awaken
  window ..." and `#define PACKETTYPE_AWAKEN_WINDOW (DWORD)0x8FFF0102`.
- Modify `Source/WORLDSERVER/DPSrvr.h`: declare `void OnAwakenWindow( CAr & ar, DPID dpidCache, DPID dpidUser, LPBYTE
  lpBuf, u_long uBufSize );` next to `OnSetPetfilter`.
- Modify `Source/WORLDSERVER/DPSrvr.cpp`: `ON_MSG( PACKETTYPE_AWAKEN_WINDOW, &CDPSrvr::OnAwakenWindow );` after the
  `PACKETTYPE_PETFILTER` line (~492); the handler right after the `#endif // __SYS_IDENTIFY` that closes
  `CDPSrvr::OnAwakening` (~9090), outside any version block, so it is always built.
- Create `patches/2026-11-19-awaken-window.patch`, `docs/2026-11-19-awaken-window-deploy.md`; replace
  `Program/7. World.exe`.

**Handler rules (`OnAwakenWindow`), in order; any refusal sends the text and returns with nothing changed:**
1. `ar >> dwItem >> dwAwake >> dwReversion;` user valid (`g_UserMng.GetUser`, `IsValidObj`).
2. Trading or own shop open (`m_vtInfo.GetOther() || m_vtInfo.VendorIsVendor()`): return silently.
3. `pItem = m_Inventory.GetAtId( dwItem )`: `IsUsableItem`, else return. Worn (`m_Inventory.IsEquip( pItem->m_dwObjId
   )`): `TID_GAME_EQUIPPUT`. Expired flag or `GetRandomOptionKind( pItem ) != eAwakening`: `TID_GAME_INVALID_TARGET_ITEM`.
4. `pAwake = m_Inventory.GetAtId( dwAwake )`: usable and `m_dwItemId == II_SYS_SYS_SCR_AWAKE`, else
   `TID_GAME_INVALID_TARGET_ITEM`.
5. `bAwakened = GetViewRandomOptionSize( raw ) > 0 || IsCheckedSafeFlag( raw ) || pItem->GetNewRandomOption() != 0`.
   If awakened: `pRev = GetAtId( dwReversion )` usable and `II_SYS_SYS_SCR_AWAKECANCEL` or `..._AWAKECANCEL02`, else
   `TID_GAME_AWAKE_OR_BLESSEDNESS01`. If not awakened, `pRev = NULL` (ignore `dwReversion`).
6. `GetGold() < 50000`: `TID_GAME_LACKMONEY`.
7. Do it: `InitializeRandomOption( pItem->GetRandomOptItemIdPtr() )`, `pItem->ResetNewRandomOption()`,
   `GenRandomOption( ..., eAwakening, pItem->GetProp()->dwParts )`, `UpdateItemEx( UI_RANDOMOPTITEMID )`; `PutItemLog( pUser,
   "u", "AwakenWindow", scroll )` then `UpdateItem( UI_NUM, m_nItemNum - 1 )` for `pAwake` and `pRev` when set;
   `AddGold( -50000 )`; `AddPlaySound( SND_INF_UPGRADESUCCESS )`; the `XI_INT_SUCCESS` sfx unless `TRANSPARENT_MODE` (as
   `OnDoUseItemTarget`); `AddDefinedText( TID_GAME_AWAKENING_SUCCESS )`; a `LogItemInfo` with `Action "r"`, `RecvName
   "AwakenWindow"` and the gold before/after/`Gold_1 -50000` (as `OnAwakening`).
- Keep the files' encoding (CP949) and line endings: edit with a script that writes bytes, not a UTF-8 editor.

- [ ] **Step 1:** Make the worktree's `Source` copy and its baseline repo; confirm `git -C Source status` is clean.
- [ ] **Step 2:** Make the three edits.
- [ ] **Step 3:** Build: `& "C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe"
  Source\all\all.sln -t:WorldServer -p:Configuration=Release -p:Platform=Win32 -m` (background; it takes minutes).
  Expected: 0 errors, 0 new warnings; `Output\WorldServer\Release\WorldServer.exe` written.
- [ ] **Step 4:** Make the patch with `git -C Source diff --src-prefix=a/Source/ --dst-prefix=b/Source/` into
  `patches/2026-11-19-awaken-window.patch`. Check: `git apply -R --check` against the copy passes; from the outer main
  root, `git apply --check patches/...` passes (writes nothing).
- [ ] **Step 5:** Copy the exe to `Program/7. World.exe`; write the deploy doc (what it does, the patch order, bytes and
  SHA-256, VPS steps in PowerShell with `Copy-Item -Force` and `Get-FileHash`, the in-game checks of Task 6). Note: the
  VIP-perks patch also changes `DPSrvr.cpp`; whichever merges second rebuilds the World from both.
- [ ] **Step 6:** Commit on outer `awaken-window`: `feat(server): Awaken window packet 0x8FFF0102 (custom)`.

### Task 2: Protocol packet and test writer (FlyffWeb)

**Files:**
- Modify: `packages/protocol/src/constants.ts` (`AWAKEN_WINDOW: 0x8fff0102` after `PET_FILTER`, with a "custom (owner
  2026-11-19)" comment naming the outer patch).
- Modify: `packages/protocol/src/world/upgrade.ts` (encoder, after `encodeSmeltSafety`).
- Modify: `packages/testkit/src/world.ts` (writer, after `writeUpdateItem`).
- Test: `packages/protocol/test/upgrade.test.ts`.

**Interfaces:**
- Produces: `encodeAwakenWindow(itemId: number, awakeId: number, reversionId: number): Uint8Array` (item and awake
  checked with `checkId`, reversion with `checkIdOrNull`); `writeUpdateItemEx(objectId: number, itemObjectId: number,
  param: number, value: bigint): ScriptMessage` (type `0x0140`, body `u8 itemObjectId, u8 param, i64 value`, matching
  `readUpdateItemEx`).

- [ ] **Step 1:** Test `AWAKEN_WINDOW: the item, the Scroll of Awakening, the Reversion or NULL_ID (custom 2026-11-19)`:
  `words(encodeAwakenWindow(12, 3, 4))` equals `[NULL_ID, 0x8fff0102, 12, 3, 4]`; with `NULL_ID` last equals
  `[NULL_ID, 0x8fff0102, 12, 3, NULL_ID]`; `encodeAwakenWindow(NULL_ID, 3, 4)` and `(12, NULL_ID, 4)` throw. Add a
  round-trip test that `readUpdateItemEx` reads `writeUpdateItemEx(1, 5, 10, 0x08cfa184b0041400n)`'s body as
  `{ objectId: 5, param: 10, value: 0x08cfa184b0041400n }` if the testkit already has a reader test pattern; else skip it.
- [ ] **Step 2:** Run `npx vitest run packages/protocol/test/upgrade.test.ts`. Expected: FAIL (no export).
- [ ] **Step 3:** Implement both.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(protocol): AWAKEN_WINDOW 0x8fff0102 (custom)`.

### Task 3: Awakening helpers from the tooltip

**Files:**
- Modify: `apps/client/src/world/items/itemTooltip.ts`.
- Test: `apps/client/test/itemTooltip.test.ts`.

**Interfaces:**
- Produces:
  - `isAwakenable(prop: WebItemProp): boolean` (`AWAKENING_PARTS.has(prop.part)`).
  - `isAwakened(raw: bigint | undefined): boolean` (`viewOptionCount(raw) > 0 || safe flag`).
  - `awakeningLines(raw: bigint | undefined, texts: TooltipData['texts']): string[]`: one line per option counted by
    `viewOptionCount`, as `putAwakening` words them, trimmed (no leading `\n`, no trailing space).
- `putAwakening` builds its option lines from `awakeningLines` (same output as today).

- [ ] **Step 1:** Tests with the file's `DATA`: `awakeningLines(0x08cfa184b0041400n, DATA.texts)` equals `['STR +20',
  'Attack Speed +15%', 'Max. HP +250']`; `awakeningLines(0n, …)` and `(undefined, …)` equal `[]`; `isAwakened(0n)` false,
  `isAwakened(1n << 61n)` true, `isAwakened(0x08cfa184b0041400n)` true; `isAwakenable` true for parts 2 and 10, false
  for part 8 (cloth) and -1.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/itemTooltip.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement; refactor `putAwakening` onto `awakeningLines`.
- [ ] **Step 4:** Run it again. Expected: all PASS (the old awakening tests unchanged).
- [ ] **Step 5:** Commit `refactor(client): awakening lines shared by the tooltip`.

### Task 4: The Awaken window

**Files:**
- Create: `apps/client/src/world/items/awakenWindow.ts`.
- Modify: `apps/client/src/world/items/itemWindowLayouts.ts` (three layouts).
- Modify: `apps/client/src/style.css` (`.hud-awaken` rules: the word button as `.hud-auto-play .auto-word`, the check as
  `.hud-auto-play .auto-check`, blue lines `rgb(0, 0, 255)`, phone sizes as the jewel panels').
- Test: `apps/client/test/awakenWindow.test.ts` (jsdom, a `rig()` like `upgradeNpcWindows.test.ts`).

**Layouts (`ResLayout`, WndTile00 frame):**
- `AWAKEN` 352 x 256: Piercing's controls with the new texts (`WIDC_STATIC4` group `Awaken Item`; `WIDC_STATIC1/2/3`
  `Item`, `Awakening`, `Reversion ->`; slots `WIDC_STATIC5/6/7` `WndElemItemBlank.tga` at Piercing's rects; money
  `WIDC_STATIC8`/`WIDC_STATIC9`); `{ kind: 'custom', id: 'WIDC_AWAKEN', rect: [12, 192, 84, 212] }` for the word button;
  `WIDC_CANCEL` ButtCancel `[94, 192, 166, 212]`; right side group `WIDC_STATIC10` `[176, 8, 336, 30]` `Awakening` and
  `{ kind: 'custom', id: 'WIDC_LINES', rect: [176, 38, 336, 212], tile: EDIT }`.
- `AWAKEN_PHONE` 192 x 336: the same left column; group `WIDC_STATIC10` `[8, 190, 168, 206]`, `WIDC_LINES`
  `[8, 210, 168, 266]`; `WIDC_AWAKEN` `[12, 276, 84, 296]`, `WIDC_CANCEL` `[94, 276, 166, 296]`.
- `AWAKEN_CONFIRM` 336 x 176, `modal: true`, title `Awaken`: `WIDC_TEXT1` text `[10, 10, 318, 84]` EDIT; `{ kind:
  'custom', id: 'WIDC_CHECK', rect: [12, 90, 318, 108] }`; `yes('WIDC_YES', [74, 116, 146, 136])`,
  `no('WIDC_NO', [182, 116, 254, 136])`.

**Interfaces:**
- Consumes: `isAwakenable`, `isAwakened`, `awakeningLines` (Task 3); `slotTooltip` (`npcWindowKit.ts`).
- Produces:
  - `export const AWAKEN_COST = 50000`; `export const AWAKEN_SCROLL = 26461`; `export const REVERSION_SCROLLS:
    ReadonlySet<number> = new Set([26462, 26563])`.
  - `export interface AwakenHost` = `UpgradeNpcHost`'s `own`, `tooltip?`, `props`, `texts` (the catalog map),
    `say(tid)`, `reserve`, `reserved`, `openBag`, `now`, `mobile?`, `bagOpen?`, `closeBag?`, `ui`; plus
    `sayText(text: string): void` and `sendAwaken(itemId: number, awakeId: number, reversionId: number): void`.
  - `export class AwakenWindow { constructor(host: AwakenHost); get isOpen(): boolean; open(): void; close(): void;
    toggle(): void; take(objectId: number): void; takeAt(slot: 0 | 1 | 2, objectId: number): void; update(): void;
    dismiss(): void }`. Root element classes `hud-awaken hud-jewel`; the confirm box's `hud-awaken-confirm`.

**Behaviour (spec "What the player sees"):**
- `open()`: layout `AWAKEN_PHONE` when `host.mobile?.()`, else `AWAKEN`; opens the bag (remember a phone's bag it opened,
  close it with the window, as Piercing); `dontAsk = false`.
- `take`: 26461 to slot 1, 26462/26563 to slot 2, else slot 0. Slot 0 refuses worn (`TID_GAME_EQUIPPUT`) and
  non-awakenable (`TID_GAME_INVALID_TARGET_ITEM`) items and empties slots 1-2 when it takes a new item. Slots 1-2 need an
  item in slot 0 and the right id, else `TID_SBEVE_NOTUSEITEM`. Drops, right-click/phone-tap emptying, bag holds and the
  slot tooltips as in Piercing.
- Money text: `50,000` with an item in, else `0`. Panel: `awakeningLines` of the item, one blue line each; `Not awakened`
  when empty; nothing without an item.
- Awaken click, while not locked: no item → `sayText('Put an item to awaken in the window.')`; no slot-1 scroll →
  `sayText('Put a Scroll of Awakening in the window.')`; awakened and no slot-2 scroll →
  `say('TID_GAME_AWAKE_OR_BLESSEDNESS01')`; `own.gold < 50000` → `say('TID_GAME_LACKMONEY')`; else the confirm box
  (unless `dontAsk`). Yes: `dontAsk = checked`, send; No: nothing. Sending: `host.sendAwaken(item, scroll, awakened ?
  reversion : NULL_ID)`, then lock with `{ before: item.randomOption ?? 0n, until: now + 2000 }`; the button gets
  `disabled` while locked.
- `update()` (each frame from WorldScreen, cheap when `own.inventoryRevision` and the lock are unchanged): a slot whose
  object is gone or no longer the right item id is emptied (and its hold released); the lock ends when the item's
  `randomOption` differs from `before` or `now >= until`; redraw icons, money and panel.
- `close()`/`onClose`: empty all slots (holds released), close the confirm box, close a phone bag it opened.

- [ ] **Step 1:** Tests (each a fresh `rig()` with a suit 600 part 2 at object 3, a cloth part 8 at 4, 26461 x2 at 5,
  26462 x1 at 6, a sword part 10 awakened `0x08cfa184b0041400n` at 7; gold 1,000,000):
  - `opens from nothing: title Awaken, rows Item / Awakening / Reversion ->, money 0, panel empty`.
  - `take routes by kind; a cloth is refused with TID_GAME_INVALID_TARGET_ITEM; a worn item with TID_GAME_EQUIPPUT`.
  - `money 50,000 with an item; the panel says Not awakened for the suit and the three lines for the sword`.
  - `Awaken asks first, the not-awakened text; Yes sends [3, 5, NULL_ID]; the reversion is not sent for a suit`.
  - `an awakened sword needs the Reversion: TID_GAME_AWAKE_OR_BLESSEDNESS01 without it; with it the replace text and
    [7, 5, 6]`.
  - `Don't ask again ticked + Yes: the next Awaken sends at once; a reopened window asks again`.
  - `locked after sending: a second click sends nothing until the randomOption changes or 2 s pass`.
  - `missing pieces: the two own texts, and TID_GAME_LACKMONEY under 50,000 penya; nothing sent`.
  - `a scroll stack gone from the bag empties its slot and releases its hold on update()`.
  - `close releases every hold`.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/awakenWindow.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the layouts, the class and the CSS.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(client): Awaken window (custom)`.

### Task 5: Wiring: Start menu, bag, session, e2e

**Files:**
- Modify: `apps/client/src/world/hud/applets.ts` (`AppId.AWAKEN: 9004`; an `APPLETS` entry `applet('APP_AWAKEN',
  'item/Itm_SysSysScrAwake.dds', 'Awaken')`; check `themeKey` gives `ui/item/itm_syssysscrawake.png`, the converted
  item icon).
- Modify: `apps/client/src/world/hud/taskBar.ts` (`TaskBarWindow` gains `'awaken'`; `WINDOWS` maps 9004; `MENU` line
  `{ id: AppId.AWAKEN, text: 'Awaken' }` after Pet Filter; top level becomes 19 = `MENU_MAX_LINES`).
- Modify: `apps/client/src/world/WorldSession.ts` (`sendAwaken(item, awake, reversion)` as `sendPetFilter`).
- Modify: `apps/client/src/world/WorldScreen.ts`:
  - build `this.awaken = new AwakenWindow(host)` beside `upgradeNpc` (host from `upgradeNpcHost`'s pieces, `texts:
    this.data!.texts`, `sayText` → `this.hud?.messages.add(text, <TID_GAME_LACKMONEY's colour>)`, `sendAwaken` →
    session);
  - `openWindow('awaken')` toggles it;
  - bag double-click and phone tap: `takeIntoUpgradeWindow` and `inventoryWindow.trade.active/tapItem` route to
    `this.awaken.take(id)` when open; `itemsOnly` includes it; the bag's `closed` dismisses it;
  - the frame step calls `this.awaken?.update()` while open; teardown closes it.
- Modify: `apps/client/test/hud.test.ts` only if its menu-line guard lists names.
- Create: `apps/client/e2e/awakenWindow.spec.ts`.

- [ ] **Step 1:** e2e `Awaken: Start menu opens it; the suit and a scroll; Yes with Don't ask sends; the panel shows the
  new awakening; the next Awaken sends at once` (both projects): self with a suit (3), 2 x 26461 (5), gold 1,000,000;
  open via Start → `Awaken`; put 3 and 5 in (drag on desktop, tap on phone, as `itemNpcWindows.spec.ts` `putIn`); panel
  `Not awakened`; Awaken → box with the not-awakened text → tick `Don't ask again` → Yes; poll `sentOf(gateway,
  0x8fff0102)` body words = `[3, 5, NULL_ID]`; push `writeUpdateItemEx(SELF_ID, 3, 10, 0x08cfa184b0041400n)` and
  `writeUpdateItem(SELF_ID, 5, 0, 1)`; panel shows `STR +20`; Awaken again → a second packet, no box. Check the window
  and panel are inside the screen and above the task bar. Screenshot.
- [ ] **Step 2:** Run `npx playwright test e2e/awakenWindow.spec.ts e2e/startMenu.spec.ts` from `apps/client` on a free
  port (not 5174). Expected: FAIL before the wiring.
- [ ] **Step 3:** Wire it.
- [ ] **Step 4:** `npm run typecheck`; `npx vitest run apps/client/test/hud.test.ts apps/client/test/awakenWindow.test.ts
  apps/client/test/upgradeNpcWindows.test.ts`; the two e2e specs. Expected: all PASS (startMenu fits 19 lines on
  1366x768, 1280x720, 844x390, 667x375).
- [ ] **Step 5:** Commit `feat(client): Awaken window on the Start menu (custom)`.

### Task 6: Docs, quick checks, hand-over

**Files:**
- Create: `docs/2026-11-19-awaken-window.md` (FlyffWeb): what it does, no convert, the full suites for the owner, the VPS
  order (World exe first, then the FlyffWeb update), the in-game checks:
  1. Start → Awaken opens it with the bag; a cloth item is refused.
  2. A not-awakened suit + Scroll of Awakening: Yes → awakened, 1 scroll and 50,000 penya gone, panel shows it.
  3. Awaken again without a Reversion: "Item has already been awakened.", nothing spent.
  4. With a Reversion: replace text; Yes → new awakening, 1 of each scroll and 50,000 gone.
  5. Don't ask again → next click sends at once; reopen → asks again.
  6. Under 50,000 penya: refused, nothing spent.

- [ ] **Step 1:** `npm run typecheck` and `npx vitest run packages/protocol/test/upgrade.test.ts
  apps/client/test/itemTooltip.test.ts apps/client/test/awakenWindow.test.ts apps/client/test/hud.test.ts`. Expected:
  PASS.
- [ ] **Step 2:** Commit the doc. Report both branch heads, the World exe's bytes and SHA-256, and that nothing is merged
  or pushed.
