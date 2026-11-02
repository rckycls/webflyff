# Classic V15 lobby

The login, server list and character selection now use the original client wallpaper, window tiles and button sprites. Character previews use the existing inventory model renderer, saved appearance and equipment. The three slots share the native Back / Create / Delete / Accept row. Desktop dialogs are centered; short landscape phones fit the same panels without horizontal scrolling. Inputs retain 16px text and never autofocus the mobile keyboard.

## References

- Local `Client/Theme/Default/Default.thm:47–48`: Screen.bmp wallpaper, stretched.
- Local `Resource/resdata.inc:24774–25085`: APP_SELECT_CHAR, APP_LOGIN and APP_SELECT_SERVER, their sizes, controls and textures.
- Local `Source/_Interface/WndTitle.cpp:283–360`: centered login, hidden About/Credit/Prologue buttons. `:1848–1929`: three character rectangles and default Accept control.
- Local `Source/_Interface/ITheme.cpp:756–811`: normal wallpaper rendering. The optional arena title-world branch is separate; this update uses Default.thm's supplied bitmap.
- [New Player Guide](https://flyff-wiki.gpotato.com.br/wiki/New_Player_Guide#Clusters_and_Channels): online cross-check for cluster/channel selection, Next and three character slots. Exact artwork/layout comes from the local V15 resources; the online guide spans several versions.

Authentication packets, password hashing, server validation, creation/deletion and world handoff retain the existing LoginFlow. Selecting a channel still supports the existing one-tap entry shortcut; Next also enters the first available channel of the selected server. Offline/full channels remain unavailable. No synthetic Quit/About/Story actions were added.

## Validation

- Converter UI stage: 4,729 assets converted, zero failures; existing JPEG-icon warning.
- LoginFlow, appearance/model-look and UI-conversion unit suites: 142 passing tests.
- Full desktop and emulated-phone lobby flow suite: 28 passing tests, including original asset loading, rendered character canvas, separate server/channel lists, action selection, error recovery, creation, deletion and world handoff.
- Screenshots reviewed on desktop and landscape phone; character controls checked for bounds and hit testing at 568×320 and 844×390.
- Workspace typecheck and client production build passed. Existing large-bundle advisory remains.

Physical iPhone/Android keyboard behavior and live VM authentication have not been retested for this appearance update.
