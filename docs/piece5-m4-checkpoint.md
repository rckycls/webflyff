# Piece 5 Milestone 4 checkpoint

Updated: 2026-11-01.

## Implemented

Tasks 1–3 are complete. Task 4 automated verification passed; VM and physical-device acceptance remain open.

- Cross-world transition lifecycle preserves cache/login connections, buffers a delayed destination own ADD_OBJ, rejects invalid destinations, times out bounded waits and discards superseded asynchronous loads. World-only controls/rendering are disposed and rebuilt. Chat history survives travel.
- NPC AddTeleport rows are preserved in resource order. The native MMI_TELEPORTER menu opens a map selector using WORLD_Flyff.dds and ButtTeleport.bmp. Selection sends PACKETTYPE_TELEPORTER (character key plus signed destination index), checks NPC validity/range again and waits for server REPLACE.
- Navigator uses the original frame, native per-landscape DDS artwork, marker atlas, arrow, zoom/filter buttons and indoor fog. Native default zoom is 256, range 128–352 in 32px steps. N/Start/close control visibility. Map clicks place the original four-frame navigation mark, without walking.
- Mobile keeps the requested compact chat/taskbar and centered Character/Skill windows; shortcuts leave room for Navigator. Both desktop and phone NPC map selection fit the available area.

## Source decisions

See docs/superpowers/specs/2026-11-01-piece5-v15-navigation-research.md for local source locations, online references and compatibility boundaries.

- Native OnTeleporterReq targets Madrigal, including dungeon entrance coordinates. No dungeon world IDs are invented for AddTeleport rows. Cross-world REPLACE remains independently supported and tested with converted Mars Mine.
- NPC-only map selection uses native artwork inside the existing classic frame. General M-key world-map browsing, continent/monster overlays and other Piece 6 features are not introduced.
- No party/guild membership, quest state or shared navigation packets are fabricated. The local Navigator exposes only known mover state.
- Updated three testkit fixture expectations for the existing inventorySlots field discovered by the full suite; runtime inventory handling is unchanged.

## Evidence

- npm test -- --maxWorkers=2 --reporter=dot: 139 files passed; 2,900 tests passed, 8 skipped; exit 0.
- npm run typecheck: passed all workspace packages; exit 0.
- Playwright navigation.spec.ts, travel.spec.ts and talking.spec.ts, desktop + landscape phone: 16 passed; exit 0. Includes native resources, zoom, filters, map tap isolation, N/Start toggle, teleporter request bytes, server REPLACE, map transitions and failure recovery.
- Reviewed desktop/mobile Navigator and NPC teleporter screenshots.
- Native UI/data conversion passed with zero failures; all-world indoor metadata conversion is recorded after completion below.

## Remaining acceptance

- Run live VM travel with a test character and supported converted maps.
- Complete PC, iPhone and Android landscape checks in docs/device-testing.md.
- Do not mark the entire milestone accepted until these real-environment checks pass.

All-world metadata conversion completed: 3,191 outputs, zero failures (native UI map tiles and world manifests). Original client resources remained read-only.
