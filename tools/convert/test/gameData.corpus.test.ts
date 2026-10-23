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
  readCharacterInc,
  readHonorTitles,
  readModelIndex,
  readPropItem,
  readPropMover,
  webName,
} from '@flyffweb/formats';
import type { ModelElem, WebHonorTitles, WebItemModel, WebMover, WebNameColors, WebNpc } from '@flyffweb/formats';
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
    const patterns = ['mvr_male*', 'mvr_female*', 'mvr_aibatt*', 'part_mvag01upper', 'part_fvag01upper', twoSex.male, twoSex.female];
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

  it('writes the five catalogs without a failure, and the index lists them', () => {
    expect(report.failures).toEqual([]);
    expect(report.kinds.data).toMatchObject({ ok: 5, failed: 0 });
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
});
