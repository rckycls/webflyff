import type { MessageReader } from '../bundle';
import { MessageType } from '../constants';
import { readAddObj } from './addObj';
import { readEnvironmentSetting } from './environment';
import {
  readDestAngle, readDestPos, readMotion, readMoverAngle, readMoverBehavior, readMoverCorr, readMoverMoved,
  readSetDestObj,
} from './movement';
import { readDelObj, readReplace, readSetPos, readSetPosAngle, readWorldReadInfo } from './place';
import type { WorldMessage } from './types';

/**
 * The readers of the bundle messages the browser understands, by message type, for `readBundle`. Each copies
 * one `CDPClient::On*` handler that `CDPClient::OnSnapshot` (`Neuz/DPClient.cpp:366`) dispatches to.
 */
export const WORLD_READERS: ReadonlyMap<number, MessageReader<WorldMessage>> =
  new Map<number, MessageReader<WorldMessage>>([
    [MessageType.ADD_OBJ, readAddObj],
    [MessageType.MOVERMOVED, readMoverMoved],
    [MessageType.MOVERBEHAVIOR, readMoverBehavior],
    [MessageType.MOVERCORR, readMoverCorr],
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
    [MessageType.ENVIRONMENTALL, readEnvironmentSetting],
  ]);
