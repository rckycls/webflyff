# Piece 7 M5 research: flying

This note backs `docs/superpowers/plans/2026-11-04-piece7-m5-flying.md` and argues from the Piece 7 spec, §3.6.

- C++ paths are relative to `Blouflash VS22 V15/Source/`. Data paths are relative to `Blouflash VS22 V15/`.
- The build is `__VER 15` with `__MAINSERVER`.
- Active defines here: `__HACK_1023`, `__JEFF_9_20`, `__NOLIMIT_RIDE_ITEM`, `__WING_ITEM` and `__BS_ADJUST_SYNC`. Not active: `__Y_INTERFACE_VER3`, `__IAOBJ0622`, `__BS_ADJUST_COLLISION` and `__VRCAMERA`.
- No owner-custom code is in the flight paths.
- English text comes from `Resource/textClient.inc` and `*.txt.txt`.

**The client's tick.** `SetFST` waits for a 16 ms quantum (`_Common/timer.cpp:516-524`, `FRAME_PER_SEC 60`), so it runs at 62.5 Hz. Every per-tick constant below is written for 1/60 s, and the browser's rules step at 60 Hz. The WorldServer runs at 15 Hz with 4 sub-steps (`__X15`, `Mover.cpp:3815-3817`).

## 1. Mounting and landing

