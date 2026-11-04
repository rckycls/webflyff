// The own flier's controls (Piece 7 M5, [R §2]): what the keys, the mouse and the phone's buttons ask of the rules, and
// the flight packets that tell the server.
//
//   control      CWndWorld::ControlFlying       Source/_Interface/WndWorldControlPlayer.cpp:666-947
//   flushAngle   CDPClient::FlushPlayerAngle    Source/Neuz/DPClient.cpp:14495-14517 (PostPlayerAngle, :14491)
//   moved2       CDPClient::SendPlayerMoved2    DPClient.cpp:10150-10175: PresupposePos2 37 steps on, and nFrame
//
// Z (tracking), Tab (the targets in the air) and the attack are the air combat's (`attackLoop.ts`); the phone's held
// Accelerate (Decision 4) is `accelerateHeld`.

import type { AngleReport, FlightReport, Vec3 } from '@flyffweb/protocol';
import type { WorldSession } from './WorldSession';
import type { ActionMover } from './sim/ActionMover';
import type { Ground } from './sim/collision';
import { ActMsg, MAX_CORR_SIZE_150, ObjSta, ObjStaF } from './sim/constants';
import { presupposeFlight, setAngle } from './sim/flight';
import type { FlightState } from './sim/flight';
import { fullHeight } from './sim/flightCollision';

const f32 = Math.fround;

/** What the player asks of the flier this step. */
export interface FlightInput {
  /** W: the nose down (only above the ground). */
  dive: boolean;
  /** S: the nose up. */
  climb: boolean;
  /** A and D: turn. */
  left: boolean;
  right: boolean;
  /** Space pressed this step: the thrust toggles. */
  accelerateToggle: boolean;
  /** The phone's Accelerate, held (Decision 4): the thrust starts as it is pressed and stops as it is let go. */
  accelerateHeld?: boolean;
  /** X pressed this step: the turbo toggles. */
  turboToggle: boolean;
  /** Z pressed this step: tracking toggles (the air combat's). */
  trackToggle: boolean;
  /** Tab pressed this step: the next target in the air (the air combat's). */
  nextTarget: boolean;
  /** The left button held, or Insert: attack the focus (the air combat's). */
  attack: boolean;
  /** The mouse's move this step while it steers (the right button held), in pixels; null for none. */
  mouse: { dx: number; dy: number } | null;
}

export const NO_FLIGHT_INPUT: Readonly<FlightInput> = {
  dive: false, climb: false, left: false, right: false, accelerateToggle: false, turboToggle: false, trackToggle: false,
  nextTarget: false, attack: false, mouse: null,
};

/** The own flier as the controls see it: its rules, and `m_nCorr` (PresupposePos2 sets it to the frames predicted). */
export interface OwnFlier {
  act: ActionMover;
  nCorr?: number;
}

type FlightSender = Pick<WorldSession, 'sendMoved2' | 'sendAngle' | 'sendCorr2' | 'sendBehavior2'>;

/** The roll the camera may show (`m_fRollAng`, off by default): ±1 a step turning, to ±45, and back by 2. */
const ROLL_MAX = 45;
/** `FlushPlayerAngle`: a queued angle goes out on every 30th step it waits. */
const ANGLE_EVERY = 30;

export class FlightControl {
  private rollAngle = 0;
  /** `m_pa.fValid` and `m_pa.nCounter` (`PostPlayerAngle`, `FlushPlayerAngle`). */
  private anglePending = false;
  private angleCounter = 0;
  /** The phone's Accelerate as it was last step. */
  private held = false;

  constructor(private readonly session: FlightSender, private readonly clock: { tick(): bigint }) {}

  /** `m_fRollAng`, in degrees. */
  get roll(): number {
    return this.rollAngle;
  }

  /** `PostPlayerAngle( TRUE )`: tracking turned the flier (`ProcessFlyTracking`), so a PLAYERANGLE is queued. */
  postAngle(): void {
    this.anglePending = true;
  }

