# Neuz V15 research: chat commands, tickets in use, flying wings

Research only. No repo file was changed. Paths:
- `Source/...`, `Resource/...` and `Client/...` are under `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15`.
- `apps/...`, `packages/...`, `tools/...` and `dist/...` are under the port worktree `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\ui-fixes`.
- `FuncTextCmd.cpp`, `WndCommunication.cpp` and other files are CP949. Read them with `iconv -f CP949 -t UTF-8 -c`; the line numbers stay the same.

## 0. Build switches relied on

`Source/Neuz/VersionCommon.h` defines `__MAINSERVER` at line 3. Because of that, `__INTERNALSERVER` is not defined (lines 6-8).

What is active:
- the main block, lines 13-260;
- the `__MAINSERVER` block, lines 471-482.

What is not active: the `__INTERNALSERVER` block, lines 261-405. So `__ATTACH_MODEL` (378), `__SKILL0517` and the other switches in that block are OFF.

`__CLIENT` is defined for Neuz only (`Neuz/StdAfx.h:12,39`). `_DEBUG` is not defined: the only configuration is `NoGameguard` with `NDEBUG` (`Neuz/Neuz.vcxproj:44`).

A switch written as `#if __VER >= N // __NAME` is ON whenever N ≤ 15, whatever the commented name says.

| Define | State | Where |
|---|---|---|
| `__VER` | 15 | VersionCommon.h:4 |
| `__SYS_TICKET` | on | :91 |
| `__BUFF_1107` | on | :153 |
| `__AZRIA_1023` | on | :151 |
| `__WING_ITEM` | on | :191 |
| `__PETVIS` | on | :204 |
| `__YS_CHATTING_BLOCKING_SYSTEM` | on | :237 |
| `__BAN_CHATTING_SYSTEM` | on | :238 |
| `__JEFF_9_20` | on | :98 |
| `__PET_1024` | on | :152 |
| `__NPC_BUFF` | on | :79 |
| `__S1108_BACK_END_SYSTEM` | on | :19 |
| `__EVENT_1101` | on | :23 |
| `__SFX_OPT` | on | :104 |
| `__LAYER_1020` | on | :150 |
| `__QUIZ` | on | :229 |
| `__EVENTLUA_COUPON` | on | :77 |
| `__CAMPUS` | on | :222 |
| `__15_5TH_ELEMENTAL_SMELT_SAFETY` | on | :225 |
| `__EVE_BALLOON` | on | :39 |
| `__BB_VIP_AUTH_LEVELS` | on, BB custom | :208 |
| `__BB_STAFF_MODERATOR_AUTH` | on, BB custom | :212 |
| `__INTERNALSERVER`, `__ATTACH_MODEL`, `__AMAKI`, `__CSC_EXTEXTURE`, `_DEBUG` | off | — |

**Language.** Both programs run in English:
- Neuz: `IDS_LANG "1"`, `IDS_SUBLANG "0"` (`Source/Neuz/WinMain.rc:1828-1829`, read by `NeuzMsgProc.cpp:100-107`).
- World server: `IDS_LANG "1"`, `IDS_SUBLANG "0"` (`Source/WORLDSERVER/WorldServer.rc:137-138`, read by `WorldServer.cpp:117-127`; `Program/WorldServer.ini:6` also says `LANG 1`).
- The values are `LANG_KOR 0` and `LANG_ENG 1` (`Resource/lang.h:6-7`).
- **`GetLanguage() != LANG_KOR` is therefore true in both programs.** This matters for §A.

The BB-custom auth levels are mentioned only where they change the shared code path. They are out of FlyffWeb scope (owner rule of 2026-11-03).

---

## A. Chat commands

### A.1 Neuz has a command popup, a history and a channel prefix

The chat window is `CWndChat` in `Source/_Interface/WndCommunication.cpp`. Its edit box is `CWndEditChat m_wndEdit`.

**Popup list (`CWndCommand`).** The source is `Source/_Interface/WndCommand.cpp` and `.h`, a `CWndListBox`.

When it opens (`WndCommunication.cpp:876-889`):
- On `EN_CHANGE`, it opens when the edit text is non-empty, its first character is `/`, the caret offset is 1 (`m_wndEdit.GetOffset() == 1`) and no list is open yet.
- In practice it opens the moment `/` is typed as the first character.
- The prefilled texts `"/s "` and similar have the caret at 3, so they do not open it.

Where it appears: the list's bottom edge sits on the top-left corner of the edit box (`point.y -= list height`, :885-888).

What it lists (`WndCommand.cpp:47-94`):
- It walks `m_textCmdFunc[]`. Outside Korea it **stops at the entry `open`** (:55-59).
- It adds each entry for which `g_pPlayer->IsAuthHigher( entry.m_dwAuthorization )`.
- Outside Korea it forces `g_Option.m_nChatCommand = 2` (:63-64), so the text shown is the **long English name `m_pCommand`** (:75-76).
- `SortListBox()` sorts case-insensitively (`_stricmp`, `WndControl.cpp:2462-2473`).

Size (`WndCommand.cpp:89-91`):
- Width 160 px.
- Height `nNum * (fontHeight + 3) + 8`, with `nNum` the number of rows clamped to 5-20.
- Style: `WBS_TOPMOST | WBS_VSCROLL` (:103).

Colours are the `CWndListBox` defaults (`WndControl.cpp:1802-1811`):
- text `ARGB(255,64,64,64)`;
- selected row `ARGB(255,64,64,255)`;
- row under the mouse `ARGB(255,255,128,0)`.

Hint text:
- The per-command `m_pszDesc` tooltip is shown **only when `GetLanguage() == LANG_KOR`** (`WndCommand.cpp:18-45`).
- An English client therefore shows **no hint or help text**, only the names.
- The descriptions are Korean anyway; English translations are in the table below.

Selection while typing (`WndCommunication.cpp:890-899`):
- On each change, the text after `/` with no space in it goes to `SelectString(0, text)` (`WndControl.cpp:2479-2494`).
- `FindString` (:2403-2433) does a binary search with case-sensitive `strcmp`. It picks the first row ≥ the typed text, and selects nothing (-1) if that row's first character differs from the typed one.
- The list is not filtered: every permitted command stays listed, and only the highlight moves.
- Typing a space closes the list (:896-899). Emptying the edit closes it (:924-926). A click in the edit (:23-29) or a loss of focus (:72-78) closes it too.

Enter while the list is open (`WndCommunication.cpp:758-778`):
- If a row is selected and its text differs from what follows `/`, the edit becomes `"/" + row + " "` and **nothing is sent** (`bFinished = FALSE`). This is the auto-complete.
- Otherwise the list closes and the line is sent.

Other list behaviour:
- A double-click on a row also completes to `"/" + row + " "` (`:720-731`, `WNM_DBLCLK`).
- The arrow keys do not move the list selection. `VK_DOWN` does nothing; `VK_UP` is history (`WndEditCtrl.cpp:1665-1677`).

**History** (`WndCommunication.cpp:15, 741-756, 822-828`):
- Up to `MAX_HISTORY_STRING` = 20 lines.
- Up arrow (`EN_UP`) steps back and wraps round to the newest. There is no Down.
- The port already has this (`apps/client/src/world/hud/chatWindow.ts:45-133`).

**Channel tabs** prefill the edit: Whisper `"/w "` or `"/w <last name> "`, Shout `"/s "`, Party `"/p "`, Guild `"/g "` (`:690-719`, and on focus while empty `:30-66`). After a `/w name ...` line is sent, `m_strCharName` remembers the name (`:834-845`).

**The head field.** The "head" field (`WIDC_HEAD`) is hidden and disabled at V15 (`#if __VER >= 11 // __CSC_VER11_1`, `:306-320`). Only a GM (`IsAuthHigher(AUTH_GAMEMASTER)`) gets clipboard copy and paste in the chat text and edit (`:298-303`).

### A.2 What happens to a line

