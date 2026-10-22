import type { ArReader } from '../ar/ArReader';
import type { MessageHeader } from '../bundle';
import { NULL_ID, ObjectType } from '../constants';
import type { AddedMover, AddedNpc, AddedPlayer, MessageOf, WornPart } from './types';

/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`): the length of `m_aEquipInfo`. */
const MAX_HUMAN_PARTS = 31;
/** `SM_MAX` (`_Network/CmnHdr.h:503`): the 26 entries of the `SM_*` enum, the length of `m_dwSMTime`. */
const SM_MAX = 26;
/** `MAX_JOB` (`Resource/defineJob.h:90`, `__VER >= 10`): the length of the unused `dwJobLv` array. */
const MAX_JOB = 32;
/**
 * `sizeof(QUEST)` (`tagQuest`, `_Common/Mover.h:261`), with VS2022 x86's default packing (no `#pragma pack` is in
 * force there): `BYTE m_nState` at 0, a pad byte, `WORD m_wTime` at 2, `WORD m_wId` at 4, `WORD m_nKillNPCNum[2]`
 * at 6 and 8, the eight one-bit `BYTE` fields `m_bPatrol` to `m_bReserve8` sharing the byte at 10, and a pad byte
 * to round the size to the struct's 2-byte alignment: 12 bytes.
 */
const QUEST_SIZE = 12;
/** The `nBufSize` that each `ReadString` of the reading side passes. */
const NAME_BUFFER = 32; // m_szName, ObjSerializeOpt.cpp:424
const CHARACTER_KEY_BUFFER = 32; // m_szCharacterKey, :692
const MAX_VENDORNAME = 48; // _Common/ProjectCmn.h:14
const MAX_PET_NAME = 17; // _Common/pet.h:105

/**
 * ADD_OBJ: `CDPClient::OnAddObj` (`Neuz/DPClient.cpp:1053`): `ar >> (BYTE &)dwObjType >> dwObjIndex`, then
 * `pObj->Serialize( ar )` on the object `CreateObj` made for that type. The world server writes the same pair
 * in front of `Serialize` (`CUser::AddAddObj`, `WORLDSERVER/User.cpp:676`), so `CObj::Serialize` reads them again.
 *
 * Only movers are read: any other type is `addOther`, its fields skipped. A mover's fields depend on
 * `CObj::GetMethod()`, which `OnAddObj` sets before reading (:1058): METHOD_NONE for the player's own character
 * (the object ID is `g_pPlayer`'s, or there is no `g_pPlayer` yet: the world server sends the own ADD_OBJ first,
 * `CUser::Open`, `User.cpp:326`), METHOD_EXCLUDE_ITEM for anything else. The world server picks the method the
 * same way (`User.cpp:677`). Here the own character is the one whose object ID is the bundle's player object ID.
 */
export function readAddObj(r: ArReader, header: MessageHeader): MessageOf<'addMover' | 'addOther'> {
  const objectType = r.u8();
  r.u32(); // dwObjIndex, which CObj::Serialize reads again
  if (objectType !== ObjectType.MOVER) {
    r.skipRest();
    return { type: 'addOther', objectType };
  }
  return { type: 'addMover', mover: readMover(r, header.objectId === header.playerObjectId) };
}

/**
 * `CMover::Serialize`, the loading side (`_Common/ObjSerializeOpt.cpp:97`, :359-767), which first calls
 * `CCtrl::Serialize` and through it `CObj::Serialize`. The own character is read through its equipment IDs and the
 * rest skipped (the skills, the inventory, the banks and so on, then its buffs); every other mover to its end.
 */
