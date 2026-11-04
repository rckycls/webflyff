// Using skills (spec §3.11, [skills §4]): the own character's side of Neuz's skill use, from a slot of the task bar and
// from the action slot, up to the USESKILL it sends and the answers that come back. The skill's motion, hits and effect
// are every player's, and the world's (`WorldState`: `OnUseSkill`'s `DoUseSkill`, `OnMeleeSkill`); the rules of which
// skill may go where are `skillRules.ts`'.
//
//   CWndMgr::UseSkillShortCut        _Interface/WndManager.cpp:6820-6864   a bar slot, or a skill reserved while attacking
//   CWndWorld::UseSkill              _Interface/WndWorld.cpp:9139-9157     the action slot's button (and C): reserved
//   CWndWorld::Process               _Interface/WndWorld.cpp:8503-8511     the reserved skill's branch, at each step
//   CWndWorld::UseSkillToFocusObj    _Interface/WndWorld.cpp:6268-6298     the action slot on the focus
//   CWndTaskBar::UseSkillQueue       _Interface/WndTaskBar.cpp:2214-2272   its first skill, SUT_QUEUESTART
//   CWndTaskBar::OnCancelSkill       _Interface/WndTaskBar.cpp:2438-2447   ENDSKILLQUEUE, or a first skill refused
//   CWndWorld::OnLButtonDown         _Interface/WndWorld.cpp:6976-6987     a press in the world stops the chain
//   CMover::CMD_SetUseSkill          _Common/MoverMsg.cpp:172-423          the walk to the target, and the command
//   CMover::ProcessMoveArrival       _Common/MoverMove.cpp:80-184          on arrival: line of sight, 1 s, USESKILL
//   CDPClient::OnUseSkill            Neuz/DPClient.cpp:3894-3950           the answer, and the auto-attack after it
//   CDPClient::OnClearUseSkill       Neuz/DPClient.cpp:3952-3964           a refusal
//   CDPClient::OnEndSkillQueue       Neuz/DPClient.cpp:15791-15795         the chain is over
//   CWndWorld::OnKeyDown, OnKeyUp    _Interface/WndWorld.cpp:7734, 7756    m_SkillTimerStop

import { MAX_SKILL_JOB, NULL_ID, ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut, SkillSlot, Vec3, WorldMessage } from '@flyffweb/protocol';
import { attackAble, setOwnDestObj, tellUntoldWalk } from '../combat/attackLoop';
import type { OwnSkills } from '../combat/attackLoop';
import type { Focus } from '../combat/focus';
import { sightBlocked } from '../combat/lineOfSight';
import type { GameData } from '../gameData';
import type { OwnState } from '../OwnState';
import type { Ground } from '../sim/collision';
import { ActMsg, Ext, Ik3, ObjSta, ObjStaF, Si, Sut, Wui } from '../sim/constants';
import { clearDestObj } from '../sim/moverRules';
import type { SimMover } from '../sim/moverRules';
import type { WorldSession } from '../WorldSession';
import { isDie } from '../WorldState';
import type { Mover } from '../WorldState';

const f32 = Math.fround;

/** What the skill use sends. */
export type SkillUseSession = Pick<
  WorldSession, 'sendUseSkill' | 'sendEndSkillQueue' | 'sendDestObj' | 'sendBehavior' | 'sendDoUseSkillPoint'
>;

/** `SI_MAG_MAG_BLINKPOOL` (`Resource/defineSkill.h:81`), and the web's own line for it (plan, Decisions 8). */
const BLINKPOOL = 107;
export const BLINKPOOL_NOT_YET = 'WEB_BLINKPOOL_NOT_YET';
/** `AS_BACK` (`Resource/defineAttribute.h:45`): a skill used from behind. */
const AS_BACK = 8;
/** `if( fDir < 0.3f )` (`MoverMove.cpp:145`). */
const FROM_BEHIND_DOT = Math.fround(0.3);

/**
 * `D3DXVec3Dot( normalize( target - caster ), normalize( AngleToVectorXZ( target's angle, 3 ) ) ) >= 0.3`: the caster
 * is behind its target, the way to it close to the way it faces.
 */
function fromBehind(own: Mover, target: SimMover): boolean {
  const f32 = Math.fround;
  const [ox, oy, oz] = own.act.body.pos;
  const [tx, ty, tz] = target.act.body.pos;
  const way = [f32(tx - ox), f32(ty - oy), f32(tz - oz)];
  const length = Math.hypot(way[0]!, way[1]!, way[2]!);
  if (length === 0) return false;
  const rad = f32((target.act.body.angle * Math.PI) / 180);
  const dot = f32(f32(way[0]! / length) * f32(Math.sin(rad)) + f32(way[2]! / length) * f32(-f32(Math.cos(rad))));
  return dot >= FROM_BEHIND_DOT;
}

