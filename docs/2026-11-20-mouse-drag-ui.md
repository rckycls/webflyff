# Mouse drag and windows, V15 parity (2026-11-20, branch mouse-drag-ui)

Three small changes. Desktop and phone unless said. No picture needed a convert: every picture used is already in
`dist/assets` (ButtOk, ButtCancel, ButtYes, ButtNo, ButItemPlus/Minus/Max, WndQueItmwarning, itm_GolGolSeed).

## F. Bag drag and ground drop

- **Drag picture.** A bag item's drag shows the item's own 32 x 32 icon with its middle on the cursor, as Neuz draws the
  carried icon at cursor -16, -16 (`Neuz/Neuz.cpp:819-830`). The penya sack shows `itm_GolGolSeed`
  (`CWndGold::OnInitialUpdate`, `_Interface/WndField.cpp:504-507`). Done with `dataTransfer.setDragImage` on the loaded
  icon (`hud/dragIcon.ts`). The browser still draws it a little see-through; Neuz draws it solid.
- **Ground drop** (`hud/dropWindows.ts`, used by `hud/inventoryWindow.ts`), `CWndWorld::OnDropIcon`
  (`_Interface/WndWorld.cpp:7765-7926`) in order:
  - a shop, bank, guild bank, Summon Angel, beauty shop or trade window open: TID_GAME_TRADELIMITITEM; the Repair window
    open: TID_GAME_REPAIR_NOTDROP (`:7776-7808`). Asked before any box opens (`InventoryActions.dropLimit`).
  - the penya: TID_GAME_CANNOT_DROPMONEY (`:7837-7843`).
  - a guild cloak: nothing; a charged item: TID_GAME_NOTDROP; an item in use: nothing; an undestructable item:
    TID_GAME_ERROR_UNDESTRUCTABLE_ITEM (`:7869-7889`).
  - a quest item: `CWndQuestItemWarning`, APP_QUEITMWARNING (`:7891-7897`, `WndField.cpp:395-471`), then one of:
  - one item: `CWndDropConfirm`, APP_DROP_CONFIRM, OK/Cancel, drops 1 (`:7900-7911`, `WndField.cpp:211-288`);
  - a stack: `CWndDropItem`, APP_DROP_ITEM, the count box filled with the whole stack, kept to the stack, OK or Enter
    sends, centred (`:7913-7926`, `WndField.cpp:87-205`).
  - Each box goes once its item is in use or gone (`Process`, `__DROP_CONFIRM_BUG`). They stay when the bag closes
    (they are Neuz's own windows, not the bag's).
  - The send is still `actions.drop(id, count)`.
- **Phone.** The bag card's Drop opens the same windows, in the middle over the bag at their own size (as the trade's
  boxes), with the panels' pale backing; the count is typed on the game's number pad (`padField`).

## G. NPC shop drags (desktop only; the phone keeps its select + Buy/Sell buttons)

FlyffWeb's shop had no count boxes (a count field + Buy/Sell), so Neuz's are ported in `hud/shopConfirmWindows.ts`:

- **Buy:** a stock item dragged into the bag (`CWndInventory::OnChildNotify`, `WndField.cpp:1757-1807`): the penya (or Red
  Chips) for one first, else TID_DIAG_0048 (TID_GAME_CANNT_BY_REDCHIP) in a box; then `CWndConfirmBuy`
  (APP_CONFIRM_BUY_ = APP_CONFIRM_BUYEX, `_Interface/WndShop.cpp:259-656`): the count from 1, + / - / Max (99; 9999 for
  charms, arrows and Red Chips; 21 Perins), the cost of them all; OK runs `OnOK`'s checks (TID_DIAG_0006, 0009, 0086,
  0087, TID_GAME_CANNTBUY_REDCHIP boxes) and then the shop's own buy path.
- **Sell:** a bag item dropped on the shop window (`CWndShop::OnChildNotify`, `WndShop.cpp:851-925`): a quest item is
  refused; a worn one says TID_GAME_EQUIPTRADE; a charged one asks `CWndWarning` (APP_WARNING, `:25-62`) first; then
  `CWndConfirmSell` (APP_CONFIRM_SELL, `:66-256`), filled with the whole stack, the sale price of them all; OK sells. It
  goes once the item is in use.
- The bag's items can now be dragged while the shop is open (before, the shop turned the drag off).
- The select + Buy/Sell buttons work as before.
- Not done: the sales tax line of the totals (`CTax`) — the totals use the shop's own price (`priceOf`, VIP-aware).
- Note: Neuz's English TID_DIAG_0006 ("sold to another user") reads "User ID already exists." in this client's texts;
  that is what V15 shows for a sold-out item, and it is what this shows.

## H. Windows

- **Resize** (`hud/frame.ts`): a captioned WBS_THICKFRAME window's edges now drag (6 px band, 8 ways, 16 px steps, snap
  within 10 px of the screen: `WndBase.cpp:1196-1229, 1334-1360, 1967-2001`). This fixes the Message window
  (`friendWindows.ts`), which showed the resize cursors but did not resize. New `resizeMax` (`AdjustMaxRect`,
  `WndBase.cpp:2502-2522`). Desktop only.
  - Message window: min 160 x 160 (`WndMessenger.cpp:1144, 1160-1162`) — fixed.
  - Navigator (minimap): 96 x 112 to 192 x 208 (`WndField.cpp:10085-10090`); the map fills the new size, the zoom buttons
    keep to its bottom (`OnSize`, `:10091-10097`).
  - Chat (464 x 48) and chat log (272 x 48): already resizable, unchanged.
  - Skipped, Messenger: V15 opens `CWndMessengerEx` (`FuncApplet.cpp:82`) with no WBS_THICKFRAME (`WndMessenger.cpp:784`,
    APP_MESSENGER_EX style 0x2410000) and its min-size code is commented out (`:929-962`). The 176 x 160 rule is the old
    `CWndMessenger`'s. So the V15 messenger does not resize.
  - Skipped, Quest quick info (128 x 96 to 768 x 544): FlyffWeb's quest tracker (`quests/questTracker.ts`) is a plain
    overlay, not a WindowFrame (no frame, no move); making it a window is more than this task.
- **Kept places** (`hud/windowMemory.ts`, `rememberWindows` in `frame.ts`, one line in `WorldScreen.showWorld`):
  Neuz's regInfo.dat (`WndManager.cpp:1981-1986, 2514-2543, 7220-7294`). A window with a `rememberAs` key keeps its place
  (and size when its edges drag) when it closes and on `pagehide`, in localStorage `flyffweb.windowRects` with the
  screen size (`innerWidth x innerHeight`), all in try/catch. It opens there again only on a screen of that size, top and
  left at least 0, then kept on the screen as before. Desktop only (the phone's layouts are fixed).
  - Keys (Neuz's applets): APP_INVENTORY, APP_NAVIGATOR (with size), APP_STATUS1, APP_CHARACTER3, APP_SKILL3,
    APP_QUEST_EX_LIST, APP_MESSENGER_EX, APP_PARTY, APP_GUILD, APP_OPTIONEX, APP_MOTION.
  - The chat already keeps its own place (`chatSettings.ts`), unchanged.

## WorldScreen.ts (small wiring only)

- Inventory actions: `dropLimit` and `say` (beside `drop`).
- Shop actions: `say` and `held`.
- The bag's foreign drops: the shop's drag type (`SHOP_DRAG` → `shopWindow.dropOnBag`).
- `showWorld`: `rememberWindows(doc, localStorage)`.

## Tests run

TEST_RESULTS
