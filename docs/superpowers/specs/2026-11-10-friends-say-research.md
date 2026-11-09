# The Friend window and `/say`: Neuz V15 research (2026-11-10)

The owner's request: "research on how Friend window works and the `/say` command on original v15 flyff and implement it
on FlyFFWeb".

This note says how Neuz V15's Messenger ("Friend") window, its small windows and the `/say` command work, which packets
carry them both ways, and what the web client lacks today (§9).

Sources:

- `Source/_Interface/WndMessenger.cpp` and `.h` (`CWndMessengerEx`, `CWndInstantMsg`, `CWndMessage`, `CWndMessageNote`),
  `WndMessengerCtrl.cpp` and `.h` (`CWndFriendCtrlEx`, the list), `WndFriendConFirm.cpp` (`CWndFriendConFirm` and the
  compiled `CWndAddFriend`), `WndManager.cpp`, `WndWorld.cpp`, `WndWorldControlPlayer.cpp`, `WndCommunication.cpp`,
  `WndTaskBar.cpp`, `FuncApplet.cpp`, `FuncTextCmd.cpp`; `Neuz/DPClient.cpp`, `Neuz/Neuz.cpp`, `Neuz/VersionCommon.h`;
  `_Common/messenger.h`, `rtmessenger.h/.cpp`, `playerdata.h/.cpp`, `HwOption.cpp`, `Mover.h`; `_Network/MsgHdr.h`;
  `CORESERVER/DPCacheSrvr.cpp`; `WORLDSERVER/DPSrvr.cpp`, `User.cpp`. All CP949: read them with
  `iconv -f cp949 -t utf-8 -c`; the line numbers stay the same.
