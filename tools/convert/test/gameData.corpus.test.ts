// The game-data stage on the real client folder. A corpus test (`npm run test:corpus -- gameData`): it needs the
// client, and converts the few models, skeletons and motions the checks look at with the models stage into a temp
// folder first (the whole client would take minutes). The stage's rules are unit-tested on a hand-made client in
// gameDataStage.test.ts.

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  GAME_DATA_KEYS,
  OT,
  decodeScript,
  loadDefines,
  loadStrings,
  modelFileName,
  readCharacterInc,
  readExpTable,
  readHonorTitles,
  readModelIndex,
  readPropItem,
  readPropJob,
  readPropMover,
  readTextClient,
  readWorldInc,
  webName,
} from '@flyffweb/formats';
import type {
  JobProp,
  ModelElem,
  WebEffectsIndex,
  WebExpRow,
  WebHonorTitles,
  WebItemModel,
  WebItemProp,
  WebMover,
  WebNameColors,
  WebNpc,
  WebTexts,
  WebWorlds,
} from '@flyffweb/formats';
import { clientRoot, describeClient, loadClientPacks } from '../../../packages/formats/test/helpers/client';
import { ClientFs } from '../src/ClientFs';
import { gameDataStage } from '../src/data/gameDataStage';
import { modelsStage } from '../src/models/modelsStage';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { makeTempDir } from './helpers/fakeClient';
import type { ReportJson } from './helpers/worldRun';

