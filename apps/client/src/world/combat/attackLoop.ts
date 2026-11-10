// The own character's melee (spec §3.4): the presses that select and attack (`CWndWorld::OnLButtonDown`,
// `OnLButtonDblClk`, `OnLButtonUp`), the attack Neuz starts each frame while auto-attacking or holding the button
// (`CWndWorld::Process`, `UseFocusObj`, `CMover::CMD_SetMeleeAttack`, `SetDestObj`), the swing on arrival
// (`ProcessMoveArrival`'s command, `DoAttackMelee`), the combo at each swing's end (`_ProcessStateAttack`), and what
// stops it ([combat §2.6]). The rules it drives are `sim/`'s: the walk up to the target and the arrival are
// `stepMover`'s following of the destination object, and the swings are `ActionMover`'s.

import type { WebMover } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import type { ModelBox } from '@flyffweb/scene';
import type { OwnState } from '../OwnState';
import { isClientMade } from '../pets/raisedPet';
import type { ActionMover } from '../sim/ActionMover';
import { getDegree, wrapAngle } from '../sim/ActionMover';
import type { Ground } from '../sim/collision';
import { dot, normalize } from '../sim/d3dx';
import { getDegreeX } from '../sim/flightCollision';
import { ActMsg, Belli, Ik3, Mti, ObjSta, ObjStaF } from '../sim/constants';
import { clearDestObj, setDestObj } from '../sim/moverRules';
import type { SimMover } from '../sim/moverRules';
import { attackSpeed } from '../sim/params';
import type { WorldSession } from '../WorldSession';
import { isDie } from '../WorldState';
import type { Mover, WorldState } from '../WorldState';
import { isArenaTarget } from './arena';
import type { Focus } from './focus';
import { sightBlocked } from './lineOfSight';
import type { OwnShots } from './ownShots';

const f32 = Math.fround;

/** What the attack loop sends. */
export type AttackLoopSession = Pick<
  WorldSession, 'sendDestObj' | 'sendMeleeAttack' | 'sendGetDestObj' | 'sendBehavior' | 'sendMagicAttack' | 'sendRangeAttack'
> & Partial<Pick<WorldSession, 'sendMeleeAttack2'>>;

/** Piece 7 M2: `MAX_POWER_GAUGE` and `POWER_ATK_DELAY` (`WndWorld.cpp:81-82`), `MAX_CHARGE_LEVEL` (`DefineCommon.h:25`). */
const MAX_POWER_GAUGE = 1800;
const POWER_ATK_DELAY = 1800;
const MAX_CHARGE_LEVEL = 4;
/** `GetManaPoint() >= 5` (`WndWorld.cpp:956`): a wand with less shoots on its own a level lower. */
const WAND_FULL_MP = 5;
/** `AR_WAND` (`Resource/defineAttribute.h:89`): the wand's shot walks to its range whatever the wand (`MoverMsg.cpp:517`). */
const AR_WAND = 5;
/** The task bar's action points go no higher (`MoverSkill.cpp:3253-3257`). */
const MAX_ACTION_POINT = 100;

/**
 * `CMover::GetAttackRange( dwAttackRange )` (`MoverMsg.cpp:140-169`): how near an attack walks to its target, by its `AR_*`
 * (`AR_SHORT` 1 to `AR_HWAND` 7, `Resource/defineAttribute.h:85-91`); anything else, 0. `DST_HAWKEYE_RATE` (a buff) would
 * lengthen it: no buffs here.
 */
const ATTACK_RANGES: ReadonlyMap<number, number> = new Map([[1, 2], [2, 3], [3, 4], [4, 10], [5, 15], [6, 6], [7, 18]]);
export function attackRangeOf(ar: number): number {
  return ATTACK_RANGES.get(ar) ?? 0;
}

/**
 * Piece 7 M2: `CWndWorld::GetGaugePower` (`WndWorld.cpp:6454-6469`) `sincePress` ms after `m_dwPowerTick`: -1 while that is
 * still ahead (the lock-out after an automatic shot); else `MulDiv( min( t, 1800 ), 4, 1800 )`, rounded to the nearest
 * as `MulDiv` rounds: 0 below 225 ms, 1 from 225, 2 from 675, 3 from 1125, 4 from 1575.
 */
export function chargeLevel(sincePress: number): number {
  if (sincePress < 0) return -1;
  const t = Math.min(Math.trunc(sincePress), MAX_POWER_GAUGE);
  return Math.round((t * MAX_CHARGE_LEVEL) / MAX_POWER_GAUGE);
}

/** `m_oaCmd` of the attack loop's own: a melee attack, a wand's or a bow's shot, its target and its charge. */
interface AttackCmd {
  kind: 'melee' | 'magic' | 'range';
  targetId: number;
  power: number;
}

/** `IK2_TOOLS` (`Resource/defineItemkind.h:36`): a tool in the hand does not attack (`CMD_SetMeleeAttack`). */
const IK2_TOOLS = 18;
/** `m_timerFocusAttack.Set( 500 )` (`WndWorld.cpp:571`): holding the button this long on a new target attacks. */
const FOCUS_ATTACK_MS = 500;
/**
 * The combo of `_ProcessStateAttack` (`ActionMoverState.cpp:804-807`): leaving a swing, the level the next one needs and
 * the next one. After ATK4 none (999): the chain starts again with a new `CMD_SetMeleeAttack`.
 */
const COMBO: ReadonlyMap<number, { level: number; next: number }> = new Map([
  [ObjSta.ATK1, { level: 2, next: ActMsg.ATK2 }],
  [ObjSta.ATK2, { level: 8, next: ActMsg.ATK3 }],
  [ObjSta.ATK3, { level: 12, next: ActMsg.ATK4 }],
  [ObjSta.ATK4, { level: 999, next: ActMsg.ATK1 }],
]);
/** `INV_6 = 1.0f / 6.0f` (`Obj.cpp:778`). */
const INV_6 = f32(1 / 6);

/**
 * `CObj::GetRadius` (`Source/_Common/Obj.cpp:781-791`): the three sides of the model's box (`m_vMin`, `m_vMax`: for an
 * animated model the union of its parts' and its held items', `ModelObject.cpp:735-744`) added up, times `1.0f / 6.0f`,
 * times the scale's x, in floats. The world screen gives it the box the drawing has (`MoverViews.pickCandidates`).
 */
export function objRadius({ min, max }: ModelBox, scale: number): number {
  let radius = f32(Math.abs(f32(max[0] - min[0])));
  radius = f32(radius + f32(Math.abs(f32(max[1] - min[1]))));
  radius = f32(radius + f32(Math.abs(f32(max[2] - min[2]))));
  radius = f32(radius * INV_6);
  return f32(radius * f32(scale));
}

/** 2026-11-10: the own side of `IsArenaTarget`: the world the own mover is in and where it stands. */
export interface ArenaSide { worldId: number; pos: Vec3 }

/**
 * The verdict of `CMover::IsAttackAble( pObj )` on the client for a mover (`Mover.cpp:6469-6570`), with nothing of what it
 * does besides: a player only in a duel, a war, a school event, the Arena or PK (:6500-6525), of which the browser has the
 * Arena alone (2026-11-10, combat/arena.ts): another player is attackable only when `own` (where the own mover is) and
 * the player are both in the Arena's circle (`IsArenaTarget`, `MoverAttack.cpp:1953-1972`), and not dead (Neuz lets the
 * swing go and the server drops it, `GetHitType`'s `IsDie`, `MoverAttack.cpp:1824-1825`: the browser refuses at once).
 * A monster or NPC as `IsAttackAbleNPC` (:6572-6626) says: not dead (`IsDie`: its dead state, or no HP left), killable
 * (`bKillable`, and a row in the catalog), not peaceful (`IsPeaceful`, the ADD_OBJ's `m_dwBelligerence`) and, the player
 * on the ground, not flying (`dwFlying`). The attack loop's step adds what the C++ does with a refusal; the attack button
 * asks it alone (`canAttackFocus`).
 */
export function attackAble(
  target: Mover, moverProps: ReadonlyMap<number, Pick<WebMover, 'killable'>>, ownFlying = false, own?: ArenaSide,
): boolean {
  if (target.added.isPlayer) {
    return own !== undefined && !target.isSelf && !isDie(target) && isArenaTarget(own.worldId, own.pos, target.act.body.pos);
  }
  if (isDie(target)) return false;
  const prop = moverProps.get(target.added.index);
  if (prop === undefined || prop.killable === 0) return false;
  if (target.added.belligerence === Belli.PEACEFUL) return false;
  // Piece 7 M5: IsAttackAbleNPC (Mover.cpp:6615-6618): a flier hits only flying monsters, a walker only grounded ones
  return ownFlying ? target.flying : !target.flying;
}

