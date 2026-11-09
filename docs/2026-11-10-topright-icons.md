# Top-right shortcuts show the Start menu's icons (2026-11-10)

The owner asked: "can you add the icons on top right instead of button texts? The icons of the window used in Start."
They added: "Exclude the box and borders. Make it just the icon without background or border" and "This is for mobile".

## What changed

- The top-right shortcuts are a phone-only toolbar, `Window shortcuts`. They are not shown on the desktop: `.hud-mobile-tools`
  shows only at `(max-width: 1000px) and (pointer: coarse)`. On the desktop the task bar's Start menu and the hotkeys
  open these windows.
- Skill, Bag and Character now show the icon of the same window in Neuz's Start menu. Each icon is shown alone: no box,
  no border, and not the icon's own white square and orange rim either.
- Each button's name stays its accessible name (`aria-label`) and its tooltip (`title`).
- Each press area is at least 60 x 48 px. The old text buttons, measured in Chromium on the phone, were Skill 47 x 32,
  Bag 45 x 32, Character 81 x 32 and Stats 53 x 32. Every new area is taller and covers more ground; only Character's is
  narrower (60 against 81). The icons sit on the old buttons' middle line, 24 px down.
- The icons are 32 x 32. They are drawn at a whole multiple of that in device pixels, unsmoothed. On a Pixel 7
  (pixel ratio 2.625), 3 x = 96 device px = 36.57 CSS px. (`iconCssSize`, `apps/client/src/world/hud/mobileTools.ts`)
- The code: `apps/client/src/world/hud/mobileTools.ts` (new); `WorldScreen.ts` builds it; the CSS is in `style.css`
  (`.hud-mobile-tools`).

## Button to icon

| Button | Opens | Neuz applet | Start-menu line | Icon file (Client/Icon) | Applet registration |
| --- | --- | --- | --- | --- | --- |
| Skill | the skill window | `APP_SKILL3` | `WndTaskBar.cpp:2618` | `icon_skill.dds` (`Icon_Skill.dds`) | `FuncApplet.cpp:214` |
| Bag | the inventory | `APP_INVENTORY` | `WndTaskBar.cpp:2603` | `icon_inventory.dds` (`Icon_Inventory.dds`) | `FuncApplet.cpp:210` |
| Character | the character window | `APP_CHARACTER3` | `WndTaskBar.cpp:2597` | `icon_character.dds` (`Icon_Character.dds`) | `FuncApplet.cpp:204` |

How Neuz picks the icon (all in `Source/_Interface`):

- `CWndTaskMenu::OnInitialUpdate` (`WndTaskBar.cpp:2584-2653`) adds each line with `AppendMenu( this, 0, APP_..., ... )`.
- `CWndTaskMenu::AppendMenu` (`WndTaskBar.cpp:2740-2756`) finds the applet (`g_WndMng.GetAppletFunc`) and calls `SetTexture`.
- `CWndTaskMenu::SetTexture` (`WndTaskBar.cpp:2579-2582`) loads `MakePath( DIR_ICON, pAppletFunc->m_pszIconName )`, from
  Client/Icon.
- `CWndMgr::AddAllApplet` (`FuncApplet.cpp:175-302`) gives each applet its icon name. FlyffWeb's copy of that table is
  `APPLETS` in `apps/client/src/world/hud/applets.ts`.

## Left as text

| Button | Why |
| --- | --- |
| Stats | It opens FlyffWeb's own diagnostics panel (frame rate, memory), not a Neuz window. The Start menu has no line or icon for it. It keeps its text, now 14 px (the phone minimum), with no box, and outlined in black so it reads over the world. |

## The icons without their frame (a departure from Neuz, by the owner's request)

Neuz draws these icons on a white panel with an orange rim, which are part of the picture files. The UI stage now also
writes a frameless copy of the three icons, `ui/bare/<name>.png`:

- `BARE_ICONS` and `stripIconFrame` in `tools/convert/src/ui/uiStage.ts`;
- the rim (the top two rows, the left and right columns and the bottom row of the panel from (1, 1) to (30, 30)) becomes
  transparent;
- the panel's white reached from its inside edge becomes transparent; the drawing, and any white it encloses, stay.

The framed `ui/icon_*.png` files are unchanged: the Start menu still uses them. Before the convert below, the shortcuts
show the framed icons. With no picture at all, a shortcut shows its text.

## Convert command for the main folder

From `FlyffWeb/`:

```bash
npm run convert -- --only "icon_skill,icon_inventory,icon_character"
```

It adds the three `ui/bare/` pictures and rewrites the three framed icons with the same bytes. In the worktree it changed
nothing else in `dist/assets/index.json`. The data stage does nothing with this `--only`, so `data/itemProps.json` (the
owner's high-rate gear values) is not touched.

## Tests

- `apps/client/test/mobileTools.test.ts`: icons, labels, tooltips, text fallback, sizes.
- `tools/convert/test/uiStage.test.ts`: `stripIconFrame` and the `ui/bare/` copies.
- `apps/client/e2e/topRightIcons.spec.ts` (desktop and phone): on the phone, the icons load from `ui/bare/` with no box or
  border, unsmoothed at a whole device-pixel multiple, 60 x 48 presses, Stats at 14 px, Bag opens the inventory; on the
  desktop, the toolbar is hidden and every button keeps its name as label and tooltip.
