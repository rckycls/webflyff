# Desktop window icons, and the Auto Play icon opens its window (2026-11-20)

The owner asked: "add the 10 icons like mobile in desktop as well. the autoplay icon on display should open the autoplay
window when clicked and not just stop and start the autoplay. stop and start should be inside the autoplay window".

FlyffWeb branch `desktop-icons`, from main 6283c23. Client code and CSS only: no server change, no convert, no gear sync.

## 1. The ten icons on the desktop

- The desktop now shows the phone's ten shortcuts (`MOBILE_SHORTCUTS`, `hud/mobileTools.ts`). They use the same icons, in
  the same order, and open the same windows:
  - first row: Character, Bag, Skill, Quest, Teleport;
  - second row: World Map, Party, Messenger, Pet Filter, Siege Ranking.
- **Place:** two rows of five at the top right, left of the Navigator, with 6 px between them and the Navigator. When the
  Navigator is closed, the rows move to the right edge.
  - Each icon is drawn at Client/Icon's 32 px, in a 36 px cell.
  - They sit under the windows, as on the phone.
  - At 1280 x 720 they span x 950-1130 and y 2-74. That is clear of the status window, the target bar at the top centre,
    the buffs and the AUTO button (checked in e2e).
  - The target bar stays clear of them on screens down to about 1000 px wide.
  - The rows follow the Navigator's default place and size. If a player widens the Navigator or drags it away, the icons
    stay where they are: a wider Navigator covers the nearest ones (windows sit above the icons).
- **Hover:** each icon shows the task bar's applet tooltip (V15 `PutTooTip`, WndTaskBar.cpp:548-569), in the V15 tooltip
  frame. The first line is the Start menu's name for the window, in black. A window with a hotkey gets a second line,
  `[Hotkey I]`, in blue. The word "Hotkey" comes from `TID_GAME_TOOLTIP_HOTKEY`.
  - The names and hotkeys are read from the Start menu's own list (`MENU` in `taskBar.ts`, now exported) and from
    `APPLETS`, so they always match the Start menu:

    | Icon | Tooltip |
    |---|---|
    | Character | Character [Hotkey H] |
    | Bag | Inventory [Hotkey I] |
    | Skill | Skills [Hotkey K] |
    | Quest | Quest Diary [Hotkey Q] |
    | Teleport | Teleport |
    | World Map | World Map [Hotkey M] |
    | Party | Party [Hotkey P] |
    | Messenger | Messenger [Hotkey E] |
    | Pet Filter | Pet Filter [Hotkey U] |
    | Siege Ranking | Siege Ranking |

  - Only a mouse shows the tooltip; a finger does not. The icons no longer set the browser's own `title` tooltip, so two
    tooltips never show at once.
- **Click:** opens the window, and a second click closes it, as the phone does. The hotkeys are unchanged.
- **Stats:** the test builds' diagnostics button stays out of the desktop rows. The desktop already has its own Stats
  button on the diagnostics panel.
- **Phone:** unchanged.

## 2. The Auto Play (AUTO) icon opens the window

- **Click or tap:** opens the Auto Play window, on the Farm tab, or on the Support tab when Support was the mode last
  started. A second click closes the window. The icon no longer starts or stops anything.
  - The long press and the right-click are gone: the plain click now opens the window. A right-click shows no browser
    menu.
  - The gold spinning glow while Auto Play runs, and the red "!" after a stop, are kept. The tip text is now
    "Auto Play", "Auto Play: running" or "Auto Play stopped: <reason>".
- **Start / Stop bar:** a new bar under the window's tab strip, shown on every tab.
  - It holds one silver V15 word button: **Start**, or **Stop** while Auto Play runs. It is 26 px high on the desktop
    and 32 px on a phone.
  - "Battery saver" sits beside it while the farm bot runs.
  - A bold line says what Auto Play is doing: `Off`, `Running: <phase>`, `Running: <phase> (bag full)`,
    `Stopped: <reason>`, `Not allowed here.`, `No partner.` or `Weekly limit reached.`
  - On the Support tab, Start starts Support mode. On every other tab it starts the farm bot.
  - Stop stops whichever mode runs (reason "you took control").
  - The old Start / Stop buttons and status lines inside the Farm and Support pages are gone. The Farm page keeps the run's
    counts (Time, Kills…), and both pages keep the "This week: … left of …" line.
- **Weekly limit:** Start is greyed while the week's hours are used up, as before, and the bar now says
  **"Weekly limit reached."** on every tab.
  - When the limit cuts a run short, the controller stops it with "weekly limit reached" and says it in chat, as before.
    The bar shows "Weekly limit reached." while the hours are used up, then "Stopped: weekly limit reached".
  - The controller still refuses a start with "Auto Play stopped: weekly limit reached." in chat (unchanged).

## Files

- `apps/client/src/world/hud/mobileTools.ts`: `startMenuName`, `shortcutTip`, the hover tooltip; no `title` on icons.
- `apps/client/src/world/hud/taskBar.ts`: `MENU` exported (one word).
- `apps/client/src/world/hud/autoPlay/autoButton.ts`: a click toggles the window; the long press is gone.
- `apps/client/src/world/hud/autoPlay/autoPlayWindow.ts`: the Start / Stop bar (`refreshRun`), and the pages without their
  own buttons.
- `apps/client/src/world/WorldScreen.ts`: the hotkey word passed in; the AUTO button opens on the last mode's tab.
- `apps/client/src/style.css`: the desktop block of `.hud-mobile-tools`, the `.auto-play-run` bar, old `.auto-farm-go`
  rules removed.
- Tests: `test/mobileTools.test.ts`, `test/autoButton.test.ts`, `test/autoPlayWindow.test.ts`, `e2e/topRightIcons.spec.ts`,
  `e2e/autoPlay.spec.ts`, `e2e/controls.spec.ts`.

## Merging beside the other open branches

- `quick-job-change` also changes `taskBar.ts` (its Extras line), `WorldScreen.ts` and `style.css` (the `.auto-word`
  `:is(...)` list). The hunks are apart from this branch's, so git should merge them by itself.
- If Job Change ever becomes one of the ten icons, its tooltip comes from `MENU` with no other change.
- `phone-camera-invert` and `attack-nearest` touch none of these files. `attack-nearest` changes Auto Play's target picking
  (`autoplay/`), not the window or the AUTO button.

## Deploying

Code only. Ship the normal FlyffWeb update (client build); no convert, no gear sync, no server exe.
