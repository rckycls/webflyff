import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import type { InventoryItem, OwnCharacter, SkillSlot } from './types';

/**
 * `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`, the `__VER >= 10` branch): `MAX_JOB_SKILL` 3 + `MAX_EXPERT_SKILL` 20 +
 * `MAX_PRO_SKILL` 20 + `MAX_MASTER_SKILL` 1 + `MAX_HERO_SKILL` 1 (`Resource/defineJob.h:12-17`): the length of
 * `m_aJobSkill`.
 */
export const MAX_SKILL_JOB = 45;
/**
 * `m_Inventory`'s `m_dwItemMax`, its number of slots: `SetItemContainer( ITYPE_ITEM, MAX_INVENTORY, MAX_HUMAN_PARTS )`
 * (`_Common/Mover.cpp:1460`) makes it `MAX_INVENTORY` 42 (`_Common/ProjectCmn.h:7`), the bag, plus `MAX_HUMAN_PARTS`
 * 31 (`Resource/defineNeuz.h:62`), one per part (`CItemContainer::SetItemContainer`, `_Common/Item.h:498-503`).
 */
const INVENTORY_SLOTS = 42 + 31;
/** The `nBufSize` of `ReadString( m_szItemText, 32 )` (`ObjSerialize.cpp:43`). */
const ITEM_TEXT_BUFFER = 32;
/** `PL_MAX` (`enum PETLEVEL`, `_Common/pet.h:16`): the 6 bytes of `CPet::m_anAvailLevel`. */
const PL_MAX = 6;
/** `MAX_PET_NAME` (`_Common/pet.h:105`, `__PET_1024`): the `nBufSize` of the pet name's `ReadString`. */
const MAX_PET_NAME = 17;

/** What `OwnCharacter` holds before the skill array: the numbers `readOwnEquipment` reads on its way to the IDs. */
export type OwnNumbers = Omit<OwnCharacter, 'skills' | 'inventory' | 'inventoryError'>;

/**
 * The rest of the own character's METHOD_NONE block (`CMover::Serialize`, `_Common/ObjSerializeOpt.cpp:509-640`),
 * from where `readOwnEquipment` stopped, after the `m_aEquipInfo[i].dwId` loop (:557-558): the skill array, then the
 * fields up to the inventory and the inventory (`readInventoryPart`). It completes `numbers` into the
 * `OwnCharacter`, and leaves the reader at the end of the message.
 */
export function readOwnAfterEquipment(r: ArReader, numbers: OwnNumbers): OwnCharacter {
  const skills = readSkills(r);
  const { inventory, inventoryError } = readInventoryPart(r);
  // The reader stops here, after the inventory, or wherever the inventory part failed. The C++ goes on with
  // `m_Bank[k].Serialize` for the three banks (:586-587), `dwPetId` (:594-596), `m_Pocket.Serialize` (:606),
  // `m_dwMute` (:610, __JEFF_9_20), the honour titles (:616-634), `m_idCampus` and `m_nCampusPoint` (:637-638), then
  // the buffs. None of them is read yet (they stay with Piece 5): they are skipped, and whatever reads them next
  // replaces this `skipRest`.
  r.skipRest();
  return { ...numbers, skills, inventory, inventoryError };
}

/**
 * `m_aJobSkill`: `ar.Read( (void*)m_aJobSkill, sizeof(SKILL) * ( MAX_SKILL_JOB ) )` (:561, and :565 when
 * `__SKILL_0205` is off: the same bytes), 45 `SKILL`s (`_Common/Item.h:308-314`) of `DWORD dwSkill` and `DWORD
 * dwLevel`, 8 bytes each, which `CAr::Read` copies as they are (360 bytes).
 */
function readSkills(r: ArReader): SkillSlot[] {
  const skills: SkillSlot[] = [];
  for (let i = 0; i < MAX_SKILL_JOB; i++) {
    const skill = r.u32(); // dwSkill: a SI_* ID, or NULL_ID in an empty slot
    const level = r.u32(); // dwLevel
    skills.push({ skill, level });
  }
  return skills;
}

