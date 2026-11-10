# C. The guild in the world, and the big guild systems (Neuz V15 source research)

Research only. Source root `Source/` = `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source` (CP949, line numbers as in the file).
Resource root `Resource/`, client data root `Client/` (same parent folder). TID texts come from `Resource/textClient.inc` (TID -> colour + IDS) and `Resource/textClient.txt.txt` (IDS -> English text), both UTF-16LE.

## 0. What is compiled in for V15 main server

- `Neuz/VersionCommon.h:3` `#define __MAINSERVER`, `:4` `__VER 15`. `:6-8` `__INTERNALSERVER` is only defined when neither TEST nor MAIN is.
- Most guild features are gated by `#if __VER >= N // __NAME` in code, NOT by the commented-out `#define`s at the top of VersionCommon.h. So the commented lines `VersionCommon.h:65-71` (`__CSC_VER11_4` messenger, `__GUILDCOMBATCHIP`, `__GUILD_COMBAT_1TO1`, `__GUILD_BANK_LOG`) are ACTIVE through `__VER >= 11` (e.g. `Neuz/DPClient.cpp:735`, `:991`, `:2032`).
- `__GUILD_HOUSE` is defined directly (`VersionCommon.h:205`) and also used as `#if __VER >= 15 // __GUILD_HOUSE` (`DPClient.cpp:140`, `:859`). ACTIVE.
- `__GUILD_HOUSE_MIDDLE` (guild house tender/auction, middle-size houses) is defined only for INTERNAL (`VersionCommon.h:398`) and TEST (`:462`) servers, never for MAIN. NOT compiled on main (`DPClient.cpp:879-883` is `#ifdef __GUILD_HOUSE_MIDDLE`).
- `__GUILDVOTE` is defined only for INTERNAL (`VersionCommon.h:269`) and TEST (`:412`), and the code uses `#ifdef __GUILDVOTE` (`_Interface/FuncApplet.cpp:142`, `:247`, `_Interface/WndTaskBar.cpp:2673`). NOT compiled on main (the vote packet handlers `DPClient.cpp:559-560` are unconditional, but no window/menu can open the vote UI).
- `__Y_RENDER_NAME_OPTION` (name-render option UI) is INTERNAL only. Not on main.
- `__XCLOAK` (custom per-guild uploaded cloak texture) is never defined anywhere (only `#ifdef` users: `_Common/GuildRender.cpp:7`, `_Common/MoverEquip.cpp:1840,1846,1914,1919,2002`); the Neuz project's preprocessor list has no such define (`Neuz/Neuz.vcxproj` `<PreprocessorDefinitions>`: `WIN32;NDEBUG;_WINDOWS;NO_GAMEGUARD;...`). Dead code.
- Custom `__BB_*` features (`VersionCommon.h` CUSTOM FEATURES block): `__BB_VIP_TITLES` changes the name colour of VIP players to `0xfffff8dc` in `CMover::RenderName` (`_Common/MoverRender.cpp:1256-1259`); `__BB_ARENA_3V3`, `__BB_DUNGEON_UI`, etc. are unrelated to guilds. Out of scope; mention only.

---

## 1. Guild name and logo above heads

### Where it is drawn
- `CWorld::Render` pass 5 "names last" (`_Common/World3D.cpp:1262-1305`) loops the culled objects; for each mover it calls `pMover->RenderName( m_pd3dDevice, pFont, dwColor )` (`World3D.cpp:1299`).
  - Skipped when `pMover->IsActiveMover() && m_nZoomLevel != 0` (`:1273-1274`), i.e. own name hidden in first-person zoom.
  - Distance limit: `fDistLimit = 40.0f`, `100.0f` for players and peaceful NPCs (`:1276-1278`); compared with `pObj->m_fDistCamera` (distance to the CAMERA, `:1279`).
  - Not drawn in `TRANSPARENT_MODE` (`:1282`).
  - The incoming `dwColor` is white; GM tinting (`:1285-1298`) is overwritten later inside RenderName for players (see colours).
  - Gate `m_bViewName` (`:1267`) is the debug "Name" toggle (`_Common/World.cpp:134` default TRUE), not a user option.
- `pFont` = `m_Theme.m_pFontWorld` passed from `CWndWorld` (`_Interface/WndWorld.cpp:913`).
- The function: `CMover::RenderName` `_Common/MoverRender.cpp:1219-1726`. The guild part starts at the comment "Render Guild Name & Logo" `:1484`.

### Font
- `FontWorld` is created in `CTheme` (`_Interface/ITheme.cpp:91-109`, `__LANG_1013` branch is active: `VersionCommon.h:32`): `new CD3DFont( pLangData->font.afi[4].szFont, 9 )`, `m_nOutLine = afi[4].nOutLine`, `m_dwColor = 0xffffffff`, `m_dwBgColor = afi[4].dwBgColor` (`ITheme.cpp:105-109`); looked up as `m_pFontWorld` (`ITheme.cpp:418`... `m_mapFont.Lookup( "FontWorld" )`).
- `Resource/propLang.txt` row 1 English: szFont4 = `Verdana`, dwBgColor4 = ARGB(255,60,60,60), nOutLine4 = 2. So: Verdana, 9 pt, white fill colour supplied per call, 2-pixel outline in dark grey `#3C3C3C`.