/** What the skill use asks of the attack loop (`AttackLoop`), which keeps the melee side of the one command and the flag. */
export interface SkillAttack {
  /** `ClearCmd()`: the command goes, the melee attack's and the skill's. */
  clearCmd(): void;
  /** `m_bAutoAttack = TRUE`. */
  startAutoAttack(): void;
  /** `CMover::IsAttackAble( pTarget )` on the client, with what it does besides (the focus, the auto-attack). */
  isAttackAble(target: Mover): boolean;
}

/** What the skill use reads of the world besides the movers a step gives it. */
export interface SkillUseWorld {
  /** The server clock's tick, for the PLAYERBEHAVIOR a walk to a new target may send first; 0 without one. */
  tick?: () => bigint;
  /** The land and objects the own character stands among, for the line of sight; none, nothing is in the way. */
  ground?: () => Ground | undefined;
  /** Piece 7 M3: true while an item casts, having sent its cancel (`ItemCast.interrupt`): the skill is refused. */
  interruptCast?: () => boolean;
}

/** The spec's guard against a server that drops a request without a word (§3.11, [skills §8.3]): 2 s, then it is over. */
const REQUEST_TIMEOUT_MS = 2000;
/** `m_SkillTimer.Set( 1000 )` (`Mover.cpp:509`): a skill used on arriving waits a second for the next. */
const SKILL_TIMER_MS = 1000;
/** A skill shortcut's `m_dwType` of a party (troupe) skill (`ObjectExecutor`, `WndManager.cpp:2782`). */
const PARTY_SKILL = 2;
/**
 * `CMover::GetAttackRange( dwAttackRange )` (`MoverMsg.cpp:140-169`): how near a skill walks to its target, by its `AR_*`
 * (`AR_SHORT` 1 to `AR_HWAND` 7, `Resource/defineAttribute.h:85-91`); anything else, 0. `DST_HAWKEYE_RATE` (a buff) would
 * lengthen it: no buffs here.
 */
const ATTACK_RANGES: ReadonlyMap<number, number> = new Map([[1, 2], [2, 3], [3, 4], [4, 10], [5, 15], [6, 6], [7, 18]]);

/** `m_oaCmd == OBJACT_USESKILL` and its `m_nCParam`s (`SetCmd`, `MoverMsg.cpp:419`): the skill's slot, its target, how. */
interface SkillCmd {
  index: number;
  targetId: number;
  useType: 0 | 1;
  /**
   * The browser's: the range of a walk to the target that `setOwnDestObj` held back (a target whose walk just met
   * something, Piece 6 spec §3.1), asked for again at each step until it goes; absent once walking.
   */
  heldRange?: number;
}

/** `m_dwNextSkill`: none (`NEXTSKILL_NONE`), the action slot (`NEXTSKILL_ACTIONSLOT`), or a skill slot. */
type NextSkill = null | 'actionSlot' | number;

/** A slot of `m_aJobSkill`: the indexes USESKILL may carry (0-44). */
const isSlotIndex = (index: number): boolean => Number.isInteger(index) && index >= 0 && index < MAX_SKILL_JOB;