/** Piece 7 M5: `cosf( D3DXToRadian( 60.0f ) )`: a wand fires in the air at a target within 60 degrees of the nose. */
const WAND_CONE = f32(Math.cos((60 * Math.PI) / 180));
/** Piece 7 M5: the air swing's reach and the wand's (`IsRangeObj( pObj, 3.0f )`, `IsRangeObj( pObj, 64.0f )`). */
const AIR_SWING_RANGE = 3;
const AIR_WAND_RANGE = 64;
/** Piece 7 M5: the targets Tab cycles lie within 15 degrees of where the camera looks (`MoverRender.cpp:739-756`). */
const FLY_TARGET_CONE = Math.cos((15 * Math.PI) / 180);

/** `CObj::IsRangeObj` as the rules have it: in 3-D, under 0.8 of each radius plus `range`. */
function inRangeObj(a: Mover, b: Mover, range: number): boolean {
  const r = f32(f32(f32(a.radius ?? 0) * 0.8) + f32(f32(f32(b.radius ?? 0) * 0.8) + range));
  const pa = a.act.body.pos;
  const pb = b.act.body.pos;
  const d = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2;
  return d < r * r;
}

/** The branch `CWndWorld::Process` runs (`WndWorld.cpp:8513-8537`): the attack, `ControlPlayer`, or neither. */
type ProcessBranch = 'attack' | 'controls' | 'none';

/**
 * What the attack loop asks of the own skill use (`SkillUse`): the skill's side of `CWndWorld::m_dwNextSkill`, of
 * `g_pPlayer`'s one command (`m_oaCmd`) and of its `REQ_USESKILL`.
 */
export interface OwnSkills {
  /** `m_dwNextSkill != NEXTSKILL_NONE`: a skill is reserved, and a swing's end starts no next swing (`ActionMoverState.cpp:826-828`). */
  readonly reserved: boolean;
  /** `GetCmd() == OBJACT_USESKILL`: the own mover goes to use a skill, and `Process` runs the controls (`WndWorld.cpp:8512`). */
  readonly commanding: boolean;
  /** `m_dwReqFlag & REQ_USESKILL`: a USESKILL waits for its answer, and the attack does not use the focus (:8522). */
  readonly pending: boolean;
  /** The skill's part of `ClearCmd()`: its command goes. */
  clearCmd(): void;
  /** The skill's part of a press in the world (`OnLButtonDown`, `WndWorld.cpp:6976-6987`). */
  worldPressed(): void;
  /** `ProcessMoveArrival`'s `OBJACT_USESKILL` (`MoverMove.cpp:80-184`): true where the skill's command took the arrival. */
  arrive(own: Mover, target: SimMover): boolean;
}

/**
 * `CMover::SetDestObj( objid, fRange, bSend = TRUE )` (`MoverMsg.cpp:47-84`) for the active mover `own`: following another
 * object than it does, it says so first: a PLAYERBEHAVIOR if it followed a player (`__BS_ADJUST_SYNC`, :55-61, `find`
 * being `prj.GetMover`), then PLAYERSETDESTOBJ, and `m_nCorr = -1` (so that the walk ends where it meets something,
 * `OnActCollision`); then the rules' `SetDestObj` (`m_idDest`, `m_fArrivalRange`, `ClearDestPos`). Its `m_oaCmd =
 * OBJACT_NONE` (:79) is the caller's, which sets its own command next.
 *
 * The browser's adaptation (Piece 6 spec §3.1): a walk to the object that a collision or a drop just ended
 * (`blockedTarget`, `MoverActEvent.cpp:2017-2037`) waits until `APPROACH_REPORT_STEPS` steps after the last
 * PLAYERSETDESTOBJ (`approachWait`), so that an auto-attack or a repeating skill at a wall asks at most 10 times a second
 * where Neuz asks at every step; a walk to another object goes at once. While it waits:
 * - after a stop at the obstacle, it is neither sent nor walked, and the answer is false, for a caller that asks only
 *   once (a skill's command) to ask again at the next step;
 * - after a slide along it (`blockedSlid`), the walk goes on here at full speed, untold (`untoldWalk`), with `m_nCorr` 0
 *   so that no collision ends it; once the wait is over, the server is told where it got to with a PLAYERBEHAVIOR,
 *   which keeps the server's walk (`CDPSrvr::OnPlayerBehavior`, where a PLAYERCORR's `ClearDest`s it), then the walk.
 */
export function setOwnDestObj(
  session: Pick<WorldSession, 'sendDestObj' | 'sendBehavior'>, tick: () => bigint,
  find: (objectId: number) => Mover | undefined, own: Mover, objectId: number, range: number,
): boolean {
  const old = own.dest?.targetId ?? null;
  const waiting = own.blockedTarget === objectId && (own.approachWait ?? 0) > 0;
  if (old !== objectId) {
    if (waiting && own.blockedSlid !== true) return false;
    own.untoldWalk = waiting;
    if (waiting) {
      own.nCorr = 0;
    } else {
      if (old !== null && find(old)?.added.isPlayer === true) session.sendBehavior(own.act.report(tick()));
      session.sendDestObj(objectId, range);
      own.nCorr = -1;
      own.approachWait = APPROACH_REPORT_STEPS;
    }
  } else if (own.untoldWalk === true && !waiting) {
    tellUntoldWalk(session, tick, own);
    session.sendDestObj(objectId, range);
    own.nCorr = -1;
    own.approachWait = APPROACH_REPORT_STEPS;
  }
  setDestObj(own, objectId, range);
  return true;
}

/**
 * The browser's: where an untold walk (`setOwnDestObj`) got to, as a PLAYERBEHAVIOR, before anything the server would
 * judge from the player's place (the walk again, a swing or a skill on arrival); nothing when there is none.
 */
export function tellUntoldWalk(session: Pick<WorldSession, 'sendBehavior'>, tick: () => bigint, own: Mover): void {
  if (own.untoldWalk !== true) return;
  own.untoldWalk = false;
  session.sendBehavior(own.act.report(tick()));
}

/** Rules steps between two PLAYERSETDESTOBJs to an object whose walk met something: 10 a second at 60 Hz. */
export const APPROACH_REPORT_STEPS = 6;

