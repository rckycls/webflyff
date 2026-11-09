# Player trade: checkpoint (2026-11-10)

Branch `trade` (worktree `FlyffWeb-worktrees/trade`), from main a133cf5. Research:
`docs/superpowers/specs/2026-11-10-trade-research.md`. Not merged, not pushed.

## Built

- **Protocol** (`packages/protocol/src/world/trade.ts`): every trade packet both ways, as Neuz reads and writes them.
  - The snapshots: TRADE (with the partner's whole inventory, read by the new `readItemContainer`), CONFIRMTRADE and its
    cancel, TRADEPUT, TRADEPULL, TRADEPUTGOLD, TRADEPUTERROR, TRADEOK, TRADECANCEL, TRADECONSENT, TRADELASTCONFIRM and
    TRADELASTCONFIRMOK.
  - The client's CONFIRMTRADE, CONFIRMTRADECANCEL, TRADE, TRADEPUT, TRADEPULL, TRADEOK, TRADECANCEL, TRADEPUTGOLD and
    TRADECONFIRM.
  - Testkit writers in `packages/testkit/src/trade.ts`.
- **Starting a trade**: "Trade" in a player's menu (within 20 m) is no longer greyed. It sends CONFIRMTRADE and says "You
  have offered to trade with %s." With a request or a trade already open it says "That player is currently busy...".
- **The asked side** (`CWndConfirmTrade`, 272 x 160 "Trade"): "%s wants to trade." / "Would you like to trade?".
  - OK sends TRADE; Cancel, the close box or Escape send CONFIRMTRADECANCEL.
  - With a trade or another request open, it answers BLOCK 5 on its own.
  - The asker's lines for BLOCK 3, 4, 5 and 8, and "The trade has been cancelled." for a refused request.
- **The trade window** (`CWndTrade`, `WndTrade.tga`, 352 x 288, centred):
  - the partner's name, side and penya on the left, yours on the right;
  - two 5 x 5 grids of 32 px; a stack shows the traded count in blue; expired items are tinted red; each slot has the
    item tooltip;
  - their OK, Cancel, your OK. An OK pressed is checked (drawn disabled).
- **Putting things in** (desktop: drag, as Neuz):
  - a bag item dragged onto a free slot of your grid; a stack opens the quantity box ("Item", "Move how many items?",
    "Number:", preset to the whole stack);
  - the bag's penya dragged onto your grid opens the same box ("Penya", preset to all your penya), once per trade;
  - Enter or OK sends TRADEPUT / TRADEPUTGOLD (the number is at least 1, at most the stack or your penya).
  - Items in the trade are faded in the bag and show their count less the traded count. Using, equipping or moving a bag
    item while trading says "You cannot use items while trading.".
  - The server's refusals come back as its own lines ("This item cannot be traded." and so on).
- **OK, then the final confirm**:
  - OK sends TRADEOK; the partner's OK says "%s has completed the trade.";
  - when both pressed, the "Confirm Trade" box asks "Do you accept the trade?";
  - Yes sends TRADECONFIRM, then the box says "You need to wait for approval." and hides its buttons; No or the close
    box sends TRADECANCEL;
  - the partner's Yes says "%s pushed final confirmation.";
  - while the box is up, the trade window takes no press.
- **The exchange** (TRADECONSENT): the server sends no inventory, so the client moves the items itself, exactly as
  Neuz's `CVTInfo::TradeConsent` and `CItemContainer::Add` do (`apps/client/src/world/trade/itemContainer.ts`): your
  traded items out (a stack keeps the rest), the partner's in (onto your stacks first, then the first empty bag
  positions), and the partner's penya in.
