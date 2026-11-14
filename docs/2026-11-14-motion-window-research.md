# Motion window (V15): research, 2026-11-14

What V15 Neuz does, read from the outer repo's source. Paths are from `Blouflash VS22 V15/`.

## The window
- `CWndMotion`, `APP_MOTION` (172). `Source/_Interface/WndMotion.cpp`, `.h`.
- Hotkey **O**: `AddAppletFunc( AppMain_WndMotion, APP_MOTION, ..., "Icon_Motion.dds", TID_TIP_MOTION, 'O' )`
  (`_Interface/FuncApplet.cpp:198`). The owner was right.
- Start menu line "Motion" (`TID_APP_MOTION`), after Quest Diary, before World Map (`WndTaskBar.cpp:2622`).
- Layout: `Resource/resdata.inc:17727`: `APP_MOTION "WndTile09.tga" 1 304 320`, title "Motion"
  (`IDS_RESDATA_INC_001702`), one control `WIDC_TABCTRL1` at 8,8-300,274.
- Two tabs of the same window: **Motion** (`TID_GAME_TOOLTIP_MOTION`) and **Emoticon** (`TID_GAME_TOOLTIP_EMOTICON`),
  tab buttons 130 px (`SetButtonLength( 130 )`). Motion is chosen first.
- Each tab is a grid of 32 x 32 icons, 8 a row, at `(col * 32 + 3, 7 + row * 32)` (`OnDraw`).
- Tooltip: a motion's `szDesc`; an emoticon's `/command`. Cheer adds its points: "Cheer Message Point(s): %d/3" and,
  under 3, "Time left until the next point" + minutes/seconds.
- A click (button up on the icon pressed) uses it: `ObjectExecutor( SHORTCUT_MOTION, id )` or
  `ObjectExecutor( SHORTCUT_EMOTICON, index )`. A drag carries it to the task bar.

## The action list
- `Resource/propMotion.txt` (+ `.txt.txt` for strings): 27 rows, all for `__VER` 15 (version column 6, 8 or 13).
  Columns: `dwID` (`MOT_BASE_*`, `defineNeuz.h:320-348`), `dwMotion` (`MTI_*`), icon (`Client/Icon/mot_base*.dds`,
  already converted as `ui/mot_base*.png`), `dwPlay` (0 once, 1 hold the last frame, 2 loop), `szName` (said in chat
  1 s later: Scissors, Rock, Paper, North, South, East, West, Pow!), `szDesc` (tooltip).
- Order: Combat Stance, Sit Down, Pickup Nearby Item, Shake Hands, Tilt Head, Nod Head, Shake Head, Run in place,
  Parade Rest, Attention, Scissors, Rock, Paper, Point North/South/East/West, Kneel, Push-Ups, Shake butt, Punch,
  Put head on ground, Raise weapon, Nearest Town Teleport, Cheer, Auto attack, Propose.

## What using a motion does (`CWndMgr::ObjectExecutor`, `WndManager.cpp:2922-3098`)
- Refused while a vendor (personal shop) window is open.
- `szName` set: sent as normal chat after 1 s (`m_timerChat`, :3445-3449), even when the motion is refused.
- Combat Stance: `OBJMSG_MODE_PEACE` / `OBJMSG_MODE_COMBAT`, then PLAYERBEHAVIOR.
- Sit Down: `SendMotion( OBJMSG_STANDUP / SITDOWN )` (PACKETTYPE_MOTION 0x00ff0016, `ar << dwMsg`); the server
  answers MOTION to everyone (`CDPSrvr::OnMotion`, `DPSrvr.cpp:2521`). A sitting player who clicks the ground stands up
  first (`SendSnapshot`, `DPClient.cpp:11160-11165`); keys do not move a sitting player.
- Pickup Nearby Item: `DoPickupItemAround` (`MoverSkill.cpp:3493`): the nearest item within 4 m is picked up.
- Nearest Town Teleport: PACKETTYPE_DO_ESCAPE (0x20), no body; the server uses the virtual escape blinkwing
  (`OnDoEscape`, `DPSrvr.cpp:4619`).
- Cheer: PACKETTYPE_CHEERING (0xffffff7c), `ar << objid` of a focused player, else `TID_CHEER_NO2`. The server does
  the rest (points, motion MTI_CHEERSAME/OTHER, effects, the Cheer buff; `OnCheering`, `DPSrvr.cpp:4635`). Points
  come with the join and SETCHEERPARAM 0x00b4.
- Auto attack: on an attackable focus: a wand casts, else auto-attack on; else `TID_GAME_NOTTARGET`.
- Propose: a focused player: OK/Cancel box "Would you like to propose to %s?" (`TID_GAME_PROPOSETO`), OK sends
  PACKETTYPE_PROPOSE 0x8ffff000 (`WriteString( name )`); else `TID_GAME_NOTCOUPLETARGET`.
- Any other: `SendActMsg( OBJMSG_MOTION (46), MTI_*, play mode )` and the Point motions turn the player
  (N 180, S 0, E 90, W 270); on success PLAYERBEHAVIOR.
- `OBJMSG_MOTION` (`ActionMoverMsg.cpp:1105-1124`): refused when sitting, in an action, jumping, attacking, hurt;
  sets `OBJSTAF_ETC`, `m_nMotionEx`, plays the motion `MOP_FIXED`. A held/looping one ends when the player clicks
  (`ActionMoverState.cpp:44-65`) or moves.
- **Other players see it**: PLAYERBEHAVIOR carries state flag, `m_dwMotion`, `m_nMotionEx`, loop; the server passes it
  on as MOVERBEHAVIOR, and `ActionForceSet` plays it (`MoverParam.cpp:3347`). FlyffWeb already plays reported motions
  (`ActionMover.forceSet`), and the `mot00*` animations are converted.

## Emoticons
- `Resource/textEmotion.txt` (+ `.txt.txt`): 29 commands, `laugh` ... `love` (FlyffWeb already has them, `EMOTICONS`).
- Pictures: `Client/Theme/Default/texChatEmoticon.inc` / `.dds`: 29 frames of 32 x 32 in rows of 10.
- Using one sends the chat line `/<command>` (`ObjectExecutor`, :2717-2723).
- Receiving a chat that starts with `/` or `!` (`CDPClient::OnChat`): **no chat-log line**; `/<command>` shows the
  emoticon over the speaker's head for 5 s (`CDialogMsg::AddMessage`, `AddEmoticonUser`); another `/` line is a
  bubble only.

## Task bar
- Motions and emoticons go on the item bars and the applet row (`OnDropIcon`, `WndTaskBar.cpp:1874`), drawn with their
  icon (`SetTaskBarTexture`, :445-467). Emoticon shortcut: `SHORTCUT_EMOTICON` (10), `m_dwId` the index, text rebuilt
  as `/<command>` at load. Tooltips as in the window. Pressing the slot runs `ObjectExecutor` as the window does.
