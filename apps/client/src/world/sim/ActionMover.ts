import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { NO_CEILING, collideMove, overHeight, processUnderCollision } from './collision';
import type { Ground } from './collision';
import { ActMsg, AniLoop, Ik3, Mop, Mti, ObjSta, ObjStaF } from './constants';
import { dot, normalize, vecLength } from './d3dx';

/**
 * The part of `CMover` the ground rules move: its position, its angle and its speed. Positions are D3D coordinates
 * and the angle FlyFF degrees, as the C++ holds them. `ActionMover` keeps this object and changes it in place, as
 * `CActionMover` changes its `m_pMover`.
 */
export interface MoverBody {
  /**
   * `m_vPos`, floats. The constructor, each step and `forceSet` put a new array here; writing into it in place (as
   * `SetPos` does) is fine, as the rules keep their own copy of the last position.
   */
  pos: Vec3;
  /** `m_fAngle`, always as `CObj::SetAngle` stores it (`wrapAngle`): the `ActionMover` wraps the one it is given. */
  angle: number;
  /** `CMover::GetSpeed( m_pActMover->m_fSpeed )` (`MoverParam.cpp:3248`): how far a run goes in one step. */
  speed: number;
  /**
   * `CMover::IsPlayer()`: only a player takes the falling state (`ActionMoverCollision.cpp:314-317`), swings at its
   * attack speed (`ProcessAniSpeed`) and ends a swing as a player (`_ProcessStateAttack`). Default `false`.
   */
  isPlayer?: boolean;
}

/** `m_dwMotion = -1` in a `DWORD` (`CMover::Init`, `Mover.cpp:228`, and `ActionForceSet`): no motion yet. */
const NO_MOTION = 0xffffffff;

/**
 * `CObj::SetAngle` (`Source/_Common/Obj.cpp:662-664`): the angle as `m_fAngle` stores it, in 65536 steps a circle:
 * `(float)( (360.0/65536) * ((int)(fAngle*(65536/360.0)) & 65535) )`. The `int` cast truncates toward zero and the
 * mask wraps a negative angle or one of 360 or more into 0..360; the parameter is a `float`.
 */
export function wrapAngle(angle: number): number {
  return Math.fround((360 / 65536) * (Math.trunc(Math.fround(angle) * (65536 / 360)) & 65535));
}

/**
 * The C++ keeps positions, deltas, angles and speeds in `float`s (`D3DXVECTOR3`, `FLOAT`), and over a few seconds
 * that moves a mover measurably differently from doubles (5.9 cm in 10 s at x = 7000). So every store into one of
 * them, and every product, sum or constant on the way, is rounded to a float here. One float operation done in
 * doubles and then rounded gives the float result exactly (a double has more than twice a float's precision);
 * `sinf`/`cosf` are taken as the rounded double `sin`/`cos`, which a C runtime may miss by one unit in rare cases.
 */
const f32 = Math.fround;

/** `D3DXToRadian( degree )`: `(degree) * (D3DX_PI / 180.0f)` with `D3DX_PI` `3.141592654f` (`d3dx9math.h:28-31`). */
const RADIANS_PER_DEGREE = f32(f32(3.141592654) / 180);
const radians = (degrees: number): number => f32(degrees * RADIANS_PER_DEGREE);
/** `D3DXToDegree( radian )`: `(radian) * (180.0f / D3DX_PI)`. */
const DEGREES_PER_RADIAN = f32(180 / f32(3.141592654));

/** `0.005f`, the fall a step adds to `m_vDelta.y` (`ActionMover.cpp:294`). */
const GRAVITY = f32(0.005);
/** `0.001f`, the height change that takes a mover off the ground (`ActionMover.cpp:284`). */
const MOVED_HEIGHT = f32(0.001);
/** `-0.1f`: falling faster than this takes the falling state (`ActionMoverCollision.cpp:308`). */
const FALLING_SPEED = f32(-0.1);
/** `pPos->y + 1.0f` (`ActionMoverCollision.cpp:292`): the ground is looked for from 1 over the feet down. */
const UNDER_FROM = 1;
/** `1.5f` (:368-382): the head, which a ceiling stops; then `m_vDelta.y = -0.01f`. */
const HEAD_HEIGHT = 1.5;
const CEILING_BOUNCE = f32(-0.01);
/** `__FIX_COLLISION` (:225-232): a slid move longer than `0.15f` a step becomes the mover's delta. */
const FIX_COLLISION_LENGTH = f32(0.15);
/** `__FIX_COLLISION` (`ActionMover.cpp:322-327`): an outside force weaker than this (squared) stops; else it keeps 0.9 of itself. */
const DELTA_E_STOP = f32(0.01);
const DELTA_E_FRICTION = f32(0.9);
/** The knock-back of a forced death: `DoDamageFly( attacker's angle, 145.0f, 0.25f )` (`ActionMoverMsg.cpp:959`). */
const DIE_FLY_ANGLE_Y = 145;
const DIE_FLY_POWER = f32(0.25);
/** The knock-back of a hit: `DoDamageFly( attacker's angle, 145.0f, 0.18f )` (`Neuz/DPClient.cpp:1919`). */
const HIT_FLY_ANGLE_Y = 145;
const HIT_FLY_POWER = f32(0.18);
/** `m_vDelta.y = 0.04f`: the bounce of a knocked-flying mover as it lands (`__BS_FIXED_KNOCKBACK`, `ActionMoverState.cpp:492-496`). */
const LANDING_BOUNCE = f32(0.04);
/** `AF_GENERIC`, what a swing answers on the client: it never rolls the hit, the server does (`ActionMoverMsg.cpp:698-700`). */
const AF_GENERIC = 1;
/** `MAX_ACTMSG` (`Action.h:10`): `CActMsgq` is a ring of 0xff entries, one always empty, so it keeps 254. */
const MELEE_QUEUE_SIZE = 0xff - 1;
/**
 * The groups of states whose states are copied, in `ProcessAction`'s order (`ActionMover.cpp:241-274`); the look and
 * action ones are not.
 */
const STATE_GROUPS: readonly number[] = [ObjSta.MOVE_ALL, ObjSta.TURN_ALL, ObjSta.JUMP_ALL, ObjSta.ATK_ALL, ObjSta.DMG_ALL];
/** The swings of a melee combo, `OBJMSG_ATK1` to `OBJMSG_ATK4`, and their states and motions. */
const SWINGS: ReadonlyMap<number, { state: number; motion: number }> = new Map([
  [ActMsg.ATK1, { state: ObjSta.ATK1, motion: Mti.ATK1 }],
  [ActMsg.ATK2, { state: ObjSta.ATK2, motion: Mti.ATK2 }],
  [ActMsg.ATK3, { state: ObjSta.ATK3, motion: Mti.ATK3 }],
  [ActMsg.ATK4, { state: ObjSta.ATK4, motion: Mti.ATK4 }],
]);
const isSwing = (state: number): boolean =>
  state === ObjSta.ATK1 || state === ObjSta.ATK2 || state === ObjSta.ATK3 || state === ObjSta.ATK4;

const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
const toFloats = (v: Vec3): Vec3 => [f32(v[0]), f32(v[1]), f32(v[2])];

/**
 * `m_vDelta.x = sinf( fTheta ) * s; m_vDelta.z = -cosf( fTheta ) * s;` in floats, the move of `FMOVE` and `BMOVE`
 * (`ActionMoverState.cpp:212-230`, `:256-257`) and of `PresupposePos` (`ActionMover.cpp:377-387`, whose `sin`/`cos`
 * of a `float` are the float overloads).
 */
