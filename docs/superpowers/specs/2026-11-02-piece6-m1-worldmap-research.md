# Piece 6 M1 research: the world map (C++ facts for the browser client)

Research date: 2026-11-02. Closes the M1 gates of `2026-11-01-piece6-v15-research.md` §1 for the spec
`2026-11-02-piece6-design.md` §3.2. Read-only survey: nothing was built, converted or run.

Paths: `Src` = `Blouflash VS22 V15/Source`, `Res` = `Blouflash VS22 V15/Resource`, `Cli` = `Blouflash VS22 V15/Client`;
unprefixed `file:line` is relative to `Src`. FlyffWeb paths are relative to the `piece6` worktree. Source files are CP949
(read through `iconv`, which keeps line numbers); the `.inc` scripts of `Cli/Theme/Default` are UTF-16LE with a BOM.
"Neuz" = the Windows client. Coordinates are FlyFF's (D3D): x east, z north, as `ownAt` reports them in the e2e tests.

**Headline findings (read these first)**

1. The ordinary map is live: `__IMPROVE15_WORLDMAP` is defined nowhere, and `__IMPROVE_MAP_SYSTEM` (the V16 `CWndMapEx`)
   is only in the dead internal-server section. M is the `APP_MAP` applet's hotkey; the applet is a toggle, not a window.
2. The map is a full-screen picture drawn over every window and the task bar, with no frame, title or close button.
   Neuz takes **only the left button press** away from the world (`Neuz.cpp:1246-1249`). Keys, the right button, the
   wheel and the moves still reach the world, so WASD walks under the map. The spec's "input goes to the map only" is
   stricter than Neuz, on purpose.
3. M always opens the map of the continent the player stands in, never map 0 (World). Outside Madrigal, **and in Madrigal
   outside every continent polygon** (the sea, gaps, some boundary lines), it does not open. It prints
   `TID_GAME_MAPMSG` instead: "You can not use the Map in this Dungeon.", in red.
4. The arrow points along the **camera's** view (from the camera to the player), not along the character's facing
   (`WorldMap.cpp:593-611`). It is drawn with identity view and projection matrices, so on a 4:3 screen it is stretched
   and skewed by the screen's aspect ratio.
5. `WorldPosToMapPos` (`:1383-1497`) is the helper for the teleporter and quest icons. The arrow uses its own copy of the
   same bounds in `RenderPlayer` (`:615-729`), in NDC. The two agree on the bounds and the direction (positive z up).
6. The monster tooltip shows, for each mover id of a row, "Lv.<level> <name>" with an element icon, the last mover in
   red, then "Booty : <item>". The item is the **single drop id the script gives**, not MoverProp's drop list (the loop at
   `:498-501` does nothing).
7. The button art is English and has the names drawn in it: Harmonin's button says "Shaduwar" and Estia's says "Valley
   of the Risen". The ninth button, "Monster Info", is the monster switch. It has hover art but is never drawn selected.

---

## 1. Active branch

| Fact | Where |
|---|---|
| `#define __MAINSERVER` comes first, then `__VER 15`. `__INTERNALSERVER` is defined only when neither TEST nor MAIN is | `Neuz/VersionCommon.h:3-8` |
| Sections: INTERNAL `:261-405`, TEST `:406-470`, MAIN `:471-482`. The MAIN section adds nothing about maps | `Neuz/VersionCommon.h` |
| `__IMPROVE_MAP_SYSTEM` (the V16 `CWndMapEx`, `APP_MAP_EX`) is defined only in INTERNAL, so it is **dead** | `Neuz/VersionCommon.h:390` |
| `__USING_CONTINENT_DATA` is live (continents read from data). The code tests `#if __VER >= 15` anyway | `Neuz/VersionCommon.h:200`; `_Common/Continent.cpp:34` |
| `__NEW_CONTINENT15` is live (Estia, `MAX_BUTTON` 9) | `Neuz/VersionCommon.h:220`; `Neuz/WorldMap.h:55-56` |
| `__INSERT_MAP` and `__CSC_VER9_RESOLUTION` are commented out, but the code guards them with `#if __VER >= 9`, so they are live | `VersionCommon.h:327,348`; `WorldMap.cpp:247,994`; `WndWorld.cpp:7686` |
| `__IMPROVE15_WORLDMAP`: a search of all of `Source/` and `Resource/` finds only its uses (`WorldMap.cpp:63,451,832,911,931,1063,1145`; `WorldMap.h:154`), never a `#define` | grep |
| `Neuz.vcxproj` has one configuration, `NoGameguard\|Win32` (there is no "Release"). Its definitions are `WIN32;NDEBUG;_WINDOWS;NO_GAMEGUARD;_CRT_SECURE_NO_WARNINGS;NO_WARN_MBCS_MFC_DEPRECATION;_WINSOCK_DEPRECATED_NO_WARNINGS`. There are no per-file definitions | `Neuz/Neuz.vcxproj:4-7`, `:44` |
| `StdAfx.h` includes an empty `NeuzVersion.h`, then `VersionCommon.h`. `_Common/DefineCommon.h` defines no map flag | `Neuz/StdAfx.h:43-45` |

**Verdict:** the ordinary branch is live: the `#ifndef __IMPROVE15_WORLDMAP` code with the 9 picture buttons. Not
compiled: the list box (`:911-918`, `:931-952`, `:1145-1180`), `CWndMapEx`, the `CMapInformationManager` family
(`_Common/MapInformationManager.cpp:2`) and the `__IMPROVE_MAP_SYSTEM` parts of the tooltip.
`NDEBUG` also compiles out the duplicate-id `assert` of `Continent.cpp:68`.

## 2. Opening and closing