/**
 * The own character's skill use: what `CWndMgr`, `CWndWorld`, `CWndTaskBar` and `g_pPlayer` do to use a skill. The task
 * bar's presses come in at any time (`useSlot`, `useActionSlot`) and are taken at the next rules step, which the world
 * screen gives it (`step`) before the attack loop's: a bar slot walks the player to the focus (`CMD_SetUseSkill`, one
 * PLAYERSETDESTOBJ), and on arriving (`arrive`, which the attack loop's arrival hands it) USESKILL goes, `SUT_NORMAL`; the
 * action slot sends its first skill, `SUT_QUEUESTART`, and the server runs the rest of the chain. Nothing plays until the
 * server's USESKILL comes back (`onUseSkill`, which the world tells after it has begun the motion): the request waits
 * for it (`pending`, `REQ_USESKILL`), or for CLEAR_USESKILL, or, as the spec guards against a server that says nothing
 * (it drops a USESKILL of level 0, an empty slot, a level over the maximum and a vendor's, `DPSrvrLux.cpp:53-75`), 2 s.
 *
 * It shares with the attack loop (`attack`, `OwnSkills`) what Neuz keeps once: the one command (`m_oaCmd`), the
 * reserved skill (`m_dwNextSkill`), the auto-attack a skill turns on, and `IsAttackAble`.
 *
 * Also the skill-point spend's request (`spendSkillPoints`): DOUSESKILLPOINT has three answers, the DOUSESKILLPOINT that
 * applies it, a DEFINEDTEXT `TID_RESKILLPOINT_ERROR` (`DPSrvr.cpp:1125`, :1136), or nothing (a spend that changes no
 * level, :1132-1133), so it too is over after 2 s.
 *
 * Left out: flying (the own mover is on the ground), the party skills (`m_dwType == 2`), the private shop's vendor, the
 * arrow a bow skill needs (`IsBullet`: the catalog keeps no `dwLinkKindBullet`; no Vagrant skill needs one), the cast of
 * `STATE_BASEMOTION_MODE`, the teleport skills (`WUI_TARGETCURSORPTZ`, `SI_MAG_MAG_BLINKPOOL`), the skills used from
 * behind (`AS_BACK`: the catalog keeps no `dwAtkStyle`; no Vagrant skill is one), the Ctrl key (`bControl`, which only PK
 * reads, is always sent FALSE, and the PK event's rule for a good skill on a chaotic player with it), the combat music, and
 * `MVRF_SKILL`, which nothing on the client reads.
 */
export class SkillUse implements OwnSkills {
  /** The attack loop's side, which the world screen sets; until then, the rules' own verdict and nothing more. */
  attack: SkillAttack;
  /**
   * A text the skill use prints (`g_WndMng.PutString( prj.GetText( id ), ... )`): `TID_GAME_BLOCKTARGETING` for a target
   * behind an obstacle. Its owner shows it in the messages window.
   */
  onText: (id: string) => void = () => {};

  /** `REQ_USESKILL`: when the USESKILL waiting for its answer went (ms), or null. */
  private requestAt: number | null = null;
  /** When the DOUSESKILLPOINT waiting for its answer went (ms), or null. */
  private spendAt: number | null = null;
  /** `m_oaCmd == OBJACT_USESKILL` and its parameters, or null. */
  private cmd: SkillCmd | null = null;
  /** `CWndWorld::m_dwNextSkill`. */
  private next: NextSkill = null;
  /** `CWndTaskBar::m_nExecute`: 0 idle, 1 the action slot's first skill asked for, 2 the chain running. */
  private executing: 0 | 1 | 2 = 0;
  /** `m_SkillTimerStop`: a key was let go last (none was pressed since), which lets a skill on arrival go at once. */
  private skillTimerStop = false;
  /** When `m_SkillTimer` is out (ms). */
  private skillTimerEnd: number;
  /** The presses of the task bar since the last step: a bar slot's skill slot, or the action slot. */
  private presses: Array<number | 'actionSlot'> = [];

  /**
   * `own` gives the own character's numbers (its skills, its task bar, its hand), `now` the time in ms (`CTimer`'s
   * `timeGetTime()`), `data` the catalogs (the skills, the texts, and the movers for the rules' `IsAttackAble` until the
   * attack loop is set), `world` the clock's tick and the ground.
   */
  constructor(
    private readonly session: SkillUseSession,
    private readonly focus: Focus,
    private readonly own: () => OwnState | undefined,
    private readonly now: () => number,
    private readonly data: Pick<GameData, 'skills' | 'texts' | 'movers'>,
    private readonly world: SkillUseWorld = {},
  ) {
    this.attack = {
      clearCmd: () => this.clearCmd(),
      startAutoAttack: () => {},
      isAttackAble: (target) => attackAble(target, data.movers),
    };
    // Set( 1000 ) as the own mover is made (Mover.cpp:509), which is about when the world opens
    this.skillTimerEnd = now() + SKILL_TIMER_MS;
  }

  /** `m_dwReqFlag & REQ_USESKILL`: a USESKILL waits for its answer (USESKILL, CLEAR_USESKILL, or 2 s). */
  get pending(): boolean {
    return this.requestAt !== null;
  }

  /** A DOUSESKILLPOINT waits for its answer (DOUSESKILLPOINT, `TID_RESKILLPOINT_ERROR`, or 2 s). */
  get spendPending(): boolean {
    return this.spendAt !== null;
  }

  /** `m_dwNextSkill != NEXTSKILL_NONE`. */
  get reserved(): boolean {
    return this.next !== null;
  }

  /** `GetCmd() == OBJACT_USESKILL`. */
  get commanding(): boolean {
    return this.cmd !== null;
  }

