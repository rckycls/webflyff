// The player's own character as the world screen drives it (spec §3.2, §3.7): `CWndWorld::ControlGround`
// (`Source/_Interface/WndWorldControlPlayer.cpp:299-559`) at each rules step, a tap's destination first and then the
// keys and the joystick, with its moves sent as Neuz sends them; the PLAYERCORR the rules' step may owe; and the stop
// when the page loses the focus or is hidden. The world screen hands it the inputs and the movers; the rules it drives
// are `sim/`'s.

import type { Vec3 } from '@flyffweb/protocol';
import type { MoveIntent, WorldStage } from '@flyffweb/scene';
import { desiredFrom, driveOwnMover, movedReport, restingIn } from './controls';
import type { Desired } from './controls';
import type { MoveMark } from './render/moveMark';
import type { MoverViews } from './render/MoverViews';
import { pickGround } from './render/picking';
import { MAX_CORR_SIZE_45 } from './sim/constants';
import { isEmptyDest, setDestPos } from './sim/moverRules';
import type { WorldSession } from './WorldSession';
import type { Mover } from './WorldState';

/** What the own mover's driving sends. */
export type OwnMoverSession = Pick<WorldSession, 'sendMoved' | 'sendBehavior' | 'sendDestPos' | 'sendCorr'>;

export class OwnMover {
  /**
   * What the controls asked for at the last step, which `desiredFrom` holds on to (the joystick's sectors, the mode at
   * rest); null before the first step and after a stop, when the rest is in the mode the mover has (`restingIn`), so
   * that the first idle step changes no mode.
   */
  private desired: Desired | null = null;

  /** `clock` gives the ticks the moves carry (`g_TickCount.GetTickCount()`); `mark` shows where a tap walks to. */
  constructor(
    private readonly session: OwnMoverSession,
    private readonly clock: { tick(): bigint },
    private readonly mark: Pick<MoveMark, 'show'>,
  ) {}

  /**
   * The controls of one rules step, before the rules step the movers: a tap's destination (`tap`, or null), then the
   * keys and the joystick (`intent`), in `ControlGround`'s order.
   */
  control(own: Mover, intent: MoveIntent, tap: Vec3 | null): void {
    if (tap !== null) this.walkTo(own, tap);
    this.desired = desiredFrom(intent, this.desired ?? restingIn(own.act));
    this.drive(own, this.desired);
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
    if (own === undefined) return;
    own.act.clearDest();
    this.drive(own, restingIn(own.act));
  }

  /**
   * A tap's part of `ControlGround` (`WndWorldControlPlayer.cpp:313-361`): `SetDestPos( vRayEnd )` and
   * `m_nCorr = -1`, so that the walk there ends where it meets something or starts to fall (`stepMover`); the SNAPSHOT
   * with DESTPOS, forward (`SendSnapshot( TRUE )`, which first stands a sitting player up: Piece 3 has no sitting);
   * and the mark.
   */
  private walkTo(own: Mover, pos: Vec3): void {
    setDestPos(own, pos, true);
    own.nCorr = -1;
    this.session.sendDestPos(pos, true);
    this.mark.show(pos);
  }

  /**
   * What the controls ask of the own mover (`driveOwnMover`), its moves sent as `ControlGround` sends them, PLAYERMOVED
   * then PLAYERBEHAVIOR (`WndWorldControlPlayer.cpp:557-559`; a move with a change of mode sends both). A PLAYERMOVED's
   * `PresupposePos` sets `m_nCorr` (`ActionMover.cpp:438`).
   */
  private drive(own: Mover, desired: Desired): void {
    const { moved, behavior } = driveOwnMover(own.act, desired, isEmptyDest(own));
    if (moved) {
      this.session.sendMoved(movedReport(own.act, this.clock.tick()));
      own.nCorr = MAX_CORR_SIZE_45;
    }
    if (behavior) this.session.sendBehavior(own.act.report(this.clock.tick()));
  }
}

/**
 * The D3D point a tap at (`ndcX`, `ndcY`) sends the own mover (`own`) to, from `stage`'s camera as last drawn
 * (`pickGround`): on its land and objects, unless a mover drawn in `views`, the own one left out, is nearer.
 */
export function pickOnStage(
  stage: Pick<WorldStage, 'camera' | 'ground'> & { manifest: Pick<WorldStage['manifest'], 'mpu'> },
  views: Pick<MoverViews, 'nearestHit'>, own: Mover | undefined, ndcX: number, ndcY: number,
): Vec3 | null {
  return pickGround(stage.camera, ndcX, ndcY, stage.ground(), stage.manifest.mpu, (ray) => views.nearestHit(ray, own?.objectId));
}