| Behaviour | Neuz | Where |
|---|---|---|
| Applet | `APP_MAP` = 228, title "WndMap", icon `Icon_Applet.dds`, tip `TID_TIP_MAP` ("A Map of the World"), hotkey `'M'` | `_Interface/FuncApplet.cpp:181-186`; `Res/ResData.h:133` |
| The hotkey loop | `CWndTaskBar::Process` runs `ObjectExecutor( SHORTCUT_APPLET, id )` for every applet whose hotkey is down. Not while a shortcut is carried | `_Interface/WndTaskBar.cpp:2331-2388` |
| NPC dialog guard | `ObjectExecutor` returns at once while `APP_DIALOG_EX` (the NPC dialog) is open, so M does nothing then | `_Interface/WndManager.cpp:2570-2576` |
| Start menu | `AppendMenu( m_pMenu8, 0, APP_MAP, GETTEXT( TID_APP_MAP ) )` ("World Map"). It sits in the BB submenu `_T("Navigation")`, after Teleporter, 3v3 Arena and Dungeon Entry, and just before `APP_NAVIGATOR` | `WndTaskBar.cpp:2629`, `:2710-2738` |
| What the applet does | `CWndMap::Initialize` calls `DeleteWorldMap()` if the map is shown, else `LoadWorldMap()`, then returns FALSE. `CreateApplet` deletes the window object, so M and the menu line always toggle | `_Interface/WndMap.cpp:43-50`; `WndManager.cpp:2503-2511` |
| Escape | `CWndWorld::OnKeyUp`: `VK_ESCAPE` with the map shown calls `DeleteWorldMap()`. This happens only when the world window has the key focus | `_Interface/WndWorld.cpp:7686-7692` (in `OnKeyUp`, `:7615-7735`) |
| ... and the same press | `CWndMgr::Process` also runs its Escape order on the key-down (`g_bKeyTable`, `Neuz.cpp:1361`): it clears the target, else closes the focused window, else opens the Start menu. Its own map branch (`:3304-3309`) tests `IsViewMap()`, which V15 never sets | `WndManager.cpp:3295-3420` |
| `m_bViewMap` | Set only by the pre-V9 `'M'` branch, which is dead (`:7694-7707`). It starts FALSE (`:3808`), so the guards in `OnLButtonDown` (`:6714`) and `MenuException` (`:11491`) never fire | `WndWorld.cpp` |
| Close button, clicking outside | Neither exists. A left press anywhere goes to `CWorldMap::OnLButtonDown`, which only tests the buttons and the teleport icons | `WorldMap.cpp:1114-1237` |
| Overlay | `RenderWorldMap` runs after `g_WndMng.PaintRoot`, over all windows, the task bar and the world. The world, the server traffic and the other windows' processing go on beneath | `Neuz.cpp:792-793`, `:902` |
| Input taken | Only `WM_LBUTTONDOWN` while `IsRender()`. Every other message goes to `WindowRootProc` as usual (keys, mouse moves, the right button, the wheel, the left release) | `Neuz.cpp:1246-1249` |
| Hover | `CWorldMap::Process` runs every frame in `FrameMove`, whether or not the map is shown | `Neuz.cpp:1127-1128` |
| State | `m_bShowMonsterInfo` (the monster switch) starts FALSE and is never reset by closing or opening (it lasts the session). `m_nMap` is picked again from the player's position at every open | `WorldMap.cpp:45-46`, `:922-999`, `:1051-1066` |
| World change | Nothing closes the map on REPLACE (the only callers of `DeleteWorldMap` are above, plus the teleport click at `:1138`). FlyffWeb disposes the whole HUD on a transition (`WorldScreen.ts:361-362`, `:1366-1425`), so the map closes there | grep |
| Other openers (out of M1) | NPC teleporter `SetTelMode(TRUE)` + `LoadWorldMap` + `ProcessingTeleporter` (`WndWorld.cpp:5960-5966`); quest destination (`_Interface/WndQuest.cpp:2517-2519`). Both force `nMap = CONT_NODATA` (0) | `WorldMap.cpp:954-961` |

## 3. Layout

Neuz positions everything in **screen pixels**, from the screen resolution read once in `CWndWorld::OnInitialUpdate`
(`WndWorld.cpp:3438`, `CWorldMap::Init` at `:3809-3810`). There is no window.

**Picture rectangle** (`m_cpScreen` at `m_cOffset`, `WorldMap.cpp:229-325`). `RenderTextureEx` stretches the
1280×960 picture to that rectangle (`:800`). The whole screen is filled first: `0xff3B3D2F` on a 4:3 mode, black on a
wide one (`:790-798`). The picture's colour key is `0xff000000` (`:966`), so its black pixels show the fill.

| Mode (`m_nResWidth`×H) | `m_cpScreen` | offset | wide path? |
|---|---|---|---|
| 800×600, 1024×768, 1400×1050, 1600×1200 | the screen | 0,0 | no |
| 1280×1024 | 1280×1024 | 0,0 | no |
| 1280×960 | 1280×1024 (a Neuz bug: the picture is cut 32 px at the top and bottom) | 0,−32 | no |
| 1280×720 / 768 / 800 | 960×720 / 960×768 / 960×800 | centred x | yes |
| 1360×768, 1440×900, 1680×1050 | 1024×768, 1200×900, 1400×1050 | centred x | yes |

The owner's Neuz runs at **1024×768** (`Cli/neuz.ini:4`), so the owner sees the picture at 1024×768 at 0,0.