1. **Enter.** `CWndChat::OnChildNotify` (`WndCommunication.cpp:779-833`) builds the string and calls `g_WndMng.ParsingChat(string)`.
2. **`CWndMgr::ParsingChat`** (`Source/_Interface/WndManager.cpp:3820-3851+`):
   - it trims the left and cuts to 120 bytes (`SetStrNull(string, 120)`);
   - **if `string[0] == '/'` it calls `ParsingCommand(string, g_pPlayer)` and ignores the result.** An unknown or unauthorized `/word` is silently dropped on the client; nothing is sent and no message is shown;
   - other text goes through the spam and ban timers and `g_DPlay.SendChat(string)`. A GM skips the anti-spam (:3873-3880).
3. **`ParsingCommand`** (`Source/_Interface/FuncTextCmd.cpp:5549-5650`; the same file is compiled into the World server, `WORLDSERVER/*.vcxproj:406`):
   - Tokenizes: `GetToken()` skips `/`, then the next token is the command (:5551-5555).
   - Walks the table. If `GetLanguage() != LANG_KOR` and the entry's long name starts with `open`, it **stops** (:5561-5565). Everything after `open` in the table is unreachable in English, on the client and on the server.
   - Match (:5567-5568): `scanner.Token == m_pCommand || == m_pAbbreviation || == m_pKrCommand || == m_pKrAbbreviation`. `Token` is a `CString`, so the match is **exact and case-sensitive** (`/Time` and `/ti` work, `/time` does not). `GetToken` does not lowercase (`_Common/Scanner.cpp:848`).
   - The first matching entry wins. If the auth check fails it does `break`, not a search for a later entry (:5588-5589). The check is `pMover->IsAuthHigher(entry.m_dwAuthorization)`, skipped when `bItem` is set (item- or buff-run commands).
   - BB only (`:5580-5586`): an `AUTH_STAFF_MODERATOR` skips the auth check and is refused only the commands of `BB_IsStaffModeratorBlockedCommand` (:5500-5548). Out of web scope.
   - **Client routing** (:5591-5603):
     - `TCM_CLIENT` (0) or `TCM_BOTH` (2): the client function runs. For `TCM_BOTH`, if it returns TRUE, `g_DPlay.SendChat(scanner.m_pBuf)` sends the whole line, possibly rewritten by the function through `scanner.SetProg`.
     - `TCM_SERVER` (1): `g_DPlay.SendChat(line as typed)`.
     - The values come from `TCM_CLIENT 0 / TCM_SERVER 1 / TCM_BOTH 2` (:109-111).
   - **Server routing** (:5604-5606): `TCM_SERVER` and `TCM_BOTH` run the server function. A `TCM_CLIENT` entry matches and returns TRUE (consumed, nothing done).
   - No match, client side (:5613-5647): if the line has no `#` and the text after `/` equals an emoticon command (case-insensitive `stricmp`), the line is sent as plain chat. Otherwise it returns FALSE and nothing is sent.
4. **Packet.** Every line goes as **`PACKETTYPE_CHAT` 0x00ff0000** carrying one `WriteString(line)` (`Neuz/DPClient.cpp:9139-9144`; `_Network/MsgHdr.h:112`). Commands and plain chat use the same packet.
5. **Server `CDPSrvr::OnChat`** (`WORLDSERVER/DPSrvr.cpp:691-740`):
   - if `sChat[0] == '/' && ParsingCommand(...)` returns TRUE, it stops (:709-710);
   - otherwise the line, `/` included, goes out as ordinary chat to the people nearby (`AddChat`, :738). `TALK_MODE` and mute stop that (:711-725).
   - Auth ≥ `AUTH_LOGCHATTING` 'G' is logged (:704-707).
6. **Shout, party and guild chat** are `TCM_BOTH`, and their client functions send for themselves:
   - Shout runs the spam limits, `WordChange`, then `SendChat("/s " + text)` and returns FALSE (`FuncTextCmd.cpp:1856-1990`).
   - Party chat needs a party of 2 or more; otherwise it shows `TID_GAME_PARTYNOTCHAT` (:2110-2131). It sends `"/p " + text`.
   - Guild chat sends `"/g " + text` (:1172-1183).

**Gotchas for the port.** The port sends every typed `/` line as is: `chatWindow.ts:96-110`, then `encodeChat` 'nearby' (`packages/protocol/src/world/chat.ts:33-39`).
- The `#ifdef __CLIENT` block of the table (`tradeagree` … `ignorelist`, `FuncTextCmd.cpp:5150-5168`) **does not exist in the World server's table**.
  - So `/tradeagree`, `/ignore x` and the others, sent raw, find no match on the server and are **broadcast to everyone nearby as chat text**.
  - `/ta` goes further: on the server it matches `notalk` (GM2). For a player the auth check fails, so it is broadcast as chat too.
- An unknown `/foo` is also broadcast. Neuz never sends either case.
- `/position` and `/Time` exist on the server as `TCM_CLIENT`, so they are swallowed silently there and the player sees nothing.
- **To match Neuz, the port must run the `TCM_CLIENT` commands locally, and must not send a `/` line that matches no entry or fails the auth check (except an emoticon line).**

### A.3 Auth levels and how the client knows its own

**Levels** (`Source/_Common/authorization.h:6-27`). Each is one character (letter or digit), compared by rank (`GetAuthorizationRank`, :59-83; `IsAuthorizationHigher`, :93-102). `CMover::IsAuthHigher(x)` returns `rank(own) >= rank(x)` (`_Common/Mover.h:1061`).

| Name | Char | Rank |
|---|---|---|
| `AUTH_OBSERVER` | 'D' 0x44 | 0 |
| `AUTH_GENERAL` | 'F' 0x46 | 10 |
| `AUTH_GENERAL_VIP1/2/3` (BB) | '1' '2' '3' (0x31-0x33) | 11-13 |
| `AUTH_LOGCHATTING` | 'G' | 20 |
| `AUTH_JOURNALIST` | 'H' | 30 |
| `AUTH_HELPER` | 'J' | 40 |
| `AUTH_STAFF_MODERATOR` (BB) | 'K' | 45 |
| `AUTH_GAMEMASTER` (GM1) | 'L' 0x4c | 50 |
| `AUTH_GAMEMASTER2` | 'M' | 60 |
| `AUTH_GAMEMASTER3` | 'N' | 70 |
| `AUTH_OPERATOR` | 'O' | 80 |
| `AUTH_ADMINISTRATOR` | 'P' 0x50 | 90 |

An unknown character falls back to comparing the raw letters (:98-99). The port must compare **ranks**, not raw bytes: the BB VIP '1' (0x31) is numerically below 'F' but ranks above it.

**Where it comes from.** The `ADD_OBJ` of a player, `CMover::Serialize` on the loading side (`Source/_Common/ObjSerializeOpt.cpp:405-462`). The player block is laid out in this order:

| # | Field | Type |
|---|---|---|
| 1 | name | `ReadString` |
| 2 | sex | `u8` |
| 3 | skinSet | `u8` |
| 4 | hairMesh | `u8` |
| 5 | hairColor | `u32` |
| 6 | headMesh | `u8` |
| 7 | idPlayer | `u32` |
| 8 | job | `u8` |
| 9 | str, sta, dex, int, level | `u16` × 5 |
| 10 | m_nFuel | `i32` |
| 11 | m_tmAccFuel | `i32` |
| 12 | `u8` flag; when it is 1: idGuild, idWar | `u32` × 2 |
| 13 | idGuildCloak | `u32` |
| 14 | `u8` flag; when it is 1: idparty, idDuelParty | `u32` × 2 |
| 15 | **`m_dwAuthorization`** (`ar >> (char&)m_dwAuthorization`, :460) | **`u8`** |
| 16 | m_dwMode | `u32` |
| 17 | m_dwStateMode | `u32` |

The name is variable length, so there is no fixed byte offset. The own player's `ADD_OBJ` is the source for `g_pPlayer`. Nothing changes the auth later in a session.

**The port already reads it:**
- `packages/protocol/src/world/addObj.ts:116` (`authorization: r.u8()`), into `added.player.authorization` (`packages/protocol/src/world/types.ts:445`);
- `apps/client/src/world/authorization.ts:6-16` has `AUTH_GAMEMASTER = 0x4c` and `isGameMaster(a) = a >= 0x4c`;
- used in `WorldScreen.ts:1493,1971,2009`, `hud/targetBar.ts:141` and `render/nameTags.ts:84-91`.

