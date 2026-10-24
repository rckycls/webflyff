# Piece 4 research: the character's numbers (bars, stats window, stat points, level up)

Scope: a Vagrant, levels 1-15. Read-only research of the FlyFF v15 C++ source.

Paths: `Source/...` is `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source`; `Resource/...` is the sibling `Resource` folder; `web:` is
`C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece3-world`. Line numbers are of the CP949 files as they sit on disk (iconv keeps lines).
`file:line` below is relative to `Source/` unless it starts with `Resource/` or `web:`.

All wire types are little-endian, as `CAr` writes them on x86: `BYTE/u_char` 1, `WORD/u_short/short` 2, `LONG/long/int/DWORD/OBJID` 4, `EXPINTEGER` = `__int64` 8 (`_Common/data.h:366`).

Things I computed myself (not observed in a running Neuz) are marked **[derived]**.

---

## 0. Which code branches are live

- `__VER` is 15 in both `Neuz/VersionCommon.h:4` and `WORLDSERVER/VersionCommon.h:4`, so every `#if __VER >= N` (N <= 15) is live and every `#if __VER < N` is dead. Dead and relevant here: the "berserk" critical bonus and exp bonus below 30% HP (`__VER < 9`, `__S_9_ADD`), the PXP exp gauge (`__VER < 8`), `m_nDeathExp = 0` on level up (`__VER < 8`).
- `__MAINSERVER` adds nothing that touches these numbers (`Neuz/VersionCommon.h:471-478`: `__Y_BEAUTY_SHOP_CHARGE`, `__TRAFIC_1215`, `__JEFF_11_1`; `WORLDSERVER/VersionCommon.h:401-422`: `__ON_ERROR`, `__IDC`, `__JEFF_11_3`, `__EVENT_0117`, ...). The `__INTERNALSERVER` block (Neuz :261-470, World :238-338) is not compiled (e.g. `__SKILL0517` at Neuz :274 is inside it).
- Defined in the top section and used by these numbers: `__JEFF_11` (Neuz :96, World :99: Str/Dex/Int/Sta and max HP/MP/FP are floored at 1, ATK/DEF/crit at 0), `__S1108_BACK_END_SYSTEM` (Neuz :19, World :18: per-monster HP rate), `__S_ADD_RESTATE` (Neuz :51, World :59: 1 stat point = +1 stat), `__BUFF_1107`.
- **The character window that is live is the "renewed" one** (`CWndCharacter` holding `CWndCharInfo`, id `APP_CHARACTER3`), although `__RENEW_CHARINFO` itself is commented out (`Neuz/VersionCommon.h:141`). Every use is written `#if __VER >= 13 // __RENEW_CHARINFO` (the name is only a comment), so the `__VER >= 13` branch wins: `_Interface/FuncApplet.cpp:203-209` (key `H`), `_Interface/WndField.h:455-537`, `_Interface/WndField.cpp:2984-4240`, `Neuz/DPClient.cpp:3580-3590`. The older `CWndCharacterBase/Detail/Detail2` classes (`WndField.cpp:4562-6050`) are dead code.
- `__GUILD_HOUSE` is commented out in WORLDSERVER/VersionCommon.h:206 but all code uses `#if __VER >= 15 // __GUILD_HOUSE`, so it is live (matters for the second thin "rest" bar in the status window, section 5).

---

## 1. What the server sends and what Neuz computes

### 1.1 Sent by the server (never computed by Neuz)

| Value | Where it lives | Arrives in |
|---|---|---|
| current HP | `CMover::m_nHitPoint` (LONG), `_Common/Mover.h:550` | ADD_OBJ (every mover, i32), SETPOINTPARAM, DAMAGE (client subtracts), MOVERDEATH |
| current MP, FP | `m_nManaPoint`, `m_nFatiguePoint`, `Mover.h:551-552` | ADD_OBJ **own character only** (u16 each, `_Common/ObjSerializeOpt.cpp:518-519`), SETPOINTPARAM |
| STR/STA/DEX/INT (base, before items and buffs) | `m_nStr,m_nSta,m_nDex,m_nInt`, `Mover.h:527` | ADD_OBJ (every player, u16 each, `ObjSerializeOpt.cpp:436-439`), SETSTATE |
| level | `m_nLevel` (LONG), `Mover.h:528` | ADD_OBJ (u16, :440), SETEXPERIENCE, SETLEVEL |
| job | `m_nJob`, `Mover.h:559` | ADD_OBJ (u8, :435) |
| EXP | `m_nExp1` (EXPINTEGER), `Mover.h:530` | ADD_OBJ own (i64, :533), SETEXPERIENCE |
| remaining stat points | `m_nRemainGP` (LONG), `Mover.h:553` | ADD_OBJ own (short, :554), SETSTATE, SET_GROWTH_LEARNING_POINT |
| skill level total / skill points | `m_nSkillLevel`, `m_nSkillPoint` (int), `Mover.h:858-859` | ADD_OBJ own, SETEXPERIENCE |
| death exp / death level | `m_nDeathExp`, `m_nDeathLevel`, `Mover.h:529-530` | ADD_OBJ own, SETEXPERIENCE (only when the server passes them) |

### 1.2 Computed by Neuz (and the world server, identically) - with no items and no buffs

`GetParam(dst, base)` = `chgParam[dst]` if one is set (sentinel `0x7FFFFFFF` = none), else `base + adjParam[dst]` (`_Common/MoverParam.cpp:2731-2761`). With no items/buffs every `adjParam` is 0, so `GetParam(dst, x) == x`. `adjParam` is filled by equipment (`SetEquipDstParam`, `MoverParam.cpp:1903`), buffs and `SM_*` items (`OnApplySM`, `ObjSerializeOpt.cpp:56-86`): all later pieces. ADD_OBJ does not carry `adjParam`.

Effective stats: `GetStr() = max(1, m_nStr + GetParam(DST_STR,0))`, same for Sta/Dex/Int (`MoverParam.cpp:3163-3246`; `DST_STR` 1, `DST_DEX` 2, `DST_INT` 3, `DST_STA` 4, `Resource/defineAttribute.h:249-252`).

Job table row (`Resource/propJob.inc:3`, loader `_Common/Project.cpp:4808-4838`, struct `_Common/ProjectCmn.h:405-423`, hard-coded file name in `Project.cpp:497`). Column order after the job name: `fAttackSpeed, fFactorMaxHP, fFactorMaxMP, fFactorMaxFP, fFactorDef, fFactorHPRecovery, fFactorMPRecovery, fFactorFPRecovery, fMeleeSWD, fMeleeAXE, fMeleeSTAFF, fMeleeSTICK, fMeleeKNUCKLE, fMagicWAND, fBlocking, fMeleeYOYO, fCritical` (17 floats, read with `GetFloat`, so stored as C `float`). **Vagrant** (`JOB_VAGRANT` = 0):

```
fAttackSpeed 75.0  fFactorMaxHP 0.9  fFactorMaxMP 0.3  fFactorMaxFP 0.3  fFactorDef 1.0
fFactorHPRecovery 1.2  fFactorMPRecovery 0.5  fFactorFPRecovery 0.5
fMeleeSWD 4.5  fMeleeAXE 5.5  fMeleeSTAFF 0.8  fMeleeSTICK 3.0  fMeleeKNUCKLE 5.0  fMagicWAND 6.0
fBlocking 0.2  fMeleeYOYO 4.2  fCritical 1.0
```

The formulas (C `float` arithmetic throughout; `int` operands convert to float; every `(int)` cast truncates toward zero; a port must `Math.fround` after every operation to hit the same integer at the cutoffs):

