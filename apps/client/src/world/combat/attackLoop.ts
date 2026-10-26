// The own character's melee (spec §3.4): the presses that select and attack (`CWndWorld::OnLButtonDown`,
// `OnLButtonDblClk`, `OnLButtonUp`), the attack Neuz starts each frame while auto-attacking or holding the button
// (`CWndWorld::Process`, `UseFocusObj`, `CMover::CMD_SetMeleeAttack`, `SetDestObj`), the swing on arrival
// (`ProcessMoveArrival`, `DoAttackMelee`), the combo at each swing's end (`_ProcessStateAttack`), and what stops it
// ([combat §2.6]). The rules it drives are `sim/`'s: the walk up to the target is `stepMover`'s following of the
// destination object, and the swings are `ActionMover`'s.

import type { WebMover } from '@flyffweb/formats';
import type { ModelBox } from '@flyffweb/scene';
import type { OwnState } from '../OwnState';
import type { ActionMover } from '../sim/ActionMover';
import { ActMsg, Ik3, ObjSta, ObjStaF } from '../sim/constants';
import { setDestObj } from '../sim/moverRules';
import { attackSpeed } from '../sim/params';
import type { WorldSession } from '../WorldSession';
import type { Mover } from '../WorldState';
import type { Focus } from './focus';

const f32 = Math.fround;

/** What the attack loop sends. */
export type AttackLoopSession = Pick<WorldSession, 'sendDestObj' | 'sendMeleeAttack' | 'sendGetDestObj' | 'sendBehavior'>;

/** `BELLI_PEACEFUL` (`Resource/defineAttribute.h:203`): `CMover::IsPeaceful()` (`Mover.h:1091`). */
const BELLI_PEACEFUL = 1;
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
/** `0.8f`: `CObj::IsRangeObj` counts this much of each radius (`Obj.cpp:802-806`). */
const RADIUS_PART = f32(0.8);

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

/**
 * `CObj::IsRangeObj( pOther, fRange )` (`Obj.cpp:794-819`), `obj` the one followed and `other` the walker: within 0.8 of
 * each radius plus `range` (0 counting as 1), in 3D. The same as the rules' (`moverRules.ts`, which keeps it to itself),
 * float for float, so that the arrival here and the following there agree.
 */
function isRangeObj(obj: Mover, other: Mover, range: number): boolean {
  const r = range === 0 ? 1 : range;
  const radius = f32(f32(f32(obj.radius ?? 0) * RADIUS_PART) + f32(f32(f32(other.radius ?? 0) * RADIUS_PART) + r));
  const a = obj.act.body.pos;
  const b = other.act.body.pos;
  const x = f32(a[0] - b[0]);
  const y = f32(a[1] - b[1]);
  const z = f32(a[2] - b[2]);
  return f32(f32(f32(x * x) + f32(y * y)) + f32(z * z)) < f32(radius * radius);
}

