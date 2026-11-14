# Cheers, Couple, Follow and Duel (V15): research, 2026-11-15

What V15 Neuz and the world server do, read from the outer repo's source. Paths are from `Blouflash VS22 V15/Source/`
unless they start with `Resource/` or `Client/`. All four are compiled in (`__VER` 15; the couple's `__COUPLE_1117` /
`__COUPLE_1202` defines are commented out, but the code is behind `#if __VER >= 13`). The player menu is
`CWndWorld::ShowMoverMenu` (`_Interface/WndWorld.cpp:6523-6716`), within 20 m.

## 1. Cheers
- **Ways to cheer:** the Motion window's Cheer (on main) and the player menu's **Cheer** (MMI_CHEER 31, every player, not a
  seller): `SendCheering( id )` when not flying (`WndWorld.cpp:5680-5686`). No hotkey, no target-bar button, no chat command.
- **Server** `CDPSrvr::OnCheering` (`WORLDSERVER/DPSrvr.cpp:4635-4693`): self = silent; not a player = TID_CHEER_NO2; no point
  = TID_CHEER_NO1 ("...try again after %s minutes."). On success: a point spent (SETCHEERPARAM), the cheerer turns to the
  target and plays MTI_CHEERSAME 145 (same sex) or MTI_CHEEROTHER 146 (MOVERBEHAVIOR); the target gets TID_CHEER_MESSAGE3
  "%s sent you a cheer message of friendship!" or MESSAGE4 "...of love!" (DEFINEDTEXT); effects XI 1717 on the cheerer and
  1718 on the target (CREATESFXOBJ); the target gets the **Cheer** buff II_CHEERUP 10445 for 10 min (SETSKILLSTATE).
- **The buff** has no DST: `CMover::GetExpFactor` gives x1.05 EXP (`_Common/MoverParam.cpp:4228-4242`); the Lua cheer factor
  is only in a commented sample (`Resource/Event.lua:66`), so x1.05. All server side.
- **Points:** 0 at every login, +1 an hour (TICK_CHEERPOINT 60 min, `__MAINSERVER`), 3 at most (`_Common/Mover.h:102-108`,
  `WORLDSERVER/User.cpp:443`, `Mover.cpp:8912-8935`); +1 shows TID_CHEER_MESSAGE5 (on main).
- **Character window: nothing.** No V15 window shows cheer points except the Motion window's and the task bar's tooltips
  (`_Interface/WndMotion.cpp:216-262`, `WndTaskBar.cpp:641-670`), which main has.
- **Already in FlyffWeb:** DEFINEDTEXT lines, CREATESFXOBJ effects (1717/1718 converted), MOVERBEHAVIOR motions (145/146
  converted), the item buff icon (`itm_cheer.png`). **Missing:** only the player menu's Cheer entry.

## 2. Couple (= "Marriage")
- **One system, "Couple".** No marriage, spouse or wedding code; the "Wedding Ring" (II_GEN_WARP_WEDDING_BAND) is the old
  ring-carving warp item, not part of it.
- **Packets** (`_Network/MsgHdr.h:777-783`; `Neuz/DPClient.cpp:18632-18653`): PROPOSE 0x8ffff000 (name), REFUSE
  0x8ffff001, COUPLE 0x8ffff002 (accept), DECOUPLE 0x8ffff003, all without body but PROPOSE. Snapshots
  (`Neuz/couplehelper.cpp:30-111`; `WORLDSERVER/User.cpp:3753-3846`): COUPLE 0x9700 (int exp, u32 first, u32 second; after
  the join, only when coupled), PROPOSE_RESULT 0x9701 (u32 proposer, name: a proposal received), COUPLE_RESULT 0x9703 (u32
  partner, name), DECOUPLE_RESULT 0x9704, ADD_COUPLE_EXPERIENCE 0x9705 (int).
- **Rules** (`WORLDSERVER/couplehelper.cpp:47-259`, `databaseserver/couplehelper.cpp:213-343`): opposite sex, both
  single, target online on this server, 24 h between proposals (TID_GAME_COUPLE_M00); the proposal has no timeout. Couple
  EXP +1 about each minute while both are online on the same server; level from `Resource/couple.inc` (50 totals, cap 21);
  each level-up mails items. Break-up: no cost. DB tables and procedures exist in `Database.sql`.
