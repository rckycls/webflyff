// The `data` stage: the JSON catalogs the browser reads to dress and name what the world draws, built from the client's
// resource packs with the rules of the C++ loaders (the readers of @flyffweb/formats):
//
//   data/movers.json       every mover of propMover.txt, with the converted model, skeleton and motions (WebMover[])
//   data/items.json        every item that shows a part model on the body, per sex (WebItemModel[])
//   data/npcs.json         every character of character.inc and its two sister files (WebNpc[])
//   data/nameColors.json   the three player name colours of PKSetting.inc (WebNameColors)
//   data/honorTitles.json  honour id to title text of honorList.txt (WebHonorTitles)
//   data/worlds.json       world id to the web folder name of its world, from World.inc (WebWorlds)
//   data/itemProps.json    every item of propItem.txt with the columns the fight reads, its held model and icon (WebItemProp[])
//   data/jobs.json         every job of propJob.inc, with its name of etc.inc's job block (WebJob[])
//   data/exp.json          the character EXP table of ExpTable.inc, the 64-bit columns as text (WebExpRow[])
//   data/texts.json        every client text of textClient.inc, by TID name (WebTexts)
//   data/effectsIndex.json XI id to the effect file and scale of its OT_SFX entry in mdlDyna.inc (WebEffectsIndex)
//   data/skills.json       every job skill of propSkill.txt with its levels of propSkillAdd.csv (WebSkill[], skillsCatalog.ts)
//   data/worldNoFly.json   (optional, Piece 7 M5) the ids of the worlds whose .wld says fly 0 (number[])
//   data/pets.json         (optional, 2026-11-09) the raised pets' table of pet.inc (WebPets)
//
// It runs after the models stage, and after the effects and UI stages whose files the effects index and the item icons
// name (`effects/<web name>.json`, `ui/item/<web name>.png`, the keys of output/keys.ts; this stage does not check that
// they exist). A skill's icon (`ui/<web name>.png`) is named only when Client/Icon has the picture.
//
// A catalog names a model, skeleton or motion by its logical key, the way the models stage writes it (`webName` of the
// real file's base name), and only when `writer.pathOf(key)` says the file was converted (in this run, or listed in the
// index.json an earlier run left); else the entry is null, or left out of `motions`, with a warning. Each catalog is
// built on its own: one that cannot be read is reported as a failure and the others are still written.
//
// `--only` filters world folders and model/texture base names; this stage runs when there is no filter or when the
// glob matches the name `data` (so `--only data` runs just this stage, the others finding nothing named `data`).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUDIO_KEY,
  FormatError,
  GAME_DATA_KEYS,
  ITEM_ETC_KEY,
  OT,
  PARTY_KEY,
  PETS_KEY,
  QUESTS_KEY,
  QUEST_FILES,
  WORLD_MAP_KEY,
  WORLD_NO_FLY_KEY,
  decodeScript,
  loadDefines,
  loadStrings,
  modelFileName,
  readCharacterInc,
  readEtcJobs,
  readExpTable,
  readHonorTitles,
  readPkSetting,
  readPetInc,
  readAccessories,
  readPropItem,
  readPropItemEtc,
  readPropJob,
  readPropMover,
  readPropQuest,
  readTextClient,
  readWorldInc,
  readWld,
  webName,
} from '@flyffweb/formats';
import type {
  ItemProp,
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
  WebQuest,
  WebTexts,
  WebWorlds,
} from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import { SOUND_INC, effectSoundParts } from '../audio/audioSources';
import { skeletonOfMotion } from '../models/skeletonFor';
import type { AssetWriter } from '../output/AssetWriter';
import { charPictureKeyOf, effectKeyOf, iconKeyOf, itemIconKeyOf, modelKeyOf, stem } from '../output/keys';
import type { Report } from '../output/Report';
import type { Stage, StageContext } from '../run';
import { matchesOnly, plural } from '../util';
import { readModelIndexes } from './modelIndexes';
import type { ModelIndex } from './modelIndexes';
import { buildAudio } from './audioCatalog';
import { buildSkills } from './skillsCatalog';
import { TROUPE_SKILL_FILE, buildParty } from './partyCatalog';
import { WORLD_MAP_CNT, buildWorldMap } from './worldMapCatalog';

const KIND = 'data';
const MODEL_DIR = 'Model';