For the command list the port needs a full `rankOf(char)` that mirrors `authorization.h:59-83`, and `isAuthHigher(own, required) = rankOf(own) >= rankOf(required)`. The fallback for unknown characters is a raw compare.

### A.4 The command table active at V15

The source is `BEGINE_TEXTCMDFUNC_MAP` … `END_TEXTCMDFUNC_MAP`, `FuncTextCmd.cpp:5135-5496`. The entry format is `ON_TEXTCMDFUNC(func, long, short, krLong, krShort, TCM, AUTH, desc)` (:114-116; struct in `FuncTextCmd.h`).

There are 211 entries after the `#if` and `#ifdef` evaluation. **The first 111 (lines 5137-5284) are reachable in English; the 100 from `open` (line 5291) on are not** (§A.2, step 3).

None of the command names is language-dependent: they are literal strings, not TIDs. Each entry also matches its Korean names. The emoticon commands (§A.5) are the only text-ID names.

How to read the table:
- "Params" is what the server, or the client part, reads in order.
- `CL` means the client part runs; `SV` means the line goes to the server.
- `BOTH` means the client part runs first, then the server's.
- "Name" in Params is a character name, one token. An item or monster name as one token is the English `szName` (`m_mapII`/`m_mapMVI` key, `_Common/ProjectCmn.cpp:519`, `Project.h:1292-1314`). Put it in double quotes when it has spaces; `CScanner` reads a quoted string as one token.
- The descriptions are translations of `m_pszDesc`. Neuz never shows them in English.

**AUTH_GENERAL ('F') — every player**

| Line | Function | Long | Short | Route | Params | Description |
|---|---|---|---|---|---|---|
| 5137 | TextCmd_whisper | whisper | w | SV | `<name> <text>` | Whisper (`TID` replies via `AddReturnSay`) |
| 5138 | TextCmd_say | say | say | SV | `<name> <text>` | Whisper (second form) |
| 5139 | TextCmd_Position | position | pos | CL only | — | Prints "Position : x = %f, y = %f, z = %f" (`TID_GAME_NOWPOSITION`, colour 0xffccffcc) (:3568-3578) |
| 5140 | TextCmd_shout | shout | s | BOTH | `<text>` (≤260) | Shout; the client applies the spam limit and sends `/s text` itself (:1856+) |
| 5141 | TextCmd_PartyChat | partychat | p | BOTH | `<text>` | Party chat; the client needs a party of 2 or more, then sends `/p text` |
| 5142 | TextCmd_Time | Time | ti | CL only | — | Prints "Real Time - HH:MM:SS" and "Madrigal Time - h:m:s" (:170-183) |
| 5144 | TextCmd_GuildChat | GuildChat | g | BOTH | `<text>` | Guild chat; the client sends `/g text` |
| 5145 | TextCmd_PartyInvite | PartyInvite | partyinvite | SV | `<name>` | Party invite |
| 5146 | TextCmd_GuildInvite | GuildInvite | guildinvite | SV | `<name>` | Guild invite |
| 5148 | TextCmd_CampusInvite | CampusInvite | campusinvite | SV | `<name>` | Campus (master/pupil) invite |
| 5151 | TextCmd_tradeagree | tradeagree | ta | CL only | — | Accept trade requests (`g_Option.m_bTrade=1`, `TID_GAME_TRADEAGREE`) (:3764) |
| 5152 | TextCmd_traderefuse | traderefuse | tr | CL only | — | Refuse trade requests |
| 5153 | TextCmd_whisperagree | whisperagree | wa | CL only | — | Accept whispers (`m_bSay=1`) |
| 5154 | TextCmd_whisperrefuse | whisperrefuse | wr | CL only | — | Refuse whispers |
| 5155 | TextCmd_messengeragree | messengeragree | ma | CL only | — | Accept messenger (friend) requests |
| 5156 | TextCmd_messengerrefuse | messengerrefuse | mr | CL only | — | Refuse messenger requests |
| 5157 | TextCmd_stageagree | stageagree | ga | CL only | — | Accept party invites (`m_bParty`) |
| 5158 | TextCmd_stagerefuse | stagerefuse | gr | CL only | — | Refuse party invites |
| 5159 | TextCmd_connectagree | connectagree | ca | CL only | — | Friend log-in notices on (`m_bMessengerJoin`) |
| 5160 | TextCmd_connectrefuse | connectrefuse | cr | CL only | — | Friend log-in notices off |
| 5161 | TextCmd_shoutagree | shoutagree | ha | CL only | — | Show shouts (`m_bShout`) |
| 5162 | TextCmd_shoutrefuse | shoutrefuse | hr | CL only | — | Hide shouts |
| 5164 | TextCmd_BlockUser | ignore | ig | CL only | `<name>` | Block a player's chat (client list, `TID_GAME_USER_CHATTING_BLOCKING`) (:3838-3881) |
| 5165 | TextCmd_CancelBlockedUser | unignore | uig | CL only | `<name>` | Unblock |
| 5166 | TextCmd_IgnoreList | ignorelist | igl | CL only | — | Opens the block-list window `CWndChattingBlockingList` |

**AUTH_GAMEMASTER ('L', GM level 1)**

| Line | Function | Long | Short | Route | Params | Description |
|---|---|---|---|---|---|---|
| 5171 | TextCmd_Teleport | teleport | te | SV | `<name>` or `<worldId> <x> <z>` or `<worldId> <regionKey>` | Teleport (:2375-2461) |
| 5172 | TextCmd_Invisible | invisible | inv | SV | — | Invisible (`TRANSPARENT_MODE`) |
| 5173 | TextCmd_NoInvisible | noinvisible | noinv | SV | — | Visible again |
| 5174 | TextCmd_Summon | summon | su | SV | `<name>` | Summon a player to you |
| 5175 | TextCmd_count | count | cnt | SV | — | "Players online: %d" |

**AUTH_GAMEMASTER2 ('M')** (plus one `AUTH_HELPER` 'J' entry, `system`)

| Line | Function | Long | Short | Route | Params | Description |
|---|---|---|---|---|---|---|
| 5178 | TextCmd_Out | out | out | SV | `<name>` | Kick |
| 5179 | TextCmd_Talk | talk | nota | SV | `<name>` | Allow talking again (un-mute) |
| 5180 | TextCmd_NoTalk | notalk | ta | SV | `<name>` | Forbid talking. **`/ta` is taken by `tradeagree` on the client; use `/notalk`** |
| 5181 | TextCmd_ip | ip | ip | BOTH | `<name>` | Show a player's IP. Client: with a player targeted it sends `/ip <target name>` (:3609-3630) |
| 5183 | TextCmd_Mute | Mute | mute | SV | `<name> <seconds>` | Mute (`m_dwMute`, minus 1 a second, `Mover.cpp:3781-3784`) |
| 5185 | TextCmd_GuildRanking | GuildRanking | ranking | SV | — | Refresh the guild ranking |
| 5186 | TextCmd_FallSnow | FallSnow | fs | SV | — | Snow on |
| 5187 | TextCmd_StopSnow | StopSnow | ss | SV | — | Snow off |
| 5188 | TextCmd_FallRain | FallRain | frain | SV | — | Rain on |
| 5189 | TextCmd_StopRain | StopRain | sr | SV | — | Rain off |
| 5190 | TextCmd_System | system | sys | SV | `<text>` (<512) | System message to all (`AUTH_HELPER` 'J') |

**AUTH_GAMEMASTER3 ('N')**

