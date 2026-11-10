# V15 guild: research (2026-11-10)

The owner asked: "research about guild and how it works from original v15 client and online. implement it in the web and
also make a mobile responsive window version for mobile."

This note is the summary and the build decisions. The detail, with a file:line for every fact, is in five appendices:

| Appendix | What |
|---|---|
| [a-windows.md](2026-11-10-guild-research/a-windows.md) | every guild window of Neuz: layout (resdata.inc control tables), filling, buttons, checks and texts, how each opens, pictures |
| [b-packets.md](2026-11-10-guild-research/b-packets.md) | every guild packet both ways (ids, byte layouts), the core/world routing, the server's checks and replies, login order, rules and tables |
| [c-world-extras.md](2026-11-10-guild-research/c-world-extras.md) | the guild in the world (name and logo above heads, cloak, chat, Messenger tab, minimap) and the big systems (war, siege, 1:1 siege, house, bank, quests, votes, ranking) with size verdicts |
| [d-flyffweb.md](2026-11-10-guild-research/d-flyffweb.md) | what FlyffWeb has today and how a feature is wired end to end; the phone patterns to reuse |
| [e-online.md](2026-11-10-guild-research/e-online.md) | wiki and guide facts (late classic era, not dated to V15); where they differ from the code, the code wins |

Sources: the Neuz source (`Source/`, CP949, read with `iconv -f cp949 -t utf-8`), the servers' source (`Source/WORLDSERVER`,
`CORESERVER`, `CACHESERVER`, `databaseserver`), the resources (`Resource/resdata.inc`, `ResData.h`, `textClient.inc` +
`textClient.txt.txt`, `expTable.inc`, `defineItem.h`, `propItem.txt`, `mdlDyna.inc`, `character.inc`), and online pages
(appendix E). Line numbers are those of the files in `Source/` and `Resource/`.

## 1. Build flags

The client is `__VER 15`, `__MAINSERVER` (`Neuz/VersionCommon.h:3-4`). Most guild code is gated by `#if __VER >= N`, so
the commented `#define`s at the top of `VersionCommon.h` (`__CSC_VER11_4`, `__GUILD_COMBAT_1TO1`, `__GUILD_BANK_LOG` ...) are
active through `__VER`. Two are **off** on the main server: `__GUILDVOTE` (guild votes: only in the internal and test blocks,
`VersionCommon.h:269, :412`) and `__GUILD_HOUSE_MIDDLE` (guild-house auctions, `:398, :462`). `__GUILD_HOUSE` is on
(`:205`). `__XCLOAK` (custom cloak textures) is never defined. The only custom feature that touches guilds is
`__BB_STAFF_MODERATOR_AUTH` (an invite refusal on the server, `WORLDSERVER/DPSrvr.cpp:7831-7837`); left out as the owner asked.

## 2. The guild's life

### 2.1 Creating

- There is **no creation window** in Neuz, and `CDPClient::SendCreateGuild` goes nowhere (no server handler,
  [B §0](2026-11-10-guild-research/b-packets.md)). A guild is made by the NPC **MaSa_Helena** (Saint Morning) through her
  dialogue (`WORLDDIALOG/NpcScript.cpp:10912-10971`): quest `QUEST_CREGUILD` (142, levels 40-129) finished, **3,000,000
  penya**, the player is **party leader** of a party of **at least 3**, every member online, in no guild and not under the
  48-hour wait (`_Common/ScriptLib.cpp:738-837`). The guild is created **with an empty name**; the leader is Master, the
  others Rookies, the Master's rights 0xFF and every other rank's 0.
- The browser already plays NPC dialogues and quests (Piece 7 M0/M1), so creation needs nothing new on the client: the
  server sends `CREATE_GUILD`, `SET_GUILD` and `GUILD` (§4).