function readMover(r: ArReader, self: boolean): AddedMover {
  // CObj::Serialize (ObjSerializeOpt.cpp:39-51): (u_char&)m_dwType, m_dwIndex, the scale as a u_short
  // (`(float)u2 / 100.0f`), m_vPos, the angle as a short (`(float)i2 / 10.0f`). Both are float divisions:
  // Math.fround of the double quotient gives the same float, a double having more than twice a float's precision.
  r.u8(); // m_dwType again
  const index = r.u32();
  const scale = Math.fround(r.u16() / 100);
  const pos = r.vec3();
  const angle = Math.fround(r.i16() / 10);
  // CCtrl::Serialize (ObjSerialize.cpp:25)
  const objectId = r.u32();

  // CMover::Serialize, shared part (ObjSerializeOpt.cpp:364-404)
  const motion = r.u16(); // nMotion
  const isPlayer = r.u8() !== 0; // (u_char&)m_bPlayer
  const hitPoint = r.i32(); // m_nHitPoint (LONG)
  const state = r.u32(); // dw1, for __ForceSetState
  const stateFlag = r.u32(); // dw2, for AddStateFlag
  const belligerence = r.u8(); // (u_char&)m_dwBelligerence
  const sfxId = r.u32(); // m_dwMoverSfxId (__VER >= 15, __PETVIS)
  const mover: AddedMover = {
    index, scale, pos, angle, objectId, motion, isPlayer, hitPoint, state, stateFlag, belligerence, sfxId,
  };

  if (isPlayer) {
    mover.player = readPlayer(r, self);
    if (self) {
      r.skipRest();
      return mover;
    }
  } else {
    mover.npc = readNpc(r);
  }
  skipBuffs(r);
  return mover;
}

/** The player branch (ObjSerializeOpt.cpp:405-688); for the own character only up to its equipment IDs. */
function readPlayer(r: ArReader, self: boolean): AddedPlayer {
  const name = r.string(NAME_BUFFER); // ReadString( m_szName, 32 )
  const sex = r.u8(); // BYTE bySex
  const skinSet = r.u8();
  const hairMesh = r.u8();
  const hairColor = r.u32();
  const headMesh = r.u8();
  const playerId = r.u32(); // m_idPlayer
  const job = r.u8(); // (u_char&)m_nJob
  r.u16(); // m_nStr
  r.u16(); // m_nSta
  r.u16(); // m_nDex
  r.u16(); // m_nInt
  const level = r.u16(); // (u_short&)m_nLevel
  r.i32(); // m_nFuel
  r.i32(); // m_tmAccFuel
  if (r.u8() === 1) { // `if( u1 == 1 )`, exactly 1
    r.u32(); // m_idGuild
    r.u32(); // m_idWar
  }
  r.u32(); // m_idGuildCloak
  if (r.u8() === 1) {
    r.u32(); // m_idparty
    r.u32(); // m_idDuelParty
  }
  const authorization = r.u8(); // (char&)m_dwAuthorization: the low byte of a DWORD zeroed before
  const mode = r.u32();
  const stateMode = r.u32();
  r.u32(); // m_dwUseItemId (the world server writes the ride item's ID, :157-161)
  // __VER >= 8 (__S8_PK)
  const pkTime = r.u32();
  const pkValue = r.i32();
  const pkPropensity = r.u32();
  r.u32(); // m_dwPKExp
  r.i32(); // m_nFame
  r.u8(); // (u_char&)m_nDuel
  const honor = r.i32(); // int nTemp (__VER >= 13, __HONORABLE_TITLE)
  r.bytes(4 * MAX_HUMAN_PARTS); // m_aEquipInfo[i].nOption (int)
  r.i32(); // m_nGuildCombatState
  r.bytes(4 * SM_MAX); // m_dwSMTime[j] (DWORD)

  const base = {
    self, name, sex, skinSet, hairMesh, hairColor, headMesh, playerId, job, level, authorization, mode, stateMode,
    pkTime, pkValue, pkPropensity, honor,
  };
  if (self) return { ...base, worn: readOwnEquipment(r), shopTitle: '' };

  // METHOD_EXCLUDE_ITEM (:641-676)
  const shopTitle = r.string(MAX_VENDORNAME); // ReadString( szPVendor, MAX_VENDORNAME )
  const worn: WornPart[] = [];
  const count = r.u8(); // uSize
  for (let i = 0; i < count; i++) {
    const part = r.u8(); // uParts
    const itemId = r.u16(); // u2
    const flag = r.u8(); // m_aEquipInfo[uParts].byFlag
    worn.push({ part, itemId, flag });
  }
  r.u32(); // dwPetId (__VER >= 9, __PET_0410)
  r.string(MAX_PET_NAME); // szPetName (__PET_1024)
  return { ...base, worn, shopTitle };
}