  /** One rules step of `ControlFlying` for the own flier; nothing on the ground. */
  control(own: OwnFlier, input: FlightInput, ground: Ground): void {
    const act = own.act;
    if (!act.isFlying()) return;
    let moved = false;
    const send = (msg: number, ...params: number[]): void => {
      if (act.actMsgError(msg, ...params) === 1) moved = true;
    };
    const accelerating = (): boolean => (act.stateFlag & ObjStaF.ACC) !== 0;
    const turning = (): boolean => (act.state & ObjSta.TURN_ALL) !== 0;

    send(accelerating() ? ActMsg.FORWARD : ActMsg.STAND);
    if (input.accelerateToggle) {
      if (accelerating()) {
        act.sendActMsg(ActMsg.ACC_STOP);
        if (turning()) moved = true;
      } else if (act.actMsgError(ActMsg.ACC_START) === 1) {
        send(ActMsg.FORWARD);
      }
    }
    if (input.accelerateHeld !== undefined) {
      if (input.accelerateHeld && !this.held && !accelerating()) {
        if (act.actMsgError(ActMsg.ACC_START) === 1) send(ActMsg.FORWARD);
      } else if (!input.accelerateHeld && this.held && accelerating()) {
        act.sendActMsg(ActMsg.ACC_STOP);
        if (turning()) moved = true;
      }
      this.held = input.accelerateHeld;
    }
    if (input.turboToggle) send(act.stateFlag & ObjStaF.TURBO ? ActMsg.MODE_TURBO_OFF : ActMsg.MODE_TURBO_ON);

    if (input.dive) {
      const pos = act.body.pos;
      if (fullHeight(ground, pos) < pos[1]) send(ActMsg.LOOKDOWN);
    } else if (input.climb) {
      send(ActMsg.LOOKUP);
    } else {
      send(ActMsg.STOP_LOOK);
    }

    const turn = Math.trunc(f32(act.ride!.turn * 100));
    if (input.left) {
      this.rollAngle = Math.max(-ROLL_MAX, this.rollAngle - 1);
      send(ActMsg.LTURN, turn);
    } else if (input.right) {
      this.rollAngle = Math.min(ROLL_MAX, this.rollAngle + 1);
      send(ActMsg.RTURN, turn);
    } else {
      this.rollAngle = this.rollAngle < 0 ? Math.min(0, this.rollAngle + 2) : Math.max(0, this.rollAngle - 2);
      send(ActMsg.STOP_TURN);
    }

    if (input.mouse !== null) {
      const add = f32(input.mouse.dx / 2);
      act.body.angle = setAngle(f32(act.body.angle - add));
      const addX = f32(input.mouse.dy / 4);
      let angleX = f32(act.angleX + addX);
      if (addX > 0 && angleX > 45) angleX = 45;
      else if (addX < 0 && angleX < -45) angleX = -45;
      act.angleX = angleX;
      if (add !== 0 || addX !== 0) this.anglePending = true;
    }

    if (moved) this.moved2(own);
  }

  /** `FlushPlayerAngle`, every rules step: a queued angle goes out when its counter reaches a 30th step. */
  flushAngle(own: OwnFlier): void {
    if (!this.anglePending || ++this.angleCounter % ANGLE_EVERY !== 0) return;
    this.anglePending = false;
    if (!own.act.isFlying()) return;
    const p = this.presuppose(own);
    const r: AngleReport = {
      pos: p.pos, delta: p.delta, angle: p.angle, angleX: p.angleX, accPower: p.accPower, turnAngle: own.act.turnAngle,
      tick: this.clock.tick(),
    };
    this.session.sendAngle(r);
  }

  /** The own flier's move met something (`OnActCollision`) while its last report runs (`m_nCorr`): PLAYERCORR2. */
  collided(own: OwnFlier): void {
    if (!own.act.isFlying() || !own.nCorr || own.nCorr <= 0) return;
    this.corr2(own);
    own.nCorr = 0;
  }

  /** PLAYERCORR2 of the flier as it is now (the rules' `OnActCollision` having tested `m_nCorr`). */
  corr2(own: OwnFlier): void {
    if (own.act.isFlying()) this.session.sendCorr2(this.report(own.act));
  }

  /** The own mover came into the world flying, or took off: PLAYERBEHAVIOR2, its state as it is. */
  entered(own: OwnFlier): void {
    if (!own.act.isFlying()) return;
    this.session.sendBehavior2(this.report(own.act));
  }

  /** `SendPlayerMoved2( MAX_CORR_SIZE_150 )`. */
  private moved2(own: OwnFlier): void {
    const p = this.presuppose(own);
    this.session.sendMoved2({ ...this.report(own.act), ...p }, MAX_CORR_SIZE_150);
  }

  /** `PresupposePos2( MAX_CORR_SIZE_150 )`, which also sets `m_nCorr`. */
  private presuppose(own: OwnFlier): { pos: Vec3; delta: Vec3; angle: number; angleX: number; accPower: number } {
    own.nCorr = MAX_CORR_SIZE_150;
    return presupposeFlight(own.act as unknown as FlightState, MAX_CORR_SIZE_150);
  }

  /** The flier's state as the flight packets carry it. */
  private report(act: ActionMover): FlightReport {
    return { ...act.report(this.clock.tick()), angleX: act.angleX, accPower: act.accPower, turnAngle: act.turnAngle };
  }
}
