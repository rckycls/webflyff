import { describe, expect, it } from 'vitest';
import { ArWriter, BUNDLE_MARKER, MessageType, NULL_ID, PacketType, WORLD_READERS, readBundle } from '../src';
import type { BundleResult, Vec3, WorldMessage } from '../src';

// The values below are copied from the C++ on purpose, so that a wrong constant in the reader shows up here.
/** `OT_ITEM` and `OT_MOVER` (`Resource/define.h:84-85`). */
const OT_ITEM = 4;
const OT_MOVER = 5;
/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`), `SM_MAX` (`_Network/CmnHdr.h:503`), `MAX_JOB` (`defineJob.h:90`). */
const MAX_HUMAN_PARTS = 31;
const SM_MAX = 26;
const MAX_JOB = 32;

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
function playerCommon(w: ArWriter, name: string, guild: boolean, party: boolean): ArWriter {
  w.string(name).u8(1).u8(2).u8(3).u32(0xff112233).u8(4) // name, sex, skin set, hair mesh, hair colour, head mesh
    .u32(777).u8(9) // m_idPlayer, m_nJob
    .u16(15).u16(16).u16(17).u16(18).u16(65) // str, sta, dex, int, level
    .i32(-1).i32(0); // m_nFuel, m_tmAccFuel
  if (guild) w.u8(1).u32(42).u32(3); else w.u8(0); // m_idGuild, m_idWar
  w.u32(42); // m_idGuildCloak
  if (party) w.u8(1).u32(9).u32(0); else w.u8(0); // m_idparty, m_idDuelParty
  w.u8(0x46).u32(0x10).u32(0x20).u32(0) // (char)m_dwAuthorization, m_dwMode, m_dwStateMode, m_dwUseItemId
    .u32(5000).i32(3).u32(100).u32(7) // m_dwPKTime, m_nPKValue, m_dwPKPropensity, m_dwPKExp
    .i32(12).u8(0).i32(6); // m_nFame, m_nDuel, m_nHonor
  repeat(w, MAX_HUMAN_PARTS, (x, i) => x.i32(i)); // m_aEquipInfo[i].nOption
  w.i32(0); // m_nGuildCombatState
  return repeat(w, SM_MAX, (x, i) => x.u32(i * 1000)); // m_dwSMTime
}

/** What every player value below shares; `worn`, `equipmentObjectIds` and `shopTitle` are set per test. */
const playerBase = {
  name: 'Hero', sex: 1, skinSet: 2, hairMesh: 3, hairColor: 0xff112233, headMesh: 4, playerId: 777, job: 9, level: 65,
  authorization: 0x46, mode: 0x10, stateMode: 0x20, pkTime: 5000, pkValue: 3, pkPropensity: 100, honor: 6,
};

/** Another player (METHOD_EXCLUDE_ITEM): `OnAddObj` sees an object ID that is not `g_pPlayer`'s. */
function otherPlayerFields(): ArWriter {
  const w = objectHead(11, 100, 905, OTHER)
    // m_dwMotion, m_bPlayer, m_nHitPoint, state, state flag, m_dwBelligerence, m_dwMoverSfxId
    .u16(0x15).u8(1).i32(1234).u32(0x11).u32(0x2).u8(0).u32(NULL_ID);
  playerCommon(w, 'Hero', true, true)
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
          ...playerBase, self: false, shopTitle: 'Cheap swords', equipmentObjectIds: [],
          worn: [
            { part: 2, itemId: 500, flag: 0 }, { part: 10, itemId: 21, flag: 1 }, { part: 27, itemId: 4100, flag: 0 },
          ],
        },
      },
    });
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

  /** The player's own character (METHOD_NONE), through the equipment IDs, then 50 bytes standing for the rest. */
  function selfFields(): Uint8Array {
    const w = objectHead(11, 100, 0, PLAYER)
      .u16(0x15).u8(1).i32(500).u32(0x1).u32(0).u8(0).u32(NULL_ID);
    playerCommon(w, 'Hero', false, false)
      .u16(80).u16(60) // (u_short)m_nManaPoint, (u_short)m_nFatiguePoint
      .i32(0) // m_nTutorialState (__VER >= 12)
      .i32(0).u32(123456) // m_nFxp, dwGold
      .i64(9876543210n).i32(3).i32(4).i64(0n).i32(0); // m_nExp1, skill level, skill point, death exp, death level
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
      .i16(5).i16(0); // (short)m_nRemainGP, (short)0
    for (const id of ownEquipment) w.u32(id); // m_aEquipInfo[i].dwId
    // The skills, the inventory, the banks and the rest, which the reader leaves alone.
    return w.bytes(new Uint8Array(50).fill(0xcd)).toBytes();
  }

  const self: WorldMessage = {
    type: 'addMover',
    mover: {
      index: 11, scale: 1, pos, angle: 0, objectId: PLAYER,
      motion: 0x15, isPlayer: true, hitPoint: 500, state: 0x1, stateFlag: 0, belligerence: 0, sfxId: NULL_ID,
      player: {
        ...playerBase, self: true, shopTitle: '', worn: [], equipmentObjectIds: ownEquipment,
      },
    },
  };

  it("reads the player's own character up to its equipment and skips the rest", () => {
    const own = readOne(PLAYER, selfFields());
    expect(own).toEqual(self);
    // No worn parts: the 31 IDs are the inventory's object IDs, kept apart from item IDs.
    const player = own.type === 'addMover' ? own.mover.player : undefined;
    expect(player?.worn).toEqual([]);
    expect(player?.equipmentObjectIds).toHaveLength(MAX_HUMAN_PARTS);
    expect(player?.equipmentObjectIds).toEqual(ownEquipment);
    // Without the table the reader has to stop the bundle there; with it the next message is still read.
    expect(readOne(PLAYER, selfFields(), false)).toEqual(self);
    const result = readBundle(body([
      { objectId: PLAYER, type: MessageType.ADD_OBJ, fields: selfFields() },
      { objectId: OTHER, type: MessageType.ADD_OBJ, fields: otherPlayerFields().toBytes() },
    ]), WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.objectId)).toEqual([PLAYER, OTHER]);
  });

  it("chooses the own character's fields by the object ID, as OnAddObj's SetMethod does", () => {
    // Read as another player's, the mana and fatigue points become the length of a shop title that is not there.
    expect(readAdd(OTHER, selfFields()).mismatched).toEqual([MessageType.ADD_OBJ]);
    // And another player's message read as the own character's runs out of bytes.
    expect(readAdd(PLAYER, otherPlayerFields().toBytes()).mismatched).toEqual([MessageType.ADD_OBJ]);
  });

  it('an item object is addOther', () => {
    // dwObjType, dwObjIndex, then whatever CItem::Serialize writes, which the reader skips.
    const fields = new ArWriter().u8(OT_ITEM).u32(21).u8(OT_ITEM).u32(21).u16(100).vec3(pos).i16(0).u32(0x5001)
      .bytes(new Uint8Array(40).fill(0xab)).toBytes();
    expect(readOne(0x5001, fields)).toEqual({ type: 'addOther', objectType: OT_ITEM });
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
