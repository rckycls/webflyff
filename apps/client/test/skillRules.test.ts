import { describe, expect, it } from 'vitest';
import type { WebSkill } from '@flyffweb/formats';
import { MAX_SKILL_JOB, NULL_ID } from '@flyffweb/protocol';
import type { SkillSlot } from '@flyffweb/protocol';
import {
  ComboStyle,
  SkillPlan,
  canPlaceInQueue,
  canPlaceOnBar,
  checkAddSkill,
  checkSkill,
} from '../src/world/skills/skillRules';

// The skills below are rows of the converted skills catalog (`data/skills.json`, which the asset index `dist/assets/index.json`
// maps to the hashed `data/skills.<hash>.json`), written out with the values that file holds, since a unit test does not read
// `dist/`. Every field the rules read is the file's; `description` and `icon`, which no rule reads, are left blank.
//   1 Clean Hit, 2 Flurry, 3 Over Cut        the Vagrant's three: levels, prerequisites, combo styles, maximum level
//   317 Quick Step (Event)                   a Vagrant's event buff: CT_GENERAL, a `=` character level (-1), no cool-down
//   107 Blinkpool                            CT_GENERAL with a cool-down of 3000 ms at all 20 levels
//   150 Geburah Tiphreth                     two prerequisites (147 at 4, 148 at 7), a cool-down of 0 at every level
//   4 Slash, 128 Guard, 309 Special One-handed Mastery, 237 Ultimate Defense: job types 1, 2, 5 and 6 (what a level costs)
// No real skill has levels with a cool-down and levels without, so the one test that needs that (a cool-down at one level)
// uses a variant of Clean Hit with that one field changed, and says so.
const same = (value: number, n: number): number[] => Array<number>(n).fill(value);
const levelsOf = (reqMp: number[], reqFp: number[], cooldown: number[]): WebSkill['levels'] =>
  reqFp.map((fp, i) => ({ reqMp: reqMp[i]!, reqFp: fp, cooldown: cooldown[i]!, skillCount: -1 }));
const row = (skill: Omit<WebSkill, 'description' | 'icon'>): WebSkill => ({ ...skill, description: '', icon: null });

