import type { JobProp, WebItemProp } from '@flyffweb/formats';
import { DstParam } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, SkillSlot, TaskBar, WorldMessage } from '@flyffweb/protocol';
import type { GameData } from './gameData';
import { Parts, ownWorn } from './render/looks';
import {
  FISTS, effectiveStats, equipAdjust, expNeeded, expPercentText, maxFatiguePoint, maxHitPoint, maxManaPoint,
} from './sim/params';
import type { Equipped, ParamAdjust, Stats } from './sim/params';

/**
 * What the screen should play for an own message, in the order Neuz does it:
 * - `levelUp`: the level rose from `from` to `to`, whatever the jump (`SetExperience` plays it once): the level-up
 *   effect and motion, the caption, the chat line. `deathLevel` (not the event) says whether the chat line is due: Neuz
 *   prints `TID_GAME_LEVELUP` only when `m_nDeathLevel < nLevel`.
 * - `patternUp`: the level crossed a combo level (2, 8 or 12), and `level` is the first of them (see `patternUpLevel`).
 * - `refilled`: HP, MP and FP were set to their maxima (a level up, SETSTATE).
 * - `statsChanged`: SETSTATE replaced the stats and the stat points.
 * - `skillPointUp`: SETEXPERIENCE brought more skill points than there were: a second level-up effect and the caption
 *   `TID_GAME_SKILLPOINT_UP` (`OnSetExperience`, `DPClient.cpp:3394-3417`).
 * - `died`: MOVERDEATH, the HP is 0.
 * - `revived`: REVIVAL or REVIVAL_TO_LODESTAR.
 */
export type OwnEvent =
  | { kind: 'levelUp'; from: number; to: number }
  | { kind: 'patternUp'; level: 2 | 8 | 12 }
  | { kind: 'refilled' }
  | { kind: 'statsChanged' }
  | { kind: 'skillPointUp' }
  | { kind: 'died' }
  | { kind: 'revived' };

/** `nPatLv` of `CMover::SetExperience` (`MoverParam.cpp:1741`): the levels where a Vagrant learns a new attack pattern. */
const PATTERN_LEVELS = [2, 8, 12] as const;

/**
 * The loop of `SetExperience` (`MoverParam.cpp:1742-1750`): the first pattern level that the old level is below and the new
 * one reaches. It prints the chat line once and `break`s, so a jump over two of them (1 to 9) names only the first, and from
 * level 12 on (`m_nLevel >= nPatLv[2]`) there is none.
 */
function patternUpLevel(from: number, to: number): 2 | 8 | 12 | null {
  for (let i = 0; i < 3; i++) {
    const level = PATTERN_LEVELS[i]!;
    if (from < level && to >= level) return level;
    else if (from >= PATTERN_LEVELS[2]) break;
  }
  return null;
}

/** The `nRate` of `OnRevivalLodestar` (`DPClient.cpp:3492-3499`, `__VER >= 9`): the tenths of the maximum it gives. */
function lodestarRate(level: number): number {
  if (level === 1) return 8;
  if (level === 2) return 6;
  if (level <= 5) return 5;
  if (level <= 10) return 4;
  return 3; // levels 11 to 15, and the `else` for the rest
}

/**
 * What the own character wears, from the lobby's item IDs, slotted as `looks.ts` slots them for drawing (`ownWorn`,
 * `CDPLoginClient::OnPlayerList`, `DPLoginClient.cpp:478-494`): the item of `PARTS_RWEAPON` is the weapon and the others
 * (a first right-hand weapon moved to the left hand included) are the rest, as `SetEquipDstParam` walks all of them. An ID
 * the item catalog lacks is skipped.
 */
function wornBy(equipment: readonly number[], data: GameData): Equipped {
  let weapon: WebItemProp | null = null;
  const armour: WebItemProp[] = [];
  for (const worn of ownWorn(equipment, data)) {
    const prop = data.itemProps.get(worn.itemId);
    if (prop === undefined) continue;
    if (worn.part === Parts.RWEAPON) weapon = prop;
    else armour.push(prop);
  }
  return { weapon, armour };
}