- **Windows** (`_Interface/WndField.cpp:23076-23511`): `CWndCoupleMessage`, an OK/Cancel box: "Would you like to propose to
  %s?" (on main), "%s has proposed to you. Would you like to make a couple?" (OK = COUPLE, Cancel = REFUSE), "Are you
  certain you would like to break up with %s?" (OK = DECOUPLE). `CWndCoupleManager` APP_COUPLE_MAIN 813
  (`Resource/resdata.inc:27630`, 304 x 352, "Couple"), two tabs: **Couple Information** (APP_COUPLE_TAB_INFO 815, :27492:
  the partner's name, job, level with the master/hero icon, the couple level, the EXP gauge, Break Up button) and **Couple
  Skills** (APP_COUPLE_TAB_SKILL 817, :98: `Bg_Couple_Skill.tga`, the three skill icons, `Client/Client/CoupleSkillInfo.inc`).
  Opened by **F** (`_Interface/FuncApplet.cpp:259-264`) or Start > Communication > Couple (`WndTaskBar.cpp:2663-2665`).
- **Skills = buffs the server applies by itself** while the partner is online on the same server
  (`WORLDSERVER/User.cpp:3797-3837`): Power of Love 26720-26723 (couple level 6/11/16/21), Blessing of Love 26730-26731
  (11/21), Miracle of Love 26740 (21) (`Resource/couple.inc:160-175`). Shown in the buff row like any item buff; their
  tooltip hides the time (IK3_COUPLE_BUFF, `WndWorld.cpp:9386-9390`).
- **No name tag or mark.** The partner shows only in the couple window (and the ring's tooltip, on main).
- **Messages** come from the server as DEFINEDTEXT (TID_GAME_COUPLE_E00..E11, S01, M00), plus Neuz's own S02 "You and %s
  are now a couple!", S03 "Your couple has broken up." and COUPLE_LEVELUP "Your couple has reached level %d!".

## 3. Follow
- **Start:** the player menu's **Follow** (MMI_TRACE 12, `WndWorld.cpp:5673-5679`) or hold **Z** and click a player
  (`OnLButtonDown`, :7055-7066), both only when not flying: `m_objidTracking = id; SetDestObj( id )` (PLAYERSETDESTOBJ
  0xffffff07, range 0, sent only when the dest changes).
- **Moving:** `ControlGround` (`_Interface/WndWorldControlPlayer.cpp:406-417`): each step, more than 4 m away (3-D, d² > 16)
  `SetDestObj` again; the walk stops on arrival (~2 m, by the radii). No message.
- **Stops:** a move or turn key, a press on the world (any left button, :6723), a double click, the target gone from view,
  the own or the target's death (`DPClient.cpp:2069-2074`), a vendor window. Not Escape, not a fight. Paused while flying.
- No party or GM follow.

## 4. Duel (1:1 and party)
- **Menu** (`WndWorld.cpp:6589-6608`): "Duel - 1 vs 1" (MMI_DUEL 10) and, for a party leader, "Duel - Party vs Party"
  (MMI_DUEL_PARTY 11), only when EVE_18 is on (`Program/WorldServer.ini:12`), the target alive, and **both players in an
  RA_FIGHT region**. No world (`pkmode` 0, 16, 0x400000) and no `.rgn` region has RA_FIGHT (0x40) in our data: only a GM's
  `/ctd` makes one, the "Duel Zone" over the QUEST_WARMON_LV1 rect in Madrigal, sent as SNAPSHOTTYPE_ADDREGION 0x00f9 to the
  players standing in it (`_Interface/FuncTextCmd.cpp:3075-3116`, `WORLDSERVER/User.cpp:7472-7505`,
  `DPClient.cpp:16149-16180`). **So in V15 on this server the duel is offered only inside a /ctd Duel Zone.**
- **Packets** (`MsgHdr.h:300-306`): DUELREQUEST 0xffffff23 / PARTY 0xffffff26 (u32 own idPlayer, u32 target idPlayer),
  DUELYES 0xffffff24 / 27 (u32 asker, u32 self), DUELNO 0xffffff25 / 28 (u32 asker).
- **Server checks** (`WORLDSERVER/DPSrvr.cpp:11084-11131`, `_Common/Mover.cpp:6782-6987`): no party for 1:1, not trading,
  level gap < 30 (TID_PK_LEVEL_GAP), past the 1st job (TID_PK_CHANGEJOB_NO), same world, not flying, not refusing PvP.
  Yes within 10 s.
- **Dialog** `CWndDuelConfirm` APP_DUEL_CONFIRM 201 (`resdata.inc:21330`, 288 x 128, "Duel Request"): "%s challenges you
  (your party) to a duel. Do you accept?" Yes / No. Refused: the asker reads TID_GAME_DUELNO "%s refused to duel."
- **Countdown:** SETDUEL / DUELSTART flag 0, then DUELCOUNT 3, 2, 1, 0 a second apart; `Client/SFX/CountFight.dds`
  frames (0-9 digits, 10 "Fight") drawn 1.5 s, growing, above the centre (`_Common/MoverRender.cpp:2180-2225`); DUELSTART
  flag 1 "Duel with %s started!".
- **Fight:** only the opponent (or the enemy party) can be hit (`IsPVPTarget`, `MoverAttack.cpp:1940-1953`; own state 1, not
  flying). The opponent wears the PvP flag effect XI 1700 over the head. HP never reaches 0: the loser keeps its HP.
- **End:** DUELSTART 3 (won) / 4 (lost) opens `CWndDuelResult` APP_DUEL_RESULT 608 ("%s loses the Duel!" / "%s wins the
  Duel!"; OK plays a motion), fame +/-; 3 min without a hit, leaving the zone, the opponent gone or killed by another:
  SETDUEL / DUELCANCEL "The duel has been cancelled."
- **Party duel** is in V15 from the same menu: DUELPARTYSTART 0x0035, DUELPARTYCANCEL 0x0037, DUELPARTYRESULT 0x0038,
  members can die, the party loses with its leader. **Built too.**
- **Decision:** copied as V15 has it, menu condition included. The answer dialogs, countdown, fight and results work
  whenever the server starts a duel; the menu entries show only in a /ctd Duel Zone, as in Neuz. Making duels available
  everywhere would change V15, so it is the owner's call.

## Server changes
None needed for any of the four.
