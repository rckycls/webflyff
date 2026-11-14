# Phone panels in the V15 look (2026-11-14)

What the owner asked:
- "Private shop window looks off from original theme. Make items 5x2 and smaller spacings and boxes, buttons and inputs
  are too big as well."
- "The dialog seems to be too big for mobile when there's too many options."
- "The windows look off from the original theme and use uneven spaces and lots of empty space."
- "Wrong fonts and colors, shadings as well."
- "You can make a slight smaller version and proper sizes for mobile version. Do extra research on how it should look
  like on mobile. I want the best UX possible."

The screenshots came from an iPhone in landscape (game area about 800 x 350 CSS px): the Private Shop, Piercing, Post, the
Upgrade Specialist's menu, Unique and Ultimate Weapon, Remove Element, Pierced Card Removal, Remove Jewel, and Safe
Upgrade (Normal, Accessory, Piercing).

## What the design is based on

- **Platform touch rules:**
  - Apple's Human Interface Guidelines: 44 x 44 pt per target. Material Design: 48 x 48 dp.
  - Both allow a smaller picture inside a larger invisible press area.
  - WCAG 2.5.8 (AA) puts the floor at 24 x 24 CSS px with spacing.
  - Gaps between targets of 4 to 8 px, on a 4/8 px spacing scale.
- **Flyff's own mobile UI (Flyff Universe):**
  - The item windows stand beside the bag, which is shown in the window.
  - A tap on an item opens its actions.
  - The NPC choice is a list, not a drop-down.
- **Mobile MMOs in landscape** (RF Online Next, Guild Wars Reforged's mobile UI, Fortnite's mobile guide):
  - Height is the scarce side, so lay out across: slots and the action at the left, words at the right.
  - The main button within a thumb's reach.
  - Panels sized to their content, not full height.
  - Toggles and paging rather than long scrolls of empty rows.
- **The V15 client itself:**
  - Neuz's 12 px Verdana, its label blues (`#2e70a9`) and its title-blue headings.
  - The window frame WndTile00-11, the edit tiles WndEditTile, the slot WndChgElemItem.
  - The picture buttons with their words drawn in (ButtStart, ButtOk, ...).
  - The NPC menu's white box with its 3 px `#e2c6b5` frame (CWndMenu).

## The shared phone panel

Everything is in `style.css`, "the phone's compact V15 panels", in the `(max-width: 1000px) and (pointer: coarse)` blocks.
The desktop is unchanged.

