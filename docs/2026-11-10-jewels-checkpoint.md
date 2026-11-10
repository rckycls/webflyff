# Create Jewels and Jewel Setting: checkpoint (2026-11-10)

Branch `jewels` (worktree `FlyffWeb-worktrees/jewels`), cut from main c6e71e2. Not merged, not pushed.
Research: `docs/superpowers/specs/2026-11-10-jewels-research.md`.

## What was built

- **Peach's two entries.** "[Jewel Manager] Peach" (`MaFl_Peach`) now offers "Create Jewels" (MMI 53) and "Jewel Setting"
  (MMI 52); the practice NPC `MaFl_Ultimate` too. A second open says "You are already using this window!".
- **Create Jewels** (`CWndExtraction`, 272 x 208, `items/jewelWindows.ts`):
  - the slot takes a general weapon of level 60+ or a unique weapon, by a drop or the bag's double-click;
  - other weapons are ignored; other items are refused in the chat ("You cannot use that item.");
  - START sends ULTIMATE_MAKEGEM and is disabled until the answer;
  - success: "You have created Ruby 2." (the jewel of the weapon's level and the count), the slot empties;
  - failure: "Jewel creation failed." and the window closes; a full bag: the inventory message and START again;
  - it closes when the player moves or the bag closes.
- **Jewel Setting** (`CWndSmeltJewel`, 256 x 432):
  - the Ultimate weapon goes in by a drop on the weapon area (on a phone, a tap); its 5 sockets are drawn as Neuz does:
    unopened red, set blue with the jewel, empty grey, the next one plain;
  - one of the five jewels goes in the next socket (drop, double-click, or a tap on a phone); a double-click (a tap) on it
    takes it out;
  - START plays its sound, turns for 352 frames (~5.9 s) whitening the weapon, then sends ULTIMATE_SETGEM;
  - success: "Jewel creation succeeded!", the success sound, and the window closes; failure: "Jewel creation failed!" and
    the sockets read again;
  - while it is open, a click in the world does nothing (as Neuz); it closes when the player moves.
- **The tooltip of an Ultimate weapon**: the name leaves room for the Ultimate icon (Icon_Ultimate.dds, 51 x 14), drawn at
  the top left; its set
  jewels' stats end the tooltip in red ("Max. HP+455", "Steal HP+10%", ...); the socket row at the bottom shows each open
  socket with its jewel.
- **Protocol**: `encodeUltimateMakeGem`, `encodeUltimateSetGem`, `UltimateState`, `UltimateResult`; ULTIMATE's MAKEGEM count
  is read now (before, a MAKEGEM answer would have broken the rest of its bundle). Testkit `writeUltimate`.
- **Converter**: a new `ultimate` stage writes `data/ultimate.json` (the packs' `Ultimate_GemAbility.txt` and the two window
  descriptions); the UI stage converts `Window01.bmp` and `WndDisableRed/Blue/Black.bmp`.
- **Phone** (landscape): each window is a panel at the left beside the bag (which opens with it, and closes with it when the
  window opened it, so the world can be tapped again); a tap puts a bag item in where a drop would; a tap on a filled slot takes it out; slots 44 px, START a 36 px word button, the description 14 px
  and scrolling; the joystick and action buttons hide while it is open.

## What is left

| Item | Why | Plan |
|---|---|---|
| Jewel Setting's turning 3D weapon (an icon now) | a model in a window needs a render target and the item's model | use `render/portrait.ts` (`PictureTarget`, as `petPortrait.ts`): the weapon's model, the camera per kind (WndField.cpp:20090-20160), turned on X each frame, the eye moving in during START |
| Create Shining Oricalkum (MMI 51, Peach) | not asked; small | 10 slots (5 Oricalkum, 5 Moonstone, Shift fills), START sends ULTIMATE_MAKEITEM (10 ids), the confirm window; same answer packet, half a day |
| Create Unique / Ultimate Weapon (54, 55), Remove Jewel (95, Bobochan) | not asked; medium | CWndChangeWeapon (TRANSWEAPON) and CWndRemoveJewel (REMOVEGEM, a Moonstone); one session each |
| The upgrade cursor's refusal on the weapon in Jewel Setting | small, rare | TID_GAME_NOTEQUALITEM in `upgradeItems.ts` when the target is that weapon (WndField.cpp:13405-13525) |
| The "no" cursor over the world while Jewel Setting is open | cosmetic | `cursor: not-allowed` on the world view (WndWorld.cpp:2645) |
| The owner's custom jewel values | the server's `Ultimate_GemAbility.txt` is ~5x stock and Neuz shows them x `HighRateProfile::Gear` | the tooltip shows the client packs' stock values, as stock Neuz does; to match the server, edit main's `data/ultimate.json` values the way the gear values are synced |

No server or gateway change is needed.

## Tests

- Builder runs (this branch): `npm run typecheck` clean; `npx vitest run` (see the report for the count); the new e2e spec
  passes on both projects:
  `npx playwright test -c .superpowers/playwright.jewels.config.ts jewels.spec.ts --project=chromium --project=phone`
  (`.superpowers/` is not committed; on main use the client's config, below).
- For the owner, on main after the merge:
  - `npx playwright test -c apps/client/playwright.config.ts jewels.spec.ts --project=chromium --project=phone`: passes
    both (about 20 s each here, Jewel Setting's turn taking 6 s); pictures of each step in `test-results/`.
  - `npm run test:e2e:client`: no new failures against main.

## In-game checklist (owner)

Peach stands in Madrigal (`WdMadrigal.dyo`). Have a general weapon of level 60+ (or a unique one), an Ultimate weapon of +6 or more, and a jewel
of the right kind (Topaz 60-70, Ruby 71-85, Sapphire 86-100, Emerald 101-119, Diamond 120).

On the PC:
1. Click Peach: the menu has "Create Jewels" and "Jewel Setting". Choose "Create Jewels": the window opens centred, with
   the red "Create Jewel" title and its text.
2. Open the bag (I). Double-click a potion: the chat says "You cannot use that item." Double-click the weapon: its icon is in the slot, faded in
   the bag, START lit.
3. START: the box says "You have created <jewel> <n>." (or "Jewel creation failed." and the window closes). The weapon is gone.
4. Choose "Jewel Setting". Drag the Ultimate weapon onto the white area: its icon shows; the sockets show red (closed), blue
   (set), grey (empty) and one plain (next).
5. Double-click a jewel in the bag: it goes in the plain socket; START lights. Double-click the socket: it comes out; put it
   back.
6. START: the sound, the weapon turns and whitens for about 6 s, then "Jewel creation succeeded!" (90%) and the window
   closes, or "Jewel creation failed!" and the window stays.
7. Hover the weapon in the bag: the Ultimate icon at the top left, the jewel's stat in red at the end, the socket row with
   the jewel at the bottom.
8. Walk: an open jewel window closes.

On a phone (landscape):
1. Tap Peach (twice if the first only selects), then "Create Jewels": the window is a panel at the left, the bag at the right.
2. Tap the weapon in the bag: it goes in the slot. Tap the slot: it comes out. Put it back, tap Start; the box's words are
   readable without zooming.
3. "Jewel Setting": tap the Ultimate weapon, then a jewel; tap Start; wait for the box.
4. Tap the weapon in the bag: its details show the jewel line and the socket row.
5. Check every word is readable (14 px or more) and every button is easy to hit.

## The convert command the main folder needs

UI and the new catalog only (no `--only data`, so the owner's `itemProps.json` stays):

```
npm run convert -- --only "ultimate,Window01*,WndDisableRed*,WndDisableBlue*,WndDisableBlack*"
```

It writes `data/ultimate.json` and four `ui/` pictures. The START sound needs nothing new: its file is already converted
(an effect names it), and the client plays it by its file key.

## Notes for the merge

- Shared files touched: `WorldScreen.ts` (the `jewels` field, its host, the `ultimate` message, the bag's double-click and
  the phone's tap hook `inventoryWindow.trade`, the move and bag-close dismissals, the world press block, the frame step,
  the NPC entries), `WorldSession.ts` (two senders), `hud/moverMenu.ts` (MMI 52, 53), `hud/itemDetails.ts` and
  `items/itemTooltip.ts` (the Ultimate marks and lines), `sound/worldSounds.ts` (`file`), `gameData.ts` (`ultimate`),
  `style.css` (a block at the end), protocol `world/upgrade.ts`, `messages/world.ts`, `constants.ts`, `world/types.ts`,
  formats `web/gameData.ts`, converter `run.ts` and `ui/uiStage.ts`.
- Old unit failures on main (not this work): `looks.test.ts` x3, `inventoryWindow.test.ts` x2.