### Option toggles (g_Option)
- `g_Option.m_nPlayerName` (own name) and `g_Option.m_nOtherPlayerName` (other players): `RenderName` returns early when the relevant flag is off (`MoverRender.cpp:1224-1228`). The guild line and logo are inside RenderName, so they hide together with the name. There is NO separate guild-name toggle.
  - Defaults 1/1 (`_Common/HwOption.cpp:247-248`), saved as `PRenderName` / `OPRenderName` (`HwOption.cpp:1127-1128`), loaded `:974`, `:979`.
  - UI: Options window checkboxes `WIDC_CHECK6` (own name) and `WIDC_CHECK7` (other players' names) (`_Interface/WndOption.cpp:828-831`, handlers `:1225-1232`). `WIDC_CHECK8` = monster names (`m_nMonName`).
- GM in disguise: if the mover is GM+ and has a `IK3_TEXT_DISGUISE` buff, the guild name/logo are skipped (`bSkip`, `MoverRender.cpp:1486-1493`).

### How the client finds the guild for a mover
- `CMover::m_idGuild` (set by snapshots, e.g. `SNAPSHOTTYPE_SET_GUILD` -> `CDPClient::OnSetGuild` `Neuz/DPClient.cpp:12689-12745`, and the mover's create/serialize).
- `CMover::GetGuild()` client branch (`_Common/Mover.cpp:8137-8160`): if `m_idGuild` equals the active player's guild, return `g_GuildMng.GetGuild( m_idGuild )` only if that guild `IsMember( m_idPlayer )`; otherwise just `g_GuildMng.GetGuild( m_idGuild )`.
- `g_GuildMng` (`CGuildMng`, `_Common/guild.cpp:786` `GetGuild(u_long)`, `:794` by name) is filled for ALL guilds by `SNAPSHOTTYPE_ALL_GUILDS` -> `OnAllGuilds` -> `g_GuildMng.Serialize( ar, TRUE )` (`DPClient.cpp:13145-13148`); the own guild in full by `SNAPSHOTTYPE_GUILD` -> `OnGuild` (`:12617`). Name = `CGuild::m_szGuild`, logo number = `CGuild::m_dwLogo` (0 = none). Logo changes arrive in `SNAPSHOTTYPE_GUILD_LOGO` -> `OnGuildLogo` (`DPClient.cpp:13254-13265`: `ar >> idGuild >> dwLogo`).

### Exact layout (screen space)
Let `vOut` = projection of the top of the model's bounding box (`pBB->m_vPos[0]` with x=z=0, `MoverRender.cpp:1351-1358`). `MakeEven(x)` rounds x to an even number.

1. Player name line (`:1359-1365`, drawn `:1412`):
   `x = even(vOut.x) - textWidth(name)/2 - 3`, `y = vOut.y - 20`.
   Name text = `m_szName`, prefixed `"[title] "` when the player has a fame/honour title (`:1263-1272`, `__HONORABLE_TITLE` active at __VER 13+). This repo also appends `" [Admin]"` / `" [GM]"` for GM+ (`:1274-1288`) - looks like a server-owner modification (not stock V15 code), mention only.
2. Guild name line, ABOVE the player name, NO brackets (`:1569-1617`):
   `x = even(vOut.x) - textWidth(guildName)/2 - 3`, `y = vOut.y - 32` (12 px above the name line), text = `pGuild->m_szGuild` exactly.
3. Logo (`:1619-1646`), only if `m_dwLogo != 0`:
   texture `pWndWorld->m_pTextureLogo[ m_dwLogo - 1 ]` (24x24, see below).
   `w = max( textWidth(name), textWidth(guildName) )` (it compares the two widths, `:1631-1642`),
   `x = even(vOut.x) - w/2 - (logoWidth + 2)`, `y = vOut.y - (logoHeight + 5)`. So the logo sits to the LEFT of the wider of the two text lines, its top at `vOut.y - 29` for a 24 px logo, i.e. it spans the guild line and the top of the name line.
   Blend: `D3DRS_DESTBLEND = D3DBLEND_ZERO` while drawing the logo (`:1621`), then back to `INVSRCALPHA` (`:1647`) - the logo is drawn OPAQUE (its colour-keyed black pixels come out black, not see-through). Alpha 255.
4. Guild Siege trophies (only while `g_GuildCombatMng.m_nState == CLOSE_STATE`, i.e. between sieges) (`:1601-1615`):
   - the siege Best Player (`m_uBestPlayer == m_idPlayer`) gets `m_TexGuildBest`, otherwise every member of the winning guild (`m_uWinGuildId`) gets `m_TexGuildWinner`;
   - drawn one more logo-width+2 further left of the logo (`:1649-1659`);
   - when the guild has no logo: drawn at `y = vOut.y - 30`, `x = even(vOut.x) - (len(name) > len(guild) ? width(name) : width(guild))/2 - 30` (`:1665-1696`; note it compares strlen, not pixel widths).
   - Textures: `Theme/Default/TexGuildCombatWinner.bmp`, `TexGuildCombatBest.bmp`, colour key magenta `0xffff00ff` (`_Interface/WndWorld.cpp:3811-3812`); both files are 25x25 24-bit BMP (`Client/Theme/Default/`).
5. Master/Hero icon (`:1495-1567`, `__VER >= 10`): drawn above-right; the x is moved right by half of the wider of name/guild width (`:1514-1522`), y `-= icon height + 5`. Not guild-specific but shares the width rule.

### Colours
Player name (`:1236-1288`, `:1403-1412`):
- base `prj.m_PKSetting.dwGeneralColor` = `0xffffffff` (`Resource/PKSetting.inc:22`); chaotic `dwChaoColor` = `0xffff0000` (`:24`); PK-pink `dwReadyColor` = `0xffffc0cb` (`:23`); admin `COLOR_ADMINISTRATOR 0xffAE2D2D`, GM `COLOR_GAMEMASTER 0xff2D7CAE` (`_Common/Mover.h:35-36`).
- party member (only when the colour is still the general colour) `COLOR_PARTY 0xff70f070` (`Mover.h:39`, `MoverRender.cpp:1403-1407`).
- in the Guild Siege map `WI_WORLD_GUILDWAR` when both have guilds: own guild `COLOR_GUILDCOMBAT 0xff00ff00`, others `COLOR_PLAYER 0xffffffff`; this override wins over everything (`:1238-1245`, `:1409-1410`).
- NOTE: there is NO special name colour for an ordinary guild war (guild duel) enemy. Enemies in a guild duel get the floating war mark SFX instead (below).

Guild name line (`:1580-1599`):
- default white `0xFFFFFFFF`;
- the guild MASTER's guild line is light yellow `0xFFFFFF99` (`:1586-1588`);
- in the siege map, the siege colour above (`0xff00ff00` own guild / white others) replaces it for non-masters (`:1589-1591`);
- during a running Guild Siege (`m_nGCState >= MAINTENANCE_STATE`) the guild's appointed Defender is pink `0xFFFEA8FF` (`:1593-1599`, `CWndWorld::GetGCStatusDefender`).

### War mark above the head (guild duel / PK)
`MoverRender.cpp:1696-1720`, still inside `if( pGuild && !bSkip )`:
- other player you are PK-ing (`g_Neuz.m_NeuzEnemy.IsPKing`) -> `RenderFlag( ENEMY_PK )`;
- else if the server allows guild war (`g_eLocal.GetState( EVE_GUILDWAR ) == 1`) and the mover is in the same war as you (`m_idWar && g_pPlayer->m_idWar == m_idWar`) and in the other guild -> `RenderFlag( ENEMY_WAR )`.
- `RenderFlag` (`:1724-1734`) creates SFX `XI_GEN_PVP_FLAG01` on the mover, scale 1.5, `CSfxDuelParty::m_nType = nType`, sets `MVRF_WARMARK` so it is created once.
- `m_idWar` arrives with `SNAPSHOTTYPE_SET_WAR` -> `OnSetWar` (`Neuz/DPClientGuildWar.cpp:179-190`).

### Logo pictures
- Loaded once in `CWndWorld` init: `for i in 0..CUSTOM_LOGO_MAX-1: "Icon_CloakSLogo%02d.jpg" (i+1)` from `DIR_ICON`, colour key `D3DCOLOR_XRGB(0,0,0)` (`_Interface/WndWorld.cpp:3667-3677`; array `m_pTextureLogo[CUSTOM_LOGO_MAX]` `_Interface/WndWorld.h:347`).
- `CUSTOM_LOGO_MAX 27` (`Resource/define.h:162`); `GM_LOGO_CH..GM_LOGO_US = 21..27` (`define.h:164-170`). Players pick from 1..20 (the logo picker draws `CUSTOM_LOGO_MAX - 7` = 20, `_Interface/WndGuildTabInfo.cpp:229`, `:317`); 21-27 are GM-only.
- Files: `Client/Icon/Icon_CloakSLogo01.jpg` .. `Icon_CloakSLogo27.jpg`, each 24x24 JPEG.
- With the black colour key (LoadTexture -> D3DX with `d3dKeyColor`, `_Common/2DRender.cpp:1185-1215`) pure-black pixels get alpha 0, but because the head logo is drawn with DESTBLEND=ZERO, those pixels show as black: a port should draw the 24x24 logo as an opaque square.
- The same `m_pTextureLogo[]` are used in the guild info tab, the war tab, the guild ranking windows (see section 6) and the siege HUD (`WndWorld.cpp:1791`, scaled).

---

## 2. Guild cloak

### Items (`Resource/defineItem.h:1442-1463`, props `Resource/propItem.txt:2419-2440`)
| id | define | name (propItem.txt.txt) | model (`Resource/mdlDyna.inc:3024-3045`) |
|---|---|---|---|
| 4600 | `II_ARM_S_CLO_CLO_TEST` | Cloak Test | `maleCloakSLogo00/femaleCloakSLogo00` |
| 4601 | `II_ARM_S_CLO_CLO_BLANK` | Blank Cloak | `maleCloakSLogo00/femaleCloakSLogo00` |
| 4602..4621 | `II_ARM_S_CLO_CLO_SYSCLOAK01..20` | Cloak 01 .. Cloak 20 | `maleCloakSLogoNN/femaleCloakSLogoNN` (NN = 01..20) |

All are `IK1_ARMOR / IK2_CLOTH / IK3_CLOAK`, `PARTS_CLOAK`, icon `itm_ArmCloCloCloak.dds`, cost 2000 / endurance 50000 (propItem columns).

### How the logo gets on the cloak (V15 main)
- There is NO runtime texture swap in practice. Each logo has its OWN cloak item and its OWN model whose texture already has the logo painted in:
  `Client/Model/Part_maleCloakSLogoNN.o3d` references `Part_maleCloakSLogoNN.dds` (texture name read from the o3d), and the textures are in `Client/Model/TextureMid/Part_{male,female}CloakSLogo00..20.dds` (42 files). Logo 00 = blank cloak.
- The server picks the item when the master makes a cloak: `CDPSrvr::OnCreateGuildCloak` (`WORLDSERVER/DPSrvr.cpp:11492-11580`):
  - needs `ENABLE_GUILD_INVENTORY`, a guild, a logo set (`TID_GAME_GUILDSETTINGLOGO` "Unable to create a guild cloak. Please set your guild logo first."), the master (`TID_GAME_GUILDONLYMASTERLOGO` "Only the Guild Leader can make a guild cloak."), a free guild-bank slot (`TID_GAME_GUILDBANKFULL`), and 10,000 penya in the guild bank (`:11524-11526`);
  - item id = `II_ARM_S_CLO_CLO_SYSCLOAK01 + (m_dwLogo - 1)`; logo 999 (custom) -> `II_ARM_S_CLO_CLO_BLANK`; a GM using a GM logo (> 20) gets `SYSCLOAK01` (`:11533-11541`);
  - stamps `itemElem.m_idGuild = pGuild->m_idGuild` (`:11545`), puts it in the GUILD BANK (`AddPutItemGuildBank`, `m_GuildBank.Add`) and tells every online member that 10,000 penya was spent (`AddGetGoldGuildBank( 10000, 2, ... )`).
- Client trigger: guild bank window button `WIDC_BUTTON2` "make cloak" (`_Interface/WndGuildBank.cpp:333-345`): refuses below guild level 4 (`m_nLevel < 4` -> `TID_GAME_GUILDNOTLEVEL` "Guild level is too low."), else `g_DPlay.SendCreateGuildCloak()` (`Neuz/DPClient.cpp:14183-14190`, header-only packet `PACKETTYPE_CREATE_GUILDCLOAK 0x00ff0ffd`, `_Network/MsgHdr.h:249`).
- Tooltip: any `IK3_CLOAK` with `m_idGuild` (except the siege dragon cloaks `II_ARM_S_CLO_CLO_DRAGON1..4`) shows the title `TID_GUILD_CLOAK` "%s Guild Cloak" with the guild name (`_Interface/WndManager.cpp:4575-4588`); colour of the TID is `0xffff0000` but the tooltip line colour is decided by the tooltip code.
- `m_idGuildCloak` / `m_pCloakTexture`: on equip of `II_ARM_S_CLO_CLO_BLANK` the mover stores the item's `m_idGuild` (`_Common/MoverEquip.cpp:1835-1850`), and is serialized to other clients (`_Common/ObjSerializeOpt.cpp:140`, `:451`). The texture load `g_GuildTexture.LoadGuildTexture( idGuild )` (file `CT%06d.jpg` from `DIR_LOGO`, `_Common/GuildRender.cpp:37-78`) is inside `#ifdef __XCLOAK` (never defined) and even then returns NULL outside `_DEBUG` (`GuildRender.cpp:39-41` "return NULL when going to the live server"). `CModelObject::SetExtTexture( m_pCloakTexture )` (`_Common/MoverRender.cpp:346`, used at `_Common/ModelObject.cpp:1188`) is therefore always NULL. A port can ignore custom cloak textures entirely: render the cloak like any other cloak part from `mdlDyna.inc`.
- `__YCLOTH` cloth-sim cloak (`WndWorld.cpp:3679-3691`) is not defined: ignore.

---

## 3. Guild chat and guild system messages

### Sending
- Chat window guild channel: radio `WIDC_RADIO5` sets `m_nChatChannel = CHATSTY_GUILD` and pre-fills the edit with `"/g "` (`_Interface/WndCommunication.cpp:713-718`); focusing the edit re-inserts `"/g "` when that channel is active (`:62-65`); the radio is disabled when you have no guild (`:216`). Korean IME alias `/ㅎ ` -> `/g ` (`:903-906`, Korean only).
- Text command `/g` (alias "GuildChat") `ON_TEXTCMDFUNC( TextCmd_GuildChat, "GuildChat", "g", ..., TCM_BOTH, AUTH_GENERAL )` (`_Interface/FuncTextCmd.cpp:5144`). Client side (`:1171-1184`): word filter (`g_WndMng.WordChange`), Thai wraps the text in quotes, then sends the whole line `"/g <text>"` as normal chat (`g_DPlay.SendChat`). World server side (`:1141-1170`): mute check, max 259 chars, effect parsing unless the font-edit buff is active, strips CR/LF, `g_DPCoreClient.SendGuildChat( pUser, sChat )` (`WORLDSERVER/DPCoreClient.cpp:1665`).
- Core server `CDPCoreSrvr::OnGuildChat` (`CORESERVER/DPCoreSrvr.cpp:1449-...`) loops the guild's members and sends `PACKETTYPE_GUILD_CHAT` to each online one (`CORESERVER/DPCacheSrvr.cpp:1936-1943`: `objid`, sender name string, chat string), plus snoop copies.

### Receiving (`CDPClient::OnGuildChat`, `Neuz/DPClient.cpp:12840-12876`; packet `PACKETTYPE_GUILD_CHAT 0xffffff39`, `_Network/MsgHdr.h:327`, map `DPClient.cpp:186`)
- Read `objid`, `sPlayer` (max MAX_PLAYER), `sChat` (max 1024).
- Blocked-user filter (`__YS_CHATTING_BLOCKING_SYSTEM`): dropped if the sender's mover is in `prj.m_setBlockedUserID` (`:12849-12856`).
- Line format V11+: `"[%s] %s"` = `[SenderName] text` (`:12860-12862`); the old `[Guild Chat][name] text` format is for < V11.
- Colour `prj.GetTextColor( TID_GUILD_CHAT )` = `0xffffbaff` (TID text "Guild Chat"); style `CHATSTY_GUILD 0x0010` (`:12866`; `_Interface/WndManager.h:140`).
- Speech bubble over the sender if visible: `g_DialogMsg.AddMessage( pMover, sChat, 0xfffffff, CHAT_GUILD )` (`:12870-12875`); CHAT_GUILD = 2 (`_Common/DialogMsg.h:34`) uses the guild bubble skin `Theme/texDialogBoxGuild.inc` (`_Common/DialogMsg.cpp:32`). (The colour literal has 7 f's in the source.)
- Filters: tab/filter index 4 = guild; defaults `m_dwChatFilter[0]` (General tab) includes GUILD, `m_dwChatFilter[4] = GENERAL | GUILD` (`_Common/HwOption.cpp:222-226`); filter window checkbox 5 (`_Interface/WndChatFilter.cpp:87-113`, `:173-209`); a line is shown if `style & (m_dwChatFilterEtc | m_dwChatFilter[channel])` (`WndManager.cpp:4045-4061`).

### Guild system messages in chat
All via `g_WndMng.PutString( text, NULL, colour )` with the default style `CHATSTY_GAME` (`WndManager.h:641`), colour = `prj.GetTextColor(TID)` unless noted.

| event | packet -> handler | TID | English text | colour |
|---|---|---|---|---|
| guild created | `SNAPSHOTTYPE_CREATE_GUILD` -> `OnCreateGuild` `DPClient.cpp:12516-12581` (msg `:12558-12559`) | TID_GAME_COMCREATE | "%s has formed the guild '%s'." (master, guild) | 0xffccffcc |
| guild disbanded (shown only to members of that guild, `:12594-12598`) | `SNAPSHOTTYPE_DESTROY_GUILD` -> `OnDestroyGuild` `:12583-12615` | TID_GAME_COMDISMESS | "%s has disbanded the %s guild." | 0xffff0000 |
| you joined (also plays BGM_IN_COMPANY) | `SNAPSHOTTYPE_SET_GUILD` (to self, idGuild != 0) -> `OnSetGuild` `:12689-12745` (`:12719-12722`) | TID_GAME_COMACCEPT | "You have joined the %s guild." | 0xffccffcc |
| you left / were kicked / guild gone | `SNAPSHOTTYPE_SET_GUILD` (to self, idGuild == 0) `:12702-12712`; also clears the guild house | TID_GAME_COMLEAVE | "You are no longer a member of the %s guild." | 0xffff0000 |
| another member joined | `PACKETTYPE_ADD_GUILD_MEMBER` -> `OnAddGuildMember` `:12747-12799` (`:12779-12780`) | TID_GAME_COMACCEPTWELCOME | "%s has joined the guild." | 0xffccffcc |
| a member left or was kicked (same text for both) | `PACKETTYPE_REMOVE_GUILD_MEMBER` -> `OnRemoveGuildMember` `:12801-12838` (`:12818-12819`) | TID_GAME_COMLEAVEBYE | "%s has left the guild." | 0xffff0000 |
| promoted / demoted (title level) | `PACKETTYPE_GUILD_MEMBER_LEVEL 0xffffff3a` -> `OnGuildMemberLv` `:12878-12918` | TID_GAME_GUILDMEM_APPUP / APPDOWN | "%s has been promoted." / "%s has been demoted." | white | 
|   | NOTE: the string is formatted (only if the member's mover is visible) but NEVER PutString'd - stock bug, no chat line appears (`:12890-12901`). | | | |
| new master | `PACKETTYPE_CHG_MASTER 0xf000f000` -> `OnChgMaster` `:12943-12982` (`:12975-12979`, only if the new master's mover is in view) | TID_GAME_CHANGE_GUILDMASTER | "%s has become the guild master." | 0xff00ff00 |
| guild level up | `SNAPSHOTTYPE_GUILD_CONTRIBUTION` -> `OnGuildContribution` `:13278-13296` (`:13287-13291`, when the new level > old) | TID_GAME_GUILDLEVELUP | "Guild level has increased." | white |
| notice changed | `SNAPSHOTTYPE_GUILD_NOTICE` -> `OnGuildNotice` `:13368-13387` | TID_GAME_GUILDNOTICEUPDATE | "A new Guild Notice has been posted. Please check it in the guild window." | white |
| title rights changed | `SNAPSHOTTYPE_GUILD_AUTHORITY` -> `OnGuildAuthority` `:13389-13406` | TID_GAME_GUILDCHGWARRANT | "Authority for each title has been changed." | white |
| title salaries changed | `SNAPSHOTTYPE_GUILD_PENYA` -> `OnGuildPenya` `:13408-13428` | TID_GAME_GUILDCHGPAY | "Salary for each title has been changed." | white |
| salary paid | `SNAPSHOTTYPE_GUILD_REAL_PENYA` -> `OnGuildRealPenya` `:13430-13452` (if salary of that title > 0) | TID_GAME_GUILD_PAYTAKE | "Guild salary of %d Penya received. Log in again to acquire the amount." | white |
| guild renamed | `PACKETTYPE_GUILD_SETNAME` -> `OnGuildSetName` `:13454-13476` (PutString with default colour = white) | TID_GAME_GUILDNAMECHG | "%s guild has changed their name to %s." | white (default) |
| create error: name taken | `PACKETTYPE_GUILD_ERROR` nError 1 -> `OnGuildError` `:13099-13119` | TID_GAME_COMOVERLAPNAME | "Guild name already exists." | 0xffff0000 |
| create error 2 | same, nError 2 | TID_GAME_GUILDONLYNUMBER | "Please enter the number." | white |
| contribution (pxp/penya/item) | `SNAPSHOTTYPE_GUILD_CONTRIBUTION` | - | no chat line, only window refresh (`UpdateGuildWnd`) | - |
| logo changed | `SNAPSHOTTYPE_GUILD_LOGO` -> `OnGuildLogo` `:13254-13265` | - | no chat line | - |
| member logged in / out | `PACKETTYPE_GUILD_GAMELOGIN 0xf000b029` -> `OnGuildMemberLogin` `:13008-13039`; `PACKETTYPE_LOGOUT` -> `OnLogout`; `PACKETTYPE_UPDATE_PLAYER_DATA` -> `OnUpdatePlayerData` | - | NO chat notice for guild members (only the guild window member tab and the messenger guild list refresh). Friend log-in notices are a messenger-friend feature, not a guild one. | - |
| guild invite received | `SNAPSHOTTYPE_GUILD_INVITE` -> `OnGuildInvite` `:13121-13143` | - | opens `CWndGuildConfirm` (`APP_GUILD_INVATE`) with the guild name | - |
| nickname / class change | `PACKETTYPE_GUILD_NICKNAME`, `PACKETTYPE_GUILD_CLASS` -> `:12984`, `:12920` | - | no chat line | - |
| guild war messages | see section 6 (guild war) | | | |

Core-server sourced packets are in the `ON_MSG` map (`DPClient.cpp:183-206`); world snapshots in the `OnSnapshot` switch (`DPClient.cpp:547-564`).

---

## 4. Messenger Guild tab

- Window: `CWndMessengerEx` (`APP_MESSENGER_`, `__CSC_VER11_4` active via `__VER >= 11`), `_Interface/WndMessenger.cpp`. Tabs created in `OnInitialUpdate` (`:658-705`): tab 0 `TID_APP_COMMUNITY_FRIEND` -> `m_wndFriend` (`CWndFriendCtrlEx`); tab 1 `TID_APP_COMPANY` ("Guild") -> `m_wndGuild` (`CWndGuildCtrlEx`, created with id 13, `WBS_NODRAWFRAME`, `:680-681`, `:692-695`); tab 2 `TID_APP_COMMUNITY_CAMPUS` -> `m_WndCampus` (`__CAMPUS`).
- Switching to the tab calls `m_wndGuild.UpdatePlayerList()` (`:829-840`). The five sort header buttons `WIDC_CHANNEL / WIDC_STATE / WIDC_LEVEL / WIDC_JOB / WIDC_NAME` are shared by all tabs and call `m_wndGuild.SortbyXxx()` when the guild tab is focused (`OnChildNotify` `:800`, switch `:865-930`).
- `CWndGuildCtrlEx` (`_Interface/WndMessengerCtrl.h:87-139`, implementation `_Interface/WndMessengerCtrl.cpp:1060-1640`):
  - Data source (`UpdatePlayerList`, `:1094-1151`): `g_pPlayer->GetGuild()->m_mapPMember`; per member `CPlayerDataCenter::GetPlayerData( idPlayer )`: `nJob`, `nLevel`, `uLogin` -> channel; online when `uLogin > 0` (`FRS_ONLINE`) else `FRS_OFFLINE`; name `pPlayerData->szPlayer`. Online state therefore comes from player-data packets (`PACKETTYPE_UPDATE_PLAYER_DATA`, `PACKETTYPE_LOGOUT`, `DPClient.cpp` `OnUpdatePlayerData` / `OnLogout`), and the list is refreshed by `UpdateGuildMemberList()` on every guild/member/login packet.
  - Default sort `SORT_BY_STATUS` (`:1069-1070`); each sort toggles asc/desc (`:1550-1638`), comparators `prChannelAsce` etc. at `WndMessengerCtrl.cpp:28-195`.
  - Row height `m_nFontHeight = 20` (`:1063`); frame `PaintFrame` (`:1153-1166`): fill ARGB(100,0,0,0), round rect + rect ARGB(255,240,240,240), inner rect ARGB(100,200,200,200).
  - Columns per row (`OnDraw`, `:1168-1325`), x positions with `__CAMPUS` (V15):
    - channel icon at x=20: `m_texPlayerDataIcon` frame `34 + channel - 1` when 1 <= channel <= 10 (`:1199-1201`);
    - status icon at x=76: frame `7 + (state - 2)` where online -> 2, offline -> 8, auto-absent -> `FRS_ABSENT` (`:1203-1218`), i.e. online = frame 7, offline = frame 13;
    - level text at (127, y+3), black `0xff000000` (`:1220-1226`);
    - job icons: type icon at x=174 (master 27..32 by level band, hero 33), job icon at x=194 (`19 + job - 6` pro, `19 + job - 16` master, `19 + job - 24` hero, else `14 + job`) (`:1228-1289`);
    - name at (226, y+3), black, the selected row `0xff6060ff`; names longer than 10 chars cut to 10 + "..." (`:1291-1318`).
    - Icon sheet: `icon\icon_PlayerData.inc` (`WndWorld.cpp:3698`).
  - Offline members are NOT greyed: only the status icon differs.
  - Hover: job-name tooltip over x 188..212 of the first 10 rows (`:1327-1352`; stale x, not moved for `__CAMPUS`).
  - Left click selects (`:1354-1372`). Double click (`:1374-1419`): online -> `g_WndMng.OpenMessage( name )` (the private message window); offline -> chat line `TID_GAME_NOTLOGIN` "That player is not connected.".
  - NO right-click menu (the class has no `OnRButtonUp`, unlike `CWndFriendCtrlEx`).
  - Stock bug: `SetScrollBar` uses the FRIEND count for the range (`:1489-1500`), but `OnSize` uses the guild size (`:1522-1538`).

---

## 5. Other guild UI

- Character window: no guild line in V15 (the "Guild" row is commented out, `_Interface/WndField.cpp:4589`).
- Target / party windows: nothing guild-specific (party control only has `__GUILD_COMBAT_1TO1` hooks).
- Mini-map (`CWndNavigator`, `_Interface/WndField.cpp` ~`9222-9470`): a mover in your guild (`g_pPlayer->m_idGuild && == pMover->m_idGuild`) gets dot index 3 (`:9387-9388`) of `Theme/Default/navigator.inc` -> `ImgNavObj.bmp` (5x5 dots serialized from x=0, so index 3 is at x=15, y=0). Priority: quest NPC (emoticon) > your killer (5) > peaceful NPC (1) > guild member (3) > monster (2) > party member in range (4) > other player (0) (`:9375-9405`). The same index 3 dot is also used for party members outside the object range (`:9515`). Hover over any dot shows the mover's name tooltip. In the siege map the minimap gets `m_GuildCombatTextureMask` over the land tiles (`:9255-9289`).
- Player right-click menu (`CWndWorld::ShowMoverMenu`, `_Interface/WndWorld.cpp:6514-6705`): after Trade / Add messenger / Invite party, adds `MMI_INVITE_COMPANY` (7, `Resource/defineNeuz.h:99`) "Invite to join guild" (`TID_MMI_INVITE_COMPANY`) only if you are in a guild and your title has `PF_INVITATION` in `m_adwPower` (`:6556-6565`). Handler `:5645-5650` -> `CWndWorld::InviteCompany( objid )` (`:11268-11281`): blocked while your guild is entered in a running Guild Siege (`TID_GAME_GUILDCOMBAT_NOT_INVITATION_GUILD` "You can not invite someone to the guild while in Guild Siege.") or while 1:1 siege is not closed (`TID_GAME_GUILDCOMBAT1TO1_NOTINVITEGUILD`), else `g_DPlay.SendGuildInvite( objid )`.
- NPC menu guild entries (`ShowMoverMenu` NPC branch, `:6660-6668`): `MMI_GUILDBANKING` (15) only shown when you have a guild and `ENABLE_GUILD_INVENTORY`. Others: `MMI_RANK_GUILD` (16), `MMI_RANK_WAR` (17), `MMI_RANK_INFO` -> ranking windows (`:5614-5640`); `MMI_GUILDWAR_APP/STATE/CANCEL/JOIN` (26-29) and `MMI_GUILDCOMBAT_*` (30-41) siege NPC; `MMI_GUILDCOMBAT_1TO1_*` (60-69); `MMI_GUILDHOUSE_*` (`:6085-6130`). Menu text = `prj.GetText( TID_MMI_DIALOG + id )`.
- Guild chat radio disabled without a guild (`WndCommunication.cpp:216`).

(Section 6, big systems, follows.)

---

## 6. Big systems

Server toggles for this repo: `Program/WorldServer.ini:11` `GUILDWAR`, `:19` `GUILDBANK`, `:20` `GUILDCOMBAT`, `:21` `GUILDCOMBAT1TO1`, `:22` `ARENA`, `:23` `SECRETROOM` are all ON. They set `g_eLocal` states (`WORLDSERVER/WorldServer.cpp:557-564`: `GUILDBANK` -> `ENABLE_GUILD_INVENTORY`, `GUILDWAR` -> `EVE_GUILDWAR`) that reach the client through `CDPClient::OnSetLocalEvent` (`Neuz/DPClient.cpp:6260-6266`).

### 6.1 Guild war ("guild duel" in the English text) - compiled in, enabled. Size: MEDIUM

How it works for the player:
- Only the master can declare: guild window War tab `CWndGuildTabWar` (`APP_GUILD_TABGUILDWAR`, `_Interface/WndGuildTabWar.cpp`), button `WIDC_BUTTON1` "declare" (master only, `:157-163`; English/Vietnamese use `Theme/ButtGuildDuel.bmp`, `:105-110`) opens `CWndGuildWarDecl` (`APP_GUILD_WAR` 288x144, `_Interface/WndGuildWarDecl.cpp`): enemy guild name (3..MAX_G_NAME-1 chars) + a "war funds" edit that is never sent (`:30-33`, `:80-93`) -> `SendDeclWar( idMaster, szGuild )` `PACKETTYPE_DECL_GUILD_WAR 0xf000b036` (`Neuz/DPClientGuildWar.cpp:29-35`). (Also GM text command `/declwar`, admin only, `FuncTextCmd.cpp:5299`.)
- Core server checks (`CORESERVER/DPCacheSrvr.cpp` `OnDeclWar`): must be master; own guild level >= 6 (`TID_GAME_GUILDWARREQLV6`); not already at war; target exists; target level >= 6 (`TID_GAME_GUILDWAROHTERLV6`); target master online (`TID_GAME_GUILDWARMASTEROFF`); target >= 10 members (`TID_GAME_GUILDWARMEMBER10` "The opposing guild must have at least 10 members."); target not at war. Errors come as defined text.
- The target master receives `PACKETTYPE_DECL_GUILD_WAR` -> `OnDeclWar` (`DPClientGuildWar.cpp:117-129`: `idDecl`, master name) which opens `CWndGuildWarRequest` (`APP_GUILD_WARREQUEST` 288x128): `TID_GAME_GUILDWARREQUEST` "The Guild Leader of %s, %s , declares a Guild duel. Do you Accept?" Yes -> `SendAcptWar( idMaster, idDecl )` `PACKETTYPE_ACPT_GUILD_WAR 0xf000b037`.
- War starts: `PACKETTYPE_ACPT_GUILD_WAR` -> `OnAcptWar` (`:131-177`): builds `CGuildWar` (`_Common/guildwar.h`), sets both guilds' `m_idWar` / `m_idEnemyGuild`, chat `TID_GAME_GUILDWARSTART` "A guild duel has started between %s Guild and %s Guild." (broadcast to everyone who gets the packet). Each member mover gets `SNAPSHOTTYPE_SET_WAR` (`OnSetWar`, `:179-190`) -> `m_idWar` -> the `XI_GEN_PVP_FLAG01` war mark above enemy heads (section 1). On login during a war: `SNAPSHOTTYPE_WAR` -> `OnWar` (`:193-226`): `TID_GAME_GUILDWARSTILL` "A guild duel between %s Guild and %s Guild is in progress." + `TID_GAME_GUILDWARDOING` "You are at war with another guild."
- Enemies can attack each other anywhere PvP is allowed by the war rules (`_Common/MoverAttack.cpp:1873`, `:1977`, `Mover.cpp:5723`, `:6967` check `EVE_GUILDWAR`).
- Kill messages: `PACKETTYPE_WAR_DEAD 0xf000b045` -> `OnWarDead` (`:228-265`): `TID_GAME_GUILDWARDEAD` "A warrior of %s Guild, %s , has been killed." (guild of the dead player, dead player's name); increments that side's `nDead`.
- Give up: War tab `WIDC_BUTTON3` (any member) -> `CWndGuildWarGiveUp` (`APP_GUILD_WARGIVEUP`) Yes -> `SendSurrender( idPlayer )` `PACKETTYPE_SURRENDER 0xf000b047`. Everyone gets `OnSurrender` (`:51-90`): `TID_GAME_GUILDWARGIVEUP` "%s of %s Guild has given up." (note the format args are (guild, player) but the English sentence reads "player of guild": the client passes `pGuild->m_szGuild, sPlayer`, so it prints "<guild> of <player> Guild" - stock text/arg mismatch). Core: the master surrendering, or > 70 % of the side's members, loses the war (`DPCacheSrvr.cpp` `OnSurrender`, `WR_*_SR`).
- Truce (peace): War tab `WIDC_BUTTON2` (master) -> `CWndGuildWarPeace` (`APP_GUILD_WARPEACE`) Yes -> `SendQueryTruce` `PACKETTYPE_QUERY_TRUCE 0xf000b048`; the other master gets `OnQueryTruce` -> `CWndGuildWarPeaceConfirm` (`APP_GUILD_WARPEACECONFIRM`) Yes -> `SendAcptTruce` `PACKETTYPE_ACPT_TRUCE`.
- End: `PACKETTYPE_WAR_END 0xf000b046` -> `OnWarEnd` (`:267-298`: `idWar, nWptDecl, nWptAcpt, nType`) -> `CGuildWarMng::Result` (`_Common/guildwar.cpp:165-...`, client part prints):
  - `WR_*_GN` master killed: `TID_GAME_GUILDWARWIN` "The guild duel between %s and %s has finished. The Guild %s has won. %s." + `TID_GAME_GUILDWARWIN_MASTER` "A Guild Leader has been killed!"
  - `WR_*_SR` surrender: + `TID_GAME_GUILDWARWIN_GIVEUP` "Victory! Opponent guild has conceded."
  - `WR_*_AB` time up, fewer master-absent ticks wins: + `TID_GAME_GUILDWARWIN_TIMEUP` "Victory by default!"
  - `WR_*_DD` time up, fewer deaths wins: + `TID_GAME_GUILDWARWIN_KILLNUM` "Victory due to number of opponents killed!"
  - `WR_TRUCE`: `TID_GAME_GUILDWARPEACE` "%s and %s have agreed to a truce."; `WR_DRAW`: `TID_GAME_GUILDWARDRAW` "The guild duel between %s and %s resulted in a tie."
  - All in white `0xffffffff`.
  - War points: client copies the server's `m_nWinPoint` for both guilds and bumps `m_nWin` / `m_nLose` (`guildwar.cpp` client branch); the formula lives in the core-server branch. Shown in the war tab and the war ranking.
- Duration: `CGuildWar::GetEndTime() = start + 2 h` on main (10 min on internal) (`_Common/guildwar.h:62-64`); the War tab shows the time left `%H:%M:%S` in `WIDC_GUILDWARLEFTTIME` and the enemy logo at `WIDC_CUSTOM1` (`WndGuildTabWar.cpp` OnDraw). The world server sends "master absent" ticks every process while a master is offline (`guildwar.cpp` `CGuildWar::Process`), and at timeout the core decides by absences, then deaths, else draw (`CORESERVER/DPCoreSrvr.cpp:1700-1750`).
- Restrictions during a war (texts): no duels (`TID_GAME_GUILDWARERRORDUEL`), no member management, no disband, no logo change, no invites.
- Name colours: none special (section 1); just the war mark SFX.
- Port size: medium - 5 small dialogs + war tab + 8 packets + chat texts + the head mark; server logic already exists in the C++ servers.

### 6.2 Guild Siege ("Guild Combat", `CGuildCombat`) - compiled in, enabled. Size: LARGE

- NPC `MaFl_GuildWar` (`Resource/character.inc`, UTF-16, around line 3763) menus: `MMI_GUILDWAR_APP` (apply), `MMI_GUILDWAR_STATE` (application status), `MMI_GUILDWAR_JOIN` (enter), `MMI_GUILDCOMBAT_SELECTION` (line-up), `MMI_GUILDCOMBAT_INFO_BOARD1..3` (text boards). Handlers `_Interface/WndWorld.cpp:3936-4150`: apply -> `SendGuildCombatWindow` (`PACKETTYPE_IN_GUILDCOMBAT`); status -> `SendGCRequestStatusWindow` (`PACKETTYPE_REQUEST_STATUS`); cancel -> `CWndGuildWarCancelConfirm`; join -> `CWndGuildWarJoinConfirm`; ranking -> `SendGCPlayerPoint`; line-up -> `SendGCSelectPlayerWindow`; info boards / fee / prize -> `CWndGuildCombatBoard` filled from a per-language text file (`FILE_GUILDCOMBAT_TEXT_1..6`, `_Common/ProjectCmn.h:199-204`, loaded from `Client\` + language file name); prize -> `SendGCGetPenyaGuild` (master only) / best player -> `SendGCGetPenyaPlayer`.
- Server rules `Resource/GuildCombat.txt` (this repo): JOINPENYA 100,000,000; GUILDLEVEL 20; MIN/MAXJOINGUILDSIZE 3/8 guilds; MAXPLAYERLIFE 6; MAXJOINMEMBERSIZE 10; MAXWARPLAYER 5; MAXMAPTIME 10; auto-open `AUTO_OPEN_IDC` day 7 at 18:30; `OPEN` state script (ready message, 60 min no-entry count-down, entry, 7 min open message, war state, 1 min maintenance, 30 min war, close ...).
- States (`_Common/eveschool.h:67-75`): `OPEN_STATE, CLOSE_STATE, WAR_STATE, COMPLET_CLOSE_STATE, GM_COLSE_STATE`; war sub-states `NOTENTER_STATE=100, NOTENTER_COUNT_STATE, ENTER_STATE, MAINTENANCE_STATE, WAR_WAR_STATE, WAR_CLOSE_STATE, WAR_CLOSE_WAIT_STATE, WAR_TELEPORT_STATE`.
- Client packets: one snapshot `SNAPSHOTTYPE_GUILDCOMBAT` with a sub-type byte -> `CDPClient::OnGuildCombat` (`Neuz/DPClient.cpp:6776-6851`): `GC_IN_WINDOW` (opens the offer window - `CWndGuildCombat1to1Offer(0)` in siege mode, `:6853-6898`), `GC_SELECTPLAYER`, `GC_REQUEST_STATUS`, `GC_USERSTATE`, `GC_GUILDSTATUS`, `GC_GUILDPRECEDENCE`, `GC_PLAYERPRECEDENCE`, `GC_SELECTWARPOS` (map entry point), `GC_GCSTATE`, `GC_NEXTTIMESTATE`, `GC_ENTERTIME`, `GC_WINGUILD`, `GC_BESTPLAYER`, `GC_GETPENYAGUILD`, `GC_GETPENYAPLAYER`, `GC_DIAGMESSAGE`, `GC_TELE`, `GC_WARPLAYERLIST`, `GC_ISREQUEST`, `GC_LOG`, `GC_LOG_REALTIME`, `GC_PLAYERPOINT` (handlers `:6853-7850`). Client sends (`DPClient.cpp:9147-9236`): `PACKETTYPE_IN_GUILDCOMBAT` (window / apply with penya), `OUT_GUILDCOMBAT`, `REQUEST_STATUS`, `SELECTPLAYER_GUILDCOMBAT` (list + defender), `SELECTMAP_GUILDCOMBAT`, `JOIN_GUILDCOMBAT`, `GETPENYAGUILD_GUILDCOMBAT`, `GETPENYAPLAYER_GUILDCOMBAT`, `GETITEM_GUILDCOMBAT`, `TELE_GUILDCOMBAT`, `PLAYERPOINT_GUILDCOMBAT`.
- Windows (`_Interface/WndField.h:1341-1830`): `CWndGuildCombatOffer` (`APP_GUILDCOMBAT_OFFER`), `CWndGuildCombatBoard` (`APP_GUILDCOMBAT_BOARD` 384x384), `CWndGuildCombatSelection` (`APP_GUILDCOMBAT_SELECTION` 656x432: pick fighters, order, defender), `CWndGuildCombatState` (`APP_GUILDCOMBAT_OFFERSTATE`), `CWndGuildCombatJoinSelection` (`APP_GUILDCOMBAT_SELSTART`, entry point), `CWndGuildWarAppConfirm` / `CancelConfirm` / `JoinConfirm` (`TID_GAME_GUILDWAR_APP` "Will you register for the Guild Siege?", `TID_GAME_GUILDWAR_CANCEL` "Do you want to withdraw from the Guild Siege?", `TID_GAME_GUILDWAR_JOIN` "Do you join the Guild Siege?"), `CWndGuildWarState` (`APP_GUILD_WAR_STATE`), `CWndGuildCombatRanking` (`APP_GUILDCOMBAT_RANKING`), `CWndGuildCombatResult` with tabs `CWndGuildCombatTabResultRate` / `TabResultLog` (`APP_GUILDCOMBAT_TAB_RESULT*`), `CWndGuildCombatRank_Class` / `Rank_Person` (`APP_GUILDCOMBAT_RANKINGCLASS`, `APP_GUILDCOMBAT_RANK_P`). Window sizes from `Resource/resdata.inc`.
- Arena: world `WI_WORLD_GUILDWAR` 202 (`Resource/defineWorld.h:57`): siege name colours (section 1), minimap mask, HUD drawn in `CWndWorld::OnEraseBkgnd` (`WndWorld.cpp:883-1780`: count-down `m_szGuildCombatStr` + `%.2d:%.2d:%.2d` `:1147-1183`, guild ranking board with own guild `0xFF9ED3FF` / others `0xFFFFFF99` and title colour `0xFFEBAD18` `:1255-1300`, player ranking, defender etc.); guild invites blocked while entered (`InviteCompany`).
- Winners: the winning guild and the best player get the trophy icons beside the head logo between sieges (section 1; `GC_WINGUILD` / `GC_BESTPLAYER` -> `m_uWinGuildId` / `m_uBestPlayer`). The old dragon-cloak button in the bank is hidden since `__VER >= 8` (`WndGuildBank.cpp:151-163`).
- Port: large - about 15 windows, a dozen HUD pieces, about 22 sub-packets, a dedicated map and a timed state machine.

### 6.3 1:1 Guild Siege (`__GUILD_COMBAT_1TO1`) - compiled in (`__VER >= 11`), enabled (`GUILDCOMBAT1TO1`). Size: LARGE (medium if the siege windows exist first)

- NPCs (`Resource/character.inc`): `MaFl_Amos` "1:1 guild combat manager Amos" (apply `MMI_GUILDCOMBAT_1TO1_OFFER`, status `_OFFERSTATE`, entrance `_ENTRANCE`, line-up `_SELECTION`, guides `_GUIDE_ENTRY/_RULE/_WIN`) and `MaFl_Annie` (cancel `_CANCEL`, refund `_REPAYMENT`, prize/fee guides `_GUIDE_PRIZE/_GUIDE_TEX`). Handlers `WndWorld.cpp:4155-4300`.
- Rules `Resource/GuildCombat1TO1.lua`: MinJoinPenya 110,000,000; MinGuildLevel 20; 2..8 guilds; 6..11 players per guild, player level >= 30; PlayerLife 1; line-up time 60 min; entrance wait 10 min; war wait 1 min; each bout 10 min; opens `Sat 17:00`.
- States (`_Common/GuildCombat1to1.h:32-36`): `GC1TO1_CLOSE, _OPEN, _ENTRANCE, _WAR`; bout `GC1TO1WAR_CLOSE=100, _WAIT, _WAR, _FINISH, _CLOSEWAIT`; player `GC1TO1_PLAYER_READY=200, _WAR, _WIN, _LOSE, _DRAW`.
- Packets: client sends `SendGC1to1TenderOpenWnd / Tender(penya) / TenderCancel / TenderFailed / TenderView / MemberLienUpOpenWnd / MemberLienUp(ids) / TeleportToNPC / TeleportToStage` (`DPClient.cpp:16729-16785`); receives `SNAPSHOTTYPE_GC1TO1_TENDEROPENWND / TENDERVIEW / NOWSTATE / MEMBERLINEUPOPENWND / WARRESULT` (`DPClient.cpp:735-741`, handlers `:16786-17027`).
- Windows `_Interface/WndGuildCombat1to1.h`: `CWndGuildCombat1to1Selection` (`APP_GUILDCOMBAT_1TO1_SELECTION` 656x432), `CWndGuildCombat1to1Offer` (`APP_GUILDCOMBAT_1TO1_OFFER` 304x272; reused for the normal siege offer with arg 0), `CWndGuildCombat1to1OfferMessageBox`; status `APP_GUILDCOMBAT_1TO1_OFFERSTATE`. Arenas `WI_WORLD_GUILDWAR1TO1_0..3` (241-244, `defineWorld.h:77-82`); HUD `CWndWorld::DrawGuildCombat1to1Info / PlayerInfo / GuildInfo` (`WndWorld.cpp:2172-2398`).

### 6.4 Guild house (`__GUILD_HOUSE`) - compiled in. Size: LARGE

- Only the small guild house works on main (`WI_GUILDHOUSE_SMALL` 212; middle/large 213/214 exist in code, but buying a middle house is the tender/auction under `__GUILD_HOUSE_MIDDLE`, not on main).
- NPC `MaFl_GUILDHOUSESALE`: `MMI_GUILDHOUSE_CHARGE` (upkeep; needs `PF_GUILDHOUSE_UPKEEP` 0x40, else `TID_GAME_GUILDHOUSE_TAX_LEVEL`; opens `CWndGHUpkeep` with id `APP_CONFIRM_BUY_`), `MMI_GUILDHOUSE_SALE` (buy, `SendBuyGuildHouse`), `MMI_GUILDHOUSE_ENTER` (`SendGuildHouseEnter`, header-only `PACKETTYPE_GUILDHOUSE_ENTER`), `MMI_GUILDHOUSE_OUT` (`SendGuildHouseGoOut`) (`WndWorld.cpp:6084-6135`, `DPClient.cpp:19047-19048`).
- Inside: `CWndGHMainMenu` (`APP_GH_MAIN` 288x112) opens by itself when you enter a guild-house world (`_Common/WorldEnvironment.cpp:60`); buttons: rights (opens the guild window), furniture (`CWndGuildHousing`, `APP_GH_FURNITURE_STORAGE` 448x512), storage (guild bank), teleporter (`CWndGHTeleporter`, `APP_GH_TELEPORTER` 272x208), upkeep (`_Interface/WndGuildHouse.cpp:47-175`). Also `CWndGHouseShowOneUnit` (`APP_GH_SHOWONE`).
- Furniture: items are listed into the house storage, then placed in 3D with the housing deploy manager (`CDeployManager`, `__HOUSING`); at most 200 list-ups, upkeep up to 35 days (`_Common/GuildHouse.h:28-31`); furniture can give stat bonuses (`SetDSTFunriture`). Packets: `SNAPSHOTTYPE_GUILDHOUSE_PACKET` (sub-types `GUILDHOUSE_PCKTTYPE_LISTUP, LISTDROP, SETUP, REMOVE, RESET, REFRESH, UPKEEP, EXPIRED`, `GuildHouse.h:13-22`), `_ALLINFO`, `_REMOVE`, `_RESTPOINT` (`DPClient.cpp:19049-19100`).
- Rest point: `OnRestPoint` sets `GuildHouse->m_nExtraExp = restPoint * 100 / 1,000,000`, shown as an extra exp gauge in the status window (`WndField.cpp:10371`, `:10629`).
- Leaving the guild clears the guild house (`OnSetGuild` -> `GuildHouse->Clear()`, `DPClient.cpp:12711`).

### 6.5 Guild bank - compiled in, enabled (`GUILDBANK` -> `ENABLE_GUILD_INVENTORY`). Size: MEDIUM

- Opened from the bank NPCs `MaFl_Juria`, `MaSa_Helena`, `MaDa_Ollien` menu `MMI_GUILDBANKING` (shown only with a guild and the flag, `WndWorld.cpp:6663-6668`); refused while trade / repair / shop / guild bank is open (`:5537-5562`) -> `SendOpenGuildBankWnd` `PACKETTYPE_GUILD_BANK_WND` (`DPClient.cpp:9681`). Also from the guild-house main menu.
- Server replies `SNAPSHOTTYPE_GUILD_BANK_WND` mode 0 with guild penya + the whole bank container -> `OnGuildBankWindow` opens the inventory and `CWndGuildBank` beside it (`DPClient.cpp:3057-3080`, `WndGuildBank.cpp:136-148`).
- `CWndGuildBank` (`APP_GUILD_BANK`, skin `WndGuildBank.tga` 236x348): item grid tab ("Item"), penya in `WIDC_GUILDBANK_NUM` (`m_nGoldGuild`); button 1 "guild contribution" opens `CWndGuildMerit` (`APP_GUILD_MERIT`; needs a guild name, else `TID_GAME_GUILDNOTHINGNAME`); button 2 "make cloak" (disabled for non-masters, level >= 4, section 2); button `WIDC_LOG` opens `CWndGuildBankLog` (`APP_GUILD_BANK_LOG` 496x304; master or kingpin only, else `TID_GAME_CANNT_USE_GLOG`) with tabs add item / remove item / penya in / penya out (`WndGuildBank.cpp:416-455`); request `SendReqGuildBankLogList( type )` -> `SNAPSHOTTYPE_GUILDLOG_VIEW` (`DPClient.cpp:17060`, `:744`).
- Put: drag from the inventory -> `SendPutItemGuildBank( slot, num, mode 1 )` (`PACKETTYPE_PUTITEMGUILDBANK`). Take: drag into the inventory -> needs `PF_ITEM` (0x10) for items / `PF_PENYA` (0x08) for penya (`_Common/guild.h:325-327`, `WndField.cpp:2034-2100`) -> `SendGetItemGuildBank` (`PACKETTYPE_GETITEMGUILDBANK`). Updates `SNAPSHOTTYPE_PUTITEMGUILDBANK / GETITEMGUILDBANK / REMOVE_GUILD_BANK_ITEM` (`DPClient.cpp:2890-2950`, `:16158`).
- Rights are per title (`m_adwPower[5]`; titles master / kingpin / captain / supporter / rookie; flags `PF_MEMBERLEVEL 1, PF_LEVEL 2, PF_INVITATION 4, PF_PENYA 8, PF_ITEM 0x10, PF_GUILDHOUSE_FURNITURE 0x20, PF_GUILDHOUSE_UPKEEP 0x40`, `guild.h:38-46`).

### 6.6 Guild quests (`_Common/guildquest.cpp`) - compiled in but effectively OFF on this server. Size: SMALL

- Only one quest in `Resource/propGuildQuest.inc`: `QUEST_WARMON_LV1` (Clockworks boss `MI_CLOCKWORK1`, level 70, Madrigal region), started from NPC dialog script (`WORLDDIALOG/NpcScript.cpp:1391`, `:1978-1990`, `:2058`) only on a "Wormon server" - `WORMON` is commented out in `Program/WorldServer.ini:18`.
- Client side is state only: `SNAPSHOTTYPE_SETGUILDQUEST` / `REMOVEGUILDQUEST` -> `CGuild::SetQuest / RemoveQuest` (`DPClient.cpp:8414-8445`); while it runs, member kick / disband are blocked (`WndGuildTabInfo.cpp:598`, `WndGuildTabMember.cpp:636`). No window of its own.

### 6.7 Guild votes (`__GUILDVOTE`) - NOT compiled for main. Size: skip (small if ever wanted)

- `CWndGuildVote` (`APP_GUILD_VOTE`) / `CWndGuildVoteSeting` (`APP_GUILD_VOTESETING`) exist (`_Interface/WndGuildVote.*`) but the applet registration is inside `#ifdef __GUILDVOTE` (`FuncApplet.cpp:247-248`), defined only for INTERNAL/TEST. Packets `SendAddVote / RemoveVote / CloseVote / CastVote` (`DPClient.cpp:14526-14590`) and `SNAPSHOTTYPE_GUILD_ADDVOTE / MODIFYVOTE` handlers exist but nothing in the main UI reaches them.

### 6.8 Guild ranking windows - compiled in. Size: SMALL-MEDIUM

- Same NPCs as the bank: `MMI_RANK_GUILD` -> `CWndRankGuild` (`APP_RANK_GUILD` 464x384; tabs `TID_GAME_TOOLTIP_RANKBEST` / `RANKUNITED` (cohesion) / `RANKPENYA`: `CWndRankTabBest`, `CWndRankTabUnited`, `CWndRankTabPenya`, `_Interface/WndRankGuild.cpp:603-660`), `MMI_RANK_WAR` -> `CWndRankWar` (tabs win / lose / give-up, `WndRankWar.cpp`), `MMI_RANK_INFO` -> `CWndRankInfo` (tabs level / play time, `WndRankInfo.cpp`) (`WndWorld.cpp:5614-5640`).
- Each one opens and sends `SendGuildRank( CGuildRank::m_Version )` `PACKETTYPE_REQUEST_GUILD_RANKING` (`DPClient.cpp:13239-13244`); the reply with the same packet id -> `CGuildRank::Instance()->Serialize` (`:13478-13481`). Lists `R1..R8` = strongest, most wins, most losses, most surrenders, cohesion, funds, average level, play time (`_Common/guild.h:437-448`).
- Row drawing (`WndRankGuild.cpp:22-110`): 10 rows from `m_nCurrentList` (mouse-wheel scroll), x = 8 plus: rank medal from `m_texMsgIcon` frame 49..53 (1st, 2-3, 4-7, 8-12, rest), rank number +20, logo, guild name +72, master name +210, "win / lose" `%5d  /  %5d` +330; text black; y starts at 32.

### 6.9 Not asked, but guild-based and compiled
- Secret Room (`__SECRET_ROOM`, `__VER >= 12`; `SECRETROOM` is on in WorldServer.ini): guild tender per continent, HUD `CWndWorld::DrawSecretRoomInfo` (`WndWorld.cpp:1780-2170`), windows in `_Interface/WndSecretRoom.cpp`. Large; a separate topic.

---

## 7. Size verdicts (summary)

| system | compiled on V15 main | enabled on this server | port size |
|---|---|---|---|
| Name + logo above heads, siege trophies, war mark | yes | - | small |
| Guild cloaks (20 logo cloak items + models) | yes | yes (needs GUILDBANK) | small (data/convert only) |
| Guild chat + system messages | yes | - | small |
| Messenger Guild tab | yes (`__VER >= 11`) | - | small |
| Guild war (guild duel) | yes | yes (`GUILDWAR`) | medium |
| Guild Siege | yes | yes (`GUILDCOMBAT`) | large |
| 1:1 Guild Siege | yes (`__VER >= 11`) | yes (`GUILDCOMBAT1TO1`) | large (medium after the siege) |
| Guild house (small only) | yes (`__GUILD_HOUSE`) | yes | large |
| Guild bank + log + contribution | yes | yes (`GUILDBANK`) | medium |
| Guild quests | yes | no (WORMON off) | small (can skip) |
| Guild votes | NO (`__GUILDVOTE` internal/test only) | - | skip |
| Guild ranking windows | yes | yes | small-medium |

## 8. Stock quirks worth copying or knowingly fixing
- Promote/demote text is built but never shown (`DPClient.cpp:12890-12901`).
- Guild war "given up" message prints guild and player in swapped places (`DPClientGuildWar.cpp:90`, text "%s of %s Guild has given up.").
- Messenger guild list scroll range uses the friend count (`WndMessengerCtrl.cpp:1489-1500`).
- Guild master's guild line is yellow but the master's NAME is not coloured.
- The logo above the head is opaque (DESTBLEND ZERO), black areas stay black.
- `CMover::GetGuild()` for movers of OTHER guilds just returns the guild by id without a membership check (`Mover.cpp:8155-8158`).
