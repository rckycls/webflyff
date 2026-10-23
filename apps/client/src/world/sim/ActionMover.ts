import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { ActMsg, AniLoop, Mti, ObjSta, ObjStaF } from './constants';

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
  /** `CMover::IsPlayer()`: only a player takes the falling state (`ActionMoverCollision.cpp:314-317`). Default `false`. */
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

/** `0.005f`, the fall a step adds to `m_vDelta.y` (`ActionMover.cpp:294`). */
const GRAVITY = f32(0.005);
/** `0.001f`, the height change that takes a mover off the ground (`ActionMover.cpp:284`). */
const MOVED_HEIGHT = f32(0.001);
/** `-0.1f`: falling faster than this takes the falling state (`ActionMoverCollision.cpp:308`). */
const FALLING_SPEED = f32(-0.1);
/**
 * `COLL_TEST_DIR` (`ActionMoverCollision.cpp:146`): the move is made 6.5 times longer for the collision test, then
 * `D3DXVECTOR3::operator /=` brings it back by multiplying by `1.0f / 6.5f` (`d3dx9math.inl:349-356`), a round trip
 * that can change the last bit.
 */
const COLL_TEST_DIR = 6.5;
const INV_COLL_TEST_DIR = f32(1 / COLL_TEST_DIR);

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
 * `CActionMover` on the ground (`Source/_AIInterface/ActionMover*.cpp`): the action messages that change a mover's
 * state, and the step that moves it by that state, 60 times a second. Neuz moves every mover with these rules
 * between the server's messages, so a copy that keeps them moves others as their own clients do.
 *
 * Copied: the messages in `ActMsg` (`ProcessActMsg1`); the states `STAND`, `FMOVE`, `BMOVE`, `SIT`, `LTURN` and
 * `RTURN` (`ProcessState1`), and `SJUMP3`/`SJUMP4`, the falling and landing that the terrain height leads to; the
 * position and height part of `ProcessCollisionGround` on terrain only; `PresupposePos`; `CMover::ActionForceSet`.
 * Left out: flying (`IsFly`, flying NPCs), attacks, damage, collecting, jumping on purpose, the `MVRF_NOMOVE` and
 * `CHS_LOOT` blocks (no buffs here), object collision, `HATTR_*` and the world's edge (`CWorld::ClipX`/`ClipZ`);
 * `__Y_INTERFACE_VER3` (strafing) and `__X15` are off in Neuz's build. Positions, deltas and speeds are floats (`f32`).
 */
export class ActionMover {
  /** `m_dwState`: `OBJSTA_*` bits. */
  state = 0;
  /** `m_dwStateFlag`: `OBJSTAF_*` bits. */
  stateFlag = 0;
  /** `CMover::m_dwMotion`: the `MTI_*` motion set last. */
  motion = NO_MOTION;
  /** `CMover::m_dwMotionOption` (`MOP_*`). */
  motionOption = 0;
  /** `m_pModel->m_nLoop` (`ANILOOP_*`), which `CModel::InitAnimate` starts at `ANILOOP_LOOP`. */
  loop: number = AniLoop.LOOP;
  /** `m_nMotionEx`. */
  motionEx = -1;
  /** `m_vDelta`: the movement per step. */
  delta: Vec3 = [0, 0, 0];
  /**
   * `m_pModel->IsEndFrame()`: whether the motion has played to its end. No model plays it here, so by default every
   * motion has ended at once (sitting down takes one step); whoever plays the motions can answer from the animation.
   */
  isEndFrame: () => boolean = () => true;
  /** `CMover::ClearDest` (`Mover.h:1008`), which `STOP` calls. The destination is not kept here: its owner sets this. */
  clearDest: () => void = () => {};

  /** `m_bGround`: 1 standing on the ground. (2, sliding, comes from object collision, which is not copied.) */
  private ground = 0;
  /** `m_bMove`: this step moves in x or z. */
  private moved = false;
  /** `m_vDeltaAccu`: the step's movement (`m_vDelta`), which the collision step adds. */
  private deltaAccu: Vec3 = [0, 0, 0];
  /** `m_vPosLast`: where the last step put the mover, a copy of its own (`ActionMover.cpp:192`). */
  private posLast: Vec3 = [0, 0, 0];

