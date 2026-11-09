// The pets (M0 of docs/superpowers/specs/2026-11-09-pets-research.md, [R]): the raised pet's numbers that every item
// carries, and the pet messages of the world server. The browser keeps them; nothing draws a pet yet.
//
//   Function                            File:lines                               what
//   CPet::Serialize                     _Common/pet.cpp:311-339                  the raised pet in an item (loading :325-338)
//   CDPClient::OnPetCall .. OnPetFoodMill Neuz/DPClient.cpp:16398-16632         PET_CALL 0x0110 .. PET_MILL 0x0117
//   CDPClient::OnQuePetResurrectionResult Neuz/DPClient.cpp (__JEFF_11)         its writer CUser::AddQuePetResurrectionResult, WORLDSERVER/User.cpp:3663-3670
//   CDPClient::OnSetPetName             Neuz/DPClient.cpp:18446-18467            SET_PET_NAME 0x9100 (__PET_1024)
//   CDPClient::OnActivateVisPet         Neuz/DPClient.cpp:19002-19029            VISPET_ACTIVATE 0x8801 (__VER >= 15, __PETVIS)
//   CDPClient::OnChangeMoverSfx         Neuz/DPClient.cpp:19032-19042            MOVER_CHANGESFX 0x8800 (__PETVIS)
//   CDPClient::SendPetRelease           Neuz/DPClient.cpp:16450-16454            the client's PET_RELEASE 0xf000f600 (R2)
//   CDPClient::SendUsePetFeed .. SendFeedPocketInactive DPClient.cpp:16458-16498  USE_PET_FEED 0xf000f601 .. MAKE_PET_FEED 0xf000f605 (R3)
//   CDPClient::SendClearPetName         Neuz/DPClient.cpp:18441-18444            CLEAR_PET_NAME 0x8fffff01 (R3)

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';

/** `PL_MAX` (`enum PETLEVEL`, `_Common/pet.h:16`): the 6 bytes of `CPet::m_anAvailLevel`. */
const PL_MAX = 6;
/** `MAX_PET_NAME` (`_Common/pet.h:105`, `__PET_1024`): the `nBufSize` of every pet name's `ReadString`. */
export const MAX_PET_NAME = 17;

/**
 * A raised pet (`CPet`, `_Common/pet.h:108-166`): `kind` a `PK_*` (`Resource/define.h:250-258`), `level` a `PL_*` (0 the
 * egg, then D, C, B, A, S), `exp` of 50,000 for the egg or 100,000, `energy`, `life`, the stat step rolled at each level
 * (`m_anAvailLevel`, index level - 1; 0 for none) and its name ('' for none).
 */
export interface PetData {
  kind: number;
  level: number;
  exp: number;
  energy: number;
  life: number;
  availLevels: number[];
  name: string;
}

/** `CPet::Serialize`, the loading side (`_Common/pet.cpp:325-338`; storing :313-324). */
export function readPet(r: ArReader): PetData {
  const kind = r.u8(); // m_nKind (BYTE)
  const level = r.u8(); // (BYTE &)m_nLevel
  const exp = r.u32(); // m_dwExp (DWORD)
  const energy = r.u16(); // m_wEnergy (WORD)
  const life = r.u16(); // m_wLife (WORD)
  const availLevels = Array.from(r.bytes(PL_MAX)); // ar.Read( m_anAvailLevel, sizeof(BYTE) * PL_MAX )
  const name = r.string(MAX_PET_NAME); // ReadString( m_szName, MAX_PET_NAME ) (__PET_1024)
  return { kind, level, exp, energy, life, availLevels, name };
}