- **Ends**:
  - Cancel sends TRADECANCEL; the server's answer closes the window with the box "The trade has been cancelled.";
  - the partner leaving (DEL_OBJ) closes every trade window with no message;
  - after a first OK the server's put error shows its box;
  - a trade opening while an NPC shop is open closes itself at once (Neuz's rule).
  - As in Neuz, every close of the trade window sends TRADECANCEL (its destructor); the server ignores it after a trade.
- **The phone** (landscape, same windows):
  - the trade window becomes a panel on the left, beside the phone's bag on the right (as the shop does), both grids
    side by side;
  - names, penya, counts and buttons are 14 px; the buttons are words, 34 px tall;
  - tap instead of drag: a tap on a bag item puts it in the first free slot of your grid (a stack opens the quantity
    box), and a tap on the bag's penya opens the penya box;
  - the box's field uses the number keyboard (16 px, so the page does not zoom); OK on the box sends it;
  - a tap on a trade slot shows its tooltip;
  - the request, final confirm and quantity windows have 14 px words and word buttons too; the joystick and attack
    buttons hide while the trade window is open.
- **Pictures**: `WndTrade.tga` and `ButtClearGold.tga` added to the UI stage, converted into this worktree's `dist/assets`
  only.

## Left out, and why

- **Personal shops (vendors)**: a separate system. A possible next step.
- **"Refuse Trade" option** (`g_Option.m_bTrade`, BLOCK 3 from the asked side): FlyffWeb's options window has no such
  setting. Requests are always shown, as with Neuz's default. The asker still shows BLOCK 3's line.
- **Checks for windows FlyffWeb does not have** (bank, guild bank, mail, beauty shops, repair, summon angel, web box):
  there is nothing to check.
- **The task-bar "Trade" applet** (a direct TRADE from an old saved shortcut) and **TRADEPULL** (Neuz never sends it).
- **Drops on the partner's grid**: Neuz accepts them by accident (the item still goes to your own slot); the port takes
  drops on your grid only.
- **Gateway / servers**: nothing was missing. Every trade packet passes the gateway unchanged.

## In-game checklist (two characters, PC and phone)

> **Player trade.**
> 1. Stand two characters, A and B, within a few steps. On A, right-click B (phone: tap B twice) → Trade. A's chat says
>    "You have offered to trade with B."; B gets "A wants to trade." with OK and Cancel.
> 2. On B press Cancel: A's chat says "The trade has been cancelled.". Ask again and press OK: both get the Trade window
>    (partner on the left, you on the right) and the bag.
> 3. On A drag a sword onto the right-hand grid (phone: tap it in the bag): it shows on both screens and is faded in A's
>    bag. Drag a stack: the "Item" box asks how many; type 3, Enter. Drag the penya at the bag's foot (phone: tap it):
>    the "Penya" box; type an amount, OK. Both screens show the numbers with commas, and A's bag penya drops.
> 4. Try a bound or quest item: "This item cannot be traded.". Double-click a bag item on A: "You cannot use items while
>    trading.".
> 5. Press OK on A: B's chat says "A has completed the trade."; A's OK greys out. Press OK on B: both get "Confirm
>    Trade" / "Do you accept the trade?". Yes on A: A's box says "You need to wait for approval."; B's chat says "A
>    pushed final confirmation.". Yes on B: the windows close and the items and penya change hands. Check both bags (the
>    stack's rest stays, the received items land on the first free places) and log out and back in: the bags are the
>    same.
> 6. Start another trade and press Cancel: both get "The trade has been cancelled." and the penya comes back.
> 7. Start another trade and log B out: A's trade window just closes.
> 8. Phone: the trade sits left of the bag, all words readable (14 px), the number keyboard opens in the boxes.

## Main folder: convert command

The main folder needs only the two new UI pictures (this does not touch `itemProps.json`):

```
npm run convert -- --only "WndTrade*,ButtClearGold*"
```

## Tests

- New: `packages/protocol/test/trade.test.ts`, `apps/client/test/trade.test.ts` (the container moves, the handlers, the
  drop rules), `apps/client/test/tradeHud.test.ts` (the windows' wiring), `apps/client/e2e/trade.spec.ts`. Updated:
  `apps/client/test/playerMenu.test.ts` (Trade enabled). The testkit's `writeAddSelf` now writes `own.gold`.
- `npm run typecheck`: clean.
- `npx vitest run`: 4109 passed, 9 skipped, 5 failed. The 5 are the old ones on main: `looks.test.ts` (3, heldModels:
  the knuckle/bow/yoyo, the shield, the weapon) and `inventoryWindow.test.ts` (2: "keeps desktop double click working
  after single-click inspection", "a ride shows Use on the phone ..."); both inventory ones fail the same without this
  branch.
- Playwright, Chromium, desktop and landscape phone (`trade.spec.ts`): 4 passed. Run on port 5180 with a config of the
  worktree's own (`.superpowers/`, not committed).
- A dry-run merge of this branch into today's local main (a7f1af3, with GM commands) has no conflict.

### For the owner: the full suites

```
npx vitest run
```
Pass: only the old failures above.

```
npx playwright test -c apps/client/playwright.config.ts trade.spec.ts items.spec.ts party.spec.ts friends.spec.ts --project chromium --project phone
```
Pass: all passed (set `E2E_CLIENT_PORT` to another port if your dev server holds 5174).

```
npm run test:e2e:client
```
Pass: no new failure (the old `travel-items.spec.ts` "the Scroll of Return ..." may still fail, as on main).