function moveDelta(out: Vec3, theta: number, s: number): void {
  out[0] = f32(f32(Math.sin(theta)) * s);
  out[2] = f32(-f32(Math.cos(theta)) * s);
}

/** The `s` of `moveDelta` for a move state: `fSpeed` running, `fSpeed/4.0f` walking, `-fSpeed/5.0f` backward. */
function moveSpeed(moveState: number, walk: boolean, speed: number): number | undefined {
  if (moveState === ObjSta.FMOVE) return walk ? f32(speed / 4) : speed;
  if (moveState === ObjSta.BMOVE) return f32(-speed / 5);
  return undefined;
}

/**
 * `GetDegree` (`Source/_Common/Obj.h:288-304`): the angle from `src` to `dest` on the ground, from the dot product
 * with `VelocityToVec( 0.0f, 1.0f )`, (0, 0, -1): `acosf`, then 360 minus it when x is negative. A swing faces its
 * target by it, and a walk to a point or a mover turns toward it (`moverRules.ts`).
 */
export function getDegree(dest: Vec3, src: Vec3): number {
  const dir = normalize([f32(dest[0] - src[0]), 0, f32(dest[2] - src[2])]);
  const degree = f32(f32(Math.acos(dot([0, 0, -1], dir))) * DEGREES_PER_RADIAN);
  return dir[0] < 0 ? f32(360 - degree) : degree;
}

/**
 * What `CMover::SetMotion` (`Mover.cpp:4821-4902`) reads of a mover to pick the motion set it plays in combat: the
 * item of its active hand (`GetActiveHandItemProp()`: the right hand's, or the bare hand's `II_WEA_HAN_HAND`, IK3_HAND,
 * when it is empty) and who holds it.
 */
export interface MotionHand {
  /** The item's `dwItemKind3` (`Ik3`). */
  kind3: number;
  /** `dwHanded == HD_TWO`. */
  twoHanded: boolean;
  /** `IsDualWeapon()`: a weapon in each hand (a shield is none). */
  dual: boolean;
  /** One of the four master bodies (`bMasterPlayer`, :4853-4856): no dual set, and a yoyo or bow plays +200. */
  master: boolean;
  /** A Psykeeper, or its master or hero: a wand plays `MTI_STAND_11`'s set, not `MTI_STAND_02`'s (:4885-4890). */
  psykeeper: boolean;
}

/**
 * `CMover::SetMotion` (`Source/_Common/Mover.cpp:4822-4902`): the motion whose file a mover plays for the `MTI_*`
 * motion `motion` (`m_dwMotion` keeps the plain one, :4919). With `OBJSTAF_COMBAT` in `stateFlag` and no `MOP_FIXED` in
 * `option`, a player body plays the set of the weapon in its hand: dual weapons +900; a one-handed sword +200, a
 * two-handed one +800; an axe +500, +800 two-handed; a stick +400; a staff `+MTI_STAND_05`; a knuckle +700; a wand
 * `+MTI_STAND_02` (a Psykeeper's `+MTI_STAND_11`); a yoyo `+MTI_STAND_14`; a bow `+MTI_STAND_13`; anything else, the bare
 * hand included, +200. `hand` is null for a mover with no set: a monster or NPC, whose hand is a virtual item
 * (`IK3_VIRTUAL`, none of the cases, and not a player), or a player disguised as another mover (:4845-4851). A player
 * whose item has no row in the catalog is given the bare hand's set (Neuz, with no row, would not change its motion,
 * :4825-4839).
 */
export function motionFor(motion: number, hand: MotionHand | null, stateFlag: number, option = 0): number {
  if ((stateFlag & ObjStaF.COMBAT) === 0 || (option & Mop.FIXED) !== 0 || hand === null) return motion;
  if (hand.dual && !hand.master) return motion + 900;
  switch (hand.kind3) {
    case Ik3.YOYO: return motion + (hand.master ? 200 : Mti.STAND_14);
    case Ik3.BOW: return motion + (hand.master ? 200 : Mti.STAND_13);
    case Ik3.SWD: return motion + (hand.twoHanded ? 800 : 200);
    case Ik3.AXE: return motion + (hand.twoHanded ? 800 : 500);
    case Ik3.WAND: return motion + (hand.psykeeper ? Mti.STAND_11 : Mti.STAND_02);
    case Ik3.CHEERSTICK: return motion + 400;
    case Ik3.STAFF: return motion + Mti.STAND_05;
    case Ik3.KNUCKLEHAMMER: return motion + 700;
    default: return motion + 200;
  }
}

/** An attack kept for later (`ACTMSG`, `Action.h:61-69`): the message and its parameters. */
interface KeptAttack {
  msg: number;
  param1: number;
  param2: number;
  param3: number;
}

/**
 * `CActionMover` on the ground (`Source/_AIInterface/ActionMover*.cpp`): the action messages that change a mover's
 * state, and the step that moves it by that state, 60 times a second. Neuz moves every mover with these rules
 * between the server's messages, so a copy that keeps them moves others as their own clients do.
 *
 * Copied: the messages in `ActMsg` (`ProcessActMsg1`); the states `STAND`, `FMOVE`, `BMOVE`, `SIT`, `LTURN` and
 * `RTURN` (`ProcessState1`), and `SJUMP3`/`SJUMP4`, the falling and landing that the ground's height leads to;
 * `ProcessCollisionGround`, with the collision rules of `collision.ts`; `PresupposePos`; `CMover::ActionForceSet`.
 * Combat (Piece 4): the melee swings `ATK1` to `ATK4` with their hit frames, pause and end (`_ProcessStateAttack`), the
 * attacks kept while busy (`m_qMeleeAtkMsg`), the flinch (`SetDamagedMotion`), the knock-back flight and fall
 * (`OBJSTA_DMG_FLY`, `DMG_DIE`, `DMG_LIVE`, with the outside force `m_vDeltaE`), death, combat mode, and the animation
 * speed (`CMover::ProcessAniSpeed`). The model's side of it (its frame, `IsEndFrame`, `IsAttrHit`) is its owner's, who
 * sets the hooks; `m_nPause` is kept here (`paused`), where both the rules and the model read it.
 * Left out: flying (`IsFly`, flying NPCs), collecting, jumping on purpose, the `MVRF_NOMOVE`, `MVRF_NOATTACK` and
 * `CHS_LOOT` blocks and the stun (no buffs here), skills, and the world's edge (`CWorld::ClipX`/`ClipZ`);
 * `__Y_INTERFACE_VER3` (strafing) and `__X15` are off in Neuz's build. Positions, deltas and speeds are floats (`f32`).
 */