/**
 * The own character's auto-attack, a copy of `CWndWorld`'s and `g_pPlayer`'s part of it:
 * - the presses on a mover select it and turn the auto-attack on (`onMoverPressed`, `onMoverHeld`, `onReleased`, and the
 *   touch screen's `attackButton`), as `OnLButtonDown` (`Source/_Interface/WndWorld.cpp:6844-7096`), `OnLButtonDblClk`
 *   (:7239-7263) and `OnLButtonUp` (:6471-6512) do; the focus is `Focus` (`CWorld::m_pObjFocus` and
 *   `m_pNextTargetObj`), whose SETTARGETs it sends;
 * - each rules step (`step`), the attack branch of `CWndWorld::Process` (:8513-8537): while auto-attacking, or holding
 *   the button 500 ms on a target, `UseFocusObj` (:6197-6266) on an attackable focus (`IsAttackAble`,
 *   `_Common/Mover.cpp:6469-6626`), whose `CMD_SetMeleeAttack` (`_Common/MoverMsg.cpp:427-454`) walks the player to it
 *   (`SetDestObj`, :47-84: PLAYERSETDESTOBJ once per target followed); then the part of `CMover::ProcessMove`
 *   (`_Common/MoverMove.cpp:344-430`) that, the target in range, runs the command (`ProcessMoveArrival`, :73-262):
 *   `DoAttackMelee` (`_Common/MoverSkill.cpp:3436-3488`), the swing ATK1 and its MELEE_ATTACK;
 * - at each swing's end, the combo (`_ProcessStateAttack`, `_AIInterface/ActionMoverState.cpp:804-841`): the next swing,
 *   by level, while auto-attacking or holding the button, and its MELEE_ATTACK;
 * - what stops it (`stop`), and the answer to QUERYGETDESTOBJ.
 *
 * `own` gives the own character's numbers (`OwnState`): its level, its hand's `fAttackSpeed` (MELEE_ATTACK sends it,
 * the server refuses another), its weapon; without them (the own ADD_OBJ could not be read) presses still select, but
 * nothing attacks. `clock` gives the ticks of the PLAYERBEHAVIOR `SetDestObj` sends; `movers` is the mover catalog
 * (`bKillable`).
 *
 * The world screen calls `step` once a rules step, after the controls (`OwnMover.control`, which it skips while
 * `controlsPlayer` is false, as `Process` runs one branch or the other) and before the world's step: the attack branch
 * is the frame before's interface, as the controls are, and the arrival comes just before the own mover's
 * `ProcessMove` in `stepMover`. Those see the same positions, the own mover being the first stepped (its ADD_OBJ is the
 * first of the JOIN, `CUser::Open`, `WORLDSERVER/User.cpp:326`), so that where this finds no arrival the rules find
 * none either and follow on (`TURNMOVE`).
 *
 * Left out, as Piece 4 has none of them: skills (`m_dwNextSkill`, `OBJACT_USESKILL`, `REQ_USESKILL`), flying, the
 * wand's and the bow's attacks (at the button's let-go, `CMD_SetMagicAttack`, `CMD_SetRangeAttack`), the yoyo's reach
 * and its short combo, attacking players (duels, PK, wars), the guards' disposition (`RANK_GUARD` against a chaotic
 * player), the Ctrl key's auto-attack, the menu of a peaceful NPC (Piece 5), standing a sitting player up first
 * (`SendMotion( OBJMSG_STANDUP )`: the browser's player never sits), buffs (`IK3_TEXT_DISGUISE`, `MVRF_NOATTACK`) and
 * `STATE_BASEMOTION_MODE`.
 */
export class AttackLoop {
  /** `m_bAutoAttack`. */
  private auto = false;
  /**
   * `m_bLButtonDown` while a press on a mover is held, which is also the `CTRLMSG_LDOWN` the combo reads: `ControlGround`
   * sets `m_dwCtrlMsg` from it as the press goes down and as it is let go (`WndWorldControlPlayer.cpp:237-238`), and not
   * in between, while `Process` runs the attack branch. (A press on the ground held down is the controls' tap.)
   */
  private buttonDown = false;
  /** `m_bSelectTarget`. */
  private selectTarget = false;
  /** When `m_timerFocusAttack` was last reset (ms); it was set as the window opened, long ago. */
  private focusTimer = -Infinity;
  /** The press held: the mover it went down on, and when it is known held till (ms, the presses' clock). */
  private held: { mover: number; at: number; until: number } | null = null;
  /** `m_oaCmd == OBJACT_MELEE_ATTACK`, and its target (`m_nCParam[0]`); null for `OBJACT_NONE`. */
  private cmd: number | null = null;
  /** `m_pRenderTargetObj`: the mover the target marks are on. */
  private renderTarget: number | null = null;
  /** The own mover and the movers in view (`prj.GetMover`), as the last step had them. */
  private ownMover: Mover | undefined;
  private find: (objectId: number) => Mover | undefined = () => undefined;
  private readonly bound = new WeakSet<ActionMover>();

  constructor(
    private readonly session: AttackLoopSession,
    private readonly focus: Focus,
    private readonly own: () => OwnState | undefined,
    private readonly clock: { tick(): bigint },
    private readonly movers: ReadonlyMap<number, Pick<WebMover, 'killable'>>,
  ) {}

  /** `m_bAutoAttack`. */
  get autoAttack(): boolean {
    return this.auto;
  }

  /**
   * `m_pRenderTargetObj`, the mover the target marks and the target bar are on: the last mover pressed that is a
   * player or not peaceful (`WndWorld.cpp:6888-6891`); none after a tap on the ground (:6928) or once the focus is
   * cleared (`SetObjFocus( NULL )`, `World.cpp:331-343`).
   */
  get renderTargetId(): number | null {
    return this.focus.targetId === null ? null : this.renderTarget;
  }

