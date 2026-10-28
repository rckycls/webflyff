import { MAX_SLOT_QUEUE, NULL_ID } from '@flyffweb/protocol';
import type { SkillSlot } from '@flyffweb/protocol';
import type { WebSkill } from '@flyffweb/formats';

/**
 * The rules of the skills (spec §3.11, skills notes §3.1, §4.11, §5.4): which skills can be raised, the skill-point plan the
 * skill window edits, and which skills may go on the task bar and in the action slot. Pure functions over the skills catalog
 * (`WebSkill`) and the player's `SkillSlot`s, copied from Neuz with `__VER` 15 and the top of `VersionCommon.h`.
 *
 *   CMover::CheckSkill           _Common/MoverParam.cpp:117-156     a skill is open: the character level and its prerequisites
 *   CWndSkillTreeEx::CheckSkill  _Interface/WndField.cpp:6649-6703  the same against the window's copy of the levels
 *   CWndSkillTreeEx              _Interface/WndField.cpp:6531-6591  IsDownPoint, SubSkillPointDown
 *                                                      :6736-6751  InitItem: the copy of the skills and the points
 *                                                      :8047-8117  the + - Reset and Finish buttons (OnChildNotify)
 *   CProject::GetSkillPoint      _Common/Project.cpp:5143-5153      what a level of a skill costs
 *   CWndTaskBar::OnDropIcon      _Interface/WndTaskBar.cpp:1920-1928  no skill of level 0 goes anywhere
 *                                                      :1962-1976, 2026-2041  the bar takes CT_STEP and CT_GENERAL skills
 *   CWndTaskBar::SetSkillQueue   WndTaskBar.cpp:1787-1872           what the action slot takes
 *   CWndTaskBar::CheckAddSkill   WndTaskBar.cpp:1668-1786           where in the action slot a combo style may go
 *
 * What Neuz asks around these rules, and the callers keep:
 *   - `CMover::CheckSkill` against the player's own levels, which `OnDropIcon` (`WndTaskBar.cpp:1920-1928`) and the skill
 *     window's double click (`WndField.cpp:8383`) ask before a skill goes on the bar or into the action slot
 *     (`canPlaceOnBar` and `canPlaceInQueue` know the level of the skill, not the character);
 *   - that the action slot is not running (`m_nExecute`, `SetSkillQueue` :1789 and `RemoveSkillQueue` :1448);
 *   - the text `TID_GAME_SKILLLNOTUSE` that `SetSkillQueue` prints when a cool-down turns a skill away (:1826-1829);
 *   - the master and hero jobs, which skip the character-level test of `CheckSkill` (`IsMaster()`, `IsHero()`).
 */

/** `CT_STEP`, `CT_CIRCLE`, `CT_FINISH` and `CT_GENERAL` (`Resource/defineAttribute.h:16-19`): `ItemProp::dwComboStyle`. */
export const ComboStyle = { STEP: 1, CIRCLE: 2, FINISH: 3, GENERAL: 4 } as const;

/** `JTYPE_BASE` and `JTYPE_EXPERT` (`Resource/defineJob.h:4-5`): the job types `GetSkillPoint` tells apart. */
const JTYPE_BASE = 0;
const JTYPE_EXPERT = 1;

/**
 * `CProject::m_dwVagSP`, `m_dwExpertSP` and `m_dwProSP` (`Project.cpp:127-129`): the skill points a level costs for a Vagrant
 * skill, an expert-job skill and any other. The server sets them from `Resource/Constant.inc:36-38` and sends them to every
 * player who joins (`CUser::AddGameSetting`, `WORLDSERVER/User.cpp:6496-6503`, called at `DPDatabaseClient.cpp:1094`) as GAMERATE
 * messages, which `CDPClient::OnGameRate` stores (`Neuz/DPClient.cpp:6467, 6582-6596`). This server's file gives the same 1, 2
 * and 3 as the defaults, and the browser does not read GAMERATE, so these are the defaults.
 */
const VAGRANT_SP = 1;
const EXPERT_SP = 2;
const PRO_SP = 3;

/** `CProject::GetSkillPoint( pSkillProp )` (`Project.cpp:5143-5153`): the skill points one level of `skill` costs. */
export function skillPointCost(skill: Pick<WebSkill, 'jobType'>): number {
  if (skill.jobType === JTYPE_BASE) return VAGRANT_SP;
  if (skill.jobType === JTYPE_EXPERT) return EXPERT_SP;
  return PRO_SP;
}

