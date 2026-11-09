# GM commands, names and marks: research (2026-11-10)

The owner's request: "Research on how the GM commands work on the original clients. Currently most of it is not working on
the web. Also I should be able to see my name and icons whatever i am a regular player or GM or admin. its just that
normal players cannot see any details of the admin/gm".

Sources: the Neuz V15 source (`Source/`, CP949, read through `iconv -f cp949 -t utf-8`), the world server's side as far as
the client needs it, and the web. Line numbers are the original files'. `FTC` is `_Interface/FuncTextCmd.cpp`, `DPC`
`Neuz/DPClient.cpp`. The code wins over the web pages.

## 1. Short answer

- A GM command is an ordinary chat line. Neuz checks the command and the account's authority itself, then either runs it
  (TCM_CLIENT), sends the line as chat (TCM_SERVER), or runs a client half and sends what that half says (TCM_BOTH). The
  server runs the line again through the same table and answers with ordinary snapshots.
- A command above the account's authority is not a command at all: Neuz sends nothing and says nothing.
- An invisible player (TRANSPARENT_MODE) has no name over its head, its own included; its own body is drawn faint. A
  normal player does not see an invisible GM at all, cannot target a GM's bar, and never sees a GM on the minimap.
- A GM keeps invisible and undying across log-ins (only non-GMs get them cleared). The web never read the "mode changed"
  message, so a GM who once typed /invisible came back invisible with no name and no way to see it: this is why the
  owner's own name was gone.

## 2. How Neuz runs a "/" line

| Step | Where | What |
|---|---|---|
| The line | `CWndMgr::ParsingChat`, `_Interface/WndManager.cpp:3820-3853` | trimmed, cut at 120 bytes, quotes taken off; a line starting with "/" goes to `ParsingCommand`, its result ignored |
| The table | `FTC:5135-5496` (`ON_TEXTCMDFUNC( func, long, short, krLong, krShort, route, auth, desc )`) | routes `TCM_CLIENT` 0, `TCM_SERVER` 1, `TCM_BOTH` 2 (`FTC:109-111`) |
| The match | `ParsingCommand`, `FTC:5549-5650` | the second token matched exactly (MFC `CString ==`, case and all) to the long, short and Korean names; first match wins |
| English cut | `FTC:5561-5565` | outside Korea the loop stops at the `open` row (`FTC:5291`): only the 111 rows before it exist. The "/" list stops there too (`CWndCommand::OnInitialUpdate`, `_Interface/WndCommand.cpp:55-59`) |
| Authority | `FTC:5588-5592`, `Mover.h:1061`, `authorization.h:85-101` | `!IsAuthHigher( m_dwAuthorization )` breaks out of the loop: not a command |
| Run | `FTC:5594-5602` | TCM_SERVER: `SendChat( line )`. TCM_CLIENT: the function. TCM_BOTH: the function, and if it returns TRUE, `SendChat( scanner.m_pBuf )` (the line, or what the half rewrote with `SetProg`) |
| Not a command | `FTC:5620-5647` | an emoticon (`/laugh`, matched without case, no "#") goes as chat; anything else: nothing sent, no message |
| The packet | `CDPClient::SendChat` | `PACKETTYPE_CHAT` 0x00ff0000, the string |
| Server | `CDPSrvr::OnChat`, `WORLDSERVER/DPSrvr.cpp:690-740` | a "/" line goes through `ParsingCommand` again (server halves); if it is no command for this user, the line is said as plain chat. So a client must not send a refused command |

The `/ta` trap: the client's table has `tradeagree` ("ta", TCM_CLIENT, `FTC:5151`) first; the server's has no
`#ifdef __CLIENT` rows, so for it `/ta` is `notalk` (`FTC:5180`). Neuz never sends `/ta`.

## 3. The command list (English set, `FTC:5137-5285`)

Auth: F every player, L GM1, M GM2, J helper, N GM3, P administrator. "Half" is the client half for TCM_BOTH or TCM_CLIENT
(details §4). Commands after `open` (`FTC:5291-5495`: music, sound, gmitem, userlist, InvenClear, ... ) are Korean-only.

