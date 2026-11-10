import { describe, expect, it } from 'vitest';
import { writeAddSelf } from '@flyffweb/testkit';
import { ArWriter, BUNDLE_MARKER, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';
import type {
  AddedMover, BundleResult, InventoryItem, OwnCharacter, SkillSlot, Vec3, WorldMessage,
} from '../src';

// The values below are copied from the C++ on purpose, so that a wrong constant in the reader shows up here.
/** `OT_ITEM` and `OT_MOVER` (`Resource/define.h:84-85`). */
const OT_ITEM = 4;
const OT_MOVER = 5;
/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`), `SM_MAX` (`_Network/CmnHdr.h:503`), `MAX_JOB` (`defineJob.h:90`). */
const MAX_HUMAN_PARTS = 31;
const SM_MAX = 26;
const MAX_JOB = 32;
/** `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`, `__VER >= 10`): 3 + 20 + 20 + 1 + 1 (`Resource/defineJob.h:12-17`). */
const MAX_SKILL_JOB = 45;
/** `SI_GEN_EVE_QUICKSTEP`, `_HASTE`, `_HEAPUP` and `_ACCURACY` (`Resource/defineSkill.h:243-246`). */
const SI_GEN_EVE = [317, 318, 319, 320];
/**
 * `m_Inventory`'s `m_dwItemMax`: `SetItemContainer( ITYPE_ITEM, MAX_INVENTORY, MAX_HUMAN_PARTS )`
 * (`_Common/Mover.cpp:1460`, `Item.h:498-503`), `MAX_INVENTORY` 42 (`_Common/ProjectCmn.h:7`) + 31.
 */
const MAX_INVENTORY = 42;
const INVENTORY_SLOTS = MAX_INVENTORY + MAX_HUMAN_PARTS;

/** The bundle's player object ID: an ADD_OBJ with this object ID is the player's own character. */
const PLAYER = 0x1234;
const OTHER = 0x2001;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A JOIN body written by hand: the 10-byte header, the messages, and (by default) the table of contents. */
function body(messages: Msg[], indexed = true): Uint8Array {
  const w = new ArWriter().u32(PacketType.JOIN).u32(PLAYER).u16(messages.length);
  const starts: number[] = [];
  let at = 0;
  for (const m of messages) {
    starts.push(at);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    at += 6 + m.fields.byteLength;
  }
  if (indexed) {
    for (const s of starts) w.u32(s);
    w.u16(messages.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}

function readAdd(objectId: number, fields: Uint8Array, indexed = true): BundleResult<WorldMessage> {
  return readBundle(body([{ objectId, type: MessageType.ADD_OBJ, fields }], indexed), WORLD_READERS);
}

/** Reads a bundle of this one ADD_OBJ and returns what the reader made of it, with nothing skipped or mismatched. */
function readOne(objectId: number, fields: Uint8Array, indexed = true): WorldMessage {
  const result = readAdd(objectId, fields, indexed);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ objectId, type: MessageType.ADD_OBJ });
  return result.messages[0].value;
}

function repeat(w: ArWriter, count: number, write: (w: ArWriter, i: number) => void): ArWriter {
  for (let i = 0; i < count; i++) write(w, i);
  return w;
}

// Every position, scale and angle below is exactly representable as a float, so it reads back unchanged.
const pos: Vec3 = [6968.5, 100.25, 3328.5];

/**
 * What `OnAddObj` reads before `pObj->Serialize( ar )` (`ar >> (BYTE &)dwObjType >> dwObjIndex`), then
 * `CObj::Serialize` (the type and index again, `(u_short)( m_vScale.x * 100 )`, `m_vPos`, `(short)( m_fAngle * 10 )`)
 * and `CCtrl::Serialize` (`m_objid`).
 */
function objectHead(index: number, scaleTimes100: number, angleTimes10: number, objectId: number): ArWriter {
  return new ArWriter().u8(OT_MOVER).u32(index)
    .u8(OT_MOVER).u32(index).u16(scaleTimes100).vec3(pos).i16(angleTimes10)
    .u32(objectId);
}

/**
 * The player part of `CMover::Serialize` that does not depend on the method (`ObjSerializeOpt.cpp:424-506`), with
 * the guild and the party present when their flags are 1.
 */
function playerCommon(
  w: ArWriter, name: string, guild: boolean, party: boolean, stats: readonly number[] = [15, 16, 17, 18], useItemId = 0,
  fuel: readonly [number, number] = [-1, 0],
): ArWriter {
  w.string(name).u8(1).u8(2).u8(3).u32(0xff112233).u8(4) // name, sex, skin set, hair mesh, hair colour, head mesh
    .u32(777).u8(9) // m_idPlayer, m_nJob
    .u16(stats[0]).u16(stats[1]).u16(stats[2]).u16(stats[3]).u16(65) // m_nStr, m_nSta, m_nDex, m_nInt, level
    .i32(fuel[0]).i32(fuel[1]); // m_nFuel, m_tmAccFuel
  if (guild) w.u8(1).u32(42).u32(3); else w.u8(0); // m_idGuild, m_idWar
  w.u32(42); // m_idGuildCloak
  if (party) w.u8(1).u32(9).u32(0); else w.u8(0); // m_idparty, m_idDuelParty
  w.u8(0x46).u32(0x10).u32(0x20).u32(useItemId) // (char)m_dwAuthorization, m_dwMode, m_dwStateMode, m_dwUseItemId
    .u32(5000).i32(3).u32(100).u32(7) // m_dwPKTime, m_nPKValue, m_dwPKPropensity, m_dwPKExp
    .i32(12).u8(0).i32(6); // m_nFame, m_nDuel, m_nHonor
  repeat(w, MAX_HUMAN_PARTS, (x, i) => x.i32(i)); // m_aEquipInfo[i].nOption
  w.i32(0); // m_nGuildCombatState
  return repeat(w, SM_MAX, (x, i) => x.u32(i * 1000)); // m_dwSMTime
}

/**
 * What every player value below shares; `worn`, `equipmentObjectIds` and `shopTitle` are set per test. STA and DEX are
 * `playerCommon`'s (16 and 17), which the own character's numbers replace (`selfMover`).
 */
const playerBase = {
  name: 'Hero', sex: 1, skinSet: 2, hairMesh: 3, hairColor: 0xff112233, headMesh: 4, playerId: 777, job: 9, sta: 16,
  dex: 17, level: 65, authorization: 0x46, mode: 0x10, stateMode: 0x20, pkTime: 5000, pkValue: 3, pkPropensity: 100,
  honor: 6,
};

/** Another player (METHOD_EXCLUDE_ITEM): `OnAddObj` sees an object ID that is not `g_pPlayer`'s. */
function otherPlayerFields(useItemId = 0, fuel: readonly [number, number] = [-1, 0]): ArWriter {
  const w = objectHead(11, 100, 905, OTHER)
    // m_dwMotion, m_bPlayer, m_nHitPoint, state, state flag, m_dwBelligerence, m_dwMoverSfxId
    .u16(0x15).u8(1).i32(1234).u32(0x11).u32(0x2).u8(0).u32(NULL_ID);
  playerCommon(w, 'Hero', true, true, undefined, useItemId, fuel)
    .string('Cheap swords') // m_vtInfo.GetTitle()
    .u8(3) // uSize, then uParts, (u_short)m_dwItemId and m_byFlag for each
    .u8(2).u16(500).u8(0)
    .u8(10).u16(21).u8(1)
    .u8(27).u16(4100).u8(0)
    .u32(0x00050003).string('Rex'); // dwPetId (MAKELONG index, level), the pet's name (__PET_1024)
  return w.u32(0); // m_buffs: no buffs
}

describe('ADD_OBJ (OnAddObj)', () => {
  it('reads another player', () => {
    expect(readOne(OTHER, otherPlayerFields().toBytes())).toEqual({
      type: 'addMover',
      mover: {
        index: 11, scale: 1, pos, angle: 90.5, objectId: OTHER,
        motion: 0x15, isPlayer: true, hitPoint: 1234, state: 0x11, stateFlag: 0x2, belligerence: 0, sfxId: NULL_ID,
        player: {
          ...playerBase, self: false, own: null, shopTitle: 'Cheap swords', equipmentObjectIds: [],
          // 2026-11-10 (guild): m_idGuild, m_idWar and m_idGuildCloak, kept
          guildId: 42, warId: 3, guildCloak: 42,
          // 2026-11-09 (pets M0): MAKELONG( 3, 5 ) and the pet's name, kept
          pet: { modelIndex: 3, level: 5, name: 'Rex' },
          worn: [
            // 2026-11-09: each part's nOption (written as its index here) is kept
            { part: 2, itemId: 500, flag: 0, option: 2 }, { part: 10, itemId: 21, flag: 1, option: 10 },
            { part: 27, itemId: 4100, flag: 0, option: 27 },
          ],
        },
      },
    });
  });

  it("keeps a player's fuel when it is not the default (Piece 7 M5, ObjSerializeOpt.cpp:128-129)", () => {
    const added = readOne(OTHER, otherPlayerFields(0, [1200, 12000]).toBytes()) as { mover: { player: { fuel?: number; accFuel?: number } } };
    expect([added.mover.player.fuel, added.mover.player.accFuel]).toEqual([1200, 12000]);
  });

  it('keeps the cast item of a mover in view (Piece 7 M3, ObjSerializeOpt.cpp:155-163)', () => {
    const added = readOne(OTHER, otherPlayerFields(4805).toBytes()) as { mover: { player: { useItemId?: number } } };
    expect(added.mover.player.useItemId).toBe(4805);
  });

  it('reads a monster with buffs', () => {
    const fields = objectHead(20, 150, -455, 0x3001)
      .u16(0).u8(0).i32(300).u32(0x1).u32(0).u8(1).u32(77) // motion, not a player, HP, state, flag, belligerence, sfx
      .u8(0).u32(0).u8(0).string('') // hair mesh, hair colour, head mesh, m_szCharacterKey
      .u8(0) // uSize: no worn parts
      .u8(1).u8(0).u8(0).i32(0).f32(1) // m_bActiveAttack, m_nMovePattern, m_nMoveEvent, m_nMoveEventCnt, speed factor
      // CBuffMgr::Serialize: the count (size_t), then per buff wType, wId, the level and the time left. A BUFF_ITEM2
      // (3) has a time_t for a level, 4 bytes with _USE_32BIT_TIME_T.
      .u32(2)
      .u16(1).u16(55).u32(3).u32(60000)
      .u16(3).u16(10270).i32(-3600).u32(0)
      .toBytes();
    expect(readOne(0x3001, fields)).toEqual({
      type: 'addMover',
      mover: {
        index: 20, scale: 1.5, pos, angle: -45.5, objectId: 0x3001,
        motion: 0, isPlayer: false, hitPoint: 300, state: 0x1, stateFlag: 0, belligerence: 1, sfxId: 77,
        npc: {
          hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [],
          activeAttack: 1, movePattern: 0, moveEvent: 0, moveEventCount: 0, speedFactor: 1,
        },
        // Piece 7 M2: kept
        buffs: [{ buffType: 1, id: 55, level: 3, timeLeft: 60000 }, { buffType: 3, id: 10270, level: -3600, timeLeft: 0 }],
      },
    });
  });

  it('reads a human NPC with worn parts and a speed factor', () => {
    const fields = objectHead(11, 100, 1800, 0x4001)
      .u16(0x1).u8(0).i32(100).u32(0x1).u32(0).u8(0).u32(NULL_ID)
      .u8(2).u32(0xff334455).u8(5).string('MaFl_Bobochan')
      .u8(2) // uSize, then uParts and (u_short)m_dwItemId for each: an NPC's parts have no flag
      .u8(2).u16(502)
      .u8(10).u16(22)
      .u8(0).u8(2).u8(99).i32(-1).f32(0.5)
      .u32(0)
      .toBytes();
    expect(readOne(0x4001, fields)).toEqual({
      type: 'addMover',
      mover: {
        index: 11, scale: 1, pos, angle: 180, objectId: 0x4001,
        motion: 0x1, isPlayer: false, hitPoint: 100, state: 0x1, stateFlag: 0, belligerence: 0, sfxId: NULL_ID,
        npc: {
          hairMesh: 2, hairColor: 0xff334455, headMesh: 5, characterKey: 'MaFl_Bobochan',
          worn: [{ part: 2, itemId: 502, flag: 0 }, { part: 10, itemId: 22, flag: 0 }],
          activeAttack: 0, movePattern: 2, moveEvent: 99, moveEventCount: -1, speedFactor: 0.5,
        },
      },
    });
  });

  /**
   * The own character's `m_aEquipInfo[i].dwId`, one per part: inventory object IDs (7, 0 and 41 at parts 2, 10 and
   * 13), `NULL_ID` where the part wears nothing.
   */
  const ownEquipment = Array.from(
    { length: MAX_HUMAN_PARTS }, (_, i) => (i === 2 ? 7 : i === 10 ? 0 : i === 13 ? 41 : NULL_ID),
  );

  /**
   * `m_aJobSkill` with the first slots filled and the rest empty: `dwSkill` `NULL_ID` and `dwLevel` 0, as
   * `CMover::InitProp` leaves a slot (`_Common/Mover.cpp:1478-1485`).
   */
  function skillArray(filled: readonly SkillSlot[]): SkillSlot[] {
    return Array.from({ length: MAX_SKILL_JOB }, (_, i) => filled[i] ?? { skill: NULL_ID, level: 0 });
  }

  // A new male Vagrant's inventory, the `BASE_VALUE_TBL` row with `g_nSex` 0 (`Database.sql:2741`): `m_Inventory` lists
  // each item as `objectId,itemId,bEquip,nTrade,text,m_nItemNum,m_nRepairNumber,m_nHitPoint,...`
  // (`CDbManager::GetOneItem`, `_Database/DbManagerFun.cpp:1426-1450`), and `m_apIndex` and `m_dwObjIndex` put the
  // suit, gauntlets, boots and sword in parts 2, 4, 5 and 10 (`PARTS_UPPER_BODY`, `_HAND`, `_FOOT`, `_RWEAPON`,
  // `Resource/defineNeuz.h:26-34`), slots 42 + part.
  const STARTER_INVENTORY: InventoryItem[] = [
    { objectId: 0, itemId: 502, count: 1 }, // II_ARM_M_VAG_SUIT01 (Resource/defineItem.h:248), worn
    { objectId: 1, itemId: 2801, count: 1 }, // II_GEN_FOO_INS_BISCUIT (:1064)
    { objectId: 2, itemId: 4805, count: 5 }, // II_SYS_BLI_TWO_TOWNBLINKWING (:1542)
    { objectId: 42, itemId: 506, count: 1 }, // II_ARM_M_VAG_GAUNTLET01 (:252), worn
    { objectId: 43, itemId: 510, count: 1 }, // II_ARM_M_VAG_BOOTS01 (:256), worn
    { objectId: 44, itemId: 21, count: 1 }, // II_WEA_SWO_WOODEN (:32), worn
    { objectId: 45, itemId: 2800, count: 3 }, // II_GEN_FOO_INS_LOLLIPOP (:1063)
  ];
  /** The row's `m_nHitPoint` of the worn items (the others have 0). */
  const STARTER_EXTRAS: ReadonlyMap<number, ItemExtras> = new Map([
    [0, { hitPoint: 9000000 }], [42, { hitPoint: 5850000 }], [43, { hitPoint: 4500000 }], [44, { hitPoint: 7200000 }],
  ]);
  const STARTER_WORN: ReadonlyMap<number, number> = new Map([[2, 0], [4, 42], [5, 43], [10, 44]]);
  /** `m_aEquipInfo[i].dwId`: the worn items' object IDs, `m_apIndex[MAX_INVENTORY + i]` (`Obj.cpp:494-506`). */
  const STARTER_EQUIPMENT = Array.from({ length: MAX_HUMAN_PARTS }, (_, i) => STARTER_WORN.get(i) ?? NULL_ID);
  /** The row's `m_apIndex`: the object ID at each position of the bag (42), then of each part (31). */
  const STARTER_AP_INDEX = [
    45, ...Array.from({ length: MAX_INVENTORY - 1 }, (_, i) => i + 1), ...STARTER_EQUIPMENT,
  ];
  /** The row's `m_dwObjIndex`: each slot's position in `m_apIndex`, `NULL_ID` for the slots no item uses. */
  const STARTER_OBJ_INDEX = [
    44, ...Array.from({ length: MAX_INVENTORY - 1 }, (_, i) => i + 1), 46, 47, 52, 0,
    ...Array.from({ length: INVENTORY_SLOTS - MAX_INVENTORY - 4 }, () => NULL_ID),
  ];

  /**
   * An ADD_OBJ's own numbers with a new character's stats (15 in each, MP 63, FP 32, no EXP or points) and its
   * `BASE_VALUE_TBL` inventory, but not its skills: seven slots are filled at levels 0, 1 and 2, so that the reads can be
   * told apart. A new character has the skills 1 to 3 at level 0 and 42 empty slots (`newVagrantOwn`,
   * `_Network/Objects/Obj.cpp:297-332`).
   */
  const newCharacter: OwnCharacter = {
    str: 15, sta: 15, dex: 15, int: 15, manaPoint: 63, fatiguePoint: 32,
    exp: 0n, skillLevel: 0, skillPoint: 0, deathExp: 0n, deathLevel: 0, remainGP: 0,
    // Slots 0 to 2 are the first three skills (here IDs 1, 2 and 3 at levels 0, 1 and 2), slots 3 to 6 the four
    // `SI_GEN_EVE_*` placeholders.
    skills: skillArray([
      { skill: 1, level: 0 }, { skill: 2, level: 1 }, { skill: 3, level: 2 },
      ...SI_GEN_EVE.map((skill) => ({ skill, level: 0 })),
    ]),
    inventory: STARTER_INVENTORY,
    inventoryError: null,
  };

  /** A character whose numbers all differ, with the highest values the fields hold and the signed ones negative. */
  const veteran: OwnCharacter = {
    str: 80, sta: 65535, dex: 40, int: 25, manaPoint: 65535, fatiguePoint: 60,
    exp: 9876543210n, skillLevel: 3, skillPoint: 4, deathExp: -5n, deathLevel: 7, remainGP: -2,
    skills: skillArray([
      { skill: 0, level: 0 }, { skill: 4, level: 0xffffffff }, { skill: 0xfffffffe, level: 19 },
      ...SI_GEN_EVE.map((skill, i) => ({ skill, level: i })),
    ]),
    // The count is a `short`; the last of the 73 slots is 72.
    inventory: [{ objectId: 7, itemId: 0xfffffffe, count: -2 }, { objectId: 72, itemId: 4805, count: 32767 }],
    inventoryError: null,
  };

  /**
   * Fields of `CItemElem::Serialize` the reader reads past, which a test item can fill; the others are written as 0.
   * `piercing`, `ultimate` and `visKeepTimes` are `m_piercing`'s three lists (`CPiercing::Serialize`); a `keepTime`
   * other than 0 brings the time left; a `petName` brings a pet (`CPet::Serialize`).
   */
  interface ItemExtras {
    serialNumber?: number;
    text?: string;
    hitPoint?: number;
    abilityOption?: number;
    resist?: number;
    resistOption?: number;
    piercing?: number[];
    ultimate?: number[];
    visKeepTimes?: number[];
    charged?: boolean;
    randomOption?: bigint;
    keepTime?: number;
    petName?: string;
    visPet?: boolean;
  }

  /**
   * One item as `CItemContainer::Serialize` stores it (`_Common/Item.h:910-911`): `ch`, the slot, then
   * `CItemElem::Serialize` (`_Common/ObjSerialize.cpp:48-89`, with `CItemBase::Serialize`, :31-38), field by field.
   */
  function itemFields(w: ArWriter, item: InventoryItem, x: ItemExtras = {}): ArWriter {
    w.u8(item.objectId) // ch
      // m_dwObjId (the slot), m_dwItemId, m_liSerialNumber (SERIALNUMBER, a DWORD), m_szItemText
      .u32(item.objectId).u32(item.itemId).u32(x.serialNumber ?? 0).string(x.text ?? '')
      .i16(item.count) // m_nItemNum (short)
      .u8(0).i32(x.hitPoint ?? 0).i32(0) // m_nRepairNumber (BYTE), m_nHitPoint (int), m_nRepair (int)
      .u8(0).i32(x.abilityOption ?? 0).u32(0) // m_byFlag (BYTE), m_nAbilityOption (int), m_idGuild (DWORD)
      // m_bItemResist (BYTE), m_nResistAbilityOption (int), m_nResistSMItemId (int)
      .u8(x.resist ?? 0).i32(x.resistOption ?? 0).i32(0);
    // m_piercing: the cards, the ultimate jewels (__EXT_PIERCING), the vis keep times (__PETVIS), each as its count
    // and then a DWORD (a time_t for the keep times, 4 bytes with _USE_32BIT_TIME_T) per entry
    for (const list of [x.piercing ?? [], x.ultimate ?? [], x.visKeepTimes ?? []]) {
      w.u32(list.length);
      for (const value of list) w.u32(value);
    }
    w.i32(x.charged === true ? 1 : 0) // m_bCharged (BOOL)
      .i64(x.randomOption ?? 0n) // m_iRandomOptItemId (__int64, __SYS_IDENTIFY)
      .u32(x.keepTime ?? 0); // m_dwKeepTime
    if ((x.keepTime ?? 0) !== 0) w.i32(86400); // time_t t, the seconds left
    if (x.petName === undefined) {
      w.u8(0); // no pet
    } else {
      // bPet, then m_nKind, m_nLevel, m_dwExp, m_wEnergy, m_wLife, m_anAvailLevel[PL_MAX], m_szName (__PET_1024)
      w.u8(1).u8(4).u8(2).u32(5000).u16(80).u16(3).bytes(Uint8Array.of(1, 2, 0, 0, 0, 0)).string(x.petName);
    }
    return w.i32(x.visPet === true ? 1 : 0); // m_bTranformVisPet (BOOL, __PETVIS)
  }

  /** `CItemContainer::Serialize` storing (`Item.h:898-922`): `m_apIndex`, the count, the items, the object indexes. */
  function inventoryFields(
    w: ArWriter, items: readonly InventoryItem[], extras: ReadonlyMap<number, ItemExtras> = new Map(),
  ): ArWriter {
    for (const v of STARTER_AP_INDEX) w.u32(v);
    w.u8(items.length); // chSize
    for (const item of items) itemFields(w, item, extras.get(item.objectId));
    for (const v of STARTER_OBJ_INDEX) w.u32(v); // adwObjIndex
    return w;
  }

  /**
   * The fields between the skill array and the inventory (`ObjSerializeOpt.cpp:239-253`, read at :569-583), with
   * values that all differ.
   */
  function beforeInventory(w: ArWriter): ArWriter {
    w.u8(3).u32(120000) // (BYTE)m_nCheerPoint, m_dwTickCheer - GetTickCount()
      .u8(2); // m_nSlot (BYTE)
    repeat(w, 3, (x, k) => x.u32(1000 * (k + 1))); // m_dwGoldBank[k]
    repeat(w, 3, (x, k) => x.u32(700 + k)); // m_idPlayerBank[k]
    return w.i32(-25) // m_nPlusMaxHitPoint (LONG)
      .u8(1).u8(2).u8(3) // m_nAttackResistLeft, m_nAttackResistRight, m_nDefenseResist (BYTEs)
      .i64(123456789012n).i32(4); // m_nAngelExp (EXPINTEGER), m_nAngelLevel (LONG) (__CSC_VER8_5)
  }

  interface SelfOptions {
    /** `m_aEquipInfo[i].dwId` (`ownEquipment` when not given). */
    equipment?: readonly number[];
    /** False ends the message after the skill array; true (the default) writes on through `own.inventory`. */
    inventory?: boolean;
    extras?: ReadonlyMap<number, ItemExtras>;
    /** Bytes standing for the banks, the pet, the pocket, the titles and the buffs, which the reader leaves alone. */
    rest?: number;
  }

  /**
   * The player's own character (METHOD_NONE, `ObjSerializeOpt.cpp:509-640`), through the 45 skill pairs, the fields up
   * to the inventory and the inventory (`own.inventory`, `[]` when null), then `rest` bytes.
   */
  function selfFields(own: OwnCharacter = veteran, options: SelfOptions = {}): Uint8Array {
    const w = objectHead(11, 100, 0, PLAYER)
      .u16(0x15).u8(1).i32(500).u32(0x1).u32(0).u8(0).u32(NULL_ID);
    playerCommon(w, 'Hero', false, false, [own.str, own.sta, own.dex, own.int])
      .u16(own.manaPoint).u16(own.fatiguePoint) // (u_short)m_nManaPoint, (u_short)m_nFatiguePoint
      .i32(0) // m_nTutorialState (__VER >= 12)
      .i32(0).u32(123456) // m_nFxp, dwGold
      // m_nExp1, m_nSkillLevel, m_nSkillPoint, m_nDeathExp, m_nDeathLevel
      .i64(own.exp).i32(own.skillLevel).i32(own.skillPoint).i64(own.deathExp).i32(own.deathLevel);
    repeat(w, MAX_JOB, (x) => x.u32(0)) // dwJobLv[MAX_JOB]
      .u32(1).vec3([1, 2, 3]) // m_idMarkingWorld, m_vMarkingPos
      // m_nQuestSize (BYTE), then sizeof(QUEST) = 12 bytes each: m_nState, a pad byte, m_wTime, m_wId,
      // m_nKillNPCNum[2], the flag bits and a pad byte.
      .u8(2)
      .u8(1).u8(0).u16(0).u16(51).u16(3).u16(0).u8(0).u8(0)
      .u8(14).u8(0).u16(600).u16(77).u16(0).u16(0).u8(1).u8(0)
      .u8(1).u16(40) // m_nCompleteQuestSize, then WORDs
      .u8(1).u16(51) // m_nCheckedQuestSize (__IMPROVE_QUEST_INTERFACE), then WORDs
      .u32(0) // m_idMurderer
      .i16(own.remainGP).i16(0); // (short)m_nRemainGP, (short)0
    for (const id of options.equipment ?? ownEquipment) w.u32(id); // m_aEquipInfo[i].dwId
    for (const slot of own.skills) w.u32(slot.skill).u32(slot.level); // m_aJobSkill[i]: dwSkill, dwLevel
    if (options.inventory ?? true) inventoryFields(beforeInventory(w), own.inventory ?? [], options.extras);
    // The banks, the pet, the pocket and the rest, which the reader leaves alone.
    return w.bytes(new Uint8Array(options.rest ?? 50).fill(0xcd)).toBytes();
  }

  /** The own character's mover, as the reader gives it back from `selfFields` and `writeAddSelf` takes it. */
  function selfMover(own: OwnCharacter, equipment: readonly number[] = ownEquipment): AddedMover {
    return {
      index: 11, scale: 1, pos, angle: 0, objectId: PLAYER,
      motion: 0x15, isPlayer: true, hitPoint: 500, state: 0x1, stateFlag: 0, belligerence: 0, sfxId: NULL_ID,
      player: {
        ...playerBase, sta: own.sta, dex: own.dex, self: true, own, shopTitle: '', worn: [], equipmentObjectIds: [...equipment],
      },
    };
  }

  function selfOf(own: OwnCharacter, equipment?: readonly number[]): WorldMessage {
    return { type: 'addMover', mover: selfMover(own, equipment) };
  }

  function ownOf(message: WorldMessage): OwnCharacter | null | undefined {
    return message.type === 'addMover' ? message.mover.player?.own : undefined;
  }

  /** The bytes of the own ADD_OBJ up to its skill array, then the fields up to the inventory and what `write` adds. */
  function afterSkills(write: (w: ArWriter) => void): Uint8Array {
    const w = new ArWriter().bytes(selfFields(newCharacter, { inventory: false, rest: 0 }));
    write(beforeInventory(w));
    return w.toBytes();
  }

  const self = selfOf(veteran);

  it("reads the player's own character through its inventory and skips the rest", () => {
    const own = readOne(PLAYER, selfFields());
    expect(own).toMatchObject(self);
    // No worn parts: the 31 IDs are the inventory's object IDs, kept apart from item IDs.
    const player = own.type === 'addMover' ? own.mover.player : undefined;
    expect(player?.worn).toEqual([]);
    expect(player?.equipmentObjectIds).toHaveLength(MAX_HUMAN_PARTS);
    expect(player?.equipmentObjectIds).toEqual(ownEquipment);
    // the own quest lists (ObjSerializeOpt.cpp:509-549), as `selfFields` writes them
    expect(player?.own?.quests).toEqual([
      { id: 51, state: 1, time: 0, kills: [3, 0], patrol: false, dialog: false },
      { id: 77, state: 14, time: 600, kills: [0, 0], patrol: true, dialog: false },
    ]);
    expect([player?.own?.completedQuests, player?.own?.checkedQuests]).toEqual([[40], [51]]);
    // Without the table the reader has to stop the bundle there; with it the next message is still read.
    expect(readOne(PLAYER, selfFields(), false)).toMatchObject(self);
    const result = readBundle(body([
      { objectId: PLAYER, type: MessageType.ADD_OBJ, fields: selfFields() },
      { objectId: OTHER, type: MessageType.ADD_OBJ, fields: otherPlayerFields().toBytes() },
    ]), WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.objectId)).toEqual([PLAYER, OTHER]);
  });

  it('the own ADD_OBJ keeps the numbers and skills', () => {
    const message = readOne(PLAYER, selfFields(newCharacter));
    const own = message.type === 'addMover' ? message.mover.player?.own : undefined;
    expect(own).toMatchObject(newCharacter);
    expect(own).toMatchObject({
      str: 15, sta: 15, dex: 15, int: 15, manaPoint: 63, fatiguePoint: 32, exp: 0n, skillLevel: 0, skillPoint: 0,
      deathExp: 0n, deathLevel: 0, remainGP: 0,
    });
    // Slot by slot, as the fixture fills them (not a new character's skills): 45 of them, the first three skills, the
    // four SI_GEN_EVE_* IDs, then the empty slots.
    expect(own?.skills).toHaveLength(MAX_SKILL_JOB);
    expect(own?.skills.slice(0, 3)).toEqual([
      { skill: 1, level: 0 }, { skill: 2, level: 1 }, { skill: 3, level: 2 },
    ]);
    expect(own?.skills.slice(3, 7)).toEqual(SI_GEN_EVE.map((skill) => ({ skill, level: 0 })));
    expect(own?.skills.slice(7)).toEqual(
      Array.from({ length: MAX_SKILL_JOB - 7 }, () => ({ skill: NULL_ID, level: 0 })),
    );
  });

  it('keeps the numbers at the width and the sign the C++ types read them', () => {
    // The stats and the mana and fatigue points are WORDs (`(u_short&)`), the skill pairs DWORDs, the EXP and the
    // death EXP an __int64, the stat points a `short`.
    const message = readOne(PLAYER, selfFields(veteran));
    const own = message.type === 'addMover' ? message.mover.player?.own : undefined;
    expect(own).toMatchObject({ sta: 65535, manaPoint: 65535, exp: 9876543210n, deathExp: -5n, remainGP: -2 });
    expect(own?.skills[1]).toEqual({ skill: 4, level: 0xffffffff });
    expect(own?.skills[2]).toEqual({ skill: 0xfffffffe, level: 19 });
    // ch is a BYTE, m_dwItemId a DWORD, m_nItemNum a short.
    expect(own?.inventory).toEqual([
      { objectId: 7, itemId: 0xfffffffe, count: -2 }, { objectId: 72, itemId: 4805, count: 32767 },
    ]);
  });

  it('the own inventory is read', () => {
    const starter = selfMover(newCharacter, STARTER_EQUIPMENT);
    // The testkit's writeAddSelf, with and without the table of contents.
    for (const indexed of [true, false]) {
      expect(readOne(PLAYER, writeAddSelf(PLAYER, starter).fields, indexed))
        .toMatchObject({ type: 'addMover', mover: starter });
    }
    // The same inventory written by hand, every field as `CItemElem::Serialize` stores it, with the row's `m_apIndex`,
    // object indexes and hit points: the reader keeps the same three values of each item.
    const byHand = selfFields(newCharacter, { equipment: STARTER_EQUIPMENT, extras: STARTER_EXTRAS });
    const own = ownOf(readOne(PLAYER, byHand));
    expect(own?.inventoryError).toBeNull();
    expect(own?.inventory).toEqual([
      { objectId: 0, itemId: 502, count: 1 }, { objectId: 1, itemId: 2801, count: 1 },
      { objectId: 2, itemId: 4805, count: 5 }, { objectId: 42, itemId: 506, count: 1 },
      { objectId: 43, itemId: 510, count: 1 }, { objectId: 44, itemId: 21, count: 1 },
      { objectId: 45, itemId: 2800, count: 3 },
    ]);
    // An empty inventory (`chSize` 0) is [], not null.
    const empty = ownOf(readOne(PLAYER, selfFields({ ...newCharacter, inventory: [] })));
    expect(empty).toMatchObject({ inventory: [], inventoryError: null });
  });

  it('reads past every field of an item: piercing, random option, keep time, pet', () => {
    const pierced: InventoryItem = { objectId: 10, itemId: 3001, count: 1 };
    const after: InventoryItem = { objectId: 11, itemId: 2801, count: 9 };
    const extras = new Map<number, ItemExtras>([[10, {
      serialNumber: 0x01020304, text: 'Kyle', hitPoint: 7, piercing: [7001, 7002, 0], ultimate: [9001],
      visKeepTimes: [3600, 7200], charged: true, randomOption: 0x0123456789abcdefn, keepTime: 1700000000,
      petName: 'Rex', visPet: true,
    }]]);
    const own = ownOf(readOne(PLAYER, selfFields({ ...newCharacter, inventory: [pierced, after] }, { extras })));
    // The item after it is read from where the first one ends.
    expect(own).toMatchObject({ inventory: [pierced, after], inventoryError: null });
  });

  it('keeps what the item tooltip shows: the upgrade, the element, the sockets, the awakening (2026-11-05)', () => {
    const sword: InventoryItem = { objectId: 10, itemId: 3001, count: 1 };
    const extras = new Map<number, ItemExtras>([[10, {
      abilityOption: 7, resist: 2, resistOption: 5, piercing: [7001, 0, 0], ultimate: [9001], randomOption: 0x0123456789abcdefn,
    }]]);
    const own = ownOf(readOne(PLAYER, selfFields({ ...newCharacter, inventory: [sword] }, { extras })));
    expect(own?.inventory).toEqual([{
      ...sword, abilityOption: 7, resist: 2, resistOption: 5, piercing: [7001, 0, 0], ultimate: [9001], randomOption: 0x0123456789abcdefn,
    }]);
  });

  it('a slot listed twice holds the later item, and an item ID of 0 empties its slot, as m_apItem[ch] does', () => {
    const own = ownOf(readOne(PLAYER, selfFields({
      ...newCharacter,
      inventory: [
        { objectId: 3, itemId: 2801, count: 1 }, { objectId: 4, itemId: 2800, count: 2 },
        { objectId: 3, itemId: 4805, count: 5 }, { objectId: 4, itemId: 0, count: 1 },
      ],
    })));
    expect(own).toMatchObject({ inventory: [{ objectId: 3, itemId: 4805, count: 5 }], inventoryError: null });
  });

  it('a broken inventory still gives the numbers', () => {
    // The starter character's message cut 30 bytes before the end of its third item: the four items after it and the
    // 73 object indexes are missing. The message ends on its boundary all the same and is kept.
    const whole = selfFields(newCharacter, { rest: 0 });
    const itemSize = itemFields(new ArWriter(), STARTER_INVENTORY[3]).toBytes().byteLength;
    const cut = whole.subarray(0, whole.byteLength - 4 * INVENTORY_SLOTS - 4 * itemSize - 30);
    const broken = { ...newCharacter, inventory: null, inventoryError: expect.any(String) };
    for (const indexed of [true, false]) {
      // Without the table the message is the end of the bundle, and the reader runs out the same way.
      const result = readAdd(PLAYER, cut, indexed);
      expect(result.mismatched).toEqual([]);
      expect(result.stoppedAt).toBeNull();
      expect(result.messages).toHaveLength(1);
      const own = ownOf(result.messages[0].value);
      expect(own).toEqual({ ...broken, gold: 123456, quests: expect.any(Array), completedQuests: [40], checkedQuests: [51] });
      expect(own?.inventoryError).toMatch(/^item 3 of 7: need \d+ bytes but only \d+ remain at offset \d+$/);
    }

    const errorOf = (fields: Uint8Array): string | null | undefined => {
      const result = readAdd(PLAYER, fields);
      expect(result.mismatched).toEqual([]);
      const own = ownOf(result.messages[0].value);
      // Task 3's numbers and skills are all there.
      expect(own).toEqual({ ...broken, gold: 123456, quests: expect.any(Array), completedQuests: [40], checkedQuests: [51] });
      return own?.inventoryError;
    };
    const indexes = (w: ArWriter): void => {
      for (let i = 0; i < INVENTORY_SLOTS; i++) w.u32(i < MAX_INVENTORY ? i : NULL_ID);
    };
    // Nothing after the skill array: the cheer point is missing.
    expect(errorOf(selfFields(newCharacter, { inventory: false, rest: 0 })))
      .toMatch(/^before the inventory: need 1 bytes but only 0 remain/);
    // More items than the 73 slots (the storing side writes one per filled slot).
    expect(errorOf(afterSkills((w) => {
      indexes(w);
      w.u8(INVENTORY_SLOTS + 1);
    }))).toMatch(/^the inventory: 74 items, more than its 73 slots at offset \d+$/);
    // A slot past the last (m_apItem[ch] would write outside the array).
    expect(errorOf(afterSkills((w) => {
      indexes(w);
      itemFields(w.u8(1), { objectId: INVENTORY_SLOTS, itemId: 2801, count: 1 });
      indexes(w);
    }))).toMatch(/^item 1 of 1: slot 73 is outside the inventory's 73 slots at offset \d+$/);
    // An item text longer than `ReadString( m_szItemText, 32 )` holds.
    expect(errorOf(afterSkills((w) => {
      indexes(w);
      itemFields(w.u8(1), { objectId: 0, itemId: 2801, count: 1 }, { text: 'x'.repeat(32) });
      indexes(w);
    }))).toMatch(/^item 1 of 1: string length 32 is outside 0\.\.31/);
  });

  it("another player's ADD_OBJ has no own character and still ends on the boundary", () => {
    const message = readOne(OTHER, otherPlayerFields().toBytes());
    expect(message.type === 'addMover' ? message.mover.player?.own : undefined).toBeNull();
  });

  it('an own ADD_OBJ whose skill array is cut short or missing is a mismatch', () => {
    const skillsOnly = { inventory: false, rest: 0 };
    // 44 pairs and nothing after them: the 45th pair is missing.
    expect(readAdd(PLAYER, selfFields({ ...veteran, skills: veteran.skills.slice(0, 44) }, skillsOnly)).mismatched)
      .toEqual([MessageType.ADD_OBJ]);
    // Cut in the middle of the 45th pair.
    expect(readAdd(PLAYER, selfFields(veteran, skillsOnly).subarray(0, -3)).mismatched).toEqual([MessageType.ADD_OBJ]);
    // Piece 3's own ADD_OBJ, which ended on the equipment IDs.
    expect(readAdd(PLAYER, selfFields({ ...veteran, skills: [] }, skillsOnly)).mismatched)
      .toEqual([MessageType.ADD_OBJ]);
    // Task 3's, which ended on the skill array, is kept: only its inventory is missing.
    expect(readAdd(PLAYER, selfFields(veteran, skillsOnly)).mismatched).toEqual([]);
    // The whole inventory and nothing after it is fine: the rest is skipped, whatever its length.
    expect(readAdd(PLAYER, selfFields(veteran, { rest: 0 })).mismatched).toEqual([]);
  });

  it("chooses the own character's fields by the object ID, as OnAddObj's SetMethod does", () => {
    // Read as another player's, the mana and fatigue points become the length of a shop title that is not there.
    expect(readAdd(OTHER, selfFields()).mismatched).toEqual([MessageType.ADD_OBJ]);
    // And another player's message read as the own character's runs out of bytes.
    expect(readAdd(PLAYER, otherPlayerFields().toBytes()).mismatched).toEqual([MessageType.ADD_OBJ]);
  });

  it('unknown objects are skipped and malformed item objects are bounded', () => {
    // dwObjType, dwObjIndex, then whatever CItem::Serialize writes, which the reader skips.
    const fields = new ArWriter().u8(OT_ITEM).u32(21).u8(OT_ITEM).u32(21).u16(100).vec3(pos).i16(0).u32(0x5001)
      .bytes(new Uint8Array(40).fill(0xab)).toBytes();
    expect(readAdd(0x5001, fields).mismatched).toEqual([MessageType.ADD_OBJ]);
    expect(readOne(0x5001, new ArWriter().u8(0).u32(1).toBytes())).toEqual({ type: 'addOther', objectType: 0 });
  });

  it('drops an ADD_OBJ with a byte more or a byte less than OnAddObj reads', () => {
    for (const [objectId, fields] of [
      [OTHER, otherPlayerFields().toBytes()],
      [0x3001, objectHead(20, 100, 0, 0x3001).u16(0).u8(0).i32(1).u32(1).u32(0).u8(1).u32(0)
        .u8(0).u32(0).u8(0).string('').u8(0).u8(1).u8(0).u8(0).i32(0).f32(1).u32(1).u16(1).u16(2).u32(3).u32(4)
        .toBytes()],
    ] as const) {
      expect(readOne(objectId, fields)).toMatchObject({ type: 'addMover' });
      const longer = new Uint8Array(fields.byteLength + 1);
      longer.set(fields);
      expect(readAdd(objectId, longer).mismatched).toEqual([MessageType.ADD_OBJ]);
      expect(readAdd(objectId, fields.subarray(0, fields.byteLength - 1)).mismatched).toEqual([MessageType.ADD_OBJ]);
    }
  });
});