| Line | Function | Long | Short | Route | Params | Description |
|---|---|---|---|---|---|---|
| 5193 | TextCmd_PvpParam | PvpParam | p_Param | SV | `<fame> <slaughter>` | PvP (chaos) values |
| 5195 | TextCmd_PKParam | PKParam | pkparam | SV | `<pkValue> <propensity>` | PK values |
| 5197 | TextCmd_Undying | undying | ud | BOTH | — | Invincible (`MATCHLESS_MODE`) |
| 5198 | TextCmd_Undying2 | undying2 | ud2 | BOTH | — | Half-invincible (hurt, cannot die) |
| 5199 | TextCmd_NoUndying | noundying | noud | BOTH | — | Invincibility off |
| 5200 | TextCmd_Onekill | onekill | ok | BOTH | — | One-hit kills |
| 5201 | TextCmd_NoOnekill | noonekill | nook | BOTH | — | One-hit kills off |
| 5202 | TextCmd_AroundKill | aroundkill | ak | SV | — | Damage the monsters around (64 m; needs a weapon) |
| 5203 | TextCmd_stat | stat | stat | SV | `<str\|sta\|dex\|int\|gp\|restate\|all> <n>` | Set a stat |
| 5204 | TextCmd_Level | level | lv | SV | `<jobName> <level> [1\|2]` | Set level (and job; 1/2 = hero/master variant) |
| 5205 | TextCmd_InitSkillExp | InitSkillExp | InitSE | SV | — | Reset skills |
| 5206 | TextCmd_SkillLevel | skilllevel | slv | BOTH | `<level>` | Set the level of the skill selected in the skill window. The client rewrites the line to `/slv <skillId> <level>` (`TID_GAME_GAMETEXT001`) (:1356-1403) |
| 5207 | TextCmd_SkillLevelAll | skilllevelAll | slvAll | BOTH | — | Every skill to max |
| 5208 | TextCmd_BeginQuest | BeginQuest | bq | SV | `<questId>` | Start quest |
| 5209 | TextCmd_EndQuest | EndQuest | eq | SV | `<questId>` | Finish quest |
| 5210 | TextCmd_RemoveQuest | RemoveQuest | rq | SV | `<questId> [name]` | Remove quest |
| 5211 | TextCmd_RemoveAllQuest | RemoveAllQuest | raq | SV | — | Remove all quests |
| 5212 | TextCmd_RemoveCompleteQuest | RemoveCompleteQuest | rcq | SV | — | Remove the finished quests |
| 5213 | TextCmd_ChangeJob | changejob | cjob | SV | `<jobName>` | Change job |
| 5214 | TextCmd_Freeze | freeze | fr | SV | `<name>` | Freeze (cannot move) |
| 5215 | TextCmd_NoFreeze | nofreeze | nofr | SV | `<name>` | Unfreeze |
| 5216 | TextCmd_PartyLevel | PartyLevel | plv | SV | `<level> <points>` | Party level |
| 5217 | TextCmd_GuildStat | GuildStat | gstat | SV | `logo\|pxp\|penya <n>` or `notice <text>` | Guild stats |
| 5218 | TextCmd_CreateGuild | createguild | cg | SV | `<name>` | Create a guild |
| 5219 | TextCmd_DestroyGuild | destroyguild | dg | CL only | — | The client sends `PACKETTYPE_DESTROY_GUILD` 0xffffff32 (`DPClient.cpp:12493`) for its own guild |
| 5220 | TextCmd_GuildCombatIn | GCIn | gcin | BOTH | — | Enter the guild siege |
| 5221 | TextCmd_GuildCombatOpen | GCOpen | gcopen | BOTH | — | Open the guild siege |
| 5222 | TextCmd_GuildCombatClose | GCClose | gcclose | BOTH | `<n>` | Close the guild siege |
| 5223 | TextCmd_GuildCombatNext | GCNext | gcNext | BOTH | — | Guild siege next stage |
| 5224 | TextCmd_indirect | indirect | id | BOTH | `<npcObjId> <text>` | Make an NPC speak. With no arguments the client opens the Indirect Talk window and sends nothing |
| 5225 | TextCmd_CreateNPC | createnpc | cn | SV | `<moverId\|name> [count≤100] [aggressive 0/1]` | Spawn monsters or NPCs |
| 5227 | TextCmd_LuaEventList | EVENTLIST | eventlist | SV | — | List the Lua events |
| 5228 | TextCmd_LuaEventInfo | EVENTINFO | eventinfo | SV | `<id>` | Lua event info |
| 5230 | TextCmd_GameSetting | gamesetting | gs | SV | — | Show the game settings |
| 5231 | TextCmd_RemoveNpc | rmvnpc | rn | SV | `<objectId>` | Remove an NPC |

**AUTH_ADMINISTRATOR ('P', GM level 4)**

| Line | Function | Long | Short | Route | Params | Description |
|---|---|---|---|---|---|---|
| 5234 | TextCmd_Disguise | disguise | dis | SV | `<moverId\|name>` | Transform |
| 5235 | TextCmd_NoDisguise | noDisguise | nodis | SV | — | Undo the transformation |
| 5236 | TextCmd_ResistItem | ResistItem | ritem | BOTH | `<element 0-5> <elemLv 0-20> <upgrade 0-10>` | Element on an item. The first use opens the upgrade window; with an item in it the client sends `/ritem <objId> e l u` (:1612-1661) |
| 5237 | TextCmd_JobName | jobname | jn | CL only | — | Prints the expert and professional job names |
| 5238 | TextCmd_GetGold | getgold | gg | SV | `<amount>` | Get penya |
| 5239 | TextCmd_CreateItem | createitem | ci | BOTH | `<itemId\|"name"> [count] [charged 0/1]` | Create an item. With no arguments the client opens the Admin Create Item window and sends nothing (:2535-2582) |
| 5240 | TextCmd_CreateItem2 | createitem2 | ci2 | SV | `<"name"> <randomOptItemId>` | Create an item with an awakening |
| 5241 | TextCmd_QuestState | QuestState | qs | SV | `<questId> <state> [name]` | Set a quest's state |
| 5242 | TextCmd_LoadScript | loadscript | loscr | BOTH | — | Reload the scripts |
| 5243 | TextCmd_ReloadConstant | ReloadConstant | rec | SV | — | Reload constant.inc |
| 5244 | TextCmd_CTD | ctd | ctd | BOTH | — | Add the event "Duel Zone" region |
| 5245 | TextCmd_Piercing | Piercing | pier | BOTH | `<sockets>` | Piercing. With an item in the piercing window the client sends `/pier <objId> <n>` |
| 5247 | TextCmd_PetLevel | petlevel | pl | BOTH | — | Pet level up (at 100% EXP) |
| 5248 | TextCmd_PetExp | petexp | pe | BOTH | — | Pet EXP to max |
| 5249 | TextCmd_MakePetFeed | makepetfeed | mpf | BOTH | — | Opens the pet food mill window |
| 5250 | TextCmd_Pet | Pet | pet | BOTH | `<name> <kind> <expRate> <levelDigits> <life>` | Set a pet |
| 5253 | TextCmd_Lua | Lua | lua | SV | `event\|ms\|rr` | Reload a Lua script |
| 5256 | TextCmd_GC1to1Open | GC1TO1OPEN | gc1to1open | BOTH | `[1]` | 1:1 guild war open |
| 5257 | TextCmd_GC1to1Close | GC1TO1CLOSE | gc1to1close | BOTH | — | 1:1 guild war close |
| 5258 | TextCmd_GC1to1Next | GC1TO1NEXT | gc1to1next | BOTH | — | 1:1 guild war next |
| 5259 | TextCmd_RefineAccessory | RefineAccessory | ra | BOTH | `<level>` | Upgrade the accessory in bag slot 0 |
| 5260 | TextCmd_RefineCollector | RefineCollector | rc | BOTH | `<level 0-5>` | Upgrade the collector in bag slot 0 |
| 5261 | TextCmd_GenRandomOption | GenRandomOption | gro | BOTH | — | Random awakening on bag slot 0 |
| 5262 | TextCmd_InitializeRandomOption | InitializeRandomOption | iro | BOTH | — | Clear the awakening on bag slot 0 |
| 5263 | TextCmd_SetRandomOption | SetRandomOption | sro | BOTH | `<dst> <adj> [<dst> <adj>…]` | Set the awakening on bag slot 0 |
| 5266 | TextCmd_SetPetName | SetPetName | setpetname | SV | `<name>` | Name the pet |
| 5267 | TextCmd_ClearPetName | ClearPetName | cpn | CL only | — | The client sends `PACKETTYPE_CLEAR_PET_NAME` 0x8FFFFF01 |
| 5270 | TextCmd_Propose | Propose | propose | SV | `<name>` | Couple proposal |
| 5271 | TextCmd_Refuse | Refuse | refuse | SV | — | Refuse a proposal |
| 5272 | TextCmd_Couple | Couple | couple | SV | — | Accept, couple |
| 5273 | TextCmd_Decouple | Decouple | decouple | SV | — | Break up |
| 5274 | TextCmd_ClearPropose | ClearPropose | clearpropose | SV | — | Clear the proposal |
| 5277 | TextCmd_NextCoupleLevel | NextCoupleLevel | ncl | SV | — | Couple level up |
| 5281 | TextCmd_RemoveAllBuff | RemoveBuff | rb | BOTH | — | Remove all your buffs |
| 5284 | TextCmd_HonorTitleSet | HonorTitleSet | hts | BOTH | `<titleIdx\|name> <count>` | Set a title counter |

