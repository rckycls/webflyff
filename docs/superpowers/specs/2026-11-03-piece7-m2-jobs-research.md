# Piece 7 M2 research — the job change, the first-job weapons and their skills

**Date:** 2026-11-03. **For:** `2026-11-03-piece7-design.md` §3.3, §4, §5 (M2 row), §7, and the plan
`plans/2026-11-03-piece7-m2-jobs.md`. C++ paths are relative to `Source/`, resource paths to `Resource/`, FlyffWeb paths to
the repository. Build flags (`Neuz/VersionCommon.h`): `__MAINSERVER` (:3) and `__VER 15` (:4), so the `__INTERNALSERVER`
block (:261-405) is dead and `__SKILL0517` with it (its `#else` is live); `__HACK_1023` on (:93, melee only); `__BUFF_1107`
on (:153); every `#if __VER >= 8/10/11` branch is live (the `__CSC_VER*` macros are never defined, their code tests
`__VER`). Client time: `SEC1` = 60 ticks (`_Common/timer.h:133-141`); server `SEC(x)` = 1000·x ms (`timer.h:5`).

The job change chain (the quests that end in the change) is M1's. This note covers what follows the server's change.

## 1. The job change

- **Jobs** (`Resource/defineJob.h:41-48`): VAGRANT 0, MERCENARY 1, ACROBAT 2, ASSIST 3, MAGICIAN 4; expert jobs are
  `MAX_JOBBASE` 1 ≤ job < `MAX_EXPERT` 6, professional < 16, master < 24, hero < 32 (:46-90). `m_aJobSkill` is 45 SKILLs
  (3 + 20 + 20 + 1 + 1, :12-17), 8 bytes each (`DWORD dwSkill, dwLevel`, `_Common/Item.h:308-314`).
- **The server's change** (`CMover::AddChangeJob`, `_Common/MoverParam.cpp:1611-1628`): an expert job's skills go into
  slots `3 + i`, in `prj.m_aJobSkill[job]` order (propSkill order `qsort`ed by `dwReqDisLV`, `_Common/Project.cpp:364-399`;
  `qsort` is unstable, so the client takes the slots from the message and never recomputes them). Every path sends both
  messages: the quest script (`_Common/ScriptLib.cpp:887-888`, `:2608-2609`), the GM command (`_Interface/FuncTextCmd.cpp:
  905-906`) and `InitLevel` (`_Common/Mover.cpp:1792-1793`). `CDPSrvr::OnChangeJob` is commented out (`WORLDSERVER/
  DPSrvr.cpp:2480-2540`).
- **SNAPSHOTTYPE_SET_JOB_SKILL 0x00a7** (`_Network/MsgHdr.h:1076`), to the user about itself (`CUser::AddSetChangeJob`,
  `WORLDSERVER/User.cpp:1181-1197`): `i32 nJob`, 45 × (`u32 dwSkill`, `u32 dwLevel`), 32 × `u32 dwJobLv` (zeros, unused):
  4 + 360 + 128 bytes.
- **SNAPSHOTTYPE_SET_NEAR_JOB_SKILL 0x00a8** (:1077), to everyone in view but the mover (`CUserMng::AddNearSetChangeJob`,
  `User.cpp:5111-5134`): `i32 nJob`, then **21** SKILLs from slot 20 for a master or hero, else **20** SKILLs from slot 3.
  No `dwJobLv`. (Neuz's reader for a mover not in view reads 22 for a hero, `Neuz/DPClient.cpp:3664-3666`, a misread the
  browser does not copy: it reads what the server writes.)
- **`CDPClient::OnSetChangeJob`** (`DPClient.cpp:3600-3678`), valid mover:
  - `m_nJob = nJob`; slots 3-44 cleared, then all 45 read over them (:3605-3621); `dwJobLv` read and dropped (:3618-3619).
  - an open skill window (`APP_SKILL3`, `__VER >= 10`) runs `InitItem( GetJob(), m_aJobSkill )` (:3623-3630);
  - the own mover: `MTI_LEVELUP` (198, `Resource/defineNeuz.h:460`) `ANILOOP_1PLAY, MOP_FIXED` if it is in `OBJSTA_STAND`
    or `STAND2` (:3635-3636); `CreateSfx( XI_GEN_LEVEL_UP01, pos, id )` (:3637); `PlayMusic( BGM_IN_LEVELUP )` (23,
    `Resource/defineSound.h:1929`; :3638); the chat line `TID_EVE_CHGJOB` (500) formatted with `GetJobString()` in its
    colour (:3639-3641): "Welcome to the wonderful world of %ss!", ARGB 0xff3399ff (texts catalog); the guide model (:3643-3652,
    not in the browser). The task bar is untouched (no job reference in `_Interface/WndTaskBar.cpp`).
- **`OnSetNearChangeJob`** (:3680-3725): `m_nJob = nJob`, the skills read, `XI_GEN_LEVEL_UP01` on the mover, and
  `MTI_LEVELUP` if standing (:3700-3703). No text, no music.
- **GM commands** for the checklist (`FuncTextCmd.cpp:5204`, `:5213`): `/level <job> <n>` (`TextCmd_Level`, :745-830:
  levels 1-15 make a Vagrant, `InitLevel( JOB_VAGRANT, n )`; 16-60 need an expert job name) and `/changejob <job>` or
  `/cjob` (`TextCmd_ChangeJob`, :876-915, no level test). Job names are `propJob`'s `szName` or `szEName` (`Mercenary`,
  `Acrobat`, `Assist`, `Magician`).

## 2. The first-job weapons

| Kind (`defineItemkind.h:67-78`) | Job | Hands | Reach (`dwAttackRange`) | `fAttackSpeed` | Hit effect (`dwSfxObj3`) | Example (`propItem.txt`) |
|---|---|---|---|---|---|---|
| `IK3_SWD` 2 | Mercenary | one | AR_SHORT | 0.085 | XI_HIT_SWORD01 | `II_WEA_SWO_PETAL` :706 |
| `IK3_AXE` 3 | Mercenary | one | AR_SHORT | 0.06 | XI_HIT_SWORD01 | `II_WEA_AXE_CURNING` :7 |
| `IK3_CHEERSTICK` 4 | Assist | two | AR_SHORT | 0.05 | XI_HIT_STICK01 | `II_WEA_CHEE_PLIM` :218 |
| `IK3_KNUCKLEHAMMER` 5 | Assist | one | AR_SHORT | 0.07 | XI_HIT_KNUCKLE01 | `II_WEA_KNU_OVERAM` :518 |
| `IK3_YOYO` 11 | Acrobat | two | **AR_HRANGE** | 0.075 | XI_HIT_YOY01 | `II_WEA_YOY_ITUN` :762 (`dwSfxObj2` the thrown yoyo) |
| `IK3_BOW` 12 | Acrobat | two | **AR_WAND** | 0.07 | XI_HIT_BOW01 | `II_WEA_BOW_WOODNE` :195 |
| `IK3_WAND` 6 | Magician | one | AR_RANGE | 0.025 | XI_FIR_WAND01 | `II_WEA_WAN_SEAL` :739 (`dwSfxObj2` XI_FIR_WAND01) |
| `IK3_STAFF` 7 | Magician | two | AR_SHORT | 0.045 | XI_HIT_STICK01 | `II_WEA_STA_MILE` :541 |

