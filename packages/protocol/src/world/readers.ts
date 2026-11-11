import { BANK_READERS } from './bank';
import { LORD_READERS } from './lord';
import { POST_READERS } from './post';
import type { MessageReader } from '../bundle';
import { MessageType } from '../constants';
import { readAddObj } from './addObj';
import { readChat, readShout, readReturnSay, readSocial, readGmChat } from './chat';
import { readNpcScript } from './npc';
import { readCreateSfxAllow, readMagicAttack, readRangeAttack } from './combat';
import { readSetJobSkill, readSetNearJobSkill } from './jobs';
import { readShop } from './shop';
import { readCreateItem, readUpdateItem, readUpdateItemEx, readMoveItem, readEquipItem } from './items';
import {
  readRemoveAllSkillInfluence, readRemoveSkillInfluence, readResetDestParam, readResetDestParamSync, readSetDestParam,
  readResistSmMode, readSetSkillState, readSmMode, readSmModeAll,
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
  readClearUseSkill, readCreateSfxObj, readDoApplySkill, readDoUseSkillPoint, readEndSkillQueue, readInitSkillPoint, readSetActionPoint,
  readUseSkill,
} from './skills';
import {
  readQuestChecked, readQuestHelperNpcPos, readQuestTextTime, readRemoveQuest, readSetQuest,
} from './quest';
import { readPlayMusic, readPlaySound } from './sound';
import { readTaskBar } from './taskBar';
import {
  readErrorParty, readMyPartyName, readPartyChangeLeader, readPartyChangeName, readPartyChangeTroup, readPartyExp,
  readPartyExpMode, readPartyItemMode, readPartyMapInfo, readPartyMember, readPartyRequest, readPartyRequestCancel,
  readPartySkillBlitz, readPartySkillCall, readPartySkillRetreat, readPartySkillSphereCircle, readSetPartyMemberParam,
  readSetPartyMode,
} from './party';
import { readQueryPlayerData } from './playerData';
import {
  FriendMessageType, readFriendAdded, readFriendError, readFriendGameJoin, readFriendRemoved, readFriendRequest,
  readFriendRequestCancel,
} from './friends';
import { readReturnScrollAck, readStateMode } from './travel';
import {
  VendorMessageType, readChatting, readPVendorClose, readPVendorItemNum, readPVendorItems, readPVendorOpen,
  readRegisterPVendorItem, readUnregisterPVendorItem,
} from './vendor';
import { readCmdSetSkillLevel, readDisguise, readModifyMode, readNoDisguise, readServerText } from './gm';
import {
  readMeleeAttack2, readMoverBehavior2, readMoverCorr2, readMoverMoved2, readSendActMsg, readSetFuel,
} from './flight';
import { TRADE_READERS } from './trade';
import { GUILD_READERS } from './guild';
import type { WorldMessage } from './types';
import { readSmeltSafety, readUltimate } from './upgrade';
import { readAngel, readFlyffEvent, readSetLocalEvent } from './angel'; // 2026-11-10: Summon Angel
import { readChangeFace, readSexChange, readSummon } from './itemWindows';
import {
  readMoverChangeSfx, readPetCall, readPetFeed, readPetLevelup, readPetMill, readPetRelease, readPetResurrectionResult,
  readPetSetExp, readPetState, readPetWhole, readSetPetName, readVisPetActivate,
} from './pets';

/**
 * The readers of the bundle messages the browser understands, by message type, for `readBundle`. Each copies
 * one `CDPClient::On*` handler that `CDPClient::OnSnapshot` (`Neuz/DPClient.cpp:366`) dispatches to.
 */