const CLEAN_HIT = row({
  id: 1, name: 'Clean Hit', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 3, reqSkills: [], useMotion: 1000,
  sfxHit: 201, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10, comboStyle: ComboStyle.STEP,
  levels: levelsOf(same(-1, 10), [5, 5, 5, 5, 8, 8, 8, 8, 10, 10], same(-1, 10)),
});
const FLURRY = row({
  id: 2, name: 'Flurry', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 5, reqSkills: [{ skill: 1, level: 3 }],
  useMotion: 1001, sfxHit: 202, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10,
  comboStyle: ComboStyle.CIRCLE, levels: levelsOf(same(-1, 10), [10, 10, 10, 12, 12, 12, 15, 15, 15, 15], same(-1, 10)),
});
const OVER_CUT = row({
  id: 3, name: 'Over Cut', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 10, reqSkills: [{ skill: 2, level: 3 }],
  useMotion: 1002, sfxHit: 203, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10,
  comboStyle: ComboStyle.FINISH, levels: levelsOf(same(-1, 10), [15, 15, 15, 18, 18, 18, 20, 20, 22, 22], same(-1, 10)),
});
const QUICK_STEP = row({
  id: 317, name: 'Quick Step (Event)', jobType: 0, job: 0, handed: -1, attackRange: 4, reqLevel: -1, reqSkills: [],
  useMotion: 1046, sfxHit: 291, exeTarget: 1, useChance: 1, skillType: 1, evildoing: 1, maxLevel: 5,
  comboStyle: ComboStyle.GENERAL, levels: levelsOf(same(-1, 5), same(-1, 5), same(-1, 5)),
});
const BLINKPOOL = row({
  id: 107, name: 'Blinkpool', jobType: 1, job: 4, handed: -1, attackRange: 5, reqLevel: 30, reqSkills: [{ skill: 121, level: 3 }],
  useMotion: 1066, sfxHit: -1, exeTarget: 7, useChance: 12, skillType: 1, evildoing: 1, maxLevel: 20,
  comboStyle: ComboStyle.GENERAL,
  levels: levelsOf(
    [22, 22, 23, 23, 24, 24, 25, 25, 25, 27, 27, 27, 28, 29, 30, 31, 31, 32, 32, 35], same(-1, 20), same(3000, 20),
  ),
});
const GEBURAH = row({
  id: 150, name: 'Geburah Tiphreth', jobType: 2, job: 10, handed: -1, attackRange: 1, reqLevel: 75,
  reqSkills: [{ skill: 147, level: 4 }, { skill: 148, level: 7 }], useMotion: 1128, sfxHit: -1, exeTarget: 13, useChance: 1,
  skillType: 1, evildoing: 1, maxLevel: 10, comboStyle: ComboStyle.GENERAL,
  levels: levelsOf([55, 65, 75, 85, 90, 100, 105, 115, 120, 125], same(-1, 10), same(0, 10)),
});
const SLASH = row({
  id: 4, name: 'Slash', jobType: 1, job: 1, handed: -1, attackRange: 1, reqLevel: 15, reqSkills: [], useMotion: 1003,
  sfxHit: 20, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 20, comboStyle: ComboStyle.STEP,
  levels: levelsOf(
    same(-1, 20), [20, 20, 23, 23, 26, 26, 30, 30, 33, 33, 36, 36, 40, 40, 43, 43, 46, 46, 50, 50], same(-1, 20),
  ),
});
const GUARD = row({
  id: 128, name: 'Guard', jobType: 2, job: 6, handed: 2, attackRange: -1, reqLevel: 62, reqSkills: [], useMotion: 1105,
  sfxHit: 322, exeTarget: 1, useChance: 1, skillType: 2, evildoing: 1, maxLevel: 10, comboStyle: ComboStyle.GENERAL,
  levels: levelsOf(same(-1, 10), [40, 44, 44, 48, 48, 53, 53, 58, 58, 64], same(60000, 10)),
});
const SPECIAL_MASTERY = row({
  id: 309, name: 'Special One-handed Mastery', jobType: 5, job: 17, handed: 3, attackRange: -1, reqLevel: 60, reqSkills: [],
  useMotion: 1009, sfxHit: 1865, exeTarget: 1, useChance: 1, skillType: 2, evildoing: 1, maxLevel: 5,
  comboStyle: ComboStyle.GENERAL, levels: levelsOf(same(-1, 5), same(500, 5), same(5000, 5)),
});
const ULTIMATE_DEFENSE = row({
  id: 237, name: 'Ultimate Defense', jobType: 6, job: 25, handed: -1, attackRange: -1, reqLevel: 120, reqSkills: [],
  useMotion: 1203, sfxHit: -1, exeTarget: 1, useChance: 1, skillType: 2, evildoing: 1, maxLevel: 5,
  comboStyle: ComboStyle.GENERAL,
  levels: levelsOf(same(9999999, 5), same(9999999, 5), [35000, 30000, 25000, 20000, 15000]),
});
const CATALOG = new Map([CLEAN_HIT, FLURRY, OVER_CUT].map((skill) => [skill.id, skill]));

// Clean Hit with the cool-down of its level 2 set to 5000: a variant, since no real skill has a cool-down at some levels
// and none at others (the queue rule reads the cool-down of the level the player has).
const CLEAN_HIT_COOLING_AT_2: WebSkill = {
  ...CLEAN_HIT, levels: CLEAN_HIT.levels.map((level, i) => (i === 1 ? { ...level, cooldown: 5000 } : level)),
};

/** The 45 slots of `m_aJobSkill` of a Vagrant: Clean Hit, Flurry and Over Cut with the given levels, the rest empty. */
function slots(cleanHit = 0, flurry = 0, overCut = 0): SkillSlot[] {
  const out: SkillSlot[] = Array.from({ length: MAX_SKILL_JOB }, () => ({ skill: NULL_ID, level: 0 }));
  out[0] = { skill: 1, level: cleanHit };
  out[1] = { skill: 2, level: flurry };
  out[2] = { skill: 3, level: overCut };
  return out;
}

const plan = (skills: SkillSlot[], skillPoint: number, characterLevel: number): SkillPlan =>
  new SkillPlan(skills, skillPoint, CATALOG, characterLevel);

