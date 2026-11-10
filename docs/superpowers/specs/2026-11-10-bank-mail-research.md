# V15 bank and mail: research (2026-11-10)

The owner asked: "Research on how Bank (Custody), mail on the original v15 client and implement it on the web. Make sure the
mobile version is responsive as well."

This note is the short version. The full notes, with every rect, text and packet field and its file:line, are the four
appendices in `2026-11-10-bank-mail-research/`:

- `A-bank.md`: the bank, its PIN windows, packets and server rules.
- `B-mail.md`: the post (send, inbox, read), expiry, the new-mail notice, packets and server rules.
- `C-flyffweb.md`: what FlyffWeb has today and where each piece plugs in.
- `D-online.md`: wiki and guide pages (thin for the bank; the code wins where they differ).

Sources: the Neuz source (`Source/`, CP949, read with `iconv -f cp949 -t utf-8`), `Resource/resdata.inc`, `ResData.h`,
`textClient.inc` + `textClient.txt.txt`, `resData.txt.txt`. Line numbers are those files' own.

## 0. Switches and custom code

- Neither system sits behind a build switch: the bank, its PIN windows, the 3-character "common" bank and the post are always
  compiled and always on (`Neuz/VersionCommon.h`, `WORLDSERVER/VersionCommon.h`: no `__BANK*` / `__POST` define).
  `__MAIL_REQUESTING_BOX` (the "Mail Request" box while the inbox loads) is on in Neuz (`Neuz/VersionCommon.h:252`).
- The only custom code is `__BB_STAFF_MODERATOR_AUTH` on the server (staff accounts refused at the bank and the post,
  `WORLDSERVER/DPSrvr.cpp:1033-1039, 4997-5003` ...). Left out, as the owner asked.
- Nothing needs a server or gateway change: every packet below already passes the gateway.

## 1. The bank

### 1.1 Names and how it opens

- In game the window is titled **"Bank"**; "Custody" is the **Scroll of Private Custody** (item 15083), which opens the
  same bank anywhere (A §2.4).
- NPC menu `MMI_BANKING` = 9, text `TID_MMI_BANKING` "Deposit", on Julia (Flaris), Helena (Saint Morning), Ollien (Darkon)
  (`Resource/character.inc:469-474, 1119-1124, 2458-2463`). FlyffWeb shows it greyed today (`hud/moverMenu.ts:79-80`).
- The menu's checks (`_Interface/WndWorld.cpp:5451-5536`): a trade open → "You cannot trade items when using the bank.",
  the NPC shop → "You cannot use the bank while trading", a bank or PIN window open → "You are already using the bank.",
  repair, beauty shop, summon angel, a chaotic player → their own lines. Then `OPENBANKWND( NULL_ID, 0 )`.
- The server (`DPSrvr.cpp:1025-1062`) needs a banker within 32 units (distance² < 1024) and answers `BANKWINDOW( mode )`:
  **mode 0 = the PIN is still "0000" → the set-PIN window; mode 1 → the enter-PIN window** (`DPClient.cpp:3031-3055`).
- A correct PIN: `CONFIRMBANKPASS( 1 )` → the **inventory opens** and the bank opens beside it (`DPClient.cpp:3113-3128`,
  `WndBank.cpp:111-120`: left of the bag when the bag is on the right half, else right of it, same top).
- The bank's contents are **not** sent on open: all three banks, their penya and their owners' ids come in the own
  character's ADD_OBJ at login (`ObjSerializeOpt.cpp:241-256`). FlyffWeb reads past them today (`own.ts:58-79, 142-144`).

### 1.2 The PIN (A §3)

- 4 digits, per character, default "0000" in the database; the client never receives it. No retry limit.
- **Enter PIN** (`CWndConfirmBank`, APP_CONFIRM_BANK, resdata.inc:28095, `WndTile06.tga` 272 x 160, "Bank Password"): "Enter
  Bank PIN", "PIN", a password field, OK, Cancel, **Change PIN** (`ButtChange.bmp`). OK: 4 digits → `CONFIRMBANK( pin, id, item )`,
  else the box `TID_DIAG_0025` "Password should have 4 digits. Please try again.". Wrong → `CONFIRMBANKPASS( 0 )` → the window
  again and the box `TID_DIAG_0028` "Wrong password.  Please try again.".
