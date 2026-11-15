# Personal housing: plan (2026-11-15)

Branch `housing`, off main 4ac576c. Research: side-session-notes `housing-research/` (research-note.md, A-client.md,
B-server.md, C-flyffweb.md). V15 Neuz is the reference; no custom features.

## M1 Furniture core (shared with the later guild house)
- Protocol: ADD_OBJ of OT_CTRL read (`CObj::Serialize` + `m_objid`), not dropped.
- Data: `data/ctrls.json` (every OT_CTRL of mdlDyna.inc with a converted model: model key, MODELELEM scale); item props
  get `linkKind` (`dwLinkKind`) and `textFile` (`szTextFileName`). Optional file: old game data still loads.
- Client: `WorldState.ctrls`; a runtime ctrl layer (`furniture/ctrlModels.ts`, copied from the ground-item loader) that
  draws ctrls arriving at any time and removes them on DEL_OBJ.
- Placement rules (pure, tested): Neuz's OBB test (`TestOBBIntersect`), the room shell test (`ProcessObjCollision`:
  out of the shell box or touching its triangles, or touching another ctrl's box).

## M2 Housing packets, windows, entering
- Protocol `world/housing.ts`: HOUSING_* snapshots 0x9200-0x9205 and the 5 client packets; testkit writers.
- Windows: Housing (APP_HOUSING, Y, Start menu), House List (APP_MINIROOM_LIST), House (APP_QUIT_ROOM).
- Charlie: Enter House, Enter Friend's House; door: Exit House (confirm), Enter Friend's House.
- Messenger: House Entry Permissions / Cancel Entry Permissions, allowed friends in green.
- Go out only from inside a room (WI_WORLD_MINIROOM), as the server fix 508bccf.
- Chat lines as V15 (added, expired, placed, removed, allowed, removed from the list).

## M3 Placement, desktop
- Install of a furniture piece: a copy of its model follows the mouse on the floor; red where it collides.
- PageDown +45, PageUp -45 (key up), wheel +-2.5, Esc cancels, left click places ("You can't place that there." when red).
- Wallpaper and floor: installed at once (no placement).
- Clicks do not move the player while placing; the wheel does not zoom.

## M4 Phone
- The Housing window as a compact sheet; House List and House centred.
- Placement: a finger drag moves the piece (not the camera); buttons Rotate left / Rotate right / OK / Cancel in the
  compact V15 phone look, in `@media (max-width: 1000px) and (pointer: coarse)` blocks.

## Checks
Unit tests (protocol, rules), both client typechecks, `npx vitest run apps/client`, protocol tests,
`npm run check:public-build`. An e2e spec for the owner to run.