/** The pet messages, as their `CDPClient::On*` handlers read them. */
export type PetMessage =
  /** A mover summoned its raised pet (to all in view): the item's object id (the own one's bag slot), the model, the level, the name. */
  | { type: 'petCall'; itemObjectId: number; modelIndex: number; level: number; name: string }
  /** A mover sent its raised pet back (to all in view). */
  | { type: 'petRelease' }
  /** Another mover's raised pet changed level or kind (to all in view but the owner): its new model and level. */
  | { type: 'petLevelup'; modelIndex: number; level: number }
  /** The own raised pet's EXP. */
  | { type: 'petSetExp'; exp: number }
  /** The own raised pet whole, and why it came: `PF_PET` 0, `PF_PET_LEVEL_UP` 1, `_LEVEL_DOWN` 2, `_GET_AVAIL` 3 (`pet.h:89-92`). */
  | { type: 'pet'; pet: PetData; flag: number }
  /** The own raised pet's life, energy and EXP, by its item. */
  | { type: 'petState'; itemObjectId: number; life: number; energy: number; exp: number }
  /** A mover's raised pet was fed (to all in view): its energy. */
  | { type: 'petFeed'; energy: number }
  /** The food mill's answer: the item made or not, and how much food. */
  | { type: 'petMill'; result: number; count: number }
  /** The pet resurrection's answer (`__JEFF_11`). */
  | { type: 'petResurrectionResult'; ok: boolean }
  /** A mover's raised pet's new name, '' for none (to all in view, `__PET_1024`). */
  | { type: 'setPetName'; name: string }
  /** A mover's effect changed (to all in view): a buff pet's aura, `NULL_ID` for none (`__PETVIS`). */
  | { type: 'moverChangeSfx'; sfxId: number }
  /** The own buff pet came out or went: its item and its mover, both `NULL_ID` when it went (`__PETVIS`). */
  | { type: 'visPetActivate'; itemObjectId: number; petMoverId: number };

/** PET_CALL: `OnPetCall` (`DPClient.cpp:16398-16418`): `ar >> dwPetId >> dwIndex >> nPetLevel`, then the name. */
export function readPetCall(r: ArReader): PetMessage {
  const itemObjectId = r.u32(); // dwPetId: the summoned item's m_dwObjId
  const modelIndex = r.u32(); // dwIndex: CPet::GetIndex(), an MI_PET_* id
  const level = r.u8(); // (BYTE)nPetLevel
  const name = r.string(MAX_PET_NAME); // ReadString( szPetName, MAX_PET_NAME ) (__PET_1024)
  return { type: 'petCall', itemObjectId, modelIndex, level, name };
}

/**
 * 2026-11-09 (pets R2): the client's PET_RELEASE (`CDPClient::SendPetRelease`, `DPClient.cpp:16450-16454`), from the own
 * pet's menu (`MMI_PET_RELEASE`, `WndWorld.cpp:5891-5898`): the type alone; `CDPSrvr::OnPetRelease`
 * (`WORLDSERVER/DPSrvr.cpp:8036-8052`) reads nothing and sends the pet back, or says `TID_GAME_PET_NOT_FOUND`.
 */
export function encodePetRelease(): Uint8Array {
  return clientPacket(PacketType.PET_RELEASE).toBytes();
}

/** A bag object id (`m_dwObjId`) or `NULL_ID`, as a DWORD. */
function checkObjectId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new RangeError('invalid object id');
}

/**
 * 2026-11-09 (pets R3): `CDPClient::SendUsePetFeed` (`DPClient.cpp:16458-16469`, `__PET_0519`): the food's object id
 * alone; `CDPSrvr::OnUsePetFeed` (`WORLDSERVER/DPSrvr.cpp:8054-8122`) feeds the whole stack, as much as fits.
 */
export function encodeUsePetFeed(feedObjectId: number): Uint8Array {
  checkObjectId(feedObjectId);
  return clientPacket(PacketType.USE_PET_FEED).u32(feedObjectId).toBytes();
}

/**
 * 2026-11-09 (pets R3): `SendMakePetFeed( dwMaterialId, nNum, dwToolId )` (`DPClient.cpp:16471-16477`), written
 * `ar << dwMaterialId << dwToolId << nNum`: the material's object id, the feed maker's (`NULL_ID` at the tamer) and the
 * count as a short (`OnMakePetFeed`, `DPSrvr.cpp:8125-8227`).
 */
export function encodeMakePetFeed(materialObjectId: number, toolObjectId: number, count: number): Uint8Array {
  checkObjectId(materialObjectId);
  checkObjectId(toolObjectId);
  if (!Number.isInteger(count) || count < -0x8000 || count > 0x7fff) throw new RangeError('invalid count');
  return clientPacket(PacketType.MAKE_PET_FEED).u32(materialObjectId).u32(toolObjectId).i16(count).toBytes();
}

/** 2026-11-09 (pets R3): `SendPetTamerMistake( dwId )` (`DPClient.cpp:16479-16485`): the scroll's object id. */
export function encodePetTamerMistake(scrollObjectId: number): Uint8Array {
  checkObjectId(scrollObjectId);
  return clientPacket(PacketType.PET_TAMER_MISTAKE).u32(scrollObjectId).toBytes();
}

/** 2026-11-09 (pets R3): `SendPetTamerMiracle( dwId )` (`DPClient.cpp:16487-16492`): the scroll's object id. */
export function encodePetTamerMiracle(scrollObjectId: number): Uint8Array {
  checkObjectId(scrollObjectId);
  return clientPacket(PacketType.PET_TAMER_MIRACLE).u32(scrollObjectId).toBytes();
}