A `BOTH` row whose client part is not described in the table has no client code: the line is simply forwarded. The client parts that do exist are those of shout, partychat, GuildChat, ip, skilllevel, indirect, ResistItem, CreateItem, Piercing and MakePetFeed.

**Unreachable in English** (lines 5291-5495, all `AUTH_ADMINISTRATOR`; for completeness):
- open, close, music/mu, sound/so, localevent/le, CommercialElem, SetPlayerName/spn, SetGuildName/sgn, DeclWar, rgm, GuildRankingUpdate;
- gmitem, gmnotitem, gmattck, gmnotattck, gmcommunity, gmnotcommunity, gmobserve, gmnotobserve, EscapeReset;
- userlist/ul, SetGuildQuest/sgq, Snoop, SnoopGuild/sg, GCRequest, GCCancel;
- PostMail/pm, RemoveMail/rm, GetMailItem/gm, GetMailGolg/gmg, InvenClear/icr, ExpUpStop/es, monstersetting/ms, CallTheRoll/ctr, AExp, RemAttr;
- StartCollecting/col1, StopCollecting/col2, Battery, AvailPocket/ap, PocketView/pv, MoveItemPocket/mip, ItemLevel/il, COUPON, CreatePc/cp, SfxLevel/sl;
- SROPEN, SRNEXT, SRENTRANCE, SRTENDER, SRLINEUP, SRCLOSE, SRVIEW, SRCANCEL;
- ElectionRequirement/er, ElectionAddDeposit/ead, ElectionSetPledge/esp, ElectionIncVote/eiv, ElectionProcess/ep, ElectionBeginCandidacy/ebc, ElectionBeginVote/ebv, ElectionEndVote/eev, ElectionState/estate, LEventCreate, LEventInitialize, LSkill, RemoveTotalGold/rtg;
- SetTutorialState/sts, TaxApplyNow/tan, HeavenTower/HTower, RemoveJewel/RJewel, TransEggs/TEggs, PickupPetAwakeningCancel/ppac;
- CreateLayer/cl, DeleteLayer/dl, Layer/lay;
- RRApp, RROpen, RRNext, RRPass, RRKawiBawiBo, RRDice, RRArithmetic, RRStopWatch, RRTyping, RRCard, RRLadder, RRFINISH;
- HousingVisit/hv, HousingGMRemoveAll/hgmra, SmeltSafetyElement/sse;
- QuizEventOpen/qeo, QuizEventEnterance/qee, QuizStateNext/qsn, QuizEventClose/qec;
- BuyGuildHouse/bgh, GuildHouseUpkeep/ghu, RemoveCampusMember/rcm, UpdateCampusPoint/ucp, InvenRemove/irm.

Neuz lists none of these and runs none of them. The World server does not either: its language is ENG, so it stops at `open` too. `#ifdef _DEBUG` entries (createchar and others, :5332-5338) are not compiled.

Counts in the English list:
- 25 rows for AUTH_GENERAL. 17 of them are `TCM_CLIENT`, and 15 of those are in the client-only `#ifdef __CLIENT` block.
- 5 for GM1.
- 10 for GM2, plus 1 for HELPER.
- 35 for GM3.
- 35 for ADMIN.

The popup of a player shows the 25 GENERAL rows. A full admin sees all 111, sorted case-insensitively by long name.

### A.5 What a normal player can type

- **Channels:** `/w <name> <text>` (or `/whisper`, `/say`), `/s <text>` (`/shout`), `/p <text>` (`/partychat`), `/g <text>` (`/GuildChat`). Plain text is nearby chat.
- **Toggles:** `/ta /tr /wa /wr /ma /mr /ga /gr /ca /cr /ha /hr` (long forms in the table).
- **Tools:** `/pos`, `/ti`, `/ig <name>`, `/uig <name>`, `/igl`, `/PartyInvite <name>`, `/GuildInvite <name>`, `/CampusInvite <name>`.
- **Emoticons:** `/<word>`, from `Resource/textEmotion.txt`, which maps index to `IDS_TEXTEMOTION_TXT_*`. They are loaded by `CDialogMsg::LoadEmotion` (`_Common/DialogMsg.cpp:1014-1042`) with English names from `textEmotion.txt.txt`:

| Index | Command | Index | Command | Index | Command |
|---|---|---|---|---|---|
| 0 | laugh | 10 | yummy | 20 | mad |
| 1 | sad | 11 | sneer | 21 | aha |
| 2 | kiss | 12 | sparkle | 22 | embarrassed |
| 3 | surprise | 13 | ridicule | 23 | help |
| 4 | blush | 14 | sleepy | 24 | crazy |
| 5 | anger | 15 | rich | 25 | oh! |
| 6 | sigh | 16 | glare | 26 | confused |
| 7 | wink | 17 | sweat | 27 | ouch |
| 8 | ache | 18 | cat face | 28 | love |
| 9 | hunger | 19 | tongue | | |

How an emoticon line travels:
- The sender's line `/laugh` goes out as plain chat (`FuncTextCmd.cpp:5635-5641`).
- Receivers, including the sender, compare the whole message **case-sensitively** with `"/" + command` and then show icon `index` of `Theme/texChatEmoticon.inc` above the speaker instead of a bubble (`DialogMsg.cpp:840-854`, `:780-784`).
- A chat line `!<n>` shows icon `n` of `texDialogEmoticon.inc` (:855-861).
- Emoticons are **not** in the `/` popup list.

---

## B. Tickets "in use" in the bag

### B.1 The draw

The source is `CWndItemCtrl::OnDraw`, `Source/_Interface/WndItemCtrl.cpp:367-660`. The inventory branch (`nParent == APP_INVENTORY || APP_BAG_EX`) is lines 456-551. For each bag item (:472-487) the code is:

```
if( ( m_nItemNum == GetExtra() || !m_useDieFlag )            // m_useDieFlag is FALSE except in the special "die" mode
    && ( IsUsingItem(pItemElem)                              // GetExtra() != 0 (Item.cpp:28-37)
         || pItemElem->m_bRepair                             // sitting in the repair window
         || ( nParent == APP_INVENTORY && g_pPlayer->GetPetId() == pItemElem->m_dwObjId )   // the summoned pet
         || pPlayer->GetTicket() == pItemElem ) )            // __SYS_TICKET: the ticket in use
    RanderIcon( p2DRender, pItemElem, x*32, y*32, nParent, 60 );          // <- faded
else if( m_nOnSelect == i )      // hovered: drawn 4 px bigger at -2,-2 ...
    ... alpha 100 for an unopened Pet Feed Pocket or the ticket, else 255
else
    ... alpha 100 for II_SYS_SYS_SCR_PET_FEED_POCKET with m_dwKeepTime <= 0, else 255   (:509-516)
```

The faded draw:
- `RanderIcon(..., nalpha=60)` (:256-365) calls `GetTexture()->Render(p2DRender, pt, 60)`.
- That is `C2DRender::RenderTexture` with `D3DRS_TEXTUREFACTOR = ARGB(60,0,0,0)`, colour `SELECTARG1(TEXTURE)` and alpha `MODULATE(TEXTURE, TFACTOR)` (`_Common/2DRender.cpp:828-870`, the states at :862-869).
- **Result: the icon's own colours, with its alpha multiplied by 60/255 (≈ 0.235 opacity).** There is no tint and no grey.
- A faded item is never drawn enlarged on hover: the first branch wins.
- The stack count (:529-539) and the cooldown radar (:541-551) are drawn normally on top.

