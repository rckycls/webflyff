# Loading screen for "Entering the world" (2026-11-20)

The owner asked: "make a loading screen for flyff as well for 'Entering the world'". Approved in chat on 2026-11-20.

## Why

Today FlyffWeb shows a dark screen with the words "Entering the world…" and a Leave button from Select Character →
Start until the world is drawn, and again on a change to another world. The owner wants it to look like the game:
V15's own loading picture, and a bar that shows the load is moving (players on slow phones).

## What V15 Neuz does

- `CDPClient::OnReplace` (`Source/Neuz/DPClient.cpp:2256-2410`), a change to another world: one of
  `MapLoading2.tga`, `MapLoading3.tga`, `MapLoading4.tga` at random (`xRandom( 0, 3 )`), or a world's own picture:
  `MapLoading_GuildWar.tga` for 202 and the 1:1 guild war worlds 241-244, `MapLoading_Ominous.tga` (121),
  `MapLoading_Ominous_1.tga` (122), `MapLoading_DreadfulCave.tga` (123), `MapLoading_Guildhouse.tga` for the own guild
  house. Drawn full screen; on a wide screen the 4:3 picture sits in the middle on black.
- The own ADD_OBJ sets `m_bTexLoadAlpha` (`DPClient.cpp:1145`, `:1232`) and `CNeuzApp::Render` fades the picture out,
  alpha −6 a frame (`Neuz.cpp:849-900`): about 0.7 s.
- The first entry shows no picture, only "Connecting. Please wait." (`TID_DIAG_0064`) over Select Character.
- No progress bar, no tips. The pictures carry the Flyff logo and a "Now Loading" badge.

## Decisions (owner)

- V15's own pictures, by V15's rules above, on the first entry too.
- A **real** progress bar, drawn with V15's gauge pictures, with a percent.
- Wide screens: the whole picture in the middle, a dark blurred copy of it filling the sides (not cropped, not
  stretched). Desktop and phone landscape alike.
- No tips.

## Design

- **Where:** a layer over the world screen's element (`apps/client/src/world/loading/`), made by `WorldScreen` in its
  constructor and again on a `transition`, removed after the fade. HTML, not the 3D canvas: it is needed before the
  canvas exists.
- **Picture:** `loadingPicture(worldId, random)`: the rules above. Any guild house world (212-214) gets the guild house
  picture (my call: the player is only ever in the own guild's house). The first entry uses the character's saved world.
- **Bar:** five parts with weights: server 20 (preJoin → join → entered; a map change starts from the REPLACE), game
  files 10, map 45 (the world's manifest, then the visible tiles settled / visible tiles), models in view 20 (models
  settled / models asked for), window pictures 5 (the glyph sheets and the indicator art). Never goes backwards. 100%
  only on the first drawn frame of the world, then the fade (0.7 s). It waits at a low number while the server thinks:
  that time cannot be measured.
- **Bar look:** `GauEmptyNormal.bmp` as the track and the fill (the `Gauge` of `hud/gauge.ts`), placed in the picture's
  own pixels: under the "Now Loading" badge, in the dark strip at the picture's foot (my call: above the badge is the
  logo), with the percent beside it; scaled with the picture, with a floor on a phone so it stays readable.
- **No flash:** the layer stays at 100% over the world until the frame loop has drawn the world once, then fades.
- **Speed:** the character list picks the entry picture and warms it with the world's files (`worldPrefetch`); once the
  world is up, the next random picture is warmed at a low priority, so a map change shows it at once. Until a picture is
  decoded the layer shows the dark background with the bar, and the picture fades in.
- **Kept:** the Leave button (FlyffWeb's own way out of a hang) and the "Entering the world…" text, visually hidden, for
  screen readers and the e2e tests.
- **Converter:** the eight pictures join `THEME_FILES` (`tools/convert/src/ui/uiStage.ts`). Not `MapLoading.tga`
  (mushrooms) nor 5-7 (copies of 2-4): V15 never draws them.

## Not in scope

Tips; teleports inside the same world (V15 shows nothing); the reconnect box (a reconnect enters through the same world
screen, so it gets the loading screen anyway).

## Owner steps

After the merge: `npm run convert -- --only "MapLoading2,MapLoading3,MapLoading4,MapLoading_*"` (pictures only, no
gear sync), then the website package with assets.