export class ActionMover {
  /** `m_dwState`: `OBJSTA_*` bits. */
  state = 0;
  /** `m_dwStateFlag`: `OBJSTAF_*` bits. */
  stateFlag = 0;
  /** `CMover::m_dwMotion`: the `MTI_*` motion set last (without the weapon's set: `motionFor`). */
  motion = NO_MOTION;
  /** `CMover::m_dwMotionOption` (`MOP_*`). */
  motionOption = 0;
  /**
   * How many times `SetMotion` has set a motion. Each time the model loads it and starts it from its first frame
   * (`CModelObject::LoadMotion` → `InitAnimate`, `ModelObject.cpp:579`, `Model.h:125-136`), the same motion set again
   * included, so this, not `motion`, tells the model's owner when to start it.
   */
  motionSets = 0;
  /** `m_pModel->m_nLoop` (`ANILOOP_*`), which `CModel::InitAnimate` starts at `ANILOOP_LOOP`. */
  loop: number = AniLoop.LOOP;
  /** `m_nMotionEx`. */
  motionEx = -1;
  /** `m_vDelta`: the movement per step. */
  delta: Vec3 = [0, 0, 0];
  /** `m_vDeltaE`: the outside force, a knock-back's flight; it is added to the delta each step and fades (`ProcessAction`). */
  deltaE: Vec3 = [0, 0, 0];
  /**
   * `CMover::m_fAniSpeed`: how fast the model's motion plays, 1.0 but for a player's swing, which plays at its attack
   * speed (`ProcessAniSpeed`, set at each step and as a swing starts). The model's owner reads it at each frame move.
   */
  aniSpeed = 1;
  /**
   * `m_pModel->m_nPause`: the steps the model's motion still holds still (`CModel::FrameMove` does nothing while it is
   * above 0, `Model.cpp:15-16`). `pause` sets it; a swing counts it down, a step at a time; a new motion clears it.
   */
  paused = 0;
  /** `m_idTarget`: the mover a swing hits, its object ID; null for `NULL_ID`. */
  targetId: number | null = null;
  /** `m_objidHit`: the mover a swing was started at, which the own character's combo goes on with; null for `NULL_ID`. */
  hitId: number | null = null;

  /**
   * `m_pModel->IsEndFrame()`: whether the motion has played to its end. No model plays it here, so by default every
   * motion has ended at once (sitting down takes one step); whoever plays the motions can answer from the animation.
   */
  isEndFrame: () => boolean = () => true;
  /**
   * `m_pModel->IsAttrHit()` (`ModelObject.h:280-286`, `CMotion::IsAttrHit`, `Bone.h:162-169`): the hit frame that the
   * model's last frame move went past, as its index in the motion's hit frames, or -1. By default -1: no model, no hits.
   */
  isAttrHit: () => number = () => -1;
  /** `CMover::ClearDest` (`Mover.h:1008`), which `STOP` calls. The destination is not kept here: its owner sets this. */
  clearDest: () => void = () => {};
  /**
   * `CMover::OnActDrop` (`MoverActEvent.cpp:1908-1977`), which `ProcessCollisionGround` calls when the mover starts to
   * fall (`ActionMoverCollision.cpp:306-319`), before the step puts it where it went. Its owner sets this.
   */
  onActDrop: () => void = () => {};
  /** `CMover::OnActEndJump4` (`MoverActEvent.cpp:2089`), which `CAction::OnEndJumpState` calls as a landing ends. */
  onEndJump4: () => void = () => {};
  /**
   * `prj.GetMover( id )` as the rules ask it: the rules of the mover in view with that object ID, or undefined
   * (`IsValidObj` fails). A swing needs its target, and a forced death its attacker. Its owner sets this.
   */
  findMover: (objectId: number) => ActionMover | undefined = () => undefined;
  /**
   * `CMover::m_nHitPoint`, which `IsLive` (`Mover.h:1222`) and the end of a fall (`OBJSTA_DMG_DIE`) read. Its owner sets
   * this; by default 0, so that the dead state alone tells life.
   */
  hitPoint: () => number = () => 0;
  /**
   * `CMover::GetAttackSpeed()` (`MoverAttack.cpp:159-192`, `params.ts`' `attackSpeed`): a player's. Its owner sets this
   * (the world for another player, from its job, right-hand item, DEX and level; the attack loop for the own one).
   */
  attackSpeed: () => number = () => 1;
  /**
   * `CMover::OnAttackMelee( dwState, pHitObj )` (`MoverActEvent.cpp:1592-1726`), which `_ProcessStateAttack` calls as the
   * model passes a hit frame of a swing (`ActionMoverState.cpp:1080-1090`), while its target (`targetId`) is in view and
   * alive: `hitIndex` is the hit frame's index in the motion's hit frames, `state` the swing's `OBJSTA_ATK*`. Its owner
   * makes the hit (`OnDamage`: the victim's spark, flinch and shake) and pauses the model (`pause`).
   */
  onHit: (hitIndex: number, state: number) => void = () => {};
  /**
   * Called as a swing's motion has played to its end and its state was reset (`_ProcessStateAttack`,
   * `ActionMoverState.cpp:809-814` for a player, `:938-944` for a monster), with the state it ended. The own
   * character's combo (`:815-846`: the next swing, by level, while auto-attacking) is its owner's.
   */
  onAttackEnd: (state: number) => void = () => {};
  /** The C runtime's `rand()`, 0 to `RAND_MAX` (32767, MSVC's), for `random( n )` (`xUtil.h:28`): `rand() % n`. */
  rand: () => number = () => Math.floor(Math.random() * 32768);

  /** `m_bGround`: 1 standing on the ground, 2 landed on a face steep enough to slide off. */
  private ground = 0;
  /** `m_bMove`: this step moves in x or z, or an outside force is on. */
  private moved = false;
  /** `m_vDeltaAccu`: the step's movement (`m_vDelta`), which the collision step adds. */
  private deltaAccu: Vec3 = [0, 0, 0];
  /** `m_vPosLast`: where the last step put the mover, a copy of its own (`ActionMover.cpp:192`). */
  private posLast: Vec3 = [0, 0, 0];
  /** `m_qMeleeAtkMsg` (`Action.h:274`): the swings a MELEE_ATTACK asked for while the mover was busy. */
  private readonly keptAttacks: KeptAttack[] = [];

  constructor(readonly body: MoverBody) {
    body.pos = toFloats(body.pos);
    body.angle = wrapAngle(body.angle);
  }

  /**
   * `CActionMover::SendActMsg` (`ActionMover.cpp:337`) on the ground: true when `ProcessActMsg1` returns 1 (a swing
   * returns `AF_GENERIC`, 1). The parameters are `nParam1` to `nParam3`; where the C++ passes a `CMover*` (the attacker
   * of `DIE`), its object ID.
   */
  sendActMsg(msg: number, ...params: number[]): boolean {
    return this.processActMsg1(msg, params[0] ?? 0, params[1] ?? 0, params[2] ?? 0) === 1;
  }

  /**
   * `CDPClient::OnMeleeAttack` (`Neuz/DPClient.cpp:3802-3815`) on its mover: the swing starts now, or, while the mover is
   * busy (`ProcessActMsg1` answers 0), is kept for the end of its swing (`m_qMeleeAtkMsg.AddTail`, `Action.cpp:230-237`:
   * none past 254). True when it started. The own character's are never kept: the server sends a MELEE_ATTACK to the
   * others only. A message this copy does not take (a monster's special attack) does nothing and is not kept, where it
   * would stand in the way of the rest.
   */
  meleeAttack(msg: number, targetId: number, param2 = 0, param3 = 0): boolean {
    const result = this.processActMsg1(msg, targetId, param2, param3);
    if (result === 0 && SWINGS.has(msg) && this.keptAttacks.length < MELEE_QUEUE_SIZE) {
      this.keptAttacks.push({ msg, param1: targetId, param2, param3 });
    }
    return result > 0;
  }