/**
 * The own character's auto-attack, a copy of `CWndWorld`'s and `g_pPlayer`'s part of it:
 * - the presses select a mover and turn the auto-attack on, or stop it (`onMoverPressed`, `onGroundPressed`,
 *   `onMoverHeld`, `onReleased`, and the touch screen's `attackButton`), as `OnLButtonDown`
 *   (`Source/_Interface/WndWorld.cpp:6712-7113`), `OnLButtonDblClk` (:7239-7263) and `OnLButtonUp` (:6471-6512) do; the
 *   focus is `Focus` (`CWorld::m_pObjFocus` and `m_pNextTargetObj`), whose SETTARGETs it sends;
 * - each rules step (`step`), the branch of `CWndWorld::Process` (:8513-8537): while auto-attacking, or holding the button
 *   500 ms on a target, `UseFocusObj` (:6197-6266) on an attackable focus (`IsAttackAble`, `_Common/Mover.cpp:6469-6626`),
 *   whose `CMD_SetMeleeAttack` (`_Common/MoverMsg.cpp:427-454`) walks the player to it (`SetDestObj`, :47-84:
 *   PLAYERSETDESTOBJ once per target followed); otherwise the controls (`ControlPlayer`), whose turn `step` answers;
 * - the command on arrival, which the rules' `ProcessMove` runs (`SimMover.arrive`, `ProcessMoveArrival`,
 *   `_Common/MoverMove.cpp:73-262`): `DoAttackMelee` (`_Common/MoverSkill.cpp:3436-3488`), the swing ATK1 and its
 *   MELEE_ATTACK;
 * - at each swing's end, the combo (`_ProcessStateAttack`, `_AIInterface/ActionMoverState.cpp:804-841`): the next swing,
 *   by level, while auto-attacking or holding the button, and its MELEE_ATTACK;
 * - what stops it (`stop`, `onRemoved`, `onMoverDeath`), and the answer to QUERYGETDESTOBJ.
 *
 * `world` gives the own mover (`g_pPlayer`, `self`) and the movers in view (`prj.GetMover`, `movers`); `own` the own
 * character's numbers (`OwnState`): its level, its hand's `fAttackSpeed` (MELEE_ATTACK sends it, the server refuses
 * another), its weapon; without them presses still select, but nothing attacks. `clock` gives the ticks of the
 * PLAYERBEHAVIOR `SetDestObj` sends; `moverProps` is the mover catalog (`bKillable`).
 *
 * The world screen calls `step` once a rules step, before the world's step, and runs the controls (`OwnMover.control`)
 * when it says so: `Process` runs one branch or the other, and both are the frame before's interface.
 *
 * The skills (milestone 2) are the own skill use's (`skills`, `OwnSkills`), with which the loop shares what Neuz keeps
 * once: the command (`m_oaCmd`: a skill's or a melee attack's, whichever was set last, `ClearCmd` dropping both), the
 * arrival, a reserved skill (`m_dwNextSkill`, whose branch of `Process` the skill use runs: `step( true )`), and the
 * request in flight (`REQ_USESKILL`). A skill begun turns the auto-attack on (`startAutoAttack`).
 *
 * Left out, as Piece 4 has none of them: flying, the
 * wand's and the bow's attacks (at the button's let-go, `CMD_SetMagicAttack`, `CMD_SetRangeAttack`), the yoyo's reach,
 * its line of sight on arrival and its short combo, attacking players (duels, PK, wars), the guards' disposition
 * (`RANK_GUARD` against a chaotic player), the Ctrl key's auto-attack, the menu of a peaceful NPC (Piece 5), standing a
 * sitting player up first (`SendMotion( OBJMSG_STANDUP )`: the browser's player never sits), buffs (`IK3_TEXT_DISGUISE`,
 * `MVRF_NOATTACK`) and `STATE_BASEMOTION_MODE`.
 */
export class AttackLoop {
  /** `m_bAutoAttack`. */
  private auto = false;
  /**
   * `m_bLButtonDown` while a press on a mover is held, which is also the `CTRLMSG_LDOWN` the combo reads: `ControlGround`
   * sets `m_dwCtrlMsg` from it as the press goes down and as it is let go (`WndWorldControlPlayer.cpp:235-238`), and not
   * in between, while `Process` runs the attack branch. (A press on the ground held down is the controls' tap.)
   */
  private buttonDown = false;
  /** `m_bSelectTarget`. */
  private selectTarget = false;
  /** When `m_timerFocusAttack` was last reset (ms); it was set as the window opened, long ago. */
  private focusTimer = -Infinity;
  /** The press held: the mover it went down on, and when it is known held till (ms, the presses' clock). */
  private held: { mover: number; at: number; until: number } | null = null;
  /**
   * `m_oaCmd`: `OBJACT_MELEE_ATTACK`, or (Piece 7 M2) `OBJACT_MAGIC_ATTACK` and `OBJACT_RANGE_ATTACK`, with its target
   * (`m_nCParam[0]`) and charge (`[1]`); null for `OBJACT_NONE`.
   */
  private cmd: AttackCmd | null = null;
  /** Piece 7 M2: `m_dwPowerTick` (`WndWorld.cpp:628`), on the presses' clock (ms): where the charge counts from. */
  private powerTick = 0;
  /**
   * Piece 7 M2: a text the loop prints (`g_WndMng.PutString( prj.GetText( id ), ... )`): `TID_TIP_NEEDSATTACKITEM` for a
   * bow with no arrows, `TID_GAME_BLOCKTARGETING` for a shot or a yoyo's swing behind an obstacle. Its owner shows it.
   */
  onText: (id: string) => void = () => {};
  /** Piece 7 M2: the land and objects round the own character, for the shots' line of sight; none, nothing is in the way. */
  ground: () => Ground | undefined = () => undefined;
  /** Piece 7 M2: the own `m_idSfxHit`, which MAGIC_ATTACK and RANGE_ATTACK carry. Its owner sets the world's. */
  shots: Pick<OwnShots, 'current'> = { current: 0 };
  /** `m_pRenderTargetObj`: the mover the target marks are on. */
  private renderTarget: number | null = null;
  private readonly bound = new WeakSet<ActionMover>();

  constructor(
    private readonly session: AttackLoopSession,
    private readonly focus: Focus,
    private readonly world: Pick<WorldState, 'self' | 'movers'>,
    private readonly own: () => OwnState | undefined,
    private readonly clock: { tick(): bigint },
    private readonly moverProps: ReadonlyMap<number, Pick<WebMover, 'killable'>>,
    private readonly skills?: OwnSkills,
    private readonly motionReady: (mover: Mover, motion: number) => boolean = () => true,
    /**
     * Piece 7 M3: true while an item casts, having sent its cancel (`ItemCast.interrupt`): an attack command is refused
     * (`IsAttackAble`, `Mover.cpp:6484-6494`). Asked where a command is made, never by the per-frame checks (Decision 4).
     */
    private readonly interruptCast: () => boolean = () => false,
  ) {}

  /** 2026-11-10: the world the own mover is in (the world screen's), for the Arena's rule (`IsArena`, combat/arena.ts). */
  worldId: () => number = () => 0;

  /** `m_bAutoAttack`. */
  get autoAttack(): boolean {
    return this.auto;
  }

  /** 2026-11-11: a melee, magic or range command under way (`m_oaCmd`): one that starts ends the auto-run. */
  get commanding(): boolean {
    return this.cmd !== null;
  }

  /** 2026-11-10: the own side of `IsArenaTarget` (`attackAble`'s `own`): the world and where the own mover stands. */
  private arenaSide(): ArenaSide | undefined {
    const own = this.world.self();
    return own === undefined ? undefined : { worldId: this.worldId(), pos: own.act.body.pos };
  }

  /**
   * `m_bSelectTarget`: a press on a mover is held (`OnLButtonDown`, `WndWorld.cpp:7090-7128`) until it is let go
   * (`OnLButtonUp`, :6512) or `Process` finds neither the button nor the auto-attack on (:8533-8537). The target corners
   * read it (`RenderFocusObj`, :3109).
   */
  get selectsTarget(): boolean {
    return this.selectTarget;
  }

  /**
   * `m_pRenderTargetObj`, the mover the target marks and the target bar are on: the last mover pressed that is a
   * player or not peaceful (`WndWorld.cpp:6888-6891`), or the next target taken after a kill (`SetNextTarget`,
   * :6411-6416); none after a press on the ground (:6928) or once the focus is cleared (`SetObjFocus( NULL )`,
   * `World.cpp:337-341`).
   */
  get renderTargetId(): number | null {
    return this.focus.targetId === null ? null : this.renderTarget;
  }

  /**
   * Whether the attack button of a touch screen is enabled (spec §3.9): the focus is a mover in view that `IsAttackAble`
   * accepts (`attackAble`, the rule the attack itself runs at each step), and the player is not dead (`attackButton` does
   * nothing then, as a dead player's press, `WndWorld.cpp:6719-6720`). It only asks: a dead focus is not cleared here, the
   * attack's step does that.
   */
  get canAttackFocus(): boolean {
    if (this.ownIsDead()) return false;
    const id = this.focus.targetId;
    const target = id === null ? undefined : this.world.movers.get(id);
    return target !== undefined &&
      attackAble(target, this.moverProps, this.world.self()?.act.isFlying() === true, this.arenaSide());
  }