**Max HP** - `GetMaxHitPoint` (`MoverParam.cpp:2788`) and `GetMaxOriginHitPoint` (:2856, player branch :2871-2873):
```
nSta   = GetSta()                                   // effective
a      = (fFactorMaxHP * m_nLevel) / 2.0f
b      = a * ((m_nLevel + 1.0f) / 4.0f) * (1.0f + nSta / 50.0f) + (nSta * 10.0f)
origin = (int)(b + 80.f)
result = (int)( GetParam(DST_HP_MAX, origin) * (1.0f + (float)GetParam(DST_HP_MAX_RATE, 0) / 100.0f) )
result = max(result, 1)                              // __JEFF_11
```
(`DST_HP_MAX` 35, `DST_HP_MAX_RATE` 52.) For a **monster** (`MoverParam.cpp:2878-2881`): `origin = int( dwAddHp * prj.m_fMonsterHitpointRate * pMoverProp->m_fHitPoint_Rate )`, then the same `DST_HP_MAX` wrapper. `dwAddHp` is a `propMover.txt` column (the converter reads and drops it, `web:packages/formats/src/inc/propMover.ts`); both rates default to 1.0 (`Project.cpp:255`, `ProjectCmn.cpp:274`), the first is only overwritten for GMs (`User.cpp:6508-6519`, `Neuz/DPClient.cpp:6508-6560`), the second by the MONSTERPROP snapshot (section 2.3).

**Max MP** - `GetMaxManaPoint` (:2808) / `GetMaxOriginManaPoint` (:2889, :2904):
```
nInt   = GetInt()
origin = (int)( (((m_nLevel*2.0f) + (nInt*8.0f)) * fFactorMaxMP + 22.0f) + (nInt * fFactorMaxMP) )
result = (int)( GetParam(DST_MP_MAX, origin) * (1.0f + (float)GetParam(DST_MP_MAX_RATE,0)/100.0f) ); result = max(result,1)
```
**Max FP** - `GetMaxFatiguePoint` (:2825) / `GetMaxOriginFatiguePoint` (:2910, :2932):
```
nSta   = GetSta()
origin = (int)( (((m_nLevel*2.0f) + (nSta*6.0f)) * fFactorMaxFP) + (nSta * fFactorMaxFP) )
result = (int)( GetParam(DST_FP_MAX, origin) * (1.0f + (float)GetParam(DST_FP_MAX_RATE,0)/100.0f) ); result = max(result,1)
```
Current HP/MP/FP shown = `GetParam(DST_HP/MP/FP, m_nHitPoint/m_nManaPoint/m_nFatiguePoint)` (:2764-2783).

**EXP and EXP needed** - table `expCharacter` in `Resource/ExpTable.inc:1-204` (`Masquerade.prj:127` names it `ExpTable.inc`; loader `Project.cpp:3262-3290`). Row *i* (0-based, `m_aExpCharacter[i]`) is `nExp1 nExp2 dwLPPoint nLimitExp`:
- `GetMaxExp1()` = `m_aExpCharacter[m_nLevel + 1].nExp1` (`Mover.h:1108`): the EXP needed at your level to reach the next. So row *L+1* holds the cost of leaving level *L*, and its `dwLPPoint` is the stat points granted for reaching level *L+1*. `nExp2` is the dead PXP column; it is not used by the v15 gauge.
- `nLimitExp` of row *L* (your level) caps the EXP one kill can give (`Mover.cpp:6221-6222`).

| idx | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nExp1 | 0 | 14 | 20 | 36 | 90 | 152 | 250 | 352 | 480 | 591 | 743 | 973 | 1290 | 1632 | 1928 | 2340 |
| dwLPPoint | 0 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| nLimitExp | 16 | 18 | 21 | 25 | 30 | 35 | 42 | 49 | 58 | 69 | 84 | 102 | 123 | 145 | 170 | 195 |

So the level-1 bar is 14 EXP long, level 14 is 1928 (idx 15). Index 0 is `0 0 0 0`.

**EXP percent**: `GetExpPercent() = (int)( GetExp1() * 10000 / GetMaxExp1() )` (int64 division, units of 0.01%; `MoverParam.cpp:484-491`). The window does its own copy, section 5.

**Derived stats shown in the stats window** (section 3): ATK, DEF, critical, attack speed.

**Natural recovery per tick** (server only, section 6): `GetHPRecovery/GetMPRecovery/GetFPRecovery` (`MoverParam.cpp:2972-3020`).

### 1.3 Data files these need
`Resource/propJob.inc` (17 floats per job), `Resource/ExpTable.inc` (`expCharacter` block), `Resource/propItem.txt` row `II_WEA_HAN_HAND` (:382; the fists, section 3.2), `Resource/propMover.txt` (`dwLevel`, `dwAddHp`, `nExpValue`, `dwHideLevel`, `eElementType` for the target bar), `Resource/etc.inc` + `etc.txt.txt` (job name, "Vagrant"; `Project.cpp:906-925`), `Resource/textClient.inc` + `textClient.txt.txt` + `defineText.h` (the `TID_*` texts and their colours, section 8).

---

## 2. Where the values arrive

### 2.1 ADD_OBJ of the player's own character (METHOD_NONE)

`CDPClient::OnAddObj` (`Neuz/DPClient.cpp:1053`) sets `METHOD_NONE` for the own object (:1058), then `CMover::Serialize` (loading side `_Common/ObjSerializeOpt.cpp:359-767`). Order of what Piece 4 needs (the whole layout is already walked in `web:packages/protocol/src/world/addObj.ts`):

| # | Field | Type | C++ | `addObj.ts` today |
|---|---|---|---|---|
| common | `m_nHitPoint` | i32 | ObjSerializeOpt.cpp:394 | **kept** (`AddedMover.hitPoint`, addObj.ts:66) |
| player | `m_nJob` | u8 | :435 | **kept** (`job`) |
| player | `m_nStr`, `m_nSta`, `m_nDex`, `m_nInt` | u16 x4 | :436-439 | **skipped** (addObj.ts:98-101) |
| player | `m_nLevel` | u16 | :440 | **kept** (`level`) |
| player | `m_nFame` | i32 | :482 | skipped (:123) |
| METHOD_NONE | `m_nManaPoint` | u16 | :518 | **skipped** (:156) |
| METHOD_NONE | `m_nFatiguePoint` | u16 | :519 | **skipped** (:157) |
| METHOD_NONE | `m_nTutorialState` (`__VER >= 12`), `m_nFxp` | i32, i32 | :521, :528 | skipped |
| METHOD_NONE | gold | u32 | :530 | skipped |
| METHOD_NONE | `m_nExp1` | **i64** | :533 | **skipped** (:161) |
| METHOD_NONE | `m_nSkillLevel`, `m_nSkillPoint` | i32, i32 | :534-535 | skipped (:162-163) |
| METHOD_NONE | `m_nDeathExp` | i64 | :536 | skipped (:164) |
| METHOD_NONE | `m_nDeathLevel` | i32 | :537 | skipped (:165) |
| METHOD_NONE | `m_nRemainGP` (then an unused short) | i16 (+ i16) | :554 | **skipped** (:173) |

For every other player (METHOD_EXCLUDE_ITEM) the common and player parts above (HP, job, stats, level) are present; MP, FP, EXP, GP are not. For a monster/NPC only the common `m_nHitPoint` (i32) is present.

### 2.2 Update messages (all inside SNAPSHOT bundles: `[objectId u32][type u16][fields]`)

Every `m_Snapshot` and `AddBlock` write goes into the same per-user bundle in call order (`WORLDSERVER/User.cpp:597-604, 647-653`). "In view" = every user in the mover's `m_2pc`, which **includes the mover itself** when it is a player (`User.cpp:314`, `WORLDSERVER/UserMacro.h:13-23`).

