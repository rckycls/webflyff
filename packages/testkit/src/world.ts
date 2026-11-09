import {
  ArWriter, AttackFlag, BUNDLE_MARKER, MAX_SHORTCUT_STRING, MAX_SKILL_JOB, MAX_SLOT_APPLET, MAX_SLOT_ITEM,
  MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, MessageType, NULL_ID, ObjectType, PacketType, ProtocolError, ShortcutKind, writeQuest,
} from '@flyffweb/protocol';
import type {
  AddedMover, AddedNpc, AddedPlayer, FlightReport, InventoryItem, MonsterRate, MoveReport, OwnCharacter, OwnQuest, PartyBlock, PetData,
  PartyRequestSide, PlayerDataRecord, Shortcut, SkillSlot, TaskBar, Vec3,
} from '@flyffweb/protocol';

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

/**
 * MOVERCORR: `CUserMng::AddMoverCorr` (`WORLDSERVER/User.cpp:4971-4993`): `v`, `vd`, `f`, the state, the state flag, the
 * motion, `nMotionEx`, `nLoop`, the motion option and the tick, as MOVERMOVED's. (The server writes none for a mover in
 * `OBJSTA_DMG_FLY`; the script writes what it is given.)
 */
export function writeMoverCorr(objectId: number, move: MoveReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERCORR, moveFields(move));
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

// The combat, number and text messages. `objectId` is the object the message is about, as the C++ writes it
// (`GETID( pMover )`, or `GetId()` for the messages to a single user).

/** MELEE_ATTACK: `CUserMng::AddMeleeAttack` (`WORLDSERVER/User.cpp:4808`); `message` is an `OBJMSG_ATK*`. */
export function writeMeleeAttack(
  objectId: number, message: number, targetId: number, param2: number, param3: number,
): ScriptMessage {
  return scripted(
    objectId, MessageType.MELEE_ATTACK, new ArWriter().u32(message).u32(targetId).i32(param2).i32(param3),
  );
}

/**
 * Piece 7 M2: MAGIC_ATTACK, `CUserMng::AddMagicAttack` (`WORLDSERVER/User.cpp:4836-4848`): another mover's wand shot,
 * `message` its `OBJMSG_ATK_MAGIC1`, then 0, 0, the charge and the missile's id.
 */
export function writeMagicAttack(objectId: number, message: number, targetId: number, power: number, sfxHitId: number): ScriptMessage {
  return scripted(
    objectId, MessageType.MAGIC_ATTACK, new ArWriter().u32(message).u32(targetId).i32(0).i32(0).i32(power).i32(sfxHitId),
  );
}

/**
 * Piece 7 M2: CREATESFXALLOW, `CUserMng::AddCreateSfxAllow` (`User.cpp:5098-5109`): another player's arrow and its hit
 * effect, the target's position + 1 m (which the client ignores) and the target.
 */
export function writeCreateSfxAllow(objectId: number, arrowXi: number, hitXi: number, pos: Vec3, targetId: number): ScriptMessage {
  return scripted(objectId, MessageType.CREATESFXALLOW, new ArWriter().u32(arrowXi).u32(hitXi).vec3(pos).i32(targetId));
}

/**
 * Piece 7 M2: DOEQUIP, `CUserMng::AddDoEquip` (snapshot 0x0006, `readEquipItem`): the item's place in the inventory,
 * the guild 0, put on or taken off, the item, option 0, flag 0 with its three bytes of padding (`EQUIP_INFO`), the part.
 */
export function writeDoEquip(objectId: number, itemObjectId: number, itemId: number, equip: boolean, part: number): ScriptMessage {
  return scripted(
    objectId, 0x0006,
    new ArWriter().u8(itemObjectId).u32(0).u8(equip ? 1 : 0).u32(itemId).i32(0).u8(0).u8(0).u8(0).u8(0).i32(part),
  );
}

/**
 * Piece 7 M2: SET_JOB_SKILL, `CUser::AddSetChangeJob` (`WORLDSERVER/User.cpp:1204+`): the new job, its
 * `MAX_SKILL_JOB` slots, and the unused `dwJobLv[MAX_JOB]`.
 */
export function writeSetJobSkill(objectId: number, job: number, skills: readonly SkillSlot[]): ScriptMessage {
  if (skills.length !== MAX_SKILL_JOB) throw new Error(`a job change carries ${MAX_SKILL_JOB} skill slots, not ${skills.length}`);
  const w = new ArWriter().i32(job);
  for (const slot of skills) w.u32(slot.skill).u32(slot.level);
  for (let i = 0; i < MAX_JOB; i++) w.u32(0);
  return scripted(objectId, MessageType.SET_JOB_SKILL, w);
}

/**
 * Piece 7 M5: a flier's fields as `CUserMng::AddMoverMoved2` (`WORLDSERVER/User.cpp`) writes them: v, vd, f, fAngleX,
 * fAccPower, fTurnAngle, the state, the flag, the motion, nMotionEx, nLoop, the option and the tick.
 */
function flightFields(m: FlightReport): ArWriter {
  return new ArWriter().vec3(m.pos).vec3(m.delta).f32(m.angle).f32(m.angleX).f32(m.accPower).f32(m.turnAngle)
    .u32(m.state).u32(m.stateFlag).u32(m.motion).i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick);
}

/** Piece 7 M5: MOVERMOVED2: the flier's report, then `BYTE nFrame` (`CDPClient::OnMoverMoved2`). */
export function writeMoverMoved2(objectId: number, move: FlightReport, frames: number): ScriptMessage {
  return scripted(objectId, MessageType.MOVERMOVED2, flightFields(move).u8(frames));
}

/** Piece 7 M5: MOVERBEHAVIOR2 (`CDPClient::OnMoverBehavior2`). */
export function writeMoverBehavior2(objectId: number, move: FlightReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERBEHAVIOR2, flightFields(move));
}

/** Piece 7 M5: MOVERCORR2 (`CDPClient::OnMoverCorr2`). */
export function writeMoverCorr2(objectId: number, move: FlightReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERCORR2, flightFields(move));
}

/** Piece 7 M5: SETFUEL (`CUser::AddSetFuel`): `int nFuel`, `int tmAccFuel`. */
export function writeSetFuel(objectId: number, fuel: number, accFuel: number): ScriptMessage {
  return scripted(objectId, MessageType.SETFUEL, new ArWriter().i32(fuel).i32(accFuel));
}

/** Piece 7 M5: MELEE_ATTACK2 (`CUserMng::AddMeleeAttack2`): the message, the target, `nParam2` and `nParam3` 0. */
export function writeMeleeAttack2(objectId: number, message: number, targetId: number): ScriptMessage {
  return scripted(objectId, MessageType.MELEE_ATTACK2, new ArWriter().u32(message).u32(targetId).i32(0).i32(0));
}

