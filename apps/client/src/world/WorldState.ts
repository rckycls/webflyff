import { AttackFlag, DstParam } from '@flyffweb/protocol';
import type { AddedMover, AddedPlayer, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { ServerClock } from '../net/serverClock';
import type { GameData } from './gameData';
import { lodestarRate } from './OwnState';
import type { OwnEvent, OwnState } from './OwnState';
import { Parts } from './render/looks';
import { ActionMover, wrapAngle } from './sim/ActionMover';
import type { Ground } from './sim/collision';
import { ActMsg, ObjSta, ObjStaF } from './sim/constants';
import {
  applyDestPos, applyMotion, applyMoved, applyMoverCorr, clearDestObj, setDestAngle, setDestObj, stepMover,
} from './sim/moverRules';
import type { SimMover } from './sim/moverRules';
import { FISTS, NO_ADJUST, attackSpeed, maxHitPoint, monsterMaxHitPoint } from './sim/params';

const f32 = Math.fround;

/** `AII_MONSTER` (`Resource/defineNeuz.h:6`): the `dwAI` of a monster in `propMover.txt`. */
const AII_MONSTER = 2;
/** `II_WEA_HAN_HAND` (`Resource/defineItem.h:25`): the bare hand's item, a player's active hand when it is empty. */
const II_WEA_HAN_HAND = 11;
/** `NULL_ID`, an item column written `=`: no item. */
const NULL_ITEM = -1;
/** `MATCHLESS_MODE` (`_Common/authorization.h:106`): a player in it takes no blow (`PreProcessDamage`). */
const MATCHLESS_MODE = 0x00000001;
/**
 * The monsters whose hit frames have handlers of their own (`CMover::OnAttackMelee`, `_Common/MoverActEvent.cpp:1601-1636`,
 * the handlers at :882-1460, with their own blows, effects and quakes): `MI_CLOCKWORK1`, `MI_BIGMUSCLE`, `MI_KRRR`,
 * `MI_MUSHMOOT` and the four `MI_DU_METEONYKER`s (`Resource/defineObj.h:1149-1152`, :1481, :1529-1531). They are left out:
 * none of them is a Flaris monster.
 */
const OWN_MELEE_HANDLERS: ReadonlySet<number> = new Set([164, 165, 166, 167, 715, 753, 754, 755]);
/** `vTemp.x*vTemp.x + vTemp.z*vTemp.z < 32*32` (`DPClient.cpp:1225`): how near a mover appearing plays the spawn effect. */
const SPAWN_RANGE_SQ = 32 * 32;
/** The MONSTERPROP percent of a monster none has come for: `m_fHitPoint_Rate` 1.0f (`ProjectCmn.cpp:274`). */
const NO_RATE = 100;
/** `float fItem = 1.0f` (`CMover::GetAttackSpeed`, `MoverAttack.cpp:162`): the item speed when the hand's item has no row. */
const NO_ITEM_SPEED = 1;
/**
 * The most drawing events kept between two `takeChanges`: a hidden tab takes none, and what a long absence brought is
 * not worth drawing when it shows again. The oldest go first, counted (`WorldChanges.dropped`); the texts are kept
 * whatever their number, as Neuz logs every one.
 */
const MAX_PENDING_COMBAT = 1024;

/** The message of this `type`. */
type MessageOf<T extends WorldMessage['type']> = Extract<WorldMessage, { type: T }>;

export type MoverKind = 'player' | 'monster' | 'npc';

/** A mover in view: the rules' `SimMover` (kept as one object for its whole life) and what ADD_OBJ said about it. */
export interface Mover extends SimMover {
  kind: MoverKind;
  isSelf: boolean;
  /** The ADD_OBJ the mover came from: the model, the look and the worn parts are read from it. */
  added: AddedMover;
  /** `CMover::m_szName`: the player's own, the character's from `character.inc`, or the monster's from `propMover.txt`. '' where unknown. */
  name: string;
  /**
   * A flying monster (`propMover.txt`'s `dwFlying` 1), which Neuz moves with the flying rules whatever its state flag
   * (`IsFly() || pProp->dwFlying == 1`, `ActionMover.cpp:183`): a flier to `step` (Ruling 43).
   */
  flying: boolean;
  /**
   * `CMover::m_nHitPoint`: the ADD_OBJ's, then as DAMAGE, MOVERDEATH, SETPOINTPARAM, SETLEVEL and REVIVAL_TO_LODESTAR set
   * it. The own mover's, when the world has the own character's numbers, is theirs (`OwnState.hp`, the one place it
   * changes) and cannot be set here.
   */
  hp: number;
  /**
   * `CMover::m_nLevel`: a player's from its ADD_OBJ, then SETLEVEL (the own one's is `OwnState.level`); any other
   * mover's `dwLevel`, at least 1 (`CMover::InitProp`, `Mover.cpp:1502-1504`; 1 with no row, as `CMover::Init` leaves it).
   */
  level: number;
  /**
   * `CMover::GetMaxHitPoint()`: a monster's or an NPC's `dwAddHp` times its MONSTERPROP rate (`monsterMaxHitPoint`); a
   * player's `GetMaxOriginHitPoint` of its job, level and STA (`maxHitPoint`; the own one's is `OwnState.maxHp`, with its
   * items). Null only for a mover the catalog has no row for (its mover row, or a player's job row), for which Neuz
   * would have none either.
   */
  maxHp: number | null;
}

/**
 * What the screen should draw or play for a combat message, in the order the messages came. The rules' side (HP,
 * states, motions) is done by the time it is handed out.
 * - `hit`: a DAMAGE on `victimId` by `attackerId`: the number and the effects of `CDPClient::OnDamage` by `flags` (`AF_*`,
 *   `DPClient.cpp:1792-1909`). `attackerInView` is whether the attacker was in view as the message came (`prj.GetCtrl`
 *   found it; only movers are kept here, so an attacker that is an object of another kind counts as not in view). Neuz
 *   shows the hit for any victim when the attacker was not (`goto g_PASS`, :1810-1812), else when the own mover is
 *   either party (:1833), or to a game master when the victim is its focus (:1824-1828).
 * - `death`: a MOVERDEATH; `lastHp` is the HP before it, the number Neuz shows when the killer was in view as the message
 *   came (`attackerInView`, `if( pAttacker )`, :1998-2007) and the own mover is either party.
 * - `swing`: another mover's MELEE_ATTACK (`OnMeleeAttack`) started its swing (one kept for later, or refused, is not).
 * - `spark`: a mover's model flashes, lit from the side of the mover `fromId` (`m_SparkInfo`, its direction
 *   `GetPos() - pOther->GetPos()`): a swing's victim at its hit frame, whether or not the blow lands
 *   (`CMover::OnDamage`, `MoverActEvent.cpp:1522-1538`), and the attacker once its blow has landed (`OnAttackMelee`,
 *   :1704-1717).
 * - `attackerHit`: a swing's blow landed (`CMover::OnAttackMelee` → `OnDamageMsgC`, `ActionMoverDmg.cpp:54-122`): the
 *   effects of the attacker's active hand item `weapon` (`GetActiveHandItemProp`: `dwSfxObj3` at the victim, `dwSfxObj5`
 *   at the attacker), the victim's shake (`m_nDmgCnt`) and the hit sound; `weapon` is a monster's `dwAtk1` (its virtual
 *   item), and null where there is none (`=`). The flinch and the pause are done.
 * - `levelUp`: SETLEVEL raised another mover's level: the level-up effect on it (`OnSetLevel`); the motion is done.
 * - `text`: DEFINEDTEXT or DEFINEDTEXT1: the text `textId` with the arguments `args` (null for DEFINEDTEXT1, whose text
 *   Neuz shows unformatted).
 * - `spawned`: a mover that is not a player came into view within 32 m of the own mover (`XI_GEN_MONSTER_SPAWN01`).
 */
export type CombatEvent =
  | { kind: 'hit'; victimId: number; attackerId: number; hit: number; flags: number; attackerInView: boolean }
  | { kind: 'death'; victimId: number; attackerId: number; lastHp: number; attackerInView: boolean }
  | { kind: 'swing'; attackerId: number; targetId: number }
  | { kind: 'spark'; moverId: number; fromId: number }
  | { kind: 'attackerHit'; attackerId: number; victimId: number; weapon: number | null }
  | { kind: 'levelUp'; moverId: number }
  | { kind: 'text'; textId: number; args: string | null }
  | { kind: 'spawned'; moverId: number };

/**
 * What changed in view since the last `takeChanges`. A caller applies `removed` first, then `added`:
 * - `removed` holds, once, the ID of every mover that left and that an earlier call handed out in `added`.
 * - `added` holds the movers that came and are still in view, in the order they came.
 * A mover that came and went between two calls is in neither: the caller never saw it. An ID can be in both, for a
 * mover handed out that left and another that came with its ID.
 * - `combat` holds what to draw of the combat messages (`CombatEvent`), in order: every text, and the last
 *   `MAX_PENDING_COMBAT` of the rest; an event can name a mover that has left since.
 * - `dropped` counts the events of the rest that went for that limit since the last call.
 * - `own` holds what the messages about the own character played (`OwnState.apply`'s events), in order.
 */
export interface WorldChanges {
  added: Mover[];
  removed: number[];
  combat: CombatEvent[];
  own: OwnEvent[];
  dropped: number;
}

/** `CMover::IsDie` (`Mover.h:1221`): in a dead state, or with no HP left. */
export function isDie(m: Mover): boolean {
  return m.act.isDie() || m.hp === 0;
}

/** `CMover::IsLive` (`Mover.h:1222`): not in a dead state, or with HP left. */
export function isLive(m: Mover): boolean {
  return !m.act.isDie() || m.hp > 0;
}

/**
 * The item ID of another player's `m_aEquipInfo[PARTS_RWEAPON]` (its worn right-hand part, expired or not), which the
 * client's `GetActiveHandItemProp` takes for it (`Mover.cpp:2942-2947`); null for an empty hand.
 */
function rightHandItem(player: AddedPlayer): number | null {
  return player.worn.find((w) => w.part === Parts.RWEAPON)?.itemId ?? null;
}

/**
 * The movers in view, and the messages that move them: `CDPClient`'s handlers for ADD_OBJ, DEL_OBJ, the mover messages
 * and the combat messages (`Source/Neuz/DPClient.cpp`), with the rules of `sim/` doing what `CMover` does with each.
 * Keys are the message's object ID, as `prj.GetCtrl( objid )` looks them up: a message about a mover not in view, or no
 * longer, finds none and is ignored. Fliers (those flying now, and the flying monsters) are placed but never stepped (the
 * ground rules leave flying out), and the objects that are not movers are not kept.
 *
 * The own character's numbers (`OwnState`, made by the world screen from the JOIN's own ADD_OBJ) take the messages about
 * it, here, in bundle order with the rest (CDPClient's own-character handlers); the own mover's HP, level and max HP are
 * read from them. What the screen should draw comes out with the changes (`takeChanges`); the focus and the attack
 * (`OnMoverDeath`'s and `CWorld::Process`'s part of them) are the world screen's.
 */
export class WorldState {
  private readonly byId = new Map<number, Mover>();
  private own: Mover | undefined;
  private pendingAdded: Mover[] = [];
  private pendingRemoved = new Set<number>();
  private pendingCombat: CombatEvent[] = [];
  /** How many of `pendingCombat` the limit counts (all but the texts), and how many went for it since the last call. */
  private pendingDrawn = 0;
  private dropped = 0;
  private pendingOwn: OwnEvent[] = [];
  /** `MoverProp::m_fHitPoint_Rate` as MONSTERPROP sets it, a percent, by mover ID; none for 100. */
  private readonly hpRates = new Map<number, number>();
  /** `CProject::m_mapMVI`: the mover ID of each name, made when MONSTERPROP first needs it. */
  private moversByName: Map<string, number> | undefined;

  /** `prj.GetCtrl`, for the rules that follow an object. */
  private readonly find = (objectId: number): Mover | undefined => this.byId.get(objectId);

  /**
   * `ground` is the world the movers stand on and collide with (D3D coordinates); `numbers` the own character's numbers,
   * when the world screen has them, which the messages about it change.
   */
  constructor(
    private readonly data: GameData,
    private readonly clock: ServerClock,
    private readonly ground: Ground,
    private readonly numbers?: OwnState,
  ) {}

  get movers(): ReadonlyMap<number, Mover> {
    return this.byId;
  }

  /** The player's own character, once its ADD_OBJ (the one with the bundle's player object ID) has come. */
  self(): Mover | undefined {
    return this.own;
  }

  /**
   * One message of a bundle, about the object `objectId`. A mover message for an ID not in view is ignored. `joining`
   * says the message is the JOIN bundle's (`fJoin`, `DPClient.cpp:909-911`), whose movers appear with no effect.
   */
  apply(objectId: number, message: WorldMessage, joining = false): void {
    switch (message.type) {
      case 'addMover':
        this.add(objectId, message.mover, joining);
        return;
      case 'delObj':
        this.remove(objectId); // OnRemoveObj (:1643): the object is deleted
        return;
      case 'monsterProp': // OnMonsterProp (:6630) names no object
        this.setMonsterRates(message);
        return;
      case 'definedText': // OnDefinedText (:4117) and OnDefinedText1 (:4230) name no object
        this.combat({ kind: 'text', textId: message.textId, args: message.args });
        return;
      case 'setState': // OnSetState (:13514) and OnTaskBar (:4285) take no object ID: they are g_pPlayer's
      case 'taskBar':
        this.toOwn(message, objectId);
        return;
      default:
        break;
    }
    const m = this.byId.get(objectId);
    if (m === undefined) return;
    switch (message.type) {
      case 'moverMoved': // OnMoverMoved (:8574), the move aged by the server clock
        applyMoved(m, message.move, this.clock.offsetMs(message.move.tick), false);
        break;
      case 'moverBehavior': // OnMoverBehavior (:8653)
        applyMoved(m, message.move, this.clock.offsetMs(message.move.tick), true);
        break;
      case 'moverCorr': // OnMoverCorr (:8929): another player's PLAYERCORR, passed on
        applyMoverCorr(m, message.move);
        break;
      case 'moverAngle':
        // OnMoverAngle (:8887) starts with `if( IsFly() == FALSE ) return;`: it is the flier's correction
        break;
      case 'destPos': // OnSetDestPos (:3731)
        applyDestPos(m, message.pos, message.forward);
        break;
      case 'destAngle': // OnSetDestAngle (:3769)
        setDestAngle(m, message.angle, message.left);
        break;
      case 'setDestObj': // OnMoverSetDestObj (:8561) follows only a target that is in view
        if (this.byId.has(message.targetId)) setDestObj(m, message.targetId, message.range);
        break;
      case 'motion': // OnMotion (:9951)
        applyMotion(m, message.message);
        break;
      case 'setPos':
        this.setPos(m, message.pos);
        break;
      case 'setPosAngle':
        this.setPosAngle(m, message.pos, message.angle);
        break;
      case 'meleeAttack':
        // OnMeleeAttack (:3802-3815): the swing now, or kept for the end of the one under way (`meleeAttack`)
        if (m.act.meleeAttack(message.message, message.targetId, message.param2, message.param3)) {
          this.combat({ kind: 'swing', attackerId: objectId, targetId: message.targetId });
        }
        break;
      case 'damage':
        this.damage(m, message);
        break;
      case 'moverDeath':
        this.moverDeath(m, message);
        break;
      case 'setPointParam': // OnSetPointParam (:3303): SetPointParam on the mover; another's MP and FP are not kept
        if (this.numbersOf(m) !== undefined) this.toOwn(message, objectId);
        else if (message.param === DstParam.HP) this.setHitPoint(m, message.value);
        break;
      case 'setExperience': // OnSetExperience (:3376), OnSetGrowthLearningPoint (:3531): sent to the user about itself
      case 'setGrowthLearningPoint':
        this.toOwn(message, objectId);
        break;
      case 'setLevel':
        this.setLevel(m, message.level);
        break;
      case 'corrReq': // OnCorrReq (:10015-10028): SetPos, and m_idAttacker, which the browser does not keep
        m.act.body.pos = [f32(message.pos[0]), f32(message.pos[1]), f32(message.pos[2])];
        break;
      case 'revival': // OnRevival (:3450-3482): ClearState; its HP lines are __VER < 9
        m.act.clearState();
        this.toOwn(message, objectId);
        break;
      case 'revivalToLodestar':
        this.revivalToLodestar(m, message);
        break;
      default: // addOther, environmentSetting, worldReadInfo, replace, queryGetDestObj: not kept here
        break;
    }
  }

  /**
   * One 60 Hz step of the rules for every mover in view, except fliers: a mover flying (`OBJSTAF_FLY`) or a flying
   * monster (`Mover.flying`), which `CActionMover::ProcessCollision` moves with `ProcessCollisionFly`
   * (`ActionMover.cpp:176-191`). Players, monsters and NPCs collide alike: `CMover::Process` runs
   * `ProcessCollisionGround` for every other mover (`Mover.cpp:3884`), and its exceptions are overruled
   * (`ActionMoverCollision.cpp:193`).
   */
  step(): void {
    for (const m of this.byId.values()) {
      if (m.act.stateFlag & ObjStaF.FLY || m.flying) continue;
      stepMover(m, this.find, this.ground);
    }
  }

  /** The changes since the last call (see `WorldChanges`). */
  takeChanges(): WorldChanges {
    const changes = {
      added: this.pendingAdded, removed: [...this.pendingRemoved], combat: this.pendingCombat, own: this.pendingOwn,
      dropped: this.dropped,
    };
    this.pendingAdded = [];
    this.pendingRemoved = new Set();
    this.pendingCombat = [];
    this.pendingDrawn = 0;
    this.dropped = 0;
    this.pendingOwn = [];
    return changes;
  }

  /**
   * ADD_OBJ of a mover (`OnAddObj`, :1053). An ID already in view keeps its mover and the new data is dropped: for an
   * object that is in a world `OnAddObj` reads the new one into a throwaway object and cancels the old one's pending
   * deletion (:1081-1104). After a DEL_OBJ the ID is free, so the next ADD_OBJ adds a new mover. A mover that is not a
   * player, added outside the JOIN bundle within 32 m of the own mover on the ground (floats, `GetPos()` minus
   * `g_pPlayer->GetPos()`), spawns with an effect (:1215-1228).
   */
  private add(objectId: number, added: AddedMover, joining: boolean): void {
    if (this.byId.has(objectId)) return;
    const mover = this.build(objectId, added);
    this.byId.set(objectId, mover);
    if (mover.isSelf) this.own = mover;
    this.pendingAdded.push(mover);
    const own = this.own;
    if (joining || added.isPlayer || own === undefined) return;
    const [x, , z] = mover.act.body.pos;
    const dx = f32(x - own.act.body.pos[0]);
    const dz = f32(z - own.act.body.pos[2]);
    if (f32(f32(dx * dx) + f32(dz * dz)) < SPAWN_RANGE_SQ) this.combat({ kind: 'spawned', moverId: objectId });
  }

  /**
   * `OnRemoveObj` (:1643): the object is deleted. A mover that came since the last `takeChanges` leaves the changes
   * without a trace, so a hidden tab, which takes none, keeps neither its mover nor its ID.
   */
  private remove(objectId: number): void {
    const old = this.byId.get(objectId);
    if (old === undefined) return;
    this.byId.delete(objectId);
    if (old === this.own) this.own = undefined;
    const unseen = this.pendingAdded.indexOf(old);
    if (unseen >= 0) this.pendingAdded.splice(unseen, 1);
    else this.pendingRemoved.add(objectId);
  }

  /**
   * The mover `CMover::Serialize` makes of an ADD_OBJ (`ObjSerializeOpt.cpp:364-400`): the motion, the state flag
   * (`ClearStateFlag`, then `AddStateFlag( dw2 )`) and the state (`__ForceSetState( dw1 )`), at the position and angle
   * of the object (`CObj::Serialize`), with its HP (`m_nHitPoint`) and, for a player, its level. Its speed is
   * `CMover::GetSpeed( m_fSpeed )` (`MoverParam.cpp:3262`): `m_fSpeed` is the mover's `fSpeed`, halved for a monster
   * (`CreateObj.cpp:644-649`: `dwAI == AII_MONSTER`; a player's is set again from `fSpeed` alone, `Mover.cpp:1521`), times
   * `m_fSpeedFactor`, which is 1 (`Mover.cpp:517`) unless the NPC part of the ADD_OBJ sends one
   * (`ObjSerializeOpt.cpp:753`); floats throughout, and no buff changes it here. The own mover's numbers are its
   * `OwnState`'s, when the world has them; any other's max HP is `maxHpOf`'s.
   *
   * The rules' calls into `CMover` that the world answers are set here, for every mover: `prj.GetMover` for a swing's
   * target and a forced death's attacker (`findMover`), `m_nHitPoint` (`hitPoint`), and a swing's hit frame (`onHit`);
   * and another player's attack speed (`attackSpeed`, `attackSpeedOf`). The own one's is the attack loop's, which has
   * the own numbers' items and buffs.
   */
  private build(objectId: number, added: AddedMover): Mover {
    const prop = this.data.movers.get(added.index);
    const speedFactor = added.npc?.speedFactor ?? 1;
    const tableSpeed = f32(prop?.speed ?? 0);
    const halved = !added.isPlayer && prop?.ai === AII_MONSTER;
    const speed = f32((halved ? f32(tableSpeed / 2) : tableSpeed) * f32(speedFactor));
    const act = new ActionMover({ pos: added.pos, angle: added.angle, speed, isPlayer: added.isPlayer });
    act.motion = added.motion;
    act.stateFlag = added.stateFlag >>> 0;
    act.state = added.state >>> 0;

    let kind: MoverKind;
    let name: string;
    if (added.isPlayer) {
      kind = 'player';
      name = added.player?.name ?? '';
    } else if (added.npc !== undefined && added.npc.characterKey !== '') {
      // `CProject::GetCharacter` (`Project.h:1376`): the key is looked up lower-cased
      kind = 'npc';
      name = this.data.npcs.get(added.npc.characterKey.toLowerCase())?.name ?? '';
    } else {
      kind = 'monster';
      name = prop?.name ?? '';
    }
    const isSelf = added.player?.self === true;
    const level = added.isPlayer ? added.player?.level ?? 1 : Math.max(prop?.level ?? 1, 1);
    const mover: Mover = {
      objectId, act, dest: null, corr: null, speedFactor, isSelf, kind, added, name, flying: prop?.flying === true,
      hp: added.hitPoint, level, maxHp: this.maxHpOf(added, level),
    };
    const numbers = this.numbers;
    if (isSelf && numbers?.objectId === objectId) {
      // one source for the own numbers: an accessor with no setter, so that nothing here sets them by mistake
      Object.defineProperties(mover, {
        hp: { get: () => numbers.hp, enumerable: true },
        level: { get: () => numbers.level, enumerable: true },
        maxHp: { get: () => numbers.maxHp(), enumerable: true },
      });
    }
    act.findMover = (id) => this.byId.get(id)?.act;
    act.hitPoint = () => mover.hp;
    act.onHit = () => this.onAttackMelee(mover);
    if (added.isPlayer && !isSelf) act.attackSpeed = () => this.attackSpeedOf(mover);
    return mover;
  }

  /**
   * `CMover::GetMaxHitPoint()` (`MoverParam.cpp:2788-2805`) of a mover at `level` whose numbers are not `OwnState`'s,
   * over `GetMaxOriginHitPoint( FALSE )` (:2856-2884):
   * - a player: its job's `fFactorMaxHP`, its level and `GetSta()` (`maxHitPoint`);
   * - any other mover: its `dwAddHp` times its MONSTERPROP rate (`monsterMaxHitPoint`).
   * Another player's items and buffs are left out (`GetSta()`'s adjustments, `DST_HP_MAX` and `DST_HP_MAX_RATE`): the
   * browser keeps no parameters of them, so its STA is the ADD_OBJ's `m_nSta`. Null with no row in the catalog (the
   * mover's, or a player's job's).
   */
  private maxHpOf(added: AddedMover, level: number): number | null {
    const player = added.player;
    if (player !== undefined) {
      const job = this.data.jobs[player.job];
      if (job === undefined) return null;
      // `maxHitPoint` reads STA alone of the stats
      return maxHitPoint(job, level, { str: 0, sta: player.sta, dex: player.dex, int: 0 }, NO_ADJUST);
    }
    const prop = this.data.movers.get(added.index);
    return prop === undefined ? null : monsterMaxHitPoint(prop.addHp, this.hpRates.get(added.index) ?? NO_RATE);
  }

  /**
   * `CMover::GetAttackSpeed()` (`MoverAttack.cpp:159-192`, `attackSpeed`) of another player, which `ProcessAniSpeed`
   * plays its swings at (`Mover.cpp:3086-3096`): its job's `fAttackSpeed`; the `fAttackSpeed` of its right hand's item
   * (`GetActiveHandItemProp`, the client's branch for another player, `Mover.cpp:2942-2947`: `m_aEquipInfo[PARTS_RWEAPON]`'s
   * item, the bare hand's `FISTS` for none, and `fItem`'s 1.0f for an item with no row); its DEX (`GetDex()`) and its
   * level. Its items' and buffs' `DST_ATTACKSPEED`, `DST_ATTACKSPEED_RATE` and DEX are left out, as for its max HP. With
   * no job row, the hook's 1.0 (`GetAttackSpeed` would `ASSERT`).
   */
  private attackSpeedOf(m: Mover): number {
    const player = m.added.player;
    const job = player === undefined ? undefined : this.data.jobs[player.job];
    if (player === undefined || job === undefined) return 1;
    const item = rightHandItem(player);
    const weaponSpeed = item === null ? FISTS.attackSpeed : this.data.itemProps.get(item)?.attackSpeed ?? NO_ITEM_SPEED;
    return attackSpeed(job, weaponSpeed, m.level, player.dex, NO_ADJUST).speed;
  }

  /** The own character's numbers, when `m` is the own mover and the world has them. */
  private numbersOf(m: Mover): OwnState | undefined {
    return m.isSelf && this.numbers?.objectId === m.objectId ? this.numbers : undefined;
  }

  /**
   * A message to the own character's numbers (`OwnState.apply`, which ignores one about another mover), and what it
   * played. A level up plays its motion on the own mover, as `CMover::SetExperience` does (`MoverParam.cpp:1725-1726`).
   */
  private toOwn(message: WorldMessage, objectId: number): void {
    if (this.numbers === undefined) return;
    for (const event of this.numbers.apply(message, objectId)) {
      if (event.kind === 'levelUp' && this.own?.objectId === this.numbers.objectId) this.own.act.levelUpMotion();
      this.pendingOwn.push(event);
    }
  }

  /** An event to hand out; past `MAX_PENDING_COMBAT` the oldest that is not a text goes, counted. */
  private combat(event: CombatEvent): void {
    this.pendingCombat.push(event);
    if (event.kind === 'text' || ++this.pendingDrawn <= MAX_PENDING_COMBAT) return;
    this.pendingCombat.splice(this.pendingCombat.findIndex((e) => e.kind !== 'text'), 1);
    this.pendingDrawn--;
    this.dropped++;
  }

  /**
   * `CMover::SetPointParam( DST_HP, nValue )` on the client (`MoverParam.cpp:894-910`) for a mover whose numbers are not
   * `OwnState`'s: at least 0, and at most `GetMaxHitPoint()` (with no catalog row, no max).
   */
  private setHitPoint(m: Mover, value: number): void {
    let hp = Math.max(0, value);
    if (m.maxHp !== null && hp > m.maxHp) hp = m.maxHp;
    m.hp = hp;
  }

  /**
   * `CDPClient::OnDamage` (`DPClient.cpp:1758-1934`) on a mover in view: a knock-back's position and angle first
   * (:1771-1781); `IncHitPoint( -dwHit )`, an HP that reaches 0 being 1, since a hit never kills (:1785-1788, the own
   * mover's in its numbers); a sitting mover stands (:1789-1790); then the drawing (`hit`, with whether the attacker was
   * in view, :1810-1812); and for an attacker in view (`prj.GetCtrl`: only movers are kept, so a valid object that is not
   * a mover, :1923-1931, is none here), the knock-back of `AF_FLYING`, with the attacker's `OBJMSG_STOP` (:1910-1921).
   * The critical's sound is the screen's.
   */
  private damage(m: Mover, message: MessageOf<'damage'>): void {
    const { attackerId, hit, flags, fly } = message;
    const attacker = this.byId.get(attackerId);
    if (fly !== null) {
      m.act.body.pos = [f32(fly.pos[0]), f32(fly.pos[1]), f32(fly.pos[2])];
      m.act.body.angle = wrapAngle(fly.angle);
    }
    if (this.numbersOf(m) !== undefined) {
      this.toOwn(message, m.objectId);
    } else {
      this.setHitPoint(m, m.hp - (hit | 0)); // (int)( (-1) * (int)( dwHit ) )
      if (m.hp === 0) m.hp = 1;
    }
    m.act.unsit();
    this.combat({ kind: 'hit', victimId: m.objectId, attackerId, hit, flags, attackerInView: attacker !== undefined });
    if (attacker !== undefined && flags & AttackFlag.FLYING && m.act.knockFlying(attacker.act.body.angle)) {
      attacker.act.sendActMsg(ActMsg.STOP);
    }
  }

  /**
   * `CDPClient::OnMoverDeath` (`DPClient.cpp:1936-2090`) on a mover in view: its HP before (`GetHitPoint()`, the death's
   * number) and then 0 (`IncHitPoint( -nHitPoint )`, :1944-1945, the own mover's in its numbers); the attacker in view
   * forgets the mover it hit and the one it followed (`SetObjHit( NULL_ID )`, `ClearDestObj`, :2008-2009), and the
   * drawing (`death`, with whether the killer was found, :1998-2007); and `OBJMSG_DIE` with how it died and who killed it
   * (:2011). The focus, the auto-attack and the own death's windows, music and texts are the world screen's.
   */
  private moverDeath(m: Mover, message: MessageOf<'moverDeath'>): void {
    const lastHp = m.hp;
    if (this.numbersOf(m) !== undefined) this.toOwn(message, m.objectId);
    else this.setHitPoint(m, m.hp - lastHp);
    const attacker = this.byId.get(message.attackerId);
    if (attacker !== undefined) {
      attacker.act.hitId = null;
      clearDestObj(attacker);
    }
    const attackerInView = attacker !== undefined;
    this.combat({ kind: 'death', victimId: m.objectId, attackerId: message.attackerId, lastHp, attackerInView });
    m.act.sendActMsg(ActMsg.DIE, message.message, message.attackerId);
  }

  /**
   * `CDPClient::OnSetLevel` (`DPClient.cpp:3339-3359`), another player's level (the world server sends it to the others
   * only, `CUserMng::AddSetLevel`; the own numbers ignore it): a higher level plays the level up (its motion when
   * standing, `levelUpMotion`, and its effect); then the level, and the HP at the max of that level
   * (`m_nHitPoint = GetMaxHitPoint()`; the MP, which is not kept for others, likewise).
   */
  private setLevel(m: Mover, level: number): void {
    if (this.numbersOf(m) !== undefined) return;
    if (level > m.level) {
      m.act.levelUpMotion();
      this.combat({ kind: 'levelUp', moverId: m.objectId });
    }
    m.level = level;
    m.maxHp = this.maxHpOf(m.added, level);
    if (m.maxHp !== null) m.hp = m.maxHp;
  }

  /**
   * `CDPClient::OnRevivalLodestar` (`DPClient.cpp:3484-3513`, `__VER >= 9`): `ClearState`, then the HP at the level's
   * tenths of its max (`lodestarRate`, :3501), which for the own mover its numbers do. The SETPOINTPARAMs that follow set
   * it again.
   */
  private revivalToLodestar(m: Mover, message: MessageOf<'revivalToLodestar'>): void {
    m.act.clearState();
    if (this.numbersOf(m) !== undefined) this.toOwn(message, m.objectId);
    else if (m.maxHp !== null) m.hp = Math.trunc(m.maxHp * lodestarRate(m.level) / 10);
  }

  /**
   * `CMover::OnAttackMelee( dwState, pHitObj )` on the client (`MoverActEvent.cpp:1592-1726`), which the rules call at a
   * swing's hit frame with its target in view and alive (`ActionMover.onHit`). Five monsters' hits have handlers of their
   * own, left out (`OWN_MELEE_HANDLERS`). Any other's is `OnDamage` (:1503-1588): the victim's model flashes (`spark`,
   * :1522-1538), then the blow (`onDamageMsgC`); one that lands holds a player attacker's model 5 steps, and a monster's
   * and its victim's not at all (:1693-1701), and flashes the attacker's model (:1704-1717). The hit sound and the action
   * point the own ATK1 earns (:1674-1678) are the screen's.
   */
  private onAttackMelee(attacker: Mover): void {
    if (OWN_MELEE_HANDLERS.has(attacker.added.index)) return;
    const targetId = attacker.act.targetId;
    const victim = targetId === null ? undefined : this.byId.get(targetId);
    if (victim === undefined) return;
    this.combat({ kind: 'spark', moverId: victim.objectId, fromId: attacker.objectId });
    if (!this.onDamageMsgC(victim, attacker)) return;
    if (attacker.added.isPlayer) {
      attacker.act.pause(5);
    } else {
      attacker.act.pause(0);
      victim.act.pause(0);
    }
    this.combat({ kind: 'spark', moverId: attacker.objectId, fromId: victim.objectId });
  }

  /**
   * A swing's blow on `victim`: `SendDamage( m_dwAtkFlags, ... )`, its flags `AF_GENERIC` on the client
   * (`ActionMoverMsg.cpp:699`), through `PreProcessDamage` (`ActionMoverMsg.cpp:1190-1228`: none on a player in
   * `MATCHLESS_MODE`, nor on a mover that is not a player and cannot be killed, `bKillable != 1`) to `OnDamageMsgC`
   * (`ActionMoverDmg.cpp:54-122`): none on a mover in a dead state; a sitting victim stands, then `OBJMSG_STAND`, the
   * drawing (`attackerHit`) and the flinch (`SetDamagedMotion`). True where it landed. Left out: the stone state
   * (`CHS_SETSTONE`, buffs), and `m_idAttacker`, `m_idTargeter` and `m_idLastHitMover`, which the browser does not keep.
   */
  private onDamageMsgC(victim: Mover, attacker: Mover): boolean {
    if ((victim.added.player?.mode ?? 0) & MATCHLESS_MODE) return false;
    if (!victim.added.isPlayer) {
      const prop = this.data.movers.get(victim.added.index);
      if (prop !== undefined && prop.killable !== 1) return false;
    }
    if (victim.act.isDie()) return false;
    victim.act.unsit();
    victim.act.sendActMsg(ActMsg.STAND);
    const weapon = this.handItem(attacker);
    this.combat({ kind: 'attackerHit', attackerId: attacker.objectId, victimId: victim.objectId, weapon });
    victim.act.setDamaged();
    return true;
  }

  /**
   * The ID of `CMover::GetActiveHandItemProp()`'s item (`Mover.cpp:2930-2968`, the client's branches): a player's right
   * hand, the bare hand's `II_WEA_HAN_HAND` when it is empty: the own one's from its numbers (the lobby's equipment),
   * another's from `m_aEquipInfo[PARTS_RWEAPON]`, the worn part's item ID. Any other mover's is its `m_dwVirtItem`
   * (`VT_ITEM`, :2960-2966), which `CMover::InitProp` takes from its row's `dwAtk1` (:1536); null for `NULL_ID` (`=`), and
   * for a mover the catalog has no row for. Null for the own mover with no numbers.
   */
  private handItem(m: Mover): number | null {
    if (!m.added.isPlayer) {
      const atk1 = this.data.movers.get(m.added.index)?.atk1 ?? NULL_ITEM;
      return atk1 === NULL_ITEM ? null : atk1;
    }
    if (m.isSelf) {
      const numbers = this.numbersOf(m);
      return numbers === undefined ? null : numbers.equipped.weapon?.id ?? II_WEA_HAN_HAND;
    }
    const player = m.added.player;
    return (player === undefined ? null : rightHandItem(player)) ?? II_WEA_HAN_HAND;
  }

  /**
   * `CDPClient::OnMonsterProp` (`DPClient.cpp:6630-6698`): each rate the percent over 100 into the mover row of that
   * name, `prj.GetMoverProp( szMonsterName )` (`m_mapMVI`, a map that keeps the first row of a name,
   * `ProjectCmn.cpp:160`; the catalog lists the rows as `propMover.txt` does); then each name removed back to 1.0. A
   * name no row has is skipped. `GetMaxHitPoint` is worked out each time it is asked, so the max HP of the movers in
   * view follows; their HP stays as it is.
   */
  private setMonsterRates({ rates, removed }: MessageOf<'monsterProp'>): void {
    for (const rate of rates) {
      const index = this.moverIndexOf(rate.name);
      if (index !== undefined) this.hpRates.set(index, rate.hitPoint);
    }
    for (const name of removed) {
      const index = this.moverIndexOf(name);
      if (index !== undefined) this.hpRates.delete(index);
    }
    for (const m of this.byId.values()) if (!m.added.isPlayer) m.maxHp = this.maxHpOf(m.added, m.level);
  }

  private moverIndexOf(name: string): number | undefined {
    if (this.moversByName === undefined) {
      this.moversByName = new Map();
      for (const prop of this.data.movers.values()) {
        if (!this.moversByName.has(prop.name)) this.moversByName.set(prop.name, prop.index);
      }
    }
    return this.moversByName.get(name);
  }

  /**
   * `CDPClient::OnSetPos` (:2215) for a mover in the world: `SetPos`, then `ClearDest` (not the destination angle),
   * `OBJMSG_ACC_STOP` (a flier's: the ground rules have no such message), `OBJMSG_STOP_TURN` and `OBJMSG_STAND`. For
   * the player's own character it also re-reads the world around the new position and moves the camera, which the
   * scene does.
   */
  private setPos(m: Mover, pos: Vec3): void {
    m.act.body.pos = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    m.act.clearDest(); // the rules' ClearDest from its first step or destination on; until then there is none
    m.act.sendActMsg(ActMsg.STOP_TURN);
    m.act.sendActMsg(ActMsg.STAND);
  }

  /** `CDPClient::OnSetPosAngle` (:2275): `SetPos( vPos )` and `SetAngle( fAngle )`, nothing cleared. */
  private setPosAngle(m: Mover, pos: Vec3, angle: number): void {
    m.act.body.pos = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    m.act.body.angle = wrapAngle(angle);
  }
}