  /** `CWndTaskBar::m_nExecute`: 0 idle, 1 the action slot's first skill asked for, 2 its chain running. */
  get execute(): 0 | 1 | 2 {
    return this.executing;
  }

  /**
   * A shortcut of the task bar used, pressed or by its F-key, on an item bar or the applet row: `ObjectExecutor`'s
   * `SHORTCUT_SKILL` (`WndManager.cpp:2776-2880`). A party skill (`m_dwType == 2`, a troupe's, :2782-2875: not Piece 4's)
   * does nothing here; any other is `UseSkillShortCut( m_dwType, m_dwId )` (:2876-2879), whose `GetSkill( nType, nIdx )`
   * reads `m_aJobSkill[ nIdx ]` whatever the type (`MoverParam.cpp:85-95`): `useSlot( m_dwId )`. A shortcut that is no
   * skill (an applet, an item) is not the skill use's.
   */
  useShortcut(shortcut: Shortcut): void {
    if (shortcut.kind === ShortcutKind.SKILL && shortcut.type !== PARTY_SKILL) this.useSlot(shortcut.id);
  }

  /**
   * A press on a skill shortcut, or its F-key: `UseSkillShortCut( 0, nIdx )` (`WndManager.cpp:6820-6864`), `skillIndex`
   * being the shortcut's slot of `m_aJobSkill`. Taken at the next step. An index outside the 45 slots is refused: Neuz
   * would use slot 0 (`GetSkill`, `MoverParam.cpp:89-93`) and send a USESKILL the server drops.
   */
  useSlot(skillIndex: number): void {
    if (isSlotIndex(skillIndex)) this.presses.push(skillIndex);
  }

  /** The action slot's button, or C (`CWndWorld::UseSkill`, `WndWorld.cpp:9139-9157`): taken at the next step. */
  useActionSlot(): void {
    this.presses.push('actionSlot');
  }

  /**
   * A press in the world, on a mover or on the ground (`CWndWorld::OnLButtonDown`, `WndWorld.cpp:6976-6983`): the
   * reserved skill goes, and while the action slot runs (`m_nExecute`, 1 or 2) ENDSKILLQUEUE tells the server to stop
   * its chain; the server's ENDSKILLQUEUE then ends it here. The attack loop calls it with its press (`OwnSkills`), the
   * command having gone with `ClearCmd`; not for a dead player, nor a double click's second press.
   */
  worldPressed(): void {
    this.next = null;
    if (this.executing !== 0) this.session.sendEndSkillQueue();
  }

  /** The skill's part of `ClearCmd()`: its command goes. */
  clearCmd(): void {
    this.cmd = null;
  }

  /** A key goes down (`CWndWorld::OnKeyDown`, `WndWorld.cpp:7756`): `m_SkillTimerStop = FALSE`. */
  keyDown(): void {
    this.skillTimerStop = false;
  }

  /** A key is let go (`CWndWorld::OnKeyUp`, `WndWorld.cpp:7734`): `m_SkillTimerStop = TRUE`, the next arrival not held. */
  keyUp(): void {
    this.skillTimerStop = true;
  }

  /**
   * DOUSESKILLPOINT with `skills`, the 45 slots of the player's own skill IDs with the skill window's levels (its
   * Finish, `SendDoUseSkillPoint`, `WndField.cpp:13728-13741`), unless one waits for its answer: true where it went.
   * A slot count the encoder refuses is said in the console and goes nowhere.
   */
  spendSkillPoints(skills: readonly SkillSlot[]): boolean {
    if (this.spendAt !== null) return false;
    try {
      this.session.sendDoUseSkillPoint(skills);
    } catch (error) {
      console.error('could not send DOUSESKILLPOINT:', error instanceof Error ? error.message : String(error));
      return false;
    }
    this.spendAt = this.now();
    return true;
  }

