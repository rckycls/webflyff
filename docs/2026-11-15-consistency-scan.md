# Consistency scan (2026-11-15)

The owner asked: "scan for possible inconsistencies for both mobile and desktop. And fix it."

How it was done:
- The newer windows were compared with the shared rules: the compact V15 phone panels
  (docs/2026-11-14-phone-panels.md), the silver word buttons, the pale backing, `formatDuration`, the number pad, the
  item tooltips, Escape, and the window order.
- Pictures were taken on the phone (Pixel 7 landscape, Chromium) and on the desktop.
- Three read-only reviews checked the behaviour of each group of windows.

Branch `consistency-scan`, from main 9d26dab. No convert needed: every picture used was already converted.

## Fixed: desktop

- **Guild Siege tabs:** the result window, Donaris's ranking and Siege Ranking now use Neuz's tab pictures (WndTabTile), as
  the bank, the mail, Motion and Couple do. They were grey web boxes, and "United Rank" folded onto two lines.
- **Siege Ranking:** its This week / All time buttons have the silver look.
- **Siege labels** are cut at their box. "Current Application Fee." ran into the number beside it.
- **Item NPC windows** (Piercing, Safe Upgrade, Repair, Create Jewels / Jewel Setting, Summon Angel, ResistItem): their
  slots show the item's real tooltip under the mouse, as the trade, bank and mail slots do. Before, they showed only the
  browser's title with the name.
- **Check Post Box:** the mail's item and penya can be dragged onto the bag again (the window's backdrop blocked the drop).
- **Own private shop:** Escape now asks "close your shop?", as its X does. Before, it closed the bag under the shop.
- **Furniture Storage** comes back where it was after placing a piece.
- **Duel count** is drawn under the windows (a world effect in V15).

## Fixed: phone

- **Guild Safebox:** now in the bank's compact V15 look. It was the old flat style with 14 px Arial and beige buttons.
  - It has Neuz's frame, 34 px cells and 12 px words.
  - Its buttons are silver.
  - It is centred beside the bag, and the bag shows its items alone, as beside the bank.
- **Guild Siege panels:**
  - The V15 frame now fits the panel. It was narrower than the panel, and the text ran past it.
  - Close button at the right, 12 px title.
  - Silver buttons (they were beige Arial).
  - 18 px fields with 12 px words, as the Lord's and the mail's.
  - The ranking's "RankName" header is spaced.
- **Motion:**
  - The Task bar button is silver, like the Skill window's (it was beige).
  - Tabs in Verdana 12 px.
  - The pale backing.
- **Pale backing** on Couple and the duel boxes, so name tags no longer show through their words.
- **Stacking:** these now open above the bag and the side panels, as the bank PIN and the trade boxes do:
  - the duel request and result;
  - the friend boxes;
  - House List and the House box;
  - the guild house fee;
  - the placing bar;
  - the siege question boxes and start point.

  Before, they could open under the bag and could not be answered.
- **Siege and Lord windows** open over one another in the order they are opened.
- **Couple skill tooltip:** a tap's tooltip goes at the next press.
- **Guild house fee field:** 12 px words, as the other fields.

## Fixed: both

- **Housing list, Furniture Storage, mail inbox:** these no longer rebuild every row once a second. A tap or a
  double-click that landed during a rebuild was lost. They now redraw only when what they show changes, as the bank does.
- **Contribute Guild:** its gems show their item tooltip.
- **Guild bank log:** a long line ends with "…".
- **Messenger:** closing it closes its friend menu too.
- **Couple question box:** while it is up, Escape does nothing else.
- **Motion:** the Cheer's "time to the next point" uses the short format (25m, 42s). It showed "25min" / "42sec".
- **New Character:** the name box takes at most 16 letters, as its tip says.
- **e2e specs** fixed. Three were broken on main by later merges:
  - redChips: the box is now found by its words;
  - motionWindow: the phone taps the icon;
  - guildCombat: it no longer expects the minimap mask to be missing.

  The guildBank spec now checks the bank's phone measures.

## Left for the owner

- **Amounts on the phone.**
  - These use the in-game number pad (AmountBox): bank, guild bank take-out, mail.
  - These use the floating keyboard's digit pad: trade penya, Contribute Guild, the guild house fee.
  - Should all of them use the number pad?
- **Lord Skill on the phone.** It has no L key, no Start menu line and no icon. Add a "Lord Skill" Start menu line?
  The Start menu stays at 18 lines until then, which keeps the auto-play merge easy.
- **Windows under the bag on the phone.** Housing, Furniture Storage, Siege Ranking, Messenger, Quest and Motion open
  under an open bag, because the bag is always on top. Should they go above it, or close it?
- **Siege Ranking.** It has no own row pinned at the bottom and no row selection, as Donaris's window has. It is the
  owner's own window, and the own row may need a website field.
- **Private shop Start menu line.** It closes the own open shop without asking. Its X and Escape ask. Check what V15 does.
- **Old custom applets** (Teleporter, 3v3 Arena, Dungeon Status/Entry) are still listed in applets.ts. They do nothing,
  but their "Y" repeats Housing's key. Remove them?

## Checks run here

- Typechecks: client and the e2e/node config, both clean.
- `npx vitest run apps/client`: 2844 passed.
- `npm run check:public-build`: ok.
- e2e, Chromium desktop and phone: guildBank, guildCombat, social, post, housing, guildHouse, personalShop, motionWindow,
  redChips. 32 passed.

## e2e for the owner

```powershell
$env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone e2e/guildBank e2e/guildCombat e2e/social e2e/post e2e/housing e2e/guildHouse e2e/personalShop e2e/motionWindow e2e/redChips e2e/lord e2e/friends e2e/itemNpcWindows e2e/jewels e2e/summonAngel e2e/bank e2e/lobby e2e/windows
```

A pass means every test passes, or the only failures are ones main already has:
- friends /say and talking on the phone (the floating keyboard, still open);
- the siege start point on a slow machine (it closes itself after 3 s while the phone test takes its picture).