- `Resource/resdata.inc` (ASCII), `ResData.h`, `WndStyle.h`, `resData.txt.txt` (English titles), `textClient.inc` and
  `textClient.txt.txt` (UTF-16: the TIDs' colours and texts), `Client/Icon/icon_PlayerData.inc`, `Client/Theme/Default`.
- Online: §8.

**Which branch is V15.** `__VER` is 15 and both `__RT_1025` (the "real-time" messenger, `Neuz/VersionCommon.h:94`) and
`__CAMPUS` (`:222`) are on. So the window is `CWndMessengerEx` (`__VER >= 11`, `WndMessenger.h:40-75`, applet id
`APP_MESSENGER_ = APP_MESSENGER_EX` 302, `_Interface/AppDefine.h:10`), the list is `CWndFriendCtrlEx`
(`WndMessengerCtrl.h:28-...`), the friends are `g_WndMng.m_RTMessenger`, and a friend's name, job, level and channel
come from the player data (`CPlayerDataCenter`). Every `#else // __RT_1025` branch below is dead code.
`WndAddFriend.cpp` is **not** in `Neuz.vcxproj` (the project compiles `WndFriendConFirm.cpp`, `Neuz.vcxproj:533`), so the
Add Friend window is the `APP_ADDFRIEND` one at `WndFriendConFirm.cpp:111-224`.

## 1. The data

- **A friend** is `Friend { BOOL bBlock; DWORD dwState; }` keyed by player id (`_Common/rtmessenger.h:6-17`); the list is
  a `map<u_long, Friend>` plus the own state `m_dwState` (`:17-40`). At most `MAX_FRIEND` 200 are read
  (`messenger.h:20`, `rtmessenger.cpp:55-56`).
- **The states** (`_Common/messenger.h:6-18`): 0 online, 1 offline, 2 block (unused with `__RT_1025`), 3 absent ("AFK"),
  4 hard play ("Addict Mode"), 5 eating, 6 resting ("Resting / Vending"), 7 moving, 8 dead, 9 danger, 10 offline-block
  (unused), 11 auto-absent, 12 the end.
- **The rest of a row** comes from `CPlayerDataCenter::GetPlayerData( id )` (`playerdata.cpp:32-63`): the name
  (`szPlayer`), `nJob`, `nLevel` and `uLogin` (the channel number, 0 when logged out). An unknown id makes an empty entry
  and sends one QUERY_PLAYER_DATA (§6). `sPlayerData` is `BYTE nJob, nLevel, nSex; int nVer; BYTE uLogin`
  (`playerdata.h:6-14`, 12 bytes on the wire).

## 2. The Messenger window (`CWndMessengerEx`, APP_MESSENGER_EX 302)

**Opened by** the applet "WndMessenger", icon `Icon_Messenger.dds`, hotkey **E** (`FuncApplet.cpp:103, :260`; T with the
other key set, `WndManager.cpp:2458-2460`), and by Start → Communication → Messenger (`WndTaskBar.cpp:2633, :2658-2661`,
`TID_APP_MESSENGER` "Messenger"). Not in the school event (`Initialize`, `WndMessenger.cpp:779-785`).

**Layout** `APP_MESSENGER_EX "WndTile10.tga" 1 352 368 0x2410000` (`resdata.inc:2180-2299`): caption, movable, sound
(`WndStyle.h:20, :26, :30`), title "Messenger" (IDS_RESDATA_INC_000270). Placed at the layout's bottom-right corner
(`OnInitialUpdate`, `WndMessenger.cpp:771-775`). The tab remembered in neuz.ini (`SerializeRegInfo`, `:401-415`).

| Control | Picture | Rect (client) | What |
|---|---|---|---|
| WIDC_STATIC1 | WndChgElemItem.bmp | 8,8-40,40 | the frame behind the own state icon |
| WIDC_BUTTON1 | ButtMsgRight.bmp | 122,26-134,38 | opens the state menu |
| WIDC_STATIC2 | WndEditTile00.tga | 168,8-320,40 | the box behind the server and channel names |
| WIDC_CHANNEL / STATE / LEVEL / JOB / NAME | ButtMessenger{Channel,State,Level,Job,Char}.bmp | 8-66, 68-122, 123-173, 174-232, 234-322 × 52-72 | the column heads; a press sorts |
| WIDC_TABCTRL1 | | 8,78-336,306 | the tabs |
| WIDC_ADD | ButtMessAdd.bmp | 8,310-24,326 | opens Add Friend ("Add friend." tooltip) |
| WIDC_BUTTON2 | ButtMessNote.bmp | 30,310-46,326 | opens the received notes (`CWndMessengerNote`) |
| WIDC_CUSTOM1 | | 56,312-68,324 | the flashing mail icon (WndMail.dds) when mail waits |

**Drawn every frame** (`OnDraw`, `WndMessenger.cpp:417-620`):

- The own state's **32 x 32 icon** at (8, 8): `icon_PlayerData.inc` frame `s - 2`, where `s` is 2 for online, 8 for
  offline, 3 (absent) for auto-absent, else the state (`:422-448`).
- The own name at (47, 10) and again at (48, 10) (a bold look), and "(state)" at (46, 27), both 0xff606060
  (`:450-484`); the state's text is TID_FRS_ONLINE_STATUS "Online", TID_FRS_OFFLINE_STATUS "Offline", TID_FRS_ABSENT
  "AFK", TID_FRS_HARDPLAY "Addict Mode", TID_FRS_EAT "Eating", TID_FRS_REST "Resting / Vending", TID_FRS_MOVE "Moving"
  (none for auto-absent and the others).
- On the Friend and Guild tabs: the server's name at (170, 13) and the channel's at (170, 27), 0xff606060, each cut
  after 18 bytes with "..." (`:508-563`). On the Mentor-Pupil tab: "Points: %d" (TID_GAME_CAMPUS_POINTS) at (190, 20)
  (`:499-507`).
- The mail icon (MODE_MAILBOX) and the note button's glow (unread notes) flash between alpha 50 and 255 in steps of 8
  (`:486-496`, `Process` `:622-656`); hovering the mail icon shows TID_MAIL_RECEIVE "New mail has arrived".

**Tabs** (`OnInitialUpdate`, `:663-705`): "Friend" (TID_APP_COMMUNITY_FRIEND, the `CWndFriendCtrlEx`), "Guild"
(TID_APP_COMPANY, `CWndGuildCtrlEx`), "Mentor-Pupil" (TID_APP_COMMUNITY_CAMPUS, `CWndCampus`). Opening the window with
friends sends GETFRIENDSTATE (`:669-678`). A tab change refreshes that tab's list (`OnChildNotify`, `:829-841`).

**The state menu** (`:707-714`, opened under WIDC_BUTTON1 at `:810-819`): Online, AFK, Addict Mode, Eating,
Resting / Vending, Moving, Offline (ids = the states). A choice sends SETFRIENDSTATE (`:844-848`).

**The column heads** sort the shown tab (`:863-925`, §3).

## 3. The friend list (`CWndFriendCtrlEx`)

- **Rows** (`UpdatePlayerList`, `WndMessengerCtrl.cpp:263-339`): one per friend, in map (player id) order, then sorted
  by the last sort. The channel is the player data's `uLogin`, or 100 when the friend's state is offline
  (`:311-314`).
- **Drawing** (`OnDraw`, `:356-538`), rows from (3, 3), 20 px apart (`m_nFontHeight`, `:230`), from the scroll position;
  `icon_PlayerData.inc`'s 16 x 16 frames:
  - channel icon at (20, y): frame 34 + channel − 1 for channels 1-10 (`:387-389`);
  - state icon at (76, y): frame 7 + (s − 2), `s` as for the own icon (`:391-406`);
  - level at (127, y + 3), black, green when allowed into one's house (`:408-423`);
  - job at (194, y) and the job type at (174, y) (`:425-486`): a 2nd job (JTYPE_PRO) frame 19 + job − 6; a master
    frame 27-32 by level (< 70, 70s, 80s, 90s, 100s, 110-120) plus frame 19 + job − 16; a hero frame 33 plus
    19 + job − 24; else frame 14 + job;
  - the name at (226, y + 3): black, the selected row 0xff6060ff, a blocked friend 0xffff0000 (and green for a house
    guest); cut after 10 bytes with "..." (`:488-531`).
  - The list draws no frame (`WBS_NODRAWFRAME`, `WndMessenger.cpp:667`); a 15 px scroll bar at its right
    (`OnSize`, `:938-955`); page = height / 20 (`SetScrollBar`, `:905-916`).
- **Hover** over (188, y)-(212, y + 20) shows the job's name (`OnMouseMove`, `:540-565`).
- **Left click** on a row selects it (`OnLButtonUp`, `:567-585`).
- **Double click** (`OnLButtonDblClk`, `:587-630`): a friend who is not offline and not blocked opens the Message window
  (§5) for its name; else the chat says TID_GAME_NOTLOGIN "That player is not connected." (offline) or
  TID_GAME_MSGBLOCKCHR "Failure to send message, %s is blocked.", in TID_GAME_NOTLOGIN's colour.
- **Right click** (`OnRButtonUp`, `:816-903`) selects the row and opens a menu:
  - 0 "Message" (TID_APP_MESSAGE): not offline and not blocked;
  - 1 "Block" / "Unblock" (TID_FRS_BLOCK / TID_FRS_BLOCKRESTORE): always; sends FRIENDINTERCEPTSTATE (a toggle);
  - 2 "Delete" (TID_FRS_DELETE): always; sends REMOVEFRIEND;
  - 3 "Move" (TID_FRS_MOVE2): not offline, not blocked, own authority at least game master; runs `/teleport "name"`;
  - 4 "Invite to join party" (TID_MMI_INVITE_PARTY): not offline, not blocked, not already in the party;
    `CWndWorld::InviteParty`;
  - 6 "Send a memo." (TID_GAME_TAGSEND): offline or blocked; opens `CWndMessageNote` (a note to an offline friend);
  - 7/8 "Cancel Entry Permissions" / "House Entry Permissions": housing (`:882-898`).
  - The commands are at `OnCommand`, `:694-814`.
- **Sorting** (`:28-193`, `:966-1054`): each head flips its own direction and sorts:
  - channel: by channel (offline = 100);
  - state: by state, offline counted as 12 (last when ascending);
  - level: by job type, then level;
  - job: by job type, then job;
  - name: by name (byte order).
  The first call goes ascending for channel, level, job and name, descending for state; the list starts sorted by
  state ascending (`m_nCurSort = SORT_BY_STATUS`, `:227-240`). A refresh re-applies the last sort in its last direction
  (`SortbyX( FALSE )` flips twice).

## 4. Adding, the request, removing and blocking

**Add Friend** (`CWndAddFriend`, APP_ADDFRIEND 270, `WndFriendConFirm.cpp:111-224`): `"WndTile06.tga" 1 240 144`
(`resdata.inc:27903-27958`): "Enter Name" static at 42,14; "Name :" at 16,48; the edit at 70,50-202,70 (focused);
OK (ButtOk.tga) 28,82; Cancel (ButtCancel.tga) 128,80. Title "Add Friend". OK:

- a name of `MAX_NAME` (64, `Mover.h:32`) bytes or more: the field is emptied and a box says TID_DIAG_0057 "That name is
  too long.  Please try again.";
- the own name: emptied, box TID_DIAG_0056 "You cannot add yourself to your list.  Please choose another character.";
- in the guild siege world: box TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD;
- else it sends ADDFRIENDNAMEREQEST and the chat says TID_GAME_MSGINVATE "You have asked for permission to add %s to
  your messenger." (0xff00ffff), and the window closes.

**From a player's menu**: "Add to my list" (MMI_ADD_MESSENGER 5, `WndWorld.cpp:6553`): a friend already gets the box
TID_DIAG_0051 "That player is already in your friends list."; else ADDFRIENDREQEST and the same TID_GAME_MSGINVATE line
(`:5141-5159`).

**The other side** (`OnAddFriendReqest`, `DPClient.cpp:7935-7973`): the snapshot ADDFRIENDREQEST brings the asker's id,
sex, job and name.

- With `/messengerrefuse` on (`g_Option.m_bMessenger` 0), it sends BLOCK(2, own name, asker) and stops.
- With a Confirm already open, BLOCK(6, ...) ("busy").
- Else **`CWndFriendConFirm`** opens (APP_FRIEND_CONFIRM 226, `"WndTile08.tga" 1 288 128`, `resdata.inc:24426-24462`),
  title "Confirm Friend Request", centred at y 70 (`WndFriendConFirm.cpp:43-61`). Its text (8,8-264,60) is
  TID_DIAG_0071 "%s wants to be your friend. Do you accept?" (`:33-42`); Yes (64,68) sends ADDFRIEND with the asker's
  job and sex, No (148,68) sends ADDFRIENDCANCEL; both close it (`:92-109`).

**The answers**: snapshot ADDFRIEND (id, name) adds the friend to both sides and asks the states again
(`OnAddFriend`, `DPClient.cpp:7886-7915`); ADDFRIENDCANCEL puts TID_GAME_MSGDENYINVATE "Invitation has been refused."
(`:7975-7979`); ADDFRIENDERROR (error, name) opens a box: 1 TID_DIAG_0059 "%s is already in your messenger.", 2
TID_DIAG_0060 (`:7981-7994`); ADDFRIENDNAMENOTFOUND (name) a box TID_DIAG_0061 (`:7996-8004`). BLOCK (gu, name)
(`OnBlock`, `:8336-8396`): 1 closes that name's Message window and says TID_GAME_MSGCHATDENY "%s is in the 'Refuse to
Whisper/Messenger' setting."; 2 TID_GAME_MSGDENY "%s is in the 'Refuse Messenger' setting."; 6 TID_GAME_YETFRIEND
"That player is currently busy..."; 7 the party's (already in the web client).

**Removing**: "Delete" sends REMOVEFRIEND (own id, friend). The snapshot REMOVEFRIEND removes the friend
(`:7917-7932`); the other side gets REMOVEFRIENDSTATE, which resets that friend to an unblocked offline entry
(`SetFriend( id, NULL )`, `:8006-8024`).

**Blocking**: "Block"/"Unblock" sends FRIENDINTERCEPTSTATE (own id, friend). FRIENDINTERCEPTSTATE (idPlayer, idFriend)
back: when `idPlayer` is oneself, the friend is blocked; else (the other side) that friend shows offline
(`:8148-8170`). FRIENDNOINTERCEPT (id) unblocks (`:8121-8131`). A blocked friend's whispers and `/say` lines are dropped,
and one's own to it gives TID_GAME_MSGBLOCKCHR (§7).

## 5. The small windows

**Message** (`CWndMessage`, APP_MESSAGE 223, `WndMessenger.cpp:1107-1267`): `"WndTile07.tga" 1 336 288`
(`resdata.inc:23646-23683`), opened with `WBS_THICKFRAME` (resizable, least 160 x 160, `:1141-1165`); title
"Message - name" (`WndManager.cpp:7072-7092`; one window per name, `m_mapMessage`). The text (4,4-324,196), the edit
(4,196-244,248) and Send (ButtSend.bmp 252,204); a resize keeps the text above a 50 px band and the edit and Send in it
(`OnSize`, `:1166-1203`). Enter or Send sends the chat line `/say "name" text` and empties the edit (`:1210-1252`).
A line is "#cffff0000name :#nc\n  text" for one's own (red name), "#cff0000ff..." for the other's (blue)
(`AddMessage`, `:1253-1267`; TID_GAME_FROM3 is empty in English). Placed at (layout right − width, 110), then centred.

**Instant message** (`CWndInstantMsg`, APP_INSTANTMSG 224, `:990-1104`): `"WndInstantMsg.tga" 0 144 112`
(`resdata.inc:25074-25093`), a text 0,0-132,80, opened without focus. One per name, stacked from the bottom-right
corner upwards, then in columns leftwards (`OpenInstantMsg`, `WndManager.cpp:7128-7155`). It closes itself 10 s after
it opened or last got a line (`:998-1007`). A click (not on its close box) opens the Message window with the line and
closes it (`:1039-1070`). Lines: a `/say` "#cff0000ffname :#nc\n  text" (`:1071-1083`); a friend's log-in
"#cff0000ff{name}has logged into the game.\n" (TID_GAME_LOGIN, `:1085-1095`). Each plays SND_INF_MESSENGERRING.

**Notes** (`CWndMessageNote` APP_MESSAGE_NOTE 300, `CWndMessengerNote` APP_MESSENGER_NOTE 298, `:1274-1433`): the
offline memo and the received memos (`g_Neuz.m_strTagMessage`, from the tag packets).

## 6. The packets

All go over the one client socket; the cache server sends the messenger ones to the core server
(`CORESERVER/DPCacheSrvr.cpp:40-44`) and the rest to the world server (`WORLDSERVER/DPSrvr.cpp:252-254, :284`).

**Client → server** (`DPClient.cpp`), after DPID_UNKNOWN and the type:

| Packet | Type | Fields | Line |
|---|---|---|---|
| ADDFRIEND | 0xffffff60 | u32 asker, u32 own; u8 askerSex, u8 ownSex; i32 askerJob, i32 ownJob | 11033-11043 |
| ADDFRIENDREQEST | 0xffffff61 | u32 own, u32 target | 11045-11053 |
| ADDFRIENDCANCEL | 0xffffff62 | u32 asker, u32 own | 11063-11068 |
| GETFRIENDSTATE | 0xffffff64 | u32 own | 11121-11128 |
| SETFRIENDSTATE | 0xffffff67 | u32 own, i32 state | 11130-11137 |
| FRIENDINTERCEPTSTATE | 0xffffff68 | u32 own, u32 friend | 11139-11145 |
| REMOVEFRIEND | 0xffffff6a | u32 own, u32 friend | 11147-11153 |
| ADDFRIENDNAMEREQEST | 0xffffff6b | u32 own, string name | 11055-11061 |
| BLOCK | 0xffffff5a | u8 gu, string own name, string other | 11155-11162 |
| QUERY_PLAYER_DATA | 0xf000f802 | u32 id, i32 version | 13484-13489 |
| CHAT | 0x00ff0000 | the line, e.g. `/say "name" text` | |

**Server → client, snapshots** (`DPClient.cpp:439-444, :617`; writers `WORLDSERVER/User.cpp`):

| Snapshot | Type | Fields | Reader |
|---|---|---|---|
| ADDFRIEND | 0x0070 | u32 id, string name | 7886-7915 (`User.cpp:1657-1674`) |
| ADDFRIENDREQEST | 0x0071 | u32 asker, u8 sex, i32 job, string name | 7935-7973 (`User.cpp:1543-1555`) |
| ADDFRIENDCANCEL | 0x0072 | — | 7975-7979 |
| ADDFRIENDGAMEJOIN | 0x0074 | u32 own state, i32 n, n × (u32 id, i32 bBlock, u32 state) | 7849-7884 (`rtmessenger.cpp:36-69`) |
| REMOVEFRIEND | 0x0075 | u32 id | 7917-7932 |
| ADDFRIENDERROR | 0x0076 | u8 error, string name | 7981-7994 |
| RETURNSAY | 0x00a9 | i32 flag, string | 12442-12470 |

(0x0073 ADDGETFRIENDNAME and 0x0077 ADDFRIENDCHANGEJOB only touch the old `m_Messenger`, `:13676-13696`,
`:17012-17027`: nothing to do with `__RT_1025`.)

**Server → client, top-level** (`DPClient.cpp:163-180, :207-211`; writers `CORESERVER/DPCacheSrvr.cpp`):

| Packet | Type | Fields | Reader |
|---|---|---|---|
| WHISPER | 0x00ff00d4 | string from, string to, string text, u32 idFrom, u32 idTo, i32 search | 11775-11909 |
| SAY | 0x00ff00e0 | the same | 11911-12074 |
| ADDFRIENDJOIN | 0xffffff65 | u32 id, u32 state, u32 channel | 8026-8053 |
| ADDFRIENDLOGOUT | 0xffffff66 | u32 id | 8090-8104 |
| GETFRIENDSTATE | 0xffffff64 | i32 n, i32 nBlock, (n + nBlock) × (u32 id, u32 state, u32 channel) | 8217-8278 |
| SETFRIENDSTATE | 0xffffff67 | u32 id, u32 state (oneself: the own state) | 8280-8315 |
| FRIENDINTERCEPTSTATE | 0xffffff68 | u32 idPlayer, u32 idFriend | 8148-8170 |
| FRIENDNOINTERCEPT | 0xffffff69 | u32 id (the core adds an i32 the client skips) | 8121-8131 |
| ADDFRIENDNAMENOTFOUND | 0xffffff6c | string name | 7996-8004 |
| REMOVEFRIENDSTATE | 0xffffff6d | u32 id | 8006-8024 |
| ONEFRIEMDSTATE | 0xffffff6e | u32 id, u32 state | 8317-8334 |
| BLOCK | 0xffffff5a | u8 gu, string name | 8336-8396 |
| UPDATE_PLAYER_DATA, LOGOUT, QUERY_PLAYER_DATA | | the player data | 977-1024, 13576-13606 |

**At log-in** (`OnFriendGameJoin`, `DPClient.cpp:7849-7884`; sent by `CUser::AddFriendGameJoin`, `User.cpp:1464-1476`):
the whole list with the own state; with any friend the client sends GETFRIENDSTATE, and the core answers GETFRIENDSTATE
with each friend's state. A friend logging in later sends ADDFRIENDJOIN; with "connection notice" on
(`m_bMessengerJoin`) and the friend not offline an instant message says it logged in (`:8042-8047`). The channel
numbers in these packets are dropped (`:8039-8041`, `:8235-8237`): the channel shown is the player data's.

**Auto-absent**: while the own state is 11, any key or mouse press sends SETFRIENDSTATE online
(`SetMessengerAutoState`, `WndManager.cpp:7351-7362`; called from `Neuz.cpp:1362, :1418, :1444`).

Every change refreshes the open window's Friend tab (`UpdateFriendList`, `WndMessenger.cpp:963-969`).

## 7. `/say` and the whispers

**The commands** (`FuncTextCmd.cpp:5137-5162`, long name / short name / server or client):

| Command | Short | Where | What |
|---|---|---|---|
| whisper | w | server | whisper |
| say | say | server | a private message (the Message window) |
| whisperagree / whisperrefuse | wa / wr | client | `m_bSay` 1/0, TID_GAME_WHISPERAGREE "Whisper allowed." / TID_GAME_WHISPERREFUSE "Whisper refused." |
| messengeragree / messengerrefuse | ma / mr | client | `m_bMessenger` 1/0, "Allow messenger" / "Refuse messenger" |
| connectagree / connectrefuse | ca / cr | client | `m_bMessengerJoin` 1/0, "Post connection status" / "Do not post connection status." |

The three options start on (`HwOption.cpp:188-192`) and are kept in neuz.ini (`:820-846`, `:1086-1090`); the client
commands put their line in the TID's colour (`FuncTextCmd.cpp:3776-3823`).

**`/say name text`** is a server command: the client sends the line as typed in CHAT. The world server
(`TextCmd_say`, `FuncTextCmd.cpp:1500-1561`) ignores it in SAYTALK mode or when muted (the mute's defined text), reads
the name (quotes allowed, CScanner), and:

- to oneself: RETURNSAY 2 → TID_GAME_MSGNOTTRANSELF "You cannot send a PM to yourself, silly.";
- an unknown name: RETURNSAY 3 → TID_GAME_MSGNOTEXIST "%s does not exist.";
- else the text (at most 260 bytes, trimmed, no CR/LF, effects parsed unless a font-edit scroll is on) goes to the core
  (`SendSay`), which sends **SAY** to the receiver and to the sender (`CDPCoreSrvr::OnSay`, `DPCoreSrvr.cpp:435-455`;
  `DPCacheSrvr.cpp:266-279`); when the receiver is not on, only the sender gets one, with empty names and text and
  `search` 1.

`/whisper` (`:1436-1498`) is the same with WHISPER, and an empty text is not sent.

**SAY arriving** (`OnSay`, `DPClient.cpp:11911-12074`, the `__RT_1025` branch :11926-11963 and :12007-12074):

1. The other side's id (the receiver's for one's own line) is looked up in the friends; a blocked friend: one's own line
   gives TID_GAME_MSGBLOCKCHR with the receiver's name and disables that Message window's edit and Send; the other's line
   is dropped.
2. `search` ≠ 0: TID_GAME_NOTLOGIN in the chat.
3. One's own line: added to the Message window for the receiver, which opens if closed.
4. The other's line: with `/whisperrefuse` on, BLOCK(1, own name, sender) and nothing shown. Else into that name's
   Message window when open; when not, into an **instant message** for that name plus a chat line `[name] text` in
   0xffffff00.

**WHISPER arriving** (`OnWhisper`, `:11775-11909`): the same block check (:11790-11831), `search` → TID_GAME_NOTLOGIN,
then `-> [to] text` for one's own and `<- [from] text` for the other's, 0xffffff00, CHATSTY_WHISPER; the other's sets
the reply name `g_Neuz.m_szWhisperName` (:11905-11906). With `/whisperrefuse` on, the other's whisper sends BLOCK(1) and
is not shown (:11899-11903).

**Reply**: typing `/r ` (or `/R `) in the chat becomes `/whisper name ` (`CWndChat::Process`,
`WndCommunication.cpp:502-513`); R in the world with the chat unfocused does the same (`WndWorldControlPlayer.cpp:121-
135`). There is no reply for `/say`.

**RETURNSAY** (`OnReturnSay`, `DPClient.cpp:12442-12470`): flag 1 `[name] text`, 2 TID_GAME_MSGNOTTRANSELF, else
TID_GAME_MSGNOTEXIST, in TID_GAME_MSGNOTEXIST's colour.

**Message from a player's menu**: MMI_MESSAGE opens the Message window for that player (`WndWorld.cpp:5138-5140`); V15's
player menu does not list it (`:6552-6554`).

## 8. Online

Public pages on the V15 window are thin; none shows it whole. What they say (all agree with the code):

- E opens the Messenger; M is the world map (gpotato wiki "Hot Key", https://flyff-wiki.gpotato.com.br/wiki/Hot_Key;
  https://jrobinet.page.tl/Chat.htm).
- V15's Messenger has a Mentor/Pupil tab ("Press E to open your Messenger and click on the Mentor/Pupil tab",
  https://flyff-wiki.gpotato.com.br/wiki/Mentor_%26_Pupil_System). Older guides show Friend / Party / Guild tabs (the
  pre-V11 `CWndMessenger`, `WndMessenger.cpp:24-385`).
- The state list: "Online, Offline, AFK, Addict Mode, Eating, Resting/Vending and Moving" (Gala guide,
  https://www.en-galalab.flyff.com/user-interface).
- Adding: the "+" button and a name, or the player's menu; the other player gets a Yes/No window (jrobinet; New Pang
  Tutorial).
- House Entry Permissions in the list's menu since V13 (gpotato "Housing System").
- Whispers are yellow; right-clicking a chat line whispers its sender.
- Flyff Universe's command list (https://madrigalinside.com/guides/beginners-guide/useful-chat-commands/) describes
  `/say` as "Opens a message box to privately message another player", as Neuz does. Its aliases (/wag, /mag, ...) are
  Universe's; V15's are /wa /wr /ma /mr /ca /cr (`FuncTextCmd.cpp:5153-5160`).

## 9. What FlyffWeb has, and what it lacks

Has (main f7f40be):

- `/w` and `/whisper` (and `/say`) go to the server as typed in CHAT (`hud/chatSend.ts`, `chatCommandTable.ts:22-23`).
- WHISPER is read (`protocol/src/world/chat.ts:17-19`) and shown `-> [to]` / `<- [from]` in yellow on the desktop chat
  (`hud/chatRules.ts:96-100`); `/r ` and the right-click whisper (`neuzChat.ts:391-418`); RETURNSAY (`WorldScreen.ts`).
- The player data (`world/party/playerData.ts`) with its query.
- The player menu lists "Add to my list" (greyed, `world/party/playerMenu.ts`); APP_MESSENGER_EX 302 and its E are in
  `hud/applets.ts:68`.
- The login's per-slot messenger is read (`protocol/src/messages/login.ts:105-110`) but unused in the world.

Lacks:

1. No friend packet is defined or read: ADDFRIENDGAMEJOIN and the other snapshots, the core's top-level packets, the
   senders. SAY 0x00ff00e0 falls through as unknown.
2. No Messenger window, Add Friend, Confirm, Message or Instant message window; no Start menu line or E hotkey for it.
3. `/say` gives no window: the answer is dropped.
4. The client commands `/wa /wr /ma /mr /ca /cr` do nothing.
5. BLOCK is read only for the party (gu 7).
6. The whisper ignores blocked friends and `/whisperrefuse`.
7. "Add to my list" is greyed.
8. Theme pictures not yet converted: ButtMsgRight.bmp, ButtMessAdd.bmp, ButtMessNote.bmp, ButtMessenger{Channel,State,
   Level,Job,Char}.bmp, ButtSend.bmp, WndInstantMsg.tga, WndMail.dds. Already there: WndTile06/07/08/10, WndChgElemItem,
   WndEditTile00, ButtOk/Cancel/Yes/No, icon_PlayerData.

Out of this work's reach (no data in the browser): the Guild and Mentor-Pupil tabs' lists (the browser keeps no guild
or campus member list), the mail icon (MODE_MAILBOX), the memos (the tag packets and `CWndMessengerNote`), housing's
entry permissions.