/** MODELTYPE_ANIMATED_MESH (Source/_Common/Model.h:12): a model with a skeleton (`<model>.chr`) and motions. */
const MODELTYPE_ANIMATED_MESH = 2;
/** MODELTYPE_SFX (Source/_Common/Model.h:14): an effect, the `.sfx` script of the name. */
const MODELTYPE_SFX = 4;

/** CModelMng's g_szRoot (ModelMng.cpp:5) for OT_MOVER: the start of a mover's model, skeleton and motion files. */
const MOVER_ROOT = 'mvr';
/** The root MakePartsName is given for a worn part (MoverEquip.cpp:365, `_T( "part" )`). */
const PARTS_ROOT = 'part';

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

/** A catalog being built: reads pack files and counts the bytes. */
/** The sets and the socket cards (`CProject::LoadPiercingAvail`, Project.cpp:4137). */
const ITEM_ETC_FILE = 'propItemEtc.inc';
/** The accessories' refine stats (`CAccessoryProperty::LoadScript`, accessory.cpp:39). */
const ACCESSORY_FILE = 'accessory.inc';
/** The raised pets' table (`CPetProperty::LoadScript`, pet.cpp:124; CProject::OpenProject, Project.cpp:614). */
const PET_FILE = 'pet.inc';

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
        flying: prop.flying,
        level: prop.level,
        addHp: prop.addHp,
        expValue: prop.expValue,
        rank: prop.rank,
        belligerence: prop.belligerence,
        killable: prop.killable,
        hideLevel: prop.hideLevel,
        element: prop.element,
        atk1: prop.atk1,
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

      // 2026-11-09: the extra texture set the mover draws with (`m_nTextureEx`, MoverRender.cpp:388-391)
      const textureEx = elem.extra[6] ?? 0;
      if (textureEx > 0) mover.textureEx = textureEx;

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

/** The rows of propItem.txt by id; a repeated id keeps the last row (CFixedArray::SetAtGrow, as readPropItem notes). */
function readItemRows(env: Env, read: Reading): Map<number, ItemProp> {
  const props = new Map<number, ItemProp>();
  for (const prop of readPropItem(read.text('propItem.txt'), env.defines, env.strings, 'propItem.txt')) {
    props.set(prop.id, prop);
  }
  return props;
}