const levelsAt = (p: SkillPlan): number[] => p.result().slice(0, 3).map((slot) => slot.level);

describe('checkSkill (CMover::CheckSkill, MoverParam.cpp:117-156)', () => {
  const owned = (map: Record<number, number>) => (id: number): number | undefined => map[id];

  it('needs the character level of the skill', () => {
    expect(checkSkill(CLEAN_HIT, 2, owned({}))).toBe(false);
    expect(checkSkill(CLEAN_HIT, 3, owned({}))).toBe(true);
    expect(checkSkill(CLEAN_HIT, 15, owned({}))).toBe(true);
  });

  it('needs the prerequisite at its level, and the character level too', () => {
    expect(checkSkill(FLURRY, 5, owned({ 1: 2 }))).toBe(false);
    expect(checkSkill(FLURRY, 5, owned({ 1: 3 }))).toBe(true);
    expect(checkSkill(FLURRY, 4, owned({ 1: 10 }))).toBe(false);
    expect(checkSkill(OVER_CUT, 10, owned({ 2: 3 }))).toBe(true);
    expect(checkSkill(OVER_CUT, 10, owned({ 1: 10, 2: 2 }))).toBe(false);
  });

  it('passes a prerequisite the array does not hold (GetSkill finds none, and the C++ then skips it)', () => {
    expect(checkSkill(FLURRY, 5, owned({}))).toBe(true);
  });

  it('is open at every level for a skill whose level is `=` (-1, the event buffs)', () => {
    expect(checkSkill({ ...CLEAN_HIT, reqLevel: -1 }, 1, owned({}))).toBe(true);
  });

  it('checks both prerequisites of a skill that has two', () => {
    // Geburah Tiphreth needs skill 147 at 4 and skill 148 at 7, and character level 75
    expect(checkSkill(GEBURAH, 75, owned({ 147: 4, 148: 6 }))).toBe(false);
    expect(checkSkill(GEBURAH, 75, owned({ 147: 3, 148: 7 }))).toBe(false);
    expect(checkSkill(GEBURAH, 75, owned({ 147: 4, 148: 7 }))).toBe(true);
    expect(checkSkill(GEBURAH, 74, owned({ 147: 10, 148: 10 }))).toBe(false);
  });
});