  /**
   * `CMover::SetDamagedMotion( pAttacker, dwAtkFlags )` (`Source/_Common/MoverAttack.cpp:2016-2064`) for a blow of a
   * hit frame, whose flags are `AF_GENERIC` on the client (`ActionMoverMsg.cpp:699`): a mover knocked flying is left
   * alone; any other takes the flinch state, and its motion, `MTI_DMG1 + random( 2 )`, unless it jumps, swings or is in
   * an action, which keep their motion with the state. The flying branch (`AF_FLYING`) is the DAMAGE message's, and the
   * hero skills' casting (`__LEGEND`, :2038-2046) needs skills.
   */
  setDamaged(): void {
    if (this.state & ObjSta.DMG_FLY_ALL) return;
    this.resetState(ObjSta.JUMP_ALL);
    this.setState(ObjSta.DMG_ALL, ObjSta.DMG);
    if (this.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL)) return;
    if (this.state & ObjSta.ACTION_ALL) return;
    this.motion = NO_MOTION;
    this.setMotion(Mti.DMG1 + (this.rand() % 2), AniLoop.ONE_PLAY);
  }

  /** `pModel->m_nPause = ticks` (`OnAttackMelee`, `MoverActEvent.cpp:1693-1701`): the model holds still for `ticks` steps. */
  pause(ticks: number): void {
    this.paused = ticks;
  }

  /**
   * `if( IsSit() ) ResetState( OBJSTA_MOVE_ALL )`, what a hit does to a sitting mover (`CDPClient::OnDamage`,
   * `Neuz/DPClient.cpp:1789-1790`, and `OnDamageMsgC`, `ActionMoverDmg.cpp:62-63`): its sitting state ends, and with it
   * the sitting flag (`resetState`).
   */
  unsit(): void {
    if (this.stateFlag & ObjStaF.SIT) this.resetState(ObjSta.MOVE_ALL);
  }

  /**
   * The knock-back of a DAMAGE with `AF_FLYING` on its victim, the attacker being in view (`CDPClient::OnDamage`,
   * `Neuz/DPClient.cpp:1910-1921`): unless the state is `OBJSTA_STUN` and nothing else (`GetState() != OBJSTA_STUN`, which
   * nearly always holds), the mover takes `OBJSTA_DMG_FLY` with `MTI_DMGFLY` held on its last frame, and is pushed the
   * way its attacker faces (`attackerAngle`), `DoDamageFly( fAngle, 145.0f, 0.18f )`. True where it was; the attacker's
   * `OBJMSG_STOP`, between the motion and the push in the C++ and with no bearing on either, is the caller's.
   */
  knockFlying(attackerAngle: number): boolean {
    if (this.state === ObjSta.STUN) return false;
    this.setState(ObjSta.DMG_ALL, ObjSta.DMG_FLY);
    this.setMotion(Mti.DMGFLY, AniLoop.CONT);
    this.doDamageFly(attackerAngle, HIT_FLY_ANGLE_Y, HIT_FLY_POWER);
    return true;
  }

  /**
   * A level up's motion (`CDPClient::OnSetLevel`, `Neuz/DPClient.cpp:3349-3350`, and `CMover::SetExperience`,
   * `MoverParam.cpp:1725-1726`): `MTI_LEVELUP`, once and as it is (`ANILOOP_1PLAY`, `MOP_FIXED`), when the state has a
   * standing bit. `IsState` is a bitwise test (`Action.h:307`), so `OBJSTA_SIT` (3) and `OBJSTA_BMOVE` (5) pass it too.
   */
  levelUpMotion(): void {
    if (this.state & (ObjSta.STAND | ObjSta.STAND2)) this.setMotion(Mti.LEVELUP, AniLoop.ONE_PLAY, Mop.FIXED);
  }

  /** `CAction::IsDie()` (`Action.h:310`): in a dead state. */
  isDie(): boolean {
    return (this.state & ObjSta.DIE_ALL) !== 0;
  }

  /**
   * One step of `CMover::Process` (`Source/_Common/Mover.cpp:3802-3906`) after `ProcessMove`: `ProcessPreAction`,
   * `ProcessAniSpeed`, `ProcessAction` (the states), `ProcessCollision` (`ProcessCollisionGround`,
   * `ActionMoverCollision.cpp:127-389`: the move against the objects and the land, then the height), then `SetPos`
   * only if there is land there (`GetWorld()->GetLandscape( vPos )`, a `terrainHeight` that is not null); otherwise the
   * mover stays where it was. The model's frame move (`:3862`), between the states and the collision, is its owner's,
   * after this. Where the move ends on no land the height part is skipped (the C++ measures it from no land, then does
   * not place the mover). Every mover on the ground collides alike (`collideMove`). Without `ground` nothing is in the
   * way and the mover keeps its height, as on a flat floor.
   *
   * `collided` is `ProcessCollision`'s answer where the mover was placed, for `OnActCollision` (`Mover.cpp:3899-3905`):
   * the move met an object (`CWorld::ProcessCollision`, which tests the objects only: steep land slides the mover in
   * the height part and is no collision), or the head a ceiling (:378-382).
   */
  step(ground?: Ground): { collided: boolean } {
    const pos = toFloats(this.body.pos);
    this.deltaAccu = [0, 0, 0];
    this.processAniSpeed();
    this.processAction(pos);
    const dy = this.deltaAccu[1]; // vDelta, the function's own copy of m_vDeltaAccu (:131)
    let collided = false; // fResult
    if (this.moved) {
      const { hit, move } = collideMove(pos, this.deltaAccu, ground);
      collided = hit;
      // __FIX_COLLISION (:225-232); the height below still goes by vDelta
      if (hit && vecLength(move) > FIX_COLLISION_LENGTH) {
        this.deltaAccu[1] = this.delta[1] = 0;
        this.delta[0] = move[0];
        this.delta[2] = move[2];
      }
    }
    const onLand = (): boolean => ground === undefined || ground.terrainHeight(pos[0], pos[2]) !== null;
    let placed = onLand();
    if (placed) {
      if (this.processHeight(pos, dy, ground)) collided = true;
      placed = onLand(); // a slide may have moved it
    }
    this.posLast = copy(pos);
    if (placed) this.body.pos = pos;
    return { collided: placed && collided };
  }

  /**
   * `CActionMover::PresupposePos` (`ActionMover.cpp:355-439`): where the mover will be `frames` steps on if its move
   * and turn states stay. Its own float angle turns by 4 and wraps at 360, without `SetAngle`. The world's edge
   * (`ClipX`/`ClipZ`) is left out, and `m_nCorr` is its caller's (`SimMover.nCorr`).
   */
  presuppose(frames: number): { pos: Vec3; delta: Vec3; angle: number } {
    const v = toFloats(this.body.pos);
    let f = f32(this.body.angle);
    const moveState = this.state & ObjSta.MOVE_ALL;
    const turnState = this.state & ObjSta.TURN_ALL;
    const s = moveSpeed(moveState, (this.stateFlag & ObjStaF.WALK) !== 0, f32(this.body.speed));
    const vDelta: Vec3 = [0, f32(this.delta[1]), 0];
    for (let i = 0; i < frames; i++) {
      if (s !== undefined) moveDelta(vDelta, radians(f), s);
      if (turnState === ObjSta.LTURN) {
        f = f32(f + 4);
        if (f > 360) f = f32(f - 360);
      } else if (turnState === ObjSta.RTURN) {
        f = f32(f - 4);
        if (f < 0) f = f32(f + 360);
      }
      v[0] = f32(v[0] + vDelta[0]);
      v[2] = f32(v[2] + vDelta[2]);
    }
    return { pos: v, delta: vDelta, angle: f };
  }

  /**
   * `CMover::ActionForceSet` (`Source/_Common/MoverParam.cpp:3321-3339`): the mover takes a reported move as it is.
   * Its first lines (`m_uRemnantCorrFrm = 0`, `ClearDestPos`, `ClearDestAngle`) and `DefaultSet`'s `m_fCrrSpd = 0`
   * belong to the correction and the destination, which the caller keeps (`moverRules.ts`). True when `ForcedSet`
   * took the state, which is when it calls `DefaultSet`.
   */
  forceSet(m: MoveReport): boolean {
    this.body.pos = toFloats(m.pos);
    this.body.angle = wrapAngle(m.angle);
    // CActionMover::ForcedSet (ActionMoverMsg.cpp:35-60): it does not take a change into or out of flying or sitting
    const from = this.stateFlag;
    const to = m.stateFlag;
    const took = (from & ObjStaF.FLY) === (to & ObjStaF.FLY) && (from & ObjStaF.SIT) === (to & ObjStaF.SIT);
    if (took) {
      this.delta = toFloats(m.delta);
      this.state = m.state >>> 0;
      this.stateFlag = to >>> 0;
      this.motionEx = m.motionEx;
    }
    this.motion = NO_MOTION;
    this.setMotion(m.motion, m.loop, m.motionOption);
    return took;
  }

  /**
   * What `CDPClient::SendPlayerBehavior` (`Neuz/DPClient.cpp:10113`) sends: `GetPos()`, `m_vDelta`, `GetAngle()` and
   * the state. PLAYERMOVED (`SendPlayerMoved`, :10081) sends the same with `presuppose(MAX_CORR_SIZE_45)`'s position,
   * delta and angle in their place.
   */
  report(tick: bigint): MoveReport {
    return {
      pos: copy(this.body.pos), delta: copy(this.delta), angle: this.body.angle, state: this.state,
      stateFlag: this.stateFlag, motion: this.motion, motionEx: this.motionEx, loop: this.loop,
      motionOption: this.motionOption, tick,
    };
  }

  /**
   * `CMover::ProcessAniSpeed` (`Mover.cpp:3084-3145`, `__AI_0509` on): a player swinging plays at its attack speed, any
   * other mover, and a player doing anything else, at 1.0. (The casting states, at `GetCastingAniSpeed`, are skills'.)
   */
  private processAniSpeed(): void {
    this.aniSpeed = this.body.isPlayer && isSwing(this.state & ObjSta.ATK_ALL) ? this.attackSpeed() : 1;
  }

  /** `CActionMover::ProcessAction` (`ActionMover.cpp:210-334`) on the ground; `vPos` is the position the step starts at. */
  private processAction(vPos: Vec3): void {
    this.delta[0] = this.delta[2] = 0;
    if (this.state === 0) {
      this.processActMsg1(ActMsg.STAND, 0, 0, 0);
    } else {
      const speed = f32(this.body.speed);
      for (let i = 0; i < STATE_GROUPS.length; i++) {
        const group = STATE_GROUPS[i]!;
        if (this.state & group) this.processState1(this.state & group, speed);
      }
    }
    const e = this.deltaE;
    this.moved = this.delta[0] !== 0 || this.delta[2] !== 0 || e[0] !== 0 || e[1] !== 0 || e[2] !== 0;
    if (this.delta[1] !== 0 || this.moved) this.ground = 0;
    else if (Math.abs(f32(vPos[1] - this.posLast[1])) > MOVED_HEIGHT) this.ground = 0;
    // gravity, except while vanishing after death
    if ((this.state & ObjSta.DMG_ALL) !== ObjSta.DISAPPEAR && this.ground !== 1) {
      this.delta[1] = f32(this.delta[1] - GRAVITY);
      if (this.delta[1] < -0.5) this.delta[1] = -0.5;
    }
    if (this.isDie()) e[0] = e[1] = e[2] = 0;
    // the outside force joins the delta (m_vDelta += m_vDeltaE), then fades, unless the mover is knocked flying
    for (let i = 0; i < 3; i++) {
      this.delta[i] = f32(this.delta[i]! + e[i]!);
      this.deltaAccu[i] = f32(this.deltaAccu[i]! + this.delta[i]!);
    }
    if ((this.state & ObjSta.DMG_FLY) === 0) {
      if (dot(e, e) < DELTA_E_STOP) e[0] = e[1] = e[2] = 0;
      for (let i = 0; i < 3; i++) e[i] = f32(e[i]! * DELTA_E_FRICTION);
    }
  }

  /**
   * The height part of `CActionMover::ProcessCollisionGround` (`ActionMoverCollision.cpp:276-388`), `dy` being the
   * step's fall or rise. Coming down, `ProcessUnderCollision` gives the height of the objects and terrain under the
   * mover, and the point a steep face slides it to; going up, the ceiling is `GetOverHeightForPlayer` for a player and
   * `GetOverHeight` for others (`__BOUND_BOX_COLLISION`, :364-373). Falling fast enough calls `onActDrop`. Landing on
   * ships and `__JEFF_11_6`'s returning NPC (a speed factor over 1.9, which does not slide; the factor is the rules',
   * `SimMover.speedFactor`) are left out. True where the head met a ceiling (`fResult = TRUE`, :381).
   */
  private processHeight(pos: Vec3, dy: number, ground: Ground | undefined): boolean {
    if ((this.state & ObjSta.DMG_ALL) === ObjSta.DISAPPEAR) return false;
    if (dy < 0) {
      if (this.ground === 1) return false;
      const slide: Vec3 = [0, 0, 0];
      const height = ground ? processUnderCollision(slide, [pos[0], f32(pos[1] + UNDER_FROM), pos[2]], ground) : pos[1];
      pos[1] = f32(pos[1] + dy);
      let landing = false;
      if ((this.state & ObjSta.JUMP_ALL) === ObjSta.SJUMP3) {
        if (pos[1] < height) landing = true;
      } else if (f32(pos[1] - 0.25) > height) {
        if (dy < FALLING_SPEED) {
          // a player takes the falling state (__SYS_COLLECTING, __BS_FIXED_KNOCKBACK); every mover calls OnActDrop
          if ((this.state & ObjSta.COLLECT) === 0 && this.body.isPlayer && (this.state & ObjSta.DMG_FLY_ALL) === 0) {
            this.setState(ObjSta.JUMP_ALL, ObjSta.SJUMP3);
          }
          this.onActDrop();
        }
      } else {
        landing = true;
      }
      if (landing) {
        if (slide[1] !== 0) {
          pos[0] = slide[0];
          pos[1] = slide[1];
          pos[2] = slide[2];
          this.ground = 2;
        } else {
          pos[1] = height;
          this.ground = 1;
        }
        this.delta[1] = 0;
      }
    } else if (dy > 0) {
      const head: Vec3 = [pos[0], f32(pos[1] + HEAD_HEIGHT), pos[2]];
      const ceiling = ground ? overHeight(head, ground, this.body.isPlayer === true) : NO_CEILING;
      pos[1] = f32(pos[1] + dy);
      if (f32(pos[1] + HEAD_HEIGHT) > ceiling) {
        pos[1] = f32(ceiling - HEAD_HEIGHT);
        this.delta[1] = CEILING_BOUNCE;
        return true;
      }
    }
    return false;
  }

  /** `CActionMover::ProcessActMsg1` (`ActionMoverMsg.cpp:101-1170`) for the messages in `ActMsg`. */
  private processActMsg1(msg: number, param1: number, param2: number, param3: number): number {
    const moveState = this.state & ObjSta.MOVE_ALL;
    switch (msg) {
      case ActMsg.STAND: // :108-134
        if (moveState === ObjSta.FMOVE || moveState === ObjSta.BMOVE) this.stopMove();
        if ((this.state & ObjSta.MOVE_ALL) === ObjSta.STAND) return 0;
        if ((this.state & ObjSta.MOVE_ALL) === ObjSta.PICKUP) return 0;
        if (this.state & ObjSta.JUMP_ALL) return -1;
        if (this.state & ObjSta.ATK_ALL) return -2;
        if (this.state & ObjSta.DMG_ALL) return -3;
        if (this.state & ObjSta.DIE_ALL) return -4;
        if (this.state & ObjSta.ACTION_ALL) return 0;
        this.setState(ObjSta.MOVE_ALL, ObjSta.STAND);
        this.setMotion(Mti.STAND);
        this.stateFlag &= ~ObjStaF.ETC;
        return 1;
      case ActMsg.STOP: // :135-153: 0 whatever it did, to match ControlGround
        if (moveState === ObjSta.FMOVE || moveState === ObjSta.BMOVE) this.stopMove();
        this.clearDest();
        return 0;
      case ActMsg.SITDOWN: // :154-171 (the REQ_USESKILL wait is left out)
        if (this.stateFlag & ObjStaF.SIT) return 0;
        if (param3 === 0 && this.isBusy()) return 0;
        this.stateFlag |= ObjStaF.SIT;
        this.processActMsg1(ActMsg.STOP, 0, 0, 0);
        this.setMotion(Mti.SIT, AniLoop.CONT);
        this.setState(ObjSta.MOVE_ALL, ObjSta.SIT);
        return 1;
      case ActMsg.STANDUP: // :172-188
        if ((this.stateFlag & ObjStaF.SIT) === 0) return 0;
        if (param3 === 0 && this.isBusy()) return 0;
        this.setState(ObjSta.MOVE_ALL, ObjSta.SIT); // ends the sitting state, so the flag goes back on
        this.stateFlag |= ObjStaF.SIT;
        this.setMotion(Mti.GETUP, AniLoop.CONT);
        return 1;
      case ActMsg.FORWARD: // :355-380
        if (this.state & ObjSta.JUMP_ALL) return -1;
        if (this.state & ObjSta.ATK_ALL) return -2;
        if (this.inDamage()) return -3;
        if ((this.state & ObjSta.MOVE_ALL) === ObjSta.FMOVE) return 0;
        if (this.stateFlag & ObjStaF.SIT) return 0;
        this.setState(ObjSta.MOVE_ALL, ObjSta.FMOVE);
        this.setMotion(this.stateFlag & ObjStaF.WALK ? Mti.WALK : Mti.RUN);
        return 1;
      case ActMsg.BACKWARD: // :403-417
        if (this.state & ObjSta.JUMP_ALL) return -1;
        if (this.state & ObjSta.ATK_ALL) return -2;
        if (this.state & ObjSta.DMG_ALL) return -3;
        if (moveState === ObjSta.BMOVE) return 0;
        if (this.stateFlag & ObjStaF.SIT) return 0;
        if (this.state & ObjSta.ACTION_ALL) return 0;
        this.setState(ObjSta.MOVE_ALL, ObjSta.BMOVE);
        this.setMotion(Mti.WALK);
        return 1;
      case ActMsg.LTURN: // :419-435
      case ActMsg.RTURN: { // :436-452
        const turn = msg === ActMsg.LTURN ? ObjSta.LTURN : ObjSta.RTURN;
        if (this.state & ObjSta.JUMP_ALL) return -1;
        if (this.state & ObjSta.ATK_ALL) return -2;
        if (this.inDamage()) return -3;
        if ((this.state & ObjSta.TURN_ALL) === turn) return 0;
        if (this.stateFlag & ObjStaF.SIT) return 0;
        if (this.state & ObjSta.ACTION_ALL) return 0;
        this.setState(ObjSta.TURN_ALL, turn);
        return 1;
      }
      case ActMsg.TURNMOVE: // :253-274 (the MVRF_NOMOVE and CHS_LOOT tests need buffs; SetAngleX is a flying NPC's)
        if (moveState === ObjSta.FMOVE && Math.trunc(this.body.angle) === param1) return 0;
        if (this.state & ObjSta.DMG_FLY_ALL) return 0;
        if (this.state & ObjSta.ATK_ALL) return -2;
        if (this.inDamage()) return -3;
        this.body.angle = wrapAngle(param1);
        this.processActMsg1(ActMsg.STOP_TURN, 0, 0, 0);
        this.processActMsg1(ActMsg.FORWARD, 0, 0, 0);
        return 1;
      case ActMsg.STOP_TURN: // :453-456
        if ((this.state & ObjSta.TURN_ALL) === 0) return 0;
        this.setState(ObjSta.TURN_ALL, 0);
        return 1;
      case ActMsg.ATK1: // :596-704
      case ActMsg.ATK2:
      case ActMsg.ATK3:
      case ActMsg.ATK4:
        return this.swing(SWINGS.get(msg)!, param1);
      case ActMsg.DIE: // :842-1003
        this.die(param1, param2);
        return 1;
      case ActMsg.MODE_COMBAT: // :1010-1020
        if (this.stateFlag & ObjStaF.COMBAT) return 0;
        if (this.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL | ObjSta.DMG_ALL)) return 0;
        if (this.stateFlag & ObjStaF.SIT) return 0;
        if (this.state & ObjSta.ACTION_ALL) return 0;
        this.stateFlag |= ObjStaF.COMBAT;
        this.motion = NO_MOTION; // the same motion again, so that the weapon's set of it is loaded
        this.setMotion(Mti.STAND);
        return 1;
      case ActMsg.MODE_WALK: // :1032-1037
        if (this.stateFlag & ObjStaF.SIT || this.state & ObjSta.ACTION_ALL) return 0;
        if (this.stateFlag & ObjStaF.WALK) return 0;
        this.stateFlag |= ObjStaF.WALK;
        return 1;
      case ActMsg.MODE_RUN: // :1038-1043
        if (this.stateFlag & ObjStaF.SIT || this.state & ObjSta.ACTION_ALL) return 0;
        if ((this.stateFlag & ObjStaF.WALK) === 0) return 0;
        this.stateFlag &= ~ObjStaF.WALK;
        return 1;
      default: // the other messages are not copied: they change nothing
        return 0;
    }
  }

  /**
   * `OBJMSG_ATK1` to `OBJMSG_ATK4` (`ActionMoverMsg.cpp:596-704`) at the mover `targetId`: refused (0) in an action and
   * while swinging, which `OnMeleeAttack` keeps for later; -1 for a target out of view or dead; -3 in a damage state
   * other than a flinch, which the swing ends. Then combat mode, a stop of the turn, standing, the attack speed for a
   * player, the swing's state and motion (`ANILOOP_1PLAY`, `MOP_SWDFORCE | MOP_NO_TRANS`), and the mover turns to the
   * target. The client never rolls the hit (`AF_GENERIC`). Left out: `MVRF_NOATTACK`/`NO_ATTACK_MODE` (buffs); the own
   * character's refusal with a wand or bow (:608-616), which never starts a melee swing with them; the steal rule
   * (server); `__XSLOW1018`'s slow blow (not built); and `CMover`'s own marks (`SetJJim`'s `m_idTargeter`, `m_nAtkCnt`).
   */
  private swing(swing: { state: number; motion: number }, targetId: number): number {
    if (this.state & ObjSta.ACTION_ALL) return 0;
    const target = this.findMover(targetId);
    if (target === undefined) return -1;
    this.targetId = targetId;
    if (target.isDie()) return -1;
    if (this.state & ObjSta.ATK_ALL) return 0;
    if (this.stateFlag & ObjStaF.SIT) this.resetState(ObjSta.MOVE_ALL);
    if ((this.state & ObjSta.DMG_ALL) === ObjSta.DMG) this.resetState(ObjSta.DMG_ALL);
    else if (this.state & ObjSta.DMG_ALL) return -3;
    if ((this.stateFlag & ObjStaF.COMBAT) === 0) this.processActMsg1(ActMsg.MODE_COMBAT, 0, 0, 0);
    this.processActMsg1(ActMsg.STOP_TURN, 0, 0, 0);
    this.processActMsg1(ActMsg.STAND, 0, 0, 0);
    if (this.body.isPlayer) this.aniSpeed = this.attackSpeed();
    this.setState(ObjSta.ATK_ALL, swing.state);
    this.setMotion(swing.motion, AniLoop.ONE_PLAY, Mop.SWDFORCE | Mop.NO_TRANS);
    this.body.angle = wrapAngle(getDegree(target.body.pos, this.body.pos));
    this.hitId = targetId;
    return AF_GENERIC;
  }

  /**
   * `OBJMSG_DIE` (`ActionMoverMsg.cpp:842-1003`, `__BS_DEATH_ACTION` off): `how` is the blow that killed (`OBJMSG_DAMAGE`,
   * `OBJMSG_DAMAGE_FORCE` or 0), `attackerId` the attacker. Sitting ends, every state is cleared, and the mover stops;
   * a forced blow knocks it flying the way its attacker faces (`OBJSTA_DMG_FLY`, `MTI_DMGFLY`); any other lays it dead
   * (`OBJSTA_DEAD`, `MTI_DIE1`), both held on their last frame. The duel and steal bookkeeping (`m_idAttacker`), the
   * buffs (`RemoveInvisible`) and the corpse's count to vanishing (`m_nDeadCnt`) are `CMover`'s and the server's.
   */
  private die(how: number, attackerId: number): void {
    if (this.stateFlag & ObjStaF.SIT) this.resetState(ObjSta.MOVE_ALL);
    this.clearState();
    this.delta[0] = this.delta[2] = 0;
    if (how === ActMsg.DAMAGE_FORCE) {
      this.setState(ObjSta.DMG_ALL, ObjSta.DMG_FLY);
      this.setMotion(Mti.DMGFLY, AniLoop.CONT);
      const attacker = this.findMover(attackerId);
      if (attacker !== undefined) this.doDamageFly(attacker.body.angle, DIE_FLY_ANGLE_Y, DIE_FLY_POWER);
    } else {
      this.setState(ObjSta.DMG_ALL, ObjSta.DEAD);
      this.setMotion(Mti.DIE1, AniLoop.CONT);
    }
  }

  /**
   * `CActionMover::DoDamageFly` (`ActionMover.cpp:446-454`): a push `power` strong, `angleXZ` degrees round on the
   * ground (the attacker's angle) and `angleY` degrees from straight down: up into `m_vDelta.y`, along into the
   * outside force.
   */
  private doDamageFly(angleXZ: number, angleY: number, power: number): void {
    const theta = radians(angleXZ);
    const theta2 = radians(angleY);
    this.delta[1] = f32(this.delta[1] + f32(-f32(Math.cos(theta2)) * power));
    const dist = f32(f32(Math.sin(theta2)) * power);
    this.deltaE[0] = f32(this.deltaE[0] + f32(f32(Math.sin(theta)) * dist));
    this.deltaE[2] = f32(this.deltaE[2] + f32(-f32(Math.cos(theta)) * dist));
  }

  /**
   * `CActionMover::ProcessState1` (`ActionMoverState.cpp:32-587`) for the copied states; `speed` is
   * `GetSpeed( m_fSpeed )`. The angle is read before this step's turn. Drawing (motion blending, the camera quake,
   * the stretching effect) is left out, and so are the random idle motions of a standing mover.
   */
  private processState1(dwState: number, speed: number): void {
    const theta = radians(this.body.angle);
    switch (dwState) {
      case ObjSta.STAND: // :41-89
        if (this.state === ObjSta.STAND) {
          if (this.stateFlag & ObjStaF.ETC) {
            // a custom motion: a one-play one ends by itself; a looping one waits for the player's click (not copied)
            if (this.loop === AniLoop.ONE_PLAY && this.isEndFrame()) this.stateFlag &= ~ObjStaF.ETC;
          } else if (this.isEndFrame()) {
            this.setMotion(Mti.STAND);
          }
        }
        if (this.ground && this.delta[1] <= 0) this.delta[0] = this.delta[2] = 0;
        break;
      case ObjSta.FMOVE: { // :194-241, not flying
        const walk = (this.stateFlag & ObjStaF.WALK) !== 0;
        moveDelta(this.delta, theta, moveSpeed(ObjSta.FMOVE, walk, speed)!);
        if (this.state !== ObjSta.FMOVE) break;
        this.setMotion(walk ? Mti.WALK : Mti.RUN);
        break;
      }
      case ObjSta.BMOVE: // :254-263
        if (this.state & ObjSta.DMG_ALL) break;
        moveDelta(this.delta, theta, moveSpeed(ObjSta.BMOVE, false, speed)!);
        if (this.state !== ObjSta.BMOVE) break;
        this.setMotion(Mti.BACK);
        break;
      case ObjSta.SIT: // :269-301
        if (this.motion === Mti.SIT) {
          if (this.isEndFrame()) this.setMotion(Mti.SITSTAND, AniLoop.LOOP);
        } else if (this.motion === Mti.GETUP) {
          if (this.isEndFrame()) this.resetState(ObjSta.MOVE_ALL);
        } else if (this.motion !== Mti.SITSTAND) {
          this.setMotion(Mti.SITSTAND, AniLoop.LOOP);
        }
        break;
      case ObjSta.LTURN: // :349-352: CObj::AddAngle (Obj.cpp:657)
        if ((this.state & ObjSta.ATK_ALL) === 0) this.body.angle = wrapAngle(this.body.angle + 4);
        break;
      case ObjSta.RTURN: // :353-356
        if ((this.state & ObjSta.ATK_ALL) === 0) this.body.angle = wrapAngle(this.body.angle - 4);
        break;
      case ObjSta.SJUMP3: // :395-412, falling (OnActLanding only shakes the camera for a boss)
        if ((this.state & ObjSta.DMG_ALL) === 0 || (this.state & ObjSta.COLLECT) === 0) this.setMotion(Mti.JUMP3, AniLoop.CONT);
        if (this.ground) {
          this.setState(ObjSta.JUMP_ALL, ObjSta.SJUMP4);
          if (this.state & ObjSta.DMG_ALL) break;
          this.setMotion(Mti.JUMP4, AniLoop.ONE_PLAY);
        }
        break;
      case ObjSta.SJUMP4: // :414-437, landed: the state ends at once, and with it OnActEndJump4 (resetState)
        this.resetState(ObjSta.JUMP_ALL);
        break;
      case ObjSta.ATK1: // :439-444
      case ObjSta.ATK2:
      case ObjSta.ATK3:
      case ObjSta.ATK4:
        this.processStateAttack(dwState);
        break;
      case ObjSta.DMG: // :472-477: the flinch ends with its motion
        if (this.isEndFrame()) this.resetState(ObjSta.DMG_ALL);
        break;
      case ObjSta.DMG_FLY: // :478-502 (a stunned mover's end, :481-485, needs the stun: none here)
        // on the ground with no rise: landed (it is on the ground as it takes off too, but rising)
        if (this.ground && this.delta[1] === 0) {
          this.delta[0] = this.delta[2] = 0;
          this.deltaE[0] = this.delta[0];
          this.deltaE[2] = this.delta[2];
          this.delta[1] = LANDING_BOUNCE;
          this.setState(ObjSta.DMG_ALL, ObjSta.DMG_DIE);
          this.setMotion(Mti.DMGDIE, AniLoop.CONT);
        }
        break;
      case ObjSta.DMG_DIE: // :504-521: down; with HP left it gets up, else it is dead
        this.delta[0] = this.delta[2] = 0;
        if (this.isEndFrame()) {
          if (this.hitPoint() > 0) {
            this.setState(ObjSta.DMG_ALL, ObjSta.DMG_LIVE);
            this.setMotion(Mti.DMGLIVE, AniLoop.ONE_PLAY);
          } else {
            this.setState(ObjSta.DMG_ALL, ObjSta.DEAD);
          }
        }
        break;
      case ObjSta.DMG_LIVE: // :523-530 (MVRF_NOACTION is CMover's)
        if (this.isEndFrame()) {
          this.resetState(ObjSta.DMG_ALL);
          this.resetState(ObjSta.ATK_ALL);
        }
        break;
      case ObjSta.DEAD: // :531-572: the body keeps the last frame; the count to vanishing is the server's, the quake drawing
        if (this.loop !== AniLoop.CONT) this.loop = AniLoop.CONT;
        break;
    }
  }

  /**
   * `CActionMover::_ProcessStateAttack` (`ActionMoverState.cpp:778-1105`) for a melee swing `dwState`. As its motion has
   * played to its end the state is reset (which may start a kept swing, `resetState`) and `onAttackEnd` told: a player's
   * at :809-814, where the own character's combo follows (its owner's); a monster's at :938-944, after `m_objidHit` is
   * cleared. Then, in the same step, a paused model counts a step off (:953-1031), and an unpaused one is asked for a
   * hit frame (:1080-1090), which `onHit` gets while the target is in view and alive (`IsLive`, `Mover.h:1222`).
   * Drawing is left out: the sparks of a player's pause, three monsters' charge effects and quakes, and a yoyo's shot;
   * so are `MVRF_HITCONT` and `OnAttackMeleeContinue` (three monsters' specials) and `OnEndMeleeAttack` (server AI).
   */
  private processStateAttack(dwState: number): void {
    if (this.isEndFrame()) {
      if (!this.body.isPlayer) this.hitId = null;
      this.resetState(ObjSta.ATK_ALL);
      this.onAttackEnd(dwState);
    }
    if (this.paused > 0) {
      this.paused--;
      return;
    }
    const hit = this.isAttrHit();
    if (hit < 0) return;
    const target = this.targetId === null ? undefined : this.findMover(this.targetId);
    if (target !== undefined && (!target.isDie() || target.hitPoint() > 0)) this.onHit(hit, dwState);
  }

  /**
   * `CMover::SetMotion` (`Mover.cpp:4817-4977`): false when the same motion with the same option is still playing,
   * loops, or holds its last frame. The weapon's motion set (`motionFor`) changes only the file played, not
   * `m_dwMotion`, and is its drawer's. A motion set loads it into the model, which starts it from its first frame
   * unpaused (`InitAnimate`): `motionSets` counts it and `paused` goes to 0.
   */
  private setMotion(motion: number, loop: number = AniLoop.LOOP, option = 0): boolean {
    if (this.motion === motion && this.motionOption === option) {
      if (loop === AniLoop.LOOP) return false;
      if (!this.isEndFrame()) return false;
      if (loop === AniLoop.CONT) return false;
    }
    this.motion = motion;
    this.motionOption = option;
    this.loop = loop;
    this.motionSets++;
    this.paused = 0;
    return true;
  }

  /** `CAction::SetState` and its `SetMoveState`/`SetTurnState`/`SetJumpState` (`Action.h:292-296`). */
  private setState(group: number, value: number): void {
    this.resetState(group);
    this.state = (this.state | value) >>> 0;
  }

  /**
   * `CAction::ResetState` (`Action.cpp:163-207`): clears the groups in `mask`, a group at a time, in its order, each
   * time all of `mask` (so a group's handler may set bits a later group clears). Ending a sitting state takes the
   * sitting flag off (`OnEndMoveState`, :69-78, before the clearing), ending a landing calls `onEndJump4`
   * (`OnEndJumpState( dw )` with the state as it was, :90-99) and ending a swing may start a kept one
   * (`OnEndAttackState( dw )`); the other `OnEnd*` handlers do nothing.
   */
  private resetState(mask: number): void {
    const was = this.state;
    const clear = (): void => {
      this.state = (this.state & ~mask) >>> 0;
    };
    if (mask & ObjSta.MOVE_ALL) {
      if ((this.state & ObjSta.MOVE_ALL) === ObjSta.SIT) this.stateFlag &= ~ObjStaF.SIT;
      clear();
    }
    if (mask & ObjSta.TURN_ALL) clear();
    if (mask & ObjSta.LOOK_ALL) clear();
    if (mask & ObjSta.JUMP_ALL) {
      clear();
      if ((was & ObjSta.JUMP_ALL) === ObjSta.SJUMP4) this.onEndJump4();
    }
    if (mask & ObjSta.ATK_ALL) {
      clear();
      this.onEndAttackState(was);
    }
    if (mask & ObjSta.DMG_ALL) clear();
    if (mask & ObjSta.ACTION_ALL) clear();
  }

  /**
   * `CAction::ClearState` (`Action.cpp:147-159`): every state ends, the handlers called. Death does it, and a revival
   * (`CDPClient::OnRevival`, `OnRevivalLodestar`, `Neuz/DPClient.cpp:3455`, :3489), after which the next step stands.
   */
  clearState(): void {
    this.resetState(ObjSta.ALL);
    this.state = 0;
  }

  /**
   * `CAction::OnEndAttackState` (`Action.cpp:101-135`) on the client, for the copied swings: the next kept swing starts
   * (`ProcessAtkMsg`, `CMeleeAtkMsgq::Process`, `ActionMover.cpp:32-57`). One that starts (above 0) leaves the queue; a
   * busy answer (0) keeps it and stops; one refused (below 0) leaves the queue and the next is tried. The own character
   * keeps none (`meleeAttack`), so its `IsActiveMover()` test is left out.
   */
  private onEndAttackState(was: number): void {
    if (!isSwing(was & ObjSta.ATK_ALL)) return;
    for (let kept = this.keptAttacks[0]; kept !== undefined; kept = this.keptAttacks[0]) {
      const result = this.processActMsg1(kept.msg, kept.param1, kept.param2, kept.param3);
      if (result === 0) return;
      this.keptAttacks.shift();
      if (result > 0) return;
    }
  }

  /** The stop that `OBJMSG_STAND` and `OBJMSG_STOP` make of a forward or backward move (:110-122, :138-150). */
  private stopMove(): void {
    this.resetState(ObjSta.MOVE_ALL);
    this.delta[0] = this.delta[2] = 0;
  }

  /** `IsActJump() || IsActAttack() || IsActDamage() || IsAction()`, which keep a mover from sitting down or up. */
  private isBusy(): boolean {
    return (this.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL | ObjSta.DMG_ALL | ObjSta.ACTION_ALL)) !== 0;
  }

  /** A command during a hit clears the hit; any other damage state refuses it (e.g. `ActionMoverMsg.cpp:358-361`). */
  private inDamage(): boolean {
    if ((this.state & ObjSta.DMG_ALL) === ObjSta.DMG) {
      this.resetState(ObjSta.DMG_ALL);
      return false;
    }
    return (this.state & ObjSta.DMG_ALL) !== 0;
  }
}
