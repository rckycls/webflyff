# Piece 7 M4 research — full parties

**Date:** 2026-11-04. **For:** `2026-11-03-piece7-design.md` §3.5, §4, §5 (M4 row), §7, and the plan
`plans/2026-11-04-piece7-m4-parties.md`. C++ paths are relative to `Source/`, resource paths to `Resource/`, client files
to `Client/`, FlyffWeb paths to the repository.

**Build flags.** Neuz, the world, the core and the cache server define `__MAINSERVER` and `__VER 15` with no condition
(`Neuz/VersionCommon.h:3-4`, `WORLDSERVER/…:3-4`, `CORESERVER/…:3-4`, `CACHESERVER/…:3-4`), so every
`__INTERNALSERVER` block is dead (Neuz :261-405), and with it the only `#define __IMPROVE_MAP_SYSTEM` (:390):
`_Interface/WndMapEx.cpp` is dead. The party code tests `__VER`, not the commented-out macro names, so these are live:
`#if __VER >= 11 // __SYS_PLAYER_DATA`, `>= 12 // __JHMA_VER12_1`, `>= 12 // __PARSKILL1001`, `>= 12 // __LORD`.
`#if __VER < 13 // __REMOVE_JOINPARTYMEMBER_ANI` is dead (no cheer motions). `__PARTYDEBUG` is defined nowhere, so
every `#ifndef __PARTYDEBUG` check is live. Also on: `__BUFF_1107`, `__S_SERVER_UNIFY`, `__RULE_0615`,
`__PARTY_DEBUG_0129`, `__IMPROVE_SYSTEM_VER15`, `__YS_CHATTING_BLOCKING_SYSTEM`, `__FIX_WND_1109`; core
`__MA_VER11_01`. Win32 MultiByte: `BOOL`, `int`, `LONG`, `u_long`, `DWORD`, `OBJID` 4 bytes; `TCHAR` 1. The English
`_ENG.inc` files apply (`IDS_LANG` "1", `Neuz/WinMain.rc:1828`).

**Strings** (`CAr::WriteString`/`ReadString`, `_Network/Misc/Src/ar.cpp:81-119`): `i32 len`, the bytes, no NUL.
`ReadString(buf, n)` takes 0 ≤ len ≤ n-1; otherwise Neuz zeroes the buffer and jumps to the end of the message (in a
snapshot, every later message is lost). "str(n)" below is `ReadString` with buffer n. `MAX_PLAYER` is 42
(`_Network/CmnHdr.h:486`). The port's `ArReader.string` throws instead (`packages/protocol/src/ar/ArReader.ts:102`).

The snapshot frame is `u32 objidPlayer`, `i16 count`, then per message `u32 objid`, `u16 type`, body
(`Neuz/DPClient.cpp:366-`). Every party snapshot is a `CUser::AddXXX` on one user's snapshot; the callers loop over the
party's members online on that world server. The frame objid is the receiver's own id except where noted; no party
handler reads it except PARTYSKILL_CALL and PARTYSKILL_SPHERECIRCLE.

---

## 1. Messages the client receives

### 1.1 Snapshots (`_Network/MsgHdr.h`)