- **Set / change PIN** (`CWndBankPassword`, APP_BANK_PASSWORD, resdata.inc:26835, 272 x 208, "Bank PIN:"): "Set/Change Bank
  PIN", Old PIN / New PIN / Confirm PIN, OK, Cancel. Mode 0 (first time): Old PIN filled with "0000" and hidden, focus on New.
  Mode 1 (Change PIN, or after a wrong old PIN): all empty. OK checks in order: three lengths 4 (`TID_DIAG_0025`), new = confirm
  (`TID_DIAG_0022` "Your new password is different from the password you confirmed. Please try again."), all digits
  (`TID_DIAG_0025`), then `CHANGEBANKPASS( old, new, id, item )`. Answer 1 → the enter-PIN window (type the new PIN once);
  0 → the change window (mode 1) and "Wrong password.".
- Both PIN windows are movable and not modal; the fields show `*`.

### 1.3 The window (A §4)

- APP_COMMON_BANK (resdata.inc:10679-10798): **`WndCommonBank.tga`, one picture, 528 x 256, title "Bank"**. Three panels,
  one per character slot of the account (bank 0 left), each a 4 x 5 visible grid of 32 px over its 42 slots with a scroll
  bar, one "Item" tab under it, a coin to drag the penya and the penya as a plain number (no commas).
- Items are drawn **packed** (the filled ones in storage order, no gaps; `WndItemCtrl.cpp:664-702`); a stack's count at the
  bottom right; expired items tinted red; the normal item tooltip.
- **Usable banks** (`ReSetBank`, `WndBank.cpp:125-150`): the own slot always; another slot only when a character is in it
  (`m_idPlayerBank[i] != 0`) **and** a Common Bank timer runs (`SM_BANK15` 0, `SM_BANK30` 1, `SM_BANK001` 25). An unusable
  bank still shows its items, under `WndCommonBankNotUse.tga` at alpha 50, and takes no drag or drop.

### 1.4 Moving items and penya (A §5, §6)

Drag only, in Neuz. Stacks and penya go through the trade's quantity box (`CWndTradeGold`, "Move Items", modal; the count
set to all of it).

| move | packet | then |
| --- | --- | --- |
| bag item → bank | `PUTITEMBANK( bank, objectId, n )` 0xffffff42 | `PUTITEMBANK( bank, item )` snapshot → `m_Bank[bank].Add`; `UPDATE_ITEM` for the bag |
| bag penya → bank | `PUTGOLDBANK( bank, n )` 0xffffff43 | `PUTGOLDBANK( bank, bagGold, bankGold )` |
| bank item → bag | `GETITEMBANK( bank, objectId, n )` 0xffffff44 | `GETITEMBANK( item )` → `m_Inventory.Add`; `UPDATE_BANKITEM( bank, id, 0, rest )` (0 removes) |
| bank penya → bag | `GETGOLDBANK( bank, n )` 0xffffff45 | `PUTGOLDBANK( ... )` |
| bank → another bank | `PUTBANKTOBANK( 1, from, to, objectId, n )` / `( 0, from, to, penya )` 0xffffff49 | as above |

- Client checks: an item dragged from the equipment → "Please unequip the item first."; the quantity box clamps to what
  there is. Everything else is the server's.
