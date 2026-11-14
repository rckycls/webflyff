# Guild bank in V15's look (2026-11-15): checkpoint

Branch `guild-bank`, cut from main `e9b09be`. Research: the session note `housing-research/research-note.md` §1 (with
`A-client.md`, `B-server.md`, `C-flyffweb.md`). The server needs no change: `GUILDBANK` is on in `WorldServer.ini`.

## What changed

**Protocol** (`packages/protocol/src/world/guildBank.ts`): every guild bank packet.
- Sent: open, close, put an item, take an item, take penya, read the log, create a cloak. Contribution uses the guild's
  existing encoder.
- Read: the window (penya and the 42-slot bank), item in, item out (own or another member's), penya out (own, another's,
  a cloak's), a GM's removal, the log.
- `readSmallContainer` (`own.ts`) is exported for the bank's container. Testkit writers in `packages/testkit/src/guildBank.ts`.

**Guild Warehouse** (`hud/moverMenu.ts`): Juria, Helena and Ollien show it only when you are in a guild and the server's
`ENABLE_GUILD_INVENTORY` event is on, as V15 does. It refuses with a trade, NPC shop, bank or Summon Angel window open.

**Guild Safebox** (`hud/guildBank/guildBankWindows.ts`, `guildBank/guildBankHud.ts`, `guildBank/guildBankBook.ts`).
- `WndGuildBank.tga`, one "Item" tab with 6 x 7 cells (all 42 slots), the coin, the penya with commas,
  Contribute Guild, Create Cloak and the log button. It opens beside the bag.
- Put: drag a bag item in. Worn items and premium items are refused with V15's lines; a stack asks its count.
- Take: drag an item or the coin to the bag. Without the Item or Penya right nothing happens, as in V15. Taking penya
  lowers your contribution on the Member tab.
- Another member's put and take show live while your window is open; the guild window's penya follows the fund.
- Closing it, or moving, sends `GUILD_BANK_WND_CLOSE` (V15 closes it on any move).
- Dropping an item on the ground is refused while it or Contribute Guild is open. The NPC shop, bank, post and Summon
  Angel refuse while it is open.

**Contribute Guild** (APP_GUILD_MERIT1): Quest Items (lists the bag's gems), Penya, YES, NO. V15's checks
(`CanContribute`) and lines; a guild without a name gets V15's box.

**Create Cloak**: master only (the button is greyed for others); guild level below 4 gets "Guild level is too low."; the
server checks the logo, the 10,000 penya and the free slot.

**Bank Log** (APP_GUILD_BANK_LOG): master and kingpins only (others get V15's red line). Four tabs; each asks the server for
its list. Lines are written as V15 writes them (date, name cut at 9, item cut at 25, "+n", "(U)", "<guild> Guild Cloak").

**Phone** (`style.css`): the Guild Safebox is a panel beside the bag, like the bank: 44 px cells, the penya row, three word
buttons (Contribute, Cloak, Log). Taps replace drags: a bag item into the bank, a bank item out, the penya row to take penya
(the number pad). Contribute Guild and the log open over the panel.

## Rulings

1. The window is its picture's 208 x 352, not resdata's 236 x 348: Neuz draws the picture at its own size, and the wider
   window left the close box, the tab strip and its scroll bar hanging off the picture. The grid shows all 42 slots, so it
   has no scroll bar, and the log button sits 16 px left of resdata's place, beside the penya box.
2. The repair window and the beauty shops of V15's checks are not the browser's.
3. `GUILD_BANK_MOVEITEM` is not sent: V15 never sends it.

## For the owner

- **Convert on main** (UI stage, four pictures, no gear sync):
  `npm run convert -- --only "WndGuildBank*,ButtSuppot*,ButtCloak*,ButtRecord*"`
  Until then, the window has no picture and its buttons are blank (the phone shows words anyway).
- **Full suites** (PC, about 20 to 30 minutes each): `npm run test:e2e:client`. Pass is no `failed` line.
- **Live check in the VM** with two accounts in one guild (master and a Rookie without rights):
  1. Master: Juria → Guild Warehouse. Put a stack (ask 2), take it back, take 1,000 penya.
  2. Rookie: can put; dragging out does nothing.
  3. Master: Contribute 1,000 penya. Guild level 4 + a logo: Create Cloak, and the cloak lands in the bank.
  4. Master: the log button; each tab shows lines.
  Send back a screenshot of anything that looks off.
- **Optional server fix** (not done here): the log copies a 14-char date into a 13-byte buffer in the DB server
  (`Source/_Database/DbManager.cpp:8126`), a 2-byte overflow each time the log opens. Probably harmless; a one-line fix.