  /**
   * A press on the mover `objectId` at `now` (ms), its second one of a double click if `double`. `CWndWorld::OnLButtonDown`
   * on a highlighted mover (`WndWorld.cpp:6712-7113`), not flying, with no right button down: the auto-attack goes off
   * when nothing is focused or queued (:6850-6853); the command is dropped (`ClearCmd`, :6854); the mover is selected
   * (`SelectObj`, :6353-6386, which focuses it unless auto-attacking, `__CSC_VER11_2`) and, a player or not peaceful,
   * marked (:6888-6891). Pressing the target again turns the auto-attack on, unless the hand holds a wand (:6892-6910,
   * `g_Option.m_bAutoAttack` being on by default, `HwOption.cpp:246`); another mover pressed while auto-attacking is
   * queued as the next target (:6912-6915); anything else turns it off. A peaceful NPC turns it off too, as its menu
   * opens (:7065-7078; the menu is Piece 5's). Then `m_bSelectTarget`, and the 500 ms of `m_timerFocusAttack` start
   * again for a target that is not the old one (:7090-7096).
   *
   * A double click's second press is `OnLButtonDblClk` instead (:7239-7263): the focused mover pressed again turns the
   * auto-attack on, unless the hand holds a wand. Either press is held (`m_bLButtonDown`, `WndBase.cpp:1324-1331,
   * 1374-1383`) until `onReleased`. A dead player presses nothing (:6719-6720). The first press also drops the skill's
   * command with the melee one (`ClearCmd`) and stops the action slot (`skills.worldPressed`, :6976-6987).
   */
  onMoverPressed(objectId: number, now: number, double: boolean): void {
    if (this.ownIsDead()) return;
    // Piece 7 M5 (Decision 5): in the air a press selects a killable flying monster, and nothing else (WndWorld.cpp:6868-6883)
    if (this.world.self()?.act.isFlying() === true) {
      const target = this.world.movers.get(objectId);
      this.buttonDown = true; // m_bLButtonDown: held, the air attack swings
      if (target === undefined || !attackAble(target, this.moverProps, true) || this.focus.targetId === objectId) return;
      this.focus.select(objectId);
      this.renderTarget = objectId;
      return;
    }
    // a press of its own ends an Attack-button hold whose let-go never came (attackButtonDown holds it again after)
    this.attackButtonHeld = false;
    this.buttonDown = true;
    this.held = { mover: objectId, at: now, until: now };
    if (double) {
      if (this.focus.targetId === objectId && !this.holdsWand()) this.auto = true;
      return;
    }
    const old = this.focus.targetId;
    if (this.focus.next === null && old === null) this.auto = false;
    this.clearCmd();
    if (!this.auto) this.focus.select(objectId);
    const mover = this.world.movers.get(objectId);
    const peaceful = mover !== undefined && mover.added.belligerence === Belli.PEACEFUL;
    // with nothing focused before, `SetObjFocus( NULL )` cleared the mark when the focus went (World.cpp:337-341)
    if (old === null) this.renderTarget = null;
    if (mover !== undefined && (mover.added.isPlayer || !peaceful)) this.renderTarget = objectId;
    if (old !== null && old === objectId) {
      this.auto = false;
      this.focus.next = null;
      if (!this.holdsWand()) this.auto = true;
    } else if (old !== null && this.auto && old !== objectId) {
      this.focus.next = objectId;
    } else {
      this.auto = false;
    }
    if (peaceful && !mover.added.isPlayer) this.auto = false;
    this.skills?.worldPressed(); // after the selection's SETTARGETs, as :6976-6987 come after SelectObj
    this.selectTarget = true;
    if (objectId !== old) this.focusTimer = now;
    this.powerTick = now; // Piece 7 M2: every press on a mover starts the charge again (:7097)
  }

  /**
   * A press on the ground, or on nothing (`OnLButtonDown` where the highlight is no mover, `WndWorld.cpp:6854`,
   * `:6919-6929`), as it goes down: the command dropped (the skill's too), the auto-attack off, and the next target and
   * the mark dropped; the focus stays (`SelectObj` focuses only what it picked); and the action slot stops
   * (`skills.worldPressed`, :6976-6987). A double click's second press is `OnLButtonDblClk` (:7239-7263), which stops
   * nothing.
   */
  onGroundPressed(double: boolean): void {
    if (this.attackButtonHeld) {
      // the Attack button's press whose let-go never came goes, with no shot: its finger is long gone
      this.attackButtonHeld = false;
      this.buttonDown = false;
      this.selectTarget = false;
      this.held = null;
    }
    if (double || this.ownIsDead()) return;
    this.stop('ground');
    this.skills?.worldPressed();
  }

  /**
   * The press on the mover `objectId` is still held, `heldMs` after it went down: once `m_timerFocusAttack` is out,
   * 500 ms after it was reset (a new target's press), the attack branch runs while it is held (`m_bLButtonDown &&
   * m_bSelectTarget && m_timerFocusAttack.IsTimeOut()`, `WndWorld.cpp:8517`; `CTimer::Over`, `timer.cpp:46-57`).
   */
  onMoverHeld(objectId: number, heldMs: number): void {
    const held = this.held;
    if (held === null || held.mover !== objectId) return;
    held.until = held.at + heldMs;
  }

  /**
   * The press let go at `now` (`OnLButtonUp`, `WndWorld.cpp:6471-6512`, after `CWndBase` clears `m_bLButtonDown`,
   * `WndBase.cpp:1142-1146`): its `ControlPlayer( WM_LBUTTONUP )` clears `CTRLMSG_LDOWN`, and `m_bSelectTarget` goes off.
   * Piece 7 M2: before that, with a wand or a bow, the shot at the charge reached (`releaseShot`, :6484-6503). With no
   * `now`, no shot.
   */
  onReleased(now?: number): void {
    if (this.attackButtonHeld) return; // the Attack button's press is let go by the button alone (attackButtonUp)
    this.buttonDown = false;
    if (now !== undefined && !this.ownIsDead()) this.releaseShot(now);
    this.selectTarget = false;
    this.held = null;
  }

  /**
   * The attack button of a touch screen (spec §3.4): Neuz has none; it is the focused mover pressed again, with no press
   * held, as `OnLButtonDblClk` takes it (`WndWorld.cpp:7248-7260`): the auto-attack goes on unless the hand holds a wand.
   */
  /**
   * Piece 7 M2: a press of the Attack button with a wand or a bow is under way. The canvas's let-go (`TapToWalk`'s, or the
   * screen's at a step for a press that ended with none, `WorldScreen.step`) is not the button's.
   */
  private attackButtonHeld = false;

  attackButton(): void {
    if (this.ownIsDead()) return;
    if (this.focus.targetId !== null && !this.holdsWand()) this.auto = true;
  }

  /**
   * Piece 7 M2 (plan, Decisions 4): the Attack button going down at `now`. With a wand or a bow it is a press on the
   * focused mover (`onMoverPressed`): held it charges, let go (`attackButtonUp`) it shoots. With any other hand it is
   * `attackButton`, as before.
   */
  attackButtonDown(now: number): void {
    if (!this.holdsRanged()) {
      this.attackButton();
      return;
    }
    const id = this.focus.targetId;
    if (id === null) return;
    this.onMoverPressed(id, now, false);
    this.attackButtonHeld = true;
  }

  /** Piece 7 M2: the Attack button let go at `now`: the let-go of its press (`onReleased`), if it made one. */
  attackButtonUp(now: number): void {
    if (!this.attackButtonHeld) return;
    this.attackButtonHeld = false;
    this.onReleased(now);
  }

  /**
   * Piece 7 M2: what `CMover::RenderGauge` draws over the own head (`WndWorld.cpp:930-1000`), or null for nothing: a
   * wand or a bow in the hand, a mover focused and the player alive. Full (4) in the lock-out after an automatic shot,
   * 0 while no press is held on the mover, else the charge reached at `now`.
   */
  gauge(now: number): number | null {
    if (!this.holdsRanged() || this.ownIsDead()) return null;
    const id = this.focus.targetId;
    if (id === null || !this.world.movers.has(id)) return null;
    const power = chargeLevel(now - this.powerTick);
    if (power === -1) return MAX_CHARGE_LEVEL;
    if (!this.buttonDown || !this.selectTarget) return 0;
    return power;
  }

  /**
   * Escape's part of `CWndMgr::Process` about the target (`WndManager.cpp:3321-3368`, `__CSC_VER11_2`), once the player is
   * not dead and the Start menu not open: with a next target queued, that one is dropped and the mark goes back on the
   * focus unless it is peaceful (:3327-3334); otherwise with a focus, `SetObjFocus( NULL )` (its SETTARGETs), the mark
   * off, `g_pPlayer->ClearDest()` (the walk up to the target ends) and the auto-attack off (:3335-3361). True when it did
   * either; false with nothing focused, when Escape goes on to the windows. (The casting cancel of :3342-3348 is for two
   * skills of later jobs, and `m_idObjFocusOld` and the tracking flag have no counterpart here.)
   */
  escape(): boolean {
    if (this.focus.next !== null) {
      this.focus.next = null;
      const focus = this.focus.targetId === null ? undefined : this.world.movers.get(this.focus.targetId);
      if (focus !== undefined && focus.added.belligerence !== Belli.PEACEFUL) this.renderTarget = focus.objectId;
      return true;
    }
    if (this.focus.targetId === null) return false;
    this.focus.select(null);
    this.renderTarget = null;
    this.world.self()?.act.clearDest();
    this.auto = false;
    return true;
  }