**Buttons** (`:327-380`, `:406-421`, `:828-849`). `m_fRate = m_nResHeight / 1024` (`:328`, overriding the switch). The
column starts at `x = 0 + wideOffsetX` (the picture's left edge in a wide mode) and `y = (LONG)(80·rate)` (`:331`). Each
button `i` (0-8) is `(int)(228·rate)` × `(int)(88·rate)`, stacked with no gap; every step truncates to LONG (`:342-377`).
They are drawn with `RenderScal(cp, 255, rate, rate)`.

| Button i | Opens | Frames (normal / hover / selected) | Label in the art | Text in the catalog |
|---|---|---|---|---|
| 0 | map 0 World | 0 / 1 / 2 | World | none |
| 1 | map 1 | 3 / 4 / 5 | Darkon 1,2 | `TID_GAME_CONT_DARKON12` "Darkon" |
| 2 | map 2 | 6 / 7 / 8 | Darkon 3 | `TID_GAME_CONT_DARKON3` "Darkon 3" |
| 3 | map 3 | 9 / 10 / 11 | GardenofRhisis | `TID_GAME_CONT_RICIS` "Garden of Rhisis" |
| 4 | map 4 | 12 / 13 / 14 | SaintMorning | `TID_GAME_CONT_SAINTMORNING` "Saint Morning" |
| 5 | map 5 | 15 / 16 / 17 | Flaris | `TID_GAME_CONT_FLARIS` "Flaris" |
| 6 | map 6 | 18 / 19 / 20 | Shaduwar | `TID_GAME_CONT_HARMONIN` "Shaduwar" |
| 7 | map 7 | 21 / 22 / 23 | Valley of the Risen | none |
| 8 | the monster switch | 24 / 25 / (26, never drawn) | Monster Info | none |

The frame rule: `Process` resets `m_nDrawMenu[i] = 3i` each frame, then adds 1 to every hovered button that is not the
current map (`:428-465`). `RenderWorldMap` adds 2 to the current map's button (`:828`). `m_nMap` is never 8, so the
switch shows only 24 and 25 and does not show whether it is on.

A press (`:1183-1234`) tests the rectangles in order 0-8 and stops at the first hit (`break`). Buttons 0-7 set
`m_nMap = i`, change the picture, and load that map's monster script if `i > 0` and it differs. Button 8 toggles
`m_bShowMonsterInfo`. `CRect::PtInRect` leaves out the right and bottom edges.

**`texMapButton.inc`** (`Cli/Theme/Default`, UTF-16LE): `MULTI_LANGUAGE`, `number 27`,
`texture "TexMapButton.bmp" 0xffff00ff`, then nine `serialize 3 228 88 0 <88·row> 0 0` rows (y 0, 88, … 704). It is
read by `CTexturePack::LoadScript` (`_Common/2DRender.cpp:1559-1680`). `MULTI_LANGUAGE` only switches the path to
`MakePath( DIR_THEME, file )` (`:1580`, `:1594-1599`), and `DIR_THEME` is `Theme\Default\` (`_Common/path.h:14`)
through the two-argument `MakePath` (`_Common/path.cpp:88-93`). So the language changes nothing here: the art is
`Theme/Default/TexMapButton.bmp`, in English. The picture is 684×788, so row 8 (y 704-792) runs 4 px past its bottom;
the art ends there.

**Worked example: the owner's 1024×768.** rate = 0.75; the buttons are 171×66 at y = 60, 126, 192, … 588 (the last ends
at 654). Monster icons are drawn 30×30, and their hit boxes are 40×40 (§7). The arrow is about 35.8×25.4 px (§6).
**In the 1280×960 picture frame**, every 4:3 mode gives the same proportions: button scale = 960/1024 = 0.9375 of
picture units (213.75×82.5, column from y = 75), icons drawn at 37.5, monster positions as authored.

## 4. Projection

Index order (`m_strMapStringList`, `WorldMap.cpp:197-209`): 0 `WORLD_Flyff.dds`, 1 `WORLD_Darkon12.dds`,
2 `WORLD_Darkon3.dds`, 3 `WORLD_Ricis.dds`, 4 `WORLD_Saint.dds`, 5 `WORLD_Flaris.dds`, 6 `WORLD_harmonin.dds`,
7 `WORLD_Estia.dds`. All eight apply to world **WI_WORLD_MADRIGAL = 1** only (`Res/defineWorld.h:5`): the map opens only
there (§5). The bounds, from `WorldPosToMapPos` (`:1394-1461`), identical in `RenderPlayer` (`:615-711`):

| Map | Picture | Continent (`C_id`) | X1 | Z1 (bottom) | X2 | Z2 (top) | Where |
|---|---|---|---|---|---|---|---|
| 0 | WORLD_Flyff | none (whole world) | 0 | 1298 | 11800 | 9757 | `:1399-1405` |
| 1 | WORLD_Darkon12 | Darkon12 (241) | 2355 | 2019 | 7187 | 5814 | `:1407-1413` |
| 2 | WORLD_Darkon3 | Darkon3 (242) | 985 | 1621 | 5754 | 5149 | `:1415-1421` |
| 3 | WORLD_Ricis | Ricis (3) | 8080 | 3200 | 10280 | 5000 | `:1423-1429` |
| 4 | WORLD_Saint | Saint (2) | 6854 | 1580 | 10600 | 4430 | `:1431-1437` |
| 5 | WORLD_Flaris | Flaris (1) | 5500 | 2540 | 9200 | 5130 | `:1439-1445` |
| 6 | WORLD_harmonin | Harmonin (243) | 4795 | 4587 | 8391 | 7236 | `:1447-1453` |
| 7 | WORLD_Estia | Estia (4) | 5150 | 5573 | 9890 | 9158 | `:1455-1461` |

The defaults `_fMap_*` (7194, 2000, 10100, 4250, `:85-88`) are always overwritten, because `m_nMap` is 0-7.

**Formula** (`:1463-1490`, all in `FLOAT`): `r1 = (X2 − x)/(X2 − X1)`, `r2 = (Z1 − z)/(Z1 − Z2)`. Then
`D3DXVec3Lerp(v2, v1, r)` with `v1` = (L, T) and `v2` = (R, B) of the target rectangle gives
`sx = (int)(R − r1·(R − L))` and `sy = (int)(B − r2·(B − T))`. That is, **`sx = L + W·(x−X1)/(X2−X1)`,
`sy = T + H·(Z2−z)/(Z2−Z1)`, truncated**, with positive z toward the top. In a 4:3 mode the rectangle is the whole screen
(0,0)-(ResW,ResH). In a wide mode it is `m_cOffset.x`…`+m_cpScreen.x` by 0…`m_cpScreen.y` (`:1475-1485`).

`WorldPosToMapPos` first refuses a point whose `GetMapNo(vPos)` is not the shown map, unless map 0 is shown
(`:1385-1391`). The arrow's own rule is `if( m_nMap != 0 && m_nMap != nMap ) return;` (`:542-543`). So on a continent
map, the arrow is hidden as soon as the player walks out of that continent's polygon.

**Fixtures** (computed with §5's rules and this formula, in the 1280×960 frame; compute with `Math.fround` and
`Math.trunc` to match the FLOAT casts):

| Point (x, z) | Continent → map | On its map | On map 0 |
|---|---|---|---|
| Flaris lodestar (6968, 3328) | 1 → 5 | (507, 667) | (755, 729) |
| Saint Morning (8470, 3635) | 2 → 4 | (552, 267) | (918, 694) |
| Darken (3808, 4455) | 241 → 1 | (384, 343) | (413, 601) |
| (2500, 3000) | 242 → 2 | (406, 584) | (271, 766) |
| (9500, 4300) | 3 → 3 | (826, 373) | (1030, 619) |
| (6500, 6000) | 243 → 6 | (606, 447) | (705, 426) |
| (7200, 7100) | 4 → 7 | (553, 551) | (781, 301) |
| (X1, Z2) / (X2, Z1) of any map | none | (0, 0) / (1280, 960) | none |

Cross-check against the world data: the authored Aibatt icon on the Flaris map (436, 760), with its 40 px frame centred,
back-projects to about (6818, 3026). Small Aibatts spawn at x 6711-7279, z 2953-3478 (`Res/World/WdMadrigal/WdMadrigal.rgn`,
`respawn7 5 20 …`). The Estia `MI_SKELSWORD` icon back-projects to (7427, 7209), against spawns at x 7184-7577,
z 7035-7253. The orientation is confirmed.

## 5. Current continent

**`WdMadrigal.wld.cnt`** (`Cli/World/WdMadrigal/`, ASCII CRLF, byte-identical to `Res/World/WdMadrigal/`). Read by
`CContinent::Init` (`_Common/Continent.cpp:29-104`) with `CScript`, one word at a time. Words it does not know are
skipped (`WORLD`, `C_useEnvir`, `C_name`, `C_ambient`, `C_sky` …).

| Statement | Effect | Where |
|---|---|---|
| `Continent BEGIN` | empties the vertex list | `:50-56` |
| `C_id n` | `id = GetNumber()` | `:74-77` |
| `VERTEX x y z` | three `GetFloat`s; pushes `CPoint( (int)x, (int)z )` (truncated, y ignored) | `:79-85` |
| `TOWN n` | `bTown = n`: the polygon goes to `m_MapContTown`, not `m_MapCont` | `:87-90`, `:66` |
| `C_useRealData 0` | skips words until the next `END` (the block's own `Continent END`), so nothing is stored | `:92-102` |
| `Continent END` | closes the ring (pushes vertex 0 again), inserts `(id, ring)`; a repeated id is ignored (first wins; the assert is off) | `:57-71` |

This file holds seven real polygons and one skipped block, and no `TOWN` (so no towns at all):

| C_id | `ContinentDef.h` | Name | Vertices | Map |
|---|---|---|---|---|
| 1 | `CONT_FLARIS` | Flaris | 11 | 5 |
| 2 | `CONT_SAINTMORNING` | Saint | 10 | 4 |
| 3 | `CONT_RICIS` | Ricis | 9 | 3 |
| 4 | `CONT_ESTIA` | Estia | 6 (lines 149-154; `Estia_envir`, C_id 0, `C_useRealData 0`, is skipped) | 7 |
| 241 | `CONT_DARKON12` | Darkon12 | 15 | 1 |
| 242 | `CONT_DARKON3` | Darkon3 | 12 | 2 |
| 243 | `CONT_HARMONIN` | Harmonin | 13 | 6 |

(`Res/ContinentDef.h:10-23`; `CONT_NODATA` = 0, `CONT_EAST` 15, `CONT_WEST` 240.)

**Point test** `Point_In_Poly` (`:219-254`): the point is `CPoint( (long)x, (long)z )` (`:293-294`), and the vertices are
integers. It counts crossings: for each edge p1→p2 (ring order, `i = 1..size`, `p2 = v[i % size]`) it counts one when
`ty > min(p1.y,p2.y) && ty <= max(p1.y,p2.y) && tx <= max(p1.x,p2.x) && p1.y != p2.y` and
(`p1.x == p2.x || tx <= xinters`). An odd count means inside. **`xinters` uses integer arithmetic:**
`(ty−p1.y)*(p2.x−p1.x)/(p2.y−p1.y)+p1.x` is all `LONG`, so it truncates toward zero before the conversion to `double`
(`:239`). Copy it with `Math.trunc(...)`.

**Precedence** (`GetContinent(vPos)`, `:288-304`): `std::map<BYTE,…>` iterates ids in ascending order (1, 2, 3, 4, 241,
242, 243), and the first polygon that contains the point wins. The Flaris and Darkon12 polygons overlap along a strip:
(6370, 3826) is in both, so it counts as Flaris. Some points on shared edges are in neither: (7253, 2690) gives
`CONT_NODATA`. On a 50 m grid of map 0's rectangle, 11,572 of 40,120 cells are in a polygon.

**Map number** (`GetMapNo`, `:405-432`): `GetMapNo(CMover*)` returns 100 unless the mover's world is
`WI_WORLD_MADRIGAL` (`:407-412`; Arena 208 and Guild War 202 also give 100, unlike `GetContinent(CMover*)`, `:262-267`).
`GetMapNo(vPos)` maps the continent: Flaris 5, Saint 4, Darkon12 1, Darkon3 2, Ricis 3, Harmonin 6, Estia 7, anything
else 100 (`:414-430`). It does **not** check the world. Towns (`GetTown`, `:306-322`) are never consulted.

**What happens on 100** (`LoadWorldMap`, `:922-999`): `nMap = GetMapNo(g_pPlayer)` (`:926`). If it is 100, the map stays
closed and `g_WndMng.PutString( prj.GetText(TID_GAME_MAPMSG), NULL, prj.GetTextColor(TID_GAME_MAPMSG) )` runs
(`:991-997`). `TID_GAME_MAPMSG` = 3351 (`Res/defineText.h:2171`). In the converted `data/texts.json` it reads
`"You can not use the Map in this Dungeon."` with colour `0xFFFF0000`. FlyffWeb's `WorldScreen.say(id)`
(`WorldScreen.ts:1127`) prints exactly this. Each further M prints it again. Otherwise the map opens on `nMap` (1-7) and
loads `m_strMonScript[nMap-1]` if it is not loaded yet (`:968-977`).

## 6. Player arrow and other markers

| Fact | Where |
|---|---|
| Texture `Theme/Default/ImgMapArrow.bmp`, 37×35, 24-bit, key `0xffff00ff`, pointing up. The party arrow `ImgMapArrowParty.bmp` is 37×35 too | `WorldMap.cpp:92-103` |
| The billboard quad is `rect.right/max(cx,cy)` = 1 wide and 35/37 tall, centred on `ptCenter` (18, 17) | `_Common/billboard.cpp:65-140` |
| Drawn with identity projection and view, world = scale 0.07 · RotationZ(−yaw) · translation to the NDC point; point sampling | `WorldMap.cpp:578-613`, `:725-738` |
| The NDC point is `x = 2(x−X1)/(X2−X1) − 1`, `y = 2(z−Z1)/(Z2−Z1) − 1` over the viewport. The viewport is the whole screen (4:3) or `m_cpScreen` at `m_cOffset.x` (wide) | `:546-576`, `:713-729` |
| **Rotation**: `vDestNor = playerPos − camera.m_vPos`, normalised (3D, the camera's height included). The quaternion turning +z onto it, through `QuaternionRotationToYPW`, gives `yaw = atan2(dx, dz)` (`_Common/xUtil3D.cpp:7-22`; worked out by hand: the axis (−dy, dx, 0), the angle acos dz). `RotationZ(−yaw)` turns the up-pointing arrow clockwise by yaw: looking north, up; looking east, right | `WorldMap.cpp:593-611` |
| **Size and skew**: a texture pixel (tx, ty) from the centre lands at `dx = kW(tx·cos yaw − ty·sin yaw)`, `dy = kH(tx·sin yaw + ty·cos yaw)`, where `kW = 0.035·Wvp/37` and `kH = 0.035·Hvp/37`. That is CSS `matrix(kW·cos, kH·sin, −kW·sin, kH·cos, sx, sy)`. Unrotated it measures 44.8×31.8 px at 1280×960 and 35.8×25.4 at the owner's 1024×768 | derived from the above |
| Name label: the player's name in `m_pFontWorld`, centred on `nX`, top at `nY − 1.5·textHeight`; own player `0xff7fff7f`, party `0xffffff7f` | `:742-784` |
| Party members (`ImgMapArrowParty`, a second `RenderPlayer` per member) are **out of scope**. For them the C++ even feeds the position itself as the direction (`:597-598`) | `:812-823` |
| Teleport icons (`ButtTeleport.bmp` 16×16, 20×20 on hover), only in teleport mode, which stays Piece 5's window | `:802-805`, `:1284-1315` |
| Quest destination (`ButtDestination.bmp` 32×32 drawn at 0.6, pulsing alpha): quests are out of scope | `:806-809`, `:1339-1375` |
| Rainbow Race NPC icons (`texMapRainbow_NPC.inc`), only while `CRainbowRace::m_dwRemainTime > 0`: out of scope | `:875-909` |

## 7. Monster rows and the tooltip

**Which script goes with which map** (`m_strMonScript`, `:214-225`). Map i (1-7) uses `m_strMonScript[i−1]`. Map 0 has no
script, and monsters are drawn only when `m_bShowMonsterInfo && m_nMap > 0` (`:852`).

| Map | Script | `number` / rows | Mover ids per row | Picture (px) |
|---|---|---|---|---|
| 1 | texMapMonster_Darkon12.inc | 16 | 4 | TexMapMonster_Darkon12.bmp 120×240 |
| 2 | texMapMonster_Darkon3.inc | 18 | 4 or 5 | TexMapMonster_Darkon3.bmp 120×240 |
| 3 | texMapMonster_Ricis.inc | 6 | 4 | TexMapMonster_Ricis.bmp 120×80 |
| 4 | texMapMonster_Saint.inc | 15 | 3 or 4 | TexMapMonster_Saint.bmp 120×240 |
| 5 | texMapMonster_Flaris.inc | 11 | 4 | TexMapMonster_Flaris.bmp 120×200 |
| 6 | texMapMonster_Harmonin.inc | 5 | 4 | TexMapMonster_Harmonin.bmp 120×80 |
| 7 | texMapMonster_Estia.inc | 7 | 1 | TexMapMonster_Estia.bmp 120×200 |

That makes 78 rows. Every `MI_*` and `II_*` they name is defined in `Res/defineObj.h` / `defineItem.h`, and is in the
converted `movers.json` and `itemProps.json` (checked). Drop id `0` occurs twice (Ricis `MI_FLBYRIGEN*`, Saint
`MI_MOTHBEE*`).

**Format** (`CMonsterInfoPack::LoadScript`, `WorldMap.cpp:1513-1651`, read with **`CScript`**, so names are replaced by
their `#define` values):

| Statement | Fields | Where |
|---|---|---|
| `number n` | the frame array | `:1531-1535` |
| `MULTI_LANGUAGE` | sets a flag; both branches load `MakePath( DIR_THEME, file )` | `:1536-1563` |
| `texture "file" 0xAARRGGBB` | the sheet and its colour key (all use `0xffff00ff`); `m_size` is the loaded picture's size | `:1540-1567` |
| `serialize nFrame w h startX startY centerX centerY` | cuts `nFrame` frames left to right, row by row, from (startX, startY) within `m_size` (all are 40×40, three to a row) | `:1568-1617` |
| … then `nFrame` rows | `nMonCnt` (≤ 5: `m_dwMonsterId[5]`, `WorldMap.h:13-19`), `nMonCnt` mover ids, `left top` (authored, **1280×960 picture frame**), `dropItemId` | `:1619-1646` |

Row k pairs with frame k: both counters run in step across the `serialize` statements. On a screen other than exactly
1280×960, `left = (x·cpScreen.x)/1280 + offset.x` and `top = (y·cpScreen.y)/960 + offset.y`, in integer arithmetic
(`:1626-1639`). The **hit box is `left..left+40` by `top..top+40` in screen pixels, unscaled** (`:1640-1641`). The icon is
drawn at `(left, top)` with `RenderScal(…, rate, rate)`, at alpha 255 when it is the hovered one (`m_nSelMon`) and 150
otherwise (`:854-869`).

**Hover** (`Process`, `:467-531`): this runs while the switch is on and the map is shown, **even on map 0**, where the
icons are not drawn and the tooltip, painted only inside `m_nMap > 0` (`:871-872`), stays invisible. Every row whose box
holds the pointer rebuilds the tooltip, so with overlapping boxes the **last row wins**. A press on an icon does nothing.

**Tooltip text** (`CEditString`; the default colour is `0xff000000`, `_Common/EditString.h:117`), for each mover id j:

| Piece | Colour | Source |
|---|---|---|
| `GetText(TID_GAME_MONSTER_INFORMATION_LEVEL)` = "Lv." | blue `XRGB(0,0,255)` (the catalog's colour is ignored) | `:485-486`; TID 4324 |
| `"%d "` of `MoverProp::dwLevel` | `XRGB(130,130,200)` | `:487-488`; `WebMover.level` |
| `MoverProp::szName` | **red `XRGB(255,0,0)` for the last id of the row** ("only the giant in red"), default black otherwise | `:489-494`; `WebMover.name` |
| `"\n"`; a mover id with no MoverProp adds nothing | | `:496`, `:483` |
| element icon, `Icon/Icon_MonElemantkind.inc` frame `eElementType−1` (5 frames of 16×16: fire, water, electricity, wind, earth), at `tipLeft + lineWidth + 20` beside that line, if `eElementType ≠ 0` | | `_Interface/tooltip.cpp:647-693` (`:686`); `WndWorld.cpp:3696`; `WebMover.element` |
| then `"\n"`, `"%s : "` of `TID_GAME_DROP_ITEM` ("Booty") | default | `:504-508`; TID 4006 |
| `ItemProp::szName` of the row's drop id | `XRGB(46,112,169)` | `:510-514`; `WebItemProp.name` |
| … or `TID_GAME_DROP_NONE` ("None") when there is no such item (id 0) | default | `:515-516`; TID 4007 |

Example (Flaris, row 0): "Lv.1 Small Aibatt" (wind icon), three more Aibatts, the last red, a blank line, then
"Booty : Twinkle Stone". The tooltip is `PutToolTip(10000, str, rect, point, 0)` (`:518`, `tooltip.cpp:182-230`),
wrapped at **200 px** (`tooltip.cpp:204`) in `m_pFontText`. Position 0 puts it **above** the icon, at
`(rect.left, rect.top − height − 10)`, clamped to the screen: kept 16 px off the right edge, and moved to the top + 8 when
it would rise past the top (`tooltip.cpp:406-410`, `:462-488`). Its frame is the
9-slice `WndTooltipTile00-08.tga` (`tooltip.cpp:70-89`, `m_nToolTipTexture = 0`, `_Common/HwOption.cpp:204`).
`SetWorldMapMonsterInfo` passes the ids for the element icons (`:519-521`, live because `__IMPROVE_MAP_SYSTEM` is off;
`tooltip.cpp:906-911`). No other fields are shown: no element text, no HP, no drop list.

## 8. Art files

All are in `Cli/Theme/Default` unless noted. "Converted" means the key is in `dist/assets/index.json` now.

| File | Size | Format | Key (UI stage rule) | Converted |
|---|---|---|---|---|
| WORLD_Flyff.dds | 1280×960 | DDS A1R5G5B5, no mips | ui/world_flyff.png (colour key `0xff000000`, `uiStage.ts:261`) | yes (Piece 5, `THEME_FILES`, `uiStage.ts:75`) |
| WORLD_darkon12.dds, WORLD_darkon3.dds, WORLD_ricis.dds, WORLD_Saint.dds, WORLD_flaris.dds, WORLD_harmonin.dds, WORLD_Estia.dds | 1280×960 each, 2,457,728 bytes | same | ui/world_<name>.png | **no** |
| TexMapButton.bmp (+ texMapButton.inc) | 684×788 | BMP 24 | ui/texmapbutton.png | **no** |
| TexMapMonster_{Darkon12,Darkon3,Ricis,Saint,Flaris,Harmonin,Estia}.bmp (+ the 7 .inc) | 120×240, 120×240, 120×80, 120×240, 120×200, 120×80, 120×200 | BMP 24 | ui/texmapmonster_<name>.png | **no** |
| ImgMapArrow.bmp | 37×35 | BMP 24 | ui/imgmaparrow.png | **no** |
| WndTooltipTile00-08.tga | 16 px pieces | TGA | ui/wndtooltiptile0N.png | **no** (only if the Neuz tooltip frame is copied) |
| `Cli/Icon/Icon_MonElemantkind.DDS` (+ .inc, not MULTI_LANGUAGE, path `icon\…`) | 128×16 (5 frames) | DDS | ui/icon_monelemantkind.png | yes (all of Icon/); frames not catalogued |
| ButtTeleport.bmp | 16×16 | BMP 24 | ui/buttteleport.png | yes (teleporter) |
| ButtWndExit.tga | 4 states, 15×14 each | TGA | ui/buttwndexit.png | yes (frame close button) |
| ImgMapArrowParty.bmp, ButtDestination.bmp, TexMapRainbow_NPC.bmp | 37×35, 32×32, 280×40 | BMP | none | no (out of scope) |

The C++ names `WORLD_Darkon12.dds`, but the file is `WORLD_darkon12.dds`. The lookups (`ClientFs.find`, Windows) ignore
case, and `webName` lowercases. The sheets are loose files (the converter's `ctx.client.find('Theme/Default', …)`).
`CResFile::Open` tries the loose file before the packs (`_Common/File.cpp:273-290`), so the loose copies are the ones Neuz
reads.

---

## What FlyffWeb has already

| Reuse | Signature / fact | Where |
|---|---|---|
| Teleporter projection | `teleportPoint(pos:{x,z}):{x,y}`: map 0 into its 788×591 body. Its comment cites `WorldMap.cpp:1359`, which is wrong (the bounds are `:1399-1405`, the formula `:1463-1490`) | `apps/client/src/world/hud/teleporterWindow.ts:6-9` |
| Teleporter window | `new TeleporterWindow(art, valid(id), send(key, index), doc)`, `open(id, npc)`, `update()`, `dispose()`; `WindowFrame` 800×624 `fitWhole`. CSS hides the touch controls while it is open | `teleporterWindow.ts:12-47`; `style.css:1797-1804` |
| Teleporter tests | projection corners; send while valid | `apps/client/test/teleporterWindow.test.ts:4-18`; `e2e/navigation.spec.ts:41-62` |
| Navigator | `navigatorPoint(pos, center, zoom, tileMeters)`; `new Minimap(art, manifest, folder, url, doc)`, `open/toggle/update(center, heading, markers)/dispose`; `escapeCloses = false`; arrow `rotate(heading rad→deg)`. `WorldScreen` feeds it `backCamera.heading` (the camera, as Neuz's world map wants) | `hud/minimap.ts:12-122`; `WorldScreen.ts:1085`; `backCamera.ts:27-28`, `:56` |
| Navigator tests | `minimap.test.ts:5-37` (projection, zoom, filters, indoor); `navigation.spec.ts:14-39` (N and the Start line toggle, map taps send nothing) | |
| Applets | `APPLETS` already has `[228, APP_MAP, 'Icon_Applet.dds', 'TID_TIP_MAP', 'M']`; `AppId` lacks `MAP`; `appletText(text, texts)` | `hud/applets.ts:21-27`, `:41`, `:90-92` |
| N key path to mirror | `TaskBarWindow` union; `WINDOWS` (applet id → window); `HOTKEYS` derived from `APPLETS`' letters (`KeyN`; no Ctrl/Alt/Meta, not while typing, no repeats, not while carrying); `execute(id)` → `actions.open(window)` → `WorldScreen.openWindow` (`'navigator'` → `minimap.toggle()`) | `hud/taskBar.ts:55`, `:61-78`, `:855-859`, `:978-997`; `WorldScreen.ts:1109-1123` |
| Start menu | `MENU` (flattened: Neuz's "Navigation" folder is not copied); a line is enabled when its id is in `WINDOWS`; `TaskMenu(art, lines, choose, outside, doc)`, 22 px a line, icon and hotkey from `APPLETS` | `taskBar.ts:85-92`, `:363`; `hud/taskMenu.ts:175-297` |
| Window stack, Escape | `WindowFrame(title, art, {width,height,mobileScale,fitWhole,texture,closeButton}, doc)`, `open(at\|'center')`, `close()`, `refit()`, `escapeCloses`; `escapeWindow(doc)`, `refitWindows(doc)`. The frame's own Escape listener runs after `WorldScreen.onEscape` (a capture listener, `:755`); `escapeStep({dead, menuOpen, target, window})` | `hud/frame.ts:107-424`, `:427-446`; `hud/escape.ts:106-111`; `WorldScreen.ts:1195-1225` |
| Touch scale rules | `fit()`: `matchMedia('(max-width: 1000px) and (pointer: coarse)')` → `mobileScale` (default 0.7); `fitWhole` → `min(1, (layerW−16)/w, (layerH−layoutBottom−16)/h)`. The layer `.world-hud` is below the top safe inset; `--game-safe-left/right/bottom` | `frame.ts:271-293`; `style.css:512-578` |
| Holding input | `ModalBackdrop(frame, doc)`: `show/hide/onChange`, holds every key at capture; `holdKey(event)`. `modalChanged()` resets keys, joystick, tap and camera and closes the Start menu | `hud/modal.ts:23-87`; `WorldScreen.ts:1171-1182`; `stopOwnMover` `:1339-1347` |
| Art | `themeKey(file)` → `ui/<webName>.png`; `themeUrl(art, file)`; `cssRgb(argb)`; `UiArt.url(key)` | `hud/art.ts:23-35` |
| Messages | `say(id)` → `hud.messages.add(text, color)`, the `PutString` copy | `WorldScreen.ts:1127-1130` |
| Catalogs | `GameData.movers: Map<number, WebMover>` (`name`, `level`, `element`), `itemProps: Map<number, WebItemProp>` (`name`), `texts`. `loadGameData` **fails if any `GAME_DATA_KEYS` entry is missing** (`:118-120`) | `apps/client/src/world/gameData.ts:38-71`; `packages/formats/src/web/gameData.ts:9-68`, `:95-146`, `:277-290` |
| Readers | `readTexturePack(text, file, textureSize?)` (plain scanner: reads `texMapButton.inc`, skips `MULTI_LANGUAGE`, cannot read monster rows); `ScriptReader(text, defines, strings, ctx)` with `number/float/token/tokenOrEnd/done` (CScript with defines); `decodeScript(bytes)` (UTF-16LE BOM / EUC-KR); `loadDefines(packs)`; `webName`. No continent or world-map reader exists yet | `packages/formats/src/inc/texturePack.ts:67-139`; `script/cscript.ts:81-150`; `script/scanner.ts:35`; `script/defines.ts:137` |
| UI stage | `THEME_FILES` (`uiStage.ts:67-149`); colour key `0xff000000` for `world_*` already (`:258-262`); `readSheet` pattern (`:203-218`); `createUiStage({ themeFiles })` for tests | `tools/convert/src/ui/uiStage.ts` |
| Data stage | the `catalogs` table `{ key, source, build(read) }`, `Reading.text(name)` from the packs, defines/strings in `Env`, each catalog fails on its own | `tools/convert/src/data/gameDataStage.ts:128-150`, `:480-544` |
| Converter tests | `writeFakeClient(root, { packed, loose })`, `makeTempDir`, images `bmp24/dds/tga32` | `tools/convert/test/helpers/fakeClient.ts:7-25`, `helpers/images.ts`; `uiStage.test.ts`, `gameDataStage.test.ts:480-761` |
| e2e harness | `playGateway`, `enterFlaris`, `ownAt`, `sentOf(gateway, PacketType.X)`, `SQUARE` (the lodestar), REPLACE to Mars Mine (200) | `apps/client/e2e/worldHarness.ts:21-141`; `travel.spec.ts:13-60` |

## Proposed file structure

New:
- `packages/formats/src/inc/continent.ts`: `readContinents(text, file)` copies `CContinent::Init`: real polygons by
  `C_id` in file order, towns kept apart, `C_useRealData 0` skipped to `END`, a repeated id ignored.
- `packages/formats/src/inc/mapMonsterPack.ts`: `readMapMonsterPack(text, defines, file, textureSize)` copies
  `CMonsterInfoPack::LoadScript`: the frames plus rows of `{ movers ≤ 5, x, y, drop }`. More than 5 ids, or a row past
  `number`, throws.
- `packages/formats/src/web/worldMap.ts`: `WebWorldMap` and `WORLD_MAP_KEY = 'data/worldMap.json'` (**not** in
  `GAME_DATA_KEYS`): `{ world: 1, reference: {w:1280,h:960}, maps: [{ index, picture, bounds:{x1,z1,x2,z2},
  continent, monsters?: { sheet, frames, rows } }], continents: [{ id, name, map, ring }], buttons: { sheet, frames }, arrow }`.
  Map, continent and world ids are named separately.
- `tools/convert/src/data/worldMapCatalog.ts`: the C++ constants (picture names `:197-209`, bounds `:1399-1461`, the
  continent → map switch `Continent.cpp:414-430`, the scripts `:214-225`). Reads the `.cnt`, the 7 monster scripts and
  `texMapButton.inc`. A row that cannot be read is reported and skipped.
- `apps/client/src/world/worldMapRules.ts` (pure): `mapNumber(worldId, pos, continents)`, `pointInPoly`, `mapPoint(map,
  pos, rect)`, `arrowMatrix(yaw, W, H)`, `cameraYaw(cameraPos, playerPos)`, `buttonFrame(i, map, hovered)`,
  `monsterTip(row, movers, itemProps, texts)` (the lines and colours of §7).
- `apps/client/src/world/hud/worldMap.ts`: `WorldMap`, the overlay over the whole HUD layer. `open()` either says
  `TID_GAME_MAPMSG` or shows the map. Also: `toggle`, `close`, the 9 buttons, the switch, hover or tap details, the arrow
  and name, the close button, the key hold (M and Escape close it), `update(pos, view)`, `dispose`. It sends nothing.
- `apps/client/src/world/worldMapData.ts`: loads `data/worldMap.json` on its own; a missing file means one overlay error
  and an empty map.
- Tests: `packages/formats/test/worldMapReaders.test.ts` (fixtures cut from the real files: the Flaris block, the Estia
  pair with the skipped `_envir`, a Darkon3 row with 5 ids, a Ricis row with drop 0, the 27 button frames);
  `tools/convert/test/worldMapCatalog.test.ts` (fake client); `apps/client/test/worldMapRules.test.ts` (the table of §4,
  the corners of all 8 maps, precedence at (6370,3826), (7253,2690) → 100, world 200 → 100, arrow at yaw 0 and 90°,
  button frames); `apps/client/test/worldMap.test.ts` (jsdom: open and close, switch, tooltip text, unavailable
  message); `apps/client/e2e/worldMap.spec.ts` (M and Start, all 8 maps, details by hover and tap, close by M, Escape and
  the button, no packet, Mars Mine message); `tools/convert/test/worldMap.corpus.test.ts` (the real client: 7 polygons,
  78 rows, every id in the catalogs, each icon back-projected within about 300 m of a spawn of its first mover).

Modified:
- `tools/convert/src/ui/uiStage.ts`: add the 7 `WORLD_*.dds`, `TexMapButton.bmp`, the 7 `TexMapMonster_*.bmp`,
  `ImgMapArrow.bmp` (and `WndTooltipTile00-08.tga` if chosen) to `THEME_FILES`, with a comment citing `WorldMap.cpp`.
- `tools/convert/src/data/gameDataStage.ts`: one more entry in `catalogs` (`WORLD_MAP_KEY`).
- `packages/formats/src/index.ts`: export the two readers and the type.
- `apps/client/src/world/hud/applets.ts`: `AppId.MAP = 228`.
- `apps/client/src/world/hud/taskBar.ts`: `'worldmap'` in `TaskBarWindow` and `WINDOWS`, and a `MENU` line
  "World Map" just before Navigator.
- `apps/client/src/world/WorldScreen.ts`: create and dispose the map (with `disposeWorld`); `openWindow('worldmap')`
  with the NPC-dialog guard; a per-frame `update`; Escape order (the map first); close the map when a modal opens.
- `apps/client/src/world/hud/teleporterWindow.ts`: `teleportPoint` = `mapPoint(0, …)` scaled to 788×591, with the
  citation fixed.
- `apps/client/src/style.css`: `.hud-worldmap` (fill `#3B3D2F`, above the windows and the task bar, hides the touch
  controls).
- `README.md`, `docs/device-testing.md`: the M1 section.

## Open questions / risks

1. **Composition size on a PC (owner).** Neuz scales the picture to the screen. The owner's Neuz is 1024×768, so the map
   is 1024×768 with 171×66 buttons. The spec says "at its own size". Recommend the 1024×768 composition on a PC, scaled
   down when the browser is smaller, and fitted whole to the safe area on a phone.
2. **Close button (owner).** The ordinary branch has none, but the spec asks for one. Recommend `ButtWndExit.tga` at the
   top right of the composition, with a 44 px touch area. It is the only way to close the map on a phone besides the
   Start menu, which is hidden under the map.
3. **Escape and input (owner).** One Escape in Neuz closes the map *and* runs the normal Escape order (clears the target,
   or closes a window, or opens the Start menu), and every key except the left press reaches the world. Recommend: with
   the map open, Escape closes only the map, and all other keys are held, as the spec says. A walk key held while the map
   opens must be released by the reset (`stopOwnMover`), which may send the ordinary stop. Decide whether "the map sends
   no packet" allows that one stop, or whether movement keys should pass through as in Neuz.
4. **Arrow fidelity.** The exact copy rotates by the camera yaw and skews with the screen's aspect ratio (§6 matrix).
   Recommend copying it exactly, including the green own-name label.
5. **Tooltip frame.** Neuz uses the `WndTooltipTile` 9-slice, while FlyffWeb's item cards are CSS (`itemDetails.ts`).
   Converting the 9 tiles costs little.
6. **Phone hit areas.** At about 0.4 scale on a 390 px tall phone, the buttons are about 87×33 px and stack with no gap,
   and the icons (about 15 px drawn) sit 16-28 px apart. Enlarged touch areas would overlap, so a "nearest icon centre
   within 22 px" rule is needed; the "last row wins" rule only applies to the mouse.
7. **Map 0 hover.** The hit tests also run on map 0 against the last loaded script, but nothing shows. On the web: no
   icons and no details on map 0.
8. **Persistence.** The switch lasts the Neuz session, but FlyffWeb rebuilds the HUD on every world change. Keep the
   switch state in `WorldScreen` so it survives a world change.
9. **`GAME_DATA_KEYS`.** Adding `worldMap.json` there would make an older `dist/assets` fail the whole login. Keep it
   optional, as the spec's error rules require.
10. **Float details.** The bounds and rates are `FLOAT`, and the screen points are truncated with `(int)`. The tests should
    compute with `Math.fround` and `Math.trunc` and allow ±1 px only where documented.
11. **Packs vs loose files.** The `.cnt` and `Theme` scripts are loose and identical to `Res/`. `CResFile::Open` takes a
    loose file before a pack (`_Common/File.cpp:273-290`), so the converter should read them with `ClientFs.find` (loose),
    not `packs.read`. The `.cnt` sits in `World/`, which only the worlds stage reads today.
12. Out of scope, recorded as such: party arrows, the quest destination, Rainbow Race icons, the list-box branch and
    `CWndMapEx`.
