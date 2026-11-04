// The game-data stage on a small hand-made client: every input the stage reads is a few lines in the test's own
// packs. The real client (MI_MALE and its stand motion, the item with a two-sex part, the counts of every table) is
// a corpus test: gameData.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_DATA_KEYS, QUESTS_KEY, WORLD_NO_FLY_KEY } from '@flyffweb/formats';
import type {
  ModelElem,
  WebEffectsIndex,
  WebExpRow,
  WebHonorTitles,
  WebItemModel,
  WebItemProp,
  WebJob,
  WebMover,
  WebNameColors,
  WebNpc,
  WebSkill,
  WebTexts,
  WebWorlds,
} from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { gameDataStage, makeMotionName, makePartsName } from '../src/data/gameDataStage';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { DEFAULT_STAGES } from '../src/run';
import type { StageContext } from '../src/run';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';
import { bytesOf } from './helpers/worldRun';
import type { ReportJson, Run } from './helpers/worldRun';

const text = (s: string): number[] => Array.from(Buffer.from(s, 'latin1'));

/** Script text with the CRLF line ends the shipped files use. */
const script = (...lines: string[]): string => lines.join('\r\n') + '\r\n';

/** A property table row: the shipped files separate the columns with tabs, the tests write spaces. */
const tabs = (columns: string): string => columns.split(' ').join('\t');

// ---- the inputs --------------------------------------------------------------------------------------------------

const DEFINES = script(
  '#define MI_MALE 11',
  '#define MI_FEMALE 12',
  '#define MI_AIBATT1 20',
  '#define MI_ORPHAN 21',
  '#define AII_MOVER 1',
  '#define AII_MONSTER 2',
  '#define BELLI_PEACEFUL 1',
  '#define II_WEA_HAN_HAND 11',
  '#define VT_ITEM 1',
  '#define SND_ITEM_ANIMAL 32',
  '#define SND_PC_DMGWANB 124',
  '#define MODELTYPE_MESH 1',
  '#define MODELTYPE_ANIMATED_MESH 2',
  '#define MD_MID 2',
  '#define ATEX_NONE 0',
  '#define MTI_STAND 0',
  '#define MTI_WALK 3',
  '#define MTI_RUN 5',
  '#define II_ARM_M_VAG_SUIT01 502',
  '#define IK1_ARMOR 2',
  '#define IK2_ARMOR 7',
  '#define IK3_SUIT 18',
  '#define JOB_VAGRANT 0',
  '#define TRUE 1',
  '#define SEX_MALE 0',
  '#define PARTS_HAIR 1',
  '#define PARTS_UPPER_BODY 2',
  '#define PARTS_LOWER_BODY 3',
  '#define _NONE 0',
  '#define HI_ELASPED_TIME 1',
  '#define HI_HUNT_MONSTER 4',
  '#define HI_USE_ITEM 5',
  '#define HS_COLLECT 51',
  '#define MONSTER_TITLE_MAX 70',
  '#define MMI_DIALOG 0',
  '#define WI_WORLD_TEST 0',
  // defineText.h: the number Neuz asks for the text by (TID_GAME_LEVELUP is left without one)
  '#define TID_GAME_DEATH 602',
  '#define WI_WORLD_MADRIGAL 1',
  '#define WI_WORLD_GUILDHOUSE 5',
  '#define WI_DUNGEON_SECRET_0 40',
  '#define WI_DUNGEON_SECRET_1 41',
  '#define WI_DUNGEON_SECRET_2 42',
  '#define JOB_MERCENARY 1',
  '#define JTYPE_BASE 0',
  '#define JTYPE_EXPERT 1',
  '#define MODELTYPE_SFX 4',
  '#define XI_HIT_SWORD01 20',
  '#define XI_HIT_YOY01 31',
  '#define XI_GEN_LEVEL_UP01 42',
  '#define XI_GEN_FLASH01 60',
  // propSkill.txt and propSkillAdd.csv: the words of the rows and the `SA_*` ids of their levels
  '#define JTYPE_COMMON 4',
  '#define SI_VAG_ONE_CLEANHIT 1',
  '#define SI_VAG_ONE_BRANDISH 2',
  '#define SI_MER_ONE_SPLMASH 3',
  '#define SI_GEN_FLASH 50',
  '#define SA_CLEANHIT_L01 5',
  '#define SA_CLEANHIT_L02 6',
  '#define SA_BRANDISH_L01 15',
  '#define SA_BRANDISH_L02 16',
  '#define SA_SPLMASH_L01 25',
  '#define SA_SPLMASH_L02 26',
  '#define DIS_VAGRANT 0',
  '#define HD_ONE 1',
  '#define WT_EQUIP 13',
  '#define AS_DIAGONAL 2',
  '#define AR_SHORT 1',
  '#define XI_SKILL_VAG_ONE_CLEANHIT01 201',
  '#define XI_SKILL_VAG_ONE_BRANDISH01 202',
  '#define MTI_VAG_ONE_CLEANHIT 1000',
  '#define MTI_VAG_ONE_BRANDISH 1001',
  '#define EXT_MELEEATK 17',
  '#define WUI_TARGETINGOBJ 4',
  '#define SRO_DIRECT 1',
  '#define DST_STR 1',
  '#define RT_ATTACK 1',
  '#define KT_SKILL 2',
  '#define CT_STEP 1',
  '#define CT_CIRCLE 2',
  '#define SND_PC_DMGSWD 115',
);

/** The columns of a shipped propMover.txt row (MI_MALE), which the tests re-use: id, name, AI and speed change. */
const MOVER_CELLS = tabs(
  'MI_MALE IDS_PROPMOVER_TXT_000002 AII_MOVER 10 10 10 10 10 10 = BELLI_PEACEFUL = = 65 = = 1 = = = = = = = = = = = = = = = = = = = = 0 130 0 = 0 0 = 0.1 = 0 = = = 0 0 0 0 0 0 = = = = = = 0 0 = = 0 II_WEA_HAN_HAND VT_ITEM = = = = = = = = SND_ITEM_ANIMAL SND_PC_DMGWANB = = = IDS_PROPMOVER_TXT_000003',
).split('\t');
/** Where the fight columns are in a row (MOVER_CELLS has `=` or 0 in them: the player movers fight with nothing). */
const FIGHT_CELLS = {
  belligerence: 10, level: 12, rank: 15, atk1: 22, addHp: 35, element: 41, hideLevel: 43, expValue: 62, killable: 66,
} as const;
const moverRow = (
  id: string, name: string, ai: string, speed: string, flying = '0',
  fight: Partial<Record<keyof typeof FIGHT_CELLS, string>> = {},
): string => {
  const cells = [...MOVER_CELLS];
  cells[0] = id;
  cells[1] = name;
  cells[2] = ai;
  cells[44] = speed;
  cells[46] = flying; // dwFlying
  for (const [column, text] of Object.entries(fight)) cells[FIGHT_CELLS[column as keyof typeof FIGHT_CELLS]] = text;
  return cells.join('\t');
};

/** What MOVER_CELLS gives the fight fields of WebMover: BELLI_PEACEFUL, and `=` (-1) or 0 elsewhere. */
const NO_FIGHT = { level: -1, addHp: -1, expValue: 0, rank: -1, belligerence: 1, killable: 0, hideLevel: -1, element: 0, atk1: -1 };
/** The fight columns of the Orphan's row: a level past the player's, EXP past 32 bits (nExpValue is 64 bits in the C++). */
const ORPHAN_FIGHT = {
  level: 85, addHp: 9000, expValue: 5000000000, rank: 3, belligerence: 4, killable: 2, hideLevel: 1, element: 2, atk1: 9001,
};

/** The columns of a shipped propItem.txt row (II_ARM_M_VAG_SUIT01): id, name, body slot and the parts it hides change. */
const ITEM_CELLS = tabs(
  '6 II_ARM_M_VAG_SUIT01 IDS_PROPITEM_TXT_000790 1 1 IK1_ARMOR IK2_ARMOR IK3_SUIT JOB_VAGRANT TRUE = SEX_MALE 12 9000000 100 180 = = PARTS_UPPER_BODY = 1 PARTS_LOWER_BODY = 1 2 1 1 = = = 8 10 _NONE 0 0 0 = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 0 0 0 0 0 0 = = = = = = = = = = = = 1 = = = """itm_mVag01Upper.dds""" 0 """""" IDS_PROPITEM_TXT_000791',
).split('\t');
const itemRow = (id: string, name: string, parts: string, exclusive = 'PARTS_LOWER_BODY', baseIgnore = '='): string => {
  const cells = [...ITEM_CELLS];
  cells[1] = id;
  cells[2] = name;
  cells[18] = parts;
  cells[21] = exclusive; // dwExclusive
  cells[22] = baseIgnore; // dwBasePartsIgnore
  return cells.join('\t');
};