| Type | Value | Server writer | Fields after the type | Sent to | Client handler |
|---|---|---|---|---|---|
| SETPOINTPARAM | 0x001e | `CUserMng::AddSetPointParam` `User.cpp:4663` | `i32 nDstParameter` (HP 38, MP 39, FP 40, GOLD 10000; `defineAttribute.h:286-288,349`), `i32 nValue` (already clamped by the server) | everyone in view, on every change | `OnSetPointParam` DPClient.cpp:3303 -> `CMover::SetPointParam` |
| SETEXPERIENCE | 0x0012 | `CUser::AddSetExperience` `User.cpp:1139` | `i64 nExp1`, `u16 wLevel`, `i32 nSkillLevel`, `i32 nSkillPoint`, `i64 nDeathExp`, `u16 wDeathLevel` (28 bytes; defaults `-1` / `0xffff` mean "do not change", `User.h:494`). Note the wire order is skillLevel THEN skillPoint though the C++ parameters are (point, level) | the player itself only | `OnSetExperience` :3376 -> `CMover::SetExperience` |
| SETLEVEL | 0x0011 | `CUserMng::AddSetLevel` `User.cpp:4694` | `u16 wLevel` | everyone in view **except the player** (`if( USERPTR != pMover )`) | `OnSetLevel` :3339 |
| SET_GROWTH_LEARNING_POINT | 0x00a6 | `CUser::AddSetGrowthLearningPoint` `User.cpp:1161` | `i32 nRemainGP`, `i32 0` (unused LP) | the player only | `OnSetGrowthLearningPoint` :3531 sets `m_nRemainGP` |
| SETSTATE | 0x006a | `CUser::AddSetState` `User.cpp:2429` | `i32 str, i32 sta, i32 dex, i32 int, i32 0 (unused), i32 remainGP` | the player only | `OnSetState` :13514 |
| SET_STAT_LEVEL (legacy +1 button) | 0x00a4 | `CUserMng::AddSetStateLevel` `User.cpp:4516`; `CUser::AddSetStatLevel` :1171 | `i8 chID` (100 str, 101 sta, 102 dex, 103 int), `i32 value`, `i32 remainGP` | everyone in view | `OnSetStatLevel` :3544 - **unreachable from the live UI** (only `CWndStateConfirm::SendYes`, the dead branch) |
| DAMAGE | 0x0013 | `CUserMng::AddDamage` `User.cpp:4474` | `u32 objidAttacker`, `u32 dwHit`, `u32 dwAtkFlags` (+ `vec3 pos`, `f32 angle` when `AF_FLYING` 0x10000000, `ActionMover.h:44`) | everyone in view | `OnDamage` :1758: **the client itself does `IncHitPoint(-dwHit)`** (:1785) and bumps HP 0 to 1 (:1787-1788); the server's SETPOINTPARAM then overwrites |
| MOVERDEATH | 0x00c7 | `CUserMng::AddMoverDeath` `User.cpp:4527` | `u32 objidAttacker`, `u32 dwMsg` | in view | `OnMoverDeath` :1936: `IncHitPoint(-hp)`, so HP 0 |
| MONSTERPROP | 0x004e | `CUser::AddMonsterProp` `User.cpp:6524` | `i32 n`, n x (`string name` (<=32), 6 x `i32`: hp, attackPower, defence, exp, itemDrop, penya, **percent**), `i32 m`, m x `string name` | each player once at join (`DPDatabaseClient.cpp:1094-1096`) and to all on a change | `OnMonsterProp` :6630: `m_fHitPoint_Rate = hp / 100.0f` for that monster name |
| GAMERATE | 0x002e | `CUser::AddGameRate` | `f32 rate`, `u8 flag` | **GMs only** for monster rates (`User.cpp:6506-6519`) | `OnGameRate` :6467 |

Ordering of a kill that levels the player up on the server (`AddExperienceSolo`, `_Common/Mover.cpp:6170-6256`): `LevelUpSetting` -> SETLEVEL (others), SET_GROWTH_LEARNING_POINT (self); then SETEXPERIENCE (self). A kill that does not level up sends only SETEXPERIENCE.

When SETPOINTPARAM is sent: `CMover::SetPointParam` (`MoverParam.cpp:889-955`) clamps the value to `[0, GetMaxXxx()]` (server: or to max when the request is `999999999`), and sends **only if the value changed** or `bTrans` is TRUE (`:895-935,951-953`). Callers: `IncHitPoint/IncManaPoint/IncFatiguePoint` (:555-585: regeneration, potions, skills), `EndPVP(nHP)` after a hit (`Mover.cpp:5428-5433`, called from `WORLDSERVER/AttackArbiter.cpp:259`), `SetDestParam` for HP/MP/FP (`MoverParam.cpp:2279`), revival, kill recovery (`Mover.cpp:5942-5990`). Order inside one hit: DAMAGE first (`AttackArbiter.cpp:215-259` `OnDamaged`), then the SETPOINTPARAM from `EndPVP`.

Level-up refills HP/MP/FP **without any message**: the server assigns `m_nHitPoint = GetMaxHitPoint()` etc. directly (`MoverParam.cpp:1416-1418`) and the client reproduces it in `SetExperience` (`MoverParam.cpp:1768-1772`) and `OnSetLevel` (`DPClient.cpp:3356-3357`, HP and MP only). The client therefore depends on its own max-value formula matching the server's.

### 2.3 Server join-time facts
- JOIN bundle: environment, world-read-info, then `AddAddObj(this)` (the own ADD_OBJ with HP, MP, FP, EXP, GP) at `User.cpp:326`; no separate stat message follows. `SetPointParam` is not sent at join.
- At join the world server sets HP to max if it is 0 and clamps HP/MP/FP to the max (`DPDatabaseClient.cpp:857-862`).
- New characters: `CMover` constructor sets stats 15/15/15/15, level 1, exp 0, `m_nRemainGP` 0 (`_Network/Objects/Obj.cpp:165,176`); `InitProp` under `__DBSERVER` sets HP/MP/FP to 77 (`Obj.cpp:325-327`). The actual row is made by the SQL stored procedure `CHARACTER_STR 'I1'` (`_Database/DbManager.cpp:133-150`), which is not in the source: starting HP/GP are **not found**.

---

## 3. The stats window (`CWndCharacter` / `CWndCharInfo`, `APP_CHARACTER3`)

### 3.1 Frame and layout
- Window resource: `Resource/resdata.inc:22746`: `APP_CHARACTER3 "Wndtile00.tga" ... 208 x 512`, one tab control `WIDC_TABCTRL1` at (8,12)-(204,466). Title "Character". Opened with `H` (`FuncApplet.cpp:203-204`).
- `CWndCharacter::OnInitialUpdate` (`WndField.cpp:4269-4310`) puts two tabs in it: `m_wndCharInfo` ("Character", `TID_GAME_TITLE_CHAR_INFO`) and `m_wndHonor` ("Fame/Master", `TID_GAME_TITLE_HONOR`). Only the first matters here. Background of `CWndCharInfo`: `WndNewCharacter01.tga` (:3501).
- All coordinates below are in the `CWndCharInfo` child; text is drawn with `TextOut(x, y, ...)`. Label colour `D3DCOLOR_ARGB(255,0,0,180)` (dark blue), value colour black.

### 3.2 Every value shown (`CWndCharInfo::OnDraw`, `WndField.cpp:3012-3490`)

