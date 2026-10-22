import type { MessageReader } from '../bundle';
import { MessageType } from '../constants';
import {
  readDestAngle, readDestPos, readMotion, readMoverAngle, readMoverBehavior, readMoverMoved, readSetDestObj,
} from './movement';
import { readDelObj, readReplace, readSetPos, readSetPosAngle, readWorldReadInfo } from './place';
import type { WorldMessage } from './types';

/**
 * The readers of the bundle messages the browser understands, by message type, for `readBundle`. Each copies
 * one `CDPClient::On*` handler that `CDPClient::OnSnapshot` (`Neuz/DPClient.cpp:366`) dispatches to. ADD_OBJ is
 * added with its reader in a later task.
 */
export const WORLD_READERS: ReadonlyMap<number, MessageReader<WorldMessage>> =
  new Map<number, MessageReader<WorldMessage>>([
    [MessageType.MOVERMOVED, readMoverMoved],
    [MessageType.MOVERBEHAVIOR, readMoverBehavior],
    [MessageType.MOVERANGLE, readMoverAngle],
    [MessageType.DESTPOS, readDestPos],
    [MessageType.DESTANGLE, readDestAngle],
    [MessageType.MOVERSETDESTOBJ, readSetDestObj],
    [MessageType.MOTION, readMotion],
    [MessageType.SETPOS, readSetPos],
    [MessageType.SETPOSANGLE, readSetPosAngle],
    [MessageType.DEL_OBJ, readDelObj],
    [MessageType.WORLD_READINFO, readWorldReadInfo],
    [MessageType.REPLACE, readReplace],
  ]);
