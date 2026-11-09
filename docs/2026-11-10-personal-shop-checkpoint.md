# Personal shop: checkpoint (2026-11-10)

Branch `personal-shop` (worktree `FlyffWeb-worktrees/personal-shop`), from main a7f1af3. Research:
`docs/superpowers/specs/2026-11-10-personal-shop-research.md`. Not merged, not pushed.

## Built

- **Protocol** (`packages/protocol/src/world/vendor.ts`): every shop packet both ways, as Neuz reads and writes them.
  Snapshots PVENDOR_OPEN, PVENDOR_CLOSE, REGISTER_PVENDOR_ITEM, UNREGISTER_PVENDOR_ITEM, PVENDOR_ITEM, PVENDOR_ITEM_NUM and
  the shop's chat room (CHATTING, its six kinds). Senders PVENDOR_OPEN, PVENDOR_CLOSE, REGISTER / UNREGISTER, QUERY, BUY,
  ENTERCHTTING, CHATTING, OPENCHATTINGROOM, CLOSECHATTINGROOM. Testkit writers in `packages/testkit/src/vendor.ts`.
  The title in ADD_OBJ was already read (`shopTitle`); now it is used.
- **State and rules** (`apps/client/src/world/vendor/`): `vendorBook.ts` (titles in view, the own 20 slots, the saved list
  that comes back when the window opens again, the shop being browsed, the chat room), `vendorRules.ts` (slot places, price
  colours, the 108 px name cut, the item and gold checks, the name rules), `vendorKeypad.ts` (Neuz's two keypads, with the
  registration's calculator).
- **Desktop windows** (`hud/vendor/`), each its resdata.inc entry:
  - **Private Shop** (448 x 464): Shop Name, OK, Cancel, Reset, Chat, 20 slots in two columns. Drag a bag item onto an
    empty slot; right-click a slot to take it off; the slots show icon, name (+N), price in its colour, count.
  - **Sell Item Registration**: Quantity and Unit Price, keypad 0-9 / 00 / 000 / Min / Max and + - * / =, typed keys too,
    the arrow on the focused field.
  - **Buy Item**: Quantity (starts at all), Price, Total Cost; double-click a slot of another's shop to open it.
  - **Chatting**: Dialog tab, the seller's Information tab (who came, who left, who bought what), the user list, Send.
  - Boxes: "Will you open your shop?", "Will you close your shop?", and Neuz's refusals (total over 2,100,000,000, name
    not allowed, name length, not enough penya).
- **Opening**: Start → **Private Shop** (after Inventory). The bag opens beside it. A click on a seller (within 20 of
  the camera, no Alt) asks for its shop. A seller's right-click menu is "View equipment" only.
- **The title balloon** over every open shop, the seller's own too: Neuz's three texDialogBox pieces, the text red or blue
  at random, placed as `CDialogMsg::Render` places it.
- **Rules kept**: a seller with an item up cannot walk, click the world or use item/skill shortcuts; anyone with a shop
  window open cannot click the world; no chat bubble over a seller; the NPC shop does not open with a shop window open; the
  shop does not open with the NPC shop or an NPC dialogue open; the held items are faded in the bag.
- **Phone** (landscape): the shop is a panel at the left like the NPC shop's, the bag at the right. Tap an empty row to
  choose it, then tap a bag item (or just tap a bag item: it goes on the first free row). Rows have a Remove button before
  the shop opens. Price and quantity are number fields (`inputmode=numeric`, the phone's number keyboard) with Min / Max.
  A buyer taps a row to buy. The balloon over a seller can be tapped to open its shop. The chat is a panel over the bag.
  All text 14 px or more; the joystick hides while the shop panel is open.
- **Pictures**: 24 theme files added to the UI stage (`ButtChat`, `ButItemNum*`, `ButItemMin/Max/Multi/Divid/Equa`,
  `Window04`, `WndVenderArrowEx`, `WndPosMark`, `texDialogBox_left/center/right`), converted into this worktree only.
- **Tests**: `apps/client/test/personalShop.test.ts` (16), `packages/protocol/test/vendor.test.ts` (8),
  `apps/client/e2e/personalShop.spec.ts` (seller and buyer, desktop and phone: 4 runs, all pass). `hud.test.ts` updated for
  the Start menu's 13th line (362 px).

## Left out, and why

- **Guild cloak check on the client**: the browser does not keep `m_idGuild`, so the keypad opens and the server refuses
  silently (as Neuz's server does).
- **Closing the shop when the seller is hit** (DPClient.cpp:1795-1812): a seller cannot be attacked unless forced or in
  PK; left for later.
- **Ctrl+click outside a safety region not opening a shop**: the browser's press has no Ctrl; any click opens it.
- **Chaotic-player, duel, school-event and Summon Angel refusals on the client**: the browser has no duel, school event
  or angel window; the server still refuses a chaotic player with its own message.
- **Changes from Neuz on purpose**: Reset is hidden on a buyer's window (Neuz shows it, where it would take the buyer's own
  items off); the phone's balloon tap opens a shop from any distance in view (Neuz needs a click within 20 of the camera);
  the keypad's "/ 0" gives 0 (Neuz would crash).
- **Gateway / servers**: nothing was missing; all packets pass unchanged. No offline shop exists in V15.

## Device checklist (owner)

> **Personal shop** (two characters: A sells, B buys; once on PC, once on a phone).
> 1. A: Start → Private Shop. The shop opens beside the bag, titled "Private Shop".
> 2. A (PC): drag a stack of potions onto a slot; (phone) tap a bag item. "Sell Item Registration" opens with the stack's
>    count. Set a price (PC keypad or keys; phone number field), OK. The slot shows the item, price and count; the bag item
>    is faded. Right-click / Remove takes it off.
> 3. A: type a shop name (6+ letters), OK → "Will you open your shop?" → OK. The title becomes "Private Shop(Shop is
>    opening)", the chat window opens, a balloon with the name shows over A. A cannot walk now.
> 4. B: the balloon is over A. PC: left-click A; phone: tap the balloon. A's shop opens on B's screen with the name shown
>    and no OK/Cancel. Right-click A on PC: the menu has only "View equipment".
> 5. B: PC double-click a slot / phone tap a row → "Buy Item": Quantity is all of it; Min, OK. B gets the item, pays; A
>    gets the penya; both see the count drop; A's Information tab says "Character: B has purchased ...".
> 6. B: write in the chat; A sees it in Dialog. B closes the shop window; A's Information tab says B left.
> 7. A: Cancel → "Will you close your shop?" → OK. The balloon goes; the shop window comes back with the same name and the
>    items put up again (Neuz does this); Cancel again closes it. A can walk again.
> 8. Phone: every text readable (14 px), the shop panel at left and the bag at right, the number keyboard for prices.

## Owner's runs

- Unit tests: `npx vitest run` → all pass except the 5 old failures on main (looks.test.ts x3, inventoryWindow.test.ts x2).
- E2E: `npx playwright test -c apps/client/playwright.config.ts personalShop.spec.ts --project=chromium --project=phone`
  (with `E2E_CLIENT_PORT` set if 5174 is busy) → 4 passed.

## Convert for the main folder

UI only (does not touch `itemProps.json`):

```
npm run convert -- --only "ButtChat*,ButItemNum*,ButItemMin*,ButItemMax*,ButItemMulti*,ButItemDivid*,ButItemEqua*,Window04*,WndVenderArrowEx*,WndPosMark*,texDialogBox_*"
```