  /**
   * What stops the auto-attack ([combat §2.6]), with the command (`ClearCmd`): a movement key or the joystick (`move`:
   * `WndWorldControlPlayer.cpp:383-403`, and `CWndWorld::OnKeyDown` for W, A, S and D, `WndWorld.cpp:7739-7740`); a
   * press on the ground (`ground`: `onGroundPressed`, which also drops the next target and the mark, and leaves the
   * focus); the player's death (`died`: `CDPClient::OnMoverDeath`, `Neuz/DPClient.cpp:2080`, `onMoverDeath`); the
   * target killed by the player or gone from view (`target`: `onRemoved`, `onMoverDeath`). The focus is `Focus`'s to
   * clear. A press held on a mover past its 500 ms goes on attacking: Neuz reads no keys while it runs that branch. A
   * move and a press on the ground are `ClearCmd()`s, which drop a skill's command too (`WndWorldControlPlayer.cpp:399`,
   * `WndWorld.cpp:6854`).
   */
  stop(reason: 'move' | 'ground' | 'died' | 'target'): void {
    this.auto = false;
    if (reason === 'move' || reason === 'ground') this.clearCmd();
    else this.cmd = null;
    if (reason === 'ground') {
      this.focus.next = null;
      this.renderTarget = null;
    }
  }

  /**
   * `g_pPlayer->ClearCmd()` (`_Common/Mover.h:1770-1775`, `m_oaCmd = OBJACT_NONE`): the command goes, the melee attack's
   * or the skill's.
   */
  clearCmd(): void {
    this.cmd = null;
    this.skills?.clearCmd();
  }

  /**
   * A press on an NPC farther than the menu's range (`CWndWorld::ShowMoverMenu`, `WndWorld.cpp:6707-6708`):
   * `g_pPlayer->SetDestObj( pTarget )`, range 0, with no command, so nothing opens on arrival (`MoverMove.cpp:256-259`).
   */
  walkTo(objectId: number): void {
    if (this.world.self()?.act.isFlying() === true) return; // Piece 7 M5: nobody walks in the air
    const own = this.world.self();
    if (own === undefined) return;
    this.stop('move');
    this.setDestObj(own, objectId, 0);
  }

  /**
   * `m_bAutoAttack = TRUE` as a skill begins (`CDPClient::OnUseSkill`, `Neuz/DPClient.cpp:3912-3943`;
   * `CWndWorld::UseSkillToFocusObj`, `WndWorld.cpp:6280-6292`): the skill use asks it, which tests the hand and the skill.
   */
  startAutoAttack(): void {
    this.auto = true;
  }

  /**
   * The mover `objectId` is gone from view (DEL_OBJ: `CWorld::Process`, `World.cpp:883-902`): was it the target, the
   * focus goes, with no next target (`loseTarget`); was it the queued next target, that is forgotten (:901-902, which
   * leaves the mark as it is). The world screen calls it before the world drops the mover, so that the focus released
   * is as live as it is (`IsLive`, a dead one getting no release, `World.cpp:310`).
   */
  onRemoved(objectId: number): void {
    if (this.focus.targetId === objectId) this.loseTarget(false);
    else this.focus.onRemoved(objectId, false);
  }

  /**
   * `CDPClient::OnMoverDeath` (`Neuz/DPClient.cpp:1936-2090`) as the mover `victimId` dies, killed by `attackerId`
   * (`NULL_ID` for none), for the focus, the mark and the auto-attack. The world screen calls it as the message comes,
   * before the world sets the mover's HP to 0 and its dead state: the focus released then is live (`IsLive`,
   * `Mover.h:1222`), as in the C++, where its HP is 0 by then but its state not yet dead.
   * - The own death clears the focus (`SetObjFocus( NULL )`, :1949-1951) and stops the attack (`m_bAutoAttack = FALSE`,
   *   :2080).
   * - The own kill clears the focus whatever died (:1963), and the next target queued, kept through the clearing,
   *   becomes it (`SetNextTarget`, :1959-1970): `loseTarget` with the next.
   * - The queued next target dying is forgotten, the mark going back to the focus if it was on it (:1984-1993).
   * A target that another killed stays the focus: the attack finds it dead and clears it (`IsAttackAbleNPC`), or its
   * DEL_OBJ does.
   */
  onMoverDeath(victimId: number, attackerId: number): void {
    const self = this.world.self()?.objectId;
    if (self !== undefined && victimId === self) this.clearFocus();
    else if (self !== undefined && attackerId === self && this.focus.targetId !== null) this.loseTarget(true);
    if (this.focus.next === victimId) {
      if (this.renderTarget === victimId) this.renderTarget = this.focus.targetId;
      this.focus.next = null;
    }
    if (self !== undefined && victimId === self) this.stop('died');
  }

  /**
   * One rules step: the branch of `CWndWorld::Process` (`WndWorld.cpp:8503-8537`), decided once. `skillBranch` says the
   * skill use ran the branch of a reserved skill this step (`m_dwNextSkill`, :8505-8511, `SkillUse.step`): then neither
   * the attack nor the controls run. Else on the attack branch, `UseFocusObj` on an attackable focus while no USESKILL
   * waits for its answer (:8522). True where `Process` runs `ControlPlayer` this step, which the world screen then runs
   * (`OwnMover.control`); false on the attack branch and where neither runs (a press on a mover held before its 500 ms
   * are out). The own mover's hooks (the combo `onAttackEnd`, its animation speed `attackSpeed`, the command on arrival
   * `arrive`) are set at its first step.
   */
  step(skillBranch = false, now?: number): boolean {
    const own = this.world.self();
    if (own === undefined) return true;
    this.bind(own);
    // Piece 7 M5: in the air the attack is ControlFlying's (WndWorldControlPlayer.cpp:797-833), and nobody walks
    if (own.act.isFlying()) {
      this.airAttack(own);
      return false;
    }
    let controls = false;
    if (!skillBranch) {
      const branch = this.processBranch();
      if (branch === 'attack') {
        const target = this.world.movers.get(this.focus.targetId!)!;
        const state = this.own();
        if (state !== undefined && this.isAttackAble(target) && this.skills?.pending !== true) {
          this.useFocusObj(own, target, state);
        }
      } else if (!this.pressed()) {
        this.selectTarget = false; // the else branch (:8533-8537)
      }
      controls = branch === 'controls';
    }
    // Piece 7 M2: what `OnEraseBkgnd` does after `Process` each drawn frame: the automatic shot of a held charge
    if (now !== undefined) this.automaticShot(own, now);
    return controls;
  }

  /**
   * Piece 7 M5: the left button held, Insert, or the phone's Attack held: `ControlFlying` attacks the focus each step.
   */
  attackHeld = false;
  /** Piece 7 M5: `m_aFlyTarget`'s place (`m_nSelect`), and the mover tracked (`m_idTracking`, `MVRF_TRACKING`). */
  private flySelect = 0;
  private trackingId: number | null = null;

  /**
   * Piece 7 M5: `ControlFlying`'s attack (`WndWorldControlPlayer.cpp:797-833`): with the button held at an attackable
   * focus, a wand fires (`DoAttackMagic( pObj, 0 )`) at a target within 60 degrees of the nose (`AngleToVector( angle,
   * -angleX )`) and 64 m; any other hand swings (ATK1) within 3 m, and MELEE_ATTACK2 goes out as the swing starts.
   */
  private airAttack(own: Mover): void {
    const id = this.focus.targetId;
    const target = id === null ? undefined : this.world.movers.get(id);
    if (target === undefined || !(this.buttonDown || this.attackHeld)) return;
    if (!this.isAttackAble(target)) return;
    if (this.holdsWand()) {
      const a = own.act;
      const yaw = (a.body.angle * Math.PI) / 180;
      const pitch = (-a.angleX * Math.PI) / 180;
      const front: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      const to = normalize([
        target.act.body.pos[0] - a.body.pos[0], target.act.body.pos[1] - a.body.pos[1], target.act.body.pos[2] - a.body.pos[2],
      ]);
      if (dot(front, to) < WAND_CONE || !inRangeObj(own, target, AIR_WAND_RANGE)) return;
      const state = this.own();
      if (state !== undefined) this.doAttackMagic(own, target, 0, state);
      return;
    }
    if (!inRangeObj(own, target, AIR_SWING_RANGE)) return;
    if (own.act.actMsgError(ActMsg.ATK1, target.objectId) === 1) this.session.sendMeleeAttack2?.(ActMsg.ATK1, target.objectId);
  }

