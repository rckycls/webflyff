import type { ArReader } from '../ar/ArReader';
import { AttackFlag } from '../constants';
import type { MessageOf, MonsterRate } from './types';

/** `char szMonsterName[32]` in `CDPClient::OnMonsterProp` (`Neuz/DPClient.cpp:6632`), which `ReadString` is given. */
const MONSTER_NAME_BUFFER = 32;
/** `TCHAR lpString[1024]` in `CDPClient::OnDefinedText` (`Neuz/DPClient.cpp:4119`), which `ReadString` is given. */
const DEFINED_TEXT_BUFFER = 1024;

/**
 * MELEE_ATTACK: `CDPClient::OnMeleeAttack` (`Neuz/DPClient.cpp:3802`): `ar >> dwAtkMsg >> id >> nParam2 >>
 * nParam3`, written by `CUserMng::AddMeleeAttack` (`WORLDSERVER/User.cpp:4808`) to everyone in view but the attacker.
 */
export function readMeleeAttack(r: ArReader): MessageOf<'meleeAttack'> {
  const message = r.u32();
  const targetId = r.u32();
  const param2 = r.i32();
  const param3 = r.i32();
  return { type: 'meleeAttack', message, targetId, param2, param3 };
}

/**
 * DAMAGE: `CDPClient::OnDamage` (`Neuz/DPClient.cpp:1758`): `ar >> objidAttacker >> dwHit; ar >> dwAtkFlags;` and,
 * `if( dwAtkFlags & AF_FLYING )`, `ar >> vPos; ar >> fAngle;`. `CUserMng::AddDamage` (`WORLDSERVER/User.cpp:4474`)
 * writes the victim's position and angle there.
 */
export function readDamage(r: ArReader): MessageOf<'damage'> {
  const attackerId = r.u32();
  const hit = r.u32();
  const flags = r.u32();
  let fly: MessageOf<'damage'>['fly'] = null;
  if ((flags & AttackFlag.FLYING) !== 0) {
    const pos = r.vec3();
    const angle = r.f32();
    fly = { pos, angle };
  }
  return { type: 'damage', attackerId, hit, flags, fly };
}

/** MOVERDEATH: `CDPClient::OnMoverDeath` (`Neuz/DPClient.cpp:1936`): `ar >> objidAttacker >> dwMsg`. */
export function readMoverDeath(r: ArReader): MessageOf<'moverDeath'> {
  const attackerId = r.u32();
  const message = r.u32();
  return { type: 'moverDeath', attackerId, message };
}

/** SETPOINTPARAM: `CDPClient::OnSetPointParam` (`Neuz/DPClient.cpp:3303`): `ar >> nDstParameter >> nValue`, both `int`. */
export function readSetPointParam(r: ArReader): MessageOf<'setPointParam'> {
  const param = r.i32();
  const value = r.i32();
  return { type: 'setPointParam', param, value };
}

/**
 * SETEXPERIENCE: `CDPClient::OnSetExperience` (`Neuz/DPClient.cpp:3376`): `ar >> nExp1 >> wLevel; ar >> nSkillLevel >>
 * nSkillPoint >> nDeathExp >> wDeathLevel` (`EXPINTEGER` is `__int64`, `_Common/data.h:366`). `CUser::AddSetExperience`
 * (`WORLDSERVER/User.cpp:1139`) names its third and fourth parameters `nSkillPoint, nSkillLevel` but writes the level
 * first, as this reads it, and every caller passes the points first and the level second, so the wire holds the
 * level and then the points. The death values come as -1 and 0xffff when the caller has none (`User.h:494`); the
 * reader gives them as they are, and the handler keeps its old values for them.
 */
export function readSetExperience(r: ArReader): MessageOf<'setExperience'> {
  const exp = r.i64();
  const level = r.u16();
  const skillLevel = r.i32();
  const skillPoint = r.i32();
  const deathExp = r.i64();
  const deathLevel = r.u16();
  return { type: 'setExperience', exp, level, skillLevel, skillPoint, deathExp, deathLevel };
}

/** SETLEVEL: `CDPClient::OnSetLevel` (`Neuz/DPClient.cpp:3339`): `WORD wLevel; ar >> wLevel`. */
export function readSetLevel(r: ArReader): MessageOf<'setLevel'> {
  return { type: 'setLevel', level: r.u16() };
}

/**
 * SET_GROWTH_LEARNING_POINT: `CDPClient::OnSetGrowthLearningPoint` (`Neuz/DPClient.cpp:3531`): `long nRemainGP,
 * nRemainLP; ar >> nRemainGP >> nRemainLP`. A `long` is 4 bytes in `CAr`; the second is not used (`CUser::
 * AddSetGrowthLearningPoint`, `WORLDSERVER/User.cpp:1161`, writes 0), so it is read and dropped.
 */
export function readSetGrowthLearningPoint(r: ArReader): MessageOf<'setGrowthLearningPoint'> {
  const remainGP = r.i32();
  r.i32(); // nRemainLP
  return { type: 'setGrowthLearningPoint', remainGP };
}