/** Piece 7 M5: SENDACTMSG (`CUserMng::AddSendActMsg`): the message, `BOOL bFly`, and three parameters. */
export function writeSendActMsg(
  objectId: number, message: number, fly: boolean, param1: number, param2: number, param3: number,
): ScriptMessage {
  return scripted(
    objectId, MessageType.SENDACTMSG,
    new ArWriter().i32(message).i32(fly ? 1 : 0).i32(param1).i32(param2).i32(param3),
  );
}

/**
 * Piece 7 M3: STATEMODE (`CUserMng::AddStateMode`, `User.cpp:5171-5209`): the mover's state mode and its flag (ON 0, OFF
 * 1, CANCEL 2), with ON the cast item's prop id.
 */
export function writeStateMode(objectId: number, mode: number, flag: number, itemId?: number): ScriptMessage {
  const w = new ArWriter().u32(mode).u8(flag);
  if (flag === 0) w.u32(itemId ?? 0);
  return scripted(objectId, MessageType.STATEMODE, w);
}

/** Piece 7 M3: RETURNSCORLL (`CUser::AddReturnScroll`, `User.cpp:6636-6645`): no body. */
export function writeReturnScrollAck(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.RETURNSCORLL, new ArWriter());
}

/**
 * Piece 7 M3: UPDATE_ITEM 0x0018 (`CUser::AddUpdateItem`, `User.cpp:1136-1150`): the inventory's (type 0) item at
 * `itemObjectId` gets `value` in its `param` (`UI_NUM` 0, the count; 0 and below remove it), and `time` (0 unless given;
 * 2026-11-09, pets B1: `UI_PETVIS_ITEM`'s minutes, `CItemUpgrade::SetPetVisItem`, `ItemUpgrade.cpp:1623`).
 */
export function writeUpdateItem(objectId: number, itemObjectId: number, param: number, value: number, time = 0): ScriptMessage {
  return scripted(objectId, 0x0018, new ArWriter().u8(0).u8(itemObjectId).u8(param).u32(value).u32(time));
}

/** Piece 7 M2: SETSKILLSTATE (`CUserMng::AddSetSkillState`): a buff on `targetId`, its whole length `time` (ms). */
export function writeSetSkillState(objectId: number, targetId: number, buffType: number, id: number, level: number, time: number): ScriptMessage {
  return scripted(objectId, MessageType.SETSKILLSTATE, new ArWriter().u32(targetId).u16(buffType).u16(id).u32(level).u32(time));
}

/** 2026-11-05: DOAPPLYUSESKILL (`CUserMng::AddDoApplySkill`): `objectId` applied `skill` at `level` to `targetId`. */
export function writeDoApplySkill(objectId: number, targetId: number, skill: number, level: number): ScriptMessage {
  return scripted(objectId, MessageType.DOAPPLYUSESKILL, new ArWriter().u32(targetId).u32(skill).u32(level));
}

/** 2026-11-05: SM_MODE (`CUser::AddSMMode`), about NULL_ID: the premium timer `type` with `seconds` left (0 ends it). */
export function writeSmMode(type: number, seconds: number): ScriptMessage {
  return scripted(0xffffffff, MessageType.SM_MODE, new ArWriter().i32(type).u32(seconds));
}

/** Piece 7 M2: SETDESTPARAM (`CUserMng::AddSetDestParam`): a live buff's `dst` raised by `adj` (`chg` -1: none set). */
export function writeSetDestParam(objectId: number, dst: number, adj: number, chg: number): ScriptMessage {
  return scripted(objectId, MessageType.SETDESTPARAM, new ArWriter().i32(dst).i32(adj).i32(chg));
}

/**
 * DAMAGE: `CUserMng::AddDamage` (`WORLDSERVER/User.cpp:4474`): the attacker, the hit and the `AF_*` flags, then the
 * victim's position and angle when the flags have `AF_FLYING`. The server writes the position exactly then, so the
 * script refuses a `fly` without the flag and the flag without a `fly`: the reader goes by the flag, and a DAMAGE
 * that disagrees with itself would be misread.
 */
export function writeDamage(
  objectId: number, attackerId: number, hit: number, flags: number, fly: { pos: Vec3; angle: number } | null = null,
): ScriptMessage {
  const flying = (flags & AttackFlag.FLYING) !== 0;
  if (fly !== null && !flying) {
    throw new Error(`a DAMAGE with a position needs AF_FLYING in its flags, not 0x${flags.toString(16)}`);
  }
  if (fly === null && flying) {
    throw new Error(`a DAMAGE with AF_FLYING (flags 0x${flags.toString(16)}) needs a position and an angle`);
  }
  const w = new ArWriter().u32(attackerId).u32(hit).u32(flags);
  if (fly !== null) w.vec3(fly.pos).f32(fly.angle);
  return scripted(objectId, MessageType.DAMAGE, w);
}

/** MOVERDEATH: `CUserMng::AddMoverDeath` (`WORLDSERVER/User.cpp:4527`); `attackerId` is `NULL_ID` for no attacker. */
export function writeMoverDeath(objectId: number, attackerId: number, message: number): ScriptMessage {
  return scripted(objectId, MessageType.MOVERDEATH, new ArWriter().u32(attackerId).u32(message));
}

/** SETPOINTPARAM: `CUserMng::AddSetPointParam` (`WORLDSERVER/User.cpp:4663`); `param` is a `DST_*`. */
export function writeSetPointParam(objectId: number, param: number, value: number): ScriptMessage {
  return scripted(objectId, MessageType.SETPOINTPARAM, new ArWriter().i32(param).i32(value));
}

/**
 * SETEXPERIENCE: `CUser::AddSetExperience` (`WORLDSERVER/User.cpp:1139`): the EXP, the level, the skill level and
 * points (in that order on the wire), the death EXP and the death level. The last two default to what the
 * C++ defaults them to (`User.h:494`): -1 and 0xffff, which Neuz reads as "no new value".
 */
export function writeSetExperience(
  objectId: number, exp: bigint, level: number, skillLevel: number, skillPoint: number, deathExp = -1n,
  deathLevel = 0xffff,
): ScriptMessage {
  return scripted(
    objectId, MessageType.SETEXPERIENCE,
    new ArWriter().i64(exp).u16(level).i32(skillLevel).i32(skillPoint).i64(deathExp).u16(deathLevel),
  );
}

/** SETLEVEL: `CUserMng::AddSetLevel` (`WORLDSERVER/User.cpp:4694`). */
export function writeSetLevel(objectId: number, level: number): ScriptMessage {
  return scripted(objectId, MessageType.SETLEVEL, new ArWriter().u16(level));
}