describeClient('the game-data stage on the real client', () => {
  const packs = loadClientPacks();
  const defines = loadDefines(packs);
  const strings = loadStrings(packs);
  const script = (name: string): string => decodeScript(packs.read(name));
  const dyna = readModelIndex(script('mdlDyna.inc'), defines, 'mdlDyna.inc');
  const moverElem = (index: number): ModelElem => dyna.find((e) => e.type === OT.MOVER && e.id === index)!;

  /** An item whose part has a slash and whose two part models are in the client. Chosen in `beforeAll`. */
  let twoSex: { id: number; male: string; female: string };

  let out: string;
  let client: ClientFs;
  let writer: AssetWriter;
  let report: ReportJson;
  let movers: WebMover[];
  let items: WebItemModel[];
  let npcs: WebNpc[];

  const catalog = async <T>(key: string): Promise<T> => {
    const hashed = writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    return JSON.parse(await fs.readFile(path.join(out, ...hashed!.split('/')), 'utf8')) as T;
  };

  beforeAll(async () => {
    out = await makeTempDir('flyffweb-data-real-');
    client = await ClientFs.open(clientRoot()!);
    writer = new AssetWriter(out);
    const rep = new Report();

    const props = new Map(readPropItem(script('propItem.txt'), defines, strings, 'propItem.txt').map((p) => [p.id, p]));
    const slashed = dyna.find((e) => {
      if (e.type !== OT.ITEM || !e.part.includes('/') || !props.has(e.id)) return false;
      return e.part.split('/').every((half) => client.find('Model', `part_${half}.o3d`) !== null);
    })!;
    const [maleName, femaleName] = slashed.part.split('/') as [string, string];
    twoSex = { id: slashed.id, male: `part_${maleName}`, female: `part_${femaleName}` };

    // the earlier stages' work for the checks: the player skeletons and motions, a monster, and three part models
    const patterns = [
      'mvr_male*', 'mvr_female*', 'mvr_aibatt*', 'part_mvag01upper', 'part_fvag01upper', twoSex.male, twoSex.female,
      'item_weaswowooden',
    ];
    for (const only of patterns) {
      const ctx: StageContext = { client, writer, report: rep, only, jobs: 4, outDir: out };
      await modelsStage.run(ctx);
    }

    const ctx: StageContext = { client, writer, report: rep, jobs: 4, outDir: out };
    await gameDataStage.run(ctx);
    await rep.write(out);
    report = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson;

    movers = await catalog<WebMover[]>(GAME_DATA_KEYS.movers);
    items = await catalog<WebItemModel[]>(GAME_DATA_KEYS.items);
    npcs = await catalog<WebNpc[]>(GAME_DATA_KEYS.npcs);
  }, 600000);

  afterAll(async () => {
    if (out !== undefined) await fs.rm(out, { recursive: true, force: true });
  });

  it('writes the eleven catalogs without a failure, and the index lists them', () => {
    expect(report.failures).toEqual([]);
    expect(report.kinds.data).toMatchObject({ ok: 11, failed: 0 });
    expect(Object.values(GAME_DATA_KEYS)).toHaveLength(11);
    for (const key of Object.values(GAME_DATA_KEYS)) expect(writer.pathOf(key), key).toMatch(/^data\//);
  });

  it('gives MI_MALE the skeleton skeletons/mvr_male.glb, and motion 0 (MTI_STAND) a motions/mvr_male/ key that exists in the index', async () => {
    const maleId = defines.get('MI_MALE')!;
    const male = movers.find((m) => m.index === maleId)!;
    expect(male.name).toBe('Male');
    expect(male.speed).toBeGreaterThan(0);
    expect(male.model).toBeNull(); // assembled from parts
    expect(male.skeleton).toBe('skeletons/mvr_male.glb');
    expect(writer.pathOf(male.skeleton!)).toBeDefined();

    // MakeMotionName, from mdlDyna.inc: "mvr_", the mover's name, "_", the motion text, ".ani"
    const stand = defines.get('MTI_STAND')!;
    expect(stand).toBe(0);
    const elem = moverElem(maleId);
    const text = elem.motions.find((m) => m.id === stand)!.name;
    expect(text).not.toContain('_');
    const ani = `mvr_${elem.name}_${text}.ani`; // mvr_male_GenStand.ani
    expect(client.find('Model', ani), ani).not.toBeNull();
    const key = `motions/mvr_male/${webName(ani.replace(/\.ani$/, ''))}.glb`;
    expect(male.motions['0']).toBe(key);
    expect(key).toMatch(/^motions\/mvr_male\//);
    const hashed = writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    const glb = readFileSync(path.join(out, ...hashed!.split('/')));
    expect(glb.subarray(0, 4).toString('latin1')).toBe('glTF');
  });

  it('keeps exactly the listed motions whose file the client has (MI_MALE, MI_FEMALE and a monster)', () => {
    for (const index of [defines.get('MI_MALE')!, defines.get('MI_FEMALE')!, defines.get('MI_AIBATT1')!]) {
      const mover = movers.find((m) => m.index === index)!;
      const elem = moverElem(index);
      expect(Object.keys(mover.motions).length, mover.name).toBeGreaterThan(10);
      for (const id of new Set(elem.motions.map((m) => m.id))) {
        const text = elem.motions.filter((m) => m.id === id).at(-1)!.name; // the last of a repeated id wins
        const ani = text.includes('_') ? `mvr_${text}.ani` : `mvr_${elem.name}_${text}.ani`;
        const exists = client.find('Model', ani) !== null;
        // every motion the client has and the models stage converted is kept; a file the client lacks cannot be
        if (exists) expect(mover.motions[String(id)], `${mover.name} motion ${id} ${ani}`).toBeDefined();
        else expect(mover.motions[String(id)], `${mover.name} motion ${id} ${ani}`).toBeUndefined();
      }
    }
  });

  it('gives a monster its model, skeleton and motions', () => {
    const aibatt = movers.find((m) => m.index === defines.get('MI_AIBATT1'))!;
    expect(aibatt.name).toBe('Small Aibatt');
    expect(aibatt.speed).toBeCloseTo(0.075, 6);
    expect(aibatt.ai).toBe(defines.get('AII_MONSTER'));
    expect(aibatt.model).toBe('models/mvr_aibatt.glb');
    expect(aibatt.skeleton).toBe('skeletons/mvr_aibatt.glb');
    expect(aibatt.motions['0']).toBe('motions/mvr_aibatt/mvr_aibatt_stand.glb');
    for (const key of [aibatt.model!, aibatt.skeleton!, ...Object.values(aibatt.motions)]) {
      expect(writer.pathOf(key), key).toBeDefined();
    }
  });

  it('lists every mover of propMover.txt by index, and every key it names was converted', () => {
    const props = readPropMover(script('propMover.txt'), defines, strings, 'propMover.txt');
    expect(movers.map((m) => m.index)).toEqual(props.map((p) => p.index).sort((a, b) => a - b));
    expect(movers.length).toBeGreaterThan(700);
    const byIndex = new Map(props.map((p) => [p.index, p]));
    for (const mover of movers) {
      expect(mover.name).toBe(byIndex.get(mover.index)!.name);
      expect(mover.speed).toBe(byIndex.get(mover.index)!.speed);
      expect(mover.ai).toBe(byIndex.get(mover.index)!.ai);
      expect(mover.flying).toBe(byIndex.get(mover.index)!.flying);
      for (const key of [mover.model, mover.skeleton, ...Object.values(mover.motions)]) {
        if (key !== null) expect(writer.pathOf(key), `${mover.name}: ${key}`).toBeDefined();
      }
    }
    // only the models the test converted exist, so the other movers have a null model: but never a wrong one
    const withModel = movers.filter((m) => m.model !== null);
    expect(withModel.length).toBeGreaterThan(0);
    for (const mover of withModel) expect(mover.model, mover.name).toMatch(/^models\/mvr_aibatt/);
  });

  it('lists the items that have a part: id, body slot, and the part model of each sex', () => {
    const props = new Map(readPropItem(script('propItem.txt'), defines, strings, 'propItem.txt').map((p) => [p.id, p]));
    const withPart = dyna.filter((e) => e.type === OT.ITEM && e.part !== '' && props.has(e.id));
    expect(items.map((i) => i.id)).toEqual(withPart.map((e) => e.id).sort((a, b) => a - b));
    expect(items.length).toBeGreaterThan(1000);
    for (const item of items) {
      expect(item.part).toBe(props.get(item.id)!.parts);
      expect(item.exclusive).toBe(props.get(item.id)!.exclusive);
      expect(item.baseIgnore).toBe(props.get(item.id)!.baseIgnore);
    }

    // a part with a slash: the text before it for a man, after it for a woman
    const two = items.find((i) => i.id === twoSex.id)!;
    expect(two.male).toBe(`models/${webName(twoSex.male)}.glb`);
    expect(two.female).toBe(`models/${webName(twoSex.female)}.glb`);
    expect(two.male).not.toBe(two.female);
    expect(writer.pathOf(two.male!)).toBeDefined();
    expect(writer.pathOf(two.female!)).toBeDefined();

    // Cotton Suit (II_ARM_M_VAG_SUIT01) and Cream Suit (a woman's): one name each, the same for both sexes
    const suit = items.find((i) => i.id === defines.get('II_ARM_M_VAG_SUIT01'))!;
    expect(suit).toEqual({
      id: 502,
      part: defines.get('PARTS_UPPER_BODY'),
      exclusive: defines.get('PARTS_LOWER_BODY'),
      baseIgnore: -1,
      male: 'models/part_mvag01upper.glb',
      female: 'models/part_mvag01upper.glb',
    });
    expect(items.find((i) => i.id === 504)!.female).toBe('models/part_fvag01upper.glb');
    expect(writer.pathOf('models/part_fvag01upper.glb')).toBeDefined();
  });

  it('lists the characters, the name colours and the honour titles', async () => {
    const files = ['character.inc', 'character-etc.inc', 'character-school.inc'];
    const keys = new Set(files.flatMap((f) => readCharacterInc(script(f), defines, strings, f).map((c) => c.key.toLowerCase())));
    expect(npcs).toHaveLength(keys.size);
    expect(new Set(npcs.map((n) => n.key.toLowerCase())).size).toBe(npcs.length);
    expect(npcs.find((n) => n.key === 'MaFl_Mikyel')?.name).toBe('Mikyel');

    expect(await catalog<WebNameColors>(GAME_DATA_KEYS.nameColors)).toEqual({
      general: 0xffffffff,
      chaotic: 0xffff0000,
      ready: 0xffffc0cb,
    });

    const titles = readHonorTitles(script('honorList.txt'), defines, strings, 'honorList.txt');
    const honor = await catalog<WebHonorTitles>(GAME_DATA_KEYS.honorTitles);
    expect(Object.keys(honor)).toHaveLength(titles.size);
    expect(honor['0']).toBe('Master Collector');
    expect(honor['-1']).toBeUndefined();
  });

  it('maps each world id of World.inc to the web folder the worlds stage writes for it', async () => {
    const worlds = await catalog<WebWorlds>(GAME_DATA_KEYS.worlds);
    const listed = readWorldInc(script('World.inc'), defines, 'World.inc');
    expect(Object.keys(worlds)).toHaveLength(new Set(listed.map((world) => world.id)).size);
    expect(Object.keys(worlds).length).toBeGreaterThan(50);
    for (const world of listed) expect(worlds[String(world.id)], `world ${world.id}`).toBe(webName(world.fileName));

    // WI_WORLD_MADRIGAL is the world a new character starts in: WdMadrigal, converted as worlds/wdmadrigal/
    const madrigal = defines.get('WI_WORLD_MADRIGAL')!;
    expect(madrigal).toBe(1);
    expect(worlds[String(madrigal)]).toBe('wdmadrigal');
    // WI_DUNGEON_SECRET_1 to _16 are instances of one folder
    expect(worlds[String(defines.get('WI_DUNGEON_SECRET_1'))]).toBe('wdheaven06_1');
    expect(worlds[String(defines.get('WI_DUNGEON_SECRET_16'))]).toBe('wdheaven06_1');

    // every folder the worlds stage converts (a folder of World/ that holds a .wld) is the folder of some world id
    const worldsDir = client.find('', 'World')!;
    const folders = [...new Set(client.list('World', /\.wld$/i, true).map((wld) => path.dirname(wld)))]
      .filter((folder) => path.dirname(folder) === worldsDir)
      .map((folder) => path.basename(folder));
    expect(folders.length).toBeGreaterThan(30);
    expect(folders).toContain('WdMadrigal');
    const named = new Set(Object.values(worlds));
    const unnamed = folders.filter((folder) => !named.has(webName(folder)));
    if (unnamed.length > 0) {
      console.warn(`world folders converted but with no world id in World.inc, so Neuz cannot open them by id: ${unnamed.join(', ')}`);
    }
    // defineWorld.h has WI_DUNGEON_SM_IVILIS (231) for WdIvilisTemple, but World.inc has no line for it
    expect(unnamed).toEqual(['WdIvilisTemple']);
  });

  // ---- the catalogs the fight reads ---------------------------------------------------------------------------------

  it('gives every mover its fight columns, as propMover.txt has them', () => {
    const props = new Map(readPropMover(script('propMover.txt'), defines, strings, 'propMover.txt').map((p) => [p.index, p]));
    for (const mover of movers) {
      const prop = props.get(mover.index)!;
      const fight = {
        level: prop.level, addHp: prop.addHp, expValue: prop.expValue, rank: prop.rank,
        belligerence: prop.belligerence, killable: prop.killable, hideLevel: prop.hideLevel, element: prop.element,
      };
      expect(mover, `mover ${mover.index} ${mover.name}`).toMatchObject(fight);
    }
    // the Small Aibatt, the first monster of the Vagrant's road
    const aibatt = movers.find((m) => m.index === defines.get('MI_AIBATT1'))!;
    expect(aibatt).toMatchObject({ level: 1, addHp: 120, expValue: 2 });
    expect(movers.every((m) => Number.isSafeInteger(m.expValue))).toBe(true);
  });

  it('itemProps: every item of propItem.txt once, with the columns the fight reads', async () => {
    const itemProps = await catalog<WebItemProp[]>(GAME_DATA_KEYS.itemProps);
    // a repeated id keeps the last row (CFixedArray::SetAtGrow)
    const rows = new Map(readPropItem(script('propItem.txt'), defines, strings, 'propItem.txt').map((p) => [p.id, p]));
    expect(itemProps.map((p) => p.id)).toEqual([...rows.keys()].sort((a, b) => a - b));
    expect(itemProps.length).toBeGreaterThan(5000);
    for (const prop of itemProps) {
      const row = rows.get(prop.id)!;
      expect(prop, `item ${prop.id} ${row.name}`).toMatchObject({
        name: row.name, kind1: row.kind1, kind2: row.kind2, kind3: row.kind3, handed: row.handed, part: row.parts,
        abilityMin: row.abilityMin, abilityMax: row.abilityMax, weaponType: row.weaponType, attackSpeed: row.attackSpeed,
        attackRange: row.attackRange, destParams: row.destParams, adjParams: row.adjParams, sfxHit: row.sfxObj3,
      });
      // the icon is the file the table names, as the UI stage writes it
      expect(prop.icon, `item ${prop.id} ${row.name}`).toBe(
        row.icon === '' ? null : `ui/${webName(row.icon.replace(/\.[^.]*$/, ''))}.png`,
      );
    }
    expect(itemProps.filter((p) => p.icon === null).length).toBeGreaterThan(100);
    expect(itemProps.filter((p) => p.icon !== null).length).toBeGreaterThan(4900);
  });

  it('itemProps: the Wooden Sword has the float attack speed, the sword hit effect and the converted item model', async () => {
    const itemProps = await catalog<WebItemProp[]>(GAME_DATA_KEYS.itemProps);
    const sword = itemProps.find((p) => p.id === defines.get('II_WEA_SWO_WOODEN'))!;
    expect(sword.name).toBe('Wooden Sword');
    expect(sword.attackSpeed).toBe(Math.fround(0.085)); // 0.085 is not a float; the table's token is read as one
    expect(sword.attackSpeed).not.toBe(0.085);
    expect(sword.sfxHit).toBe(defines.get('XI_HIT_SWORD01'));
    expect(sword.sfxHit).toBeGreaterThan(0);
    expect(sword).toMatchObject({ part: defines.get('PARTS_RWEAPON'), weaponType: defines.get('WT_MELEE_SWD'), abilityMin: 3, abilityMax: 4 });

    // item_WeaSwoWooden.o3d, from the OT_ITEM entry (no part), through the name rule of the item part models
    const entry = dyna.find((e) => e.type === OT.ITEM && e.id === sword.id)!;
    expect(entry.part).toBe('');
    expect(modelFileName(entry)).toBe('item_WeaSwoWooden.o3d');
    expect(sword.model).toBe('models/item_weaswowooden.glb');
    expect(writer.pathOf(sword.model!)).toBeDefined();
    expect(sword.icon).toBe('ui/itm_weaswowooden.png');
  });

  it("itemProps: a model is a held item's (an OT_ITEM entry with no part), and only the converted ones are named", async () => {
    const itemProps = await catalog<WebItemProp[]>(GAME_DATA_KEYS.itemProps);
    const entries = new Map(dyna.filter((e) => e.type === OT.ITEM).map((e) => [e.id, e]));
    for (const prop of itemProps) {
      const entry = entries.get(prop.id);
      if (entry === undefined || entry.part !== '') {
        expect(prop.model, `item ${prop.id} ${prop.name}`).toBeNull(); // no entry, or a worn part: the parts catalog has it
      } else if (prop.model !== null) {
        expect(prop.model).toBe(`models/${webName(modelFileName(entry).replace(/\.o3d$/i, ''))}.glb`);
        expect(writer.pathOf(prop.model), prop.model).toBeDefined();
      }
    }
    // the test converts one held model; the rest are named null, and the report says how many
    expect(itemProps.filter((p) => p.model !== null).map((p) => p.model)).toEqual(['models/item_weaswowooden.glb']);
    const warning = report.warnings.find((w) => w.kind === 'data' && w.message.includes('held'));
    expect(warning).toBeDefined();
  });

  it('jobs: the 32 rows of propJob.inc in JOB_* order', async () => {
    const jobs = await catalog<JobProp[]>(GAME_DATA_KEYS.jobs);
    expect(jobs).toEqual(readPropJob(script('propJob.inc'), 'propJob.inc', defines));
    expect(jobs).toHaveLength(32);
    expect(jobs[defines.get('JOB_VAGRANT')!]).toMatchObject({ name: 'JOB_VAGRANT', attackSpeed: 75, factorMaxHP: Math.fround(0.9) });
  });

  it('exp: the 200 rows of the EXP table, the 64-bit columns as exact text', async () => {
    const exp = await catalog<WebExpRow[]>(GAME_DATA_KEYS.exp);
    expect(exp).toHaveLength(200);
    expect(exp.map((row) => ({ exp1: BigInt(row.exp1), exp2: BigInt(row.exp2), lpPoint: row.lpPoint, limitExp: BigInt(row.limitExp) })))
      .toEqual(readExpTable(script('ExpTable.inc'), 'ExpTable.inc'));
    expect(exp[2]).toMatchObject({ exp1: '14', lpPoint: 2 });
    expect(exp[16]!.exp1).toBe('2340');
    expect(exp[199]!.exp1).toBe('369857717768'); // past 32 bits
    expect(typeof exp[199]!.limitExp).toBe('string');
  });

  it('texts: every TID with a text, with its colour', async () => {
    const texts = await catalog<WebTexts>(GAME_DATA_KEYS.texts);
    const read = readTextClient(script('textClient.inc'), strings, 'textClient.inc');
    expect(Object.keys(texts)).toEqual([...read.keys()]);
    expect(Object.keys(texts).length).toBeGreaterThan(2000);
    for (const [id, entry] of read) expect(texts[id], id).toEqual({ text: entry.text, color: entry.color });
    expect(texts.TID_GAME_DEATH).toEqual({ text: read.get('TID_GAME_DEATH')!.text, color: 0xff00ffff });
    expect(texts.TID_GAME_DEATH!.text).toContain('Press ESC');
  });

  it('effectsIndex: every OT_SFX entry of mdlDyna.inc, by its XI id, to the effect file the effects stage writes', async () => {
    const index = await catalog<WebEffectsIndex>(GAME_DATA_KEYS.effectsIndex);
    const sfx = dyna.filter((e) => e.type === OT.SFX && e.modelType === 4);
    expect(sfx.length).toBe(652);
    expect(Object.keys(index)).toHaveLength(new Set(sfx.map((e) => e.id)).size);
    for (const elem of sfx) {
      // sfx_<name>.sfx (the name rule of CModelMng::MakeModelName), the web name of its stem; the scale is the fScale float
      expect(index[String(elem.id)], `XI ${elem.id} ${elem.name}`).toEqual({
        effect: `effects/${webName(modelFileName(elem))}.json`,
        scale: Math.fround(elem.extra[3]!),
      });
    }
    for (const entry of Object.values(index)) expect(entry.effect).toMatch(/^effects\/[a-z0-9._-]+\.json$/);

    // the level-up effect (XI_GEN_LEVEL_UP01 is 42), the sword hit and the yo-yo hit, which mdlDyna.inc scales by 2
    expect(defines.get('XI_GEN_LEVEL_UP01')).toBe(42);
    expect(index['42']).toEqual({ effect: 'effects/sfx_genlevelup01.json', scale: 1 });
    expect(index[String(defines.get('XI_HIT_SWORD01'))]).toEqual({ effect: 'effects/sfx_hitsword01.json', scale: 1 });
    expect(index[String(defines.get('XI_HIT_YOY01'))]).toMatchObject({ effect: 'effects/sfx_hityoy01.json', scale: 2 });
  });
});