| Auth | Commands (long / short) | Route |
|---|---|---|
| F | whisper/w, say | S |
| F | position/pos, Time/ti, tradeagree/ta, traderefuse/tr, whisperagree/wa, whisperrefuse/wr, messengeragree/ma, messengerrefuse/mr, stageagree/ga, stagerefuse/gr, connectagree/ca, connectrefuse/cr, shoutagree/ha, shoutrefuse/hr, ignore/ig, unignore/uig, ignorelist/igl | C |
| F | shout/s, partychat/p, GuildChat/g | B (half sends "/s", "/p", "/g") |
| F | PartyInvite, GuildInvite, CampusInvite | S |
| L | teleport/te, invisible/inv, noinvisible/noinv, summon/su, count/cnt | S |
| M | out, talk/nota, notalk/ta, Mute/mute, GuildRanking/ranking, FallSnow/fs, StopSnow/ss, FallRain/frain, StopRain/sr | S |
| M | ip | B |
| J | system/sys | S |
| N | PvpParam/p_Param, PKParam/pkparam, aroundkill/ak, stat, level/lv, InitSkillExp/InitSE, BeginQuest/bq, EndQuest/eq, RemoveQuest/rq, RemoveAllQuest/raq, RemoveCompleteQuest/rcq, changejob/cjob, freeze/fr, nofreeze/nofr, PartyLevel/plv, GuildStat/gstat, createguild/cg, createnpc/cn, EVENTLIST, EVENTINFO, gamesetting/gs, rmvnpc/rn | S |
| N | undying/ud, undying2/ud2, noundying/noud, onekill/ok, noonekill/nook, skilllevel/slv, skilllevelAll/slvAll, GCIn, GCOpen, GCClose, GCNext, indirect/id | B |
| N | destroyguild/dg | C |
| P | disguise/dis, noDisguise/nodis, getgold/gg, createitem2/ci2, QuestState/qs, ReloadConstant/rec, Lua, SetPetName, Propose, Refuse, Couple, Decouple, ClearPropose, NextCoupleLevel/ncl | S |
| P | ResistItem/ritem, createitem/ci, loadscript/loscr, ctd, Piercing/pier, petlevel/pl, petexp/pe, makepetfeed/mpf, Pet, GC1TO1OPEN, GC1TO1CLOSE, GC1TO1NEXT, RefineAccessory/ra, RefineCollector/rc, GenRandomOption/gro, InitializeRandomOption/iro, SetRandomOption/sro, RemoveBuff/rb, HonorTitleSet/hts | B |
| P | jobname/jn, ClearPetName/cpn | C |

## 4. The client halves that matter (TCM_CLIENT and TCM_BOTH)

Every other TCM_BOTH half is empty or does nothing in Neuz (`undying` ... `noonekill` `FTC:3118-3149, 2990-2999,
3554-3593`; `GC*` `FTC:4170-4235`; `loadscript`, `ctd`, pets, `GC1TO1*`, random options, `RemoveBuff`, `HonorTitleSet`):
the line goes as typed.

| Command | Half | Sends |
|---|---|---|
| position | `TID_GAME_NOWPOSITION` by PutString, colour 0xffccffcc (`FTC:3568-3578`) | nothing |
| Time | "Real Time - %H:%M:%S", then "Madrigal Time - %d:%d:%d" from `g_GameTimer` (`FTC:170-183`) | nothing |
| jobname | four red lines: "Expert Job : ...", "Expert Level : 16 ~ 60", "Professional Job : ...", "Professional Level : 60 ~~~ " (`FTC:3723-3760`, ranges `Resource/defineJob.h:19-20, :42, :50, :63`) | nothing |
| ClearPetName | `SendClearPetName` (`FTC:2194-2200`) | PACKETTYPE_CLEAR_PET_NAME |
| destroyguild | `SendDestroyGuild` (`FTC:1113-1119`) | PACKETTYPE_DESTROY_GUILD |
| agree/refuse toggles | set `g_Option.m_bTrade`, `m_bSay`, `m_bMessenger`, `m_bParty`, `m_bMessengerJoin`, `m_bShout` and print `TID_GAME_*AGREE/REFUSE` (`FTC:3764-3835`) | nothing |
| ignore, unignore, ignorelist | the chat block list and its window (`FTC:3838-3924`, `__YS_CHATTING_BLOCKING_SYSTEM`) | nothing |
| ip | a focused player: "/ip name"; else the line (`FTC:3610-3630`) | chat |
| skilllevel | needs the skill window open with a skill chosen, else red `TID_GAME_CHOICESKILL`; a level above `dwExpertMax`: red `TID_GAME_SKILLLEVELLIMIT`; else the line becomes `TID_GAME_GAMETEXT001` "/slv %d %d" (skill, level) (`FTC:1356-1404`) | chat, rewritten |
| createitem | no words: opens `CWndAdminCreateItem`, sends nothing (`FTC:2537-2550`) | chat when it has words |
| indirect | no words: opens `CWndIndirectTalk`, sends nothing (`FTC:3350-3363`) | chat when it has words |
| ResistItem | opens `CWndUpgradeBase` (APP_TEST) first; needs an item in its slot; rewrites "/ritem objid res rao ao" (`FTC:1613-1661`) | chat, rewritten |
| Piercing | needs APP_PIERCING open with an item; rewrites "/pier objid n" (`FTC:1711-1738`) | chat, rewritten |
| makepetfeed | opens `CWndPetFoodMill` if closed and sends nothing; open, the line goes (`FTC:390-402`) | chat |