  /**
   * Piece 7 M5: Tab in the air (`ControlFlying`, :774-794): the next of the killable flying movers within 15 degrees of
   * the camera's forward (`cameraForward`, D3D), nearest first, becomes the focus and the tracked mover.
   */
  nextFlyTarget(cameraForward: Vec3): void {
    const own = this.world.self();
    if (own === undefined || !own.act.isFlying()) return;
    const forward = normalize(cameraForward);
    const at = own.act.body.pos;
    const targets = [...this.world.movers.values()]
      .filter((m) => m !== own && attackAble(m, this.moverProps, true))
      .map((m) => {
        const v: Vec3 = [m.act.body.pos[0] - at[0], m.act.body.pos[1] - at[1], m.act.body.pos[2] - at[2]];
        return { m, d: Math.hypot(...v), facing: dot(normalize(v), forward) };
      })
      .filter((t) => t.facing >= FLY_TARGET_CONE)
      .sort((a, b) => a.d - b.d);
    if (targets.length === 0) return;
    if (this.flySelect >= targets.length) this.flySelect = 0;
    const next = targets[this.flySelect++]!.m;
    this.focus.select(next.objectId);
    this.renderTarget = next.objectId;
    if (this.trackingId !== null) this.trackingId = next.objectId;
  }

  /**
   * Piece 7 M5: Z in the air (`ControlFlying`, :751-773): tracking of the focused mover on, or off (also with no focus).
   * While on, the flier turns toward it each step (`ProcessFlyTracking`, the rules' `tracking`).
   */
  toggleTracking(): void {
    const own = this.world.self();
    if (own === undefined) return;
    const id = this.focus.targetId;
    const target = id === null ? undefined : this.world.movers.get(id);
    this.trackingId = this.trackingId === null && target !== undefined ? target.objectId : null;
    own.act.tracking = () => {
      const tracked = this.trackingId === null ? undefined : this.world.movers.get(this.trackingId);
      if (tracked === undefined) return null;
      const from = own.act.body.pos;
      const to = tracked.act.body.pos;
      const yaw = getDegree(to, from);
      return { yawTo: yaw > 180 ? yaw - 360 : yaw, pitchTo: getDegreeX(to, from) };
    };
  }

  /**
   * Piece 7 M2: `CWndWorld::OnEraseBkgnd`'s shot (`WndWorld.cpp:930-990`): a press held on the focused mover with a bow
   * at level 4, or a wand at 4 (at 3 with less than 5 MP), shoots on its own if the target can be attacked; the charge
   * then waits 1800 ms (`m_dwPowerTick = now + POWER_ATK_DELAY`, set before the command's own refusals), in which a let-go
   * shoots nothing.
   */
  private automaticShot(own: Mover, now: number): void {
    const kind3 = this.handKind3();
    if ((kind3 !== Ik3.WAND && kind3 !== Ik3.BOW) || this.ownIsDead()) return;
    const id = this.focus.targetId;
    const target = id === null ? undefined : this.world.movers.get(id);
    if (target === undefined || !this.buttonDown || !this.selectTarget) return;
    const full = kind3 === Ik3.BOW || (this.own()?.mp ?? 0) >= WAND_FULL_MP ? MAX_CHARGE_LEVEL : MAX_CHARGE_LEVEL - 1;
    const power = chargeLevel(now - this.powerTick);
    if (power < full || !this.isAttackAble(target)) return;
    this.powerTick = now + POWER_ATK_DELAY;
    if (kind3 === Ik3.WAND) this.cmdSetMagicAttack(own, target.objectId, power);
    else this.cmdSetRangeAttack(own, target.objectId, power);
  }

  /**
   * Piece 7 M2: the let-go's shot (`OnLButtonUp`, `WndWorld.cpp:6484-6503`): with a focus, the press's `m_bSelectTarget`,
   * `m_timerFocusAttack` out (a new target's press waits its 500 ms), a target that can be attacked, a mover, and a charge
   * not in the lock-out: the charge starts again from now, and a wand shoots (`CMD_SetMagicAttack`) or a bow
   * (`CMD_SetRangeAttack`) at the level reached.
   */
  private releaseShot(now: number): void {
    const own = this.world.self();
    const id = this.focus.targetId;
    if (own === undefined || id === null || !this.selectTarget || now - this.focusTimer < FOCUS_ATTACK_MS) return;
    const target = this.world.movers.get(id);
    if (target === undefined || !this.isAttackAble(target)) return;
    const power = chargeLevel(now - this.powerTick);
    if (power < 0) return;
    this.powerTick = now;
    const kind3 = this.handKind3();
    if (kind3 === Ik3.WAND) this.cmdSetMagicAttack(own, id, power);
    else if (kind3 === Ik3.BOW) this.cmdSetRangeAttack(own, id, power);
  }

  /**
   * `CDPClient::OnQueryGetDestObj` (`Neuz/DPClient.cpp:8985-8991`): the server's copy of the player arrived first and
   * asks what it follows; while the own mover follows an object (`!IsEmptyDestObj()`), GETDESTOBJ answers with it.
   * 2026-11-09 (pets review): `m_idDest` is the object's `GetId()` (`SetDestObj( CCtrl* )`, `Mover.h:1001`), `NULL_ID` for a
   * raised pet the client made, and `IsEmptyDestObj` is `m_idDest == NULL_ID` (:1011): following one answers nothing.
   */
  onQueryGetDestObj(fromId: number): void {
    const dest = this.world.self()?.dest?.targetId ?? null;
    if (dest !== null && !isClientMade(dest)) this.session.sendGetDestObj(fromId, dest);
  }

  /**
   * The branch of `CWndWorld::Process` (`WndWorld.cpp:8513-8537`): with the button down or auto-attacking and no skill's
   * command (`pressed`), the attack when auto-attacking or held past `m_timerFocusAttack` (:8517) with a focus in view,
   * the controls with none, and neither otherwise; the controls else.
   */
  private processBranch(): ProcessBranch {
    if (!this.pressed()) return 'controls';
    if (!this.auto && !(this.selectTarget && this.holdTimedOut())) return 'none';
    const id = this.focus.targetId;
    return id !== null && this.world.movers.has(id) ? 'attack' : 'controls';
  }

  /** `(m_bLButtonDown || m_bAutoAttack) && (g_pPlayer->GetCmd() != OBJACT_USESKILL)` (`WndWorld.cpp:8514`). */
  private pressed(): boolean {
    return (this.buttonDown || this.auto) && this.skills?.commanding !== true;
  }

  /** `m_timerFocusAttack.IsTimeOut()` at the time the held press is known held till. */
  private holdTimedOut(): boolean {
    return this.held !== null && this.held.until - this.focusTimer >= FOCUS_ATTACK_MS;
  }

  /**
   * The focus is gone (DEL_OBJ, `onRemoved`) or the player killed (`onMoverDeath`): `SetObjFocus( NULL )`
   * (`World.cpp:253-359`), whose clearing takes the mark off (:337-341), and after a kill (`takesNext`) the next target
   * queued becomes the focus
   * (`Focus.onRemoved`), marked unless peaceful (`SetNextTarget`, `WndWorld.cpp:6389-6419`). The attack stops
   * (`stop( 'target' )`): `SetNextTarget`'s `m_bAutoAttack = FALSE` (:6418); with no next target, or after a DEL_OBJ,
   * Neuz leaves the flag on with nothing focused, where it does nothing, and the next press clears it (:6850-6853).
   */
  private loseTarget(takesNext: boolean): void {
    this.focus.onRemoved(this.focus.targetId!, takesNext);
    const next = this.focus.targetId;
    const marked = next !== null && this.world.movers.get(next)?.added.belligerence !== Belli.PEACEFUL;
    this.renderTarget = marked ? next : null;
    this.stop('target');
  }

  /**
   * `SetObjFocus( NULL )` (`World.cpp:253-359`): with a focus, it is released, and the next target and the mark go
   * (:331-343); with none, nothing changes (:319).
   */
  private clearFocus(): void {
    if (this.focus.targetId === null) return;
    this.focus.select(null);
    this.renderTarget = null;
  }