  constructor(readonly body: MoverBody) {
    body.pos = toFloats(body.pos);
    body.angle = wrapAngle(body.angle);
  }

  /** `CActionMover::SendActMsg` (`ActionMover.cpp:337`) on the ground: true when `ProcessActMsg1` returns 1. */
  sendActMsg(msg: number, ...params: number[]): boolean {
    return this.processActMsg1(msg, params[2] ?? 0) === 1;
  }

  /**
   * One step of `CMover::Process` (`Source/_Common/Mover.cpp:3802-3906`) after `ProcessMove`: `ProcessPreAction`,
   * `ProcessAction` (the states), `ProcessCollision` (the move and the terrain height), then `SetPos` only if there is
   * land there (`GetWorld()->GetLandscape( vPos )`): `groundAt` gives the terrain height, or `null` where there is
   * none, and then the mover stays where it was (the C++ also measures the height there, from no land; that is
   * skipped). Without `groundAt` the mover keeps its height, as on a flat floor.
   */
  step(groundAt?: (x: number, z: number) => number | null): void {
    const pos = toFloats(this.body.pos);
    this.deltaAccu = [0, 0, 0];
    this.processAction(pos);
    // ProcessCollisionGround (ActionMoverCollision.cpp:135-274): the move in x and z, through the collision test's
    // x6.5 and back. Milestone 2 puts the object collision (the knee-height test, CWorld::ProcessCollision, which
    // gives the vector back unchanged where nothing is hit) between the two, and the HATTR_* checks after each axis.
    if (this.moved) {
      const dx = f32(f32(this.deltaAccu[0] * COLL_TEST_DIR) * INV_COLL_TEST_DIR);
      const dz = f32(f32(this.deltaAccu[2] * COLL_TEST_DIR) * INV_COLL_TEST_DIR);
      pos[0] = f32(pos[0] + dx);
      pos[2] = f32(pos[2] + dz);
    }
    const height = groundAt ? groundAt(pos[0], pos[2]) : pos[1];
    if (height !== null) this.processHeight(pos, f32(height));
    this.posLast = copy(pos);
    if (height !== null) this.body.pos = pos;
  }