**Mounting: a ride item used.**
- **From the inventory:** a double-click on an `IK1_RIDE` item (`_Interface/WndField.cpp:2137-2643`). It is refused silently while the feet are off the ground (`m_bGround == 0`, `:2400-2405`), and with "You cannot use items while trading." while a shop, bank or trade window is open.
- **From the task bar:** `CWndMgr::ObjectExecutor` (`_Interface/WndManager.cpp:2723-2777`), with the same ground check.
- **What it sends:** `SendDoUseItem(MAKELONG(0, objId), focus|NULL_ID, nPart)`. `nPart` is the prop's `dwParts` (13, `PARTS_RIDE`), or the equipped slot when the item is already worn.
- **The packet:** `PACKETTYPE_DOUSEITEM` 0x00ff0021 = `u32 id`, `u32 target`, `i32 part`, **`f32 fFlightSpeed`** (the prop's value, `__HACK_1023`) (`Neuz/DPClient.cpp:10860-10866`). The server compares that float with the prop and refuses a mismatch with `TID_GAME_MODIFY_FLIGHT_SPEED`.

**Landing: the same use again.**
- The ride is used once more while worn (`nPart` is then its equipped slot), or its equipment slot is double-clicked or dragged off: `SendDoEquip`.
- **The packet:** `PACKETTYPE_DOEQUIP` 0x00ff000b = `u32 objId`, `i32 part`, `f32 fFlightSpeed` (`DPClient.cpp:9336-9342`).
- There is **no landing key and no automatic landing**.

**The client's refusals before sending** (`CMover::IsUseItemReadyTime`, `_Common/Mover.cpp:2767-2826`):

| Condition | Text |
|---|---|
| Already equipped (landing) | none: every check is skipped |
| Level below 20 (`GetFlightLv()` is `level >= 20`, `Mover.h:540`; `dwFlightLimit`, `=` meaning 1; `II_RID_RID_STI_MAGIC01` has none, `__NOLIMIT_RIDE_ITEM`) | `TID_GAME_USEAIRCRAFT` "In order to ride a flying vehicle, you must reach level 20." |
| The world's `m_bFly` is false (the `.wld` `fly` token, default TRUE; `WorldFile.cpp:88-92`), or the cell is `HATTR_NOFLY` (height value ≥ 2000, `landscape.h:28-38`) | `TID_ERROR_NOFLY` "You cannot fly here." |
| Then the cast refusals of M3 (the ride items have `dwSkillReadyType` 2500) | `TID_PK_BLINK_LIMIT` / `TID_PK_STAND_LIMIT` / `TID_PK_FLIGHT_NOUSE` |
| A disguise buff (`DPClient.cpp:10329-10335`) | `TID_QUEST_DISQUISE_NOTFLY` "You cannot fly while transforming." |

- "Indoors" is not `m_bIsIndoor`, which drives the sky only.
- The server alone refuses a chaotic player (`TID_GAME_CHAOTIC_NOT_FLY`) and a player with a pet (`TID_GAME_CANNOT_FLY_WITH_PET`).

**The cast.** A ride has a cast (`castMs` 2500, `sfxReady` 117, XI_FLIGHT_READY), which goes through M3's path unchanged: STATEMODE ON, the ready effect and the gauge, then OFF.

**The server's confirmation is `SNAPSHOTTYPE_DOEQUIP` 0x0006, to everyone in view** (`OnDoEquip`, `DPClient.cpp:2459-2515`).
- **Fields:** `u8 nId`, `u32 idGuild`, `u8 fEquip`, `EQUIP_INFO` (12 bytes: `u32 dwId`, `i32 nOption`, `u8 byFlag` and 3 bytes of padding), `i32 nPart`. The browser already reads it.
- **For the own player**, `DoEquip` with part 13 (`MoverEquip.cpp:1804-1832`):
  - it plays `BGM_TH_FLYING` the first time, then `BGM_EV_LIGHTWING`;
  - it sends `OBJMSG_MODE_FLY(rideId, 0, 1)` and calls `ClearDest`, `ClearDestAngle` and clears the correction;
  - to land it sends `OBJMSG_MODE_GROUND(0, 0, 1)`.
- **For another player**, `DoFakeEquip` does the same (`:1896-1908`).
- **No state message is sent.** Flying is the client's own `OBJSTAF_FLY` (0x08).

**`OBJMSG_MODE_FLY`** (`ActionMoverMsg.cpp:1044-1104`):
1. Adds `OBJSTAF_FLY`.
2. If `m_nFuel` is −1, sets it to `dwFFuelReMax`.
3. Calls `ClearState()`.
4. For the own player: clears the focus, unlocks the camera and cancels the skill bar.
5. Loads the ride: `LoadModel(OT_ITEM, rideId)`, then `SetRide`.
6. Plays no take-off motion. The next tick's state 0 sends `OBJMSG_STAND`, which in flight plays `dwUseMotion + MTA_FSTAND1`, and the own player sends PLAYERMOVED2.

**`OBJMSG_MODE_GROUND`** (`ActionMoverMsg2.cpp:271-307`):
1. Removes `FLY` and `ACC`, and calls `ClearState()`.
2. For the own player: sets the roll to 0 and `angleX` to 0, and locks the camera.
3. `SetRide(NULL)`.
4. Keeps `m_vDelta.y`, so the character falls under ground gravity (−0.005 a tick, down to −0.5). In the air `SJUMP3` plays (`MTI_JUMP3`); on landing `SJUMP4` (`MTI_JUMP4`) (`ActionMoverCollision.cpp:306-321`).

**Forced landings.**
- Flying into an `HATTR_NOFLY` cell, or into any cell of a world without flight, takes back that tick's move and calls `UnequipRide()`: a local `EquipItem(FALSE)` (`ActionMoverCollision.cpp:77-95`, `MoverEquip.cpp:2575-2583`).
- Death calls `UnequipRide()` too (`Mover.cpp:5204-5205`).
- The client refuses a landing (`IsUnEquipAble`, `MoverEquip.cpp:1708-1728`) silently while sitting, or over `NOFLY`, `NOWALK` or `NOMOVE` land.

## 2. The PC's flight keys

`CWndWorld::ControlFlying` (`_Interface/WndWorldControlPlayer.cpp:666-947`). It runs every tick (from `CWndWorld::Process`, skipped while the left button holds a selection) and on each mouse move.

**Every call:**
- with `OBJSTAF_ACC` set it sends `OBJMSG_FORWARD`, otherwise `OBJMSG_STAND`;
- any message that returns 1 sets `fMoved`;
- at the end, `fMoved` sends **PLAYERMOVED2** (`nFrame` 37).

| Input | Effect |
|---|---|
| **Space** (rising edge) | Toggles: `ACC_STOP`, or `ACC_START` then `FORWARD`. |
| **X** (rising edge) | `MODE_TURBO_OFF` or `MODE_TURBO_ON`. ON needs `m_tmAccFuel > 0`. |
| **W** | `OBJMSG_LOOKDOWN` (nose down) only while above the ground (`GetFullHeight(pos) < pos.y`); otherwise nothing. |
| **S** | `OBJMSG_LOOKUP` (nose up). |
| neither W nor S | `OBJMSG_STOP_LOOK`. |
| **A / D** | Roll −1° / +1° a tick (to ±45, the camera's only), then `LTURN` / `RTURN` with `(int)(fFlightLRAngle*100)`. |
| neither A nor D | The roll returns to 0 by 2° a tick; `STOP_TURN`. |
| **Z** | Toggles tracking of the focus. |
| **Tab** | Cycles the in-air targets (§6). |
| **Left button held, or Insert** | Attacks the focus (§6). |
| **Mouse**, with the right button held (mode 0) or always (mode 1, by a right double-click) | `angle -= dx/2`, `angleX += dy/4` (clamped to ±45), then a PLAYERANGLE is queued. |
| Arrows / PageUp / PageDown / wheel / middle drag | The camera only. Releasing the middle or right button unlocks the camera again (its rotation goes back to 0). |

The keys come from `Neuz/NeuzMsgProc.cpp:167-182`.

**Neuz quirks, kept as they are:**
- `OBJMSG_LOOKUP` calls `SetTurnState(OBJSTA_LOOKUP)`. Going from W straight to S leaves the look bits at 0xC00, so the pitch freezes and LOOKUP returns 1 (a PLAYERMOVED2) every tick until S is let go.
- Letting go of Space during a turn: STAND clears FMOVE but returns 0 before it sets STAND, so the thrust stays at `fFlightSpeed × 0.75` until the turn ends.

## 3. The flight rules (one tick)

The order inside `CMover::Process` (`Mover.cpp:3524-3908`):
1. `m_nCorr--`;
2. `Interpolate`;
3. the ride's `FrameMove`;
4. `ProcessMove` (the ghost, §5);
5. `m_vDeltaAccu = 0`;
6. `ProcessAction`;
7. the animation;
8. `ProcessCollisionFly` (when `IsFly() || dwFlying == 1`);
9. `SetPos`.

`ControlFlying` runs after the world's process, so input takes effect on the next tick.

```
ProcessAction (ActionMover.cpp:210-334), flying:
  state == 0: SendActMsg(STAND); own player: SendPlayerMoved2()
  else ProcessState2 for MOVE (0xFF), TURN (0x300), LOOK (0xC00), then ATK, DMG
  ProcessFlyMove()                          // no gravity in flight
  m_vDelta += m_vDeltaE; m_vDeltaAccu += m_vDelta
  if !(state & DMG_FLY): if |m_vDeltaE|² < 0.01: m_vDeltaE = 0; m_vDeltaE *= 0.9

ProcessState2 (ActionMoverState2.cpp:452-552), prop = the ride:
  STAND:    m_fAccPower = 0; motion FSTAND1 unless ATK|TURN|DMG
  FMOVE:    m_fAccPower = prop.fFlightSpeed * 0.75; motion FRUNNING1 unless ATK|TURN
  LTURN:    AddAngle(+m_fTurnAngle * (ACC ? 1 : 2.5)); motion FLTURN1 unless attacking
  RTURN:    AddAngle(-m_fTurnAngle * (ACC ? 1 : 2.5)); motion FRTURN1 unless attacking
  LOOKUP:   if angleX > -45: AddAngleX(-prop.fFlightTBAngle)     // checked before, so it can pass ±45
  LOOKDOWN: if angleX <  45: AddAngleX(+prop.fFlightTBAngle)
  m_fTurnAngle = (int)(fFlightLRAngle*100)/100 (from the message)
  SetAngle wraps and quantises: a = (360/65536)*((int)(a*65536/360) & 65535)   (Obj.cpp:662-664)
  SetAngleX: no wrap, no quantisation                                           (Obj.cpp:684-693)

ProcessFlyMove (ActionMoverState2.cpp:343-445):
  lenSq = |m_vDelta|²; if lenSq == 0 && !ACC: return
  accPwr = m_fAccPower
  ProcessFlyTracking()                                   // own player with tracking, below
  if TURBO && ACC: if m_tmAccFuel <= 0 (the client only reads it): TURBO_OFF; else accPwr *= 1.2
  if accPwr > 0:
    aX = rad(angleX); a = rad(angle); d = cos(aX)*accPwr
    vAcc = (sin(a)*d, -sin(aX)*accPwr, -cos(a)*d)        // angleX > 0 is nose down; angle 0 faces -Z
    if lenSq > 0.01 && dot(norm(m_vDelta), norm(vAcc)) < 0.633319:   // cos(70 rad): "drift"
      vAcc *= 2; m_vDelta *= 0.985                        // and dust (XI_NAT_DUST_RUN) every 4th tick
    lenSq = |m_vDelta|²; maxSpd = 0.3 * (TURBO ? 1.1 : 1)
    if lenSq < maxSpd²: m_vDelta += vAcc
  m_vDelta *= 0.989
  if m_fAccPower == 0 && |m_vDelta|² < 0.0002²: m_vDelta = 0; RemoveStateFlag(ACC)
  own player: the speed shown = (int)((int)(|v|*216000)/200)    // |v| × 1080

ProcessCollisionFly (ActionMoverCollision.cpp:21-121):
  if m_fAccPower == 0 && m_vDeltaAccu == 0: return           // hovering: no clamp at all
  vStart = pos + (0, 0.5, 0); vDelta = m_vDeltaAccu
  objects (own player, or a mover with no destination): vDir = m_vDeltaAccu, |vDir| > 0.001,
    scaled up to 0.65 long; ProcessCollisionReflection(&vDelta, vStart, vDir, 0) against static objects
    (not the land): reflect out = D + 2(-D·N)N, up to 3 bounces (WorldIntersect.cpp:629-708);
    on a hit vDelta = vDelta / scale * 0.7; m_vDelta = vDelta
  pos.y += vDelta.y
  pos.x += vDelta.x; clip (10 m margin); NOMOVE takes x back
  pos.z += vDelta.z; clip; attr = world.fly ? attr(x,z) : NOFLY
    NOMOVE: z back;  DIE: DoDie;  NOFLY: the whole step back, UnequipRide()
  h = GetFullHeight(pos + (0,1,0))       // a ray down 2000: the nearest static object, else the land
  if pos.y > 200 (m_fMaxHeight, World.cpp:90): pos.y = 200
  elif cloud water there && h == 0: pos.y = max(pos.y, 85)      (m_fMinHeight)
  elif pos.y < h: pos.y = h                // m_vDelta.y is not zeroed
```

**Level flight from a stop** (FMOVE + ACC, `a = fFlightSpeed × 0.75`):
- each tick `v = (v + a) × 0.989` while `|v| < 0.3`, else `v × 0.989`;
- it settles near 0.3 m a tick.
- With turbo, the thrust is ×1.2 and the cap 0.33.

**Tracking** (`ProcessFlyTracking`, `:274-340`, own player with `MVRF_TRACKING`):
- the yaw turns 2.5° a tick toward the target when it is off by more than 3°;
- the pitch turns 1.5° a tick when it is off by more than 3°;
- then a PLAYERANGLE is queued.

**`PresupposePos2`** (`ActionMoverState2.cpp:34-147`): the prediction **sent** in the packets, 37 ticks ahead. It differs from the live rules:
- LOOK changes by 1° a tick, not by `fFlightTBAngle`; 0xC00 matches neither;
- turbo multiplies the thrust by 1.5, unchecked;
- there is no turbo cap and no collision;
- y is capped at 270 (`MAX_MOVE_HEIGHT`);
- it sets `m_nCorr = 37`.

## 4. The flight camera

`CBackCamera` (`_Common/Camera.cpp:184-446`). `CFlyCamera` is declared but never used.

**Its state in flight:**
- Unlocked: `MODE_FLY` and entering the world call `Unlock()`, which sets the rotations to 0. Its yaw then follows the heading.
- `Process(fFactor)` runs once a tick, with `fFactor` 10 in flight and 4 on the ground.

```
vPos = moverPos + (0, 0.9, 0)
tracking a focus: fAngle from the target, fAngleY = deg(atan2(|vT.xz|, vT.y)), fReg1 = clamp(vT.y/40, -2, 2),
                  curRoty = m_fRoty + m_fZoom*fReg1
else:             fAngle = moverAngle; fAngleY = 90; curRoty = m_fRoty + m_fZoom*4
curRoty += (1 - fAngleY/90)*45 + moverAngleX; curRoty = min(curRoty, 80)    // follows the pitch
fAngle = m_fRotx - fAngle + 180
off = (fDiv == 2) ? (0,0,-2) : (0,0,-4 - m_fZoom*2)
offDest = RotY(fAngle) * RotX(curRoty) * off
m_vOffset += (offDest - m_vOffset) / fFactor                 // the only smoothing: 1/10 a tick in flight
camPos = vPos + m_vOffset; lookAt = vPos + (0, 0.4, 0); CheckBound pull-in, and 0.37 a tick back out
```

- **Defaults:** `m_fZoom` 6, `m_fRoty` −12.
- **The field of view, in flight** (`World3D.cpp:58-109`), `fov = π / fDiv`:
  - ACC and turbo: `fDiv −= 0.2`, down to 2 (90°);
  - ACC without turbo: `fDiv += 0.05`, up to 4 (45°);
  - at 2 the camera snaps to 2 m behind.
- **The roll** of the up vector is an option, off by default (`g_Option.m_bRollEffect`).

## 5. The network

**What the client sends** (each starts with the `u32` DPID and the `u32` type):

| Packet | Id | Body | When |
|---|---|---|---|
| PLAYERMOVED2 | 0xffffff03 | `vec3 v, vec3 vd` (PresupposePos2 over 37 ticks), `f32 angle, angleX, accPower, turnAngle`, `u32 state, stateFlag, motion`, `i32 motionEx, loop`, `u32 motionOption`, `i64 tick`, `u8 nFrame` (37). 73 bytes. | When a ControlFlying message returns 1, and when the state is 0 (`DPClient.cpp:10150-10175`) |
| PLAYERANGLE | 0xffffff29 | `vec3 v, vd`, `f32 angle, angleX, accPower, turnAngle`, `i64 tick`. 48 bytes. | `FlushPlayerAngle` each FrameMove: at most every 30th call while a change waits (mouse steering, tracking) (`:14485-14517`) |
| PLAYERCORR2 | 0xffffff06 | As BEHAVIOR2. Neuz bug: `angleX` holds `turnAngle` (`:10911`). | On a flight collision within 37 ticks of a MOVED2 or ANGLE (`MoverActEvent.cpp:2016-2034`) |
| PLAYERBEHAVIOR2 | 0xffffff04 | The current `v, vd, angle, angleX, accPower, turnAngle, state, flag, motion, motionEx, loop, option, tick`. 72 bytes. | Only on entering a world while flying (`DPClient.cpp:1166-1169, 1253-1256`) |
| MELEE_ATTACK2 | 0x00ff0014 | `u32 msg, u32 target, i32 p2 (0), i32 p3 (0)`; no float | §6 |

**What the client reads.** Every handler returns early if the mover is not flying.

| Snapshot | Id | Handling |
|---|---|---|
| MOVERMOVED2 | 0x00cc | As PLAYERMOVED2. `delay = offset(tick) / 16.6667`. If `delay >= nFrame`, `ActionForceSet2` (a snap). If STAND with a jump of more than 0.1 m opposite the angle, force. Otherwise keep `m_CorrAction`: a look or turn change goes through the messages; else the remnant is `nFrame` and `SetDestPos(v)` (`:8726-8829`). |
| MOVERBEHAVIOR2 | 0x00cd | 72 bytes. `delay -= 35*2`. FLY: keep it, the remnant is `37 − delay`, `SetDestPos`. Not FLY: own player locks the camera; `ActionForceSet2`, which `ForcedSet2` refuses when FLY differs (`:8831-8891`). |
| MOVERANGLE | 0x00ce | `v, vd, angle, angleX, accPower, turnAngle, tick`. Keep it with `fHalf`, the remnant 37, `SetDestPos` (`:8893-8932`). The browser reads it and drops it. |
| MOVERCORR2 | 0x00c9 | Clears the destination, then `ActionForceSet2` (`:8964-8989`). |
| SENDACTMSG | 0x005c | `i32 msg, i32 bFly, i32 p1, p2, p3`, applied through `ProcessActMsg2`; how the server's TURBO_OFF arrives (`:14935-14951`). |
| MELEE_ATTACK2 | 0x00e4 | Another's in-air attack (`:3823-3837`), queued if busy. |
| SETFUEL | 0x004b | `i32 nFuel, i32 tmAccFuel`. `nFuel == 0` sends `ACC_STOP` (`:4026-4040`). |

**The ghost's convergence** (`ProcessMove`, `MoverMove.cpp:344-450`):
- When the remnant reaches 1, `ActionForceSet2` from the kept correction.
- `ApproachGhostAngle`: a tolerance of 0.601, otherwise `LTURN`/`RTURN` 60.
- Arriving (a sign flip of x or z against the destination) gives `HalfForceSet` if `fHalf`, else `ActionForceSet2`.
- While the remnant is above 0, each tick: `m_fDistance = |dest − pos|`, then `OBJMSG_TURNMOVE(GetDegree, GetDegreeX)` (`GetDegreeX` is negative for a target above), then `remnant--`.
- `TURNMOVE` (`ActionMoverMsg2.cpp:319-344`):
  - refused while attacking or damaged;
  - otherwise `STOP_TURN`, `ACC_START`, `SetAngle`, `SetAngleX`;
  - `f = 2·dist / (0.10·n²)`;
  - `m_vDelta = (sin a·cos aX·f, −sin aX·f·cos aX, −cos a·cos aX·f)`; the y term has an extra cos.

**Interpolation of another player** (`Interpolate`):
- The yaw snaps when it is less than 4° off; otherwise it moves `d/8`. That overshoots: a Neuz bug.
- The pitch snaps, clamped to ±45.
- A player's drawn position is rebuilt from `GetPos() + (0, 0.07, 0)` each frame, so the positional smoothing is discarded.

## 6. Attacks in the air

**The input** (`ControlFlying`, `:798-833`): the left button held, or Insert, with a mover focus, `IsAttackAble(focus)` and a weapon in hand.
- **A wand:**
  - the target must be within 60° of the 3-D heading (`dot ≥ 0.5`) and `IsRangeObj(target, 64)`;
  - then `DoAttackMagic`, which sends `MAGIC_ATTACK` with power 0;
  - in the air `ATK_MAGIC1` stops the turn and the move and plays `FATK1`.
- **Anything else, bows included:** `OBJMSG_ATK1(target)`.

**`OBJMSG_ATK1` in flight** (`ActionMoverMsg2.cpp:138-173`):
- The own player needs `IsRangeObj(target, 3.0)`.
- Adds `OBJSTAF_COMBAT`, sets `ATK1`, and plays `dwUseMotion + MTA_FATK1` once (`MOP_NO_TRANS|MOP_SWDFORCE|MOP_FIXED`).
- Then `SendMeleeAttack2(ATK1, target, 0, 0)`.

**The hit frame** (`_ProcessStateAttack2`, `ActionMoverState2.cpp:557-605`): `SendDamage(AF_GENERIC)` and the weapon's sound; a player pauses 5 frames.

**Targets** (`IsAttackAbleNPC`, `Mover.cpp:6615-6618`):
- A flying attacker can hit only a `dwFlying == 1` monster, and a grounded one only a grounded monster.
- No duels in the air (`TID_PK_NOFLIGHT_DURING`).

**Choosing a target in the air.**
- A click selects no monster: `SelectObj` is not called for NPCs while flying (`WndWorld.cpp:6869-6883`).
- **Tab** cycles `m_aFlyTarget`: the killable `dwFlying == 1` movers within 15° of the camera's forward direction, each marked with a red rectangle (`MoverRender.cpp:739-756`, `WndWorld.cpp:1108-1124`).

**Hurt in the air:** motion `dwUseMotion + MTA_FDMG1`.

**Skills in the air: refused silently** (`MoverMsg.cpp:176`, `MoverSkill.cpp:294`, `WndTaskBar.cpp:2220`).

## 7. Others flying, and the ride drawn

**Another player:**
- **Spawning already flying:** an ADD_OBJ whose state flag has FLY loads and sets its ride from `m_aEquipInfo[PARTS_RIDE]`. `m_nFuel` becomes `dwFFuelReMax × 0.2` if it is −1 (`DPClient.cpp:1270-1296`).
- **Mounting and landing later:** DOEQUIP, then `DoFakeEquip`.
- **Its motions:** the same messages and states drive `dwUseMotion + MTA_*`. There is no `MTI_FLY_*` in V15.

**The motion offsets** (`Resource/defineNeuz.h:920-932`):

| Offset | Motion | Offset | Motion | Offset | Motion |
|---|---|---|---|---|---|
| 0 | FSTAND1 | 5 | FRTURN1 | 10 | FATK1 |
| 1 | FIDLE1 | 6 | FRTURN2 | 11 | FATK2 |
| 2 | FIDLE2 | 7 | FRUNNING1 | 12 | FATK3 |
| 3 | FLTURN1 | 8 | FRUNNING2 | | |
| 4 | FLTURN2 | 9 | FDMG1 | | |

- The bases are `MTI_FSTAND1_A` 31, `_B` 61 and `_C` 91 (`:384-424`), chosen by the ride's `dwUseMotion`.
- The converted MI_MALE and MI_FEMALE have every one except 43, 72 and 103 (FATK3_A, FATK2_B, FATK3_C), which fall back to the stand.

**The ride drawn** (`MoverRender.cpp:591-712`):
- It is a model of its own (`LoadModel(OT_ITEM, id)`; `LoadElement` refuses part 13), drawn with the mover's world matrix.
- A broom (`IK3_STICK`) is raised by its root bone's y.
- Boned rides play their stand and walk motions; the ride's frame speed is `1 + |Δ lenSq|·7000`, +1.2 with ACC and turbo, clamped to 1–4.
- **The tilt** is the pitch only: `YawPitchRoll(−yaw, −angleX, 0)` (`Mover.cpp:4137-4217`). There is no roll on the models.
- **The board's tail** is `etc_Tail1.bmp`, while `lenSq > 0.001`.

## 8. Fuel

- **SETFUEL** (`i32 nFuel, i32 tmAccFuel`) sets both values; `nFuel == 0` stops the acceleration.
- **At the start** `m_nFuel` is −1 and `m_tmAccFuel` 0 (no turbo). The own ADD_OBJ carries both (`ObjSerializeOpt.cpp:441-442`); the browser reads and drops them (`addObj.ts:105-106`).
- **The client never lowers `m_nFuel`.** Only the server's SETFUEL changes it. The turbo's fuel is spent on the server, at 1000 ms a real second.
- **There is no fuel window.** While flying, the turbo gauge is drawn over the head (`RenderTurboGauge`, `WndWorld.cpp:1001-1007`, `MoverRender.cpp:990-1089`):
  - the pictures are `GauAccelBG.TGA` and `GauAccelInner.TGA` (converted in M3), 43 px over the head's projected top;
  - the width is `112 × tmAccFuel / 12000`;
  - with turbo on, the fill alternates with a white bar of `(96·v / max)·0.8` on odd and even drawn frames;
  - the speed number is drawn beside it in `Theme_FontDigital1.inc` digits, 16 px apart, then glyph 10.
- `TID_GAME_AIRFUELEMPTY` is unreachable: the fuel check of `ACC_START` is commented out.

## 9. Today's web client

**There is no flight code. Fliers are placed but never stepped** (`WorldState.step`, `:541-549`).
- `MOVERANGLE` is read and dropped.
- `ActionMover` and `forceSet` refuse FLY changes.
- `applyMoved` and `applyMoverCorr` skip fliers.
- `doUseSkill` refuses a flying caster.

**Constants:**
- Present: `ObjStaF.FLY` 0x08 and `ObjSta.LOOK_ALL` 0x0c00.
- Missing:
  - LOOKUP 0x400 and LOOKDOWN 0x800;
  - `ObjStaF` ACC 0x10, ACCTURN 0x40 and TURBO 0x80;
  - the ActMsg values MODE_FLY 22, MODE_GROUND 23, MODE_TURBO_ON 24, MODE_TURBO_OFF 25, MODE_TURN 26, ACC_START 27, ACC_STOP 28, LOOKUP 43, LOOKDOWN 44 and STOP_LOOK 45 (`MoverMsg.h:105-166`);
  - the MTA offsets;
  - PARTS_RIDE 13;
  - `MAX_CORR_SIZE_150` 37.

**The mover's body** is `{pos, angle, speed, isPlayer}`, with no `angleX`, `accPower`, `turnAngle` or fuel.

**Controls:**
- `controlIntent` maps the stick to a heading from the camera. Flight needs the stick's raw axes.
- The Jump button has no `onRelease`.
- Free keys: Z, Tab and Insert. Space, W, A, S, D and X are already ground keys whose meaning changes in flight, as in Neuz.

**The camera** (`backCamera.ts`, `scene/world/player.ts`):
- a chase camera 16 m back, the look 1.3 m up, its own pitch of 12°;
- its heading is set from the mover's angle once, then free;
- it does not know the mover's pitch.

**Network:**
- **Packets:** only MOVERANGLE exists among the flight packets. `MoveReport` has no flight fields. `decodeClientPacket` decodes no movement packet.
- **The gateway** (`apps/gateway/src/config.ts:29-40`):
  - `maxPacketBytes` 16384 and `maxPacketsPerSecond` 100, over a sliding 1 s window;
  - going past either closes the connection with LIMIT 4004.
- **The traffic test** (`apps/client/test/helpers/traffic.ts`):
  - `TRAFFIC_BUDGET` 50 in any 60 steps, through `busiestSecond`;
  - the joystick's bar is 22 in any 60 steps (`ownMover.test.ts:68-91`).

**Items:**
- **Mounting is blocked in three places:**
  - `ItemActions.equip` refuses part 13 (`itemActions.ts:17`);
  - the inventory's Equip hides part 13 (`inventoryWindow.ts:245`);
  - `usableFromBag` takes no ride (`travelItems.ts:36-38`).
- **Both encoders write the wrong float:** `encodeEquipItem` writes 0, and `encodeUseItem` writes none.
- **`WebItemProp` has no flight fields.** `propItem.ts` reads `fFlightSpeed`, `fFlightLRAngle`, `fFlightTBAngle`, `dwFlightLimit` and the fuel columns, but keeps none of them; `dwUseMotion` is kept but not exported.
- **`fFlightSpeed` needs its written text**, as `attackSpeedText` has, for the server's exact float.

**Already converted:**
- 81 rides (kind2 20, kind3 40 board / 41 broom, part 13, `castMs` 2500, `sfxReady` 117), with about 50 `models/item_ridrid*.glb`.
- The flight motions apart from 43, 72 and 103.

**Not converted:** the world's `fly` flag. `wld.ts` parses it, but the manifest never writes it. `Ground.landAttr` gives NOFLY per cell.

**Combat:**
- `attackAble(target)` is `!target.flying` whatever the own state.
- Flying monsters (the Mothbees 304-307 near level 20, and others) are never stepped and cannot be attacked.

**The test hooks:**
- `ClientMover` has no angle, stateFlag or angleX.
- `movedState` and `movedStateFlag` in the harness read fixed offsets.

## 10. The server and the data

**Mounting on the server.**
- `CDPSrvr::OnDoUseItem` (`WORLDSERVER/DPSrvr.cpp:12822-12870`) and `OnDoEquip` (`:763-813`) read the float for a ride that is not worn, and compare it with `fFlightSpeed` **exactly**. A mismatch gives `TID_GAME_MODIFY_FLIGHT_SPEED` "There seems to be a problem with your board, please relog and try again." and the request is dropped. A float that is missing reads as 0.0, so the browser's current DOUSEITEM would be refused for every ride.
- Then come the trade, vendor and quiz guards (`User.cpp:2930-2972`), and `DoUseItem` (`MoverSkill.cpp:1275-1323`, which refuses while attacking).
- `IsItemRedyTime` starts the 2.5 s cast; `TID_GAME_CANNOT_FLY_WITH_PET` with a pet.
- **After the cast, `CMover::IsEquipAble`** (`MoverEquip.cpp:1479-1567`) refuses:
  - **with a message:** the level (`TID_GAME_USEAIRCRAFT`), a world without flight (`TID_ERROR_NOFLY`), a disguise, a chaotic player (`TID_GAME_CHAOTIC_NOT_FLY`; every `ADDPENALTY` row of `PKSetting.inc` has fly 0), a pet, the sex or the job;
  - **silently:** NOFLY land, not standing, dead, a ride already worn, an expired ride.
  - `dwLimitLevel1` is `=` on every ride, so only `dwFlightLimit` matters.
- **The broadcast**, to all in view including the player: STATEMODE ON, then OFF, then `SNAPSHOTTYPE_DOEQUIP` 0x0006 (`User.cpp:4577-4603`).
  - Mounting comes through the cast's path, with `nPart` −1.
  - Landing gives `nPart` 13 and `fEquip` 0.
- A Vagrant ride (`dwItemJob == JOB_VAGRANT`) is deleted when it comes off (`MoverEquip.cpp:2567-2569`).
- **Entering already flying.** A player's ADD_OBJ carries the state flag (FLY) and the worn parts, the ride among them (`ObjSerializeOpt.cpp:110-111, 278-300`). Logging in on a ride runs `RedoEquip`, which sends MODE_FLY (`MoverEquip.cpp:1984-1996`).

**The flight packets on the server** (`DPSrvr.cpp:12622-12962`):
- MOVED2, BEHAVIOR2, ANGLE and CORR2 are applied only while the player flies. PLAYERMOVED and PLAYERBEHAVIOR return early while it flies.
- **No speed or distance check.** The only check against cheating is the mount's float.
- The delay is `offset ms / 66.67` (15 Hz). The server's `MAX_CORR_SIZE_150` is 9; the client's is 37.
- Between packets the server runs the same `ProcessFlyMove` and `ProcessCollisionFly`. It recomputes `m_fAccPower = fFlightSpeed × 0.75` on FMOVE, and forces a landing on NOFLY land.
- It sends MOVERMOVED2, MOVERBEHAVIOR2, MOVERANGLE and MOVERCORR2 to the others only, one for each packet received, batched in each player's 200 ms snapshot (`User.cpp:494-497, 4937-5035`).
- There is no heartbeat and no throttle. The gateway is the only limit.

**Fuel.**
- **SETFUEL 0x004b** (`i32 nFuel, u32 tmAccFuel`) goes to the player only:
  - every 16 server frames (about 1.07 s) while flying with ACC and `m_nFuel > 0` (`User.cpp:476-488`);
  - after a fuel item is used.
- `m_nFuel` is never lowered in V15. There is no forced landing for fuel.
- **The turbo:**
  - needs `m_tmAccFuel > 0`;
  - the server spends it in real time;
  - at 0 it sends **`SNAPSHOTTYPE_SENDACTMSG` 0x005c** (`i32 msg 25 TURBO_OFF, i32 bFly, i32 p1, p2, p3`) to all (`UserLux.cpp:283-295`).
- **Accelor Fuel** (`II_RID_AFU_ACC_SPEED` 5902, IK2_AIRFUEL 23, IK3_ACCEL 48) works only while flying. It sets `m_tmAccFuel = dwAFuelReMax × 1000` (12000, so 12 s) (`MoverSkill.cpp:1562-1590`).
- The other refills, IK3_CFLIGHT and IK3_BFLIGHT, have no rows in this Resource.

**Attacks in the air on the server.**
- **MELEE_ATTACK2** (`DPSrvr.cpp:2068-2099`):
  - no range check;
  - it is queued if the attacker is busy;
  - it goes to the others as `SNAPSHOTTYPE_MELEE_ATTACK2` 0x00e4 (`u32 msg, u32 target, i32 p2, p3`);
  - the damage takes the normal path (DAMAGE 0x0013).
- **Who may hit whom** (`MoverAttack.cpp:1776-1931`):
  - no player against player if either flies;
  - otherwise the attacker's flying must match the defender's (a `dwFlying` monster, or a flying player);
  - a guard hits anyone.
- **Refused in the air:**
  - silently: skills (CLEAR_USESKILL 0x001a), picking items up, private shops, teleports and portals;
  - with a message: disguise items (`TID_PK_FLIGHT_NOUSE`), pets (3210).
  - A bow has no in-air case.

**The rides** (`Resource/propItem.txt`; IK1_RIDE 4, IK2_RIDING 20, IK3_BOARD 40, IK3_STICK 41, PARTS_RIDE 13).
- **Every ride:** `dwSkillReadyType` 2500, `dwAFuelReMax` 12, `dwLimitLevel1` `=`.
- **Sold** (`dwFlightLimit` 1, so level 20) by **Dior (`MaFl_Dior`, Flaris)**, Tina (`MaSa_Tina`) and Almani (`MaDa_Almani`) (`character.inc:513-515, 1240-1242, 2281-2283`), with the Accelor Fuel:

| Id | Name | Rare | fFlightSpeed / LR / TB | dwFFuelReMax | Cost |
|---|---|---|---|---|---|
| 5000 | Magic Broom | 15 | 0.0023 / 0.6 / 1 | 1200 | 3000 |
| 5001 | Kestrel Broom | 20 | 0.0026 / 0.62 / 1.2 | 1800 | 15000 |
| 5002 | Flicker Broom | 25 | 0.003 / 0.64 / 1.4 | 2400 | 50000 |
| 5003 | Projan Broom | 30 | 0.0035 / 0.66 / 1.6 | 3000 | 200000 |
| 5101 | Hover Board | 15 | 0.0023 / 0.7 / 1.2 | 1200 | 3000 |
| 5102 | Aero Board | 20 | 0.0026 / 0.72 / 1.4 | 1800 | 15000 |
| 5103 | Wilduck Board | 25 | 0.003 / 0.74 / 1.6 | 2400 | 50000 |
| 5104 | Ignice Board | 30 | 0.0035 / 0.76 / 1.8 | 3000 | 200000 |

- **Unsold:** bikes, clouds, wings (IK3_WING, attached at the spine), sleds, carpets and others.
- The Magic Broom for Beginners (26514) and the Vagrant boards have no level limit.
- The owner's high-rate commit changed no ride row.

**Terminal speed** (level flight, no drift): `v* = a × 0.989 / 0.011` with `a = fFlightSpeed × 0.75`.
- Magic Broom: 0.155 m a tick, 9.3 m/s, shown as 167.
- Ignice Board: 0.236.
- With turbo ×1.2: 0.283.
- The 0.3 (turbo 0.33) cap binds only while drifting.

**Flying monsters** (`propMover.txt` `dwFlying` 1):
- **Mothbees:** Small Mothbee 304 (level 20), Mothbee 305 (20), Captain Mothbee 306 (21), Giant Mothbee 307 (25, boss).
- **Others:** Flbyrigen 300-303 (42-46), Rockepeller 308-311 (49-53).
- **Near Flaris** (`WdMadrigal.rgn`):
  - Small Mothbees at about (6909, 107, 3397), (6978, 117, 3574) and (7244, 114, 3461), eight each, respawning every 80 s;
  - more Mothbees east of town, x 8371-8854.
- **Their movement.** A flying monster (`OBJTYPE_FLYING`) keeps the ground states, but:
  - its FMOVE is `AngleToVector( angle, -angleX, speed )` (`ActionMoverState.cpp:121-125`);
  - TURNMOVE sets its `angleX` from `GetDegreeX` (`MoverMove.cpp:446`);
  - it has no gravity (`ActionMover.cpp:283-296`);
  - its collision is `ProcessCollisionFly`;
  - its LOOKUP and LOOKDOWN are ±1° a tick (`ActionMoverState.cpp:358-367`).
- At its destination it starts the figure-8 of `SNAPSHOTTYPE_SETMOVEPATTERN` 0x00cf (`i32 pattern, vec3 pos, f32 angle, f32 angleX`; `AIMonster.cpp:511-519`).

**Worlds.**
- **The `.wld` `fly` token:** `fly 1` in Madrigal (1), Kebaras (2) and Cisland (3), and in the large and middle guild houses. `fly 0` in every dungeon, Volcane, the Heavens, the arena, the guild wars, the small guild house, the miniroom and the quiz.
- **Per cell:** height values of 2000 or more are NOFLY.
- **Heights:** 200 at most, and 85 at least over cloud water only, hard-coded (`World.cpp:90-91`).

**The gateway** (`apps/gateway`): 100 messages a second per connection, over a sliding 1 s window, every message type counted, and 16384 bytes a message. Going past either closes with 4004. The flight bodies are 12 to 73 bytes.

**Owner-custom code beside these paths** (left out):
- `HIGH_RATE_STATS` 0x8871;
- `__BB_ARENA_3V3`;
- `__BB_DUNGEON_UI` (it refuses flyers in its dungeons);
- the custom world `WdIvilisTemple` (`fly 1`, not loaded).