  /**
   * One rules step, before the attack loop's: a request that waited 2 s is over (as if refused, `OnClearUseSkill`); the
   * task bar's presses since the last step are taken (`UseSkillShortCut`, `CWndWorld::UseSkill`); then `CWndWorld::Process`'s
   * branch of a reserved skill (`WndWorld.cpp:8505-8511`): the action slot (`UseSkillToFocusObj`) or a skill reserved
   * while attacking (`UseSkillShortCut( 0, m_dwNextSkill )`). True where that branch ran: the attack loop then runs
   * neither the attack nor the controls this step (`AttackLoop.step( true )`). `own` is the own mover, `find` the movers
   * in view (`prj.GetMover`).
   */
  step(own: Mover, find: (objectId: number) => Mover | undefined): boolean {
    this.expire();
    const presses = this.presses;
    this.presses = [];
    for (const press of presses) {
      if (press === 'actionSlot') this.useSkill(own);
      else this.useSkillShortCut(own, find, press);
    }
    const held = this.cmd;
    if (held?.heldRange !== undefined &&
      setOwnDestObj(this.session, this.world.tick ?? (() => 0n), find, own, held.targetId, held.heldRange)) {
      this.cmd = { index: held.index, targetId: held.targetId, useType: held.useType };
    }
    if (own.act.stateFlag & ObjStaF.FLY) return false;
    if (this.next === 'actionSlot') {
      this.useSkillToFocusObj(own, find);
      return true;
    }
    if (this.next !== null) {
      this.useSkillShortCut(own, find, this.next);
      return true;
    }
    return false;
  }

  /**
   * `CDPClient::OnUseSkill` (`DPClient.cpp:3894-3950`) after the world's `DoUseSkill` for the caster `casterId`, `started`
   * being its `bSuccess` (`WorldState.onUseSkill`). For the own mover: the request is answered (`REQ_USESKILL` off);
   * begun, the action slot's first skill becomes its running chain (`m_nExecute` 1 → 2, `MoverSkill.cpp:896-903`), and the
   * auto-attack goes on, unless the hand holds a staff, a cheer stick or a wand (`__CSC_VER11_2`), the skill is one on
   * oneself (`EXT_SELFCHGPARAMET`) or the hero Knight's recall (`SI_KNT_HERO_DRAWING`); `g_Option.m_bAutoAttack` is on
   * (`HwOption.cpp:246`, and the browser has no options).
   *
   * Not Neuz's: a queue start's answer that comes after the 2 s guard gave it up finds the action slot idle (the guard,
   * not the server, set `m_nExecute` to 0); begun, the server runs its chain all the same, so the action slot runs too,
   * and a press in the world can stop it with ENDSKILLQUEUE.
   */
  onUseSkill(casterId: number, message: Extract<WorldMessage, { type: 'useSkill' }>, started: boolean): void {
    const state = this.own();
    if (state === undefined || casterId !== state.objectId) return;
    this.requestAt = null;
    if (!started) return;
    if (this.executing === 1) this.executing = 2;
    // the repair of the guard's side effect: only it leaves a queue start's answer with the action slot idle
    else if (this.executing === 0 && message.useType === Sut.QUEUESTART) this.executing = 2;
    const kind3 = state.equipped.weapon?.kind3 ?? Ik3.HAND;
    if (kind3 === Ik3.STAFF || kind3 === Ik3.CHEERSTICK || kind3 === Ik3.WAND) return;
    const skill = this.data.skills.get(message.skill);
    if (skill === undefined || skill.exeTarget === Ext.SELFCHGPARAMET || message.skill === Si.KNT_HERO_DRAWING) return;
    this.attack.startAutoAttack();
  }

  /**
   * The messages of the skill use, the bundle's object ID `objectId` with each, `own` the own mover:
   * - CLEAR_USESKILL about the own mover (`OnClearUseSkill`, `DPClient.cpp:3952-3964`): the request was refused; the
   *   action slot is idle and the reserved skill goes. (Another mover's `REQ_USESKILL` is not kept.)
   * - ENDSKILLQUEUE (`OnEndSkillQueue` → `OnCancelSkill`, `DPClient.cpp:15791-15795`, `WndTaskBar.cpp:2438-2447`).
   * - DOUSESKILLPOINT, and a DEFINEDTEXT `TID_RESKILLPOINT_ERROR`: the spend is answered (its levels are `OwnState`'s).
   * SETACTIONPOINT is `OwnState`'s (the task bar's `m_nActionPoint`); USESKILL comes through the world (`onUseSkill`).
   */
  onMessage(objectId: number, message: WorldMessage, own?: Mover): void {
    switch (message.type) {
      case 'clearUseSkill':
        if (objectId === this.own()?.objectId) this.onClearUseSkill();
        return;
      case 'endSkillQueue':
        this.onCancelSkill(own);
        return;
      case 'doUseSkillPoint':
        this.spendAt = null;
        return;
      case 'definedText':
        if (message.textId === this.data.texts.get('TID_RESKILLPOINT_ERROR')?.textId) this.spendAt = null;
        return;
      default:
        return;
    }
  }

