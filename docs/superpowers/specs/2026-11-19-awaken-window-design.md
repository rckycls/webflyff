# Awaken window (CUSTOM, 2026-11-19): design

Owner's request: "an awake window. Something like the piercing window but I enter the item, scroll of awakening and
scroll of reversion and two buttons of Awaken and Cancel. If item placed is already awaken clicking Awaken button should
reduce number of reversion and scroll of awakening, if not only the scroll of awakening." Later: the cost is 50,000
penya, it opens from the Start menu, and a split panel shows the item's current awakening.

V15 has no such window. Today a player double-clicks a Scroll of Awakening (or Reversion), then clicks the item: one
scroll per click, free. That stays as it is.

## Why

Re-rolling an awakening today takes two scroll uses and two clicks on the item each time. One window with all three
pieces in place makes a re-roll one click, and the 50,000 penya per click is a penya sink.

## What the player sees

```
+ Awaken ---------------+ + Awakening ---------+
| = Awaken Item ======= | | STR +12             |
| Item            [   ] | | Attack +4%          |
| Awakening       [   ] | |                     |
| Reversion ->    [   ] | |                     |
| (bag)  50,000         | |                     |
|  [Awaken]   [Cancel]  | |                     |
+-----------------------+ +---------------------+
```

- **Opening:** a top-level Start menu line "Awaken" (desktop and phone). No shortcut key (owner: Start menu; the free
  letters are W A S D and a few others, so none is taken). The bag opens with it, as Piercing does.
- **Look:** the V15 Piercing window (APP_PIERCING, 192 x 256, WndTile00), retitled. Rows: Item, Awakening,
  Reversion ->. The penya bag shows 50,000 once an item is in, else 0. Cancel is the V15 ButtCancel picture. V15 has no
  "Awaken" button picture, so Awaken is a word button in the silver look Auto Play already uses (`.auto-word`), the size
  of Cancel.
- **The split panel (owner):** joined to the window's right edge, the same tiles, titled "Awakening". It lists only the
  item's current awakening, one line per stat, in the tooltip's blue and wording (the same code as the item tooltip). It
  says "Not awakened" when there is none, and is empty with no item. On a phone, where the bag takes one side, the
  lines go inside the same panel under the slots instead.
- **Putting things in:** drag from the bag onto a slot, or double-click (phone: Use) a bag item while the window is
  open; it goes to the slot of its kind. A right-click (phone: a tap) on a slot empties it; on the Item slot, all three.
  Items in the window are held in the bag (shown faded), as in Piercing.
- **Slot rules (client, for quick messages):**
  - Item: an awakening item (weapon, shield, suit, gloves, boots, helmet), not worn ("Please unequip the item first."),
    else "Cannot be done.". A new item empties the other two slots.
  - Awakening: only a Scroll of Awakening (26461).
  - Reversion: a Scroll of Reversion (26462) or Scroll of Reversion (Event) (26563).
- **Awaken click:**
  - Missing pieces are said in the chat and nothing is sent: no item, no Scroll of Awakening, an awakened item without a
    Reversion scroll ("Item has already been awakened."), or under 50,000 penya ("You do not have enough Penya.").
  - Otherwise it sends at once, with no Yes/No box (my call: a box on every re-roll would slow it down; the owner can ask
    for one).
  - The button is locked until the answer comes, or 2 s pass, so a double-click cannot roll twice.
- **After Awaken:** the window stays open and the item stays in. The panel shows the new awakening and the chat says
  "Item has been awakened.". A scroll slot stays filled while its stack has more; when the stack is gone, the slot
  empties.
- **Closing:** Cancel, the X, or closing the bag. Moving does not close it (my call: unlike Piercing, it is not tied to
  an NPC).

## Server (World only, one patch)

- New packet `PACKETTYPE_AWAKEN_WINDOW` `0x8FFF0102`, client to World: three DWORDs, the item's, the Awakening scroll's
  and the Reversion scroll's object ids (`NULL_ID` when that slot is empty). The Cache server passes it on unchanged, as
  it does the Pet Filter's 0x8FFF0101.
- `CDPSrvr::OnAwakenWindow` never trusts the client. It refuses, with the V15 message and nothing spent, when:
  - the player is trading or has a personal shop open;
  - the item is missing, unusable, worn, expired, or not an awakening kind (`GetRandomOptionKind != eAwakening`);
  - the Awakening slot is not a usable Scroll of Awakening (26461);
  - the item is awakened and the Reversion slot is not a usable 26462 or 26563. "Awakened" counts the stat bits, the
    Awakening Protection flag, and a pending protected roll, so nothing slips through as "not awakened";
  - the player has under 50,000 penya.
- Then, in one step:
  1. clear the awakening (`InitializeRandomOption`, which keeps the level-down bits and the random-scroll byte as the
     Reversion scroll does) and any pending protected roll (`ResetNewRandomOption`);
  2. roll a new one (`GenRandomOption`) and send it (`UpdateItemEx UI_RANDOMOPTITEMID`);
  3. take 1 Scroll of Awakening, 1 Reversion (only when it was awakened), and 50,000 penya;
  4. the success sound and effect, "Item has been awakened.", and item and penya logs.
- Awakening Protection is ignored: the window never uses its buff, and a re-roll replaces the awakening (the web client
  never had its keep-old-or-new box).
- Patch `patches/2026-11-19-awaken-window.patch` goes after the 13 patches already on main `Source` (last:
  `2026-11-18-rates-x77`). It touches `_Network/MsgHdr.h`, `WORLDSERVER/DPSrvr.h` and `DPSrvr.cpp` only, away from the
  lines the VIP-perks patch changes. Whichever of the two lands second rebuilds the World exe from both.

## Approaches

1. **New packet, World does all of it (chosen).** One server step checks and takes everything.
2. Send the two V15 scroll uses (Reversion, then Awakening) from the window. Rejected: no way to charge penya, and two
   steps can half-fail.
3. Reuse V15's NPC awakening packet (`OnAwakening`, 100,000 penya). Rejected: it needs an NPC nearby, takes no scrolls
   and refuses awakened items.

## Not in scope

- Fashion items (Scroll of Blessedness), pets.
- Awakening Protection's keep-old-or-new box.
- The Neuz (exe) client: FlyffWeb only.

## Left to the builder

- The Start menu spot and its icon (the Scroll of Awakening's item icon), checked to fit on desktop and phone.
- The applet id (next free own id after the Pet Filter's 9003).
- How the panel's lines are drawn, reusing the tooltip's awakening code.