- **Frame:**
  - The window's own WndTile00-11 frame, laid as a CSS grid (`data-tile` 0-11 on a 16 / 1fr / 16 by
    16 / 16 / 1fr / 16 grid), the same way the lobby and the floating keyboard lay it.
  - The white 12 px caption. No imitation stripes, gradients or rounded boxes.
  - A pale backing inside the frame, so the status window does not show through (the tiles let the world through, as
    Neuz's do).
- **Size and place:**
  - Left of the bag, as wide as the content needs (`--panel-width`, at most the room left of the bag).
  - As high as its content, cut to the room above the task bar, then scrolled.
- **Words:**
  - 12 px Verdana with 15 px lines, in the colours the windows give their own words.
  - Boxes of words sit on their WndEditTile pieces, stretched to the box.
  - A box grows up to `--text-max`, then scrolls. Its last line fades while there are more words below (`data-more` from
    `textScrollBar`), so nothing looks cut.
- **Slots:** WndChgElemItem / WndElemItemBlank at 40 px (32 px in Safe Upgrade's lists), the icon centred. ResWindow
  now marks each picture static with `data-picture`.
- **Buttons:**
  - Their own pictures at 1.25x (the words are in the picture), with a few px of extra press area round them.
  - The Post read window's three buttons stay at 1x, to fit side by side.
- **Fields:** no 48 px minimum height (the lobby's).

## Before and after (iPhone landscape, ~800 x 350)

| Window | Before | After |
|---|---|---|
| NPC menu (BoBoChan, 11 entries) | white list, 14 px words on 32 px rows; ran off the bottom | V15 white box, 12 px words on 30 px rows; two columns from 7 entries (top to bottom, then the next column), never past the task bar (then scrolled) |
| Private Shop | list of 20 tall rows, 16 px fields, 36 px buttons | 300 px panel. Name field 22 px. A 5 x 2 grid of 40 px V15 slots, each with its icon, count and short price (1.2M) in the price's colour. ◀ 1/2 ▶ pages. A tap on an item shows its whole name and price (with Remove); a tap on an empty slot chooses it. Hint line, then 26 px Open / Cancel / Reset / Chat. The keypad sheets are smaller too (12 px words, 26 px values, 42 x 36 keys). |
| Piercing | 578 x 313, labels at the left, 44 px slots far right, two full-width white buttons | 300 x 153: Item, Moonstone and GProtect side by side under their words, the cost by its coin, ButtOk / ButtCancel |
| Unique / Ultimate Weapon | 578 x 313, description cut off | 360 px: the three slots in Neuz's triangle with Start under them, the jewel-by-level list at their right, the whole description under them all |
| Remove Element upgrading | 578 x 313, text cut off, empty half | 330 x 142: slot and Start at the left, the text at the right |
| Pierced Card Removal | 578 x 313, seven empty white bars | 390 px: slot and Start at the left. The cards two to a row at the right (empty and unused rows left off), the text under them. |
| Remove Jewel | 578 x 313, tall rows | 390 px: weapon and Moonstone with Start at the left. The five jewels, each beside its stat on Window02, at the right. The text under them. |
| Safe Upgrade (Normal, Accessory, Piercing, Element) | 578 x 313, rows of empty white bars, CSS buttons | 440 x 291: item, NOW and the goal (+, edit, −) on top. The ten tries in two columns of five (material, protections, result). ButtStart / Buttstop / ButtReset. |
| Post: Send / Inbox / Read | 14-16 px words, 32-36 px fields and tabs | 330 x 296: 22 px tabs. 22 px fields on their edit tiles, with the combo's own drop arrow. The text box. The slot, penya and ButtSend. The fee line. Inbox rows 40 px. The read window the same way. |
| Create Jewels, Jewel Setting, Sunstone & Moonstone, Repair (same family) | same flat panels | same skin: slot(s) and Start at the left, the words at the right (Jewel Setting: the weapon with its five sockets beside it) |

## Round two: the other windows with the same flat-panel look (owner: "do them")

The rule: when the desktop window fits the room beside the bag of items (about 515 x 286 on the iPhone), the phone shows
Neuz's own window at its own size. Only a window that does not fit gets a compact layout in the same skin.

The bag beside the Trade, the Bank, the Post, the own Private Shop and the Angel window now shows its items alone, as it
already did beside the item windows. None of those windows takes a worn item, and the window gets the room.

| Window | Before | After |
|---|---|---|
| Trade | flat panel, two white boxes, Arial 14 px words, big gradient OK / Cancel; overlapped the full bag | Neuz's own window: WndTrade.tga at 352 x 288, its cells, names, penya and ButtOk / ButtCancel where the desktop has them, a bigger invisible press area round each button. The request, the final box and the penya box sit in the middle at their own size, with their pictures. |
| Bank | flat panel, 34 px tabs, 44 px cells, 14 px words, full height | 252 px panel on the tiled V15 frame (the three banks' 528 px picture cannot frame one bank). 22 px tabs. Six 34 px cells to a row on Neuz's slot picture, 5 rows shown, then scrolled. 24 px penya line, 12 px words. The PIN windows unchanged. |
| Forsaken Tower | 560 px white panel, 34 px rows, 14 px | Neuz's 384 px window in the middle, sized to its content: the description on its edit (up to 64 px, then scrolled), the seven floors 26 px each (Neuz's 15) on theirs, 12 px |
| Angel Window | full-height panel, 44 px slots, big gradient buttons, the text box over the slots | 480 px across: the stones' four rows of 34 px slots with Reset, Cancel and Start (their pictures) under them at the left; the words, the three rates and the white angel's lines at the right; 12 px |
| Lord windows (info, bid, candidates, pledge, vote, event, skill) | 560 px panels, 40 px rows and buttons, 14 px, the group headers' words missing under their tiles | 460 px wide, sized to their content (the bid window scrolls). The group headers (white words on their blue tiles), the boxes and lists on their edits, 26 px rows, 22 px edits, the buttons their pictures at 1.2x. Lord Skill (the phone's own button) is a grey V15 button with its word, since ButOk2 says "Ok". |
| The bag, the NPC shop | (unchanged: the bag's title is its own V15 picture) | — |
| ResistItem (GM) | (its own picture, WndUpgradeBase.tga) | shown as the desktop window |

## Round three: a consistency pass over every phone window (2026-11-15, owner: "double check for windows that aren't clean or have inconsistencies")

How it was checked:
- A script listed, per window, the phone rules still in the old flat style: the 14–16 px words, Arial, the beige gradient
  buttons, words laid over picture buttons, the hidden frames, the imitation stripes, and boxes of 34–52 px.
- Pictures of every Start-menu window (Character, Skills, Inventory, Private Shop, Quest, World Map, Messenger, Party,
  Guild, Option) and of the windows the NPC specs open, on the phone at 863 x 360.

What was off, and what changed (all in the last phone block of style.css):

| Window | Off | Now |
|---|---|---|
| Messenger, Party, Guild, Quest, Option, Character, Skills, the friend boxes, the message box, the trade's request, confirm and penya boxes, the bank PIN, the amount box, the village and teleporter choices | The world (its name tags) showed through their words, as Neuz's tiles let it | The panels' pale backing inside the frame |
| Guild's buttons (Name, Notice, Logo, Disband, …), the shop's Open/Cancel/Reset/Chat and keypad keys, the bank PIN's buttons, the honour list's OK, the Skill window's Task bar, the bag's item card (Use, Task bar, Drop), Lord Skill | Four different styles: beige gradient, flat beige, dark grey gradient, plain grey; Arial | One: Neuz's picture-button look (silver pill, white Verdana bold words outlined grey); a chosen Task bar lit gold. The keypad's value fields stay white fields. |
| Character and Skills windows | 18 px bold title, larger than every other window's 12 px | 12 px |
| World Map | Two close buttons: the map's own X and a pink web X beside it | The map's own X closes it; the web's button is only its press area, over it |
| The bag's item card | Arial words, 40 px plain buttons | Verdana; 36 px V15 buttons in one row; its × stays a plain ×. |

Left as they are, and why:
- The 14 px words in the Quest, Messenger, Guild, message and village windows: those windows are drawn at 0.7–0.85 on a
  phone, so they show at about 12 px, as Neuz's.
- The chat's own size and the joystick's.

Tests here after round three, phone and desktop Chromium: `dialogue`, `travel-items`, `items`, `honor`, `mobileUx`,
`skills`, `guild`, `party`, `quests`, `worldMap`, `personalShop`, `bank`, `trade`, `windows`, `post`: 88 passed.
- Two failed, and they failed the same way before this round. Both come from the floating keyboard merged into main
  (0cf5a40), not from these windows:
  - `friends` /say: the keyboard's keys lie over the message box's close button;
  - `talking`: a keyboard key is not visible when tapped.
- Two tests changed for this branch:
  - `dialogue`: the phone's menu rows are 30 px on a 32 px pitch;
  - `travel-items`: the Blinkwing's new world sends its buffs in the own ADD_OBJ, as the server does, since the carry-over
    is gone.

## Checks

- Both client typechecks are clean.
- `npx vitest run apps/client`, including the new `phonePanels.test.ts`:
  - `shortPrice`, `phoneCells`;
  - the shop's pages, cells, detail and buy;
  - the menu's columns;
  - `data-picture`.
- `npm run check:public-build`: ok.
- Not run here (the owner's): the e2e specs touched:

```powershell
$env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone e2e/itemNpcWindows e2e/personalShop e2e/post e2e/bank e2e/trade e2e/jewels e2e/summonAngel e2e/lord e2e/arenaTower e2e/buffs
```

Passing means every test passes, or only failures main already has. The specs changed:
- `itemNpcWindows` (`phoneSized`: the V15 frame shown, 12 px words, slots ≥ 32 px, buttons ≥ 24 px, inside the room;
  Safe Upgrade's cells ≥ 32; ResistItem keeps its own picture);
- `personalShop` (10 cells a page, the pager, keys ≥ 36 px);
- `post` (12 px words, the read window's V15 frame, Send ≥ 24 px);
- `jewels` (12 px words, START ≥ 24, sockets ≥ 36);
- `bank` (the title, tabs and penya 12 px, cells ≥ 32);
- `trade` (Neuz's 352 x 288 window, 12 px words);
- `summonAngel` (12 px, slots ≥ 32, the V15 frame);
- `lord` (words ≥ 12, buttons ≥ 24);
- `arenaTower` (12 px, rows ≥ 26, the V15 frame).

After round two these were run here and all pass, on both the phone and desktop Chromium projects: `post`,
`itemNpcWindows`, `jewels`, `personalShop`, `bank`, `trade`, `summonAngel`, `lord`, `arenaTower`.

Seen in pictures here, Chromium only:
- the phone project at 863 x 360: the NPC menu, every BoBoChan and Peach window, the post (send, inbox, read), the shop
  and its chosen slot, the trade, the bank, the Forsaken Tower, the Angel window and the Lord's windows;
- desktop windows unchanged.

Not seen here: a real iPhone. Worth checking there:
- the 1.25x picture buttons' sharpness;
- the fading last line;
- the two-column menu near the screen's right edge.
