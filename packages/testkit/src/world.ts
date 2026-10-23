import { ArWriter, BUNDLE_MARKER, MessageType, NULL_ID, ObjectType, ProtocolError } from '@flyffweb/protocol';
import type { AddedMover, AddedNpc, AddedPlayer, MoveReport, Vec3 } from '@flyffweb/protocol';

/** One message of a scripted bundle. `fields` are the bytes after the object ID and the type, built by the caller. */
export interface ScriptMessage {
  objectId: number;
  type: number;
  fields: Uint8Array;
}

/** The count is an `i16` (`short cb` in `CSnapshot`), so a bundle holds at most this many messages. */
const MAX_MESSAGES = 0x7fff;
/** Bytes of a message before its fields: the object ID (`u32`) and the type (`u16`). */
const MESSAGE_HEAD_SIZE = 6;

/**
 * Builds the body of a JOIN or SNAPSHOT the way the world server sends it (`CUser::Notify`,
 * `WORLDSERVER/User.cpp:585`, behind the world-snapshot-index patch): the packet type (`u32`), the player's
 * object ID (`u32`), the count (`i16`), then per message its object ID (`u32`), its type (`u16`) and its fields.
 * With `index` (the default) the table of contents follows the last message: each message's start counted from
 * byte 10 (`u32`), the count again (`u16`) and `BUNDLE_MARKER` (`u32`). `index: false` writes what an unpatched
 * world server sends, which the browser can only read in order.
 */
export function encodeBundle(
  packetType: number,
  playerObjectId: number,
  messages: readonly ScriptMessage[],
  options: { index?: boolean } = {},
): Uint8Array {
  if (messages.length > MAX_MESSAGES) {
    throw new ProtocolError(`a bundle holds at most ${MAX_MESSAGES} messages, not ${messages.length}`);
  }
  const w = new ArWriter().u32(packetType).u32(playerObjectId).u16(messages.length);
  const starts: number[] = [];
  let start = 0;
  for (const m of messages) {
    starts.push(start);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    start += MESSAGE_HEAD_SIZE + m.fields.byteLength;
  }
  if (options.index ?? true) {
    for (const s of starts) w.u32(s);
    w.u16(messages.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}

// The world server's side of each message the browser reads: the fields in the order the server writes them
// (`WORLDSERVER/User.cpp`), which is the order of the matching `CDPClient::On*` reader. `objectId` is the object
// the message is about (`GETID( pMover )`).

function scripted(objectId: number, type: number, fields: ArWriter): ScriptMessage {
  return { objectId, type, fields: fields.toBytes() };
}

/** The fields `CUserMng::AddMoverMoved` (`WORLDSERVER/User.cpp:4877`) and `AddMoverBehavior` (:4895) write. */
function moveFields(m: MoveReport): ArWriter {
  return new ArWriter().vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state).u32(m.stateFlag).u32(m.motion)
    .i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick);
}

/** MOVERMOVED: `CUserMng::AddMoverMoved` (`WORLDSERVER/User.cpp:4877`). */
export function writeMoverMoved(objectId: number, move: MoveReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERMOVED, moveFields(move));
}

/** MOVERBEHAVIOR: `CUserMng::AddMoverBehavior` (`WORLDSERVER/User.cpp:4895`). */
export function writeMoverBehavior(objectId: number, move: MoveReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERBEHAVIOR, moveFields(move));
}

/** MOVERANGLE: `CUserMng::AddMoverAngle` (`WORLDSERVER/User.cpp:4952`). */
export function writeMoverAngle(
  objectId: number, pos: Vec3, delta: Vec3, angle: number, angleX: number, accPower: number, turnAngle: number,
  tick: bigint,
): ScriptMessage {
  return scripted(
    objectId, MessageType.MOVERANGLE,
    new ArWriter().vec3(pos).vec3(delta).f32(angle).f32(angleX).f32(accPower).f32(turnAngle).i64(tick),
  );
}

