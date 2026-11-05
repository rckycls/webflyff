# The owner's seven UI bugs: V15 research and rulings (2026-11-05)

What Neuz V15 does for each bug and what the web client now does. The detail, with file:line citations into `Source/`
and `Resource/`, is in four notes beside this one:

- `2026-11-05-ui-fixes-research-premium-windows-1.md`: the name change, channels, sex change, element change, transmute.
- `2026-11-05-ui-fixes-research-premium-windows-2.md`: the summons, the item boxes, the hammer cursor.
- `2026-11-05-ui-fixes-research-upgrade-specialist.md`: Piercing, Safe Upgrade, Safe Piercing.
- `2026-11-05-ui-fixes-research-chat-tickets-wings.md`: the chat's commands, the ticket in use, the wings.

`resdata.inc` is plain ASCII in this Resource (not UTF-16). `__MAINSERVER` is on, so the `__INTERNALSERVER` block is
off. The rulings of `2026-11-05-item-windows-research.md` §5 (message-box prompts, no 3D preview, the items taken by a
click) are replaced by §2 and §3 here.

## 1. "Flying Wings display is not shown"

V15 has two kinds of wings, and the browser drew neither:

- **Wing rides** (IK3_WING 137: Elegant White/Black Wings, Angelic Wings, the Prophet's, the butterfly wings; 11 items).
  They are the only boned rides. `loadRideModel` dropped every scene child but `lod0`, which cut the skin off its
  skeleton: the wings froze in their bind pose at the world's origin. Now the skin keeps its skeleton, its stand and walk
  motions flap it (walk while the thrust is on, `WingMotionSetting`), and it sits on the back as `MoverRender.cpp:610-646`
  places it: turned as the rider's Spine2 by `RotZ(-90) RotX(180)`, at the Neck, the two feather wings nudged.
- **Buff wings** (Wings of an Angel 10223, Cupid Wings 6319): an effect, XI_NAT_WINGANGEL01 1095, made every 1.1 s while
  the item buff is on (`Mover.cpp:3738-3754`), a `CSfxRotate` at the skeleton's event 0 (in Spine2's space, the values of
  `mvr_male.chr` / `mvr_female.chr`), turned with the mover, not lifted. The effect manager gained that mode (`place`).

## 2. The premium items' windows

Each window is its own `resdata.inc` entry, built by `ResWindow` (hud/resWindow.ts) from the entry as data
(items/itemWindowLayouts.ts). None is a message box.

### 2.0 How Neuz's controls draw (the builder's rules)

- A plain static: its title blue 0xff2e70a9 at (2, 2), drawn twice a pixel apart. A group box: its tiles, white at (4, 4).
- A text: the nine edit tiles, black words 6 px in, lines of the font + 5; with WBS_VSCROLL the tiles stop 16 px short and
  a scroll bar (ButtVScrUp/Down, ButtVScrBar, the PUp/PBar/PDown thumb) takes the right 16 px.
- An edit: 3 px in, wrapping at any letter; a disabled one (CWndCommItemDlg) shows its words.
- A picture button: four states of the picture side by side (72 px for ButtOk and its kind), drawn at its own size.
- A combo box: an edit, ButtQuickListDn at its right 20 px, a list under it.
- Every window opens centred (`MoveParentCenter`); its close button and Escape send nothing.

### 2.1 The windows built

