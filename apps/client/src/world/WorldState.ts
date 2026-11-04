import { AttackFlag, DstParam, NULL_ID, STATE_BASEMOTION_MODE, StateModeFlag } from '@flyffweb/protocol';
import type { WebSkill } from '@flyffweb/formats';
import type { AddedMover, AddedPlayer, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { ServerClock } from '../net/serverClock';
import { sightBlocked } from './combat/lineOfSight';
import type { MissileClass, MissileLaunch } from './combat/missiles';
import { MoverBuffs } from './buffs';
import type { OwnShots } from './combat/ownShots';
import type { GameData } from './gameData';
import { lodestarRate } from './OwnState';
import type { OwnEvent, OwnState } from './OwnState';
import { Parts } from './render/looks';
import { equipmentPart } from './items/equipment';
import { ActionMover, getDegree, wrapAngle } from './sim/ActionMover';
import type { Ground } from './sim/collision';
import { ActMsg, Ext, Ik3, Kt, Mti, ObjSta, ObjStaF, Si, Sut } from './sim/constants';
import {
  resetForRide, applyBehavior2, applyDestPos, applyMotion, applyMoved, applyMoved2, applyMoverAngle, applyMoverCorr, applyMoverCorr2,
  buffedSpeed, clearDestObj, setDestAngle, setDestObj, stepMover,
} from './sim/moverRules';
import { PARTS_RIDE } from './sim/constants';
import type { FlightRide } from './sim/flight';
import type { SimMover } from './sim/moverRules';
import { Dst, FISTS, NO_ADJUST, attackSpeed, maxHitPoint, monsterMaxHitPoint } from './sim/params';

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

/** `NO_ATTACK_MODE` (`_Common/authorization.h:112`): a player in it uses no skill (`DoUseSkill`, `MoverSkill.cpp:317`). */
const NO_ATTACK_MODE = 0x00000040;

/** The message of this `type`. */
type MessageOf<T extends WorldMessage['type']> = Extract<WorldMessage, { type: T }>;

export type MoverKind = 'player' | 'monster' | 'npc';

/** A mover in view: the rules' `SimMover` (kept as one object for its whole life) and what ADD_OBJ said about it. */
export interface Mover extends SimMover {
  kind: MoverKind;
  isSelf: boolean;
  /**
   * Piece 7 M2: `SetActParam( OBJACT_MAGIC_ATTACK / OBJACT_RANGE_ATTACK, id, power, idSfxHit )` (`MoverSkill.cpp:3250`,
   * :3369) of the wand's or the bow's shot under way: its charge and the server's missile id (a monster's), which its hit
   * frame reads (`OnAttackMagic`, `OnAttackRange`, `GetActParam`).
   */
  shot?: { targetId: number; power: number; sfxHitId: number; itemId?: number };
  /** Piece 7 M2: the buffs on the mover (`m_buffs`), and its speed before `DST_SPEED` (`m_fSpeed` times its factor). */
  buffs: MoverBuffs;
  baseSpeed: number;
  /** Piece 7 M3: `m_dwStateMode`, a player's from its ADD_OBJ, then STATEMODE's (`OnStateMode`, `DPClient.cpp:12381-12440`). */
  stateMode: number;
  /**
   * Piece 7 M3: the item the mover casts (`m_dwUseItemId`, a prop id) while in `STATE_BASEMOTION_MODE`, or null: from
   * STATEMODE ON, at the world's clock (`m_nReadyTime = timeGetTime()`, the own gauge's start), or from an ADD_OBJ met
   * mid-cast, with no start (`OnAddObj`, `:1380-1391`, makes the effect and leaves `m_nReadyTime` 0: no gauge).
   */
  cast: { itemId: number; startedAt: number | null } | null;
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
 * - `skillHit`: a hit frame of the melee skill `skill` (`SI_*`) that `casterId` uses at `targetId` (`CMover::OnMeleeSkill`,
 *   `MoverActEvent.cpp:72-164`): the skill's effect (`CCtrl::CreateSkillSfx`, `Ctrl.cpp:878-997`), and, where the blow
 *   `landed` (`OnDamageMsgC` took it), the victim's shake. The flinch, the pause and the caster's flash are done.
 * - `sfxObj`: CREATESFXOBJ's effect `xi` (`OnCreateSfxObj`, `DPClient.cpp:4038-4067`): at the absolute position `pos`, or,
 *   `pos` being null, on the mover `moverId`, which was in view as the message came.
 */
export type CombatEvent =
  | { kind: 'hit'; victimId: number; attackerId: number; hit: number; flags: number; attackerInView: boolean }
  | { kind: 'death'; victimId: number; attackerId: number; lastHp: number; attackerInView: boolean }
  | { kind: 'swing'; attackerId: number; targetId: number }
  | { kind: 'spark'; moverId: number; fromId: number }
  | { kind: 'attackerHit'; attackerId: number; victimId: number; weapon: number | null }
  | { kind: 'levelUp'; moverId: number }
  | { kind: 'text'; textId: number; args: string | null }
  | { kind: 'spawned'; moverId: number }
  | { kind: 'skillHit'; casterId: number; targetId: number; skill: number; landed: boolean; level?: number }
  | { kind: 'sfxObj'; xi: number; pos: Vec3 | null; moverId: number | null }
  /** Piece 7 M2: a job change, the own or another's: `XI_GEN_LEVEL_UP01` on the mover (`DPClient.cpp:3637`, `:3700`). */
  | { kind: 'jobChanged'; moverId: number }
  /** Piece 7 M2: a skill's cast effect (`dwSfxObj`) on its caster as the skill begins (`MoverSkill.cpp:993-996`). */
  | { kind: 'cast'; casterId: number; xi: number }
  /**
   * Piece 7 M2: the mover's model lit in `color` (`m_SparkInfo`) from behind it, `AngleToVectorXZ( fromAngle, -1 )`: the
   * white flash of a magic skill's shot (`MoverActEvent.cpp:655-664`). The cyan of a cast is the views' own, each step.
   */
  | { kind: 'tint'; moverId: number; color: Vec3; fromAngle: number }
  /**
   * Piece 7 M3: the mover casts `itemId` (a prop id): `CreateItemReadySfx` of its `dwSfxObj` at the mover. `fresh` for
   * STATEMODE ON (`OnStateMode`), false for a mover added mid-cast (`OnAddObj`).
   */
  | { kind: 'itemCast'; moverId: number; itemId: number; fresh: boolean }
  /** Piece 7 M5: the mover took off (`flying`) or landed: its ride is drawn or taken away, and the own camera changes. */
  | { kind: 'flight'; moverId: number; flying: boolean };

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

/** `WT_RANGE` and `WT_RANGE_BOW` (`Resource/defineAttribute.h:59-62`): the items `DoAttackRange` shoots with. */
const WT_RANGE = 8;
const WT_RANGE_BOW = 21;
/** `XI_FIR_WAND01` and `XI_HIT_WAND01` (`Resource/defineObj.h`): the wand's missile with no prop, and its hit model. */
const XI_FIR_WAND01 = 27;
const XI_HIT_WAND01 = 22;
/** `pSfx->SetScale` by the charge (`MoverActEvent.cpp:843-849`); 0 keeps the effect's own. */
const WAND_SCALES: Readonly<Record<number, number>> = { 1: 1.2, 2: 1.7, 3: 2.5, 4: 2.5 };
/**
 * The missile classes of `CreateSfx`'s switch (`_Common/CreateObj.cpp:33-280`) that M2 flies: `CSfxItemWandAtk1` for
 * `XI_FIR_WAND01`, `XI_ITEM_WAND_ATK1` and the monsters' `XI_NPC_RAN_SPITTL`, `_GAS`, `_MAGICBALL`, `_MAGICBLUE`,
 * `_CARD` and `_CANNON`; `CSfxItemRangeAtk1` for `XI_ITEM_RANGE_ATK1` to `4`.
 */
const MISSILE_CLASSES: ReadonlyMap<number, MissileClass> = new Map([
  [27, 'wand'], [100, 'wand'], [1600, 'wand'], [1601, 'wand'], [1602, 'wand'], [1604, 'wand'], [1605, 'wand'], [1607, 'wand'],
  [112, 'arrow'], [113, 'arrow'], [114, 'arrow'], [115, 'arrow'],
]);

/**
 * The class `CreateSfx` makes of `xi`, or null: any other is a plain `CSfx` (`default`, :279), which never reaches
 * its target (no `DamageToTarget`), and is not made here.
 */
function missileClassOf(xi: number): MissileClass | null {
  return MISSILE_CLASSES.get(xi) ?? null;
}

/**
 * Piece 7 M2: the classes of `CreateShootSfx` (`_Common/CreateObj.cpp:432-540`) for a skill's `dwSfxObj2`: Junk Bow
 * and Triple Shot's (536, 547), the bow skills' arrows (537-540), Sword Wind (269), Strong Wind (270), the straight
 * four (Boomerang 264, Ice Missile 302, Lightning Ball 303, Spike Stone 304), Hot Air (265), Guillotine's wave (230);
 * the wand's and the arrow's (`missileClassOf`); any other a `CSfxShoot` (`default`).
 */
const SKILL_MISSILE_CLASSES: ReadonlyMap<number, MissileClass> = new Map([
  [536, 'junkBow'], [547, 'junkBow'], [537, 'skillArrow'], [538, 'skillArrow'], [539, 'skillArrow'], [540, 'skillArrow'],
  [269, 'swordWind'], [270, 'strongWind'], [264, 'straight'], [302, 'straight'], [303, 'straight'], [304, 'straight'],
  [265, 'hotAir'], [230, 'wave'],
]);
/**
 * The hit models the classes load of their own (`m_SfxObj2.SetSfx`, `Sfx.cpp`): `XI_SKILL_MAG_*01_01`
 * (`Resource/defineObj.h:720-726`); Guillotine's wave hits with its own effect again (`Sfx.cpp:3600-3606`).
 */
const SKILL_HIT_MODELS: ReadonlyMap<number, number> = new Map([
  [270, 1736], [269, 1737], [264, 1738], [265, 1739], [302, 1740], [303, 1741], [304, 1742], [230, 230],
]);

function skillMissileClassOf(xi: number): MissileClass {
  return SKILL_MISSILE_CLASSES.get(xi) ?? missileClassOf(xi) ?? 'shoot';
}

/** The hit effect of a missile: the wand class's own `XI_HIT_WAND01` (`Sfx.cpp:912-921`), else its `m_dwSfxHit`. */
function hitXiOf(cls: MissileClass, sfxHit: number): number {
  return cls === 'wand' ? XI_HIT_WAND01 : sfxHit;
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
  readonly groundItems = new Map<number, import('@flyffweb/protocol').GroundItem>();
  private itemBounds: [number, number] = [1_000_000, 1_000_000];
  setItemBounds(width: number, depth: number): void {
    this.itemBounds = [width, depth];
    for (const [id, drop] of this.groundItems) if (drop.pos[0] >= width || drop.pos[2] >= depth) this.groundItems.delete(id);
  }
  onEquipmentChange: (mover: Mover) => void = () => {};
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
   * `CDPClient::OnUseSkill` (`DPClient.cpp:3894-3950`) beyond the mover's rules, told of each USESKILL of a mover in view
   * after its `DoUseSkill`, with whether that began the skill (`bSuccess`): the own one's request is answered
   * (`REQ_USESKILL`), and a skill begun moves the action slot on and may start the auto-attack. Its owner (the own skill
   * use, `SkillUse.onUseSkill`) sets it; it is told in the message's order, before the next message is applied.
   */
  onUseSkill: (casterId: number, message: MessageOf<'useSkill'>, started: boolean) => void = () => {};

  /**
   * `ground` is the world the movers stand on and collide with (D3D coordinates); `numbers` the own character's numbers,
   * when the world screen has them, which the messages about it change.
   */
  /**
   * Piece 7 M2: where the missiles the movers make go (`Missiles`, the world screen's); none, none made. And where a
   * mover's hand is now (`CModelObject::GetHandPos`, `ModelObject.cpp:2388+`), from its model; null with no model.
   */
  missiles: { launch(launch: MissileLaunch): number } | null = null;
  /** Piece 7 M2: the steps run, the buffs' clock (`nowMs`). */
  private steps = 0;
  handOf: (moverId: number, hand: 'right' | 'left') => Vec3 | null = () => null;
  /** Piece 7 M2: the own missiles' ids and their SFX_ID (`OwnShots`, the world screen's); none, none sent. */
  shots: Pick<OwnShots, 'register'> | null = null;

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

  /** `prj.GetUserByID( idPlayer )` (Piece 7 M4): the player in view with this database ID (`m_idPlayer`), the own one included. */
  moverByPlayerId(playerId: number): Mover | undefined {
    for (const mover of this.byId.values()) {
      if (mover.kind === 'player' && mover.added.player?.playerId === playerId) return mover;
    }
    return undefined;
  }

  /**
   * One message of a bundle, about the object `objectId`. A mover message for an ID not in view is ignored. `joining`
   * says the message is the JOIN bundle's (`fJoin`, `DPClient.cpp:909-911`), whose movers appear with no effect.
   */
  apply(objectId: number, message: WorldMessage, joining = false): void {
    switch (message.type) {
      case 'addItem': {
        const { pos, item } = message.item;
        if (this.data.itemProps.has(item.itemId) && item.count > 0 &&
            pos.every(Number.isFinite) && pos[0] >= 0 && pos[2] >= 0 && pos[0] < this.itemBounds[0] &&
            pos[2] < this.itemBounds[1] && pos.every((n) => Math.abs(n) <= 1_000_000)) {
          this.groundItems.set(objectId, message.item);
        }
        return;
      }
      case 'createItem':
      case 'updateItem':
      case 'moveItem':
        this.toOwn(message, objectId);
        return;
      case 'equipItem': {
        this.toOwn(message, objectId);
        const mover = this.byId.get(objectId);
        // Piece 7 M5: a ride worn or taken off flies or lands its mover (MODE_FLY, MODE_GROUND; MoverEquip.cpp:1817-1828)
        if (mover) this.rideChanged(mover, message.itemId, message.equip);
        const player = mover?.added.player;
        if (mover && player) {
          if (mover.isSelf) player.equipmentObjectIds = [...(this.numbers?.equipmentObjectIds ?? player.equipmentObjectIds)];
          else {
            const prop = this.data.itemProps.get(message.itemId);
            const part = prop ? equipmentPart(prop, message.part, message.equip, player.job,
              (slot) => this.data.itemProps.get(player.worn.find((p) => p.part === slot)?.itemId ?? -1),
              message.part < 0 ? player.worn.find((p) => p.itemId === message.itemId)?.part : message.part) : undefined;
            if (part === undefined || part < 0 || part >= 31) return;
            player.worn = player.worn.filter((w) => w.part !== part);
            const exclusive = this.data.items.get(message.itemId)?.exclusive ?? -1;
            if (message.equip && exclusive >= 0) player.worn = player.worn.filter((w) => w.part !== exclusive);
            if (message.equip) player.worn.push({ part, itemId: message.itemId, flag: message.flag });
          }
          this.onEquipmentChange(mover);
        }
        return;
      }
      case 'addMover':
        this.add(objectId, message.mover, joining);
        return;
      case 'delObj':
        this.groundItems.delete(objectId);
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
      case 'doUseSkillPoint': // OnDoUseSkillPoint (:14730), OnInitSkillPoint (:14687) and OnSetActionPoint (:15798) too
      case 'initSkillPoint':
      case 'setActionPoint':
      // OnRemoveQuest (:14633), OnCheckedQuest (:19245), OnQuestTextTime (:6750) and OnNPCPos (:18650) are g_pPlayer's
      case 'removeQuest':
      case 'questChecked':
      case 'questTextTime':
      case 'questHelperNpcPos':
        this.toOwn(message, objectId);
        return;
      case 'createSfxObj': // OnCreateSfxObj (:4038) plays at an absolute position for an object not in view too
        this.createSfxObj(objectId, message);
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
      case 'moverAngle': // OnMoverAngle (:8893): a flier's PLAYERANGLE; on the ground it does nothing
        applyMoverAngle(m, message);
        break;
      // Piece 7 M5: the fliers' reports (:8726-8989)
      case 'moverMoved2':
        applyMoved2(m, message.move, message.frames, this.clock.offsetMs(message.move.tick));
        break;
      case 'moverBehavior2':
        applyBehavior2(m, message.move, this.clock.offsetMs(message.move.tick));
        break;
      case 'moverCorr2':
        applyMoverCorr2(m, message.move);
        break;
      case 'setFuel': // OnSetFuel (:4026-4040): no fuel stops the thrust
        m.act.fuel = message.fuel;
        if (message.fuel === 0) m.act.sendActMsg(ActMsg.ACC_STOP);
        m.act.accFuel = message.accFuel;
        break;
      case 'sendActMsg': // OnSendActMsg (:14935-14951): ProcessActMsg1 or 2 as the server says, nParam4 1
        if (message.fly === ((m.act.stateFlag & ObjStaF.FLY) !== 0)) {
          m.act.sendActMsg(message.message, message.param1, message.param2, message.param3);
        }
        break;
      case 'meleeAttack2': // OnMeleeAttack2 (:3823-3837): the air swing (its rules are Task 11's)
        m.act.sendActMsg(message.message, message.targetId, message.param2, message.param3);
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
      case 'setSkillState': { // OnSetSkillState (:14158-14181): AddBuff on the target, its stats the server's to send
        const target = this.byId.get(message.targetId);
        target?.buffs.add(message.buffType, message.id, message.level, message.time, this.nowMs());
        break;
      }
      case 'removeSkillInfluence': // :14993-15003
        m.buffs.remove(message.buffType, message.id);
        break;
      case 'stateMode': // Piece 7 M3, OnStateMode (:12381-12440): the mode, and ON's ready effect
        m.stateMode = message.mode;
        if (message.flag === StateModeFlag.ON && message.itemId !== null) {
          m.cast = { itemId: message.itemId, startedAt: this.nowMs() };
          this.combat({ kind: 'itemCast', moverId: m.objectId, itemId: message.itemId, fresh: true });
        } else if (message.flag !== StateModeFlag.ON) {
          m.cast = null;
        }
        break;
      case 'removeAllSkillInfluence': // :15005-15010
        m.buffs.removeCommon();
        break;
      case 'setDestParam': // :3271-3305: the own numbers' buff layer; DST_SPEED the own run
      case 'resetDestParam':
      case 'resetDestParamSync':
        if (this.numbersOf(m) === undefined) break;
        this.toOwn(message, objectId);
        if (message.dst === Dst.SPEED) m.act.body.speed = buffedSpeed(m.baseSpeed, this.numbers?.adj.get(Dst.SPEED) ?? 0);
        break;
      case 'magicAttack':
        // OnMagicAttack (:3841-3857): DoAttackMagic, or kept for the end of the attack under way (busy, 0)
        if (m.isSelf) break; // the own shots are the attack loop's
        if (this.doAttackMagic(m, message.targetId, message.power) === 0) {
          m.act.keepMagicAttack({ ...message, msg: message.message });
        }
        break;
      case 'rangeAttack':
        // OnRangeAttack (:3859-3880): DoAttackRange with nParam2 as the item (a player's charge), or kept as ( 1, item )
        if (m.isSelf) break;
        if (this.doAttackRange(m, message.targetId, message.param2, message.sfxHitId) === 0) {
          m.act.keepMagicAttack({ msg: message.message, targetId: message.targetId, param2: 1, param3: message.param2, power: 0, sfxHitId: message.sfxHitId });
        }
        break;
      case 'createSfxAllow':
        this.createSfxAllow(m, message.arrowXi, message.hitXi, message.targetId);
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
      case 'setQuest': // OnSetQuest (:8444), for the active mover
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
      case 'useSkill': // OnUseSkill (:3894-3950)
        this.onUseSkill(m.objectId, message, this.doUseSkill(m, message));
        break;
      case 'setJobSkill': // OnSetChangeJob (:3600-3654): the own character's
        if (this.numbersOf(m) === undefined) break;
        this.toOwn(message, objectId);
        this.jobChanged(m);
        break;
      case 'setNearJobSkill': // OnSetNearChangeJob (:3680-3703): another player's
        this.setNearJob(m, message.job);
        break;
      // addOther, environmentSetting, worldReadInfo, replace, queryGetDestObj: not kept here; clearUseSkill and
      // endSkillQueue are the own skill use's (`SkillUse`)
      default:
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
    this.steps++;
    const now = this.nowMs();
    for (const m of this.byId.values()) {
      m.buffs.step(now);
      stepMover(m, this.find, this.ground);
      const flight = m.act.flight;
      if (flight === null) continue;
      // UnequipRide (MoverEquip.cpp:2575-2583): NOFLY land, or a world without flight, takes the ride off here
      if (flight.unequip && m.isSelf) this.land(m); // only the own player finds its ride (GetEquipItem)
      if (m.isSelf) this.pendingOwn.push({ kind: 'speed', shown: flight.speedShown });
    }
  }

  /**
   * Piece 7 M5: the world's `fly` (`CWorld::m_bFly`, the `.wld`'s; `GameData.noFlyWorlds`), which the world screen
   * sets as it enters a world. Without flight every flier is landed by `ProcessCollisionFly`.
   */
  worldFly = true;

  /**
   * Piece 7 M5: a ride (`PARTS_RIDE` with flight columns) worn flies its mover (`OBJMSG_MODE_FLY`, `nParam3` 1: no test)
   * and one taken off lands it (`OBJMSG_MODE_GROUND`); any other item does nothing here.
   */
  private rideChanged(m: Mover, itemId: number, equip: boolean): void {
    const prop = this.data.itemProps.get(itemId);
    if (prop?.flight === undefined || prop.part !== PARTS_RIDE) return;
    // DoEquip clears the destinations and the correction (MoverEquip.cpp:1825-1827); another's DoFakeEquip, ClearDest
    resetForRide(m, m.isSelf);
    if (equip) {
      m.act.modeFly(itemId, rideOf(prop.flight), prop.flight.fuelMax);
      this.combat({ kind: 'flight', moverId: m.objectId, flying: true });
    } else if (m.act.stateFlag & ObjStaF.FLY) {
      this.land(m);
    }
  }

  /** Piece 7 M5: `OBJMSG_MODE_GROUND` on the mover, and the change told. */
  private land(m: Mover): void {
    if (m.isSelf) resetForRide(m, true);
    m.act.modeGround();
    this.combat({ kind: 'flight', moverId: m.objectId, flying: false });
  }

  /** Piece 7 M2: the world's own clock, ms, from its steps (60 a second): the buffs' times run on it. */
  nowMs(): number {
    return (this.steps * 1000) / 60;
  }

  /** Piece 7 M2: the buffs of another mover's ADD_OBJ, with the time each has left (`CBuffMgr::Serialize`). */
  private buffsOf(added: AddedMover): MoverBuffs {
    const buffs = new MoverBuffs();
    const now = this.nowMs();
    for (const b of added.buffs ?? []) buffs.add(b.buffType, b.id, b.level, b.timeLeft, now);
    return buffs;
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
    // Piece 7 M3: a mover met mid-cast gets its ready effect (OnAddObj, DPClient.cpp:1380-1391)
    if (mover.cast !== null) this.combat({ kind: 'itemCast', moverId: objectId, itemId: mover.cast.itemId, fresh: false });
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
   * target and a forced death's attacker (`findMover`), `m_nHitPoint` (`hitPoint`), a swing's hit frame (`onHit`) and a
   * melee skill's (`onMeleeSkill`); and another player's attack speed (`attackSpeed`, `attackSpeedOf`). The own one's is
   * the attack loop's, which has
   * the own numbers' items and buffs.
   */
  private build(objectId: number, added: AddedMover): Mover {
    const prop = this.data.movers.get(added.index);
    const speedFactor = added.npc?.speedFactor ?? 1;
    const tableSpeed = f32(prop?.speed ?? 0);
    const halved = !added.isPlayer && prop?.ai === AII_MONSTER;
    const speed = f32((halved ? f32(tableSpeed / 2) : tableSpeed) * f32(speedFactor));
    const flyingNpc = !added.isPlayer && prop?.flying === true;
    const act = new ActionMover({ pos: added.pos, angle: added.angle, speed, isPlayer: added.isPlayer, flying: flyingNpc });
    act.motion = added.motion;
    act.stateFlag = added.stateFlag >>> 0;
    act.state = added.state >>> 0;
    // Piece 7 M5: the fuel, and a flier's ride (the worn PARTS_RIDE item: CMover::Serialize's SetRide)
    if (added.player?.fuel !== undefined) act.fuel = added.player.fuel;
    if (added.player?.accFuel !== undefined) act.accFuel = added.player.accFuel;
    if (act.stateFlag & ObjStaF.FLY) {
      const rideId = rideItemOf(added);
      const flight = rideId === undefined ? undefined : this.data.itemProps.get(rideId)?.flight;
      if (rideId !== undefined && flight !== undefined) act.setRide(rideId, rideOf(flight));
    }
    act.worldFly = () => this.worldFly;

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
    const stateMode = added.player?.stateMode ?? 0;
    const useItemId = added.player?.useItemId;
    const mover: Mover = {
      objectId, act, dest: null, corr: null, speedFactor, isSelf, kind, added, name, flying: prop?.flying === true,
      buffs: this.buffsOf(added), baseSpeed: speed,
      hp: added.hitPoint, level, maxHp: this.maxHpOf(added, level),
      stateMode, cast: (stateMode & STATE_BASEMOTION_MODE) !== 0 && useItemId !== undefined ? { itemId: useItemId, startedAt: null } : null,
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
    if (isSelf && numbers?.objectId === objectId) {
      mover.profileSpeed = () => numbers.profileStats ? numbers.profileStats[12]! / 1000000 : undefined;
    }
    act.findMover = (id) => this.byId.get(id)?.act;
    act.hitPoint = () => mover.hp;
    if (isSelf) act.jumpBonus = () => this.numbers?.profileStats?.[13] ?? this.numbers?.adj.get(Dst.JUMPING) ?? 0;
    act.onHit = () => this.onAttackMelee(mover);
    act.onMeleeSkill = () => this.onMeleeSkill(mover);
    act.onAttackQuake = () => this.onAttackQuake(mover);
    act.onMagicSkill = () => this.onMagicSkill(mover);
    act.skillCountOf = (skill, level) => this.data.skills.get(skill)?.levels[level - 1]?.skillCount ?? 0;
    // GetCastingAniSpeed (MoverAttack.cpp:195-203): the own spell rate; another player's is not known (1)
    if (isSelf) act.castingSpeed = () => Math.min(2, Math.max(0.1, Math.fround(1 + (this.numbers?.adj.get(Dst.SPELL_RATE) ?? 0) / 100)));
    act.onAttackMagic = () => this.onAttackMagic(mover);
    act.onAttackRange = () => this.onAttackRange(mover);
    // CMagicAtkMsgq::Process (ActionMover.cpp:59-93): nParam2 0 is the wand's, else the bow's with its dwItemID
    act.doKeptMagicAttack = (kept) => (kept.param2 === 0
      ? this.doAttackMagic(mover, kept.targetId, kept.power)
      : this.doAttackRange(mover, kept.targetId, kept.param3, kept.sfxHitId));
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
   * Piece 7 M2: what a job change shows on its mover, the own (`OnSetChangeJob`, `DPClient.cpp:3635-3637`) or another's
   * (`OnSetNearChangeJob`, :3700-3703): `MTI_LEVELUP` once if it stands (`levelUpMotion`), and `XI_GEN_LEVEL_UP01` on it.
   */
  private jobChanged(m: Mover): void {
    m.act.levelUpMotion();
    this.combat({ kind: 'jobChanged', moverId: m.objectId });
  }

  /**
   * `CDPClient::OnSetNearChangeJob` (`DPClient.cpp:3680-3703`) for another player in view: `m_nJob = nJob` (its skills
   * are read and not kept: nothing of the browser reads another's), and the job change shown. Its maximum HP follows the
   * new job's `fFactorMaxHP` (`GetMaxHitPoint`, which reads `m_nJob`); Neuz leaves the HP as it is.
   */
  private setNearJob(m: Mover, job: number): void {
    if (this.numbersOf(m) !== undefined || m.added.player === undefined) return;
    m.added.player.job = job;
    m.maxHp = this.maxHpOf(m.added, m.level);
    this.jobChanged(m);
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
    if (!this.onDamageMsgC(victim, attacker, AttackFlag.GENERIC)) return;
    if (attacker.added.isPlayer) {
      attacker.act.pause(5);
    } else {
      attacker.act.pause(0);
      victim.act.pause(0);
    }
    this.combat({ kind: 'spark', moverId: attacker.objectId, fromId: victim.objectId });
  }

  /**
   * Piece 7 M2: a player's quake frame (`_ProcessStateAttack`, `ActionMoverState.cpp:1040-1078`, every player on the
   * client): with a yoyo in the hand (`GetActiveHandItemProp`) and its target in view, its `dwSfxObj2` thrown
   * (`CreateSfxYoYo`, `CreateObj.cpp:380`) from the right hand on `MTI_ATK1` and the left on `MTI_ATK2`, at the target
   * + 1 m (`MakePath`). With no hand to tell, it leaves from the thrower + 1 m (`vPosSrc`, :1058). Drawing only.
   */
  private onAttackQuake(m: Mover): void {
    if (!m.added.isPlayer) return;
    const item = this.handItemOf(m);
    if (item?.kind3 !== Ik3.YOYO) return;
    const target = m.act.targetId === null ? undefined : this.byId.get(m.act.targetId);
    const xi = item.sfxMissile ?? -1;
    if (target === undefined || xi === -1) return;
    const hand = m.act.motion === Mti.ATK1 ? 'right' : m.act.motion === Mti.ATK2 ? 'left' : null;
    if (hand === null) return;
    const at = m.act.body.pos;
    const to = target.act.body.pos;
    this.missiles?.launch({
      cls: 'yoyo', sourceId: m.objectId, targetId: target.objectId,
      from: this.handOf(m.objectId, hand) ?? [at[0], Math.fround(at[1] + 1), at[2]],
      flightXi: xi, hitXi: -1, scale: 1, report: null,
      yoyo: { hand, sourceAt: at, dest: [to[0], Math.fround(to[1] + 1), to[2]] },
    });
  }

  /**
   * Piece 7 M2: `CMover::DoAttackMagic( pTarget, nMagicPower, idSfxHit )` (`MoverSkill.cpp:3201-3279`) of another
   * mover: -1 for a target out of view, an empty right hand (every monster: no `m_aEquipInfo`), no wand, or a line of
   * sight blocked half a metre up (dropped without the message, plan Decisions 5); else `OBJMSG_ATK_MAGIC1`'s answer,
   * and one that started faces the target and keeps the charge for its hit frame (`SetActParam`). The idSfxHit is not
   * kept: another player's wand never reports.
   */
  private doAttackMagic(m: Mover, targetId: number, power: number): number {
    const target = this.byId.get(targetId);
    if (target === undefined) return -1;
    if (this.handItemOf(m)?.kind3 !== Ik3.WAND) return -1;
    if (sightBlocked(this.ground, m.act.body.pos, target.act.body.pos)) return -1;
    const error = m.act.actMsgError(ActMsg.ATK_MAGIC1, targetId);
    if (error === 1) {
      m.act.body.angle = wrapAngle(getDegree(target.act.body.pos, m.act.body.pos));
      m.shot = { targetId, power, sfxHitId: 0 };
    }
    return error;
  }

  /**
   * Piece 7 M2: `CMover::DoAttackRange( pTarget, dwItemID, idSfxHit )` (`MoverSkill.cpp:3292-3380`) of another mover:
   * -1 for a target out of view or no item: a player's hand item (`dwItemID` its charge), a monster's `dwItemID` (the
   * client keeps no `m_dwVirtItem`, so 0 or `NULL_ID` is none); -1 for an item that is not `WT_RANGE` or
   * `WT_RANGE_BOW`; else `OBJMSG_ATK_RANGE1` with `MTI_ATK1`'s motion (a player's `MTI_ATK_13 - MTI_STAND_13`; the
   * converter keeps no `dwUseMotion` for a monster's item, whose own motion this is then), and one that started faces
   * the target and keeps the item and the server's id (`SetActParam`).
   */
  private doAttackRange(m: Mover, targetId: number, itemId: number, sfxHitId: number): number {
    const target = this.byId.get(targetId);
    if (target === undefined) return -1;
    const item = m.added.isPlayer
      ? this.handItemOf(m)
      : itemId === NULL_ID || itemId === 0 ? null : this.data.itemProps.get(itemId) ?? null;
    if (item === null || (item.weaponType !== WT_RANGE && item.weaponType !== WT_RANGE_BOW)) return -1;
    const error = m.act.actMsgError(ActMsg.ATK_RANGE1, targetId, Mti.ATK1);
    if (error === 1) {
      m.act.body.angle = wrapAngle(getDegree(target.act.body.pos, m.act.body.pos));
      m.shot = { targetId, power: m.added.isPlayer ? itemId : 0, sfxHitId, itemId };
    }
    return error;
  }

  /**
   * Piece 7 M2: `CCtrl::ShootSkill` (`Ctrl.cpp:1356-1418`) of every caster: the skill's `dwSfxObj2` from the caster
   * + 1 m (a bow skill's from its left hand: the bone - 1 m, then `CreateShootSfx`'s + 1 m), in the class
   * `CreateShootSfx` makes of it (`skillMissileClassOf`), hitting with `dwSfxObj3` or the class's own hit model. The own
   * player's registers its id (`SendSfxID` with `AF_MELEESKILL` for a KT_SKILL, else `AF_MAGICSKILL`, and `dwSkillTime
   * / dwPainTime + 1` hits for a skill of continuous pain) and carries the skill and its level; another's reports nothing.
   * The winds start at the caster's feet, Hot Air there too (their frame 0).
   */
  private shootSkill(caster: Mover, target: Mover, skill: WebSkill, level: number): void {
    const xi = skill.sfxMissile ?? -1;
    if (xi === -1) return;
    const cls = skillMissileClassOf(xi);
    const at = caster.act.body.pos;
    const up: Vec3 = [at[0], Math.fround(at[1] + 1), at[2]];
    const feet = cls === 'swordWind' || cls === 'strongWind' || cls === 'hotAir';
    const bow = caster.added.isPlayer && skill.linkKind === Ik3.BOW;
    const from = feet ? [...at] as Vec3 : bow ? this.handOf(caster.objectId, 'left') ?? up : up;
    const times = skill.levels[level - 1];
    const painTime = times?.painTime ?? -1;
    const skillTime = times?.skillTime ?? -1;
    const maxDmgCnt = skill.continuousPain === true && painTime > 0 ? Math.trunc(skillTime / painTime) + 1 : 1;
    const report = caster.isSelf && this.shots !== null
      ? {
        sfxHitId: this.shots.register(target.objectId, skill.skillType === Kt.SKILL ? AttackFlag.MELEESKILL : AttackFlag.MAGICSKILL,
          NULL_ID, maxDmgCnt),
        power: level, skill: skill.id,
      }
      : null;
    const toTicks = (ms: number): number => Math.trunc((ms / 1000) * 60);
    this.missiles?.launch({
      cls, sourceId: caster.objectId, targetId: target.objectId, from, flightXi: xi,
      hitXi: SKILL_HIT_MODELS.get(xi) ?? (cls === 'wand' ? hitXiOf(cls, -1) : skill.sfxHit), scale: 1, report,
      ...(cls === 'strongWind' ? { push: Math.fround((skill.dmgShift ?? 0) * 0.2) } : {}),
      ...(cls === 'hotAir' ? { hotAir: { painTicks: toTicks(painTime), lastTicks: toTicks(skillTime), maxDmgCnt } } : {}),
    });
  }

  /**
   * Piece 7 M2: `CMover::OnAttackMagic()` (`MoverActEvent.cpp:773-880`), the client's, at the wand's hit frame: the
   * hand's `dwSfxObj2` (`XI_FIR_WAND01` with no prop) from the mover + 1 m at its target, scaled by the charge (1 1.2,
   * 2 1.7, 3 and 4 2.5); the own player's registers its id (`SendSfxID( AF_MAGIC )`) and carries it with the charge.
   * The missile class is the effect's (`missileClassOf`). The caster's flash and a flier's `XI_FIR_WAND02` are left out.
   */
  private onAttackMagic(m: Mover): void {
    const target = m.shot === undefined ? undefined : this.byId.get(m.shot.targetId); // GetActParam( 0 )
    if (target === undefined) return;
    const item = this.handItemOf(m);
    if (item === null && !m.added.isPlayer) return; // no m_aEquipInfo: GetWeaponItem or the right hand fails (:792-805)
    const xi = item === null ? XI_FIR_WAND01 : item.sfxMissile ?? -1;
    const cls = missileClassOf(xi);
    if (cls === null) return;
    const power = m.shot?.power ?? 0;
    const at = m.act.body.pos;
    const report = m.isSelf && this.shots !== null
      ? { sfxHitId: this.shots.register(target.objectId, AttackFlag.MAGIC), power, skill: NULL_ID }
      : null;
    this.missiles?.launch({
      cls, sourceId: m.objectId, targetId: target.objectId, from: [at[0], Math.fround(at[1] + 1), at[2]],
      flightXi: xi, hitXi: hitXiOf(cls, -1), scale: WAND_SCALES[power] ?? 1, report,
    });
  }

  /**
   * Piece 7 M2: `CMover::OnAttackRange()` (`MoverActEvent.cpp:672-767`), the client's, at the shot's hit frame. A player's
   * arrow is the own player's alone (others' come by CREATESFXALLOW): the arrow slot's `dwSfxObj2` from the left hand
   * (`CreateSfxArrow`, `Mover.cpp:8628-8649`), hitting with the bow's `dwSfxObj3`, its id registered with
   * `AF_GENERIC | AF_RANGE` and carrying the charge. A monster's is its item's `dwSfxObj2` from it + 1 m, carrying the
   * server's id when it is aimed at the own player (:762-763); none without the item or its effect.
   */
  private onAttackRange(m: Mover): void {
    const target = m.shot === undefined ? undefined : this.byId.get(m.shot.targetId); // GetActParam( 0 )
    if (target === undefined) return;
    const at = m.act.body.pos;
    const shot = m.shot;
    if (m.added.isPlayer) {
      if (!m.isSelf) return;
      const bow = this.handItemOf(m);
      const arrow = this.numbersOf(m)?.bullet() ?? null;
      const xi = arrow?.sfxMissile ?? -1;
      const cls = xi === -1 ? null : missileClassOf(xi);
      if (bow === null || cls === null) return;
      const power = shot?.power ?? 0;
      const report = this.shots === null ? null
        : { sfxHitId: this.shots.register(target.objectId, AttackFlag.GENERIC | AttackFlag.RANGE), power, skill: NULL_ID };
      this.missiles?.launch({
        cls, sourceId: m.objectId, targetId: target.objectId,
        from: this.handOf(m.objectId, 'left') ?? [at[0], Math.fround(at[1] + 1), at[2]],
        flightXi: xi, hitXi: hitXiOf(cls, bow.sfxHit), scale: 1, report,
      });
      return;
    }
    const itemId = shot?.itemId ?? 0;
    const item = itemId === NULL_ID || itemId === 0 ? null : this.data.itemProps.get(itemId) ?? null;
    const xi = item?.sfxMissile ?? -1;
    const cls = xi === -1 ? null : missileClassOf(xi);
    if (cls === null) return;
    this.missiles?.launch({
      cls, sourceId: m.objectId, targetId: target.objectId, from: [at[0], Math.fround(at[1] + 1), at[2]],
      flightXi: xi, hitXi: hitXiOf(cls, -1), scale: 1,
      report: target.isSelf ? { sfxHitId: shot?.sfxHitId ?? 0, power: 0, skill: NULL_ID } : null,
    });
  }

  /**
   * Piece 7 M2: `CDPClient::OnCreateSfxAllow` (`DPClient.cpp:4088-4114`): another player's arrow, `CreateSfxArrow`
   * from its left hand at the target + 1 m, hitting with `hitXi`; the position it carries is ignored. None at a target
   * out of view, and none of the own player's, whose arrow its own hit frame made.
   */
  private createSfxAllow(m: Mover, arrowXi: number, hitXi: number, targetId: number): void {
    const target = this.byId.get(targetId);
    if (target === undefined || m.isSelf) return;
    const cls = missileClassOf(arrowXi);
    if (cls === null) return;
    const at = m.act.body.pos;
    this.missiles?.launch({
      cls, sourceId: m.objectId, targetId, from: this.handOf(m.objectId, 'left') ?? [at[0], Math.fround(at[1] + 1), at[2]],
      flightXi: arrowXi, hitXi: hitXiOf(cls, hitXi), scale: 1, report: null,
    });
  }

  /**
   * `GetActiveHandItemProp()` of a player: the own one's weapon (`OwnState`), another's right-hand item (ADD_OBJ and
   * DOEQUIP); null for the fists or an item the catalog lacks.
   */
  private handItemOf(m: Mover) {
    const own = this.numbersOf(m);
    if (own !== undefined) return own.equipped.weapon ?? null;
    const player = m.added.player;
    const id = player === undefined ? null : rightHandItem(player);
    return id === null ? null : this.data.itemProps.get(id) ?? null;
  }

  /**
   * A blow on `victim` with the flags `flags`: a swing's `SendDamage( m_dwAtkFlags, ... )`, its flags `AF_GENERIC` on the
   * client (`ActionMoverMsg.cpp:699`), or a melee skill's `AF_MELEESKILL` (`CCtrl::ApplyDamage`, `Ctrl.cpp:1001-1030`),
   * through `PreProcessDamage` (`ActionMoverMsg.cpp:1190-1228`: none on a player in `MATCHLESS_MODE`, nor on a mover that
   * is not a player and cannot be killed, `bKillable != 1`) to `OnDamageMsgC` (`ActionMoverDmg.cpp:54-122`): none on a
   * mover in a dead state; a sitting victim stands, then `OBJMSG_STAND`; an `AF_GENERIC` blow's drawing (`attackerHit`:
   * the hand item's spark, and the shake); and the flinch (`SetDamagedMotion`, which flies only with `AF_FLYING`). True
   * where it landed (a skill's shake is its `skillHit`'s). Left out: the stone state (`CHS_SETSTONE`, buffs),
   * `AF_MONSTER_SP_CLIENT` (monsters' specials), and `m_idAttacker`, `m_idTargeter` and `m_idLastHitMover`, which the
   * browser does not keep.
   */
  private onDamageMsgC(victim: Mover, attacker: Mover, flags: number): boolean {
    if ((victim.added.player?.mode ?? 0) & MATCHLESS_MODE) return false;
    if (!victim.added.isPlayer) {
      const prop = this.data.movers.get(victim.added.index);
      if (prop !== undefined && prop.killable !== 1) return false;
    }
    if (victim.act.isDie()) return false;
    victim.act.unsit();
    victim.act.sendActMsg(ActMsg.STAND);
    if (flags & AttackFlag.GENERIC) {
      const weapon = this.handItem(attacker);
      this.combat({ kind: 'attackerHit', attackerId: attacker.objectId, victimId: victim.objectId, weapon });
    }
    victim.act.setDamaged();
    return true;
  }

  /**
   * `CMover::DoUseSkill( 0, -1, ... )` (`MoverSkill.cpp:163-283`) and the `DoUseSkill( dwSkill, nLevel, ... )` it calls
   * (:287-1063), the client's branches, for the USESKILL `message` of the mover `m`: true where the skill began
   * (`bSuccess`). Refused: a mover that is not a player (`IsNPC`, :177-178), a skill the catalog lacks (`GetSkillProp`), a
   * dead or flying caster (:293-294), one in `NO_ATTACK_MODE` (:317), a target not in view (:336-338), a heal at a dead
   * target (:340-344). Then the caster faces its target unless it is itself (:450), stops (`OBJMSG_STOP`, which clears its
   * destination, `ClearDest`, :701-702), and a melee skill plays its motion, `dwUseMotion` (+2 only for a skill with no
   * cast time outside the chain, :829-831; a melee skill's is 1), with `OBJMSG_MELEESKILL`, which a caster in an action
   * refuses (-2, :890-893); begun, the skill is the caster's (`SetActParam`, `m_nAParam[3] = nLevel`, :840-846).
   * Not copied: a magic skill (`KT_MAGIC`, cast with `OBJMSG_MAGICCASTING` or `MAGICSKILL`), which is not begun here at
   * all. Left out: `MVRF_NOATTACK` (buffs), the guild-war and quiz maps' rules, `MVRF_SKILL` (which nothing on the client
   * reads), the hand-linked effects of later jobs' skills (:905-990), the cast effect at the caster (`dwSfxObj`, :993-996:
   * the catalog does not keep it; none for a Vagrant skill), the chat lines of a skill that is no attack used on a player
   * (:997-1016) and the Japanese voice. The own action slot's step (`m_nExecute`, :896-903) is the skill use's
   * (`onUseSkill`).
   */
  private doUseSkill(m: Mover, message: MessageOf<'useSkill'>): boolean {
    if (!m.added.isPlayer) return false;
    const skill = this.data.skills.get(message.skill);
    if (skill === undefined || (skill.skillType !== Kt.SKILL && skill.skillType !== Kt.MAGIC)) return false;
    if (isDie(m) || m.act.stateFlag & ObjStaF.FLY) return false;
    if ((m.added.player?.mode ?? 0) & NO_ATTACK_MODE) return false;
    const target = this.byId.get(message.targetId);
    if (target === undefined) return false;
    if (skill.id === Si.ASS_HEAL_HEALING && isDie(target)) return false;
    if (target !== m) m.act.body.angle = wrapAngle(getDegree(target.act.body.pos, m.act.body.pos));
    m.act.sendActMsg(ActMsg.STOP);
    let motion = skill.useMotion;
    let msg: number = ActMsg.MELEESKILL;
    // Piece 7 M2: KT_MAGIC (MoverSkill.cpp:812-825): the action slot's chained skills shoot at once, any other casts
    if (skill.skillType === Kt.MAGIC) {
      if (message.useType === Sut.QUEUEING) motion += 2;
      msg = message.useType === Sut.QUEUEING ? ActMsg.MAGICSKILL : ActMsg.MAGICCASTING;
    }
    if (message.useType !== Sut.QUEUEING && message.castingTime === 0 && skill.id !== Si.GEN_ATK_COUNTER) motion += 2;
    if (!m.act.sendActMsg(msg, motion, target.objectId, message.castingTime)) return false;
    m.act.skillAct = { skill: skill.id, targetId: target.objectId, level: message.level };
    this.skillBegun(m, skill, target);
    return true;
  }

  /**
   * Piece 7 M2: what a skill that began shows (`CMover::DoUseSkill`, `MoverSkill.cpp:993-1016`): its cast effect
   * (`dwSfxObj`) on the caster; and for a skill that is not an attack on a player, `TID_GAME_SKILL_SELF` ("You use %s.")
   * when the caster is the own player, `TID_GAME_SKILL_MATE` ("%s uses %s.") when the target is and another cast it (or
   * the skill is Circle Healing). The texts' arguments are quoted: a skill's name has spaces.
   */
  private skillBegun(m: Mover, skill: WebSkill, target: Mover): void {
    const cast = skill.sfxCast ?? -1;
    if (cast !== -1) this.combat({ kind: 'cast', casterId: m.objectId, xi: cast });
    const attack = skill.exeTarget === Ext.MELEEATK || skill.exeTarget === Ext.MAGICATK ||
      skill.exeTarget === Ext.AROUNDATK || skill.exeTarget === Ext.MAGICATKSHOT;
    if (attack || !target.added.isPlayer) return;
    const quoted = (text: string): string => `"${text}"`;
    if (m.isSelf) this.line('TID_GAME_SKILL_SELF', quoted(skill.name));
    else if (target.isSelf && (m !== target || skill.id === Si.ASS_CHEER_CIRCLEHEALING)) {
      this.line('TID_GAME_SKILL_MATE', `${quoted(m.name)} ${quoted(skill.name)}`);
    }
  }

  /** A line of the catalog's `id` with `args`, as DEFINEDTEXT gives one (`text`); none for a text the catalog lacks. */
  private line(id: string, args: string): void {
    const textId = this.data.texts.get(id)?.textId;
    if (textId !== undefined) this.combat({ kind: 'text', textId, args });
  }

  /**
   * Piece 7 M2: `CMover::OnMagicSkill( 0, nCount )` (`MoverActEvent.cpp:475-666`) on the client, at the hit frame of a
   * magic skill's shot motion (`ActionMover.onMagicSkill`): nothing without the skill in use at a target in view, nor
   * for Healing at a dead one. A shot (`EXT_MAGICATKSHOT`, `EXT_MAGICSHOT`) is `ShootSkill`'s; any other is applied as
   * `DoApplySkill` is for a melee skill (`onMeleeSkill`), with `AF_MAGICSKILL`. Then the caster's white flash from
   * behind (:655-664). Blinkpool's teleport is the skill use's to refuse.
   */
  private onMagicSkill(caster: Mover): void {
    const use = caster.act.skillAct;
    const skill = use === null ? undefined : this.data.skills.get(use.skill);
    const target = use === null ? undefined : this.byId.get(use.targetId);
    if (skill === undefined || target === undefined) return;
    if (skill.id === Si.ASS_HEAL_HEALING && isDie(target)) return;
    if (skill.exeTarget === Ext.MAGICATKSHOT || skill.exeTarget === Ext.MAGICSHOT) {
      this.shootSkill(caster, target, skill, use!.level);
    } else {
      const attack = skill.exeTarget === Ext.MELEEATK || skill.exeTarget === Ext.MAGICATK;
      const landed = attack && this.onDamageMsgC(target, caster, AttackFlag.MAGICSKILL);
      this.combat({ kind: 'skillHit', casterId: caster.objectId, targetId: target.objectId, skill: skill.id, landed, level: use!.level });
    }
    this.combat({ kind: 'tint', moverId: caster.objectId, color: [2, 2, 2], fromAngle: caster.act.body.angle });
  }

  /**
   * `CMover::OnMeleeSkill( 0, nCount )` (`MoverActEvent.cpp:72-164`) on the client, at a hit frame of the melee skill
   * `caster` uses (`ActionMover.onMeleeSkill`): nothing unless it uses a skill of the catalog (`m_oaAct ==
   * OBJACT_USESKILL`) at a target in view. The caster's model flashes from its target's side (:94-113); then, unless the
   * skill's hit is a shot (`EXT_MAGICATKSHOT`, `EXT_MAGICSHOT`: `ShootSkill`, not copied), `DoApplySkill`
   * (`Ctrl.cpp:1449-1677`) as its `SRO_DIRECT` and default branch: the target's `ApplySkill`, whose `ApplyDamage` sends an
   * attack skill's blow (`EXT_MELEEATK`, `EXT_MAGICATK`; `SendDamage( AF_MELEESKILL, ... )`, a `CT_FINISH` skill's
   * `SendDamageForce` taken the same way on the client, `OnDamageMsgC` reading no message), then `CreateSkillSfx`, the
   * skill's effect, whether the blow landed or not: the `skillHit` event.
   * Left out: the area skills (`SRO_AROUND`, `SRO_REGION`, `SRO_LINE`: the catalog keeps no spell region, and the
   * Vagrant's are all `SRO_DIRECT`), the buffs a skill gives (its destination parameters: none for a Vagrant skill), the
   * second skill (`dwActiveSkill`), the first hit's cool-down (`SetCoolTime`: none for a Vagrant skill), and the flash of a
   * skill on the caster itself (lit from straight up, :106-107).
   */
  private onMeleeSkill(caster: Mover): void {
    const use = caster.act.skillAct;
    const skill = use === null ? undefined : this.data.skills.get(use.skill);
    const target = use === null ? undefined : this.byId.get(use.targetId);
    if (skill === undefined || target === undefined) return;
    if (target !== caster) this.combat({ kind: 'spark', moverId: caster.objectId, fromId: target.objectId });
    if (skill.exeTarget === Ext.MAGICATKSHOT || skill.exeTarget === Ext.MAGICSHOT) {
      this.shootSkill(caster, target, skill, use!.level); // Piece 7 M2: Junk Bow, Aimed Shot, Guillotine...
      return;
    }
    const attack = skill.exeTarget === Ext.MELEEATK || skill.exeTarget === Ext.MAGICATK;
    const landed = attack && this.onDamageMsgC(target, caster, AttackFlag.MELEESKILL);
    this.combat({ kind: 'skillHit', casterId: caster.objectId, targetId: target.objectId, skill: skill.id, landed, level: use!.level });
  }

  /**
   * `CDPClient::OnCreateSfxObj` (`DPClient.cpp:4038-4067`): CREATESFXOBJ's effect at its position when it has one (`if( x
   * || y || z )`, a float's test, so -0 is none and NaN is one), whether or not its object is in view; else on the object,
   * when it is a mover in view (only movers are kept: another object counts as not in view); else nothing.
   */
  private createSfxObj(objectId: number, message: MessageOf<'createSfxObj'>): void {
    const [x, y, z] = message.pos;
    if (x !== 0 || y !== 0 || z !== 0) {
      this.combat({ kind: 'sfxObj', xi: message.sfxId, pos: [x, y, z], moverId: null });
    } else if (this.byId.has(objectId)) {
      this.combat({ kind: 'sfxObj', xi: message.sfxId, pos: null, moverId: objectId });
    }
  }

  /**
   * The ID of `CMover::GetActiveHandItemProp()`'s item (`Mover.cpp:2930-2968`, the client's branches): a player's right
   * hand, the bare hand's `II_WEA_HAN_HAND` when it is empty: the own one's from its numbers (the lobby's equipment),
   * another's from `m_aEquipInfo[PARTS_RWEAPON]`, the worn part's item ID. Any other mover's is its `m_dwVirtItem`
   * (`VT_ITEM`, :2960-2966), which `CMover::InitProp` takes from its row's `dwAtk1` (:1536); null for `NULL_ID` (`=`), and
   * for a mover the catalog has no row for. Null for the own mover with no numbers.
   */
  handItem(m: Mover): number | null {
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
    m.act.sendActMsg(ActMsg.ACC_STOP); // Piece 7 M5 (:2271)
    m.act.sendActMsg(ActMsg.STOP_TURN);
    m.act.sendActMsg(ActMsg.STAND);
  }

  /** `CDPClient::OnSetPosAngle` (:2275): `SetPos( vPos )` and `SetAngle( fAngle )`, nothing cleared. */
  private setPosAngle(m: Mover, pos: Vec3, angle: number): void {
    m.act.body.pos = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    m.act.body.angle = wrapAngle(angle);
  }
}

/** Piece 7 M5: the flight rules' columns of a ride's prop. */
function rideOf(flight: NonNullable<import('@flyffweb/formats').WebItemProp['flight']>): FlightRide {
  return { speed: flight.speed, turn: flight.turn, pitch: flight.pitch, motion: flight.motion };
}

/**
 * Piece 7 M5: a player's worn ride, by its ADD_OBJ: another player's worn PARTS_RIDE part; the own one's (whose ADD_OBJ
 * lists no worn parts) is the inventory item in its equipment's PARTS_RIDE slot (`inventorySlots`, else the player
 * part's `equipmentObjectIds`, as `OwnState` reads them).
 */
function rideItemOf(added: AddedMover): number | undefined {
  const player = added.player;
  if (player === undefined) return undefined;
  const worn = player.worn.find((w) => w.part === PARTS_RIDE)?.itemId;
  if (worn !== undefined || player.own === null) return worn;
  const slots = player.own.inventorySlots;
  const objectId = slots !== undefined ? slots[42 + PARTS_RIDE] : player.equipmentObjectIds[PARTS_RIDE];
  return player.own.inventory?.find((item) => item.objectId === objectId)?.itemId;
}