| Item | Position | Source / formula | With a naked Vagrant |
|---|---|---|---|
| "Base" header | (60,13) | `TID_APP_CHARACTER_BASE` "Base" | |
| Name | value (80,31), label "Name" (7,31) | `GetName()` | |
| Job | (80,46), label "Job" | `GetJobString()` = `prj.m_aJob[m_nJob].szName`, `MoverParam.cpp:354` | "Vagrant" |
| Level | (80,61), label "Level" | `GetLevel()` (the master/hero icon branches do not apply) | |
| Server | (80,76), label "Server" | `g_dpCertified.GetServerName(g_Option.m_nSer)` (lobby data, Piece 2) | |
| Channel | (80,91), label "Channel" | the channel name from the same server list | |
| "Detail" header | (60,113) | `TID_APP_CHARACTER_DETAIL` | |
| ATK | (50,131), label (7,131) "ATK" | `RenderATK`, 3.3 | |
| Critical | (140,131), label (85,131) "Critical" | `"%d%%"` of `GetCriticalProb()`, 3.3 | |
| DEF | (50,146), label (7,146) "DEF" | `GetShowDefense(FALSE)`, 3.3 | |
| A.Speed | (140,146), label (85,146) "A.Speed" | `"%d%%"` of `int(GetAttackSpeed()*100.0f)/2`, 3.3 | |
| STR / STA / DEX / INT | value (50,173), (50,188), (50,203), (50,218); labels at x=7 | `GetStr()` etc. (effective). Colour: black if equal to the base `m_nStr`, blue if effective > base (buff), red if lower (:3246-3286) | |
| Stat Points | value (105,233), label (7,233) "Stat Points" | `m_nGpPoint` = `GetRemainGP() - (strCount+staCount+dexCount+intCount)` (:3784-3849); blinks red while non-zero (`(g_nRenderCnt/8)&1`, :3288-3296) | |
| PVP/PK block | header (60,281), rows from y=299 | `GetFameName()` (`""` for a Vagrant, so "-"), `m_nFame`, `GetPKValue()`, `GetPKPropensity()` (:3449-3489) | out of scope; `m_nFame` is skipped by the browser today |
| "Hit rate" / "Evasion" / "Block" | - | **not shown in any v15 window** (not found); server-only (`MoverAttack.cpp:236-300`, `MoverParam.cpp:500-512`); only mentioned in the DEX tooltip text | |

Tooltips (hover over STR/STA/DEX/INT/GP rows, :3298-3386; English texts in section 8): each has the stat name + current value in bold dark green `(0,93,0)`, then the `TID_TOOLTIP_COMMAND_*` lines.

### 3.3 How each derived value is computed (naked Vagrant: no weapon, no armour, no buffs)

**ATK** (`RenderATK`, `WndField.cpp:4057-4110`, `GetHitMinMax`, `MoverAttack.cpp:415-480`, `GetWeaponATK` :374-413):
1. No weapon: `GetActiveHandItemProp(PARTS_RWEAPON)` returns `II_WEA_HAN_HAND` (`Mover.cpp:2930-2941`, the client branch for the own player). `Resource/propItem.txt:382`: `dwAbilityMin 1, dwAbilityMax 2, dwWeaponType WT_MELEE_STAFF, fAttackSpeed 0.07, dwParts PARTS_RWEAPON` (I decoded the row with the column order of `web:packages/formats/src/inc/propItem.ts`).
2. `min = dwAbilityMin*2 = 2`, `max = dwAbilityMax*2 = 4`; `min = GetParam(DST_ABILITY_MIN, min)`, `max = GetParam(DST_ABILITY_MAX, max)` (`DST_ABILITY_MIN` 12, `_MAX` 13).
3. `nPlus = GetWeaponATK(WT_MELEE_STAFF) + GetParam(DST_CHR_DMG, 0)` (63) with, for staff: `(int)( float((GetStr() - 10) * fMeleeSTAFF) + float(GetLevel() * 1.1f) )` (:374-381 area; other weapon types in the same switch: SWD `(Str-12)*fSWD + lv*1.1`, AXE `(Str-12)*fAXE + lv*1.2`, STICK `(Str-10)*fSTICK + lv*1.3`, KNUCKLE `(Str-10)*fKNUCKLE + lv*1.2`, WAND `(Int-10)*fWAND + lv*1.2`, YOYO `(Str-12)*fYOYO + lv*1.1`, BOW `((Dex-14)*4 + lv*1.3 + Str*0.2)*0.7`) plus `GetPlusWeaponATK` (`DST_*_DMG`, :287-336, all 0). `min += nPlus; max += nPlus`.
4. `pWeapon` is NULL, so no item multiplier and no refine bonus.
5. Shown value: `nATK = (min+max)/2` (int); then `*1.2f` if `SM_ATTACK_UP/SM_ATTACK_UP1`, `+ nATK*DST_ATKPOWER_RATE/100` if > 0, `+ GetWeaponPlusDamage(1,FALSE)` (0 without a weapon), `+ GetParam(DST_ATKPOWER,0)`, floored at 0 (`WndField.cpp:4082-4107`). The window shows **one number** (the mean), not min-max.

**DEF** - `GetShowDefense(FALSE)` (`MoverAttack.cpp:226`) -> `CalcDefense` (:517) -> `CalcDefenseCore` (:576, generic branch :585-600):
```
f   = fFactorDef                                           // Vagrant 1.0
d   = (int)( ((((GetLevel()*2) + (GetSta()/2)) / 2.8f) - 4) + ((GetSta() - 14) * f) )   // GetSta()/2 is integer division
d  += GetDefenseByItem(FALSE) / 4        // m_nDefenseMin + (m_nDefenseMax - m_nDefenseMin)/2 : 0 with no armour (MoverAttack.cpp:217-224; set by UpdateParam, MoverParam.cpp:515-525)
d  += GetParam(DST_ADJDEF, 0)            // 26
d   = max(d, 0)                                            // __JEFF_11
DEF = (int)( d * (1.0f + (float)GetParam(DST_ADJDEF_RATE,0)/100.0f) )                   // GetDEFMultiplier :496-512, 1.0 for a player
```
**Critical** - `GetCriticalProb` (`MoverAttack.cpp:612-650`): `p = GetDex()/10` (int division); `p = (int)(p * fCritical)` (1.0 for Vagrant); `p = GetParam(DST_CHR_CHANCECRITICAL, p)` (9; note a *change* param would replace it); `p = max(p,0)`; party bonus only when `m_idparty && (m_dwFlag & MVRF_CRITICAL)`; the `__VER < 9` berserk bonus is dead.

**Attack speed** - `GetAttackSpeed` (`MoverAttack.cpp:159-200`):
```
fItem = weapon.fAttackSpeed                                  // 0.07 for the fists
A  = int( fAttackSpeed(job) + (fItem * (4.0f*GetDex() + GetLevel()/8.0f)) - 3.0f )     // Vagrant job speed 75.0
if (187.5f <= A) A = 187
fSpeed = ((50.0f / (200.f - A)) / 2.0f) + GetAttackSpeedPlusValue(A)
fSpeed += GetParam(DST_ATTACKSPEED,0)/1000.0f            // 24
if (GetParam(DST_ATTACKSPEED_RATE,0) > 0) fSpeed += fSpeed*rate/100     // 51
clamp fSpeed to [0.1, 2.0]
```
`GetAttackSpeedPlusValue(n)` (`MoverAttack.cpp:72-87`): `table[clamp(n/10, 0, 17)]` of `{0.08,0.16,0.24,0.32,0.40,0.48,0.56,0.64,0.72,0.80,0.88,0.96,1.04,1.12,1.20,1.30,1.38,1.50}`. Displayed: `int(fSpeed*100.0f)/2` followed by `%`.

Reference values for a naked Vagrant with 15/15/15/15, per level: **[derived]**, section 7.

### 3.4 The + buttons, "Apply" and "Reset" (batched in v15)