/** SET_GROWTH_LEARNING_POINT: `CUser::AddSetGrowthLearningPoint` (`WORLDSERVER/User.cpp:1161`): the points, then a 0. */
export function writeSetGrowthLearningPoint(objectId: number, remainGP: number): ScriptMessage {
  return scripted(objectId, MessageType.SET_GROWTH_LEARNING_POINT, new ArWriter().i32(remainGP).i32(0));
}

/** SETSTATE: `CUser::AddSetState` (`WORLDSERVER/User.cpp:2429`): the four stats, a 0, then the stat points. */
export function writeSetState(
  objectId: number, str: number, sta: number, dex: number, int: number, remainGP: number,
): ScriptMessage {
  return scripted(
    objectId, MessageType.SETSTATE, new ArWriter().i32(str).i32(sta).i32(dex).i32(int).i32(0).i32(remainGP),
  );
}

/** CORRREQ: `CUser::AddCorrReq` (`WORLDSERVER/User.cpp:2405`); `objectId` is the monster. */
export function writeCorrReq(objectId: number, pos: Vec3, attackerId: number): ScriptMessage {
  return scripted(objectId, MessageType.CORRREQ, new ArWriter().vec3(pos).u32(attackerId));
}

/** REVIVAL: `CUserMng::AddHdr( pUser, SNAPSHOTTYPE_REVIVAL )` (`User.cpp:5439`, `DPSrvr.cpp:11261`): no fields. */
export function writeRevival(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.REVIVAL, new ArWriter());
}

/** REVIVAL_TO_LODESTAR: `CUserMng::AddHdr( pUser, SNAPSHOTTYPE_REVIVAL_TO_LODESTAR )` (`DPSrvr.cpp:11357`): no fields. */
export function writeRevivalToLodestar(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.REVIVAL_TO_LODESTAR, new ArWriter());
}

/**
 * DEFINEDTEXT: `CUser::AddDefinedText( dwText, lpszFormat, ... )` (`WORLDSERVER/User.cpp:2218`) writes the text ID and
 * the formatted string (`WriteString`). Without `args` it is DEFINEDTEXT1, `CUser::AddDefinedText( dwText )` (:2264),
 * the text ID alone, as the server sends a text with no arguments.
 */
export function writeDefinedText(objectId: number, textId: number, args?: string): ScriptMessage {
  if (args === undefined) return scripted(objectId, MessageType.DEFINEDTEXT1, new ArWriter().i32(textId));
  return scripted(objectId, MessageType.DEFINEDTEXT, new ArWriter().i32(textId).string(args));
}

/** SETQUEST: `CUser::AddSetQuest` (`WORLDSERVER/User.cpp:2337`), one QUEST for the player. */
export function writeSetQuest(objectId: number, quest: OwnQuest): ScriptMessage {
  return scripted(objectId, 0x00b0, writeQuest(new ArWriter(), quest));
}

/** REMOVEQUEST: `CUser::AddCancelQuest` (-1) and `AddRemoveQuest` (0) (`User.cpp:1466`, `:1477`). */
export function writeRemoveQuest(objectId: number, kind: number, questId: number): ScriptMessage {
  return scripted(objectId, 0x003a, new ArWriter().i32(kind).u32(questId));
}

/** QUEST_CHECKED: `CUser::AddCheckedQuest` (`User.cpp:8805`), the whole checked list. */
export function writeQuestChecked(objectId: number, quests: readonly number[]): ScriptMessage {
  const w = new ArWriter().u8(quests.length);
  for (const id of quests) w.u16(id);
  return scripted(objectId, 0x8820, w);
}

/** QUERYGETDESTOBJ: `CUser::AddQueryGetDestObj` (`WORLDSERVER/User.cpp:2348`). */
export function writeQueryGetDestObj(objectId: number, fromId: number): ScriptMessage {
  return scripted(objectId, MessageType.QUERYGETDESTOBJ, new ArWriter().u32(fromId));
}

/**
 * MONSTERPROP: `CUser::AddMonsterProp` (`WORLDSERVER/User.cpp:6524`): the count, per monster its name and six rates,
 * then the count of removed names and the names. (`CUserMng::AddMonsterProp`, :5663, writes the same to everyone with
 * the object ID `NULL_ID`.)
 */
export function writeMonsterProp(
  objectId: number, rates: readonly MonsterRate[], removed: readonly string[],
): ScriptMessage {
  const w = new ArWriter().i32(rates.length);
  for (const rate of rates) {
    w.string(rate.name).i32(rate.hitPoint).i32(rate.attackPower).i32(rate.defence).i32(rate.exp).i32(rate.itemDrop)
      .i32(rate.penya);
  }
  w.i32(removed.length);
  for (const name of removed) w.string(name);
  return scripted(objectId, MessageType.MONSTERPROP, w);
}

/** A slot index the C++ arrays hold (`MAX_SLOT_*`): a whole number in `0..count-1`. */
function checkSlot(what: string, slot: number, count: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
    throw new Error(`${what} ${slot} is outside 0..${count - 1}`);
  }
}

/**
 * One shortcut as `CUserTaskBar::Serialize` writes it (`UserTaskBar.cpp:73-76`, :94-97, :114-115): the six `DWORD`s
 * (`m_dwShortcut`, `m_dwId`, `m_dwType`, `m_dwIndex`, `m_dwUserId`, `m_dwData`) and, for a chat shortcut of the applet
 * row or of an item bar, `WriteString( m_szString )`. The queue writes no string. The text of any other shortcut is not
 * on the wire, so a script that gives one has made a mistake the reader would hide, and the writer refuses it.
 */
function writeShortcut(w: ArWriter, where: string, s: Shortcut, hasText: boolean): void {
  w.u32(s.kind).u32(s.id).u32(s.type).u32(s.index).u32(s.userId).u32(s.data);
  if (!hasText) {
    if (s.text !== '') throw new Error(`${where} has a text, but a queue entry carries no text on the wire`);
    return;
  }
  if (s.kind !== ShortcutKind.CHAT) {
    if (s.text !== '') {
      throw new Error(`${where} has a text, but only a chat shortcut has a text on the wire (its kind is ${s.kind})`);
    }
    return;
  }
  if (s.text.length >= MAX_SHORTCUT_STRING) {
    throw new Error(`${where} has a text of ${s.text.length} characters: a char[${MAX_SHORTCUT_STRING}] holds at most `
      + `${MAX_SHORTCUT_STRING - 1}`);
  }
  w.string(s.text);
}

