import { GAME_DATA_KEYS } from '@flyffweb/formats';
import type { WebItemProp, WebJob } from '@flyffweb/formats';
import { DstParam, QS_END } from '@flyffweb/protocol';
import type { AddedMover, InitStat, InventoryItem, OwnQuest, SkillSlot, TaskBar, WorldMessage } from '@flyffweb/protocol';
import { GameDataMissingError } from './gameData';
import type { GameData } from './gameData';
import { Parts, ownWorn } from './render/looks';
import { equipmentPart } from './items/equipment';
import {
  Dst, FISTS, effectiveStats, equipAdjust, expNeeded, expPercentText, maxFatiguePoint, maxHitPoint, maxManaPoint,
} from './sim/params';
import type { Equipped, ParamAdjust, Stats } from './sim/params';

/**
 * What the screen should play for an own message, in the order Neuz does it:
 * - `levelUp`: the level rose from `from` to `to`, whatever the jump (`SetExperience` plays it once): the level-up
 *   effect and motion, the caption, and the chat line `TID_GAME_LEVELUP` when `chatLine` is true. Neuz prints that line
 *   only when `m_nDeathLevel < nLevel` (`MoverParam.cpp:1729`), tested before `OnSetExperience` stores the message's own
 *   death level (`DPClient.cpp:3390-3393`); `chatLine` is that test, so it is not `deathLevel` read after the message.
 * - `patternUp`: the level crossed a combo level (2, 8 or 12), and `level` is the first of them (see `patternUpLevel`).
 * - `refilled`: HP, MP and FP were set to their maxima (a level up, SETSTATE).
 * - `statsChanged`: SETSTATE replaced the stats and the stat points.
 * - `skillPointUp`: SETEXPERIENCE brought more skill points than there were: a second level-up effect and the caption
 *   `TID_GAME_SKILLPOINT_UP` (`OnSetExperience`, `DPClient.cpp:3394-3417`).
 * - `skillPointReset`: INITSKILLPOINT reset the skills (`OnInitSkillPoint`, `DPClient.cpp:14687-14728`): with `effect`,
 *   the points rose, which plays `XI_GEN_LEVEL_UP01` on the own player (and Neuz's level-up music, `BGM_IN_LEVELUP`: this
 *   client plays no sound); with `chatLine`, the chat line `TID_GAME_RECCURENCE`, which a skill with a level and no row in
 *   the catalog stops before, as it stops the levels' reset (`return`, :14701-14702).
 * - `died`: MOVERDEATH, the HP is 0.
 * - `revived`: REVIVAL or REVIVAL_TO_LODESTAR.
 * - `quest`: the quests changed (Piece 7 M1; see `QuestChange`).
 */
export type OwnEvent =
  /** Piece 7 M5: the own flier's speed as the HUD shows it (`g_nFlySpeed`), once a flying step. */
  | { kind: 'speed'; shown: number }
  | { kind: 'levelUp'; from: number; to: number; chatLine: boolean }
  | { kind: 'patternUp'; level: 2 | 8 | 12 }
  | { kind: 'refilled' }
  | { kind: 'statsChanged' }
  | { kind: 'skillPointUp' }
  | { kind: 'skillPointReset'; effect: boolean; chatLine: boolean }
  | { kind: 'died' }
  | { kind: 'revived' }
  | { kind: 'quest'; change: QuestChange }
  /**
   * Piece 7 M2: SET_JOB_SKILL changed the job (`OnSetChangeJob`, `DPClient.cpp:3600-3654`): the level-up effect and
   * music, and the chat line `TID_EVE_CHGJOB` with the job's name (`title`, `GetJobString`).
   */
  | { kind: 'jobChanged'; job: number; title: string };

/**
 * How a quest message changed the own quests (`CDPClient::OnSetQuest`, `DPClient.cpp:8444-8573`; `CMover::SetQuest`,
 * `MoverParam.cpp:3475-3577`; `OnRemoveQuest`, `:14633-14684`; `OnCheckedQuest`, `:19245-19250`):
 * - `started`: a new current quest (`BGM_EV_START`);
 * - `progress`: a known quest that has not ended, `before` and `after` (the lines compare them);
 * - `ended`: state 14, moved to the completed quests unless it repeats, and out of the checked ones (`BGM_EV_END`);
 * - `removed`: REMOVEQUEST -1 (`cancelled`) or 0;
 * - `listsChanged`: QUEST_CHECKED, or REMOVEQUEST 1 (all) or 2 (the completed list).
 */