/**
 * SETSTATE: `CDPClient::OnSetState` (`Neuz/DPClient.cpp:13514`): `ar >> m_nStr >> m_nSta >> m_nDex >> m_nInt; ar >>
 * nRemainLP >> m_nRemainGP`, all `LONG` (`Mover.h:527`). `nRemainLP` is not used (`CUser::AddSetState`,
 * `WORLDSERVER/User.cpp:2429`, writes 0), so it is read and dropped.
 */
export function readSetState(r: ArReader): MessageOf<'setState'> {
  const str = r.i32();
  const sta = r.i32();
  const dex = r.i32();
  const int = r.i32();
  r.i32(); // nRemainLP
  const remainGP = r.i32();
  return { type: 'setState', str, sta, dex, int, remainGP };
}

/** CORRREQ: `CDPClient::OnCorrReq` (`Neuz/DPClient.cpp:10015`): `ar >> vPos >> idAttacker`. */
export function readCorrReq(r: ArReader): MessageOf<'corrReq'> {
  const pos = r.vec3();
  const attackerId = r.u32();
  return { type: 'corrReq', pos, attackerId };
}

/** REVIVAL: `CDPClient::OnRevival` (`Neuz/DPClient.cpp:3450`) takes only the object ID, so there are no fields. */
export function readRevival(): MessageOf<'revival'> {
  return { type: 'revival' };
}

/** REVIVAL_TO_LODESTAR: `CDPClient::OnRevivalLodestar` (`Neuz/DPClient.cpp:3484`) takes only the object ID: no fields. */
export function readRevivalLodestar(): MessageOf<'revivalToLodestar'> {
  return { type: 'revivalToLodestar' };
}

/**
 * DEFINEDTEXT: `CDPClient::OnDefinedText` (`Neuz/DPClient.cpp:4117`): `DWORD dwText; ar >> dwText; ar.ReadString(
 * lpString, 1024 )`. `CUser::AddDefinedText` (`WORLDSERVER/User.cpp:2218`) writes the text ID from an `int`, so it
 * is read as one; every `TID_*` is far below 2^31 and the four bytes are the same either way.
 */
export function readDefinedText(r: ArReader): MessageOf<'definedText'> {
  const textId = r.i32();
  const args = r.string(DEFINED_TEXT_BUFFER);
  return { type: 'definedText', textId, args };
}

/**
 * DEFINEDTEXT1: `CDPClient::OnDefinedText1` (`Neuz/DPClient.cpp:4230-4239`): `DWORD dwText; ar >> dwText`, with no
 * string (`CUser::AddDefinedText( int )`, `WORLDSERVER/User.cpp:2264`). It reads as a DEFINEDTEXT whose `args` is null:
 * Neuz shows that text as it is (`GETTEXT( dwText )`), not formatted as DEFINEDTEXT's is.
 */
export function readDefinedText1(r: ArReader): MessageOf<'definedText'> {
  return { type: 'definedText', textId: r.i32(), args: null };
}

/** QUERYGETDESTOBJ: `CDPClient::OnQueryGetDestObj` (`Neuz/DPClient.cpp:8985`): `OBJID objid; ar >> objid`. */
export function readQueryGetDestObj(r: ArReader): MessageOf<'queryGetDestObj'> {
  return { type: 'queryGetDestObj', fromId: r.u32() };
}

/**
 * MONSTERPROP: `CDPClient::OnMonsterProp` (`Neuz/DPClient.cpp:6630`): `ar >> nMonsterPropSize`, then per entry
 * `ar.ReadString( szMonsterName, 32 )` and `nHitPoint`, `nAttackPower`, `nDefence`, `nExp`, `nItemDrop`, `nPenya`
 * (`int` each); then `ar >> nRemovePropSize` and per name `ar.ReadString( szMonsterName, 32 )`. `CUser::AddMonsterProp`
 * (`WORLDSERVER/User.cpp:6524`) writes the same, and so does `CUserMng::AddMonsterProp` (:5663, to everyone, with the
 * object ID `NULL_ID`). The loops run `i < count`, so a count of 0 or less reads no entry.
 */
export function readMonsterProp(r: ArReader): MessageOf<'monsterProp'> {
  const rates: MonsterRate[] = [];
  const count = r.i32();
  for (let i = 0; i < count; i++) {
    const name = r.string(MONSTER_NAME_BUFFER);
    const hitPoint = r.i32();
    const attackPower = r.i32();
    const defence = r.i32();
    const exp = r.i32();
    const itemDrop = r.i32();
    const penya = r.i32();
    rates.push({ name, hitPoint, attackPower, defence, exp, itemDrop, penya });
  }
  const removed: string[] = [];
  const removedCount = r.i32();
  for (let i = 0; i < removedCount; i++) removed.push(r.string(MONSTER_NAME_BUFFER));
  return { type: 'monsterProp', rates, removed };
}
