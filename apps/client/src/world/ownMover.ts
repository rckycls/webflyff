// The player's own character as the world screen drives it (spec §3.2, §3.7): `CWndWorld::ControlGround`
// (`Source/_Interface/WndWorldControlPlayer.cpp:299-559`) at each rules step, a tap's destination first, then the
// keys and the joystick, then the walk key's toggle (spec §1), with its moves sent as Neuz sends them; the PLAYERCORR
// the rules' step may owe; and the stop when the page loses the focus or is hidden. The world screen hands it the
// inputs and the movers; the rules it drives are `sim/`'s.

import type { Vec3 } from '@flyffweb/protocol';
import type { WorldStage } from '@flyffweb/scene';
import { desiredFrom, driveOwnMover, movedReport, restingIn } from './controls';
import type { ControlIntent, Desired } from './controls';
import type { MoveMark } from './render/moveMark';
import type { MoverViews } from './render/MoverViews';
import { pickTap } from './render/picking';
import type { TapHit } from './render/picking';
import { ActMsg, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from './sim/constants';
import { isEmptyDest, setDestPos } from './sim/moverRules';
import type { WorldSession } from './WorldSession';
import type { Mover } from './WorldState';

/** What the own mover's driving sends. */
export type OwnMoverSession = Pick<WorldSession, 'sendMoved' | 'sendBehavior' | 'sendDestPos' | 'sendCorr'>;

// Ground steering reports at 10 Hz leave room for a collision correction after every report.
// Local movement still runs at 60 Hz; counting simulation steps also bounds catch-up bursts.
const STEERING_REPORT_STEPS = 6;

export class OwnMover {
  /**
   * What the controls asked for at the last step, which `desiredFrom` holds on to (the joystick's sectors, the mode at
   * rest); null before the first step and after a stop, when the rest is in the mode the mover has (`restingIn`), so
   * that the first idle step changes no mode.
   */
  private desired: Desired | null = null;
  /** `s_bWalk2`: whether the walk key was held at the last step that read it (`WndWorldControlPlayer.cpp:117`, :546). */
  private walkKeyWas = false;
  private stickSteering = false;
  private steeringReportWait = 0;
  private pendingSteeringReport = false;

  /** `clock` gives the ticks the moves carry (`g_TickCount.GetTickCount()`); `mark` shows where a tap walks to. */
  constructor(
    private readonly session: OwnMoverSession,
    private readonly clock: { tick(): bigint },
    private readonly mark: Pick<MoveMark, 'show'>,
  ) {}

  /**
   * The controls of one rules step, before the rules step the movers: a tap's destination (`tap`, or null), then the
   * keys and the joystick (`intent`, `controlIntent`'s), then the walk key (`walkKey`: whether X is held), in
   * `ControlGround`'s order. The walk key toggles the gait as it goes down (`bWalk && !s_bWalk2`, :526-546): MODE_RUN
   * when walking, MODE_WALK when not, and so a PLAYERBEHAVIOR (and `ClearDest`, :548-553) once a press; the mode it
   * gives is the one the keys move at from then on.
   */
  control(own: Mover, intent: ControlIntent, tap: Vec3 | null, walkKey = false, jump = false): void {
    this.steeringReportWait = Math.max(0, this.steeringReportWait - 1);
    if (tap !== null) this.walkTo(own, tap);
    // Combat can change the gait while the controls are not running; keep the mover's current mode.
    let desired = desiredFrom(intent, {
      ...(this.desired ?? restingIn(own.act)), walk: (own.act.stateFlag & ObjStaF.WALK) !== 0,
    });
    if (walkKey && !this.walkKeyWas) desired = { ...desired, walk: (own.act.stateFlag & ObjStaF.WALK) === 0 };
    this.walkKeyWas = walkKey;
    this.desired = desired;
    const airborne = (own.act.state & ObjSta.JUMP_ALL) !== 0;
    if (airborne || intent.angle === undefined) this.pendingSteeringReport = false;
    const starting = !airborne && intent.angle !== undefined && (own.act.state & ObjSta.MOVE_ALL) !== ObjSta.FMOVE;
    const steered = airborne && (intent.angle !== undefined || this.stickSteering) &&
      own.act.steerJump(intent.angle ?? null);
    const airTurn = airborne && intent.angle === undefined && own.act.turnJump(intent.turn);
    this.stickSteering = intent.angle !== undefined;
    const turned = intent.angle !== undefined && !airborne &&
      own.act.sendActMsg(ActMsg.TURNMOVE, intent.angle);
    if (turned || steered) own.act.clearDest();
    this.drive(own, desired, turned, jump, steered || airTurn, starting && turned);
  }

  /**
   * After the rules' step: the PLAYERCORR it owes (`CMover::OnActCollision` / `OnActDrop`'s `SendPlayerCorr`,
   * `SimMover.corrReport`), with the clock's tick.
   */
  corrected(own: Mover | undefined): void {
    const corr = own?.corrReport;
    if (!corr) return;
    own.corrReport = null;
    this.session.sendCorr({ ...corr, tick: this.clock.tick() });
  }

  /**
   * The page lost the focus or is hidden, and the controls let go: the player stops now (the world screen's
   * `stopOwnMover`), its walk to a tapped point too, as a key's move ends it (`ClearDest`); the mode stays.
   */
  stop(own: Mover | undefined): void {
    this.desired = null;
    this.pendingSteeringReport = false;
    const steered = this.stickSteering && own !== undefined && own.act.steerJump(null);
    const airTurn = own?.act.turnJump(0) ?? false;
    this.stickSteering = false;
    if (own === undefined) return;
    own.act.clearDest();
    this.drive(own, restingIn(own.act), false, false, steered || airTurn);
  }

  /**
   * A tap's part of `ControlGround` (`WndWorldControlPlayer.cpp:313-361`): `SetDestPos( vRayEnd )` and
   * `m_nCorr = -1`, so that the walk there ends where it meets something or starts to fall (`stepMover`); the SNAPSHOT
   * with DESTPOS, forward (`SendSnapshot( TRUE )`, which first stands a sitting player up: Piece 3 has no sitting);
   * and the mark.
   */
  walkTo(own: Mover, pos: Vec3, send = true): void {
    this.pendingSteeringReport = false;
    setDestPos(own, pos, true);
    own.nCorr = -1;
    if (send) this.session.sendDestPos(pos, true);
    this.mark.show(pos);
  }

  /**
   * What the controls ask of the own mover (`driveOwnMover`), its moves sent as `ControlGround` sends them, PLAYERMOVED
   * then PLAYERBEHAVIOR (`WndWorldControlPlayer.cpp:557-559`; a move with a change of mode sends both). A PLAYERMOVED's
   * `PresupposePos` sets `m_nCorr` (`ActionMover.cpp:438`).
   */
  private drive(own: Mover, desired: Desired, turned = false, jump = false, steered = false, starting = false): void {
    const { moved, behavior } = driveOwnMover(own.act, desired, isEmptyDest(own), jump);
    if (own.act.state & ObjSta.JUMP_ALL) this.pendingSteeringReport = false;
    else if (turned) this.pendingSteeringReport = true;
    if (moved || starting || (this.pendingSteeringReport && this.steeringReportWait === 0)) {
      this.session.sendMoved(movedReport(own.act, this.clock.tick()));
      own.nCorr = MAX_CORR_SIZE_45;
      this.pendingSteeringReport = false;
      this.steeringReportWait = STEERING_REPORT_STEPS;
    }
    // Air steering uses the current position/velocity, rather than a predicted ground move.
    if (behavior || steered) this.session.sendBehavior(own.act.report(this.clock.tick()));
  }
}

/**
 * What a tap at (`ndcX`, `ndcY`) lands on, from `stage`'s camera as last drawn (`pickTap`): the mover drawn in
 * `views` that the box pick finds (the own mover, `own`, left out), which the tap selects; else the D3D point of the
 * stage's land and objects the own mover walks to; or null.
 */
export function pickOnStage(
  stage: Pick<WorldStage, 'camera' | 'ground'> & { manifest: Pick<WorldStage['manifest'], 'mpu'> },
  views: Pick<MoverViews, 'pickCandidates'>, own: Mover | undefined, ndcX: number, ndcY: number,
): TapHit | null {
  return pickTap(stage.camera, ndcX, ndcY, stage.ground(), stage.manifest.mpu, views.pickCandidates(own?.objectId));
}