| Type | Name | Body after objid + type | Sent | Neuz handler (`DPClient.cpp`) |
|---|---|---|---|---|
| 0x0081 | ERRORPARTY (:1036) | `u32 code`; if code == 207: `u32 skill` | world, one user (`User.cpp:1266-1279`): party skills, `/p` with no party | `OnErrorParty` :4296-4397, §1.3 |
| 0x0082 | PARTYMEMBER (:1037) | `u32 idPlayer`, str(42) leaderName, str(42) memberName, `i32 size`; if size ≠ 0 the party block (§3.2) | members on a join, a leave/kick (the remover gets size 0), a fall below 2 (size 0), and at log-in `(party, 0, leaderName, "")` (`WORLDSERVER/DPCoreClient.cpp:827-1003`, `DPDatabaseClient.cpp:1069-1077`) | `OnAddPartyMember` :4399-4542, §3.3 |
| 0x0083 | PARTYREQEST (:1038) | `u32 idLeader`, `i32 leaderLevel`, `i32 leaderJob`, `u8 leaderSex`, `u32 idMember`, `i32 memberLevel`, `i32 memberJob`, `u8 memberSex`, str(42) leaderName, `i32 bTroup` | the invitee only (`DPSrvr.cpp:7783`, `User.cpp:1400-1412`) | `OnPartyRequest` :4544-4579, §5.4 |
| 0x0084 | PARTYREQESTCANCEL (:1039) | `u32 idLeader`, `u32 idMember`, `i32 mode` | the inviter only (`User.cpp:1414-1427`) | `OnPartyRequestCancel` :4581-4677, §5.3 |
| 0x0085 | PARTYEXP (:1040) | `i32 exp`, `i32 level`, `i32 point` | members after every party kill, every point spend, a GM level set (`DPCoreClient.cpp:1265-1313`) | `OnPartyExpLevel` :4990-5002: exp and points stored; a higher level prints TID_GAME_TROUPEUP at level 10 (`MAX_PARTYLEVEL`, `ProjectCmn.h:28`), else TID_GAME_PARTYLUP |
| 0x0079 | ADDPARTYCHANGELEADER (:1026) | `u32 idNewLeader` | members (`User.cpp:1478-1487`) | `OnPartyChangeLeader` :5004-5021: `ChangeLeader` **swaps** slot 0 with the new leader's slot (`party.cpp:176-185`, no not-found check); clears the party-skill icons and `m_dwSkillTime`. No chat line |
| 0x0088 | PARTYCHANGETROUP (:1043) | str(33) name | members (`User.cpp:1389-1398`) | `OnPartyChangeTroup` :5295-5334: kind = 1; TID_GAME_PARTYCHANGE (0xff00ff00); `PlayMusic(BGM_IN_FITUP)` (25, `defineSound.h:1931`); the name copied only if non-empty |
| 0x0089 | PARTYCHANGENAME (:1044) | str(33) name | members (`User.cpp:1378-1387`) | `OnPartyChangeName` :5251-5293: a name that is non-empty and not TID_GAME_PARTY_NAME ("Advance Party") is stored, TID_GAME_PARTY "Party name has been changed to %s."; else the leader gets the name box (§6.4) |
| 0x0068 | ADDPARTYNAME (:1009) | str(**32**) name | one user at log-in (`User.cpp:338`): the player's saved advanced-party name | `OnMyPartyName` :5879-5882 → `g_pPlayer->m_szPartyName`, the name box's default |
| 0x008f | PARTYCHANGEITEMMODE (:1050) | `i32 mode` | members | `m_nTroupeShareItem` (:5241-5244) |
| 0x0090 | PARTYCHANGEEXPMODE (:1051) | `i32 mode` | members | `m_nTroupsShareExp` (:5246-5249) |
| 0x008d | SETPARTYMODE (:1048) | `i32 mode`, `u32 skillTime` (ms), `i32 on`; if on: `i32 points` | members (`User.cpp:1332-1353`); off from the core's 1 s countdown, a leader change or leave | `OnSetPartyMode` :5023-5239, §8.4 |
| 0x0091 | SET_PARTY_MEMBER_PARAM (:1052) | `u32 idMember`, `u8 param`, `i32 value` | members: `PP_REMOVE` (0) with 0 when a member comes online, 1 when one goes offline (`DPCoreClient.cpp:1005-1113`) | `OnSetPartyMemberParam` :5336-5378: `m_bRemove = value`; when slot 0 (the leader) goes offline, slot 0 swaps with the first online `j ≥ 1`, the icons and skill times cleared; nobody online → `InitParty`. No chat line |
| 0x0069 | PARTYCHAT (:1010) | `u32 speakerObjid`, str(**42**) name, str(260) text | members, the speaker too (`User.cpp:1642-1654`) | `OnPartyChat` :5846-5877, §10.1 |
| 0x003c | PARTYMAPINFO (:955) | `i32 index`, `f32 x, y, z` | frame objid `NULL_ID`; every 10 s (`PARTY_MAP_SEC`, `party.h:36`, the world's 1 s loop) a member's position, if it moved, to members more than 32 m from it (`party.cpp:1278-1321`) | `OnPartyMapInfo` :6170-6181: `SetPos(index, pos)` only if that member's mover is not in view; no bounds check |
| 0x008a | PARTYSKILL_CALL (:1045) | `f32 x, y, z` (the leader) | every online member | §8.5 |
| 0x008b | PARTYSKILL_BLITZ (:1046) | `u32 idTarget` | members near the leader (all while Gift Box or Lucky Drop is on) | §8.5 |
| 0x008c | PARTYSKILL_RETREAT (:1047) | none | as Blitz | §8.5 |
| 0x008e | PARTYSKILL_SPHERECIRCLE (:1049) | none; the **frame objid is the leader's target** | as Blitz | §8.5 |
| 0x0141 | QUERY_PLAYER_DATA (:1220) | `u32 idPlayer`, str(42) name, 12-byte `sPlayerData` | frame objid `NULL_ID`, the answer to a query (`User.cpp:1826-1835`) | `OnQueryPlayerData` :13576-13606, §4 |

Dead in V15 (writers and cases under `#if __VER < 11`): PARTYMEMBERJOB 0x0086, PARTYMEMBERLEVEL 0x0087.

### 1.2 Direct packets (top-level, not in a snapshot; the cache server strips the DPID)

| Type | Name | Body | Sent | Neuz |
|---|---|---|---|---|
| 0xffffff10 | ERRORPARTY (`MsgHdr.h:278`) | `u32 code` | the core to one user (`CORESERVER/DPCacheSrvr.cpp:2244-2249`): codes 200-204, 208, 209 | `ON_MSG` :182 → `OnErrorParty` |
| 0xf000f808 | UPDATE_PLAYER_DATA (:658) | `u32 idPlayer`, 12-byte `sPlayerData` | the core to party, guild and friend members on a change (`CORESERVER/DPCacheSrvr.cpp:2800-2806`) | `OnUpdatePlayerData` :977-1003: copied when its `nVer` is newer |
| 0x7000000b | LOGOUT (:684) | `u32 idPlayer` | the core to party members etc. (`CORESERVER/DPCacheSrvr.cpp:2810`) | `OnLogout` :1005-1024: `uLogin = 0` in the player data |
| 0xffffff5a | BLOCK (:355) | `u8 gu`, str(64) name | the core to the inviter when the invitee's box was already open (`CORESERVER/DPCoreSrvr.cpp:1816-1825`, `DPCacheSrvr.cpp:2267-2273`) | gu 7: chat TID_GAME_YETPARTY "You have already invited this player. Try again after a few minutes." (:8385-8389) |

### 1.3 ERRORPARTY codes (`MsgHdr.h:1378-1387`; `OnErrorParty`, `DPClient.cpp:4296-4397`)

| Code | Name | When | Neuz shows |
|---|---|---|---|
| 200 | NOLEADER | an accepted invite, the inviter in a party but not its leader (core :821-825) | chat TID_GAME_PARTYNOINVATE "Only the party leader can invite new members." |
| 201 | FULLPARTY | an accepted invite, 8 members already (core :826-830) | chat 0xff99cc00, by **my** party level: 1-5 TID_GAME_FULLPARTY1, 6-9 FULLPARTY2, else FULLPARTY3 (the 1 and 2 texts speak of 3 and 4 members; the real cap is a flat 8) |
| 202 | NOPARTY | a mode, troup or name request with no party; `/p` with no party | chat TID_GAME_NOPARTY "Party does not exist." |
| 203 | DIFFRENTPARTY | the invitee already in a party; a kick of a non-member | chat TID_GAME_DIFFRENTPARTY "Player cannot join the party." |
| 204 | DIFFERNTUSERNAME | the party name is taken (core :1166-1170) | the name box opened again, and the box TID_DIAG_0033 "That party name is already in use. Please choose another one." |
| 205 | NOTPARTYPOINT | a party skill with too few points (world `party.cpp:560-566`) | box TID_DIAG_0046 "Cannot use skill. Insufficient party experience." |
| 206 | NOTPARTYSKILL | the party level below the skill's (`party.cpp:573-579`) | box TID_DIAG_0019 "Unable to use skill." |
| 207 | NOTTARGET + `u32 skill` | Blitz or Precision with no monster as the leader's server target | chat TID_GAME_NOTTARGET "Cannot attack, no monster targeted." |
| 208 | NOTMAMBER | a handover to a non-member (core :757-762) | chat TID_GAME_PARTYNOTEXMEMBER "There are no members in the party." |
| 209 | SAMLEADER | a handover to oneself (core :764-768) | chat TID_GAME_PARTY_ALREADYMASTER, English "You are already reading that." (a mistranslation) |
| other | | | nothing |

"Box" is `g_WndMng.OpenMessageBox( text )` (`WndManager.cpp:2250-2261`): `CWndMessageBox` MB_OK, `APP_MESSAGEBOX
"WndMessagebox.tga" 256 x 144` (`resdata.inc:24534`), modal, the text in the client rectangle less (10, 10, 10, 35), one
OK (`ButtOk.tga`) centred 30 px above the bottom, the box centred (`WndMessageBox.cpp:65-130`, :198-206). A new box
replaces the open one. The port's `hud/logOutBox.ts` already copies this frame.

---

## 2. Packets the client sends

The client sends all to the cache server. Seven party types go **straight to the core**: ADDPARTYMEMBER,
REMOVEPARTYMEMBER, CHANGETROUP, CHANPARTYNAME, PARTYCHANGEITEMMODE, PARTYCHANGEEXPMODE, PARTYCHANGELEADER
(`CACHESERVER/DPCacheSrvr.cpp:105-116`). The core finds the sender by its connection and ignores the "own id" field
(`CORESERVER/DPCacheSrvr.cpp:722-730`, :792-803, …). The rest go to the world. Bodies after `u32 DPID_UNKNOWN, u32 type`
(the port's `clientPacket`); "own id" is the own `m_idPlayer`.

| Type | Name | Body | Neuz sends it from |
|---|---|---|---|
| 0xffffff17 | MEMBERREQUEST (:285) | `u32 own id`, `u32 target's m_idPlayer`, `i32 0` | `CWndWorld::InviteParty` (`WndWorld.cpp:11237-11266`), §5.2 |
| 0xffffff18 | MEMBERREQUESTCANCLE (:286) | `u32 idLeader`, `u32 idMember` (echoed), `i32 mode` (0 No, 3 invites off) | the invite box's No or close (`WndPartyConfirm.cpp:113-117`) |
| 0xffffff11 | ADDPARTYMEMBER (:279) | `u32 idLeader`, `i32 lLevel`, `i32 lJob`, `u32 lSex`, `u32 idMember`, `i32 mLevel`, `i32 mJob`, `u32 mSex`: all eight echoed from PARTYREQEST, the sexes widened from `u8` | the invite box's Yes (`WndPartyConfirm.cpp:109`) |
| 0xffffff12 | REMOVEPARTYMEMBER (:280) | `u32 own id`, `u32 leaveId` (own to leave, a member's to kick) | the leave box's Yes (`WndPartyChangeTroup.cpp:353-357`) |
| 0xffffff19 | CHANGETROUP (:287) | `u32 own id`, `i32 1`, string name (Neuz always sends 1 and a name) | the name box's OK (`WndPartyChangeTroup.cpp:166-168`) |
| 0xffffff2f | PARTYCHANGELEADER (:314) | `u32 own id`, `u32 newLeaderId` | Hand Over (`WndParty.cpp:368`) |
| 0xffffff20 | PARTYCHANGEITEMMODE (:295) | `u32 own id`, `i32 mode` 0-3 | an item radio (`WndParty.cpp:457`) |
| 0xffffff21 | PARTYCHANGEEXPMODE (:296) | `u32 own id`, `i32 mode` 0-1 | an EXP radio (`WndParty.cpp:442`) |
| 0xffffff1b | PARTYSKILLUSE (:289) | `u32 own id`, `i32 skill` 1-8 | `ObjectExecutor` (`WndManager.cpp:2837`), §8.2 |
| 0xffffff5a | BLOCK (:355) | `u8 7`, string own name, string inviter name | a second invite while the box is open (`DPClient.cpp:4568-4574`) |
| 0xf000f802 | QUERY_PLAYER_DATA (:653) | `u32 idPlayer`, `i32 nVer` (0) | `CPlayerDataCenter::GetPlayerData` (`_Common/playerdata.cpp:32-63`), §4 |

CHANPARTYNAME 0xffffff1a is never sent by Neuz. The world answers QUERY_PLAYER_DATA only when its version differs
(`WORLDSERVER/DPSrvr.cpp:11877-11890`). There is no request for the party map. Party chat is the CHAT packet with the
line `/partychat <text>` or `/p <text>` (the port's `encodeChat('party')`, `packages/protocol/src/world/chat.ts:36`).
`/partyinvite <name>` is a chat command the world runs (`FuncTextCmd.cpp:3016-3042`, skipping the client's checks).

---

## 3. The party model (`CParty g_Party`, `_Common/party.h`, `party.cpp`)

### 3.1 Fields

`g_Party` is a global (`party.cpp:852`): it outlives world changes. `PartyMember` (`party.h:42-71`, `__VER >= 11`):
`u_long m_uPlayerId`, `CTime m_tTime`, `BOOL m_bRemove`, `D3DXVECTOR3 m_vPos`, **no name, level or job**. `CParty`:
`m_uPartyId`, `m_sParty[33]`, `m_aMember[15]`, `m_nSizeofMember`, `m_nLevel` (starts 1), `m_nExp`, `m_nPoint`,
`m_nTroupsShareExp`, `m_nTroupeShareItem`, `m_nKindTroup` (0 normal, 1 advanced), `m_nModeTime[5]` (0/1 on the
client), `m_idDuelParty`. Slot 0 is the leader (`IsLeader`, :106). `FindMember(id)` is -1 when absent. `InitParty`
(:75-95) resets id, size, name, level 1, exp, points, modes, kind, and each slot's id, time and `m_bRemove`, not
`m_vPos`.

### 3.2 The party block (`CParty::Serialize`, `party.cpp:215-240`), the tail of PARTYMEMBER

`u32 partyId`, `i32 kind`, `i32 size` (this copy drives the loop), `i32 level`, `i32 exp`, `i32 point`, `i32 expMode`,
`i32 itemMode`, `u32 idDuelParty`, `i32 modeTime[5]`, str(33) name **only if kind ≠ 0**, then `size` × (`u32
playerId`, `i32 bRemove`). 56 bytes fixed. The reader does not check the size against 15 slots, and keeps each slot's
`m_vPos` when another player now sits in it.

### 3.3 What PARTYMEMBER does (`OnAddPartyMember`, `DPClient.cpp:4399-4542`)

It keeps the old leader id and the old size, then reads. Size ≠ 0: the block, then one chat line in 0xff99cc00:
- old 0, new 2 (a new party): the leader first gets TID_GAME_PARTYCREATE "Party has been created." (its own colour),
  then TID_GAME_PARTYJOIN1 "%s has joined the party." with **memberName**; a member gets TID_GAME_PARTYJOIN2 "%s has
  joined the party." with **leaderName**; then `PlayMusic(BGM_IN_FITUP)`;
- old < new otherwise: TID_GAME_PARTYJOIN1 with memberName;
- old > new: TID_GAME_PARTYREMOVE "%s has left the party." with memberName;
- old == new: an empty line.

Size 0: `InitParty`; TID_GAME_PARTYEXIT "You have left the party." if `idPlayer` is the own id, else
TID_GAME_PARTYDESTROY "Party has been disbanded."; the party-skill icons cleared. At the end, a leader that changed
zeroes `m_dwSkillTime`. Because `g_Party` is empty at log-in, the log-in PARTYMEMBER (id 0, memberName "") prints "Party
has been created." and " has joined the party." with an empty name for a leader of two, "<leader> has joined the
party." for a member, and " has joined the party." for a bigger party.

### 3.4 Member states the windows read

No party message carries HP, level or job. Every frame the windows ask: **in view** (`prj.GetUserByID(id)` valid: the
mover is in the client's object list, not a distance): level, job, name and HP from the mover; **out of view and
online**: grey, the level, job and name from the player data (§4), no HP; **offline** (`m_bRemove`): black, the same
data.

### 3.5 Life cycle

- **Log-in:** the JOIN carries the character's party id (the port's `encodeJoin`). The core marks the player online
  and members get SET_PARTY_MEMBER_PARAM(id, 0, 0); ADDPARTYNAME comes in the JOIN snapshot; then PARTYMEMBER(id 0,
  leaderName, "") if the world lists the player (`DPDatabaseClient.cpp:1069-1077`). The order of the first and last
  is not confirmed.
- **A member logs out:** SET_PARTY_MEMBER_PARAM(id, 0, 1); the member stays, shown black; a leader is swapped out as
  in §1.1. After 600 s offline the core removes members in slots ≥ 1 (`party.cpp:1129-1158`): PARTYMEMBER with "%s has
  left the party.".
- **The own player leaves or is kicked:** PARTYMEMBER with size 0 and its own id. A leader who leaves: the next member
  moves to slot 0, the core turns the modes off (SETPARTYMODE off each) and sends ADDPARTYCHANGELEADER(new slot 0).

---

## 4. The player data (`_Common/playerdata.h`, `playerdata.cpp`)

The party windows name and level a member out of view from `CPlayerDataCenter::GetPlayerData(id)`, every frame
(`WndParty.cpp:625`, `WndPartyQuick.cpp:133`, :141). `GetPlayerData(id)` with `bQuery` TRUE (`playerdata.cpp:32-63`):
an unknown id gets an empty entry with `nLevel = 1` and **one** QUERY_PLAYER_DATA(id, 0); an entry whose `nLevel` is 0
is queried again once. `sPlayerData` (`playerdata.h:6-14`) with the default packing (`targa.h`'s `#pragma pack(1)` is
closed at its :34): `u8 nJob` @0, `u8 nLevel` @1, `u8 nSex` @2, pad, `i32 nVer` @4, `u8 uLogin` @8, pad to 12 bytes.
QUERY_PLAYER_DATA 0x0141 replaces the entry when its `nVer` is newer; UPDATE_PLAYER_DATA does the same; LOGOUT sets
`uLogin = 0`. Job names: `prj.m_aJob[nJob].szName`.

---

## 5. Inviting

### 5.1 The player's mover menu (`CWndWorld::ShowMoverMenu`, `WndWorld.cpp:6517-6709`)

Opened by Alt + a left press on a peaceful player when not flying (:7065-7086), or (V15, `__IMPROVE_SYSTEM_VER15`) by a
right press let go at the same point on a player (`OnRButtonUp`, :7114-7131), which also turns the auto-attack off,
sets `m_bSelectTarget` and focuses the player. Not inside a 1:1 guild-combat arena. Within 20 m (`fDistSq < 20*20`,
:6520-6527) the menu opens (the player's walk cleared); farther, the player walks to the target instead (:6705-6709).
Entries, in order (:6537-6624; English from `textClient.txt.txt`):

| # | Id | English | Shown |
|---|---|---|---|
| - | MMI_QUERYEQUIP 24 | View equipment | the only entry while the target's shop is open |
| 1 | MMI_TRADE 2 | Trade | always |
| 2 | MMI_ADD_MESSENGER 5 | Add to my list | always |
| 3 | MMI_INVITE_PARTY 6 | Invite to join party | **always, never greyed** |
| 4 | MMI_INVITE_COMPANY 7 | Invite to join guild | in a guild with `PF_INVITATION` |
| 5-6 | MMI_DUEL 10, MMI_DUEL_PARTY 11 | Duel - 1 vs 1 / Party vs Party | event `EVE_18`, both in a fight area |
| 7 | MMI_TRACE 12 | Follow | always |
| 8 | MMI_QUERYEQUIP 24 | View equipment | always |
| 9 | MMI_CHEER 31 | Cheer | always |
| 10 | MMI_INVITE_CAMPUS 151 / MMI_REMOVE_CAMPUS 152 | Request / Cancel Mentor-Pupil Bond | always (one of the two) |

The click on Invite checks only that the focus is a player (:5639-5644) and calls `InviteParty` with it.

### 5.2 `CWndWorld::InviteParty` (`WndWorld.cpp:11237-11266`)

1. In a party duel → chat TID_GAME_PPVP_ADDPARTY (duels are out of scope).
2. In a party and not its leader → box TID_DIAG_0007 "Unable to invite player. Either you are not the party leader, or
   the party is already full."
3. 8 members already (`MAX_PTMEMBER_SIZE_SPECIAL`, `party.h:34`) → chat TID_GAME_FULLPARTY3 in FULLPARTY1's colour.
4. Otherwise MEMBERREQUEST. No check of the target's level, party, distance or whether it is oneself.

### 5.3 The world's answer (`CDPSrvr::InviteParty`, `DPSrvr.cpp:7739-7792`)

Not the sender's own id → dropped. A player not on this world server → PARTYREQESTCANCEL mode 4. The guild-siege world →
TID_GAME_GUILDCOMBAT_CANNOT_PARTY. Either in a duel → silent. Target in a party → mode 1. Target attacked within 10 s →
TID_GAME_BATTLE_NOTPARTY "You cannot invite others to join your party during a battle.". Otherwise PARTYREQEST to the
target. No invite state is kept. PARTYREQESTCANCEL modes on the inviter (`DPClient.cpp:4581-4677`, chat 0xff99cc00):

| Mode | From | Neuz prints |
|---|---|---|
| 0 | the invitee's No or close | TID_GAME_PARTYFAILINVATE "%s has refused to join the party." |
| 1 | the target is in a party | TID_GAME_PARTYEXISTCHR "%s already belongs to another party." if it is in my party, else TID_GAME_PARTYOTHER "%s is currently in another party." |
| 2 | nobody | TID_GAME_PARTYFAILENTER "You have failed to join the party." |
| 3 | the invitee's invites are off | TID_GAME_PARTYDENY "%s is currently not accepting Party Invitations" |
| 4 | not on this world server | TID_GAME_PARTYINVATEOTHERSVR "Cannot invite a player from a different server." |

Modes 0, 1 and 3 take the name from the invitee's mover (`prj.GetUserByID(idMember)`); out of view the name is empty.

### 5.4 The invite box (`OnPartyRequest`, `DPClient.cpp:4544-4579`; `WndPartyConfirm.cpp`)

In order: the "accept party invites" option off (`g_Option.m_bParty`, default TRUE, `HwOption.cpp:189`) → MEMBERREQUESTCANCLE
mode 3 at once; `m_bAllAction` false → silent; a box already open → BLOCK(7, own name, inviter); else `CWndPartyConfirm`:
`APP_PARTY_CONFIRM` 288 x 128, `WndTile08.tga` tiled, "Confirm Party" (`resdata.inc:9824-9862`): WIDC_YES `ButtYes.tga`
64,68-136,88; WIDC_NO `ButtNo.tga` 148,68-220,88; WIDC_TEXT1 (`WndEditTile00.tga`) 8,8-264,60 with TID_DIAG_0072 "%s invites
you to join the party. Do you accept?"; centred across, 70 px from the top (:67-70). Yes (bTroup FALSE) → ADDPARTYMEMBER
echo, close. No or close → MEMBERREQUESTCANCLE(…, 0), close. **No timer, no withdraw**: nothing closes it but its buttons,
a duel start and log-out. The core, on Yes (`CORESERVER/DPCacheSrvr.cpp:790-868`): the member is the sender; offline →
silent; the member in a party → DIFFRENTPARTY to the leader; the leader not leader → NOLEADER; 8 → FULLPARTY; else added
(or a new party). The invitee never gets an error.

---

## 6. Running the party

### 6.1 Leave and kick (the party window's Leave, `WndParty.cpp:307-352`)

Enabled with 2+ members (or under 2 with a party level above 1, `__PARTY_DEBUG_0129`, :83-88). A leader with a row
selected kicks that member (its own row: leave); anyone else leaves, whatever is selected; nothing selected: leave. It
opens `APP_PARTYLEAVE_CONFIRM` 288 x 128, `WndTile08.tga`, "Confirm Leaving Party." (`resdata.inc:2111-2149`):
WIDC_EDIT1 10,10-266,62 (disabled, the question: TID_DIAG_0084 to leave, TID_DIAG_0085 to kick, both "Are you going to
leave the party?" in English); WIDC_YES 52,70-124,90; WIDC_NO 136,70-208,90. Yes → REMOVEPARTYMEMBER. The core: a kick by
a non-leader → silent; a kick of a non-member → DIFFRENTPARTY; under 2 the party is deleted.

### 6.2 Hand Over (`WIDC_BUTTON1`, `WndParty.cpp:354-385`)

Disabled under 2 members. Not the leader or no row → chat TID_GAME_PARTY_ISNOTMASTER "Only the party leader can select a
member from the party window."; the selected offline → TID_GAME_MASTER_AWAY "You cannot pass party leadership to an
offline player."; the own row → TID_GAME_PARTY_ALREADYMASTER; else PARTYCHANGELEADER. The core turns the modes off, swaps
and sends ADDPARTYCHANGELEADER.

### 6.3 Item and EXP modes (`CWndParty::OnChildNotify`, `WndParty.cpp:419-466`)

Leader: an EXP radio (advanced party only) → PARTYCHANGEEXPMODE 0 (WIDC_EXP_SHARE "Level") or 1 (WIDC_RADIO6
"Contribution"), sent only when it differs from the party's; an item radio (any party) → PARTYCHANGEITEMMODE 0
"Individually", 1 "Sequentially", 2 "Manually", 3 "Randomly", only when it differs. Not the leader: any notify but close
and help → box TID_DIAG_0008 "The settings can only be changed by the party leader or an advance party member." (the
tab control's change notifies here too, so a member switching tabs gets the box). The radios are set from `g_Party`
every frame: an unconfirmed click snaps back.

### 6.4 The advanced party (`WIDC_CHANGE`, `WndPartyChangeTroup.cpp`)

Change is enabled for a leader at party level ≥ 10 (`WndParty.cpp:90-93`) and acts only for a normal party. It opens
`APP_CHANGETROUP` 272 x 128 `WndTile03.tga` "Change Party" (`resdata.inc:26007-26045`): WIDC_STATIC1 36,16-232,36 "Convert
to an Advanced Party?", WIDC_OK `ButtOk.tga` 52,56-124,76, WIDC_CANCEL `ButtCancel.tga` 144,56-216,76. OK opens
`APP_PARTYCHANGENAME` 272 x 160 `WndTile03.tga` "Change Party Name" (`resdata.inc:25950-26006`): WIDC_STATIC1 24,16-236,36
"Enter Party Name", WIDC_STATIC2 12,52-72,72 "Name:", WIDC_EDIT1 (`WndEditTile00.tga`) 76,52-236,72 pre-filled with the
saved name (ADDPARTYNAME) or "Advance Party", WIDC_OK 52,88-124,108, WIDC_CANCEL 144,88-216,108. Both boxes centre on
their parent. The name rules on OK (:86-170), in order: trim spaces; empty or not 4-16 bytes → TID_DIAG_RULE_0
"Character Name must be 4 to 16 characters long."; a digit first → TID_DIAG_0012 "The name cannot start with a
number."; a byte that is not `isalnum` → TID_DIAG_0013 "You cannot use special characters or spaces in a name."; a
banned substring (`InvalidName_ENG.inc`, lower-case) or a byte outside `Letter_ENG.inc` (A-Z a-z 0-9) → TID_DIAG_0020
"Character name is not allowed."; equal to "Advance Party" → nothing, the box stays; else CHANGETROUP(own, 1, name) and
close. Errors keep the box open. The core: not the leader, already advanced or below level 10 → silent; a taken name →
DIFFERNTUSERNAME; else PARTYCHANGETROUP and PARTYCHANGENAME to the members.

---

## 7. The windows

### 7.1 Opening (the P key, Start → Party; `WndManager.cpp:2625-2659`)

`APP_PARTY` (195, `Icon_Troupe.dds`, TID_TIP_PARTY, key P, `FuncApplet.cpp:233`) toggles two windows: neither open → the
party window, and the quick view too with 2+ members; both open → both close; one open → that one closes (so with only
the quick view open, P closes it). Nothing opens a window on joining. The quick view closes itself every frame below 2
members (`WndManager.cpp:3613-3622`) and refuses to open below 2.

### 7.2 The party window (`APP_PARTY`, `resdata.inc:21393-21602`; `CWndParty`, `WndParty.cpp`)

448 x 336, `WndTile07.tga` tiled, "Party", centred (`MoveParentCenter`, :267). Client rectangles:

| Id | Type | Rect | Text |
|---|---|---|---|
| WIDC_GROUPBOX1 | group box | 8,8-146,26 | "Party Information" |
| WIDC_GROUPBOX3 | group box | 190,8-282,28 | "EXP Share" |
| WIDC_GROUPBOX4 | group box | 316,8-430,28 | "Distribute Item" |
| WIDC_ITEM_SHARE, RADIO2, RADIO3, RADIO4 | radio `ButtRadio.bmp` | 316,34-430,50; 316,54-430,70; 316,74-430,90; 316,94-430,110 | "Individually", "Sequentially", "Manually", "Randomly" |
| WIDC_EXP_SHARE, RADIO6 | radio `ButtRadio.bmp` | 190,32-308,48; 190,54-308,70 | "Level", "Contribution" |
| WIDC_STATIC1-4 | static | 8,34-72,52; 8,54-72,74; 8,74-76,94; 8,94-76,110 | "Name", "Level", "Exp", "Points" |
| WIDC_NAME, LEVEL, EXP, POINT | static | 78,34-150,50; 78,54-150,70; 78,74-142,90; 78,94-142,110 | filled every frame |
| WIDC_TABCTRL1 | tab control | 10,118-448,266 | "Information", "Skill" (TID_APP_INFOMATION, TID_APP_SKILL) |
| WIDC_LEAVE | `ButtLeave.bmp` | 184,276-256,296 | "Leave" |
| WIDC_CHANGE | `ButtChange.bmp` | 306,276-378,296 | "Change" |
| WIDC_BUTTON1 | `ButtTransper.bmp` | 54,276-126,296 | "Hand Over Party Leader" |
| WIDC_BUTTON2 | no picture (a 10 x 10 grey box, `ITheme.cpp:1275-1335`) | 418,286-428,296 | tooltip "Simple Party Display." (toggles the quick view) |

`ButtLeave/Change/Transper.bmp` are 288 x 20 (4 states of 72); `ButtRadio.bmp` is 84 x 14 (6 states of 14), its label at
x 16, centred. The panels are made with `Create` and take the tab control's client area less its 18 px strip (about 438
x 130). Every frame (`OnDraw`, :64-214): the name is TID_GAME_PARTY1 "Party" for a normal party, else the party's name
or TID_GAME_PARTY2 "Advance Party"; the level `%d`; EXP `"%.2f %%"` = `exp * 100 / need` (need: §9); the points `%d`;
the radios from the party's modes. Leave, Hand Over and the quick button need 2+ members; Change a leader at level ≥ 10.

**The member list** (tab "Information", `CWndPartyInfo::OnDraw`, :502-720): a row per member in slot order at `y = 10 +
15*i`. A selected row: a fill (5, 8+15s)-(410, 22+15s) `0x60ffff00`. A 10 x 10 black-bordered box at (10, y), filled blue
`0xff0000ff` in view, red `0xffff0000` at 0 HP, yellow `0xffffff00` below 10 % of max HP, grey `0xff878787` out of view,
black out of view and offline. Text black, the leader's green `0xff1fb72d`. Level at x 30 (a master job "-M"
TID_GAME_TOOLTIP_MARK_MASTER, a hero "-H"); TID_GAME_LEADER "L" or TID_GAME_MEMBER "M" at x 80; the job's **name** at x
120; the name at x 180, cut to 8 bytes + "..."; the HP bar (280, y)-(390, y+12): `GauEmptyNormal.bmp`, its fill (the
same picture) `0x64ff0000` `110 * HP / maxHP` px wide, in view only. A click (:783-824), ignored while auto-attacking:
inside (10,10)-(365, 10+15n) selects row `(y-10)/15`; another member in view becomes the target (`SetObjFocus`), the own
row clears it, a far member leaves it; elsewhere clears the selection and the target.

**The skill tab** (`CWndPartySkill`, :834-1022): a 3 x 3 grid, cell `w = width/3, h = height/3`, skill `row*3+col+1`, the
icon at (col*w+3, row*h+3), the name at (col*w+35, row*h+6); the 9th cell empty. An advanced party at level ≥ the
skill's: name black, icon normal; otherwise name red `0xffff0000`, icon at alpha 54. Tooltip (`PutToolTip_Troupe`,
`WndManager.cpp:4293-4325`): the name bold `0xff2fbe6d`, then the description. A drag needs only the party level (makes a
`SHORTCUT_SKILL` type 2, id = the skill); a double-click runs `ObjectExecutor` (§8.2).

### 7.3 The quick view (`APP_PARTY_QUICK`, `resdata.inc:4967-5059`; `WndPartyQuick.cpp`)

144 x 336 `WndTile00.tga`, "Party Window"; 8 rows WIDC_STATIC_MEM1-8 (`WndEditTile00.tga`) at (10, 8+34k)-(122, 32+34k);
WIDC_BUTTON1 (no picture, 10 x 10, "Detailed Party Display.") toggles the party window. `SetActiveMember(n)` shows rows
1..n, makes the window `60 + 34n` tall and puts the button at (114, height − 50). It opens at (30, screen height / 4). A
row: a highlight `0x60ffff00` on the clicked member; colour grey out of view, black offline, else black, red at 0 HP,
yellow below 10 %, and green `0xff1fb72d` for the leader (after the HP tests); text `"%d. %s"` (level, name; "%d-M. %s",
"%d-H. %s"), cut to 13 bytes + "...", at (left+5, top+5); the HP bar top+18 to the bottom, left+2 to right−2 (108 px):
`GauEmptySmall.bmp`, fill `GauFillSmall.bmp` `0x64ff0000` `MulDiv(HP, 108, maxHP)`, 0 out of view. A click
(`OnLButtonUp`, :245-280), ignored while auto-attacking: another member in view becomes the target, the own row clears
it, a far member changes nothing else. (Neuz highlights every member out of view while no in-view member is clicked:
`pObjMember` and `m_pFocusMember` are both NULL.)

---

## 8. Party skills

### 8.1 The catalog (`Resource/propTroupeSkill.txt`, read by `LoadPropItem` like `propSkill.txt`, `Project.cpp:463-467`)

Names and descriptions in `propTroupeSkill.txt.txt`. Columns (0-based): `dwReqDisLV` 70, `dwSfxObj` 79, `dwSfxObj2` 80,
`dwSkillTime` 86, `dwExp` 107, `szIcon` 120, `szComment` 123. `=` reads as `NULL_ID`. Row 6 (Scout) is commented out.

| Id | Define | English | Party level | Points | Lasts (ms) | Effects (`defineObj.h:639-648`) | Icon (`Client/Icon/`) |
|---|---|---|---|---|---|---|---|
| 1 | ST_CALL | Call | 10 | 0 | `=` | XI 1500 / 1501 | Skill_TroCall.DDS |
| 2 | ST_BLITZ | Blitz | 10 | 0 | `=` | XI 1502 | Skill_TroBlitz.DDS |
| 3 | ST_RETREAT | Retreat | 10 | 0 | `=` | XI 1503 | Skill_TroRetreat.DDS |
| 4 | ST_SPHERECIRCLE | Precision | 17 | 1 | 60000 | XI 1504 | Skill_TroSpherecircle.DDS |
| 5 | ST_LINKATTACK | Linked Attack | 20 | 1 | 20000 | XI 1505 | Skill_TroLinkattack.DDS |
| 6 | ST_FORTUNECIRCLE | Lucky Drop | 25 | 5 | 300000 | XI 1506 | Skill_TroFortunecircle.DDS |
| 7 | ST_STRETCHING | Resting | 30 | 2 | 120000 | XI 1507 / 1508 | Skill_TroStretching.DDS |
| 8 | ST_GIFTBOX | Gift Box | 40 | 8 | 300000 | XI 1509 | Skill_TroGiftbox.DDS |

Every row is `CT_GENERAL`, so all may sit on the task bar's applet and item rows (`WndTaskBar.cpp:1962-1975`), never in
the skill queue. Descriptions (the tooltips): `propTroupeSkill.txt.txt:2-18`.

### 8.2 Use (`CWndMgr::ObjectExecutor`, `SHORTCUT_SKILL` with `m_dwType == 2`, `WndManager.cpp:2779-2876`)

1. A vendor → nothing. 2. Under 2 members or not advanced → nothing, no message. 3. No row → nothing. 4. Not the leader →
box TID_DIAG_0047 "Only the party leader can use party skills". 5. The party level below the skill's → box TID_DIAG_0019.
6. The points check is `int − DWORD`, unsigned, **always true**. 7. The skill's mode icon still running and no
party-skill-up scroll → chat TID_GAME_NOT_TIME "You are still using the %s party skill. Try again later." (red; silent
for Call, Blitz, Retreat, which never make an icon). 8. PARTYSKILLUSE. There is **no cool-down** on either side; Call,
Blitz and Retreat cost 0. Blitz and Precision need the leader's **server** target, set by SETTARGET with 2 (the port's
`Focus.select`). The world (`party.cpp:318-587`): leader of an advanced party only, else silent; then NOTPARTYSKILL,
NOTPARTYPOINT, NOTTARGET; points are spent first.

### 8.3 Party level, points, the EXP table

`expParty` (`Resource/expTable.inc:438-454`, rows `exp point`, read by `LoadExpTable`, `Project.cpp:3381-3392`): row L
is the EXP from L to L+1: 0, 200, 200, 250, 300, 350, 400, 450, 500, 500 for L = 0..9, each +15 points. From level 10
(advanced only): `((50 + L) * L / 13) * 10` in integers, +15 points a level. A normal party stops at 10. Points come only
from level ups. The window's EXP percent: `exp * 100 / need` (`WndParty.cpp:115-122`). GM: `/partylevel <level>
[points]` (`/plv`, GM level 3; points default 100; `FuncTextCmd.cpp:1304-1323`, :5216).

### 8.4 The modes (SETPARTYMODE, `OnSetPartyMode`, `DPClient.cpp:5023-5239`)

`m_nModeTime[mode] = on`. Mode → skill: 0 Linked Attack, 1 Lucky Drop, 2 Resting, 3 Gift Box, 4 the cash
"everywhere" state (no skill, no message). When on: modes 0, 1, 3 play the skill's `dwSfxObj` once on the leader (the
leader's own client: on itself; a member's: on the leader if in view) at scale 0.8, 0.7 and 1.0; mode 2 plays XI 1507 on
every party member in view **who is sitting** (on and off alike), which hands over to XI 1508, looping until the mover
stands, the mode ends or the mover goes (`Sfx.cpp:251-325`); and when on, an idle own player sits down by itself
(`SendMotion(OBJMSG_SITDOWN)`, :5155-5172). Modes 0-3 on: the icon `m_buffs.AddBuff(BUFF_SKILL, skill, 1, skillTime)`
and chat TID_GAME_TROUPESKILLUSE "The party skill %s has been used." (red); off: TID_GAME_TROUPESKILLSTOP "The effect of
%s is about to end." (red); the icon is not removed: it runs out by its own clock. The same id again: total = max(new,
left), the clock restarted. No sound. **The client computes no mode's rule** (the damage, drops and regen are the
world's).

**The icons** (`CWndWorld::RenderBuff`, `WndWorld.cpp:10637-10745`, `RenderBuffIcon` :9185-9560): a row from x =
width/2 − 100, y = 10, each icon 37 px left of the one before, drawn only while mode 4 is on or the leader is in view;
alpha 192, flashing 64-192 in steps of 6 in its last 20 s; the time left in yellow (240, 240, 0); tooltip the name bold
`0xff2fbe6d`, `MM:SS` left, the description. Cleared on a leader change, the leader's leaving and the party's end.

### 8.5 Call, Blitz, Retreat, Precision (effects only; the client moves, targets and says nothing)

| Skill | Client plays | Code |
|---|---|---|
| Call | the leader's client: XI 1501 on itself, scale 1.1. A member's: XI 1501 on the leader (in view), and XI 1500 on itself, scale 1.1, heading `atan2(leader.x − me.x, leader.z − me.z)` in degrees, fixed then | `DPClient.cpp:5380-5442` |
| Blitz | XI 1502 on the target (`CSfxTroBlitz`: at the target's height `maxY × scale.y − 0.7 × scale.y`, the target's scale), once | :5444-5463; `Sfx.cpp:342-376` |
| Retreat | XI 1503 on every party member in view, once | :5466-5488 |
| Precision | XI 1504 with the leader as its source: **on the leader**, once; none if the leader is out of view | :5491-5514 |

The effect files are converted already (`dist/assets/effects/sfx_skltro*.json`, ten files). The port's effects cannot
take a heading yet (`apps/client/src/world/fx/EffectManager.ts:29-32`).

---

## 9. Chat, names, bars, maps

### 9.1 Party chat

Received: the line `"[name] text"` in `0xff99cc00`, style `CHATSTY_PARTY`; a blocked speaker in view is dropped; a
speaker in view with text gets a `CHAT_PARTY` speech bubble (the `texDialogBoxParty` frame). Sent: the chat window's
party channel (enabled only in a party) puts `"/p "` in the edit (`WndCommunication.cpp:212-216`, :708-713). The port's
reader keeps the name in a 32-byte buffer (`chat.ts:42-44`); Neuz's is 42.

### 9.2 Name colours (`CMover::RenderName`, `MoverRender.cpp:1219-1419`)

After the chaotic, PK, admin, GM and VIP colours, a name still in the general colour of a party member
(`g_Party.FindMember(m_idPlayer) != -1`), **the own one included**, is `COLOR_PARTY` `0xff70f070` (`Mover.h:39`;
:1403-1407). The guild-war world overrides it.

### 9.3 HP bars over members (`CWndWorld::OnEraseBkgnd`, `WndWorld.cpp:1009-1031`; `CMover::RenderHP`, `MoverRender.cpp:1736-1844`)

Every party member but oneself, in view and in front of the camera: the bound box's top projected, 34 px up, the
gauge at (x − 42, y − 5) with x even (the 80 px gauge's rect less 2): `GauPartyHpBG.TGA` at scale 0.8 × 0.55, alpha 200;
over it `GauPartyHp.TGA` cut to `112 * HP / maxHP` texture px (`GauPartyHp_Dbf.tga` while stunned, poisoned, dark,
groggy, silenced or bleeding). Not for an invisible or transparent mover or a disguised GM. The port's charge gauge
(`render/ChargeGauge.ts`) draws `RenderGauge` the same way 40 px up.

### 9.4 The Navigator (`CWndNavigator::OnEraseBkgnd`, `WndField.cpp:9222-9600`)

Only movers in view: a party member is sprite 4 of `ImgNavObj.bmp` (after a quest NPC, the killer, a peaceful NPC, a
guild member, an aggressive NPC); the Party filter shows them with the Player filter off. Each paint writes the member's
position into `g_Party`'s slot (:9396-9402), which feeds the world map. The far-member arrows are commented out.

### 9.5 The world map (`CWorldMap::RenderWorldMap`, `Neuz/WorldMap.cpp:786-823`)

After the own arrow, each member not oneself and not offline at its stored position, the name from the player data:
`ImgMapArrowParty.bmp` (37 x 35), the name yellow `0xffffff7f`; skipped when a continent is shown and the member is not
on it. The arrow turns by `normalize(pos)` (its position, not a heading, :595-598). Positions: the Navigator's (in
view) and PARTYMAPINFO's (out of view).

---

## 10. What the browser has today, and what M4 adds

- **Has:** party chat read (str 32) and `/partychat` sent from a typed `/p`; the Party chat tab as a filter only; the
  Navigator's party sprite and filter with nothing marked 'party'; the applets APP_PARTY 195 (key P) and APP_PARTY_QUICK
  593 with no window; task-bar party skills kept but drawn plain and skipped on use; the converted party effects and
  BgmInFitup; `GauEmptyNormal/Small.bmp`, `ImgNavObj.bmp`, `ImgMapArrow.bmp`, `WndTile*`, `ButtYes/No/Ok/Cancel.tga`,
  the `Icon/` folder.
- **Missing:** every party reader but chat, the direct packets, every party sender, the party state, the player data,
  the player's mover menu (the canvas takes only main-button presses; the context menu is suppressed), a generic message
  box, a radio button, the party pictures (`ButtLeave.bmp`, `ButtChange.bmp`, `ButtTransper.bmp`, `ButtRadio.bmp`,
  `GauFillSmall.bmp`, `ImgMapArrowParty.bmp`, `GauPartyHpBG.TGA`, `GauPartyHp.TGA`), the troupe catalog and the
  `expParty` rows (`readExpTable` reads only `expCharacter`), name-tag recolouring (tags are made once), effect headings,
  and sitting for the own player.

## 11. Not confirmed

- What `PutString` does with the empty lines of §3.3 and §5.3.
- Whether the party window's tab notifies reach the non-leader box (the code says they do).
- How Neuz clips the tab control, which ends at x 448 in a 436 px client area.
- The order of SET_PARTY_MEMBER_PARAM and PARTYMEMBER at log-in.
- Whether a member who joins during a mode gets an icon (by the code, no).
- Whether a world change sends the party again (by the code, `g_Party` simply stays).