/**
 * The own character's numbers: what `CMover` holds for `g_pPlayer` and the own-character handlers of `CDPClient` change.
 * It starts from the own ADD_OBJ (`CMover::Serialize` with METHOD_NONE, read into `AddedPlayer.own`) and the lobby's
 * equipment, and `apply` takes the messages about the own character one at a time.
 *
 * `stats` are the base stats the server sends (`m_nStr` and the others); the formulas read `effective()`, the stats as
 * `GetStr()` and the others give them with the worn items' parameters. `hp`, `mp` and `fp` are the current points
 * (`m_nHitPoint`, `m_nManaPoint`, `m_nFatiguePoint`); the maxima are computed (`maxHp`...).
 */
export class OwnState {
  /** The own mover's object ID, which a message names its mover by. */
  readonly objectId: number;
  readonly job: number;
  /** The job's row of `propJob.inc`, which the formulas read. */
  readonly jobProp: JobProp;
  private levelNow: number;
  /** `m_nStr`, `m_nSta`, `m_nDex`, `m_nInt`: without the worn items and buffs. */
  stats: Stats;
  /** `m_nRemainGP`: the unspent stat points. */
  remainGP: number;
  hp: number;
  mp: number;
  fp: number;
  exp: bigint;
  /** `m_nSkillLevel`: the skill points earned in total; `m_nSkillPoint`: the unspent ones. */
  skillLevel: number;
  skillPoint: number;
  /** `m_nDeathExp` and `m_nDeathLevel`: the EXP and the level the character had when it last died. */
  deathExp: bigint;
  deathLevel: number;
  /** `m_aJobSkill`, 45 slots (a copy: the ADD_OBJ it came from stays as it was). */
  skills: SkillSlot[];
  /** The inventory by object ID (a copy); null when its part of the ADD_OBJ could not be read: `inventoryError` says why. */
  inventory: Map<number, InventoryItem> | null;
  readonly inventoryError: string | null;
  /** The shortcut bars, once the TASKBAR message after the ADD_OBJ has come. */
  taskBar: TaskBar | null = null;
  private worn: Equipped;
  private adjust: ParamAdjust;

  /**
   * `added` is the own ADD_OBJ (its HP is `m_nHitPoint`; its `player.own` the rest) and `equipment` the lobby's item IDs
   * of the character, which dress it (`ownWorn`) and make `equipped`. Throws when `added` is not the own character's, or
   * the job table has no row for its job.
   */
  constructor(private readonly data: GameData, added: AddedMover, equipment: readonly number[]) {
    const player = added.player;
    const own = player?.own;
    if (player === undefined || own === null || own === undefined) {
      throw new Error(`mover ${added.objectId} is not the own character: its ADD_OBJ carries no own data`);
    }
    const jobProp = data.jobs[player.job];
    if (jobProp === undefined) throw new RangeError(`the job table has no row for job ${player.job}`);
    this.objectId = added.objectId;
    this.job = player.job;
    this.jobProp = jobProp;
    this.levelNow = player.level;
    this.stats = { str: own.str, sta: own.sta, dex: own.dex, int: own.int };
    this.remainGP = own.remainGP;
    this.hp = added.hitPoint;
    this.mp = own.manaPoint;
    this.fp = own.fatiguePoint;
    this.exp = own.exp;
    this.skillLevel = own.skillLevel;
    this.skillPoint = own.skillPoint;
    this.deathExp = own.deathExp;
    this.deathLevel = own.deathLevel;
    this.skills = own.skills.map((slot) => ({ ...slot }));
    this.inventory = own.inventory === null ? null : new Map(own.inventory.map((item) => [item.objectId, { ...item }]));
    this.inventoryError = own.inventoryError;
    this.worn = wornBy(equipment, data);
    this.adjust = equipAdjust(this.worn);
  }

  /** `m_nLevel`. */
  get level(): number {
    return this.levelNow;
  }