  /** `g_pPlayer->IsDie()` (`Mover.h:1221`): in a dead state, or with no HP left. */
  private ownIsDead(): boolean {
    return this.world.self()?.act.isDie() === true || this.own()?.hp === 0;
  }

  /** `GetActiveHandItemProp()->dwItemKind3 == IK3_WAND`: the fists' (`II_WEA_HAN_HAND`, `IK3_HAND`) when the hand is empty. */
  private holdsWand(): boolean {
    return this.handKind3() === Ik3.WAND;
  }

  /** Piece 7 M2: `GetActiveHandItemProp()->dwItemKind3`, the fists' `IK3_HAND` for an empty hand. */
  private handKind3(): number {
    return this.own()?.equipped.weapon?.kind3 ?? Ik3.HAND;
  }

  /** Piece 7 M2: a wand or a bow in the hand, which charge and shoot. */
  private holdsRanged(): boolean {
    const kind3 = this.handKind3();
    return kind3 === Ik3.WAND || kind3 === Ik3.BOW;
  }

  /**
   * The own mover's hooks the attack needs, set once: the command on arriving (`arrive`) and the button its collision
   * lets go (`releaseButton`: `m_bLButtonDown = FALSE`, `MoverActEvent.cpp:2022-2028`), which the rules' step calls; the
   * combo at a swing's end, and the animation's speed while swinging (`CMover::GetAttackSpeed`, `MoverAttack.cpp:159-192`,
   * `params.ts`, from the own numbers), which the swing calls. Its swing's target (`findMover`, `prj.GetMover`) is the
   * world's, which sets it for every mover.
   */
  private bind(own: Mover): void {
    const act = own.act;
    if (this.bound.has(act)) return;
    this.bound.add(act);
    own.arrive = (target) => this.arrive(own, target);
    own.releaseButton = () => {
      this.buttonDown = false;
    };
    act.onAttackEnd = (dwState) => this.combo(own, dwState);
    act.rangedHand = () => this.holdsRanged(); // Piece 7 M2: its swings are refused with a wand or a bow
    act.attackSpeed = () => {
      const state = this.own();
      if (state === undefined) return 1;
      return state.profileStats ? state.profileStats[11]! / 1000000 : attackSpeed(state.jobProp, state.attackSpeed(), state.level, state.effective().dex, state.adj).speed;
    };
  }

  /**
   * `CMover::IsAttackAble( pObj )` (`Mover.cpp:6469-6570`) on the client for a mover, as `attackAble` judges it, with what
   * the C++ does besides: `IsAttackAbleNPC` refusing a dead monster or NPC clears the focus (`SetObjFocus( NULL )`,
   * :6580-6589), and a refusal turns the auto-attack off (:6564-6567). The skill use asks it too (`CMD_SetUseSkill`).
   */
  isAttackAble(target: Mover): boolean {
    if (!target.added.isPlayer && isDie(target)) this.focus.select(null);
    const able = attackAble(target, this.moverProps, this.world.self()?.act.isFlying() === true, this.arenaSide());
    if (!able) this.auto = false;
    return able;
  }

