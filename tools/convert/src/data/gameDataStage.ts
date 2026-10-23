// The `data` stage: the JSON catalogs the browser reads to dress and name what the world draws, built from the client's
// resource packs with the rules of the C++ loaders (the readers of @flyffweb/formats):
//
//   data/movers.json       every mover of propMover.txt, with the converted model, skeleton and motions (WebMover[])
//   data/items.json        every item that shows a part model on the body, per sex (WebItemModel[])
//   data/npcs.json         every character of character.inc and its two sister files (WebNpc[])
//   data/nameColors.json   the three player name colours of PKSetting.inc (WebNameColors)
//   data/honorTitles.json  honour id to title text of honorList.txt (WebHonorTitles)
//   data/worlds.json       world id to the web folder name of its world, from World.inc (WebWorlds)
//
// It runs after the models stage. A catalog names a model, skeleton or motion by its logical key, the way the models
// stage writes it (`webName` of the real file's base name), and only when `writer.pathOf(key)` says the file was
// converted (in this run, or listed in the index.json an earlier run left); else the entry is null, or left out of
// `motions`, with a warning. Each catalog is built on its own: one that cannot be read is reported as a failure and
// the others are still written.
//
// `--only` filters world folders and model/texture base names; this stage runs when there is no filter or when the
// glob matches the name `data` (so `--only data` runs just this stage, the others finding nothing named `data`).

import path from 'node:path';
import {
  FormatError,
  GAME_DATA_KEYS,
  OT,
  decodeScript,
  loadDefines,
  loadStrings,
  modelFileName,
  readCharacterInc,
  readHonorTitles,
  readModelIndex,
  readPkSetting,
  readPropItem,
  readPropMover,
  readWorldInc,
  webName,
} from '@flyffweb/formats';
import type {
  ItemProp,
  ModelElem,
  WebHonorTitles,
  WebItemModel,
  WebMover,
  WebNameColors,
  WebNpc,
  WebWorlds,
} from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import { skeletonOfMotion } from '../models/skeletonFor';
import type { AssetWriter } from '../output/AssetWriter';
import type { Report } from '../output/Report';
import type { Stage, StageContext } from '../run';
import { matchesOnly } from '../util';

const KIND = 'data';
const MODEL_DIR = 'Model';

/** MODELTYPE_ANIMATED_MESH (Source/_Common/Model.h:12): a model with a skeleton (`<model>.chr`) and motions. */
const MODELTYPE_ANIMATED_MESH = 2;

/** CModelMng's g_szRoot (ModelMng.cpp:5) for OT_MOVER: the start of a mover's model, skeleton and motion files. */
const MOVER_ROOT = 'mvr';
/** The root MakePartsName is given for a worn part (MoverEquip.cpp:365, `_T( "part" )`). */
const PARTS_ROOT = 'part';

/** The models of `mdlObj.inc` and `mdlDyna.inc` the catalogs read, from the packs. */
const MODEL_INDEXES = ['mdlObj.inc', 'mdlDyna.inc'];
const CHARACTER_FILES = ['character.inc', 'character-etc.inc', 'character-school.inc'];

export type Sex = 'male' | 'female';

/**
 * The file of the part model an item shows when worn, copying CModelMng::MakePartsName (ModelMng.cpp:95): the root,
 * `_`, the entry's part text (up to the first `/` for a man, after it for a woman; the whole text when it has no `/`)
 * and `.o3d`. (The C++ also takes SEX_SEXLESS and -1, which give the text with its `/`; no catalog needs that.)
 */
export function makePartsName(root: string, part: string, sex: Sex): string {
  const slash = part.indexOf('/');
  const name = slash < 0 ? part : sex === 'male' ? part.slice(0, slash) : part.slice(slash + 1);
  return `${root}_${name}.o3d`;
}

/**
 * The file of a mover's motion, copying CModelMng::MakeMotionName (ModelMng.cpp:121) for OT_MOVER: `mvr_`, then the
 * mover's name and `_` unless the motion text has an underscore of its own, then the text and `.ani`.
 *
 * An id past the end of the mover's motion list (the largest listed id plus one, CModelMng::LoadScript :410-436) or
 * NULL_ID (-1) plays `stand` (MTI_STAND); so does an id inside the list that nothing names, but only after the name
 * prefix has been added for its empty text. A repeated id keeps the last name (LoadScript overwrites it, :440-447).
 */