  /**
   * `CActionMover::PresupposePos` (`ActionMover.cpp:355-439`): where the mover will be `frames` steps on if its move
   * and turn states stay. Its own float angle turns by 4 and wraps at 360, without `SetAngle`. The world's edge
   * (`ClipX`/`ClipZ`) and `m_nCorr` are left out.
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
   * belong to the correction and the destination, which the caller keeps.
   */
  forceSet(m: MoveReport): void {
    this.body.pos = toFloats(m.pos);
    this.body.angle = wrapAngle(m.angle);
    // CActionMover::ForcedSet (ActionMoverMsg.cpp:35-60): it does not take a change into or out of flying or sitting
    const from = this.stateFlag;
    const to = m.stateFlag;
    if ((from & ObjStaF.FLY) === (to & ObjStaF.FLY) && (from & ObjStaF.SIT) === (to & ObjStaF.SIT)) {
      this.delta = toFloats(m.delta);
      this.state = m.state >>> 0;
      this.stateFlag = to >>> 0;
      this.motionEx = m.motionEx;
    }
    this.motion = NO_MOTION;
    this.setMotion(m.motion, m.loop, m.motionOption);
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

  /** `CActionMover::ProcessAction` (`ActionMover.cpp:210-334`) on the ground; `vPos` is the position the step starts at. */
  private processAction(vPos: Vec3): void {
    this.delta[0] = this.delta[2] = 0;
    if (this.state === 0) {
      this.processActMsg1(ActMsg.STAND, 0);
    } else {
      // the groups whose states are copied, in ProcessAction's order; the look, attack, damage and action states are not
      const speed = f32(this.body.speed);
      for (const group of [ObjSta.MOVE_ALL, ObjSta.TURN_ALL, ObjSta.JUMP_ALL]) {
        if (this.state & group) this.processState1(this.state & group, speed);
      }
    }
    // m_vDeltaE, the outside force, is always zero here
    this.moved = this.delta[0] !== 0 || this.delta[2] !== 0;
    if (this.delta[1] !== 0 || this.moved) this.ground = 0;
    else if (Math.abs(f32(vPos[1] - this.posLast[1])) > MOVED_HEIGHT) this.ground = 0;
    // gravity, except while vanishing after death
    if ((this.state & ObjSta.DMG_ALL) !== ObjSta.DISAPPEAR && this.ground !== 1) {
      this.delta[1] = f32(this.delta[1] - GRAVITY);
      if (this.delta[1] < -0.5) this.delta[1] = -0.5;
    }
    for (let i = 0; i < 3; i++) this.deltaAccu[i] = f32(this.deltaAccu[i]! + this.delta[i]!);
  }

  /**
   * The height part of `CActionMover::ProcessCollisionGround` (`ActionMoverCollision.cpp:276-388`) on terrain only:
   * `ProcessUnderCollision` gives the terrain's `height` (objects under the mover, and sliding down slopes steeper
   * than 112 degrees, need the shapes); `OnActDrop` (PLAYERCORR, QUERYGETPOS) and landing on ships are left out.
   * Going up, nothing is above the mover without objects (`GetOverHeight`).
   */
  private processHeight(pos: Vec3, height: number): void {
    const dy = this.deltaAccu[1];
    if ((this.state & ObjSta.DMG_ALL) === ObjSta.DISAPPEAR) return;
    if (dy < 0) {
      if (this.ground === 1) return;
      pos[1] = f32(pos[1] + dy);
      let landing = false;
      if ((this.state & ObjSta.JUMP_ALL) === ObjSta.SJUMP3) {
        if (pos[1] < height) landing = true;
      } else if (f32(pos[1] - 0.25) > height) {
        // falling fast enough: a player takes the falling state (__SYS_COLLECTING, __BS_FIXED_KNOCKBACK)
        if (dy < FALLING_SPEED && (this.state & ObjSta.COLLECT) === 0 && this.body.isPlayer
          && (this.state & ObjSta.DMG_FLY_ALL) === 0) {
          this.setState(ObjSta.JUMP_ALL, ObjSta.SJUMP3);
        }
      } else {
        landing = true;
      }
      if (landing) {
        pos[1] = height;
        this.ground = 1;
        this.delta[1] = 0;
      }
    } else if (dy > 0) {
      pos[1] = f32(pos[1] + dy);
    }
  }

  /** `CActionMover::ProcessActMsg1` (`ActionMoverMsg.cpp:101-1170`) for the messages in `ActMsg`. */
  private processActMsg1(msg: number, param3: number): number {
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
        this.processActMsg1(ActMsg.STOP, 0);
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
      case ActMsg.STOP_TURN: // :453-456
        if ((this.state & ObjSta.TURN_ALL) === 0) return 0;
        this.setState(ObjSta.TURN_ALL, 0);
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
   * `CActionMover::ProcessState1` (`ActionMoverState.cpp:32-437`) for the copied states; `speed` is
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
      case ObjSta.SJUMP4: // :414-437, landed: the state ends at once (OnActEndJump4's destination is the caller's)
        this.resetState(ObjSta.JUMP_ALL);
        break;
    }
  }

  /**
   * `CMover::SetMotion` (`Mover.cpp:4817-4977`): false when the same motion with the same option is still playing,
   * loops, or holds its last frame. The weapon's motion set (`+200` and so on in combat) changes only the file played,
   * not `m_dwMotion`, and is left out with the rest of the drawing.
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
    return true;
  }

  /** `CAction::SetState` and its `SetMoveState`/`SetTurnState`/`SetJumpState` (`Action.h:292-296`). */
  private setState(group: number, value: number): void {
    this.resetState(group);
    this.state = (this.state | value) >>> 0;
  }

  /**
   * `CAction::ResetState` (`Action.cpp:163-207`): clears the groups in `mask`. Ending a sitting state takes the
   * sitting flag off (`OnEndMoveState`, :69-78); the other `OnEnd*` handlers do nothing on the ground here.
   */
  private resetState(mask: number): void {
    if (mask & ObjSta.MOVE_ALL && (this.state & ObjSta.MOVE_ALL) === ObjSta.SIT) this.stateFlag &= ~ObjStaF.SIT;
    this.state = (this.state & ~mask) >>> 0;
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
