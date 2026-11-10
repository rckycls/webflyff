import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { readPet } from './pets';
import type { InventoryItem, OwnBank, OwnCharacter, SkillSlot } from './types';

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

/** What `OwnCharacter` holds before the skill array: the numbers `readOwnEquipment` reads on its way to the IDs. */
export type OwnNumbers = Omit<OwnCharacter, 'skills' | 'inventory' | 'inventoryError' | 'inventorySlots' | 'petSlot'>;

/** `MAX_BANK` (`_Common/ProjectCmn.h:9`): each bank's `m_dwItemMax` (`SetItemContainer( ITYPE_ITEM, MAX_BANK )`, `Mover.cpp:1474`). */
const MAX_BANK = 42;
/** `NULL_ID`: no pet summoned. */
const NULL_ID = 0xffffffff;

/**
 * The rest of the own character's METHOD_NONE block (`CMover::Serialize`, `_Common/ObjSerializeOpt.cpp:509-640`),
 * from where `readOwnEquipment` stopped, after the `m_aEquipInfo[i].dwId` loop (:557-558): the skill array, then the
 * fields up to the inventory and the inventory (`readInventoryPart`), then (2026-11-09, pets M0) the three banks, read
 * past, and the summoned pet's slot (`readPetSlot`). It completes `numbers` into the `OwnCharacter`, and leaves the
 * reader at the end of the message.
 */
export function readOwnAfterEquipment(r: ArReader, numbers: OwnNumbers): OwnCharacter {
  const skills = readSkills(r);
  const { inventory, inventoryError, inventorySlots, bank } = readInventoryPart(r);
  const banks = inventory === null ? undefined : readBanksAndPetSlot(r);
  const petSlot = banks?.petSlot;
  // 2026-11-10 (bank-mail): the banks are kept, with the slot and penya read before the inventory
  if (bank !== undefined && banks?.containers !== undefined) bank.containers = banks.containers;
  // The reader stops here, after the pet slot, or wherever the inventory or the banks failed. The C++ goes on with
  // `m_Pocket.Serialize` (:606), `m_dwMute` (:610, __JEFF_9_20), the honour titles (:616-634), `m_idCampus` and
  // `m_nCampusPoint` (:637-638), then the buffs. None of them is read yet: they are skipped, and whatever reads them next
  // replaces this `skipRest`.
  r.skipRest();
  return {
    ...numbers, skills, inventory, inventoryError, ...(inventorySlots ? { inventorySlots } : {}),
    ...(petSlot !== undefined ? { petSlot } : {}), ...(bank !== undefined && !emptyBank(bank) ? { bank } : {}),
  };
}

/** A bank with nothing in it (slot 0, no penya, no player, no item) is left out, as the other optional fields are. */
function emptyBank(bank: OwnBank): boolean {
  return bank.slot === 0 && bank.gold.every((gold) => gold === 0) && bank.players.every((id) => id === 0)
    && (bank.containers ?? []).every((container) => container.items.length === 0);
}

/**
 * The three banks (`m_Bank[k].Serialize( ar )`, :586-587: `CItemContainer::Serialize` with 42 slots, `_Common/Item.h:923-944`:
 * `m_apIndex`, the count, each item's slot and `CItemElem`, the object indexes), kept since 2026-11-10 (bank-mail), then `DWORD
 * dwPetId` (__VER >= 9, __PET_0410, :594-596): the summoned pet's bag object ID, undefined for `NULL_ID`. A `ProtocolError`
 * (the bytes run out, or a count or a slot out of range) gives neither: the inventory before it is kept. Any other error is a
 * bug and propagates.
 */
function readBanksAndPetSlot(r: ArReader): { containers?: Array<{ slots: number[]; items: InventoryItem[] }>; petSlot?: number } {
  const containers: Array<{ slots: number[]; items: InventoryItem[] }> = [];
  try {
    for (let k = 0; k < 3; k++) {
      const slots = Array.from({ length: MAX_BANK }, () => r.u32()); // ar.Read( m_apIndex, sizeof(DWORD) * m_dwItemMax )
      const at = r.position();
      const count = r.u8(); // chSize
      if (count > MAX_BANK) throw new ProtocolError(`bank ${k}: ${count} items, more than its ${MAX_BANK} slots`, at);
      const items = new Map<number, InventoryItem>();
      for (let i = 0; i < count; i++) {
        const slotAt = r.position();
        const slot = r.u8(); // ch
        if (slot >= MAX_BANK) throw new ProtocolError(`bank ${k}: slot ${slot} outside its ${MAX_BANK}`, slotAt);
        items.set(slot, readInventoryItem(r, slot)); // m_apItem[ch].Serialize( ar )
      }
      r.bytes(4 * MAX_BANK); // ar.Read( adwObjIndex, sizeof(DWORD) * m_dwItemMax )
      containers.push({ slots, items: [...items.values()].filter((item) => item.itemId !== 0) });
    }
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return {};
  }
  try {
    const petId = r.u32(); // ar >> dwPetId; SetPetId( dwPetId )
    return { containers, ...(petId === NULL_ID ? {} : { petSlot: petId }) };
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return { containers };
  }
}