/**
 * `CMover::CheckSkill( dwSkill )` (`MoverParam.cpp:117-156`) for `skill`, a skill of the catalog: whether the character, at
 * character level `level`, has what the skill needs to be raised and used. The character level must reach the skill's
 * `reqLevel` (:123-129, `GetLevel() < (int) dwReqDisLV`, so the -1 of a `=` level is open to every level), and each
 * prerequisite (`dwReSkill1` and `dwReSkill2` with their levels, :131-153) must be at its level. A Master or a Hero skips
 * the character-level test (`!IsMaster() && !IsHero() &&`, :124, the live `__VER >= 10` branch); that is not modelled here,
 * and it never fires for a Vagrant.
 *
 * `levels` gives the level of the skill with an ID in the set of levels being asked (the player's own, or the skill window's
 * copy, `CWndSkillTreeEx::CheckSkill`, `WndField.cpp:6649-6703`), or `undefined` when that set has no such skill: `GetSkill`
 * finds none and the C++ then passes the prerequisite. (`nLog == 1` turns a skill away too, :121, but no row of `propSkill.txt`
 * sets it, so the catalog does not carry it.)
 */
export function checkSkill(skill: WebSkill, level: number, levels: (skillId: number) => number | undefined): boolean {
  if (level < skill.reqLevel) return false;
  for (const required of skill.reqSkills) {
    const owned = levels(required.skill);
    if (owned !== undefined && owned < required.level) return false;
  }
  return true;
}

/** A copy of a slot, so the plan and the player's array never share one. */
const copied = (slot: SkillSlot): SkillSlot => ({ skill: slot.skill, level: slot.level });

/**
 * The skill window's local copy of the skills (`CWndSkillTreeEx::m_apSkill` and `m_nCurrSkillPoint`, `InitItem`,
 * `WndField.cpp:6736-6751`): the player's skill levels and points, which the + and - buttons change and Reset loads again;
 * `result()` is what Finish sends (`SendDoUseSkillPoint( pSkillTree->GetSkill() )`, `WndField.cpp:13728-13741`).
 *
 * An index is a slot of `m_aJobSkill`. In Neuz the buttons act on the skill the player clicked, which is only ever a skill
 * that passes the window's `CheckSkill` (`OnLButtonDown`, `WndField.cpp:8251-8311`) and whose buttons work only while the
 * player has skill points (`OnChildNotify`, :8049); `plus` and `minus` refuse any other slot.
 */
export class SkillPlan {
  /** `g_pPlayer->m_aJobSkill`: the player's levels, which a level cannot be taken below. */
  private readonly own: SkillSlot[];
  /** `m_apSkill`: the plan's levels. */
  private slots: SkillSlot[];
  /** `m_nCurrSkillPoint`: the points the plan has left, 0 when the player has none (`InitItem`, :6741-6751). */
  private left: number;
  /** The points the plan starts from. */
  private readonly start: number;

  /**
   * `skills` are the player's slots (`own.skills`), `skillPoint` their unspent points (`m_nSkillPoint`), `catalog` the
   * skills by ID and `characterLevel` the character's level (`g_pPlayer->GetLevel()`).
   */
  constructor(
    skills: readonly SkillSlot[],
    skillPoint: number,
    private readonly catalog: ReadonlyMap<number, WebSkill>,
    private readonly characterLevel: number,
  ) {
    this.own = skills.map(copied);
    this.slots = skills.map(copied);
    this.start = skillPoint > 0 ? skillPoint : 0;
    this.left = this.start;
  }

  /** `m_nCurrSkillPoint`: the skill points the plan has left to spend. */
  get points(): number {
    return this.left;
  }

  /** Whether the plan differs from the player's: `m_nCurrSkillPoint != g_pPlayer->m_nSkillPoint`, which Reset and Finish test (:8085, :8092). */
  get changed(): boolean {
    return this.left !== this.start;
  }

  /** The player's slots with the plan's levels, a copy: what Finish sends. */
  result(): SkillSlot[] {
    return this.slots.map(copied);
  }

  /**
   * `CWndSkillTreeEx::CheckSkill( i )` (`WndField.cpp:6649-6703`): whether the skill in slot `index` is open, by the
   * character level and the plan's levels of its prerequisites. False for an empty slot or a skill the catalog lacks
   * (`GetSkillProp` finds none).
   */
  active(index: number): boolean {
    return this.skillOf(index) !== undefined;
  }