/** A one-handed sword: the columns the combat code reads, in the places propItem.txt keeps them. */
const WEAPON_CELLS = {
  kind1: 5, kind2: 6, kind3: 7, handed: 16, parts: 18, abilityMin: 30, abilityMax: 31, weaponType: 39, attackSpeed: 49,
  attackRange: 51, destParam0: 53, adjParam0: 56, adjParam1: 57, sfxObj3: 81, sfxObj5: 83, sndAttack1: 118, icon: 120,
} as const;
const weaponRow = (id: string, name: string): string => {
  const cells = [...ITEM_CELLS];
  const set = (column: keyof typeof WEAPON_CELLS, text: string): void => {
    cells[WEAPON_CELLS[column]] = text;
  };
  cells[1] = id;
  cells[2] = name;
  set('kind1', '1');
  set('kind2', '2');
  set('kind3', '2');
  set('handed', '1');
  set('parts', '10');
  set('abilityMin', '3');
  set('abilityMax', '4');
  set('weaponType', '1');
  set('attackSpeed', '0.085');
  set('attackRange', '1');
  set('destParam0', '14');
  set('adjParam0', '5');
  set('adjParam1', '-3');
  set('sfxObj3', 'XI_HIT_SWORD01');
  set('sfxObj5', '=');
  set('sndAttack1', '115');
  set('icon', '"""itm_WeaSword.dds"""');
  return cells.join('	');
};

/**
 * The columns of a shipped propSkill.txt row (Clean Hit), which has the columns of propItem.txt: the job, the level it
 * needs, the skills it needs first, its cool-down, effect, motion, maximum level, first level row, combo style and icon change.
 */
const SKILL_CELLS = tabs(
  '6 SI_VAG_ONE_CLEANHIT IDS_PROPSKILL_TXT_000000 1 1 JTYPE_BASE JOB_VAGRANT DIS_VAGRANT JOB_VAGRANT = = = = = = = HD_ONE = = = = = = = = = = = = = 0 0 _NONE 0 0 0 = = AS_DIAGONAL WT_EQUIP = = = = = = = = = = = AR_SHORT = = = = = = = = = = = = = = = = = 0 3 = = = = = = = = = = XI_SKILL_VAG_ONE_CLEANHIT01 = = MTI_VAG_ONE_CLEANHIT = = EXT_MELEEATK WUI_TARGETINGOBJ SRO_DIRECT = DST_STR = RT_ATTACK = 5 = KT_SKILL 0 0 0 0 0 = 1 10 5 1 CT_STEP = = = = = = = = = SND_PC_DMGSWD = """skill_VagOneCleanh.dds""" 0 """""" IDS_PROPSKILL_TXT_000001',
).split('\t');
const SKILL_CELL = {
  kind1: 5, kind2: 6, reqLevel: 70, reSkill1: 71, reSkillLevel1: 72, skillReady: 76, sfxObj3: 81, useMotion: 84,
  expertMax: 105, subDefine: 106, comboStyle: 108, icon: 120, comment: 123,
  // Piece 7 M2: the effects, the bullets, the attack style, the pain and the push, and the row's own parameters
  linkKindBullet: 28, linkKind: 29, atkStyle: 38, continuousPain: 44, dmgShift: 50, destParam0: 53, adjParam0: 56,
  sfxObj: 79, sfxObj2: 80, sfxObj4: 82, sfxObj5: 83,
} as const;
/** What a propSkillAdd.csv row that gives no times or parameters gives a level (Piece 7 M2). */
const NO_TIMES = {
  castingTime: -1, skillTime: -1, painTime: -1, destParams: [-1, -1], adjParams: [-1, -1], chgParams: [-1, -1],
} as const;
/** What a propSkill.txt row that names no effect, bullet or push gives a skill (Piece 7 M2); Clean Hit's style is AS_DIAGONAL. */
const NO_SHOT = {
  sfxCast: -1, sfxMissile: -1, sfxLasting: -1, sfxCaster: -1, linkKind: -1, linkKindBullet: -1, atkStyle: 2, dmgShift: -1,
  continuousPain: false, destParams: [-1, -1], adjParams: [-1, -1],
} as const;
const skillRow = (
  id: string, name: string, comment: string, cells: Partial<Record<keyof typeof SKILL_CELL, string>> = {},
): string => {
  const row = [...SKILL_CELLS];
  row[1] = id;
  row[2] = name;
  row[SKILL_CELL.comment] = comment;
  for (const [column, text] of Object.entries(cells)) row[SKILL_CELL[column as keyof typeof SKILL_CELL]] = text;
  return row.join('\t');
};
/** A row of propSkillAdd.csv: 36 comma-separated columns, `=` for the ones the Vagrant's skills leave empty. */
const addRow = (
  id: string, skill: string, level: number,
  cost: {
    mp?: string; fp?: string; cooldown?: string; count?: string;
    casting?: string; pain?: string; time?: string; dst?: string; adj?: string; chg?: string;
  } = {},
): string => {
  const cells = Array<string>(36).fill('=');
  cells[0] = id;
  cells[1] = skill;
  cells[2] = String(level);
  cells[3] = '10'; // dwAbilityMin
  cells[4] = '11'; // dwAbilityMax
  cells[7] = '150'; // dwAttackSpeed
  cells[24] = cost.mp ?? '='; // nReqMp
  cells[25] = cost.fp ?? '='; // nReqFp
  cells[26] = cost.cooldown ?? '='; // dwCooldown
  cells[12] = cost.dst ?? '='; // dwDestParam1
  cells[14] = cost.adj ?? '='; // nAdjParamVal1
  cells[16] = cost.chg ?? '='; // dwChgParamVal1
  cells[27] = cost.casting ?? '='; // dwCastingTime
  cells[28] = '2000'; // dwSkillRange, read and dropped
  cells[30] = cost.pain ?? '='; // dwPainTime
  cells[31] = cost.time ?? '='; // dwSkillTime
  cells[32] = cost.count ?? '='; // nSkillCount
  cells[33] = '4'; // dwSkillExp, dwExp and dwComboSkillTime
  cells[34] = '0';
  cells[35] = '600';
  return cells.join(',');
};

const entry = (name: string, id: string, modelType: string, part = '""'): string =>
  `  "${name}" ${id} ${modelType} ${part} 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1`;

/** An OT_SFX entry; `name` is the file's name as the index writes it (the stage adds `sfx_` when it has no underscore). */
const sfxEntry = (name: string, id: string, scale: string, modelType = 'MODELTYPE_SFX'): string =>
  `  "${name}" ${id} ${modelType} "" 0 MD_MID 0 ${scale} 0 1 ATEX_NONE 1`;

const MDL_DYNA = script(
  '"sfx" 3',
  '{',
  sfxEntry('sfx_GenLevelUp01', 'XI_GEN_LEVEL_UP01', '1.0f'),
  sfxEntry('HitSword01', 'XI_HIT_SWORD01', '0.1f'),
  sfxEntry('HitYoy01', 'XI_HIT_YOY01', '2.0f'),
  sfxEntry('Flash01.tga', 'XI_GEN_FLASH01', '1.0f', '3'), // a billboard: a texture, not a .sfx
  '}',
  '"item" 4',
  '{',
  '  "GenMatSuitbox"',
  '  {',
  entry('GenMatSuitbox', 'II_ARM_M_VAG_SUIT01', 'MODELTYPE_MESH', '"mvag01upper/fvag01upper"'),
  entry('GenMatSuitbox', '503', 'MODELTYPE_MESH', 'mVag02Upper'),
  entry('GenMatSuitbox', '504', 'MODELTYPE_MESH', 'mVag03Upper'),
  '  }',
  entry('WeaSword', '505', 'MODELTYPE_MESH'),
  '}',
  '"mvr" 5',
  '{',
  entry('male', 'MI_MALE', 'MODELTYPE_ANIMATED_MESH'),
  '  {',
  '    "GenStand" MTI_STAND',
  '    "GenWalk"  MTI_WALK',
  '  }',
  entry('female', 'MI_FEMALE', 'MODELTYPE_ANIMATED_MESH'),
  '  {',
  '    "GenStand" MTI_STAND',
  '  }',
  entry('Aibatt1', 'MI_AIBATT1', 'MODELTYPE_ANIMATED_MESH'),
  '  {',
  '    "Stand" MTI_STAND',
  '    "Walk" MTI_WALK',
  '    "Aibatt1_run" MTI_RUN',
  '    "Aibatt1Big_run" 7',
  '  }',
  '}',
);

const MDL_OBJ = script('"obj" 0', '{', entry('Tree01', '1', 'MODELTYPE_MESH'), '}');

