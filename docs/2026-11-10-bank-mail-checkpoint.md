# Bank and mail: checkpoint (2026-11-10)

Branch `bank-mail` (worktree `FlyffWeb-worktrees/bank-mail`), from main df57fb7. Research:
`docs/superpowers/specs/2026-11-10-bank-mail-research.md` (+ four appendices in `2026-11-10-bank-mail-research/`). Not merged,
not pushed. No server or gateway change is needed: every packet already passes the gateway.

## Built

- **Protocol** (`packages/protocol/src/world/bank.ts`, `post.ts`): every bank and post packet both ways, as Neuz reads and
  writes them. The own ADD_OBJ now keeps the three banks, their penya, the players in the account's slots and the own slot
  (they were read and thrown away). Testkit writers in `packages/testkit/src/bank.ts`, `post.ts`; `writeAddSelf` takes a bank.
  The guild's code-page text writer is shared (`encodeGameText`).
- **Bank** (`apps/client/src/world/bank/`, `hud/bank/bankWindows.ts`):
  - opens from **Deposit** (Julia, Helena, Ollien; Banker Pang) and from the **Scroll of Private Custody** (15083: its Use now
    opens the bank, with the scroll's ids kept through the PIN);
  - the **PIN**: the set-PIN window the first time (Old PIN "0000", hidden), the enter-PIN window after, Change PIN, Neuz's
    three checks and boxes ("Password should have 4 digits...", "Your new password is different...", "Wrong password.");
  - the **window** as Neuz draws it: `WndCommonBank.tga`, 528 x 256, the three banks of the account (4 x 5 shown of 42 slots,
    packed, scrolled), each bank's penya, the coins to drag, "NOT USE" over a bank not usable (another slot needs a character
    in it and a Common Bank timer); placed beside the bag, which opens with it;
  - **moves**: a bag item or the bag's penya dragged onto a bank; a bank's item or penya dragged onto the bag; one bank to
    another; stacks and penya through "Move Items" (the count set to all of it); all the menu's refusals; "Your inventory is
    full." for BANKISFULL (Neuz's text, also when the bank is full); CLOSEBANKWND on every close;
  - **closes** on any move of the player and with the bag; while open: no drop on the ground ("You cannot drop items while
    trading."), no NPC shop or player trade ("You cannot trade while using the bank."), the trade window, the personal shop
    and the NPC shop do not open beside it.
- **Mail** (`apps/client/src/world/post/`, `hud/post/postWindows.ts`):
  - opens from the **Post Box** (one tap: its only entry), with the bag; Neuz's refusals (trade, post already open, bank,
    PIN, shop);
  - opens disabled on **Inbox** with the **"Mail Request"** box until the box comes (Request after 5 s, asked again every 5 s
    while the server says the box is coming); switching to Inbox asks again;
  - **Send Mail**: Receiver (typed, or the friends' list), Title, the text (Enter a new line), one item dragged on the slot
    (a stack asks its count; the title becomes the item's name; right-click takes it off), Penya, Send, "Rental Fee : 500
    Penya"; Neuz's checks in order and its boxes; the confirm "Would you like to send mail? / Received mail will be deleted
    after 15 days."; only the attachment is cleared after;
  - **Inbox**: `WndPostTable.tga`, 6 rows of 40 px, scrolled: the icon (the item, or the penya seed), the read mark, the
    sender ("FLYFF", "Unknown", 16 letters + "..."), the time left ("15day", "23hr") in Neuz's colours (wrapping past 7 days),
    the title in blue (13 letters + "..."), the received date as a tooltip; a double-click reads;
  - **Read** ("Check Post Box"): READMAIL each time; take the item or the penya by right-click or by a drag onto the bag; the
    storage fee's warning after 7 days (`cost x (8 - days left) / 8`); Delete with its confirm (not a Sealed Character's
    mail); Reply ("Re:" + the shown title);
  - closes on any move of the player (the bag stays).
- **New-mail notice**: a blinking `WndMail` icon on the HUD while the own MODE_MAILBOX bit is set (the owner's request: V15
  has no HUD icon), and Neuz's own blinking envelope in the Messenger at 56,312. The chat line was already there.
- **Phone** (landscape), as the trade's and the shop's: the bank and the post are panels beside the bag, the joystick hidden;
  the bank shows one bank at a time with three tabs; **taps** in place of drags (a bag item tapped goes into the bank shown,
  or onto the mail being written; a bank's item tapped comes out; the penya sack, a bank's penya, a mail's item and penya
  tapped); the **shop's number pad** for counts and penya (its helpers moved to `hud/numpad.ts` and shared, not copied); the
  phone keyboard only for the PIN, the receiver, the title and the text; the inbox scrolls by touch; every word 14 px or
  more, every field 16 px.
- **Pictures**: `WndCommonBank`, `WndCommonBankNotUse`, `ButtReply`, `WndPostTable`, `WndNotUse` added to the UI stage and
  converted into this worktree only.
- **Tests**: `packages/protocol/test/bank.test.ts`, `post.test.ts`; `apps/client/test/bankHud.test.ts` (12),
  `postHud.test.ts` (12); `moverMenu`, `itemUse`, `inventoryWindow`, `premiumItems` tests updated (Deposit and Mailbox enabled,
  the Custody scroll used); e2e `apps/client/e2e/bank.spec.ts`, `post.spec.ts`.

## Left out, and why (with a short plan)

- **Guild bank**: the guild session's. It can reuse the bank's grid (`BankWindow`'s cells and drops), the quantity box
  (`hud/amountBox.ts`) and the drop rules' shape (`bankDropAction`); its packets, window and rights are its own (research §1.6).
- **The "Mail" instant message** (a popup for a minute at the bottom right): the HUD icon, the chat line and the Messenger's
  envelope carry the notice. Plan: port `CWndInstantMsg` (`WndInstantMsg.tga` is converted) with the memos.
- **A chaotic player's bank refusal on the client** (`TID_GMAE_CHAOTIC_NOT_BANK`): it needs the PK table's `nBank`, not
  converted; the server refuses anyway (silently). Plan: convert that column, then check it in `BankHud.request`.
- **The repair, beauty shop and summon angel checks**: those windows are not in the browser yet.
- **Bank to bank on the phone**: the phone moves between the bag and a bank; bank to bank is a desktop drag. Plan: a long
  press on a bank item offering "To bank N".
- **A premium item's second test** (`m_nResistSMItemId`): the browser does not keep it; the attach refuses `m_bCharged` items,
  the server refuses the rest ("You cannot send this item.").
- **Changes from Neuz on purpose**: Change PIN after a Custody scroll keeps the scroll's ids (Neuz loses them and the next PIN
  fails silently away from a banker); the PIN fields take 4 characters (Neuz overflows past 9); the inbox keeps its scroll
  and selection right after a mail goes (Neuz leaves them stale); the HUD mail icon; the phone layouts.

## In-game checklist (owner)

> **Bank** (one character; then a second character on the same account for the Common Bank; once on PC, once on a phone).
> 1. Go to Julia (Flaris). PC: click her, choose **Deposit**; phone: tap her twice, tap Deposit.
> 2. First time: "Bank PIN:" opens with Old PIN filled. Type a new PIN twice (try two different ones first: "Your new password is
>    different..."). OK → "Bank Password" opens; type the PIN → the bag and the **Bank** open side by side (phone: Bank panel at
>    left, bag at right).
> 3. Wrong PIN → "Wrong password.  Please try again." Change PIN works from the same window.
> 4. PC: drag a potion stack onto your bank → "Move Items" → OK; drag a single item; drag the bag's penya sack → amount → OK.
>    Phone: tap a bag item / the penya, use the number pad. The bank shows them; the bag and penya go down.
> 5. PC: drag a bank item and the bank's coin onto the bag; phone: tap a bank item and the bank's penya row.
> 6. The other two banks show "NOT USE" unless a Common Bank scroll is active and a character is in that slot. With one active,
>    drag between banks (PC).
> 7. Walk a step: the bank, the bag and any box close. Drop an item on the ground with the bank open: refused.
> 8. Use a Scroll of Private Custody away from the bankers: PIN → bank; one scroll used.
>
> **Mail** (two characters A and B on two PCs, or a PC and a phone).
> 1. A goes to a Post Box (next to Julia). Click (phone: tap twice): the bag and **POST** open, "Mail Request" shows until the box
>    comes, then **Inbox**.
> 2. A: **Send Mail**: Receiver B, Title, a text of two lines; drag (phone: tap) an item onto the slot (a stack asks its count;
>    the title becomes its name); Penya 1000 (phone: number pad). Send → the confirm → OK. A pays 500 + 1000 penya; "You have
>    sent mail."
> 3. B: the blinking mail icon shows at the top right (and in the Messenger). B goes to a Post Box: A's mail in the Inbox with
>    "15day", the item icon and the title.
> 4. B: double-click (phone: tap) it → "Check Post Box". Right-click (phone: tap) the penya → B gets 1000; the item → B gets it.
>    The icon goes once no unread mail is left.
> 5. B: Reply → Send Mail with "Re:..." and A as receiver; Delete → its confirm → the mail goes.
> 6. Phone: every word readable (14 px), the inbox scrolls with a finger, the keyboard only for the receiver, title and text.

## Owner's runs

- Typecheck: `npm run typecheck` → clean.
- Unit tests: `npx vitest run` → all pass except the 5 old failures on main (`looks.test.ts` x3, `inventoryWindow.test.ts` x2).
  (`pageAssets.test.ts` "fetches index.json once a page" failed once under the full run's load and passes alone: a timing flake.)
- E2E: `npx playwright test -c apps/client/playwright.config.ts bank.spec.ts post.spec.ts --project=chromium --project=phone`
  (with `E2E_CLIENT_PORT` set if 5174 is busy) → 4 passed.

## Convert for the main folder

UI only (does not touch `itemProps.json`):

```
npm run convert -- --only "WndCommonBank*,ButtReply*,WndPostTable*,WndNotUse*"
```