  /** The weapon in the right hand and the other worn items. Assigning it takes their parameters again. */
  get equipped(): Equipped {
    return this.worn;
  }

  set equipped(worn: Equipped) {
    this.worn = worn;
    this.adjust = equipAdjust(worn);
  }

  /** `m_adjParamAry` as the worn items fill it (`equipAdjust`): what the formulas' `GetParam` reads. */
  get adj(): ParamAdjust {
    return this.adjust;
  }

  /** `GetStr()`, `GetSta()`, `GetDex()` and `GetInt()`: the stats plus the worn items' parameters, at least 1. */
  effective(): Stats {
    return effectiveStats(this.stats, this.adjust);
  }

  maxHp(): number {
    return maxHitPoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
  }

  maxMp(): number {
    return maxManaPoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
  }

  maxFp(): number {
    return maxFatiguePoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
  }

  /** The EXP text of the status window (`CWndStatus::OnDraw`, `WndField.cpp:10617-10622`): `"12.34%"`. */
  expText(): string {
    return expPercentText(this.exp, expNeeded(this.data.exp, this.levelNow));
  }

  /** The held weapon's `fAttackSpeed` (the fists' for none), which MELEE_ATTACK sends. */
  attackSpeed(): number {
    return (this.worn.weapon ?? FISTS).attackSpeed;
  }

  /**
   * Applies one message, and returns what the screen should play. `objectId` is the object the message is about (the
   * bundle's, beside the message): a message about another mover is ignored, as `prj.GetMover( objid )` in the handlers
   * finds that mover and not `g_pPlayer`. Left out, the message is taken as the own character's.
   *
   * SETSTATE and TASKBAR name no mover in Neuz (`OnSetState( ar )`, `OnTaskBar( ar )` go to `g_pPlayer` and its task bar),
   * so they apply whatever `objectId` is. SETLEVEL is another player's (`CUserMng::AddSetLevel` skips the player,
   * `User.cpp:4694-4706`), so it is ignored. The rest of the messages are not about the own numbers.
   */
  apply(message: WorldMessage, objectId: number = this.objectId): OwnEvent[] {
    switch (message.type) {
      case 'setState':
        return this.onSetState(message);
      case 'taskBar':
        this.taskBar = message.taskBar; // CWndTaskBar::Serialize empties the bars and reads them anew
        return [];
      default:
        break;
    }
    if (objectId !== this.objectId) return [];
    switch (message.type) {
      case 'setPointParam': // OnSetPointParam (DPClient.cpp:3303)
        this.setPointParam(message.param, message.value);
        return [];
      case 'setExperience':
        return this.onSetExperience(message);
      case 'setGrowthLearningPoint': // OnSetGrowthLearningPoint (:3531): m_nRemainGP = nRemainGP (:3540)
        this.remainGP = message.remainGP;
        return [];
      case 'damage':
        this.onDamage(message.hit);
        return [];
      case 'moverDeath':
        this.hp = 0; // OnMoverDeath (:1936): IncHitPoint( -GetHitPoint() ) (:1944-1945)
        return [{ kind: 'died' }];
      case 'revival':
        // OnRevival (:3450) only clears the state: its HP lines are under __VER < 9, so the SETPOINTPARAMs after it set the bars
        return [{ kind: 'revived' }];
      case 'revivalToLodestar':
        this.onRevivalLodestar();
        return [{ kind: 'revived' }];
      default:
        return [];
    }
  }

  /**
   * `CMover::SetPointParam` (`MoverParam.cpp:889-955`, the client's branches): a negative value is 0, and HP, MP and FP stop
   * at their maxima. `DST_GOLD` (penya) is kept nowhere here.
   */
  private setPointParam(param: number, value: number): void {
    const v = Math.max(0, value);
    switch (param) {
      case DstParam.HP:
        this.hp = Math.min(v, this.maxHp());
        break;
      case DstParam.MP:
        this.mp = Math.min(v, this.maxMp());
        break;
      case DstParam.FP:
        this.fp = Math.min(v, this.maxFp());
        break;
      default:
        break;
    }
  }