/**
 * TASKBAR: `CUser::AddTaskBar` (`WORLDSERVER/User.cpp:1232`), which is `CUserTaskBar::Serialize` storing
 * (`_Interface/UserTaskBar.cpp:63-125`): the applet count and per applet its slot and shortcut, the item count and per
 * item its bar, slot and shortcut, the queue count and per queue entry its slot and shortcut, then the action point.
 * The C++ loops skip a slot whose `m_dwShortcut` is `SHORTCUT_NONE`, so the writer leaves out the shortcuts of kind 0
 * as well; `queue[i]` is slot `i`, and an empty one in the middle leaves a gap. The entries go in the order given
 * (the server's are in slot order). A slot outside the C++ arrays, more than 5 queue entries, or a text where the
 * wire has none (or too long a one) is refused.
 */
export function writeTaskBar(objectId: number, taskBar: TaskBar): ScriptMessage {
  if (taskBar.queue.length > MAX_SLOT_QUEUE) {
    throw new Error(`the action slot holds at most ${MAX_SLOT_QUEUE} skills, not ${taskBar.queue.length}`);
  }
  const w = new ArWriter();
  const applets = taskBar.applets.filter((a) => a.shortcut.kind !== ShortcutKind.NONE);
  w.i32(applets.length);
  for (const { slot, shortcut } of applets) {
    checkSlot('applet slot', slot, MAX_SLOT_APPLET);
    w.i32(slot);
    writeShortcut(w, `applet ${slot}`, shortcut, true);
  }
  const items = taskBar.items.filter((i) => i.shortcut.kind !== ShortcutKind.NONE);
  w.i32(items.length);
  for (const { bar, slot, shortcut } of items) {
    checkSlot('item bar', bar, MAX_SLOT_ITEM_COUNT);
    checkSlot('item slot', slot, MAX_SLOT_ITEM);
    w.i32(bar).i32(slot);
    writeShortcut(w, `item bar ${bar} slot ${slot}`, shortcut, true);
  }
  const queue = taskBar.queue.map((shortcut, slot) => ({ slot, shortcut }))
    .filter((q) => q.shortcut.kind !== ShortcutKind.NONE);
  w.i32(queue.length);
  for (const { slot, shortcut } of queue) {
    w.i32(slot);
    writeShortcut(w, `action slot ${slot}`, shortcut, false);
  }
  w.i32(taskBar.actionPoint);
  return scripted(objectId, MessageType.TASKBAR, w);
}

// The skill messages. `objectId` is the object the message is about, as the C++ writes it.

/**
 * USESKILL: `CUserMng::AddUseSkill` (`WORLDSERVER/User.cpp:4540`): the skill's `SI_*` ID and level, the target's object
 * ID, the use type (`SUT_NORMAL` 0, `SUT_QUEUESTART` 1, `SUT_QUEUEING` 2) and the casting time (1 for a `KT_SKILL`);
 * `objectId` is the caster.
 */
export function writeUseSkill(
  objectId: number, skill: number, level: number, targetId: number, useType: number, castingTime: number,
): ScriptMessage {
  return scripted(
    objectId, MessageType.USESKILL, new ArWriter().u32(skill).u32(level).u32(targetId).i32(useType).i32(castingTime),
  );
}

/** CLEAR_USESKILL: `CUser::AddHdr( GETID( pUser ), SNAPSHOTTYPE_CLEAR_USESKILL )` (`DPSrvrLux.cpp:96`): no fields. */
export function writeClearUseSkill(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.CLEAR_USESKILL, new ArWriter());
}

/**
 * DOUSESKILLPOINT: `CUser::AddDoUseSkillPoint` (`WORLDSERVER/User.cpp:6566`): the 45 `dwSkill`, `dwLevel` pairs, then
 * the skill points. The array is the 45 slots of `m_aJobSkill` (or what the browser sent, for a spend); any other length
 * is refused, as the reader reads 45 pairs and would misread the rest.
 */
export function writeDoUseSkillPoint(
  objectId: number, skills: readonly SkillSlot[], skillPoint: number,
): ScriptMessage {
  if (skills.length !== MAX_SKILL_JOB) {
    throw new Error(`a DOUSESKILLPOINT needs ${MAX_SKILL_JOB} skill slots, not ${skills.length}`);
  }
  const w = new ArWriter();
  for (const slot of skills) w.u32(slot.skill).u32(slot.level);
  return scripted(objectId, MessageType.DOUSESKILLPOINT, w.i32(skillPoint));
}

/** INITSKILLPOINT: `CUser::AddInitSkill` (`WORLDSERVER/User.cpp:6554`): `m_nSkillPoint`. */
export function writeInitSkillPoint(objectId: number, skillPoint: number): ScriptMessage {
  return scripted(objectId, MessageType.INITSKILLPOINT, new ArWriter().i32(skillPoint));
}

/**
 * SETACTIONPOINT: `CUser::AddSetActionPoint` (`WORLDSERVER/UserLux.cpp:206`): the action points. The server writes
 * `NULL_ID` as the object ID; the script passes whatever it wants there.
 */
export function writeSetActionPoint(objectId: number, actionPoint: number): ScriptMessage {
  return scripted(objectId, MessageType.SETACTIONPOINT, new ArWriter().i32(actionPoint));
}

/** ENDSKILLQUEUE: `CUserTaskBar::OnEndSkillQueue` (`_Interface/UserTaskBar.cpp:190`) through `AddHdr`: no fields. */
export function writeEndSkillQueue(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.ENDSKILLQUEUE, new ArWriter());
}

/**
 * CREATESFXOBJ: `CUserMng::AddCreateSfxObj` (`WORLDSERVER/User.cpp:5016`): the effect, a position, then `bFlag` (a
 * `BOOL`). `pos` and `flag` default to what the C++ defaults them to (`User.h:864`), the origin and 0; with a position
 * of zeros the effect goes on the object the message is about, with any other it is absolute (`OnCreateSfxObj`).
 */
export function writeCreateSfxObj(objectId: number, sfxId: number, pos: Vec3 = [0, 0, 0], flag = 0): ScriptMessage {
  return scripted(objectId, MessageType.CREATESFXOBJ, new ArWriter().u32(sfxId).vec3(pos).i32(flag));
}

/** PLAYMUSIC: `CUser::AddPlayMusic` (`WORLDSERVER/User.cpp:2517-2526`), about `NULL_ID`: the music id. */
export function writePlayMusic(music: number): ScriptMessage {
  return scripted(NULL_ID, MessageType.PLAYMUSIC, new ArWriter().u32(music));
}