export type QuestChange =
  | { kind: 'started'; quest: OwnQuest }
  | { kind: 'progress'; before: OwnQuest; after: OwnQuest }
  | { kind: 'ended'; quest: OwnQuest }
  | { kind: 'removed'; questId: number; cancelled: boolean }
  | { kind: 'listsChanged' };

/** `JTYPE_MASTER` and `JTYPE_HERO` (`Resource/defineJob.h:9-10`): the skills a reset of the skill points leaves. */
const JTYPE_MASTER = 5;
const JTYPE_HERO = 6;

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

/**
 * The `nRate` of `OnRevivalLodestar` (`DPClient.cpp:3492-3499`, `__VER >= 9`): the tenths of the maximum it gives, to
 * any mover it names (the world's, `WorldState`, for the others).
 */
export function lodestarRate(level: number): number {
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
  /** `m_nJob`: SET_JOB_SKILL changes it (`changeJob`). */
  job: number;
  /** The job's row of `propJob.inc`, which the formulas read, and its name (`title`, `GetJobString`). */
  jobProp: WebJob;
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
  inventorySlots: number[];
  readonly equipmentObjectIds: number[];
  inventoryRevision = 0;
  gold = 0;
  readonly inventoryError: string | null;
  /** The shortcut bars, once the TASKBAR message after the ADD_OBJ has come. */
  taskBar: TaskBar | null = null;
  /** `m_aQuest` by id, `m_aCompleteQuest` and `m_aCheckedQuest` (copies). */
  readonly quests: Map<number, OwnQuest>;
  completedQuests: number[];
  checkedQuests: number[];
  private worn: Equipped;
  private adjust: ParamAdjust;
  /** Piece 7 M2: the live buffs' parameters (SETDESTPARAM less RESETDESTPARAM), by `DST_*`. */
  private readonly buffAdjust = new Map<number, number>();
  /** Owner-only server display snapshot, refreshed after any stat change. */
  profileStats: readonly number[] | null = null;

  /**
   * `added` is the own ADD_OBJ (its HP is `m_nHitPoint`; its `player.own` the rest) and `equipment` the lobby's item IDs
   * of the character, which dress it (`ownWorn`) and make `equipped`. Throws when `added` is not the own character's, and
   * a `GameDataMissingError` when the job table has no row for its job: the game files are older than the server's.
   * `repeats` tells a repeatable quest (the catalog's `repeat`), which an end never adds to the completed quests.
   */
  constructor(
    private readonly data: GameData, added: AddedMover, equipment: readonly number[],
    private readonly repeats: (questId: number) => boolean = () => false,
  ) {
    const player = added.player;
    const own = player?.own;
    if (player === undefined || own === null || own === undefined) {
      throw new Error(`mover ${added.objectId} is not the own character: its ADD_OBJ carries no own data`);
    }
    const jobProp = data.jobs[player.job];
    if (jobProp === undefined) throw new GameDataMissingError([`${GAME_DATA_KEYS.jobs} (job ${player.job})`]);
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
    this.gold = own.gold ?? 0;
    this.quests = new Map((own.quests ?? []).map((quest) => [quest.id, { ...quest, kills: [...quest.kills] as [number, number] }]));
    this.completedQuests = [...(own.completedQuests ?? [])];
    this.checkedQuests = [...(own.checkedQuests ?? [])];
    // CWndInventory/RedoEquip(FALSE) reads m_Inventory.GetEquip(part), whose source is m_apIndex[42 + part].
    this.equipmentObjectIds = own.inventorySlots ? own.inventorySlots.slice(42, 73) : [...player.equipmentObjectIds];
    this.inventorySlots = own.inventorySlots ? [...own.inventorySlots] : Array.from({ length: 73 }, (_, i) =>
      i < 42 ? i : this.equipmentObjectIds[i - 42] ?? 0xffffffff);
    this.worn = wornBy(equipment, data);
    this.adjust = equipAdjust(this.worn);
  }

  /**
   * `CDPClient::OnSetChangeJob` for `g_pPlayer` (`DPClient.cpp:3600-3621`): `m_nJob = nJob`, then all 45 slots of
   * `m_aJobSkill` read from the message (the slots 3-44 it clears first are read over). The job's row comes with it, so
   * the formulas follow; a job the table lacks is game files older than the server's, as at the start.
   */
  private changeJob(job: number, skills: readonly SkillSlot[]): OwnEvent[] {
    const jobProp = this.data.jobs[job];
    if (jobProp === undefined) throw new GameDataMissingError([`${GAME_DATA_KEYS.jobs} (job ${job})`]);
    this.job = job;
    this.jobProp = jobProp;
    this.skills = skills.map((slot) => ({ ...slot }));
    return [{ kind: 'jobChanged', job, title: jobProp.title }];
  }

  /**
   * Piece 7 M2: the item in the arrow slot (`PARTS_BULLET`, `GetEquipItem`), read from the inventory as it is now: null
   * for an empty slot, and once UPDATE_ITEM has spent the stack to 0 (`CMover::ArrowDown`, `Mover.cpp:8504-8549`).
   */
  bullet(): WebItemProp | null {
    const id = this.equipmentObjectIds[Parts.BULLET];
    const item = id === undefined ? undefined : this.inventory?.get(id);
    return item === undefined ? null : this.data.itemProps.get(item.itemId) ?? null;
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
    this.adjust = this.withBuffs(equipAdjust(worn));
  }

  /**
   * Piece 7 M2: the worn items' parameters with the live buffs' over them (`m_adjParamAry`): what SETDESTPARAM added
   * and RESETDESTPARAM took off. `DST_CHRSTATE` is bits (`SetDestParam`'s `|=`, `ResetDestParam`'s `&= ~`).
   */
  private withBuffs(base: ParamAdjust): ParamAdjust {
    if (this.buffAdjust.size === 0) return base;
    const all = new Map(base);
    for (const [dst, value] of this.buffAdjust) {
      all.set(dst, dst === Dst.CHRSTATE ? (all.get(dst) ?? 0) | value : (all.get(dst) ?? 0) + value);
    }
    return all;
  }

  /** Piece 7 M2: SETDESTPARAM, RESETDESTPARAM and RESETDESTPARAM_SYNC (`DPClient.cpp:3271-3305`) on the buff layer. */
  private buffParam(dst: number, change: (value: number, base: number) => number): void {
    const base = equipAdjust(this.worn).get(dst) ?? 0;
    const value = change(this.buffAdjust.get(dst) ?? 0, base);
    if (value === 0) this.buffAdjust.delete(dst);
    else this.buffAdjust.set(dst, value);
    this.adjust = this.withBuffs(equipAdjust(this.worn));
  }

  /** `m_adjParamAry` as the worn items fill it (`equipAdjust`): what the formulas' `GetParam` reads. */
  get adj(): ParamAdjust {
    return this.adjust;
  }

  /** `GetStr()`, `GetSta()`, `GetDex()` and `GetInt()`: the stats plus the worn items' parameters, at least 1. */
  effective(): Stats {
    const v = this.profileStats;
    return v ? { str: v[0]!, sta: v[1]!, dex: v[2]!, int: v[3]! } : effectiveStats(this.stats, this.adjust);
  }

  maxHp(): number {
    return this.profileStats?.[4] ?? maxHitPoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
  }

  maxMp(): number {
    return this.profileStats?.[5] ?? maxManaPoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
  }

  maxFp(): number {
    return this.profileStats?.[6] ?? maxFatiguePoint(this.jobProp, this.levelNow, this.effective(), this.adjust);
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
   * bundle's, which `readBundle` reports beside the message; note `WorldState.apply` takes `( objectId, message )`, this
   * the other way round). It is required, as a message with none cannot be told from the own one: a message about another
   * mover is ignored, as `prj.GetMover( objid )` in the handlers finds that mover and not `g_pPlayer`.
   *
   * SETSTATE, TASKBAR, DOUSESKILLPOINT, INITSKILLPOINT and SETACTIONPOINT name no mover in Neuz (`OnSetState( ar )`,
   * `OnTaskBar( ar )`, `OnDoUseSkillPoint( ar )` and `OnInitSkillPoint( ar )` go to `g_pPlayer` and its task bar,
   * `DPClient.cpp:653-654`; `OnSetActionPoint` reads no object, its message's being `NULL_ID`), so they apply whatever
   * `objectId` is. SETLEVEL is another player's (`CUserMng::AddSetLevel` skips the player, `User.cpp:4694-4706`), so it is
   * ignored. The rest of the messages are not about the own numbers.
   */
  apply(message: WorldMessage, objectId: number): OwnEvent[] {
    switch (message.type) {
      case 'profileStats':
        if (objectId === this.objectId && message.values.length === 14) this.profileStats = [...message.values];
        return [];
      case 'setState':
        return this.onSetState(message);
      case 'taskBar':
        // CWndTaskBar::Serialize empties the bars and reads them anew: after a reset of the skills too, whose server
        // empties every skill shortcut and sends the bars again (`CMover::InitSkillExp`, `Mover.cpp:1855-1900`)
        this.taskBar = message.taskBar;
        return [];
      case 'doUseSkillPoint':
        this.onDoUseSkillPoint(message);
        return [];
      case 'initSkillPoint':
        return this.onInitSkillPoint(message.skillPoint);
      case 'setActionPoint':
        // OnSetActionPoint (DPClient.cpp:15798-15805): m_pWndTaskBar->m_nActionPoint alone, in place, so that the bars stay
        // as they are (the task bar loads them anew only for another TASKBAR); a TASKBAR sets it again as it comes
        if (this.taskBar !== null) this.taskBar.actionPoint = message.actionPoint;
        return [];
      // the quest messages that name no object (OnRemoveQuest, OnCheckedQuest, OnQuestTextTime, OnNPCPos)
      case 'removeQuest':
        return this.onRemoveQuest(message.kind, message.questId);
      case 'questChecked':
        this.checkedQuests = [...message.quests];
        return [{ kind: 'quest', change: { kind: 'listsChanged' } }];
      case 'questTextTime': // party quests; drawn only on internal servers (WndWorld.cpp:1137-1160)
      case 'questHelperNpcPos': // the answer to a request V15 never sends
        return [];
      default:
        break;
    }
    if (objectId !== this.objectId) return [];
    switch (message.type) {
      case 'setJobSkill':
        return this.changeJob(message.job, message.skills);
      case 'createItem':
        if (message.itemType === 0 && this.inventory !== null) {
          for (const stack of message.stacks) {
            if (stack.count > 0) this.inventory.set(stack.objectId, { ...message.item, ...stack });
            else this.inventory.delete(stack.objectId);
          }
          this.inventoryRevision++;
        }
        return [];
      case 'updateItem': {
        const item = this.inventory?.get(message.objectId);
        if (message.itemType === 0 && item && (message.param === 0 || message.param === 8)) {
          if ((message.value | 0) <= 0) this.inventory!.delete(message.objectId);
          else this.inventory!.set(message.objectId, { ...item, count: message.value });
          this.inventoryRevision++;
        }
        return [];
      }
      case 'moveItem':
        if (message.itemType === 0) this.moveInventory(message.source, message.destination);
        return [];
      case 'equipItem': {
        const prop = this.data.itemProps.get(message.itemId);
        if (prop) {
          const part = equipmentPart(prop, message.part, message.equip, this.job,
            (slot) => this.data.itemProps.get(this.inventory?.get(this.equipmentObjectIds[slot]!)?.itemId ?? -1),
            this.equipmentObjectIds.indexOf(message.objectId));
          const exclusive = this.data.items.get(prop.id)?.exclusive ?? -1;
          if (message.equip && exclusive >= 0 && this.equipmentObjectIds[exclusive] !== 0xffffffff) {
            this.equipInventory(this.equipmentObjectIds[exclusive]!, exclusive, false);
          }
          this.equipInventory(message.objectId, part, message.equip);
        }
        return [];
      }
      case 'setDestParam': // Piece 7 M2: SetDestParam( dst, adj, chg ); the chg (a value set) is left out
        this.buffParam(message.dst, (v) => (message.dst === Dst.CHRSTATE ? v | message.adj : v + message.adj));
        return [];
      case 'resetDestParam':
        // Only what the layer holds comes off: a buff from before this world's JOIN (its own ADD_OBJ's buffs are not
        // read, plan Decisions 9) left nothing here, and its end must not take the numbers under the server's
        this.buffParam(message.dst, (v) => {
          if (message.dst === Dst.CHRSTATE) return v & ~message.adj;
          if (Math.sign(v) !== Math.sign(message.adj)) return v;
          return Math.abs(message.adj) >= Math.abs(v) ? 0 : v - message.adj;
        });
        return [];
      case 'resetDestParamSync': // m_adjParamAry[DST_SPEED] = nTotal (MoverParam.cpp:2727-2750): the whole, items and all
        this.buffParam(message.dst, (_v, base) => message.total - base);
        return [];
      case 'setPointParam': // OnSetPointParam (DPClient.cpp:3303)
        this.setPointParam(message.param, message.value);
        return [];
      case 'setExperience':
        return this.onSetExperience(message);
      case 'setGrowthLearningPoint': // OnSetGrowthLearningPoint (:3531): m_nRemainGP = nRemainGP (:3540)
        this.remainGP = message.remainGP;
        return [];
      case 'setQuest': // OnSetQuest (:8444): for the active mover
        return this.onSetQuest(message.quest);
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

  /** Server MOVEITEM executes CItemContainer::Swap, including automatic stack merging. */
  private moveInventory(source: number, destination: number): void {
    if (!this.inventory || source === destination || source >= 42 || destination >= 42) return;
    const a = this.inventorySlots[source]!, b = this.inventorySlots[destination]!;
    const src = this.inventory.get(a), dst = this.inventory.get(b);
    if (!src) return;
    const max = this.data.itemProps.get(src.itemId)?.packMax ?? 1;
    if (dst && src.itemId === dst.itemId && (src.flag ?? 0) === (dst.flag ?? 0) &&
        (src.charged ?? 0) === (dst.charged ?? 0) && max > 1) {
      const amount = Math.max(0, Math.min(src.count, max - dst.count));
      this.inventory.set(b, { ...dst, count: dst.count + amount });
      if (src.count === amount) this.inventory.delete(a);
      else this.inventory.set(a, { ...src, count: src.count - amount });
    } else {
      this.inventorySlots[source] = b;
      this.inventorySlots[destination] = a;
    }
    this.inventoryRevision++;
  }

  /** Native DoEquip/UnEquip allocate the first free object/empty bag position, retaining item identity. */
  private equipInventory(objectId: number, part: number, equip: boolean): void {
    if (!this.inventory?.has(objectId) || part < 0 || part >= 31) return;
    const at = 42 + part;
    const old = this.inventorySlots[at]!;
    if (equip) {
      if (old === objectId) return;
      if (this.inventory.has(old)) this.equipInventory(old, part, false);
      const source = this.inventorySlots.indexOf(objectId);
      const free = Array.from({ length: 73 }, (_, i) => i).find((id) =>
        !this.inventory!.has(id) && !this.inventorySlots.includes(id));
      if (source < 0 || source >= 42 || free === undefined) return;
      this.inventorySlots[source] = free;
      this.inventorySlots[at] = objectId;
    } else {
      if (old !== objectId) return;
      const bag = this.inventorySlots.findIndex((id, i) => i < 42 && id < 73 && !this.inventory!.has(id));
      if (bag < 0) return;
      this.inventorySlots[bag] = objectId;
      this.inventorySlots[at] = 0xffffffff;
    }
    this.equipmentObjectIds[part] = equip ? objectId : 0xffffffff;
    // Keep actual slots: two rings share a catalog part and must both contribute their parameters.
    const parts = this.equipmentObjectIds.map((id) => this.data.itemProps.get(this.inventory!.get(id)?.itemId ?? -1));
    this.equipped = { weapon: parts[Parts.RWEAPON] ?? null,
      armour: parts.filter((prop, at): prop is WebItemProp => prop !== undefined && at !== Parts.RWEAPON) };
    this.inventoryRevision++;
  }

  /**
   * `CMover::SetPointParam` (`MoverParam.cpp:889-955`, the client's branches): a negative value is 0, and HP, MP and FP stop
   * at their maxima. `DST_GOLD` (penya) is kept nowhere here.
   */
  private setPointParam(param: number, value: number): void {
    const v = Math.max(0, value);
    switch (param) {
      case 10000: // DST_GOLD, defineAttribute.h; server-confirmed penya
        this.gold = v;
        this.inventoryRevision++;
        break;
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
   * - a higher level (:1714): the level up, with whether its chat line is due (:1729), the pattern up of the first combo
   *   level it crosses (:1740-1750), then the new level and HP, MP and FP at the new maxima (:1766-1772). A jump over
   *   several levels is one level up;
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
      // the chat line is tested here, with the death level before this message's (:1729 against :3390-3393)
      events.push({ kind: 'levelUp', from, to: m.level, chatLine: this.deathLevel < m.level });
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
   * `CMover::SetQuest` (`MoverParam.cpp:3475-3577`): a quest already completed is refused; a new one is added; a known
   * one is updated; one at state 14 leaves the current and checked quests and joins the completed ones unless it repeats.
   */
  private onSetQuest(quest: OwnQuest): OwnEvent[] {
    if (this.completedQuests.includes(quest.id)) return [];
    const copy: OwnQuest = { ...quest, kills: [...quest.kills] as [number, number] };
    const before = this.quests.get(quest.id);
    if (quest.state === QS_END) {
      this.quests.delete(quest.id);
      this.checkedQuests = this.checkedQuests.filter((id) => id !== quest.id);
      if (!this.repeats(quest.id)) this.completedQuests.push(quest.id);
      return [{ kind: 'quest', change: { kind: 'ended', quest: copy } }];
    }
    this.quests.set(quest.id, copy);
    return [{ kind: 'quest', change: before === undefined ? { kind: 'started', quest: copy } : { kind: 'progress', before, after: copy } }];
  }

  /** `OnRemoveQuest` (`DPClient.cpp:14633-14684`): -1 cancelled, 0 removed, 1 every list, 2 the completed list. */
  private onRemoveQuest(kind: number, questId: number): OwnEvent[] {
    if (kind === 1 || kind === 2) {
      this.completedQuests = [];
      if (kind === 1) {
        this.quests.clear();
        this.checkedQuests = [];
      }
      return [{ kind: 'quest', change: { kind: 'listsChanged' } }];
    }
    this.quests.delete(questId);
    this.completedQuests = this.completedQuests.filter((id) => id !== questId);
    this.checkedQuests = this.checkedQuests.filter((id) => id !== questId);
    return [{ kind: 'quest', change: { kind: 'removed', questId, cancelled: kind === -1 } }];
  }

  /**
   * An NPC's stat reset (`CDPClient::OnRunScriptFunc`, FUNCTYPE_INITSTAT to INITINT, `DPClient.cpp:14374-14431`): the
   * stat it names, or all four, back to 15, and the stat points the message's (`m_nRemainGP`).
   */
  initStat(stat: InitStat, remainGP: number): OwnEvent[] {
    this.stats = stat === 'all' ? { str: 15, sta: 15, dex: 15, int: 15 } : { ...this.stats, [stat]: 15 };
    this.remainGP = remainGP;
    return [{ kind: 'statsChanged' }];
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

  /**
   * `CDPClient::OnDoUseSkillPoint` (`DPClient.cpp:14730-14748`): for each of the 45 pairs, the level goes to the first slot
   * that holds the pair's skill (`GetSkill( dwSkill )`, `MoverParam.cpp:96-104`, by skill ID, not by slot: an empty pair,
   * `NULL_ID`, finds the first empty slot, whose level is 0 already), and a skill the player lacks is skipped; then the
   * points. The skill window's refresh (`InitItem`) is the window's, from these.
   */
  private onDoUseSkillPoint(m: Extract<WorldMessage, { type: 'doUseSkillPoint' }>): void {
    for (const pair of m.skills) {
      const slot = this.skills.find((s) => s.skill === pair.skill);
      if (slot !== undefined) slot.level = pair.level;
    }
    this.skillPoint = m.skillPoint;
  }

  /**
   * `CDPClient::OnInitSkillPoint` (`DPClient.cpp:14687-14728`, `__LEGEND`): more points than there were play the level-up
   * effect (and music); the points are the message's; then each skill with a level goes to 0 unless it is a master's or a
   * hero's (`JTYPE_MASTER`, `JTYPE_HERO`). A skill with a level and no row in the catalog stops it there (`return`,
   * :14701-14702): the slots after it keep their levels and the chat line `TID_GAME_RECCURENCE` does not come. The server
   * empties the skill shortcuts and sends the bars again (`InitSkillExp`), which TASKBAR applies.
   */
  private onInitSkillPoint(skillPoint: number): OwnEvent[] {
    const effect = this.skillPoint < skillPoint;
    this.skillPoint = skillPoint;
    for (const slot of this.skills) {
      if (slot.level === 0) continue;
      const skill = this.data.skills.get(slot.skill);
      if (skill === undefined) return [{ kind: 'skillPointReset', effect, chatLine: false }];
      if (skill.jobType !== JTYPE_MASTER && skill.jobType !== JTYPE_HERO) slot.level = 0;
    }
    return [{ kind: 'skillPointReset', effect, chatLine: true }];
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
