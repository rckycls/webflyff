# Item NPC windows: checkpoint (2026-11-11)

Branch `item-npc-windows` (worktree `FlyffWeb-worktrees/item-npc-windows`), cut from main 17edff8. Not merged, not pushed.
Research: `docs/superpowers/specs/2026-11-11-item-npc-windows-research.md`.

## What was built

**The rest of the jewel menu**
- **Create Shining Oricalkum** (Peach, MMI 51; `items/jewelMenuWindows.ts`): opens with the bag; five Sunstones and five
  Moonstones, each row's empty slots show their stone faded; a double-click (a phone's tap) fills the row's next slot, a
  drop with Shift the whole row; "Too many Gems." for a stack held whole. START sends the ten; success empties it and shows
  "Confirm Composing" ("Created a Shining Oricalkum."), a full bag says so, a failure closes it.
- **Create Unique Weapon / Create Ultimate Weapon** (BoBoChan and Radyan, MMI 54/55): the weapon (general of level 60+, or
  unique +10), Shining Oricalkum and the jewel of the weapon's level; START sends; the success/failure boxes; "You are
  already using the conversion window." while open; the bag's close leaves it open.
- **Remove Jewel** (MMI 95): an Ultimate weapon with sockets and a Moonstone (refusals in the chat); each set jewel with its
  stat's name in its family's colour; START sends and the window closes (the server's line and sound are the result).
- **Jewel Setting's turning 3D weapon**: the weapon's model, Neuz's camera per weapon kind, turning on X all the time and
  faster through START, the eye drawn in at the end (`render/weaponPortrait.ts`); the icon shows until the first picture.
- **The upgrade cursor** refuses Shining Oricalkum on the weapon Jewel Setting holds ("This item cannot be used.").
- **The "no" cursor** over the world while Jewel Setting is open was already on main (the cursors work); checked.

**The rest of the safe upgrade menu** (BoBoChan, Radyan: every entry is lit now)
- **Safe Element Upgrade** (MMI 167): the Safe Upgrade window in its element mode: a suit or weapon, the element cards (the
  item's element's, or the first card chooses), SProtect, Scroll of Smelting (Elements) under 10, up to 20.
- **Remove Element upgrading** (MMI 59): the item, START asks ("Confirm Removal of Element Enhancement"), YES sends; the
  answer's box, and the window closes. (Needed a new answer reader, 0x0122.)
- **Remove a Pierced Card** (MMI 72): the item, its ten card rows with each card's stats (a suit's six unused rows red),
  START sends and closes.
- Create Unique / Ultimate Weapon and Remove Jewel above.
- All four safe upgrade entries now refuse in a trade or one's own shop ("You can't do that right now, silly."), as Neuz.

**The Repair window** (MMI 14; `items/repairWindow.ts`): opens with the bag, beside it; refusals while the bank, a trade, a
shop, Summon Angel or a vendor is open; 25 cells; a worn weapon or armour dropped (a phone's tap) adds
`(100 - endurance% left) x (cost / 1000 + 1)`; refusals for a worn item, one not repairable, one at full endurance, not
enough Penya; the bag's double-click says "You cannot use an item while it is being repaired."; OK sends the worn ones
(or "This item does not need to be repaired.") and stays open; moving closes it and the bag. The bag's items now keep their
endurance and repair counts, and their UPDATE_ITEMs.

**The GM's /ResistItem window** (`items/resistItemWindow.ts`): `/ResistItem` (administrators only, as the command table
already gates it) opens Neuz's "Upgrade" window (WndUpgradeBase.tga) with the bag; a drop (a phone's tap) puts armour or a
weapon in its first slot (worn: "Please unequip the item first."; a premium element: a box); the next
`/ResistItem element rao ao` sends `/ritem objid element rao ao` as chat; wrong words or an empty slot send nothing.

**Phone (landscape)**: each window is a panel at the left beside the bag (as the jewel windows), a tap on a bag item puts it
in, a tap on a filled slot takes it out, slots 44 px, words 14 px, buttons 36 px words. The Safe Upgrade window (all four
modes, Safe Element among them) is now such a panel too: before, the phone's bag covered it and its Start. Its body is a
grid (the item, NOW and the goal with +/-, then the ten rows, then Start, Stop, Reset as words); a tap on a bag item puts it
in, a tap on a cell takes the column's last one out. The ResistItem panel is short, so the phone's Chat stays free for the
next `/ResistItem`.

**Protocol** (`world/upgrade.ts`): ULTIMATE_MAKEITEM, ULTIMATE_TRANSWEAPON, ULTIMATE_REMOVEGEM, PIERCINGREMOVE,
REMOVE_ATTRIBUTE (both ways), REPAIRITEM; the bag item's `repairNumber`, `hitPoint`, `repair`, `resistSMItemId`.

**Converter**: `WndSquare3.bmp`, `WndUpgradeBase.tga`; `data/ultimate.json` gains the eight new descriptions.

## What was left out