- **Motions** (`CMover::SetMotion`, `_Common/Mover.cpp:4817-4923`, in combat mode only): sword +200, axe +500, stick +400,
  knuckle +700, staff +600 (its files are the wand's stand and the sword's swings), wand +300, yoyo +2356, bow +2328.
  **The port already picks the right file for all eight** (`apps/client/src/world/sim/ActionMover.ts:165-179` is a copy;
  `render/MoverViews.ts:548-584`; the converted `motions/mvr_male/` has every set). Held models: knuckle on the right arm,
  bow in the left hand, yoyo in both (`_Common/MoverEquip.cpp:379-398`; the port: `render/looks.ts:224-229`).
- **Combo** (`_ProcessStateAttack`, `_AIInterface/ActionMoverState.cpp:804-843`): ATK1→ATK2 at level 2, →ATK3 at 8, →ATK4
  at 12, for every melee weapon, **except the yoyo, which stops after ATK2** (:820-825). The port's `COMBO` and `combo()`
  (`combat/attackLoop.ts:34-39`, `:662-676`) lack the stop: a yoyo at level 8+ would swing and send ATK3.
- **Hit frames** (one `MA_HIT` per motion, read from the real `.ani`s): sword ATK1 frame 12 of 17; axe 13 of 21; stick 10
  of 17; knuckle 10 of 16 (ATK4 6); yoyo 17 of 24 (the throw at the `MA_QUAKE` frames 6 and 7); bow 14 of 29; wand 20 of 36.
