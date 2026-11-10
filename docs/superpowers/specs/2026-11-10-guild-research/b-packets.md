# FlyFF V15 guild protocol and server rules (for a TypeScript client port)

Status: complete (2026-11-10). Research only; no source changed.

Counts: client->server, section 1: **20 distinct packet types** in rows #1-#21 (`PACKETTYPE_CHAT` serves both `/g` and
`/guildinvite`; #1 CREATE_GUILD is dead, #5 IGNORE has no caller) + **4 vote types dead on main** (#22).
Server->client, section 2: **14 top-level (core) types** + 6 war types, and **22 snapshot (world) types**
(of which `GUILD_CHANGEJOBLEVEL` is not compiled in V15 and the 2 vote snapshots are unreachable).
War / siege / 1:1 / bank / house / quest ids are listed in section 5.

Surprises (details in the sections):
1. Core packets have no wrapper: the cache strips the leading DPID and the client sees `[DWORD type][payload]`
   exactly like a world packet; world data rides inside `PACKETTYPE_SNAPSHOT` (0).
2. `SendCreateGuild` is dead; guilds are made by NPC MaSa_Helena (quest 142, 3 000 000 penya, party >= 3) with an
   **empty name**, and the master names it once afterwards with `GUILD_SETNAME` (4.1, 1.1 #2).
3. Refusing an invite sends nothing (no caller of `SendIgnoreGuildInvite`) (1.2).
4. Many checks are master-only rather than rights-based (kick, nickname, logo, salary, authority); the notice has no
   server-side rank check at all (1.1 #17); the authority array is not validated (#13); salary `dwType` is not range-checked (#14).
5. The "promoted/demoted" text is built but never printed (2.2); online status of members in V15 comes from PlayerData,
   not from `GUILD_GAMELOGIN`/`GUILD_GAMEJOIN` (their V15 bodies are no-ops) (3.1).
6. Contributing penya to a guild that has no name yet loses the penya (world takes it, core drops the update) (1.1 #16).
7. No PXP (skill-exp) contribution in V15: "points" come only from gems; level-up needs both points and fund (4.3).
8. Guild votes are compiled out on main; guild-house tender is compiled out; everything else (war, siege, 1:1, bank,
   house, quests) is compiled in and switched on by `Program/WorldServer.ini` tokens (4.7, 5).
9. The world snapshot carries a FlyffWeb TOC after the counted messages (0), usable to skip unknown snapshot types.

Paths below are relative to `Source/` unless they start with `Resource/`. Line numbers are of the
original CP949 files (iconv keeps them). Build: `__VER 15`, `__MAINSERVER` (`Neuz/VersionCommon.h:3-4`,
same in `WORLDSERVER/`, `CORESERVER/`, `CACHESERVER/`, `databaseserver/` VersionCommon.h).

Notation: all integers little-endian. `u_long`/`DWORD`/`OBJID`/`int`/`LONG` = 4 bytes, `short`/`WORD` = 2,
`BYTE` = 1. **String (`ar.WriteString`) = `int32 len` + `len` bytes, no NUL, MBCS (CP949/locale codepage)**
(`_Network/Misc/Src/ar.cpp:81-86`). Reader `ReadString(buf, n)` (`ar.cpp:99-119`): if `len > n-1` or `len < 0`
the whole rest of the message is discarded (cursor jumps to end) -- so oversize strings silently kill the
remaining fields.

---------------------------------------------------------------------------------------------------------

## 0. Framing: how world and core packets reach the client

### Client -> cache (outgoing)
Every client sender uses `BEFORESENDSOLE( ar, PACKETTYPE_X, DPID_UNKNOWN )` (`_Network/Net/Include/dpmng.h:31-34`):
body = `DWORD dpid (DPID_UNKNOWN = 0xFFFFFFFF)` + `DWORD packetType` + payload. (The outer CRC/length
socket header of the CDPMng layer is the same for every packet and is not covered here.)

The cache server routes by packet type (`CACHESERVER/DPCacheSrvr.cpp:74-145`):
* It overwrites the first 4 bytes with the player's serial and forwards the whole buffer.
* These types go to the **core server** (`DPCacheSrvr.cpp:104-139`): ADDPARTYMEMBER .. PARTYCHANGELEADER,
  friends, and the guild ones: `DESTROY_GUILD 0xffffff32`, `ADD_GUILD_MEMBER 0xffffff33`,
  `REMOVE_GUILD_MEMBER 0xffffff34`, `GUILD_MEMBER_LEVEL 0xffffff3a`, `GUILD_AUTHORITY 0xf000b026`,
  `GUILD_PENYA 0xf000b027`, `GUILD_SETNAME 0xf000b032`, `GUILD_CLASS 0xffffff74`, `GUILD_NICKNAME 0xffffff75`,
  `DECL_GUILD_WAR 0xf000b036`, `ACPT_GUILD_WAR 0xf000b037`, `SURRENDER 0xf000b047`, `QUERY_TRUCE 0xf000b048`,
  `ACPT_TRUCE 0xf000b049`, `CHG_MASTER 0xf000f000`, `SENDTAG 0xf000b007`; the four `NC_*VOTE` only
  `#ifdef __GUILDVOTE` -- **not defined for the main-server cache build** (`CACHESERVER/VersionCommon.h:32,36`
  are in the internal/test branches), so on main they go to the world server, which has no handler.
* **Everything else goes to the world server** the player is on (`g_DPClientArray.SendToServer`).
  `PACKETTYPE_CREATE_GUILD 0xffffff31` is not on the core list and the world server has no handler for it
  (no `ON_MSG(PACKETTYPE_CREATE_GUILD)` in `WORLDSERVER/DPSrvr.cpp`), so **`CDPClient::SendCreateGuild` is
  dead** -- guilds are created only by the NPC dialog (see 4.1).

### Server -> client (incoming)
Both server types send to the cache as `[DPID dpidUser][DWORD type][payload]`. The cache strips the first
DPID and sends `[DWORD type][payload]` unchanged to the client:
* from core: `CACHESERVER/DPCoreClient.cpp:48-90` (`g_DPCacheSrvr.Send( lpBuf, uBufSize, dpidUser )`,
  `dpidUser` may be `DPID_ALLPLAYERS` = broadcast to every client of that cache);
* from world: `CACHESERVER/DPClient.cpp:55-79` (same).

There is **no extra envelope for core packets**: a core packet arrives as a top-level message whose first
DWORD is its PACKETTYPE id, dispatched by `CDPClient::UserMessageHandler` -> `GetHandler(dw)`
(`Neuz/DPClient.cpp:309-344`) through the `ON_MSG` table (`Neuz/DPClient.cpp:158-237`).

World traffic instead arrives mostly as **`PACKETTYPE_SNAPSHOT 0xffffff00`** (or `PACKETTYPE_JOIN` for the
first one, `WORLDSERVER/User.cpp:319`): body (after the type DWORD) =
`OBJID objidPlayer` + `short cb` + `cb` x { `OBJID objid` + `WORD snapshotType` + body }
(`WORLDSERVER/Snapshot.cpp:21-27` `SetSnapshot`, `CUser::Notify` `WORLDSERVER/User.cpp:589-632`;
client `CDPClient::OnSnapshot` `Neuz/DPClient.cpp:366-...` reads `objidPlayer, cb` then loops `objid, hdr`).
This server build appends a FlyffWeb table of contents after the `cb` messages (`Snapshot.cpp:29-41`,
`Snapshot.h:15`): `cb` x `DWORD offset` (offset of each message from the first byte after the `short cb`),
`WORD cb`, `DWORD 0x31434F54` ("TOC1"). Neuz never reads it. A TS client can use it to skip unknown
snapshot types.

So the rule is: **core-originated guild messages = top-level PACKETTYPE (`0xffffff3x`, `0xf000b0xx`,
`0xf000f000`)**; **world-originated guild messages = SNAPSHOTTYPE inside PACKETTYPE_SNAPSHOT**
(`0x009a..0x009f`, `0x00fb..0x00ff`, `0x00d5/d6/d8/d9/da/db`, `0x007a`).
Note `CDPClient::OnGuild` is registered for both `PACKETTYPE_GUILD 0xffffff30` (from core, `DPClient.cpp:183`)
and `SNAPSHOTTYPE_GUILD 0x009e` (from world, `DPClient.cpp:551`); same body layout.

### How errors/notices come back
* From core: **`PACKETTYPE_DEFINEDTEXT 0x00ff00ec`** top-level: `DWORD tid` + `string args` (args <= 127 chars,
  space-separated tokens, client tokenizes with CScanner) (`CORESERVER/DPCacheSrvr.cpp:657-670`,
  client `Neuz/DPClient.cpp:4123`).
* From world: snapshot **`SNAPSHOTTYPE_DEFINEDTEXT 0x0095`** = `DWORD tid` + `string args`
  (`WORLDSERVER/User.cpp:2241-2262`), or **`SNAPSHOTTYPE_DEFINEDTEXT1 0x0094`** = `DWORD tid` only
  (`User.cpp:2287-2297`, used by the one-argument `AddDefinedText( tid )`).
* Text and colour come from `Resource/textClient.inc` (`TID_X 0xAARRGGBB { IDS_... }`) +
  `Resource/textClient.txt.txt` (both UTF-16LE). The colour is the inc's second token (`prj.GetTextColor(tid)`).
  English texts below are from those files (`inc:N` = line in textClient.inc).

---------------------------------------------------------------------------------------------------------

## 1. Guild packets the CLIENT SENDS

All start with `DWORD 0xFFFFFFFF` (DPID_UNKNOWN) + `DWORD type` (see 0). Only the payload is listed.
"Core" / "World" = where the cache routes it. "ignored" = the server reads the field but uses its own
session data instead.

| # | Sender (Neuz/DPClient.cpp) | Type id | Payload (in order) | Goes to |
|---|---|---|---|---|
| 1 | `SendCreateGuild` :12486 | `PACKETTYPE_CREATE_GUILD 0xffffff31` | `string szGuild` | World -> **no handler, dropped** (dead code) |
| 2 | `SendGuildSetName` :13231 (name window, id 0xff) | `PACKETTYPE_GUILD_SETNAME 0xf000b032` | `u_long idPlayer` (ignored), `u_long idGuild` (ignored), `string szName` (core reads max 47) | **Core** |
| 3 | `SendQuerySetGuildName` :15789 (rename scroll / forced rename) | `PACKETTYPE_QUERYSETGUILDNAME 0x00000010` | `BYTE nId` (inventory item id of the scroll, or 0x7f), `string szGuild` (max 47) | World -> core |
| 4 | `SendGuildInvite` :12472 | `PACKETTYPE_GUILD_INVITE 0xffffff35` | `OBJID objidTarget` | World |
| 5 | `SendIgnoreGuildInvite` :12479 (invitee refuses) | `PACKETTYPE_IGNORE_GUILD_INVITE 0xffffff36` | `u_long idInviter` (the `idMaster` from the invite) | World |
| 6 | `SendAddGuildMember` :12501 (invitee accepts) | `PACKETTYPE_ADD_GUILD_MEMBER 0xffffff33` | `u_long idInviter`, `GUILD_MEMBER_INFO` raw 8 bytes = `u_long idPlayer` (must be **my** id) + `BYTE nMultiNo` + 3 pad bytes | **Core** |
| 7 | `SendRemoveGuildMember` :12509 (leave = own id, kick = other id) | `PACKETTYPE_REMOVE_GUILD_MEMBER 0xffffff34` | `u_long idMe` (ignored), `u_long idPlayer` | **Core** |
| 8 | `SendDestroyGuild` :12493 (disband) | `PACKETTYPE_DESTROY_GUILD 0xffffff32` | `u_long idMe` (ignored) | **Core** |
| 9 | `SendGuildMemberLv` :13151 (title up/down) | `PACKETTYPE_GUILD_MEMBER_LEVEL 0xffffff3a` | `u_long idMe` (ignored), `u_long idPlayer`, `int nMemberLv` (new rank 0..4; UI sends current-1 for "Promote Member", +1 for "Demote Member", `_Interface/WndGuildTabMember.cpp:581-588`) | **Core** |
| 10 | `SendGuildClass` :13158 (class up/down) | `PACKETTYPE_GUILD_CLASS 0xffffff74` | `BYTE nFlag` (1 up, 0 down) **first**, then `u_long idMe` (ignored), `u_long idPlayer`. Not sent when idMe == idPlayer. | **Core** |
| 11 | `SendGuildNickName` :13169 | `PACKETTYPE_GUILD_NICKNAME 0xffffff75` | `u_long idMe` (ignored), `u_long idPlayer`, `string nick` (core reads max 47) | **Core** |
| 12 | `SendChgMaster` :13246 (hand over leadership) | `PACKETTYPE_CHG_MASTER 0xf000f000` | `u_long idMe` (ignored), `u_long idNewMaster` | **Core** |
| 13 | `SendGuildAuthority` :13213 | `PACKETTYPE_GUILD_AUTHORITY 0xf000b026` | `u_long idMe` (ignored), `u_long idGuild` (ignored), `DWORD power[5]` (20 bytes, index = rank 0..4) | **Core** |
| 14 | `SendGuilPenya` :13223 (salary per rank) | `PACKETTYPE_GUILD_PENYA 0xf000b027` | `u_long idMe` (ignored), `u_long idGuild` (ignored), `DWORD dwType` (rank 0..4), `DWORD dwPenya` | **Core** |
| 15 | `SendGuildLogo` :13178 | `PACKETTYPE_NW_GUILDLOGO 0xf000b010` | `DWORD dwLogo` | World -> core |
| 16 | `SendGuildContribution` :13190 | `PACKETTYPE_NW_GUILDCONTRIBUTION 0xf000b011` | `BYTE cbPxpCount` (read, **unused**), `int nGold`, `BYTE cbItemFlag` | World -> core |
| 17 | `SendGuildNotice` :13203 | `PACKETTYPE_NW_GUILDNOTICE 0xf000b012` | `string szNotice` (world reads max 127) | World -> core |
| 18 | `SendCreateGuildCloak` :14183 -> `SendHdr` :11259 | `PACKETTYPE_CREATE_GUILDCLOAK 0x00ff0ffd` | (none) | World |
| 19 | guild chat `/g text` -> `SendChat` :9139 (client branch of `TextCmd_GuildChat` builds `"/g %s"`, `_Interface/FuncTextCmd.cpp:1172-1182`) | `PACKETTYPE_CHAT 0x00ff0000` | `string "/g <text>"` | World (text command `GuildChat` alias `g`, `FuncTextCmd.cpp:5144`) -> core `PACKETTYPE_GUILD_CHAT` |
| 20 | `/guildinvite <name>` via `SendChat` | `PACKETTYPE_CHAT 0x00ff0000` | `string "/guildinvite name"` | World (`FuncTextCmd.cpp:3043-3071`, table :5146, AUTH_GENERAL) -> same path as #4, by name |
| 21 | `SendGuildRank` :13239 | `PACKETTYPE_REQUEST_GUILD_RANKING 0xf000b04e` | `DWORD nVer` (my cached ranking version) | World |
| 22 | votes `SendAddVote/RemoveVote/CloseVote/CastVote` :14526-14590 | `NC_ADDVOTE 0xf000b038` .. `NC_CASTVOTE 0xf000b03b` | `u_long idGuild, u_long idPlayer`, then add: `string title, string question, 4 x string choice`; remove/close: `u_long idVote`; cast: `u_long idVote, BYTE sel` | **Not active on main**: vote window is `#ifdef __GUILDVOTE` (`_Interface/FuncApplet.cpp:142`), cache sends them to world, world has no handler |

Guild war / siege / bank / house senders: see section 5.

### 1.1 Server checks and replies, per packet

**#2 GUILD_SETNAME (core `CDPCacheSrvr::OnGuildSetName`, `CORESERVER/DPCacheSrvr.cpp:1559-1605`)**
* Not master -> DEFINEDTEXT `TID_GAME_COMDELNOTKINGPIN` (0xffff0000, inc:1157, "Only the guild leader can disband the guild.").
* Master but the guild already has a name -> **silently ignored** (`str1 == ""` test). The UI shows
  `TID_GAME_GUILDNOTCHGNAME` ("The guild name can only be changed once.") itself (`_Interface/WndGuildTabInfo.cpp:536-550`).
  So this packet only gives the *first* name to the nameless guild the NPC created.
* Name taken -> `PACKETTYPE_GUILD_ERROR 0xf000b035` with `int 1` -> client `TID_GAME_COMOVERLAPNAME` (0xffff0000, "Guild name already exists.").
* Success -> core broadcasts `PACKETTYPE_GUILD_SETNAME` to **all players** (`DPCacheSrvr.cpp:1919-1925`) and the
  worlds (idPlayer=0, nId=0xff, err=0 defaults, `CORESERVER/DPCoreSrvr.h:167`).
* No server-side character/length rule (only uniqueness via `CGuildMng::SetName`, `_Common/guild.cpp:745-756`).

**#3 QUERYSETGUILDNAME (world `CDPSrvr::OnQuerySetGuildName`, `WORLDSERVER/DPSrvr.cpp:4749-4780`)**
* `__RULE_0615`: `prj.IsInvalidName || !IsAllowedLetter` -> diag `TID_DIAG_0020` ("Character name is not allowed.")
  **but it does not return** -- the request still goes on.
* Normal mode (`m_bAllAction`): `nId` must be a usable inventory item with `m_bQuery == FALSE`; it is marked and the
  request goes to core (`WORLDSERVER/DPCoreClient.cpp:3143-3149`). Forced-rename mode (`!m_bAllAction`, server unify) needs no item.
* Core `CDPCoreSrvr::OnQuerySetGuildName` (`CORESERVER/DPCoreSrvr.cpp:2120-2165`): err 1 no guild, 2 not master, 3 taken;
  success -> DB + **`PACKETTYPE_GUILD_SETNAME` to all clients**. World (`WORLDSERVER/DPCoreClient.cpp:2511-2568`) shows
  1 `TID_GAME_COMNOHAVECOM`, 2 `TID_GAME_COMDELNOTKINGPIN`, 3 `TID_GAME_COMOVERLAPNAME`; on 0 consumes one scroll, then `SetAllAction()`.
* Rename scroll = `II_SYS_SYS_SCR_GCHANAM` (client opens the name window with the item id, `Neuz/DPClient.cpp:10525-10534`).

**#4 GUILD_INVITE (world `CDPSrvr::OnGuildInvite` :11994 -> `InviteCompany`, `WORLDSERVER/DPSrvr.cpp:7794-7866`)**
* `IsInviteAbleGuild` (`DPSrvr.cpp:7869+`): no invites while my guild is applied to a running Guild Siege / 1:1 siege / secret room (silent).
* Target must be a valid player object (by OBJID, i.e. in view). Inviter needs `PF_INVITATION` for his rank, else
  `TID_GAME_GUILDINVAITNOTWARR` ("You are not authorized to do this.").
* Target already in a guild -> `TID_GAME_COMACCEPTHAVECOM` (0xffff0000, "%s is already in a guild.").
* `__BB_STAFF_MODERATOR_AUTH` (custom): non-staff cannot invite a staff moderator.
* Target in a duel -> silent. My guild at war -> `TID_GAME_GUILDWARNOMEMBER`. Target in attack mode ->
  `TID_GAME_BATTLE_NOTGUILD` (0xffff0000, "You cannot invite others to join your guild during a battle.").
* Success: target gets `SNAPSHOTTYPE_GUILD_INVITE 0x009a` (`u_long idGuild, u_long idInviter`, `WORLDSERVER/User.cpp:1935-1945`);
  inviter gets `TID_GAME_COMACCEPTKINGPIN` (0xffccffcc, "You invited %s to your guild."). Size is checked on accept.

**#5 IGNORE_GUILD_INVITE (world `DPSrvr.cpp:12005-12019`)**: inviter (by player id) gets
`TID_GAME_COMACCEPTDENY` (0xffff0000, "%s has declined your invitation.").

**#6 ADD_GUILD_MEMBER = accept (core `CDPCacheSrvr::OnAddGuildMember`, `CORESERVER/DPCacheSrvr.cpp:1245-1355`)**
* Sender must be `info.idPlayer` (else silent). Inviter offline -> `TID_GAME_GUILDCHROFFLINE` ("The character you invited is offline.").
* **48 h rejoin cooldown**: `now < m_tGuildMember` (set to now + 2 days on leave/kick/disband) and not operator ->
  `TID_GAME_GUILDNOTINCLUDE` ("Unable to join a new guild. Please wait 48 hours and try again.") to both
  (FRE/GER: `_01`/`_02`, each sent twice).
* Inviter has no guild -> `TID_GAME_COMNOEXCOM`; at war -> `TID_GAME_GUILDWARNOINVATE`; I already have a guild ->
  `TID_GAME_COMHAVECOM`; `GetSize() >= GetMaxMemberSize()` (level table) -> `TID_GAME_COMOVERMEMBER` ("The guild is full.").
  The inviter's PF_INVITATION is not re-checked.
* Success: rank `GUD_ROOKIE` (4); worlds + DB told; **the new member gets `PACKETTYPE_GUILD 0xffffff30` (full guild)**,
  every other online member gets `PACKETTYPE_ADD_GUILD_MEMBER` (section 2). The world then sends `SNAPSHOTTYPE_SET_GUILD`
  to everyone in view of the new member, plus guild-house info (`WORLDSERVER/DPCoreClient.cpp:1876-1918`).

**#7 REMOVE_GUILD_MEMBER = leave/kick (core `OnRemoveGuildMember`, `DPCacheSrvr.cpp:1357-1439`)**
* Not in a guild -> `TID_GAME_COMLEAVENOCOM`; at war -> `TID_GAME_GUILDWARNOMEMBER`.
* Kick: target not member -> `TID_GAME_GUILDNOTMEMBER` ("%s" = guild name); **only the master may kick** (no PF_ flag) ->
  `TID_GAME_COMLEAVENOKINGPIN` ("Only Guild Masters can kick guild members out.").
* Leave: master cannot leave -> `TID_GAME_COMLEAVEKINGPIN` ("Guild masters cannot leave the guild.").
* Success: removed player's `m_tGuildMember = now + 2 days`; he (if online) and every remaining online member get
  `PACKETTYPE_REMOVE_GUILD_MEMBER`; world sends `SNAPSHOTTYPE_SET_GUILD 0` to his area, **deletes his guild cloaks
  (IK3_CLOAK)**, puts him out of the guild house and out of a guild-quest area (`WORLDSERVER/DPCoreClient.cpp:1920-1998`).
* Client-only pre-checks (`WndGuildTabMember.cpp:571-575, 634-657`): blocked while `m_idWar` (`TID_GAME_GUILDWARERRORMEMBER`),
  while the Clockwork guild quest runs (`TID_GUILD_QUEST_LEAVEERROR`), while applied to a running Guild Siege
  (`TID_GAME_GUILDCOMBAT_NOT_LEAVE_GUILD`) or 1:1 siege not closed (`TID_GAME_GUILDCOMBAT1TO1_NOTLEAVEGUILD`).

**#8 DESTROY_GUILD (core `OnDestroyGuild`, `DPCacheSrvr.cpp:1185-1242`)**
* Not member -> `TID_GAME_COMNOHAVECOM`; not master -> `TID_GAME_COMDELNOTKINGPIN`; at war -> `TID_GAME_GUILDWARNODISMISS`
  ("You cannot disband your guild during a guild duel.").
* Success: every online member's `m_tGuildMember = now + 2 days`; guild removed; DB + worlds told. World
  (`WORLDSERVER/DPCoreClient.cpp:1770-1874`): `SNAPSHOTTYPE_SET_GUILD 0` per online member, **`SNAPSHOTTYPE_DESTROY_GUILD`
  to every player on that world**, cloaks removed, cooldown, eject from guild-quest areas. No refund; bank lost.
* Client-only: `WndGuildDisMiss` refuses if applied to Guild Siege (`TID_GAME_GUILDCOMBAT_NOT_DISSOLVE_GUILD`,
  `_Interface/WndGuildTabInfo.cpp:68-80`). The NPC "disband" script only sends `FUNCTYPE_DESTROYGUILD`
  (`_Common/ScriptLib.cpp:836-855`), which the client ignores (`Neuz/DPClient.cpp:14373-14376`).

**#9 GUILD_MEMBER_LEVEL (core `OnGuildMemberLv`, `DPCacheSrvr.cpp:1441-1525`)**, in this order:
not in guild `TID_GAME_COMLEAVENOCOM`; at war `TID_GAME_GUILDWARNOMEMBER`; target not member `TID_GAME_GUILDNOTMEMBER`;
**my rank >= target's rank** (I must outrank him; lower number = higher) `TID_GAME_GUILDAPPOVER`; **my rank >= new rank**
`TID_GAME_GUILDWARRANTREGOVER`; my rank lacks `PF_MEMBERLEVEL` `TID_GAME_GUILDAPPNOTWARRANT`; new rank outside 0..4
`TID_GAME_GUILDWARRANTREGOVER`; rank full (`count+1 > GetMaxMemberLvSize`) `TID_GAME_GUILDAPPNUMOVER`
("The maximum number for that title has been reached."). Success: rank set, **class reset to 0**, all online members
get `PACKETTYPE_GUILD_MEMBER_LEVEL`. Rank 0 only changes through CHG_MASTER.

**#10 GUILD_CLASS (core `OnGuildClass`, `DPCacheSrvr.cpp:1640-1717`)**: not in guild / at war / target not member as above;
my rank lacks `PF_LEVEL` -> `TID_GAME_GUILDAPPNOTWARRANT`; class +1/-1 must stay 0..2 (else silent). No rank-order check.
Success: all online members get `PACKETTYPE_GUILD_CLASS`.

**#11 GUILD_NICKNAME (core `OnGuildNickName`, `DPCacheSrvr.cpp:1783-1854`)**: not in guild; **guild level < 10** ->
`TID_GAME_GUILDNOTLEVEL` ("Guild level is too low."); at war; **master only** (silent); `lstrlen(nick)` (bytes) 2..12
else `TID_DIAG_0011_01` ("Enter a name between 2 to 12 letters."). No filter on the server. Success: all online members get
`PACKETTYPE_GUILD_NICKNAME`.

**#12 CHG_MASTER (core `OnChgMaster`, `DPCacheSrvr.cpp:1719-1781`)**: both players **online** (silent otherwise; UI checks
`bIsOnLine` -> `TID_GAME_NOTLOGIN`, `WndGuildTabMember.cpp:598-607`) and in the same guild; at war -> `TID_GAME_GUILDWARNOMEMBER`;
master only (silent). Old master -> `GUD_ROOKIE`, new -> `GUD_MASTER`, both class 0. All online members get `PACKETTYPE_CHG_MASTER`.
The menu item exists only for the master (`WndGuildTabMember.cpp:711-716`).

**#13 GUILD_AUTHORITY (core `OnGuildAuthority`, `DPCacheSrvr.cpp:1527-1557`)**: master only (silent), not at war
(`TID_GAME_GUILDWARNOMEMBER`). **No validation of the 5 DWORDs.** Members get `SNAPSHOTTYPE_GUILD_AUTHORITY 0x00fe` from their world
(`WORLDSERVER/DPCoreClient.cpp:2399-2423`) -- a snapshot, not a core packet.

**#14 GUILD_PENYA salary (core `OnGuildPenya`, `DPCacheSrvr.cpp:1607-1638`)**: master only (silent); `dwPenya < 1000000` else
`PACKETTYPE_GUILD_ERROR 2` (client `TID_GAME_GUILDONLYNUMBER` "Please enter the number."). **`dwType` is not range checked**
(send 0..4). Members get `SNAPSHOTTYPE_GUILD_PENYA 0x00ff` (`DPCoreClient.cpp:2425-2447`). UI: digits only, 0..999999
(`_Interface/WndGuildTabApp.cpp:525-556`). Salary is paid once a day at 21:00 server time from the guild fund if the fund
covers the sum of all members' salaries (`_Common/guild.cpp:1083-1129`), then `SNAPSHOTTYPE_GUILD_REAL_PENYA` per member.

**#15 NW_GUILDLOGO (world `CDPSrvr::OnGuildLogo`, `WORLDSERVER/DPSrvr.cpp:12021-12037`)**
* `dwLogo > CUSTOM_LOGO_MAX` -> silent; `dwLogo > 20` and not GM -> silent; -> core `PACKETTYPE_WC_GUILDLOGO`
  (`u_long idGuild, u_long idPlayer, DWORD logo`, `WORLDSERVER/DPCoreClient.cpp:2654-2660`).
* Core `CDPCoreSrvr::OnGuildLogo` (`CORESERVER/DPCoreSrvr.cpp:1867-1907`): **guild level < 2 -> silent**, not master -> silent,
  at war -> `TID_GAME_GUILDWARNOLOGO`, **logo already set -> silent** (`CGuild::SetLogo` only when `m_dwLogo == 0`,
  `_Common/guild.cpp:516-523`: the logo can be chosen once). Free.
* Success: every world broadcasts **`SNAPSHOTTYPE_GUILD_LOGO 0x00fb` to all its players** (`WORLDSERVER/User.cpp:5341-5349`,
  `DPCoreClient.cpp:2231-2272`).

**#16 NW_GUILDCONTRIBUTION (world `CDPSrvr::OnGuildContribution`, `WORLDSERVER/DPSrvr.cpp:12039-12118`)**
* Needs world ini token `GUILDBANK` (`ENABLE_GUILD_INVENTORY`; present in `Program/WorldServer.ini:19`, parsed
  `WORLDSERVER/WorldServer.cpp:557-560`), else silent.
* `nGold > 0`: `GetGold() >= nGold` else `TID_GAME_GUILDNOTENGGOLD`; `Contribute(0, nGold)`; penya is taken only if
  `CGuild::AddContribution` accepts (overflow checks only, `_Common/guild.cpp:554-607`). No min/max beyond `int > 0`.
* else `cbItemFlag != 0`: **every** usable `IK3_GEM` stack in the inventory is contributed and removed, each worth
  `(itemLV + 1) / 2 * count` points (`DPSrvr.cpp:12083-12115`). No PXP (skill-exp) contribution exists in V15.
* `Contribute` (`WORLDSERVER/DPCoreClient.cpp:2603-2647`): applies locally, DB, core `WC_GUILDCONTRIBUTION`
  (`u_long serverKey` + `CONTRIBUTION_CHANGED_INFO`); core drops it if the guild has **no name yet**
  (`CORESERVER/DPCoreSrvr.cpp:1925-1926`) -- after the world already took the penya. Core rebroadcasts `CW_GUILDCONTRIBUTION`;
  each world sends every online member `SNAPSHOTTYPE_GUILD_CONTRIBUTION 0x00fc` (`DPCoreClient.cpp:2274-2304`).
* Level-up: when points >= table[level+1].pxp **and** fund >= table[level+1].penya, both are subtracted and level +1
  (one level per contribution) (`guild.cpp:582-607`). The guild fund `m_nGoldGuild` is the same pool that pays salaries
  and cloaks and is shown as the guild bank penya.

**#17 NW_GUILDNOTICE (world `DPSrvr.cpp:12120-12134`)**: empty -> silent; -> core `WC_GUILDNOTICE` (`DPCoreClient.cpp:2676-2689`).
**Neither world nor core checks the rank** (`CORESERVER/DPCoreSrvr.cpp:1938-1956`); the UI only lets the master open it
(`WndGuildTabInfo.cpp:516-531`). Members get `SNAPSHOTTYPE_GUILD_NOTICE 0x00fd` (`DPCoreClient.cpp:2373-2397`). Max 127 bytes.

**#18 CREATE_GUILDCLOAK (world `CDPSrvr::OnCreateGuildCloak`, `WORLDSERVER/DPSrvr.cpp:11492-11586`)**
* Needs `GUILDBANK`; in a guild. No logo -> `TID_GAME_GUILDSETTINGLOGO` ("Unable to create a guild cloak. Please set your guild
  logo first."); not master -> `TID_GAME_GUILDONLYMASTERLOGO` ("Only the Guild Leader can make a guild cloak.").
* Bank full -> `TID_GAME_GUILDBANKFULL`; fund < **10 000 penya** -> `TID_GAME_GUILDNEEDGOLD` ("... Insufficient Penya in the guild warehouse.").
* Success: fund -= 10000; item `II_ARM_S_CLO_CLO_SYSCLOAK01 + (logo-1)` (logo 999 = blank custom cloak; GM logos -> SYSCLOAK01) with
  `m_idGuild` = guild id is put **in the guild bank**; every online member gets the bank-penya update and the item; master gets
  `TID_GAME_GUILDCREATECLOAK` ("Guild cloak has been created."). Opened from the guild bank window (`_Interface/WndGuildBank.cpp:343`).

**#19 guild chat**: world `TextCmd_GuildChat` (`_Interface/FuncTextCmd.cpp:1139-1171`): muted -> mute text; >= 260 bytes -> dropped;
effects parsed unless font-edit buff; CR/LF removed; -> core `PACKETTYPE_GUILD_CHAT` (`OBJID, u_long idPlayer, string`,
`WORLDSERVER/DPCoreClient.cpp:1663-1670`). Core (`CORESERVER/DPCoreSrvr.cpp:1449-1496`) sends every online member
`PACKETTYPE_GUILD_CHAT` (section 2), plus GM snoop.

**#21 REQUEST_GUILD_RANKING (world `DPSrvr.cpp:4198-4227`)**: ranking older than 24 h -> world asks the DB to rebuild, sends nothing;
else if `ver != m_Version` -> `SNAPSHOTTYPE_REQUEST_GUILDRANK 0x00db`.

### 1.2 Client-side quirks worth copying (or fixing)
* **Refusing an invite sends nothing**: `CWndGuildConfirm` WIDC_NO only closes the window
  (`_Interface/WndGuild.cpp:228-251`); `SendIgnoreGuildInvite` has no caller. Accept sends #6 with
  `info.idPlayer = my id`, `nMultiNo = 100` (constructor default, `_Common/guild.h:252-258`); send the 3 pad bytes as 0.
* The invite window only opens if the guild id is in `g_GuildMng` and `m_bAllAction` is TRUE (`Neuz/DPClient.cpp:13121-13143`).
* Logo button (`_Interface/WndGuildTabInfo.cpp:560-578`): refused while `m_idWar` (`TID_GAME_GUILDWARERRORLOGO`), if a logo is
  already set (`TID_GAME_GUILDSTILLLOGO` "Guild logo has already been set."), or guild level < 2 (`TID_GAME_GUILDNOTLEVEL`).
  Logos 1..20 selectable (`CUSTOM_LOGO_MAX 27` in `Resource/define.h:162`; 21..27 are GM logos, `WndGuildTabInfo.cpp:229,317,359`).
* Disband button (`WndGuildTabInfo.cpp:580+`): refused while the guild bank window is open, while `m_idWar`
  (`TID_GAME_GUILDWARERRORDISBAND`), while the Clockwork quest runs; then the `CWndGuildDisMiss` confirm.

---------------------------------------------------------------------------------------------------------

## 2. Guild messages the CLIENT RECEIVES

### 2.1 Serialized structures

**`CGuildMember::Serialize`** (`_Common/guild.cpp:266-292`, V15 = `__VER >= 11` so the `#if __VER < 11` fields are absent):

| field | type | bytes |
|---|---|---|
| m_idPlayer | u_long | 4 |
| m_nPay | int | 4 |
| m_nGiveGold (penya contributed) | int | 4 |
| m_dwGivePxpCount (points contributed) | DWORD | 4 |
| m_nWin | short | 2 |
| m_nLose | short | 2 |
| m_nMemberLv (rank 0..4) | BYTE | 1 |
| m_idSelectedVote | u_long | 4 |
| m_nSurrender | int | 4 |
| m_nClass (0..2) | int | 4 |
| m_szAlias (nickname) | string | 4+n (client buffer 48) |

**`CGuild::Serialize(ar, bDesc)`** (`_Common/guild.cpp:409-477`):

| field | type | in desc (`bDesc=TRUE`) | in full |
|---|---|---|---|
| m_idGuild | u_long | yes | yes |
| m_idMaster | u_long | yes | yes |
| m_nLevel | int | yes | yes |
| m_szGuild | string (max 47) | yes | yes |
| m_dwLogo | DWORD | yes | yes |
| m_nGoldGuild (guild fund = bank penya) | DWORD | yes | yes |
| m_nWin, m_nLose, m_nSurrender | int, int, int | yes | yes |
| m_adwPower[5] | 5 x DWORD (raw 20 bytes) | - | yes |
| m_adwPenya[5] (salary per rank) | 5 x DWORD (raw 20 bytes) | - | yes |
| m_szNotice | string (max 127) | - | yes |
| m_dwContributionPxp | DWORD | - | yes |
| m_nLevel (again) | int | - | yes |
| m_idEnemyGuild | u_long | - | yes |
| member count | short | - | yes |
| members | count x CGuildMember | - | yes |
| vote count | short | - | yes |
| votes | count x CGuildVote: `u_long id, BYTE completed, string title(max 25), string question(max 170), 4 x { string choice(max 20), BYTE count }` (`guild.cpp:114-143`) | - | yes |
| m_nQuestSize | BYTE | - | yes |
| m_aQuest | n x GUILDQUEST raw 12 bytes = `int nId, int nState, u_long idGuild` (`_Common/guildquest.h:44-56`) | - | yes |

On read the client calls `Clear()` first (members and votes are replaced).

**`CGuildMng::Serialize(ar, TRUE)`** = ALL_GUILDS (`_Common/guild.cpp:802-835`): `u_long m_id` (last guild id),
`int count`, count x `CGuild` **desc**, then **`CGuildRank::Serialize`** (`_Common/guild.h:551-585`):
`DWORD m_Version`, `int m_Total[8]` (32 bytes), then for each of the 8 lists with `m_Total[i] > 0`:
`m_Total[i]` x `GUILD_RANKING` raw **76 bytes** = `int logo; char guild[17]; char master[33]; <2 pad>; int win; int lose;
int surrender; float avgLevel; int winPoint` (`guild.h:452-462`). Lists R1..R8 = strongest, most wins, most losses,
most surrenders, best unity, most funds, highest average level, most play (`guild.h:436-449`); max 20 rows each.

**`CONTRIBUTION_CHANGED_INFO`** (`_Common/guild.cpp:55-67`): `u_long idGuild, u_long idPlayer, DWORD dwPxpCount, DWORD dwPenya,
DWORD dwGuildPxpCount, DWORD dwGuildPenya, WORD nGuildLevel` (26 bytes; streamed field by field).

**`GUILD_MEMBER_INFO`** (raw `ar.Write`, `_Common/guild.h:243-260`): `u_long idPlayer, BYTE nMultiNo, 3 pad` = 8 bytes
(default /Zp8 packing, no `#pragma pack`, no StructMemberAlignment in the vcxproj files).

### 2.2 Top-level (core) messages

| Type id | Handler (Neuz/DPClient.cpp) | Payload | Effect / text shown |
|---|---|---|---|
| `PACKETTYPE_GUILD 0xffffff30` | `OnGuild` :12617 (map :183) | `u_long idGuild` + `CGuild` full | add or replace the guild in `g_GuildMng`; refresh guild + messenger windows; then **`SendQueryPlayerData`** (`PACKETTYPE_QUERY_PLAYER_DATA2 0xf000f807`, `int n` + n x `{u_long id, int ver}`) for all members to get names/job/level/online. No text. Sent by core to a member who just joined (`CORESERVER/DPCacheSrvr.cpp:1856-1864`). |
| `PACKETTYPE_ADD_GUILD_MEMBER 0xffffff33` | `OnAddGuildMember` :12747 | `GUILD_MEMBER_INFO` (8), `u_long idGuild`, `string name` | adds member rank Rookie; `TID_GAME_COMACCEPTWELCOME` 0xffccffcc "%s has joined the guild." (`DPCacheSrvr.cpp:1866-1877`) |
| `PACKETTYPE_REMOVE_GUILD_MEMBER 0xffffff34` | `OnRemoveGuildMember` :12801 | `u_long idPlayer, u_long idGuild` | removes; if the name is known `TID_GAME_COMLEAVEBYE` 0xffff0000 "%s has left the guild." (also when kicked) |
| `PACKETTYPE_GUILD_CHAT 0xffffff39` | `OnGuildChat` :12840 | `OBJID objidSpeaker, string name (max 31), string text (max 1023)` | chat line `"[name] text"` colour `TID_GUILD_CHAT` 0xffffbaff, style `CHATSTY_GUILD`; speech balloon over the speaker if in view; dropped if the speaker is on the block list |
| `PACKETTYPE_GUILD_MEMBER_LEVEL 0xffffff3a` | `OnGuildMemberLv` :12878 | `u_long idPlayer, int nMemberLv` | sets rank, class = 0. A text is formatted (`TID_GAME_GUILDMEM_APPUP/APPDOWN`) but **never printed** (no PutString). |
| `PACKETTYPE_GUILD_CLASS 0xffffff74` | `OnGuildClass` :12920 | `u_long idPlayer, int nClass` | sets class. No text. |
| `PACKETTYPE_GUILD_NICKNAME 0xffffff75` | `OnGuildNickName` :12984 | `u_long idPlayer, string nick (max 47)` | sets alias. No text. |
| `PACKETTYPE_CHG_MASTER 0xf000f000` | `OnChgMaster` :12943 | `u_long idOldMaster, u_long idNewMaster` | old -> Rookie, new -> Master, classes 0; if the new master is in view: `TID_GAME_CHANGE_GUILDMASTER` 0xff00ff00 "%s has become the guild master." |
| `PACKETTYPE_GUILD_GAMELOGIN 0xf000b029` | `OnGuildMemberLogin` :13008 | `BYTE nLogin (1/0), u_long idPlayer, u_long multiNo (100 on logout)` | V15: only refreshes windows (the data writes are `#if __VER < 11`). Online state really comes from PlayerData (`uLogin`, see 3.3). Sent by core `CGuildMng::AddConnection/RemoveConnection` (`_Common/guild.cpp:837-903`). |
| `PACKETTYPE_GUILD_GAMEJOIN 0xf000b030` | `OnGuldMyGameJoin` :13041 | `int n`, n x `u_long idPlayer`, n x `u_long multiNo` (online members incl. me) | stored in `m_uLoginPlayerIdGuild` if my guild is not loaded yet; V15 effect is nil (writes are `#if __VER < 11`). n <= 128 server side, client array 200. |
| `PACKETTYPE_GUILD_SETNAME 0xf000b032` | `OnGuildSetName` :13454 | `u_long idGuild, string name (max 47)` | renames in `g_GuildMng` (any guild, broadcast to all players); text `TID_GAME_GUILDNAMECHG` "%s guild has changed their name to %s." (old name first) printed with PutString's default colour |
| `PACKETTYPE_GUILD_ERROR 0xf000b035` | `OnGuildError` :13099 | `int nError` | 1 -> `TID_GAME_COMOVERLAPNAME` 0xffff0000 "Guild name already exists."; 2 -> `TID_GAME_GUILDONLYNUMBER` "Please enter the number." |
| `PACKETTYPE_DEFINEDTEXT 0x00ff00ec` | `OnDefinedText` :4123 | `DWORD tid, string args` | all core-side refusals listed in 1.1 |
| `PACKETTYPE_REQUEST_GUILD_RANKING 0xf000b04e` | `OnGuildRank` :13478 (map :206) | `CGuildRank` | registered but no server sends this type to clients (the world uses snapshot 0x00db) |
| war: `DECL_GUILD_WAR 0xf000b036`, `ACPT_GUILD_WAR 0xf000b037`, `WAR_DEAD 0xf000b045`, `WAR_END 0xf000b046`, `SURRENDER 0xf000b047`, `QUERY_TRUCE 0xf000b048` | `Neuz/DPClientGuildWar.cpp` | see section 5 | |

Core also broadcasts `PACKETTYPE_GUILD_MSG_CONTROL 0xf000b023` to `DPID_ALLPLAYERS` (`CORESERVER/DPCacheSrvr.cpp:1927-1935`);
the client has no handler and ignores it.

### 2.3 Snapshot (world) messages, inside PACKETTYPE_SNAPSHOT

`objid` is the snapshot entry's OBJID (`NULL_ID` = 0xFFFFFFFF unless noted).

| Snapshot id | Handler (dispatch `Neuz/DPClient.cpp:547-564`) | Payload | Who gets it / effect / text |
|---|---|---|---|
| `GUILD_INVITE 0x009a` | `OnGuildInvite` :13121 | `u_long idGuild, u_long idInviter` | invitee; opens the accept window `APP_GUILD_INVATE` with the guild name (needs the guild in `g_GuildMng`) |
| `SET_GUILD 0x009b` (objid = the player) | `OnSetGuild` :12689 | `u_long idGuild` (0 = none) | everyone in view of that player; sets `CMover::m_idGuild`. If it is me: 0 -> `TID_GAME_COMLEAVE` 0xffff0000 "You are no longer a member of the %s guild." + clears guild-house data; non-0 -> plays `BGM_IN_COMPANY` (26) and `TID_GAME_COMACCEPT` 0xffccffcc "You have joined the %s guild." |
| `CREATE_GUILD 0x009c` | `OnCreateGuild` :12516 | `u_long idMaster, u_long idGuild, string masterName, string guildName` | **every player on every world** (`WORLDSERVER/User.cpp:5294-5304`); adds the guild with the master as only member (`m_adwPower[0] = 0xFF`), sets the master's mover `m_idGuild`; `TID_GAME_COMCREATE` 0xffccffcc "%s has formed the guild '%s'." (name is empty right after the NPC creation). Party members added at creation arrive through the following `SET_GUILD`/`GUILD`. |
| `DESTROY_GUILD 0x009d` | `OnDestroyGuild` :12583 | `string masterName, u_long idGuild` | every player; removes the guild; text `TID_GAME_COMDISMESS` 0xffff0000 "%s has disbanded the %s guild." only if it is my guild |
| `GUILD 0x009e` | `OnGuild` :12617 | `u_long idGuild` + `CGuild` full | me: at login (`AddMyGuild`) and after creation (`WORLDSERVER/DPCoreClient.cpp:1764-1767`) |
| `ALL_GUILDS 0x009f` | `OnAllGuilds` :13145 | `CGuildMng` desc + `CGuildRank` | me at login; **clears and rebuilds** `g_GuildMng` |
| `GUILD_LOGO 0x00fb` | `OnGuildLogo` :13254 | `u_long idGuild, DWORD logo` | every player; sets `m_dwLogo`. No text. |
| `GUILD_CONTRIBUTION 0x00fc` | `OnGuildContribution` :13278 | `CONTRIBUTION_CHANGED_INFO` | members; if `nGuildLevel` > current: `TID_GAME_GUILDLEVELUP` "Guild level has increased."; then level, fund, points and the member's totals updated |
| `GUILD_NOTICE 0x00fd` | `OnGuildNotice` :13368 | `u_long idGuild, string notice (max 127)` | members; `TID_GAME_GUILDNOTICEUPDATE` "A new Guild Notice has been posted. Please check it in the guild window." |
| `GUILD_AUTHORITY 0x00fe` | `OnGuildAuthority` :13389 | `DWORD power[5]` (no guild id: applies to **my** guild) | members; `TID_GAME_GUILDCHGWARRANT` "Authority for each title has been changed." |
| `GUILD_PENYA 0x00ff` | `OnGuildPenya` :13408 | `DWORD rank, DWORD penya` (my guild) | members; `TID_GAME_GUILDCHGPAY` "Salary for each title has been changed." |
| `GUILD_REAL_PENYA 0x00d5` | `OnGuildRealPenya` :13430 | `int nGoldGuild, int nMyRank` | members after the 21:00 payout; sets fund; if my rank's salary > 0: `TID_GAME_GUILD_PAYTAKE` "Guild salary of %d Penya received. Log in again to acquire the amount." |
| `GUILD_CHANGEJOBLEVEL 0x00d6` | - | - | `#if __VER < 11` only (`Neuz/DPClient.cpp:534-545`); not in V15 |
| `GUILD_ADDVOTE 0x00d8`, `GUILD_MODIFYVOTE 0x00d9` | `OnGuildAddVote` :13298, `OnGuildModifyVote` :13340 | `VOTE_INSERTED_INFO`; `u_long idVote, BYTE op, BYTE extra` | votes; not reachable on main |
| `SET_WAR 0x007a` (objid = player) | `OnSetWar` (`DPClientGuildWar.cpp:179`) | `u_long idWar` | everyone in view; sets `CMover::m_idWar` |
| `WAR 0x00da` | `OnWar` (`DPClientGuildWar.cpp:193`) | `u_long idWar` + `CGuildWar` (see 5) | me at login if my guild is at war; `TID_GAME_GUILDWARSTILL` + `TID_GAME_GUILDWARDOING` |
| `REQUEST_GUILDRANK 0x00db` | `OnRequestGuildRank` :14955 -> `CGuildRank::Serialize` | `CGuildRank` | reply to #21 |
| `DEFINEDTEXT 0x0095` / `DEFINEDTEXT1 0x0094` | `OnDefinedText` / `OnDefinedText1` :4236 | `DWORD tid [+ string]` | all world-side refusals listed in 1.1 |
| `SETGUILDQUEST 0x00b5`, `REMOVEGUILDQUEST 0x00b6` | `OnSetGuildQuest` :8414, `OnRemoveGuildQuest` :8431 | guild quest state | section 5 |

---------------------------------------------------------------------------------------------------------

## 3. Guild data at login

### 3.1 Order
1. Cache -> core `PACKETTYPE_JOIN` with the player's `m_idGuild`/`m_idWar` (`CACHESERVER/DPCoreClient.cpp:97-111`).
   Core `CDPCacheSrvr::OnAddPlayer` (`CORESERVER/DPCacheSrvr.cpp:178-235`) -> `CPlayerMng::RegisterPlayerInfo`
   (`CORESERVER/Player.cpp:177-181`) -> `CGuildMng::AddConnection` (`_Common/guild.cpp:837-876`): every other online
   member gets `PACKETTYPE_GUILD_GAMELOGIN (1, me, multi)`; **I get `PACKETTYPE_GUILD_GAMEJOIN`** (online member list).
   This happens **before** the core acks the join, i.e. before the world join: the client receives GUILD_GAMEJOIN before
   `PACKETTYPE_JOIN` and before `g_pPlayer` exists (so it is parked in `m_uLoginPlayerIdGuild`; V15 never uses it).
2. Core acks, cache sends JOIN to the world; the world loads the player from the DB and calls `CUser::Open`
   (`WORLDSERVER/User.cpp:312-348`), whose first snapshot is sent as **`PACKETTYPE_JOIN 0x0000ff00`** (same snapshot layout,
   client `OnJoin` -> `OnSnapshot`, `Neuz/DPClient.cpp:903-917`). Order inside it:
   `ENVIRONMENTSETTING`, world-read info, **`ADD_OBJ` (me)**, game timer, task bar, environment, **player data**
   (`AddPlayerData`), friend game join, party name, game join, **`ALL_GUILDS` (all guilds, desc + ranking)**,
   **`GUILD` (my guild, full; only if I have one)**, **`WAR` (only if my guild is at war)**, events, lord, couple.
   So my own mover (with `m_idGuild`) exists before the guild tables arrive; resolve names lazily.
3. Later, guild-house info on world entry (`WORLDSERVER/DPDatabaseClient.cpp:1251`, `AddGuildHouseAllInfo`, snapshot `GUILDHOUSE_ALLINFO 0x8812`).
4. After `GUILD`, the client itself asks for member player data (`QUERY_PLAYER_DATA2`), replies are
   `SNAPSHOTTYPE_QUERY_PLAYER_DATA 0x0141` = `u_long id, string name (max 31), sPlayerData` raw 12 bytes
   (`BYTE job, BYTE level, BYTE sex, pad, int ver, BYTE uLogin, 3 pad`, `_Common/playerdata.h:6-14`; `Neuz/DPClient.cpp:13576-13592`).
   Later changes come as `PACKETTYPE_UPDATE_PLAYER_DATA 0xf000f808` (`u_long id + sPlayerData`, `Neuz/DPClient.cpp:977-990`).
   (Same mechanism as the messenger/friends list.)

### 3.2 Other players' guild ids (CMover serialization in ADD_OBJ)
`SNAPSHOTTYPE_ADD_OBJ 0x00f0` = `objid`, `WORD 0x00f0`, `BYTE objType`, `DWORD index`, then `CCtrl::Serialize`
(`WORLDSERVER/User.cpp:688-702`). Player part of `CMover::Serialize` (`_Common/ObjSerializeOpt.cpp:97-160`, read side :359-452):

| offset from the first CObj byte | field | type |
|---|---|---|
| 0 | type | u_char |
| 1 | index | DWORD |
| 5 | scale*100 | u_short |
| 7 | pos | 3 x float |
| 19 | angle*10 | short |
| 21 | objid (CCtrl, `_Common/ObjSerialize.cpp:15-27`) | OBJID |
| 25 | motion | u_short |
| 27 | bPlayer | u_char |
| 28 | hp | LONG |
| 32 | state | DWORD |
| 36 | state flag | DWORD |
| 40 | belligerence | u_char |
| 41 | m_dwMoverSfxId (`__VER >= 15` PETVIS) | DWORD |
| 45 | name | string (4 + L) |
| 49+L | sex, skinSet, hairMesh | 3 x u_char |
| 52+L | hairColor | DWORD |
| 56+L | headMesh | u_char |
| 57+L | idPlayer | u_long |
| 61+L | job | u_char |
| 62+L | str, sta, dex, int, level | 5 x u_short |
| 72+L | fuel, accFuel | int, int |
| **80+L** | **hasGuild** | u_char (1 = present) |
| 81+L | **m_idGuild**, **m_idWar** (only if hasGuild == 1) | u_long, u_long |
| 81+L or 89+L | **m_idGuildCloak** (always) | DWORD |
| next | hasParty (+ idParty, idDuelParty), authorization (char), mode, stateMode, ... | |

`m_idGuildCloak` = `m_idGuild` of the equipped guild cloak item (`_Common/MoverEquip.cpp:1839-1848`, texture via
`g_GuildTexture.LoadGuildTexture(m_idGuildCloak)` :1915), so a cloak shows its guild even for non-members.
Later changes: `SET_GUILD` / `SET_WAR` snapshots per mover.

### 3.3 Resolving a guild id to name/logo
The client keeps every guild in `g_GuildMng` (filled by `ALL_GUILDS`, kept up to date by the all-player broadcasts
`CREATE_GUILD`, `DESTROY_GUILD`, `GUILD_SETNAME`, `GUILD_LOGO`). Name and logo above a player are drawn from
`CMover::GetGuild()` = `g_GuildMng.GetGuild(m_idGuild)` (`_Common/Mover.cpp:8137`, `_Common/MoverRender.cpp:1484-1520`).
There is no per-id query packet. Other guilds' level/fund/win counts are only as fresh as the last ALL_GUILDS (login).
Member names/jobs/levels/online flags: PlayerData (3.1 step 4); the member tab uses `PlayerData.uLogin > 0` for online
(`_Interface/WndGuildTabMember.cpp:855`).

---------------------------------------------------------------------------------------------------------

## 4. Rules the client must follow

### 4.1 Creation (NPC only)
* NPC **MaSa_Helena** (Saint Morning; quest end position x 8463, z 3600), dialog keys 8 / 865 (`WORLDDIALOG/NpcScript.cpp:10913-10962`): quest **`QUEST_CREGUILD` (142)**
  finished (`QS_END`), **3 000 000 penya**, I am **party leader**, **party size >= 3**, and `IsPartyGuild() == 0` = every party
  member online, in no guild and not under the 48 h cooldown (`_Common/ScriptLib.cpp:738-780`). Then `RemoveGold(3000000)`,
  `CreateGuild()`, `Say(752)`; failures `Say(753)/Say(863)` (party) or `Say(755)` (quest/penya).
* Quest 142 (`Resource/propQuest.inc:15710-15726`): begin and end level **40..129**, any job, party end condition
  `SetEndCondParty( 2, 0, 3, 2 )`, giver/receiver MaSa_Helena.
* `CreateGuild` (`_Common/ScriptLib.cpp:799-834`) sends all party members (max `MAX_PTMEMBER_SIZE` 15) to core with
  an **empty name**; core (`CORESERVER/DPCoreSrvr.cpp:1344-1446`): master already in a guild -> `TID_GAME_COMCREATECOM`
  ("You are already in a guild. Leave the guild first then try again."); the leader becomes `GUD_MASTER`, the others
  `GUD_ROOKIE`; `m_adwPower[GUD_MASTER] = 0xFF`, every other rank 0, salaries 0, level 1, logo 0.
* Then the master names it from the guild window (`WndGuildTabInfo.cpp:534-550` -> name window id 0xff -> #2). Until named:
  contributions are lost (1.1 #16), the name shows empty everywhere.
* GM command `/createguild <name>` (`cg`, AUTH_GAMEMASTER3, `_Interface/FuncTextCmd.cpp:1095-1110, 5218`) creates one with a name.

### 4.2 Ranks, classes, rights
| rank (`Resource/defineJob.h:145-150`) | value | max members (`_Common/guild.cpp:328-329, 499-506`) | default rights |
|---|---|---|---|
| GUD_MASTER (Master) | 0 | 1 (`GM_MASTER`) | 0xFF (all) |
| GUD_KINGPIN (Kingpin) | 1 | 5 | 0 |
| GUD_CAPTAIN (Captain) | 2 | 10 | 0 |
| GUD_SUPPORTER (Supporter) | 3 | 20 | 0 |
| GUD_ROOKIE (Rookie) | 4 | the guild's max members | 0 |

Rank names are not in textClient; the client draws rank icons (`m_texPlayerDataIcon` frames 44..48, repeated class+1 times,
`_Interface/WndGuildTabMember.cpp:266-330`). Class `m_nClass` 0..2 (shown as 1..3 icons).

Rights bits (`_Common/guild.h:38-46`): `PF_MEMBERLEVEL 0x01` change titles (#9), `PF_LEVEL 0x02` change class (#10),
`PF_INVITATION 0x04` invite (#4), `PF_PENYA 0x08` take penya from the guild bank, `PF_ITEM 0x10` take items from the guild bank,
`PF_GUILDHOUSE_FURNITURE 0x20`, `PF_GUILDHOUSE_UPKEEP 0x40` (`__VER >= 15`). Edited in two tabs, both send the full 5-DWORD array:
`WndGuildTabApp` (bits 0x01..0x10, `_Interface/WndGuildTabApp.cpp:100-280`) and `WndGuildTabPower` (guild-house bits,
`_Interface/WndGuildTabPower.cpp:121-160, 256`). Master-only actions regardless of bits: kick, disband, name, nickname,
logo, cloak, authority, salary, change master, (notice: UI only).

### 4.3 Levels, members, contribution
* Table `expCompanyTest` in **`Resource/expTable.inc:477-530`** (loaded by DB server `databaseserver/Project.cpp:428`, sent to
  core `CORESERVER/DPDatabaseClient.cpp:254`; world/client load the same file `_Common/Project.cpp:3408`). Row N = level N:
  points and penya needed to **reach** level N from N-1, and max members at level N. Max level = 50 (rows).
  (`CGuild::sm_anMaxMemberSize` in `guild.cpp:325-326` is the same list but is no longer used, `guild.cpp:508-514`.)

| level | points needed | penya needed | max members |
|---|---|---|---|
| 1 | 0 | 0 | 30 |
| 2 | 24 | 5200 | 30 |
| 3 | 205 | 14625 | 32 |
| 4 | 485 | 34666 | 32 |
| 5 | 1353 | 58035 | 34 |
| 6 | 2338 | 100285 | 34 |
| 7 | 4547 | 139343 | 36 |
| 8 | 6788 | 208000 | 36 |
| 9 | 11045 | 263250 | 38 |
| 10 | 15151 | 361110 | 38 |
| 11 | 22183 | 432575 | 40 |
| 12 | 28800 | 561600 | 40 |
| 13 | 39340 | 649113 | 42 |
| 14 | 49135 | 810727 | 42 |
| 15 | 63920 | 914063 | 44 |
| 16 | 71608 | 1024000 | 44 |
| 17 | 84365 | 1064483 | 46 |
| 18 | 91041 | 1148727 | 46 |
| 19 | 109698 | 1238429 | 48 |
| 20 | 115152 | 1300000 | 48 |
| 21 | 134545 | 1443000 | 49 |
| 22 | 156813 | 1601730 | 50 |
| 23 | 182351 | 1777920 | 51 |
| 24 | 211610 | 1973491 | 52 |
| 25 | 245099 | 2190574 | 53 |
| 26 | 283396 | 2431537 | 54 |
| 27 | 327152 | 2699005 | 55 |
| 28 | 377106 | 2995896 | 56 |
| 29 | 434090 | 3325443 | 57 |
| 30 | 499049 | 3691241 | 58 |
| 31 | 573046 | 4097276 | 59 |
| 32 | 657283 | 4547976 | 60 |
| 33 | 753119 | 5048252 | 61 |
| 34 | 862086 | 5603559 | 62 |
| 35 | 985913 | 6219950 | 63 |
| 36 | 1126550 | 6904144 | 64 |
| 37 | 1286198 | 7663599 | 65 |
| 38 | 1467338 | 8506594 | 66 |
| 39 | 1672765 | 9442319 | 67 |
| 40 | 1905631 | 10480973 | 68 |
| 41 | 2169488 | 11633879 | 69 |
| 42 | 2468335 | 12913606 | 70 |
| 43 | 2806677 | 14334102 | 71 |
| 44 | 3189588 | 15910852 | 72 |
| 45 | 3622778 | 17661045 | 73 |
| 46 | 4112677 | 19603760 | 74 |
| 47 | 4666517 | 21760172 | 75 |
| 48 | 5292439 | 24153791 | 76 |
| 49 | 5999599 | 26810707 | 77 |
| 50 | 7075777 | 29759885 | 80 |

* Level-up needs **both** columns at once; both are subtracted from the guild's points / fund (`_Common/guild.cpp:582-607`);
  points are capped only by DWORD overflow; points are refused at max level, penya still accepted (`guild.cpp:554-580`).
* Points come only from gems (`IK3_GEM`): `(itemLV+1)/2` per gem, all gem stacks at once (1.1 #16). Penya: any `int > 0` you own.
* Member count hard cap: `MAX_GM_SIZE 128` (`_Common/guild.h:22`; world `DPCoreClient.cpp:1886`), table max 80.
* Guild member list UI shows `size / table max` (`_Interface/WndGuildTabInfo.cpp:453`).

### 4.4 Names
* Guild name (client only, `_Interface/WndGuildName.cpp:83-148`): trimmed; **3..32 bytes** (`__RULE_0516` is not defined, so
  the 6..24 branch is off; the error text `TID_DIAG_0011` says "6 to 18" but the check is 3..32); first char not a digit
  (`TID_DIAG_0012`); every byte alnum or Cyrillic or a DBCS pair (Korean must be Hangul) else `TID_DIAG_0013/0014`;
  `prj.IsInvalidName` (filter) / `IsAllowedLetter` (`__RULE_0615`) else `TID_DIAG_0020`. Server side: only uniqueness
  (and the world's non-blocking `TID_DIAG_0020` on the scroll path). Server buffer 48 bytes (`MAX_G_NAME`).
* First name: free, once, master only (#2). Rename: scroll `II_SYS_SYS_SCR_GCHANAM`, master only (#3).
* Guild names starting with a digit lock the master (server unify `SetAllAction`, `WORLDSERVER/User.cpp:635-668`): the server
  sends `SNAPSHOTTYPE_ALLACTION 0x00b7` (`BOOL bAllAction, BOOL bCharacter`) and the client forces the name window (id 0x7f).
* Nickname: master only, guild level >= 10, 2..12 bytes (server), UI only for the master at level >= 10
  (`WndGuildTabMember.cpp:609-631`).
* Notice: <= 127 bytes, not empty. Guild chat: < 260 bytes.

### 4.5 Logo and cloak
* Logo: guild level >= 2, master, not at war, once only (no reset path), ids 1..20 (21..27 GM only, 999 custom path is dead
  because `> CUSTOM_LOGO_MAX` is refused). Free.
* Cloak: logo set, master, guild fund >= 10 000 (taken from the fund, not the master), guild bank not full (42 slots,
  `MAX_BANK`, `_Common/ProjectCmn.h:9`); the cloak lands in the guild bank. Requires `GUILDBANK` in WorldServer.ini.

### 4.6 Leave / kick / disband
* Master cannot leave (must hand over with CHG_MASTER, both online). Only the master kicks. Only the master disbands.
* None of these during a guild war (core). UI also blocks during Guild Siege / 1:1 siege / Clockwork quest.
* Penalty: **48 h** before the removed player (or every member of a disbanded guild) can join or found a guild
  (`CTimeSpan(2,0,0,0)`, core `DPCacheSrvr.cpp:1225-1227, 1411-1413`, world `DPCoreClient.cpp:1820-1822, 1959-1960`);
  his guild cloaks are deleted from his inventory/equipment (`RemoveItemIK3( IK3_CLOAK )`). No penya loss.
  Contribution totals are kept by the guild record only for members (a removed member's are lost with his CGuildMember).

### 4.7 Runtime toggles on this server (`Program/WorldServer.ini`; the VM copy may differ)
`GUILDWAR` (line 11, guild duels), `GUILDBANK` (19, bank + contribution + cloak), `GUILDCOMBAT` (20, Guild Siege),
`GUILDCOMBAT1TO1` (21), `SECRETROOM` (23); `//WORMON` is commented out (guild-quest wormon spawns off, `WORLDSERVER/ThreadMng.cpp:251`).

---------------------------------------------------------------------------------------------------------

## 5. Other guild subsystems (ids only)

Compiled = present in the `__VER 15 __MAINSERVER` build of both Neuz and the servers. Most are `#if __VER >= N` blocks,
the commented `//#define __GUILD_COMBAT_1TO1` etc. in VersionCommon.h are only documentation.

### 5.1 Guild war (guild duel) -- compiled, runtime `GUILDWAR`
Client -> core (`Neuz/DPClientGuildWar.cpp:29-106`): `DECL_GUILD_WAR 0xf000b036` (`u_long idMe, string enemyGuildName`) declare;
`ACPT_GUILD_WAR 0xf000b037` (`u_long idMe, u_long idDeclGuild`) accept; `SURRENDER 0xf000b047` (`u_long idMe`);
`QUERY_TRUCE 0xf000b048` (`u_long idMe`) propose truce; `ACPT_TRUCE 0xf000b049` (`u_long idMe`) accept truce.
UI: `WndGuildWarDecl/Request/GiveUp/Peace/PeaceConfirm` (`_Interface/WndGuildWar*.cpp`); `/declwar` is admin-only.
Core rules (`CORESERVER/DPCacheSrvr.cpp:2426-2600`): master only, **both guilds level >= 6** (`TID_GAME_GUILDWARREQLV6`,
`TID_GAME_GUILDWAROHTERLV6`), target guild >= 10 members (`TID_GAME_GUILDWARMEMBER10`), target master online
(`TID_GAME_GUILDWARMASTEROFF`), neither at war. Duration 2 h (`_Common/guildwar.h:62-64`).
Core -> client top-level: `DECL_GUILD_WAR` (`u_long idDeclGuild, string declMaster`) -> request window to the target master;
`ACPT_GUILD_WAR` (`u_long idWar, idDecl, idAcpt`) -> war starts, `TID_GAME_GUILDWARSTART`; `WAR_DEAD 0xf000b045`
(`u_long idWar, string name, BOOL bDecl`) -> `TID_GAME_GUILDWARDEAD`; `WAR_END 0xf000b046` (`u_long idWar, int wptDecl,
int wptAcpt, int nType` WR_*); `SURRENDER` (`u_long idWar, u_long idPlayer, string name, BOOL bDecl`) -> `TID_GAME_GUILDWARGIVEUP`;
`QUERY_TRUCE` (no payload) -> truce confirm window. Server-internal: `WAR_TIMEOUT 0xf000b04a`, `WAR_MASTER_ABSENT 0xf000b04b`.
Snapshots: `SET_WAR 0x007a` (per mover `u_long idWar`), `WAR 0x00da` (`u_long idWar` + CGuildWar = `u_long idWar,
WAR_ENTRY decl, WAR_ENTRY acpt` (each 20 bytes: `u_long idGuild, int nSize, int nSurrender, int nDead, int nAbsent`),
`char flag` ('0' wartime .. '9' end), `time_t start` (32-bit, `_USE_32BIT_TIME_T` in `Neuz/StdAfx.h:10`)) (`_Common/guildwar.cpp:41-61`).

### 5.2 Guild Siege (guild combat, `GuildCombat.txt`) -- compiled (`__VER >= 8` path), runtime `GUILDCOMBAT`
Client -> world (`Neuz/DPClient.cpp:9147-9236`): `IN_GUILDCOMBAT 0xf000d022` (`BYTE GC_IN_WINDOW 0x01` | `BYTE GC_IN_APP 0x02 +
DWORD penya`) open window / apply; `OUT_GUILDCOMBAT 0xf000d023` cancel; `REQUEST_STATUS 0xf000d028` status window;
`SELECTPLAYER_GUILDCOMBAT 0xf000d027` (`BOOL bWindow`; if FALSE `u_long defender, int n, n x u_long`) line-up;
`SELECTMAP_GUILDCOMBAT 0xf000d02b` (`int map`); `JOIN_GUILDCOMBAT 0xf000d024`; `GETPENYAGUILD_GUILDCOMBAT 0xf000d02d`;
`GETPENYAPLAYER_GUILDCOMBAT 0xf000d02e`; `TELE_GUILDCOMBAT 0xf000d030`; `PLAYERPOINT_GUILDCOMBAT 0xf000d031`
(`GETITEM 0xf000d02f` is `__VER < 8` only). Client <- `SNAPSHOTTYPE_GUILDCOMBAT 0x00b8` + `BYTE GC_*` subtype
(`_Network/MsgHdr.h:1533-1556`, handler `OnGuildCombat` `Neuz/DPClient.cpp:6776`). Core-internal: `ADD/START/RESULT/STATE/...` 0xf000d021-0xf000d032.

### 5.3 1:1 Guild Siege -- compiled (`__VER >= 11`), runtime `GUILDCOMBAT1TO1`
Client -> world (`Neuz/DPClient.cpp:16728-16786`): `GC1TO1_TENDEROPENWND 0xf000f700`, `TENDERVIEW 0xf000f701`, `TENDER 0xf000f702`
(`int penya`), `TENDERCANCEL 0xf000f703`, `TENDERFAILED 0xf000f709`, `MEMBERLINEUPOPENWND 0xf000f705`, `MEMBERLINEUP 0xf000f706`
(`size_t n` (4 bytes, Win32) + n x `u_long`), `TELEPORTTONPC 0xf000f707`, `TELEPORTTOSTAGE 0xf000f708`. Client <- snapshots
`GC1TO1_NOWSTATE 0x0125`, `TENDEROPENWND 0x0126`, `TENDERVIEW 0x0127`, `MEMBERLINEUPOPENWND 0x0128`, `WARRESULT 0x0129`
(dispatch `Neuz/DPClient.cpp:736-740`; rules in `Resource/GuildCombat1TO1.lua`). DB-internal 0xf000f710-0xf000f715.

### 5.4 Guild bank -- compiled, runtime `GUILDBANK`
Client -> world: `GUILD_BANK_WND 0xf000b020` open (`SendOpenGuildBankWnd` :9681), `GUILD_BANK_WND_CLOSE 0xffffff3e` (:9687),
`PUTITEMGUILDBANK 0xf000b021` / `GETITEMGUILDBANK 0xf000b022` (`BYTE nId, DWORD num, BYTE mode` - mode 0 = penya, 1 = item, `_Interface/WndField.cpp:2069, 8602-8644`;
`GUILDHOUSE_PACKET` body is built in `_Common/GuildHouse.cpp:120`; senders :9765-9777), `GUILD_BANK_MOVEITEM 0xffffff3f`, `GUILDLOG_VIEW 0xf000f810` (`BYTE listType`, bank log, `__VER >= 11`, :17060).
Client <- snapshots `GUILD_BANK_WND 0x00fa`, `PUTITEMGUILDBANK 0x00ef`, `GETITEMGUILDBANK 0x00d4`, `REMOVE_GUILD_BANK_ITEM 0x00f3`,
`GUILDLOG_VIEW 0x0142` (dispatch :529-531, :686, :744). Taking out needs `PF_PENYA` / `PF_ITEM` (`_Common/guild.h:324-327`).
`PACKETTYPE_GUILD_MSG_CONTROL 0xf000b023` is world<->core sync of bank penya between multi-servers.

### 5.5 Guild house -- compiled (`__VER >= 15` / `__GUILD_HOUSE`, `Neuz/VersionCommon.h:205`); tender/auction NOT (`__GUILD_HOUSE_MIDDLE` internal/test only)
Client -> world: `GUILDHOUSE_BUY 0x88100001`, `GUILDHOUSE_PACKET 0x88100003` (furniture/upkeep sub-packets), `GUILDHOUSE_ENTER 0x88100006`,
`GUILDHOUSE_GOOUT 0x88100007` (`Neuz/DPClient.cpp:19046-19048`). Client <- snapshots `GUILDHOUSE_PACKET 0x8810`, `GUILDHOUSE_ALLINFO 0x8812`,
`GUILDHOUSE_REMOVE 0x8813`, `GUILDHOUSE_RESTPOINT 0x8814` (dispatch :860-863). Rights `PF_GUILDHOUSE_FURNITURE/UPKEEP`.
Tender ids `0x88100230-0x88100238` / snapshots `0x8840-0x8842` exist but are compiled out on main.

### 5.6 Guild quests (Clockwork etc., `Resource/propGuildQuest.inc`) -- compiled
Client <- `SNAPSHOTTYPE_SETGUILDQUEST 0x00b5`, `REMOVEGUILDQUEST 0x00b6` (`Neuz/DPClient.cpp:515-516, 8414, 8431`); the guild's quest list
also rides in `CGuild` full (`m_aQuest`). `PACKETTYPE_*GUILDQUEST 0xf000b051/53/56/5a` are DB-internal. Wormon spawns off (4.7).

### 5.7 Guild votes -- NOT active on main (`__GUILDVOTE` only internal/test), see 1 #22 and 2.3.

### 5.8 Guild ranking -- compiled: request 1 #21, reply snapshot `0x00db`, data also at the end of `ALL_GUILDS`.

### 5.9 Custom (`__BB_*`) touching guilds
Only `__BB_STAFF_MODERATOR_AUTH` (invite block for staff moderators, 1.1 #4). Per the owner's rule, keep custom features out of web-client scope.
