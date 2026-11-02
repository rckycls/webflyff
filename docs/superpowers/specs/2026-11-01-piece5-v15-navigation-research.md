# Classic V15 Navigator and teleporter research

Date: 2026-11-01. The local V15 implementation and client resources are authoritative for behavior; online documentation is a cross-check, not a substitute for version-specific source.

## References checked

- Local Source/_Interface/WndField.cpp:9191–10230: CWndNavigator, its marker filtering, player-centered tile coordinates, indoor fog, camera-facing arrow, zoom controls and navigation marks.
- Local Resource/resdata.inc:18741: APP_NAVIGATOR is a tiled 144 × 160 window.
- Local Source/_Common/lod.cpp:1420: each landscape's minimap is the DDS beside its LND file, loaded without a color key.
- Local Client/Theme/Default/Navigator.inc and NavPosition.inc: native marker atlas and four 32px navigation-mark frames; WndField.h advances these every 120ms.
- Local Source/Neuz/WorldMap.cpp:1124–1139 and 1240–1498: NPC destinations appear as ButtTeleport markers on native map artwork; clicks send the original resource index. The complete Madrigal image maps x=0..11800, z=1298..9757 with positive z upward.
- Local Source/Neuz/DPClient.cpp:19097 and Source/WORLDSERVER/DPSrvr.cpp:10134: TELEPORTER is character key plus signed index, validated against the resource and nearby NPC; this handler targets Madrigal.
- Local Resource/character.inc, defineNeuz.h and defineText.h: AddTeleport rows, MMI_TELEPORTER=146, and the native menu label at text ID 7146.
- [Official Flyff controls](https://www.en-galalab.flyff.com/game-control): N opens Navigator; I/H/K and F1–F9 descriptions cross-checked. This current page is not treated as proof of every V15 implementation detail.
- [Public clean V15 source repository](https://github.com/steve-nzr/flyff-source-v15): version/source provenance cross-check. Local source was used for actual implementation details.

## Implemented behavior

- Navigator opens at the top right and toggles through N, its close button or Start. It uses the original tile DDS artwork, original frame/buttons/marker sheet, player-centered positive-z north coordinates, viewing-direction arrow, and native zoom range 128–352 in increments of 32 (default 256).
- Nearby player/NPC/monster markers are clipped to the map; GM markers are omitted. The native category controls include Party, ready for party-classified markers when party membership is supplied. NPC names remain available on hover.
- Indoor maps draw NavDunFog and suppress outdoor markers, as the source does. Missing tile artwork uses the native fog background.
- A local map click places the native animated navigation mark for 200 simulation-frame equivalents; it does not walk the player. Party/target mark replication is not added in this milestone.
- NPC Teleporter uses the original WORLD_Flyff artwork and ButtTeleport markers, preserving AddTeleport indexes. Distance is checked again before sending. Selection sends a native request and waits for server movement; it never assumes that a request succeeded.

## Scope and compatibility decisions

- The NPC-only map selector uses the existing classic window frame and fits the available viewport. It does not introduce the general M-key world map or the native continent/monster-map browsing controls; those remain Piece 6. This allows the authentic destination artwork and request behavior without expanding into the full map feature.
- Native AddTeleport targets Madrigal, including dungeon entrance locations. Do not reinterpret an entrance coordinate as a direct dungeon world ID. Cross-world REPLACE remains independently supported.
- Existing requested mobile chat/taskbar layouts and centered Character/Skill windows are preserved. The mobile shortcut toolbar leaves room for Navigator.
- Runtime party/guild membership, quest indicators, and shared navigation points remain dependent on their respective future features. No membership or quest state is fabricated.

## Asset update

Run the converter with the original client folder. UI/data adds the native Navigator and teleporter assets; world conversion preserves indoor metadata:

    npm run convert -- --client <Client> --only ui,data --jobs 4
    npm run convert -- --client <Client> --only "Wd*,Du*" --jobs 4

New assets use the existing content-hashed index; original client files are read-only.