- **Reach** (`CMover::GetAttackRange`, `_Common/MoverMsg.cpp:140-169`): AR_SHORT 2, LONG 3, FAR 4, RANGE 10, WAND 15,
  HRANGE 6, HWAND 18 m. Melee uses range 0 for every weapon **but the yoyo**, which walks to `GetAttackRange( AR_HRANGE )`
  = 6 m (`CMD_SetMeleeAttack`, :439-440). On arrival the yoyo alone checks the line of sight from 0.5 m up to 0.5 m up on
  the target (`IntersectObjLine`), and a blocked line prints `TID_GAME_BLOCKTARGETING` (red, "This action has been blocked
  by an obstacle..") and does not swing (`_Common/MoverMove.cpp:189-200`). The port has range 0 and no sight test
  (`combat/attackLoop.ts:612`, `:631-642`).
- **The thrown yoyo** (`ActionMoverState.cpp:1040-1078`, every player on the client): at the `MA_QUAKE` frame,
  `CreateSfxYoYo( hand dwSfxObj2, hand pos, id, target + 1 m )` from the right hand on ATK1 and the left on ATK2, then
  `CSfxItemYoyoAtk::MakePath` (`_Common/CreateObj.cpp:380`; `_Common/Sfx.cpp:1118+`): a 7-point out-and-back path with a
  tail, its length clamped to 12/5-49/5. Drawing only; the damage is at the hit frame. The port has none.
- **Attack speed** (`CMover::GetAttackSpeed`, `_Common/MoverAttack.cpp:159-192`, copied in `sim/params.ts:295-319`) sets the
  animation speed in ATK1-4 **and in ATK_MAGIC1 and ATK_RANGE1** (`ProcessAniSpeed`, `Mover.cpp:3088-3097`). The port's
  `isSwing` covers ATK1-4 only (`sim/ActionMover.ts:102-103`, used at :594). Job factors (`propJob.inc`): Vagrant 75,
  Mercenary 80, Acrobat 75, Assist 70, Magician 65. Worked at level 15, DEX 15: Mercenary sword 0.932, Acrobat yoyo or bow
  0.842, Assist stick 0.832, Magician wand 0.742.

## 3. The wand and the bow: the press, the charge and the let-go (`_Interface/WndWorld.cpp`)

- **Constants:** `MAX_POWER_GAUGE` 1800 (:81), `POWER_ATK_DELAY` 1800 (:82), `MAX_CHARGE_LEVEL` 4
  (`_Common/DefineCommon.h:25`), `m_timerFocusAttack.Set( 500 )` (:571).
- **`GetGaugePower`** (:6454-6469): `t = now - m_dwPowerTick`; −1 while `t < 0` (the lock-out); else
  `MulDiv( min( t, 1800 ), 4, 1800 )`, which rounds to nearest: level 0 below 225 ms, 1 from 225, 2 from 675, 3 from 1125,
  4 from 1575.
- **Press** on a mover (`OnLButtonDown`): `m_bSelectTarget = TRUE` (:7090); `m_timerFocusAttack` reset only for a mover
  that is not the old focus (:7091-7093); **`m_dwPowerTick = now` on every press on a mover** (:7097). Pressing the focus
  again turns the auto-attack on unless the hand holds `IK3_WAND` (:6901-6909): a bow may auto-attack.
- **Hold** (`OnEraseBkgnd`, :925-1000, each drawn frame), with the right-hand weapon a bow (:936) or a wand (:950), a mover
  focused and the player alive:
  - the gauge is drawn (below);
  - **automatic shot** while `m_bLButtonDown && m_bSelectTarget`: a bow at level ≥ 4 (:942-945); a wand at ≥ 4 with
    `GetManaPoint() >= 5`, else at ≥ 3 (:956-967). Then, if `IsAttackAble( focus )` (:975): `m_dwPowerTick = now + 1800`
    (:981, :985, set before the command's guards) and `CMD_SetMagicAttack( id, nPower )` or `CMD_SetRangeAttack( id,
    nPower )` (:982, :986). During the 1800 ms the level is −1: the gauge draws full (:994-995) and a let-go fires nothing.
    A held button therefore shoots every 1800 + 1575 = 3375 ms.
- **Let-go** (`OnLButtonUp`, :6471-6513): nothing for a dead player (:6473-6474). With a focus, `m_bSelectTarget`,
  `m_timerFocusAttack.IsTimeOut()`, `IsAttackAble( focus )`, an `OT_MOVER` and `GetGaugePower() >= 0` (:6484-6493):
  `m_dwPowerTick = now` (:6495), then `CMD_SetMagicAttack( id, nPower )` for `IK3_WAND` or `CMD_SetRangeAttack( id,
  nPower )` for `IK3_BOW` of `GetActiveHandItemProp()` (:6497-6502). Then `ControlPlayer( WM_LBUTTONUP )` and
  `m_bSelectTarget = FALSE` (:6510-6512).
  - A press on a new target let go before 500 ms: no shot. Held 500 ms or more: a shot at the level reached.
  - A quick press on the target already focused: a **level-0 shot** (its timer ran out long ago).
  - A double click's second press sets neither `m_dwPowerTick` nor `m_bSelectTarget` (:7239-7263): its let-go fires nothing.
- **`UseFocusObj`** (:6197-6266): a wand does nothing (:6229-6233). A bow while auto-attacking with the button up asks
  `CMD_SetRangeAttack( id, 0 )` every frame (:6250-6253): level-0 shots one after another. While the button is held on a
  mover `ControlPlayer` is not run, so the movement keys are not read (:8515-8531).
- **Keyboard:** no attack key; `MOT_BASE_AUTOATTACK` (27, `Resource/defineNeuz.h:347`; `_Interface/WndManager.cpp:
  3004-3026`) with a wand is a level-0 shot, otherwise the auto-attack on; no focus prints `TID_GAME_NOTTARGET`.
- **What stops a charge:** Escape clears the focus (`WndManager.cpp:3335-3361`): no gauge, no shot. A dead target fails
  `IsAttackAble`. The own death: `OnLButtonUp` returns. There is no other cancel.
- **The charge "effect" is a 2D gauge, not an `XI_*` effect** (`CMover::RenderGauge`, `_Common/MoverRender.cpp:925-986`):
  the bound box's `m_vPos[0]` with x and z zeroed, projected, then 40 px up (:945-952); 80 px wide, centred; textures at
  (x − 42, y − 5) with x made even, alpha 200, scaled 0.8 × 0.55 (:954-963). `GauMagChargeBG.TGA` always; then, falling
  through, level 4 adds `GauMagChargeTail`, 3 `Body2`, 2 `Body`, 1 `Head` (:965-981). Drawn whenever a wand or bow user has
  a mover focused; the level is forced to 0 while the button is not held (:996-997). The five TGAs load from `DIR_THEME`
  (`Neuz/Neuz.cpp:1613-1617`) and are **not converted yet**.

## 4. The commands, the arrival and the attack itself

| | `CMD_SetMagicAttack( id, power )` (`MoverMsg.cpp:500-522`) | `CMD_SetRangeAttack( id, power )` (:475-498) |
|---|---|---|
| Refused | `IsActAttack`, `IsDie`, no hand prop, kind3 ≠ `IK3_WAND` (:504-513) | the same with `IK3_BOW`, and `IsBullet` (:479-492) |
| Walks to | `GetAttackRange( AR_WAND )` = **15 m** always (:517) | `GetAttackRange( dwAttackRange )`: every bow is AR_WAND, **15 m** (:496) |
| Command | `SetCmd( OBJACT_MAGIC_ATTACK` 2`, id, power )` (:521) | `SetCmd( OBJACT_RANGE_ATTACK` 3`, id, power, 0 )` (:497) |

- **`IsBullet`** (`_Common/Mover.cpp:8461-8498`): the bow's `dwLinkKindBullet` is `IK2_BULLET` (25); the arrow slot's prop
  is `GetActiveHandItemProp( PARTS_BULLET` 25 `)`, the fists' when empty, so a missing arrow takes the mismatch branch:
  `PutString( TID_TIP_NEEDSATTACKITEM )` ("Equip arrows first.", white, 2608) and `m_bAutoAttack = FALSE` (:8473-8485).
  The client compares `dwItemKind2` with `IK2_BULLET`. The browser's inventory already has the slot (part 25,
  `hud/inventoryWindow.ts:162`).
- **Arrival** (`ProcessMoveArrival`, `_Common/MoverMove.cpp:207-241`): `OBJMSG_STAND`, `ClearDestObj`, then
  `DoAttackMagic( target, power )`; for the bow also `OBJMSG_STOP_TURN` and **`DoAttackRange( target, power, 0 )`: the
  charge level goes in the `dwItemID` argument** (:238). Then `SetCmd( OBJACT_NONE )` (:262).
- **`DoAttackMagic`** (`_Common/MoverSkill.cpp:3201-3279`): the own mover needs `IK3_WAND` in `GetWeaponItem()`
  (:3213-3227); the line of sight from 0.5 m up to 0.5 m up, refused with `TID_GAME_BLOCKTARGETING` (:3230-3241, for any
  mover on the client); `SendActMsg( OBJMSG_ATK_MAGIC1` 36`, id ) == 1` starts it (:3246): face the target, `SetActParam(
  OBJACT_MAGIC_ATTACK, id, power )`, an action point if power ≥ 1 (up to 100, :3253-3257), then `SendMagicAttack(
  OBJMSG_ATK_MAGIC1, id, 0, 0, power, m_idSfxHit )` (:3271-3274). Returns 0 when busy, −1 when refused.
- **`DoAttackRange`** (:3292-3380): the line of sight for the own mover only (:3301-3316); a weapon type of `WT_RANGE` or
  `WT_RANGE_BOW` (:3344); every bow's `dwUseMotion` is `=`, so a player plays `MTI_ATK_13 − MTI_STAND_13` = 23 = `MTI_ATK1`
  (:3349-3355); `SendActMsg( OBJMSG_ATK_RANGE1` 35`, id, 23 ) == 1` (:3366): face the target, `SetActParam(
  OBJACT_RANGE_ATTACK, id, power, idSfxHit )`, then `SendRangeAttack( OBJMSG_ATK_RANGE1, id, power, m_idSfxHit )`
  (:3375-3376). **`dwItemID` is the charge 0-4**, never an item.
- **`m_idSfxHit`**: an int, 0 at construction (`Mover.cpp:408`), pre-incremented once per missile at the hit frame
  (`MoverActEvent.cpp:756`, :858; skills `Ctrl.cpp:1396`). MAGIC_ATTACK and RANGE_ATTACK carry its value **before** this
  shot's increment (the previous missile's id, 0 at first). Nothing reads it there; SFX_ID's id is the one that counts.
- **Action messages** (`_AIInterface/ActionMoverMsg.cpp`; `OBJSTA_ATK_MAGIC1` 0x00050000, `OBJSTA_ATK_RANGE1` 0x00060000,
  `_Common/MoverMsg.h:53-54`):
  - `ATK_MAGIC1` (:522-553): 0 in an action or an attack; −1 for `MVRF_NOATTACK`, `NO_ATTACK_MODE`, or a target invalid or
    dead; a sitting mover stands; a damage state is reset; `MODE_COMBAT`, `STOP_TURN`, `STAND`; the state; `SetMotion(
    MTI_ATK1, ANILOOP_1PLAY )`; `m_nAtkCnt = 1`; returns 1.
  - `ATK_RANGE1` (:555-594): the same refusals; `m_idTarget = nParam1`; a flinch is reset, another damage state is −1;
    `MODE_COMBAT` (no `STOP_TURN`, no `STAND`, :586-587); the state; `SetMotion( nParam2, ANILOOP_1PLAY )`.
  - `ATK1`-`ATK4` return −2 for the own mover with a wand or bow in hand (:608-616).
- **States** (`ActionMoverState.cpp:452-458`): `ProcessStateAttackMagic` (:1135-1152): at the end frame `ResetState(
  ATK_ALL )`; at the hit frame `OnAttackMagic()`. `ProcessStateAttackRange` (:1158-1182): the same, with `MVRF_HITCONT` and
  `OnAttackRange()` only for a valid, live target. The end of either drains a remote mover's queued attacks (§7).

## 5. The missiles and the hit packets

- **`OnAttackMagic`** (`_Common/MoverActEvent.cpp:773-880`), client, at the hit frame: from `GetPos() + (0, 1, 0)` (not the
  hand, :824) to the target's position + `|m_vMax.y| / 2 · scale.x` (:818-822), `CreateSfx( hand dwSfxObj2 or
  XI_FIR_WAND01` 27`, src, id, dest, target )` (:836-840); the scale by power: 1 → 1.2, 2 → 1.7, 3 and 4 → 2.5, 0 → the
  index's (:843-849). Flying uses `XI_FIR_WAND02` (M5). The active mover: `idSfxHit = ++m_idSfxHit`, `SendSfxID( target,
  idSfxHit, AF_MAGIC` 0x8 `)`, and the missile gets that id and `m_nMagicPower = power` (:856-862); then the caster's model
  flash, colour (2, 2, 2) (:866-877).
- **`OnAttackRange`** (:672-767): a player's arrow is `GetActiveHandItemProp( PARTS_BULLET )->dwSfxObj2`
  (`II_WEA_SEC_ACR_ARROW`: `XI_ITEM_RANGE_ATK1` 112, `propItem.txt:1962`), the hit the bow's `dwSfxObj3` (`XI_HIT_BOW01`
  33). **Only the active mover makes it** (`CreateSfxArrow`, :721-722; from the left-hand bone, `GetHandPos(
  PARTS_LWEAPON )`, `Mover.cpp:8628-8649`, to the target + 1 m); others' arrows come from CREATESFXALLOW (§7). Flags
  `AF_GENERIC | AF_RANGE` 0x4001 (:739-741). The active mover: `++m_idSfxHit`, `SendSfxID( target, id, 0x4001 )`,
  `m_nMagicPower = power` (:754-760). An NPC's missile is `CreateSfx( item dwSfxObj2, pos + 1 m )` and, aimed at the own
  player, takes the server's `idSfxHit` (:732-736, :762-763).

| Class | Per tick | Aim | Arrives | Then | Ends |
|---|---|---|---|---|---|
| `CSfxItemWandAtk1` (`_Common/Sfx.cpp:836-951`) | 0.2 m (:891-893); the flight model loops frames 0-19 (:884-888) | each tick, target + `|vMax.y|/2·scale.x` (:860-865) | `dist² < r²`, r = `((|ΔX| + |ΔZ|) / 2 · scale.x) / 3` of the target's box (:866-874, :916-917) | the hit model `sfx_HitWand01` (XI 22) at the missile + 1 m with its yaw, pitch and roll (:912-921); `DamageToTarget` at the hit model's frame 0, the next tick (:926-929); deleted when the hit model ends | target dead or gone: deleted at once (:853-857, :875-878); 600 ticks (:936-937) |
| `CSfxItemRangeAtk1` (:954-1072) | 0.7 m (:987) | each tick, target + 1 m (:970) | `dist² < 0.4²` (:1046) | `DamageToTarget`; `CreateSfx( XI_HIT_BOW01, pos, src, dest, target )` turned by its yaw; deleted (:1048-1060) | target gone (:974); 600 ticks (:1065) |

- **Facing:** both turn +Z toward the target (axis-angle, then yaw-pitch-roll, :898-914, :993-1009) and draw in flight with
  `Render2`, which gives the full rotation to bill, particle and custom-mesh parts but only the yaw to a mesh part
  (`_Common/sfxbase.cpp:2063-2135`, mesh :2122). The charge scale reaches the flight model only (:941).
- **The arrow's trail:** `g_TailEffectMng.AddEffect( "etc_Tail2.bmp", 2, 0.35 )` (:1018-1021), a segment a tick that fades
  in about 6 ticks (`TailEffectMng.cpp:95-165`).
- **`CSfx::DamageToTarget`** (`_Common/SfxObj.cpp:107-133`): plays the target's `dwSndDmg2` for every missile (:119); then,
  only when `src->IsActiveMover() || ( !src->IsPlayer() && dest->IsActiveObj() )` (:124): `SetDmgCnt( 10 )` (the target
  shakes) and `SendSfxHit( m_idSfxHit, m_nMagicPower, m_dwSkill` (NULL_ID)`, srcId, 0, 0, 0 )`, then `m_idSfxHit = 0`
  (:126-129). **So the own missiles report, and so does a monster's missile at the own player; another player's never does.**
- **`~CSfx`**: a missile with `m_idSfxHit != 0` sends `SendSfxClear( m_idSfxHit, m_idSrc )` (:44-55): every own missile
  deleted without a hit (dead or gone target, timeout).

| Packet (`_Network/MsgHdr.h`) | Way | Body after the header (`Neuz/DPClient.cpp`) |
|---|---|---|
| `PACKETTYPE_MAGIC_ATTACK` 0x00ff0011 (:136) | to server | u32 36, u32 target, i32 0, i32 0, i32 power 0-4, i32 idSfxHit (:9841-9846) |
| `PACKETTYPE_RANGE_ATTACK` 0x00ff0012 (:137) | to server | u32 35, u32 target, u32 power 0-4, i32 idSfxHit (:9848-9853) |
| `PACKETTYPE_SFX_ID` 0x00ff0022 (:150) | to server | u32 target, i32 id, u32 type (0x8 wand, 0x4001 bow; skills §9), u32 skill (NULL_ID), i32 maxDmgCnt (≥ 1; 1) (:9876-9883, defaults `DPClient.h:229`) |
| `PACKETTYPE_SFX_HIT` 0x00ff00d2 (:192) | to server | i32 id, i32 power, u32 skill, u32 attacker (own, or the monster), i32 dmgCnt 0, f32 0, f32 0 (:11230-11236, defaults `DPClient.h:410`) |
| `PACKETTYPE_SFX_CLEAR` 0x00ff0024 (:152) | to server | i32 id, u32 mover (:11238-11245) |
| `SNAPSHOTTYPE_MAGIC_ATTACK` 0x00e1 (:1136) | to others | u32 msg, u32 target, i32 0, i32 0, i32 power, i32 idSfxHit (`WORLDSERVER/User.cpp:4836-4848`) |
| `SNAPSHOTTYPE_RANGE_ATTACK` 0x00e2 (:1137) | to others | u32 msg, u32 target, i32 power, i32 0, i32 idSfxHit (`User.cpp:4850-4862`) |
| `SNAPSHOTTYPE_CREATESFXALLOW` 0x00aa (:1079) | to others | u32 arrow XI, u32 hit XI, f32 x, y, z, i32 target (`User.cpp:5098-5109`) |

- **One own shot, in order:** PLAYERSETDESTOBJ (only when the target changed) → MAGIC_ATTACK or RANGE_ATTACK on arrival →
  SFX_ID at the motion's hit frame → SFX_HIT on impact, or SFX_CLEAR when the missile is lost.

## 6. The world server

- **`OnMagicAttack`** (`WORLDSERVER/DPSrvr.cpp:2102-2128`): forces nParam2 = 0, needs a valid target, `DoAttackMagic`; 0
  (busy) on the ground is queued. **No range, timing or speed check.** The server's `DoAttackMagic` needs `IK3_WAND` in hand
  (`MoverSkill.cpp:3207-3227`) and takes MP only at power 3 (`GetReqMp( dwReqMp )`, :3266-3267; the Seal Wand's `dwReqMp`
  is 15). `AddMagicAttack` goes to everyone in view but the attacker.
- **`OnRangeAttack`** (:2130-2154): `DoAttackRange`, which refuses silently unless `PARTS_BULLET` holds an `IK3_ARROW`
  (60, `MoverSkill.cpp:3324-3328`); a shot that starts sends `AddRangeAttack` and spends one arrow (`ArrowDown( 1 )`,
  :3372-3373; `Mover.cpp:8504-8549`): the own client gets **UPDATE_ITEM 0x0018** (`UI_NUM`, the count; 0 removes it), and
  an empty stack is replaced by another of the same item with DOEQUIP 0x0006 (:8529-8546).
- **Damage is the server's, and needs the client's two reports.** At its own hit frame the server queues an `SFXHIT_INFO`
  per target (`OnAttackSFX`, `MoverAttack.cpp:2171-2234`). `OnSfxID` (`DPSrvr.cpp:1980-1993`) stores the id in the
  sender's `m_sfxHitArray` (32 slots; a full array is wiped, `SfxHitArray.cpp:20-34`). `OnSfxHit` (:1933-1977) refuses an
  id with no SFX_ID (:1955-1957), else counts it (`RemoveSFX` → `IncSFXCount`, `MoverAttack.cpp:2242-2252`). Each tick
  `ProcessSFXDamage` (`Mover.cpp:10463-10555`) pairs the queued info and count of a target (by `dwSkill`) and calls
  `AttackBySFX` (`MoverAttack.cpp:2255-2308`): the damage, the miss roll for `AF_GENERIC`, and DAMAGE to all in view.
  Unpaired entries expire after `SEC(10)` (`Mover.cpp:10557-10636`). The power is the server's own. **Without SFX_HIT there
  is no damage**; `OnSfxClear` (:1996-2016) frees the id.
- **A monster's ranged attack** (`AIMonster.cpp:1273-1284`) registers an id and sends RANGE_ATTACK with it; the server deals
  its damage only when **the victim's client** sends SFX_HIT with the monster as `idAttacker` (§5).

## 7. Others' attacks on the client

- **`OnMagicAttack`** (`Neuz/DPClient.cpp:3835-3852`): `DoAttackMagic( target, power, idSfxHit )` on the remote mover; 0
  queues it in `m_qMagicAtkMsg` ( msg, id, p2, p3, power, idSfxHit ). **`OnRangeAttack`** (:3854-3875): `DoAttackRange(
  target, p2, idSfxHit )`, 0 queues ( msg, id, 1, p2, 0, idSfxHit ).
- **The queue** drains at the end of any attack state of a non-active mover (`Action.cpp:56-60`, :101-127): the melee queue
  first, then the magic one (`CMagicAtkMsgq::Process`, `ActionMover.cpp:59-93`: `nParam2 == 0` is magic, else range; 1
  removes the entry, 0 keeps it, −1 drops it and tries the next).
- **A remote wand missile flies and shows its hit** (its `OnAttackMagic` on this client), with no packets; the target plays
  its damage sound and does not shake. **A remote arrow** is made by `OnCreateSfxAllow` (`DPClient.cpp:4088-4114`), which
  reads the six fields, ignores the position, and calls `CreateSfxArrow` from the shooter's left hand to the target + 1 m;
  RANGE_ATTACK plays the shot's motion.
- **DAMAGE** is the same `OnDamage` as for melee (`DPClient.cpp:1758-1934`): the number and the banners; no `AF_MAGIC` or
  `AF_RANGE` branch, no flinch. The spark of a missile hit is the missile's own hit model, not a melee spark.
- **Today a bundle ends at the first type it cannot read** (`packages/protocol/src/bundle.ts:67-70`, `:198-207`): a nearby
  wand or bow user, or a ranged monster, cuts off the rest of the bundle, because 0x00e1, 0x00e2 and 0x00aa have no reader.

## 8. The first-job skills and their targets

- **65 skills** (`propSkill.txt`): Mercenary 15 (:7-21), Assist 17 (:41-57), Magician 17 (:77-93), Acrobat 16 (:124-139).
  `EXT_*` are in `Resource/define.h:38-59` (SELFCHGPARAMET 1, OBJCHGPARAMET 2, MAGICSHOT 3, MAGICATK 4, MAGIC 7, ANOTHER 8,
  ANOTHERWITH 9, TROUPE 13, MAGICATKSHOT 14, MELEEATK 17); `WUI_*` :9-21 (NOW 1, TARGETINGOBJ 4, TARGETCURSORPTZ 12).

| How it targets | Skills |
|---|---|
| Melee on a monster (KT_SKILL, MELEEATK) | Mercenary Splmash, Keen Wheel, Blindside, Bloody Strike, Special Hit, Reflex Hit; Assist Tamping Hole, Burst Crack, Power Fist; Acrobat Slow Step, Cross Line, Deadly Swing, Snitch (from behind) |
| Shot on a monster, KT_SKILL | Mercenary Guillotine; Acrobat Junk Bow, Aimed Shot, Silent Shot, Auto Shot, Arrow Rain (bow, arrows) |
| Shot on a monster, KT_MAGIC | Magician Boomerang, Hot Air, Sword Wind, Strong Wind, Ice Missile, Lightning Ball, Spike Stone, Fire Strike, Wind Cutter, Water Ball, Lightning Palm, Lightning Shock |
| Magic at the target (MAGICATK) | Magician Mental Strike, Spring Water, Rock Crash |
| Other harmful at the focus | Mercenary Sneaker; Magician Looting; Acrobat Pulling |
| On self (WUI_NOW) | Mercenary Protection, Pan Barrier, Blazing Sword, Smite Axe, Impower Weapon, Sword Master, Axe Master; Acrobat Yoyo Master, Bow Master, Dark Illusion, Fast Walker, Absolute Block, Counter; Assist Prevention, Stone Hand; Magician Blinkpool (+ a cursor point) |
| On a friendly player (KT_MAGIC, ANOTHERWITH) | Assist Healing, Patience, Heap Up, Cannon Ball, Mental Sign, Beef Up, Quick Step, Cat's Reflex, Accuracy, Haste |
| A dead player | Assist Resurrection |
| The party | Assist Circle Healing (EXT_TROUPE, own id; the client shows only its cast effect, `Ctrl.cpp:1531-1540`) |

- **The friendly target** (`CMD_SetUseSkill`, `_Common/MoverMsg.cpp:172-423`): `WUI_NOW` → own id (:210-212);
  `WUI_TARGETINGOBJ` → the focus overrides the id passed (:213-224); a harmful skill needs `IsAttackAble` (:373-375);
  Resurrection a dead non-NPC (:377-380); anything else a live target (:383-384); `EXT_ANOTHERWITH` with no target →
  **own id** (:402-405). No party or player test anywhere. With a monster focused, a heal walks to it and the server
  answers `TID_GAME_NEVERKILLSTOP` (`MoverSkill.cpp:433-445`) and CLEAR_USESKILL. One cannot focus oneself (`PickObject_
  Fast` excludes the active mover, `WndWorld.cpp:6306-6307`). **The port's `skillUse.ts` already does all of this**
  (`cmdSetUseSkill`, :495-540).
- **Selecting a player without attacking** (`OnLButtonDown`, `WndWorld.cpp:6886-6917`): `SelectObj` focuses it; the first
  press on a new mover turns the auto-attack off; a second press on a non-PK player tries the auto-attack, which
  `IsAttackAble` refuses. The port's `onMoverPressed` already does this.
- **Refusals the client prints**: `TID_GAME_BLOCKTARGETING` (the line of sight on arrival, `MoverMove.cpp:83-92`);
  `TID_GAME_NEVERKILLSTOP` for an `AS_BACK` skill (Snitch) not from behind, dot < 0.3 (:130-153); `TID_TIP_NEEDSATTACKITEM`
  for a bow skill without arrows (`IsBullet` before the command, `WndManager.cpp:6838-6841`, `WndTaskBar.cpp:2248`). The
  server's (`MoverSkill.cpp:288-1063`) come back as CLEAR_USESKILL or a DEFINEDTEXT, which the port already shows.
- **After a friendly skill begins**, `OnUseSkill` turns the auto-attack on unless the hand holds a staff, a stick or a wand,
  or the skill is SELFCHGPARAMET (`DPClient.cpp:3916-3940`); the port copies it (`skillUse.ts:305-318`).
- **Begun skills on every client** (`CMover::DoUseSkill`, `MoverSkill.cpp:701-1063`): KT_SKILL → `OBJMSG_MELEESKILL`
  (:769); **KT_MAGIC → `OBJMSG_MAGICCASTING`, or `OBJMSG_MAGICSKILL` (motion + 2) when queued or with no cast time**
  (:812-831); then the hand effects (:905-988) and the cast effect `dwSfxObj` on the caster (:993-996). **The port refuses
  every KT_MAGIC skill** (`apps/client/src/world/WorldState.ts:725`): 14 Assist and all 17 Magician skills never start.
- **Hit frame** (`OnMeleeSkill`, `MoverActEvent.cpp:72-164`; `OnMagicSkill`, :475-666): a shot (`EXT_MAGICATKSHOT`,
  `EXT_MAGICSHOT`) calls `ShootSkill`; anything else `DoApplySkill` → `CreateSkillSfx` (`Ctrl.cpp:878-997`, :1662).
  The port's `onMeleeSkill` returns on a shot (`WorldState.ts:760`).
- **`CCtrl::ShootSkill`** (`Ctrl.cpp:1356-1418`): the missile is `dwSfxObj2`; a bow skill starts at the left hand
  (:1374-1383); `CreateShootSfx( dwSfxObj2, pos, caster, 0, target )` (:1386); **the active mover only**: `idSfxHit =
  ++m_idSfxHit`, `nMaxDmgCnt = dwSkillTime / dwPainTime + 1` when the skill has `tmContinuousPain` (Hot Air), `SendSfxID(
  target, id, KT_SKILL ? AF_MELEESKILL : AF_MAGICSKILL, NULL_ID, nMaxDmgCnt )` (:1396-1405); the missile's `m_dwSkill =
  dwID`, `m_nMagicPower = level`, `m_dwSfxHit = dwSfxObj3` (:1408-1410). Its SFX_HIT carries the skill id.
- **`CreateSkillSfx`** (`Ctrl.cpp:878-997`, non-shot hits, every client): with no `dwSfxObj4`: a MELEEATK hit 1.3 m before
  the caster + 1 m, or at the target + 1 m for a yoyo (:942-961); any other EXT at the target + 1 m (:962-970); then
  `dwSfxObj5` at the caster, or `CreateYoyoSkill` (:972-980). With `dwSkillTime > 0` and a `dwSfxObj4`, that lasting effect
  for `dwSkillTime / 1000` s unless the buff is already on (:923-939). The port plays only the MELEEATK case, always 1.3 m
  before the caster (`fx/combatEffects.ts:183-200`).

## 9. Magic casting and the skill missiles

**Numbers:** `OBJMSG_MAGICSKILL` 38, `OBJMSG_MAGICCASTING` 39 (`_Common/MoverMsg.h:107-146`); `OBJSTA_ATK_CASTING1`
0x000b0000, `CASTING2` 0x000c0000, `ATK_MAGICSKILL` 0x000d0000 (:60-62); `SUT_NORMAL` 0, `QUEUESTART` 1, `QUEUEING` 2
(`_Common/Mover.h:134-139`); `AF_MELEESKILL` 0x10, `AF_MAGICSKILL` 0x20 (`_AIInterface/ActionMover.h:31-32`). The cast
motions (`MOP_FIXED`, no weapon set): fire 1063/1064/1065, wind 1066/1067/1068 (`Resource/defineNeuz.h:965-970`).

- **USESKILL's `nCastingTime` is in world-server ticks of 1/15 s** (the server's `SEC1` is 15, `_Common/timer.h:135-138`):
  `(int)(dwCastingTime / 1000 · 15)` less `DST_SPELL_RATE` (`MoverSkill.cpp:255-266`, `MoverAttack.cpp:205-213`); 600 ms
  is 9, 1000 ms is 15. A queue's first skill gets 70 % of the queue's sum (:97-151), a queued one 0, a KT_SKILL 1.
- **`DoUseSkill`'s KT_MAGIC branch** (`MoverSkill.cpp:812-835`): SUT_QUEUESTART → MAGICCASTING (a player only);
  SUT_QUEUEING → MAGICSKILL with motion + 2; else MAGICCASTING. Motion + 2 also when not queued and `nCastingTime == 0`.
  `SendActMsg( msg, motion, focus, nCastingTime, skill )`; begun → `SetActParam( USESKILL, skill, focus )`, `[3]` =
  level. Only −2 makes it fail (:889-892).
- **MAGICCASTING and MAGICSKILL** (`ActionMoverMsg.cpp:774-812`): −2 in an action, with `MVRF_NOATTACK`, or with no valid
  target; on the client any state is cut (`m_dwMotion = −1; ClearState()`); `m_nCastingTime = nParam3 · 4` (60 Hz ticks:
  9 → 36); a positive time → `m_nCount = 0`, CASTING1, else MAGICSKILL; `SetMotion( p1, 1PLAY, SWDFORCE | NO_TRANS |
  FIXED )`, `m_nMotionHitCount = 0`.
- **States** (`ActionMoverState.cpp:686-771`): `m_nCount++` once a tick at the end of `ProcessAction`
  (`ActionMover.cpp:331`), counting CASTING1 too. CASTING1 at its end → motion + 1 looped, CASTING2. CASTING2 when
  `m_nCount >= m_nCastingTime` → motion + 1 once (= + 2), MAGICSKILL. Every tick of CASTING1/2 the caster is tinted cyan:
  `SparkInfo` (0, 2, 2), lerp 1, from `AngleToVectorXZ( angle, −1 )` (:714-724). MAGICSKILL: at the end frame
  `ResetState( ATK_ALL )` → `ClearActParam`; no 65 % cut and no pause; every tick before the hit test, if `(g_nProcessCnt &
  3) == 0 && m_nShootCnt > 0` → `OnMagicSkill( 0 )` and `m_nShootCnt−−` (:740-747); at the hit frame `OnMagicSkill( 0,
  m_nMotionHitCount++ )`, then `m_nShootCnt = nSkillCount − 1` (:749-770; Water Ball only: 1, 3, 6 at levels 1, 10, 20).
  A 600 ms Boomerang leaves about 50 ticks after USESKILL. Neuz never clears `m_nShootCnt` when a state ends.
- **Speed** (`ProcessAniSpeed`, `Mover.cpp:3086-3105`): CASTING1, CASTING2 and MAGICSKILL play at `GetCastingAniSpeed` =
  clamp( 1 + DST_SPELL_RATE / 100, 0.1, 2.0 ) (`MoverAttack.cpp:195-203`); `m_nCount` is not scaled. MELEESKILL plays at 1.
- **What ends a cast:** the shot motion's end; a new USESKILL; death; revival; flying; collecting. **Not** damage, moving
  (`OBJMSG_FORWARD` is −2 while attacking, `ActionMoverMsg.cpp:355-357`) or CLEAR_USESKILL (which comes instead of a
  USESKILL).
- **`OnMagicSkill`** (`MoverActEvent.cpp:475-666`): nothing without the USESKILL act, a target in view, or with Healing on
  a dead target. A shot → `ShootSkill`; else `DoApplySkill` (0 → nothing more). Then the caster's flash: white (2, 2, 2),
  lerp 1, from behind (`AngleToVectorXZ( angle, −1 )`), fading 0.05 a tick from its second tick (`Mover.cpp:3251-3263`).
- **KT_SKILL shots** go through MELEESKILL (speed 1, the 65 % cut, a 4-tick pause after each hit): Guillotine
  (`SklMerOneSpecia`, hit 40 of 63); **Junk Bow and Auto Shot (`SklAcrBow`, 94 frames) have 4 hit frames, so 4 missiles
  and 4 SFX_IDs a use**; Aimed Shot, Silent Shot and Arrow Rain one.
- **`ShootSkill`** (`Ctrl.cpp:1356-1418`, every caster on every client): the missile `dwSfxObj2` from the caster (a bow
  skill from the left-hand bone − 1 m), `CreateShootSfx` adding 1 m (`CreateObj.cpp:508`); `dwSndAttack1` at the caster;
  the active mover only: `++m_idSfxHit`, `nMaxDmgCnt` = `dwSkillTime / dwPainTime + 1` for a skill with
  `tmContinuousPain` (Hot Air, Arrow Rain) else 1, `SendSfxID( target, id, KT_SKILL ? 0x10 : 0x20, NULL_ID, nMaxDmgCnt )`;
  every client: the missile's skill = the skill, its power = the skill level, its hit = `dwSfxObj3`. SFX_HIT carries the
  skill id.

| Class (`_Common/Sfx.cpp`) | Skills | Start | Aim (every tick) | Speed | Arrives | SFX_HIT | Lost target / timeout |
|---|---|---|---|---|---|---|---|
| `CSfxShoot` :3470-3537 | Fire Strike, Wind Cutter, Water Ball, Lightning Palm, Lightning Shock | caster + 1.01 | target + 1 | 0.2 | < 0.2 | the arrival tick; then `CreateSfx( dwSfxObj3 )` at the target, turned by the yaw | flies to the last point, then SFX_CLEAR / none |
| `CSfxItemRangeAtk1` :965-1072 | Aimed Shot, Silent Shot, Arrow Rain, Auto Shot | left hand + 0.01 | target + 1 | 0.7 | < 0.4 | the arrival tick; the `*03` hit | deleted, SFX_CLEAR / 600 |
| `CSfxItemRangeAtk_JunkBow` :1376-1510 | Junk Bow | left hand + 0.01 | target + 1 | 0.7 | < 0.4 | the arrival tick; `JUNKBOW03` | deleted / 600; drawn 3 times (y, y ± 0.5) with 3 trails |
| `CSfxSkillMagSwordWind` :2539-2607 | Sword Wind | caster's feet | target's feet | 0.2 | < 0.4 | the next tick; hit model at the feet | last point / none; yaw 180 − h |
| `CSfxSkillMagStrongWind` :2449-2537 | Strong Wind | caster's feet | target's feet | 0.2 | < 0.2 | the next tick, with angle `(int)h` and power `dwDmgShift · 0.2` = 0.4 (0 and 0 for RANK_SUPER 7 or RANK_MIDBOSS 5); every client pushes the target `AngleToVectorXZ( h, 0.4 )`, ×0.9 a tick, ≈ 3.2 m | none |
| `CSfxSkillMagFireBoomerang`, `IceMissile`, `LightningBall`, `SpikeStone` :2617-2690, :3131-3370 | Boomerang, Ice Missile, Lightning Ball, Spike Stone | caster + 1 | target + 0.3 | 0.2, straight | < 0.2 | the next tick; hit model `*01_01` at target + 0.3, scale 2, following it | none |
| `CSfxShootWave` :3582-3700 | Guillotine | caster + 1.01 | target's feet, y kept at the target's | 0.25 | < 0.4 | the arrival tick; `GUILOTIN02` again at scale 2 at the feet; 8 after-images every 4th tick | none |
| `CSfxSkillMagHotAir` :2714-2800 | Hot Air | not a missile: `HOTAIR01` at the caster's feet and `HOTAIR01_01` at the target's | | | | **once, at its frame 0**, `DamageToTarget( 1, 0, 0, nMaxDmgCnt )`; the later hits are the server's | ends at `dwSkillTime` ticks or with the buff |

- Arrow Rain's hit `CSfxItemRangeAtk1_AllowRain` (:1566-1612) draws 100 falling arrows over ≈ 250 ticks; one SFX_HIT.
- Facing: `Render2` (full yaw, pitch, roll; a mesh part the yaw only) for CSfxShoot, the bow classes, the four straight
  ones and ShootWave (reversed); yaw only for the two winds.
- **Cast effects** (`dwSfxObj`, every skill, `MoverSkill.cpp:993-996`): 274, 276-278 are `CSfxSkillMagFireCasting`, which
  stay where made and draw at that point + 1 m with yaw 180 − the caster's angle; 275 is `CSfxSkillMagWindCasting`, + 0.2
  m, yaw 0 (`CreateObj.cpp:163-176`, `Sfx.cpp:2406-2446`). Every other id is a plain effect on the caster.
- **Every effect id of the 18 shot skills is in `dist/assets`.** The bow skills' arrows, most of Ice Missile and the
  water and earth casts are mesh parts.

## 10. Buffs (`_Common/buff.cpp`, live under `__BUFF_1107`)

| Message (`_Network/MsgHdr.h`) | Body after the object id and type | Neuz |
|---|---|---|
| SETSKILLSTATE 0x004c (:974) | `u32 idTarget, u16 wType, u16 wID, u32 dwLevel` (for `BUFF_ITEM2` 3: `i32` seconds left), `u32 dwTime` (ms, the whole length) | `OnSetSkillState` (`DPClient.cpp:14158-14181`): `prj.GetMover( idTarget )->AddBuff( wType, wID, dwLevel, dwTime )` |
| REMOVESKILLINFULENCE 0x00f8 (:1162) | `u16 wType, u16 wID` | `RemoveBuff` (:14993-15003) |
| REMOVEALLSKILLINFULENCE 0x00f4 (:1156) | none (sent at a death, `Mover.cpp:5385-5388`) | `RemoveCommonBuffs` (:15005-15010) |
| SETDESTPARAM 0x001c (:912) | `i32 dst, i32 adj, i32 chg` | `SetDestParam` (:3271-3281): **how a live buff changes the stats** |
| RESETDESTPARAM 0x001d (:913) | `i32 dst, i32 adj` | `ResetDestParam( dst, adj, 0 )` (:3283-3293) |
| RESETDESTPARAM_SYNC 0x9800 (:1295) | `i32 dst, i32 adj, i32 total` | for `DST_SPEED`: `m_adjParamAry[DST_SPEED] = total` (:3296-3305, `MoverParam.cpp:2727-2750`) |

- RESETBUFFSKILL 0x006f is dead in V15 (its only send is under `#ifndef __BUFF_1107`, `World.cpp:1647-1649`). All the
  messages go to everyone in view of the mover, the mover included. `time_t` is 4 bytes (`_USE_32BIT_TIME_T`,
  `Neuz/StdAfx.h:10`).
- **A live SETSKILLSTATE does not apply the stats:** `AddBuff` sets `Inst` to the arrival time and `Process` applies only
  at `Inst == 0` (buff.cpp:190-194, :712). The stats come as SETDESTPARAM from the server's `ApplyParam` (`Ctrl.cpp:1217-
  1229`); a same-level refresh sends none. **Buffs in an ADD_OBJ are applied by the client** (`Inst` 0 → `Apply` →
  `ApplyParam( …, bSend = FALSE )`, `MoverActEvent.cpp:205-433`) from the level's `dwDestParam1/2`, `nAdjParamVal1/2` and
  `dwChgParamVal1/2`. The ADD_OBJ block (`CBuffMgr::Serialize`, buff.cpp:901-933): `u32 count`, then per buff `u16 wType,
  u16 wId, u32 level, u32 tmTotal` (the time left). The port parses it and drops it (`packages/protocol/src/world/
  addObj.ts:222-237`); the own ADD_OBJ stops before it (`own.ts:41`).
- **Time:** ms; the client checks every 64 frames (`Mover.cpp:3484-3488`) and removes a timed-out buff itself (when the
  level's `dwSkillTime > 0`); its `OnEndSkillState` resets no stats on the client (`MoverSkill.cpp:1068-1115`): the server's
  RESETDESTPARAM does. A refresh at the same level keeps the longer of the two and restarts the clock (buff.cpp:53-57).
- **Effects:** only Protection and Pan Barrier have a lasting `dwSfxObj4`, made for `Total / 1000` s (buff.cpp:201-217).
  The cast prints `TID_GAME_SKILL_SELF` "You use %s." or `TID_GAME_SKILL_MATE` "%s uses %s." (`MoverSkill.cpp:997-1016`).
- **The first-job buffs' params** (`propSkillAdd.csv`, level 1 → 20): Heap Up STA 2→40; Haste ATTACKSPEED 100→500; Quick
  Step SPEED 10→30; Cat's Reflex BLOCK_MELEE 1→12; Accuracy ADJ_HITRATE 1→20; Beef Up STR 1→20; Mental Sign INT 1→20;
  Patience HP_MAX 40→210; Cannon Ball DEX 1→20; Stone Hand CHR_CHANCESTUN 2→12; Prevention AUTOHP; Protection ADJDEF
  1→20; Pan Barrier BLOCK_RANGE 2→40; the masteries SWD/AXE/YOY/BOW_DMG; Blazing Sword, Smite Axe, Impower Weapon; Dark
  Illusion and Counter CHRSTATE. The port's `Dst` (`sim/params.ts:25-62`) lacks SPEED 11, BLOCK_RANGE 8, BLOCK_MELEE 14,
  CHR_CHANCESTUN 57, AUTOHP 58, CHRSTATE 64; `getSpeed` ignores DST_SPEED (`sim/moverRules.ts:209-213`; the C++ is
  `fSrc · ( 1 + adj / 100 )`, `MoverParam.cpp:3293-3311`).
- **The icons.** The own skill buffs are drawn by `CWndBuffStatus` (APP_BUFF_STATUS, `Resource/resdata.inc:6113`;
  `_Interface/WndField.cpp:18467-19106`): no frame; first at ( screen width / 3, height / 3 ); 28 slots on a 34 px pitch, 7
  a row (238 × 136); a double click turns it vertical; icons in ascending skill id, the skill's `szIcon` at 1.2 × (38.4
  px, overlapping), ARGB(192, 255, 255, 255), or (a, 255, 120, 255) for a harmful one; under 20 000 ms left the alpha moves
  ±6 a frame between 64 and 192; the seconds left as `%d` at ( x + 2, y + 22 ), white with a black shadow; the tooltip:
  the name and `"   Lvl %d"` in bold 0xff2fbe6d, the description, a line per param, the time left as `%.2d:%.2d`.
  `CWndWorld::RenderBuff` skips skill buffs (`WndWorld.cpp:10708-10711`). **The target's buffs** are drawn under the
  target bar (`RenderMoverBuff`, :10836-11140): 24 × 24 px from ( ( W − 200 ) / 2 − 20 + 24, 44 ), 8 a row, alpha 32↔192
  under 20 s. **No packet cancels a buff in V15.**

## 11. The skill window after a change (`_Interface/WndField.cpp`)

- `InitItem` (:6736-6977), per job (:6767-6908): the section titles `WIDC_STATIC2` the Vagrant's name, `WIDC_STATIC3` the
  job's name, `WIDC_STATIC6` empty; the expert panel picture from `DIR_THEME`: Mercenary `Back_Me.TGA` (:6803), Assist
  `Back_As.TGA` (:6835), Magician `Back_Ma.TGA` (:6867), Acrobat `Back_Acr.tga` (:6875); the icons (`szIcon`, :7420-7437);
  no skill chosen.
- The panel is painted into the skin at `WIDC_STATIC5` (6, 168)-(240, 312) (`Resource/resdata.inc:6711`) + 2 px down,
  while the expert section is open (:8395-8418).
- **Places** (`GetSkillPoint`, :6978-7393): per skill `nRectX, nRectY` — Mercenary :7196-7210, Assist :7231-7247,
  Magician :7268-7284, Acrobat :7316-7331; drawn at `( nRectX − 3, nRectY + 76 )`, 27 × 27 (:7140-7159, :7375-7392,
  :7821-7823). Examples: Splmash (31, 185), Protection (31, 237), Healing (15, 211), Mental Strike (31, 172), Pulling
  (31, 173), Arrow Rain (181, 276). An expert level costs 2 points (`m_dwExpertSP`, `Project.cpp:5143-5153`).
- The port places only the Vagrant's three (`hud/skillWindow.ts:143-147`; the phone layout by `skillId − 1`, :341-343;
  the titles fixed, :458-463) and never reloads on a job change (:430-431). The plan, the costs and the tooltip need no
  change (`skills/skillRules.ts`).

## 12. What the browser has today, and what M2 adds

| Area | There | Missing |
|---|---|---|
| Protocol | MELEE_ATTACK, DAMAGE, USESKILL, CREATESFXOBJ readers; `encodeMeleeAttack` | readers for 0x00a7, 0x00a8, 0x00e1, 0x00e2, 0x00aa and the buff messages (§10); MAGIC_ATTACK, RANGE_ATTACK, SFX_ID, SFX_HIT, SFX_CLEAR senders |
| Own state | `job` and `jobProp` (read-only), `skills`, `equipped`, UPDATE_ITEM | the job change; the arrow slot (`Parts` has no `BULLET`); `equipped.armour` is not recomputed when UPDATE_ITEM removes a stack |
| Catalog | `WebItemProp.sfxHit` (`dwSfxObj3`), `kind2`, `attackRange`, `weaponType` | `dwSfxObj2` (the missile) and `dwLinkKindBullet`; the skills' `dwSfxObj`, `dwSfxObj2`, `dwSfxObj4`, `dwSfxObj5`, `dwLinkKindBullet`, `dwAtkStyle` and per-level cast and skill times |
| Action mover | ATK1-4, MELEESKILL, the weapon motion sets | ATK_MAGIC1, ATK_RANGE1, the magic casting states; `m_qMagicAtkMsg`; the anim speed in the new states |
| Attack loop | melee, the wand's auto-attack refusals, the 500 ms focus timer | the charge, the let-go and automatic shots, the bow's level-0 shots, the two commands and arrivals, `IsBullet`, the yoyo's reach, sight test and combo stop |
| Effects | `CSfx`, `CSfxGenNormalDmg01`, `CSfxFixed`; bill, particle and custom-mesh parts | missiles (`fx/EffectManager.ts:31`), the full rotation in flight, **mesh parts** (`packages/scene/src/effects/EffectModel.ts:26-29`: the arrow `sfx_middlearrow_01` is one mesh part, `models/obj_middlearrow_01.glb`), the thrown yoyo, the arrow's trail |
| HUD | the message lines, the target bar | the charge gauge and its five pictures; the skill window for the four jobs; `Back_*` panels |
| Assets present | `effects/sfx_firwand01.json`, `sfx_firwandair01`, `sfx_hitwand01`, `sfx_middlearrow_01` (+ `models/obj_middlearrow_01.glb`), `sfx_hitbow01`, `textures/etc_tail2.bmp.ktx2` | `GauMagCharge*.TGA`, `Back_Me/As/Ma/Acr.tga` (theme pictures to convert) |
