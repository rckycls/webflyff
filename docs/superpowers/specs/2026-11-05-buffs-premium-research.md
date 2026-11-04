# Buff Pang, the buff display, and premium items: V15 research (2026-11-05)

What Neuz (V15, `__VER` 15) does for the owner's four requests, and what the web client does with it. Paths are under
`Source/` unless they say `Resource/`. Only code active at V15 counts; the flags used (`__NPC_BUFF`, `__BUFF_1107`,
`__S_ADD_EXP`, `__PETVIS`, `__AZRIA_1023`, `__FUNNY_COIN`, `__ADD_RESTATE_LOW`, `__PROTECT_AWAKE`, `__HACK_1023`) are
defined in `Neuz/VersionCommon.h` and `WORLDSERVER/VersionCommon.h`. `__SM_ITEM_2ND_EX` is not.

## 1. Buff Pang

- **The NPC.** `Resource/character.inc` (UTF-16): `MaFl_Helper` and `MaFl_Helper_ver12`, both "Buff Pang", have
  `AddMenu( MMI_DIALOG )` and `AddMenu( MMI_NPC_BUFF )` (74, `Resource/defineNeuz.h:173`), plus `SetBuffSkill( skill,
  level, min level, max level, ms )` lines: the Event Quick Step, Haste, Heap Up and Accuracy (317-320) for levels 1-30
  on the first; nine Assist buffs at level 7 for levels 1-60 on the second; an hour each.
- **The menu.** `CWndWorld::ShowMoverMenu` lists it like any entry; its text is `TID_MMI_NPC_BUFF` (7074, "Get
  Buffed!"). `CWndWorld::OnCommand` MMI_NPC_BUFF (`_Interface/WndWorld.cpp:5131-5136`) only calls
  `g_DPlay.SendNPCBuff( pFocusMover->m_szCharacterKey )`.
- **The packet.** `CDPClient::SendNPCBuff` (`Neuz/DPClient.cpp:17387-17394`): `PACKETTYPE_NPC_BUFF` 0xf000f813
  (`_Network/MsgHdr.h:666`), then `ar.WriteString( szKey )`: an i32 length and the bytes. Nothing else.
- **The answer** (`CDPSrvr::OnNPCBuff`, `WORLDSERVER/DPSrvr.cpp:9076-9140`): the NPC must be near (`IsCloseNpc`). For
  each `SetBuffSkill` line: out of the level range, DEFINEDTEXT `TID_GAME_NPCBUFF_LEVELLIMIT "%d %d %s"`; an Event buff
  the player already has as the Assist one, `TID_GAME_NPCBUFF_FAILED`; else `DoApplySkill` on the player with the line's
  time, which sends SETSKILLSTATE (the buff, `_Common/buff.cpp:720-737`), SETDESTPARAM (its stats), CREATESFXOBJ
  (`dwSfxObj2`, `_Common/Ctrl.cpp:1115-1126`), and then `AddDoApplySkill`: **DOAPPLYUSESKILL** 0x00d7 `u32 target,
  u32 skill, u32 level` (`WORLDSERVER/UserLux.cpp:270-280`). Neuz's `OnDoApplySkill` (`DPClient.cpp:15219-15243`) runs the
  client `DoApplySkill`, which for a buff does nothing visible.
- **Web:** the entry is enabled and sends the key; DOAPPLYUSESKILL gets a reader (it did not have one). The skills
  317-320 and the Assist buffs are in `data/skills.json` already, so their icons show.

## 2. Moving the buff display

- `CWndBuffStatus` (APP_BUFF_STATUS, `_Interface/WndField.cpp:18467-19106`) is a `CWndNeuz` with no caption and no
  title bar, first put at a third of the screen (`OnInitialUpdate`). A press on an icon (`GetHitTestResult`) gives the
  window the focus, and `CWndBase`'s `WBS_MOVE` pickup (`WndBase.cpp:1362-1370`, `IsPickupSpace` is the whole window
  without a caption) drags it; a press beside the icons goes to the world (`OnLButtonDown`, :18512-18527). The drag keeps
  the window on the screen and snaps it to an edge within 10 px (`m_bCling`, `WndBase.cpp:1251-1276`).
- Neuz saves window rects in `regInfo.dat`; the web's windows keep their place only while the page lives (`WindowFrame`'s
  `placed`). So the buff display keeps its place across world changes, not across a reload.

## 3. Phone size

Not Neuz's (a PC client). The owner asked for half size on phones (coarse pointer, landscape): icons 19.2 px on a 17 px
pitch.

## 4. Premium items and scrolls

**Neuz has no list of usable items.** The bag's double-click (`CWndInventory::OnChildNotify` WIN_DBLCLK,
`WndField.cpp:2102-2620`) and the task bar (`CWndMgr::ObjectExecutor` SHORTCUT_ITEM, `WndManager.cpp:2724-2778`) send
`SendDoUseItem` for any item, and `SendDoUseItem` (`DPClient.cpp:10254-10866`) sends DOUSEITEM unless a branch opens a
window first. The server (`CUser::OnDoUseItem`, `WORLDSERVER/User.cpp:2961-3052`; `CMover::DoUseItem`,
`_Common/MoverSkill.cpp:1275-1729`) acts by `dwItemKind2`:

| Kind | What the server does | What the client gets |
|---|---|---|
| IK2_BUFF 29, IK2_BUFF_TOGIFT 37, any kind with `dwSkillTime` | a `BUFF_ITEM` for `dwSkillTime` ms (`TID_GAME_LIMITED_USE` if already on) | SETSKILLSTATE, SETDESTPARAM |
| IK2_BUFF2 33 | a `BUFF_ITEM2`, its level the end time; on the wire the seconds left | SETSKILLSTATE |
| IK2_FOOD 14, IK2_REFRESHER 11, IK2_POTION 12 | points back; with `dwCircleTime` an SM mode (`SM_MAX_HP`, `SM_MAINTAIN_MP` ...) | SETPOINTPARAM, SM_MODE |
| IK2_SYSTEM 19 | `DoUseItemSystem` by item id: the ES scrolls (BUFF_ITEM, up to 3 stacked by level), the SM scrolls (Full Shout, Party Skill Full, Common Bank, Activition, Upcut Stone, Blessing, Velocity), Re-Stat, Re-Skill, protection scrolls; gift boxes and pack items open after it | SETSKILLSTATE, SM_MODE, SETSTATE, INITSKILLPOINT, CREATEITEM + `TID_GAME_REAPITEM` |
| IK2_GMTEXT 27, IK2_SKILL 31, IK2_BLINKWING 22, IK2_WARP 30, IK2_AIRFUEL 23 | a disguise, a skill, a teleport, fuel | as before |

The use always ends with UPDATE_ITEM (`UI_NUM`, or `UI_COOLTIME` 8 when the item has a cool-down group).

- **SM modes** (premium timers): `SNAPSHOTTYPE_SM_MODE` 0x003f `i32 type, u32 seconds left` and, at join,
  `SM_MODE_ALL` 0x003e `i16 n, (i32 type, u32 seconds) * n` (`WORLDSERVER/User.cpp:2090-2165`). 26 types
  (`_Network/CmnHdr.h:495-560`), each shown with a fixed item's icon (`_ADDSMMODE::dwSMItemID`). Neuz counts them down once
  a second and stops at 1 (`WndWorld.cpp:8865-8876`); `RenderSMBuff` (:10519-10624) shows one only in its last 30
  minutes (the four stat penalties always), blinking under 60 s (not Blessing's), tooltip the name and `hh:mm:ss`, or
  `TID_GAME_COND_USE` for `dwCircleTime` 1 (Blessing).
- **Item buffs** are drawn by `CWndWorld::RenderBuff` (:10626-10760) in a row of their own, each with its time under it
  in `RenderOptBuffTime`'s units (`TID_PK_LIMIT_DAY/HOUR/MINUTE/SECOND`, "%dmin", yellow); the ES scrolls of a kind
  (A, A1, A2 ...) share one icon, the second and third drawn at half size under it, the tooltip the EXP bonus and each
  one's time (`RenderExpBuffIcon`, :10236-10517). A `dwSkillTime` of 999999999 shows no time.
- **Client refusals and boxes, in `SendDoUseItem`'s order:** a cool-down group still running,
  `TID_GAME_ATTENTIONCOOLTIME` (`CCooltimeMgr`, `_Common/CooltimeMgr.cpp`: `dwSkillReady` > 0 and IK2_FOOD → 1, IK3_PILL
  → 2, IK2_SKILL → 3; started by UPDATE_ITEM `UI_COOLTIME`, `DPClient.cpp:3226-3245`); the item's cast (M3); the wings
  and the disguise (`TID_GAME_DISQUISE_DNT_WING`, `TID_GAME_NOTUSESKILL_ITEMUSE`); the Scroll of Return (M3); a box
  `TID_GAME_REGARDLESS_USE` for the protection scrolls, `TID_GAME_LV7OVER_NOTUSE` / `LV10OVER` for the smelting
  scrolls; `TID_GAME_ONLYPIER_USE` for the piercing protection. From the bag only: Blessing (`TID_GAME_LIMITED_USE` while
  `SM_REVIVAL` is on, else the box `TID_GAME_DEPEN_USE`), Re-Skill (`TID_GAME_SKILLINIT` box, or
  `TID_GAME_ERROR_SKILLRECCURENCE` with no point spent), the Re-Stat scrolls (`CWndRestateConfirm`,
  `TID_TOOLTIP_RESTATE_*_CONFIRM`). A box's OK sends DOUSEITEM with part -1 (`CWndCommItemDlg::OnChildNotify`,
  `WndField.cpp:12934-12990`).
- DOUSEITEM's second field is the focused mover's id, `NULL_ID` with none (`WndField.cpp:2131-2134`,
  `WndManager.cpp:2732-2735`); the web sent `NULL_ID` always.

## Left out (needs a window, a pet, or data the web client lacks)

- Items that need a target item (`dwExeTarget` EXT_ITEM 21, and the upgrade cards: IK3_ELECARD, ENCHANT, SOCKETCARD(2),
  RANDOM_SCROLL, PIERDICE): Neuz's upgrade cursor and its windows.
- Items whose use opens a window the browser lacks: name change, guild name change, Custody bank, hair and face
  coupons, sex change, item transmute, character seal, party summon, class change, pet naming and pet tamer scrolls,
  pet food, attribute change, the Flaris and Saint Morning maps, monster summon (IK3_CREATE_MONSTER), tickets
  (IK3_TICKET: a layer list and `PACKETTYPE_DO_USE_ITEM_INPUT`), Funny Coin (IK2_TOCASH), collecting batteries, housing.
- The Vis pets' confirm (`CheckConfirm`): the browser has no pets.
- The elemental resist SM modes (16-18): they need the worn weapon's and armour's elements.
- The cool-down's sweep over the task bar's icon: only the refusal is made.