/** PLAYSOUND of type 0: `CUser::AddPlaySound` (`WORLDSERVER/User.cpp:2528-2538`), about `NULL_ID`: the sound id. */
export function writePlaySound(sound: number): ScriptMessage {
  return scripted(NULL_ID, MessageType.PLAYSOUND, new ArWriter().u8(0).u32(sound));
}

/** PLAYSOUND of type 1: `CUser::AddPlaySound2` (`WORLDSERVER/User.cpp:2540-2550`): a file name, for the voice option. */
export function writePlaySoundFile(name: string): ScriptMessage {
  return scripted(NULL_ID, MessageType.PLAYSOUND, new ArWriter().u8(1).string(name));
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
// in them would have them: no guild, no party, no pet, no buffs, and another player's STR and INT zero.

/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`), `SM_MAX` (`_Network/CmnHdr.h:503`), `MAX_JOB` (`defineJob.h:90`). */
const MAX_HUMAN_PARTS = 31;
const SM_MAX = 26;
const MAX_JOB = 32;
/**
 * `MAX_INVENTORY` (`_Common/ProjectCmn.h:7`), the bag's slots; with one per part, `m_Inventory`'s `m_dwItemMax`
 * (`SetItemContainer( ITYPE_ITEM, MAX_INVENTORY, MAX_HUMAN_PARTS )`, `_Common/Mover.cpp:1460`).
 */
const MAX_INVENTORY = 42;
const INVENTORY_SLOTS = MAX_INVENTORY + MAX_HUMAN_PARTS;

/**
 * What an own character without `own` is written with, a mover that has nothing yet: zero stats, MP, FP, EXP and
 * points, every skill slot empty (`dwSkill` `NULL_ID`, `dwLevel` 0, as `CMover::InitProp` leaves a slot,
 * `_Common/Mover.cpp:1478-1485`) and an empty inventory.
 */
const NO_OWN: OwnCharacter = {
  str: 0, sta: 0, dex: 0, int: 0, manaPoint: 0, fatiguePoint: 0, exp: 0n, skillLevel: 0, skillPoint: 0,
  deathExp: 0n, deathLevel: 0, remainGP: 0,
  skills: Array.from({ length: MAX_SKILL_JOB }, (): SkillSlot => ({ skill: NULL_ID, level: 0 })),
  inventory: [],
  inventoryError: null,
};

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

/**
 * The player part every method writes (`ObjSerializeOpt.cpp:115-196`). `stats` are `m_nStr`, `m_nSta`, `m_nDex` and
 * `m_nInt` (`(u_short)`, :123-126): the own character's numbers', and for another player its STA and DEX between
 * zeros, the STR and INT the browser does not keep.
 */
function playerStart(m: AddedMover, p: AddedPlayer, stats: readonly number[] = [0, p.sta, p.dex, 0]): ArWriter {
  const w = moverStart(m)
    .string(p.name).u8(p.sex).u8(p.skinSet).u8(p.hairMesh).u32(p.hairColor).u8(p.headMesh).u32(p.playerId).u8(p.job)
    .u16(stats[0]).u16(stats[1]).u16(stats[2]).u16(stats[3]) // m_nStr, m_nSta, m_nDex, m_nInt
    .u16(p.level)
    .i32(p.fuel ?? -1).i32(p.accFuel ?? 0) // m_nFuel (-1 without a ride), m_tmAccFuel
    .u8(0) // m_idGuild > 0 is false: no guild and war IDs follow
    .u32(0) // m_idGuildCloak
    .u8(0) // m_idparty > 0 is false
    .u8(p.authorization).u32(p.mode).u32(p.stateMode)
    .u32(p.useItemId ?? 0) // the cast item's prop id (ObjSerializeOpt.cpp:155-163), or 0
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
  if (player.own !== null) {
    throw new Error(`mover ${p.objectId} is another player: its own must be null, not the own character's numbers`);
  }
  const w = playerStart(p, player).string(player.shopTitle).u8(player.worn.length);
  for (const part of player.worn) w.u8(part.part).u16(part.itemId).u8(part.flag);
  // dwPetId, MAKELONG( index, level ) or NULL_ID, and its name (2026-11-09: `player.pet`), then no buffs
  const pet = player.pet;
  const petId = pet === undefined ? NULL_ID : ((pet.level << 16) | (pet.modelIndex & 0xffff)) >>> 0;
  return scripted(objectId, MessageType.ADD_OBJ, w.u32(petId).string(pet?.name ?? '').u32(0));
}

/**
 * `m_Inventory.Serialize( ar )` (`ObjSerializeOpt.cpp:254`): `CItemContainer<CItemElem>::Serialize`, the storing
 * side (`_Common/Item.h:898-922`). `m_apIndex` is written as a container with `worn` on has it: the bag's positions
 * hold their own slot (`CItemContainer::Clear`, :480-496), each part the object worn there (`worn`, the own ADD_OBJ's
 * equipment object IDs), `NULL_ID` for none (Piece 7 M2: the browser reads the parts as a DOEQUIP changes them); the
 * object indexes as a fresh container has them. Then the count and, per item, its slot (`ch`) and `CItemElem::Serialize`
 * (`ObjSerialize.cpp:33-37` and :51-88) with only the three kept values in it: no serial number, text, options,
 * piercing, keep time or pet. The storing side lists the filled slots in slot order, so `items` must be in rising
 * `objectId` order, each one of the 73 slots.
 */
function writeInventory(w: ArWriter, items: readonly InventoryItem[], worn: readonly number[]): void {
  items.forEach((item, i) => {
    if (!Number.isInteger(item.objectId) || item.objectId < 0 || item.objectId >= INVENTORY_SLOTS) {
      throw new Error(`inventory object ID ${item.objectId} is not one of the ${INVENTORY_SLOTS} slots`);
    }
    if (i > 0 && item.objectId <= items[i - 1].objectId) {
      throw new Error(`the inventory lists its slots in rising order: object ID ${item.objectId} after `
        + `${items[i - 1].objectId}`);
    }
  });
  const fresh = (): void => {
    for (let i = 0; i < INVENTORY_SLOTS; i++) w.u32(i < MAX_INVENTORY ? i : NULL_ID);
  };
  for (let i = 0; i < INVENTORY_SLOTS; i++) w.u32(i < MAX_INVENTORY ? i : worn[i - MAX_INVENTORY] ?? NULL_ID); // m_apIndex
  w.u8(items.length); // chSize
  for (const item of items) {
    w.u8(item.objectId); // ch
    writeItemElem(w, item);
  }
  fresh(); // adwObjIndex: each slot's m_dwObjIndex
}

/** 2026-11-10 (trade): `writeInventory` for TRADE's container, the other player's inventory (`CUser::AddTrade`). */
export function writeItemContainer(w: ArWriter, items: readonly InventoryItem[], worn: readonly number[] = []): void {
  writeInventory(w, items, worn);
}

