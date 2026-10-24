# Piece 4 research: combat (C++ facts for the browser client)

Scope: a Vagrant (level 1-15) in Flaris: select, melee auto-attack, damage numbers, monsters hitting back, bars, target bar,
death, lodestar revive, EXP and level-up. Skills are out of scope except where code paths are shared.

Paths: `Src` = `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source`; `Res` = `...\Blouflash VS22 V15\Resource`;
`Cli` = `...\Blouflash VS22 V15\Client`; `Web` = `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece3-world`.
Unprefixed `file:line` is relative to `Src`. Source files are CP949; Korean comments were read through `iconv`.
"Neuz" = the Windows client, "WS" = WORLDSERVER. All integers are little-endian; `CAr` writes `DWORD/OBJID` as u32,
`WORD` as u16, `BYTE` as u8, `int/long/LONG` as i32, `EXPINTEGER` (`__int64`) as i64, `FLOAT` as f32,
`D3DXVECTOR3` as 3 x f32 (`_Common/data.h:366`).

**Headline findings (read these first)**

1. Reviving at the lodestar in the same world and same layer is **SNAPSHOTTYPE_SETPOS (0x0010)**, not REPLACE
   (`_Common/World.cpp:1589-1604`). Flaris's world script says `revival 0 ""` (`Res/World/WdMadrigal/WdMadrigal.wld`), so
   `GetNearRevivalPos` looks only inside the same world (`DPSrvr.cpp:11412-11413`, `_Common/worldmng.cpp:627-662`), and
   `nRevivalLayer == nDefaultLayer == 0` (`WORLDSERVER/layeredlinkmap.h:7-8`). Piece 3 already reads SETPOS.
2. The server never checks attack range, facing or cooldown for a player's melee: it only checks state, target validity,
   steal rules and the `fAttackSpeed` float (`DPSrvr.cpp:2019-2066`). Damage is decided on the **server's own animation
   hit frame**, so the number arrives roughly half a second after MELEE_ATTACK.
3. A kill sends **no DAMAGE** for the lethal blow: EXP/level messages, then MOVERDEATH, then SETPOINTPARAM(HP 0)
   (`AttackArbiter.cpp:228-262`). Neuz shows the last known HP as the final number (`DPClient.cpp:2006-2007`).
4. Level 1-20 characters lose no EXP on death and no EXP box is made (`Res/DiePenalty.inc` DECEXP 20 -> 0;
   `DPSrvr.cpp:7988-8009`). After the lodestar the server sets HP, MP and FP to 20 percent of max
   (`DPSrvr.cpp:11333-11369`).
5. Every client message the server needs for combat is small: PLAYERSETDESTOBJ, MELEE_ATTACK (with the attack-speed float),
   SETTARGET, REVIVAL_TO_LODESTAR (no fields), and optionally GETDESTOBJ.

---

## 0. Which preprocessor branch is live

`__VER` is 15 (`Neuz/VersionCommon.h:4`, `WORLDSERVER/VersionCommon.h:4`); `__MAINSERVER` is defined first
(`:3`). Every `#if __VER >= N` with N <= 15 is live whatever macro name follows in the comment. Sections in
`Neuz/VersionCommon.h`: INTERNAL 261-405, TEST 406-470, MAIN 471-482; in `WORLDSERVER/VersionCommon.h`: INTERNAL 238-338,
TEST 339-400, MAIN 401-423. Neither MAIN section adds a combat flag, except WS `__OPT_MEM_0811` (`WORLDSERVER/VersionCommon.h:418`).

| Flag | Live? | Effect on combat | Where |
|---|---|---|---|
| `__HACK_1023` | yes, top (Neuz:93, WS:102) | MELEE_ATTACK carries a trailing `FLOAT fVal`; server compares it with the weapon's `fAttackSpeed` | `Neuz/DPClient.cpp:9818-9831`, `DPSrvr.cpp:2024-2047` |
| `__BS_ADJUST_SYNC` | Neuz only (Neuz:246) | keyboard movement clears `m_bLButtonDown`; a dest-object change to a player first sends PLAYERBEHAVIOR | `_Interface/WndWorldControlPlayer.cpp:151-155`, `_Common/MoverMsg.cpp:55-61` |
| `__X15` | WS only (WS:16) | server runs 4 action steps (`ProcessAction` + `FrameMove`) per `CMover::Process` | `_Common/Mover.cpp:3813-3870` |
| `__TRAFIC_1222` | WS only (WS:30) | server ignores PLAYERSETDESTOBJ for the target it already follows | `DPSrvr.cpp:12808-12811` |
| `__OPT_MEM_0811` | WS MAIN (WS:418) | `m_qMeleeAtkMsg.AddTail( new ACTMSG(...) )` | `DPSrvr.cpp:2055-2059` |
| `__S1108_BACK_END_SYSTEM` | yes (Neuz:19, WS:18) | monster max HP and EXP use the per-monster rate fields | `_Common/MoverParam.cpp:2879-2880`, `_Common/Mover.cpp:6003-6007` |
| `__BS_DEATH_ACTION` | **no**: only in Neuz INTERNAL (:400) and TEST (:464) | the random fly-away death branch is not compiled; death is `OBJSTA_DEAD` + `MTI_DIE1` | `_AIInterface/ActionMoverMsg.cpp:909-951` (dead code), 953-967 (live) |
| `__CSC_UPDATE_WORLD3D` | no (commented, Neuz:343) | object sort uses the older `ObjSortFarToNear2` branch | `_Common/World3D.cpp:365-383` |
| `__Y_INTERFACE_VER3` | no | `ControlGround` uses `m_bLButtonDown` | `_Interface/WndWorldControlPlayer.cpp:290-301` |
| `__BS_FIXED_KNOCKBACK` | yes (Neuz:223) | fly-down knockback `m_vDelta.y = 0.04f` | `_AIInterface/ActionMoverState.cpp:492-496` |
| `__SPEED_SYNC_0108`, `__JEFF_11_4` | yes | not combat-critical | |

---

## 1. Selecting a target in Neuz

### 1.1 Highlight, pick and select

- Every frame `CWndWorld::OnDraw` calls `HighlightObj( GetMousePoint() )` unless the player is dead
  (`_Interface/WndWorld.cpp:1084-1087`). `HighlightObj` (:6422-6450) runs `PickObj` and stores the result in
  `CObj::m_pObjHighlight`; for an item it also shows a tooltip.