describe('SkillPlan (CWndSkillTreeEx\'s local copy, WndField.cpp:6531-6703, 8057-8117)', () => {
  it('Clean Hit cannot be raised at character level 2, and can at 3', () => {
    const low = plan(slots(), 4, 2);
    expect(low.active(0)).toBe(false);
    expect(low.plus(0)).toBe(false);
    expect(low.points).toBe(4);
    expect(levelsAt(low)).toEqual([0, 0, 0]);
    expect(low.changed).toBe(false);

    const ok = plan(slots(), 4, 3);
    expect(ok.active(0)).toBe(true);
    expect(ok.plus(0)).toBe(true);
    expect(ok.points).toBe(3);
    expect(levelsAt(ok)).toEqual([1, 0, 0]);
    expect(ok.changed).toBe(true);
  });

  it('Flurry needs Clean Hit at 3 in the plan, not only in the character', () => {
    const p = plan(slots(), 4, 5);
    expect(p.active(1)).toBe(false);
    expect(p.plus(1)).toBe(false);
    p.plus(0);
    p.plus(0);
    expect(p.active(1)).toBe(false); // Clean Hit 2
    expect(p.plus(0)).toBe(true);
    expect(p.active(1)).toBe(true); // Clean Hit 3
    expect(p.plus(1)).toBe(true);
    expect(levelsAt(p)).toEqual([3, 1, 0]);
    expect(p.points).toBe(0);
  });

  it('lowering Clean Hit below 3 resets a planned Flurry and refunds it', () => {
    const p = plan(slots(), 4, 5);
    for (let i = 0; i < 3; i++) p.plus(0);
    p.plus(1);
    expect(p.points).toBe(0);
    expect(p.minus(0)).toBe(true); // Clean Hit 2: Flurry needs 3
    expect(levelsAt(p)).toEqual([2, 0, 0]);
    expect(p.points).toBe(2); // the point of Clean Hit and the one of Flurry
  });

  it('resets what depends on a reset skill, all the way down, and refunds each level (SubSkillPointDown recursion)', () => {
    const p = plan(slots(), 8, 10);
    for (let i = 0; i < 3; i++) p.plus(0);
    for (let i = 0; i < 3; i++) p.plus(1);
    expect(p.plus(2)).toBe(true);
    expect(levelsAt(p)).toEqual([3, 3, 1]);
    expect(p.points).toBe(1);
    expect(p.minus(0)).toBe(true);
    expect(levelsAt(p)).toEqual([2, 0, 0]);
    expect(p.points).toBe(6); // 8 minus the 2 levels of Clean Hit that stay
  });

  it('keeps a dependent skill whose prerequisite still holds', () => {
    const p = plan(slots(), 8, 5);
    for (let i = 0; i < 4; i++) p.plus(0);
    p.plus(1);
    p.plus(1);
    expect(p.minus(0)).toBe(true); // Clean Hit 3
    expect(levelsAt(p)).toEqual([3, 2, 0]);
    expect(p.points).toBe(3);
  });

  it('cannot go above the skill\'s maximum level of 10, or without points', () => {
    const p = plan(slots(), 28, 15);
    for (let i = 0; i < 10; i++) expect(p.plus(0)).toBe(true);
    expect(p.plus(0)).toBe(false);
    expect(levelsAt(p)[0]).toBe(10);
    expect(p.points).toBe(18);

    const few = plan(slots(), 2, 15);
    expect(few.plus(0)).toBe(true);
    expect(few.plus(0)).toBe(true);
    expect(few.plus(0)).toBe(false);
    expect(few.points).toBe(0);
  });

  it('cannot go below the player\'s own level of the skill', () => {
    const p = plan(slots(2), 3, 5);
    expect(p.minus(0)).toBe(false); // the player has Clean Hit 2
    expect(levelsAt(p)).toEqual([2, 0, 0]);
    expect(p.points).toBe(3);
    expect(p.plus(0)).toBe(true);
    expect(p.minus(0)).toBe(true);
    expect(p.minus(0)).toBe(false);
    expect(levelsAt(p)).toEqual([2, 0, 0]);
    expect(p.points).toBe(3);
    expect(p.changed).toBe(false);
  });

  it('will not lower the levels the player has, and raises one that follows them', () => {
    const p = plan(slots(3, 1), 2, 5);
    expect(p.minus(0)).toBe(false);
    expect(p.minus(1)).toBe(false);
    expect(p.plus(1)).toBe(true);
    expect(levelsAt(p)).toEqual([3, 2, 0]);
  });

  it('does nothing on an empty slot or a skill the catalog lacks', () => {
    const p = plan(slots(), 4, 15);
    expect(p.active(3)).toBe(false);
    expect(p.plus(3)).toBe(false);
    expect(p.minus(3)).toBe(false);
    expect(p.plus(MAX_SKILL_JOB)).toBe(false);
    expect(p.active(-1)).toBe(false);
    const unknown = slots();
    unknown[3] = { skill: 999, level: 0 };
    expect(plan(unknown, 4, 15).plus(3)).toBe(false);
  });

  it('is inert with no skill points, as the window is (OnChildNotify needs m_nSkillPoint > 0)', () => {
    const p = plan(slots(2), 0, 15);
    expect(p.points).toBe(0);
    expect(p.plus(0)).toBe(false);
    expect(p.minus(0)).toBe(false);
    expect(p.changed).toBe(false);
    expect(levelsAt(p)).toEqual([2, 0, 0]);
  });

  it('result() keeps the player\'s skill IDs, with the new levels, and never touches the array it was given', () => {
    const own = slots(1);
    own[3] = { skill: 317, level: 0 };
    own[4] = { skill: 318, level: 2 };
    const p = plan(own, 5, 5);
    p.plus(0);
    p.plus(0);
    p.plus(1); // Clean Hit is 3 now
    const result = p.result();
    expect(result).toHaveLength(MAX_SKILL_JOB);
    expect(result.map((slot) => slot.skill)).toEqual(own.map((slot) => slot.skill));
    expect(result.slice(0, 5).map((slot) => slot.level)).toEqual([3, 1, 0, 0, 2]);
    expect(result[5]).toEqual({ skill: NULL_ID, level: 0 });
    // the player's own array is as it was, and so is the plan when a result is changed
    expect(own[0]).toEqual({ skill: 1, level: 1 });
    result[0]!.level = 99;
    expect(p.result()[0]!.level).toBe(3);
  });

  it('Reset loads the player\'s levels and points again (and does nothing when nothing changed)', () => {
    const p = plan(slots(1), 4, 5);
    p.plus(0);
    p.plus(0);
    p.plus(1);
    expect(p.changed).toBe(true);
    p.reset();
    expect(levelsAt(p)).toEqual([1, 0, 0]);
    expect(p.points).toBe(4);
    expect(p.changed).toBe(false);
    p.reset();
    expect(levelsAt(p)).toEqual([1, 0, 0]);
    expect(p.points).toBe(4);
  });

  it('`changed` is the points differing from the player\'s, so a spend that is taken back is not a change', () => {
    const p = plan(slots(), 4, 5);
    p.plus(0);
    expect(p.changed).toBe(true);
    p.minus(0);
    expect(p.changed).toBe(false);
    expect(p.points).toBe(4);
  });

  it('charges a skill by its job: 1 for a Vagrant skill, 2 for an expert one, 3 for the rest (CProject::GetSkillPoint)', () => {
    // Clean Hit (job type 0), Slash (1, an expert's), Guard (2, a pro's), Special One-handed Mastery (5, a master's) and
    // Ultimate Defense (6, a hero's)
    const own = slots();
    own[3] = { skill: 4, level: 0 };
    own[4] = { skill: 128, level: 0 };
    own[5] = { skill: 309, level: 0 };
    own[6] = { skill: 237, level: 0 };
    const catalog = new Map([CLEAN_HIT, SLASH, GUARD, SPECIAL_MASTERY, ULTIMATE_DEFENSE].map((skill) => [skill.id, skill]));
    const p = new SkillPlan(own, 30, catalog, 120);
    p.plus(0);
    expect(p.points).toBe(29);
    p.plus(3);
    expect(p.points).toBe(27);
    p.plus(4);
    expect(p.points).toBe(24);
    p.plus(5);
    expect(p.points).toBe(21);
    p.plus(6);
    expect(p.points).toBe(18);
    p.minus(3);
    expect(p.points).toBe(20);
  });
});