/**
 * `m_aJobSkill`: `ar.Read( (void*)m_aJobSkill, sizeof(SKILL) * ( MAX_SKILL_JOB ) )` (:561, and :565 when
 * `__SKILL_0205` is off: the same bytes), 45 `SKILL`s (`_Common/Item.h:308-314`) of `DWORD dwSkill` and `DWORD
 * dwLevel`, 8 bytes each, which `CAr::Read` copies as they are (360 bytes).
 *
 * DOUSESKILLPOINT carries the same 45 pairs, written and read one `ar << dwSkill << dwLevel` at a time (`CDPClient::
 * OnDoUseSkillPoint`, `Neuz/DPClient.cpp:14733-14735`; `CDPSrvr::OnDoUseSkillPoint`, `WORLDSERVER/DPSrvr.cpp:1108-1109`),
 * so its readers use this one too.
 */
export function readSkills(r: ArReader): SkillSlot[] {
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
function readInventoryPart(r: ArReader): Pick<OwnCharacter, 'inventory' | 'inventoryError' | 'inventorySlots' | 'bank'> {
  const where: Where = { part: 'before the inventory' };
  try {
    const bank = skipBeforeInventory(r);
    const inventorySlots = Array.from({ length: INVENTORY_SLOTS }, () => r.u32());
    if (inventorySlots.some((id) => id !== 0xffffffff && id >= INVENTORY_SLOTS)) {
      throw new ProtocolError('invalid inventory index mapping', r.position());
    }
    return { inventory: readInventory(r, where), inventoryError: null, inventorySlots, bank };
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return { inventory: null, inventoryError: `${where.part}: ${error.message}` };
  }
}

/**
 * 2026-11-10 (trade research §7): a whole inventory as `CItemContainer<CItemElem>::Serialize` stores it (`Item.h:892-944`):
 * `m_apIndex` (73 DWORDs, bag positions then parts to object IDs), the items (`readInventory`) and the object indexes, read
 * past. TRADE sends the other player's inventory this way (`CUser::AddTrade`, `WORLDSERVER/User.cpp:798-808`).
 */
export function readItemContainer(r: ArReader): { slots: number[]; items: InventoryItem[] } {
  const at = r.position();
  const slots = Array.from({ length: INVENTORY_SLOTS }, () => r.u32());
  if (slots.some((id) => id !== 0xffffffff && id >= INVENTORY_SLOTS)) {
    throw new ProtocolError('invalid inventory index mapping', at);
  }
  return { slots, items: readInventory(r, { part: 'the inventory' }) };
}

/**
 * The fields between the skill array and the inventory (loading :568-584, storing :239-253); only the bank's are kept
 * (2026-11-10, bank-mail), the banks themselves follow the inventory.
 */
function skipBeforeInventory(r: ArReader): OwnBank {
  r.u8(); // (BYTE&)m_nCheerPoint (:569), an int that :568 zeroes first
  r.u32(); // m_dwTickCheer (DWORD, :569): the server's m_dwTickCheer - GetTickCount(), which :570 makes a tick again
  const slot = r.u8(); // m_nSlot (BYTE, :571)
  const gold = [r.u32(), r.u32(), r.u32()]; // m_dwGoldBank[k] (DWORD, :572-573)
  const players = [r.u32(), r.u32(), r.u32()]; // m_idPlayerBank[k] (u_long, :574-575)
  r.i32(); // m_nPlusMaxHitPoint (LONG, :577)
  r.u8(); // m_nAttackResistLeft (BYTE, :578)
  r.u8(); // m_nAttackResistRight (BYTE, :579)
  r.u8(); // m_nDefenseResist (BYTE, :580)
  r.i64(); // m_nAngelExp (EXPINTEGER, an __int64; __VER >= 8, __CSC_VER8_5, :582)
  r.i32(); // m_nAngelLevel (LONG, :583)
  return { slot, gold, players };
}

/**
 * `m_Inventory.Serialize( ar )` (:585): `CItemContainer<CItemElem>::Serialize`, the loading side
 * (`_Common/Item.h:923-944`; storing :898-922). The caller keeps `m_apIndex` (bag/equipment positions to object IDs).
 * Object indexes are read past; the items are kept as `m_apItem[ch]` holds them after the read: an item in a slot listed
 * before replaces it, and one with `m_dwItemId` 0 leaves its slot empty (`CItemBase::IsEmpty`, `Item.h:48`). The
 * storing side lists each filled slot once, in slot order (:906-915).
 */
function readInventory(r: ArReader, where: Where): InventoryItem[] {
  where.part = 'the inventory';
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
    slots.set(objectId, readInventoryItem(r, objectId)); // m_apItem[ch].Serialize( ar ) (:936)
  }
  where.part = 'the inventory\'s object indexes';
  r.bytes(4 * INVENTORY_SLOTS); // ar.Read( adwObjIndex, sizeof(DWORD) * m_dwItemMax ) (:939), into m_dwObjIndex
  return [...slots.values()].filter((item) => item.itemId !== 0);
}

