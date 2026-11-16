# Consistency picks (2026-11-16)

After the consistency scan (docs/2026-11-15-consistency-scan.md), the owner chose items 1, 3, 5 and 6 to build and left 2
(Lord Skill line) and 4 (Siege Ranking's own row) as they are.

Branch `consistency-picks`, from local main 764e3fb. No convert needed: no new pictures.

## 1. Every amount on the game's number pad (phone)

The bank, the guild bank's take-out and the mail already used the in-game number pad (`AmountBox`). These now use it too:

- the trade's count and penya box (the trade now uses `AmountBox`; the desktop keeps Neuz's "Move Items" box);
- Contribute Guild's penya;
- the guild house's Maintenance Fee days;
- the Guild Siege fee;
- the Lord bid;
- the guild salary;
- the stat points' boxes in the Character window;
- the bag's drop count.

How it works: `padField` (hud/amountBox.ts). On a phone the field is read-only. A tap opens the shared pad with what the
field holds. OK writes the number in and tells the field, so its own rules run as when typed. On the desktop nothing
changes: the field is typed.

The limits:

| Field | Most | Least |
| --- | --- | --- |
| Contribute Guild | own penya | 0 |
| Maintenance Fee | most days | 1 |
| Guild Siege fee | own bid + own penya | 0 |
| Lord bid | own penya | 0 |
| Guild salary | 999,999 | 0 |
| A stat's points | points left beside the other three | 0 |
| Drop count | the stack | 1 |

Left on the floating keyboard's digit keys, as they are not amounts:

- the PINs (bank, lobby);
- the beauty shop's colour numbers;
- Safe Upgrade's goal grade.

## 3. Windows over the open bag (phone)

These now open over an open bag (and over the side panels), in the order they are opened:

- Housing;
- Furniture Storage;
- Siege Ranking;
- Messenger (its friend menu goes over it);
- Quest (list and details);
- Motion;
- Auto Play.

How: `WindowFrame.overBag`. On a phone these are stacked from z-index 61 up, under the boxes at 70 and the pad at 100.
The desktop's order is as before.

## 5. Private shop Start menu line

With the own shop open, the line asks "Will you close your shop?" first, as the X, Cancel and Escape do. With the shop
not open it closes the window as before.

## 6. Old custom applets gone

Teleporter (2023), 3v3 Arena (2024), Dungeon Entry (2025) and Dungeon Status (2026) are removed from `applets.ts`. Nothing
else used them. "Y" is Housing's alone now. The NPC Teleporter window is V15's and stays.

## Checks run here

- Typechecks: the client and the e2e/node config, both clean.
- `npx vitest run apps/client`: 2966 passed, then the new `phonePicks.test.ts` (5 tests).
- `npm run check:public-build`: ok.
- e2e, Chromium desktop and phone: trade, guildBank, lord, items, motionWindow, personalShop, housing, guildHouse,
  guildCombat, questWindow, autoPlay. 43 passed, 1 skipped (the phone-only Motion test on the desktop).
  - The siege start point test failed on the phone at first: its box closes itself after 3 s, and the phone's checks and
    picture took longer. The test now gives it 8 s; it then passed on both.
- e2e, Chromium desktop and phone: friends, windows, bank, post. 16 passed, 1 skipped, 1 failed: friends /say on the
  phone, the failure main already has (the floating keyboard's keys cover the message window's close button).

## e2e for the owner

```powershell
$env:E2E_CLIENT_PORT='5190'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone e2e/trade e2e/guildBank e2e/lord e2e/items.spec e2e/motionWindow e2e/personalShop e2e/housing e2e/guildHouse e2e/guildCombat e2e/questWindow e2e/autoPlay e2e/bank e2e/post e2e/friends e2e/windows
```

A pass means every test passes, except the one failure main already has: friends /say on the phone (the floating
keyboard, still open). Two tests are skipped: they are for the phone or the desktop only.

What to look at by hand on a phone:

- Tap the trade's penya, Contribute Guild's penya, the guild house days, the siege fee, the Lord bid, the guild salary, a
  stat's box or the drop count. The number pad opens, and OK puts the number in the field.
- With the bag open, open Housing, Messenger, Quest, Motion or Auto Play. Each opens over the bag.
- With your shop open, tap Private Shop in the Start menu. It asks "Will you close your shop?".