/**
 * METHOD_NONE (ObjSerializeOpt.cpp:509-559), the own character, through `m_aEquipInfo[i].dwId`: each part's ID
 * that is not `NULL_ID` is a worn part (see `WornPart` for what that ID is).
 */
function readOwnEquipment(r: ArReader): WornPart[] {
  r.u16(); // (u_short&)m_nManaPoint
  r.u16(); // (u_short&)m_nFatiguePoint
  r.i32(); // m_nTutorialState (__VER >= 12, __MOD_TUTORIAL)
  r.i32(); // m_nFxp
  r.u32(); // dwGold
  r.i64(); // m_nExp1 (EXPINTEGER, __int64)
  r.i32(); // m_nSkillLevel
  r.i32(); // m_nSkillPoint
  r.i64(); // m_nDeathExp
  r.i32(); // m_nDeathLevel
  r.bytes(4 * MAX_JOB); // dwJobLv[MAX_JOB], unused
  r.u32(); // m_idMarkingWorld
  r.vec3(); // m_vMarkingPos
  r.bytes(QUEST_SIZE * r.u8()); // m_nQuestSize (BYTE), then m_aQuest
  r.bytes(2 * r.u8()); // m_nCompleteQuestSize (BYTE), then m_aCompleteQuest (WORD)
  r.bytes(2 * r.u8()); // m_nCheckedQuestSize (BYTE), then m_aCheckedQuest (WORD) (__VER >= 15)
  r.u32(); // m_idMurderer
  r.i16(); // n1, m_nRemainGP
  r.i16(); // n2, unused
  const worn: WornPart[] = [];
  for (let part = 0; part < MAX_HUMAN_PARTS; part++) {
    const itemId = r.u32(); // m_aEquipInfo[i].dwId
    if (itemId !== NULL_ID) worn.push({ part, itemId, flag: 0 });
  }
  return worn;
}

/** The NPC branch (ObjSerializeOpt.cpp:689-755), which monsters take too. */
function readNpc(r: ArReader): AddedNpc {
  const hairMesh = r.u8(); // (u_char&)m_dwHairMesh
  const hairColor = r.u32();
  const headMesh = r.u8(); // (u_char&)m_dwHeadMesh
  const characterKey = r.string(CHARACTER_KEY_BUFFER); // ReadString( m_szCharacterKey, 32 )
  // The C++ reads the entries only `if( IsEquipableNPC() )`, from its own character.inc; the world server writes
  // them under the same test (:327), so `uSize` is 0 for every other NPC and the entries are on the wire exactly
  // when it is not.
  const worn: WornPart[] = [];
  const count = r.u8(); // uSize
  for (let i = 0; i < count; i++) {
    const part = r.u8(); // uParts
    const itemId = r.u16(); // u2
    worn.push({ part, itemId, flag: 0 });
  }
  const activeAttack = r.u8(); // (u_char&)m_bActiveAttack
  const movePattern = r.u8(); // (u_char&)m_nMovePattern
  const moveEvent = r.u8(); // (u_char&)m_nMoveEvent
  const moveEventCount = r.i32(); // m_nMoveEventCnt (int)
  const speedFactor = r.f32(); // m_fSpeedFactor (__VER >= 9, __AI_0509)
  return {
    hairMesh, hairColor, headMesh, characterKey, worn, activeAttack, movePattern, moveEvent, moveEventCount,
    speedFactor,
  };
}

/**
 * `m_buffs.Serialize( ar )` (__BUFF_1107, ObjSerializeOpt.cpp:758): `CBuffMgr::Serialize` (`_Common/buff.cpp:901`)
 * reads the count (`size_t`, 4 bytes on x86), then per buff `WORD wType` and `IBuff::Serialize` (:124): `m_wId`
 * (`WORD`), the level (`DWORD m_dwLevel`; a `BUFF_ITEM2`'s `time_t`, `CBuffItem2::SerializeLevel`, :604, is 4
 * bytes too, because both Neuz and the world server define `_USE_32BIT_TIME_T`) and the time left (`DWORD`).
 * The browser keeps none of them.
 */
function skipBuffs(r: ArReader): void {
  const count = r.u32();
  for (let i = 0; i < count; i++) {
    r.u16(); // wType
    r.u16(); // m_wId
    r.u32(); // m_dwLevel
    r.u32(); // tmTotal
  }
}
