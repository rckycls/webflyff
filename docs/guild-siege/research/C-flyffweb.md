# C. FlyffWeb today, for the Guild Siege (2026-11-15)

Research only. Repo `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\FlyffWeb`, branch `main` at `357a1ea`
(HEAD = main; the work tree is clean except an untracked `FlyffWeb.rar`, so the files on disk are main's). Paths are
relative to that folder. `Source/...` and `Resource/...` are the outer repo (the V15 C++). `dist/` is gitignored
(`.gitignore:2`): what is said about converted assets is the owner's local `dist/assets` on 2026-11-15, not git.

Starting point: `docs/superpowers/specs/2026-11-10-guild-research.md` §6, §8 and appendix `d-flyffweb.md` (not redone).

## 0. Short answer

- Guild core, guild bank and the Lord / honour titles are built. **Guild war is not** (the Guild Duel tab shows data
  only), **guild ranking windows are not**, **the siege is not**: no siege packet, window, HUD or rule exists.
- The siege snapshot `SNAPSHOTTYPE_GUILDCOMBAT` (0x00b8) has **no reader**: the bundle reader skips it silently (counted
  in the overlay's "skipped"), thanks to the server's snapshot index patch.
- **World 202 loads today**: `wdguildwar` is converted (terrain, minimap, no-fly), and world loading has no allow-list.
- Name tags have a guild line + logo (left) and one mark (right). **No slot for the siege trophies**, which Neuz draws
  left of the logo. The trophy pictures `TexGuildCombatWinner.bmp` / `TexGuildCombatBest.bmp` are **not converted**.
- Owner's "weekly champion guild badge" and "weekly MVP badge" are, in stock V15, exactly these two trophies:
  `m_uWinGuildId` and `m_uBestPlayer` from the siege snapshot's `GC_WINGUILD` / `GC_BESTPLAYER`
  (`Source/Neuz/DPClient.cpp:7809-7816`), drawn only while the siege is closed (`Source/_Common/MoverRender.cpp:1600-1611`).
- The phone's top-right row is a 4 x 2 grid of 8 icons (+ Stats text). The ranks no longer hide anything. A 9th icon
  needs a layout change or a swap. The desktop has no top-right row.
- The website reads SQL only through two stored procedures (sign-up, online count). No ranking page or API exists. The
  game client fetches nothing from `/api`.

## 1. Guild today

### 1.1 Packets (protocol)

| What | Where |
| --- | --- |
| Core direct packets (GUILD, ADD/REMOVE member, rank, class, nickname, login, game join, error, set name, master change ...) | `packages/protocol/src/world/guild.ts:43-67` (`GuildPacket`), reader `readGuildPacket` :426, type back `guildPacketTypeOf` :472 |
| World snapshots: GUILD_INVITE 0x9a, SET_GUILD 0x9b, CREATE 0x9c, DESTROY 0x9d, GUILD 0x9e, ALL_GUILDS 0x9f, LOGO 0xfb, CONTRIBUTION 0xfc, NOTICE 0xfd, AUTHORITY 0xfe, PENYA 0xff, REAL_PENYA 0xd5, **SET_WAR 0x7a, WAR 0xda** | `guild.ts:70-85`, readers table `GUILD_READERS` :394-409 |
| The war snapshots are read (`readSetWar` :383, `readGuildWar` :386-392, `GuildWarState` :206-214) | |
| ALL_GUILDS carries the 8 ranking lists (`GuildRanking`, R1..R8) | `guild.ts:166-182`, :222, reader :356-362 |
| Encoders (invite, kick, rank, class, nickname, master, rights, salary, name, logo, contribution, notice, player data) | `guild.ts:498-579`; pretend-server decoder `readGuildRequestPacket` :600 |
| Guild bank (open/close/put/take/penya/log/cloak; window, item in/out, log) | `packages/protocol/src/world/guildBank.ts` (207 lines), spread in `readers.ts:238` |
| Wiring | `readers.ts:234` (`...GUILD_READERS`), `types.ts:18, :26-27` (union), `messages/world.ts:33, :463-471` (direct `default:`), :771-782 (client `default:`), `index.ts:75, :77` |

### 1.2 Client: book, HUD, windows

| Piece | Where |
| --- | --- |
| Guild book (`g_GuildMng` + own guild): applies every message, keeps the ranking for "the ranking windows, later" | `apps/client/src/world/guild/guildBook.ts:70-71, :150`; war: `ownWarId` :75, `setWar`/`guildWar` cases :334-340 |
| Guild HUD (sends, lines, refusals) | `apps/client/src/world/guild/guildHud.ts` (432 lines); "at war" checks :285, :302 |
| Rules | `apps/client/src/world/guild/guildRules.ts` (`logoRefusal` :138-139, `memberAction` :280-282) |
| Guild window, 5 tabs (Info, Member, Title, Guild Duel, Permissions) | `apps/client/src/world/hud/guild/guildWindow.ts:4-11` (tab list), class :182 |
| Small windows: invite, name, nickname, notice, logo, disband, pay confirm | `apps/client/src/world/hud/guild/guildDialogs.ts:4-10`, classes :131-305 |
| Guild bank windows: Safebox, Contribute, Bank Log | `apps/client/src/world/hud/guildBank/guildBankWindows.ts:4-16`, classes :151, :246, :320; HUD `apps/client/src/world/guildBank/guildBankHud.ts` |
| Built in WorldScreen | `apps/client/src/world/WorldScreen.ts:2033-2046` (`new GuildHud(...)`); routing :947-953; Start menu "Guild" `hud/taskBar.ts:141-143`; G key via `WINDOWS` `taskBar.ts:95` |
| Guild Warehouse NPC entry (with a guild and `ENABLE_GUILD_INVENTORY`) | `hud/moverMenu.ts:97-111`; `WorldScreen.ts:3952-3954`, :4300-4301 |

### 1.3 Guild war

**Not built.** Only its state is read and shown.
- The Guild Duel tab shows enemy, won, lost, given up, time left (`guildWindow.ts:129-138`, :395-399). Its three buttons
  (Declare, Cease-fire, Give Up) are always disabled: "wait for the guild-war milestone" (`guildWindow.ts:15-16`, :275).
- No war declare/peace/give-up windows, no war packets sent, no war mark (`XI_GEN_PVP_FLAG01`) above enemies (searched:
  no `WARMARK`/`PVP_FLAG` in code; plan in `docs/2026-11-10-guild-checkpoint.md:54`).
- No PvP between war enemies: `attackAble` lets a player hit another player only in the Arena
  (`apps/client/src/world/combat/attackLoop.ts:120-125`).
- Guild-war name colours are "not copied" (`apps/client/src/world/render/nameTags.ts:99`).

### 1.4 Guild ranking windows

**Not built.** MMI_RANK_GUILD 16, RANK_WAR 17, RANK_INFO 18 (`Resource/defineNeuz.h:108-110`) are not in the client's
`MMI` table (`hud/moverMenu.ts:23-42`), so Julia/Helena/Ollien show them greyed (test `apps/client/test/moverMenu.test.ts:24-26`).
The data is already there (`guildBook.ranking`, `guildBook.ts:70-71, :150`). `/ranking` goes to the server as typed
(`hud/chatCommandTable.ts:59`).

### 1.5 ADD_OBJ guild fields

| Field | Kept? | Where |
| --- | --- | --- |
| `m_idGuild`, `m_idWar` (behind a flag byte = 1) | kept as `guildId`, `warId` | `packages/protocol/src/world/addObj.ts:114-118`, :147; type `types.ts:571-576` |
| `m_idGuildCloak` | kept as `guildCloak` | `addObj.ts:119`, :147 |
| `m_nFame`, `m_nDuel` | dropped | `addObj.ts:135-136` |
| **`m_nGuildCombatState`** | **dropped** | `addObj.ts:140` (testkit writes 0: `packages/testkit/src/world.ts:657`; test writer `packages/protocol/test/addObj.test.ts:102`) |

`m_nGuildCombatState` matters for the siege: Neuz's own death with it at 1 sends REVIVAL_TO_LODESTAR at once, no revive
window (`Source/Neuz/DPClient.cpp:2043-2045`); a siege snapshot sub-type updates it (`DPClient.cpp:6989`).

### 1.6 Name tags

- `NameTag` = `text`, `color`, `maxDistance`, optional `mark` (one picture after the name) and optional `guild`
  (`text`, `color`, `logo`) (`apps/client/src/world/render/nameTags.ts:7-24`).
- Text: `[honour title] name` + ` [Admin]`/` [GM]` (`nameTags.ts:134-140`). Colour: chaotic, PK pink, admin, GM, VIP,
  party, general (`nameTags.ts:143-151`); nothing per world.
- Guild line: guild name white, master's 0xFFFFFF99, logo 24 x 24 (`nameTags.ts:33-43`); drawn 12 px above the name,
  logo left of the wider line (`render/NameTagLayer.ts:35-42`, layout :152-227, pictures :226-227).
- Mark after the name: Master `icon_expert1..6` / Hero `icon_hero` (`nameTags.ts:45-55`; 25 x 25, `NameTagLayer.ts:29-33`).
- Redraw: `WorldScreen.recolorTags()` (`WorldScreen.ts:4175-4179`) with `guildTagOf` (:4182-4189); `NameTagLayer.recolor`
  compares text, colour, mark and the guild key (`NameTagLayer.ts:97-108`, key :68-70).
- **No slot for the siege trophies** and no badge field. Neuz draws `m_TexGuildBest` (MVP) or `m_TexGuildWinner`
  (winning guild) one logo-width further left than the logo (`Source/_Common/MoverRender.cpp:1645-1655`), or left of the
  wider line when the guild has no logo (:1660-1688); only in `CLOSE_STATE` (:1603-1611). During the siege a defender's
  name is 0xFFFEA8FF (:1590-1596). A port needs e.g. `guild.trophy?: string` and one more picture in `NameTagLayer.add`.

## 2. Siege today

| Where | What | Line |
| --- | --- | --- |
| protocol | `m_nGuildCombatState` read and dropped | `packages/protocol/src/world/addObj.ts:140` |
| protocol | only a comment ("the guild siege's ..." GM lines) | `packages/protocol/src/world/gm.ts:18` |
| client | `/escape` in world 202: box `TID_GAME_GUILDCOMBAT_NO_OUTWAR`, nothing sent | `apps/client/src/world/WorldScreen.ts:4567-4570` |
| client | Blink Wings in 202: same box | `apps/client/src/world/items/travelItems.ts:17-19, :91` |
| client | Add Friend in 202: `TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD` | `apps/client/src/world/friends/friendRules.ts:210-218` |
| client | no death music in 202 | `apps/client/src/audio/soundIds.ts:34-38` |
| client | message box made for such boxes | `apps/client/src/world/hud/messageBox.ts:2-3` |
| client | GM commands `/gcin /gcopen /gcclose /gcNext /gc1to1open/close/next` go to the server as typed | `apps/client/src/world/hud/chatCommandTable.ts:91-94, :119-121` |
| client | name tag note: "The Guild Siege's colours are the siege's, not here" | `apps/client/src/world/render/nameTags.ts:39` |
| client | `MaFl_GuildWar` / `MaFl_Donaris` menus show greyed (MMI 26-41 not enabled) | `hud/moverMenu.ts:108-113` |
| gateway | nothing (relays every world/cache packet; only the certifier has an allow-list) | `apps/gateway/src/relay.ts:42-49, :236-237` |
| tests | 202 refusals only | `apps/client/test/friends.test.ts:147`, `apps/client/test/travelItems.test.ts:27, :31, :40` |
| docs | "large, its own piece" | `docs/superpowers/specs/2026-11-10-guild-research.md:204`, `docs/2026-11-10-guild-checkpoint.md:56`, `docs/2026-11-10-arena-tower-checkpoint.md:49`, `docs/2026-11-10-gm-commands-checkpoint.md:34` (GC commands' error lines show) |

No match for `MaFl_GuildWar` in code; the NPC is only in the converted `dist/assets/data/npcs.3efae02955.json`:
`MaFl_GuildWar` "[Guild Siege Manager]Frankie" menus `[0,26,27,29,33,37,38,39]`, `MaFl_Donaris` `[0,28,30,34,35,40]`,
`MaFl_Amos` / `MaFl_Annie` (1:1) `[0,60,62,64,63,67,68,69]` / `[0,61,70,66,65]`; pictures `ui/char/char_guildwar01..04.png`.
The menu labels are in `texts.json` (text ids 7026-7041: Apply, Status, Cancel, Join, Ranking, Entry, prize lines ...).

### The siege snapshot: ignored

- `SNAPSHOTTYPE_GUILDCOMBAT` = 0x00b8 (`Source/_Network/MsgHdr.h:1075`), 1:1 ones 0x0125-0x0129 (:1189-1193). No reader in
  `WORLD_READERS` (`packages/protocol/src/world/readers.ts:76-246`); no `0xb8` anywhere in protocol or client.
- Neuz reads one BYTE sub-state then switches over ~25 handlers (`Source/Neuz/DPClient.cpp:659`, :6745-6820): GC_IN_WINDOW,
  SELECTPLAYER, REQUEST_STATUS, USERSTATE, GUILDSTATUS, GUILDPRECEDENCE, PLAYERPRECEDENCE, SELECTWARPOS, GCSTATE,
  NEXTTIMESTATE, ENTERTIME, WINGUILD, BESTPLAYER, GETPENYAGUILD/PLAYER, DIAGMESSAGE, TELE, WARPLAYERLIST, ISREQUEST, LOG,
  LOG_REALTIME, PLAYERPOINT. So FlyffWeb needs **one** reader for 0xb8 that switches on that byte.
- **What an unknown snapshot does**: with the table of contents (the server has the patch: marker `0x31434f54`,
  `packages/protocol/src/constants.ts:468`, found in `Source/WORLDSERVER/Snapshot.h`), the type goes to `skipped` and the
  next message is read (`packages/protocol/src/bundle.ts:163-166`); `WorldSession.count` adds it to `stats.skipped` with
  **no warning** (`apps/client/src/world/WorldSession.ts:809-826`). Without the table the bundle stops there and the rest is
  dropped, with one warning (`bundle.ts:196-199`, `WorldSession.ts:823-825`). A reader that does not end where the table
  says goes to `mismatched` and warns once (`bundle.ts:170-180`, `WorldSession.ts:814-816`).
- An unknown **direct** packet: `{ type: 'unknown' }` (`packages/protocol/src/messages/world.ts:470`), counted and warned
  once (`WorldSession.ts:732-735`).

## 3. How a new snapshot / packet is wired (files a siege feature touches)

Model: the newest small ones, `hpLayer` (one snapshot) and `honor` (snapshots + one send), and the guild for the rest.

| Step | File | Model line |
| --- | --- | --- |
| 1. Reader(s), message type, `XXX_READERS`, `isXxxMessage`, encoders, request decoder | new `packages/protocol/src/world/guildCombat.ts` | `world/hpLayer.ts:15-40`; `world/honor.ts:21-44`; `world/guild.ts:394-421` |
| 2. Register the reader | `packages/protocol/src/world/readers.ts` | spreads :232-245 |
| 3. Union | `packages/protocol/src/world/types.ts` | :18-27 |
| 4. Client packets for the pretend servers | `packages/protocol/src/messages/world.ts` | client `default:` :771-782 |
| 5. Export | `packages/protocol/src/index.ts` | :75-81 |
| 6. Testkit writer | new `packages/testkit/src/guildCombat.ts` + `index.ts` | `testkit/src/hpLayer.ts:9-12`; `testkit/src/index.ts:49-72` |
| 7. ADD_OBJ `m_nGuildCombatState` kept | `addObj.ts:140`, `types.ts:571-576`, `testkit/src/world.ts:657`, `protocol/test/addObj.test.ts:102` | guild fields :114-119 |
| 8. Send wrapper | `apps/client/src/world/WorldSession.ts` | generic `sendGuild(bytes)` :307; `sendHonorTitleChange` :313 |
| 9. Book (state) + HUD | new `apps/client/src/world/guildCombat/*` + `hud/guildCombat/*` | `guild/guildBook.ts`, `guild/guildHud.ts`; `lord/lordBook.ts` + `lord/lordHud.ts` |
| 10. Route | `WorldScreen.apply` | guild :947-953, Lord :955-959, honour :961 |
| 11. Build, elements, modals, teardown | `WorldScreen.ts` | GuildHud :2033-2046; modal list :2232; elements :2238-2245; teardown :4779, :4805-4806 |
| 12. Windows | `ResWindow` from a hand copy of resdata.inc | `hud/resWindow.ts`; guild windows above |
| 13. CSS desktop + phone | `apps/client/src/style.css` | guild phone block :3191; Lord :3575 |
| 14. Pictures | `tools/convert/src/ui/uiStage.ts` `THEME_FILES` | :71-275 (groups :249-264) |
| 15. Tests | `packages/protocol/test/*.test.ts`, `apps/client/test/*.test.ts`, `apps/client/e2e/*.spec.ts` | `protocol/test/hpLayer.test.ts`, `honor.test.ts`; `e2e/guild.spec.ts`, `honor.spec.ts`, `lord.spec.ts` |

A direct (core) packet also needs a `case` in `WorldSession.onCachePacket` (`WorldSession.ts:642-737`, guild cases
:694-711) and a branch in `decodeWorldPacket`'s `default:` (`messages/world.ts:463-471`). Direct packets are dropped
outside the `playing` phase (`WorldSession.ts:708`). The siege is world snapshots, so this is likely not needed (the
server research should confirm there is no core siege packet).

### NPC menus (MMI)

1. Add the ids to `MMI` (`apps/client/src/world/hud/moverMenu.ts:23-42`), e.g. GUILDWAR_APP 26 .. GUILDCOMBAT_PENYA_RETURN
   41 (`Resource/defineNeuz.h:118-134`; MMI 31 is Cheer, 32 Piercing Remove).
2. A set like `LORD_MENU` (:78) or `ARENA_TOWER_ENTRIES` (:47), added to `enabled` (:108-113). A Neuz rule that hides an
   entry goes in the `.filter` (:102), as Guild Warehouse and Enter Arena do.
3. Dispatch in `WorldScreen.chooseNpcEntry` (`WorldScreen.ts:4274-...`), like `LORD_ENTRIES` → `lordHud.openEntry(entry)`
   (:4313-4314; import :147).
4. Labels come from text 7000 + id (`moverMenu.ts:81-91, :105`), all present for 26-41.
5. One-entry NPCs run at once (`soleEntry`, :122-127); from 7 entries a phone shows two columns (`TWO_COLUMNS`, :132):
   Frankie has 8.
6. Tests `apps/client/test/moverMenu.test.ts:13-30`.

## 4. World loading (world 202)

- **No allow-list.** A world loads when `data/worlds.json` names its folder and `worlds/<folder>/manifest.json` is in the
  asset index; else "not available" (`WorldScreen.ts:848-852` on a transition, :884-887 on entry). Catalog loaded at
  `apps/client/src/world/gameData.ts:153`.
- **Converted** (owner's dist): `dist/assets/data/worlds.473f3c7f55.json` has `"202":"wdguildwar"` and 241-244
  `wdguildwar1to1`; `dist/assets/worlds/wdguildwar/manifest.739193a638.json` ("WdGuildWar", size 5 x 5, one terrain tile
  `2_2`, 23 models); `minimaps/wdguildwar/2_2.png` and `minimaps/wdguildwar1to1/0_0.png` are in `dist/assets/index.json`.
- The converter takes every `Client/World` folder with a `.wld` (`tools/convert/src/world/convertWorld.ts:1-4`), worlds.json
  from World.inc (`tools/convert/src/data/gameDataStage.ts:9, :551`), the minimaps by world folder
  (`tools/convert/src/ui/uiStage.ts:489`).
- **No flying in 202**: it is in `data/worldNoFly.65c51f0045.json` (rule `gameData.ts:82-86`).
- **Arena 208 and Forsaken Tower 21-25: same path.** The server answers REPLACE; `WorldSession` hands it on
  (`WorldSession.ts:719-724`); no world-specific loader ("Convert command: None", `docs/2026-11-10-arena-tower-checkpoint.md:73`).
- **Minimap**: per world folder, `minimaps/${folder}/${key}.png` (`hud/minimap.ts:46, :153`; built `WorldScreen.ts:1294`).
  The **world map** (`data/worldMap.json`) is for world 1 only (`world: 1`; `worldMapRules.ts:37-38` returns none elsewhere).
- No world loading pictures are used (no `MapLoading_*` in code; `MapLoading_GuildWar.tga` exists in `Client/Theme/Default`).
- **World rules hooks**:
  - PvP: `attackAble` (`combat/attackLoop.ts:120-132`) → `isArenaTarget` (`combat/arena.ts:24-46`, world 208 + circle).
    The attack button asks the same rule (`attackLoop.ts:357-367`). A siege rule would be one more branch here.
  - Name colour: none per world (`nameTags.ts:143-151`).
  - Death line in the Arena: `hud.inArena` (`WorldScreen.ts:1293`; `hud/hud.ts:56-59, :112`).
  - 202-only refusals: §2 table.

## 5. Death and revive

- The own death (`OwnEvent` `died`) opens the revive window (`hud/reviveWindow.ts:116-117`); Escape while dead opens it
  again (`openRevive`, `WorldScreen.ts:3698-3701`; header `reviveWindow.ts:1-3`). Lodestar sends REVIVAL_TO_LODESTAR (`WorldScreen.ts:1726`);
  "Revive here" needs a resurrection scroll (`reviveWindow.ts:21-22`, `update` :102).
- **World greying**: "Revive here" greyed in the Arena: `reviveWindow.update(canRevive && !isArena(worldId))`
  (`WorldScreen.ts:3424`). Death line `TID_GAME_DEATH_ARENA` in 208 (`hud/hud.ts:112`). No death music in 202/210/220/230
  (`audio/soundIds.ts:34-38`).
- **Missing for the siege**: Neuz sends REVIVAL_TO_LODESTAR at once and shows no revive window when
  `m_nGuildCombatState == 1` (`Source/Neuz/DPClient.cpp:2043-2045`). FlyffWeb drops that field (`addObj.ts:140`) and always
  opens the window.

## 6. Phone top-right icons, and the desktop

### Phone

- `MOBILE_SHORTCUTS` (`apps/client/src/world/hud/mobileTools.ts:52-61`), Start-menu order, with rank:

  | Label | Applet | Rank |
  | --- | --- | --- |
  | Status | APP_STATUS1 | 8 |
  | Character | APP_CHARACTER3 | 3 |
  | Bag | APP_INVENTORY | 1 |
  | Skill | APP_SKILL3 | 2 |
  | Quest | APP_QUEST_EX_LIST | 4 |
  | World Map | APP_MAP | 6 |
  | Messenger | APP_MESSENGER_EX | 7 |
  | Party | APP_PARTY | 5 |

  Then **Stats** (text, only when the overlay is shown: `WorldScreen.ts:1705-1716`).
- **Ranks are dead**: since 2026-11-13 (commit `6fac0ba`) the row is a grid of **two rows of four**
  (`style.css:1639-1640`, `grid-template-columns: repeat(4, auto)` :1645-1653); "the narrow phones no longer drop the least
  used". No CSS reads `data-rank`; the attribute is still set (`mobileTools.ts:88`) and tested
  (`apps/client/test/mobileTools.test.ts:46-56`). `docs/2026-11-10-topright-icons.md` (one row, ranks by width) is outdated.
- Sizes: icon = 32 device px × round(DPR) (`iconCssSize`, `mobileTools.ts:67-70`): 36.57 CSS px on a Pixel 7, 32 on an
  iPhone (DPR 3). Press area icon + 4 px (`style.css:1657-1660`). Toolbar at the top, `right: 12px`, or `100px` while the
  Navigator shows (`style.css:1652-1653`, :2323). Stats in row 3 at the left (`style.css:1663`).
- Constraints the e2e checks (`apps/client/e2e/topRightIcons.spec.ts:124-133, :157-171`): two rows of four, the toolbar
  right of the status window and left of the Navigator, clear of the target bar, at 844, 750, **730 x 320 (iPhone)** and 568
  wide. And the Action Slot button sits **under** the icon rows (`e2e/phoneSizes.spec.ts:111-114`, :126-128).
- An icon needs an applet with an icon (`APPLETS`, `mobileTools.ts:89-90`) or shows its label as text; the frameless copy
  comes from `BARE_ICONS` (`tools/convert/src/ui/uiStage.ts:331-334`). A siege icon has no applet: `MobileTool.applet` would
  need a picture option (or reuse `Icon_GuildTitle.dds`, already `ui/icon_guildtitle.png`).
- Ways to fit a 9th icon (none tried; the widths are not measured here):

  | Option | Cost / risk |
  | --- | --- |
  | Replace Status (rank 8: "Status goes first, as its window shows from the start", `mobileTools.ts:46-51`) | no layout change; e2e `topRightIcons.spec.ts:14-18` list changes |
  | 5 + 4 grid (`repeat(5, auto)`) | ~41 px wider on a Pixel 7 (~36 on iPhone); must still clear the target bar and the status window at 568 / 730 px: **unconfirmed** |
  | 3 x 3 grid | one more row (~40 px): pushes into the Action Slot button rule (`phoneSizes.spec.ts:113`) |
  | An overflow "more" icon | no pattern exists yet |
  | Show it only during/after a siege, in the top-centre event row like the Lord events | pattern exists: `.hud-lord-events` (`style.css:3564`, phone `top: 56px` :3577; `lord/lordHud.ts:220-221, :504-524`) |

### Desktop

- **No top-right icon row**: `.hud-mobile-tools { display: none; }` (`style.css:1608`), shown only in the phone media
  block (:1644); the e2e checks it is hidden on desktop (`topRightIcons.spec.ts:59-61`).
- Windows open from the Start menu (`hud/taskBar.ts:117-147`, 15 lines now), hotkeys made from `WINDOWS` × the applets'
  keys (`taskBar.ts:82-110`), and the task bar's applet slots. The Navigator sits at the top right. The only other HUD icon
  row is the Lord event icons at the top centre (`style.css:3564`).
- **The Honour window** is not a window of its own: it is the Character window's 2nd tab "Fame/Master"
  (`hud/characterWindow.ts:100`, page :279-311, `onHonorChange` :203-210). Opened by Start → Character (or H), then the tab
  (`apps/client/e2e/honor.spec.ts:72-77`). No new icon or menu line was added for it.

## 7. Titles, badges, buffs, item icons

### Honour titles (the Lord's "[Lord]")

| Step | Packet / data | Where |
| --- | --- | --- |
| Shown | `[title] name` from `data/honorTitles.json` by `player.honor` | `nameTags.ts:134-136` |
| At first sight | ADD_OBJ `nTemp` (honour id) | `addObj.ts:137` |
| Changed (to all in view) | HONOR_CHANGE_ACK snapshot 0x9301, one int | `protocol/src/world/honor.ts:24, :39`; `WorldState.ts:607-608` |
| Earned list (own) | HONOR_LIST_ACK 0x9300, 150 ints; own ADD_OBJ counts | `honor.ts:24, :33-38`; book `apps/client/src/world/honor/honorBook.ts` |
| Picked | HONOR_CHANGE_REQ 0x70004001, int (-1 none) | `honor.ts:21, :43-44`; `WorldSession.ts:313`; `WorldScreen.ts:1725` |
| Lord | honour id 36 HS_LORD, need 1 | `apps/client/e2e/honor.spec.ts:19-20`; `dist/assets/data/honorTitles.b78d220f7c.json` |

- 99 titles in use (0-98), room to 150 (`MAX_HONOR_TITLE`, `honor.ts:18`). No siege title exists. A weekly title would be
  new rows in `honorList.txt` + texts (server and client data), then `npm run convert -- --only data`; the server must
  grant and remove it. Where the server keeps `m_nHonor` is the server research's (not checked here).
- The player must pick a title to show it (`docs/2026-11-11-honor-checkpoint.md:3-5`): a title is a choice, not a badge.

### Buffs as badges

- The own buff row shows skill buffs, item buffs (`BUFF_ITEM` 0, `BUFF_ITEM2` 3, with the item's icon), the pet's and the
  buff pet's (`hud/buffStatus.ts:1-31`, constants :39-50). A server-sent item buff (SETSKILLSTATE 0x004c,
  `protocol/src/constants.ts:288`) would show with its item's icon and time on the **own** screen only.
- The target's row shows **skill buffs only** (`hud/targetBuffs.ts:1-3`, filter :33): another player's item buff is not
  seen. So a buff is a poor public badge.

### Item icons

- Every `Client/Item` icon converts automatically to `ui/item/<name>.png` (`tools/convert/src/output/keys.ts:23-26`;
  `uiStage.ts:50-58`); `Client/Icon` too (`ui/<name>.png`). No siege/trophy icon in `Client/Icon` (only `Icon_GuildTitle.dds`,
  `Icon_Company.DDS`, `Icon_Troupe.dds`).

### Already next to player names

Guild line + logo (above/left), Master/Hero mark (right), `[honour title]` prefix, ` [Admin]`/` [GM]` suffix, name colour
(§1.6). Nothing world- or siege-specific.

## 8. Website (`apps/web`)

- The only FlyffWeb part that talks to SQL Server (`apps/web/README.md:3-5`), with `mssql` ^12.7.14
  (`apps/web/package.json:8`).
- Routes: `GET /api/sign-up/ticket`, `POST /api/sign-up`, `GET /api/status`, else 404 (`apps/web/src/server.ts:67-92`).
- SQL: the site login `flyffweb_site` may only EXECUTE `ACCOUNT_DBF.dbo.usp_CreateNewAccount` and
  `CHARACTER_01_DBF.dbo.usp_WebOnlineCount` (`SELECT COUNT(*) FROM CHARACTER_TBL WHERE MultiServer > 0`)
  (`apps/web/sql/web-login.sql:1-18, :39-45`); pools per database (`apps/web/src/sqlAccountStore.ts:1-2, :10-19`, calls :54,
  :59). Status cached 30 s (`apps/web/src/status.ts:1-3, :39-47`).
- The admin panel (port 8092) uses its own login `flyffweb_admin` and `usp_Admin*` procedures (`apps/web/src/admin/sqlAdminStore.ts:2`,
  :81-211; `apps/web/sql/admin-login.sql`). It reads `CHARACTER_TBL`, not guild tables.
- **No ranking page or API** (no guild, player or siege ranking; searched `rank`, `GUILD_` in `apps/web`).
- A siege ranking API could reuse the pattern: a `usp_WebSiegeRanking` (or similar) in `CHARACTER_01_DBF` granted to
  `flyffweb_site` (as `web-login.sql:39-45`), a method on the store with `lazyPool` (`sqlAccountStore.ts:10-19`), a cached
  route in `server.ts` (as `/api/status`). Which tables hold siege results is the server research's (not checked here).
- Site pages: `/`, `/play/`, `/sign-up/` (`apps/client/siteRoutes.ts:11`), `/api/` left to the web service (:15; dev proxy
  `apps/client/vite.config.ts:31-36` to 127.0.0.1:8091; hosted: Caddy passes `/api/*`, `apps/web/README.md:3-5`).
- **The game client fetches nothing from the website.** Only the site's home page (`apps/client/src/site/statusBox.ts:27`)
  and sign-up (`apps/client/src/site/signUpApi.ts:29, :42`) call `/api`. `/play` is the same origin, so the in-game client
  could fetch `/api/...` without CORS work.

## 9. Converted UI assets for the siege

Checked against the owner's `dist/assets/index.json` and `Client/Theme/Default`:

| Picture | Used by | Converted? |
| --- | --- | --- |
| `TexGuildCombatWinner.bmp`, `TexGuildCombatBest.bmp` | name-tag trophies (`Source/_Interface/WndWorld.cpp:3817-3818`, colour key magenta) | **no** |
| `WndGuildCombatCape.tga` | a siege window (resdata.inc) | **no** |
| `ButtGW1..4.tga`, `ButtGWDefender.tga`, `ButtDefenderIcon.tga`, `ButtGWRefresh.tga` | siege windows | **no** (ButtGWRefresh is on the unmerged housing branch's convert list) |
| `ButtApply.tga`, `ButtRetry.tga`, `ButtSave.tga`, `ButtUp.tga`, `ButtDown.tga` | siege windows | **no** |
| `MapLoading_GuildWar.tga` | loading picture (not used by FlyffWeb) | no |
| `ButtGuildWar.BMP`, `ButtGuildDuel.bmp` | guild window's Guild Duel tab | yes (`uiStage.ts:256`) |
| `WndTile00.tga`, `WndEditTile00/200.tga`, `ButtOk/Yes/No/Close/Accept.tga`, `ButOk2.bmp`, `ButtFinish/Reset.BMP`, `Buttleft2/right2.bmp` | frames and common buttons | yes |

(Siege windows' pictures from `Resource/resdata.inc`: APP_GUILDCOMBAT_* at :137, :167, :233, :245, :302, :422, :515, :653,
:1886, :1934, :2300, :2339, :2378, :2399, :2468, :25818 and APP_GUILD_WAR_STATE :27051; the guild war boxes :10265-10925.)

**Theme pictures convert only when listed** in `THEME_FILES` (`tools/convert/src/ui/uiStage.ts:71-275`); `--only` filters
on the picture's file name with globs (`uiStage.ts:28, :467-468`; `tools/convert/src/cli.ts:21-27`). So the branch first adds
a commented group to `THEME_FILES`, then the owner runs, phrased as earlier checkpoints did
(`docs/2026-11-10-guild-checkpoint.md:94`, `docs/2026-11-15-guild-bank-checkpoint.md:53`):

```
npm run convert -- --only "TexGuildCombat*,WndGuildCombatCape*,ButtGW*,ButtDefenderIcon*,ButtApply*,ButtRetry*,ButtSave*,ButtUp*,ButtDown*"
```

(trim to the windows actually built). If a siege icon joins the phone row through `BARE_ICONS`, its `Icon_*.dds` name goes
in the same `--only`. If new texts or honour rows are added, also `--only data`. No world convert is needed (202 is in).

## Not confirmed here

- Whether a 5-column phone grid fits at 568 / 730 px beside the status window and the target bar (not measured).
- The siege's SQL tables and any core (direct) siege packet: server research.
- Which siege MMI entries Neuz hides by state in `ShowMoverMenu` (not read here).