  /**
   * The + button (`WIDC_BUTTON1`, `WndField.cpp:8057-8072`): one more level of the skill in slot `index`, when its cost is
   * within the points left and its level is below its maximum (`dwExpertMax`). False when nothing changed.
   */
  plus(index: number): boolean {
    const skill = this.focusOf(index);
    if (skill === undefined) return false;
    const slot = this.slots[index]!;
    const cost = skillPointCost(skill);
    if (cost > this.left || slot.level >= skill.maxLevel) return false;
    this.left -= cost;
    slot.level++;
    return true;
  }

  /**
   * The - button (`WIDC_BUTTON2`, :8073-8082): one level less, refunded, when the plan's level is above the player's own
   * (`IsDownPoint`, :6531-6545); the skills that needed this one at the level it has left are then reset
   * (`SubSkillPointDown`). False when nothing changed.
   */
  minus(index: number): boolean {
    const skill = this.focusOf(index);
    if (skill === undefined) return false;
    const slot = this.slots[index]!;
    if (slot.level <= this.own[index]!.level) return false;
    this.left += skillPointCost(skill);
    slot.level--;
    this.resetDependents(slot);
    return true;
  }

  /**
   * The Reset button (`WIDC_BUTTON3`, :8083-8089): the player's levels and points again, when the plan has changed
   * (`m_nCurrSkillPoint != m_nSkillPoint`; the window then calls `InitItem`).
   */
  reset(): void {
    if (!this.changed) return;
    this.slots = this.own.map(copied);
    this.left = this.start;
  }

  /**
   * `CWndSkillTreeEx::SubSkillPointDown( lpSkill )` (`WndField.cpp:6547-6591`): every skill with a level that needs `lowered`
   * at a level it no longer has goes back to 0 and gives back all its levels' points, and so on down the chain.
   */
  private resetDependents(lowered: SkillSlot): void {
    for (const slot of this.slots) {
      const skill = this.catalog.get(slot.skill);
      if (slot.skill === NULL_ID || skill === undefined) continue;
      for (const required of skill.reqSkills) {
        if (required.skill !== lowered.skill || lowered.level >= required.level || slot.level <= 0) continue;
        this.left += skillPointCost(skill) * slot.level;
        slot.level = 0;
        this.resetDependents(slot);
      }
    }
  }

  /** The catalog's skill in slot `index` if it passes `CWndSkillTreeEx::CheckSkill` (:6649-6703), else undefined. */
  private skillOf(index: number): WebSkill | undefined {
    const slot = this.slots[index];
    if (slot === undefined || slot.skill === NULL_ID) return undefined;
    const skill = this.catalog.get(slot.skill);
    if (skill === undefined) return undefined;
    // GetdwSkill( dwSkill ) (:6593-6601): the plan's slot with that ID, or none
    const level = (skillId: number): number | undefined => this.slots.find((s) => s.skill === skillId)?.level;
    return checkSkill(skill, this.characterLevel, level) ? skill : undefined;
  }

  /** The skill the + and - buttons act on: an open skill, while the player has skill points to spend (`OnChildNotify`, :8049). */
  private focusOf(index: number): WebSkill | undefined {
    return this.start > 0 ? this.skillOf(index) : undefined;
  }
}

/**
 * Whether a skill the player has at `level` may go on the task bar (the applet row and the item bars):
 * `CWndTaskBar::OnDropIcon` takes only a `CT_STEP` or `CT_GENERAL` skill there (`WndTaskBar.cpp:1962-1976` for the row,
 * :2026-2041 for the bars; the loader empties such a slot of another style too, :340-343), and none of level 0 (:1920-1928,
 * which turns away every skill of level 0 that is dropped anywhere). For a Vagrant only Clean Hit can sit on the bar; Flurry
 * and Over Cut are for the action slot. The caller also asks `checkSkill` of the player's own levels (:1923).
 */
export function canPlaceOnBar(skill: WebSkill, level: number): boolean {
  return level > 0 && isBarStyle(skill);
}

/**
 * Whether `skill`'s combo style is one the task bar's rows take: `CT_STEP` or `CT_GENERAL` (`dwComboStyle`). The style alone,
 * with no test of the level: the loader's rule for a skill of the applet row (`CWndTaskBar::Serialize`,
 * `WndTaskBar.cpp:340-343`), and the bar's highlight of the rows a dragged skill may go to (`OnDraw`, :803-806).
 */
