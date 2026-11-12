# Closed beta fixes (2026-11-12): checkpoint

Branch `beta-fixes`, from main `f6a955e`. Four fixes, and four rounds the owner asked for after (sections 5 to 8;
sections 7 and 8 change parts of the earlier ones). Up to 9404a6b merged into main as 103093e (live); section 8 on top of
it, the branch fast-forwarded to main first. No convert needed (no converter or asset change).

## 1. The debug overlay is hidden on the live site

The corner text (fps, frame, heap, `device: <user agent>`, bundles ...) is the `#overlay` of
`packages/scene/src/overlay/Overlay.ts`.

- `Overlay` takes `{ hidden: true }`: the box is still made (`display:none`, `hidden`), still counts, draws nothing.
  `overlay.shown` says which.
- `apps/client/src/debugOverlay.ts` decides: shown in the dev server (`import.meta.env.DEV`) and in a test build
  (`VITE_TEST_HOOKS=1`), the same rule as the test hooks (`main.ts`). A build for the players hides it.
- **The owner's way back on the live site:** add `?stats` to the game's address: `https://osflyff.online/play/?stats`.
  On a phone, the Stats button in the top-right shortcuts then opens it (the overlay is folded on a phone).
- The phone's Stats shortcut is only there while the overlay is shown (`WorldScreen`).
- `docs/hosting.md` step 4's overlay check and the trouble table now say `/play/?stats`.
- The e2e tests run the dev server, so they still see and mask `#overlay`; `window.__client` is unchanged.

## 2. Phone: a bag item on the task bar

- The phone bag's item box has a **Task bar** button (between Use/Equip and Drop) for items in the bag. Worn items
  don't get it, as on the desktop, which drags only bag items.
- Tap it: the bag closes (since section 7: it covers the quick slots), the item row (F1-F9) and the quick slots light.
  Tap a slot: it goes there. Same call as the desktop drag (`TaskBarEdits.dropOn({ from: 'inventory' }, { row: 'item' })`),
  so the same ADDITEMTASKBAR.
