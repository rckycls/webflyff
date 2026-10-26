// What the screen plays for the world's combat events (`CombatEvent`) and the own character's (`OwnEvent`): the effects
// Neuz's handlers make with `CreateSfx`, the damage numbers they add with `g_DamageNumMng.AddNumber`, and the flash and
// the shake a hit gives a model (`m_SparkInfo`, `m_nDmgCnt`). The world (`WorldState`, `OwnState`) has already done the
// rules' part of each message and step (HP, states, motions: the flinch, the level-up motion); what is left is what is
// seen, which goes to `out`: the effect manager, the damage numbers and the movers' views.

import type { Vec3, WebItemProp } from '@flyffweb/formats';
import { AttackFlag } from '@flyffweb/protocol';
import type { OwnEvent } from '../OwnState';
import { Ik3 } from '../sim/constants';
import { normalize, sub } from '../sim/d3dx';
import type { CombatEvent } from '../WorldState';
import { Xi } from './EffectManager';
import type { EffectRequest } from './EffectManager';

const f32 = Math.fround;

/** `D3DXToRadian( degree )`: `(degree) * (D3DX_PI / 180.0f)` with `D3DX_PI` `3.141592654f` (`d3dx9math.h:28-31`). */
const RADIANS_PER_DEGREE = f32(f32(3.141592654) / 180);
/** `vPos.y += 1.5f` (`DPClient.cpp:1846`, `:1855`, `:1866`, `:1878`, `:1889`): the banners are made 1.5 m over the feet. */
const BANNER_RAISE = 1.5;
/** `SetScale( D3DXVECTOR3( 2.0f, 2.0f, 2.0f ) )` of the block, parry and miss banners; 3 for the critical one. */
const BANNER_SCALE = 2;
const CRITICAL_SCALE = 3;
/** `vLocal.y += 1.0f` (`ActionMoverDmg.cpp:83`, `:89`): the hit spark is made 1 m up. */
const SPARK_RAISE = 1;
/** `NULL_ID` written `=` in `propItem.txt`: the item has no hit effect (`dwSfxObj3 != NULL_ID`, `ActionMoverDmg.cpp:92`). */
const NO_SFX = -1;

/** What the events read of a mover in view: its object ID, position (`GetPos()`) and angle (`GetAngle()`). */
export interface FxMover {
  objectId: number;
  act: { body: { pos: Vec3; angle: number } };
}

/** The world as the handlers see it when the event is played. */
export interface CombatFxWorld {
  /** `prj.GetMover`: the movers in view by object ID. */
  movers: ReadonlyMap<number, FxMover>;
  /** `g_pPlayer`'s object ID, the active mover (`IsActiveMover()`); undefined while it is not in view. */
  selfId: number | undefined;
  /** `g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER )` (`isGameMaster`): a game master is also shown the hits on its focus. */
  gameMaster: boolean;
  /** `GetObjFocus()`: the mover the player has selected, or null. */
  focusId: number | null;
  /** The item catalog: the hit effect (`dwSfxObj3`) and the kind (`dwItemKind3`) of an attacker's hand item. */
  itemProps: ReadonlyMap<number, Pick<WebItemProp, 'sfxHit' | 'kind3'>>;
}

/** `AUTH_GAMEMASTER` (`_Common/authorization.h:23`), the letter `'L'`. */
const AUTH_GAMEMASTER = 0x4c;

/**
 * `g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER )` (`Mover.h:1061`): `IsAuthorizationHigher` (`authorization.h:93-102`)
 * compares the ranks of `GetAuthorizationRank` (`:58-82`), and the letters for one it has no rank for. The ranks keep the
 * letters' order on each side of `'L'` (every letter it ranks below 50 is before `'L'`, every one from 50 is `'L'` or
 * after), so the authorization is a game master's when its letter is `'L'` or later.
 */
export function isGameMaster(authorization: number): boolean {
  return authorization >= AUTH_GAMEMASTER;
}

/** Where what is played goes: `EffectManager.play`, `DamageNumbers.add`, and `MoverViews.flash` and `shake`. */
export interface CombatFxOut {
  effect(request: EffectRequest): void;
  number(pos: Vec3, value: number, ownHurt: boolean): void;
  /** The mover's model flashes: `m_SparkInfo` with `m_v3SparkDir` `direction` (D3D, a unit vector). */
  flash(moverId: number, direction: Vec3): void;
  /** The mover's `m_nDmgCnt = 10`: its drawing shakes, a monster's. */
  shake(moverId: number): void;
}

/**
 * The effects of milestone 1, loaded as the world is entered so that the first of each plays at once (their files and
 * textures come over the network on first use): the weapons' hit sparks (`dwSfxObj3` of the swords and axes, sticks and
 * staffs, knuckles, bows and yoyos: [effects §3.2]), the critical, miss (also the resist's), parry and block banners, the
 * level up and the spawn.
 */
