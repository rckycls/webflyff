# Extra bag (Backpack) checkpoint, 2026-11-17

Branch `extra-bag` in `FlyffWeb-worktrees/consistency-picks`, cut from local main 5e576f3. Not merged, not pushed.
Research: `docs/2026-11-17-extra-bag-research.md`.

## What was built

- **Protocol** (`packages/protocol/src/world/pocket.ts`):
  - reads `POCKET_ATTRIBUTE` 0x0200, `POCKET_ADD_ITEM` 0x0201, `POCKET_REMOVE_ITEM` 0x0202;
  - sends `AVAIL_POCKET` 0x70000006 and `MOVE_ITEM_POCKET` 0x70000007;
  - the own ADD_OBJ keeps its pockets now (`OwnCharacter.pockets`); before, it read past them.
- **State** (`apps/client/src/world/pocket/pocketBook.ts`): the three pockets as `CPocketController` keeps them.
  Pocket snapshots come with `NULL_ID`, so `OwnState` takes them before its own-object check.
- **Rules** (`pocket/pocketRules.ts`): each drop and tap, as `CWndBagEx`, `CWndInventory` and `CWndTradeGold` decide it.
- **Desktop window** (`hud/pocket/bagExWindow.ts`, `pocket/pocketHud.ts`): V15 `APP_BAG_EX`.
  - "InventoryBag.tga", 236 x 496, title "Backpack", opens centred.
  - Opened by B, the Start menu's "Backpack" line (after Inventory), or a task bar applet slot.
  - Pocket 0 (6 slots) and Bags 1 and 2 (24 slots), items by position, each with its "Item" tab and scroll bar.
  - A pocket not in use: the grey cover at alpha 150 and the grey bag icon. In use: the gold bag icon.
  - Bag icon tooltip: the time left, or "Place the Extra Bag icon here."
  - Drag an Extra Bag from the bag onto a bag icon: `AVAIL_POCKET`. On a bag in use: "You are already using an Extra Bag."
  - Drag between the bag and a pocket, or pocket to pocket. A stack asks "Move how many items?".
  - Refused: a worn item, a quest item. An expired pocket keeps its items greyed; they cannot be moved.
  - It will not open with the trade, a mail read, an NPC shop, the guild bank or a private shop open.
  - It closes when the bank, an NPC shop, a private shop, the guild bank, the trade or the post opens.
- **Phone**: a compact V15 panel beside the bag, which shows its items only.
  - Tabs pick the pocket shown: Basic, Bag 1, Bag 2.
  - A line under the tabs shows the bag icon and its words (no hover on a phone).
  - Tap a bag item: it goes into the pocket shown. If that pocket is closed and the item is an Extra Bag, it opens the pocket.
  - Tap a pocket item: it goes back to the bag.
  - Counts use the game's number pad (`AmountBox`).
  - Opening the Backpack also opens the bag.
- **Converter**: the four pictures are added to `THEME_FILES`.

## Choices V15 does not settle (phone only, small)

- The phone opens the bag with the Backpack. The taps need both. The desktop does not, as in V15.
- The tab words: "Basic", "Bag 1", "Bag 2". The picture says "Bag.1" and "Bag.2"; pocket 0 has no name.
- The time left is short ("29d23h left"). This follows the owner's 2026-11-14 rule for durations.
  V15's text is "%d Days %d Hours %d Minutes left".

## Left, and why

- **Pocket to pocket on the phone.** A tap always goes to or from the bag. Use the bag in between. This avoids a second
  kind of tap.
- **No phone shortcut icon.** The 8 icons are full. Use Start > Backpack.
- **Pocket items elsewhere.** A ticket in a pocket, and quest item counts, are the server's business.
- **The pet food mill's refusal for a pocket item.** It cannot happen here: the mill does not take a pocket drag.
- **`GetExtra` check.** It uses the bag's reserved count. The Backpack closes with the trade and shops anyway.

## Server

None needed. The V15 World server already handles all of it. The owner's Source already has the count and range checks
in `OnMoveItemOnPocket`.

## Convert (on main, after the merge)

```
npm run convert -- --only "InventoryBag*,Itm_SysSysScrBagBag0*"
```

UI pictures only, no gear sync. It also redoes the Extra Bag item icon, which is harmless. Until then the Backpack shows
without its picture, covers and bag icons, and the console logs four "not in the asset index" errors.

## Tests run here

- Unit: `packages/protocol/test/pocket.test.ts` (6) and `apps/client/test/pocket.test.ts` (13). All of protocol and
  testkit: 624 passed. Related client tests: hud, ownState, worldState, inventoryWindow, mobileTools, phonePicks.
- `hud.test.ts`: 7 Start menu tests updated for 20 lines (516 px; two columns of 10 and 10 on a phone).
- Typecheck: protocol, protocol tests, testkit, client, client node config.
- e2e, Chromium, port 5191: `extraBag.spec.ts` on desktop and phone; landscape "twenty Start menu entries"; `bank.spec`,
  `guildBank.spec` and `taskBarFinger.spec`. All passed.

## For the owner

Full suites, in FlyffWeb main after the merge and convert. Use another port if your dev server holds 5174:

```
npm test
```

```
$env:E2E_CLIENT_PORT=5191; npm run test:e2e:client
```

Pass: every test passes. `pageAssets.test.ts` can flake in a full unit run; it passes alone.

### Look checks

- Desktop: B opens "Backpack" centred, on its picture.
  - The bag icons sit in the "1" and "2" boxes.
  - The grids line up with the picture's lines.
  - Bag 1 and Bag 2 are greyed until opened.
- Phone (iPhone, landscape): Start > Backpack.
  - The panel sits left of the bag, with Basic / Bag 1 / Bag 2 tabs.
  - Bag 1 shows the grey bag and "Place the Extra Bag icon here."

### Live checks (VM or beta)

1. Get an Extra Bag (1, 15 or 30 days). Drag it onto bag icon 1. On the phone: Bag 1 tab, then tap the Extra Bag.
   Bag 1 opens, one Extra Bag is used, and the time shows.
2. Move a stack in with a count, take one out, and move between pockets (desktop).
3. Relog: the pockets and their items come back.
4. A 1-day bag: after it ends, Bag 1 greys out with its items kept. A new Extra Bag opens it again with them.
5. Open the bank, an NPC shop or the trade: the Backpack closes.