- The Master then names it **once** from the guild window's Information tab, "Setup Guild Name" (only while the name is
  empty, `_Interface/WndGuildTabInfo.cpp:534-550`) -> `CWndGuildName` (`APP_GUILDNAME`, 272 x 128) -> `GUILD_SETNAME`. Name
  rules (`WndGuildName.cpp:84-149`): trimmed, 3-32 bytes (the English text `TID_DIAG_0011` says "6 to 18"), not starting
  with a digit, letters and digits only, not in the word filter. Later renames need the scroll `II_SYS_SYS_SCR_GCHANAM`
  (10463) -> `QUERYSETGUILDNAME`.

### 2.2 Inviting and joining

- The player menu (right click on a player within 20 m) gets **"Invite to join guild"** (`MMI_INVITE_COMPANY` 7) after
  Trade, Add to my list, Invite to party, **only if I am in a guild and my rank has `PF_INVITATION`**
  (`_Interface/WndWorld.cpp:6556-6565`). It sends `GUILD_INVITE` with the target's object id (`:11268-11281`); the Guild
  Siege refusals before it are siege-only (out of scope).
- The world server checks (`WORLDSERVER/DPSrvr.cpp:7794-7867`) and answers the inviter with a line ("You invited %s to your
  guild.", "%s is already in a guild.", "You are not authorized to do this." ...).
- The invited player gets `GUILD_INVITE` (snapshot) and sees `CWndGuildConfirm` (`APP_GUILD_INVATE` 347, 240 x 144,
  `WndTile08.tga`, centred across, 70 px from the top): the guild name, "Guild is inviting you.", "Will you join the Guild?",
  YES / NO (`WndGuild.cpp:182-252`). YES sends `ADD_GUILD_MEMBER` (inviter, my id); **NO sends nothing** (the
  `IGNORE_GUILD_INVITE` sender is never called).
- The core checks the 48-hour wait, the guild's size against its level's limit, and so on
  ([B §1.1 #6](2026-11-10-guild-research/b-packets.md)). The new member gets the whole guild (`GUILD`), the others
  `ADD_GUILD_MEMBER` ("%s has joined the guild."), and everyone in view `SET_GUILD` ("You have joined the %s guild." for the
  joiner, with the music `BGM_IN_COMPANY`).

### 2.3 Leaving, kicking, disbanding, handing over

- The Member tab's right-click menu has "Leave Guild" (`MGI_GUILD_LEAVE`): it removes **the selected member** (myself =
  leave, someone else = kick), with **no confirm window** (`WndGuildTabMember.cpp:634-660`). Only the Master may kick; the
  Master cannot leave (core, `CORESERVER/DPCacheSrvr.cpp:1357-1439`). Everyone gets `REMOVE_GUILD_MEMBER` ("%s has left the
  guild."), the removed player `SET_GUILD 0` ("You are no longer a member of the %s guild."), a 48-hour wait and the loss
  of his guild cloaks.
- Disband: Information tab "Disband Guild" (Master only) -> `CWndGuildDisMiss` (`APP_GUILD_DISMISS`, 288 x 128) YES ->
  `DESTROY_GUILD`. Everyone on the world gets `DESTROY_GUILD`; members see "%s has disbanded the %s guild.".
- "Change of Guild Leader." (Master only, target online) -> `CHG_MASTER`; the old Master becomes a Rookie.

### 2.4 Ranks, classes, rights, titles

| Rank (`Resource/defineJob.h:146-150`) | Value | Most members (`_Common/guild.h:32-36`) | Icon (`icon_PlayerData` frame) |
|---|---|---|---|
| Master | 0 | 1 | 44 |
| Kingpin | 1 | 5 | 45 |
| Captain | 2 | 10 | 46 |
| Supporter | 3 | 20 | 47 |
| Rookie | 4 | the guild's limit | 48 |

- A member also has a **class** 0-2 inside his rank, drawn as 1-3 copies of the rank icon (`WndGuildTabMember.cpp:266-337`).
- Rights per rank, 5 DWORDs (`guild.h:38-45`): `PF_MEMBERLEVEL` 0x01 (promote/demote), `PF_LEVEL` 0x02 (class up/down),
  `PF_INVITATION` 0x04, `PF_PENYA` 0x08 and `PF_ITEM` 0x10 (take from the guild bank), `PF_GUILDHOUSE_FURNITURE` 0x20 and
  `PF_GUILDHOUSE_UPKEEP` 0x40. The Master edits them in the Title tab (the first five) and the Permissions tab (the guild
  house's two); both send `GUILD_AUTHORITY` with all five DWORDs.
- Kick, disband, name, nickname, logo, cloak, rights, salary and the hand-over are the Master's only, whatever the bits.
- The member menu: Promote Member, Demote Member, Class Up, Class Down, Create Nickname, Leave Guild, and for the Master
  Change of Guild Leader. Every line is shown to everyone; the server refuses with a line.
- "Create Nickname" (Master, guild level 10+) opens `CWndGuildNickName` (`APP_GUILD_NICKNAME`, 272 x 128): 2-12 bytes ->
  `GUILD_NICKNAME`; the nickname shows in the Member tab's Alias column.
- Salary per rank ("Pay"): `CWndGuildPayConfirm` (`APP_GUILD_PAYCONFIRM`, 288 x 144), digits, 0-999,999 -> `GUILD_PENYA`;
  paid daily from the guild fund (`_Common/guild.cpp:1083-1129`).

### 2.5 Level, contribution, member limit

- The table is `expCompanyTest` in `Resource/expTable.inc:477-530` (50 levels; the full table is in
  [B §4.3](2026-11-10-guild-research/b-packets.md)): to reach level N the guild needs both the points and the penya of row N,
  and row N gives the member limit (30 at level 1, 80 at 50).
- Points come only from **gems** (`IK3_GEM`, `(itemLV + 1) / 2` each); penya from any amount the player has. Both are
  given in `CWndGuildMerit` (`APP_GUILD_MERIT1`, 272 x 224), which opens **only from the guild bank window**
  (`WndGuildBank.cpp:313-332`) -> `NW_GUILDCONTRIBUTION`. A guild with no name yet refuses ("Unable to make a contribution.
  Ask your Guild Leader to set the guild name first.").
- The result arrives as `GUILD_CONTRIBUTION`: level, fund, points and the member's totals; a new level prints "Guild level
  has increased.". The Information tab shows the points (Exp) and the fund (Penya); the member list's tooltip shows each
  member's points and penya.

### 2.6 Notice, logo, cloak

- Notice: `CWndGuildNotice` (`APP_GUILD_NOTICE`, 320 x 240, Master only in the UI): a multi-line box, New / Open / Modify,
  under 128 bytes -> `NW_GUILDNOTICE`. Members get `GUILD_NOTICE` and the line "A new Guild Notice has been posted. Please
  check it in the guild window.".
- Logo: `CWndGuildSetLogo` (`APP_GUILD_SETLOGO`, 208 x 240): a 5 x 4 grid of the 20 player logos
  (`Icon_CloakSLogo01..20.jpg`, 24 x 24; 21-27 are GM logos) -> `NW_GUILDLOGO`. Master, guild level 2+, not at war,
  **once only**. Everyone gets `GUILD_LOGO`.
- Cloak: **no texture swap**. Each logo has its own cloak item `II_ARM_S_CLO_CLO_SYSCLOAK01..20` (4602-4621) with its own
  model (`Part_{male,female}CloakSLogoNN.o3d`), the logo painted in its texture (`Resource/mdlDyna.inc:3024-3045`). The
  Master makes one in the guild bank ("make cloak", guild level 4+, 10,000 penya from the fund, `WORLDSERVER/DPSrvr.cpp:
  11492-11586`); it lands in the guild bank. The custom cloak texture path (`CT%06d.jpg`) is dead in a release build
  (`_Common/GuildRender.cpp:37-41`). So the browser draws a guild cloak like any other cloak, already today.

## 3. The windows

| Class | Id | Size, frame | Opened by |
|---|---|---|---|
| `CWndGuild` (5 tabs) | `APP_GUILD` 323 | 448 x 368, `WndTile07.tga` | Start menu (Community > Guild), key **G**, an applet shortcut |
| tab Information `CWndGuildTabInfo` | 325 | 404 x 300 | tab 0 |
| tab Member `CWndGuildTabMember` (sortable) | `APP_GUILD_TABMEMBER_EX` 698 | 404 x 300 | tab 1 |
| tab Title `CWndGuildTabApp` (rights + pay) | 329 | 404 x 304 | tab 2 |
| tab Guild Duel `CWndGuildTabWar` | 343 | 404 x 300 | tab 3 |
| tab Permissions `CWndGuildTabPower` (guild house) | 864 | 404 x 304 | tab 4 |
| invite `CWndGuildConfirm` | 347 | 240 x 144, `WndTile08` | `GUILD_INVITE` |
| name `CWndGuildName` | 345 | 272 x 128, `WndTile06` | Info tab, rename scroll |
| nickname `CWndGuildNickName` | 349 | 272 x 128, `WndTile08` | member menu |
| notice `CWndGuildNotice` | 313 | 320 x 240, `WndTile07` | Info tab |
| logo `CWndGuildSetLogo` | 315 | 208 x 240 (208 x 208 for a player), `WndTile07` | Info tab |
| disband `CWndGuildDisMiss` | 332 | 288 x 128, `WndTile08` | Info tab |
| salary `CWndGuildPayConfirm` | 338 | 288 x 144, `WndTile08` | Title tab |
| contribution `CWndGuildMerit` | 579 | 272 x 224, `WndTile00` | guild bank |
| guild bank `CWndGuildBank` | 336 | 236 x 348, `WndGuildBank.tga` | NPC menu "Guild Warehouse" |
| ranking `CWndRankGuild` (3 tabs) | 378 | 464 x 384 | NPC menu "Guild Ranking" |

The window opens even without a guild (every tab blank). The Information tab's buttons do nothing for a non-Master (no
message). The Member list is owner-drawn: 14 rows of 18 px, columns rank icons / job type / job / level / name / alias,
offline members grey with red-tinted job icons, sortable by the five header pictures; right click for the member menu.
Layouts, every control rect, picture and text: [A §2 and Appendix A](2026-11-10-guild-research/a-windows.md).

## 4. Packets

Core guild messages reach the client as **ordinary top-level packets** (the cache server only strips the DPID); world guild
messages are **snapshots** inside SNAPSHOT/JOIN. Strings are an int32 length and the bytes. Full layouts:
[B](2026-11-10-guild-research/b-packets.md).

- **Sent** (to the core unless noted): `GUILD_SETNAME` 0xf000b032, `QUERYSETGUILDNAME` 0x10 (world), `GUILD_INVITE`
  0xffffff35 (world), `ADD_GUILD_MEMBER` 0xffffff33, `REMOVE_GUILD_MEMBER` 0xffffff34, `DESTROY_GUILD` 0xffffff32,
  `GUILD_MEMBER_LEVEL` 0xffffff3a, `GUILD_CLASS` 0xffffff74, `GUILD_NICKNAME` 0xffffff75, `CHG_MASTER` 0xf000f000,
  `GUILD_AUTHORITY` 0xf000b026, `GUILD_PENYA` 0xf000b027, `NW_GUILDLOGO` 0xf000b010, `NW_GUILDCONTRIBUTION` 0xf000b011,
  `NW_GUILDNOTICE` 0xf000b012 (the last three to the world, which forwards), `QUERY_PLAYER_DATA2` 0xf000f807 (the members'
  data after `GUILD`), guild chat as the chat line `/g text`.
- **Received, core**: `GUILD` 0xffffff30, `ADD_GUILD_MEMBER`, `REMOVE_GUILD_MEMBER`, `GUILD_CHAT` 0xffffff39 (already read),
  `GUILD_MEMBER_LEVEL`, `GUILD_CLASS`, `GUILD_NICKNAME`, `CHG_MASTER`, `GUILD_GAMELOGIN` 0xf000b029 and `GUILD_GAMEJOIN`
  0xf000b030 (no effect in V15: online state comes from the player data), `GUILD_SETNAME`, `GUILD_ERROR` 0xf000b035,
  `GUILD_MSG_CONTROL` 0xf000b023 (no handler), and the core's DEFINEDTEXT refusals.
- **Received, world snapshots**: `GUILD_INVITE` 0x9a, `SET_GUILD` 0x9b, `CREATE_GUILD` 0x9c, `DESTROY_GUILD` 0x9d, `GUILD`
  0x9e, `ALL_GUILDS` 0x9f (every guild's short form + the ranking tables), `GUILD_LOGO` 0xfb, `GUILD_CONTRIBUTION` 0xfc,
  `GUILD_NOTICE` 0xfd, `GUILD_AUTHORITY` 0xfe, `GUILD_PENYA` 0xff, `GUILD_REAL_PENYA` 0xd5, `SET_WAR` 0x7a, `WAR` 0xda.
- **At log-in**, inside the JOIN bundle after the own ADD_OBJ: `ALL_GUILDS`, then `GUILD` (when in a guild), then `WAR`
  (when at war). Other players' guild ids are in ADD_OBJ (`m_idGuild`, `m_idWar` behind a flag byte, then
  `m_idGuildCloak`); later changes come as `SET_GUILD` / `SET_WAR`. A guild id is turned into a name and logo through the
  table `ALL_GUILDS` filled (kept up to date by the all-player broadcasts `CREATE_GUILD`, `DESTROY_GUILD`, `GUILD_SETNAME`,
  `GUILD_LOGO`).

The gateway relays every packet unchanged and the servers need nothing new: **no server or gateway change**.

## 5. In the world

- **Above heads** (`_Common/MoverRender.cpp:1484-1660`): the guild name on its own line, no brackets, 12 px above the
  player's name (`vOut.y - 32` against `- 20`), centred, same font (Verdana 9, 2 px outline #3C3C3C); white, the Master's
  light yellow 0xFFFFFF99 (the siege colours are siege-only). The 24 x 24 logo, opaque, left of the wider of the two lines,
  its top at `vOut.y - 29`. Hidden with the name options; no option of its own.
- **Guild chat**: `/g text` as a chat line (already in FlyffWeb); received `GUILD_CHAT` prints `[name] text` in 0xffffbaff
  (already in FlyffWeb) and shows a guild balloon over the speaker in view (`texDialogBoxGuild.inc`). The chat's Guild
  radio is enabled only in a guild (`WndCommunication.cpp:216`).
- **Guild lines in the chat**: the table in [C §3](2026-11-10-guild-research/c-world-extras.md) (created, disbanded,
  joined, left, a member joined/left, new master, level up, notice, rights, salary, rename, errors). The promote/demote line
  is built but never shown (a stock bug kept).
- **Messenger's Guild tab** (`CWndGuildCtrlEx`, `WndMessengerCtrl.cpp:1060-1640`): the guild's members with channel,
  online state, level, job and name, sorted by state; double click an online member opens a private message, an offline
  one prints "That player is not connected."; no right-click menu.
- **Minimap**: a guild member is dot 3 of `ImgNavObj.bmp` (`WndField.cpp:9387-9388`).
- The Character window has no guild line in V15 (`WndField.cpp:3172-3178`).

## 6. The big systems

| System | On V15 main | Size | Plan |
|---|---|---|---|
| Guild war ("guild duel") | yes (`GUILDWAR`) | medium | later milestone: 5 small dialogs, the War tab's buttons, 8 packets, the war mark above enemies |
| Guild bank (+ contribution, cloak, log) | yes (`GUILDBANK`) | medium | this branch if time allows, else the next milestone |
| Guild ranking windows | yes | small-medium | later: 3 windows from the bank NPCs, the ranking is already in `ALL_GUILDS` |
| Guild Siege | yes (`GUILDCOMBAT`) | large | later, its own piece |
| 1:1 Guild Siege | yes (`GUILDCOMBAT1TO1`) | large | after the siege |
| Guild house (small only) | yes (`__GUILD_HOUSE`) | large | later, its own piece |
| Guild quests | yes, but off on this server (`WORMON` commented) | small | skip |
| Guild votes | **no** | - | skip |

How each works: [C §6](2026-11-10-guild-research/c-world-extras.md) and [B §5](2026-11-10-guild-research/b-packets.md).

## 7. Online

The wikis (appendix E) agree with the code on Helena, level 40, 3,000,000 penya, a party of 3, the 48-hour rule, the
level/penya/member table (identical to `expCompanyTest`), the five ranks, the rights grid (Title, Rank, Join, Penya, Items,
Pay), the Information tab's buttons, the logo set once, cloaks made in the guild warehouse, the nickname at guild level 10.
They disagree with the code on the logo's level (the wiki says 4; the code says 2, `CORESERVER/DPCoreSrvr.cpp:1867-1907`)
and they describe later Guild Siege numbers. No V15 screenshot or video was found.

## 8. What FlyffWeb has today ([D](2026-11-10-guild-research/d-flyffweb.md))

- ADD_OBJ reads the guild fields and drops them (`packages/protocol/src/world/addObj.ts:109-113, :134`); the lobby's
  `guildId` goes back in JOIN and enables the desktop chat's Guild tab once.
- Guild chat works both ways as text (`hud/chatSend.ts:234`, `messages/world.ts:361`). The phone chat's Guild view sends
  no `/g` and is never enabled or disabled.
- The Messenger draws an empty Guild tab (`hud/friends/messengerWindow.ts:174`).
- The player menu has no guild entry; the NPC menu hides "Guild Warehouse" (`hud/moverMenu.ts:69-70`).
- The applet table knows `APP_GUILD` (`hud/applets.ts:63`), but the Start menu and the task bar do not open it.
- Name tags have one line; no logo pictures are converted (the 27 `Icon_CloakSLogo*.jpg` are JPEG, which the converter does
  not decode, `tools/convert/src/ui/uiStage.ts:48, :458-466`).
- The cloak needs nothing (§2.6). The player data center (`party/playerData.ts`) already reads member data.

## 9. Build decisions

1. **Core guild in this branch**: the packets (protocol + testkit writers); a guild book (every guild's name/logo, my
   guild in full); the guild window with its five tabs as Neuz lays them out, opened from the Start menu (a "Guild" line
   after Party, as the Messenger got one), key G and applet shortcuts; the invite entry in the player menu and the invite
   window; the name, nickname, notice, logo, disband and salary windows; the member menu; rights; the guild lines in the
   chat; the guild name and logo above heads; the Messenger's Guild tab; the phone chat's Guild view; the phone layout.
2. **The War tab** shows its data (enemy guild, won, lost, given up, time left, the enemy's logo), but its three buttons
   open the war dialogs, which come with the guild-war milestone; until then they stay disabled.
3. **The Permissions tab** (guild-house rights) is built: it is a tab of the window and sends the same packet as the Title
   tab. Both tabs read and write one rights array (the stock client keeps two copies that overwrite each other: a bug not
   copied).
4. **Logos**: the 27 JPEG logos are 24 x 24 pictures the converter cannot decode. Rather than a new dependency, the
   converter's UI stage copies them as they are (`ui/logo/icon_cloakslogoNN.jpg`), and the browser draws them as images
   (opaque, as Neuz). Command for the owner in the checkpoint.
5. **The guild bank and contribution** come last in this branch, if time allows; otherwise the next milestone.
6. Stock bugs kept where they are visible behaviour (the never-shown promote line, NO sending nothing, the member list
   losing its sort on refresh is **not** kept: it re-sorts, a harmless improvement noted in the code).