export function makeMotionName(elem: ModelElem, motion: number, stand = 0): string {
  const texts = new Map<number, string>();
  let largest = 0;
  for (const listed of elem.motions) {
    texts.set(listed.id, listed.name);
    if (listed.id > largest) largest = listed.id;
  }
  const count = largest + 1; // m_nMax

  const id = motion < 0 || motion >= count ? stand : motion;
  let text = texts.get(id) ?? '';
  let name = `${MOVER_ROOT}_`;
  if (!text.includes('_')) name += `${elem.name}_`;
  if (text === '') text = texts.get(stand) ?? '';
  return `${name}${text}.ani`;
}

/** `Mvr_male.o3d` -> `Mvr_male`. */
const stem = (file: string): string => file.replace(/\.[^.]*$/, '');

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** What the catalogs share. */
interface Env {
  client: ClientFs;
  writer: AssetWriter;
  report: Report;
  defines: ReadonlyMap<string, number>;
  strings: ReadonlyMap<string, string>;
  /** `<type>:<id>` to entry over mdlObj.inc and mdlDyna.inc; a later entry with the same type and id wins. */
  models(): ModelIndex;
}

interface ModelIndex {
  entries: ReadonlyMap<string, ModelElem>;
  /** Bytes of the files it was read from. */
  bytes: number;
}

/** A catalog being built: reads pack files and counts the bytes. */
class Reading {
  bytes = 0;

  constructor(private readonly client: ClientFs) {}

  text(name: string): string {
    const raw = this.client.packs.read(name);
    this.bytes += raw.length;
    return decodeScript(raw);
  }
}

/** `key` if that file was converted (in this run, or listed by the index.json of an earlier one), else null. */
const converted = (env: Env, key: string): string | null => (env.writer.pathOf(key) === undefined ? null : key);

// ---- movers ------------------------------------------------------------------------------------------------------

/** `models/<web name>.glb` of an `.o3d` file name, as the models stage writes it. */
const modelKeyOf = (o3dFile: string): string => `models/${webName(stem(o3dFile))}.glb`;

function buildMovers(env: Env, read: Reading): WebMover[] {
  const props = readPropMover(read.text('propMover.txt'), env.defines, env.strings, 'propMover.txt');
  const index = env.models();
  read.bytes += index.bytes;

  // Neuz loads the bodies of the two player movers without their mesh (CMover::LoadModel, Mover.cpp:1427)
  const playerBodies = new Set(
    ['MI_MALE', 'MI_FEMALE'].flatMap((name) => {
      const id = env.defines.get(name);
      return id === undefined ? [] : [id];
    }),
  );
  const stand = env.defines.get('MTI_STAND') ?? 0;
  const chrBases = env.client.list(MODEL_DIR, /\.chr$/i).map((file) => stem(path.basename(file)));

  const warn = (source: string, message: string): void => env.report.warn(KIND, source, message);

  return [...props]
    .sort((a, b) => a.index - b.index)
    .map((prop): WebMover => {
      const mover: WebMover = {
        index: prop.index,
        name: prop.name,
        speed: prop.speed,
        ai: prop.ai,
        model: null,
        skeleton: null,
        motions: {},
      };
      const who = `mover "${prop.name}" (index ${prop.index})`;
      const elem = index.entries.get(`${OT.MOVER}:${prop.index}`);
      if (elem === undefined) {
        warn('propMover.txt', `${who} has no mover entry in mdlDyna.inc, so it has no model, skeleton or motions`);
        return mover;
      }

      const file = modelFileName(elem);
      const animated = elem.modelType === MODELTYPE_ANIMATED_MESH;

      if (!playerBodies.has(prop.index)) {
        if (!/\.o3d$/i.test(file)) {
          warn('mdlDyna.inc', `${who}: model ${file} is an SFX or billboard model, not an .o3d file`);
        } else {
          const key = modelKeyOf(file);
          mover.model = converted(env, key);
          if (mover.model === null) {
            warn(
              'mdlDyna.inc',
              `${who}: model ${key} was not converted ` +
                `(no ${file} in Client/${MODEL_DIR}, rejected, failed, or left out)`,
            );
          }
        }
      }

      // only an animated mesh has a skeleton (the `.chr` CModelMng::LoadModel loads, :240-258) and motions
      if (!animated) return mover;

      const skeletonKey = `skeletons/${webName(stem(file))}.glb`;
      mover.skeleton = converted(env, skeletonKey);
      if (mover.skeleton === null) {
        warn(
          'mdlDyna.inc',
          `${who}: skeleton ${skeletonKey} was not converted (no ${stem(file)}.chr in Client/${MODEL_DIR}, or failed)`,
        );
      }

      // the listed ids, the last name of a repeated id winning (makeMotionName reads the list the same way)
      const missing: string[] = [];
      const ids = [...new Set(elem.motions.map((listed) => listed.id))].sort((a, b) => a - b);
      for (const id of ids) {
        const ani = makeMotionName(elem, id, stand);
        const chr = skeletonOfMotion(stem(ani), chrBases);
        // the models stage files a motion under the skeleton its file name starts with (skeletonOfMotion)
        const key = chr === null ? null : converted(env, `motions/${webName(chr)}/${webName(stem(ani))}.glb`);
        if (key !== null) mover.motions[String(id)] = key;
        else missing.push(`${id} (${ani}${chr === null ? ', no skeleton fits its name' : ''})`);
      }
      if (missing.length > 0) {
        const shown = missing.slice(0, 5).join(', ');
        const more = missing.length > 5 ? ` and ${missing.length - 5} more` : '';
        warn('mdlDyna.inc', `${who}: ${plural(missing.length, 'motion')} not converted, left out: ${shown}${more}`);
      }
      return mover;
    });
}