Other looks drawn by `RanderIcon`:
- **Expired item** (`m_byFlag & CItemElem::expired` 0x01) (:345-361): `Render2(..., D3DCOLOR_ARGB(nalpha, 255, 100, 100))`. That is `MODULATE(TEXTURE, DIFFUSE)` for colour and alpha (`2DRender.cpp` `RenderTexture2`). It gives a **red tint**: R×1, G×100/255, B×100/255, with alpha `nalpha`.
- An expired ticket is tinted, not faded: `GetTicket()` skips expired ones.
- In the shop window only, the same red tint marks items the player cannot use or afford (:260-343). This is not the bag.
- If the school event `EVE_SCHOOL` is on, no tint at all (:351-364).
- The non-inventory containers (bank and others) fade at alpha 60 only for `IsUsingItem || m_bRepair` (:690-691).

**Which items look faded in the bag:**

| Item | Alpha |
|---|---|
| The ticket in use | 60 |
| The summoned pet's item (`CMover::GetPetId()`, the `__PET_0410` system pet) | 60 |
| Items partly or wholly put up in a trade, private shop or similar (`m_nExtra != 0`) | 60 |
| Items in the repair window | 60 |
| Pet Feed Pocket `II_SYS_SYS_SCR_PET_FEED_POCKET` not yet opened (`m_dwKeepTime <= 0`) | 100 (≈ 0.39) |

Items that are **not** faded:
- rides, flying or worn (a worn ride is in the equipment, not the grid);
- eat pets (buff pets, `IsUsingEatPet`);
- premium or buff items with an active buff;
- keep-time items in general.

The unused `CItemElem::isusing = 0x04` flag (`_Common/Item.h:119`) is never read in V15. The flag bits are `expired 0x01`, `binds 0x02` and `isusing 0x04`.

### B.2 "In use" for a ticket

`CMover::GetTicket()` (`Source/_Common/Mover.cpp:11666-11692`) works like this:

1. Take the buff `m_buffs.GetBuffByIk3( IK3_TICKET )`.
   - That is the first buff whose item prop has `dwItemKind3 == IK3_TICKET` (122).
   - Only `CBuffItem` (`BUFF_ITEM` = 0) answers `IsIk3` (`_Common/buff.cpp:320-324`, `buff.h:52,127`).
2. If there is none, return NULL.
3. Otherwise scan `m_Inventory.GetAtId(i)` for `i = 0 .. m_dwItemMax-1`.
4. Return the **first** item with:
   - `m_dwKeepTime > 0`;
   - `dwItemKind3 == IK3_TICKET`;
   - `m_dwItemId == buff id`;
   - not `expired`.

So at most one ticket is faded: the lowest object id among identical activated ones. The same rule is `CMover::IsUsing` (:11259-11285), which also covers pets and the pet feed pocket.

**What sets the state.** Using a ticket: `CUser::DoUseItemTicket` (`WORLDSERVER/User.cpp:3419-3489`), reached through `DoUseItemInput` with `__AZRIA_1023` (:8568-8576).
- First use (`m_dwKeepTime == 0`): `UpdateItem(objId, UI_KEEPTIME, prop.dwAbilityMin)`, in minutes. This sends `SNAPSHOTTYPE_UPDATE_ITEM` with param `UI_KEEPTIME` = 11.
- The client then sets `m_dwKeepTime = now + value minutes` (`_Common/MoverParam.cpp:4027-4032`).
- `DoApplySkill(this, prop)` adds the **`BUFF_ITEM` buff with id = the ticket's item id**. Its `dwSkillTime` is 999999999, so it never runs out. It arrives as `SNAPSHOTTYPE_SETSKILLSTATE` and is also in the own `ADD_OBJ`'s `m_buffs`.
- The server teleports to the ticket world.
- Using it again inside the ticket world removes the buff and sends the player to Flaris (:3426-3439).
- The server also strips the ticket buffs once outside a ticket world (`User.cpp:423-437`, every 16 ticks).

Keep time on login: `CItemElem::Serialize` (`_Common/ObjSerialize.cpp:110-119`) reads `m_dwKeepTime`, then, if it is non-zero, `time_t t` (seconds left, 4 bytes). The client stores `m_dwKeepTime = time_null() + t`.

Expiry: `UI_FLAG` (9) with `MAKELONG(objIndex, byFlag)`. The client sets `m_byFlag = HIWORD(value)` (`MoverParam.cpp:4034-4047`).

**The tickets** (`Resource/propItem.txt`; `IK1_SYSTEM`, `IK2_SYSTEM`, `IK3_TICKET` 122; `dwSkillTime` 999999999):

| Id | Define | Name | Lasts (`dwAbilityMin`, min) |
|---|---|---|---|
| 26529 | II_SYS_TICKET_KEBARAS01 | Azria Ticket (7 days) | 10080 |
| 26530 | II_SYS_TICKET_KEBARAS02 | Azria Ticket (15 days) | 21600 |
| 26558 | II_SYS_TICKET_KEBARAS001 | Azria Ticket (1 day) | 1440 |
| 26681 | II_SYS_TICKET_CISLAND01 | Coral Island Ticket (1 day) | 1440 |
| 26682 | II_SYS_TICKET_CISLAND02 | Coral Island Ticket (15 days) | 21600 |

The ticket tooltip shows the time left as `TID_TOOLTIP_DATE` d/h/m/s while `m_dwKeepTime` is set and the ticket is not expired (`WndManager.cpp:5866-5890`, the `IK3_TICKET` test at :5882).

### B.3 What the port lacks

- `InventoryItem` (`packages/protocol/src/world/types.ts:345-363`) has `flag` but **no keep time**. `readItem` reads and drops it (`packages/protocol/src/world/own.ts:157-159`). Keep `keepTime` as seconds left at the time read, then derive an absolute time.
- `OwnState` `updateItem` (`apps/client/src/world/OwnState.ts:382-396`, `itemUpdated` :730-755) ignores `UI_FLAG` (9) and `UI_KEEPTIME` (11). Add:
  - `UI_FLAG` → `flag = (value >>> 16) & 0xff`;
  - `UI_KEEPTIME` → `keepTime = now + value*60 s`.
- The own buffs are already tracked (`WorldState.ts:477-479,633`, `MoverBuffs` in `apps/client/src/world/buffs.ts`; `BUFF_ITEM` = 0).
- The inventory grid (`apps/client/src/world/hud/inventoryWindow.ts:141-147`; `.inventory-cell img`, `style.css:1652`) needs a class for "faded" (`opacity: 0.235` on the img only, not on the count). Optionally:
  - an "expired" tint, as a red multiply (`R×1, G×0.392, B×0.392`);
  - opacity 0.392 for the unopened Pet Feed Pocket.
- The ticket rule: faded = the first bag item (lowest object id, any slot) with `keepTime > 0`, `kind3 === 122`, `!(flag & 1)`, and an own buff `(type 0, id === item.itemId)`.

---

## C. "Flying Wings display is not shown"

There are two kinds of wings in V15:
1. **Wing rides** (`IK3_WING` 137, flown like a broom);
2. **Buff wings**: an effect on the back while an item buff is on.

Both are drawn by Neuz. The port draws neither correctly.

### C.1 Wing rides

The list comes from `Resource/propItem.txt`:
- kind1 `IK1_RIDE`, kind2 `IK2_RIDING`, kind3 `IK3_WING` = 137 (`Resource/defineItemkind.h:199`);
- part `PARTS_RIDE` 13, `dwFlightLimit` 1;
- turn 0.8, pitch 2, fuel 3000, accel fuel 12, price 1000000;
- `dwSfxObj` `XI_FLIGHT_READY`;
- **rider motion base `dwUseMotion` = `MTI_FSTAND1_D` 1206** (the `_D` flight set 1206-1218, `Resource/defineNeuz.h:1089-1101`; brooms use `_A` 31, boards `_B` 61).

Models: `mdlDyna.inc` `item` entries, all `MODELTYPE_ANIMATED_MESH` and `MD_FAR`. Neuz loads the model `Client/Model/Item_<name>.o3d`, the skeleton `.chr`, and the motions `Item_<name>_stand.ani` and `_walk.ani`.