/** The part of the inventory read that is being read, which names a failure in `inventoryError`. */
interface Where { part: string }

/**
 * Everything from the end of the skill array to the end of the inventory (:568-585). A ProtocolError inside it (the
 * bytes run out, or a count or a field is out of range) is caught here, so that the message still ends on its
 * boundary (the caller skips the rest) and keeps the numbers and skills read before it: `inventory` is then `null`
 * and `inventoryError` names the part and the error. Any other error is a bug and propagates.
 */
function readInventoryPart(r: ArReader): Pick<OwnCharacter, 'inventory' | 'inventoryError'> {
  const where: Where = { part: 'before the inventory' };
  try {
    skipBeforeInventory(r);
    return { inventory: readInventory(r, where), inventoryError: null };
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return { inventory: null, inventoryError: `${where.part}: ${error.message}` };
  }
}

/** The fields between the skill array and the inventory (loading :568-584, storing :239-253), none of them kept. */
function skipBeforeInventory(r: ArReader): void {
  r.u8(); // (BYTE&)m_nCheerPoint (:569), an int that :568 zeroes first
  r.u32(); // m_dwTickCheer (DWORD, :569): the server's m_dwTickCheer - GetTickCount(), which :570 makes a tick again
  r.u8(); // m_nSlot (BYTE, :571)
  r.bytes(4 * 3); // m_dwGoldBank[k] (DWORD, :572-573)
  r.bytes(4 * 3); // m_idPlayerBank[k] (u_long, :574-575)
  r.i32(); // m_nPlusMaxHitPoint (LONG, :577)
  r.u8(); // m_nAttackResistLeft (BYTE, :578)
  r.u8(); // m_nAttackResistRight (BYTE, :579)
  r.u8(); // m_nDefenseResist (BYTE, :580)
  r.i64(); // m_nAngelExp (EXPINTEGER, an __int64; __VER >= 8, __CSC_VER8_5, :582)
  r.i32(); // m_nAngelLevel (LONG, :583)
}

/**
 * `m_Inventory.Serialize( ar )` (:585): `CItemContainer<CItemElem>::Serialize`, the loading side
 * (`_Common/Item.h:923-944`; storing :898-922). `m_apIndex` (each bag position's and part's object ID) and the object
 * indexes are read past; the items are kept as `m_apItem[ch]` holds them after the read: an item in a slot listed
 * before replaces it, and one with `m_dwItemId` 0 leaves its slot empty (`CItemBase::IsEmpty`, `Item.h:48`). The
 * storing side lists each filled slot once, in slot order (:906-915).
 */
function readInventory(r: ArReader, where: Where): InventoryItem[] {
  where.part = 'the inventory';
  r.bytes(4 * INVENTORY_SLOTS); // ar.Read( m_apIndex, sizeof(DWORD) * m_dwItemMax ) (:925)
  const at = r.position();
  const count = r.u8(); // chSize (unsigned char, :930)
  // The storing side counts the filled slots, so no more than m_dwItemMax; the C++ reader does not check.
  if (count > INVENTORY_SLOTS) {
    throw new ProtocolError(`${count} items, more than its ${INVENTORY_SLOTS} slots`, at);
  }
  const slots = new Map<number, InventoryItem>();
  for (let i = 0; i < count; i++) {
    where.part = `item ${i + 1} of ${count}`;
    const slotAt = r.position();
    const objectId = r.u8(); // ch (:935)
    // The C++ would write m_apItem[ch] outside the array.
    if (objectId >= INVENTORY_SLOTS) {
      throw new ProtocolError(`slot ${objectId} is outside the inventory's ${INVENTORY_SLOTS} slots`, slotAt);
    }
    slots.set(objectId, readItem(r, objectId)); // m_apItem[ch].Serialize( ar ) (:936)
  }
  where.part = 'the inventory\'s object indexes';
  r.bytes(4 * INVENTORY_SLOTS); // ar.Read( adwObjIndex, sizeof(DWORD) * m_dwItemMax ) (:939), into m_dwObjIndex
  return [...slots.values()].filter((item) => item.itemId !== 0);
}