There is **no immediate +1 packet**. `CWndCharInfo` keeps four local counters `m_nStrCount/m_nStaCount/m_nDexCount/m_nIntCount` (`WndField.cpp:2986-3004`):
- Controls created in `OnInitialUpdate` (:3498-3600), relative to posY=170: per stat an edit box ("0", ids 100/103/106/109) at x=90-124, a `+` button (ids 101/104/107/110) at x=128 (14x16) and a `-` button (ids 102/105/108/111) at x=144, rows 15 px apart; "Apply" (id 112) at (20,251)-(70,273) and "Reset" (id 113) at (98,251)-(148,273). Textures `ButtCharPlus.bmp`, `ButtCharMinus.bmp`, `ButtCharApply.tga`, `ButtCharReset.tga`. (A GM-only `>` change-job button at (130,385), :3597.)
- `+`/`-` clicks change the counter by 1 (`OnChildNotify`, :3623-3715); typing a number in the edit box clamps it to `remainGP - (other three counters)` (:3636-3662). `Process()` (every frame, :3784-3849): `-` enabled while the counter > 0; `+` and the edit boxes enabled only while `m_nGpPoint > 0`; Apply and Reset enabled while any counter > 0. Plus buttons start disabled when `GetRemainGP() <= 0` (:3587-3593).
- While any counter is non-zero the window **previews** the effect: ATK/DEF/Critical/A.Speed are recomputed with the counters added (`GetVirtualATK/DEF/Critical/ATKSpeed`, :3864-4056: the same formulas as 3.3 with `Str+m_nStrCount`, `Sta+m_nStaCount`, `Dex+m_nDexCount`, `Int+m_nIntCount`; the virtual attack speed has the slightly different clamp `fSpeed < 0.0f -> 0.1f`) and drawn blinking red when different from the real value.
- "Apply" with at least one counter non-zero opens the confirm box `CWndStateConfirm` (`APP_STATE_CONFIRM`, :4395-4560) with `TID_GAME_CHARSTATUS_APPLY_Q` and, for a base-job character, the extra line `TID_DIAG_0082` ("Your stat values will reset after your 1st job change."). Yes -> `g_DPlay.SendModifyStatus(str,sta,dex,int)` (:4490-4498), then the counters are zeroed locally at once and the box is destroyed. No / close -> box destroyed, counters kept. "Reset" zeroes the counters.

**Packet** `PACKETTYPE_MODIFY_STATUS` = `0xf000f501` (`_Network/MsgHdr.h:624`), `CDPClient::SendModifyStatus` (`Neuz/DPClient.cpp:16652-16659`), framed as every client packet (`BEFORESENDSOLE(ar, type, DPID_UNKNOWN)`): `u32 DPID_UNKNOWN`, `u32 0xf000f501`, `i32 nStrCount`, `i32 nStaCount`, `i32 nDexCount`, `i32 nIntCount` (24 bytes).

**Server** `CDPSrvr::OnModifyStatus` (`WORLDSERVER/DPSrvr.cpp:8341-8369`, registered :417): ignores the packet if any count is negative or all four sum to <= 0, or if `m_nRemainGP < sum`. Otherwise `m_nStr += strCount` (etc.), `m_nRemainGP -= sum`, then replies **SETSTATE** (2.2) with the new absolute values, and re-checks honor titles. **No per-stat cap** exists and there is no failure reply (an invalid request is silently dropped).
**Client** `OnSetState` (`DPClient.cpp:13514-13524`) overwrites the four stats and `m_nRemainGP`, then **sets HP, MP and FP to their (new) max** - the server did not change its own HP/MP/FP in `OnModifyStatus`, so Neuz shows full bars until the next SETPOINTPARAM. No chat line is printed on this path (the "You can feel yourself getting stronger" texts belong to the dead legacy path).

---

## 4. Level up

