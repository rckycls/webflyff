import type { WebSkill } from '@flyffweb/formats';
import { ComboStyle } from '../../src/world/skills/skillRules';

// The Vagrant's three skills as rows of the converted skills catalog (`data/skills.json`), with the values that file holds
// (the same rows as `skillRules.test.ts`'); `description` and `icon`, which no rule reads, are left blank.

const same = (value: number, n: number): number[] => Array<number>(n).fill(value);
const levelsOf = (reqMp: number[], reqFp: number[], cooldown: number[]): WebSkill['levels'] =>
  reqFp.map((fp, i) => ({ reqMp: reqMp[i]!, reqFp: fp, cooldown: cooldown[i]!, skillCount: -1 }));
const row = (skill: Omit<WebSkill, 'description' | 'icon'>): WebSkill => ({ ...skill, description: '', icon: null });

/** `SI_VAG_ONE_CLEANHIT`: `MTI_VAG_ONE_CLEANHIT`, `XI_SKILL_VAG_ONE_CLEANHIT01`, `EXT_MELEEATK`, `AR_SHORT`, `CT_STEP`. */
export const CLEAN_HIT = row({
  id: 1, name: 'Clean Hit', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 3, reqSkills: [], useMotion: 1000,
  sfxHit: 201, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10, comboStyle: ComboStyle.STEP,
  levels: levelsOf(same(-1, 10), [5, 5, 5, 5, 8, 8, 8, 8, 10, 10], same(-1, 10)),
});

/** `SI_VAG_ONE_BRANDISH`: `MTI_VAG_ONE_BRANDISH` (three hit frames), `XI_SKILL_VAG_ONE_BRANDISH01`, `CT_CIRCLE`. */
export const FLURRY = row({
  id: 2, name: 'Flurry', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 5, reqSkills: [{ skill: 1, level: 3 }],
  useMotion: 1001, sfxHit: 202, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10,
  comboStyle: ComboStyle.CIRCLE, levels: levelsOf(same(-1, 10), [10, 10, 10, 12, 12, 12, 15, 15, 15, 15], same(-1, 10)),
});

/** `SI_VAG_ONE_OVERCUTTER`: `MTI_VAG_ONE_OVERCUTTER`, `XI_SKILL_VAG_ONE_OVERCUTTER01`, `CT_FINISH`. */
export const OVER_CUT = row({
  id: 3, name: 'Over Cut', jobType: 0, job: 0, handed: 1, attackRange: 1, reqLevel: 10, reqSkills: [{ skill: 2, level: 3 }],
  useMotion: 1002, sfxHit: 203, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1, maxLevel: 10,
  comboStyle: ComboStyle.FINISH, levels: levelsOf(same(-1, 10), [15, 15, 15, 18, 18, 18, 20, 20, 22, 22], same(-1, 10)),
});

/** The three, by skill ID, as `GameData.skills` holds them (a new map each time). */
export const vagrantSkills = (): Map<number, WebSkill> => new Map([CLEAN_HIT, FLURRY, OVER_CUT].map((s) => [s.id, s]));
