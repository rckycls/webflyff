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
npm run convert -- --only "data,ButtGWRefresh*,ButtGuildhouse*,Buttlocker*"
npx tsx tools/sync_resource_gear_catalog.ts
```
`--only data` writes the new `data/ctrls.json` and the items' `linkKind` / `textFile`; the gear sync is needed after it
(itemProps.json is rewritten). The pictures: the House List's Refresh, the Guild House menu's five buttons and the Furniture
Storage's install / remove buttons. No world or model convert.

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
npx playwright test -c apps/client/playwright.config.ts housing.spec guildHouse.spec --project=chromium --project=phone
```
Pass: both tests pass on both projects; their pictures are in the test output.
The Start menu has 16 lines now: `landscape.spec.ts`'s two-column test was updated (8 and 8).

## Guild house (same branch)
- **Bertha**: Purchase Guild House (no box, as V15), Pay Maintenance Fee (needs the Maintenance Fee right, else the line),
  Enter your Guild House. The door inside: Exit Your Guild House.
- **Guild House menu** opens by itself inside: Time Left, Set Permissions (the guild window's Permissions tab), Furniture
  Storage, Storage (the guild bank), Teleporter, Fee Deposit. It sits at the right under the map (V15's spot is not known);
  on the phone at the left under the status window.
- **Furniture Storage** (also R): the kind box, Name / Time / I/R headers sort, 40 px rows (icon, name, time; placed ones
  blue), install / remove on each row (Furniture right, inside the house; one teleporter at a time). A new piece shows
  its length and (NEW). Teleporter, wallpaper and floor go up at once; other pieces are placed.
- **Placing** as in the room, plus V15's guild rules: no-walk / no-move / no-fly land is red; while a new piece is placed
  the storage steps aside and the "Installed" strip shows (icon, name, time, blinking red box).
- **A placed piece clicked** in the house: selected (red box; chosen in the storage) and its menu: Information (the
  storage), Reinstall (placed again, keeping its angle, itself left out of the collision), Remove.
- **Maintenance Fee**: Duration with + / - / Max (34), Amount at 2,400,000 a day, OK sends the upkeep.
- **Chat lines**: placed / removed / placed again. Expired furniture drops silently, as V15.
- **Bubble Time bar** in the status window follows the server's rest points. Guild furniture loops its animation.

### Server before players get the guild house
- Deploy the outer branch `housing-holes` 508bccf (upkeep overflow, negative furniture index, HOUSING_GOOUT).
- Still open on the server (research B-server.md 2.6): the DB writes the client's item and time before checking them,
  the `usp_GuildHouse_MaxSEQ` SQL fix, a negative teleporter index, a crafted EXPIRED, no NPC distance check on buy and
  upkeep.
- Guild furniture is cash shop / GM only in V15: your call (web shop, GM, or skip). Testing needs a GM to create items.

### Owner test (guild house, VM)
1. A guild master (guild level 3+, 12 members, 100,000,000 penya) at Bertha: Purchase Guild House, then Enter.
2. The Guild House menu shows Time Left (7 days). Fee Deposit: Max, OK: the time grows.
3. GM: create a guild furniture item (e.g. Guild Bed) for the master; use it inside the house: it is listed.
4. Furniture Storage: the bed (NEW). Install: it follows the mouse; place it. Click the bed in the room: Reinstall, Remove.
5. A member without the Furniture right: the install buttons are off.
6. The door: Exit.

## Not done
- Movers walk through furniture (Neuz collides with it).
- Leaving the guild does not clear the client's guild house data yet (DPClient.cpp:12672-12674).
- The rooms' indoor light is still the outdoor noon light.