/**
 * `CItemElem::Serialize`, the storing side (`ObjSerialize.cpp:33-37` and :51-88), with the kept values in it and
 * nothing else: no serial number, text or keep time. 2026-11-09 (pets M0): the item's raised pet (`CPet::Serialize`,
 * `pet.cpp:313-324`), its vis keep times (the third piercing list) and `m_bTranformVisPet`, when the item has them.
 */
function writeItemElem(w: ArWriter, item: InventoryItem): void {
  w.u32(item.objectId).u32(item.itemId).u32(0).string('') // m_dwObjId, m_dwItemId, m_liSerialNumber, m_szItemText
    .i16(item.count) // m_nItemNum (short)
    .u8(0).i32(0).i32(0) // m_nRepairNumber, m_nHitPoint, m_nRepair
    // what the item tooltip shows (2026-11-05): m_byFlag, m_nAbilityOption, m_idGuild; m_bItemResist,
    // m_nResistAbilityOption, m_nResistSMItemId
    .u8(item.flag ?? 0).i32(item.abilityOption ?? 0).u32(0)
    .u8(item.resist ?? 0).i32(item.resistOption ?? 0).i32(0);
  // m_piercing: the cards, the ultimate jewels, the vis keep times (piercing.cpp:38-53)
  for (const list of [item.piercing ?? [], item.ultimate ?? []]) {
    w.u32(list.length);
    for (const card of list) w.u32(card);
  }
  const visKeepTimes = item.visKeepTimes ?? [];
  w.u32(visKeepTimes.length);
  for (const seconds of visKeepTimes) w.i32(seconds); // GetVisKeepTime( i ) - time_null()
  w.i32(item.charged ?? 0).i64(item.randomOption ?? 0n).u32(0); // m_bCharged, m_iRandomOptItemId, m_dwKeepTime 0 (no time left follows)
  if (item.pet === undefined) {
    w.u8(0); // (BYTE)0x00: no pet
  } else {
    const pet = item.pet;
    if (pet.availLevels.length !== PL_MAX) throw new Error(`a pet has ${PL_MAX} stat steps, not ${pet.availLevels.length}`);
    w.u8(1).u8(pet.kind).u8(pet.level).u32(pet.exp).u16(pet.energy).u16(pet.life)
      .bytes(Uint8Array.from(pet.availLevels)).string(pet.name);
  }
  w.i32(item.transformVisPet === true ? 1 : 0); // m_bTranformVisPet
}

/** `PL_MAX` (`_Common/pet.h:16`): the 6 bytes of `CPet::m_anAvailLevel`. `MAX_BANK` (`ProjectCmn.h:9`): a bank's slots. */
const PL_MAX = 6;
const MAX_BANK = 42;

/**
 * 2026-11-09 (pets M0): the three banks (`m_Bank[k].Serialize`, `ObjSerializeOpt.cpp:255-256`; `Item.h:898-922`), each
 * 42 slots: `m_apIndex` as a fresh container has it, the count, each item's slot and `CItemElem`, the object indexes.
 * `banks` lists each bank's items in rising slot order (`objectId` 0 to 41).
 */
function writeBanks(w: ArWriter, banks: readonly (readonly InventoryItem[])[]): void {
  for (let k = 0; k < 3; k++) {
    const items = banks[k] ?? [];
    for (let i = 0; i < MAX_BANK; i++) w.u32(i); // m_apIndex
    w.u8(items.length);
    for (const item of items) {
      if (item.objectId < 0 || item.objectId >= MAX_BANK) throw new Error(`bank slot ${item.objectId} is not one of ${MAX_BANK}`);
      w.u8(item.objectId);
      writeItemElem(w, item);
    }
    for (let i = 0; i < MAX_BANK; i++) w.u32(NULL_ID); // adwObjIndex
  }
}

/**
 * ADD_OBJ of the player's own character (METHOD_NONE, `ObjSerializeOpt.cpp:198-254`), through its inventory: the
 * stats (`m_nStr` to `m_nInt`) and the numbers from `p.player.own` (a character with nothing yet when it is `null`:
 * `NO_OWN`; the reader gives its STA and DEX as `player.sta` and `dex` too, so a script gives them equal),
 * `equipmentObjectIds` (one per part, the inventory's object IDs or `NULL_ID`) in `m_aEquipInfo[i].dwId`,
 * the 45 skill pairs, the fields up to the inventory with nothing in them (:239-253), then `own.inventory`
 * (`writeInventory`). The own character lists no worn parts, so `worn` must be `[]`. The world server goes on with
 * the banks, the pet, the pocket and the rest (:255-276), then the buffs; the browser skips all of that, so the
 * script ends the message after the inventory. `own.inventory` must be the list to write (`[]` for none) and
 * `own.inventoryError` `null`: a failed read's `null` and error are what the reader gives, not something to write.
 * The bundle's player object ID must be `objectId`, as `CUser::Open` makes it (`User.cpp:315`).
 *
 * 2026-11-09 (pets M0): with `own.petSlot` or `options.banks`, the script goes on with the three banks (`banks`, empty
 * by default) and `dwPetId` (`own.petSlot`, or `NULL_ID`), and ends there.
 */