  /**
   * Whether `CWndWorld::Process` runs `ControlPlayer` this frame (`WndWorld.cpp:8513-8537`): not while it runs the attack
   * branch (auto-attacking, or the button held past its 500 ms, with a focus), nor while a press on a mover is held
   * before then (neither branch runs); otherwise it does.
   */
  get controlsPlayer(): boolean {
    if (!this.buttonDown && !this.auto) return true;
    if (this.auto || this.holdTimedOut()) return this.focus.targetId === null;
    return false;
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
   * 1374-1383`) until `onReleased`. A dead player presses nothing (:6719-6720).
   */
  onMoverPressed(objectId: number, now: number, double: boolean): void {
    if (this.ownIsDead()) return;
    this.buttonDown = true;
    this.held = { mover: objectId, at: now, until: now };
    if (double) {
      if (this.focus.targetId === objectId && !this.holdsWand()) this.auto = true;
      return;
    }
    const old = this.focus.targetId;
    if (old === null) this.renderTarget = null;
    if (this.focus.next === null && old === null) this.auto = false;
    this.cmd = null;
    if (!this.auto) this.focus.select(objectId);
    const mover = this.find(objectId);
    const peaceful = mover !== undefined && mover.added.belligerence === BELLI_PEACEFUL;
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
    this.selectTarget = true;
    if (objectId !== old) this.focusTimer = now;
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
   * The press let go (`OnLButtonUp`, `WndWorld.cpp:6471-6512`, after `CWndBase` clears `m_bLButtonDown`,
   * `WndBase.cpp:1142-1146`): its `ControlPlayer( WM_LBUTTONUP )` clears `CTRLMSG_LDOWN`, and `m_bSelectTarget` goes off.
   * (The wand's and the bow's attacks at the let-go are not Piece 4's.)
   */
  onReleased(): void {
    this.buttonDown = false;
    this.selectTarget = false;
    this.held = null;
  }

  /**
   * The attack button of a touch screen (spec §3.4): Neuz has none; it is the focused mover pressed again, with no press
   * held, as `OnLButtonDblClk` takes it (`WndWorld.cpp:7248-7260`): the auto-attack goes on unless the hand holds a wand.
   */
  attackButton(): void {
    if (this.ownIsDead()) return;
    if (this.focus.targetId !== null && !this.holdsWand()) this.auto = true;
  }

  /**
   * What stops the auto-attack ([combat §2.6]), with the command (`ClearCmd`): a movement key or the joystick (`move`:
   * `WndWorldControlPlayer.cpp:383-403`, and `CWndWorld::OnKeyDown` for W, A, S and D, `WndWorld.cpp:7739-7740`); a
   * tap on the ground (`ground`: `OnLButtonDown`'s :6854 and :6922-6929, which also drop the next target and the mark,
   * and leave the focus); the player's death (`died`: `CDPClient::OnMoverDeath`, `Neuz/DPClient.cpp:2080`); the target
   * dead or gone from view (`target`: `SetNextTarget`'s `m_bAutoAttack = FALSE`, `WndWorld.cpp:6418`, for a kill; for a
   * DEL_OBJ Neuz leaves the flag on with nothing focused, where it does nothing, and the next press clears it,
   * :6850-6853). The focus is `Focus`'s to clear. A press held on a mover past its 500 ms goes on attacking: Neuz reads
   * no keys while it runs that branch.
   */
  stop(reason: 'move' | 'ground' | 'died' | 'target'): void {
    this.auto = false;
    this.cmd = null;
    if (reason === 'ground') {
      this.focus.next = null;
      this.renderTarget = null;
    }
  }

  /**
   * One rules step for the own mover `own`, `find` giving the movers in view: the attack branch of `CWndWorld::Process`
   * (`WndWorld.cpp:8513-8537`), then the arrival of `CMover::ProcessMove` for the command. The combo runs in the rules'
   * step, at the swing's end (`ActionMover.onAttackEnd`, which this sets, with the own mover's `findMover` and its
   * attack speed, `CMover::GetAttackSpeed`, for the animation).
   */
  step(own: Mover, find: (objectId: number) => Mover | undefined): void {
    this.ownMover = own;
    this.find = find;
    this.bind(own);
    const state = this.own();
    if (state === undefined) return;
    if (this.buttonDown || this.auto) {
      if (this.auto || (this.selectTarget && this.holdTimedOut())) {
        const id = this.focus.targetId;
        const target = id === null ? undefined : find(id);
        if (target !== undefined && this.isAttackAble(target)) this.useFocusObj(own, target, state);
      }
    } else {
      this.selectTarget = false;
    }
    this.processMove(own, state);
  }

  /**
   * `CDPClient::OnQueryGetDestObj` (`Neuz/DPClient.cpp:8985-8991`): the server's copy of the player arrived first and
   * asks what it follows; while the own mover follows an object (`!IsEmptyDestObj()`), GETDESTOBJ answers with it.
   */
  onQueryGetDestObj(fromId: number): void {
    const dest = this.ownMover?.dest?.targetId ?? null;
    if (dest !== null) this.session.sendGetDestObj(fromId, dest);
  }

  /** `m_timerFocusAttack.IsTimeOut()` at the time the held press is known held till. */
  private holdTimedOut(): boolean {
    return this.held !== null && this.held.until - this.focusTimer >= FOCUS_ATTACK_MS;
  }

  /** `g_pPlayer->IsDie()` (`Mover.h:1221`): in a dead state, or with no HP left. */
  private ownIsDead(): boolean {
    return this.ownMover?.act.isDie() === true || this.own()?.hp === 0;
  }

  /** `GetActiveHandItemProp()->dwItemKind3 == IK3_WAND`: the fists' (`II_WEA_HAN_HAND`, `IK3_HAND`) when the hand is empty. */
  private holdsWand(): boolean {
    return this.own()?.equipped.weapon?.kind3 === Ik3.WAND;
  }

  /**
   * The own mover's hooks the attack needs, set once: the swing's target (`prj.GetMover`), the combo at a swing's end,
   * and the animation's speed while swinging (`CMover::GetAttackSpeed`, `MoverAttack.cpp:159-192`, `params.ts`).
   */
  private bind(own: Mover): void {
    const act = own.act;
    if (this.bound.has(act)) return;
    this.bound.add(act);
    act.findMover = (objectId) => this.find(objectId)?.act;
    act.onAttackEnd = (dwState) => this.combo(own, dwState);
    act.attackSpeed = () => {
      const state = this.own();
      if (state === undefined) return 1;
      return attackSpeed(state.jobProp, state.attackSpeed(), state.level, state.effective().dex, state.adj).speed;
    };
  }

  /**
   * `CMover::IsAttackAble( pObj )` (`Mover.cpp:6469-6570`) on the client for a mover: a player only in a duel, a war or
   * PK, none of which Piece 4 has; a monster or NPC as `IsAttackAbleNPC` says. Refused, the auto-attack goes off
   * (:6564-6567).
   */
  private isAttackAble(target: Mover): boolean {
    const able = !target.added.isPlayer && this.isAttackAbleNpc(target);
    if (!able) this.auto = false;
    return able;
  }

  /**
   * `CMover::IsAttackAbleNPC` (`Mover.cpp:6572-6626`): a dead one is refused and the focus cleared (`SetObjFocus( NULL )`,
   * :6580-6589); then one that cannot be killed (`bKillable == 0`, or no row in the catalog), a peaceful one
   * (`IsPeaceful`, the ADD_OBJ's `m_dwBelligerence`) and, the player on the ground, a flying one (`dwFlying == 1`). A
   * mover's HP is not kept yet: its dead state alone tells its death, as for picking.
   */
  private isAttackAbleNpc(npc: Mover): boolean {
    if (npc.act.isDie()) {
      this.focus.select(null);
      return false;
    }
    const prop = this.movers.get(npc.added.index);
    if (prop === undefined || prop.killable === 0) return false;
    if (npc.added.belligerence === BELLI_PEACEFUL) return false;
    return !npc.flying;
  }

  /**
   * `CWndWorld::UseFocusObj( pFocusObj )` (`WndWorld.cpp:6197-6266`) for a mover: not while jumping, swinging or dead;
   * a wand or a bow attacks otherwise (not Piece 4's); anything else melee (`CMD_SetMeleeAttack`).
   */
  private useFocusObj(own: Mover, target: Mover, state: OwnState): void {
    const act = own.act;
    if (act.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL)) return;
    if (this.ownIsDead()) return;
    const kind3 = state.equipped.weapon?.kind3 ?? Ik3.HAND;
    if (kind3 === Ik3.WAND || kind3 === Ik3.BOW) return;
    if (act.stateFlag & ObjStaF.SIT) return;
    this.cmdSetMeleeAttack(own, target.objectId, state);
  }

  /**
   * `CMover::CMD_SetMeleeAttack( idTarget, 0 )` (`MoverMsg.cpp:427-454`) on the client: not with a tool in the hand,
   * while swinging or dead; then `SetDestObj( idTarget, 0 )` and `SetCmd( OBJACT_MELEE_ATTACK, idTarget )`.
   */
  private cmdSetMeleeAttack(own: Mover, targetId: number, state: OwnState): void {
    if (state.equipped.weapon?.kind2 === IK2_TOOLS) return;
    if (own.act.state & ObjSta.ATK_ALL) return;
    if (this.ownIsDead()) return;
    this.setDestObj(own, targetId, 0);
    this.cmd = targetId;
  }

  /**
   * `CMover::SetDestObj( objid, fRange, bSend = TRUE )` (`MoverMsg.cpp:47-84`) for the active mover: following another
   * object than it does, it says so first: a PLAYERBEHAVIOR if it followed a player (`__BS_ADJUST_SYNC`, :55-61), then
   * PLAYERSETDESTOBJ, and `m_nCorr = -1` (so that the walk ends where it meets something, `OnActCollision`); then the
   * rules' `SetDestObj` (`m_idDest`, `m_fArrivalRange`, `ClearDestPos`).
   */
  private setDestObj(own: Mover, objectId: number, range: number): void {
    const old = own.dest?.targetId ?? null;
    if (old !== objectId) {
      if (old !== null && this.find(old)?.added.isPlayer === true) {
        this.session.sendBehavior(own.act.report(this.clock.tick()));
      }
      this.session.sendDestObj(objectId, range);
      own.nCorr = -1;
    }
    setDestObj(own, objectId, range);
  }

  /**
   * The part of `CMover::ProcessMove` (`MoverMove.cpp:344-430`) that runs the command: not sitting, not swinging, with
   * an object to follow that is in view and within `IsRangeObj` of the own mover, `ProcessMoveArrival` (:73-262) runs
   * `OBJACT_MELEE_ATTACK` (`DoAttackMelee`, :189-205) and the command ends (`SetCmd( OBJACT_NONE )`, :262). With no
   * command it is the rules' arrival (`ClearDestObj` and `OBJMSG_STOP`, :256-259), and a target out of view stands the
   * mover with the command kept (:401-406): both `stepMover`'s.
   */
  private processMove(own: Mover, state: OwnState): void {
    if (this.cmd === null) return;
    const act = own.act;
    if (act.stateFlag & ObjStaF.SIT) return;
    const d = own.dest;
    if (d === null || d.pos !== null || d.targetId === null) return;
    if (act.state & ObjSta.ATK_ALL) return;
    const target = this.find(d.targetId);
    if (target === undefined || !isRangeObj(target, own, d.range)) return;
    this.cmd = null;
    this.doAttackMelee(own, target, state);
  }

  /**
   * `CMover::DoAttackMelee( pTarget, OBJMSG_ATK1 )` (`MoverSkill.cpp:3436-3488`): `OBJMSG_STOP` (which ends the
   * following, `ClearDest`), then the swing; one that starts (`nError > 0`) sends MELEE_ATTACK with the hand's
   * `fAttackSpeed` (`__HACK_1023`, :3455-3467).
   */
  private doAttackMelee(own: Mover, target: Mover, state: OwnState): void {
    own.act.sendActMsg(ActMsg.STOP);
    if (!own.act.sendActMsg(ActMsg.ATK1, target.objectId, 0, 0)) return;
    this.session.sendMeleeAttack(ActMsg.ATK1, target.objectId, state.attackSpeed());
  }

  /**
   * The own character's combo at the end of the swing `dwState` (`_ProcessStateAttack`, `ActionMoverState.cpp:815-841`):
   * at the level it needs, and while auto-attacking or holding the button (`CTRLMSG_LDOWN`), the next swing at the mover
   * the last one was started at (`m_objidHit`), if it is in view (`IsValidObj`; no skill is queued in Piece 4); one that
   * starts sends MELEE_ATTACK. A mover gone from view is forgotten (`m_objidHit = NULL_ID`).
   */
  private combo(own: Mover, dwState: number): void {
    const combo = COMBO.get(dwState);
    const state = this.own();
    if (combo === undefined || state === undefined) return;
    if (state.level < combo.level || !(this.buttonDown || this.auto)) return;
    const act = own.act;
    const hit = act.hitId === null ? undefined : this.find(act.hitId);
    if (hit === undefined) {
      act.hitId = null;
      return;
    }
    if (act.sendActMsg(combo.next, hit.objectId, 0, 0)) {
      this.session.sendMeleeAttack(combo.next, hit.objectId, state.attackSpeed());
    }
  }
}
