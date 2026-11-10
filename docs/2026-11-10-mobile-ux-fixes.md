# Phone fixes of 2026-11-10 (branch `mobile-ux-fixes`)

The owner's four phone problems, fixed on the landscape phone only. The desktop (mouse) is unchanged.

| # | Owner's words | What was wrong | Fix |
|---|---|---|---|
| 1 | "When a button in inventory is clicked, close the tooltip." | Use, Equip and Unequip ran but left the item's tooltip open. | Every button in the phone tooltip closes it first, then acts (`inventoryWindow.ts`, `drawDetails`). A tap on the item opens it again. |
| 2 | "Skill window no arrows for 2nd and 3rd section" | Section 1 (Vagrant) shows its skills with arrows (ImgSkillVagrant.tga). Sections 2 and 3 were a plain 5-wide grid in slot order: no tree, no arrows. The PC draws them with the job panels (`Back_*.tga`), 225 px wide, too small for the phone's 40 px icons. | On the phone the first- and second-job skills now stand as the PC's tree (`GetSkillPoint`'s places, stretched to the section: at most 1.4x across, 2.4x down, centred), and grey arrows in the Vagrant picture's style join each skill to the skills of the same section that need it (`reqSkills`). A need on the job before has no arrow, as on the PC panels (e.g. the Elementor's masters). `skillWindow.ts`: `phoneTree`, `drawLink`, `drawLinks`. |
| 3a | "Inventory scrolling is scrolling the items the dividers included" | The dividers' picture was fixed, but a finger's drag moved the items pixel by pixel, so mid-drag every item sat across the divider lines. | The drag moves a whole row at a time, as Neuz scrolls the bag (`WndItemCtrl.cpp:446-454`, `GetScrollPos() * nWidth`). Items never cross a divider; the dividers and the "Item" heading stay put. The last row is the bound (the bag can scroll 3 px past its 7 rows). |
| 3b | "theres a little extra window on near the close(x) button on the right" | Two things: the Navigator window peeked out at the bag's top right with its own close button; and the bag's title stretched the PC window's right frame and drop shadow (the picture's last 7 columns) into a second little frame right of the X. | The Navigator hides while the phone bag is open (and comes back after). The phone title uses the picture's columns 0-232 only, with a rounded top-right corner. |
| 4 | "Change the color of attack and jump and its theme to match the UI" | Dark navy discs with a gold rim. | Attack, Jump and the flight buttons (Go, Turbo, Land) now use the phone windows' colours: beige disc (`#fffaf4` to `#e2b394`), `#dba98c` border, a `#795431` ring and a soft shadow so they stay clear over the world. The two glyphs are recoloured for the light disc (brown outlines, brown jumper). Disabled is now greyed at 0.72 (a light disc at 0.48 all but vanished). Size and place unchanged. No theme picture fits (the client has no round button picture; the motion icons are 32 px). |

## Files

- `apps/client/src/world/hud/inventoryWindow.ts`: fixes 1 and 3a.
- `apps/client/src/world/hud/skillWindow.ts`: fix 2.
- `apps/client/src/style.css`: 3b (two rules in phone blocks), the arrows' layer (`.hud-skills-landscape .hud-skills-tree`), 4 (`.hud-attack`, `.hud-jump`, `.hud-flight-button` rules, edited in place).
- `apps/client/src/icons/attack.svg`, `jump.svg`: recoloured glyphs.
- Tests: `apps/client/test/inventoryWindow.test.ts` (tooltip closes, row steps; the old "20 px mid-drag" case now steps a row), `apps/client/test/skillWindow.test.ts` (tree layout, arrows, the PC unchanged; the phone layout's expected places updated), `apps/client/e2e/mobileUx.spec.ts` (all four, phone and desktop).

## Convert

None. No new pictures; nothing for the main folder to convert.

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run`: 4228 passed, 5 failed, the 5 already failing on main (`looks.test.ts` x3, `inventoryWindow.test.ts` x2: "keeps desktop double click working after single-click inspection", "a ride shows Use on the phone ...").
- Playwright, port 5188: see the hand-over for the run's result.

## For the owner

Full e2e, as usual (from `FlyffWeb`, with the dev server on 5174 stopped or `E2E_CLIENT_PORT` set):

```bash
npx playwright test -c apps/client/playwright.config.ts --project=phone --project=chromium mobileUx items windows controls mobileAudit jobs flight
```

Pass: all pass, except failures already on main (`landscape.spec.ts:221` is not in this list).

By hand on a phone: open the bag, tap an item, tap Use or Equip (the tooltip closes); drag the bag (rows jump, the lines stay); look at the bag's top right (one close button only); open Skill as a 2nd job (arrows in all three sections); look at Attack and Jump over the world.