/**
 * `CItemElem::Serialize`, the loading side (`_Common/ObjSerialize.cpp:90-137`; storing :51-88), after
 * `CItemBase::Serialize` (:41-43; storing :35-37). `objectId` is the slot the container read before it.
 */
function readItem(r: ArReader, objectId: number): InventoryItem {
  r.u32(); // m_dwObjId (OBJID, a DWORD): the storing side's slot number again (CItemContainer::Clear, Item.h:485)
  const itemId = r.u32(); // m_dwItemId (DWORD)
  r.u32(); // m_liSerialNumber (SERIALNUMBER, a DWORD: _Network/CmnHdr.h:88)
  r.string(ITEM_TEXT_BUFFER); // ReadString( m_szItemText, 32 )
  const count = r.i16(); // m_nItemNum (short, :92)
  r.u8(); // m_nRepairNumber (BYTE, :93)
  r.i32(); // m_nHitPoint (int, :94)
  r.i32(); // m_nRepair (int, :95)
  r.u8(); // m_byFlag (BYTE, :96)
  r.i32(); // m_nAbilityOption (int, :97)
  r.u32(); // m_idGuild (DWORD, :98)
  r.u8(); // m_bItemResist (BYTE, :99)
  r.i32(); // m_nResistAbilityOption (int, :100)
  r.i32(); // m_nResistSMItemId (int, :101)
  skipPiercing(r); // m_piercing.Serialize( ar ) (:103)
  r.i32(); // m_bCharged (BOOL, :104)
  r.i64(); // m_iRandomOptItemId (__int64; __VER >= 11, __SYS_IDENTIFY, :106)
  // m_dwKeepTime (DWORD, :110), then `if( m_dwKeepTime )` the time left, a time_t (:112-119): 4 bytes, since both
  // Neuz and the world server define _USE_32BIT_TIME_T (Neuz/StdAfx.h:10, WORLDSERVER/StdAfx.h:4)
  if (r.u32() !== 0) r.i32();
  // BYTE bPet, then `if( bPet )` the pet (__VER >= 9, __PET_0410, :121-128); the storing side writes 1 or 0 (:76-84)
  if (r.u8() !== 0) skipPet(r);
  r.i32(); // m_bTranformVisPet (BOOL; __VER >= 15, __PETVIS, :131)
  return { objectId, itemId, count };
}

/**
 * `CPiercing::Serialize`, the loading side (`_Common/piercing.cpp:54-87`; storing :38-53): three lists, each a
 * `size_t` count (4 bytes on x86) and then that many 4-byte entries. The C++ reads as many entries as the count says,
 * even past the `MAX_PIERCING_*` that `SetPiercingSize` caps the list at.
 */
function skipPiercing(r: ArReader): void {
  r.bytes(4 * r.u32()); // nSize, then DWORD dwItem each: the cards (:57-65)
  r.bytes(4 * r.u32()); // nSize, then DWORD dwItem each: the ultimate jewels (__VER >= 12, __EXT_PIERCING, :66-76)
  r.bytes(4 * r.u32()); // nSize, then time_t tmTemp each (4 bytes): the vis keep times (__VER >= 15, __PETVIS, :77-86)
}

/** `CPet::Serialize`, the loading side (`_Common/pet.cpp:325-338`; storing :313-324). */
function skipPet(r: ArReader): void {
  r.u8(); // m_nKind (BYTE)
  r.u8(); // (BYTE &)m_nLevel
  r.u32(); // m_dwExp (DWORD)
  r.u16(); // m_wEnergy (WORD)
  r.u16(); // m_wLife (WORD)
  r.bytes(PL_MAX); // ar.Read( m_anAvailLevel, sizeof(BYTE) * PL_MAX )
  r.string(MAX_PET_NAME); // ReadString( m_szName, MAX_PET_NAME ) (__PET_1024)
}