  /**
   * `CWndWorld::UseFocusObj( pFocusObj )` (`WndWorld.cpp:6197-6266`) for a mover: not while jumping, swinging or dead;
   * a wand does nothing (:6229-6233: its shots are the presses'); a bow, with the button up, asks for a level-0 shot
   * (`CMD_SetRangeAttack( id, 0 )`, :6250-6253, Piece 7 M2); anything else melee (`CMD_SetMeleeAttack`).
   */
  private useFocusObj(own: Mover, target: Mover, state: OwnState): void {
    const act = own.act;
    if (act.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL)) return;
    if (this.ownIsDead()) return;
    const kind3 = state.equipped.weapon?.kind3 ?? Ik3.HAND;
    if (kind3 === Ik3.WAND) return;
    if (act.stateFlag & ObjStaF.SIT) return;
    if (kind3 === Ik3.BOW) {
      if (!this.buttonDown && this.motionReady(own, Mti.ATK1)) this.cmdSetRangeAttack(own, target.objectId, 0);
      return;
    }
    // A missing browser animation otherwise ends immediately and emits attacks at rules-step speed.
    // Request every motion this level can chain before beginning an attack (a yoyo's chain stops at ATK2).
    const yoyo = kind3 === Ik3.YOYO;
    const motions = [Mti.ATK1, ...(state.level >= 2 ? [Mti.ATK2] : []),
      ...(state.level >= 8 && !yoyo ? [Mti.ATK3] : []), ...(state.level >= 12 && !yoyo ? [Mti.ATK4] : [])];
    if (!motions.map((motion) => this.motionReady(own, motion)).every(Boolean)) return;
    this.cmdSetMeleeAttack(own, target.objectId, state);
  }

  /**
   * `CMover::CMD_SetMeleeAttack( idTarget, 0 )` (`MoverMsg.cpp:427-454`) on the client: not with a tool in the hand,
   * while swinging or dead; then `SetDestObj( idTarget, fRange )` and `SetCmd( OBJACT_MELEE_ATTACK, idTarget )`, the
   * range 0 but for a yoyo's, its `GetAttackRange( dwAttackRange )` (AR_HRANGE, 6 m: Piece 7 M2, :439-440).
   */
  private cmdSetMeleeAttack(own: Mover, targetId: number, state: OwnState): void {
    const hand = state.equipped.weapon;
    if (hand?.kind2 === IK2_TOOLS) return;
    if (own.act.state & ObjSta.ATK_ALL) return;
    if (this.ownIsDead()) return;
    if (this.interruptCast()) return; // Piece 7 M3
    // Combat approaches the target at run speed, even if the player was walking.
    if (own.act.sendActMsg(ActMsg.MODE_RUN)) this.session.sendBehavior(own.act.report(this.clock.tick()));
    this.setDestObj(own, targetId, hand?.kind3 === Ik3.YOYO ? attackRangeOf(hand.attackRange) : 0);
    this.cmd = { kind: 'melee', targetId, power: 0 };
  }

  /**
   * Piece 7 M2: `CMover::CMD_SetMagicAttack( idTarget, nMagicPower )` (`MoverMsg.cpp:500-522`): not while attacking or dead,
   * nor without a wand in the hand; then the walk to `GetAttackRange( AR_WAND )`, 15 m whatever the wand's own reach, and
   * `SetCmd( OBJACT_MAGIC_ATTACK, idTarget, nMagicPower )`.
   */
  private cmdSetMagicAttack(own: Mover, targetId: number, power: number): void {
    if (own.act.state & ObjSta.ATK_ALL) return;
    if (this.ownIsDead()) return;
    if (this.handKind3() !== Ik3.WAND) return;
    if (this.interruptCast()) return; // Piece 7 M3
    this.setDestObj(own, targetId, attackRangeOf(AR_WAND));
    this.cmd = { kind: 'magic', targetId, power };
  }

  /**
   * Piece 7 M2: `CMover::CMD_SetRangeAttack( idTarget, nPower )` (`MoverMsg.cpp:475-498`): not while attacking or dead,
   * nor without a bow, nor without its arrows (`IsBullet`); then the walk to the bow's `GetAttackRange( dwAttackRange )`
   * (AR_WAND, 15 m) and `SetCmd( OBJACT_RANGE_ATTACK, idTarget, nPower )`.
   */
  private cmdSetRangeAttack(own: Mover, targetId: number, power: number): void {
    if (own.act.state & ObjSta.ATK_ALL) return;
    if (this.ownIsDead()) return;
    const bow = this.own()?.equipped.weapon;
    if (bow?.kind3 !== Ik3.BOW || !this.isBullet(bow)) return;
    if (this.interruptCast()) return; // Piece 7 M3
    this.setDestObj(own, targetId, attackRangeOf(bow.attackRange));
    this.cmd = { kind: 'range', targetId, power };
  }

  /**
   * Piece 7 M2: `CMover::IsBullet( pItemProp )` (`_Common/Mover.cpp:8461-8498`): an item that needs bullets
   * (`dwLinkKindBullet`) needs that `IK2_*` in the arrow slot (`GetActiveHandItemProp( PARTS_BULLET )`, the fists' for an
   * empty slot, which are no bullets); without them the client says so (`TID_TIP_NEEDSATTACKITEM` for a bow, else
   * `TID_TIP_NEEDSKILLITEM`) and the auto-attack goes off.
   */
  isBullet(prop: { kind3: number; linkKindBullet?: number }): boolean {
    const link = prop.linkKindBullet ?? -1;
    if (link === -1) return true;
    if (this.own()?.bullet()?.kind2 === link) return true;
    this.onText(prop.kind3 === Ik3.BOW ? 'TID_TIP_NEEDSATTACKITEM' : 'TID_TIP_NEEDSKILLITEM');
    this.auto = false;
    return false;
  }

  /**
   * `CMover::SetDestObj( objid, fRange, bSend = TRUE )` (`MoverMsg.cpp:47-84`) for the active mover (`setOwnDestObj`), whose
   * `m_oaCmd = OBJACT_NONE` (:79) drops a skill's command; the caller sets the melee one next.
   */
  private setDestObj(own: Mover, objectId: number, range: number): void {
    this.skills?.clearCmd();
    setOwnDestObj(this.session, () => this.clock.tick(), (id) => this.world.movers.get(id), own, objectId, range);
  }

  /**
   * `CMover::ProcessMoveArrival`'s `switch( m_oaCmd )` for the own mover (`MoverMove.cpp:78-262`), which the rules' step
   * calls as it arrives at `target` (`SimMover.arrive`): `OBJACT_USESKILL` (:80-184) is the skill use's (`skills.arrive`);
   * `OBJACT_MELEE_ATTACK` (:189-205) swings at it (`DoAttackMelee`), a yoyo only with a line of sight half a metre up,
   * else `TID_GAME_BLOCKTARGETING` (Piece 7 M2); either command ends (`SetCmd( OBJACT_NONE )`, :262).
   * With no command, false: the rules' default arrival.
   */
  private arrive(own: Mover, target: SimMover): boolean {
    if (this.skills?.arrive(own, target) === true) {
      this.cmd = null;
      return true;
    }
    const cmd = this.cmd;
    if (cmd === null) return false;
    this.cmd = null;
    tellUntoldWalk(this.session, () => this.clock.tick(), own);
    const state = this.own();
    if (state === undefined) return true;
    if (cmd.kind === 'melee') {
      if (state.equipped.weapon?.kind3 === Ik3.YOYO && sightBlocked(this.ground(), own.act.body.pos, target.act.body.pos)) {
        this.onText('TID_GAME_BLOCKTARGETING');
        return true;
      }
      this.doAttackMelee(own, target, state);
      return true;
    }
    // Piece 7 M2: OBJACT_MAGIC_ATTACK and OBJACT_RANGE_ATTACK (:207-241): the target by its id, standing (the bow also
    // stops turning), the walk over, then the shot
    const mover = this.world.movers.get(cmd.targetId);
    if (mover === undefined) return true;
    own.act.sendActMsg(ActMsg.STAND);
    if (cmd.kind === 'range') own.act.sendActMsg(ActMsg.STOP_TURN);
    // the shot waits there, standing, for a motion the browser can play, as a swing does (useFocusObj): one begun on a
    // motion still loading or missing ends with no hit frame, its MAGIC_ATTACK or RANGE_ATTACK told with no SFX_ID after
    // it. The walk stays on, so this arrival comes again at the next step.
    if (!this.motionReady(own, Mti.ATK1)) {
      this.cmd = cmd;
      return true;
    }
    clearDestObj(own);
    if (cmd.kind === 'magic') this.doAttackMagic(own, mover, cmd.power, state);
    else this.doAttackRange(own, mover, cmd.power, state);
    return true;
  }

  /**
   * Piece 7 M2: `CMover::DoAttackMagic( pTarget, nMagicPower )` (`MoverSkill.cpp:3201-3279`) of the own mover: a wand in
   * the hand; a line of sight half a metre up, else `TID_GAME_BLOCKTARGETING`; `OBJMSG_ATK_MAGIC1` that starts; then it
   * faces the target, keeps the charge for its hit frame (`SetActParam`), earns an action point for a charge of 1 or more
   * (up to 100, :3253-3257), and sends MAGIC_ATTACK with `m_idSfxHit` as it is (:3271-3274).
   */
  private doAttackMagic(own: Mover, target: Mover, power: number, state: OwnState): void {
    if (state.equipped.weapon?.kind3 !== Ik3.WAND) return;
    if (sightBlocked(this.ground(), own.act.body.pos, target.act.body.pos)) {
      this.onText('TID_GAME_BLOCKTARGETING');
      return;
    }
    if (!own.act.sendActMsg(ActMsg.ATK_MAGIC1, target.objectId)) return;
    own.act.body.angle = wrapAngle(getDegree(target.act.body.pos, own.act.body.pos));
    own.shot = { targetId: target.objectId, power, sfxHitId: 0 };
    const bar = state.taskBar;
    if (power >= 1 && bar !== null && bar.actionPoint < MAX_ACTION_POINT) bar.actionPoint++;
    this.session.sendMagicAttack(target.objectId, power, this.shots.current);
  }

  /**
   * Piece 7 M2: `CMover::DoAttackRange( pTarget, dwItemID, 0 )` (`MoverSkill.cpp:3292-3380`) of the own mover, the charge
   * being its `dwItemID`: a line of sight, else `TID_GAME_BLOCKTARGETING`; `OBJMSG_ATK_RANGE1` with `MTI_ATK1` (every bow's
   * `dwUseMotion` is `=`: `MTI_ATK_13 - MTI_STAND_13`, :3349-3355) that starts; then it faces the target, keeps the charge,
   * and sends RANGE_ATTACK with the charge and `m_idSfxHit` as it is (:3375-3376).
   */
  private doAttackRange(own: Mover, target: Mover, power: number, state: OwnState): void {
    if (state.equipped.weapon?.kind3 !== Ik3.BOW) return;
    if (sightBlocked(this.ground(), own.act.body.pos, target.act.body.pos)) {
      this.onText('TID_GAME_BLOCKTARGETING');
      return;
    }
    if (!own.act.sendActMsg(ActMsg.ATK_RANGE1, target.objectId, Mti.ATK1)) return;
    own.act.body.angle = wrapAngle(getDegree(target.act.body.pos, own.act.body.pos));
    own.shot = { targetId: target.objectId, power, sfxHitId: 0 };
    this.session.sendRangeAttack(target.objectId, power, this.shots.current);
  }

  /**
   * `CMover::DoAttackMelee( pTarget, OBJMSG_ATK1 )` (`MoverSkill.cpp:3436-3488`): `OBJMSG_STOP` (which ends the
   * following, `ClearDest`), then the swing; one that starts (`nError > 0`) sends MELEE_ATTACK with the hand's
   * `fAttackSpeed` (`__HACK_1023`, :3455-3467).
   */
  private doAttackMelee(own: Mover, target: SimMover, state: OwnState): void {
    own.act.sendActMsg(ActMsg.STOP);
    if (!own.act.sendActMsg(ActMsg.ATK1, target.objectId, 0, 0)) return;
    this.session.sendMeleeAttack(ActMsg.ATK1, target.objectId, state.attackSpeed());
  }

  /**
   * The own character's combo at the end of the swing `dwState` (`_ProcessStateAttack`, `ActionMoverState.cpp:815-841`):
   * at the level it needs, and while auto-attacking or holding the button (`CTRLMSG_LDOWN`), the next swing at the mover
   * the last one was started at (`m_objidHit`), if it is in view (`IsValidObj`) and no skill is reserved
   * (`GetNextSkill() == NEXTSKILL_NONE`, :826-828: the reserved skill goes next); one that starts sends MELEE_ATTACK. A
   * mover gone from view, or a reserved skill, forgets it (`m_objidHit = NULL_ID`). A yoyo's chain stops after ATK2
   * (:820-825, Piece 7 M2).
   */
  private combo(own: Mover, dwState: number): void {
    const combo = COMBO.get(dwState);
    const state = this.own();
    if (combo === undefined || state === undefined) return;
    if (state.level < combo.level || !(this.buttonDown || this.auto)) return;
    if (state.equipped.weapon?.kind3 === Ik3.YOYO && dwState !== ObjSta.ATK1) return;
    const act = own.act;
    const hit = act.hitId === null ? undefined : this.world.movers.get(act.hitId);
    if (hit === undefined || this.skills?.reserved === true) {
      act.hitId = null;
      return;
    }
    if (act.sendActMsg(combo.next, hit.objectId, 0, 0)) {
      this.session.sendMeleeAttack(combo.next, hit.objectId, state.attackSpeed());
    }
  }
}
