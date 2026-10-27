import {
  ArWriter, AttackFlag, BUNDLE_MARKER, MAX_SHORTCUT_STRING, MAX_SKILL_JOB, MAX_SLOT_APPLET, MAX_SLOT_ITEM,
  MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, MessageType, NULL_ID, ObjectType, ProtocolError, ShortcutKind,
} from '@flyffweb/protocol';
import type {
  AddedMover, AddedNpc, AddedPlayer, InventoryItem, MonsterRate, MoveReport, OwnCharacter, Shortcut, SkillSlot,
  TaskBar, Vec3,
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
  if (player.own !== null) {
    throw new Error(`mover ${p.objectId} is another player: its own must be null, not the own character's numbers`);
  }
  const w = playerStart(p, player).string(player.shopTitle).u8(player.worn.length);
  for (const part of player.worn) w.u8(part.part).u16(part.itemId).u8(part.flag);
  return scripted(objectId, MessageType.ADD_OBJ, w.u32(NULL_ID).string('').u32(0));
}

/**
 * `m_Inventory.Serialize( ar )` (`ObjSerializeOpt.cpp:254`): `CItemContainer<CItemElem>::Serialize`, the storing
 * side (`_Common/Item.h:898-922`). `m_apIndex` and the object indexes are written as a fresh container has them
 * (`CItemContainer::Clear`, :480-496: the bag's positions hold their own slot, the parts and their indexes `NULL_ID`),
 * which the browser reads past. Then the count and, per item, its slot (`ch`) and `CItemElem::Serialize`
 * (`ObjSerialize.cpp:33-37` and :51-88) with only the three kept values in it: no serial number, text, options,
 * piercing, keep time or pet. The storing side lists the filled slots in slot order, so `items` must be in rising
 * `objectId` order, each one of the 73 slots.
 */
function writeInventory(w: ArWriter, items: readonly InventoryItem[]): void {
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
  fresh(); // m_apIndex
  w.u8(items.length); // chSize
  for (const item of items) {
    w.u8(item.objectId) // ch
      .u32(item.objectId).u32(item.itemId).u32(0).string('') // m_dwObjId, m_dwItemId, m_liSerialNumber, m_szItemText
      .i16(item.count) // m_nItemNum (short)
      .u8(0).i32(0).i32(0) // m_nRepairNumber, m_nHitPoint, m_nRepair
      .u8(0).i32(0).u32(0) // m_byFlag, m_nAbilityOption, m_idGuild
      .u8(0).i32(0).i32(0) // m_bItemResist, m_nResistAbilityOption, m_nResistSMItemId
      .u32(0).u32(0).u32(0) // m_piercing: no cards, no ultimate jewels, no vis keep times (piercing.cpp:38-53)
      .i32(0).i64(0n).u32(0) // m_bCharged, m_iRandomOptItemId, m_dwKeepTime 0 (no time left follows)
      .u8(0) // (BYTE)0x00: no pet
      .i32(0); // m_bTranformVisPet
  }
  fresh(); // adwObjIndex: each slot's m_dwObjIndex
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
    .i32(0).i32(0).u32(0) // m_nTutorialState, m_nFxp, dwGold
    // m_nExp1, m_nSkillLevel, m_nSkillPoint, m_nDeathExp, m_nDeathLevel
    .i64(own.exp).i32(own.skillLevel).i32(own.skillPoint).i64(own.deathExp).i32(own.deathLevel);
  for (let i = 0; i < MAX_JOB; i++) w.u32(0); // dwJobLv
  w.u32(0).vec3([0, 0, 0]) // m_idMarkingWorld, m_vMarkingPos
    .u8(0).u8(0).u8(0) // no quests, no completed quests, no checked quests
    .u32(0).i16(own.remainGP).i16(0); // m_idMurderer, (short)m_nRemainGP, (short)0
  for (const id of player.equipmentObjectIds) w.u32(id); // m_aEquipInfo[i].dwId
  for (const slot of own.skills) w.u32(slot.skill).u32(slot.level); // m_aJobSkill[i]: dwSkill, dwLevel
  w.u8(0).u32(0) // (BYTE)m_nCheerPoint, m_dwTickCheer - GetTickCount()
    .u8(0) // m_nSlot
    .u32(0).u32(0).u32(0) // m_dwGoldBank[k]
    .u32(0).u32(0).u32(0) // m_idPlayerBank[k]
    .i32(0) // m_nPlusMaxHitPoint
    .u8(0).u8(0).u8(0) // m_nAttackResistLeft, m_nAttackResistRight, m_nDefenseResist
    .i64(0n).i32(0); // m_nAngelExp, m_nAngelLevel (__VER >= 8)
  writeInventory(w, own.inventory);
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