## 5. What the server answers (what the client must read)

Three failure replies recur: `AddReturnSay(3, name)` "%s does not exist.", `AddReturnSay(2)` (yourself), and the core's
`TID_GAME_NOTLOGIN` "That player is not connected." Most other failures are silent.

| Command | Answer | Neuz handler |
|---|---|---|
| teleport | same world: SETPOS; another: REPLACE (`FTC:2375-2461`; forms "/te name", "/te world key", "/te world x z") | `OnSetPos` DPC:2221, `OnReplace` DPC:2303 |
| invisible, noinvisible, undying(2), noundying, onekill, noonekill, freeze, nofreeze, talk, notalk | SNAPSHOTTYPE_MODIFYMODE 0x00d3, the whole `m_dwMode`, to all in view (`User.cpp:5158-5169`) | `OnModifyMode` DPC:12278-12379: sets it; the own GM gets a line of its modes ("Undying1", "Invisible", "OneKill", "Freeze player", then "Status", or "Normal"), the English texts run together; unread mail gives `TID_MAIL_RECEIVE` |
| count | `AddText` "Players online: %d" and the core's PACKETTYPE_GETPLAYERCOUNT 0x00ff00e8 (WORD) | `OnText` DPC:1582; `OnGetPlayerCount` DPC:12106 `TID_ADMIN_WORLDCOUNT` "[World CCU] %d", CHATSTY_GENERAL |
| ip | PACKETTYPE_GETPLAYERADDR 0x00ff00e7 (name, address) | `OnGetPlayerAddr` DPC:12092: "[IP] name : addr", blue |
| system | the core's PACKETTYPE_SYSTEM 0x00ff00ea (512) to everyone | `OnSystem` DPC:12144: `TID_ADMIN_ANNOUNCE` in the chat, and a caption |
| stat, level, changejob, EVENTLIST, EVENTINFO, Mute, GC*, ctd ... | `CUser::AddText` (`User.cpp:705-716`): SNAPSHOTTYPE_TEXT 0x00a0 with a BYTE state first (`__S_SERVER_UNIFY`, on in both `VersionCommon.h`): 1 a green line, 2 a box | `OnText` DPC:1582-1604 |
| skilllevel, skilllevelAll | SNAPSHOTTYPE_CMDSETSKILLLEVEL 0x006b (skill, level) | `OnCmdSetSkillLevel` DPC:13531: the level, `TID_GAME_SKILLLEVELUP`, the skill window again |
| disguise, noDisguise | SNAPSHOTTYPE_DISGUISE 0x00f5 (mover index), NODISGUISE 0x00f6 | `OnDisguise` DPC:13706 / `OnNoDisguise` :13732: `SetIndex` (`Mover.cpp:8882-8930`) |
| createitem(2), getgold, stat, InitSkillExp, createnpc, rmvnpc, indirect, ResistItem, Piercing, RemoveBuff, pets | CREATEITEM, SETPOINTPARAM, SETSTATE, INITSKILLPOINT, ADD_OBJ, DEL_OBJ, CHAT, UPDATE_ITEM, REMOVESKILLINFULENCE, PET* | already read by the web |
| PvpParam, PKParam, FallRain/StopRain, gamesetting, ctd | SETFAME 0x0040, PK_RELATION, ENVIRONMENT, GAMERATE 0x002e, ADDREGION | `OnSetFame` DPC:4014, `OnPKRelation` :15457, `OnEnvironmentEffect` :5568, `OnGameRate` :6473, `OnAddRegion` :16187 |
| FallSnow/StopSnow | nothing: the core ignores them under `__ENVIRONMENT_EFFECT` (`CORESERVER/DPCoreSrvr.cpp:73-81`) | none |

## 6. Names, marks and what each sees

