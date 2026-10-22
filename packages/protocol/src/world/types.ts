import type { Vec3 } from '../constants';
import type { MoveReport } from '../messages/world';

/**
 * One message of a JOIN or SNAPSHOT bundle, as the matching `CDPClient::On*` handler (`Neuz/DPClient.cpp`) reads
 * it. Positions and deltas are D3D coordinates and angles FlyFF degrees, as the C++ holds them. The message's
 * object ID is not here: `readBundle` reports it beside the value.
 *
 * The `addMover` and `addOther` members (ADD_OBJ) join this union with that message's reader.
 */
export type WorldMessage =
  | { type: 'delObj' }
  | { type: 'worldReadInfo'; worldId: number; pos: Vec3 }
  | { type: 'moverMoved'; move: MoveReport }
  | { type: 'moverBehavior'; move: MoveReport }
  | {
    type: 'moverAngle'; pos: Vec3; delta: Vec3; angle: number; angleX: number; accPower: number; turnAngle: number;
    tick: bigint;
  }
  | { type: 'destPos'; pos: Vec3; forward: boolean }
  | { type: 'destAngle'; angle: number; left: boolean }
  | { type: 'setDestObj'; targetId: number; range: number }
  /** An `OBJMSG`: `CDPClient::OnMotion` passes it to `SendActMsg`. */
  | { type: 'motion'; message: number }
  | { type: 'setPos'; pos: Vec3 }
  | { type: 'setPosAngle'; pos: Vec3; angle: number }
  | { type: 'replace'; worldId: number; pos: Vec3 };

/** The member of `WorldMessage` with this `type`, which is what that message's reader returns. */
export type MessageOf<T extends WorldMessage['type']> = Extract<WorldMessage, { type: T }>;