- Server refusals (`DPSrvr.cpp:1276-1381, 1665-1830`), mostly silent: quest items into another character's bank; bound,
  timed, blessed, level-down, event, link, guild-cloak and vagrant flying items; an item in use ("You are already using that
  item"); an equipped item ("Please unequip the item before selling it."); a full bank **or** a full bag →
  `BANKISFULL` → "Your inventory is full." (the original text, kept); penya over 2,147,483,647 per bank or bag. **No fees.**
- `CLOSEBANKWND` (no payload) on every close.

### 1.5 Closing and locks (A §2.5, §8)

- The bank closes on **any movement** of the player, on closing the inventory, on accepting a duel (with the quantity box,
  the inventory and the PIN windows) (`WndWorld.cpp:8313-8337`).
- While it is open: dropping a bag item on the ground → "You cannot drop items while trading."; the NPC menu's trade/shop →
  "You cannot trade while using the bank.", Mailbox → the same, Repair → its line; a trade, NPC shop, vendor or guild bank
  window refuses to open alongside it. The bag stays usable (Neuz's checks test the dead `APP_BANK`).

### 1.6 The guild bank

`CWndGuildBank` shares the item grid, the penya drag, the quantity box and the "beside the inventory" placement (about 30 %
of the bank's code). Its packets, rules (no PIN, the contents come with the open reply) and window are its own. It is left
for the guild session: `hud/bank/bankWindows.ts`'s grid and the quantity box are written to be reused by it (A §9).

## 2. The mail (the post)

### 2.1 How it opens (B §2)

- Only `MaFl_Postbox` ("Post Box", MMI_POST 25 "Mailbox", one entry: a press within 20 units opens it at once). Checks
  (`WndWorld.cpp:4525-4612`): a trade → "You cannot use the Mailbox while trading.", the post open → "Not available", the
  bank → "You cannot trade while using the bank.", a PIN window → "You are already using the bank.", and the repair, shop,
  beauty and angel lines. Then the **inventory opens** and the post window opens centred.
- `CWndPost` opens **disabled**, on the Inbox tab, sends `QUERYMAILBOX` (0x1d) and shows the modal **"Mail Request"** box
  (192 x 192, "Requesting the post...", a Request button enabled after 5 s; the client also asks again every 5 s while it
  waits). The answer `QUERYMAILBOX` (0xe9, the whole box) or `QUERYMAILBOX_REQ( FALSE )` (0x8860, no mail) enables the window.
  Every switch to Inbox asks again. A mail that arrives while the window is open shows only after the next ask.
- It closes on any movement and on accepting a duel (the inventory stays).

### 2.2 The window (B §3-§6)

- APP_POST (resdata.inc:27030): `WndTile00.tga` tiled, 320 x 368, "POST", two tabs at the bottom: **"Send Mail"** and **"Inbox"**.
- **Send Mail** (APP_POST_SEND, :26928): Receiver (an editable combo filled with the friends), Title, the body (Enter = a new
  line), the item slot (`WndChgElemItem.bmp`), "Penya" and its field (moved 14 px left on English clients), Send
  (`ButtSend.bmp`), "Rental Fee : 500 Penya".
  - Attach: drag one bag item onto the slot; not equipped ("Please unequip the item first."), not premium ("You can not use
    the premium items."); a stack asks its count (the quantity box); **the title becomes the item's name**; right-click takes
    it off; the bag item is faded meanwhile.
  - Send checks in order: receiver or title empty → nothing; penya not digits → nothing; penya > 1,000,000,000 → "You can not
    send that much Penya."; receiver 3-16 → "That name is too long.  Please try again."; body > 255 → "The text should be
    under 256 letters."; title > 31 → "The title should be under 32 letters.". Then the box "Would you like to send mail? /
    Received mail will be deleted after 15 days." OK → `QUERYPOSTMAIL( item, count, receiver, penya, title, text )` 0x1a, and
    only the attachment is cleared.
  - Server: unknown name → "Unknown user"; yourself → "You cannot send a message to yourself, silly."; a postbox within 32
    units (silent); the receiver's 50 mails → "%s's mail box is full."; item rules (quest, bound, cloak, ride, premium, in a
    trade) → "You cannot send this item."; postage **500 penya** (with or without an item) + the penya → "You do not have
    enough Penya."; success → "You have sent mail."; a database failure → "You have failed to send." and all refunded.
- **Inbox** (APP_POST_RECEIVE, drawn in code): `WndPostTable.tga` at alpha 150, 6 rows of 40 px, oldest first, a scroll bar.
  A row: the item's icon (or the penya seed for penya alone), `WndNotUse.tga` at alpha 110 over it once read, the sender (16
  letters + "...", "FLYFF" for the game's own mail), the time left ("15day", "23hr") in its colour, the title in blue (13
  letters + "..."), the received date as a tooltip. Double-click reads it.
- **Read** (APP_POST_READ, :25539, 288 x 336, "Check Post Box", modal): Sender, Title, the text, the item slot, the penya
  (`ButtMoney.tga` and the amount with commas), Delete, Reply, Close. Opening sends `READMAIL( nMail )` (0x24) every time.
  - Take the item: right-click the slot (or drag it to the bag). After 7 days a storage fee `cost × (8 − daysLeft) / 8`
    first asks "The time 7 for basic custody expired. Therefore you should pay %d penya as charges for custody." (Yes / No).
    → `QUERYGETMAILITEM( nMail )` 0x1c. A full bag → "Inventory is full. Please make room and try again..".
  - Take the penya: right-click the penya (or drag it) → `QUERYGETMAILGOLD( nMail )` 0x1f; the field shows 0 at once.
  - Delete → "Do you want to delete this mail? / If you do, items and penya in this mail will be deleted as well." Yes →
    `QUERYREMOVEMAIL( nMail )` 0x1b and the read window closes. (Nothing for a Sealed Character scroll's mail.)
  - Reply → the Send tab, receiver = the sender, title "Re:" + the shown title, the read window closes.
  - There is **no return to sender** in V15.
- The server's answers: `REMOVEMAIL( nMail, type )` 0xe7 (0 the mail gone, 1 its item taken, 2 its penya taken, 3 read).

### 2.3 Expiry (B §7)

A mail keeps **15 days**, the first 7 free; the database deletes older ones every minute, **item and penya lost**. The days
left use the day of the month only (`CMail::GetMailInfo`, `post.cpp:61-87`; wrong across a month change, and the server's fee
uses the same sum, so it is copied). `nDay <= 1` shows hours. The colour is an unclamped lerp that wraps (B §7.3 table).

### 2.4 The new-mail notice (B §8)

- `MODE_MAILBOX` (0x8000) in the own mover's mode = an unread mail. It comes in ADD_OBJ and `MODIFYMODE`.
- Neuz: a "Mail" instant popup "New mail has arrived" for a minute, the chat line (FlyffWeb prints it already,
  `WorldScreen.ts:3449-3463`), and a blinking 12 x 12 `WndMail.dds` in the Messenger at 56,312. **No HUD icon in V15.**
- The owner asked for a HUD icon: it is a FlyffWeb addition, shown while the bit is set, with Neuz's picture and text.

## 3. What the browser builds (decisions)

1. **Protocol**: `world/bank.ts` and `world/post.ts` (every packet both ways, testkit writers); the own ADD_OBJ keeps the
   banks, their penya, their owners and the own slot.
2. **Bank**: the NPC's Deposit and the Custody scroll; the two PIN windows; the 528 x 256 window with the three panels, the
   NOT USE cover and the usable rule; drag both ways (bag ↔ bank, bank ↔ bank, the coins); the quantity box; all the
   refusals; closing on movement and with the bag; the locks of 1.5.
   - Change PIN after a scroll open keeps the scroll's ids (Neuz loses them, so the follow-up silently fails away from a
     banker; passing them changes nothing on the server).
3. **Mail**: the Post Box; the request box; the two tabs; send with an item and penya; the inbox; read, take, delete, reply;
   the fee warning; the colours and the date tooltip (en-US format).
4. **New-mail icon** on the HUD (owner request) and the Messenger's blinking envelope.
5. **Phone** (landscape), following the trade / jewels pattern:
   - the bank is a panel beside the bag, its three banks as tabs (one grid at a time); the post is a panel too;
   - **tap** in place of drag: a tap on a bag item puts it in the open bank (or attaches it to the mail); a tap on a bank item
     takes it out; a tap on the penya sack or a bank's penya moves penya;
   - the quantity and penya amounts on the **shop's in-game number pad** (moved to a shared file, not copied);
   - the phone keyboard only for text: the PIN, the receiver, the title, the mail text;
   - the inbox scrolls by touch; all text 14 px or more.
6. **Left out**: the guild bank (its own session), the "Mail" instant popup (the chat line, the HUD icon and the Messenger
   envelope carry the notice), the dead local mail cache file.