const PACKED: Record<string, string> = {
  'defineTest.h': DEFINES,
  'propMover.txt.txt': script(
    'IDS_PROPMOVER_TXT_000002\tMale',
    'IDS_PROPMOVER_TXT_000003\t',
    'IDS_PROPMOVER_TXT_000004\tFemale',
    'IDS_PROPMOVER_TXT_000006\tSmall Aibatt',
    'IDS_PROPMOVER_TXT_000008\tOrphan',
  ),
  'propMover.txt': script(
    '//dwID\tszName\tdwAI',
    moverRow('MI_MALE', 'IDS_PROPMOVER_TXT_000002', 'AII_MOVER', '0.1'),
    moverRow('MI_FEMALE', 'IDS_PROPMOVER_TXT_000004', 'AII_MOVER', '0.1'),
    moverRow('MI_AIBATT1', 'IDS_PROPMOVER_TXT_000006', 'AII_MONSTER', '0.075', '0', {
      level: '1', addHp: '120', expValue: '2', rank: '0', belligerence: '2', killable: '1', atk1: '9000',
    }),
    moverRow('MI_ORPHAN', 'IDS_PROPMOVER_TXT_000008', 'AII_MONSTER', '0.2', '1', {
      level: '85', addHp: '9000', expValue: '5000000000', rank: '3', belligerence: '4', killable: '2', hideLevel: '1', element: '2', atk1: '9001',
    }),
  ),
  'propItem.txt.txt': script(
    'IDS_PROPITEM_TXT_000790\tCotton Suit',
    'IDS_PROPITEM_TXT_000791\tA suit of cotton.',
    'IDS_PROPITEM_TXT_000792\tPike Suit',
    'IDS_PROPITEM_TXT_000793\tTraining Sword',
  ),
  'propItem.txt': script(
    '//ver6\t//dwID\tszName',
    itemRow('II_ARM_M_VAG_SUIT01', 'IDS_PROPITEM_TXT_000790', 'PARTS_UPPER_BODY'),
    itemRow('503', 'IDS_PROPITEM_TXT_000792', 'PARTS_LOWER_BODY', '=', 'PARTS_HAIR'),
    // 504 has a model entry and no row here
    weaponRow('505', 'IDS_PROPITEM_TXT_000793'),
  ),
  'propSkill.txt.txt': script(
    'IDS_PROPSKILL_TXT_000000\tClean Hit',
    'IDS_PROPSKILL_TXT_000001\tA powerful, downward strike.',
    'IDS_PROPSKILL_TXT_000002\tFlurry',
    'IDS_PROPSKILL_TXT_000003\tRapid, stabbing attack.',
    'IDS_PROPSKILL_TXT_000004\tSplitting Mash',
    'IDS_PROPSKILL_TXT_000005\tA blow with the whole body.',
    'IDS_PROPSKILL_TXT_000006\tFlash',
    'IDS_PROPSKILL_TXT_000007\tAn effect of an item.',
  ),
  // Clean Hit; Flurry, which needs Clean Hit at 3, has a cool-down of its own to fall back on, a picture the client lacks,
  // and two levels; a Mercenary's skill; and a common skill (an effect of items), which is on no job's list
  'propSkill.txt': script(
    '//ver\t//dwID\tszName',
    skillRow('SI_VAG_ONE_CLEANHIT', 'IDS_PROPSKILL_TXT_000000', 'IDS_PROPSKILL_TXT_000001', { expertMax: '2', subDefine: 'SA_CLEANHIT_L01' }),
    skillRow('SI_VAG_ONE_BRANDISH', 'IDS_PROPSKILL_TXT_000002', 'IDS_PROPSKILL_TXT_000003', {
      reqLevel: '5', reSkill1: 'SI_VAG_ONE_CLEANHIT', reSkillLevel1: '3', skillReady: '2000', sfxObj3: 'XI_SKILL_VAG_ONE_BRANDISH01',
      useMotion: 'MTI_VAG_ONE_BRANDISH', expertMax: '2', subDefine: 'SA_BRANDISH_L01', comboStyle: 'CT_CIRCLE',
      icon: '"""skill_VagOneBrandi.dds"""',
    }),
    skillRow('SI_MER_ONE_SPLMASH', 'IDS_PROPSKILL_TXT_000004', 'IDS_PROPSKILL_TXT_000005', {
      kind1: 'JTYPE_EXPERT', kind2: 'JOB_MERCENARY', reqLevel: '=', expertMax: '2', subDefine: 'SA_SPLMASH_L01',
      icon: '""""""',
      // Piece 7 M2: a cast effect, a missile, a lasting and a caster's effect, arrows, a style, a pain, a push, a parameter
      sfxObj: '274', sfxObj2: '264', sfxObj4: '9', sfxObj5: '11', linkKindBullet: '25', linkKind: '12', atkStyle: '8',
      continuousPain: '1', dmgShift: '2', destParam0: '1', adjParam0: '7',
    }),
    skillRow('SI_GEN_FLASH', 'IDS_PROPSKILL_TXT_000006', 'IDS_PROPSKILL_TXT_000007', { kind1: 'JTYPE_COMMON', expertMax: '1' }),
  ),
  'propSkillAdd.csv': script(
    '//dwID,dwName,dwSkillLvl,dwAbilityMin,...',
    '//dwID,dwName,dwSkillLvl,dwAbilityMin,...',
    addRow('SA_CLEANHIT_L01', 'SI_VAG_ONE_CLEANHIT', 1, { fp: '5' }),
    addRow('SA_CLEANHIT_L02', 'SI_VAG_ONE_CLEANHIT', 2, { fp: '8' }),
    addRow('SA_BRANDISH_L01', 'SI_VAG_ONE_BRANDISH', 1, { fp: '10' }),
    addRow('SA_BRANDISH_L02', 'SI_VAG_ONE_BRANDISH', 2, { fp: '12', cooldown: '500', count: '3' }),
    addRow('SA_SPLMASH_L01', 'SI_MER_ONE_SPLMASH', 1, {
      mp: '20', fp: '9', casting: '600', pain: '4000', time: '9000', dst: '4', adj: '2', chg: '3',
    }),
    addRow('SA_SPLMASH_L02', 'SI_MER_ONE_SPLMASH', 2, { mp: '24', fp: '11' }),
  ),
  'propJob.inc': script(
    '// fAttackSpeed fFactorMaxHP ...',
    'JOB_VAGRANT 75.0 0.9 0.3 0.3 1.0 1.2 0.5 0.5 4.5 5.5 0.8 3.0 5.0 6.0 0.2 4.2 1.0',
    'JOB_MERCENARY 80.0 1.1 0.3 0.3 1.0 1.2 0.5 0.5 4.5 5.5 0.8 3.0 5.0 6.0 0.2 4.2 1.0',
  ),
  // the job names (CProject::LoadEtc)
  'etc.txt.txt': script('IDS_ETC_INC_000000\tVagrant', 'IDS_ETC_INC_000001\tMercenary'),
  'etc.inc': script(
    'job',
    '{',
    '\tJOB_VAGRANT\t\tIDS_ETC_INC_000000\t\tJOB_VAGRANT\tJTYPE_BASE',
    '\tJOB_MERCENARY\t\tIDS_ETC_INC_000001\t\tJOB_VAGRANT\tJTYPE_EXPERT',
    '}',
  ),
  'ExpTable.inc': script(
    'expCharacter // 1 based',
    '{',
    '	0 0 0 0 //0 - not used',
    '	14 1 2 18 //2',
    '	369857717768 0 5 9007199254740993',
    '}',
    'expLPPoint',
    '{',
    '	1 2 3',
    '}',
  ),
  'textClient.txt.txt': script(
    'IDS_TEXTCLIENT_INC_000156	Press ESC and go back to Lodestar(Town).',
    'IDS_TEXTCLIENT_INC_000157	"Level up!"',
    'IDS_TEXTCLIENT_INC_000158	',
  ),
  'textClient.inc': script(
    'TID_GAME_DEATH 0xff00ffff',
    '{',
    '	IDS_TEXTCLIENT_INC_000156',
    '}',
    'TID_GAME_LEVELUP 0xffffff00',
    '{',
    '	IDS_TEXTCLIENT_INC_000157',
    '}',
    'TID_EMPTY 0xff000000',
    '{',
    '	IDS_TEXTCLIENT_INC_000158',
    '}',
  ),
  'mdlObj.inc': MDL_OBJ,
  'mdlDyna.inc': MDL_DYNA,
  'character.txt.txt': script(
    'IDS_CHARACTER_INC_000001\tMikyel',
    'IDS_CHARACTER_INC_000002\tLuda',
    'IDS_CHARACTER_INC_000003\tMikyel the Second',
    'IDS_CHARACTER_INC_000004\tchar_Luda.tga',
  ),
  'character.inc': script(
    'MaFl_Mikyel',
    '{',
    '\tsetting',
    '\t{',
    '\t\tAddMenu( MMI_DIALOG );',
    '\t}',
    '\tSetName ( IDS_CHARACTER_INC_000001 );',
    '}',
    'MaFl_Luda',
    '{',
    '\tAddTeleport( 7161, 3264 );',
    '\tSetImage( IDS_CHARACTER_INC_000004 );',
    '\tSetName ( IDS_CHARACTER_INC_000002 );',
    '}',
  ),
  'character-etc.inc': script('MAFL_MIKYEL', '{', '\tSetName ( IDS_CHARACTER_INC_000003 );', '}'),
  'character-school.inc': script('Sc_Guard', '{', '\tm_szName = "Guard";', '}'),
  'PKSetting.inc': script('GENERAL_COLOR\t0xffffffff', 'READY_COLOR\t0xffffc0cb', 'CHAO_COLOR\t0xffff0000'),
  'honorList.txt.txt': script('IDS_TITLE_TXT_0001\tMaster Collector', 'IDS_TITLE_TXT_0002\tTaiga Hunter'),
  'honorList.txt': script(
    '// id\tbig\tsmall\tneed\ttitle',
    tabs('0 HI_ELASPED_TIME HS_COLLECT 1440 IDS_TITLE_TXT_0001 //collection'),
    tabs('3 HI_HUNT_MONSTER 1012 15000 IDS_TITLE_TXT_0002'),
  ),
  // the folders keep the case the file writes (the client's own names mix it) and webName lower-cases them
  'World.inc': script(
    '// World Script',
    'WI_WORLD_TEST "WdTest"',
    'WI_WORLD_MADRIGAL "WdMadrigal" ',
    'WI_WORLD_GUILDHOUSE "Wd Guild House"',
    'WI_DUNGEON_SECRET_0\t"WdHeaven06"//',
    'WI_DUNGEON_SECRET_1\t"WdHeaven06_1"',
    'WI_DUNGEON_SECRET_2\t"WdHeaven06_1"',
    'WI_WORLD_TEST\tSetTitle',
    '(',
    '\tIDS_WORLD_INC_000000',
    ');',
  ),
};