export function writeAddSelf(
  objectId: number, p: AddedMover, options: { banks?: readonly (readonly InventoryItem[])[] } = {},
): ScriptMessage {
  const player = playerOf(p, true);
  if (player.equipmentObjectIds.length !== MAX_HUMAN_PARTS) {
    throw new Error(`the own character needs ${MAX_HUMAN_PARTS} equipment object IDs, not `
      + `${player.equipmentObjectIds.length}`);
  }
  if (player.worn.length !== 0) {
    throw new Error(`the own character's worn parts are not on the wire: worn must be [], not `
      + `${player.worn.length} parts`);
  }
  const own = player.own ?? NO_OWN;
  if (own.skills.length !== MAX_SKILL_JOB) {
    throw new Error(`the own character needs ${MAX_SKILL_JOB} skill slots, not ${own.skills.length}`);
  }
  if (own.inventory === null) {
    throw new Error('the own character\'s inventory to write is a list ([] for none), not null');
  }
  if (own.inventoryError !== null) {
    throw new Error(`the own character's inventoryError must be null, not '${own.inventoryError}'`);
  }
  const w = playerStart(p, player, [own.str, own.sta, own.dex, own.int])
    .u16(own.manaPoint).u16(own.fatiguePoint) // (u_short)m_nManaPoint, (u_short)m_nFatiguePoint
    // m_nTutorialState, m_nFxp, dwGold (2026-11-10, trade: the own penya when given)
    .i32(0).i32(0).u32(own.gold ?? 0)
    // m_nExp1, m_nSkillLevel, m_nSkillPoint, m_nDeathExp, m_nDeathLevel
    .i64(own.exp).i32(own.skillLevel).i32(own.skillPoint).i64(own.deathExp).i32(own.deathLevel);
  for (let i = 0; i < MAX_JOB; i++) w.u32(0); // dwJobLv
  w.u32(0).vec3([0, 0, 0]); // m_idMarkingWorld, m_vMarkingPos
  // m_aQuest, m_aCompleteQuest and m_aCheckedQuest behind their BYTE counts (ObjSerializeOpt.cpp:198-227)
  const quests = own.quests ?? [];
  w.u8(quests.length);
  for (const quest of quests) writeQuest(w, quest);
  for (const ids of [own.completedQuests ?? [], own.checkedQuests ?? []]) {
    w.u8(ids.length);
    for (const id of ids) w.u16(id);
  }
  w.u32(0).i16(own.remainGP).i16(0); // m_idMurderer, (short)m_nRemainGP, (short)0
  for (const id of player.equipmentObjectIds) w.u32(id); // m_aEquipInfo[i].dwId
  for (const slot of own.skills) w.u32(slot.skill).u32(slot.level); // m_aJobSkill[i]: dwSkill, dwLevel
  w.u8(0).u32(0) // (BYTE)m_nCheerPoint, m_dwTickCheer - GetTickCount()
    .u8(0) // m_nSlot
    .u32(0).u32(0).u32(0) // m_dwGoldBank[k]
    .u32(0).u32(0).u32(0) // m_idPlayerBank[k]
    .i32(0) // m_nPlusMaxHitPoint
    .u8(0).u8(0).u8(0) // m_nAttackResistLeft, m_nAttackResistRight, m_nDefenseResist
    .i64(0n).i32(0); // m_nAngelExp, m_nAngelLevel (__VER >= 8)
  writeInventory(w, own.inventory, player.equipmentObjectIds);
  if (own.petSlot !== undefined || options.banks !== undefined) {
    writeBanks(w, options.banks ?? []);
    w.u32(own.petSlot ?? NULL_ID); // dwPetId (__VER >= 9, __PET_0410)
  }
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

// Piece 7 M4: the party's messages ([R §1.1]), each about the own mover as the world server writes them
// (`CUser::AddPartyMember` and the like, `WORLDSERVER/User.cpp`), in the order of the readers (`world/party.ts`).

/** `MAX_PARTYMODE` (`party.h:24-26`). */
const PARTY_MODES = 5;

/** PARTYMEMBER: the id, the two names, the size, then the party block when it has members (`CParty::Serialize`). */
export function writePartyMember(objectId: number, playerId: number, leaderName: string, memberName: string, party: PartyBlock | null): ScriptMessage {
  const w = new ArWriter().u32(playerId).string(leaderName).string(memberName).i32(party?.members.length ?? 0);
  if (party !== null) {
    w.u32(party.partyId).i32(party.kind).i32(party.members.length).i32(party.level).i32(party.exp).i32(party.point)
      .i32(party.expMode).i32(party.itemMode).u32(party.duelPartyId);
    for (let i = 0; i < PARTY_MODES; i++) w.i32(party.modeTime[i] ?? 0);
    if (party.kind !== 0) w.string(party.name);
    for (const member of party.members) w.u32(member.playerId).i32(member.removed ? 1 : 0);
  }
  return scripted(objectId, MessageType.PARTYMEMBER, w);
}

function writeSide(w: ArWriter, side: PartyRequestSide): ArWriter {
  return w.u32(side.id).i32(side.level).i32(side.job).u8(side.sex);
}

/** PARTYREQEST: the leader's side, the member's, the leader's name, the troup flag. */
export function writePartyRequest(objectId: number, leader: PartyRequestSide, member: PartyRequestSide, leaderName: string, troup = 0): ScriptMessage {
  return scripted(objectId, MessageType.PARTYREQEST, writeSide(writeSide(new ArWriter(), leader), member).string(leaderName).i32(troup));
}

export const writePartyRequestCancel = (objectId: number, leaderId: number, memberId: number, mode: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYREQESTCANCEL, new ArWriter().u32(leaderId).u32(memberId).i32(mode));
export const writePartyExp = (objectId: number, exp: number, level: number, point: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYEXP, new ArWriter().i32(exp).i32(level).i32(point));
export const writePartyChangeLeader = (objectId: number, leaderId: number): ScriptMessage =>
  scripted(objectId, MessageType.ADDPARTYCHANGELEADER, new ArWriter().u32(leaderId));
export const writePartyChangeTroup = (objectId: number, name: string): ScriptMessage =>
  scripted(objectId, MessageType.PARTYCHANGETROUP, new ArWriter().string(name));
export const writePartyChangeName = (objectId: number, name: string): ScriptMessage =>
  scripted(objectId, MessageType.PARTYCHANGENAME, new ArWriter().string(name));
/** ADDPARTYNAME: the advanced-party name this player registered before. */
export const writeMyPartyName = (objectId: number, name: string): ScriptMessage =>
  scripted(objectId, MessageType.ADDPARTYNAME, new ArWriter().string(name));
export const writePartyItemMode = (objectId: number, mode: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYCHANGEITEMMODE, new ArWriter().i32(mode));
export const writePartyExpMode = (objectId: number, mode: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYCHANGEEXPMODE, new ArWriter().i32(mode));

/** SETPARTYMODE: the mode, the skill time, on or off, and the points after an on. */
export function writeSetPartyMode(objectId: number, mode: number, skillTime: number, on: boolean, point = 0): ScriptMessage {
  const w = new ArWriter().i32(mode).u32(skillTime).i32(on ? 1 : 0);
  if (on) w.i32(point);
  return scripted(objectId, MessageType.SETPARTYMODE, w);
}

export const writeSetPartyMemberParam = (objectId: number, playerId: number, param: number, value: number): ScriptMessage =>
  scripted(objectId, MessageType.SET_PARTY_MEMBER_PARAM, new ArWriter().u32(playerId).u8(param).i32(value));
export const writePartyMapInfo = (objectId: number, index: number, pos: Vec3): ScriptMessage =>
  scripted(objectId, MessageType.PARTYMAPINFO, new ArWriter().i32(index).vec3(pos));

/** The party chat (`SNAPSHOTTYPE_PARTYCHAT` 0x0069, `CUser::AddPartyChat`): the speaker's object, its name, the text. */
export const writePartyChat = (objectId: number, speakerId: number, name: string, text: string): ScriptMessage =>
  scripted(objectId, 0x0069, new ArWriter().u32(speakerId).string(name).string(text));

export const writePartySkillCall = (objectId: number, pos: Vec3): ScriptMessage =>
  scripted(objectId, MessageType.PARTYSKILL_CALL, new ArWriter().vec3(pos));
export const writePartySkillBlitz = (objectId: number, targetId: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYSKILL_BLITZ, new ArWriter().u32(targetId));
export const writePartySkillRetreat = (objectId: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYSKILL_RETREAT, new ArWriter());
export const writePartySkillSphereCircle = (objectId: number): ScriptMessage =>
  scripted(objectId, MessageType.PARTYSKILL_SPHERECIRCLE, new ArWriter());

/** The snapshot's ERRORPARTY (`CUser::AddSendErrorParty`): the code, and the skill after ERROR_NOTTARGET (207) alone. */
export function writeErrorParty(objectId: number, code: number, skill = 0): ScriptMessage {
  const w = new ArWriter().u32(code);
  if (code === 207) w.u32(skill);
  return scripted(objectId, MessageType.ERRORPARTY, w);
}

function writePlayerRecord(w: ArWriter, data: PlayerDataRecord): ArWriter {
  return w.u8(data.job).u8(data.level).u8(data.sex).u8(0).i32(data.version).u8(data.login).u8(0).u8(0).u8(0);
}

/** QUERY_PLAYER_DATA's answer (`CUser::AddQueryPlayerData`): the id, the name, the 12-byte record. */
export const writeQueryPlayerData = (objectId: number, playerId: number, name: string, data: PlayerDataRecord): ScriptMessage =>
  scripted(objectId, MessageType.QUERY_PLAYER_DATA, writePlayerRecord(new ArWriter().u32(playerId).string(name), data));

// The core's direct packets ([R §1.2]), whole, for `gateway.pushCache`: the packet type, then the fields.

export const directErrorParty = (code: number): Uint8Array => new ArWriter().u32(PacketType.ERRORPARTY).u32(code).toBytes();
export const directUpdatePlayerData = (playerId: number, data: PlayerDataRecord): Uint8Array =>
  writePlayerRecord(new ArWriter().u32(PacketType.UPDATE_PLAYER_DATA).u32(playerId), data).toBytes();
export const directLogout = (playerId: number): Uint8Array => new ArWriter().u32(PacketType.LOGOUT).u32(playerId).toBytes();
export const directBlock = (gu: number, name: string): Uint8Array => new ArWriter().u32(PacketType.BLOCK).u8(gu).string(name).toBytes();

// 2026-11-09 (pets M0): the pet messages, as the world server writes them (`WORLDSERVER/User.cpp`), in the order of the
// readers (`world/pets.ts`).

/** PET_CALL: `CUserMng::AddPetCall` (`User.cpp:7884-7906`): the item's object ID, the `MI_PET_*` model, the level, the name. */
export function writePetCall(objectId: number, itemObjectId: number, modelIndex: number, level: number, name: string): ScriptMessage {
  return scripted(objectId, MessageType.PET_CALL, new ArWriter().u32(itemObjectId).u32(modelIndex).u8(level).string(name));
}

/** PET_RELEASE: `CUserMng::AddPetRelease` (`User.cpp:7908-7918`): nothing more. */
export function writePetRelease(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_RELEASE, new ArWriter());
}

