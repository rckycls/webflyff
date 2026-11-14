# Personal housing: checkpoint (2026-11-15)

Branch `housing` (worktree `FlyffWeb-worktrees/housing`), off main 4ac576c. Plan: `docs/2026-11-15-housing-plan.md`.

## What it does (V15 Neuz copied)
- **Charlie** (Flaris): Enter House (your room), Enter Friend's House (House List). The room's **door**: Exit House (the
  "Are you sure you want to exit?" box, then GOOUT) and Enter Friend's House.
- **Go out** only from inside a room (WI_WORLD_MINIROOM 209), as the server fix on the outer branch `housing-holes` 508bccf.
- **Furniture item use** from the bag (IK2_FURNITURE 34, IK2_PAPERING 35) sends the normal item use; the server lists it.
- **Housing window** (Y, the Start menu's Housing line after Inventory, an applet slot): Type / Item Name / Remaining Time /
  Install, a header press sorts (Neuz's comparisons), the chosen item's words, Install and Remove (only in your own room).
  Remaining time in the owner's short form (29d23h).
- **Install** of a wallpaper or a floor: at once. Of furniture: placing (below).
- **Placing** (`CDeployManager`): the piece's copy follows the pointer on the floor, see-through (blend 80/255); red where
  it collides (out of the wall's box, through the wall, on another piece's box); Page Down +45, Page Up -45 (on let-go),
  the wheel 2.5; a left press places it ("You can't place that there." while red); Esc drops it. No walk, no zoom meanwhile.
- **Phone**: a finger drag moves the piece (no camera turn, no walk); a bar at the top: turn left 45, turn right 45, OK,
  Cancel. The Housing window steps aside while placing and comes back after. The Housing window is a compact sheet.
- **Furniture in the world**: every OT_CTRL in ADD_OBJ is drawn (placed furniture, also dungeon chests and triggers, as
  Neuz does), removed on DEL_OBJ. Visitors see the owner's furniture (it is the server's ADD_OBJ).
- **Wallpaper and floor** (PAPERINGINFO): the room's wall and floor textures swapped, back on reset.
- **Messenger**: right-click (tap) a friend: House Entry Permissions / Cancel Entry Permissions; allowed friends' level in
  green. Chat lines: allowed / removed.
- **Room camera**: CM_MYROOM's lowest pitch 10 degrees.

## Converts (main folder)
```
npm run convert -- --only "data,ButtGWRefresh*"
npx tsx tools/sync_resource_gear_catalog.ts
```
`--only data` writes the new `data/ctrls.json` and the items' `linkKind` / `textFile`; the gear sync is needed after it
(itemProps.json is rewritten). `ButtGWRefresh*` is the House List's Refresh picture. No world or model convert.

## Owner test in the VM
1. A character with 10,000,000+ penya at Charlie (Flaris): Trade, buy "Single Bed (Yellow)".
2. Double-click the bed in the bag: "Single Bed (Yellow) has been added to your Housing Menu. Press the Y Key to access it."
3. Charlie: Enter House. The room loads.
4. Y: the bed is listed (X). Choose it, Install. Move the mouse: the bed follows, red near the walls. Page Down turns it.
   Click: "Single Bed (Yellow) has been placed in your house." The bed is drawn; the row says O.
   Phone: drag a finger, the bar's turn buttons, OK.
5. Remove: the bed comes down ("... has been removed from your house.").
6. Second character, a Messenger friend of the first: on the first, Messenger, right-click the friend, House Entry Permissions
   ("You have allowed ... to enter your house."; the friend's level turns green).
7. Second character at Charlie (first one online): Enter Friend's House, the House List shows "1. Name", OK: the room with
   the first one's furniture.
8. The door: Exit House, OK: back in Flaris.

## e2e (owner)
```
npx playwright test -c apps/client/playwright.config.ts housing.spec --project=chromium --project=phone
```
Pass: the one test passes on both projects; its pictures (room, housing-window, placing, placed) in the test output.
The Start menu has 16 lines now: `landscape.spec.ts`'s two-column test was updated (8 and 8).

## Not done
- The guild house (Bertha, Guild House menu, furniture storage, upkeep, teleporter): next, on this core.
- Movers walk through furniture (Neuz collides with it).
- The guild furniture's looping animation; the "Installed" strip (guild only).
- The room's indoor light is still the outdoor noon light.
