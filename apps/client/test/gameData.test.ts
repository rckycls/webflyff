import { describe, expect, it } from 'vitest';
import { GAME_DATA_KEYS, WORLD_NO_FLY_KEY } from '@flyffweb/formats';
import type { WebExpRow, WebItemProp, WebJob, WebMover, WebSkill } from '@flyffweb/formats';
import { GameDataMissingError, loadGameData } from '../src/world/gameData';
import { catalogFiles, storeOf } from './helpers/gameDataFiles';

/** The Wooden Sword as the converter writes it. */
const WOODEN_SWORD: WebItemProp = {
  id: 21, name: 'Wooden Sword', packMax: 1, kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, abilityMin: 3, abilityMax: 4,
  weaponType: 1, attackSpeed: Math.fround(0.085), attackRange: 1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1],
  sfxHit: 20, model: 'models/item_weaswowooden.glb', icon: 'ui/item/itm_weaswowooden.png',
};

const VAGRANT: WebJob = {
  name: 'JOB_VAGRANT', attackSpeed: 75, factorMaxHP: Math.fround(0.9), factorMaxMP: Math.fround(0.3),
  factorMaxFP: Math.fround(0.3), factorDef: 1, factorHPRecovery: Math.fround(1.2), factorMPRecovery: 0.5,
  factorFPRecovery: 0.5, meleeSWD: 4.5, meleeAXE: 5.5, meleeSTAFF: Math.fround(0.8), meleeSTICK: 3, meleeKNUCKLE: 5,
  magicWAND: 6, blocking: Math.fround(0.2), meleeYOYO: Math.fround(4.2), critical: 1, title: 'Vagrant',
};

/** Clean Hit as the converter writes it: Flurry and Over Cut are the same with their own numbers. */
const CLEAN_HIT: WebSkill = {
  id: 1, name: 'Clean Hit', description: 'A powerful, downward strike.', jobType: 0, job: 0, handed: 1, attackRange: 1,
  reqLevel: 3, reqSkills: [], useMotion: 1000, sfxHit: 201, exeTarget: 17, useChance: 4, skillType: 2, evildoing: -1,
  maxLevel: 2, comboStyle: 1, icon: 'ui/skill_vagonecleanh.png',
  levels: [
    { reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1 },
    { reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1 },
  ],
};

/** The catalogs added for combat and skills: an asset index written before them lacks these keys. */
const NEW_KEYS = [
  GAME_DATA_KEYS.itemProps,
  GAME_DATA_KEYS.jobs,
  GAME_DATA_KEYS.exp,
  GAME_DATA_KEYS.texts,
  GAME_DATA_KEYS.effectsIndex,
  GAME_DATA_KEYS.skills,
];