/** DESTPOS: `CUserMng::AddSetDestPos` (`WORLDSERVER/User.cpp:4743`, without the `__IAOBJ0622` object ID). */
export function writeDestPos(objectId: number, pos: Vec3, forward: boolean): ScriptMessage {
  return scripted(objectId, MessageType.DESTPOS, new ArWriter().vec3(pos).u8(forward ? 1 : 0));
}

/** DESTANGLE: `CUserMng::AddSetDestAngle` (`WORLDSERVER/User.cpp:4778`). */
export function writeDestAngle(objectId: number, angle: number, left: boolean): ScriptMessage {
  return scripted(objectId, MessageType.DESTANGLE, new ArWriter().f32(angle).u8(left ? 1 : 0));
}

/** MOVERSETDESTOBJ: `CUserMng::AddMoverSetDestObj` (`WORLDSERVER/User.cpp:4792`). */
export function writeSetDestObj(objectId: number, targetId: number, range: number): ScriptMessage {
  return scripted(objectId, MessageType.MOVERSETDESTOBJ, new ArWriter().u32(targetId).f32(range));
}

/** MOTION: `CUserMng::AddMotion` (`WORLDSERVER/User.cpp:4430`); `message` is an `OBJMSG`. */
export function writeMotion(objectId: number, message: number): ScriptMessage {
  return scripted(objectId, MessageType.MOTION, new ArWriter().u32(message));
}

/** SETPOS: `CUserMng::AddSetPos` (`WORLDSERVER/User.cpp:4678`). */
export function writeSetPos(objectId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.SETPOS, new ArWriter().vec3(pos));
}

/** SETPOSANGLE: `CUserMng::AddSetPosAngle` (`WORLDSERVER/UserLux.cpp:333`). */
export function writeSetPosAngle(objectId: number, pos: Vec3, angle: number): ScriptMessage {
  return scripted(objectId, MessageType.SETPOSANGLE, new ArWriter().vec3(pos).f32(angle));
}

/** DEL_OBJ: `CUser::AddRemoveObj` (`WORLDSERVER/User.h:251`), which is `AddHdr` (`User.cpp:654`): no fields. */
export function writeDelObj(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.DEL_OBJ, new ArWriter());
}

/** WORLD_READINFO: `CUser::AddWorldReadInfo` (`WORLDSERVER/User.cpp:8635`). */
export function writeWorldReadInfo(objectId: number, worldId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.WORLD_READINFO, new ArWriter().u32(worldId).vec3(pos));
}

/**
 * REPLACE: `CUser::AddReplace` (`WORLDSERVER/User.cpp:723`). The server writes `NULL_ID` as the object ID; the
 * script passes whatever it wants there.
 */
export function writeReplace(objectId: number, worldId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.REPLACE, new ArWriter().u32(worldId).vec3(pos));
}

/**
 * ENVIRONMENTALL: `CUser::AddEnvironmentSetting` (`WORLDSERVER/User.cpp:1576-1584`, `__ENVIRONMENT_EFFECT` on), the
 * first message of the JOIN bundle: `CEnvironment::GetSeason()`, an `int` (`SEASON_*`).
 */
export function writeEnvironmentSetting(objectId: number, season: number): ScriptMessage {
  return scripted(objectId, MessageType.ENVIRONMENTALL, new ArWriter().i32(season));
}

/** `SNAPSHOTTYPE_GAMETIMER` (`_Network/MsgHdr.h:1057`): a message type the browser has no reader for. */
export const GAMETIMER = 0x0096;

/**
 * GAMETIMER: `CUser::AddGameTimer` (`WORLDSERVER/User.cpp:1210-1218`), the `double` game time, which `CUser::Open` sends
 * right after the own ADD_OBJ (:327). The browser does not read it: a script puts it where the real server puts the
 * messages nothing reads.
 */
export function writeGameTimer(objectId: number, time: number): ScriptMessage {
  const fields = new Uint8Array(8);
  new DataView(fields.buffer).setFloat64(0, time, true);
  return { objectId, type: GAMETIMER, fields };
}

// ADD_OBJ: `CUser::AddAddObj` (`WORLDSERVER/User.cpp:664`) and the storing side of `CMover::Serialize`
// (`_Common/ObjSerializeOpt.cpp:97`). The fields the browser does not keep are written as a mover with nothing
// in them would have them: no guild, no party, no pet, no buffs, zero stats.