export function isBarStyle(skill: Pick<WebSkill, 'comboStyle'>): boolean {
  return skill.comboStyle === ComboStyle.STEP || skill.comboStyle === ComboStyle.GENERAL;
}

/** `m_nCurQueueNum`: the skills the action slot holds, counted up to the first empty slot. */
function queued(queue: readonly (WebSkill | null)[]): number {
  const empty = queue.findIndex((skill) => skill === null);
  return empty === -1 ? queue.length : empty;
}

/** The combo style of the skill in slot `i` of the queue, 0 for an empty slot (`CheckAddSkill`'s `dwComboStyle... = 0`). */
const styleAt = (queue: readonly (WebSkill | null)[], i: number): number => queue[i]?.comboStyle ?? 0;

/**
 * `CWndTaskBar::CheckAddSkill( nSkillStyleSrc, nQueueDest )` (`WndTaskBar.cpp:1668-1786`): whether a skill of combo style
 * `style` may go into slot `at` of the action slot, holding `queue` (`null` for an empty slot, the filled ones first):
 * - the first slot takes a step or general skill when the queue is empty, and a general one before a general one;
 * - elsewhere, never a step skill, and nothing after a finish skill;
 * - a circle or finish skill never follows a general one, a general skill only a general one;
 * - in the middle, a finish skill cannot take the place of a circle or finish skill, and a general one only that of a
 *   general one unless it goes at the end (:1769-1781);
 * - the last slot (4) has none of the checks of the slot it takes (:1715-1739), since only an append reaches it.
 *
 * `RemoveSkillQueue` asks this of the skill it has just taken out, for the slot it left, with the others already shifted
 * left (`WndTaskBar.cpp:1446-1472`, the call at :1465). An empty slot reads as no style: the C++ reads the `m_dwId` an empty
 * slot keeps (0, set by `RemoveSkillQueue` :1461 and `InitTaskBar` :532), which is the first skill of `m_aJobSkill`, Clean
 * Hit, a step skill, and none of the tests on the slot taken (only a circle, finish or general one counts) can mind that.
 */
export function checkAddSkill(queue: readonly (WebSkill | null)[], style: number, at: number): boolean {
  if (!Number.isInteger(at) || at < 0 || at >= MAX_SLOT_QUEUE) return false;
  const { STEP, CIRCLE, FINISH, GENERAL } = ComboStyle;
  if (at === 0) {
    if (queued(queue) === 0) return style === STEP || style === GENERAL;
    return style === GENERAL && styleAt(queue, 0) === GENERAL;
  }
  if (style === STEP) return false;
  const previous = styleAt(queue, at - 1);
  if (previous === FINISH) return false;
  if ((style === CIRCLE || style === FINISH) && previous === GENERAL) return false;
  if (at === MAX_SLOT_QUEUE - 1) return style !== GENERAL || previous === GENERAL;
  const taken = styleAt(queue, at);
  if (style === FINISH && (taken === CIRCLE || taken === FINISH)) return false;
  if (style === GENERAL) {
    if (previous !== GENERAL) return false;
    if (taken !== GENERAL && queued(queue) > at) return false;
  }
  return true;
}

/**
 * Whether a skill the player has at `level` may be dropped on slot `at` of the action slot, which holds `queue`
 * (`CWndTaskBar::SetSkillQueue`, `WndTaskBar.cpp:1787-1872`). Refused: a full queue (5, `MAX_SLOT_QUEUE`), a skill of level 0
 * (:1815), a skill with a cool-down at its level (`(int) dwCooldown > 0`, :1819-1830; the Vagrant's have none), and a place
 * `checkAddSkill` refuses. A drop past the last skill lands after it (:1804-1805), and a drop on a skill is an insert in front
 * of it (:1834-1844). The caller also asks `checkSkill` of the player's own levels, and that the queue is not running.
 */
export function canPlaceInQueue(queue: readonly (WebSkill | null)[], at: number, skill: WebSkill, level: number): boolean {
  const count = queued(queue);
  if (count >= MAX_SLOT_QUEUE) return false;
  if (level <= 0) return false;
  // GetAddSkillProp( dwSubDefine, dwLevel ): a level the catalog has no row for has no cool-down to refuse it by
  const cooldown = skill.levels[level - 1]?.cooldown;
  if (cooldown !== undefined && cooldown > 0) return false;
  if (!Number.isInteger(at) || at < 0) return false;
  return checkAddSkill(queue, skill.comboStyle, Math.min(at, count));
}