// ---- items -------------------------------------------------------------------------------------------------------

function buildItems(env: Env, read: Reading): WebItemModel[] {
  // a repeated id keeps the last row (CFixedArray::SetAtGrow, as readPropItem notes)
  const props = new Map<number, ItemProp>();
  for (const prop of readPropItem(read.text('propItem.txt'), env.defines, env.strings, 'propItem.txt')) {
    props.set(prop.id, prop);
  }
  const index = env.models();
  read.bytes += index.bytes;

  const items: WebItemModel[] = [];
  const elems = [...index.entries.values()].filter((elem) => elem.type === OT.ITEM && elem.part !== '');
  for (const elem of elems.sort((a, b) => a.id - b.id)) {
    const prop = props.get(elem.id);
    if (prop === undefined) {
      env.report.warn(
        KIND,
        'mdlDyna.inc',
        `item ${elem.id} ("${elem.name}", part ${elem.part}) has no row in propItem.txt, ` +
          'so its body slot is unknown and it is left out',
      );
      continue;
    }

    const keys = {} as Record<Sex, string | null>;
    const unconverted = new Map<string, Sex[]>(); // key -> the sexes that need it
    for (const sex of ['male', 'female'] as const) {
      const key = modelKeyOf(makePartsName(PARTS_ROOT, elem.part, sex));
      keys[sex] = converted(env, key);
      if (keys[sex] === null) unconverted.set(key, [...(unconverted.get(key) ?? []), sex]);
    }
    for (const [key, sexes] of unconverted) {
      env.report.warn(
        KIND,
        'mdlDyna.inc',
        `item ${elem.id} ("${prop.name}"): part model ${key} was not converted, ` +
          `so it shows nothing for ${sexes.join(' and ')}`,
      );
    }
    items.push({
      id: elem.id,
      part: prop.parts,
      exclusive: prop.exclusive,
      baseIgnore: prop.baseIgnore,
      male: keys.male,
      female: keys.female,
    });
  }
  return items;
}

// ---- NPCs, name colours, honour titles, worlds -------------------------------------------------------------------

function buildNpcs(env: Env, read: Reading): WebNpc[] {
  // CProject::LoadCharacter keys the map by the lower-cased key and SetAt replaces: the later character wins whole
  const byKey = new Map<string, WebNpc>();
  for (const file of CHARACTER_FILES) {
    for (const character of readCharacterInc(read.text(file), env.defines, env.strings, file)) {
      byKey.set(character.key.toLowerCase(), { key: character.key, name: character.name });
    }
  }
  return [...byKey.values()];
}