describe('canPlaceOnBar (CWndTaskBar::OnDropIcon, WndTaskBar.cpp:1962-1976, 2026-2041)', () => {
  it('only Clean Hit passes; Flurry and Over Cut can be used only through the action slot', () => {
    expect(canPlaceOnBar(CLEAN_HIT, 1)).toBe(true);
    expect(canPlaceOnBar(FLURRY, 1)).toBe(false);
    expect(canPlaceOnBar(OVER_CUT, 1)).toBe(false);
  });

  it('needs a level above 0', () => {
    expect(canPlaceOnBar(CLEAN_HIT, 0)).toBe(false);
    expect(canPlaceOnBar(CLEAN_HIT, 10)).toBe(true);
  });

  it('passes a CT_GENERAL skill too', () => {
    expect(canPlaceOnBar(QUICK_STEP, 1)).toBe(true);
  });
});

describe('canPlaceInQueue (CWndTaskBar::SetSkillQueue and CheckAddSkill, WndTaskBar.cpp:1668-1872)', () => {
  it('Clean Hit goes first; Flurry and Over Cut cannot', () => {
    expect(canPlaceInQueue([], 0, CLEAN_HIT, 1)).toBe(true);
    expect(canPlaceInQueue([], 0, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([], 0, OVER_CUT, 1)).toBe(false);
  });

  it('Flurry follows Clean Hit and can repeat; Clean Hit goes nowhere but first', () => {
    expect(canPlaceInQueue([CLEAN_HIT], 1, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 2, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY], 3, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT], 1, CLEAN_HIT, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 2, CLEAN_HIT, 1)).toBe(false);
  });

  it('Over Cut goes last, after Clean Hit or Flurry', () => {
    expect(canPlaceInQueue([CLEAN_HIT], 1, OVER_CUT, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY], 3, OVER_CUT, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY, FLURRY], 4, OVER_CUT, 1)).toBe(true);
  });

  it('nothing goes after Over Cut', () => {
    const full = [CLEAN_HIT, FLURRY, OVER_CUT];
    expect(canPlaceInQueue(full, 3, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue(full, 3, OVER_CUT, 1)).toBe(false);
    expect(canPlaceInQueue(full, 3, CLEAN_HIT, 1)).toBe(false);
    expect(canPlaceInQueue(full, 3, QUICK_STEP, 1)).toBe(false);
    // the last slot, with the fourth holding the finisher
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY, OVER_CUT], 4, FLURRY, 1)).toBe(false);
  });

  it('Flurry cannot be first, even before a Clean Hit that is there', () => {
    expect(canPlaceInQueue([], 0, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT], 0, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 0, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT], 0, CLEAN_HIT, 1)).toBe(false);
  });

  it('a drop past the end lands at the end (SetSkillQueue: nIndex above the count is the count)', () => {
    expect(canPlaceInQueue([CLEAN_HIT], 4, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([], 3, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([], 3, CLEAN_HIT, 1)).toBe(true);
  });

  it('an insert in the middle follows the same rules: Flurry between Clean Hit and Over Cut is fine, Over Cut before a Flurry or another Over Cut is not', () => {
    expect(canPlaceInQueue([CLEAN_HIT, OVER_CUT], 1, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 1, OVER_CUT, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT, OVER_CUT], 1, OVER_CUT, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 1, FLURRY, 1)).toBe(true);
  });

  it('the queue holds five, and a skill of level 0 does not go in', () => {
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY, FLURRY, FLURRY], 5, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([CLEAN_HIT, FLURRY, FLURRY, FLURRY, FLURRY], 1, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([], 0, CLEAN_HIT, 0)).toBe(false);
    expect(canPlaceInQueue([], 0, CLEAN_HIT, 1)).toBe(true);
  });

  it('a skill with a cool-down at its level does not go in (SetSkillQueue: (int) dwCooldown > 0), and one with none does', () => {
    // Blinkpool is CT_GENERAL like Quick Step (Event), which goes first; its 3000 ms cool-down is the only difference
    expect(canPlaceInQueue([], 0, QUICK_STEP, 1)).toBe(true);
    expect(canPlaceInQueue([], 0, BLINKPOOL, 1)).toBe(false);
    expect(canPlaceInQueue([], 0, BLINKPOOL, 20)).toBe(false);
    // Ultimate Defense has a cool-down at each of its levels, getting shorter
    for (let level = 1; level <= 5; level++) expect(canPlaceInQueue([], 0, ULTIMATE_DEFENSE, level)).toBe(false);
  });

  it('reads the cool-down of the level the player has', () => {
    // a variant of Clean Hit (see CLEAN_HIT_COOLING_AT_2): only its level 2 has a cool-down
    expect(canPlaceInQueue([], 0, CLEAN_HIT_COOLING_AT_2, 1)).toBe(true);
    expect(canPlaceInQueue([], 0, CLEAN_HIT_COOLING_AT_2, 2)).toBe(false);
    expect(canPlaceInQueue([], 0, CLEAN_HIT_COOLING_AT_2, 3)).toBe(true);
  });

  it('a cool-down of 0 is no cool-down, and a level the catalog has no row for reads as none', () => {
    // Geburah Tiphreth (CT_GENERAL) has a cool-down of 0 at every level
    expect(canPlaceInQueue([], 0, GEBURAH, 1)).toBe(true);
    expect(canPlaceInQueue([], 0, GEBURAH, 10)).toBe(true);
    expect(canPlaceInQueue([], 0, CLEAN_HIT, 11)).toBe(true);
  });

  it('refuses a slot that is not a slot', () => {
    expect(canPlaceInQueue([], -1, CLEAN_HIT, 1)).toBe(false);
    expect(canPlaceInQueue([], 0.5, CLEAN_HIT, 1)).toBe(false);
  });

  it('counts the skills from the start up to the first empty slot', () => {
    expect(canPlaceInQueue([CLEAN_HIT, null, null], 1, FLURRY, 1)).toBe(true);
    expect(canPlaceInQueue([null, null], 0, FLURRY, 1)).toBe(false);
    expect(canPlaceInQueue([null, null], 0, CLEAN_HIT, 1)).toBe(true);
  });

  describe('a CT_GENERAL skill', () => {
    it('goes first, or after another CT_GENERAL, and nothing else goes after it', () => {
      expect(canPlaceInQueue([], 0, QUICK_STEP, 1)).toBe(true);
      expect(canPlaceInQueue([QUICK_STEP], 1, QUICK_STEP, 1)).toBe(true);
      expect(canPlaceInQueue([QUICK_STEP, QUICK_STEP], 2, QUICK_STEP, 1)).toBe(true);
      expect(canPlaceInQueue([QUICK_STEP], 1, FLURRY, 1)).toBe(false);
      expect(canPlaceInQueue([QUICK_STEP], 1, OVER_CUT, 1)).toBe(false);
      expect(canPlaceInQueue([QUICK_STEP], 1, CLEAN_HIT, 1)).toBe(false);
    });

    it('cannot follow a step, circle or finish skill', () => {
      expect(canPlaceInQueue([CLEAN_HIT], 1, QUICK_STEP, 1)).toBe(false);
      expect(canPlaceInQueue([CLEAN_HIT, FLURRY], 2, QUICK_STEP, 1)).toBe(false);
      expect(canPlaceInQueue([QUICK_STEP, QUICK_STEP, QUICK_STEP, QUICK_STEP], 4, FLURRY, 1)).toBe(false);
    });

    it('goes in front of a CT_GENERAL skill only, and in the last slot after a CT_GENERAL one', () => {
      expect(canPlaceInQueue([QUICK_STEP], 0, QUICK_STEP, 1)).toBe(true);
      expect(canPlaceInQueue([CLEAN_HIT], 0, QUICK_STEP, 1)).toBe(false);
      expect(canPlaceInQueue([QUICK_STEP, QUICK_STEP, QUICK_STEP, QUICK_STEP], 4, QUICK_STEP, 1)).toBe(true);
      // an insert into the middle needs the slot it takes to be a CT_GENERAL one, unless it is at the end
      expect(canPlaceInQueue([QUICK_STEP, FLURRY], 1, QUICK_STEP, 1)).toBe(false);
      expect(canPlaceInQueue([QUICK_STEP, QUICK_STEP], 1, QUICK_STEP, 1)).toBe(true);
    });
  });
});