export const WARM_UP_EFFECTS: readonly number[] = [
  Xi.HIT_SWORD01, Xi.HIT_STICK01, Xi.HIT_KNUCKLE01, Xi.HIT_BOW01, Xi.HIT_YOY01,
  Xi.HIT_CRITICAL01, Xi.HIT_MISS01, Xi.HIT_PARRY01, Xi.HIT_HITBLOCK01,
  Xi.GEN_LEVEL_UP01, Xi.GEN_MONSTER_SPAWN01,
];

/** `D3DXVECTOR3 vPos = pMover->GetPos(); vPos.y += 1.5f;`, in floats. */
const bannerAt = (p: Vec3): Vec3 => [p[0], f32(p[1] + BANNER_RAISE), p[2]];

/**
 * What a combat event shows:
 * - `hit`: `CDPClient::OnDamage` (`Neuz/DPClient.cpp:1792-1897`). It is shown when the attacker was not in view as the
 *   message came (`attackerInView`; `goto g_PASS`, `:1811-1812`: `prj.GetCtrl` found none, `NULL_ID` included), whoever
 *   the victim is; when the victim or the attacker is the own player (`:1833`); or, for a game master, when the victim is
 *   its focus (`:1824-1828`). (The "show all damage" option, `m_bDamageRender`, is off by default, `HwOption.cpp:238`,
 *   and the browser has no options.) Then the flags in Neuz's order ([combat §4.1], `:1843-1896`): blocking plays its
 *   banner and goes on; parry plays its banner; else resist plays the miss banner when
 *   nothing got through, else the number; else miss plays its banner; else a critical plays its banner, and the number.
 *   The banners are made 1.5 m over the feet, at scale 2 (3 for the critical), and follow nothing; the number is at the
 *   feet, in the first colour set when the own player is hurt.
 * - `death`: `CDPClient::OnMoverDeath` (`DPClient.cpp:2003-2007`): with the killer in view as the message came
 *   (`attackerInView`, `if( pAttacker )`), and the own player either of them, the HP the mover had is its last number.
 * - `attackerHit`: `CActionMover::OnDamageMsgC` (`_AIInterface/ActionMoverDmg.cpp:74-100`) for `AF_GENERIC`: the
 *   attacker's hand item's `dwSfxObj3` (`GetActiveHandItemProp`), 1 m over the victim for a yoyo, else 1 m in front of the
 *   victim along the attacker's heading (`AngleToVectorXZ( angle, 1.0f )`, `xUtil3D.h:37-43`) and 1 m up; made with no
 *   source, so it follows nothing and is not turned. A monster's item is its `dwAtk1` (`m_dwVirtItem`): of the melee
 *   ones only the Skeleton General's and the Skeleton Devil's have a `dwSfxObj3`. (`dwSfxObj5`, at the attacker, is
 *   none for every player's weapon, [effects §3.2], and the catalog does not keep it.) Then the victim shakes
 *   (`m_nDmgCnt = 10`, `:118`, outside the `AF_GENERIC` branch: every blow that landed).
 * - `spark`: `m_SparkInfo` of `CMover::OnDamage` (the victim's, `MoverActEvent.cpp:1522-1538`) and `OnAttackMelee`
 *   (the attacker's, :1704-1717): the mover's model flashes, lit along `D3DXVec3Normalize( GetPos() - pOther->GetPos() )`,
 *   both movers being valid (`IsValidObj( pHitObj )`).
 * - `levelUp`: `CDPClient::OnSetLevel` (`DPClient.cpp:3351`): `XI_GEN_LEVEL_UP01` on the mover, following it.
 * - `spawned`: `CDPClient::OnAddObj` (`DPClient.cpp:1226`): `XI_GEN_MONSTER_SPAWN01` on the mover, following it.
 * - `swing` and `text`: nothing here (the rules played the swing; the texts are the messages window's).
 *
 * The world gives the movers as they are when the event is played: a message's at the start of the next frame, before
 * any rules step, and a step's (`spark`, `attackerHit`) right after that step, so where the handler found them. A
 * mover that left in the meantime (a DEL_OBJ later in the same bundle) is not in view, and what it would have shown at
 * it is not; whether the attacker was in view is the message's (`attackerInView`).
 */
export function playCombatEvent(event: CombatEvent, world: CombatFxWorld, out: CombatFxOut): void {
  switch (event.kind) {
    case 'hit':
      playHit(event, world, out);
      return;
    case 'death': {
      const victim = world.movers.get(event.victimId);
      if (victim === undefined || !event.attackerInView) return;
      const own = world.selfId;
      if (event.victimId !== own && event.attackerId !== own) return;
      out.number(victim.act.body.pos, event.lastHp, event.victimId === own);
      return;
    }
    case 'attackerHit':
      playSpark(event, world, out);
      return;
    case 'spark': {
      const mover = world.movers.get(event.moverId);
      const from = world.movers.get(event.fromId);
      if (mover === undefined || from === undefined) return;
      out.flash(event.moverId, normalize(sub(mover.act.body.pos, from.act.body.pos)));
      return;
    }
    case 'levelUp':
      followed(Xi.GEN_LEVEL_UP01, world.movers.get(event.moverId), out);
      return;
    case 'spawned':
      followed(Xi.GEN_MONSTER_SPAWN01, world.movers.get(event.moverId), out);
      return;
    default: // swing, text
      return;
  }
}