/**
 * `CItemElem::Serialize`, the loading side (`_Common/ObjSerialize.cpp:90-137`; storing :51-88), after
 * `CItemBase::Serialize` (:41-43; storing :35-37). `objectId` is the slot the container read before it.
 */
export function readInventoryItem(r: ArReader, slotId?: number): InventoryItem {
  const objectId = slotId ?? r.u32();
  if (slotId !== undefined) r.u32(); // serialized id repeated; container slot takes precedence
  const itemId = r.u32(); // m_dwItemId (DWORD)
  r.u32(); // m_liSerialNumber (SERIALNUMBER, a DWORD: _Network/CmnHdr.h:88)
  r.string(ITEM_TEXT_BUFFER); // ReadString( m_szItemText, 32 )
  const count = r.i16(); // m_nItemNum (short, :92)
  r.u8(); // m_nRepairNumber (BYTE, :93)
  r.i32(); // m_nHitPoint (int, :94)
  r.i32(); // m_nRepair (int, :95)
  const flag = r.u8(); // m_byFlag (BYTE, :96)
  const abilityOption = r.i32(); // m_nAbilityOption (int, :97)
  r.u32(); // m_idGuild (DWORD, :98)
  const resist = r.u8(); // m_bItemResist (BYTE, :99)
  const resistOption = r.i32(); // m_nResistAbilityOption (int, :100)
  r.i32(); // m_nResistSMItemId (int, :101)
  const { piercing, ultimate, visKeepTimes } = readPiercing(r); // m_piercing.Serialize( ar ) (:103)
  const charged = r.i32(); // m_bCharged (BOOL, :104)
  const randomOption = r.i64(); // m_iRandomOptItemId (__int64; __VER >= 11, __SYS_IDENTIFY, :106)
  // m_dwKeepTime (DWORD, :110), then `if( m_dwKeepTime )` the time left, a time_t (:112-119): 4 bytes, since both
  // Neuz and the world server define _USE_32BIT_TIME_T (Neuz/StdAfx.h:10, WORLDSERVER/StdAfx.h:4)
  // 2026-11-05: kept as the seconds left when read (the ticket in use is one with a keep time, CMover::GetTicket)
  const keepTime = r.u32() !== 0 ? r.i32() : undefined;
  // BYTE bPet, then `if( bPet )` the pet (__VER >= 9, __PET_0410, :121-128); the storing side writes 1 or 0 (:76-84)
  // 2026-11-09: the raised pet is kept (pets M0)
  const pet = r.u8() !== 0 ? readPet(r) : undefined;
  const transformVisPet = r.i32() !== 0; // m_bTranformVisPet (BOOL; __VER >= 15, __PETVIS, :131)
  return {
    objectId, itemId, count, ...(flag ? { flag } : {}), ...(charged ? { charged } : {}),
    // what the item tooltip shows, when there is something to show (2026-11-05)
    ...(abilityOption !== 0 ? { abilityOption } : {}), ...(resist !== 0 ? { resist } : {}),
    ...(resistOption !== 0 ? { resistOption } : {}), ...(piercing.length > 0 ? { piercing } : {}),
    ...(ultimate.length > 0 ? { ultimate } : {}), ...(randomOption !== 0n ? { randomOption } : {}),
    ...(keepTime !== undefined ? { keepTime } : {}),
    ...(pet !== undefined ? { pet } : {}), ...(visKeepTimes.length > 0 ? { visKeepTimes } : {}),
    ...(transformVisPet ? { transformVisPet: true as const } : {}),
  };
}

/**
 * `CPiercing::Serialize`, the loading side (`_Common/piercing.cpp:54-87`; storing :38-53): three lists, each a
 * `size_t` count (4 bytes on x86) and then that many 4-byte entries. The C++ reads as many entries as the count says,
 * even past the `MAX_PIERCING_*` that `SetPiercingSize` caps the list at.
 */
function readPiercing(r: ArReader): { piercing: number[]; ultimate: number[]; visKeepTimes: number[] } {
  const list = (): number[] => Array.from({ length: r.u32() }, () => r.u32());
  const piercing = list(); // nSize, then DWORD dwItem each: the cards (:57-65)
  const ultimate = list(); // nSize, then DWORD dwItem each: the ultimate jewels (__VER >= 12, __EXT_PIERCING, :66-76)
  // nSize, then time_t tmTemp each (4 bytes): the vis keep times as seconds left (__VER >= 15, __PETVIS, :77-86); a buff
  // pet's vis are its `piercing` entries (2026-11-09: kept, pets M0)
  const visKeepTimes = Array.from({ length: r.u32() }, () => r.i32());
  return { piercing, ultimate, visKeepTimes };
}