describe('checkAddSkill (CWndTaskBar::CheckAddSkill, WndTaskBar.cpp:1668-1786)', () => {
  it('asks whether a combo style may go into a slot of the queue as it stands', () => {
    expect(checkAddSkill([], ComboStyle.STEP, 0)).toBe(true);
    expect(checkAddSkill([], ComboStyle.CIRCLE, 0)).toBe(false);
    expect(checkAddSkill([CLEAN_HIT], ComboStyle.CIRCLE, 1)).toBe(true);
    expect(checkAddSkill([CLEAN_HIT], ComboStyle.STEP, 1)).toBe(false);
    expect(checkAddSkill([CLEAN_HIT, OVER_CUT], ComboStyle.CIRCLE, 2)).toBe(false);
  });

  it('is what RemoveSkillQueue asks of the skill it just took out, at the slot it left (the queue shifted left)', () => {
    // Clean Hit taken out of [Clean Hit, Flurry, Over Cut]: nothing that is left may start the queue
    expect(checkAddSkill([FLURRY, OVER_CUT], ComboStyle.STEP, 0)).toBe(false);
    expect(checkAddSkill([OVER_CUT], ComboStyle.CIRCLE, 0)).toBe(false);
    expect(checkAddSkill([], ComboStyle.FINISH, 0)).toBe(false);
    // Over Cut taken out of the end: Clean Hit and Flurry stay
    expect(checkAddSkill([CLEAN_HIT, FLURRY], ComboStyle.FINISH, 2)).toBe(true);
    // Flurry taken out of the middle: the Over Cut after Clean Hit stays
    expect(checkAddSkill([CLEAN_HIT, OVER_CUT], ComboStyle.CIRCLE, 1)).toBe(true);
  });
});