const CHR_FILES = ['Model/Mvr_male.chr', 'Model/Mvr_female.chr', 'Model/Mvr_Aibatt1.chr'];

/** What the models stage would have written for the fixture, as logical keys. */
const CONVERTED = [
  'skeletons/mvr_male.glb',
  'skeletons/mvr_female.glb',
  'skeletons/mvr_aibatt1.glb',
  'models/mvr_aibatt1.glb',
  'motions/mvr_male/mvr_male_genstand.glb',
  'motions/mvr_male/mvr_male_genwalk.glb',
  'motions/mvr_female/mvr_female_genstand.glb',
  'motions/mvr_aibatt1/mvr_aibatt1_stand.glb',
  'motions/mvr_aibatt1/mvr_aibatt1_walk.glb',
  'motions/mvr_aibatt1/mvr_aibatt1_run.glb',
  'models/part_mvag01upper.glb',
  'models/part_fvag01upper.glb',
  'models/part_mvag02upper.glb',
  'models/part_mvag03upper.glb',
  'models/item_weasword.glb', // item 505, a held item
  'models/item_genmatsuitbox.glb', // the model of the suits' entries, which have a part: they are worn, not held
];

/** Every catalog of GAME_DATA_KEYS: the stage writes one file for each. */
const CATALOGS = Object.keys(GAME_DATA_KEYS).length;