  /**
   * `ProcessMoveArrival`'s `OBJACT_USESKILL` (`MoverMove.cpp:80-184`), which the attack loop's arrival hands it as the own
   * mover comes in range of `target`: false with no skill command. The command ends whatever happens (`SetCmd(
   * OBJACT_NONE )`, :262). It goes on only once `m_SkillTimer` is out, or with a key let go since the last press
   * (`m_SkillTimerStop`); with an obstacle between the two, half a metre up (`IntersectObjLine`), it says
   * `TID_GAME_BLOCKTARGETING` and drops the reserved skill; else, unless a USESKILL waits for its answer, it sends USESKILL
   * (`SendUseSkill( 0, nSkillIdx, idTarget, sutType, bControl )`, Ctrl being up) and waits; then the following ends
   * (`ClearDestObj`), the mover stops, and the timer starts again unless a key was let go. A skill the server would drop
   * without a word is not sent (an empty slot, a level of 0 or over the maximum, `DPSrvrLux.cpp:62-75`), where Neuz would
   * send it and wait: it is over at once, as a refusal, which the 2 s would make of it (`onClearUseSkill`). A send that
   * throws is said in the console, and is over the same way.
   */
  arrive(own: Mover, target: SimMover): boolean {
    const cmd = this.cmd;
    if (cmd === null) return false;
    this.cmd = null;
    tellUntoldWalk(this.session, this.world.tick ?? (() => 0n), own);
    const now = this.now();
    if (!this.skillTimerStop && now < this.skillTimerEnd) return true;
    if (this.blocked(own, target)) {
      this.onText('TID_GAME_BLOCKTARGETING');
      this.next = null;
      return true;
    }
    // Piece 7 M2: an AS_BACK skill (Snitch) only from behind its target (MoverMove.cpp:128-153): the way to it against
    // its facing, a dot of 0.3 at least, else TID_GAME_NEVERKILLSTOP and the command is over
    const slot = this.own()?.skills[cmd.index];
    if (slot !== undefined && this.data.skills.get(slot.skill)?.atkStyle === AS_BACK && !fromBehind(own, target)) {
      this.onText('TID_GAME_NEVERKILLSTOP');
      return true;
    }
    if (this.requestAt === null) {
      if (this.sendable(cmd.index) && this.sendUseSkill(cmd)) this.requestAt = now;
      else this.onClearUseSkill();
    }
    clearDestObj(own);
    own.act.sendActMsg(ActMsg.STOP);
    if (!this.skillTimerStop) this.skillTimerEnd = now + SKILL_TIMER_MS;
    return true;
  }