  /**
   * `CDPClient::OnSetExperience` (`DPClient.cpp:3376-3430`) over `CMover::SetExperience` (`MoverParam.cpp:1709-1900`):
   * - the EXP first (:1711);
   * - a higher level (:1714): the level up, the pattern up of the first combo level it crosses (:1740-1750), then the new
   *   level and HP, MP and FP at the new maxima (:1766-1772). A jump over several levels is one level up;
   * - a lower level (:1843) only sets the level;
   * - then the death EXP and level unless the server sent its defaults (`-1`, `0xffff`: :3390-3393), and the skill level
   *   and points, with an event when the points rose (:3394-3417).
   * A Vagrant at level 15 gets the EXP 0 from the server (`AddExperience`, `MoverParam.cpp:1173-1177`) and keeps it.
   */
  private onSetExperience(m: Extract<WorldMessage, { type: 'setExperience' }>): OwnEvent[] {
    const events: OwnEvent[] = [];
    this.exp = m.exp;
    const from = this.levelNow;
    if (m.level > from) {
      events.push({ kind: 'levelUp', from, to: m.level });
      const pattern = patternUpLevel(from, m.level);
      if (pattern !== null) events.push({ kind: 'patternUp', level: pattern });
      this.levelNow = m.level;
      this.refill();
      events.push({ kind: 'refilled' });
    } else if (m.level < from) {
      this.levelNow = m.level;
    }
    if (m.deathExp !== -1n) this.deathExp = m.deathExp;
    if (m.deathLevel !== 0xffff) this.deathLevel = m.deathLevel;
    const before = this.skillPoint;
    this.skillLevel = m.skillLevel;
    this.skillPoint = m.skillPoint;
    if (before < m.skillPoint) events.push({ kind: 'skillPointUp' });
    return events;
  }

  /**
   * `CDPClient::OnSetState` (`DPClient.cpp:13514-13524`): the four stats and the stat points are the message's (the
   * unused `nRemainLP` is dropped by the reader), then HP, MP and FP are set to their new maxima, so the bars show full
   * until the next SETPOINTPARAM.
   */
  private onSetState(m: Extract<WorldMessage, { type: 'setState' }>): OwnEvent[] {
    this.stats = { str: m.str, sta: m.sta, dex: m.dex, int: m.int };
    this.remainGP = m.remainGP;
    this.refill();
    return [{ kind: 'statsChanged' }, { kind: 'refilled' }];
  }

  /** HP, MP and FP at their maxima: `SetHitPoint( GetMaxHitPoint() )` and the other two (`DPClient.cpp:13520-13522`). */
  private refill(): void {
    this.hp = this.maxHp();
    this.mp = this.maxMp();
    this.fp = this.maxFp();
  }

  /**
   * `CDPClient::OnDamage` (`DPClient.cpp:1758`) for the own mover (:1785-1788): `IncHitPoint( -dwHit )`, which is
   * `SetPointParam( DST_HP, m_nHitPoint + nVal )`, and an HP of 0 becomes 1 (a hit never kills: MOVERDEATH does).
   */
  private onDamage(hit: number): void {
    this.setPointParam(DstParam.HP, this.hp - (hit | 0));
    if (this.hp === 0) this.hp = 1;
  }

  /**
   * `CDPClient::OnRevivalLodestar` (`DPClient.cpp:3484-3513`, `__VER >= 9`): HP is `GetMaxHitPoint() * nRate / 10` in int
   * arithmetic (:3501), and MP and FP rise to the same part of their maxima only when they are lower (:3502-3507). The
   * SETPOINTPARAMs the server sends next (20 %) overwrite them.
   */
  private onRevivalLodestar(): void {
    const rate = lodestarRate(this.levelNow);
    this.hp = Math.trunc(this.maxHp() * rate / 10);
    const mp = Math.trunc(this.maxMp() * rate / 10);
    if (this.mp < mp) this.mp = mp;
    const fp = Math.trunc(this.maxFp() * rate / 10);
    if (this.fp < fp) this.fp = fp;
  }
}