/**
 * 2026-11-09 (pets R3): `SendFeedPocketInactive` (`DPClient.cpp:16494-16498`), sent when the feed pocket's buff is
 * double-clicked (`CWndWorld::OnLButtonDblClk`, `WndWorld.cpp:7280-7283`): the type alone (`OnFeedPocketInactive`,
 * `DPSrvr.cpp:8329-8338`).
 */
export function encodeFeedPocketInactive(): Uint8Array {
  return clientPacket(PacketType.FEED_POCKET_INACTIVE).toBytes();
}

/**
 * 2026-11-09 (pets R3): `SendClearPetName` (`DPClient.cpp:18441-18444`, `SendHdr`), the Pet Tamer's `MMI_RENAME_CANCEL`
 * (`WndWorld.cpp:5237-5240`): the type alone (`OnClearPetName`, `DPSrvr.cpp:9831-9845`).
 */
export function encodeClearPetName(): Uint8Array {
  return clientPacket(PacketType.CLEAR_PET_NAME).toBytes();
}

/** PET_RELEASE: `OnPetRelease` (`DPClient.cpp:16420-16448`): nothing more. */
export function readPetRelease(): PetMessage {
  return { type: 'petRelease' };
}

/** PET_LEVELUP: `OnPetLevelup` (`DPClient.cpp:16500-16512`): `ar >> dwPetId`, `MAKELONG( index, level )`. */
export function readPetLevelup(r: ArReader): PetMessage {
  const petId = r.u32();
  return { type: 'petLevelup', modelIndex: petId & 0xffff, level: petId >>> 16 };
}

/** PET_SET_EXP: `OnPetSetExp` (`DPClient.cpp:16514-16538`): `ar >> dwExp`. */
export function readPetSetExp(r: ArReader): PetMessage {
  return { type: 'petSetExp', exp: r.u32() };
}

/** PET: `OnPet` (`DPClient.cpp:16540-16567`): `pet.Serialize( ar )`, then `ar >> nPetLevelup` (BYTE). */
export function readPetWhole(r: ArReader): PetMessage {
  const pet = readPet(r);
  return { type: 'pet', pet, flag: r.u8() };
}

/** PET_STATE: `OnPetState` (`DPClient.cpp:16569-16600`): `ar >> dwPetId >> wLife >> wEnergy >> dwExp`. */
export function readPetState(r: ArReader): PetMessage {
  const itemObjectId = r.u32();
  const life = r.u16();
  const energy = r.u16();
  return { type: 'petState', itemObjectId, life, energy, exp: r.u32() };
}

/** PET_FEED: `OnPetFeed` (`DPClient.cpp:16602-16617`): `ar >> wEnergy`. */
export function readPetFeed(r: ArReader): PetMessage {
  return { type: 'petFeed', energy: r.u16() };
}

/** PET_MILL: `OnPetFoodMill` (`DPClient.cpp:16619-16632`): `ar >> nResult >> nCount` (two ints). */
export function readPetMill(r: ArReader): PetMessage {
  const result = r.i32();
  return { type: 'petMill', result, count: r.i32() };
}

/** QUE_PETRESURRECTION_RESULT: a BOOL (`CUser::AddQuePetResurrectionResult`, `WORLDSERVER/User.cpp:3663-3670`). */
export function readPetResurrectionResult(r: ArReader): PetMessage {
  return { type: 'petResurrectionResult', ok: r.i32() !== 0 };
}

/** SET_PET_NAME: `OnSetPetName` (`DPClient.cpp:18446-18467`): `ReadString( szPetName, MAX_PET_NAME )`. */
export function readSetPetName(r: ArReader): PetMessage {
  return { type: 'setPetName', name: r.string(MAX_PET_NAME) };
}

/** MOVER_CHANGESFX: `OnChangeMoverSfx` (`DPClient.cpp:19032-19042`): `ar >> dwSfxId`. */
export function readMoverChangeSfx(r: ArReader): PetMessage {
  return { type: 'moverChangeSfx', sfxId: r.u32() };
}

/** VISPET_ACTIVATE: `OnActivateVisPet` (`DPClient.cpp:19002-19029`): `ar >> objIdVisPetItem >> objIdVisPetId`. */
export function readVisPetActivate(r: ArReader): PetMessage {
  const itemObjectId = r.u32();
  return { type: 'visPetActivate', itemObjectId, petMoverId: r.u32() };
}