describe('loadGameData: the combat catalogs', () => {
  it('reads every catalog, each key once', async () => {
    const store = storeOf(catalogFiles());
    await loadGameData(store);
    expect(store.asked.sort()).toEqual(Object.values(GAME_DATA_KEYS).sort());
    expect(store.asked).toHaveLength(Object.values(GAME_DATA_KEYS).length);
    for (const key of NEW_KEYS) expect(store.asked, key).toContain(key);
  });

  it('without worldNoFly every world allows flight (Piece 7 M5)', async () => {
    const store = storeOf(catalogFiles());
    expect((await loadGameData(store)).noFlyWorlds.size).toBe(0);
    expect(store.asked).not.toContain(WORLD_NO_FLY_KEY);
  });

  it('worldNoFly names the worlds without flight (Piece 7 M5)', async () => {
    const data = await loadGameData(storeOf(catalogFiles({ [WORLD_NO_FLY_KEY]: [203, 41] })));
    expect([...data.noFlyWorlds].sort((a, b) => a - b)).toEqual([41, 203]);
  });

  it('itemProps are looked up by item id', async () => {
    const other: WebItemProp = { ...WOODEN_SWORD, id: 22, name: 'Bat', model: null, icon: null, sfxHit: -1 };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.itemProps]: [WOODEN_SWORD, other] })));
    expect([...data.itemProps.keys()]).toEqual([21, 22]); // numbers, in file order
    expect(data.itemProps.get(21)).toEqual(WOODEN_SWORD);
    expect(data.itemProps.get(21)!.attackSpeed).toBe(Math.fround(0.085));
    expect(data.itemProps.get(22)).toMatchObject({ name: 'Bat', model: null, icon: null });
    expect(data.itemProps.has(23)).toBe(false);
  });

  it('an itemProps.json from before the converter kept dwPackMax reads it as 1: one to a slot, nothing counted', async () => {
    const { packMax: _dropped, ...older } = WOODEN_SWORD;
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.itemProps]: [older] })));
    expect(data.itemProps.get(21)!.packMax).toBe(1);
    const stacked = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.itemProps]: [{ ...WOODEN_SWORD, packMax: 99 }] })));
    expect(stacked.itemProps.get(21)!.packMax).toBe(99);
  });

  it('a repeated item id keeps the later row, as CFixedArray::SetAtGrow does', async () => {
    const later = { ...WOODEN_SWORD, name: 'Later' };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.itemProps]: [WOODEN_SWORD, later] })));
    expect(data.itemProps.size).toBe(1);
    expect(data.itemProps.get(21)!.name).toBe('Later');
  });

  it('jobs are the rows in JOB_* order, so jobs[job] is the job', async () => {
    const mercenary: WebJob = { ...VAGRANT, name: 'JOB_MERCENARY', attackSpeed: 80, title: 'Mercenary' };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.jobs]: [VAGRANT, mercenary] })));
    expect(data.jobs).toEqual([VAGRANT, mercenary]);
    expect(data.jobs[1]!.name).toBe('JOB_MERCENARY');
    expect(data.jobs[1]!.title).toBe('Mercenary');
  });

  it("a jobs.json from before the converter kept the job's name (etc.inc) reads it as empty", async () => {
    const { title: _dropped, ...older } = VAGRANT;
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.jobs]: [older] })));
    expect(data.jobs[0]).toEqual({ ...older, title: '' });
  });

  it('exp parses the 64-bit columns back to bigint, past 2^53 too', async () => {
    const rows: WebExpRow[] = [
      { exp1: '0', exp2: '0', lpPoint: 0, limitExp: '0' },
      { exp1: '14', exp2: '1', lpPoint: 2, limitExp: '18' },
      { exp1: '369857717768', exp2: '0', lpPoint: 5, limitExp: '9007199254740993' },
    ];
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.exp]: rows })));
    expect(data.exp).toEqual([
      { exp1: 0n, exp2: 0n, lpPoint: 0, limitExp: 0n },
      { exp1: 14n, exp2: 1n, lpPoint: 2, limitExp: 18n },
      { exp1: 369857717768n, exp2: 0n, lpPoint: 5, limitExp: 9007199254740993n },
    ]);
    expect(typeof data.exp[2]!.limitExp).toBe('bigint');
  });

  it('texts are looked up by TID name, with the name as the entry id and the number defineText.h gives it', async () => {
    const data = await loadGameData(storeOf(catalogFiles({
      [GAME_DATA_KEYS.texts]: {
        TID_GAME_DEATH: { text: 'Press ESC and go back to Lodestar(Town).', color: 0xff00ffff, textId: 602 },
        // a texts.json written before the converter kept the numbers has none
        TID_GAME_LEVELUP: { text: 'Level up!', color: 0xffffff00 },
      },
    })));
    expect([...data.texts.keys()]).toEqual(['TID_GAME_DEATH', 'TID_GAME_LEVELUP']);
    expect(data.texts.get('TID_GAME_DEATH')).toEqual({
      id: 'TID_GAME_DEATH', text: 'Press ESC and go back to Lodestar(Town).', color: 0xff00ffff, textId: 602,
    });
    expect(data.texts.get('TID_GAME_LEVELUP')).toEqual({ id: 'TID_GAME_LEVELUP', text: 'Level up!', color: 0xffffff00 });
    expect(data.texts.get('TID_GAME_LEVELUP')).not.toHaveProperty('textId');
    expect(data.texts.get('TID_NOT_THERE')).toBeUndefined();
  });

  it('skills are looked up by skill id, with their levels', async () => {
    const flurry: WebSkill = {
      ...CLEAN_HIT, id: 2, name: 'Flurry', reqLevel: 5, reqSkills: [{ skill: 1, level: 3 }], useMotion: 1001, comboStyle: 2,
    };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.skills]: [CLEAN_HIT, flurry] })));
    expect([...data.skills.keys()]).toEqual([1, 2]); // numbers, in file order
    expect(data.skills.get(1)).toEqual(CLEAN_HIT);
    expect(data.skills.get(2)!.reqSkills).toEqual([{ skill: 1, level: 3 }]);
    expect(data.skills.get(1)!.levels[0]).toEqual({ reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1 });
    expect(data.skills.get(3)).toBeUndefined();
  });

  it('effects are looked up by the XI number', async () => {
    const data = await loadGameData(storeOf(catalogFiles({
      [GAME_DATA_KEYS.effectsIndex]: {
        '20': { effect: 'effects/sfx_hitsword01.json', scale: 1 },
        '42': { effect: 'effects/sfx_genlevelup01.json', scale: 1 },
      },
    })));
    expect([...data.effects.keys()]).toEqual([20, 42]); // numbers, not the JSON's text
    expect(data.effects.get(42)).toEqual({ effect: 'effects/sfx_genlevelup01.json', scale: 1 });
    expect(data.effects.get(43)).toBeUndefined();
  });

  it('a mover keeps its fight columns', async () => {
    const aibatt: WebMover = {
      index: 20, name: 'Small Aibatt', speed: 0.075, ai: 2, flying: false, level: 1, addHp: 120, expValue: 2, rank: 0,
      belligerence: 2, killable: 1, hideLevel: -1, element: 0, atk1: 9000, model: null, skeleton: null, motions: {},
    };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.movers]: [aibatt] })));
    expect(data.movers.get(20)).toEqual(aibatt);
  });

  it('a mover of a movers.json from before the converter kept dwAtk1 attacks with no item (NULL_ID, -1)', async () => {
    const older = {
      index: 20, name: 'Small Aibatt', speed: 0.075, ai: 2, flying: false, level: 1, addHp: 120, expValue: 2, rank: 0,
      belligerence: 2, killable: 1, hideLevel: -1, element: 0, model: null, skeleton: null, motions: {},
    };
    const data = await loadGameData(storeOf(catalogFiles({ [GAME_DATA_KEYS.movers]: [older] })));
    expect(data.movers.get(20)?.atk1).toBe(-1);
  });

  it.each(NEW_KEYS)('%s missing from the asset index means game files from an older version, and nothing is fetched', async (key) => {
    const files = catalogFiles();
    delete files[key];
    const store = storeOf(files);
    const failure = await loadGameData(store).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameDataMissingError);
    expect((failure as GameDataMissingError).keys).toEqual([key]);
    expect((failure as Error).message).toContain(key);
    expect(store.asked).toEqual([]);
  });

  it('names every new catalog an old index lacks, in one error', async () => {
    const files = catalogFiles();
    for (const key of NEW_KEYS) delete files[key];
    const failure = await loadGameData(storeOf(files)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameDataMissingError);
    expect((failure as GameDataMissingError).keys).toEqual(NEW_KEYS);
  });

  it('a new catalog that is listed and cannot be fetched fails with the download error, not the out-of-date one', async () => {
    const files = catalogFiles();
    delete files[GAME_DATA_KEYS.texts];
    const failure = await loadGameData(storeOf(files, [GAME_DATA_KEYS.texts])).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GameDataMissingError);
    expect((failure as Error).message).toBe(`no ${GAME_DATA_KEYS.texts}`);
  });
});