### 4.1 Server path (for a Vagrant)
Trigger: a kill. `CMover::SubExperience` (`Mover.cpp:5992`) -> `AddExperienceKillMember` (:6085) -> `AddExperienceSolo` (:6170; party: `AddExperienceParty`). In `AddExperienceSolo`: the monster's `nExpValue * m_fExp_Rate` (:6006), times 0.7 / 0.4 / 0.1 when the player is 1-2 / 3-4 / >= 5 levels above the monster (:6198-6219), capped at `m_aExpCharacter[level].nLimitExp` (:6221-6222); then `CMover::AddExperience(exp, TRUE, TRUE, TRUE)` (`MoverParam.cpp:1054-1496`).
In `AddExperience`:
- returns FALSE at once if `nExp <= 0` or `m_nHitPoint <= 0` (:1075-1078);
- first call multiplies by `GetExpFactor()` (scrolls, events, `prj.m_fMonsterExpRate`; `MoverParam.cpp:4123-4260`, server-side bonus lines under `#ifdef __WORLDSERVER`) plus the guild-house rest bonus (:1094-1102);
- **a Vagrant at level >= `MAX_JOB_LEVEL` (15, `Resource/defineJob.h:19`) gets `m_nExp1 = 0` and the function returns TRUE** (:1173-1177), before any EXP is added. So the bar sits at 0 % at level 15, and every later kill still runs the "level-up" branch of the caller (`LevelUpSetting`, SETLEVEL to others with the unchanged level 15, DB logging);
- `m_nExp1 += nExp` (:1296); `if( m_nExp1 >= m_aExpCharacter[level+1].nExp1 )` (:1326) is the level-up. Then: `m_nRemainGP += m_aExpCharacter[level+1].dwLPPoint` (:1358) = **+2 stat points per level for levels 2-15 (28 in total)**; `m_nExp1 = 0` and `m_nLevel++` (:1362-1370); HP, MP and FP set to max (:1416-1418); on the server, if `m_nDeathLevel < m_nLevel` (true for a character that never lost a level): `AddSkillPoint(((level-1)/20)+2)` = **+2 skill points per level at levels 2-20** (`MoverParam.cpp:1432-1441`, `Mover.cpp:9201-9222`, cap 1280 total), plus event/campus hooks; level 20 makes the flight level 1 (:1476). Leftover EXP is added again recursively (`AddExperience(nExptmp, FALSE, ...)`, :1487-1488), so a big gain can pass several levels.
- Back in `AddExperienceSolo`: returns TRUE -> `CUser::LevelUpSetting` (`User.cpp:254-267`): `g_UserMng.AddSetLevel(this, level)` (to **others**), `AddSetGrowthLearningPoint(m_nRemainGP)` (to the player), `SendLogLevelUp`, `SendUpdatePlayerData` (the core server then pushes `UPDATE_PLAYER_DATA` to the player's party/guild/friends only, `CORESERVER/DPDatabaseClient.cpp:521-565`). Finally `AddSetExperience(exp, level, skillPoint, skillLevel)` to the player (`Mover.cpp:6254`).
- Death penalty at low level: `Resource/DiePenalty.inc`: EXP loss 0 % up to level 20 (`DECEXP_PENALTY ... 20 0`), revival HP 80 % at level 1, 60 % at 2, 50 % at 3-5, 40 % at 6-10, 30 % above (`REVIVAL_PENALTY`); `m_nDeathExp/m_nDeathLevel` stay unchanged for such a character (`Mover.cpp:7190-7230`), so no EXP-loss display is needed for levels 1-15.

### 4.2 What Neuz does when the player levels up (`CMover::SetExperience`, `MoverParam.cpp:1709-1900`, called by `OnSetExperience`)
`m_nExp1 = nExp1` first. If the new level > `m_nLevel`:
1. `PutLvUpSkillName_1(nLevel)` prints "You've learned X..." chat lines for skills whose `dwReqDisLV` equals the new level (:160-200).
2. If standing (`OBJSTA_STAND`/`STAND2`): motion `MTI_LEVELUP` (198, `ANILOOP_1PLAY`, `MOP_FIXED`; the male/female motion named "Genlevelup", `Resource/mdlDyna.inc:24783,25582`).
3. SFX `XI_GEN_LEVEL_UP01` (42) at the player's position attached to the player's id (model `sfx_GenLevelUp01`, `mdlDyna.inc:157`). Sound `PlayMusic(BGM_IN_LEVELUP)` (23, `defineSound.h:1929`).
4. If `m_nDeathLevel < nLevel`: chat line `TID_GAME_LEVELUP`. Always: big caption `TID_GAME_LEVELUP_CAPTION` (`g_Caption1.AddCaption`).
5. Chat line `TID_GAME_PATTERNUP` when crossing level 2, 8 or 12; `TID_EVE_LEVEL15` ("Now it's time to choose your job.") at 15; `g_Option.m_nInstantHelp = 0` at 15; flight messages at 20.
6. `m_nLevel = nLevel`; HP, MP, FP = new max.
7. A blinking "advice" button for the character window is added to the world window (`AddAdvButton(APP_CHARACTER3)`, :1782); guide windows at 15/20/40.
8. Then in `OnSetExperience` (`DPClient.cpp:3376-3430`): if `nDeathExp != -1` / `wDeathLevel != 0xffff` they are stored; `m_nSkillLevel/m_nSkillPoint` are stored; if the skill points rose: a second `XI_GEN_LEVEL_UP01` at the **own** position, `PlayMusic(BGM_IN_LEVELUP)` again (own player), caption `TID_GAME_SKILLPOINT_UP`, skill-window advice button.
If the new level < `m_nLevel` (level down) only the level and flight level change.

### 4.3 What other players see
Only `SETLEVEL` (`u16 level`) reaches them (not the levelling player). `OnSetLevel` (`DPClient.cpp:3339-3360`): if the level rose, motion `MTI_LEVELUP` if standing, and SFX `XI_GEN_LEVEL_UP01` at that mover; then `m_nLevel = wLevel`, `m_nHitPoint = max`, `m_nManaPoint = max` (FP not). The level is not drawn over heads; it shows in the target bar (5.2) and the party/guild lists. Because of the level-15 quirk (4.1) a level-15 Vagrant sends this message with an unchanged level after every kill, which only resets the viewer's idea of that mover's HP/MP to max.

---

## 5. The bars in Neuz

### 5.1 The status window (`CWndStatus`, `APP_STATUS1`, key `T`)
Created at login (`_Interface/WndManager.cpp:2177`, `FuncApplet.cpp:179`), moved to the top-left of the layout rect (`WndField.cpp:11258-11261`). Resource `Resource/resdata.inc:3350`: `APP_STATUS1 "WndStatus2.tga" ... 220 x 112`; client-area controls: HP bar (96,4)-(204,14), MP (96,20)-(204,30), FP (96,34)-(204,44), EXP (96,50)-(204,58), guild-house rest-exp (96,66)-(204,74), face viewport (4,4)-(68,72). Title bar text: `TID_GAME_WND_STATUS_PLAYER_INFORMATION` = `"%s - Lv: %d"` (name, level), set in `PaintFrame` (`WndField.cpp:10385-10425`); the face is the player's 3D head (out of scope).

Bars (`MakeGaugeVertex`, :10299-10382; width W = 108 = bar width): integer arithmetic for HP/MP/FP, float for EXP:
```
hpWidth  = 108 * GetHitPoint()     / GetMaxHitPoint()        // int * int / int
mpWidth  = 108 * GetManaPoint()    / GetMaxManaPoint()
fpWidth  = 108 * GetFatiguePoint() / GetMaxFatiguePoint()
expWidth = (int)( ((float)108 / GetMaxExp1()) * GetExp1() )
```
Fill colours (ARGB): HP `0x64ff0000`, MP `0x640000ff`, FP `0x6400ff00`, EXP `0x847070ff`, rest-exp `0x84e6ce19`. Textures `GauEmptyNormal.bmp` (HP/MP/FP) and `GauEmptySmall.bmp` (EXP, rest), 3-slice, loaded at :11232-11245. The frame itself is the window texture.

Numbers (`OnDraw`, :10440-10640). `m_nDisplay` starts at **2** (:10270) and a left click on the window cycles `2 -> 0 -> 1 -> 2` (`OnLButtonDown`, :11304-11307):
- mode **2**: for each of HP/MP/FP the text `cur`, `/`, `max` (plain `%d`, white `0xffffffff` with black outline `0xff000000`), centred horizontally at `barRight-82` (cur), `barRight-30` (max), and the `/` at `barRight - (barWidth/2 + glyphWidth/2)`; y = bar top (minus `nTopGap`, 0 for a font <= 14 px). With bar right = 204: cur centred at x=122, slash at the bar centre 150, max at x=174. (:10588-10613)
- mode **1**: `"%d%%"` of `GetHitPointPercent()` etc. at `barRight-90` (left start) - `GetXxxPercent(100)` is `MulDiv(cur, 100, max)`, which **rounds to nearest** (`MoverParam.cpp:2939-2958`) - plus `"<%d>"` (`TID_GAME_WND_STATUS_PERCENT_POINT`, the current value) right-aligned near `barRight-17`, `nChars*5.8f` px wide each (:10570-10586).
- mode **0**: no text at all (HP, MP, FP and EXP text are all inside `if( m_nDisplay != 0 )`).
- **EXP text, in every mode but 0** (:10617-10626): `nExpResult = GetExp1() * 10000 / GetMaxExp1()` (int64, truncating); `fExp = (float)nExpResult / 100.0f`; text `"99.99%"` if `fExp >= 99.99f`, else `sprintf("%.2f%%", fExp)`. Right edge at x = 197 (`barRight-7`), `nChars*5.8f` px per char, y = EXP bar top. Percent with two decimals, no EXP numbers.
- Guild-house rest bar (`__VER >= 15`, :10628-10630): width `= GuildHouse->m_nExtraExp` px (minimum 9 px when > 0), text `"%d%%"` of it, always drawn (a fresh character shows `0%`). `m_nExtraExp = restPoint*100/MAX_REST_POINT`, set by snapshot 0x8814 (`OnRestPoint`, `DPClient.cpp:19078-19085`, `i32 restPoint`; sent only when the server value changes, `User.cpp:539-542`); 0 for a Vagrant who is not in a guild house.
- No flashing at low HP in v15 (the `__VER < 9` berserk code is dead); the EXP gauge does not blink after death in v15 (`IsAfterDeath` only toggles `m_bExpVisible`, which the `__VER >= 8` branch ignores, `WndField.cpp:10488-10510`).
- `m_nDeathExp/m_nDeathLevel` are not displayed anywhere in v15. Neuz only stores them in `OnSetExperience` (`DPClient.cpp:3390-3393`) and `SetExperience` uses `m_nDeathLevel` to decide whether to print `TID_GAME_LEVELUP` (`MoverParam.cpp:1729`, `if( m_nDeathLevel < nLevel )`).

### 5.2 The target bar (`CWndWorld::RenderSelectObj`, `_Interface/WndWorld.cpp:2716-2930`)
Drawn at the top of the world window for the focused object (`WndWorld.cpp:1058`) when it is a player or a non-peaceful mover (`IsPlayer() || IsPeaceful() == FALSE`; `m_dwBelligerence == BELLI_PEACEFUL`, `Mover.h:1091`); a target with GM authorization (`IsAuthHigher(AUTH_GAMEMASTER)`) gets no bar unless the viewer is a GM too (`WndWorld.cpp:2740-2753`).
- Bar: 200 px wide, centred in the world window's client area at `x = (clientWidth-200)/2`, `y = 30`; background colour `ARGB(200,255,255,255)`, fill `ARGB(128,255,15,15)` of width `200 * GetHitPoint() / GetMaxHitPoint()` (int64 math), texture `m_texGauEmptyNormal`. **No numbers**, only for a GM viewer a line with `Health: %d/%d` (monster) or `... Penya ... EXP %.2f%%` (player).
- Text at (`x+50`, `y-18`), `"%s <Lvl %d>"`: a monster shows its name and `GetProp()->dwLevel` (name only when `dwHideLevel == 1`); a player shows `<Lvl N>` (`-M`/`-H` suffix for master/hero) when the viewer is a GM or `viewerLevel + 20 > targetLevel`, else `<Lvl ??>`. Colours: player `COLOR_PLAYER` 0xffffffff, monster `COLOR_MONSTER` 0xffffffa0, an aggressive monster (`m_bActiveAttack`) red 0xffff0000 (`Mover.h:34,38`).
- Level arrow for a monster at (`x+30`, `y-20`): `diff = monsterLevel - playerLevel`; `diff > 5` `LvUp2.bmp`; `1..5` `LvUp.bmp`; `diff < -5` `LvDn2.bmp`; `-5..-2` `LvDn.bmp`; `-1` and `0` nothing. An element icon above it when `eElementType != 0`.
- Max HP of the target is computed on the client (1.2): monsters from `propMover.txt` `dwAddHp` (x the two rates, default 1.0), players from level, job and stats of their ADD_OBJ.
- Click-to-target uses the existing picking; `m_pRenderTargetObj` (`__CSC_VER11_2`) keeps the last non-peaceful target drawn after the focus clears (`WndWorld.cpp:6412-6415, 6890, 6928`).

---

## 6. Natural regeneration and sitting

- **Server only.** `CMover::ProcessRecovery` is `#ifdef __WORLDSERVER` (`Mover.cpp:8167-8407`), called from `CMover::Process` (:3928) for players only. The client has no regeneration code (`GetHPRecovery/GetMPRecovery/GetFPRecovery` are called nowhere in Neuz or `_Interface`). The bars move only on SETPOINTPARAM (one per stat that changed, to everyone in view).
- **Standing:** every `NEXT_TICK_RECOVERYSTAND` = 3 s (`Mover.h:114`, initial timer `Mover.cpp:421`), but not in combat: `IsAttackMode()` = `m_nAtkCnt && m_nAtkCnt < SEC1*10` (`Mover.cpp:9227-9230`, `__VER >= 9`), i.e. for 10 s after the player attacked or was hit (`m_nAtkCnt = 1` at `AttackArbiter.cpp:759`, `ActionMoverMsg.cpp:550,592,685`; it is incremented per server tick, `Mover.cpp:3872`; the server runs 15 ticks per second, `timer.h:135-140`); then `IncHitPoint(GetHPRecovery()); IncManaPoint(GetMPRecovery()); IncFatiguePoint(GetFPRecovery())` (:8396-8398) (skipped while the `CHS_SETSTONE` state is on).
- **Sitting** (`m_pActMover->IsSit()`, :8309-8380): every `NEXT_TICK_RECOVERY` = 2 s (`Mover.h:113`) the same three increments times a party factor (1.0, or 1.5 / 1.8 with a touring party's stretching mode) - note there is no combat check here, but a hit stands the player up (`AttackArbiter.cpp:222-223`, `OnDamage` :1789-1790). Standing resets the sit timer (:8384). Sitting itself is out of scope.
- **Amounts** (`MoverParam.cpp:2972-3020`, `__VER >= 9` makes the final reduction of 10 % live):
```
HP: v = (int)( (GetLevel()/3.0f) + (GetMaxHitPoint()   / (500.f*GetLevel())) + (GetSta()*fFactorHPRecovery) )
MP: v = (int)( ((GetLevel()*1.5f) + (GetMaxManaPoint()    / (500.f*GetLevel())) + (GetInt()*fFactorMPRecovery)) * 0.2f )
FP: v = (int)( ((GetLevel()*2.0f) + (GetMaxFatiguePoint() / (500.f*GetLevel())) + (GetSta()*fFactorFPRecovery)) * 0.2f )
v = (int)( v - (v * 0.1f) );  amount = GetParam(DST_xP_RECOVERY, v)       // 41, 42, 43
```
  (The Korean comment block above these functions, :2960-2970, describes an older formula and is not what the code does.) A naked Vagrant gets 16 HP per 3 s at level 1 and 0 MP/FP **[derived]**.
- Monsters regenerate through their AI (`_AIInterface/AIMonster.cpp:2243`), also through SETPOINTPARAM.

---

## 7. What the browser decodes today vs what Piece 4 must add

Today (`web:packages/protocol/src/world/addObj.ts`, `.../readers.ts:16-33`): the `WORLD_READERS` map holds only ADD_OBJ, MOVERMOVED, MOVERBEHAVIOR, MOVERCORR, MOVERANGLE, DESTPOS, DESTANGLE, MOVERSETDESTOBJ, MOTION, SETPOS, SETPOSANGLE, DEL_OBJ, WORLD_READINFO, REPLACE, ENVIRONMENTALL. In a bundle with the table of contents (`bundle.ts`) an unknown type is just skipped, so the new messages are harmless today; without a table the first unknown type ends the bundle.
- `AddedMover.hitPoint` (i32, all movers), `AddedPlayer.level`, `job`, `pkValue`, `pkPropensity`, `honor`, `authorization`, `mode` are kept. The browser keeps the ADD_OBJ as an immutable `added` object (`web:apps/client/src/world/WorldState.ts:22`, `add` :150) and never changes it; an ADD_OBJ for an ID already in view is dropped (:151), as Neuz does; `apply()` (:60-118) is where the new message types would be handled.
- **Skipped and needed in ADD_OBJ (own character):** STR/STA/DEX/INT (u16 x4, `addObj.ts:98-101`), MP and FP (u16, :156-157), EXP (i64, :161), remaining GP (i16, :173), skill level/point (i32 x2, :162-163), death exp/level (i64/i32, :164-165). Add the same for other players only for the stats (they are in the common player part), since the target HP bar needs their max HP (level, job, STA). `m_nFame` (:123) only if the PVP block is built.
- **New readers** (object ID is the mover): SETPOINTPARAM (`i32,i32`), SETEXPERIENCE (`i64,u16,i32,i32,i64,u16`), SETLEVEL (`u16`), SET_GROWTH_LEARNING_POINT (`i32,i32`), SETSTATE (`i32 x6`), DAMAGE (`u32,u32,u32` + optional `vec3,f32` if flags & 0x10000000; Piece 4 needs only `dwHit` for HP), MOVERDEATH (`u32,u32`), MONSTERPROP (if the owner wants server rate overrides; see section 9). Optional: the guild-house rest point (0x8814, `i32`). The readers must consume exactly the message length (indexed bundles reject others as "mismatched", `bundle.ts`).
- **New encoder:** MODIFY_STATUS (`u32 DPID_UNKNOWN, u32 0xf000f501, i32 x4`) next to `encodeDestPos` in `web:packages/protocol/src/messages/world.ts`.
- **New data (converter `gameDataStage.ts`):** job factors (`propJob.inc`), the exp table (`ExpTable.inc`), monster `dwLevel/dwAddHp/nExpValue/dwHideLevel/eElementType` (the reader at `propMover.ts` reads and drops them), the fists' `dwAbilityMin/Max`, `fAttackSpeed`, `dwWeaponType` (`propItem.ts` drops them), job names (`etc.inc`), and the `TID_*` texts with colours. `GameData.movers` already has `name`.
- **Client state:** a mutable per-mover `hp`, and for the own character `mp, fp, str, sta, dex, int, level, exp, remainGP, skillPoints`; effective values need an `adjParam` hook (empty until items and buffs come).
- **Cross-piece effects to honour:** the client applies DAMAGE to HP itself (2.2) and MOVERDEATH sets HP 0; `SetPointParam` clamps to the *client's* max (`MoverParam.cpp:896-935`), so with an incomplete max formula (items later) HP would be clamped wrongly - decide whether to clamp.

---

## 8. Texts (English table), for the UI

Resolved with `Resource/textClient.inc` (TID -> colour + `IDS_` key) and `Resource/textClient.txt.txt` (`IDS_` -> text, UTF-16LE); the TID numbers are in `Resource/defineText.h`.

| TID | Colour | Text |
|---|---|---|
| TID_GAME_LEVELUP (601) | 0xffccffcc | Level up! You can increase your stats in your character window. |
| TID_GAME_LEVELUP_CAPTION (3073) | 0xffffffff | Congratulations! Level up! |
| TID_GAME_SKILLPOINT_UP (3067) | 0xffffffff | New Skill Points are now available. |
| TID_GAME_PATTERNUP (610) | 0xffccffcc | You are learning new attack patterns! |
| TID_EVE_LEVEL15 (504) | 0xff3366ff | Now it's time to choose your job. |
| TID_GAME_REAPSKILL (609) | 0xffccffcc | You've learned %s.  You can now allocate skill points to this ability. |
| TID_GAME_WND_STATUS_PLAYER_INFORMATION (4336) | - | %s - Lv: %d |
| TID_GAME_WND_STATUS_PERCENT_POINT (4335) | - | <%d> |
| TID_GAME_SELECT_OBJECT_INFORMATION_MONSTER (GM only) | - | Health: %d/%d |
| TID_GAME_CHARSTATUS_APPLY_Q (3308) | - | Do you want to use the current Stat setup? |
| TID_DIAG_0082 (2081) | - | Your stat values will reset after your 1st job change. |
| TID_GAME_TITLE_CHAR_INFO / _HONOR | - | Character / Fame/Master |
| TID_APP_CHARACTER_BASE / _DETAIL / _JOB | - | Base / Detail / Job |
| TID_GAME_CHARACTER_01, _02, TID_GAME_CHAR_SERVER, TID_GAME_CHAR_SERVERNAME | - | Name, Level, Server, Channel |
| TID_GAME_CHARACTER_13, _14, TID_TOOLTIP_DEFENCE, TID_GAME_CHARACTER_15, TID_GAME_CHARACTER_07 | - | ATK, Critical, DEF, A.Speed, Stat Points |
| TID_TOOLTIP_STR/STA/DEX/INT | - | STR, STA, DEX, INT |
| TID_TOOLTIP_COMMAND_STR0/STR1 | - | Strengthens Attack Power of Weapon / Except for wand |
| TID_TOOLTIP_COMMAND_STA0/STA1 | - | Strengthens Defense, Max. HP, Max. FP / HP, FP recovery rate increased |
| TID_TOOLTIP_COMMAND_DEX0..DEX3 | - | Attack speed increased / Evasion Rate, Blocking Rate increased / Increases Critical Hit Chance. / Striking power of bow is increased. |
| TID_TOOLTIP_COMMAND_INT0/INT1 | - | Amount of Max. MP is increased. / Magic Attack Power |
| TID_TOOLTIP_CHARSTATUS_GPPOINT / _EDIT | - | Select Apply after you change your Stat points. |
| TID_TOOLTIP_CHARSTATUS_STATUS1 / STATUS2 | - | Attribute changes will be applied when you are ready. / Attribute changes have been applied. |
| TID_TOOLTIP_CHARSTATUS_APPLY / RESET | - | Apply new Stats. / Return to Previous Stats. |

The buttons "Apply" and "Reset" are textures (`ButtCharApply.tga`, `ButtCharReset.tga`) with the strings "Apply"/"Reset" as their captions (`WndField.cpp:3552-3553`).

---

## 9. Reference vectors **[derived]**

Computed by me with the formulas above in float32 (`Math.fround` after each operation) for a Vagrant with 15/15/15/15 and no items; the script is `...\scratchpad\vectors.js`. Not verified against a running client.

| Lv | Max HP | Max MP | Max FP | Stand-regen HP/MP/FP per tick | ATK shown | DEF | Crit | A.Speed |
|---|---|---|---|---|---|---|---|---|
| 1 | 230 | 63 | 32 | 16/0/0 | 8 (7-9) | 0 | 1% | 42% (A=76) |
| 2 | 230 | 63 | 32 | 16/1/1 | 9 | 0 | 1% | 42% |
| 3 | 231 | 64 | 33 | 17/1/1 | 10 | 1 | 1% | 42% |
| 5 | 234 | 65 | 34 | 17/2/2 | 12 | 3 | 1% | 42% |
| 8 | 240 | 67 | 36 | 18/2/3 | 15 | 5 | 1% | 42% |
| 10 | 246 | 68 | 37 | 18/3/4 | 18 | 6 | 1% | 42% |
| 12 | 252 | 69 | 38 | 19/4/5 | 20 | 8 | 1% | 42% |
| 15 | 265 | 71 | 40 | 20/5/6 | 23 (22-24) | 10 | 1% | 42% |

Level 15 with all 28 earned points in one stat: STA 43 -> HP 560, FP 43, DEF 43; INT 43 -> MP 147; DEX 43 -> crit 4%, A.Speed 46% (A=84); STR 43 -> ATK 45 (44-46).

Monster sample (`Resource/propMover.txt:7`, `MI_AIBATT1`, columns decoded with `propMover.ts` order): `dwLevel 1`, `dwAddHp 120`, `nExpValue 2`, `dwClass RANK_LOW`, `dwHideLevel =`. A level-1 character needs 14 EXP: 7 kills.

---

## 10. Open questions / uncertain

1. **Starting values of a new character** (HP/MP/FP, `m_nRemainGP`, skill points) come from the SQL stored procedure behind `CHARACTER_STR 'I1'`; not in the source. The constructor says 15/15/15/15, level 1, GP 0 (`Obj.cpp:165-176`); the DB server's `InitProp` says HP/MP/FP 77 (`Obj.cpp:325-327`). Check against the owner's database or `BB_*.sql` / a real login before fixing test vectors.
2. **Data files in the client packs vs `Resource/`.** I read the server-side `Resource/` copies. Neuz loads `ExpTable.inc`, `propJob.inc`, `propItem.txt`, `propMover.txt` from its own packs; if the owner edited a table on the server only, the client's max-HP/EXP bar would disagree with the server. Not checked (the packs are encrypted `.res`).
3. **MONSTERPROP rates.** Monster max HP in Neuz = `dwAddHp * m_fHitPoint_Rate`, where the rate comes from the MONSTERPROP snapshot the server sends at join (per monster name, percent). If the owner uses the back-end monster-rate tool the browser must read it, otherwise the target bar's percent drifts. A normal player never receives `GAME_RATE_HITPOINT` (GM-only). Unknown which the owner's server does.
4. **`BGM_IN_LEVELUP` (23)**: the sound file behind it was not found in `Resource/` (no sound table there); `PlayMusic` and the sound tables are in the client packs. Not resolved.
5. **Font metrics.** Several x positions in the status window depend on the Neuz bitmap font (`GetTextExtent("8")`, `nCharHP*5.8f`, `nTopGap`); I give the formulas, not pixel-exact positions for a browser font.
6. **Revival HP/MP** after death (server `REVIVAL_PENALTY`, client `OnRevivalLodestar` rates 8/6/5/4/3 tenths, `DPClient.cpp:3450-3510`) and the death UI are the death part of the world piece; I only noted that the client path for a normal revival (`OnRevival`) sets nothing in v15 (its HP code is under `__VER < 9`), so HP then comes from a SETPOINTPARAM. Not verified end to end.
7. **Behaviour at level 15** (the `AddExperience` early return, 4.1) is read from the code, not observed: it implies the EXP bar stays at 0.00 % and the server sends SETLEVEL/GROWTH/SETEXPERIENCE after every kill of a level-15 Vagrant.
8. **Items and buffs** change every number here through `adjParam`/`chgParam` (`GetParam`), `m_nDefenseMin/Max` (armour sum), weapon `dwAbilityMin/Max`, refine options and `SM_*` items; their wire form (ADD_OBJ inventory, equip/buff snapshots) belongs to later pieces. ATK, DEF, crit and A.Speed in Piece 4 are the naked-Vagrant values.
9. **The first-job-change stat reset** that the confirm box warns about happens through NPC scripts (`_Common/ScriptLib.cpp` change-job functions); not traced, outside levels 1-15.
10. `GetFameName()`, PK value and propensity rows of the same window (PVP block) were only located, not specified.
11. The 10-second "in combat" window that stops standing regeneration is derived from `SEC1*10` with `PROCESS_COUNT` = 15 and `m_nAtkCnt` incremented once per `CMover::Process` (`Mover.cpp:3872-3873`); I did not verify the world server's real `Process` rate, so "about 10 s" is the safe reading.
12. The status window's mode-2 text positions use the glyph width of "8" in Neuz's font; with a web font centre `cur` and `max` on the two x anchors given in 5.1 instead of copying pixels.
