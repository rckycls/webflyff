import type { MessageReader } from '../bundle';
import { MessageType } from '../constants';
import { readAddObj } from './addObj';
import { readChat, readShout, readReturnSay, readSocial, readGmChat, readAnnouncement } from './chat';
import { readNpcScript } from './npc';
import { readShop } from './shop';
import { readCreateItem, readUpdateItem, readMoveItem, readEquipItem } from './items';
import {
  readCorrReq, readDamage, readDefinedText, readDefinedText1, readMeleeAttack, readMonsterProp, readMoverDeath,
  readQueryGetDestObj, readRevival, readRevivalLodestar, readSetExperience, readSetGrowthLearningPoint, readSetLevel,
  readSetPointParam, readSetState,
} from './combat';
import { readEnvironmentSetting } from './environment';
import {
  readDestAngle, readDestPos, readMotion, readMoverAngle, readMoverBehavior, readMoverCorr, readMoverMoved,
  readSetDestObj,
} from './movement';
import { readDelObj, readReplace, readSetPos, readSetPosAngle, readWorldReadInfo } from './place';
import {
  readClearUseSkill, readCreateSfxObj, readDoUseSkillPoint, readEndSkillQueue, readInitSkillPoint, readSetActionPoint,
  readUseSkill,
} from './skills';
import { readPlayMusic, readPlaySound } from './sound';
import { readTaskBar } from './taskBar';
import type { WorldMessage } from './types';

/**
 * The readers of the bundle messages the browser understands, by message type, for `readBundle`. Each copies
 * one `CDPClient::On*` handler that `CDPClient::OnSnapshot` (`Neuz/DPClient.cpp:366`) dispatches to.
 */
export const WORLD_READERS: ReadonlyMap<number, MessageReader<WorldMessage>> =
  new Map<number, MessageReader<WorldMessage>>([
    [MessageType.ADD_OBJ, readAddObj],
    [0x0069, r => readSocial(r, 'party')],
    [0x004f, readGmChat],
    [0x00a0, readAnnouncement],
    [0x0001, readChat],
    [0x00d0, readShout],
    [0x00a9, readReturnSay],
    [0x0024, readNpcScript],
    [0x0014, readShop],
    [0x0003, readCreateItem],
    [0x0004, readMoveItem],
    [0x0006, readEquipItem],
    [0x0018, readUpdateItem],
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
    [MessageType.MELEE_ATTACK, readMeleeAttack],
    [MessageType.DAMAGE, readDamage],
    [MessageType.MOVERDEATH, readMoverDeath],
    [MessageType.SETPOINTPARAM, readSetPointParam],
    [MessageType.SETEXPERIENCE, readSetExperience],
    [MessageType.SETLEVEL, readSetLevel],
    [MessageType.SET_GROWTH_LEARNING_POINT, readSetGrowthLearningPoint],
    [MessageType.SETSTATE, readSetState],
    [MessageType.CORRREQ, readCorrReq],
    [MessageType.REVIVAL, readRevival],
    [MessageType.REVIVAL_TO_LODESTAR, readRevivalLodestar],
    [MessageType.DEFINEDTEXT, readDefinedText],
    [MessageType.DEFINEDTEXT1, readDefinedText1],
    [MessageType.QUERYGETDESTOBJ, readQueryGetDestObj],
    [MessageType.MONSTERPROP, readMonsterProp],
    [MessageType.TASKBAR, readTaskBar],
    [MessageType.USESKILL, readUseSkill],
    [MessageType.CLEAR_USESKILL, readClearUseSkill],
    [MessageType.DOUSESKILLPOINT, readDoUseSkillPoint],
    [MessageType.INITSKILLPOINT, readInitSkillPoint],
    [MessageType.SETACTIONPOINT, readSetActionPoint],
    [MessageType.ENDSKILLQUEUE, readEndSkillQueue],
    [MessageType.CREATESFXOBJ, readCreateSfxObj],
    [MessageType.PLAYMUSIC, readPlayMusic],
    [MessageType.PLAYSOUND, readPlaySound],
  ]);