function buildItems(env: Env, read: Reading): WebItemModel[] {
  const props = readItemRows(env, read);
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

// ---- item props, jobs, EXP, texts, effects -----------------------------------------------------------------------

/**
 * Every item of propItem.txt, with the columns the fight reads. `model` is the held model, which Neuz loads from the
 * item's OT_ITEM entry as `item_<name>.o3d` (CModelMng::MakeModelName, ModelMng.cpp:63). An entry with a part is worn
 * and not held, and buildItems has its part models. `icon` names the file the UI stage writes from Client/Item.
 */
function buildItemProps(env: Env, read: Reading): WebItemProp[] {
  const props = readItemRows(env, read);
  const index = env.models();
  read.bytes += index.bytes;

  const noModel: string[] = []; // held items whose model was not converted
  const itemProps = [...props.values()]
    .sort((a, b) => a.id - b.id)
    .map((prop): WebItemProp => {
      let model: string | null = null;
      const elem = index.entries.get(`${OT.ITEM}:${prop.id}`);
      // GetModelElem falls back to II_ARM_M_VAG_HELMET02, whose ground model is the suit box.
      const dropElem = elem ?? index.entries.get(`${OT.ITEM}:500`);
      const dropFile = dropElem === undefined ? '' : modelFileName(dropElem);
      const dropModel = /\.o3d$/i.test(dropFile) ? converted(env, modelKeyOf(dropFile)) : null;
      if (elem !== undefined && elem.part === '') {
        const file = modelFileName(elem);
        if (/\.o3d$/i.test(file)) {
          const key = modelKeyOf(file);
          model = converted(env, key);
          if (model === null) noModel.push(`${prop.id} "${prop.name}" (${key})`);
        }
      }
      return {
        id: prop.id,
        name: prop.name,
        ...(prop.command ? { description: prop.command } : {}),
        ...(prop.cost !== undefined ? { cost: prop.cost } : {}),
        packMax: prop.packMax,
        kind1: prop.kind1,
        kind2: prop.kind2,
        kind3: prop.kind3,
        handed: prop.handed,
        part: prop.parts,
        abilityMin: prop.abilityMin,
        abilityMax: prop.abilityMax,
        weaponType: prop.weaponType,
        attackSpeed: prop.attackSpeed,
        attackRange: prop.attackRange,
        destParams: [...prop.destParams],
        adjParams: [...prop.adjParams],
        sfxHit: prop.sfxObj3,
        sfxMissile: prop.sfxObj2,
        linkKindBullet: prop.linkKindBullet,
        // Piece 7 M3: the cast, and its ready effect (made at STATEMODE ON only, so kept only with a cast)
        ...(prop.skillReadyType !== undefined
          ? { castMs: prop.skillReadyType, ...(prop.sfxObj > 0 ? { sfxReady: prop.sfxObj } : {}) }
          : {}),
        // Piece 7 M5: a ride's flight columns
        ...(prop.flight !== undefined ? { flight: { ...prop.flight } } : {}),
        model,
        dropModel,
        ...(prop.reflect ? { reflect: prop.reflect } : {}),
        icon: prop.icon === '' ? null : itemIconKeyOf(prop.icon),
        // 2026-11-05: the tooltip's columns, each only when the row gives it
        ...(prop.itemJob !== -1 ? { job: prop.itemJob } : {}),
        ...(prop.itemSex !== -1 ? { sex: prop.itemSex } : {}),
        ...(prop.endurance !== -1 ? { endurance: prop.endurance } : {}),
        ...(prop.flag > 0 ? { flag: prop.flag } : {}),
        ...(prop.itemLevel !== -1 ? { itemLevel: prop.itemLevel } : {}),
        ...(prop.limitLevel !== -1 ? { limitLevel: prop.limitLevel } : {}),
        ...(prop.circleTime !== -1 ? { circleTime: prop.circleTime } : {}),
        // 2026-11-05, the premium items: the cool-down (`dwSkillReady`, CCooltimeMgr::GetGroup takes > 0), the buff's
        // time and how the item finds its target (EXT_ITEM 21 needs an item: Neuz's upgrade cursor)
        ...(prop.skillReady > 0 ? { cooldownMs: prop.skillReady } : {}),
        ...(prop.skillTime !== -1 ? { skillTime: prop.skillTime } : {}),
        ...(prop.exeTarget !== -1 ? { exeTarget: prop.exeTarget } : {}),
        ...(prop.referStat1 !== -1 ? { referStat1: prop.referStat1 } : {}),
        // PutBaseResist's order (WndManager.cpp:5641-5674): electricity, fire, water, wind, earth; the file's is
        // electricity, fire, wind, water, earth
        ...(prop.resists.some((value) => value !== 0)
          ? { resists: [prop.resists[0]!, prop.resists[1]!, prop.resists[3]!, prop.resists[2]!, prop.resists[4]!] }
          : {}),
      };
    });

  if (noModel.length > 0) {
    const shown = noModel.slice(0, 5).join(', ');
    const more = noModel.length > 5 ? ` and ${noModel.length - 5} more` : '';
    env.report.warn(
      KIND,
      'mdlDyna.inc',
      `${plural(noModel.length, 'held item')} (an OT_ITEM entry with no part) ` +
        `${noModel.length === 1 ? 'has' : 'have'} no converted model, left null: ${shown}${more}`,
    );
  }
  return itemProps;
}

/**
 * Every job of propJob.inc (`m_aPropJob`, by `JOB_*`), with `title`, the job's name of etc.inc's `job` block
 * (`m_aJob[ id ].szName`, CProject::LoadEtc, Project.cpp:903-920), which `CMover::GetJobString` gives the Character
 * window (MoverParam.cpp:354-359). A job that etc.inc names nothing for has '', with one warning that lists them.
 */
function buildJobs(env: Env, read: Reading): WebJob[] {
  const props = readPropJob(read.text('propJob.inc'), 'propJob.inc', env.defines);
  const names = readEtcJobs(read.text('etc.inc'), env.defines, env.strings, 'etc.inc');
  const unnamed = props.flatMap((prop, job) => (names.has(job) ? [] : [prop.name]));
  if (unnamed.length > 0) {
    const has = unnamed.length === 1 ? 'has' : 'have';
    env.report.warn(
      KIND,
      'etc.inc',
      `${plural(unnamed.length, 'job')} of propJob.inc ${has} no name in etc.inc's job block, left '': ${unnamed.join(', ')}`,
    );
  }
  return props.map((prop, job) => ({ ...prop, title: names.get(job)?.name ?? '' }));
}

/** EXPINTEGER is 64 bits and one value passes 2^53, so JSON carries the columns as decimal text. */
function buildExp(_env: Env, read: Reading): WebExpRow[] {
  return readExpTable(read.text('ExpTable.inc'), 'ExpTable.inc').map((row) => ({
    exp1: row.exp1.toString(),
    exp2: row.exp2.toString(),
    lpPoint: row.lpPoint,
    limitExp: row.limitExp.toString(),
  }));
}

/**
 * The texts by `TID_*` name, each with the number `defineText.h` gives the name (`textId`): CProject::LoadText
 * (ProjectCmn.cpp:543) reads the name as that number and keeps the text under it, and the server names a text by it
 * (DEFINEDTEXT). A name that no header numbers keeps its text without one.
 */
function buildTexts(env: Env, read: Reading): WebTexts {
  const texts = readTextClient(read.text('textClient.inc'), env.strings, 'textClient.inc');
  return Object.fromEntries([...texts].map(([id, { text, color }]) => {
    const textId = env.defines.get(id);
    return [id, textId === undefined ? { text, color } : { text, color, textId }];
  }));
}

/**
 * The effect each `XI_*` id stands for: the OT_SFX entries of mdlDyna.inc that name a `.sfx` (MODELTYPE_SFX; a
 * billboard entry is a texture). The file is the name CModelMng::MakeModelName makes (ModelMng.cpp:63: `sfx_` unless
 * the name has an underscore), and the scale is the entry's `fScale` (ModelMng.cpp:397, a C float): CSfx::SetSfx
 * (SfxObj.cpp:77, which CreateSfx calls) loads the entry with SetTypeIndex(..., TRUE), and CObj::ResetScale (Obj.cpp:390)
 * scales the effect by it.
 */
function buildEffectsIndex(env: Env, read: Reading): WebEffectsIndex {
  const index = env.models();
  read.bytes += index.bytes;
  const effects = [...index.entries.values()]
    .filter((elem) => elem.type === OT.SFX && elem.modelType === MODELTYPE_SFX)
    .sort((a, b) => a.id - b.id);
  return Object.fromEntries(
    effects.map((elem) => [
      String(elem.id),
      { effect: effectKeyOf(modelFileName(elem)), scale: Math.fround(elem.extra[3]!) },
    ]),
  );
}

// ---- NPCs, name colours, honour titles, worlds -------------------------------------------------------------------

function buildNpcs(env: Env, read: Reading): WebNpc[] {
  // CProject::LoadCharacter keys the map by the lower-cased key and SetAt replaces: the later character wins whole
  const byKey = new Map<string, WebNpc>();
  for (const file of CHARACTER_FILES) {
    for (const character of readCharacterInc(read.text(file), env.defines, env.strings, file)) {
      // the picture's file name becomes the key the UI stage writes it under (Client/Char)
      if (character.image !== undefined) character.image = charPictureKeyOf(character.image);
      byKey.set(character.key.toLowerCase(), character);
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

/**
 * Piece 7 M5: the ids of the worlds of World.inc whose `.wld` (`World/<file name>/<file name>.wld`, where
 * `CWorld::OpenWorld` reads it) says `fly 0`, in id order; null when no world's `.wld` is in the client. A `.wld` that
 * cannot be read is a warning, and that world is taken to allow flight, the `.wld`'s default.
 */
function buildWorldNoFly(env: Env, read: Reading): number[] | null {
  const fileNames = new Map<number, string>();
  for (const world of readWorldInc(read.text('World.inc'), env.defines, 'World.inc')) fileNames.set(world.id, world.fileName);
  const noFly: number[] = [];
  let found = 0;
  for (const [id, fileName] of [...fileNames].sort((a, b) => a[0] - b[0])) {
    if (fileName === '') continue;
    const file = env.client.find(`World/${fileName}`, `${fileName}.wld`);
    if (file === null) continue;
    found += 1;
    try {
      const bytes = new Uint8Array(readFileSync(file));
      read.bytes += bytes.length;
      if (!readWld(decodeScript(bytes), file).fly) noFly.push(id);
    } catch (error) {
      env.report.warn(KIND, file, `not read, so world ${id} allows flight: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return found === 0 ? null : noFly;
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
            modelIndex = readModelIndexes(packs, env.defines);
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
      { key: GAME_DATA_KEYS.itemProps, source: 'propItem.txt', build: (read) => buildItemProps(env, read) },
      { key: GAME_DATA_KEYS.jobs, source: 'propJob.inc', build: (read) => buildJobs(env, read) },
      { key: GAME_DATA_KEYS.exp, source: 'ExpTable.inc', build: (read) => buildExp(env, read) },
      { key: GAME_DATA_KEYS.texts, source: 'textClient.inc', build: (read) => buildTexts(env, read) },
      { key: GAME_DATA_KEYS.effectsIndex, source: 'mdlDyna.inc', build: (read) => buildEffectsIndex(env, read) },
      {
        key: GAME_DATA_KEYS.skills,
        source: 'propSkill.txt',
        build: (read) =>
          buildSkills(
            {
              client: env.client,
              defines: env.defines,
              strings: env.strings,
              warn: (source, message) => env.report.warn(KIND, source, message),
            },
            read,
          ),
      },
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

    // The worlds without flight (Piece 7 M5), optional: written when some world's .wld is in the client. A World.inc that
    // cannot be read has already failed the worlds catalog, so it is not reported again here.
    try {
      const read = new Reading(ctx.client);
      let noFly: number[] | null = null;
      try {
        noFly = buildWorldNoFly(env, read);
      } catch (error) {
        if (!(error instanceof FormatError && error.file === 'World.inc')) throw error;
      }
      if (noFly !== null) {
        const bytes = new TextEncoder().encode(JSON.stringify(noFly));
        await ctx.writer.write(WORLD_NO_FLY_KEY, bytes, 'World.inc');
        ctx.report.ok(KIND, 'World.inc', read.bytes, bytes.length);
      }
    } catch (error) {
      ctx.report.fail(KIND, error instanceof FormatError ? error.file : 'World.inc', error);
    }

    // The world map (Piece 6 M1), optional: without the continent file there is no catalog, and the client still logs in
    // (WORLD_MAP_KEY is not one of GAME_DATA_KEYS).
    try {
      let read = 0;
      const map = buildWorldMap({
        client: ctx.client,
        defines: env.defines,
        warn: (source, message) => ctx.report.warn(KIND, source, message),
        counted: (bytes) => {
          read += bytes;
        },
      });
      if (map !== null) {
        const bytes = new TextEncoder().encode(JSON.stringify(map));
        await ctx.writer.write(WORLD_MAP_KEY, bytes, WORLD_MAP_CNT);
        ctx.report.ok(KIND, WORLD_MAP_CNT, read, bytes.length);
      }
    } catch (error) {
      ctx.report.fail(KIND, error instanceof FormatError ? error.file : WORLD_MAP_CNT, error);
    }

    // The quest catalog (Piece 7 M1), optional in the same way: the quest files of Masquerade.prj:116-123 that the packs
    // hold; without any the client lists quests by id (QUESTS_KEY is not one of GAME_DATA_KEYS). A later file's entry
    // replaces an earlier one with its id, as m_aPropQuest.SetAtGrow does. A quest that cannot be read is a warning and is
    // left out, and a file that cannot be read fails alone (the spec's §4): the rest is still written.
    const questFiles = QUEST_FILES.filter((name) => ctx.client.packs.has(name));
    if (questFiles.length > 0) {
      try {
        const read = new Reading(ctx.client);
        const quests = new Map<number, WebQuest>();
        for (const file of questFiles) {
          try {
            const skip = (error: FormatError): void => ctx.report.warn(KIND, file, `quest left out: ${error.message}`);
            for (const quest of readPropQuest(read.text(file), env.defines, env.strings, file, skip)) quests.set(quest.id, quest);
          } catch (error) {
            ctx.report.fail(KIND, error instanceof FormatError ? error.file : file, error);
          }
        }
        if (quests.size > 0) {
          const bytes = new TextEncoder().encode(JSON.stringify([...quests.values()]));
          await ctx.writer.write(QUESTS_KEY, bytes, QUEST_FILES[0]);
          ctx.report.ok(KIND, QUEST_FILES[0], read.bytes, bytes.length);
        }
      } catch (error) {
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : QUEST_FILES[0], error);
      }
    }

    // The sets and the socket cards (2026-11-05), optional in the same way: without propItemEtc.inc the item tooltip has no
    // set and socket lines (ITEM_ETC_KEY is not one of GAME_DATA_KEYS). A file that cannot be read fails it alone.
    if (ctx.client.packs.has(ITEM_ETC_FILE)) {
      try {
        const read = new Reading(ctx.client);
        const etc = {
          ...readPropItemEtc(read.text(ITEM_ETC_FILE), env.defines, env.strings, ITEM_ETC_FILE),
          // the accessories' refine stats (CAccessoryProperty), when the packs hold accessory.inc
          ...(ctx.client.packs.has(ACCESSORY_FILE)
            ? { accessories: readAccessories(read.text(ACCESSORY_FILE), env.defines, ACCESSORY_FILE) }
            : {}),
        };
        const bytes = new TextEncoder().encode(JSON.stringify(etc));
        await ctx.writer.write(ITEM_ETC_KEY, bytes, ITEM_ETC_FILE);
        ctx.report.ok(KIND, ITEM_ETC_FILE, read.bytes, bytes.length);
      } catch (error) {
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : ITEM_ETC_FILE, error);
      }
    }

    // The raised pets' table (2026-11-09), optional in the same way: without pet.inc there is none (PETS_KEY is not one of
    // GAME_DATA_KEYS). A file that cannot be read fails it alone.
    if (ctx.client.packs.has(PET_FILE)) {
      try {
        const read = new Reading(ctx.client);
        const bytes = new TextEncoder().encode(JSON.stringify(readPetInc(read.text(PET_FILE), env.defines, PET_FILE)));
        await ctx.writer.write(PETS_KEY, bytes, PET_FILE);
        ctx.report.ok(KIND, PET_FILE, read.bytes, bytes.length);
      } catch (error) {
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : PET_FILE, error);
      }
    }

    // The party catalog (Piece 7 M4), optional in the same way: without propTroupeSkill.txt there is none, and the client
    // offers no party skills (PARTY_KEY is not one of GAME_DATA_KEYS). A file that cannot be read fails it alone.
    if (ctx.client.packs.has(TROUPE_SKILL_FILE)) {
      try {
        const read = new Reading(ctx.client);
        const party = buildParty({
          defines: env.defines, strings: env.strings,
          iconKey: (file) => (ctx.client.find('Icon', file) === null ? null : iconKeyOf(file)),
          warn: (source, message) => ctx.report.warn(KIND, source, message),
        }, read);
        const bytes = new TextEncoder().encode(JSON.stringify(party));
        await ctx.writer.write(PARTY_KEY, bytes, TROUPE_SKILL_FILE);
        ctx.report.ok(KIND, TROUPE_SKILL_FILE, read.bytes, bytes.length);
      } catch (error) {
        ctx.report.fail(KIND, error instanceof FormatError ? error.file : TROUPE_SKILL_FILE, error);
      }
    }

    // The audio catalog (Piece 6 M2), optional in the same way: without sound.inc there is none, and the client is
    // silent (AUDIO_KEY is not one of GAME_DATA_KEYS). It names only the files the audio stage wrote.
    if (ctx.client.find(SOUND_INC.dir, SOUND_INC.name) === null) {
      ctx.report.warn(KIND, 'Client/sound.inc', 'not in the client folder, so there is no audio catalog');
    } else try {
      const read = new Reading(ctx.client);
      const audio = buildAudio({
        client: ctx.client,
        defines: env.defines,
        effectParts: effectSoundParts(env.models()),
        worlds: readWorldInc(read.text('World.inc'), env.defines, 'World.inc'),
        items: readPropItem(read.text('propItem.txt'), env.defines, env.strings, 'propItem.txt'),
        skills: readPropItem(read.text('propSkill.txt'), env.defines, env.strings, 'propSkill.txt'),
        movers: readPropMover(read.text('propMover.txt'), env.defines, env.strings, 'propMover.txt'),
        characters: CHARACTER_FILES.flatMap((file) => readCharacterInc(read.text(file), env.defines, env.strings, file)),
        has: (key) => ctx.writer.pathOf(key) !== undefined,
        warn: (source, message) => ctx.report.warn(KIND, source, message),
        counted: (bytes) => {
          read.bytes += bytes;
        },
      });
      if (audio !== null) {
        const bytes = new TextEncoder().encode(JSON.stringify(audio));
        await ctx.writer.write(AUDIO_KEY, bytes, 'Client/sound.inc');
        ctx.report.ok(KIND, 'Client/sound.inc', read.bytes, bytes.length);
      }
    } catch (error) {
      ctx.report.fail(KIND, error instanceof FormatError ? error.file : 'Client/sound.inc', error);
    }
  },
};
