# Top-right shortcuts show the Start menu's icons (2026-11-10)

The owner asked: "can you add the icons on top right instead of button texts? The icons of the window used in Start."
They added: "Exclude the box and borders. Make it just the icon without background or border" and "This is for mobile".
Round 2: "Lessen the icon spaces by 50%. Add more icons. Include important icons from start menu for quick use. Smoothen
the icons." For the layout they chose: one row, with the target bar under it.

## Update 2026-11-18: two rows of five

The owner: "Make mobile icon rows 2 rows of 5 include pet filter and autoplay up there". (Between round 2 and this, other
work changed the layout: two rows of four from 2026-11-13, 4 px between icons, the target bar back at the top centre, the
Siege Ranking icon in Status's place from 2026-11-15. The sections below describe round 2 and are partly out of date.)

- The phone's shortcuts are two rows of five: Siege Ranking, Character, Bag, Skill, Quest; World Map, Messenger, Party,
  Pet Filter, Auto Play. Stats (test builds, or `?stats`) stays in a third row. The desktop is unchanged.
- Pet Filter and Auto Play open their windows (`petFilter`, `autoPlay`), as their Start-menu lines do. Their icons are
  FlyffWeb's own frameless ones (`src/icons/bare/icon_petfilter.png`, `icon_autoplay.png`, `ownIcons.ts`), shipped with
  the build: **no convert is needed**.
- The target bar stays at the top centre while that is clear of the rows; where the centre would meet them it steps left
  just enough (8 px clear), never over the status window (`.hud-target` `left: max(..., min(50%, ...))` in `style.css`). It
  reads the icons' size from `--hud-mobile-icon`, which `MobileTools` now sets on the page's root element. This replaces the
  old rule "52 px left of the centre at 640 px and less".
- Under 600 px wide the icons are drawn at 28 px (cells of 32) so the rows, the target bar and the status window share
  the top.
- Checked (e2e `topRightIcons.spec.ts`, phone): no icon over the target bar, the buffs, the AUTO button or the Action Slot
  button, and the rows between the status window and the Navigator, at 915, 844, 750, 730, 667 and 568 px (a 2.625
  screen), and on iPhone-like pages: 844 x 390 at 3x with the notch's 47 px either side, and 667 x 375 at 2x.
- Where the target bar steps left on a narrow phone (667 px: about 24 px left of the centre), it can sit over the buff
  icons' row (x 147-301 px), as it already did at 640 px and less. The icons themselves stay clear of the buffs.

## What changed

- The top-right shortcuts are a phone-only toolbar, `Window shortcuts`. They are not shown on the desktop: `.hud-mobile-tools`
  shows only at `(max-width: 1000px) and (pointer: coarse)`. On the desktop the task bar's Start menu and the hotkeys
  open these windows.
- Eight shortcuts show the icon of their window in Neuz's Start menu, in the Start menu's order: Status, Character, Bag,
  Skill, Quest, World Map, Messenger, Party. Stats (text) comes last. Each icon is shown alone: no box, no border, and not
  the icon's own white square and orange rim either.
- Each button's name stays its accessible name (`aria-label`) and its tooltip (`title`).
- Round 2, spacing: the space between two icons is half of round 1's. Round 1 gave each icon a 60 px wide press area, so
  the space was 60 px less the icon (about 23 px on a Pixel 7); now it is half that (about 12 px). An icon's press area is
  that space plus the icon wide (about 48 px on a Pixel 7) and 48 px high. The old text buttons were 32 px high.
- Round 2, smoothing: the icons are drawn smoothed (Chromium's default scaling), no longer pixelated. Their size is still a
  whole multiple of 32 in device pixels: on a Pixel 7 (pixel ratio 2.625), 3 x = 96 device px = 36.57 CSS px
  (`iconCssSize`, `apps/client/src/world/hud/mobileTools.ts`).
- Round 2, layout (the owner's choice): one row from the status window to the Navigator, on the old buttons' middle line
  (24 px down). On the phone the target bar moves under the row (`top: 48px`), and the quest list moves under the target
  bar (`top: 96px`). Desktop layout is unchanged.
- Narrow phones keep the shortcuts that fit between the status window and the Navigator. The rank says which go first:

  | Phone width (CSS px) | Icons shown |
  | --- | --- |
  | 740 and up (Pixel 7 915, 844, 750) | all 8 |
  | 700-739 | 7 (no Status) |
  | 650-699 | 6 (no Messenger) |
  | 600-649 | 5 (no World Map) |
  | under 600 (568) | 4: Character, Bag, Skill, Quest (no Party) |

  Stats always shows. Every hidden window is still in the Start menu.
- The code: `apps/client/src/world/hud/mobileTools.ts` (`MOBILE_SHORTCUTS`, `MobileTools`); `WorldScreen.ts` builds it;
  the CSS is in `style.css` (`.hud-mobile-tools`, and the phone rules of `.hud-target` and `.hud-quest-tracker`).

## Button to icon

| Button | Opens | Neuz applet | Start-menu line | Icon file (Client/Icon) | Applet registration |
| --- | --- | --- | --- | --- | --- |
| Status | the status window | `APP_STATUS1` | `WndTaskBar.cpp:2595` | `Icon_Status.dds` | `FuncApplet.cpp:179` |
| Character | the character window | `APP_CHARACTER3` | `WndTaskBar.cpp:2597` | `icon_character.dds` (`Icon_Character.dds`) | `FuncApplet.cpp:204` |
| Bag | the inventory | `APP_INVENTORY` | `WndTaskBar.cpp:2603` | `icon_inventory.dds` (`Icon_Inventory.dds`) | `FuncApplet.cpp:210` |
| Skill | the skill window | `APP_SKILL3` | `WndTaskBar.cpp:2618` | `icon_skill.dds` (`Icon_Skill.dds`) | `FuncApplet.cpp:214` |
| Quest | the quest window | `APP_QUEST_EX_LIST` | `WndTaskBar.cpp:2623` | `Icon_Quest.dds` | `FuncApplet.cpp:229` |
| World Map | the world map | `APP_MAP` | `WndTaskBar.cpp:2734` (Navigation submenu) | `icon_Applet.dds` (`Icon_Applet.dds`, Neuz's generic applet icon) | `FuncApplet.cpp:184` |
| Messenger | the Messenger | `APP_MESSENGER_` | `WndTaskBar.cpp:2661` (Communication submenu) | `Icon_Messenger.dds` | `FuncApplet.cpp:260` |
| Party | the party window | `APP_PARTY` | `WndTaskBar.cpp:2670` (Community submenu) | `Icon_Troupe.DDS` (`Icon_Troupe.dds`) | `FuncApplet.cpp:233` |

Left out of the row: Private Shop and Option (both use the same generic icon as World Map), Navigator (it shows from the
start and has its own close button), Chatting and Log out. They stay in the Start menu.

How Neuz picks the icon (all in `Source/_Interface`):

- `CWndTaskMenu::OnInitialUpdate` (`WndTaskBar.cpp:2584-2653`, submenus to `:2738`) adds each line with
  `AppendMenu( menu, 0, APP_..., ... )`.
- `CWndTaskMenu::AppendMenu` (`WndTaskBar.cpp:2740-2756`) finds the applet (`g_WndMng.GetAppletFunc`) and calls `SetTexture`.
- `CWndTaskMenu::SetTexture` (`WndTaskBar.cpp:2579-2582`) loads `MakePath( DIR_ICON, pAppletFunc->m_pszIconName )`, from
  Client/Icon.
- `CWndMgr::AddAllApplet` (`FuncApplet.cpp:175-302`) gives each applet its icon name. FlyffWeb's copy of that table is
  `APPLETS` in `apps/client/src/world/hud/applets.ts`.

## Left as text

| Button | Why |
| --- | --- |
| Stats | It opens FlyffWeb's own diagnostics panel (frame rate, memory), not a Neuz window. The Start menu has no line or icon for it. It keeps its text, 14 px (the phone minimum), with no box, and outlined in black so it reads over the world. |

## The icons without their frame (a departure from Neuz, by the owner's request)

Neuz draws these icons on a white panel with an orange rim, which are part of the picture files. All eight share that
frame. The UI stage also writes a frameless copy of each, `ui/bare/<name>.png`:

- `BARE_ICONS` and `stripIconFrame` in `tools/convert/src/ui/uiStage.ts`;
- the rim (the top two rows, the left and right columns and the bottom row of the panel from (1, 1) to (30, 30)) becomes
  transparent;
- the panel's white reached from its inside edge becomes transparent; the drawing, and any white it encloses, stay.

The framed `ui/icon_*.png` files are unchanged: the Start menu still uses them. Before the convert below, the shortcuts
show the framed icons. With no picture at all, a shortcut shows its text.

## Convert command for the main folder

From `FlyffWeb/`:

```bash
npm run convert -- --only "icon_status,icon_character,icon_inventory,icon_skill,icon_quest,icon_applet,icon_messenger,icon_troupe"
```

It writes the eight `ui/bare/` pictures (main already has round 1's three) and rewrites the eight framed icons with the
same bytes. In the worktree it changed nothing else in `dist/assets/index.json`. The data stage does nothing with this
`--only`, so `data/itemProps.json` (the owner's high-rate gear values) is not touched.

## Tests

- `apps/client/test/mobileTools.test.ts`: the eight shortcuts, their order and ranks; icons, labels, tooltips, text
  fallback, sizes.
- `tools/convert/test/uiStage.test.ts`: `stripIconFrame`, `BARE_ICONS` and the `ui/bare/` copies.
- `apps/client/e2e/topRightIcons.spec.ts` (desktop and phone): on the phone, the eight icons load from `ui/bare/` with no box
  or border, smoothed, at a whole device-pixel multiple, half the old space between them, 48 px high presses; Stats at 14 px;
  the row between the status window and the Navigator; the target bar under the row and the quest list under the target
  bar; Bag opens the inventory; 844 and 750 px show all 8, 568 px shows 4. On the desktop, the toolbar is hidden and every
  button keeps its name as label and tooltip.
- `apps/client/e2e/controls.spec.ts`: the shortcuts now start right of the status window (was: in the right half).