/** PET_LEVELUP: `CUserMng::AddPetLevelup` (`User.cpp:7920-7933`): `MAKELONG( index, level )`. */
export function writePetLevelup(objectId: number, modelIndex: number, level: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_LEVELUP, new ArWriter().u32(((level << 16) | (modelIndex & 0xffff)) >>> 0));
}

/** PET_SET_EXP: `CUser::AddPetSetExp` (`User.cpp:3065-3073`). */
export function writePetSetExp(objectId: number, exp: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_SET_EXP, new ArWriter().u32(exp));
}

/** PET: `CUser::AddPet` (`User.cpp:3075-3084`): `CPet::Serialize`, then the BYTE flag. */
export function writePet(objectId: number, pet: PetData, flag: number): ScriptMessage {
  if (pet.availLevels.length !== PL_MAX) throw new Error(`a pet has ${PL_MAX} stat steps, not ${pet.availLevels.length}`);
  const w = new ArWriter().u8(pet.kind).u8(pet.level).u32(pet.exp).u16(pet.energy).u16(pet.life)
    .bytes(Uint8Array.from(pet.availLevels)).string(pet.name).u8(flag);
  return scripted(objectId, MessageType.PET, w);
}

/** PET_STATE: `CUser::AddPetState` (`User.cpp:3055-3063`). */
export function writePetState(objectId: number, itemObjectId: number, life: number, energy: number, exp: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_STATE, new ArWriter().u32(itemObjectId).u16(life).u16(energy).u32(exp));
}

/** PET_FEED: `CUserMng::AddPetFeed` (`User.cpp:7935-7945`). */
export function writePetFeed(objectId: number, energy: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_FEED, new ArWriter().u16(energy));
}

/** PET_MILL: `CUser::AddPetFoodMill` (`User.cpp:3086-3094`). */
export function writePetMill(objectId: number, result: number, count: number): ScriptMessage {
  return scripted(objectId, MessageType.PET_MILL, new ArWriter().i32(result).i32(count));
}

/** QUE_PETRESURRECTION_RESULT: `CUser::AddQuePetResurrectionResult` (`User.cpp:3663-3670`), about `NULL_ID`: a BOOL. */
export function writePetResurrectionResult(ok: boolean): ScriptMessage {
  return scripted(NULL_ID, MessageType.QUE_PETRESURRECTION_RESULT, new ArWriter().i32(ok ? 1 : 0));
}

/** SET_PET_NAME: `CUserMng::AddSetPetName` (`User.cpp:7872-7881`). */
export function writeSetPetName(objectId: number, name: string): ScriptMessage {
  return scripted(objectId, MessageType.SET_PET_NAME, new ArWriter().string(name));
}

/** MOVER_CHANGESFX: `CUserMng::AddChangeMoverSfxId` (`User.cpp:8719-8728`). */
export function writeMoverChangeSfx(objectId: number, sfxId: number): ScriptMessage {
  return scripted(objectId, MessageType.MOVER_CHANGESFX, new ArWriter().u32(sfxId));
}

/** VISPET_ACTIVATE: `CUser::AddActivateVisPet` (`User.cpp:8709-8717`): the item and the pet's mover, `NULL_ID` both when it went. */
export function writeVisPetActivate(objectId: number, itemObjectId: number, petMoverId: number): ScriptMessage {
  return scripted(objectId, MessageType.VISPET_ACTIVATE, new ArWriter().u32(itemObjectId).u32(petMoverId));
}
