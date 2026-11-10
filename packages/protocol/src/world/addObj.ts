import type { ArReader } from '../ar/ArReader';
import { readBuffs } from './buffs';
import type { MessageHeader } from '../bundle';
import { ObjectType } from '../constants';
import { readOwnAfterEquipment } from './own';
import { MAX_PET_NAME } from './pets';
import { readGroundItem } from './items';
import { readQuest, readQuestIds } from './quest';
import type { OwnNumbers } from './own';
import type { AddedMover, AddedNpc, AddedPlayer, MessageOf, WornPart } from './types';

/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`): the length of `m_aEquipInfo`. */
const MAX_HUMAN_PARTS = 31;
/** `SM_MAX` (`_Network/CmnHdr.h:503`): the 26 entries of the `SM_*` enum, the length of `m_dwSMTime`. */
const SM_MAX = 26;
/** `MAX_JOB` (`Resource/defineJob.h:90`, `__VER >= 10`): the length of the unused `dwJobLv` array. */
const MAX_JOB = 32;
/** The `nBufSize` that each `ReadString` of the reading side passes. */
const NAME_BUFFER = 32; // m_szName, ObjSerializeOpt.cpp:424
const CHARACTER_KEY_BUFFER = 32; // m_szCharacterKey, :692
const MAX_VENDORNAME = 48; // _Common/ProjectCmn.h:14
/** `NULL_ID`: another player with no raised pet out. */
const NULL_ID = 0xffffffff;

/**
 * ADD_OBJ: `CDPClient::OnAddObj` (`Neuz/DPClient.cpp:1053`): `ar >> (BYTE &)dwObjType >> dwObjIndex`, then
 * `pObj->Serialize( ar )` on the object `CreateObj` made for that type. The world server writes the same pair
 * in front of `Serialize` (`CUser::AddAddObj`, `WORLDSERVER/User.cpp:676`), so `CObj::Serialize` reads them again.
 *
 * Movers and ground items are read; other types are `addOther`, their fields skipped. A mover's fields depend on
 * `CObj::GetMethod()`, which `OnAddObj` sets before reading (:1058): METHOD_NONE for the player's own character
 * (the object ID is `g_pPlayer`'s, or there is no `g_pPlayer` yet: the world server sends the own ADD_OBJ first,
 * `CUser::Open`, `User.cpp:326`), METHOD_EXCLUDE_ITEM for anything else. The world server picks the method the
 * same way (`User.cpp:677`). Here the own character is the one whose object ID is the bundle's player object ID.
 */
export function readAddObj(r: ArReader, header: MessageHeader): MessageOf<'addMover' | 'addItem' | 'addOther'> {
  const objectType = r.u8();
  r.u32(); // dwObjIndex, which CObj::Serialize reads again
  if (objectType === ObjectType.ITEM) return { type: 'addItem', item: readGroundItem(r) };
  if (objectType !== ObjectType.MOVER) {
    r.skipRest();
    return { type: 'addOther', objectType };
  }
  return { type: 'addMover', mover: readMover(r, header.objectId === header.playerObjectId) };
}

/**
 * `CMover::Serialize`, the loading side (`_Common/ObjSerializeOpt.cpp:97`, :359-767), which first calls
 * `CCtrl::Serialize` and through it `CObj::Serialize`. The own character is read through its numbers, equipment IDs,
 * skills and inventory (`readOwnAfterEquipment`) and the rest skipped (the banks and so on, then its buffs); every
 * other mover to its end.
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
    // The own character's reader has left the message at its end, buffs included (see `readOwnAfterEquipment`).
    if (self) return mover;
  } else {
    mover.npc = readNpc(r);
  }
  // Piece 7 M2: another mover's buffs are kept (its icons, and what they do to its numbers); none, none listed
  const buffs = readBuffs(r);
  if (buffs.length > 0) mover.buffs = buffs;
  return mover;
}

/** The player branch (ObjSerializeOpt.cpp:405-688); for the own character only up to the end of its inventory. */
function readPlayer(r: ArReader, self: boolean): AddedPlayer {
  const name = r.string(NAME_BUFFER); // ReadString( m_szName, 32 )
  const sex = r.u8(); // BYTE bySex
  const skinSet = r.u8();
  const hairMesh = r.u8();
  const hairColor = r.u32();
  const headMesh = r.u8();
  const playerId = r.u32(); // m_idPlayer
  const job = r.u8(); // (u_char&)m_nJob
  // STA and DEX are kept for every player (another's max HP and attack speed come from them, Ruling R19); STR and INT
  // for the own character only (`own`).
  const str = r.u16(); // (u_short&)m_nStr
  const sta = r.u16(); // (u_short&)m_nSta
  const dex = r.u16(); // (u_short&)m_nDex
  const int = r.u16(); // (u_short&)m_nInt
  const level = r.u16(); // (u_short&)m_nLevel
  const fuel = r.i32(); // m_nFuel (Piece 7 M5: kept when not -1)
  const accFuel = r.i32(); // m_tmAccFuel (kept when not 0)
  // 2026-11-10 (guild): the guild, its war and the worn guild cloak's guild are kept (ObjSerializeOpt.cpp:136-140, :447-451)
  let guildId = 0, warId = 0;
  if (r.u8() === 1) { // `if( u1 == 1 )`, exactly 1
    guildId = r.u32(); // m_idGuild
    warId = r.u32(); // m_idWar
  }
  const guildCloak = r.u32(); // m_idGuildCloak
  if (r.u8() === 1) {
    r.u32(); // m_idparty
    r.u32(); // m_idDuelParty
  }
  const authorization = r.u8(); // (char&)m_dwAuthorization: the low byte of a DWORD zeroed before
  const mode = r.u32();
  const stateMode = r.u32();
  // m_dwUseItemId: the world server writes the prop id of the inventory item it names, or 0 (ObjSerializeOpt.cpp:155-163);
  // Piece 7 M3 keeps it, as OnAddObj makes a casting mover's ready effect from it (DPClient.cpp:1380-1391)
  const useItemId = r.u32();
  // __VER >= 8 (__S8_PK)
  const pkTime = r.u32();
  const pkValue = r.i32();
  const pkPropensity = r.u32();
  r.u32(); // m_dwPKExp
  r.i32(); // m_nFame
  r.u8(); // (u_char&)m_nDuel
  const honor = r.i32(); // int nTemp (__VER >= 13, __HONORABLE_TITLE)
  // m_aEquipInfo[i].nOption (int): 2026-11-09 kept, the worn weapons' upgrade and element for their glow
  const options = Array.from({ length: MAX_HUMAN_PARTS }, () => r.i32());
  r.i32(); // m_nGuildCombatState
  r.bytes(4 * SM_MAX); // m_dwSMTime[j] (DWORD)

  const base = {
    self, name, sex, skinSet, hairMesh, hairColor, headMesh, playerId, job, sta, dex, level, authorization, mode,
    stateMode, ...(useItemId !== 0 ? { useItemId } : {}), pkTime, pkValue, pkPropensity, honor,
    ...(fuel !== -1 ? { fuel } : {}), ...(accFuel !== 0 ? { accFuel } : {}),
    ...(guildId !== 0 ? { guildId } : {}), ...(warId !== 0 ? { warId } : {}), ...(guildCloak !== 0 ? { guildCloak } : {}),
  };
  if (self) {
    const { equipmentObjectIds, numbers } = readOwnEquipment(r, { str, sta, dex, int });
    return { ...base, worn: [], equipmentObjectIds, own: readOwnAfterEquipment(r, numbers), shopTitle: '' };
  }

  // METHOD_EXCLUDE_ITEM (:641-676)
  const shopTitle = r.string(MAX_VENDORNAME); // ReadString( szPVendor, MAX_VENDORNAME )
  const worn: WornPart[] = [];
  const count = r.u8(); // uSize
  for (let i = 0; i < count; i++) {
    const part = r.u8(); // uParts
    const itemId = r.u16(); // u2
    const flag = r.u8(); // m_aEquipInfo[uParts].byFlag
    const option = options[part] ?? 0;
    worn.push({ part, itemId, flag, ...(option !== 0 ? { option } : {}) });
  }
  // 2026-11-09 (pets M0): the summoned raised pet, MAKELONG( CPet::GetIndex(), level ) or NULL_ID (__VER >= 9,
  // __PET_0410, :664-667), and its name (__PET_1024, :668-672)
  const petId = r.u32();
  const petName = r.string(MAX_PET_NAME);
  const pet = petId === NULL_ID ? undefined : { modelIndex: petId & 0xffff, level: petId >>> 16, name: petName };
  return { ...base, worn, equipmentObjectIds: [], own: null, shopTitle, ...(pet !== undefined ? { pet } : {}) };
}

/**
 * METHOD_NONE (ObjSerializeOpt.cpp:509-559), the own character, through `m_aEquipInfo[i].dwId`: the 31 IDs as they
 * are, which are inventory object IDs, not item IDs (see `AddedPlayer.equipmentObjectIds`). The numbers on the way
 * are kept, with the base stats the player part gave (`stats`); `readOwnAfterEquipment` completes them with the
 * skills and the inventory.
 */
function readOwnEquipment(
  r: ArReader, stats: Pick<OwnNumbers, 'str' | 'sta' | 'dex' | 'int'>,
): { equipmentObjectIds: number[]; numbers: OwnNumbers } {
  const manaPoint = r.u16(); // (u_short&)m_nManaPoint
  const fatiguePoint = r.u16(); // (u_short&)m_nFatiguePoint
  r.i32(); // m_nTutorialState (__VER >= 12, __MOD_TUTORIAL)
  r.i32(); // m_nFxp
  const gold = r.u32(); // dwGold
  const exp = r.i64(); // m_nExp1 (EXPINTEGER, __int64)
  const skillLevel = r.i32(); // m_nSkillLevel
  const skillPoint = r.i32(); // m_nSkillPoint
  const deathExp = r.i64(); // m_nDeathExp (EXPINTEGER)
  const deathLevel = r.i32(); // m_nDeathLevel (LONG)
  r.bytes(4 * MAX_JOB); // dwJobLv[MAX_JOB], unused
  r.u32(); // m_idMarkingWorld
  r.vec3(); // m_vMarkingPos
  const quests = Array.from({ length: r.u8() }, () => readQuest(r)); // m_nQuestSize (BYTE), then m_aQuest
  const completedQuests = readQuestIds(r); // m_nCompleteQuestSize (BYTE), then m_aCompleteQuest (WORD)
  const checkedQuests = readQuestIds(r); // m_nCheckedQuestSize (BYTE), then m_aCheckedQuest (WORD) (__VER >= 15)
  r.u32(); // m_idMurderer
  const remainGP = r.i16(); // n1, m_nRemainGP
  r.i16(); // n2, unused
  const equipmentObjectIds: number[] = [];
  for (let i = 0; i < MAX_HUMAN_PARTS; i++) equipmentObjectIds.push(r.u32()); // m_aEquipInfo[i].dwId
  return {
    equipmentObjectIds,
    numbers: {
      ...stats, manaPoint, fatiguePoint, exp, skillLevel, skillPoint, deathExp, deathLevel, remainGP, ...(gold ? { gold } : {}),
      // like gold, only when there are some
      ...(quests.length > 0 ? { quests } : {}),
      ...(completedQuests.length > 0 ? { completedQuests } : {}),
      ...(checkedQuests.length > 0 ? { checkedQuests } : {}),
    },
  };
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