export const WORLD_READERS: ReadonlyMap<number, MessageReader<WorldMessage>> =
  new Map<number, MessageReader<WorldMessage>>([
    [MessageType.ADD_OBJ, readAddObj],
    // Server calculated display values: gear, awakenings, sets, sockets and buffs.
    [0x8871, r => ({ type: 'profileStats', values: Array.from({ length: 14 }, () => r.i32()) })],
    [0x0069, r => readSocial(r, 'party')],
    [0x004f, readGmChat],
    // 2026-11-10: SNAPSHOTTYPE_TEXT with its state byte (it was read as an announcement without it, and lost)
    [MessageType.TEXT, readServerText],
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
    [0x0140, readUpdateItemEx], // SNAPSHOTTYPE_UPDATE_ITEM_EX: the awakening (2026-11-05)
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
    // Piece 7 M3: the item cast and the Scroll of Return's answer
    [MessageType.STATEMODE, readStateMode],
    // 2026-11-10: the game masters' modes
    [MessageType.MODIFYMODE, readModifyMode],
    [MessageType.CMDSETSKILLLEVEL, readCmdSetSkillLevel],
    [MessageType.DISGUISE, readDisguise],
    [MessageType.NODISGUISE, readNoDisguise],
    // Piece 7 M5: flight
    [MessageType.MOVERMOVED2, readMoverMoved2],
    [MessageType.MOVERBEHAVIOR2, readMoverBehavior2],
    [MessageType.MOVERCORR2, readMoverCorr2],
    [MessageType.SETFUEL, readSetFuel],
    [MessageType.MELEE_ATTACK2, readMeleeAttack2],
    [MessageType.SENDACTMSG, readSendActMsg],
    [MessageType.RETURNSCORLL, readReturnScrollAck],
    // Piece 7 M2: the buffs
    [MessageType.SETSKILLSTATE, readSetSkillState],
    [MessageType.REMOVESKILLINFULENCE, readRemoveSkillInfluence],
    [MessageType.REMOVEALLSKILLINFULENCE, readRemoveAllSkillInfluence],
    [MessageType.SETDESTPARAM, readSetDestParam],
    [MessageType.RESETDESTPARAM, readResetDestParam],
    [MessageType.RESETDESTPARAM_SYNC, readResetDestParamSync],
    // Piece 7 M4: the party ([R §1.1]) and the player data's answer ([R §4])
    [MessageType.PARTYMEMBER, readPartyMember],
    [MessageType.PARTYREQEST, readPartyRequest],
    [MessageType.PARTYREQESTCANCEL, readPartyRequestCancel],
    [MessageType.PARTYEXP, readPartyExp],
    [MessageType.ADDPARTYCHANGELEADER, readPartyChangeLeader],
    [MessageType.PARTYCHANGETROUP, readPartyChangeTroup],
    [MessageType.PARTYCHANGENAME, readPartyChangeName],
    [MessageType.ADDPARTYNAME, readMyPartyName],
    [MessageType.PARTYCHANGEITEMMODE, readPartyItemMode],
    [MessageType.PARTYCHANGEEXPMODE, readPartyExpMode],
    [MessageType.SETPARTYMODE, readSetPartyMode],
    [MessageType.SET_PARTY_MEMBER_PARAM, readSetPartyMemberParam],
    [MessageType.PARTYMAPINFO, readPartyMapInfo],
    [MessageType.PARTYSKILL_CALL, readPartySkillCall],
    [MessageType.PARTYSKILL_BLITZ, readPartySkillBlitz],
    [MessageType.PARTYSKILL_RETREAT, readPartySkillRetreat],
    [MessageType.PARTYSKILL_SPHERECIRCLE, readPartySkillSphereCircle],
    [MessageType.ERRORPARTY, readErrorParty],
    [MessageType.QUERY_PLAYER_DATA, readQueryPlayerData],
    // 2026-11-10: the messenger (world/friends.ts)
    [FriendMessageType.ADDFRIENDGAMEJOIN, readFriendGameJoin],
    [FriendMessageType.ADDFRIEND, readFriendAdded],
    [FriendMessageType.ADDFRIENDREQEST, readFriendRequest],
    [FriendMessageType.ADDFRIENDCANCEL, readFriendRequestCancel],
    [FriendMessageType.REMOVEFRIEND, readFriendRemoved],
    [FriendMessageType.ADDFRIENDERROR, readFriendError],
    // 2026-11-10: the personal shop and its chat room (world/vendor.ts)
    [VendorMessageType.PVENDOR_OPEN, readPVendorOpen],
    [VendorMessageType.PVENDOR_CLOSE, readPVendorClose],
    [VendorMessageType.REGISTER_PVENDOR_ITEM, readRegisterPVendorItem],
    [VendorMessageType.UNREGISTER_PVENDOR_ITEM, readUnregisterPVendorItem],
    [VendorMessageType.PVENDOR_ITEM, readPVendorItems],
    [VendorMessageType.PVENDOR_ITEM_NUM, readPVendorItemNum],
    [VendorMessageType.CHATTING, readChatting],
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
    [MessageType.DOAPPLYUSESKILL, readDoApplySkill],
    [MessageType.SM_MODE, readSmMode],
    [MessageType.SM_MODE_ALL, readSmModeAll],
    [MessageType.RESISTSMMODE, readResistSmMode],
    [MessageType.ULTIMATE, readUltimate],
    // 2026-11-10: the angel's EXP and the local events (Summon Angel)
    [MessageType.ANGEL, readAngel],
    [MessageType.FLYFF_EVENT, readFlyffEvent],
    [MessageType.SET_LOCAL_EVENT, readSetLocalEvent],
    [MessageType.SMELT_SAFETY, readSmeltSafety],
    [MessageType.SUMMON, readSummon],
    [MessageType.SEX_CHANGE, readSexChange],
    [MessageType.CHANGEFACE, readChangeFace],
    [MessageType.CLEAR_USESKILL, readClearUseSkill],
    [MessageType.DOUSESKILLPOINT, readDoUseSkillPoint],
    [MessageType.INITSKILLPOINT, readInitSkillPoint],
    [MessageType.SETACTIONPOINT, readSetActionPoint],
    [MessageType.ENDSKILLQUEUE, readEndSkillQueue],
    [MessageType.CREATESFXOBJ, readCreateSfxObj],
    [MessageType.PLAYMUSIC, readPlayMusic],
    [MessageType.PLAYSOUND, readPlaySound],
    // 2026-11-09 (pets M0): the pets, kept and not yet used (world/pets.ts)
    [MessageType.PET_CALL, readPetCall],
    [MessageType.PET_RELEASE, readPetRelease],
    [MessageType.PET_LEVELUP, readPetLevelup],
    [MessageType.PET_SET_EXP, readPetSetExp],
    [MessageType.PET, readPetWhole],
    [MessageType.PET_STATE, readPetState],
    [MessageType.PET_FEED, readPetFeed],
    [MessageType.PET_MILL, readPetMill],
    [MessageType.QUE_PETRESURRECTION_RESULT, readPetResurrectionResult],
    [MessageType.SET_PET_NAME, readSetPetName],
    [MessageType.MOVER_CHANGESFX, readMoverChangeSfx],
    [MessageType.VISPET_ACTIVATE, readVisPetActivate],
    // 2026-11-10: the player trade (world/trade.ts)
    ...TRADE_READERS,
    // 2026-11-10: the guild (world/guild.ts)
    ...GUILD_READERS,
    // 2026-11-10: the bank and the post (world/bank.ts, world/post.ts)
    ...BANK_READERS,
    ...POST_READERS,
    // 2026-11-11: the Lord system (world/lord.ts)
    ...LORD_READERS,
  ]);
