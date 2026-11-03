// The skills catalog of the `data` stage (data/skills.json, WebSkill[]): every job skill of propSkill.txt with its levels of
// propSkillAdd.csv, built the way the C++ loads them. It is in a module of its own because gameDataStage.ts is long.
//
//   CProject::LoadSkill          Project.cpp:375-400   reads propSkill.txt with the item loader, and puts every row that is
//                                                      not JTYPE_COMMON on the list of its job (m_aJobSkill)
//   CProject::LoadPropAddSkill   Project.cpp:2522-2611 reads the levels of the skills (readPropSkillAdd)
//   CProject::GetAddSkillProp    Project.cpp:879-896   the row of a skill's level: `dwSubDefine + level - 1`
//
// LoadSkill also sorts each job's list by the level the skills need (SortJobSkill, :364-373): the order CMover::InitProp fills the
// skill slots of a player who has a job in (Mover.cpp:1487-1498). The client reads the slots it is sent and never needs that
// order, so the catalog lists the skills by id like the other catalogs.

import { readPropItem, readPropSkillAdd } from '@flyffweb/formats';
import type { ItemProp, SkillAddProp, WebSkill } from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import { iconKeyOf } from '../output/keys';
import { listed, plural } from '../util';

/** DIR_ICON (path.h:31): the folder of the skill pictures, where the task bar and the skill window load them from. */
const ICON_DIR = 'Icon';
/** NULL_ID, written `=`: a skill with no prerequisite, a level that costs nothing. */
const NULL_ID = -1;
/** Piece 7 M2: a level with no row has no times and changes nothing. */
const NO_TIMES = {
  castingTime: NULL_ID, skillTime: NULL_ID, painTime: NULL_ID,
  destParams: [NULL_ID, NULL_ID], adjParams: [NULL_ID, NULL_ID], chgParams: [NULL_ID, NULL_ID],
};

/** What the catalog takes from the stage. */
export interface SkillsEnv {
  client: ClientFs;
  defines: ReadonlyMap<string, number>;
  strings: ReadonlyMap<string, string>;
  /** Adds a warning to the report, under the file it is about. */
  warn(source: string, message: string): void;
}

/** What the catalog reads: the two files by name, as the stage's `Reading` gives them (it counts the bytes). */
export interface SkillsReading {
  text(name: string): string;
}

/**
 * `CProject::GetAddSkillProp( dwSubDefine, dwLevel )` (Project.cpp:879-896): a level below 1 reads as 1, and an index below 5
 * is bumped by 5. The C++ logs an index past the table and gives no row; so does this.
 */
function addSkillRow(rows: ReadonlyMap<number, SkillAddProp>, subDefine: number, level: number): SkillAddProp | undefined {
  let index = subDefine + Math.max(level, 1) - 1;
  if (index < 5) index += 5;
  return rows.get(index);
}

/**
 * Every skill of propSkill.txt that is not JTYPE_COMMON (LoadSkill, Project.cpp:385-390), by id. A repeated id keeps the
 * last row (CFixedArray::SetAtGrow, as readItemRows does for propItem.txt). `icon` is the key of the picture in Client/Icon
 * that the UI stage writes, or null when the table names none or the file is not there (one warning names those skills).
 */
