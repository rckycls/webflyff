# Original v15 overhead indicator artwork

Inspected the local client DDS images, their texture-pack scripts, and the original C++ rendering paths. The images are loose files in `Client/`, excluded from normal repository file searches by ignore rules. They do not need to be recreated or downloaded.

| State | Original image | Frame | Visual |
| --- | --- | --- | --- |
| Quest available | `Client/Icon/icon_QuestEmoticon.dds` | 1 | Gold exclamation mark |
| Quest in progress | same | 2 | Grey question mark |
| Quest ready to turn in | same | 3 | Gold question mark |
| Quest within the next five levels | same | 4 | Grey exclamation mark |
| Monster attack reaction | `Client/Theme/Default/texDialogEmoticon.dds` | 0 | Orange anger-vein symbol |

Both scripts specify `0xffff00ff` as the transparency key. The used frames are 32 by 32 pixels. Quest frames are drawn with a shared 1.0–1.2 scale pulse, centred 50 screen pixels above the projected model top. The monster reaction is placed with its bottom at the model top and expires after five seconds.

Local references relative to the v15 workspace:

- `Client/Icon/icon_QuestEmoticon.inc`: frame layout.
- `Client/Theme/Default/texDialogEmoticon.inc`: reaction layout.
- `Source/_Common/Mover.cpp:1092`: quest state to frame mapping.
- `Source/_Common/MoverRender.cpp:1096`: quest position and scale.
- `Source/_Interface/WndWorld.cpp:7981`: quest pulse.
- `Source/_Common/DialogMsg.h:4`: `DLGEMOT_ATTACK` is 0.
- `Source/_Common/DialogMsg.cpp:373` and `:791`: reaction rendering and lifetime.
- `Source/WORLDSERVER/User.cpp:4330`: reaction is sent using chat payload `!0`.

Online research:

- [FlyFF Wiki quest interface, certified for version 15](https://flyff-wiki.gpotato.com.br/wiki/Quests.html): confirms gold exclamation marks for available quests, grey question marks for in-progress quests, and gold question marks for ready turn-ins. Several embedded pictures are missing on the mirrored page.
- [General quests](https://flyff-wiki.gpotato.com.br/wiki/General_Quests): also describes additional quest colours from broader versions. The local client's actual images and frame selection govern this implementation.
- [Flyff script inventory](https://github.com/zetsumi/Flyff-Scripts/blob/master/FILES.md): lists the dialog-emoticon resource script. It supplies no better visual reference than the local DDS file.

Implementation adds both source sheets to the existing UI converter and `data/uiSheets.json`. The renderer crops the selected original frame without drawing glyphs or replacement art. Converted PNG RGBA bytes were compared against the decoded DDS images after applying the native transparency key; both matched exactly. Focused tests: 43 passed. Full typecheck and client production build passed.