- A tap anywhere else (the world, the action slot, the applet row, another window) cancels it.
- Code: `TaskBar.pickItem` / `pickedItem` / `dropItemPick` (the finger's pick now holds a skill or an item);
  `InventoryActions.pickShortcut`; wired in `WorldScreen`.

## 3. Phone: a skill on the task bar

- A tap on a skill already picked it for the bar (tap skill, tap slot), but nothing said so. The phone Skill window now
  has a **Task bar** button in its header: it picks the chosen skill and (since section 7) closes the window, which
  covers the quick slots. Then tap an F1-F9 slot or a quick slot. Same ADDITEMTASKBAR as the desktop drag. The button
  shows pressed while the chosen skill is the one a tap picked.
- Stock rules stay: a circle/finish skill is refused on the item row as in Neuz (`isBarStyle`).
- Code: `SkillWindow.pickChosen`, `.hud-skills-taskbar` (style.css, beside the other `.hud-skills-landscape` rules).

## 4. Phone: pet windows as big as the Status window

- The Status window is scaled 0.63 on a landscape phone; the raised pet's window (`PET_STATUS`) and the buff pet's
  (`BUFFPET_STATUS`) were drawn whole (scale 1, 192 px wide). Both now use the same scale (`STATUS_MOBILE_SCALE`,
  exported from `statusWindow.ts`). The raised pet's window, collapsed, is exactly as high as the Status window.
- They keep their 12 px text (new phone block in `style.css` after the `.hud-buffpet-*` rules), since the phone
  windows' 14 px would run their rows together. Desktop unchanged.

## 5. Phone: the box typed in stays above the keyboard

The owner could not see what they typed in the chat or the private shop's name: the soft keyboard came up over the box.

- `apps/client/src/world/keyboardLift.ts` (`KeyboardLift`, made with the world's `.world` layer in `WorldScreen`): while
  a text box inside the world has the focus on a touch screen (`(pointer: coarse)`), the layer slides up
  (`translateY`, no relayout) so the box's bottom is 8 px above the keyboard, its top never out of sight. It slides back
  when the focus leaves, and while the keyboard is closed with the box still focused (Android's Back).
- The keyboard's top is read from `visualViewport` (Android Chrome, iOS Safari). Until it reports a keyboard, the
  keyboard is taken to cover the bottom 55% (`FALLBACK_COVER`), so the box moves at once; that only for a box the player
  tapped (section 7's round): a window that focuses its own box as it opens (the Message window) brings no keyboard up,
  so the world stays put until the browser reports one.
- Every text box of the world gets it (chat, shop name, messenger, guild, mail ...). Boxes already high enough don't
  move. Desktop never moves. The lobby (login, character name) is not covered: it is outside `.world`.
- Not checked on a real phone here (no soft keyboard in Chromium's emulation): please try the chat and the shop name on
  your phone.

## 6. Phone: smaller centre texts, task bar and chat

The owner found them too big on the phone. Measured before (Pixel 7 sideways, 863 x 360): the level-up caption's text
17 px, the server message lines 12 px, the task bar 720 x 56, the chat above it 720 x 71.

- Centre texts at **half size** (phone block after `.hud-caption > div` in `style.css`): `.hud-caption` `scale(.5)` from
  its top (still at 184/768), `.hud-messages` `translateY(-50%) scale(.5)` (still centred at 520/768). The outline
  shrinks with the text. The message lines are now drawn 6 px high: if that is too small to read, raise the `.5`.
- Task bar **20% smaller**: `PHONE_BAR_SHARE = 0.8` in `taskBar.ts` (the phone width is 80% of what it was, at most 576
  px; the height follows the scale: 56 -> 45 px). Everything that reads `--hud-taskbar-height` / `--hud-taskbar-width`
  follows (bag height, Attack/Jump, chat).
- Chat **20% smaller**: it already takes the bar's width; it is now laid out at width / 0.8 and drawn `scale(.8)` from
  its bottom left, so it is as wide as the bar, sits on it, and is 20% lower (71 -> 57 px). The chat line keeps a real
  16 px font, so iPhones don't zoom in when it is tapped.
- Desktop unchanged. Slots and chat buttons are 20% smaller targets for a finger too.
- Replaced in section 7: the bar is now 30% smaller again, and the phone's own chat gave way to the desktop chat.

## 7. Phone: bar and chat at the bottom left, the desktop chat, bigger Attack, quick slots

The owner's next round: the bar and chat to the bottom left; the phone chat like the desktop's, still on the bar; Attack
20% bigger; empty circle slots round Attack for skills and items, as a phone MOBA has (a little smaller); then the bar
and chat 30% smaller again; then the quick slots' pictures bigger and cut round, so a skill's frame does not show.

- **Bar at the bottom left** (`TaskBar.relayout`): left at the notch's inset (0 without one), no longer centred.
  `PHONE_BAR_SHARE` is now **0.56** (0.8, then 30% smaller): on an 863 px phone 403 x 31 px (was 576 x 45).
- **The desktop chat on the phone** (`NeuzChat` everywhere; `chatWindow.ts`, the phone's own chat, is no longer made):
  `NeuzChat.dock` stands it on the bar each frame (`TaskBar.phoneDock`): as wide as the bar, its bottom on the bar's top,
  laid out 104 px high and drawn at `PHONE_SCALE` **0.56** (58 px on screen); not moved or resized (`WindowFrame.resizable`),
  its place not kept, the move lock hidden; its text 12 px as on the desktop; its small buttons answer a finger a little
  round them. While it is not typed in, its free parts (the messages, the frame) let a finger through to the world, so a
  thumb there still drives the joystick, as with the old phone chat; typing, the messages take the finger (they scroll).
  Tap its line to type, Enter sends; its X closes it and the Start menu's Chatting opens it again. On an iPhone it sits on
  the bar where the bar is drawn (past the home indicator's inset: `TaskBar.phoneDock` reads the bar's `offsetTop`).
- **Attack 20% bigger**: 64 -> 77 px on a phone under 400 px high (80 -> 96 px on a taller one), in the bottom right corner.
- **Quick slots** (`TaskBar.quickSlots`): four circles round Attack, from its left to its top (44 px, or 52 on a taller
  phone). They are **slots 1-4 of task bar 8** (`QUICK_BAR` 7): placing one is ADDITEMTASKBAR for bar 8, taking one off
  REMOVEITEMTASKBAR, as any slot: stock packets, kept by the server with the character, and the desktop sees them on its
  bar 8. Fill one with the bag's or the Skill window's **Task bar** button, then a tap on the circle (they light while
  something is picked). A tap uses it (as F-key on the bar would); a finger held 0.5 s offers **Remove**. The picture
  fills the circle and is cut by it (no skill frame). Cool-downs sweep round them.
- **Jump** moved further out between Attack's left and top (106 px out on a phone under 400 px high, so that it stays
  under the Navigator on a 568 x 320 iPhone); in flight Turbo, Accelerate and Land take the quick slots' places (the
  quick slots hide then). Everything that hides Attack while a phone window is open hides the circles too. The cluster
  is measured from the screen's bottom, as the bar (the HUD's home-indicator inset cancelled, as the old rule did).
- iPhone inset: the windows' room now ends at the floating bar's real top (`setLayoutBottom` less the home-indicator
  inset), and the docked chat is placed exactly (`WindowFrame.docked`), so it sits on the bar with no gap.
- Code: `taskBar.ts` (`QUICK_BAR`, `QUICK_SLOTS`, quick slot press/hold/Remove, `phoneDock`), `taskBarEdits.ts`
  (`DropTarget.bar`, `takeOff`), `neuzChat.ts` (`dock`, `PHONE_SCALE`, `PHONE_HEIGHT`), `frame.ts` (`resizable`,
  `docked`), `WorldScreen.ts` (one chat for both, the dock, the quick slots in the HUD), `skillWindow.ts` /
  `inventoryWindow.ts` (Task bar closes the window), `keyboardLift.ts` (the tap rule), `style.css` (the phone block after
  the flight buttons' rules).
- e2e changed for the new chat on the phone: `friends`, `gmCommands`, `itemNpcWindows`, `party`, `talking`, `mobileAudit`,
  `keyboardLift` (the docked chat's line is tapped, Enter sends); `controls` (bar at the left, the joystick's finger
  higher); `landscape`, `mobileUx` (Attack's new size and place); `phoneSizes` and `taskBarFinger` (the layout, the quick
  slots).

## 8. Phone round from the live site (2026-11-13, an iPhone, game area about 730 x 320)

1. **Bar and chat at the left edge**: the bar's left is 0 (it was in by the notch's inset, about 47-54 px on an iPhone).
2. **"Some skills (Keenwheel) cannot be put on the taskbar"**: Neuz's own rule, kept. Keenwheel is a *circle* combo skill
   (`dwComboStyle` CT_CIRCLE; Flurry too; Over Cut, Blindside are *finish*): `CWndTaskBar::OnDropIcon` takes only step and
   general skills on the F-key rows (WndTaskBar.cpp:2026-2041), silently. They go in the action slot. New: on the phone a
   combo skill tapped onto an F slot or a quick slot says so in a line (`TaskBar.placePicked`).
3. **Action Slot window** (`hud/actionSlotWindow.ts`, `TaskBar.actionSlotWindow`): a phone's tap on the action slot (with
   nothing picked) opens it: the five slots, each skill with × to take it out (`RemoveSkillQueue`: the ones after it that
   can no longer follow go too), and the player's skills, a tap adding one after the last, greyed where Neuz refuses it
   (combo order, cool-down, five at most, chain running: `TaskBarEdits.canQueue`). SKILLTASKBAR, as the desktop's drag.
4. **Shop**: a phone's tap on an item shows the desktop's own tooltip by it (the item's, with its price), until the next tap
   (the owner: the same tooltip as the bag's, with the price, not a full panel). The amount is − count +; a tap on the count
   opens the game's number pad (Min, Max, Backspace, Clear, OK) in the item list's place: no phone keyboard.
5. **Top icons in two rows of four** (grid); every phone shows all eight now (the narrow-phone hiding is gone); Stats (test
   builds, `?stats`) beside the first row. The target bar moved under the two rows (96 px down). The icons now lie under
   the windows and menus (z-index 0, was 50): their second row covered a window's close button and an NPC's menu.
6. **Navigator 30% smaller** on a phone (mobileScale 0.85 -> 0.6).
7. **Three more quick slots** in a row left of the lowest circle, on its line, **20% smaller** than the others (owner's
   follow-up); `QUICK_SLOTS` 7 (bar 8, slots 1-7).
8. **Chat over the bar sometimes**: the bar now watches its layer's size (`ResizeObserver`), not only the window's resize: an
   iPhone's toolbar showing or hiding changed the layer with no resize in time, and the chat stayed where the bar had been.
9. **Quest tracker** at the left under the status window, 10 px text, at most 120 px tall (was 14 px at the right).
10. **Start menu smaller** on a phone: at most 0.85 (was up to 2, 1.25 at 730 x 320). Read as the Start menu ("the
    navigator menus"); the Navigator window itself is item 6.

## 9. Phone: an Action Slot button beside Jump, and the bar while walking (2026-11-13)

1. **Action Slot button** (`hud-action-trigger`, built as Attack and Jump are, `AttackButton`): fixed beside Jump, as big,
   on its line, 8 px to its left, clear of the quick slots. A tap runs the action slot (as C does on the desktop:
   `SkillUse.useActionSlot`); with the action slot empty it opens the Action Slot window instead. Hidden like Jump (flying,
   the bag open, the landscape cover). Icon: `icons/action.svg` (three chevrons in Jump's colours). Desktop: not shown.
2. **"Can't press the task bar or the quick slots while walking"**: a browser makes no `click` from a finger's tap while
   another finger is down (the joystick's), so the bar's buttons never ran. Now a finger's press runs when it lifts on the
   button (within 12 px of where it went down), and the `click` that may follow within 800 ms is not run a second time
   (`TaskBar.button`). A mouse still uses `click`. Covers the F-key slots, the action slot, the quick slots, Start.
   - Neuz's own rule stays: an item with a cast (some potions) is refused while moving: "You can use it when you stand up."
     (TID_PK_STAND_LIMIT, `IsUseItemReadyTime`). The tap works; that item waits for the player to stop.

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run` (after section 8): 4626 passed, 9 skipped; 3 timed out in `pageAssets.test.ts` while the machine ran
  the e2e, 3/3 passed alone (not this branch's). New tests in `debugOverlay.test.ts`, `keyboardLift.test.ts`,
  `overlay.test.ts`, `hud.test.ts` (task bar item pick, Skill window button, quick slots, Action Slot window, the combo
  line, the phone menu's 0.85), `inventoryWindow.test.ts`, `petWindow.test.ts`.
- `npm run check:public-build`: ok.
- e2e (chromium + phone, port 5191), after section 8: `phoneSizes`, `taskBarFinger` (quick slots, Action Slot window),
  `topRightIcons` (two rows, 730 x 320 too), `landscape`, `controls`, `talking` (the phone shop's tooltip and number pad),
  `mobileAudit` (730 x 320 too), `quests`, `keyboardLift`, `friends`, `gmCommands`, `itemNpcWindows`, `party`, `skills`,
  `mobileUx`, `flight`, `navigation`, `questWindow`: all pass (the three that failed in the first run, with the top icons
  over windows' controls and a SKILLTASKBAR check, rerun and passing).
- After section 9: typecheck clean; `npx vitest run` 4630 passed, 9 skipped; `check:public-build` ok; e2e (chromium +
  phone) `taskBarFinger` (a second finger's taps on a quick slot and the action slot while the joystick is held, real
  multi-touch through CDP), `phoneSizes`, `skills`, `mobileUx`, `mobileAudit`, `controls`, `flight`, `landscape`, `items`,
  `buffs`, `party`, `questWindow`, `quests`, `talking`, `travel-items`, `lord`, `world`: 168 passed. Two failed: `world`'s
  status-window test on the phone was outdated by section 7 (Escape now closes the phone's docked chat first, as the
  desktop's): fixed, passes. `travel-items` "a refusal: not standing" (desktop, F1 while W is held 300 ms) is flaky under
  load, 2 of 3 alone; this round does not touch the keys.
- `style.css` braces balanced, never below 0.
- Not checked here: a real phone (keyboard, thumbs on the circles, the chat's small tabs at 0.56, the menu at 0.85).

## For the owner: the full e2e

```powershell
$env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone
```

Passing looks like: every test passes, or only failures that main `f6a955e` already has. The tests that touch this
branch: `taskBarFinger`, `keyboardLift`, `phoneSizes`, `talking`, `mobileAudit`, `landscape`, `skills`, `mobileUx`, `friends`,
`gmCommands`, `itemNpcWindows`, `party`, `flight`,
`topRightIcons`, `controls`, `items`, `windows`, `world`. Any phone test that measures the task bar or the chat in pixels may need
the new sizes (section 6).

Then by hand on the live site after deploy: no corner text on `/play/`; `/play/?stats` shows it.