/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`), `SM_MAX` (`_Network/CmnHdr.h:503`), `MAX_JOB` (`defineJob.h:90`). */
const MAX_HUMAN_PARTS = 31;
const SM_MAX = 26;
const MAX_JOB = 32;

/**
 * `AddAddObj` writes `(BYTE)pCtrl->GetType() << pCtrl->GetIndex()` in front of `Serialize`; then `CObj::Serialize`
 * (`ObjSerializeOpt.cpp:22-31`: the type and index again, `(u_short)( m_vScale.x * 100.0f )`, `m_vPos`,
 * `(short)( m_fAngle * 10.0f )`, both products in float and cut towards zero), `CCtrl::Serialize`
 * (`ObjSerialize.cpp:21`) and the shared part of `CMover::Serialize` (:104-111).
 */
function moverStart(m: AddedMover): ArWriter {
  return new ArWriter()
    .u8(ObjectType.MOVER).u32(m.index)
    .u8(ObjectType.MOVER).u32(m.index)
    .u16(Math.trunc(Math.fround(Math.fround(m.scale) * 100)))
    .vec3(m.pos)
    .i16(Math.trunc(Math.fround(Math.fround(m.angle) * 10)))
    .u32(m.objectId)
    .u16(m.motion).u8(m.isPlayer ? 1 : 0).i32(m.hitPoint).u32(m.state).u32(m.stateFlag).u8(m.belligerence)
    .u32(m.sfxId);
}

/** The player part every method writes (`ObjSerializeOpt.cpp:115-196`). */
function playerStart(m: AddedMover, p: AddedPlayer): ArWriter {
  const w = moverStart(m)
    .string(p.name).u8(p.sex).u8(p.skinSet).u8(p.hairMesh).u32(p.hairColor).u8(p.headMesh).u32(p.playerId).u8(p.job)
    .u16(0).u16(0).u16(0).u16(0) // m_nStr, m_nSta, m_nDex, m_nInt
    .u16(p.level)
    .i32(0).i32(0) // m_nFuel, m_tmAccFuel
    .u8(0) // m_idGuild > 0 is false: no guild and war IDs follow
    .u32(0) // m_idGuildCloak
    .u8(0) // m_idparty > 0 is false
    .u8(p.authorization).u32(p.mode).u32(p.stateMode)
    .u32(0) // no ride item
    .u32(p.pkTime).i32(p.pkValue).u32(p.pkPropensity).u32(0) // m_dwPKExp
    .i32(0).u8(0) // m_nFame, m_nDuel
    .i32(p.honor);
  for (let i = 0; i < MAX_HUMAN_PARTS; i++) w.i32(0); // m_aEquipInfo[i].nOption
  w.i32(0); // m_nGuildCombatState
  for (let i = 0; i < SM_MAX; i++) w.u32(0); // m_dwSMTime
  return w;
}

/** The NPC part (`ObjSerializeOpt.cpp:321-351`) and an empty buff list. */
function npcFields(m: AddedMover, n: AddedNpc): ArWriter {
  const w = moverStart(m).u8(n.hairMesh).u32(n.hairColor).u8(n.headMesh).string(n.characterKey).u8(n.worn.length);
  for (const part of n.worn) w.u8(part.part).u16(part.itemId);
  return w.u8(n.activeAttack).u8(n.movePattern).u8(n.moveEvent).i32(n.moveEventCount).f32(n.speedFactor)
    .u32(0); // m_buffs.Serialize: no buffs
}

function playerOf(m: AddedMover, self: boolean): AddedPlayer {
  if (!m.isPlayer || m.player === undefined) {
    throw new Error(`mover ${m.objectId} is not a player: it needs isPlayer true and a player part`);
  }
  if (m.player.self !== self) {
    throw new Error(self
      ? `mover ${m.objectId} is another player: write it with writeAddPlayer`
      : `mover ${m.objectId} is the own character: write it with writeAddSelf`);
  }
  return m.player;
}

function npcOf(m: AddedMover): AddedNpc {
  if (m.isPlayer || m.npc === undefined) {
    throw new Error(`mover ${m.objectId} is not an NPC or a monster: it needs isPlayer false and an npc part `
      + `(isPlayer is ${m.isPlayer})`);
  }
  return m.npc;
}

/**
 * ADD_OBJ of another player, as the world server writes it for anyone but that player (METHOD_EXCLUDE_ITEM,
 * `ObjSerializeOpt.cpp:278-317`): the shop title, the worn parts with their flags, no pet (`NULL_ID` and ''),
 * then no buffs. Another player has no equipment object IDs on the wire, so `equipmentObjectIds` must be `[]`.
 */
export function writeAddPlayer(objectId: number, p: AddedMover): ScriptMessage {
  const player = playerOf(p, false);
  if (player.equipmentObjectIds.length !== 0) {
    throw new Error(`mover ${p.objectId} is another player: its equipmentObjectIds must be [], not `
      + `${player.equipmentObjectIds.length} IDs`);
  }
  const w = playerStart(p, player).string(player.shopTitle).u8(player.worn.length);
  for (const part of player.worn) w.u8(part.part).u16(part.itemId).u8(part.flag);
  return scripted(objectId, MessageType.ADD_OBJ, w.u32(NULL_ID).string('').u32(0));
}

/**
 * ADD_OBJ of the player's own character (METHOD_NONE, `ObjSerializeOpt.cpp:198-236`), up to its equipment IDs:
 * `equipmentObjectIds` (one per part, the inventory's object IDs or `NULL_ID`) go in `m_aEquipInfo[i].dwId`; the
 * own character lists no worn parts, so `worn` must be `[]`. The world server goes on with the skills, the
 * inventory, the banks and the rest (:237-276), then the buffs; the browser skips all of that, so the script ends
 * the message after the equipment. The bundle's player object ID must be `objectId`, as `CUser::Open` makes it
 * (`User.cpp:315`).
 */
export function writeAddSelf(objectId: number, p: AddedMover): ScriptMessage {
  const player = playerOf(p, true);
  if (player.equipmentObjectIds.length !== MAX_HUMAN_PARTS) {
    throw new Error(`the own character needs ${MAX_HUMAN_PARTS} equipment object IDs, not `
      + `${player.equipmentObjectIds.length}`);
  }
  if (player.worn.length !== 0) {
    throw new Error(`the own character's worn parts are not on the wire: worn must be [], not `
      + `${player.worn.length} parts`);
  }
  const w = playerStart(p, player)
    .u16(0).u16(0) // (u_short)m_nManaPoint, (u_short)m_nFatiguePoint
    .i32(0).i32(0).u32(0) // m_nTutorialState, m_nFxp, dwGold
    .i64(0n).i32(0).i32(0).i64(0n).i32(0); // m_nExp1, m_nSkillLevel, m_nSkillPoint, m_nDeathExp, m_nDeathLevel
  for (let i = 0; i < MAX_JOB; i++) w.u32(0); // dwJobLv
  w.u32(0).vec3([0, 0, 0]) // m_idMarkingWorld, m_vMarkingPos
    .u8(0).u8(0).u8(0) // no quests, no completed quests, no checked quests
    .u32(0).i16(0).i16(0); // m_idMurderer, (short)m_nRemainGP, (short)0
  for (const id of player.equipmentObjectIds) w.u32(id); // m_aEquipInfo[i].dwId
  return scripted(objectId, MessageType.ADD_OBJ, w);
}

/** ADD_OBJ of a monster: to `CMover::Serialize` a monster is an NPC, so this is `writeAddNpc`. */
export function writeAddMonster(objectId: number, m: AddedMover): ScriptMessage {
  return scripted(objectId, MessageType.ADD_OBJ, npcFields(m, npcOf(m)));
}

/**
 * ADD_OBJ of an NPC (`ObjSerializeOpt.cpp:319-352`). The world server lists worn parts only for an NPC that
 * `IsEquipableNPC()`; the script writes whatever `worn` holds.
 */
export function writeAddNpc(objectId: number, n: AddedMover): ScriptMessage {
  return scripted(objectId, MessageType.ADD_OBJ, npcFields(n, npcOf(n)));
}