export function buildSkills(env: SkillsEnv, read: SkillsReading): WebSkill[] {
  const jobTypeCommon = env.defines.get('JTYPE_COMMON');
  if (jobTypeCommon === undefined) {
    throw new Error('defineJob.h has no JTYPE_COMMON, which tells the common skills from the job skills');
  }

  const props = new Map<number, ItemProp>();
  for (const prop of readPropItem(read.text('propSkill.txt'), env.defines, env.strings, 'propSkill.txt')) {
    props.set(prop.id, prop);
  }
  const rows = new Map<number, SkillAddProp>();
  for (const row of readPropSkillAdd(read.text('propSkillAdd.csv'), env.defines, props, 'propSkillAdd.csv')) {
    rows.set(row.id, row);
  }

  const noIcon: string[] = []; // skills whose picture is not in Client/Icon
  const noRow: string[] = []; // skills with a level that has no row in propSkillAdd.csv
  const otherRow: string[] = []; // skills with a level whose row is another level's or another skill's

  const skills = [...props.values()]
    .filter((prop) => prop.kind1 !== jobTypeCommon)
    .sort((a, b) => a.id - b.id)
    .map((prop): WebSkill => {
      const who = `${prop.id} "${prop.name}"`;

      let icon: string | null = null;
      if (prop.icon !== '') {
        if (env.client.find(ICON_DIR, prop.icon) === null) noIcon.push(`${who} (${prop.icon})`);
        else icon = iconKeyOf(prop.icon);
      }

      const levels: WebSkill['levels'] = [];
      for (let level = 1; level <= prop.expertMax; level++) {
        const row = addSkillRow(rows, prop.subDefine, level);
        if (row === undefined) {
          noRow.push(`${who} level ${level}`);
          levels.push({ reqMp: NULL_ID, reqFp: NULL_ID, cooldown: NULL_ID, skillCount: NULL_ID, ...NO_TIMES });
          continue;
        }
        // the C++ takes the row by its place and does not look at what it says; a row for another level is a table mistake
        if (row.skill !== prop.id || row.level !== level) {
          otherRow.push(`${who} level ${level} (row ${row.id} is level ${row.level} of skill ${row.skill})`);
        }
        levels.push({
          reqMp: row.reqMp, reqFp: row.reqFp, cooldown: row.cooldown, skillCount: row.skillCount,
          castingTime: row.castingTime, skillTime: row.skillTime, painTime: row.painTime,
          destParams: [...row.destParams], adjParams: [...row.adjParams], chgParams: [...row.chgParams],
        });
      }

      return {
        id: prop.id,
        name: prop.name,
        description: prop.command,
        jobType: prop.kind1,
        job: prop.kind2,
        handed: prop.handed,
        attackRange: prop.attackRange,
        reqLevel: prop.reqLevel,
        // CMover::CheckSkill (MoverParam.cpp:117-156) tests each of the two against 0xffffffff, `=`
        reqSkills: [0, 1]
          .filter((i) => prop.reSkills[i] !== NULL_ID)
          .map((i) => ({ skill: prop.reSkills[i]!, level: prop.reSkillLevels[i]! })),
        useMotion: prop.useMotion,
        sfxHit: prop.sfxObj3,
        exeTarget: prop.exeTarget,
        useChance: prop.useChance,
        skillType: prop.skillType,
        evildoing: prop.evildoing,
        maxLevel: prop.expertMax,
        comboStyle: prop.comboStyle,
        icon,
        levels,
        // Piece 7 M2: the effects, the weapon and bullets, the style, the push, the pain and the row's own parameters
        sfxCast: prop.sfxObj,
        sfxMissile: prop.sfxObj2,
        sfxLasting: prop.sfxObj4,
        sfxCaster: prop.sfxObj5,
        linkKind: prop.linkKind,
        linkKindBullet: prop.linkKindBullet,
        atkStyle: prop.atkStyle,
        dmgShift: prop.dmgShift,
        // `if( pSkillProp->tmContinuousPain != NULL_ID )` (Ctrl.cpp:1398)
        continuousPain: prop.continuousPain !== NULL_ID,
        destParams: prop.destParams.slice(0, 2),
        adjParams: prop.adjParams.slice(0, 2),
      };
    });

  if (noIcon.length > 0) {
    env.warn(
      'propSkill.txt',
      `${plural(noIcon.length, 'skill')} named a picture Client/${ICON_DIR} lacks, left without an icon: ${listed(noIcon)}`,
    );
  }
  if (noRow.length > 0) {
    env.warn(
      'propSkillAdd.csv',
      `${plural(noRow.length, 'skill level')} ha${noRow.length === 1 ? 's' : 've'} no row in propSkillAdd.csv, ` +
        `left costing nothing: ${listed(noRow)}`,
    );
  }
  if (otherRow.length > 0) {
    env.warn(
      'propSkillAdd.csv',
      `${plural(otherRow.length, 'skill level')} read${otherRow.length === 1 ? 's' : ''} the row of another level or skill ` +
        `(dwSubDefine + level - 1, as GetAddSkillProp does): ${listed(otherRow)}`,
    );
  }
  return skills;
}
