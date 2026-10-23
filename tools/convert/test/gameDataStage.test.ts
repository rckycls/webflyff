// The game-data stage on a small hand-made client: every input the stage reads is a few lines in the test's own
// packs. The real client (MI_MALE and its stand motion, the item with a two-sex part, the counts of every table) is
// a corpus test: gameData.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_DATA_KEYS } from '@flyffweb/formats';
import type {
  ModelElem,
  WebHonorTitles,
  WebItemModel,
  WebMover,
  WebNameColors,
  WebNpc,
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
  '#define WI_WORLD_MADRIGAL 1',
  '#define WI_WORLD_GUILDHOUSE 5',
  '#define WI_DUNGEON_SECRET_0 40',
  '#define WI_DUNGEON_SECRET_1 41',
  '#define WI_DUNGEON_SECRET_2 42',
);

/** The columns of a shipped propMover.txt row (MI_MALE), which the tests re-use: id, name, AI and speed change. */
const MOVER_CELLS = tabs(
  'MI_MALE IDS_PROPMOVER_TXT_000002 AII_MOVER 10 10 10 10 10 10 = BELLI_PEACEFUL = = 65 = = 1 = = = = = = = = = = = = = = = = = = = = 0 130 0 = 0 0 = 0.1 = 0 = = = 0 0 0 0 0 0 = = = = = = 0 0 = = 0 II_WEA_HAN_HAND VT_ITEM = = = = = = = = SND_ITEM_ANIMAL SND_PC_DMGWANB = = = IDS_PROPMOVER_TXT_000003',
).split('\t');
const moverRow = (id: string, name: string, ai: string, speed: string, flying = '0'): string => {
  const cells = [...MOVER_CELLS];
  cells[0] = id;
  cells[1] = name;
  cells[2] = ai;
  cells[44] = speed;
  cells[46] = flying; // dwFlying
  return cells.join('\t');
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

const entry = (name: string, id: string, modelType: string, part = '""'): string =>
  `  "${name}" ${id} ${modelType} ${part} 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1`;

const MDL_DYNA = script(
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
    moverRow('MI_AIBATT1', 'IDS_PROPMOVER_TXT_000006', 'AII_MONSTER', '0.075'),
    moverRow('MI_ORPHAN', 'IDS_PROPMOVER_TXT_000008', 'AII_MONSTER', '0.2', '1'),
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
    itemRow('505', 'IDS_PROPITEM_TXT_000793', '='),
  ),
  'mdlObj.inc': MDL_OBJ,
  'mdlDyna.inc': MDL_DYNA,
  'character.txt.txt': script(
    'IDS_CHARACTER_INC_000001\tMikyel',
    'IDS_CHARACTER_INC_000002\tLuda',
    'IDS_CHARACTER_INC_000003\tMikyel the Second',
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
];

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

  /** Lays out the fixture client, `packed` replacing or removing (undefined) some of its pack files. */
  async function client(packed: Record<string, string | undefined> = {}): Promise<void> {
    const files = { ...PACKED, ...packed };
    await writeFakeClient(root, {
      packed: Object.entries(files).flatMap(([name, content]) =>
        content === undefined ? [] : [{ name, data: text(content) }],
      ),
      loose: Object.fromEntries(CHR_FILES.map((file) => [file, 'not read'])),
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

  it('runs last among the default stages', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(['textures', 'models', 'worlds', 'data']);
  });

  it('writes the six catalogs, each once, under its hashed name', async () => {
    await client();
    const run = await runData();
    expect(run.report.failures).toEqual([]);

    expect(Object.values(GAME_DATA_KEYS).sort()).toEqual([
      'data/honorTitles.json',
      'data/items.json',
      'data/movers.json',
      'data/nameColors.json',
      'data/npcs.json',
      'data/worlds.json',
    ]);
    for (const key of Object.values(GAME_DATA_KEYS)) {
      expect(run.writer.pathOf(key), key).toMatch(/^data\/[a-zA-Z]+\.[0-9a-f]{10}\.json$/);
    }
    expect(run.report.kinds.data).toMatchObject({ ok: 6, failed: 0 });

    // movers: by index; a player body has no model; the speed is the table's
    expect(await catalog<WebMover[]>(run, GAME_DATA_KEYS.movers)).toEqual([
      {
        index: 11,
        name: 'Male',
        speed: 0.1,
        ai: 1,
        flying: false,
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
      { index: 21, name: 'Orphan', speed: 0.2, ai: 2, flying: true, model: null, skeleton: null, motions: {} },
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
      { key: 'MaFl_Luda', name: 'Luda' },
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
    expect(orphan).toEqual({ index: 21, name: 'Orphan', speed: 0.2, ai: 2, flying: true, model: null, skeleton: null, motions: {} });
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
    expect(run.report.kinds.data).toMatchObject({ ok: 5, failed: 1 });
  });

  it('a World.inc that cannot be read fails the worlds catalog with its name, the others are written', async () => {
    await client({ 'World.inc': script('WI_WORLD_TEST "WdTest"', 'WI_WORLD_MADRIGAL SetTitle ( IDS_WORLD_INC_000001 );') });
    const run = await runData();
    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'data', source: 'World.inc' });
    expect(run.writer.pathOf(GAME_DATA_KEYS.worlds)).toBeUndefined();
    expect(run.writer.pathOf(GAME_DATA_KEYS.honorTitles)).toBeDefined();
    expect(run.report.kinds.data).toMatchObject({ ok: 5, failed: 1 });
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
