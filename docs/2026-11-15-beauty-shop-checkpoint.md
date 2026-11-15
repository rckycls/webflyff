# Beauty Shop: checkpoint, 2026-11-15

Branch `beauty-shop` (worktree `FlyffWeb-worktrees/beauty-shop`, from main 357a1ea). Not merged, not pushed.
Research: `docs/2026-11-15-beauty-shop-research.md`.

## What is built

- **Hair Designer** ("Beauty Shop" entry) opens the V15 **Hair Shop** window beside the bag: the current look (still) and
  the chosen look (turning), four hair styles with arrows, the R/G/B bars with their knob and number boxes, the style,
  colour and total prices, Reset / OK / Cancel. Prices as V15: style 2,000,000, colour 4,000,000.
- **Makeup Artist** ("Cosmetic Upgrades") opens the V15 **Plastic Surgery** window: the two models, the Friendly Face row
  (faces 1-5) and the New Face row (faces 6-11), each with arrows. Price 1,000,000.
- OK asks in V15's **Confirm Purchase** box ("Selected Change your Hair Price is 6,000,000 Penya. ..."); Yes sends
  `SET_HAIR` or `CHANGEFACE` and closes the window. No change: the window just closes. There is no client gold check
  (V15 has none); the server says "You do not have enough Penya.".
- The **free coupons** (26410 hair, 26411 face): using one from the bag asks "You have a Free Coupon. ...". Yes opens the
  window anywhere with "  Using the Free Coupon." in the title and every price 0; OK asks again with the red warning, Yes
  sends with the coupon flag. No DOUSEITEM is sent (V15 sends none).
- The server's answer changes the look on the player and on every other player in view (`SET_HAIR` to those near,
  `CHANGEFACE` to all), the bag preview and the status window's face too.
- V15's refusals: opening while trading, repairing, in an NPC shop, with the other beauty window or Summon Angel open, or
  with a hat or cap worn ("Please try again after taking off the head item"); Trade, Deposit, Mailbox, Repair, Summon Angel
  and Piercing refuse while a beauty window is open; a hat or cap can't be used or worn while one is open; a disguise
  sends nothing ("You can't use this while a transy is in use.").
- **Phone** (landscape, `(max-width: 1000px) and (pointer: coarse)`): one 698 x 255 panel in the middle on the tiled V15
  frame: models, prices and buttons at the left; styles (or the two face rows) and the colour bars at the right. Every box
  keeps its size and its piece of the V15 picture. Phones narrower than 730 px get the panel at 0.9. The bag is not opened
  on a phone (no bag item is used, and it would cover the panel); the desktop opens it as V15 does.

## Convert command (main folder)

The five pictures are not in main's `dist/assets` yet. Run in the main FlyffWeb folder:

```powershell
npm run convert -- --only "WndBeautyShop_EX*,WndBeautyShopSkin_EX*,ButtLeftH*,ButtRightH*,yellowbuttten*"
```

No gear sync is needed (UI pictures only). Without it the windows open with no background, arrows or knob.

## Owner's test steps (VM, after merging and converting)

1. Log in with a character that has at least 7,000,000 penya and nothing on its head. Go to Flaris: the **Hair Designer**
   and the **Makeup Artist** stand near the town centre.
2. Click the Hair Designer: the Hair Shop window opens beside the bag. Both models show; the right one turns.
3. Click another hair style: Style Price shows 2,000,000. Drag a colour bar (or type a number): Color Price 4,000,000,
   Total 6,000,000; a faded knob stays where the colour was.
4. OK → "Selected Change your Hair Price is 6,000,000 Penya. ..." → Yes. The window closes, the penya drops by 6,000,000,
   and the hair changes on your character, in the bag preview and in the status window's face.
5. With a second character logged in next to the first (another browser): its view of the first shows the new hair.
6. Click the Makeup Artist, choose a face in the New Face row, OK → Yes: the face changes for both characters.
7. Wear a hat and click either NPC: "Please try again after taking off the head item". Open the Hair Shop and try to wear
   a hat: "You cannot use that item while using Hair Stylist or Plastic Surgeon."
8. With too little penya, OK → Yes: "You do not have enough Penya." and nothing changes.
9. Coupon: give yourself item 26410 (GM `/ci 26410`), use it from the bag → "You have a Free Coupon. ..." → Yes: the Hair
   Shop opens with "Using the Free Coupon." in the title and 0 prices. Change something, OK → the coupon question with the
   red warning → Yes: the hair changes, one coupon is used, no penya taken.
10. Phone (iPhone, landscape): repeat 2-4 and 6. The panel fits above the task bar, the bars can be dragged with a finger,
    the number boxes use the game keyboard.

e2e (the owner's run, Chromium desktop + phone, not port 5174):

```powershell
$env:E2E_CLIENT_PORT='5199'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone e2e/beautyShop
```

Pass: all 6 tests pass (3 per project). It needs the convert above in `dist/assets` (for the pictures; the tests check
the 3D boxes, not the pictures).

## Checks run here

- Typechecks clean: apps/client, apps/client/tsconfig.node.json, packages/protocol (+ tsconfig.test.json),
  packages/formats, packages/testkit, tools/convert.
- `npx vitest run apps/client`: 188 files, 2616 passed. `npx vitest run packages/protocol packages/formats tools/convert`:
  91 files, 1426 passed (9 skipped).
- `npm run check:public-build`: ok.
- `e2e/beautyShop` (port 5199, Chromium desktop + phone, with the five pictures converted in the worktree): 6 passed.
  The full e2e suite was not run.

## Files

- New: `apps/client/src/world/beauty/` (`beautyRules.ts`, `beautyPictures.ts`, `beautyWindows.ts`),
  `packages/protocol/src/world/beauty.ts`, `packages/testkit/src/beauty.ts`, tests `apps/client/test/beautyRules.test.ts`,
  `packages/protocol/test/beauty.test.ts`, `apps/client/e2e/beautyShop.spec.ts`.
- Shared files touched (small): `WorldScreen.ts` (the shop, refusals in Trade / Deposit / Mailbox / Repair / Summon Angel /
  Piercing, SET_HAIR, `changeLook` hair, the `looks` test hook), `WorldSession.ts`, `hud/moverMenu.ts` (MMI 13 and 42),
  `items/itemWindows.ts` + `itemWindowFlows.ts` + `premiumItems.ts` (the coupons), `render/looks.ts` (`beautyLook`,
  `drawnHair`), `render/portrait.ts` (EYE and LOOK_AT exported), `testHooks.ts`, `style.css` (two blocks at the end),
  protocol constants / types / readers / index / messages, `tools/convert/src/ui/uiStage.ts` (THEME_FILES),
  `packages/protocol/test/world.test.ts` and `apps/client/test/premiumItems.test.ts` (updated).

## What is left

- A duel's start closes the beauty windows in V15 (`WndDuelConfirm.cpp:150-175`); the duel is on the unmerged `social`
  branch, so it is not wired here. When `social` is merged: call `beautyShop.close()` and close the bag where the duel
  starts.
- Not seen on a real iPhone: the turning model's speed, the bars' finger drag, the panel at 0.9 on small phones.
- Server notes (V15 as is, nothing changed): the server checks no NPC distance and no hair or face index (an
  out-of-range one is still charged), and broadcasts CHANGEFACE with the id the client sends. Not needed for this
  feature; listed for the security list.