| Window | Neuz class | What it does now |
|---|---|---|
| APP_CHANGENAME 224x128 | CWndChangeName | static, edit, OK/Cancel; the rules in a message box, the window kept |
| APP_SELECT_CHANNEL 176x256 | CWndSelectCh | "Please choose a channel", a list; a click on a row sends "0" or "-row" and closes (no OK) |
| APP_CHANGESEX 192x272 | CWndChangeSex | "Change Face", the 3D head of the other sex (portrait camera, scale 4.5, frame 0 of GenStand2 / GenStand, unlit, the hair untinted), Left/Right through 5 faces, OK sends the face |
| APP_CHANGE_ATTRIBUTE 304x288 | CWndChangeAttribute | the slot, the help with its scroll bar, 5 element icons (Icon_MonElemantkind, 1.5x) with the purple glow, OK; closes when the player moves |
| APP_ITEM_TRANSY 176x160 | CWndItemTransy | "Trasy for Item" (the source's spelling): the item and its twin's icons, OK/Cancel |
| APP_SUMMON_PARTY 288x224 | CWndSummonParty | the leader's question |
| APP_MESSAGEBOX_SUMMONPARTY 320x224 | CWndSummonPartyMsg | the member's notice, "How to Use", the scroll's icon at (12, 116), OK only |
| APP_SUMMON_PARTY_USE 288x144 | CWndSummonPartyUse | the buff's double-click: "teleport?" |
| APP_SUMMON_FRIEND 272x144 | CWndSummonFriend | the name in a combo box; 3 to 63 letters, the own name refused, the scroll still in the bag |
| APP_MESSAGEBOX_SUMMONFRINED 288x144 | CWndSummonFriendMsg | the friend's question: only Cancel sends SUMMON_FRIEND_CANCEL |
| the hammer cursor | CUR_HAMMER, `Client/Cursor/anvil.cur` | converted to `ui/anvil.png` (a `.cur` reader), over the bag in the upgrade mode |

Items go into the element change and the transmute by a drop on their slot or a click in the bag (a phone has no drag);
the bag fades the items a window holds (`SetExtra`, alpha 60).

Fixed on the way: the friend summon's SUMMON_FRIEND now carries the scroll's object id (the SUMMON data's high word,
`OnSummonFriend`), not the raw data.

## 3. The item boxes

(items/confirmBoxes.ts) Each its own window, picked by its text as Neuz's callers pick the class; a new box replaces the
one open (`SAFE_DELETE`).

| Box | Opened for |
|---|---|
| APP_COMMITEM_DIALOG "Use Item" 320x128 | the protection and smelting scrolls, the batteries, a ticket in its world, Re-Skill, Blessing |
| APP_RESTATE_CONFIRM "Confirm Re-Stat" 336x160 | the Re-Stat scrolls; Yes only while the bag is open; DOUSEITEM names 0 (Neuz's shadowed member) |
| APP_SMELT_SAFETY_CONFIRM "Confirm Upgrade" 336x160 | the upgrade cursor on a +3 item; Yes only while the bag is open; any close ends the mode |
| APP_RANDOMSCROLL_CONFIRM "Random Option" 304x160 | the random option scroll, after its 4 s wait |
| APP_FUNNYCOIN_CONFIRM "Confirm" 288x128 | a Funny Coin |
| APP_CONFIRM_ENTER "OK" 304x192 | Awakening Protection: the one modal box, its text scrolled, Enter is OK |

## 4. The Upgrade Specialist

BoBoChan (`MaFl_Bobochan`) and Radyan (`MaDa_Laydian`): MMI_PIERCING 23 "Piercing", MMI_SMELT_SAFETY_GENERAL 134 "Safe
Upgrade", _ACCESSORY 135, _PIERCING 136 "Safe Piercing" are enabled (Safe Element Upgrade 167 stays greyed: its card
rules are not built). Every server handler is compiled at V15; no server change.

- **Piercing** (APP_PIERCING 192x256): the item, a Moonstone (2036/2083), an optional GProtect (10465); the cost
  "100,000"; OK asks "Do you want to pierce this item?", then PIERCING_SIZE 0xf000d008 (item, moonstone, gprotect or
  NULL_ID) and the window closes. The answer is the usual DEFINEDTEXT, sound, effect and UPDATE_ITEM.
- **Safe Upgrade / Safe Piercing** (APP_SMELT_SAFETY 304x544, 336 wide in the normal mode): the target, ten rows of a
  material, a protection scroll and (normal mode) a smelting scroll; the goal edit with + and -; START sends
  SMELT_SAFETY 0x70007000 (item, material, scroll, smelting or NULL_ID) every 2 s with a gauge; its answer, snapshot
  0x9900 (a byte: 1 success, 2 failure, 0 and 3 nothing), marks the row with SafetySuccess/SafetyFailure and moves on. The
  bag's die flag counts the stacks down as pieces go in.
- Items go in by a drop, or a double-click (a phone's Use or Equip) on a bag item while the window is open.
- Both close when the player moves or the bag closes.
- This server's NPC shops do not sell SProtect, GProtect or XProtect (`HighRateProfile::RestrictedScroll`): Safe Upgrade
  and Safe Piercing need those scrolls from another source.

## 5. The chat's commands

Neuz V15 has a "/" popup (`CWndCommand`): every command the account's authorization reaches (`IsAuthHigher`, ranked, the
BB VIP letters ranking with the players), by its long name, sorted without case, not filtered, the typed name
highlighted; Enter or a double-click takes it ("/name "). `ParsingCommand` stops at the table's `open` outside Korea: 111
commands (25 for a player, 5 more at GM1, 11 at GM2/Helper, 35 at GM3, 35 at Administrator), matched exactly, case and
all.

Built (hud/chatCommands.ts, chatCommandTable.ts): the list as Neuz shows it, plus each command's words and a GM mark
(an English Neuz shows none), and the arrows walk it. A line goes as Neuz sends it: a client command (`/position`,
`/Time`) runs here; an unknown or refused command is not broadcast as chat (it was); an emoticon (`/laugh` ...) goes as
chat. The other client commands (the trade/whisper/party toggles, the block list) have no option or window here and
send nothing.

## 6. A ticket in use, faded

`CWndItemCtrl::OnDraw` (`WndItemCtrl.cpp:472-487`) draws at alpha 60 (0.235) an item a window holds, the summoned pet,
an item in the repair window, and the ticket in use (`CMover::GetTicket`: the first item buff whose item is a ticket, then
the first bag item of it with a keep time and not expired). The items' keep time is now read (`CItemElem::Serialize`)
and kept up by UI_KEEPTIME 11 (a ticket's first use) and UI_FLAG 9 (expiry).

## 7. The status window's bars

The bars could draw past the window: `MakeGaugeVertex` does not clamp, and the high-rate server's HP can be above the
maximum the client works out. The widths are now kept within the bar, and the client area clips. The owner's rule (not
Neuz's): HP, MP and FP numbers of 10,000 and more read 10k, 12.3k, 100k, 1.2m (cut, never rounded up).

## 8. The shop's tabs

The four tabs were each drawn alone with the chosen tab's slope (tile 13) cut off. They are now one strip laid as
`CWndTabCtrl` lays it (`tabStripTiles`, `chosenTabTiles`): the chosen tab whole over it, its slope (13 and 14) into the
next, titles white and the chosen black.

## 9. Left out

- The friend summon's list is empty: the messenger's friends (ADDFRIENDGAMEJOIN 0x0074) are not read; the name is typed.
- The name change's InvalidName list and the `?` help button (its help text exists in no help file).
- The Madrigal time line of `/Time` (the browser has no game clock); the client toggles' effects.
- Safe Element Upgrade (167) and the safe upgrade's Shift fill (a phone has no Shift).
- The piercing window opens centred, not beside the bag.