- `OnLButtonDown` (:6712-7113), in order (touch has no hover, so the browser should pick at the tap point):
  - returns early when `m_bViewMap`, player dead, vendor, `DONMOVE_MODE`, `CHS_SETSTONE`, minigame windows, web box
    (:6714-6802); returns if the right button went down less than 200 ms ago (:6806);
  - `SetCapture()`, remembers `pSelectOld = pWorld->GetObjFocus()` and `pSelectObj = CObj::m_pObjHighlight` (:6844-6847);
  - **`g_pPlayer->ClearCmd()` on every left-button press** (:6854): it only clears `m_oaCmd`/`m_nCParam`
    (`_Common/Mover.h:1770-1775`), so a pending melee command is dropped; movement toward the object continues until arrival
    (then `ProcessMoveArrival`'s default branch stops it, `_Common/MoverMove.cpp:256-259`);
  - if the highlight is a mover (:6855): with the right button down or in mouse-look mode (`m_nMouseMode == 1`) nothing is
    selected (:6858-6866). Otherwise, not flying: `pSelectObj = SelectObj( point )` (:6886); a mover that is not an NPC or is
    not peaceful becomes `m_pRenderTargetObj` (:6888-6891). Selecting the **already focused** mover again: `m_bAutoAttack =
    FALSE`, `m_pNextTargetObj = NULL`, then `m_bAutoAttack = TRUE` if `g_Option.m_bAutoAttack` (default TRUE,
    `_Common/HwOption.cpp:246`) and the weapon is not a wand (:6892-6910). Selecting a different mover while auto-attacking
    stores it in `m_pNextTargetObj` and leaves the focus alone (:6912-6915); otherwise `m_bAutoAttack = FALSE` (:6916-6917);
  - if the highlight is not a mover: `pSelectObj = SelectObj( point )`, `m_bAutoAttack = FALSE`, `m_pNextTargetObj = NULL`,
    `m_pRenderTargetObj = NULL` (:6922-6929). A click on bare ground does **not** clear the focus (`SelectObj` only calls
    `SetObjFocus` for a non-null pick, :6361-6383);
  - `m_dwNextSkill = NEXTSKILL_NONE`; ends the skill queue; clears `MVRF_SKILL` (:6976-6987);
  - `pSelectObj == NULL` -> `m_bFreeMove = TRUE` (click to walk, :6989-6997). A mover: peaceful NPCs open their menu
    (`ShowMoverMenu`, :7065-7086, Piece 5); a player's shop opens on click; then `m_bSelectTarget = TRUE`; if the target
    changed `m_timerFocusAttack.Reset()` (:7090-7096); `m_dwPowerTick = GetTickCount()`; and `ControlPlayer( WM_LBUTTONDOWN )`
    (:7112).
- `SelectObj` (:6353-6386): Tab held -> NPC-only; a dead mover in the guild-war world is refused (:6367-6371); a mover with
  `TRANSPARENT_MODE` is refused (:6372-6375); then `pWorld->SetObjFocus( pObj )` unless `m_bAutoAttack` (VER >= 11, :6378-6383).
  `PickObj` (:6299-6351) additionally refuses `GCWAR_NOT_CLICK_MODE` movers (:6337-6341).
- `OnLButtonDblClk` (:7239-7263): `ControlPlayer( WM_LBUTTONDBLCLK )`, then if the focus equals the highlight and the weapon is
  not a wand, `m_bAutoAttack = TRUE` (:7248-7260). A double click is therefore an alternative to the "second click" (which
  already auto-attacks).
- Tab key selects from `CWorld::m_amvrSelect` (:7658-7685), not needed for touch.

### 1.2 What is sent on select

`CWorld::SetObjFocus( pObj, bSend = TRUE )` (`_Common/World.cpp:253-359`) sends **PACKETTYPE_SETTARGET** only:

| When | Packet | Source |
|---|---|---|
| a live mover was focused and focus moves elsewhere | `SendSetTarget( oldId, 1 )` | World.cpp:310-315 |
| new focus is a mover | `SendSetTarget( newId, 2 )` | World.cpp:319-329 |
| focus cleared (`pObj == NULL`) | `SendSetTarget( NULL_ID, 2 )` and `m_pNextTargetObj`/`m_pRenderTargetObj` cleared | World.cpp:331-343 |

Packet `PACKETTYPE_SETTARGET` = `0x00ff0023` (`_Network/MsgHdr.h:151`), written by `CDPClient::SendSetTarget`
(`Neuz/DPClient.cpp:9886-9891`) after the usual client header (`BEFORESENDSOLE( ar, type, DPID_UNKNOWN )`: u32 DPID_UNKNOWN,
u32 type, as `Web/packages/protocol/src/messages/world.ts:7-12` already builds):

| Field | Type | Notes |
|---|---|---|
| idTarget | u32 | the mover's object ID, or `NULL_ID` |
| bClear | u8 | 2 = "I focus this" (neuz sends only 1 and 2 for plain focus) |

Server `CDPSrvr::OnSetTarget` (`DPSrvr.cpp:2183-2223`): `bClear == 2` -> `pUser->m_idSetTarget = idTarget`; `bClear < 2` adds/removes
the user as the target's `m_idTargeter` (only if it was this user, :2194-2220). Nothing is answered. Game masters also send
`SendMoverFocus` when they focus a player (`World.cpp:350-357`). The steal rule uses `m_idTargeter`, which the server actually
sets at attack start (`CMover::SetJJim`, `_Common/Mover.cpp:8111-8131`, called from `ActionMoverMsg.cpp:683`).

### 1.3 `PickObject_Fast` (`_Common/World3D.cpp:2655-2733`): the exact rule

Called by `CWndWorld::PickObj` with filter `OF_MOVER|OF_ITEM|OF_CTRL`, exception object = the own mover, `bBoundBox = TRUE`
(`WndWorld.cpp:6306-6307`).

1. Ray: `GetPickRay` (`_Common/vutil.cpp:577-595`): `v.x = ((2x/W)-1)/proj._11`, `v.y = -((2y/H)-1)/proj._22`, `v.z = 1`,
   transformed by the inverse view matrix; origin = camera position; direction is **one unit along the view axis, not
   normalized**.
2. Candidates: only `m_aobjCull[0 .. m_nObjCullSize)`, the objects that survived this frame's cull
   (`World3D.cpp:640-743`): LOD distance cut `fDistant[g_Option.m_nObjectDistant][model->m_dwDistant]` =
   {400,200,70,400}/{250,150,60,400}/{150,100,40,400} (:672-682, `m_bViewLODObj` TRUE by default, `World.cpp:147`) and the
   frustum test `CullObject` (:713-723). `m_fDistCamera` = 3D distance camera -> object position (:671).
3. The array is sorted far to near by `m_fDistCamera` with `ObjSortFarToNear2` (:758, :365-383, non-CSC branch :377-382).
4. Filter in the first loop (:2683-2714): not culled; not the exception object; type allowed by the filter; for movers: a
   **player is skipped only if `bOnlyNPC`**; a **non-player that `IsDie()` is skipped** (`IsDie` = state has `OBJSTA_DIE_ALL`
   or `m_nHitPoint == 0`, `_Common/Mover.h:1221`); a pet owned by someone else is skipped (:2703-2707).
5. Second loop (:2717-2731): from the **last (nearest) to the first**, `pObj->Pick( orig, dir, &hit, &dist, bAABB )` where
   `bAABB = bBoundBox` (false only for `OT_CTRL`, which get the full mesh test). The **first object whose test passes with
   `dist < m_fFarPlane` is returned at once**. It is the nearest object *by origin distance* whose box the ray hits, not
   the one with the nearest hit point.
6. `CObj::Pick` (`_Common/Obj.cpp:752-762`) with `bOnlyBoundBox` TRUE returns `m_pModel->IntersectBB(...)`, which tests the
   **12 triangles of the model's bounding box** (`_Common/Model.cpp:104-144`, index table :119-127) after transforming the 8
   corners by `GetMatrixWorld()` (scale, rotation, position; so an oriented, scaled box). The box corners come from
   `SetBB( vMin, vMax )` (`_Common/xUtil3D.cpp:26-59`); for an animated model `vMin/vMax` is the union of the `m_vBBMin/m_vBBMax`
   of every loaded part (`_Common/ModelObject.cpp:735-744`; the code comment says a human holding a spear includes the spear).
   `D3DXIntersectTri` is two-sided (`vutil.cpp:608-619`).
7. After the box pick, `CWndWorld::PickObj` re-picks with the precise mesh test (`CWorld::PickObject`, `World3D.cpp:2585-2653`)
   for movers with `dwClass` in `RANK_MIDBOSS, RANK_SUPER, RANK_BOSS, RANK_MATERIAL` (`WndWorld.cpp:6317-6329`). Basic monsters
   (RANK_LOW/NORMAL/CAPTAIN) stay on the box test.
8. Existing browser picking (`Web/apps/client/src/world/render/picking.ts`, `MoverViews.nearestHit`) ray-casts the drawn meshes and
   returns only a distance, not an ID: a different rule from Neuz's.

### 1.4 Deselecting

- Target dies by the player's hand: `OnMoverDeath` -> `SetObjFocus( NULL )` and `SetLastTarget( NULL_ID )`; a queued
  `m_pNextTargetObj` is then focused through `SetNextTarget()`, which sets `m_bAutoAttack = FALSE` (`Neuz/DPClient.cpp:1956-1972`,
  `WndWorld.cpp:6389-6419`).
- Target removed (DEL_OBJ, i.e. out of view or dead and gone): `CWorld::Process` clears the focus (`World.cpp:883-893`);
  `OnRemoveObj` also clears `m_pSelectRenderObj` (`DPClient.cpp:1663-1668`).
- Target already dead when attack is tried: `IsAttackAbleNPC` -> `SetObjFocus( NULL )` (`_Common/Mover.cpp:6580-6589`).
- The focus is also cleared when the target becomes `TRANSPARENT_MODE` (`WndWorld.cpp:1052-1056`), by `SETPOS` of the own
  mover (`DPClient.cpp:2236`), and by `SNAPSHOTTYPE_CLEAR_TARGET (0x9500)` (`DPClient.cpp:15208-15211`).

---

## 2. Starting and continuing a melee attack in Neuz

### 2.1 What starts it

`CWndWorld::Process` (`_Interface/WndWorld.cpp:8500-8561`), for a player not flying, no queued skill:

```
if( (m_bLButtonDown || m_bAutoAttack) && cmd != OBJACT_USESKILL )        // :8515
    if( m_bAutoAttack || (m_bSelectTarget && m_timerFocusAttack.IsTimeOut()) )   // :8517
        if( pObj = focus ) and type is CTRL/MOVER/ITEM and g_pPlayer->IsAttackAble( pObj )
              and !(m_dwReqFlag & REQ_USESKILL)   -> UseFocusObj( pObj )          // :8519-8527
```

`m_timerFocusAttack` is set to 500 ms at construction (`WndWorld.cpp:571`) and reset when the target changes (:7091-7094), so
**pressing and holding on a newly selected monster attacks after 500 ms; a quick tap only selects; the next tap on the
selected monster (or a double click) turns on `m_bAutoAttack`**. Moving the cursor away does not matter.

`UseFocusObj` (:6197-6266) returns FALSE (no attack) when flying, jumping, `IsActAttack()` (state in `OBJSTA_ATK_ALL`), dead,
target invalid, target `OT_OBJ`, `DONMOVE_MODE`, `CHS_SETSTONE`. A sitting player is only stood up with `SendMotion( OBJMSG_STANDUP )`
(:6236-6246). Otherwise for a melee weapon: `g_pPlayer->CMD_SetMeleeAttack( pFocusObj->GetId() )` (:6256). (Bow: `CMD_SetRangeAttack`,
wand: handled at button-up; both out of scope.)

`IsAttackAble( pObj )` for a non-player mover calls `IsAttackAbleNPC` (`Mover.cpp:6469-6570`, :6572-6626): refuses a dead one,
`bKillable == 0` (propMover `bKillable`), `IsPeaceful()` (`m_dwBelligerence == BELLI_PEACEFUL`, `Mover.h:1091`), a guard of the
same disposition, flying/non-flying mismatch. Whenever it refuses, `m_bAutoAttack = FALSE` (:6564-6567).

### 2.2 Messages sent

`CMover::CMD_SetMeleeAttack( idTarget, fRange = 0 )` (`_Common/MoverMsg.cpp:427-454`): returns if the hand item is `IK2_TOOLS`,
`IsActAttack()` or `IsDie()`; for yoyo `fRange = GetAttackRange( dwAttackRange )`; on the client: `ClearActParam(); SetDestObj( idTarget, fRange );
SetCmd( OBJACT_MELEE_ATTACK, idTarget )`.

**PACKETTYPE_PLAYERSETDESTOBJ = `0xffffff07`** (`MsgHdr.h:266`), from `CMover::SetDestObj` (`MoverMsg.cpp:47-84`): when `bSend`
(the client default is TRUE, `Mover.h:1487-1489`), `IsActiveMover()` and `m_idDest != objid`: first `SendPlayerBehavior()` if the old
dest was a player (`__BS_ADJUST_SYNC`, :55-61), then `SendPlayerDestObj( objid, fRange )` (`DPClient.cpp:10923-10932`), `m_nCorr = -1`.

| Field | Type | Notes |
|---|---|---|
| objid | u32 | target object ID |
| fRange | f32 | 0.0 for melee |

**PACKETTYPE_MELEE_ATTACK = `0x00ff0010`** (`MsgHdr.h:135`), from `CMover::DoAttackMelee` (`_Common/MoverSkill.cpp:3436-3488`, lines
3455-3467) and, for combo steps, from `_ProcessStateAttack` (`_AIInterface/ActionMoverState.cpp:831-841`), via
`CDPClient::SendMeleeAttack` (`DPClient.cpp:9819-9831`):

| Field | Type | Value Neuz sends |
|---|---|---|
| dwAtkMsg | u32 | `OBJMSG_ATK1..ATK4` = 29, 30, 31, 32 (enum count from `OBJMSG_NONE` = 0, `_Common/MoverMsg.h:105-166`) |
| objid | u32 | target ID |
| nParam2 | i32 | `MAKELONG( 0, 0 )` = 0 |
| nParam3 | i32 | `MAKELONG( 0, (WORD)nError )` = `nError << 16`; `nError` is what the local `SendActMsg( ATKn )` returned, `m_dwAtkFlags = AF_GENERIC` = 1 on the client (`ActionMoverMsg.cpp:698-702`), so **0x00010000**. The server ignores the high word: it uses the low word, 0, and rolls hit/miss itself (:689-697) |
| fVal | f32 | `GetActiveHandItemProp()->fAttackSpeed`, or 0.0 if there is no prop. The server rejects the attack when its own weapon's `fAttackSpeed` differs (`DPSrvr.cpp:2039-2047`); a bare hand is `II_WEA_HAN_HAND`, `fAttackSpeed` 0.07 (`Res/propItem.txt`, `ItemProp::fAttackSpeed` read with `scanner.GetFloat()`, `_Common/ProjectCmn.cpp:381`). Send the f32 of the same text. |

Order within a chain: the swing starts locally first (`SendActMsg`), and the packet is sent only if `nError > 0` (`MoverSkill.cpp:3455-3460`).
`DoAttackMelee` begins with `SendActMsg( OBJMSG_STOP )` (:3438), which runs `pMover->ClearDest()` (`ActionMoverMsg.cpp:135-152`), so `m_idDest`
is NULL_ID again and the **next `CMD_SetMeleeAttack` re-sends PLAYERSETDESTOBJ** (derived from code, not observed on the wire). A
swing cycle in range is therefore: PLAYERSETDESTOBJ (id, 0.0) on one tick, MELEE_ATTACK(ATK1) when the mover is in range (`ProcessMoveArrival`);
for the next combo steps only MELEE_ATTACK (ATK2/3/4) at the end of the previous animation; then PLAYERSETDESTOBJ again for the next ATK1.

There is no explicit acknowledgement. No range, facing or timing is sent. The browser also sends nothing for the walk toward the
monster: the **server simulates the approach** from PLAYERSETDESTOBJ (`DPSrvr.cpp:12812-12816`: `DefaultSet`, `BehaviorActionForceSet`,
`SetDestObj`, then `AddMoverSetDestObj` to everyone else). When the server's own sim arrives first it calls
`AddQueryGetDestObj( NULL_ID )` (`_Common/MoverMove.cpp:336-339`); Neuz answers with PACKETTYPE_GETDESTOBJ if it still has a dest object
(`DPClient.cpp:8985-8991`; table in section 7), and the server re-applies `SetDestObj` (`DPSrvr.cpp:11604-11611`).

### 2.3 Range and approach

- Client `CMover::ProcessMove` (`_Common/MoverMove.cpp:344-450`) while a dest object is set and the mover is not in an attack state:
  target position `vDestPos`; `pObj->IsRangeObj( this, m_fArrivalRange )` (ground case :421); if in range `ProcessMoveArrival( pObj )`;
  else `SendActMsg( OBJMSG_TURNMOVE, GetDegree( vDestPos, vPos ), GetDegreeX(...) )` (:445-446).
- `CObj::IsRangeObj( pOther, fRange )` (`_Common/Obj.cpp:794-817`) with `this` = the **target**, `pOther` = the walking mover:
  `fRange == 0 -> 1.0`; `R = 0.8 * GetRadius(this) + 0.8 * GetRadius(pOther) + fRange`; in range when `|posThis - posOther|^2 < R^2` (3D distance,
  `Vec3LengthSq` including y). `GetRadius()` = `(|maxX-minX| + |maxY-minY| + |maxZ-minZ|) / 6 * m_vScale.x` from the model's `m_vMin/m_vMax`
  (`Obj.cpp:781-791`). `Web/apps/client/src/world/sim/moverRules.ts:29-30, 435-443` already implements this with an optional `radius` (0 when unknown).
- On arrival the client dispatches on `m_oaCmd` (`MoverMove.cpp:76-205`): `OBJACT_MELEE_ATTACK` -> (yoyo: line-of-sight test) -> `DoAttackMelee( pObj )` (:203),
  then `SetCmd( OBJACT_NONE )` (:262).
- No distance test on the server's melee path, none against the target at hit time for player-vs-monster; for monster-vs-player the server skips
  the damage if the player is more than 10 m away (`_Common/MoverActEvent.cpp:1651-1654`).
- Monster melee reach on the server: `pMover->IsRangeObj( pTarget, GetAttackRange( dwAtkRange ) )` (`_AIInterface/AIMonster.cpp:1375-1376`);
  `GetAttackRange`: AR_SHORT 2.0, AR_LONG 3.0, AR_FAR 4.0, AR_RANGE 10.0, AR_WAND 15.0, AR_HRANGE 6.0 (`_Common/MoverMsg.cpp:140-166`,
  constants `Res/defineAttribute.h:85-91`). The low-level monsters' attack items `II_WEA_MOB_*_ATK1` are `IK3_VIRTUAL`, `AR_SHORT`, `dwUseMotion MTI_ATK1`
  (`Res/propItem.txt`).

### 2.4 Attack motions and combo order

`ProcessActMsg1` ATK1..ATK4 (`_AIInterface/ActionMoverMsg.cpp:596-704`), for the ground case:

- returns 0 `IsAction()`; -2 `MVRF_NOATTACK` or `NO_ATTACK_MODE`; -2 if the *own* weapon is a wand or bow (server always, client only for the active mover);
  -1 target invalid or dead; -2 steal (server only, :629-635); 0 already in an attack state (queued by the callers); stand up if sitting; if state is `OBJSTA_DMG` the damage state is
  cleared, any other damage state returns -3 (:640-644); sets `OBJSTAF_COMBAT` through `SendActMsg( OBJMSG_MODE_COMBAT )` (:645-646, handler :1010-1020);
  `OBJMSG_STOP_TURN` and `OBJMSG_STAND`;
- players: `pMover->m_fAniSpeed = GetAttackSpeed()` (:660-661);
- `SetState( OBJSTA_ATK_ALL, OBJSTA_ATKn )` (`OBJSTA_ATK1..4` = 0x00010000..0x00040000, `MoverMsg.h:48-51`) and `SetMotion( MTI_ATKn, ANILOOP_1PLAY, MOP_SWDFORCE | MOP_NO_TRANS )` (:663-681)
  with `MTI_ATK1..4` = 23..26 (`Res/defineNeuz.h:375-378`);
- `SetAngle( GetDegree( target, self ) )` (:682), `pHitObj->SetJJim( pMover )` (:683), `m_nAtkCnt = 1` (:685);
- result: server rolls `GetAttackResult` -> `AF_GENERIC` or `AF_MISS` (:690-697); client always `AF_GENERIC` (:699).

**Combo order** (players only): in `_ProcessStateAttack`, when `pModel->IsEndFrame()` (`ActionMoverState.cpp:809`) the attack state resets
(:814) and, **for the active mover** if `GetLevel() >= nReqLevel` and (`m_dwCtrlMsg & CTRLMSG_LDOWN` or `m_bAutoAttack`) and the target is still valid and no skill is queued
(:816-841), the next ATK is started and sent:

| Leaving | needs `GetLevel() >=` | Next | Source |
|---|---|---|---|
| ATK1 | 2 | ATK2 | :804 |
| ATK2 | 8 | ATK3 | :805 |
| ATK3 | 12 | ATK4 | :806 |
| ATK4 | 999 (never) | none; the chain restarts at ATK1 through a new `CMD_SetMeleeAttack` | :807 |

For levels 1-15: Lv 1 swings ATK1 only; Lv 2-7 ATK1, ATK2; Lv 8-11 ATK1-3; Lv 12-15 ATK1-4, then ATK1 again (the player tests `GetLevel()`, not the job level).
`LDOWN` is set each frame from `m_bLButtonDown` (`WndWorldControlPlayer.cpp:237-238`).

**Motion lookup** (`CMover::SetMotion`, `_Common/Mover.cpp:4817-4977`): when `OBJSTAF_COMBAT` is set and the option has no `MOP_FIXED` the motion ID gets a weapon offset for a player or the MI_MALE/MI_FEMALE-class bodies (:4822-4902):
bare hand/default +200; one-hand sword +200 (two-hand +800); axe +500 (two-hand +800); yoyo +MTI_STAND_14; bow +MTI_STAND_13; wand +MTI_STAND_02 (Psykeeper MTI_STAND_11);
cheerstick +400; staff +MTI_STAND_05; knuckle hammer +700; dual weapons +900. Monsters (`IK3_VIRTUAL`) get no offset. The file is then chosen from `mdlDyna.inc` by that ID
(`prj.m_modelMng.LoadMotion`, :4918). Example, MI_MALE: `MTI_ATK1_01` (223) -> `AtkAtk1-01` (`Res/mdlDyna.inc`, male entry), file `Cli/Model/Mvr_male_AtkAtk1-01.ani`.
**`OBJSTAF_COMBAT` (0x01) is never cleared by combat itself**; only unequipping a weapon sends `MODE_PEACE` (`_Common/MoverEquip.cpp:1794-1798`), so after the first swing a player's stand/walk/run motions
use the weapon offset (`ActionMoverState.cpp:109-119, 216-220`, which actually call plain `SetMotion` and rely on the offset). The flag travels in the MOVERMOVED/BEHAVIOR `stateFlag`
(Piece 3 already reads `stateFlag`; `sim/constants.ts` has no COMBAT bit yet).

### 2.5 Hit frame, swing length, attack speed

- Per 60 Hz tick `CModel::FrameMove` does `m_fFrameCurrent += m_fPerSlerp * fSpeed` (`_Common/Model.cpp:13-55`), `fSpeed = m_fAniSpeed` (`Mover.cpp:3862`); a non-looping
  motion sets `m_bEndFrame` when `m_fFrameCurrent > frameCount - 1`. `perSlerp` is "frames advanced per 60 Hz tick" (`Web/packages/formats/src/model/ani.ts:6`).
  The server does the same, 4 steps per `Process` (`__X15`), 15 `Process` per second (`_Common/timer.h:133-141`).
- The hit moment: `pModel->IsAttrHit()` (`_AIInterface/ActionMoverState.cpp:1080`) = `CMotion::IsAttrHit( oldFrame, curFrame )`
  (`_Common/Bone.h:162-169`): the attribute of frame `(int)curFrame` has `MA_HIT` and `old < attr.m_fFrame <= cur`. On a hit the mover sets `MVRF_HITCONT` and calls `OnAttackMelee` (:1082-1089).
- Measured with the browser's own `.ani` reader (`Web/packages/formats/src/model/ani.ts`) on `Cli/Model`, all `perSlerp` 0.5 (frame index 0-based):

| Motion file | frames | hit frame | sound frame |
|---|---|---|---|
| `Mvr_male_AtkAtk1-01` / `Atk2-01` / `Atk3-01` / `Atk4-01` (MTI 223-226 on the male body) | 17 each | 12 / 11 / 10 / 8 | 8 / 7 / 7 / 3 |
| `Mvr_female_AtkAtk1-01` | 17 | 12 | 8 |
| `Mvr_male_AtkAtk1-02` (MTI_ATK1_02, 323) | 36 | 20 | 15 |
| `Mvr_male_AtkDmg1-01` / `AtkDmg2-01` (damaged) | 26 / 26 | none | |
| `Mvr_male_AtkDie1-01` | 46 | none | |
| `Mvr_male_AtkStand-01`, `Mvr_male_Genlevelup` | 41, 34 | | |
| `Mvr_AiBatt_atk1` (monster MTI_ATK1) | 52 | 21 | |
| `Mvr_AiBatt_dmg1` / `dmg2` / `die1` | 32 / 30 / 32 | none | |

- `CMover::GetAttackSpeed()` (`_Common/MoverAttack.cpp:159-192`): `A = int( JobProp.fAttackSpeed + fWeaponAttackSpeed * ( 4 * GetDex() + GetLevel() / 8.0f ) - 3.0f )`, `A` capped at 187.5;
  `fSpeed = 50 / (200 - A) / 2 + GetAttackSpeedPlusValue( A )` (table indexed `A / 10`, 0.08 .. 1.50 in steps listed at `MoverAttack.cpp:80-85`) `+ DST_ATTACKSPEED / 1000`, `* (1 + DST_ATTACKSPEED_RATE / 100)` if positive;
  clamped to [0.1, 2.0]. `JobProp.fAttackSpeed` for JOB_VAGRANT = **75.0** (`Res/propJob.inc`, first data row). Worked example: Lv 1, DEX 15 (default 15 each, `_Common/Mover.cpp:257-258`),
  bare hand 0.07: `A = int(75 + 0.07 * 60.125 - 3) = 76`, plus value 0.64, `fSpeed = 0.2016 + 0.64 = 0.8416`; male ATK1 then ends after 39 ticks (0.65 s), the hit frame (12) is passed on tick 29 (0.48 s).
  The animation speed is re-set every tick while in an attack state (`Mover.cpp:3084-3097`), monsters stay at 1.0 (:3141-3143).
- Client-side hit pause: when `OnAttackMelee` succeeds, `pModel->m_nPause = 5` for a player (monsters 0), which stops `FrameMove` for 5 ticks (`_Common/MoverActEvent.cpp:1693-1700`, `Model.cpp:15-16`,
  decrement `ActionMoverState.cpp:1029-1031`). The server has no pause; it queues a following MELEE_ATTACK that arrives while it is still swinging (`DPSrvr.cpp:2052-2059`, drained by
  `CAction::OnEndAttackState`/`ProcessAtkMsg`, `_AIInterface/Action.cpp:56-60, 101-135`).
- What the **client** does at the hit frame (`CMover::OnAttackMelee`, `MoverActEvent.cpp:1592-1726`): `OnDamage` -> `pHit->SendDamage` -> `CActionMover::OnDamageMsgC`
  (`_AIInterface/ActionMoverDmg.cpp:54-122`): stand a sitting target up, record `m_idAttacker`/`m_idTargeter` (monster hit by a player), hit effects `dwSfxObj3` (on target, 1 m in front of the target
  along the attacker's angle, +1 y) and `dwSfxObj5`, `m_nDmgCnt = 10`, then `SetDamagedMotion` (`MoverAttack.cpp:2016-2064`): `OBJSTA_DMG`, motion `MTI_DMG1 + random(2)`, **not** when the target is
  jumping, attacking or in an action; plus the attacker's `dwSndAttack1` sound, spark colour on the model, and `m_nActionPoint++` after ATK1. **No damage number and no HP change come from the client's own hit frame.**
  The `OBJSTA_DMG` state ends at the end of the damaged motion (`ActionMoverState.cpp:472-477`).

### 2.6 What stops auto-attack

| Cause | Effect | Source |
|---|---|---|
| any of the movement keys (up, down, left, right, space) | `m_bAutoAttack = FALSE`, `g_pPlayer->ClearCmd()` | `WndWorldControlPlayer.cpp:383-403` |
| `A`, `S`, `D`, `W` key down | `m_bAutoAttack = FALSE` | `WndWorld.cpp:7739-7740` |
| click on a non-mover / ground | `m_bAutoAttack = FALSE`, `ClearCmd`; the walk target replaces the dest object | `WndWorld.cpp:6854, 6922-6929` |
| `IsAttackAble` returns FALSE (dead, peaceful, not killable) | `m_bAutoAttack = FALSE` | `Mover.cpp:6564-6567` |
| the player dies | `m_bAutoAttack = FALSE` | `DPClient.cpp:2080` |
| target dies or is removed | focus becomes NULL; the Process branch then does `ControlPlayer( 0, mouse )` (no attack) | `WndWorld.cpp:8519-8530`, `World.cpp:892-893` |
| selecting another target while auto-attacking | queued as `m_pNextTargetObj`; `SetNextTarget` later clears auto-attack | `WndWorld.cpp:6912-6915, 6418` |

Not a stop condition: distance. The player keeps chasing the focused monster as long as it stays valid and in view.

---

## 3. Server side

### 3.1 Handlers and what they check

Registered in `CDPSrvr` (`DPSrvr.cpp:156-163, 183-190, 232-238`).

- **MELEE_ATTACK** `OnMeleeAttack` (`DPSrvr.cpp:2019-2066`): reads `dwAtkMsg, objid, nParam2, nParam3, fVal`. User valid and `GetIndex() != 0`; `fVal` must equal
  `GetActiveHandItemProp()->fAttackSpeed` (else `AddDefinedText( TID_GAME_MODIFY_ATTACK_SPEED )` = "Please wait a moment before attacking again." and nothing else, :2039-2047);
  `prj.GetMover( objid )` valid; `nRet = pUser->SendActMsg( dwAtkMsg, objid, nParam2, nParam3 )`; if `nRet == 0` and not flying the message is queued in `m_qMeleeAtkMsg`;
  unless `nRet == -2` the attack is relayed with `AddMeleeAttack` (:2060-2063). No range, no facing, no cooldown check.
  Steal rule in the ATK handler (server only): `IsSteal( pHitObj )` -> -2 (`ActionMoverMsg.cpp:629-635`). `CMover::IsSteal` (`Mover.cpp:7010-7057`): refused if the target monster's `m_idTargeter`
  is another valid player who is neither in the attacker's party nor a war-guildmate (RANK_SUPER exempt), and sends `TID_GAME_PRIORITYMOB` ("You cannot attack a monster that is fighting against another player.")
  as SNAPSHOTTYPE_DEFINEDTEXT.
- **PLAYERSETDESTOBJ** `OnPlayerSetDestObj` (`DPSrvr.cpp:12794-12820`): object must exist; (`__TRAFIC_1222`) ignored if already following it; `m_pActMover->DefaultSet()`, `BehaviorActionForceSet()`, `SetDestObj( objid, fRange )`,
  `g_UserMng.AddMoverSetDestObj( pUser, objid, fRange )` (everyone in view **except** the sender, `User.cpp:4793-4806`).
- **SETTARGET**: section 1.2. **QUERYGETDESTOBJ/GETDESTOBJ**: `DPSrvr.cpp:11590-11626`.

### 3.2 Snapshot messages and who gets them

A user's snapshot messages are collected in `CUser::m_Snapshot` and sent as one SNAPSHOT bundle per world tick (`User.cpp:597-604`, `AddBlock` :647). `CUserMng::Add*` writers go to every user in the object's visibility
set `m_2pc` (`WORLDSERVER/UserMacro.h:13-21`), which includes the object's own user unless the writer excludes it.

| Message | Type | Fields after the object ID | To | Writer |
|---|---|---|---|---|
| MELEE_ATTACK | 0x00e0 | dwAtkMsg u32, id u32, nParam2 i32, nParam3 i32 | in view, **not** the attacker | `User.cpp:4808-4820` |
| DAMAGE | 0x0013 | objidAttacker u32, dwHit u32, dwAtkFlags u32; if `AF_FLYING`: pos 3xf32, angle f32 | everyone in view of the *damaged* object **including both parties** | `User.cpp:4474-4492` |
| MOVERDEATH | 0x00c7 | objidAttacker u32 (`NULL_ID` if none), dwMsg u32 (= `OBJMSG_DAMAGE` 41 for basic hits, 0 for `HATTR_DIE`) | everyone in view, including the dying player | `User.cpp:4527-4538` |
| SETPOINTPARAM | 0x001e | nDstParameter i32 (`DST_HP` 38, `DST_MP` 39, `DST_FP` 40), nValue i32 | everyone in view, incl. self; sent only when the value changed | `User.cpp:4663-4677`, `MoverParam.cpp:889-956` |
| SETEXPERIENCE | 0x0012 | nExp1 i64, wLevel u16, nSkillLevel i32, nSkillPoint i32, nDeathExp i64, wDeathLevel u16 | the user only | `User.cpp:1139-1149` |
| SETLEVEL | 0x0011 | wLevel u16 | in view **except** the leveller | `User.cpp:4694-4707` |
| SET_GROWTH_LEARNING_POINT | 0x00a6 | nRemainGP i32 (= `m_nRemainGP`, stat points), 0 i32 | the user only | `User.cpp:1161-1169` |
| CORRREQ | 0x0041 | (object ID = the monster) pos 3xf32, idAttacker u32 | the attacker, once, on the first player hit of a monster | `User.cpp:2405-2415`, `MoverAttack.cpp:1743-1746` |
| SETPOS | 0x0010 | pos 3xf32 | in view of the old position, incl. self | `User.cpp:4679-4691` |
| REPLACE | 0x00f2 | dwWorldID u32, pos 3xf32 (object ID NULL_ID) | the user, cross-world only | `User.cpp:724-733` |
| REVIVAL / REVIVAL_TO_LODESTAR / (LODELIGHT) | 0x00a1 / 0x00a2 / 0x00a3 | none | in view | `User.cpp:5439-5449` (`AddHdr`) |
| DEFINEDTEXT | 0x0095 | dwText u32, string | the user | `User.cpp:2218-2239` |
| DEFINEDTEXT1 | 0x0094 | dwText u32 | the user | `User.cpp:2264-2274` |
| SETFXP | 0x0029 | wFxp u16, wFlightLv u16 | the user | `User.cpp:1151-1159`; only when `nFxpValue != 0`, which is 0 for the Lv 1-15 monsters checked |
| MONSTERPROP | 0x004e | list of per-monster rates | all, at login and on change | `User.cpp:5663-5677, 6524-6540` |
| MOTION | 0x0098 | dwMsg u32 | in view, incl. self | `User.cpp:4431-4442`; stand/sit only, not combat |
| QUERYGETDESTOBJ | 0x0049 | idFrom u32 | the user | `User.cpp:2348-2357` |

`AF_*` flags (`_AIInterface/ActionMover.h:27-44`): GENERIC 0x1, MISS 0x2, MAGIC 0x8, MELEESKILL 0x10, MAGICSKILL 0x20, CRITICAL1 0x40, CRITICAL2 0x80 (CRITICAL = 0xC0, both bits are set together),
PUSH 0x100, PARRY 0x200, RESIST 0x400, STUN 0x800, BLOCKING 0x1000, FORCE 0x2000, RANGE 0x4000, MONSTER_SP_CLIENT 0x8000, FLYING 0x10000000. A plain hit arrives as GENERIC, plus CRITICAL when it crits
(x2.3, or x2.6 for ATK4: `MoverAttack.cpp:1572-1613`; plus an extra 1.1-1.4 or 1.2-2.0 factor in `GetHitPower`, :1351-1408), BLOCKING (`PostCalcGeneric`, :1432-1439), FLYING (knockback: 15 percent of crits on a
non-player that `CanFlyByAttack()`, never on a player target, :1389-1398). A miss is a DAMAGE with `dwHit = 0` and `AF_MISS` (`AttackArbiter.cpp:290-294`).

### 3.3 Order of messages

**Non-lethal hit** (`CAttackArbiter::OnDamageMsgW`, `WORLDSERVER/AttackArbiter.cpp:128-265`), at the server's hit frame:
1. (first hit by a player on a monster with no `m_idAttacker`) CORRREQ to the attacker (`OnAttacked`, `MoverAttack.cpp:1735-1746`, called at `AttackArbiter.cpp:227`);
2. DAMAGE (`OnDamaged`, :756-764; the server also runs `SetDamagedMotion` on its own copy);
3. SETPOINTPARAM(`DST_HP`, new HP) from `EndPVP( nHP )` (`AttackArbiter.cpp:259`, `Mover.cpp:5428-5435`); `MinusHP` itself does not change `m_nHitPoint` (:690-722).
Damage is `max( damage, 1 )` (:215).

**Lethal hit** (`OnDied`, `AttackArbiter.cpp:767-824`):
1. (CORRREQ as above), **no DAMAGE**;
2. kill-recovery buffs (`AddKillRecovery`, `Mover.cpp:5942-5989`; none for a plain Vagrant);
3. `SubExperience( pDead )` -> per enemy player within 64 m: [SETFXP], and either `AddExperience` + `LevelUpSetting` (SETLEVEL to others, SET_GROWTH_LEARNING_POINT to self, `MoverParam.cpp:1054-1493`, `User.cpp:254-267`) or `ExpUpSetting`,
   then **SETEXPERIENCE** (`Mover.cpp:6245-6255`); EXP is split by damage share (`AddExperienceKillMember`, :6085-6168);
4. `DropItemByDied` -> `OT_ITEM` objects added through `ADDOBJ`, which the world adds on its next step (`World.cpp:447-450`), so their ADD_OBJ (object type 4, which the browser skips) can arrive in a later bundle;
5. `DoDie( attacker, dwMsg )` (`Mover.cpp:5131-5423`): server `OBJMSG_STOP` + `OBJMSG_DIE`; **MOVERDEATH** (`:5273`); quest kill counters (`AddSetQuest`);
6. `ClearDestObj()` on the attacker (:823);
7. SETPOINTPARAM(`DST_HP`, 0) from `EndPVP`.

**Monster attacks the player**: `CAIMonster::DoAttack` (`_AIInterface/AIMonster.cpp:1259-1305`) runs `pMover->SendActMsg( OBJMSG_ATK1, pTarget->GetId(), 0, 0 )` and, if it returned > 0, `AddMeleeAttack( pMover, OBJMSG_ATK1, targetId, 0, MAKELONG( 0, nError ) )`
(`nError` = `AF_GENERIC` 1 or `AF_MISS` 2). It is sent to **everyone in view, including the target**. Later, at the monster's hit frame: [CORRREQ not sent: attacker is an NPC] DAMAGE (attacker = monster ID, defender = player) then SETPOINTPARAM(HP).
A monster that cannot start ATK1 because the target is in a non-`OBJSTA_DMG` damage state is silently dropped on the client (`ActionMoverMsg.cpp:643-644`). Monster start condition: first attack chance 3 s after aggro, then
`dwReAttackDelay - 1 s + rand(2 s)` (e.g. Aibatt 6000 ms: `AIMonster.cpp:1350, 1381-1382`), only when `IsRangeObj( target, GetAttackRange )` (:1375-1376). The target-in-view/aggro/leash rules (`MoveProcessRage`, :1561-1786) are
server-side only; the client sees them as MOVERSETDESTOBJ + normal movement messages (Piece 3 handles those).

**Level up** (`AddExperience`, `MoverParam.cpp:1054-1493`): `m_nExp1 += exp`; when `m_nExp1 >= m_aExpCharacter[ nextLevel ].nExp1` (:1326) -> `m_nRemainGP += dwLPPoint` (2 per level, :1358), `m_nLevel = next`,
`m_nExp1 = 0`, **`m_nHitPoint/m_nManaPoint/m_nFatiguePoint = max` by direct assignment, with no SETPOINTPARAM** (:1416-1418), skill points `((level-1)/20)+2` (:1434-1441); surplus EXP carries over by recursion (:1487-1488).
For a base-job Vagrant (`IsBaseJob()`), `m_nLevel >= MAX_JOB_LEVEL` (= 15, `Res/defineJob.h:19`) sets `m_nExp1 = 0` and adds nothing (:1171-1177): EXP stops at level 15.
EXP per kill (`SubExperience`/`AddExperienceSolo`, `Mover.cpp:5992-6027, 6170-6256`): `propMover.dwExpValue * m_fExp_Rate` split by damage share, times 0.7 (monster level 1-2 below the player), 0.4 (3-4 below), 0.1 (5 or more below)
(:6198-6216), capped at `m_aExpCharacter[level].nLimitExp`; multiplied by `GetExpFactor()` and rest-point bonus (`MoverParam.cpp:1098-1101`, `GetExpFactor` :4123). **EXP table** (`Res/expTable.inc`, columns EXP, PXP, GP, LimitExp, row = level, 1-based): EXP needed to leave level L is the
row L+1 value: L1 14, L2 20, L3 36, L4 90, L5 152, L6 250, L7 352, L8 480, L9 591, L10 743, L11 973, L12 1290, L13 1632, L14 1928; limit per kill by row L: 16, 18, 21, 25, 30, 35, 42, 49, 58, 69, 84, 102, 123, 145, 170.
`GetMaxExp1() = m_aExpCharacter[ m_nLevel + 1 ].nExp1` (`Mover.h:1108`). Sample monsters (`Res/propMover.txt`; `dwAddHp`, `dwExpValue`, level): Aibatt1 120 HP / 2 EXP / Lv1, Aibatt2 148 / 2 / Lv1, Aibatt3 190 / 3 / Lv2,
Mushpang1 305 / 4 / Lv3, Burudeng1 745 / 9 / Lv5, Pukepuke1 1112 / 12 / Lv7, Peakyturtle1 1370 / 13 / Lv8, Demian1 1454 / 14 / Lv9, Doridoma1 1851 / 18 / Lv11, Lawolf1 2297 / 22 / Lv13, Fefern1 2320 / 29 / Lv15.

**Monster removal timing**: on death the server sets `m_nDeadCnt = 60 * 3` (`ActionMoverMsg.cpp:971-975`); `OBJSTA_DEAD` decrements it once per action step (4 per `Process`, so about 3 s), then `OBJSTA_DISAPPEAR`, and after `m_nCount > FRAME_PER_SEC`
(about 1 s) `pMover->Delete()` (`ActionMoverState.cpp:531-581`): **DEL_OBJ about 4 s after MOVERDEATH**. The client has no fade; the body stays at the end of the die motion (`ANILOOP_CONT`, :532-533)
until DEL_OBJ (`DPClient.cpp:1643-1735`). Corpses are not pickable (`World3D.cpp:2701-2702`).

**Regeneration** (`CMover::ProcessRecovery`, `Mover.cpp:8167-8408`, server only): standing and not "in combat" (`IsAttackMode()` = `m_nAtkCnt` set and under 10 s of ticks, `Mover.cpp:9228-9233`): every 3 s (`NEXTTICK_RECOVERYSTAND`, `Mover.h:114`)
`IncHitPoint/IncManaPoint/IncFatiguePoint( GetHP/MP/FPRecovery() )`; sitting: every 2 s (`Mover.h:113`). Each change is a SETPOINTPARAM broadcast.

### 3.4 Max HP, MP, FP (needed by the client for bars and level-up)

(`_Common/MoverParam.cpp:2788-2937`, `GetSta()`/`GetInt()` = base + `DST_*` adjustments, `:3163-3240`.) With `m_nSta` etc. defaulting to 15:
- player HP: `a = fFactorMaxHP * level / 2; b = a * ((level+1)/4) * (1 + sta/50) + sta*10; max = int( b + 80 )`; Vagrant `fFactorMaxHP` 0.9 (`Res/propJob.inc`); Lv1 STA 15 -> 230.
- player MP: `int( (((level*2 + int*8) * fMP) + 22) + int * fMP )`, Vagrant 0.3; Lv1 INT 15 -> 63.
- player FP: `int( ((level*2 + sta*6) * fFP) + sta * fFP )`, Vagrant 0.3; Lv1 STA 15 -> 32.
- All three: `GetParam( DST_x_MAX, origin ) * ( 1 + DST_x_MAX_RATE / 100 )`, at least 1.
- monster HP: `int( dwAddHp * prj.m_fMonsterHitpointRate * MoverProp::m_fHitPoint_Rate )`, both rates 1.0 by default (`Project.cpp:255`, `ProjectCmn.cpp:274`).

---

## 4. Neuz handling of each server message (`Neuz/DPClient.cpp`)

The dispatch is `OnSnapshot` (`:366-887`): `ar >> objidPlayer >> cb`, then per message `ar >> objid >> hdr` and the `switch` at :383-884. Combat-relevant cases: MOVERDEATH :487, DAMAGE :494, SETPOINTPARAM :578, SETPOS :587, REPLACE :589,
SETEXPERIENCE :590, SETFXP :591, SETLEVEL :592, MELEE_ATTACK :598, MELEE_ATTACK2 :599, MOVERSETDESTOBJ :603, REVIVAL :607, REVIVAL_TO_LODESTAR :608, SET_GROWTH_LEARNING_POINT :612, CORRREQ :627, SETTARGET :641, MOTION :646,
CLEAR_TARGET :818, MONSTERPROP :459, QUERYGETDESTOBJ :485, GETDESTOBJ :486, DEFINEDTEXT :392, DEFINEDTEXT1 :394, DEL_OBJ :489.

| Message | Handler | What Neuz does |
|---|---|---|
| MELEE_ATTACK | `OnMeleeAttack` :3802-3815 | read dwAtkMsg, id, nParam2, nParam3; `pMover->SendActMsg( msg, id, p2, p3 )`; if it returns 0 (busy) it is queued in `m_qMeleeAtkMsg` and replayed at the end of the current attack animation (non-active movers: `Action.cpp:121-125`). ATK: stop turning, stand, `SetAngle` toward the target, motion `MTI_ATKn` (+offset), `m_fAniSpeed = GetAttackSpeed()` for players |
| DAMAGE | `OnDamage` :1758-1934 | see 4.1 |
| MOVERDEATH | `OnMoverDeath` :1936-2090 | see section 5 |
| SETPOINTPARAM | `OnSetPointParam` :3303-3313 | `pMover->SetPointParam( dst, value )` (client: clamps to `0..GetMaxXxx()`, no echo) |
| SETEXPERIENCE | `OnSetExperience` :3376-3430 | `SetExperience( exp, level )` (`MoverParam.cpp:1709-...`); level increase: `MTI_LEVELUP` (198, `MOP_FIXED`, only if standing), `XI_GEN_LEVEL_UP01` (42) effect on the mover, `BGM_IN_LEVELUP` (23), chat `TID_GAME_LEVELUP`, caption `TID_GAME_LEVELUP_CAPTION`, "new attack patterns" text when crossing 2, 8, 12, level-15 job text; **HP, MP, FP = max** (:1770-1772); sets `m_nDeathExp/m_nDeathLevel` only if not -1/0xffff; stores skill level and point; new skill-point sfx when the point count rose |
| SETLEVEL | `OnSetLevel` :3339-3359 | others: level-up motion and sfx when higher, `m_nLevel`, HP/MP = max |
| SET_GROWTH_LEARNING_POINT | `OnSetGrowthLearningPoint` :3531-3542 | `m_nRemainGP = nRemainGP` |
| CORRREQ | `OnCorrReq` :10015-10028 | `SetPos( pos )` of the monster and `m_idAttacker = idAttacker` |
| SETPOS | `OnSetPos` :2215-2273 | own mover: clear focus, remove from world, `ReadWorld( pos, TRUE )`, `SetPos`, re-add, `OBJMSG_STAND`, camera to the position; others: clear focus if it was theirs, `SetPos`; then `ClearDest`, `OBJMSG_ACC_STOP`, `STOP_TURN`, `STAND`, `InitInterpolation` |
| REVIVAL_TO_LODESTAR | `OnRevivalLodestar` :3484-3513 | `m_pActMover->ClearState()`; HP = max x rate by level (Lv1 80, Lv2 60, <=5 50, <=10 40, <=15 30, else 30 percent), MP and FP raised to the same only if lower (`__VER >= 9`); destroys the resurrection-scroll confirm window. The server's SETPOINTPARAM then overrides with 20 percent |
| REVIVAL | `OnRevival` :3450-3482 | `ClearState()`; destroys the confirm window |
| MOVERSETDESTOBJ | `OnMoverSetDestObj` :8561-8570 | `SetDestObj( objid, fRange, FALSE )` if both objects exist |
| QUERYGETDESTOBJ | `OnQueryGetDestObj` :8985-8991 | if the own mover has a dest object: `SendGetDestObj( objid, destId )` |
| DEL_OBJ | `OnRemoveObj` :1643-1735 | `pCtrl->Delete()` |
| DEFINEDTEXT / DEFINEDTEXT1 | :4117-4228 / :4230-4239 | format `prj.GetText( id )` with the string's tokens / just text and colour from `prj.GetTextColor( id )`, to chat/system log |
| MONSTERPROP | `OnMonsterProp` :6630-6698 | sets `m_fHitPoint_Rate`, `m_fAttackPower_Rate`, `m_fDefence_Rate`, `m_fExp_Rate`, `m_fItemDrop_Rate`, `m_fPenya_Rate` (value / 100) per monster *name* |

### 4.1 `OnDamage` in detail (`DPClient.cpp:1758-1934`)

Reads `objidAttacker u32, dwHit u32, dwAtkFlags u32`, then `pos, angle` if `AF_FLYING` (and sets the mover's position and angle).
For a valid target: `IncHitPoint( -dwHit )` (client `SetPointParam`, clamped), forced to 1 if it hits 0 (:1785-1788) (the SETPOINTPARAM that follows is absolute); a sitting target stands up; if the target is the own player, a
vendor window is closed.

**When anything is shown:** only if the damaged mover **is the own player or the attacker is the own player** (:1833). (With the option `m_bDamageRender`, default FALSE (`HwOption.cpp:238`), numbers within 30 m of anyone are shown too, :1816-1821.)
A missing attacker (not in view) -> the same `g_PASS` path is used for the own player's damage but the attacker part is skipped.
Casting of a base-motion state mode is cancelled (:1837-1840).

Per flag, in this order (`:1843-1896`):
- `AF_BLOCKING`: effect `XI_HIT_HITBLOCK01` (16) 1.5 m above the target, scale 2; **continues** to the next checks;
- `AF_PARRY`: effect `XI_HIT_PARRY01` (13), scale 2, no number;
- else `AF_RESIST`: if `dwHit == 0` effect `XI_HIT_MISS01` (12), else a number;
- else `AF_MISS`: effect `XI_HIT_MISS01` (12) at +1.5 m, scale 2, no number (the "MISS" glyph in the number texture is **not** used);
- else: if `dwAtkFlags & AF_CRITICAL`: effect `XI_HIT_CRITICAL01` (11) at +1.5 m, scale 3 (`Res/defineObj.h:100-105, 136`); then the number
  `g_DamageNumMng.AddNumber( pMover->GetPos(), dwHit, pMover->IsActiveMover() ? 0 : 1 )`.
Afterwards (:1899-1932): a critical plays the attacker's `dwSndAttack2`; `AF_FLYING`: target `OBJSTA_DMG_FLY`, `MTI_DMGFLY` (11, `ANILOOP_CONT`), attacker `OBJMSG_STOP`, `DoDamageFly( attackerAngle, 145, 0.18 )`;
an attacker that cannot be found while the own player is hit -> `SendError( FE_INVALIDATTACKER )` + `SendCorrReq( attackerId )`.

### 4.2 Damage numbers (`_Common/2DRender.cpp:1855-2070`, `2DRender.h:319-369`)

- **Texture**: `Cli/SFX/DmgEffect.dds` (1024x256, DXT3) described by `Cli/SFX/DmgEffect.inc` (the active block is `number 28`, texture `sfx\DmgEffect.dds`): index 0-9 = digits (50x50 px, x = 0, 50 ... 450, y = 0), 10-13 = MISS!, NICE!, COMBO!, YEAH! (200, 200, 300, 250 px wide, y = 50), 14-23 = digits at y = 128, 24-27 = the same words at y = 178. Glyph for digit d and "attribute" a: `index = d + a * 14`.
  Attribute **0** (own player was hit) is the pink digits with a red outline (top row); attribute **1** (the own player hit a monster) is cyan digits with a blue outline (second row). I decoded the DDS to confirm the colours.
- **Spawn**: when DAMAGE (or MOVERDEATH, below) is handled, at the damaged mover's feet position `GetPos()`; the vertical start is `Project( pos + (0, 1 m, 0) ).y` at the first `Process`.
- **Motion** (one `Process()` per Neuz main-loop tick, `Neuz.cpp:1084`; one `Render()` per frame; both do `m_nFrame++`, and the object dies when `m_nFrame >= 100`, so about 50 ticks at 60 Hz):
  state 0 (1 tick): `m_fDy = 10`; state 1 (8 ticks): rises 10 px per tick; state 2 (10 ticks): shakes +-3 px alternately; state 3 (15 ticks): holds; state 4: rises 2 px per tick, scale `3.0 + 0.05 * n` (before the /4), alpha `75 - 2n`.
  Horizontal position is re-projected from the world position every frame; y is the accumulated screen value.
- **Size**: scale 2.0 / 4 = 0.5 (so 25 px digits at 1:1); each digit advances `0.5 * width * scale` = 12.5 px (the glyphs overlap); the string is centred by `fX -= scale * 50 * (1 + 0.5 * (n-1)) / 2`.
  Alpha 255 until state 4.

### 4.3 HUD bars (own player; `_Interface/WndField.cpp:10299-10384, 10440-10631`)

Fill widths: `barWidth * value / max` (int math) for HP, MP, FP; EXP `(int)( (float)barWidth / GetMaxExp1() * GetExp1() )`. Fill colours (ARGB): HP `0x64ff0000` (red), MP `0x640000ff` (blue), FP `0x6400ff00` (green),
EXP `0x847070ff` (bluish, thinner bar). Text: mode 1 shows `%d%%` and the points, mode 2 `value / max`; EXP as `%.2f%%` capped at `99.99%%` (`:10617-10625`). HP/MP/FP/EXP are read from `GetHitPoint()`, `GetManaPoint()`, `GetFatiguePoint()`, `GetExp1()`.

---

## 5. Death and revive

### 5.1 What happens when the own player dies (`OnMoverDeath`, `Neuz/DPClient.cpp:1936-2090`)

Reads `objidAttacker u32` (`NULL_ID` allowed: `HATTR_DIE` deaths) and `dwMsg u32`.
- `IncHitPoint( -hp )` -> HP 0; own death: `SetObjFocus( NULL )`, closes the duel/PK windows, `SetLastTarget( NULL_ID )` (:1949-1955); own kill: focus cleared, queued next target selected (:1956-1972).
- If the dying mover or the attacker is the own player: `AddNumber( pMover->GetPos(), nHitPointBeforeDeath, active ? 0 : 1 )` (:2006-2007): the final number is the client's last known HP, not a server damage value.
  Attacker: `SetObjHit( NULL_ID )` and `ClearDestObj()` (:2008-2009).
- `pMover->SendActMsg( OBJMSG_DIE, dwMsg, attackerPtr )` (:2011): `ActionMoverMsg.cpp:842-1003`: sit -> stand, `ClearState()`, `m_vDelta.x = z = 0`; with `dwMsg == OBJMSG_DAMAGE_FORCE` (42): `OBJSTA_DMG_FLY` + `MTI_DMGFLY` (`ANILOOP_CONT`) + `DoDamageFly( attacker angle, 145, 0.25 )`;
  otherwise (`OBJMSG_DAMAGE` 41 or 0): `SetState( OBJSTA_DMG_ALL, OBJSTA_DEAD )` and `SetMotion( MTI_DIE1, ANILOOP_CONT )`; for a player `MTI_DIE1` gets the weapon offset like any other motion (`AtkDie1-01` for the male at +200).
  For a dead non-player the client camera quake plays at the quake attribute (`ActionMoverState.cpp:560-570`).
- Own player extras: `PlayMusic( BGM_IN_DEATH )` (22), chat line `TID_GAME_DEATH` (colour `0xff00ffff`; text "Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.", `Res/textClient.txt.txt` string IDS_TEXTCLIENT_INC_000156),
  `m_bAutoAttack = FALSE` (:2080), tracking cleared (:2082-2087), and the **revive window** (below), unless in the school event or `m_nGuildCombatState == 1`, where `SendHdr( PACKETTYPE_REVIVAL_TO_LODESTAR )` is sent automatically (:2052-2059).

### 5.2 The revive window (`CWndRevival`, `_Interface/WndField.cpp:12147-12345`; created at `DPClient.cpp:2062-2072`)

Modal (`WBS_MODAL`, :12255), no title bar (:12219), centred horizontally at y = 70 (:12248-12251); the mouse-look mode is switched off (:12257-12260). Buttons:

| Button | Sends | State |
|---|---|---|
| Lodestar (`WIDC_REVIVAL_TO_LODESTAR`) | `PACKETTYPE_REVIVAL_TO_LODESTAR` | enabled (tooltip `TID_GAME_TOOLTIP_LODESTAR`: "Lodestar is a place near the closest city where a character can choose to be resurrected."); disabled only in the boss dungeons |
| Lodelight | `PACKETTYPE_REVIVAL_TO_LODELIGHT` (0x00ff00c2; the server handler is empty, `DPSrvr.cpp:11423-11425`) | hidden and disabled (`__VER >= 9`, :12221-12230) |
| Revive here (`WIDC_REVIVAL_STAND`) | `PACKETTYPE_REVIVAL` (0x00ff00c0) | enabled only with a `II_SYS_SYS_SCR_RESURRECTION` item in the inventory (:12164-12171, :12193-12200) |
| Shop | opens the web box | |

Each click sends the packet and destroys the window; only the web-box button leaves it open (:12342-12343).

**PACKETTYPE_REVIVAL_TO_LODESTAR = `0x00ff00c1`** (`MsgHdr.h:184`): header only, **no fields** (`CDPClient::SendHdr`, `DPClient.cpp:11253-11257`).

### 5.3 Server `OnRevivalLodestar` (`DPSrvr.cpp:11296-11421`)

1. Ignored if the user is not dead (:11304-11309).
2. `CreateExpBox( pUser )` (:11311): returns NULL when `fDecExp == 0` (`DPSrvr.cpp:7988-8009`). **`Res/DiePenalty.inc` DECEXP_PENALTY has level <= 20 -> 0**, so Lv 1-15 get no box, no EXP loss and no
   `TID_GAME_EXPBOX_INFO_MSG` ("You can recover some of your Exp. If you return to the place where you died.") text.
3. `m_nDead = PROCESS_COUNT * 5` (5 s after-death invincibility mark); `SubDieDecExp()` (:11324, `Mover.cpp:7157-7232`): `fDecExp == 0` skips everything, so no SETEXPERIENCE is sent; the returned rate is overwritten by `fRate = 0.2f` (:11333-11336).
4. `m_pActMover->ClearState()` (:11325); broadcast **`SNAPSHOTTYPE_REVIVAL_TO_LODESTAR`** (:11357; `SNAPSHOTTYPE_REVIVAL` in the guild-war world).
5. `SetPointParam( DST_HP, max * 0.2 )`, `DST_MP` and `DST_FP` likewise, unconditionally (:11361-11369): up to three SETPOINTPARAM broadcasts.
6. Position: not chaotic -> `GetRevivalPos( pWorld->m_dwIdWorldRevival, key )` only if `m_dwIdWorldRevival != 0` and differs from the current world (:11409-11410); for Flaris `revival 0 ""` so `GetNearRevivalPos( worldId, pos )`:
   the `RI_REVIVAL` region rectangle containing the player gives a key whose position is used, else the nearest non-chaotic revival position in the **same world** (`worldmng.cpp:627-662`).
   `REPLACE( g_uIdofMulti, rgn.worldId, rgn.vPos, REPLACE_FORCE, nRevivalLayer )` (:11417); if nothing found: the same world at the current position (:11419).
7. `CMover::Replace` only queues the move (`Mover.cpp:2200-2289`: `ClearDest`, `ACC_STOP`, `STOP_TURN`, `STAND`, entry in `m_aReplaceObj`); **`CWorld::_replace`** (`World.cpp:1565-1681`) runs on the world's next step:
   - same world and same layer (`GetID() == dwWorldID && layer == nLayer`, :1589): if `vPos.y == 0` the height is looked up (:1594-1598); **`g_UserMng.AddSetPos( pMover, vPos )`**, `pMover->SetPos( vPos )`, `Notify()` (:1599-1603);
   - otherwise (another world): `AddReplace( worldId, pos )` (SNAPSHOTTYPE_REPLACE, object ID NULL_ID), `RemoveObj`, `SetPos`, `AddAddObj( pUser )`, `ADDOBJ` into the new world, plus `AddSMModeAll`, `AddEnvironment` (:1605-1671).
   Objects entering and leaving view because of the jump are then announced by the usual ADD_OBJ / DEL_OBJ bundles.

So the own client receives, in this order: REVIVAL_TO_LODESTAR; SETPOINTPARAM x1-3; (a world step later) SETPOS; then ADD_OBJ/DEL_OBJ for the new surroundings. Neuz `OnReplace` (`DPClient.cpp:2297-2451`) would reload
the whole world even for the same world ID (`g_WorldMng.Open( dwWorldID )`, :2427), sets `g_pPlayer = NULL` and waits for the server's ADD_OBJ, but a same-world lodestar revive does not reach it.
No EXP-loss text applies at levels 1-15.

---

## 6. Monster HP and the target bar

- A monster's **current HP** is in ADD_OBJ (`CMover::Serialize`, shared part `m_nHitPoint` as LONG, `_Common/ObjSerializeOpt.cpp:392-394`; Piece 3 reads it as `AddedMover.hitPoint`, `Web/packages/protocol/src/world/addObj.ts`). After that the client only tracks
  DAMAGE (`IncHitPoint( -dwHit )`) and SETPOINTPARAM (absolute, sent after every damage and on regeneration), MOVERDEATH (to 0). There is no other HP sync message for monsters.
- **Max HP** is not on the wire: `GetMaxHitPoint()` -> `GetMaxOriginHitPoint()` = `int( propMover.dwAddHp * m_fMonsterHitpointRate * m_fHitPoint_Rate )` (`MoverParam.cpp:2878-2880`); both rates default to 1.0 and per-monster-name overrides come in MONSTERPROP
  (`DPClient.cpp:6630-6698`).
- `CWndWorld::RenderSelectObj` (`_Interface/WndWorld.cpp:2716-2931`) draws the bar for `m_pRenderTargetObj` (VER >= 11) else the focused object, if it is a valid mover that is **not peaceful or is a player**, unless a GM is hidden:
  - 200 px wide at the top centre: `x0 = ( clientWidth - 200 ) / 2`, `rect = ( x0, 30, x0 + 200, 0 )` (:2760-2774); empty gauge `ARGB( 200, 255, 255, 255 )` then fill `ARGB( 128, 255, 15, 15 )` of width `(int)( 200 * HP / MaxHP )` using `m_texGauEmptyNormal`; width computed in 64-bit (:2768, :2781-2784);
  - text at `( rect.left + 50, rect.top - 18 )`: players `"%s <Lvl %d>"` (level hidden as `??` above `+20` levels), monsters `"%s <Lvl %d>"` using `propMover.dwLevel`, or just the name when `dwHideLevel == 1` (:2822-2847); colour `COLOR_MONSTER` `0xffffffa0`, `COLOR_PLAYER` `0xffffffff` (`Mover.h:34-38`),
    monsters with `m_bActiveAttack` (aggressive) `0xffff0000` (:2864-2871);
  - level arrow textures at `( x + 30, y - 20 )`: `diff = monsterLevel - playerLevel`; `diff > 5` `m_texLvUp2`, `diff > 0` `m_texLvUp`, `diff < -5` `m_texLvDn2`, `diff < -1` `m_texLvDn` (:2873-2902); an element icon if `eElementType` (:2904-2912); buffs through `RenderMoverBuff` (:2928).
- `RenderFocusObj` (:3080-3165): four corner brackets at the box's projected screen rectangle (`GetBoundRect`, :2661-2714: the 8 BB corners projected with the mover's scale, rotation and position, min/max), offset by 32 px (`rect.left - 32, rect.top - 32` etc.). **White** (`m_texTarget` 0-3) when merely selected,
  **red** (8-11) when `m_bSelectTarget || m_bAutoAttack || cmd == OBJACT_USESKILL` and the target is a non-peaceful mover or a player (:3109-3128).

---

## 7. What the browser decodes now vs what Piece 4 adds

`Web/packages/protocol/src`: `WORLD_READERS` (`world/readers.ts`) holds exactly: ADD_OBJ, MOVERMOVED, MOVERBEHAVIOR, MOVERCORR, MOVERANGLE, DESTPOS, DESTANGLE, MOVERSETDESTOBJ, MOTION, SETPOS, SETPOSANGLE, DEL_OBJ,
WORLD_READINFO, REPLACE, ENVIRONMENTALL. `MessageType` and `PacketType` in `constants.ts` list the same types plus the packet types. The bundle reader skips unknown types safely when the world server's table of contents is present (`bundle.ts`).
Piece 3's `WorldSession` ends the session on a REPLACE to another world and turns a same-world REPLACE into a SETPOS of the own mover (`WorldSession.ts:255-262, 294`, `WorldScreen.ts:224-231`).

**Server -> client**

| Message | Type | Read today? | Notes for Piece 4 |
|---|---|---|---|
| ADD_OBJ (movers) | 0x00f0 | yes | monsters: `hitPoint`; **own character**: `readMover` calls `r.skipRest()` after the equipment IDs (`addObj.ts:63-66`); Piece 4 needs MP and FP (u16 each), tutorial state, `m_nFxp`, gold, `m_nExp1` (i64), skill level/point, death exp/level, quests..., `m_nRemainGP` (the order is in `ObjSerializeOpt.cpp:509-558`), plus STR/STA/DEX/INT and level, which are read but not kept for the own character |
| DEL_OBJ | 0x00f1 | yes | |
| MOVERSETDESTOBJ | 0x00c2 | yes | monsters chasing; fields objid u32 + range f32 |
| MOTION | 0x0098 | yes | |
| SETPOS | 0x0010 | yes | the lodestar revive |
| REPLACE (message) | 0x00f2 | yes | only needed if the revival world differs |
| MELEE_ATTACK | 0x00e0 | **no** | dwAtkMsg u32, id u32, nParam2 i32, nParam3 i32 |
| DAMAGE | 0x0013 | **no** | objidAttacker u32, dwHit u32, dwAtkFlags u32, [pos vec3, angle f32 if `AF_FLYING` 0x10000000] |
| MOVERDEATH | 0x00c7 | **no** | objidAttacker u32, dwMsg u32 |
| SETPOINTPARAM | 0x001e | **no** | nDst i32 (38 HP, 39 MP, 40 FP), nValue i32 |
| SETEXPERIENCE | 0x0012 | **no** | i64, u16, i32, i32, i64, u16 |
| SETLEVEL | 0x0011 | **no** | u16 |
| SET_GROWTH_LEARNING_POINT | 0x00a6 | **no** | i32, i32 |
| REVIVAL_TO_LODESTAR / REVIVAL | 0x00a2 / 0x00a1 | **no** | no fields |
| CORRREQ | 0x0041 | **no** | pos vec3 + idAttacker u32 |
| DEFINEDTEXT / DEFINEDTEXT1 | 0x0095 / 0x0094 | **no** | `TID_GAME_PRIORITYMOB`, `TID_GAME_MODIFY_ATTACK_SPEED` and similar |
| QUERYGETDESTOBJ | 0x0049 | **no** | one u32; answer with GETDESTOBJ |
| MONSTERPROP | 0x004e | **no** | optional; changes monster max HP/EXP rates |
| SETFXP | 0x0029 | no | not needed for the Lv 1-15 monsters (`nFxpValue` 0) |
| SETDESTPARAM / RESETDESTPARAM | 0x001c / 0x001d | no | buffs, later |
| ADD_OBJ of `OT_ITEM` (drops) | 0x00f0 | skipped as `addOther` | Piece 5 |

**Client -> server** (all with the u32 DPID_UNKNOWN + u32 type header, as `messages/world.ts` already writes)

| Packet | Type | Written today? | Fields |
|---|---|---|---|
| PLAYERSETDESTOBJ | 0xffffff07 | **no** | objid u32, fRange f32 |
| MELEE_ATTACK | 0x00ff0010 | **no** | dwAtkMsg u32, objid u32, nParam2 i32, nParam3 i32, fVal f32 |
| SETTARGET | 0x00ff0023 | **no** | idTarget u32, bClear u8 |
| REVIVAL_TO_LODESTAR | 0x00ff00c1 | **no** | none |
| GETDESTOBJ | 0xffffff73 | **no** | objid u32 (from the query), objidDest u32 |
| PLAYERMOVED / PLAYERBEHAVIOR / PLAYERCORR / SNAPSHOT(DESTPOS) | | yes | |

Other gaps the browser has for Piece 4 (all in the converter/data, not the protocol): `WebMover` has no `dwAddHp`, level, `dwExpValue`, class, belligerence, hide level, killable (`Web/packages/formats/src/web/gameData.ts:8-36`);
no propJob/expTable/DiePenalty export; no weapon `fAttackSpeed`/`dwAttackRange` per item; the `.ani` `frameAttributes` (hit, sound, quake) are parsed by `formats` but not written into the converted motions
(`Web/packages/formats/src/model/ani.ts:71-90`, no use in `tools/convert/src`); the `DmgEffect` texture and the hit/critical/miss/level-up effects (`XI_HIT_*`, `XI_GEN_LEVEL_UP01`) are not converted; `sim/constants.ts` lacks the `OBJSTA_ATK*`,
`OBJSTA_DMG*`, `OBJSTA_DEAD` and `OBJSTAF_COMBAT` values (:6-31).

---

## Open questions / uncertain

1. **Which weapon a new Vagrant wears**, and where the web client gets its item ID. MELEE_ATTACK's float must equal the server weapon's `fAttackSpeed`. The own character's equipment in ADD_OBJ is inventory object IDs, not item IDs
   (`Web/.../types.ts`, `equipmentObjectIds`), and the inventory decode is Piece 5; Piece 3 takes the look from the lobby's PLAYER_LIST. Not traced which item PLAYER_LIST gives.
2. **PLAYERSETDESTOBJ once per swing cycle** (2.2) is derived from reading `SetDestObj`/`OBJMSG_STOP`, not from a packet capture.
3. **The model bounding box** (union of the loaded parts, including a worn weapon for humans) and `GetRadius()` are needed for the exact pick and melee arrival range; whether the converted GLB data carries them was not checked.
   `radius` in `moverRules.ts` defaults to 0.
4. **Hit-frame data** is in the `.ani` files but not exported (7). The numbers above were read with the repo's own parser; they are 0-based frame indices of `MA_HIT`. The mapping from a mover's motion ID to the right file for each monster/player combination
   (`mdlDyna.inc` plus the +200/+500/+800 weapon offsets) was shown for MI_MALE and MI_AIBATT1 only.
5. **Monster ATK motion offset**: derived that `IK3_VIRTUAL` monsters get no offset (`Mover.cpp:4865-4900`), checked against Aibatt only.
6. **MONSTERPROP rates and `m_fMonsterHitpointRate`**: the default is 1.0, but a server that has per-monster rates set (database table, GM command) changes max HP and EXP; the browser must either read MONSTERPROP or accept a wrong bar. Not known what this server uses.
7. **Resource copies**: `Res/DiePenalty.inc`, `expTable.inc`, `propJob.inc`, `propMover.txt` were read from this tree; the deployed server could load others. The Resource tree is also what the converter reads.
8. **Order of drop ADD_OBJ versus MOVERDEATH**: drops go through `ADDOBJ`, which is queued until the world's next step, so they probably arrive in a later bundle; not traced to the bundle level.
9. **GETDESTOBJ**: unanswered QUERYGETDESTOBJ is probably harmless (the server's own chase just ends at its arrival), but then the server stops following while the browser is still walking; not tested.
10. **Server-side range at hit time**: none for players hitting monsters (confirmed), so a browser that attacks from far away is not stopped by the server; only the monster's own damage has the 10 m rule.
11. **Walk-in-combat motions**: combat state makes stand/walk/run use the weapon offset; peers' `stateFlag` COMBAT bit arrives in MOVERMOVED/BEHAVIOR; not checked how Piece 3 renders it today.
12. **`m_bSelectTarget`/timer semantics** are for a mouse (hold 500 ms to start). The phone's "tap again" and the planned attack button map to `m_bAutoAttack = TRUE`; there is no Neuz equivalent of an attack button.
13. Effects (`XI_HIT_*`, level-up, spark, sword force trail `MOP_SWDFORCE`), sounds and the `BGM_IN_DEATH`/`BGM_IN_LEVELUP` music are out of this research's depth beyond their IDs.
14. A `HATTR_DIE` death (`DoDie( NULL )`, `ActionMoverCollision.cpp:87-89, 265-267`) arrives as MOVERDEATH with attacker `NULL_ID` and `dwMsg` 0; the corpse then is `OBJSTA_DEAD` with `MTI_DIE1`; not otherwise traced.