| Item | Why |
|---|---|
| A way to reach the Repair window | No V15 NPC lists MMI_REPAIR (14), and V15 never wears items down (`Abrade` is `#if __VER < 11`); the server takes no Penya either. The window is built and lit for any NPC that lists it. |
| Repair's other blocks (dropping on the ground, the post/trade/bank entries while repairing) | Unreachable in V15, as above. |
| ResistItem window's five other slots and OK | They belong to an upgrade Neuz never finished: its packet's server handler is empty. OK does nothing, as in Neuz with the second slot empty. |
| Neuz bugs | ChangeWeapon's drop over a filled stone slot keeping the old hold; Jewel Setting's missing NULL check. The web lets go / checks. |
| "#NAME?" stat names | The English text file has "#NAME?" for HP, Attack, Defense (`textClient.txt.txt:1786-1788`): Remove Jewel shows the stat's tooltip name instead. |

No server or gateway change is needed.

## Tests

- Builder runs (this branch): `npm run typecheck` clean; `npx vitest run`: see the report; the new e2e spec on both
  projects (below), and `jewels.spec.ts` on both.
- For the owner, on main after the merge:
  - `npx playwright test -c apps/client/playwright.config.ts itemNpcWindows.spec.ts jewels.spec.ts uiFixes.spec.ts --project=chromium --project=phone`:
    every test passes (uiFixes skips itself on the phone); pictures of each step in `test-results/`.
  - `npm run test:e2e:client`: no new failures against main.

## In-game checklist (owner)

BoBoChan stands in Flaris, Radyan in Darkon, Peach in Madrigal.

On the PC:
1. Click BoBoChan: every entry is lit.
2. "Safe Element Upgrade": the title says so. Double-click a suit or weapon, a Flame Card, an SProtect (and a Scroll of
   Smelting (Elements) under +10). A River Card now says "A different type of element has already been applied." START:
   a row each 2 s, the gauge, success/failure pictures.
3. "Create Unique Weapon": double-click a general weapon of level 60+, a Shining Oricalkum, the jewel of its level (a wrong
   jewel is ignored). START: the box. "Create Ultimate Weapon" while it is open: "You are already using the conversion window."
4. "Remove Jewel from Ultimate Weapon": double-click an Ultimate weapon with jewels and a Moonstone. Each jewel shows its stat
   in colour. START: the window closes; the chat says "Jewel Removal successful.".
5. "Remove Element upgrading": double-click an item with an element upgrade (one without: a box). START: the confirm; Yes:
   "The element of weapon was removed." (costs 100,000 Penya).
6. "Remove a Pierced Card": double-click a pierced item; each row shows its card's stats. START: the window closes; the chat
   says "Element Card was removed successfully." (1,000,000 Penya).
7. Peach, "Create Shining Oricalkum": the bag opens; double-click five Sunstones and five Moonstones (or Shift-drag a stack
   on a row). START: "Confirm Composing" with the Shining Oricalkum.
8. Peach, "Jewel Setting": put an Ultimate weapon in: its 3D model turns; START turns it faster and closer.
9. With Jewel Setting open, use Shining Oricalkum on that weapon: "This item cannot be used."
10. As an administrator: type `/ResistItem`: the "Upgrade" window opens with the bag. Drag a weapon to its top slot, then
    type `/ResistItem 1 10 5`: the weapon becomes fire +10, +5.
11. Walk: each open window closes.

On a phone (landscape):
1. Tap BoBoChan (twice if the first only selects), then each entry: the window is a panel at the left, the bag at the right.
2. Tap the items in the bag: they go in. Tap a filled slot: it comes out. Tap Start.
3. Check every word is readable (14 px or more) and every button and slot is easy to hit.
4. `/ResistItem` from the phone's chat; tap the weapon in the bag; `/ResistItem 1 10 5`.

## The convert command the main folder needs

UI and the ultimate catalog only (no `--only data`, so the owner's `itemProps.json` stays):

```
npm run convert -- --only "ultimate,WndSquare3*,WndUpgradeBase*"
```

It writes `data/ultimate.json` (the new descriptions) and two `ui/` pictures. No gear sync is needed.

## Notes for the merge

- Shared files touched: `WorldScreen.ts` (the `itemNpc` field and host, the entries, the answers, the bag's double-click and
  the phone's tap hook (also for the safe upgrade windows), the move and bag-close dismissals, the weapon model loader, the
  ResistItem client half, the safe upgrade's trade/shop refusal, the upgrade cursor's `jewelSettingWeapon`),
  `WorldSession.ts` (`sendItemNpc`), `hud/moverMenu.ts` (MMI 14, 51, 54, 55, 59, 72, 95, 167), `gmCommands.ts`
  (ResistItem), `items/upgradeNpcWindows.ts` (Safe Element), `items/jewelWindows.ts` (the 3D weapon),
  `items/upgradeCursor.ts`, `items/itemTooltip.ts` (exports `dstTid`, `rateValue`), `OwnState.ts` (UI_HP, UI_RN,
  UI_REPAIR_NUM), `render/portrait.ts` (`drawPicture` takes any camera), `style.css` (a block at the end; its phone
  `@media` block is closed), protocol `world/upgrade.ts`, `world/own.ts`, `world/types.ts`, `world/readers.ts`,
  `messages/world.ts`, `constants.ts`; testkit `world.ts`; formats `web/gameData.ts`; converter `ui/uiStage.ts`,
  `data/ultimateCatalog.ts`.
- `jewels.spec.ts` now checks the 3D model in Jewel Setting.