| Id | Define | Name | Speed | mdlDyna name (line) | Client/Model files | Port assets (`dist/assets`, via `index.json`) |
|---|---|---|---|---|---|---|
| 5819 | II_RID_RID_WIN_FEATHER01 | Elegant White Wings | 0.0035 | RidRidWinFeather01 (3557) | .o3d .chr _stand.ani _walk.ani; texture `TextureMid/Item_RidRidWinFeather01.dds` | `models/item_ridridwinfeather01.glb`, `skeletons/…`, `motions/item_ridridwinfeather01/…_stand.glb`, `…_walk.glb` |
| 5820 | II_RID_RID_WIN_FEATHER02 | Elegant Black Wings | 0.0035 | RidRidWinFeather02 (3558) | all 4 + TextureMid dds | all present |
| 5821 | II_RID_RID_WIN_ANGEL01 | Angelic Wings | 0.0037 | RidRidWinAngel01 (3560) | all 4 (`_Stand.ani` capital S) + TextureMid dds | all present |
| 5822 | II_RID_RID_WIN_PROPHET01 | Wings of the Divine Prophet | 0.0038 | RidRidWinProphet01 (3561) | all 4 + TextureMid dds | all present |
| 20103 | II_RID_RID_WIN_ANGEL02 | Angel's Wings (White) | 0.0037 | RidRidWinAngel02 (3563) | all 4 + TextureMid dds | all present |
| 20104 | II_RID_RID_WIN_PROPHET02 | Prophet's Wings (White) | 0.0038 | RidRidWinProphet02 (3564) | all 4 + TextureMid dds | all present |
| 20125 | II_RID_RID_WIN_BUTTERFLY01 | Crimson Butterfly Wings | 0.0037 | RidRidButterPeaCock01 (5975) | all 4 + .dds | all present |
| 20126 | II_RID_RID_WIN_BUTTERFLY02 | Alabaster Butterfly Wings | 0.0037 | RidRidButterBuJun01 (5976) | all 4 + .dds | all present |
| 20127 | II_RID_RID_WIN_BUTTERFLY03 | Indigo Butterfly Wings | 0.0037 | RidRidButterMolPo01 (5977) | all 4 + .dds | all present |
| 20128 | II_RID_RID_WIN_BUTTERFLY04 | Transulcent Butterfly Wings | 0.0037 | RidRidButterTrans01 (5978) | all 4 + .dds | all present |
| 20129 | II_RID_RID_WIN_BUTTERFLY05 | Translucent Dragonfly Wings | 0.0037 | RidRidDragonfly01 (5979) | all 4 + .dds | all present |

About the converter and the port's data:
- Its item key is `models/item_<lower-case name>.glb` (`tools/convert/src/data/gameDataStage.ts:336-360`; `models/modelsStage.ts:1-6` writes `skeletons/<name>.glb` and `motions/<skeleton>/<motion>.glb`).
- The converted item props have the right `model` key and `flight.motion` 1206 for all 11 wings (`data/itemProps.json`).
- The rider's `_D` motions are converted: `motions/mvr_male/mvr_male_genfstand1-d.glb` and the others, mapped 1206-1218 in `data/movers.json`.

Each wing glb has two scene roots: `skeleton` (bones `BoneF`, `BoneFR01-04`, `BoneFL01-04`) and `lod0`, a skinned mesh with `skin0`, 9 joints. Its material uses alpha MASK, is double-sided, and has effect 6.

**How Neuz loads it:**
- `OBJMSG_MODE_FLY` (`_AIInterface/ActionMoverMsg.cpp:1092-1102`):
  - `prj.m_modelMng.LoadModel(OT_ITEM, rideId)`. For an `OT_ITEM` `ANIMATED_MESH`, it loads `<file>.chr` if that file exists (`_Common/ModelMng.cpp:240-253`, `__WING_ITEM`).
  - If the model has bones, it calls `LoadMotion( GetMotionFileName("stand") )`, the name being `"item_<name>_stand.ani"` (`_Common/ModelObject.cpp:374-386`). The default loop is `ANILOOP_LOOP` (`Model.h:132`).
  - Then `SetRide`.
- The same is done for movers that spawn already flying (`Neuz/DPClient.cpp:1172-1185, 1275-1286`).

**How Neuz animates it** each client tick (`_Common/Mover.cpp:3542-3555`):
1. If the ride has bones, `WingMotionSetting(pModel)` runs (:10704-10738). Its rules (`OBJSTA_*` and `OBJSTAF_*` are in `_Common/MoverMsg.h:8,25-26,99,102`):
   - **Stand:** if `(state & OBJSTA_STAND)` and `|m_vDelta|² <= 0` and the **rider's** `m_fFrameCurrent == 0`, and the flag is not FLOATING: load `_stand`, blend, loop; flag = FLOATING.
   - **Walk:** else if `stateFlag & OBJSTAF_ACC` (thrust on), and the flag is not FLYING: load `_walk`, blend, loop; flag = FLYING.
   - **Turn:** else if LTURN or RTURN: flag = TURNING; the motion is not changed.
   - The flag starts as FLOATING (:464-467). The stand motion is already loaded at mount.
2. `m_pRide->FrameMove(NULL, GetRideFrameSpeed())` (:10740-10759):
   - speed = `1 + |lenSq(vDelta) − lenSq(previous)| × 7000`, then `+1.2` if both ACC and TURBO;
   - clamped to 1-4;
   - the frame advances by `m_fPerSlerp × speed` a tick (`_Common/Model.cpp:13-50`).

**How Neuz places it** (`_Common/MoverRender.cpp:591-651`). It is drawn only while flying and not `TRANSPARENT_MODE`. `pModel` is the rider's model, and `m_mUpdateBone` holds the animated bone matrices in **model space**.

| Ride kind3 | Ride matrix (D3D, row vectors) |
|---|---|
| `IK3_STICK` 41 (brooms) | `Translation(0, bone0._42, 0) × m_matWorld`: raised by the rider's root bone height (:601-609) |
| `IK3_WING` 137 | see below (:610-646) |
| everything else (boards, `IK3_BOARD` 40, and others) | `m_matWorld` (feet) |

For `IK3_WING`, the steps are:

```
SPINE1_BONE = 4   // the rider's "Bip02 Spine2"   (rotation source: the wings follow the body)
SPINE2_BONE = 5   // the rider's "Bip02 Neck"     (position source)
matEvent  = RotZ(-90°) × RotX(180°) × bone[4]          // D3DXMatrixMultiply order as written at :622-628
matEvent.translation = bone[5].translation             // _41,_42,_43
if ride is II_RID_RID_WIN_FEATHER01 or _FEATHER02:     // 5819, 5820 only
    matEvent._42 -= 0.02 ; matEvent._43 += 0.1         // model-space nudge (D3D)
mRide = matEvent × m_matWorld
```

- `RotZ(-90)·RotX(180)` as a D3D matrix is `[[0,1,0],[1,0,0],[0,0,-1]]`, so a wing-local `(x,y,z)` becomes `(y, x, -z)` in bone-4 space.
- Its web (three.js) form after `toWebMatrix` is the same numbers: `Matrix4().fromArray([0,1,0,0, 1,0,0,0, 0,0,-1,0, 0,0,0,1])`, because none of the mirrored indices is non-zero.
- The bone indices were checked against `Client/Model/mvr_male.chr` and `mvr_female.chr`: 0 Bip02, 1 Pelvis, 2 Spine, 3 Spine1, **4 Spine2**, **5 Neck**.
- The port's skeleton glb puts joint *i* at node *i+1* under the `skeleton` node: node 5 "Bip02 Spine2", node 6 "Bip02 Neck".

**In web terms**, for a wing ride parented to the mover's holder (model space = holder-local):

```
wingLocal = B4' · R_web
B4' = holderInverse · joint4.matrixWorld,
      with its translation set to (holderInverse · joint5.matrixWorld).position
      + (0, -0.02, -0.1) for 5819 and 5820 only (the D3D nudge mirrored in z)
```

Compute it after the rider's pose each frame, where `raiseRide` runs now.

The ride's own skeleton plays `_stand` or `_walk` by the rules above.

