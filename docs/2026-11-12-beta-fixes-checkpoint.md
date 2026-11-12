# Closed beta fixes (2026-11-12): checkpoint

Branch `beta-fixes`, from main `f6a955e`. Four fixes, and two the owner asked for after (sections 5 and 6). No convert
needed (no converter or asset change).

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
- Tap it: the item box closes, the item row (F1-F9) lights. Tap a slot: it goes there. Same call as the desktop drag
  (`TaskBarEdits.dropOn({ from: 'inventory' }, { row: 'item' })`), so the same ADDITEMTASKBAR.
- A tap anywhere else (the world, the action slot, the applet row, another window) cancels it; the bag closing does too.
- Code: `TaskBar.pickItem` / `pickedItem` / `dropItemPick` (the finger's pick now holds a skill or an item);
  `InventoryActions.pickShortcut`; wired in `WorldScreen`.

## 3. Phone: a skill on the task bar

- A tap on a skill already picked it for the bar (tap skill, tap slot), but nothing said so. The phone Skill window now
  has a **Task bar** button in its header: it picks the chosen skill (never un-picks it), and shows pressed while the
  chosen skill is the one picked. Then tap an F1-F9 slot. Same ADDITEMTASKBAR as the desktop drag.
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
  keyboard is taken to cover the bottom 55% (`FALLBACK_COVER`), so the box moves at once.
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

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run`: 4606 passed, 9 skipped, 0 failed; new tests in `debugOverlay.test.ts`, `keyboardLift.test.ts`, `overlay.test.ts`,
  `hud.test.ts` (task bar item pick, Skill window button), `inventoryWindow.test.ts`, `petWindow.test.ts`.
- `npm run check:public-build`: ok.
- e2e (chromium + phone, port 5191): new `taskBarFinger` 4/4, `keyboardLift` 2/2, `phoneSizes` 2/2; also passing:
  `talking`, `mobileAudit`, `controls`, `landscape`, `questWindow`, `topRightIcons`, `skills` "the bar" (phone).
  `talking.spec.ts` was changed: its phone check that the chat line does not move when tapped now expects it to go up
  (section 5), still on the bar.
- `style.css` braces: 1453 open, 1453 close, never below 0.

## For the owner: the full e2e

```powershell
$env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone
```

Passing looks like: every test passes, or only failures that main `f6a955e` already has. The tests that touch this
branch: `taskBarFinger`, `keyboardLift`, `phoneSizes`, `talking`, `mobileAudit`, `landscape`, `skills`, `mobileUx`,
`topRightIcons`, `controls`, `items`, `windows`. Any phone test that measures the task bar or the chat in pixels may need
the new sizes (section 6).

Then by hand on the live site after deploy: no corner text on `/play/`; `/play/?stats` shows it.