  /** USESKILL for the command `cmd`; false, said in the console, where the encoder refused it. */
  private sendUseSkill(cmd: SkillCmd): boolean {
    try {
      this.session.sendUseSkill(cmd.index, cmd.targetId, cmd.useType);
      return true;
    } catch (error) {
      console.error('could not send USESKILL:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /** The 2 s of the spec's guard: a USESKILL with no answer is over as a refusal is, a DOUSESKILLPOINT with none too. */
  private expire(): void {
    const now = this.now();
    if (this.requestAt !== null && now - this.requestAt >= REQUEST_TIMEOUT_MS) this.onClearUseSkill();
    if (this.spendAt !== null && now - this.spendAt >= REQUEST_TIMEOUT_MS) this.spendAt = null;
  }

  /** `OnClearUseSkill` for the own mover (`DPClient.cpp:3957-3963`): `REQ_USESKILL` off, `m_nExecute = 0`, no reserved skill. */
  private onClearUseSkill(): void {
    this.requestAt = null;
    this.executing = 0;
    this.next = null;
  }

  /**
   * `CWndTaskBar::OnCancelSkill` (`WndTaskBar.cpp:2438-2447`): nothing while a USESKILL waits for its answer; else the
   * action slot is idle, the own mover stops following (`ClearDestObj`) and the reserved skill goes. (`m_nUsedSkillQueue`,
   * the chain's place, is the server's here: the client only ever starts it at 0.)
   */
  private onCancelSkill(own: Mover | undefined): void {
    if (this.requestAt !== null) return;
    this.executing = 0;
    if (own !== undefined) clearDestObj(own);
    this.next = null;
  }

  /**
   * `CWndMgr::UseSkillShortCut( 0, nIdx )` (`WndManager.cpp:6820-6864`): the skill in slot `index` at the focus, only while
   * the action slot is idle (`m_nExecute == 0`; the focus is always a mover or none here). A command set ends any reserved
   * skill; one refused while the player attacks (a swing or a skill's motion) is reserved, to be tried at each step
   * (`SetNextSkill( dwSkillIdx )`); any other refusal drops it.
   */
  private useSkillShortCut(own: Mover, find: (objectId: number) => Mover | undefined, index: number): void {
    const state = this.own();
    if (state === undefined || state.skills[index] === undefined) return;
    if (this.executing !== 0) return;
    const result = this.cmdSetUseSkill(own, find, this.focus.targetId ?? NULL_ID, index, Sut.NORMAL);
    this.next = null;
    if (!result && own.act.state & ObjSta.ATK_ALL) this.next = index;
  }

  /** `CWndWorld::UseSkill` (`WndWorld.cpp:9139-9157`) on the ground: the action slot is reserved (`NEXTSKILL_ACTIONSLOT`). */
  private useSkill(own: Mover): void {
    if ((own.act.stateFlag & ObjStaF.FLY) === 0) this.next = 'actionSlot';
  }

  /**
   * `CWndWorld::UseSkillToFocusObj( pFocusObj )` (`WndWorld.cpp:6268-6298`): the action slot at the focus
   * (`UseSkillQueue`); begun, the auto-attack goes on with it, unless the hand holds a staff or a cheer stick or the first
   * skill is one on oneself (`EXT_SELFCHGPARAMET`). (This test, unlike `OnUseSkill`'s, lets a wand by.)
   */
  private useSkillToFocusObj(own: Mover, find: (objectId: number) => Mover | undefined): void {
    const focusId = this.focus.targetId;
    if (!this.useSkillQueue(own, find, focusId === null ? undefined : find(focusId))) return;
    const state = this.own();
    const first = state?.taskBar?.queue[0];
    const slot = first === undefined || first.kind === ShortcutKind.NONE ? undefined : state?.skills[first.id];
    const skill = slot === undefined ? undefined : this.data.skills.get(slot.skill);
    const kind3 = state?.equipped.weapon?.kind3 ?? Ik3.HAND;
    if (kind3 === Ik3.STAFF || kind3 === Ik3.CHEERSTICK) return;
    if (skill !== undefined && skill.exeTarget !== Ext.SELFCHGPARAMET) this.attack.startAutoAttack();
  }

  /**
   * `CWndTaskBar::UseSkillQueue( pTargetObj )` (`WndTaskBar.cpp:2214-2272`): not while the chain runs, nor attacking,
   * jumping or flying. The target is the focus in view, or none (`NULL_ID`, which `CMD_SetUseSkill` may still take, :2252);
   * the first slot's skill (`m_aSlotQueue[0]`) is asked for, `SUT_QUEUESTART`, the action slot waiting (`m_nExecute = 1`);
   * refused, the action slot is cancelled (`OnCancelSkill`); set, the reserved action slot goes, unless the hand holds a
   * staff or a cheer stick (which keeps asking at each step, as Neuz does). An empty first slot drops the reservation and
   * is false; so is one whose skill slot is outside the 45, where Neuz would take slot 0.
   */
  private useSkillQueue(own: Mover, find: (objectId: number) => Mover | undefined, target: Mover | undefined): boolean {
    if (this.executing === 2) return false;
    const act = own.act;
    if (act.state & (ObjSta.ATK_ALL | ObjSta.JUMP_ALL) || act.stateFlag & ObjStaF.FLY) return false;
    const state = this.own();
    const first = state?.taskBar?.queue[0];
    if (state === undefined || first === undefined || first.kind === ShortcutKind.NONE || !isSlotIndex(first.id)) {
      this.next = null;
      return false;
    }
    this.executing = 1;
    if (!this.cmdSetUseSkill(own, find, target?.objectId ?? NULL_ID, first.id, Sut.QUEUESTART)) {
      this.onCancelSkill(own);
    } else {
      const kind3 = state.equipped.weapon?.kind3 ?? Ik3.HAND;
      if (kind3 !== Ik3.STAFF && kind3 !== Ik3.CHEERSTICK) this.next = null;
    }
    return true;
  }

  /**
   * `CMover::CMD_SetUseSkill( idTarget, nSkillIdx, sutType )` (`MoverMsg.cpp:172-423`) on the client: the command goes
   * first (`m_oaCmd = OBJACT_NONE`, the melee one too); refused (false) while flying, attacking, jumping, knocked flying
   * or dead, or for a slot with no skill of the catalog. The target: the own mover for `WUI_NOW`, the focus for
   * `WUI_TARGETINGOBJ` (:209-224). Another mover in view as target must be attackable for a harmful skill
   * (`IsAttackAble`, with its side effects) and alive, but for the resurrection, which wants a dead player. Then by
   * `dwExeTarget` (:390-416): the own mover for a skill on oneself or around oneself, oneself too for `EXT_ANOTHERWITH`
   * with no target, and no skill at all with no target for the rest; the walk to it, `GetAttackRange( dwAttackRange )`
   * from it (`SetDestObj`: PLAYERSETDESTOBJ when it is a new one, `setOwnDestObj`); the skill in use cleared
   * (`ClearActParam`); and the command, `SetCmd( OBJACT_USESKILL, nSkillIdx, idTarget, sutType )`. The level is not
   * tested here, nor MP, FP or the cool-down: the server does (and `arrive` holds back what it would drop).
   */
  private cmdSetUseSkill(
    own: Mover, find: (objectId: number) => Mover | undefined, idTarget: number, index: number, useType: 0 | 1,
  ): boolean {
    this.attack.clearCmd();
    const act = own.act;
    if (act.stateFlag & ObjStaF.FLY) return false;
    if (act.state & (ObjSta.ATK_ALL | ObjSta.JUMP_ALL | ObjSta.DMG_FLY_ALL)) return false;
    if (isDie(own)) return false;
    const slot = this.own()?.skills[index];
    const skill = slot === undefined ? undefined : this.data.skills.get(slot.skill);
    if (skill === undefined) return false;
    // Piece 7 M3: an item casting (STATE_BASEMOTION_MODE): its cancel, and no skill (MoverMsg.cpp:196-202)
    if (this.world.interruptCast?.() === true) return false;
    // Piece 7 M2: Blinkpool's teleport (SendTeleSkill, MoverActEvent.cpp:533-551) is not built: refused with a word
    if (skill.id === BLINKPOOL) {
      this.onText(BLINKPOOL_NOT_YET);
      return false;
    }
    // Piece 7 M2: a skill that shoots bullets needs them in the arrow slot (IsBullet, Mover.cpp:8461-8498)
    const link = skill.linkKindBullet ?? -1;
    if (link !== -1 && this.own()?.bullet()?.kind2 !== link) {
      this.onText(skill.linkKind === Ik3.BOW ? 'TID_TIP_NEEDSATTACKITEM' : 'TID_TIP_NEEDSKILLITEM');
      return false;
    }
    let targetId = idTarget;
    if (skill.useChance === Wui.NOW) targetId = own.objectId;
    else if (skill.useChance === Wui.TARGETINGOBJ && this.focus.targetId !== null) targetId = this.focus.targetId;
    if (targetId !== own.objectId) {
      const target = find(targetId);
      if (target !== undefined) {
        if (skill.evildoing < 0 && !this.attack.isAttackAble(target)) return false;
        if (skill.id === Si.ASS_HEAL_RESURRECTION) {
          if (!target.added.isPlayer || !isDie(target)) return false;
        } else if (isDie(target)) {
          return false;
        }
      }
    }
    switch (skill.exeTarget) {
      case Ext.SELFCHGPARAMET:
      case Ext.AROUNDATK:
        targetId = own.objectId;
        break;
      case Ext.ANOTHERWITH:
        if (targetId === NULL_ID) targetId = own.objectId;
        break;
      case Ext.MAGICATKSHOT:
      case Ext.MAGICATK:
      case Ext.MAGICSHOT:
      default:
        if (targetId === NULL_ID) return false;
        break;
    }
    const range = ATTACK_RANGES.get(skill.attackRange) ?? 0;
    const walking = setOwnDestObj(this.session, this.world.tick ?? (() => 0n), find, own, targetId, range);
    act.skillAct = null;
    this.cmd = walking ? { index, targetId, useType } : { index, targetId, useType, heldRange: range };
    return true;
  }

  /**
   * Whether USESKILL for skill slot `index` would be answered: the server drops it without a word for an empty slot or
   * one whose skill it has no row for, a level of 0 or one over the skill's maximum (`CDPSrvr::OnUseSkill`,
   * `DPSrvrLux.cpp:62-75`). The other refusals (the character level, the prerequisites, the weapon, FP) it answers with
   * CLEAR_USESKILL and a text, as Neuz expects.
   */
  private sendable(index: number): boolean {
    const slot = this.own()?.skills[index];
    if (slot === undefined || slot.skill === NULL_ID) return false;
    const skill = this.data.skills.get(slot.skill);
    return skill !== undefined && slot.level > 0 && slot.level <= skill.maxLevel;
  }

  /** The line of sight from the own mover to `target` (`sightBlocked`, `IntersectObjLine`, `WorldIntersect.cpp:745-813`). */
  private blocked(own: Mover, target: SimMover): boolean {
    return sightBlocked(this.world.ground?.(), own.act.body.pos, target.act.body.pos);
  }
}