**How this differs from brooms and boards:**
- Those are static meshes (`lod0`, no skin; `MODELTYPE_MESH` except the Tiger board, which is a vertex-animated `ANIMATED_MESH` with no `.chr`).
- They have no motion files and sit at the feet, or at the root-bone height for brooms.
- Wings are the only boned rides (the 11 `.chr` files in `Client/Model` are exactly these 11 wings).
- The Ladolf boards also draw an extra `mvr_Ladolf` model in front (:655-710). That is not relevant here.

**Why the port shows no wing ride today:**
- `MoverViews.syncRide` (`apps/client/src/world/render/MoverViews.ts:493-519`) loads every ride through `loadRideModel` (`apps/client/src/world/render/moverModels.ts:120-131`).
- That function **removes every scene child except `lod0`** (:127). For a wing glb this removes the `skeleton` root that holds the joints of `lod0`'s skin.
- GLTFLoader had already run `scene.updateMatrixWorld()` at load (`node_modules/three/examples/jsm/loaders/GLTFLoader.js:2745`). The detached bones therefore keep their bind-pose `matrixWorld` around the **world origin** forever. The scene's matrix update never reaches them again.
- With three's default attached bind mode, the skinned vertices come out at those frozen bone positions. **The wings are drawn (or culled) in bind pose at the map's origin (0,0,0), not on the player.** Nothing visible appears on the character. (This is derived from the three r186 skinning code, not observed in a browser.)

Even with the skeleton kept, three things are missing:
1. `raiseRide` (:535-545) handles only `IK3_STICK` (41). `IK3_WING` 137 falls to "at the feet", with no spine or neck attachment and no rotation.
2. No ride motion is loaded or played. There is no mixer for the ride, so there is no `_stand` or `_walk` and no `GetRideFrameSpeed`.
3. The ride is not assembled through the skeleton path.
   - `assembleCharacter` (`packages/scene/src/character/assemble.ts:153+`) with `skeletons/item_<name>.glb` and the model glb would give a root and an `AnimationMixer`.
   - Then load `motions/item_<name>/item_<name>_stand.glb` and `_walk.glb`, as for movers (`apps/client/src/world/render/looks.ts:184-186`, `moverModels.ts:66-90`).

Brooms and boards draw today because their glb has only `lod0`.

The wing items are mountable in the port: `isRide` is `part === 13 && flight !== undefined` (`apps/client/src/world/items/rideItems.ts:21-23`).

### C.2 Buff wings (golden wings on the back)

| Id | Define | Name (propItem.txt.txt) | Kinds | Buff time | `dwSfxObj2` | `dwSfxObj3` (on use) |
|---|---|---|---|---|---|---|
| 6319 | II_SYS_SYS_EVE_WINGS | **Cupid Wings** (no description) | IK1_SYSTEM / IK2_BUFF / IK3_MAGICTRICK | 300000 ms (5 min) | XI_NAT_WINGANGEL01 | XI_NAT_CUPITSTART01 |
| 10223 | II_CHR_MAG_TRI_ANGELWING | Wings of an Angel ("Gives a character golden wings for a limited time") | IK1_CHARGED / IK2_BUFF / IK3_MAGICTRICK | 120000 ms (2 min) | XI_NAT_WINGANGEL01 | XI_NAT_WASTART01 |

Note that 6319 is "Cupid Wings" in this data. "Wings of an Angel" is 10223.

Both are `BUFF_ITEM` buffs (`HasBuff(BUFF_ITEM, id)`). They are sent with `SNAPSHOTTYPE_SETSKILLSTATE` to everyone in visibility range (`WORLDSERVER/User.cpp:5658-5682`), and carried in `ADD_OBJ`.

**The wings are an SFX, not a model part.** `CMover::Process`, client side, for **every** mover (`_Common/Mover.cpp:3738-3754`):
- every 1100 ms (`g_tmCurrent - m_dwWingTime > 1100`);
- if `HasBuff(BUFF_ITEM, 10223) || HasBuff(BUFF_ITEM, 6319)` and no wing yet: `m_pSfxWing = CreateSfx(XI_NAT_WINGANGEL01, GetPos(), GetId(), 0, NULL_ID, nSec = -1)`;
- otherwise, if a wing exists: `m_pSfxWing->Delete()` and NULL.
- So the wings appear up to 1.1 s after the buff arrives and go up to 1.1 s after it ends.

`XI_NAT_WINGANGEL01` is 1095 (`Resource/defineObj.h:630`). It maps to `sfx_effchrwingangel01` in `mdlDyna.inc:854`; the file is `Client/SFX/sfx_effchrwingangel01.sfx`, with textures `SFX/Texture/sfx_EffChrWingAngel01*.dds`. `CreateSfx` makes it a **`CSfxRotate`** (`_Common/CreateObj.cpp:223-225`). `CSfxRotate` (`_Common/Sfx.cpp:3373-3432`) behaves as follows:
- **Process**, each tick:
  - `vPos = GetEventPos(event 0)` of the mover's model;
  - `SetPos(vPos)`;
  - `SetAngle(-mover.GetAngle())`;
  - when the sfx model ends it restarts at frame 0, so it loops;
  - `nSec == -1` means it is never self-deleted;
  - it is deleted when the mover is gone.
- **Render:** recomputes the same position, then `m_pSfxObj->m_vPos = pos` (**no 0.2 m lift**), `m_vRotate.y = GetAngle()`, and the scale from the index entry (1).
- `GetEventPos(&v, 0)` is `TransformCoord(m_pBone->m_vEvent[0], m_mUpdateBone[m_nEventParentIdx[0]])` (`_Common/ModelObject.h:313-316`), then × the mover's world matrix.
- From the `.chr` files:
  - `mvr_male.chr`: event 0 = **(0.1648, 0.003, -0.0687) in bone 4 (Bip02 Spine2) space**;
  - `mvr_female.chr`: event 0 = **(0.1873, 0.004, -0.0715) in bone 4**.
- These events are stored after the hand matrices in `.chr` version ≥ 6 (`_Common/Bone.cpp:132-150`). The port's `.chr` parser keeps them (`packages/formats/src/model/chr.ts:65-68,126-131`). The skeleton glb does **not** export them; it has only `extras.grips` (`tools/convert/src/models/skeletonGlb.ts:95-99`).
- Web position: `joint4.matrixWorld × (x, y, -z)`. Heading: as the plain effects, `-moverAngle`.

**The use-time effects:**
- The server sends `dwSfxObj3` with `CREATESFXOBJ` at (0,0,0), which means "at the mover" (`MoverSkill.cpp:1227-1262`, `DPClient.cpp` `OnCreateSfxObj`).
- On the client, `XI_NAT_WASTART01` 1096 and `XI_NAT_CUPITSTART01` 1098 both play `sfx_effchrwastart01`. Its sound is `ItemChrWAngel.wav` (`mdlDyna.inc:853,858`).
- They also make an extra `XI_NAT_WINGANGEL01` with `nSec` = 0, which deletes itself after 1 tick (`CreateObj.cpp:226-233`). The visible wings are the `m_pSfxWing` above.

**The port today:**
- The assets exist: `effects/sfx_effchrwingangel01.json` and `effects/sfx_effchrwastart01.json`. `data/effectsIndex.json` maps 1095, 1096 and 1098.
- The use rules are done (`apps/client/src/world/items/premiumItems.ts:126-160`).
- **No code creates the persistent wing effect from the buff.**
- `EffectManager` (`apps/client/src/world/fx/EffectManager.ts:134-236`) has `followId`, `seconds` and `whileTrue`, but no **`CSfxRotate` mode**, which would place the effect each tick at a bone event of the mover's skeleton and turn it by `-moverAngle`. It also has no event-0 data.

What to add:
1. Per mover, every 1100 ms: if `buffs` has `(0, 10223)` or `(0, 6319)` and there is no wing effect, play xi 1095 looping with no end, as a "rotate" effect bound to the mover. Otherwise, remove it.
2. The rotate effect's position each tick: the event-0 offset (male or female) transformed by joint 4 (Spine2) of the mover's model. The converter could add `events` and `eventParents` to the skeleton glb extras, or the two vectors could be hard-coded.
3. Angle `-moverAngle`, no lift.
