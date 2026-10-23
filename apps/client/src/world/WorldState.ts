import type { AddedMover, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { ServerClock } from '../net/serverClock';
import type { GameData } from './gameData';
import { ActionMover, wrapAngle } from './sim/ActionMover';
import { ActMsg, ObjStaF } from './sim/constants';
import { applyDestPos, applyMotion, applyMoved, setDestAngle, setDestObj, stepMover } from './sim/moverRules';
import type { SimMover } from './sim/moverRules';

const f32 = Math.fround;

export type MoverKind = 'player' | 'monster' | 'npc';

/** A mover in view: the rules' `SimMover` (kept as one object for its whole life) and what ADD_OBJ said about it. */
export interface Mover extends SimMover {
  kind: MoverKind;
  isSelf: boolean;
  /** The ADD_OBJ the mover came from: the model, the look and the worn parts are read from it. */
  added: AddedMover;
  /** `CMover::m_szName`: the player's own, the character's from `character.inc`, or the monster's from `propMover.txt`. '' where unknown. */
  name: string;
}

/**
 * What changed in view since the last `takeChanges`. A caller applies `removed` first, then `added`:
 * - `removed` holds the ID of every mover that left or was replaced, once. It may hold an ID the caller never saw (a
 *   mover that came and went between two calls), which has nothing to drop.
 * - `added` holds the movers that came and are still in view, in the order they came. A mover that came and went
 *   between two calls is left out.
 */
export interface WorldChanges {
  added: Mover[];
  removed: number[];
}

/**
 * The movers in view, and the messages that move them: `CDPClient`'s handlers for ADD_OBJ, DEL_OBJ and the mover
 * messages (`Source/Neuz/DPClient.cpp`), with the ground rules of `sim/` doing what `CMover` does with each. Keys are the
 * message's object ID, as `prj.GetCtrl( objid )` looks them up. Fliers are placed but never stepped (the ground rules
 * leave flying out), and the objects that are not movers are not kept.
 */
export class WorldState {
  private readonly byId = new Map<number, Mover>();
  private own: Mover | undefined;
  private pendingAdded: Mover[] = [];
  private pendingRemoved = new Set<number>();

  /** `prj.GetCtrl`, for the rules that follow an object. */
  private readonly find = (objectId: number): Mover | undefined => this.byId.get(objectId);

  constructor(
    private readonly data: GameData,
    private readonly clock: ServerClock,
    private readonly groundAt: (x: number, z: number) => number | null,
  ) {}

  get movers(): ReadonlyMap<number, Mover> {
    return this.byId;
  }

  /** The player's own character, once its ADD_OBJ (the one with the bundle's player object ID) has come. */
  self(): Mover | undefined {
    return this.own;
  }

  /** One message of a bundle, about the object `objectId`. A mover message for an ID not in view is ignored. */
  apply(objectId: number, message: WorldMessage): void {
    if (message.type === 'addMover') {
      this.add(objectId, message.mover);
      return;
    }
    if (message.type === 'delObj') {
      this.drop(objectId); // OnRemoveObj (:1643): the object is deleted
      return;
    }
    const m = this.byId.get(objectId);
    if (m === undefined) return;
    switch (message.type) {
      case 'moverMoved': // OnMoverMoved (:8574), the move aged by the server clock
        applyMoved(m, message.move, this.clock.offsetMs(message.move.tick), false);
        break;
      case 'moverBehavior': // OnMoverBehavior (:8653)
        applyMoved(m, message.move, this.clock.offsetMs(message.move.tick), true);
        break;
      case 'moverAngle':
        // OnMoverAngle (:8887) starts with `if( IsFly() == FALSE ) return;`: it is the flier's correction
        break;
      case 'destPos': // OnSetDestPos (:3731)
        applyDestPos(m, message.pos, message.forward);
        break;
      case 'destAngle': // OnSetDestAngle (:3769)
        setDestAngle(m, message.angle, message.left);
        break;
      case 'setDestObj': // OnMoverSetDestObj (:8561) follows only a target that is in view
        if (this.byId.has(message.targetId)) setDestObj(m, message.targetId, message.range);
        break;
      case 'motion': // OnMotion (:9951)
        applyMotion(m, message.message);
        break;
      case 'setPos':
        this.setPos(m, message.pos);
        break;
      case 'setPosAngle':
        this.setPosAngle(m, message.pos, message.angle);
        break;
      default: // addOther, worldReadInfo, replace: the objects that are not movers and the world changes are not kept here
        break;
    }
  }

  /** One 60 Hz step of the rules for every mover in view, except fliers. */
  step(): void {
    for (const m of this.byId.values()) {
      if (m.act.stateFlag & ObjStaF.FLY) continue;
      stepMover(m, this.find, this.groundAt);
    }
  }

  /** The changes since the last call (see `WorldChanges`). */
  takeChanges(): WorldChanges {
    const added = this.pendingAdded.filter((m) => this.byId.get(m.objectId) === m);
    const removed = [...this.pendingRemoved];
    this.pendingAdded = [];
    this.pendingRemoved = new Set();
    return { added, removed };
  }

  /**
   * ADD_OBJ of a mover (`OnAddObj`, :1053). An ID already in view is replaced by the new one. Neuz keeps the old object
   * when it is in a world (:1081-1104: it reads the new one into a throwaway object and cancels the old one's pending
   * deletion), which would leave this state as it was; the server has sent the whole mover again, so the new one is taken.
   */
  private add(objectId: number, added: AddedMover): void {
    this.drop(objectId);
    const mover = this.build(objectId, added);
    this.byId.set(objectId, mover);
    if (mover.isSelf) this.own = mover;
    this.pendingAdded.push(mover);
  }

  private drop(objectId: number): void {
    const old = this.byId.get(objectId);
    if (old === undefined) return;
    this.byId.delete(objectId);
    if (old === this.own) this.own = undefined;
    this.pendingRemoved.add(objectId);
  }

  /**
   * The mover `CMover::Serialize` makes of an ADD_OBJ (`ObjSerializeOpt.cpp:364-400`): the motion, the state flag
   * (`ClearStateFlag`, then `AddStateFlag( dw2 )`) and the state (`__ForceSetState( dw1 )`), at the position and angle
   * of the object (`CObj::Serialize`). Its speed is `CMover::GetSpeed( m_fSpeed )` (`MoverParam.cpp:3262`): `m_fSpeed`
   * is the mover's `fSpeed` (`CreateObj.cpp:644`, `Mover.cpp:1521`) times `m_fSpeedFactor`, which is 1 (`Mover.cpp:517`)
   * unless the NPC part of the ADD_OBJ sends one (`ObjSerializeOpt.cpp:753`), a float product; no buff changes it here.
   */
  private build(objectId: number, added: AddedMover): Mover {
    const prop = this.data.movers.get(added.index);
    const speedFactor = added.npc?.speedFactor ?? 1;
    const speed = f32(f32(prop?.speed ?? 0) * f32(speedFactor));
    const act = new ActionMover({ pos: added.pos, angle: added.angle, speed, isPlayer: added.isPlayer });
    act.motion = added.motion;
    act.stateFlag = added.stateFlag >>> 0;
    act.state = added.state >>> 0;

    let kind: MoverKind;
    let name: string;
    if (added.isPlayer) {
      kind = 'player';
      name = added.player?.name ?? '';
    } else if (added.npc !== undefined && added.npc.characterKey !== '') {
      // `CProject::GetCharacter` (`Project.h:1376`): the key is looked up lower-cased
      kind = 'npc';
      name = this.data.npcs.get(added.npc.characterKey.toLowerCase())?.name ?? '';
    } else {
      kind = 'monster';
      name = prop?.name ?? '';
    }
    return {
      objectId, act, dest: null, corr: null, speedFactor, isSelf: added.player?.self === true, kind, added, name,
    };
  }

  /**
   * `CDPClient::OnSetPos` (:2215) for a mover in the world: `SetPos`, then `ClearDest` (not the destination angle),
   * `OBJMSG_ACC_STOP` (a flier's: the ground rules have no such message), `OBJMSG_STOP_TURN` and `OBJMSG_STAND`. For
   * the player's own character it also re-reads the world around the new position and moves the camera, which the
   * scene does.
   */
  private setPos(m: Mover, pos: Vec3): void {
    m.act.body.pos = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    m.act.clearDest(); // bound to the rules' ClearDest once the mover has had a destination; until then there is none
    m.act.sendActMsg(ActMsg.STOP_TURN);
    m.act.sendActMsg(ActMsg.STAND);
  }

  /** `CDPClient::OnSetPosAngle` (:2275): `SetPos( vPos )` and `SetAngle( fAngle )`, nothing cleared. */
  private setPosAngle(m: Mover, pos: Vec3, angle: number): void {
    m.act.body.pos = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    m.act.body.angle = wrapAngle(angle);
  }
}