function buildNameColors(env: Env, read: Reading): WebNameColors {
  return readPkSetting(read.text('PKSetting.inc'), env.defines, 'PKSetting.inc');
}

function buildHonorTitles(env: Env, read: Reading): WebHonorTitles {
  const titles = readHonorTitles(read.text('honorList.txt'), env.defines, env.strings, 'honorList.txt');
  return Object.fromEntries([...titles].sort((a, b) => a[0] - b[0]).map(([id, title]) => [String(id), title]));
}

function buildWorlds(env: Env, read: Reading): WebWorlds {
  // CWorldMng::LoadScript stores each world with CFixedArray::SetAtGrow (worldmng.cpp:359), which overwrites the slot of
  // an id it has already read: the later world wins whole
  const fileNames = new Map<number, string>();
  for (const world of readWorldInc(read.text('World.inc'), env.defines, 'World.inc')) {
    fileNames.set(world.id, world.fileName);
  }
  // A slot with no file name is not a valid WORLD (worldmng.h:13 IsValid), so Neuz cannot open it. Any other is opened
  // from the folder World/<m_szFileName> (CWorldMng::Open, worldmng.cpp:274; the case of the name does not matter to the
  // file system), and the worlds stage writes that folder as worlds/<webName(folder)>/ (convertWorld.ts), so webName of
  // the file name is its web name.
  const valid = [...fileNames].filter(([, fileName]) => fileName !== '');
  return Object.fromEntries(valid.sort((a, b) => a[0] - b[0]).map(([id, fileName]) => [String(id), webName(fileName)]));
}

// ---- the stage ---------------------------------------------------------------------------------------------------

export const gameDataStage: Stage = {
  name: 'data',
  async run(ctx: StageContext) {
    if (!matchesOnly('data', ctx.only)) return;

    const { packs } = ctx.client;
    let modelIndex: ModelIndex | Error | undefined;
    const env: Env = {
      client: ctx.client,
      writer: ctx.writer,
      report: ctx.report,
      defines: loadDefines(packs),
      strings: loadStrings(packs),
      models() {
        // read once, on first use; a failure is kept and thrown to every catalog that needs the index
        if (modelIndex === undefined) {
          try {
            const entries = new Map<string, ModelElem>();
            let bytes = 0;
            for (const name of MODEL_INDEXES) {
              const raw = packs.read(name);
              bytes += raw.length;
              for (const elem of readModelIndex(decodeScript(raw), env.defines, name)) {
                entries.set(`${elem.type}:${elem.id}`, elem);
              }
            }
            modelIndex = { entries, bytes };
          } catch (error) {
            modelIndex = error instanceof Error ? error : new Error(String(error));
          }
        }
        if (modelIndex instanceof Error) throw modelIndex;
        return modelIndex;
      },
    };

    const catalogs: { key: string; source: string; build: (read: Reading) => unknown }[] = [
      { key: GAME_DATA_KEYS.movers, source: 'propMover.txt', build: (read) => buildMovers(env, read) },
      { key: GAME_DATA_KEYS.items, source: 'propItem.txt', build: (read) => buildItems(env, read) },
      { key: GAME_DATA_KEYS.npcs, source: 'character.inc', build: (read) => buildNpcs(env, read) },
      { key: GAME_DATA_KEYS.nameColors, source: 'PKSetting.inc', build: (read) => buildNameColors(env, read) },
      { key: GAME_DATA_KEYS.honorTitles, source: 'honorList.txt', build: (read) => buildHonorTitles(env, read) },
      { key: GAME_DATA_KEYS.worlds, source: 'World.inc', build: (read) => buildWorlds(env, read) },
    ];
    for (const { key, source, build } of catalogs) {
      try {
        const read = new Reading(ctx.client);
        const bytes = new TextEncoder().encode(JSON.stringify(build(read)));
        await ctx.writer.write(key, bytes, source);
        ctx.report.ok(KIND, source, read.bytes, bytes.length);
      } catch (error) {
        // a FormatError names the file it came from (the model index, say); anything else is about the catalog
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : source, error);
      }
    }
  },
};