/**
 * What an own event shows: a level up plays `XI_GEN_LEVEL_UP01` on the own player (`CMover::SetExperience`,
 * `_Common/MoverParam.cpp:1727`; its motion, `MTI_LEVELUP`, the world played), and new skill points play it again
 * (`CDPClient::OnSetExperience`, `DPClient.cpp:3398-3400`, on `g_pPlayer`). Their texts and music are the messages
 * window's. The rest show nothing here.
 */
export function playOwnEvent(event: OwnEvent, world: CombatFxWorld, out: CombatFxOut): void {
  if (event.kind !== 'levelUp' && event.kind !== 'skillPointUp') return;
  const self = world.selfId === undefined ? undefined : world.movers.get(world.selfId);
  followed(Xi.GEN_LEVEL_UP01, self, out);
}

/**
 * `CreateSfx( dev, xi, pMover->GetPos(), pMover->GetId() )`: a plain effect on the mover, following it; its source is
 * valid, so the caster's angle goes with it (ruling R11), which the manager does not turn a plain effect by.
 */
function followed(xi: number, mover: FxMover | undefined, out: CombatFxOut): void {
  if (mover === undefined) return;
  const { pos, angle } = mover.act.body;
  out.effect({ xi, pos, followId: mover.objectId, sourceAngle: angle });
}

function playHit(event: Extract<CombatEvent, { kind: 'hit' }>, world: CombatFxWorld, out: CombatFxOut): void {
  const victim = world.movers.get(event.victimId);
  if (victim === undefined) return;
  const own = world.selfId;
  const shown = !event.attackerInView || event.victimId === own || event.attackerId === own ||
    (world.gameMaster && world.focusId === event.victimId);
  if (!shown) return;
  const { flags, hit } = event;
  const pos = victim.act.body.pos;
  const ownHurt = event.victimId === own;
  if (flags & AttackFlag.BLOCKING) out.effect({ xi: Xi.HIT_HITBLOCK01, pos: bannerAt(pos), scale: BANNER_SCALE });
  if (flags & AttackFlag.PARRY) {
    out.effect({ xi: Xi.HIT_PARRY01, pos: bannerAt(pos), scale: BANNER_SCALE });
  } else if (flags & AttackFlag.RESIST) {
    if (hit === 0) out.effect({ xi: Xi.HIT_MISS01, pos: bannerAt(pos), scale: BANNER_SCALE });
    else out.number(pos, hit, ownHurt);
  } else if (flags & AttackFlag.MISS) {
    out.effect({ xi: Xi.HIT_MISS01, pos: bannerAt(pos), scale: BANNER_SCALE });
  } else {
    if (flags & AttackFlag.CRITICAL) out.effect({ xi: Xi.HIT_CRITICAL01, pos: bannerAt(pos), scale: CRITICAL_SCALE });
    out.number(pos, hit, ownHurt);
  }
}

/**
 * The hit spark of `OnDamageMsgC` (`ActionMoverDmg.cpp:74-93`), in floats, and the victim's shake (:118). The movers
 * are in view (the event is played on the step that made it); they are read for the victim's position and the
 * attacker's heading.
 */
function playSpark(event: Extract<CombatEvent, { kind: 'attackerHit' }>, world: CombatFxWorld, out: CombatFxOut): void {
  const victim = world.movers.get(event.victimId);
  const attacker = world.movers.get(event.attackerId);
  if (victim === undefined || attacker === undefined) return;
  const prop = event.weapon === null ? undefined : world.itemProps.get(event.weapon);
  if (prop !== undefined && prop.sfxHit !== NO_SFX) {
    out.effect({ xi: prop.sfxHit, pos: sparkAt(victim, attacker, prop.kind3) });
  }
  out.shake(event.victimId);
}

/** Where `OnDamageMsgC` makes the hit spark: `vLocal` (`ActionMoverDmg.cpp:78-90`). */
function sparkAt(victim: FxMover, attacker: FxMover, kind3: number): Vec3 {
  const [x, y, z] = victim.act.body.pos;
  if (kind3 === Ik3.YOYO) return [x, f32(y + SPARK_RAISE), z];
  // AngleToVectorXZ( &vLocal, pAttacker->GetAngle(), 1.0f ); vLocal += pMover->GetPos(); vLocal.y += 1.0f
  const theta = f32(attacker.act.body.angle * RADIANS_PER_DEGREE);
  return [f32(f32(Math.sin(theta)) + x), f32(y + SPARK_RAISE), f32(f32(-f32(Math.cos(theta))) + z)];
}