describe('the game-data stage', () => {
  let root: string;
  let out: string;

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-data-client-');
    out = await makeTempDir('flyffweb-data-out-');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  /**
   * Lays out the fixture client, `packed` replacing or removing (undefined) some of its pack files, with `loose` files
   * (a world's `.wld`) besides the fixture's.
   */
  async function client(packed: Record<string, string | undefined> = {}, loose: Record<string, string> = {}): Promise<void> {
    const files = { ...PACKED, ...packed };
    await writeFakeClient(root, {
      packed: Object.entries(files).flatMap(([name, content]) =>
        content === undefined ? [] : [{ name, data: text(content) }],
      ),
      loose: {
        ...Object.fromEntries([...CHR_FILES, 'Icon/skill_VagOneCleanh.dds'].map((file) => [file, 'not read'])),
        ...loose,
      },
    });
  }

  /** Runs the stage; `converted` are the keys the earlier stages are taken to have written. */
  async function runData(opts: { only?: string; converted?: string[] } = {}): Promise<Run> {
    const writer = new AssetWriter(out);
    const report = new Report();
    for (const key of opts.converted ?? CONVERTED) await writer.write(key, bytesOf(1), 'seed');
    const ctx: StageContext = {
      client: await ClientFs.open(root),
      writer,
      report,
      only: opts.only,
      jobs: 2,
      outDir: out,
    };
    await gameDataStage.run(ctx);
    await report.write(out);
    return { writer, report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson, out };
  }

  async function catalog<T>(run: Run, key: string): Promise<T> {
    const hashed = run.writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    return JSON.parse(await fs.readFile(path.join(run.out, ...hashed!.split('/')), 'utf8')) as T;
  }

  it('runs last among the default stages, after the effects and UI stages whose files it names', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(['textures', 'models', 'effects', 'ui', 'worlds', 'audio', 'data']);
  });

  it('writes the optional quest catalog from the quest files the packs hold', async () => {
    await client({
      'propQuest.inc': '5 { SetTitle( "A quest" ); setting { SetHeadQuest( 6001 ); } } 6 { SetTitle( "Replaced" ); }',
      'propQuest-Scenario.inc': '6 { SetTitle( "Scenario six" ); setting { SetHeadQuest( 6000 ); } }',
    });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    expect(await catalog(run, QUESTS_KEY)).toEqual([
      { id: 5, title: 'A quest', head: 6001, states: {} },
      { id: 6, title: 'Scenario six', head: 6000, states: {} },
    ]);
  });

  it('a quest that cannot be read is a warning and is left out; the rest of the catalog is written (spec §4)', async () => {
    await client({
      'propQuest.inc': '5 { SetTitle( "A quest" ); } 7 SetTitle( "No brace" ); setting { SetHeadQuest( 6001 ); } } 8 { SetTitle( "After" ); }',
      'propQuest-Scenario.inc': '6 { SetTitle( "Scenario six" ); setting { SetHeadQuest( 6000 ); } }',
    });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    expect((await catalog<{ id: number }[]>(run, QUESTS_KEY)).map((quest) => quest.id)).toEqual([5, 8, 6]);
    expect(run.report.warnings.filter((w) => w.message.includes("expected '{' after quest"))).toHaveLength(1);
  });

  it('runs without the quest files, and writes no quest catalog', async () => {
    await client();
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    expect(run.writer.pathOf(QUESTS_KEY)).toBeUndefined();
  });

  it('writes every catalog, each once, under its hashed name', async () => {
    await client();
    const run = await runData();
    expect(run.report.failures).toEqual([]);

    expect(Object.values(GAME_DATA_KEYS).sort()).toEqual([
      'data/effectsIndex.json',
      'data/exp.json',
      'data/honorTitles.json',
      'data/itemProps.json',
      'data/items.json',
      'data/jobs.json',
      'data/movers.json',
      'data/nameColors.json',
      'data/npcs.json',
      'data/skills.json',
      'data/texts.json',
      'data/worlds.json',
    ]);
    for (const key of Object.values(GAME_DATA_KEYS)) {
      expect(run.writer.pathOf(key), key).toMatch(/^data\/[a-zA-Z]+\.[0-9a-f]{10}\.json$/);
    }
    expect(run.report.kinds.data).toMatchObject({ ok: CATALOGS, failed: 0 });

    // movers: by index; a player body has no model; the speed is the table's; the fight columns are the table's too
    expect(await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers)).toEqual([
      {
        index: 11,
        name: 'Male',
        speed: 0.1,
        ai: 1,
        flying: false,
        ...NO_FIGHT,
        model: null,
        skeleton: 'skeletons/mvr_male.glb',
        motions: {
          '0': 'motions/mvr_male/mvr_male_genstand.glb',
          '3': 'motions/mvr_male/mvr_male_genwalk.glb',
        },
      },
      {
        index: 12,
        name: 'Female',
        speed: 0.1,
        ai: 1,
        flying: false,
        ...NO_FIGHT,
        model: null,
        skeleton: 'skeletons/mvr_female.glb',
        motions: { '0': 'motions/mvr_female/mvr_female_genstand.glb' },
      },
      {
        index: 20,
        name: 'Small Aibatt',
        speed: 0.075,
        ai: 2,
        flying: false,
        level: 1, addHp: 120, expValue: 2, rank: 0, belligerence: 2, killable: 1, hideLevel: -1, element: 0, atk1: 9000,
        model: 'models/mvr_aibatt1.glb',
        skeleton: 'skeletons/mvr_aibatt1.glb',
        motions: {
          '0': 'motions/mvr_aibatt1/mvr_aibatt1_stand.glb',
          '3': 'motions/mvr_aibatt1/mvr_aibatt1_walk.glb',
          // the motion text has an underscore, so MakeMotionName does not put the mover's name in front of it
          '5': 'motions/mvr_aibatt1/mvr_aibatt1_run.glb',
          // (motion 7, "Aibatt1Big_run", is the file mvr_Aibatt1Big_run.ani: no skeleton fits its name, so it is left out)
        },
      },
      // a flying monster (dwFlying 1)
      { index: 21, name: 'Orphan', speed: 0.2, ai: 2, flying: true, ...ORPHAN_FIGHT, model: null, skeleton: null, motions: {} },
    ]);

    // items: only the model entries with a part; 504 has no ItemProp, 505 has no part
    expect(await catalog<WebItemModel[]>(run, GAME_DATA_KEYS.items)).toEqual([
      {
        id: 502, part: 2, exclusive: 3, baseIgnore: -1,
        male: 'models/part_mvag01upper.glb', female: 'models/part_fvag01upper.glb',
      },
      {
        id: 503, part: 3, exclusive: -1, baseIgnore: 1,
        male: 'models/part_mvag02upper.glb', female: 'models/part_mvag02upper.glb',
      },
    ]);

    // NPCs: file order over the three files; MAFL_MIKYEL of the second file replaces MaFl_Mikyel (same lower-case key)
    expect(await catalog<WebNpc[]>(run, GAME_DATA_KEYS.npcs)).toEqual([
      { key: 'MAFL_MIKYEL', name: 'Mikyel the Second' },
      { key: 'MaFl_Luda', name: 'Luda', teleports: [{ x: 7161, z: 3264 }], image: 'ui/char/char_luda.png' },
      { key: 'Sc_Guard', name: 'Guard' },
    ]);

    expect(await catalog<WebNameColors>(run, GAME_DATA_KEYS.nameColors)).toEqual({
      general: 0xffffffff,
      chaotic: 0xffff0000,
      ready: 0xffffc0cb,
    });
    expect(await catalog<WebHonorTitles>(run, GAME_DATA_KEYS.honorTitles)).toEqual({
      '0': 'Master Collector',
      '3': 'Taiga Hunter',
    });

    // worlds: the id (the WI_* value) to the web folder name, webName of the file name World.inc gives it; the SetTitle
    // block adds nothing, and two ids may share a folder
    expect(await catalog<WebWorlds>(run, GAME_DATA_KEYS.worlds)).toEqual({
      '0': 'wdtest',
      '1': 'wdmadrigal',
      '5': 'wd-guild-house',
      '40': 'wdheaven06',
      '41': 'wdheaven06_1',
      '42': 'wdheaven06_1',
    });
  });

  it('itemProps: a row of propItem.txt per id with the fight columns, the held model and the icon', async () => {
    await client();
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    const props = await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps);
    // every row, by id, whether or not the item shows a model (504 has a model entry and no row)
    expect(props.map((prop) => prop.id)).toEqual([502, 503, 505]);

    // a sword: dwSfxObj3 is the hit effect (XI_HIT_SWORD01), the attack speed the C float of the token, and the
    // model entry has no part, so the item is held and the converted item model is its model
    expect(props[2]).toEqual({
      id: 505, name: 'Training Sword', description: 'A suit of cotton.', cost: 12, packMax: 1, kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, abilityMin: 3, abilityMax: 4,
      weaponType: 1, attackSpeed: Math.fround(0.085), attackRange: 1, destParams: [14, -1, -1], adjParams: [5, -3, -1],
      sfxHit: 20, sfxMissile: -1, linkKindBullet: -1,
      model: 'models/item_weasword.glb', dropModel: 'models/item_weasword.glb', icon: 'ui/item/itm_weasword.png',
    });
    expect(props[2]!.attackSpeed).not.toBe(0.085);

    // a suit: worn, so its model entry has a part and the item is not held; `=` is -1, as in the other catalogs
    expect(props[0]).toEqual({
      id: 502, name: 'Cotton Suit', description: 'A suit of cotton.', cost: 12, packMax: 1, kind1: 2, kind2: 7, kind3: 18, handed: -1, part: 2, abilityMin: 8, abilityMax: 10,
      weaponType: -1, attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1],
      sfxHit: -1, sfxMissile: -1, linkKindBullet: -1,
      model: null, dropModel: 'models/item_genmatsuitbox.glb', icon: 'ui/item/itm_mvag01upper.png',
    });
    expect(props[1]).toMatchObject({ id: 503, name: 'Pike Suit', part: 3, model: null });
  });

  it('items keep the missile and the bullet kind (Piece 7 M2)', async () => {
    const row = weaponRow('505', 'IDS_PROPITEM_TXT_000793').split('\t');
    row[80] = '27'; // dwSfxObj2: a wand's missile, XI_FIR_WAND01
    row[28] = '25'; // dwLinkKindBullet: a bow's IK2_BULLET
    await client({ 'propItem.txt': script(row.join('\t')) });
    const run = await runData();
    expect(await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps)).toEqual([
      expect.objectContaining({ id: 505, sfxMissile: 27, linkKindBullet: 25, sfxHit: 20 }),
    ]);
  });

  it('item props carry castMs and sfxReady only with a cast (Piece 7 M3)', async () => {
    const cast = weaponRow('505', 'IDS_PROPITEM_TXT_000793').split('\t');
    cast[75] = '10000'; // dwSkillReadyType: a Blinkwing's 10 s cast
    cast[79] = '118'; // dwSfxObj: XI_BLINKWING_READY
    const effectOnly = weaponRow('503', 'IDS_PROPITEM_TXT_000793').split('\t');
    effectOnly[79] = '118'; // an effect with no cast is no ready effect: CreateItemReadySfx runs at STATEMODE ON only
    await client({ 'propItem.txt': script(cast.join('\t'), effectOnly.join('\t')) });
    const props = await catalog<WebItemProp[]>(await runData(), GAME_DATA_KEYS.itemProps);
    expect(props.find((p) => p.id === 505)).toMatchObject({ castMs: 10000, sfxReady: 118 });
    const plain = props.find((p) => p.id === 503)!;
    for (const key of ['castMs', 'sfxReady']) expect(plain).not.toHaveProperty(key);
  });

  it("a ride keeps its flight columns, the speed's text exact (Piece 7 M5)", async () => {
    const ride = itemRow('5000', 'IDS_PROPITEM_TXT_000790', '13').split('\t');
    ride[5] = '4'; // dwItemKind1: IK1_RIDE
    ride[84] = '31'; // dwUseMotion: MTI_FSTAND1_A
    ride[109] = '0.0023'; // fFlightSpeed
    ride[110] = '0.6'; // fFlightLRAngle
    ride[111] = '1'; // fFlightTBAngle
    ride[112] = '='; // dwFlightLimit: NULL_ID is level 1 (MoverEquip.cpp:1493-1495)
    ride[113] = '1200'; // dwFFuelReMax
    ride[114] = '12'; // dwAFuelReMax
    await client({ 'propItem.txt': script(ride.join('\t')) });
    const props = await catalog<WebItemProp[]>(await runData(), GAME_DATA_KEYS.itemProps);
    expect(props.find((p) => p.id === 5000)!.flight).toEqual({
      speed: Math.fround(0.0023), speedText: '0.0023', turn: Math.fround(0.6), pitch: 1, limit: 1, fuelMax: 1200,
      accelFuelMax: 12, motion: 31,
    });
  });

  it('a non-ride has no flight (Piece 7 M5)', async () => {
    const notRide = itemRow('503', 'IDS_PROPITEM_TXT_000792', 'PARTS_LOWER_BODY').split('\t');
    notRide[109] = '0.0023'; // a speed on an armour is not a ride's
    await client({ 'propItem.txt': script(notRide.join('\t'), weaponRow('505', 'IDS_PROPITEM_TXT_000793')) });
    const props = await catalog<WebItemProp[]>(await runData(), GAME_DATA_KEYS.itemProps);
    for (const prop of props) expect(prop, String(prop.id)).not.toHaveProperty('flight');
  });

  it('worldNoFly lists the fly 0 worlds (Piece 7 M5, WorldFile.cpp:88-92)', async () => {
    await client({}, {
      'World/WdTest/WdTest.wld': script('size 1, 1', 'fly 0'),
      'World/WdMadrigal/WdMadrigal.wld': script('size 1, 1'), // fly is TRUE when the file does not say
      'World/WdHeaven06_1/WdHeaven06_1.wld': script('size 1, 1', 'fly 0'), // two ids open this folder
      'World/WdHeaven06/WdHeaven06.wld': script('fly 1'),
    });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    expect(await catalog<number[]>(run, WORLD_NO_FLY_KEY)).toEqual([0, 41, 42]);
  });

  it('writes no worldNoFly without a .wld', async () => {
    await client();
    expect((await runData()).writer.pathOf(WORLD_NO_FLY_KEY)).toBeUndefined();
  });

  it('itemProps: a row repeated in propItem.txt keeps the last, and an item with no icon has none', async () => {
    // CFixedArray::SetAtGrow replaces the slot
    const bare = itemRow('503', 'IDS_PROPITEM_TXT_000792', 'PARTS_LOWER_BODY').split('	');
    bare[120] = '""""""'; // szIcon is three tokens, "" name "", and the name is empty
    await client({
      'propItem.txt': script(
        itemRow('503', 'IDS_PROPITEM_TXT_000793', 'PARTS_UPPER_BODY'),
        weaponRow('505', 'IDS_PROPITEM_TXT_000793'),
        bare.join('	'),
      ),
    });
    const run = await runData();
    const props = await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps);
    expect(props.map((prop) => prop.id)).toEqual([503, 505]);
    expect(props[0]).toMatchObject({ id: 503, name: 'Pike Suit', part: 3, icon: null });
  });

  it('itemProps: preserves a positive native reflection flag for the drop renderer', async () => {
    const row = weaponRow('505', 'IDS_PROPITEM_TXT_000793').split('\t');
    row[117] = '1'; // nReflect, immediately before dwSndAttack1 and dwSndAttack2
    await client({ 'propItem.txt': script(row.join('\t')) });
    const run = await runData();
    expect(await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps)).toEqual([
      expect.objectContaining({ id: 505, reflect: 1, dropModel: 'models/item_weasword.glb' }),
    ]);
  });

  it('itemProps: dwPackMax, how many of the item one inventory slot holds, as the row gives it', async () => {
    const stacked = itemRow('503', 'IDS_PROPITEM_TXT_000792', 'PARTS_LOWER_BODY').split('	');
    stacked[4] = '99'; // dwPackMax, the column after dwNum
    await client({ 'propItem.txt': script(itemRow('502', 'IDS_PROPITEM_TXT_000790', 'PARTS_UPPER_BODY'), stacked.join('	')) });
    const run = await runData();
    const props = await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps);
    expect(props.map(({ id, packMax }) => [id, packMax])).toEqual([[502, 1], [503, 99]]);
  });

  it('itemProps: a held item whose model was not converted has no model, with one warning that names the item', async () => {
    await client();
    const run = await runData({ converted: CONVERTED.filter((key) => key !== 'models/item_weasword.glb') });
    expect(run.report.failures).toEqual([]);
    const props = await catalog<WebItemProp[]>(run, GAME_DATA_KEYS.itemProps);
    expect(props.find((prop) => prop.id === 505)!.model).toBeNull();
    const warnings = run.report.warnings.filter((w) => w.message.includes('item_weasword'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'data' });
    expect(warnings[0]!.message).toContain('505');
    expect(warnings[0]!.message).toContain('held');
  });

  it('jobs: a row per job of propJob.inc, the floats as C floats, with the name etc.inc gives the job', async () => {
    await client();
    const run = await runData();
    const jobs = await catalog<WebJob[]>(run, GAME_DATA_KEYS.jobs);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      name: 'JOB_VAGRANT', attackSpeed: 75, factorMaxHP: Math.fround(0.9), factorMaxMP: Math.fround(0.3),
      factorMaxFP: Math.fround(0.3), factorDef: 1, factorHPRecovery: Math.fround(1.2), factorMPRecovery: 0.5,
      factorFPRecovery: 0.5, meleeSWD: 4.5, meleeAXE: 5.5, meleeSTAFF: Math.fround(0.8), meleeSTICK: 3,
      meleeKNUCKLE: 5, magicWAND: 6, blocking: Math.fround(0.2), meleeYOYO: Math.fround(4.2), critical: 1,
      title: 'Vagrant',
    });
    expect(jobs[1]).toMatchObject({ name: 'JOB_MERCENARY', attackSpeed: 80, factorMaxHP: Math.fround(1.1), title: 'Mercenary' });
    expect(run.report.warnings.filter((w) => w.message.includes('etc.inc'))).toEqual([]);
  });

  it("jobs: a job etc.inc names nothing for has an empty name, with one warning that names it", async () => {
    await client({ 'etc.inc': script('job', '{', '\tJOB_VAGRANT\t\tIDS_ETC_INC_000000\t\tJOB_VAGRANT\tJTYPE_BASE', '}') });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    const jobs = await catalog<WebJob[]>(run, GAME_DATA_KEYS.jobs);
    expect(jobs.map((job) => job.title)).toEqual(['Vagrant', '']);
    const warnings = run.report.warnings.filter((w) => w.message.includes('etc.inc'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('JOB_MERCENARY');
  });

  it('exp: the expCharacter rows with the 64-bit columns as decimal text', async () => {
    await client();
    const run = await runData();
    expect(await catalog<WebExpRow[]>(run, GAME_DATA_KEYS.exp)).toEqual([
      { exp1: '0', exp2: '0', lpPoint: 0, limitExp: '0' },
      { exp1: '14', exp2: '1', lpPoint: 2, limitExp: '18' },
      // past 2^53 the text is still exact
      { exp1: '369857717768', exp2: '0', lpPoint: 5, limitExp: '9007199254740993' },
    ]);
  });

  it('texts: the text and colour of every TID with a text, by its name, and the number defineText.h gives it', async () => {
    await client();
    const run = await runData();
    const texts = await catalog<WebTexts>(run, GAME_DATA_KEYS.texts);
    // the quotes are taken out of the text (CProject::LoadText) and a TID whose text is empty is not there; a TID that no
    // header numbers has no textId
    expect(texts).toEqual({
      TID_GAME_DEATH: { text: 'Press ESC and go back to Lodestar(Town).', color: 0xff00ffff, textId: 602 },
      TID_GAME_LEVELUP: { text: 'Level up!', color: 0xffffff00 },
    });
  });

  it('effectsIndex: the XI id of each OT_SFX entry to its effect file and scale', async () => {
    await client();
    const run = await runData();
    const index = await catalog<WebEffectsIndex>(run, GAME_DATA_KEYS.effectsIndex);
    // the .sfx file is the entry's name with sfx_ in front unless it has an underscore (MakeModelName); the scale is
    // the entry's fScale, a C float; the billboard (modelType 3) has no .sfx file and is left out
    expect(index).toEqual({
      '20': { effect: 'effects/sfx_hitsword01.json', scale: Math.fround(0.1) },
      '31': { effect: 'effects/sfx_hityoy01.json', scale: 2 },
      '42': { effect: 'effects/sfx_genlevelup01.json', scale: 1 },
    });
    expect(Object.keys(index)).toEqual(['20', '31', '42']);
  });

  it('effectsIndex names the file by the shared webName rule, whether or not it exists', async () => {
    // the effects stage writes effects/<webName>.json; the index only names it
    await client({ 'mdlDyna.inc': MDL_DYNA.replace('"HitYoy01"', '"Hit Yoy01"') });
    const run = await runData({ converted: [] });
    const index = await catalog<WebEffectsIndex>(run, GAME_DATA_KEYS.effectsIndex);
    expect(index['31']!.effect).toBe('effects/sfx_hit-yoy01.json');
  });

  it('skills: every job skill of propSkill.txt by id, with its levels of propSkillAdd.csv; a common skill is left out', async () => {
    await client();
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    const skills = await catalog<WebSkill[]>(run, GAME_DATA_KEYS.skills);
    expect(skills.map((skill) => skill.id)).toEqual([1, 2, 3]); // SI_GEN_FLASH (50) is JTYPE_COMMON

    expect(skills[0]).toEqual({
      id: 1, name: 'Clean Hit', description: 'A powerful, downward strike.', jobType: 0, job: 0, handed: 1, attackRange: 1,
      reqLevel: 3, reqSkills: [], useMotion: 1000, sfxHit: 201, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1,
      maxLevel: 2, comboStyle: 1, icon: 'ui/skill_vagonecleanh.png', ...NO_SHOT,
      // dwSkillReady is `=`, so a level with no cool-down of its own has none
      levels: [
        { reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1, ...NO_TIMES },
        { reqMp: -1, reqFp: 8, cooldown: -1, skillCount: -1, ...NO_TIMES },
      ],
    });

    // Flurry needs Clean Hit at 3; its first level takes the skill's dwSkillReady for a cool-down, its second has its own
    expect(skills[1]).toMatchObject({
      id: 2, name: 'Flurry', reqLevel: 5, reqSkills: [{ skill: 1, level: 3 }], useMotion: 1001, sfxHit: 202, comboStyle: 2,
    });
    expect(skills[1]!.levels).toEqual([
      { reqMp: -1, reqFp: 10, cooldown: 2000, skillCount: -1, ...NO_TIMES },
      { reqMp: -1, reqFp: 12, cooldown: 500, skillCount: 3, ...NO_TIMES },
    ]);
    expect(skills[1]).toMatchObject(NO_SHOT);

    // Piece 7 M2: the Mercenary's row names its effects, arrows, style, pain and push; its first level its times and params
    expect(skills[2]).toMatchObject({
      sfxCast: 274, sfxMissile: 264, sfxLasting: 9, sfxCaster: 11, linkKind: 12, linkKindBullet: 25, atkStyle: 8,
      dmgShift: 2, continuousPain: true, destParams: [1, -1], adjParams: [7, -1],
    });
    expect(skills[2]!.levels[0]).toMatchObject({
      castingTime: 600, skillTime: 9000, painTime: 4000, destParams: [4, -1], adjParams: [2, -1], chgParams: [3, -1],
    });
    expect(skills[2]!.levels[1]).toMatchObject(NO_TIMES);

    // a Mercenary's skill: the job type and the job are the row's, `=` as the level needed is -1, and the cost has MP
    expect(skills[2]).toMatchObject({
      id: 3, name: 'Splitting Mash', jobType: 1, job: 1, reqLevel: -1, icon: null, maxLevel: 2,
    });
    expect(skills[2]!.levels.map((level) => [level.reqMp, level.reqFp])).toEqual([[20, 9], [24, 11]]);
  });

  it('skills: a picture Client/Icon lacks is null, with one warning that names the skill and the file', async () => {
    await client();
    const run = await runData();
    const skills = await catalog<WebSkill[]>(run, GAME_DATA_KEYS.skills);
    expect(skills.map((skill) => skill.icon)).toEqual(['ui/skill_vagonecleanh.png', null, null]);
    // Flurry names a picture the client lacks; the Mercenary's skill names none, which needs no warning
    const warnings = run.report.warnings.filter((w) => w.message.includes('Client/Icon'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'data', source: 'propSkill.txt' });
    expect(warnings[0]!.message).toContain('2 "Flurry" (skill_VagOneBrandi.dds)');
    expect(warnings[0]!.message).not.toContain('Clean Hit');
  });

  it("skills: the icon is looked for whatever the case of the file's name", async () => {
    await writeFakeClient(root, {
      packed: Object.entries(PACKED).map(([name, content]) => ({ name, data: text(content) })),
      loose: { 'icon/SKILL_VAGONECLEANH.DDS': 'not read', 'Model/Mvr_male.chr': 'x' },
    });
    const run = await runData();
    const skills = await catalog<WebSkill[]>(run, GAME_DATA_KEYS.skills);
    expect(skills[0]!.icon).toBe('ui/skill_vagonecleanh.png');
  });

  it('skills: a level with no row in propSkillAdd.csv costs nothing, and a row of another level is read as the C++ reads it, both with a warning', async () => {
    await client({
      'propSkillAdd.csv': script(
        addRow('SA_CLEANHIT_L01', 'SI_VAG_ONE_CLEANHIT', 1, { fp: '5' }),
        // level 2 of Clean Hit is missing; the first row of Flurry is another skill's level
        addRow('SA_BRANDISH_L01', 'SI_VAG_ONE_CLEANHIT', 1, { fp: '10' }),
        addRow('SA_BRANDISH_L02', 'SI_VAG_ONE_BRANDISH', 2, { fp: '12' }),
        addRow('SA_SPLMASH_L01', 'SI_MER_ONE_SPLMASH', 1, { fp: '9' }),
        addRow('SA_SPLMASH_L02', 'SI_MER_ONE_SPLMASH', 2, { fp: '11' }),
      ),
    });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    const skills = await catalog<WebSkill[]>(run, GAME_DATA_KEYS.skills);
    expect(skills[0]!.levels).toEqual([
      { reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1, ...NO_TIMES },
      { reqMp: -1, reqFp: -1, cooldown: -1, skillCount: -1, ...NO_TIMES },
    ]);
    // GetAddSkillProp takes the row by its place, not by what it says
    expect(skills[1]!.levels[0]).toMatchObject({ reqFp: 10 });

    const missing = run.report.warnings.find((w) => w.source === 'propSkillAdd.csv' && w.message.includes('no row'));
    expect(missing).toMatchObject({ kind: 'data', source: 'propSkillAdd.csv' });
    expect(missing!.message).toContain('1 "Clean Hit" level 2');
    const other = run.report.warnings.find((w) => w.source === 'propSkillAdd.csv' && w.message.includes('another level'));
    expect(other).toMatchObject({ kind: 'data', source: 'propSkillAdd.csv' });
    expect(other!.message).toContain('2 "Flurry" level 1 (row 15 is level 1 of skill 1)');
  });

  it('skills: a table that cannot be read fails the skills catalog alone, with the file it came from', async () => {
    await client({ 'propSkillAdd.csv': undefined });
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]!.message).toContain('propSkillAdd.csv');
    expect(run.writer.pathOf(GAME_DATA_KEYS.skills)).toBeUndefined();
    expect(run.writer.pathOf(GAME_DATA_KEYS.itemProps)).toBeDefined();
    expect(run.report.kinds.data).toMatchObject({ ok: CATALOGS - 1, failed: 1 });

    await client({ 'propSkillAdd.csv': script('SA_CLEANHIT_L01,SI_NOT_THERE,1') });
    const unknown = await runData();
    expect(unknown.report.failures).toHaveLength(1);
    expect(unknown.report.failures[0]).toMatchObject({ kind: 'data', source: 'propSkillAdd.csv' });
    expect(unknown.report.failures[0]!.message).toContain('SI_NOT_THERE');
  });

  it('a world id defined twice keeps the later file name, and one with no file name is left out', async () => {
    // CFixedArray::SetAtGrow replaces the slot (worldmng.cpp:359); a slot with no file name is not a valid WORLD
    await client({
      'World.inc': script(
        'WI_WORLD_TEST "WdTest"',
        'WI_WORLD_MADRIGAL "WdMadrigal"',
        'WI_WORLD_TEST "WdTestAgain"',
        'WI_WORLD_GUILDHOUSE "WdGuildHouse"',
        'WI_WORLD_GUILDHOUSE ""',
      ),
    });
    const run = await runData();
    expect(run.report.failures).toEqual([]);
    expect(await catalog<WebWorlds>(run, GAME_DATA_KEYS.worlds)).toEqual({ '0': 'wdtestagain', '1': 'wdmadrigal' });
  });

  it('a part with a slash gives the male and female names', async () => {
    await client();
    const run = await runData();
    const items = await catalog<WebItemModel[]>(run, GAME_DATA_KEYS.items);
    const suit = items.find((item) => item.id === 502)!;
    expect(suit.male).toBe('models/part_mvag01upper.glb');
    expect(suit.female).toBe('models/part_fvag01upper.glb');

    // CModelMng::MakePartsName (ModelMng.cpp:95): "part_" and the text up to the slash for a man, after it for a woman
    expect(makePartsName('part', 'mvag01upper/fvag01upper', 'male')).toBe('part_mvag01upper.o3d');
    expect(makePartsName('part', 'mvag01upper/fvag01upper', 'female')).toBe('part_fvag01upper.o3d');
    // a part without a slash is the same for both sexes, and keeps its case until webName lower-cases it
    expect(makePartsName('part', 'mVag02Upper', 'male')).toBe('part_mVag02Upper.o3d');
    expect(makePartsName('part', 'mVag02Upper', 'female')).toBe('part_mVag02Upper.o3d');
    // only the first slash splits
    expect(makePartsName('part', 'a/b/c', 'male')).toBe('part_a.o3d');
    expect(makePartsName('part', 'a/b/c', 'female')).toBe('part_b/c.o3d');
  });

  it('a part model that was not converted is null, with a warning naming the item', async () => {
    await client();
    const run = await runData({ converted: CONVERTED.filter((key) => key !== 'models/part_fvag01upper.glb') });
    const items = await catalog<WebItemModel[]>(run, GAME_DATA_KEYS.items);
    expect(items[0]).toEqual({
      id: 502, part: 2, exclusive: 3, baseIgnore: -1, male: 'models/part_mvag01upper.glb', female: null,
    });
    const warning = run.report.warnings.find((w) => w.message.includes('part_fvag01upper'));
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe('data');
    expect(warning!.message).toContain('502');
  });

  it('skips a model entry with a part but no ItemProp, with a warning', async () => {
    await client();
    const run = await runData();
    const items = await catalog<WebItemModel[]>(run, GAME_DATA_KEYS.items);
    expect(items.map((item) => item.id)).toEqual([502, 503]);
    expect(run.report.warnings.some((w) => w.message.includes('504') && w.message.includes('propItem.txt'))).toBe(true);
  });

  it('an unconverted motion is left out with a warning', async () => {
    await client();
    const run = await runData({ converted: CONVERTED.filter((key) => !key.endsWith('mvr_male_genwalk.glb')) });
    const movers = await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers);
    const male = movers.find((mover) => mover.index === 11)!;
    expect(male.motions).toEqual({ '0': 'motions/mvr_male/mvr_male_genstand.glb' });
    expect(male.skeleton).toBe('skeletons/mvr_male.glb');
    const warning = run.report.warnings.find((w) => w.message.includes('mvr_male_GenWalk'));
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe('data');
    expect(warning!.message).toContain('male'); // names the mover
    expect(warning!.message).toContain('3'); // and the motion id
  });

  it('a model or skeleton that was not converted is null, with a warning; a player body has no model and no warning', async () => {
    await client();
    const run = await runData({ converted: [] });
    const movers = await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers);
    expect(movers.map((mover) => [mover.index, mover.model, mover.skeleton, mover.motions])).toEqual([
      [11, null, null, {}],
      [12, null, null, {}],
      [20, null, null, {}],
      [21, null, null, {}],
    ]);
    const messages = run.report.warnings.map((w) => w.message);
    expect(messages.some((m) => m.includes('models/mvr_aibatt1.glb'))).toBe(true);
    expect(messages.filter((m) => m.includes('skeletons/')).length).toBe(3); // male, female, aibatt1
    // MI_MALE and MI_FEMALE are assembled from parts (Mover.cpp:1427), so no warning asks for their body model
    expect(messages.some((m) => m.includes('models/mvr_male.glb') || m.includes('models/mvr_female.glb'))).toBe(false);
  });

  it('a motion whose file name no skeleton fits is left out with a warning', async () => {
    await client();
    const run = await runData({ converted: [...CONVERTED, 'motions/mvr_aibatt1/mvr_aibatt1big_run.glb'] });
    const aibatt = (await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers)).find((mover) => mover.index === 20)!;
    expect(Object.keys(aibatt.motions)).toEqual(['0', '3', '5']);
    const warning = run.report.warnings.find((w) => w.message.includes('mvr_Aibatt1Big_run.ani'));
    expect(warning?.message).toContain('7');
    expect(warning?.message).toContain('no skeleton fits');
  });

  it('a mover with no OT_MOVER model entry keeps its name and speed, with a warning', async () => {
    await client();
    const run = await runData();
    const orphan = (await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers)).find((mover) => mover.index === 21)!;
    expect(orphan).toEqual({
      index: 21, name: 'Orphan', speed: 0.2, ai: 2, flying: true, ...ORPHAN_FIGHT, model: null, skeleton: null, motions: {},
    });
    expect(run.report.warnings.some((w) => w.message.includes('21') && w.message.includes('mdlDyna.inc'))).toBe(true);
  });

  it('a repeated motion id keeps the last name, as CModelMng::LoadScript does', async () => {
    await client({
      'mdlDyna.inc': MDL_DYNA.replace('"GenWalk"  MTI_WALK', '"GenWalk"  MTI_WALK\r\n    "GenWalk2" MTI_WALK'),
    });
    const run = await runData({ converted: [...CONVERTED, 'motions/mvr_male/mvr_male_genwalk2.glb'] });
    const male = (await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers)).find((mover) => mover.index === 11)!;
    expect(male.motions['3']).toBe('motions/mvr_male/mvr_male_genwalk2.glb');
    expect(Object.keys(male.motions)).toEqual(['0', '3']);
  });

  it('makeMotionName follows CModelMng::MakeMotionName', () => {
    const elem = (name: string, motions: ModelElem['motions']): ModelElem => ({
      type: 5,
      id: 1,
      name,
      modelType: 2,
      part: '',
      extra: [],
      motions,
    });
    const aibatt = elem('Aibatt1', [
      { id: 0, name: 'Stand' },
      { id: 3, name: 'Walk' },
      { id: 5, name: 'Aibatt1_run' },
    ]);
    // "mvr_", the mover's name and "_" unless the motion text has an underscore of its own, the text, ".ani"
    expect(makeMotionName(aibatt, 0)).toBe('mvr_Aibatt1_Stand.ani');
    expect(makeMotionName(aibatt, 3)).toBe('mvr_Aibatt1_Walk.ani');
    expect(makeMotionName(aibatt, 5)).toBe('mvr_Aibatt1_run.ani');
    // an id past the list, or NULL_ID, plays MTI_STAND
    expect(makeMotionName(aibatt, 6)).toBe('mvr_Aibatt1_Stand.ani');
    expect(makeMotionName(aibatt, -1)).toBe('mvr_Aibatt1_Stand.ani');
    // an id inside the list that nothing names: the name prefix is added for the empty text, then MTI_STAND's text
    expect(makeMotionName(aibatt, 4)).toBe('mvr_Aibatt1_Stand.ani');
    // the last of a repeated id wins
    expect(makeMotionName(elem('Pig', [{ id: 0, name: 'A' }, { id: 0, name: 'B' }]), 0)).toBe('mvr_Pig_B.ani');
    // MTI_STAND is the stand id the defines give
    expect(makeMotionName(elem('Pig', [{ id: 8, name: 'Idle' }, { id: 2, name: 'Walk' }]), 99, 8)).toBe('mvr_Pig_Idle.ani');
  });

  it('runs only without --only or when the glob matches "data"', async () => {
    await client();
    const filtered = await runData({ only: 'wd*' });
    expect(filtered.writer.pathOf(GAME_DATA_KEYS.movers)).toBeUndefined();
    expect(filtered.report.kinds.data).toBeUndefined();

    const named = await runData({ only: 'data' });
    expect(named.writer.pathOf(GAME_DATA_KEYS.movers)).toBeDefined();
    const wild = await runData({ only: 'DAT*' });
    expect(wild.writer.pathOf(GAME_DATA_KEYS.items)).toBeDefined();
  });

  it('keeps going when one catalog cannot be read: that file fails, the others are written', async () => {
    await client({ 'PKSetting.inc': 'GENERAL_COLOR' });
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'data', source: 'PKSetting.inc' });
    expect(run.writer.pathOf(GAME_DATA_KEYS.nameColors)).toBeUndefined();
    const written = [GAME_DATA_KEYS.movers, GAME_DATA_KEYS.items, GAME_DATA_KEYS.npcs, GAME_DATA_KEYS.honorTitles];
    for (const key of [...written, GAME_DATA_KEYS.worlds]) expect(run.writer.pathOf(key), key).toBeDefined();
    expect(run.report.kinds.data).toMatchObject({ ok: CATALOGS - 1, failed: 1 });
  });

  it('a World.inc that cannot be read fails the worlds catalog with its name, the others are written', async () => {
    await client({ 'World.inc': script('WI_WORLD_TEST "WdTest"', 'WI_WORLD_MADRIGAL SetTitle ( IDS_WORLD_INC_000001 );') });
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'data', source: 'World.inc' });
    expect(run.writer.pathOf(GAME_DATA_KEYS.worlds)).toBeUndefined();
    expect(run.writer.pathOf(GAME_DATA_KEYS.honorTitles)).toBeDefined();
    expect(run.report.kinds.data).toMatchObject({ ok: CATALOGS - 1, failed: 1 });
  });

  it('a combat table that cannot be read fails its own catalog, with the file it came from; the others are written', async () => {
    await client({ 'ExpTable.inc': script('expLPPoint', '{', '	1 2 3', '}') }); // no expCharacter block
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'data', source: 'ExpTable.inc' });
    expect(run.writer.pathOf(GAME_DATA_KEYS.exp)).toBeUndefined();
    for (const key of [GAME_DATA_KEYS.itemProps, GAME_DATA_KEYS.jobs, GAME_DATA_KEYS.texts, GAME_DATA_KEYS.effectsIndex]) {
      expect(run.writer.pathOf(key), key).toBeDefined();
    }
    expect(run.report.kinds.data).toMatchObject({ ok: CATALOGS - 1, failed: 1 });
  });

  it('a file missing from the packs fails its catalog with the resource name', async () => {
    await client({ 'honorList.txt': undefined });
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]!.message).toContain('honorList.txt');
    expect(run.writer.pathOf(GAME_DATA_KEYS.honorTitles)).toBeUndefined();
    expect(run.writer.pathOf(GAME_DATA_KEYS.movers)).toBeDefined();
  });

  it('writes the same bytes every time (the hashed names do not move)', async () => {
    await client();
    const first = await runData();
    const second = await runData();
    for (const key of Object.values(GAME_DATA_KEYS)) {
      expect(second.writer.pathOf(key), key).toBe(first.writer.pathOf(key));
    }
  });
});