How the client learns a mover's authority and mode: every ADD_OBJ of a player (the own one in the join bundle, others as
they come in view) carries `(char)m_dwAuthorization`, then `m_dwMode`, then `m_dwStateMode` after the party fields
(`_Common/ObjSerializeOpt.cpp:153-155`, read :460-462). Later changes of the mode come as MODIFYMODE (§5). The authority
never changes in play. The server sends ADD_OBJ, chat and everything of an invisible GM to every client in view
(`WORLDSERVER/LinkMap.cpp:206-349`): the hiding is all client-side.

| Thing | Own GM sees | A normal player sees of a GM |
|---|---|---|
| Name over the head, visible | "[title] Name [GM]" or "[Admin]" in COLOR_GAMEMASTER / COLOR_ADMINISTRATOR (`MoverRender.cpp:1248-1287`, `World3D.cpp:1282-1297`) | the same (the viewer-dependent colour of `World3D.cpp:1284-1297` is overwritten by `RenderName`) |
| Name, invisible | none, the own one too (`World3D.cpp:1282`) | none |
| Body, invisible | the own at blend 80/255; another GM's faint too (`MoverRender.cpp:517-531`) | not drawn |
| Ride, shadow, weapon glow, set aura, HP bar over the head, footsteps, dust, bubble (GM) | none while invisible (`MoverRender.cpp:591-714, :816, :1741`, `World3D.cpp:1031, :1493`, `Sfx.cpp:2866-3995`, `Mover.cpp:3177-3225`, `WndManager.cpp:4100-4102`) | none |
| Targeting an invisible mover | n/a | impossible, for a GM too (`WndWorld.cpp:6372, :6403, :7680`); a focus that goes invisible is dropped (`:1054`) |
| Target bar on a GM | n/a | only the selection frame: no name, level, HP or buffs unless the viewer is a GM (`WndWorld.cpp:2742-2753`) |
| Minimap | own arrow | a GM is never a dot, visible or not (`WndField.cpp:9352`) |
| Chat line | "Name : text", no mark | the same |
| Right-click menu, inspect, party, friends, guild | no authority checks (`WndWorld.cpp:6517-6620`) | normal |
| Own status and character windows | the own name and level as any player; a few GM-only buttons | n/a |

A disguised GM (the disguise item's `IK3_TEXT_DISGUISE` buff) has no guild name, mark or HP bar (`MoverRender.cpp:1489-1493,
:1754-1758`).

## 7. Online

Fan pages have little on V15. An old elitepvpers list ("Flyff GM Commandlist",
https://www.elitepvpers.com/forum/flyff/89156-flyff-gm-commandlist.html) names /teleport, /invisible, /noinvisible,
/undying, /undying2, /noundying, /createitem, /createitem2: all in the table above. Nothing found online on how a GM's
name looks; the code is the only source.

## 8. What the web had, and why it failed

| Problem | Effect |
|---|---|
| MODIFYMODE (0x00d3) had no reader | /invisible, /noinvisible, /undying, /onekill, /freeze, /notalk changed nothing on screen; the GM's state line never came |
| The own name tag was null while invisible (as Neuz) and the mode never updated | a GM who once went invisible came back invisible (`DPDatabaseClient.cpp:1024-1031` keeps a GM's modes), with no name and no sign why: the owner's missing name and Master/Hero icon |
| Name tags were only re-checked for movers that already had one | a player seen again after /noinvisible never got its name back |
| Invisible bodies were drawn whole, for everyone, and clickable | normal players saw invisible GMs |
| TEXT (0x00a0) read without its state byte | every `AddText` answer was dropped (/count's, /stat's, /eventlist, the guild siege's) |
| GETPLAYERCOUNT, GETPLAYERADDR, SYSTEM had no reader | /count, /ip and /system answered nothing |
| CMDSETSKILLLEVEL and DISGUISE/NODISGUISE had no reader | /skilllevel(All) and /disguise showed nothing |
| TCM_BOTH halves were skipped | /skilllevel sent "/skilllevel 5" (the server read skill 5, level 0); /ip ignored the focus; /ci and /id with no words, /ritem, /pier, /mpf were sent raw |
| /position and /Time printed in the screen's message lines | Neuz writes them in the chat's System window |

Left out on purpose: the `__BB_*` features (`__BB_VIP_AUTH_LEVELS`, `__BB_STAFF_MODERATOR_AUTH` and its command gate
`FTC:5499-5548, :5580-5587`, `__BB_VIP_TITLES`'s name colour). No owner-made GM command was found in the table itself;
`/count`'s "Players online" `AddText` (`FTC:3650-3652`) may be a later addition, but it is not under a `__BB_*` flag.
