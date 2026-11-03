import type { MessageReader } from '../bundle';
import { MessageType } from '../constants';
import { readAddObj } from './addObj';
import { readChat, readShout, readReturnSay, readSocial, readGmChat, readAnnouncement } from './chat';
import { readNpcScript } from './npc';
import { readCreateSfxAllow, readMagicAttack, readRangeAttack } from './combat';
import { readSetJobSkill, readSetNearJobSkill } from './jobs';
import { readShop } from './shop';
import { readCreateItem, readUpdateItem, readMoveItem, readEquipItem } from './items';
import {
  readRemoveAllSkillInfluence, readRemoveSkillInfluence, readResetDestParam, readResetDestParamSync, readSetDestParam,
  readSetSkillState,
} from './buffs';
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
import {
  readQuestChecked, readQuestHelperNpcPos, readQuestTextTime, readRemoveQuest, readSetQuest,
} from './quest';
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
    // the quests (MsgHdr.h:953, :1086, :1101, :1284, :1317)
    [0x00b0, readSetQuest],
    [0x003a, readRemoveQuest],
    [0x00ba, readQuestTextTime],
    [0x9400, readQuestHelperNpcPos],
    [0x8820, readQuestChecked],
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
    // Piece 7 M2: the ranged attacks and the job change
    [MessageType.MAGIC_ATTACK, readMagicAttack],
    [MessageType.RANGE_ATTACK, readRangeAttack],
    [MessageType.CREATESFXALLOW, readCreateSfxAllow],
    // Piece 7 M2: the buffs
    [MessageType.SETSKILLSTATE, readSetSkillState],
    [MessageType.REMOVESKILLINFULENCE, readRemoveSkillInfluence],
    [MessageType.REMOVEALLSKILLINFULENCE, readRemoveAllSkillInfluence],
    [MessageType.SETDESTPARAM, readSetDestParam],
    [MessageType.RESETDESTPARAM, readResetDestParam],
    [MessageType.RESETDESTPARAM_SYNC, readResetDestParamSync],
    [MessageType.SET_JOB_SKILL, readSetJobSkill],
    [MessageType.SET_NEAR_JOB_SKILL, readSetNearJobSkill],
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
